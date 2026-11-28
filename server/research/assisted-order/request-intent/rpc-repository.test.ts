import {expect,it,vi} from "vitest";
import {requestIntentRepository,requestIntentStaffReader,requestIntentPreparationMetadataReader} from "./rpc-repository";
import {REQUEST_INTENT_PREPARATION_PROTOCOL,preparationInstant,type CreateIntent,type RequestIntentPreparationQuery} from "./service";
const receipt={kind:"unapproved_selection_request" as const,status:"pending_review" as const,
 requestId:"10000000-0000-4000-8000-000000000001",publicReference:"XRI-10000000000040008000000000000001",createdAt:"2026-11-18T00:00:00Z"};
it("passes only a server-derived admission key with the explicit frozen command",async()=>{
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt,fingerprint:"a".repeat(64)},error:null}));
 const record={ownerHash:"b".repeat(64),attemptHash:"c".repeat(64),fingerprint:"a".repeat(64),
  detail:{...receipt,contact:{},agreements:[],lines:[],optionalIntake:{referralChoice:{mode:"use_saved",admissionRevision:receipt.requestId}}},
  referralAdmission:{ownerBinding:"d".repeat(64),policyRevision:"e".repeat(64)}} as CreateIntent;
 await requestIntentRepository({rpc}).createOrReplay(record);
 expect(rpc).toHaveBeenCalledWith("request_intent_create_with_referral",expect.objectContaining({p_context:record.detail.optionalIntake,p_admission:record.referralAdmission}));
 expect(rpc.mock.calls[0][1].p_detail).not.toHaveProperty("optionalIntake");
});
it("retains the legacy context RPC for goal/code-only callers",async()=>{
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt,fingerprint:"a".repeat(64)},error:null}));
 await requestIntentRepository({rpc}).createOrReplay({ownerHash:"b".repeat(64),attemptHash:"c".repeat(64),fingerprint:"a".repeat(64),
  detail:{...receipt,contact:{},agreements:[],lines:[],optionalIntake:{goal:"compare_options",referralCode:"LEGACY"}}} as CreateIntent);
 expect(rpc.mock.calls[0][0]).toBe("request_intent_create_with_context");
});
it("reads reported facts only through the existing authorized staff wrapper",async()=>{
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{...receipt,contact:{},agreements:[],lines:[],optionalIntake:{referralName:"Jane Smith"}},error:null}));
 expect((await requestIntentStaffReader({rpc},true,true).get(receipt.requestId,"verified-actor","operator"))?.optionalIntake).toEqual({referralName:"Jane Smith"});
 expect(rpc).toHaveBeenCalledWith("request_intent_referral_staff_get",{p_request_id:receipt.requestId,p_actor_user_id:"verified-actor",p_scope:"operator"});
 await requestIntentStaffReader({rpc},false).get(receipt.requestId,"verified-actor","operator");
 expect(rpc.mock.calls[1][0]).toBe("request_intent_operator_get");
});

