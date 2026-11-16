import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import request from "supertest";
import WebSocket from "ws";
import { expect, vi } from "vitest";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";

// A staff notice whose first send the provider accepted, but whose worker died
// before recording the outcome, is retried by hand through the real admin route
// against PostgreSQL 16 and PostgREST. Only the provider and the admin guard are
// stand-ins.

const state = vi.hoisted(() => ({
  admin: null as SupabaseClient | null,
  hang: false,
  calls: [] as Array<{ to: unknown; subject: unknown; text: unknown; html: unknown; key: unknown }>,
}));
const send = vi.hoisted(() => vi.fn(async (message: Record<string, unknown>, options?: { idempotencyKey?: string }) => {
  state.calls.push({ to: message.to, subject: message.subject, text: message.text, html: message.html, key: options?.idempotencyKey });
  // The provider accepts, then the worker dies before it records the outcome.
  if (state.hang) return new Promise<never>(() => {});
  return { data: { id: "provider-fixture-" + state.calls.length }, error: null };
}));
vi.mock("../../../supabase", () => ({
  getSupabaseAdmin: () => {
    if (!state.admin) throw new Error("Owned PostgREST client not ready");
    return state.admin;
  },
  supabaseConfigured: () => true,
}));
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({ client: { emails: { send } }, fromEmail: "notices@example.invalid" }),
}));
vi.mock("../../agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: vi.fn() }));
vi.mock("../../../routes", () => ({
  requireSupabaseAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../membership-emails", async (original) => ({
  ...(await original<typeof import("../../membership-emails")>()),
  sendEmailFailureAlert: vi.fn(async () => ({ ok: true, id: "alert-fixture" })),
}));

process.env.RESEARCH_SESSION_SECRET ??= "test-secret-for-vitest";

const { registerOutboxAdmin, runOutboxTick } = await import("../../outbox");

const POSTGREST = "postgrest/postgrest:v14.18@sha256:c7cd7e265a85b05248abf53f4473fcec7e327c282d0bd0cf60f1551996d09fcf";
const docker = (...args: string[]) => execFileSync("docker", args, {
  encoding: "utf8", windowsHide: true, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
}).trim();

function testToken(secret: string, claims: Record<string, string>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const body = encode({ alg: "HS256", typ: "JWT" }) + "." + encode(claims);
  return body + "." + createHmac("sha256", secret).update(body).digest("base64url");
}

async function openRest(name: string, network: string, dbName: string, password: string, secret: string) {
  docker("run", "--detach", "--rm", "--name", name, "--network", network,
    "--publish", "127.0.0.1::3000",
    "--env", "PGRST_DB_URI=postgres://fixture_rest:" + password + "@" + dbName + ":5432/request_intent_disposable",
    "--env", "PGRST_DB_SCHEMAS=public", "--env", "PGRST_DB_ANON_ROLE=anon", "--env", "PGRST_JWT_SECRET=" + secret, POSTGREST);
  const match = /^127\.0\.0\.1:(\d+)$/.exec(docker("port", name, "3000/tcp"));
  if (!match) throw new Error("PostgREST port was not confined to literal loopback");
  const origin = "http://127.0.0.1:" + match[1];
  // A loaded host can take well over half a minute to start the container.
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const ready = await fetch(origin, { signal: AbortSignal.timeout(1_000) });
      if (ready.ok) return origin;
    } catch { /* The fresh service may still be connecting to PostgreSQL. */ }
    await delay(250);
  }
  throw new Error("Owned PostgREST service did not become ready");
}

function restClient(origin: string, key: string): SupabaseClient {
  return createClient(origin, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as unknown as typeof globalThis.WebSocket },
    global: { fetch: (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/")) throw new Error("Unexpected fixture request");
      url.pathname = url.pathname.slice("/rest/v1".length);
      return fetch(url, init);
    } },
  });
}

