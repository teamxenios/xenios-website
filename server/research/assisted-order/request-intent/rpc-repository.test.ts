import {expect,it,vi} from "vitest";
import {requestIntentRepository,requestIntentStaffReader} from "./rpc-repository";
import type {CreateIntent} from "./service";
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
