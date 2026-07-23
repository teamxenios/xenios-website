// ---------------------------------------------------------------------------
// Founding-membership activation: the 14 day manual external payment bridge.
//
// Phase A runs on admin-configured manual_external_payment methods for exactly
// 14 calendar days (timezone honored, so "day 14" ends at the admin's local
// midnight boundary math, not a naive 14 * 24h). Phase B (Day 15) swaps to
// business methods by configuration. This module is the pure clock-and-policy
// core: settings, phase math, obligation gating, and the audited extension
// path. Persistence lives in persistence/bridge-store.ts; surfaces come later
// behind RESEARCH_FOUNDING_ACTIVATION_ENABLED.
//
// Policy encoded here:
//   - The bridge covers activation and membership-renewal obligations only.
//     Whether a method can take a NEW obligation is decided by
//     canCreateObligationWith; product commerce is out of reach entirely
//     (methods are never product eligible, enforced in payment-methods.ts).
//   - Sunset is a hard stop for NEW obligations. Existing submissions stay
//     reviewable forever: a member who already paid is never orphaned by the
//     calendar.
//   - There is no silent extension. Extending the bridge requires a named
//     admin, a reason, and an expiry, and emits an audit event the store
//     persists append-only.
//   - All dates are server-side ISO instants. Nothing here trusts a client
//     clock.
// ---------------------------------------------------------------------------

import { isMethodUsableAt, MANUAL_EXTERNAL_PAYMENT, type PaymentMethodRecord } from "./payment-methods";

export const BRIDGE_DEFAULT_CALENDAR_DAYS = 14;

export type ReplacementProviderStatus = "not_started" | "in_progress" | "testing" | "ready" | "live";

export interface BridgeSettings {
  bridgeEnabled: boolean;
  /** ISO instant the bridge opens. */
  startAt: string;
  /** ISO instant the bridge closes (start plus 14 calendar days by default). */
  endAt: string;
  /** IANA timezone the calendar-day math is computed in, e.g. "America/Chicago". */
  timezone: string;
  acceptingNewActivationPayments: boolean;
  acceptingExistingObligationPayments: boolean;
  replacementProviderStatus: ReplacementProviderStatus;
  administratorEmergencyDisable: boolean;
  administratorExtensionReason: string | null;
  administratorExtensionExpiresAt: string | null;
}

export type BridgePhase = "before" | "active" | "sunset";

export type BridgeAuditKind = "bridge_extension" | "bridge_emergency_disable" | "bridge_settings_updated";

export interface BridgeAuditEvent {
  eventId: string;
  kind: BridgeAuditKind;
  actorId: string;
  reason: string;
  at: string;
  detail: Record<string, unknown>;
}

export class BridgeSettingsInvalid extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeSettingsInvalid";
  }
}

// ---------------------------------------------------------------------------
// Calendar-day math, timezone honored
// ---------------------------------------------------------------------------

/** Milliseconds the zone's wall clock is ahead of UTC at `date`. */
function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value ?? "0");
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  // Sub-second truncation from formatToParts is restored from the source date.
  return asUtc - (date.getTime() - date.getMilliseconds());
}

/**
 * The instant that is `days` CALENDAR days after `isoInstant`, holding the
 * wall-clock time constant in `timeZone`. Across a daylight-saving change the
 * absolute duration is 1 hour shorter or longer than days * 24h; that is the
 * point of honoring the timezone. Implemented as wall-clock arithmetic with an
 * iterated offset fix so a shifted offset at the target converges.
 */
export function addCalendarDays(isoInstant: string, days: number, timeZone: string): string {
  const start = new Date(isoInstant);
  if (Number.isNaN(start.getTime())) throw new BridgeSettingsInvalid(`Not a valid instant: ${isoInstant}`);
  const wallTarget = start.getTime() + zoneOffsetMs(start, timeZone) + days * 86_400_000;
  let result = wallTarget - zoneOffsetMs(start, timeZone);
  for (let i = 0; i < 2; i++) {
    const corrected = wallTarget - zoneOffsetMs(new Date(result), timeZone);
    if (corrected === result) break;
    result = corrected;
  }
  return new Date(result).toISOString();
}

/**
 * The default phase-A window: the given start, plus 14 calendar days in the
 * given timezone. Acceptance toggles default ON (the bridge exists to accept)
 * and the replacement provider starts not_started; emergency disable and the
 * extension fields start empty.
 */
export function defaultBridgeSettings(startAt: Date | string, timezone: string): BridgeSettings {
  const startIso = typeof startAt === "string" ? new Date(startAt).toISOString() : startAt.toISOString();
  return {
    bridgeEnabled: true,
    startAt: startIso,
    endAt: addCalendarDays(startIso, BRIDGE_DEFAULT_CALENDAR_DAYS, timezone),
    timezone,
    acceptingNewActivationPayments: true,
    acceptingExistingObligationPayments: true,
    replacementProviderStatus: "not_started",
    administratorEmergencyDisable: false,
    administratorExtensionReason: null,
    administratorExtensionExpiresAt: null,
  };
}

/**
 * The instant new obligations stop: the configured end, or a granted
 * extension's expiry when one is properly recorded (reason AND expiry, and the
 * expiry actually extends). A half-filled extension extends nothing.
 */
export function effectiveEndAt(settings: BridgeSettings): string {
  const { administratorExtensionReason: reason, administratorExtensionExpiresAt: expiry } = settings;
  if (reason && reason.trim().length > 0 && expiry && expiry > settings.endAt) return expiry;
  return settings.endAt;
}

