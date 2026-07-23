// ---------------------------------------------------------------------------
// Founding-membership activation: the provider-neutral payment-method registry.
//
// Phase A of the payments plan is a 14 day MANUAL EXTERNAL bridge: an admin
// configures methods (labels like Zelle, Cash App, Venmo, ACH) under the one
// category manual_external_payment, and members pay outside the platform. This
// module holds the domain types and pure logic for that registry. Phase B (Day
// 15) swaps to business methods via CONFIGURATION of the same registry, not by
// rewriting it, which is why every field is data rather than code.
//
// Non-negotiables enforced here in code, not by convention:
//   - Receiving instructions (the identifiers a member pays to) are ENCRYPTED
//     AT REST through an injected cipher seam. The plaintext exists only in
//     the admin's request and in the deliberate reveal call; it never lands on
//     the record, in a row, in a log, or in any serialized shape.
//   - A masked variant is derived SERVER-SIDE at write time and is served only
//     post-auth. Public and pre-auth shapes carry no instructions at all.
//   - product_eligible is false by default AND refused outright for
//     manual_external_payment: the bridge covers activation and membership
//     renewals only, never peptide commerce.
//   - Approval is never assumed. A method is created pending_review and cannot
//     take a new obligation until a named approver approves it.
//   - Nothing here may be labeled a merchant integration it is not (no method
//     may be called Apple Pay or Google Pay without a real integration, which
//     manual_external_payment is not).
//   - Every change writes an append-only method_versions row, so the registry
//     history is auditable and cannot be silently rewritten.
//
// Everything downstream sits behind the default-false flag
// RESEARCH_FOUNDING_ACTIVATION_ENABLED (wired by the surface wave; this module
// only defines the read).
// ---------------------------------------------------------------------------

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/** Default-false master flag. The surface wave wires it; nothing activates without it. */
export function foundingActivationEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.RESEARCH_FOUNDING_ACTIVATION_ENABLED === "true";
}

// ---------------------------------------------------------------------------
// The cipher seam
// ---------------------------------------------------------------------------

/**
 * The seam receiving instructions are encrypted through. Injected so tests use
 * a deterministic double and so a future KMS-backed cipher drops in without
 * touching the registry. The default is AES-256-GCM keyed from the environment
 * variable PAYMENT_INSTRUCTIONS_ENC_KEY (the NAME of the variable is the only
 * thing code knows; the key material itself never appears anywhere in code).
 */
export interface InstructionCipher {
  encrypt(plaintext: string): string;
  decrypt(ciphertext: string): string;
}

export class CipherNotConfigured extends Error {
  constructor() {
    super(
      "Payment instruction encryption is not configured. Set the environment variable " +
        "PAYMENT_INSTRUCTIONS_ENC_KEY. Receiving instructions are never stored without it.",
    );
    this.name = "CipherNotConfigured";
  }
}

export class CiphertextInvalid extends Error {
  constructor() {
    super("The stored receiving-instructions ciphertext is not in a recognized format.");
    this.name = "CiphertextInvalid";
  }
}

const CIPHERTEXT_PREFIX = "enc.v1";

/**
 * AES-256-GCM. The 32-byte key is derived from the configured secret via
 * SHA-256, so any sufficiently long random string works as key material.
 * Output format: enc.v1:<iv b64>:<tag b64>:<ciphertext b64>. A fresh random
 * 12-byte IV per encryption means equal plaintexts produce distinct
 * ciphertexts. GCM authenticates, so a tampered row fails decryption loudly.
 */
