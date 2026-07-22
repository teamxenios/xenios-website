import crypto from "crypto";
import type { InfinityEvent, InfinityEventType } from "@shared/research/member-platform";
import { capabilityEnabled } from "./capabilities";

// ---------------------------------------------------------------------------
// xenios research member platform: the Infinity event boundary (Website 2
// lane, Wave 5).
//
// Infinity is an EXTERNAL system. Everything that crosses this boundary is
// operational routing information: something needs Samuel's attention, here is
// the opaque reference, here is the deadline. Nothing that crosses it is
// member content.
//
// REDACTION IS STRUCTURAL, NOT EDITORIAL. buildInfinityEvent constructs the
// payload from an explicit allowlist of eight fields, so a caller cannot
// attach health answers, an email address, a session token, or a media
// reference by adding a property. Extra properties are dropped by
// construction rather than filtered by a denylist, because a denylist only
// ever knows about the leaks somebody already thought of.
//
// Selection is capability-driven (selectInfinityProvider):
//   infinity_events off      -> disabledInfinityProvider (every call refuses)
//   NODE_ENV === "test"      -> testInfinityProvider (in memory, assertable)
//   otherwise                -> signedHttpInfinityProvider (the adapter shell)
//
// HARD RULES encoded here:
// - No member contact details, ever. Not an email, not a phone number, not a
//   Telegram id, not a name. subjectRef is an opaque internal id and it is the
//   only identifier in the payload.
// - No health content, ever. safeSummary describes the WORK ("initial
//   assessment overdue"), never the answer, the plan, or the question text.
// - No credentials. The shared secret signs the request; it is never a field
//   in the body and it is never logged.
// - Nothing in this file performs network I/O. The signed HTTP adapter is a
//   documented shell, so no event can leave the system before that wave lands.
// ---------------------------------------------------------------------------

// DISABLED: the capability is off. NOT_CONFIGURED: the endpoint or the secret
// is missing. PROVIDER_ERROR: the adapter itself failed. Callers treat all
// three the same way (leave the ledger row undelivered for a retry sweep);
// the codes exist so logs stay truthful about which one happened.
export type ProviderErrorCode = "DISABLED" | "NOT_CONFIGURED" | "PROVIDER_ERROR";

export type ProviderResult<T> =
  | { ok: true; value: T }
  | { ok: false; code: ProviderErrorCode; message?: string };

export interface InfinityEventProvider {
  emit(event: InfinityEvent): Promise<ProviderResult<{ eventId: string }>>;
}

// ---------------------------------------------------------------------------
// The allowlist (the whole point of this module)
// ---------------------------------------------------------------------------

// The ONLY fields that may cross the boundary. Kept as a const array so the
// allowlist is inspectable by a test rather than implied by a function body.
export const INFINITY_EVENT_FIELDS = [
  "eventId",
  "type",
  "priority",
  "subjectRef",
  "safeSummary",
  "slaDeadline",
  "adminTarget",
  "emittedAt",
] as const;

export const INFINITY_EVENT_PRIORITIES = ["critical", "high", "normal"] as const;
export type InfinityEventPriority = (typeof INFINITY_EVENT_PRIORITIES)[number];

// A summary longer than this is a paragraph, and a paragraph is where free
// text (a member's own words) hides. Truncation is a cheap structural cap on
// how much can ever be smuggled through the one free-text field.
export const MAX_SAFE_SUMMARY_LENGTH = 200;

export type InfinityEventDraft = {
  eventId: string;
  type: InfinityEventType;
  priority: InfinityEventPriority;
  subjectRef: string;
  safeSummary: string;
  slaDeadline: string | null;
  adminTarget: string;
  emittedAt: string;
};

// Belt and braces on the one free-text field: an address-shaped token is
// replaced rather than trusted. The summaries this lane builds never contain
// one, so this only ever fires on a caller mistake, which is exactly when a
// structural guard is worth having.
const EMAIL_SHAPED = /[^\s@]+@[^\s@]+\.[^\s@]+/g;

export function scrubSafeSummary(value: unknown): string {
  const text = typeof value === "string" ? value : "";
  const scrubbed = text.replace(EMAIL_SHAPED, "[redacted]").replace(/\s+/g, " ").trim();
  return scrubbed.length > MAX_SAFE_SUMMARY_LENGTH
    ? `${scrubbed.slice(0, MAX_SAFE_SUMMARY_LENGTH - 1)}…`
    : scrubbed;
}

// Builds the payload from the allowlist ONLY. The parameter type is
// deliberately wide (a draft plus anything else a caller happens to hold) so
// that passing a whole domain row is possible and harmless: every field that
// is not on the allowlist is dropped here, not downstream.
export function buildInfinityEvent(input: InfinityEventDraft & Record<string, unknown>): InfinityEvent {
  return {
    eventId: String(input.eventId ?? ""),
    type: input.type,
    priority: input.priority,
    // Opaque internal reference. Never an email, never a display name.
    subjectRef: String(input.subjectRef ?? ""),
    safeSummary: scrubSafeSummary(input.safeSummary),
    slaDeadline: typeof input.slaDeadline === "string" ? input.slaDeadline : null,
    adminTarget: String(input.adminTarget ?? ""),
    emittedAt: String(input.emittedAt ?? ""),
  };
}

