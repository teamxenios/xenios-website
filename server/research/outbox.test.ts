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
  applications: [] as any[],
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
  sendApprovedCustomerClaim: vi.fn(async () => ({ ok: true, id: "provider-approved-test-only" })),
  sendApprovedCustomerWelcome: vi.fn(async () => ({ ok: true, id: "provider-welcome-test-only" })),
  sendEmailFailureAlert: vi.fn(async () => ({ ok: true, id: "resend-alert-id" })),
  sendAdminTestEmail: vi.fn(async () => ({ ok: true, id: "resend-test-id" })),
}));

const resend = vi.hoisted(() => ({
  send: vi.fn(async () => ({ data: { id: "resend-product-id" }, error: null })),
}));
const supabaseRpc = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => ({ data: 0, error: null as null | { code: string } })));

vi.mock("../supabase", () => {
  function query(table: string) {
    const list = table === "research_applications" ? state.applications : table === "research_notification_attempts" ? state.attempts : state.outbox;
    let mode: "select" | "insert" | "update" = "select";
    let insertPayload: any = null;
    let updatePayload: any = null;
    let selectCols: string | null = null;
    const filters: Array<[string, any]> = [];
    const neqFilters: Array<[string, any]> = [];
    const lteFilters: Array<[string, any]> = [];
    const ltFilters: Array<[string, any]> = [];
    let inFilter: [string, any[]] | null = null;
    let limitN: number | null = null;
    const applyFilters = (rows: any[]) =>
      rows.filter(
        (r) =>
          filters.every(([c, v]) => r[c] === v) &&
          neqFilters.every(([c, v]) => r[c] !== v) &&
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
      // A read returns copies, as PostgREST does, so a later update never
      // reaches a row the caller already holds.
      let rows = applyFilters(list).map((r) => ({ ...r }));
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
      neq: (c: string, v: any) => { neqFilters.push([c, v]); return api; },
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
    getSupabaseAdmin: () => ({ from: query, rpc: supabaseRpc }),
    getSupabaseAnon: () => { throw new Error("not used"); },
  };
});

vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: any, _s: any, next: any) => next() }));
vi.mock("./membership-emails", () => emails);
vi.mock("../services/email", () => ({
  getResendClient: async () => ({
    client: { emails: { send: resend.send } },
    fromEmail: "notices@example.invalid",
  }),
}));

process.env.RESEARCH_SESSION_SECRET = "test-secret-for-vitest";

import { OUTBOX_RETRY_LADDER, enqueueNotification, registerOutboxAdmin, runOutboxTick } from "./outbox";
import { STAFF_NOTICE_RESEND_LIMIT_MS } from "./assisted-order/request-intent/staff-notice";
import {
  CUSTOMER_NOTICE_BEFORE_START,
  CUSTOMER_NOTICE_SEND_LIMIT_MS,
  CUSTOMER_NOTICE_TEMPLATES,
} from "./assisted-order/request-intent/customer-notice";
import { enqueueProductDiagnosticEmail } from "./products-diagnostics/outbox-adapter";

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
  state.applications.length = 0;
  state.sendMode = "ok";
  vi.clearAllMocks();
});

