import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, ne, gt, isNull } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import {
  CreateCoopHouseholdBody,
  CreateCoopInvitationResponse,
  CreateCoopShareNoteBody,
  CreateCoopShareNoteResponse,
  DeliverNextCoopShareNoteResponse,
  GetCoopHouseholdResponse,
  JoinCoopHouseholdBody,
  JoinCoopHouseholdResponse,
  RecordCoopCareStatInteractionBody,
  RecordCoopCareStatInteractionResponse,
  UpdateCoopShareNoteBody,
  UpdateCoopShareNoteParams,
  UpdateCoopShareNoteResponse,
  UpdateCoopStateBody,
  UpdateCoopStateResponse,
} from "@workspace/api-zod";
import {
  coopHouseholdsTable,
  coopInvitationsTable,
  coopMembersTable,
  coopShareNotesTable,
  db,
  type CoopCareStatCategory,
  type CoopCareStats,
  type CoopSharedState,
} from "@workspace/db";
import { Router, type IRouter, type Request, type Response } from "express";
import { createSafeShareSummary } from "../lib/coop-sharing";
import { bindHouseholdCharacter, lockCharacterAccount } from "../lib/pet-character";

const router: IRouter = Router();
const inviteLifetimeMs = 24 * 60 * 60 * 1000;
const careStatDecayMs = 6 * 60 * 60 * 1000;
const summaryWindows = new Map<string, { count: number; until: number }>();

function userIdFromRequest(req: Request): string | undefined {
  return getAuth(req).userId ?? undefined;
}

function requireUser(req: Request, res: Response): string | undefined {
  const userId = userIdFromRequest(req);
  if (!userId) {
    res.status(401).json({ error: "请先登录账号。" });
    return undefined;
  }
  return userId;
}

async function readHousehold(userId: string) {
  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) return null;

  const [household] = await db
    .select()
    .from(coopHouseholdsTable)
    .where(eq(coopHouseholdsTable.id, member.householdId))
    .limit(1);
  if (!household) return null;

  const members = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.householdId, household.id));
  const queued = await db
    .select()
    .from(coopShareNotesTable)
    .where(
      and(
        eq(coopShareNotesTable.householdId, household.id),
        eq(coopShareNotesTable.senderUserId, userId),
        eq(coopShareNotesTable.status, "queued"),
      ),
    )
    .orderBy(desc(coopShareNotesTable.createdAt))
    .limit(30);
  const inbox = await db
    .select()
    .from(coopShareNotesTable)
    .where(
      and(
        eq(coopShareNotesTable.householdId, household.id),
        ne(coopShareNotesTable.senderUserId, userId),
        eq(coopShareNotesTable.status, "delivered"),
      ),
    )
    .orderBy(desc(coopShareNotesTable.deliveredAt))
    .limit(30);

  return GetCoopHouseholdResponse.parse({
    householdId: household.id,
    playerNumber: member.playerNumber,
    memberCount: members.length,
    sharedState: household.sharedState,
    queuedNotes: queued.map((note) => serializeNote(note)),
    inbox: inbox.map((note) => serializeNote(note)),
  });
}

function serializeNote(note: typeof coopShareNotesTable.$inferSelect) {
  return {
    id: note.id,
    category: note.category,
    title: note.title,
    message: note.message,
    excluded: note.excluded,
    createdAt: note.createdAt.getTime(),
    automatic: note.automatic,
  };
}

function mergeSharedState(
  current: CoopSharedState,
  incoming: CoopSharedState,
): CoopSharedState {
  const gifts = new Map(current.gifts.map((gift) => [gift.id, gift]));
  for (const gift of incoming.gifts) {
    gifts.set(gift.id, { ...gifts.get(gift.id), ...gift });
  }
  const careStats = mergeCareStats(current.careStats, incoming.careStats);
  return {
    gifts: [...gifts.values()].slice(-300),
    furnitureLayout: {
      ...current.furnitureLayout,
      ...incoming.furnitureLayout,
    },
    placedProps: {
      ...current.placedProps,
      ...incoming.placedProps,
    },
    ...(careStats ? { careStats } : {}),
  };
}

function mergeCareStats(
  current: CoopCareStats | undefined,
  incoming: CoopCareStats | undefined,
): CoopCareStats | undefined {
  if (!current) return incoming;
  if (!incoming) return current;
  if (incoming.revision !== current.revision) {
    return incoming.revision > current.revision ? incoming : current;
  }
  if (incoming.lastInteractionAt !== current.lastInteractionAt) {
    return incoming.lastInteractionAt > current.lastInteractionAt ? incoming : current;
  }
  return incoming.lastDecayAt > current.lastDecayAt ? incoming : current;
}

