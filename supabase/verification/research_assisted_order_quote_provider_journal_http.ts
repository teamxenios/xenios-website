// LOCAL composed proof: actual Express/viewer/route/service and service_role
// SQL inside the parent's exact no-network PG17 container. The bearer stamp
// and authenticator are synthetic fixtures, NOT real provider authentication.
// No webhook route, external session, money, mail or hosted write is enabled.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import request from "supertest";
import { createAssistedOrderRouteTable } from "../../server/research/assisted-order/http";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "../../server/research/assisted-order/express";
import { AssistedProviderJournalService, type AssistedProviderJournalSource } from "../../server/research/assisted-order/payment/provider-journal";
import type { AssistedOrderService } from "../../server/research/assisted-order/service";
import type { SupabaseRpcClient } from "../../server/research/assisted-order/supabase-repository";

assert.equal(process.version,"v20.19.0");
const container=process.argv[2],phase=process.argv[3];
assert.match(container??"",/^[a-f0-9]{64}$/);
assert.ok(phase==="bound"||phase==="quarantine"||phase==="legacy");
const inspected=JSON.parse((await promisify(execFile)("docker",["inspect",container,"--format","{{json .}}"],{windowsHide:true})).stdout);
assert.equal(inspected.State.Running,true);assert.equal(inspected.HostConfig.NetworkMode,"none");
assert.equal(Object.keys(inspected.HostConfig.PortBindings??{}).length,0);
assert.equal(inspected.Config.Image,"postgres:17-alpine");
const id=(prefix:number,n:number)=>`${prefix}0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const actor=id(4,1),other=id(4,800),requestId=(n:number)=>id(1,n);
const q=(value:unknown)=>value===null?"null":`'${String(value).replaceAll("'","''")}'`;
const scope={provider:"synthetic-unconfigured",accountId:"synthetic-account",mode:"test" as const};
const sourceId="synthetic-provider-journal",revision="synthetic-adapter-v1";
const path="/api/admin/research/assisted-orders/:requestId/provider-attempts";
let sqlCalls=0,authCalls=0,groups=0;
async function psql(sql:string):Promise<string> {
  sqlCalls++;
  return new Promise((resolve,reject)=>{
    const child=spawn("docker",["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{windowsHide:true});
    let stdout="",stderr="";const timer=setTimeout(()=>child.kill(),30_000);
    child.stdout.on("data",chunk=>{stdout+=chunk;});child.stderr.on("data",chunk=>{stderr+=chunk;});
    child.on("error",error=>{clearTimeout(timer);reject(error);});
    child.on("close",code=>{clearTimeout(timer);if(code===0)resolve(stdout.trim());else reject(Object.assign(new Error("Disposable SQL refused"),{stderr,code}));});
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
const types:Record<string,Readonly<Record<string,string>>>={
  research_assisted_order_provider_journal_authority:{},
  research_assisted_order_provider_attempt_reserve:{p_request_id:"uuid",p_quote_id:"uuid",p_quote_version:"integer",p_acceptance_id:"uuid",p_source_id:"text",p_adapter_revision:"text",p_expected_scope:"jsonb",p_actor_auth_user_id:"uuid",p_idempotency_key:"text"},
  research_assisted_order_provider_event_append:{p_source_id:"text",p_adapter_revision:"text",p_expected_scope:"jsonb",p_event:"jsonb"},
  research_assisted_order_provider_uncertainty:{p_request_id:"uuid"},
};
const calls:string[]=[];
function sqlFor(name:string,args:Record<string,unknown>={}) {
  assert.ok(types[name],"Only journal proof RPCs may be called");
  assert.deepEqual(Object.keys(args).sort(),Object.keys(types[name]).sort());
  const params=Object.entries(types[name]).map(([key,type])=>`${key}=>${q(args[key]===null?null:type==="jsonb"?JSON.stringify(args[key]):args[key])}::${type}`).join(",");
  return `set role service_role;select public.${name}(${params})::text;`;
}
const rpc:SupabaseRpcClient={rpc:async(name,args={})=>{
  calls.push(name);
  try{const output=await psql(sqlFor(name,args));return{data:output?JSON.parse(output):null,error:null};}
  catch(error){const diagnostic=(error as {stderr?:string}).stderr;if(diagnostic===undefined)throw error;
    return{data:null,error:{code:/ERROR:\s+([A-Z0-9]{5}):/.exec(diagnostic)?.[1]??"LOCAL_SQL_ERROR",details:/DETAIL:\s+([^\r\n]+)/.exec(diagnostic)?.[1],message:"Disposable SQL authority refused"}};}
}};
async function command(n:number) {
  return JSON.parse(await psql(`select json_build_object('quoteId',id,'quoteVersion',version,'acceptanceId',acceptance_id)::text
    from public.research_assisted_order_quotes where request_id=${q(requestId(n))} and state='accepted';`));
}
async function facts(n:number) {
  return JSON.parse(await psql(`select json_build_object('status',(select status from public.research_assisted_order_requests where id=${q(requestId(n))}),
    'observations',(select count(*) from public.research_assisted_order_payment_observations where request_id=${q(requestId(n))}),
    'verifications',(select count(*) from public.research_assisted_order_payment_verifications where request_id=${q(requestId(n))}),
    'financial',public.research_assisted_order_financial_state(${q(requestId(n))}),
    'audit',(select count(*) from public.research_assisted_order_audit_events_v1 where request_id=${q(requestId(n))}),
    'outbox',(select count(*) from public.research_notification_outbox where assisted_order_verification_id in
      (select id from public.research_assisted_order_payment_verifications where request_id=${q(requestId(n))})))::text;`));
}
const count=async()=>Number(await psql("select count(*) from public.research_assisted_order_provider_event_journal;"));
let normalized:unknown=null;
const source:AssistedProviderJournalSource={sourceId,adapterRevision:revision,scope,authenticateEvent:async(envelope)=>{
  authCalls++;assert.ok(envelope.rawBody instanceof Uint8Array);return{ok:true,value:normalized};
}};
function mounted(client=rpc,configured:AssistedProviderJournalSource|null=source,actorId=actor) {
  const provider=new AssistedProviderJournalService(client,configured);
  const viewers=createAssistedOrderViewerResolvers({resolveMember:async()=>null,earlyAccess:()=>null,earlyAccessBindings:()=>null,
    adminEmail:()=>"synthetic-provider-journal@example.test"});
  const routes=createAssistedOrderRouteTable<ExpressAssistedOrderRequest>({} as AssistedOrderService,viewers,null,null,null,null,provider);
  const route=routes.find(row=>row.method==="POST"&&row.path===path);assert.ok(route);assert.equal(route.auth,"admin");
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{if(req.headers.authorization==="Bearer synthetic-local-admin")Object.assign(req,{adminAuthUserId:actorId});next();});
  app.post(path,assistedOrderExpressHandler(route));
  const post=(n:number,body:Record<string,unknown>)=>request(app).post(path.replace(":requestId",requestId(n))).set("authorization","Bearer synthetic-local-admin").send(body);
  return{app,provider,post};
}
const envelope=(key:string)=>({rawBody:new TextEncoder().encode(`synthetic-original-bytes:${key}`),headers:{"synthetic-auth":"local-only"}});
async function event(n:number,key:string) {
  const attempt=JSON.parse(await psql(`select row_to_json(a)::text from public.research_assisted_order_provider_attempts a where request_id=${q(requestId(n))};`));
  return{...scope,eventId:key,attemptId:attempt.id,requestId:requestId(n),quoteId:attempt.quote_id,quoteVersion:attempt.quote_version,
    acceptanceId:attempt.acceptance_id,canonicalOrderId:null,providerPaymentId:`synthetic-http-payment-${n}`,providerSessionId:null,
    kind:"captured",observedAmountCents:5000,currency:"USD",occurredAt:new Date().toISOString(),adjustmentId:null};
}
const pass=(label:string)=>{groups++;process.stdout.write(`HTTP_SQL PASS ${label}\n`);};
const h=mounted();
if(phase==="legacy") {
  const oldAuthority=JSON.parse(await psql("set role service_role;select public.research_assisted_order_provider_journal_authority()::text;"));
  assert.deepEqual(oldAuthority,{schemaVersion:"assisted_order_provider_journal_v1",settlementEnabled:false,refundEnabled:false,liveExecutionEnabled:false});
  const before=await facts(800),beforeCount=await count();
  const response=await h.post(800,await command(800));
  assert.equal(response.status,409,JSON.stringify(response.body));assert.equal(response.body.error,"provider_journal_unavailable");
  assert.deepEqual(calls,["research_assisted_order_provider_journal_authority"]);
  assert.equal(await psql("select count(*) from public.research_assisted_order_provider_attempts;"),"0");
  normalized={...scope,eventId:"synthetic-valid-old-authority-ingress",kind:"captured"};
  assert.deepEqual(await h.provider.receiveAuthenticated(envelope("legacy")),{ok:false,code:"persistence_unavailable"});
  assert.deepEqual(calls,["research_assisted_order_provider_journal_authority","research_assisted_order_provider_journal_authority"]);
  await assert.rejects(h.provider.uncertainty(requestId(800)),/Provider payment processing remains unavailable/);
  assert.deepEqual(calls,Array(3).fill("research_assisted_order_provider_journal_authority"));
  assert.equal(authCalls,1);assert.equal(await count(),beforeCount);assert.deepEqual(await facts(800),before);
  pass("new application receives genuinely self-valid old v1 SQL authority and refuses before reservation or journal write");
  process.stdout.write(`HTTP_SQL COMPLETE ${JSON.stringify({phase,groups,sqlCalls,authCalls,node:process.version,syntheticAuth:true,providerConfigured:false,managedStateMutated:false})}\n`);
  process.exit(0);
}
const before=await facts(800);
assert.deepEqual(before,{status:"payment_review",observations:0,verifications:0,financial:{hasObservation:false,paymentVerified:false},audit:0,outbox:0});
if(phase==="bound") {
  const body=await command(800),response=await h.post(800,body);
  assert.equal(response.status,201,JSON.stringify(response.body));assert.equal(response.headers["cache-control"],"no-store");
  assert.equal(response.body.state,"held");assert.equal(response.body.expectedAmountCents,5000);assert.equal(response.body.currency,"USD");
  assert.equal(response.body.requestId,requestId(800));assert.equal(response.body.replayed,false);
  assert.doesNotMatch(JSON.stringify(response.body),/synthetic-account|actor_label|idempotency|rawBody|clientSecret/);
  assert.equal(authCalls,0);assert.deepEqual(await facts(800),before);
  const replay=await h.post(800,body);assert.equal(replay.status,201);assert.deepEqual(replay.body,{...response.body,replayed:true});
  pass("mounted exact accepted quote reserves held once, never invokes provider, preserves price/financial authority and safe public receipt");

  const start=calls.length;
  assert.equal((await request(h.app).post(path.replace(":requestId",requestId(801))).send(await command(801))).status,403);
  assert.equal((await h.post(801,{...await command(801),expectedAmountCents:1})).status,400);assert.equal(calls.length,start);
  assert.equal((await h.post(999,body)).status,404);
  assert.equal((await h.post(801,body)).status,409);
  assert.equal((await mounted(rpc,source,other).post(801,await command(801))).status,403);
  for(const changed of [{...scope,accountId:"wrong-account"},{...scope,provider:"wrong-provider"},{...scope,mode:"live" as const}]) {
    assert.equal((await mounted(rpc,{...source,scope:changed}).post(801,await command(801))).status,409);
  }
  assert.equal((await mounted(rpc,{...source,adapterRevision:"wrong-revision"}).post(801,await command(801))).status,409);
  assert.equal((await mounted(rpc,null).post(801,await command(801))).status,409);
  assert.deepEqual(await facts(801),before);assert.equal(authCalls,0);
  pass("mounted authorization, nonexistent request, wrong binding/scope/revision, null adapter and browser price refusal reach the effective SQL contract safely");

  await psql(`insert into public.research_assisted_order_provider_source_grants(source_id,auth_user_id,actor_label,granted_by)
    values(${q(sourceId)},${q(other)},'synthetic-revocable-admin','synthetic-owner');
    update public.research_assisted_order_provider_source_grants set revoked_at=clock_timestamp() where auth_user_id=${q(other)};`);
  assert.equal((await mounted(rpc,source,other).post(801,await command(801))).status,403);
  pass("revoked scoped reservation grant remains denied through mounted application");

  normalized=await event(800,"synthetic-http-bound");
  const e=envelope("synthetic-http-bound"),first=await h.provider.receiveAuthenticated(e);assert.equal(first.ok,true);
  if(!first.ok)throw new Error("Expected durable bound receipt");
  assert.equal(first.receipt.classification,"bound");assert.equal(first.receipt.state,"held");
  assert.equal(first.receipt.requestId,requestId(800));assert.equal(first.receipt.replayed,false);
  const again=await h.provider.receiveAuthenticated(e);assert.equal(again.ok,true);
  if(again.ok)assert.deepEqual(again.receipt,{...first.receipt,replayed:true});
  for(const [key,changes] of [["amount",{observedAmountCents:4999}],["currency",{currency:"EUR"}]] as const) {
    normalized={...await event(800,`synthetic-http-${key}`),...changes};
    const result=await h.provider.receiveAuthenticated(envelope(key));assert.equal(result.ok,true);
    if(result.ok){assert.equal(result.receipt.classification,"quarantined");assert.equal(result.receipt.reason,"amount_currency_mismatch");assert.equal(result.receipt.requestId,requestId(800));}
  }
  assert.deepEqual(await facts(800),before);
  pass("actual synthetic-authenticator service appends/replays held SQL receipt; wrong amount/currency quarantines without payment effects");

  const countBefore=await count(),callsBefore=calls.length;
  const unauth=mounted(rpc,{...source,authenticateEvent:async()=>({ok:false,code:"REJECTED",message:"Synthetic authentication refused",retryable:false})});
  assert.deepEqual(await unauth.provider.receiveAuthenticated(e),{ok:false,code:"unauthenticated"});
  assert.equal(calls.length,callsBefore);assert.equal(await count(),countBefore);
  pass("failed synthetic authentication invokes no authority RPC and writes no journal");

  normalized=await event(800,"synthetic-http-rollback");
  const rollback:SupabaseRpcClient={rpc:async(name,args={})=>{
    if(name!=="research_assisted_order_provider_event_append")return rpc.rpc(name,args);
    try{await psql(`begin;${sqlFor(name,args)}select 1/0;`);throw new Error("Expected rollback");}
    catch(error){assert.match((error as {stderr:string}).stderr,/22012/);return{data:null,error:{code:"SYNTHETIC_ROLLBACK",message:"Synthetic local rollback"}};}
  }};
  assert.deepEqual(await mounted(rollback).provider.receiveAuthenticated(envelope("rollback")),{ok:false,code:"persistence_unavailable"});
  assert.equal(await count(),countBefore);
  const retry=await h.provider.receiveAuthenticated(envelope("rollback"));assert.equal(retry.ok,true);if(retry.ok)assert.equal(retry.receipt.replayed,false);
  normalized=await event(800,"synthetic-http-postcommit-loss");
  const lost:SupabaseRpcClient={rpc:async(name,args)=>{const result=await rpc.rpc(name,args);
    return name==="research_assisted_order_provider_event_append"?{data:null,error:{code:"SYNTHETIC_RESPONSE_LOSS",message:"Synthetic loss after commit"}}:result;}};
  assert.deepEqual(await mounted(lost).provider.receiveAuthenticated(envelope("postcommit")),{ok:false,code:"persistence_unavailable"});
  const restarted=await mounted().provider.receiveAuthenticated(envelope("postcommit"));assert.equal(restarted.ok,true);if(restarted.ok)assert.equal(restarted.receipt.replayed,true);
  assert.deepEqual(await facts(800),before);
  pass("real SQL transaction rollback has no receipt; lost committed response restarts and replays durably without false success or financial effects");
} else {
  // This second independent Node process restores immutable event facts from
  // PostgreSQL. It cannot mint new authority from the old process's memory.
  const old=JSON.parse(await psql(`select event::text from public.research_assisted_order_provider_event_journal where event->>'eventId'='synthetic-http-bound';`));
  normalized={...scope,eventId:old.eventId,attemptId:old.claimedAttemptId,requestId:old.claimedRequestId,quoteId:old.claimedQuoteId,
    quoteVersion:old.claimedQuoteVersion,acceptanceId:old.claimedAcceptanceId,canonicalOrderId:old.claimedCanonicalOrderId,
    providerPaymentId:old.providerPaymentId,providerSessionId:old.providerSessionId,kind:old.kind,observedAmountCents:old.observedAmountCents,
    currency:old.currency,occurredAt:old.occurredAt,adjustmentId:old.adjustmentId};
  const replay=await h.provider.receiveAuthenticated(envelope("synthetic-http-bound"));assert.equal(replay.ok,true);if(replay.ok)assert.equal(replay.receipt.replayed,true);
  for(const [key,changes] of [["wrong-request",{requestId:requestId(801)}],["unknown-attempt",{attemptId:id(8,899)}],
    ["wrong-provider-scope",{accountId:"other-account"}]] as const) {
    normalized={...await event(800,`synthetic-http-${key}`),...changes};
    const result=await h.provider.receiveAuthenticated(envelope(key));assert.equal(result.ok,true);
    if(result.ok){assert.equal(result.receipt.classification,"quarantined");assert.equal(result.receipt.requestId,null);assert.equal(result.receipt.attemptId,null);}
  }
  assert.deepEqual(await facts(800),before);
  const uncertainty=await h.provider.uncertainty(requestId(801));assert.equal(uncertainty.held,true);assert.equal(uncertainty.reason,"provider_unbound_event_held");
  pass("separate Node process replays original durable receipt; authenticated wrong binding/unknown/scope facts journal unbound and block absence-of-money inference");
}
process.stdout.write(`HTTP_SQL COMPLETE ${JSON.stringify({phase,groups,sqlCalls,authCalls,node:process.version,syntheticAuth:true,providerConfigured:false,managedStateMutated:false})}\n`);
