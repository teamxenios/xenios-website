/** Real owned-PG16 candidate rehearsal; no host URL or managed DB is accepted.
 * All policy/approval/configuration rows below are explicit synthetic fixtures,
 * never the approved company records or an activation. No worker/provider runs.
 * pg16It follows the existing CI/owned-local opt-in; SQL/start/cleanup errors fail.
 */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import type { Pool, PoolClient } from "pg";
import { expect } from "vitest";
import { sha256AssistedOrderHasher } from "../defaults";
import type { RequestIntentLine } from "../../../../shared/research/assisted-order/request-intent";
import { createDurableJourneyFixture, pg16It, submission } from "./durable-journey.pg.fixture";
import { requestIntentRepository } from "./rpc-repository";
import type { CreateIntent } from "./service";

const S = "request_intent_private", ENV = "policy-capture-fixture";
const CANDIDATE = "supabase/candidates/request_intent_policy_capture.sql";
const TERMS = { kind: "fixture-terms", version: "fixture-v1" };
const PRIVACY = { kind: "fixture-privacy", version: "fixture-privacy-v1" };
const RETENTION = "fixture:retention:1", RECIPIENTS = "fixture:recipients:1";
type Fixture = ReturnType<typeof createDurableJourneyFixture>;
const ordinary: RequestIntentLine = {
  productId: "product-fixture", variantId: "pc-fixture", sourceVariantId: "variant-fixture",
  productName: "Synthetic product", specification: "Synthetic exact variant", family: "research_peptides_materials",
  workflowMode: "request_pricing", quantity: 1, researchUseOnly: true, clinicalReviewRequired: false,
  sourceDisplayState: "request_access", sourceVariantDisplayState: "request_access", sourceRefusal: null,
  catalogVersion: "fixture-policy-capture", reviewState: "pending",
};
function intent(attempt = randomUUID()): CreateIntent {
  const input = submission(), requestId = randomUUID();
  return {
    ownerHash: sha256AssistedOrderHasher.hash("policy-fixture-owner"),
    attemptHash: sha256AssistedOrderHasher.hash(attempt), fingerprint: sha256AssistedOrderHasher.hash("facts:" + attempt),
    detail: { kind: "unapproved_selection_request", requestId,
      publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase(), status: "pending_review",
      // The real create RPC ignores this proposed timestamp and uses DB now().
      createdAt: "1900-01-01T00:00:00Z",
      contact: { ...input.contact, billingAddress: input.contact.shippingAddress },
      agreements: [...input.agreements, { ...PRIVACY, accepted: true, acceptedAt: new Date().toISOString() }],
      lines: [ordinary] },
  };
}
async function boot(db: Fixture) {
  await db.start({ managedCareSchema: true });
  for (const file of ["supabase/research-notification-outbox.sql",
    "supabase/migrations/20261114133500_early_access_pending_request_reader.sql",
    "supabase/migrations/20261118024134_request_intent_workflow.sql",
    "supabase/migrations/20261118033449_early_access_request_customer_notices.sql"]) {
    await db.sql(readFileSync(file, "utf8"));
  }
}
async function addBundle(db: Fixture, id = randomUUID(), noticeVersion = PRIVACY.version,
  pairs: ReadonlyArray<{ kind: string; version: string }> = [TERMS, PRIVACY], noticeHash = "c".repeat(64)) {
  await db.sql(`insert into ${S}.policy_bundles(id,environment,
    retention_policy_id,retention_policy_version,retention_record_reference,retention_document_sha256,
    recipient_policy_id,recipient_policy_version,recipient_record_reference,recipient_document_sha256,
    approval_record_reference,approval_received_at,required_agreements,
    notice_agreement_kind,notice_agreement_version,notice_document_sha256)
    values($1,$2,'FIXTURE-RETENTION','fixture-v1',$3,$4,'FIXTURE-RECIPIENTS','fixture-v1',$5,$6,
      'fixture:approval:1',clock_timestamp()-interval '1 second',$7::jsonb,$8,$9,$10)`,
  [id, ENV, RETENTION, "a".repeat(64), RECIPIENTS, "b".repeat(64), JSON.stringify(pairs),
    PRIVACY.kind, noticeVersion, noticeHash]);
  return id;
}
async function activate(db: Fixture, bundle: string, workflow = false) {
  await db.sql(`update ${S}.workflow_settings set environment=$1,start_at=clock_timestamp(),
    retention_policy_version=$2,recipient_policy_version=$3,
    policy_capture_bundle_id=$4,policy_capture_enabled=true,enabled=$5`,
  [ENV, RETENTION, RECIPIENTS, bundle, workflow]);
}
async function counts(db: Fixture) {
  return (await db.sql(`select
    (select count(*)::int from ${S}.requests) as requests,
    (select count(*)::int from ${S}.access_events) as audit,
    (select count(*)::int from ${S}.request_policy_snapshots) as captures,
    (select count(*)::int from ${S}.workflow) as workflows,
    (select count(*)::int from ${S}.workflow_events) as events,
    (select count(*)::int from ${S}.workflow_staff_intents) as staff,
    (select count(*)::int from ${S}.workflow_notice_intents) as notices,
    (select count(*)::int from public.research_notification_outbox) as outbox`)).rows[0];
}
const createSql = "select public.request_intent_create_or_replay($1::text,$2::text,$3::text,$4::jsonb) as value";
const values = (record: CreateIntent) => [record.ownerHash, record.attemptHash, record.fingerprint, JSON.stringify(record.detail)];

