import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission, OPERATOR } from "./durable-journey.pg.fixture";
import { CUSTOMER_NOTICE_TEMPLATES, CUSTOMER_NOTICE_UNCONFIRMED } from "./customer-notice";

const S = "request_intent_private";
const ENV = "ea-fixture";
const record = `select ${S}.enqueue_workflow_notice($1::uuid, $2::uuid, $3::text, $4::bigint, $5::text)`;
const project = `select ${S}.workflow_customer_notice($1::uuid, $2::uuid) as notice`;
const delivery = "select public.request_intent_customer_notice_delivery($1::text) as facts";
const bind = "select public.request_intent_customer_notice_bind($1::text, $2::text) as bound";
const DIGEST_A = "a".repeat(64);
const DIGEST_B = "b".repeat(64);
const QUEUED = "40000000-0000-4000-8000-000000000001";
const REVIEWING = "40000000-0000-4000-8000-000000000002";
const OTHER = "40000000-0000-4000-8000-000000000003";
const MISSING = "40000000-0000-4000-8000-000000000004";
// A fixed review time, far from the clock, so a notice that used its own clock would show.
const REVIEW_STARTED_AT = "2026-11-18T14:30:59.999999Z";

pg16It("records one notice per workflow event in the caller's transaction, stores no address, and projects only fixed words", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    // Filename order: the pending reader, the request workflow, then these notices.
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8");
    await db.sql(migration);
    await db.sql(migration);

    const { app } = db.application(db.adapter().client);
    const first = submission();
    expect((await db.post(app, "", first, "a")).status).toBe(200);
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
    const saved = await db.snapshot();
    const a = saved.find(row => row.contact.fullLegalName === first.contact.fullLegalName)!;
    const b = saved.find(row => row.contact.fullLegalName === "Jordan Example")!;
    const keyQueued = "ea-request-customer-" + QUEUED;
    const keyReviewing = "ea-request-customer-" + REVIEWING;

    // The workflow's own events for the two requests: a is queued, b has started review.
    await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, processor_user_id, changed_at)
      select id, $2, 'queued', 1, gen_random_uuid(), null, created_at from ${S}.requests where id = $1`, [a.id, ENV]);
    await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, processor_user_id, changed_at)
      values ($1, $2, 'reviewing', 2, gen_random_uuid(), $3, $4::timestamptz)`, [b.id, ENV, OPERATOR, REVIEW_STARTED_AT]);
    for (const [requestId, queuedId] of [[a.id, OTHER], [b.id, QUEUED]]) {
      await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at)
        select gen_random_uuid(), id, 0, 'received', created_at from ${S}.requests where id = $1
        union all select $2::uuid, id, 1, 'queued', created_at from ${S}.requests where id = $1`, [requestId, queuedId]);
    }
    await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at, actor_user_id, command_id)
      values ($1, $2, 2, 'review_started', $3::timestamptz, $4, gen_random_uuid())`, [REVIEWING, b.id, REVIEW_STARTED_AT, OPERATOR]);

    // The two workflow functions are private: no application role can call them.
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, record, [b.id, QUEUED, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, project, [b.id, QUEUED])).rejects.toMatchObject({ code: "42501" });
    }

    // Refusals raise, so the workflow transaction that called them cannot commit.
    await expect(db.sql(record, [b.id, QUEUED, "request_closed", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, QUEUED, "request_received_queued", -1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, QUEUED, "request_received_queued", 1, "Not An Environment"])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, null, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, ["00000000-0000-4000-8000-000000000009", QUEUED, "request_received_queued", 1, ENV]))
      .rejects.toMatchObject({ code: "23503" });
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows).toEqual([{ n: 0 }]);
    expect((await db.sql(project, [b.id, QUEUED])).rows).toEqual([{ notice: "unavailable" }]);

    // A notice recorded by a caller whose transaction then fails leaves nothing behind.
    expect(b.id).toMatch(/^[0-9a-f-]{36}$/);
    await expect(db.sql(`do $$ begin
      perform ${S}.enqueue_workflow_notice('${b.id}'::uuid, '${QUEUED}'::uuid, 'request_received_queued', 1::bigint, '${ENV}');
      raise exception 'caller_failed_after_recording';
    end $$`)).rejects.toThrow(/caller_failed_after_recording/);
    expect((await db.sql(`select count(*)::int as n from ${S}.workflow_notice_intents`)).rows).toEqual([{ n: 0 }]);
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows).toEqual([{ n: 0 }]);

    // Recording the same event twice, even at once, leaves one intent and one job.
    await Promise.all(Array.from({ length: 8 }, () => db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV])));
    await db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV]);
    // A notice must name one recorded event of its own request, of the matching kind and revision.
    await expect(db.sql(record, [a.id, QUEUED, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, QUEUED, "request_reviewing", 2, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, REVIEWING, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, OTHER, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(record, [b.id, MISSING, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "22023" });
    // The same event id with other facts is refused.
    await expect(db.sql(record, [b.id, QUEUED, "request_received_queued", 1, "ea-other"])).rejects.toMatchObject({ code: "23505" });

    const jobs = (await db.sql(
      "select event_key, event_type, template_key, recipient, status, payload from public.research_notification_outbox",
    )).rows;
    expect(jobs).toEqual([{
      event_key: keyQueued, event_type: CUSTOMER_NOTICE_TEMPLATES.request_received_queued,
      template_key: CUSTOMER_NOTICE_TEMPLATES.request_received_queued,
      recipient: "customer:" + b.public_reference, status: "pending",
      payload: {
        reference: b.public_reference, eventAt: expect.any(String), kind: "request_received_queued",
        revision: 1, environment: ENV,
      },
    }]);
    // The queue keeps the reference only: no address, name or other contact detail is written to it.
    const queued = JSON.stringify([jobs, (await db.sql(`select * from ${S}.workflow_notice_intents`)).rows]);
    for (const value of ["jordan", "Jordan", "example.invalid", "Fictional", "5555550199", "Synthetic"]) {
      expect(queued).not.toContain(value);
    }

    // The worker's read: backend role only, this event only, the address and one flag.
    await expect(db.asRole("anon", delivery, [keyQueued])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("authenticated", delivery, [keyQueued])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", delivery, ["not-a-key"])).rejects.toMatchObject({ code: "22023" });
    await expect(db.asRole("service_role", delivery, ["ea-request-submitted-" + b.id])).rejects.toMatchObject({ code: "22023" });
    expect((await db.asRole("service_role", delivery, ["ea-request-customer-" + OTHER])).rows).toEqual([{ facts: null }]);
    expect((await db.asRole("service_role", delivery, [keyQueued])).rows)
      .toEqual([{ facts: { address: "jordan@example.invalid", superseded: false } }]);

    // The first digest bound for an event stays: a later attempt with other bytes gets the first one back.
    await expect(db.asRole("anon", bind, [keyQueued, DIGEST_A])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("authenticated", bind, [keyQueued, DIGEST_A])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", bind, [keyQueued, "not-a-digest"])).rejects.toMatchObject({ code: "22023" });
    await expect(db.asRole("service_role", bind, ["not-a-key", DIGEST_A])).rejects.toMatchObject({ code: "22023" });
    expect((await db.asRole("service_role", bind, ["ea-request-customer-" + OTHER, DIGEST_A])).rows).toEqual([{ bound: null }]);
    const racingBind = await Promise.all([DIGEST_A, DIGEST_B].map(digest => db.asRole("service_role", bind, [keyQueued, digest])));
    const firstBound = racingBind[0].rows[0].bound;
    expect([DIGEST_A, DIGEST_B]).toContain(firstBound);
    expect(racingBind[1].rows[0].bound).toBe(firstBound);
    expect((await db.asRole("service_role", bind, [keyQueued, DIGEST_A === firstBound ? DIGEST_B : DIGEST_A])).rows).toEqual([{ bound: firstBound }]);
    // Recording the same event again does not clear the binding.
    await db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV]);
    expect((await db.asRole("service_role", bind, [keyQueued, DIGEST_B])).rows).toEqual([{ bound: firstBound }]);

    // The projection follows the job, in fixed words.
    const setJob = (key: string, status: string, error: string | null = null) => db.sql(
      "update public.research_notification_outbox set status = $2, last_error_summary = $3 where event_key = $1", [key, status, error]);
    const notice = async (requestId: string, eventId: string) => (await db.sql(project, [requestId, eventId])).rows[0].notice;
    expect(await notice(b.id, QUEUED)).toBe("pending");
    // Asked about under another request, the event is not acknowledged at all.
    expect(await notice(a.id, QUEUED)).toBe("unavailable");
    for (const [status, word] of [["processing", "pending"], ["failed_retryable", "pending"], ["sent", "provider_accepted"],
      ["delivered", "delivered_to_server"], ["cancelled", "suppressed"]] as const) {
      await setJob(keyQueued, status);
      expect(await notice(b.id, QUEUED)).toBe(word);
    }
    await setJob(keyQueued, "failed_permanent", "Not sent: recorded more than 23 hours ago. Open the request in the private queue.");
    expect(await notice(b.id, QUEUED)).toBe("suppressed");
    await setJob(keyQueued, "failed_permanent", "Customer notice was refused by the mail provider.");
    expect(await notice(b.id, QUEUED)).toBe("failed");
    // A stopped job with a send that was never confirmed may have been delivered.
    await db.sql(
      "insert into public.research_notification_attempts (outbox_id, attempt, outcome, error_summary) select id, 1, 'failed', $2 from public.research_notification_outbox where event_key = $1",
      [keyQueued, CUSTOMER_NOTICE_UNCONFIRMED],
    );
    expect(await notice(b.id, QUEUED)).toBe("delivery_unknown");
    await setJob(keyQueued, "sent");
    expect(await notice(b.id, QUEUED)).toBe("provider_accepted");
    await setJob(keyQueued, "pending");

    // A later event for the same request replaces the earlier notice, and only for that request.
    await db.sql(record, [a.id, OTHER, "request_received_queued", 1, ENV]);
    await db.sql(record, [b.id, REVIEWING, "request_reviewing", 2, ENV]);
    expect((await db.asRole("service_role", delivery, [keyQueued])).rows)
      .toEqual([{ facts: { address: "jordan@example.invalid", superseded: true } }]);
    expect((await db.asRole("service_role", delivery, [keyReviewing])).rows)
      .toEqual([{ facts: { address: "jordan@example.invalid", superseded: false } }]);
    expect((await db.asRole("service_role", delivery, ["ea-request-customer-" + OTHER])).rows)
      .toEqual([{ facts: { address: "synthetic@example.invalid", superseded: false } }]);
    expect((await db.sql("select event_key, template_key from public.research_notification_outbox order by event_key")).rows).toEqual([
      { event_key: keyQueued, template_key: CUSTOMER_NOTICE_TEMPLATES.request_received_queued },
      { event_key: keyReviewing, template_key: CUSTOMER_NOTICE_TEMPLATES.request_reviewing },
      { event_key: "ea-request-customer-" + OTHER, template_key: CUSTOMER_NOTICE_TEMPLATES.request_received_queued },
    ]);
    // Each notice carries its event's recorded time, not the time the notice was written.
    expect((await db.sql(`select o.event_key, (o.payload->>'eventAt')::timestamptz = e.occurred_at as same
      from public.research_notification_outbox o join ${S}.workflow_events e on o.event_key = 'ea-request-customer-' || e.id
      order by o.event_key`)).rows).toEqual([
      { event_key: keyQueued, same: true },
      { event_key: keyReviewing, same: true },
      { event_key: "ea-request-customer-" + OTHER, same: true },
    ]);
    expect((await db.sql(`select (payload->>'eventAt')::timestamptz = $2::timestamptz as same
      from public.research_notification_outbox where event_key = $1`, [keyReviewing, REVIEW_STARTED_AT])).rows).toEqual([{ same: true }]);

    // A job under a customer key that the workflow did not record gives the worker nothing.
    await db.sql("delete from public.research_notification_outbox where event_key = $1", [keyReviewing]);
    await db.sql(
      "insert into public.research_notification_outbox (event_key, event_type, template_key, recipient, payload) values ($1, 'other', 'other', 'nobody', '{}'::jsonb)",
      [keyReviewing],
    );
    expect((await db.asRole("service_role", delivery, [keyReviewing])).rows).toEqual([{ facts: null }]);

    // None of this wrote an access event, so staff_read and queue_list still mean a person read the request.
    expect((await db.sql("select event_type, count(*)::int as n from request_intent_private.access_events group by 1")).rows)
      .toEqual([{ event_type: "submitted", n: 2 }]);

    // Composed with the real workflow: once it is switched on, a new request records its
    // queued event and exactly one notice in the same transaction, and the workflow's
    // projection reads that notice back in a fixed word.
    await db.sql(`update ${S}.workflow_settings set environment = $1, start_at = clock_timestamp(), enabled = true,
      retention_policy_version = 'synthetic-policy', recipient_policy_version = 'synthetic-contact'`, [ENV]);
    const third = { ...submission(), idempotencyKey: "20000000-0000-4000-8000-000000000003" };
    expect((await db.post(app, "", third, "a")).status).toBe(200);
    const composed = (await db.sql(`select e.request_id, e.id as event_id, o.template_key,
        (o.payload->>'eventAt')::timestamptz = e.occurred_at as same_time, o.payload->>'environment' as environment
      from ${S}.workflow_events e
      join ${S}.workflow_notice_intents i on i.event_id = e.id
      join public.research_notification_outbox o on o.event_key = 'ea-request-customer-' || e.id
      where e.kind = 'queued' and e.request_id not in ($1, $2)`, [a.id, b.id])).rows;
    expect(composed).toEqual([{
      request_id: expect.any(String), event_id: expect.any(String),
      template_key: CUSTOMER_NOTICE_TEMPLATES.request_received_queued, same_time: true, environment: ENV,
    }]);
    expect((await db.sql(`select ${S}.workflow_projection($1) ->> 'customerNotice' as notice`, [composed[0].request_id])).rows)
      .toEqual([{ notice: "pending" }]);
  } finally {
    await db.close();
  }
}, 120_000);


