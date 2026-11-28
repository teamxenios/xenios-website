import { it } from "vitest";
import assert from "node:assert/strict";
import { createCatalogPublicationPort, readCatalogPublicationHead } from "./catalogPublication";
const P="11111111-1111-4111-8111-111111111111",V="22222222-2222-4222-8222-222222222222";
const current=async()=>({kind:"unavailable" as const});
async function withFetch(reply:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>,run:()=>Promise<void>){const original=globalThis.fetch;globalThis.fetch=reply;try{await run();}finally{globalThis.fetch=original;}}
const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{"Content-Type":"application/json"}});
it("uses only selected ProductAdmin POST scope, no-store bearer and the same supplied key",async()=>{const calls:Array<{url:string;init:RequestInit}>=[];await withFetch(async(url,init)=>{calls.push({url:String(url),init:init!});return json({operation:"withdraw",revisionId:null,generation:5});},async()=>{const port=createCatalogPublicationPort("synthetic-inert",P,V,current);await port.command("withdraw",{expectedGeneration:4,reason:"Synthetic withdrawal"},"same-synthetic-key");await port.command("withdraw",{expectedGeneration:4,reason:"Synthetic withdrawal"},"same-synthetic-key");});assert.equal(calls.length,2);for(const c of calls){assert.equal(c.url,`/api/admin/research/products/${P}/variants/${V}/catalog-publication/withdraw`);assert.equal(c.init.method,"POST");assert.equal(c.init.cache,"no-store");assert.equal(c.init.credentials,"same-origin");assert.equal(c.init.redirect,"error");assert.deepEqual(c.init.headers,{Authorization:"Bearer synthetic-inert","Content-Type":"application/json","Idempotency-Key":"same-synthetic-key"});assert.deepEqual(JSON.parse(c.init.body as string),{expectedGeneration:4,reason:"Synthetic withdrawal"});}});
it("preview sends no mutation key, actor, public rights or private storage field",async()=>withFetch(async(_url,init)=>{assert.deepEqual(JSON.parse(init!.body as string),{mediaId:P});assert(!Object.hasOwn(init!.headers!,"Idempotency-Key"));return json({});},async()=>{await createCatalogPublicationPort("synthetic-inert",P,V,current).preview(P);}));
it("preserves an explicitly injected authenticated reader without starting another read",async()=>withFetch(async()=>{throw Error("No network for read seam");},async()=>{const port=createCatalogPublicationPort("synthetic-inert",P,V,current);assert.deepEqual(await port.readCurrent(),{kind:"unavailable"});}));
for(const [name,response]of [
 ["SPA HTML",()=>new Response("<html>synthetic shell</html>",{status:200,headers:{"Content-Type":"text/html"}})],
 ["invalid JSON",()=>new Response("{",{status:200,headers:{"Content-Type":"application/json"}})],
 ["lost transport",()=>{throw Error("Synthetic lost response");}],
 ["empty receipt",()=>json(null)],
 ["store unknown",()=>json({error:"store_outcome_unconfirmed",operationConfirmed:false},503)],
] as const)it(`keeps ${name} unconfirmed for the controller`,async()=>withFetch(async()=>response(),async()=>{const result=await createCatalogPublicationPort("synthetic-inert",P,V,current).command("withdraw",{expectedGeneration:4,reason:"Synthetic"},"synthetic-key");assert.equal(result.kind,"unknown");}));
it("recognizes only a specific server conflict, never all errors as a safe refusal",async()=>withFetch(async()=>json({error:"publication_generation_conflict",operationConfirmed:false},409),async()=>{assert.equal((await createCatalogPublicationPort("synthetic-inert",P,V,current).command("withdraw",{expectedGeneration:4,reason:"Synthetic"},"synthetic-key")).kind,"conflict");}));
it("does not erase a prior unknown outcome on an authorization denial",async()=>withFetch(async()=>json({error:"authorization_required"},403),async()=>{assert.equal((await createCatalogPublicationPort("synthetic-inert",P,V,current).command("withdraw",{expectedGeneration:4,reason:"Synthetic"},"synthetic-key")).kind,"denied");}));
const state=()=>({identity:{offeringId:"mo_a",offeringVariantId:"mov_b",productId:P,variantId:V},generation:0,currentRevisionId:null,revisions:[],operations:[],historyTruncated:false});
it("real apiGet uses selected GET base without query/body or browser actor/rights",async()=>withFetch(async(url,init)=>{assert.equal(String(url),`/api/admin/research/products/${P}/variants/${V}/catalog-publication`);assert.equal(init!.method,"GET");assert.equal(init!.credentials,"same-origin");assert.equal(init!.cache,"no-store");assert.equal(init!.body,undefined);assert.deepEqual(init!.headers,{Authorization:"Bearer synthetic-inert"});return json(state());},async()=>{const reply=await createCatalogPublicationPort("synthetic-inert",P,V).readCurrent();assert.deepEqual(reply,{kind:"ok",data:state()});}));
for(const status of [401,403])it(`read access ${status} is denied, not an empty state`,async()=>withFetch(async()=>json({ok:false,code:"synthetic_access_denied"},status),async()=>{assert.deepEqual(await readCatalogPublicationHead("synthetic-inert",P,V),{kind:"denied"});}));
for(const [label,reply]of [
 ["unimplemented503",()=>json({error:"publication_unavailable"},503)],
 ["SPA fallback",()=>new Response("<html>synthetic shell</html>",{headers:{"Content-Type":"text/html"}})],
 ["malformed empty object",()=>json({})],
 ["null body",()=>json(null)],
 ["wrong exact variant",()=>json({...state(),identity:{...state().identity,variantId:P}})],
 ["missing actual generation",()=>{const v=state();delete (v as Partial<typeof v>).generation;return json(v);}],
 ["missing truncation fact",()=>{const v=state();delete (v as Partial<typeof v>).historyTruncated;return json(v);}],
] as const)it(`read ${label} remains unavailable without generation zero fallback`,async()=>withFetch(async()=>reply(),async()=>{assert.deepEqual(await readCatalogPublicationHead("synthetic-inert",P,V),{kind:"unavailable"});}));
it("reads factual current head and truncation without preview or an approval status",async()=>withFetch(async()=>json({...state(),generation:8,currentRevisionId:P,revisions:[{revisionId:P,previouslyPublished:true}],historyTruncated:true}),async()=>{const value=await readCatalogPublicationHead("synthetic-inert",P,V);assert.equal(value.kind,"ok");if(value.kind==="ok"){assert.equal(value.data.historyTruncated,true);assert.equal(value.data.currentRevisionId,P);}}));
