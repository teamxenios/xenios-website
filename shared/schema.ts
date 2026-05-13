import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, boolean, uuid, bigserial, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const ROLE_VALUES = [
  "personal_trainer",
  "nutritionist",
  "glp1_coach",
  "longevity_specialist",
  "functional_medicine",
  "health_coach",
  "rn_rd_cashpay",
  "recovery_sleep_mind",
  "biohacker",
  "sports_team",
  "other",
] as const;

export const TEAM_SIZE_VALUES = ["solo", "2_5", "6_20", "21_100", "100_plus"] as const;
export const CLIENTS_ACTIVE_VALUES = ["0_10", "11_50", "51_200", "201_1000", "1000_plus"] as const;

export const waitlist = pgTable("waitlist", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  email: text("email").notNull().unique(),
  role: text("role").notNull().$type<typeof ROLE_VALUES[number]>(),
  practiceName: text("practice_name"),
  teamSize: text("team_size").notNull().$type<typeof TEAM_SIZE_VALUES[number]>(),
  clientsActive: text("clients_active").notNull().$type<typeof CLIENTS_ACTIVE_VALUES[number]>(),
  toolsToday: text("tools_today"),
  message: text("message"),
  consent: boolean("consent").notNull().default(false),
  position: bigserial("position", { mode: "number" }).notNull(),
  source: text("source"),
  referrer: text("referrer"),
  country: text("country"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  confirmedAt: timestamp("confirmed_at"),
});

export const waitlistOffset = pgTable("waitlist_offset", {
  id: integer("id").primaryKey().default(1),
  value: integer("value").notNull().default(550),
});

export const insertWaitlistSchema = createInsertSchema(waitlist, {
  email: z.string().email().max(254).toLowerCase().trim(),
  role: z.enum(ROLE_VALUES),
  teamSize: z.enum(TEAM_SIZE_VALUES),
  clientsActive: z.enum(CLIENTS_ACTIVE_VALUES),
  practiceName: z.string().max(120).optional().nullable(),
  toolsToday: z.string().max(300).optional().nullable(),
  message: z.string().max(1000).optional().nullable(),
  consent: z.literal(true),
}).omit({
  id: true,
  position: true,
  createdAt: true,
  confirmedAt: true,
  source: true,
  referrer: true,
  country: true,
});

export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type Waitlist = typeof waitlist.$inferSelect;