pg16It("policy capture is default-off, seeds nothing and never backfills legacy requests", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db);
    const repository = requestIntentRepository(db.adapter().client);
    const legacyInput = intent(), legacy = await repository.createOrReplay(legacyInput);
    const before = await db.snapshot();
    const candidate = readFileSync(CANDIDATE, "utf8");
    await db.sql(candidate); await db.sql(candidate);
    expect((await db.sql(`select policy_capture_enabled,policy_capture_bundle_id,environment,start_at,
      retention_policy_version,recipient_policy_version from ${S}.workflow_settings`)).rows).toEqual([{
      policy_capture_enabled: false, policy_capture_bundle_id: null, environment: null, start_at: null,
      retention_policy_version: null, recipient_policy_version: null,
    }]);
    expect((await db.sql(`select * from ${S}.policy_bundles`)).rowCount).toBe(0);
    expect(await db.snapshot()).toEqual(before);
    await repository.createOrReplay(intent());
    expect(await counts(db)).toEqual({ requests: 2, audit: 2, captures: 0, workflows: 0, events: 0, staff: 0, notices: 0, outbox: 0 });
    const bundle = await addBundle(db); await activate(db, bundle);
    expect(await repository.createOrReplay(legacyInput)).toEqual(legacy);
    expect((await db.sql(`select * from ${S}.request_policy_snapshots`)).rowCount).toBe(0);
    const fresh = await repository.createOrReplay(intent());
    expect((await db.sql(`select request_id,bundle_id,captured_at>=r.created_at as causal
      from ${S}.request_policy_snapshots p join ${S}.requests r on r.id=p.request_id`)).rows)
      .toEqual([{ request_id: fresh.receipt.requestId, bundle_id: bundle, causal: true }]);
    expect(await counts(db)).toEqual({ requests: 3, audit: 3, captures: 1, workflows: 0, events: 0, staff: 0, notices: 0, outbox: 0 });
    expect(JSON.stringify(fresh.receipt)).not.toMatch(/bundle|approval|policy|fixture:|1900-/);
  } finally { await db.close(); }
}, 180_000);

