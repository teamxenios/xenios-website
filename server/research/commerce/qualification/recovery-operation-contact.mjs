/**
 * Main-owned contact proof: exact TypeScript operation + RPC adapter + actual
 * candidate SQL, in the SQL runner's disposable local database. No remote client,
 * credentials, provider, normal checkout executor, timer or notification import.
 * The terminal fixture below is explicitly a local signal, NOT payment settlement.
 */
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './recovery-operation-sql-rehearsal.mjs';

const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const INPUTS = [
  'server/research/commerce/checkout-recovery-operation.ts',
  'server/research/commerce/checkout-recovery-operation-contract.ts',
  'server/research/commerce/checkout-recovery-sweep.ts',
  'server/research/commerce/persistence/checkout-recovery-operation-store.ts',
  'server/research/commerce/qualification/recovery-operation-contact.mjs',
];
const lfHash = bytes => createHash('sha256').update(bytes.toString('utf8').replaceAll('\r\n', '\n')).digest('hex');
const emit = result => process.stdout.write(`${JSON.stringify(result)}\n`);
class ContactProofFailure extends Error {
  constructor(code) { super(code); this.code = code; }
}
const requireFact = (fact, code) => { if (!fact) throw new ContactProofFailure(code); };

async function contact({ db, seedFixture, rpc, one, uuid }) {
  const identities = await Promise.all(INPUTS.map(async path => ({ path, lfSha256: lfHash(await readFile(resolve(ROOT, path))) })));
  const compiled = await build({
    absWorkingDir: ROOT, write: false, bundle: true, platform: 'node', format: 'esm', target: 'node20', metafile: true,
    stdin: { resolveDir: ROOT, sourcefile: 'local-recovery-contact-entry.ts', loader: 'ts', contents:
      'export {createCheckoutRecoveryOperation} from "./server/research/commerce/checkout-recovery-operation";\n'
      + 'export {createSupabaseCheckoutRecoveryOperationStore} from "./server/research/commerce/persistence/checkout-recovery-operation-store";' },
  });
  requireFact(compiled.outputFiles.length === 1 && Object.values(compiled.metafile.outputs).every(output => output.imports.length === 0), 'contact_bundle_must_be_self_contained');
  requireFact(Object.keys(compiled.metafile.inputs).every(path => path === 'local-recovery-contact-entry.ts' || INPUTS.includes(path)), 'contact_unexpected_runtime_import');
  const runtime = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].contents).toString('base64')}`);
  emit({ type: 'contact_identity', scope: 'LOCAL_SQL_WITH_SYNTHETIC_EXECUTION_PORT', inputs: identities,
    bundleSha256: createHash('sha256').update(compiled.outputFiles[0].contents).digest('hex') });

  // Projection used only by this local proof. It is not a substitute for the
  // separately qualified managed execution store or an actual PostgREST journey.
  const map = row => ({
    executionId: row.id, memberId: row.member_id, orderId: row.order_id, requestKey: row.request_key,
    phase: row.phase, version: row.version, amountCents: Number(row.amount_cents), currency: row.currency,
    paymentMethodReference: row.payment_method_reference, quoteFingerprint: row.quote_fingerprint,
    providerReference: row.provider_reference, authorizationKey: row.authorization_key,
    captureKey: row.capture_key, cancelKey: row.cancel_key, reservationIds: row.reservation_ids,
    createdAt: row.created_at, updatedAt: row.updated_at, authorizationAttemptedAt: row.authorization_first_attempted_at,
    settledAt: row.settled_at, committedAt: row.committed_at, localCommitFailure: row.local_commit_failure,
    lastProviderResult: row.last_provider_result,
  });
  let settlements = 0, calls = 0;
  let failCompletion = null;
  const client = { async rpc(name, args) {
    calls += 1;
    requireFact(name === 'research_checkout_recovery_operation', 'contact_unexpected_rpc');
    const fault = args.p_action === 'complete' ? failCompletion : null;
    if (fault) failCompletion = null;
    if (fault === 'before') throw new Error('synthetic interruption before completion write');
    await db.exec('savepoint contact_rpc; set local role service_role;');
    let data;
    try { data = await rpc(args.p_action, args.p_owner, args.p_fence, args.p_data); }
    catch {
      await db.exec('rollback to savepoint contact_rpc; release savepoint contact_rpc;');
      return { data: null, error: { code: 'local_rpc_refused' } };
    }
    await db.exec('reset role; release savepoint contact_rpc;');
    if (fault === 'after') throw new Error('synthetic lost completion acknowledgement');
    return { data, error: null };
  } };
  const store = runtime.createSupabaseCheckoutRecoveryOperationStore(client);
  const executions = {
    async getForMember(memberId, key) {
      const result = await db.query('select to_jsonb(e) as row from public.research_checkout_executions e where member_id=$1 and request_key=$2', [memberId, key]);
      requireFact(result.rows.length <= 1, 'contact_ambiguous_execution');
      return result.rows.length === 0 ? null : map(result.rows[0].row);
    },
    async listRecoverable({ before, limit, after }) {
      const result = await db.query('select to_jsonb(e) as row from public.research_checkout_executions_list_recoverable($1::timestamptz,$2::integer,$3::timestamptz,$4::uuid) e',
        [before.toISOString(), limit, after?.updatedAt ?? null, after?.executionId ?? null]);
      return result.rows.map(({ row }) => map(row));
    },
  };
  const settleUnattended = async (memberId, key) => {
    settlements += 1;
    const { result: current } = await one("select result from public.research_idempotency_keys where scope='checkout_recovery_control_v1' and key='singleton'");
    requireFact(current.pending?.memberId === memberId && current.pending.requestKey === key, 'effect_before_durable_intent');
    // No actual coordinator/provider is invoked. This local fixture simulates
    // its already-terminal canonical read after an interrupted acknowledgement.
    const result = await db.query("update public.research_checkout_executions set phase='cancelled',settled_at=clock_timestamp() where member_id=$1 and request_key=$2 returning order_id", [memberId, key]);
    requireFact(result.rows.length === 1, 'contact_terminal_fixture_missing');
    return { kind: 'cancelled', orderId: result.rows[0].order_id };
  };
  const operation = enabled => runtime.createCheckoutRecoveryOperation({ enabled, store, executions, settleUnattended, now: () => new Date(), newId: uuid });
  const outcomeCount = async () => Number((await one("select count(*)::text as n from public.research_idempotency_keys where scope='checkout_recovery_outcome_v1'")).n);
  const results = [];
  const scenario = async (id, run) => {
    await db.exec('savepoint contact_scenario');
    settlements = 0; calls = 0; failCompletion = null;
    try {
      await run();
      results.push(id); emit({ type: 'contact_check', id, status: 'PASS' });
    } catch (error) {
      emit({ type: 'contact_check', id, status: 'FAIL', code: error instanceof ContactProofFailure ? error.code : 'unexpected_contact_error' });
      throw error;
    } finally { await db.exec('rollback to savepoint contact_scenario; release savepoint contact_scenario;'); }
  };
  await scenario('disabled_has_no_database_or_execution_effects', async () => {
    const result = await operation(false).run({ owner: uuid() });
    requireFact(result.status === 'disabled' && !result.ok && calls === 0 && settlements === 0, 'disabled_gate_failed');
  });
  await scenario('terminal_signal_before_completion_resumes_without_second_effect', async () => {
    const fixture = await seedFixture();
    failCompletion = 'before';
    const first = await operation(true).run({ owner: uuid() });
    requireFact(!first.ok && first.code === 'completion_failed' && first.recorded === 0 && settlements === 1, 'interrupted_result_invalid');
    const pending = await store.read();
    requireFact(pending.pending?.executionId === fixture.executionId && pending.after === null && await outcomeCount() === 0, 'pending_not_retained');
    // Bind to the actual discovery literal persisted by begin. The fixture's
    // to_char spelling ends in +00; to_jsonb legitimately emits +00:00.
    const observed = pending.pending.observedUpdatedAt;
    const second = await operation(true).run({ owner: uuid() });
    requireFact(second.ok && second.status === 'exhausted' && second.resumed === 1 && second.attempted === 0
      && second.recorded === 1 && second.settled === 1 && settlements === 1 && await outcomeCount() === 1, 'terminal_resume_failed');
    const final = await store.read();
    requireFact(final.pending === null && final.owner === null && final.exhausted
      && final.after.executionId === fixture.executionId && final.after.updatedAt === observed, 'resume_cursor_or_release_failed');
  });
  await scenario('lost_completion_response_keeps_one_outcome_and_no_repeated_effect', async () => {
    await seedFixture(); failCompletion = 'after';
    const first = await operation(true).run({ owner: uuid() });
    requireFact(!first.ok && first.code === 'completion_failed' && first.recorded === 0 && first.releaseFailed, 'lost_ack_not_visible');
    requireFact((await store.read()).pending === null && await outcomeCount() === 1, 'committed_completion_not_retained');
    const second = await operation(true).run({ owner: uuid() });
    requireFact(second.ok && second.status === 'exhausted' && second.attempted === 0 && second.recorded === 0
      && settlements === 1 && await outcomeCount() === 1, 'lost_ack_repeated_effect_or_outcome');
  });
  await scenario('skip_decision_is_durable_across_interruption', async () => {
    await seedFixture({ phase: 'action_required' }); failCompletion = 'before';
    const first = await operation(true).run({ owner: uuid() });
    requireFact(!first.ok && first.code === 'completion_failed' && settlements === 0 && (await store.read()).pending?.decision === 'skip', 'skip_not_persisted');
    const second = await operation(true).run({ owner: uuid() });
    requireFact(second.ok && second.resumed === 1 && second.skipped === 1 && second.attempted === 0
      && settlements === 0 && await outcomeCount() === 1, 'resumed_skip_became_effect');
  });
  await scenario('active_other_owner_prevents_discovery_and_effects', async () => {
    await seedFixture(); await store.claim(uuid()); calls = 0;
    const result = await operation(true).run({ owner: uuid() });
    requireFact(result.ok && result.status === 'busy' && result.pages === 0 && calls === 1 && settlements === 0, 'busy_operation_acted');
  });
  await scenario('bounded_pass_resumes_from_durable_cursor', async () => {
    await seedFixture(); await seedFixture();
    const first = await operation(true).run({ owner: uuid(), maxAttempts: 1 });
    requireFact(first.ok && first.status === 'bounded' && first.recorded === 1 && settlements === 1, 'bounded_pass_invalid');
    const second = await operation(true).run({ owner: uuid() });
    requireFact(second.ok && second.status === 'exhausted' && second.recorded === 1 && settlements === 2
      && await outcomeCount() === 2, 'bounded_cursor_replayed_or_lost_row');
  });
  for (const input of identities) requireFact(lfHash(await readFile(resolve(ROOT, input.path))) === input.lfSha256, 'contact_source_changed');
  requireFact(results.length === 6 && new Set(results).size === 6, 'contact_scenario_count_mismatch');
  return { contactChecks: results.length, exactOperationAdapterSql: true, serviceRoleRpc: true,
    realCoordinatorUsed: false, managedPostgrestUsed: false, providerUsed: false, limitations: 'Synthetic execution-read port and terminal fixture; not actual payment settlement, managed qualification or multi-session concurrency.' };
}

await main(contact);
