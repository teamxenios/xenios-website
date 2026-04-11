import { waitlistSubmissions, type WaitlistSubmission, type InsertWaitlistSubmission } from "@shared/schema";
import { db } from "./db";
import { desc, eq } from "drizzle-orm";

export interface IStorage {
  createWaitlistSubmission(submission: InsertWaitlistSubmission): Promise<WaitlistSubmission>;
  findWaitlistSubmissionByEmail(email: string): Promise<WaitlistSubmission | null>;
  getAllWaitlistSubmissions(): Promise<WaitlistSubmission[]>;
}

export class DatabaseStorage implements IStorage {
  async createWaitlistSubmission(submission: InsertWaitlistSubmission): Promise<WaitlistSubmission> {
    const [result] = await db
      .insert(waitlistSubmissions)
      .values(submission)
      .returning();
    return result;
  }

  async findWaitlistSubmissionByEmail(email: string): Promise<WaitlistSubmission | null> {
    const [result] = await db
      .select()
      .from(waitlistSubmissions)
      .where(eq(waitlistSubmissions.email, email.toLowerCase()))
      .limit(1);
    return result || null;
  }

  async getAllWaitlistSubmissions(): Promise<WaitlistSubmission[]> {
    return await db.select().from(waitlistSubmissions).orderBy(desc(waitlistSubmissions.createdAt));
  }
}

export const storage = new DatabaseStorage();