const publishSql = `select ${S}.publish_policy_capture_bundle($1::uuid,$2::uuid,$3::timestamptz,$4::uuid) as id`;
async function publication(db: Fixture, bundle: string, effectiveAt: string, previous: string, id = randomUUID()) {
  return (await db.sql(publishSql, [id, bundle, effectiveAt, previous])).rows[0].id as string;
}
async function latestPublication(db: Fixture) {
  return (await db.sql(`select id,bundle_id,revision,effective_at from ${S}.policy_capture_publications
    where environment=$1 order by revision desc limit 1`, [ENV])).rows[0];
}
async function futureBoundary(db: Fixture, seconds = 2) {
  return (await db.sql(`select to_char((clock_timestamp()+$1::integer*interval '1 second') at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as value`, [seconds])).rows[0].value as string;
}
async function awaitBoundary(db: Fixture, at: string) {
  await db.sql("select pg_sleep(greatest(0,extract(epoch from($1::timestamptz-clock_timestamp()))))", [at]);
}
function acceptedPairs(pairs: ReadonlyArray<{ kind: string; version: string }>): CreateIntent {
  const record = intent();
  // A genuinely new synthetic visitor submission explicitly accepts these
  // versions. No persisted acceptance or frozen attempt is upgraded here.
  return { ...record, detail: { ...record.detail,
    agreements: [...record.detail.agreements.filter(row => row.kind.startsWith("assisted_order_form_v1:")),
      ...pairs.map(pair => ({ ...pair, accepted: true as const, acceptedAt: new Date().toISOString() }))] } };
}

pg16It("append-only policy rotation keeps valid new intake and immutable historical acceptance, notices and body binding", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); await db.sql(readFileSync(CANDIDATE, "utf8"));
    const firstBundle = await addBundle(db); await activate(db, firstBundle, true);
    const firstPublication = await latestPublication(db), repository = requestIntentRepository(db.adapter().client);
    const original = intent(), saved = await repository.createOrReplay(original);
    const originalSnapshot = (await db.sql(`select * from ${S}.request_policy_snapshots where request_id=$1`, [saved.receipt.requestId])).rows[0];
    const originalRequest = (await db.snapshot())[0];
    const event = (await db.sql(`select event_id from ${S}.workflow_notice_intents where request_id=$1`, [saved.receipt.requestId])).rows[0].event_id;
    const eventKey = "ea-request-customer-" + event, digest = "e".repeat(64);
    await db.asRole("service_role", "select public.request_intent_customer_notice_bind($1,$2)", [eventKey, digest]);
    const versions = [{ ...TERMS, version: "fixture-v2" }, { ...PRIVACY, version: "fixture-privacy-v2" }];
    const nextBundle = await addBundle(db, randomUUID(), versions[1].version, versions, "d".repeat(64));
    const effective = await futureBoundary(db), publicationId = randomUUID();
    expect(await publication(db, nextBundle, effective, firstPublication.id, publicationId)).toBe(publicationId);
    expect((await latestPublication(db)).revision).toBe(2);
    await awaitBoundary(db, effective);
    const freshInput = acceptedPairs(versions), fresh = await repository.createOrReplay(freshInput);
    expect((await db.sql(`select bundle_id,publication_id from ${S}.request_policy_snapshots where request_id=$1`, [fresh.receipt.requestId])).rows)
      .toEqual([{ bundle_id: nextBundle, publication_id: publicationId }]);
    const freshRow = (await db.snapshot()).find(row => row.id === fresh.receipt.requestId)!;
    expect(freshRow.agreements.filter(row => !row.kind.startsWith("assisted_order_form_v1:")).map(({ kind, version }) => ({ kind, version })))
      .toEqual(versions);
    const beforeStale = await counts(db);
    await expect(repository.createOrReplay(intent())).rejects.toMatchObject({ code: "request_intent_persistence_uncertain" });
    expect(await counts(db)).toEqual(beforeStale);
    expect(await repository.createOrReplay(original)).toEqual(saved);
    expect((await db.snapshot()).find(row => row.id === saved.receipt.requestId)).toEqual(originalRequest);
    expect((await db.sql(`select * from ${S}.request_policy_snapshots where request_id=$1`, [saved.receipt.requestId])).rows[0])
      .toEqual(originalSnapshot);
    expect((await db.sql(`select attempt_digest from ${S}.workflow_notice_intents where event_id=$1`, [event])).rows)
      .toEqual([{ attempt_digest: digest }]);
    expect(await publication(db, nextBundle, effective, firstPublication.id, publicationId)).toBe(publicationId);
    expect((await db.sql(`select count(*)::int as n from ${S}.policy_capture_publications`)).rows[0].n).toBe(2);

    // A later synthetic provider outcome is persisted after commit, not raised
    // inside request creation. This is no network/inbox evidence: it verifies
    // the existing honest "unknown" projection while the request stays saved.
    await db.sql(`insert into public.research_notification_attempts(outbox_id,attempt,outcome,error_summary)
      select id,1,'failed','Customer notice send had no confirmed result.' from public.research_notification_outbox where event_key=$1`, [eventKey]);
    await db.sql("update public.research_notification_outbox set status='failed_permanent',completed_at=clock_timestamp() where event_key=$1", [eventKey]);
    expect((await db.sql(`select ${S}.workflow_customer_notice($1::uuid,$2::uuid) as state`, [saved.receipt.requestId, event])).rows[0].state)
      .toBe("delivery_unknown");
    expect(await repository.createOrReplay(original)).toEqual(saved);
    expect(await counts(db)).toEqual(beforeStale);
  } finally { await db.close(); }
}, 180_000);

