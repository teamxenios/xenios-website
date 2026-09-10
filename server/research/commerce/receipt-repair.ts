// Reconciling a committed payment with the receipt the customer should have had.
//
// The commit and the notification cannot be one atomic act: the money is taken
// at a payment provider and the queue row is written in our database. If the
// transaction commits and the enqueue never runs, the customer is charged and
// hears nothing. This module closes that gap AFTERWARDS, by reading committed
// executions and asking the existing outbox for the event that should exist.
//
// What it is NOT:
//
//   * Not a second queue or dispatcher. It calls the canonical
//     `enqueueNotificationOnce` through an injected port and owns no table.
//   * Not a delivery guarantee. It closes the commit-to-enqueue gap by
//     reconciliation; the outbox still owns sending, retry and failure.
//   * Not a reason to fail a purchase. A queue that is down is reported, never
//     turned into a payment problem.
//
// It is OFF by default. `mode: "preview"` validates and renders without writing
// anything, because a queue insertion in production causes a real email.
import { assertEmailPayloadSafe } from "../membership-activation/emails";

/** The stable receipt identity. See `priorEventKeys` before adopting it. */
export const RECEIPT_TEMPLATE_KEY = "commerce_payment_received";
export const RECEIPT_EVENT_TYPE = "commerce_payment_received";
export function receiptEventKey(orderId: string): string {
  return `commerce:payment-received:v1:${orderId}`;
}

/** The projection of a committed execution this module needs. Nothing more. */
export interface CommittedExecutionFacts {
  executionId: string;
  orderId: string;
  memberId: string;
  amountCents: number;
  currency: string;
  providerReference: string | null;
  committedAt: string | null;
}

/** The canonical order facts, read server-side. Never a submitted payload. */
export interface ReceiptOrderFacts {
  orderId: string;
  memberId: string;
  state: string;
  providerReference: string | null;
  capturedAmountCents?: number;
  refundedCents?: number;
}

export interface QueuedEventFacts {
  eventKey: string;
  eventType: string;
  templateKey: string;
  recipient: string;
  payload?: Record<string, unknown> | null;
}

export type ReceiptEnqueueOutcome = "inserted" | "already_queued" | "unavailable";

export interface ReceiptEnqueueInput {
  eventKey: string;
  eventType: string;
  templateKey: string;
  recipient: string;
  payload: Record<string, unknown>;
}

export type ReceiptCode =
  | "queued"
  | "already_present"
  | "previewed"
  | "before_cutoff"
  | "order_missing"
  | "order_not_the_members"
  | "order_not_captured"
  | "payment_reference_disagrees"
  | "amount_disagrees"
  | "order_refunded"
  | "recipient_unknown"
  | "queue_unavailable"
  | "queued_event_disagrees"
  | "currency_not_supported"
  | "refund_state_unknown"
  | "commit_time_unusable"
  | "read_failed";

export interface ReceiptRepairEntry {
  executionId: string;
  orderId: string;
  code: ReceiptCode;
  /** Present when a person needs to look. Written here, never from a provider. */
  reason?: string;
}

export interface ReceiptRepairReport {
  considered: number;
  queued: number;
  alreadyPresent: number;
  previewed: number;
  refused: ReceiptRepairEntry[];
  entries: ReceiptRepairEntry[];
}

export interface ReceiptRepairDeps {
  /** Committed executions, oldest first. The reader is A's, not this module's. */
  listCommitted(request: { limit: number }): Promise<readonly CommittedExecutionFacts[]>;
  readOrder(orderId: string): Promise<ReceiptOrderFacts | null>;
  /**
   * The member's address from canonical identity. Never an operator-edited
   * field and never something that travelled in a request body.
   */
  recipientFor(memberId: string): Promise<string | null>;
  /** Read an outbox row by its event key, so the write can be verified. */
  findQueuedEvent(eventKey: string): Promise<QueuedEventFacts | null>;
  /** The canonical `enqueueNotificationOnce`. */
  enqueueOnce(input: ReceiptEnqueueInput): Promise<ReceiptEnqueueOutcome>;
  /**
   * Orders committed before this moment are left alone. Backfill is a decision
   * about contacting customers, so it is required rather than defaulted.
   */
  eligibleAfter: Date;
  /**
   * Event keys under which this order may ALREADY have been notified by another
   * lane. The outbox deduplicates on the key string alone, so a new key for an
   * order that was mailed under an old one sends a second receipt. Supply every
   * key a receipt for this order could have used.
   */
  priorEventKeys?(orderId: string): readonly string[];
  /** The link the receipt points at, for this deployment. */
  orderUrl(orderId: string): string;
  /** "preview" validates and renders without writing. The default. */
  mode?: "preview" | "queue";
}

/**
 * The receipt itself. Pure: same input, same output, no clock and no I/O.
 *
 * It says a payment was received. It does not say the order shipped, because a
 * captured payment is not a shipment and a customer who reads otherwise has
 * been told something false.
 */
