/**
 * Private implementation support for CLAUDE-4's existing Root14370 proposal.
 * Eventual location: server/research/partners/referral-v1-locator.ts.
 * This locator supplies server facts only; it makes no attribution decision.
 */
import {
  readReferralCapture,
  readReferralVisitor,
  referralSecretReady,
} from "./referral-v1-tokens";

/** Exact request_intent_authoritative_referral.sql (9022) locator shapes. */
export type ServerReferralSource =
  | Readonly<{ kind: "unavailable"; reason: "disabled" | "unconfigured" | "invalid_source" }>
  | Readonly<{ kind: "account"; actorAuthUserId: string }>
  | Readonly<{ kind: "guest_touch"; touchId: string; subjectKeyHash: string; claimExpiresAt: number }>
  | Readonly<{ kind: "no_supported_touch" }>;

export interface ReferralV1RequestLocatorOptions {
  readonly enabled: boolean;
  readonly secret: string | null;
  readonly now?: () => number;
}

export interface ReferralV1RequestLocatorInput {
  readonly cookieHeader: string | undefined;
  readonly actorAuthUserId: string | null;
}

export interface ReferralV1RequestLocator {
  locate(input: ReferralV1RequestLocatorInput): ServerReferralSource;
}

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
const SQL_EPOCH_LIMIT_MS = 8_640_000_000_000_000;
const DISABLED: ServerReferralSource = Object.freeze({ kind: "unavailable", reason: "disabled" });
const UNCONFIGURED: ServerReferralSource = Object.freeze({ kind: "unavailable", reason: "unconfigured" });
const INVALID_SOURCE: ServerReferralSource = Object.freeze({ kind: "unavailable", reason: "invalid_source" });
const NO_SUPPORTED_TOUCH: ServerReferralSource = Object.freeze({ kind: "no_supported_touch" });

function lowerUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.toLowerCase();
  return UUID.test(normalized) ? normalized : null;
}

function sqlEpoch(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= SQL_EPOCH_LIMIT_MS;
}

export function createReferralV1RequestLocator(
  options: ReferralV1RequestLocatorOptions,
): Readonly<ReferralV1RequestLocator> {
  return Object.freeze({
    locate(input: ReferralV1RequestLocatorInput): ServerReferralSource {
      try {
        if (options.enabled !== true) return DISABLED;
        if (!input || typeof input !== "object" || Array.isArray(input)) return INVALID_SOURCE;

        const actor = input.actorAuthUserId;
        // A genuine guest has an explicit null account binding.
        if (actor !== null) {
          const actorAuthUserId = lowerUuid(actor);
          return actorAuthUserId === null
            ? INVALID_SOURCE
            : Object.freeze({ kind: "account", actorAuthUserId });
        }

        const secret = options.secret;
        if (!referralSecretReady(secret)) return UNCONFIGURED;
        const observedAt = (options.now ?? Date.now)();
        if (!sqlEpoch(observedAt)) return INVALID_SOURCE;
        const cookieHeader = input.cookieHeader;
        if (cookieHeader !== undefined && typeof cookieHeader !== "string") return INVALID_SOURCE;

        const visitor = readReferralVisitor(secret, cookieHeader, observedAt);
        if (!visitor) return NO_SUPPORTED_TOUCH;
        const claim = readReferralCapture(secret, cookieHeader, visitor, observedAt);
        if (!claim) return NO_SUPPORTED_TOUCH;

        const touchId = lowerUuid(claim.touchId);
        if (touchId === null || typeof claim.subjectKeyHash !== "string"
          || !HASH.test(claim.subjectKeyHash) || !sqlEpoch(claim.expiresAt)) return INVALID_SOURCE;
        return Object.freeze({ kind: "guest_touch", touchId,
          subjectKeyHash: claim.subjectKeyHash, claimExpiresAt: claim.expiresAt });
      } catch {
        return INVALID_SOURCE;
      }
    },
  });
}
