// Actual PostgreSQL17.11 contract proof, synthetic-only. No network, managed
// URL, provider/bank authentication, real money, email or hosted mutations.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { runSettlementRaces } from './research_assisted_order_quote_provider_settlement_races.mjs';
import { ProviderSettlementHarness, migrationPath, executionMigrationPath, prefix, sourceId, adapterRevision,
  settlementPolicyRevision, scope, authority, expected, id, request, actor, actorLabel, q, j, service, json,
  statusExpr, digest } from './research_assisted_order_quote_provider_settlement_harness.mjs';

assert.equal(process.version,'v20.19.0');
const db=new ProviderSettlementHarness(),migration=await readFile(migrationPath,'utf8');
assert.ok(migration.includes('provider_settlement_authority'),'A complete candidate is required');
const started=performance.now();let groups=0,isolationCases=0;const httpReceipts=[];
const sourcePaths=[migrationPath,'server/research/assisted-order/payment/provider-settlement.ts',
  'server/research/assisted-order/payment-effects.ts','server/research/assisted-order/service.ts',
  'server/research/assisted-order/supabase-repository.ts','server/research/assisted-order/http.ts','server/index.ts',
  'server/research/assisted-order/payment/provider-journal.ts','server/research/assisted-order/payment/provider-execution.ts',
  'server/research/assisted-order/ports.ts'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,digest(await readFile(path))])));
console.log(JSON.stringify({phase:'source-start',sourceHashes,node:process.version}));
const call=expression=>service(`select ${expression}::text;`);
const pass=label=>{groups++;console.log(`SETTLEMENT_SQL PASS ${label}`);};
const runHttp=async phase=>{
  const child=await promisify(execFile)(process.execPath,['--import','tsx','supabase/verification/research_assisted_order_quote_provider_settlement_http.ts',db.containerId,phase],
    {windowsHide:true,maxBuffer:4*1024*1024,timeout:150_000});
  process.stdout.write(child.stdout);process.stderr.write(child.stderr);
  const receipts=child.stdout.split(/\r?\n/).filter(line=>line.startsWith('SETTLEMENT_HTTP_SQL COMPLETE ')).map(line=>JSON.parse(line.slice('SETTLEMENT_HTTP_SQL COMPLETE '.length)));
  assert.equal(receipts.length,1);assert.equal(receipts[0].phase,phase);assert.equal(receipts[0].node,'v20.19.0');httpReceipts.push(receipts[0]);
};
const count=table=>db.psql(`select count(*) from ${prefix}${table};`);
// Service role consumes the allowed append RPC receipt, never private tables.
// Keep append + refused settlement inside one rolled-back transaction.
const appendThenSettle=(n,event)=>service(`do $synthetic_capture$
  declare journal_receipt jsonb;
  begin
    journal_receipt:=${db.captureExpr(n,event)};
    perform ${db.settleExpr(n,{journalId:id(8,1499)}).replace(q(id(8,1499)),"(journal_receipt->>'journalId')::uuid")};
  end $synthetic_capture$;`);
async function unchangedRefusal(n,sql,...error){const before=await db.financial(n);await db.refused(sql,...error);assert.deepEqual(await db.financial(n),before);}
async function heldFact(n){
  const state=await db.financial(n);assert.equal(state.request.status,'payment_review');assert.deepEqual(state.financial,{hasObservation:false,paymentVerified:false});
  for(const key of ['observations','verifications','settlements','outbox','audit'])assert.equal(state[key],null,key);
}
function staleTransaction(level,label){
  let resolveReady,rejectReady,stdout='',stderr='';const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const child=spawn('docker',['exec','-i',db.containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{windowsHide:true});
  const timer=setTimeout(()=>child.kill(),45_000);
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes(`READY:${label}`))resolveReady();});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise((resolve,reject)=>{child.on('error',e=>{clearTimeout(timer);rejectReady(e);reject(e);});child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(stdout);else reject(Object.assign(new Error('Stale settlement refused'),{stdout,stderr,code}));});});
  ready.catch(()=>{});done.catch(()=>{});
  child.stdin.write(`\\set VERBOSITY verbose\nbegin isolation level ${level};select count(*) from ${prefix}provider_event_journal;select 'READY:${label}';\n`);
  return{ready,done,finish:sql=>child.stdin.end(`${sql}\ncommit;\n`)};
}

