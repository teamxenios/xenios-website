// New G1 isolation proof only. Existing ADP01..03 proof bytes are unchanged.
// Hold the first transaction until the peer demonstrably waits on a DB lock;
// do not infer a race from elapsed time or a fixed pg_sleep window.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { prefix, adapterRevision, scope, expected, id, request, actor, q, j,
  service, json, digest } from './research_assisted_order_quote_provider_settlement_harness.mjs';

export const call = expression => service(`select ${expression}::text;`);
export function strayEvent(label, overrides = {}) {
  return { schemaVersion:'assisted_order_provider_event_v1', eventId:`synthetic-quarantine-${label}`, payloadSha256:digest(`synthetic-bytes-${label}`),
    kind:'captured', claimedAttemptId:null, claimedRequestId:null, claimedQuoteId:null,
    claimedQuoteVersion:null, claimedAcceptanceId:null, claimedCanonicalOrderId:null,
    providerPaymentId:`synthetic-unattributed-payment-${label}`, providerSessionId:null,
    occurredAt:new Date().toISOString(), adjustmentId:null, observedAmountCents:5000,
    currency:'USD', ...overrides };
}
export const appendExpr = (event, c) => `${prefix}provider_event_append(${q(c.sourceId)},${q(c.revision)},${j(c.scope)},${j(event)})`;
export const manualTransaction = (db,n) => service(`do $manual$ declare observed jsonb;begin
  observed:=${db.observeExpr(n)};
  perform ${prefix}payment_verify_bound('${request(n)}',(observed->>'observationId')::uuid,'${actor}');
  end $manual$;select ${prefix}financial_state('${request(n)}')::text;`);

