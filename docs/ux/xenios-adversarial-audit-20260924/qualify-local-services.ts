// Real local GoTrue/PostgREST/Postgres qualification. Never accepts a remote URL.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import express from "express";
import { createClient } from "@supabase/supabase-js";
import ws from "ws";

const origin = "http://127.0.0.1:56321";
const appOrigin = "http://127.0.0.1:5311";
const container = "supabase_db_xenios-audit-local-services-20260926";
const keys = JSON.parse(readFileSync(process.argv[2], "utf8"));
assert.equal(keys.API_URL, origin);
assert.ok(keys.ANON_KEY && keys.SERVICE_ROLE_KEY);
const keep = new Set(["PATH","SYSTEMROOT","WINDIR","COMSPEC","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA","PATHEXT"]);
for (const key of Object.keys(process.env)) if (!keep.has(key.toUpperCase())) delete process.env[key];
Object.assign(process.env, { NODE_ENV:"test", SUPABASE_URL:origin, SUPABASE_ANON_KEY:keys.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY:keys.SERVICE_ROLE_KEY, ADMIN_EMAIL:"admin@audit.invalid",
  RESEARCH_SESSION_SECRET:crypto.randomBytes(32).toString("hex") });
const originalFetch = globalThis.fetch;
let blockedNetwork = 0;
globalThis.fetch = ((input:any, init:any) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (![origin,appOrigin].includes(url.origin)) { blockedNetwork++; throw Error("Off-fixture network denied"); }
  return originalFetch(input,{...init,redirect:"error"});
}) as typeof fetch;
const originalConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function(...args:any[]) {
  const n=Array.isArray(args[0])?args[0]:args;const o=n[0];
  const host=typeof o==="object"?o.host??"localhost":n[1]??"localhost";
  const port=Number(typeof o==="object"?o.port:o);
  if (!["localhost","127.0.0.1","::1"].includes(host)||![56321,5311].includes(port)) throw Error("Off-fixture socket denied");
  return originalConnect.apply(this,args as any);
} as typeof originalConnect;
const sql = (source:string) => execFileSync("docker",["exec","-i",container,"psql","-U","postgres","-v","ON_ERROR_STOP=1","-q"],{input:source,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const clientOptions={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:ws as unknown as typeof WebSocket}};
const admin=createClient(origin,keys.SERVICE_ROLE_KEY,clientOptions);
const users:Record<string,{id:string;token:string}>={};
const cases:Array<{name:string;status:"PASS";detail?:unknown}>=[];
const record=(name:string,detail?:unknown)=>cases.push({name,status:"PASS",detail});
for(const name of ["admin","owner","other"]){
 const password=crypto.randomBytes(24).toString("hex");const email=name+"@audit.invalid";
 const created=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(created.error);
 const anon=createClient(origin,keys.ANON_KEY,clientOptions);
 const signed=await anon.auth.signInWithPassword({email,password});assert.ifError(signed.error);
 users[name]={id:created.data.user!.id,token:signed.data.session!.access_token};
}
record("Three distinct synthetic users authenticated by real local GoTrue");
const sources=["supabase/research-membership.sql","supabase/research-members.sql","supabase/research-notification-outbox.sql","supabase/candidates/20260905_research_approved_customer_access.sql"];
for(const path of sources)sql(readFileSync(path,"utf8"));
sql("notify pgrst, 'reload schema';");
const [{registerMembershipApi,makeResearchToken},{registerMemberApi},{registerApprovedCustomerAccessApi},{createApprovedCustomerAccessDependencies},{requireSupabaseAdmin}]=await Promise.all([
 import("../../../server/research/membership"),import("../../../server/research/members"),import("../../../server/research/approved-customer-access"),import("../../../server/research/approved-customer-access-production"),import("../../../server/routes")]);
const app=express();app.use(express.json());
registerMembershipApi(app);registerMemberApi(app);registerApprovedCustomerAccessApi(app,createApprovedCustomerAccessDependencies(),requireSupabaseAdmin);
const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(5311,"127.0.0.1",()=>resolve(s));});
const post=async(path:string,body:unknown,token?:string)=>{const r=await fetch(appOrigin+path,{method:"POST",headers:{"content-type":"application/json",...(token?{authorization:"Bearer "+token}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
try{
 const input={email:"owner@audit.invalid",firstName:"Synthetic",lastName:"Owner",reason:"Isolated local service qualification",expectedApplicationId:null,expectedUpdatedAt:null,idempotencyKey:"audit_local_approval_20260926"};
 const denied=await post("/api/admin/research/access/approve-customer",input,users.owner.token);assert.equal(denied.status,403);record("Real member denied canonical admin approval",403);
 const approved=await post("/api/admin/research/access/approve-customer",input,users.admin.token);assert.equal(approved.status,200,JSON.stringify(approved));assert.equal(approved.body.delivery,"queued");record("Canonical admin approval through real PostgREST SQL",200);
 const repeated=await post("/api/admin/research/access/approve-customer",input,users.admin.token);assert.equal(repeated.body.replayed,true);record("Approval replay remains one durable operation");
 const id=approved.body.applicationId, claim=makeResearchToken("account_claim",id);
 const check=async(name:string,token:string,auth:string|undefined,status:number)=>{const r=await post("/api/research/member/claim",{token},auth);assert.equal(r.status,status,JSON.stringify(r));record(name,status);return r;};
 await check("Status-purpose token denied",makeResearchToken("status",id),undefined,401);
 const payload=`v2.account_claim.${id}.${Date.now()-60000}`;const secret=crypto.createHash("sha256").update(process.env.RESEARCH_SESSION_SECRET!).digest();
 await check("Expired signed claim denied",payload+"."+crypto.createHmac("sha256",secret).update(payload).digest("base64url"),undefined,401);
 await check("Separate real Auth owner denied foreign claim",claim,users.other.token,409);
 const recovery=await admin.auth.admin.generateLink({type:"recovery",email:"owner@audit.invalid"});assert.ifError(recovery.error);
 const recoveryClient=createClient(origin,keys.ANON_KEY,clientOptions);
 const recovered=await recoveryClient.auth.verifyOtp({type:"recovery",token_hash:recovery.data.properties!.hashed_token});assert.ifError(recovered.error);
 await check("Real GoTrue recovery-purpose session denied claim",claim,recovered.data.session!.access_token,409);
 const first=await check("Verified owner claims approved membership through real SQL",claim,users.owner.token,200);assert.equal(first.body.replayed,false);
 const replay=await check("Consumed claim replays without duplicate grant",claim,users.owner.token,200);assert.equal(replay.body.replayed,true);
 const members=await admin.from("research_members").select("auth_user_id,status,access_basis,billing_state");assert.ifError(members.error);assert.equal(members.data!.length,1);assert.equal(members.data![0].auth_user_id,users.owner.id);assert.equal(members.data![0].billing_state,"not_started");
 record("One matching member, no paid membership inference");
 const outbox=await admin.from("research_notification_outbox").select("event_type,status");assert.ifError(outbox.error);assert.ok(outbox.data!.every(r=>r.status!=="sent"));record("Outbox states do not claim external delivery",outbox.data);
 const untrusted=createClient(origin,keys.ANON_KEY,{...clientOptions,global:{headers:{Authorization:"Bearer "+users.other.token}}});
 const rows=await untrusted.from("research_members").select("id");assert.ok(rows.error || rows.data?.length===0);record("Foreign authenticated REST principal cannot read member rows");
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
const receipt={applicationSha:"c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa",observedAt:new Date().toISOString(),status:"PASS",cases,blockedNetwork,productionMutated:false,externalDelivery:false,provenance:"Actual local Docker GoTrue/PostgREST/Postgres; canonical guards, routes and SQL; synthetic users only",sourceHashes:Object.fromEntries(sources.map(p=>[p,crypto.createHash("sha256").update(readFileSync(p,"utf8").replaceAll("\r\n","\n")).digest("hex")])),limits:["Local service versions differ from hosted production", "No external delivery", "Not a browser end-to-end assertion"]};
writeFileSync(new URL("./evidence/closeout-local-services.json",import.meta.url),JSON.stringify(receipt,null,2)+"\n");
console.log(JSON.stringify({status:"PASS",cases:cases.length,productionMutated:false,externalDelivery:false}));
