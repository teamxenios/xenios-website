import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
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
const rest = vi.hoisted(() => ({
  admin: null as SupabaseClient | null,
  // Runs before each request reaches PostgREST, so a test can hold one there.
  gate: null as null | ((url: URL, init?: RequestInit) => Promise<void>),
}));
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
  replies: [] as Array<"lost" | string | Promise<string>>,
}));
vi.mock("../../../services/email", () => ({
  getResendClient: async () => ({
    // The staff notice sends from the client's own address; customer notices pass theirs.
    fromEmail: "Xenios <staff-notices@example.invalid>",
    client: {
      emails: {
        async send(message: Record<string, unknown>, options: { idempotencyKey?: unknown }) {
          mail.sent.push({ message, key: options?.idempotencyKey });
          const reply = await mail.replies.shift();
          if (reply === undefined || reply === "lost") throw new Error("synthetic connection reset after the request left");
          return { data: { id: reply }, error: null };
        },
      },
    },
  }),
}));

process.env.RESEARCH_SESSION_SECRET ??= "test-secret-for-vitest";
const { readMailGuardStatus, runOutboxTick } = await import("../../outbox");

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
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      if (url.origin !== origin || !url.pathname.startsWith("/rest/v1/")) throw new Error("Unexpected fixture request");
      url.pathname = url.pathname.slice("/rest/v1".length);
      if (rest.gate) await rest.gate(url, init);
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
    // Before the no-mail install: the status function is missing and the real
    // provider reports PostgreSQL's own undefined-column error for the column.
    expect(await readMailGuardStatus()).toBe("legacy");
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
    const html = String(queuedMail.message.html);
    const receivedAt = saved.created_at;
    const queuedClock = (await db.sql(
      "select payload->>'eventAt' as event_at from public.research_notification_outbox where event_key = $1",
      ["ea-request-customer-" + QUEUED])).rows;
    expect(queuedClock).toHaveLength(1);
    expect(Date.parse(String(queuedClock[0].event_at))).toBe(receivedAt.getTime());
    const dueAt = new Date(receivedAt.getTime() + 86_400_000);
    const centralClock = new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium", timeStyle: "short", timeZone: "America/Chicago",
    });
    const promise = "Request received. Our team will reply within 24 hours.";
    const receivedTime = `${centralClock.format(receivedAt)} Central`;
    const dueTime = `${centralClock.format(dueAt)} Central`;
    for (const part of ["Received and added to the review queue", `Request ${reference} was received and added to our review queue at ${receivedTime}.`,
      promise, `The 24-hour reply window ends at ${dueTime}, measured from the received time above. This automatic receipt is separate from the team's reply.`,
      "Keep this reference.", "You do not need to submit again.", "It is not a purchase, prescription or shipment confirmation.",
      CUSTOMER_NOTICE_HELP_URL]) {
      expect(text).toContain(part);
      expect(html).toContain(part);
    }
    for (const absent of ["Synthetic Customer", "Synthetic Organization", "Synthetic Street", "+1555", "Synthetic exact variant",
      "pc-var", "product-var", "quantity", "price"]) {
      expect(text.toLowerCase()).not.toContain(absent.toLowerCase());
      expect(html.toLowerCase()).not.toContain(absent.toLowerCase());
    }
    for (const { message } of [queuedMail, lostReview]) {
      expect(Object.keys(message).sort()).toEqual(["from", "html", "subject", "text", "to"]);
      for (const field of ["replyTo", "reply_to", "headers"]) expect(message).not.toHaveProperty(field);
      for (const body of [String(message.text), String(message.html)]) {
        expect(body).not.toMatch(/reply[-_]to|reply to this (?:email|message)|mailto:/i);
      }
    }
    expect(lostReview.message.subject).toBe("Your request is being reviewed · " + reference);
    expect(String(lostReview.message.text)).not.toContain(promise);
    expect(String(lostReview.message.html)).not.toContain(promise);

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

    // A worker that died mid-send leaves its claim in processing. The next
    // pass reclaims it through PostgREST, matched on the updated_at it read
    // back in PostgREST's own text form (microseconds and an offset whose "+"
    // supabase-js encodes in the query). A staff job is used because staff
    // notices are off here, so the reclaimed job stays out of the due batch.
    const stuck = (await db.sql(`insert into public.research_notification_outbox
        (event_key, event_type, template_key, recipient, status, attempt_count, last_attempt_at, updated_at)
      values ('fixture-stale-claim', 'request_submitted_staff', 'ea_request_submitted_staff_v1', 'staff-fixture', 'processing', 0,
        date_trunc('second', now()) - interval '20 minutes' + interval '0.123456 seconds',
        date_trunc('second', now()) - interval '20 minutes' + interval '0.123456 seconds')
      returning id`)).rows[0].id as string;
    const stuckState = async () => (await db.sql(
      `select o.status, o.attempt_count, o.last_error_summary,
              (select json_agg(json_build_object('attempt', a.attempt, 'outcome', a.outcome, 'error_summary', a.error_summary))
                 from public.research_notification_attempts a where a.outbox_id = o.id) as attempts
         from public.research_notification_outbox o where o.id = $1`, [stuck])).rows[0];
    expect(await dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 0 });
    const reclaimedState = {
      status: "failed_retryable",
      attempt_count: 1,
      last_error_summary: "reclaimed after stale processing claim (crashed mid-send)",
      attempts: [{ attempt: 1, outcome: "failed", error_summary: "stale processing reclaim (crashed mid-send)" }],
    };
    expect(await stuckState()).toEqual(reclaimedState);
    // Reclaimed once: a later pass neither reclaims it again nor sends it.
    expect(await dispatchDue()).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(await stuckState()).toEqual(reclaimedState);
    expect(mail.sent).toHaveLength(3);

    // Two workers on one job, each held where its race lives, against
    // PostgREST's own filter evaluation. W0 claims and stalls in its send past
    // the stale window. Reclaimer R1 reads W0's claim and is held before its
    // update. R2 reclaims, and W2 claims and stalls in its send. With W2 still
    // processing, R1's update and then W0's completion each match nothing, and
    // neither touches W2's claim. The job is a second request's notice.
    const second = {
      ...submission(),
      idempotencyKey: "20000000-0000-4000-8000-000000000002",
      contact: {
        fullLegalName: "Jordan Example", email: "jordan@example.invalid", mobilePhone: "+15555550199",
        ageConfirmed: true as const, billingSameAsShipping: true,
        shippingAddress: { line1: "2 Fictional Way", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" },
      },
    };
    expect((await db.post(app, "", second, "a")).status).toBe(200);
    const raced = (await db.sql(`select id, event_key from public.research_notification_outbox
      where status = 'pending' and event_key like 'ea-request-customer-%'`)).rows;
    expect(raced).toHaveLength(1);
    const racedState = async () => (await db.sql(
      `select o.status, o.attempt_count, o.provider_message_id,
              to_char(o.last_attempt_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as last_attempt_at,
              (select json_agg(json_build_object('attempt', a.attempt, 'outcome', a.outcome, 'error_summary', a.error_summary)
                        order by a.created_at, a.id)
                 from public.research_notification_attempts a where a.outbox_id = o.id) as attempts
         from public.research_notification_outbox o where o.id = $1`, [raced[0].id])).rows[0];
    const held = () => {
      let settle!: (id: string) => void;
      const reply = new Promise<string>((resolve) => { settle = resolve; });
      return { reply, settle };
    };
    const until = async (done: () => boolean) => {
      for (let wait = 0; wait < 600 && !done(); wait++) await delay(50);
      expect(done()).toBe(true);
    };
    const sentBefore = mail.sent.length;

    const t0 = new Date(Date.now() + 1_000);
    const send0 = held();
    mail.replies.push(send0.reply);
    const w0 = dispatchDue(t0);
    await until(() => mail.sent.length === sentBefore + 1);

    let reclaimReached = false;
    let releaseReclaim!: () => void;
    const reclaimHeld = new Promise<void>((resolve) => { releaseReclaim = resolve; });
    rest.gate = async (url, init) => {
      if (init?.method !== "PATCH" || !url.searchParams.has("updated_at")) return;
      rest.gate = null;
      reclaimReached = true;
      await reclaimHeld;
    };
    const t1 = new Date(t0.getTime() + 16 * 60 * 1000);
    const r1 = dispatchDue(t1);
    await until(() => reclaimReached);

    const send2 = held();
    mail.replies.push(send2.reply);
    const t2 = new Date(t1.getTime() + 1_000);
    const w2 = dispatchDue(t2);
    await until(() => mail.sent.length === sentBefore + 2);
    const reclaimedOnce = { attempt: 1, outcome: "failed", error_summary: "stale processing reclaim (crashed mid-send)" };
    const claimedByW2 = {
      status: "processing", attempt_count: 1, provider_message_id: null, last_attempt_at: t2.toISOString(),
      attempts: [reclaimedOnce],
    };
    expect(await racedState()).toEqual(claimedByW2);

    // R1's update carries the updated_at it read, which W2's claim replaced.
    releaseReclaim();
    expect(await r1).toEqual({ sent: 0, retried: 0, failed: 0 });
    expect(await racedState()).toEqual(claimedByW2);

    // W0's provider accepted, so its attempt row stands; its completion
    // carries its own claim time, which W2's claim replaced.
    const logged = vi.spyOn(console, "error");
    try {
      send0.settle("6b1d2c3e-0000-4000-8000-000000000043");
      expect(await w0).toEqual({ sent: 0, retried: 0, failed: 0 });
      expect(logged).toHaveBeenCalledWith("[outbox] completion not recorded: the job was reclaimed before its dispatch finished");
    } finally {
      logged.mockRestore();
    }
    const w0Attempt = { attempt: 1, outcome: "sent", error_summary: null };
    expect(await racedState()).toEqual({ ...claimedByW2, attempts: [reclaimedOnce, w0Attempt] });

    // W2 completes its own claim.
    send2.settle("6b1d2c3e-0000-4000-8000-000000000044");
    expect(await w2).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(await racedState()).toEqual({
      status: "sent", attempt_count: 2, provider_message_id: "6b1d2c3e-0000-4000-8000-000000000044",
      last_attempt_at: t2.toISOString(), attempts: [reclaimedOnce, w0Attempt, { attempt: 2, outcome: "sent", error_summary: null }],
    });
    // Both sends carried the job's one key and the same message.
    const raceSends = mail.sent.slice(sentBefore);
    expect(raceSends.map((send) => send.key)).toEqual([raced[0].event_key, raced[0].event_key]);
    expect(raceSends[1].message).toEqual(raceSends[0].message);
  } finally {
    rest.gate = null;
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

// The installed no-mail schema, on the accepted candidate's own bytes and its
// prerequisites, read by the outbox worker itself through supabase-js and
// PostgREST. The canonical staff-notice RPC first queues the ordinary notice
// and, as the candidate's producers require, none for the designated request.
// The worker then repeats that reconciliation idempotently. A held job is
// written the way an older producer
// would write it, and the database itself designates it. Only the ordinary
// notice is claimed, attempted and sent. The held one is never claimed,
// attempted or sent, on any later pass.
const NO_MAIL_CANDIDATE = "supabase/candidates/request_intent_fixture_no_mail.sql";
const sha = (value: string) => createHash("sha256").update(value).digest("hex");

pg16It("sends the ordinary notice and holds the designated one on the installed no-mail schema, through PostgREST", async () => {
  const db = createDurableJourneyFixture();
  const network = "xenios-no-mail-network-" + randomUUID();
  const restName = "xenios-no-mail-rest-" + randomUUID();
  const restPassword = randomUUID();
  const secret = randomUUID() + randomUUID();
  const saved = { ...process.env };
  const settings: Record<string, string> = {
    EA_REQUEST_SUBMITTED_STAFF_NOTICE_ENABLED: "true",
    EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS: "staff-a@example.invalid,staff-b@example.invalid",
    EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT: "2026-01-01T00:00:00Z",
    SITE_URL: "https://site.example.invalid/",
    RESEND_API_KEY: "re_fixture_not_a_key",
    RESEARCH_EMAIL_FROM: FROM,
  };
  let networkCreated = false;
  try {
    // The candidate's own prerequisites, in the order its owned suite installs them.
    await db.start({ dockerOnly: true, managedCareSchema: true });
    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [seed] = await db.snapshot();
    for (const file of [
      "supabase/research-notification-outbox.sql",
      "server/research/assisted-order/request-intent/private-contact.candidate.sql",
      "supabase/migrations/20261114133643_early_access_postal_admission.sql",
      "supabase/candidates/request_intent_optional_context.sql",
      "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
      "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql",
      "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
      "supabase/candidates/request_intent_policy_capture.sql",
      "supabase/candidates/request_intent_referral_capture.sql",
      "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql",
      "supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql",
      "supabase/candidates/request_intent_staff_notice_retention_lock.sql",
    ]) await db.sql(readFileSync(file, "utf8"));
    await db.sql("create schema quote_delivery_private");
    await db.sql("set search_path=quote_delivery_private,pg_catalog;\n"
      + readFileSync("server/research/assisted-order/quote/delivery/tables.sql", "utf8")
      + readFileSync("server/research/assisted-order/quote/delivery/private-pg.sql", "utf8"));
    const bundle = randomUUID();
    await db.sql(`insert into ${S}.policy_bundles(id,environment,retention_policy_id,retention_policy_version,retention_record_reference,retention_document_sha256,
      recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,approval_record_reference,approval_received_at,
      required_agreements,notice_agreement_kind,notice_agreement_version,notice_document_sha256)
      values($1,'staging','FIXTURE-RETENTION','v1','fixture:retention:1',$2,'FIXTURE-RECIPIENT','v1','fixture:recipient:1',$3,
      'fixture:approval:1',clock_timestamp()-interval '1 second','[{"kind":"fixture-terms","version":"fixture-v1"}]','fixture-terms','fixture-v1',$4)`,
    [bundle, sha("retention"), sha("recipient"), sha("document")]);
    await db.sql(`update ${S}.workflow_settings set environment='staging',start_at=clock_timestamp(),enabled=true,
      retention_policy_version='fixture:retention:1',recipient_policy_version='fixture:recipient:1',policy_capture_bundle_id=$1,policy_capture_enabled=true`, [bundle]);
    await db.sql(readFileSync(NO_MAIL_CANDIDATE, "utf8"));
    expect((await db.asRole("service_role", "select public.request_intent_fixture_mail_guard_status() as s")).rows[0].s)
      .toEqual({ protocol: "request-intent/fixture-no-mail/v1", ready: true });

    // One designated request, published and saved as the candidate's own suite does it.
    const owner = sha("owner:journey"), attempt = sha("attempt:journey"), fingerprint = sha("input:journey");
    const heldId = randomUUID();
    const detail = { requestId: heldId, publicReference: "XRI-" + heldId.replace(/-/g, "").toUpperCase(),
      kind: "unapproved_selection_request", status: "pending_review", createdAt: new Date().toISOString(),
      contact: seed.contact, agreements: seed.agreements, lines: seed.lines };
    const admission = { ownerBinding: sha("admission:journey"), policyRevision: sha("policy:journey") };
    await db.sql(`insert into ${S}.catalog_contact_admission(owner_binding,policy_revision,full_legal_name,email,expires_at,postal_address)
      values($1,$2,'Synthetic fixture','fixture@example.invalid',clock_timestamp()+interval '30 minutes','{"line1":"1 Fixture St","city":"Fixture","countryCode":"HK"}')`,
    [admission.ownerBinding, admission.policyRevision]);
    const deadline = (await db.sql("select to_char((clock_timestamp()+interval '10 minutes') at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as t")).rows[0].t as string;
    const metadata = (await db.asRole("service_role",
      "select public.request_intent_fixture_prepare_metadata($1,$2,$3,$4::jsonb,$5::jsonb,$6::uuid,$7::timestamptz) as m",
      [owner, attempt, fingerprint, JSON.stringify({ lines: detail.lines, agreements: detail.agreements }), JSON.stringify(admission), null, deadline]))
      .rows[0].m as Record<string, string>;
    await db.sql(`select ${S}.fixture_no_mail_publish($1::uuid,$2,$3,$4,$5,$6,$7,$8::timestamptz,$9::timestamptz,$10::jsonb,$11::timestamptz,$12::uuid) as digest`,
      [randomUUID(), owner, attempt, fingerprint, metadata.snapshotSha256, "owned:synthetic:approval", sha("approved:journey"),
        metadata.issuedAt, metadata.expiresAt, JSON.stringify(admission), metadata.admissionExpiresAt, null]);
    await db.asRole("service_role", "select public.request_intent_create_or_replay($1,$2,$3,$4::jsonb) as r",
      [owner, attempt, fingerprint, JSON.stringify(detail)]);

    await db.sql([
      "GRANT SELECT, INSERT, UPDATE ON public.research_notification_outbox TO service_role;",
      "GRANT INSERT ON public.research_notification_attempts TO service_role;",
      "CREATE ROLE fixture_rest LOGIN NOINHERIT PASSWORD '" + restPassword + "';",
      "GRANT anon, authenticated, service_role TO fixture_rest WITH SET TRUE, INHERIT FALSE, ADMIN FALSE;",
    ].join("\n"));
    docker("network", "create", network);
    networkCreated = true;
    docker("network", "connect", network, db.ownedDockerContainer());
    const origin = await openRest(restName, network, db.ownedDockerContainer(), restPassword, secret);
    rest.admin = restClient(origin, testToken(secret, { role: "service_role" }));
    Object.assign(process.env, settings);
    mail.sent.length = 0;
    mail.replies.length = 0;

    // The worker reads the installed status through PostgREST as ready.
    expect(await readMailGuardStatus()).toBe("ready");

    const staffJob = (id: string) => "ea-request-submitted-" + id;
    const jobsOf = async () => (await db.sql(
      `select o.event_key, o.mail_disposition, o.status, o.attempt_count, o.last_attempt_at is null as never_claimed,
              o.provider_message_id, (select count(*)::int from public.research_notification_attempts a where a.outbox_id = o.id) as attempts
         from public.research_notification_outbox o where o.template_key = 'ea_request_submitted_staff_v1' order by o.event_key`)).rows;

    // next_attempt_at defaults to PostgreSQL now(). Capture a millisecond-aligned
    // database horizon only AFTER the real producer's transaction commits; a
    // tick's fixed now must not predate the row it is expected to dispatch.
    const dueHorizonFor = async (eventKey: string, disposition: "ordinary" | "fixture_no_mail") => {
      const observed = (await db.sql(`with observed as materialized (select clock_timestamp() as observed_at),
        due as materialized (select observed_at,
          date_trunc('milliseconds', observed_at) + interval '1 millisecond' as horizon from observed)
        select to_char(due.horizon at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as horizon,
               due.horizon > due.observed_at and due.horizon <= due.observed_at + interval '1 millisecond' as bounded,
               o.next_attempt_at <= due.horizon as is_due, o.mail_disposition, o.status, o.attempt_count,
               o.last_attempt_at is null as never_claimed, o.provider_message_id,
               (select count(*)::int from public.research_notification_attempts a where a.outbox_id = o.id) as attempts
          from public.research_notification_outbox o cross join due where o.event_key = $1`, [eventKey])).rows;
      expect(observed).toHaveLength(1);
      expect(observed[0]).toMatchObject({ bounded: true, is_due: true, mail_disposition: disposition,
        status: "pending", attempt_count: 0, never_claimed: true, provider_message_id: null, attempts: 0 });
      const horizon = new Date(observed[0].horizon);
      expect(Number.isFinite(horizon.getTime())).toBe(true);
      expect(horizon.toISOString()).toBe(observed[0].horizon);
      return horizon;
    };

    // Queue through the SAME real PostgREST RPC as the worker, before taking its
    // due horizon. Assert the producer succeeds and excludes the designated
    // request; do not mask another reconciliation/setup failure as clock drift.
    expect(await jobsOf()).toEqual([]);
    const producer = rest.admin;
    if (!producer) throw new Error("Owned PostgREST client not ready");
    const queued = await producer.rpc("request_intent_enqueue_staff_notices", {
      p_since: settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_START_AT,
      p_recipients: settings.EA_REQUEST_SUBMITTED_STAFF_NOTICE_RECIPIENTS.split(","),
    });
    expect(queued.error).toBeNull();
    expect(queued.data).toBe(1);
    expect((await jobsOf()).map((row) => row.event_key)).toEqual([staffJob(seed.id)]);
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox where mail_disposition <> 'ordinary'")).rows[0].n)
      .toBe(0);

    // First pass: the real worker repeats reconciliation and must deliver the
    // ordinary notice through its actual claim/send/attempt path.
    const ordinaryDue = await dueHorizonFor(staffJob(seed.id), "ordinary");
    mail.replies.push("6b1d2c3e-0000-4000-8000-000000000051");
    const pass = await runOutboxTick(ordinaryDue);
    expect(pass).toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(mail.sent.map((send) => send.key)).toEqual([staffJob(seed.id)]);
    const sentOrdinary = {
      mail_disposition: "ordinary", status: "sent", attempt_count: 1, provider_message_id: "6b1d2c3e-0000-4000-8000-000000000051", attempts: 1,
    };
    expect((await jobsOf()).map((row) => row.event_key)).toEqual([staffJob(seed.id)]);
    expect((await jobsOf())[0]).toMatchObject(sentOrdinary);
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox where mail_disposition <> 'ordinary'")).rows[0].n)
      .toBe(0);

    // A held job written the way an older producer writes it: the canonical
    // key and payload, pending. The database stamps the designation itself;
    // nothing here sets it.
    const heldRow = (await db.sql(`insert into public.research_notification_outbox(event_key,event_type,template_key,recipient,payload,status)
      values($1,'ea_request_submitted_staff_v1','ea_request_submitted_staff_v1','staff-a@example.invalid',$2::jsonb,'pending') returning *`,
    [staffJob(heldId), JSON.stringify({ reference: detail.publicReference, submittedAt: new Date().toISOString(),
      itemCount: detail.lines.length, recipients: ["staff-a@example.invalid", "staff-b@example.invalid"] })])).rows;
    expect(heldRow).toHaveLength(1);
    expect(heldRow[0].mail_disposition).toBe("fixture_no_mail");
    const untouched = { mail_disposition: "fixture_no_mail", status: "pending", attempt_count: 0, never_claimed: true,
      provider_message_id: null, attempts: 0 };

    // Second pass: reconciliation runs again and queues nothing new; the held
    // job is due but excluded, and counted as withheld.
    const heldDue = await dueHorizonFor(staffJob(heldId), "fixture_no_mail");
    const held = await runOutboxTick(heldDue);
    expect(held).toEqual({ sent: 0, retried: 0, failed: 0, withheld: 1 });
    expect(mail.sent).toHaveLength(1);
    const byKey = Object.fromEntries((await jobsOf()).map((row) => [row.event_key, row]));
    expect(Object.keys(byKey).sort()).toEqual([staffJob(heldId), staffJob(seed.id)].sort());
    expect(byKey[staffJob(seed.id)]).toMatchObject(sentOrdinary);
    expect(byKey[staffJob(heldId)]).toMatchObject(untouched);

    // No held row of any kind was claimed, attempted or given a provider id.
    const heldTouched = async () => (await db.sql(`select count(*)::int as n from public.research_notification_outbox o
      where o.mail_disposition <> 'ordinary' and (o.status <> 'pending' or o.attempt_count <> 0 or o.last_attempt_at is not null
        or o.provider_message_id is not null
        or exists (select 1 from public.research_notification_attempts a where a.outbox_id = o.id))`)).rows[0].n;
    expect(await heldTouched()).toBe(0);

    // A later pass, past every retry window, still sends nothing.
    const later = await runOutboxTick(new Date(Date.now() + 2 * 60 * 60 * 1000));
    expect(later).toMatchObject({ sent: 0, retried: 0, failed: 0 });
    expect(mail.sent).toHaveLength(1);
    expect((await jobsOf()).find((row) => row.event_key === staffJob(heldId))).toMatchObject(untouched);
    expect(await heldTouched()).toBe(0);
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
