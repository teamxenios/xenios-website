import crypto from "crypto";

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
  disclosure: string;
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
  disclosure: string;
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
  disclosure:
    "If an affiliate relationship is enabled later, Xenios may receive compensation. No affiliate link is active today.",
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
    disclosure: offer.disclosure,
    affiliateUrl:
      offer.affiliate.enabled && offer.status === "available" ? offer.affiliate.url : null,
    researchBoundary: SUPERPOWER_RESEARCH_BOUNDARY,
  };
}

export class SuperpowerOfferRepository {
  private offer = structuredClone(DEFAULT_SUPERPOWER_OFFER);

  readPublic(): PublicSuperpowerOffer {
    return toPublicSuperpowerOffer(this.offer);
  }

  readAdmin(): SuperpowerOfferConfig {
    return structuredClone(this.offer);
  }

  update(
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
        | "disclosure"
        | "affiliate"
      >
    >,
    actor: string,
    at: string,
  ): SuperpowerOfferConfig {
    if (patch.affiliate?.enabled && !patch.affiliate.url?.startsWith("https://")) {
      throw new Error("An enabled affiliate offer requires an HTTPS URL.");
    }
    this.offer = {
      ...this.offer,
      ...structuredClone(patch),
      offerId: this.offer.offerId,
      adminEditable: true,
      updatedAt: at,
      updatedBy: actor,
    };
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
}

export class DisabledBiomarkerUploadProvider implements BiomarkerUploadProvider {
  async createPrivateUpload(): Promise<{ ok: false; code: "disabled" }> {
    return { ok: false, code: "disabled" };
  }
}

export interface BiomarkerStore {
  get(memberId: string): Promise<BiomarkerRecord | null>;
  save(record: BiomarkerRecord): Promise<void>;
}

export class MemoryBiomarkerStore implements BiomarkerStore {
  readonly records = new Map<string, BiomarkerRecord>();
  async get(memberId: string): Promise<BiomarkerRecord | null> {
    return structuredClone(this.records.get(memberId) ?? null);
  }
  async save(record: BiomarkerRecord): Promise<void> {
    this.records.set(record.memberId, structuredClone(record));
  }
}

export class BiomarkerService {
  constructor(
    private readonly store: BiomarkerStore,
    private readonly uploadProvider: BiomarkerUploadProvider,
    private readonly now: () => Date = () => new Date(),
  ) {}

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
    await this.store.save(record);
    return record;
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
    | { ok: true; uploadUrl: string; expiresAt: string; record: BiomarkerRecord }
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
    if (!input.consentAccepted || !input.consentVersion.trim()) {
      return { ok: false, code: "consent_required" };
    }
    if (input.sizeBytes <= 0 || input.sizeBytes > 15 * 1024 * 1024) {
      return { ok: false, code: "file_invalid" };
    }
    const safeFilename = input.filename.replace(/^.*[\\/]/, "").replace(/[^A-Za-z0-9._-]/g, "_");
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
    const record: BiomarkerRecord = {
      ...current,
      state: "report_uploaded",
      reportStorageKey: storageKey,
      reportFilename: safeFilename,
      consentVersion: input.consentVersion,
      consentedAt: at,
      updatedAt: at,
    };
    await this.store.save(record);
    return { ok: true, uploadUrl: grant.uploadUrl, expiresAt: grant.expiresAt, record };
  }
}

