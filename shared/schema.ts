import { sql } from "drizzle-orm";
import { pgTable, text, timestamp, uuid, integer, smallint } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// v5 — 25 ICPs aligned with ICP_LIST in client/src/lib/content.ts
export const PRACTITIONER_TYPE_VALUES = [
  "strength_coaches",
  "personal_trainers",
  "sports_performance",
  "functional_medicine",
  "longevity_clinics",
  "concierge_medicine",
  "performance_labs",
  "recovery_studios",
  "telemedicine_startups",
  "preventive_care",
  "nutrition_companies",
  "supplement_brands",
  "athlete_brands",
  "corporate_wellness",
  "healthcare_systems",
  "military",
  "biohacking_clinics",
  "physical_therapists",
  "chiropractors",
  "hormone_clinics",
  "peptide_clinics",
  "self_insured_employers",
  "elite_athletes",
  "creators",
  "sports_agencies",
  "other",
] as const;

export const CONTACT_PERSONA_VALUES = [
  "practitioner",
  "investor",
  "journalist_creator",
  "integration_partner",
  "enterprise",
  "candidate",
  "other",
] as const;

export const waitlistSignups = pgTable("waitlist_signups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull().unique(),
  practitionerType: text("practitioner_type").notNull().$type<typeof PRACTITIONER_TYPE_VALUES[number]>(),
  city: text("city").notNull(),
  country: text("country").notNull(),
  freeText: text("free_text"),
  howHeard: text("how_heard"),
  position: integer("position").notNull(),
  ipCountry: text("ip_country"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const counterState = pgTable("counter_state", {
  id: smallint("id").primaryKey().default(1),
  baseCount: integer("base_count").notNull().default(550),
  signupsCount: integer("signups_count").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertWaitlistSchema = createInsertSchema(waitlistSignups, {
  firstName: z.string().min(1).max(80).trim(),
  lastName: z.string().min(1).max(80).trim(),
  email: z.string().email().max(254).toLowerCase().trim(),
  practitionerType: z.enum(PRACTITIONER_TYPE_VALUES),
  city: z.string().min(1).max(120).trim(),
  country: z.string().min(1).max(80).trim(),
  freeText: z.string().max(800).optional().nullable(),
  howHeard: z.string().max(160).optional().nullable(),
}).omit({
  id: true,
  position: true,
  createdAt: true,
  ipCountry: true,
  userAgent: true,
});

export type InsertWaitlist = z.infer<typeof insertWaitlistSchema>;
export type WaitlistSignup = typeof waitlistSignups.$inferSelect;

export const contactMessageSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  email: z.string().email().max(254).toLowerCase().trim(),
  persona: z.enum(CONTACT_PERSONA_VALUES),
  subject: z.string().min(1).max(200).trim(),
  message: z.string().min(20).max(4000).trim(),
  website: z.string().optional(),
});
export type ContactMessage = z.infer<typeof contactMessageSchema>;
