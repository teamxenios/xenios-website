import type { StatusRecoverySubjectType } from "../../../shared/research/status-recovery/contract";
import type {
  StatusRecoveryDeliveryBinding,
  StatusRecoveryStore,
  StatusRecoverySubject,
} from "./ports";
import { buildStatusRecoveryView } from "./status-copy";

export type StatusRecoveryRpcClient = Readonly<{
  rpc(name: string, args?: Readonly<Record<string, unknown>>): Promise<Readonly<{
    data: unknown;
    error: null | Readonly<{ message?: string; code?: string }>;
  }>>;
}>;

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}

function requiredText(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("Status recovery projection is invalid.");
  return value;
}

function optionalText(value: unknown): string | null {
  return value === null || value === undefined ? null : requiredText(value);
}

function fail(operation: string, error: Readonly<{ message?: string; code?: string }>): never {
  throw new Error(`${operation} failed (${error.code ?? "unknown"}): ${error.message ?? "unknown"}`);
}

export class SupabaseStatusRecoveryStore implements StatusRecoveryStore {
  public constructor(private readonly client: StatusRecoveryRpcClient) {}

  public async findEligibleSubject(
    publicReference: string,
    normalizedEmail: string,
  ): Promise<StatusRecoverySubject | null> {
    const response = await this.client.rpc("research_status_recovery_match", {
      p_public_reference: publicReference,
      p_normalized_email: normalizedEmail,
    });
    if (response.error) fail("research_status_recovery_match", response.error);
    if (response.data === null) return null;
    const value = record(response.data);
    if (!value) throw new Error("Status recovery match is invalid.");
    return Object.freeze({
      subjectType: requiredText(value.subjectType) as StatusRecoverySubjectType,
      subjectId: requiredText(value.subjectId),
      ownerId: optionalText(value.ownerId),
      publicReference: requiredText(value.publicReference),
      canonicalEmail: requiredText(value.canonicalEmail),
    });
  }

  public async prepareDelivery(input: Parameters<StatusRecoveryStore["prepareDelivery"]>[0]): Promise<StatusRecoveryDeliveryBinding | null> {
    const response = await this.client.rpc("research_status_recovery_prepare_delivery", {
      p_subject_type: input.subjectType,
      p_subject_id: input.subjectId,
      p_owner_id: input.ownerId,
      p_idempotency_key: input.idempotencyKey,
      p_token_digest: input.tokenDigest,
      p_created_at: input.createdAt,
      p_expires_at: input.expiresAt,
      p_source: input.source,
    });
    if (response.error) fail("research_status_recovery_prepare_delivery", response.error);
    if (response.data === null) return null;
    const value = record(response.data);
    if (!value) throw new Error("Status recovery delivery binding is invalid.");
    return Object.freeze({
      tokenRecordId: requiredText(value.tokenRecordId),
      canonicalEmail: requiredText(value.canonicalEmail),
      publicReference: requiredText(value.publicReference),
    });
  }

  public async exchange(input: Parameters<StatusRecoveryStore["exchange"]>[0]): Promise<boolean> {
    const response = await this.client.rpc("research_status_recovery_exchange", {
      p_token_digest: input.tokenDigest,
      p_session_digest: input.sessionDigest,
      p_created_at: input.createdAt,
      p_expires_at: input.expiresAt,
    });
    if (response.error) fail("research_status_recovery_exchange", response.error);
    return response.data === true;
  }

  public async getStatus(sessionDigest: string, now: string) {
    const response = await this.client.rpc("research_status_recovery_status", {
      p_session_digest: sessionDigest,
      p_now: now,
    });
    if (response.error) fail("research_status_recovery_status", response.error);
    if (response.data === null) return null;
    const value = record(response.data);
    if (!value) throw new Error("Status recovery status is invalid.");
    const reference = requiredText(value.publicReference);
    const status = requiredText(value.status);
    const updatedAt = requiredText(value.updatedAt);
    const timeline = Array.isArray(value.timeline) ? value.timeline.map((entry) => {
      const item = record(entry);
      if (!item) throw new Error("Status recovery timeline is invalid.");
      return Object.freeze({
        status: requiredText(item.status),
        occurredAt: requiredText(item.occurredAt),
        customerMessage: optionalText(item.customerMessage),
      });
    }) : [];
    let paymentVerified = false;
    if (["paid", "supplier_processing", "shipped", "delivered"].includes(status) ||
        timeline.some((event) => event.status === "paid")) {
      // Never perform this existence-bearing service-role read until the
      // original P-17 session RPC has authorized and returned this subject.
      // Fulfillment progress must not relabel a verified historical payment.
      const financial = await this.client.rpc("research_assisted_order_financial_state_by_reference", {
        p_public_reference: reference,
      });
      if (financial.error && financial.error.code !== "PGRST202") {
        fail("research_assisted_order_financial_state_by_reference", financial.error);
      }
      if (!financial.error && financial.data !== null) {
        const state = record(financial.data);
        if (!state || typeof state.hasObservation !== "boolean" || typeof state.paymentVerified !== "boolean" ||
            (state.paymentVerified && !state.hasObservation)) {
          throw new Error("Status recovery financial projection is invalid.");
        }
        paymentVerified = state.paymentVerified;
      }
    }
    return buildStatusRecoveryView({
      reference,
      status,
      updatedAt,
      timeline,
      paymentVerified,
    });
  }

  public async revokeSession(sessionDigest: string, revokedAt: string): Promise<void> {
    const response = await this.client.rpc("research_status_recovery_end", {
      p_session_digest: sessionDigest,
      p_revoked_at: revokedAt,
    });
    if (response.error) fail("research_status_recovery_end", response.error);
  }
}
