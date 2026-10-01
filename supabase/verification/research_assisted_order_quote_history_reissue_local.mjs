// Synthetic PostgreSQL proof only. One no-network/no-published-port, tmpfs
// container, removed by exact returned ID. No managed changes or real effects.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

assert.equal(process.version, "v20.19.0", "Use the private pinned Node runtime");
const runFile = promisify(execFile);
const base = "supabase/verification/research_assisted_order_quote_history_reissue";
const migrationPath = "supabase/migrations/20261001044200_research_assisted_order_quote_history_reissue.sql";
const migration = await readFile(migrationPath, "utf8");
const postcheck = await readFile(`${base}_postcheck.sql`, "utf8");
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
const sqlQuote = value => value == null ? "null" : `'${String(value).replaceAll("'", "''")}'`;
const id = (prefix, n) => `${prefix}0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const request = n => id(1,n), member = n => id(2,n), line = n => id(3,n);
const actor = id(4,1), actorLabel = "synthetic-reissue-finance@example.test";
const reference = n => `XRR-20261001-ABCDEF${String(n).padStart(4,"0")}`;
const service = sql => `set role service_role;${sql}`;
const quoteExpr = (n, validity="now()+interval '1 day'", decisions=[{lineId:line(n)}]) =>
  `public.research_assisted_order_quote_issue('${request(n)}',${sqlQuote(JSON.stringify(decisions))}::jsonb,${validity},'synthetic-admin')`;
const issue = (n, ...rest) => service(`select ${quoteExpr(n,...rest)}::text;`);
const acceptExpr = (n, quote, version=1, total=5000, owner=member(n)) =>
  `public.research_assisted_order_quote_accept('${quote}',${version},${total},${sqlQuote(owner)})`;
const accept = (...args) => service(`select ${acceptExpr(...args)}::text;`);
const statusExpr = (n, from, to, evidence={}) =>
  `public.research_assisted_order_set_status('${request(n)}','${from}','${to}','synthetic-admin','admin',null,null,${sqlQuote(JSON.stringify(evidence))}::jsonb)`;
const observeExpr = (n,quote,amount=5000) => `public.research_assisted_order_payment_observe(
  '${request(n)}','${quote}','manual',${amount},'USD','${reference(n)}','synthetic-evidence-${n}',now(),'${actor}')`;
const providerExpr = (n,quote) => `public.research_assisted_order_payment_observe(
  '${request(n)}','${quote}','provider',5000,'USD','synthetic-provider-payment-${n}','synthetic-provider-evidence-${n}',now(),null,
  'synthetic-unconfigured','synthetic-event-${n}','synthetic-provider-payment-${n}')`;
const verifyExpr = (n,obs) => `public.research_assisted_order_payment_verify_bound('${request(n)}','${obs}','${actor}')`;
let containerId;
function startSql(sql, marker=null) {
  let resolveMarker, rejectMarker;
  const marked = marker ? new Promise((resolve,reject)=>{resolveMarker=resolve;rejectMarker=reject;}) : null;
  // Prevent an early peer error from becoming an unhandled rejection before
  // the orchestration inspects its exact SQLSTATE.
  const done = new Promise((resolve,reject)=>{
    const child=spawn("docker",["exec","-i",containerId,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{windowsHide:true});
    let stdout="",stderr="";
    const timer=setTimeout(()=>child.kill(),30_000);
    child.stdout.on("data",chunk=>{stdout+=chunk;if(marker&&stdout.includes(marker))resolveMarker();});
    child.stderr.on("data",chunk=>{stderr+=chunk;});
    child.on("error",error=>{clearTimeout(timer);rejectMarker?.(error);reject(error);});
    child.on("close",code=>{
      clearTimeout(timer);
      if(code===0){resolveMarker?.();resolve(stdout.trim());}
      else{const error=Object.assign(new Error(`Disposable psql exited ${code}`),{code,stdout,stderr});rejectMarker?.(error);reject(error);}
    });
    child.stdin.end(`\\set VERBOSITY verbose\nset statement_timeout='20s';\n${sql}\n`);
  });
  done.catch(()=>{});marked?.catch(()=>{});
  return {done,marked};
}
const psql = sql => startSql(sql).done;
function jsonRows(output) {return output.split(/\r?\n/).filter(row=>row.startsWith("{")||row.startsWith("[")).map(row=>JSON.parse(row));}
function json(output) {const rows=jsonRows(output);assert.ok(rows.length,"Expected JSON SQL output");return rows.at(-1);}
function assertRefusal(error,state,detail,message) {
  assert.ok(error,`Expected SQLSTATE ${state}`);
  assert.match(error.stderr??"",new RegExp(`ERROR:\\s+${state}:`));
  if(detail)assert.match(error.stderr,new RegExp(`DETAIL:\\s+${detail}(?:\\r?\\n|$)`));
  if(message)assert.ok(error.stderr.includes(message),`Expected ${message}; received ${error.stderr}`);
}
async function refused(sql,state="P0001",detail=null,message=null) {
  let failure;try{await psql(sql);}catch(error){failure=error;}
  assertRefusal(failure,state,detail,message);
}
function fixture(n,status="reviewing",mode="direct_order_request",unit=2500,quantity=2) {
  return `insert into public.research_assisted_order_requests(id,public_reference,idempotency_key_hash,request_fingerprint,
    actor_member_id,normalized_email,full_legal_name,mobile_phone,shipping_address,billing_address,age_confirmed,source,status)
    values('${request(n)}','${reference(n)}','synthetic-reissue-key-${n}','synthetic-reissue-fp-${n}','${member(n)}',
    'synthetic-reissue-${n}@example.test','Synthetic Reissue Buyer','+10000000000',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',
    '{"line1":"1 Test Way","city":"Austin","region":"TX","postalCode":"78704","countryCode":"US"}',true,'early_access_manual_order_bridge','${status}');
    insert into public.research_assisted_order_lines(id,request_id,product_id,variant_id,product_name,quantity,minimum_quantity,
    quantity_increment,workflow_mode,customer_action_label,unit_price_cents,line_estimate_cents,catalog_version,authoritative_fingerprint)
    values('${line(n)}','${request(n)}','P-SYNTHETIC-${n}','V-SYNTHETIC-${n}','Synthetic test item',${quantity},1,1,'${mode}',
    'Request order',${unit??"null"},${unit==null?"null":unit*quantity},'synthetic-cat','synthetic-fp');`;
}
const row = async quote => json(await psql(`select row_to_json(q)::text from public.research_assisted_order_quotes q where id='${quote}';`));
const counts = async () => json(await psql(`select json_build_object(
  'quotes',(select count(*) from public.research_assisted_order_quotes),
  'accepted',(select count(*) from public.research_assisted_order_quotes where state='accepted'),
  'observations',(select count(*) from public.research_assisted_order_payment_observations),
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
  'events',(select count(*) from public.research_assisted_order_events),
  'audit',(select count(*) from public.research_assisted_order_audit_events_v1),
  'outbox',(select count(*) from public.research_notification_outbox))::text;`));
const scopeCounts = async n => json(await psql(`select json_build_object(
  'quotes',(select count(*) from public.research_assisted_order_quotes where request_id='${request(n)}'),
  'accepted',(select count(*) from public.research_assisted_order_quotes where request_id='${request(n)}' and state='accepted'),
  'observations',(select count(*) from public.research_assisted_order_payment_observations where request_id='${request(n)}'),
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id='${request(n)}'),
  'status',(select status from public.research_assisted_order_requests where id='${request(n)}'))::text;`));
async function lockedRace(firstSql,secondSql,secondFailure=null) {
  const first=startSql(`begin;${firstSql}\nselect 'synthetic-parent-lock-held';select pg_sleep(3);commit;`,"synthetic-parent-lock-held");
  await first.marked;
  const peer=startSql(`set application_name='synthetic-hist02-peer';${secondSql}`);
  let blocked=false;
  for(let attempt=0;attempt<10;attempt++){
    const count=await psql("select count(*) from pg_catalog.pg_stat_activity where application_name='synthetic-hist02-peer' and wait_event_type='Lock';");
    if(count==="1"){blocked=true;break;}
    await new Promise(resolve=>setTimeout(resolve,100));
  }
  assert.equal(blocked,true,"Peer must actually wait on the request-row write lock");
  const a=await first.done;
  let b,error;try{b=await peer.done;}catch(e){error=e;}
  if(secondFailure)assertRefusal(error,...secondFailure);else if(error)throw error;
  return {first:jsonRows(a),second:b?jsonRows(b):[],refused:Boolean(error)};
}
const startedAt=performance.now();
try {
  // Prove the unchanged economics tail byte-for-byte after newline normalization.
  const predecessor=await readFile(predecessors[4],"utf8");
  const economics=text=>text.replace(/\r\n/g,"\n").split("create or replace function public.research_assisted_order_quote_issue(")[1]
    .split("$issue$;")[0].split("  for v_line in ")[1];
  assert.equal(economics(migration),economics(predecessor));
  process.stdout.write("SOURCE PASS quote_issue economics/immutable snapshot tail equals predecessor bytes; signature unchanged.\n");
  const started=await runFile("docker",["run","-d","--rm","--name",`xenios-hl12-reissue-${process.pid}-local`,"--network","none",
    "--tmpfs","/var/lib/postgresql/data","-e","POSTGRES_HOST_AUTH_METHOD=trust","postgres:17-alpine"],{windowsHide:true});
  containerId=started.stdout.trim();assert.match(containerId,/^[0-9a-f]{64}$/);
  let ready=false;
  for(let n=0;n<30;n++){try{await runFile("docker",["exec",containerId,"pg_isready","-U","postgres"],{windowsHide:true});ready=true;break;}catch{await new Promise(r=>setTimeout(r,250));}}
  assert.ok(ready,"Disposable PostgreSQL unavailable");
  process.stdout.write(`Runtime ${process.version}; PostgreSQL ${await psql("show server_version;")}\n`);
  for(const path of predecessors.slice(0,2))await psql(await readFile(path,"utf8"));
  // Direct owner setup of synthetic historical labels, not fabricated payment
  // verification. Regression history intentionally includes malformed evidence.
  await psql(`begin;${fixture(1,"payment_pending")}${fixture(2,"payment_review")}
    ${[3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,80,81,82].map(n=>fixture(n)).join("\n")}
    ${fixture(40,"paid")}${fixture(41,"reviewing")}${fixture(42,"payment_pending")}${fixture(43,"closed")}
    insert into public.research_assisted_order_events(request_id,status,actor_type,actor_id,evidence)
      values('${request(41)}','paid','admin','synthetic-historical','{}'),('${request(42)}','paid','admin','synthetic-historical','{"paymentVerificationId":false}');commit;`);
  for(const path of predecessors.slice(2,7))await psql(await readFile(path,"utf8"));
  await psql(`insert into public.research_assisted_order_payment_verifier_grants(auth_user_id,actor_label,granted_by)
    values('${actor}','${actorLabel}','synthetic-founder');`);
  const legacyQuotes={};
  for(const n of [80,81,82]){
    legacyQuotes[n]=json(await psql(issue(n))).quoteId;
    await psql(accept(n,legacyQuotes[n]));
    await psql(service(`select ${statusExpr(n,"reviewing","payment_pending")};select ${statusExpr(n,"payment_pending","payment_review")};`));
  }
  await psql(service(`select ${providerExpr(80,legacyQuotes[80])};`));
  await psql(service(`select ${observeExpr(81,legacyQuotes[81])};`));
  const correctedOld=json(await psql(service(`select ${observeExpr(82,legacyQuotes[82],4999)}::text;`)));
  await psql(service(`select public.research_assisted_order_payment_correct_manual('${request(82)}','${correctedOld.observationId}','${actor}',
    '${legacyQuotes[82]}','${reference(82)}',5000,'USD','synthetic-corrected-82',now(),'Synthetic correction of observed amount');`));
  // Model legacy inconsistent state while that OLD schema still permits it.
  // This is not an application path, not a repair and not a verification.
  await psql("update public.research_assisted_order_quotes set state='superseded',accepted_at=null,acceptance_id=null;");
  const expired=json(await psql(issue(3,"now()+interval '1 second'")));
  await psql(service(`select ${statusExpr(3,"reviewing","payment_pending")};`));
  const acceptedExpired=json(await psql(`begin;${service(`select ${quoteExpr(4,"now()+interval '1 second'")}::text as q \\gset
    select public.research_assisted_order_quote_accept((:'q'::jsonb->>'quoteId')::uuid,1,5000,'${member(4)}')::text;`)}commit;`));
  for(const path of predecessors.slice(7))await psql(await readFile(path,"utf8"));
  await psql("create schema extensions;create extension pgcrypto with schema extensions;");
  await psql(await readFile("supabase/research-notification-outbox.sql","utf8"));
  await psql("alter role service_role bypassrls;grant usage on schema public to anon,authenticated,service_role;alter default privileges in schema public grant execute on functions to anon,authenticated,service_role;");
  await psql(await readFile("supabase/migrations/20261001040349_research_assisted_order_quote_audit_store.sql","utf8"));
  await psql(await readFile("supabase/migrations/20261001040351_research_assisted_order_quote_effects.sql","utf8"));
  assert.equal(await psql(`select valid_until<=now() from public.research_assisted_order_quotes where id='${expired.quoteId}';`),"t");
  assert.equal(json(await psql(service(`select public.research_assisted_order_quote_get('${reference(3)}','${member(3)}')::text;`))).state,"expired");
  const initial=await counts();
  for(const n of [1,2,3])await refused(issue(n),"P0001",null,"Request is not quote-ready");
  assert.deepEqual(await counts(),initial);
  process.stdout.write("BEFORE PASS reproduced HIST-02 first-quote payment_pending/payment_review and real expired issued-offer reissue refusals; zero writes.\n");
  process.stdout.write("PRECHECK "+await psql(await readFile(`${base}_precheck.sql`,"utf8"))+"\n");
  const oldIssue=await psql("select md5(pg_get_functiondef('public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure));");
  const unaffected=await psql("select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p where p.proname in ('research_assisted_order_quote_accept','research_assisted_order_payment_observe','research_assisted_order_payment_verify','research_assisted_order_payment_verify_bound','research_assisted_order_payment_effects_capture','research_assisted_order_payment_effects_complete');");
  // Preflight refusal is atomic and does not install a partial successor.
  await refused(`begin;alter table public.research_assisted_order_quotes enable replica trigger hl12_quote_snapshot_immutable;${migration}`,"55000","ASSISTED_ORDER_QUOTE_REISSUE_PREDECESSOR_REQUIRED");
  await refused(`begin;drop trigger hl12_history_progression on public.research_assisted_order_requests;${migration}`,"55000","ASSISTED_ORDER_QUOTE_REISSUE_PREDECESSOR_REQUIRED");
  assert.equal(await psql("select md5(pg_get_functiondef('public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure));"),oldIssue);
  await psql(migration);await psql(migration);
  assert.deepEqual(await counts(),initial);
  assert.equal(await psql("select md5(string_agg(pg_get_functiondef(p.oid),'' order by p.oid)) from pg_proc p where p.proname in ('research_assisted_order_quote_accept','research_assisted_order_payment_observe','research_assisted_order_payment_verify','research_assisted_order_payment_verify_bound','research_assisted_order_payment_effects_capture','research_assisted_order_payment_effects_complete');"),unaffected);
  await psql(postcheck);
  process.stdout.write("AFTER PASS exact migration applied twice, no backfill; acceptance/payment/effects function bytes unchanged and effective guards retained.\n");

  const oldExpiredRow=await row(expired.quoteId);
  const q1=json(await psql(issue(1))),q2=json(await psql(issue(2))),q3=json(await psql(issue(3)));
  assert.equal(q1.version,1);assert.equal(q2.version,1);assert.equal(q3.version,2);
  for(const quote of [q1,q2,q3]){
    assert.equal(quote.totalCents,5000);assert.equal(quote.currency,"USD");assert.equal(quote.lines[0].unitPriceCents,2500);
    assert.equal(quote.lines[0].quantity,2);assert.equal(quote.lines[0].lineTotalCents,5000);assert.equal(quote.lines[0].priceSource,"catalog");
  }
  assert.deepEqual(await row(expired.quoteId),{...oldExpiredRow,state:"superseded"});
  assert.equal(json(await psql(service(`select public.research_assisted_order_quote_get('${reference(3)}','${member(3)}')::text;`))).quoteId,q3.quoteId);
  assert.equal((await scopeCounts(1)).status,"payment_pending");assert.equal((await scopeCounts(2)).status,"payment_review");
  await refused(accept(3,expired.quoteId),"P0001","ASSISTED_ORDER_QUOTE_STALE");
  assert.equal(await psql(accept(3,q3.quoteId,2,5000,member(2))),"");
  await refused(accept(3,q3.quoteId,2,4999),"P0001","ASSISTED_ORDER_QUOTE_STALE");
  assert.equal(json(await psql(accept(3,q3.quoteId,2))).replayed,false);
  assert.equal(json(await psql(accept(3,q3.quoteId,2))).replayed,true);
  assert.equal(json(await psql(accept(1,q1.quoteId))).replayed,false);
  assert.equal(json(await psql(accept(2,q2.quoteId))).replayed,false);
  assert.equal((await counts()).outbox,0);assert.equal((await counts()).audit,0);assert.equal((await counts()).verifications,0);
  process.stdout.write("AFTER PASS both new statuses, real expiry reissue, exact stored cents/quantity/USD, immutable prior offer, owner/stale/total guards and replay; no payment/effects manufactured.\n");

  for(const n of [1,2,3,4])await refused(issue(n),"P0001",null,"An accepted quote cannot be repriced");
  assert.equal(json(await psql(accept(4,acceptedExpired.quoteId))).replayed,true);
  for(const n of [40,43])await refused(issue(n),"P0001",null,"Request is not quote-ready");
  for(const n of [41,42,80,81,82])await refused(issue(n),"P0001","ASSISTED_ORDER_QUOTE_FINANCIAL_HISTORY_HOLD");
  await refused(service(`select ${providerExpr(2,q2.quoteId)};`),"P0001","ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY");
  await refused(service(`select ${verifyExpr(80,(await psql("select id from public.research_assisted_order_payment_observations where method='provider';")))};`),"P0001","ASSISTED_ORDER_PROVIDER_AUTHORITY_NOT_READY");
  await refused(service(`select ${statusExpr(81,"payment_review","cancelled",{cancellationReason:"Synthetic cancellation"})};`),"P0001","ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY");
  process.stdout.write("AFTER PASS accepted/expired-accepted quotes, current/recorded paid, manual/provider/corrected observations remain held; provider and no-funds cancellation holds preserved.\n");

  // Price and path decisions still come from request-line authority. No price
  // is reused from a prior offer for a genuine request_pricing line.
  await psql(`begin;${fixture(50,"payment_pending","provider_request")}${fixture(51,"payment_review","request_activation")}
    ${fixture(52,"payment_review","request_pricing",null)}${fixture(53,"payment_pending","direct_order_request",null)}
    ${fixture(54,"payment_pending","request_pricing",null,100)}commit;`);
  for(const n of [50,51])await refused(issue(n),"P0001",null,"Held or Care lines cannot be quoted");
  await refused(issue(53),"P0001",null,"Unpriced line needs positive quoted cents");
  const safeCounts=await counts();
  for(const decisions of [[{lineId:line(5),unitPriceCents:2499}],[{lineId:line(5),unitPriceCents:0}],[],[{lineId:line(5)},{lineId:line(5)}],[{lineId:line(5)},{lineId:line(6)}]])
    await refused(issue(5,"now()+interval '1 day'",decisions));
  for(const decisions of [[{lineId:line(52)}],[{lineId:line(52),unitPriceCents:100}],[{lineId:line(52),unitPriceCents:0,pricingBasis:"Synthetic approved quote"}]])
    await refused(issue(52,"now()+interval '1 day'",decisions));
  await refused(issue(54,"now()+interval '1 day'",[{lineId:line(54),unitPriceCents:1000001,pricingBasis:"Synthetic approved quote"}]));
  assert.deepEqual(await counts(),safeCounts);
  const quoted=json(await psql(issue(52,"now()+interval '1 day'",[{lineId:line(52),unitPriceCents:100,pricingBasis:"Synthetic reviewed terms, not a product price"}])));
  assert.equal(quoted.totalCents,200);assert.equal(quoted.lines[0].priceSource,"quoted");
  const quotedSnapshot=await row(quoted.quoteId);
  await refused(issue(52));assert.deepEqual(await row(quoted.quoteId),quotedSnapshot);
  assert.equal((await scopeCounts(52)).quotes,1);
  process.stdout.write("AFTER PASS Care/held/no-price/price-override/zero/duplicate/extra/limit guards; reissue never invents or auto-copies missing quote cents/basis.\n");

  const rollbackQuote=json(await psql(issue(5)));
  const rollbackRow=await row(rollbackQuote.quoteId),rollbackCounts=await counts();
  await psql(`create function public.synthetic_reissue_interrupt() returns trigger language plpgsql as $$begin
    if new.request_id='${request(5)}' and new.version>1 then raise exception 'Synthetic interruption after supersede' using errcode='P0001',detail='SYNTHETIC_REISSUE_INTERRUPTION';end if;return new;end$$;
    create trigger synthetic_reissue_interrupt before insert on public.research_assisted_order_quotes for each row execute function public.synthetic_reissue_interrupt();`);
  await refused(issue(5),"P0001","SYNTHETIC_REISSUE_INTERRUPTION");
  assert.deepEqual(await row(rollbackQuote.quoteId),rollbackRow);assert.deepEqual(await counts(),rollbackCounts);
  await psql("drop trigger synthetic_reissue_interrupt on public.research_assisted_order_quotes;drop function public.synthetic_reissue_interrupt();");
  await refused(`update public.research_assisted_order_quotes set total_cents=5001 where id='${rollbackQuote.quoteId}';`,"P0001","ASSISTED_ORDER_QUOTE_IMMUTABLE");
  await refused(`delete from public.research_assisted_order_quotes where id='${rollbackQuote.quoteId}';`,"P0001","ASSISTED_ORDER_QUOTE_IMMUTABLE");
  process.stdout.write("AFTER PASS failure after supersede rolls back both prior state and new version; direct snapshot economics/deletion still refused.\n");

  const qa=json(await psql(issue(6))),qb=json(await psql(issue(7)));
  const acceptFirst=await lockedRace(accept(6,qa.quoteId),issue(6),["P0001",null,"An accepted quote cannot be repriced"]);
  assert.equal(acceptFirst.first[0].replayed,false);assert.equal((await scopeCounts(6)).quotes,1);
  const issueFirst=await lockedRace(issue(7),accept(7,qb.quoteId),["P0001","ASSISTED_ORDER_QUOTE_STALE"]);
  assert.equal(issueFirst.first[0].version,2);assert.equal((await scopeCounts(7)).accepted,0);
  await refused(accept(7,qb.quoteId),"P0001","ASSISTED_ORDER_QUOTE_STALE");
  const cancelFirst=await lockedRace(service(`select ${statusExpr(8,"reviewing","cancelled",{cancellationReason:"Synthetic cancellation"})}::text;`),issue(8),["P0001",null,"Request is not quote-ready"]);
  assert.equal(cancelFirst.refused,true);assert.equal((await scopeCounts(8)).quotes,0);
  const issueBeforeCancel=await lockedRace(issue(9),service(`select ${statusExpr(9,"reviewing","cancelled",{cancellationReason:"Synthetic cancellation"})}::text;`));
  assert.equal((await scopeCounts(9)).status,"cancelled");
  await refused(accept(9,issueBeforeCancel.first[0].quoteId),"P0001","ASSISTED_ORDER_QUOTE_ACCEPTANCE_CLOSED");
  const twoIssues=await lockedRace(issue(10),issue(10));
  assert.equal(twoIssues.first[0].version,1);assert.equal(twoIssues.second[0].version,2);
  assert.equal((await row(twoIssues.first[0].quoteId)).state,"superseded");
  process.stdout.write("RACE PASS independent service-role connections actually block on parent locks: accept-first/issue-first, cancel-first/issue-first, two issue versions; no stale acceptance after reissue commit.\n");

  // A valid observation/verification already requires an immutable accepted
  // quote. Racing issuance cannot replace it even before evidence commits.
  const qo=json(await psql(issue(11)));await psql(accept(11,qo.quoteId));
  await psql(service(`select ${statusExpr(11,"reviewing","payment_pending")};select ${statusExpr(11,"payment_pending","payment_review")};`));
  const observationRace=await lockedRace(service(`select ${observeExpr(11,qo.quoteId)}::text;`),issue(11),["P0001",null,"An accepted quote cannot be repriced"]);
  const obs=observationRace.first[0].observationId;
  assert.equal((await scopeCounts(11)).quotes,1);assert.equal((await scopeCounts(11)).observations,1);
  const verificationRace=await lockedRace(service(`select ${verifyExpr(11,obs)}::text;`),issue(11),["P0001",null,"Request is not quote-ready"]);
  assert.equal(verificationRace.first[0].state,"paid");assert.equal((await scopeCounts(11)).verifications,1);
  assert.equal(json(await psql(service(`select ${verifyExpr(11,obs)}::text;`))).replayed,true);
  const effects=await counts();assert.equal(effects.outbox,1);assert.equal(effects.audit,0);
  assert.equal(await psql("select status from public.research_notification_outbox;"),"held");
  process.stdout.write("RACE PASS accepted observation and verification serialize with issue; one genuine synthetic verification/held intent, replay preserved, no dispatch/audit claim.\n");

  for(const role of ["anon","authenticated"]){
    await refused(`set role ${role};select ${quoteExpr(12)};`,"42501");
    await refused(`set role ${role};select ${acceptExpr(1,q1.quoteId)};`,"42501");
  }
  await refused("set role service_role;select * from public.research_assisted_order_quotes;","42501");
  await refused(`begin;alter function public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text) reset all;${postcheck}`,"55000");
  await refused(`begin;alter table public.research_assisted_order_quotes enable replica trigger hl12_quote_snapshot_immutable;${postcheck}`,"55000");
  process.stdout.write("POSTCHECK "+await psql(postcheck)+"\n");
  await psql(await readFile("supabase/verification/research_assisted_order_quote_effects_postcheck.sql","utf8"));
  process.stdout.write("AFTER PASS actual anon/authenticated refusal, private table boundary, null search_path/replica-trigger drift refusal, canonical effects postcheck preserved.\n");
  process.stdout.write("FINAL "+JSON.stringify({counts:await counts(),migrationSha256:createHash("sha256").update(migration).digest("hex"),
    durationSeconds:Number(((performance.now()-startedAt)/1000).toFixed(3)),scope:"disposable SQL only; no managed, PostgREST, live funds or mail qualification"})+"\n");
} finally {
  if(containerId){await runFile("docker",["rm","-f",containerId],{windowsHide:true});process.stdout.write("CLEANUP exact disposable container removed.\n");}
}
