import { test } from "vitest";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createProductControlMediaBytesReader, createProductControlApprovalMediaBytesReader, type ApprovalMediaDescriptor, type PrivateCatalogAssetDescriptor } from "./catalog-publication-blob";
const identity={offeringId:"mo_a1",offeringVariantId:"mov_b2",productId:"11111111-1111-4111-8111-111111111111",variantId:"22222222-2222-4222-8222-222222222222"};
const mediaId="55555555-5555-4555-8555-555555555555",bucketName="synthetic-product-media";
const key=identity.productId+"/"+mediaId+"/fixture.png";
const body=Buffer.from([137,80,78,71,13,10,26,10,0,0,0,0]);
const digest=(s:string|Uint8Array)=>createHash("sha256").update(s).digest("hex");
function descriptor():PrivateCatalogAssetDescriptor { return {identity:{...identity},revisionId:"33333333-3333-4333-8333-333333333333",assetId:"44444444-4444-4444-8444-444444444444",
 generation:2,mediaId,mediaVersion:3,contentType:"image/png",sizeBytes:body.length,sha256:digest(body),width:1,height:1,
 rightsApprovalSha256:"a".repeat(64),storageIdentitySha256:digest(key)}; }
type Row={id:string;product_id:string;state:string;storage_key:string;version:number;content_type:string;size_bytes:number;approved_by:string;approved_at:string;updated_at:string};
function row():Row { return {id:mediaId,product_id:identity.productId,state:"approved",storage_key:key,version:3,content_type:"image/png",size_bytes:body.length,
 approved_by:"synthetic-reviewer",approved_at:"2026-11-24T00:00:00Z",updated_at:"2026-11-24T00:00:00Z"}; }
