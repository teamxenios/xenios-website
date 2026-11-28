import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import type { Request, Response } from "express";
import { createCatalogAssetHandler, parseCatalogAssetPath, verifyCatalogAssetBytes,
  type PublishedCatalogAsset, type CatalogAssetDelivery } from "./catalog-publication-asset";
const selected = { offeringId:"mo_a1", offeringVariantId:"mov_b2",
  productId:"11111111-1111-4111-8111-111111111111",variantId:"22222222-2222-4222-8222-222222222222" };
const revisionId="33333333-3333-4333-8333-333333333333", assetId="44444444-4444-4444-8444-444444444444";
const path=`/api/research/catalog-media/${revisionId}/${assetId}`;
const bytes=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]); // Synthetic signature fixture; no decoded-image claim.
const hash=(b:Uint8Array)=>createHash("sha256").update(b).digest("hex");
type MutableAsset = { -readonly [K in keyof PublishedCatalogAsset]: PublishedCatalogAsset[K] };
function asset(): MutableAsset { return {identity:{...selected},revisionId,assetId,
  generation:2,mediaId:"55555555-5555-4555-8555-555555555555",mediaVersion:3,
  contentType:"image/png",sizeBytes:bytes.length,sha256:hash(bytes),width:1,height:1,
  rightsApprovalSha256:"a".repeat(64),bytes:Buffer.from(bytes)}; }
