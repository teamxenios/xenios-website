import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const waitlistSubmissions = pgTable("waitlist_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  email: text("email").notNull(),
  role: text("role").notNull(),
  activeClients: text("active_clients"),
  adminHours: text("admin_hours"),
  dataSources: text("data_sources"),
  anonymizedDataConsent: boolean("anonymized_data_consent"),
  submissionType: text("submission_type").notNull().$type<"general" | "coach_partner">(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSubmissionSchema = createInsertSchema(waitlistSubmissions).omit({
  id: true,
  createdAt: true,
});

export type InsertWaitlistSubmission = z.infer<typeof insertWaitlistSubmissionSchema>;
export type WaitlistSubmission = typeof waitlistSubmissions.$inferSelect;
