import { apiGet, apiPost, apiPut, type ApiResult } from "../lib/api";
import { uploadFileToGrant } from "./activation";

export type ProductFamily =
  | "research_vials"
  | "blends"
  | "supplements"
  | "programs"
  | "quantum"
  | "laboratory_supplies"
  | "diagnostics"
  | "clinician_guided_care"
  | "storage_and_organization";

export type ProductTruthState =
  | "available"
  | "request_access"
  | "coming_soon"
  | "documentation_pending"
  | "out_of_stock"
  | "under_review"
  | "clinician_pathway_pending"
  | "not_currently_offered";

export interface ProductPlatformProduct {
  productId: string;
  slug: string;
  displayName: string;
  family: ProductFamily;
  templateClass:
    | "research_material"
    | "blend"
    | "supplement"
    | "program"
    | "quantum"
    | "laboratory_supply"
    | "diagnostic"
    | "clinician_guided_care"
    | "storage_accessory";
  searchAliases: string[];
  truthState: ProductTruthState;
  priceCents: number | null;
  purchasable: boolean;
}

export interface ProductPlatformResponse {
  ok: true;
  capabilities: {
    certificateAccess: boolean;
    biomarkerReportUpload: boolean;
  };
  families: Array<{
    family: ProductFamily | "all_products";
    label: string;
    productCount: number;
  }>;
  products: ProductPlatformProduct[];
  supplements: Array<{
    category: "foundational" | "performance" | "longevity" | "specialty";
    label: string;
    status: "coming_soon";
    description: string;
    launchInterestHref: string;
  }>;
  storageAndOrganization: {
    accessories: string[];
    boundary: string;
  };
  supportCategories: string[];
  education: {
    topics: Array<{
      topicId: string;
      label: string;
      summary: string;
      href: string;
    }>;
    storageSources: Array<{
      sourceId: string;
      label: string;
      status: string;
      summary: string;
    }>;
    boundary: string;
  };
}

export interface PublicMetabolicPathway {
  pathwayId: string;
  publicName: string;
  publicStatus: string;
  publicCopy: string;
  actions: {
    joinInterestHref: string;
    exploreCareHref: string;
    askQuestionHref: string;
  };
}

