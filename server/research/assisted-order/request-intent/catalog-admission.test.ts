import {expect,it,vi} from "vitest";
import {makeCatalogAdmission} from "./catalog-admission";
import {sha256AssistedOrderHasher as hasher} from "../defaults";
const legal={requiredAgreements:async()=>[{kind:"fixture",version:"v1"}]};
const owner="a".repeat(64),session="fixture-session",revision="10000000-0000-4000-8000-000000000001";
const contact={fullLegalName:"Synthetic Visitor",email:"fixture@example.invalid",postalAddress:{line1:"1 Fixture St",city:"Fixture",countryCode:"HK"}};
it("normalizes the optional name before atomic custody and returns standing metadata only",async()=>{
 const saveFirst=vi.fn(async()=>"committed" as const);
 const gate=makeCatalogAdmission(legal,hasher,{present:async()=>true,referralStatus:async()=>({admitted:true,referralRevision:revision}),saveFirst},7200,true);
 const standing=await gate.status(owner,session);
 const result=await gate.capture(owner,session,{...contact,policyRevision:standing.policyRevision,referralName:" Jane  O’Neill "});
 expect(saveFirst).toHaveBeenCalledWith(await gate.key(owner,session),{...contact,referralName:"Jane O’Neill"});
 expect(result).toEqual({admitted:true,policyRevision:standing.policyRevision,retentionSeconds:7200,referralEnabled:true,referralRevision:revision});
 expect(JSON.stringify(result)).not.toMatch(/Jane|Synthetic|@|postal/);
});
it("derives different private keys for another owner/session or policy",async()=>{
 const gate=makeCatalogAdmission(legal,hasher,null);
 expect(await gate.key(owner,session)).not.toEqual(await gate.key("b".repeat(64),session));
 expect(await gate.key(owner,session)).not.toEqual(await gate.key(owner,"other"));
 await expect(gate.key(owner,null)).rejects.toMatchObject({status:403});
});
it.each([{referralName:"x".repeat(81)},{referralName:"A\nB"},{referralName:"Sam",aeId:revision}])("refuses invalid or authority fields before storage %#",async(extra)=>{
 const saveFirst=vi.fn(),gate=makeCatalogAdmission(legal,hasher,{present:async()=>false,saveFirst});
 const key=await gate.key(owner,session);
 await expect(gate.capture(owner,session,{...contact,policyRevision:key.policyRevision,...extra})).rejects.toThrow();
 expect(saveFirst).not.toHaveBeenCalled();
});
it("does not admit failed/conflicting storage or stale policy",async()=>{
 const saveFirst=vi.fn(async()=>"different_contact" as const),gate=makeCatalogAdmission(legal,hasher,{present:async()=>false,saveFirst});
 const key=await gate.key(owner,session);
 await expect(gate.capture(owner,session,{...contact,policyRevision:key.policyRevision})).rejects.toMatchObject({status:409});
 await expect(gate.capture(owner,session,{...contact,policyRevision:"c".repeat(64)})).rejects.toMatchObject({code:"catalog_admission_policy_changed"});
});
