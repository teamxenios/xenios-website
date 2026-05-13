import { waitlistSignups, counterState, type WaitlistSignup, type InsertWaitlist } from "@shared/schema";
import { db } from "./db";
import { desc, eq, sql } from "drizzle-orm";

export interface RequestMeta {
  ipCountry?: string | null;
  userAgent?: string | null;
}

export interface CreateResult {
  signup: WaitlistSignup;
  totalCount: number;
}

export interface IStorage {
  createWaitlist(submission: InsertWaitlist, meta?: RequestMeta): Promise<CreateResult>;
  findWaitlistByEmail(email: string): Promise<WaitlistSignup | null>;
  getAllWaitlist(): Promise<WaitlistSignup[]>;
  getCounterTotal(): Promise<number>;
  ensureCounterSeeded(baseCount?: number): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async ensureCounterSeeded(baseCount = 550): Promise<void> {
    await db.insert(counterState).values({ id: 1, baseCount, signupsCount: 0 }).onConflictDoNothing();
  }

  async getCounterTotal(): Promise<number> {
    const [row] = await db.select().from(counterState).where(eq(counterState.id, 1)).limit(1);
    if (!row) return 550;
    return Number(row.baseCount) + Number(row.signupsCount);
  }

  async findWaitlistByEmail(email: string): Promise<WaitlistSignup | null> {
    const [row] = await db
      .select()
      .from(waitlistSignups)
      .where(eq(waitlistSignups.email, email.toLowerCase()))
      .limit(1);
    return row ?? null;
  }

  async getAllWaitlist(): Promise<WaitlistSignup[]> {
    return db.select().from(waitlistSignups).orderBy(desc(waitlistSignups.createdAt));
  }

  async createWaitlist(submission: InsertWaitlist, meta: RequestMeta = {}): Promise<CreateResult> {
    // Atomic: lock counter row, derive next position, insert, bump counter.
    return await db.transaction(async (tx) => {
      const [counterRow] = await tx
        .select()
        .from(counterState)
        .where(eq(counterState.id, 1))
        .for("update")
        .limit(1);

      const baseCount = Number(counterRow?.baseCount ?? 550);
      const signupsCount = Number(counterRow?.signupsCount ?? 0);
      const position = baseCount + signupsCount + 1;

      const [signup] = await tx
        .insert(waitlistSignups)
        .values({
          firstName: submission.firstName,
          lastName: submission.lastName,
          email: submission.email,
          practitionerType: submission.practitionerType,
          city: submission.city,
          country: submission.country,
          freeText: submission.freeText ?? null,
          howHeard: submission.howHeard ?? null,
          position,
          ipCountry: meta.ipCountry ?? null,
          userAgent: meta.userAgent ?? null,
        })
        .returning();

      await tx
        .update(counterState)
        .set({
          signupsCount: sql`${counterState.signupsCount} + 1`,
          updatedAt: new Date(),
        })
        .where(eq(counterState.id, 1));

      const totalCount = baseCount + signupsCount + 1;
      return { signup, totalCount };
    });
  }
}

export const storage = new DatabaseStorage();
