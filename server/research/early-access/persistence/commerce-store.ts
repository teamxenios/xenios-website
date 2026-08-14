import type {
  DispatchCommit,
  EarlyAccessCommerceStore,
  EarlyAccessDispatch,
  EarlyAccessDispatchEvent,
  EarlyAccessPlacement,
  EarlyAccessProofIntake,
  EarlyAccessSettlement,
  PlacementCommit,
  ProofCommit,
  RejectionCommit,
  SettlementCommit,
} from "../routes/store";
import type { EarlyAccessVerificationEntry } from "../commerce/verification-service";
import type {
  EarlyAccessFulfillmentRecord,
  EarlyAccessTrackingRecord,
} from "../commerce/release-service";
import {
  EarlyAccessPersistenceError,
  expectArray,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "./executor";

/**
 * The durable `EarlyAccessCommerceStore`.
 *
 * Each `commit*` is exactly one SECURITY DEFINER function and therefore
 * exactly one SQL transaction, which is the contract the in-memory store's
 * header states for a real implementation. The exactly-once guarantees the
 * in-memory store gets from single-JS-turn atomicity come here from the
 * placement row lock and the unique constraints on idempotency key, order
 * number, proof id, proof sequence, external transaction id, dispatch
 * sequence, and the one-fulfillment primary key.
 *
 * The canonical domain object round-trips through a jsonb column verbatim;
 * this adapter maps refusal reasons and freezes what it returns, and decides
 * nothing else. An infrastructure failure throws (an opaque error), which the
 * routes surface as a 500 rather than a wrong answer.
 */

const RPC = {
  commitPlacement: "research_early_access_commit_placement",
  commitProof: "research_early_access_commit_proof",
  commitRejection: "research_early_access_commit_rejection",
  commitSettlement: "research_early_access_commit_settlement",
  commitDispatchEvent: "research_early_access_commit_dispatch_event",
  commitTracking: "research_early_access_commit_tracking",
  commitFulfillment: "research_early_access_commit_fulfillment",
  placementByKey: "research_early_access_placement_by_key",
  placement: "research_early_access_placement",
  awaitingReview: "research_early_access_awaiting_review",
  placementsForCustomers: "research_early_access_placements_for_customers",
  settledTransactionRefs: "research_early_access_settled_transaction_refs",
  proofs: "research_early_access_proofs",
  settlement: "research_early_access_settlement",
  verifications: "research_early_access_verifications",
  dispatch: "research_early_access_dispatch",
} as const;

const PLACEMENT_REASONS = ["idempotency_key_taken", "order_number_taken"] as const;
const PROOF_REASONS = ["chain_moved", "proof_id_taken", "order_unknown"] as const;
const SETTLEMENT_REASONS = ["already_settled", "transaction_id_used", "order_unknown"] as const;
const REJECTION_REASONS = ["already_settled", "order_unknown"] as const;
const DISPATCH_REASONS = [
  "order_unknown",
  "not_settled",
  "sequence_moved",
  "already_fulfilled",
] as const;

export type SupabaseEarlyAccessCommerceStoreOptions = Readonly<{
  query: EarlyAccessPersistenceQuery;
  /**
   * Optional reservation lifetime. When set, a placement's reservation row
   * carries an expiry, and money submitted after it lapses raises an admin
   * exception in the database (a human decision queue; never an auto-refund,
   * never an auto-fulfillment). Null preserves today's behavior exactly:
   * reservations do not expire.
   */
  reservationTtlMinutes?: number | null;
}>;

export class SupabaseEarlyAccessCommerceStore implements EarlyAccessCommerceStore {
  private readonly query: EarlyAccessPersistenceQuery;
  private readonly reservationTtlMinutes: number | null;

  constructor(options: SupabaseEarlyAccessCommerceStoreOptions) {
    this.query = options.query;
    this.reservationTtlMinutes =
      typeof options.reservationTtlMinutes === "number" &&
      Number.isSafeInteger(options.reservationTtlMinutes) &&
      options.reservationTtlMinutes > 0
        ? options.reservationTtlMinutes
        : null;
  }

  async placementByIdempotencyKey(idempotencyKey: string): Promise<EarlyAccessPlacement | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.placementByKey,
      args: { p_idempotency_key: idempotencyKey },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.placementByKey, raw)) as EarlyAccessPlacement);
  }

  async placementByOrderNumber(orderNumber: string): Promise<EarlyAccessPlacement | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.placement,
      args: { p_order_number: orderNumber },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.placement, raw)) as EarlyAccessPlacement);
  }

  async commitPlacement(placement: EarlyAccessPlacement): Promise<PlacementCommit> {
    const raw = expectObject(
      RPC.commitPlacement,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitPlacement,
        args: {
          p_placement: placement,
          p_reservation_ttl_minutes: this.reservationTtlMinutes,
        },
      }),
    );
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const, placement });
    }
    const reason = raw.reason;
    if (!isOneOf(reason, PLACEMENT_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitPlacement);
    }
    return Object.freeze({
      committed: false as const,
      reason,
      placement: Object.freeze(
        expectObject(RPC.commitPlacement, raw.placement),
      ) as EarlyAccessPlacement,
    });
  }

  /**
   * The member order-history read, added by M67.
   *
   * Like every other read here it goes through a routine rather than the
   * table: the commerce persistence migration revokes its tables from
   * `service_role` too, so a direct select is not merely discouraged, it is
   * not permitted. The routine filters on the handles this call supplies and
   * the ownership rule is applied AGAIN above it, so a widened routine could
   * not by itself widen what a member sees.
   */
  async placementsForCustomers(
    customerRefs: readonly string[],
  ): Promise<readonly EarlyAccessPlacement[]> {
    if (!Array.isArray(customerRefs) || customerRefs.length === 0) {
      return Object.freeze([]);
    }
    const refs = customerRefs.filter((ref) => typeof ref === "string" && ref !== "");
    if (refs.length === 0) return Object.freeze([]);
    const raw = expectArray(
      RPC.placementsForCustomers,
      await runEarlyAccessCall(this.query, {
        fn: RPC.placementsForCustomers,
        args: { p_customer_refs: refs },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(
            expectObject(RPC.placementsForCustomers, entry),
          ) as EarlyAccessPlacement,
      ),
    );
  }

  async awaitingReview(): Promise<readonly EarlyAccessPlacement[]> {
    const raw = expectArray(
      RPC.awaitingReview,
      await runEarlyAccessCall(this.query, { fn: RPC.awaitingReview, args: {} }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.awaitingReview, entry)) as EarlyAccessPlacement,
      ),
    );
  }

  async proofs(orderNumber: string): Promise<readonly EarlyAccessProofIntake[]> {
    const raw = expectArray(
      RPC.proofs,
      await runEarlyAccessCall(this.query, {
        fn: RPC.proofs,
        args: { p_order_number: orderNumber },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) => Object.freeze(expectObject(RPC.proofs, entry)) as EarlyAccessProofIntake,
      ),
    );
  }

  async commitProof(intake: EarlyAccessProofIntake): Promise<ProofCommit> {
    const raw = expectObject(
      RPC.commitProof,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitProof,
        args: { p_intake: intake },
      }),
    );
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const, intake });
    }
    const reason = raw.reason;
    if (!isOneOf(reason, PROOF_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitProof);
    }
    return Object.freeze({ committed: false as const, reason });
  }

  async verifications(orderNumber: string): Promise<readonly EarlyAccessVerificationEntry[]> {
    const raw = expectArray(
      RPC.verifications,
      await runEarlyAccessCall(this.query, {
        fn: RPC.verifications,
        args: { p_order_number: orderNumber },
      }),
    );
    return Object.freeze(
      raw.map(
        (entry) =>
          Object.freeze(expectObject(RPC.verifications, entry)) as EarlyAccessVerificationEntry,
      ),
    );
  }

  async settlement(orderNumber: string): Promise<EarlyAccessSettlement | null> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.settlement,
      args: { p_order_number: orderNumber },
    });
    return raw === null || raw === undefined
      ? null
      : (Object.freeze(expectObject(RPC.settlement, raw)) as EarlyAccessSettlement);
  }

  /**
   * Every external transaction reference that has EVER settled an order
   * (migration 55). The ledger is written only inside commit_settlement and
   * is append-only, so this answer is always whole, never partial, which is
   * the interface's own requirement for implementing it at all.
   */
  async settledTransactionRefs(): Promise<readonly string[]> {
    const raw = expectArray(
      RPC.settledTransactionRefs,
      await runEarlyAccessCall(this.query, {
        fn: RPC.settledTransactionRefs,
        args: {},
      }),
    );
    return Object.freeze(
      raw.filter((entry): entry is string => typeof entry === "string"),
    );
  }

  async commitRejection(entry: EarlyAccessVerificationEntry): Promise<RejectionCommit> {
    const raw = expectObject(
      RPC.commitRejection,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitRejection,
        args: { p_rejection: entry },
      }),
    );
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const, replayed: raw.replayed === true });
    }
    const reason = raw.reason;
    if (!isOneOf(reason, REJECTION_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitRejection);
    }
    return Object.freeze({ committed: false as const, reason });
  }

  async commitSettlement(settlement: EarlyAccessSettlement): Promise<SettlementCommit> {
    const raw = expectObject(
      RPC.commitSettlement,
      await runEarlyAccessCall(this.query, {
        fn: RPC.commitSettlement,
        args: { p_settlement: settlement },
      }),
    );
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const, settlement });
    }
    const reason = raw.reason;
    if (!isOneOf(reason, SETTLEMENT_REASONS)) {
      throw new EarlyAccessPersistenceError(RPC.commitSettlement);
    }
    if (reason === "already_settled") {
      return Object.freeze({
        committed: false as const,
        reason,
        settlement: Object.freeze(
          expectObject(RPC.commitSettlement, raw.settlement),
        ) as EarlyAccessSettlement,
      });
    }
    return Object.freeze({ committed: false as const, reason, settlement: null });
  }

  async dispatch(orderNumber: string): Promise<EarlyAccessDispatch> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: RPC.dispatch,
      args: { p_order_number: orderNumber },
    });
    if (raw === null || raw === undefined) {
      // Never settled: the same empty dispatch record the in-memory store
      // answers for an order it has not initialized.
      return Object.freeze({
        events: Object.freeze([]),
        tracking: Object.freeze([]),
        fulfillment: null,
      });
    }
    const parsed = expectObject(RPC.dispatch, raw);
    return Object.freeze({
      events: Object.freeze(
        expectArray(RPC.dispatch, parsed.events ?? []).map(
          (entry) => Object.freeze(expectObject(RPC.dispatch, entry)) as EarlyAccessDispatchEvent,
        ),
      ),
      tracking: Object.freeze(
        expectArray(RPC.dispatch, parsed.tracking ?? []).map(
          (entry) =>
            Object.freeze(expectObject(RPC.dispatch, entry)) as EarlyAccessTrackingRecord,
        ),
      ),
      fulfillment:
        parsed.fulfillment === null || parsed.fulfillment === undefined
          ? null
          : (Object.freeze(
              expectObject(RPC.dispatch, parsed.fulfillment),
            ) as EarlyAccessFulfillmentRecord),
    });
  }

  async commitDispatchEvent(event: EarlyAccessDispatchEvent): Promise<DispatchCommit> {
    return this.dispatchCommit(RPC.commitDispatchEvent, { p_event: event });
  }

  async commitTracking(record: EarlyAccessTrackingRecord): Promise<DispatchCommit> {
    return this.dispatchCommit(RPC.commitTracking, { p_record: record });
  }

  async commitFulfillment(record: EarlyAccessFulfillmentRecord): Promise<DispatchCommit> {
    return this.dispatchCommit(RPC.commitFulfillment, { p_record: record });
  }

  private async dispatchCommit(
    fn: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<DispatchCommit> {
    const raw = expectObject(fn, await runEarlyAccessCall(this.query, { fn, args }));
    if (raw.committed === true) {
      return Object.freeze({ committed: true as const });
    }
    const reason = raw.reason;
    if (!isOneOf(reason, DISPATCH_REASONS)) {
      throw new EarlyAccessPersistenceError(fn);
    }
    return Object.freeze({ committed: false as const, reason });
  }
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === "string" && (allowed as readonly string[]).includes(value);
}