pg16It("rotation selects by the DB submission boundary and cannot rebind an already-started transaction", async () => {
  const db = createDurableJourneyFixture(); let pool: Pool | undefined; let transaction: PoolClient | undefined;
  try {
    await boot(db); await db.sql(readFileSync(CANDIDATE, "utf8"));
    const firstBundle = await addBundle(db); await activate(db, firstBundle);
    const firstPublication = await latestPublication(db);
    const versions = [TERMS, { ...PRIVACY, version: "fixture-privacy-v2" }];
    const nextBundle = await addBundle(db, randomUUID(), versions[1].version, versions);
    const password = randomUUID(); await db.sql(`create role fixture_rotation_custodian login superuser password '${password}'`);
    pool = db.poolForLogin("fixture_rotation_custodian", password); transaction = await pool.connect();
    await transaction.query("begin"); await transaction.query("set local role service_role"); await transaction.query("select now()");
    const effective = await futureBoundary(db), nextPublication = await publication(db, nextBundle, effective, firstPublication.id);
    await awaitBoundary(db, effective);
    const oldInput = intent(), old = (await transaction.query(createSql, values(oldInput))).rows[0].value;
    await transaction.query("commit");
    expect((await db.sql(`select p.bundle_id,p.publication_id,r.created_at<$2::timestamptz as earlier
      from ${S}.request_policy_snapshots p join ${S}.requests r on r.id=p.request_id where p.request_id=$1`, [old.receipt.requestId, effective])).rows)
      .toEqual([{ bundle_id: firstBundle, publication_id: firstPublication.id, earlier: true }]);
    const repository = requestIntentRepository(db.adapter().client), fresh = await repository.createOrReplay(acceptedPairs(versions));
    expect((await db.sql(`select bundle_id,publication_id from ${S}.request_policy_snapshots where request_id=$1`, [fresh.receipt.requestId])).rows)
      .toEqual([{ bundle_id: nextBundle, publication_id: nextPublication }]);
    expect(await repository.createOrReplay(oldInput)).toEqual(old);
    expect(await counts(db)).toEqual({ requests: 2, audit: 2, captures: 2, workflows: 0, events: 0, staff: 0, notices: 0, outbox: 0 });
  } finally {
    try { if (transaction) { try { await transaction.query("rollback"); } finally { transaction.release(); } } }
    finally { try { if (pool) await pool.end(); } finally { await db.close(); } }
  }
}, 180_000);

