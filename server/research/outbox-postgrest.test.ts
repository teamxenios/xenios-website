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

import express from "express";
import request from "supertest";
import {
  FIXTURE_MAIL_GUARD_PROTOCOL,
  FIXTURE_MAIL_GUARD_STATUS_RPC,
  ORDINARY_MAIL_DISPOSITION,
  outboxMailEligibility,
  readMailGuardStatus,
  registerOutboxAdmin,
  runOutboxTick,
  type MailGuardState,
} from "./outbox";
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
const GUARD_PATH = "/rest/v1/rpc/" + FIXTURE_MAIL_GUARD_STATUS_RPC;
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
  // Runs after a read is answered: a designation landing before the next write.
  afterRead: undefined as undefined | ((kind: "due" | "stale" | "id") => void),
  // Rows the admin retry route reads by id; kept apart from the due batch.
  byId: [] as any[],
  // The guard status reply. Unset is the legacy schema: the function is missing.
  guard: undefined as undefined | "throw" | { status: number; body: unknown },
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
  if (url.pathname === GUARD_PATH && method === "POST") {
    if (wire.guard === "throw") throw new TypeError("fetch failed");
    const guard = wire.guard ?? {
      status: 404,
      body: { code: "PGRST202", details: null, hint: null, message: "Could not find the function in the schema cache" },
    };
    return reply(guard.status, guard.body);
  }
  // The no-mail filter, evaluated the way PostgREST would on the installed schema.
  const disposition = url.searchParams.get("mail_disposition");
  const byDisposition = (rows: any[]) =>
    disposition === "eq.ordinary" ? rows.filter((row) => row.mail_disposition === "ordinary")
      // SQL `<>` is never true for NULL, so PostgREST's neq leaves null rows out.
      : disposition === "neq.ordinary" ? rows.filter((row) => row.mail_disposition != null && row.mail_disposition !== "ordinary")
        : rows;
  if (url.pathname === OUTBOX_PATH && method === "HEAD") {
    return new Response(null, { status: 200, headers: { "content-range": `*/${byDisposition(wire.due).length}` } });
  }
  if (url.pathname === OUTBOX_PATH && method === "GET" && url.searchParams.has("id")) {
    const response = reply(200, wire.byId.filter((row) => "eq." + row.id === url.searchParams.get("id")));
    wire.afterRead?.("id");
    return response;
  }
  if (url.pathname === OUTBOX_PATH && method === "GET") {
    const served = byDisposition(status === "eq.processing" ? wire.stale : wire.due);
    const response = reply(200, served);
    wire.afterRead?.(status === "eq.processing" ? "stale" : "due");
    return response;
  }
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && url.searchParams.has("updated_at")) {
    const row = wire.stale.find((job) => "eq." + job.id === url.searchParams.get("id"));
    const designated = disposition === "eq.ordinary" && row?.mail_disposition !== "ordinary";
    return reply(200, wire.reclaimWins && !designated ? [{ id: url.searchParams.get("id")?.slice(3) }] : []);
  }
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && url.searchParams.has("last_attempt_at")) {
    return reply(200, wire.completionWins ? [{ id: url.searchParams.get("id")?.slice(3) }] : []);
  }
  if (url.pathname === OUTBOX_PATH && method === "PATCH" && status) {
    const row = [...wire.due, ...wire.byId].find((job) => "eq." + job.id === url.searchParams.get("id"));
    const designated = disposition === "eq.ordinary" && row?.mail_disposition !== "ordinary";
    return wire.claimWins && row && !designated
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
// Every pass first reads the no-mail guard status.
const guardRead = { method: "POST", path: GUARD_PATH, params: [], body: {} };
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
    wire.afterRead = undefined;
    wire.byId = [];
    wire.guard = undefined;
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
      guardRead, staleRead,
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
    const [, , , claimRequest] = wire.requests;
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
      guardRead, staleRead,
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
      guardRead, staleRead, reclaim,
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
    expect(wire.requests.map(shape)).toEqual([guardRead, staleRead, reclaim, dueRead(excluded)]);
  });

  it("leaves customer notices out of the due request itself while their sender is off", async () => {
    delete process.env.EA_REQUEST_CUSTOMER_NOTICE_ENABLED;
    try {
      wire.due = [];
      const result = await runOutboxTick(NOW);
      expect(result).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(wire.requests.map(shape)).toEqual([
        guardRead, staleRead,
        dueRead([REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE, ...CUSTOMER_NOTICE_TEMPLATE_KEYS]),
      ]);
    } finally {
      process.env.EA_REQUEST_CUSTOMER_NOTICE_ENABLED = "true";
    }
  });

  // -------------------------------------------------------------------------
  // The no-mail guard. Every pass first reads the database's guard status. Only
  // the exact protocol with ready:true enables the installed path; a status
  // reported missing is legacy only while no row shows the column; anything
  // else withholds the whole pass. The cases above run on the proven legacy
  // schema (status missing, rows without the column) and keep their requests.
  // -------------------------------------------------------------------------
  const EXCLUDED = [REQUEST_SUBMITTED_STAFF_TEMPLATE, REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE];
  const READY = { status: 200, body: { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: true } };
  const ordinaryJob = (): any => ({
    ...customerJob(), mail_disposition: ORDINARY_MAIL_DISPOSITION, fixture_control_id: null, fixture_request_id: null,
  });
  const designatedJob = (): any => ({
    ...customerJob(), mail_disposition: "fixture_no_mail",
    fixture_control_id: crypto.randomUUID(), fixture_request_id: crypto.randomUUID(),
  });
  // The same read with the ordinary filter added just before its limit.
  const ordinaryOnly = (read: { params: string[][] }) => ({
    ...read, params: [...read.params.slice(0, -1), ["mail_disposition", "eq.ordinary"], read.params[read.params.length - 1]],
  });
  const withheldCount = (excluded: readonly string[]) => ({
    method: "HEAD", path: OUTBOX_PATH, body: null,
    params: [
      ["select", "id"], ["status", "in.(pending,failed_retryable)"], ["next_attempt_at", "lte." + NOW.toISOString()],
      ...excluded.map((template) => ["template_key", "neq." + template]), ["mail_disposition", "neq.ordinary"],
    ],
  });
  const ordinaryClaim = (job: { id: string; status: string }) => ({
    ...claim(job),
    params: [["id", "eq." + job.id], ["status", "eq." + job.status], ["mail_disposition", "eq.ordinary"], ["select", "*"]],
  });
  const writes = () => wire.requests.filter((sent) => sent.method !== "GET" && sent.method !== "HEAD" && sent.path !== GUARD_PATH);
  const byIdRead = (job: { id: string }) => ({
    method: "GET", path: OUTBOX_PATH, body: null, params: [["select", "*"], ["id", "eq." + job.id]],
  });
  const adminApp = () => {
    const app = express();
    app.use(express.json());
    registerOutboxAdmin(app);
    return app;
  };

  it("reads the guard status as ready only for the exact protocol with ready:true", async () => {
    const replies: Array<[string, number, unknown, MailGuardState]> = [
      ["ready", 200, { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: true }, "ready"],
      ["not ready", 200, { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: false }, "withheld"],
      ["ready as a string", 200, { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: "true" }, "withheld"],
      ["wrong protocol", 200, { protocol: "request-intent/fixture-no-mail/v2", ready: true }, "withheld"],
      ["no protocol", 200, { ready: true }, "withheld"],
      ["an array", 200, [{ protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: true }], "withheld"],
      ["null", 200, null, "withheld"],
      ["server error", 500, { code: "XX000", message: "internal" }, "withheld"],
      ["permission denied", 403, { code: "42501", message: "permission denied" }, "withheld"],
      ["another not-found code", 404, { code: "PGRST205", message: "table not found" }, "withheld"],
      ["status function missing", 404, { code: "PGRST202", message: "Could not find the function" }, "legacy"],
      ["status function undefined in SQL", 400, { code: "42883", message: "function does not exist" }, "legacy"],
      ["network failure", 0, "throw", "withheld"],
    ];
    for (const [label, status, body, expected] of replies) {
      wire.guard = body === "throw" ? "throw" : { status, body };
      expect([label, await readMailGuardStatus()]).toEqual([label, expected]);
    }
  });

  it("withholds the whole pass when the guard is not ready, malformed or unavailable", async () => {
    wire.due = [ordinaryJob()];
    wire.stale = [{ ...ordinaryJob(), status: "processing", updated_at: "2026-11-19T00:30:00.123456+00:00" }];
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const guard of [
        { status: 200, body: { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: false } },
        { status: 200, body: { protocol: "request-intent/fixture-no-mail/v2", ready: true } },
        { status: 503, body: { code: "PGRST001", message: "unavailable" } },
        "throw" as const,
      ]) {
        wire.requests = [];
        wire.guard = guard;
        // Nothing is reconciled, reclaimed, claimed, attempted, sent or counted.
        expect(await runOutboxTick(NOW)).toEqual({ sent: 0, retried: 0, failed: 0 });
        expect(wire.requests.map(shape)).toEqual([guardRead]);
      }
      expect(logged).toHaveBeenCalledWith("[outbox] no-mail guard status not ready or unavailable; this pass sends nothing");
    } finally {
      logged.mockRestore();
    }
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("withholds when the status is missing but a row shows the column: a partial install is not legacy", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      // The due read shows the column.
      wire.due = [ordinaryJob()];
      expect(await runOutboxTick(NOW)).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(wire.requests.map(shape)).toEqual([guardRead, staleRead, dueRead(EXCLUDED)]);

      // The stale read shows it: the pass stops before the due read.
      wire.requests = [];
      wire.due = [];
      wire.stale = [{ ...ordinaryJob(), status: "processing", updated_at: "2026-11-19T00:30:00.123456+00:00" }];
      expect(await runOutboxTick(NOW)).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(wire.requests.map(shape)).toEqual([guardRead, staleRead]);
      expect(logged).toHaveBeenCalledWith(
        "[outbox] no-mail column present without its guard status; partial install, this pass sends nothing");
    } finally {
      logged.mockRestore();
    }
    expect(writes()).toEqual([]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("claims only ordinary mail when the guard is ready, and counts the designated job without writing to it", async () => {
    wire.guard = READY;
    const held = designatedJob();
    const job = ordinaryJob();
    wire.due = [held, job];
    const result = await runOutboxTick(NOW);

    expect(result).toEqual({ sent: 1, retried: 0, failed: 0, withheld: 1 });
    expect(wire.requests.map(shape)).toEqual([
      guardRead,
      ordinaryOnly(staleRead),
      // The ordinary filter is in the first due read, before its limit: held
      // jobs never take real mail's places in the batch.
      ordinaryOnly(dueRead(EXCLUDED)),
      withheldCount(EXCLUDED),
      ordinaryClaim(job),
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
    // An exact count, as a head request: no rows come back, none are capped by the batch.
    expect(wire.requests[3].headers.prefer).toContain("count=exact");
    // No claim, attempt row, RPC or completion names the designated job.
    expect(JSON.stringify(writes())).not.toContain(held.id);
    expect(JSON.stringify(writes())).not.toContain(held.event_key);
    expect(resend.send).toHaveBeenCalledTimes(1);
    expect(resend.send.mock.calls[0][1]).toEqual({ idempotencyKey: job.event_key });
  });

  it("claims nothing when every due row is designated, null or an unknown value", async () => {
    wire.guard = READY;
    const rows = [designatedJob(), { ...ordinaryJob(), mail_disposition: null }, { ...ordinaryJob(), mail_disposition: "Ordinary" }];
    wire.due = rows;
    const result = await runOutboxTick(NOW);

    // Only exactly "ordinary" may claim: nothing unknown falls back to ordinary.
    for (const row of rows) expect(outboxMailEligibility(row)).toBe("withheld");
    // A missing key is legacy only before the install; on it, it is withheld.
    expect(outboxMailEligibility(customerJob())).toBe("legacy");
    expect(outboxMailEligibility(customerJob(), true)).toBe("withheld");
    // The count follows SQL: `neq` is never true for NULL. The column is NOT NULL,
    // so a null row cannot exist there; here it is still never claimed.
    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, withheld: 2 });
    expect(wire.requests.map(shape)).toEqual([
      guardRead, ordinaryOnly(staleRead), ordinaryOnly(dueRead(EXCLUDED)), withheldCount(EXCLUDED),
    ]);
    expect(writes()).toEqual([]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("stops at the claim when a designation lands between the read and the claim", async () => {
    wire.guard = READY;
    const job = ordinaryJob();
    wire.due = [job];
    wire.afterRead = (kind) => { if (kind === "due") job.mail_disposition = "fixture_no_mail"; };
    const result = await runOutboxTick(NOW);

    // The guarded claim is the fence before any ledger write: it matches no row,
    // so there is no processing state, delivery read, attempt row, send or
    // completion. Nothing after the claim is relied on to hold the job back.
    expect(result).toEqual({ sent: 0, retried: 0, failed: 0, withheld: 1 });
    expect(wire.requests.map(shape)).toEqual([
      guardRead, ordinaryOnly(staleRead), ordinaryOnly(dueRead(EXCLUDED)), withheldCount(EXCLUDED), ordinaryClaim(job),
    ]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("reclaims only an ordinary stale claim, and leaves a designated one with its real claim evidence", async () => {
    wire.guard = READY;
    const updatedAt = "2026-11-19T00:30:00.123456+00:00";
    const held = { ...designatedJob(), status: "processing", updated_at: updatedAt };
    const job = { ...ordinaryJob(), status: "processing", updated_at: updatedAt };
    const reclaim = {
      method: "PATCH", path: OUTBOX_PATH,
      params: [
        ["id", "eq." + job.id], ["status", "eq.processing"], ["updated_at", "eq." + updatedAt],
        ["mail_disposition", "eq.ordinary"], ["select", "id"],
      ],
      body: {
        status: "failed_retryable", attempt_count: 1, next_attempt_at: NOW.toISOString(), last_attempt_at: NOW.toISOString(),
        completed_at: null, last_error_summary: "reclaimed after stale processing claim (crashed mid-send)",
        updated_at: NOW.toISOString(),
      },
    };
    const tail = [ordinaryOnly(dueRead(EXCLUDED)), withheldCount(EXCLUDED)];

    wire.stale = [held, job];
    expect(await runOutboxTick(NOW)).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(wire.requests.map(shape)).toEqual([
      guardRead, ordinaryOnly(staleRead), reclaim,
      {
        method: "POST", path: ATTEMPTS_PATH, params: [],
        body: { outbox_id: job.id, attempt: 1, outcome: "failed", error_summary: "stale processing reclaim (crashed mid-send)" },
      },
      ...tail,
    ]);
    expect(JSON.stringify(writes())).not.toContain(held.id);

    // A designation that lands after the stale read: the guarded reclaim
    // matches no row, so there is no attempt row.
    wire.requests = [];
    wire.stale = [job];
    wire.afterRead = (kind) => { if (kind === "stale") job.mail_disposition = "fixture_no_mail"; };
    await runOutboxTick(NOW);
    expect(wire.requests.map(shape)).toEqual([guardRead, ordinaryOnly(staleRead), reclaim, ...tail]);
  });

  it("refuses an admin requeue before its row read unless the guard is ready or proven legacy", async () => {
    const app = adminApp();
    const job = { ...ordinaryJob(), status: "failed_permanent", attempt_count: 5 };
    wire.byId = [job];
    const unavailable = {
      ok: false, code: "mail_guard_unavailable", message: "Messages cannot be requeued until the no-mail guard is ready.",
    };

    wire.guard = { status: 200, body: { protocol: FIXTURE_MAIL_GUARD_PROTOCOL, ready: false } };
    const notReady = await request(app).post(`/api/admin/research/outbox/${job.id}/retry`);
    expect([notReady.status, notReady.body]).toEqual([503, unavailable]);
    expect(wire.requests.map(shape)).toEqual([guardRead]);

    // Status missing but the row shows the column: a partial install.
    wire.requests = [];
    wire.guard = undefined;
    const partial = await request(app).post(`/api/admin/research/outbox/${job.id}/retry`);
    expect([partial.status, partial.body]).toEqual([503, unavailable]);
    expect(wire.requests.map(shape)).toEqual([guardRead, byIdRead(job)]);
    expect(resend.send).not.toHaveBeenCalled();
  });

  it("refuses an admin requeue of a designated job before any write, and guards an ordinary requeue", async () => {
    const app = adminApp();
    wire.guard = READY;

    const held = { ...designatedJob(), status: "failed_permanent", attempt_count: 5 };
    wire.byId = [held];
    const refused = await request(app).post(`/api/admin/research/outbox/${held.id}/retry`);
    expect(refused.status).toBe(409);
    expect(refused.body).toEqual({
      ok: false, code: "mail_withheld", message: "This message is held by a no-mail designation and cannot be requeued.",
    });
    // Only the reads: no reset, no manual-requeue attempt row, no worker pass.
    expect(wire.requests.map(shape)).toEqual([guardRead, byIdRead(held)]);

    // An ordinary job is requeued with the same guard on its update.
    wire.requests = [];
    const job = { ...ordinaryJob(), status: "failed_permanent", attempt_count: 5 };
    wire.byId = [job];
    const requeued = await request(app).post(`/api/admin/research/outbox/${job.id}/retry`);
    expect(requeued.status).toBe(200);
    const [status, read, requeue, recorded] = wire.requests;
    expect(shape(status)).toEqual(guardRead);
    expect(shape(read)).toEqual(byIdRead(job));
    expect(requeue.method).toBe("PATCH");
    expect(requeue.params).toEqual([
      ["id", "eq." + job.id], ["status", "eq.failed_permanent"], ["mail_disposition", "eq.ordinary"], ["select", "*"],
    ]);
    expect(recorded).toMatchObject({ method: "POST", path: ATTEMPTS_PATH, body: { outbox_id: job.id, attempt: 0, outcome: "manual-requeue" } });

    // A designation that lands after the read: the guarded update matches no
    // row and nothing is recorded.
    wire.requests = [];
    const late = { ...ordinaryJob(), status: "failed_permanent", attempt_count: 5 };
    wire.byId = [late];
    wire.afterRead = (kind) => { if (kind === "id") late.mail_disposition = "fixture_no_mail"; };
    const raced = await request(app).post(`/api/admin/research/outbox/${late.id}/retry`);
    expect(raced.status).toBe(409);
    expect(wire.requests.map((sent) => sent.method)).toEqual(["POST", "GET", "PATCH"]);
    expect(resend.send).not.toHaveBeenCalled();
  });
});
