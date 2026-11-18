import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";
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

pg16It("records one notice per workflow event in the caller's transaction, stores no address, and projects only fixed words", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
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
    await Promise.all([0, 1].map(() => db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV])));
    await db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV]);
    // The same event id with other facts, or a second event at the same revision, is refused.
    await expect(db.sql(record, [a.id, QUEUED, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "23505" });
    await expect(db.sql(record, [b.id, QUEUED, "request_reviewing", 2, ENV])).rejects.toMatchObject({ code: "23505" });
    await expect(db.sql(record, [b.id, QUEUED, "request_received_queued", 1, "ea-other"])).rejects.toMatchObject({ code: "23505" });
    await expect(db.sql(record, [b.id, OTHER, "request_received_queued", 1, ENV])).rejects.toMatchObject({ code: "23505" });

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
    const first = racingBind[0].rows[0].bound;
    expect([DIGEST_A, DIGEST_B]).toContain(first);
    expect(racingBind[1].rows[0].bound).toBe(first);
    expect((await db.asRole("service_role", bind, [keyQueued, DIGEST_A === first ? DIGEST_B : DIGEST_A])).rows).toEqual([{ bound: first }]);
    // Recording the same event again does not clear the binding.
    await db.sql(record, [b.id, QUEUED, "request_received_queued", 1, ENV]);
    expect((await db.asRole("service_role", bind, [keyQueued, DIGEST_B])).rows).toEqual([{ bound: first }]);

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
  } finally {
    await db.close();
  }
}, 120_000);
