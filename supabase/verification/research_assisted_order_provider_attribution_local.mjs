// G1 source-only risk attribution proof. Synthetic fixtures live solely in the
// inherited no-network/no-published-port disposable PostgreSQL 17.11 container.
// No provider is authenticated; no money, mail, managed SQL or historical fact
// is created. This entrypoint deliberately runs NO timing-sensitive race tests.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import {
  ProviderSettlementHarness, migrationPath as settlementMigrationPath,
  prefix, adapterRevision, scope, expected, id, request, actor, actorLabel,
  q, j, service, json, statusExpr, digest,
} from './research_assisted_order_quote_provider_settlement_harness.mjs';

export { prefix, adapterRevision, scope, expected, id, request, actor, actorLabel,
  q, j, service, json, statusExpr, digest };
export const attributionPath = 'supabase/candidates/20261003_research_assisted_order_provider_attribution.sql';
export const quarantinePath = 'supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql';
export const attributionPolicyRevision = 'synthetic-attribution-policy-v1';
export const attributionSemantics = 'preexisting_exact_object_risk_only_v1';
export const attributionAuthority = Object.freeze({
  schemaVersion: 'assisted_order_provider_attribution_v1',
  transactionIsolation: 'read_committed_only',
  attributionPolicy: attributionSemantics,
  settlementEnabled: false,
  refundEnabled: false,
  targetHoldRequired: true,
});
export const call = expression => service(`select ${expression}::text;`);
const runFile = promisify(execFile);
const lineageSha = 'c0e25c73a0d789829ea213e2ee040c68e06f0a75';
const pinnedCanonicalHashes = Object.freeze({
  'supabase/verification/research_assisted_order_quote_provider_settlement_harness.mjs': 'f8a3119819ff31abc895c78b9027d5290a4eac98cfd09f9ae066b63b22d82f58',
  'supabase/verification/research_assisted_order_quote_provider_execution_harness.mjs': '5d2a6ae6bc5e69fd60a56cd1fa65d79279caa62cd0601cf0f8393816fed408bd',
  'supabase/verification/research_assisted_order_quote_provider_journal_harness.mjs': '75ffec63c069f187280457d8babfa9d23f04f338c19a5d2354abe27d9e6d2a3e',
  [quarantinePath]: '91a20f681038a5e845137feb6556c4041b1645f6b2c8f9122bc7c9e85280f477',
});

export class AttributionHarness extends ProviderSettlementHarness {
  async installQuarantine() { await this.psql(await readFile(quarantinePath, 'utf8')); }
  async installAttribution() { await this.psql(await readFile(attributionPath, 'utf8')); }
  async snapshot() {
    return { ...await super.snapshot(), notificationAttempts: json(await this.psql(`select
      coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text from public.research_notification_attempts r;`)) };
  }
  async provisionAttribution(configuration, { verifier = actor, label = actorLabel } = {}) {
    await this.psql(`insert into ${prefix}provider_attribution_policies
      (source_id,policy_revision,attribution_semantics,granted_by)
      values(${q(configuration.sourceId)},${q(attributionPolicyRevision)},${q(attributionSemantics)},'synthetic-owner');
      insert into ${prefix}provider_attribution_grants(source_id,auth_user_id,actor_label,granted_by)
      values(${q(configuration.sourceId)},${q(verifier)},${q(label)},'synthetic-owner');`);
  }
}

export async function configureAttributionSource(db, label, scopeOverrides = {}, { attribution = true } = {}) {
  const configuration = Object.freeze({
    sourceId: `synthetic-attribution-${label}`,
    revision: adapterRevision,
    scope: Object.freeze({ ...scope, provider: 'synthetic-attribution-provider',
      accountId: `synthetic-attribution-account-${label}`, ...scopeOverrides }),
  });
  await db.provision({ source: configuration.sourceId, configuredScope: configuration.scope });
  if (attribution) await db.provisionAttribution(configuration);
  return configuration;
}

