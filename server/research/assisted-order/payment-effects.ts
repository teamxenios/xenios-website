import {
  ASSISTED_ORDER_AUDIT_ATTESTATION,
  ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  isResolvedAssistedOrderAuditAuthority,
  type ResolvedAssistedOrderAuditAuthority,
} from "./audit-store";
import { AssistedOrderVerificationEffectsError } from "./service";
import type { SupabaseRpcClient } from "./supabase-repository";
import { isAssistedOrderStatus } from "../../../shared/research/assisted-order/contract";

export const PAYMENT_EFFECTS_SCHEMA = "research_assisted_order_payment_effects_v1";
const PREFIX = "research_assisted_order_payment_effects_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SENDABLE = new Set(["pending", "processing", "sent", "delivered", "failed_retryable", "failed_permanent", "cancelled"]);
const BATCH = 20;

type Cursor = Readonly<{ verificationId: string; outboxId: string; createdAt: string }>;
type Context = Readonly<{
  verificationId: string; requestId: string; verifiedAt: string; verifiedBy: string;
  outboxId: string; outboxStatus: string; state: "pending" | "complete";
  auditReceipt: Record<string, unknown> | null;
}>;

export type PaymentEffectsRecovery = Readonly<{
  recover(verificationId: string, expectedRequestId?: string): Promise<void>;
  runBatch(): Promise<Readonly<{ completed: number; failed: number }>>;
}>;

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function actorLabel(value: unknown): value is string {
  // verified_by is the immutable grant's actor_label, not its Auth UUID.
  // Match the canonical audit adapter; only its HMAC alias is persisted there.
  return typeof value === "string" && value.length > 0 && value.length <= 512 &&
    value === value.trim() && !/[\u0000-\u001f\u007f]/u.test(value);
}
function timestamp(value: unknown): value is string {
  return typeof value === "string" && ISO.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function unavailable(): never { throw new AssistedOrderVerificationEffectsError(); }

function context(value: unknown, verificationId: string): Context {
  if (!object(value) || !keys(value, ["verificationId", "requestId", "verifiedAt", "verifiedBy", "outboxId", "outboxStatus", "state", "auditReceipt"]) ||
      value.verificationId !== verificationId || !uuid(value.requestId) || !actorLabel(value.verifiedBy) || !uuid(value.outboxId) || !timestamp(value.verifiedAt)) unavailable();
  if (value.state === "pending") {
    if (value.outboxStatus !== "held") unavailable();
  } else if (value.state === "complete") {
    if (typeof value.outboxStatus !== "string" || !SENDABLE.has(value.outboxStatus) || value.auditReceipt === null) unavailable();
  } else unavailable();
  if (value.auditReceipt !== null) {
    const receipt = value.auditReceipt;
    if (!object(receipt) ||
        !keys(receipt, ["state", "eventId", "eventKey", "requestId", "eventType", "eventFingerprint", "schemaVersion", "attestation"]) ||
        (receipt.state !== "inserted" && receipt.state !== "replayed") || receipt.eventId !== verificationId ||
        receipt.eventKey !== `assisted-order-audit:v1:${verificationId}` || receipt.requestId !== value.requestId ||
        receipt.eventType !== "assisted_order.status_changed" || receipt.schemaVersion !== ASSISTED_ORDER_AUDIT_SCHEMA_VERSION ||
        receipt.attestation !== ASSISTED_ORDER_AUDIT_ATTESTATION || typeof receipt.eventFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(receipt.eventFingerprint)) unavailable();
  }
  return value as Context;
}

class Recovery implements PaymentEffectsRecovery {
  private cursor: Cursor | null = null;
  private running = false;
  constructor(private readonly rpc: SupabaseRpcClient, private readonly audit: ResolvedAssistedOrderAuditAuthority) {}

  async recover(verificationId: string, expectedRequestId?: string): Promise<void> {
    if (!uuid(verificationId) || (expectedRequestId !== undefined && !uuid(expectedRequestId))) unavailable();
    try {
      const response = await this.rpc.rpc(`${PREFIX}context`, { p_verification_id: verificationId });
      if (response.error) unavailable();
      const stored = context(response.data, verificationId);
      if (expectedRequestId !== undefined && stored.requestId !== expectedRequestId) unavailable();
      // Read the stored receipt before touching the current HMAC key. Completed
      // effects survive both an actor-grant revocation and audit-key rotation.
      if (stored.state === "complete") return;
      const event = stored.auditReceipt ? null : this.audit.prepare({
        eventId: verificationId, requestId: stored.requestId,
        eventType: "assisted_order.status_changed", actorType: "admin", actorId: stored.verifiedBy,
        evidence: { from: "payment_review", to: "paid", authorityEvidenceKinds: ["payment_verification"] },
        occurredAt: stored.verifiedAt,
      });
      const result = await this.rpc.rpc(`${PREFIX}complete`, {
        p_verification_id: verificationId,
        p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
        p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION,
        p_event: event,
      });
      if (result.error) unavailable();
      const completed = context(result.data, verificationId);
      if (completed.state !== "complete" || completed.requestId !== stored.requestId ||
          completed.verifiedBy !== stored.verifiedBy || completed.verifiedAt !== stored.verifiedAt ||
          completed.outboxId !== stored.outboxId) unavailable();
      // A concurrently completed, correctly bound receipt may use the previous
      // key, so equality with this newly prepared fingerprint is not required.
    } catch { unavailable(); }
  }

  async runBatch(): Promise<Readonly<{ completed: number; failed: number }>> {
    if (this.running) return { completed: 0, failed: 0 };
    this.running = true;
    try {
      const response = await this.rpc.rpc(`${PREFIX}pending`, {
        p_after_created_at: this.cursor?.createdAt ?? null,
        p_after_id: this.cursor?.outboxId ?? null, p_limit: BATCH,
      });
      if (response.error || !Array.isArray(response.data) || response.data.length > BATCH) unavailable();
      const seen = new Set<string>();
      let previous = this.cursor;
      // Validate the whole bounded envelope before completing any item.
      const rows = response.data.map((row: unknown): Cursor => {
        if (!object(row) || !keys(row, ["verificationId", "outboxId", "createdAt"]) ||
            !uuid(row.verificationId) || !uuid(row.outboxId) || !timestamp(row.createdAt) ||
            seen.has(row.verificationId) || (previous && (row.createdAt < previous.createdAt ||
              (row.createdAt === previous.createdAt && row.outboxId <= previous.outboxId)))) unavailable();
        seen.add(row.verificationId);
        previous = row as Cursor;
        return previous;
      });
      const result = { completed: 0, failed: 0 };
      for (const row of rows) {
        try { await this.recover(row.verificationId); result.completed += 1; }
        catch { result.failed += 1; } // The held row is the durable retry obligation.
      }
      // Move past poison rows so they cannot starve later obligations. Wrap
      // after reaching the end and retry failures on the next bounded sweep.
      this.cursor = rows.length === BATCH ? rows[rows.length - 1] : null;
      return result;
    } catch { unavailable(); }
    finally { this.running = false; }
  }
}

/** No flags or callback logger can stand in for the two probed authorities. */
export async function resolvePaymentEffectsRecovery(input: Readonly<{
  enabled: boolean; rpc: SupabaseRpcClient | null; audit: ResolvedAssistedOrderAuditAuthority | null;
}>): Promise<PaymentEffectsRecovery | null> {
  if (!input.enabled || !input.rpc || !isResolvedAssistedOrderAuditAuthority(input.audit)) return null;
  try {
    const { data, error } = await input.rpc.rpc(`${PREFIX}authority`);
    if (error || !object(data) || !keys(data, ["schemaVersion", "intentPolicy", "auditPolicy", "historicalAdoption"]) ||
        data.schemaVersion !== PAYMENT_EFFECTS_SCHEMA || data.intentPolicy !== "verification_atomic_canonical_outbox_v1" ||
        data.auditPolicy !== "canonical_audit_before_dispatch_v1" || data.historicalAdoption !== false) return null;
    return new Recovery(input.rpc, input.audit);
  } catch { return null; }
}

/** Called immediately before delivery, including legacy/forged paid notices. */
export async function paymentEffectDispatchAllowed(rpc: SupabaseRpcClient, job: Record<string, unknown>): Promise<boolean> {
  const payload = object(job.payload) ? job.payload : {};
  // The renderer trims text. Reject noncanonical values before that boundary,
  // so padded/case/invalid statuses cannot evade the financial notice guard.
  if (job.template_key === "research.assisted_order.status_changed.customer" && !isAssistedOrderStatus(payload.status)) return false;
  const paymentNotice = job.assisted_order_verification_id != null ||
    (typeof job.event_key === "string" && job.event_key.includes(":payment-verification:")) ||
    (job.template_key === "research.assisted_order.status_changed.customer" && payload.status === "paid");
  if (!paymentNotice) return true;
  if (!uuid(job.id) || !uuid(job.assisted_order_verification_id) || typeof job.event_key !== "string" ||
      typeof job.recipient !== "string" || typeof job.template_key !== "string") return false;
  try {
    const { data, error } = await rpc.rpc(`${PREFIX}outbox_ready`, {
      p_outbox_id: job.id, p_verification_id: job.assisted_order_verification_id,
      p_event_key: job.event_key, p_recipient: job.recipient,
      p_template_key: job.template_key, p_payload: payload,
    });
    return !error && data === true;
  } catch { return false; }
}
