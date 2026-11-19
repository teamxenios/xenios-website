import crypto from "crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// The outbox worker's database calls, as they leave the process.
//
// outbox.test.ts replaces the Supabase client with an in-memory query builder,
// and the journey PG case reproduces the worker's filters in SQL. Neither shows
// what the real client sends. Here the real worker runs through the real admin
// client (server/supabase.ts, real supabase-js), and only `fetch` is replaced.
// Every request is recorded and asserted exactly.
//
// The answers are scripted in PostgREST's documented response forms, including
// 406 PGRST116 when a single-object update matches no row. No PostgREST server
// runs, so the server's own filter evaluation is not tested here; the journey
// PG case covers the same filters against the real schema.
// ---------------------------------------------------------------------------

const resend = vi.hoisted(() => ({
  send: vi.fn(async (..._args: unknown[]) => ({ data: { id: "provider-synthetic-1" }, error: null })),
}));

vi.mock("../routes", () => ({ requireSupabaseAdmin: (_r: any, _s: any, next: any) => next() }));
vi.mock("./membership-emails", () => {
  const unused = () => { throw new Error("not used in this test"); };
  return {
    sendApplicationReceived: unused, sendStatusLink: unused, sendInternalApplicationAlert: unused,
    sendApplicationApproved: unused, sendApplicationDeclined: unused, sendMoreInformationRequested: unused,
    sendResubmittedConfirmation: unused, sendAccountClaimSuccess: unused, sendApprovedCustomerClaim: unused,
    sendApprovedCustomerWelcome: unused, sendB2BBuyerClaim: unused, sendEmailFailureAlert: unused, sendAdminTestEmail: unused,
  };
});
vi.mock("../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send: resend.send } }, fromEmail: "notices@example.invalid" }),
}));

import { runOutboxTick } from "./outbox";
import { outboxAttemptRow, outboxClaimFields, outboxCompletionFields, outboxCompletionGuard } from "./outbox-writes";
import {
  CUSTOMER_NOTICE_BIND_RPC,
  CUSTOMER_NOTICE_DELIVERY_RPC,
  CUSTOMER_NOTICE_TEMPLATES,
  CUSTOMER_NOTICE_TEMPLATE_KEYS,
} from "./assisted-order/request-intent/customer-notice";
import {
  REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
} from "./assisted-order/request-intent/staff-notice";

const ORIGIN = "https://fixture.supabase.invalid";
const KEY = "synthetic-service-key-test-only";
const OUTBOX_PATH = "/rest/v1/research_notification_outbox";
const ATTEMPTS_PATH = "/rest/v1/research_notification_attempts";
const ADDRESS = "avery@example.invalid";
const NOW = new Date("2026-11-19T01:00:00.000Z");

const settings: Record<string, string | undefined> = {
  SUPABASE_URL: ORIGIN,
  SUPABASE_SERVICE_ROLE_KEY: KEY,
  RESEARCH_SESSION_SECRET: "test-secret-for-vitest",
  EA_REQUEST_CUSTOMER_NOTICE_ENABLED: "true",
  EA_REQUEST_CUSTOMER_NOTICE_START_AT: "2026-11-18T02:00:00Z",
  RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: "ea-staging",
  RESEND_API_KEY: "synthetic-test-only",
  // Staff notices stay off, so the tick makes no reconciliation call.
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: undefined,
  RESEARCH_EMAIL_FROM: undefined,
};
const saved: Record<string, string | undefined> = {};

type Wire = { method: string; path: string; params: Array<[string, string]>; headers: Record<string, string>; body: unknown };
const wire = {
  requests: [] as Wire[],
  due: [] as any[],
  claimWins: true,
  completionWins: true,
  stale: [] as any[],
  reclaimWins: true,
};

