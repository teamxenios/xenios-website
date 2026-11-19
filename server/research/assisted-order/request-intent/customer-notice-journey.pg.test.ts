import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import express from "express";
import request from "supertest";
import WebSocket from "ws";
import { expect, it, vi } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "./durable-journey.pg.fixture";
import { CUSTOMER_NOTICE_HELP_URL, CUSTOMER_NOTICE_SEND_LIMIT_MS } from "./customer-notice";
import { CustomerNoticeReceiptConflict } from "./customer-notice-receipts";
import { mountEarlyAccessReceiptEndpoint } from "../../email/early-access-receipt-endpoint";

// One customer notice through every stage on the composed source: the
// workflow's outbox job, the outbox worker itself (runOutboxTick, through
// supabase-js and PostgREST to PostgreSQL 16), the real sender with the
// database's own delivery and binding functions, the provider's signed reports
// over the real HTTP door, and the staff word. Only the mail provider's API is
// replaced.
const rest = vi.hoisted(() => ({ admin: null as SupabaseClient | null }));
vi.mock("../../../supabase", () => ({
  getSupabaseAdmin: () => {
    if (!rest.admin) throw new Error("Owned PostgREST client not ready");
    return rest.admin;
  },
  supabaseConfigured: () => true,
}));
vi.mock("../../agreement-package-reconciliation", () => ({ runAgreementPackageReconciler: vi.fn() }));
vi.mock("../../../routes", () => ({
  requireSupabaseAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
const mail = vi.hoisted(() => ({
  sent: [] as Array<{ message: Record<string, unknown>; key: unknown }>,
  replies: [] as Array<"lost" | string>,
}));
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({
    client: {
      emails: {
        async send(message: Record<string, unknown>, options: { idempotencyKey?: unknown }) {
          mail.sent.push({ message, key: options?.idempotencyKey });
          const reply = mail.replies.shift();
          if (reply === undefined || reply === "lost") throw new Error("synthetic connection reset after the request left");
          return { data: { id: reply }, error: null };
        },
      },
    },
  }),
}));

process.env.RESEARCH_SESSION_SECRET ??= "test-secret-for-vitest";
const { runOutboxTick } = await import("../../outbox");

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

const S = "request_intent_private";
const ENV = "ea-fixture";
const FROM = "Xenios <notices@example.invalid>";
const QUEUED_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000041";
const REVIEW_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000042";
const UNRELATED_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000049";
const enqueue = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const word = `select ${S}.workflow_customer_notice($1::uuid, $2::uuid) as w`;
// The controlled check's readback, run verbatim as the database owner with the
// request's reference. It reads no address, recipient or payload.
const CONTROLLED_CHECK_READBACK = `with e as (
  select ev.id as event_id, ev.request_id, ev.kind, ev.revision
  from request_intent_private.workflow_events ev
  join request_intent_private.requests r on r.id = ev.request_id
  where r.public_reference = $1 and ev.kind in ('queued', 'review_started'))
select e.kind,
  (select count(*)::int from public.research_notification_outbox j
    where j.event_key = 'ea-request-customer-' || e.event_id::text) as jobs,
  o.status,
  coalesce(btrim(o.provider_message_id), '') <> '' as provider_id_stored,
  (select string_agg(w.kind, ',' order by w.received_at, w.provider_event_id)
    from request_intent_private.workflow_notice_receipts w
    where w.provider_message_id::text = lower(btrim(o.provider_message_id))) as reports,
  request_intent_private.customer_notice_receipt_evidence(e.request_id, e.event_id) as evidence,
  request_intent_private.workflow_customer_notice(e.request_id, e.event_id) as staff_word
from e
left join public.research_notification_outbox o on o.event_key = 'ea-request-customer-' || e.event_id::text
order by e.revision`;