const recipients = ["team@example.invalid", "samuel@example.invalid"];
const settings: Record<string, string> = {
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: recipients.join(","),
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-01-01T00:00:00Z",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL: "full",
  EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT: "2026-01-01T00:00:00Z",
  SITE_URL: "https://staff.example.invalid",
  RESEND_API_KEY: "synthetic-test-only",
  RESEARCH_NOTIFICATION_EMAILS: "alerts@example.invalid",
};

pg16It("a manual retry of a stale first claim never resends past the provider's window, and resends identically inside it", async () => {
  const db = createDurableJourneyFixture();
  const network = "xenios-notice-network-" + randomUUID();
  const rest = "xenios-notice-rest-" + randomUUID();
  const restPassword = randomUUID();
  const secret = randomUUID() + randomUUID();
  const saved = { ...process.env };
  let networkCreated = false;
  try {
    await db.start({ dockerOnly: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    await db.sql(readFileSync("supabase/candidates/request_intent_optional_context.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql", "utf8"));
    await db.sql([
      "GRANT SELECT, INSERT, UPDATE ON public.research_notification_outbox TO service_role;",
      "GRANT INSERT ON public.research_notification_attempts TO service_role;",
      "CREATE ROLE fixture_rest LOGIN NOINHERIT PASSWORD '" + restPassword + "';",
      "GRANT anon, authenticated, service_role TO fixture_rest WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
    ].join("\n"));

    // Three fictional requests: one lost first send, one never attempted, one retried inside the window.
    const { app: intake } = db.application(db.adapter().client);
    const names = ["Lost Response", "Never Attempted", "Inside Window"];
    for (const [index, name] of names.entries()) {
      const body = {
        ...submission(),
        idempotencyKey: `30000000-0000-4000-8000-00000000000${index + 1}`,
        contact: { ...submission().contact, fullLegalName: name, email: `fixture${index + 1}@example.invalid` },
      };
      expect((await db.post(intake, "", body, "a")).status).toBe(200);
    }
    const rows = await db.snapshot();
    const key = (name: string) => "ea-request-submitted-" + rows.find(row => row.contact.fullLegalName === name)!.id;
    const [lost, never, inside] = names.map(key);
    expect((await db.asRole("service_role",
      "select public.request_intent_enqueue_staff_notices($1::timestamptz, $2::text[], $3::timestamptz) as queued",
      [settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT, recipients, settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_DETAIL_START_AT],
    )).rows).toEqual([{ queued: 3 }]);
    const job = async (eventKey: string) => (await db.sql(
      "select id, status, attempt_count, last_attempt_at, last_error_summary, template_key from public.research_notification_outbox where event_key = $1",
      [eventKey])).rows[0];
    const outcomes = async (eventKey: string) => (await db.sql(
      "select a.outcome from public.research_notification_attempts a join public.research_notification_outbox o on o.id = a.outbox_id where o.event_key = $1 order by a.created_at",
      [eventKey])).rows.map(row => row.outcome);
    expect((await job(lost)).template_key).toBe("ea_request_submitted_staff_full_v1");

    // Queue time is moved back; only the job under test is due at each step.
    const real = Date.now();
    const lostCreated = new Date(real - 25 * 3_600_000);
    await db.sql("update public.research_notification_outbox set created_at = $2, next_attempt_at = $3 where event_key = $1",
      [lost, lostCreated, new Date(0)]);
    await db.sql("update public.research_notification_outbox set created_at = $2, next_attempt_at = $3 where event_key = $1",
      [never, lostCreated, new Date(real + 86_400_000)]);
    await db.sql("update public.research_notification_outbox set created_at = $2, next_attempt_at = $3 where event_key = $1",
      [inside, new Date(real - 2 * 3_600_000), new Date(real + 86_400_000)]);

    docker("network", "create", network);
    networkCreated = true;
    docker("network", "connect", network, db.ownedDockerContainer());
    const origin = await openRest(rest, network, db.ownedDockerContainer(), restPassword, secret);
    state.admin = restClient(origin, testToken(secret, { role: "service_role" }));
    Object.assign(process.env, settings);
    const admin = express();
    admin.use(express.json());
    registerOutboxAdmin(admin);

    // 1. The first claim, a minute after queueing: the provider accepts, the worker dies.
    const claimedAt = new Date(lostCreated.getTime() + 60_000);
    state.hang = true;
    void runOutboxTick(claimedAt);
    await vi.waitFor(() => expect(state.calls).toHaveLength(1), { timeout: 15_000, interval: 50 });
    state.hang = false;
    expect(state.calls[0].key).toBe(lost);
    expect(await job(lost)).toMatchObject({ status: "processing", attempt_count: 0 });
    // The claim itself is the durable evidence that a send may have happened.
    expect(new Date((await job(lost)).last_attempt_at).toISOString()).toBe(claimedAt.toISOString());
    expect(await outcomes(lost)).toEqual([]);

    // 2. A day later the operator retries it by hand. The never-attempted job is now due as well.
    await db.sql("update public.research_notification_outbox set next_attempt_at = $2 where event_key = $1", [never, new Date(0)]);
    const retry = await request(admin).post(`/api/admin/research/outbox/${(await job(lost)).id}/retry`);
    expect(retry.status).toBe(200);
    expect(retry.body.summary).toMatchObject({ sent: 1, failed: 1 });
    // The lost send is not repeated; the old but never-attempted job is sent once.
    expect(state.calls.map(call => call.key)).toEqual([lost, never]);
    expect(await job(lost)).toMatchObject({ status: "failed_permanent" });
    expect((await job(lost)).last_error_summary).toContain("24-hour duplicate check");
    expect(await outcomes(lost)).toEqual(["manual-requeue", "failed"]);
    expect(await job(never)).toMatchObject({ status: "sent", attempt_count: 1 });
    // Staff are told to open the request instead, and the alert names no customer.
    const alerts = (await db.sql(
      "select recipient, payload from public.research_notification_outbox where template_key = 'admin_email_failure'")).rows;
    expect(alerts).toEqual([{ recipient: "alerts@example.invalid", payload: {
      failedTemplate: "ea_request_submitted_staff_full_v1", failedRecipient: recipients[0],
      errorSummary: expect.stringContaining("24-hour duplicate check"),
    } }]);
    expect(JSON.stringify(alerts)).not.toMatch(/Lost Response|fixture1@|Synthetic/);

    // 3. A second manual retry of the refused job still sends nothing.
    expect((await request(admin).post(`/api/admin/research/outbox/${(await job(lost)).id}/retry`)).status).toBe(200);
    expect(state.calls.map(call => call.key)).toEqual([lost, never]);
    expect(await job(lost)).toMatchObject({ status: "failed_permanent" });

    // 4. Inside the window: a stale claim retried by hand is sent again under the same key with the same body.
    await db.sql("update public.research_notification_outbox set next_attempt_at = $2 where event_key = $1", [inside, new Date(0)]);
    state.hang = true;
    void runOutboxTick(new Date(real - 3_600_000));
    await vi.waitFor(() => expect(state.calls).toHaveLength(3), { timeout: 15_000, interval: 50 });
    state.hang = false;
    expect(await job(inside)).toMatchObject({ status: "processing" });
    expect((await request(admin).post(`/api/admin/research/outbox/${(await job(inside)).id}/retry`)).status).toBe(200);
    expect(state.calls).toHaveLength(4);
    expect(state.calls[3]).toEqual(state.calls[2]);
    expect(state.calls[3]).toMatchObject({ key: inside, to: recipients });
    expect(await job(inside)).toMatchObject({ status: "sent", attempt_count: 1 });
    expect(await outcomes(inside)).toEqual(["manual-requeue", "sent"]);
  } finally {
    state.admin = null;
    state.hang = false;
    for (const name of Object.keys(settings)) {
      if (name in saved) process.env[name] = saved[name]; else delete process.env[name];
    }
    try {
      if (docker("ps", "-aq", "--filter", "name=^/" + rest + "$")) docker("rm", "--force", rest);
    } finally {
      try { await db.close(); } finally { if (networkCreated) docker("network", "rm", network); }
    }
  }
}, 300_000);