function fixture(options:{rows?:Row[];public?:boolean;bucketId?:string;info?:Record<string,unknown>;body?:Uint8Array;downloadError?:boolean;rowError?:boolean;hang?:boolean}={}) {
 const calls:{kind:string;value:unknown}[]=[],signals:AbortSignal[]=[];let reads=0;
 const client={
  from(table:string){
   calls.push({kind:"table",value:table});
   return {
    select(columns:string){calls.push({kind:"select",value:columns});return this;},
    eq(name:string,value:string){calls.push({kind:name,value});return this;},
    abortSignal(signal:AbortSignal){signals.push(signal);return this;},
    async maybeSingle(){
     const n=reads++;
     return options.hang?new Promise<never>(()=>{}):{data:options.rows?.[Math.min(n,options.rows.length-1)]??row(),error:options.rowError?{}:null};
    },
   };
  },
  storage:{
   async getBucket(name:string){
    calls.push({kind:"bucket-metadata",value:name});
    return {data:{id:options.bucketId??name,public:options.public??false},error:null};
   },
   from(name:string){
    calls.push({kind:"storage-from",value:name});
    return {
     async info(path:string){
      calls.push({kind:"info",value:path});
      return {data:options.info??{size:body.length,contentType:"image/png"},error:null};
     },
     download(path:string,transform:unknown,parameters:{signal:AbortSignal;cache:string}){
      calls.push({kind:"download",value:{path,transform,cache:parameters.cache}});signals.push(parameters.signal);
      return {
       async asStream(){
        return {data:options.downloadError?null:new ReadableStream<Uint8Array>({start(c){c.enqueue(options.body??body);c.close();}}),error:options.downloadError?{}:null};
       },
      };
     },
    };
   },
  },
 };
 const db=client as unknown as Parameters<typeof createProductControlMediaBytesReader>[0];
 return {db,calls,signals};
}
test("private Product Control client reads exact canonical row/key twice and private bytes once",async()=>{
 const f=fixture();const bytes=await createProductControlMediaBytesReader(f.db,bucketName)(descriptor());assert.deepEqual(bytes,body);
 assert.equal(f.calls.filter(c=>c.kind==="table").length,2);assert(f.calls.filter(c=>c.kind==="table").every(c=>c.value==="research_product_media"));
 assert(f.calls.filter(c=>c.kind==="id").every(c=>c.value===mediaId));assert(f.calls.filter(c=>c.kind==="product_id").every(c=>c.value===identity.productId));
 assert.deepEqual(f.calls.filter(c=>c.kind==="download").map(c=>c.value),[{path:key,transform:{},cache:"no-store"}]);
 assert.equal(f.calls.filter(c=>c.kind==="bucket-metadata").length,2);assert(f.signals.every(s=>s.aborted));
});
for(const [name,value] of [["id","66666666-6666-4666-8666-666666666666"],["product_id","66666666-6666-4666-8666-666666666666"],
 ["state","archived"],["version",4],["content_type","text/html"],["size_bytes",body.length+1],
 ["storage_key",key+"x"],["approved_by",""],["approved_at","invalid"],["updated_at","invalid"]] as const) test("canonical media mismatch withholds before storage: "+name,async()=>{
 const f=fixture({rows:[{...row(),[name]:value}]});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
 assert.equal(f.calls.filter(c=>c.kind==="storage-from").length,0);
});
for(const bad of ["other-product/other-media/image.png",identity.productId+"/"+mediaId+"/..",identity.productId+"/"+mediaId+"/x/y.png",key+"?token=anything"]) {
 test("raw key identity cannot authorize a noncanonical Product Control object: "+bad,async()=>{
  const d={...descriptor(),storageIdentitySha256:digest(bad)},f=fixture({rows:[{...row(),storage_key:bad}]});
  assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(d),null);assert(!f.calls.some(c=>c.kind==="download"));
 });
}
test("raw storage key hash is not trimmed/normalized",async()=>{
 const f=fixture({rows:[{...row(),storage_key:" "+key}]});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
});
for(const options of [{public:true},{bucketId:"different-bucket"},{info:{size:body.length+1,contentType:"image/png"}},
 {info:{size:body.length,contentType:"image/jpeg"}},{rowError:true},{downloadError:true}]) test("private bucket/info/download prerequisite fails closed: "+JSON.stringify(options),async()=>{
 const f=fixture(options);assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
});
test("stream exceeding declared length is canceled/refused before bytes return",async()=>{
 const f=fixture({body:new Uint8Array(body.length+1)});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
 assert(f.signals.every(s=>s.aborted));
});
test("changed body with same size fails approved digest",async()=>{
 const changed=Buffer.from(body);changed[8]=1;const f=fixture({body:changed});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
});
for(const change of [{state:"archived"},{version:4},{approved_by:"different-reviewer"},{updated_at:"2026-11-24T00:01:00Z"}]) {
 test("reread catches canonical media change during download: "+JSON.stringify(change),async()=>{
  const f=fixture({rows:[row(),{...row(),...change}]});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName)(descriptor()),null);
  assert.equal(f.calls.filter(c=>c.kind==="download").length,1);
 });
}
test("metadata hang hits bounded deadline, aborts signal and returns no bytes",async()=>{
 const f=fixture({hang:true});assert.equal(await createProductControlMediaBytesReader(f.db,bucketName,20)(descriptor()),null);assert(f.signals.every(s=>s.aborted));
});
test("fixed bucket and maximum deadline cannot be supplied as object URLs or unbounded",()=>{
 const f=fixture();assert.throws(()=>createProductControlMediaBytesReader(f.db,"https://private.invalid"));assert.throws(()=>createProductControlMediaBytesReader(f.db,bucketName,5001));
});