function initialCareStats(now: number): CoopCareStats {
  return {
    growth: 50,
    health: 50,
    bond: 50,
    lastInteractionAt: now,
    lastDecayAt: now,
    revision: 0,
    lastInteractionCategory: "growth",
    recentInteractionIds: [],
  };
}

function decayCareStats(stats: CoopCareStats, now: number): CoopCareStats {
  const lastInteractionAt = Math.min(stats.lastInteractionAt, now);
  const lastDecayAt = Math.min(stats.lastDecayAt, now);
  const elapsedSteps = Math.floor(Math.max(0, now - lastInteractionAt) / careStatDecayMs);
  const appliedSteps = Math.floor(Math.max(0, lastDecayAt - lastInteractionAt) / careStatDecayMs);
  const steps = Math.max(0, elapsedSteps - appliedSteps);
  if (!steps) {
    if (lastInteractionAt === stats.lastInteractionAt && lastDecayAt === stats.lastDecayAt) return stats;
    return { ...stats, lastInteractionAt, lastDecayAt };
  }
  return {
    ...stats,
    growth: Math.max(0, stats.growth - steps),
    health: Math.max(0, stats.health - steps),
    bond: Math.max(0, stats.bond - steps),
    lastInteractionAt,
    lastDecayAt: Math.min(now, lastDecayAt + steps * careStatDecayMs),
  };
}

function applyCareStatInteraction(
  stats: CoopCareStats,
  category: CoopCareStatCategory,
  interactionId: string,
  occurredAt: number,
  now: number,
): CoopCareStats {
  if (stats.recentInteractionIds.includes(interactionId)) return stats;
  const interactionAt = Math.max(stats.lastInteractionAt, Math.min(occurredAt, now));
  const decayed = decayCareStats(stats, interactionAt);
  return {
    ...decayed,
    growth: Math.min(100, decayed.growth + 1),
    health: category === "health" ? Math.min(100, decayed.health + 1) : decayed.health,
    bond: category === "bond" ? Math.min(100, decayed.bond + 1) : decayed.bond,
    lastInteractionAt: interactionAt,
    lastDecayAt: interactionAt,
    revision: decayed.revision + 1,
    lastInteractionCategory: category,
    recentInteractionIds: [...decayed.recentInteractionIds, interactionId].slice(-128),
  };
}

function hashInvite(code: string) {
  return createHash("sha256").update(code.toUpperCase()).digest("hex");
}

router.get("/coop/household", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.setHeader("Cache-Control", "no-store");
  const household = await readHousehold(userId);
  if (!household) {
    res.status(404).json({ error: "还没有共同培养房间。" });
    return;
  }
  res.json(household);
});

router.post("/coop/household", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = CreateCoopHouseholdBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "房间数据格式不正确。" });
    return;
  }

  try {
    const response = await db.transaction(async (tx) => {
      await lockCharacterAccount(tx, userId);
      const [existing] = await tx
        .select()
        .from(coopMembersTable)
        .where(eq(coopMembersTable.userId, userId))
        .limit(1);
      if (existing) return null;

      const [household] = await tx
        .insert(coopHouseholdsTable)
        .values({
          createdBy: userId,
          sharedState: input.data.sharedState as CoopSharedState,
        })
        .returning();
      await tx.insert(coopMembersTable).values({
        householdId: household.id,
        userId,
        playerNumber: 1,
      });
      await bindHouseholdCharacter(tx, household.id, [userId]);
      return household.id;
    });

    if (!response) {
      res.status(409).json({ error: "这个账号已经加入了一个房间。" });
      return;
    }
    const created = await readHousehold(userId);
    res.status(201).json(GetCoopHouseholdResponse.parse(created));
  } catch (error) {
    req.log.error("Failed to create co-op household");
    res.status(500).json({ error: "房间暂时无法创建，请稍后再试。" });
  }
});

router.post("/coop/invitations", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "请先创建共同培养房间。" });
    return;
  }
  const members = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.householdId, member.householdId));
  if (members.length >= 2) {
    res.status(409).json({ error: "这个房间已经有两位玩家。" });
    return;
  }

  const code = randomBytes(6).toString("hex").toUpperCase();
  const expiresAt = new Date(Date.now() + inviteLifetimeMs);
  await db.insert(coopInvitationsTable).values({
    householdId: member.householdId,
    codeHash: hashInvite(code),
    createdBy: userId,
    expiresAt,
  });
  res.status(201).json(
    CreateCoopInvitationResponse.parse({
      code,
      expiresAt: expiresAt.getTime(),
    }),
  );
});

