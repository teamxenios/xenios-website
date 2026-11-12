/**
 * Hold the exact HCG listing while its labeled strength and formulation are verified.
 *
 * The hold withholds the disputed strength and blocks any purchase path. It does
 * not block an inquiry: a customer may add the listing to a quote request, and
 * staff decide what can be quoted.
 */
export const HCG_STRENGTH_REVIEW = {
  offeringId: "mo_2c3aec78638c9e2ff2a8",
  variantId: "mov_13073979f2da65f4e160",
  family: "research_peptides_materials",
  legacySlug: "research-peptides-materials-hcg-hcg-120000iu",
  slug: "research-peptides-materials-hcg-strength-under-review",
  // The existing formulation-pending guard also protects the legacy order path.
  specification: "HCG strength unverified and formulation pending",
  // The status a customer sees on the held listing. It is not a refusal.
  actionLabel: "Details under review",
  notice: "Strength and formulation are being verified. You can add this listing to a quote request; the team confirms the details before quoting.",
} as const;

export function isHcgStrengthReview(offeringId: string, variantId: string): boolean {
  return offeringId === HCG_STRENGTH_REVIEW.offeringId &&
    variantId === HCG_STRENGTH_REVIEW.variantId;
}
