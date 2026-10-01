// Additional ADP03 proof, invoked only inside the main disposable PG17 harness.
// No Docker lifecycle, external source, schema mutation, trigger injection or
// seal rebasing occurs here. Fixtures 1600..1699 are synthetic and exclusive.
import assert from 'node:assert/strict';
import { prefix, sourceId, adapterRevision, settlementPolicyRevision, scope,
  expected, id, request, actor, q, j, service, json, statusExpr, digest,
} from './research_assisted_order_quote_provider_settlement_harness.mjs';

const call=expression=>service(`select ${expression}::text;`);
const initialFinancial={hasObservation:false,paymentVerified:false};

export async function runSettlementRaces(db){
  const initialRaces=db.races,initialRefusals=db.refusals;
  let groups=0,rollbackBoundaries=0;
  const pass=label=>{groups++;console.log(`SETTLEMENT_SQL PASS ${label}`);};
  async function held(n){
    const f=await db.financial(n);
    assert.equal(f.request.status,'payment_review');assert.deepEqual(f.financial,initialFinancial);
    for(const key of ['settlements','observations','claims','verifications','outbox','audit'])assert.equal(f[key],null,key);
  }
  async function uniqueConfiguration(n,configuredScope={...scope,accountId:`synthetic-race-account-${n}`}){
    const source=`synthetic-settlement-race-${n}`;
    await db.provision({source,configuredScope});
    return{sourceId:source,revision:adapterRevision,scope:configuredScope};
  }
  async function candidate(n,configuration={},identity={}){
    await db.setup(n);await db.reserve(n,configuration);await db.claim(n,id(6,n),configuration);
    const actualScope=configuration.scope??scope;
    assert.equal((await db.append(n,db.result(n,{...actualScope,...identity}),configuration)).classification,'bound');
    assert.equal((await db.captureAppend(n,db.capture(n,identity),configuration)).classification,'bound');
  }

  // Config rows are really locked by the settlement transaction. A revocation
  // winner denies a new settlement; an already authorized winner stays valid.
  // Each case has its own source/account, so revocation cannot poison another.
  let n=1600;
  for(const table of ['provider_sources','provider_settlement_policies','provider_settlement_grants']){
    for(const first of ['settlement','revocation']){
      const number=n++,configuration=await uniqueConfiguration(number);await candidate(number,configuration);
      const revoke=`update ${prefix}${table} set revoked_at=clock_timestamp() where source_id=${q(configuration.sourceId)};
        select jsonb_build_object('revoked',true)::text;`;
      if(first==='settlement'){
        const value=await db.lockedRace(call(db.settleExpr(number,configuration)),revoke);
        assert.deepEqual(value,{revoked:true});
        const f=await db.financial(number);assert.equal(f.request.status,'paid');assert.equal(f.verifications.length,1);
        assert.equal((await db.settle(number,configuration)).replayed,true);
        // Configuration withdrawal alone never rewrites the original fact.
        assert.equal((await db.eligibility(number)).paymentVerified,true);
      }else{
        const before=await db.financial(number);
        await db.lockedRace(revoke,call(db.settleExpr(number,configuration)),expected('SETTLEMENT_GRANT_REQUIRED'));
        assert.deepEqual(await db.financial(number),before);await held(number);
      }
    }
  }
  pass('six actual config-row lock waits linearize distinct source, settlement-policy and settlement-grant revocation in both orders');

  // Identical opaque IDs from different provider accounts/test-live scopes are
  // not one financial identity. All actual object and capture facts agree with
  // their installed immutable source; no caller may substitute another scope.
  const namespaceCases=[
    {number:1610,accountId:'synthetic-namespace-account-a',mode:'test'},
    {number:1611,accountId:'synthetic-namespace-account-b',mode:'test'},
    {number:1612,accountId:'synthetic-namespace-account-a',mode:'live'},
  ];
  const configurations=[];
  const sameIdentity={providerPaymentId:'synthetic-same-opaque-payment',providerSessionId:'synthetic-same-opaque-session'};
  const namespaces=[];
  for(const c of namespaceCases){
    const configuration=await uniqueConfiguration(c.number,{...scope,accountId:c.accountId,mode:c.mode});configurations.push(configuration);
    await candidate(c.number,configuration,sameIdentity);await db.settle(c.number,configuration);
    const f=await db.financial(c.number),o=f.observations[0];
    assert.equal(o.provider_name,configuration.sourceId);assert.equal(o.provider_payment_id,sameIdentity.providerPaymentId);
    assert.equal(f.claims[0].provider_namespace,configuration.sourceId);assert.equal(f.verifications.length,1);
    namespaces.push(o.payment_reference);
  }
  assert.equal(new Set(namespaces).size,3,'Exact immutable source scope must distinguish the same opaque payment ID');
  await db.refused(call(db.settleExpr(1610,{...configurations[0],scope:configurations[1].scope})),...expected('SETTLEMENT_CONFLICT'));
  await db.refused(call(db.settleExpr(1610,{...configurations[0],scope:configurations[2].scope})),...expected('SETTLEMENT_CONFLICT'));
  await db.refused(call(db.settleExpr(1610,{...configurations[0],journalId:db.journals.get(1611).journalId})),...expected('SETTLEMENT_CONFLICT'));
  // Reusing those IDs for another order in the SAME source is a conflict,
  // unlike the distinct immutable account/mode namespaces above.
  await db.setup(1613);await db.reserve(1613,configurations[0]);await db.claim(1613,id(6,1613),configurations[0]);
  const collision=json(await db.psql(`begin;${call(db.resultExpr(1613,
    db.result(1613,{...configurations[0].scope,...sameIdentity}),configurations[0]))}rollback;`));
  assert.equal(collision.classification,'conflict');await held(1613);
  pass('identical opaque payment/session IDs remain separate across exact accounts and test-live namespaces, while same-source reuse and scope substitution refuse');

  // A provider-held candidate cannot legally acquire a competing manual
  // observation or no-funds cancellation. Test actual parent lock contention
  // without manufacturing a manual observation that the authority forbids.
  // Reverse cases hold the ordinary request lock before catching the denied
  // operation; they are arbitration tests, NOT two successful financial paths.
  const competitors=[
    {label:'manual observation',number:1620,expression:number=>db.observeExpr(number),after:expected('UNCERTAINTY_HELD')},
    {label:'ordinary cancellation',number:1622,expression:number=>statusExpr(number,'payment_review','cancelled',{cancellationReason:'Synthetic race'}),
      after:['P0001','ASSISTED_ORDER_STALE_STATUS']},
    {label:'no-funds commit',number:1624,expression:null,after:expected('UNCERTAINTY_HELD')},
  ];
  for(const competitor of competitors){
    for(const first of ['settlement','denied-command']){
      const number=competitor.number+(first==='denied-command'?1:0);
      await db.setup(number);
      let expression;
      if(competitor.label==='no-funds commit'){
        // Obtain a real context before the provider reservation. The later
        // provider facts must invalidate this previously eligible context.
        const context=json(await db.psql(call(`${prefix}disposition_context('${request(number)}','${actor}','synthetic-bank-import')`)));
        const receipt={schemaVersion:'assisted_order_no_funds_receipt_v1',requestId:request(number),quoteId:db.quotes.get(number),
          graphFingerprint:context.graphFingerprint,sourceNamespace:'synthetic-bank-import',sourceReceiptId:`synthetic-race-never-received-${number}`,
          outcome:'never_received',finality:'terminal',checkedAt:new Date().toISOString()};
        expression=`${prefix}disposition_commit_cancel('${request(number)}','${db.quotes.get(number)}',${q(context.graphFingerprint)},'${actor}',
          '${digest(`synthetic-race-no-funds-${number}`)}','cancel',${j(receipt)})`;
      }else expression=competitor.expression(number);
      await db.reserve(number);await db.claim(number);await db.append(number);await db.captureAppend(number);
      if(first==='settlement'){
        await db.lockedRace(call(db.settleExpr(number)),call(expression),competitor.after);
      }else{
        // This explicit row lock is the same lock used first by these RPCs.
        // The caught error must be the real provider fence, not a fixture error.
        const lockAndDeny=`select id from ${prefix}requests where id='${request(number)}' for update;
          set local role service_role;
          do $denied$ declare refused boolean:=false;detail text;begin
            begin perform ${expression};exception when sqlstate 'P0001' then
              get stacked diagnostics detail=PG_EXCEPTION_DETAIL;
              if detail is distinct from 'ASSISTED_ORDER_PROVIDER_UNCERTAINTY_HELD' then raise;end if;refused:=true;
            end;
            if not refused then raise exception 'Expected a held competing command';end if;
          end $denied$;
          select jsonb_build_object('denied',true)::text;`;
        const receipt=await db.lockedRace(lockAndDeny,call(db.settleExpr(number)));
        assert.equal(receipt.state,'verified');assert.equal(receipt.replayed,false);
      }
      const f=await db.financial(number);assert.equal(f.request.status,'paid');assert.equal(f.verifications.length,1);
      assert.equal(f.observations[0].method,'provider');assert.equal(f.events.filter(e=>e.status==='cancelled').length,0);
      assert.equal(await db.psql(`select count(*) from ${prefix}financial_dispositions where request_id='${request(number)}';`),'0');
      console.log(JSON.stringify({settlementArbitration:competitor.label,first,actualLockWait:true,
        reverseFinancialCommandAdmissible:false,manufacturedManualObservation:false}));
    }
  }
  // Provider rows remain unavailable through the generic verification RPC,
  // including receipt replay. That refusal precedes locking and is NOT added
  // to db.races. Nonexistent bound observations are likewise not fake races.
  const verified=await db.financial(1620);
  await db.refused(call(`${prefix}payment_verify_bound('${request(1620)}','${verified.observations[0].id}','${actor}')`),...expected('AUTHORITY_NOT_READY'));
  assert.equal(await db.psql(call(`${prefix}payment_verify_bound('${request(1620)}','${id(8,1699)}','${actor}')`)),'');
  pass('six actual parent-lock waits arbitrate settlement against denied manual observation, ordinary cancel and stale no-funds commit; pre-lock generic verification refusals are not counted as races');

  // Exercise each genuine insertion boundary using the untouched installed
  // functions/triggers. Observation+claim and verification+held-outbox are
  // inseparable nested trigger writes, so assert both before closure failure.
  // Never inject a trigger, rewrite a function, or rebaseline an integrity seal.
  const number=1640;await candidate(number);const before=await db.financial(number);
  const insertLink=`insert into ${prefix}provider_settlements(request_id,journal_id,source_id,adapter_revision,expected_scope,policy_revision,actor_auth_user_id)
    values('${request(number)}','${db.journals.get(number).journalId}','${sourceId}','${adapterRevision}',${j(scope)},'${settlementPolicyRevision}','${actor}') returning * into s;`;
  const insertObservation=`insert into ${prefix}payment_observations(id,request_id,quote_id,method,observed_amount_cents,observed_currency,
    payment_reference,provider_name,provider_event_id,provider_payment_id,source_evidence_ref,observed_by,observed_by_auth_user_id,observed_at)
    values(s.observation_id,s.request_id,s.quote_id,'provider',s.amount_cents,s.currency,s.payment_reference,s.source_id,s.provider_event_id,
      s.provider_payment_id,s.evidence_ref,s.actor_label,s.actor_auth_user_id,s.observed_at);`;
  const insertVerification=`insert into ${prefix}payment_verifications(id,request_id,quote_id,quote_version,acceptance_id,observation_id,
    expected_amount_cents,expected_currency,observed_amount_cents,observed_currency,payment_reference,method,provider_name,provider_event_id,provider_payment_id,verified_by,verified_at)
    values(s.verification_id,s.request_id,s.quote_id,s.quote_version,s.acceptance_id,s.observation_id,s.amount_cents,s.currency,s.amount_cents,s.currency,
      s.payment_reference,'provider',s.source_id,s.provider_event_id,s.provider_payment_id,s.actor_label,s.verified_at);`;
  const completeStatus=`perform ${prefix}set_status(s.request_id,'payment_review','paid',s.actor_label,'admin',
    'Payment verification recorded.',null,jsonb_build_object('paymentVerificationId',s.verification_id),s.verified_at);`;
  for(const stage of [1,2,3,4]){
    const expectedObservation=stage>=2?1:0,expectedVerification=stage>=3?1:0;
    const sql=`begin;do $partial$ declare s ${prefix}provider_settlements%rowtype;begin
      ${insertLink}${stage>=2?insertObservation:''}${stage>=3?insertVerification:''}${stage>=4?completeStatus:''}
      if (select count(*) from ${prefix}provider_settlements where request_id=s.request_id)<>1
        or (select count(*) from ${prefix}payment_observations where request_id=s.request_id)<>${expectedObservation}
        or (select count(*) from ${prefix}evidence_claims where request_id=s.request_id)<>${expectedObservation}
        or (select count(*) from ${prefix}payment_verifications where request_id=s.request_id)<>${expectedVerification}
        or (select count(*) from public.research_notification_outbox where assisted_order_verification_id=s.verification_id)<>${expectedVerification}
        or (select count(*) from ${prefix}events where request_id=s.request_id and status='paid')<>${stage===4?1:0}
      then raise exception 'Unexpected canonical insertion boundary' using errcode='22000';end if;
      if public.research_assisted_order_provider_settlement_complete(s.id) is distinct from ${stage===4?'true':'false'}
      then raise exception 'Unexpected complete graph predicate' using errcode='22000';end if;
      end $partial$;
      ${stage<4?'set constraints adp03_settlement_complete immediate;':'set constraints all immediate;select 1/0;'}commit;`;
    await db.refused(sql,...(stage<4?expected('SETTLEMENT_CONFLICT'):['22012']));
    assert.deepEqual(await db.financial(number),before);rollbackBoundaries++;
  }
  // A legitimate service-role completed transaction is also rolled back to a
  // savepoint and then committed empty, proving no obligation survives abort.
  await db.psql(`begin;savepoint before_settlement;${call(db.settleExpr(number))}rollback to savepoint before_settlement;commit;`);
  assert.deepEqual(await db.financial(number),before);rollbackBoundaries++;
  pass('five rollback boundaries preserve zero partial canonical evidence: link, observation plus claim, verification plus held outbox, paid event, and service-role savepoint abort');
  const receipt={groups,actualLockWaitRaces:db.races-initialRaces,refusals:db.refusals-initialRefusals,rollbackBoundaries,
    configLockRaces:6,financialParentLockArbitrations:6,genericVerificationLockRaces:0,
    schemaModified:false,sealRebased:false,providerFactsSynthetic:true};
  assert.equal(receipt.actualLockWaitRaces,12);assert.equal(rollbackBoundaries,5);
  console.log(`SETTLEMENT_RACES COMPLETE ${JSON.stringify(receipt)}`);return receipt;
}