router.post("/coop/join", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = JoinCoopHouseholdBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "邀请码格式不正确。" });
    return;
  }

  try {
    const joined = await db.transaction(async (tx) => {
      await lockCharacterAccount(tx, userId);
      const [existing] = await tx
        .select()
        .from(coopMembersTable)
        .where(eq(coopMembersTable.userId, userId))
        .limit(1);
      if (existing) return "already-member" as const;

      const now = new Date();
      const [invite] = await tx
        .select()
        .from(coopInvitationsTable)
        .where(
          and(
            eq(coopInvitationsTable.codeHash, hashInvite(input.data.code)),
            isNull(coopInvitationsTable.usedAt),
            gt(coopInvitationsTable.expiresAt, now),
          ),
        )
        .limit(1)
        .for("update");
      if (!invite) return "invalid" as const;

      const [household] = await tx
        .select()
        .from(coopHouseholdsTable)
        .where(eq(coopHouseholdsTable.id, invite.householdId))
        .limit(1)
        .for("update");
      if (!household) return "invalid" as const;

      const members = await tx
        .select()
        .from(coopMembersTable)
        .where(eq(coopMembersTable.householdId, household.id));
      if (members.length >= 2) return "full" as const;

      const character = await bindHouseholdCharacter(tx, household.id, [...members.map(m => m.userId), userId]);
      if (character.conflict) return "character-conflict" as const;

      await tx.insert(coopMembersTable).values({
        householdId: household.id,
        userId,
        playerNumber: 2,
      });
      await tx
        .update(coopInvitationsTable)
        .set({ usedAt: now })
        .where(eq(coopInvitationsTable.id, invite.id));
      return "joined" as const;
    });

    if (joined === "character-conflict") {
      res.status(409).json({ error: "你与这个房间已选定不同伙伴；角色转化液尚未开放，暂时不能合并。邀请码未消耗。" });
      return;
    }
    if (joined === "invalid") {
      res.status(400).json({ error: "邀请码已过期或无效。" });
      return;
    }
    if (joined === "full") {
      res.status(409).json({ error: "这个房间已经有两位玩家。" });
      return;
    }
    if (joined === "already-member") {
      res.status(409).json({ error: "这个账号已经加入了一个房间。" });
      return;
    }
    const household = await readHousehold(userId);
    res.json(JoinCoopHouseholdResponse.parse(household));
  } catch (error) {
    req.log.error("Failed to join co-op household");
    res.status(500).json({ error: "暂时无法加入房间，请稍后再试。" });
  }
});

router.put("/coop/state", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = UpdateCoopStateBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "共同房间数据格式不正确。" });
    return;
  }
  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "还没有共同培养房间。" });
    return;
  }

  const household = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(coopHouseholdsTable)
      .where(eq(coopHouseholdsTable.id, member.householdId))
      .limit(1)
      .for("update");
    if (!current) return undefined;
    const [updated] = await tx
      .update(coopHouseholdsTable)
      .set({
        sharedState: mergeSharedState(
          current.sharedState,
          input.data.sharedState as CoopSharedState,
        ),
      })
      .where(eq(coopHouseholdsTable.id, member.householdId))
      .returning();
    return updated;
  });
  if (!household) {
    res.status(404).json({ error: "共同培养房间已不存在。" });
    return;
  }
  res.json(
    UpdateCoopStateResponse.parse({
      sharedState: household.sharedState,
      updatedAt: household.updatedAt.getTime(),
    }),
  );
});

