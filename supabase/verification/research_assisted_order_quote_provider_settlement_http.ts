// Effective Express/viewer/settlement/F4/audit -> service_role PostgreSQL proof.
// The parent owns one exact no-network container. Admin stamps and captured
// provider facts are synthetic, not proof of bank/provider authentication.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import express from "express";
import request from "supertest";
import { createAssistedOrderRouteTable } from "../../server/research/assisted-order/http";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "../../server/research/assisted-order/express";
import { AssistedProviderSettlementService, type AssistedProviderSettlementSource } from "../../server/research/assisted-order/payment/provider-settlement";
import { resolvePaymentEffectsRecovery, paymentEffectDispatchAllowed, type PaymentEffectsRecovery } from "../../server/research/assisted-order/payment-effects";
import { resolveAssistedOrderAuditAuthority, ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR, ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR,
  ASSISTED_ORDER_AUDIT_SCHEMA_VERSION, ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR, ASSISTED_ORDER_AUDIT_ATTESTATION,
  ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR, ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR } from "../../server/research/assisted-order/audit-store";
import { SupabaseAssistedOrderRepository, type SupabaseRpcClient } from "../../server/research/assisted-order/supabase-repository";
import { AssistedOrderService } from "../../server/research/assisted-order/service";
import type { AssistedOrderDependencies } from "../../server/research/assisted-order/ports";

assert.equal(process.version,"v20.19.0");
const container=process.argv[2],phase=process.argv[3]??"core";
assert.match(container??"",/^[a-f0-9]{64}$/);assert.ok(["legacy","core","restart"].includes(phase));
const inspection=JSON.parse((await promisify(execFile)("docker",["inspect",container,"--format","{{json .}}"],{windowsHide:true})).stdout);
assert.equal(inspection.State.Running,true);assert.equal(inspection.HostConfig.NetworkMode,"none");
assert.equal(Object.keys(inspection.HostConfig.PortBindings??{}).length,0);assert.equal(inspection.Config.Image,"postgres:17-alpine");
const id=(p:number,n:number)=>`${p}0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const q=(v:unknown)=>v===null?"null":`'${String(v).replaceAll("'","''")}'`;
const prefix="public.research_assisted_order_",path="/api/admin/research/assisted-orders/:requestId/provider-events/:journalId/settle";
const source:AssistedProviderSettlementSource={sourceId:"synthetic-provider-execution",adapterRevision:"synthetic-execution-adapter-v1",
  scope:{provider:"synthetic-unconfigured",accountId:"synthetic-execution-account",mode:"test"},policyRevision:"synthetic-settlement-policy-v1"};
