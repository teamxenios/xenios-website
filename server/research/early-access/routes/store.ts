import type { EarlyAccessReleaseInvoice } from "../commerce/invoice-service";
import type { EarlyAccessReleaseOrder } from "../commerce/order-service";
import type { EarlyAccessProofRecord } from "../commerce/proof-service";
import type {
  EarlyAccessSupplierReleasePacket,
  SupplierShipmentRecipient,
} from "../commerce/supplier-release";
import type { EarlyAccessCommissionHold } from "../commerce/commission-event";
import type {
  EarlyAccessFulfillmentRecord,
  EarlyAccessReleaseRecord,
  EarlyAccessTrackingRecord,
} from "../commerce/release-service";
import type { EarlyAccessVerificationEntry } from "../commerce/verification-service";
import type { EarlyAccessVerifiedOrder } from "../commerce/payment-verification";
import type {
  EarlyAccessReferralAttribution,
  EarlyAccessSupplierAssignment,
} from "./ports";

/**
 * The unit of work for Early Access commerce, and the ONE place a set of
 * commerce facts becomes durable together.
 *
 * WHY A STORE RATHER THAN THE PER-MODULE REPOSITORIES. Each commerce module ships
 * its own append-only repository, and each one is correct on its own. Composed,
 * they are not enough: placing an order writes an order AND an invoice, and
 * confirming a payment writes a verification AND a receipt AND a ledger row AND a
 * supplier order AND an outbox row AND a commission hold. Spread across six
 * stores, a fault between the third and the fourth leaves a customer who owes
 * money for an order that has no invoice, or a payment that was accepted but
 * released nothing. Those are the states nobody can clean up by hand.
 *
 * So the transaction boundary is stated once, here, as a method that either
 * writes everything or writes nothing. The commerce modules' PURE functions do
 * all the deciding; this holds the result. A real implementation maps each
 * `commit*` to one SQL transaction with the unique constraints named on each
 * record, and nothing about the routes changes.
 *
 * WHY THE IN-MEMORY DEFAULT IS GENUINELY ATOMIC. Every `commit*` below contains
 * no `await` between reading the uniqueness state and writing. One JavaScript
 * turn therefore covers the whole check-and-write, so two concurrent callers
 * cannot interleave inside it: the second one runs after the first has finished
 * and sees what the first wrote. That is what makes the exactly-once tests real
 * rather than a coincidence of ordering, and it is why nothing in these methods
 * may become asynchronous without a lock replacing it.
 */

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/**
 * The route-owned payment lifecycle.
 *
 * It is deliberately separate from `EarlyAccessOrder.status`, which the domain
 * freezes at `awaiting_payment` when the order is built and never rewrites: an
 * order is a fact, and what happened to its payment afterwards is a different
 * fact. Note what this vocabulary does NOT contain, structurally: there is no
 * state named "paid" that a proof submission can reach.
 */
export const EARLY_ACCESS_PAYMENT_STATES = [
  "awaiting_payment",
  "under_review",
  "payment_verified",
  "payment_rejected",
] as const;

export type EarlyAccessPaymentState = (typeof EARLY_ACCESS_PAYMENT_STATES)[number];

export type EarlyAccessPlacement = Readonly<{
  /** The one identifier that leaves the server. Equal to `order.order.orderId`. */
  orderNumber: string;
  customerRef: string;
  idempotencyKey: string;
  order: EarlyAccessReleaseOrder;
  invoice: EarlyAccessReleaseInvoice;
  /** Held here rather than in the release ledger, which deliberately keeps no address. */
  shipTo: SupplierShipmentRecipient;
  /**
   * How operations reaches THIS order's purchaser. A sibling of `shipTo` on
   * purpose: the supplier-release packet validates the recipient with a
   * closed key set, so contact nested inside `shipTo` would refuse the
   * release at payment-confirmation time. Optional because rows placed before
   * this field existed carry none; absent means "reach the customer through
   * the concierge channel that took the order".
   */
  contact?: Readonly<{ email: string; phone: string }>;
  supplier: EarlyAccessSupplierAssignment;
  attribution: EarlyAccessReferralAttribution | null;
  paymentState: EarlyAccessPaymentState;
  placedAt: string;
  /**
   * How the session that placed this order was bound to its customer.
   *
   * Recorded on the ORDER, at placement, because it is a fact about how this
   * order came to exist and it must not be re-derived later from a session
   * that no longer exists. Tonight every purchaser is "email_entry" by
   * founder decision, and tonight that discloses nothing because there is no
   * history browsing.
   *
   * It exists so the day history DOES ship, a row placed by someone who
   * typed another person's email can be excluded or flagged rather than
   * appearing in that person's history looking legitimate. Without this
   * column the bad rows would already be indistinguishable by then.
   *
   * Absent means unknown, which every reader must treat as the WEAK value.
   */
  bindingProvenance?: "email_entry" | "verified_link" | "session_code";
}>;

