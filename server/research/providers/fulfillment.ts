// xenios research: third-party fulfillment boundary (Mitch owns peptides and Quantum).
//
// The security property this file exists to guarantee is DATA MINIMIZATION.
//
// A fulfillment partner needs to put a box on a truck. It does not need to know that
// the recipient has a health goal, an assessment, a Blueprint, a tracker history, a
// referral relationship, or any other order they have ever placed.
//
// That is enforced structurally rather than by convention: `buildMitchPayload` takes
// a rich internal object and CONSTRUCTS a new payload from a fixed allowlist of
// fields. There is no spread of the source object anywhere in this file, so a field
// added upstream later cannot leak by default. The accompanying test asserts that
// health data present on the input never appears in the output.

import crypto from "crypto";

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";
import { assertNoSyntheticDataInProduction } from "../commerce/production-guards";

export type FulfillmentTransportMode = "manual_export" | "signed_csv" | "sftp" | "api";

/** The rich internal view. Deliberately contains fields Mitch must never receive. */
export interface InternalFulfillmentRequest {
  fulfillmentOrderId: string;
  memberId: string;
  recipientName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  recipientPhone?: string;
  /** True only when the chosen carrier service genuinely requires a phone number. */
  carrierRequiresPhone: boolean;
  shippingService: string;
  handlingProfile: "ambient" | "cold_chain" | "not_confirmed";
  lines: Array<{ sku: string; quantity: number }>;

  // Everything below is internal-only and must never cross the boundary.
  memberHealthGoals?: string[];
  assessmentSummary?: string;
  blueprintReference?: string;
  trackerSummary?: string;
  referralCode?: string;
  previousOrderIds?: string[];
  internalNotes?: string;
}

/** Exactly what leaves xenios. Nothing else may be added without review. */
export interface MitchOutboundPayload {
  fulfillmentOrderId: string;
  recipientName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  recipientPhone?: string;
  shippingService: string;
  handlingProfile: "ambient" | "cold_chain" | "not_confirmed";
  lines: Array<{ sku: string; quantity: number }>;
}

/** The allowlist, exported so a test can assert the payload has no other keys. */
export const MITCH_ALLOWED_PAYLOAD_KEYS = [
  "fulfillmentOrderId",
  "recipientName",
  "shippingAddress",
  "recipientPhone",
  "shippingService",
  "handlingProfile",
  "lines",
] as const;

/**
 * Builds the outbound payload by explicit construction from the allowlist.
 *
 * The phone number is included ONLY when the carrier service requires it, so a
 * phone number is not shipped to a partner merely because xenios happens to hold one.
 */
export function buildMitchPayload(request: InternalFulfillmentRequest): MitchOutboundPayload {
  const payload: MitchOutboundPayload = {
    fulfillmentOrderId: request.fulfillmentOrderId,
    recipientName: request.recipientName,
    shippingAddress: {
      line1: request.shippingAddress.line1,
      city: request.shippingAddress.city,
      state: request.shippingAddress.state,
      postalCode: request.shippingAddress.postalCode,
      country: request.shippingAddress.country,
    },
    shippingService: request.shippingService,
    handlingProfile: request.handlingProfile,
    lines: request.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
  };

  if (request.shippingAddress.line2) {
    payload.shippingAddress.line2 = request.shippingAddress.line2;
  }
  if (request.carrierRequiresPhone && request.recipientPhone) {
    payload.recipientPhone = request.recipientPhone;
  }
  return payload;
}

// ---------------------------------------------------------------------------

export type FulfillmentAcceptance =
  | { accepted: true; partnerReference: string }
  | { accepted: false; holdReason: string };

export interface FulfillmentStatusUpdate {
  fulfillmentOrderId: string;
  status: "accepted" | "rejected" | "on_hold" | "shipped" | "exception" | "delivered";
  holdReason?: string;
  lotId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  estimatedDelivery?: string;
  exceptionDetail?: string;
}

