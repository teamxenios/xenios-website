// G1 bounded quarantine isolation, not attribution/resolution or G2..G4 closure.
// Synthetic local PostgreSQL only; no provider authentication, money, email,
// managed connection, external network, or alteration of existing proof files.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ProviderSettlementHarness, migrationPath as settlementMigrationPath,
  prefix, adapterRevision, scope, expected, id, request, actor, q, j, service, json,
  statusExpr, digest } from './research_assisted_order_quote_provider_settlement_harness.mjs';
import { call, strayEvent, appendExpr, manualTransaction, runQuarantineRaces }
  from './research_assisted_order_provider_quarantine_races.mjs';

assert.equal(process.version,'v20.19.0');
const migrationPath='supabase/migrations/20261001160730_research_assisted_order_provider_quarantine_isolation.sql';
const migration=await readFile(migrationPath,'utf8');
assert.ok(migration.includes('ADP04Q_SCHEMA_V1'),'Require complete successor source');
const trackedProofs=['supabase/verification/research_assisted_order_provider_quarantine_local.mjs',
  'supabase/verification/research_assisted_order_provider_quarantine_races.mjs',
  'supabase/verification/research_assisted_order_quote_provider_settlement_harness.mjs',
  'supabase/verification/research_assisted_order_quote_provider_execution_harness.mjs',
  'supabase/verification/research_assisted_order_quote_provider_journal_harness.mjs',
  'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql','supabase/research-notification-outbox.sql'];
const sourcePaths=[...trackedProofs,...(await readdir('supabase/migrations'))
  .filter(name=>name.includes('research_assisted_order')).map(name=>`supabase/migrations/${name}`)].sort();