function preparationQuery():RequestIntentPreparationQuery {
 return {ownerHash:"a".repeat(64),attemptHash:"b".repeat(64),fingerprint:"c".repeat(64),
  snapshot:{lines:[{productId:"fixture-product",variantId:"fixture-variant",sourceVariantId:"source-fixture",productName:"Synthetic",specification:null,
   family:"research_peptides_materials",workflowMode:"request_pricing",quantity:1,researchUseOnly:true,clinicalReviewRequired:false,
   sourceDisplayState:"request_access",sourceVariantDisplayState:"request_access",sourceRefusal:null,catalogVersion:"fixture",reviewState:"pending"}],
   agreements:[{kind:"fixture-terms",version:"fixture-v1",accepted:true,acceptedAt:"2026-11-19T12:00:00.000000Z"}]},
  admissionKey:{ownerBinding:"d".repeat(64),policyRevision:"e".repeat(64)},referralRevision:null,notAfter:"2026-11-19T12:03:00.000000Z"};
}
function preparationMetadata(query=preparationQuery()) {
 return {protocol:REQUEST_INTENT_PREPARATION_PROTOCOL,snapshotSha256:"f".repeat(64),issuedAt:"2026-11-19T12:00:00.000001Z",
  expiresAt:"2026-11-19T12:01:00.123456Z",admissionExpiresAt:"2026-11-19T12:02:00.654321Z",admissionPolicyRevision:query.admissionKey.policyRevision,
  ...(query.referralRevision?{referralRevision:query.referralRevision}:{})};
}
it("calls only the canonical read RPC with exact server-derived keys and preserves DB microseconds",async()=>{
 const query=preparationQuery(),data=preparationMetadata(query);
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data,error:null}));
 expect(await requestIntentPreparationMetadataReader({rpc})(query)).toEqual(data);
 expect(rpc).toHaveBeenCalledExactlyOnceWith("request_intent_fixture_prepare_metadata",{
  p_owner_hash:query.ownerHash,p_attempt_hash:query.attemptHash,p_fingerprint:query.fingerprint,
  p_snapshot:query.snapshot,p_admission_key:query.admissionKey,p_referral_revision:null,p_prepare_not_after:query.notAfter,
 });
 expect(preparationInstant("2026-11-19T12:01:00.123456Z")-preparationInstant("2026-11-19T12:01:00.123455Z")).toBe(1n);
});
it("requires the exact current v4 child revision and keeps it optional only for v3",async()=>{
 const query={...preparationQuery(),referralRevision:receipt.requestId},data=preparationMetadata(query);
 const rpc=vi.fn(async()=>({data,error:null}));
 expect(await requestIntentPreparationMetadataReader({rpc})(query)).toEqual(data);
 const without={...data};delete without.referralRevision;
 await expect(requestIntentPreparationMetadataReader({rpc:async()=>({data:without,error:null})})(query)).rejects.toMatchObject({code:"request_preparation_unavailable"});
 await expect(requestIntentPreparationMetadataReader({rpc:async()=>({data,error:null})})(preparationQuery())).rejects.toMatchObject({code:"request_preparation_unavailable"});
});
it.each([
 {protocol:"unrecognized"},{snapshotSha256:"F".repeat(64)},{admissionPolicyRevision:"a".repeat(64)},
 {issuedAt:"infinity"},{issuedAt:"2026-02-30T12:00:00Z"},{issuedAt:"2026-11-19T12:01:00.123456Z"},
 {expiresAt:"2026-11-19T12:02:00.654322Z"},{expiresAt:"2026-11-19T12:05:00Z"},
 {admissionExpiresAt:"2026-11-19T12:01:00.123455Z"},{referralRevision:receipt.requestId},
 {contact:"must-not-echo"},
])("refuses malformed, unordered, mismatched or extra metadata %#",async change=>{
 const query=preparationQuery();
 const rpc=async()=>({data:{...preparationMetadata(query),...change},error:null});
 await expect(requestIntentPreparationMetadataReader({rpc})(query)).rejects.toMatchObject({code:"request_preparation_unavailable",message:"request_preparation_unavailable"});
});
it("rejects an expiry even one microsecond past the approved server bound",async()=>{
 const query={...preparationQuery(),notAfter:"2026-11-19T12:01:00.123455Z"};
 const rpc=async()=>({data:preparationMetadata(query),error:null});
 await expect(requestIntentPreparationMetadataReader({rpc})(query)).rejects.toMatchObject({code:"request_preparation_unavailable"});
});
it("does not invoke RPC for malformed private arguments and does not expose provider failure",async()=>{
 const rpc=vi.fn(async()=>({data:null,error:{code:"P0001",message:"private SQL statement or submitted value"}}));
 await expect(requestIntentPreparationMetadataReader({rpc})({...preparationQuery(),ownerHash:"forged"})).rejects.toMatchObject({code:"request_preparation_unavailable"});
 expect(rpc).not.toHaveBeenCalled();
 await expect(requestIntentPreparationMetadataReader({rpc})(preparationQuery())).rejects.toMatchObject({message:"request_preparation_unavailable",status:503});
 expect(rpc).toHaveBeenCalledTimes(1);
});

const serverReferral={kind:"guest_touch" as const,touchId:"abcdef12-3456-4abc-8def-123456789abc",subjectKeyHash:"e".repeat(64),claimExpiresAt:1_800_000_000_000};
const referralWriters:Array<[string,unknown]>=[
 ["request_intent_create_or_replay",undefined],
 ["request_intent_create_with_context",{goal:"compare_options"}],
 ["request_intent_create_with_referral",{referralChoice:{mode:"omit"}}],
];
function referralRecord(optionalIntake:unknown,withLocator:boolean):CreateIntent{
 return {ownerHash:"b".repeat(64),attemptHash:"c".repeat(64),fingerprint:"a".repeat(64),
  detail:{...receipt,contact:{},agreements:[],lines:[],...(optionalIntake?{optionalIntake}:{})},
  ...(withLocator?{serverReferral}:{})} as CreateIntent;
}
it.each(referralWriters)("R1/R2/R3 %s: no locator keeps the exact payload; a locator adds only p_detail._serverReferral",async(name,optionalIntake)=>{
 const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt,fingerprint:"a".repeat(64)},error:null}));
 await requestIntentRepository({rpc}).createOrReplay(referralRecord(optionalIntake,false));
 await requestIntentRepository({rpc}).createOrReplay(referralRecord(optionalIntake,true));
 const [[plainName,plain],[locatedName,located]]=rpc.mock.calls;
 expect(plainName).toBe(name);expect(locatedName).toBe(name);
 // R1: absent means byte-identical to the earlier payload, with no new key anywhere.
 expect(JSON.stringify(plain)).not.toContain("_serverReferral");
 expect(Object.keys(plain.p_detail as object)).not.toContain("_serverReferral");
 // R2: present means exactly one added detail key, carrying the locator unchanged.
 const {_serverReferral,...rest}=located.p_detail as Record<string,unknown>;
 expect(_serverReferral).toEqual(serverReferral);
 expect(rest).toEqual(plain.p_detail);
 // R3: every other argument, including the reported context, is untouched.
 expect({...located,p_detail:undefined}).toEqual({...plain,p_detail:undefined});
 expect(Object.keys(located).sort()).toEqual(Object.keys(plain).sort());
});

