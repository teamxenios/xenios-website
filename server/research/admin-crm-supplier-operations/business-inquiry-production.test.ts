import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { mountBusinessInquiryProduction } from "./business-inquiry-production";

const origin="https://xenios-research-staging.onrender.com", base="/api/research/business-inquiries";
const actor="10000000-0000-4000-8000-000000000001";
const enquiry={contactName:"Synthetic Buyer",contactEmail:"buyer@example.test",organizationName:"Synthetic Organization",
  organizationType:"clinic",location:"Austin",categories:["research"],selections:[],packagingPreference:"not_sure",siteCount:1,replenishment:"not_sure",services:[]};
function setup(change:Record<string,string|undefined>={}) {
  const env={RESEARCH_BUSINESS_INQUIRY_ENABLED:"true",SITE_URL:origin,RESEARCH_SESSION_SECRET:"s".repeat(64),
    RESEARCH_BUSINESS_INQUIRY_CONTEXT_SECONDS:"600",RENDER_SERVICE_ID:"srv-d9h4f4m7r5hc73ctjng0",
    RENDER_EXTERNAL_URL:origin,SUPABASE_URL:"https://srcphrgnxreqyirkitxd.supabase.co",...change};
  let clock=Date.parse("2026-11-18T12:00:00.000Z"),seq=0,ready=true,rate=true,sqlDenied=false;
  const saves=new Map<string,unknown>();
  const rpc=vi.fn(async(name:string,args:Record<string,unknown>)=>{
    if(name==="research_rate_limit_hit")return{data:rate,error:null};
    if(name==="research_business_inquiry_readiness")return{data:ready,error:null};
    if(sqlDenied)return{data:null,error:{message:"business_inquiry_not_permitted"}};
    if(name==="research_business_inquiry_submit"){
      const key=String(args.p_owner_hash)+":"+String(args.p_attempt_hash),prior=saves.get(key);
      const value={reference:"BE-"+"A".repeat(24),receivedAt:new Date(clock).toISOString(),state:"needs_human_review",replayed:!!prior};
      if(!prior)saves.set(key,value);return{data:prior?{...(prior as object),replayed:true}:value,error:null};
    }
    if(name==="research_business_inquiry_list"||name==="research_business_inquiry_org_list")return{data:{items:[],nextBefore:null},error:null};
    throw Error("Unexpected fixture RPC");
  });
  const resolvePrincipal=vi.fn(async(req:express.Request)=>req.get("Authorization")==="Bearer ordinary"?{subjectId:actor,roles:[]}:null);
  const app=express();app.use(express.json());
  mountBusinessInquiryProduction(app,{env,rpc:{rpc},care:{resolvePrincipal},now:()=>clock,nonce:()=> (++seq).toString(16).padStart(64,"0")});
  return{app,rpc,saves,resolvePrincipal,setClock:(n:number)=>{clock+=n},setReady:(v:boolean)=>{ready=v},setRate:(v:boolean)=>{rate=v},denySql:()=>{sqlDenied=true}};
}
async function admit(s:ReturnType<typeof setup>) {
  const result=await request(s.app).get(base+"/config").set("Sec-Fetch-Site","same-origin");
  expect(result.status).toBe(200);
  return{cookie:String(result.headers["set-cookie"][0]).split(";")[0],key:result.body.attemptPrefix+"12345678-1234-4234-8234-123456789012",result};
}
const submit=(s:ReturnType<typeof setup>,cookie:string,key:string)=>request(s.app).post(base).set("Cookie",cookie).set("Origin",origin).send({attemptKey:key,enquiry});
describe("business Root application composition",()=>{
  it.each([{RESEARCH_BUSINESS_INQUIRY_ENABLED:undefined},{RESEARCH_BUSINESS_INQUIRY_ENABLED:"false"},{RESEARCH_SESSION_SECRET:"short"},
    {RESEARCH_BUSINESS_INQUIRY_CONTEXT_SECONDS:undefined},{RENDER_SERVICE_ID:"wrong"},{RENDER_PR_NUMBER:"4"},{SUPABASE_URL:"https://wrong.supabase.co"}])("refuses missing or wrong readiness without database/contact IO %j",async change=>{
    const s=setup(change);const r=await request(s.app).get(base+"/config");expect(r.status).toBe(503);expect(r.body).toEqual({enabled:false});expect(r.headers["set-cookie"]).toBeUndefined();expect(s.rpc).not.toHaveBeenCalled();
    expect((await request(s.app).post(base).send({})).status).toBe(503);
  });
  it("bootstraps one opaque context, keeps it across refresh and exposes no identity or policy details",async()=>{
    const s=setup(),a=await admit(s);expect(a.result.headers["cache-control"]).toBe("private, no-store");
    expect(a.result.headers["set-cookie"][0]).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(Object.keys(a.result.body).sort()).toEqual(["attemptPrefix","enabled"]);
    const b=await request(s.app).get(base+"/config").set("Cookie",a.cookie);expect(b.body).toEqual(a.result.body);expect(b.headers["set-cookie"]).toBeUndefined();
  });
  it("saves once across an identical uncertain-response retry and derives owner solely from its signed context",async()=>{
    const s=setup(),a=await admit(s),first=await submit(s,a.cookie,a.key),again=await submit(s,a.cookie,a.key);
    expect(first.status).toBe(201);expect(again.status).toBe(200);expect(again.body.reference).toBe(first.body.reference);expect(again.body.replayed).toBe(true);expect(s.saves.size).toBe(1);
    const calls=s.rpc.mock.calls.filter(c=>c[0]==="research_business_inquiry_submit");expect(calls).toHaveLength(2);
    expect(calls[0][1].p_actor_id).toBeNull();expect(calls[0][1].p_organization_id).toBeNull();expect(calls[0][1].p_owner_hash).toMatch(/^[a-f0-9]{64}$/);expect(calls[0][1].p_owner_hash).toBe(calls[1][1].p_owner_hash);
  });
  it("refuses an expired or replaced context instead of recreating a frozen attempt under a new owner",async()=>{
    const s=setup(),a=await admit(s);expect((await submit(s,a.cookie,a.key)).status).toBe(201);s.setClock(600001);
    expect((await submit(s,a.cookie,a.key)).status).toBe(403);const b=await admit(s);expect(b.key).not.toBe(a.key);expect((await submit(s,b.cookie,a.key)).status).toBe(403);expect(s.saves.size).toBe(1);
  });
  it("refuses missing, changed and duplicated cookies with no submission",async()=>{
    const s=setup(),a=await admit(s);for(const cookie of["",a.cookie.slice(0,-1)+(a.cookie.endsWith("a")?"b":"a"),a.cookie+"; "+a.cookie])expect((await submit(s,cookie,a.key)).status).toBe(403);expect(s.saves.size).toBe(0);
  });
  it("checks exact origin and fetch metadata before saving",async()=>{
    const s=setup(),a=await admit(s);
    for(const o of["https://evil.example",origin+".evil.example"]){const r=await request(s.app).post(base).set("Cookie",a.cookie).set("Origin",o).send({attemptKey:a.key,enquiry});expect(r.status).toBe(403);}
    expect((await request(s.app).post(base).set("Cookie",a.cookie).set("Origin",origin).set("Sec-Fetch-Site","cross-site").send({attemptKey:a.key,enquiry})).status).toBe(403);expect(s.saves.size).toBe(0);
  });
  it("never degrades a rejected or recovery bearer into a guest submission",async()=>{
    const s=setup(),a=await admit(s);expect((await request(s.app).post(base).set("Cookie",a.cookie).set("Origin",origin).set("Authorization","Bearer recovery").send({attemptKey:a.key,enquiry})).status).toBe(403);expect(s.saves.size).toBe(0);
  });
  it("requires ordinary Auth for staff and organization APIs and leaves narrow role decisions to current SQL",async()=>{
    const s=setup();const path="/api/admin/research/business-inquiries";
    expect((await request(s.app).get(path).set("Authorization","Bearer recovery")).status).toBe(401);
    expect(s.rpc.mock.calls.some(c=>c[0]==="research_business_inquiry_list")).toBe(false);
    expect((await request(s.app).get(path).set("Authorization","Bearer ordinary")).status).toBe(200);s.denySql();
    expect((await request(s.app).get(path).set("Authorization","Bearer ordinary")).status).toBe(403);
    expect((await request(s.app).get("/api/research/account/organizations/10000000-0000-4000-8000-000000000002/business-inquiries").set("Authorization","Bearer ordinary")).status).toBe(403);
  });
  it("does not issue a context when database visibility/policy or durable rate limiting is unavailable",async()=>{
    const s=setup();s.setReady(false);expect((await request(s.app).get(base+"/config")).status).toBe(503);s.setReady(true);s.setRate(false);const r=await request(s.app).get(base+"/config");expect(r.status).toBe(429);expect(r.headers["set-cookie"]).toBeUndefined();
  });
});