pg16It("waits for competing notice commits and rollbacks without treating a different event as a replay", async () => {
  const db = createDurableJourneyFixture();
  let pool: ReturnType<typeof db.poolForLogin> | undefined;
  try {
    await db.start({ managedCareSchema: true });
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8"));
    expect((await db.sql(`select contype, pg_get_constraintdef(oid) as definition from pg_constraint
      where conrelid = 'request_intent_private.workflow_notice_intents'::regclass and contype in ('p','u')
      order by contype`)).rows).toEqual([
      { contype: "p", definition: "PRIMARY KEY (event_id)" },
      { contype: "u", definition: "UNIQUE (request_id, revision)" },
    ]);
    const { app } = db.application(db.adapter().client);
    const seed = async (name: string, eventId: string) => {
      const input = submission();
      input.idempotencyKey = randomUUID();
      input.contact.fullLegalName = name;
      expect((await db.post(app, "", input, "a")).status).toBe(200);
      const saved = (await db.snapshot()).find(row => row.contact.fullLegalName === name)!;
      expect(saved).toBeDefined();
      await db.sql(`insert into ${S}.workflow (request_id, environment, state, revision, initial_queue_cycle_id, changed_at)
        select id, $2, 'queued', 1, gen_random_uuid(), created_at from ${S}.requests where id = $1`, [saved.id, ENV]);
      await db.sql(`insert into ${S}.workflow_events (id, request_id, revision, kind, occurred_at)
        select gen_random_uuid(), id, 0, 'received', created_at from ${S}.requests where id = $1
        union all select $2::uuid, id, 1, 'queued', created_at from ${S}.requests where id = $1`, [saved.id, eventId]);
      return saved;
    };
    const committedId = "50000000-0000-4000-8000-000000000001";
    const rolledBackId = "50000000-0000-4000-8000-000000000002";
    const conflictId = "50000000-0000-4000-8000-000000000003";
    const otherId = "50000000-0000-4000-8000-000000000004";
    const committed = await seed("Synthetic committed writer", committedId);
    const rolledBack = await seed("Synthetic rolled back writer", rolledBackId);
    const conflict = await seed("Synthetic conflicting revision", conflictId);

    // This fixture-only login obtains two persistent independent connections.
    // It can call only this private function, not read or mutate either table.
    // No actual application role receives a grant; the owned DB is destroyed.
    const password = randomUUID();
    expect(password).toMatch(/^[0-9a-f-]{36}$/);
    await db.sql("create role notice_race_fixture login password '" + password + "'");
    await db.sql(`grant usage on schema ${S} to notice_race_fixture;
      grant execute on function ${S}.enqueue_workflow_notice(uuid,uuid,text,bigint,text) to notice_race_fixture`);
    expect((await db.sql(`select bool_and(not has_function_privilege(role_name,
      'request_intent_private.enqueue_workflow_notice(uuid,uuid,text,bigint,text)', 'execute')) as denied
      from (values ('anon'),('authenticated'),('service_role')) roles(role_name)`)).rows).toEqual([{ denied: true }]);
    pool = db.poolForLogin("notice_race_fixture", password);

    const behindWriter = async (requestId: string, eventId: string, finish: "commit" | "rollback") => {
      const writer = await pool!.connect();
      let replay: PoolClient | undefined;
      let pending: Promise<{ error?: unknown }> | undefined;
      try {
        replay = await pool!.connect();
        await writer.query("set statement_timeout = '8s'");
        await replay.query("set statement_timeout = '8s'");
        expect((await replay.query("show transaction_isolation")).rows[0].transaction_isolation).toBe("read committed");
        const writerPid = (await writer.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        const replayPid = (await replay.query("select pg_backend_pid() as pid")).rows[0].pid as number;
        expect(replayPid).not.toBe(writerPid);
        await writer.query("begin isolation level read committed");
        const args = [requestId, eventId, "request_received_queued", 1, ENV];
        await writer.query(record, args);
        pending = replay.query(record, args).then(() => ({}), (error: unknown) => ({ error }));
        // Observe the actual unique-index wait, rather than sleep and guess
        // whether the competing statement had reached the uncommitted row.
        await expect.poll(async () => (await db.sql(
          "select $1::int = any(pg_blocking_pids($2::int)) as blocked", [writerPid, replayPid],
        )).rows, { timeout: 5_000, interval: 25 }).toEqual([{ blocked: true }]);
        await writer.query(finish);
        const result = await pending;
        if (result.error) throw result.error;
      } finally {
        try {
          await writer.query("rollback");
          if (pending) await pending;
        } finally {
          replay?.release();
          writer.release();
        }
      }
      expect((await db.sql(`select event_id, request_id, revision::int as revision from ${S}.workflow_notice_intents where request_id = $1`, [requestId])).rows)
        .toEqual([{ event_id: eventId, request_id: requestId, revision: 1 }]);
      expect((await db.sql("select event_key from public.research_notification_outbox where event_key = $1",
        ["ea-request-customer-" + eventId])).rows).toEqual([{ event_key: "ea-request-customer-" + eventId }]);
    };
    await behindWriter(committed.id, committedId, "commit");
    await behindWriter(rolledBack.id, rolledBackId, "rollback");

    // A secondary-key-only conflict must not be swallowed as an identical
    // replay. Seed a fixture-owner inconsistency and prove it stays untouched.
    await db.sql(`insert into ${S}.workflow_notice_intents
      (event_id,request_id,kind,revision,environment,attempt_digest)
      values ($1,$2,'request_received_queued',1,$3,$4)`, [otherId, conflict.id, ENV, DIGEST_A]);
    await expect(db.sql(record, [conflict.id, conflictId, "request_received_queued", 1, ENV]))
      .rejects.toMatchObject({ code: "23505", message: "workflow_notice_identity_conflict" });
    expect((await db.sql(`select event_id, attempt_digest from ${S}.workflow_notice_intents where request_id = $1`, [conflict.id])).rows)
      .toEqual([{ event_id: otherId, attempt_digest: DIGEST_A }]);
    expect((await db.sql("select event_key from public.research_notification_outbox where event_key in ($1,$2)",
      ["ea-request-customer-" + conflictId, "ea-request-customer-" + otherId])).rows).toEqual([]);
  } finally {
    try { if (pool) await pool.end(); } finally { await db.close(); }
  }
}, 120_000);