pg16It("publication is prospective, serialized, idempotent and inaccessible to application roles", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); await db.sql(readFileSync(CANDIDATE, "utf8"));
    const initial = await addBundle(db); await activate(db, initial);
    const genesis = await latestPublication(db), versions = [TERMS, { ...PRIVACY, version: "fixture-privacy-v2" }];
    const next = await addBundle(db, randomUUID(), versions[1].version, versions);
    const other = await addBundle(db, randomUUID(), versions[1].version, versions, "f".repeat(64));
    const at = await futureBoundary(db, 4), attempts = [randomUUID(), randomUUID()];
    const raced = await Promise.allSettled([publication(db, next, at, genesis.id, attempts[0]),
      publication(db, other, at, genesis.id, attempts[1])]);
    expect(raced.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter(row => row.status === "rejected")).toHaveLength(1);
    const winner = raced.findIndex(row => row.status === "fulfilled"), selected = winner === 0 ? next : other;
    expect(await publication(db, selected, at, genesis.id, attempts[winner])).toBe(attempts[winner]);
    await expect(publication(db, selected, at, genesis.id, attempts[1 - winner])).rejects.toMatchObject({ code: "40001" });
    await expect(publication(db, initial, at, genesis.id, attempts[winner])).rejects.toMatchObject({ code: "23505" });
    const latest = await latestPublication(db), laterBundle = winner === 0 ? other : next;
    await expect(publication(db, laterBundle, "2000-01-01T00:00:00Z", latest.id)).rejects.toMatchObject({ code: "22023" });
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, publishSql, [randomUUID(), laterBundle, at, latest.id])).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, `select * from ${S}.policy_capture_publications`)).rejects.toMatchObject({ code: "42501" });
      await expect(db.asRole(role, `update ${S}.workflow_settings set policy_capture_enabled=false`)).rejects.toMatchObject({ code: "42501" });
      expect((await db.sql("select has_table_privilege($1,$2,'INSERT') as allowed", [role, `${S}.policy_capture_publications`])).rows[0].allowed).toBe(false);
      expect((await db.sql("select has_function_privilege($1,$2,'EXECUTE') as allowed",
        [role, `${S}.publish_policy_capture_bundle(uuid,uuid,timestamptz,uuid)`])).rows[0].allowed).toBe(false);
    }
    for (const sql of [`update ${S}.policy_capture_publications set effective_at=effective_at+interval '1 second'`,
      `delete from ${S}.policy_capture_publications`, `truncate ${S}.policy_capture_publications cascade`]) {
      await expect(db.sql(sql)).rejects.toMatchObject({ code: "42501" });
    }
    expect((await db.sql(`select count(*)::int as n from ${S}.policy_capture_publications`)).rows[0].n).toBe(2);
    const ready = await futureBoundary(db, 5);
    await db.sql(`update ${S}.workflow_settings set policy_capture_enabled=false`);
    // Committed publication retries are reads; disabling does not erase history.
    expect(await publication(db, selected, at, genesis.id, attempts[winner])).toBe(attempts[winner]);
    await expect(publication(db, laterBundle, ready, latest.id)).rejects.toMatchObject({ code: "55000" });
  } finally { await db.close(); }
}, 180_000);