export interface FulfillmentProvider {
  readonly name: string;
  readonly transportMode: FulfillmentTransportMode | "none";

  submit(request: InternalFulfillmentRequest): Promise<ProviderResult<FulfillmentAcceptance>>;
  fetchStatus(fulfillmentOrderId: string): Promise<ProviderResult<FulfillmentStatusUpdate>>;
  verifyInboundWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<FulfillmentStatusUpdate>>;
}

export class DisabledMitchProvider implements FulfillmentProvider {
  readonly name = "disabled";
  readonly transportMode = "none" as const;

  async submit() {
    return providerDisabled<FulfillmentAcceptance>("mitch_fulfillment");
  }
  async fetchStatus() {
    return providerDisabled<FulfillmentStatusUpdate>("mitch_fulfillment");
  }
  async verifyInboundWebhook() {
    return providerDisabled<FulfillmentStatusUpdate>("mitch_fulfillment");
  }
}

export class TestMitchProvider implements FulfillmentProvider {
  readonly name = "test";
  readonly transportMode = "api" as const;

  /** Records exactly what would have been transmitted, for assertion in tests. */
  readonly submitted: MitchOutboundPayload[] = [];
  private counter = 0;

  constructor(options: { allowInProduction?: boolean } = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowInProduction) {
      throw new Error("TestMitchProvider is not available in production");
    }
  }

  async submit(request: InternalFulfillmentRequest): Promise<ProviderResult<FulfillmentAcceptance>> {
    if (request.lines.length === 0) {
      return providerMisconfigured<FulfillmentAcceptance>("A fulfillment order must contain at least one line.");
    }
    if (request.handlingProfile === "not_confirmed") {
      return {
        ok: false,
        code: "REJECTED",
        message: "Handling profile is not confirmed. Refusing to ship without a storage decision.",
        retryable: false,
      };
    }
    const payload = buildMitchPayload(request);
    this.submitted.push(payload);
    return providerOk({ accepted: true as const, partnerReference: `test_ff_${++this.counter}` });
  }

  async fetchStatus(fulfillmentOrderId: string): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    return providerOk({ fulfillmentOrderId, status: "accepted" as const });
  }

  async verifyInboundWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    if (signature !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    try {
      const parsed = JSON.parse(rawBody) as FulfillmentStatusUpdate;
      if (!parsed.fulfillmentOrderId || !parsed.status) {
        return { ok: false, code: "REJECTED", message: "Missing fulfillment order id or status.", retryable: false };
      }
      return providerOk(parsed);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed body.", retryable: false };
    }
  }
}

// ---------------------------------------------------------------------------
// Production adapter seams: transport, dead letter, audit
// ---------------------------------------------------------------------------

export type MitchTransmissionKind = "submit_order" | "cancel_order" | "fetch_status";

export interface MitchTransportRequest {
  kind: MitchTransmissionKind;
  /**
   * Deterministic client transmission id. The partner deduplicates on it, so
   * replaying the SAME transmission can never create a second shipment. That is
   * what makes retrying an ambiguous outcome (network error, garbled ack) safe.
   */
  transmissionId: string;
  /** For submit_order this is ALWAYS the output of buildMitchPayload, never the internal request. */
  payload: unknown;
}

export interface MitchTransportResponse {
  httpStatus: number;
  body: string;
}

/**
 * The injected transport. Production wiring backs it with HTTP against
 * MITCH_ENDPOINT_URL using MITCH_API_KEY. This file never opens a network
 * connection itself, so the adapter is fully testable with a fake transport and
 * nothing can transmit while the capability is disabled.
 */
export interface MitchTransport {
  send(request: MitchTransportRequest): Promise<MitchTransportResponse>;
}

/** What lands in the outage queue. Metadata only, never the shipped payload. */
export interface FulfillmentDeadLetterEntry {
  fulfillmentOrderId: string;
  transmissionId: string;
  kind: MitchTransmissionKind;
  reason: string;
  attempt: number;
  occurredAt: string;
}

