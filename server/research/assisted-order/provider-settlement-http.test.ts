// Mounted protocol tests. Actor admission is synthetic; only the separate
// disposable composed proof exercises effective SQL and real F4 recovery.
import { readFileSync } from "node:fs";
import { URL as NodeURL } from "node:url";
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { assistedOrderExpressHandler, createAssistedOrderViewerResolvers, type ExpressAssistedOrderRequest } from "./express";
import { createAssistedOrderRouteTable } from "./http";
import { AssistedOrderAuthorizationError, AssistedOrderConflictError, AssistedOrderVerificationEffectsError, type AssistedOrderService } from "./service";
import type { PaymentEffectsRecovery } from "./payment-effects";
import { AssistedProviderSettlementService, buildAssistedProviderSettlement } from "./payment/provider-settlement";

const id=(n:number)=>`d0000000-0000-4000-8000-${String(n).padStart(12,"0")}`;
const REQUEST=id(1),JOURNAL=id(2),ACTOR=id(3),VERIFICATION=id(4),SETTLEMENT=id(5);
const PATH="/api/admin/research/assisted-orders/:requestId/provider-events/:journalId/settle";
const URL=PATH.replace(":requestId",REQUEST).replace(":journalId",JOURNAL);
const BEARER="Bearer synthetic-adp03-admin";
const receipt=Object.freeze({schemaVersion:"assisted_order_provider_settlement_receipt_v1",settlementId:SETTLEMENT,
  requestId:REQUEST,journalId:JOURNAL,verificationId:VERIFICATION,verifiedAt:"2026-10-01T12:00:00.000Z",state:"verified",replayed:false});
const source=Object.freeze({sourceId:"synthetic-provider-execution",adapterRevision:"synthetic-execution-adapter-v1",
  scope:{provider:"synthetic-unconfigured",accountId:"synthetic-execution-account",mode:"test" as const},policyRevision:"synthetic-settlement-policy-v1"});

function mounted(options:{service?:AssistedProviderSettlementService|null;effects?:PaymentEffectsRecovery|null;omitStamp?:boolean}={}){
  const order:string[]=[];
  const settle=vi.fn(async()=>{order.push("settle");return receipt;});
  const recovery=vi.fn(async()=>{order.push("recover");});
  const settlement=options.service===undefined?{settle} as unknown as AssistedProviderSettlementService:options.service;
  const effects=options.effects===undefined?{recover:recovery,runBatch:vi.fn(async()=>({completed:0,failed:0}))}:options.effects;
  const viewers=createAssistedOrderViewerResolvers({resolveMember:async()=>null,earlyAccess:()=>null,
    earlyAccessBindings:()=>null,adminEmail:()=>"synthetic-admin@example.test"});
  const routes=createAssistedOrderRouteTable<ExpressAssistedOrderRequest>({} as AssistedOrderService,viewers,null,null,effects,null,null,null,settlement);
  const app=express();app.use(express.json());app.use((req,res,next)=>{
    if(req.headers.authorization!==BEARER){res.status(401).json({error:"unauthorized"});return;}
    if(!options.omitStamp)Object.assign(req,{adminAuthUserId:ACTOR});next();
  });
  const route=routes.find(item=>item.method==="POST"&&item.path===PATH);
  if(route)app.post(PATH,assistedOrderExpressHandler(route));
  return{app,routes,settle,recovery,order};
}

