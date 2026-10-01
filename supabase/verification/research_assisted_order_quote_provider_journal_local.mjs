// ADP01 source-only database proof. Synthetic trusted-adapter input is not
// real provider authentication. No hosted URLs, credentials, mail or payments.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import {
  ProviderJournalHarness, migrationPath, id, request, member, line, actor, otherActor,
  actorLabel, reference, q, j, service, json, fixture, statusExpr,
} from './research_assisted_order_quote_provider_journal_harness.mjs';

assert.equal(process.version, 'v20.19.0');
const db = new ProviderJournalHarness();
const migration = await readFile(migrationPath, 'utf8');
assert.ok(migration.trim(), 'Provider journal source migration must exist');
const prefix = 'public.research_assisted_order_';
const sourceId = 'synthetic-provider-journal';
const sourceId2 = 'synthetic-provider-journal-other';
const providerNamespace = 'synthetic-unconfigured';
const accountRef = 'synthetic-account';
const adapterRevision = 'synthetic-adapter-v1';
const configuredScope = { provider: providerNamespace, accountId: accountRef, mode: 'test' };
const digest = value => createHash('sha256').update(value).digest('hex');
const attempts = new Map();
const expected = detail => ['P0001', `ASSISTED_ORDER_PROVIDER_${detail}`];
const instant = async () => db.psql("select to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');");

function reserveExpr(n, overrides = {}) {
  const input = { requestId: request(n), quoteId: db.quotes.get(n), quoteVersion: 1,
    acceptanceId: db.acceptances.get(n), sourceId, actor, key: digest(`synthetic-reservation-${n}`),
    revision: adapterRevision, scope: configuredScope, ...overrides };
  return `${prefix}provider_attempt_reserve(${q(input.requestId)},${q(input.quoteId)},${input.quoteVersion ?? 'null'},
    ${q(input.acceptanceId)},${q(input.sourceId)},${q(input.revision)},${j(input.scope)},${q(input.actor)},${q(input.key)})`;
}
const reserveSql = (n, overrides = {}) => service(`select ${reserveExpr(n, overrides)}::text;`);
async function reserve(n, overrides = {}) {
  const receipt = json(await db.psql(reserveSql(n, overrides)));
  attempts.set(n, receipt);
  return receipt;
}
function eventFor(n, overrides = {}) {
  const attempt = attempts.get(n);
  return {
    schemaVersion: 'assisted_order_provider_event_v1', eventId: `synthetic-event-${n}`,
    payloadSha256: digest(`synthetic-original-event-bytes-${n}`), kind: 'captured',
    occurredAt: new Date().toISOString(), claimedAttemptId: attempt?.attemptId ?? null,
    claimedRequestId: request(n), claimedQuoteId: db.quotes.get(n) ?? null,
    claimedQuoteVersion: 1, claimedAcceptanceId: db.acceptances.get(n) ?? null,
    claimedCanonicalOrderId: null, providerPaymentId: `synthetic-payment-${n}`,
    providerSessionId: null, adjustmentId: null, observedAmountCents: 5000, currency: 'USD',
    ...overrides,
  };
}
const appendExpr = (event, source = sourceId, revision = adapterRevision, scope = configuredScope) =>
  `${prefix}provider_event_append(${q(source)},${q(revision)},${j(scope)},${j(event)})`;
