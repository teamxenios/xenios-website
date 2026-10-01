import { createHash } from "node:crypto";
import type { ProviderResult } from "../../../../shared/research/capability";

/**
 * Transport contracts only. The existing SQL quote, verification and order
 * authorities remain authoritative. This module is not mounted, selects no
 * provider and enables no payment method. It never writes paid by itself.
 */
export type AssistedProviderScope = Readonly<{
  provider: string;
  accountId: string;
  mode: "test" | "live";
}>;

/** Loaded from a server-created durable attempt, never from a browser body. */
export type AssistedProviderAttempt = AssistedProviderScope & Readonly<{
  attemptId: string;
  requestId: string;
  canonicalOrderId: string | null;
  quoteId: string;
  quoteVersion: number;
  acceptanceId: string;
  expectedAmountCents: number;
  currency: string;
  creationKey: string;
  /** Set durably before the first network call, including an interrupted one. */
  creationStartedAt: string;
  /** Explicit adapter guarantee, not a processor-specific default duration. */
  creationReplayUntil: string;
  providerPaymentId: string | null;
  providerSessionId: string | null;
}>;

export type AssistedProviderSession = Readonly<{
  providerPaymentId: string;
  providerSessionId: string | null;
  /** Creation/authorization is never settlement evidence. */
  state: "pending" | "authorized";
}>;

export type AssistedProviderEventKind =
  | "pending" | "authorized" | "captured" | "failed" | "cancelled"
  | "refunded" | "dispute_opened" | "dispute_won" | "dispute_lost";

/** Returned only AFTER the adapter authenticates the original event bytes. */
export type AuthenticatedAssistedProviderEvent = AssistedProviderScope & Readonly<{
  eventId: string;
  providerPaymentId: string;
  providerSessionId: string | null;
  attemptId: string;
  requestId: string;
  canonicalOrderId: string | null;
  quoteId: string;
  quoteVersion: number;
  acceptanceId: string;
  kind: AssistedProviderEventKind;
  observedAmountCents: number;
  currency: string;
  occurredAt: string;
  /** Refund/dispute object identity, not the original payment identity. */
  adjustmentId: string | null;
}>;

export type AssistedProviderEnvelope = Readonly<{
  rawBody: Uint8Array;
  headers: Readonly<Record<string, string | undefined>>;
}>;

/**
 * Implementations may wrap the canonical PaymentProvider transport. No card
 * token pattern, SDK, provider name or idempotency retention is assumed here.
 * Adapter authentication must check signature, timestamp, account and mode;
 * a string event id or a caller-supplied `verified: true` is not authentication.
 * Provider-specific client secrets remain transient, outside these records.
 */
export interface AssistedOrderProviderAdapter {
  readonly scope: AssistedProviderScope;
  createAttempt(attempt: AssistedProviderAttempt): Promise<ProviderResult<AssistedProviderSession>>;
  retrieveAttempt(attempt: AssistedProviderAttempt): Promise<ProviderResult<AssistedProviderSession>>;
  authenticateEvent(envelope: AssistedProviderEnvelope): Promise<ProviderResult<AuthenticatedAssistedProviderEvent>>;
  /** A request is not proof that a refund/cancellation completed. */
  requestRefund(input: Readonly<{
    attempt: AssistedProviderAttempt;
    refundExecutionId: string;
    amountCents: number;
    idempotencyKey: string;
  }>): Promise<ProviderResult<Readonly<{ state: "pending" }>>>;
  requestCancellation(input: Readonly<{
    attempt: AssistedProviderAttempt;
    cancellationExecutionId: string;
    idempotencyKey: string;
  }>): Promise<ProviderResult<Readonly<{ state: "pending" }>>>;
}

export type BoundAssistedProviderEvent = AuthenticatedAssistedProviderEvent & Readonly<{
  expectedAmountCents: number;
  eventKey: string;
  paymentEvidenceKey: string;
  payloadFingerprint: string;
}>;

