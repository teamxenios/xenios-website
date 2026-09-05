import type { EarlyAccessCheckoutStep } from "./cart/history";

/**
 * The four stages a customer needs to understand.
 *
 * These are a presentation over the existing eight-state checkout machine.
 * They do not replace its states, history entries, guards, or server actions.
 */
export const EARLY_ACCESS_CUSTOMER_STEPS = [
  { key: "choose-products", label: "Choose products" },
  { key: "contact-delivery", label: "Contact and delivery" },
  { key: "review-payment", label: "Review and payment" },
  { key: "confirmation-tracking", label: "Confirmation and tracking" },
] as const;

export const EARLY_ACCESS_CUSTOMER_STEP_LABELS: readonly string[] =
  EARLY_ACCESS_CUSTOMER_STEPS.map(({ label }) => label);

export type EarlyAccessCustomerStepIndex = 0 | 1 | 2 | 3;

/**
 * The extra names belong to the capability-off single-order and embedded
 * assisted-order presentations. Shared names such as `review`, `payment`, and
 * `status` intentionally project to the same customer stage in every surface.
 */
export type EarlyAccessCustomerJourneyState =
  | EarlyAccessCheckoutStep
  | "products"
  | "contact"
  | "submitting";

const CUSTOMER_STEP_INDEX: Readonly<
  Record<EarlyAccessCustomerJourneyState, EarlyAccessCustomerStepIndex>
> = Object.freeze({
  catalog: 0,
  cart: 0,
  products: 0,
  details: 1,
  agreements: 1,
  contact: 1,
  review: 2,
  submitting: 2,
  payment: 2,
  submit: 2,
  status: 3,
});

export function earlyAccessCustomerStepIndex(
  state: EarlyAccessCustomerJourneyState,
): EarlyAccessCustomerStepIndex {
  return CUSTOMER_STEP_INDEX[state];
}
