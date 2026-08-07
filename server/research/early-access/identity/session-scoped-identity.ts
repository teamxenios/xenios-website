import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { EarlyAccessCustomer, EarlyAccessIdentityDirectory } from "../routes/ports";

/**
 * Turns a valid Private Early Access browser session into an isolated customer
 * identity for the code-access pilot.
 *
 * The shared code proves only that this browser may enter. It does NOT map every
 * visitor to one customer and it never trusts an email/customer id from a body.
 * The opaque customer reference is deterministically derived from the signed,
 * durable session id, so two browsers cannot read or replay each other's orders.
 *
 * A stronger existing identity wins. That keeps the verified-link/account path
 * available for later recovery without making it a prerequisite for checkout.
 */
export type SessionScopedIdentityDependencies = Readonly<{
  resolveSession(cookieHeader: unknown): Promise<{ authenticated: boolean }>;
  readSessionId(cookieHeader: unknown): string | null;
  primary?: EarlyAccessIdentityDirectory;
  /**
   * Verifies the continuity credential. When absent, identity falls back to
   * the session-derived reference (the original, rotation-fragile behavior),
   * so a deployment that has not issued continuity cookies yet keeps working.
   */
  continuitySecret?: string;
}>;

/**
 * The environment kill switch for session-scoped identity.
 *
 * EXACTLY the string "true" enables it. Missing, empty, malformed, "false",
 * "1", "TRUE", "yes", or anything else keeps it DISABLED, and disabled means
 * the pre-existing verified-link identity path is what runs: an operator who
 * fat-fingers the variable gets the older, stricter behavior, never a wider
 * door. This is the one switch that turns the shared launch code into a
 * checkout credential, so it fails closed in every direction.
 */
export const EARLY_ACCESS_SESSION_IDENTITY_ENV =
  "RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED";

export function earlyAccessSessionIdentityEnabled(
  env: Readonly<Partial<Record<string, string>>>,
): boolean {
  return env[EARLY_ACCESS_SESSION_IDENTITY_ENV] === "true";
}