/**
 * Production must implement this through ONE database transaction: lock/reload
 * attempt + accepted quote, compare all bindings, reserve eventKey and bind
 * payment evidence globally to one request (later lifecycle events may use that
 * same binding), then append the applicable observation/audit/outbox effects.
 * Only captured evidence can qualify for the governed paid transition;
 * authorization, pending and failed facts must never create verification.
 * Same event + same fingerprint replays; changed payload refuses. A failed or
 * interrupted transaction must reserve neither event nor evidence. Refunds
 * additionally lock settlement and cap aggregate refunds; disputes freeze
 * fulfillment without deleting the original verification. No memory default.
 */
export interface AssistedProviderEventAuthority {
  commit(event: BoundAssistedProviderEvent): Promise<Readonly<{ replayed: boolean }>>;
}

export type AssistedProviderBoundaryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; code: "unavailable" | "invalid_attempt" | "creation_uncertain" | "unauthenticated" | "binding_mismatch" | "invalid_event" | "persistence_unavailable" }>;

const fail = (code: Extract<AssistedProviderBoundaryResult<never>, { ok: false }>["code"]) =>
  Object.freeze({ ok: false as const, code });
const identifier = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 255 && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
const cents = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0 && (value as number) <= 100_000_000;
const optionalId = (value: unknown): boolean => value === null || identifier(value);
const instant = (value: unknown): value is string => typeof value === "string" && Number.isFinite(Date.parse(value));
const fingerprint = (parts: readonly unknown[]): string => createHash("sha256").update(JSON.stringify(parts)).digest("hex");

function sameScope(left: AssistedProviderScope, right: AssistedProviderScope): boolean {
  return left.provider === right.provider && left.accountId === right.accountId && left.mode === right.mode;
}

function validAttempt(attempt: AssistedProviderAttempt): boolean {
  return !!attempt && identifier(attempt.provider) && identifier(attempt.accountId) &&
    (attempt.mode === "test" || attempt.mode === "live") &&
    [attempt.attemptId, attempt.requestId, attempt.quoteId, attempt.acceptanceId, attempt.creationKey].every(identifier) &&
    optionalId(attempt.canonicalOrderId) && optionalId(attempt.providerPaymentId) && optionalId(attempt.providerSessionId) &&
    (attempt.providerSessionId === null || attempt.providerPaymentId !== null) &&
    Number.isSafeInteger(attempt.quoteVersion) && attempt.quoteVersion > 0 && cents(attempt.expectedAmountCents) &&
    /^[A-Z]{3}$/.test(attempt.currency) && instant(attempt.creationStartedAt) && instant(attempt.creationReplayUntil) &&
    Date.parse(attempt.creationReplayUntil) > Date.parse(attempt.creationStartedAt);
}

/**
 * Caller reserves the attempt and its stable key before calling. Persist the
 * returned identity before enabling customer continuation. A lost create
 * response is recovered only inside the adapter's explicit key guarantee;
 * an already-bound attempt is retrieved, never recreated.
 */
export async function prepareAssistedProviderAttempt(
  adapter: AssistedOrderProviderAdapter | null,
  attempt: AssistedProviderAttempt,
  now: Date,
): Promise<AssistedProviderBoundaryResult<AssistedProviderSession>> {
  if (!adapter) return fail("unavailable");
  if (!validAttempt(attempt) || !sameScope(adapter.scope, attempt) || !Number.isFinite(now.getTime())) return fail("invalid_attempt");
  if (attempt.providerPaymentId === null && (now.getTime() < Date.parse(attempt.creationStartedAt) || now.getTime() >= Date.parse(attempt.creationReplayUntil))) {
    return fail("creation_uncertain");
  }
  try {
    const response = attempt.providerPaymentId === null
      ? await adapter.createAttempt(Object.freeze({ ...attempt }))
      : await adapter.retrieveAttempt(Object.freeze({ ...attempt }));
    if (!response.ok) return fail(attempt.providerPaymentId === null ? "creation_uncertain" : "unavailable");
    const value = response.value;
    if (!value || !identifier(value.providerPaymentId) || !optionalId(value.providerSessionId) ||
        !["pending", "authorized"].includes(value.state) ||
        (attempt.providerPaymentId !== null && value.providerPaymentId !== attempt.providerPaymentId) ||
        (attempt.providerSessionId !== null && value.providerSessionId !== attempt.providerSessionId)) return fail("binding_mismatch");
    return { ok: true, value: Object.freeze({ providerPaymentId: value.providerPaymentId, providerSessionId: value.providerSessionId, state: value.state }) };
  } catch {
    // A timeout may have created a payment. Never classify it as no money/effect.
    return fail("creation_uncertain");
  }
}