const actor=id(4,1),actorLabel="synthetic-provider-journal@example.test";
let sqlCalls=0,groups=0;const calls:string[]=[],completionInputs:Record<string,unknown>[]=[];
async function psql(sql:string):Promise<string>{
  sqlCalls++;return new Promise((resolve,reject)=>{
    const child=spawn("docker",["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{windowsHide:true});
    let stdout="",stderr="";const timer=setTimeout(()=>child.kill(),30_000);
    child.stdout.on("data",c=>{stdout+=c;});child.stderr.on("data",c=>{stderr+=c;});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{clearTimeout(timer);if(code===0)resolve(stdout.trim());else reject(Object.assign(new Error("Synthetic SQL refusal"),{stderr,code}));});
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
const types:Record<string,Record<string,string>>={
  research_assisted_order_provider_settlement_authority:{},
  research_assisted_order_provider_settlement_commit:{p_request_id:"uuid",p_journal_id:"uuid",p_source_id:"text",p_adapter_revision:"text",p_expected_scope:"jsonb",p_policy_revision:"text",p_actor_auth_user_id:"uuid"},
  research_assisted_order_audit_authority:{},
  research_assisted_order_audit_append:{p_schema_version:"text",p_attestation:"text",p_event:"jsonb"},
  research_assisted_order_payment_effects_authority:{},
  research_assisted_order_payment_effects_context:{p_verification_id:"uuid"},
  research_assisted_order_payment_effects_complete:{p_verification_id:"uuid",p_schema_version:"text",p_attestation:"text",p_event:"jsonb"},
  research_assisted_order_payment_effects_pending:{p_after_created_at:"timestamptz",p_after_id:"uuid",p_limit:"integer"},
  research_assisted_order_payment_effects_outbox_ready:{p_outbox_id:"uuid",p_verification_id:"uuid",p_event_key:"text",p_recipient:"text",p_template_key:"text",p_payload:"jsonb"},
  research_assisted_order_admin_get:{p_request_id:"uuid"},
  research_assisted_order_financial_state:{p_request_id:"uuid"},
  research_assisted_order_set_status:{p_request_id:"uuid",p_expected_status:"text",p_new_status:"text",p_actor_id:"text",p_actor_type:"text",p_customer_message:"text",p_internal_note:"text",p_evidence:"jsonb",p_occurred_at:"timestamptz"},
};
function sqlFor(name:string,args:Record<string,unknown>={}){
  assert.ok(types[name],`Only explicitly allowed local RPCs: ${name}`);assert.deepEqual(Object.keys(args).sort(),Object.keys(types[name]).sort());
  return `set role service_role;select public.${name}(${Object.entries(types[name]).map(([k,t])=>`${k}=>${q(args[k]===null?null:t==="jsonb"?JSON.stringify(args[k]):args[k])}::${t}`).join(",")})::text;`;
}
let failCompletion=false,appendAuditThenFail=false,loseReceipt=false,rollbackSettlement=false;
const rpc:SupabaseRpcClient={rpc:async(name,args={})=>{
  calls.push(name);
  try{
    if(name==="research_assisted_order_payment_effects_complete"){
      completionInputs.push(args);
      if(appendAuditThenFail){appendAuditThenFail=false;await psql(sqlFor("research_assisted_order_audit_append",{
        p_schema_version:args.p_schema_version,p_attestation:args.p_attestation,p_event:args.p_event}));
        return{data:null,error:{code:"SYNTHETIC_INTERRUPTION",message:"Synthetic held-outbox interruption after audit append"}};}
      if(failCompletion){failCompletion=false;return{data:null,error:{code:"SYNTHETIC_INTERRUPTION",message:"Synthetic effect interruption"}};}
    }
    if(name==="research_assisted_order_provider_settlement_commit"&&rollbackSettlement){rollbackSettlement=false;await psql(`begin;${sqlFor(name,args)}select 1/0;commit;`);}
    const raw=await psql(sqlFor(name,args));
    if(name==="research_assisted_order_provider_settlement_commit"&&loseReceipt){loseReceipt=false;throw new Error("SYNTHETIC_COMMITTED_RECEIPT_LOSS");}
    return{data:raw?JSON.parse(raw):null,error:null};
  }catch(e){const stderr=(e as {stderr?:string}).stderr;if(stderr===undefined)throw e;
    return{data:null,error:{code:/ERROR:\s+([A-Z0-9]{5}):/.exec(stderr)?.[1]??"LOCAL_SQL_ERROR",details:/DETAIL:\s+([^\r\n]+)/.exec(stderr)?.[1],message:"Synthetic SQL refusal"}};
  }
}};
async function recovery(keyId="synthetic-adp03-key-1"){
  const audit=await resolveAssistedOrderAuditAuthority({rpc,env:{
    [ASSISTED_ORDER_AUDIT_ENABLED_ENV_VAR]:"true",[ASSISTED_ORDER_AUDIT_SCHEMA_ENV_VAR]:ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
    [ASSISTED_ORDER_AUDIT_ATTESTATION_ENV_VAR]:ASSISTED_ORDER_AUDIT_ATTESTATION,[ASSISTED_ORDER_AUDIT_ACTOR_KEY_ID_ENV_VAR]:keyId,
    [ASSISTED_ORDER_AUDIT_ACTOR_HMAC_KEY_ENV_VAR]:Buffer.alloc(32,keyId.endsWith("2")?2:1).toString("base64url"),
  }});assert.equal(audit.available,true);if(!audit.available)throw new Error("Canonical SQL audit unavailable");
  const effects=await resolvePaymentEffectsRecovery({enabled:true,rpc,audit:audit.authority});assert.ok(effects);return effects;
}
function mount(effects:PaymentEffectsRecovery|null,configured:AssistedProviderSettlementSource|null=source,actorId=actor){
  const svc=new AssistedProviderSettlementService(rpc,configured);
  // Real status service/repository/SQL authorization. Ordinary progression
  // side effects are synthetic no-op sinks here, not production delivery or
  // audit proof. Provider verification effects use the actual F4 sink above.
  const statusService=new AssistedOrderService({repository:new SupabaseAssistedOrderRepository(rpc),
    clock:{now:()=>new Date()},ids:{uuid:()=>randomUUID()},outbox:{enqueue:async()=>{}},audit:{record:async()=>{}},
    logger:{warn:()=>{}},googleMirror:null} as unknown as AssistedOrderDependencies);
  const viewers=createAssistedOrderViewerResolvers({resolveMember:async()=>null,earlyAccess:()=>null,earlyAccessBindings:()=>null,adminEmail:()=>actorLabel});
  const routes=createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(statusService,viewers,null,null,effects,null,null,null,svc);
  const descriptor=routes.find(row=>row.method==="POST"&&row.path===path);assert.ok(descriptor);assert.equal(descriptor.auth,"admin");
  const statusPath="/api/admin/research/assisted-orders/:requestId/status";
  const statusRoute=routes.find(row=>row.method==="PATCH"&&row.path===statusPath);assert.ok(statusRoute);
  const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers.authorization==="Bearer synthetic-adp03")Object.assign(req,{adminAuthUserId:actorId});next();});
  app.post(path,assistedOrderExpressHandler(descriptor));
  app.patch(statusPath,assistedOrderExpressHandler(statusRoute));
  return{app,progress:(n:number,status:string,evidence:Record<string,unknown>)=>request(app).patch(statusPath.replace(":requestId",id(1,n)))
    .set("authorization","Bearer synthetic-adp03").send({status,evidence}),post:async(n:number,body:Record<string,unknown>={},auth=true,journalOverride?:string)=>{
    const journal=journalOverride??await psql(`select id from ${prefix}provider_event_journal where event->>'eventId'='synthetic-settlement-capture-${n}';`);
    const req=request(app).post(path.replace(":requestId",id(1,n)).replace(":journalId",journal||id(8,n)));
    if(auth)req.set("authorization","Bearer synthetic-adp03");return req.send(body);
  }};
}
async function state(n:number){return JSON.parse(await psql(`select json_build_object(
  'status',(select status from ${prefix}requests where id='${id(1,n)}'),
  'financial',${prefix}financial_state('${id(1,n)}'),
  'observations',(select count(*) from ${prefix}payment_observations where request_id='${id(1,n)}'),
  'verifications',(select count(*) from ${prefix}payment_verifications where request_id='${id(1,n)}'),
  'paidEvents',(select count(*) from ${prefix}events where request_id='${id(1,n)}' and status='paid'),
  'audit',(select count(*) from ${prefix}audit_events_v1 where request_id='${id(1,n)}'),
  'outbox',(select count(*) from public.research_notification_outbox where assisted_order_verification_id in(select id from ${prefix}payment_verifications where request_id='${id(1,n)}'))
  )::text;`));}
async function verification(n:number){return psql(`select id from ${prefix}payment_verifications where request_id='${id(1,n)}';`);}
async function job(n:number):Promise<Record<string,unknown>>{return JSON.parse(await psql(`select row_to_json(o)::text from public.research_notification_outbox o where assisted_order_verification_id in(select id from ${prefix}payment_verifications where request_id='${id(1,n)}');`));}
const unpaid={status:"payment_review",financial:{hasObservation:false,paymentVerified:false},observations:0,verifications:0,paidEvents:0,audit:0,outbox:0};
const paid=(audit:number)=>({status:"paid",financial:{hasObservation:true,paymentVerified:true},observations:1,verifications:1,paidEvents:1,audit,outbox:1});
const pass=(label:string)=>{groups++;process.stdout.write(`SETTLEMENT_HTTP_SQL PASS ${label}\n`);};
const effects=await recovery();
if(phase==="legacy"){
  const old=JSON.parse(await psql(`set role service_role;select ${prefix}provider_execution_authority()::text;`));
  assert.equal(old.schemaVersion,"assisted_order_provider_execution_v1");assert.equal(old.settlementEnabled,false);
  const h=mount(effects),before=await state(1400),seen=calls.length,response=await h.post(1400);
  assert.equal(response.status,409);assert.equal(response.body.error,"provider_settlement_unavailable");
  assert.deepEqual(calls.slice(seen),["research_assisted_order_provider_settlement_authority"]);assert.deepEqual(await state(1400),before);
  pass("actual self-valid ADP02 held authority does not enable settlement or canonical financial writes");
}else if(phase==="restart"){
  const restarted=await recovery("synthetic-adp03-key-2");
  for(const n of [1401,1402,1403]){
    const expectedStatus=n===1401?"supplier_processing":"paid";
    const before=await state(n);assert.deepEqual(before,{...paid(n===1402?1:0),status:expectedStatus});assert.equal((await job(n)).status,"held");
    const vid=await verification(n),callsBefore=completionInputs.length;
    await Promise.all([restarted.recover(vid,id(1,n)),restarted.recover(vid,id(1,n))]);
    assert.deepEqual(await state(n),{...paid(1),status:expectedStatus});assert.equal(await paymentEffectDispatchAllowed(rpc,await job(n)),true);
    if(n===1402)assert.ok(completionInputs.slice(callsBefore).every(input=>input.p_event===null),"Stored audit receipt must be reused after key rotation");
    const completedCalls=completionInputs.length;await restarted.recover(vid,id(1,n));assert.equal(completionInputs.length,completedCalls);
  }
  pass("new Node process and rotated key recover actual canonical provider obligations once, including interrupted audit and concurrent completion");
  const h=mount(restarted),retry=await h.post(1401);assert.equal(retry.status,200);assert.equal(retry.body.replayed,true);
  assert.equal((await h.progress(1401,"shipped",{trackingId:"synthetic-held-after-adverse"})).status,409);
  assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1401)),true);
  pass("financial hold blocks progression after recovery and receipt replay without inventing audit-before-fulfillment policy");
}else{
  const h=mount(effects),response=await h.post(1400);assert.equal(response.status,200,JSON.stringify(response.body));
  assert.equal(response.headers["cache-control"],"no-store");assert.equal(response.body.state,"verified");
  assert.deepEqual(Object.keys(response.body).sort(),["schemaVersion","settlementId","requestId","journalId","verificationId","verifiedAt","state","replayed"].sort());
  assert.doesNotMatch(JSON.stringify(response.body),/sourceId|accountId|providerPaymentId|verifiedBy|synthetic-provider|quoteVersion/);
  assert.deepEqual(await state(1400),paid(1));assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1400)),true);
  const replay=await h.post(1400);assert.equal(replay.status,200);assert.deepEqual(replay.body,{...response.body,replayed:true});assert.deepEqual(await state(1400),paid(1));
  assert.equal(await psql(`select count(*) from ${prefix}audit_events_v1 where request_id='${id(1,1400)}' and actor_type='admin' and actor_alias not like '%synthetic-provider-journal%';`),"1");
  pass("mounted settlement atomically verifies exact capture, redacts receipt and completes one admin canonical audit/outbox obligation; replay is read-only");

  const beforeCalls=calls.length;
  for(const [body,auth,expected] of [[{},false,403],[{amountCents:5000},true,400],[{currency:"USD"},true,400],[{paid:true},true,400],[{sourceId:source.sourceId},true,400]] as const)
    assert.equal((await h.post(1408,body,auth)).status,expected);
  assert.equal((await mount(null).post(1408)).status,409);assert.equal((await mount(effects,null).post(1408)).status,409);
  assert.equal(calls.length,beforeCalls);assert.deepEqual(await state(1408),unpaid);
  assert.equal((await mount(effects,source,id(4,2)).post(1408)).status,403);
  for(const configured of [{...source,adapterRevision:"wrong-revision"},{...source,policyRevision:"wrong-policy"},
    {...source,scope:{...source.scope,accountId:"wrong-account"}},{...source,scope:{...source.scope,mode:"live" as const}}])
    assert.equal((await mount(effects,configured).post(1408)).status,403);
  assert.deepEqual(await state(1408),unpaid);
  pass("missing F4, browser financial claims, missing actor and wrong source/scope/policy/grant refuse without canonical writes");

  failCompletion=true;const interrupted=await h.post(1401);assert.equal(interrupted.status,503);assert.equal(interrupted.body.error,"payment_verification_effects_pending");
  assert.match(interrupted.body.message,/recorded|verified/i);assert.deepEqual(await state(1401),paid(0));assert.equal((await job(1401)).status,"held");
  assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1401)),false);
  const progression=await h.progress(1401,"supplier_processing",{supplierAssignmentId:"synthetic-assignment-1401"});
  assert.equal(progression.status,200,JSON.stringify(progression.body));
  assert.deepEqual(await state(1401),{...paid(0),status:"supplier_processing"});assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1401)),false);
  const late=JSON.parse(await psql(`select event::text from ${prefix}provider_event_journal where event->>'eventId'='synthetic-settlement-capture-1401';`));
  Object.assign(late,{eventId:"synthetic-adp03-adverse-1401",payloadSha256:createHash("sha256").update("synthetic-adverse-1401").digest("hex"),kind:"dispute_opened",occurredAt:new Date().toISOString()});
  await psql(`set role service_role;select ${prefix}provider_event_append(${q(source.sourceId)},${q(source.adapterRevision)},${q(JSON.stringify(source.scope))}::jsonb,${q(JSON.stringify(late))}::jsonb);`);
  const eligibility=JSON.parse(await psql(`set role service_role;select ${prefix}financial_eligibility('${id(1,1401)}')::text;`));
  assert.equal(eligibility.paymentVerified,true);assert.equal(eligibility.fulfillmentEligible,false);
  assert.equal((await h.progress(1401,"shipped",{trackingId:"synthetic-held-after-adverse"})).status,409);
  assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1401)),false);
  pass("eligible supplier progression can precede notification audit; new adverse fact independently blocks next mounted progression while payment remains verified");
  appendAuditThenFail=true;const interruptedAudit=await h.post(1402);assert.equal(interruptedAudit.status,503);assert.deepEqual(await state(1402),paid(1));
  assert.equal((await job(1402)).status,"held");assert.equal(await paymentEffectDispatchAllowed(rpc,await job(1402)),false);
  pass("postcommit interruptions retain verified facts and truthful503 while exact outbox stays held, including audit-appended-before-release");

  loseReceipt=true;const lost=await h.post(1403);assert.equal(lost.status,409);assert.equal(lost.body.error,"provider_settlement_unavailable");
  assert.deepEqual(await state(1403),paid(0));assert.equal((await job(1403)).status,"held");
  pass("lost SQL commit receipt is not falsely acknowledged or rolled back; durable held obligation awaits restart");
  rollbackSettlement=true;const rolled=await h.post(1404);assert.equal(rolled.status,409);assert.deepEqual(await state(1404),unpaid);
  const retry=await h.post(1404);assert.equal(retry.status,200,JSON.stringify(retry.body));assert.deepEqual(await state(1404),paid(1));
  pass("transaction interruption rolls back settlement/observation/claim/verification/event/outbox together, then retries exactly");
  const concurrent=await Promise.all([h.post(1405),h.post(1405)]);assert.ok(concurrent.every(r=>r.status===200));
  assert.deepEqual(concurrent.map(r=>r.body.replayed).sort(),[false,true]);assert.deepEqual(await state(1405),paid(1));
  pass("concurrent mounted commands share one verification and F4 completion, not duplicate paid/audit/outbox writes");

  const foreign=await psql(`select id from ${prefix}provider_event_journal where event->>'eventId'='synthetic-settlement-capture-1406';`);
  const mismatch=await h.post(1408,{},true,foreign);assert.equal(mismatch.status,409);assert.deepEqual(await state(1408),unpaid);
  pass("cross-request journal identity remains held without exposing or settling another request");
}
process.stdout.write(`SETTLEMENT_HTTP_SQL COMPLETE ${JSON.stringify({phase,groups,sqlCalls,node:process.version,syntheticAuth:true,syntheticCaptureFacts:true,realProviderAuthenticated:false,emailSent:false,managedStateMutated:false})}\n`);
