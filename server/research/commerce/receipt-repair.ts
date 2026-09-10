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
  | "read_failed"
  | "recipient_not_an_address"
  | "order_state_needs_a_person";

export interface ReceiptRepairEntry {
  executionId: string;
  orderId: string;
  code: ReceiptCode;
  /** Present when a person needs to look. Written here, never from a provider. */
  reason?: string;
}

/**
 * Where a reconciliation pass stopped, so the next one resumes after it.
 *
 * Without this a pass reads the same first batch every time. Most of that batch
 * is `before_cutoff`, `already_present` or refused, so the orders behind it are
 * never reached, and the customers whose enqueue was lost longest ago are
 * exactly the ones never repaired.
 */
export interface CommittedCursor {
  committedAt: string;
  executionId: string;
}

export interface ReceiptRepairReport {
  considered: number;
  queued: number;
  alreadyPresent: number;
  previewed: number;
  refused: ReceiptRepairEntry[];
  entries: ReceiptRepairEntry[];
  /** Hand this back to the next pass. Null when the queue was read to the end. */
  cursor: CommittedCursor | null;
}

export interface ReceiptRepairDeps {
  /**
   * Committed executions, oldest first by (committedAt, executionId), resuming
   * strictly after `after`. The reader is the integration owner's; this module
   * only requires that it be bounded, totally ordered and resumable, because a
   * reader that cannot page cannot reach the orders that need repair most.
   */
  listCommitted(request: { limit: number; after?: CommittedCursor | null }): Promise<readonly CommittedExecutionFacts[]>;
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
  // The money the customer reads is DERIVED from the cents on the same row,
  // never taken from a free-text field beside them. A row whose formatted total
  // disagreed with its cents would otherwise state the wrong amount.
  const cents = payload.totalCents;
  if (!Number.isSafeInteger(cents) || (cents as number) < 0) return null;
  const total = formatUsdCents(cents as number);
  const url = safeOrderUrl(payload.orderUrl);
  if (!reference) return null;
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

/**
 * An order link, or nothing. A payload field is not a place a link may come
 * from unchecked: an email that carries an arbitrary URL is a phishing vector,
 * and one that carries a provider URL can leak a payment's client secret.
 */
export function safeOrderUrl(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return "";
    if (url.search !== "" || url.hash !== "") return "";
    return url.toString();
  } catch {
    return "";
  }
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

  /**
   * Order states in which a payment HAS been taken. A captured order does not
   * stay `payment_captured`: it moves on through fulfilment, and treating any
   * later state as proof that no payment happened would deny a receipt to
   * exactly the customers whose enqueue was lost longest ago.
   */
  const PAID_STATES: readonly string[] = ["payment_captured", "processing", "partially_fulfilled", "fulfilled", "delivered"];
  /** States before any capture. A receipt here would be false. */
  const UNPAID_STATES: readonly string[] = ["draft", "checkout_pending", "payment_authorized", "manual_review", "approved"];

  /**
   * Whether a queued row IS the receipt this order needs, or the reason it is
   * not. Used on the row that was just inserted AND on a row that was already
   * there: a key that merely exists is not proof that the right thing was
   * queued to the right person, and the pass that finds it later must be as
   * strict as the pass that wrote it.
   */
  function verifyStored(
    stored: QueuedEventFacts,
    recipient: string,
    payload: Record<string, unknown>,
    amountCents: number,
  ): string | null {
    if (stored.eventType !== RECEIPT_EVENT_TYPE) return "the queued event is of another type";
    if (stored.templateKey !== RECEIPT_TEMPLATE_KEY) return "the queued event names another template";
    if (stored.recipient !== recipient) return "the queued event is addressed to somebody else";
    if (Number((stored.payload ?? {}).totalCents) !== amountCents) return "the queued event states another amount";
    const storedRendering = renderCommittedReceipt({ ...(stored.payload ?? {}) });
    const intended = renderCommittedReceipt(payload);
    if (storedRendering === null || intended === null) return "the queued event cannot be rendered into a receipt";
    if (storedRendering.subject !== intended.subject || storedRendering.text !== intended.text) {
      return "the queued event would read differently from the receipt this order needs";
    }
    return null;
  }

