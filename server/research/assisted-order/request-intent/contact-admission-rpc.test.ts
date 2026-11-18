import {expect,it,vi} from "vitest";
import {privateContactAdmissionRpc} from "./contact-admission-rpc";
const key={ownerBinding:"a".repeat(64),policyRevision:"b".repeat(64)},revision="10000000-0000-4000-8000-000000000001";
it("uses only the versioned atomic RPC and whitelists status metadata",async()=>{
 const rpc=vi.fn(async(name:string)=>({data:name.endsWith("status")?{admitted:true,referralRevision:revision,referralName:"must not echo"}:"committed",error:null}));
 const custody=privateContactAdmissionRpc({rpc},7200,true);
 expect(await custody.referralStatus!(key)).toEqual({admitted:true,referralRevision:revision});
 await custody.saveFirst(key,{fullLegalName:"Fixture",email:"fixture@example.invalid",postalAddress:{line1:"1 Fixture",city:"Fixture",countryCode:"HK"},referralName:"Jane Smith"});
 expect(rpc.mock.calls[1]).toEqual(["request_intent_catalog_referral_put",expect.objectContaining({p_referral:{referralName:"Jane Smith"},p_ttl_seconds:7200})]);
});
it("fails closed on unavailable or malformed standing and never falls back to old custody",async()=>{
 const rpc=vi.fn(async()=>({data:{admitted:true},error:null}));
 await expect(privateContactAdmissionRpc({rpc},7200,true).present(key)).rejects.toThrow("private_contact_unavailable");
 expect(rpc).toHaveBeenCalledTimes(1);
 expect(()=>privateContactAdmissionRpc({rpc},0)).toThrow();
});