function approvalDescriptor():ApprovalMediaDescriptor {
  const d=descriptor();return {identity:{...d.identity},mediaId:d.mediaId,mediaVersion:d.mediaVersion,storageIdentitySha256:d.storageIdentitySha256,contentType:d.contentType,sizeBytes:d.sizeBytes};
}
test("approval reader returns verified private bytes with no invented publication descriptor",async()=>{
  const f=fixture(),input=approvalDescriptor();assert.deepEqual(Object.keys(input).sort(),["identity","mediaId","mediaVersion","storageIdentitySha256","contentType","sizeBytes"].sort());
  assert.deepEqual(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(input),body);
  assert.equal(f.calls.filter(c=>c.kind==="table").length,2);assert.equal(f.calls.filter(c=>c.kind==="bucket-metadata").length,2);
  assert.deepEqual(f.calls.filter(c=>c.kind==="download").map(c=>c.value),[{path:key,transform:{},cache:"no-store"}]);
  assert(f.signals.every(s=>s.aborted));
});
for(const [field,value]of [["revisionId",descriptor().revisionId],["assetId",descriptor().assetId],["rightsApprovalSha256","a".repeat(64)],["sha256",digest(body)],["generation",1]] as const)
test("preapproval contract refuses an invented "+field,async()=>{const f=fixture();assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)({...approvalDescriptor(),[field]:value} as ApprovalMediaDescriptor),null);assert.equal(f.calls.length,0);});
for(const input of [
 {...approvalDescriptor(),identity:{...identity,variantId:""}}, {...approvalDescriptor(),identity:{...identity,offeringId:"wrong"}},
 {...approvalDescriptor(),mediaId:"00000000-0000-0000-0000-000000000000"}, {...approvalDescriptor(),mediaVersion:0},
 {...approvalDescriptor(),storageIdentitySha256:"wrong"}, {...approvalDescriptor(),contentType:"image/svg+xml"},
 {...approvalDescriptor(),sizeBytes:0}, {...approvalDescriptor(),sizeBytes:10*1024*1024+1},
])test("invalid approval input refuses before canonical/storage read: "+JSON.stringify(input),async()=>{const f=fixture();assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(input),null);assert.equal(f.calls.length,0);});
for(const change of [{state:"archived"},{version:4},{storage_key:key+"x"},{content_type:"image/jpeg"},{size_bytes:body.length+1},{approved_by:""}])
test("approval still requires current approved canonical media: "+JSON.stringify(change),async()=>{const f=fixture({rows:[{...row(),...change}]});assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(approvalDescriptor()),null);assert(!f.calls.some(c=>c.kind==="download"));});
test("changed actual bytes do not masquerade as a prior approved SHA",async()=>{const changed=Buffer.from(body);changed[8]=2;const f=fixture({body:changed});const bytes=await createProductControlApprovalMediaBytesReader(f.db,bucketName)(approvalDescriptor());assert.deepEqual(bytes,changed);assert.notEqual(digest(bytes!),digest(body));const pub=fixture({body:changed});assert.equal(await createProductControlMediaBytesReader(pub.db,bucketName)(descriptor()),null);});
for(const options of [{public:true},{bucketId:"other"},{info:{size:body.length,contentType:"image/jpeg"}},{body:new Uint8Array(body.length)},{body:new Uint8Array(body.length+1)}])
test("approval byte/bucket metadata boundary refuses: "+JSON.stringify(options),async()=>{const f=fixture(options);assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(approvalDescriptor()),null);});
test("approval rechecks canonical version after download",async()=>{const f=fixture({rows:[row(),{...row(),version:4}]});assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(approvalDescriptor()),null);assert.equal(f.calls.filter(c=>c.kind==="download").length,1);});
test("approval metadata hang stays bounded and aborts",async()=>{const f=fixture({hang:true});assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName,20)(approvalDescriptor()),null);assert(f.signals.every(s=>s.aborted));});
test("approval snapshots the descriptor before any await",async()=>{const f=fixture(),input=approvalDescriptor();const pending=createProductControlApprovalMediaBytesReader(f.db,bucketName)(input);Object.assign(input.identity,{productId:"66666666-6666-4666-8666-666666666666"});assert.deepEqual(await pending,body);assert(f.calls.filter(c=>c.kind==="product_id").every(c=>c.value===identity.productId));});
test("malformed descriptor accessor refuses without storage or an escaped rejection",async()=>{const f=fixture(),input=approvalDescriptor();Object.defineProperty(input,"mediaVersion",{enumerable:true,get(){throw Error("SYNTHETIC_ACCESSOR");}});assert.equal(await createProductControlApprovalMediaBytesReader(f.db,bucketName)(input),null);assert.equal(f.calls.length,0);});
for(const [type,bytes]of [["image/jpeg",Buffer.from([255,216,255,0])],["image/webp",Buffer.from("RIFF0000WEBP")]] as const)
test("approval accepts only the declared header probe for "+type+", not a decoded-image claim",async()=>{const f=fixture({rows:[{...row(),content_type:type,size_bytes:bytes.length}],body:bytes,info:{size:bytes.length,contentType:type}});assert.deepEqual(await createProductControlApprovalMediaBytesReader(f.db,bucketName)({...approvalDescriptor(),contentType:type,sizeBytes:bytes.length}),bytes);});
