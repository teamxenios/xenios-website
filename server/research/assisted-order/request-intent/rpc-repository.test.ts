import {describe,expect,it,vi} from "vitest";
import {requestIntentRepository,requestIntentStaffReader,requestIntentPreparationMetadataReader} from "./rpc-repository";
import {REQUEST_INTENT_PREPARATION_PROTOCOL,preparationInstant,type CreateIntent,type RequestIntentPreparationQuery} from "./service";
import type {RequestReferralSource} from "./referral-source";
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

describe("private native referral carrier on the unchanged canonical RPCs",()=>{
 function record():CreateIntent {
  return {ownerHash:"b".repeat(64),attemptHash:"c".repeat(64),fingerprint:"a".repeat(64),
   detail:{...receipt,contact:{},agreements:[],lines:[]}} as CreateIntent;
 }
 it("omits the reserved key entirely while off, including a forged detail field",async()=>{
  const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt,fingerprint:"a".repeat(64)},error:null}));
  const ordinary=record(),forged={...ordinary,detail:{...ordinary.detail,_serverReferral:{kind:"account",actorAuthUserId:receipt.requestId}}};
  await requestIntentRepository({rpc}).createOrReplay(forged);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("request_intent_create_or_replay",{
   p_owner_hash:ordinary.ownerHash,p_attempt_hash:ordinary.attemptHash,p_fingerprint:ordinary.fingerprint,p_detail:ordinary.detail});
  expect(rpc.mock.calls[0][1].p_detail).not.toHaveProperty("_serverReferral");
 });
 it.each(["ordinary","context","reported"] as const)("adds only the separate server locator to the existing %s writer",async mode=>{
  const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt:{...receipt,_serverReferral:{private:true}},fingerprint:"a".repeat(64)},error:null}));
  const base=record(),source:RequestReferralSource={kind:"guest_touch",touchId:receipt.requestId,subjectKeyHash:"d".repeat(64),claimExpiresAt:1_795_100_045_001};
  const optionalIntake=mode==="context"?{goal:"compare_options" as const,referralCode:"REPORTED"}
   :mode==="reported"?{referralChoice:{mode:"omit" as const}}:undefined;
  const input:CreateIntent={...base,referralSource:source,detail:{...base.detail,...(optionalIntake?{optionalIntake}:{})}};
  expect(await requestIntentRepository({rpc}).createOrReplay(input)).toEqual({receipt,fingerprint:input.fingerprint});
  const expectedName=mode==="ordinary"?"request_intent_create_or_replay":mode==="context"?"request_intent_create_with_context":"request_intent_create_with_referral";
  expect(rpc).toHaveBeenCalledExactlyOnceWith(expectedName,{
   p_owner_hash:input.ownerHash,p_attempt_hash:input.attemptHash,p_fingerprint:input.fingerprint,
   p_detail:{...base.detail,_serverReferral:source},...(optionalIntake?{p_context:optionalIntake}:{}),...(mode==="reported"?{p_admission:null}:{})});
  expect(rpc.mock.calls[0][1].p_detail).not.toHaveProperty("optionalIntake");
  expect((rpc.mock.calls[0][1].p_detail as Record<string,unknown>)._serverReferral).not.toBe(source);
 });
 it("never passes a supplied partner/eligibility decision even from a malformed server record",async()=>{
  const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:{receipt,fingerprint:"a".repeat(64)},error:null}));
  await requestIntentRepository({rpc}).createOrReplay({...record(),referralSource:{kind:"account",actorAuthUserId:receipt.requestId,partnerId:receipt.requestId} as RequestReferralSource});
  expect((rpc.mock.calls[0][1].p_detail as Record<string,unknown>)._serverReferral).toEqual({kind:"unavailable",reason:"invalid_source"});
 });
 it("keeps uncertain native failures uncertain and never retries another writer",async()=>{
  const rpc=vi.fn(async(_name:string,_args:Record<string,unknown>)=>({data:null,error:{code:"40P01",message:"private deadlock diagnostic"}}));
  await expect(requestIntentRepository({rpc}).createOrReplay({...record(),referralSource:{kind:"no_supported_touch"}}))
   .rejects.toMatchObject({code:"request_intent_persistence_uncertain",status:503});
  expect(rpc).toHaveBeenCalledTimes(1);
 });
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