/**
 * One proof, as the route stores it.
 *
 * The domain record has no field for a hash and refuses an unknown key, which is
 * correct for it: the chain is about which proof is current, not about bytes. The
 * digest and the storage handle live alongside it here, so the domain's shape
 * stays exactly what it validates.
 */
export type EarlyAccessProofIntake = Readonly<{
  orderNumber: string;
  record: EarlyAccessProofRecord;
  /** Lowercase hex SHA-256 as the uploader stated it. */
  sha256: string;
  receivedAt: string;
}>;

export type EarlyAccessReceipt = Readonly<{
  receiptId: string;
  orderNumber: string;
  /** What the customer actually owed and paid, never the pre-discount subtotal. */
  payableTotalCents: number;
  currency: string;
  issuedAt: string;
  issuedByActorId: string;
}>;

export type EarlyAccessLedgerEntry = Readonly<{
  entryId: string;
  orderNumber: string;
  amountCents: number;
  currency: string;
  /** The bank or wallet reference the human matched. Unique across all orders. */
  externalTransactionId: string;
  recordedAt: string;
  recordedByActorId: string;
}>;

export type EarlyAccessOutboxEntry = Readonly<{
  outboxId: string;
  orderNumber: string;
  kind: "early_access_payment_confirmed";
  queuedAt: string;
}>;

export type EarlyAccessSettlement = Readonly<{
  orderNumber: string;
  verification: EarlyAccessVerificationEntry;
  verifiedOrder: EarlyAccessVerifiedOrder;
  receipt: EarlyAccessReceipt;
  ledgerEntry: EarlyAccessLedgerEntry;
  supplierOrder: EarlyAccessReleaseRecord;
  supplierPacket: EarlyAccessSupplierReleasePacket;
  outbox: EarlyAccessOutboxEntry;
  /** Null when the order carried no attribution, or none could be credited. */
  commission: EarlyAccessCommissionHold | null;
  settledAt: string;
}>;

export const EARLY_ACCESS_DISPATCH_KINDS = [
  "notification_attempt",
  "acknowledgement",
  "packing",
] as const;

export type EarlyAccessDispatchKind = (typeof EARLY_ACCESS_DISPATCH_KINDS)[number];

/**
 * One step of getting the packet to the supplier, including the manual fallback.
 *
 * A failed attempt is recorded, not swallowed. "We tried to reach the supplier
 * three times and it bounced" is the thing an operator needs to see, and it is
 * also the thing that must never be mistaken for a reason to un-take the money.
 */
export type EarlyAccessDispatchEvent = Readonly<{
  orderNumber: string;
  kind: EarlyAccessDispatchKind;
  /** How the packet was sent, including "by hand". Null for a non-send step. */
  channel: string | null;
  recipient: string | null;
  reference: string | null;
  outcome: "sent" | "failed" | "recorded";
  actorId: string;
  at: string;
  sequence: number;
}>;

export type EarlyAccessDispatch = Readonly<{
  events: readonly EarlyAccessDispatchEvent[];
  tracking: readonly EarlyAccessTrackingRecord[];
  fulfillment: EarlyAccessFulfillmentRecord | null;
}>;

// ---------------------------------------------------------------------------
// Commit results
// ---------------------------------------------------------------------------

export type PlacementCommit =
  | Readonly<{ committed: true; placement: EarlyAccessPlacement }>
  | Readonly<{
      committed: false;
      reason: "idempotency_key_taken" | "order_number_taken";
      /** The record that already occupies the slot, so the loser can answer with it. */
      placement: EarlyAccessPlacement;
    }>;

export type ProofCommit =
  | Readonly<{ committed: true; intake: EarlyAccessProofIntake }>
  | Readonly<{ committed: false; reason: "chain_moved" | "proof_id_taken" | "order_unknown" }>;