export async function candidateRequest(db, n, configuration, { capture = true, result = {}, event = {} } = {}) {
  await db.setup(n);
  await db.reserve(n, configuration);
  const claim = await db.claim(n, id(6, n), configuration);
  assert.equal(claim.authorized, true, 'Synthetic create must have a durable authorized claim');
  const created = await db.append(n, db.result(n, { ...configuration.scope, ...result }), configuration);
  assert.equal(created.classification, 'bound', 'Fixture must create durable immutable object bindings');
  const captured = capture ? await db.captureAppend(n, db.capture(n, event), configuration) : null;
  if (captured) assert.equal(captured.classification, 'bound');
  return { created, captured, claim };
}

export function metadataFreeEvent(db, n, overrides = {}) {
  return db.capture(n, {
    eventId: `synthetic-attribution-metadata-free-${n}`,
    payloadSha256: digest(`synthetic-attribution-metadata-free-bytes-${n}`),
    claimedAttemptId: null, claimedRequestId: null, claimedQuoteId: null,
    claimedQuoteVersion: null, claimedAcceptanceId: null, claimedCanonicalOrderId: null,
    ...overrides,
  });
}

export const appendEventExpr = (event, configuration) => `${prefix}provider_event_append(
  ${q(configuration.sourceId)},${q(configuration.revision)},${j(configuration.scope)},${j(event)})`;
export const appendEvent = async (db, event, configuration) =>
  json(await db.psql(call(appendEventExpr(event, configuration))));
export function attributionExpr(journalId, configuration, overrides = {}) {
  const input = { journalId, sourceId: configuration.sourceId, revision: configuration.revision,
    scope: configuration.scope, policy: attributionPolicyRevision, actor, ...overrides };
  // There is deliberately no caller-selected requestId or attemptId parameter.
  return `${prefix}provider_attribution_commit(${q(input.journalId)},${q(input.sourceId)},
    ${q(input.revision)},${j(input.scope)},${q(input.policy)},${q(input.actor)})`;
}
export const uncertainty = async (db, n) =>
  json(await db.psql(call(`${prefix}provider_uncertainty('${request(n)}')`)));
export async function requestQuarantineHeld(db, n) {
  // Fixture-owner read: this private predicate is not a service-role RPC. The
  // public uncertainty DTO also holds every existing attempt, even after its
  // unrelated source quarantine clears, so it cannot prove quarantine recovery.
  const held = json(await db.psql(`select ${prefix}provider_request_quarantine_held(${q(request(n))})::text;`));
  assert.equal(typeof held, 'boolean');
  return held;
}

export async function inspectDisposable(db) {
  const inspected = JSON.parse((await runFile('docker', ['inspect', db.containerId, '--format', '{{json .}}'], { windowsHide: true })).stdout);
  assert.equal(inspected.HostConfig.NetworkMode, 'none');
  assert.equal(Object.keys(inspected.HostConfig.PortBindings ?? {}).length, 0);
  const version = await db.psql('show server_version;');
  assert.match(version, /^17\.11(?:\D|$)/);
  return { containerId: db.containerId, postgresVersion: version, node: process.version,
    network: 'none', publishedPorts: 0, syntheticOnly: true, realProviderAuthenticated: false };
}

export async function cleanupAttributionFixture(db) {
  const containerId = db.containerId;
  await db.stop();
  if (!containerId) return;
  let absent = false;
  try { await runFile('docker', ['inspect', containerId], { windowsHide: true }); }
  catch (error) {
    // A generic Docker failure is not proof that the exact container disappeared.
    absent = /No such (object|container)/i.test(String(error.stderr ?? ''));
    if (!absent) throw error;
  }
  assert.equal(absent, true, 'Exact owned disposable container must be absent after removal');
  console.log(`ATTRIBUTION_SQL CLEANUP ${JSON.stringify({ containerId, removed: true, postRemovalInspect: 'not_found' })}`);
}