pg16It("one real transaction captures one bundle across insert races, reply loss, replay, ACL and immutability checks", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); const candidate = readFileSync(CANDIDATE, "utf8"); await db.sql(candidate);
    const bundle = await addBundle(db); await activate(db, bundle, true);
    const repository = requestIntentRepository(db.adapter().client), first = intent();
    const races = await Promise.all(Array.from({ length: 6 }, () => {
      const requestId = randomUUID();
      return repository.createOrReplay({ ...first, detail: { ...first.detail, requestId,
        publicReference: "XRI-" + requestId.replaceAll("-", "").toUpperCase() } });
    }));
    expect(races.every(row => row.receipt.requestId === races[0].receipt.requestId)).toBe(true);
    expect(await counts(db)).toEqual({ requests: 1, audit: 1, captures: 1, workflows: 1, events: 2, staff: 1, notices: 1, outbox: 1 });
    const snapshot = (await db.sql(`select p.request_id,p.bundle_id,p.captured_at,r.created_at,
      b.required_agreements,b.notice_agreement_kind,b.notice_agreement_version,b.notice_document_sha256
      from ${S}.request_policy_snapshots p join ${S}.requests r on r.id=p.request_id
      join ${S}.policy_bundles b on b.id=p.bundle_id`)).rows[0];
    expect(snapshot.bundle_id).toBe(bundle);
    expect(snapshot.required_agreements).toEqual([TERMS, PRIVACY]);
    expect(snapshot.notice_agreement_kind).toBe(PRIVACY.kind);
    expect(snapshot.notice_agreement_version).toBe(PRIVACY.version);
    expect(snapshot.notice_document_sha256).toBe("c".repeat(64));
    expect(snapshot.captured_at.getTime()).toBeGreaterThanOrEqual(snapshot.created_at.getTime());
    expect(snapshot.created_at.getUTCFullYear()).toBeGreaterThan(2020);

    const lost = intent();
    await expect(requestIntentRepository(db.adapter({ loseCreateReply: true }).client).createOrReplay(lost)).rejects.toThrow();
    expect((await counts(db)).captures).toBe(2);
    const recovered = await repository.findAttempt(lost.ownerHash, lost.attemptHash);
    expect(recovered?.fingerprint).toBe(lost.fingerprint);
    expect(await repository.createOrReplay(lost)).toEqual(recovered);
    const beforeReapply = await counts(db);
    await db.sql(candidate);
    expect(await counts(db)).toEqual(beforeReapply);
    expect((await db.sql(`select * from ${S}.request_policy_snapshots where request_id=$1`, [snapshot.request_id])).rows[0].captured_at)
      .toEqual(snapshot.captured_at);
    await expect(db.sql(`update ${S}.workflow_settings set retention_policy_version='fixture:other'`))
      .rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(`update ${S}.workflow_settings set policy_capture_bundle_id=null`))
      .rejects.toMatchObject({ code: "22023" });
    await expect(db.sql(`update ${S}.workflow_settings set start_at=start_at-interval '1 day'`))
      .rejects.toMatchObject({ code: "22023" });
    await db.sql(`update ${S}.workflow_settings set enabled=false,policy_capture_enabled=false`);
    expect(await repository.createOrReplay(first)).toEqual(races[0]);
    expect(await counts(db)).toEqual(beforeReapply);

    for (const table of ["policy_bundles", "request_policy_snapshots"]) {
      for (const statement of [`update ${S}.${table} set ${table === "policy_bundles" ? "id=id" : "bundle_id=bundle_id"}`,
        `delete from ${S}.${table}`, `truncate ${S}.${table} cascade`]) {
        await expect(db.sql(statement)).rejects.toMatchObject({ code: "42501" });
      }
      for (const role of ["anon", "authenticated", "service_role"] as const) {
        for (const statement of [`select * from ${S}.${table}`, `delete from ${S}.${table}`,
          `update ${S}.${table} set ${table === "policy_bundles" ? "id=id" : "bundle_id=bundle_id"}`,
          `truncate ${S}.${table}`]) {
          await expect(db.asRole(role, statement)).rejects.toMatchObject({ code: "42501" });
        }
        expect((await db.sql("select has_table_privilege($1,$2,'INSERT') as allowed", [role, `${S}.${table}`])).rows[0].allowed).toBe(false);
      }
    }
    for (const role of ["anon", "authenticated", "service_role"] as const) {
      await expect(db.asRole(role, `select ${S}.capture_request_policy($1::uuid)`, [snapshot.request_id]))
        .rejects.toMatchObject({ code: "42501" });
      expect((await db.sql("select has_function_privilege($1,$2,'EXECUTE') as allowed",
        [role, `${S}.valid_policy_agreement_pairs(jsonb)`])).rows[0].allowed).toBe(false);
    }
    await expect(db.sql(`update ${S}.requests set status=status`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql(`delete from ${S}.access_events`)).rejects.toMatchObject({ code: "42501" });
    await expect(db.sql(`delete from ${S}.workflow_events`)).rejects.toMatchObject({ code: "42501" });
    expect(await counts(db)).toEqual(beforeReapply);
    expect((await db.sql(`select relname,relrowsecurity,relforcerowsecurity from pg_class
      where oid in ('${S}.policy_bundles'::regclass,'${S}.request_policy_snapshots'::regclass)`)).rows)
      .toEqual(expect.arrayContaining([
        { relname: "policy_bundles", relrowsecurity: true, relforcerowsecurity: true },
        { relname: "request_policy_snapshots", relrowsecurity: true, relforcerowsecurity: true },
      ]));
  } finally { await db.close(); }
}, 180_000);

