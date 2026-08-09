/**
 * THE SEAM CUSTOMER EMAIL LEAVES THROUGH, AND WHY IT IS A SEAM.
 *
 * Two rules shape this file.
 *
 * FIRST, EMAIL MUST NEVER UNDO COMMERCE. A checkout is one database
 * transaction and a settlement is another. Both have already committed by the
 * time anything here is called, and every call is wrapped so a throw is
 * swallowed. Resend being down, the outbox table being absent, a malformed
 * payload: none of them may cost a customer their order or an operator their
 * settlement. The outbox is durable and retried on its own schedule, so a
 * notification that fails to enqueue is a notification that is late, not an
 * order that is lost.
 *
 * SECOND, THE CART SERVICES MUST STAY OFFLINE-TESTABLE. `checkout-service` and
 * `settlement` are pure over injected ports and their tests run with no
 * network and no Supabase. Importing the outbox directly into them would drag
 * a database client into every one of those tests. So they take this port, the
 * default does nothing, and the composition root supplies the real projector.
 *
 * WHAT DOES NOT BELONG HERE. No payment destination, handle, cashtag, account
 * or routing value. `emailSafePaymentSummary` reduces the presentation to
 * amount, reference and method LABELS before it reaches the projector, and the
 * outbox renderer refuses a payload carrying receiving material even if some
 * future caller tries. The destination lives behind the authenticated page and
 * the email carries a link to it.
 */

import type {
  EarlyAccessCartCheckoutRecord,
  EarlyAccessCartSettlement,
} from "@shared/research/early-access-cart";

export interface EarlyAccessCartNotifier {
  /**
   * One order-created notification per durable checkout. Called AFTER the
   * commit transaction returns, never inside it.
   *
   * `replayed` is true when the caller answered an existing order rather than
   * creating one. The projector is keyed by the checkout number and the outbox
   * insert is insert-or-ignore, so a replay is already harmless; passing the
   * flag lets a caller skip the round trip entirely.
   */
  checkoutCreated(input: {
    readonly checkout: EarlyAccessCartCheckoutRecord;
    readonly replayed: boolean;
  }): Promise<void>;

  /**
   * Payment confirmation and order-released, after a settlement commits.
   *
   * ONE release email for the whole cart, not one per child line. The
   * customer-visible event is "my order is being processed", which happens once
   * however many products the cart holds, so the idempotency identity is the
   * settlement rather than the child release. Keying it per release would send
   * five emails for a five-product cart, which is not the experience anyone
   * asked for. The per-release identity remains available in the projector for
   * the day a genuinely per-line customer event exists, such as a partial
   * shipment.
   */
  settled(input: {
    readonly settlement: EarlyAccessCartSettlement;
    readonly checkout: EarlyAccessCartCheckoutRecord;
  }): Promise<void>;
}

/** The default. A deployment that has wired no notifier sends no email. */
export const NO_CART_NOTIFICATIONS: EarlyAccessCartNotifier = Object.freeze({
  async checkoutCreated(): Promise<void> {},
  async settled(): Promise<void> {},
});

/**
 * Calls a notifier and refuses to let it matter.
 *
 * Deliberately swallows rather than logging the error object: a notification
 * payload can carry a customer email address, and an unfiltered provider error
 * is a plausible place for one to reach a log line.
 */
export async function notifyQuietly(
  run: () => Promise<void>,
): Promise<void> {
  try {
    await run();
  } catch {
    // Intentionally silent. See above.
  }
}
