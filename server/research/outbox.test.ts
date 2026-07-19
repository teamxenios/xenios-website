import crypto from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Durable outbox worker tests (Mega 1 section 11): idempotent enqueue,
// exactly-once claims, retry backoff, permanent failure after the cap, and
// no token storage in the queue.
// ---------------------------------------------------------------------------

const state = vi.hoisted(() => ({
  outbox: [] as any[],
  attempts: [] as any[],
  sendMode: "ok" as "ok" | "throw" | "false",
}));

const emails = vi.hoisted(() => ({
  sendApplicationReceived: vi.fn(async () => {
    if (state.sendMode === "throw") throw new Error("provider 500");
    return state.sendMode === "ok";
  }),
  sendStatusLink: vi.fn(async () => true),
  sendInternalApplicationAlert: vi.fn(async () => true),
  sendApplicationApproved: vi.fn(async () => true),
  sendApplicationDeclined: vi.fn(async () => true),
  sendMoreInformationRequested: vi.fn(async () => true),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_notification_attempts" ? state.attempts : state.outbox;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    const filters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          lteFilters.every(([c, v]) => r[c] <= v) &&
          (!inFilter || inFilter[1].includes(r[inFilter[0]])),
      );
    const finish = () => {
      if (mode === "insert") {
        if (table === "research_notification_outbox" && insertPayload?.event_key &&
            list.some((r: any) => r.event_key === insertPayload.event_key)) {
          return { data: null, error: { message: "duplicate key value" } };
        }
        const row = {
          id: crypto.randomUUID(),
          status: "pending",
          attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(),
          created_at: new Date().toISOString(),
          ...insertPayload,
        };
        list.push(row);
        return { data: row, error: null };
      }
      if (mode === "update") {
        const targets = applyFilters(list);
        if (!targets.length) return { data: null, error: { message: "no rows" } };
        Object.assign(targets[0], updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows, error: null };
    };
    const api: any = {
      select: () => api,
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { inFilter = [c, vs]; return api; },
      lte: (c: string, v: any) => { lteFilters.push([c, v]); return api; },
      order: () => api,
      limit: (n: number) => { limitN = n; return api; },
      maybeSingle: async () => { const r = finish(); const d = Array.isArray(r.data) ? r.data[0] ?? null : r.data; return { data: d, error: null }; },
      single: async () => {
        const r = finish();
        const d = Array.isArray(r.data) ? r.data[0] : r.data;
        return d ? { data: d, error: null } : { data: null, error: { message: "not found" } };
      },
      then: (resolve: any) => resolve(finish()),
    };
    return api;
  }
  return {
    supabaseConfigured: () => true,
    getSupabaseAdmin: () => ({ from: query }),
    getSupabaseAnon: () => { throw new Error("not used"); },
  };
});

vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: any, _s: any, next: any) => next() }));
vi.mock("./membership-emails", () => emails);

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { enqueueNotification, runOutboxTick } from "./outbox";

function job(overrides: Record<string, unknown> = {}) {
  return {
    eventKey: `application-received:${crypto.randomUUID()}`,
    eventType: "application_received_applicant",
    templateKey: "applicant_received",
    recipient: "applicant@example.com",
    applicationId: crypto.randomUUID(),
    payload: { firstName: "Jordan" },
    ...overrides,
  };
}

beforeEach(() => {
  state.outbox.length = 0;
  state.attempts.length = 0;
  state.sendMode = "ok";
  vi.clearAllMocks();
});

describe("enqueue", () => {
  it("is idempotent on the event key", async () => {
    const input = job();
    expect(await enqueueNotification(input)).toBe(true);
    expect(await enqueueNotification(input)).toBe(true); // duplicate reports queued
    expect(state.outbox).toHaveLength(1);
  });

  it("never stores a status token in the payload", async () => {
    await enqueueNotification(job());
    expect(JSON.stringify(state.outbox[0].payload)).not.toMatch(/token/i);
  });
});

describe("worker tick", () => {
  it("sends a pending job exactly once and records the attempt", async () => {
    await enqueueNotification(job());
    const first = await runOutboxTick(new Date());
    expect(first.sent).toBe(1);
    expect(state.outbox[0].status).toBe("sent");
    expect(state.outbox[0].completed_at).toBeTruthy();
    expect(state.attempts).toHaveLength(1);
    expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1);
    // A fresh signed token was minted at send time.
    expect(emails.sendApplicationReceived.mock.calls[0][0].token).toContain(".");

    const second = await runOutboxTick(new Date());
    expect(second.sent).toBe(0);
    expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1);
  });

  it("a thrown provider error schedules a retry with backoff, then goes permanent at the cap", async () => {
    state.sendMode = "throw";
    await enqueueNotification(job());
    const now = new Date("2026-07-18T12:00:00Z");

    const first = await runOutboxTick(now);
    expect(first.retried).toBe(1);
    expect(state.outbox[0].status).toBe("failed_retryable");
    expect(state.outbox[0].attempt_count).toBe(1);
    expect(new Date(state.outbox[0].next_attempt_at).getTime()).toBeGreaterThan(now.getTime());

    // Force through the remaining attempts.
    for (let i = 2; i <= 6; i++) {
      state.outbox[0].next_attempt_at = new Date(0).toISOString();
      await runOutboxTick(now);
    }
    expect(state.outbox[0].status).toBe("failed_permanent");
    expect(state.outbox[0].attempt_count).toBe(6);
    expect(state.attempts).toHaveLength(6);
    expect(state.outbox[0].last_error_summary).toContain("provider 500");
  });

  it("a job claimed by another worker is skipped", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "processing"; // someone else holds it
    const result = await runOutboxTick(new Date());
    expect(result.sent + result.retried + result.failed).toBe(0);
    expect(emails.sendApplicationReceived).not.toHaveBeenCalled();
  });

  it("a future next_attempt_at is not picked up early", async () => {
    await enqueueNotification(job());
    state.outbox[0].next_attempt_at = new Date(Date.now() + 3600_000).toISOString();
    const result = await runOutboxTick(new Date());
    expect(result.sent).toBe(0);
    expect(state.outbox[0].status).toBe("pending");
  });
});
