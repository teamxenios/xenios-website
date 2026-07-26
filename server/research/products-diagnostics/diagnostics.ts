import crypto from "crypto";
import { Website3ValidationError } from "./errors";

export const SUPERPOWER_RESEARCH_BOUNDARY =
  "Bloodwork and diagnostic services are separate from Research products. Test results do not validate a Research product, establish its quality, or make it suitable for human use.";

export type SuperpowerOfferStatus =
  | "coming_soon"
  | "available"
  | "paused"
  | "unavailable";

export interface SuperpowerOfferConfig {
  offerId: string;
  label: string;
  summary: string;
  status: SuperpowerOfferStatus;
  availability: string;
  collectionMethod: string | null;
  priceCents: number | null;
  priceEffectiveDate: string | null;
  lastVerificationDate: string | null;
  lastReviewedDate: string | null;
  verifiedPriceDate: string | null;
  disclosure: string;
  interest: {
    enabled: boolean;
    href: string | null;
  };
  affiliate: {
    enabled: boolean;
    url: string | null;
  };
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

export interface PublicSuperpowerOffer {
  offerId: string;
  label: string;
  summary: string;
  status: SuperpowerOfferStatus;
  availability: string;
  collectionMethod: string | null;
  priceCents: number | null;
  priceEffectiveDate: string | null;
  lastVerificationDate: string | null;
  lastReviewedDate: string | null;
  verifiedPriceDate: string | null;
  disclosure: string;
  interestHref: string | null;
  affiliateUrl: string | null;
  researchBoundary: string;
}

export const DEFAULT_SUPERPOWER_OFFER: SuperpowerOfferConfig = {
  offerId: "superpower_diagnostics",
  label: "Superpower Diagnostics",
  summary:
    "A member diagnostics experience is being prepared with transparent offer, collection, availability, and verification details.",
  status: "coming_soon",
  availability: "Not currently enabled",
  collectionMethod: null,
  priceCents: null,
  priceEffectiveDate: null,
  lastVerificationDate: null,
  lastReviewedDate: null,
  verifiedPriceDate: null,
  disclosure:
    "If an affiliate relationship is enabled later, Xenios may receive compensation. No affiliate link is active today.",
  interest: {
    enabled: true,
    href: "/research/member/product-requests/new?source=diagnostics",
  },
  affiliate: { enabled: false, url: null },
  adminEditable: true,
  updatedAt: "2026-07-25T00:00:00.000Z",
  updatedBy: null,
};

export function toPublicSuperpowerOffer(
  offer: SuperpowerOfferConfig,
): PublicSuperpowerOffer {
  return {
    offerId: offer.offerId,
    label: offer.label,
    summary: offer.summary,
    status: offer.status,
    availability: offer.availability,
    collectionMethod: offer.collectionMethod,
    priceCents: offer.priceCents,
    priceEffectiveDate: offer.priceEffectiveDate,
    lastVerificationDate: offer.lastVerificationDate,
    lastReviewedDate: offer.lastReviewedDate,
    verifiedPriceDate: offer.verifiedPriceDate,
    disclosure: offer.disclosure,
    interestHref:
      offer.interest.enabled && offer.interest.href?.startsWith("/research/")
        ? offer.interest.href
        : null,
    affiliateUrl:
      offer.affiliate.enabled && offer.status === "available" ? offer.affiliate.url : null,
    researchBoundary: SUPERPOWER_RESEARCH_BOUNDARY,
  };
}

export function validateSuperpowerOffer(
  offer: SuperpowerOfferConfig,
): void {
  if (!["coming_soon", "available", "paused", "unavailable"].includes(offer.status)) {
    throw new Website3ValidationError("Superpower status is invalid");
  }
  for (const [name, value, max] of [
    ["label", offer.label, 160],
    ["summary", offer.summary, 2000],
    ["availability", offer.availability, 500],
    ["disclosure", offer.disclosure, 2000],
  ] as const) {
    if (!value.trim() || value.length > max) {
      throw new Website3ValidationError(`${name} must contain 1-${max} characters`);
    }
  }
  if (
    offer.priceCents !== null &&
    (!Number.isInteger(offer.priceCents) || offer.priceCents < 0)
  ) {
    throw new Website3ValidationError("priceCents must be a non-negative integer or null");
  }
  const dates = [
    offer.priceEffectiveDate,
    offer.lastVerificationDate,
    offer.lastReviewedDate,
    offer.verifiedPriceDate,
  ];
  if (
    dates.some((value) => {
      if (value === null) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return true;
      const date = new Date(`${value}T00:00:00.000Z`);
      return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value;
    })
  ) {
    throw new Website3ValidationError("Superpower dates must use YYYY-MM-DD or null");
  }
  if (
    offer.interest.enabled &&
    !offer.interest.href?.startsWith("/research/")
  ) {
    throw new Website3ValidationError(
      "An enabled interest action must stay inside the Research member area.",
    );
  }
  if (
    offer.affiliate.enabled &&
    (offer.status !== "available" || !offer.affiliate.url?.startsWith("https://"))
  ) {
    throw new Website3ValidationError(
      "An enabled affiliate offer requires available status and an HTTPS URL.",
    );
  }
  if (
    offer.status === "available" &&
    (!offer.collectionMethod?.trim() ||
      offer.priceCents === null ||
      !offer.priceEffectiveDate ||
      !offer.lastVerificationDate ||
      !offer.lastReviewedDate ||
      !offer.verifiedPriceDate)
  ) {
    throw new Website3ValidationError(
      "An available Superpower offer requires collection, price, effective-date, verification, and review metadata.",
    );
  }
}

export class SuperpowerOfferRepository {
  private offer = structuredClone(DEFAULT_SUPERPOWER_OFFER);

