/** Place beside catalog-admission.ts in the website. Server-only. No email lookup, PII read, or public credential. */
import type {ContactAdmissionCustody} from "./catalog-admission";
import type {RequestIntentRpcClient} from "./rpc-repository";
export function privateContactAdmissionRpc(client: RequestIntentRpcClient, retentionSeconds: number): ContactAdmissionCustody {
  if(!Number.isInteger(retentionSeconds)||retentionSeconds<60||retentionSeconds>86_400) throw new Error("private_contact_retention_required");
  return {
    async present({ownerBinding,policyRevision}){
      const r=await client.rpc("request_intent_catalog_contact_has",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision});
      if(r.error||typeof r.data!=="boolean")throw new Error("private_contact_unavailable");
      return r.data;
    },
    async saveFirst({ownerBinding,policyRevision},{fullLegalName,email}){
      const r=await client.rpc("request_intent_catalog_contact_put",{p_owner_binding:ownerBinding,p_policy_revision:policyRevision,p_full_legal_name:fullLegalName,p_email:email,p_ttl_seconds:retentionSeconds});
      if(r.error||!(r.data==="committed"||r.data==="already_same"||r.data==="different_contact"))throw new Error("private_contact_unavailable");
      return r.data;
    },
  };
}
