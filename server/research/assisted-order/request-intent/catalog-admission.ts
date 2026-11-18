import { AssistedOrderValidationError, normalizeEmail, normalizeRequiredText } from "../../../../shared/research/assisted-order/contract";
import { exactObject } from "../../../../shared/research/assisted-order/request-intent";
import { isCatalogCountryCode, requiresRegionAndPostcode, type CatalogPostalAddress } from "../../../../shared/research/assisted-order/admission-address";
import type { AssistedOrderHasher, AssistedOrderLegalPort } from "../ports";
import { normalizeDeclaredReferralInput, type DeclaredReferralInput } from "../../../../shared/research/assisted-order/request-intent/referral-input";

/** Private owner-supplied custody. Keys are computed solely from resolved identities/policy.
 * saveFirst must be atomic and idempotent for the same normalized facts, must not overwrite
 * someone else's record, and may return success only after the private transaction commits. */
export type ContactAdmissionCustody = Readonly<{
  present(key: ContactAdmissionKey): Promise<boolean>;
  referralStatus?(key: ContactAdmissionKey): Promise<Readonly<{ admitted: boolean; referralRevision?: string }>>;
  saveFirst(key: ContactAdmissionKey, contact: Readonly<{ fullLegalName: string; email: string; postalAddress: CatalogPostalAddress } & DeclaredReferralInput>):
    Promise<"committed" | "already_same" | "different_contact">;
}>;
export type ContactAdmissionKey = Readonly<{ ownerBinding: string; policyRevision: string }>;
export class CatalogAdmissionFailure extends Error {
  constructor(readonly code: string, readonly status: 400|403|409|503) { super(code); }
}
const offline = () => new CatalogAdmissionFailure("catalog_admission_unavailable",503);
const controls = /[\u0000-\u001f\u007f-\u009f\u2028\u2029]/u;
const invalid = () => new AssistedOrderValidationError("admission","Check the required name and email.");
function normalizePostalAddress(raw: unknown): CatalogPostalAddress {
  const fields = exactObject(raw, ["line1", "line2", "city", "region", "postalCode", "countryCode"], "postalAddress");

  function text(key: string, max: number, required: true): string;
  function text(key: string, max: number, required: boolean): string | undefined;
  function text(key: string, max: number, required: boolean) {
    const value = fields[key];
    if (!required && (value === undefined || value === "")) return undefined;
    if (typeof value !== "string" || controls.test(value)) {
      throw new AssistedOrderValidationError("postalAddress", "Check the postal address.");
    }
    return normalizeRequiredText(key, value.normalize("NFC"), max);
  }

  const countryCode = text("countryCode", 2, true).toUpperCase();
  if (!isCatalogCountryCode(countryCode)) {
    throw new AssistedOrderValidationError("postalAddress", "Choose a listed country or territory.");
  }
  const regional = requiresRegionAndPostcode(countryCode);
  const line2 = text("line2", 200, false);
  const region = text("region", 120, regional);
  const postalCode = text("postalCode", 40, regional);
  return {
    line1: text("line1", 200, true), city: text("city", 120, true), countryCode,
    ...(line2 && { line2 }), ...(region && { region }), ...(postalCode && { postalCode }),
  };
}