  /** Every reason this execution must not produce a receipt, in order. */
  async function refuseFor(
    execution: CommittedExecutionFacts,
    order: ReceiptOrderFacts | null,
  ): Promise<{ code: ReceiptCode; reason: string } | null> {
    if (!order) return { code: "order_missing", reason: "the execution names an order that cannot be read" };
    if (order.memberId !== execution.memberId) {
      return { code: "order_not_the_members", reason: "the order belongs to a different member than the execution" };
    }
    if (UNPAID_STATES.includes(order.state)) {
      return { code: "order_not_captured", reason: `the order is ${order.state}, so no payment has been recorded against it` };
    }
    if (!PAID_STATES.includes(order.state)) {
      // cancelled, refunded, replaced, exception: something happened to this
      // order that a plain payment receipt would misdescribe.
      return { code: "order_state_needs_a_person", reason: `the order is ${order.state}; a person decides what this customer should be told` };
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
    async repair(options: { limit?: number; cursor?: CommittedCursor | null } = {}): Promise<ReceiptRepairReport> {
      // An unusable cutoff would compare false against every timestamp and mail
      // the entire history. Refuse the pass rather than discover that afterwards.
      if (!(deps.eligibleAfter instanceof Date) || !Number.isFinite(deps.eligibleAfter.getTime())) {
        throw new ReceiptRepairMisconfigured("eligibleAfter must be a valid date; refusing to run without a cutoff.");
      }
      const limit = Math.max(1, Math.min(options.limit ?? 50, 200));
      const executions = await deps.listCommitted({ limit, after: options.cursor ?? null });
      const entries: ReceiptRepairEntry[] = [];
      let cursor: CommittedCursor | null = null;

      for (const execution of executions) {
        const push = (code: ReceiptCode, reason?: string) =>
          entries.push({ executionId: execution.executionId, orderId: execution.orderId, code, ...(reason ? { reason } : {}) });

        // The position advances for every row this pass looked at, whatever it
        // decided, so a row it can never act on cannot block the ones behind it.
        if (typeof execution.committedAt === "string" && execution.committedAt.length > 0) {
          cursor = { committedAt: execution.committedAt, executionId: execution.executionId };
        }
        try {
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
        // index, is what prevents a second receipt under a new name. A prior
        // lane's row is a different template with a different payload, so its
        // existence is all that can be checked about it.
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

        const recipient = await deps.recipientFor(execution.memberId);
        if (!recipient) {
          push("recipient_unknown", "no canonical address is on file for this member");
          continue;
        }
        // A truthy string is not an address. A queue row with a malformed
        // recipient fails at send time, after the row exists.
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) {
          push("recipient_not_an_address", "the address on file for this member is not a usable email address");
          continue;
        }

        const payload = receiptPayload({ orderId: execution.orderId, amountCents: execution.amountCents }, deps.orderUrl(execution.orderId));
        if (renderCommittedReceipt(payload) === null) {
          push("queued_event_disagrees", "the receipt could not be rendered from the order's own facts");
          continue;
        }

        // A row already under this key is VERIFIED, not assumed. The pass that
        // wrote it refuses a row that disagrees; a later pass that merely saw
        // the key would otherwise count that same wrong row as done.
        const eventKey = receiptEventKey(execution.orderId);
        const existing = await deps.findQueuedEvent(eventKey);
        if (existing) {
          const problem = verifyStored(existing, recipient, payload, execution.amountCents);
          if (problem) push("queued_event_disagrees", problem);
          else push("already_present");
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
        const problem = stored ? verifyStored(stored, recipient, payload, execution.amountCents) : "the queued event could not be read back";
        if (problem) {
          push("queued_event_disagrees", problem);
          continue;
        }

        push(outcome === "inserted" ? "queued" : "already_present");
        } catch {
          // One row that cannot be processed must not discard the record of
          // every receipt this pass already queued. The error text never
          // travels: it can carry a recipient or a filter value.
          push("read_failed", "this order could not be processed on this pass");
        }
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
        "recipient_not_an_address",
        "order_state_needs_a_person",
        "queue_unavailable",
        "queued_event_disagrees",
      ];
      return {
        // A short page means the queue was read to the end; the next cycle
        // starts fresh so temporarily refused rows are reconsidered.
        cursor: executions.length < limit ? null : cursor,
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