export function earlyAccessCustomerRefForSession(sessionId: string): string | null {
  if (typeof sessionId !== "string" || sessionId.length < 16 || sessionId.length > 256) {
    return null;
  }
  return `eac_${createHash("sha256")
    .update(`xenios-early-access-session-customer-v1:${sessionId}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

// ---------------------------------------------------------------------------
// The continuity credential: customer ownership, separate from the session
// ---------------------------------------------------------------------------

/**
 * THE ACCESS SESSION AND THE CUSTOMER ARE TWO DIFFERENT FACTS. The session
 * cookie proves this browser may currently enter Early Access, and it
 * rotates: it expires in hours, and re-entering the code mints a new one. If
 * the customer identity were derived from it (as it originally was), every
 * legitimate renewal would silently mint a NEW customer and orphan every
 * order the old one placed.
 *
 * The continuity credential fixes that split. It is a server-issued,
 * high-entropy, HMAC-signed token in its own long-lived HttpOnly cookie,
 * minted once per browser at unlock and never rotated by later unlocks. The
 * ownership identity derives from IT, so the session may rotate freely while
 * the purchaser's eac_ reference stays put.
 *
 * What it is NOT: it is not derived from the shared access code (two
 * browsers get two tokens), it is not client-chosen (the HMAC makes anything
 * not minted here read as absent), it is never accepted from a body or URL,
 * and it is worthless without a live session (resolve() checks the session
 * first). A cleared or forged credential fails closed to a fresh identity;
 * sign-out clears it deliberately, because a shared machine's next customer
 * must never inherit the last one's orders.
 */
export const EARLY_ACCESS_CONTINUITY_COOKIE = "xenios_ea_customer";
/** 60 days: longer than any pilot session, short enough to expire naturally. */
export const EARLY_ACCESS_CONTINUITY_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
const CONTINUITY_VERSION = "v1";
const CONTINUITY_TOKEN_SHAPE = /^[a-f0-9]{64}$/;
const CONTINUITY_MAC_SHAPE = /^[a-f0-9]{64}$/;

function continuityMac(secret: string, token: string): string {
  return createHmac("sha256", secret)
    .update(`xenios-ea-continuity-${CONTINUITY_VERSION}:${token}`, "utf8")
    .digest("hex");
}

export function mintEarlyAccessContinuityCookie(secret: string): Readonly<{
  setCookie: string;
}> {
  const token = randomBytes(32).toString("hex");
  const value = `${CONTINUITY_VERSION}.${token}.${continuityMac(secret, token)}`;
  return Object.freeze({
    setCookie:
      `${EARLY_ACCESS_CONTINUITY_COOKIE}=${value}; Path=/; ` +
      `Max-Age=${EARLY_ACCESS_CONTINUITY_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Strict`,
  });
}

export function clearEarlyAccessContinuityCookie(): string {
  return (
    `${EARLY_ACCESS_CONTINUITY_COOKIE}=; Path=/; ` +
    `Expires=Thu, 01 Jan 1970 00:00:00 GMT; Max-Age=0; HttpOnly; Secure; SameSite=Strict`
  );
}

/**
 * The verified continuity token from a Cookie header, or null. Null for a
 * missing cookie, a malformed value, a wrong version, and above all a bad
 * MAC: a credential this server did not sign does not exist.
 */
export function readEarlyAccessContinuityToken(
  cookieHeader: unknown,
  secret: string,
): string | null {
  if (typeof cookieHeader !== "string" || secret.length === 0) return null;
  for (const pair of cookieHeader.split(";")) {
    const trimmed = pair.trim();
    if (!trimmed.startsWith(`${EARLY_ACCESS_CONTINUITY_COOKIE}=`)) continue;
    const value = trimmed.slice(EARLY_ACCESS_CONTINUITY_COOKIE.length + 1);
    const parts = value.split(".");
    if (parts.length !== 3 || parts[0] !== CONTINUITY_VERSION) return null;
    const token = parts[1];
    const mac = parts[2];
    if (!CONTINUITY_TOKEN_SHAPE.test(token) || !CONTINUITY_MAC_SHAPE.test(mac)) return null;
    const presented = Buffer.from(mac, "hex");
    const expected = Buffer.from(continuityMac(secret, token), "hex");
    if (presented.length !== expected.length || !timingSafeEqual(presented, expected)) {
      return null;
    }
    return token;
  }
  return null;
}

export function earlyAccessCustomerRefForContinuity(token: string): string | null {
  if (typeof token !== "string" || !CONTINUITY_TOKEN_SHAPE.test(token)) return null;
  return `eac_${createHash("sha256")
    .update(`xenios-early-access-continuity-customer-v1:${token}`, "utf8")
    .digest("hex")
    .slice(0, 32)}`;
}

export class SessionScopedEarlyAccessIdentityDirectory
  implements EarlyAccessIdentityDirectory
{
  constructor(private readonly deps: SessionScopedIdentityDependencies) {}

  async resolve(
    input: Readonly<{ cookieHeader: unknown }>,
  ): Promise<EarlyAccessCustomer | null> {
    const session = await this.deps.resolveSession(input.cookieHeader);
    if (!session.authenticated) return null;

    // The ownership identity, from the long-lived signed continuity
    // credential when one is present and verifies. A forged or malformed
    // credential reads as absent, never as an error and never as identity.
    const token =
      this.deps.continuitySecret === undefined
        ? null
        : readEarlyAccessContinuityToken(input.cookieHeader, this.deps.continuitySecret);
    const continuityRef = token === null ? null : earlyAccessCustomerRefForContinuity(token);

    if (this.deps.primary !== undefined) {
      const existing = await this.deps.primary.resolve(input);
      if (existing !== null) {
        // A stronger verified identity wins, and it CARRIES the continuity
        // reference as an alias rather than replacing it: verification must
        // never reduce access, so orders placed under the session-code
        // identity in this same browser stay readable by the person who
        // just proved more about themselves, not less.
        if (continuityRef === null || continuityRef === existing.customerRef) return existing;
        const aliases = [...(existing.aliasRefs ?? [])];
        if (!aliases.includes(continuityRef)) aliases.push(continuityRef);
        return Object.freeze({ ...existing, aliasRefs: Object.freeze(aliases) });
      }
    }

    if (continuityRef !== null) {
      return Object.freeze({
        customerRef: continuityRef,
        displayName: "Early Access customer",
        boundBy: "session_code" as const,
      });
    }

    // Legacy fallback: the session-derived identity, for a session unlocked
    // before continuity cookies were issued. Rotation-fragile by nature and
    // superseded the next time this browser unlocks.
    const sessionId = this.deps.readSessionId(input.cookieHeader);
    if (sessionId === null) return null;
    const customerRef = earlyAccessCustomerRefForSession(sessionId);
    if (customerRef === null) return null;

    return Object.freeze({
      customerRef,
      displayName: "Early Access customer",
      boundBy: "session_code" as const,
    });
  }
}
