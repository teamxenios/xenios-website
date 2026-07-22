import crypto from "crypto";
import {
  isSafeIdentifier,
  isSafeStoragePath,
  type ObjectStat,
  type ProviderResult,
  type StorageBucketApi,
  type StorageBucketFactory,
} from "../media-provider";
import { getSupabaseAdmin } from "../../supabase";

// ---------------------------------------------------------------------------
// xenios research founding membership activation: identity documents
// (Domain 3, manual review lane).
//
// This is the CONSENT-FIRST flow for the one government ID an applicant
// uploads so a named human can confirm legal name and the 21+ age threshold
// before activation. It is deliberately separate from identity-provider.ts
// (the vendor boundary for a future automated provider): this lane is a
// manual name and age review by a person, never a forensic examination and
// never a vendor hand-off. The two lanes share nothing but the posture that
// raw identity evidence is radioactive and held as briefly as possible.
//
// HARD RULES encoded structurally in this module:
// - No SSN, anywhere. There is no field on any input, record, or row that
//   could carry a Social Security number, and the applicant guidance says so
//   out loud. A structural test walks every record shape with the forbidden
//   patterns below so the rule cannot erode silently.
// - Consent first. No upload path opens (no upload URL is ever minted) until
//   the identity consent is recorded on the case. The gate is code, not copy.
// - Images only by default. PDF is off unless explicitly configured on. SVG
//   and executable content types are rejected unconditionally, even if a
//   misconfigured allowlist tries to include them.
// - No public URLs. Storage access mirrors media-provider.ts: signed upload
//   URLs, signed short-lived admin access, random unguessable object keys.
// - Everything sits behind RESEARCH_FOUNDING_ACTIVATION_ENABLED, default
//   false. The flag is checked at every entry point that touches storage.
// ---------------------------------------------------------------------------

export const FOUNDING_ACTIVATION_FLAG = "RESEARCH_FOUNDING_ACTIVATION_ENABLED";

export function foundingActivationEnabled(): boolean {
  return process.env[FOUNDING_ACTIVATION_FLAG] === "true";
}

export const IDENTITY_DEFAULT_TENANT = "xenios-research";

// ---------------------------------------------------------------------------
// The twelve case statuses
// ---------------------------------------------------------------------------

// The full lifecycle of one identity document case, consent first, deletion
// last. Exactly these twelve; the transition map below is the whole law.
export const IDENTITY_CASE_STATUSES = [
  "awaiting_consent", // case opened, consent not yet answered
  "consent_declined", // applicant said no; the upload path never opens
  "consent_recorded", // consent given; the upload path may open
  "upload_url_issued", // a signed upload URL was minted
  "upload_expired", // the URL window closed with no object landing
  "uploaded", // the object landed and storage confirmed it
  "review_pending", // submitted to the manual review queue
  "under_review", // a named reviewer opened the case
  "verified", // manual name and age review passed
  "rejected", // review failed; activation is blocked
  "deletion_scheduled", // review complete, raw source queued for deletion
  "deleted", // raw source gone; only the minimal record remains
] as const;

export type IdentityCaseStatus = (typeof IDENTITY_CASE_STATUSES)[number];

// Which statuses may follow which. "deleted" is reachable from every state
// that can still hold a raw object (the emergency manual delete), and it is
// terminal along with consent_declined.
export const IDENTITY_CASE_TRANSITIONS: Record<IdentityCaseStatus, readonly IdentityCaseStatus[]> = {
  awaiting_consent: ["consent_recorded", "consent_declined"],
  consent_declined: [],
  consent_recorded: ["upload_url_issued"],
  upload_url_issued: ["upload_url_issued", "upload_expired", "uploaded", "deleted"],
  upload_expired: ["upload_url_issued"],
  uploaded: ["review_pending", "deleted"],
  review_pending: ["under_review", "deleted"],
  under_review: ["verified", "rejected", "deleted"],
  verified: ["deletion_scheduled", "deleted"],
  rejected: ["deletion_scheduled", "deleted"],
  deletion_scheduled: ["deleted"],
  deleted: [],
};

