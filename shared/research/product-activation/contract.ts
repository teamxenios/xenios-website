// Product activation: the vocabulary and the fail-closed gate between "someone
// says a pharmacy can supply this" and "a customer can order it".
//
// The business fact this file exists to make unrepresentable: a VERBAL supply
// confirmation (today: Kris's telemedicine/pharmacy relationships) is real
// commercial information worth displaying internally, and it is NOT any of
// LIVE, ORDERABLE, ACTIVE_IN_ALL_STATES, PRICED, CONTRACTED or
// FORMULARY_VERIFIED. A product reaches "live" only through a completed
// documentation checklist PLUS a recorded founder activation approval. Every
// derivation in this file refuses toward the safer state.
//
// This overlay COMPOSES with the existing catalog authorities; it never
// overrides them. `pathway-authority.ts` can still refuse a direct purchase,
// and a founder release ledger row is still required for anything to sell.
// The overlay can only ever move a product DOWN from what the base display
// state would allow, never up.

export const PRODUCT_ACTIVATION_STATUSES = [
  "live",
  "request_only",
  "provider_required",
  "verbally_confirmed_pending_documentation",
  "pending_pharmacy_activation",
  "held",
  "unavailable",
] as const;

export type ProductActivationStatus = (typeof PRODUCT_ACTIVATION_STATUSES)[number];

/**
 * What a supply confirmation is grounded on. "verbal" is a real, recorded
 * business signal — and it is structurally incapable of producing "live".
 */
export const SUPPLY_CONFIRMATION_BASES = ["none", "verbal", "documented"] as const;
export type SupplyConfirmationBasis = (typeof SUPPLY_CONFIRMATION_BASES)[number];

/**
 * The documentation checklist a provider/pharmacy product must complete before
 * activation can even be proposed. Every field is evidence someone recorded,
 * not a boolean someone toggled: each present string names its document/source.
 */
export type ActivationChecklist = Readonly<{
  exactFormulation: string | null;
  exactStrength: string | null;
  dosageForm: string | null;
  /** "503A" | "503B" recorded with the pharmacy that owns the lane. */
  pharmacyLane: string | null;
  stateAvailability: string | null;
  providerRequirements: string | null;
  pharmacyPricing: string | null;
  turnaround: string | null;
  shippingModel: string | null;
  documentationTesting: string | null;
  contractingApproval: string | null;
}>;

export const EMPTY_ACTIVATION_CHECKLIST: ActivationChecklist = Object.freeze({
  exactFormulation: null,
  exactStrength: null,
  dosageForm: null,
  pharmacyLane: null,
  stateAvailability: null,
  providerRequirements: null,
  pharmacyPricing: null,
  turnaround: null,
  shippingModel: null,
  documentationTesting: null,
  contractingApproval: null,
});

export type ActivationOverlayEntry = Readonly<{
  /** Founder-workbook Group ID ("GRP-0323") — the stable cross-source key. */
  groupId: string;
  /** Human label for admin surfaces; never replaces catalog copy. */
  label: string;
  confirmationBasis: SupplyConfirmationBasis;
  /** Who recorded the confirmation and when — provenance, not authority. */
  confirmedBy: string | null;
  confirmedAt: string | null;
  checklist: ActivationChecklist;
  /**
   * The founder's explicit activation approval for THIS product, recorded as
   * actor + ISO timestamp. Absent ⇒ "live" is unreachable, whatever else says.
   */
  founderActivationApproval: Readonly<{ approvedBy: string; approvedAt: string }> | null;
  /** An explicit hold always wins over everything below it. */
  held: boolean;
}>;

/** The checklist fields still missing, in declaration order. */
export function activationBlockers(checklist: ActivationChecklist): readonly (keyof ActivationChecklist)[] {
  return (Object.keys(EMPTY_ACTIVATION_CHECKLIST) as (keyof ActivationChecklist)[]).filter(
    (key) => checklist[key] === null || checklist[key]!.trim() === "",
  );
}

/**
 * The base status a catalog row projects BEFORE any overlay is considered,
 * from the member-safe artifact's display state. Informative mapping recorded
 * in the blitz coordination file; anything unknown refuses to "unavailable".
 */
