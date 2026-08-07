export const EARLY_ACCESS_CHECKOUT_STEPS = [
  "catalog",
  "cart",
  "details",
  "review",
  "payment",
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
