/**
 * The customer tracking mail for the LEGACY single-order Early Access flow.
 *
 * `projectEarlyAccessTracking` has existed since the outbox family landed and
 * had ZERO callers: customers only learned their tracking number by polling
 * the authenticated page. This notifier is its first caller, and it connects
 * the seam exactly the way the projection's own comment asked for: the
 * durable identity is the tracking ROW the admin route just committed
 * (order number + one-based sequence, the primary key of
 * `research_early_access_tracking`), so a replayed commit or a re-driven
 * route cannot mail twice and a CORRECTION (a new row, a new sequence) mails
 * again, because it is a new fact the customer needs.
 *
 * The discipline is the legacy-order-notifier's, unchanged:
 *
 *   - MAIL NEVER BLOCKS THE TRACKING WRITE. `trackingPosted` is synchronous
 *     fire-and-forget: it kicks the enqueue and swallows the failure into a
 *     named log line. The tracking row is the durable fact; the outbox row
 *     (once inserted) is the durable retry surface for the send itself.
 *   - The recipient is the SERVER-DERIVED order contact, never a
 *     body-supplied address. An order with no contact (placed before the
 *     contact field existed) sends nothing, silently: the concierge channel
 *     that took the order is how that customer is reached.
 *   - No supplier identifier travels: the payload is the carrier label and
 *     the tracking reference the customer needs, and the allowlist in
 *     communications.ts refuses anything else independently.
 */

import type { EarlyAccessTrackingRecord } from "../commerce/release-service";
import type { EarlyAccessPlacement } from "../routes/store";
import { projectEarlyAccessTracking } from "./outbox-adapter";

export interface EarlyAccessTrackingNotifier {
  /** After a tracking record is durably committed by a named admin. */
  trackingPosted(placement: EarlyAccessPlacement, record: EarlyAccessTrackingRecord): void;
}

/** The default: no notifier configured, no behaviour at all. */
export const NO_TRACKING_NOTIFIER: EarlyAccessTrackingNotifier = Object.freeze({
  trackingPosted: () => {},
});

/**
 * The at-most-once mail identity for one committed tracking row: its primary
 * key, spelled the way the outbox event key expects one opaque string.
 */
export function earlyAccessTrackingEventIdFor(record: EarlyAccessTrackingRecord): string {
  return `${record.orderId}:${record.sequence}`;
}

export function createOutboxTrackingNotifier(options: {
  readonly siteUrl?: string;
  readonly projection?: typeof projectEarlyAccessTracking;
  readonly warn?: (message: string) => void;
} = {}): EarlyAccessTrackingNotifier {
  const warn = options.warn ?? ((message: string) => {
    // eslint-disable-next-line no-console
    console.warn(`[ea-tracking-mail] ${message}`);
  });
  const projection = options.projection ?? projectEarlyAccessTracking;
  const statusUrl = options.siteUrl
    ? `${options.siteUrl.replace(/\/+$/, "")}/research/early-access`
    : undefined;

  return {
    trackingPosted(placement, record) {
      const email = placement.contact?.email;
      if (typeof email !== "string" || !email.includes("@")) return;
      // Fire-and-forget with the failure named: the tracking row is already
      // durable, and this log line is the only place a lost enqueue is
      // visible, so it says which one.
      void projection({
        trackingEventId: earlyAccessTrackingEventIdFor(record),
        cartCheckoutNumber: placement.orderNumber,
        recipientEmail: email,
        customerName: "",
        carrierLabel: record.carrier,
        trackingReference: record.trackingNumber,
        ...(statusUrl === undefined ? {} : { statusUrl }),
      })
        .then((enqueued) => {
          if (!enqueued) {
            warn(`tracking ${placement.orderNumber}#${record.sequence}: outbox unavailable, notification not queued`);
          }
        })
        .catch((error: unknown) => {
          warn(
            `tracking ${placement.orderNumber}#${record.sequence}: ${
              error instanceof Error ? error.message : "enqueue failed"
            }`,
          );
        });
    },
  };
}