export function baseStatusFromDisplayState(displayState: string): ProductActivationStatus {
  switch (displayState) {
    case "available_now":
      return "live";
    case "available_this_week":
    case "request_access":
      return "request_only";
    case "care_pathway":
    case "approval_required":
      return "provider_required";
    case "temporarily_unavailable":
      return "held";
    default:
      return "unavailable";
  }
}

const STATUS_SEVERITY: Readonly<Record<ProductActivationStatus, number>> = Object.freeze({
  // Higher = more restrictive. resolveActivationStatus may only move a product
  // toward a HIGHER severity than its base, never lower.
  live: 0,
  request_only: 1,
  provider_required: 2,
  pending_pharmacy_activation: 3,
  verbally_confirmed_pending_documentation: 4,
  held: 5,
  unavailable: 6,
});

export function isMoreRestrictive(a: ProductActivationStatus, b: ProductActivationStatus): boolean {
  return STATUS_SEVERITY[a] > STATUS_SEVERITY[b];
}

/**
 * Resolve the account/catalog-facing activation status for one product.
 *
 * THE ONE INVARIANT (P1-7, 2026-08-27): the final status is NEVER more
 * permissive than the base. The overlay may restrict; it may never
 * liberalize. `held` stays held and `unavailable` stays unavailable no
 * matter what an overlay entry claims — changing a canonical base state is a
 * separately authorized act on the base catalog, not an overlay side effect.
 * The final clamp below enforces this for every branch, so no future branch
 * can reintroduce the defect the adversarial review found (a documented
 * overlay resolving a held/unavailable base down to
 * pending_pharmacy_activation).
 *
 * Within that invariant, the ladder:
 *   1. An explicit hold proposes "held".
 *   2. Basis "none" proposes the base itself (the overlay asserts nothing).
 *   3. A verbal-only confirmation proposes
 *      `verbally_confirmed_pending_documentation` — never live, never
 *      orderable — even if every checklist field were filled in.
 *   4. A documented confirmation with an incomplete checklist, or without a
 *      founder approval record, proposes `pending_pharmacy_activation`.
 *   5. Documented + complete + approved proposes the base: the overlay is
 *      satisfied and can only confirm what the catalog already permits —
 *      it cannot skip the provider pathway, and it never invents live
 *      (a live base additionally requires the founder release ledger,
 *      enforced elsewhere).
 */
export function resolveActivationStatus(
  base: ProductActivationStatus,
  overlay: ActivationOverlayEntry | null,
): ProductActivationStatus {
  if (overlay === null) return base;
  const proposed = ((): ProductActivationStatus => {
    if (overlay.held) return "held";
    if (overlay.confirmationBasis === "none") return base;
    if (overlay.confirmationBasis === "verbal") {
      return "verbally_confirmed_pending_documentation";
    }
    // documented:
    if (activationBlockers(overlay.checklist).length > 0) return "pending_pharmacy_activation";
    if (overlay.founderActivationApproval === null) return "pending_pharmacy_activation";
    return base;
  })();
  // The monotonic clamp: keep whichever of base/proposed is more restrictive.
  return isMoreRestrictive(base, proposed) ? base : proposed;
}

/** True only when nothing stands between this entry and founder-approved life. */
export function activationComplete(overlay: ActivationOverlayEntry): boolean {
  return (
    !overlay.held &&
    overlay.confirmationBasis === "documented" &&
    activationBlockers(overlay.checklist).length === 0 &&
    overlay.founderActivationApproval !== null
  );
}

// ---------------------------------------------------------------------------
// Catalog-priority projection: the member-facing wire shape for the current
// demand collection. STATUSES ONLY — demand counts, confirmer identity,
// checklist contents, and every other overlay field stay server-side
// (the client's account-portal-policy test pins the receiving side).
// ---------------------------------------------------------------------------

export type CatalogPriorityQueueItemDto = Readonly<{
  /** The overlay's stable queueId ("Q-2026-08-26-01") — never a label join. */
  key: string;
  title: string;
  status: ProductActivationStatus;
}>;

export type CatalogPriorityDto = Readonly<{
  /**
   * Demand-definition key → resolved activation status. A key that is absent
   * here must project "unavailable" in every consumer — fail closed.
   */
  statuses: Readonly<Record<string, ProductActivationStatus>>;
  queue: readonly CatalogPriorityQueueItemDto[];
}>;
