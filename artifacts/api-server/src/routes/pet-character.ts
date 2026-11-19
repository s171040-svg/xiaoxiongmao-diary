import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { ChoosePetCharacterBody, GetPetCharacterResponse } from "@workspace/api-zod";
import { db, petCharactersTable, coopMembersTable, coopHouseholdsTable } from "@workspace/db";
import { bindHouseholdCharacter, lockCharacterAccount } from "../lib/pet-character";

const router: IRouter = Router();
router.get("/pet/character", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录账号再选择伙伴。" }); return; }
  const [row] = await db.select().from(petCharactersTable).where(eq(petCharactersTable.userId, userId));
  const [member] = await db.select().from(coopMembersTable).where(eq(coopMembersTable.userId, userId));
  const household = member
    ? (await db.select().from(coopHouseholdsTable).where(eq(coopHouseholdsTable.id, member.householdId)))[0]
    : null;
  const characterId = household?.characterId ?? row?.characterId ?? null;
  res.json(GetPetCharacterResponse.parse({ characterId, locked: !!characterId, shared: !!member }));
});
router.post("/pet/character", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录账号再选择伙伴。" }); return; }
  const input = ChoosePetCharacterBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "请选择小熊猫或小白。" }); return; }
  const result = await db.transaction(async tx => {
    await lockCharacterAccount(tx, userId);
    const [member] = await tx.select().from(coopMembersTable).where(eq(coopMembersTable.userId, userId));
    if (member) {
      const members = await tx.select().from(coopMembersTable).where(eq(coopMembersTable.householdId, member.householdId));
      const bound = await bindHouseholdCharacter(tx, member.householdId, members.map(m => m.userId), input.data.characterId);
      return { ...bound, shared: true };
    }
    await tx.insert(petCharactersTable).values({ userId, characterId: input.data.characterId }).onConflictDoNothing();
    const [row] = await tx.select().from(petCharactersTable).where(eq(petCharactersTable.userId, userId));
    return { conflict: row.characterId !== input.data.characterId, characterId: row.characterId, shared: false };
  });
  if (result.conflict) {
    res.status(409).json({ error: "这个账号或共同照料房间已选定伙伴。更换需要角色转化液，目前尚未开放。" }); return;
  }
  res.json(GetPetCharacterResponse.parse({ characterId: result.characterId, locked: true, shared: result.shared }));
});
export default router;
