// Permanent ADP01 stale-snapshot regression. Synthetic disposable database only.
// Synthetic disposable PG17 only. Interactive psql makes snapshot/commit/action
// order explicit without sleeps or provider/network access.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { ProviderJournalHarness,migrationPath,request,actor,actorLabel,q,j,service,json,statusExpr }
  from './research_assisted_order_quote_provider_journal_harness.mjs';
const db=new ProviderJournalHarness();
const digest=x=>createHash('sha256').update(x).digest('hex');
const source='synthetic-isolation-source',revision='synthetic-v1';
const scope={provider:'synthetic-unconfigured',accountId:'synthetic-isolation-account',mode:'test'};
const reserve=n=>service(`select public.research_assisted_order_provider_attempt_reserve('${request(n)}','${db.quotes.get(n)}',1,
 '${db.acceptances.get(n)}','${source}','${revision}',${j(scope)},'${actor}','${digest(`reservation-${n}`)}')::text;`);
const cancel=n=>service(`select ${statusExpr(n,'payment_review','cancelled',{cancellationReason:'Synthetic isolation diagnostic'})}::text;`);
const manual=n=>service(`select (${db.observeExpr(n)}->>'observationId') as observation_id \\gset
 select public.research_assisted_order_payment_verify_bound('${request(n)}',:'observation_id','${actor}')::text;`);
