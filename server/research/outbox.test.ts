import crypto from "crypto";
import express from "express";
import request from "supertest";
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
  sendResubmittedConfirmation: vi.fn(async () => true),
  sendAccountClaimSuccess: vi.fn(async () => true),
  sendEmailFailureAlert: vi.fn(async () => ({ ok: true, id: "resend-alert-id" })),
  sendAdminTestEmail: vi.fn(async () => ({ ok: true, id: "resend-test-id" })),
}));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_notification_attempts" ? state.attempts : state.outbox;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    let selectCols: string | null = null;
    const filters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    const ltFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          lteFilters.every(([c, v]) => r[c] <= v) &&
          ltFilters.every(([c, v]) => r[c] != null && r[c] < v) &&
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
        // Real Supabase does not error on zero-row updates.
        if (!targets.length) return { data: null, error: null };
        for (const target of targets) Object.assign(target, updatePayload);
        return { data: targets[0], error: null };
      }
      let rows = applyFilters(list);
      if (limitN != null) rows = rows.slice(0, limitN);
      if (selectCols && selectCols !== "*") {
        const cols = selectCols.split(",").map((c) => c.trim());
        rows = rows.map((r) => Object.fromEntries(cols.filter((c) => c in r).map((c) => [c, r[c]])));
      }
      return { data: rows, error: null };
    };
    const api: any = {
      select: (cols?: string) => { if (mode === "select") selectCols = cols ?? null; return api; },
      insert: (p: any) => { mode = "insert"; insertPayload = p; return api; },
      update: (p: any) => { mode = "update"; updatePayload = p; return api; },
      eq: (c: string, v: any) => { filters.push([c, v]); return api; },
      in: (c: string, vs: any[]) => { inFilter = [c, vs]; return api; },
      lte: (c: string, v: any) => { lteFilters.push([c, v]); return api; },
      lt: (c: string, v: any) => { ltFilters.push([c, v]); return api; },
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

import { enqueueNotification, registerOutboxAdmin, runOutboxTick } from "./outbox";

function makeAdminApp() {
  const app = express();
  app.use(express.json());
  registerOutboxAdmin(app);
  return app;
}

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

  it("reclaims a stale processing row (crashed worker) and delivers it", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "processing";
    state.outbox[0].updated_at = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // stale
    const result = await runOutboxTick(new Date());
    expect(result.sent).toBe(1);
    expect(state.outbox[0].status).toBe("sent");
    expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1);
  });

  it("a recently claimed processing row is NOT reclaimed", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "processing";
    state.outbox[0].updated_at = new Date().toISOString(); // fresh claim by another worker
    const result = await runOutboxTick(new Date());
    expect(result.sent + result.retried + result.failed).toBe(0);
    expect(state.outbox[0].status).toBe("processing");
  });

  it("permanent failure enqueues an admin failure alert (and never alerts about admin templates)", async () => {
    state.sendMode = "throw";
    await enqueueNotification(job());
    const now = new Date("2026-07-18T12:00:00Z");
    for (let i = 1; i <= 6; i++) {
      if (state.outbox[0]) state.outbox[0].next_attempt_at = new Date(0).toISOString();
      await runOutboxTick(now);
    }
    expect(state.outbox[0].status).toBe("failed_permanent");
    const alerts = state.outbox.filter((r) => r.template_key === "admin_email_failure");
    expect(alerts).toHaveLength(1);
    expect(alerts[0].recipient).toBe("samuel@xeniostechnology.com");

    // The alert itself delivers on the next tick.
    state.sendMode = "ok";
    alerts[0].next_attempt_at = new Date(0).toISOString();
    await runOutboxTick(new Date());
    expect(emails.sendEmailFailureAlert).toHaveBeenCalledTimes(1);
    expect(emails.sendEmailFailureAlert.mock.calls[0][0].to).toBe("samuel@xeniostechnology.com");
    expect(emails.sendEmailFailureAlert.mock.calls[0][0].failedTemplate).toBe("applicant_received");
    // No alert-about-the-alert even if it had failed (admin_ prefix is excluded).
    expect(state.outbox.filter((r) => r.template_key === "admin_email_failure")).toHaveLength(1);
  });

  it("captures the provider message id when the sender returns one", async () => {
    emails.sendApplicationReceived.mockImplementationOnce(async () => ({ ok: true, id: "resend-msg-123" }) as any);
    await enqueueNotification(job());
    await runOutboxTick(new Date());
    expect(state.outbox[0].status).toBe("sent");
    expect(state.outbox[0].provider_message_id).toBe("resend-msg-123");
  });

  it("delivers admin alerts to the job's own recipient, not a hardcoded address", async () => {
    await enqueueNotification(
      job({
        eventKey: `admin-new-application:${crypto.randomUUID()}`,
        templateKey: "admin_new_application",
        recipient: "second-admin@xeniostechnology.com",
        payload: { applicantEmail: "a@example.com", applicantName: "A B", applicantType: "individual" },
      }),
    );
    await runOutboxTick(new Date());
    expect(emails.sendInternalApplicationAlert).toHaveBeenCalledTimes(1);
    expect(emails.sendInternalApplicationAlert.mock.calls[0][0].to).toBe("second-admin@xeniostechnology.com");
  });

  it("mints tokens with the purpose decided at enqueue time", async () => {
    await enqueueNotification(job()); // no tokenPurpose -> status
    await enqueueNotification(
      job({
        eventKey: `approved:${crypto.randomUUID()}`,
        templateKey: "applicant_approved",
        payload: { firstName: "Jordan", tokenPurpose: "account_claim", approvalExpiresAt: new Date().toISOString() },
      }),
    );
    await runOutboxTick(new Date());
    expect(emails.sendApplicationReceived.mock.calls[0][0].token).toMatch(/^v2\.status\./);
    expect(emails.sendApplicationApproved.mock.calls[0][0].token).toMatch(/^v2\.account_claim\./);
  });

  it("a legacy applicant_approved row (no tokenPurpose in payload) still mints a claim-capable token", async () => {
    await enqueueNotification(
      job({
        eventKey: `approved:${crypto.randomUUID()}`,
        templateKey: "applicant_approved",
        payload: { firstName: "Jordan", approvalExpiresAt: new Date().toISOString() }, // pre-purpose payload shape
      }),
    );
    await runOutboxTick(new Date());
    expect(emails.sendApplicationApproved.mock.calls[0][0].token).toMatch(/^v2\.account_claim\./);
  });

  it("a provider rejection WITHOUT a throw (SDK error field) is a recorded failure, not a sent", async () => {
    state.sendMode = "false"; // sender resolves false: provider rejected, nothing thrown
    await enqueueNotification(job());
    const result = await runOutboxTick(new Date());
    expect(result.sent).toBe(0);
    expect(result.retried).toBe(1);
    expect(state.outbox[0].status).toBe("failed_retryable");
    expect(state.attempts[0].outcome).toBe("failed");
  });

  it("a permanently failing ADMIN template never enqueues a failure alert (loop guard)", async () => {
    emails.sendInternalApplicationAlert.mockImplementation(async () => { throw new Error("provider down"); });
    await enqueueNotification(
      job({
        eventKey: `admin-new-application:${crypto.randomUUID()}`,
        templateKey: "admin_new_application",
        recipient: "samuel@xeniostechnology.com",
        payload: { applicantEmail: "a@example.com", applicantName: "A B", applicantType: "individual" },
      }),
    );
    const now = new Date("2026-07-18T12:00:00Z");
    for (let i = 1; i <= 6; i++) {
      state.outbox[0].next_attempt_at = new Date(0).toISOString();
      await runOutboxTick(now);
    }
    emails.sendInternalApplicationAlert.mockImplementation(async () => true);
    expect(state.outbox[0].status).toBe("failed_permanent");
    expect(state.outbox.filter((r) => r.template_key === "admin_email_failure")).toHaveLength(0);
  });
});