/**
 * The dead-letter seam. Production wiring backs it with the admin
 * fulfillment_failure queue so a human sees every order that could not be
 * transmitted after retries were exhausted.
 */
export interface FulfillmentDeadLetterSink {
  record(entry: FulfillmentDeadLetterEntry): Promise<void>;
}

export type FulfillmentAuditEventType =
  | "transmission_attempted"
  | "transmission_acknowledged"
  | "transmission_failed"
  | "resend_requested"
  | "webhook_accepted"
  | "webhook_rejected"
  | "dead_lettered";

/** Structured audit event. Carries identifiers and reasons, never payload contents. */
export interface FulfillmentAuditEvent {
  type: FulfillmentAuditEventType;
  fulfillmentOrderId?: string;
  transmissionId?: string;
  kind?: MitchTransmissionKind;
  attempt?: number;
  detail?: string;
  at: string;
}

export interface FulfillmentAuditRecorder {
  record(event: FulfillmentAuditEvent): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// Retry planning (pure: no timers, callers own scheduling)
// ---------------------------------------------------------------------------

export const MITCH_MAX_TRANSMISSION_ATTEMPTS = 5;
export const MITCH_BACKOFF_BASE_MS = 1_000;
export const MITCH_BACKOFF_CAP_MS = 60_000;

export interface TransmissionRetryPlan {
  retryable: boolean;
  /** Milliseconds to wait before the next attempt, null when not retryable. */
  backoffMs: number | null;
  nextAttempt: number | null;
}

/**
 * Bounded exponential backoff. Attempts are 1-based; once the failure is
 * non-retryable or the attempt budget is spent, the answer is a hard no and the
 * order belongs in the dead-letter queue, not in an endless loop.
 */
export function planTransmissionRetry(attempt: number, failureRetryable: boolean): TransmissionRetryPlan {
  if (!failureRetryable || attempt >= MITCH_MAX_TRANSMISSION_ATTEMPTS) {
    return { retryable: false, backoffMs: null, nextAttempt: null };
  }
  const backoffMs = Math.min(MITCH_BACKOFF_CAP_MS, MITCH_BACKOFF_BASE_MS * 2 ** (attempt - 1));
  return { retryable: true, backoffMs, nextAttempt: attempt + 1 };
}

/** HTTP outcome classification. Timeouts and server faults retry; client faults do not. */
export function classifyMitchHttpStatus(httpStatus: number): { ok: boolean; retryable: boolean } {
  if (httpStatus >= 200 && httpStatus < 300) return { ok: true, retryable: false };
  if (httpStatus === 408 || httpStatus === 425 || httpStatus === 429 || httpStatus >= 500) {
    return { ok: false, retryable: true };
  }
  return { ok: false, retryable: false };
}

// ---------------------------------------------------------------------------
// Status vocabulary mapping
// ---------------------------------------------------------------------------

/**
 * Partner status words mapped into the xenios vocabulary. A status that is not
 * in this table is an explicit error, never a guessed success, because acting on
 * a misread status ships or refunds the wrong thing.
 */
export const MITCH_STATUS_MAP: Readonly<Record<string, FulfillmentStatusUpdate["status"]>> = {
  RECEIVED: "accepted",
  ACCEPTED: "accepted",
  REJECTED: "rejected",
  HOLD: "on_hold",
  ON_HOLD: "on_hold",
  SHIPPED: "shipped",
  EXCEPTION: "exception",
  DELIVERED: "delivered",
};

export function mapMitchStatus(raw: string): FulfillmentStatusUpdate["status"] | null {
  return MITCH_STATUS_MAP[raw.trim().toUpperCase()] ?? null;
}

// ---------------------------------------------------------------------------
// Webhook signing (shared contract between the partner and the verifier)
// ---------------------------------------------------------------------------

export const MITCH_WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Signature format: `t=<unixSeconds>,v1=<hex hmac-sha256 over "<t>.<rawBody>">`.
 * Binding the timestamp into the MAC means an attacker cannot take a validly
 * signed old body and refresh its timestamp.
 */
export function signMitchWebhook(rawBody: string, secret: string, timestampSeconds: number): string {
  const mac = crypto.createHmac("sha256", secret).update(`${timestampSeconds}.${rawBody}`).digest("hex");
  return `t=${timestampSeconds},v1=${mac}`;
}

function macEqual(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------------------------------------------------------------------------
// Transmission ids (deterministic, so a retry cannot double-transmit)
// ---------------------------------------------------------------------------

export function submitTransmissionId(fulfillmentOrderId: string): string {
  return `mitch-submit-${fulfillmentOrderId}`;
}

export function cancelTransmissionId(fulfillmentOrderId: string): string {
  return `mitch-cancel-${fulfillmentOrderId}`;
}

/**
 * A manual admin resend is a deliberate new transmission, so it carries its own
 * id keyed by the admin's resend reference. Retrying the SAME resend reference
 * still cannot double-transmit; a SECOND deliberate resend needs a new reference.
 */
export function resendTransmissionId(fulfillmentOrderId: string, resendReference: string): string {
  return `mitch-resend-${fulfillmentOrderId}-${resendReference}`;
}

// ---------------------------------------------------------------------------
// Environment validation and factory
// ---------------------------------------------------------------------------

/** Credential NAMES only. Values are read at wiring time and never logged. */
export const MITCH_REQUIRED_ENV = ["MITCH_ENDPOINT_URL", "MITCH_API_KEY", "MITCH_WEBHOOK_SECRET"] as const;

export function missingMitchEnvironment(env: NodeJS.ProcessEnv = process.env): string[] {
  return MITCH_REQUIRED_ENV.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
}

export interface MitchProviderOptions {
  transportMode?: FulfillmentTransportMode;
  transport?: MitchTransport;
  webhookSecret?: string;
  deadLetterSink?: FulfillmentDeadLetterSink;
  auditRecorder?: FulfillmentAuditRecorder;
  /** Injected clock (milliseconds) so timestamp tolerance is testable. */
  now?: () => number;
}

/**
 * The production adapter.
 *
 * Everything consequential is injected: the transport (the wiring backs it with
 * HTTP), the dead-letter sink (the admin fulfillment_failure queue), and the
 * audit recorder. Constructed bare it refuses every operation as MISCONFIGURED
 * rather than pretending, so an accidental enablement without wiring fails
 * loudly and safely.
 *
 * Data minimization is inherited structurally: the only thing this class ever
 * hands the transport for an order is the output of `buildMitchPayload`, so the
 * allowlist cannot be widened here by accident.
 */
export class MitchFulfillmentProvider implements FulfillmentProvider {
  readonly name = "mitch";
  readonly transportMode: FulfillmentTransportMode;

  static readonly requiredEnvironmentVariables = MITCH_REQUIRED_ENV;

  private readonly transport?: MitchTransport;
  private readonly webhookSecret?: string;
  private readonly deadLetterSink?: FulfillmentDeadLetterSink;
  private readonly auditRecorder?: FulfillmentAuditRecorder;
  private readonly now: () => number;
  /**
   * Event id -> when it was seen (ms). A stale timestamp is already rejected
   * beyond the tolerance window, so entries older than twice the window are
   * pruned on every insert; the map stays bounded on a long-lived process.
   */
  private readonly seenWebhookEventIds = new Map<string, number>();

  constructor(options: MitchProviderOptions = {}) {
    this.transportMode = options.transportMode ?? "manual_export";
    this.transport = options.transport;
    this.webhookSecret = options.webhookSecret;
    this.deadLetterSink = options.deadLetterSink;
    this.auditRecorder = options.auditRecorder;
    this.now = options.now ?? Date.now;
  }

  // Audit is best-effort observation. A broken recorder must not change the
  // outcome of a shipment, so failures are swallowed here by design.
  private async audit(event: Omit<FulfillmentAuditEvent, "at">): Promise<void> {
    if (!this.auditRecorder) return;
    try {
      await this.auditRecorder.record({ ...event, at: new Date(this.now()).toISOString() });
    } catch {
      // Deliberately ignored.
    }
  }

  private async deadLetter(entry: Omit<FulfillmentDeadLetterEntry, "occurredAt">): Promise<void> {
    await this.audit({
      type: "dead_lettered",
      fulfillmentOrderId: entry.fulfillmentOrderId,
      transmissionId: entry.transmissionId,
      kind: entry.kind,
      attempt: entry.attempt,
      detail: entry.reason,
    });
    if (!this.deadLetterSink) return;
    try {
      await this.deadLetterSink.record({ ...entry, occurredAt: new Date(this.now()).toISOString() });
    } catch {
      // The sink is itself the failure path; a sink failure must not throw into
      // the caller. The audit event above is the remaining trace.
    }
  }

  /**
   * One transmission attempt. Pure with respect to time: it never sleeps or
   * loops. The returned `retryable` already accounts for the attempt budget via
   * `planTransmissionRetry`, and a spent budget dead-letters the order.
   */
  private async transmit<T>(
    kind: MitchTransmissionKind,
    fulfillmentOrderId: string,
    transmissionId: string,
    payload: unknown,
    attempt: number,
    parseAcknowledgment: (body: string) => { ok: true; value: T } | { ok: false; message: string },
  ): Promise<ProviderResult<T>> {
    if (!this.transport) {
      return providerMisconfigured<T>("The Mitch transport is not configured. Fulfillment transmission is unavailable.");
    }

    await this.audit({ type: "transmission_attempted", fulfillmentOrderId, transmissionId, kind, attempt });

    let response: MitchTransportResponse;
    try {
      response = await this.transport.send({ kind, transmissionId, payload });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return this.transmissionFailure<T>(kind, fulfillmentOrderId, transmissionId, attempt, {
        message: `Transport error: ${message}`,
        retryable: true,
      });
    }

    const outcome = classifyMitchHttpStatus(response.httpStatus);
    if (!outcome.ok) {
      return this.transmissionFailure<T>(kind, fulfillmentOrderId, transmissionId, attempt, {
        message: `Partner returned HTTP ${response.httpStatus}.`,
        retryable: outcome.retryable,
      });
    }

    const acknowledgment = parseAcknowledgment(response.body);
    if (!acknowledgment.ok) {
      // A garbled acknowledgment is ambiguous: the order may or may not have
      // landed. Retrying is safe ONLY because the transmission id deduplicates,
      // which is why this is retryable rather than a fake success.
      return this.transmissionFailure<T>(kind, fulfillmentOrderId, transmissionId, attempt, {
        message: acknowledgment.message,
        retryable: true,
      });
    }

    await this.audit({ type: "transmission_acknowledged", fulfillmentOrderId, transmissionId, kind, attempt });
    return providerOk(acknowledgment.value);
  }

  private async transmissionFailure<T>(
    kind: MitchTransmissionKind,
    fulfillmentOrderId: string,
    transmissionId: string,
    attempt: number,
    failure: { message: string; retryable: boolean },
  ): Promise<ProviderResult<T>> {
    const plan = planTransmissionRetry(attempt, failure.retryable);
    await this.audit({
      type: "transmission_failed",
      fulfillmentOrderId,
      transmissionId,
      kind,
      attempt,
      detail: failure.message,
    });
    if (!plan.retryable) {
      await this.deadLetter({ fulfillmentOrderId, transmissionId, kind, reason: failure.message, attempt });
    }
    return {
      ok: false,
      code: plan.retryable ? "RETRYABLE" : failure.retryable ? "PERMANENT_FAILURE" : "REJECTED",
      message: failure.message,
      retryable: plan.retryable,
    };
  }

  async submit(
    request: InternalFulfillmentRequest,
    options: { attempt?: number } = {},
  ): Promise<ProviderResult<FulfillmentAcceptance>> {
    const guarded = this.guardRequest(request);
    if (guarded) return guarded;
    return this.transmit(
      "submit_order",
      request.fulfillmentOrderId,
      submitTransmissionId(request.fulfillmentOrderId),
      buildMitchPayload(request),
      options.attempt ?? 1,
      parseSubmitAcknowledgment,
    );
  }

  /**
   * Manual admin resend. Same guards, same minimized payload, but a fresh
   * transmission id keyed by the admin's resend reference so the partner treats
   * it as a deliberate new transmission rather than deduplicating it away.
   */
  async resend(
    request: InternalFulfillmentRequest,
    resendReference: string,
    options: { attempt?: number } = {},
  ): Promise<ProviderResult<FulfillmentAcceptance>> {
    if (!resendReference.trim()) {
      return providerMisconfigured<FulfillmentAcceptance>("A resend requires a resend reference.");
    }
    const guarded = this.guardRequest(request);
    if (guarded) return guarded;
    await this.audit({
      type: "resend_requested",
      fulfillmentOrderId: request.fulfillmentOrderId,
      transmissionId: resendTransmissionId(request.fulfillmentOrderId, resendReference),
      kind: "submit_order",
      detail: `resendReference=${resendReference}`,
    });
    return this.transmit(
      "submit_order",
      request.fulfillmentOrderId,
      resendTransmissionId(request.fulfillmentOrderId, resendReference),
      buildMitchPayload(request),
      options.attempt ?? 1,
      parseSubmitAcknowledgment,
    );
  }

  /** Cancellation transmission. The payload is the order id and nothing else. */
  async cancel(
    fulfillmentOrderId: string,
    options: { attempt?: number } = {},
  ): Promise<ProviderResult<{ cancelled: true }>> {
    return this.transmit(
      "cancel_order",
      fulfillmentOrderId,
      cancelTransmissionId(fulfillmentOrderId),
      { fulfillmentOrderId },
      options.attempt ?? 1,
      parseCancelAcknowledgment,
    );
  }

  async fetchStatus(fulfillmentOrderId: string): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    return this.transmit(
      "fetch_status",
      fulfillmentOrderId,
      // Status reads are idempotent by nature; the id still identifies the
      // request in the partner's logs and ours.
      `mitch-status-${fulfillmentOrderId}`,
      { fulfillmentOrderId },
      1,
      (body) => parseStatusBody(body, fulfillmentOrderId),
    );
  }

  async verifyInboundWebhook(
    rawBody: string,
    signature: string | undefined,
  ): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    if (!this.webhookSecret) {
      return providerMisconfigured<FulfillmentStatusUpdate>(
        "MITCH_WEBHOOK_SECRET is not configured. Refusing to accept an unverifiable webhook.",
      );
    }
    const rejected = async (detail: string): Promise<ProviderResult<FulfillmentStatusUpdate>> => {
      await this.audit({ type: "webhook_rejected", detail });
      return { ok: false, code: "REJECTED", message: detail, retryable: false };
    };

    if (!signature) return rejected("Missing signature.");

    const match = /^t=(\d+),v1=([0-9a-f]+)$/.exec(signature.trim());
    if (!match) return rejected("Malformed signature header.");
    const timestampSeconds = Number(match[1]);
    const presentedMac = match[2];

    // Tolerance is absolute in both directions: a stale signature is a replay
    // risk and a far-future one means a broken or hostile clock.
    const skewSeconds = Math.abs(Math.floor(this.now() / 1000) - timestampSeconds);
    if (skewSeconds > MITCH_WEBHOOK_TOLERANCE_SECONDS) {
      return rejected("Signature timestamp outside tolerance.");
    }

    const expectedMac = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(`${timestampSeconds}.${rawBody}`)
      .digest("hex");
    if (!macEqual(presentedMac, expectedMac)) return rejected("Invalid signature.");

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return rejected("Malformed webhook body.");
    }
    const eventId = typeof parsed.eventId === "string" ? parsed.eventId : "";
    const fulfillmentOrderId = typeof parsed.fulfillmentOrderId === "string" ? parsed.fulfillmentOrderId : "";
    const rawStatus = typeof parsed.status === "string" ? parsed.status : "";
    if (!eventId || !fulfillmentOrderId || !rawStatus) {
      return rejected("Webhook missing eventId, fulfillment order id, or status.");
    }

