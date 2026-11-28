/** Place beside catalog-admission.ts in the website. Server-only. No email lookup, PII read, or public credential. */
import type {ContactAdmissionCustody} from "./catalog-admission";
import type {RequestIntentRpcClient} from "./rpc-repository";
export function privateContactAdmissionRpc(client: RequestIntentRpcClient, retentionSeconds: number, referralEnabled=false): ContactAdmissionCustody {
  if(!Number.isInteger(retentionSeconds)||retentionSeconds<60||retentionSeconds>86_400) throw new Error("private_contact_retention_required");
  return {
    async present({ownerBinding,policyRevision}){
      if(!referralEnabled) {
        const r=await client.rpc("request_intent_catalog_address_has",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision});
        if(r.error||typeof r.data!=="boolean")throw new Error("private_contact_unavailable");
        return r.data;
      }
      return (await this.referralStatus!({ownerBinding,policyRevision})).admitted;
    },
    async referralStatus({ownerBinding,policyRevision}){
      const r=await client.rpc("request_intent_catalog_referral_status",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision});
      const row=r.data as {admitted?:unknown;referralRevision?:unknown}|null;
      if(r.error||!row||typeof row.admitted!=="boolean"||(row.admitted && (typeof row.referralRevision!=="string"
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(row.referralRevision))))throw new Error("private_contact_unavailable");
      return {admitted:row.admitted,...(row.admitted?{referralRevision:row.referralRevision as string}:{})};
    },
    async saveFirst({ownerBinding,policyRevision},{fullLegalName,email,postalAddress,referralName,referralCode}){
      if(!referralEnabled) {
        if(referralName||referralCode)throw new Error("private_contact_unavailable");
        const r=await client.rpc("request_intent_catalog_address_put",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision,p_full_legal_name:fullLegalName,p_email:email,p_postal_address:postalAddress,p_ttl_seconds:retentionSeconds});
        if(r.error||!(r.data==="committed"||r.data==="already_same"||r.data==="different_contact"))throw new Error("private_contact_unavailable");
        return r.data;
      }
      const r=await client.rpc("request_intent_catalog_referral_put",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision,p_full_legal_name:fullLegalName,p_email:email,p_postal_address:postalAddress,p_ttl_seconds:retentionSeconds,
        p_referral:{...(referralName?{referralName}:{}),...(referralCode?{referralCode}:{})}});
      if(r.error||!(r.data==="committed"||r.data==="already_same"||r.data==="different_contact"))throw new Error("private_contact_unavailable");
      return r.data;
    },
  };
}
