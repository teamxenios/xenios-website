/**
 * The authenticated read boundary for the Early Access payment screen.
 *
 * CONSTRUCTED, NOT REGISTERED. This module exports a route factory and its
 * canonical path, and deliberately mounts nothing. Registration and the
 * research-wall admission entry are a single, separately reviewed integration
 * step, for the reason recorded in `server/research/index.ts`: an unlisted
 * /api/research path is answered by the earlier gateway, so a route that is
 * mounted without its admission entry reads as broken rather than closed.
 *
 * What the boundary guarantees:
 *   - A caller with no Early Access session gets 401 and no payment details.
 *   - A caller who does not own the cart checkout gets 404, the same answer an
 *     unknown checkout gets, so the route cannot be used to probe for orders.
 *   - Payment details are built from THIS checkout's own invoice, so the amount
 *     due and the payment reference can only ever be the server's.
 *   - Any configuration or registry problem answers 503. It never answers with
 *     a partial list of ways to send money.
 *   - Reading this route changes nothing. No payment is marked received, no
 *     checkout is settled, no receipt is issued, no supplier is released, and
 *     no supplier outbox entry is created. The order stays awaiting_payment
 *     until a named admin verifies it.
 */

import {
  buildEarlyAccessPaymentInstructionsPresentation,
  parseEarlyAccessPaymentInstructionsConfig,
  type EarlyAccessPaymentInstructionsConfigSource,
} from "../commerce/payment-instructions-config";
import { resolveEarlyAccessPaymentOptionsPresentation } from "../../commerce/manual-order-payment-method-adapter";
import type {
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";
import { isCartCheckoutNumber } from "./model";
import type { EarlyAccessCartCheckoutStore } from "./ports";
import type {
  CartRequest,
  CartResponsePort,
  EarlyAccessCartIdentityPort,
} from "./routes";
import type { EarlyAccessCartSettlementStore } from "./ports";

/**
 * Registered AFTER the literal cart paths and alongside `:cartCheckoutNumber`,
 * for the reason already recorded in register.ts: a literal segment placed
 * after a parameter route is swallowed by it.
 */
export const EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH =
  "/api/research/early-access/cart/:cartCheckoutNumber/payment-instructions";

export interface EarlyAccessCartPaymentInstructionsDeps {
  readonly identity: EarlyAccessCartIdentityPort;
  readonly checkouts: EarlyAccessCartCheckoutStore;
  /**
   * The same durable store used by the settlement door. A checkout row alone
   * is not sufficient payment authority: a committed settlement can already
   * exist while an older checkout projection still says awaiting_payment.
   */
  readonly settlements: Pick<EarlyAccessCartSettlementStore, "settlement">;
  readonly config: EarlyAccessPaymentInstructionsConfigSource;
  readonly methodRegistry: ManualPaymentMethodRegistryPort;
  readonly clock: ManualPaymentClockPort;
}

function privateHeaders(response: CartResponsePort): void {
  response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
  response.setHeader?.("Pragma", "no-cache");
  response.setHeader?.("X-Content-Type-Options", "nosniff");
}

export function createEarlyAccessCartPaymentInstructionsRoute(
  deps: EarlyAccessCartPaymentInstructionsDeps,
) {
  return async (
    request: CartRequest,
    response: CartResponsePort,
  ): Promise<void> => {
    // Private headers precede every decision, so a denial is never cacheable.
    privateHeaders(response);

    const customer = await deps.identity.resolve(request.cookieHeader);
    if (customer === null) {
      response.status(401).json({ ok: false, code: "SESSION_REQUIRED" });
      return;
    }

    if (!isCartCheckoutNumber(request.cartCheckoutNumber)) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }

    const checkout = await deps.checkouts.byCheckoutNumber(
      request.cartCheckoutNumber,
    );
    const owned =
      checkout !== null &&
      [customer.customerRef, ...(customer.aliases ?? [])].includes(
        checkout.customerRef,
      );
    if (!owned || checkout === null) {
      response.status(404).json({ ok: false, code: "NOT_FOUND" });
      return;
    }

    // A durable checkout must exist before any payable details are shown, but
    // it is not enough by itself. Settlement is written atomically with the
    // receipt and child releases, and that durable fact closes the payment
    // door even if a stale checkout projection still reads awaiting_payment.
    // Superseded and non-awaiting checkouts are closed for the same reason:
    // no customer should be invited to send money against an inactive order.
    const settlement = await deps.settlements.settlement(
      checkout.cartCheckoutNumber,
    );
    if (
      settlement !== null ||
      checkout.disposition != null ||
      checkout.paymentState !== "awaiting_payment"
    ) {
      response.status(409).json({ ok: false, code: "PAYMENT_CLOSED" });
      return;
    }

    // Configuration alone never makes a method payable. The protected registry
    // still decides which methods are enabled right now.
    let enabled: ReturnType<typeof resolveEarlyAccessPaymentOptionsPresentation>;
    try {
      enabled = resolveEarlyAccessPaymentOptionsPresentation({
        methodRegistry: deps.methodRegistry,
        clock: deps.clock,
      });
    } catch {
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
      return;
    }
    if (enabled.state !== "resolved") {
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
      return;
    }

    let rawConfig: unknown;
    try {
      rawConfig = deps.config.read();
    } catch {
      // The thrown value could carry the document. It is never inspected,
      // logged, or forwarded.
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
      return;
    }
    const config = parseEarlyAccessPaymentInstructionsConfig(rawConfig);
    if (config.state !== "accepted") {
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
      return;
    }

    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config: config.value,
      enabledCodes: enabled.codes,
      amountDueCents: checkout.invoice.payableTotalCents,
      currency: checkout.invoice.currency,
      paymentReference: checkout.invoice.paymentReference,
    });
    if (presentation.state !== "resolved") {
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
      return;
    }

    response.status(200).json({ ok: true, presentation });
  };
}
