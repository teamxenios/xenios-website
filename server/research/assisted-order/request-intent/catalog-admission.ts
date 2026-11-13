import { AssistedOrderValidationError, normalizeEmail, normalizeRequiredText } from "../../../../shared/research/assisted-order/contract";
import { exactObject } from "../../../../shared/research/assisted-order/request-intent";
import type { AssistedOrderHasher, AssistedOrderLegalPort } from "../ports";

/** Private owner-supplied custody. Keys are computed solely from resolved identities/policy.
 * saveFirst must be atomic and idempotent for the same normalized facts, must not overwrite
 * someone else's record, and may return success only after the private transaction commits. */
export type ContactAdmissionCustody = Readonly<{
  present(key: ContactAdmissionKey): Promise<boolean>;
  saveFirst(key: ContactAdmissionKey, contact: Readonly<{ fullLegalName: string; email: string }>):
    Promise<"committed" | "already_same" | "different_contact">;
}>;
export type ContactAdmissionKey = Readonly<{ ownerBinding: string; policyRevision: string }>;
export class CatalogAdmissionFailure extends Error {
  constructor(readonly code: string, readonly status: 400|403|409|503) { super(code); }
}
const offline = () => new CatalogAdmissionFailure("catalog_admission_unavailable",503);
const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const invalid = () => new AssistedOrderValidationError("admission","Check the required name and email.");
function normalize(raw: unknown) {
  const r=exactObject(raw,["fullLegalName","email","policyRevision"],"admission");
  if(typeof r.fullLegalName!=="string"||typeof r.email!=="string"||controls.test(r.fullLegalName)||controls.test(r.email)) throw invalid();
  const fullLegalName = normalizeRequiredText("fullLegalName",r.fullLegalName,200).normalize("NFC").replace(/\s+/gu," ");
  const email = normalizeEmail(normalizeRequiredText("email",r.email,254));
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)||typeof r.policyRevision!=="string"||!/^[a-f0-9]{64}$/.test(r.policyRevision)) throw invalid();
  return {fullLegalName,email,revision:r.policyRevision};
}
export function makeCatalogAdmission(legal: AssistedOrderLegalPort, hasher: AssistedOrderHasher, custody: ContactAdmissionCustody|null) {
  async function key(ownerHash: string, sessionHash: string|null): Promise<ContactAdmissionKey> {
    if(!/^[a-f0-9]{64}$/.test(ownerHash)||!sessionHash)throw new CatalogAdmissionFailure("catalog_admission_required",403);
    let pairs;try {pairs=await legal.requiredAgreements()} catch {throw offline()}
    if(!Array.isArray(pairs)||!pairs.length||pairs.some(p=>!p||typeof p.kind!=="string"||typeof p.version!=="string"||!p.kind.trim()||!p.version.trim()||p.kind.startsWith("assisted_order_form_v1:"))) throw offline();
    const normalized=pairs.map(({kind,version})=>[kind,version]).sort(([k,v],[a,b])=>k<a?-1:k>a?1:v<b?-1:v>b?1:0);
    if(new Set(normalized.map(([k])=>k)).size!==normalized.length)throw offline();
    const ownerBinding=hasher.stableHash(["ea-intake-owner/v1",ownerHash,sessionHash]);
    // Non-bearer challenge binds a still-open form to the actual viewer too.
    return {ownerBinding,policyRevision:hasher.stableHash(["ea-contact-before-catalog/v2",ownerBinding,normalized])};
  }
  async function status(ownerHash:string,sessionHash:string|null) {
    const k=await key(ownerHash,sessionHash);let admitted;
    try {admitted=await custody?.present(k)} catch {throw offline()}
    if(typeof admitted!=="boolean")throw offline();
    return {admitted,policyRevision:k.policyRevision};
  }
  return {
    status,
    async require(ownerHash:string,sessionHash:string|null) {
      if(!(await status(ownerHash,sessionHash)).admitted)throw new CatalogAdmissionFailure("catalog_admission_required",403);
    },
    async capture(ownerHash:string,sessionHash:string|null,raw:unknown) {
      const c=normalize(raw);const k=await key(ownerHash,sessionHash);
      if(c.revision!==k.policyRevision)throw new CatalogAdmissionFailure("catalog_admission_policy_changed",409);
      let outcome;try{outcome=await custody?.saveFirst(k,{fullLegalName:c.fullLegalName,email:c.email})}catch{throw offline()}
      if(outcome==="different_contact")throw new CatalogAdmissionFailure("catalog_admission_contact_conflict",409);
      if(outcome!=="committed"&&outcome!=="already_same")throw offline();
      return {admitted:true,policyRevision:k.policyRevision};
    },
  };
}
export type CatalogAdmission = ReturnType<typeof makeCatalogAdmission>;
