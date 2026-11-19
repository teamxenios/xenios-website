/** Actual owned PG16 SQL/rollback/erasure rehearsal. No managed URL accepted.
 * Historical dates and policy metadata are synthetic fixtures, not company
 * policy publications or a managed activation. Positive erasure installs the
 * EXPLICIT proposed Root seams only inside this disposable DB. It qualifies the
 * transaction against that contract; it does NOT qualify missing canonical
 * lifecycle/order/hold, evidence retention, or create/find suppression bindings.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { expect } from "vitest";
import type { Pool, PoolClient } from "pg";
import { createDurableJourneyFixture, pg16It, submission } from "../durable-journey.pg.fixture";
import { sha256AssistedOrderHasher } from "../../defaults";
import { retentionExecutionAdapter } from "./execution";

const S = "request_intent_private", ENV = "retention-fixture";
const SQL = "supabase/candidates/request_intent_retention_execution.sql";
const STAFF_LOCK_SQL = "supabase/candidates/request_intent_staff_notice_retention_lock.sql";
type Fixture = ReturnType<typeof createDurableJourneyFixture>;
const ordinary = {
  productId: "fixture-product", variantId: "fixture-variant", sourceVariantId: "fixture-source",
  productName: "Synthetic product", specification: "Synthetic exact variant", family: "research_peptides_materials",
  workflowMode: "request_pricing", quantity: 1, researchUseOnly: true, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
  catalogVersion: "synthetic-retention", reviewState: "pending",
};
async function boot(db: Fixture, historicalSetup = false, staffLocks = true) {
  await db.start({ managedCareSchema: true });
  for (const file of ["supabase/research-notification-outbox.sql",
    "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
    "supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
    "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql",
    "supabase/migrations/20261118024134_request_intent_workflow.sql",
    "supabase/migrations/20261118033449_early_access_request_customer_notices.sql"]) await db.sql(readFileSync(file, "utf8"));
  if (staffLocks) await db.sql(readFileSync(STAFF_LOCK_SQL, "utf8"));
  const policy = readFileSync("supabase/candidates/request_intent_policy_capture.sql", "utf8");
  if (historicalSetup) {
    // Load exact canonical table DDL, then synthetic historical rows BEFORE
    // installing canonical publication/immutability triggers. No trigger is
    // disabled/replaced for history and no application history is backfilled.
    const end = policy.indexOf("create or replace function request_intent_private.policy_capture_setting_pin()");
    expect(end).toBeGreaterThan(0);
    await db.sql(policy.slice(0, end) + "\ncommit;");
  } else await db.sql(policy);
  // The optional create FUNCTION is another canonical replay entrance. Its
  // unsupported cascading context TABLE is deliberately not installed for the
  // no-dependent-record class; installing that schema must still refuse erasure.
  const optional = readFileSync("supabase/candidates/request_intent_optional_context.sql", "utf8");
  const privateStart = optional.indexOf("create function request_intent_private.create_with_context(");
  const privateEnd = optional.indexOf("create function request_intent_private.staff_get_with_context(");
  const publicStart = optional.indexOf("create function public.request_intent_create_with_context(");
  const publicEnd = optional.indexOf("create function public.request_intent_staff_get_with_context(");
  expect(privateStart).toBeGreaterThan(0); expect(privateEnd).toBeGreaterThan(privateStart);
  expect(publicStart).toBeGreaterThan(privateEnd); expect(publicEnd).toBeGreaterThan(publicStart);
  await db.sql(optional.slice(privateStart, privateEnd) + optional.slice(publicStart, publicEnd) + `
    revoke all on function ${S}.create_with_context(text,text,text,jsonb,jsonb),
      public.request_intent_create_with_context(text,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
    grant execute on function ${S}.create_with_context(text,text,text,jsonb,jsonb),
      public.request_intent_create_with_context(text,text,text,jsonb,jsonb) to service_role;`);
  await db.sql(readFileSync(SQL, "utf8"));
}
async function seedRequest(db: Fixture, ageDays = 200, clinical = false) {
  const id = randomUUID(), input = submission();
  const agreements = input.agreements.map(pair => ({ ...pair,
    acceptedAt: new Date(Date.now() - ageDays * 86400000 - 60000).toISOString() }));
  // Explicit historical setup while capture/workflow remain disabled. This is
  // not a backfill API and does not edit timestamps on an immutable saved row.
  const record = (await db.sql(`insert into ${S}.requests(id,public_reference,owner_hash,attempt_hash,fingerprint,
    contact,agreements,lines,created_at) values($1::uuid,'XRI-'||upper(replace($1::uuid::text,'-','')),$2,$3,$4,$5,$6,$7,
      clock_timestamp()-$8::integer*interval '24 hours') returning created_at`, [id,
    sha256AssistedOrderHasher.hash("owner:" + id), sha256AssistedOrderHasher.hash("attempt:" + id),
    sha256AssistedOrderHasher.hash("facts:" + id),
    JSON.stringify({ ...input.contact, billingAddress: input.contact.shippingAddress }), JSON.stringify(agreements),
    JSON.stringify([{ ...ordinary, clinicalReviewRequired: clinical }]), ageDays])).rows[0];
  await db.sql(`insert into ${S}.access_events(request_id,event_type,occurred_at) values($1,'submitted',$2)`, [id, record.created_at]);
  return { id, submittedAt: (record.created_at as Date).toISOString() };
}
type History = "initial" | "rotated" | "wrong_hash" | "wrong_version" | "wrong_id" | "recorded_after" | "effective_after";
async function seedHistoricalPolicy(db: Fixture, ids: string[], history: History = "initial") {
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
  // Owned historical fixture setup precedes installation of the real INSERT
  // guard. Its recorded publication genuinely precedes the historical request.
  let publication = (await db.sql(`insert into ${S}.policy_capture_publications(environment,revision,bundle_id,effective_at,recorded_at)
    select environment,1,$1,start_at,start_at from ${S}.workflow_settings returning id`, [bundle])).rows[0].id as string;
  let capturedBundle = bundle;
  if (history !== "initial") {
    capturedBundle = randomUUID();
    await db.sql(`insert into ${S}.policy_bundles select $1::uuid,environment,
      case when $3='wrong_id' then 'UNKNOWN-POLICY' else retention_policy_id end,
      case when $3='wrong_version' then '2.0' else retention_policy_version end,
      retention_record_reference,case when $3='wrong_hash' then repeat('d',64) else retention_document_sha256 end,
      recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,
      approval_record_reference,approval_received_at,required_agreements,notice_agreement_kind,
      notice_agreement_version,notice_document_sha256,created_at from ${S}.policy_bundles where id=$2`,
    [capturedBundle, bundle, history]);
    publication = (await db.sql(`insert into ${S}.policy_capture_publications(environment,revision,previous_publication_id,
      bundle_id,effective_at,recorded_at) select $1,2,$2,$3,
      case when $4='effective_after' then r.created_at+interval '1 second' else clock_timestamp()-interval '300 days' end,
      case when $4='recorded_after' then r.created_at+interval '1 second' else clock_timestamp()-interval '301 days' end
      from ${S}.requests r where r.id=$5 returning id`, [ENV, publication, capturedBundle, history, ids[0]])).rows[0].id;
  }
  await db.sql(`insert into ${S}.request_policy_snapshots(request_id,bundle_id,publication_id,captured_at)
    select r.id,$1::uuid,$3::uuid,r.created_at+interval '1 second' from ${S}.requests r
      where r.id=any($2::uuid[])`, [capturedBundle, ids, publication]);
  return { bundle: capturedBundle, publication };
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
    create table ${S}.fixture_retention_control(singleton boolean primary key check(singleton),incomplete boolean not null);
    insert into ${S}.fixture_retention_control values(true,false);
    create or replace function ${S}.retention_authority_lock_v1(p_id uuid) returns jsonb
    language plpgsql security definer set search_path='' as $f$
    declare facts_ jsonb; begin
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(owner_hash||':'||attempt_hash,0))
        from ${S}.requests where id=p_id;
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
      if (select incomplete from ${S}.fixture_retention_control where singleton) then return '{}'::jsonb; end if;
      return jsonb_build_object('schemaVersion',1,'requestId',p_id,'executionId',p_execution,
        'accessEvidencePreserved',true,'policyProvenancePreserved',true,'replaySuppressed',true);
    end $f$;
    revoke all on all tables in schema ${S} from public,anon,authenticated,service_role;
    revoke all on function ${S}.retention_authority_lock_v1(uuid),${S}.retention_prepare_erasure_v1(uuid,uuid)
      from public,anon,authenticated,service_role;`);
}
async function installFixtureConsumers(db: Fixture) {
  const signatures = ["create_or_replay(text,text,text,jsonb)", "find_attempt(text,text)",
    "create_with_context(text,text,text,jsonb,jsonb)"];
  const originals: string[] = [];
  for (const signature of signatures) {
    const original = (await db.sql("select pg_get_functiondef($1::regprocedure) as definition", [`${S}.${signature}`])).rows[0].definition as string;
    const name = signature.slice(0, signature.indexOf("("));
    const needle = `${S}.${name}(`;
    expect(original).toContain(needle);
    originals.push(original);
    await db.sql(original.replace(needle, `${S}.fixture_original_${name}(`));
  }
  const definitions = [
    `create or replace function ${S}.create_or_replay(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash||':'||p_attempt_hash,0));
      if exists(select 1 from ${S}.fixture_replay_stop where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash) then
        raise exception using errcode='55000',message='fixture_request_erased'; end if;
      return ${S}.fixture_original_create_or_replay(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail); end $f$;`,
    `create or replace function ${S}.find_attempt(p_owner_hash text,p_attempt_hash text)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash||':'||p_attempt_hash,0));
      if exists(select 1 from ${S}.fixture_replay_stop where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash) then
        raise exception using errcode='55000',message='fixture_request_erased'; end if;
      return ${S}.fixture_original_find_attempt(p_owner_hash,p_attempt_hash); end $f$;`,
    `create or replace function ${S}.create_with_context(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
      perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_owner_hash||':'||p_attempt_hash,0));
      if exists(select 1 from ${S}.fixture_replay_stop where owner_hash=p_owner_hash and attempt_hash=p_attempt_hash) then
        raise exception using errcode='55000',message='fixture_request_erased'; end if;
      return ${S}.fixture_original_create_with_context(p_owner_hash,p_attempt_hash,p_fingerprint,p_detail,p_context); end $f$;`,
  ];
  for (const definition of definitions) await db.sql(definition);
  for (const signature of signatures) await db.sql(`revoke all on function ${S}.fixture_original_${signature} from public,anon,authenticated,service_role`);
  return { originals, definitions };
}
async function bind(db: Fixture) {
  await db.sql(`update ${S}.retention_execution_settings set enabled=true,environment=$1,activated_at=clock_timestamp(),
    authority_definition_sha256=${S}.retention_definition_sha256('${S}.retention_authority_lock_v1(uuid)'::regprocedure),
    prepare_definition_sha256=${S}.retention_definition_sha256('${S}.retention_prepare_erasure_v1(uuid,uuid)'::regprocedure),
    guard_definition_sha256=${S}.retention_definition_sha256('${S}.deny_mutation()'::regprocedure),
    create_definition_sha256=${S}.retention_definition_sha256('${S}.create_or_replay(text,text,text,jsonb)'::regprocedure),
    find_definition_sha256=${S}.retention_definition_sha256('${S}.find_attempt(text,text)'::regprocedure),
    context_definition_sha256=${S}.retention_definition_sha256('${S}.create_with_context(text,text,text,jsonb,jsonb)'::regprocedure),
    staff_short_definition_sha256=${S}.retention_definition_sha256('${S}.enqueue_staff_notices(timestamptz,text[])'::regprocedure),
    staff_full_definition_sha256=${S}.retention_definition_sha256('${S}.enqueue_staff_notices(timestamptz,text[],timestamptz)'::regprocedure)`, [ENV]);
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
async function ready(history: History = "initial") {
  const db = createDurableJourneyFixture();
  try {
    await boot(db, true);
    const row = await seedRequest(db);
    const policy = await seedHistoricalPolicy(db, [row.id], history);
    await db.sql(readFileSync("supabase/candidates/request_intent_policy_capture.sql", "utf8"));
    await installFixturePorts(db);
    const consumers = await installFixtureConsumers(db);
    await installFixtureGuard(db);
    await authority(db, row.id);
    await bind(db);
    return { db, row, policy, consumers };
  } catch (error) { await db.close(); throw error; }
}

pg16It("B1 current canonical create/find/context versions refuse; bound consumers prevent resurrection through actual public RPCs", async () => {
  const { db, row, consumers } = await ready();
  try {
    const before = await persisted(db, row.id);
    for (let i = 0; i < consumers.originals.length; i++) {
      await db.sql(consumers.originals[i]);
      expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "root_binding_changed" });
      expect(await persisted(db, row.id)).toEqual(before);
      await db.sql(consumers.definitions[i]);
    }
    const original = (await db.sql(`select * from ${S}.requests where id=$1`, [row.id])).rows[0];
    expect((await execute(db, row.id)).status).toBe("erased");
    const newId = randomUUID();
    const detail = { kind: "unapproved_selection_request", requestId: newId,
      publicReference: "XRI-" + newId.replaceAll("-", "").toUpperCase(), status: "pending_review",
      createdAt: new Date().toISOString(), contact: original.contact, agreements: original.agreements, lines: original.lines };
    const createArgs = [original.owner_hash, original.attempt_hash, original.fingerprint, JSON.stringify(detail)];
    await expect(db.asRole("service_role", "select public.request_intent_create_or_replay($1::text,$2::text,$3::text,$4::jsonb)", createArgs))
      .rejects.toMatchObject({ code: "55000", message: "fixture_request_erased" });
    await expect(db.asRole("service_role", "select public.request_intent_find_attempt($1::text,$2::text)", createArgs.slice(0, 2)))
      .rejects.toMatchObject({ code: "55000", message: "fixture_request_erased" });
    await expect(db.asRole("service_role", "select public.request_intent_create_with_context($1::text,$2::text,$3::text,$4::jsonb,$5::jsonb)",
      [...createArgs, JSON.stringify({ goal: "compare_options" })])).rejects.toMatchObject({ code: "55000", message: "fixture_request_erased" });
    expect((await db.sql(`select count(*)::int as n from ${S}.requests where id=$1 or owner_hash=$2 and attempt_hash=$3`,
      [newId, original.owner_hash, original.attempt_hash])).rows[0].n).toBe(0);
    expect(await persisted(db, row.id)).toEqual({ requests: 0, access: 0, snapshots: 0, tickets: 0,
      retained_access: 1, retained_policy: 1, suppression: 1 });
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 180_000);

pg16It.each(["pending", "processing", "failed_retryable", "sent", "delivered", "failed_permanent", "cancelled"])(
  "B2 actual staff-notice %s job blocks erasure and remains intact", async (status) => {
    const { db, row } = await ready();
    try {
      const before = await persisted(db, row.id);
      const enqueued = await db.asRole("service_role", `select public.request_intent_enqueue_staff_notices(
        $1::timestamptz,$2::text[],$1::timestamptz) as n`, [row.submittedAt, ["one@fixture.invalid", "two@fixture.invalid"]]);
      expect(enqueued.rows[0].n).toBe(1);
      await db.sql("update public.research_notification_outbox set status=$1 where event_key=$2", [status, "ea-request-submitted-" + row.id]);
      const job = (await db.sql("select * from public.research_notification_outbox")).rows;
      expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
      expect(await persisted(db, row.id)).toEqual(before);
      expect((await db.sql("select * from public.research_notification_outbox")).rows).toEqual(job);
    } finally { await db.close(); }
  }, 180_000);

pg16It("B3 rotated revision 2 with approved retention fields erases exactly once and preserves publication provenance", async () => {
  const { db, row, policy } = await ready("rotated");
  try {
    const executionId = randomUUID();
    expect((await execute(db, row.id, executionId)).status).toBe("erased");
    expect(await execute(db, row.id, executionId)).toEqual({ status: "blocked", reason: "request_missing" });
    expect((await db.sql(`select bundle_id,publication_id from ${S}.fixture_retained_policy where request_id=$1`, [row.id])).rows)
      .toEqual([{ bundle_id: policy.bundle, publication_id: policy.publication }]);
    expect((await db.sql(`select count(*)::int as n from ${S}.policy_capture_publications`)).rows[0].n).toBe(2);
    expect((await db.sql(`select count(*)::int as n from ${S}.policy_bundles`)).rows[0].n).toBe(2);
  } finally { await db.close(); }
}, 180_000);

pg16It.each(["wrong_hash", "wrong_version", "wrong_id", "recorded_after", "effective_after"] as const)(
  "B3 revision 2 %s provenance refuses erasure without side effects", async (history) => {
    const { db, row } = await ready(history);
    try {
      const before = await persisted(db, row.id);
      expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "policy_snapshot_ineligible" });
      expect(await persisted(db, row.id)).toEqual(before);
    } finally { await db.close(); }
  }, 180_000);

pg16It("B3 incomplete prepare receipt raises 55000 and rolls back all prepared evidence, suppression and tickets", async () => {
  const { db, row } = await ready();
  try {
    const before = await persisted(db, row.id);
    await db.sql(`update ${S}.fixture_retention_control set incomplete=true`);
    await expect(execute(db, row.id)).rejects.toMatchObject({ code: "55000", message: "retention_preparation_incomplete" });
    expect(await persisted(db, row.id)).toEqual(before);
  } finally { await db.close(); }
}, 180_000);

pg16It("B3 same executionId retry after failed preparation can erase once without orphaned capability", async () => {
  const { db, row } = await ready();
  try {
    const executionId = randomUUID(), before = await persisted(db, row.id);
    await db.sql(`update ${S}.fixture_retention_control set incomplete=true`);
    await expect(execute(db, row.id, executionId)).rejects.toMatchObject({ code: "55000" });
    expect(await persisted(db, row.id)).toEqual(before);
    await db.sql(`update ${S}.fixture_retention_control set incomplete=false`);
    expect((await execute(db, row.id, executionId)).status).toBe("erased");
    expect((await db.sql(`select execution_id from ${S}.fixture_replay_stop where request_id=$1`, [row.id])).rows)
      .toEqual([{ execution_id: executionId }]);
    expect((await persisted(db, row.id)).tickets).toBe(0);
  } finally { await db.close(); }
}, 180_000);

pg16It("B3 more than 1000 access events refuses bounded erasure without preparation", async () => {
  const { db, row } = await ready();
  try {
    await db.sql(`insert into ${S}.access_events(request_id,event_type) select $1,'staff_read' from generate_series(1,1000)`, [row.id]);
    const before = await persisted(db, row.id);
    expect(before.access).toBe(1001);
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
    expect(await persisted(db, row.id)).toEqual(before);
  } finally { await db.close(); }
}, 180_000);

pg16It("B3 N1 detached snapshot guard refuses even when a duplicate request guard makes three total", async () => {
  const { db, row } = await ready();
  try {
    const before = await persisted(db, row.id);
    await db.sql(`drop trigger request_policy_snapshots_no_mutation on ${S}.request_policy_snapshots;
      create trigger fixture_duplicate_request_guard before update or delete on ${S}.requests
        for each row execute function ${S}.deny_mutation()`);
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "immutable_guard_binding_missing" });
    expect(await persisted(db, row.id)).toEqual(before);
  } finally { await db.close(); }
}, 180_000);

pg16It("B3 future execution activation refuses as not_active without preparation", async () => {
  const { db, row } = await ready();
  try {
    const before = await persisted(db, row.id);
    await db.sql(`update ${S}.retention_execution_settings set activated_at=clock_timestamp()+interval '1 hour'`);
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "not_active" });
    expect(await persisted(db, row.id)).toEqual(before);
  } finally { await db.close(); }
}, 180_000);

pg16It("C3 B1b inline bound suppression survives changed create/find/context delegates", async () => {
  const { db, row } = await ready();
  try {
    const original = (await db.sql(`select * from ${S}.requests where id=$1`, [row.id])).rows[0];
    expect((await execute(db, row.id)).status).toBe("erased");
    const before = (await db.sql(`select create_definition_sha256,find_definition_sha256,context_definition_sha256
      from ${S}.retention_execution_settings`)).rows[0];
    await db.sql(`create table ${S}.fixture_delegate_calls(kind text);
      create or replace function ${S}.fixture_original_create_or_replay(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
        insert into ${S}.fixture_delegate_calls values('create'); return '{"delegateInvoked":true}'::jsonb; end $f$;
      create or replace function ${S}.fixture_original_find_attempt(p_owner_hash text,p_attempt_hash text)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
        insert into ${S}.fixture_delegate_calls values('find'); return '{"delegateInvoked":true}'::jsonb; end $f$;
      create or replace function ${S}.fixture_original_create_with_context(p_owner_hash text,p_attempt_hash text,p_fingerprint text,p_detail jsonb,p_context jsonb)
      returns jsonb language plpgsql security definer set search_path='' as $f$ begin
        insert into ${S}.fixture_delegate_calls values('context'); return '{"delegateInvoked":true}'::jsonb; end $f$;`);
    const newId = randomUUID(), detail = { kind: "unapproved_selection_request", requestId: newId,
      publicReference: "XRI-" + newId.replaceAll("-", "").toUpperCase(), status: "pending_review",
      createdAt: new Date().toISOString(), contact: original.contact, agreements: original.agreements, lines: original.lines };
    const args = [original.owner_hash, original.attempt_hash, original.fingerprint, JSON.stringify(detail)];
    for (const [sql, values] of [
      ["select public.request_intent_create_or_replay($1::text,$2::text,$3::text,$4::jsonb)", args],
      ["select public.request_intent_find_attempt($1::text,$2::text)", args.slice(0, 2)],
      ["select public.request_intent_create_with_context($1::text,$2::text,$3::text,$4::jsonb,$5::jsonb)",
        [...args, JSON.stringify({ goal: "compare_options" })]],
    ] as const) await expect(db.asRole("service_role", sql, [...values]))
      .rejects.toMatchObject({ code: "55000", message: "fixture_request_erased" });
    expect((await db.sql(`select count(*)::int as n from ${S}.fixture_delegate_calls`)).rows[0].n).toBe(0);
    expect((await db.sql(`select
      ${S}.retention_definition_sha256('${S}.create_or_replay(text,text,text,jsonb)'::regprocedure) as create_definition_sha256,
      ${S}.retention_definition_sha256('${S}.find_attempt(text,text)'::regprocedure) as find_definition_sha256,
      ${S}.retention_definition_sha256('${S}.create_with_context(text,text,text,jsonb,jsonb)'::regprocedure) as context_definition_sha256`)).rows[0])
      .toEqual(before);
    expect((await db.sql(`select count(*)::int as n from ${S}.requests`)).rows[0].n).toBe(0);
  } finally { await db.close(); }
}, 180_000);

pg16It("C3 13568 initial binding refuses omitted, partial and comment-decoy staff locks; both exact locked overloads bind", async () => {
  const db = createDurableJourneyFixture();
  try {
    // Start with both ACTUAL historical definitions and deliberately omit the
    // locking candidate. Every other Root seam is present, so a bind-time hash
    // of whatever happens to be installed cannot disguise this prerequisite.
    await boot(db, false, false);
    await seedRequest(db);
    await installFixturePorts(db);
    await installFixtureConsumers(db);
    const settings = async () => (await db.sql(`select * from ${S}.retention_execution_settings`)).rows;
    const before = await settings(), requestsBefore = await db.snapshot();
    expect((await db.sql(`select ${S}.retention_staff_notice_locks_valid() as valid`)).rows[0].valid).toBe(false);
    await expect(bind(db)).rejects.toMatchObject({ code: "55000", message: "retention_staff_notice_lock_required" });
    expect(await settings()).toEqual(before);
    expect(await db.snapshot()).toEqual(requestsBefore);

    const lockedCandidate = readFileSync(STAFF_LOCK_SQL, "utf8");
    for (const file of ["supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
      "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql"]) {
      await db.sql(lockedCandidate);
      const source = readFileSync(file, "utf8");
      const start = source.indexOf("create or replace function request_intent_private.enqueue_staff_notices(");
      const end = source.indexOf("create or replace function public.request_intent_enqueue_staff_notices(");
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      const historical = source.slice(start, end);
      // The other overload stays locked; neither one is optional. A comment
      // with the exact lock phrase also must not satisfy the source pins.
      for (const definition of [historical, historical.replace("as $$", () => "as $$\n-- for key share of r\n")]) {
        await db.sql(definition);
        expect((await db.sql(`select ${S}.retention_staff_notice_locks_valid() as valid`)).rows[0].valid).toBe(false);
        await expect(bind(db)).rejects.toMatchObject({ code: "55000", message: "retention_staff_notice_lock_required" });
        expect(await settings()).toEqual(before);
        expect(await db.snapshot()).toEqual(requestsBefore);
      }
    }

    for (const signature of ["timestamptz,text[]", "timestamptz,text[],timestamptz"]) {
      for (const alteration of ["security invoker", "set search_path='public'", "reset all"]) {
        await db.sql(lockedCandidate);
        await db.sql(`alter function ${S}.enqueue_staff_notices(${signature}) ${alteration}`);
        expect((await db.sql(`select ${S}.retention_staff_notice_locks_valid() as valid`)).rows[0].valid).toBe(false);
        await expect(bind(db)).rejects.toMatchObject({ code: "55000", message: "retention_staff_notice_lock_required" });
        expect(await settings()).toEqual(before);
        expect(await db.snapshot()).toEqual(requestsBefore);
      }
    }

    await db.sql(lockedCandidate);
    expect((await db.sql(`select ${S}.retention_staff_notice_locks_valid() as valid`)).rows[0].valid).toBe(true);
    await bind(db);
    const bound = (await settings())[0];
    expect(bound.enabled).toBe(true);
    const bindings = ["authority", "prepare", "guard", "create", "find", "context", "staff_short", "staff_full"];
    for (const binding of bindings) expect(bound[`${binding}_definition_sha256`]).toMatch(/^[0-9a-f]{64}$/);
    expect((await db.sql(`select
      staff_short_definition_sha256=${S}.retention_definition_sha256('${S}.enqueue_staff_notices(timestamptz,text[])'::regprocedure) as short_matches,
      staff_full_definition_sha256=${S}.retention_definition_sha256('${S}.enqueue_staff_notices(timestamptz,text[],timestamptz)'::regprocedure) as full_matches
      from ${S}.retention_execution_settings`)).rows[0]).toEqual({ short_matches: true, full_matches: true });
    expect(await db.snapshot()).toEqual(requestsBefore);
    // Binding itself is not activation of a real lifecycle or deletion class.
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, `select ${S}.retention_staff_notice_locks_valid()`)).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, `select ${S}.retention_execution_bind_staff_locks()`)).rejects.toMatchObject({ code: "42501" });
    }
  } finally { await db.close(); }
}, 180_000);

pg16It("C3 B2 unchanged historical enqueue definitions refuse against locking bindings", async () => {
  const { db, row } = await ready();
  try {
    const before = await persisted(db, row.id);
    for (const file of ["supabase/migrations/20261115205033_early_access_request_submitted_staff_notice.sql",
      "supabase/migrations/20261115222911_early_access_staff_notice_request_detail.sql"]) {
      const source = readFileSync(file, "utf8");
      const start = source.indexOf("create or replace function request_intent_private.enqueue_staff_notices(");
      const end = source.indexOf("create or replace function public.request_intent_enqueue_staff_notices(");
      expect(start).toBeGreaterThan(0); expect(end).toBeGreaterThan(start);
      await db.sql(source.slice(start, end));
      expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "root_binding_changed" });
      expect(await persisted(db, row.id)).toEqual(before);
      await expect(bind(db)).rejects.toMatchObject({ code: "55000", message: "retention_staff_notice_lock_required" });
      // A stale active binding may always be disabled after drift. Rebinding
      // requires restoring BOTH exact reviewed lock-bearing definitions.
      await db.sql(`update ${S}.retention_execution_settings set enabled=false`);
      expect((await db.sql(`select enabled from ${S}.retention_execution_settings`)).rows[0].enabled).toBe(false);
      await db.sql(readFileSync(STAFF_LOCK_SQL, "utf8"));
      await bind(db);
    }
  } finally { await db.close(); }
}, 180_000);

pg16It.each([
  ["enqueue-first", "short"], ["enqueue-first", "full"],
  ["retention-first", "short"], ["retention-first", "full"],
] as const)("C3 B2 actual %s / %s enqueue serializes with parent erasure", async (ordering, kind) => {
  const { db, row } = await ready(); let pool: Pool | undefined;
  try {
    const password = randomUUID();
    await db.sql(`create role retention_race_login login noinherit password '${password}'; grant service_role to retention_race_login`);
    pool = db.poolForLogin("retention_race_login", password);
    const first = await pool.connect(), second = await pool.connect();
    const enqueueSql = kind === "short"
      ? "select public.request_intent_enqueue_staff_notices($1::timestamptz,$2::text[]) as value"
      : "select public.request_intent_enqueue_staff_notices($1::timestamptz,$2::text[],$1::timestamptz) as value";
    const enqueueArgs = [row.submittedAt, ["one@fixture.invalid", "two@fixture.invalid"]];
    const eraseSql = "select public.request_intent_retention_execute($1::uuid,$2::uuid) as value";
    const eraseArgs = [row.id, randomUUID()];
    try {
      await first.query("begin"); await first.query("set local role service_role");
      await second.query("begin"); await second.query("set local role service_role");
      const firstPid = (await first.query("select pg_backend_pid() as pid")).rows[0].pid;
      const secondPid = (await second.query("select pg_backend_pid() as pid")).rows[0].pid;
      const firstResult = ordering === "enqueue-first" ? await first.query(enqueueSql, enqueueArgs) : await first.query(eraseSql, eraseArgs);
      // Install handlers immediately; every rejection is re-thrown after locks
      // are released. No timing-only assertion or unobserved background query.
      let settled = false;
      const pending = (ordering === "enqueue-first" ? second.query(eraseSql, eraseArgs) : second.query(enqueueSql, enqueueArgs))
        .then(value => ({ ok: true as const, value }), error => ({ ok: false as const, error }))
        .finally(() => { settled = true; });
      let blocked = false;
      try {
        for (let i = 0; i < 250; i++) {
          blocked = (await first.query("select $1::integer=any(pg_blocking_pids($2::integer)) as blocked", [firstPid, secondPid])).rows[0].blocked;
          if (blocked || settled) break;
          await delay(20);
        }
      } finally { await first.query("commit"); }
      const secondResult = await pending;
      if (!secondResult.ok) { await second.query("rollback"); throw secondResult.error; }
      await second.query("commit");
      expect(blocked, "the other real backend waited on the canonical parent lock").toBe(true);
      if (ordering === "enqueue-first") {
        expect(firstResult.rows[0].value).toBe(1);
        expect(secondResult.value.rows[0].value).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
        const job = (await db.sql("select event_key,template_key,recipient,payload from public.research_notification_outbox")).rows[0];
        expect(job.event_key).toBe("ea-request-submitted-" + row.id);
        expect(job.template_key).toBe(kind === "short" ? "ea_request_submitted_staff_v1" : "ea_request_submitted_staff_full_v1");
        expect(job.recipient).toBe("one@fixture.invalid");
        expect(Object.keys(job.payload).sort()).toEqual(["itemCount", "recipients", "reference", "submittedAt"]);
        expect(job.payload.itemCount).toBe(1);
        expect(job.payload.recipients).toEqual(enqueueArgs[1]);
        expect((await persisted(db, row.id)).requests).toBe(1);
      } else {
        expect(firstResult.rows[0].value.status).toBe("erased");
        expect(secondResult.value.rows[0].value).toBe(0);
        expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
        expect((await persisted(db, row.id)).requests).toBe(0);
      }
    } finally { await first.query("rollback"); await second.query("rollback"); first.release(); second.release(); }
  } finally { if (pool) await pool.end(); await db.close(); }
}, 180_000);

pg16It.each(["execution", "backend"] as const)("C3 B3 ticket from another %s cannot authorize direct erasure", async (foreign) => {
  const { db, row } = await ready(); let pool: Pool | undefined;
  try {
    const password = randomUUID();
    await db.sql(`create role retention_ticket_fixture login noinherit bypassrls password '${password}';
      grant usage on schema ${S} to retention_ticket_fixture;
      grant select,insert,delete on ${S}.retention_execution_tickets to retention_ticket_fixture;
      grant select,delete on ${S}.requests to retention_ticket_fixture;
      grant execute on function ${S}.retention_delete_authorized(regclass,uuid) to retention_ticket_fixture`);
    pool = db.poolForLogin("retention_ticket_fixture", password);
    const client = await pool.connect(), other = await pool.connect();
    try {
      await client.query("begin");
      const otherPid = (await other.query("select pg_backend_pid() as pid")).rows[0].pid;
      const executionId = randomUUID(), nonce = randomUUID();
      await client.query("select set_config('xenios.retention_execution_id',$1,true),set_config('xenios.retention_execution_nonce',$2,true)",
        [executionId, nonce]);
      expect((await client.query(`select ${S}.retention_delete_authorized('${S}.requests'::regclass,$1) as allowed`, [row.id])).rows[0].allowed)
        .toBe(false); // GUCs alone never authorize.
      await client.query(`insert into ${S}.retention_execution_tickets values($1,$2,txid_current(),
        case when $3='backend' then $4::integer else pg_backend_pid() end,$5,'erase')`,
      [row.id, foreign === "execution" ? randomUUID() : executionId, foreign, otherPid, nonce]);
      expect((await client.query(`select ${S}.retention_delete_authorized('${S}.requests'::regclass,$1) as allowed`, [row.id])).rows[0].allowed)
        .toBe(false);
      await client.query("savepoint forbidden_delete");
      await expect(client.query(`delete from ${S}.requests where id=$1`, [row.id])).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint forbidden_delete");
      await client.query("rollback");
      expect((await persisted(db, row.id)).requests).toBe(1);
      expect((await persisted(db, row.id)).tickets).toBe(0);
    } finally { await client.query("rollback"); client.release(); other.release(); }
  } finally { if (pool) await pool.end(); await db.close(); }
}, 180_000);

pg16It("C3 B3 later real publication with changed retention fields cannot reinterpret the captured policy", async () => {
  const { db, row, policy } = await ready();
  try {
    const nextBundle = randomUUID(), nextPublication = randomUUID();
    await db.sql(`insert into ${S}.policy_bundles select $1::uuid,environment,retention_policy_id,'2.0',retention_record_reference,
      repeat('d',64),recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,
      approval_record_reference,approval_received_at,required_agreements,notice_agreement_kind,notice_agreement_version,
      notice_document_sha256,clock_timestamp() from ${S}.policy_bundles where id=$2`, [nextBundle, policy.bundle]);
    const published = await db.sql(`select ${S}.publish_policy_capture_bundle($1,$2,clock_timestamp()+interval '10 seconds',$3) as id`,
      [nextPublication, nextBundle, policy.publication]);
    expect(published.rows[0].id).toBe(nextPublication);
    expect((await db.sql(`select publication_id,bundle_id from ${S}.request_policy_snapshots where request_id=$1`, [row.id])).rows)
      .toEqual([{ publication_id: policy.publication, bundle_id: policy.bundle }]);
    expect((await execute(db, row.id)).status).toBe("erased");
    expect((await db.sql(`select publication_id,bundle_id from ${S}.fixture_retained_policy where request_id=$1`, [row.id])).rows)
      .toEqual([{ publication_id: policy.publication, bundle_id: policy.bundle }]);
    expect((await db.sql(`select b.retention_policy_version from ${S}.policy_capture_publications p join ${S}.policy_bundles b on b.id=p.bundle_id
      where p.id=$1 and p.recorded_at>(select captured_at from ${S}.fixture_retained_policy where request_id=$2)`, [nextPublication, row.id])).rows)
      .toEqual([{ retention_policy_version: "2.0" }]);
  } finally { await db.close(); }
}, 180_000);

pg16It("retention candidate is inert, private and refuses missing Root bindings without changing requests", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); const row = await seedRequest(db);
    const before = await db.snapshot();
    await db.sql(readFileSync(SQL, "utf8"));
    expect(await execute(db, row.id)).toEqual({ status: "blocked", reason: "disabled" });
    await db.sql(`update ${S}.retention_execution_settings set enabled=true,environment=$1,activated_at=clock_timestamp(),
      authority_definition_sha256=repeat('a',64),prepare_definition_sha256=repeat('b',64),guard_definition_sha256=repeat('c',64),
      create_definition_sha256=repeat('d',64),find_definition_sha256=repeat('e',64),context_definition_sha256=repeat('f',64),
      staff_short_definition_sha256=repeat('a',64),staff_full_definition_sha256=repeat('b',64)`, [ENV]);
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
  const db = createDurableJourneyFixture(); let pool: Pool | undefined, barrierPool: Pool | undefined;
  try {
    await boot(db, true);
    const expired = await seedRequest(db), closed = await seedRequest(db, 100), notDue = await seedRequest(db, 179);
    const clinical = await seedRequest(db, 200, true), legacy = await seedRequest(db), race = await seedRequest(db);
    await seedHistoricalPolicy(db, [expired.id, closed.id, notDue.id, clinical.id, race.id]);
    await db.sql(readFileSync("supabase/candidates/request_intent_policy_capture.sql", "utf8"));
    await installFixturePorts(db);
    await installFixtureConsumers(db);
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
    for (const lifecycle of ["reviewing", null]) {
      await authority(db, expired.id, { lifecycle });
      expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "lifecycle_unknown" });
    }
    await authority(db, expired.id, { lifecycle: "closed", closedAt: "1900-01-01T00:00:00Z" });
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "timeline_invalid" });
    await authority(db, expired.id);
    expect(await execute(db, legacy.id)).toEqual({ status: "blocked", reason: "policy_snapshot_missing" });
    expect(await execute(db, clinical.id)).toEqual({ status: "blocked", reason: "clinical_or_unknown_line" });
    expect(await execute(db, notDue.id)).toEqual({ status: "blocked", reason: "not_due" });
    await db.sql(`update ${S}.retention_execution_settings set environment='fixture-wrong-environment'`);
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "policy_snapshot_ineligible" });
    await bind(db);
    await db.sql(`create table ${S}.fixture_unknown_dependency(id uuid references ${S}.requests(id))`);
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
    await db.sql(`drop table ${S}.fixture_unknown_dependency`);
    // Unknown children of an erased child must not cascade away with evidence.
    await db.sql(`create table ${S}.fixture_unknown_evidence_dependency(event_id bigint references ${S}.access_events(id) on delete cascade);
      insert into ${S}.fixture_unknown_evidence_dependency select id from ${S}.access_events where request_id='${expired.id}'`);
    expect(await execute(db, expired.id)).toEqual({ status: "blocked", reason: "dependency_graph_unsupported" });
    expect(await persisted(db, expired.id)).toEqual(before);
    await db.sql(`drop table ${S}.fixture_unknown_evidence_dependency`);
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
    await db.sql(`create role retention_fixture_login login noinherit password '${password}'; grant service_role to retention_fixture_login;
      grant usage on schema ${S} to retention_fixture_login;
      grant select,update on ${S}.fixture_retention_authority to retention_fixture_login`);
    pool = db.poolForLogin("retention_fixture_login", password);
    barrierPool = db.poolForLogin("retention_fixture_login", password);
    const first = await pool.connect(), second = await pool.connect(), holder = await barrierPool.connect();
    try {
      async function run(client: PoolClient) {
        await client.query("begin");
        try {
          await client.query("set local role service_role");
          const r = await client.query("select public.request_intent_retention_execute($1,$2) as value", [race.id, randomUUID()]);
          await client.query("commit"); return r.rows[0].value;
        } catch (e) { await client.query("rollback"); throw e; }
      }
      const pids = [(await first.query("select pg_backend_pid() as pid")).rows[0].pid,
        (await second.query("select pg_backend_pid() as pid")).rows[0].pid];
      await holder.query("begin");
      await holder.query(`select request_id from ${S}.fixture_retention_authority where request_id=$1 for update`, [race.id]);
      const attempts = Promise.all([run(first), run(second)]);
      let blocked = false;
      try {
        for (let i = 0; i < 250; i++) {
          const observed = await holder.query(`select cardinality(pg_blocking_pids($1))>0
            and cardinality(pg_blocking_pids($2))>0 as blocked`, pids);
          if (observed.rows[0].blocked) { blocked = true; break; }
          await delay(20);
        }
      } finally { await holder.query("commit"); }
      const results = await attempts;
      expect(blocked, "both real backend calls waited for the authoritative writer lock").toBe(true);
      expect(results.map(x => x.status).sort()).toEqual(["blocked", "erased"]);
      expect(results.find(x => x.status === "blocked")).toEqual({ status: "blocked", reason: "request_missing" });
    } finally { await holder.query("rollback"); first.release(); second.release(); holder.release(); }
    expect(await persisted(db, race.id)).toEqual({ requests: 0, access: 0, snapshots: 0, tickets: 0,
      retained_access: 1, retained_policy: 1, suppression: 1 });
    expect((await db.sql("select count(*)::int as n from public.research_notification_outbox")).rows[0].n).toBe(0);
    expect((await db.sql(`select enabled from ${S}.workflow_settings`)).rows[0].enabled).toBe(false);
  } finally { if (barrierPool) await barrierPool.end(); if (pool) await pool.end(); await db.close(); }
}, 180_000);
