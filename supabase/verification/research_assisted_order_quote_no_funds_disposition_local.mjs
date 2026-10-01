// Synthetic local-only proof. Owner fixture setup is explicitly distinguished
// from actual SET ROLE service_role calls. No bank authentication, real mail,
// managed database, network, provider activation or money movement is exercised.
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { createHash, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

assert.equal(process.version, 'v20.19.0');
const runFile=promisify(execFile);
const stem='supabase/verification/research_assisted_order_quote_no_funds_disposition';
const migrationPath='supabase/migrations/20261001062651_research_assisted_order_quote_no_funds_disposition.sql';
const migration=await readFile(migrationPath,'utf8');
const precheck=await readFile(`${stem}_precheck.sql`,'utf8');
const postcheck=await readFile(`${stem}_postcheck.sql`,'utf8');
const predecessors=[
  'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql',
  'supabase/migrations/20260815150000_research_assisted_order_bridge.sql',
  'supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql',
  'supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql',
  'supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql',
  'supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql',
  'supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql',
  'supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql',
  'supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql',
];
const id=(prefix,n)=>`${prefix}0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request=n=>id(1,n),member=n=>id(2,n),line=n=>id(3,n);
const actor=id(4,1),otherActor=id(4,2),actorLabel='synthetic-disposition-finance@example.test';
const reference=n=>`XRR-20261001-ABCDEF${String(n).padStart(4,'0')}`;
const namespace='synthetic-bank-import';
const q=value=>value==null?'null':`'${String(value).replaceAll("'","''")}'`;
const j=value=>`${q(JSON.stringify(value))}::jsonb`;
const service=sql=>`set role service_role;${sql}`;
const prefix='public.research_assisted_order_disposition_';
const schema='research_assisted_order_audit_v1';
const attestation='research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694';
const quotes=new Map(),observations=new Map();
let containerId,refusals=0,races=0;
function startSql(sql,marker=null){
  let markResolve,markReject;
  const marked=marker?new Promise((resolve,reject)=>{markResolve=resolve;markReject=reject;}):null;
  const done=new Promise((resolve,reject)=>{
    const child=spawn('docker',['exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],{windowsHide:true});
    let stdout='',stderr='';const timer=setTimeout(()=>child.kill(),45_000);
    child.stdout.on('data',chunk=>{stdout+=chunk;if(marker&&stdout.includes(marker))markResolve();});
    child.stderr.on('data',chunk=>{stderr+=chunk;});
    child.on('error',error=>{clearTimeout(timer);markReject?.(error);reject(error);});
    child.on('close',code=>{clearTimeout(timer);if(code===0){markResolve?.();resolve(stdout.trim());}
      else{const error=Object.assign(new Error(`Disposable psql exited ${code}`),{code,stdout,stderr});markReject?.(error);reject(error);}});
    child.stdin.end(`\\set VERBOSITY verbose\nset statement_timeout='30s';\n${sql}\n`);
  });
  done.catch(()=>{});marked?.catch(()=>{});return {done,marked};
}
const psql=sql=>startSql(sql).done;
const rows=output=>output.split(/\r?\n/).filter(x=>x.startsWith('{')||x.startsWith('[')).map(x=>JSON.parse(x));
const json=output=>{const result=rows(output);assert.ok(result.length,'Expected SQL JSON');return result.at(-1);};
function checkError(error,state='P0001',detail=null,message=null){
  assert.ok(error,`Expected ${state}/${detail}`);assert.match(error.stderr??'',new RegExp(`ERROR:\\s+${state}:`));
  if(detail)assert.match(error.stderr,new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  if(message)assert.ok(error.stderr.includes(message),error.stderr);refusals++;
}
async function refused(sql,...expected){let error;try{await psql(sql);}catch(e){error=e;}checkError(error,...expected);}
function fixture(n,status='reviewing'){
  return `insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,
    actor_member_id,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,status)
    values('${request(n)}','${reference(n)}','synthetic-disposition-key-${n}','synthetic-disposition-fp-${n}','${member(n)}',
    'synthetic-disposition-${n}@example.test','Synthetic Disposition Buyer','+10000000000',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',true,'early_access_manual_order_bridge','${status}');
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
    quantity_increment,workflow_mode,customer_action_label,unit_price_cents,line_estimate_cents,catalog_version,authoritative_fingerprint)
    values('${line(n)}','${request(n)}','P-SYNTHETIC-${n}','V-SYNTHETIC-${n}','Synthetic test item',2,1,1,'direct_order_request',
    'Request order',2500,5000,'synthetic-cat','synthetic-fp');`;
}
const statusExpr=(n,from,to,evidence={})=>`public.research_assisted_order_set_status('${request(n)}','${from}','${to}','synthetic-admin','admin',null,null,${j(evidence)})`;
async function setup(n){
  await psql(fixture(n));
  const offer=json(await psql(service(`select public.research_assisted_order_quote_issue('${request(n)}','[{"lineId":"${line(n)}"}]',now()+interval '1 day','synthetic-admin')::text;`)));
  quotes.set(n,offer.quoteId);
  await psql(service(`select public.research_assisted_order_quote_accept('${offer.quoteId}',1,5000,'${member(n)}');
    select ${statusExpr(n,'reviewing','payment_pending')};select ${statusExpr(n,'payment_pending','payment_review')};`));
  return offer.quoteId;
}
const observeExpr=(n,amount=5000,source=`synthetic-evidence-${n}`,at="'2026-01-01T00:00:00Z'")=>
  `public.research_assisted_order_payment_observe('${request(n)}','${quotes.get(n)}','manual',${amount},'USD','${reference(n)}',${q(source)},${at},'${actor}')`;
async function observe(n,amount=5000){const receipt=json(await psql(service(`select ${observeExpr(n,amount)}::text;`)));observations.set(n,receipt.observationId);return receipt;}
const correctExpr=(n,old,source=`synthetic-corrected-${n}`)=>`public.research_assisted_order_payment_correct_manual('${request(n)}','${old}','${actor}',
  '${quotes.get(n)}','${reference(n)}',5000,'USD',${q(source)},'2026-01-02T00:00:00Z','Synthetic corrected observation')`;
const verifyExpr=n=>`public.research_assisted_order_payment_verify_bound('${request(n)}','${observations.get(n)}','${actor}')`;
const context=async(n,who=actor,source=namespace)=>json(await psql(service(`select ${prefix}context('${request(n)}',${q(who)},${q(source)})::text;`)));
async function command(n,receiptId=`synthetic-no-funds-${n}`){
  const c=await context(n);const checkedAt=await psql(`select to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');`);
  const receipt={schemaVersion:'assisted_order_no_funds_receipt_v1',sourceNamespace:namespace,sourceReceiptId:receiptId,
    requestId:c.requestId,quoteId:c.quoteId,graphFingerprint:c.graphFingerprint,outcome:'never_received',finality:'terminal',checkedAt};
  return {context:c,receipt,key:createHash('sha256').update(JSON.stringify(['assisted-order-no-funds:v1',namespace,receiptId,c.requestId,c.graphFingerprint])).digest('hex')};
}
const commitExpr=(cmd,overrides={})=>{
  const input={requestId:cmd.context.requestId,quoteId:cmd.context.quoteId,fingerprint:cmd.context.graphFingerprint,actor,key:cmd.key,intent:'cancel',receipt:cmd.receipt,...overrides};
  return `${prefix}commit_cancel(${q(input.requestId)},${q(input.quoteId)},${q(input.fingerprint)},${q(input.actor)},${q(input.key)},${q(input.intent)},${j(input.receipt)})`;
};
const commitSql=(...args)=>service(`select ${commitExpr(...args)}::text;`);
const counts=async()=>json(await psql(`select json_build_object('observations',(select count(*) from public.research_assisted_order_payment_observations),
  'corrections',(select count(*) from public.research_assisted_order_observation_corrections),'claims',(select count(*) from public.research_assisted_order_evidence_claims),
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications),'events',(select count(*) from public.research_assisted_order_events),
  'evidence',(select count(*) from public.research_assisted_order_no_funds_evidence),'dispositions',(select count(*) from public.research_assisted_order_financial_dispositions),
  'outbox',(select count(*) from public.research_notification_outbox),'audit',(select count(*) from public.research_assisted_order_audit_events_v1))::text;`));
async function lockedRace(firstSql,secondSql,expected=null){
  const first=startSql(`begin;${firstSql}\nselect 'synthetic-lock-held';select pg_sleep(2);commit;`,'synthetic-lock-held');await first.marked;
  const peer=startSql(`set application_name='synthetic-no-funds-peer';${secondSql}`);
  let blocked=false;
  for(let n=0;n<15;n++){if(await psql("select count(*) from pg_stat_activity where application_name='synthetic-no-funds-peer' and wait_event_type='Lock';")==='1'){blocked=true;break;}await new Promise(r=>setTimeout(r,50));}
  assert.equal(blocked,true,'Peer must wait on real row lock');await first.done;
  let value,error;try{value=await peer.done;}catch(e){error=e;}
  if(expected)checkError(error,...expected);else if(error)throw error;races++;return value?json(value):null;
}
const canonical=value=>Array.isArray(value)?`[${value.map(canonical).join(',')}]`:value!==null&&typeof value==='object'?
  `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`:JSON.stringify(value);
const effectsContext=async receipt=>json(await psql(service(`select ${prefix}effects_context('${receipt.dispositionId}')::text;`)));
const outbox=async receipt=>json(await psql(`select row_to_json(o)::text from public.research_notification_outbox o where assisted_order_disposition_id='${receipt.dispositionId}';`));
function auditEvent(c,keyId='synthetic1'){
  const alias=createHmac('sha256',Buffer.alloc(32,keyId==='synthetic1'?1:2)).update('xenios:assisted-order-audit-actor:v1\u0000admin\u0000').update(c.resolvedBy.normalize('NFKC').toLowerCase()).digest('hex');
  const body={eventKey:`assisted-order-audit:v1:${c.dispositionId}`,eventType:'assisted_order.status_changed',requestId:c.requestId,
    actorType:'admin',actorAlias:`aa1:${keyId}:${alias}`,evidence:{from:c.fromStatus,to:'cancelled',authorityEvidenceKinds:['cancellation_reason_present']},occurredAt:c.resolvedAt};
  return {eventId:c.dispositionId,eventFingerprint:createHash('sha256').update(canonical(body)).digest('hex'),...body};
}
const completeSql=(receipt,event)=>service(`select ${prefix}effects_complete('${receipt.dispositionId}','${schema}','${attestation}',${j(event)})::text;`);
const readySql=row=>service(`select ${prefix}effects_outbox_ready(${q(row.id)},${q(row.assisted_order_disposition_id)},${q(row.event_key)},${q(row.recipient)},${q(row.template_key)},${j(row.payload)});`);
const startedAt=performance.now();
try{
  const started=await runFile('docker',['run','-d','--rm','--name',`xenios-hl12-no-funds-${process.pid}-local`,'--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust','postgres:17-alpine'],{windowsHide:true});
  containerId=started.stdout.trim();assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;for(let n=0;n<40;n++){try{await runFile('docker',['exec',containerId,'pg_isready','-U','postgres'],{windowsHide:true});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}assert.ok(ready);
  console.log(`Runtime ${process.version}; PostgreSQL ${await psql('show server_version;')}; synthetic only/no network/no published ports`);
  for(const path of predecessors.slice(0,2))await psql(await readFile(path,'utf8'));
  await psql(`${fixture(90,'paid')}${fixture(91)}insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence) values('${request(91)}','paid','admin','synthetic-history','{}');`);
  for(const path of predecessors.slice(2,7))await psql(await readFile(path,'utf8'));
  await psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by) values('${actor}','${actorLabel}','synthetic-owner');`);
  await setup(92);
  await psql(service(`select public.research_assisted_order_payment_observe('${request(92)}','${quotes.get(92)}','provider',5000,'USD','synthetic-provider-payment','synthetic-provider-evidence',now(),null,'synthetic-unconfigured','synthetic-event','synthetic-provider-payment');`));
  for(const path of predecessors.slice(7))await psql(await readFile(path,'utf8'));
  await psql('create schema extensions;create extension pgcrypto with schema extensions;');
  await psql(await readFile('supabase/research-notification-outbox.sql','utf8'));
  // Synthetic hosted-role model, not a managed ACL claim. Existing canonical
  // worker uses direct outbox DML; private financial tables must still revoke
  // even these permissive defaults in every new pending migration.
  await psql(`alter role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    grant select,insert,update,delete,truncate on public.research_notification_outbox,public.research_notification_attempts to service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  for(const path of ['20261001040349_research_assisted_order_quote_audit_store.sql','20261001040351_research_assisted_order_quote_effects.sql','20261001044200_research_assisted_order_quote_history_reissue.sql'])await psql(await readFile(`supabase/migrations/${path}`,'utf8'));
  await setup(1);await observe(1,4999);
  await refused(service(`select ${statusExpr(1,'payment_review','cancelled',{cancellationReason:'Synthetic cancellation'})};`),'P0001','ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY');
  console.log('BEFORE PASS observed cancellation remains held; no terminal source authority exists on predecessor.');
  console.log('PRECHECK '+await psql(precheck));
  const immutableFns="'research_assisted_order_quote_issue','research_assisted_order_quote_accept','research_assisted_order_payment_observe','research_assisted_order_payment_verify','research_assisted_order_payment_verify_bound','research_assisted_order_payment_correct_manual','research_assisted_order_financial_state','research_assisted_order_payment_effects_capture','research_assisted_order_payment_effects_complete'";
  const fingerprintSql=`select md5(string_agg(pg_get_functiondef(oid),'' order by oid)) from pg_proc where proname in (${immutableFns});`;
  const priorFingerprint=await psql(fingerprintSql);
  for(const change of ['alter table public.research_assisted_order_payment_observations disable trigger research_assisted_order_observation_immutable;',
    'drop trigger hl12_correction_immutable on public.research_assisted_order_observation_corrections;',
    'alter table public.research_assisted_order_events enable replica trigger research_assisted_order_events_append_only;'])
    await refused(`begin;${change}${migration}`,'55000',null,'No-funds prerequisite guard missing or ineffective');
  await psql(migration);await psql(migration);await psql(postcheck);
  assert.equal(await psql(fingerprintSql),priorFingerprint);
  assert.equal(await psql('select count(*) from public.research_assisted_order_no_funds_grants;'),'0');
  await refused(service(`select ${prefix}context('${request(1)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED');
  await psql(`insert into public.research_assisted_order_no_funds_grants(auth_user_id,source_namespace,actor_label,granted_by) values('${actor}','${namespace}','${actorLabel}','synthetic-owner');`);
  await refused(service(`select ${prefix}context('${request(1)}','${actor}','wrong-source');`),'P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED');
  console.log('AFTER PASS exact migration/reapply, empty install grants, predecessor guard drift refusal, unchanged quote/payment/F4 bodies and canonical financial_state.');

  const first=await command(1),beforeBad=await counts();
  for(const [field,value] of [['outcome','refunded'],['outcome','net_zero'],['outcome','voided'],['finality','pending'],['requestId',request(2)],['quoteId',id(9,3)],['graphFingerprint','f'.repeat(64)],['sourceNamespace','other-source'],['sourceReceiptId',' invalid'],['sourceReceiptId','bad\tvalue'],['checkedAt','2026-01-01T00:00:00Z'],['checkedAt','2026-01-01T00:00:00.000+00:00'],['checkedAt','2099-01-01T00:00:00.000Z']]){
    const detail=field==='sourceNamespace'?'ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED':'ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID';
    await refused(commitSql(first,{receipt:{...first.receipt,[field]:value}}),'P0001',detail);
  }
  await refused(commitSql(first,{receipt:{...first.receipt,extra:true}}),'P0001','ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID');
  for(const intent of ['void','refund','resolve'])await refused(commitSql(first,{intent}),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  await refused(commitSql(first,{actor:otherActor}),'P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED');
  await refused(commitSql(first,{actor:null}),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  await refused(commitSql(first,{receipt:{...first.receipt,checkedAt:'2026-01-01T00:00:00.000Z'}}),'P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE');
  assert.deepEqual(await counts(),beforeBad);
  await refused(`begin;${commitSql(first)}select 1/0;`,'22012');assert.deepEqual(await counts(),beforeBad);
  const success=json(await psql(commitSql(first)));assert.equal(success.replayed,false);assert.equal(success.state,'cancelled');
  assert.equal(success.resolvedBy,actorLabel);assert.equal((await effectsContext(success)).state,'pending');assert.equal((await outbox(success)).status,'held');
  assert.equal(await psql(readySql(await outbox(success))),'f');
  const afterSuccess=await counts();assert.equal(afterSuccess.evidence,1);assert.equal(afterSuccess.dispositions,1);assert.equal(afterSuccess.verifications,0);
  assert.equal(json(await psql(commitSql(first))).replayed,true);assert.deepEqual(await counts(),afterSuccess);
  await refused(commitSql(first,{receipt:{...first.receipt,sourceReceiptId:'changed'}}),'P0001','ASSISTED_ORDER_NO_FUNDS_REPLAY_CONFLICT');
  console.log('AFTER PASS positive never_received/terminal explicit cancellation, exact source/actor/quote/graph/time, transaction rollback, immutable receipt replay and held canonical effect.');

  await setup(2);const second=await command(2,first.receipt.sourceReceiptId);
  await refused(commitSql(second),'P0001','ASSISTED_ORDER_NO_FUNDS_EVIDENCE_REUSED');
  for(const n of [90,91,92])await refused(service(`select ${prefix}context('${request(n)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  await setup(3);await observe(3);await psql(service(`select ${verifyExpr(3)};`));
  await refused(service(`select ${prefix}context('${request(3)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  assert.deepEqual(json(await psql(service(`select public.research_assisted_order_financial_state('${request(1)}')::text;`))),{hasObservation:true,paymentVerified:false});
  await refused(service(`select ${verifyExpr(1)};`),'P0001');
  await refused(service(`select ${observeExpr(1,5000,'new-after-terminal')};`),'P0001');
  await refused(service(`select ${correctExpr(1,observations.get(1))};`),'P0001');
  await refused(`update public.research_assisted_order_requests set status='supplier_processing' where id='${request(1)}';`,'P0001','ASSISTED_ORDER_FINANCIAL_DISPOSITION_TERMINAL');
  const beforeReplay=await counts();assert.equal(json(await psql(service(`select ${observeExpr(1,4999)}::text;`))).replayed,true);assert.deepEqual(await counts(),beforeReplay);
  for(const table of ['no_funds_evidence','financial_dispositions','payment_observations','payment_verifications','observation_corrections','evidence_claims','events'])
    await refused(`truncate public.research_assisted_order_${table} cascade;`,'P0001');
  for(const table of ['no_funds_evidence','financial_dispositions']){
    await refused(`update public.research_assisted_order_${table} set request_id=request_id;`,'P0001','ASSISTED_ORDER_DISPOSITION_IMMUTABLE');
    await refused(`delete from public.research_assisted_order_${table};`,'P0001','ASSISTED_ORDER_DISPOSITION_IMMUTABLE');
  }
  await refused(`insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence) values('${request(2)}','cancelled','admin','synthetic',jsonb_build_object('financialDispositionId','${success.dispositionId}'));`,'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  await refused(`insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence) values('${request(1)}','cancelled','admin','synthetic','{}');`,'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  console.log('AFTER PASS paid/history/provider and unsupported authority held; original claims retained, harmless old observation replay, no revival/new verification and graph/event TRUNCATE/CASCADE denied.');

  // Source graph changes during independent adapter lookup invalidate commit.
  await setup(4);const stale=await command(4);await observe(4,4999);
  await refused(commitSql(stale),'P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE');
  const beforeCorrection=await command(4);const corrected=json(await psql(service(`select ${correctExpr(4,observations.get(4))}::text;`)));
  await refused(commitSql(beforeCorrection),'P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE');
  const correctedCommand=await command(4);assert.equal(correctedCommand.context.observations.length,2);assert.equal(correctedCommand.context.corrections.length,1);
  const correctedSuccess=json(await psql(commitSql(correctedCommand)));const correctionCounts=await counts();
  assert.equal(json(await psql(service(`select ${correctExpr(4,observations.get(4))}::text;`))).replayed,true);assert.deepEqual(await counts(),correctionCounts);
  // Direct-owner receipt insert cannot bypass validation even before disposition.
  const direct=await command(2,'synthetic-direct');
  await refused(`insert into public.research_assisted_order_no_funds_evidence(request_id,quote_id,source_namespace,source_receipt_id,graph_fingerprint,outcome,finality,checked_at,actor_auth_user_id,receipt)
    values('${request(2)}','${quotes.get(2)}','${namespace}','synthetic-direct','${direct.context.graphFingerprint}','never_received','terminal',now(),'${actor}','{}');`,'P0001','ASSISTED_ORDER_NO_FUNDS_RECEIPT_INVALID');
  await setup(5);await psql(service(`select ${observeExpr(5,5000,'future-source',"now()+interval '1 day'")};`));
  await refused(commitSql(await command(5)),'P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE');
  await setup(6);await psql(`insert into public.research_assisted_order_evidence_claims(method,provider_namespace,evidence_ref,request_id) values('manual','','synthetic-orphan','${request(6)}');`);
  await refused(service(`select ${prefix}context('${request(6)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');
  console.log('AFTER PASS complete corrected graph binding, stale adapter snapshot, future source time, orphan retained claim and privileged invalid receipt refusal.');

  for(const n of [10,11,12,13,14,15,16,17,18,19,20,21,22,23])await setup(n);
  await observe(11,4999);await observe(12);await observe(14,4999);await observe(15);
  const cmd10=await command(10);
  await lockedRace(service(`select ${commitExpr(cmd10)};`),service(`select ${observeExpr(10)};`),['P0001']);
  const cmd11=await command(11);
  await lockedRace(service(`select ${correctExpr(11,observations.get(11))};`),commitSql(cmd11),['P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE']);
  const cmd12=await command(12);
  await lockedRace(service(`select ${verifyExpr(12)};`),commitSql(cmd12),['P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED']);
  const cmd13=await command(13);
  await lockedRace(service(`select ${statusExpr(13,'payment_review','cancelled',{cancellationReason:'Synthetic ordinary cancellation'})};`),commitSql(cmd13),['P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED']);
  const cmd14=await command(14);
  await lockedRace(service(`select ${commitExpr(cmd14)};`),service(`select ${correctExpr(14,observations.get(14))};`),['P0001']);
  const cmd15=await command(15);
  await lockedRace(service(`select ${commitExpr(cmd15)};`),service(`select ${verifyExpr(15)};`),['P0001']);
  const cmd16=await command(16),competing={...cmd16,key:'a'.repeat(64),receipt:{...cmd16.receipt,sourceReceiptId:'synthetic-competing'}};
  await lockedRace(service(`select ${commitExpr(cmd16)};`),commitSql(competing),['P0001','ASSISTED_ORDER_NO_FUNDS_REPLAY_CONFLICT']);
  const cmd17=await command(17);
  await lockedRace(`update public.research_assisted_order_no_funds_grants set revoked_at=now() where auth_user_id='${actor}';`,commitSql(cmd17),['P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED']);
  await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=null where auth_user_id='${actor}';`);
  const cmd18=await command(18);
  await lockedRace(service(`select ${commitExpr(cmd18)};`),`update public.research_assisted_order_no_funds_grants set revoked_at=now() where auth_user_id='${actor}';select '{}'::jsonb;`);
  await refused(service(`select ${prefix}context('${request(18)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED');
  assert.equal(json(await psql(commitSql(cmd18))).replayed,true);
  await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=null where auth_user_id='${actor}';`);
  const cmd21=await command(21);
  await lockedRace(service(`select ${observeExpr(21)};`),commitSql(cmd21),['P0001','ASSISTED_ORDER_NO_FUNDS_CONTEXT_STALE']);
  const cmd22=await command(22,'synthetic-cross-request-source'),cmd23=await command(23,'synthetic-cross-request-source');
  await lockedRace(service(`select ${commitExpr(cmd22)};`),commitSql(cmd23),['23505']);
  assert.equal(await psql(`select count(*) from public.research_assisted_order_no_funds_evidence where source_receipt_id='synthetic-cross-request-source';`),'1');
  console.log(`AFTER PASS ${races} real lock-order races: observe/correct/verify/cancel/competing/revocation serialize; exact replay remains read-only after revocation.`);

  // Deferred replacement FK adversarial ordering: B replacement is invisible
  // when A inserts correction; B commits its own disposition before A commits.
  await observe(19,4999);
  const replacement=id(8,20),old19=observations.get(19);
  const b=startSql(`begin;insert into public.research_assisted_order_payment_observations(id,request_id,quote_id,method,observed_amount_cents,observed_currency,payment_reference,source_evidence_ref,observed_at,observed_by,observed_by_auth_user_id)
    values('${replacement}','${request(20)}','${quotes.get(20)}','manual',5000,'USD','${reference(20)}','synthetic-race-replacement','2026-01-01T00:00:00Z','${actorLabel}','${actor}');
    select 'replacement-invisible';select pg_sleep(2);commit;`,'replacement-invisible');
  await b.marked;
  const a=startSql(`begin;insert into public.research_assisted_order_observation_corrections(observation_id,replacement_id,reason,corrected_by)
    values('${old19}','${replacement}','Synthetic cross-order deferred race','${actor}');select 'edge-inserted';select pg_sleep(4);commit;`,'edge-inserted');
  await a.marked;await b.done;
  const terminal20=json(await psql(commitSql(await command(20))));assert.equal(terminal20.state,'cancelled');
  let edgeError;try{await a.done;}catch(e){edgeError=e;}checkError(edgeError,'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED');races++;
  assert.equal(await psql(`select count(*) from public.research_assisted_order_observation_corrections where observation_id='${old19}';`),'0');
  console.log('AFTER PASS exact invisible deferred replacement cross-request race rejected at commit; B terminal graph retained, normal same-request corrections already passed.');

  const c=await effectsContext(success),o=await outbox(success),event=auditEvent(c);
  for(const copy of ['Request cancelled. No funds were received for this request.',' REQUEST CANCELLED. NO FUNDS WERE RECEIVED FOR THIS REQUEST. ',
    '\tRequest cancelled. No funds were received for this request.\t','\u00a0Request cancelled. No funds were received for this request.\ufeff'])
    await refused(service(`insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
      values('synthetic-forged','assisted_order.status_changed','synthetic@example.test','research.assisted_order.status_changed.customer',${j({status:'cancelled',publicReference:reference(2),customerMessage:copy})});`),
      'P0001','ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT');
  await refused(service(`update public.research_notification_outbox set status='pending' where id='${o.id}';`),'P0001','ASSISTED_ORDER_DISPOSITION_EFFECTS_AUDIT_REQUIRED');
  for(const mutate of ["assisted_order_disposition_id=null","event_key='stripped'","payload='{}'","recipient='changed@example.test'"])
    await refused(service(`update public.research_notification_outbox set ${mutate} where id='${o.id}';`),'P0001','ASSISTED_ORDER_DISPOSITION_IMMUTABLE');
  for(const override of [{requestId:request(2)},{eventId:correctedSuccess.dispositionId},{occurredAt:'2026-01-01T00:00:00.000Z'},{evidence:{from:'paid',to:'cancelled',authorityEvidenceKinds:['cancellation_reason_present']}}])
    await refused(completeSql(success,{...event,...override}),'P0001','ASSISTED_ORDER_DISPOSITION_EFFECTS_CONFLICT');
  const beforeEffects=await counts();await refused(`begin;${completeSql(success,event)}select 1/0;`,'22012');assert.deepEqual(await counts(),beforeEffects);
  await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=now() where auth_user_id='${actor}';`);
  const results=(await Promise.all([psql(completeSql(success,event)),psql(completeSql(success,auditEvent(c,'synthetic2')))])).map(json);races++;
  assert.deepEqual(results[0],results[1]);assert.equal(results[0].state,'complete');assert.equal(results[0].outboxStatus,'pending');
  assert.deepEqual(json(await psql(completeSql(success,null))),results[0]);assert.equal(await psql(readySql(await outbox(success))),'t');
  assert.equal(await psql(readySql({...await outbox(success),assisted_order_disposition_id:null})),'f');
  await refused(service(`select ${prefix}context('${request(1)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_GRANT_REQUIRED');
  assert.equal(json(await psql(commitSql(first))).replayed,true);
  await psql(`update public.research_assisted_order_no_funds_grants set revoked_at=null where auth_user_id='${actor}';`);
  console.log('AFTER PASS held audit-before-send, immutable outbox, wrong audit binding, interrupted completion rollback, revoked-grant recovery and concurrent rotated-HMAC replay.');

  for(const role of ['anon','authenticated'])for(const call of [`context('${request(1)}','${actor}','${namespace}')`,`commit_cancel(null,null,null,null,null,null,null)`,`effects_authority()`,`effects_context('${success.dispositionId}')`,`effects_pending(null,null,1)`,`effects_complete(null,null,null,null)`,`effects_outbox_ready(null,null,null,null,null,null)`])
    await refused(`set role ${role};select ${prefix}${call};`,'42501');
  for(const role of ['anon','authenticated','service_role']){
    for(const table of ['no_funds_grants','no_funds_evidence','financial_dispositions'])await refused(`set role ${role};select * from public.research_assisted_order_${table};`,'42501');
    await refused(`set role ${role};select ${prefix}graph('${request(1)}');`,'42501');
  }
  for(const drift of [`drop function ${prefix}effects_pending(timestamptz,uuid,integer);`,`alter function ${prefix}effects_pending(timestamptz,uuid,integer) reset all;`,
    `create function ${prefix}effects_pending(integer) returns jsonb language sql security definer set search_path='' as 'select null::jsonb';grant execute on function ${prefix}effects_pending(integer) to service_role;`,
    'alter table public.research_assisted_order_financial_dispositions enable replica trigger hl12_disposition_capture;',
    'alter table public.research_assisted_order_evidence_claims disable trigger hl12_claim_immutable;']){
    await refused(`begin;${drift}${postcheck}`,'55000');await psql(postcheck);
  }
  console.log('AFTER PASS actual service-only RPC ACL, inaccessible helpers/tables, missing signature/search_path/replica/prerequisite postcheck drift refusal.');
  await setup(70);
  await psql(`insert into public.research_assisted_order_evidence_claims(method,provider_namespace,evidence_ref,request_id)
    select 'manual','','synthetic-bound-'||n,'${request(70)}'::uuid from generate_series(1,101)n;`);
  await refused(service(`select ${prefix}context('${request(70)}','${actor}','${namespace}');`),'P0001','ASSISTED_ORDER_NO_FUNDS_REFUSED','Financial graph exceeds the bounded qualification contract');
  let cursor=null;const pending=[];
  for(let page=0;page<30;page++){
    const batch=json(await psql(service(`select ${prefix}effects_pending(${q(cursor?.createdAt)},${q(cursor?.outboxId)},3)::text;`)));
    if(!batch.length)break;
    for(const row of batch){assert.match(row.createdAt,/\.\d{3}Z$/);assert.ok(!pending.some(prior=>prior.outboxId===row.outboxId));pending.push(row);}
    cursor=batch.at(-1);
  }
  assert.equal(pending.length,Number(await psql('select count(*) from public.research_notification_outbox where assisted_order_disposition_id is not null and status=\'held\';')));
  await refused(service(`select ${prefix}effects_pending(null,'${success.dispositionId}',1);`),'22023');
  await refused(service(`select ${prefix}effects_pending(null,null,101);`),'22023');
  console.log('AFTER PASS graph overflow refuses without truncation; bounded millisecond keyset pages enumerate every held intent exactly once.');
  // Composed real mounted HTTP/service/SQL parity, synthetic injected auth and
  // independent evidence; helper never creates another container or network.
  for(let n=500;n<510;n++)await setup(n);
  const http=await runFile(process.execPath,['--import','tsx',`${stem}_http.ts`,containerId,'500'],{windowsHide:true,maxBuffer:4*1024*1024});
  process.stdout.write(http.stdout);if(http.stderr)process.stderr.write(http.stderr);
  await psql(postcheck);
  console.log('FINAL COUNTS '+JSON.stringify(await counts()));
  console.log(`PASS local N2 proof; refusals=${refusals}; races=${races}; elapsed_ms=${Math.round(performance.now()-startedAt)}; migration_sha256=${createHash('sha256').update(migration).digest('hex')}`);
}catch(error){console.error('FAIL local N2 proof',error);process.exitCode=1;}
finally{
  if(containerId){await runFile('docker',['rm','-f',containerId],{windowsHide:true});console.log('CLEANUP removed exact disposable no-network container');}
}