export function renderCommittedReceipt(payload: Record<string, unknown>): { subject: string; text: string } | null {
  assertEmailPayloadSafe(payload);
  const reference = typeof payload.orderReference === "string" ? payload.orderReference : "";
  const total = typeof payload.totalFormatted === "string" ? payload.totalFormatted : "";
  const url = typeof payload.orderUrl === "string" ? payload.orderUrl : "";
  if (!reference || !total) return null;
  return {
    subject: `Payment received for order ${reference}`,
    text: [
      "Hello,",
      `We received your payment of ${total} for order ${reference}.`,
      "This confirms the payment only. It is not a shipping confirmation; we will write again when your order is released.",
      url ? `You can see the order here:\n${url}` : "",
      "Xenios Research\nresearch@xeniostechnology.com",
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}

/**
 * The shape the outbox dispatch chain calls: it hands every renderer the
 * template key and takes the first non-null answer.
 *
 * INTEGRATION: dispatch resolves a template by walking a fixed chain of these
 * probes in server/research/outbox.ts, and a key no probe claims is answered
 * `unknown template <key>`, retried down the backoff ladder and then recorded
 * as permanently failed. So a queued receipt is a failing row until the owner
 * of that file adds one line beside the other probes:
 *
 *     const receipt = renderCommerceReceiptOutboxEmail(job.template_key, payload);
 *     if (receipt) {
 *       return await sendFoundingEmail({ to: job.recipient, subject: receipt.subject, text: receipt.text, idempotencyKey: String(job.event_key) });
 *     }
 *
 * This module deliberately does not make that edit: outbox.ts has one writer.
 */
export function renderCommerceReceiptOutboxEmail(
  templateKey: string,
  payload: Record<string, unknown>,
): { subject: string; text: string } | null {
  if (templateKey !== RECEIPT_TEMPLATE_KEY) return null;
  return renderCommittedReceipt(payload);
}

export function formatUsdCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(Math.trunc(cents));
  return `${sign}$${Math.floor(abs / 100).toLocaleString("en-US")}.${String(abs % 100).padStart(2, "0")}`;
}

/** The payload the outbox row carries. Deliberately the smallest useful set. */
export function receiptPayload(order: { orderId: string; amountCents: number }, orderUrl: string): Record<string, unknown> {
  const payload = {
    orderReference: order.orderId,
    totalCents: order.amountCents,
    totalFormatted: formatUsdCents(order.amountCents),
    orderUrl,
  };
  assertEmailPayloadSafe(payload);
  return payload;
}

export class ReceiptRepairMisconfigured extends Error {}

export function createReceiptRepair(deps: ReceiptRepairDeps) {
  // Anything that is not exactly "queue" writes nothing. Defaulting the other
  // way means a typo in a configuration value emails every customer.
  const willWrite = deps.mode === "queue";

  /** Every reason this execution must not produce a receipt, in order. */
  async function refuseFor(
    execution: CommittedExecutionFacts,
    order: ReceiptOrderFacts | null,
  ): Promise<{ code: ReceiptCode; reason: string } | null> {
    if (!order) return { code: "order_missing", reason: "the execution names an order that cannot be read" };
    if (order.memberId !== execution.memberId) {
      return { code: "order_not_the_members", reason: "the order belongs to a different member than the execution" };
    }
    if (order.state !== "payment_captured") {
      return { code: "order_not_captured", reason: `the order is ${order.state}, so no payment has been recorded against it` };
    }
    if (execution.providerReference === null || order.providerReference !== execution.providerReference) {
      return { code: "payment_reference_disagrees", reason: "the order and the execution name different payments" };
    }
    if (order.capturedAmountCents !== execution.amountCents) {
      return { code: "amount_disagrees", reason: "the captured amount does not match the execution's amount" };
    }
    // Absent is NOT zero. A projection that drops this column would otherwise
    // read every refunded order as unrefunded and send a receipt for money that
    // was given back. The amount check above already fails closed; this one
    // must too.
    if (typeof order.refundedCents !== "number" || !Number.isFinite(order.refundedCents)) {
      return { code: "refund_state_unknown", reason: "the order does not report a refunded amount, so a receipt cannot be justified" };
    }
    if (order.refundedCents !== 0) {
      return { code: "order_refunded", reason: "the order carries a refund, so a plain payment receipt would be wrong" };
    }
    return null;
  }

  return {
    /**
     * One bounded reconciliation pass. Safe to run repeatedly: an order that
     * already has its event is reported as present, never queued again.
     */
    async repair(options: { limit?: number } = {}): Promise<ReceiptRepairReport> {
      // An unusable cutoff would compare false against every timestamp and mail
      // the entire history. Refuse the pass rather than discover that afterwards.
      if (!(deps.eligibleAfter instanceof Date) || !Number.isFinite(deps.eligibleAfter.getTime())) {
        throw new ReceiptRepairMisconfigured("eligibleAfter must be a valid date; refusing to run without a cutoff.");
      }
      const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
      const executions = await deps.listCommitted({ limit });
      const entries: ReceiptRepairEntry[] = [];

      for (const execution of executions) {
        const push = (code: ReceiptCode, reason?: string) =>
          entries.push({ executionId: execution.executionId, orderId: execution.orderId, code, ...(reason ? { reason } : {}) });

        const committedAt = execution.committedAt === null ? Number.NaN : Date.parse(execution.committedAt);
        if (!Number.isFinite(committedAt)) {
          // Not "before the cutoff": an execution recorded as committed with no
          // usable commit time is something a person should look at.
          push("commit_time_unusable", "the execution is committed but carries no usable commit time");
          continue;
        }
        if (committedAt < deps.eligibleAfter.getTime()) {
          push("before_cutoff");
          continue;
        }

        // This renderer writes a dollar sign. It may only do so for dollars.
        if (execution.currency !== "usd") {
          push("currency_not_supported", `this receipt renders US dollars and the payment was in ${execution.currency}`);
          continue;
        }

        let order: ReceiptOrderFacts | null;
        try {
          order = await deps.readOrder(execution.orderId);
        } catch {
          // One unreadable order must not discard the record of receipts this
          // pass already queued.
          push("read_failed", "the order could not be read on this pass");
          continue;
        }
        const refusal = await refuseFor(execution, order);
        if (refusal) {
          push(refusal.code, refusal.reason);
          continue;
        }

        // Another lane may already have told this customer. The outbox
        // deduplicates on the key string alone, so this check, not the unique
        // index, is what prevents a second receipt under a new name.
        const priors = deps.priorEventKeys?.(execution.orderId) ?? [];
        let alreadyTold = false;
        for (const key of priors) {
          if (await deps.findQueuedEvent(key)) {
            alreadyTold = true;
            break;
          }
        }
        if (alreadyTold) {
          push("already_present");
          continue;
        }

        const eventKey = receiptEventKey(execution.orderId);
        if (await deps.findQueuedEvent(eventKey)) {
          push("already_present");
          continue;
        }

        const recipient = await deps.recipientFor(execution.memberId);
        if (!recipient) {
          push("recipient_unknown", "no canonical address is on file for this member");
          continue;
        }

        const payload = receiptPayload({ orderId: execution.orderId, amountCents: execution.amountCents }, deps.orderUrl(execution.orderId));
        if (renderCommittedReceipt(payload) === null) {
          push("queued_event_disagrees", "the receipt could not be rendered from the order's own facts");
          continue;
        }

        if (!willWrite) {
          push("previewed");
          continue;
        }

        const outcome = await deps.enqueueOnce({
          eventKey,
          eventType: RECEIPT_EVENT_TYPE,
          templateKey: RECEIPT_TEMPLATE_KEY,
          recipient,
          payload,
        });
        // A queue that is unreachable is a failure to report, never a clean
        // pass: reporting it as done would lose the customer's receipt.
        if (outcome === "unavailable") {
          push("queue_unavailable", "the notification queue could not be reached; this order still owes a receipt");
          continue;
        }

        // Read the row back. An insert that reports success but stored another
        // template, another recipient or another payload has not produced the
        // receipt anybody intended.
        const stored = await deps.findQueuedEvent(eventKey);
        // Verify the row against the words the customer will actually read, not
        // only against a number the template never renders.
        const storedRendering = stored ? renderCommittedReceipt({ ...(stored.payload ?? {}) }) : null;
        const intended = renderCommittedReceipt(payload)!;
        if (
          !stored ||
          stored.eventType !== RECEIPT_EVENT_TYPE ||
          stored.templateKey !== RECEIPT_TEMPLATE_KEY ||
          stored.recipient !== recipient ||
          Number((stored.payload ?? {}).totalCents) !== execution.amountCents ||
          storedRendering === null ||
          storedRendering.subject !== intended.subject ||
          storedRendering.text !== intended.text
        ) {
          push("queued_event_disagrees", "the queued event does not match the receipt this order needs");
          continue;
        }

        push(outcome === "inserted" ? "queued" : "already_present");
      }

      const count = (code: ReceiptCode) => entries.filter((e) => e.code === code).length;
      const REFUSALS: readonly ReceiptCode[] = [
        "currency_not_supported",
        "refund_state_unknown",
        "commit_time_unusable",
        "read_failed",
        "order_missing",
        "order_not_the_members",
        "order_not_captured",
        "payment_reference_disagrees",
        "amount_disagrees",
        "order_refunded",
        "recipient_unknown",
        "queue_unavailable",
        "queued_event_disagrees",
      ];
      return {
        considered: executions.length,
        queued: count("queued"),
        alreadyPresent: count("already_present"),
        previewed: count("previewed"),
        refused: entries.filter((e) => REFUSALS.includes(e.code)),
        entries,
      };
    },
  };
}

export type ReceiptRepair = ReturnType<typeof createReceiptRepair>;
