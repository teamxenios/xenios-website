/**
 * Disposable LOCAL contact proof: actual recovery pass, strict canonical row
 * repository, payment-evidence port, executor and exact candidate SQL.
 *
 * Run with the existing rehearsal's --runtime <local PGlite package> argument.
 * No PostgREST, real provider, credentials, scheduler or notifications are used.
 * The two permitted provider methods return explicitly synthetic local evidence.
 * Adds the exact current credit precheck/migration/postcheck to the inherited
 * twelve SQL inputs. Fixtures use zero credit; this is not a full credit or
 * concurrency qualification.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './recovery-operation-sql-rehearsal.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const SELF = 'server/research/commerce/qualification/recovery-pass-contact.mjs';
const CREDIT_SQL = ['precheck.sql', 'sql', 'postcheck.sql'].map(suffix =>
  `supabase/candidates/20260910201400_research_checkout_credit_reservations.${suffix}`);
const SOURCES = [
  ...CREDIT_SQL,
  SELF,
  'server/research/commerce/qualification/recovery-operation-sql-rehearsal.mjs',
  'server/research/commerce/checkout-recovery-pass.ts',
  'server/research/commerce/checkout-recovery-operation.ts',
  'server/research/commerce/checkout-recovery-operation-contract.ts',
  'server/research/commerce/checkout-recovery-sweep.ts',
  'server/research/commerce/durable-checkout-executor.ts',
  'server/research/commerce/durable-payment-port.ts',
  'server/research/commerce/persistence/checkout-executions-store.ts',
  'server/research/commerce/persistence/checkout-recovery-operation-store.ts',
  'server/research/providers/payment.ts',
  'shared/research/durable-checkout-execution.ts',
  'shared/research/capability.ts',
  'server/supabase.ts',
];
const COLUMNS = [
  'id', 'member_id', 'request_key', 'request_body_sha256', 'order_id', 'phase', 'version',
  'provider_reference', 'amount_cents', 'currency', 'payment_method_reference', 'quote_fingerprint',
  'price_version', 'authorization_key', 'capture_key', 'cancel_key', 'reservation_ids',
  'last_provider_result', 'authorization_first_attempted_at', 'local_commit_failure',
  'created_at', 'updated_at', 'committed_at', 'settled_at',
];
const AMBIENT_STUB = 'export function getSupabaseAdmin(){throw new Error("recovery_ambient_client_refused");}\n'
  + 'export function supabaseConfigured(){throw new Error("recovery_ambient_configuration_refused");}\n';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const lfHash = bytes => hash(bytes.toString('utf8').replaceAll('\r\n', '\n'));
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);
const requireFact = (fact, code) => { if (!fact) throw new Error(`recovery_${code}`); };
const exactKeys = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
const safeCode = error => /^recovery_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'recovery_unexpected_contact_error';

async function contact({ db, one, rpc, uuid, financialSnapshot, metadataSnapshot, source }) {
  const identities = await Promise.all(SOURCES.map(async path => ({ path, lfSha256: lfHash(await readFile(resolve(ROOT, path))) })));
  // Prior rehearsal cases have each rolled back. Its callback starts an empty
  // transaction, which must end before executing these unmodified SQL files:
  // the read-only checks and migration own their BEGIN/ROLLBACK/COMMIT statements.
  requireFact(Object.values(JSON.parse(await financialSnapshot())).every(value => value === '[]')
    && await metadataSnapshot() === '[]', 'contact_setup_requires_empty_fixtures');
  await db.exec('rollback');
  for (const path of CREDIT_SQL) {
    const bytes = await readFile(resolve(ROOT, path));
    const identity = identities.find(input => input.path === path);
    requireFact(lfHash(bytes) === identity.lfSha256, 'setup_sql_source_changed');
    await db.exec(bytes.toString('utf8').replaceAll('\r\n', '\n'));
    emit({ type: 'pass_contact_sql', path, lfSha256: identity.lfSha256, status: 'PASS' });
  }
  // Restore the callback's transaction so its scenarios and the inherited final
  // rollback retain their existing lifetime. Only the disposable schema changed.
  await db.exec("begin; set local statement_timeout='30s'; set local lock_timeout='5s'");
  // The injected repository never calls its default singleton. Refuse that exact
  // unused module instead of importing ambient configuration or SDK credentials.
  // No repository, executor, operation, payment mapper or SQL is substituted.
  const compiled = await build({
    absWorkingDir: ROOT, write: false, bundle: true, platform: 'node', format: 'esm', target: 'node20', metafile: true,
    stdin: { resolveDir: ROOT, sourcefile: 'local-recovery-pass-contact-entry.ts', loader: 'ts',
      contents: 'export {createCheckoutRecoveryPass, RECOVERY_PASS_EFFECTS} from "./server/research/commerce/checkout-recovery-pass";' },
    plugins: [{ name: 'refuse-only-unused-ambient-supabase', setup(plugin) {
      plugin.onLoad({ filter: /[\\/]server[\\/]supabase\.ts$/ }, args => {
        requireFact(resolve(args.path) === resolve(ROOT, 'server/supabase.ts'), 'ambient_stub_path_mismatch');
        return { contents: AMBIENT_STUB, loader: 'ts' };
      });
    } }],
  });
  requireFact(compiled.outputFiles.length === 1, 'bundle_output_count');
  requireFact(Object.values(compiled.metafile.outputs).every(output => output.imports.every(item => item.external && ['crypto', 'node:crypto'].includes(item.path))), 'unexpected_external_import');
  const bundledSources = Object.keys(compiled.metafile.inputs).map(path => path.replaceAll('\\', '/'));
  requireFact(bundledSources.every(path => path === 'local-recovery-pass-contact-entry.ts' || SOURCES.includes(path)), 'unexpected_runtime_import');
  for (const required of ['checkout-recovery-pass.ts', 'checkout-recovery-operation.ts', 'durable-checkout-executor.ts', 'durable-payment-port.ts', 'persistence/checkout-executions-store.ts', 'persistence/checkout-recovery-operation-store.ts']) {
    requireFact(bundledSources.includes(`server/research/commerce/${required}`), 'required_real_module_absent');
  }
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  emit({ type: 'pass_contact_identity', scope: 'LOCAL_MEMORY_REAL_PASS_EXECUTOR_SQL_SYNTHETIC_PROVIDER',
    applicationHead: source.headSha, applicationTree: source.treeSha, inputs: identities,
    bundleSha256: hash(compiled.outputFiles[0].contents), ambientModule: 'server/supabase.ts',
    ambientStubSha256: hash(AMBIENT_STUB), ambientStubPurpose: 'Refuse unused credential/configuration resolver; actual injected repository unchanged.',
    sourceBinding: 'Exact input LF hashes, not HEAD alone, bind uncommitted executed source.' });

  let reads = 0, retrieves = 0, cancellations = 0, connections = 0, authorizations = 0, forbidden = 0;
  let completionFault = null, denyAuthority = false, denyAfterRead = null;
  const calls = [];
  const sqlFailures = [], rpcResults = [];
  let lastResult = null;
  const payments = new Map();
  const unexpected = () => { forbidden += 1; throw new Error('recovery_forbidden_transport'); };
  const transportSql = async operation => {
    await db.exec('savepoint pass_contact_rpc; set local role service_role');
    try {
      const data = await operation();
      await db.exec('reset role; release savepoint pass_contact_rpc');
      return { data, error: null };
    } catch (error) {
      sqlFailures.push({ operation: calls.at(-1)?.name ?? 'local_sql', action: calls.at(-1)?.action ?? null,
        sqlstate: /^[0-9A-Z]{5}$/.test(error?.code ?? '') ? error.code : null });
      await db.exec('rollback to savepoint pass_contact_rpc; release savepoint pass_contact_rpc');
      return { data: null, error: { message: 'local SQL refused', code: 'LOCAL_SQL_REFUSED' } };
    }
  };
  const rows = async (sql, values) => (await db.query(sql, values)).rows.map(row => row.row);
  const rpcSpecs = {
    research_checkout_execution_claim: { keys: ['p_execution_id', 'p_expected_version', 'p_phase'], casts: ['uuid', 'integer', 'text'] },
    research_checkout_execution_record_provider: { keys: ['p_execution_id', 'p_expected_version', 'p_result'], casts: ['uuid', 'integer', 'jsonb'] },
    research_checkout_execution_commit_captured: { keys: ['p_execution_id', 'p_expected_version', 'p_at'], casts: ['uuid', 'integer', 'timestamptz'] },
    research_checkout_execution_commit_cancelled: { keys: ['p_execution_id', 'p_expected_version', 'p_at'], casts: ['uuid', 'integer', 'timestamptz'] },
    research_checkout_executions_list_recoverable: { keys: ['p_before', 'p_limit', 'p_after_updated_at', 'p_after_id'], casts: ['timestamptz', 'integer', 'timestamptz', 'uuid'] },
  };
  // This bridge translates only the actual repository's explicitly used query
  // vocabulary into parameterized SQL. It returns raw SQL JSON, never a manually
  // manufactured CheckoutExecutionRecord or silently completed missing column.
  const client = {
    from(table) {
      if (table !== 'research_checkout_executions') return unexpected();
      return {
        insert: unexpected, update: unexpected, delete: unexpected, upsert: unexpected,
        select(columns) {
          const selected = typeof columns === 'string' ? columns.split(',').map(value => value.trim()) : [];
          requireFact(selected.length === COLUMNS.length && new Set(selected).size === COLUMNS.length && selected.every(column => COLUMNS.includes(column)), 'unexpected_execution_projection');
          return { eq(column, value) {
            requireFact(column === 'member_id' && typeof value === 'string', 'unexpected_first_filter');
            return { eq(secondColumn, secondValue) {
              requireFact(secondColumn === 'request_key' && typeof secondValue === 'string', 'unexpected_second_filter');
              return { async maybeSingle() {
                calls.push({ name: 'execution_read' }); reads += 1;
                const response = await transportSql(async () => {
                  const found = await rows(`select to_jsonb(e) as row from (select ${selected.join(',')} from public.research_checkout_executions where member_id=$1::uuid and request_key=$2::text) e`, [value, secondValue]);
                  requireFact(found.length <= 1, 'ambiguous_execution_projection');
                  return found[0] ?? null;
                });
                if (denyAfterRead === reads) denyAuthority = true;
                return response;
              } };
            } };
          } };
        },
      };
    },
    async rpc(name, args) {
      if (name === 'research_checkout_recovery_operation') {
        requireFact(exactKeys(args, ['p_action', 'p_owner', 'p_fence', 'p_data']), 'unexpected_operation_arguments');
        requireFact(['read', 'claim', 'renew', 'begin', 'complete', 'exhaust', 'release'].includes(args.p_action), 'unexpected_operation_action');
        calls.push({ name, action: args.p_action });
        const fault = args.p_action === 'complete' ? completionFault : null;
        if (fault) completionFault = null;
        if (fault === 'before') throw new Error('recovery_synthetic_completion_interruption');
        const response = await transportSql(() => rpc(args.p_action, args.p_owner, args.p_fence, args.p_data));
        if (fault === 'after' && response.error === null) throw new Error('recovery_synthetic_completion_lost_ack');
        return response;
      }
      const spec = Object.hasOwn(rpcSpecs, name) ? rpcSpecs[name] : null;
      if (!spec) return unexpected();
      requireFact(exactKeys(args, spec.keys), 'unexpected_canonical_rpc_arguments');
      calls.push({ name });
      if (name !== 'research_checkout_executions_list_recoverable') {
        const state = await controlState();
        requireFact(state?.pending?.executionId === args.p_execution_id, 'canonical_effect_before_durable_intent');
      }
      const values = spec.keys.map((key, index) => spec.casts[index] === 'jsonb' ? JSON.stringify(args[key]) : args[key]);
      const parameters = spec.casts.map((cast, index) => `$${index + 1}::${cast}`).join(',');
      const response = await transportSql(() => rows(`select to_jsonb(e) as row from public.${name}(${parameters}) e`, values));
      rpcResults.push({ name, isArray: Array.isArray(response.data), count: Array.isArray(response.data) ? response.data.length : null,
        refused: response.error !== null });
      return response;
    },
  };
  const canonicalCalls = () => calls.filter(call => Object.hasOwn(rpcSpecs, call.name) && call.name !== 'research_checkout_executions_list_recoverable').length;
  const controlState = async () => {
    const result = await db.query("select result from public.research_idempotency_keys where scope='checkout_recovery_control_v1' and key='singleton'");
    requireFact(result.rows.length <= 1, 'ambiguous_control_state');
    return result.rows[0]?.result ?? null;
  };
  const outcomeCount = async () => Number((await one("select count(*)::text as n from public.research_idempotency_keys where scope='checkout_recovery_outcome_v1'")).n);
  const resultCode = async () => (await one("select result->>'code' as code from public.research_idempotency_keys where scope='checkout_recovery_outcome_v1'")).code;
  const payment = new Proxy({
    async retrievePayment(reference) {
      retrieves += 1;
      const fixture = payments.get(reference);
      requireFact(fixture !== undefined, 'unexpected_payment_reference');
      if (fixture.behavior === 'throw') throw new Error('recovery_synthetic_provider_unavailable');
      return { ok: true, value: { providerReference: reference, status: fixture.status, amountCents: 1000,
        amountCapturableCents: fixture.status === 'authorized' ? 1000 : 0,
        amountReceivedCents: fixture.status === 'captured' ? 1000 : 0, currency: 'usd',
        memberId: fixture.memberId, orderId: fixture.orderId, clientSecret: null } };
    },
    async cancelAuthorization(reference) {
      cancellations += 1;
      const fixture = payments.get(reference);
      requireFact(fixture !== undefined && fixture.status === 'authorized', 'unexpected_cancellation');
      fixture.status = 'cancelled';
      return fixture.behavior === 'cancel_ack_lost'
        ? { ok: false, code: 'RETRYABLE', detail: 'Synthetic lost acknowledgement' }
        : { ok: true, value: undefined };
    },
  }, { get(target, key) { return Object.hasOwn(target, key) ? target[key] : unexpected(); } });
  const contextFor = (memberIds = 'all') => ({ environment: 'staging', projectRef: 'x'.repeat(20),
    applicationSha: source.headSha, approvalSha256: 'b'.repeat(64), expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    effects: [...runtime.RECOVERY_PASS_EFFECTS], memberIds });
  const pass = ({ enabled = true, context = contextFor(), mismatch = false } = {}) => runtime.createCheckoutRecoveryPass({
    enabled, context, now: () => new Date(), newId: uuid, payment,
    async authorize() { authorizations += 1; if (denyAuthority) throw new Error('recovery_synthetic_authority_revoked');
      return mismatch ? { ...context, approvalSha256: 'c'.repeat(64) } : context; },
    connect(observed) { connections += 1; requireFact(observed.projectRef === 'x'.repeat(20) && observed.applicationSha === source.headSha, 'unexpected_connection_binding'); return client; },
  });
  const seed = async ({ phase = 'reserved', attempted = false, behavior = 'normal', paymentStatus = 'authorized' } = {}) => {
    const executionId = uuid(), memberId = uuid(), orderId = uuid(), reservation = `local-reservation-${uuid()}`;
    const requestKey = `local-pass-${executionId}`;
    const at = (await one("select to_char(date_trunc('second',clock_timestamp()-interval '2 hours')+interval '0.123456 seconds','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') as at")).at;
    const reference = phase === 'authorized' ? `pi_local${executionId.replaceAll('-', '')}` : null;
    await db.query(`insert into public.research_orders(id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,checkout_idempotency_key,last_idempotency_key)
      values($1,$2,'checkout_pending',1000,0,0,1000,$3,$3)`, [orderId, memberId, requestKey]);
    await db.query(`insert into public.research_order_lines(order_id,sku,display_name,quantity,unit_price_cents,line_total_cents,fulfillment_owner)
      values($1,'LOCAL-QA','Local contact fixture',1,1000,1000,'xenios')`, [orderId]);
    await db.query(`insert into public.research_lot_reservations(reservation_id,member_id,sku,quantity,status,expires_at)
      values($1,$2,'LOCAL-QA',1,'held',clock_timestamp()+interval '1 day')`, [reservation, memberId]);
    // Fixture initialization only. All terminal phase/order/reservation changes
    // later in this proof must occur through the actual executor's SQL RPCs.
    await db.query(`insert into public.research_checkout_executions(id,member_id,order_id,request_key,request_body_sha256,phase,amount_cents,payment_method_reference,
      quote_fingerprint,authorization_key,capture_key,cancel_key,created_at,updated_at,provider_reference,reservation_ids,authorization_first_attempted_at)
      values($1,$2,$3,$4,$5,$6,1000,'pm_local_recovery',$7,$8,$9,$10,$11,$11,$12,$13::text[],$14::timestamptz)`,
      [executionId, memberId, orderId, requestKey, 'a'.repeat(64), phase, `quote-${executionId}`, `auth-${executionId}`, `capture-${executionId}`, `cancel-${executionId}`,
        at, reference, [reservation], attempted ? at : null]);
    if (reference) payments.set(reference, { memberId, orderId, status: paymentStatus, behavior });
    const observedUpdatedAt = (await one('select to_jsonb(updated_at) as at from public.research_checkout_executions where id=$1', [executionId])).at;
    requireFact(observedUpdatedAt.includes('.123456'), 'fixture_microseconds_missing');
    return { executionId, memberId, orderId, requestKey, reservation, observedUpdatedAt };
  };
  const assertTerminal = async (fixture, phase) => {
    const row = await one(`select e.phase,e.settled_at is not null as settled,e.committed_at is not null as committed,
      o.state,o.captured_amount_cents::text as captured,r.status,
      (select count(*)::text from public.research_order_state_events where order_id=o.id) as events
      from public.research_checkout_executions e join public.research_orders o on o.id=e.order_id
      join public.research_lot_reservations r on r.reservation_id=$2 where e.id=$1`, [fixture.executionId, fixture.reservation]);
    requireFact(row.phase === phase && row.events === '1', 'terminal_phase_or_event_count');
    requireFact(phase === 'committed' ? row.committed && row.state === 'payment_captured' && row.captured === '1000' && row.status === 'finalized'
      : row.settled && row.state === 'cancelled' && row.status === 'released', 'terminal_financial_state');
    requireFact((await one('select count(*)::text as n from public.research_store_credit_ledger')).n === '0', 'unexpected_credit_write');
  };
  const run = async (settings, options = {}) => {
    // The bundled source has no network imports. Also refuse an accidental
    // global fetch during a pass, rather than relying on local fixture URLs.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = unexpected;
    try {
      const result = await pass(settings).runOnce({ owner: uuid(), ...options });
      // Closed result fields only: never emit arbitrary result/provider payloads.
      lastResult = Object.fromEntries(['ok', 'status', 'code', 'releaseFailed', 'considered', 'attempted', 'recorded', 'settled', 'skipped', 'escalated', 'deferred', 'pages', 'resumed']
        .filter(key => Object.hasOwn(result, key)).map(key => [key, result[key]]));
      return result;
    }
    finally { globalThis.fetch = originalFetch; }
  };
  const assertExhausted = result => requireFact(result.ok && result.status === 'exhausted' && result.recorded === 1 && result.settled === 1, 'settlement_not_recorded');
  const passed = [];
  const scenario = async (id, execute) => {
    await db.exec('savepoint pass_contact_scenario');
    reads = 0; retrieves = 0; cancellations = 0; connections = 0; authorizations = 0; forbidden = 0;
    completionFault = null; denyAuthority = false; denyAfterRead = null; calls.length = 0; payments.clear();
    sqlFailures.length = 0; rpcResults.length = 0; lastResult = null;
    try {
      await execute(); requireFact(forbidden === 0, 'forbidden_effect_reached');
      passed.push(id); emit({ type: 'pass_contact_check', id, status: 'PASS', canonicalTransitionCalls: canonicalCalls(),
        executionReads: reads, providerFixtureReads: retrieves, providerFixtureCancellations: cancellations, forbiddenCalls: forbidden });
    } catch (error) {
      emit({ type: 'pass_contact_check', id, status: 'FAIL', code: safeCode(error), lastResult, sqlFailures, rpcResults,
        callStages: calls, executionReads: reads, providerFixtureReads: retrieves, providerFixtureCancellations: cancellations, forbiddenCalls: forbidden });
      throw error;
    }
    finally { await db.exec('rollback to savepoint pass_contact_scenario; release savepoint pass_contact_scenario'); }
  };

  await scenario('transport_refuses_unlisted_tables_mutations_and_payment_capabilities', async () => {
    const beforeMoney = await financialSnapshot(), beforeMetadata = await metadataSnapshot();
    for (const attempt of [
      () => client.from('research_notification_outbox'),
      () => client.from('research_checkout_executions').insert({}),
      () => client.from('research_checkout_executions').update({}),
      () => client.rpc('unlisted_payment_creation', {}),
      () => payment.createAuthorization,
      () => payment.captureAuthorization,
    ]) {
      let refused = false;
      try { await attempt(); } catch (error) { refused = error.message === 'recovery_forbidden_transport'; }
      requireFact(refused, 'forbidden_transport_was_available');
    }
    requireFact(forbidden === 6 && calls.length === 0 && await financialSnapshot() === beforeMoney && await metadataSnapshot() === beforeMetadata, 'forbidden_transport_mutated');
    forbidden = 0; // Six expected negative controls; positive scenarios require zero.
  });
  await scenario('disabled_before_authority_connection_or_effect', async () => {
    const result = await run({ enabled: false });
    requireFact(!result.ok && result.status === 'disabled' && authorizations === 0 && connections === 0 && calls.length === 0, 'disabled_gate_failed');
  });
  await scenario('changed_approval_refused_before_connection', async () => {
    const result = await run({ mismatch: true });
    requireFact(!result.ok && result.status === 'failed' && connections === 0 && calls.length === 0, 'approval_binding_failed');
  });
  await scenario('no_reference_actual_executor_cancels_and_releases', async () => {
    const fixture = await seed(); const result = await run(); assertExhausted(result);
    await assertTerminal(fixture, 'cancelled');
    requireFact(retrieves === 0 && cancellations === 0 && canonicalCalls() === 3 && await resultCode() === 'settled_cancelled', 'local_cancel_effect_path');
    requireFact((await controlState()).after.updatedAt === fixture.observedUpdatedAt, 'cursor_microseconds_changed');
  });
  await scenario('captured_truth_actual_executor_settles_without_capture_call', async () => {
    const fixture = await seed({ phase: 'authorized', paymentStatus: 'captured' });
    assertExhausted(await run()); await assertTerminal(fixture, 'committed');
    requireFact(retrieves === 1 && cancellations === 0 && canonicalCalls() === 2 && await resultCode() === 'settled_committed', 'captured_read_only_provider_path');
  });
  await scenario('existing_authorization_cancel_ack_loss_uses_read_truth', async () => {
    const fixture = await seed({ phase: 'authorized', behavior: 'cancel_ack_lost' });
    assertExhausted(await run()); await assertTerminal(fixture, 'cancelled');
    requireFact(retrieves === 2 && cancellations === 1 && canonicalCalls() === 3 && await resultCode() === 'settled_cancelled', 'cancel_readback_path');
  });
  await scenario('ambiguous_first_attempt_escalates_without_provider_or_financial_change', async () => {
    await seed({ phase: 'authorizing', attempted: true }); const before = await financialSnapshot();
    const result = await run();
    requireFact(result.ok && result.escalated === 1 && result.settled === 0 && result.recorded === 1 && await resultCode() === 'needs_person', 'ambiguous_attempt_not_escalated');
    requireFact(await financialSnapshot() === before && retrieves === 0 && cancellations === 0 && canonicalCalls() === 0, 'ambiguous_attempt_had_effect');
  });
  await scenario('unknown_provider_failure_retains_holds_and_records_operator_outcome', async () => {
    await seed({ phase: 'authorized', behavior: 'throw' }); const before = await financialSnapshot();
    const result = await run();
    requireFact(result.ok && result.escalated === 1 && result.recorded === 1 && await resultCode() === 'needs_person', 'unknown_provider_not_escalated');
    requireFact(await financialSnapshot() === before && retrieves === 1 && cancellations === 0 && canonicalCalls() === 0, 'unknown_provider_had_effect');
  });
  await scenario('fresh_authority_loss_before_provider_preserves_pending_and_money', async () => {
    const fixture = await seed({ phase: 'authorized' }); const before = await financialSnapshot(); denyAfterRead = 2;
    const result = await run();
    const state = await controlState();
    requireFact(!result.ok && result.status === 'failed' && result.recorded === 0
      && state?.pending?.executionId === fixture.executionId && state.pending.memberId === fixture.memberId
      && state.pending.orderId === fixture.orderId && state.pending.requestKey === fixture.requestKey
      && state.pending.observedUpdatedAt === fixture.observedUpdatedAt && state.after === null, 'fresh_gate_loss_false_success');
    requireFact(await financialSnapshot() === before && retrieves === 0 && cancellations === 0 && canonicalCalls() === 0 && await outcomeCount() === 0, 'fresh_gate_loss_had_effect');
  });
  await scenario('terminal_before_completion_loss_resumes_real_canonical_read', async () => {
    const fixture = await seed(); completionFault = 'before';
    const first = await run();
    requireFact(!first.ok && first.code === 'completion_failed' && first.recorded === 0 && await outcomeCount() === 0, 'before_completion_not_failed');
    await assertTerminal(fixture, 'cancelled');
    const pending = await controlState();
    requireFact(pending.pending?.executionId === fixture.executionId && pending.after === null, 'durable_pending_lost');
    requireFact((await rows('select to_jsonb(e) as row from public.research_checkout_executions_list_recoverable($1::timestamptz,25,null,null) e', [pending.before])).length === 0, 'terminal_discovery_not_empty');
    const effects = canonicalCalls(); const second = await run(); assertExhausted(second);
    requireFact(second.resumed === 1 && second.attempted === 0 && canonicalCalls() === effects && await outcomeCount() === 1, 'pending_resume_repeated_settlement');
    await assertTerminal(fixture, 'cancelled');
    requireFact((await controlState()).after.updatedAt === fixture.observedUpdatedAt, 'resumed_cursor_changed');
  });
  await scenario('lost_completion_ack_resumes_without_duplicate_effect_or_outcome', async () => {
    const fixture = await seed({ phase: 'authorized', paymentStatus: 'captured' }); completionFault = 'after';
    const first = await run();
    requireFact(!first.ok && first.code === 'completion_failed' && first.recorded === 0 && await outcomeCount() === 1 && (await controlState()).pending === null, 'after_completion_not_preserved');
    await assertTerminal(fixture, 'committed');
    const effects = canonicalCalls(); const second = await run();
    requireFact(second.ok && second.status === 'exhausted' && second.attempted === 0 && second.recorded === 0
      && canonicalCalls() === effects && retrieves === 1 && cancellations === 0 && await outcomeCount() === 1, 'lost_ack_duplicate_effect');
    await assertTerminal(fixture, 'committed');
  });
  await scenario('mixed_member_page_refused_whole_before_begin_or_settlement', async () => {
    const allowed = await seed(); await seed(); const before = await financialSnapshot();
    const result = await run({ context: contextFor([allowed.memberId]) });
    requireFact(!result.ok && result.code === 'discovery_failed' && result.recorded === 0 && await outcomeCount() === 0, 'mixed_page_false_success');
    requireFact(await financialSnapshot() === before && canonicalCalls() === 0 && retrieves === 0 && cancellations === 0
      && !calls.some(call => call.action === 'begin'), 'mixed_page_partially_processed');
  });
  await scenario('foreign_pending_scope_refused_before_claim_or_execution', async () => {
    await seed(); completionFault = 'before'; const first = await run();
    requireFact(!first.ok && (await controlState()).pending !== null, 'foreign_pending_setup');
    const beforeMoney = await financialSnapshot(), beforeMetadata = await metadataSnapshot(), count = calls.length, effects = canonicalCalls(), readCount = reads;
    const result = await run({ context: contextFor([uuid()]) });
    requireFact(!result.ok && result.code === 'claim_failed' && canonicalCalls() === effects && reads === readCount
      && calls.slice(count).every(call => call.action === 'read') && await financialSnapshot() === beforeMoney && await metadataSnapshot() === beforeMetadata, 'foreign_pending_scope_had_effect');
  });

  for (const input of identities) requireFact(lfHash(await readFile(resolve(ROOT, input.path))) === input.lfSha256, 'contact_source_changed');
  requireFact(passed.length === 13 && new Set(passed).size === 13, 'contact_scenario_count_mismatch');
  return { passContactChecks: passed.length, realRecoveryPass: true, realStrictExecutionRepository: true,
    realPaymentEvidenceMapper: true, realUnattendedExecutor: true, exactCanonicalSql: true, serviceRoleSql: true,
    substitutedTerminalUpdates: false, providerCreationOrCaptureAvailable: false, notificationPortAvailable: false,
    managedPostgrestUsed: false, realProviderUsed: false, creditAmountInFixtures: 0, combinedExactSqlInputs: 15,
    currentCreditReplacementApplied: true,
    limitations: 'Disposable single-connection PGlite PostgreSQL 18; synthetic provider read/cancel evidence; explicit SQL query bridge, not HTTP/SDK transport; unused ambient Supabase singleton replaced by throwing stub; zero-credit fixtures do not qualify credit consumption; no concurrency, scheduler, managed database or production qualification.' };
}

await main(contact);