    // Replay protection within the tolerance window. Durable replay protection
    // belongs to the persistence layer via a unique constraint on the event id;
    // this set stops a same-process replay without waiting for that write.
    if (this.seenWebhookEventIds.has(eventId)) return rejected("Duplicate webhook event.");

    const status = mapMitchStatus(rawStatus);
    if (status === null) {
      return rejected(`Unknown fulfillment status "${rawStatus}". Refusing to guess.`);
    }

    const nowMs = this.now();
    const horizonMs = nowMs - MITCH_WEBHOOK_TOLERANCE_SECONDS * 2 * 1000;
    this.seenWebhookEventIds.forEach((seenAtMs, seenId) => {
      if (seenAtMs < horizonMs) this.seenWebhookEventIds.delete(seenId);
    });
    this.seenWebhookEventIds.set(eventId, nowMs);
    const update = buildStatusUpdate(parsed, fulfillmentOrderId, status);
    await this.audit({
      type: "webhook_accepted",
      fulfillmentOrderId,
      detail: `eventId=${eventId} status=${status}`,
    });
    return providerOk(update);
  }

  private guardRequest(request: InternalFulfillmentRequest): ProviderResult<FulfillmentAcceptance> | null {
    if (request.lines.length === 0) {
      return providerMisconfigured<FulfillmentAcceptance>("A fulfillment order must contain at least one line.");
    }
    if (request.handlingProfile === "not_confirmed") {
      return {
        ok: false,
        code: "REJECTED",
        message: "Handling profile is not confirmed. Refusing to ship without a storage decision.",
        retryable: false,
      };
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Acknowledgment and status parsing (explicit shapes, no guessed successes)
// ---------------------------------------------------------------------------

function parseSubmitAcknowledgment(
  body: string,
): { ok: true; value: FulfillmentAcceptance } | { ok: false; message: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Malformed acknowledgment body." };
  }
  if (parsed.accepted === true && typeof parsed.partnerReference === "string" && parsed.partnerReference) {
    return { ok: true, value: { accepted: true, partnerReference: parsed.partnerReference } };
  }
  if (parsed.accepted === false && typeof parsed.holdReason === "string" && parsed.holdReason) {
    return { ok: true, value: { accepted: false, holdReason: parsed.holdReason } };
  }
  return { ok: false, message: "Unrecognized acknowledgment shape." };
}

function parseCancelAcknowledgment(
  body: string,
): { ok: true; value: { cancelled: true } } | { ok: false; message: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Malformed cancellation acknowledgment body." };
  }
  if (parsed.cancelled === true) return { ok: true, value: { cancelled: true } };
  return { ok: false, message: "Cancellation was not acknowledged." };
}