pg16It("policy/notice mismatches and downstream failures roll back the entire canonical save", async () => {
  const db = createDurableJourneyFixture();
  try {
    await boot(db); await db.sql(readFileSync(CANDIDATE, "utf8"));
    await expect(addBundle(db, randomUUID(), "unbound-notice-version")).rejects.toMatchObject({ code: "23514" });
    expect((await db.sql(`select * from ${S}.policy_bundles`)).rowCount).toBe(0);
    const bundle = await addBundle(db);
    for (const [environment, retention] of [["wrong-fixture", RETENTION], [ENV, "fixture:wrong"]]) {
      await expect(db.sql(`update ${S}.workflow_settings set policy_capture_enabled=true,
        environment=$1,start_at=clock_timestamp(),policy_capture_bundle_id=$2,
        retention_policy_version=$3,recipient_policy_version=$4`, [environment, bundle, retention, RECIPIENTS]))
        .rejects.toMatchObject({ code: "55000" });
      expect((await db.sql(`select policy_capture_enabled,policy_capture_bundle_id,environment from ${S}.workflow_settings`)).rows)
        .toEqual([{ policy_capture_enabled: false, policy_capture_bundle_id: null, environment: null }]);
    }
    await activate(db, bundle, true);
    const repository = requestIntentRepository(db.adapter().client);
    const baseline = await counts(db);
    const missingBase = intent(), wrongBase = intent(), duplicateBase = intent(), lookalikeBase = intent();
    const missingNotice: CreateIntent = { ...missingBase, detail: { ...missingBase.detail,
      agreements: missingBase.detail.agreements.filter(row => row.kind !== PRIVACY.kind) } };
    const wrongTerms: CreateIntent = { ...wrongBase, detail: { ...wrongBase.detail,
      agreements: wrongBase.detail.agreements.map(row => row.kind === TERMS.kind ? { ...row, version: "fixture-v2" } : row) } };
    const duplicate: CreateIntent = { ...duplicateBase, detail: { ...duplicateBase.detail,
      agreements: [...duplicateBase.detail.agreements, duplicateBase.detail.agreements[0]] } };
    const wildcardLookalike: CreateIntent = { ...lookalikeBase, detail: { ...lookalikeBase.detail,
      agreements: [...lookalikeBase.detail.agreements, {
        kind: "assistedXorderXformXv1:extra", version: "fixture-v1", accepted: true, acceptedAt: new Date().toISOString() }] } };
    const selectedBase = intent(), callerSelected = { ...selectedBase,
      detail: { ...selectedBase.detail, policyBundleId: randomUUID() } };
    for (const record of [missingNotice, wrongTerms, duplicate, wildcardLookalike, callerSelected]) {
      await expect(repository.createOrReplay(record)).rejects.toMatchObject({ code: "request_intent_persistence_uncertain" });
      expect(await repository.findAttempt(record.ownerHash, record.attemptHash)).toBeNull();
      expect(await counts(db)).toEqual(baseline);
    }
    // Real notice88 is still invoked. A fixture-only trigger fails after its
    // intent INSERT, proving capture/request/events/audit all roll back together.
    await db.sql(`create function ${S}.fixture_notice_failure() returns trigger language plpgsql as $$
      begin raise exception 'fixture_failed_after_notice_insert'; end $$;
      create trigger fixture_notice_failure after insert on ${S}.workflow_notice_intents
        for each row execute function ${S}.fixture_notice_failure()`);
    const record = intent();
    await expect(repository.createOrReplay(record)).rejects.toMatchObject({ code: "request_intent_persistence_uncertain" });
    expect(await counts(db)).toEqual(baseline);
    await db.sql(`drop trigger fixture_notice_failure on ${S}.workflow_notice_intents; drop function ${S}.fixture_notice_failure()`);
    const saved = await repository.createOrReplay(record);
    const committed = { requests: 1, audit: 1, captures: 1, workflows: 1, events: 2, staff: 1, notices: 1, outbox: 1 };
    expect(await counts(db)).toEqual(committed);
    // An owner removing configuration cannot make new requests silently legacy.
    // Existing committed retry still returns its original receipt/capture.
    await db.sql(`delete from ${S}.workflow_settings`);
    expect(await repository.createOrReplay(record)).toEqual(saved);
    await expect(repository.createOrReplay(intent())).rejects.toMatchObject({ code: "request_intent_persistence_uncertain" });
    expect(await counts(db)).toEqual(committed);
  } finally { await db.close(); }
}, 180_000);