describe("ADP03 mounted canonical provider settlement",()=>{
  it("uses an admin POST, server actor and path identities, then bound F4 recovery",async()=>{
    const h=mounted();const response=await request(h.app).post(URL).set("authorization",BEARER).send({});
    expect(response.status).toBe(200);expect(response.headers["cache-control"]).toBe("no-store");expect(response.body).toEqual(receipt);
    expect(h.routes.find(item=>item.method==="POST"&&item.path===PATH)?.auth).toBe("admin");
    expect(h.settle).toHaveBeenCalledWith(expect.objectContaining({actorType:"admin",authUserId:ACTOR}),REQUEST,JOURNAL,{});
    expect(h.recovery).toHaveBeenCalledExactlyOnceWith(VERIFICATION,REQUEST);expect(h.order).toEqual(["settle","recover"]);
    expect(JSON.stringify(response.body)).not.toMatch(/providerPaymentId|providerSessionId|accountId|verifiedBy|sourceId|actorAuthUserId/);
  });

  it("refuses missing effects authority before any settlement write",async()=>{
    const h=mounted({effects:null});const response=await request(h.app).post(URL).set("authorization",BEARER).send({});
    expect(response.status).toBe(409);expect(response.body.error).toBe("payment_verification_not_ready");
    expect(h.settle).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
    expect(response.body.message).not.toMatch(/was recorded|was verified|has been verified/i);
  });

  it("returns truthful postcommit effects-pending503 without a second settlement or public private facts",async()=>{
    const h=mounted();h.recovery.mockRejectedValueOnce(new AssistedOrderVerificationEffectsError());
    const response=await request(h.app).post(URL).set("authorization",BEARER).send({});
    expect(response.status).toBe(503);expect(response.body.error).toBe("payment_verification_effects_pending");
    expect(response.body.message).toMatch(/verification|verified/i);expect(response.body.message).toMatch(/recorded|completed/i);
    expect(response.body.message).not.toContain("synthetic-private-audit-key-error");
    expect(h.settle).toHaveBeenCalledTimes(1);expect(h.recovery).toHaveBeenCalledExactlyOnceWith(VERIFICATION,REQUEST);
  });

  it.each(["","Bearer browser-admin","Bearer synthetic-member"])("refuses unauthenticated admission %s before settlement",async authorization=>{
    const h=mounted();const response=await request(h.app).post(URL).set("authorization",authorization).send({adminAuthUserId:ACTOR});
    expect(response.status).toBe(401);expect(h.settle).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
  });

  it("requires a real server actor stamp, not browser or email-only authority",async()=>{
    const rpc=vi.fn();const h=mounted({service:new AssistedProviderSettlementService({rpc},source),omitStamp:true});
    expect((await request(h.app).post(URL).set("authorization",BEARER).send({})).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
  });

  it.each([{amountCents:5000},{currency:"USD"},{verified:true},{sourceId:"invented"},{actorAuthUserId:ACTOR},{providerPaymentId:"invented"},{quoteId:id(6)},{intent:"settle"}])(
    "rejects browser financial or configuration fields before SQL: %j",async body=>{
      const rpc=vi.fn();const h=mounted({service:new AssistedProviderSettlementService({rpc},source)});
      expect((await request(h.app).post(URL).set("authorization",BEARER).send(body)).status).toBe(400);
      expect(rpc).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
    });

  it("keeps a directly constructed null-source service unavailable",async()=>{
    const rpc=vi.fn();const h=mounted({service:new AssistedProviderSettlementService({rpc},null)});
    const response=await request(h.app).post(URL).set("authorization",BEARER).send({});
    expect(response.status).toBe(409);expect(response.body.error).toBe("provider_settlement_unavailable");
    expect(rpc).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
  });

  it.each([false,true])("has no settlement descriptor with source null, even enabled=%s",async enabled=>{
    const rpc=vi.fn(),svc=buildAssistedProviderSettlement({enabled,rpc:{rpc},source:null});expect(svc).toBeNull();
    const h=mounted({service:svc});expect(h.routes.some(item=>item.path===PATH)).toBe(false);
    expect((await request(h.app).post(URL).set("authorization",BEARER).send({})).status).toBe(404);expect(rpc).not.toHaveBeenCalled();
  });

  it("does not settle on GET or OPTIONS",async()=>{
    const h=mounted();expect((await request(h.app).get(URL).set("authorization",BEARER)).status).toBe(404);
    await request(h.app).options(URL).set("authorization",BEARER);expect(h.settle).not.toHaveBeenCalled();expect(h.recovery).not.toHaveBeenCalled();
  });

  it.each([{error:new AssistedOrderAuthorizationError(),status:403},
    {error:new AssistedOrderConflictError("provider_settlement_held","Provider payment settlement remains held."),status:409},
    {error:new Error("synthetic-private-provider-facts"),status:500}])("does not recover or leak facts after precommit failure $status",async({error,status})=>{
      const h=mounted();h.settle.mockRejectedValueOnce(error);const response=await request(h.app).post(URL).set("authorization",BEARER).send({});
      expect(response.status).toBe(status);expect(response.headers["cache-control"]).toBe("no-store");
      expect(JSON.stringify(response.body)).not.toContain("synthetic-private-provider-facts");expect(h.recovery).not.toHaveBeenCalled();
    });

  it("pins literal startup admission, explicit feature gate and unconditional null source",()=>{
    const startup=readFileSync(new NodeURL("../../index.ts",import.meta.url),"utf8");
    const start=startup.indexOf("const assistedProviderSettlement = buildAssistedProviderSettlement");expect(start).toBeGreaterThan(-1);
    const composition=startup.slice(start,startup.indexOf("const assistedOrderRoutes =",start));
    expect(composition).toContain('process.env.RESEARCH_ASSISTED_ORDER_PROVIDER_SETTLEMENT_ENABLED === "true"');
    expect(composition).toContain("source: null");expect(startup).toContain(`app.post("${PATH}", requireSupabaseAdmin,`);
    expect(composition).not.toMatch(/Stripe|Square|Authorize\.net|process\.env\.[A-Z_]*SECRET/);
  });
});
