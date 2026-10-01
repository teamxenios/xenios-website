// Disposable PostgreSQL17.11 qualification. No managed URL, network port,
// real provider, bank transaction, email or payment activation is involved.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { ProviderExecutionHarness, migrationPath, prefix, sourceId, adapterRevision, policyRevision,
  scope, authority, expected, id, request, actor, q, j, service, json, statusExpr, digest } from './research_assisted_order_quote_provider_execution_harness.mjs';

assert.equal(process.version,'v20.19.0');
const db=new ProviderExecutionHarness(),migration=await readFile(migrationPath,'utf8');
const started=performance.now();let groups=0,isolationCases=0;
const sourcePaths=[migrationPath,'server/research/assisted-order/payment/provider-execution.ts',
  'server/research/assisted-order/http.ts','server/index.ts'];
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,digest(await readFile(path))])));
console.log(JSON.stringify({phase:'source-start',sourceHashes,node:process.version}));
const pass=label=>{groups++;console.log(`EXECUTION_SQL PASS ${label}`);};
const call=expression=>service(`select ${expression}::text;`);
const count=table=>db.psql(`select count(*) from ${prefix}${table};`);
const runHttp=async phase=>{
  const child=await promisify(execFile)(process.execPath,['--import','tsx','supabase/verification/research_assisted_order_quote_provider_execution_http.ts',db.containerId,phase],
    {windowsHide:true,maxBuffer:4*1024*1024,timeout:120_000});
  process.stdout.write(child.stdout);process.stderr.write(child.stderr);
};
const held=async n=>{
  const financial=json(await db.psql(call(`${prefix}financial_state('${request(n)}')`)));
  assert.deepEqual(financial,{hasObservation:false,paymentVerified:false});
  assert.equal(await db.psql(`select state from ${prefix}provider_attempts where request_id='${request(n)}';`),'held');
};
async function newAttempt(n,overrides={}){await db.setup(n);return db.reserve(n,overrides);}
// Keep one psql connection open: the SELECT truly freezes this transaction's
// snapshot before a different connection commits the competing journal fact.
function staleTransaction(isolation,label){
  let resolveReady,rejectReady,stdout='',stderr='';
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const child=spawn('docker',['exec','-i',db.containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{windowsHide:true});
  const timer=setTimeout(()=>child.kill(),45_000);
  child.stdout.on('data',value=>{stdout+=value;if(stdout.includes(`READY:${label}`))resolveReady();});
  child.stderr.on('data',value=>{stderr+=value;});
  const done=new Promise((resolve,reject)=>{child.on('error',e=>{clearTimeout(timer);rejectReady(e);reject(e);});
    child.on('close',code=>{clearTimeout(timer);if(code===0)resolve(stdout);else reject(Object.assign(new Error('Stale SQL transaction refused'),{stderr,stdout,code}));});});
  ready.catch(()=>{});done.catch(()=>{});
  child.stdin.write(`\\set VERBOSITY verbose\nbegin isolation level ${isolation};select count(*) from ${prefix}provider_event_journal;select 'READY:${label}';\n`);
  return{ready,done,finish:sql=>child.stdin.end(`${sql}\ncommit;\n`)};
}

try{
  await db.start();await db.baseline();
  const predecessor=json(await db.psql(call(`${prefix}provider_journal_authority()`)));
  assert.equal(predecessor.schemaVersion,'assisted_order_provider_journal_v2');
  await db.setup(1100);await runHttp('legacy');
  const financialFunctions=`select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where proname in
    ('research_assisted_order_financial_state','research_assisted_order_payment_observe','research_assisted_order_payment_verify_bound',
    'research_assisted_order_disposition_commit_cancel','research_assisted_order_payment_effects_complete');`;
  const originalFunctions=await db.psql(financialFunctions);
  await db.psql(migration);await db.psql(migration);
  assert.deepEqual(json(await db.psql(call(`${prefix}provider_execution_authority()`))),authority);
  assert.deepEqual(json(await db.psql(call(`${prefix}provider_journal_authority()`))),predecessor);
  assert.equal(await db.psql(financialFunctions),originalFunctions);
  for(const table of ['provider_create_policies','provider_execution_grants','provider_create_claims','provider_create_results','provider_identity_bindings'])assert.equal(await count(table),'0');
  pass('additive exact install/reapply, empty execution authority and retained ADP01 v2 readiness');
  await db.provision();
  for(let n=1000;n<1038;n++)if(n!==1016)await newAttempt(n);
  await db.reserve(1100);for(let n=1101;n<=1108;n++)await newAttempt(n);
  await db.provision({source:'synthetic-short-execution',configuredScope:{...scope,accountId:'synthetic-short-account'},seconds:2});
  await newAttempt(1040,{sourceId:'synthetic-short-execution',scope:{...scope,accountId:'synthetic-short-account'}});
  await db.provision({source:'synthetic-revocable-execution',configuredScope:{...scope,accountId:'synthetic-revocable-account'}});
  await newAttempt(1041,{sourceId:'synthetic-revocable-execution',scope:{...scope,accountId:'synthetic-revocable-account'}});
  for(const [n,suffix] of [[1042,'grant-only'],[1043,'policy-only']]){
    await db.provision({source:`synthetic-${suffix}`,configuredScope:{...scope,accountId:`synthetic-${suffix}-account`}});
    await newAttempt(n,{sourceId:`synthetic-${suffix}`,scope:{...scope,accountId:`synthetic-${suffix}-account`}});
  }
  const contestedScope={...scope,accountId:'synthetic-contested-account'};
  await db.provision({source:'synthetic-contested-execution',configuredScope:contestedScope,leaseMs:5000});
  await newAttempt(1016,{sourceId:'synthetic-contested-execution',scope:contestedScope});
  // One clean non-provider request proves a global journal barrier separately.
  await db.setup(1050);
  await db.setup(1051);await db.observe(1051);
  const before=await db.snapshot();

  for(const change of [{actor:id(4,2)},{policy:'not-approved'}, {revision:'wrong-revision'},
    {scope:{...scope,provider:'wrong-provider'}},{scope:{...scope,accountId:'wrong-account'}},{scope:{...scope,mode:'live'}}]){
    const detail=change.actor?'EXECUTION_GRANT_REQUIRED':change.policy?'EXECUTION_POLICY_REQUIRED':'EXECUTION_SOURCE_REQUIRED';
    await db.refused(call(db.contextExpr(1000,change)),...expected(detail));
    await db.refused(call(db.claimExpr(1000,id(6,1000),change)),...expected(detail));
  }
  assert.equal(await db.psql(call(db.contextExpr(1000,{requestId:request(1199)}))),'');
  assert.equal(await db.psql(call(db.contextExpr(1000,{attemptId:db.attempts.get(1001).attemptId}))),'');
  assert.equal(await count('provider_create_claims'),'0');
  pass('wrong actor/source/revision/account/mode/policy and cross-request context cannot claim');

  const first=await db.claim(1000);assert.equal(first.authorized,true);assert.equal(first.nextAction,'create');
  assert.equal(first.claimIssuedAt,first.creationStartedAt);assert.equal(first.dispatchBudgetMs,1000);
  assert.equal(Date.parse(first.leaseExpiresAt)-Date.parse(first.claimIssuedAt),first.dispatchBudgetMs);
  assert.equal(Date.parse(first.creationReplayUntil)-Date.parse(first.creationStartedAt),60_000);
  assert.match(first.creationKey,/^[a-f0-9]{64}$/);assert.equal(first.expectedAmountCents,5000);assert.equal(first.currency,'USD');
  const replay=await db.claim(1000);assert.equal(replay.authorized,false);assert.equal(replay.replayed,true);
  assert.equal(replay.claimIssuedAt,null);assert.equal(replay.dispatchBudgetMs,0);
  const busy=await db.claim(1000,id(6,2000));assert.equal(busy.authorized,false);assert.equal(busy.nextAction,'wait');
  assert.equal(busy.claimIssuedAt,null);assert.equal(busy.dispatchBudgetMs,0);
  assert.equal(await count('provider_create_claims'),'1');
  await db.waitForLease(1000);const recovery=await db.claim(1000,id(6,3000));assert.equal(recovery.authorized,true);
  for(const field of ['creationKey','creationStartedAt','creationReplayUntil','quoteId','quoteVersion','acceptanceId','expectedAmountCents','currency'])assert.equal(recovery[field],first[field],field);
  assert.notEqual(recovery.claimId,first.claimId);
  const bodyRows=json(await db.psql(`select jsonb_agg(jsonb_build_object('key',creation_key,'fingerprint',request_fingerprint,'started',creation_started_at,'deadline',creation_replay_until) order by sequence)::text from ${prefix}provider_create_claims where request_id='${request(1000)}';`));
  assert.deepEqual(bodyRows[0],bodyRows[1]);
  pass('duplicate claim/replay does not dispatch twice; expired lease preserves exact key/body/start/deadline');

  const result=await db.append(1000);assert.equal(result.classification,'bound');assert.equal(result.reason,'exact_binding');assert.equal(result.state,'held');
  const exactAgain=await db.append(1000);assert.deepEqual(exactAgain,{...result,replayed:true});
  assert.equal(await count('provider_create_results'),'1');
  await db.waitForLease(1000);const retrieval=await db.claim(1000,id(6,4000));assert.equal(retrieval.nextAction,'retrieve');assert.equal(retrieval.authorized,true);
  assert.equal(retrieval.providerPaymentId,'synthetic-payment-1000');assert.equal(retrieval.creationKey,first.creationKey);
  assert.equal((await db.append(1000)).classification,'bound');await held(1000);
  pass('exact response binds once; duplicate result is replay, all future dispatch is bound retrieval only');

  const unknownClaim=await db.claim(1001);assert.equal((await db.append(1001,db.unknown())).classification,'unknown');
  await db.waitForLease(1001);const retryClaim=await db.claim(1001,id(6,4001));assert.equal(retryClaim.nextAction,'create');
  assert.equal(retryClaim.creationKey,unknownClaim.creationKey);assert.equal(retryClaim.creationReplayUntil,unknownClaim.creationReplayUntil);
  const late=await db.append(1001,db.result(1001),{claimId:unknownClaim.claimId});assert.equal(late.classification,'bound');
  const conflict=await db.append(1001,db.result(1001,{providerPaymentId:'synthetic-conflicting-late'}),{claimId:unknownClaim.claimId});
  assert.equal(conflict.classification,'conflict');
  assert.equal(await db.psql(`select provider_identity from ${prefix}provider_identity_bindings where attempt_id='${db.attempts.get(1001).attemptId}' and binding_kind='payment';`),'synthetic-payment-1001');
  pass('lost result and late competing responses retained without rewriting initial identity');

  const short={sourceId:'synthetic-short-execution',scope:{...scope,accountId:'synthetic-short-account'}};
  const shortClaim=await db.claim(1040,id(6,1040),short);assert.equal(shortClaim.authorized,true);
  await db.psql(`select pg_sleep(greatest(0,extract(epoch from ('${shortClaim.creationReplayUntil}'::timestamptz-clock_timestamp())))+0.02);`);
  const expired=await db.claim(1040,id(6,2040),short);assert.equal(expired.authorized,false);assert.equal(expired.nextAction,'reconciliation_required');
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_create_claims where request_id='${request(1040)}';`),'1');
  pass('fixed creation window expires into reconciliation, never reset by new claim or process');

  const badFacts=[{observedAmountCents:4999},{currency:'EUR'},{requestId:request(1000)},{attemptId:db.attempts.get(1000).attemptId},
    {quoteId:db.quotes.get(1000)},{quoteVersion:2},{acceptanceId:db.acceptances.get(1000)},
    {provider:'wrong-provider'},{accountId:'wrong-account'},{mode:'live'}];
  for(let i=0;i<badFacts.length;i++){const n=1002+i;await db.claim(n);assert.equal((await db.append(n,db.result(n,badFacts[i]))).classification,'conflict');
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_identity_bindings where attempt_id='${db.attempts.get(n).attemptId}';`),'0');await held(n);}
  await db.claim(1012);assert.equal((await db.append(1012,db.result(1012,{providerPaymentId:'synthetic-payment-1000'}))).classification,'conflict');
  await db.claim(1013);assert.equal((await db.append(1013,db.result(1013,{providerSessionId:'synthetic-session-1000'}))).classification,'conflict');
  pass('independent quote/reference/scope/amount/currency and cross-attempt payment/session reuse refuse binding');

  await db.claim(1030);
  await db.psql(call(db.eventExpr(1030,{providerPaymentId:'synthetic-early-payment-1030',providerSessionId:'synthetic-early-session-1030'})));
  const earlyMismatch=await db.append(1030,db.result(1030,{providerPaymentId:'synthetic-early-payment-1030',providerSessionId:'synthetic-wrong-late-session'}));
  assert.equal(earlyMismatch.classification,'conflict');assert.equal(earlyMismatch.reason,'response_conflict');
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_identity_bindings where attempt_id='${db.attempts.get(1030).attemptId}';`),'0');
  await db.claim(1031);
  await db.psql(call(db.eventExpr(1032,{providerPaymentId:'synthetic-unrelated-payment',providerSessionId:'synthetic-reused-session'})));
  const crossSession=await db.append(1031,db.result(1031,{providerSessionId:'synthetic-reused-session'}));
  assert.equal(crossSession.classification,'conflict');assert.equal(crossSession.reason,'provider_identity_conflict');
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_identity_bindings where attempt_id='${db.attempts.get(1031).attemptId}';`),'0');
  pass('earlier journal session conflicts cannot be hidden by matching payment or different payment identity');

  const noSessionClaim=await db.claim(1034),noSessionResult=db.result(1034,{providerSessionId:null});
  const originalReceipt=await db.append(1034,noSessionResult);assert.equal(originalReceipt.classification,'bound');assert.equal(originalReceipt.providerSessionId,null);
  await db.waitForLease(1034);assert.equal((await db.claim(1034,id(6,2034))).nextAction,'retrieve');
  const learnedSession=await db.append(1034);assert.equal(learnedSession.classification,'bound');assert.equal(learnedSession.providerSessionId,'synthetic-session-1034');
  const originalReplay=await db.append(1034,noSessionResult,{claimId:noSessionClaim.claimId});
  assert.deepEqual(originalReplay,{...originalReceipt,replayed:true},'Result replay must retain its original immutable null-session receipt');
  pass('nullable session binds once on later retrieval without changing an earlier result receipt');

  await db.claim(1014);const claimRows=await count('provider_create_claims'),resultRows=await count('provider_create_results');
  await db.refused(`begin;${call(db.resultExpr(1014))}select 1/0;commit;`,'22012');
  assert.equal(await count('provider_create_results'),resultRows);assert.equal(await count('provider_create_claims'),claimRows);
  assert.equal((await db.append(1014)).classification,'bound');
  await db.refused(`begin;${call(db.claimExpr(1015))}select 1/0;commit;`,'22012');
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_create_claims where request_id='${request(1015)}';`),'0');
  assert.equal((await db.claim(1015)).authorized,true);
  pass('transaction interruption retains no partial claim/result/binding; retry is atomic');

  const rev={sourceId:'synthetic-revocable-execution',scope:{...scope,accountId:'synthetic-revocable-account'}};
  const issued=await db.claim(1041,id(6,1041),rev);assert.equal(issued.authorized,true);
  for(const table of ['provider_sources','provider_execution_grants','provider_create_policies'])await db.psql(`update ${prefix}${table} set revoked_at=clock_timestamp() where source_id='synthetic-revocable-execution';`);
  await db.refused(call(db.contextExpr(1041,rev)),...expected('EXECUTION_SOURCE_REQUIRED'));
  assert.equal((await db.append(1041,db.result(1041,{accountId:'synthetic-revocable-account'}),rev)).classification,'bound');
  await held(1041);pass('source/grant/policy revocation prevents new dispatch but issued late facts remain durable and held');

  for(const [n,suffix,table,detail] of [[1042,'grant-only','provider_execution_grants','EXECUTION_GRANT_REQUIRED'],
    [1043,'policy-only','provider_create_policies','EXECUTION_POLICY_REQUIRED']]){
    const configuration={sourceId:`synthetic-${suffix}`,scope:{...scope,accountId:`synthetic-${suffix}-account`}};
    const issued=await db.claim(n,id(6,n),configuration);assert.equal(issued.authorized,true);
    await db.psql(`update ${prefix}${table} set revoked_at=clock_timestamp() where source_id='synthetic-${suffix}';`);
    assert.equal(await db.psql(`select revoked_at is null from ${prefix}provider_sources where source_id='synthetic-${suffix}';`),'t');
    const otherTable=table==='provider_execution_grants'?'provider_create_policies':'provider_execution_grants';
    assert.equal(await db.psql(`select revoked_at is null from ${prefix}${otherTable} where source_id='synthetic-${suffix}';`),'t');
    await db.refused(call(db.contextExpr(n,configuration)),...expected(detail));
    await db.refused(call(db.claimExpr(n,id(6,n+1000),configuration)),...expected(detail));
    const late=await db.append(n,db.result(n,{accountId:`synthetic-${suffix}-account`}),configuration);
    assert.equal(late.classification,'bound');await held(n);
  }
  pass('grant-only and policy-only revocation independently refuse context/new claim while issued late facts survive active-source checks');

  const contestConfig={sourceId:'synthetic-contested-execution',scope:contestedScope};
  const contested=await db.lockedRace(call(db.claimExpr(1016,id(6,1016),contestConfig)),call(db.claimExpr(1016,id(6,2016),contestConfig)));
  assert.equal(contested.authorized,false);assert.equal(contested.nextAction,'wait');
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_create_claims where request_id='${request(1016)}';`),'1');
  const journalFirst=await db.lockedRace(call(db.eventExpr(1017)),call(db.claimExpr(1017)));
  assert.equal(journalFirst.authorized,false);assert.equal(journalFirst.nextAction,'reconciliation_required');
  await db.lockedRace(call(db.claimExpr(1018)),call(db.eventExpr(1018)));
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_create_claims where request_id='${request(1018)}';`),'1');
  pass('actual lock waits serialize competing claims and both claim/journal orderings without financial release');

  // All inherited consequential paths remain held even after exact binding.
  for(const n of [1000,1001,1014]){
    await db.refused(call(db.observeExpr(n)),...expected('UNCERTAINTY_HELD'));
    await db.refused(call(statusExpr(n,'payment_review','cancelled',{cancellationReason:'Synthetic cancellation'})),...expected('UNCERTAINTY_HELD'));
    await db.refused(call(`${prefix}disposition_context('${request(n)}','${actor}','synthetic-bank-import')`),...expected('UNCERTAINTY_HELD'));
    await held(n);
  }
  pass('exact provider object is not verification, no-funds, cancellation, settlement or fulfillment authority');
  await runHttp('core');await runHttp('restart');

  // Non-RC checks occur before replay and nonexistent-context early returns.
  const isolationSql=[`${prefix}provider_execution_authority()`,db.contextExpr(1000),db.contextExpr(1000,{requestId:request(1199)}),
    db.claimExpr(1000),db.claimExpr(1019),db.resultExpr(1000),db.resultExpr(1014)];
  for(const level of ['read uncommitted','repeatable read','serializable'])for(const expression of isolationSql){
    await db.refused(`begin isolation level ${level};${call(expression)}commit;`,...expected('TRANSACTION_ISOLATION_REQUIRED'));isolationCases++;
  }
  pass('unsupported transaction isolation refuses authority/context/claim/result including exact replay');
  for(const [level,n] of [['repeatable read',1020],['serializable',1021]]){
    const tx=staleTransaction(level,`${level}-${n}`);await tx.ready;
    await db.psql(call(db.eventExpr(n)));tx.finish(call(db.claimExpr(n)));
    let failure;try{await tx.done;}catch(e){failure=e;}db.checkError(failure,...expected('TRANSACTION_ISOLATION_REQUIRED'));isolationCases++;
    assert.equal(await db.psql(`select count(*) from ${prefix}provider_create_claims where request_id='${request(n)}';`),'0');
  }
  assert.deepEqual(json(await db.psql(`begin isolation level read committed;${call(`${prefix}provider_execution_authority()`)}commit;`)),authority);
  pass('actual old RR/SERIALIZABLE snapshots cannot miss newly committed provider event; RC authority remains valid');

  // Global uncertainty committed last so earlier positive controls are genuine.
  const globalEvent=db.event(1198,{claimedAttemptId:null,kind:'unknown',eventId:'synthetic-adp02-global-unknown'});
  const globalExpr=`${prefix}provider_event_append('${sourceId}','${adapterRevision}',${j(scope)},${j(globalEvent)})`;
  const globallyHeld=await db.lockedRace(call(globalExpr),call(db.claimExpr(1022)));
  assert.equal(globallyHeld.authorized,false);assert.equal(globallyHeld.nextAction,'reconciliation_required');
  await db.waitForLease(1000);const stillRetrieve=await db.claim(1000,id(6,5000));assert.equal(stillRetrieve.nextAction,'retrieve');assert.equal(stillRetrieve.authorized,true);
  assert.equal((await db.append(1000)).classification,'bound');
  await db.refused(call(db.observeExpr(1050)),...expected('UNCERTAINTY_HELD'));
  await db.refused(call(db.verifyExpr(1051)),...expected('UNCERTAINTY_HELD'));
  await db.refused(call(statusExpr(1050,'payment_review','cancelled',{cancellationReason:'Synthetic global hold'})),...expected('UNCERTAINTY_HELD'));
  assert.equal(json(await db.psql(call(`${prefix}provider_uncertainty('${request(1050)}')`))).held,true);
  pass('global unbound fence blocks new create/manual/cancel; established-object readback does not clear uncertainty');

  const tables=['provider_create_policies','provider_execution_grants','provider_create_claims','provider_create_results','provider_identity_bindings'];
  for(const table of tables){
    const flags=await db.psql(`select relrowsecurity and relforcerowsecurity from pg_class where oid='${prefix}${table}'::regclass;`);assert.equal(flags,'t');
    for(const role of ['anon','authenticated','service_role']){
      assert.equal(await db.psql(`select has_table_privilege('${role}','${prefix}${table}','SELECT,INSERT,UPDATE,DELETE,TRUNCATE') or has_any_column_privilege('${role}','${prefix}${table}','SELECT,INSERT,UPDATE,REFERENCES');`),'f');
      await db.refused(`set role ${role};select * from ${prefix}${table};`,'42501');
    }
    await db.refused(`update ${prefix}${table} set ${table==='provider_create_policies'?'policy_revision=policy_revision':table==='provider_execution_grants'?'actor_label=actor_label':table==='provider_identity_bindings'?'provider_identity=provider_identity':'id=id'};`,...expected('IMMUTABLE'));
    await db.refused(`delete from ${prefix}${table};`,...expected('IMMUTABLE'));
    await db.refused(`truncate ${prefix}${table} cascade;`,...expected('IMMUTABLE'));
  }
  for(const role of ['anon','authenticated'])for(const expr of [`${prefix}provider_execution_authority()`,db.contextExpr(1000),db.claimExpr(1000),db.resultExpr(1000)])await db.refused(`set role ${role};select ${expr};`,'42501');
  const api=['research_assisted_order_provider_execution_authority()',
    'research_assisted_order_provider_create_context(uuid,uuid,text,text,jsonb,text,uuid)',
    'research_assisted_order_provider_create_claim(uuid,uuid,text,text,jsonb,text,uuid,uuid)',
    'research_assisted_order_provider_create_result_append(uuid,text,text,jsonb,text,jsonb)'];
  for(const signature of api)assert.equal(await db.psql(`select has_function_privilege('service_role','public.${signature}','EXECUTE');`),'t');
  pass('forced RLS, exact RPC ACL and immutable update/delete/truncate restrictions');

  for(const malformed of [null,{}, {...db.unknown(),providerPaymentId:'invented'}, {...db.result(1000),observedAmountCents:0},
    {...db.result(1000),currency:'usd'}, {...db.result(1000),state:'paid'}, {...db.result(1000),raw:'forbidden'},
    {...db.result(1000),actorAuthUserId:actor}]){
    await db.refused(call(db.resultExpr(1000,malformed)),...expected('EXECUTION_RESULT_INVALID'));
  }
  await db.refused(call(db.resultExpr(1000,db.result(1000),{claimId:id(9,1199)})),...expected('EXECUTION_CLAIM_REFUSED'));
  const beforeAppendDenials=await count('provider_create_results');
  for(const change of [{sourceId:'wrong-source'},{revision:'wrong-revision'},{scope:{...scope,accountId:'wrong-account'}},{policy:'wrong-policy'}]){
    await db.refused(call(db.resultExpr(1000,db.result(1000),change)),...expected('EXECUTION_SOURCE_REQUIRED'));
  }
  assert.equal(await count('provider_create_results'),beforeAppendDenials,'Wrong issued source/policy must not write a result');
  await db.refused(`insert into ${prefix}provider_create_results(claim_id,result,classification) values('${db.claims.get(1000).claimId}',${j(db.result(1000))},'bound');`,...expected('EXECUTION_RESULT_INVALID'));
  await db.refused(`insert into ${prefix}provider_create_claims(attempt_id,request_id,source_id,actor_auth_user_id,policy_revision,claim_key,creation_key)
    values('${db.attempts.get(1023).attemptId}','${request(1023)}','${sourceId}','${actor}','${policyRevision}','${id(6,9023)}','${'a'.repeat(64)}');`,...expected('EXECUTION_CLAIM_REFUSED'));
  await db.refused(`insert into ${prefix}provider_identity_bindings(attempt_id,source_id,binding_kind,provider_identity,result_id,bound_at)
    values('${db.attempts.get(1023).attemptId}','${sourceId}','payment','invented','${result.resultId}',clock_timestamp());`,...expected('EXECUTION_RESULT_INVALID'));
  pass('malformed and privileged direct-write inputs cannot choose claim facts, result classification or identity binding');

  // ALWAYS means the same owner-level trigger boundary also applies when a
  // privileged importer sets replica mode. These are real writes in rolled-
  // back transactions, not an inference from pg_trigger.tgenabled alone.
  const replica=sql=>`begin;set local session_replication_role=replica;${sql}rollback;`;
  const replicaInserts=[
    [`insert into ${prefix}provider_create_policies(source_id,policy_revision,replay_guarantee,create_replay_seconds,lease_ms,granted_by)
      values('${sourceId}','invalid-owner-proof','same_key_same_body',60,1000,' padded actor ');`,'EXECUTION_GRANT_REQUIRED'],
    [`insert into ${prefix}provider_execution_grants(source_id,auth_user_id,actor_label,granted_by)
      values('${sourceId}','${id(4,96)}',' padded actor ','synthetic-owner');`,'EXECUTION_GRANT_REQUIRED'],
    [`insert into ${prefix}provider_create_claims(attempt_id,request_id,source_id,actor_auth_user_id,policy_revision,claim_key,creation_key)
      values('${db.attempts.get(1024).attemptId}','${request(1024)}','${sourceId}','${actor}','${policyRevision}','${id(6,9024)}','${'b'.repeat(64)}');`,'EXECUTION_CLAIM_REFUSED'],
    [`insert into ${prefix}provider_create_results(claim_id,result,classification)
      values('${db.claims.get(1000).claimId}',${j(db.result(1000))},'bound');`,'EXECUTION_RESULT_INVALID'],
    [`insert into ${prefix}provider_identity_bindings(attempt_id,source_id,binding_kind,provider_identity,result_id,bound_at)
      values('${db.attempts.get(1024).attemptId}','${sourceId}','payment','invented-replica','${result.resultId}',clock_timestamp());`,'EXECUTION_RESULT_INVALID'],
  ];
  for(const [sql,detail] of replicaInserts)await db.refused(replica(sql),...expected(detail));
  for(const table of tables){
    const assignment=table==='provider_create_policies'?'policy_revision=policy_revision':table==='provider_execution_grants'
      ?'actor_label=actor_label':table==='provider_identity_bindings'?'provider_identity=provider_identity':'id=id';
    await db.refused(replica(`update ${prefix}${table} set ${assignment};`),...expected('IMMUTABLE'));
    await db.refused(replica(`delete from ${prefix}${table};`),...expected('IMMUTABLE'));
    await db.refused(replica(`truncate ${prefix}${table} cascade;`),...expected('IMMUTABLE'));
  }
  pass('actual privileged replica INSERT/update/delete/truncate still enforce all new ALWAYS trigger boundaries');

  const persisted=await count('provider_create_results');await db.psql(migration);assert.equal(await count('provider_create_results'),persisted);
  assert.deepEqual(json(await db.psql(call(`${prefix}provider_execution_authority()`))),authority);
  for(const drift of [
    `grant select(result) on ${prefix}provider_create_results to service_role;`,
    `alter table ${prefix}provider_create_claims disable trigger user;`,
    `alter table ${prefix}payment_observations disable trigger hl12_provider_observation_hold;`,
    `alter table ${prefix}provider_identity_bindings no force row level security;`,
    `create function ${prefix}provider_execution_authority(text) returns jsonb language sql as $synthetic_overload$ select '{}'::jsonb $synthetic_overload$;
      grant execute on function ${prefix}provider_execution_authority(text) to service_role;`,
  ]){await db.refused(`begin;${drift}${call(`${prefix}provider_execution_authority()`)}rollback;`,'55000');
    await db.refused(`begin;${drift}${migration}`,'55000');}
  assert.equal(await db.psql(`select to_regprocedure('${prefix}provider_execution_authority(text)') is null;`),'t');
  assert.deepEqual(await db.snapshot(),before,'Execution must not modify canonical financial rows, customer state, audit or outbox');
  assert.equal(await db.psql(financialFunctions),originalFunctions);
  assert.equal(await readFile(migrationPath,'utf8'),migration,'Migration changed during execution proof');
  const finalSourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,digest(await readFile(path))])));
  assert.deepEqual(finalSourceHashes,sourceHashes,'Source bytes changed during execution proof');
  pass('populated reapply and drift seal checks preserve financial rows byte-for-byte');
  console.log(JSON.stringify({adp02:'PASS',groups,refusals:db.refusals,lockWaitRaces:db.races,isolationCases,
    elapsedSeconds:(performance.now()-started)/1000,migrationSha256:digest(migration),sourceHashes,node:process.version,
    syntheticOnly:true,providerConfigured:false,managedStateMutated:false}));
}catch(error){console.error(error);if(error?.stderr)console.error(error.stderr);process.exitCode=1;}
finally{await db.stop();}