try{
  await db.start();await db.baseline();await db.provisionExecution();await db.candidate(1400);
  const environment=JSON.parse((await promisify(execFile)('docker',['inspect',db.containerId,'--format','{{json .}}'],{windowsHide:true})).stdout);
  assert.equal(environment.State.Running,true);assert.equal(environment.HostConfig.NetworkMode,'none');
  assert.equal(Object.keys(environment.HostConfig.PortBindings??{}).length,0);
  console.log(`SETTLEMENT_SQL ENV ${JSON.stringify({containerId:db.containerId,image:environment.Config.Image,networkMode:'none',publishedPorts:0,postgresVersion:await db.psql('show server_version;'),node:process.version})}`);
  await runHttp('legacy');
  const historical=await db.psql(`select jsonb_agg(to_jsonb(r) order by id)::text from ${prefix}requests r where id in('${request(990)}','${request(991)}');`);
  await db.psql(migration);await db.psql(migration);await db.provisionSettlement();
  assert.deepEqual(json(await db.psql(call(`${prefix}provider_settlement_authority()`))),authority);
  const effectsAuthority=json(await db.psql(call(`${prefix}payment_effects_authority()`)));
  assert.deepEqual(effectsAuthority,{schemaVersion:'research_assisted_order_payment_effects_v2',intentPolicy:'verification_atomic_canonical_outbox_admin_v2',auditPolicy:'canonical_audit_before_dispatch_v1',historicalAdoption:false});
  assert.equal(await count('provider_settlements'),'0');await heldFact(1400);
  pass('exact additive install/reapply admits only separately granted settlement and real provider-capable canonical F4 authority');

  for(const n of [1300,1301,1305,1306,1307,1308,1309,1310,1311,1312,1313,1314,1315,1316,1317,1318])await db.candidate(n);
  await db.candidate(1302,{capture:false});
  await db.setup(1303,{expiresAt:"now()+interval '2 seconds'"});await db.reserve(1303);await db.claim(1303);await db.append(1303);await db.captureAppend(1303);
  await db.setup(1304,{accept:false});
  await db.setup(1319,{accept:false});
  for(let n=1401;n<=1408;n++)await db.candidate(n);
  await db.setup(1390);await db.observe(1390);
  await db.setup(1391);await db.observe(1391);
  await db.psql(call(`${prefix}payment_correct_manual('${request(1391)}','${db.observations.get(1391)}','${actor}',
    '${db.quotes.get(1391)}','XRR-20261001-ABCDEF1391',5000,'USD','synthetic-corrected-1391','2026-01-01T00:00:00.000Z','synthetic observed correction')`));

  for(const change of [{actor:id(4,2)},{sourceId:'wrong-source'},{revision:'wrong-revision'},{policy:'wrong-policy'},
    {scope:{...scope,provider:'wrong-provider'}},{scope:{...scope,accountId:'wrong-account'}},{scope:{...scope,mode:'live'}},{scope:{...scope,extra:true}}])
    await unchangedRefusal(1301,call(db.settleExpr(1301,change)),...expected('SETTLEMENT_GRANT_REQUIRED'));
  assert.equal(await db.psql(call(db.settleExpr(1301,{requestId:request(1499)}))),'');
  assert.equal(await db.psql(call(db.settleExpr(1301,{journalId:id(8,1498)}))),'');
  await unchangedRefusal(1301,call(db.settleExpr(1301,{journalId:db.journals.get(1300).journalId})),...expected('SETTLEMENT_HELD'));
  await unchangedRefusal(1301,call(db.settleExpr(1301,{actor:null})),...expected('SETTLEMENT_CONFLICT'));
  pass('wrong actor/source/account/mode/revision/policy and cross-request journal refuse before canonical writes; only nonexistent identities return null');

  // Each mutation is a genuine normalized journal append, then attempted
  // settlement in one rolled-back transaction. No fixture silently edits facts.
  const wrongEvents=[{kind:'pending'},{kind:'authorized'},{kind:'failed'},{kind:'refunded'},{kind:'dispute_opened'},
    {observedAmountCents:4999},{observedAmountCents:5001},{currency:'EUR'},
    {claimedRequestId:request(1300)},{claimedAttemptId:db.attempts.get(1300).attemptId},{claimedQuoteId:db.quotes.get(1300)},
    {claimedQuoteVersion:2},{claimedAcceptanceId:db.acceptances.get(1300)},{claimedCanonicalOrderId:id(7,1302)},
    {providerPaymentId:'wrong-independent-payment'},{providerSessionId:'wrong-independent-session'},
    {providerSessionId:null},{adjustmentId:'synthetic-adjustment'},{occurredAt:'2026-01-01T00:00:00.000Z'},
    {occurredAt:'2099-01-01T00:00:00.000Z'}];
  for(let i=0;i<wrongEvents.length;i++){
    const event=db.capture(1302,{eventId:`synthetic-wrong-capture-${i}`,payloadSha256:digest(`wrong-capture-${i}`),...wrongEvents[i]});
    await unchangedRefusal(1302,`begin;${appendThenSettle(1302,event)}commit;`,...expected('SETTLEMENT_HELD'));
  }
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_event_journal where established_request_id='${request(1302)}';`),'0');
  pass('wrong economics, acceptance/version/request/attempt/order, payment/session/adjustment and non-capture chronology cannot become verification');

  const clean1301=await db.financial(1301);
  for(const kind of ['captured','refunded','dispute_opened','failed','unknown']){
    const extra=db.capture(1301,{eventId:`synthetic-extra-${kind}`,payloadSha256:digest(`extra-${kind}`),kind});
    await unchangedRefusal(1301,`begin;${call(db.captureExpr(1301,extra))}${call(db.settleExpr(1301))}commit;`,...expected('SETTLEMENT_HELD'));
  }
  for(const result of [db.unknown(),db.result(1301,{currency:'EUR'})])
    await unchangedRefusal(1301,`begin;${call(db.resultExpr(1301,result))}${call(db.settleExpr(1301))}commit;`,...expected('SETTLEMENT_HELD'));
  await db.waitForLease(1301);
  await unchangedRefusal(1301,`begin;${call(db.claimExpr(1301,id(6,2301)))}${call(db.settleExpr(1301))}commit;`,...expected('SETTLEMENT_HELD'));
  assert.deepEqual(await db.financial(1301),clean1301);
  pass('extra captures, adverse/global journal facts, unknown/conflicting create results and unresolved create claim remain held');

  await db.refused(call(db.reserveExpr(1304)),...expected('RESERVATION_REFUSED'));
  const newQuote=json(await db.psql(call(`${prefix}quote_issue('${request(1319)}','[{"lineId":"${id(3,1319)}"}]',now()+interval '1 day','synthetic-admin')`)));
  assert.equal(newQuote.version,2);assert.equal(newQuote.totalCents,5000);
  await unchangedRefusal(1319,call(`${prefix}quote_accept('${db.quotes.get(1319)}',1,5000,'${id(2,1319)}')`),'P0001','ASSISTED_ORDER_QUOTE_STALE');
  const newAcceptance=json(await db.psql(call(`${prefix}quote_accept('${newQuote.quoteId}',2,5000,'${id(2,1319)}')`)));
  await unchangedRefusal(1319,call(db.reserveExpr(1319,{acceptanceId:newAcceptance.acceptanceId})),...expected('RESERVATION_REFUSED'));
  await unchangedRefusal(1301,call(`${prefix}quote_issue('${request(1301)}','[{"lineId":"${id(3,1301)}"}]',now()+interval '1 day','synthetic-admin')`),'P0001');
  for(const n of [1304,990,991])await unchangedRefusal(n,call(db.settleExpr(1301,{requestId:request(n)})),...expected('SETTLEMENT_HELD'));
  await db.psql(`select pg_sleep(greatest(0,extract(epoch from ((select valid_until from ${prefix}quotes where id='${db.quotes.get(1303)}')-clock_timestamp())))+0.01);`);
  assert.equal(await db.psql(`select valid_until < clock_timestamp() from ${prefix}quotes where id='${db.quotes.get(1303)}';`),'t');
  const acceptedAfterDeadline=await db.settle(1303);assert.equal(acceptedAfterDeadline.state,'verified');
  pass('unaccepted/historical paths remain refused; already accepted exact quote remains valid after its acceptance deadline, not an invented settlement expiry');

  const beforeRollback=await db.financial(1301);
  await db.refused(`begin;${call(db.settleExpr(1301))}select 1/0;commit;`,'22012');
  assert.deepEqual(await db.financial(1301),beforeRollback);
  const receipt=await db.settle(1300);assert.equal(receipt.replayed,false);assert.equal(receipt.state,'verified');
  assert.deepEqual(Object.keys(receipt).sort(),['schemaVersion','settlementId','requestId','journalId','attemptId','sourceId','adapterRevision','policyRevision','quoteId','quoteVersion','acceptanceId','verificationId','verifiedAt','verifiedBy','state','replayed'].sort());
  const paid=await db.financial(1300);assert.equal(paid.request.status,'paid');assert.deepEqual(paid.financial,{hasObservation:true,paymentVerified:true});
  for(const key of ['observations','claims','verifications','settlements','outbox'])assert.equal(paid[key].length,1,key);
  assert.equal(paid.observations[0].method,'provider');assert.equal(paid.observations[0].observed_amount_cents,5000);
  assert.equal(paid.verifications[0].expected_amount_cents,5000);assert.equal(paid.verifications[0].observed_currency,'USD');
  assert.equal(paid.verifications[0].verified_by,actorLabel);assert.equal(paid.outbox[0].status,'held');assert.equal(paid.audit,null);
  assert.equal(paid.events.filter(e=>e.status==='paid').length,1);assert.equal(await db.psql(`select count(*) from ${prefix}evidence_claims where request_id='${request(1300)}' and method='provider';`),'1');
  assert.equal((await db.eligibility(1300)).fulfillmentEligible,true);
  assert.deepEqual(await db.settle(1300),{...receipt,replayed:true});assert.deepEqual(await db.financial(1300),paid);
  await unchangedRefusal(1301,call(db.settleExpr(1301,{journalId:receipt.journalId})),...expected('SETTLEMENT_CONFLICT'));
  pass('one accepted full capture writes canonical observation/evidence claim/verification/paid event/held outbox atomically, with immutable single-use replay');

  for(const table of ['provider_sources','provider_settlement_policies','provider_settlement_grants']){
    const repeated=json(await db.psql(`begin;update ${prefix}${table} set revoked_at=clock_timestamp() where source_id='${sourceId}';${call(db.settleExpr(1300))}rollback;`));
    assert.deepEqual(repeated,{...receipt,replayed:true});
    await unchangedRefusal(1301,`begin;update ${prefix}${table} set revoked_at=clock_timestamp() where source_id='${sourceId}';${call(db.settleExpr(1301))}commit;`,...expected('SETTLEMENT_GRANT_REQUIRED'));
  }
  await unchangedRefusal(1300,call(db.settleExpr(1300,{actor:id(4,2)})),...expected('SETTLEMENT_CONFLICT'));
  await db.psql(call(statusExpr(1300,'paid','supplier_processing',{supplierAssignmentId:'synthetic-assignment'})));
  await db.psql(call(statusExpr(1300,'supplier_processing','shipped',{trackingId:'synthetic-tracking'})));
  await db.psql(call(statusExpr(1300,'shipped','delivered')));
  assert.deepEqual(await db.settle(1300),{...receipt,replayed:true});assert.equal((await db.financial(1300)).request.status,'delivered');
  pass('exact receipt replay survives independent source/policy/grant revocation and fulfillment without granting a new actor or changing current workflow');

  // Real F4 with the mounted app: fail before commit when unavailable, release
  // only canonical audited obligations, and resume in a fresh Node process.
  await runHttp('core');await runHttp('restart');
  pass('mounted service performs actual settlement and F4 closure/restart/key rotation/concurrent completion, with synthetic admission only');

  // Existing manual verification receipt names its governed workflow result
  // "paid". The new settlement receipt separately uses "verified".
  const manual=json(await db.psql(call(db.verifyExpr(1390))));assert.equal(manual.state,'paid');
  assert.deepEqual(json(await db.psql(call(`${prefix}financial_state('${request(1390)}')`))),{hasObservation:true,paymentVerified:true});
  assert.equal((await db.eligibility(1390)).providerSettlement,false);assert.equal((await db.eligibility(1390)).fulfillmentEligible,true);
  for(const n of [1301,1300]){
    await db.refused(call(db.observeExpr(n)),...expected('UNCERTAINTY_HELD'));
    await db.refused(call(`${prefix}disposition_context('${request(n)}','${actor}','synthetic-bank-import')`),...expected('UNCERTAINTY_HELD'));
  }
  pass('manual verification remains its distinct authority; generic manual/no-funds entry cannot reuse settled or held provider lineage');

  const concurrent=await db.lockedRace(call(db.settleExpr(1305)),call(db.settleExpr(1305)));assert.equal(concurrent.replayed,true);
  assert.equal((await db.financial(1305)).verifications.length,1);
  const extraFirst=db.capture(1306,{eventId:'synthetic-race-extra-first',payloadSha256:digest('extra-first')});
  await db.lockedRace(call(db.captureExpr(1306,extraFirst)),call(db.settleExpr(1306)),expected('SETTLEMENT_HELD'));await heldFact(1306);
  const extraAfter=db.capture(1307,{eventId:'synthetic-race-extra-after',payloadSha256:digest('extra-after')});
  await db.lockedRace(call(db.settleExpr(1307)),call(db.captureExpr(1307,extraAfter)));
  assert.equal((await db.eligibility(1307)).paymentVerified,true);assert.equal((await db.eligibility(1307)).fulfillmentEligible,false);
  await db.refused(call(statusExpr(1307,'paid','supplier_processing',{supplierAssignmentId:'synthetic-held'})),...expected('FULFILLMENT_HELD'));
  pass('real request/fence lock waits serialize duplicate settlement and both capture-race orderings; late fact holds fulfillment without erasing verification');

  // A new readback is evidence too, even if it repeats the same payment ID.
  await db.settle(1308);await db.waitForLease(1308);const postClaim=await db.claim(1308,id(6,2308));
  assert.equal(postClaim.nextAction,'retrieve');await db.append(1308);
  assert.equal((await db.eligibility(1308)).paymentVerified,true);assert.equal((await db.eligibility(1308)).fulfillmentEligible,false);
  assert.equal((await db.settle(1308)).replayed,true);
  await db.refused(call(statusExpr(1308,'paid','supplier_processing',{supplierAssignmentId:'synthetic-held'})),...expected('FULFILLMENT_HELD'));
  pass('new create-claim/readback graph never silently expands the reviewed financial lineage or grants fulfillment');

  const isolationExpressions=[`${prefix}provider_settlement_authority()`,db.settleExpr(1301),db.settleExpr(1300),
    db.settleExpr(1301,{requestId:request(1499)}),`${prefix}financial_eligibility('${request(1300)}')`,`${prefix}financial_eligibility('${request(1499)}')`];
  for(const level of ['read uncommitted','repeatable read','serializable'])for(const expr of isolationExpressions){
    await db.refused(`begin isolation level ${level};${call(expr)}commit;`,...expected('TRANSACTION_ISOLATION_REQUIRED'));isolationCases++;
  }
  for(const [level,n] of [['repeatable read',1311],['serializable',1312]]){
    const tx=staleTransaction(level,`${level}-${n}`);await tx.ready;
    await db.captureAppend(n,db.capture(n,{eventId:`synthetic-later-${n}`,payloadSha256:digest(`later-${n}`)}));
    tx.finish(call(db.settleExpr(n)));let error;try{await tx.done;}catch(e){error=e;}
    db.checkError(error,...expected('TRANSACTION_ISOLATION_REQUIRED'));isolationCases++;await heldFact(n);
  }
  assert.deepEqual(json(await db.psql(`begin isolation level read committed;${call(`${prefix}provider_settlement_authority()`)}commit;`)),authority);
  pass('stale RR/SERIALIZABLE and unsupported modes refuse before missing/replay shortcuts; explicit READ COMMITTED succeeds');

  const tables=['provider_settlement_policies','provider_settlement_grants','provider_settlements'];
  for(const table of tables){
    assert.equal(await db.psql(`select relrowsecurity and relforcerowsecurity from pg_class where oid='${prefix}${table}'::regclass;`),'t');
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await db.psql(`select has_table_privilege('${role}','${prefix}${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege('${role}','${prefix}${table}','SELECT,INSERT,UPDATE,REFERENCES');`),'f');
      await db.refused(`set role ${role};select * from ${prefix}${table};`,'42501');
    }
    const assignment=table==='provider_settlement_policies'?'policy_revision=policy_revision':table==='provider_settlement_grants'?'actor_label=actor_label':'id=id';
    for(const replica of [false,true])for(const statement of [`update ${prefix}${table} set ${assignment};`,`delete from ${prefix}${table};`,`truncate ${prefix}${table} cascade;`])
      await db.refused(`begin;${replica?'set local session_replication_role=replica;':''}${statement}rollback;`,...expected('IMMUTABLE'));
  }
  const signatures=['research_assisted_order_provider_settlement_authority()',
    'research_assisted_order_provider_settlement_commit(uuid,uuid,text,text,jsonb,text,uuid)','research_assisted_order_financial_eligibility(uuid)'];
  for(const signature of signatures){assert.equal(await db.psql(`select has_function_privilege('service_role','public.${signature}','EXECUTE');`),'t');
    for(const role of ['anon','authenticated'])assert.equal(await db.psql(`select has_function_privilege('${role}','public.${signature}','EXECUTE');`),'f');}
  for(const role of ['anon','authenticated'])await db.refused(`set role ${role};select ${db.settleExpr(1301)};`,'42501');
  pass('forced RLS, table and column ACLs, exact RPC signatures, immutable owner writes and replica-mode delete/update/truncate are enforced');

  const direct=`insert into ${prefix}provider_settlements(request_id,journal_id,source_id,adapter_revision,expected_scope,policy_revision,actor_auth_user_id)
    values('${request(1301)}','${db.journals.get(1301).journalId}','${sourceId}','${adapterRevision}',${j(scope)},'${settlementPolicyRevision}','${actor}');`;
  for(const replica of [false,true]){
    await unchangedRefusal(1301,`begin;${replica?'set local session_replication_role=replica;':''}${direct}commit;`,...expected('SETTLEMENT_CONFLICT'));
    await db.refused(`begin;${replica?'set local session_replication_role=replica;':''}insert into ${prefix}provider_settlement_policies(source_id,policy_revision,capture_semantics,granted_by)
      values('${sourceId}','synthetic-invalid','single_full_capture',' padded actor ');commit;`,...expected('SETTLEMENT_GRANT_REQUIRED'));
    await db.refused(`begin;${replica?'set local session_replication_role=replica;':''}insert into ${prefix}provider_settlement_grants(source_id,auth_user_id,actor_label,granted_by)
      values('${sourceId}','${id(4,140)}',' padded actor ','synthetic-owner');commit;`,...expected('SETTLEMENT_GRANT_REQUIRED'));
  }
  pass('bare privileged settlement insert cannot commit a partial canonical graph, and replica configuration inserts retain actor constraints');

  const providerObservation=(await db.financial(1300)).observations[0].id;
  const beforeReplica=await db.snapshot();
  for(const mutation of [
    `update ${prefix}payment_observations set request_id='${request(1300)}' where id='${db.observations.get(1391)}';`,
    `update ${prefix}evidence_claims set request_id='${request(1300)}' where request_id='${request(1391)}';`,
    `update ${prefix}observation_corrections set replacement_id='${providerObservation}' where observation_id='${db.observations.get(1391)}';`
  ])await db.refused(`begin;set local session_replication_role=replica;${mutation}commit;`,'P0001','ASSISTED_ORDER_FINANCIAL_EVIDENCE_IMMUTABLE');
  await db.refused(`begin;set local session_replication_role=replica;update ${prefix}events set request_id='${request(1300)}' where request_id='${request(1391)}';commit;`,'P0001');
  await db.refused(`begin;set local session_replication_role=replica;truncate ${prefix}observation_corrections;commit;`,'P0001');
  assert.deepEqual(await db.snapshot(),beforeReplica);
  pass('replica-mode predecessor guards refuse moving unrelated observation, evidence claim, correction or timeline history into settled lineage');

  const beforeReapply=await db.snapshot();const settlements=await count('provider_settlements');await db.psql(migration);
  assert.equal(await count('provider_settlements'),settlements);assert.deepEqual(await db.snapshot(),beforeReapply);
  await db.refused(await readFile(executionMigrationPath,'utf8'),'55000');
  await db.refused(await readFile('supabase/migrations/20261001085559_research_assisted_order_quote_provider_journal.sql','utf8'),'55000');
  for(const drift of [`grant select(graph_snapshot) on ${prefix}provider_settlements to service_role;`,
    `alter table ${prefix}provider_settlements disable trigger user;`,`alter table ${prefix}provider_settlements no force row level security;`,
    `create function ${prefix}provider_settlement_authority(text) returns jsonb language sql as $extra$ select '{}'::jsonb $extra$;grant execute on function ${prefix}provider_settlement_authority(text) to service_role;`]){
    await db.refused(`begin;${drift}${call(`${prefix}provider_settlement_authority()`)}rollback;`,'55000');
    await db.refused(`begin;${drift}${call(`${prefix}financial_eligibility('${request(1300)}')`)}rollback;`,'55000');
    await db.refused(`begin;${drift}${migration}`,'55000');
  }
  pass('populated candidate reapply preserves records while old predecessor replay, column grants, disabled guards/RLS and executable overload drift refuse');

  const extraRaces=await runSettlementRaces(db);groups+=extraRaces.groups;

  // Global uncertainty is committed last. It must block both fresh settlement
  // and current fulfillment of a historically verified existing settlement.
  const unknown=db.capture(1498,{eventId:'synthetic-adp03-global',payloadSha256:digest('adp03-global'),kind:'unknown',claimedAttemptId:null});
  await db.lockedRace(call(db.captureExpr(1498,unknown)),call(db.settleExpr(1310)),expected('SETTLEMENT_HELD'));
  const eligibility=await db.eligibility(1305);assert.equal(eligibility.paymentVerified,true);assert.equal(eligibility.fulfillmentEligible,false);assert.equal(eligibility.reason,'provider_uncertainty_held');
  await db.refused(call(statusExpr(1305,'paid','supplier_processing',{supplierAssignmentId:'synthetic-global-held'})),...expected('FULFILLMENT_HELD'));
  assert.equal((await db.settle(1305)).replayed,true);await heldFact(1310);
  assert.equal(await db.psql(`select jsonb_agg(to_jsonb(r) order by id)::text from ${prefix}requests r where id in('${request(990)}','${request(991)}');`),historical);
  pass('global-unbound fence holds new settlement and postpaid progression while historical verification/replay and legacy labels remain unchanged');

  assert.equal(await readFile(migrationPath,'utf8'),migration);const finalSourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,digest(await readFile(path))])));
  assert.deepEqual(finalSourceHashes,sourceHashes,'Source bytes changed during settlement proof');
  console.log(JSON.stringify({adp03:'PASS',groups,refusals:db.refusals,lockWaitRaces:db.races,isolationCases,
    httpGroups:httpReceipts.reduce((n,r)=>n+r.groups,0),httpSqlCalls:httpReceipts.reduce((n,r)=>n+r.sqlCalls,0),httpReceipts,
    elapsedSeconds:(performance.now()-started)/1000,migrationSha256:digest(migration),sourceHashes,node:process.version,
    syntheticOnly:true,realProviderAuthenticated:false,managedStateMutated:false}));
}catch(error){console.error(error);if(error?.stderr)console.error(error.stderr);process.exitCode=1;}
finally{
  const containerId=db.containerId;await db.stop();
  if(containerId){
    let absent=false;try{await promisify(execFile)('docker',['inspect',containerId],{windowsHide:true});}
    catch(error){assert.match(error.stderr??'',/No such (?:object|container)/i);absent=true;}
    assert.equal(absent,true,'Exact disposable container still exists after removal');
    console.log(`SETTLEMENT_SQL CLEANUP ${JSON.stringify({containerId,removed:true,postRemovalInspect:'not_found'})}`);
  }
}
