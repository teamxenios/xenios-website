import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";
import { REQUEST_SUBMITTED_STAFF_TEMPLATE } from "./staff-notice";

const reconcile = "select public.request_intent_enqueue_staff_notices($1::timestamptz, $2::text[]) as queued";
const recipients = ["team@example.invalid", "samuel@example.invalid"];

pg16It("reconciles only committed requests into one private staff notice, even after a lost reply", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql", "utf8");
    await db.sql(migration);
    await db.sql(migration);
    const since = (await db.sql("select now() as since")).rows[0].since;
    const args = [since, recipients];
    const first = db.application(db.adapter({ loseCreateReply: true }).client);
    const input = submission();
    await expect(db.asRole("anon", reconcile, args)).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("authenticated", reconcile, args)).rejects.toMatchObject({ code: "42501" });
    const rejected = await db.post(first.app, "", { ...input, lines: [] });
    expect(rejected.status).toBe(400);
    expect((await db.asRole("service_role", reconcile, args)).rows).toEqual([{ queued: 0 }]);

    const lost = await db.post(first.app, "", input);
    expect(lost.status).toBe(503);
    expect((await db.snapshot())).toHaveLength(1);
    const [saved] = await db.snapshot();
    expect((await db.asRole("service_role", reconcile, [new Date(since.getTime() + 60_000), recipients])).rows)
      .toEqual([{ queued: 0 }]);
    const sweeps = await Promise.all([
      db.asRole("service_role", reconcile, args),
      db.asRole("service_role", reconcile, args),
    ]);
    expect(sweeps.flatMap(r => r.rows.map(row => row.queued)).sort()).toEqual([0, 1]);
    const fresh = db.application(db.adapter().client);
    const retry = await db.post(fresh.app, "", input);
    expect(retry.status).toBe(200);
    expect(retry.body.publicReference).toBe(saved.public_reference);
    expect((await db.asRole("service_role", reconcile, args)).rows).toEqual([{ queued: 0 }]);
    expect((await db.sql(`
      select event_key, event_type, template_key, recipient, payload, status
      from public.research_notification_outbox
    `)).rows).toEqual([{
      event_key: "ea-request-submitted-" + saved.id,
      event_type: REQUEST_SUBMITTED_STAFF_TEMPLATE,
      template_key: REQUEST_SUBMITTED_STAFF_TEMPLATE,
      recipient: recipients[0],
      status: "pending",
      payload: {
        reference: saved.public_reference,
        submittedAt: expect.any(String),
        itemCount: input.lines.length,
        recipients,
      },
    }]);
  } finally {
    await db.close();
  }
}, 120_000);
