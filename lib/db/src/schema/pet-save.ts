import { createInsertSchema } from "drizzle-zod";
import { jsonb, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Private gameplay backup only. Never stores chat, photos or diary entries. */
export const petSavesTable = pgTable("panda_pet_saves", {
  userId: text("user_id").primaryKey(),
  snapshot: jsonb("snapshot").$type<Record<string, unknown>>().notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
export const insertPetSaveSchema = createInsertSchema(petSavesTable);
export type PetSave = typeof petSavesTable.$inferSelect;