function heldConnection(db, sql, label) {
  let stdout='',stderr='',readyResolve,readyReject,seen=false;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const child=spawn('docker',['exec','-i',db.containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-U','postgres','-d','postgres'],{windowsHide:true});
  const timer=setTimeout(()=>child.kill(),60_000);
  child.stdout.on('data',chunk=>{stdout+=chunk;if(stdout.includes(`READY:${label}`)){seen=true;readyResolve();}});
  child.stderr.on('data',chunk=>{stderr+=chunk;});
  const done=new Promise((resolve,reject)=>{
    child.on('error',error=>{clearTimeout(timer);readyReject(error);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code===0&&seen)resolve(stdout);else{
      const error=Object.assign(new Error('Explicitly held synthetic transaction failed'),{code,stdout,stderr});
      readyReject(error);reject(error);
    }});
  });
  ready.catch(()=>{});done.catch(()=>{});
  child.stdin.write(`\\set VERBOSITY verbose\nset statement_timeout='30s';set idle_in_transaction_session_timeout='45s';
    begin;${sql}\nselect 'READY:${label}';\n`);
  return {ready,done,output:()=>stdout,finish:command=>child.stdin.end(`${command};\n`)};
}

export async function explicitLockRace(db, firstSql, secondSql, refusal = null) {
  const label=`quarantine-${db.races}-${Date.now()}`, peerName=`synthetic-${label}`;
  const holder=heldConnection(db,firstSql,label);let released=false,peer;
  try {
    await holder.ready;
    const peerSql=typeof secondSql==='function'?secondSql(json(holder.output())):secondSql;
    peer=db.startSql(`set application_name=${q(peerName)};${peerSql}`);
    const deadline=performance.now()+25_000;let blocked=false;
    while(performance.now()<deadline){
      const rows=await db.psql(`select count(*) from pg_stat_activity where application_name=${q(peerName)} and wait_event_type='Lock';`);
      if(rows==='1'){blocked=true;break;}
      await new Promise(resolve=>setTimeout(resolve,50));
    }
    assert.equal(blocked,true,'Peer must actually wait on a database lock before releasing the holder');
    holder.finish('commit');released=true;const firstOutput=await holder.done;
    let secondOutput,error;try{secondOutput=await peer.done;}catch(e){error=e;}
    if(refusal)db.checkError(error,...refusal);else if(error)throw error;
    db.races++;
    return {first:json(firstOutput),second:secondOutput?json(secondOutput):null};
  } finally {
    if(!released){holder.finish('rollback');await holder.done.catch(()=>{});}
    if(peer)await peer.done.catch(()=>{});
  }
}

export async function runQuarantineRaces(db) {
  let groups=0;const pass=label=>{groups++;console.log(`QUARANTINE_SQL PASS ${label}`);};
  const configure=async n=>{
    const c={sourceId:`synthetic-quarantine-race-${n}`,revision:adapterRevision,
      scope:{...scope,accountId:`synthetic-quarantine-race-account-${n}`}};
    await db.provision({source:c.sourceId,configuredScope:c.scope});return c;
  };
  const candidate=async(n,c)=>{
    await db.setup(n);await db.reserve(n,c);await db.claim(n,id(6,n),c);
    assert.equal((await db.append(n,db.result(n,c.scope),c)).classification,'bound');
    assert.equal((await db.captureAppend(n,db.capture(n),c)).classification,'bound');
  };
  const uncertainty=async n=>json(await db.psql(call(`${prefix}provider_uncertainty('${request(n)}')`)));

  // Unknown arrives before the first reservation: refusal leaves no exposure,
  // allowing the otherwise valid manual path. Reverse: the event must not gain
  // an established identity merely because the reservation commits while waiting.
  const c0=await configure(1900);await db.setup(1900);
  await explicitLockRace(db,call(appendExpr(strayEvent('race-event-first'),c0)),
    call(db.reserveExpr(1900,c0)),expected('UNCERTAINTY_HELD'));
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_attempts where request_id='${request(1900)}';`),'0');
  assert.deepEqual(json(await db.psql(manualTransaction(db,1900))),{hasObservation:true,paymentVerified:true});
  const c1=await configure(1901);await db.setup(1901);
  const invisible=await explicitLockRace(db,call(db.reserveExpr(1901,c1)),receipt=>call(appendExpr(
    strayEvent('race-initially-invisible',{claimedAttemptId:receipt.attemptId,claimedRequestId:request(1901),
      claimedQuoteId:db.quotes.get(1901),claimedQuoteVersion:1,claimedAcceptanceId:db.acceptances.get(1901)}),c1)));
  assert.equal(invisible.second.requestId,null);assert.equal(invisible.second.attemptId,null);
  assert.equal((await uncertainty(1901)).held,true);
  pass('both prospective-reservation orderings wait on actual locks; initially invisible attempts remain unattributed and manual fallback is not fabricated exposure');

  // Atomic capture settlement linearizes against same-source uncertainty. A
  // later fact holds eligibility without erasing a historical verified receipt.
  for(const eventFirst of [false,true]){
    const n=eventFirst?1903:1902,c=await configure(n);await candidate(n,c);
    const eventSql=call(appendExpr(strayEvent(`settlement-race-${n}`),c));
    if(eventFirst){await explicitLockRace(db,eventSql,call(db.settleExpr(n,c)),expected('SETTLEMENT_HELD'));
      assert.equal((await db.financial(n)).verifications,null);
    }else{
      await explicitLockRace(db,call(db.settleExpr(n,c)),eventSql);
      assert.deepEqual((await db.financial(n)).financial,{hasObservation:true,paymentVerified:true});
      assert.equal((await db.eligibility(n)).fulfillmentEligible,false);
      assert.equal((await db.settle(n,c)).replayed,true);
    }
  }
  pass('same-source event versus settlement in both lock orders preserves historical verification while refusing new unsafe settlement or fulfillment');

  for(const eventFirst of [true,false]){
    const n=eventFirst?1904:1905,c=await configure(n);await db.setup(n);
    const eventSql=call(appendExpr(strayEvent(`manual-race-${n}`,{claimedRequestId:request(n)}),c));
    const manualSql=manualTransaction(db,n);
    await explicitLockRace(db,eventFirst?eventSql:manualSql,eventFirst?manualSql:eventSql);
    assert.deepEqual((await db.financial(n)).financial,{hasObservation:true,paymentVerified:true});
    assert.equal((await db.eligibility(n)).fulfillmentEligible,true);
  }
  pass('unrelated manual verification succeeds in both global-fence lock orders; attacker-supplied request claims create no exposure');

  for(const eventFirst of [true,false]){
    const n=eventFirst?1906:1907,c=await configure(n),other=await configure(n+20);await candidate(n,other);
    const eventSql=call(appendExpr(strayEvent(`cross-scope-settlement-${n}`),c));
    const settlementSql=call(db.settleExpr(n,other));
    await explicitLockRace(db,eventFirst?eventSql:settlementSql,eventFirst?settlementSql:eventSql);
    assert.equal((await db.eligibility(n)).fulfillmentEligible,true);
  }
  pass('unrelated-source settlement remains safe in both real global-fence lock orderings');
  return {groups};
}
