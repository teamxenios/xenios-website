/** Actual owned PG16 SQL/rollback/erasure rehearsal. No managed URL accepted.
 * Historical dates and policy metadata are synthetic fixtures, not company
 * policy publications or a managed activation. Positive erasure installs the
 * EXPLICIT proposed Root seams only inside this disposable DB. It qualifies the
 * transaction against that contract; it does NOT qualify missing canonical
 * lifecycle/order/hold, evidence retention, or create/find suppression bindings.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createDurableJourneyFixture, pg16It, submission } from "../durable-journey.pg.fixture";
import { sha256AssistedOrderHasher } from "../../defaults";
import { retentionExecutionAdapter } from "./execution";

const S = "request_intent_private", ENV = "retention-fixture";
const SQL = "supabase/candidates/request_intent_retention_execution.sql";
type Fixture = ReturnType<typeof createDurableJourneyFixture>;
const ordinary = {
  productId: "fixture-product", variantId: "fixture-variant", sourceVariantId: "fixture-source",
  productName: "Synthetic product", specification: "Synthetic exact variant", family: "research_peptides_materials",
  workflowMode: "request_pricing", quantity: 1, researchUseOnly: true, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
  catalogVersion: "synthetic-retention", reviewState: "pending",
};
async function boot(db: Fixture) {
  await db.start({ managedCareSchema: true });
  for (const file of ["supabase/research-notification-outbox.sql",
    "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
    "supabase/migrations/20261118024134_request_intent_workflow.sql",
    "supabase/migrations/20261118033449_early_access_request_customer_notices.sql",
    "supabase/candidates/request_intent_policy_capture.sql", SQL]) await db.sql(readFileSync(file, "utf8"));
}
async function seedRequest(db: Fixture, ageDays = 200, clinical = false) {
  const id = randomUUID(), input = submission();
  // Explicit historical setup while capture/workflow remain disabled. This is
  // not a backfill API and does not edit timestamps on an immutable saved row.
  const record = (await db.sql(`insert into ${S}.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,
    contact,agreements,lines,created_at) values($1,'XRI-'||upper(replace($1::text,'-','')),$2,$3,$4,$5,$6,$7,
      clock_timestamp()-$8::integer*interval '24 hours') returning created_at`, [id,
    sha256AssistedOrderHasher.hash("owner:" + id), sha256AssistedOrderHasher.hash("attempt:" + id),
    sha256AssistedOrderHasher.hash("facts:" + id),
    JSON.stringify({ ...input.contact, billingAddress: input.contact.shippingAddress }), JSON.stringify(input.agreements),
    JSON.stringify([{ ...ordinary, clinicalReviewRequired: clinical }]), ageDays])).rows[0];
  await db.sql(`insert into ${S}.access_events(request_id,event_type,occurred_at) values($1,'submitted',$2)`, [id, record.created_at]);
  return { id, submittedAt: (record.created_at as Date).toISOString() };
}
async function seedHistoricalPolicy(db: Fixture, ids: string[]) {
  const bundle = randomUUID();
  await db.sql(`insert into ${S}.policy_bundles(id,environment,retention_policy_id,retention_policy_version,
    retention_record_reference,retention_document_sha256,recipient_policy_id,recipient_policy_version,
    recipient_record_reference,recipient_document_sha256,approval_record_reference,approval_received_at,
    required_agreements,notice_agreement_kind,notice_agreement_version,notice_document_sha256,created_at)
    values($1,$2,'EA-DURABLE-RETENTION-1.0','1.0','KAN-149/13456',
      '3ee9afedecfb03dfa01cc9d0bdfe046e26b554bae61cc3b31d7dcfa91a1cc52b',
      'FIXTURE-RECIPIENTS','fixture-v1','fixture:recipients:1',repeat('b',64),'KAN-149/13461',
      clock_timestamp()-interval '401 days','[{"kind":"fixture-terms","version":"fixture-v1"}]',
      'fixture-terms','fixture-v1',repeat('c',64),clock_timestamp()-interval '400 days')`, [bundle, ENV]);
  await db.sql(`update ${S}.workflow_settings set environment=$1,start_at=clock_timestamp()-interval '399 days',
    retention_policy_version='KAN-149/13456',recipient_policy_version='fixture:recipients:1',
    policy_capture_bundle_id=$2,policy_capture_enabled=true`, [ENV, bundle]);
  await db.sql(`insert into ${S}.request_policy_snapshots(request_id,bundle_id,publication_id,captured_at)
    select r.id,$1,p.id,r.created_at+interval '1 second' from ${S}.requests r
      cross join ${S}.policy_capture_publications p where r.id=any($2::uuid[])`, [bundle, ids]);
}
const baseAuthority = (id: string) => ({ schemaVersion: 1, requestId: id, classification: "unconverted", lifecycle: "open",
  closedAt: null, conversionKnown: true, converted: false, clinical: false, financial: false,
  hold: "none", extension: "none", dependenciesKnown: true,
  dependencyContract: "unconverted-no-dependent-records-v1", writersLocked: true });
async function authority(db: Fixture, id: string, overrides: Record<string, unknown> = {}) {
  await db.sql(`insert into ${S}.fixture_retention_authority values($1,$2::jsonb)
    on conflict(request_id) do update set facts=excluded.facts`, [id, JSON.stringify({ ...baseAuthority(id), ...overrides })]);
}
async function installFixturePorts(db: Fixture) {
  // These deliberately named FIXTURE stores do not implement application
  // lifecycle, provider residuals or production replay. Do not ship as bindings.
  await db.sql(`create table ${S}.fixture_retention_authority(request_id uuid primary key,facts jsonb not null);
    create table ${S}.fixture_retained_access(id bigint primary key,request_id uuid,event_type text,actor_user_id uuid,occurred_at timestamptz);
    create table ${S}.fixture_retained_policy(request_id uuid primary key,bundle_id uuid,publication_id uuid,captured_at timestamptz);
    create table ${S}.fixture_replay_stop(request_id uuid primary key,owner_hash text,attempt_hash text,fingerprint text,execution_id uuid);
    create or replace function ${S}.retention_authority_lock_v1(p_id uuid) returns jsonb
    language plpgsql security definer set search_path='' as $f$
    declare facts_ jsonb; begin
      select facts into facts_ from ${S}.fixture_retention_authority where request_id=p_id for update;
      return facts_; end $f$;
    create or replace function ${S}.retention_prepare_erasure_v1(p_id uuid,p_execution uuid) returns jsonb
    language plpgsql security definer set search_path='' as $f$ begin
      insert into ${S}.fixture_retained_access select id,request_id,event_type,actor_user_id,occurred_at
        from ${S}.access_events where request_id=p_id;
      insert into ${S}.fixture_retained_policy select request_id,bundle_id,publication_id,captured_at
        from ${S}.request_policy_snapshots where request_id=p_id;
      insert into ${S}.fixture_replay_stop select id,owner_hash,attempt_hash,fingerprint,p_execution
        from ${S}.requests where id=p_id;
      return jsonb_build_object('schemaVersion',1,'requestId',p_id,'executionId',p_execution,
        'accessEvidencePreserved',true,'policyProvenancePreserved',true,'replaySuppressed',true);
    end $f$;
    revoke all on all tables in schema ${S} from public,anon,authenticated,service_role;
    revoke all on function ${S}.retention_authority_lock_v1(uuid),${S}.retention_prepare_erasure_v1(uuid,uuid)
      from public,anon,authenticated,service_role;`);
}
async function bind(db: Fixture) {
  await db.sql(`update ${S}.retention_execution_settings set enabled=true,environment=$1,activated_at=clock_timestamp(),
    authority_definition_sha256=${S}.retention_definition_sha256('${S}.retention_authority_lock_v1(uuid)'::regprocedure),
    prepare_definition_sha256=${S}.retention_definition_sha256('${S}.retention_prepare_erasure_v1(uuid,uuid)'::regprocedure),
    guard_definition_sha256=${S}.retention_definition_sha256('${S}.deny_mutation()'::regprocedure)`, [ENV]);
}
async function installFixtureGuard(db: Fixture) {
  // Exact proposed DELETE-only integration, installed solely in owned PG.
  // No DISABLE TRIGGER, session_replication_role, TRUNCATE or global bypass.
  await db.sql(`create or replace function ${S}.deny_mutation() returns trigger language plpgsql set search_path='' as $f$
    declare id_ uuid; begin
      if TG_OP='DELETE' and TG_TABLE_SCHEMA='${S}'
        and TG_TABLE_NAME in ('requests','access_events','request_policy_snapshots') then
        if TG_TABLE_NAME='requests' then id_:=(to_jsonb(OLD)->>'id')::uuid;
        else id_:=(to_jsonb(OLD)->>'request_id')::uuid; end if;
        if ${S}.retention_delete_authorized(TG_RELID,id_) then return OLD; end if;
      end if;
      raise exception using errcode='42501',message='request_intent_is_immutable';
    end $f$;`);
}
async function execute(db: Fixture, id: string, executionId = randomUUID()) {
  return retentionExecutionAdapter({ async rpc(name, args = {}) {
    expect(name).toBe("request_intent_retention_execute");
    const reply = await db.asRole("service_role", "select public.request_intent_retention_execute($1,$2) as value",
      [args.p_request_id, args.p_execution_id]);
    return { data: reply.rows[0].value, error: null };
  } }).execute({ requestId: id, executionId });
}
async function persisted(db: Fixture, id: string) {
  return (await db.sql(`select (select count(*)::int from ${S}.requests where id=$1) as requests,
    (select count(*)::int from ${S}.access_events where request_id=$1) as access,
    (select count(*)::int from ${S}.request_policy_snapshots where request_id=$1) as snapshots,
    (select count(*)::int from ${S}.retention_execution_tickets) as tickets,
    (select count(*)::int from ${S}.fixture_retained_access where request_id=$1) as retained_access,
    (select count(*)::int from ${S}.fixture_retained_policy where request_id=$1) as retained_policy,
    (select count(*)::int from ${S}.fixture_replay_stop where request_id=$1) as suppression`, [id])).rows[0];
}

pg16It("retention candidate is inert, private and refuses missing Root bindings without changing requests", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); const row = await seedRequest(db);
    const before = await db.snapshot();
    await db.sql(readFileSync(SQL, "utf8"));
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "disabled" });
    await db.sql(`update ${S}.retention_execution_settings set enabled=true,environment=$1,activated_at=clock_timestamp(),
      authority_definition_sha256=repeat('a',64),prepare_definition_sha256=repeat('b',64),guard_definition_sha256=repeat('c',64)`, [ENV]);
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "root_binding_missing" });
    expect(await db.snapshot()).toEqual(before);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(db.asRole(role, "select public.request_intent_retention_execute($1,$2)", [row.id, randomUUID()]))
        .rejects.toMatchObject({ code: "42501" });
    }
    for (const table of ["retention_execution_settings", "retention_execution_tickets"]) {
      await expect(db.asRole("service_role", `select * from ${S}.${table}`)).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.sql(`select relrowsecurity,relforcerowsecurity from pg_class where oid in
      ('${S}.retention_execution_settings'::regclass,'${S}.retention_execution_tickets'::regclass)`)).rows)
      .toEqual([{ relrowsecurity: true, relforcerowsecurity: true }, { relrowsecurity: true, relforcerowsecurity: true }]);
    expect((await db.sql(`select enabled,policy_capture_enabled from ${S}.workflow_settings`)).rows[0])
      .toEqual({ enabled: false, policy_capture_enabled: false });
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 180_000);

pg16It("actual retention DML is atomic, bounded, clock-correct and fails closed on missing lifecycle/graph/guard facts", async () => {
  const db = createDurableJourneyFixture(); let pool: Pool | undefined;
  try {
    await boot(db);
    const expired = await seedRequest(db), closed = await seedRequest(db, 100), notDue = await seedRequest(db, 179);
    const clinical = await seedRequest(db, 200, true), legacy = await seedRequest(db), race = await seedRequest(db);
    await seedHistoricalPolicy(db, [expired.id, closed.id, notDue.id, clinical.id, race.id]);
    await installFixturePorts(db);
    for (const row of [expired, closed, notDue, clinical, legacy, race]) await authority(db, row.id);
    await authority(db, closed.id, { lifecycle: "closed", closedAt: new Date(Date.parse(closed.submittedAt) + 5 * 86400000).toISOString() });
    await bind(db);
    const before = await persisted(db, expired.id);
    // The real canonical guard remains effective. Preparation and capability
    // insertion roll back with the failed DELETE; no partial evidence/suppression.
    await expect(execute(db, expired.id)).rejects.toMatchObject({ code: "42501" });
    expect(await persisted(db, expired.id)).toEqual(before);
    await installFixtureGuard(db);
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "root_binding_changed" });
    await bind(db);
    for (const overrides of [{ classification: "unknown" }, { classification: null }, { classification: "converted", converted: true },
      { classification: "completed" }, { conversionKnown: false }, { hold: "active" }, { hold: "unknown" },
      { extension: "present" }, { extension: "unknown" }, { financial: true }, { clinical: true },
      { dependenciesKnown: false }, { dependencyContract: "unmapped" }, { writersLocked: false }]) {
      await authority(db, expired.id, overrides);
      expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "authority_ineligible" });
      expect(await persisted(db, expired.id)).toEqual(before);
    }
    await authority(db, expired.id, { lifecycle: "reviewing" });
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "lifecycle_unknown" });
    await authority(db, expired.id, { lifecycle: "closed", closedAt: "1900-01-01T00:00:00Z" });
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "timeline_invalid" });
    await authority(db, expired.id);
    expect(await execute(db, legacy.id)).toEqual({ status: "blocked", reason: "policy_snapshot_missing" });
    expect(await execute(db, clinical.id)).toEqual({ status: "blocked", reason: "clinical_or_unknown_line" });
    expect(await execute(db, notDue.id)).toEqual({ status: "blocked", reason: "not_due" });
    await db.sql(`create table ${S}.fixture_unknown_dependency(id uuid references ${S}.requests(id))`);
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
    await db.sql(`drop table ${S}.fixture_unknown_dependency`);
    // Direct deletion, UPDATE, forged GUCs and unrelated policy edits stay denied.
    await expect(db.sql(`delete from ${S}.requests where id=$1`, [expired.id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql(`update ${S}.requests set created_at=created_at where id=$1`, [expired.id])).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql(`update ${S}.policy_bundles set created_at=created_at`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.asRole("service_role", `select ${S}.retention_delete_authorized('${S}.requests'::regclass,$1)`, [expired.id]))
      .rejects.toMatchObject({ code: "42501" });
    // A closure just yesterday must not restart or extend the old submit cap.
    await authority(db, expired.id, { lifecycle: "closed", closedAt: new Date(Date.now() - 86400000).toISOString() });
    const erased = await execute(db, expired.id);
    expect(erased.status).toBe("erased");
    if (erased.status !== "erased") throw Error("Actual erase did not occur");
    expect(Date.parse(erased.deadlineAt)).toBe(Date.parse(expired.submittedAt) + 180 * 86400000);
    expect(await persisted(db, expired.id)).toEqual({ requests: 0, access: 0, snapshots: 0, tickets: 0,
      retained_access: 1, retained_policy: 1, suppression: 1 });
    const closedResult = await execute(db, closed.id);
    expect(closedResult.status).toBe("erased");
    if (closedResult.status !== "erased") throw Error("Actual closure erase did not occur");
    expect(Date.parse(closedResult.deadlineAt)).toBe(Date.parse(closed.submittedAt) + 95 * 86400000);

    // Independent backend connections arbitrate against the same authoritative
    // row lock. Exactly one removes a parent, the other observes request_missing.
    const password = randomUUID();
    await db.sql(`create role retention_fixture_login login noinherit password '${password}'; grant service_role to retention_fixture_login`);
    pool = db.poolForLogin("retention_fixture_login", password);
    const first = await pool.connect(), second = await pool.connect();
    try {
      async function run(client: PoolClient) {
        await client.query("begin");
        try {
          await client.query("set local role service_role");
          const r = await client.query("select public.request_intent_retention_execute($1,$2) as value", [race.id, randomUUID()]);
          await client.query("commit"); return r.rows[0].value;
        } catch (e) { await client.query("rollback"); throw e; }
      }
      const results = await Promise.all([run(first), run(second)]);
      expect(results.map(x => x.status).sort()).toEqual(["blocked", "erased"]);
      expect(results.find(x => x.status === "blocked")).toEqual({ status: "blocked", reason: "request_missing" });
    } finally { first.release(); second.release(); }
    expect(await persisted(db, race.id)).toEqual({ requests: 0, access: 0, snapshots: 0, tickets: 0,
      retained_access: 1, retained_policy: 1, suppression: 1 });
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    expect((await db.sql(`select enabled from ${S}.workflow_settings`)).rows[0].enabled).toBe(false);
  } finally { if (pool) await pool.end(); await db.close(); }
}, 180_000);
