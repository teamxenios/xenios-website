import {it,expect} from "vitest";import {catalogAdmissionMode} from "./production";import {makeCatalogAdmission} from "./catalog-admission";import {sha256AssistedOrderHasher as hash} from "../defaults";
it("public mode is off by default; malformed enforcement or missing retention never selects the old fallback",()=>{
 expect(catalogAdmissionMode({})).toEqual({required:false,ready:true,ttl:0});
 for(const [flag,ttl] of [["TRUE","600"],["true",""],["true","86401"]])expect(catalogAdmissionMode({RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED:flag,RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS:ttl})).toMatchObject({required:true,ready:false});
 expect(catalogAdmissionMode({RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED:"true",RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS:"900"})).toMatchObject({required:true,ready:true,ttl:900});
});
it("a stale contact form can't bind an old visitor's name/email to the current visitor",async()=>{
 let writes=0;const gate=makeCatalogAdmission({requiredAgreements:async()=>[{kind:"policy",version:"v2"}]},hash,{present:async()=>false,saveFirst:async()=>{writes++;return "committed"}});
 const a=await gate.status("a".repeat(64),"left");const b=await gate.status("a".repeat(64),"right");expect(a.policyRevision).not.toBe(b.policyRevision);
 await expect(gate.capture("a".repeat(64),"right",{fullLegalName:"Fixture",email:"fixture@example.invalid",policyRevision:a.policyRevision})).rejects.toMatchObject({status:409});expect(writes).toBe(0);
});
import express from "express";import http from "supertest";import {registerRequestIntentApi} from "./production";
it("the real production registration advertises the boolean, applies trusted JSON capture, and blocks raw catalog access before a saved contact",async()=>{
 const app=express();app.use(express.json());const values=new Set<string>();
 registerRequestIntentApi(app,{env:{SITE_URL:"https://test.example.invalid",RESEARCH_REQUEST_INTENT_ENABLED:"true",RESEARCH_REQUEST_CATALOG_CONTACT_REQUIRED:"true",RESEARCH_REQUEST_CATALOG_CONTACT_RETENTION_SECONDS:"900"},
  requiredAgreements:[{kind:"policy",version:"1"}],agreementGate:{accepted:async()=>true},masterOfferingServiceFor:()=>null,bindingFor:()=>null,offeringVariantFor:()=>null,catalogVersion:"test",supabaseStorage:null,log:()=>{},
  supabaseRpc:{rpc:async(name:string,args?:Readonly<Record<string,unknown>>)=>{const key=String(args?.p_owner_binding)+String(args?.p_policy_revision);
  return {data:name==="research_rate_limit_hit"?true:name==="request_intent_catalog_contact_has"?values.has(key):name==="request_intent_catalog_contact_put"?(values.add(key),"committed"):null,error:null};}}},
  {customer:async()=>({actorType:"early_access_session",memberId:null,normalizedEmail:null,earlyAccessCustomerRef:"guest",earlyAccessSessionHash:"synthetic-session",capabilities:new Set(["assisted_orders:submit"])})},
  {loadCapabilityStatus:async()=>({rail:"care",state:"disabled",enabled:false,publicMessage:"",checkedAt:new Date().toISOString()}),resolvePrincipal:async()=>null,recordAccessDecision:async()=>{}});
 const path="/api/research/early-access/request-intents";const cfg=await http(app).get(path+"/config");expect(cfg.body.contactAdmissionRequired).toBe(true);expect(JSON.stringify(cfg.body)).not.toContain("900");
 expect((await http(app).get(path+"/catalog")).body.error).toBe("catalog_admission_required");const challenge=(await http(app).get(path+"/admission")).body;
 const raw={fullLegalName:"Synthetic Guest",email:"qa@example.invalid",policyRevision:challenge.policyRevision};
 expect((await http(app).post(path+"/admission").send(raw)).status).toBe(403);expect((await http(app).post(path+"/admission").set("origin","https://test.example.invalid").send(raw)).body).toEqual({...challenge,admitted:true});
 expect((await http(app).get(path+"/admission")).body.admitted).toBe(true);
});
