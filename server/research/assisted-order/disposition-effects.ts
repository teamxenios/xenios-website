import {
  ASSISTED_ORDER_AUDIT_ATTESTATION, ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
  isResolvedAssistedOrderAuditAuthority, type ResolvedAssistedOrderAuditAuthority,
} from "./audit-store";
import { ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE } from "../../../shared/research/assisted-order/financial-disposition";
import type { SupabaseRpcClient } from "./supabase-repository";

export const DISPOSITION_EFFECTS_SCHEMA = "research_assisted_order_disposition_effects_v1";
const PREFIX = "research_assisted_order_disposition_effects_";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const FROM = ["reviewing", "payment_pending", "payment_review"] as const;
const SENDABLE = new Set(["pending", "processing", "sent", "delivered", "failed_retryable", "failed_permanent", "cancelled"]);
const BATCH = 20;
type Cursor = Readonly<{ dispositionId: string; outboxId: string; createdAt: string }>;
type Context = Readonly<{
  dispositionId: string; requestId: string; fromStatus: typeof FROM[number];
  resolvedAt: string; resolvedBy: string; outboxId: string; outboxStatus: string;
  state: "pending" | "complete"; auditReceipt: Record<string, unknown> | null;
}>;

export class AssistedOrderDispositionEffectsError extends Error {
  constructor() {
    super("Financial disposition follow-up is pending.");
    this.name = "AssistedOrderDispositionEffectsError";
  }
}
export type DispositionEffectsRecovery = Readonly<{
  recover(dispositionId: string, expectedRequestId?: string): Promise<void>;
  runBatch(): Promise<Readonly<{ completed: number; failed: number }>>;
}>;
function unavailable(): never { throw new AssistedOrderDispositionEffectsError(); }
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).length === expected.length && expected.every((key) => Object.hasOwn(value, key));
}
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function timestamp(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) &&
    Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
}
function actor(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 512 && value === value.trim() &&
    !/[\u0000-\u001f\u007f]/u.test(value);
}
function context(value: unknown, dispositionId: string): Context {
  if (!object(value) || !keys(value, ["dispositionId", "requestId", "fromStatus", "resolvedAt", "resolvedBy", "outboxId", "outboxStatus", "state", "auditReceipt"]) ||
      value.dispositionId !== dispositionId || !uuid(value.requestId) || !uuid(value.outboxId) ||
      !timestamp(value.resolvedAt) || !actor(value.resolvedBy) || !FROM.some((status) => status === value.fromStatus)) unavailable();
  if (value.state === "pending") {
    if (value.outboxStatus !== "held") unavailable();
  } else if (value.state === "complete") {
    if (typeof value.outboxStatus !== "string" || !SENDABLE.has(value.outboxStatus) || value.auditReceipt === null) unavailable();
  } else unavailable();
  if (value.auditReceipt !== null) {
    const receipt = value.auditReceipt;
    if (!object(receipt) || !keys(receipt, ["state", "eventId", "eventKey", "requestId", "eventType", "eventFingerprint", "schemaVersion", "attestation"]) ||
        (receipt.state !== "inserted" && receipt.state !== "replayed") || receipt.eventId !== dispositionId ||
        receipt.eventKey !== `assisted-order-audit:v1:${dispositionId}` || receipt.requestId !== value.requestId ||
        receipt.eventType !== "assisted_order.status_changed" || receipt.schemaVersion !== ASSISTED_ORDER_AUDIT_SCHEMA_VERSION ||
        receipt.attestation !== ASSISTED_ORDER_AUDIT_ATTESTATION || typeof receipt.eventFingerprint !== "string" ||
        !/^[a-f0-9]{64}$/.test(receipt.eventFingerprint)) unavailable();
  }
  return value as Context;
}

class Recovery implements DispositionEffectsRecovery {
  private cursor: Cursor | null = null;
  private running = false;
  constructor(private readonly rpc: SupabaseRpcClient, private readonly audit: ResolvedAssistedOrderAuditAuthority) {}

  async recover(dispositionId: string, expectedRequestId?: string): Promise<void> {
    if (!uuid(dispositionId) || (expectedRequestId !== undefined && !uuid(expectedRequestId))) unavailable();
    try {
      const response = await this.rpc.rpc(`${PREFIX}context`, { p_disposition_id: dispositionId });
      if (response.error) unavailable();
      const stored = context(response.data, dispositionId);
      if (expectedRequestId !== undefined && stored.requestId !== expectedRequestId) unavailable();
      if (stored.state === "complete") return;
      // The source receipt and grant were checked in the committed transaction.
      // Recovery never repeats them or changes the original actor/time/status.
      const event = stored.auditReceipt ? null : this.audit.prepare({
        eventId: dispositionId, requestId: stored.requestId, eventType: "assisted_order.status_changed",
        actorType: "admin", actorId: stored.resolvedBy, occurredAt: stored.resolvedAt,
        evidence: { from: stored.fromStatus, to: "cancelled", authorityEvidenceKinds: ["cancellation_reason_present"] },
      });
      const result = await this.rpc.rpc(`${PREFIX}complete`, {
        p_disposition_id: dispositionId, p_schema_version: ASSISTED_ORDER_AUDIT_SCHEMA_VERSION,
        p_attestation: ASSISTED_ORDER_AUDIT_ATTESTATION, p_event: event,
      });
      if (result.error) unavailable();
      const completed = context(result.data, dispositionId);
      if (completed.state !== "complete" || completed.requestId !== stored.requestId || completed.fromStatus !== stored.fromStatus ||
          completed.resolvedAt !== stored.resolvedAt || completed.resolvedBy !== stored.resolvedBy || completed.outboxId !== stored.outboxId) unavailable();
      // A concurrent completion can legitimately retain an older HMAC key.
    } catch { unavailable(); }
  }

