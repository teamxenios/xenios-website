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
  SettlementCommit,
} from "../routes/store";
import type { EarlyAccessVerificationEntry } from "../commerce/verification-service";
import type {
  EarlyAccessFulfillmentRecord,
  EarlyAccessTrackingRecord,
} from "../commerce/release-service";
import type { EarlyAccessAuditEvent, EarlyAccessAuditSink } from "../routes/ports";
import type {
  EarlyAccessCustomerRecord,
  EarlyAccessCustomerRepository,
} from "../identity/early-access-customer";
import type { CommerceResult } from "../commerce/input-guards";
import type {
  ConsumedTokenStore,
  SessionBindingStore,
} from "../identity/identity-verification";
import type {
  EarlyAccessReservation,
  EarlyAccessReservationExpiryException,
} from "../commerce/reservation";
import type { EarlyAccessReservationStore } from "../commerce/reservation-store";

/**
 * The refusing stores, for a production process whose durable configuration
 * is missing while Early Access is switched on.
 *
 * The rule (stated at the session layer, extended here to commerce): such a
 * process must not sell, and it must not pretend. An in-memory fallback
 * would accept an order and lose it on the next restart, which is the one
 * outcome worse than refusing. So every method here throws, loudly, with a
 * reason a human can act on, and the caller's error path (an HTTP 500)
 * carries no invented state.
 *
 * These classes hold NOTHING: no maps, no sets, no queues. There is no data
 * to lose because no data is ever accepted.
 */

export class EarlyAccessPersistenceUnavailableError extends Error {
  constructor(operation: string) {
    super(
      `Early Access durable persistence is not configured; refusing ${operation}. ` +
        "Production with Early Access enabled requires the durable repositories " +
        "(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, plus the applied Early Access " +
        "migrations). In-memory fallback is deliberately not available here.",
    );
    this.name = "EarlyAccessPersistenceUnavailableError";
  }
}

function refuse(operation: string): never {
  throw new EarlyAccessPersistenceUnavailableError(operation);
}

export class RefusingEarlyAccessCommerceStore implements EarlyAccessCommerceStore {
  async placementByIdempotencyKey(_key: string): Promise<EarlyAccessPlacement | null> {
    return refuse("placementByIdempotencyKey");
  }
  async placementByOrderNumber(_orderNumber: string): Promise<EarlyAccessPlacement | null> {
    return refuse("placementByOrderNumber");
  }
  async commitPlacement(_placement: EarlyAccessPlacement): Promise<PlacementCommit> {
    return refuse("commitPlacement");
  }
  async awaitingReview(): Promise<readonly EarlyAccessPlacement[]> {
    return refuse("awaitingReview");
  }
  async proofs(_orderNumber: string): Promise<readonly EarlyAccessProofIntake[]> {
    return refuse("proofs");
  }
  async commitProof(_intake: EarlyAccessProofIntake): Promise<ProofCommit> {
    return refuse("commitProof");
  }
  async verifications(_orderNumber: string): Promise<readonly EarlyAccessVerificationEntry[]> {
    return refuse("verifications");
  }
  async settlement(_orderNumber: string): Promise<EarlyAccessSettlement | null> {
    return refuse("settlement");
  }
  async commitSettlement(_settlement: EarlyAccessSettlement): Promise<SettlementCommit> {
    return refuse("commitSettlement");
  }
  async dispatch(_orderNumber: string): Promise<EarlyAccessDispatch> {
    return refuse("dispatch");
  }
  async commitDispatchEvent(_event: EarlyAccessDispatchEvent): Promise<DispatchCommit> {
    return refuse("commitDispatchEvent");
  }
  async commitTracking(_record: EarlyAccessTrackingRecord): Promise<DispatchCommit> {
    return refuse("commitTracking");
  }
  async commitFulfillment(_record: EarlyAccessFulfillmentRecord): Promise<DispatchCommit> {
    return refuse("commitFulfillment");
  }
}

export class RefusingEarlyAccessAuditSink implements EarlyAccessAuditSink {
  async record(_event: EarlyAccessAuditEvent): Promise<void> {
    return refuse("audit record");
  }
}

export class RefusingEarlyAccessCustomerRepository implements EarlyAccessCustomerRepository {
  async findById(_id: string): Promise<EarlyAccessCustomerRecord | null> {
    return refuse("customer findById");
  }
  async findByNormalizedEmail(
    _normalizedEmail: string,
  ): Promise<EarlyAccessCustomerRecord | null> {
    return refuse("customer findByNormalizedEmail");
  }
  async insert(
    _record: EarlyAccessCustomerRecord,
  ): Promise<CommerceResult<EarlyAccessCustomerRecord, "EMAIL_ALREADY_REGISTERED">> {
    return refuse("customer insert");
  }
  async update(_record: EarlyAccessCustomerRecord): Promise<EarlyAccessCustomerRecord> {
    return refuse("customer update");
  }
}

export class RefusingConsumedTokenStore implements ConsumedTokenStore {
  async consume(_tokenId: string): Promise<boolean> {
    return refuse("token consume");
  }
}

export class RefusingEarlyAccessReservationStore implements EarlyAccessReservationStore {
  async insert(_reservation: EarlyAccessReservation): Promise<boolean> {
    return refuse("reservation insert");
  }
  async byId(_reservationId: string): Promise<EarlyAccessReservation | null> {
    return refuse("reservation byId");
  }
  async byOrderDraft(_orderDraftId: string): Promise<EarlyAccessReservation | null> {
    return refuse("reservation byOrderDraft");
  }
  async update(_reservation: EarlyAccessReservation): Promise<boolean> {
    return refuse("reservation update");
  }
  async activeForUnit(
    _productId: string,
    _variantId: string,
  ): Promise<readonly EarlyAccessReservation[]> {
    return refuse("reservation activeForUnit");
  }
  async recordExpiryException(
    _exception: EarlyAccessReservationExpiryException,
  ): Promise<boolean> {
    return refuse("reservation recordExpiryException");
  }
  async expiryExceptions(): Promise<readonly EarlyAccessReservationExpiryException[]> {
    return refuse("reservation expiryExceptions");
  }
}

export class RefusingSessionBindingStore implements SessionBindingStore {
  async get(_sessionId: string): Promise<string | null> {
    return refuse("session binding get");
  }
  async bind(_sessionId: string, _customerId: string): Promise<boolean> {
    return refuse("session binding bind");
  }
}