const appendSql = (...args) => service(`select ${appendExpr(...args)}::text;`);
const append = async (...args) => json(await db.psql(appendSql(...args)));
const financialState = async n => json(await db.psql(service(`select ${prefix}financial_state('${request(n)}')::text;`)));
const status = n => db.psql(`select status from public.research_assisted_order_requests where id='${request(n)}';`);
const cancelSql = n => service(`select ${statusExpr(n, 'payment_review', 'cancelled', { cancellationReason: 'Synthetic ordinary cancellation' })}::text;`);
const dispositionContextSql = n => service(`select ${prefix}disposition_context('${request(n)}','${actor}','synthetic-bank-import')::text;`);
const uncertainty = async n => json(await db.psql(service(`select ${prefix}provider_uncertainty('${request(n)}')::text;`)));
const journalRow = receipt => db.psql(`select row_to_json(j)::text from public.research_assisted_order_provider_event_journal j where id=${q(receipt.journalId)};`).then(json);
const journalCount = () => db.psql('select count(*) from public.research_assisted_order_provider_event_journal;');
const attemptCount = () => db.psql('select count(*) from public.research_assisted_order_provider_attempts;');
function heldJournal(receipt, classification, reason, n = null) {
  assert.equal(receipt.schemaVersion, 'assisted_order_provider_journal_receipt_v1');
  assert.equal(receipt.state, 'held'); assert.equal(receipt.classification, classification); assert.equal(receipt.reason, reason);
  assert.equal(receipt.requestId, n === null ? null : request(n));
  assert.equal(receipt.attemptId, n === null ? null : attempts.get(n)?.attemptId);
  assert.match(receipt.receivedAt, /\.\d{3}Z$/);
  assert.deepEqual(Object.keys(receipt).sort(), ['schemaVersion','journalId','sourceId','state','classification','reason','requestId','attemptId','receivedAt','replayed'].sort());
}
async function noFundsCommand(n) {
  const context = json(await db.psql(dispositionContextSql(n)));
  const receipt = {
    schemaVersion: 'assisted_order_no_funds_receipt_v1', sourceNamespace: 'synthetic-bank-import',
    sourceReceiptId: `synthetic-terminal-no-funds-${n}`, requestId: context.requestId,
    quoteId: context.quoteId, graphFingerprint: context.graphFingerprint,
    outcome: 'never_received', finality: 'terminal', checkedAt: await instant(),
  };
  return { context, receipt, key: digest(JSON.stringify([
    'assisted-order-no-funds:v1', receipt.sourceNamespace, receipt.sourceReceiptId, context.requestId, context.graphFingerprint,
  ])) };
}
const noFundsExpr = command => `${prefix}disposition_commit_cancel(${q(command.context.requestId)},${q(command.context.quoteId)},
  ${q(command.context.graphFingerprint)},'${actor}',${q(command.key)},'cancel',${j(command.receipt)})`;
const noFundsSql = command => service(`select ${noFundsExpr(command)}::text;`);
async function financialSnapshot() {
  return json(await db.psql(`select json_build_object(
    'observations',(select count(*) from public.research_assisted_order_payment_observations),
    'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
    'claims',(select count(*) from public.research_assisted_order_evidence_claims),
    'dispositions',(select count(*) from public.research_assisted_order_financial_dispositions),
    'events',(select count(*) from public.research_assisted_order_events),
    'outbox',(select count(*) from public.research_notification_outbox),
    'audit',(select count(*) from public.research_assisted_order_audit_events_v1)
  )::text;`));
}
async function provisionSources() {
  await db.psql(`insert into public.research_assisted_order_provider_sources
    (source_id,provider_namespace,account_ref,mode,adapter_revision,granted_by)
    values('${sourceId}','${providerNamespace}','${accountRef}','test','${adapterRevision}','synthetic-owner'),
      ('${sourceId2}','${providerNamespace}','synthetic-other-account','test','${adapterRevision}','synthetic-owner');
    insert into public.research_assisted_order_provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
    values('${sourceId}','${actor}','${actorLabel}','synthetic-owner');`);
}

