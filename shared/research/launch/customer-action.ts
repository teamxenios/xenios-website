/**
 * The ONE customer-facing action vocabulary for launch.
 *
 * Six words, closed. Every catalog surface that tells a buyer what they can do
 * next says one of these six things, and nothing else. The two adapters below
 * translate the existing server vocabularies (the assisted-order workflow
 * decision and the master-offerings resolved action) into it, so two surfaces
 * can never invent a seventh state or disagree about what one state means.
 *
 * Pure and framework free on purpose. This module imports types only, decides
 * nothing the server has not already decided, and holds no price, quantity,
 * authority, or fallback of its own. In particular it can never widen an
 * action: a translation may only restate or downgrade what the source
 * vocabulary said, so a variant the server refused to sell cannot become
 * BUY_NOW by passing through here.
 */

import type { AssistedOrderWorkflowMode } from "../assisted-order/contract";
import type { MasterOfferingAction } from "../master-offerings/contract";
import type { MasterOfferingPriceView } from "../master-offerings/pricing-contract";

export const CUSTOMER_ACTIONS = [
  "BUY_NOW",
  "REQUEST_QUOTE",
  "ASSISTED_ORDER",
  "CARE",
  "TEMPORARILY_HELD",
  "NOT_AVAILABLE",
] as const;

export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

export function isCustomerAction(value: unknown): value is CustomerAction {
  return (
    typeof value === "string" &&
    (CUSTOMER_ACTIONS as readonly string[]).includes(value)
  );
}

/**
 * The buyer-facing words for each action. One place, so two surfaces cannot
 * label the same state differently.
 */
export const CUSTOMER_ACTION_LABELS: Readonly<Record<CustomerAction, string>> =
  {
    BUY_NOW: "Buy Now",
    REQUEST_QUOTE: "Price on request",
    ASSISTED_ORDER: "Request to order",
    CARE: "Explore Care",
    TEMPORARILY_HELD: "Temporarily held",
    NOT_AVAILABLE: "Not available",
  };

/**
 * What the assisted-order action policy decided, reduced to the two facts this
 * translation needs. `visible: false` is the policy's "invisible" outcome: the
 * item is not exposed at all, which the customer vocabulary states as
 * NOT_AVAILABLE rather than by omitting the row and leaving a gap to guess at.
 */
export interface AssistedOrderDecisionFacts {
  visible: boolean;
  workflowMode: AssistedOrderWorkflowMode;
}

/**
 * Facts about the exact variant the composition root supplies. Direct commerce
 * is a per-variant, server-decided fact (the Product Control selection behind
 * the flag), never something a browser asserts.
 */
export interface AssistedOrderVariantFacts {
  directCommerceEnabled: boolean;
}

/**
 * Translate one assisted-order workflow decision.
 *
 * `direct_order_request` is the only mode that can ever become BUY_NOW, and
 * only when direct commerce is genuinely enabled for the exact variant;
 * otherwise it is the assisted path it always was. The policy itself already
 * guarantees a priced row behind `direct_order_request` (a missing or pending
 * price decides `request_pricing` first), so a missing price reaches this
 * function as REQUEST_QUOTE and can never be argued back into a purchase.
 */
export function customerActionFromAssistedOrderDecision(
  decision: AssistedOrderDecisionFacts,
  variant: AssistedOrderVariantFacts,
): CustomerAction {
  if (decision.visible !== true) return "NOT_AVAILABLE";
  switch (decision.workflowMode) {
    case "direct_order_request":
      return variant.directCommerceEnabled === true
        ? "BUY_NOW"
        : "ASSISTED_ORDER";
    case "request_pricing":
      return "REQUEST_QUOTE";
    case "provider_request":
      return "CARE";
    case "availability_review":
      return "TEMPORARILY_HELD";
    case "request_activation":
      return "NOT_AVAILABLE";
  }
}

/**
 * True only for an `add_to_cart` amount a buyer may actually be charged:
 * positive integer cents in a named currency. Never zero, never a float,
 * never an unsafe magnitude.
 */
function usableAmount(
  amount: { amountCents: number; currency: string } | undefined,
): boolean {
  return (
    amount !== undefined &&
    Number.isSafeInteger(amount.amountCents) &&
    amount.amountCents > 0 &&
    typeof amount.currency === "string" &&
    amount.currency.trim().length > 0
  );
}

/**
 * Translate one resolved master-offerings action.
 *
 * `add_to_cart` becomes BUY_NOW only while its own amount is a usable positive
 * integer-cents price AND the variant's price view (when the caller has one)
 * agrees the variant is priced. A resolved purchase whose displayed price says
 * "on request" is a contradiction, and a contradiction fails closed to
 * REQUEST_QUOTE: the buyer may ask, and nobody is shown a Buy button whose
 * price does not exist.
 *
 * Every other kind is a restatement, never an upgrade: the request family is
 * the assisted path, the waiting states are held, care stays care, and a
 * variant with nothing to do is NOT_AVAILABLE.
 */
export function customerActionFromMasterOfferingAction(
  action: MasterOfferingAction,
  price?: Pick<MasterOfferingPriceView, "state">,
): CustomerAction {
  switch (action.kind) {
    case "add_to_cart":
      return usableAmount(action.amount) && price?.state !== "on_request"
        ? "BUY_NOW"
        : "REQUEST_QUOTE";
    case "request_access":
    case "request_early_access_purchase":
    case "apply":
      return price?.state === "on_request" ? "REQUEST_QUOTE" : "ASSISTED_ORDER";
    case "notify_me":
    case "join_waitlist":
      return "TEMPORARILY_HELD";
    case "explore_care":
      return "CARE";
    case "get_updates":
    case "none":
      return "NOT_AVAILABLE";
  }
}