// ---------------------------------------------------------------------------
// Disabled
// ---------------------------------------------------------------------------

// The keys-later default. Refusing is the honest answer while the capability
// is off: no event, no crash, and above all no fabricated delivery receipt.
export const disabledInfinityProvider: InfinityEventProvider = {
  async emit() {
    return { ok: false, code: "DISABLED", message: "Infinity events are disabled." };
  },
};

// ---------------------------------------------------------------------------
// Test (deterministic, in memory, no network)
// ---------------------------------------------------------------------------

export class TestInfinityProvider implements InfinityEventProvider {
  // Every emitted payload is kept so a test can assert on exactly what would
  // have crossed the boundary, which is the only way to prove the redaction.
  readonly emitted: InfinityEvent[] = [];
  // Set to make the next emits refuse, so the undelivered-then-retried path is
  // exercised rather than assumed.
  refuseWith: ProviderErrorCode | null = null;

  reset() {
    this.emitted.length = 0;
    this.refuseWith = null;
  }

  async emit(event: InfinityEvent): Promise<ProviderResult<{ eventId: string }>> {
    // Recorded even on refusal: a refused emit is still an attempt, and tests
    // assert on the attempt count to prove a retry happened exactly once.
    this.emitted.push(event);
    if (this.refuseWith) {
      return { ok: false, code: this.refuseWith, message: "Test provider refused." };
    }
    return { ok: true, value: { eventId: event.eventId } };
  }
}

export const testInfinityProvider = new TestInfinityProvider();

// ---------------------------------------------------------------------------
// Signed HTTP (the real adapter SHELL)
// ---------------------------------------------------------------------------

export class InfinityProviderNotConfigured extends Error {
  readonly missing: string[];
  constructor(missing: string[]) {
    super(`Infinity events are not configured: ${missing.join(", ")}`);
    this.name = "InfinityProviderNotConfigured";
    this.missing = missing;
  }
}

const REQUIRED_ENV = ["INFINITY_EVENT_URL", "INFINITY_EVENT_SECRET"] as const;

export function missingInfinityEnv(): string[] {
  return REQUIRED_ENV.filter((name) => !process.env[name]);
}

// The signature contract, documented here so the receiving end can be built
// against it before the transport is:
//
//   POST <INFINITY_EVENT_URL>
//   Content-Type: application/json
//   X-Xenios-Timestamp: <unix seconds, from the caller's clock>
//   X-Xenios-Signature: sha256=<hex HMAC-SHA256(secret, "<timestamp>.<body>")>
//   body: the JSON of exactly the eight allowlisted fields
//
// The timestamp is INSIDE the signed string, so a captured request cannot be
// replayed under a fresh timestamp without the secret. The receiver rejects a
// timestamp outside its tolerance window (REPLAY_TOLERANCE_SECONDS) and
// compares signatures in constant time. eventId is stable per (kind, subject,
// phase), so the receiver can also treat it as an idempotency key.
export const SIGNATURE_TIMESTAMP_HEADER = "X-Xenios-Timestamp";
export const SIGNATURE_HEADER = "X-Xenios-Signature";
export const REPLAY_TOLERANCE_SECONDS = 300;

// Pure computation, no I/O. Exported so the signing rule can be tested and so
// the receiving service can be verified against the same helper.
export function signInfinityRequest(body: string, secret: string, now: Date): {
  timestamp: string;
  signature: string;
} {
  const timestamp = String(Math.floor(now.getTime() / 1000));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");
  return { timestamp, signature: `sha256=${signature}` };
}

// The seam where the outbound HTTP call gets wired. It is deliberately inert:
// it throws InfinityProviderNotConfigured without an endpoint and a secret,
// and returns a truthful PROVIDER_ERROR once configured, because the transport
// body is a later wave. It performs no network I/O, so no member reference can
// leave this system by accident before that wave lands and is reviewed.
export class SignedHttpInfinityProvider implements InfinityEventProvider {
  async emit(event: InfinityEvent): Promise<ProviderResult<{ eventId: string }>> {
    const missing = missingInfinityEnv();
    if (missing.length > 0) throw new InfinityProviderNotConfigured(missing);
    // The body is built from the allowlist again at the boundary, so even a
    // hand-rolled event object cannot widen what would be serialized.
    void JSON.stringify(buildInfinityEvent(event as InfinityEvent & Record<string, unknown>));
    return {
      ok: false,
      code: "PROVIDER_ERROR",
      message: "The Infinity HTTP transport is not wired yet (emit).",
    };
  }
}

export const signedHttpInfinityProvider = new SignedHttpInfinityProvider();

// Resolved per call, never memoized at import: capability state depends on
// environment that can change between requests (and between tests).
export function selectInfinityProvider(): InfinityEventProvider {
  if (!capabilityEnabled("infinity_events")) return disabledInfinityProvider;
  if (process.env.NODE_ENV === "test") return testInfinityProvider;
  return signedHttpInfinityProvider;
}