// Import-safe setup for the separate, explicitly scheduled race entrypoint.
export async function createAttributionFixture({ label = 'race', scopeOverrides = {} } = {}) {
  assert.equal(process.version, 'v20.19.0');
  const db = new AttributionHarness();
  try {
    await db.start(); await db.baseline(); await db.install();
    await db.installQuarantine(); await db.installAttribution();
    const environment = await inspectDisposable(db);
    const configuration = await configureAttributionSource(db, label, scopeOverrides);
    return { db, configuration, environment, close: () => cleanupAttributionFixture(db) };
  } catch (error) { await cleanupAttributionFixture(db); throw error; }
}

async function sourceInventory() {
  const migrations = (await readdir('supabase/migrations')).filter(name => name.includes('research_assisted_order'))
    .map(name => `supabase/migrations/${name}`);
  const lineagePaths = [...Object.keys(pinnedCanonicalHashes), ...migrations,
    'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql',
    'supabase/research-notification-outbox.sql'];
  // Assert the inherited lineage is still the pinned source, not merely stable
  // during this run. Git normalization permits ordinary LF/CRLF checkout modes.
  await runFile('git', ['diff', '--exit-code', '--quiet', lineageSha, '--', ...new Set(lineagePaths)], { windowsHide: true });
  for (const [path, expectedHash] of Object.entries(pinnedCanonicalHashes)) {
    assert.equal(digest((await readFile(path, 'utf8')).replaceAll('\r\n', '\n')), expectedHash, `Pinned lineage changed: ${path}`);
  }
  const paths = [...new Set([...lineagePaths, attributionPath,
    'supabase/verification/research_assisted_order_provider_attribution_local.mjs'])].sort();
  return Object.fromEntries(await Promise.all(paths.map(async path => [path, digest(await readFile(path))])));
}