export type SettlementCommit =
  | Readonly<{ committed: true; settlement: EarlyAccessSettlement }>
  /** Another caller got there first. Both callers answer with the SAME settlement. */
  | Readonly<{ committed: false; reason: "already_settled"; settlement: EarlyAccessSettlement }>
  | Readonly<{ committed: false; reason: "transaction_id_used"; settlement: null }>
  | Readonly<{ committed: false; reason: "order_unknown"; settlement: null }>;

export type RejectionCommit =
  | Readonly<{ committed: true; replayed: boolean }>
  | Readonly<{ committed: false; reason: "order_unknown" | "already_settled" }>;

export type RefundAppend =
  | Readonly<{ appended: true }>
  | Readonly<{ appended: false; reason: "sequence_moved" | "refund_id_taken" }>;

export type DispatchCommit =
  | Readonly<{ committed: true }>
  | Readonly<{
      committed: false;
      reason: "order_unknown" | "not_settled" | "sequence_moved" | "already_fulfilled";
    }>;

// ---------------------------------------------------------------------------
// The port
// ---------------------------------------------------------------------------

export interface EarlyAccessCommerceStore {
  placementByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessPlacement | null>;
  placementByOrderNumber(orderNumber: string): Promise<EarlyAccessPlacement | null>;
  /** The order and its invoice land together, or neither lands. */
  commitPlacement(placement: EarlyAccessPlacement): Promise<PlacementCommit>;
  awaitingReview(): Promise<readonly EarlyAccessPlacement[]>;
  /**
   * Every placement whose `customerRef` is one of these handles, oldest first.
   *
   * The ONE read that makes a member's order history possible. Until it
   * existed the store could find an order by its number or by an idempotency
   * key, so a customer who no longer held the number, because they signed in
   * on another device or cleared the session, could prove exactly who they
   * were and still be shown nothing.
   *
   * IT TAKES HANDLES, NOT A MEMBER. Resolving a member to their handles is the
   * legal binding directory's job and stays there, so this store gains no
   * notion of accounts and cannot become a second place where ownership is
   * decided. An empty or oversized handle list returns an empty result rather
   * than everything.
   */
  placementsForCustomers(
    customerRefs: readonly string[],
  ): Promise<readonly EarlyAccessPlacement[]>;

  proofs(orderNumber: string): Promise<readonly EarlyAccessProofIntake[]>;
  /** The proof and the payment state move together. Neither implies payment. */
  commitProof(intake: EarlyAccessProofIntake): Promise<ProofCommit>;

  verifications(orderNumber: string): Promise<readonly EarlyAccessVerificationEntry[]>;
  /**
   * Record a named-admin REJECTION decision durably: the verification entry
   * appends to the trail and the placement moves to payment_rejected. Never
   * past a settlement: a settled order refuses. Replay (same idempotency
   * key) reports committed with replayed=true rather than a second effect.
   *
   * OPTIONAL for the same reason as settledTransactionRefs: the durable
   * adapter needs its own SQL function (staged as a candidate migration). A
   * store that cannot record a rejection leaves the reject door answering
   * UNAVAILABLE, which is safer than a rejection that exists only in memory.
   */
  commitRejection?(entry: EarlyAccessVerificationEntry): Promise<RejectionCommit>;
  settlement(orderNumber: string): Promise<EarlyAccessSettlement | null>;

  /**
   * Every external transaction reference that has EVER settled an order,
   * across ALL orders. Feeds the reconciliation's DUPLICATE_TRANSACTION
   * classification, so one payment claiming a second order is named as a
   * duplicate at classification time rather than surfacing only as the
   * commit-time refusal. Cross-order on purpose: a per-order list would
   * still allow the replay that actually loses money.
   *
   * OPTIONAL only because the durable adapter needs its own SQL function to
   * answer it (assigned); a store that cannot answer leaves classification
   * to the commit-time guard, which in durable mode is additionally backed
   * by the unique externalTransactionId constraint. Never emulate this with
   * a partial list: absent is safer than wrong.
   */
  settledTransactionRefs?(): Promise<readonly string[]>;

  /**
   * The overpayment exception recorded for one order, or null. One per
   * order: an overpayment is a single fact about a single arrival of money,
   * and a second record would be a second opinion about it.
   */
  overpaymentException?(orderNumber: string): Promise<unknown | null>;
  /** Record it. False when one already exists, which is a replay. */
  recordOverpaymentException?(
    orderNumber: string,
    exception: unknown,
  ): Promise<boolean>;