export function canTransition(from: IdentityCaseStatus, to: IdentityCaseStatus): boolean {
  return IDENTITY_CASE_TRANSITIONS[from].includes(to);
}

export class IdentityInvalidTransition extends Error {
  constructor(from: IdentityCaseStatus, to: IdentityCaseStatus) {
    super(`An identity case cannot move from ${from} to ${to}.`);
    this.name = "IdentityInvalidTransition";
  }
}

// ---------------------------------------------------------------------------
// The case record (structurally minimal: no name, no birth date, no numbers)
// ---------------------------------------------------------------------------

// Everything this system persists about a case. Note what has NO field here:
// the applicant's name, date of birth, any document number, and any SSN. The
// case carries pointers and state only; the review outcome lives on the
// separate minimal verification record (identity-reviews.ts).
export type IdentityDocumentCase = {
  caseId: string;
  tenantId: string;
  memberId: string;
  status: IdentityCaseStatus;
  consentVersion: string | null;
  consentRecordedAt: string | null;
  storagePath: string | null; // the raw object pointer, nulled at deletion
  contentType: string | null;
  uploadUrlExpiresAt: string | null;
  uploadedAt: string | null;
  reviewId: string | null;
  rawDeletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const IDENTITY_CASE_PERSISTED_FIELDS = [
  "caseId",
  "tenantId",
  "memberId",
  "status",
  "consentVersion",
  "consentRecordedAt",
  "storagePath",
  "contentType",
  "uploadUrlExpiresAt",
  "uploadedAt",
  "reviewId",
  "rawDeletedAt",
  "createdAt",
  "updatedAt",
] as const;

// Compile-time pin: the persisted-fields list and the record type cannot
// drift apart. Adding a field to one without the other is a type error.
type CaseField = (typeof IDENTITY_CASE_PERSISTED_FIELDS)[number];
type MustBeNever<T extends never> = T;
export type _CaseFieldContractA = MustBeNever<Exclude<keyof IdentityDocumentCase, CaseField>>;
export type _CaseFieldContractB = MustBeNever<Exclude<CaseField, keyof IdentityDocumentCase>>;

// Field-name patterns that must never appear on any persisted identity shape
// in this lane. licenseLast4 on the verification record is the ONE sanctioned
// exception (see IDENTITY_FIELD_EXCEPTIONS); everything else that smells like
// document content is forbidden. The structural tests walk every record with
// these.
export const IDENTITY_FORBIDDEN_FIELD_PATTERNS: readonly RegExp[] = [
  /ssn/i,
  /social/i,
  /passport/i,
  /licen[cs]e/i,
  /document.?number/i,
  /image/i,
  /photo/i,
  /selfie/i,
  /scan/i,
  /biometric/i,
  /template/i,
  /embedding/i,
  /dob/i,
  /birth/i,
  /address/i,
];

export const IDENTITY_FIELD_EXCEPTIONS: ReadonlySet<string> = new Set(["licenseLast4"]);

export function forbiddenFieldNames(record: object): string[] {
  return Object.keys(record).filter(
    (key) =>
      !IDENTITY_FIELD_EXCEPTIONS.has(key) &&
      IDENTITY_FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(key)),
  );
}

// ---------------------------------------------------------------------------
// Applicant guidance (the required disclosures, in plain English)
// ---------------------------------------------------------------------------

// What must stay visible for the manual name and age review to work.
export const IDENTITY_REQUIRED_VISIBLE = [
  "legal_name",
  "photo",
  "date_of_birth",
  "expiration_date",
  "issuing_jurisdiction",
  "distinguishing_digits_last_4",
] as const;