export function createAesGcmInstructionCipher(
  keyMaterial: string | undefined = process.env.PAYMENT_INSTRUCTIONS_ENC_KEY,
): InstructionCipher {
  if (!keyMaterial || keyMaterial.trim().length === 0) throw new CipherNotConfigured();
  const key = createHash("sha256").update(keyMaterial, "utf8").digest();

  return {
    encrypt(plaintext: string): string {
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return [CIPHERTEXT_PREFIX, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(":");
    },
    decrypt(ciphertext: string): string {
      const parts = ciphertext.split(":");
      if (parts.length !== 4 || parts[0] !== CIPHERTEXT_PREFIX) throw new CiphertextInvalid();
      const [, ivB64, tagB64, bodyB64] = parts;
      const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
      decipher.setAuthTag(Buffer.from(tagB64, "base64"));
      return Buffer.concat([decipher.update(Buffer.from(bodyB64, "base64")), decipher.final()]).toString("utf8");
    },
  };
}

/**
 * The server-side mask: four bullets plus the last two visible characters.
 * Enough for a member to confirm "this is the destination I paid" post-auth,
 * never enough to reconstruct the identifier. Derived once at write time from
 * the plaintext, so serving the mask never requires a decrypt.
 */
export function maskReceivingInstructions(plaintext: string): string {
  const compact = plaintext.replace(/\s+/g, "");
  if (compact.length === 0) return "";
  const tail = compact.slice(-2);
  return `••••${tail}`;
}

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** The one phase-A category. Phase B adds real merchant categories by config. */
export const MANUAL_EXTERNAL_PAYMENT = "manual_external_payment" as const;

export type PaymentMethodCategory = typeof MANUAL_EXTERNAL_PAYMENT;

export type MethodDuration = "temporary" | "permanent";

export type OwnershipClassification = "business" | "personal" | "third_party";

export type MethodApprovalStatus = "pending_review" | "approved" | "rejected" | "revoked";

export interface PaymentMethodRecord {
  methodId: string;
  /** Neutral code the admin chose, e.g. "zelle", "cash_app", "ach". Data, not code. */
  providerCode: string;
  category: PaymentMethodCategory;
  memberFacingName: string;
  adminFacingName: string;
  enabled: boolean;
  duration: MethodDuration;
  activeStartAt: string | null;
  activeEndAt: string | null;
  currency: string;
  activationEligible: boolean;
  renewalEligible: boolean;
  /** Always false for manual_external_payment; the bridge never buys product. */
  productEligible: boolean;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  /** Plain-language settlement expectation, e.g. "same day" or "1 to 3 business days". */
  settlementTime: string;
  receivingLegalEntity: string;
  ownershipClassification: OwnershipClassification;
  approvalStatus: MethodApprovalStatus;
  approvalDate: string | null;
  complianceReviewNote: string | null;
  approvedBy: string | null;
  /** Ciphertext only. The registry never holds or serializes the plaintext. */
  receivingInstructionsEncrypted: string;
  /** Derived server-side at write time; served only post-auth. */
  receivingInstructionsMasked: string;
  mobileInstructions: string | null;
  desktopInstructions: string | null;
  memoInstructions: string | null;
  deepLinkRef: string | null;
  /** Opaque media-provider ref for a QR asset. Never image bytes, never committed. */
  qrAssetRef: string | null;
  supportContactRef: string | null;
  disabledReason: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type MethodChangeKind = "created" | "approved" | "updated" | "disabled";

/** One append-only audit row per registry change. History is never rewritten. */
export interface MethodVersionRecord {
  versionId: string;
  methodId: string;
  version: number;
  changeKind: MethodChangeKind;
  changedBy: string;
  changedAt: string;
  /** The full record AFTER the change. Instructions inside are ciphertext only. */
  snapshot: PaymentMethodRecord;
}

export class PaymentMethodInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PaymentMethodInvalid";
  }
}

// Labels that imply a real merchant integration. A manual external bridge
// method must never wear one of these names.
const RESERVED_MERCHANT_LABELS = ["apple pay", "google pay", "applepay", "googlepay"];

function assertNotMerchantLabeled(input: { providerCode: string; memberFacingName: string; adminFacingName: string }): void {
  const haystacks = [input.providerCode, input.memberFacingName, input.adminFacingName].map((s) =>
    s.toLowerCase().replace(/[_-]+/g, " "),
  );
  for (const label of RESERVED_MERCHANT_LABELS) {
    const spaced = label.replace(/pay$/, " pay").trim();
    if (haystacks.some((h) => h.includes(label) || h.includes(spaced))) {
      throw new PaymentMethodInvalid(
        "A manual external method cannot be named after a merchant integration " +
          "(Apple Pay, Google Pay). Use the real provider name only when a real merchant integration exists.",
      );
    }
  }
}

export interface CreatePaymentMethodInput {
  methodId: string;
  providerCode: string;
  memberFacingName: string;
  adminFacingName: string;
  duration: MethodDuration;
  activeStartAt?: string | null;
  activeEndAt?: string | null;
  currency?: string;
  activationEligible: boolean;
  renewalEligible: boolean;
  productEligible?: boolean;
  minAmountCents?: number | null;
  maxAmountCents?: number | null;
  settlementTime: string;
  receivingLegalEntity: string;
  ownershipClassification: OwnershipClassification;
  complianceReviewNote?: string | null;
  /** Plaintext, encrypted immediately. Never stored, logged, or echoed back. */
  receivingInstructions: string;
  mobileInstructions?: string | null;
  desktopInstructions?: string | null;
  memoInstructions?: string | null;
  deepLinkRef?: string | null;
  qrAssetRef?: string | null;
  supportContactRef?: string | null;
}

/**
 * Build a new registry record plus its v1 audit row. The method arrives
 * DISABLED and pending_review: enablement is a consequence of a named
 * approver's approval, never of creation. Contractual approval of a rail is
 * never assumed.
 */
