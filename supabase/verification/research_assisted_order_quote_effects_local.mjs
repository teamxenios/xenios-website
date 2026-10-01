// Synthetic local SQL only. One no-network/no-port PostgreSQL container,
// canonical stores and exact migration bytes; never email or managed history.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

assert.equal(process.version, "v20.19.0", "Use the isolated pinned Node runtime");
const runFile = promisify(execFile);
const auditPath = "supabase/migrations/20261001040349_research_assisted_order_quote_audit_store.sql";
const effectsPath = "supabase/migrations/20261001040351_research_assisted_order_quote_effects.sql";
const auditSql = await readFile(auditPath, "utf8");
const effectsSql = await readFile(effectsPath, "utf8");
const effectsPostcheck = await readFile("supabase/verification/research_assisted_order_quote_effects_postcheck.sql", "utf8");
const predecessors = [
  "supabase/verification/research-assisted-order-bridge-disposable-bootstrap.sql",
  "supabase/migrations/20260815150000_research_assisted_order_bridge.sql",
  "supabase/migrations/20260930191323_research_assisted_order_quote_payment_guard.sql",
  "supabase/migrations/20260930193033_research_assisted_order_quote_paid_hold.sql",
  "supabase/migrations/20260930202413_research_assisted_order_quote_payment_authority.sql",
  "supabase/migrations/20260930205725_research_assisted_order_quote_access_finance_bound.sql",
  "supabase/migrations/20260930230541_research_assisted_order_quote_evidence_corrections.sql",
  "supabase/migrations/20260930234614_research_assisted_order_quote_provider_hold.sql",
  "supabase/migrations/20261001024018_research_assisted_order_quote_history_immutability.sql",
];
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-0000000000${n}`;
const request = (n) => id(1,n), member = (n) => id(2,n), line = (n) => id(3,n);
const actor = id(4,91), reference = (n) => `XRR-20260930-ABCDEF00${n}`;
const actorLabel = "synthetic-finance@example.test";
const schema = "research_assisted_order_audit_v1";
const attestation = "research_assisted_order_audit_v1@sha256:0b58c26c239b7eb5c562e0c3b2db32a2cf71aa0704a520f4f90046a3a8bd2694";
const prefix = "public.research_assisted_order_payment_effects_";
const invalidStatusPayloads=[{status:" paid "},{status:"\tpaid\t"},{status:"\u00a0paid\u00a0"},
  {status:"PAID"},{status:42},{status:false},{status:null},{},["paid"],"paid"];
const q = (value) => value === null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
let containerId;
function psql(sql) {
  return new Promise((resolve,reject) => {
    const child = spawn("docker",["exec","-i",containerId,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{windowsHide:true});
    let stdout="", stderr="";
    const timer=setTimeout(()=>child.kill(),30_000);
    child.stdout.on("data",chunk=>{stdout+=chunk;}); child.stderr.on("data",chunk=>{stderr+=chunk;});
    child.on("error",error=>{clearTimeout(timer);reject(error);});
    child.on("close",code=>{clearTimeout(timer);code===0?resolve(stdout.trim()):reject(Object.assign(new Error(`Disposable psql exited ${code}`),{code,stdout,stderr}));});
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
function json(output) {
  const row=output.split(/\r?\n/).filter(s=>s.startsWith("{")||s.startsWith("[")).at(-1);
  assert.ok(row,"Expected structured SQL output");return JSON.parse(row);
}
async function refused(sql,state,detail,message) {
  let failure;try{await psql(sql);}catch(error){failure=error;}
  assert.ok(failure,`Expected SQLSTATE ${state}`);
  assert.match(failure.stderr??"",new RegExp(`ERROR:\\s+${state}:`));
  if(detail)assert.match(failure.stderr,new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  if(message)assert.ok(failure.stderr.includes(message),`Expected exact refusal message: ${message}`);
}
function fixture(n,withQuote=true) {
  return `insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,
    actor_member_id,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,status)
    values('${request(n)}','${reference(n)}','synthetic-effects-key${n}','synthetic-effects-fp${n}','${member(n)}',
    'synthetic-effects${n}@example.test','Synthetic Effects Buyer','+100000000${n}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',true,'early_access_manual_order_bridge','reviewing');
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
    quantity_increment,workflow_mode,customer_action_label,unit_price_cents,line_estimate_cents,catalog_version,authoritative_fingerprint)
    values('${line(n)}','${request(n)}','P-EFFECTS${n}','V-EFFECTS${n}','Synthetic item',2,1,1,'direct_order_request','Request order',2500,5000,'synthetic-cat','synthetic-fp');
    ${withQuote?`set local role service_role;
    select (public.research_assisted_order_quote_issue('${request(n)}','[{"lineId":"${line(n)}"}]',now()+interval '1 day','synthetic-admin')->>'quoteId') as quote${n} \\gset
    select public.research_assisted_order_quote_accept(:'quote${n}',1,5000,'${member(n)}');
    select public.research_assisted_order_set_status('${request(n)}','reviewing','payment_pending','synthetic-admin','admin');
    select public.research_assisted_order_set_status('${request(n)}','payment_pending','payment_review','synthetic-admin','admin');
    reset role;`:""}`;
}
const context = async(v)=>json(await psql(`set role service_role;select ${prefix}context('${v}')::text;`));
const canonical = value => Array.isArray(value)?`[${value.map(canonical).join(",")}]`:value!==null&&typeof value==="object"?
  `{${Object.keys(value).sort().map(k=>`${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`:JSON.stringify(value);
function event(c,keyId="synthetic1") {
  const alias=createHmac("sha256",Buffer.alloc(32,keyId==="synthetic1"?1:2))
    .update("xenios:assisted-order-audit-actor:v1\u0000admin\u0000").update(c.verifiedBy.normalize("NFKC").toLowerCase()).digest("hex");
  const body={eventKey:`assisted-order-audit:v1:${c.verificationId}`,eventType:"assisted_order.status_changed",
    requestId:c.requestId,actorType:"admin",actorAlias:`aa1:${keyId}:${alias}`,
    evidence:{from:"payment_review",to:"paid",authorityEvidenceKinds:["payment_verification"]},occurredAt:c.verifiedAt};
  return {eventId:c.verificationId,eventFingerprint:createHash("sha256").update(canonical(body)).digest("hex"),...body};
}
const completeSql=(v,e)=>`set role service_role;select ${prefix}complete('${v}','${schema}','${attestation}',${q(e===null?null:JSON.stringify(e))}::jsonb)::text;`;
const readySql=(row,overrides={})=>{
  const r={...row,...overrides};return `set role service_role;select ${prefix}outbox_ready(${q(r.id)},${q(r.assisted_order_verification_id)},${q(r.event_key)},${q(r.recipient)},${q(r.template_key)},${q(JSON.stringify(r.payload))}::jsonb);`;
};
const outbox=async(v)=>json(await psql(`select row_to_json(o)::text from public.research_notification_outbox o where assisted_order_verification_id='${v}';`));
const counts=async()=>json(await psql(`select json_build_object('verifications',(select count(*) from public.research_assisted_order_payment_verifications),
  'audit',(select count(*) from public.research_assisted_order_audit_events_v1),
  'outbox',(select count(*) from public.research_notification_outbox),
  'paidEvents',(select count(*) from public.research_assisted_order_events where status='paid'),
  'legacyVerification',(select count(*) from public.research_assisted_order_payment_verifications where request_id='${request(97)}'))::text;`));
const startedAt=performance.now();
try {
  const started=await runFile("docker",["run","-d","--rm","--name",`xenios-hl12-effects-${process.pid}-local`,"--network","none","--tmpfs","/var/lib/postgresql/data","-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:17-alpine"],{windowsHide:true});
  containerId=started.stdout.trim();assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;for(let n=0;n<30;n++){try{await runFile("docker",["exec",containerId,"pg_isready","-U","postgres"],{windowsHide:true});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
  assert.ok(ready,"Disposable PostgreSQL did not become ready");
  process.stdout.write(`Runtime ${process.version}; PostgreSQL ${await psql("show server_version;")}\n`);
  for(const path of predecessors.slice(0,2))await psql(await readFile(path,"utf8"));
  await psql(`begin;${fixture(97,false)}update public.research_assisted_order_requests set status='paid' where id='${request(97)}';commit;`);
  const financialSchemaAbsent=json(await psql(`select json_build_object(
    'quotes',to_regclass('public.research_assisted_order_quotes') is null,
    'observations',to_regclass('public.research_assisted_order_payment_observations') is null,
    'verifications',to_regclass('public.research_assisted_order_payment_verifications') is null)::text;`));
  assert.ok(Object.values(financialSchemaAbsent).every(value=>value===true));
  const pre80=await psql(await readFile("supabase/verification/research_assisted_order_quote_pre80_preflight.sql","utf8"));
  const pre80Rows=pre80.split(/\r?\n/).filter(Boolean);
  assert.equal(pre80Rows.length,2);assert.deepEqual(pre80Rows[0].split("|").slice(0,5),["paid","1","0","1","0"]);
  assert.equal(pre80Rows[1],"1");
  process.stdout.write("PRE80 "+JSON.stringify({aggregate:pre80Rows[0],nonterminalFrozenRows:1,financialSchemaAbsent})+"\n");
  for(const path of predecessors.slice(2))await psql(await readFile(path,"utf8"));
  await psql("create schema extensions;create extension pgcrypto with schema extensions;");
  await psql(await readFile("supabase/research-notification-outbox.sql","utf8"));
  // Model permissive managed defaults, then require the migrations to revoke.
  await psql(`alter role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;
    grant select,insert,update,delete,truncate on public.research_notification_outbox,public.research_notification_attempts to service_role;
    alter default privileges in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;`);
  await psql(await readFile("supabase/candidates/20260828_research_assisted_order_audit_store_precheck.sql","utf8"));
  assert.equal(auditSql.replace(/\r\n/g,"\n"),(await readFile("supabase/candidates/20260828_research_assisted_order_audit_store.sql","utf8")).replace(/\r\n/g,"\n"));
  await psql(auditSql);await psql(auditSql);
  await psql(await readFile("supabase/candidates/20260828_research_assisted_order_audit_store_postcheck.sql","utf8"));
  await psql(`begin;${[91,92,93,94].map(n=>fixture(n)).join("\n")}
    insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
      values('${actor}','${actorLabel}','synthetic-founder');commit;`);
  const quotes=json(await psql("select json_object_agg(right(request_id::text,2),id)::text from public.research_assisted_order_quotes;"));
  const observations={};
  for(const n of [91,92,93,94])observations[n]=json(await psql(`set role service_role;select public.research_assisted_order_payment_observe(
    '${request(n)}','${quotes[n]}','manual',5000,'USD','${reference(n)}','synthetic-effects-bank${n}',now(),'${actor}')::text;`));
  const verify=n=>`set role service_role;select public.research_assisted_order_payment_verify_bound('${request(n)}','${observations[n].observationId}','${actor}')::text;`;
  const baseline=await counts();
  const old=json(await psql(`begin;${verify(91)}reset role;
    select json_build_object('paid',(select status='paid' from public.research_assisted_order_requests where id='${request(91)}'),
      'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
      'audit',(select count(*) from public.research_assisted_order_audit_events_v1),
      'outbox',(select count(*) from public.research_notification_outbox))::text;rollback;`));
  assert.deepEqual(old,{paid:true,verifications:1,audit:0,outbox:0});assert.deepEqual(await counts(),baseline);
  process.stdout.write("BEFORE PASS predecessor payment commit has no atomic audit/outbox obligation; reproduction rolled back.\n");
  await refused(`begin;${verify(91)}reset role;${effectsSql}`,"55000","ASSISTED_ORDER_EFFECTS_ADOPTION_REQUIRED");
  assert.deepEqual(await counts(),baseline);
  assert.equal(await psql("select count(*) from pg_attribute where attrelid='public.research_notification_outbox'::regclass and attname='assisted_order_verification_id';"),"0");
  process.stdout.write("BEFORE PASS pre-existing genuine verification refuses migration without adoption; no schema/data residue.\n");
  await refused(`begin;alter table public.research_assisted_order_quotes enable replica trigger hl12_quote_snapshot_immutable;${effectsSql}`,
    "55000",undefined,"Payment effects prerequisites are absent");
  for(const payload of invalidStatusPayloads){
    await refused(`begin;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
      values('synthetic-malformed-existing','assisted_order.status_changed','synthetic@example.test',
        'research.assisted_order.status_changed.customer',${q(JSON.stringify(payload))}::jsonb);${effectsSql}`,
      "55000","ASSISTED_ORDER_STATUS_ENVELOPE_INVALID");
    assert.deepEqual(await counts(),baseline);
  }
  process.stdout.write("BEFORE PASS malformed existing status envelopes refuse migration, without deleting or adopting those rows.\n");
  process.stdout.write("PRECHECK "+await psql(await readFile("supabase/verification/research_assisted_order_quote_effects_precheck.sql","utf8"))+"\n");
  await psql(effectsSql);await psql(effectsSql);
  assert.deepEqual(await counts(),baseline);
  process.stdout.write("AFTER PASS exact audit promotion and effects migration applied twice; no historical backfill.\n");

  // Force failure after the AFTER INSERT capture but before the paid event.
  await psql(`create function public.synthetic_effects_fail_paid() returns trigger language plpgsql as $$begin
    if new.id='${request(92)}' and new.status='paid' then raise exception 'Synthetic interruption' using errcode='P0001',detail='SYNTHETIC_INTERRUPTION';end if;return new;end$$;
    create trigger synthetic_effects_fail_paid before update on public.research_assisted_order_requests for each row execute function public.synthetic_effects_fail_paid();`);
  await refused(verify(92),"P0001","SYNTHETIC_INTERRUPTION");assert.deepEqual(await counts(),baseline);
  await psql("drop trigger synthetic_effects_fail_paid on public.research_assisted_order_requests;drop function public.synthetic_effects_fail_paid();");
  process.stdout.write("AFTER PASS failed paid transition rolls back verification, held intent and paid event together.\n");
  const verifications={};for(const n of [91,93,94])verifications[n]=json(await psql(verify(n)));
  const c91=await context(verifications[91].verificationId), c93=await context(verifications[93].verificationId), c94=await context(verifications[94].verificationId);
  for(const c of [c91,c93,c94])assert.equal(c.verifiedBy,actorLabel,"Context must retain the immutable text actor label, not substitute the auth UUID");
  assert.equal(c91.state,"pending");assert.equal(c91.outboxStatus,"held");assert.equal(c91.auditReceipt,null);
  const first=await outbox(c91.verificationId);assert.equal(await psql(readySql(first)),"f");
  assert.equal((await counts()).outbox,3);
  const beforeMutation=await counts();
  for(const mutation of ["status='pending'","status='processing'","status='sent'","attempt_count=1"])
    await refused(`set role service_role;update public.research_notification_outbox set ${mutation} where id='${first.id}';`,"P0001","ASSISTED_ORDER_EFFECTS_AUDIT_REQUIRED");
  for(const mutation of ["recipient='changed@example.test'","payload='{\"status\":\"reviewing\"}'::jsonb","event_key='changed'","assisted_order_verification_id=null","created_at=now()"])
    await refused(`set role service_role;update public.research_notification_outbox set ${mutation} where id='${first.id}';`,"P0001","ASSISTED_ORDER_EFFECTS_IMMUTABLE");
  await refused(`set role service_role;delete from public.research_notification_outbox where id='${first.id}';`,"P0001","ASSISTED_ORDER_EFFECTS_IMMUTABLE");
  await refused("set role service_role;truncate public.research_notification_outbox cascade;","P0001","ASSISTED_ORDER_EFFECTS_IMMUTABLE");
  await refused(`set role service_role;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
    values('forged-notice','assisted_order.status_changed','forged@example.test','research.assisted_order.status_changed.customer','{"status":"paid"}');`,"P0001","ASSISTED_ORDER_EFFECTS_CONFLICT");
  await refused(`set role service_role;insert into public.research_notification_outbox(event_key,event_type,channel,recipient,template_key,payload,status,created_at,assisted_order_verification_id)
    select event_key,event_type,channel,recipient,template_key,payload,'held',created_at,assisted_order_verification_id from public.research_notification_outbox where id='${first.id}';`,"23505");
  assert.deepEqual(await counts(),beforeMutation);
  // Unrelated canonical notifications retain their existing behavior.
  await psql("set role service_role;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key) values('synthetic-unrelated','synthetic-unrelated','unrelated@example.test','unrelated');delete from public.research_notification_outbox where event_key='synthetic-unrelated';");
  for(const payload of invalidStatusPayloads){
    await refused(`set role service_role;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
      values('synthetic-malformed-new','assisted_order.status_changed','synthetic@example.test',
        'research.assisted_order.status_changed.customer',${q(JSON.stringify(payload))}::jsonb);`,
      "P0001","ASSISTED_ORDER_STATUS_ENVELOPE_INVALID");
    await refused(`begin;set role service_role;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
      values('synthetic-normal-status','assisted_order.status_changed','synthetic@example.test',
        'research.assisted_order.status_changed.customer','{"status":"reviewing"}');
      update public.research_notification_outbox set payload=${q(JSON.stringify(payload))}::jsonb where event_key='synthetic-normal-status';`,
      "P0001","ASSISTED_ORDER_STATUS_ENVELOPE_INVALID");
  }
  await psql(`begin;set role service_role;insert into public.research_notification_outbox(event_key,event_type,recipient,template_key,payload)
    values('synthetic-normal-status','assisted_order.status_changed','synthetic@example.test',
      'research.assisted_order.status_changed.customer','{"status":"reviewing"}');
    update public.research_notification_outbox set payload='{"status":"waiting_on_customer"}' where event_key='synthetic-normal-status';rollback;`);
  assert.deepEqual(await counts(),beforeMutation);
  process.stdout.write("AFTER PASS status envelopes refuse space/tab/NBSP/case/nonstring/missing states on insert/update; canonical nonpaid states preserved.\n");
  process.stdout.write("AFTER PASS direct service-role release/send, mutations, deletion/truncate, spoof and duplicate inserts refused; unrelated outbox preserved.\n");

  const pending=json(await psql(`set role service_role;select ${prefix}pending(null,null,1)::text;`));
  assert.equal(pending.length,1);
  const next=json(await psql(`set role service_role;select ${prefix}pending('${pending[0].createdAt}','${pending[0].outboxId}',100)::text;`));
  assert.equal(next.length,2);assert.ok(next.every(r=>r.outboxId!==pending[0].outboxId));
  const batch=Array.from({length:25},(_,n)=>String(n+1).padStart(2,"0"));
  await psql(`begin;${batch.map(n=>`${fixture(n)}set local role service_role;
    select (public.research_assisted_order_payment_observe('${request(n)}',:'quote${n}','manual',5000,'USD',
      '${reference(n)}','synthetic-effects-page${n}',now(),'${actor}')->>'observationId') as observation${n} \\gset
    select public.research_assisted_order_payment_verify_bound('${request(n)}',:'observation${n}','${actor}');reset role;`).join("\n")}commit;`);
  const page1=json(await psql(`set role service_role;select ${prefix}pending(null,null,20)::text;`));
  assert.equal(page1.length,20);const cursor=page1.at(-1);
  const page2=json(await psql(`set role service_role;select ${prefix}pending('${cursor.createdAt}','${cursor.outboxId}',20)::text;`));
  assert.equal(page2.length,8);assert.equal(new Set([...page1,...page2].map(r=>r.outboxId)).size,28);
  const timestampCounts=new Map();for(const row of [...page1,...page2])timestampCounts.set(row.createdAt,(timestampCounts.get(row.createdAt)??0)+1);
  assert.equal(Math.max(...timestampCounts.values()),25,"All 25 batch verification timestamps must tie at persisted millisecond precision");
  const finalCursor=page2.at(-1);
  assert.deepEqual(json(await psql(`set role service_role;select ${prefix}pending('${finalCursor.createdAt}','${finalCursor.outboxId}',20)::text;`)),[]);
  const invalidLabels=[" synthetic", "synthetic ", "synthetic\tfinance", "\u00a0synthetic", "synthetic\ufeff",
    "synthetic\u007ffinance", "\u2028synthetic", "synthetic\u3000", "🔬".repeat(257)];
  for(const [index,label] of invalidLabels.entries()){
    const n=40+index;
    await psql(`update public.research_assisted_order_payment_verifier_grants set actor_label=${q(label)} where auth_user_id='${actor}';
      begin;${fixture(n)}set local role service_role;
      select public.research_assisted_order_payment_observe('${request(n)}',:'quote${n}','manual',5000,'USD',
        '${reference(n)}','synthetic-effects-label${n}',now(),'${actor}');commit;`);
    const observation=json(await psql(`select json_build_object('id',id)::text from public.research_assisted_order_payment_observations where request_id='${request(n)}';`));
    const beforeLabel=await counts();
    await refused(`set role service_role;select public.research_assisted_order_payment_verify_bound('${request(n)}','${observation.id}','${actor}');`,
      "P0001","ASSISTED_ORDER_EFFECTS_ACTOR_INVALID");
    assert.deepEqual(await counts(),beforeLabel);
    assert.equal(await psql(`select status from public.research_assisted_order_requests where id='${request(n)}';`),"payment_review");
  }
  for(const [index,label] of ["合成財務 🔬", "🔬".repeat(256)].entries()){
    const n=50+index;
    await psql(`update public.research_assisted_order_payment_verifier_grants set actor_label=${q(label)} where auth_user_id='${actor}';
      begin;${fixture(n)}set local role service_role;
      select (public.research_assisted_order_payment_observe('${request(n)}',:'quote${n}','manual',5000,'USD',
        '${reference(n)}','synthetic-effects-label${n}',now(),'${actor}')->>'observationId') as label_observation \\gset
      select public.research_assisted_order_payment_verify_bound('${request(n)}',:'label_observation','${actor}');commit;`);
    const verificationId=await psql(`select id from public.research_assisted_order_payment_verifications where request_id='${request(n)}';`);
    assert.equal((await context(verificationId)).verifiedBy,label);
  }
  await psql(`update public.research_assisted_order_payment_verifier_grants set actor_label='${actorLabel}' where auth_user_id='${actor}';`);
  process.stdout.write("AFTER PASS invalid audit labels roll back verification/paid/intent; opaque Unicode and exact 512 UTF-16-unit astral labels remain accepted.\n");
  await refused(`set role service_role;select ${prefix}pending(null,'${first.id}',1);`,"22023");
  await refused(`set role service_role;select ${prefix}pending(null,null,101);`,"22023");
  const e93=event(c93);
  for(const change of [{eventId:c91.verificationId},{requestId:request(91)},{occurredAt:"2026-09-30T00:00:00.000Z"},{actorType:"system",actorAlias:null},{evidence:{from:"payment_pending",to:"paid",authorityEvidenceKinds:["payment_verification"]}}])
    await refused(completeSql(c93.verificationId,{...e93,...change}),"P0001","ASSISTED_ORDER_EFFECTS_CONFLICT");
  await refused(`begin;${completeSql(c93.verificationId,e93)}select 1/0;`,"22012");
  assert.equal((await context(c93.verificationId)).auditReceipt,null);assert.equal((await outbox(c93.verificationId)).status,"held");
  const wrongAudit={...event(c94),requestId:request(91)};
  await refused(`begin;set role service_role;select public.research_assisted_order_audit_append('${schema}','${attestation}',${q(JSON.stringify(wrongAudit))}::jsonb);
    select ${prefix}complete('${c94.verificationId}','${schema}','${attestation}',${q(JSON.stringify(event(c94)))}::jsonb);`,"P0001","ASSISTED_ORDER_EFFECTS_CONFLICT");
  assert.equal((await counts()).audit,0);
  process.stdout.write("AFTER PASS bounded keyset, conflicting bindings and audit collision; interrupted completion rolls back audit plus release atomically.\n");

  await psql(`update public.research_assisted_order_payment_verifier_grants set revoked_at=now() where auth_user_id='${actor}';`);
  await refused(verify(91),"P0001","ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED");
  // Independent connections with different HMAC versions serialize on the same
  // outbox row. The loser returns the committed receipt, not a new fingerprint.
  const recovered=(await Promise.all([psql(completeSql(c91.verificationId,event(c91))),psql(completeSql(c91.verificationId,event(c91,"synthetic2")))])).map(json);
  assert.deepEqual(recovered[0],recovered[1]);assert.equal(recovered[0].state,"complete");
  assert.equal(recovered[0].verifiedBy,actorLabel);
  assert.equal(recovered[0].outboxStatus,"pending");assert.equal((await counts()).audit,1);
  assert.deepEqual(json(await psql(completeSql(c91.verificationId,null))),recovered[0]);
  assert.equal(await psql(readySql(await outbox(c91.verificationId))),"t");
  for(const change of [{recipient:"changed@example.test"},{payload:{status:"paid"}},{event_key:"changed"},{assisted_order_verification_id:null}])
    assert.equal(await psql(readySql(await outbox(c91.verificationId),change)),"f");
  await psql(`set role service_role;update public.research_notification_outbox set status='processing' where id='${first.id}';`);
  assert.equal(await psql(readySql(await outbox(c91.verificationId))),"t");
  await psql(`set role service_role;update public.research_notification_outbox set status='sent',attempt_count=1 where id='${first.id}';`);
  assert.equal(await psql(readySql(await outbox(c91.verificationId))),"f");
  process.stdout.write("AFTER PASS revoked actor grant does not block independent recovery; concurrent rotated-key completion and replay converge; exact dispatch readiness enforced.\n");

  for(const role of ["anon","authenticated"]){
    for(const call of [`authority()`,`context('${c91.verificationId}')`,`pending(null,null,1)`,`complete('${c93.verificationId}','x','y','{}')`,
      `outbox_ready('${first.id}','${c91.verificationId}','x','x','x','{}')`])
      await refused(`set role ${role};select ${prefix}${call};`,"42501");
  }
  for(const role of ["anon","authenticated","service_role"]){
    await refused(`set role ${role};select ${prefix}audit_receipt('${c91.verificationId}');`,"42501");
    await refused(`set role ${role};select * from public.research_assisted_order_audit_events_v1;`,"42501");
    await refused(`set role ${role};select public.research_assisted_order_payment_verify(null,null);`,"42501");
  }
  await refused(`set role service_role;select public.research_assisted_order_payment_observe('${request(92)}','${quotes[92]}','provider',5000,'USD','synthetic-pi','synthetic-event',now(),null,'fake','fake','fake');`,"P0001","ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY");
  assert.equal(await psql(`set role service_role;select ${prefix}context('${id(9,99)}') is null;`),"t");
  assert.equal(await psql(`set role service_role;select ${prefix}complete('${id(9,99)}',null,null,null) is null;`),"t");
  assert.equal((await counts()).legacyVerification,0);
  await psql(effectsSql); // Reapplication with genuine post-migration records.
  const beforeDrift=await counts();
  for(const [drift,message] of [
    [`drop function ${prefix}pending(timestamptz,uuid,integer);`,"Effects exact function signature absent"],
    [`alter function ${prefix}pending(timestamptz,uuid,integer) reset all;`,"Effects function privilege or search path drift"],
    ["alter table public.research_assisted_order_payment_verifications enable replica trigger hl12_payment_effects_capture;","Effects transaction trigger absent"],
  ]) {
    await refused(`begin;${drift}\n${effectsPostcheck}\nrollback;`,"P0001",undefined,message);
    assert.deepEqual(await counts(),beforeDrift);
    await psql(effectsPostcheck); // Aborted connection rolled back every drift.
  }
  process.stdout.write("AFTER PASS read-only postcheck refuses missing exact pending signature, null RESET ALL function config and replica-only capture; all drift transactions rolled back.\n");
  process.stdout.write("AFTER PASS stored verifiedBy remains the synthetic email actor label before and after grant-independent recovery.\n");
  process.stdout.write("POSTCHECK "+await psql(effectsPostcheck)+"\n");
  process.stdout.write("FINAL_COUNTS "+JSON.stringify(await counts())+"\n");
  process.stdout.write("AFTER PASS actual role ACLs, original provider/unbound holds, no historical verification or email.\n");
  process.stdout.write(`AUDIT_SHA256 ${createHash("sha256").update(auditSql.replace(/\r\n/g,"\n")).digest("hex")}\nEFFECTS_SHA256 ${createHash("sha256").update(effectsSql.replace(/\r\n/g,"\n")).digest("hex")}\n`);
} catch(error) {
  process.stderr.write(`LOCAL_PROOF_FAILURE ${error.message}\n${error.stderr??""}\n`);throw error;
} finally {
  if(containerId&&/^[0-9a-f]{64}$/.test(containerId)){await runFile("docker",["rm","-f",containerId],{windowsHide:true});process.stdout.write("CLEANUP removed only this proof's container and tmpfs synthetic database.\n");}
  process.stdout.write(`Elapsed ${((performance.now()-startedAt)/1000).toFixed(3)} seconds.\n`);
}