// What the applicant is explicitly PERMITTED to conceal before uploading.
// The review needs identity and age, not a full dossier.
export const IDENTITY_PERMITTED_CONCEALMENT = [
  "street_address",
  "license_number_except_last_4",
  "barcode",
] as const;

// The disclosures shown before consent. Plain language, no jargon, and the
// SSN line is a promise the code keeps structurally: there is no field to
// type one into anywhere in this flow.
export const IDENTITY_APPLICANT_GUIDANCE: readonly string[] = [
  "We ask for a photo of your government ID so a named person on our team can confirm your legal name and that you are 21 or older. That is the whole purpose.",
  "This is a manual check by a person. It is not an automated identity service, and your document is not sent to any outside vendor.",
  "You may cover parts of your ID before photographing it. You are welcome to conceal your street address, all but the last 4 characters of your license number, and the barcode.",
  "Please keep visible: your legal name, your photo, your date of birth, the expiration date, the issuing state or jurisdiction, and the last 4 characters of the license number.",
  "We never ask for your Social Security number. Nothing in this process has a place to enter one, and you should not write one on anything you upload.",
  "What we keep after review is minimal: whether the name matched, whether you met the age requirement, the issuing jurisdiction, whether the document was current, and at most the last 4 characters of the license number.",
  "The photo you upload is deleted on a schedule after the review is complete (7 days by default). You can also ask us to delete it immediately at any time.",
  "Every time an administrator views your document, that access is logged.",
  "If you decline consent, no upload happens and nothing is collected. Declining stops activation but costs you nothing.",
];

// ---------------------------------------------------------------------------
// Upload constraints (license-specific media configuration)
// ---------------------------------------------------------------------------

export const IDENTITY_IMAGE_CONTENT_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const IDENTITY_PDF_CONTENT_TYPE = "application/pdf";

// Rejected unconditionally, even if a config mistake lists them: SVG is a
// script container, and none of the rest is a photograph of a card.
export const IDENTITY_REJECTED_CONTENT_TYPES: readonly string[] = [
  "image/svg+xml",
  "text/html",
  "text/javascript",
  "application/javascript",
  "application/x-msdownload",
  "application/x-sh",
  "application/octet-stream",
];

export type IdentityUploadConfig = {
  maxBytes: number;
  allowPdf: boolean; // off by default; a deliberate configuration turns it on
  uploadUrlTtlSeconds: number;
};

export const DEFAULT_IDENTITY_UPLOAD_CONFIG: IdentityUploadConfig = {
  maxBytes: 10 * 1024 * 1024,
  allowPdf: false,
  uploadUrlTtlSeconds: 10 * 60,
};

export function allowedIdentityContentTypes(config: IdentityUploadConfig): readonly string[] {
  const allowed: string[] = [...IDENTITY_IMAGE_CONTENT_TYPES];
  if (config.allowPdf) allowed.push(IDENTITY_PDF_CONTENT_TYPE);
  return allowed.filter((type) => !IDENTITY_REJECTED_CONTENT_TYPES.includes(type));
}

// File extensions that may survive sanitization. The FINAL extension governs,
// so "card.jpg.exe" is an exe and is rejected.
const ALLOWED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png", "webp"]);
const PDF_EXTENSION = "pdf";

// Sanitize a client-supplied file name into safe metadata. The storage key
// never uses this name (keys are random), but the name is stored for the
// reviewer's context, so it must not carry traversal, scripts, or surprises.
// Returns null when the name cannot be made safe, which refuses the upload.
export function sanitizeIdentityFileName(name: string, config: IdentityUploadConfig): string | null {
  if (typeof name !== "string" || name.length === 0 || name.length > 255) return null;
  // Strip any path components from either separator family.
  const base = name.split(/[\\/]/).pop() ?? "";
  // Keep a conservative charset only.
  const cleaned = base.replace(/[^A-Za-z0-9._-]/g, "_");
  const trimmed = cleaned.replace(/^[._-]+/, "");
  if (trimmed.length === 0) return null;
  const parts = trimmed.split(".");
  if (parts.length < 2) return null; // no extension: cannot classify, refuse
  const extension = parts[parts.length - 1].toLowerCase();
  if (ALLOWED_IMAGE_EXTENSIONS.has(extension)) return trimmed;
  if (config.allowPdf && extension === PDF_EXTENSION) return trimmed;
  return null; // svg, exe, js, bat, everything else: refused
}