function reply(status: number, body?: unknown): Response {
  return body === undefined
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

async function postgrest(input: unknown, init: RequestInit = {}): Promise<Response> {
  const url = new URL(String(input instanceof Request ? input.url : input));
  const method = (init.method ?? "GET").toUpperCase();
  const headers = Object.fromEntries(new Headers(init.headers).entries());
  const body = typeof init.body === "string" && init.body !== "" ? JSON.parse(init.body) : null;
  // The admin client checks its own key once, through the auth API. That call
  // is answered but is not one of the worker's requests.
  if (url.pathname.startsWith("/auth/")) return reply(200, { users: [], aud: "authenticated" });
  wire.requests.push({ method, path: url.pathname, params: [...url.searchParams.entries()], headers, body });
  const status = url.searchParams.get("status");
  if (url.origin !== ORIGIN) return reply(404, { code: "PGRST000", message: "unexpected origin" });
  if (url.pathname === OUTBOX_PATH && method === "GET") return reply(200, status === "eq.processing" ? wire.stale : wire.due);
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && url.searchParams.has("updated_at")) {
    return reply(200, wire.reclaimWins ? [{ id: url.searchParams.get("id")?.slice(3) }] : []);
  }
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && url.searchParams.has("last_attempt_at")) {
    return reply(200, wire.completionWins ? [{ id: url.searchParams.get("id")?.slice(3) }] : []);
  }
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && status) {
    const row = wire.due.find((job) => "eq." + job.id === url.searchParams.get("id"));
    return wire.claimWins && row
      ? reply(200, { ...row, ...(body as object) })
      : reply(406, {
        code: "PGRST116", details: "The result contains 0 rows", hint: null,
        message: "JSON object requested, multiple (or no) rows returned",
      });
  }
  if (url.pathname === ATTEMPTS_PATH && method === "POST") return reply(201);
  if (url.pathname === "/rest/v1/rpc/" + CUSTOMER_NOTICE_DELIVERY_RPC) return reply(200, { address: ADDRESS, superseded: false });
  if (url.pathname === "/rest/v1/rpc/" + CUSTOMER_NOTICE_BIND_RPC) return reply(200, (body as { p_digest: string }).p_digest);
  return reply(404, { code: "PGRST205", message: "unexpected request in this test" });
}

function customerJob() {
  const recordedAt = new Date(NOW.getTime() - 60_000).toISOString();
  const reference = "XRI-" + crypto.randomUUID().replace(/-/g, "").toUpperCase();
  const template = CUSTOMER_NOTICE_TEMPLATES.request_received_queued;
  return {
    id: crypto.randomUUID(), event_key: "ea-request-customer-" + crypto.randomUUID(),
    event_type: template, template_key: template, recipient: "customer:" + reference,
    status: "pending", attempt_count: 0, next_attempt_at: recordedAt, created_at: recordedAt,
    updated_at: recordedAt, last_attempt_at: null, completed_at: null, provider_message_id: null,
    payload: { reference, eventAt: recordedAt, kind: "request_received_queued", revision: 1, environment: "ea-staging" },
  };
}

const shape = ({ method, path, params, body }: Wire) => ({ method, path, params, body });
const staleRead = {
  method: "GET", path: OUTBOX_PATH, body: null,
  params: [
    ["select", "*"], ["status", "eq.processing"],
    ["updated_at", "lt." + new Date(NOW.getTime() - 15 * 60 * 1000).toISOString()], ["limit", "20"],
  ],
};
const dueRead = (excluded: readonly string[]) => ({
  method: "GET", path: OUTBOX_PATH, body: null,
  params: [
    ["select", "*"], ["status", "in.(pending,failed_retryable)"], ["next_attempt_at", "lte." + NOW.toISOString()],
    ...excluded.map((template) => ["template_key", "neq." + template]), ["limit", "20"],
  ],
});
// The completion writes only while this tick's own claim still holds the row.
const completion = (job: { id: string }, body: unknown) => ({
  method: "PATCH", path: OUTBOX_PATH, body,
  params: [
    ["id", "eq." + job.id], ["status", "eq." + outboxCompletionGuard(NOW).status],
    ["last_attempt_at", "eq." + outboxCompletionGuard(NOW).last_attempt_at], ["select", "id"],
  ],
});
const claim = (job: { id: string; status: string }) => ({
  method: "PATCH", path: OUTBOX_PATH, body: outboxClaimFields(NOW),
  params: [["id", "eq." + job.id], ["status", "eq." + job.status], ["select", "*"]],
});

