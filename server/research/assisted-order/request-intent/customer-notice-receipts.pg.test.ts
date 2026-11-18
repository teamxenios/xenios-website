import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { expect } from "vitest";
import { createDurableJourneyFixture, OPERATOR, pg16It, submission } from "./durable-journey.pg.fixture";

const S = "request_intent_private";
const ENV = "ea-fixture";
const enqueue = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const record = "select public.request_intent_customer_notice_receipt_record($1::text, $2::uuid, $3::text, $4::text) as d";
const evidence = `select ${S}.customer_notice_receipt_evidence($1::uuid, $2::uuid) as e`;
const storeId = "update public.research_notification_outbox set status = 'sent', provider_message_id = $2 where event_key = $1";
const QUEUED = "50000000-0000-4000-8000-000000000001";
const REVIEW = "50000000-0000-4000-8000-000000000002";
const MESSAGE = "6b1d2c3e-0000-4000-8000-0000000000aa";
const REVIEW_MESSAGE = "6b1d2c3e-0000-4000-8000-0000000000cc";
const QUOTE_MESSAGE = "6b1d2c3e-0000-4000-8000-0000000000bb";
const D1 = "1".repeat(64);
const D2 = "2".repeat(64);
const D3 = "3".repeat(64);

pg16It("records each provider receipt once, joins it to a notice only through that notice's stored provider id when read, and keeps no address", async () => {
  const db = createDurableJourneyFixture();
  let pool: ReturnType<typeof db.poolForLogin> | undefined;
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    // Filename order: the pending reader, the request workflow, its notices, then these receipts.
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261118172136_request_customer_notice_delivery_receipts.sql", "utf8");
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
    const read = async (event = QUEUED) => (await db.sql(evidence, [saved.id, event])).rows[0].e;

    // Only the backend role can record. No role can read the table, the evidence or the purge.
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, record, ["evt_a", MESSAGE, "accepted", D1])).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.sql(record, ["evt_a", MESSAGE, "accepted", D1])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", record, ["evt_a", MESSAGE, "accepted", D1], OPERATOR))
      .rejects.toMatchObject({ code: "42501" });
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
    // There is no write-time matching and no reconcile step to forget or lose.
    expect((await db.sql(`select to_regprocedure('public.request_intent_customer_notice_receipts_reconcile(uuid)') is null as gone,
      to_regprocedure('${S}.match_customer_notice_receipts(uuid)') is null as unmatched_gone`)).rows)
      .toEqual([{ gone: true, unmatched_gone: true }]);
    expect(await read()).toBe("none");

    // Two persistent connections for the interleavings. This fixture-only login
    // can become the backend role and touch only the outbox; the owned database
    // is destroyed afterwards and no application role receives a grant.
    const password = randomUUID();
    expect(password).toMatch(/^[0-9a-f-]{36}$/);
    // bypassrls because the outbox has row security and no policies.
    await db.sql("create role receipt_race_fixture login bypassrls password '" + password + "'");
    await db.sql("grant service_role to receipt_race_fixture; grant select, update on public.research_notification_outbox to receipt_race_fixture");
    pool = db.poolForLogin("receipt_race_fixture", password);
    const open = async () => {
      const client = await pool!.connect();
      await client.query("set statement_timeout = '8s'");
      await client.query("begin isolation level read committed");
      return client;
    };
    const finish = async (client: PoolClient, end: "commit" | "rollback") => {
      try { await client.query(end); } finally { client.release(); }
    };

    // Interleaving 1. The provider's report is written while no send id is
    // stored, and stays uncommitted; the worker then commits the send id; the
    // report commits last. With nothing else run, the next read sees both.
    const report = await open();
    try {
      await report.query("set local role service_role");
      await report.query("select set_config('request.jwt.claim.sub', '', true)");
      expect((await report.query(record, ["evt_a", MESSAGE, "accepted", D1])).rows).toEqual([{ d: "recorded" }]);
      // The worker stores the id in whatever case the provider returned.
      await db.sql(storeId, [queuedKey, MESSAGE.toUpperCase()]);
      expect(await read()).toBe("none");
    } catch (error) {
      await finish(report, "rollback");
      throw error;
    }
    await finish(report, "commit");
    expect(await read()).toBe("provider_accepted");

    // Interleaving 2. The worker's send id is written and stays uncommitted
    // while the provider's report commits; the send id commits last.
    const ack = await open();
    try {
      expect((await ack.query(storeId, [reviewKey, REVIEW_MESSAGE])).rowCount).toBe(1);
      expect((await db.asRole("service_role", record, ["evt_r", REVIEW_MESSAGE, "delivered", D2])).rows).toEqual([{ d: "recorded" }]);
      expect(await read(REVIEW)).toBe("none");
    } catch (error) {
      await finish(ack, "rollback");
      throw error;
    }
    await finish(ack, "commit");
    expect(await read(REVIEW)).toBe("delivered");
    // A worker lost between storing the id and anything after it changes
    // nothing: there is no later step. The two committed rows are the answer.

    // Later reports. A replay of the same facts records nothing new.
    expect((await db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D2])).rows).toEqual([{ d: "recorded" }]);
    expect((await db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D2])).rows).toEqual([{ d: "replayed" }]);
    expect(await read()).toBe("delivered");
    // The same event id with any other fact is refused.
    await expect(db.asRole("service_role", record, ["evt_b", MESSAGE, "delivered", D3])).rejects.toMatchObject({ code: "23505" });
    await expect(db.asRole("service_role", record, ["evt_b", MESSAGE, "bounced", D2])).rejects.toMatchObject({ code: "23505" });
    await expect(db.asRole("service_role", record, ["evt_b", QUOTE_MESSAGE, "delivered", D2])).rejects.toMatchObject({ code: "23505" });

    // Concurrent deliveries of one event leave one row: one recording, the rest replays.
    const racing = await Promise.all(Array.from({ length: 6 }, () => db.asRole("service_role", record, ["evt_c", MESSAGE, "bounced", D3])));
    expect(racing.map(r => r.rows[0].d).sort()).toEqual(["recorded", ...Array(5).fill("replayed")]);
    // A delivery and a bounce for one message are reported as a conflict, not resolved.
    expect(await read()).toBe("conflicting");
    // Each notice reads only its own send's reports.
    expect(await read(REVIEW)).toBe("delivered");
    // Asked about under another request, or for another event, the notice is not acknowledged.
    expect((await db.sql(evidence, [randomUUID(), QUEUED])).rows).toEqual([{ e: "unavailable" }]);
    expect((await db.sql(evidence, [saved.id, randomUUID()])).rows).toEqual([{ e: "unavailable" }]);

    // A report about mail that is not a customer notice is kept but read for no notice.
    await db.sql(`insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload, status, provider_message_id)
      values ('qd-synthetic', 'ea_private_quote_notice_v1', 'ea_private_quote_notice_v1', 'buyer@example.invalid', '{}'::jsonb, 'sent', $1)`, [QUOTE_MESSAGE]);
    expect((await db.asRole("service_role", record, ["evt_d", QUOTE_MESSAGE, "delivered", D1])).rows).toEqual([{ d: "recorded" }]);
    expect(await read()).toBe("conflicting");
    // A provider id carried by a second job cannot be attributed, and a
    // malformed stored id is not read as anything.
    await db.sql(`insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload, status, provider_message_id)
      values ('qd-duplicate', 'ea_private_quote_notice_v1', 'ea_private_quote_notice_v1', 'buyer@example.invalid', '{}'::jsonb, 'sent', $1)`, [MESSAGE]);
    expect(await read()).toBe("unavailable");
    await db.sql("delete from public.research_notification_outbox where event_key = 'qd-duplicate'");
    expect(await read()).toBe("conflicting");
    await db.sql(storeId, [reviewKey, "re_not_a_uuid"]);
    expect(await read(REVIEW)).toBe("unavailable");
    await db.sql(storeId, [reviewKey, REVIEW_MESSAGE]);
    expect(await read(REVIEW)).toBe("delivered");

    // What is stored: four facts and a time per event, no address, subject or provider text.
    const columns = (await db.sql(`select column_name from information_schema.columns
      where table_schema = $1 and table_name = 'workflow_notice_receipts' order by column_name`, [S])).rows.map(r => r.column_name);
    expect(columns).toEqual(["digest", "kind", "provider_event_id", "provider_message_id", "received_at"]);
    const rows = (await db.sql(`select provider_event_id, provider_message_id::text as message, kind
      from ${S}.workflow_notice_receipts order by provider_event_id`)).rows;
    expect(rows).toEqual([
      { provider_event_id: "evt_a", message: MESSAGE, kind: "accepted" },
      { provider_event_id: "evt_b", message: MESSAGE, kind: "delivered" },
      { provider_event_id: "evt_c", message: MESSAGE, kind: "bounced" },
      { provider_event_id: "evt_d", message: QUOTE_MESSAGE, kind: "delivered" },
      { provider_event_id: "evt_r", message: REVIEW_MESSAGE, kind: "delivered" },
    ]);
    expect(JSON.stringify((await db.sql(`select * from ${S}.workflow_notice_receipts`)).rows)).not.toContain("@");

    // Recording a receipt changes no notice job.
    expect((await db.sql("select event_key, status from public.research_notification_outbox where event_key in ($1, $2) order by event_key",
      [queuedKey, reviewKey])).rows).toEqual([{ event_key: queuedKey, status: "sent" }, { event_key: reviewKey, status: "sent" }]);

    // Receipts no customer-notice job claims can be purged once over a day old; claimed ones stay.
    const purge = `select ${S}.purge_unmatched_customer_notice_receipts($1::timestamptz) as n`;
    await expect(db.sql(purge, [new Date().toISOString()])).rejects.toMatchObject({ code: "22023" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, purge, ["2026-01-01T00:00:00Z"])).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.asRole("service_role", record, ["evt_e", randomUUID(), "accepted", D1])).rows).toEqual([{ d: "recorded" }]);
    await db.sql(`update ${S}.workflow_notice_receipts set received_at = clock_timestamp() - interval '2 days'
      where provider_event_id in ('evt_a', 'evt_d', 'evt_e')`);
    expect((await db.sql(`select ${S}.purge_unmatched_customer_notice_receipts(clock_timestamp() - interval '1 day') as n`)).rows)
      .toEqual([{ n: 2 }]);
    expect((await db.sql(`select provider_event_id from ${S}.workflow_notice_receipts order by provider_event_id`)).rows
      .map(r => r.provider_event_id)).toEqual(["evt_a", "evt_b", "evt_c", "evt_r"]);
    expect(await read()).toBe("conflicting");
  } finally {
    try { if (pool) await pool.end(); } finally { await db.close(); }
  }
}, 120_000);