  /** This order's refund trail, oldest first. Append only. */
  refunds?(orderNumber: string): Promise<readonly unknown[]>;
  /**
   * Append one refund at an EXPECTED position in the trail.
   *
   * `expectedSequence` is the compare-and-swap. The caller read the trail,
   * summed what was already refunded, and checked the ceiling against that
   * sum; this refuses the write if the trail grew in between, so the loser
   * must re-read and re-check against the winner's row. Deduplicating on
   * refundId alone is NOT a substitute: the id is caller supplied, so two
   * concurrent refunds with distinct ids would both pass a ceiling computed
   * from the same stale trail and pay out twice what arrived.
   *
   * The same guard `commitDispatchEvent` uses, for the same reason, on the
   * one path where money leaves.
   */
  appendRefund?(
    orderNumber: string,
    refund: unknown,
    expectedSequence: number,
  ): Promise<RefundAppend>;
  /** Eight facts, one turn. This is the exactly-once boundary for money. */
  commitSettlement(settlement: EarlyAccessSettlement): Promise<SettlementCommit>;

  dispatch(orderNumber: string): Promise<EarlyAccessDispatch>;
  commitDispatchEvent(event: EarlyAccessDispatchEvent): Promise<DispatchCommit>;
  commitTracking(record: EarlyAccessTrackingRecord): Promise<DispatchCommit>;
  commitFulfillment(record: EarlyAccessFulfillmentRecord): Promise<DispatchCommit>;
}

// ---------------------------------------------------------------------------
// The default
// ---------------------------------------------------------------------------

export class InMemoryEarlyAccessCommerceStore implements EarlyAccessCommerceStore {
  private readonly placements = new Map<string, EarlyAccessPlacement>();
  private readonly placementsByKey = new Map<string, string>();
  private readonly proofsByOrder = new Map<string, readonly EarlyAccessProofIntake[]>();
  private readonly settlements = new Map<string, EarlyAccessSettlement>();
  private readonly rejectionsByOrder = new Map<string, readonly EarlyAccessVerificationEntry[]>();
  private readonly exceptions = new Map<string, unknown>();
  private readonly refundTrail = new Map<string, unknown[]>();
  private readonly transactionIds = new Map<string, string>();
  private readonly dispatchByOrder = new Map<string, EarlyAccessDispatch>();

  async placementByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessPlacement | null> {
    const orderNumber = this.placementsByKey.get(idempotencyKey);
    return orderNumber === undefined ? null : (this.placements.get(orderNumber) ?? null);
  }

  async placementByOrderNumber(orderNumber: string): Promise<EarlyAccessPlacement | null> {
    return this.placements.get(orderNumber) ?? null;
  }

  async placementsForCustomers(
    customerRefs: readonly string[],
  ): Promise<readonly EarlyAccessPlacement[]> {
    if (!Array.isArray(customerRefs) || customerRefs.length === 0) {
      return Object.freeze([]);
    }
    const wanted = new Set(customerRefs.filter((ref) => typeof ref === "string" && ref !== ""));
    if (wanted.size === 0) return Object.freeze([]);
    return Object.freeze(
      Array.from(this.placements.values())
        .filter((placement) => wanted.has(placement.customerRef))
        // Oldest first, order number breaking ties, so the list is stable.
        .sort((a, b) =>
          a.placedAt === b.placedAt
            ? a.orderNumber.localeCompare(b.orderNumber)
            : a.placedAt.localeCompare(b.placedAt),
        ),
    );
  }

  async commitPlacement(placement: EarlyAccessPlacement): Promise<PlacementCommit> {
    const existingByKey = this.placementsByKey.get(placement.idempotencyKey);
    if (existingByKey !== undefined) {
      const incumbent = this.placements.get(existingByKey) as EarlyAccessPlacement;
      return Object.freeze({
        committed: false as const,
        reason: "idempotency_key_taken" as const,
        placement: incumbent,
      });
    }
    const existingByNumber = this.placements.get(placement.orderNumber);
    if (existingByNumber !== undefined) {
      return Object.freeze({
        committed: false as const,
        reason: "order_number_taken" as const,
        placement: existingByNumber,
      });
    }
    this.placements.set(placement.orderNumber, placement);
    this.placementsByKey.set(placement.idempotencyKey, placement.orderNumber);
    return Object.freeze({ committed: true as const, placement });
  }

