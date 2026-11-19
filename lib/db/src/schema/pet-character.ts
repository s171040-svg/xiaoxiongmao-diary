import { createInsertSchema } from "drizzle-zod";
import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** One permanent first choice per authenticated account, never client-owned. */
export const petCharactersTable = pgTable("panda_pet_characters", {
  userId: text("user_id").primaryKey(),
  characterId: text("character_id").notNull(),
  selectedAt: timestamp("selected_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPetCharacterSchema = createInsertSchema(petCharactersTable);
export type PetCharacter = typeof petCharactersTable.$inferSelect;
