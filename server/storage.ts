import { waitlistSubmissions, type WaitlistSubmission, type InsertWaitlistSubmission } from "@shared/schema";
import { db } from "./db";
import { desc } from "drizzle-orm";

export interface IStorage {
  createWaitlistSubmission(submission: InsertWaitlistSubmission): Promise<WaitlistSubmission>;
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

  async getAllWaitlistSubmissions(): Promise<WaitlistSubmission[]> {
    return await db.select().from(waitlistSubmissions).orderBy(desc(waitlistSubmissions.createdAt));
  }
}

export const storage = new DatabaseStorage();