pg16It("carries one customer notice from its saved event through the sender and signed provider reports to the staff word", async () => {
  const db = createDurableJourneyFixture();
  const network = "xenios-customer-notice-network-" + randomUUID();
  const restName = "xenios-customer-notice-rest-" + randomUUID();
  const restPassword = randomUUID();
  const secret = randomUUID() + randomUUID();
  const saved = { ...process.env };
  const settings: Record<string, string> = {
    EA_REQUEST_CUSTOMER_NOTICE_ENABLED: "true",
    EA_REQUEST_CUSTOMER_NOTICE_START_AT: "2026-01-01T00:00:00Z",
    RESEARCH_REQUEST_WORKFLOW_ENVIRONMENT: ENV,
    RESEND_API_KEY: "re_fixture_not_a_key",
    RESEARCH_EMAIL_FROM: FROM,
  };
  let networkCreated = false;
  try {
    await db.start({ dockerOnly: true, managedCareSchema: true });
    for (const file of [
      "supabase/research-notification-outbox.sql",
      "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql",
      "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
      "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql",
      "supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql",
    ]) await db.sql(readFileSync(file, "utf8"));
    await db.sql([
      "GRANT SELECT, INSERT, UPDATE ON public.research_notification_outbox TO service_role;",
      "GRANT INSERT ON public.research_notification_attempts TO service_role;",
      "CREATE ROLE fixture_rest LOGIN NOINHERIT PASSWORD '" + restPassword + "';",
      "GRANT anon, authenticated, service_role TO fixture_rest WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
    ].join("\n"));

    // The workflow is switched on before the request arrives, so the saved
    // request records its own received and queued events and its notice, in
    // the submission's transaction. Nothing below seeds a workflow row.
    const startAt = (await db.sql(
      "select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') as value")).rows[0].value as string;
    await db.sql(`update ${S}.workflow_settings set environment = $1, start_at = $2, enabled = true,
      retention_policy_version = 'synthetic-policy', recipient_policy_version = 'synthetic-contact'`, [ENV, startAt]);
    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [saved] = await db.snapshot();
    const eventOf = async (kind: string) => (await db.sql(
      `select id from ${S}.workflow_events where request_id = $1 and kind = $2`, [saved.id, kind])).rows.map((row) => row.id as string);
    expect(await eventOf("received")).toHaveLength(1);
    const [QUEUED] = await eventOf("queued");
    expect(QUEUED).toEqual(expect.any(String));

    // The submission itself recorded the queued notice; replaying its event
    // records no second.
    const jobs = async () => (await db.sql(
      "select event_key, status, provider_message_id from public.research_notification_outbox order by created_at, id")).rows;
    expect(await jobs()).toEqual([{ event_key: "ea-request-customer-" + QUEUED, status: "pending", provider_message_id: null }]);
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    expect((await jobs()).map((job) => job.event_key)).toEqual(["ea-request-customer-" + QUEUED]);
    const read = async (event: string) => (await db.sql(word, [saved.id, event])).rows[0].w;
    const projected = async () =>
      (await db.sql(`select ${S}.workflow_projection($1::uuid) as p`, [saved.id])).rows[0].p as Record<string, unknown>;
    expect(await read(QUEUED)).toBe("pending");

    // The outbox worker itself, as its timer runs it: due jobs, the
    // status-guarded claim, the real sender, the attempt row and the guarded
    // completion, all through supabase-js and PostgREST as service_role.
    docker("network", "create", network);
    networkCreated = true;
    docker("network", "connect", network, db.ownedDockerContainer());
    const origin = await openRest(restName, network, db.ownedDockerContainer(), restPassword, secret);
    rest.admin = restClient(origin, testToken(secret, { role: "service_role" }));
    Object.assign(process.env, settings);
    const dispatchDue = (now: Date = new Date()) => runOutboxTick(now);

    // The provider's signed reports, through the real door with quoting off.
    const key = randomBytes(32);
    const door = express();
    const handle = mountEarlyAccessReceiptEndpoint(door, {
      RENDER: "true", RENDER_SERVICE_ID: "srv-d9h4f4m7r5hc73ctjng0", SUPABASE_URL: "https://srcphrgnxreqyirkitxd.supabase.co",
      RENDER_EXTERNAL_URL: "https://xenios-research-staging.onrender.com",
      EA_REQUEST_DELIVERY_RECEIPTS_ENABLED: "true", EA_REQUEST_DELIVERY_RECEIPT_SECRETS: JSON.stringify(["whsec_" + key.toString("base64")]),
    }, async (receipt) => {
      try {
        const result = await db.asRole("service_role", "select public.request_intent_customer_notice_receipt_record($1, $2::uuid, $3, $4) as d",
          [receipt.eventId, receipt.messageId, receipt.kind, receipt.digest]);
        return result.rows[0].d as "recorded" | "replayed";
      } catch (error) {
        if ((error as { code?: string }).code === "23505") throw new CustomerNoticeReceiptConflict();
        throw error;
      }
    });
    expect(handle?.status).toBe("enabled");
    door.use(express.json());
    const report = (type: string, eventId: string, messageId: string, to: string[] = ["synthetic@example.invalid"]) => {
      const bytes = Buffer.from(JSON.stringify({ type, data: { email_id: messageId, to } }));
      const ts = String(Math.floor(Date.now() / 1000));
      const mac = createHmac("sha256", key).update(eventId + "." + ts + ".", "ascii").update(bytes).digest("base64");
      return request(door).post("/api/webhooks/early-access/quote-delivery").set("Content-Type", "application/json")
        .set({ "svix-id": eventId, "svix-timestamp": ts, "svix-signature": "v1," + mac }).send(bytes.toString());
    };
    const receipts = async () => (await db.sql(`select count(*)::int as n from ${S}.workflow_notice_receipts`)).rows[0].n;

    // A delivery report that arrives before the send's id is stored is kept,
    // and claims nothing while the job is unsent.
    expect((await report("email.delivered", "evt_early", QUEUED_MESSAGE)).status).toBe(204);
    expect(await read(QUEUED)).toBe("pending");

    // The queued notice is accepted, and the early report now attributes to
    // its stored id, at read time.
    mail.replies.push(QUEUED_MESSAGE);
    expect(await dispatchDue()).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(mail.sent).toHaveLength(1);
    expect(await jobs()).toEqual([{ event_key: "ea-request-customer-" + QUEUED, status: "sent", provider_message_id: QUEUED_MESSAGE }]);
    expect(await read(QUEUED)).toBe("delivered_to_server");
    expect((await projected()).customerNotice).toBe("delivered_to_server");

    // Review starts through the staff command itself: a processor with the
    // role, the approved capability, an environment scope and MFA. The command
    // records its event and its notice together; replaying the same command
    // returns the same state and records nothing more.
    await db.sql("insert into public.care_role_assignments (user_id, role, granted_by) values ($1, 'request_intent_processor', $1)", [OPERATOR]);
    await db.sql("update public.care_capabilities set state = 'enabled', approved_by = $1, approved_at = now() where capability_key = 'request_intent_process'",
      [OPERATOR]);
    await db.sql(`insert into ${S}.workflow_processor_scopes (actor_user_id, environment, approved_by, approved_at) values ($1, $2, $1, now())`,
      [OPERATOR, ENV]);
    const command = randomUUID();
    const startReview = async () => (await db.asRole("service_role",
      "select public.request_intent_start_review($1::uuid, $2::uuid, true, 1, $3::uuid, $4::text, $5::timestamptz) as value",
      [saved.id, OPERATOR, command, ENV, startAt])).rows[0].value as { replay: boolean };
    expect((await startReview()).replay).toBe(false);
    const [REVIEW] = await eventOf("review_started");
    expect(REVIEW).toEqual(expect.any(String));
    expect((await startReview()).replay).toBe(true);
    expect(await eventOf("review_started")).toEqual([REVIEW]);
    expect((await jobs()).map((job) => job.event_key)).toEqual(["ea-request-customer-" + QUEUED, "ea-request-customer-" + REVIEW]);

    // The review notice's send has no confirmed result, so it waits to be
    // retried; it is not called failed, and the sent notice is not sent again.
    mail.replies.push("lost");
    expect(await dispatchDue()).toEqual({ sent: 0, retried: 1, failed: 0 });
    expect(mail.sent).toHaveLength(2);
    expect(await jobs()).toEqual([
      { event_key: "ea-request-customer-" + QUEUED, status: "sent", provider_message_id: QUEUED_MESSAGE },
      { event_key: "ea-request-customer-" + REVIEW, status: "failed_retryable", provider_message_id: null },
    ]);
    expect(await read(REVIEW)).toBe("pending");

    // What the customer is sent: their reference, the event, the next step and
    // the help page. One recipient, the saved address. No reply route, no
    // product, quantity, phone, postal address or organization.
    const [queuedMail, lostReview] = mail.sent;
    expect(queuedMail.key).toBe("ea-request-customer-" + QUEUED);
    expect(Object.keys(queuedMail.message).sort()).toEqual(["from", "html", "subject", "text", "to"]);
    expect(queuedMail.message.to).toBe("synthetic@example.invalid");
    const reference = saved.public_reference;
    expect(reference).toMatch(/^XRI-[0-9A-F]{32}$/);
    expect(queuedMail.message.subject).toBe("Your request is in the review queue · " + reference);
    const text = String(queuedMail.message.text);
    for (const part of ["Received and added to the review queue", `Request ${reference} was received and added to our review queue at `,
      "Keep this reference.", "You do not need to submit again.", "It is not a purchase, prescription or shipment confirmation.",
      CUSTOMER_NOTICE_HELP_URL]) expect(text).toContain(part);
    for (const absent of ["Synthetic Customer", "Synthetic Organization", "Synthetic Street", "+1555", "Synthetic exact variant",
      "pc-var", "product-var", "quantity", "reply", "price"]) {
      expect(text.toLowerCase()).not.toContain(absent.toLowerCase());
      expect(String(queuedMail.message.html).toLowerCase()).not.toContain(absent.toLowerCase());
    }
    expect(lostReview.message.subject).toBe("Your request is being reviewed · " + reference);

    // The retry sends the identical message under the identical key, so the
    // provider's duplicate check holds it to one email.
    mail.replies.push(REVIEW_MESSAGE);
    expect(await dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(mail.sent).toHaveLength(2);
    const later = new Date(Date.now() + 2 * 60 * 1000);
    expect(await dispatchDue(later)).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(mail.sent).toHaveLength(3);
    expect(mail.sent[2]).toEqual(lostReview);
    expect((await jobs())[1]).toEqual({ event_key: "ea-request-customer-" + REVIEW, status: "sent", provider_message_id: REVIEW_MESSAGE });
    expect(await read(REVIEW)).toBe("provider_accepted");

    // Reports on the same door: a duplicate is acknowledged and changes
    // nothing; the same event id with other facts is refused; a report about
    // several recipients, or about mail that is not a notice, touches neither.
    expect((await report("email.delivered", "evt_early", QUEUED_MESSAGE)).status).toBe(204);
    expect((await report("email.bounced", "evt_early", QUEUED_MESSAGE)).status).toBe(409);
    const before = await receipts();
    expect((await report("email.bounced", "evt_group", REVIEW_MESSAGE, ["a@example.invalid", "b@example.invalid"])).status).toBe(204);
    expect(await receipts()).toBe(before);
    expect((await report("email.bounced", "evt_unrelated", UNRELATED_MESSAGE)).status).toBe(204);
    expect(await read(QUEUED)).toBe("delivered_to_server");
    expect(await read(REVIEW)).toBe("provider_accepted");

    // A bounce shows as failed for that notice only, and sends nothing again.
    expect((await report("email.bounced", "evt_review_bounce", REVIEW_MESSAGE)).status).toBe(204);
    expect(await read(REVIEW)).toBe("failed");
    expect(await read(QUEUED)).toBe("delivered_to_server");
    await dispatchDue(new Date(Date.now() + 24 * 60 * 60 * 1000));
    expect(mail.sent).toHaveLength(3);
    expect((await jobs()).map((job) => job.status)).toEqual(["sent", "sent"]);

    // The controlled check reads the same outcome by reference alone.
    const readback = (await db.sql(CONTROLLED_CHECK_READBACK, [reference])).rows;
    expect(readback).toMatchObject([
      { kind: "queued", jobs: 1, status: "sent", provider_id_stored: true, evidence: "delivered", staff_word: "delivered_to_server" },
      { kind: "review_started", jobs: 1, status: "sent", provider_id_stored: true, evidence: "bounced", staff_word: "failed" },
    ]);
    expect(String(readback[0].reports).split(",")).toContain("delivered");
    expect(String(readback[1].reports).split(",")).toContain("bounced");
    expect(JSON.stringify(readback)).not.toContain("@");

    // Nothing private reaches the staff projection or the stored reports.
    const shown = JSON.stringify(await projected());
    expect(shown).not.toContain("@");
    expect(shown.toLowerCase()).not.toContain(QUEUED_MESSAGE);
    expect(JSON.stringify((await db.sql(`select * from ${S}.workflow_notice_receipts`)).rows)).not.toMatch(/@|Synthetic|svix-signature/);
  } finally {
    rest.admin = null;
    for (const name of Object.keys(settings)) {
      if (name in saved) process.env[name] = saved[name]; else delete process.env[name];
    }
    try {
      if (docker("ps", "-aq", "--filter", "name=^/" + restName + "$")) docker("rm", "--force", restName);
    } finally {
      try { await db.close(); } finally { if (networkCreated) docker("network", "rm", network); }
    }
  }
}, 300_000);

// The unmatched-receipt purge may remove a report a day after it arrived.
// That is safe only while a notice can store its provider id less than a day
// after its first report: the id is stored only by a send that passes the
// sender's limit, measured from the job's creation, and every report follows
// the first send. Raising the limit to a day or more needs a later purge floor
// first, or a report could be removed before its notice claims it.
it("keeps the receipt purge floor beyond the customer notice send limit", () => {
  const receipts = readFileSync("supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql", "utf8");
  expect(receipts).toContain("p_received_before > clock_timestamp() - interval '1 day'");
  expect(CUSTOMER_NOTICE_SEND_LIMIT_MS).toBeLessThan(24 * 60 * 60 * 1000);
});
