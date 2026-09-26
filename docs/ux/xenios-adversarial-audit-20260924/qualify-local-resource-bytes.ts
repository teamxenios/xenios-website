// Extends the isolated local service fixture. Real private bytes and real guards.
import assert from "node:assert/strict";
import {readFileSync,writeFileSync} from "node:fs";
import {execFileSync} from "node:child_process";
import crypto from "node:crypto";
import net from "node:net";
import express from "express";
import ws from "ws";
import {createClient} from "@supabase/supabase-js";
const origin="http://127.0.0.1:56321", appOrigin="http://127.0.0.1:5312";
const keys=JSON.parse(readFileSync(process.argv[2],"utf8"));assert.equal(keys.API_URL,origin);
const keep=new Set(["PATH","SYSTEMROOT","WINDIR","COMSPEC","TEMP","TMP","USERPROFILE","LOCALAPPDATA","APPDATA","PATHEXT"]);
for(const k of Object.keys(process.env))if(!keep.has(k.toUpperCase()))delete process.env[k];
const run=crypto.randomBytes(5).toString("hex");
Object.assign(process.env,{NODE_ENV:"test",SUPABASE_URL:origin,SUPABASE_ANON_KEY:keys.ANON_KEY,SUPABASE_SERVICE_ROLE_KEY:keys.SERVICE_ROLE_KEY,ADMIN_EMAIL:`resource-admin-${run}@audit.invalid`});
const originalFetch=globalThis.fetch;
globalThis.fetch=((input:any,init:any)=>{const u=new URL(typeof input==="string"?input:input instanceof URL?input.href:input.url);if(![origin,appOrigin].includes(u.origin))throw Error("Off-fixture request denied");return originalFetch(input,{...init,redirect:"error"});}) as typeof fetch;
const connect=net.Socket.prototype.connect;
net.Socket.prototype.connect=function(...args:any[]){const n=Array.isArray(args[0])?args[0]:args,o=n[0],host=typeof o==="object"?o.host??"localhost":n[1]??"localhost",port=Number(typeof o==="object"?o.port:o);if(!["127.0.0.1","localhost","::1"].includes(host)||![56321,5312].includes(port))throw Error("Off-fixture socket denied");return connect.apply(this,args as any);} as typeof connect;
const options={auth:{persistSession:false,autoRefreshToken:false},realtime:{transport:ws as unknown as typeof WebSocket}};
const admin=createClient(origin,keys.SERVICE_ROLE_KEY,options);
const sql=(s:string)=>execFileSync("docker",["exec","-i","supabase_db_xenios-audit-local-services-20260926","psql","-U","postgres","-v","ON_ERROR_STOP=1","-q"],{input:s,encoding:"utf8",stdio:["pipe","pipe","pipe"]});
const sources=["supabase/research-partners.sql","supabase/candidates/20260906120000_research_resource_library.precheck.sql","supabase/candidates/20260906120000_research_resource_library.sql","supabase/candidates/20260906120000_research_resource_library.postcheck.sql"];
for(const p of sources)sql(readFileSync(p,"utf8"));sql("notify pgrst, 'reload schema';");
const actors:Record<string,{id:string;token:string;memberId?:string}>={};
for(const name of ["admin","inside","outside"]){const email=`resource-${name}-${run}@audit.invalid`,password=crypto.randomBytes(24).toString("hex");const c=await admin.auth.admin.createUser({email,password,email_confirm:true});assert.ifError(c.error);const client=createClient(origin,keys.ANON_KEY,options);const s=await client.auth.signInWithPassword({email,password});assert.ifError(s.error);actors[name]={id:c.data.user!.id,token:s.data.session!.access_token};}
for(const name of ["inside","outside"]){
 const a=await admin.rpc("research_admin_approve_customer_access",{p_actor_auth_user_id:actors.admin.id,p_email:`resource-${name}-${run}@audit.invalid`,p_first_name:"Synthetic",p_last_name:name,p_reason:"Isolated resource audience fixture",p_expected_application_id:null,p_expected_updated_at:null,p_idempotency_key:`resource_${name}_${run}`});assert.ifError(a.error);assert.equal(a.data.ok,true);
 const c=await admin.rpc("research_claim_approved_customer_access",{p_application_id:a.data.applicationId,p_auth_user_id:actors[name].id});assert.ifError(c.error);assert.equal(c.data.ok,true);actors[name].memberId=c.data.memberId;
 const seeded=await admin.from("research_partners").insert({member_id:c.data.memberId,role:name==="inside"?"research_rep":"affiliate",state:"active",legal_name:"Synthetic Resource Fixture",contact_email:`resource-${name}-${run}@audit.invalid`,identity_verified:true,tax_status:"verified",payout_status:"verified",certified_at:new Date().toISOString(),certified_by_admin_id:actors.admin.id,activated_at:new Date().toISOString(),activated_by_admin_id:actors.admin.id});assert.ifError(seeded.error);
}
const [{requireSupabaseAdmin},{requireMember},{createResourceHubService},{createSupabaseResourceHubStore},{createSupabaseResourceBytesStore},{registerResourceHubAdminApi},{registerPartnerPortalApi},{createSupabasePartnerPortalPort},contract]=await Promise.all([
 import("../../../server/routes"),import("../../../server/research/member-auth"),import("../../../server/research/resource-hub/service"),import("../../../server/research/resource-hub/supabase-store"),import("../../../server/research/resource-hub/bytes-store"),import("../../../server/research/resource-hub/admin-routes"),import("../../../server/research/partners/portal-routes"),import("../../../server/research/partners/portal-production"),import("../../../shared/research/resource-hub/contract")]);
