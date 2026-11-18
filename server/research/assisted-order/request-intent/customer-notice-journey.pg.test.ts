import { readFileSync } from "node:fs";
import { createHmac, randomBytes } from "node:crypto";
import express from "express";
import request from "supertest";
import { expect, vi } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "./durable-journey.pg.fixture";
import { CUSTOMER_NOTICE_HELP_URL, CUSTOMER_NOTICE_TEMPLATE_KEYS, sendRequestCustomerNotice } from "./customer-notice";
import { CustomerNoticeReceiptConflict } from "./customer-notice-receipts";
import { mountEarlyAccessReceiptEndpoint } from "../../email/early-access-receipt-endpoint";
import { OUTBOX_DUE_STATUSES, outboxAttemptRow, outboxClaimFields, outboxCompletionFields } from "../../outbox-writes";

// One customer notice through every stage on the composed source: the
// workflow's outbox job, the real sender with the database's own delivery and
// binding functions, the provider's signed reports over the real HTTP door,
// and the staff word. Only the mail provider's API is replaced. The outbox
// worker reaches its table through supabase-js, which this database fixture
// does not serve, so the queries are issued here; the fields they write come
// from the worker's own exported functions (outbox-writes.ts), not from a copy.
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

const S = "request_intent_private";
const ENV = "ea-fixture";
const FROM = "Xenios <notices@example.invalid>";
const QUEUED = "50000000-0000-4000-8000-000000000041";
const REVIEW = "50000000-0000-4000-8000-000000000042";
const QUEUED_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000041";
const REVIEW_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000042";
const UNRELATED_MESSAGE = "6b1d2c3e-0000-4000-8000-000000000049";
const enqueue = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const word = `select ${S}.workflow_customer_notice($1::uuid, $2::uuid) as w`;

pg16It("carries one customer notice from its saved event through the sender and signed provider reports to the staff word", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({ managedCareSchema: true });
    for (const file of [
      "supabase/research-notification-outbox.sql",
      "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
      "supabase/migrations/20261118024134_request_intent_workflow.sql",
      "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
      "supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql",
      "supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql",
    ]) await db.sql(readFileSync(file, "utf8"));

    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [saved] = await db.snapshot();
    await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, processor_user_id, changed_at)
      select id, $2, 'queued', 1, gen_random_uuid(), null, created_at from ${S}.requests where id = $1`, [saved.id, ENV]);
    await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at, actor_user_id, command_id)
      select gen_random_uuid(), id, 0, 'received', created_at, null::uuid, null::uuid from ${S}.requests where id = $1
      union all select $2::uuid, id, 1, 'queued', created_at, null, null from ${S}.requests where id = $1`,
      [saved.id, QUEUED]);

    // A replayed event records no second logical notice.
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    const jobs = async () => (await db.sql(
      "select event_key, status, provider_message_id from public.research_notification_outbox order by event_key")).rows;
    expect((await jobs()).map((job) => job.event_key)).toEqual(["ea-request-customer-" + QUEUED]);
    const read = async (event: string) => (await db.sql(word, [saved.id, event])).rows[0].w;
    const projected = async () =>
      (await db.sql(`select ${S}.workflow_projection($1::uuid) as p`, [saved.id])).rows[0].p as Record<string, unknown>;
    expect(await read(QUEUED)).toBe("pending");

    // The outbox worker's pass: due jobs, a status-guarded claim that records
    // the attempt before any send, the real sender, the attempt row, then the
    // completion. Every written field comes from outbox-writes.ts.
    const config = { since: "2026-01-01T00:00:00.000Z", environment: ENV };
    const senderEnv = { RESEND_API_KEY: "re_fixture_not_a_key" } as NodeJS.ProcessEnv;
    const readDelivery = async (key: string) =>
      (await db.asRole("service_role", "select public.request_intent_customer_notice_delivery($1::text) as v", [key])).rows[0].v;
    const bindDigest = async (key: string, digest: string) =>
      (await db.asRole("service_role", "select public.request_intent_customer_notice_bind($1::text, $2::text) as v", [key, digest])).rows[0].v;
    const write = async (table: string, fields: Record<string, unknown>, where: string, values: unknown[]) => {
      const keys = Object.keys(fields);
      const set = keys.map((key, index) => `${key} = $${values.length + index + 1}`).join(", ");
      return db.sql(`update public.${table} set ${set} where ${where} returning id`, [...values, ...keys.map((key) => fields[key])]);
    };
    const dispatchDue = async (now: Date = new Date()) => {
      const due = (await db.sql(`select * from public.research_notification_outbox
        where status = any($1::text[]) and next_attempt_at <= $2 and template_key = any($3::text[])
        order by event_key`, [[...OUTBOX_DUE_STATUSES], now.toISOString(), [...CUSTOMER_NOTICE_TEMPLATE_KEYS]])).rows;
      for (const job of due) {
        const claimed = await write("research_notification_outbox", outboxClaimFields(now), "id = $1 and status = $2", [job.id, job.status]);
        if (!claimed.rows.length) continue;
        const attempt = (job.attempt_count ?? 0) + 1;
        const outcome = await sendRequestCustomerNotice({
          ...job,
          created_at: (job.created_at as Date).toISOString(),
          last_attempt_at: job.last_attempt_at ? (job.last_attempt_at as Date).toISOString() : null,
        }, { from: FROM }, config, senderEnv, readDelivery, now, bindDigest);
        const row = outboxAttemptRow(job.id, attempt, outcome);
        await db.sql(`insert into public.research_notification_attempts (outbox_id, attempt, outcome, error_summary)
          values ($1, $2, $3, $4)`, [row.outbox_id, row.attempt, row.outcome, row.error_summary]);
        const fields = outboxCompletionFields(outcome, attempt, now);
        expect(["sent", "failed_retryable"]).toContain(fields.status);
        await write("research_notification_outbox", fields, "id = $1", [job.id]);
      }
    };

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
    await dispatchDue();
    expect(mail.sent).toHaveLength(1);
    expect(await jobs()).toEqual([{ event_key: "ea-request-customer-" + QUEUED, status: "sent", provider_message_id: QUEUED_MESSAGE }]);
    expect(await read(QUEUED)).toBe("delivered_to_server");
    expect((await projected()).customerNotice).toBe("delivered_to_server");

    // Review starts (the authorized command's event) and records its notice.
    // Its send has no confirmed result, so it waits to be retried; it is not
    // called failed, and the sent notice is not sent again.
    await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at, actor_user_id, command_id)
      select $2::uuid, id, 2, 'review_started', created_at, $3::uuid, gen_random_uuid() from ${S}.requests where id = $1`,
      [saved.id, REVIEW, OPERATOR]);
    await db.sql(enqueue, [saved.id, REVIEW, "request_reviewing", 2, ENV]);
    mail.replies.push("lost");
    await dispatchDue();
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
    await dispatchDue();
    expect(mail.sent).toHaveLength(2);
    const later = new Date(Date.now() + 2 * 60 * 1000);
    await dispatchDue(later);
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

    // Nothing private reaches the staff projection or the stored reports.
    const shown = JSON.stringify(await projected());
    expect(shown).not.toContain("@");
    expect(shown.toLowerCase()).not.toContain(QUEUED_MESSAGE);
    expect(JSON.stringify((await db.sql(`select * from ${S}.workflow_notice_receipts`)).rows)).not.toMatch(/@|Synthetic|svix-signature/);
  } finally {
    await db.close();
  }
}, 120_000);
