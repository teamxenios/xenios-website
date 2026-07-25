import crypto from "crypto";
import type {
  ProductRequestCategory,
  ProductRequestCreateInput,
  ProductRequestFrequency,
  ProductRequestTiming,
} from "@shared/research/product-requests";
import {
  normalizeDemandName,
  validateSubmittedProductUrl,
} from "../product-requests";
import type { ProductRequestEntryPoint } from "./product-request-sources";

export {
  PRODUCT_REQUEST_ENTRY_POINTS,
  productRequestHref,
} from "./product-request-sources";
export type { ProductRequestEntryPoint } from "./product-request-sources";

export interface Website3ProductRequestForm {
  productName: string;
  category: ProductRequestCategory;
  description: string;
  brand?: string | null;
  httpsLink?: string | null;
  screenshot?: {
    originalFilename: string;
    contentType: "image/jpeg" | "image/png" | "image/webp";
    sizeBytes: number;
  } | null;
  desiredFormat?: string | null;
  desiredSize?: string | null;
  quantity?: string | null;
  frequency?: ProductRequestFrequency | null;
  timing?: ProductRequestTiming | null;
  notes?: string | null;
  contactConsent: boolean;
  attributionSource: ProductRequestEntryPoint;
  idempotencyKey: string;
}

export type ProductRequestHandoff =
  | {
      ok: true;
      request: ProductRequestCreateInput;
      screenshot: Website3ProductRequestForm["screenshot"];
      attributionSource: ProductRequestEntryPoint;
    }
  | { ok: false; field: "httpsLink"; message: string };

/**
 * Adapts Website 3's exact form vocabulary into the existing authoritative
 * product-request service. The existing service remains responsible for the
 * member-bound record, private signed upload, idempotency, events, and emails.
 */
export function toExistingProductRequest(
  input: Website3ProductRequestForm,
): ProductRequestHandoff {
  const url = validateSubmittedProductUrl(input.httpsLink);
  if (!url.ok) return { ok: false, field: "httpsLink", message: url.message };
  const presentation = [
    input.desiredFormat?.trim() ? `Format: ${input.desiredFormat.trim()}` : null,
    input.desiredSize?.trim() ? `Size: ${input.desiredSize.trim()}` : null,
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
  return {
    ok: true,
    request: {
      productName: input.productName.trim(),
      category: input.category,
      description: input.description.trim(),
      brand: input.brand?.trim() || null,
      productUrl: url.value,
      desiredPresentation: presentation || null,
      desiredQuantity: input.quantity?.trim() || null,
      expectedPurchaseFrequency: input.frequency ?? null,
      interestTiming: input.timing ?? null,
      additionalNotes: input.notes?.trim() || null,
      contactConsent: input.contactConsent,
      idempotencyKey: input.idempotencyKey,
    },
    screenshot: input.screenshot ?? null,
    attributionSource: input.attributionSource,
  };
}

export const DEMAND_CANDIDATE_STATUSES = [
  "new",
  "normalizing",
  "under_review",
  "supplier_diligence",
  "commercial_review",
  "planned",
  "catalogued",
  "not_moving_forward",
  "closed",
] as const;
export type DemandCandidateStatus = (typeof DEMAND_CANDIDATE_STATUSES)[number];

export interface ProductDemandSignal {
  requestId: string;
  memberId: string;
  productName: string;
  brand: string | null;
  category: ProductRequestCategory;
  requestedAt: string;
  timing: ProductRequestTiming | null;
  frequency: ProductRequestFrequency | null;
  attributionSource: string | null;
  affiliateSource: string | null;
  professionalSource: string | null;
  cohort: string | null;
}

export interface ProductDemandCandidate {
  candidateId: string;
  normalizedCandidate: string;
  brand: string | null;
  category: ProductRequestCategory;
  uniqueMembers: number;
  totalRequests: number;
  firstRequestAt: string;
  latestRequestAt: string;
  urgency: "high" | "medium" | "low" | "not_provided";
  frequency: Record<ProductRequestFrequency | "not_provided", number>;
  attributionSources: string[];
  affiliateSources: string[];
  professionalSources: string[];
  cohorts: string[];
  status: DemandCandidateStatus;
  requestIds: string[];
}

function urgency(
  timings: Array<ProductRequestTiming | null>,
): ProductDemandCandidate["urgency"] {
  if (timings.includes("asap")) return "high";
  if (timings.includes("within_30_days")) return "medium";
  if (
    timings.includes("within_90_days") ||
    timings.includes("future_interest") ||
    timings.includes("researching")
  ) {
    return "low";
  }
  return "not_provided";
}

function unique(values: Array<string | null>): string[] {
  return Array.from(
    new Set(values.filter((value): value is string => Boolean(value))),
  ).sort();
}

export function aggregateProductDemand(
  signals: readonly ProductDemandSignal[],
): ProductDemandCandidate[] {
  const groups = new Map<string, ProductDemandSignal[]>();
  for (const signal of signals) {
    const normalized = normalizeDemandName(signal.productName);
    const brand = normalizeDemandName(signal.brand ?? "");
    const key = `${signal.category}|${normalized}|${brand}`;
    groups.set(key, [...(groups.get(key) ?? []), signal]);
  }
  return Array.from(groups.entries()).map(([key, rows]) => {
    const sorted = [...rows].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
    const frequency: ProductDemandCandidate["frequency"] = {
      one_time: 0,
      occasionally: 0,
      monthly: 0,
      not_sure: 0,
      not_provided: 0,
    };
    for (const row of rows) {
      const frequencyKey: ProductRequestFrequency | "not_provided" =
        row.frequency ?? "not_provided";
      frequency[frequencyKey] += 1;
    }
    return {
      candidateId: `candidate_${crypto.createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
      normalizedCandidate: normalizeDemandName(rows[0].productName),
      brand: rows[0].brand?.trim() || null,
      category: rows[0].category,
      uniqueMembers: new Set(rows.map((row) => row.memberId)).size,
      totalRequests: rows.length,
      firstRequestAt: sorted[0].requestedAt,
      latestRequestAt: sorted[sorted.length - 1].requestedAt,
      urgency: urgency(rows.map((row) => row.timing)),
      frequency,
      attributionSources: unique(rows.map((row) => row.attributionSource)),
      affiliateSources: unique(rows.map((row) => row.affiliateSource)),
      professionalSources: unique(rows.map((row) => row.professionalSource)),
      cohorts: unique(rows.map((row) => row.cohort)),
      status: "new",
      requestIds: rows.map((row) => row.requestId).sort(),
    };
  });
}

export type MemberDemandSummary = Pick<
  ProductDemandCandidate,
  "normalizedCandidate" | "category" | "uniqueMembers" | "totalRequests" | "status"
>;

/** Explicit allowlist: requester ids and sources never reach another member. */
export function toMemberDemandSummary(
  candidate: ProductDemandCandidate,
): MemberDemandSummary {
  return {
    normalizedCandidate: candidate.normalizedCandidate,
    category: candidate.category,
    uniqueMembers: candidate.uniqueMembers,
    totalRequests: candidate.totalRequests,
    status: candidate.status,
  };
}
