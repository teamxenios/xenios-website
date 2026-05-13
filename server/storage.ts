import { waitlist, waitlistOffset, type Waitlist, type InsertWaitlist } from "@shared/schema";
import { db } from "./db";
import { desc, eq, sql } from "drizzle-orm";

export interface RequestMeta {
  source?: string | null;
  referrer?: string | null;
  country?: string | null;
}

export interface IStorage {
  createWaitlist(submission: InsertWaitlist, meta?: RequestMeta): Promise<Waitlist>;
  findWaitlistByEmail(email: string): Promise<Waitlist | null>;
  getAllWaitlist(): Promise<Waitlist[]>;
  getWaitlistCount(): Promise<{ rawCount: number; offset: number; total: number }>;
  ensureOffsetSeeded(value?: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async createWaitlist(submission: InsertWaitlist, meta: RequestMeta = {}): Promise<Waitlist> {
    const [row] = await db
      .insert(waitlist)
      .values({
        ...(submission as typeof waitlist.$inferInsert),
        source: meta.source ?? null,
        referrer: meta.referrer ?? null,
        country: meta.country ?? null,
      })
      .returning();
    return row;
  }

  async findWaitlistByEmail(email: string): Promise<Waitlist | null> {
    const [row] = await db
      .select()
      .from(waitlist)
      .where(eq(waitlist.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async getAllWaitlist(): Promise<Waitlist[]> {
    return db.select().from(waitlist).orderBy(desc(waitlist.createdAt));
  }

  async getWaitlistCount(): Promise<{ rawCount: number; offset: number; total: number }> {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(waitlist);

    const [offsetRow] = await db.select().from(waitlistOffset).where(eq(waitlistOffset.id, 1)).limit(1);
    const offset = offsetRow?.value ?? 550;

    return { rawCount: Number(count), offset, total: Number(count) + offset };
  }

  async ensureOffsetSeeded(value = 550): Promise<void> {
    await db.insert(waitlistOffset).values({ id: 1, value }).onConflictDoNothing();
  }
}

export const storage = new DatabaseStorage();