export function createPaymentMethod(
  input: CreatePaymentMethodInput,
  cipher: InstructionCipher,
  actorId: string,
  now: Date,
): { record: PaymentMethodRecord; version: MethodVersionRecord } {
  if (!input.methodId.trim()) throw new PaymentMethodInvalid("A payment method needs a methodId.");
  if (!input.providerCode.trim()) throw new PaymentMethodInvalid("A payment method needs a providerCode.");
  if (!input.memberFacingName.trim() || !input.adminFacingName.trim()) {
    throw new PaymentMethodInvalid("A payment method needs member-facing and admin-facing names.");
  }
  if (!actorId.trim()) throw new PaymentMethodInvalid("Creating a payment method requires a named actor.");
  if (!input.receivingInstructions.trim()) {
    throw new PaymentMethodInvalid("A payment method needs receiving instructions to encrypt.");
  }
  if (!input.settlementTime.trim()) throw new PaymentMethodInvalid("A payment method needs a settlement time.");
  if (!input.receivingLegalEntity.trim()) {
    throw new PaymentMethodInvalid("A payment method needs a receiving legal entity.");
  }
  if (input.productEligible === true) {
    throw new PaymentMethodInvalid(
      "A manual_external_payment method can never be product eligible. " +
        "The bridge covers activation and membership renewals only, never peptide commerce.",
    );
  }
  if (input.duration === "temporary" && !input.activeEndAt) {
    throw new PaymentMethodInvalid("A temporary method must carry an activeEndAt; that is what temporary means.");
  }
  const currency = (input.currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new PaymentMethodInvalid("Currency must be a three-letter ISO code.");
  }
  const min = input.minAmountCents ?? null;
  const max = input.maxAmountCents ?? null;
  if (min !== null && min < 0) throw new PaymentMethodInvalid("minAmountCents cannot be negative.");
  if (max !== null && max <= 0) throw new PaymentMethodInvalid("maxAmountCents must be positive.");
  if (min !== null && max !== null && min > max) {
    throw new PaymentMethodInvalid("minAmountCents cannot exceed maxAmountCents.");
  }
  if (input.activeStartAt && input.activeEndAt && input.activeStartAt >= input.activeEndAt) {
    throw new PaymentMethodInvalid("activeStartAt must be before activeEndAt.");
  }
  assertNotMerchantLabeled(input);

  const at = now.toISOString();
  const record: PaymentMethodRecord = {
    methodId: input.methodId,
    providerCode: input.providerCode,
    category: MANUAL_EXTERNAL_PAYMENT,
    memberFacingName: input.memberFacingName,
    adminFacingName: input.adminFacingName,
    enabled: false,
    duration: input.duration,
    activeStartAt: input.activeStartAt ?? null,
    activeEndAt: input.activeEndAt ?? null,
    currency,
    activationEligible: input.activationEligible,
    renewalEligible: input.renewalEligible,
    productEligible: false,
    minAmountCents: min,
    maxAmountCents: max,
    settlementTime: input.settlementTime,
    receivingLegalEntity: input.receivingLegalEntity,
    ownershipClassification: input.ownershipClassification,
    approvalStatus: "pending_review",
    approvalDate: null,
    complianceReviewNote: input.complianceReviewNote ?? null,
    approvedBy: null,
    receivingInstructionsEncrypted: cipher.encrypt(input.receivingInstructions),
    receivingInstructionsMasked: maskReceivingInstructions(input.receivingInstructions),
    mobileInstructions: input.mobileInstructions ?? null,
    desktopInstructions: input.desktopInstructions ?? null,
    memoInstructions: input.memoInstructions ?? null,
    deepLinkRef: input.deepLinkRef ?? null,
    qrAssetRef: input.qrAssetRef ?? null,
    supportContactRef: input.supportContactRef ?? null,
    disabledReason: null,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
  return { record, version: buildVersion(record, "created", actorId, now) };
}

function buildVersion(
  record: PaymentMethodRecord,
  changeKind: MethodChangeKind,
  changedBy: string,
  now: Date,
): MethodVersionRecord {
  return {
    versionId: `${record.methodId}.v${record.version}`,
    methodId: record.methodId,
    version: record.version,
    changeKind,
    changedBy,
    changedAt: now.toISOString(),
    snapshot: { ...record },
  };
}

/**
 * A named approver approves the method after compliance review. This is the
 * only path to enabled=true. The approver and date are recorded on the record
 * and in the append-only version row.
 */
export function approvePaymentMethod(
  record: PaymentMethodRecord,
  args: { approvedBy: string; complianceReviewNote?: string; now: Date },
): { record: PaymentMethodRecord; version: MethodVersionRecord } {
  if (!args.approvedBy.trim()) throw new PaymentMethodInvalid("Approval requires a named approver.");
  if (record.approvalStatus === "approved") {
    throw new PaymentMethodInvalid(`Method ${record.methodId} is already approved.`);
  }
  const next: PaymentMethodRecord = {
    ...record,
    enabled: true,
    approvalStatus: "approved",
    approvalDate: args.now.toISOString(),
    approvedBy: args.approvedBy,
    complianceReviewNote: args.complianceReviewNote ?? record.complianceReviewNote,
    disabledReason: null,
    version: record.version + 1,
    updatedAt: args.now.toISOString(),
  };
  return { record: next, version: buildVersion(next, "approved", args.approvedBy, args.now) };
}

/** Disable a method with a recorded reason. Existing submissions stay reviewable. */
export function disablePaymentMethod(
  record: PaymentMethodRecord,
  args: { actorId: string; reason: string; now: Date },
): { record: PaymentMethodRecord; version: MethodVersionRecord } {
  if (!args.actorId.trim()) throw new PaymentMethodInvalid("Disabling a method requires a named actor.");
  if (!args.reason.trim()) throw new PaymentMethodInvalid("Disabling a method requires a reason.");
  const next: PaymentMethodRecord = {
    ...record,
    enabled: false,
    disabledReason: args.reason,
    version: record.version + 1,
    updatedAt: args.now.toISOString(),
  };
  return { record: next, version: buildVersion(next, "disabled", args.actorId, args.now) };
}

/** Is the method usable at `now`: enabled, approved, and inside its active window. */
export function isMethodUsableAt(record: PaymentMethodRecord, now: Date): boolean {
  if (!record.enabled || record.disabledReason !== null) return false;
  if (record.approvalStatus !== "approved") return false;
  const at = now.toISOString();
  if (record.activeStartAt !== null && at < record.activeStartAt) return false;
  if (record.activeEndAt !== null && at >= record.activeEndAt) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Serialized shapes. These are the ONLY member-facing projections; both are
// built by picking fields, so the ciphertext cannot leak by spread or by a
// later column addition. The structural test in payment-methods.test.ts walks
// every string in these shapes and asserts no instruction material appears.
// ---------------------------------------------------------------------------

/** Pre-auth and public surfaces: no instructions of any kind, masked or not. */
export interface PublicMethodSummary {
  methodId: string;
  memberFacingName: string;
  category: PaymentMethodCategory;
  currency: string;
  activationEligible: boolean;
  renewalEligible: boolean;
  minAmountCents: number | null;
  maxAmountCents: number | null;
  settlementTime: string;
}

export function toPublicMethodSummary(record: PaymentMethodRecord): PublicMethodSummary {
  return {
    methodId: record.methodId,
    memberFacingName: record.memberFacingName,
    category: record.category,
    currency: record.currency,
    activationEligible: record.activationEligible,
    renewalEligible: record.renewalEligible,
    minAmountCents: record.minAmountCents,
    maxAmountCents: record.maxAmountCents,
    settlementTime: record.settlementTime,
  };
}

/**
 * Post-auth member surface: adds the masked variant and the how-to-pay text.
 * Still never the ciphertext and never the plaintext; the deliberate reveal is
 * a separate call the authenticated payment surface makes at request time.
 */
export interface AuthenticatedMemberMethod extends PublicMethodSummary {
  receivingInstructionsMasked: string;
  mobileInstructions: string | null;
  desktopInstructions: string | null;
  memoInstructions: string | null;
  deepLinkRef: string | null;
  qrAssetRef: string | null;
  supportContactRef: string | null;
}

export function toAuthenticatedMemberMethod(record: PaymentMethodRecord): AuthenticatedMemberMethod {
  return {
    ...toPublicMethodSummary(record),
    receivingInstructionsMasked: record.receivingInstructionsMasked,
    mobileInstructions: record.mobileInstructions,
    desktopInstructions: record.desktopInstructions,
    memoInstructions: record.memoInstructions,
    deepLinkRef: record.deepLinkRef,
    qrAssetRef: record.qrAssetRef,
    supportContactRef: record.supportContactRef,
  };
}

/**
 * The deliberate decrypt, for the authenticated payment step only. The caller
 * (the surface wave, behind auth and the founding-activation flag) owns the
 * authorization decision; this function only refuses unusable methods so an
 * expired or unapproved method's destination is never revealed.
 */
export function revealReceivingInstructions(
  record: PaymentMethodRecord,
  cipher: InstructionCipher,
  now: Date,
): string {
  if (!isMethodUsableAt(record, now)) {
    throw new PaymentMethodInvalid(
      `Method ${record.methodId} is not usable now; its receiving instructions stay sealed.`,
    );
  }
  return cipher.decrypt(record.receivingInstructionsEncrypted);
}
