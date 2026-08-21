/**
 * THE ONE ANSWER to "what happens when this customer picks this product?"
 *
 * Xenios Research Early Access is ONE catalog with several truthful commercial
 * pathways, not several catalogs. Every row in the canonical catalog resolves
 * here, on the server, to exactly one customer pathway, and the browser routes
 * on that answer rather than deciding for itself.
 *
 * WHY THIS IS NOT DERIVED FROM PRICE. The tempting rule is
 * `unitPriceCents !== null ? buy : ask`. It is wrong in both directions and
 * each direction is a real row in the shipped catalog:
 *
 *   - 242 of the 420 rows are 503A clinical formulations. They carry a real
 *     retail price AND must never become a direct purchase; they continue
 *     through Care. Showing a price is not permission to buy.
 *   - 32 rows are priced and held pending activation. Priced, still not for
 *     sale.
 *   - Rows with no price are not uniformly "ask us": one is genuinely
 *     unpriced, and the shipping and supplies rows are a different case again.
 *
 * So pathway is decided FIRST, from the canonical workflow mode, and price is
 * carried alongside it as an independent fact.
 *
 * WHY BUY_NOW IS NOT A LIST, AND NOT A FULFILMENT CHECK. The eight-step
 * payment journey today serves 22 curated products, and it would be easy to
 * keep those 22 as a privileged set. It would be almost as easy to gate direct
 * purchase on the existing readiness rule in
 * `server/research/early-access/catalog/eligibility.ts`, which additionally
 * demands supplier assignment, fulfilment availability, lot documentation and
 * offer mode. Both are wrong, for the same reason:
 *
 *   CAN THE CUSTOMER PLACE THIS ORDER?  and  IS IT READY TO SHIP?
 *
 * are different questions, and only the first one belongs in a storefront. A
 * confirmed research-use peptide with an approved retail price is a thing
 * Xenios sells. Supplier assignment, inventory confirmation and lot/COA review
 * are real, but they are downstream operational states of an order that has
 * already been placed — not reasons to hide the buy action from a customer.
 *
 * So BUY_NOW is earned by three canonical facts and no others: the product is
 * in an approved direct-purchase FAMILY, its classification is confirmed RUO,
 * and the canonical authority resolves an approved retail price. Nothing about
 * merchandising, and nothing about warehouse readiness.
 * A row becomes purchasable the moment its classification lands, with no code
 * change and no list to edit.
 *
 * What this must never do is make an order LOOK further along than it is.
 * Placing the order is honest; "inventory confirmed", "payment verified" and
 * "shipped" remain separate downstream truths that this function knows nothing
 * about and cannot assert.
 */

import type { AssistedOrderWorkflowMode } from "../assisted-order/contract";

/**
 * The ONE product family approved for direct Early Access purchase.
 *
 * Deliberately a canonical family value and not a SKU list, a curated set, or
 * anything the browser can send. The founder decision of 2026-08-21 covers
 * Research Peptides & Materials and nothing else: a generic
 * "researchUseOnly + priced + direct" rule would ALSO have swept in 13
 * Research Capsules, which are not approved for direct purchase and stay on
 * their request pathway until they separately are.
 *
 * Adding a family here is a commercial decision, so it is one line in one
 * place, reviewed as such, rather than a predicate spreading through the UI.
 */
export const DIRECT_PURCHASE_FAMILIES: readonly string[] = [
  "research_peptides_materials",
];

export const earlyAccessCustomerPathways = [
  /** Direct Early Access purchase: the existing eight-step payment journey. */
  "buy_now",
  /** Request an order; Xenios reviews, then quotes or invoices. */
  "assisted_order",
  /** No approved price yet; the customer is asking what it costs. */
  "request_quote",
  /** Provider / 503A clinical pathway. Priced or not, never a direct sale. */
  "care",
  /** Real, visible, and deliberately not purchasable yet. */
  "temporarily_held",
  /** Visible for completeness; no commercial path at all. */
  "not_available",
] as const;

export type EarlyAccessCustomerPathway =
  (typeof earlyAccessCustomerPathways)[number];

export interface EarlyAccessPathwayInput {
  /** The canonical server-side workflow mode for this exact variant. */
  readonly workflowMode: AssistedOrderWorkflowMode;
  /**
   * Whether this variant's intended-use classification is CONFIRMED research
   * use only. A row whose classification is still pending is not RUO yet, and
   * nothing here may relabel it to make it purchasable.
   */
  readonly researchUseOnly: boolean;
  /**
   * Whether the canonical price authority currently resolves an approved
   * retail price for this exact variant. NECESSARY for a direct purchase and
   * nowhere near sufficient — see the note above about the 242 priced Care
   * rows and the 32 priced pending rows.
   */
  readonly hasApprovedRetailPrice: boolean;
  /**
   * The canonical family this variant belongs to, e.g.
   * "research_peptides_materials". Server-derived from the catalog dataset.
   */
  readonly family: string;
}

/**
 * Resolve one variant's customer pathway.
 *
 * Order matters and is the whole point. Care, classification-pending and
 * availability-review rows are answered BEFORE price or classification is even
 * consulted, so a price can never promote a row out of the pathway it belongs
 * to. Price is necessary for a direct purchase and never sufficient for one.
 */
export function earlyAccessCustomerPathway(
  input: EarlyAccessPathwayInput,
): EarlyAccessCustomerPathway {
  switch (input.workflowMode) {
    // Clinical pathway first, so no later branch can promote it to a sale.
    case "provider_request":
      return "care";
    case "request_activation":
      // CLASSIFICATION PENDING, not held. Measured in the live catalog: all 32
      // of these carry the notice "Visible while classification and
      // documentation are completed", a real retail price, and a real product.
      // The customer may ask for it; what they may not do is buy something
      // whose intended-use classification nobody has finished. Relabelling
      // these as RUO to make them purchasable is the one thing forbidden here.
      return "assisted_order";
    case "availability_review":
      return "temporarily_held";
    case "request_pricing":
      return "request_quote";
    case "direct_order_request":
      // The only branch where a direct purchase is possible at all, and it
      // still needs BOTH a confirmed research-use classification and an
      // approved retail price. Either one missing means the order goes through
      // review instead — the customer can still place it.
      return input.researchUseOnly &&
        input.hasApprovedRetailPrice &&
        DIRECT_PURCHASE_FAMILIES.includes(input.family)
        ? "buy_now"
        : "assisted_order";
  }
}

/** Pathways from which a customer may reach the payment journey. */
export function pathwayEntersPayment(
  pathway: EarlyAccessCustomerPathway,
): boolean {
  return pathway === "buy_now";
}

/** Pathways that place a reviewable request rather than taking money. */
export function pathwayEntersRequest(
  pathway: EarlyAccessCustomerPathway,
): boolean {
  return pathway === "assisted_order" || pathway === "request_quote";
}

/**
 * The customer-facing action label. One place, so the catalog card, the product
 * detail and the basket cannot describe the same row three different ways.
 */
export function earlyAccessPathwayLabel(
  pathway: EarlyAccessCustomerPathway,
): string {
  switch (pathway) {
    case "buy_now":
      return "Order now";
    case "assisted_order":
      return "Request order";
    case "request_quote":
      return "Request pricing";
    case "care":
      return "Continue through Care";
    case "temporarily_held":
      return "Temporarily unavailable";
    case "not_available":
      return "Not available";
  }
}