function response() {
  const state:{status:number;headers:Record<string,string>;body?:Buffer;ended:boolean}={status:0,headers:{},ended:false};
  const res={status(code:number){state.status=code;return this;},set(name:string|Record<string,string>,value?:string){
    if(typeof name==="string")state.headers[name]=value!;else Object.assign(state.headers,name);return this;},
    end(body?:Buffer){state.ended=true;state.body=body;return this;}};
  return {state,res:res as unknown as Response};
}
async function invoke(value:PublishedCatalogAsset|null,method="GET",url=path) {
  const calls:unknown[]=[];const r=response();
  const handler=createCatalogAssetHandler({selected,async readPublishedAsset(input){calls.push(input);return value;}});
  await handler({method,originalUrl:url} as Request,r.res);return {...r,calls};
}
function closedHeaders(headers:Record<string,string>) {
  assert.equal(headers["Cache-Control"],"no-store");assert.equal(headers["X-Content-Type-Options"],"nosniff");
  assert.equal(headers["Pragma"],"no-cache");assert(!("Location" in headers));assert(!("ETag" in headers));
}
test("GET sends only exact verified bytes with six server-bound IDs and no cache validator",async()=>{
  const r=await invoke(asset());assert.equal(r.state.status,200);assert.deepEqual(r.state.body,bytes);
  assert.deepEqual(r.calls,[{...selected,revisionId,assetId}]);closedHeaders(r.state.headers);
  assert.equal(r.state.headers["Content-Type"],"image/png");assert.equal(r.state.headers["Content-Length"],String(bytes.length));
  assert.equal(Object.keys(r.state.headers).some(k=>/storage|bucket|rights|revision/i.test(k)),false);
});
test("HEAD performs the same byte and authority checks but emits no body",async()=>{
  const r=await invoke(asset(),"HEAD");assert.equal(r.calls.length,1);assert.equal(r.state.status,200);
  assert.equal(r.state.body,undefined);assert.equal(r.state.headers["Content-Length"],String(bytes.length));closedHeaders(r.state.headers);
  const a=asset();a.bytes[8]^=1;assert.equal((await invoke(a,"HEAD")).state.status,404);
});
for(const url of [path.replace('/api/research/','/research/'),path+"/",path+"?key=private",path+"?",path.replace("/catalog-media/","/CATALOG-media/"),
  path.replace(revisionId,"AAAAAAAA-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),path.replace(revisionId,"00000000-0000-0000-0000-000000000000"),
  path.replace("33333333","%33333333"),path.replace("/research/","//research/"),path+"#fragment"]) {
  test("noncanonical asset path refuses before authority read: "+url,async()=>{
    const r=await invoke(asset(),"GET",url);assert.equal(r.state.status,404);assert.equal(r.calls.length,0);closedHeaders(r.state.headers);
  });
}
for(const method of ["POST","PUT","DELETE","PATCH","OPTIONS"]) test(method+" cannot turn asset delivery into an action",async()=>{
  const r=await invoke(asset(),method);assert.equal(r.state.status,405);assert.equal(r.calls.length,0);
  assert.equal(r.state.headers.Allow,"GET, HEAD");closedHeaders(r.state.headers);
});
for(const field of ["offeringId","offeringVariantId","productId","variantId"] as const) test("cross-subject "+field+" withholds bytes",async()=>{
  const a=asset();a.identity={...a.identity,[field]:"different"};const r=await invoke(a);assert.equal(r.state.status,404);assert.equal(r.state.body,undefined);
});
for(const [field,value] of [["revisionId","66666666-6666-4666-8666-666666666666"],["assetId","66666666-6666-4666-8666-666666666666"],
  ["mediaId","00000000-0000-0000-0000-000000000000"],["mediaVersion",0],["generation",0],["width",0],["height",20001],
  ["rightsApprovalSha256",null],["rightsApprovalSha256","NOT_APPROVED"]] as const) test("invalid authority descriptor "+field+":"+value,async()=>{
  const a={...asset(),[field]:value} as unknown as PublishedCatalogAsset;const r=await invoke(a);
  assert.equal(r.state.status,404);assert.equal(r.state.body,undefined);closedHeaders(r.state.headers);
});
for(const [field,value] of [["sizeBytes",0],["sizeBytes",10*1024*1024+1],["sizeBytes",bytes.length+1],
  ["contentType","image/svg+xml"],["contentType","text/html"],["contentType","image/png; charset=utf8"],
  ["sha256","b".repeat(64)],["sha256","A".repeat(64)],["bytes",new Uint8Array([1,2,3])]] as const) {
  test("invalid image bytes/type/digest withheld: "+field+":"+String(value),async()=>{
    const r=await invoke({...asset(),[field]:value} as unknown as PublishedCatalogAsset);assert.equal(r.state.status,404);assert.equal(r.state.body,undefined);
  });
}
test("signature mismatch fails even when declared SHA/length match malicious bytes",async()=>{
  const a=asset();a.bytes=new Uint8Array(bytes.length);a.sha256=hash(a.bytes);assert.equal((await invoke(a)).state.status,404);
});
test("withdrawal/rollback/rights revocation is freshly read on each GET and HEAD",async()=>{
  let current:PublishedCatalogAsset|null=asset(),reads=0;const handler=createCatalogAssetHandler({selected,async readPublishedAsset(){reads++;return current;}});
  let r=response();await handler({method:"GET",originalUrl:path} as Request,r.res);assert.equal(r.state.status,200);
  current=null;r=response();await handler({method:"HEAD",originalUrl:path} as Request,r.res);assert.equal(r.state.status,404);assert.equal(reads,2);
});
test("missing server selection is closed and incoming IDs cannot replace it",async()=>{
  const r=response();let calls=0;const handler=createCatalogAssetHandler({selected:null,async readPublishedAsset(){calls++;return asset();}});
  await handler({method:"GET",originalUrl:path} as Request,r.res);assert.equal(r.state.status,404);assert.equal(calls,0);
});
test("selected subject is copied; later external mutation cannot retarget the handler",async()=>{
  const selection={...selected};let captured:unknown;const r=response();
  const handler=createCatalogAssetHandler({selected:selection,async readPublishedAsset(input){captured=input;return asset();}});
  selection.productId="66666666-6666-4666-8666-666666666666";await handler({method:"GET",originalUrl:path} as Request,r.res);
  assert.deepEqual(captured,{...selected,revisionId,assetId});assert.equal(r.state.status,200);
});
test("conditional request cannot become304 or a storage redirect",async()=>{
  const r=response();const handler=createCatalogAssetHandler({selected,async readPublishedAsset(){return asset();}});
  await handler({method:"GET",originalUrl:path,headers:{"if-none-match":"*","if-modified-since":"Wed, 01 Jan 2020 00:00:00 GMT"},fresh:true} as unknown as Request,r.res);
  assert.equal(r.state.status,200);closedHeaders(r.state.headers);
});
test("backend exception returns generic empty503 without private diagnostics",async()=>{
  const r=response();const handler=createCatalogAssetHandler({selected,async readPublishedAsset(){throw Error("private/storage/key and token");}});
  await handler({method:"GET",originalUrl:path} as Request,r.res);assert.equal(r.state.status,503);assert.equal(r.state.body,undefined);closedHeaders(r.state.headers);
});
test("verified response owns copied bytes; later buffer mutation cannot change it",()=>{
  const a=asset(),verified=verifyCatalogAssetBytes(a)!;a.bytes.fill(0);assert.deepEqual(verified.bytes,bytes);
});
test("SharedArrayBuffer and nonbytes cannot race verification",()=>{
  const a=asset();a.bytes=new Uint8Array(new SharedArrayBuffer(bytes.length));assert.equal(verifyCatalogAssetBytes(a),null);
  assert.equal(verifyCatalogAssetBytes({...asset(),bytes:"not bytes"} as unknown as PublishedCatalogAsset),null);
});
test("no private storage selector can be smuggled in an otherwise correct URL",()=>{
  assert.equal(parseCatalogAssetPath(path+"?storageKey=private/object"),null);
});
for(const [contentType,raw] of [["image/jpeg",[255,216,255,1,2,3]],
  ["image/webp",[82,73,70,70,4,0,0,0,87,69,66,80]]] as const) test(contentType+" requires matching raster signature and digest",async()=>{
  const a=asset();a.contentType=contentType;a.bytes=new Uint8Array(raw);a.sizeBytes=a.bytes.length;a.sha256=hash(a.bytes);
  const r=await invoke(a);assert.equal(r.state.status,200);assert.equal(r.state.headers["Content-Type"],contentType);
  a.bytes[0]=0;a.sha256=hash(a.bytes);assert.equal((await invoke(a)).state.status,404);
});
