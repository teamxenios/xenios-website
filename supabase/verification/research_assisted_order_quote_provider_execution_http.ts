// Actual Express/viewer/service/SQL composition, synthetic adapter and actor.
// This proves no live provider authentication, provider guarantee or money flow.
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import express from "express";
import request from "supertest";
import { createAssistedOrderRouteTable } from "../../server/research/assisted-order/http";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "../../server/research/assisted-order/express";
import { AssistedProviderExecutionService, type AssistedProviderExecutionSource, type AssistedProviderCreateBody } from "../../server/research/assisted-order/payment/provider-execution";
import type { SupabaseRpcClient } from "../../server/research/assisted-order/supabase-repository";
import type { AssistedOrderService } from "../../server/research/assisted-order/service";

assert.equal(process.version,"v20.19.0");
const container=process.argv[2], phase=process.argv[3]??"core";
assert.match(container??"",/^[a-f0-9]{64}$/);assert.ok(["legacy","core","restart"].includes(phase));
const inspection=JSON.parse((await promisify(execFile)("docker",["inspect",container,"--format","{{json .}}"],{windowsHide:true})).stdout);
assert.equal(inspection.State.Running,true);assert.equal(inspection.HostConfig.NetworkMode,"none");
assert.equal(Object.keys(inspection.HostConfig.PortBindings??{}).length,0);assert.equal(inspection.Config.Image,"postgres:17-alpine");
const q=(v:unknown)=>v===null?"null":`'${String(v).replaceAll("'","''")}'`;
const id=(p:number,n:number)=>`${p}0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const sourceId="synthetic-provider-execution",adapterRevision="synthetic-execution-adapter-v1",policyRevision="synthetic-create-policy-v1";
const scope={provider:"synthetic-unconfigured",accountId:"synthetic-execution-account",mode:"test" as const};
const path="/api/admin/research/assisted-orders/:requestId/provider-attempts/:attemptId/prepare";
let sqlCalls=0,groups=0,creates=0,retrieves=0;const calls:string[]=[];
const bodies:AssistedProviderCreateBody[]=[],keys:string[]=[];
async function psql(sql:string):Promise<string>{
  sqlCalls++;
  return new Promise((resolve,reject)=>{
    const child=spawn("docker",["exec","-i",container,"psql","-X","-q","-A","-t","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],{windowsHide:true});
    let stdout="",stderr="";const timer=setTimeout(()=>child.kill(),30_000);
    child.stdout.on("data",c=>{stdout+=c;});child.stderr.on("data",c=>{stderr+=c;});
    child.on("error",e=>{clearTimeout(timer);reject(e);});
    child.on("close",code=>{clearTimeout(timer);if(code===0)resolve(stdout.trim());else reject(Object.assign(new Error("Synthetic SQL refusal"),{stderr,code}));});
    child.stdin.end(`\\set VERBOSITY verbose\n${sql}\n`);
  });
}
const args={p_request_id:"uuid",p_attempt_id:"uuid",p_source_id:"text",p_adapter_revision:"text",p_expected_scope:"jsonb",p_policy_revision:"text",p_actor_auth_user_id:"uuid"};
const types:Record<string,Record<string,string>>={
  research_assisted_order_provider_execution_authority:{},research_assisted_order_provider_create_context:args,
  research_assisted_order_provider_create_claim:{...args,p_claim_key:"uuid"},
  research_assisted_order_provider_create_result_append:{p_claim_id:"uuid",p_source_id:"text",p_adapter_revision:"text",p_expected_scope:"jsonb",p_policy_revision:"text",p_result:"jsonb"},
};
function sqlFor(name:string,input:Record<string,unknown>={}){
  assert.ok(types[name]);assert.deepEqual(Object.keys(input).sort(),Object.keys(types[name]).sort());
  return `set role service_role;select public.${name}(${Object.entries(types[name]).map(([k,t])=>`${k}=>${q(input[k]===null?null:t==="jsonb"?JSON.stringify(input[k]):input[k])}::${t}`).join(",")})::text;`;
}
let loseResultResponse=false,rollbackResult=false,delayClaimOnce=false;
let delayedClaim:Record<string,unknown>|null=null;
let delayedWallTime:number|null=null;
const rpc:SupabaseRpcClient={rpc:async(name,input={})=>{
  calls.push(name);
  try {
    if(name==="research_assisted_order_provider_create_result_append"&&rollbackResult){rollbackResult=false;await psql(`begin;${sqlFor(name,input)}select 1/0;commit;`);}
    const out=await psql(sqlFor(name,input));
    if(name==="research_assisted_order_provider_create_claim"&&delayClaimOnce){
      delayClaimOnce=false;delayedClaim=JSON.parse(out);
      assert.equal(delayedClaim!.authorized,true);assert.equal(typeof delayedClaim!.claimIssuedAt,"string");
      assert.equal(typeof delayedClaim!.dispatchBudgetMs,"number");assert.ok(Number(delayedClaim!.dispatchBudgetMs)>0);
      delayedWallTime=Date.parse(String(delayedClaim!.claimIssuedAt))+Math.floor(Number(delayedClaim!.dispatchBudgetMs)/2);
      // Delay the response, not the transaction: SQL's durable lease is already
      // running while the application has not yet received dispatch authority.
      await new Promise(resolve=>setTimeout(resolve,Number(delayedClaim!.dispatchBudgetMs)+100));
    }
    if(name==="research_assisted_order_provider_create_result_append"&&loseResultResponse){loseResultResponse=false;throw new Error("SYNTHETIC_COMMITTED_RESPONSE_LOST");}
    return{data:out?JSON.parse(out):null,error:null};
  }catch(e){const stderr=(e as {stderr?:string}).stderr;
    if(stderr===undefined)throw e;
    return{data:null,error:{code:/ERROR:\s+([A-Z0-9]{5}):/.exec(stderr)?.[1]??"LOCAL_SQL_ERROR",details:/DETAIL:\s+([^\r\n]+)/.exec(stderr)?.[1],message:"Synthetic SQL refusal"}};
  }
}};
function providerObject(body:AssistedProviderCreateBody){return{...scope,...body,observedAmountCents:body.amountCents,
  providerPaymentId:`synthetic-http-payment-${body.requestId}`,providerSessionId:`synthetic-http-session-${body.requestId}`,state:"pending",
  clientSecret:"synthetic-never-persist",rawTransport:"synthetic-never-persist"};}
let behavior:"correct"|"lost"|"amount"|"currency"|"reference"|"late"="correct";
let lateResolve:((value:unknown)=>void)|null=null;
const source:AssistedProviderExecutionSource={sourceId,adapterRevision,scope,
  policy:{revision:policyRevision,replayGuarantee:"same_key_same_body",createReplaySeconds:60},
  create:async({body,idempotencyKey})=>{
    creates++;bodies.push(body);keys.push(idempotencyKey);assert.equal(Object.isFrozen(body),true);
    if(behavior==="lost")throw new Error("synthetic external response unavailable");
    const object=providerObject(body);
    if(behavior==="amount")object.observedAmountCents--;
    if(behavior==="currency")object.currency="EUR";
    if(behavior==="reference")object.requestId=id(1,1199);
    if(behavior==="late")return await new Promise(resolve=>{lateResolve=(value)=>resolve({ok:true,value});});
    return{ok:true,value:object};
  },
  retrieve:async({body,providerPaymentId,providerSessionId})=>{retrieves++;assert.equal(providerPaymentId,providerObject(body).providerPaymentId);
    assert.equal(providerSessionId,providerObject(body).providerSessionId);return{ok:true,value:providerObject(body)};},
};
function mount(configured:AssistedProviderExecutionSource|null=source,actor=id(4,1),timeoutMs=5000,now=Date.now){
  const svc=new AssistedProviderExecutionService(rpc,configured,{timeoutMs,now});
  const viewers=createAssistedOrderViewerResolvers({resolveMember:async()=>null,earlyAccess:()=>null,earlyAccessBindings:()=>null,adminEmail:()=>"synthetic-provider-journal@example.test"});
  const route=createAssistedOrderRouteTable<ExpressAssistedOrderRequest>({} as AssistedOrderService,viewers,null,null,null,null,null,svc)
    .find(r=>r.method==="POST"&&r.path===path);assert.ok(route);assert.equal(route.auth,"admin");
  const app=express();app.use(express.json());app.use((req,_res,next)=>{if(req.headers.authorization==="Bearer synthetic-adp02")Object.assign(req,{adminAuthUserId:actor});next();});
  app.post(path,assistedOrderExpressHandler(route));
  const post=async(n:number,body:unknown={},auth=true)=>{
    const attempt=await psql(`select id from public.research_assisted_order_provider_attempts where request_id=${q(id(1,n))};`);
    const req=request(app).post(path.replace(":requestId",id(1,n)).replace(":attemptId",attempt||id(8,n)));
    if(auth)req.set("authorization","Bearer synthetic-adp02");return req.send(body);
  };return{post};
}
async function financial(n:number){return JSON.parse(await psql(`select json_build_object('status',(select status from public.research_assisted_order_requests where id='${id(1,n)}'),
  'financial',public.research_assisted_order_financial_state('${id(1,n)}'),'events',(select count(*) from public.research_assisted_order_events where request_id='${id(1,n)}'))::text;`));}
async function pauseLease(n:number){await psql(`select pg_sleep(greatest(0,extract(epoch from ((select max(lease_expires_at) from public.research_assisted_order_provider_create_claims where request_id='${id(1,n)}')-clock_timestamp())))+0.02);`);}
const pass=(label:string)=>{groups++;process.stdout.write(`EXECUTION_HTTP_SQL PASS ${label}\n`);};
const h=mount();
if(phase==="legacy"){
  const v2=JSON.parse(await psql("set role service_role;select public.research_assisted_order_provider_journal_authority()::text;"));
  assert.equal(v2.schemaVersion,"assisted_order_provider_journal_v2");
  const before=await financial(1100),response=await h.post(1100);
  assert.equal(response.status,409);assert.equal(response.body.error,"provider_execution_unavailable");
  assert.deepEqual(calls,["research_assisted_order_provider_execution_authority"]);assert.equal(creates,0);assert.deepEqual(await financial(1100),before);
  pass("actual self-valid ADP01 v2 is insufficient execution authority, before dispatch");
}else if(phase==="restart"){
  await pauseLease(1105);const response=await h.post(1105);
  assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.outcome,"recorded");
  assert.equal(creates,0);assert.equal(retrieves,1);assert.deepEqual((await financial(1105)).financial,{hasObservation:false,paymentVerified:false});
  pass("new Node process recovers committed result through bound retrieval, never create");
}else{
  const before=await financial(1100),response=await h.post(1100);
  assert.equal(response.status,200,JSON.stringify(response.body));assert.equal(response.body.outcome,"recorded");assert.equal(response.body.state,"held");
  assert.equal(response.headers["cache-control"],"no-store");
  assert.deepEqual(Object.keys(response.body).sort(),["schemaVersion","requestId","attemptId","state","outcome","replayed"].sort());
  assert.doesNotMatch(JSON.stringify(response.body),/clientSecret|providerPaymentId|synthetic-execution-account|claimId|creationKey/);
  assert.equal(creates,1);assert.deepEqual(await financial(1100),before);
  assert.equal(await psql("select count(*) from public.research_assisted_order_provider_create_results where result::text like '%synthetic-never-persist%';"),"0");
  pass("real mounted empty command records exact object while money/status/audit remain held and private fields omitted");
  await pauseLease(1100);const again=await mount().post(1100);assert.equal(again.status,200);assert.equal(retrieves,1);assert.equal(creates,1);
  pass("new service instance retrieves write-once binding rather than another create");

  const countBefore=creates;
  for(const [body,auth,expected] of [[{},false,403],[{amountCents:1},true,400],[{sourceId},true,400]] as const){assert.equal((await h.post(1101,body,auth)).status,expected);}
  assert.equal((await mount(null).post(1101)).status,409);
  assert.equal((await mount(source,id(4,2)).post(1101)).status,403);
  for(const alternate of [{...source,scope:{...scope,accountId:"wrong-account"}},{...source,adapterRevision:"wrong-revision"},
    {...source,policy:{...source.policy,revision:"wrong-policy"}}])assert.equal((await mount(alternate).post(1101)).status,409);
  assert.equal(creates,countBefore);pass("auth, browser financial facts, exact source/grant/policy and null source deny before transport");

  for(const [n,mode] of [[1101,"amount"],[1102,"currency"],[1103,"reference"]] as const){
    behavior=mode;const response=await h.post(n);assert.equal(response.status,200);assert.equal(response.body.outcome,"reconciliation_required");
    assert.equal(await psql(`select count(*) from public.research_assisted_order_provider_identity_bindings where attempt_id=(select id from public.research_assisted_order_provider_attempts where request_id='${id(1,n)}');`),"0");
    assert.deepEqual((await financial(n)).financial,{hasObservation:false,paymentVerified:false});
  }
  pass("independent amount/currency/request mismatches persist conflict, never normalize to accepted quote");
  behavior="lost";const lost=await h.post(1104);assert.equal(lost.status,200);assert.equal(lost.body.outcome,"reconciliation_required");
  const firstBody=bodies.at(-1),firstKey=keys.at(-1);await pauseLease(1104);behavior="correct";
  const recovered=await mount().post(1104);assert.equal(recovered.status,200);assert.equal(recovered.body.outcome,"recorded");
  assert.deepEqual(bodies.at(-1),firstBody);assert.equal(keys.at(-1),firstKey);
  pass("lost call/result recovery uses same durable body/key and fixed replay window");
  loseResultResponse=true;const committedLost=await h.post(1105);assert.equal(committedLost.status,409);assert.equal(committedLost.body.error,"provider_execution_unavailable");
  assert.equal(await psql(`select count(*) from public.research_assisted_order_provider_identity_bindings where attempt_id=(select id from public.research_assisted_order_provider_attempts where request_id='${id(1,1105)}');`),"2");
  pass("committed SQL receipt response loss is not acknowledged; durable binding retained for separate process restart");
  rollbackResult=true;const interrupted=await h.post(1106);assert.equal(interrupted.status,409);
  assert.equal(await psql(`select count(*) from public.research_assisted_order_provider_create_results r join public.research_assisted_order_provider_create_claims c on c.id=r.claim_id where c.request_id='${id(1,1106)}';`),"0");
  await pauseLease(1106);const retry=await mount().post(1106);assert.equal(retry.status,200);assert.equal(retry.body.outcome,"recorded");
  pass("interrupted result transaction rolls back atomically then retries same financial terms");
  behavior="late";const timed=await mount(source,id(4,1),40).post(1107);assert.equal(timed.status,200);assert.equal(timed.body.outcome,"reconciliation_required");
  assert.ok(lateResolve);lateResolve(providerObject(bodies.at(-1)!));
  let bound=false;for(let i=0;i<40;i++){if(await psql(`select count(*) from public.research_assisted_order_provider_identity_bindings where attempt_id=(select id from public.research_assisted_order_provider_attempts where request_id='${id(1,1107)}');`)==="2"){bound=true;break;}await new Promise(r=>setTimeout(r,25));}
  assert.equal(bound,true);pass("timeout persists unknown before return; late exact response remains durable and held");
  behavior="correct";delayClaimOnce=true;const createsBeforeDelay=creates,retrievesBeforeDelay=retrieves;
  const delayed=await mount(source,id(4,1),5000,()=>{assert.notEqual(delayedWallTime,null);return delayedWallTime!;}).post(1108);
  assert.equal(delayed.status,200,JSON.stringify(delayed.body));assert.equal(delayed.body.outcome,"reconciliation_required");
  assert.equal(creates,createsBeforeDelay);assert.equal(retrieves,retrievesBeforeDelay);
  assert.ok(delayedClaim);assert.notEqual(delayedWallTime,null);
  assert.ok(delayedWallTime!>=Date.parse(String(delayedClaim!.creationStartedAt)));
  assert.ok(delayedWallTime!>=Date.parse(String(delayedClaim!.claimIssuedAt)));
  assert.ok(delayedWallTime!<Date.parse(String(delayedClaim!.leaseExpiresAt)));
  assert.ok(delayedWallTime!<Date.parse(String(delayedClaim!.creationReplayUntil)));
  assert.equal(await psql(`select clock_timestamp()>lease_expires_at from public.research_assisted_order_provider_create_claims where id=${q(delayedClaim!.claimId)};`),"t");
  process.stdout.write(`EXECUTION_CLOCK ${JSON.stringify({claimIssuedAt:delayedClaim!.claimIssuedAt,dispatchBudgetMs:delayedClaim!.dispatchBudgetMs,
    leaseExpiresAt:delayedClaim!.leaseExpiresAt,applicationWallTime:new Date(delayedWallTime!).toISOString(),
    applicationWithinIssuedWindow:true,databaseLeaseExpired:true,transportCalls:0})}\n`);
  const delayedResult=JSON.parse(await psql(`select result::text from public.research_assisted_order_provider_create_results where claim_id=${q(delayedClaim!.claimId)};`));
  assert.equal(delayedResult.outcome,"unknown");assert.equal(delayedResult.reason,"transport_uncertain");
  assert.deepEqual((await financial(1108)).financial,{hasObservation:false,paymentVerified:false});
  pass("actual delayed claim RPC exceeds SQL dispatch budget despite behind wall clock: no transport, durable unknown, held finance");
}
process.stdout.write(`EXECUTION_HTTP_SQL COMPLETE ${JSON.stringify({phase,groups,sqlCalls,creates,retrieves,node:process.version,syntheticAuth:true,providerConfigured:false,managedStateMutated:false})}\n`);