function queueItem(n: number) {
 const requestId = `a1000000-0000-4000-8000-${n.toString(16).padStart(12,"0")}`;
 return {...receipt,requestId,publicReference:"XRI-"+requestId.replaceAll("-","").toUpperCase(),lineCount:n%3+1};
}

it.each([undefined,"operator"] as const)("walks all 53 saved receipts with their original clocks through the %s list RPC",async scope=>{
 const saved=Array.from({length:53},(_,i)=>queueItem(i+1));
 const rpc=vi.fn(async(_name:string,args:Record<string,unknown>)=>{
  const page=args.p_page as number;
  return {data:{items:saved.slice((page-1)*25,page*25),total:saved.length,page,pageSize:25},error:null};
 });
 const reader=requestIntentStaffReader({rpc}),seen=[];
 for(const page of [1,2,3]){
  const result=await reader.list("verified-actor",page,scope);
  expect(result).toMatchObject({total:53,page,pageSize:25});
  seen.push(...result.items);
 }
 expect(seen).toEqual(saved);
 expect(new Set(seen.map(row=>row.requestId)).size).toBe(53);
 expect(seen.every(row=>row.createdAt===receipt.createdAt&&row.status==="pending_review")).toBe(true);
 expect(rpc.mock.calls).toEqual([1,2,3].map(p_page=>[
  scope==="operator"?"request_intent_operator_list":"request_intent_staff_list",{p_actor_user_id:"verified-actor",p_page},
 ]));
});

const malformedQueuePages = [
 {page:undefined},{page:2},{pageSize:undefined},{pageSize:10},{total:-1},{total:0},
 {items:Array.from({length:26},(_,i)=>queueItem(i+1)),total:26},
 {items:[queueItem(1),queueItem(1)],total:2},
 {items:[{...queueItem(1),lineCount:-1}]},
 {items:[{...queueItem(1),lineCount:1.5}]},
 {items:[{...queueItem(1),lineCount:"2"}]},
 {items:[{...queueItem(1),requestId:"not-a-request-id"}]},
 {items:[{...queueItem(1),publicReference:queueItem(2).publicReference}]},
];
it.each(malformedQueuePages)("refuses malformed or mismatched queue metadata without inventing an inbox %#",async change=>{
 const rpc=vi.fn(async()=>({data:{items:[queueItem(1)],total:1,page:1,pageSize:25,...change},error:null}));
 await expect(requestIntentStaffReader({rpc}).list("verified-actor",1)).rejects.toMatchObject({code:"invalid_persistence_result",status:503});
 expect(rpc).toHaveBeenCalledExactlyOnceWith("request_intent_staff_list",{p_actor_user_id:"verified-actor",p_page:1});
});

it.each([undefined,"operator"] as const)("refuses another record returned for the selected request through the %s reader",async scope=>{
 const selected=queueItem(1),other=queueItem(2);
 const rpc=vi.fn(async()=>({data:{...other,contact:{},agreements:[],lines:[]},error:null}));
 await expect(requestIntentStaffReader({rpc}).get(selected.requestId,"verified-actor",scope))
  .rejects.toMatchObject({code:"invalid_persistence_result",status:503});
});

it("preserves an exact detail and null outcome, accepting equivalent UUID casing without changing the receipt clock",async()=>{
 const selected=queueItem(1),data={...selected,contact:{},agreements:[],lines:[]};
 const rpc=vi.fn().mockResolvedValueOnce({data,error:null}).mockResolvedValueOnce({data:null,error:null});
 const reader=requestIntentStaffReader({rpc});
 expect(await reader.get(selected.requestId.toUpperCase(),"verified-actor"))
  .toEqual({...receipt,requestId:selected.requestId,publicReference:selected.publicReference,contact:{},agreements:[],lines:[]});
 expect(await reader.get(selected.requestId,"verified-actor")).toBeNull();
});
