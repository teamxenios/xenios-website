/**
 * LOCAL disposable credit-reservation SQL rehearsal. Requires an explicitly
 * supplied local PGlite 0.5.8 package; never connects to a database URL.
 * Sequential checks are NOT independent-connection concurrency evidence.
 * No provider, notification, credential, migration-history or production effects.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DRIVER = 'server/research/commerce/qualification/credit-reservation-sql-rehearsal.mjs';
const CHECKOUT = 'supabase/candidates/20260909150000_research_checkout_executions';
const RECOVERY = 'supabase/candidates/20260910120000_research_checkout_execution_recovery';
const CREDIT = 'supabase/candidates/20260910201400_research_checkout_credit_reservations';
const FILES = [
  'supabase/production/research-track-b-commerce.sql',
  `${CHECKOUT}.precheck.sql`, `${CHECKOUT}.sql`, `${CHECKOUT}.postcheck.sql`, `${CHECKOUT}.rehearsal.sql`,
  `${RECOVERY}.precheck.sql`, `${RECOVERY}.sql`, `${RECOVERY}.postcheck.sql`,
  `${CREDIT}.precheck.sql`, `${CREDIT}.sql`, `${CREDIT}.postcheck.sql`,
];
const SIGNATURES = [
  'public.research_store_credit_balance(uuid,timestamptz)',
  'public.research_store_credit_spend(uuid,bigint,uuid,timestamptz)',
];
const lf = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
class RehearsalError extends Error {
  constructor(code, sqlstate = null) { super(code); this.code = code; this.sqlstate = sqlstate; }
}
const requireFact = (fact, code) => { if (!fact) throw new RehearsalError(code); };
const sqlstate = error => typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
const safeFailure = error => ({ code: error instanceof RehearsalError ? error.code : 'unexpected_local_error',
  sqlstate: error instanceof RehearsalError ? error.sqlstate : sqlstate(error) });
const git = args => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).trim();
const exactInteger = value => {
  const n = typeof value === 'string' && /^-?\d+$/.test(value) ? Number(value) : value;
  requireFact(typeof n === 'number' && Number.isSafeInteger(n), 'unsafe_or_missing_integer');
  return n;
};
function runtimeArgument() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    emit({ usage: `node ${DRIVER} --runtime <absolute local @electric-sql/pglite package directory>`, environment: 'XENIOS_PGLITE_PACKAGE_PATH', scope: 'LOCAL_MEMORY_ONLY' });
    return null;
  }
  requireFact(args.length === 0 || (args.length === 2 && args[0] === '--runtime'), 'arguments_invalid');
  const selected = args.length ? args[1] : process.env.XENIOS_PGLITE_PACKAGE_PATH;
  requireFact(typeof selected === 'string' && isAbsolute(selected) && !/^[\\/]{2}/.test(selected)
    && !/^[a-z][a-z0-9+.-]*:\/\//i.test(selected), 'explicit_local_runtime_directory_required');
  return selected;
}
async function localRuntime(directory) {
  const root = await realpath(directory);
  requireFact(!/^[\\/]{2}/.test(root), 'network_runtime_path_refused');
  const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  requireFact(metadata.name === '@electric-sql/pglite' && metadata.version === '0.5.8', 'runtime_identity_or_version_mismatch');
  const within = async path => {
    const actual = await realpath(resolve(root, path)); const rel = relative(root, actual);
    requireFact(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'runtime_entry_outside_package');
    return actual;
  };
  const entry = await within('dist/index.js'), extension = await within('dist/contrib/pgcrypto.js');
  const [{ PGlite }, { pgcrypto }] = await Promise.all([import(pathToFileURL(entry).href), import(pathToFileURL(extension).href)]);
  requireFact(typeof PGlite === 'function' && pgcrypto, 'runtime_exports_missing');
  return { PGlite, pgcrypto, identity: { package: metadata.name, version: metadata.version,
    entrySha256: sha256(await readFile(entry)), pgcryptoEntrySha256: sha256(await readFile(extension)) } };
}

/** All helper writes target only the newly constructed in-memory instance. */
function fixtures(db) {
  let serial = 0;
  const uuid = () => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`;
  const one = async (sql, params = []) => {
    const { rows } = await db.query(sql, params);
    requireFact(rows.length === 1, 'expected_exactly_one_row'); return rows[0];
  };
  const count = async (sql, params = []) => exactInteger((await one(sql, params)).n);
  const balance = async member => {
    const r = await one('select * from public.research_store_credit_balance($1::uuid, now())', [member]);
    return { spendable: exactInteger(r.spendable_cents), pending: exactInteger(r.pending_cents), reserved: exactInteger(r.reserved_cents) };
  };
  const expectBalance = async (member, spendable, reserved, pending = 0) => {
    const b = await balance(member);
    requireFact(b.spendable === spendable && b.reserved === reserved && b.pending === pending, 'canonical_balance_mismatch');
  };
  const grant = async (member, amount, options = {}) => one(`insert into public.research_store_credit_ledger
    (id, member_id, amount_cents, state, reason, available_at, reverses_id, actor_type, actor_id, expires_at, created_at)
    values ($1,$2,$3,$4,'manual_adjustment',$5,$6,'system',$7,$8,coalesce($9::timestamptz,now())) returning *`,
  [uuid(), member, amount, options.state ?? 'approved', options.availableAt ?? null, options.reversesId ?? null,
    options.actorId ?? 'local-credit-rehearsal', options.expiresAt ?? null, options.createdAt ?? null]);
  const order = async (member, credit = 400, options = {}) => {
    const id = uuid(), executionId = uuid(), requestKey = `credit-rehearsal-${serial}`, reservationId = `credit-reservation-${serial}`;
    const total = 1000 - credit, reference = `pi_credit${serial}`;
    await db.query(`insert into public.research_orders
      (id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,checkout_idempotency_key,last_idempotency_key)
      values ($1,$2,'checkout_pending',1000,0,$3,$4,$5,$5)`, [id, member, credit, total, requestKey]);
    await db.query(`insert into public.research_order_lines
      (order_id,sku,display_name,quantity,unit_price_cents,line_total_cents,fulfillment_owner)
      values ($1,'CREDIT-QA','Synthetic credit rehearsal',1,1000,1000,'xenios')`, [id]);
    if (options.withReservation !== false) await db.query(`insert into public.research_lot_reservations
      (reservation_id,member_id,sku,quantity,status,expires_at)
      values ($1,$2,'CREDIT-QA',1,'held',now()+interval '1 hour')`, [reservationId, member]);
    return { id, executionId, member, credit, total, requestKey, reference, reservationId,
      reservationIds: options.withReservation === false ? [] : [reservationId] };
  };
  const create = async (o, overrides = {}) => one(`insert into public.research_checkout_executions
    (id,member_id,request_key,request_body_sha256,order_id,phase,version,amount_cents,payment_method_reference,
     quote_fingerprint,authorization_key,capture_key,cancel_key,reservation_ids)
    values ($1,$2,$3,$4,$5,'reserved',1,$6,'pm_card_visa',$7,$8,$9,$10,$11::text[]) returning *`,
  [o.executionId, overrides.member ?? o.member, o.requestKey, 'a'.repeat(64), o.id, overrides.amount ?? o.total,
    `quote-${o.executionId}`, `xr-auth-${o.executionId}`, `xr-capture-${o.executionId}`, `xr-cancel-${o.executionId}`, o.reservationIds]);
  const record = async (o, version, result) => one('select * from public.research_checkout_execution_record_provider($1,$2,$3::jsonb)', [o.executionId, version, JSON.stringify(result)]);
  const capture = (o, version = 1) => record(o, version, { kind: 'captured', providerReference: o.reference,
    amountCents: o.total, currency: 'usd', memberId: o.member, orderId: o.id });
  const commit = (o, version) => db.query('select * from public.research_checkout_execution_commit_captured($1,$2,now())', [o.executionId, version]);
  const cancel = (o, version) => db.query('select * from public.research_checkout_execution_commit_cancelled($1,$2,now())', [o.executionId, version]);
  const hold = o => one('select * from public.research_checkout_credit_reservations where execution_id=$1', [o.executionId]);
  const spend = (member, amount, orderId) => one('select * from public.research_store_credit_spend($1::uuid,$2::bigint,$3::uuid,now())', [member, amount, orderId]);
  const expectAbsentIntent = async o => {
    requireFact(await count('select count(*) as n from public.research_checkout_executions where id=$1', [o.executionId]) === 0, 'refused_execution_persisted');
    requireFact(await count('select count(*) as n from public.research_checkout_credit_reservations where execution_id=$1', [o.executionId]) === 0, 'refused_hold_persisted');
  };
  const debitCount = o => count('select count(*) as n from public.research_store_credit_ledger where spend_order_id=$1', [o.id]);
  const expectHeld = async o => {
    const h = await hold(o);
    requireFact(h.member_id === o.member && h.order_id === o.id && exactInteger(h.amount_cents) === o.credit
      && h.state === 'held' && h.debit_id === null && h.settled_at === null, 'hold_identity_or_state_mismatch');
    requireFact(await debitCount(o) === 0, 'held_credit_already_debited');
  };
  const refused = async (operation, state, marker) => {
    await db.exec('savepoint qa_refusal'); let rejection;
    try { await operation(); } catch (error) { rejection = error; }
    await db.exec('rollback to savepoint qa_refusal'); await db.exec('release savepoint qa_refusal');
    requireFact(rejection !== undefined, 'expected_refusal_not_observed');
    if (sqlstate(rejection) !== state || (marker && !String(rejection.message).includes(marker))) {
      throw new RehearsalError('unexpected_refusal_reason', sqlstate(rejection));
    }
  };
  const asRole = async (role, operation) => {
    requireFact(['anon', 'authenticated', 'service_role'].includes(role), 'unsupported_local_role');
    // SET LOCAL ROLE is transactional. Roll back to a savepoint established as
    // the original role BEFORE cleanup, so an aborted transaction cannot replace
    // the actual SQL error with RESET ROLE's secondary 25P02 error.
    await db.exec('savepoint qa_role_scope');
    try {
      await db.exec(`set local role ${role}`);
      const value = await operation();
      await db.exec('reset role'); await db.exec('release savepoint qa_role_scope');
      return value;
    } catch (originalError) {
      try { await db.exec('rollback to savepoint qa_role_scope'); await db.exec('release savepoint qa_role_scope'); }
      catch { /* Preserve the original failure; outer rollback/close still run. */ }
      throw originalError;
    }
  };
  return { uuid, one, count, balance, expectBalance, grant, order, create, record, capture, commit, cancel,
    hold, spend, expectAbsentIntent, debitCount, expectHeld, refused, asRole };
}

async function main() {
  const selected = runtimeArgument(); if (selected === null) return;
  const root = await realpath(ROOT);
  requireFact(await realpath(git(['rev-parse', '--show-toplevel'])) === root, 'repository_identity_mismatch');
  const inputs = new Map();
  for (const path of FILES) {
    const text = lf(await readFile(resolve(root, path)));
    inputs.set(path, { path, text, lfSha256: sha256(text), lfBytes: Buffer.byteLength(text) });
  }
  const source = { headSha: git(['rev-parse', 'HEAD']), treeSha: git(['rev-parse', 'HEAD^{tree}']),
    driverLfSha256: sha256(lf(await readFile(HERE))),
    relevantWorkingTreeDirty: git(['status', '--porcelain', '--untracked-files=normal', '--', DRIVER, ...FILES]) !== '',
    binding: 'Actual LF file hashes identify executed bytes; checkout HEAD/tree do not assert dirty bytes were committed.' };
  requireFact(/^[a-f0-9]{40}$/.test(source.headSha) && /^[a-f0-9]{40}$/.test(source.treeSha), 'source_identity_invalid');
  const runtime = await localRuntime(selected);
  emit({ type: 'identity', scope: 'LOCAL_MEMORY_ONLY', source, runtime: runtime.identity,
    sqlInputs: [...inputs.values()].map(({ text, ...identity }) => identity) });
  const results = []; let db = null, closed = false, failure = null;
  const check = async (id, kind, operation, identity = {}) => {
    try { const detail = await operation(); const result = { id, kind, status: 'PASS', ...identity, ...(detail ?? {}) };
      results.push(result); emit({ type: 'check', ...result });
    } catch (error) { const result = { id, kind, status: 'FAIL', ...identity, failure: safeFailure(error) };
      results.push(result); emit({ type: 'check', ...result }); throw error; }
  };
  try {
    db = new runtime.PGlite({ extensions: { pgcrypto: runtime.pgcrypto } });
    await check('local_engine_and_roles', 'setup', async () => {
      const { rows } = await db.query("select current_setting('server_version') as version,current_setting('server_version_num')::integer as version_num");
      requireFact(rows.length === 1 && rows[0].version_num >= 180000 && rows[0].version_num < 190000, 'expected_local_postgres_18');
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      return { postgresVersion: rows[0].version, connections: 1 };
    });
    const runInput = input => check(input.path, 'sql_file', () => db.exec(input.text).then(() => undefined), { lfSha256: input.lfSha256 });
    for (const path of FILES.slice(0, 8)) await runInput(inputs.get(path));
    await creditPrecheckNegatives(check, db, inputs);
    for (const path of FILES.slice(8)) await runInput(inputs.get(path));
    const f = fixtures(db);
    const scenario = (id, operation) => check(id, 'scenario', async () => {
      await db.exec("begin; set local statement_timeout='30s'; set local lock_timeout='5s';");
      try { return await operation(f); } finally { await db.exec('rollback'); }
    });
    await creditScenarios(scenario, f, db);
    await creditPostcheckNegatives(check, db, inputs);
    await check('source_bytes_unchanged', 'identity', async () => {
      requireFact(git(['rev-parse', 'HEAD']) === source.headSha, 'source_head_changed_during_run');
      requireFact(sha256(lf(await readFile(HERE))) === source.driverLfSha256, 'driver_changed_during_run');
      for (const input of inputs.values()) requireFact(sha256(lf(await readFile(resolve(root, input.path)))) === input.lfSha256, 'sql_input_changed_during_run');
    });
  } catch (error) { failure = safeFailure(error); }
  finally { if (db) { try { await db.close(); closed = true; } catch (error) { failure ??= safeFailure(error); } } }
  const passed = results.filter(r => r.status === 'PASS').length, failed = results.filter(r => r.status === 'FAIL').length;
  const filesPassed = results.filter(r => r.kind === 'sql_file' && r.status === 'PASS').length;
  const scenariosPassed = results.filter(r => r.kind === 'scenario' && r.status === 'PASS').length;
  const negativesPassed = results.filter(r => r.kind === 'negative_control' && r.status === 'PASS').length;
  const localPassed = failure === null && closed && filesPassed === FILES.length
    && scenariosPassed === EXPECTED_SCENARIOS && negativesPassed === EXPECTED_NEGATIVES;
  emit({ type: 'summary', scope: 'LOCAL_MEMORY_ONLY', localPassed, closed, source, failure,
    checks: { completed: results.length, passed, failed }, sqlFiles: { required: FILES.length, passed: filesPassed },
    scenarios: { required: EXPECTED_SCENARIOS, passed: scenariosPassed },
    negativeControls: { required: EXPECTED_NEGATIVES, passed: negativesPassed },
    managedQualified: false, concurrencyQualified: false, productionQualified: false,
    limitations: ['PGlite/PostgreSQL 18, not managed PostgreSQL 17.', 'One connection; competing-intent checks are SEQUENTIAL, not concurrency proof.',
      'Direct local SQL is not PostgREST, pooler, Auth, browser, provider or managed-role proof.', 'Expiring-credit allocation, full-credit zero-charge orders and refund credit restoration are not enabled or qualified.',
      'All fixtures are synthetic and rolled back in a disposable memory database. No production, provider, notification or migration-history effects.'] });
  if (!localPassed) process.exitCode = 1;
}

// Scenarios are defined below and are counted explicitly: an omitted case must
// not silently reduce the success threshold.
const EXPECTED_SCENARIOS = 29;
const EXPECTED_NEGATIVES = 8;
async function creditScenarios(scenario, f, db) {
  await scenario('pending_retirement_is_scoped_to_the_same_member', async () => {
    const member = f.uuid(), other = f.uuid();
    const pending = await f.grant(member, 100, { state: 'pending' });
    await f.grant(other, 100, { state: 'approved', reversesId: pending.id });
    await f.expectBalance(member, 0, 0, 100);
    await f.expectBalance(other, 100, 0, 0);
  });

  await scenario('capture_historical_debit_mismatch_rolls_back_all_local_settlement', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member, 400);
    await f.create(o);
    await f.grant(member, -100, { actorId: o.id });
    await f.capture(o);
    await f.refused(() => f.commit(o, 2), 'P0001', 'credit_historical_debit_requires_reconciliation');
    await f.expectHeld(o);
    requireFact((await f.one('select phase from public.research_checkout_executions where id=$1', [o.executionId])).phase === 'captured', 'failed_credit_commit_lost_capture');
    requireFact((await f.one('select state from public.research_orders where id=$1', [o.id])).state === 'checkout_pending', 'failed_credit_commit_changed_order');
    requireFact((await f.one('select status from public.research_lot_reservations where reservation_id=$1', [o.reservationId])).status === 'held', 'failed_credit_commit_finalized_inventory');
    requireFact(await f.count('select count(*) as n from public.research_order_state_events where order_id=$1', [o.id]) === 0, 'failed_credit_commit_wrote_event');
    await f.expectBalance(member, 500, 400);
  });

  await scenario('reserve_exact_credit_and_duplicate_insert_is_atomic', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    const e = await f.create(o); requireFact(e.phase === 'reserved' && exactInteger(e.version) === 1, 'initial_execution_mismatch');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
    await f.refused(() => f.create(o), '23505');
    requireFact(await f.count('select count(*) as n from public.research_checkout_executions where member_id=$1', [member]) === 1, 'duplicate_execution_count');
    requireFact(await f.count('select count(*) as n from public.research_checkout_credit_reservations where member_id=$1', [member]) === 1, 'duplicate_hold_count');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
  });

  await scenario('sequential_competing_intent_refuses_overspend_not_concurrency_proof', async () => {
    const member = f.uuid(); await f.grant(member, 1000);
    const winner = await f.order(member, 700); await f.create(winner);
    const losing = await f.order(member, 400);
    await f.refused(() => f.create(losing), 'P0001', 'credit_reservation_insufficient');
    await f.expectAbsentIntent(losing); await f.expectHeld(winner); await f.expectBalance(member, 300, 700);
    const other = f.uuid(); await f.grant(other, 500); const independent = await f.order(other, 400);
    await f.create(independent); await f.expectHeld(independent); await f.expectBalance(other, 100, 400);
    await f.expectBalance(member, 300, 700);
  });

  await scenario('wrong_member_and_payment_amount_cannot_reserve', async () => {
    const member = f.uuid(), other = f.uuid(); await f.grant(member, 1000); await f.grant(other, 1000);
    const o = await f.order(member, 400);
    await f.refused(() => f.create(o, { member: other }), 'P0001', 'credit_execution_order_identity_mismatch'); await f.expectAbsentIntent(o);
    await f.refused(() => f.create(o, { amount: o.total + 1 }), 'P0001', 'credit_execution_order_identity_mismatch'); await f.expectAbsentIntent(o);
    await f.expectBalance(member, 1000, 0); await f.expectBalance(other, 1000, 0);
    await f.create(o); await f.expectHeld(o);
  });

  await scenario('capture_consumes_one_bound_debit_and_replays_are_noops', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await f.create(o); await f.capture(o);
    const stale = await f.commit(o, 1); requireFact(stale.rows.length === 0, 'stale_commit_returned_a_row');
    await f.expectHeld(o);
    const result = await f.commit(o, 2);
    requireFact(result.rows.length === 1 && result.rows[0].phase === 'committed', 'capture_did_not_commit');
    const version = exactInteger(result.rows[0].version), h = await f.hold(o);
    requireFact(h.state === 'consumed' && typeof h.debit_id === 'string' && h.settled_at !== null, 'capture_hold_not_consumed');
    const debit = await f.one('select * from public.research_store_credit_ledger where spend_order_id=$1', [o.id]);
    requireFact(debit.id === h.debit_id && debit.member_id === member && debit.actor_id === o.id
      && exactInteger(debit.amount_cents) === -400 && debit.state === 'approved' && debit.expires_at === null, 'capture_debit_binding_mismatch');
    const order = await f.one('select * from public.research_orders where id=$1', [o.id]);
    requireFact(order.state === 'payment_captured' && order.payment_reference === o.reference && exactInteger(order.captured_amount_cents) === o.total, 'captured_order_mismatch');
    requireFact(await f.count("select count(*) as n from public.research_lot_reservations where reservation_id=$1 and status='finalized'", [o.reservationId]) === 1, 'capture_inventory_not_finalized');
    requireFact(await f.count('select count(*) as n from public.research_order_state_events where order_id=$1', [o.id]) === 1, 'capture_event_count');
    const replay = await f.commit(o, version); requireFact(replay.rows.length === 1 && exactInteger(replay.rows[0].version) === version, 'capture_replay_changed_version');
    requireFact((await f.commit(o, 2)).rows.length === 0, 'old_capture_version_not_refused');
    requireFact(await f.debitCount(o) === 1, 'duplicate_capture_debit');
    requireFact(await f.count('select count(*) as n from public.research_order_state_events where order_id=$1', [o.id]) === 1, 'duplicate_capture_event');
    await f.expectBalance(member, 600, 0);
  });

  await scenario('verified_zero_capture_cancellation_releases_only_owned_hold', async () => {
    const member = f.uuid(); await f.grant(member, 1000);
    const cancelled = await f.order(member, 400), kept = await f.order(member, 300);
    await f.create(cancelled); await f.create(kept);
    await f.record(cancelled, 1, { kind: 'cancelled', providerReference: null, capturedAmountCents: 0, reason: 'customer' });
    const result = await f.cancel(cancelled, 2);
    requireFact(result.rows.length === 1 && result.rows[0].settled_at !== null, 'cancellation_not_settled');
    const h = await f.hold(cancelled);
    requireFact(h.state === 'released' && h.settled_at !== null && h.debit_id === null, 'cancelled_hold_not_released');
    requireFact(await f.debitCount(cancelled) === 0, 'cancelled_credit_debited'); await f.expectHeld(kept);
    const order = await f.one('select state from public.research_orders where id=$1', [cancelled.id]);
    requireFact(order.state === 'cancelled', 'cancelled_order_mismatch');
    requireFact(await f.count("select count(*) as n from public.research_lot_reservations where reservation_id=$1 and status='released'", [cancelled.reservationId]) === 1, 'cancelled_inventory_not_released');
    const version = exactInteger(result.rows[0].version);
    requireFact(exactInteger((await f.cancel(cancelled, version)).rows[0]?.version) === version, 'cancel_replay_changed_version');
    requireFact((await f.cancel(cancelled, 2)).rows.length === 0, 'stale_cancel_not_refused');
    requireFact(await f.count('select count(*) as n from public.research_order_state_events where order_id=$1', [cancelled.id]) === 1, 'duplicate_cancel_event');
    await f.expectBalance(member, 700, 300);
  });

  await scenario('nonzero_capture_cannot_release_credit', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await f.create(o); await f.record(o, 1, { kind: 'cancelled', providerReference: o.reference, capturedAmountCents: 1 });
    await f.refused(() => f.cancel(o, 2), 'P0001', 'zero-capture evidence');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
    requireFact((await f.one('select state from public.research_orders where id=$1', [o.id])).state === 'checkout_pending', 'bad_cancellation_changed_order');
  });

  await scenario('unknown_or_refused_provider_outcome_retains_credit_hold', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await f.create(o); const e = await f.record(o, 1, { kind: 'unknown', providerReference: o.reference });
    requireFact(e.phase === 'reconciliation_required' && e.provider_reference === o.reference, 'unknown_evidence_not_retained');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
    const rejected = await f.order(member, 400); await f.create(rejected);
    const r = await f.record(rejected, 1, { kind: 'refused', providerReference: null });
    requireFact(r.phase === 'reconciliation_required' && r.provider_reference === null, 'provider_refusal_became_success');
    await f.expectHeld(o); await f.expectHeld(rejected); await f.expectBalance(member, 200, 800);
  });

  await scenario('captured_local_failure_preserves_hold_and_has_no_partial_settlement', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member, 400, { withReservation: false });
    await f.create(o); await f.capture(o); const result = await f.commit(o, 2);
    requireFact(result.rows.length === 1 && result.rows[0].phase === 'reconciliation_required'
      && result.rows[0].local_commit_failure && result.rows[0].provider_reference === o.reference, 'failed_capture_not_parked');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
    const order = await f.one('select state,payment_reference,captured_amount_cents from public.research_orders where id=$1', [o.id]);
    requireFact(order.state === 'checkout_pending' && order.payment_reference === null && order.captured_amount_cents === null, 'failed_capture_changed_order');
    requireFact(await f.count('select count(*) as n from public.research_order_state_events where order_id=$1', [o.id]) === 0, 'failed_capture_wrote_event');
  });

  await scenario('spend_rpc_cannot_bypass_a_durable_hold', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await f.create(o);
    await f.refused(() => f.spend(member, 400, o.id), 'P0001', 'credit_checkout_hold_requires_commit');
    await f.expectHeld(o); await f.expectBalance(member, 600, 400);
  });

  await scenario('negative_adjustment_cannot_invalidate_held_credit', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member, 700);
    await f.create(o);
    const before = await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1', [member]);
    await f.refused(() => f.grant(member, -400), 'P0001', 'credit_adjustment_would_invalidate_reservations');
    requireFact(await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1', [member]) === before, 'refused_adjustment_persisted');
    await f.expectHeld(o); await f.expectBalance(member, 300, 700);
    await f.grant(member, -200); await f.expectHeld(o); await f.expectBalance(member, 100, 700);
  });

  await scenario('database_aggregate_reads_more_than_one_thousand_ledger_rows', async () => {
    const member = f.uuid();
    await db.query(`insert into public.research_store_credit_ledger (member_id,amount_cents,state,reason,actor_type,actor_id)
      select $1::uuid,1,'approved','manual_adjustment','system','local-credit-aggregate' from generate_series(1,1250)`, [member]);
    await f.grant(member, -25); await f.grant(member, 11, { state: 'pending' }); await f.grant(member, 13, { state: 'held' });
    requireFact(await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1', [member]) === 1253, 'large_ledger_fixture_count');
    await f.expectBalance(member, 1225, 0, 24);
    const o = await f.order(member); await f.create(o); await f.expectBalance(member, 825, 400, 24);
  });

  await scenario('private_rpc_privileges_and_reservation_rls_are_enforced_locally', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await f.asRole('service_role', async () => { await f.create(o); await f.expectBalance(member, 600, 400); });
    const relation = await f.one("select relrowsecurity,relforcerowsecurity from pg_class where oid='public.research_checkout_credit_reservations'::regclass");
    requireFact(relation.relrowsecurity === true && relation.relforcerowsecurity === true, 'reservation_rls_not_enabled_and_forced');
    for (const signature of SIGNATURES) {
      const privileges = await f.one('select has_function_privilege($1,$3,\'EXECUTE\') as a,has_function_privilege($2,$3,\'EXECUTE\') as b,has_function_privilege(\'service_role\',$3,\'EXECUTE\') as service', ['anon', 'authenticated', signature]);
      requireFact(privileges.a === false && privileges.b === false && privileges.service === true, 'rpc_role_privileges_mismatch');
    }
    for (const role of ['anon', 'authenticated']) {
      await f.asRole(role, async () => {
        await f.refused(() => db.query('select * from public.research_checkout_credit_reservations'), '42501');
        await f.refused(() => f.balance(member), '42501');
        await f.refused(() => f.spend(member, 400, o.id), '42501');
      });
    }
    await f.asRole('service_role', async () => {
      await f.capture(o); const committed = await f.commit(o, 2);
      requireFact(committed.rows.length === 1 && committed.rows[0].phase === 'committed', 'service_role_capture_did_not_commit');
      await f.expectBalance(member, 600, 0);
    });
    requireFact((await f.hold(o)).state === 'consumed' && await f.debitCount(o) === 1, 'service_role_capture_not_durable');
  });

  await scenario('legacy_spend_is_exact_order_idempotent_and_rejects_mismatch', async () => {
    const member = f.uuid(), other = f.uuid(); await f.grant(member, 1000); await f.grant(other, 1000);
    const o = await f.order(member);
    // The canonical legacy caller spends before its order-state update. Do not
    // accidentally qualify a narrower paid-only contract than that caller uses.
    const first = await f.spend(member, 400, o.id), replay = await f.spend(member, 400, o.id);
    requireFact(first.id === replay.id && first.member_id === member && first.spend_order_id === o.id
      && first.actor_id === o.id && first.state === 'approved' && exactInteger(first.amount_cents) === -400, 'legacy_spend_identity_mismatch');
    requireFact(await f.debitCount(o) === 1, 'legacy_spend_debited_twice');
    await f.refused(() => f.spend(member, 399, o.id), 'P0001', 'credit_spend_order_mismatch');
    await f.refused(() => f.spend(other, 400, o.id), 'P0001', 'credit_spend_order_mismatch');
    requireFact(await f.debitCount(o) === 1, 'mismatched_spend_added_debit');
    await f.expectBalance(member, 600, 0); await f.expectBalance(other, 1000, 0);
    const next = await f.order(member, 700);
    await f.refused(() => f.spend(member, 700, next.id), 'P0001', 'credit_spend_insufficient');
    requireFact(await f.debitCount(next) === 0, 'legacy_overspend_persisted'); await f.expectBalance(member, 600, 0);
  });

  await scenario('mismatched_historical_order_debit_cannot_count_as_correct_spend', async () => {
    const member = f.uuid(); await f.grant(member, 1000); const o = await f.order(member);
    await db.query("update public.research_orders set state='payment_captured',payment_reference=$2,authorized_amount_cents=total_cents,captured_amount_cents=total_cents where id=$1", [o.id, o.reference]);
    const old = await f.grant(member, -300, { actorId: o.id });
    requireFact(old.spend_order_id === null, 'historical_fixture_was_already_bound');
    await f.refused(() => f.spend(member, 400, o.id), 'P0001', 'credit_historical_debit_requires_reconciliation');
    requireFact(await f.debitCount(o) === 0, 'historical_mismatch_added_new_debit');
    const retained = await f.one('select * from public.research_store_credit_ledger where id=$1', [old.id]);
    requireFact(exactInteger(retained.amount_cents) === -300 && retained.spend_order_id === null, 'historical_debit_was_mutated');
    await f.expectBalance(member, 700, 0);
  });

  await scenario('expiring_credit_cannot_be_silently_spent_as_nonexpiring_credit', async () => {
    const member = f.uuid(); const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
    // Local historical-shaped fixture only: the runtime adapter still refuses
    // new expiring grants. SQL must preserve history yet refuse its allocation.
    await f.grant(member, 1000, { expiresAt }); await f.expectBalance(member, 1000, 0);
    const o = await f.order(member);
    await f.refused(() => f.create(o), 'P0001', 'credit_expiry_allocation_not_qualified'); await f.expectAbsentIntent(o);
    await f.refused(() => f.spend(member, 400, o.id), 'P0001', 'credit_expiry_allocation_not_qualified');
    requireFact(await f.debitCount(o) === 0, 'expiring_credit_was_debited');
    await f.expectBalance(member, 1000, 0);
    return { expiryRefusalBoundary: 'reservation', preservesHistoricalGrant: true };
  });

  await scenario('role_cleanup_preserves_original_sql_error_and_restores_role', async () => {
    const original = (await f.one('select current_user as role')).role; let observed;
    try { await f.asRole('service_role', () => db.query('select qa_deliberately_missing_credit_column')); }
    catch (error) { observed = error; }
    requireFact(sqlstate(observed) === '42703', 'role_cleanup_masked_original_sql_error');
    requireFact((await f.one('select current_user as role')).role === original, 'role_cleanup_did_not_restore_role');
    requireFact(exactInteger((await f.one('select 1 as n')).n) === 1, 'role_cleanup_left_transaction_aborted');
  });

  await scenario('unsafe_individual_ledger_rows_refuse_even_when_aggregate_is_zero', async () => {
    const member = f.uuid();
    // Seed historical-shaped rows in an order that does not bypass a trigger.
    // These are PostgreSQL-exact bigint strings, never rounded JS numbers.
    await f.grant(member, '-9007199254740992'); await f.grant(member, '9007199254740992');
    const aggregate = await f.one('select count(*) as n,sum(amount_cents)::text as net from public.research_store_credit_ledger where member_id=$1', [member]);
    requireFact(exactInteger(aggregate.n) === 2 && aggregate.net === '0', 'offsetting_unsafe_fixture_mismatch');
    await f.refused(() => f.balance(member), 'P0001', 'credit_ledger_projection_invalid');
  });

  await scenario('eight_safe_ledger_rows_refuse_an_unsafe_aggregate', async () => {
    const member = f.uuid();
    for (let i = 0; i < 8; i += 1) await f.grant(member, '9007199254740991');
    const aggregate = await f.one('select count(*) as n,sum(amount_cents)::text as net from public.research_store_credit_ledger where member_id=$1', [member]);
    requireFact(exactInteger(aggregate.n) === 8 && aggregate.net === '72057594037927928', 'unsafe_aggregate_fixture_mismatch');
    await f.refused(() => f.balance(member), 'P0001', 'credit_balance_exceeds_exact_integer_capacity');
  });

  await scenario('zero_credit_row_refuses_at_constraint_or_projection_boundary', async () => {
    const member = f.uuid(); await f.grant(member, 1);
    await db.exec('savepoint qa_zero_seed'); let rejection;
    try { await f.grant(member, 0); }
    catch (error) { rejection = error; await db.exec('rollback to savepoint qa_zero_seed'); }
    finally { await db.exec('release savepoint qa_zero_seed'); }
    if (rejection !== undefined) {
      if (sqlstate(rejection) === '23514' && typeof rejection.constraint === 'string') {
        const c = await f.one(`select pg_get_constraintdef(oid) as definition from pg_constraint
          where conrelid='public.research_store_credit_ledger'::regclass and contype='c' and conname=$1`, [rejection.constraint]);
        requireFact(typeof c.definition === 'string' && /\bamount_cents\b/.test(c.definition), 'zero_row_failed_unrelated_constraint');
      } else if (sqlstate(rejection) !== 'P0001' || !String(rejection.message).includes('credit_ledger_projection_invalid')) {
        throw new RehearsalError('zero_row_failed_unrelated_guard', sqlstate(rejection));
      }
      requireFact(await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1', [member]) === 1, 'refused_zero_row_persisted');
      await f.expectBalance(member, 1, 0); return { zeroRefusalBoundary: 'ledger_write' };
    }
    requireFact(await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1 and amount_cents=0', [member]) === 1, 'zero_fixture_missing');
    await f.refused(() => f.balance(member), 'P0001', 'credit_ledger_projection_invalid');
    return { zeroRefusalBoundary: 'projection' };
  });

  for (const [column, option] of [['created_at', 'createdAt'], ['available_at', 'availableAt'], ['expires_at', 'expiresAt']]) {
    for (const [label, timestamp] of [['positive_infinity', 'infinity'], ['negative_infinity', '-infinity']]) {
      await scenario(`ledger_${column}_${label}_projection_refuses`, async () => {
        const member = f.uuid(); await f.grant(member, 10, { [option]: timestamp });
        requireFact(await f.count(`select count(*) as n from public.research_store_credit_ledger where member_id=$1 and not isfinite(${column})`, [member]) === 1, 'nonfinite_fixture_missing');
        await f.refused(() => f.balance(member), 'P0001', 'credit_ledger_projection_invalid');
      });
    }
  }

  for (const [id, level] of [['repeatable_read', 'repeatable read'], ['serializable', 'serializable']]) {
    await scenario(`non_read_committed_${id}_refuses`, async () => {
      // Before the scenario's first snapshot-producing query. This is a local
      // isolation-mode refusal check, not a multi-connection lock/race proof.
      await db.exec(`set transaction isolation level ${level}`);
      const member = f.uuid();
      await f.refused(() => f.grant(member, 1000), 'P0001', 'credit_contract_requires_read_committed');
      await f.refused(() => f.balance(member), 'P0001', 'credit_contract_requires_read_committed');
      requireFact((await f.one("select current_setting('transaction_isolation') as level")).level === level, 'isolation_fixture_mismatch');
      requireFact(await f.count('select count(*) as n from public.research_store_credit_ledger where member_id=$1', [member]) === 0, 'refused_isolation_write_persisted');
    });
  }
}

/** Check files own their BEGIN READ ONLY/ROLLBACK; do not rewrite those bytes. */
async function expectCheckRefusal(db, input, marker) {
  let rejection;
  try { await db.exec(input.text); } catch (error) { rejection = error; }
  try { await db.exec('rollback'); }
  catch (cleanupError) { throw rejection ?? cleanupError; }
  requireFact(rejection !== undefined, 'checker_expected_refusal_not_observed');
  if (sqlstate(rejection) !== 'P0001' || !String(rejection.message).includes(marker)) {
    throw new RehearsalError('checker_unexpected_refusal_reason', sqlstate(rejection));
  }
  return { lfSha256: input.lfSha256, expectedSqlstate: 'P0001', observedSqlstate: 'P0001' };
}

async function withLocalCheckerMutation(db, mutate, restore, operation) {
  await db.exec(mutate); let originalError, detail;
  try { detail = await operation(); } catch (error) { originalError = error; }
  try { await db.exec(restore); } catch (error) { originalError ??= error; }
  if (originalError !== undefined) throw originalError;
  return detail;
}

async function creditPrecheckNegatives(check, db, inputs) {
  const input = inputs.get(`${CREDIT}.precheck.sql`);
  for (const [table, column] of [['research_store_credit_ledger', 'expires_at'], ['research_checkout_executions', 'amount_cents']]) {
    await check(`credit_precheck_missing_${table}_${column}_refuses`, 'negative_control', () => withLocalCheckerMutation(db,
      `alter table public.${table} rename column ${column} to qa_missing_${column}`,
      `alter table public.${table} rename column qa_missing_${column} to ${column}`,
      () => expectCheckRefusal(db, input, `credit_prerequisite_column_missing: ${table}.${column}`)));
  }
}

async function creditPostcheckNegatives(check, db, inputs) {
  const pre = inputs.get(`${CREDIT}.precheck.sql`), post = inputs.get(`${CREDIT}.postcheck.sql`);
  await check('credit_reinstallation_precheck_refuses', 'negative_control', () => expectCheckRefusal(db, pre, 'credit_candidate_already_or_partially_installed'));
  const mutations = [
    ['credit_disabled_rls_postcheck_refuses',
      'alter table public.research_checkout_credit_reservations disable row level security',
      'alter table public.research_checkout_credit_reservations enable row level security', 'credit_reservation_rls_missing'],
    ['credit_public_execute_postcheck_refuses',
      `grant execute on function ${SIGNATURES[0]} to public`,
      `revoke execute on function ${SIGNATURES[0]} from public`, 'credit_untrusted_execute_grant'],
    ['credit_missing_service_execute_postcheck_refuses',
      `revoke execute on function ${SIGNATURES[0]} from service_role`,
      `grant execute on function ${SIGNATURES[0]} to service_role`, 'credit_service_execute_missing'],
    ['credit_disabled_reserve_trigger_postcheck_refuses',
      'alter table public.research_checkout_executions disable trigger research_checkout_credit_reserve',
      'alter table public.research_checkout_executions enable trigger research_checkout_credit_reserve', 'credit_trigger_missing'],
  ];
  for (const [id, mutate, restore, marker] of mutations) {
    await check(id, 'negative_control', () => withLocalCheckerMutation(db, mutate, restore, () => expectCheckRefusal(db, post, marker)));
  }
  const { rows } = await db.query("select pg_get_indexdef('public.research_store_credit_ledger_spend_order_idx'::regclass) as definition");
  const originalIndex = rows[0]?.definition;
  requireFact(rows.length === 1 && typeof originalIndex === 'string' && originalIndex.startsWith('CREATE UNIQUE INDEX '), 'restorable_credit_index_missing');
  await check('credit_missing_unique_index_postcheck_refuses', 'negative_control', () => withLocalCheckerMutation(db,
    'drop index public.research_store_credit_ledger_spend_order_idx', originalIndex,
    () => expectCheckRefusal(db, post, 'credit_spend_unique_index_missing')));
  await check('credit_restored_postcheck', 'restoration', () => db.exec(post.text).then(() => undefined), { lfSha256: post.lfSha256 });
}

main().catch(error => {
  emit({ type: 'not_run', scope: 'LOCAL_MEMORY_ONLY', localPassed: false, failure: safeFailure(error) });
  process.exitCode = 2;
});