export interface SuperpowerOffer {
  label: string;
  summary: string;
  status: "coming_soon" | "available" | "paused" | "unavailable";
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

export interface BiomarkerRecord {
  biomarkerRecordId: string;
  state:
    | "not_started"
    | "coming_soon"
    | "test_ordered"
    | "collection_scheduled"
    | "results_pending"
    | "results_available_through_partner"
    | "report_uploaded"
    | "review_requested"
    | "qualified_review_complete"
    | "follow_up_due"
    | "closed";
  reportFilename: string | null;
  consentVersion: string | null;
  consentedAt: string | null;
  updatedAt: string;
}

export interface AdminMetabolicPathway extends PublicMetabolicPathway {
  internalSearchAliases: string[];
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdminSupplementPlaceholder {
  category: "foundational" | "performance" | "longevity" | "specialty";
  label: string;
  description: string;
  launchInterestHref: string;
  status: "coming_soon";
  channelMetadata: Record<
    | "affiliate"
    | "wholesale"
    | "professional_dispensary"
    | "partner_fulfilled"
    | "private_label",
    {
      configured: boolean;
      partnerReference: string | null;
      publicUrl: string | null;
    }
  >;
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

export interface AdminSuperpowerOffer {
  offerId: string;
  label: string;
  summary: string;
  status: "coming_soon" | "available" | "paused" | "unavailable";
  availability: string;
  collectionMethod: string | null;
  priceCents: number | null;
  priceEffectiveDate: string | null;
  lastVerificationDate: string | null;
  lastReviewedDate: string | null;
  verifiedPriceDate: string | null;
  disclosure: string;
  interest: { enabled: boolean; href: string | null };
  affiliate: { enabled: boolean; url: string | null };
  adminEditable: true;
  updatedAt: string;
  updatedBy: string | null;
}

const paths = {
  platform: "/api/research/product-platform",
  pathways: "/api/research/metabolic-pathways",
  interest: "/api/research/metabolic-interest",
  superpower: "/api/research/diagnostics/superpower",
  biomarker: "/api/research/diagnostics/biomarker",
  biomarkerUpload: "/api/research/diagnostics/biomarker/report-upload",
  biomarkerConfirm: "/api/research/diagnostics/biomarker/report-upload/confirm",
  adminPathways: "/api/admin/research/metabolic-pathways",
  adminPathway: (pathwayId: string) =>
    `/api/admin/research/metabolic-pathways/${encodeURIComponent(pathwayId)}`,
  adminSupplements: "/api/admin/research/supplement-placeholders",
  adminSupplement: (category: string) =>
    `/api/admin/research/supplement-placeholders/${encodeURIComponent(category)}`,
  adminSuperpower: "/api/admin/research/superpower-offer",
  certificate: (sku: string) =>
    `/api/research/products/${encodeURIComponent(sku)}/certificates/access`,
} as const;

export function getProductPlatform(
  token: string | null,
): Promise<ApiResult<ProductPlatformResponse>> {
  return apiGet(paths.platform, token);
}

export function getMetabolicPathways(
  token: string | null,
): Promise<ApiResult<{ ok: true; pathways: PublicMetabolicPathway[] }>> {
  return apiGet(paths.pathways, token);
}

export function joinMetabolicInterest(
  token: string | null,
  input: {
    pathwayId: string;
    currentState: string;
    generalGoalCategory: string;
    preferredContact: string;
    interestDate: string;
    attributionSource: string;
    idempotencyKey: string;
  },
): Promise<ApiResult<{ ok: true; created: boolean }>> {
  return apiPost(paths.interest, input, token);
}

export function getSuperpowerOffer(
  token: string | null,
): Promise<ApiResult<{ ok: true; offer: SuperpowerOffer }>> {
  return apiGet(paths.superpower, token);
}

export function getBiomarkerRecord(
  token: string | null,
): Promise<
  ApiResult<{
    ok: true;
    reportUploadEnabled: boolean;
    biomarker: BiomarkerRecord;
  }>
> {
  return apiGet(paths.biomarker, token);
}

export async function uploadBiomarkerReport(
  token: string | null,
  input: { file: File; consentAccepted: boolean },
): Promise<ApiResult<{ ok: true; biomarker: BiomarkerRecord }>> {
  const prepared = await apiPost<{
    ok: true;
    uploadId: string;
    uploadUrl: string;
  }>(
    paths.biomarkerUpload,
    {
      filename: input.file.name,
      contentType: input.file.type,
      sizeBytes: input.file.size,
      consentAccepted: input.consentAccepted,
      consentVersion: "biomarker-report-storage-v1",
    },
    token,
  );
  if (prepared.kind !== "ok") return prepared;

  const uploaded = await uploadFileToGrant(
    prepared.data.uploadUrl,
    input.file,
    input.file.type,
  );
  if (!uploaded) {
    return {
      kind: "error",
      code: "private_upload_failed",
      message: "The private upload did not complete. Try again.",
    };
  }

  return apiPost(
    paths.biomarkerConfirm,
    { uploadId: prepared.data.uploadId },
    token,
  );
}

export function requestCertificateAccess(
  token: string | null,
  sku: string,
  lotCode: string,
): Promise<
  ApiResult<{
    ok: true;
    certificateId: string;
    lotId: string;
    signedUrl: string;
    expiresAt: string;
  }>
> {
  return apiPost(paths.certificate(sku), { lotCode }, token);
}

export function getAdminMetabolicPathways(
  token: string,
): Promise<ApiResult<{ ok: true; pathways: AdminMetabolicPathway[] }>> {
  return apiGet(paths.adminPathways, token);
}

export function updateAdminMetabolicPathway(
  token: string,
  pathwayId: string,
  patch: Pick<
    AdminMetabolicPathway,
    "publicName" | "publicStatus" | "publicCopy"
  >,
): Promise<ApiResult<{ ok: true; pathway: AdminMetabolicPathway }>> {
  return apiPut(paths.adminPathway(pathwayId), patch, token);
}

export function getAdminSupplementPlaceholders(
  token: string,
): Promise<ApiResult<{ ok: true; supplements: AdminSupplementPlaceholder[] }>> {
  return apiGet(paths.adminSupplements, token);
}

export function updateAdminSupplementPlaceholder(
  token: string,
  category: string,
  patch: Pick<
    AdminSupplementPlaceholder,
    "label" | "description" | "channelMetadata" | "launchInterestHref"
  >,
): Promise<ApiResult<{ ok: true; supplement: AdminSupplementPlaceholder }>> {
  return apiPut(paths.adminSupplement(category), patch, token);
}

export function getAdminSuperpowerOffer(
  token: string,
): Promise<ApiResult<{ ok: true; offer: AdminSuperpowerOffer }>> {
  return apiGet(paths.adminSuperpower, token);
}

export function updateAdminSuperpowerOffer(
  token: string,
  patch: Pick<
    AdminSuperpowerOffer,
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
  >,
): Promise<ApiResult<{ ok: true; offer: AdminSuperpowerOffer }>> {
  return apiPut(paths.adminSuperpower, patch, token);
}
