/**
 * The member-to-Early-Access identity bridge.
 *
 * A canonical member (Supabase Auth, research_members) and an Early Access
 * customer are two records of one person, and until this bridge the door
 * could only see the second. This resolves a VERIFIED member to their
 * APPROVED Early Access customer record, so a signed-in member who also holds
 * an Early Access session places orders as their canonical self: the order
 * carries their durable customerRef, and the customer record carries their
 * userId.
 *
 * COMPOSED BESIDE, NEVER INSTEAD.
 *
 *   - The base directory answers FIRST. A session-scoped identity, an email
 *     entry, anything the existing composition resolves, stands exactly as it
 *     did. The bridge only speaks when the base has nothing to say, so no
 *     existing session's identity can change shape because a member token
 *     also happened to ride the request.
 *   - The door's session wall is untouched: resolveCaller still refuses
 *     SESSION_REQUIRED before identity is even consulted. The bridge upgrades
 *     WHO an authenticated session is; it never upgrades WHETHER a caller is
 *     authenticated.
 *   - RESEARCH_EARLY_ACCESS_SESSION_IDENTITY_ENABLED keeps its meaning and
 *     its fail-closed default; this file never reads it.
 *
 * THE LINKING RULE. The member arrives server-resolved (member-auth verified
 * the JWT; the email is the member row's, never a browser claim). The lookup
 * is by normalized email against the ONE claim-rail customer repository:
 *
 *   - no record, or a record that is not APPROVED: no identity (null), and
 *     the caller falls back to whatever it was before this bridge existed;
 *   - a record already carrying this member's userId: resolved;
 *   - a record carrying NO userId: linked NOW (userId populated durably,
 *     once) and resolved - this is the first time this member and this
 *     customer provably met on a verified rail;
 *   - a record carrying a DIFFERENT userId: refused. An email match is a
 *     routing detail; a userId is an identity. Rebinding silently would move
 *     a customer's orders to whoever holds the address today.
 */

import type {
  EarlyAccessCustomer,
  EarlyAccessIdentityDirectory,
  EarlyAccessResolvedMember,
} from "../routes/ports";
import { isSafeIdentifier } from "../commerce/input-guards";
import {
  customerRefFor,
  isValidEmail,
  normalizeEmail,
  type EarlyAccessCustomerRecord,
  type EarlyAccessCustomerRepository,
} from "./early-access-customer";

export class MemberBridgedEarlyAccessIdentity implements EarlyAccessIdentityDirectory {
  constructor(
    private readonly deps: Readonly<{
      base: EarlyAccessIdentityDirectory;
      customers: Pick<EarlyAccessCustomerRepository, "findByNormalizedEmail" | "update">;
      warn?: (message: string) => void;
    }>,
  ) {}

  async resolve(
    input: Readonly<{ cookieHeader: unknown; member?: EarlyAccessResolvedMember | null }>,
  ): Promise<EarlyAccessCustomer | null> {
    const base = await this.deps.base.resolve(input);
    if (base !== null) return base;

    const member = input.member ?? null;
    if (member === null) return null;
    if (!isSafeIdentifier(member.userId) || !isValidEmail(member.email)) return null;

    let record: EarlyAccessCustomerRecord | null;
    try {
      record = await this.deps.customers.findByNormalizedEmail(normalizeEmail(member.email));
    } catch {
      // A broken read is "we do not know", and an identity we do not know is
      // no identity. The caller's refusal reads exactly as it did before.
      return null;
    }
    if (record === null) return null;
    if (record.status !== "APPROVED") return null;

    if (record.userId === null) {
      // First provable meeting of this member and this customer on a
      // verified rail: link durably, exactly once. A failed link resolves
      // nothing rather than resolving an unlinked identity.
      try {
        record = await this.deps.customers.update({ ...record, userId: member.userId });
      } catch (error) {
        this.deps.warn?.(
          `member-bridge: linking userId failed (${error instanceof Error ? error.message : "unknown"})`,
        );
        return null;
      }
    } else if (record.userId !== member.userId) {
      this.deps.warn?.(
        "member-bridge: email matched a customer bound to a different userId; refusing to rebind",
      );
      return null;
    }

    const customerRef = customerRefFor(record);
    if (!isSafeIdentifier(customerRef)) return null;

    return Object.freeze({
      customerRef,
      displayName: record.legalName || normalizeEmail(member.email),
      // The strongest provenance this repository knows: the member's JWT was
      // verified by member-auth and the link is durable on the record.
      boundBy: "verified_link" as const,
    });
  }
}
