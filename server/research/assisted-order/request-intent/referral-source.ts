import type { AssistedOrderViewer } from "../ports";
import { ATTRIBUTION_COOKIE_NAME, REFERRAL_VISITOR_COOKIE, readReferralCapture,
  readReferralVisitor, readUniqueCookie, referralSecretReady } from "../../partners/referral-v1-tokens";

export type RequestReferralSource = Readonly<
  | { kind: "unavailable"; reason: "disabled" | "unconfigured" | "invalid_source" }
  | { kind: "account"; actorAuthUserId: string }
  | { kind: "guest_touch"; touchId: string; subjectKeyHash: string; claimExpiresAt: number }
  | { kind: "no_supported_touch" }
>;
/** Server-created and invoked only after saved replay and new-input validation. */
export type RequestReferralSourceReader = () => RequestReferralSource;
export type RequestReferralSourceProvider = (viewer: AssistedOrderViewer, cookieHeader: string | undefined) => RequestReferralSource;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const hash = /^[a-f0-9]{64}$/;
const invalid = (): RequestReferralSource => Object.freeze({ kind: "unavailable", reason: "invalid_source" });
const isUuid = (raw: unknown): raw is string => typeof raw === "string" && uuid.test(raw)
  && raw !== "00000000-0000-0000-0000-000000000000";

/** Closed locator only. Never accept a partner/eligibility decision or invoke accessors. */
export function normalizeRequestReferralSource(raw: unknown): RequestReferralSource {
  try {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(raw))) return invalid();
    const values: Record<string, unknown> = Object.create(null);
    const ownKeys = Reflect.ownKeys(raw);
    if (ownKeys.length > 4) return invalid();
    for (const key of ownKeys) {
      if (typeof key !== "string") return invalid();
      const field = Object.getOwnPropertyDescriptor(raw, key);
      if (!field || !("value" in field)) return invalid();
      values[key] = field.value;
    }
    const keys = Object.keys(values).sort().join(",");
    if (values.kind === "unavailable" && keys === "kind,reason"
      && ["disabled", "unconfigured", "invalid_source"].includes(values.reason as string)) {
      return Object.freeze({ kind: "unavailable", reason: values.reason as "disabled" | "unconfigured" | "invalid_source" });
    }
    if (values.kind === "account" && keys === "actorAuthUserId,kind" && isUuid(values.actorAuthUserId)) {
      return Object.freeze({ kind: "account", actorAuthUserId: values.actorAuthUserId });
    }
    if (values.kind === "guest_touch" && keys === "claimExpiresAt,kind,subjectKeyHash,touchId"
      && isUuid(values.touchId) && typeof values.subjectKeyHash === "string" && hash.test(values.subjectKeyHash)
      && typeof values.claimExpiresAt === "number" && Number.isSafeInteger(values.claimExpiresAt)
      && values.claimExpiresAt >= 0 && values.claimExpiresAt <= 8_640_000_000_000_000) {
      return Object.freeze({ kind: "guest_touch", touchId: values.touchId,
        subjectKeyHash: values.subjectKeyHash, claimExpiresAt: values.claimExpiresAt });
    }
    return values.kind === "no_supported_touch" && keys === "kind"
      ? Object.freeze({ kind: "no_supported_touch" }) : invalid();
  } catch { return invalid(); }
}

/** Existing V1 HMAC proves only a locator. Native birth resolves its authority.
 * Injected callbacks read no secret/clock until a guest source is actually needed. */
export function createRequestReferralSource(options: Readonly<{
  enabled: boolean; getSecret: () => string | null; now: () => number;
}>): RequestReferralSourceProvider {
  const { enabled, getSecret, now } = options;
  return Object.freeze((viewer: AssistedOrderViewer, cookieHeader: string | undefined): RequestReferralSource => {
    if (enabled !== true) return Object.freeze({ kind: "unavailable", reason: "disabled" });
    if (viewer.actorType === "member") {
      // Member ID is not Auth UUID. Native code additionally binds the actor to
      // the existing member and the exact canonical request-owner hash.
      return viewer.memberId && isUuid(viewer.authUserId)
        ? Object.freeze({ kind: "account", actorAuthUserId: viewer.authUserId }) : invalid();
    }
    if (viewer.actorType !== "early_access_session" || !viewer.earlyAccessCustomerRef || !viewer.earlyAccessSessionHash) return invalid();
    let secret: string | null, instant: number;
    try { secret = getSecret(); instant = now(); }
    catch { return Object.freeze({ kind: "unavailable", reason: "unconfigured" }); }
    if (!referralSecretReady(secret) || !Number.isSafeInteger(instant) || instant < 0) {
      return Object.freeze({ kind: "unavailable", reason: "unconfigured" });
    }
    if (cookieHeader !== undefined && (typeof cookieHeader !== "string" || cookieHeader.length > 16384)) return invalid();
    const visitorWire = readUniqueCookie(cookieHeader, REFERRAL_VISITOR_COOKIE);
    const captureWire = readUniqueCookie(cookieHeader, ATTRIBUTION_COOKIE_NAME);
    const cookieNamed = (name: string) => cookieHeader?.split(";")
      .some(part => part.split("=", 1)[0].trim() === name) === true;
    if (visitorWire === null && captureWire === null) {
      return cookieNamed(REFERRAL_VISITOR_COOKIE) || cookieNamed(ATTRIBUTION_COOKIE_NAME)
        ? invalid() : Object.freeze({ kind: "no_supported_touch" });
    }
    const visitor = readReferralVisitor(secret, cookieHeader, instant);
    // A valid V1 visitor need not have captured a link. A missing capture is
    // distinct from a malformed/duplicate capture (both may read as null).
    if (visitor && captureWire === null && !cookieNamed(ATTRIBUTION_COOKIE_NAME)) {
      return Object.freeze({ kind: "no_supported_touch" });
    }
    const claim = visitor ? readReferralCapture(secret, cookieHeader, visitor, instant) : null;
    return claim ? normalizeRequestReferralSource({ kind: "guest_touch", touchId: claim.touchId,
      subjectKeyHash: claim.subjectKeyHash, claimExpiresAt: claim.expiresAt }) : invalid();
  });
}
