import { Router, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { eq } from "drizzle-orm";
import { ChoosePetCharacterBody, GetPetCharacterResponse } from "@workspace/api-zod";
import { db, petCharactersTable, coopMembersTable, coopHouseholdsTable } from "@workspace/db";
import { lockCharacterAccount } from "../lib/pet-character";

const router: IRouter = Router();
async function preserveAccountCharacter(userId: string) {
  return db.transaction(async tx => {
    await lockCharacterAccount(tx, userId);
    const [row] = await tx.select().from(petCharactersTable).where(eq(petCharactersTable.userId, userId));
    if (row) return row.characterId;
    const [member] = await tx.select().from(coopMembersTable).where(eq(coopMembersTable.userId, userId));
    const [household] = member
      ? await tx.select().from(coopHouseholdsTable).where(eq(coopHouseholdsTable.id, member.householdId))
      : [];
    if (!household?.characterId) return null;
    await tx.insert(petCharactersTable).values({ userId, characterId: household.characterId }).onConflictDoNothing();
    return household.characterId;
  });
}
router.get("/pet/character", async (req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录账号再选择伙伴。" }); return; }
  const characterId = await preserveAccountCharacter(userId);
  res.json(GetPetCharacterResponse.parse({ characterId, locked: !!characterId, shared: false }));
});
router.post("/pet/character", async (req, res): Promise<void> => {
  const userId = getAuth(req).userId;
  if (!userId) { res.status(401).json({ error: "请先登录账号再选择伙伴。" }); return; }
  const input = ChoosePetCharacterBody.safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: "请选择小熊猫或小白。" }); return; }
  await preserveAccountCharacter(userId);
  const result = await db.transaction(async tx => {
    await lockCharacterAccount(tx, userId);
    await tx.insert(petCharactersTable).values({ userId, characterId: input.data.characterId }).onConflictDoNothing();
    const [row] = await tx.select().from(petCharactersTable).where(eq(petCharactersTable.userId, userId));
    return { conflict: row.characterId !== input.data.characterId, characterId: row.characterId, shared: false };
  });
  if (result.conflict) {
    res.status(409).json({ error: "这个账号已选定伙伴。更换需要角色转化液，目前尚未开放。" }); return;
  }
  res.json(GetPetCharacterResponse.parse({ characterId: result.characterId, locked: true, shared: result.shared }));
});
export default router;
