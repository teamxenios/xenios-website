import {expect,it,vi} from "vitest";
import {createCatalogAdmissionApi} from "./catalog-admission-api";
const revision="10000000-0000-4000-8000-000000000001",policyRevision="a".repeat(64);
it("transmits the optional normalized name and keeps status free of PII",async()=>{
 const transport=vi.fn(async()=>new Response(JSON.stringify({admitted:true,policyRevision,referralRevision:revision,referralName:"hidden",email:"hidden"})));
 const api=createCatalogAdmissionApi(()=>"fixture-token",transport),signal=new AbortController().signal;
 expect(await api.status(signal)).toEqual({admitted:true,policyRevision,referralRevision:revision});
 await api.record({fullLegalName:"Fixture",email:"fixture@example.invalid",postalAddress:{line1:"1 Fixture",city:"Fixture",countryCode:"HK"},policyRevision,referralName:"Jane Smith"},signal);
 expect(JSON.parse(transport.mock.calls[1][1].body as string)).toMatchObject({referralName:"Jane Smith"});
 expect(transport.mock.calls[1][1]).toMatchObject({credentials:"include",cache:"no-store",signal});
});
it("refuses malformed opaque row identity",async()=>{
 const api=createCatalogAdmissionApi(()=>null,async()=>new Response(JSON.stringify({admitted:true,policyRevision,referralRevision:"not-an-id"})));
 await expect(api.status(new AbortController().signal)).rejects.toThrow();
});
