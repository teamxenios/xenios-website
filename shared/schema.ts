import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const waitlistSubmissions = pgTable("waitlist_submissions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name"),
  lastName: text("last_name"),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  missingTechFeedback: text("missing_tech_feedback"),
  sourcePage: text("source_page"),
  activeClients: text("active_clients"),
  adminHours: text("admin_hours"),
  dataSources: text("data_sources"),
  anonymizedDataConsent: boolean("anonymized_data_consent"),
  submissionType: text("submission_type").notNull().$type<"general" | "coach_partner">(),
  status: text("status").notNull().default("Waitlist"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertWaitlistSubmissionSchema = createInsertSchema(waitlistSubmissions).omit({
  id: true,
  createdAt: true,
});

export type InsertWaitlistSubmission = z.infer<typeof insertWaitlistSubmissionSchema>;
export type WaitlistSubmission = typeof waitlistSubmissions.$inferSelect;