  async runBatch(): Promise<Readonly<{ completed: number; failed: number }>> {
    if (this.running) return { completed: 0, failed: 0 };
    this.running = true;
    try {
      const response = await this.rpc.rpc(`${PREFIX}pending`, {
        p_after_created_at: this.cursor?.createdAt ?? null, p_after_id: this.cursor?.outboxId ?? null, p_limit: BATCH,
      });
      if (response.error || !Array.isArray(response.data) || response.data.length > BATCH) unavailable();
      const seen = new Set<string>();
      let previous = this.cursor;
      const rows = response.data.map((row: unknown): Cursor => {
        if (!object(row) || !keys(row, ["dispositionId", "outboxId", "createdAt"]) || !uuid(row.dispositionId) ||
            !uuid(row.outboxId) || !timestamp(row.createdAt) || seen.has(row.dispositionId) ||
            (previous && (row.createdAt < previous.createdAt || (row.createdAt === previous.createdAt && row.outboxId <= previous.outboxId)))) unavailable();
        seen.add(row.dispositionId);
        previous = row as Cursor;
        return previous;
      });
      const result = { completed: 0, failed: 0 };
      for (const row of rows) {
        try { await this.recover(row.dispositionId); result.completed += 1; }
        catch { result.failed += 1; }
      }
      this.cursor = rows.length === BATCH ? rows[rows.length - 1] : null;
      return result;
    } catch { unavailable(); }
    finally { this.running = false; }
  }
}

export async function resolveDispositionEffectsRecovery(input: Readonly<{
  enabled: boolean; rpc: SupabaseRpcClient | null; audit: ResolvedAssistedOrderAuditAuthority | null;
}>): Promise<DispositionEffectsRecovery | null> {
  if (!input.enabled || !input.rpc || !isResolvedAssistedOrderAuditAuthority(input.audit)) return null;
  try {
    const { data, error } = await input.rpc.rpc(`${PREFIX}authority`);
    if (error || !object(data) || !keys(data, ["schemaVersion", "intentPolicy", "auditPolicy", "historicalAdoption", "allowedOutcomes", "allowedFinality", "unsupportedKinds"]) ||
        data.schemaVersion !== DISPOSITION_EFFECTS_SCHEMA || data.intentPolicy !== "no_funds_cancel_atomic_canonical_outbox_v1" ||
        data.auditPolicy !== "canonical_audit_before_dispatch_v1" || data.historicalAdoption !== false ||
        JSON.stringify(data.allowedOutcomes) !== '["never_received"]' || JSON.stringify(data.allowedFinality) !== '["terminal"]' ||
        JSON.stringify(data.unsupportedKinds) !== '["void","refund"]') return null;
    return new Recovery(input.rpc, input.audit);
  } catch { return null; }
}

/** Ordinary cancellation is not a financial disposition and needs no new RPC. */
export async function dispositionEffectDispatchAllowed(rpc: SupabaseRpcClient, job: Record<string, unknown>): Promise<boolean> {
  const payload = object(job.payload) ? job.payload : {};
  const reservedCopy = job.template_key === "research.assisted_order.status_changed.customer" &&
    typeof payload.customerMessage === "string" &&
    payload.customerMessage.trim().toLowerCase() === ASSISTED_ORDER_NO_FUNDS_CUSTOMER_MESSAGE.toLowerCase();
  const notice = job.assisted_order_disposition_id != null || reservedCopy ||
    (typeof job.event_key === "string" && job.event_key.includes(":financial-disposition:"));
  if (!notice) return true;
  if (!uuid(job.id) || !uuid(job.assisted_order_disposition_id) || typeof job.event_key !== "string" ||
      typeof job.recipient !== "string" || job.template_key !== "research.assisted_order.status_changed.customer" ||
      payload.status !== "cancelled") return false;
  try {
    const { data, error } = await rpc.rpc(`${PREFIX}outbox_ready`, {
      p_outbox_id: job.id, p_disposition_id: job.assisted_order_disposition_id,
      p_event_key: job.event_key, p_recipient: job.recipient, p_template_key: job.template_key, p_payload: payload,
    });
    return !error && data === true;
  } catch { return false; }
}
