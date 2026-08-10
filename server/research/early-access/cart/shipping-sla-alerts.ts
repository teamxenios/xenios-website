/**
 * WHERE AN OVERDUE ORDER BECOMES SOMETHING A HUMAN SEES.
 *
 * The sweep decides that a settled order has passed its durable 72-hour
 * commitment. This is the only thing it is allowed to do about that: put ONE
 * row in the durable notification outbox. It cannot settle, refund, ship, mark
 * anything, or write to any M62 table, because it holds no port that could.
 *
 * ONE MAIL QUEUE, NOT A SECOND ONE. The row goes into `research_notification_outbox`
 * through the same enqueue every other notification uses, so this alert
 * inherits the unique `event_key`, the durable attempt counter, the backoff
 * ladder, the admin surface and the provider idempotency key that the rest of
 * the system already has. The worker sends it later; nothing here awaits a
 * provider, so a mail outage cannot turn into a sweep failure.
 *
 * WHY `enqueueNotificationOnce` AND NOT `enqueueNotification`.
 *
 * The port's contract is precise: "False means this deterministic event already
 * exists." `enqueueNotification` answers the looser question "is it on file",
 * returning true for a duplicate, which would make every repeated sweep report
 * a fresh alert it did not actually create. The unique index makes the row
 * itself idempotent either way; this makes the REPORT idempotent too, which is
 * what an operator reads.
 *
 * ONE FIXED INTERNAL RECIPIENT, in code, the same address the proof lane
 * already sends its internal order mail to. Not a configured list, not an
 * environment variable, and never a customer: an alert whose destination can be
 * changed by configuration is a redirect waiting to happen.
 */

import { enqueueNotificationOnce } from "../../outbox";
import { EARLY_ACCESS_INTERNAL_RECIPIENT } from "../hardening-contract";
import {
  earlyAccessTemplateKey,
  safeEarlyAccessPayload,
} from "../notifications/communications";
import type { EarlyAccessShippingAlertSink } from "./shipping-sla-monitor";

const EVENT = "ea_shipping_overdue_internal" as const;

export type EarlyAccessShippingAlertEnqueue = typeof enqueueNotificationOnce;

/**
 * The durable operational alert sink.
 *
 * `enqueue` is injectable so this is unit-testable with no Supabase, no
 * network and no mocking framework, exactly like every other adapter in the
 * Early Access lane.
 */
export function createEarlyAccessShippingAlertSink(
  enqueue: EarlyAccessShippingAlertEnqueue = enqueueNotificationOnce,
): EarlyAccessShippingAlertSink {
  return Object.freeze({
    async enqueue(input: {
      readonly eventKey: string;
      readonly cartCheckoutNumber: string;
      readonly shipByAt: string;
      readonly overdueAt: string;
    }): Promise<boolean> {
      const outcome = await enqueue({
        // Computed by the sweep from the checkout number and the durable
        // ship-by instant, so the same late order produces the same key on
        // every run and the unique index does the deduplication.
        eventKey: input.eventKey,
        eventType: EVENT,
        templateKey: earlyAccessTemplateKey(EVENT),
        recipient: EARLY_ACCESS_INTERNAL_RECIPIENT,
        // The allowlist drops anything that is not one of the three fields,
        // and the shared forbidden-key screen runs after it. A future caller
        // that passed the whole checkout could not leak it through here.
        payload: safeEarlyAccessPayload(EVENT, {
          cartCheckoutNumber: input.cartCheckoutNumber,
          shipByAt: input.shipByAt,
          overdueAt: input.overdueAt,
        }),
      });
      // An unavailable queue is NOT "already exists". The sweep counts it as a
      // failure, so a silent outage cannot read as a clean run.
      if (outcome === "unavailable") {
        throw new Error("early-access shipping alert could not be queued");
      }
      return outcome === "inserted";
    },
  });
}
