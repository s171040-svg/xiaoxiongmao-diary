import { and, eq, inArray, sql } from "drizzle-orm";
import { coopHouseholdsTable, coopMembersTable, petCharactersTable, db } from "@workspace/db";

export type CharacterId = "panda" | "xiaobai";
export type CharacterTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export const isCharacterId = (value: unknown): value is CharacterId =>
  value === "panda" || value === "xiaobai";

// All selection/create/join mutations lock the caller before locking a household.
export async function lockCharacterAccount(tx: CharacterTransaction, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pet-character:${userId}`}))`);
}

export async function bindHouseholdCharacter(
  tx: CharacterTransaction, householdId: string, userIds: string[], requested?: CharacterId,
) {
  const [household] = await tx.select().from(coopHouseholdsTable)
    .where(eq(coopHouseholdsTable.id, householdId)).for("update");
  if (!household) throw new Error("Household not found");
  const members = await tx.select().from(coopMembersTable)
    .where(eq(coopMembersTable.householdId, householdId));
  userIds = [...new Set([...userIds, ...members.map(m => m.userId)])];
  const accounts = await tx.select().from(petCharactersTable)
    .where(inArray(petCharactersTable.userId, userIds));
  const choices = new Set([
    ...(household.characterId ? [household.characterId] : []),
    ...accounts.map(row => row.characterId),
    ...(requested ? [requested] : []),
  ]);
  if (choices.size > 1) return { conflict: true as const, characterId: null };
  const characterId = [...choices][0];
  if (!characterId) return { conflict: false as const, characterId: null };
  if (!isCharacterId(characterId)) throw new Error("Invalid stored character");
  await tx.update(coopHouseholdsTable).set({ characterId })
    .where(and(eq(coopHouseholdsTable.id, householdId)));
  for (const userId of userIds) {
    await tx.insert(petCharactersTable).values({ userId, characterId }).onConflictDoNothing();
  }
  return { conflict: false as const, characterId };
}