// ---------------------------------------------------------------------------
// The identity media port (delegates to the private storage seam)
// ---------------------------------------------------------------------------

// The same posture as media-provider.ts, scoped to this lane: authenticated
// signed upload URLs, signed short-lived admin access, no public URL method
// anywhere on the port, and random object keys generated here, never supplied.

export type IdentityUploadGrant = {
  uploadUrl: string;
  storagePath: string;
  expiresAt: string;
  maxBytes: number;
};

export type IdentityAccessGrant = {
  signedUrl: string;
  expiresAt: string;
};

export interface IdentityMediaPort {
  createUploadUrl(input: {
    storagePath: string;
    contentType: string;
    contentLengthBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityUploadGrant>>;
  createAdminAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityAccessGrant>>;
  deleteObject(storagePath: string): Promise<ProviderResult<void>>;
  statObject(storagePath: string): Promise<ProviderResult<ObjectStat>>;
}

// Deterministic in-memory implementation for tests and for the unconfigured
// fallback. Mirrors the fixtures of TestMediaProvider: "undeletable" refuses
// the delete, "missing" does not exist.
export class InMemoryIdentityMediaProvider implements IdentityMediaPort {
  readonly calls: Array<{ method: string; storagePath: string }> = [];
  readonly deleted: string[] = [];

  reset() {
    this.calls.length = 0;
    this.deleted.length = 0;
  }

  async createUploadUrl(input: {
    storagePath: string;
    contentType: string;
    contentLengthBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityUploadGrant>> {
    this.calls.push({ method: "createUploadUrl", storagePath: input.storagePath });
    return {
      ok: true,
      value: {
        uploadUrl: `https://storage.test.invalid/identity-upload/${input.storagePath}`,
        storagePath: input.storagePath,
        expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
        maxBytes: input.maxBytes,
      },
    };
  }

  async createAdminAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityAccessGrant>> {
    this.calls.push({ method: "createAdminAccessUrl", storagePath: input.storagePath });
    return {
      ok: true,
      value: {
        signedUrl: `https://storage.test.invalid/identity-signed/${input.storagePath}`,
        expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
      },
    };
  }

  async deleteObject(storagePath: string): Promise<ProviderResult<void>> {
    this.calls.push({ method: "deleteObject", storagePath });
    if (storagePath.includes("undeletable")) {
      return { ok: false, code: "PROVIDER_ERROR", message: "Storage refused the delete." };
    }
    this.deleted.push(storagePath);
    return { ok: true, value: undefined };
  }

  async statObject(storagePath: string): Promise<ProviderResult<ObjectStat>> {
    this.calls.push({ method: "statObject", storagePath });
    if (storagePath.includes("missing")) {
      return { ok: true, value: { exists: false, sizeBytes: null, contentType: null } };
    }
    return { ok: true, value: { exists: true, sizeBytes: null, contentType: null } };
  }
}

export const inMemoryIdentityMediaProvider = new InMemoryIdentityMediaProvider();

// The real adapter, over the same StorageBucketApi seam media-provider.ts
// proved out. The bucket named by RESEARCH_IDENTITY_BUCKET must be PRIVATE
// and must be a DIFFERENT bucket from member media, so an identity document
// can never be reached through a media code path or vice versa.
export class IdentityMediaNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Identity document storage is not configured: ${missing.join(", ")}`);
    this.name = "IdentityMediaNotConfigured";
    this.missing = missing;
  }
}

const REQUIRED_IDENTITY_ENV = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "RESEARCH_IDENTITY_BUCKET",
] as const;

export function missingIdentityMediaEnv(): string[] {
  return REQUIRED_IDENTITY_ENV.filter((name) => !process.env[name]);
}

const serviceRoleBucketFactory: StorageBucketFactory = (bucket) =>
  getSupabaseAdmin().storage.from(bucket);

export class SupabaseIdentityMediaProvider implements IdentityMediaPort {
  private readonly bucketFactory: StorageBucketFactory;

  constructor(bucketFactory: StorageBucketFactory = serviceRoleBucketFactory) {
    this.bucketFactory = bucketFactory;
  }

  private bucket(): StorageBucketApi {
    const missing = missingIdentityMediaEnv();
    if (missing.length > 0) throw new IdentityMediaNotConfigured(missing);
    return this.bucketFactory(process.env.RESEARCH_IDENTITY_BUCKET as string);
  }

  private failed(method: string, detail?: string): ProviderResult<never> {
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: `Identity storage ${method} failed${detail ? `: ${detail}` : "."}`,
    };
  }

  async createUploadUrl(input: {
    storagePath: string;
    contentType: string;
    contentLengthBytes: number;
    maxBytes: number;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityUploadGrant>> {
    if (!isSafeStoragePath(input.storagePath)) {
      return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
    }
    try {
      const { data, error } = await this.bucket().createSignedUploadUrl(input.storagePath);
      if (error || !data) return this.failed("createSignedUploadUrl", error?.message);
      return {
        ok: true,
        value: {
          uploadUrl: data.signedUrl,
          storagePath: input.storagePath,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
          maxBytes: input.maxBytes,
        },
      };
    } catch (err) {
      return this.failed("createSignedUploadUrl", err instanceof Error ? err.message : undefined);
    }
  }

  async createAdminAccessUrl(input: {
    storagePath: string;
    expiresInSeconds: number;
    now: Date;
  }): Promise<ProviderResult<IdentityAccessGrant>> {
    if (!isSafeStoragePath(input.storagePath)) {
      return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
    }
    try {
      const { data, error } = await this.bucket().createSignedUrl(input.storagePath, input.expiresInSeconds);
      if (error || !data) return this.failed("createSignedUrl", error?.message);
      return {
        ok: true,
        value: {
          signedUrl: data.signedUrl,
          expiresAt: new Date(input.now.getTime() + input.expiresInSeconds * 1000).toISOString(),
        },
      };
    } catch (err) {
      return this.failed("createSignedUrl", err instanceof Error ? err.message : undefined);
    }
  }

  async deleteObject(storagePath: string): Promise<ProviderResult<void>> {
    if (!isSafeStoragePath(storagePath)) {
      return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
    }
    try {
      const { error } = await this.bucket().remove([storagePath]);
      if (error) return this.failed("remove", error.message);
      return { ok: true, value: undefined };
    } catch (err) {
      return this.failed("remove", err instanceof Error ? err.message : undefined);
    }
  }

  async statObject(storagePath: string): Promise<ProviderResult<ObjectStat>> {
    if (!isSafeStoragePath(storagePath)) {
      return { ok: false, code: "REFUSED", message: "That storage path is not one this system generates." };
    }
    try {
      const { data, error } = await this.bucket().info(storagePath);
      if (!error && data) {
        return {
          ok: true,
          value: {
            exists: true,
            sizeBytes: typeof data.size === "number" ? data.size : null,
            contentType: typeof data.contentType === "string" ? data.contentType : null,
          },
        };
      }
      if (error && (error.status === 404 || error.status === 400)) {
        return { ok: true, value: { exists: false, sizeBytes: null, contentType: null } };
      }
      return this.failed("info", error?.message);
    } catch (err) {
      return this.failed("info", err instanceof Error ? err.message : undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// The consent-first flow (pure functions over the case record)
// ---------------------------------------------------------------------------

function nowIso(now: Date): string {
  return now.toISOString();
}

function transitioned(
  kase: IdentityDocumentCase,
  to: IdentityCaseStatus,
  now: Date,
  patch: Partial<IdentityDocumentCase> = {},
): IdentityDocumentCase {
  if (!canTransition(kase.status, to)) throw new IdentityInvalidTransition(kase.status, to);
  return { ...kase, ...patch, status: to, updatedAt: nowIso(now) };
}

export function openIdentityCase(input: {
  memberId: string;
  now: Date;
  tenantId?: string;
  caseId?: string;
}): IdentityDocumentCase {
  if (!isSafeIdentifier(input.memberId)) {
    throw new Error("The member identifier is not safe for an identity case.");
  }
  const at = nowIso(input.now);
  return {
    caseId: input.caseId ?? crypto.randomUUID(),
    tenantId: input.tenantId ?? IDENTITY_DEFAULT_TENANT,
    memberId: input.memberId,
    status: "awaiting_consent",
    consentVersion: null,
    consentRecordedAt: null,
    storagePath: null,
    contentType: null,
    uploadUrlExpiresAt: null,
    uploadedAt: null,
    reviewId: null,
    rawDeletedAt: null,
    createdAt: at,
    updatedAt: at,
  };
}

// Consent is answered exactly once, before anything else. Declining is a
// terminal state; nothing is collected and nothing opens later without a new
// case (which asks again from the start).
export function recordIdentityConsent(
  kase: IdentityDocumentCase,
  input: { accepted: boolean; consentVersion: string; now: Date },
): IdentityDocumentCase {
  if (input.accepted) {
    return transitioned(kase, "consent_recorded", input.now, {
      consentVersion: input.consentVersion,
      consentRecordedAt: nowIso(input.now),
    });
  }
  return transitioned(kase, "consent_declined", input.now, {
    consentVersion: input.consentVersion,
  });
}

// True only for statuses that can exist AFTER consent was recorded. The
// upload path checks this and the transition map both, so consent-first holds
// even if a future status is wired wrong.
export function consentGateOpen(kase: IdentityDocumentCase): boolean {
  return kase.status !== "awaiting_consent" && kase.status !== "consent_declined" && kase.consentRecordedAt !== null;
}

export type IdentityFlowResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: "DISABLED" | "CONSENT_REQUIRED" | "REFUSED" | "INVALID_STATE" | "PROVIDER_ERROR"; message: string };

function flowRefused<T>(
  code: "DISABLED" | "CONSENT_REQUIRED" | "REFUSED" | "INVALID_STATE" | "PROVIDER_ERROR",
  message: string,
): IdentityFlowResult<T> {
  return { ok: false, code, message };
}

export type RequestUploadUrlInput = {
  contentType: string;
  contentLengthBytes: number;
  fileName: string;
  now: Date;
};

// Mint a signed upload URL for the case. Refuses when the flag is off, when
// consent has not been recorded, when the content type or size is out of
// policy, or when the file name cannot be sanitized. The object key is random
// and generated here; nothing client-supplied reaches storage naming.
export async function requestIdentityUploadUrl(
  kase: IdentityDocumentCase,
  input: RequestUploadUrlInput,
  provider: IdentityMediaPort,
  config: IdentityUploadConfig = DEFAULT_IDENTITY_UPLOAD_CONFIG,
  randomHex: () => string = () => crypto.randomBytes(12).toString("hex"),
): Promise<IdentityFlowResult<{ kase: IdentityDocumentCase; grant: IdentityUploadGrant }>> {
  if (!foundingActivationEnabled()) {
    return flowRefused("DISABLED", "Founding membership activation is disabled.");
  }
  if (!consentGateOpen(kase)) {
    return flowRefused("CONSENT_REQUIRED", "Identity consent must be recorded before any upload path opens.");
  }
  if (!canTransition(kase.status, "upload_url_issued")) {
    return flowRefused("INVALID_STATE", `An upload URL cannot be issued from status ${kase.status}.`);
  }
  if (IDENTITY_REJECTED_CONTENT_TYPES.includes(input.contentType)) {
    return flowRefused("REFUSED", "That content type is never accepted for an identity document.");
  }
  const allowed = allowedIdentityContentTypes(config);
  if (!allowed.includes(input.contentType)) {
    return flowRefused("REFUSED", `contentType must be one of: ${allowed.join(", ")}`);
  }
  if (!Number.isInteger(input.contentLengthBytes) || input.contentLengthBytes <= 0) {
    return flowRefused("REFUSED", "contentLengthBytes must be a positive integer.");
  }
  if (input.contentLengthBytes > config.maxBytes) {
    return flowRefused("REFUSED", `An identity document upload must be at most ${config.maxBytes} bytes.`);
  }
  if (sanitizeIdentityFileName(input.fileName, config) === null) {
    return flowRefused("REFUSED", "That file name is not acceptable for an identity document.");
  }
  if (!isSafeIdentifier(kase.memberId) || !isSafeIdentifier(kase.tenantId)) {
    return flowRefused("REFUSED", "The case identifiers are not safe for an object name.");
  }

  const storagePath = `identity/${kase.tenantId}/${kase.memberId}/${kase.caseId}-${randomHex()}`;
  const grant = await provider.createUploadUrl({
    storagePath,
    contentType: input.contentType,
    contentLengthBytes: input.contentLengthBytes,
    maxBytes: config.maxBytes,
    expiresInSeconds: config.uploadUrlTtlSeconds,
    now: input.now,
  });
  if (!grant.ok) {
    return flowRefused("PROVIDER_ERROR", grant.message ?? "Identity storage refused the upload URL.");
  }
  const updated = transitioned(kase, "upload_url_issued", input.now, {
    storagePath: grant.value.storagePath,
    contentType: input.contentType,
    uploadUrlExpiresAt: grant.value.expiresAt,
  });
  return { ok: true, value: { kase: updated, grant: grant.value } };
}

// Confirm the object actually landed. Storage is asked, never assumed; a
// missing object is a truthful refusal and the case stays where it is.
export async function confirmIdentityUpload(
  kase: IdentityDocumentCase,
  provider: IdentityMediaPort,
  now: Date,
): Promise<IdentityFlowResult<IdentityDocumentCase>> {
  if (!foundingActivationEnabled()) {
    return flowRefused("DISABLED", "Founding membership activation is disabled.");
  }
  if (kase.status !== "upload_url_issued" || kase.storagePath === null) {
    return flowRefused("INVALID_STATE", "There is no pending upload to confirm on this case.");
  }
  const stat = await provider.statObject(kase.storagePath);
  if (!stat.ok) {
    return flowRefused("PROVIDER_ERROR", stat.message ?? "Identity storage could not be checked.");
  }
  if (!stat.value.exists) {
    return flowRefused("REFUSED", "No uploaded object was found for this case.");
  }
  return { ok: true, value: transitioned(kase, "uploaded", now, { uploadedAt: nowIso(now) }) };
}

// The URL window closed without an object. The applicant may request a new
// URL; consent stays recorded and is not asked again.
export function markIdentityUploadExpired(kase: IdentityDocumentCase, now: Date): IdentityDocumentCase {
  return transitioned(kase, "upload_expired", now, {
    storagePath: null,
    contentType: null,
    uploadUrlExpiresAt: null,
  });
}

// Hand the uploaded case to the manual review queue.
export function submitIdentityCaseForReview(kase: IdentityDocumentCase, now: Date): IdentityDocumentCase {
  return transitioned(kase, "review_pending", now);
}
