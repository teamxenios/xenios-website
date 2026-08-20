/**
 * The one answer to "may this row ever be a direct purchase?"
 *
 * WHY THIS FILE EXISTS
 *
 * Two mounted lanes decide the same thing about the same variant, from
 * different facts. The master-offerings action resolver refused a direct
 * purchase when the DISPLAY STATE said `care_pathway`. The assisted-order
 * catalog refused it when the display state said `care_pathway` OR when the
 * FAMILY was `clinical_formulations_503a`. Two rules, one variant.
 *
 * On the catalog as it ships today the two agree, because all 242 `503a`
 * variants happen to carry `care_pathway`. That agreement is a property of the
 * current data, not of the code. A display state is an editable per-row cell;
 * family membership is what the product IS. The moment one compounded
 * formulation is published as `available_now` — a single workbook edit — the
 * master-offerings lane would offer Add to Cart on it while the assisted-order
 * lane refused it, and 58% of the catalog sits in that family.
 *
 * That is the same shape as the defect fixed at 0aba726: invisible, because
 * the direct-commerce flag is off; and it would read as deliberate, because
 * each lane looks internally consistent. So the rule stops being written twice
 * and becomes one predicate both lanes consult.
 *
 * WHY FAMILY AND NOT ONLY DISPLAY STATE
 *
 * Care separation is a standing rule, not a display decision. A compounded
 * clinical formulation is provider-required because of what it is, and no
 * catalog state edit should be able to move it into research-use-only direct
 * commerce. Display state still refuses on its own; family is the floor
 * beneath it that an edit cannot lift.
 *
 * DIRECTION OF THE RULE
 *
 * Every entry here can only ever REFUSE a direct purchase. Nothing in this
 * file can grant one: purchase still requires an exact Product Control
 * `CartProductSelection`, and this predicate runs before that is consulted.
 * Adding a family here is therefore always the conservative move, and a family
 * with no published variants costs nothing today while closing the hazard for
 * the day it has some.
 */

import type { MasterOfferingDisplayState, MasterOfferingFamily } from "./contract";

/**
 * Families whose products are provider- or clinician-required, whatever the
 * catalog says about their availability.
 *
 * `clinical_formulations_503a` is the family the assisted-order lane already
 * names; it is repeated here so both lanes read it from one place rather than
 * from two literals. `clinician_guided_care` and `provider_network` are the
 * taxonomy's other two provider-domain families ("Care Pathways", "Provider
 * and Performance Network"); neither has a published variant today, so
 * including them changes nothing now and prevents the same drift later.
 */
export const PROVIDER_PATHWAY_FAMILIES: ReadonlySet<MasterOfferingFamily> =
  new Set<MasterOfferingFamily>([
    "clinical_formulations_503a",
    "clinician_guided_care",
    "provider_network",
  ]);

/**
 * Families that are not a purchasable research product at all.
 *
 * A shipping charge is a fulfillment amount, not merchandise. The 426-row
 * retail reconciliation flagged exactly this: `GRP-0364 FedEx Standard
 * Overnight` appears as a workbook row and "should not become a purchasable
 * catalog line; it belongs to fulfillment pricing". Both of its variants carry
 * `care_pathway` today, which refuses them for the wrong reason.
 */
export const NON_MERCHANDISE_FAMILIES: ReadonlySet<MasterOfferingFamily> =
  new Set<MasterOfferingFamily>(["shipping_and_fulfillment"]);

/** The display state that refuses a direct purchase on its own. */
const CARE_PATHWAY_DISPLAY_STATE: MasterOfferingDisplayState = "care_pathway";

/** Why a row may never be directly purchased. Null means nothing here refused it. */
export type DirectPurchaseRefusal =
  | "care_pathway_display_state"
  | "provider_pathway_family"
  | "non_merchandise_family";

/**
 * The facts this decision needs, and only those. Structural rather than the
 * normalized server type, so the browser contract and the server ingestion
 * model can both satisfy it without either importing the other.
 */
export interface MasterOfferingPathwaySubject {
  family: MasterOfferingFamily;
  displayState: MasterOfferingDisplayState;
  variantDisplayState: MasterOfferingDisplayState;
}

/**
 * Names the reason a direct purchase is forbidden, or null if none applies.
 *
 * The reason is returned rather than a bare boolean so a caller can say WHY a
 * row is not purchasable. A refusal that cannot explain itself is how the
 * previous two defects stayed invisible: the answer looked identical to the
 * honest one.
 */
export function directPurchaseRefusal(
  subject: MasterOfferingPathwaySubject,
): DirectPurchaseRefusal | null {
  if (NON_MERCHANDISE_FAMILIES.has(subject.family)) return "non_merchandise_family";
  if (PROVIDER_PATHWAY_FAMILIES.has(subject.family)) return "provider_pathway_family";
  if (
    subject.displayState === CARE_PATHWAY_DISPLAY_STATE ||
    subject.variantDisplayState === CARE_PATHWAY_DISPLAY_STATE
  ) {
    return "care_pathway_display_state";
  }
  return null;
}

/**
 * True when this row may never be a direct purchase.
 *
 * This is the predicate the master-offerings action resolver consults, and the
 * one the assisted-order catalog's `providerWorkflowRequired` should be
 * derived from, so the two lanes cannot answer differently for one variant.
 */
export function isDirectPurchaseForbidden(subject: MasterOfferingPathwaySubject): boolean {
  return directPurchaseRefusal(subject) !== null;
}

/**
 * True when the row is provider-required specifically — the subset of refusals
 * that should route a customer to the provider workflow rather than simply
 * decline. A non-merchandise row is refused but is NOT a care referral, so
 * telling a customer to start a provider workflow for a shipping line would be
 * a small lie.
 */
export function requiresProviderPathway(subject: MasterOfferingPathwaySubject): boolean {
  const refusal = directPurchaseRefusal(subject);
  return refusal === "provider_pathway_family" || refusal === "care_pathway_display_state";
}