/**
 * Where the bridge stands at `now`. Emergency disable and a disabled bridge
 * both read as sunset: the distinction that matters downstream is only
 * "can a new obligation be created", and for both the answer is no while
 * existing submissions stay reviewable.
 */
export function bridgePhase(now: Date, settings: BridgeSettings): BridgePhase {
  if (!settings.bridgeEnabled || settings.administratorEmergencyDisable) return "sunset";
  const at = now.toISOString();
  if (at < settings.startAt) return "before";
  if (at >= effectiveEndAt(settings)) return "sunset";
  return "active";
}

export type ObligationPurpose = "activation" | "renewal";

export type ObligationGate = { allowed: true } | { allowed: false; reason: string };

/**
 * May a NEW payment obligation be created against this method right now?
 * Refuses expired, disabled, unapproved, or wrongly categorized methods and
 * every non-active bridge phase. This gate is for CREATION only; reviewing an
 * existing submission is never phase-gated (see canReviewExistingSubmission).
 */
export function canCreateObligationWith(
  method: PaymentMethodRecord,
  settings: BridgeSettings,
  now: Date,
  purpose: ObligationPurpose = "activation",
): ObligationGate {
  const phase = bridgePhase(now, settings);
  if (phase !== "active") {
    return { allowed: false, reason: phase === "before" ? "bridge_not_open_yet" : "bridge_sunset" };
  }
  if (method.category !== MANUAL_EXTERNAL_PAYMENT) {
    return { allowed: false, reason: "method_wrong_category" };
  }
  if (!isMethodUsableAt(method, now)) {
    // Disabled, unapproved, or outside its own active window (expired).
    return { allowed: false, reason: "method_not_usable" };
  }
  if (purpose === "activation") {
    if (!method.activationEligible) return { allowed: false, reason: "method_not_activation_eligible" };
    if (!settings.acceptingNewActivationPayments) {
      return { allowed: false, reason: "not_accepting_new_activation_payments" };
    }
  } else {
    if (!method.renewalEligible) return { allowed: false, reason: "method_not_renewal_eligible" };
    if (!settings.acceptingExistingObligationPayments) {
      return { allowed: false, reason: "not_accepting_existing_obligation_payments" };
    }
  }
  return { allowed: true };
}

/**
 * Reviewing a submission that already exists is ALWAYS allowed, in every
 * phase, with the bridge disabled, and under emergency disable. A member who
 * already sent money is never orphaned by the calendar; sunset only stops new
 * obligations. The function takes the settings to make the contract explicit
 * at call sites, and deliberately ignores them.
 */
export function canReviewExistingSubmission(_settings: BridgeSettings, _now: Date): ObligationGate {
  return { allowed: true };
}

// ---------------------------------------------------------------------------
// The audited extension path (no silent extension)
// ---------------------------------------------------------------------------

export interface BridgeExtensionRequest {
  eventId: string;
  actorId: string;
  reason: string;
  expiresAt: string;
  now: Date;
}

/**
 * Extend the bridge. Requires a named admin, a non-empty reason, and an expiry
 * that is in the future and actually later than the current effective end.
 * Returns the updated settings AND the audit event; the caller persists both
 * together. There is no other way to move the end date forward.
 */
export function requestBridgeExtension(
  settings: BridgeSettings,
  request: BridgeExtensionRequest,
): { settings: BridgeSettings; event: BridgeAuditEvent } {
  if (!request.actorId.trim()) {
    throw new BridgeSettingsInvalid("A bridge extension requires a named administrator.");
  }
  if (!request.reason.trim()) {
    throw new BridgeSettingsInvalid("A bridge extension requires a reason; there is no silent extension.");
  }
  const expiry = new Date(request.expiresAt);
  if (Number.isNaN(expiry.getTime())) {
    throw new BridgeSettingsInvalid(`Not a valid extension expiry: ${request.expiresAt}`);
  }
  const expiryIso = expiry.toISOString();
  if (expiryIso <= request.now.toISOString()) {
    throw new BridgeSettingsInvalid("A bridge extension must expire in the future.");
  }
  const previousEnd = effectiveEndAt(settings);
  if (expiryIso <= previousEnd) {
    throw new BridgeSettingsInvalid("A bridge extension must end later than the current effective end.");
  }
  return {
    settings: {
      ...settings,
      administratorExtensionReason: request.reason,
      administratorExtensionExpiresAt: expiryIso,
    },
    event: {
      eventId: request.eventId,
      kind: "bridge_extension",
      actorId: request.actorId,
      reason: request.reason,
      at: request.now.toISOString(),
      detail: { previousEndAt: previousEnd, newEndAt: expiryIso },
    },
  };
}

/**
 * The administrator's emergency stop. Flips the bridge to sunset immediately
 * for new obligations (existing submissions stay reviewable) and emits the
 * audit event recording who, why, and when.
 */
export function emergencyDisableBridge(
  settings: BridgeSettings,
  args: { eventId: string; actorId: string; reason: string; now: Date },
): { settings: BridgeSettings; event: BridgeAuditEvent } {
  if (!args.actorId.trim()) {
    throw new BridgeSettingsInvalid("An emergency disable requires a named administrator.");
  }
  if (!args.reason.trim()) {
    throw new BridgeSettingsInvalid("An emergency disable requires a reason.");
  }
  return {
    settings: { ...settings, administratorEmergencyDisable: true },
    event: {
      eventId: args.eventId,
      kind: "bridge_emergency_disable",
      actorId: args.actorId,
      reason: args.reason,
      at: args.now.toISOString(),
      detail: { endAtWhenDisabled: effectiveEndAt(settings) },
    },
  };
}
