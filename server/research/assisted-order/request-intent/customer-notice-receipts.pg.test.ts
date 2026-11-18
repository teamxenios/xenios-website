import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";

const S = "request_intent_private";
const ENV = "ea-fixture";
const enqueue = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const record = "select public.request_intent_customer_notice_receipt_record($1::text, $2::uuid, $3::text, $4::text) as d";
const reconcile = "select public.request_intent_customer_notice_receipts_reconcile($1::uuid) as n";
const evidence = `select ${S}.customer_notice_receipt_evidence($1::uuid, $2::uuid) as e`;
const QUEUED = "50000000-0000-4000-8000-000000000001";
const MESSAGE = "6b1d2c3e-0000-4000-8000-0000000000aa";
const QUOTE_MESSAGE = "6b1d2c3e-0000-4000-8000-0000000000bb";
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);
const D3 = "3".repeat(64);

pg16It("records each provider receipt once, attaches it only by the notice job's stored provider id, and keeps no address", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    // Filename order: the pending reader, the request workflow, its notices, then these receipts.
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261118145200_request_customer_notice_delivery_receipts.sql", "utf8");
    await db.sql(migration);
    await db.sql(migration);

    const { app } = db.application(db.adapter().client);
    expect((await db.post(app, "", submission(), "a")).status).toBe(200);
    const [saved] = await db.snapshot();
    await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, processor_user_id, changed_at)
      select id, $2, 'queued', 1, gen_random_uuid(), null, created_at from ${S}.requests where id = $1`, [saved.id, ENV]);
    await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at)
      select gen_random_uuid(), id, 0, 'received', created_at from ${S}.requests where id = $1
      union all select $2::uuid, id, 1, 'queued', created_at from ${S}.requests where id = $1`, [saved.id, QUEUED]);
    await db.sql(enqueue, [saved.id, QUEUED, "request_received_queued", 1, ENV]);
    const key = "ea-request-customer-" + QUEUED;

    // Only the backend role can record or reconcile, and no role can read the table or the evidence function.
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, record, ["evt_a", MESSAGE, "accepted", D1])).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, reconcile, [MESSAGE])).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.sql(record, ["evt_a", MESSAGE, "accepted", D1])).rejects.toMatchObject({ code: "42501" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, `select * from ${S}.workflow_notice_receipts`)).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, evidence, [saved.id, QUEUED])).rejects.toMatchObject({ code: "42501" });
    }
    for (const bad of [
      ["evt bad", MESSAGE, "accepted", D1],
      ["evt_a", null, "accepted", D1],
      ["evt_a", MESSAGE, "opened", D1],
      ["evt_a", MESSAGE, "accepted", "not-a-digest"],
    ]) {
      await expect(db.asRole("service_role", record, bad)).rejects.toMatchObject({ code: "22023" });
    }
    await expect(db.asRole("service_role", reconcile, [null])).rejects.toMatchObject({ code: "22023" });

    // The provider reports a send before the worker has stored its id: kept, unmatched.
    expect((await db.asRole("service_role", record, ["evt_a", MESSAGE, "accepted", D1])).rows).toEqual([{ d: "unmatched" }]);
    expect((await db.sql(evidence, [saved.id, QUEUED])).rows).toEqual([{ e: "none" }]);

    // The worker stores the provider id (in whatever case the provider returned) and reconciles.
    await db.sql("update public.research_notification_outbox set status = 'sent', provider_message_id = $2 where event_key = $1",
      [key, MESSAGE.toUpperCase()]);
    expect((await db.asRole("service_role", reconcile, [MESSAGE])).rows).toEqual([{ n: 1 }]);
    expect((await db.asRole("service_role", reconcile, [MESSAGE])).rows).toEqual([{ n: 0 }]);
    expect((await db.sql(evidence, [saved.id, QUEUED])).rows).toEqual([{ e: "provider_accepted" }]);

    // Later reports attach at once. A replay of the same facts records nothing new.
    expect((await db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D2])).rows).toEqual([{ d: "matched" }]);
    expect((await db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D2])).rows).toEqual([{ d: "matched" }]);
    expect((await db.sql(evidence, [saved.id, QUEUED])).rows).toEqual([{ e: "delivered" }]);
    // The same event id with any other fact is refused.
    await expect(db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D3])).rejects.toMatchObject({ code: "23505" });
    await expect(db.asRole("service_role", record, ["evt_b", MESSAGE, "bounced", D2])).rejects.toMatchObject({ code: "23505" });
    await expect(db.asRole("service_role", record, ["evt_b", QUOTE_MESSAGE, "delivered", D2])).rejects.toMatchObject({ code: "23505" });

    // Concurrent deliveries of one event leave one row.
    const racing = await Promise.all(Array.from({ length: 6 }, () => db.asRole("service_role", record, ["evt_c", MESSAGE, "bounced", D3])));
    expect(racing.map(r => r.rows[0].d)).toEqual(Array(6).fill("matched"));
    // A delivery and a bounce for one message are reported as a conflict, not resolved.
    expect((await db.sql(evidence, [saved.id, QUEUED])).rows).toEqual([{ e: "conflicting" }]);
    // Asked about under another request, or for another event, the notice is not acknowledged.
    expect((await db.sql(evidence, [randomUUID(), QUEUED])).rows).toEqual([{ e: "unavailable" }]);
    expect((await db.sql(evidence, [saved.id, randomUUID()])).rows).toEqual([{ e: "unavailable" }]);

    // A report about mail that is not a customer notice never attaches, even with a stored provider id.
    await db.sql(`insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload, status, provider_message_id)
      values ('qd-synthetic', 'ea_private_quote_notice_v1', 'ea_private_quote_notice_v1', 'buyer@example.invalid', '{}'::jsonb, 'sent', $1)`, [QUOTE_MESSAGE]);
    expect((await db.asRole("service_role", record, ["evt_d", QUOTE_MESSAGE, "delivered", D1])).rows).toEqual([{ d: "unmatched" }]);
    expect((await db.asRole("service_role", reconcile, [QUOTE_MESSAGE])).rows).toEqual([{ n: 0 }]);

    // What is stored: four facts and two times per event, no address, subject or provider text.
    const columns = (await db.sql(`select column_name from information_schema.columns
      where table_schema = $1 and table_name = 'workflow_notice_receipts' order by column_name`, [S])).rows.map(r => r.column_name);
    expect(columns).toEqual(["digest", "kind", "matched_at", "notice_event_id", "provider_event_id", "provider_message_id", "received_at"]);
    const rows = (await db.sql(`select provider_event_id, provider_message_id::text as message, kind, notice_event_id::text as notice
      from ${S}.workflow_notice_receipts order by provider_event_id`)).rows;
    expect(rows).toEqual([
      { provider_event_id: "evt_a", message: MESSAGE, kind: "accepted", notice: QUEUED },
      { provider_event_id: "evt_b", message: MESSAGE, kind: "delivered", notice: QUEUED },
      { provider_event_id: "evt_c", message: MESSAGE, kind: "bounced", notice: QUEUED },
      { provider_event_id: "evt_d", message: QUOTE_MESSAGE, kind: "delivered", notice: null },
    ]);
    expect(JSON.stringify((await db.sql(`select * from ${S}.workflow_notice_receipts`)).rows)).not.toContain("@");

    // Recording a receipt changes no notice job.
    expect((await db.sql("select status from public.research_notification_outbox where event_key = $1", [key])).rows)
      .toEqual([{ status: "sent" }]);

    // Unmatched receipts can be purged once over a day old; attached ones stay.
    const purge = `select ${S}.purge_unmatched_customer_notice_receipts($1::timestamptz) as n`;
    await expect(db.sql(purge, [new Date().toISOString()])).rejects.toMatchObject({ code: "22023" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, purge, ["2026-01-01T00:00:00Z"])).rejects.toMatchObject({ code: "42501" });
    }
    await db.sql(`update ${S}.workflow_notice_receipts set received_at = clock_timestamp() - interval '2 days' where provider_event_id = 'evt_d'`);
    expect((await db.sql(`select ${S}.purge_unmatched_customer_notice_receipts(clock_timestamp() - interval '1 day') as n`)).rows)
      .toEqual([{ n: 1 }]);
    expect((await db.sql(`select count(*)::int as n from ${S}.workflow_notice_receipts`)).rows).toEqual([{ n: 3 }]);

    // A notice with receipts cannot be deleted before its receipts.
    await expect(db.sql(`delete from ${S}.workflow_notice_intents where event_id = $1`, [QUEUED])).rejects.toMatchObject({ code: "23503" });
  } finally {
    await db.close();
  }
});
