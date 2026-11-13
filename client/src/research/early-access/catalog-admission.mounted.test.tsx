// @vitest-environment jsdom
import express, { type RequestHandler } from "express";
import httpRequest from "supertest";
import { act } from "react";
import {createRoot} from "react-dom/client";
import {expect,it,vi} from "vitest";
import {RequestIntentForm} from "../assisted-order/RequestIntentForm";
import {ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,assistedOrderFormPair} from "../../../../shared/research/assisted-order/form";
import {PreCatalogContact} from "./PreCatalogContact";
import {createCatalogAdmissionApi} from "./catalog-admission-api";
import {createRequestIntentApi,REQUEST_INTENT_API_PATH as base} from "../assisted-order/request-intent-api";
import {makeCatalogAdmission} from "../../../../server/research/assisted-order/request-intent/catalog-admission";
import {createRequestIntentRouter} from "../../../../server/research/assisted-order/request-intent/express";
import {RequestIntentService, type RequestIntentDependencies} from "../../../../server/research/assisted-order/request-intent/service";
import {sha256AssistedOrderHasher as hasher} from "../../../../server/research/assisted-order/defaults";
import type {AssistedOrderViewer} from "../../../../server/research/assisted-order/ports";

it("connects the rendered form to HTTP admission and protected catalog; fresh identity or policy cannot reuse it",async()=>{
  (globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  const legal={requiredAgreements:async()=>[{kind:"synthetic-waiver",version}]};
  let version="v1",actor="a",waiver=false;
  const saved=new Map<string,string>();
  const admission=makeCatalogAdmission(legal,hasher,{
    present:async key=>saved.has(JSON.stringify(key)),
    saveFirst:async(key,value)=>{const k=JSON.stringify(key),v=JSON.stringify(value);
      if(saved.has(k)) return saved.get(k)===v?"already_same":"different_contact"; saved.set(k,v);return "committed";}
  });
  const catalogList=vi.fn(async()=>({items:[],total:0,page:1,pageSize:24,families:[],channels:[],workflowModes:[]}));
  const deps={legal,standing:{accepted:async()=>waiver},hasher,contactAdmission:admission,
    catalog:{list:catalogList,resolveMany:async()=>[]},clock:{now:()=>new Date()},
    ids:{uuid:()=>{throw Error("out of scope")},publicReference:()=>"",opaqueToken:()=>""},
    repository:{findAttempt:async()=>null,createOrReplay:async()=>{throw Error("out of scope")}}} satisfies RequestIntentDependencies;
  const app=express();app.use(express.json());
  const pass:RequestHandler=(_q,_r,n)=>n();
  app.get(base+"/config",(_q,r)=>{r.set("Cache-Control","no-store").json({enabled:true,requiredAgreements:[{kind:"synthetic-waiver",version,label:"Synthetic waiver"}],
    formAcknowledgments:ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map(a=>({id:a.id,scope:a.scope,copy:a.copy,...assistedOrderFormPair(a)}))});});
  app.use(base,createRequestIntentRouter({service:new RequestIntentService(deps),
    contactAdmissionRoutes:true,enabled:()=>true,staffReadEnabled:()=>false,
    resolveCustomer:async req=>{const id=req.get("Authorization")==="Bearer synthetic-a"?"a":req.get("Authorization")==="Bearer synthetic-b"?"b":null;
      return {actorType:"early_access_session",earlyAccessCustomerRef:id,earlyAccessSessionHash:id?"session-"+id:null,
        authUserId:null,memberId:null,normalizedEmail:null,capabilities:new Set(id?["assisted_orders:submit"]:[])} as AssistedOrderViewer;},
    care:{resolvePrincipal:async()=>null,recordAccessDecision:async()=>{},loadCapabilityStatus:async()=>{throw Error("unreached");}},
    staffReader:{get:async()=>null,list:async()=>{throw Error("unreached");}},
    readRateLimit:pass,writeRateLimit:pass,mutationGuard:(q,r,n)=>{if(q.get("Origin")==="https://fixture.invalid")n();else r.sendStatus(403);}}));
  const wire:{method:string,path:string,status:number}[]=[];
  const transport=async(path:string,init:RequestInit)=>{
    expect(init.credentials).toBe("include");expect(init.cache).toBe("no-store");
    const req=init.method==="POST"?httpRequest(app).post(path):httpRequest(app).get(path);
    const res=await req.set(init.headers as Record<string,string>).set("Origin","https://fixture.invalid").send(init.body as string|undefined);
    wire.push({method:init.method!,path,status:res.status});expect(res.headers["cache-control"]).toBe("no-store");
    return new Response(JSON.stringify(res.body),{status:res.status});
  };
  const api=createCatalogAdmissionApi(()=>"synthetic-"+actor,transport);
  const catalog=createRequestIntentApi(()=>"synthetic-"+actor,transport);
  const host=document.createElement("main");document.body.append(host);const root=createRoot(host);
  const render=async(epoch:string)=>act(async()=>root.render(<PreCatalogContact sessionEpoch={epoch} api={api}><RequestIntentForm api={catalog} ownerKey={epoch} continuationEnabled/></PreCatalogContact>));
  async function wait(pred:()=>boolean){for(let i=0;i<200&&!pred();i++)await act(async()=>{await new Promise(r=>setTimeout(r,5));});expect(pred()).toBe(true);}
  const direct=(which:string)=>httpRequest(app).get(base+"/catalog").set("Authorization","Bearer synthetic-"+which);
  try {
    expect((await httpRequest(app).get(base+"/catalog")).status).toBe(401);
    expect((await direct("a")).body.error).toBe("agreement_standing_required");
    expect((await httpRequest(app).get(base+"/admission").set("Authorization","Bearer synthetic-a")).status).toBe(403);
    waiver=true;
    expect((await direct("a")).body.error).toBe("catalog_admission_required");expect(catalogList).not.toHaveBeenCalled();
    await render("epoch-a"); await wait(()=>!!host.querySelector("form"));
    expect(wire).toEqual([{method:"GET",path:base+"/admission",status:200}]);expect(catalogList).not.toHaveBeenCalled();
    const f=host.querySelector("form")!;f.querySelector<HTMLInputElement>('[name=fullLegalName]')!.value="Synthetic Person";
    f.querySelector<HTMLInputElement>('[name=email]')!.value="synthetic@example.invalid";
    await act(async()=>{f.dispatchEvent(new Event("submit",{bubbles:true,cancelable:true}));});await wait(()=>!!host.textContent?.includes("0 visible catalog entries. 0 selected."));
    expect(wire.slice(1).filter(x=>!x.path.endsWith("/config")).map(x=>[x.method,x.path.split("?")[0],x.status])).toEqual([["POST",base+"/admission",200],["GET",base+"/catalog",200]]);
    expect(catalogList).toHaveBeenCalledTimes(1);expect(saved.size).toBe(1);
    actor="b";await render("epoch-b");await wait(()=>!!host.querySelector("form"));expect((await direct("b")).status).toBe(403);
    expect((await direct("a")).status).toBe(200);
    version="v2";expect((await direct("a")).body.error).toBe("catalog_admission_required");waiver=false;
    expect((await direct("a")).body.error).toBe("agreement_standing_required");
    expect(localStorage.length+sessionStorage.length).toBe(0);
  } finally {await act(async()=>root.unmount());host.remove();}
});
