export const SUPPLEMENT_BRANDS = [
  "Momentous",
  "Pure Encapsulations",
  "Life Extension",
  "NutriDyn",
] as const;

export type SupplementBrand = (typeof SUPPLEMENT_BRANDS)[number];

export const MEDIA_RIGHTS_STATES = [
  "SUPPLIER_PROVIDED_APPROVED",
  "BRAND_MEDIA_PORTAL_APPROVED",
  "AUTHORIZED_RESELLER_USE",
  "WRITTEN_PERMISSION_APPROVED",
  "OFFICIAL_SOURCE_RIGHTS_PENDING",
  "INTERNAL_REVIEW_ONLY",
  "ORIGINAL_XENIOS_RENDER",
  "DO_NOT_USE",
] as const;

export type MediaRightsState = (typeof MEDIA_RIGHTS_STATES)[number];

export const SOURCE_MATCH_STATES = [
  "EXACT_MATCH",
  "HIGH_CONFIDENCE_MATCH",
  "REVIEW_REQUIRED",
  "NO_MATCH",
  "CONFLICT",
] as const;

export type SourceMatchState = (typeof SOURCE_MATCH_STATES)[number];

export const MEDIA_APPROVAL_STATES = [
  "PENDING_SOURCE",
  "SOURCE_FOUND",
  "RIGHTS_PENDING",
  "AWAITING_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
  "DO_NOT_USE",
] as const;

export type MediaApprovalState = (typeof MEDIA_APPROVAL_STATES)[number];

export const INGESTION_JOB_STATES = [
  "PENDING",
  "CLAIMED",
  "SOURCE_LOOKUP",
  "SOURCE_FOUND",
  "DOWNLOADING",
  "TRANSFORMING",
  "AWAITING_REVIEW",
  "APPROVED",
  "LINKED",
  "RETRY",
  "FAILED",
  "HELD",
] as const;

export type IngestionJobState = (typeof INGESTION_JOB_STATES)[number];

export interface SupplementManifestRow {
  sourceRowId: string;
  canonicalProductId: string;
  canonicalVariantId: string;
  exactSku: string | null;
  supplierProductCode: string | null;
  upc: string | null;
  brand: SupplementBrand;
  productName: string;
  variantOrFormat: string | null;
  packageCount: string | null;
  flavor: string | null;
  form: string | null;
  sizeOrWeight: string | null;
  recommendedPrice: number | null;
  currentOfferState: string | null;
  officialProductUrl: string | null;
}

export interface OfficialSourceProduct {
  officialProductUrl: string;
  officialImageUrl: string | null;
  brand: string;
  officialProductId: string | null;
  officialVariantId: string | null;
  officialSku: string | null;
  upc: string | null;
  productName: string;
  variantName: string | null;
  packageCount: string | null;
  form: string | null;
  flavor: string | null;
  sizeOrWeight: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  altText: string | null;
  retrievedAt: string;
  sourceAdapter: string;
  sourceHash: string;
}

export interface SourceLookupResult {
  sourceUrl: string;
  candidates: OfficialSourceProduct[];
  warnings: string[];
}

export interface OfficialSourceAdapter {
  readonly id: string;
  supports(row: SupplementManifestRow): boolean;
  lookup(row: SupplementManifestRow): Promise<SourceLookupResult>;
}

export interface MatchDifference {
  field: string;
  expected: string | null;
  actual: string | null;
  severity: "info" | "conflict";
}

export interface SourceMatchResult {
  state: SourceMatchState;
  score: number;
  differences: MatchDifference[];
  candidate: OfficialSourceProduct | null;
}

export interface RightsEvidence {
  status: MediaRightsState;
  evidenceReference: string | null;
  grantedBy: string | null;
  permissionDate: string | null;
  expiresAt: string | null;
  limitations: string | null;
}

export interface SupplementMediaRecord {
  assetId: string;
  canonicalProductId: string;
  canonicalVariantId: string;
  sku: string | null;
  upc: string | null;
  brand: SupplementBrand;
  productName: string;
  variant: string | null;
  packageCount: string | null;
  form: string | null;
  flavor: string | null;
  sourceType: "OFFICIAL_PAGE" | "SUPPLIER_FEED" | "MANUAL_UPLOAD";
  sourceProductUrl: string | null;
  sourceImageUrl: string | null;
  sourceHash: string | null;
  sourceAdapter: string | null;
  matchState: SourceMatchState;
  matchScore: number;
  matchDifferences: MatchDifference[];
  rights: RightsEvidence;
  retrievedAt: string | null;
  width: number | null;
  height: number | null;
  format: string | null;
  viewType: string | null;
  storagePath: string | null;
  publicUrl: string | null;
  altText: string;
  approvalStatus: MediaApprovalState;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  supersededBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SupplementIngestionJob {
  jobId: string;
  idempotencyKey: string;
  brand: SupplementBrand;
  sourceRow: string;
  canonicalVariantId: string;
  status: IngestionJobState;
  attemptCount: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  nextRetryAt: string | null;
  sourceAdapter: string | null;
}
