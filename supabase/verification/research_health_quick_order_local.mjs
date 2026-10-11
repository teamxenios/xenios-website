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
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CANDIDATE = 'supabase/candidates/20261005_research_health_quick_order_intake';
const SELF = 'supabase/verification/research_health_quick_order_local.mjs';
const BINDINGS = 'docs/health-launch/quick-order-20261005/evidence/doc71-disabled-source-bindings-20261009.json';
const OWN = [CANDIDATE+'.sql', CANDIDATE+'.precheck.sql', CANDIDATE+'.postcheck.sql', CANDIDATE+'.rollback.md', SELF];
const BOOTSTRAP = 'supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql';
const OUTBOX = 'supabase/research-notification-outbox.sql';
const CURRENTNESS = 'supabase/candidates/20261006_research_health_quick_order_currentness';
const CUSTOMER_STATUS = 'supabase/candidates/20260921_research_assisted_order_member_history.sql';
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
  'source-authored transaction controls require the separately accepted receipt/descriptor and fresh execution authority; runtime observations, if any, are reported per case',
  'authenticated actor/key derivation and standing/legal/Health admission',
  'guarded catalog/legal/destination authority currentness and classification truth',
  'concurrent writers, lock boundaries, epoch scope and liveness',
  'lost-response/restart commit durability and changed-input conflict',
  'real adapter/decoder end-to-end qualification and classification display',
  'notification dispatcher transport/retry/delivery and operational intake',
  'owner-resistant immutability is not claimed; SQL owner is the disclosed trust boundary',
  'admin-attested row-8 checkout binding absent from four-field private context: branch refuses',
  'Doc82 currentness source accepted; any new records-only dependency receipt requires original byte confirmation; intake acceptance remains pending',
  'adapter mapping controls require separately accepted installed Node/tsx dependency inventory and explicit future dispatch; no current CLI dispatch added',
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
function run(command,args,{input='',timeout=30_000,allowAfterInterrupt=false,captureDiagnostics=false}={}) {
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
      else resolve(captureDiagnostics?{stdout:out,stderr:err}:out); // Preserve exact Git stdout by default; notices are explicit control evidence.
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
const dependency=receipt.currentnessDependency;
assert.ok(dependency&&typeof dependency==='object'&&!Array.isArray(dependency));
assert.equal(dependency.status,'SOURCE_ACCEPT_WITH_LIMITS');
assert.match(dependency.reviewCommit??'',/^[a-f0-9]{40}$/);
assert.match(dependency.sourceCommit??'',/^[a-f0-9]{40}$/);
assert.match(dependency.sourceTree??'',/^[a-f0-9]{40}$/);
assert.equal(dependency.definitionSha256,receipt.currentnessDefinition);
assert.equal(dependency.sealStatus,'FINAL_CURRENTNESS_DEPENDENCY_ONLY');
assert.equal(dependency.receipt?.path,'docs/health-launch/quick-order-20261005/evidence/sql-currentness-source-receipt-doc71-20261009.json');
assert.match(dependency.receipt?.recordsCommit??'',/^[a-f0-9]{40}$/);
assert.match(dependency.receipt?.gitBlob??'',/^[a-f0-9]{40}$/);
assert.match(dependency.receipt?.rawSha256??'',/^[a-f0-9]{64}$/);
assert.ok(Number.isSafeInteger(dependency.receipt?.bytes)&&dependency.receipt.bytes>0);
assert.equal(receipt.disclosures.sharedBindings,BINDINGS);

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
for(const file of [...OWN,BINDINGS,BOOTSTRAP,OUTBOX,CUSTOMER_STATUS,...MIGRATIONS,...TRANSACTION_PREDECESSORS,
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
const embeddedDefinition=[...candidate.matchAll(/expected_currentness_definition\s+(?:pg_catalog\.)?text\s*:=\s*'([a-f0-9]{64})'/g)];
assert.equal(embeddedDefinition.length,1,'Exactly one explicit currentness definition binding');
assert.equal(embeddedDefinition[0][1],receipt.currentnessDefinition);

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
function startupSql(body,{captureDiagnostics=false}={}) {
  assert.match(containerId??'',/^[a-f0-9]{64}$/);
  return docker(['exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1',
    '-U','postgres','-d','postgres'],{input:'\\set VERBOSITY verbose\n'+body+'\n',timeout:30_000,captureDiagnostics});
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
async function syntheticRoute(routeClass,{longWaits=false}={}) {
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
  // DOC83 overlap-only fixture budgets. These are not proposed deployed values.
  if(longWaits){
    Object.assign(carrier.intake,{lockTimeoutMs:20000,deadlockTimeoutMs:21000,idleTimeoutMs:22000,statementTimeoutMs:24000,
      transactionTimeoutMs:26000,cleanupMs:1000,acquisitionMs:500,responseMs:500,attemptDeadlineMs:28000});
    Object.assign(carrier.writer,{lockTimeoutMs:27000,gateWaitMs:27000,postGateReserveMs:1000,deadlockTimeoutMs:1000,
      idleTimeoutMs:28000,statementTimeoutMs:30000,transactionTimeoutMs:35000,cleanupMs:1000,acquisitionMs:500,responseMs:500,attemptDeadlineMs:37000});
  }
  assert.deepEqual(Object.keys(carrier),bindingPacket.digestContract.fields,'Synthetic carrier uses the sealed field order');

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
  priceAudiences=['member'],retailDecoy=false,sessionIssuedOffsetMs=-60_000,bindingBoundOffsetMs=-60_000,
  legalVerifiedOffsetMs=-60_000,agreementMode='valid',documentReviewedOffsetMs=-60_000,documentReportOffsetDays=-1,domainPublic=true}={}) {
  const k=50000+n*100,id=offset=>uuid(k+offset),customerId='synthetic_doc71_customer_'+n;
  const now=await json("select json_build_object('at',to_char(date_trunc('milliseconds',clock_timestamp()) at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"'))::text;");
  const at=now.at,earlier=new Date(Date.parse(at)-60_000).toISOString();
  const fixtureTime=offset=>new Date(Date.parse(at)+offset).toISOString();
  const issued=fixtureTime(sessionIssuedOffsetMs),bound=fixtureTime(bindingBoundOffsetMs),verified=fixtureTime(legalVerifiedOffsetMs),reviewed=fixtureTime(documentReviewedOffsetMs);
  assert.ok(['valid','missing','wrong-version'].includes(agreementMode));
  assert.ok(Number.isInteger(documentReportOffsetDays));
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
      values('${g.sessionHash}',${quote(customerId)},${quote(bound)});
    insert into public.research_early_access_legal_bindings(id,customer_ref,member_id,established_by,verified_at,attested_by)
      values('${g.legalId}','${g.customerRef}','${g.memberId}',${quote(legalMode)},${quote(verified)},${quote(legalMode==='verified_link'?null:'synthetic-steward')});
    insert into public.research_private_early_access_sessions(session_hash,owner_id,access_role,issued_at,expires_at,revoked_at)
      values('${g.sessionHash}','${g.ownerId}','private_early_access_member',${quote(issued)},
        ${quote(issued)}::timestamptz+interval '240 minutes',${sessionRevoked?quote(at):'null'});
    insert into public.research_early_access_agreement_acceptances(customer_ref,agreement_kind,agreement_version,accepted_at,recorded_at)
      values('${g.customerRef}','Synthetic Health A','synthetic-v1',${quote(earlier)},${quote(earlier)})
        ${agreementMode==='missing'?'':`,('${g.customerRef}','Synthetic Health B',${quote(agreementMode==='wrong-version'?'synthetic-v2':'synthetic-v1')},${quote(earlier)},${quote(earlier)})`};
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
        current_date+${documentReportOffsetDays},${quote(reviewed)},'synthetic-fixture',${quote(earlier)},'synthetic-fixture');
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
      values('${g.domain}',${quote(domainPublic?'public_enabled':'paused')},true,1,public.research_required_input_manifest_hash('${g.domain}'),1,
        'synthetic-fixture',${quote(earlier)},'synthetic-fixture',${quote(earlier)},'synthetic-fixture','Synthetic only');
    commit;`);
  doc83FixtureExpectations.set(g.sessionHash,{memberId:g.memberId});
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
async function assertCommitted(p,{replayed=false,expectedPriceAudience='member',result:existingResult}={}) {
  const result=existingResult??await txJson(commitSql(p));
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
  await doc83AssertReadback(p,result,readback,tuple.at);

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
  const timer=setTimeout(()=>{child.kill();rejectReady(new Error('Synthetic lock holder deadline'));},35_000);
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
    set statement_timeout='25s';set transaction_timeout='28s';set idle_in_transaction_session_timeout='25s';
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

// IC-2 source-authored adapter controls. NOT DISPATCHED by the historical CLI.
// Future dispatch must be separately reviewed and authorized with the exact
// installed Node/tsx closure; it is not supplied by fixture hashes or this code.
const DOC81_ADAPTER_SOURCE_PATHS=[
  'server/research/assisted-order/quick-order-repository.ts',
  'shared/research/assisted-order/contract.ts',
  'server/research/health/quick-order/handler.mjs',
  'server/research/health/quick-order/core.mjs',
  'server/research/health/quick-order/paths.mjs',
  'package.json','package-lock.json',
];
async function doc81RunAdapterMappingControls(runtimeBinding) {
  assert.equal(runtimeBinding?.status,'SOURCE_ACCEPT_WITH_LIMITS');
  assert.match(runtimeBinding?.reviewCommit??'',/^[a-f0-9]{40}$/);
  assert.match(runtimeBinding?.executionAuthoritySha256??'',/^[a-f0-9]{64}$/);
  assert.equal(runtimeBinding?.sourceCommit,receipt.sourceCommit);
  assert.deepEqual(process.execArgv,['--import','tsx'],'Only the separately reviewed existing tsx loader is eligible');
  assert.equal(process.version,'v20.19.0');
  assert.equal(sha(await readFile(process.execPath)),runtimeBinding.nodeSha256);
  assert.ok(Array.isArray(runtimeBinding.installedFiles)&&runtimeBinding.installedFiles.length>0&&runtimeBinding.installedFiles.length<=512);
  const runtimePaths=new Set();
  for(const pin of runtimeBinding.installedFiles){
    assert.match(pin.sha256,/^[a-f0-9]{64}$/);assert.ok(pin.path.startsWith('node_modules/'));
    assert.ok(!runtimePaths.has(pin.path));runtimePaths.add(pin.path);
    const resolved=await realpath(safeRelative(pin.path));assert.ok(contained(resolved,realRoot));
    assert.equal(sha(await readFile(resolved)),pin.sha256,'Reviewed installed dependency byte binding');
  }
  assert.ok(runtimePaths.has('node_modules/tsx/package.json')&&runtimePaths.has('node_modules/tsx/dist/loader.mjs'));
  // The original reviewer must confirm that installedFiles is the complete
  // transitive runtime closure; this loop alone does not establish completeness.
  for(const file of DOC81_ADAPTER_SOURCE_PATHS)await load(file);
  const module=await import(pathToFileURL(safeRelative(DOC81_ADAPTER_SOURCE_PATHS[0])).href);
  const {submissionHash}=await import(pathToFileURL(safeRelative('server/research/health/quick-order/handler.mjs')).href);
  const {ESTIMATE_EXCLUSIONS}=await import(pathToFileURL(safeRelative('server/research/health/quick-order/core.mjs')).href);
  const viewer={actorType:'member',memberId:'synthetic-member',authUserId:'c0000000-0000-4000-8000-000000000001',
    earlyAccessSessionHash:null,normalizedEmail:'synthetic@example.invalid',capabilities:new Set(['assisted_orders:submit'])};
  const actor='member:'+viewer.authUserId,context={rawStoredSessionHash:'e'.repeat(64),configuredOwnerId:'c0000000-0000-4000-8000-000000000002',actorScope:actor,requiredRole:'synthetic-role'};
  const profile={schemaVersion:'quick-order-approved-limits-v1',profileId:'synthetic-nonproduction',profileVersion:'synthetic-v1',
    database:{name:'synthetic_db',oid:'10'},loginRole:{name:'synthetic_login',oid:'11'},requestRole:{name:'service_role',oid:'12'},ownerRole:{name:'synthetic_owner',oid:'13'},
    routeClass:'intake',routeId:'synthetic-route',timeZone:'UTC',dateStyle:'ISO, YMD',
    intake:{lockTimeoutMs:250,statementTimeoutMs:4000,transactionTimeoutMs:5000,idleTimeoutMs:1000,deadlockTimeoutMs:1000,cleanupMs:1000,attemptDeadlineMs:8000,acquisitionMs:1000,responseMs:1000},
    writer:{lockTimeoutMs:7000,statementTimeoutMs:15000,transactionTimeoutMs:20000,idleTimeoutMs:1000,deadlockTimeoutMs:1000,cleanupMs:1000,attemptDeadlineMs:24000,acquisitionMs:1000,responseMs:2000,gateWaitMs:7000,postGateReserveMs:1000},
    enforcement:{preBeginAttestationSha256:'a'.repeat(64),writerOrderAttestationSha256:'b'.repeat(64),singleRpcAutocommit:true}};
  const raw=JSON.stringify(profile),address={line1:'1 Synthetic Way',line2:'',city:'Test City',region:'IL',postalCode:'60000',countryCode:'US'};
  const input={schemaVersion:'quick-order-v1',idempotencyKey:'Synthetic_IC2_Key_0001',
    contact:{fullLegalName:'Synthetic Customer',email:'synthetic@example.invalid',mobilePhone:'+12025550100',organizationName:'',ageConfirmed:true,shippingAddress:address,billingSameAsShipping:true,billingAddress:{...address}},
    referral:{kind:'person',detail:'Synthetic referrer',declaredCode:'',confirmed:true},affiliation:{kind:'none',detail:''},
    lines:[{productId:'synthetic-product',variantId:'synthetic-variant',quantity:2,expectedCatalogVersion:'synthetic-catalog-v1',expectedPriceVersion:'synthetic-price-v1'}],
    agreements:[{kind:'synthetic-terms',version:'synthetic-v1'}],requestAcknowledged:true};
  const receivedAt='2026-10-11T00:00:00.000Z',estimate={knownSubtotalCents:2500,estimateComplete:true,currency:'USD',excludes:ESTIMATE_EXCLUSIONS};
  const submission={input,payloadHash:submissionHash(input),receivedAt,
    attribution:{schemaVersion:'attribution-v1',source:'person',sourceDetail:'Synthetic referrer',declaredAffiliateCode:null,affiliation:{kind:'none',detail:''},confirmedByCustomer:true,receivedAt,reviewState:'captured_unmatched',commissionState:'not_authorized'},
    snapshots:[{productId:'synthetic-product',variantId:'synthetic-variant',quantity:2,workflowMode:'direct_order_request',unitPriceCents:1250,catalogVersion:'synthetic-catalog-v1',priceVersion:'synthetic-price-v1'}],computedEstimate:estimate};
  const publicReceipt={requestId:'c0000000-0000-4000-8000-000000000003',publicReference:'XRR-20261011-ABCDEF0123',attributionState:'captured_unmatched',estimate};
  const marked={code:'55000',message:'Quick Order scope unavailable before resolver',details:'{"quickOrderCode":"DEFINITE_REFUSAL_CATALOG_CHANGED"}'};
  const rows=[
    ['positive',{data:{...publicReceipt,persisted:true,replayed:false},error:null,transactionOutcome:'committed'},null],
    ['marked-aborted',{data:null,error:marked,transactionOutcome:'aborted'},'DEFINITE_REFUSAL'],
    ['integrity-unmarked',{data:null,error:{code:'55000',message:'Quick Order currentness schema drift'},transactionOutcome:'aborted'},'OUTCOME_UNCERTAIN'],
    ['seal-unmarked',{data:null,error:{code:'55000',message:'Quick Order sealed scope rows changed'},transactionOutcome:'aborted'},'OUTCOME_UNCERTAIN'],
    ['marked-unconfirmed',{data:null,error:marked},'OUTCOME_UNCERTAIN'],
  ];
  const results=[];
  for(const [id,response,outcome] of rows){
    const calls=[];let cancellations=0;
    const extension=module.createQuickOrderTransactionExtension({
      rpc:async(name,args)=>{calls.push({name,args});return response;},approvedLimitsJson:raw,expectedConfigurationDigest:sha(raw),
      notificationRecipient:'synthetic-operator@example.invalid',privateContextFor:()=>context,
      runtime:{now:()=>0,maximumDelayMs:24000,schedule:()=>()=>{cancellations++;}},
    });
    const attempt=extension.beginAttempt(viewer,actor,0);assert.ok(attempt,'Valid synthetic admission reaches the actual adapter');
    let value,failure;try{value=await extension.commitAttempt(viewer,actor,copy(submission),attempt);}catch(error){failure=error;}
    if(outcome){assert.equal(failure?.outcome,outcome,id);assert.equal(value,undefined,'No success receipt manufactured');
      if(id==='marked-aborted'){assert.equal(failure.status,409);assert.equal(failure.code,'catalog_changed');}}
    else {assert.equal(failure,undefined);assert.deepEqual(value,{...publicReceipt,persisted:true,replayed:false});}
    assert.equal(calls.length,1);assert.equal(calls[0].name,module.QUICK_ORDER_COMMIT_RPC);
    assert.equal(calls[0].args.p_payload.submission.input.idempotencyKey,input.idempotencyKey);
    assert.equal(calls[0].args.p_payload.submission.payloadHash,submission.payloadHash);assert.equal(cancellations,1);
    results.push({id:'IC2-adapter-'+id,result:'OBSERVED_SYNTHETIC_ADAPTER_ONLY',databaseWireReachability:'NOT_PROVEN'});
  }
  return results;
}

async function runSyntheticTransactionControls() {
  const providerBefore=(await psql(fingerprint)).trim();
  let index=1;const fresh=async options=>activateSynthetic(await seedTransactionGraph(index++,options));
  const g=await fresh({}),p=transactionPayload(g,'synthetic-doc71-positive');
  const noOtherBefore=await doc83OtherEffects();
  const baseline=await effectCounts(),first=await assertCommitted(p);
  assert.deepEqual(await doc83OtherEffects(),noOtherBefore,'TC6: no notification attempt, token, document, reservation or commission-hold effect');
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
  await doc83ShadowControls(g,p,first);

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
  await doc83ActorRace(g,false);
  await doc83ActorRace(g,true);

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
    await txRefused(commitSql(payload),'55000',message,doc83Detail(message));
    assert.deepEqual(await effectCounts(),before);assert.equal((await startupSql(replayCall(payload))).trim(),'');
    txPass(id,'matched canonical positive commits; activated negative with one changed eligibility value reaches exact refusal and zero effects');
  }
  // IC-2: pre-resolver NULL/partial matches must produce the intake marker.
  // Each negative has otherwise valid admission and a committing positive twin.
  for(const mode of ['zero','partial']) {
    const positive=await fresh({}),positivePayload=transactionPayload(positive,'synthetic-ic2-'+mode+'-positive');
    const positiveBefore=await effectCounts();await assertCommitted(positivePayload);
    countDelta(positiveBefore,await effectCounts(),[1,1,1,1,1]);
    const negative=await fresh({}),payload=transactionPayload(negative,'synthetic-ic2-'+mode+'-negative');
    const missingVariant='dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    if(mode==='zero') {
      payload.submission.input.lines[0].variantId=missingVariant;
      payload.submission.snapshots[0].variantId=missingVariant;
    } else {
      payload.submission.input.lines.push({...copy(payload.submission.input.lines[0]),variantId:missingVariant});
      payload.submission.snapshots.push({...copy(payload.submission.snapshots[0]),variantId:missingVariant});
      payload.submission.computedEstimate.knownSubtotalCents*=2;
    }
    rehash(payload);const before=await effectCounts();
    await txRefused(commitSql(payload),'55000','Quick Order scope unavailable before resolver',doc83Detail('Quick Order scope unavailable before resolver'));
    assert.deepEqual(await effectCounts(),before,'Pre-resolver refusal leaves all five saved-effect relations unchanged');
    assert.equal((await startupSql(replayCall(payload))).trim(),'','No saved key or success receipt');
    txPass('IC2-'+mode+'-offer-match','Valid admitted twin commits; exact marked refusal has zero persisted effects');
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
  const wrongVersionBefore=await effectCounts();
  await txRefused(commitSql(wrongVersion),'55000','Quick Order price changed',doc83Detail('Quick Order price changed'));
  assert.deepEqual(await effectCounts(),wrongVersionBefore);assert.equal((await startupSql(replayCall(wrongVersion))).trim(),'');
  await assertCommitted(transactionPayload(priceG,wrongVersion.submission.input.idempotencyKey));
  countDelta(wrongVersionBefore,await effectCounts(),[1,1,1,1,1]);
  txPass('TX05','member price.id contract; no tier columns; unpriced member/EA; baseline rejects EA audience and duplicate active row');

  // Canonical early-access-retail-pricing.ts grants an admitted EA session the
  // member audience. Actor scope remains early_access; no invented price row
  // audience, member identity replacement or generic first-price fallback.
  const pricedEaG=await fresh({retailDecoy:true,priceAudiences:['member','retail']});
  const pricedEa=transactionPayload(pricedEaG,'synthetic-priced-ea-member-grant',{earlyAccess:true,unpriced:false});
  const pricedEaBefore=await effectCounts();
  const pricedEaResult=await assertCommitted(pricedEa,{expectedPriceAudience:'member'});
  countDelta(pricedEaBefore,await effectCounts(),[1,1,1,1,1]);
  await doc83EaOwnership(pricedEa,pricedEaResult);
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
  await txRefused(commitSql(excluded),'55000','Quick Order price changed',doc83Detail('Quick Order price changed'));
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
  await txRefused(commitSql(retailOnly),'55000','Quick Order price changed',doc83Detail('Quick Order price changed'));
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
  await txRefused(commitSql(wrongIdentity),'55000','Quick Order eligibility changed',doc83Detail('Quick Order eligibility changed'));
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
  const reentrant=transactionPayload(lockG,'synthetic-reentrant'),reentrantBefore=await effectCounts(),reentrantOther=await doc83OtherEffects();
  await txRefused(`begin;select pg_advisory_xact_lock_shared(1380471107,1);set role service_role;${commitCall(reentrant)}commit;`,
    '55000','Quick Order reentrant admission refused',doc83Detail('Quick Order reentrant admission refused'));
  assert.deepEqual(await effectCounts(),reentrantBefore);assert.deepEqual(await doc83OtherEffects(),reentrantOther);
  assert.equal((await startupSql(replayCall(reentrant))).trim(),'');await assertCommitted(reentrant);
  countDelta(reentrantBefore,await effectCounts(),[1,1,1,1,1]);
  await doc83GateControls(lockG);
  txPass('TX06','exclusive/queued-writer refusal, shared-only grant, NOWAIT witness refusal/retry, reentrant no effects and retry');
  const actorP=transactionPayload(lockG,'synthetic-actor-lock'),actorKey=sha('xenios:health:quick-order:key:v1|'+actorP.actorScope+'|'+actorP.submission.input.idempotencyKey);
  const actorBefore=await effectCounts();
  await withSyntheticLock(`select pg_advisory_xact_lock(hashtextextended(${quote('xenios:health:quick-order:actor-key:v1|'+actorP.actorScope+'|'+actorKey)},0));`,async({pid})=>{
    const invalid=copy(actorP);invalid.expectedConfigurationDigest='0'.repeat(64);
    await txRefused(commitSql(invalid),'55000','Quick Order approved limits binding unavailable',doc83Detail('Quick Order approved limits binding unavailable'));
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
  sqlFailure((await pending.attempt).error,'55000','Quick Order eligibility changed',doc83Detail('Quick Order eligibility changed'));
  assert.deepEqual(await effectCounts(),row11Before);txPass('TX06-row11','observed session-row wait followed by same-instant revoked-session refusal');
  // Restore a separate live synthetic authority for the profile/revoke pair.
  await doc83NegativeMatrix(fresh);
  const finalG=await fresh({}),finalP=transactionPayload(finalG,'synthetic-before-final-revoke');const finalSaved=await assertCommitted(finalP);
  const recoveryBefore=await effectCounts();
  for(const [id,sql] of [['zero-timer',`set lock_timeout='0';${commitSql(finalP)}`],['no-set-role',commitCall(finalP)]]){
    const recovered=await txJson(sql);assert.deepEqual(recovered,{...finalSaved,replayed:true});
    assert.deepEqual(await effectCounts(),recoveryBefore);txPass('TC7-recovery-'+id,'Existing receipt precedes timer/route admission; identical receipt, no new effects');
  }
  const profileP=transactionPayload(finalG,'synthetic-profile-missing'),beforeProfile=await effectCounts();
  profileP.expectedConfigurationDigest='0'.repeat(64);
  await txRefused(commitSql(profileP),'55000','Quick Order approved limits binding unavailable',doc83Detail('Quick Order approved limits binding unavailable'));
  await txRefused(`set lock_timeout='0';\n${commitSql(transactionPayload(finalG,'synthetic-timer-disabled'))}`,
    '55000','Quick Order effective timer unavailable or unsupported',doc83Detail('Quick Order effective timer unavailable or unsupported'));
  assert.deepEqual(await effectCounts(),beforeProfile);
  await syntheticRoute('writer');
  await txJson(`select public.research_health_quick_order_revoke_revision('${finalG.revisionId}','synthetic-review-revocation')::text;`);
  finalG.route=await syntheticRoute('intake');
  const afterRevoke=transactionPayload(finalG,'synthetic-after-revocation');
  await txRefused(commitSql(afterRevoke),'55000','Quick Order authority unavailable',doc83Detail('Quick Order authority unavailable'));
  const recover=copy(finalP);recover.expectedConfigurationDigest='0'.repeat(64);
  const recovered=await assertCommitted(recover,{replayed:true});assert.equal(recovered.publicReference,(await txJson(replayCall(finalP))).publicReceipt.publicReference);
  txPass('TX07','invalid profile/timer refuses new request; actual revoke refuses new key while committed receipt remains recoverable');
  await boundary(providerBefore);
  // A lock before the fifth effect proves rollback of four prior writes. It
  // does NOT exercise a failure after all five writes or uncertain COMMIT.
  return {cases:copy(txCaseResults),execution:'OBSERVED_ONLY_IF_THIS_FUNCTION_COMPLETES',
    remaining:['post-fifth-effect/commit-acknowledgment fault','hosted timeout/disconnect contract','admin-attested trusted checkout positive',
      'canonical Early Access-to-member price correction independent acceptance/execution','full writer/revocation timing matrix',
      'price-ambiguous branch unreachable under canonical one-active-price unique index',
      'stored access-role mismatch unreachable under exact session CHECK; input-role refusal and canonical CHECK control are separate',
      'C10 intake alternate-server/version/max_prepared_transactions controls require separately authorized alternate server',
      'explicit transaction-budget branches are defence in depth: transaction_timeout normally terminates first',
      'adapter mapping function UNDISPATCHED; no hosted transaction outcome or transport proof' ]};
}
// DOC83 future synthetic controls. None bypass receipt, descriptor or source seals.
const doc83FixtureExpectations=new Map();
const DOC83_OTHER_RELATIONS=['research_notification_attempts','research_assisted_order_access_tokens','research_assisted_order_documents',
  'research_lot_reservations','research_lot_reservation_allocations','research_inventory_reservation_events',
  'research_early_access_reservations','research_early_access_commission_events'];
function doc83Detail(message){
  let category;
  if(message==='Quick Order agreement pair changed')category='TERMS_CHANGED';
  else if(/Quick Order (?:scope|witness|quality witness|stock witness|offer|price|estimate|snapshot)/.test(message))category='CATALOG_CHANGED';
  else if(/Quick Order (?:input unavailable|identity unavailable|private context|eligibility|trusted checkout|session binding|locked session binding|customer unavailable|locked customer|legal binding|locked legal binding|member unavailable|private session|quantity invalid)/.test(message))category='INVALID_INPUT';
  else category='UNAVAILABLE';
  return {quickOrderCode:'DEFINITE_REFUSAL_'+category};
}
async function doc83OtherEffects(){
  const snapshots={};
  for(const table of DOC83_OTHER_RELATIONS){
    // Full synthetic rows detect modifications as well as new side effects.
    snapshots[table]=await json(`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text from public.${table} t;`);
  }
  return snapshots;
}
async function doc83NoSave(p,before,other){
  assert.deepEqual(await effectCounts(),before);assert.deepEqual(await doc83OtherEffects(),other);
  assert.equal((await startupSql(replayCall(p))).trim(),'','Refusal cannot leave a saved key or public receipt');
}
async function doc83EaOwnership(p,result){
  const raw=p.context.rawStoredSessionHash,viewerHash=sha(raw);
  const statusSql=hash=>service(`select public.research_assisted_order_customer_status(${quote(result.publicReference)},null,${quote(hash)},null)::text;`);
  const owned=await txJson(statusSql(viewerHash));
  assert.equal(owned.requestId,result.requestId);assert.equal(owned.publicReference,result.publicReference);
  assert.equal((await startupSql(statusSql(raw))).trim(),'');assert.equal((await startupSql(statusSql(sha('synthetic-wrong-session')))).trim(),'');
  const identity=await json(`select json_build_object('stored',(select early_access_session_hash from public.research_assisted_order_requests where id=${quote(result.requestId)}::uuid),
    'rawPresent',exists(select 1 from public.research_assisted_order_requests r join public.research_private_early_access_sessions s on r.early_access_session_hash=s.session_hash))::text;`);
  assert.equal(identity.stored,viewerHash);assert.equal(identity.rawPresent,false);
  txPass('TC1-EA-owned-status-double-hash','Actual customer_status with null member/token accepts viewer hash; raw/wrong hashes refuse; no request stores a raw private-session lookup key');
}
async function doc83AssertReadback(p,result,envelope,decisionAt){
  const keys=(value,expected)=>assert.deepEqual(Object.keys(value).sort(),[...expected].sort());
  keys(envelope,['schemaVersion','requestId','detail','submittedEvent','enrichment']);
  assert.equal(envelope.schemaVersion,'quick-order-admin-envelope-v1');assert.equal(envelope.requestId,result.requestId);
  const d=envelope.detail,i=p.submission.input,a=p.submission.attribution;
  keys(d,['requestId','publicReference','status','source','actorMemberId','fullLegalName','email','mobilePhone','organizationName','shippingAddress','billingAddress','lines','estimatedTotalCents','currency','generalNotes','agreements','affiliateAttributionRef','declaredAffiliateCode','declaredAffiliateCodeState','timeline','documents','createdAt','updatedAt']);
  assert.equal(d.publicReference,result.publicReference);assert.equal(d.fullLegalName,i.contact.fullLegalName);
  assert.equal(d.actorMemberId,doc83FixtureExpectations.get(p.context.rawStoredSessionHash)?.memberId,'Actual canonical member UUID from the independent fixture seed');
  assert.equal(d.email,i.contact.email.toLowerCase());assert.equal(d.mobilePhone,i.contact.mobilePhone);
  assert.equal(d.organizationName,i.contact.organizationName||null);assert.deepEqual(d.shippingAddress,i.contact.shippingAddress);assert.deepEqual(d.billingAddress,i.contact.billingAddress);
  const pairs=i.agreements.map(x=>({kind:x.kind,version:x.version})).sort((x,y)=>x.kind<y.kind?-1:x.kind>y.kind?1:x.version<y.version?-1:x.version>y.version?1:0);
  assert.deepEqual(d.agreements,pairs);assert.equal(d.estimatedTotalCents,p.submission.computedEstimate.knownSubtotalCents||null);assert.equal(d.currency,'USD');
  assert.equal(d.source,'early_access_manual_order_bridge');assert.equal(d.generalNotes,null);assert.equal(d.affiliateAttributionRef,null);
  assert.equal(d.declaredAffiliateCode,a.declaredAffiliateCode||null);assert.equal(d.declaredAffiliateCodeState,a.declaredAffiliateCode?'captured_unmatched':'not_provided');
  assert.equal(d.createdAt,decisionAt);assert.equal(new Date(d.updatedAt).toISOString(),decisionAt);assert.deepEqual(d.documents,[]);
  assert.deepEqual(d.timeline.map(event=>({...event,occurredAt:new Date(event.occurredAt).toISOString()})),
    [{status:'submitted',occurredAt:decisionAt,customerMessage:'Your request has been received.'}]);
  assert.equal(d.lines.length,i.lines.length);
  for(const inputLine of i.lines){
    const line=d.lines.find(x=>x.productId===inputLine.productId&&x.variantId===inputLine.variantId);
    const snapshot=p.submission.snapshots.find(x=>x.productId===inputLine.productId&&x.variantId===inputLine.variantId);
    assert.ok(line&&snapshot);keys(line,['lineId','productId','variantId','productName','specification','format','packBasis','quantity','minimumQuantity','maximumQuantity','quantityIncrement','workflowMode','customerActionLabel','unitPriceCents','lineEstimateCents','currency','catalogVersion','priceVersion','accessNotice','researchUseOnly']);
    assert.equal(line.quantity,inputLine.quantity);assert.equal(line.workflowMode,snapshot.workflowMode);assert.equal(line.unitPriceCents,snapshot.unitPriceCents);
    assert.equal(line.priceVersion,snapshot.priceVersion);assert.equal(line.catalogVersion,snapshot.catalogVersion);assert.equal(line.currency,'USD');assert.equal(line.researchUseOnly,false);
    assert.equal(line.lineEstimateCents,snapshot.unitPriceCents===null?null:snapshot.unitPriceCents*inputLine.quantity);
    assert.equal(line.minimumQuantity,1);assert.equal(line.maximumQuantity,10);assert.equal(line.quantityIncrement,1);
    assert.equal(line.productName,'Synthetic fixture only');assert.equal(line.specification,null);assert.equal(line.format,null);assert.equal(line.packBasis,null);
    assert.equal(line.customerActionLabel,snapshot.workflowMode==='request_pricing'?'Request pricing':'Submit request');assert.equal(line.accessNotice,null);
    assert.match(line.lineId,/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/);
  }
  assert.deepEqual(envelope.submittedEvent,{schemaVersion:'quick-order-v1',requestId:result.requestId,eventType:'submitted',occurredAt:decisionAt,payloadHash:p.submission.payloadHash});
  const e=envelope.enrichment;keys(e,['schemaVersion','companion','receipt','obligation','observation']);assert.equal(e.schemaVersion,'quick-order-v1');
  assert.deepEqual(e.companion,{requestId:result.requestId,payloadHash:p.submission.payloadHash,intake:{schemaVersion:'quick-order-v1',source:a.source,sourceDetail:a.sourceDetail,
    declaredCode:a.declaredAffiliateCode||null,affiliationKind:a.affiliation.kind,affiliationDetail:a.affiliation.detail,confirmedByCustomer:a.confirmedByCustomer,
    confirmedAt:decisionAt,requestAcknowledged:i.requestAcknowledged,reviewState:a.reviewState,commissionState:a.commissionState,estimate:p.submission.computedEstimate}});
  assert.deepEqual(e.receipt,{schemaVersion:'quick-order-v1',requestId:result.requestId,publicReference:result.publicReference,payloadHash:p.submission.payloadHash,attributionState:a.reviewState,estimate:p.submission.computedEstimate});
  const eventKey='assisted-order:'+result.requestId+':quick-order-submitted:admin';
  const outboxPayload={schemaVersion:'quick-order-v1',requestId:result.requestId,publicReference:result.publicReference};
  assert.deepEqual(e.obligation,{eventKey,templateKey:'research.assisted_order.quick_order.submitted.admin.v1',payload:outboxPayload});
  keys(e.observation,['state','eventKey','observedAt','notification']);assert.equal(e.observation.state,'observed');assert.equal(e.observation.eventKey,eventKey);
  assert.deepEqual(e.observation.notification,{status:'pending',attemptCount:0,nextAttemptAt:decisionAt,completedAt:null});
  const direct=await json(`select json_build_object('recipient',o.recipient,'channel',o.channel,'eventType',o.event_type,'payload',o.payload,
    'companionRecipient',c.notification_recipient,'actorId',v.actor_id,'actorType',v.actor_type)
    from public.research_notification_outbox o join public.research_health_quick_order_intakes c on c.request_id=${quote(result.requestId)}::uuid
    join public.research_assisted_order_events v on v.request_id=c.request_id and v.status='submitted'
    where o.event_key=${quote(eventKey)};`);
  assert.equal(direct.recipient,p.notificationRecipient);assert.equal(direct.companionRecipient,p.notificationRecipient);assert.equal(direct.channel,'email');
  assert.equal(direct.eventType,'assisted_order.submitted');assert.deepEqual(direct.payload,outboxPayload);
  assert.equal(direct.actorId,p.actorScope);assert.equal(direct.actorType,p.actorScope.startsWith('member:')?'member':'early_access_session');
}
async function doc83ShadowControls(g,savedPayload,savedResult){
  const marker='DOC83_SHADOW_DOMAIN_CALLED';
  const setup=`set client_min_messages=notice;create temporary table doc83_temp_environment(x pg_catalog.int4);
    create function pg_temp.doc83_mark() returns pg_catalog.bool language plpgsql as $marker$ begin raise notice '${marker}';return true;end $marker$;
    select pg_temp.doc83_mark();
    create domain pg_temp.jsonb as pg_catalog.jsonb check(pg_temp.doc83_mark());
    create domain pg_temp.text as pg_catalog.text check(pg_temp.doc83_mark());
    create domain pg_temp.uuid as pg_catalog.uuid check(pg_temp.doc83_mark());
    create domain pg_temp.timestamptz as pg_catalog.timestamptz check(pg_temp.doc83_mark());`;
  for(const kind of ['admin','replay','commit']){
    const p=transactionPayload(g,'synthetic-shadow-'+kind),before=await effectCounts();
    let statement;
    if(kind==='admin')statement=`select public.research_health_quick_order_admin_detail(${quote(savedResult.requestId)}::pg_catalog.uuid)::pg_catalog.text;`;
    else if(kind==='replay')statement=`select public.research_health_quick_order_replay(${quote(savedPayload.actorScope)}::pg_catalog.text,${quote(sha('xenios:health:quick-order:key:v1|'+savedPayload.actorScope+'|'+savedPayload.submission.input.idempotencyKey))}::pg_catalog.text)::pg_catalog.text;`;
    else statement=`select public.research_health_quick_order_commit(${quote(JSON.stringify(p))}::pg_catalog.jsonb)::pg_catalog.text;`;
    // Fresh backend avoids a previously compiled PL/pgSQL type-resolution cache.
    const observed=await startupSql(setup+'set role service_role;'+statement,{captureDiagnostics:true});
    assert.equal((observed.stderr.match(new RegExp(marker,'g'))??[]).length,1,'Only the explicit positive marker call may emit a notice');
    const output=rows(observed.stdout).at(-1);assert.ok(output);
    if(kind==='admin'){assert.equal(output.requestId,savedResult.requestId);assert.deepEqual(await effectCounts(),before);}
    else if(kind==='replay'){assert.equal(output.publicReceipt.requestId,savedResult.requestId);assert.deepEqual(await effectCounts(),before);}
    else {await assertCommitted(p,{result:output});countDelta(before,await effectCounts(),[1,1,1,1,1]);}
    const twin=await startupSql('set role service_role;'+statement,{captureDiagnostics:true});
    assert.ok(!twin.stderr.includes(marker));
    const twinOutput=rows(twin.stdout).at(-1);
    if(kind==='admin'){
      assert.match(output.enrichment.observation.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      assert.match(twinOutput.enrichment.observation.observedAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      const retained=copy(output),twinRetained=copy(twinOutput);
      // This observation timestamp is intentionally fresh; every retained field must match.
      delete retained.enrichment.observation.observedAt;delete twinRetained.enrichment.observation.observedAt;
      assert.deepEqual(twinRetained,retained);
    }else assert.deepEqual(twinOutput,kind==='commit'?{...output,replayed:true}:output);
    txPass('TC3-shadow-'+kind,'Fresh same-backend domain shadows, observable positive NOTICE and no domain invocation; exact no-domain twin');
  }
}
async function doc83Wait(sql,accept,description){
  const deadline=Date.now()+8000;
  for(let n=0;n<60&&Date.now()<deadline;n++){
    const value=await json(sql);if(accept(value))return value;
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  assert.fail('Required concurrency witness absent: '+description);
}
async function doc83ActorRace(g,conflict){
  g.route=await syntheticRoute('intake',{longWaits:true});
  const p=transactionPayload(g,'synthetic-doc83-race-'+(conflict?'conflict':'same')),q=copy(p);
  if(conflict){q.submission.input.contact.fullLegalName='Synthetic changed concurrent payload';rehash(q);}
  const key=sha('xenios:health:quick-order:key:v1|'+p.actorScope+'|'+p.submission.input.idempotencyKey);
  const actorPreimage='xenios:health:quick-order:actor-key:v1|'+p.actorScope+'|'+key;
  const aTag='doc83-A-'+randomUUID(),bTag='doc83-B-'+randomUUID(),before=await effectCounts(),other=await doc83OtherEffects();
  let a,b;
  try {await withSyntheticLock(`select session_hash from public.research_private_early_access_sessions where session_hash=${quote(g.sessionHash)} for update;`,async({pid:holder})=>{
    a=startupSql(`set application_name=${quote(aTag)};${commitSql(p)}`).then(value=>({value}),error=>({error}));
    const witness=await doc83Wait(`select coalesce((select json_build_object('pid',a.pid,'blocked',${holder}=any(pg_blocking_pids(a.pid)),
      'actorHeld',exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and l.objsubid=1 and l.mode='ExclusiveLock' and l.granted
        and ((l.classid::bigint<<32)|l.objid::bigint)=hashtextextended(${quote(actorPreimage)},0)))
      from pg_stat_activity a where a.application_name=${quote(aTag)}),'{}'::json)::text;`,v=>v.blocked&&v.actorHeld,'A holds actor key and waits on row 11');
    b=startupSql(`set application_name=${quote(bTag)};${commitSql(q)}`).then(value=>({value}),error=>({error}));
    await doc83Wait(`select coalesce((select json_build_object('blocked',${witness.pid}=any(pg_blocking_pids(a.pid)),
      'actorWaiting',exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and l.objsubid=1 and l.mode='ExclusiveLock' and not l.granted
        and ((l.classid::bigint<<32)|l.objid::bigint)=hashtextextended(${quote(actorPreimage)},0)))
      from pg_stat_activity a where a.application_name=${quote(bTag)}),'{}'::json)::text;`,v=>v.blocked&&v.actorWaiting,'B waits on A exact actor key');
  });}finally{await Promise.all([a,b].filter(Boolean));}
  const ar=await a,br=await b;assert.equal(ar.error,undefined);const aValue=rows(ar.value).at(-1);assert.equal(aValue.replayed,false);
  await assertCommitted(p,{result:aValue});
  if(conflict)sqlFailure(br.error,'23505','Quick Order key conflicts',{quickOrderCode:'IDEMPOTENCY_CONFLICT'});
  else {assert.equal(br.error,undefined);assert.deepEqual(rows(br.value).at(-1),{...aValue,replayed:true});}
  countDelta(before,await effectCounts(),[1,1,1,1,1]);assert.deepEqual(await doc83OtherEffects(),other);
  const recovered=await txJson(replayCall(p));assert.equal(recovered.payloadHash,p.submission.payloadHash);assert.equal(recovered.publicReceipt.requestId,aValue.requestId);
  txPass('TC5-actor-'+(conflict?'conflict':'replay'),'Observed A row-11 wait while holding exact actor key, B actor-key wait on A; deterministic winner and post-lock outcome');
  g.route=await syntheticRoute('intake');
}
async function doc83QueuedWriter(){
  const tag='doc83-queued-'+randomUUID();
  const child=spawn('docker',['--host',endpoint,'exec','-i',containerId,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d','postgres'],
    {cwd:ROOT,env:childEnv,windowsHide:true,stdio:['pipe','pipe','pipe']});
  activeChildren.add(child);let text='',errors='',bytes=0,resolvePid,rejectPid,closed=false,pidSeen=false;
  const pidPromise=new Promise((resolve,reject)=>{resolvePid=resolve;rejectPid=reject;});
  const deadline=setTimeout(()=>{child.kill();rejectPid(new Error('Queued writer fixture deadline'));},35_000);
  const done=new Promise((resolve,reject)=>{
    child.on('error',error=>{rejectPid(error);reject(error);});
    child.on('close',(code,signal)=>{closed=true;clearTimeout(deadline);activeChildren.delete(child);
      if(!pidSeen)rejectPid(new Error('Queued writer exited before its PID receipt'));
      if(code!==0||signal||interrupted){const error=new Error('Queued writer fixture failed');rejectPid(error);reject(error);}else resolve();});
  });done.catch(()=>{});child.stdin.on('error',()=>{});
  child.stdout.on('data',chunk=>{bytes+=chunk.length;text+=chunk.toString('utf8');if(bytes>outputLimit){child.kill();rejectPid(new Error('Queued writer output bound'));}
    const match=text.match(/DOC83_QUEUED_PID:([0-9]+)/);if(match){pidSeen=true;resolvePid(Number(match[1]));}});
  child.stderr.on('data',chunk=>{bytes+=chunk.length;errors+=chunk.toString('utf8');if(bytes>outputLimit)child.kill();});
  // PID is available before the blocked statement, not after lock acquisition.
  child.stdin.write(`\\set VERBOSITY verbose\nset application_name=${quote(tag)};set statement_timeout='25s';set transaction_timeout='28s';set idle_in_transaction_session_timeout='25s';
    begin;select 'DOC83_QUEUED_PID:'||pg_backend_pid();select pg_advisory_xact_lock(1380471107,1);\n`);
  const pid=await pidPromise;
  return {pid,tag,finish:async()=>{if(!closed)child.stdin.end('rollback;\n\\q\n');await done;assert.equal(errors.includes('ERROR:'),false);}};
}
async function doc83GateControls(g){
  g.route=await syntheticRoute('intake',{longWaits:true});
  const shared=transactionPayload(g,'synthetic-shared-only'),beforeShared=await effectCounts();
  await withSyntheticLock('select pg_advisory_xact_lock_shared(1380471107,1);',async()=>{await assertCommitted(shared);});
  countDelta(beforeShared,await effectCounts(),[1,1,1,1,1]);
  const p=transactionPayload(g,'synthetic-queued-writer'),before=await effectCounts(),other=await doc83OtherEffects();let writer;
  try {
    await withSyntheticLock('select pg_advisory_xact_lock_shared(1380471107,1);',async({pid:holder})=>{
      writer=await doc83QueuedWriter();
      await doc83Wait(`select json_build_object('holder',exists(select 1 from pg_locks where pid=${holder} and locktype='advisory' and classid=1380471107 and objid=1 and objsubid=2 and mode='ShareLock' and granted),
        'queued',exists(select 1 from pg_locks where pid=${writer.pid} and locktype='advisory' and classid=1380471107 and objid=1 and objsubid=2 and mode='ExclusiveLock' and not granted),
        'blocks',${holder}=any(pg_blocking_pids(${writer.pid})))::text;`,v=>v.holder&&v.queued&&v.blocks,'shared grant with queued exclusive writer');
      await txRefused(commitSql(p),'55P03','Quick Order temporarily unavailable',{quickOrderCode:'DEFINITE_REFUSAL_RETRYABLE'});
      await doc83NoSave(p,before,other);
    });
  } finally {if(writer)await writer.finish();}
  await assertCommitted(p);countDelta(before,await effectCounts(),[1,1,1,1,1]);
  txPass('TC5-shared-only-and-queued-writer','Shared-only holder admits; witnessed queued exclusive writer refuses a fresh shared try-lock; same key succeeds after release');
  g.route=await syntheticRoute('intake');
}
async function doc83CurrentnessDrift(){
  // Normal SQL refusal closes the transaction and restores the exact function.
  // COST affects pg_get_functiondef (the fingerprint) but not the exact inventory.
  // Use the definition-bound DDL runner, never the RPC runner lacking that variable.
  for(const [id,mutation,message] of [
    ['inventory',"set search_path='public'",'Quick Order exact function inventory mismatch'],
    ['fingerprint','cost 101','Quick Order accepted currentness fingerprint differs'],
  ])for(const [gate,text] of [['precheck',precheck],['reapply',candidate],['postcheck',postcheck]]){
    let error;try{await psql(`begin;alter function public.research_health_quick_order_currentness_read_strict_authority(pg_catalog.timestamptz) ${mutation};\n${text}`);}catch(value){error=value;}
    sqlFailure(error,'55000',message);
    txPass('TC16-currentness-'+id+'-'+gate,'Exact currentness drift refuses at the intended dependency gate; no reseal or retained mutation');
  }
}
async function doc83NegativeMatrix(fresh){
  const cases=[
    {id:'owner',mutate:p=>{p.context.configuredOwnerId=uuid(999001);},message:'Quick Order eligibility changed'},
    {id:'member-actor',mutate:p=>{p.actorScope='member:'+uuid(999002);p.context.actorScope=p.actorScope;},message:'Quick Order eligibility changed'},
    {id:'email',mutate:p=>{p.submission.input.contact.email='different-synthetic@example.invalid';},message:'Quick Order eligibility changed'},
    {id:'expired',seed:{sessionIssuedOffsetMs:-300*60_000},message:'Quick Order eligibility changed'},
    {id:'issued-future',seed:{sessionIssuedOffsetMs:60_000},message:'Quick Order eligibility changed'},
    {id:'legal-future',seed:{legalVerifiedOffsetMs:60_000},message:'Quick Order eligibility changed'},
    {id:'binding-future',seed:{bindingBoundOffsetMs:60_000},message:'Quick Order eligibility changed'},
    {id:'recorded-agreement-missing',seed:{agreementMode:'missing'},message:'Quick Order agreement pair changed'},
    {id:'recorded-agreement-version',seed:{agreementMode:'wrong-version'},message:'Quick Order agreement pair changed'},
    {id:'input-agreement',mutate:p=>{p.submission.input.agreements.pop();},message:'Quick Order agreement pair changed'},
    {id:'required-role',mutate:p=>{p.context.requiredRole='synthetic_other_role';},message:'Quick Order private context unavailable'},
    {id:'context-actor',mutate:p=>{p.context.actorScope='member:'+uuid(999003);},message:'Quick Order private context unavailable'},
    {id:'acknowledgment',mutate:p=>{p.submission.input.requestAcknowledged=false;},message:'Quick Order private context unavailable'},
    {id:'snapshot-count',mutate:p=>{p.submission.snapshots=[];},message:'Quick Order private context unavailable'},
    {id:'recipient',mutate:p=>{p.notificationRecipient='invalid-synthetic-recipient';},message:'Quick Order notification recipient unavailable'},
    {id:'key-format',mutate:p=>{p.submission.input.idempotencyKey='short';},message:'Quick Order identity unavailable'},
    {id:'unknown-session',mutate:p=>{p.context.rawStoredSessionHash=sha('synthetic-nonexistent-session');},message:'Quick Order session binding unavailable'},
    {id:'region',mutate:p=>{p.submission.input.contact.shippingAddress.region='NY';},message:'Quick Order offer unavailable'},
    {id:'quantity-rule',mutate:p=>{p.submission.input.lines[0].quantity=11;p.submission.snapshots[0].quantity=11;p.submission.computedEstimate.knownSubtotalCents=11*125;},message:'Quick Order offer unavailable'},
    {id:'quantity-grammar',mutate:p=>{p.submission.input.lines[0].quantity=1.5;p.submission.snapshots[0].quantity=1.5;},message:'Quick Order quantity invalid'},
    {id:'readiness',seed:{domainPublic:false},message:'Quick Order readiness unavailable'},
    {id:'estimate',mutate:p=>{p.submission.computedEstimate.knownSubtotalCents++;},message:'Quick Order estimate unavailable'},
    {id:'quality-selection',seed:{documentReviewedOffsetMs:60_000},message:'Quick Order quality witness unavailable',allocatable:true},
    {id:'stock-final',seed:{documentReportOffsetDays:1},message:'Quick Order stock witness changed',allocatable:true},
  ];
  for(const c of cases){
    const positive=await fresh({}),positivePayload=transactionPayload(positive,'synthetic-doc83-'+c.id+'-positive');
    await assertCommitted(positivePayload);
    const negative=await fresh(c.seed??{}),p=transactionPayload(negative,'synthetic-doc83-'+c.id+'-negative');c.mutate?.(p);rehash(p);
    if(c.allocatable)assert.equal((await startupSql(`select public.research_lot_is_allocatable('${negative.lotId}',clock_timestamp());`)).trim(),'t','Canonical witness must pass before the narrower intended refusal');
    const before=await effectCounts(),other=await doc83OtherEffects();
    await txRefused(commitSql(p),'55000',c.message,doc83Detail(c.message));await doc83NoSave(p,before,other);
    txPass('TC7-'+c.id,'Canonical positive twin; one semantic mutation; exact intended closed refusal, unchanged effects and no saved key');
  }
  // Stored access_role cannot differ without violating this canonical CHECK.
  const roleG=await fresh({});
  await txRefused(`update public.research_private_early_access_sessions set access_role='synthetic_other_role' where session_hash=${quote(roleG.sessionHash)};`,
    '23514','research_private_early_access_sessions_role_exact');
  txPass('TC7-stored-role-canonical-check','Canonical role mutation refuses; final intake comparison remains defence-in-depth, never forged around the CHECK');
  await doc83SettingMatrix(fresh);
}
async function doc83SettingMatrix(fresh){
  const cases=[
    {id:'timer-above-field',pre:()=>"set lock_timeout='700ms';",message:'Quick Order effective timer exceeds approved field'},
    {id:'timer-startup-mismatch',pre:()=>"set statement_timeout='2500ms';",message:'Quick Order effective startup timer mismatch'},
    {id:'timer-binding-missing',catalog:"alter role postgres in database postgres reset statement_timeout;",pre:()=>"set statement_timeout='3s';",message:'Quick Order startup timer binding missing'},
    {id:'effective-relationship',pre:()=>"set deadlock_timeout='500ms';",message:'Quick Order effective profile relationship mismatch'},
    {id:'timezone',pre:()=>"set timezone='America/New_York';",message:'Quick Order effective profile relationship mismatch'},
    {id:'datestyle',pre:()=>"set datestyle='ISO, DMY';",message:'Quick Order effective profile relationship mismatch'},
    {id:'no-set-role',withoutRole:true,message:'Quick Order approved limits identity mismatch'},
    {id:'isolation',pre:()=>"begin isolation level repeatable read;",message:'Quick Order transaction contract unavailable'},
    {id:'profile-zero',profile:x=>{x.intake.cleanupMs=0;},message:'Quick Order approved limit is not representable positive milliseconds'},
    {id:'profile-fraction',profile:x=>{x.intake.cleanupMs=0.5;},message:'Quick Order approved limit is not representable positive milliseconds'},
    {id:'profile-overflow',profile:x=>{x.intake.cleanupMs=1e20;},message:'Quick Order approved limit is not representable positive milliseconds'},
    {id:'profile-fields',profile:x=>{delete x.intake.responseMs;},message:'Quick Order approved limits fields invalid'},
    {id:'profile-relationship',profile:x=>{x.intake.attemptDeadlineMs++;},message:'Quick Order approved limit relationships invalid'},
    {id:'gate-relationship',profile:x=>{x.writer.postGateReserveMs=3000;},message:'Quick Order approved gate relationships invalid'},
    {id:'profile-identity',profile:x=>{x.database.oid='999999999';},message:'Quick Order approved limits identity mismatch'},
  ];
  for(const c of cases){
    const g=await fresh({}),positive=transactionPayload(g,'synthetic-doc83-setting-'+c.id+'-positive');await assertCommitted(positive);
    const p=transactionPayload(g,'synthetic-doc83-setting-'+c.id+'-negative'),before=await effectCounts(),other=await doc83OtherEffects();
    try {
      if(c.profile){const carrier=copy(g.route.carrier);c.profile(carrier);const raw=JSON.stringify(carrier);p.expectedConfigurationDigest=sha(raw);
        await psql(`alter role postgres in database postgres set research_health_quick_order.approved_limits=${quote(raw)};`);}
      if(c.catalog)await psql(c.catalog);
      const call=(c.pre?.()??'')+(c.withoutRole?commitCall(p):commitSql(p));
      await txRefused(call,'55000',c.message,doc83Detail(c.message));await doc83NoSave(p,before,other);
    } finally {g.route=await syntheticRoute('intake');}
    txPass('TC7-setting-'+c.id,'Valid positive twin; exactly targeted profile/session/catalog mutation reaches the intended admission refusal');
  }
  const g=await fresh({}),p=transactionPayload(g,'synthetic-doc83-decoy'),before=await effectCounts(),other=await doc83OtherEffects();
  await assertCommitted(transactionPayload(g,'synthetic-doc83-decoy-positive'));
  const afterPositive=await effectCounts();
  try {
    await psql(`alter role postgres in database postgres set researchXhealth_quick_order.approved_limits=${quote(g.route.raw)};
      alter role postgres in database postgres reset research_health_quick_order.approved_limits;`);
    await txRefused(commitSql(p),'55000','Quick Order approved limits binding unavailable',doc83Detail('Quick Order approved limits binding unavailable'));
    await doc83NoSave(p,afterPositive,other);
  } finally {
    await psql('alter role postgres in database postgres reset researchXhealth_quick_order.approved_limits;');g.route=await syntheticRoute('intake');
  }
  await assertCommitted(p);countDelta(before,await effectCounts(),[2,2,2,2,2]);
  txPass('TC16-starts-with-decoy','Only decoy remains with exact anchor-matching raw bytes; refusal discriminates starts_with from wildcard LIKE; restored same-key retry succeeds');
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
  // Whole canonical candidate, once, before provider sealing; never legacy-status fallback.
  await psql(await load(CUSTOMER_STATUS));
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
  await psql(precheck);await psql(candidate);await psql(postcheck);await boundary(before);
  pass('TC2 absent precheck/install/postcheck and present precheck/reapply/postcheck; exact absent install and identical reapply preserve provider integrity/fingerprint and independently checked 19 trigger states');
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
  await txRefused(service("select public.research_health_quick_order_commit('{}'::pg_catalog.jsonb);"),'55000','Quick Order input unavailable',doc83Detail('Quick Order input unavailable'));
  for(const role of ['anon','authenticated']) await refused("set role "+role+";select public.research_health_quick_order_commit('{}'::jsonb);",'42501');
  pass('client roles cannot call readers/commit; missing-context commit refuses');
  await refused('begin;alter table public.research_health_quick_order_intakes add column drift text;'+candidate,'55000');
  await refused('begin;grant select on public.research_health_quick_order_intakes to authenticated;'+candidate,'55000');
  await refused('begin;alter function public.research_health_quick_order_admin_detail(uuid) security invoker;'+candidate,'55000');
  await doc83CurrentnessDrift();
  await psql(postcheck);await boundary(before);
  pass('changed schema/ACL/function/currentness definition refuses reapply without repair');
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
