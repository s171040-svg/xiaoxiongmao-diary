import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, eq } from "drizzle-orm";
import { db, petSavesTable, coopMembersTable, coopHouseholdsTable } from "@workspace/db";
import { GetPetSaveResponse, UpdatePetSaveBody, UpdatePetSaveResponse } from "@workspace/api-zod";

const router: IRouter = Router();
const petFields = new Set([
  "nextTripAt", "trip", "returnEvent", "spacePoliceLetter", "spacePoliceLetters",
  "recentGiftStories", "pendingGift", "giftDropStartedAt",
]);
router.get("/pet/save", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录邮箱账号。" }); return; }
  let [save] = await db.select().from(petSavesTable).where(eq(petSavesTable.userId, userId));
  let migrated = false;
  if (!save) {
    // Copy, never move/delete or continue synchronizing the former shared room.
    const [member] = await db.select().from(coopMembersTable).where(eq(coopMembersTable.userId, userId));
    const [oldRoom] = member
      ? await db.select().from(coopHouseholdsTable).where(eq(coopHouseholdsTable.id, member.householdId))
      : [];
    if (oldRoom) {
      await db.insert(petSavesTable).values({
        userId, snapshot: { room: oldRoom.sharedState, pet: {} },
      }).onConflictDoNothing();
      [save] = await db.select().from(petSavesTable).where(eq(petSavesTable.userId, userId));
      migrated = true;
    }
  }
  res.json(GetPetSaveResponse.parse({ snapshot: save?.snapshot ?? null, revision: save?.revision ?? 0, migrated }));
});
router.put("/pet/save", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录邮箱账号。" }); return; }
  const input = UpdatePetSaveBody.safeParse(req.body);
  if (!input.success || Object.keys(input.data.snapshot.pet).some(key => !petFields.has(key))) {
    res.status(400).json({ error: "宠物存档格式不正确，不能包含聊天、照片或日记。" }); return;
  }
  const { snapshot, revision } = input.data;
  const updated = revision === 0
    ? await db.insert(petSavesTable).values({ userId, snapshot }).onConflictDoNothing().returning()
    : await db.update(petSavesTable).set({ snapshot, revision: revision + 1, updatedAt: new Date() })
      .where(and(eq(petSavesTable.userId, userId), eq(petSavesTable.revision, revision))).returning();
  if (!updated.length) {
    res.status(409).json({ error: "另一个窗口或设备已有更新存档，已停止覆盖。请重新读取账号存档。" }); return;
  }
  res.json(UpdatePetSaveResponse.parse({ snapshot: updated[0].snapshot, revision: updated[0].revision }));
});
export default router;
