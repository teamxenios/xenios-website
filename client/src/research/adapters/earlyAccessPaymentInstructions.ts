import {
  parseEarlyAccessPaymentInstructionsPresentation,
  unresolvedEarlyAccessPaymentInstructions,
  type EarlyAccessPaymentInstructionsPresentation,
} from "@shared/research/early-access-payment-instructions";

/**
 * Read-only client for the Early Access payment presentation.
 *
 * Kept separate from `earlyAccessCart.ts` on purpose. This is a pure read that
 * changes nothing, it has no request body, and it must never be confused with
 * the checkout write path or grow a submit alongside it.
 *
 * The route is unmounted until the integration step registers it, so a 404 is
 * an expected "not available here yet" and resolves to the same safe unresolved
 * value as a denial or a network failure. The screen then says details are being
 * confirmed, which is true, rather than showing a guess.
 */

export const EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH = (
  checkoutNumber: string,
): string =>
  `/api/research/early-access/cart/${encodeURIComponent(checkoutNumber)}/payment-instructions`;

export async function loadEarlyAccessPaymentInstructions(
  checkoutNumber: string,
): Promise<EarlyAccessPaymentInstructionsPresentation> {
  try {
    const response = await fetch(
      EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH(checkoutNumber),
      {
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
      },
    );
    if (!response.ok) return unresolvedEarlyAccessPaymentInstructions();

    const body: unknown = await response.json();
    if (
      typeof body !== "object" ||
      body === null ||
      Array.isArray(body) ||
      (body as Record<string, unknown>).ok !== true
    ) {
      return unresolvedEarlyAccessPaymentInstructions();
    }

    // The strict shared decoder is the only thing that may admit a payment
    // destination into the page. A response that does not match exactly is
    // treated as no answer at all.
    const decoded = parseEarlyAccessPaymentInstructionsPresentation(
      (body as Record<string, unknown>).presentation,
    );
    return decoded ?? unresolvedEarlyAccessPaymentInstructions();
  } catch {
    return unresolvedEarlyAccessPaymentInstructions();
  }
}