describe("admin outbox endpoints", () => {
  it("lists messages without exposing payload contents", async () => {
    await enqueueNotification(job({ payload: { firstName: "Secretive" } }));
    const res = await request(makeAdminApp()).get("/api/admin/research/outbox");
    expect(res.status).toBe(200);
    expect(res.body.outbox).toHaveLength(1);
    expect(res.body.outbox[0].template_key).toBe("applicant_received");
    expect(JSON.stringify(res.body)).not.toContain("Secretive");
  });

  it("requeues a failed_permanent message and delivers it", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "failed_permanent";
    state.outbox[0].attempt_count = 6;
    const res = await request(makeAdminApp()).post(`/api/admin/research/outbox/${state.outbox[0].id}/retry`);
    expect(res.status).toBe(200);
    expect(state.outbox[0].status).toBe("sent");
    expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1);
    // The requeue is recorded as an auditable attempt row.
    expect(state.attempts.some((a) => a.outcome === "manual-requeue")).toBe(true);
  });

  it("refuses to requeue a message that already sent", async () => {
    await enqueueNotification(job());
    await runOutboxTick(new Date());
    expect(state.outbox[0].status).toBe("sent");
    const res = await request(makeAdminApp()).post(`/api/admin/research/outbox/${state.outbox[0].id}/retry`);
    expect(res.status).toBe(409);
  });

  it("refuses to requeue a FRESH processing row (a worker may be mid-send), allows a stale one", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "processing";
    state.outbox[0].updated_at = new Date().toISOString(); // freshly claimed
    const app = makeAdminApp();
    const fresh = await request(app).post(`/api/admin/research/outbox/${state.outbox[0].id}/retry`);
    expect(fresh.status).toBe(409);
    expect(emails.sendApplicationReceived).not.toHaveBeenCalled();

    state.outbox[0].updated_at = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // stale claim
    const stale = await request(app).post(`/api/admin/research/outbox/${state.outbox[0].id}/retry`);
    expect(stale.status).toBe(200);
    expect(state.outbox[0].status).toBe("sent");
  });

  it("test email: sends only to a configured admin address", async () => {
    const app = makeAdminApp();
    const ok = await request(app).post("/api/admin/research/test-email").send({ to: "samuel@xeniostechnology.com" });
    expect(ok.status).toBe(200);
    expect(ok.body.ok).toBe(true);
    expect(ok.body.providerMessageId).toBe("resend-test-id");
    expect(emails.sendAdminTestEmail).toHaveBeenCalledWith({ to: "samuel@xeniostechnology.com" });

    const rejected = await request(app).post("/api/admin/research/test-email").send({ to: "attacker@example.com" });
    expect(rejected.status).toBe(400);
    expect(emails.sendAdminTestEmail).toHaveBeenCalledTimes(1);
  });
});
