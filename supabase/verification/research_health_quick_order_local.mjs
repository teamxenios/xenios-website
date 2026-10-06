/**
 * SOURCE ONLY / NOT RUN. Synthetic PostgreSQL companion/readback checks.
 * Not atomic intake, production Auth, currentness, liveness or notification proof.
 * Requires separate execution authority and an externally SHA256-pinned receipt.
 * Never accepts a database URL, hosted target, provider adapter or email transport.
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CANDIDATE = 'supabase/candidates/20261005_research_health_quick_order_intake';
const SELF = 'supabase/verification/research_health_quick_order_local.mjs';
const BINDINGS = 'docs/health-launch/quick-order-20261005/evidence/review-cleared-draft-bindings-20261006.json';
const OWN = [CANDIDATE+'.sql', CANDIDATE+'.precheck.sql', CANDIDATE+'.postcheck.sql', CANDIDATE+'.rollback.md', SELF];
const BOOTSTRAP = 'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql';
const OUTBOX = 'supabase/research-notification-outbox.sql';
const MIGRATIONS = [
  '20260815150000_research_assisted_order_bridge.sql',
  '20260820190000_research_assisted_order_declared_affiliate_code.sql',
  '20260927203000_research_status_recovery.sql',
  '20260930191323_research_assisted_order_quote_payment_guard.sql',
  '20260930193033_research_assisted_order_quote_paid_hold.sql',
  '20260930202413_research_assisted_order_quote_payment_authority.sql',
  '20260930205725_research_assisted_order_quote_access_finance_bound.sql',
  '20260930230541_research_assisted_order_quote_evidence_corrections.sql',
  '20260930234614_research_assisted_order_quote_provider_hold.sql',
  '20261001024018_research_assisted_order_quote_history_immutability.sql',
  '20261001040349_research_assisted_order_quote_audit_store.sql',
  '20261001040351_research_assisted_order_quote_effects.sql',
  '20261001044200_research_assisted_order_quote_history_reissue.sql',
  '20261001062651_research_assisted_order_quote_no_funds_disposition.sql',
  '20261001085559_research_assisted_order_quote_provider_journal.sql',
  '20261001102904_research_assisted_order_quote_provider_execution.sql',
  '20261001115512_research_assisted_order_quote_provider_settlement.sql',
  '20261001160730_research_assisted_order_provider_quarantine_isolation.sql',
].map(name => 'supabase/migrations/'+name);
const held = [
  'atomic canonical request/line/event/companion/receipt/outbox commit',
  'authenticated actor/key derivation and standing/legal/Health admission',
  'guarded catalog/legal/destination authority currentness and classification truth',
  'concurrent writers, lock boundaries, epoch scope and liveness',
  'lost-response/restart commit durability and changed-input conflict',
  'real adapter/decoder end-to-end qualification and classification display',
  'notification dispatcher transport/retry/delivery and operational intake',
  'owner-resistant immutability (no mutation/truncate guards are authored)',
];
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const lf = text => text.replaceAll('\r\n','\n');
const quote = value => value === null ? 'null' : "'"+String(value).replaceAll("'","''")+"'";
const j = value => quote(JSON.stringify(value))+'::jsonb';
const childEnv = Object.fromEntries(['PATH','SystemRoot','WINDIR','TEMP','TMP','USERPROFILE','HOME']
  .filter(key => process.env[key] !== undefined).map(key => [key,process.env[key]]));
const outputLimit = 4*1024*1024;
const activeChildren=new Set();
let interrupted=null;
const interrupt=signal=>{interrupted=signal;process.exitCode=2;for(const child of activeChildren)child.kill();};
const onInt=()=>interrupt('SIGINT'),onTerm=()=>interrupt('SIGTERM');
process.on('SIGINT',onInt);process.on('SIGTERM',onTerm);
function run(command,args,{input='',timeout=30_000,allowAfterInterrupt=false}={}) {
  if(interrupted&&!allowAfterInterrupt) return Promise.reject(new Error('Interrupted before child launch'));
  return new Promise((resolve,reject) => {
    const child=spawn(command,args,{cwd:ROOT,env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
    activeChildren.add(child);
    const stdout=[],stderr=[]; let bytes=0,stopped=false,timedOut=false;
    const stop=()=>{if(!stopped){stopped=true;child.kill();}};
    const timer=setTimeout(()=>{timedOut=true;stop();},timeout);
    const collect=target=>chunk=>{bytes+=chunk.length;if(bytes>outputLimit){stop();return;}target.push(chunk);};
    child.stdout.on('data',collect(stdout)); child.stderr.on('data',collect(stderr));
    child.stdin.on('error',()=>{}); // Process error/close is the single result authority.
    child.on('error',error=>{clearTimeout(timer);activeChildren.delete(child);reject(error);});
    child.on('close',(code,signal)=>{
      clearTimeout(timer);activeChildren.delete(child);
      // Decode once after concatenation: UTF-8 characters may span chunks.
      const out=Buffer.concat(stdout).toString('utf8'),err=Buffer.concat(stderr).toString('utf8');
      if(code!==0||stopped||(interrupted&&!allowAfterInterrupt)) reject(Object.assign(new Error('Bounded child refused or failed'),
        {code,signal,timedOut,interrupted,stdout:out,stderr:err,outputLimitExceeded:bytes>outputLimit}));
      else resolve(out); // Preserve exact Git stdout, including every final newline.
    });
    child.stdin.end(input);
  });
}
function safeRelative(value) {
  assert.equal(typeof value,'string'); assert.ok(value.length>0 && value.length<500);
  assert.ok(!path.isAbsolute(value) && !value.includes('\\') && !value.split('/').includes('..'));
  assert.ok(!value.startsWith('-') && !value.includes(':'));
  const resolved=path.resolve(ROOT,value);
  assert.ok(resolved.startsWith(ROOT+path.sep)); return resolved;
}
function uniqueBlock(text,delimiter) {
  const sections=text.split(delimiter); assert.equal(sections.length,3,'Expected one literal source block');
  return sections[1];
}
const args=process.argv.slice(2);
assert.equal(args.length,7,'Explicit disposable flag and external receipt/hash/source commit required');
assert.equal(args[0],'--allow-disposable-intake'); assert.equal(args[1],'--receipt');
assert.equal(args[3],'--receipt-sha256'); assert.equal(args[5],'--source-commit');
assert.match(args[4],/^[a-f0-9]{64}$/); assert.match(args[6],/^[a-f0-9]{40}$/);
assert.equal(process.version,'v20.19.0','Use the reviewed isolated runtime; do not install one here');
const realRoot=await realpath(ROOT);
const contained=(file,dir)=>{
  const normalize=value=>process.platform==='win32'?value.toLowerCase():value;
  return normalize(file).startsWith(normalize(dir+path.sep));
};
const evidenceDirectory=await realpath(path.join(ROOT,'docs/health-launch/quick-order-20261005/evidence'));
assert.ok(contained(evidenceDirectory,realRoot));
assert.ok(args[2].startsWith('docs/health-launch/quick-order-20261005/evidence/')&&args[2].endsWith('.json'));
const receiptPath=await realpath(safeRelative(args[2]));
assert.ok(contained(receiptPath,evidenceDirectory),'Receipt must remain in the owned evidence directory');
const receiptBytes=await readFile(receiptPath);
assert.ok(receiptBytes.length<=1024*1024); assert.equal(sha(receiptBytes),args[4],'External receipt SHA mismatch');
const receipt=JSON.parse(receiptBytes.toString('utf8'));
assert.deepEqual(Object.keys(receipt).sort(),['files','schemaVersion','sourceCommit']);
assert.equal(receipt.schemaVersion,'quick-order-intake-source-receipt-v1');
assert.equal(receipt.sourceCommit,args[6]); assert.ok(Array.isArray(receipt.files));
const pinned=new Map();
for(const item of receipt.files) {
  assert.deepEqual(Object.keys(item).sort(),['path','sha256lf']);
  safeRelative(item.path); assert.match(item.sha256lf,/^[a-f0-9]{64}$/);
  assert.ok(!pinned.has(item.path),'Duplicate receipt path'); pinned.set(item.path,item.sha256lf);
}
const sources=new Map();
async function load(file) {
  assert.ok(pinned.has(file),'Consumed source missing from externally pinned receipt: '+file);
  if(sources.has(file))return sources.get(file);
  const sourcePath=await realpath(safeRelative(file));
  assert.ok(contained(sourcePath,realRoot),'Consumed source escaped repository');
  const disk=lf(await readFile(sourcePath,'utf8'));
  const git=lf(await run('git',['show',receipt.sourceCommit+':'+file]));
  assert.equal(sha(disk),pinned.get(file),'Current source differs: '+file);
  assert.equal(sha(git),pinned.get(file),'Receipt does not bind Git source: '+file);
  sources.set(file,disk); return disk;
}
for(const file of [...OWN,BINDINGS,BOOTSTRAP,OUTBOX,...MIGRATIONS])await load(file);
const bindings=JSON.parse(await load(BINDINGS));
assert.equal(bindings.review,'ca1c114a083793918b18d017b32509864ee4bcf6');
assert.match(bindings.base,/^[a-f0-9]{40}$/); assert.equal(bindings.inventory.length,55);
for(const item of bindings.inventory) {
  safeRelative(item.path);
  const historical=lf(await run('git',['show',bindings.base+':'+item.path]));
  assert.equal(sha(historical),item.sha256lf,'Historical predecessor binding differs: '+item.path);
  await load(item.path); // Current successor must have its own final-source pin.
}
const candidate=await load(CANDIDATE+'.sql');
const definitionHash=sha(uniqueBlock(candidate,'$qo_ddl$')+uniqueBlock(candidate,'$qo_fingerprint$'));
const rollbackText=await load(CANDIDATE+'.rollback.md');
const rollbackParts=rollbackText.split('```sql\n');
assert.equal(rollbackParts.length,2,'Exactly one reviewed rollback SQL fence is required');
const rollbackEnd=rollbackParts[1].split('```');
assert.equal(rollbackEnd.length,2,'Exactly one closing rollback SQL fence is required');
const rollback=rollbackEnd[0];
// The fenced rollback is the only SQL block; do not execute prose or a reconstruction.
assert.equal((rollbackText.match(/```sql\n/g)??[]).length,1);
const precheck=await load(CANDIDATE+'.precheck.sql'),postcheck=await load(CANDIDATE+'.postcheck.sql');
assert.equal(sha(uniqueBlock(precheck,'$qo_fingerprint$')),sha(uniqueBlock(candidate,'$qo_fingerprint$')));
assert.equal(sha(uniqueBlock(postcheck,'$qo_fingerprint$')),sha(uniqueBlock(candidate,'$qo_fingerprint$')));
assert.equal(sha(uniqueBlock(rollback,'$qo_fingerprint$')),sha(uniqueBlock(candidate,'$qo_fingerprint$')));

// Force a local daemon endpoint, ignoring inherited remote Docker contexts.
const endpoint=process.platform==='win32'?'npipe:////./pipe/docker_engine':'unix:///var/run/docker.sock';
const docker=(args,options)=>run('docker',['--host',endpoint,...args],options);
const invocation=randomUUID(),name='xenios-qo-intake-'+invocation,label='com.xenios.qo-intake-owner';
let containerId=null,launchAttempted=false,launchUncertain=false,checks=0;
const pass=label=>{checks++;process.stdout.write('INTAKE_READER_SUBSET PASS '+label+'\n');};
const psql=sql=>{
  assert.match(containerId??'',/^[a-f0-9]{64}$/);
  return docker(['exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-v','qo_intake_definition_sha256='+definitionHash,'-U','postgres','-d','postgres'],{
      input:'\\set VERBOSITY verbose\nset statement_timeout=\'20s\';\n'+sql+'\n',timeout:30_000});
};
const rows=text=>text.split(/\r?\n/).filter(line=>line.startsWith('{')||line.startsWith('[')).map(line=>JSON.parse(line));
const json=async sql=>{const values=rows(await psql(sql));assert.ok(values.length);return values.at(-1);};
async function refused(sql,state) {
  let error;try{await psql(sql);}catch(value){error=value;}
  assert.ok(error,'Expected SQL refusal');
  assert.equal(error.code,3,'Only normal psql ON_ERROR_STOP SQL refusals count');
  assert.equal(error.signal,null);assert.equal(error.timedOut,false);
  assert.equal(error.outputLimitExceeded,false);assert.equal(error.interrupted,null);
  assert.match(error.stderr??'',new RegExp('ERROR:\\s+'+state+':'));
}
const service=sql=>'set role service_role;'+sql;
const uuid=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const time='2026-10-06T12:00:00.123Z',payloadHash='a'.repeat(64),keyHash='b'.repeat(64);
const ref=n=>'XRR-20261006-'+n.toString(16).toUpperCase().padStart(10,'0');
const eventKey=n=>'assisted-order:'+uuid(n)+':quick-order-submitted:admin';
const actor='member:'+uuid(900);
function fixture(n,{companion=true,marker=true,outbox=true,markerValue='quick-order-v1',eventTime=time,requestTime=time,price=125}={}) {
  const estimate={knownSubtotalCents:price===null?0:price*2,estimateComplete:price!==null,currency:'USD'};
  const attribution={schemaVersion:'attribution-v1',source:'direct',sourceDetail:'',declaredAffiliateCode:null,
    affiliation:{kind:'none',detail:''},confirmedByCustomer:true,receivedAt:time,
    reviewState:'direct_no_referrer',commissionState:'not_authorized'};
  const receipt={schemaVersion:'quick-order-v1',requestId:uuid(n),publicReference:ref(n),payloadHash,
    attributionState:'direct_no_referrer',estimate};
  const classifications=[{schemaVersion:'quick-order-health-classification-v1',requestId:uuid(n),
    productId:'SYNTHETIC-P',variantId:'SYNTHETIC-V',payloadHash,decision:'health_requestable',
    sourceVersion:'synthetic-health-fixture-only',authorityRevisionId:uuid(901)}];
  return `insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,
    request_fingerprint,actor_member_id,normalized_email,full_legal_name,mobile_phone,
    shipping_address,billing_address,age_confirmed,agreements,estimated_total_cents,currency,status,source,created_at,updated_at)
    values('${uuid(n)}','${ref(n)}','synthetic-quick-order-key-${n}','${payloadHash}','${uuid(900)}',
    'synthetic-buyer@example.invalid','Synthetic Buyer','+10000000000',
    '{"line1":"1 Synthetic Way","city":"Austin","region":"TX","postalCode":"78701","countryCode":"US"}',
    '{"line1":"1 Synthetic Way","city":"Austin","region":"TX","postalCode":"78701","countryCode":"US"}',
    true,'[]',${price===null?'null':price*2},'USD','submitted','early_access_manual_order_bridge',
    ${quote(requestTime)}::timestamptz,${quote(time)}::timestamptz);
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,
    quantity,minimum_quantity,maximum_quantity,quantity_increment,workflow_mode,customer_action_label,
    unit_price_cents,line_estimate_cents,currency,catalog_version,research_use_only,authoritative_fingerprint)
    values('${uuid(n+1000)}','${uuid(n)}','SYNTHETIC-P','SYNTHETIC-V','Synthetic fixture only',
    2,1,50,1,'${price===null?'request_pricing':'direct_order_request'}','Request',
    ${price??'null'},${price===null?'null':price*2},'USD','synthetic-catalog',false,'synthetic-line');
    ${marker?`insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence,occurred_at)
      values('${uuid(n)}','submitted','member','${uuid(900)}',
      ${j(markerValue===null?{payloadHash}:{intakeKind:markerValue,payloadHash})},${quote(eventTime)}::timestamptz);`:''}
    ${outbox?`insert into public.research_notification_outbox(event_key,event_type,channel,recipient,template_key,payload,status,next_attempt_at)
      values(${quote(eventKey(n))},'assisted_order.submitted','email','synthetic-operator@example.invalid',
      'research.assisted_order.quick_order.submitted.admin.v1',
      ${j({schemaVersion:'quick-order-v1',requestId:uuid(n),publicReference:ref(n)})},'pending','2026-10-06T12:00:00.123456Z');`:''}
    ${companion?`insert into public.research_health_quick_order_intakes(request_id,actor_scope,key_hash,payload_hash,
      received_at,attribution_snapshot,request_acknowledged,receipt,classifications,notification_recipient)
      values('${uuid(n)}',${quote(actor)},${quote(n===1?keyHash:sha('synthetic-key-'+n))},'${payloadHash}',
      ${quote(time)}::timestamptz,${j(attribution)},true,${j(receipt)},${j(classifications)},'synthetic-operator@example.invalid');`:''}`;
}
const detail=n=>'select public.research_health_quick_order_admin_detail('+quote(uuid(n))+')::text;';
const integrity='select public.research_assisted_order_provider_settlement_integrity();';
const fingerprint='select public.research_assisted_order_provider_schema_fingerprint();';
async function boundary(expected) {
  await psql(integrity);assert.equal((await psql(fingerprint)).trim(),expected);
}
async function cleanup() {
  if(!launchAttempted)return;
  let inspected;
  try {inspected=JSON.parse(await docker(['inspect',name,'--format','{{json .}}'],{allowAfterInterrupt:true}));}
  catch(error) {
    if(/No such (object|container)/i.test(error.stderr??'')&&!launchUncertain)return;
    throw new Error('Owned container cleanup unresolved; inspect only '+name+' / label '+invocation);
  }
  assert.equal(inspected.Name,'/'+name); assert.equal(inspected.Config?.Labels?.[label],invocation);
  assert.match(inspected.Id,/^[a-f0-9]{64}$/);
  if(containerId!==null)assert.equal(inspected.Id,containerId);
  await docker(['rm','-f',inspected.Id],{allowAfterInterrupt:true});
}
let failure;
try {
  process.stdout.write('INTAKE_READER_SOURCE '+JSON.stringify({sourceCommit:receipt.sourceCommit,
    receiptSha256:args[4],definitionHash,syntheticOnly:true,held})+'\n');
  const image=JSON.parse(await docker(['image','inspect','postgres:17-alpine']))[0];
  assert.match(image.Id,/^sha256:[a-f0-9]{64}$/);
  launchAttempted=true; // Name+random ownership label exist before daemon dispatch.
  try {
    containerId=(await docker(['run','-d','--rm','--pull=never','--name',name,'--label',label+'='+invocation,
      '--network','none','--tmpfs','/var/lib/postgresql/data','-e','POSTGRES_HOST_AUTH_METHOD=trust',
      image.Id],{timeout:30_000})).trim();
    assert.match(containerId,/^[a-f0-9]{64}$/);
  } catch(error) {launchUncertain=true;throw error;}
  const inspected=JSON.parse(await docker(['inspect',containerId,'--format','{{json .}}']));
  assert.equal(inspected.Config?.Labels?.[label],invocation);
  assert.equal(inspected.HostConfig.NetworkMode,'none');
  assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
  assert.ok(Object.hasOwn(inspected.HostConfig.Tmpfs??{},'/var/lib/postgresql/data'));
  let ready=false;
  for(let n=0;n<30;n++) {
    try{await docker(['exec',containerId,'pg_isready','-U','postgres'],{timeout:2_000});ready=true;break;}
    catch{await new Promise(resolve=>setTimeout(resolve,200));}
  }
  assert.ok(ready,'Owned disposable PostgreSQL did not become ready');
  assert.match((await psql('show server_version;')).trim(),/^17\.11(?:\D|$)/);
  await psql(await load(BOOTSTRAP));
  await psql('create schema extensions;create extension pgcrypto with schema extensions;');
  await psql(await load(MIGRATIONS[0]));await psql(await load(MIGRATIONS[1]));
  await psql(await load(MIGRATIONS[2]));
  for(const file of MIGRATIONS.slice(3,10))await psql(await load(file));
  await psql(await load(OUTBOX));
  // Original outbox fixture access needed by the canonical baseline.
  await psql(`alter role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    grant select,insert,update,delete,truncate on public.research_notification_outbox,public.research_notification_attempts to service_role;`);
  for(const file of MIGRATIONS.slice(10))await psql(await load(file));
  // Stress only the new candidate's revokes, after every predecessor is created.
  await psql(`alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  const before=(await psql(fingerprint)).trim();
  await boundary(before);await psql(precheck);await psql(candidate);await psql(postcheck);await boundary(before);
  await psql(candidate);await psql(postcheck);await boundary(before);
  pass('exact absent install and identical reapply preserve provider integrity/fingerprint and all 14 trigger states');
  await psql(rollback);await psql(precheck);await boundary(before);
  await psql(rollback);await boundary(before);await psql(candidate);await psql(postcheck);
  pass('empty exact rollback and absent rollback preserve canonical state; installation can be reapplied');
  for(const role of ['anon','authenticated']) {
    await refused('set role '+role+';'+detail(999),'42501');
    await refused('set role '+role+";select public.research_health_quick_order_replay('"+actor+"','"+keyHash+"');",'42501');
  }
  await refused(service('select * from public.research_health_quick_order_intakes;'),'42501');
  await refused(service('delete from public.research_health_quick_order_intakes;'),'42501');
  await refused(service('truncate public.research_health_quick_order_intakes;'),'42501');
  await refused(service("select public.research_health_quick_order_intake_closed('{}',array[]::text[]);"),'42501');
  pass('client roles cannot call readers; service role has no table/helper/write surface');
  await refused('begin;alter table public.research_health_quick_order_intakes add column drift text;'+candidate,'55000');
  await refused('begin;grant select on public.research_health_quick_order_intakes to authenticated;'+candidate,'55000');
  await refused('begin;alter function public.research_health_quick_order_admin_detail(uuid) security invoker;'+candidate,'55000');
  await psql(postcheck);await boundary(before);
  pass('changed schema/ACL/function definition refuses reapply without repair');
  await psql('begin;'+fixture(10,{companion:false,marker:false,outbox:false})+'commit;');
  const canonical=await json('select public.research_assisted_order_admin_get('+quote(uuid(10))+')::text;');
  assert.equal(Object.keys(canonical).length,20);
  const legacy=await json(service(detail(10)));
  assert.equal(Object.keys(legacy.detail).length,23);assert.equal(legacy.submittedEvent,null);assert.equal(legacy.enrichment,null);
  assert.equal(legacy.detail.source,'early_access_manual_order_bridge');
  assert.equal(legacy.detail.declaredAffiliateCode,null);assert.equal(legacy.detail.declaredAffiliateCodeState,'not_provided');
  assert.deepEqual(Object.fromEntries(Object.entries(legacy.detail).filter(([key])=>!['source','declaredAffiliateCode','declaredAffiliateCodeState'].includes(key))),canonical);
  assert.equal((await psql(service(detail(999)))).trim(),'');
  pass('actual canonical20 becomes exact23 for legacy, retains canonical timestamps and absent request stays null');
  await psql('begin;'+fixture(1)+fixture(2,{price:null})+'commit;');
  const enriched=await json(service(detail(1))),pending=await json(service(detail(2)));
  assert.equal(enriched.detail.createdAt,time);assert.equal(enriched.submittedEvent.occurredAt,time);
  assert.equal(enriched.enrichment.companion.intake.confirmedAt,time);
  assert.deepEqual(enriched.enrichment.receipt.estimate,{knownSubtotalCents:250,estimateComplete:true,currency:'USD'});
  assert.equal(enriched.enrichment.observation.notification.nextAttemptAt,time);
  assert.equal(enriched.enrichment.observation.state,'observed');
  assert.equal(Object.keys(enriched.enrichment.companion.intake).length,12);
  assert.equal(pending.detail.estimatedTotalCents,null);assert.equal(pending.enrichment.receipt.estimate.estimateComplete,false);
  const replaySql=service("select public.research_health_quick_order_replay('"+actor+"','"+keyHash+"')::text;");
  const replay=await json(replaySql);
  assert.equal(replay.payloadHash,payloadHash);assert.equal(replay.publicReceipt.requestId,uuid(1));
  assert.deepEqual(await json(replaySql),replay);
  assert.equal((await psql(service("select public.research_health_quick_order_replay('member:"+uuid(902)+"','"+keyHash+"')::text;"))).trim(),'');
  assert.equal((await psql(service("select public.research_health_quick_order_replay('"+actor+"','"+'c'.repeat(64)+"')::text;"))).trim(),'');
  assert.deepEqual(Object.keys(replay).sort(),['payloadHash','publicReceipt']);
  assert.deepEqual(Object.keys(replay.publicReceipt).sort(),['attributionState','estimate','publicReference','requestId']);
  pass('synthetic retained facts yield bound readback, pricing-pending estimate and actor/key-isolated safe replay');
  const malformed=[
    [20,{companion:false}],[21,{marker:false}],[22,{outbox:false}],
    [23,{companion:false,outbox:false,markerValue:null}],
    [24,{companion:false,outbox:false,markerValue:'unknown-v2'}],
    [25,{requestTime:'2026-10-06T12:00:00.123456Z'}],
    [26,{eventTime:'2026-10-06T12:00:00.124Z'}],
  ];
  for(const [n,options] of malformed) {
    await psql('begin;'+fixture(n,options)+'commit;');await refused(service(detail(n)),'55000');
  }
  await refused('begin;'+fixture(30)+
    "update public.research_health_quick_order_intakes set receipt=receipt||'{\"privateField\":true}'::jsonb where request_id='"+uuid(30)+"';commit;",'23514');
  await refused('begin;'+fixture(31)+
    "update public.research_health_quick_order_intakes set classifications='[]'::jsonb where request_id='"+uuid(31)+"';commit;",'23514');
  await psql("update public.research_notification_outbox set payload=payload||'{\"email\":\"synthetic-leak@example.invalid\"}'::jsonb where event_key="+quote(eventKey(1))+';');
  await refused(service(detail(1)),'55000');
  pass('independent missing/partial/unknown evidence, lossy identity times and closed-shape corruption refuse');
  await refused(rollback,'55000');await psql(postcheck);await boundary(before);
  pass('nonempty rollback refuses; no retained synthetic facts are discarded by rollback');
  process.stdout.write('INTAKE_READER_SUBSET_COMPLETE '+JSON.stringify({checks,sourceCommit:receipt.sourceCommit,
    result:'PARTIAL_ONLY',qualification:'HELD_NOT_IMPLEMENTED',held})+'\n');
  process.exitCode=2; // Success of this subset must never look like qualification PASS.
} catch(error) {
  failure=error;process.exitCode=interrupted?2:1;
  // Fixed summary; do not dump SQL payloads, arbitrary process env or source text.
  process.stderr.write('INTAKE_READER_SUBSET FAILED; no full qualification claimed.\n');
} finally {
  try {await cleanup();}
  catch(error) {
    process.exitCode=2;
    process.stderr.write('INTAKE_READER_CLEANUP_UNRESOLVED '+JSON.stringify({name,ownershipLabel:label,invocation})+'\n');
  }
  process.off('SIGINT',onInt);process.off('SIGTERM',onTerm);
}
if(failure)throw new Error('Quick Order disposable reader subset failed; omitted proofs remain HELD.');