describe("outbox worker requests through the real Supabase client", () => {
  beforeAll(() => {
    for (const [key, value] of Object.entries(settings)) {
      saved[key] = process.env[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  afterAll(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  beforeEach(() => {
    wire.requests = [];
    wire.due = [];
    wire.claimWins = true;
    wire.completionWins = true;
    wire.stale = [];
    wire.reclaimWins = true;
    resend.send.mockClear();
    vi.stubGlobal("fetch", vi.fn(postgrest));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("claims, reads, binds, records and completes one customer notice with exactly these requests", async () => {
    const job = customerJob();
    wire.due = [job];
    const result = await runOutboxTick(NOW);

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(wire.requests.map(shape)).toEqual([
      staleRead,
      // Customer notices are on, so only the two paused staff templates are left out.
      dueRead([REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE]),
      claim(job),
      { method: "POST", path: "/rest/v1/rpc/" + CUSTOMER_NOTICE_DELIVERY_RPC, params: [], body: { p_event_key: job.event_key } },
      {
        method: "POST", path: "/rest/v1/rpc/" + CUSTOMER_NOTICE_BIND_RPC, params: [],
        body: { p_event_key: job.event_key, p_digest: expect.stringMatching(/^[0-9a-f]{64}$/) },
      },
      {
        method: "POST", path: ATTEMPTS_PATH, params: [],
        body: outboxAttemptRow(job.id, 1, { ok: true, providerId: "provider-synthetic-1" }),
      },
      completion(job, outboxCompletionFields({ ok: true, providerId: "provider-synthetic-1" }, 1, NOW)),
    ]);

    // The claim asks for the one updated row back, so a lost race is visible.
    const [, , claimRequest] = wire.requests;
    expect(claimRequest.headers.prefer).toContain("return=representation");
    expect(claimRequest.headers.accept).toBe("application/vnd.pgrst.object+json");
    // Every request carries the service key the admin client was built with.
    for (const request of wire.requests) {
      expect(request.headers.apikey).toBe(KEY);
      expect(request.headers.authorization).toBe("Bearer " + KEY);
    }

    expect(resend.send).toHaveBeenCalledTimes(1);
    const [message, options] = resend.send.mock.calls[0] as unknown as [Record<string, string>, unknown];
    expect(message).toMatchObject({ from: "Xenios Research <research@xeniostechnology.com>", to: ADDRESS });
    expect(options).toEqual({ idempotencyKey: job.event_key });
    // The address came back in a reply. The worker never sends it to the database.
    expect(JSON.stringify(wire.requests)).not.toContain("avery@");
  });

  it("stops after a lost claim: no delivery read, no send, no attempt row and no completion", async () => {
    const job = customerJob();
    wire.due = [job];
    wire.claimWins = false;
    const result = await runOutboxTick(NOW);

    expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(wire.requests.map(shape)).toEqual([
      staleRead,
      dueRead([REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE]),
      claim(job),
    ]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("records nothing over a later claim when the job was reclaimed before its dispatch finished", async () => {
    const job = customerJob();
    wire.due = [job];
    wire.completionWins = false;
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await runOutboxTick(NOW);
      // Not counted here: the later claim owns the outcome, its count and any alert.
      expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(wire.requests.map(shape).at(-1)).toEqual(
        completion(job, outboxCompletionFields({ ok: true, providerId: "provider-synthetic-1" }, 1, NOW)));
      expect(wire.requests.filter((request) => request.method === "POST" && request.path === OUTBOX_PATH)).toEqual([]);
      expect(logged).toHaveBeenCalledWith("[outbox] completion not recorded: the job was reclaimed before its dispatch finished");
    } finally {
      logged.mockRestore();
    }
  });

  it("reclaims a stale claim only as it was read, and records its attempt only when it moved the job", async () => {
    const job = { ...customerJob(), status: "processing", updated_at: "2026-11-19T00:30:00.123456+00:00" };
    const reclaim = {
      method: "PATCH", path: OUTBOX_PATH,
      params: [["id", "eq." + job.id], ["status", "eq.processing"], ["updated_at", "eq." + job.updated_at], ["select", "id"]],
      body: {
        status: "failed_retryable", attempt_count: 1, next_attempt_at: NOW.toISOString(), last_attempt_at: NOW.toISOString(),
        completed_at: null, last_error_summary: "reclaimed after stale processing claim (crashed mid-send)",
        updated_at: NOW.toISOString(),
      },
    };
    const excluded = [REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE];

    wire.stale = [job];
    await runOutboxTick(NOW);
    expect(wire.requests.map(shape)).toEqual([
      staleRead, reclaim,
      {
        method: "POST", path: ATTEMPTS_PATH, params: [],
        body: { outbox_id: job.id, attempt: 1, outcome: "failed", error_summary: "stale processing reclaim (crashed mid-send)" },
      },
      dueRead(excluded),
    ]);

    // Another pass moved the job first: no second attempt row.
    wire.requests = [];
    wire.reclaimWins = false;
    await runOutboxTick(NOW);
    expect(wire.requests.map(shape)).toEqual([staleRead, reclaim, dueRead(excluded)]);
  });

  it("leaves customer notices out of the due request itself while their sender is off", async () => {
    delete process.env.EA_REQUEST_CUSTOMER_NOTICE_ENABLED;
    try {
      wire.due = [];
      const result = await runOutboxTick(NOW);
      expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(wire.requests.map(shape)).toEqual([
        staleRead,
        dueRead([REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE, ...CUSTOMER_NOTICE_TEMPLATE_KEYS]),
      ]);
    } finally {
      process.env.EA_REQUEST_CUSTOMER_NOTICE_ENABLED = "true";
    }
  });
});