pg16It("capture serializes with settings changes and uses DB submission time at the prospective boundary", async () => {
  const db = createDurableJourneyFixture();
  let pool: Pool | undefined;
  let transaction: PoolClient | undefined;
  const pending: Promise<unknown>[] = [];
  try {
    await boot(db); await db.sql(readFileSync(CANDIDATE, "utf8")); const bundle = await addBundle(db);
    // This ephemeral superuser is confined to the owned fixture database; no
    // host credentials, service authority or production role is accepted.
    const password = randomUUID();
    await db.sql(`create role fixture_policy_custodian login superuser password '${password}'`);
    pool = db.poolForLogin("fixture_policy_custodian", password); transaction = await pool.connect();
    await transaction.query("begin");
    await transaction.query("set local role service_role");
    const beforeBoundary = intent();
    await transaction.query("select now()");
    await activate(db, bundle);
    const old = (await transaction.query(createSql, values(beforeBoundary))).rows[0].value;
    await transaction.query("commit");
    expect((await db.sql(`select r.created_at<s.start_at as before from ${S}.requests r cross join ${S}.workflow_settings s where r.id=$1`,
      [old.receipt.requestId])).rows[0].before).toBe(true);
    expect((await counts(db)).captures).toBe(0);

    await transaction.query("begin"); await transaction.query("set local role service_role");
    const winner = intent(); const saved = (await transaction.query(createSql, values(winner))).rows[0].value;
    const off = db.sql(`update ${S}.workflow_settings set policy_capture_enabled=false`);
    pending.push(off); void off.catch(() => undefined);
    async function blocked(fragment: string) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const rows = (await db.sql("select 1 from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid() and wait_event_type='Lock' and position($1 in query)>0", [fragment])).rows;
        if (rows.length) return;
        await delay(20);
      }
      throw new Error("Expected actual policy-settings lock contention was not observed");
    }
    await blocked("set policy_capture_enabled=false");
    await transaction.query("commit"); await off;
    expect((await db.sql(`select bundle_id from ${S}.request_policy_snapshots where request_id=$1`, [saved.receipt.requestId])).rows)
      .toEqual([{ bundle_id: bundle }]);
    const repository = requestIntentRepository(db.adapter().client);
    expect(await repository.createOrReplay(winner)).toEqual(saved);

    // Opposite lock ordering: a waiting INSERT sees the committed disabled
    // setting, not a mixture of stale selected bundle and new switch.
    await db.sql(`update ${S}.workflow_settings set policy_capture_enabled=true`);
    await transaction.query("begin");
    await transaction.query(`update ${S}.workflow_settings set policy_capture_enabled=false`);
    const waiting = repository.createOrReplay(intent());
    pending.push(waiting); void waiting.catch(() => undefined);
    await blocked("request_intent_create_or_replay");
    await transaction.query("commit"); await waiting;
    expect(await counts(db)).toEqual({ requests: 3, audit: 3, captures: 1, workflows: 0, events: 0, staff: 0, notices: 0, outbox: 0 });
  } finally {
    try {
      if (transaction) { try { await transaction.query("rollback"); } finally { transaction.release(); } }
    } finally {
      await Promise.allSettled(pending);
      try { if (pool) await pool.end(); } finally { await db.close(); }
    }
  }
}, 180_000);