const startedAt = performance.now();
try {
  const legacyProof=await promisify(execFile)(process.execPath,
    ['supabase/verification/research_assisted_order_quote_provider_journal_legacy.mjs'],
    {windowsHide:true,maxBuffer:2*1024*1024,timeout:120_000});
  process.stdout.write(legacyProof.stdout);process.stderr.write(legacyProof.stderr);
  // Qualify stale RR/SSI snapshots in a separate sequential disposable
  // database before the READ COMMITTED race matrix below. No two containers
  // or qualification jobs overlap, and neither adopts managed state.
  const isolationProof=await promisify(execFile)(process.execPath,
    ['supabase/verification/research_assisted_order_quote_provider_journal_isolation.mjs'],
    {windowsHide:true,maxBuffer:2*1024*1024,timeout:120_000});
  process.stdout.write(isolationProof.stdout);process.stderr.write(isolationProof.stderr);
  await db.start();
  await db.baseline();
  const stableFunctions = `select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where proname in
    ('research_assisted_order_financial_state','research_assisted_order_payment_observe','research_assisted_order_payment_verify',
     'research_assisted_order_payment_verify_bound','research_assisted_order_payment_effects_complete');`;
  const financialFunctionFingerprint = await db.psql(stableFunctions);
  for (const drift of [
    'alter table public.research_assisted_order_payment_observations disable trigger hl12_provider_observation_hold;',
    'alter table public.research_assisted_order_payment_verifications enable replica trigger hl12_provider_verification_hold;',
    'drop trigger hl12_observed_cancel on public.research_assisted_order_requests;',
  ]) await db.refused(`begin;${drift}${migration}`, '55000');
  await db.psql(migration);
  assert.equal(await db.psql(stableFunctions), financialFunctionFingerprint);
  // This is intentionally empty on install: production cannot inherit the
  // proof's synthetic source or capability through the source migration.
  assert.equal(await db.psql('select count(*) from public.research_assisted_order_provider_sources;'), '0');
  assert.equal(await db.psql('select count(*) from public.research_assisted_order_provider_source_grants;'), '0');
  await db.setup(700);
  await db.refused(reserveSql(700), ...expected('SOURCE_REQUIRED'));
  await provisionSources();
  await db.refused(reserveSql(700, { actor: otherActor }), ...expected('GRANT_REQUIRED'));
  await db.refused(reserveSql(700, { sourceId: sourceId2, scope: { ...configuredScope, accountId: 'synthetic-other-account' } }), ...expected('GRANT_REQUIRED'));
  for (const scope of [{ ...configuredScope, provider: 'wrong-provider' }, { ...configuredScope, accountId: 'wrong-account' },
    { ...configuredScope, mode: 'live' }, { ...configuredScope, extra: true }]) {
    await db.refused(reserveSql(700, { scope }), ...expected('SOURCE_REQUIRED'));
  }
  await db.refused(reserveSql(700, { revision: 'changed-adapter-revision' }), ...expected('SOURCE_REQUIRED'));

  await db.setup(701);
  for (const overrides of [
    { quoteId: db.quotes.get(701) }, { quoteVersion: 2 }, { acceptanceId: db.acceptances.get(701) },
    { quoteId: id(9, 999) }, { quoteVersion: 0 }, { acceptanceId: null },
  ]) await db.refused(reserveSql(700, overrides), ...expected('RESERVATION_REFUSED'));
  assert.equal(await db.psql(service(`select ${reserveExpr(700, { requestId: request(999) })} is null;`)), 't');
  await db.setup(702, { accept: false });
  await db.refused(reserveSql(702, { acceptanceId: id(8, 702) }), ...expected('RESERVATION_REFUSED'));
  // Customer ownership remains the existing quote-acceptance boundary, not an
  // implied permission of the administrative reservation RPC.
  assert.equal(await db.psql(service(`select ${prefix}quote_accept('${db.quotes.get(702)}',1,5000,'${member(701)}') is null;`)), 't');
  for (const n of [990, 991]) await db.refused(reserveSql(n, {
    quoteId: db.quotes.get(700), acceptanceId: db.acceptances.get(700),
  }), ...expected('RESERVATION_REFUSED'));

  const beforeReserve = await financialSnapshot();
  const first = await reserve(700);
  assert.equal(first.schemaVersion, 'assisted_order_provider_attempt_v1');
  assert.equal(first.requestId, request(700)); assert.equal(first.quoteId, db.quotes.get(700));
  assert.equal(first.quoteVersion, 1); assert.equal(first.acceptanceId, db.acceptances.get(700));
  assert.equal(first.sourceId, sourceId); assert.equal(first.expectedAmountCents, 5000);
  assert.equal(first.currency, 'USD'); assert.equal(first.state, 'held'); assert.equal(first.replayed, false);
  assert.match(first.attemptId, /^[0-9a-f-]{36}$/); assert.match(first.reservedAt, /\.\d{3}Z$/);
  assert.deepEqual(await financialSnapshot(), beforeReserve);
  assert.deepEqual(await financialState(700), { hasObservation: false, paymentVerified: false });
  assert.equal(await status(700), 'payment_review');
  const replay = await reserve(700);
  assert.deepEqual(replay, { ...first, replayed: true });
  await db.refused(reserveSql(700, { key: digest('changed-reservation-key') }), ...expected('REPLAY_CONFLICT'));
  await db.refused(reserveSql(701, { key: digest('synthetic-reservation-700') }), ...expected('REPLAY_CONFLICT'));
  await db.refused(dispositionContextSql(700), ...expected('UNCERTAINTY_HELD'));
  await db.refused(cancelSql(700), ...expected('UNCERTAINTY_HELD'));
  console.log('PASS scoped administrator reservation, exact request/quote/version/acceptance/economics, quote-owner isolation, held replay and unchanged two-key financial authority.');

  // A superseded, unaccepted offer cannot borrow the later acceptance.
  await db.setup(703, { accept: false, paymentStage: false });
  const oldQuote = db.quotes.get(703);
  const nextQuote = json(await db.psql(service(`select ${prefix}quote_issue('${request(703)}',
    '[{"lineId":"${line(703)}"}]',now()+interval '2 days','synthetic-admin')::text;`)));
  assert.equal(nextQuote.version, 2);
  await db.psql(service(`select ${prefix}quote_accept('${nextQuote.quoteId}',2,5000,'${member(703)}');`));
  const nextAcceptance = await db.psql(`select acceptance_id from public.research_assisted_order_quotes where id='${nextQuote.quoteId}';`);
  await db.refused(reserveSql(703, { quoteId: oldQuote, acceptanceId: nextAcceptance }), ...expected('RESERVATION_REFUSED'));
  await db.setup(704); await db.psql(cancelSql(704));
  await db.refused(reserveSql(704), ...expected('RESERVATION_REFUSED'));
  await db.setup(705); await db.observe(705);
  await db.refused(reserveSql(705), ...expected('RESERVATION_REFUSED'));
  await db.setup(706);
  const beforeInterrupted = await attemptCount();
  await db.refused(`begin;${reserveSql(706)}select 1/0;`, '22012');
  assert.equal(await attemptCount(), beforeInterrupted);
  assert.equal((await reserve(706)).replayed, false);
  assert.equal((await reserve(706)).replayed, true); // Fresh psql process/connection.
  console.log('PASS stale/unaccepted/cross-order/terminal/historical/observed reservation refusal and interrupted reservation rollback with durable retry.');

  // Bound records remain held facts. No observation, paid transition, refund,
  // audit event or customer notification is generated by this journal.
  const validEvent = eventFor(700);
  const beforeEvent = await financialSnapshot();
  const original = await append(validEvent);
  heldJournal(original, 'bound', 'exact_binding', 700);
  const immutableOriginal = await journalRow(original);
  assert.deepEqual(await append(validEvent), { ...original, replayed: true });
  assert.deepEqual(await financialSnapshot(), beforeEvent);
  const beforeInvalid = await journalCount();
  for (const [field, value] of [
    ['schemaVersion','wrong'], ['eventId',' padded'], ['payloadSha256','not-a-digest'], ['kind','settled'],
    ['claimedAttemptId','not-uuid'], ['claimedQuoteVersion',0], ['claimedQuoteVersion',1.5],
    ['observedAmountCents',0.5], ['observedAmountCents',9007199254740992], ['currency','usd'],
    ['occurredAt','2026-01-01T00:00:00Z'], ['occurredAt','2026-01-01T00:00:00.000+00:00'],
    ['occurredAt','2026-02-30T00:00:00.000Z'], ['providerPaymentId','bad\tidentifier'],
  ]) await db.refused(appendSql({ ...validEvent, [field]: value }), ...expected('EVENT_INVALID'));
  await db.refused(appendSql({ ...validEvent, rawPayload: 'synthetic forbidden field' }), ...expected('EVENT_INVALID'));
  for (const scope of [{ ...configuredScope, provider: 'wrong-provider' }, { ...configuredScope, accountId: 'wrong-account' },
    { ...configuredScope, mode: 'live' }, { ...configuredScope, extra: true }]) {
    await db.refused(appendSql(validEvent, sourceId, adapterRevision, scope), ...expected('SOURCE_REQUIRED'));
  }
  await db.refused(appendSql(validEvent, sourceId, 'wrong-revision'), ...expected('SOURCE_REQUIRED'));
  assert.equal(await journalCount(), beforeInvalid);
  for (const [suffix, override, reason] of [
    ['amount',{ observedAmountCents:4999 },'amount_currency_mismatch'],
    ['currency',{ currency:'EUR' },'amount_currency_mismatch'],
    ['refund',{ kind:'refunded',adjustmentId:'synthetic-refund',observedAmountCents:5000 },'unsupported_financial_effect'],
    ['dispute',{ kind:'dispute_opened',adjustmentId:'synthetic-dispute' },'unsupported_financial_effect'],
    ['no-time',{ occurredAt:null },'unsupported_financial_effect'],
  ]) heldJournal(await append({ ...validEvent, ...override, eventId:`synthetic-${suffix}-700`,payloadSha256:digest(suffix) }), 'quarantined', reason, 700);
  for (const kind of ['pending','authorized','failed','cancelled']) {
    const event = { ...validEvent, eventId:`synthetic-${kind}-700`, payloadSha256:digest(kind), kind,
      observedAmountCents: kind === 'authorized' ? 5000 : 0 };
    heldJournal(await append(event), 'bound', 'exact_binding', 700);
  }
  const crashEvent = { ...validEvent,eventId:'synthetic-interrupted-event',payloadSha256:digest('interrupted') };
  const beforeCrash = await journalCount();
  await db.refused(`begin;${appendSql(crashEvent)}select 1/0;`, '22012');
  assert.equal(await journalCount(), beforeCrash);
  assert.equal((await append(crashEvent)).replayed, false);
  assert.equal((await append(crashEvent)).replayed, true);
  assert.deepEqual(await financialSnapshot(), beforeEvent);
  assert.deepEqual(await journalRow(original), immutableOriginal);
  assert.deepEqual(await financialState(700), { hasObservation:false,paymentVerified:false });
  console.log('PASS exact-bound held events, invalid envelope/configured scope refusal, amount/currency/refund/dispute quarantine, immutable replay and interrupted journal rollback.');

  // Every financial race shares the parent request lock. These are actual
  // concurrent connections with observed Lock waits, not Promise-only mocks.
  for (const n of [710,711,712,713,714,715,716,717,718,719,720,721,722,723]) await db.setup(n);
  const same = await db.lockedRace(reserveSql(710), reserveSql(710));
  assert.equal(same.replayed, true);
  await db.lockedRace(reserveSql(711), reserveSql(711, { key:digest('competing-key') }), expected('REPLAY_CONFLICT'));
  await db.lockedRace(reserveSql(712), cancelSql(712), expected('UNCERTAINTY_HELD'));
  await db.lockedRace(cancelSql(713), reserveSql(713), expected('RESERVATION_REFUSED'));
  const nf714 = await noFundsCommand(714);
  await db.lockedRace(reserveSql(714), noFundsSql(nf714), expected('UNCERTAINTY_HELD'));
  const nf715 = await noFundsCommand(715);
  await db.lockedRace(noFundsSql(nf715), reserveSql(715), expected('RESERVATION_REFUSED'));
  const manualTransaction = n => service(`select (${db.observeExpr(n)}->>'observationId') as observation_id \\gset
    select ${prefix}payment_verify_bound('${request(n)}',:'observation_id','${actor}')::text;`);
  await db.lockedRace(reserveSql(716), manualTransaction(716), expected('UNCERTAINTY_HELD'));
  await db.lockedRace(manualTransaction(717), reserveSql(717), expected('RESERVATION_REFUSED'));
  assert.equal((await financialState(716)).paymentVerified, false);
  assert.equal((await financialState(717)).paymentVerified, true);
  assert.equal(await status(717), 'paid');
  const raceEvent = eventFor(700,{ eventId:'synthetic-concurrent-event',payloadSha256:digest('concurrent-event') });
  const raced = await db.lockedRace(appendSql(raceEvent), appendSql(raceEvent));
  assert.equal(raced.replayed, true);
  console.log(`PASS ${db.races} real reservation/replay/cancel/N2/manual-verification/journal races, both financial orderings, with no duplicate or invented settlement.`);

  // Reserve inserts an uncommitted attempt while retaining the SHARE fence.
  // The appender cannot see it at its initial lookup and demonstrably waits on
  // EX fence. After reservation COMMIT makes the attempt visible, classification
  // must still remain unbound. Only this probe's journal transaction rolls back
  // so independent financial-success tests can continue before the durable
  // global quarantine cases. Reservation remains committed, never rewritten.
  const beforeUnknownRace=await journalCount();
  const initiallyUnknown=await db.lockedRace(reserveSql(723),receipt=>{
    attempts.set(723,receipt);
    return `begin;${appendSql(eventFor(723,{eventId:'synthetic-initially-invisible-attempt'}))}rollback;`;
  });
  heldJournal(initiallyUnknown,'quarantined','unknown_attempt');
  assert.equal(await journalCount(),beforeUnknownRace);
  assert.equal((await reserve(723)).attemptId,attempts.get(723).attemptId);
  console.log('PASS initially invisible concurrent reservation stays unbound after fence wait and commit; only this probe journal rolled back, attempt retained.');

  // Privileged direct INSERT cannot forge values normally derived by the RPC.
  const directAttempt = overrides => {
    const row = { request_id:request(701),quote_id:db.quotes.get(701),quote_version:1,acceptance_id:db.acceptances.get(701),
      source_id:sourceId,adapter_revision:adapterRevision,expected_scope:configuredScope,actor_auth_user_id:actor,
      actor_label:actorLabel,idempotency_key:digest('synthetic-direct-attempt'),expected_amount_cents:5000,currency:'USD',state:'held',...overrides };
    return `insert into public.research_assisted_order_provider_attempts(${Object.keys(row).join(',')}) values(${Object.entries(row).map(([key,value]) => key==='expected_scope'?j(value):q(value)).join(',')});`;
  };
  for (const override of [{expected_amount_cents:1},{currency:'EUR'},{acceptance_id:db.acceptances.get(700)},
    {quote_id:db.quotes.get(700)},{quote_version:2},{state:'paid'},{reserved_at:'2100-01-01T00:00:00.000Z'}]) {
    await db.refused(directAttempt(override),...expected('RESERVATION_REFUSED'));
  }
  await db.refused(directAttempt({actor_label:'forged-admin'}),...expected('GRANT_REQUIRED'));
  await db.refused(directAttempt({expected_scope:{...configuredScope,accountId:'wrong-account'}}),...expected('SOURCE_REQUIRED'));
  for (const [field,value] of [['event_identity','forged'],['event_fingerprint','b'.repeat(64)],
    ['established_request_id',request(700)],['established_attempt_id',first.attemptId],['classification','bound'],
    ['reason','exact_binding'],['received_at','2026-01-01T00:00:00.000Z'],['state','paid']]) {
    await db.refused(`insert into public.research_assisted_order_provider_event_journal(source_id,adapter_revision,expected_scope,event,${field})
      values('${sourceId}','${adapterRevision}',${j(configuredScope)},${j(validEvent)},${q(value)});`,...expected('EVENT_INVALID'));
  }
  const providerObserve = db.observeExpr(701).replace("'manual'","'provider'");
  await db.refused(service(`select ${providerObserve};`),'P0001','ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY');
  console.log('PASS privileged malformed direct inserts cannot forge economics, authorization, classifications, parents, timestamps or provider settlement.');

  // The child runs the actual Express/viewer/route/service against this same
  // service_role database. Two invocations later prove process restart, not a
  // mocked persistence response or a live provider signature.
  for (const n of [800,801,802,803,804,805,806,807]) await db.setup(n);
  const runHttp = async phase => {
    const output = await promisify(execFile)(process.execPath,['--import','tsx',
      'supabase/verification/research_assisted_order_quote_provider_journal_http.ts',db.containerId,phase],
      {windowsHide:true,maxBuffer:2*1024*1024,timeout:90_000});
    process.stdout.write(output.stdout); process.stderr.write(output.stderr);
  };
  await runHttp('bound');
  const nf718=await noFundsCommand(718),nf720=await noFundsCommand(720);
  await db.observe(719); // Its later verification must remain blocked by uncertainty.

  // Appended statements use fresh connections. Retained financial receipts
  // survive application restart/retry without calling any external provider.
  assert.equal((await reserve(700)).attemptId, first.attemptId);
  assert.deepEqual(await append(validEvent), { ...original,replayed:true });
  await db.psql(`update public.research_assisted_order_provider_source_grants set revoked_at=clock_timestamp()
    where source_id='${sourceId}' and auth_user_id='${actor}';`);
  await db.refused(reserveSql(700), ...expected('GRANT_REQUIRED'));
  assert.equal((await uncertainty(700)).held, true);
  await db.refused(cancelSql(700), ...expected('UNCERTAINTY_HELD'));
  await db.refused(dispositionContextSql(700), ...expected('UNCERTAINTY_HELD'));
  assert.deepEqual(await append(validEvent), { ...original,replayed:true });
  console.log('PASS revoking reservation capability cannot remove held uncertainty or rewrite authenticated event receipt history.');

  const tables = ['provider_sources','provider_source_grants','provider_attempts','provider_event_journal','provider_fence'];
  for (const table of tables) {
    const relation = `public.research_assisted_order_${table}`;
    assert.equal(await db.psql(`select relrowsecurity and relforcerowsecurity from pg_class where oid='${relation}'::regclass;`), 't');
    for (const role of ['anon','authenticated','service_role']) {
      await db.refused(`set role ${role};select * from ${relation};`, '42501');
      assert.equal(await db.psql(`select has_table_privilege('${role}','${relation}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER');`), 'f');
    }
    await db.refused(`truncate ${relation} cascade;`, ...expected('IMMUTABLE'));
    await db.refused(`delete from ${relation};`, ...expected('IMMUTABLE'));
  }
  for (const [table, column] of [['provider_attempts','id'],['provider_event_journal','id'],['provider_fence','id']]) {
    await db.refused(`update public.research_assisted_order_${table} set ${column}=${column};`, ...expected('IMMUTABLE'));
  }
  await db.refused(`update public.research_assisted_order_provider_sources set adapter_revision='changed' where source_id='${sourceId}';`, ...expected('IMMUTABLE'));
  await db.refused(`update public.research_assisted_order_provider_source_grants set revoked_at=null where source_id='${sourceId}';`, ...expected('IMMUTABLE'));
  const guardRows = json(await db.psql(`select json_agg(json_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled))::text
    from pg_trigger where not tgisinternal and (tgname like 'adp01_%' or tgname='aaa_adp01_uncertainty');`));
  assert.ok(guardRows.length >= 15);
  assert.ok(guardRows.every(row => row.enabled === 'A'), 'Every new guard must run even for replication-role sessions');
  await db.refused(`set session_replication_role=replica;delete from public.research_assisted_order_provider_event_journal;`, ...expected('IMMUTABLE'));
  await db.refused(`insert into public.research_assisted_order_provider_fence values(false);`, ...expected('IMMUTABLE'));
  const signatures = [
    'research_assisted_order_provider_attempt_reserve(uuid,uuid,integer,uuid,text,text,jsonb,uuid,text)',
    'research_assisted_order_provider_event_append(text,text,jsonb,jsonb)',
    'research_assisted_order_provider_uncertainty(uuid)',
    'research_assisted_order_provider_journal_authority()',
  ];
  const allowed = new Set(signatures);
  const functions = json(await db.psql(`select json_agg(json_build_object('signature',p.oid::regprocedure::text,
    'service',has_function_privilege('service_role',p.oid,'EXECUTE'),'anon',has_function_privilege('anon',p.oid,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'config',p.proconfig))::text
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'research_assisted_order_provider_%';`));
  for (const signature of signatures) assert.ok(functions.some(fn => fn.signature === signature), signature);
  for (const fn of functions) {
    assert.equal(fn.service, allowed.has(fn.signature), fn.signature);
    assert.equal(fn.anon, false, fn.signature); assert.equal(fn.authenticated, false, fn.signature);
    assert.ok(fn.config?.some(setting => setting === 'search_path=""' || setting === 'search_path='), fn.signature);
  }
  for (const role of ['anon','authenticated']) {
    for (const call of [reserveExpr(700),appendExpr(validEvent),`${prefix}provider_uncertainty('${request(700)}')`,`${prefix}provider_journal_authority()`]) {
      await db.refused(`set role ${role};select ${call};`, '42501');
    }
  }
  assert.deepEqual(json(await db.psql(service(`select ${prefix}provider_journal_authority()::text;`))), {
    schemaVersion:'assisted_order_provider_journal_v2',transactionIsolation:'read_committed_only',
    settlementEnabled:false,refundEnabled:false,liveExecutionEnabled:false,
  });
  console.log('PASS actual-role RLS/ACL/exact function allowlist, immutable source identity/revocation, always-enabled guards and delete/update/truncate/cascade refusals.');

  // The normal no-funds decision wins the request/fence first; a later unknown
  // event must still durably quarantine without resurrecting the cancellation.
  const earlyEvent=eventFor(718,{eventId:'synthetic-global-after-cancel',claimedAttemptId:null});
  const afterCancel=await db.lockedRace(noFundsSql(nf718),appendSql(earlyEvent));
  heldJournal(afterCancel,'quarantined','unknown_attempt');
  assert.equal(await status(718),'cancelled');
  for (const [name,sql] of [['cancel',cancelSql(721)],['no-funds',noFundsSql(nf720)],
    ['manual-verify',service(`select ${db.verifyExpr(719)}::text;`)]]) {
    await db.lockedRace(appendSql({...earlyEvent,eventId:`synthetic-global-before-${name}`,payloadSha256:digest(name)}),sql,expected('UNCERTAINTY_HELD'));
  }
  // Revoked grants are not the reason for this denial: a distinct active
  // scoped grant still cannot turn a global unknown receipt into no funds.
  await db.psql(`insert into public.research_assisted_order_provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
    values('${sourceId}','${otherActor}','synthetic-second-admin','synthetic-owner');`);
  await db.refused(reserveSql(722,{actor:otherActor}),...expected('UNCERTAINTY_HELD'));
  await runHttp('quarantine');
  console.log('PASS real global-fence races in both orderings, unknown event retained after cancellation, active grant cannot clear global uncertainty, restarted composed HTTP application.');

  // All unbound/quarantined global-barrier cases are last. No request is
  // invented from a provider claim, and no later test silently clears history.
  const globalBefore = await financialSnapshot();
  const otherAttempt = await db.psql(`select row_to_json(a)::text from public.research_assisted_order_provider_attempts a where request_id='${request(706)}';`).then(json);
  attempts.set(706,{ attemptId:otherAttempt.id });
  const conflictEvent = { ...validEvent,payloadSha256:digest('conflicting-original-event-bytes') };
  const conflict = await append(conflictEvent);
  heldJournal(conflict,'conflict','event_identity_conflict');
  assert.notEqual(conflict.journalId,original.journalId);
  assert.deepEqual(await journalRow(original),immutableOriginal);
  assert.deepEqual(await append(conflictEvent),{ ...conflict,replayed:true });
  const beforeConflictReplay = await journalCount();
  await append(conflictEvent);
  assert.equal(await journalCount(),beforeConflictReplay);
  for (const [suffix, changes, reason] of [
    ['wrong-request',{ claimedRequestId:request(701) },'binding_mismatch'],
    ['wrong-quote',{ claimedQuoteId:db.quotes.get(701) },'binding_mismatch'],
    ['wrong-version',{ claimedQuoteVersion:2 },'binding_mismatch'],
    ['wrong-acceptance',{ claimedAcceptanceId:db.acceptances.get(701) },'binding_mismatch'],
    ['unknown',{ claimedAttemptId:id(8,899) },'unknown_attempt'],
    ['early',{ claimedAttemptId:null },'unknown_attempt'],
    ['no-event-id',{ eventId:null },'missing_event_identity'],
    ['unknown-kind',{ kind:'unknown' },'unsupported_financial_effect'],
  ]) {
    const event = { ...validEvent,eventId:`synthetic-${suffix}`,payloadSha256:digest(suffix),...changes };
    heldJournal(await append(event),'quarantined',reason);
  }
  const crossPayment = eventFor(706,{ eventId:'synthetic-cross-order-payment',providerPaymentId:validEvent.providerPaymentId });
  heldJournal(await append(crossPayment),'conflict','payment_identity_conflict');
  // 713 was cancelled normally before any provider reservation. An eventual
  // authenticated event still journals without reopening or assigning an
  // untrusted request claim as a verified binding.
  heldJournal(await append(eventFor(713,{ eventId:'synthetic-late-cancelled' })),'quarantined','unknown_attempt');
  assert.equal(await status(713),'cancelled');
  assert.deepEqual(await financialSnapshot(),globalBefore);
  assert.equal((await uncertainty(718)).reason,'provider_unbound_event_held');
  await db.refused(cancelSql(721),...expected('UNCERTAINTY_HELD'));
  await db.refused(dispositionContextSql(720),...expected('UNCERTAINTY_HELD'));
  await db.refused(service(`select ${db.verifyExpr(719)};`),...expected('UNCERTAINTY_HELD'));
  await db.refused(service(`select ${statusExpr(717,'paid','supplier_processing',{ supplierAssignmentId:'synthetic-supplier' })};`),...expected('UNCERTAINTY_HELD'));
  assert.equal(await status(717),'paid');
  await db.psql(`update public.research_assisted_order_provider_sources set revoked_at=clock_timestamp() where source_id='${sourceId}';`);
  heldJournal(await append({ ...validEvent,eventId:'synthetic-after-source-revocation',payloadSha256:digest('revoked-source') }),
    'quarantined','source_revoked');
  assert.equal((await uncertainty(718)).held,true);
  assert.equal(await status(713),'cancelled');
  assert.equal(await db.psql(stableFunctions),financialFunctionFingerprint);
  const finalFinancial=await financialSnapshot(),finalJournal=await journalCount(),finalAttempts=await attemptCount();
  await db.psql(migration);
  assert.deepEqual(await financialSnapshot(),finalFinancial);
  assert.equal(await journalCount(),finalJournal);assert.equal(await attemptCount(),finalAttempts);
  for (const drift of ['alter table public.research_assisted_order_provider_event_journal disable trigger adp01_journal_guard;',
    'grant select(event) on public.research_assisted_order_provider_event_journal to authenticated;',
    'alter table public.research_assisted_order_payment_observations disable trigger hl12_provider_observation_hold;']) {
    await db.refused(`begin;${drift}select ${prefix}provider_journal_authority();`,'55000');
    await db.refused(`begin;${drift}${migration}`,'55000');
  }
  console.log('PASS exact migration reapply preserves populated history; column ACL, new and inherited guard drift refuse authority and reapply.');
  assert.equal(digest(await readFile(migrationPath,'utf8')),digest(migration),'Migration changed during local qualification');
  console.log(`PASS local ADP01 proof; refusals=${db.refusals}; races=${db.races}; elapsed_ms=${Math.round(performance.now()-startedAt)}; migration_sha256=${digest(migration)}`);
} catch (error) {
  console.error('FAIL local ADP01 provider journal proof', error);
  process.exitCode = 1;
} finally {
  await db.stop();
}
