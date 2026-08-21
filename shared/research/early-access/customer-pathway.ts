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
 * WHY BUY_NOW IS NOT A LIST. The eight-step payment journey today serves 22
 * curated products, and it would be easy to keep those 22 as a hard-coded
 * privileged set. That is exactly the architecture this replaces. Direct
 * purchase is decided by whether the variant's declared commercial facts are
 * complete — supplier assignment, fulfillment availability, the per-unit
 * ceiling, lot documentation, offer mode, and no open dispute — which is the
 * rule `server/research/early-access/catalog/eligibility.ts` already enforces
 * for every unit it is given.
 *
 * The 22 are simply the rows whose facts are complete today. As operations
 * completes the facts for more products, those rows become BUY_NOW on their
 * own, with no code change and no list to edit. Featured is a merchandising
 * decision; BUY_NOW is an evidence decision. They are deliberately unrelated.
 */

import type { AssistedOrderWorkflowMode } from "../assisted-order/contract";

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
   * Whether the SAME server eligibility authority that gates the existing
   * payment journey says this exact unit may be bought directly. Never a
   * curated list, never inferred from price, never sent by the browser.
   */
  readonly directPurchaseEligible: boolean;
}

/**
 * Resolve one variant's customer pathway.
 *
 * Order matters and is the whole point: the pathway a product belongs to is
 * decided before, and independently of, whether it happens to have a price.
 */
export function earlyAccessCustomerPathway(
  input: EarlyAccessPathwayInput,
): EarlyAccessCustomerPathway {
  switch (input.workflowMode) {
    // Clinical pathway first, so no later branch can promote it to a sale.
    case "provider_request":
      return "care";
    case "request_activation":
      return "temporarily_held";
    case "availability_review":
      return "not_available";
    case "request_pricing":
      return "request_quote";
    case "direct_order_request":
      // The only branch where direct purchase is even possible, and it still
      // has to be earned by complete declared facts.
      return input.directPurchaseEligible ? "buy_now" : "assisted_order";
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
