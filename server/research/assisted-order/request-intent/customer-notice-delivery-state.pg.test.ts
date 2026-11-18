import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "./durable-journey.pg.fixture";

const S = "request_intent_private";
const ENV = "ea-fixture";
const enqueue = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const record = "select public.request_intent_customer_notice_receipt_record($1::text, $2::uuid, $3::text, $4::text) as d";
const word = `select ${S}.workflow_customer_notice($1::uuid, $2::uuid) as w`;
const storeId = "update public.research_notification_outbox set status = 'sent', provider_message_id = $2 where event_key = $1";
const setStatus = "update public.research_notification_outbox set status = $2 where event_key = $1";
const QUEUED = "50000000-0000-4000-8000-000000000011";
const REVIEW = "50000000-0000-4000-8000-000000000012";
const MESSAGE = "6b1d2c3e-0000-4000-8000-0000000001aa";
const REVIEW_MESSAGE = "6b1d2c3e-0000-4000-8000-0000000001cc";
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);
const D3 = "3".repeat(64);

pg16It("shows staff the provider's delivery or bounce for a notice the provider accepted, in the same seven words, changing no job", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    // Filename order: the pending reader, the workflow, its notices, the receipts, then this change.
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261118194612_request_customer_notice_delivery_state.sql", "utf8");
    await db.sql(migration);
    await db.sql(migration);

    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [saved] = await db.snapshot();
    await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, processor_user_id, changed_at)
      select id, $2, 'queued', 1, gen_random_uuid(), null, created_at from ${S}.requests where id = $1`, [saved.id, ENV]);
    await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at, actor_user_id, command_id)
      select gen_random_uuid(), id, 0, 'received', created_at, null::uuid, null::uuid from ${S}.requests where id = $1
      union all select $2::uuid, id, 1, 'queued', created_at, null, null from ${S}.requests where id = $1
      union all select $3::uuid, id, 2, 'review_started', created_at, $4::uuid, gen_random_uuid() from ${S}.requests where id = $1`,
      [saved.id, QUEUED, REVIEW, OPERATOR]);
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    await db.sql(enqueue, [saved.id, REVIEW, "request_reviewing", 2, ENV]);
    const queuedKey = "ea-request-customer-" + QUEUED;
    const reviewKey = "ea-request-customer-" + REVIEW;
    const read = async (event = QUEUED) => (await db.sql(word, [saved.id, event])).rows[0].w;
    // The workflow is at revision 1, so its projection reports the queued notice.
    const projected = async () =>
      (await db.sql(`select ${S}.workflow_projection($1::uuid) as p`, [saved.id])).rows[0].p as Record<string, unknown>;

    // Access is unchanged: no application role can call it directly.
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, word, [saved.id, QUEUED])).rejects.toMatchObject({ code: "42501" });
    }

    // Before any send, as before.
    expect(await read()).toBe("pending");
    expect((await projected()).customerNotice).toBe("pending");

    // Accepted by the provider, with no report yet, or only an acceptance report.
    await db.sql(storeId, [queuedKey, MESSAGE.toUpperCase()]);
    expect(await read()).toBe("provider_accepted");
    expect((await db.asRole("service_role", record, ["evt_a", MESSAGE, "accepted", D1])).rows).toEqual([{ d: "recorded" }]);
    expect(await read()).toBe("provider_accepted");

    // The receiving server took it.
    expect((await db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D2])).rows).toEqual([{ d: "recorded" }]);
    expect(await read()).toBe("delivered_to_server");
    expect((await projected()).customerNotice).toBe("delivered_to_server");

    // A bounce on the other notice reads as failed, and only for that notice.
    await db.sql(storeId, [reviewKey, REVIEW_MESSAGE]);
    expect((await db.asRole("service_role", record, ["evt_r", REVIEW_MESSAGE, "bounced", D3])).rows).toEqual([{ d: "recorded" }]);
    expect(await read(REVIEW)).toBe("failed");
    expect(await read()).toBe("delivered_to_server");

    // A delivery and a bounce for one message are not resolved: staff reconcile.
    expect((await db.asRole("service_role", record, ["evt_c", MESSAGE, "bounced", D3])).rows).toEqual([{ d: "recorded" }]);
    expect(await read()).toBe("delivery_unknown");
    expect((await projected()).customerNotice).toBe("delivery_unknown");

    // A stored id that cannot be attributed claims nothing beyond the acceptance.
    await db.sql(`insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload, status, provider_message_id)
      values ('qd-duplicate', 'ea_private_quote_notice_v1', 'ea_private_quote_notice_v1', 'buyer@example.invalid', '{}'::jsonb, 'sent', $1)`, [MESSAGE]);
    expect(await read()).toBe("provider_accepted");
    await db.sql("delete from public.research_notification_outbox where event_key = 'qd-duplicate'");
    expect(await read()).toBe("delivery_unknown");
    await db.sql(storeId, [reviewKey, "re_not_a_uuid"]);
    expect(await read(REVIEW)).toBe("provider_accepted");
    await db.sql(storeId, [reviewKey, REVIEW_MESSAGE]);
    expect(await read(REVIEW)).toBe("failed");

    // Reading changed no job: both stay sent, so nothing resends a bounced notice.
    expect((await db.sql("select event_key, status from public.research_notification_outbox where event_key in ($1, $2) order by event_key",
      [queuedKey, reviewKey])).rows).toEqual([{ event_key: queuedKey, status: "sent" }, { event_key: reviewKey, status: "sent" }]);
    // The projection carries no address, provider id or report.
    const shown = JSON.stringify(await projected());
    expect(shown).not.toContain("@");
    expect(shown.toLowerCase()).not.toContain(MESSAGE.toLowerCase());
    expect(shown).not.toMatch(/bounce|evt_/i);

    // Every other outbox status reads exactly as before, whatever was reported.
    for (const [status, expected] of [
      ["pending", "pending"], ["processing", "pending"], ["failed_retryable", "pending"],
      ["cancelled", "suppressed"], ["failed_permanent", "failed"], ["delivered", "delivered_to_server"],
    ] as const) {
      await db.sql(setStatus, [reviewKey, status]);
      expect(await read(REVIEW)).toBe(expected);
    }

    // Asked about under another request, or for another event, nothing is acknowledged.
    expect((await db.sql(word, [OPERATOR, QUEUED])).rows).toEqual([{ w: "unavailable" }]);
    expect((await db.sql(word, [saved.id, OPERATOR])).rows).toEqual([{ w: "unavailable" }]);
  } finally {
    await db.close();
  }
}, 120_000);