function parseStatusBody(
  body: string,
  expectedFulfillmentOrderId: string,
): { ok: true; value: FulfillmentStatusUpdate } | { ok: false; message: string } {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return { ok: false, message: "Malformed status body." };
  }
  const fulfillmentOrderId = typeof parsed.fulfillmentOrderId === "string" ? parsed.fulfillmentOrderId : "";
  const rawStatus = typeof parsed.status === "string" ? parsed.status : "";
  if (!fulfillmentOrderId || !rawStatus) {
    return { ok: false, message: "Status body missing fulfillment order id or status." };
  }
  if (fulfillmentOrderId !== expectedFulfillmentOrderId) {
    return { ok: false, message: "Status body is for a different fulfillment order." };
  }
  const status = mapMitchStatus(rawStatus);
  if (status === null) {
    return { ok: false, message: `Unknown fulfillment status "${rawStatus}". Refusing to guess.` };
  }
  return { ok: true, value: buildStatusUpdate(parsed, fulfillmentOrderId, status) };
}

/**
 * Explicit field-by-field construction, mirroring the outbound allowlist
 * discipline: an unexpected inbound field never rides into our records.
 */
function buildStatusUpdate(
  parsed: Record<string, unknown>,
  fulfillmentOrderId: string,
  status: FulfillmentStatusUpdate["status"],
): FulfillmentStatusUpdate {
  const update: FulfillmentStatusUpdate = { fulfillmentOrderId, status };
  if (typeof parsed.holdReason === "string" && parsed.holdReason) update.holdReason = parsed.holdReason;
  if (typeof parsed.lotId === "string" && parsed.lotId) update.lotId = parsed.lotId;
  if (typeof parsed.trackingNumber === "string" && parsed.trackingNumber) {
    update.trackingNumber = parsed.trackingNumber;
  }
  if (typeof parsed.carrier === "string" && parsed.carrier) update.carrier = parsed.carrier;
  if (typeof parsed.shippedAt === "string" && parsed.shippedAt) update.shippedAt = parsed.shippedAt;
  if (typeof parsed.estimatedDelivery === "string" && parsed.estimatedDelivery) {
    update.estimatedDelivery = parsed.estimatedDelivery;
  }
  if (typeof parsed.exceptionDetail === "string" && parsed.exceptionDetail) {
    update.exceptionDetail = parsed.exceptionDetail;
  }
  return update;
}