  constructor(
    private readonly persist: (
      offer: SuperpowerOfferConfig,
    ) => Promise<void> = async () => undefined,
  ) {}

  readPublic(): PublicSuperpowerOffer {
    return toPublicSuperpowerOffer(this.offer);
  }

  readAdmin(): SuperpowerOfferConfig {
    return structuredClone(this.offer);
  }

  async update(
    patch: Partial<
      Pick<
        SuperpowerOfferConfig,
        | "label"
        | "summary"
        | "status"
        | "availability"
        | "collectionMethod"
        | "priceCents"
        | "priceEffectiveDate"
        | "lastVerificationDate"
        | "lastReviewedDate"
        | "verifiedPriceDate"
        | "disclosure"
        | "interest"
        | "affiliate"
      >
    >,
    actor: string,
    at: string,
  ): Promise<SuperpowerOfferConfig> {
    if (patch.affiliate?.enabled && !patch.affiliate.url?.startsWith("https://")) {
      throw new Website3ValidationError(
        "An enabled affiliate offer requires an HTTPS URL.",
      );
    }
    if (
      patch.interest?.enabled &&
      !patch.interest.href?.startsWith("/research/")
    ) {
      throw new Website3ValidationError(
        "An enabled interest action must stay inside the Research member area.",
      );
    }
    const next: SuperpowerOfferConfig = {
      ...this.offer,
      ...structuredClone(patch),
      offerId: this.offer.offerId,
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
    validateSuperpowerOffer(next);
    await this.persist(structuredClone(next));
    this.offer = next;
    return this.readAdmin();
  }
}

export const BIOMARKER_STATES = [
  "not_started",
  "coming_soon",
  "test_ordered",
  "collection_scheduled",
  "results_pending",
  "results_available_through_partner",
  "report_uploaded",
  "review_requested",
  "qualified_review_complete",
  "follow_up_due",
  "closed",
] as const;
export type BiomarkerState = (typeof BIOMARKER_STATES)[number];

export const BIOMARKER_STATE_LABELS: Record<BiomarkerState, string> = {
  not_started: "Not started",
  coming_soon: "Coming soon",
  test_ordered: "Test ordered",
  collection_scheduled: "Collection scheduled",
  results_pending: "Results pending",
  results_available_through_partner: "Results available through partner",
  report_uploaded: "Report uploaded",
  review_requested: "Review requested",
  qualified_review_complete: "Qualified review complete",
  follow_up_due: "Follow-up due",
  closed: "Closed",
};

const ALLOWED_TRANSITIONS: Record<BiomarkerState, readonly BiomarkerState[]> = {
  not_started: ["coming_soon", "test_ordered", "closed"],
  coming_soon: ["test_ordered", "closed"],
  test_ordered: ["collection_scheduled", "results_pending", "closed"],
  collection_scheduled: ["results_pending", "closed"],
  results_pending: ["results_available_through_partner", "report_uploaded", "closed"],
  results_available_through_partner: ["report_uploaded", "review_requested", "closed"],
  report_uploaded: ["review_requested", "closed"],
  review_requested: ["qualified_review_complete", "closed"],
  qualified_review_complete: ["follow_up_due", "closed"],
  follow_up_due: ["test_ordered", "closed"],
  closed: [],
};

export function canTransitionBiomarkerState(
  from: BiomarkerState,
  to: BiomarkerState,
): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export interface BiomarkerRecord {
  biomarkerRecordId: string;
  memberId: string;
  state: BiomarkerState;
  partnerReference: string | null;
  reportStorageKey: string | null;
  reportFilename: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  updatedAt: string;
}

export interface TrainerSafeBiomarkerSummary {
  state: BiomarkerState;
  stateLabel: string;
  followUpNeeded: boolean;
  updatedAt: string;
}

/**
 * Trainer-safe projection. It intentionally excludes report identity, private
 * storage, consent, partner, member, and laboratory-result data.
 */
export function toTrainerSafeBiomarkerSummary(
  record: BiomarkerRecord,
): TrainerSafeBiomarkerSummary {
  return {
    state: record.state,
    stateLabel: BIOMARKER_STATE_LABELS[record.state],
    followUpNeeded: record.state === "follow_up_due",
    updatedAt: record.updatedAt,
  };
}

export interface BiomarkerUploadProvider {
  createPrivateUpload(input: {
    memberId: string;
    storageKey: string;
    contentType: "application/pdf" | "image/jpeg" | "image/png";
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<
    | { ok: true; uploadUrl: string; expiresAt: string }
    | { ok: false; code: "disabled" | "not_configured" | "unavailable" }
  >;
  verifyPrivateUpload(input: {
    memberId: string;
    storageKey: string;
    contentType: "application/pdf" | "image/jpeg" | "image/png";
    sizeBytes: number;
  }): Promise<
    | { ok: true }
    | {
        ok: false;
        code: "disabled" | "not_configured" | "unavailable" | "object_missing" | "object_mismatch";
      }
  >;
}

export class DisabledBiomarkerUploadProvider implements BiomarkerUploadProvider {
  async createPrivateUpload(): Promise<{ ok: false; code: "disabled" }> {
    return { ok: false, code: "disabled" };
  }
  async verifyPrivateUpload(): Promise<{ ok: false; code: "disabled" }> {
    return { ok: false, code: "disabled" };
  }
}

export interface BiomarkerPendingUpload {
  uploadId: string;
  memberId: string;
  state: "pending";
  storageKey: string;
  filename: string;
  contentType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  consentVersion: string;
  consentedAt: string;
  expiresAt: string;
  createdAt: string;
}

export interface BiomarkerStore {
  get(memberId: string): Promise<BiomarkerRecord | null>;
  createIfAbsent(record: BiomarkerRecord): Promise<BiomarkerRecord>;
  save(record: BiomarkerRecord): Promise<void>;
  getPendingUpload(
    memberId: string,
    uploadId: string,
  ): Promise<BiomarkerPendingUpload | null>;
  savePendingUpload(upload: BiomarkerPendingUpload): Promise<void>;
  commitVerifiedUpload(input: {
    pending: BiomarkerPendingUpload;
    record: BiomarkerRecord;
  }): Promise<void>;
}

export class MemoryBiomarkerStore implements BiomarkerStore {
  readonly records = new Map<string, BiomarkerRecord>();
  readonly pendingUploads = new Map<string, BiomarkerPendingUpload>();
  async get(memberId: string): Promise<BiomarkerRecord | null> {
    return structuredClone(this.records.get(memberId) ?? null);
  }
  async createIfAbsent(record: BiomarkerRecord): Promise<BiomarkerRecord> {
    const existing = this.records.get(record.memberId);
    if (existing) return structuredClone(existing);
    this.records.set(record.memberId, structuredClone(record));
    return structuredClone(record);
  }
  async save(record: BiomarkerRecord): Promise<void> {
    this.records.set(record.memberId, structuredClone(record));
  }
  async getPendingUpload(
    memberId: string,
    uploadId: string,
  ): Promise<BiomarkerPendingUpload | null> {
    const pending = this.pendingUploads.get(uploadId);
    return pending?.memberId === memberId ? structuredClone(pending) : null;
  }
  async savePendingUpload(upload: BiomarkerPendingUpload): Promise<void> {
    this.pendingUploads.set(upload.uploadId, structuredClone(upload));
  }
  async commitVerifiedUpload(input: {
    pending: BiomarkerPendingUpload;
    record: BiomarkerRecord;
  }): Promise<void> {
    this.records.set(input.record.memberId, structuredClone(input.record));
    this.pendingUploads.delete(input.pending.uploadId);
  }
}

export class BiomarkerService {
  constructor(
    private readonly store: BiomarkerStore,
    private readonly uploadProvider: BiomarkerUploadProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async getExisting(memberId: string): Promise<BiomarkerRecord | null> {
    return this.store.get(memberId);
  }

  async getOrCreate(memberId: string): Promise<BiomarkerRecord> {
    const existing = await this.store.get(memberId);
    if (existing) return existing;
    const record: BiomarkerRecord = {
      biomarkerRecordId: crypto.randomUUID(),
      memberId,
      state: "not_started",
      partnerReference: null,
      reportStorageKey: null,
      reportFilename: null,
      consentVersion: null,
      consentedAt: null,
      updatedAt: this.now().toISOString(),
    };
    return this.store.createIfAbsent(record);
  }

  async transition(
    memberId: string,
    next: BiomarkerState,
  ): Promise<BiomarkerRecord> {
    const record = await this.getOrCreate(memberId);
    if (!canTransitionBiomarkerState(record.state, next)) {
      throw new Error(`Invalid biomarker transition: ${record.state} -> ${next}`);
    }
    const updated = { ...record, state: next, updatedAt: this.now().toISOString() };
    await this.store.save(updated);
    return updated;
  }

  async createReportUpload(input: {
    memberId: string;
    activeMember: boolean;
    filename: string;
    contentType: "application/pdf" | "image/jpeg" | "image/png";
    sizeBytes: number;
    consentAccepted: boolean;
    consentVersion: string;
  }): Promise<
    | {
        ok: true;
        uploadId: string;
        uploadUrl: string;
        expiresAt: string;
        record: BiomarkerRecord;
      }
    | {
        ok: false;
        code:
          | "membership_required"
          | "consent_required"
          | "file_invalid"
          | "private_upload_unavailable";
      }
  > {
    if (!input.activeMember) return { ok: false, code: "membership_required" };
    const consentVersion = input.consentVersion.trim();
    if (
      !input.consentAccepted ||
      !consentVersion ||
      consentVersion.length > 120
    ) {
      return { ok: false, code: "consent_required" };
    }
    if (
      !Number.isInteger(input.sizeBytes) ||
      input.sizeBytes <= 0 ||
      input.sizeBytes > 15 * 1024 * 1024
    ) {
      return { ok: false, code: "file_invalid" };
    }
    const safeFilename = input.filename
      .replace(/^.*[\\/]/, "")
      .replace(/[^A-Za-z0-9._-]/g, "_")
      .replace(/^[._-]+|[._-]+$/g, "")
      .slice(0, 180);
    if (!safeFilename) return { ok: false, code: "file_invalid" };
    const memberPartition = crypto
      .createHash("sha256")
      .update(input.memberId)
      .digest("hex")
      .slice(0, 24);
    const storageKey = `biomarker-reports/${memberPartition}/${crypto.randomUUID()}-${safeFilename}`;
    const grant = await this.uploadProvider.createPrivateUpload({
      memberId: input.memberId,
      storageKey,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      expiresInSeconds: 10 * 60,
    });
    if (!grant.ok) return { ok: false, code: "private_upload_unavailable" };

    const current = await this.getOrCreate(input.memberId);
    const at = this.now().toISOString();
    const pending: BiomarkerPendingUpload = {
      uploadId: crypto.randomUUID(),
      memberId: input.memberId,
      state: "pending",
      storageKey,
      filename: safeFilename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      consentVersion,
      consentedAt: at,
      expiresAt: grant.expiresAt,
      createdAt: at,
    };
    await this.store.savePendingUpload(pending);
    return {
      ok: true,
      uploadId: pending.uploadId,
      uploadUrl: grant.uploadUrl,
      expiresAt: grant.expiresAt,
      record: current,
    };
  }

  async confirmReportUpload(input: {
    memberId: string;
    activeMember: boolean;
    uploadId: string;
  }): Promise<
    | { ok: true; record: BiomarkerRecord }
    | {
        ok: false;
        code:
          | "membership_required"
          | "upload_not_found"
          | "upload_not_verified"
          | "state_conflict";
      }
  > {
    if (!input.activeMember) return { ok: false, code: "membership_required" };
    const uploadId = input.uploadId.trim();
    if (!uploadId) return { ok: false, code: "upload_not_found" };
    const pending = await this.store.getPendingUpload(input.memberId, uploadId);
    if (!pending) return { ok: false, code: "upload_not_found" };
    if (pending.expiresAt <= this.now().toISOString()) {
      return { ok: false, code: "upload_not_verified" };
    }

    const verified = await this.uploadProvider.verifyPrivateUpload({
      memberId: input.memberId,
      storageKey: pending.storageKey,
      contentType: pending.contentType,
      sizeBytes: pending.sizeBytes,
    });
    if (!verified.ok) return { ok: false, code: "upload_not_verified" };

    const current = await this.getOrCreate(input.memberId);
    if (
      current.state !== "not_started" &&
      !canTransitionBiomarkerState(current.state, "report_uploaded")
    ) {
      return { ok: false, code: "state_conflict" };
    }
    const record: BiomarkerRecord = {
      ...current,
      state: "report_uploaded",
      reportStorageKey: pending.storageKey,
      reportFilename: pending.filename,
      consentVersion: pending.consentVersion,
      consentedAt: pending.consentedAt,
      updatedAt: this.now().toISOString(),
    };
    await this.store.commitVerifiedUpload({ pending, record });
    return { ok: true, record };
  }
}