  async awaitingReview(): Promise<readonly EarlyAccessPlacement[]> {
    return Object.freeze(
      Array.from(this.placements.values())
        .filter((placement) => placement.paymentState === "under_review")
        .sort((left, right) => left.placedAt.localeCompare(right.placedAt)),
    );
  }

  async proofs(orderNumber: string): Promise<readonly EarlyAccessProofIntake[]> {
    return this.proofsByOrder.get(orderNumber) ?? Object.freeze([]);
  }

  async commitProof(intake: EarlyAccessProofIntake): Promise<ProofCommit> {
    const placement = this.placements.get(intake.orderNumber);
    if (placement === undefined) {
      return Object.freeze({ committed: false as const, reason: "order_unknown" as const });
    }
    const chain = this.proofsByOrder.get(intake.orderNumber) ?? [];
    // The pure function computed this sequence against the chain it was shown. A
    // different length now means another proof landed in between, so the record
    // would claim to supersede something that is no longer current.
    if (intake.record.sequence !== chain.length + 1) {
      return Object.freeze({ committed: false as const, reason: "chain_moved" as const });
    }
    if (chain.some((entry) => entry.record.proofId === intake.record.proofId)) {
      return Object.freeze({ committed: false as const, reason: "proof_id_taken" as const });
    }
    this.proofsByOrder.set(intake.orderNumber, Object.freeze([...chain, intake]));
    // A proof moves the order to review and NEVER past it. There is no branch
    // here that can reach payment_verified. A REJECTED order re-enters review
    // the same way: a fresh submission is exactly the action a rejection asks
    // for, and leaving the state at payment_rejected would strand the order.
    if (placement.paymentState === "awaiting_payment" || placement.paymentState === "payment_rejected") {
      this.placements.set(
        intake.orderNumber,
        Object.freeze({ ...placement, paymentState: "under_review" as const }),
      );
    }
    return Object.freeze({ committed: true as const, intake });
  }

  async verifications(orderNumber: string): Promise<readonly EarlyAccessVerificationEntry[]> {
    const rejections = this.rejectionsByOrder.get(orderNumber) ?? [];
    const settled = this.settlements.get(orderNumber);
    return Object.freeze(
      settled === undefined ? [...rejections] : [...rejections, settled.verification],
    );
  }

  async commitRejection(entry: EarlyAccessVerificationEntry): Promise<RejectionCommit> {
    const placement = this.placements.get(entry.orderId);
    if (placement === undefined) {
      return Object.freeze({ committed: false as const, reason: "order_unknown" as const });
    }
    if (this.settlements.has(entry.orderId)) {
      return Object.freeze({ committed: false as const, reason: "already_settled" as const });
    }
    const trail = this.rejectionsByOrder.get(entry.orderId) ?? [];
    if (trail.some((prior) => prior.idempotencyKey === entry.idempotencyKey)) {
      return Object.freeze({ committed: true as const, replayed: true });
    }
    this.rejectionsByOrder.set(entry.orderId, Object.freeze([...trail, entry]));
    this.placements.set(
      entry.orderId,
      Object.freeze({ ...placement, paymentState: "payment_rejected" as const }),
    );
    return Object.freeze({ committed: true as const, replayed: false });
  }

  async settlement(orderNumber: string): Promise<EarlyAccessSettlement | null> {
    return this.settlements.get(orderNumber) ?? null;
  }

  async settledTransactionRefs(): Promise<readonly string[]> {
    return Array.from(this.transactionIds.keys());
  }

  async overpaymentException(orderNumber: string): Promise<unknown | null> {
    return this.exceptions.get(orderNumber) ?? null;
  }

  async recordOverpaymentException(
    orderNumber: string,
    exception: unknown,
  ): Promise<boolean> {
    if (this.exceptions.has(orderNumber)) return false;
    this.exceptions.set(orderNumber, exception);
    return true;
  }

  async refunds(orderNumber: string): Promise<readonly unknown[]> {
    return [...(this.refundTrail.get(orderNumber) ?? [])];
  }