// ---------------------------------------------------------------------------
// Factory and resolution
// ---------------------------------------------------------------------------

export interface MitchFactoryDependencies {
  transport?: MitchTransport;
  deadLetterSink?: FulfillmentDeadLetterSink;
  auditRecorder?: FulfillmentAuditRecorder;
  now?: () => number;
}

/**
 * Builds the real adapter ONLY when every required credential name is present.
 * Anything missing means DisabledMitchProvider, a structured refusal rather
 * than a half-configured adapter. Values are read here and injected; they are
 * never logged and never appear in any returned structure.
 */
export function createMitchFulfillmentProvider(
  env: NodeJS.ProcessEnv = process.env,
  deps: MitchFactoryDependencies = {},
): FulfillmentProvider {
  if (missingMitchEnvironment(env).length > 0) return new DisabledMitchProvider();
  // The synthetic-data guard: the Mitch sandbox profile (MITCH_TEST_ keys,
  // example.invalid endpoints) must never construct the live adapter while the
  // process is production-like. Throws loudly BEFORE the adapter (and any
  // transmission) exists.
  assertNoSyntheticDataInProduction(
    {
      mitchConfig: {
        endpointUrl: env.MITCH_ENDPOINT_URL,
        apiKey: env.MITCH_API_KEY,
        webhookSecret: env.MITCH_WEBHOOK_SECRET,
      },
    },
    env,
  );
  const mode = (env.MITCH_TRANSPORT_MODE as FulfillmentTransportMode | undefined) ?? "api";
  return new MitchFulfillmentProvider({
    transportMode: mode,
    transport: deps.transport,
    webhookSecret: env.MITCH_WEBHOOK_SECRET,
    deadLetterSink: deps.deadLetterSink,
    auditRecorder: deps.auditRecorder,
    now: deps.now,
  });
}

export function resolveFulfillmentProvider(
  env: NodeJS.ProcessEnv = process.env,
  deps: MitchFactoryDependencies = {},
): FulfillmentProvider {
  if (env.RESEARCH_MITCH_FULFILLMENT_ENABLED !== "true") return new DisabledMitchProvider();
  const selected = env.MITCH_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledMitchProvider();
    return new TestMitchProvider();
  }
  if (selected === "mitch") return createMitchFulfillmentProvider(env, deps);
  return new DisabledMitchProvider();
}
