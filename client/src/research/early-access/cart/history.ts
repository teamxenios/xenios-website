/**
 * The customer's route through Early Access, in order.
 *
 * `agreements` and `submit` are separate steps rather than panels bolted onto
 * their neighbours, and both earn the place:
 *
 *  - `agreements` was previously a card at the top of the catalogue. That put
 *    the one thing the server refuses a quote without on the same screen as
 *    every product, where it read as an interstitial to scroll past. It is a
 *    required step, so it is a step.
 *
 *  - `submit` separates "an invoice exists" from "a named human has been asked
 *    to check for my money". Those are different facts, the customer owes an
 *    action between them, and collapsing them into the payment screen is what
 *    makes people believe an order is further along than it is.
 *
 * Adding to this list is safe. The journey's guard resolves an unreachable step
 * to a reachable one by re-running until the answer stops changing, and it is
 * bounded by this length, so a longer list simply gives it more room.
 */
export const EARLY_ACCESS_CHECKOUT_STEPS = [
  "catalog",
  "cart",
  "details",
  "agreements",
  "review",
  "payment",
  "submit",
  "status",
] as const;
export type EarlyAccessCheckoutStep = (typeof EARLY_ACCESS_CHECKOUT_STEPS)[number];

export type EarlyAccessHistoryState = Readonly<{
  earlyAccess: true;
  step: EarlyAccessCheckoutStep;
}>;

function isStep(value: unknown): value is EarlyAccessCheckoutStep {
  return (EARLY_ACCESS_CHECKOUT_STEPS as readonly unknown[]).includes(value);
}

export function readEarlyAccessHistoryState(value: unknown): EarlyAccessHistoryState | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (row.earlyAccess !== true || !isStep(row.step)) return null;
  if (Object.keys(row).some((key) => !["earlyAccess", "step"].includes(key))) return null;
  return Object.freeze({ earlyAccess: true as const, step: row.step });
}

export function replaceEarlyAccessStep(step: EarlyAccessCheckoutStep): void {
  window.history.replaceState({ earlyAccess: true, step } satisfies EarlyAccessHistoryState, "", window.location.pathname);
}

export function pushEarlyAccessStep(step: EarlyAccessCheckoutStep): void {
  window.history.pushState({ earlyAccess: true, step } satisfies EarlyAccessHistoryState, "", window.location.pathname);
}

export function listenEarlyAccessHistory(onStep: (step: EarlyAccessCheckoutStep) => void): () => void {
  const listener = (event: PopStateEvent) => {
    const state = readEarlyAccessHistoryState(event.state);
    onStep(state?.step ?? "catalog");
  };
  window.addEventListener("popstate", listener);
  return () => window.removeEventListener("popstate", listener);
}

/**
 * Development/test guard. No PII or secret-shaped key may be added to history.
 */
export const FORBIDDEN_HISTORY_KEYS = Object.freeze([
  "password", "accessCode", "sessionId", "continuity", "customerRef", "email",
  "phone", "address", "line1", "postalCode", "idempotencyKey", "paymentReference",
]);