  async appendRefund(
    orderNumber: string,
    refund: unknown,
    expectedSequence: number,
  ): Promise<RefundAppend> {
    const id = (refund as { refundId?: unknown }).refundId;
    const trail = this.refundTrail.get(orderNumber) ?? [];
    if (trail.some((entry) => (entry as { refundId?: unknown }).refundId === id)) {
      return Object.freeze({ appended: false as const, reason: "refund_id_taken" as const });
    }
    // The trail grew since the caller computed its ceiling, so that ceiling
    // is stale and this write would spend money against a number that is no
    // longer true.
    if (expectedSequence !== trail.length + 1) {
      return Object.freeze({ appended: false as const, reason: "sequence_moved" as const });
    }
    this.refundTrail.set(orderNumber, [...trail, refund]);
    return Object.freeze({ appended: true as const });
  }

  async commitSettlement(settlement: EarlyAccessSettlement): Promise<SettlementCommit> {
    const placement = this.placements.get(settlement.orderNumber);
    if (placement === undefined) {
      return Object.freeze({
        committed: false as const,
        reason: "order_unknown" as const,
        settlement: null,
      });
    }
    const existing = this.settlements.get(settlement.orderNumber);
    if (existing !== undefined) {
      return Object.freeze({
        committed: false as const,
        reason: "already_settled" as const,
        settlement: existing,
      });
    }
    // One arrival of money pays one order. A reference already matched against a
    // different order is either a mistake or a second claim on one payment, and
    // both must stop here rather than release a second box.
    const claimedBy = this.transactionIds.get(settlement.ledgerEntry.externalTransactionId);
    if (claimedBy !== undefined && claimedBy !== settlement.orderNumber) {
      return Object.freeze({
        committed: false as const,
        reason: "transaction_id_used" as const,
        settlement: null,
      });
    }

    this.settlements.set(settlement.orderNumber, settlement);
    this.transactionIds.set(settlement.ledgerEntry.externalTransactionId, settlement.orderNumber);
    this.placements.set(
      settlement.orderNumber,
      Object.freeze({ ...placement, paymentState: "payment_verified" as const }),
    );
    this.dispatchByOrder.set(
      settlement.orderNumber,
      Object.freeze({ events: Object.freeze([]), tracking: Object.freeze([]), fulfillment: null }),
    );
    return Object.freeze({ committed: true as const, settlement });
  }

  async dispatch(orderNumber: string): Promise<EarlyAccessDispatch> {
    return (
      this.dispatchByOrder.get(orderNumber) ??
      Object.freeze({ events: Object.freeze([]), tracking: Object.freeze([]), fulfillment: null })
    );
  }

  async commitDispatchEvent(event: EarlyAccessDispatchEvent): Promise<DispatchCommit> {
    const current = this.dispatchByOrder.get(event.orderNumber);
    if (current === undefined) {
      return Object.freeze({ committed: false as const, reason: "not_settled" as const });
    }
    if (event.sequence !== current.events.length + 1) {
      return Object.freeze({ committed: false as const, reason: "sequence_moved" as const });
    }
    this.dispatchByOrder.set(
      event.orderNumber,
      Object.freeze({ ...current, events: Object.freeze([...current.events, event]) }),
    );
    return Object.freeze({ committed: true as const });
  }

  async commitTracking(record: EarlyAccessTrackingRecord): Promise<DispatchCommit> {
    const current = this.dispatchByOrder.get(record.orderId);
    if (current === undefined) {
      return Object.freeze({ committed: false as const, reason: "not_settled" as const });
    }
    if (record.sequence !== current.tracking.length + 1) {
      return Object.freeze({ committed: false as const, reason: "sequence_moved" as const });
    }
    this.dispatchByOrder.set(
      record.orderId,
      Object.freeze({ ...current, tracking: Object.freeze([...current.tracking, record]) }),
    );
    return Object.freeze({ committed: true as const });
  }

  async commitFulfillment(record: EarlyAccessFulfillmentRecord): Promise<DispatchCommit> {
    const current = this.dispatchByOrder.get(record.orderId);
    if (current === undefined) {
      return Object.freeze({ committed: false as const, reason: "not_settled" as const });
    }
    if (current.fulfillment !== null) {
      return Object.freeze({ committed: false as const, reason: "already_fulfilled" as const });
    }
    this.dispatchByOrder.set(record.orderId, Object.freeze({ ...current, fulfillment: record }));
    return Object.freeze({ committed: true as const });
  }
}
