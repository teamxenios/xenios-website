/** Presentation only: no eligibility, price, consent, dosing, or fulfillment authority. */
export type GuidanceCategory = "clinical" | "research" | "supplement" | "nonclinical" | "service" | "unconfirmed";
export interface ProductGuidanceInput {
  readonly clinicalReviewRequired?: unknown;
  readonly researchUseOnly?: unknown;
  readonly family?: unknown;
  readonly intentExclusion?: unknown;
  readonly sourceRefusal?: unknown;
}
export interface ProductGuidance {
  readonly category: GuidanceCategory;
  readonly label: string;
  readonly explanation: string;
  /** Important limits are always visible, never hidden in a tooltip/disclosure. */
  readonly limits: readonly string[];
}
export const RESEARCH_LIMIT = "Research Use Only. Nonclinical use only. Not for human or veterinary use.";
export const CLINICAL_LIMIT = "A product request is not a prescription or treatment approval.";
const CLINICAL_PATHWAY_LIMIT = "Clinical review required. Not a prescription. A request does not approve treatment.";
const INTERNAL_REVIEW = "Internal review required.";
export const REQUEST_LIMIT = "Submitting a request does not collect payment or confirm an order, prescription, availability or shipping.";
export const CATEGORY_ORDER: readonly GuidanceCategory[] = ["clinical", "supplement", "nonclinical", "research", "service", "unconfirmed"];
const RESEARCH_FAMILIES = new Set(["research_peptides_materials", "research_capsules"]);
const HELD = new Set(["classification_pending", "formulation_hold"]);

function result(category: GuidanceCategory, label: string, explanation: string, limits: string[]): ProductGuidance {
  return Object.freeze({ category, label, explanation, limits: Object.freeze(limits) });
}
function unresolved(input: ProductGuidanceInput, reason: string): ProductGuidance {
  const limits: string[] = [];
  if (input.researchUseOnly === true || RESEARCH_FAMILIES.has(String(input.family))) limits.push(RESEARCH_LIMIT);
  if (input.clinicalReviewRequired === true || input.family === "clinical_formulations_503a") limits.push(CLINICAL_PATHWAY_LIMIT);
  if (input.clinicalReviewRequired === false && input.researchUseOnly === false && input.intentExclusion !== "non_merchandise") {
    limits.push(INTERNAL_REVIEW);
  }
  limits.push("Use the listing’s current request options; category information does not remove a restriction.");
  return result("unconfirmed", "Product details being confirmed", reason, limits);
}
export function productGuidance(value: ProductGuidanceInput | null | undefined): ProductGuidance {
  const input = value ?? {};
  const clinical = input.clinicalReviewRequired;
  const research = input.researchUseOnly;
  // A missing/contradictory flag never becomes a wellness-product assertion.
  if (typeof clinical !== "boolean" || typeof research !== "boolean")
    return unresolved(input, "The product pathway is not fully confirmed in this listing. Contact support for the exact item information.");
  if (clinical && research)
    return unresolved(input, "This listing contains conflicting clinical and research indicators. Contact support before proceeding.");
  if (HELD.has(String(input.sourceRefusal)))
    return unresolved(input, "This product has a classification or formulation hold. Its current restriction remains in place.");
  if ((input.family === "clinical_formulations_503a" && !clinical) ||
      (RESEARCH_FAMILIES.has(String(input.family)) && !research))
    return unresolved(input, "The listing’s category and pathway indicators do not agree. The exact item needs confirmation.");
  if (clinical) return result("clinical", "Clinical review pathway",
    "This item follows a clinical review pathway. A qualified prescriber assesses suitability and any prescription requirements before clinical supply.", [CLINICAL_PATHWAY_LIMIT]);
  if (research) return result("research", "Laboratory research material",
    "This item is designated for legitimate laboratory or analytical research, a separate pathway from clinical products and everyday wellness products.", [RESEARCH_LIMIT]);
  if (input.intentExclusion === "non_merchandise" || input.sourceRefusal === "non_merchandise_family")
    return result("service", "Service information", "This listing describes a service rather than a product to add to this request.",
      ["Review the listing’s specific scope and current request options."]);
  if (input.family === "supplements") return result("supplement", "Dietary supplement",
    "Review the selected manufacturer’s ingredients, serving information and cautions. Supplements follow their labeled use, not the laboratory research pathway.",
    [INTERNAL_REVIEW + " Supplements are not a substitute for prescribed care and are not intended to diagnose, treat, cure or prevent disease."]);
  return result("nonclinical", "Nonclinical product",
    "Nonclinical is a broad category, not a synonym for research-only. Use this item only as described by its exact label and verified product information.",
    [INTERNAL_REVIEW + " The listing and product label determine the intended use; a format or product name alone does not."]);
}
export interface SelectionGuidanceInput extends ProductGuidanceInput {
  readonly productId: string;
  readonly variantId: string;
}
export interface SelectionGuidanceSummary {
  readonly distinctVariants: number;
  readonly counts: Readonly<Record<GuidanceCategory, number>>;
  readonly researchPresent: boolean;
  readonly clinicalPresent: boolean;
  readonly conflictingIdentity: boolean;
}
/** Deduplicates exact pairs only; differing flags for the same pair fail toward unconfirmed. */
export function summarizeSelection(items: readonly SelectionGuidanceInput[]): SelectionGuidanceSummary {
  const rows = new Map<string, ProductGuidance>();
  let researchPresent = false, clinicalPresent = false, conflictingIdentity = false;
  for (const item of items) {
    const current = productGuidance(item);
    researchPresent ||= item.researchUseOnly === true || RESEARCH_FAMILIES.has(String(item.family));
    clinicalPresent ||= item.clinicalReviewRequired === true || item.family === "clinical_formulations_503a";
    const key = JSON.stringify([item.productId, item.variantId]);
    const previous = rows.get(key);
    if (previous && JSON.stringify(previous) !== JSON.stringify(current)) {
      conflictingIdentity = true;
      rows.set(key, unresolved({}, "Conflicting information was returned for the same variant."));
    } else if (!previous) rows.set(key, current);
  }
  const counts: Record<GuidanceCategory, number> = { clinical: 0, research: 0, supplement: 0, nonclinical: 0, service: 0, unconfirmed: 0 };
  for (const row of rows.values()) counts[row.category] += 1;
  return Object.freeze({ distinctVariants: rows.size, counts: Object.freeze(counts), researchPresent, clinicalPresent, conflictingIdentity });
}
export const CATEGORY_NAMES: Readonly<Record<GuidanceCategory, string>> = Object.freeze({
  clinical: "Clinical review", research: "Laboratory research", supplement: "Dietary supplements",
  nonclinical: "Other nonclinical products", service: "Services", unconfirmed: "Details to confirm",
});
