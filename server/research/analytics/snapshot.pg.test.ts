import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { createDurableJourneyFixture, pg16It, submission, OPERATOR } from "../assisted-order/request-intent/durable-journey.pg.fixture";
import { operationsReportFromSnapshot, parseOperationsSnapshot } from "./snapshot";

const window = { start: "2020-11-01T05:00:00.000Z", end: "2020-11-02T06:00:00.000Z" };
const call = "select public.request_intent_operations_snapshot($1::timestamptz,$2::timestamptz) as snapshot";
pg16It("qualifies a read-only backend snapshot, exact boundaries, complete counts, optional-source failure and unknown provenance in real owned PG16", async () => {
  const db = createDurableJourneyFixture();
  try {
    await db.start({ managedCareSchema: true });
    const app = db.application(db.adapter().client).app;
    expect((await db.post(app, "", submission())).status).toBe(200);
    const before = await db.counts();
    // Use actual canonical request storage and one synthetic HTTP save. The
    // following fixture-only SQL clones contain deliberately private sentinel
    // fields; none may appear in the snapshot or report.
    await db.sql(`insert into request_intent_private.requests
      (id,public_reference,owner_hash,attempt_hash,fingerprint,status,contact,agreements,lines,created_at)
      select x.id,'XRI-'||upper(replace(x.id::text,'-','')),r.owner_hash,
        md5(x.n::text)||md5(x.n::text),r.fingerprint,r.status,r.contact,r.agreements,r.lines,
        case when x.n=1002 then $2::timestamptz when x.n=1003 then $1::timestamptz-interval '1 millisecond' else $1::timestamptz end
      from (select n,gen_random_uuid() as id from generate_series(1,1003) n) x
      cross join lateral (select * from request_intent_private.requests order by created_at limit 1) r`, [window.start, window.end]);
    const source = readFileSync("server/research/analytics/sql/request-operations-snapshot.sql", "utf8");
    await db.sql(source); await db.sql(source);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, call, [window.start, window.end])).rejects.toMatchObject({ code: "42501" });
    }
    await expect(db.sql(call, [window.start, window.end])).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", call, [window.start, window.end], OPERATOR)).rejects.toMatchObject({ code: "42501" });
    for (const bounds of [[null, window.end], [window.end, window.start], [window.start, "infinity"], [window.start, "2021-01-01T00:00:00Z"]]) {
      await expect(db.asRole("service_role", call, bounds)).rejects.toMatchObject({ code: "22023" });
    }
    const raw = (await db.asRole("service_role", call, [window.start, window.end])).rows[0].snapshot;
    const snapshot = parseOperationsSnapshot(raw, window);
    expect(snapshot.sources.requests).toMatchObject({ state: "observed", totalRecords: 1004, windowRecords: 1001 });
    expect(snapshot.sources.workflows).toEqual({ state: "unavailable", totalRecords: null, windowRecords: null, latestAt: null });
    expect(snapshot.sources.support.state).toBe("unavailable");
    const saved = (await db.snapshot())[0];
    expect(JSON.stringify(raw)).not.toContain(saved.id);
    expect(JSON.stringify(raw)).not.toMatch(/synthetic@example|Synthetic Customer|fullLegalName|owner_hash|attempt_hash|fingerprint|agreements|shippingAddress/);
    const report = operationsReportFromSnapshot({ projectId: "owned-fixture", environment: "staging" }, window, snapshot,
      { population: "request", channel: "portal_published" });
    expect(report[0]).toMatchObject({ scope: "authorized_project", value: null, freshness: "not_measured",
      summary: { unclassifiedRecordCount: 1001 } });
    expect(report.find(row => row.metricId === "admission_to_request")).toMatchObject({ value: null, sampleSize: null });
    // Install the real optional workflow/notice authorities, still disabled.
    await db.sql(readFileSync("supabase/research-notification-outbox.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261114133500_early_access_pending_request_reader.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118024134_request_intent_workflow.sql", "utf8"));
    await db.sql(readFileSync("supabase/migrations/20261118033449_early_access_request_customer_notices.sql", "utf8"));
    const installed = parseOperationsSnapshot((await db.asRole("service_role", call, [window.start, window.end])).rows[0].snapshot, window);
    expect(installed.sources.workflows).toEqual({ state: "observed", totalRecords: 0, windowRecords: 0, latestAt: null });
    expect(operationsReportFromSnapshot({ projectId: "owned-fixture", environment: "staging" }, window, installed,
      { population: "request", channel: "portal_published" }).find(row => row.metricId === "open_workload"))
      .toMatchObject({ value: null, freshness: "not_measured" });
    const after = await db.counts();
    expect(after.events).toBe(before.events); expect(after.submitted).toBe(before.submitted);
    expect((await db.sql("select provolatile from pg_proc where oid='public.request_intent_operations_snapshot(timestamptz,timestamptz)'::regprocedure")).rows[0].provolatile).toBe("s");
    // Schema drift is an unavailable optional source, not a fabricated empty set.
    await db.sql("alter table request_intent_private.workflow rename column changed_at to changed_at_fixture");
    const drifted = parseOperationsSnapshot((await db.asRole("service_role", call, [window.start, window.end])).rows[0].snapshot, window);
    expect(drifted.sources.workflows.state).toBe("unavailable");
  } finally { await db.close(); }
}, 120_000);