describe("approved customer notification authority", () => {
  async function approvedJob() {
    const applicationId = crypto.randomUUID();
    state.applications.push({ id: applicationId, email: "customer@example.invalid", status: "approved_customer", access_approval_version: 2, approval_expires_at: new Date(Date.now() + 86400000).toISOString() });
    await enqueueNotification(job({ applicationId, recipient: "customer@example.invalid", templateKey: "approved_customer_claim", payload: { firstName: "Customer", approvalVersion: 2, tokenPurpose: "account_claim" } }));
    return state.applications[0];
  }
  it("checks current approval, mints a purpose-scoped link at send time and uses the durable event key", async () => {
    await approvedJob(); const result = await runOutboxTick(new Date()); expect(result.sent).toBe(1);
    expect(emails.sendApprovedCustomerClaim).toHaveBeenCalledWith(expect.objectContaining({ email: "customer@example.invalid", idempotencyKey: state.outbox[0].event_key, token: expect.any(String) }));
    expect(state.outbox[0].payload).not.toHaveProperty("token"); expect(state.outbox[0].provider_message_id).toBe("provider-approved-test-only");
  });
  it.each(["revoked", "expired", "superseded", "recipient"])("does not send or claim delivery for %s approval", async (reason) => {
    const application = await approvedJob();
    if (reason === "revoked") application.status = "withdrawn";
    if (reason === "expired") application.approval_expires_at = "2020-01-01T00:00:00Z";
    if (reason === "superseded") application.access_approval_version = 3;
    if (reason === "recipient") application.email = "other@example.invalid";
    await runOutboxTick(new Date()); expect(emails.sendApprovedCustomerClaim).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("failed_permanent"); expect(state.outbox[0].provider_message_id).toBeUndefined();
  });
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

  it("deduplicates Website 3 intents and stores only their allowlisted payload", async () => {
    const input = {
      eventKey: "product-request:request-1:received",
      eventType: "product_request_confirmation" as const,
      recipient: "member@example.com",
      payload: {
        firstName: "Sam",
        requestReference: "XPR-1001",
        memberAreaUrl:
          "https://xeniostechnology.com/research/member/product-requests",
        diagnosis: "must-not-be-stored",
        laboratoryResult: "must-not-be-stored",
      },
    };
    expect(await enqueueProductDiagnosticEmail(input)).toBe(true);
    expect(await enqueueProductDiagnosticEmail(input)).toBe(true);
    expect(state.outbox).toHaveLength(1);
    expect(state.outbox[0]).toMatchObject({
      event_key: input.eventKey,
      template_key: "product_diagnostic:product_request_confirmation",
      payload: {
        firstName: "Sam",
        requestReference: "XPR-1001",
      },
    });
    expect(JSON.stringify(state.outbox[0])).not.toContain("must-not-be-stored");

    const result = await runOutboxTick(new Date());
    expect(result.sent).toBe(1);
    expect(resend.send).toHaveBeenCalledTimes(1);
    expect(resend.send.mock.calls[0][0]).toMatchObject({
      to: "member@example.com",
      subject: "Your product request was received",
      replyTo: "research@xeniostechnology.com",
    });
    expect(JSON.stringify(resend.send.mock.calls[0][0])).not.toContain(
      "must-not-be-stored",
    );
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

  it("leaves paused full staff notices out of the batch, so other mail still sends", async () => {
    const settings = {
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid,samuel@example.invalid",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-11-15T20:00:00Z",
      SITE_URL: "https://staff.example.invalid",
    };
    Object.assign(process.env, settings);
    try {
      // The full email is off (no detail switch), so queued full jobs must wait.
      for (let index = 0; index < 20; index++) {
        const id = crypto.randomUUID();
        state.outbox.push({
          id: crypto.randomUUID(), event_key: "ea-request-submitted-" + id,
          event_type: "ea_request_submitted_staff_full_v1", template_key: "ea_request_submitted_staff_full_v1",
          recipient: "team@example.invalid", status: "pending", attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(), created_at: new Date().toISOString(),
          payload: { reference: "XRI-" + id.replace(/-/g, "").toUpperCase(), submittedAt: "2026-11-15T23:00:00Z",
            itemCount: 1, recipients: ["team@example.invalid", "samuel@example.invalid"] },
        });
      }
      await enqueueNotification(job());
      expect((await runOutboxTick(new Date())).sent).toBe(1);
      expect(emails.sendApplicationReceived).toHaveBeenCalledTimes(1);
      expect(resend.send).not.toHaveBeenCalled();
      const full = state.outbox.filter((row) => row.template_key === "ea_request_submitted_staff_full_v1");
      expect(full.every((row) => row.status === "pending" && row.attempt_count === 0)).toBe(true);
      expect(state.attempts).toHaveLength(1);
    } finally {
      for (const key of Object.keys(settings)) delete process.env[key];
    }
  });

  describe("staff notices and the provider's 24-hour duplicate check", () => {
    const settings = {
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "team@example.invalid,samuel@example.invalid",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-11-15T20:00:00Z",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: "full",
      EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT: "2026-11-15T22:00:00Z",
      SITE_URL: "https://staff.example.invalid",
      RESEND_API_KEY: "synthetic-test-only",
    };
    const withSettings = async (run: () => Promise<void>) => {
      Object.assign(process.env, settings);
      try { await run(); } finally { for (const key of Object.keys(settings)) delete process.env[key]; }
    };

    it("finishes every automatic retry well inside the window", () => {
      const { backoffSeconds, maxJitter } = OUTBOX_RETRY_LADDER;
      expect(backoffSeconds).toHaveLength(6);
      const longestLadderMs = backoffSeconds.reduce((sum, seconds) => sum + seconds * (1 + maxJitter), 0) * 1000;
      // Allow a 15-minute stale-claim reclaim before every attempt as well.
      const reclaimsMs = backoffSeconds.length * 15 * 60 * 1000;
      expect(longestLadderMs + reclaimsMs).toBeLessThan(STAFF_NOTICE_RESEND_LIMIT_MS);
    });

    it("does not resend a job attempted before once it is past the window, and alerts instead", async () => {
      await withSettings(async () => {
        const id = crypto.randomUUID();
        const now = new Date("2026-11-17T23:00:00Z");
        state.outbox.push({
          id: crypto.randomUUID(), event_key: "ea-request-submitted-" + id,
          event_type: "ea_request_submitted_staff_v1", template_key: "ea_request_submitted_staff_v1",
          recipient: "team@example.invalid", status: "failed_retryable", attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(),
          created_at: new Date(now.getTime() - STAFF_NOTICE_RESEND_LIMIT_MS - 1).toISOString(),
          last_attempt_at: new Date(now.getTime() - 3_600_000).toISOString(),
          payload: { reference: "XRI-" + id.replace(/-/g, "").toUpperCase(), submittedAt: "2026-11-16T23:00:00Z",
            itemCount: 1, recipients: ["team@example.invalid", "samuel@example.invalid"] },
        });
        expect((await runOutboxTick(now)).failed).toBe(1);
        expect(resend.send).not.toHaveBeenCalled();
        expect(state.outbox[0]).toMatchObject({ status: "failed_permanent", attempt_count: 1 });
        expect(state.outbox[0].last_error_summary).toContain("24-hour duplicate check");
      });
    });

    it("a manual retry of a stale claim with no recorded attempt, past the window, sends nothing", async () => {
      await withSettings(async () => {
        const id = crypto.randomUUID();
        // A claim from before claims recorded the attempt: processing, last_attempt_at null.
        state.outbox.push({
          id: crypto.randomUUID(), event_key: "ea-request-submitted-" + id,
          event_type: "ea_request_submitted_staff_v1", template_key: "ea_request_submitted_staff_v1",
          recipient: "team@example.invalid", status: "processing", attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(), last_attempt_at: null,
          created_at: new Date(Date.now() - STAFF_NOTICE_RESEND_LIMIT_MS - 3_600_000).toISOString(),
          updated_at: new Date(Date.now() - STAFF_NOTICE_RESEND_LIMIT_MS).toISOString(),
          payload: { reference: "XRI-" + id.replace(/-/g, "").toUpperCase(), submittedAt: "2026-11-15T23:00:00Z",
            itemCount: 1, recipients: ["team@example.invalid", "samuel@example.invalid"] },
        });
        const res = await request(makeAdminApp()).post(`/api/admin/research/outbox/${state.outbox[0].id}/retry`);
        expect(res.status).toBe(200);
        expect(resend.send).not.toHaveBeenCalled();
        expect(state.outbox[0]).toMatchObject({ status: "failed_permanent" });
        expect(state.outbox[0].last_error_summary).toContain("24-hour duplicate check");
      });
    });

    it("records the attempt when it claims a job, before the send", async () => {
      await withSettings(async () => {
        const id = crypto.randomUUID();
        state.outbox.push({
          id: crypto.randomUUID(), event_key: "ea-request-submitted-" + id,
          event_type: "ea_request_submitted_staff_v1", template_key: "ea_request_submitted_staff_v1",
          recipient: "team@example.invalid", status: "pending", attempt_count: 0,
          next_attempt_at: new Date(0).toISOString(), created_at: new Date().toISOString(),
          payload: { reference: "XRI-" + id.replace(/-/g, "").toUpperCase(), submittedAt: "2026-11-15T23:00:00Z",
            itemCount: 1, recipients: ["team@example.invalid", "samuel@example.invalid"] },
        });
        const now = new Date();
        let atSend: unknown = "not called";
        resend.send.mockImplementationOnce(async () => {
          atSend = { status: state.outbox[0].status, last_attempt_at: state.outbox[0].last_attempt_at };
          return { data: { id: "resend-product-id" }, error: null };
        });
        await runOutboxTick(now);
        expect(atSend).toEqual({ status: "processing", last_attempt_at: now.toISOString() });
      });
    });

    it("queues the short alert when the full switch is on before its migration", async () => {
      await withSettings(async () => {
        supabaseRpc.mockResolvedValueOnce({ data: null, error: { code: "PGRST202" } });
        await runOutboxTick(new Date());
        const short = { p_since: settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT,
          p_recipients: ["team@example.invalid", "samuel@example.invalid"] };
        expect(supabaseRpc.mock.calls).toEqual([
          ["request_intent_enqueue_staff_notices", { ...short, p_detail_since: settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT }],
          ["request_intent_enqueue_staff_notices", short],
        ]);
        // Any other failure is not taken as a missing migration.
        supabaseRpc.mockClear();
        supabaseRpc.mockResolvedValueOnce({ data: null, error: { code: "57014" } });
        await runOutboxTick(new Date());
        expect(supabaseRpc).toHaveBeenCalledTimes(1);
      });
    });
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

  it("a repeatedly crashing dispatch walks the attempt ladder and reaches failed_permanent, never reclaiming forever", async () => {
    await enqueueNotification(job());
    // A crash-mid-send strands the row in processing at attempt_count 5: the
    // reclaim must count the crashed attempt (6 = cap) and go permanent.
    state.outbox[0].status = "processing";
    state.outbox[0].attempt_count = 5;
    state.outbox[0].updated_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const result = await runOutboxTick(new Date());
    expect(state.outbox[0].status).toBe("failed_permanent");
    expect(state.outbox[0].attempt_count).toBe(6);
    // The crashed attempt is recorded and the applicant email was NOT
    // re-dispatched; the permanent failure alerted the admins (the alert
    // itself delivers in the same tick).
    expect(state.attempts.some((a) => a.outcome === "failed" && a.attempt === 6)).toBe(true);
    expect(emails.sendApplicationReceived).not.toHaveBeenCalled();
    expect(state.outbox.filter((r) => r.template_key === "admin_email_failure")).toHaveLength(1);
    expect(emails.sendEmailFailureAlert).toHaveBeenCalledTimes(1);
    expect(result.sent).toBe(1); // the admin alert, not the crashed applicant email
  });

  it("an earlier crash increments the attempt count on reclaim (no infinite loop)", async () => {
    await enqueueNotification(job());
    state.outbox[0].status = "processing";
    state.outbox[0].attempt_count = 1;
    state.outbox[0].updated_at = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await runOutboxTick(new Date());
    // Reclaim counted the crashed attempt (2), then the same tick redelivered
    // it as attempt 3.
    expect(state.outbox[0].status).toBe("sent");
    expect(state.outbox[0].attempt_count).toBe(3);
    expect(state.attempts.some((a) => a.attempt === 2 && a.outcome === "failed")).toBe(true);
  });

  it("an unknown object shape from a sender is a failure, never sent", async () => {
    emails.sendApplicationReceived.mockImplementationOnce(async () => ({ id: "looks-plausible" }) as any); // no ok:true
    await enqueueNotification(job());
    const result = await runOutboxTick(new Date());
    expect(result.sent).toBe(0);
    expect(result.retried).toBe(1);
    expect(state.outbox[0].status).toBe("failed_retryable");
    expect(state.outbox[0].provider_message_id ?? null).toBeNull();
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

  it("keeps status-token purpose while refusing obsolete paid approval mail", async () => {
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
    expect(emails.sendApplicationApproved).not.toHaveBeenCalled();
    expect(state.outbox.find((row) => row.template_key === "applicant_approved").status).toBe("failed_permanent");
  });

  it("a legacy paid approval job is recorded as retired without sending", async () => {
    await enqueueNotification(
      job({
        eventKey: `approved:${crypto.randomUUID()}`,
        templateKey: "applicant_approved",
        payload: { firstName: "Jordan", approvalExpiresAt: new Date().toISOString() }, // pre-purpose payload shape
      }),
    );
    await runOutboxTick(new Date());
    expect(emails.sendApplicationApproved).not.toHaveBeenCalled();
    expect(state.outbox[0].status).toBe("failed_permanent");
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

describe("customer notices recorded by the request workflow", () => {
  const RECEIVED = CUSTOMER_NOTICE_TEMPLATES.request_received_queued;
  const settings = {
    EA_REQUEST_CUSTOMER_NOTICE_ENABLED: "true",
    EA_REQUEST_CUSTOMER_NOTICE_START_AT: "2026-11-18T02:00:00Z",
    RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "ea-staging",
    RESEND_API_KEY: "synthetic-test-only",
  };
  const withSettings = async (run: () => Promise<void>) => {
    Object.assign(process.env, settings);
    try { await run(); } finally { for (const key of Object.keys(settings)) delete process.env[key]; }
  };
  function customerJob(recordedAt: Date, kind: keyof typeof CUSTOMER_NOTICE_TEMPLATES = "request_received_queued") {
    const reference = "XRI-" + crypto.randomUUID().replace(/-/g, "").toUpperCase();
    const template = CUSTOMER_NOTICE_TEMPLATES[kind];
    return {
      id: crypto.randomUUID(), event_key: "ea-request-customer-" + crypto.randomUUID(),
      event_type: template, template_key: template,
      recipient: "customer:" + reference, status: "pending", attempt_count: 0,
      next_attempt_at: new Date(0).toISOString(), created_at: recordedAt.toISOString(), last_attempt_at: null,
      payload: { reference, eventAt: recordedAt.toISOString(), kind, revision: kind === "request_reviewing" ? 2 : 1,
        environment: "ea-staging" },
    };
  }
  // The binding function returns the first digest bound; here that is always the one offered.
  const answerDelivery = (address: unknown, superseded = false) => supabaseRpc.mockImplementation(async (name: unknown, args: any) =>
    ({ data: name === "request_intent_customer_notice_delivery" ? { address, superseded }
      : name === "request_intent_customer_notice_bind" ? args.p_digest : 0, error: null }) as any);
  const alerts = () => state.outbox.filter((row) => row.template_key === "admin_email_failure");

  it("is off by default: recorded notices wait unsent and unclaimed, and other mail still flows past them", async () => {
    const now = new Date();
    for (let index = 0; index < 20; index++) {
      state.outbox.push(customerJob(now, index % 2 ? "request_reviewing" : "request_received_queued"));
    }
    await enqueueNotification(job());
    await runOutboxTick(now);
    expect(supabaseRpc).not.toHaveBeenCalled();
    expect(resend.send).not.toHaveBeenCalled();
    expect(state.outbox.filter((row) => String(row.event_key).startsWith("ea-request-customer-"))
      .every((row) => row.status === "pending" && row.attempt_count === 0 && row.last_attempt_at === null)).toBe(true);
    expect(state.outbox.find((row) => row.template_key === "applicant_received")?.status).toBe("sent");
  });

  it("sends each recorded notice once, reading the address for that event and queueing nothing itself", async () => {
    await withSettings(async () => {
      const now = new Date();
      state.outbox.push(customerJob(now));
      const queued = state.outbox[0];
      answerDelivery("avery@example.invalid");
      await runOutboxTick(now);
      // No reconciliation call: the workflow records the notice, the worker only sends it.
      expect(supabaseRpc.mock.calls).toEqual([
        ["request_intent_customer_notice_delivery", { p_event_key: queued.event_key }],
        ["request_intent_customer_notice_bind", { p_event_key: queued.event_key, p_digest: expect.stringMatching(/^[0-9a-f]{64}$/) }],
      ]);
      expect(resend.send).toHaveBeenCalledTimes(1);
      const [message, options] = resend.send.mock.calls[0] as unknown as [Record<string, string>, unknown];
      expect(message).toMatchObject({
        from: "Xenios Research <research@xeniostechnology.com>", to: "avery@example.invalid",
        subject: "Your request is in the review queue · " + queued.payload.reference,
      });
      expect(message).not.toHaveProperty("replyTo");
      expect(message.text).toContain(queued.payload.reference);
      expect(options).toEqual({ idempotencyKey: queued.event_key });
      expect(queued).toMatchObject({ status: "sent", attempt_count: 1, provider_message_id: "resend-product-id" });
      // The address was used for the send and is stored nowhere in the outbox.
      expect(JSON.stringify([state.outbox, state.attempts])).not.toContain("avery@");

      // A later pass has nothing left to send for this event.
      await runOutboxTick(new Date(now.getTime() + 60_000));
      expect(resend.send).toHaveBeenCalledTimes(1);
    });
  });

  it("cancels, with no alert, a notice recorded before the sender's start time or replaced by a later event", async () => {
    await withSettings(async () => {
      const now = new Date();
      state.outbox.push(customerJob(new Date("2026-11-18T01:59:59Z")));
      state.outbox.push(customerJob(now));
      answerDelivery("avery@example.invalid", true);
      await runOutboxTick(now);
      expect(resend.send).not.toHaveBeenCalled();
      expect(state.outbox[0]).toMatchObject({ status: "cancelled", last_error_summary: CUSTOMER_NOTICE_BEFORE_START });
      expect(state.outbox[1]).toMatchObject({ status: "cancelled", last_error_summary: "Not sent: a later update replaced this one." });
      expect(alerts()).toHaveLength(0);
      // A cancelled notice is never picked up again.
      await runOutboxTick(new Date(now.getTime() + 60_000));
      expect(resend.send).not.toHaveBeenCalled();
      expect(state.attempts).toHaveLength(2);
    });
  });

  it("holds a late notice for staff instead of sending it, and the alert names no customer", async () => {
    await withSettings(async () => {
      const now = new Date();
      state.outbox.push(customerJob(new Date(now.getTime() - CUSTOMER_NOTICE_SEND_LIMIT_MS - 60_000)));
      // The start time is before the job, so only the age rule applies.
      process.env.EA_REQUEST_CUSTOMER_NOTICE_START_AT = new Date(now.getTime() - 2 * CUSTOMER_NOTICE_SEND_LIMIT_MS).toISOString();
      answerDelivery("avery@example.invalid");
      await runOutboxTick(now);
      expect(resend.send).not.toHaveBeenCalled();
      expect(state.outbox[0]).toMatchObject({ status: "failed_permanent", attempt_count: 1 });
      expect(state.outbox[0].last_error_summary).toContain("more than 23 hours ago");
      expect(alerts().length).toBeGreaterThan(0);
      for (const alert of alerts()) {
        expect(alert.payload).toMatchObject({ failedTemplate: RECEIVED, failedRecipient: state.outbox[0].recipient });
        expect(JSON.stringify(alert)).not.toContain("avery@");
      }
    });
  });

  it("retries on the next pass when the delivery read fails, sending nothing meanwhile", async () => {
    await withSettings(async () => {
      const now = new Date();
      state.outbox.push(customerJob(now));
      supabaseRpc.mockImplementation(async (name: unknown) => name === "request_intent_customer_notice_delivery"
        ? { data: null, error: { code: "57014" } } : { data: 0, error: null } as any);
      await runOutboxTick(now);
      expect(resend.send).not.toHaveBeenCalled();
      expect(state.outbox[0]).toMatchObject({
        status: "failed_retryable", attempt_count: 1,
        last_error_summary: "Customer notice delivery facts were unavailable.",
      });
      answerDelivery("avery@example.invalid");
      state.outbox[0].next_attempt_at = new Date(0).toISOString();
      await runOutboxTick(new Date(now.getTime() + 60_000));
      expect(resend.send).toHaveBeenCalledTimes(1);
      expect(state.outbox[0]).toMatchObject({ status: "sent", attempt_count: 2 });
    });
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