router.post("/coop/stats/interactions", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const input = RecordCoopCareStatInteractionBody.safeParse(req.body);
  if (!input.success) {
    res.status(400).json({ error: "互动记录格式不正确。" });
    return;
  }
  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "还没有共同培养房间。" });
    return;
  }

  const careStats = await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(coopHouseholdsTable)
      .where(eq(coopHouseholdsTable.id, member.householdId))
      .limit(1)
      .for("update");
    if (!current) return undefined;
    const now = Date.now();
    const stats = current.sharedState.careStats ?? initialCareStats(now);
    const updatedCareStats = applyCareStatInteraction(
      stats,
      input.data.category as CoopCareStatCategory,
      input.data.interactionId,
      input.data.occurredAt,
      now,
    );
    if (updatedCareStats === stats && current.sharedState.careStats) return stats;
    await tx
      .update(coopHouseholdsTable)
      .set({
        sharedState: { ...current.sharedState, careStats: updatedCareStats },
      })
      .where(eq(coopHouseholdsTable.id, member.householdId));
    return updatedCareStats;
  });

  if (!careStats) {
    res.status(404).json({ error: "共同培养房间已不存在。" });
    return;
  }
  res.json(RecordCoopCareStatInteractionResponse.parse({ careStats }));
});

router.post("/coop/share-notes", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  res.setHeader("Cache-Control", "no-store");
  const input = CreateCoopShareNoteBody.safeParse(req.body);
  if (!input.success || !input.data.text.trim()) {
    res.status(400).json({ error: "这段日常目前无法整理成分享内容。" });
    return;
  }

  const now = Date.now();
  for (const [key, window] of summaryWindows) {
    if (window.until <= now) summaryWindows.delete(key);
  }
  const limit = summaryWindows.get(userId) ?? { count: 0, until: now + 60_000 };
  if (limit.count >= 8) {
    res.status(429).json({ error: "小熊猫整理得有点快，等一分钟再试。" });
    return;
  }
  limit.count += 1;
  summaryWindows.set(userId, limit);

  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "先加入共同培养房间，才能分享心情。" });
    return;
  }

  try {
    const summary = await createSafeShareSummary(
      input.data.text,
      member.playerNumber as 1 | 2,
    );
    const [note] = await db
      .insert(coopShareNotesTable)
      .values({
        householdId: member.householdId,
        senderUserId: userId,
        category: summary.category,
        title: summary.title,
        message: summary.message,
        automatic: summary.automatic,
      })
      .returning();
    res.status(201).json(
      CreateCoopShareNoteResponse.parse(serializeNote(note)),
    );
  } catch {
    req.log.warn("Co-op emotion summary unavailable");
    res.status(502).json({ error: "小熊猫暂时没能整理好这份心情。" });
  }
});

router.patch("/coop/share-notes/:id", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const params = UpdateCoopShareNoteParams.safeParse(req.params);
  const input = UpdateCoopShareNoteBody.safeParse(req.body);
  if (!params.success || !input.success) {
    res.status(400).json({ error: "分享设置格式不正确。" });
    return;
  }
  const [note] = await db
    .select()
    .from(coopShareNotesTable)
    .where(
      and(
        eq(coopShareNotesTable.id, params.data.id),
        eq(coopShareNotesTable.senderUserId, userId),
      ),
    )
    .limit(1);
  if (!note || note.status !== "queued") {
    res.status(404).json({ error: "这条待带回的心情已经不存在。" });
    return;
  }
  const [updated] = await db
    .update(coopShareNotesTable)
    .set({ excluded: input.data.excluded })
    .where(eq(coopShareNotesTable.id, note.id))
    .returning();
  res.json(UpdateCoopShareNoteResponse.parse(serializeNote(updated)));
});

router.post("/coop/deliver-next", async (req, res): Promise<void> => {
  const userId = requireUser(req, res);
  if (!userId) return;
  const [member] = await db
    .select()
    .from(coopMembersTable)
    .where(eq(coopMembersTable.userId, userId))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "还没有共同培养房间。" });
    return;
  }

  const note = await db.transaction(async (tx) => {
    const [next] = await tx
      .select()
      .from(coopShareNotesTable)
      .where(
        and(
          eq(coopShareNotesTable.householdId, member.householdId),
          ne(coopShareNotesTable.senderUserId, userId),
          eq(coopShareNotesTable.status, "queued"),
          eq(coopShareNotesTable.excluded, false),
        ),
      )
      .orderBy(coopShareNotesTable.createdAt)
      .limit(1)
      .for("update");
    if (!next) return undefined;
    const [delivered] = await tx
      .update(coopShareNotesTable)
      .set({ status: "delivered", deliveredAt: new Date() })
      .where(eq(coopShareNotesTable.id, next.id))
      .returning();
    return delivered;
  });

  if (!note) {
    res.json(DeliverNextCoopShareNoteResponse.parse({ delivered: false }));
    return;
  }
  res.json(
    DeliverNextCoopShareNoteResponse.parse({
      delivered: true,
      note: serializeNote(note),
    }),
  );
});

export default router;
