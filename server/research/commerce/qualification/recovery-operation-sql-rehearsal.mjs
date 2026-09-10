/**
 * Disposable LOCAL PostgreSQL rehearsal. Never constructs a remote connection.
 *
 * Usage (no installation or repository dependency change):
 *   node server/research/commerce/qualification/recovery-operation-sql-rehearsal.mjs --runtime <absolute @electric-sql/pglite package directory>
 * Alternatively set XENIOS_PGLITE_PACKAGE_PATH to that same local directory.
 *
 * Runs the checked-in SQL bytes, not rewritten copies. All fixture mutations and
 * negative controls affect one newly created in-memory PGlite instance only.
 * This is not managed Supabase/PostgREST, provider, production, or concurrency proof.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile, realpath } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL('../../../../', import.meta.url));
const DRIVER = 'server/research/commerce/qualification/recovery-operation-sql-rehearsal.mjs';
const CHECKOUT = 'supabase/candidates/20260909150000_research_checkout_executions';
const RECOVERY = 'supabase/candidates/20260910120000_research_checkout_execution_recovery';
const OPERATION = 'supabase/candidates/20260910220129_research_checkout_recovery_operation';
const FILES = [
  'supabase/production/research-track-b-commerce.sql',
  'supabase/research-idempotency-keys.sql',
  `${CHECKOUT}.precheck.sql`, `${CHECKOUT}.sql`, `${CHECKOUT}.postcheck.sql`, `${CHECKOUT}.rehearsal.sql`,
  `${RECOVERY}.precheck.sql`, `${RECOVERY}.sql`, `${RECOVERY}.postcheck.sql`,
  `${OPERATION}.precheck.sql`, `${OPERATION}.sql`, `${OPERATION}.postcheck.sql`,
];
const SIGNATURE = 'public.research_checkout_recovery_operation(text,uuid,bigint,jsonb)';
const OWNER = '00000000-0000-4000-8000-000000009001';
const CONTROL = 'checkout_recovery_control_v1';
const OUTCOMES = 'checkout_recovery_outcome_v1';
const REQUIRED_SCENARIOS = 51;
const lf = bytes => bytes.toString('utf8').replaceAll('\r\n', '\n');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const emit = value => process.stdout.write(`${JSON.stringify(value)}\n`);

class RehearsalError extends Error {
  constructor(code, sqlstate = null) { super(code); this.code = code; this.sqlstate = sqlstate; }
}
const requireFact = (fact, code) => { if (!fact) throw new RehearsalError(code); };
const sqlstate = error => typeof error?.code === 'string' && /^[0-9A-Z]{5}$/.test(error.code) ? error.code : null;
const safeFailure = error => ({ code: error instanceof RehearsalError ? error.code
  : /^recovery_[a-z_]+$/.test(error?.message ?? '') ? error.message : 'unexpected_local_error',
  sqlstate: error instanceof RehearsalError ? error.sqlstate : sqlstate(error) });
function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 15_000 }).trim();
}
function runtimeArgument() {
  const args = process.argv.slice(2);
  if (args.length === 1 && args[0] === '--help') {
    emit({ usage: `node ${DRIVER} --runtime <absolute local @electric-sql/pglite package directory>`, environment: 'XENIOS_PGLITE_PACKAGE_PATH', scope: 'LOCAL_MEMORY_ONLY' });
    return null;
  }
  requireFact(args.length === 0 || (args.length === 2 && args[0] === '--runtime'), 'arguments_invalid');
  const selected = args.length ? args[1] : process.env.XENIOS_PGLITE_PACKAGE_PATH;
  requireFact(typeof selected === 'string' && isAbsolute(selected) && !/^[\\/]{2}/.test(selected) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(selected), 'explicit_local_runtime_directory_required');
  return selected;
}
async function localRuntime(directory) {
  const root = await realpath(directory);
  requireFact(!/^[\\/]{2}/.test(root), 'network_runtime_path_refused');
  const metadata = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  requireFact(metadata.name === '@electric-sql/pglite' && metadata.version === '0.5.8', 'runtime_identity_or_version_mismatch');
  // The exact pinned package's ESM entry points. Resolve locally; never accept a URL.
  const within = async path => {
    const actual = await realpath(resolve(root, path));
    const rel = relative(root, actual);
    requireFact(rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel), 'runtime_entry_outside_package');
    return actual;
  };
  const entry = await within('dist/index.js');
  const extension = await within('dist/contrib/pgcrypto.js');
  const [{ PGlite }, { pgcrypto }] = await Promise.all([import(pathToFileURL(entry).href), import(pathToFileURL(extension).href)]);
  requireFact(typeof PGlite === 'function' && pgcrypto, 'runtime_exports_missing');
  return { PGlite, pgcrypto, identity: { package: metadata.name, version: metadata.version, entrySha256: sha256(await readFile(entry)), pgcryptoEntrySha256: sha256(await readFile(extension)) } };
}


/** Helpers write only to the fresh in-memory database created below. */
function fixtures(db) {
  let serial = 0;
  const uuid = () => `00000000-0000-4000-8000-${(++serial).toString(16).padStart(12, '0')}`;
  const one = async (sql, params = []) => {
    const result = await db.query(sql, params);
    requireFact(result.rows.length === 1, 'expected_one_row');
    return result.rows[0];
  };
  const rpc = async (action, owner = null, fence = null, data = {}, sqlNull = false) => {
    const row = await one('select public.research_checkout_recovery_operation($1::text,$2::uuid,$3::bigint,$4::jsonb) as result',
      [action, owner, fence, sqlNull ? null : JSON.stringify(data)]);
    requireFact(row.result && typeof row.result === 'object' && !Array.isArray(row.result), 'rpc_result_shape');
    return row.result;
  };
  const seedFixture = async (options = {}) => {
    const executionId = uuid(), memberId = uuid(), orderId = uuid();
    const requestKey = `local-recovery-${serial}`;
    const stamp = await one("select to_char(date_trunc('second',clock_timestamp()-interval '1 hour')+interval '0.123456 seconds','YYYY-MM-DD\"T\"HH24:MI:SS.USOF') as at");
    const observedUpdatedAt = options.observedUpdatedAt ?? stamp.at;
    const observedPhase = options.phase ?? 'reserved';
    await db.query(`insert into public.research_orders
      (id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,checkout_idempotency_key,last_idempotency_key)
      values($1,$2,'checkout_pending',1000,0,0,1000,$3,$3)`, [orderId, memberId, requestKey]);
    await db.query(`insert into public.research_checkout_executions
      (id,member_id,order_id,request_key,request_body_sha256,phase,amount_cents,payment_method_reference,
       quote_fingerprint,authorization_key,capture_key,cancel_key,created_at,updated_at,provider_reference)
      values($1,$2,$3,$4,$5,$6,1000,'pm_local_recovery',$7,$8,$9,$10,$11,$11,$12)`,
      [executionId, memberId, orderId, requestKey, 'a'.repeat(64), observedPhase,
        `quote-${executionId}`, `auth-${executionId}`, `capture-${executionId}`, `cancel-${executionId}`,
        observedUpdatedAt, ['authorized','capturing','captured','committed'].includes(observedPhase) ? `pi_local${serial}` : null]);
    return { executionId, memberId, orderId, requestKey, observedUpdatedAt, observedPhase, decision: options.decision ?? 'settle' };
  };
  const beginInput = (fixture, intentId = uuid()) => ({ intentId, executionId: fixture.executionId,
    observedUpdatedAt: fixture.observedUpdatedAt, observedPhase: fixture.observedPhase, decision: fixture.decision });
  const financialSnapshot = async () => {
    const tables = ['research_orders', 'research_order_lines', 'research_order_state_events', 'research_store_credit_ledger',
      'research_lot_reservations', 'research_lot_reservation_allocations', 'research_checkout_executions', 'research_payment_webhook_inbox'];
    const snapshots = {};
    for (const table of tables) {
      const row = await one(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text as value from public.${table} t`);
      snapshots[table] = row.value;
    }
    return JSON.stringify(snapshots);
  };
  const metadataSnapshot = async () => (await one("select coalesce(jsonb_agg(to_jsonb(t) order by t.scope,t.key),'[]'::jsonb)::text as value from public.research_idempotency_keys t")).value;
  const refused = async (operation, state, marker) => {
    const before = await metadataSnapshot();
    await db.exec('savepoint recovery_expected_refusal');
    let caught;
    try { await operation(); } catch (error) { caught = error; }
    try { await db.exec('rollback to savepoint recovery_expected_refusal; release savepoint recovery_expected_refusal'); }
    catch (cleanup) { throw caught ?? cleanup; }
    requireFact(caught !== undefined, 'expected_refusal_not_observed');
    if (sqlstate(caught) !== state || (marker && ![].concat(marker).includes(caught.message))) {
      throw new RehearsalError('unexpected_refusal_reason', sqlstate(caught));
    }
    requireFact(await metadataSnapshot() === before, 'refused_metadata_changed');
  };
  const asRole = async (role, operation) => {
    requireFact(['anon','authenticated','service_role'].includes(role), 'local_role_invalid');
    await db.exec('savepoint recovery_role');
    try { await db.exec(`set local role ${role}`); const result=await operation();
      await db.exec('reset role; release savepoint recovery_role'); return result; }
    catch (original) { try { await db.exec('rollback to savepoint recovery_role; release savepoint recovery_role'); } catch { /* Preserve the primary SQL failure. */ } throw original; }
  };
  const writeControl = async value => db.query('update public.research_idempotency_keys set result=$1::jsonb where scope=$2 and key=$3',
    [JSON.stringify(value),CONTROL,'singleton']);
  return { uuid, one, rpc, seedFixture, beginInput, financialSnapshot, metadataSnapshot, refused, asRole, writeControl };
}

/** Optional main-owned contact proof receives this same disposable DB/fixtures. */
export async function main(contact = null) {
  const selected = runtimeArgument(); if (selected === null) return;
  requireFact(contact === null || typeof contact === 'function', 'contact_callback_invalid');
  const root = await realpath(ROOT);
  requireFact(await realpath(git(['rev-parse', '--show-toplevel'])) === root, 'repository_identity_mismatch');
  const inputs = new Map();
  for (const path of FILES) {
    const text = lf(await readFile(resolve(root, path)));
    inputs.set(path, { path, text, lfSha256: sha256(text), lfBytes: Buffer.byteLength(text) });
  }
  const source = { headSha: git(['rev-parse','HEAD']), treeSha: git(['rev-parse','HEAD^{tree}']),
    driverLfSha256: sha256(lf(await readFile(HERE))),
    relevantWorkingTreeDirty: git(['status','--porcelain','--untracked-files=normal','--',DRIVER,...FILES]) !== '',
    binding: 'Actual LF hashes identify executed bytes; HEAD/tree do not assert uncommitted SQL is committed.' };
  requireFact(/^[a-f0-9]{40}$/.test(source.headSha) && /^[a-f0-9]{40}$/.test(source.treeSha), 'source_identity_invalid');
  const runtime = await localRuntime(selected);
  emit({ type:'identity',scope:'LOCAL_MEMORY_ONLY',source,runtime:runtime.identity,
    sqlInputs:[...inputs.values()].map(({text,...identity})=>identity) });
  const results=[]; let db=null,closed=false,failure=null;
  const check=async(id,kind,operation,identity={})=>{
    try { const detail=await operation(); const result={id,kind,status:'PASS',...identity,...(detail??{})};
      results.push(result); emit({type:'check',...result}); }
    catch(error) {const result={id,kind,status:'FAIL',...identity,failure:safeFailure(error)};
      results.push(result);emit({type:'check',...result});throw error;}
  };
  try {
    db=new runtime.PGlite({extensions:{pgcrypto:runtime.pgcrypto}});
    await check('local_engine_and_roles','setup',async()=>{
      const {rows}=await db.query("select current_setting('server_version') as version,current_setting('server_version_num')::integer as version_num");
      requireFact(rows.length===1 && rows[0].version_num>=180000 && rows[0].version_num<190000,'expected_postgres_18');
      await db.exec('create role anon; create role authenticated; create role service_role bypassrls;');
      return {postgresVersion:rows[0].version,connections:1};
    });
    for(const input of inputs.values()) await check(input.path,'sql_file',()=>db.exec(input.text).then(()=>undefined),{lfSha256:input.lfSha256});
    const f=fixtures(db);
    const scenario=async(id,operation)=>{
      await check(id,'scenario',async()=>{
        await db.exec("begin; set local statement_timeout='30s'; set local lock_timeout='5s';");
        let original,detail;
        try {detail=await operation(f);}catch(error){original=error;}
        try {await db.exec('rollback');}catch(error){original??=error;}
        if(original)throw original;
        return detail;
      });
    };
    await scenario('claim_begin_complete_atomic_metadata',async()=>{
      const fixture=await f.seedFixture();
      await db.query("insert into public.research_idempotency_keys(scope,key,result) values('local_other_scope','preserve',$1::jsonb)",[JSON.stringify({preserved:true})]);
      const financialBefore=await f.financialSnapshot();
      const absent=await f.rpc('read');requireFact(absent.status==='absent','read_not_absent');
      const claimed=await f.rpc('claim',OWNER);requireFact(claimed.status==='acquired'&&claimed.state.fence==='1','claim_not_acquired');
      const input=f.beginInput(fixture);
      const begun=await f.rpc('begin',OWNER,claimed.state.fence,input);
      requireFact(begun.status==='ok'&&begun.state.pending?.intentId===input.intentId&&begun.state.after===null,'pending_not_persisted');
      requireFact(begun.state.pending.memberId===fixture.memberId&&begun.state.pending.orderId===fixture.orderId
        &&begun.state.pending.requestKey===fixture.requestKey,'canonical_identity_not_bound');
      const completed=await f.rpc('complete',OWNER,claimed.state.fence,{intentId:input.intentId,code:'left_pending'});
      requireFact(completed.status==='ok'&&completed.state.pending===null
        &&completed.state.after?.updatedAt===input.observedUpdatedAt&&completed.state.after?.executionId===fixture.executionId,'completion_cursor_not_atomic');
      const outcome=await f.one("select result from public.research_idempotency_keys where scope=$1 and key=$2",[OUTCOMES,input.intentId]);
      requireFact(outcome.result.code==='left_pending'&&outcome.result.intent.intentId===input.intentId
        &&outcome.result.cycleId===claimed.state.cycleId,'outcome_missing');
      requireFact(await f.financialSnapshot()===financialBefore,'financial_rows_mutated');
      const other=await f.one("select result from public.research_idempotency_keys where scope='local_other_scope' and key='preserve'");
      requireFact(other.result.preserved===true,'other_scope_mutated');
      return {outcomes:1,pendingCleared:true,microsecondCursorPreserved:true,financialRowsUnchanged:true};
    });
    await requiredScenarios(scenario,db,f,inputs);
    if(contact)await scenario('main_owned_engine_adapter_sql_contact',()=>contact({db,...f,source,inputs}));
    await check('tested_source_bytes_unchanged','identity',async()=>{
      requireFact(git(['rev-parse','HEAD'])===source.headSha,'head_changed');
      requireFact(sha256(lf(await readFile(HERE)))===source.driverLfSha256,'driver_changed');
      for(const input of inputs.values())requireFact(sha256(lf(await readFile(resolve(root,input.path))))===input.lfSha256,'sql_changed');
    });
  } catch(error){failure=safeFailure(error);}
  finally{if(db){try{await db.close();closed=true;}catch(error){failure??=safeFailure(error);}}}
  const passed=results.filter(r=>r.status==='PASS').length,failed=results.filter(r=>r.status==='FAIL').length;
  const filesPassed=results.filter(r=>r.kind==='sql_file'&&r.status==='PASS').length;
  const scenariosPassed=results.filter(r=>r.kind==='scenario'&&r.status==='PASS').length;
  const requiredScenariosCount=REQUIRED_SCENARIOS+(contact?1:0);
  const localPassed=failure===null&&closed&&filesPassed===FILES.length&&scenariosPassed===requiredScenariosCount
    &&new Set(results.map(result=>result.id)).size===results.length;
  emit({type:'summary',scope:'LOCAL_MEMORY_ONLY',localPassed,closed,source,checks:{passed,failed,completed:results.length},
    sqlFiles:{required:FILES.length,passed:filesPassed},scenarios:{required:requiredScenariosCount,passed:scenariosPassed},failure,
    managedQualified:false,productionQualified:false,
    limitations:['Disposable PGlite 0.5.8 / PostgreSQL 18; not managed PostgreSQL 17.',
      'One connection: no real concurrency, pooler, PostgREST, Auth or provider proof.',
      'Lease expiry is simulated by editing only disposable control fixtures; this is not multi-connection fencing proof.',
      'No remote connection, database process, notification, payment, production or migration-history effects.']});
  if(!localPassed)process.exitCode=1;
}

async function requiredScenarios(scenario,db,f,inputs) {
  const secondOwner='00000000-0000-4000-8000-000000009002';
  const claim=async()=>{const r=await f.rpc('claim',OWNER);requireFact(r.status==='acquired','claim_expected');return r.state;};
  const prepare=async(options={})=>{const fixture=await f.seedFixture(options),state=await claim(),input=f.beginInput(fixture);
    await f.rpc('begin',OWNER,state.fence,input);return {fixture,state,input};};
  const complete=(state,input,code='left_pending')=>f.rpc('complete',OWNER,state.fence,{intentId:input.intentId,code});
  await scenario('claim_same_owner_busy_release_fence',async()=>{
    const state=await claim(),before=await f.metadataSnapshot();
    requireFact(JSON.stringify((await f.rpc('claim',OWNER)).state)===JSON.stringify(state),'same_owner_changed_state');
    requireFact((await f.rpc('claim',secondOwner)).status==='busy','other_owner_not_busy');
    requireFact(await f.metadataSnapshot()===before,'busy_claim_wrote_state');
    const renewed=await f.rpc('renew',OWNER,state.fence);
    requireFact(renewed.state.fence===state.fence&&renewed.state.cycleId===state.cycleId,'renew_changed_identity');
    await f.rpc('release',OWNER,state.fence);
    const acquired=await f.rpc('claim',secondOwner);
    requireFact(acquired.state.fence==='2'&&acquired.state.cycleId===state.cycleId,'released_fence_not_incremented');
    await f.refused(()=>f.rpc('renew',OWNER,state.fence),'55000','recovery_lease_lost');
  });
  await scenario('expired_lease_preserves_pending_and_fences_old_owner',async()=>{
    const {state,input}=await prepare();
    await db.query("update public.research_idempotency_keys set result=jsonb_set(result,'{leaseUntil}',to_jsonb(clock_timestamp()-interval '1 second')) where scope=$1 and key='singleton'",[CONTROL]);
    const acquired=await f.rpc('claim',secondOwner);
    requireFact(acquired.state.fence==='2'&&acquired.state.pending.intentId===input.intentId,'expired_claim_lost_pending');
    await f.refused(()=>complete(state,input),'55000','recovery_lease_lost');
  });
  await scenario('begin_is_durable_idempotent_and_conflict_refuses',async()=>{
    const {state,input}=await prepare(),snapshot=await f.metadataSnapshot();
    requireFact((await f.rpc('read')).state.pending.intentId===input.intentId,'begin_not_durable');
    await f.rpc('begin',OWNER,state.fence,input);
    requireFact(await f.metadataSnapshot()===snapshot,'begin_replay_changed_state');
    await f.refused(()=>f.rpc('begin',OWNER,state.fence,{...input,intentId:f.uuid()}),'55000','recovery_pending_conflict');
    await f.refused(()=>f.rpc('exhaust',OWNER,state.fence),'55000','recovery_pending_conflict');
  });
  for(const [phase,code] of [['committed','settled_committed'],['cancelled','settled_cancelled']]) {
    await scenario(`pending_resume_after_${phase}`,async()=>{
      const {fixture,state,input}=await prepare();
      await db.query("update public.research_checkout_executions set phase=$1,provider_reference=$2,committed_at=case when $1='committed' then now() else null end,settled_at=case when $1='cancelled' then now() else null end where id=$3",[phase,`pi_resume${fixture.executionId.replaceAll('-','')}`,fixture.executionId]);
      const financial=await f.financialSnapshot();
      await f.rpc('release',OWNER,state.fence);const resumed=await f.rpc('claim',secondOwner);
      requireFact(resumed.state.pending.intentId===input.intentId,'restart_lost_intent');
      const result=await f.rpc('complete',secondOwner,resumed.state.fence,{intentId:input.intentId,code});
      requireFact(result.state.pending===null&&result.state.after.updatedAt===input.observedUpdatedAt,'restart_completion_failed');
      requireFact(await f.financialSnapshot()===financial,'completion_changed_financial_rows');
    });
  }
  await scenario('completion_exact_replay_and_mismatch_refusal',async()=>{
    const {state,input}=await prepare();await complete(state,input);const snapshot=await f.metadataSnapshot();
    await complete(state,input);requireFact(await f.metadataSnapshot()===snapshot,'completion_replay_mutated');
    await f.refused(()=>complete(state,input,'needs_person'),'55000',['recovery_completion_missing','recovery_completion_conflict']);
  });
  for(const [label,change] of [
    ['missing_shape',value=>({cycleId:value.cycleId,code:value.code,intent:{intentId:value.intent.intentId}})],
    ['wrong_schema',value=>({...value,schemaVersion:2})],
    ['foreign_cursor',value=>({...value,intent:{...value.intent,executionId:secondOwner}})],
    ['skip_mismatch',value=>({...value,intent:{...value.intent,decision:'skip'}})],
  ])await scenario(`malformed_outcome_${label}_refuses`,async()=>{
    const {state,input}=await prepare();await complete(state,input);
    const original=(await f.one('select result from public.research_idempotency_keys where scope=$1 and key=$2',[OUTCOMES,input.intentId])).result;
    await db.query('update public.research_idempotency_keys set result=$1::jsonb where scope=$2 and key=$3',[JSON.stringify(change(original)),OUTCOMES,input.intentId]);
    await f.refused(()=>complete(state,input),'55000',['recovery_completion_missing','recovery_completion_conflict']);
  });
  await scenario('outcome_insert_and_cursor_update_rollback_atomically',async()=>{
    const {state,input}=await prepare();
    await db.exec("create function public.qa_recovery_update_refuse() returns trigger language plpgsql as $$begin if new.scope='checkout_recovery_control_v1' then raise exception 'qa_control_update_refused'; end if; return new; end$$; create trigger qa_recovery_update_refuse before update on public.research_idempotency_keys for each row execute function public.qa_recovery_update_refuse();");
    await f.refused(()=>complete(state,input),'P0001','qa_control_update_refused');
    requireFact((await f.rpc('read')).state.pending.intentId===input.intentId,'failure_lost_pending');
    requireFact(Number((await f.one('select count(*) as n from public.research_idempotency_keys where scope=$1',[OUTCOMES])).n)===0,'failed_outcome_persisted');
    await db.exec('drop trigger qa_recovery_update_refuse on public.research_idempotency_keys; drop function public.qa_recovery_update_refuse();');
    await complete(state,input);
  });
  await scenario('completion_terminal_evidence_and_missing_execution',async()=>{
    const {fixture,state,input}=await prepare();
    for(const code of ['settled_committed','settled_cancelled','vanished'])await f.refused(()=>complete(state,input,code),'55000','recovery_completion_evidence_disagrees');
    await db.query('delete from public.research_checkout_executions where id=$1',[fixture.executionId]);
    await f.refused(()=>complete(state,input),'55000','recovery_completion_evidence_disagrees');
    await complete(state,input,'vanished');
  });
  await scenario('skip_decision_survives_release_and_cannot_settle',async()=>{
    const {state,input}=await prepare({decision:'skip'});await f.rpc('release',OWNER,state.fence);
    const resumed=await f.rpc('claim',secondOwner);requireFact(resumed.state.pending.decision==='skip','skip_lost');
    await f.refused(()=>f.rpc('complete',secondOwner,resumed.state.fence,{intentId:input.intentId,code:'left_pending'}),'55000','recovery_completion_conflict');
    await f.rpc('complete',secondOwner,resumed.state.fence,{intentId:input.intentId,code:'skipped'});
  });
  await scenario('microsecond_order_and_exact_exhaustion',async()=>{
    const first=await f.seedFixture({observedUpdatedAt:'2026-09-09T00:00:00.123456+00:00'});
    const second=await f.seedFixture({observedUpdatedAt:'2026-09-09T00:00:00.123457+00:00'});
    const state=await claim();await f.refused(()=>f.rpc('exhaust',OWNER,state.fence),'55000','recovery_not_exhausted');
    const a=f.beginInput(first);await f.rpc('begin',OWNER,state.fence,a);await complete(state,a);
    await f.refused(()=>f.rpc('begin',OWNER,state.fence,{...a,intentId:f.uuid()}),'22023','recovery_begin_position_invalid');
    await f.refused(()=>f.rpc('exhaust',OWNER,state.fence),'55000','recovery_not_exhausted');
    const b=f.beginInput(second);await f.rpc('begin',OWNER,state.fence,b);const completed=await complete(state,b);
    requireFact(completed.state.after.updatedAt===second.observedUpdatedAt,'microsecond_cursor_rounded');
    requireFact((await f.rpc('exhaust',OWNER,state.fence)).state.exhausted===true,'exhaust_not_recorded');
    await f.rpc('release',OWNER,state.fence);const next=await f.rpc('claim',OWNER);
    requireFact(next.state.cycleId!==state.cycleId&&next.state.after===null&&!next.state.exhausted,'new_cycle_not_reset');
    await f.refused(()=>f.rpc('exhaust',OWNER,next.state.fence),'55000','recovery_not_exhausted');
  });
  const malformedRequests=[
    ['null_action',null,null,null,{}],['unknown_action','unknown',null,null,{}],['array_data','read',null,null,[]],
    ['json_null_data','read',null,null,null],['sql_null_data','read',null,null,null,true],
    ['read_owner','read',OWNER,null,{}],['read_fence','read',null,'1',{}],['claim_no_owner','claim',null,null,{}],
    ['claim_with_fence','claim',OWNER,'1',{}],['claim_extra_data','claim',OWNER,null,{extra:true}],
    ['renew_no_fence','renew',OWNER,null,{}],['renew_zero_fence','renew',OWNER,'0',{}],['renew_negative_fence','renew',OWNER,'-1',{}],
  ];
  for(const [name,...args]of malformedRequests)await scenario(`request_${name}_refuses_without_writes`,()=>f.refused(()=>f.rpc(...args),'22023','recovery_request_invalid'));
  const badStates=[
    ['json_null',()=>null],['array',()=>[]],['empty',()=>({})],['missing_pending',s=>{const copy={...s};delete copy.pending;return copy;}],
    ['extra_field',s=>({...s,extra:true})],['zero_fence',s=>({...s,fence:'0'})],['numeric_fence',s=>({...s,fence:1})],
    ['overflow_fence',s=>({...s,fence:'9223372036854775808'})],['bad_cycle',s=>({...s,cycleId:'not-a-uuid'})],
    ['infinite_lease',s=>({...s,leaseUntil:'infinity'})],['invalid_lease',s=>({...s,leaseUntil:'not-a-date'})],
    ['owner_without_lease',s=>({...s,leaseUntil:null})],['non_millisecond_horizon',s=>({...s,before:'2026-09-09T00:00:00.123456Z'})],
    ['half_cursor',s=>({...s,after:{updatedAt:'2026-09-09T00:00:00.123456Z'}})],
    ['incomplete_pending',s=>({...s,pending:{intentId:OWNER}})],
  ];
  for(const [name,change]of badStates)await scenario(`state_${name}_refuses_without_overwrite`,async()=>{
    const state=await claim();await f.writeControl(change(state));
    await f.refused(()=>f.rpc('read'),'22023','recovery_state_invalid');
    await f.refused(()=>f.rpc('claim',OWNER),'22023','recovery_state_invalid');
  });
  await scenario('sql_null_control_refuses_without_overwrite',async()=>{
    await claim();await db.query('update public.research_idempotency_keys set result=null where scope=$1',[CONTROL]);
    await f.refused(()=>f.rpc('claim',OWNER),'22023','recovery_state_invalid');
  });
  await scenario('begin_malformed_request_and_future_observation_refuse',async()=>{
    const fixture=await f.seedFixture(),state=await claim(),input=f.beginInput(fixture);
    for(const invalid of [{}, {...input,decision:null}, {...input,observedPhase:'committed'}, {...input,memberId:fixture.memberId}, {...input,intentId:null}]) {
      await f.refused(()=>f.rpc('begin',OWNER,state.fence,invalid),'22023','recovery_begin_invalid');
    }
    await f.refused(()=>f.rpc('begin',OWNER,state.fence,{...input,observedUpdatedAt:state.before}),'22023','recovery_begin_position_invalid');
    await f.refused(()=>f.rpc('begin',OWNER,state.fence,{...input,executionId:f.uuid()}),'55000','recovery_execution_unavailable');
  });
  await scenario('service_role_only_actual_invocation',async()=>{
    for(const role of ['anon','authenticated'])await f.refused(()=>f.asRole(role,()=>f.rpc('claim',OWNER)),'42501');
    const granted=await f.asRole('service_role',()=>f.rpc('claim',OWNER));requireFact(granted.status==='acquired','service_role_cannot_claim');
    const visibility=await f.one("select relrowsecurity as enabled from pg_class where oid='public.research_idempotency_keys'::regclass");
    requireFact(visibility.enabled===true,'idempotency_rls_disabled');
  });
  const post=inputs.get(`${OPERATION}.postcheck.sql`),pre=inputs.get(`${OPERATION}.precheck.sql`);
  await scenario('precheck_reinstallation_refuses',()=>f.refused(()=>db.exec(pre.text),'P0001','recovery_operation_already_installed_stop'));
  for(const privilege of ['INSERT','UPDATE'])await scenario(`postcheck_missing_${privilege.toLowerCase()}_refuses`,async()=>{
    await db.exec(`revoke ${privilege} on public.research_idempotency_keys from service_role`);
    await f.refused(()=>db.exec(post.text),'P0001','recovery_operation_invoker_permissions_missing');
  });
  await scenario('postcheck_public_execute_refuses',async()=>{
    await db.exec(`grant execute on function ${SIGNATURE} to public`);
    await f.refused(()=>db.exec(post.text),'P0001','recovery_operation_function_permissions_invalid');
  });
  await scenario('postcheck_missing_rls_refuses',async()=>{
    await db.exec('alter table public.research_idempotency_keys disable row level security');
    await f.refused(()=>db.exec(post.text),'P0001','recovery_idempotency_visibility_changed');
  });
}
if(process.argv[1]&&resolve(process.argv[1])===resolve(HERE)){
  main().catch(error=>{emit({type:'not_run',scope:'LOCAL_MEMORY_ONLY',localPassed:false,failure:safeFailure(error)});process.exitCode=2;});
}