const sourceHashes=Object.fromEntries(await Promise.all(sourcePaths.map(async path=>[path,digest(await readFile(path))])));
const db=new ProviderSettlementHarness(),started=performance.now();let groups=0,reproductions=0;
const pass=label=>{groups++;console.log(`QUARANTINE_SQL PASS ${label}`);};
const runFile=promisify(execFile);
console.log(`QUARANTINE_SQL SOURCE ${JSON.stringify({node:process.version,sourceHashes,syntheticOnly:true})}`);
const uncertainty=async n=>json(await db.psql(call(`${prefix}provider_uncertainty('${request(n)}')`)));
const journalRows=()=>db.psql(`select coalesce(jsonb_agg(to_jsonb(r) order by id),'[]')::text from ${prefix}provider_event_journal r;`);
async function providerSnapshot(){
  const tables=['provider_sources','provider_source_grants','provider_attempts','provider_event_journal',
    'provider_create_policies','provider_execution_grants','provider_create_claims','provider_create_results',
    'provider_identity_bindings','provider_settlement_policies','provider_settlement_grants','provider_settlements'];
  return db.psql(`select jsonb_build_object(${tables.map(t=>`${q(t)},(select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]') from ${prefix}${t} r)`).join(',')})::text;`);
}
async function configure(name,overrides={}){
  const c={sourceId:`synthetic-quarantine-${name}`,revision:adapterRevision,
    scope:{...scope,provider:'synthetic-quarantine-provider',accountId:'synthetic-quarantine-account-a',...overrides}};
  await db.provision({source:c.sourceId,configuredScope:c.scope});return c;
}
async function candidate(n,c,{capture=true}={}){
  await db.setup(n);await db.reserve(n,c);await db.claim(n,id(6,n),c);
  assert.equal((await db.append(n,db.result(n,c.scope),c)).classification,'bound');
  if(capture)assert.equal((await db.captureAppend(n,db.capture(n),c)).classification,'bound');
}
async function unchangedRefusal(n,sql,...error){
  const before=await db.financial(n),provider=await providerSnapshot();
  await db.refused(sql,...error);assert.deepEqual(await db.financial(n),before);assert.equal(await providerSnapshot(),provider);
}
async function noFundsExpr(n){
  const context=json(await db.psql(call(`${prefix}disposition_context('${request(n)}','${actor}','synthetic-bank-import')`)));
  const receipt={schemaVersion:'assisted_order_no_funds_receipt_v1',requestId:request(n),quoteId:db.quotes.get(n),
    graphFingerprint:context.graphFingerprint,sourceNamespace:'synthetic-bank-import',sourceReceiptId:`synthetic-quarantine-no-funds-${n}`,
    outcome:'never_received',finality:'terminal',checkedAt:new Date().toISOString()};
  return `${prefix}disposition_commit_cancel('${request(n)}','${db.quotes.get(n)}',${q(context.graphFingerprint)},'${actor}',
    '${digest(`synthetic-quarantine-no-funds-${n}`)}','cancel',${j(receipt)})`;
}

try{
  await db.start();await db.baseline();await db.install();
  const inspected=JSON.parse((await runFile('docker',['inspect',db.containerId,'--format','{{json .}}'],{windowsHide:true})).stdout);
  assert.equal(inspected.HostConfig.NetworkMode,'none');assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
  console.log(`QUARANTINE_SQL ENV ${JSON.stringify({containerId:db.containerId,network:'none',publishedPorts:0,
    postgresVersion:await db.psql('show server_version;'),node:process.version,syntheticServiceRoleBootstrap:true})}`);
  const a=await configure('a'),b=await configure('b',{accountId:'synthetic-quarantine-account-b'}),
    c=await configure('c',{mode:'live'}),d=await configure('d',{provider:'synthetic-quarantine-provider-other'});
  for(const n of [1800,1801,1802,1803,1805,1811,1850])await db.setup(n);
  await db.setup(1804,{accept:false});await db.observe(1805,4999);
  await db.psql(manualTransaction(db,1800));
  await candidate(1810,a);await db.reserve(1850,a);
  await candidate(1820,b);await candidate(1830,c);await candidate(1840,d);await candidate(1841,d);
  const immutableAuthority={};
  for(const f of ['provider_journal_authority','provider_execution_authority','provider_settlement_authority','payment_effects_authority'])
    immutableAuthority[f]=json(await db.psql(call(`${prefix}${f}()`)));
  const unknown=strayEvent('predecessor-unknown',{claimedRequestId:request(1801)});
  const unknownReceipt=json(await db.psql(call(appendExpr(unknown,a))));
  assert.equal(unknownReceipt.requestId,null);assert.equal(unknownReceipt.attemptId,null);
  const originalUnknownRow=await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(unknownReceipt.journalId)};`);
  assert.equal((await uncertainty(1801)).held,true);
  await unchangedRefusal(1801,call(db.observeExpr(1801)),...expected('UNCERTAINTY_HELD'));
  await unchangedRefusal(1800,call(statusExpr(1800,'paid','supplier_processing',
    {supplierAssignmentId:'synthetic-quarantine-assignment-1800'})),...expected('UNCERTAINTY_HELD'));
  reproductions++;
  console.log('QUARANTINE_SQL REPRODUCED predecessor M93 unbound event blocks unrelated manual-only observation and verified progression; this expected defect is retained, not a clean predecessor result');

  const oldProvider=await providerSnapshot(),oldFinancial=await db.snapshot(),oldJournal=await journalRows();
  await db.psql(migration);await db.psql(migration);
  assert.equal(await providerSnapshot(),oldProvider);assert.deepEqual(await db.snapshot(),oldFinancial);
  assert.equal(await journalRows(),oldJournal);
  for(const [f,value]of Object.entries(immutableAuthority))assert.deepEqual(json(await db.psql(call(`${prefix}${f}()`))),value);
  assert.equal(await db.psql(`select ${prefix}provider_source_quarantine_held(null),${prefix}provider_request_quarantine_held(null);`),'t|t');
  assert.equal(await db.psql(`select ${prefix}provider_source_quarantine_held(${q(a.sourceId)}),${prefix}provider_source_quarantine_held(${q(b.sourceId)});`),'t|f');
  pass('exact additive migration and reapply preserve every preexisting provider/financial row and authority DTO; null helpers fail closed');

  assert.equal((await uncertainty(1801)).held,false);assert.equal((await uncertainty(1810)).held,true);
  await db.psql(manualTransaction(db,1801));
  assert.equal((await db.eligibility(1801)).fulfillmentEligible,true);
  await db.psql(call(statusExpr(1800,'paid','supplier_processing',
    {supplierAssignmentId:'synthetic-quarantine-assignment-1800'})));
  await db.psql(call(statusExpr(1802,'payment_review','cancelled',{cancellationReason:'Synthetic manual cancellation'})));
  assert.equal(json(await db.psql(call(await noFundsExpr(1803)))).state,'cancelled');
  const accepted=json(await db.psql(call(`${prefix}quote_accept('${db.quotes.get(1804)}',1,5000,'${id(2,1804)}')`)));
  assert.ok(accepted);
  const corrected=json(await db.psql(call(`${prefix}payment_correct_manual('${request(1805)}','${db.observations.get(1805)}','${actor}',
    '${db.quotes.get(1805)}','XRR-20261001-ABCDEF1805',5000,'USD','synthetic-quarantine-corrected-1805',
    '2026-01-01T00:00:00.000Z','Synthetic correction')`)));
  assert.ok(corrected.observationId);assert.equal(corrected.supersedes,db.observations.get(1805));
  db.observations.set(1805,corrected.observationId);
  assert.equal(json(await db.psql(call(db.verifyExpr(1805)))).state,'paid');
  await db.setup(1806); // Real quote issue/accept after quarantine, not a bypassed fixture quote.
  assert.equal(await journalRows(),oldJournal);
  pass('manual-only issue/accept, correction, verified-paid progression, ordinary cancellation and positive no-funds cancellation remain usable without rewriting stray evidence');

  await unchangedRefusal(1811,call(db.reserveExpr(1811,a)),...expected('UNCERTAINTY_HELD'));
  await unchangedRefusal(1811,`insert into ${prefix}provider_attempts
    select (jsonb_populate_record(null::${prefix}provider_attempts,to_jsonb(a)||jsonb_build_object(
      'id','${id(9,1811)}','request_id','${request(1811)}','quote_id','${db.quotes.get(1811)}',
      'acceptance_id','${db.acceptances.get(1811)}','idempotency_key','${digest('synthetic-direct-attempt-1811')}',
      'reserved_at',clock_timestamp()))).* from ${prefix}provider_attempts a where request_id='${request(1850)}';`,
    ...expected('UNCERTAINTY_HELD'));
  assert.equal(await db.psql(`select count(*) from ${prefix}provider_attempts where request_id='${request(1811)}';`),'0');
  await db.psql(manualTransaction(db,1811));
  await unchangedRefusal(1810,call(db.settleExpr(1810,a)),...expected('SETTLEMENT_HELD'));
  await unchangedRefusal(1850,call(db.observeExpr(1850)),...expected('UNCERTAINTY_HELD'));
  assert.equal((await db.context(1850,a)).nextAction,'reconciliation_required');
  assert.equal((await db.claim(1850,id(6,1850),a)).authorized,false);
  assert.equal((await db.reserve(1850,a)).replayed,true);
  pass('affected source refuses prospective first exposure and new settlement/create authority; existing reservation replay remains read-only and manual fallback remains unexposed');

  await candidate(1821,b);
  assert.equal((await db.settle(1821,b)).state,'verified');
  assert.equal((await db.eligibility(1821)).fulfillmentEligible,true);
  pass('fresh unrelated-source reservation and create claim remain available after quarantine; real normalized binding and full capture still settle');

  // Same vendor is not same account; same account is not same test/live mode.
  for(const [n,config]of [[1820,b],[1830,c],[1840,d]]){
    assert.equal((await db.settle(n,config)).state,'verified');
    assert.equal((await db.eligibility(n)).fulfillmentEligible,true);
    assert.deepEqual((await db.financial(n)).financial,{hasObservation:true,paymentVerified:true});
  }
  // A concrete adverse target must not be narrowed away as if it were unbound.
  const targeted=json(await db.psql(call(appendExpr(db.capture(1841,{eventId:'synthetic-bound-adverse',
    payloadSha256:digest('synthetic-bound-adverse'),kind:'refunded',adjustmentId:'synthetic-refund'}),d))));
  assert.equal(targeted.requestId,request(1841));
  await unchangedRefusal(1841,call(db.settleExpr(1841,d)),...expected('SETTLEMENT_HELD'));
  assert.equal((await db.eligibility(1840)).fulfillmentEligible,true);
  pass('exact provider/account/mode namespaces isolate unrelated capture settlement while exact-bound adverse evidence still holds its established request');

  // Late facts remain facts. Revocation cannot erase the exposure join.
  const late=json(await db.psql(call(appendExpr(strayEvent('late-b'),b))));assert.equal(late.requestId,null);
  assert.equal((await db.eligibility(1820)).fulfillmentEligible,false);
  assert.deepEqual((await db.financial(1820)).financial,{hasObservation:true,paymentVerified:true});
  assert.equal((await db.settle(1820,b)).replayed,true);
  await unchangedRefusal(1820,call(statusExpr(1820,'paid','supplier_processing',
    {supplierAssignmentId:'synthetic-quarantine-assignment-1820'})),...expected('FULFILLMENT_HELD'));
  await db.psql(`update ${prefix}provider_sources set revoked_at=clock_timestamp() where source_id=${q(b.sourceId)};`);
  assert.equal((await db.eligibility(1820)).fulfillmentEligible,false);
  assert.equal((await db.eligibility(1830)).fulfillmentEligible,true);
  assert.equal((await db.eligibility(1801)).fulfillmentEligible,true);
  pass('late same-scope facts hold current provider fulfillment after historical verification and source revocation without holding unrelated manual or other-mode orders');

  const journalBeforeReplay=await journalRows();
  assert.equal(json(await db.psql(call(appendExpr(unknown,a)))).replayed,true);
  assert.equal(await journalRows(),journalBeforeReplay);
  const conflict=json(await db.psql(call(appendExpr({...unknown,payloadSha256:digest('changed-replay')},a))));
  assert.equal(conflict.classification,'conflict');assert.equal(conflict.requestId,null);
  assert.equal(await db.psql(`select to_jsonb(r)::text from ${prefix}provider_event_journal r where id=${q(unknownReceipt.journalId)};`),
    originalUnknownRow,'Original SQL-serialized journal row must remain byte-for-byte identical');
  pass('exact replay preserves immutable journal bytes and changed replay appends retained conflict without attribution');

  const beforeGuards=await journalRows();
  for(const sql of [`update ${prefix}provider_event_journal set established_request_id='${request(1801)}' where id=${q(unknownReceipt.journalId)}`,
    `delete from ${prefix}provider_event_journal where id=${q(unknownReceipt.journalId)}`,`truncate ${prefix}provider_event_journal cascade`,
    `set session_replication_role=replica;delete from ${prefix}provider_event_journal where id=${q(unknownReceipt.journalId)}`])
    await db.refused(sql,...expected('IMMUTABLE'));
  assert.equal(await journalRows(),beforeGuards);
  for(const role of ['anon','authenticated','service_role']){
    await db.refused(`set role ${role};select ${prefix}provider_source_quarantine_held(${q(a.sourceId)});`,'42501');
    await db.refused(`set role ${role};select * from ${prefix}provider_event_journal;`,'42501');
  }
  for(const level of ['read uncommitted','repeatable read','serializable'])
    await db.refused(`begin isolation level ${level};${call(`${prefix}provider_uncertainty('${request(1801)}')`)}commit;`,...expected('TRANSACTION_ISOLATION_REQUIRED'));
  pass('immutable journal/replica/truncate protections, private helpers/tables and actual READ COMMITTED requirement remain enforced');

  for(const drift of [
    `grant execute on function ${prefix}provider_source_quarantine_held(text) to service_role;`,
    `grant select(event) on ${prefix}provider_event_journal to authenticated;`,
    `alter table ${prefix}provider_attempts enable replica trigger adp01_attempt_guard;`,
    `create function ${prefix}provider_source_quarantine_held(integer) returns boolean language sql as 'select false';grant execute on function ${prefix}provider_source_quarantine_held(integer) to service_role;`,
  ])await db.refused(`begin;${drift}${call(`${prefix}provider_journal_authority()`)}commit;`,'55000');
  assert.deepEqual(json(await db.psql(call(`${prefix}provider_settlement_authority()`))),immutableAuthority.provider_settlement_authority);
  pass('effective helper/column ACL, replica-only prospective guard and unexpected overload drift fail authority without adopting a new baseline');

  const races=await runQuarantineRaces(db);groups+=races.groups;
  const endProvider=await providerSnapshot(),endFinancial=await db.snapshot();await db.psql(migration);
  assert.equal(await providerSnapshot(),endProvider);assert.deepEqual(await db.snapshot(),endFinancial);
  pass('exact repeat apply preserves populated held, settled, manual and conflict records after all races');
  for(const [path,hash]of Object.entries(sourceHashes))assert.equal(digest(await readFile(path)),hash,`Source changed during proof: ${path}`);
  console.log(`QUARANTINE_SQL COMPLETE ${JSON.stringify({groups,refusals:db.refusals,races:db.races,reproductions,node:process.version,
    seconds:Number(((performance.now()-started)/1000).toFixed(3)),migrationSha256:sourceHashes[migrationPath],
    predecessorSha256:sourceHashes[settlementMigrationPath],scope:'source-account-mode-exposure-isolation-only',
    attributionImplemented:false,g2g3g4Closed:false,managedQualified:false})}`);
}finally{
  const container=db.containerId;await db.stop();
  if(container){let absent=false;try{await runFile('docker',['inspect',container],{windowsHide:true});}catch{absent=true;}
    assert.equal(absent,true);console.log(`QUARANTINE_SQL CLEANUP ${JSON.stringify({containerId:container,removed:true,network:'none'})}`);}
}
