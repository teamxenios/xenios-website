import { createHash } from "node:crypto";

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

export class SessionScopedEarlyAccessIdentityDirectory
  implements EarlyAccessIdentityDirectory
{
  constructor(private readonly deps: SessionScopedIdentityDependencies) {}

  async resolve(
    input: Readonly<{ cookieHeader: unknown }>,
  ): Promise<EarlyAccessCustomer | null> {
    const session = await this.deps.resolveSession(input.cookieHeader);
    if (!session.authenticated) return null;

    if (this.deps.primary !== undefined) {
      const existing = await this.deps.primary.resolve(input);
      if (existing !== null) return existing;
    }

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
