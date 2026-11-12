import { createHash } from "node:crypto";
import type { ReviewedProductContent } from "@shared/research/master-offerings/approved-content";
import type { InquiryReviewState } from "./inquiry-review-states";

/** Server-only exception for education during an ongoing *clinical* hold. Never an offering decision. */
type Context = Readonly<{ datasetSha256: string; family: string; offeringId: string; sourceVariantId: string }>;
type EligibleCode = "risk_review" | "offering_decision";
type Copy = Required<Pick<ReviewedProductContent, "summary" | "overview" | "purpose" | "cautions">>;
/**
 * One accepted description, shown beside its hold. Purpose and cautions are
 * part of the accepted record and are shown with it, verbatim: an overview may
 * refer the reader to the cautions, so neither is optional.
 *
 * The two review receipts are stored as the sha256 of the receipt text, never
 * the receipt itself: this file is in a public repository. Repository review
 * hashes the cited receipt and compares.
 */
export type HeldEducationGrant = Context & Readonly<{
  holdCode: EligibleCode; holdMessage: string;
  summary: string; overview: string; purpose: string; cautions: string;
  contentReviewReceiptSha256: string; displayDecisionReceiptSha256: string; digest: string;
}>;
const key = (offering: string, variant: string) => JSON.stringify([offering, variant]);
const hex = (s: unknown) => typeof s === "string" && /^[0-9a-f]{64}$/.test(s);
const clean = (s: unknown, max: number) => typeof s === "string" && s === s.trim()
  && s.length > 0 && s.length <= max && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(s);
const permitted = (c: string): c is EligibleCode => c === "risk_review" || c === "offering_decision";

/** The digest a receipt is stored as. */
export function heldEducationReceiptSha256(receipt: string): string {
  return createHash("sha256").update(receipt, "utf8").digest("hex");
}

/** Bind BOTH review receipts to the reviewed SKU, dataset, exact notice and exact words. Repository review verifies the cited decisions. */
export function heldEducationDigest(r: Omit<HeldEducationGrant, "digest">): string {
  return createHash("sha256").update(JSON.stringify(["clinical-held-education-v2", r.datasetSha256, r.family,
    r.offeringId, r.sourceVariantId, r.holdCode, r.holdMessage, r.summary, r.overview, r.purpose, r.cautions,
    r.contentReviewReceiptSha256, r.displayDecisionReceiptSha256])).digest("hex");
}
export function createHeldEducationLookup(raw: readonly HeldEducationGrant[]) {
  const groups = new Map<string, HeldEducationGrant | null>();
  for (const r of raw) {
    const k = key(r.offeringId,r.sourceVariantId);
    // Reject duplicate registrations (including an invalid prior registration) for this pair only.
    groups.set(k, groups.has(k) ? null : Object.freeze({ ...r }));
  }
  return (ctx: Context, hold: InquiryReviewState | null): Copy | undefined => {
    if (!hold || !permitted(hold.staffReviewCode) || ctx.family !== "clinical_formulations_503a"
      || hold.neutralSpecification !== null || !hex(ctx.datasetSha256)) return undefined;
    const r = groups.get(key(ctx.offeringId,ctx.sourceVariantId));
    if (!r || !/^mo_[0-9a-f]+$/.test(r.offeringId) || !/^mov_[0-9a-f]+$/.test(r.sourceVariantId)
      || ctx.datasetSha256 !== r.datasetSha256 || ctx.family !== r.family || !permitted(r.holdCode)
      || hold.staffReviewCode !== r.holdCode || hold.customerMessage !== r.holdMessage
      || !clean(r.holdMessage, 1500) || !clean(r.summary, 1200) || !clean(r.overview, 12000)
      || !clean(r.purpose, 4000) || !clean(r.cautions, 8000)
      || !hex(r.contentReviewReceiptSha256) || !hex(r.displayDecisionReceiptSha256)
      || r.contentReviewReceiptSha256 === r.displayDecisionReceiptSha256
      || !hex(r.digest) || heldEducationDigest(r) !== r.digest) return undefined;
    // Project only the four reviewed education fields. Never expose receipts, spec/strength, commerce, or staff code.
    return Object.freeze({ summary:r.summary, overview:r.overview, purpose:r.purpose, cautions:r.cautions });
  };
}