async function providerCoreSnapshot(db) {
  const tables = ['provider_sources', 'provider_source_grants', 'provider_attempts', 'provider_event_journal',
    'provider_create_policies', 'provider_execution_grants', 'provider_create_claims', 'provider_create_results',
    'provider_identity_bindings', 'provider_settlement_policies', 'provider_settlement_grants', 'provider_settlements'];
  return db.psql(`select jsonb_build_object(${tables.map(table => `${q(table)},
    (select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from ${prefix}${table} r)`).join(',')})::text;`);
}
const attributionRows = db => db.psql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text from ${prefix}provider_attributions r;`);
const attributionConfigurationRows = db => db.psql(`select jsonb_build_object(
  'policies',(select coalesce(jsonb_agg(to_jsonb(r) order by source_id),'[]') from ${prefix}provider_attribution_policies r),
  'grants',(select coalesce(jsonb_agg(to_jsonb(r) order by source_id,auth_user_id),'[]') from ${prefix}provider_attribution_grants r))::text;`);
async function unchangedRefusal(db, sql, ...error) {
  const before = await db.snapshot(), provider = await providerCoreSnapshot(db), receipts = await attributionRows(db);
  const configuration = await attributionConfigurationRows(db);
  await db.refused(sql, ...error);
  assert.deepEqual(await db.snapshot(), before, 'Refused attribution must preserve all canonical financial history/outbox');
  assert.equal(await providerCoreSnapshot(db), provider, 'Refused attribution must preserve original provider evidence');
  assert.equal(await attributionRows(db), receipts, 'Refused attribution must not leave a receipt');
  assert.equal(await attributionConfigurationRows(db), configuration, 'Refused command must not change attribution policies or grants');
}
function assertReceipt(receipt, journalId, configuration, n, replayed) {
  assert.equal(receipt.schemaVersion, 'assisted_order_provider_attribution_receipt_v1');
  assert.equal(receipt.journalId, journalId); assert.equal(receipt.sourceId, configuration.sourceId);
  assert.equal(receipt.requestId, request(n)); assert.equal(receipt.state, 'held');
  assert.equal(receipt.replayed, replayed);
  assert.match(receipt.attributionId, /^[0-9a-f-]{36}$/);
  assert.ok(Number.isFinite(Date.parse(receipt.attributedAt)));
}

export async function runAttributionFunctionalProof() {
  assert.equal(process.version, 'v20.19.0');
  const sourceHashes = await sourceInventory();
  const candidate = await readFile(attributionPath, 'utf8');
  const db = new AttributionHarness(), started = performance.now();
  let groups = 0, reproductions = 0;
  const pass = label => { groups++; console.log(`ATTRIBUTION_SQL PASS ${label}`); };
  console.log(`ATTRIBUTION_SQL SOURCE ${JSON.stringify({ lineageSha, sourceHashes, syntheticOnly: true,
    timingSensitiveRacesRun: false, controlledHostQualified: false })}`);
  try {
    await db.start(); await db.baseline(); await db.install(); await db.installQuarantine();
    const environment = await inspectDisposable(db);
    console.log(`ATTRIBUTION_SQL ENV ${JSON.stringify(environment)}`);
    const configuration = await configureAttributionSource(db, 'primary', {}, { attribution: false });
    await candidateRequest(db, 2100, configuration); await candidateRequest(db, 2101, configuration);
    await candidateRequest(db, 2102, configuration);
    assert.equal((await db.settle(2101, configuration)).state, 'verified');
    const settledBEligibility = await db.eligibility(2101), settledBFinancial = await db.financial(2101);
    assert.equal(settledBEligibility.paymentVerified, true);
    assert.equal(settledBEligibility.providerSettlement, true);
    assert.equal(settledBEligibility.fulfillmentEligible, true);
    assert.equal(await requestQuarantineHeld(db, 2101), false);
    const event = metadataFreeEvent(db, 2100);
    const journal = await appendEvent(db, event, configuration);
    assert.equal(journal.classification, 'quarantined'); assert.equal(journal.reason, 'unknown_attempt');
    assert.equal(journal.requestId, null); assert.equal(journal.attemptId, null);
    assert.equal(await requestQuarantineHeld(db, 2100), true);
    assert.equal(await requestQuarantineHeld(db, 2101), true);
    assert.equal(await requestQuarantineHeld(db, 2102), true);
    assert.deepEqual(await db.eligibility(2101), {
      ...settledBEligibility, fulfillmentEligible: false, reason: 'provider_uncertainty_held',
    });
    assert.deepEqual(await db.financial(2101), settledBFinancial, 'Source quarantine must preserve B settlement and financial history');
    await db.refused(call(db.settleExpr(2102, configuration)), ...expected('SETTLEMENT_HELD'));
    reproductions++;
    console.log('ATTRIBUTION_SQL REPRODUCED M94: metadata-free event for already bound A holds settled B fulfillment and pending C settlement on the same source');

    const beforeInstall = await db.snapshot(), providerBeforeInstall = await providerCoreSnapshot(db);
    const authorities = {};
    for (const name of ['provider_journal_authority', 'provider_execution_authority', 'provider_settlement_authority', 'payment_effects_authority'])
      authorities[name] = json(await db.psql(call(`${prefix}${name}()`)));
    await db.psql(candidate); await db.psql(candidate);
    assert.deepEqual(await db.snapshot(), beforeInstall); assert.equal(await providerCoreSnapshot(db), providerBeforeInstall);
    for (const [name, value] of Object.entries(authorities)) assert.deepEqual(json(await db.psql(call(`${prefix}${name}()`))), value);
    assert.deepEqual(json(await db.psql(call(`${prefix}provider_attribution_authority()`))), attributionAuthority);
    assert.equal(await attributionRows(db), '[]');
    assert.deepEqual(json(await attributionConfigurationRows(db)), { policies: [], grants: [] });
    pass('exact candidate first apply and reapply preserve all historical/provider rows and existing authority DTOs');

    await unchangedRefusal(db, call(attributionExpr(journal.journalId, configuration)), ...expected('ATTRIBUTION_GRANT_REQUIRED'));
    await db.provisionAttribution(configuration);
    const beforeAttribution = await db.snapshot(), providerBeforeAttribution = await providerCoreSnapshot(db);
    const originalJournal = await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(journal.journalId)};`);
    const receipt = json(await db.psql(call(attributionExpr(journal.journalId, configuration))));
    assertReceipt(receipt, journal.journalId, configuration, 2100, false);
    assert.equal(receipt.attemptId, db.attempts.get(2100).attemptId);
    assert.deepEqual(await db.snapshot(), beforeAttribution); assert.equal(await providerCoreSnapshot(db), providerBeforeAttribution);
    const replay = json(await db.psql(call(attributionExpr(journal.journalId, configuration))));
    assert.deepEqual(replay, { ...receipt, replayed: true });
    assert.equal(await requestQuarantineHeld(db, 2100), true);
    assert.equal(await requestQuarantineHeld(db, 2101), false);
    assert.equal(await requestQuarantineHeld(db, 2102), false);
    assert.deepEqual(await db.eligibility(2101), settledBEligibility, 'Attribution must restore already-settled B current eligibility');
    assert.deepEqual(await db.financial(2101), settledBFinancial, 'Attribution must preserve B original settlement, history and outbox');
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_attributions;`), '1');
    assert.equal(await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(journal.journalId)};`), originalJournal);
    await unchangedRefusal(db, call(db.settleExpr(2100, configuration)), ...expected('SETTLEMENT_HELD'));
    assert.equal((await db.settle(2102, configuration)).state, 'verified');
    assert.equal((await db.eligibility(2102)).fulfillmentEligible, true);
    pass('SQL derives only A from preexisting object evidence; attribution/replay preserve money/history/outbox, A stays held, settled B eligibility recovers and C can settle');

    assert.equal((await appendEvent(db, event, configuration)).replayed, true);
    const later = db.capture(2100, { eventId: 'synthetic-attribution-later-valid', payloadSha256: digest('synthetic-attribution-later-valid') });
    const laterReceipt = await appendEvent(db, later, configuration);
    assert.equal(laterReceipt.requestId, request(2100));
    assert.equal(laterReceipt.attemptId, db.attempts.get(2100).attemptId);
    assert.equal(await requestQuarantineHeld(db, 2100), true);
    assert.equal(await requestQuarantineHeld(db, 2101), false);
    assert.equal(await requestQuarantineHeld(db, 2102), false);
    assert.deepEqual(await db.eligibility(2101), settledBEligibility);
    assert.deepEqual(await db.financial(2101), settledBFinancial);
    assert.equal((await db.eligibility(2102)).fulfillmentEligible, true);
    assert.equal(await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(journal.journalId)};`), originalJournal);
    pass('original event replay and a later valid bound event cannot erase A hold or spread attributed risk back to B');

    const alteredReplay = await appendEvent(db, { ...event, payloadSha256: digest('synthetic-attribution-changed-original-bytes') }, configuration);
    assert.equal(alteredReplay.classification, 'conflict'); assert.equal(alteredReplay.requestId, null);
    assert.notEqual(alteredReplay.journalId, journal.journalId);
    assert.equal(await requestQuarantineHeld(db, 2101), true, 'A separately retained changed-payload conflict must remain unassigned risk');
    assert.deepEqual(await db.eligibility(2101), {
      ...settledBEligibility, fulfillmentEligible: false, reason: 'provider_uncertainty_held',
    });
    assert.deepEqual(await db.financial(2101), settledBFinancial);
    assert.equal(await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(journal.journalId)};`), originalJournal);
    pass('changed event replay remains a separate unassigned conflict; attribution never dismisses every row sharing an event identity');

    for (const change of [
      { journalId: null }, { scope: null }, { actor: null },
      { sourceId: 'synthetic-attribution-missing-source' }, { revision: 'synthetic-wrong-adapter' },
      { scope: { ...configuration.scope, provider: 'synthetic-wrong-provider' } },
      { scope: { ...configuration.scope, accountId: 'synthetic-wrong-account' } },
      { scope: { ...configuration.scope, mode: 'live' } },
      { policy: 'synthetic-unapproved-policy' }, { actor: id(4, 9000) },
    ]) await unchangedRefusal(db, call(attributionExpr(journal.journalId, configuration, change)), ...expected('ATTRIBUTION_GRANT_REQUIRED'));
    await db.psql(`insert into ${prefix}provider_attribution_grants(source_id,auth_user_id,actor_label,granted_by)
      values(${q(configuration.sourceId)},'${id(4, 9001)}','synthetic-second-attributor','synthetic-owner');`);
    await unchangedRefusal(db, call(attributionExpr(journal.journalId, configuration, { actor: id(4, 9001) })), ...expected('ATTRIBUTION_CONFLICT'));
    pass('source/account/mode/adapter/policy/actor checks refuse wrong scope and a differently authorized replay cannot overwrite attribution');

    const invalidConfiguration = await configureAttributionSource(db, 'invalid-witness');
    await candidateRequest(db, 2200, invalidConfiguration);
    const invalidEvents = [
      { providerPaymentId: null }, { providerPaymentId: 'synthetic-unbound-payment' },
      { providerSessionId: null }, { providerSessionId: 'synthetic-wrong-session' },
      { claimedAttemptId: id(9, 9990) }, { claimedRequestId: request(9990) },
      { claimedQuoteId: id(5, 9990) }, { claimedQuoteVersion: 2 },
      { claimedAcceptanceId: id(7, 9990) }, { claimedCanonicalOrderId: id(8, 9990) },
      { kind: 'unknown' },
    ];
    for (const [index, change] of invalidEvents.entries()) {
      const invalid = metadataFreeEvent(db, 2200, { eventId: `synthetic-attribution-invalid-${index}`,
        payloadSha256: digest(`synthetic-attribution-invalid-${index}`), ...change });
      const unbound = await appendEvent(db, invalid, invalidConfiguration);
      assert.equal(unbound.requestId, null);
      await unchangedRefusal(db, call(attributionExpr(unbound.journalId, invalidConfiguration)), ...expected('ATTRIBUTION_HELD'));
    }
    const wrongSource = await configureAttributionSource(db, 'wrong-account', { accountId: 'synthetic-other-merchant-account' });
    const otherScopeEvent = await appendEvent(db, metadataFreeEvent(db, 2200, {
      eventId: 'synthetic-attribution-other-source', payloadSha256: digest('synthetic-attribution-other-source'),
    }), wrongSource);
    await unchangedRefusal(db, call(attributionExpr(otherScopeEvent.journalId, wrongSource)), ...expected('ATTRIBUTION_HELD'));
    await unchangedRefusal(db, call(attributionExpr(otherScopeEvent.journalId, invalidConfiguration)), ...expected('ATTRIBUTION_HELD'));
    pass('missing/conflicting object/session and contradictory lineage never provide a caller-selected target; equal object strings in another source are insufficient');

    const earlyConfiguration = await configureAttributionSource(db, 'early-event');
    await db.setup(2300); await db.reserve(2300, earlyConfiguration); await db.claim(2300, id(6, 2300), earlyConfiguration);
    const early = await appendEvent(db, metadataFreeEvent(db, 2300), earlyConfiguration);
    const lateResult = await db.append(2300, db.result(2300, earlyConfiguration.scope), earlyConfiguration);
    assert.equal(lateResult.classification, 'conflict');
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_identity_bindings where attempt_id=${q(db.attempts.get(2300).attemptId)};`), '0');
    await unchangedRefusal(db, call(attributionExpr(early.journalId, earlyConfiguration)), ...expected('ATTRIBUTION_HELD'));
    assert.equal(await db.psql(`select
      ${prefix}provider_attribution_witness_precedes('2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00.001Z'),
      ${prefix}provider_attribution_witness_precedes('2026-01-01T00:00:00Z','2026-01-01T00:00:00Z','2026-01-01T00:00:00Z'),
      ${prefix}provider_attribution_witness_precedes('2026-01-01T00:00:00.001Z','2026-01-01T00:00:00.001Z','2026-01-01T00:00:00Z'),
      ${prefix}provider_attribution_witness_precedes(null,'2026-01-01T00:00:00Z','2026-01-01T00:00:00.001Z'),
      ${prefix}provider_attribution_witness_precedes('2026-01-01T00:00:00Z','2026-01-01T00:00:00.001Z','2026-01-01T00:00:00.002Z'),
      ${prefix}provider_attribution_witness_precedes('-infinity','-infinity','2026-01-01T00:00:00Z');`), 't|f|f|f|f|f');
    pass('early event cannot gain identity from a later conflicting create result; private chronology predicate strictly rejects equal/future/null/nonfinite/mismatched witness times');

    const rollbackConfiguration = await configureAttributionSource(db, 'rollback');
    await candidateRequest(db, 2400, rollbackConfiguration);
    const rollbackEvent = await appendEvent(db, metadataFreeEvent(db, 2400), rollbackConfiguration);
    const rollbackFinancial = await db.snapshot(), rollbackProvider = await providerCoreSnapshot(db), rollbackReceipts = await attributionRows(db);
    await db.psql(`begin;${call(attributionExpr(rollbackEvent.journalId, rollbackConfiguration))}rollback;`);
    assert.deepEqual(await db.snapshot(), rollbackFinancial); assert.equal(await providerCoreSnapshot(db), rollbackProvider);
    assert.equal(await attributionRows(db), rollbackReceipts);
    await unchangedRefusal(db, `begin;${call(attributionExpr(rollbackEvent.journalId, rollbackConfiguration))}select 1/0;commit;`, '22012');
    assert.equal(await requestQuarantineHeld(db, 2400), true);
    assertReceipt(json(await db.psql(call(attributionExpr(rollbackEvent.journalId, rollbackConfiguration)))), rollbackEvent.journalId, rollbackConfiguration, 2400, false);
    pass('explicit abort and post-insert transaction failure roll back the entire attribution; original quarantine and evidence survive');

    for (const [offset, table] of ['provider_sources', 'provider_attribution_policies', 'provider_attribution_grants'].entries()) {
      const n = 2500 + offset * 2, revoked = await configureAttributionSource(db, `revocation-${offset}`);
      await candidateRequest(db, n, revoked); await candidateRequest(db, n + 1, revoked);
      const unbound = await appendEvent(db, metadataFreeEvent(db, n), revoked);
      const accepted = json(await db.psql(call(attributionExpr(unbound.journalId, revoked))));
      const original = await attributionRows(db);
      await db.psql(`update ${prefix}${table} set revoked_at=clock_timestamp() where source_id=${q(revoked.sourceId)};`);
      await unchangedRefusal(db, call(attributionExpr(unbound.journalId, revoked)), ...expected('ATTRIBUTION_GRANT_REQUIRED'));
      assert.equal(await attributionRows(db), original);
      assert.equal(await requestQuarantineHeld(db, n), true); assert.equal(await requestQuarantineHeld(db, n + 1), false);
      assert.equal(accepted.state, 'held');
    }
    pass('source, attribution policy and grant revocation deny new/replayed commands but retain original receipt and its exact target hold');

    const tables = ['provider_attribution_policies', 'provider_attribution_grants', 'provider_attributions'];
    await unchangedRefusal(db, `insert into ${prefix}provider_attributions
      (journal_id,source_id,adapter_revision,expected_scope,policy_revision,actor_auth_user_id,request_id)
      values(${q(journal.journalId)},${q(configuration.sourceId)},${q(configuration.revision)},
        ${j(configuration.scope)},${q(attributionPolicyRevision)},'${actor}','${request(2101)}');`,
    ...expected('ATTRIBUTION_CONFLICT'));
    for (const role of ['anon', 'authenticated', 'service_role']) {
      for (const table of tables) {
        await db.refused(`set role ${role};select * from ${prefix}${table};`, '42501');
        await db.refused(`set role ${role};insert into ${prefix}${table} default values;`, '42501');
      }
      await db.refused(`set role ${role};select ${prefix}provider_attribution_witness_precedes(now(),now(),now());`, '42501');
      if (role !== 'service_role') await db.refused(`set role ${role};select ${attributionExpr(journal.journalId, configuration)};`, '42501');
    }
    for (const statement of [
      `update ${prefix}provider_attributions set request_id='${request(2101)}' where id=${q(receipt.attributionId)}`,
      `delete from ${prefix}provider_attributions where id=${q(receipt.attributionId)}`,
      `truncate ${prefix}provider_attributions cascade`,
      `set session_replication_role=replica;delete from ${prefix}provider_attributions where id=${q(receipt.attributionId)}`,
      `update ${prefix}provider_attribution_policies set policy_revision='synthetic-replaced' where source_id=${q(configuration.sourceId)}`,
      `update ${prefix}provider_attribution_grants set actor_label='synthetic-replaced' where source_id=${q(configuration.sourceId)}`,
    ]) await unchangedRefusal(db, `${statement};`, 'P0001');
    for (const level of ['read uncommitted', 'repeatable read', 'serializable'])
      await unchangedRefusal(db, `begin isolation level ${level};${call(attributionExpr(journal.journalId, configuration))}commit;`, ...expected('TRANSACTION_ISOLATION_REQUIRED'));
    pass('private tables/helpers, direct service-role denial, immutable and ENABLE ALWAYS protections, and READ COMMITTED-only command admission remain enforced');

    // Corrupt only this disposable schema, prove exact reapply refuses, restore
    // the same ACL bytes, then prove the original seal again. No seal is rebased.
    await db.psql(`grant select on ${prefix}provider_attributions to authenticated;`);
    try { await db.refused(candidate, '55000'); }
    finally { await db.psql(`revoke select on ${prefix}provider_attributions from authenticated;`); }
    assert.deepEqual(json(await db.psql(call(`${prefix}provider_attribution_authority()`))), attributionAuthority);
    for (const drift of [
      `grant execute on function ${prefix}provider_attribution_witness_precedes(timestamptz,timestamptz,timestamptz) to service_role;`,
      `grant select(witness_snapshot) on ${prefix}provider_attributions to authenticated;`,
      `alter table ${prefix}provider_attributions enable replica trigger adp05a_attribution;`,
    ]) await db.refused(`begin;${drift}${call(`${prefix}provider_attribution_authority()`)}commit;`, '55000');
    const finalFinancial = await db.snapshot(), finalProvider = await providerCoreSnapshot(db), finalReceipts = await attributionRows(db);
    await db.psql(candidate);
    assert.deepEqual(await db.snapshot(), finalFinancial); assert.equal(await providerCoreSnapshot(db), finalProvider);
    assert.equal(await attributionRows(db), finalReceipts);
    pass('exact candidate reapply rejects ACL drift and authority rejects column/helper/replica drift; populated exact reapply preserves every receipt and historical obligation');

    for (const [path, hash] of Object.entries(sourceHashes))
      assert.equal(digest(await readFile(path)), hash, `Source changed during attribution proof: ${path}`);
    const summary = { groups, refusals: db.refusals, reproductions, node: process.version,
      postgresVersion: environment.postgresVersion,
      seconds: Number(((performance.now() - started) / 1000).toFixed(3)), sourceHashes,
      candidateSha256: sourceHashes[attributionPath], predecessorSha256: sourceHashes[quarantinePath],
      settlementPredecessorSha256: sourceHashes[settlementMigrationPath],
      attributionScope: 'preexisting-exact-object-risk-only', completeQuarantineResolution: false,
      g2g3g4Closed: false, timingSensitiveRacesRun: false, controlledHostQualified: false,
      realProviderAuthenticated: false, emailSent: false, managedStateMutated: false, productionMutated: false };
    console.log(`ATTRIBUTION_SQL COMPLETE ${JSON.stringify(summary)}`);
    return summary;
  } finally { await cleanupAttributionFixture(db); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
  await runAttributionFunctionalProof();
