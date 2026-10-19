import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export type CoopGift = {
  id: string;
  emoji: string;
  item: string;
  animal: string;
  story: string;
  receivedAt: number;
  favorite?: boolean;
  fedAt?: number;
};

export type CoopRoomPoint = { x: number; y: number };

export type CoopCareStatCategory = "health" | "bond" | "growth";

export type CoopCareStats = {
  growth: number;
  health: number;
  bond: number;
  lastInteractionAt: number;
  lastDecayAt: number;
  revision: number;
  lastInteractionCategory: CoopCareStatCategory;
  recentInteractionIds: string[];
};

export type CoopSharedState = {
  gifts: CoopGift[];
  furnitureLayout: Partial<
    Record<"bed" | "rack" | "mailbox" | "bathStation", CoopRoomPoint>
  >;
  placedProps: Record<string, boolean>;
  careStats?: CoopCareStats;
};

export const coopNoteStatus = pgEnum("panda_coop_note_status", [
  "queued",
  "delivered",
]);

export const coopNoteCategory = pgEnum("panda_coop_note_category", [
  "daily",
  "idea",
  "worry",
]);

export const coopHouseholdsTable = pgTable("panda_coop_households", {
  id: uuid("id").defaultRandom().primaryKey(),
  createdBy: text("created_by").notNull(),
  sharedState: jsonb("shared_state").$type<CoopSharedState>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const coopMembersTable = pgTable(
  "panda_coop_members",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => coopHouseholdsTable.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    playerNumber: integer("player_number").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("panda_coop_members_user_id_uq").on(table.userId),
    uniqueIndex("panda_coop_members_household_player_uq").on(
      table.householdId,
      table.playerNumber,
    ),
    index("panda_coop_members_household_idx").on(table.householdId),
  ],
);

export const coopInvitationsTable = pgTable(
  "panda_coop_invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => coopHouseholdsTable.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    createdBy: text("created_by").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("panda_coop_invitations_code_hash_uq").on(table.codeHash),
    index("panda_coop_invitations_household_idx").on(table.householdId),
  ],
);

export const coopShareNotesTable = pgTable(
  "panda_coop_share_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => coopHouseholdsTable.id, { onDelete: "cascade" }),
    senderUserId: text("sender_user_id").notNull(),
    category: coopNoteCategory("category").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    excluded: boolean("excluded").notNull().default(false),
    automatic: boolean("automatic").notNull().default(false),
    status: coopNoteStatus("status").notNull().default("queued"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  },
  (table) => [
    index("panda_coop_share_notes_household_status_created_idx").on(
      table.householdId,
      table.status,
      table.createdAt,
    ),
    index("panda_coop_share_notes_sender_idx").on(table.senderUserId),
  ],
);

export const insertCoopHouseholdSchema = createInsertSchema(
  coopHouseholdsTable,
).omit({ id: true, updatedAt: true });
export const insertCoopMemberSchema = createInsertSchema(coopMembersTable).omit(
  { id: true, joinedAt: true },
);
export const insertCoopInvitationSchema = createInsertSchema(
  coopInvitationsTable,
).omit({ id: true, createdAt: true });
export const insertCoopShareNoteSchema = createInsertSchema(
  coopShareNotesTable,
).omit({ id: true, createdAt: true });

export type CoopHousehold = typeof coopHouseholdsTable.$inferSelect;
export type CoopMember = typeof coopMembersTable.$inferSelect;
export type CoopInvitation = typeof coopInvitationsTable.$inferSelect;
export type CoopShareNote = typeof coopShareNotesTable.$inferSelect;