const service=createResourceHubService({store:createSupabaseResourceHubStore(()=>admin as never),bytes:createSupabaseResourceBytesStore({bucket:"research-resource-library",storage:()=>admin.storage as never}),now:()=>new Date(),newId:()=>crypto.randomUUID()});
const app=express();app.use(express.json());registerResourceHubAdminApi(app,requireSupabaseAdmin,{service});registerPartnerPortalApi(app,{port:createSupabasePartnerPortalPort(admin),submissionsEnabled:false,resourceHub:service},{requireMember});
const server=await new Promise<ReturnType<typeof app.listen>>(resolve=>{const s=app.listen(5312,"127.0.0.1",()=>resolve(s));});
const cases:Array<{name:string;status:string;detail?:unknown}>=[];const record=(name:string,detail?:unknown)=>cases.push({name,status:"PASS",detail});
const req=(path:string,actor:string,init:RequestInit={})=>fetch(appOrigin+path,{...init,headers:{...(init.headers??{}),authorization:"Bearer "+actors[actor].token}});
try{
 const bytes=Buffer.from("%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n");
 const metadata={title:"Synthetic isolated fixture",purpose:"Verify private bytes with real local services",usagePolicy:"private" as const,audience:["research_rep" as const],originalFilename:"fixture.pdf",idempotencyKey:`resource_bytes_${run}`};
 const upload={method:"POST",headers:{"content-type":"application/pdf",[contract.RESOURCE_UPLOAD_METADATA_HEADER]:contract.encodeResourceUploadMetadata(metadata)},body:bytes};
 const denied=await req("/api/admin/research/resource-hub/resources","inside",upload);assert.equal(denied.status,403);record("Normal member cannot upload through canonical admin guard");
 const uploaded=await req("/api/admin/research/resource-hub/resources","admin",upload);const u=await uploaded.json();assert.equal(uploaded.status,200,JSON.stringify(u));assert.equal(u.ok,true);const rid=u.resource.resourceId,vid=u.resource.versions[0].versionId;assert.ok(rid&&vid);record("Admin upload validates bytes and persists private object");
 const review=async(action:string)=>{const r=await req(`/api/admin/research/resource-hub/resources/${rid}/versions/${vid}/review`,"admin",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action,reason:"Synthetic isolated approval",idempotencyKey:`review_${action}_${run}`})});const b=await r.json();assert.equal(r.status,200,JSON.stringify(b));assert.equal(b.ok,true);};
 await review("request_review");await review("approve_content");await review("publish");record("Canonical admin review and atomic publish through real REST/SQL");
 const path=`/api/research/partner/resources/${rid}/download`;
 const delivered=await req(path,"inside");assert.equal(delivered.status,200);assert.deepEqual(Buffer.from(await delivered.arrayBuffer()),bytes);assert.match(delivered.headers.get("cache-control")??"",/no-store/);record("In-audience partner receives exact private bytes through real Auth and owner resolution");
 const foreign=await req(path,"outside");assert.equal(foreign.status,404);record("Different real owner outside audience receives non-enumerating denial");
 const version=await admin.from("research_resource_versions").select("storage_key").eq("id",vid).single();assert.ifError(version.error);
 const direct=await fetch(origin+"/storage/v1/object/authenticated/research-resource-library/"+version.data!.storage_key,{headers:{apikey:keys.ANON_KEY,authorization:"Bearer "+actors.inside.token}});assert.notEqual(direct.status,200);record("Authorized app audience still cannot bypass server via direct Storage");
 const publicRead=await fetch(origin+"/storage/v1/object/public/research-resource-library/"+version.data!.storage_key,{headers:{apikey:keys.ANON_KEY}});assert.notEqual(publicRead.status,200);record("Private object has no public download");
 const suspended=await admin.from("research_partners").update({state:"suspended"}).eq("member_id",actors.inside.memberId!);assert.ifError(suspended.error);
 const stopped=await req(path,"inside");assert.equal(stopped.status,404);record("Use-time suspension denies previously authorized owner");
 const events=await admin.from("research_resource_deliveries").select("outcome").eq("resource_id",rid);assert.ifError(events.error);assert.equal(events.data!.length,3);record("Three app delivery attempts durably recorded",events.data);
}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
writeFileSync(new URL("./evidence/closeout-local-resource-bytes.json",import.meta.url),JSON.stringify({status:"PASS",observedAt:new Date().toISOString(),applicationSha:"c4ea8a9111fcdf7b66cff7db42347e7d38a3fefa",cases,productionMutated:false,externalDelivery:false,provenance:"Real local GoTrue/PostgREST/Postgres/Storage; canonical admin and member guards, partner owner resolver and resource service",sourceHashes:Object.fromEntries(sources.map(p=>[p,crypto.createHash("sha256").update(readFileSync(p,"utf8").replaceAll("\r\n","\n")).digest("hex")])),limits:["Synthetic partner records seeded with valid database constraints; lifecycle transitions tested separately","Local service versions are not hosted-production parity","HTTP/service evidence, not browser byte-download evidence"]},null,2)+"\n");
console.log(JSON.stringify({status:"PASS",cases:cases.length,productionMutated:false}));
