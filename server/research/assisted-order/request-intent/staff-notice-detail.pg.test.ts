import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";
import {
  REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
  REQUEST_SUBMITTED_STAFF_TEMPLATE,
  mapStaffNoticeDetail,
  renderFullStaffNotice,
} from "./staff-notice";

const reconcile = "select public.request_intent_enqueue_staff_notices($1::timestamptz, $2::text[], $3::timestamptz) as queued";
const reconcileShort = "select public.request_intent_enqueue_staff_notices($1::timestamptz, $2::text[]) as queued";
const readDetail = "select public.request_intent_staff_notice_detail($1::text) as detail";
const recipients = ["team@example.invalid", "samuel@example.invalid"];

pg16It("queues full notices only after their cutoff and reads each request as submitted, with nothing else", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start();
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    await db.sql(readFileSync("supabase/candidates/request_intent_optional_context.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql", "utf8"));
    const migration = readFileSync("supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql", "utf8");
    await db.sql(migration);
    await db.sql(migration);

    const since = (await db.sql("select clock_timestamp() as at")).rows[0].at;
    const { app } = db.application(db.adapter().client);
    const before = submission();
    expect((await db.post(app, "", before, "a")).status).toBe(200);
    const detailSince = (await db.sql("select clock_timestamp() as at")).rows[0].at;
    const after = {
      ...submission(),
      idempotencyKey: "20000000-0000-4000-8000-000000000002",
      contact: {
        fullLegalName: "Jordan Example", email: "jordan@example.invalid", mobilePhone: "+15555550199",
        ageConfirmed: true as const, billingSameAsShipping: false,
        shippingAddress: { line1: "2 Fictional Way", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" },
        billingAddress: { line1: "9 Ledger Road", line2: "Floor 3", city: "Dallas", region: "TX", postalCode: "75201", countryCode: "US" },
      },
    };
    expect((await db.post(app, "", after, "a")).status).toBe(200);
    const saved = await db.snapshot();
    const a = saved.find(row => row.contact.fullLegalName === before.contact.fullLegalName)!;
    const b = saved.find(row => row.contact.fullLegalName === "Jordan Example")!;
    // A goal stored for the later request must never reach its notice.
    await db.sql("insert into request_intent_private.optional_context(request_id, goal) values ($1, 'compare_options')", [b.id]);

    const args = [since, recipients, detailSince];
    await expect(db.asRole("anon", reconcile, args)).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("authenticated", reconcile, args)).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", reconcile, [since, recipients, null]))
      .rejects.toMatchObject({ code: "22023" });
    expect((await db.asRole("service_role", reconcile, args)).rows).toEqual([{ queued: 2 }]);
    expect((await db.asRole("service_role", reconcile, args)).rows).toEqual([{ queued: 0 }]);
    expect((await db.asRole("service_role", reconcileShort, [since, recipients])).rows).toEqual([{ queued: 0 }]);

    const jobs = (await db.sql(`
      select event_key, event_type, template_key, payload from public.research_notification_outbox order by created_at, event_key
    `)).rows;
    expect(jobs).toEqual([
      { event_key: "ea-request-submitted-" + a.id, event_type: REQUEST_SUBMITTED_STAFF_TEMPLATE,
        template_key: REQUEST_SUBMITTED_STAFF_TEMPLATE,
        payload: { reference: a.public_reference, submittedAt: expect.any(String), itemCount: 2, recipients } },
      { event_key: "ea-request-submitted-" + b.id, event_type: REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
        template_key: REQUEST_SUBMITTED_STAFF_FULL_TEMPLATE,
        payload: { reference: b.public_reference, submittedAt: expect.any(String), itemCount: 2, recipients } },
    ]);
    // The queue keeps references only: no contact detail is ever written to it.
    const queued = JSON.stringify(jobs);
    for (const value of ["Jordan", "jordan@", "Ledger", "Synthetic Customer", "1 Synthetic Street"]) {
      expect(queued).not.toContain(value);
    }

    const keyB = "ea-request-submitted-" + b.id;
    await expect(db.asRole("anon", readDetail, [keyB])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("authenticated", readDetail, [keyB])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", readDetail, ["not-a-key"])).rejects.toMatchObject({ code: "22023" });
    // A short-alert job and a request with no job get no detail.
    expect((await db.asRole("service_role", readDetail, ["ea-request-submitted-" + a.id])).rows).toEqual([{ detail: null }]);
    expect((await db.asRole("service_role", readDetail, ["ea-request-submitted-00000000-0000-4000-8000-000000000009"])).rows)
      .toEqual([{ detail: null }]);

    const [{ detail }] = (await db.asRole("service_role", readDetail, [keyB])).rows;
    expect(detail).toEqual({
      reference: b.public_reference,
      submittedAt: expect.any(String),
      contact: {
        fullLegalName: "Jordan Example", email: "jordan@example.invalid", mobilePhone: "+15555550199",
        billingSameAsShipping: false,
        shippingAddress: { line1: "2 Fictional Way", city: "Austin", region: "TX", postalCode: "78701", countryCode: "US" },
        billingAddress: { line1: "9 Ledger Road", line2: "Floor 3", city: "Dallas", region: "TX", postalCode: "75201", countryCode: "US" },
      },
      lines: b.lines.map(line => ({
        productName: line.productName, specification: line.specification, variantId: line.variantId, quantity: line.quantity,
      })),
    });
    expect(JSON.stringify(detail)).not.toMatch(/compare_options|owner|attempt|fingerprint|agreement|sourceVariantId|catalogVersion|ageConfirmed|Synthetic Customer/);

    // The worker's read leaves no access event, so staff_read and queue_list still mean a person read the request.
    expect((await db.sql("select event_type, count(*)::int as n from request_intent_private.access_events group by 1")).rows)
      .toEqual([{ event_type: "submitted", n: 2 }]);

    // The stored record renders end to end with each requested line and its quantity.
    const mapped = mapStaffNoticeDetail(detail)!;
    const { text } = renderFullStaffNotice(mapped, "https://staff.example.invalid/care/request-intents");
    for (const line of b.lines) {
      expect(text).toContain(`${line.productName}\n   Specification: ${line.specification}\n   Variant: ${line.variantId}\n   Quantity: ${line.quantity}`);
    }
    expect(text).toContain("Billing address\n9 Ledger Road\nFloor 3\nDallas, TX 75201\nUS\n");

    // Replaying the later submission keeps one request and one job.
    expect((await db.post(app, "", after, "a")).body.publicReference).toBe(b.public_reference);
    expect((await db.asRole("service_role", reconcile, args)).rows).toEqual([{ queued: 0 }]);
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows).toEqual([{ n: 2 }]);
  } finally {
    await db.close();
  }
}, 120_000);
