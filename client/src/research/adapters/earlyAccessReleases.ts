// ---------------------------------------------------------------------------
// Private Early Access founder releases (pages/adminx/EarlyAccessReleases.tsx).
//
// Bearer discipline is the one from pages/adminx/auth.ts: every function takes
// the admin access token explicitly and forwards it to lib/api, which attaches
// "Authorization: Bearer <token>". The SERVER decides authority on every
// request, and the actor recorded on a release is whoever the server-side admin
// guard authenticated. Nothing here sends an actor, and adding one would not
// change the record, because the route reads it from the guard and never from
// the body.
// ---------------------------------------------------------------------------

import { apiGet, apiPost, type ApiResult } from "../lib/api";

const BASE = "/api/admin/research/early-access/releases";
const enc = encodeURIComponent;

/** The classification the SERVER assigned. The browser never computes one. */
export type FirstReleaseClassification =
  | "NOT_APPROVABLE_REGULATORY"
  | "NOT_APPROVABLE_IDENTITY"
  | "NOT_APPROVABLE_FORMULA"
  | "NOT_APPROVABLE_STRENGTH"
  | "NOT_APPROVABLE_SUPPLIER"
  | "NOT_APPROVABLE_FULFILLMENT"
  | "NOT_APPROVABLE_PRICE"
  | "APPROVABLE_FOR_EARLY_ACCESS";

export type FirstReleaseCandidateDto = {
  productId: string;
  variantId: string;
  slug: string;
  product: string;
  canonicalName: string;
  variant: string;
  sku: string;
  strength: string | null;
  presentation: string | null;
  priceCents: number | null;
  currency: string;
  supplier: string | null;
  fulfillmentMethod: string;
  inventoryState: string;
  quantityLimit: number | null;
  waivableBlockers: string[];
  /** Non-empty means no approval action may be offered for this unit. */
  nonwaivableBlockers: string[];
  classification: FirstReleaseClassification;
  recommendedAction: string;
  productVersion: string;
  regulatoryHoldReason: string | null;
  authoritativePresentation: boolean;
};

export type EarlyAccessReleaseDto = {
  releaseId: string;
  portal: string;
  productId: string;
  variantId: string;
  productVersion: string;
  status: "approved" | "revoked";
  approvedPriceCents: number;
  currency: string;
  waivedBlockers: string[];
  approvedQuantityLimit: number;
  expiresAt: string | null;
  actor: string;
  reason: string;
  recordedAt: string;
};

export type FounderReleaseReviewDto = {
  ok: true;
  evaluatedAt: string;
  counts: Record<FirstReleaseClassification, number>;
  candidates: FirstReleaseCandidateDto[];
  productsWithoutVariants: string[];
  releases: EarlyAccessReleaseDto[];
};

export type ReleaseHistoryDto = {
  ok: true;
  history: EarlyAccessReleaseDto[];
};

export function getFounderReleaseReview(
  token: string,
): Promise<ApiResult<FounderReleaseReviewDto>> {
  return apiGet<FounderReleaseReviewDto>(BASE, token);
}

export function getReleaseHistory(
  token: string,
  productId: string,
  variantId: string,
): Promise<ApiResult<ReleaseHistoryDto>> {
  return apiGet<ReleaseHistoryDto>(
    `${BASE}/history?productId=${enc(productId)}&variantId=${enc(variantId)}`,
    token,
  );
}

/**
 * What a founder release records. There is no `actor` field, deliberately.
 *
 * `productVersion` is the fingerprint the founder was SHOWN. The server
 * recomputes it and refuses a mismatch, so a unit that changed between the
 * screen rendering and the founder pressing approve cannot be approved unseen.
 */
export type FounderReleaseInput = {
  releaseId: string;
  productId: string;
  variantId: string;
  productVersion: string;
  status: "approved" | "revoked";
  reason: string;
  approvedPriceCents?: number;
  currency?: string;
  approvedQuantityLimit?: number;
  expiresAt?: string | null;
  waivedBlockers?: string[];
};

export function recordFounderRelease(
  token: string,
  input: FounderReleaseInput,
): Promise<ApiResult<{ ok: true; release: EarlyAccessReleaseDto }>> {
  return apiPost<{ ok: true; release: EarlyAccessReleaseDto }>(BASE, input, token);
}