function normalize(raw: unknown) {
  const r=exactObject(raw,["fullLegalName","email","policyRevision","postalAddress","referralName","referralCode"],"admission");
  if(typeof r.fullLegalName!=="string"||typeof r.email!=="string"||controls.test(r.fullLegalName)||controls.test(r.email)) throw invalid();
  const fullLegalName = normalizeRequiredText("fullLegalName",r.fullLegalName,200).normalize("NFC").replace(/\s+/gu," ");
  const email = normalizeEmail(normalizeRequiredText("email",r.email,254));
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)||typeof r.policyRevision!=="string"||!/^[a-f0-9]{64}$/.test(r.policyRevision)) throw invalid();
  let referral;
  try { referral=normalizeDeclaredReferralInput({referralName:r.referralName,referralCode:r.referralCode}); }
  catch { throw new AssistedOrderValidationError("referral", "Check the optional referral name or code, or leave it empty."); }
  return {fullLegalName,email,postalAddress:normalizePostalAddress(r.postalAddress),revision:r.policyRevision,...referral};
}
export function makeCatalogAdmission(legal: AssistedOrderLegalPort, hasher: AssistedOrderHasher, custody: ContactAdmissionCustody|null, retentionSeconds?: number, referralEnabled=false) {
  const publicRetention = retentionSeconds === undefined ? {} : { retentionSeconds };
  async function key(ownerHash: string, sessionHash: string|null): Promise<ContactAdmissionKey> {
    if(!/^[a-f0-9]{64}$/.test(ownerHash)||!sessionHash)throw new CatalogAdmissionFailure("catalog_admission_required",403);
    let pairs;try {pairs=await legal.requiredAgreements()} catch {throw offline()}
    if(!Array.isArray(pairs)||!pairs.length||pairs.some(p=>!p||typeof p.kind!=="string"||typeof p.version!=="string"||!p.kind.trim()||!p.version.trim()||p.kind.startsWith("assisted_order_form_v1:"))) throw offline();
    const normalized=pairs.map(({kind,version})=>[kind,version]).sort(([k,v],[a,b])=>k<a?-1:k>a?1:v<b?-1:v>b?1:0);
    if(new Set(normalized.map(([k])=>k)).size!==normalized.length)throw offline();
    const ownerBinding=hasher.stableHash(["ea-intake-owner/v1",ownerHash,sessionHash]);
    // Non-bearer challenge binds a still-open form to the actual viewer too.
    return {ownerBinding,policyRevision:hasher.stableHash([referralEnabled?"ea-contact-before-catalog/v4-referral":"ea-contact-before-catalog/v3",ownerBinding,normalized])};
  }
  async function status(ownerHash:string,sessionHash:string|null) {
    const k=await key(ownerHash,sessionHash);let admitted;let referralRevision;
    try {
      if(referralEnabled&&custody?.referralStatus) ({admitted,referralRevision}=await custody.referralStatus(k));
      else admitted=await custody?.present(k);
    } catch {throw offline()}
    if(typeof admitted!=="boolean")throw offline();
    if(referralRevision!==undefined && (typeof referralRevision!=="string"||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(referralRevision)))throw offline();
    return {admitted,policyRevision:k.policyRevision,...publicRetention,...(referralEnabled?{referralEnabled:true}:{}),...(admitted&&referralRevision?{referralRevision}: {})};
  }
  return {
    status,
    referralEnabled,
    /** Non-bearer key derived only from the resolved owner and current legal authority. */
    key,
    async require(ownerHash:string,sessionHash:string|null) {
      if(!(await status(ownerHash,sessionHash)).admitted)throw new CatalogAdmissionFailure("catalog_admission_required",403);
    },
    async capture(ownerHash:string,sessionHash:string|null,raw:unknown) {
      const c=normalize(raw);const k=await key(ownerHash,sessionHash);
      if(!referralEnabled&&(c.referralName||c.referralCode))throw new CatalogAdmissionFailure("catalog_referral_unavailable",400);
      if(c.revision!==k.policyRevision)throw new CatalogAdmissionFailure("catalog_admission_policy_changed",409);
      let outcome;try{outcome=await custody?.saveFirst(k,{fullLegalName:c.fullLegalName,email:c.email,postalAddress:c.postalAddress,
        ...(c.referralName?{referralName:c.referralName}:{}),...(c.referralCode?{referralCode:c.referralCode}:{})})}catch{throw offline()}
      if(outcome==="different_contact")throw new CatalogAdmissionFailure("catalog_admission_contact_conflict",409);
      if(outcome!=="committed"&&outcome!=="already_same")throw offline();
      return referralEnabled&&custody?.referralStatus ? status(ownerHash,sessionHash) : {admitted:true,policyRevision:k.policyRevision,...publicRetention,...(referralEnabled?{referralEnabled:true}:{})};
    },
  };
}
export type CatalogAdmission = ReturnType<typeof makeCatalogAdmission>;