/** Only authenticated, exact-bound, allowlisted facts reach durable authority. */
export async function receiveAssistedProviderEvent(
  adapter: AssistedOrderProviderAdapter | null,
  attempt: AssistedProviderAttempt,
  envelope: AssistedProviderEnvelope,
  authority: AssistedProviderEventAuthority | null,
): Promise<AssistedProviderBoundaryResult<Readonly<{ replayed: boolean }>>> {
  if (!adapter || !authority) return fail("unavailable");
  if (!validAttempt(attempt) || !sameScope(adapter.scope, attempt) || attempt.providerPaymentId === null) return fail("invalid_attempt");
  let event: AuthenticatedAssistedProviderEvent;
  try {
    const authenticated = await adapter.authenticateEvent(envelope);
    if (!authenticated.ok) return fail("unauthenticated");
    event = authenticated.value;
  } catch {
    return fail("unauthenticated");
  }
  if (!event || !sameScope(event, attempt) || event.providerPaymentId !== attempt.providerPaymentId ||
      event.providerSessionId !== attempt.providerSessionId || event.attemptId !== attempt.attemptId ||
      event.requestId !== attempt.requestId || event.canonicalOrderId !== attempt.canonicalOrderId ||
      event.quoteId !== attempt.quoteId || event.quoteVersion !== attempt.quoteVersion ||
      event.acceptanceId !== attempt.acceptanceId || event.currency !== attempt.currency) return fail("binding_mismatch");
  if (!identifier(event.eventId) || !instant(event.occurredAt) || !Number.isSafeInteger(event.observedAmountCents)) return fail("invalid_event");
  switch (event.kind) {
    case "captured": case "authorized":
      if (event.observedAmountCents !== attempt.expectedAmountCents || event.adjustmentId !== null) return fail("invalid_event");
      break;
    case "refunded": case "dispute_opened": case "dispute_won": case "dispute_lost":
      if (!cents(event.observedAmountCents) || event.observedAmountCents > attempt.expectedAmountCents || !identifier(event.adjustmentId)) return fail("invalid_event");
      break;
    case "pending": case "failed": case "cancelled":
      if (event.observedAmountCents !== 0 || event.adjustmentId !== null) return fail("invalid_event");
      break;
    default: return fail("invalid_event");
  }
  // Allowlists prevent raw provider data/client secrets reaching persistence.
  const fact: AuthenticatedAssistedProviderEvent = Object.freeze({
    provider: event.provider, accountId: event.accountId, mode: event.mode,
    eventId: event.eventId, providerPaymentId: event.providerPaymentId, providerSessionId: event.providerSessionId,
    attemptId: event.attemptId, requestId: event.requestId, canonicalOrderId: event.canonicalOrderId,
    quoteId: event.quoteId, quoteVersion: event.quoteVersion, acceptanceId: event.acceptanceId,
    kind: event.kind, observedAmountCents: event.observedAmountCents, currency: event.currency,
    occurredAt: event.occurredAt, adjustmentId: event.adjustmentId,
  });
  const scope = [fact.provider, fact.accountId, fact.mode];
  try {
    const receipt = await authority.commit(Object.freeze({
      ...fact,
      expectedAmountCents: attempt.expectedAmountCents,
      eventKey: fingerprint([...scope, fact.eventId]),
      paymentEvidenceKey: fingerprint([...scope, fact.providerPaymentId]),
      payloadFingerprint: fingerprint([fact, attempt.expectedAmountCents]),
    }));
    if (!receipt || typeof receipt.replayed !== "boolean") return fail("persistence_unavailable");
    return { ok: true, value: Object.freeze({ replayed: receipt.replayed }) };
  } catch {
    return fail("persistence_unavailable");
  }
}
