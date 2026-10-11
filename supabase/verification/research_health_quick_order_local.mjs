/**
 * SOURCE ONLY / NOT RUN. Synthetic canonical intake and retained-reader controls.
 * Authored controls are not observed atomicity, Auth, liveness or delivery proof.
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
const BINDINGS = 'docs/health-launch/quick-order-20261005/evidence/doc71-disabled-source-bindings-20261009.json';
const OWN = [CANDIDATE+'.sql', CANDIDATE+'.precheck.sql', CANDIDATE+'.postcheck.sql', CANDIDATE+'.rollback.md', SELF];
const BOOTSTRAP = 'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql';
const OUTBOX = 'supabase/research-notification-outbox.sql';
const CURRENTNESS = 'supabase/candidates/20261006_research_health_quick_order_currentness';
// Whole canonical files only. No extracted CREATE fragments, mock authority
// functions, replacement persistence tables or disabled canonical triggers.
const TRANSACTION_PREDECESSORS = [
  'supabase/research-membership.sql',
  'supabase/research-members.sql',
  'supabase/research-catalog.sql',
  'supabase/research-inventory-lots.sql',
  'supabase/research-products-diagnostics.sql',
  'supabase/migrations/20260726143000_research_product_control_center.sql',
  'supabase/migrations/20260727120000_research_inventory_lot_coa_admin.sql',
  'supabase/research-inventory-reservation-commands.sql',
  'supabase/migrations/20260804120000_research_early_access_identity_persistence.sql',
  'supabase/migrations/20260804121000_research_early_access_commerce_persistence.sql',
  'supabase/migrations/20260804122000_research_early_access_supplier_operations.sql',
  'supabase/migrations/20260807193000_research_early_access_cart_checkout.sql',
  'supabase/migrations/20260808100000_research_early_access_cart_completion.sql',
  'supabase/migrations/20260809120000_research_early_access_cart_duplicate_guard.sql',
  'supabase/migrations/20260809130000_research_early_access_hardening.sql',
  'supabase/research-private-early-access-sessions.sql',
  'supabase/research-required-input-readiness.sql',
];
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
// Independent expected census from canonical migration source: requests 8,
// events 7, outbox 4. Never derive this assertion from the candidate being checked.
const TRIGGERS = [
  ['research_assisted_order_requests','research_assisted_order_paid_hold','O'],
  ['research_assisted_order_requests','hl12_observed_cancel','O'],
  ['research_assisted_order_requests','hl12_history_progression','O'],
  ['research_assisted_order_requests','aa_hl12_disposition_terminal','O'],
  ['research_assisted_order_requests','aaa_adp01_uncertainty','A'],
  ['research_assisted_order_requests','adp03_request_identity','A'],
  ['research_assisted_order_requests','adp03_evidence_truncate','A'],
  ['research_assisted_order_requests','adp03_evidence_immutable','A'],
  ['research_assisted_order_events','research_assisted_order_events_append_only','A'],
  ['research_assisted_order_events','research_assisted_order_paid_event_evidence','A'],
  ['research_assisted_order_events','hl12_disposition_cancel_event','O'],
  ['research_assisted_order_events','adp03_paid_event','A'],
  ['research_assisted_order_events','adp03_evidence_truncate','A'],
  ['research_assisted_order_events','adp03_evidence_immutable','A'],
  ['research_assisted_order_events','hl12_disposition_no_truncate','O'],
  ['research_notification_outbox','hl12_payment_effects_outbox_guard','A'],
  ['research_notification_outbox','hl12_payment_effects_outbox_truncate','A'],
  ['research_notification_outbox','hl12_disposition_effects_outbox','O'],
  ['research_notification_outbox','hl12_disposition_effects_truncate','O'],
].map(row => row.join('|')).sort();
const held = [
  'canonical transaction/receipt/replay, baseline price and five-write lock-fault controls AUTHORED / NOT RUN',
  'authenticated actor/key derivation and standing/legal/Health admission',
  'guarded catalog/legal/destination authority currentness and classification truth',
  'concurrent writers, lock boundaries, epoch scope and liveness',
  'lost-response/restart commit durability and changed-input conflict',
  'real adapter/decoder end-to-end qualification and classification display',
  'notification dispatcher transport/retry/delivery and operational intake',
  'owner-resistant immutability is not claimed; SQL owner is the disclosed trust boundary',
  'admin-attested row-8 checkout binding absent from four-field private context: branch refuses',
  'exact accepted-currentness receipt and sequenced intake dependency seal pending',
  'implemented-S source-column descriptor remains absent; fixtures do not supply or replace its accepted seal',
  'canonical Early Access-to-member price correction and its controls await independent acceptance and execution',
  'external transport timeout/disconnect proof and complete writer/revocation timing qualification remain unobserved',
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
assert.deepEqual(Object.keys(receipt).sort(),[
  'schemaVersion','sourceCommit','sourceTree','sourceAcceptance','definitionSha256',
  'currentnessDefinition','currentnessDependency','files','disclosures','execution','publication',
].sort());
// A frozen source inventory is NOT an accepted execution receipt.
// Refuse before Git or any child when independent acceptance is pending.
assert.equal(receipt.sourceAcceptance?.status,'SOURCE_ACCEPT_WITH_LIMITS',
  'Exact source acceptance is pending; no child process is eligible');
assert.match(receipt.sourceAcceptance?.reviewCommit??'',/^[a-f0-9]{40}$/);
assert.match(receipt.sourceTree??'',/^[a-f0-9]{40}$/);
assert.match(receipt.definitionSha256??'',/^[a-f0-9]{64}$/);
assert.match(receipt.currentnessDefinition??'',/^[a-f0-9]{64}$/);
assert.ok(receipt.currentnessDependency&&typeof receipt.currentnessDependency==='object',
  'An accepted currentness receipt must precede the intake seal');
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
for(const file of [...OWN,BINDINGS,BOOTSTRAP,OUTBOX,...MIGRATIONS,...TRANSACTION_PREDECESSORS,
  CURRENTNESS+'.sql',CURRENTNESS+'.precheck.sql',CURRENTNESS+'.postcheck.sql'])await load(file);
const bindingPacket=JSON.parse(await load(BINDINGS));
assert.equal(bindingPacket.schemaVersion,'doc71-disabled-source-bindings-v1');
const bindings=bindingPacket.intake;
assert.equal(bindings.review,'59940dcce778d18dcae605172a46f676b9933fcf');
assert.deepEqual(bindings.canonicalTriggers.map(t => [t.relation,t.name,t.enabled].join('|')).sort(),TRIGGERS);
assert.match(bindings.base,/^[a-f0-9]{40}$/); assert.equal(bindings.inventory.length,55);
for(const item of bindings.inventory) {
  safeRelative(item.path);
  const historical=lf(await run('git',['show',bindings.base+':'+item.path]));
  assert.equal(sha(historical),item.sha256lf,'Historical predecessor binding differs: '+item.path);
  await load(item.path); // Receipt pins successor bytes; historical hash never substitutes.
}
const candidate=await load(CANDIDATE+'.sql');
const definitionHash=sha(uniqueBlock(candidate,'$qo_ddl$')+uniqueBlock(candidate,'$qo_fingerprint$'));
assert.equal(definitionHash,receipt.definitionSha256,'Receipt definition differs from authored bytes');
// Sequenced source review is a prerequisite even before disposable startup.
assert.doesNotMatch(candidate,/expected_currentness_definition\s+text\s*:=\s*null/i,
  'R2-13 accepted currentness receipt is pending; qualification is not ready');
const currentnessCandidate=await load(CURRENTNESS+'.sql');
assert.doesNotMatch(currentnessCandidate,/expected_columns\s*:=\s*null\s*;/i,
  'Implemented-S column descriptor is absent; synthetic bootstrap never supplies its seal');
for(const suffix of ['.precheck.sql','.postcheck.sql'])assert.doesNotMatch(await load(CURRENTNESS+suffix),
  /source_column_descriptor_seal\s+constant\s+text\s*:=\s*null\s*;/i,
  'Currentness check still has no accepted descriptor; no disposable child may start');
assert.equal(sha(uniqueBlock(currentnessCandidate,'$currentness_install$')+
  uniqueBlock(currentnessCandidate,'$currentness_fingerprint$')),receipt.currentnessDefinition,
  'Currentness dependency must bind its exact unchanged candidate bytes');
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
const pass=label=>{checks++;process.stdout.write('INTAKE_SYNTHETIC_CONTROL PASS '+label+'\n');};
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
  const triggers=(await psql(`select c.relname||'|'||t.tgname||'|'||t.tgenabled
    from pg_catalog.pg_trigger t join pg_catalog.pg_class c on c.oid=t.tgrelid
    where not t.tgisinternal and c.relnamespace='public'::regnamespace and c.relname in
      ('research_assisted_order_requests','research_assisted_order_events','research_notification_outbox')
    order by c.relname,t.tgname;`)).split(/\r?\n/).filter(Boolean).sort();
  assert.deepEqual(triggers,TRIGGERS,'Independent canonical 19-trigger inventory differs');
}

// All functions in this section are future callable controls in this owned,
// network-none disposable only. The entrypoint acceptance/descriptor/seal
// refusals above are deliberately unchanged. Synthetic artifacts, role OIDs,
// timers and legal pairs below are NEVER real input bindings or approvals.
const copy=value=>JSON.parse(JSON.stringify(value));
const effects=['research_assisted_order_requests','research_assisted_order_lines',
  'research_assisted_order_events','research_notification_outbox','research_health_quick_order_intakes'];
const txCaseResults=[];
const txPass=(id,detail)=>{txCaseResults.push({id,result:'OBSERVED_IN_DISPOSABLE',detail});pass(id);};
const txRows=async body=>rows(await startupSql(body));
const txJson=async body=>{const values=await txRows(body);assert.ok(values.length);return values.at(-1);};
// Unlike the historical DDL runner, do not replace startup timers in the RPC
// connection. Every call starts a fresh psql/backend with the synthetic catalog
// login+database settings already installed. This is not PostgREST proof.
function startupSql(body) {
  assert.match(containerId??'',/^[a-f0-9]{64}$/);
  return docker(['exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-U','postgres','-d','postgres'],{input:'\\set VERBOSITY verbose\n'+body+'\n',timeout:30_000});
}
function sqlFailure(error,state,message,detail) {
  assert.ok(error,'Expected a PostgreSQL refusal, not a missing invocation');
  assert.equal(error.code,3);assert.equal(error.signal,null);assert.equal(error.timedOut,false);
  assert.equal(error.interrupted,null);assert.equal(error.outputLimitExceeded,false);
  assert.match(error.stderr??'',new RegExp('ERROR:\\s+'+state+':'));
  if(message)assert.ok(error.stderr.includes(message),'The intended refusal message was not reached');
  if(detail)assert.ok(error.stderr.includes(JSON.stringify(detail)),'The intended structured refusal was not returned');
}
async function txRefused(body,state,message,detail) {
  let error;try{await startupSql(body);}catch(value){error=value;}
  sqlFailure(error,state,message,detail);
}
const commitCall=p=>`select public.research_health_quick_order_commit(${j(p)})::text;`;
const commitSql=p=>`set role service_role;\n${commitCall(p)}`;
const replayCall=p=>`set role service_role;\nselect public.research_health_quick_order_replay(${quote(p.actorScope)},${quote(
  sha('xenios:health:quick-order:key:v1|'+p.actorScope+'|'+p.submission.input.idempotencyKey))})::text;`;
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
function rehash(p){p.submission.payloadHash=sha(JSON.stringify(stable(p.submission.input)));return p;}
async function effectCounts(){return json(`select json_build_array(${effects.map(table=>`(select count(*) from public.${table})`).join(',')})::text;`);}
function countDelta(before,after,expected){assert.deepEqual(after.map((n,i)=>n-before[i]),expected);}
async function syntheticRoute(routeClass) {
  assert.ok(routeClass==='intake'||routeClass==='writer');
  const identities=await json(`select json_build_object('database',json_build_object('name',current_database(),'oid',
    (select oid::text from pg_database where datname=current_database())),
    'loginRole',json_build_object('name','postgres','oid',(select oid::text from pg_roles where rolname='postgres')),
    'requestRole',json_build_object('name',${quote(routeClass==='intake'?'service_role':'postgres')},'oid',
      (select oid::text from pg_roles where rolname=${quote(routeClass==='intake'?'service_role':'postgres')})),
    'ownerRole',json_build_object('name','postgres','oid',(select oid::text from pg_roles where rolname='postgres')))::text;`);
  const carrier={schemaVersion:'quick-order-approved-limits-v1',profileId:'synthetic-disposable-only',profileVersion:'fixture-v1',
    ...identities,routeClass,routeId:'synthetic-'+routeClass,timeZone:'UTC',dateStyle:'ISO, MDY',
    intake:{lockTimeoutMs:600,statementTimeoutMs:3000,transactionTimeoutMs:5000,idleTimeoutMs:2000,deadlockTimeoutMs:1000,
      cleanupMs:200,attemptDeadlineMs:5350,acquisitionMs:50,responseMs:100},
    writer:{lockTimeoutMs:5500,statementTimeoutMs:8000,transactionTimeoutMs:10000,idleTimeoutMs:7000,deadlockTimeoutMs:1000,
      cleanupMs:200,attemptDeadlineMs:10350,acquisitionMs:50,responseMs:100,gateWaitMs:5500,postGateReserveMs:1000},
    enforcement:{preBeginAttestationSha256:sha('SYNTHETIC: no gateway attestation'),
      writerOrderAttestationSha256:sha('SYNTHETIC: no deployed writer attestation'),singleRpcAutocommit:true}};
  const raw=JSON.stringify(carrier),digest=sha(raw),limits=carrier[routeClass];
  await psql(`alter role postgres in database postgres set research_health_quick_order.approved_limits=${quote(raw)};
    ${[['lock_timeout','lockTimeoutMs'],['statement_timeout','statementTimeoutMs'],['transaction_timeout','transactionTimeoutMs'],
      ['idle_in_transaction_session_timeout','idleTimeoutMs'],['deadlock_timeout','deadlockTimeoutMs']]
      .map(([setting,key])=>`alter role postgres in database postgres set ${setting}=${quote(limits[key]+'ms')};`).join('\n')}
    alter role postgres in database postgres set timezone='UTC';
    alter role postgres in database postgres set datestyle='ISO, MDY';
    ${routeClass==='writer'?`comment on table public.research_health_quick_order_currentness_scope_inputs is ${quote('RHQOC_APPROVED_LIMITS_V1:'+digest)};`:''}`);
  return {carrier,raw,digest};
}

// Source-derived platform seam only. Canonical business relations all come
// from whole pinned predecessor files. No stand-in research relation exists.
async function canonicalTransactionBootstrap() {
  await psql(`create schema storage;create table storage.buckets(
    id text primary key,name text not null,public boolean not null default false,
    file_size_limit bigint,allowed_mime_types text[]);`);
  for(const file of TRANSACTION_PREDECESSORS)await psql(await load(file));
  const schema=await json(`select json_build_object('priceColumns',
    (select json_agg(attname order by attnum) from pg_attribute where attrelid='public.research_product_prices'::regclass and attnum>0 and not attisdropped),
    'sessionOwnerMatchesFence',(select s.relowner=f.relowner from pg_class s cross join pg_class f
      where s.oid='public.research_private_early_access_sessions'::regclass and f.oid='public.research_assisted_order_provider_fence'::regclass))::text;`);
  assert.deepEqual(schema.priceColumns,['id','product_id','variant_id','audience','amount_cents','currency','effective_at',
    'expires_at','status','approval_note','version','created_by','approved_by','approved_at','created_at','updated_at']);
  assert.equal(schema.sessionOwnerMatchesFence,true);
}

async function seedTransactionGraph(n,{memberStatus='active',customerStatus='APPROVED',legalMode='verified_link',
  sessionRevoked=false,qualityReady=true,quantityAvailable=2,priceMode='member',priceAmount=125,priceApproved=true,
  priceAudiences=['member'],retailDecoy=false}={}) {
  const k=50000+n*100,id=offset=>uuid(k+offset),customerId='synthetic_doc71_customer_'+n;
  const now=await json("select json_build_object('at',to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))::text;");
  const at=now.at,earlier=new Date(Date.parse(at)-60_000).toISOString();
  const g={n,productId:id(1),variantId:id(2),priceId:id(3),lotId:id(4),documentId:id(5),memberId:id(6),
    authUserId:id(7),applicationId:id(8),ownerId:id(9),legalId:id(10),revisionId:id(11),customerId,
    customerRef:'eac_'+sha('early-access-customer-v1:'+customerId).slice(0,32),sessionHash:sha('synthetic_doc71_session_'+n),
    sku:'SYNTHETIC-DOC71-'+n,domain:'synthetic_doc71_'+n,offeringId:'synthetic-offer-'+n,at,earlier,priceMode,priceAmount,
    priceAudiences:copy(priceAudiences),retailDecoyId:id(0),
    testIds:Array.from({length:9},(_,i)=>id(20+i))};
  const tests=['identity','assay','purity','sterility','endotoxin','particulate','residual_solvents','elemental_impurities','chain_of_custody'];
  await syntheticRoute('writer');
  await startupSql(`begin;
    set local xenios.quality_command='allowed';
    insert into public.research_applications(id,email,first_name,last_name,country,age_confirmed,status)
      values('${g.applicationId}','synthetic-${n}@example.invalid','Synthetic','Fixture','US',true,'active');
    insert into public.research_members(id,application_id,auth_user_id,email,first_name,status)
      values('${g.memberId}','${g.applicationId}','${g.authUserId}','synthetic-${n}@example.invalid','Synthetic',${quote(memberStatus)});
    insert into public.research_early_access_customers(id,normalized_email,status,record)
      values(${quote(customerId)},'synthetic-${n}@example.invalid',${quote(customerStatus)},${j({id:customerId,
        normalizedEmail:`synthetic-${n}@example.invalid`,status:customerStatus,audience:'PRIVATE_EARLY_ACCESS'})});
    insert into public.research_early_access_session_bindings(session_id,customer_id,bound_at)
      values('${g.sessionHash}',${quote(customerId)},${quote(earlier)});
    insert into public.research_early_access_legal_bindings(id,customer_ref,member_id,established_by,verified_at,attested_by)
      values('${g.legalId}','${g.customerRef}','${g.memberId}',${quote(legalMode)},${quote(earlier)},${quote(legalMode==='verified_link'?null:'synthetic-steward')});
    insert into public.research_private_early_access_sessions(session_hash,owner_id,access_role,issued_at,expires_at,revoked_at)
      values('${g.sessionHash}','${g.ownerId}','private_early_access_member',${quote(earlier)},
        ${quote(earlier)}::timestamptz+interval '240 minutes',${sessionRevoked?quote(at):'null'});
    insert into public.research_early_access_agreement_acceptances(customer_ref,agreement_kind,agreement_version,accepted_at,recorded_at)
      values('${g.customerRef}','Synthetic Health A','synthetic-v1',${quote(earlier)},${quote(earlier)}),
        ('${g.customerRef}','Synthetic Health B','synthetic-v1',${quote(earlier)},${quote(earlier)});
    insert into public.research_products(id,sku,slug,display_name,canonical_name,lane,admin_status,active_state)
      values('${g.productId}','${g.sku}','synthetic-doc71-${n}','Synthetic fixture only','Synthetic fixture only','supplement','approved',true);
    insert into public.research_product_variants(id,product_id,sku,label,member_eligible,created_by,updated_by)
      values('${g.variantId}','${g.productId}','${g.sku}','Synthetic variant',true,'synthetic-fixture','synthetic-fixture');
    update public.research_product_variants set status='in_review' where id='${g.variantId}';
    update public.research_product_variants set status='approved',active=true where id='${g.variantId}';
    ${retailDecoy?`insert into public.research_product_prices(id,product_id,variant_id,audience,amount_cents,effective_at,status,version,created_by,approved_by,approved_at)
      values('${g.retailDecoyId}','${g.productId}','${g.variantId}','retail',999,${quote(earlier)}::timestamptz-interval '1 minute',
        'active',1,'synthetic-fixture','synthetic-fixture',${quote(earlier)});`:''}
    ${priceMode==='none'?'':`insert into public.research_product_prices(id,product_id,variant_id,audience,amount_cents,effective_at,status,version,created_by,approved_by,approved_at)
      values('${g.priceId}','${g.productId}','${g.variantId}',${quote(priceMode)},${priceAmount},${quote(earlier)},'active',1,'synthetic-fixture',
        ${quote(priceApproved?'synthetic-fixture':null)},${priceApproved?quote(earlier):'null'});`}
    insert into public.research_inventory_lots(id,lot_id,sku,owner,product_id,variant_id,disposition,quantity_received,quantity_available,expiry_date,shelf_life_source)
      values('${g.lotId}','SYNTHETIC-LOT-${n}','${g.sku}','xenios','${g.productId}','${g.variantId}','available',20,${quantityAvailable},current_date+365,'coa');
    insert into public.research_lot_quality_documents(id,lot_id,coa_on_file,document_state,verification_state,private_storage_key,
      original_filename,content_type,size_bytes,sha256,report_issuer,report_number,report_date,reviewed_at,reviewed_by,published_at,published_by)
      values('${g.documentId}','${g.lotId}',true,'available','document_on_file','lots/synthetic/${n}.pdf',
        'synthetic.pdf','application/pdf',5,${quote(sha('SYNTHETIC-NO-UPLOADED-DOCUMENT:'+n))},'Synthetic laboratory','SYNTHETIC-${n}',
        current_date-1,${quote(earlier)},'synthetic-fixture',${quote(earlier)},'synthetic-fixture');
    ${tests.map((test,i)=>`insert into public.research_lot_quality_tests(id,quality_document_id,test_key,state,method,result,reviewed_by,reviewed_at)
      values('${g.testIds[i]}','${g.documentId}',${quote(test)},${quote(!qualityReady&&test==='identity'?'failed':'passed')},
        'synthetic-method','synthetic-result','synthetic-fixture',${quote(earlier)});`).join('\n')}
    insert into public.research_early_access_shipping_regions(country,region,added_by)
      values('US','CA','synthetic-fixture') on conflict do nothing;
    insert into public.research_required_inputs(key,domain,label,description,why_required,record_type,field_path,current_state,blocking_level,
      responsible_role,verification_method,entered_at,verified_at,verified_by,public_launch_impact,next_action,admin_entry_href,created_by)
      values('${g.domain}.input','${g.domain}','Synthetic input','Synthetic only','Synthetic only','fixture','fixture','verified','blocks_transaction',
        'super_admin','Synthetic fixture',${quote(earlier)},${quote(earlier)},'synthetic-fixture','Synthetic only','No production effect','/admin/synthetic','synthetic-fixture');
    insert into public.research_domain_launch_controls(domain,launch_status,software_complete,manifest_version,manifest_hash,expected_input_count,
      manifest_approved_by,manifest_approved_at,release_approved_by,release_approved_at,updated_by,updated_reason)
      values('${g.domain}','public_enabled',true,1,public.research_required_input_manifest_hash('${g.domain}'),1,
        'synthetic-fixture',${quote(earlier)},'synthetic-fixture',${quote(earlier)},'synthetic-fixture','Synthetic only');
    commit;`);
  return g;
}

function syntheticAuthority(g) {
  const bindingRaw=JSON.stringify({schemaVersion:1,bindings:[{offeringVariantId:g.offeringId,productId:g.productId,variantId:g.variantId}]});
  const configRaw=JSON.stringify({quickOrderScope:{schemaVersion:1,offers:[{offeringVariantId:g.offeringId,domains:[g.domain],countries:['US']}]}});
  const sourceRefs=['synthetic-source-reference'],applicabilityRefs=['synthetic-unapproved-health-scope'];
  const refs={sourceApprovalRefs:sourceRefs,applicabilityRefs};
  const publication={schemaVersion:'quick-order-authority-v1',revisionId:g.revisionId,sourceCommit:receipt.sourceCommit,
    bundleSha256:sha('SYNTHETIC-BUNDLE:'+g.n),artifacts:['catalog','bindings','reconciliation','health_legal','configuration','normalized_decision_inputs']
      .map(kind=>({kind,path:`synthetic/doc71-${g.n}/${kind}.json`,sha256:kind==='bindings'?sha(bindingRaw):kind==='configuration'?sha(configRaw):sha('SYNTHETIC:'+g.n+':'+kind)})),
    sourceRefs,applicabilityRefs,effectiveFrom:g.earlier,effectiveUntil:null};
  const ref=kind=>{const a=publication.artifacts.find(a=>a.kind===kind);return {path:a.path,sha256:a.sha256};};
  const decision={schemaVersion:'quick-order-decision-inputs-v1',revisionId:g.revisionId,sourceCommit:receipt.sourceCommit,
    effectiveFrom:g.earlier,effectiveUntil:null,artifacts:{catalog:ref('catalog'),bindings:ref('bindings'),reconciliation:ref('reconciliation'),
      healthLegal:ref('health_legal'),configuration:ref('configuration')},configurationVersion:ref('configuration').sha256,
    healthAgreements:['Synthetic Health A','Synthetic Health B'].map(kind=>({kind,version:'synthetic-v1',...copy(refs)})),
    offerRules:[{offeringVariantId:g.offeringId,productId:g.productId,variantId:g.variantId,workflowModes:['direct_order_request','request_pricing'],
      quantity:{minimum:1,maximum:10,increment:1},price:{currency:'USD',audiences:copy(g.priceAudiences),unpriced:'request_pricing'},
      destination:{countryCode:'US',regions:['CA'],...copy(refs)},...copy(refs)}],canonicalReaderProfile:'quick-order-canonical-readers-v1',
    relationProjectionVersion:'quick-order-relations-v1',readerCensusSha256:sha('SYNTHETIC-CENSUS-NOT-ACCEPTED:'+g.n)};
  const text=JSON.stringify(decision);
  publication.artifacts.find(a=>a.kind==='normalized_decision_inputs').sha256=sha(text);
  return {publication,decision,text,bindingRaw,configRaw};
}
async function activateSynthetic(g) {
  await syntheticRoute('writer');const a=syntheticAuthority(g);
  // Owner seeding is explicit fixture construction, never a production receipt.
  await startupSql(`insert into public.research_health_quick_order_currentness_scope_inputs(revision_id,source_commit,decision_text_sha256,
    reader_census_sha256,canonical_reader_profile,artifacts,construction_receipt,construction_receipt_sha256,bindings_raw,configuration_raw)
    values('${g.revisionId}',${quote(receipt.sourceCommit)},${quote(sha(a.text))},${quote(a.decision.readerCensusSha256)},
      'quick-order-canonical-readers-v1',${j(a.publication.artifacts.filter(x=>x.kind!=='normalized_decision_inputs'))},
      'synthetic/not-an-accepted-construction-receipt',${quote(sha('SYNTHETIC-CONSTRUCTION:'+g.n))},
      convert_to(${quote(a.bindingRaw)},'UTF8'),convert_to(${quote(a.configRaw)},'UTF8'));`);
  const published=await txJson(`select public.research_health_quick_order_publish_revision(${j(a.publication)},${quote(a.text)})::text;`);
  assert.equal(published.state,'held');assert.equal(published.revisionId,g.revisionId);
  const activated=await txJson(`select public.research_health_quick_order_currentness_activate_revision('${g.revisionId}',
    ${quote(published.writerEpoch)}::bigint,${quote(receipt.sourceCommit)},${quote(a.decision.readerCensusSha256)})::text;`);
  assert.equal(activated.state,'active');assert.equal(activated.revisionId,g.revisionId);
  assert.deepEqual(await txJson('select public.research_health_quick_order_currentness_read_strict_authority(clock_timestamp())::text;'),activated);
  g.authority=a;g.activated=activated;g.route=await syntheticRoute('intake');return g;
}
function transactionPayload(g,key,{earlyAccess=false,unpriced=g.priceMode!=='member',quantity=9}={}) {
  const address={line1:'1 Synthetic Way',city:'Sacramento',region:'CA',postalCode:'95814',countryCode:'US'};
  const priceVersion=unpriced?null:g.priceId,unitPriceCents=unpriced?null:g.priceAmount;
  const input={idempotencyKey:key,requestAcknowledged:true,contact:{fullLegalName:'Synthetic Buyer',email:`synthetic-${g.n}@example.invalid`,
    mobilePhone:'+10000000000',organizationName:'',ageConfirmed:true,shippingAddress:address,billingAddress:copy(address)},
    agreements:['Synthetic Health A','Synthetic Health B'].map(kind=>({kind,version:'synthetic-v1'})),
    lines:[{productId:g.productId,variantId:g.variantId,quantity,expectedCatalogVersion:'synthetic-catalog-v1',expectedPriceVersion:priceVersion}]};
  const actorScope=earlyAccess?'early_access:'+g.customerRef:'member:'+g.authUserId;
  return rehash({schemaVersion:'quick-order-commit-v1',actorScope,context:{rawStoredSessionHash:g.sessionHash,
    configuredOwnerId:g.ownerId,actorScope,requiredRole:'private_early_access_member'},expectedConfigurationDigest:g.route.digest,
    notificationRecipient:'synthetic-operator@example.invalid',submission:{input,payloadHash:'',snapshots:[{productId:g.productId,variantId:g.variantId,
      quantity,catalogVersion:'synthetic-catalog-v1',priceVersion,unitPriceCents,workflowMode:unpriced?'request_pricing':'direct_order_request'}],
      computedEstimate:{knownSubtotalCents:unpriced?0:quantity*g.priceAmount,estimateComplete:!unpriced,currency:'USD'},
      attribution:{schemaVersion:'attribution-v1',source:'direct',sourceDetail:'',declaredAffiliateCode:null,affiliation:{kind:'none',detail:''},
        confirmedByCustomer:true,receivedAt:g.at,reviewState:'direct_no_referrer',commissionState:'not_authorized'}}});
}
async function assertCommitted(p,{replayed=false,expectedPriceAudience='member'}={}) {
  const result=await txJson(commitSql(p));
  assert.deepEqual(Object.keys(result).sort(),['attributionState','estimate','persisted','publicReference','replayed','requestId']);
  assert.equal(result.persisted,true);assert.equal(result.replayed,replayed);
  assert.equal(result.attributionState,'direct_no_referrer');assert.deepEqual(result.estimate,{...p.submission.computedEstimate,
    excludes:'Shipping, tax, clinical, pharmacy and other unconfirmed charges. Not a payment quote.'});
  assert.match(result.requestId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  assert.match(result.publicReference,/^XRR-[0-9]{8}-[A-F0-9]{10}$/);
  const readback=await txJson(`set role service_role;\nselect public.research_health_quick_order_admin_detail('${result.requestId}')::text;`);
  assert.equal(readback.detail.requestId,result.requestId);assert.equal(readback.detail.status,'submitted');
  assert.deepEqual(readback.enrichment.receipt.estimate,p.submission.computedEstimate);
  const retained=await json(`select json_build_object('lines',(select count(*) from public.research_assisted_order_lines where request_id=r.id),
    'events',(select count(*) from public.research_assisted_order_events where request_id=r.id and status='submitted' and evidence->>'intakeKind'='quick-order-v1'),
    'outbox',(select count(*) from public.research_notification_outbox where event_key='assisted-order:'||r.id||':quick-order-submitted:admin'),
    'sameInstant',r.created_at=c.received_at and r.updated_at=c.received_at and not exists(
      select 1 from public.research_assisted_order_lines l where l.request_id=r.id and l.created_at<>c.received_at)
      and not exists(select 1 from public.research_assisted_order_events e where e.request_id=r.id and e.occurred_at<>c.received_at)
      and not exists(select 1 from public.research_notification_outbox o where o.event_key='assisted-order:'||r.id||':quick-order-submitted:admin'
        and (o.created_at<>c.received_at or o.updated_at<>c.received_at or o.next_attempt_at<>c.received_at)),
    'enqueueOnly',(select bool_and(status='pending' and attempt_count=0) from public.research_notification_outbox where event_key='assisted-order:'||r.id||':quick-order-submitted:admin'),
    'payloadHash',c.payload_hash,'keyHash',c.key_hash,'actorScope',c.actor_scope,'classifications',c.classifications)
    from public.research_assisted_order_requests r join public.research_health_quick_order_intakes c on c.request_id=r.id where r.id='${result.requestId}';`);
  assert.equal(retained.lines,p.submission.input.lines.length);assert.equal(retained.events,1);assert.equal(retained.outbox,1);
  assert.equal(retained.sameInstant,true);assert.equal(retained.enqueueOnly,true);
  assert.equal(retained.payloadHash,p.submission.payloadHash);assert.equal(retained.actorScope,p.actorScope);
  assert.equal(retained.keyHash,sha('xenios:health:quick-order:key:v1|'+p.actorScope+'|'+p.submission.input.idempotencyKey));
  assert.equal(retained.classifications.length,p.submission.input.lines.length);
  for(const classification of retained.classifications){assert.equal(classification.requestId,result.requestId);
    assert.equal(classification.payloadHash,p.submission.payloadHash);assert.equal(classification.decision,'health_requestable');
    assert.match(classification.sourceVersion,/^qosv1:[a-f0-9]{64}$/);}
  const tuple=await json(`select json_build_object('line',row_to_json(l),'at',to_char(c.received_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'revisionId',c.classifications->0->>'authorityRevisionId','decisionText',r.decision_inputs_text,
    'writerEpoch',(select writer_epoch::text from public.research_health_quick_order_authority_activations where revision_id=r.revision_id),
    'price',(select row_to_json(p) from public.research_product_prices p where p.id::text=l.price_version),
    'lot',(select row_to_json(x) from public.research_inventory_lots x where x.product_id=l.product_id::uuid and x.variant_id=l.variant_id::uuid order by x.id limit 1),
    'document',(select row_to_json(d) from public.research_lot_quality_documents d join public.research_inventory_lots x on x.id=d.lot_id
      where x.product_id=l.product_id::uuid and x.variant_id=l.variant_id::uuid order by d.id limit 1),
    'tests',(select json_agg(row_to_json(t) order by t.id,t.test_key) from public.research_lot_quality_tests t
      join public.research_lot_quality_documents d on d.id=t.quality_document_id join public.research_inventory_lots x on x.id=d.lot_id
      where x.product_id=l.product_id::uuid and x.variant_id=l.variant_id::uuid))
    from public.research_health_quick_order_intakes c join public.research_assisted_order_lines l on l.request_id=c.request_id
    join public.research_health_quick_order_authority_revisions r on r.revision_id=(c.classifications->0->>'authorityRevisionId')::uuid
    where c.request_id='${result.requestId}';`);
  const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value[key]]));
  const lotProjection=pick(tuple.lot,['id','lot_id','product_id','variant_id','sku','disposition','recalled','excursion','expiry_date','retest_date','shelf_life_source']);
  const documentProjection=pick(tuple.document,['id','lot_id','document_state','verification_state','coa_on_file','private_storage_key',
    'report_issuer','report_number','report_date','reviewed_at','published_at']);
  for(const key of ['reviewed_at','published_at'])documentProjection[key]=new Date(documentProjection[key]).toISOString();
  const testsProjection=tuple.tests.map(t=>pick(t,['id','quality_document_id','test_key','state']));
  const decision=JSON.parse(tuple.decisionText),actualPrice=tuple.price;
  const expectedSnapshot=p.submission.snapshots[0];
  if(expectedSnapshot.unitPriceCents===null)assert.equal(actualPrice,null,'An unpriced receipt must not retain a price row');
  else {
    assert.ok(actualPrice,'A priced receipt must bind an actual canonical price row');
    assert.equal(actualPrice.id,expectedSnapshot.priceVersion,'priceVersion is canonical price.id, never an integer version');
    assert.equal(tuple.line.price_version,actualPrice.id);
    assert.equal(actualPrice.amount_cents,expectedSnapshot.unitPriceCents);
    assert.equal(actualPrice.audience,expectedPriceAudience,'Retained price audience must match the canonical viewer grant');
  }
  const expectedTuple={schemaVersion:'quick-order-line-source-v1',revisionId:tuple.revisionId,writerEpoch:tuple.writerEpoch,
    sourceCommit:decision.sourceCommit,decisionInputsSha256:sha(tuple.decisionText),readerCensusSha256:decision.readerCensusSha256,
    productId:tuple.line.product_id,variantId:tuple.line.variant_id,workflowMode:tuple.line.workflow_mode,quantity:tuple.line.quantity,
    priceVersion:tuple.line.price_version,unitPriceCents:tuple.line.unit_price_cents,currency:'USD',
    priceDecision:actualPrice?{id:actualPrice.id,version:actualPrice.version,audience:actualPrice.audience,minimumQuantity:null,maximumQuantity:null,
      effectiveFrom:new Date(actualPrice.effective_at).toISOString(),effectiveUntil:actualPrice.expires_at===null?null:new Date(actualPrice.expires_at).toISOString()}:null,
    stockDecision:{mode:'any_allocatable',decisionAt:tuple.at,witnesses:[{lotId:tuple.lot.id,lotProjectionSha256:sha(JSON.stringify(lotProjection)),
      qualityDocumentId:tuple.document.id,qualityDocumentProjectionSha256:sha(JSON.stringify(documentProjection)),
      qualityTestsSha256:sha(JSON.stringify(testsProjection)),availableQuantity:tuple.lot.quantity_available}]}};
  const expectedSourceVersion='qosv1:'+sha(JSON.stringify(expectedTuple));
  assert.equal(tuple.line.authoritative_fingerprint,expectedSourceVersion,'Actual canonical facts bind the exact ordered typed tuple');
  assert.equal(retained.classifications[0].sourceVersion,expectedSourceVersion);
  return result;
}

// A real second backend holds a reviewed relation/row/advisory lock. No DDL,
// injected trigger, modified source definition or candidate text substitution.
async function withSyntheticLock(lockBody,action,end='rollback') {
  assert.ok(end==='rollback'||end==='commit');
  assert.match(containerId??'',/^[a-f0-9]{64}$/);
  const tag='qo-fixture-'+randomUUID();
  const child=spawn('docker',['--host',endpoint,'exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
    {cwd:ROOT,env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
  activeChildren.add(child);let output='',stderr='',bytes=0,done=false,readySeen=false,resolveReady,rejectReady;
  const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  const timer=setTimeout(()=>{child.kill();rejectReady(new Error('Synthetic lock holder deadline'));},15_000);
  const finished=new Promise((resolve,reject)=>{
    child.on('error',error=>{rejectReady(error);reject(error);});
    child.on('close',(code,signal)=>{done=true;clearTimeout(timer);activeChildren.delete(child);
      if(!readySeen)rejectReady(new Error('Synthetic holder exited before its ready receipt'));
      if(code!==0||signal||interrupted){const e=new Error('Synthetic lock holder did not close cleanly');rejectReady(e);reject(e);}
      else resolve();});
  });
  // Attach a rejection handler immediately; final cleanup still awaits it.
  finished.catch(()=>{});child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{bytes+=chunk.length;output+=chunk.toString('utf8');
    if(bytes>outputLimit){child.kill();rejectReady(new Error('Synthetic holder output bound'));}
    const match=output.match(/QO_FIXTURE_READY:([0-9]+)/);if(match){readySeen=true;resolveReady(Number(match[1]));}});
  child.stderr.on('data',chunk=>{bytes+=chunk.length;stderr+=chunk.toString('utf8');if(bytes>outputLimit)child.kill();});
  child.stdin.write(`\\set VERBOSITY verbose\nset application_name=${quote(tag)};
    set statement_timeout='10s';set transaction_timeout='12s';set idle_in_transaction_session_timeout='10s';
    begin;${lockBody}\nselect 'QO_FIXTURE_READY:'||pg_backend_pid();\n`);
  try{const pid=await ready;const result=await action({pid,tag});assert.equal(done,false,'Lock holder vanished during control');return result;}
  finally{if(!done)child.stdin.end(end+';\n\\q\n');await finished;}
}
async function awaitWriteWait(table) {
  for(let i=0;i<30;i++) {
    const observed=await json(`select json_build_object('waiting',exists(select 1 from pg_locks l join pg_stat_activity a on a.pid=l.pid
      where l.locktype='relation' and l.relation='public.${table}'::regclass and l.mode='RowExclusiveLock' and not l.granted
      and a.query like '%research_health_quick_order_commit%'))::text;`);
    if(observed.waiting)return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('Exact canonical write boundary was not observed; timeout alone cannot count');
}
async function awaitBlockedBy(pid) {
  for(let i=0;i<30;i++) {
    const observed=await json(`select json_build_object('waiting',exists(select 1 from pg_stat_activity a
      where ${Number(pid)}=any(pg_blocking_pids(a.pid)) and a.query like '%research_health_quick_order_commit%'))::text;`);
    if(observed.waiting)return;await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.fail('The expected holder did not block the real commit; no concurrency coverage claimed');
}

async function runSyntheticTransactionControls() {
  const providerBefore=(await psql(fingerprint)).trim();
  let index=1;const fresh=async options=>activateSynthetic(await seedTransactionGraph(index++,options));
  const g=await fresh({}),p=transactionPayload(g,'synthetic-doc71-positive');
  const baseline=await effectCounts(),first=await assertCommitted(p);
  countDelta(baseline,await effectCounts(),[1,1,1,1,1]);
  const firstCounts=await effectCounts();const replayed=await assertCommitted(p,{replayed:true});
  assert.deepEqual({...replayed,replayed:false},first);assert.deepEqual(await effectCounts(),firstCounts);
  assert.deepEqual((await txJson(replayCall(p))).publicReceipt,Object.fromEntries(Object.entries(first).filter(([key])=>!['persisted','replayed'].includes(key))));
  const changed=rehash({...copy(p),submission:{...copy(p.submission),input:{...copy(p.submission.input),contact:{...copy(p.submission.input.contact),fullLegalName:'Changed synthetic name'}}}});
  await txRefused(commitSql(changed),'23505','Quick Order key conflicts',{quickOrderCode:'IDEMPOTENCY_CONFLICT'});
  assert.deepEqual(await effectCounts(),firstCounts);
  const stock=await json(`select json_build_object('available',quantity_available,'reserved',quantity_reserved) from public.research_inventory_lots where id='${g.lotId}';`);
  assert.deepEqual(stock,{available:2,reserved:0}); // Requested nine; request-only any_allocatable witnesses do not reserve.
  txPass('TX01','actual commit: five canonical effects, receipt/readback, same instant, safe replay, conflict, no reservation');

  for(const table of effects) {
    const key='synthetic-fault-'+table.slice(-28),faultPayload=transactionPayload(g,key),before=await effectCounts();
    await withSyntheticLock(`lock table public.${table} in share mode;`,async()=>{
      const attempt=startupSql(commitSql(faultPayload)).then(value=>({value}),error=>({error}));
      await awaitWriteWait(table);const outcome=await attempt;
      sqlFailure(outcome.error,'55P03','canceling statement due to lock timeout');
      assert.deepEqual(await effectCounts(),before,'Failed write boundary must roll back all prior canonical effects');
    });
    assert.equal((await startupSql(replayCall(faultPayload))).trim(),'');
    await assertCommitted(faultPayload);countDelta(before,await effectCounts(),[1,1,1,1,1]);
    txPass('TX02-'+table,'observed RowExclusiveLock wait, normal SQL abort, no retained partial effects, same-key success after release');
  }
  const same=transactionPayload(g,'synthetic-same-key-concurrent'),beforeSame=await effectCounts();
  const sameResults=await Promise.all([txJson(commitSql(same)),txJson(commitSql(same))]);
  assert.equal(sameResults[0].requestId,sameResults[1].requestId);
  assert.deepEqual(sameResults.map(r=>r.replayed).sort(),[false,true]);countDelta(beforeSame,await effectCounts(),[1,1,1,1,1]);
  const race=transactionPayload(g,'synthetic-conflict-concurrent'),raceChanged=copy(race);
  raceChanged.submission.input.contact.fullLegalName='Other synthetic buyer';rehash(raceChanged);
  const beforeRace=await effectCounts(),raceResults=await Promise.allSettled([txJson(commitSql(race)),txJson(commitSql(raceChanged))]);
  assert.equal(raceResults.filter(r=>r.status==='fulfilled').length,1);
  sqlFailure(raceResults.find(r=>r.status==='rejected')?.reason,'23505','Quick Order key conflicts',{quickOrderCode:'IDEMPOTENCY_CONFLICT'});
  countDelta(beforeRace,await effectCounts(),[1,1,1,1,1]);txPass('TX03','same-key serialization and changed-input concurrent conflict');

  for(const [id,options,message] of [
    ['TX04-member-standing',{memberStatus:'paused'},'Quick Order eligibility changed'],
    ['TX04-customer-standing',{customerStatus:'SUSPENDED'},'Quick Order eligibility changed'],
    ['TX04-session-revoked',{sessionRevoked:true},'Quick Order eligibility changed'],
    ['TX04-admin-checkout-held',{legalMode:'admin_attested'},'Quick Order trusted checkout binding unavailable'],
    ['TX04-empty-stock',{quantityAvailable:0},'Quick Order witness unavailable'],
    ['TX04-quality-failed',{qualityReady:false},'Quick Order witness unavailable'],
    ['TX04-unapproved-price',{priceApproved:false},'Quick Order price unavailable'],
    ['TX04-zero-price',{priceAmount:0},'Quick Order price unavailable'],
  ]) {
    const control=await fresh({}),controlPayload=transactionPayload(control,'synthetic-control-'+id);
    const beforeControl=await effectCounts();await assertCommitted(controlPayload);
    countDelta(beforeControl,await effectCounts(),[1,1,1,1,1]);
    const negative=await fresh(options),payload=transactionPayload(negative,'synthetic-'+id),before=await effectCounts();
    await txRefused(commitSql(payload),'55000',message,{quickOrderCode:'DEFINITE_REFUSAL'});
    assert.deepEqual(await effectCounts(),before);assert.equal((await startupSql(replayCall(payload))).trim(),'');
    txPass(id,'matched canonical positive commits; activated negative with one changed eligibility value reaches exact refusal and zero effects');
  }
  const unpriced=await fresh({priceMode:'none'}),unpricedPayload=transactionPayload(unpriced,'synthetic-unpriced');
  const unpricedBefore=await effectCounts();await assertCommitted(unpricedPayload);countDelta(unpricedBefore,await effectCounts(),[1,1,1,1,1]);
  const ea=transactionPayload(unpriced,'synthetic-unpriced-ea',{earlyAccess:true,unpriced:true});await assertCommitted(ea);
  const priceG=await fresh({}),priceP=transactionPayload(priceG,'synthetic-price-baseline');await assertCommitted(priceP);
  await syntheticRoute('writer');
  await txRefused(`insert into public.research_product_prices(product_id,variant_id,audience,amount_cents,effective_at,status,version,created_by)
    values('${priceG.productId}','${priceG.variantId}','private_early_access',125,clock_timestamp(),'active',2,'synthetic-fixture');`,
    '23514','research_product_prices_audience_check');
  await txRefused(`insert into public.research_product_prices(product_id,variant_id,audience,amount_cents,effective_at,status,version,created_by)
    values('${priceG.productId}','${priceG.variantId}','member',125,clock_timestamp(),'active',2,'synthetic-fixture');`,
    '23505','research_product_prices_one_active_idx');
  priceG.route=await syntheticRoute('intake');
  const wrongVersion=transactionPayload(priceG,'synthetic-wrong-price-version');
  wrongVersion.submission.input.lines[0].expectedPriceVersion='1';wrongVersion.submission.snapshots[0].priceVersion='1';rehash(wrongVersion);
  await txRefused(commitSql(wrongVersion),'55000','Quick Order price changed',{quickOrderCode:'DEFINITE_REFUSAL'});
  txPass('TX05','member price.id contract; no tier columns; unpriced member/EA; baseline rejects EA audience and duplicate active row');

  // Canonical early-access-retail-pricing.ts grants an admitted EA session the
  // member audience. Actor scope remains early_access; no invented price row
  // audience, member identity replacement or generic first-price fallback.
  const pricedEaG=await fresh({retailDecoy:true,priceAudiences:['member','retail']});
  const pricedEa=transactionPayload(pricedEaG,'synthetic-priced-ea-member-grant',{earlyAccess:true,unpriced:false});
  const pricedEaBefore=await effectCounts();
  const pricedEaResult=await assertCommitted(pricedEa,{expectedPriceAudience:'member'});
  countDelta(pricedEaBefore,await effectCounts(),[1,1,1,1,1]);
  assert.equal(pricedEaResult.estimate.knownSubtotalCents,9*125);
  const sameGrantMember=transactionPayload(pricedEaG,'synthetic-member-grant-preserved',{unpriced:false});
  const sameGrantBefore=await effectCounts();
  const memberGrantResult=await assertCommitted(sameGrantMember,{expectedPriceAudience:'member'});
  countDelta(sameGrantBefore,await effectCounts(),[1,1,1,1,1]);
  assert.deepEqual(memberGrantResult.estimate,pricedEaResult.estimate);
  assert.notEqual(memberGrantResult.requestId,pricedEaResult.requestId);
  txPass('TX05-EA-member-positive','EA and member scopes select canonical member price.id and amount despite an earlier/lower-ID active retail decoy; exact sourceVersion binds audience member');

  // Only the sealed allowlist differs: the member row is valid, active and
  // approved, but its audience is excluded. The publication/decision hashes
  // are recomputed by syntheticAuthority and the scope is actually activated.
  const excludedG=await fresh({priceAudiences:['retail']});
  const excluded=transactionPayload(excludedG,'synthetic-ea-allowlist-excluded',{earlyAccess:true,unpriced:false});
  const excludedBefore=await effectCounts();
  await txRefused(commitSql(excluded),'55000','Quick Order price changed',{quickOrderCode:'DEFINITE_REFUSAL'});
  assert.deepEqual(await effectCounts(),excludedBefore);
  assert.equal((await startupSql(replayCall(excluded))).trim(),'','Excluded price must not consume the actor/key');
  const excludedRetry=transactionPayload(excludedG,excluded.submission.input.idempotencyKey,{earlyAccess:true,unpriced:true});
  await assertCommitted(excludedRetry);countDelta(excludedBefore,await effectCounts(),[1,1,1,1,1]);
  txPass('TX05-EA-allowlist-excluded','Valid member price excluded by independently bound retail-only decision refuses priced snapshot with zero effects; same unused key can request pricing');

  // This is a VALID retail price, not the unsupported private_early_access
  // row already covered by the baseline CHECK control. Both audiences are
  // permitted by the policy so only the canonical member grant excludes it.
  const retailOnlyG=await fresh({priceMode:'retail',priceAudiences:['member','retail']});
  const retailOnly=transactionPayload(retailOnlyG,'synthetic-ea-retail-not-granted',{earlyAccess:true,unpriced:false});
  const retailOnlyBefore=await effectCounts();
  await txRefused(commitSql(retailOnly),'55000','Quick Order price changed',{quickOrderCode:'DEFINITE_REFUSAL'});
  assert.deepEqual(await effectCounts(),retailOnlyBefore);
  assert.equal((await startupSql(replayCall(retailOnly))).trim(),'','A non-member price must not consume the actor/key');
  await assertCommitted(transactionPayload(retailOnlyG,retailOnly.submission.input.idempotencyKey,{earlyAccess:true,unpriced:true}));
  countDelta(retailOnlyBefore,await effectCounts(),[1,1,1,1,1]);
  txPass('TX05-EA-nonmember-refused','Valid allowlisted retail-only row cannot substitute for member grant; priced snapshot refuses, truthful unpriced retry succeeds');

  const identityG=await fresh({}),identityControl=transactionPayload(identityG,'synthetic-ea-identity-control',{earlyAccess:true,unpriced:false});
  await assertCommitted(identityControl,{expectedPriceAudience:'member'});
  const wrongIdentity=transactionPayload(identityG,'synthetic-ea-wrong-customer',{earlyAccess:true,unpriced:false});
  wrongIdentity.actorScope='early_access:eac_'+sha('synthetic-other-customer').slice(0,32);
  wrongIdentity.context.actorScope=wrongIdentity.actorScope;
  const wrongIdentityBefore=await effectCounts();
  await txRefused(commitSql(wrongIdentity),'55000','Quick Order eligibility changed',{quickOrderCode:'DEFINITE_REFUSAL'});
  assert.deepEqual(await effectCounts(),wrongIdentityBefore);assert.equal((await startupSql(replayCall(wrongIdentity))).trim(),'');
  txPass('TX05-EA-private-identity','Valid priced EA control commits; syntactically valid but mismatched EA identity refuses before price selection with zero effects');

  const lockG=await fresh({}),lockP=transactionPayload(lockG,'synthetic-exclusive-gate'),lockBefore=await effectCounts();
  await withSyntheticLock('select pg_advisory_xact_lock(1380471107,1);',async()=>{
    await txRefused(commitSql(lockP),'55P03','Quick Order temporarily unavailable',{quickOrderCode:'DEFINITE_REFUSAL_RETRYABLE'});
  });assert.deepEqual(await effectCounts(),lockBefore);await assertCommitted(lockP);
  const busyLot=transactionPayload(lockG,'synthetic-busy-lot');
  await withSyntheticLock(`select id from public.research_inventory_lots where id='${lockG.lotId}' for update;`,async()=>{
    await txRefused(commitSql(busyLot),'55P03','could not obtain lock on row in relation');
  });await assertCommitted(busyLot);
  const reentrant=transactionPayload(lockG,'synthetic-reentrant');
  await txRefused(`begin;select pg_advisory_xact_lock_shared(1380471107,1);set role service_role;${commitCall(reentrant)}commit;`,
    '55000','Quick Order reentrant admission refused',{quickOrderCode:'DEFINITE_REFUSAL'});
  txPass('TX06','exclusive-gate retry, NOWAIT witness refusal/retry, same-session reentrant refusal');
  const actorP=transactionPayload(lockG,'synthetic-actor-lock'),actorKey=sha('xenios:health:quick-order:key:v1|'+actorP.actorScope+'|'+actorP.submission.input.idempotencyKey);
  const actorBefore=await effectCounts();
  await withSyntheticLock(`select pg_advisory_xact_lock(hashtextextended(${quote('xenios:health:quick-order:actor-key:v1|'+actorP.actorScope+'|'+actorKey)},0));`,async({pid})=>{
    const invalid=copy(actorP);invalid.expectedConfigurationDigest='0'.repeat(64);
    await txRefused(commitSql(invalid),'55000','Quick Order approved limits binding unavailable',{quickOrderCode:'DEFINITE_REFUSAL'});
    const attempt=startupSql(commitSql(actorP)).then(value=>({value}),error=>({error}));
    await awaitBlockedBy(pid);sqlFailure((await attempt).error,'55P03','canceling statement due to lock timeout');
  });assert.deepEqual(await effectCounts(),actorBefore);await assertCommitted(actorP);
  txPass('TX06-actor-admission','bad profile refuses before contended actor lock; admitted actor wait is bounded and retryable after rollback');
  const row11G=await fresh({}),row11P=transactionPayload(row11G,'synthetic-row11-revoke'),row11Before=await effectCounts();
  // Revocation begins in another transaction; the real commit must wait for its
  // session row, then reject the newly committed revoked_at at decisionAt.
  const pending=await withSyntheticLock(`update public.research_private_early_access_sessions set revoked_at=clock_timestamp() where session_hash='${row11G.sessionHash}';`,async({pid})=>{
    const attempt=startupSql(commitSql(row11P)).then(value=>({value}),error=>({error}));
    await awaitBlockedBy(pid);return {attempt};
  },'commit');
  sqlFailure((await pending.attempt).error,'55000','Quick Order eligibility changed',{quickOrderCode:'DEFINITE_REFUSAL'});
  assert.deepEqual(await effectCounts(),row11Before);txPass('TX06-row11','observed session-row wait followed by same-instant revoked-session refusal');
  // Restore a separate live synthetic authority for the profile/revoke pair.
  const finalG=await fresh({}),finalP=transactionPayload(finalG,'synthetic-before-final-revoke');await assertCommitted(finalP);
  const profileP=transactionPayload(finalG,'synthetic-profile-missing'),beforeProfile=await effectCounts();
  profileP.expectedConfigurationDigest='0'.repeat(64);
  await txRefused(commitSql(profileP),'55000','Quick Order approved limits binding unavailable',{quickOrderCode:'DEFINITE_REFUSAL'});
  await txRefused(`set lock_timeout='0';\n${commitSql(transactionPayload(finalG,'synthetic-timer-disabled'))}`,
    '55000','Quick Order effective timer unavailable or unsupported',{quickOrderCode:'DEFINITE_REFUSAL'});
  assert.deepEqual(await effectCounts(),beforeProfile);
  await syntheticRoute('writer');
  await txJson(`select public.research_health_quick_order_revoke_revision('${finalG.revisionId}','synthetic-review-revocation')::text;`);
  finalG.route=await syntheticRoute('intake');
  const afterRevoke=transactionPayload(finalG,'synthetic-after-revocation');
  await txRefused(commitSql(afterRevoke),'55000','Quick Order authority unavailable',{quickOrderCode:'DEFINITE_REFUSAL'});
  const recover=copy(finalP);recover.expectedConfigurationDigest='0'.repeat(64);
  const recovered=await assertCommitted(recover,{replayed:true});assert.equal(recovered.publicReference,(await txJson(replayCall(finalP))).publicReceipt.publicReference);
  txPass('TX07','invalid profile/timer refuses new request; actual revoke refuses new key while committed receipt remains recoverable');
  await boundary(providerBefore);
  // A lock before the fifth effect proves rollback of four prior writes. It
  // does NOT exercise a failure after all five writes or uncertain COMMIT.
  return {cases:copy(txCaseResults),execution:'OBSERVED_ONLY_IF_THIS_FUNCTION_COMPLETES',
    remaining:['post-fifth-effect/commit-acknowledgment fault','hosted timeout/disconnect contract','admin-attested trusted checkout positive',
      'canonical Early Access-to-member price correction independent acceptance/execution','full writer/revocation timing matrix']};
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
  const targetVersion=Number((await psql('show server_version_num;')).trim());
  assert.ok(Number.isInteger(targetVersion)&&targetVersion>=170011&&targetVersion<180000,
    'The accepted floor is PostgreSQL 17.11; another major or lower minor refuses');
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
  await canonicalTransactionBootstrap();
  // Exact dependency source only: no NULL replacement, test seal, caller-supplied
  // source descriptor or learned target digest is permitted here.
  for(const source of [await load(CURRENTNESS+'.precheck.sql'),currentnessCandidate,await load(CURRENTNESS+'.postcheck.sql')]) {
    await psql(`set research_health_quick_order.currentness_definition=${quote(receipt.currentnessDefinition)};\n`+source);
  }
  // Stress only the new candidate's revokes, after every predecessor is created.
  await psql(`alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  const before=(await psql(fingerprint)).trim();
  await boundary(before);await psql(precheck);await psql(candidate);await psql(postcheck);await boundary(before);
  await psql(candidate);await psql(postcheck);await boundary(before);
  pass('exact absent install and identical reapply preserve provider integrity/fingerprint and independently checked 19 trigger states');
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
  await refused(service("select public.research_health_quick_order_commit('{}'::jsonb);"),'55000');
  for(const role of ['anon','authenticated']) await refused("set role "+role+";select public.research_health_quick_order_commit('{}'::jsonb);",'42501');
  pass('client roles cannot call readers/commit; missing-context commit refuses');
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
  // Synthetic non-submitted injected-key regression through the actual canonical
  // writer. Neither a partial nor a closed-key status note identifies an intake.
  for(const [expectedStatus,newStatus,evidence] of [
    ['submitted','reviewing',{payloadHash:'operator-note'}],
    ['reviewing','waiting_on_customer',{intakeKind:'quick-order-v1',payloadHash}],
  ]) {
    await psql(service(`select public.research_assisted_order_set_status(
      ${quote(uuid(10))},${quote(expectedStatus)},${quote(newStatus)},'synthetic-operator','admin',
      null,null,${j(evidence)},${quote(time)}::timestamptz);`));
    const injected=await json(service(detail(10)));
    assert.equal(injected.detail.status,newStatus);
    assert.equal(injected.submittedEvent,null);assert.equal(injected.enrichment,null);
  }
  await psql(rollback);await psql(precheck);await boundary(before);
  await psql(candidate);await psql(postcheck);await boundary(before);
  const retainedLegacy=await json(service(detail(10)));
  assert.equal(retainedLegacy.detail.status,'waiting_on_customer');
  assert.equal(retainedLegacy.submittedEvent,null);assert.equal(retainedLegacy.enrichment,null);
  pass('synthetic non-submitted injected-key regression: canonical status notes preserve legacy readback and empty rollback/reinstall');
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
  const transactionControls=await runSyntheticTransactionControls();
  process.stdout.write('INTAKE_READER_SUBSET_COMPLETE '+JSON.stringify({checks,sourceCommit:receipt.sourceCommit,
    result:'PARTIAL_ONLY',qualification:'HELD_FULL_EXECUTION_EVIDENCE_INCOMPLETE',transactionControls,held})+'\n');
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