async function noFunds(n){
  const c=json(await db.psql(service(`select public.research_assisted_order_disposition_context('${request(n)}','${actor}','synthetic-bank-import')::text;`)));
  const receipt={schemaVersion:'assisted_order_no_funds_receipt_v1',sourceNamespace:'synthetic-bank-import',sourceReceiptId:`synthetic-rr-${n}`,
    requestId:c.requestId,quoteId:c.quoteId,graphFingerprint:c.graphFingerprint,outcome:'never_received',finality:'terminal',checkedAt:new Date().toISOString()};
  return service(`select public.research_assisted_order_disposition_commit_cancel('${c.requestId}','${c.quoteId}','${c.graphFingerprint}',
    '${actor}','${digest(JSON.stringify(['assisted-order-no-funds:v1',receipt.sourceNamespace,receipt.sourceReceiptId,c.requestId,c.graphFingerprint]))}',
    'cancel',${j(receipt)})::text;`);
}
function staleSession(isolation){
  let markResolve,markReject;
  const ready=new Promise((resolve,reject)=>{markResolve=resolve;markReject=reject;});
  const child=spawn('docker',['exec','-i',db.containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{windowsHide:true});
  let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),45_000);
  const done=new Promise((resolve,reject)=>{
    child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes('synthetic-snapshot-ready'))markResolve();});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',error=>{clearTimeout(timer);markReject(error);reject(error);});
    child.on('close',exitCode=>{clearTimeout(timer);if(!stdout.includes('synthetic-snapshot-ready'))markReject(new Error(stderr));resolve({exitCode,stdout,stderr});});
  });
  ready.catch(()=>{});done.catch(()=>{});
  child.stdin.write(`\\set VERBOSITY verbose\nbegin isolation level ${isolation};
    select json_build_object('snapshot',txid_current_snapshot(),'attempts',(select count(*) from public.research_assisted_order_provider_attempts),
      'events',(select count(*) from public.research_assisted_order_provider_event_journal))::text;
    select 'synthetic-snapshot-ready';\n`);
  return{ready,finish:sql=>{child.stdin.end(`${sql}\ncommit;\n`);return done;}};
}
const outcomes=[];
const isolationDetail='ASSISTED_ORDER_PROVIDER_TRANSACTION_ISOLATION_REQUIRED';
async function inspect(label,n,result){
  const state=json(await db.psql(`select json_build_object('status',(select status from public.research_assisted_order_requests where id='${request(n)}'),
    'attempts',(select count(*) from public.research_assisted_order_provider_attempts where request_id='${request(n)}'),
    'unbound',(select count(*) from public.research_assisted_order_provider_event_journal where established_request_id is null),
    'financial',public.research_assisted_order_financial_state('${request(n)}'),
    'dispositions',(select count(*) from public.research_assisted_order_financial_dispositions where request_id='${request(n)}'))::text;`));
  const unsafe=result.exitCode===0&&(state.status==='paid'||state.status==='cancelled')&&(state.attempts>0||state.unbound>0);
  const outcome={label,requestId:request(n),exitCode:result.exitCode,errorCode:/ERROR:\s+([A-Z0-9]{5}):/.exec(result.stderr)?.[1]??null,
    detail:/DETAIL:\s+([^\r\n]+)/.exec(result.stderr)?.[1]??null,state,unsafe};
  outcomes.push(outcome);console.log(JSON.stringify(outcome));
  assert.notEqual(result.exitCode,0,label);assert.equal(outcome.errorCode,'P0001',label);assert.equal(outcome.detail,isolationDetail,label);
  assert.equal(state.status,'payment_review',label);assert.equal(state.financial.paymentVerified,false,label);assert.equal(state.dispositions,0,label);assert.equal(unsafe,false,label);
}
try{
  await db.start();await db.baseline();const migration=await readFile(migrationPath,'utf8');await db.psql(migration);
  console.log(JSON.stringify({migrationSha256:digest(migration),purpose:'stale isolation snapshot diagnostic',syntheticOnly:true}));
  await db.psql(`insert into public.research_assisted_order_provider_sources(source_id,provider_namespace,account_ref,mode,adapter_revision,granted_by)
    values('${source}','${scope.provider}','${scope.accountId}','test','${revision}','synthetic-owner');
    insert into public.research_assisted_order_provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
    values('${source}','${actor}','${actorLabel}','synthetic-owner');`);
  for(let n=900;n<=911;n++)await db.setup(n);
  const nf902=await noFunds(902),nf905=await noFunds(905);await db.observe(904);
  // Explicit READ COMMITTED remains supported, including immutable replay and
  // normal manual authority and positive no-funds decisions before uncertainty.
  await db.psql(`begin isolation level read committed;${reserve(909)}commit;`);
  const rcReplay=json(await db.psql(`begin isolation level read committed;${reserve(909)}commit;`));assert.equal(rcReplay.replayed,true);
  await db.psql(`begin isolation level read committed;${manual(910)}commit;`);
  assert.equal(json(await db.psql(service(`select public.research_assisted_order_financial_state('${request(910)}')::text;`))).paymentVerified,true);
  await db.psql(`begin isolation level read committed;${await noFunds(911)}commit;`);
  assert.equal(await db.psql(`select status from public.research_assisted_order_requests where id='${request(911)}';`),'cancelled');
  for(const [label,n,isolation,action] of [
    ['repeatable-read/reservation/cancel',900,'repeatable read',cancel(900)],
    ['repeatable-read/reservation/manual-verify',901,'repeatable read',manual(901)],
    ['repeatable-read/reservation/no-funds',902,'repeatable read',nf902],
    ['serializable/reservation/cancel',903,'serializable',cancel(903)],
  ]){
    const tx=staleSession(isolation);await tx.ready;
    await db.psql(reserve(n)); // committed only after reader snapshot exists
    await inspect(label,n,await tx.finish(action));
  }
  const globalCases=[
    ['repeatable-read/global/manual-verify',904,'repeatable read',service(`select ${db.verifyExpr(904)}::text;`)],
    ['repeatable-read/global/no-funds',905,'repeatable read',nf905],
    ['repeatable-read/global/cancel',906,'repeatable read',cancel(906)],
    ['serializable/global/cancel',907,'serializable',cancel(907)],
  ];
  const sessions=[];
  for(const row of globalCases){const tx=staleSession(row[2]);await tx.ready;sessions.push([row,tx]);}
  const e={schemaVersion:'assisted_order_provider_event_v1',eventId:'synthetic-rr-unbound',payloadSha256:digest('synthetic-event-bytes'),
    kind:'captured',occurredAt:new Date().toISOString(),claimedAttemptId:null,claimedRequestId:null,claimedQuoteId:null,claimedAcceptanceId:null,
    claimedCanonicalOrderId:null,claimedQuoteVersion:null,providerPaymentId:'synthetic-payment',providerSessionId:null,adjustmentId:null,observedAmountCents:5000,currency:'USD'};
  const receipt=json(await db.psql(service(`select public.research_assisted_order_provider_event_append('${source}','${revision}',${j(scope)},${j(e)})::text;`)));
  assert.equal(receipt.requestId,null);assert.equal(receipt.classification,'quarantined');
  for(const [row,tx]of sessions)await inspect(row[0],row[1],await tx.finish(row[3]));
  await db.refused(cancel(908),'P0001','ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD');
  // Early returns and replay must not escape the isolation precondition. The
  // policy is explicit: no silent downgrade of READ UNCOMMITTED, RR or SSI.
  const before=await db.psql("select json_build_array((select count(*) from public.research_assisted_order_provider_attempts),(select count(*) from public.research_assisted_order_provider_event_journal),(select count(*) from public.research_assisted_order_payment_observations),(select count(*) from public.research_assisted_order_payment_verifications),(select count(*) from public.research_assisted_order_financial_dispositions))::text;");
  const calls=[
    service('select public.research_assisted_order_provider_journal_authority();'),
    service(`select public.research_assisted_order_provider_uncertainty('${request(999)}');`),
    reserve(900), // exact already-committed immutable replay
    reserve(908), // new reservation
    reserve(900).replace(request(900),request(999)), // valid arguments, missing-request early return
    service(`select public.research_assisted_order_provider_event_append('${source}','${revision}',${j(scope)},${j(e)});`),
    `insert into public.research_assisted_order_provider_event_journal(source_id,adapter_revision,expected_scope,event) values('${source}','${revision}',${j(scope)},${j({...e,eventId:'synthetic-direct-unsupported'})});`,
  ];
  for(const level of ['read uncommitted','repeatable read','serializable']) {
    for(const call of calls)await db.refused(`begin isolation level ${level};${call}commit;`,'P0001',isolationDetail);
  }
  assert.equal(await db.psql("select json_build_array((select count(*) from public.research_assisted_order_provider_attempts),(select count(*) from public.research_assisted_order_provider_event_journal),(select count(*) from public.research_assisted_order_payment_observations),(select count(*) from public.research_assisted_order_payment_verifications),(select count(*) from public.research_assisted_order_financial_dispositions))::text;"),before);
  const rcAuthority=json(await db.psql(`begin isolation level read committed;${service('select public.research_assisted_order_provider_journal_authority()::text;')}commit;`));
  assert.equal(rcAuthority.settlementEnabled,false);
  assert.equal(digest(await readFile(migrationPath,'utf8')),digest(migration),'Migration changed during isolation qualification');
  console.log(JSON.stringify({result:'PASS',readCommittedControl:'allowed exact authority; uncertain cancellation refused',staleSnapshotCases:outcomes.length,unsupportedIsolationRefusals:db.refusals-1,unsafe:outcomes.filter(x=>x.unsafe).length,syntheticOnly:true}));
}catch(error){console.error('ISOLATION_REPRO_ERROR',error);process.exitCode=2;}
finally{await db.stop();}
