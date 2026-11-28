import { OriginalGuestProofUnavailableError, type SessionScopedEarlyAccessIdentityDirectory } from "./session-scoped-identity";
export { OriginalGuestProofUnavailableError } from "./session-scoped-identity";
import { createEarlyAccessSessionIdReader, PRIVATE_ACCESS_DEFAULT_OWNER_ID,
  type PrivateAccessRouteDependencies } from "../private-access-routes";
import { SupabasePrivateAccessSessionRepository } from "../private-access-session-repository";

/** Server-only provenance from the existing EA cookie/session directory.
 * sessionHandleHash is H1 returned by the canonical signed-session reader.
 * The request-owner adapter applies SHA256(UTF8(H1)) once to obtain H2. No
 * member identity, primary alias or expiry inferred from cookie TTL belongs here. */
export type OriginalGuestProof = Readonly<{
  customerRef: string;
  sessionHandleHash: string;
  expiresAtEpochMs: number;
}>;
export type OriginalGuestProofReader = (cookieHeader: unknown) => Promise<OriginalGuestProof | null>;
export type OriginalGuestProofSessionReader = (cookieHeader: unknown) => Promise<Readonly<{
  sessionHandleHash: string;
  expiresAtEpochMs: number;
}> | null>;

function validInstant(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0 && Number.isFinite(new Date(value).getTime());
}

/** Explicit proof-only selection over the SAME canonical route repository,
 * owner, signed-cookie reader and clock. No constructor/provider probe, new
 * client, admission switch, session mint, expiry estimate or reference lookup. */
export function createOriginalGuestProofSessionCapability(
  deps: PrivateAccessRouteDependencies,
  selection: unknown,
): OriginalGuestProofSessionReader | null {
  const repository = deps.repository;
  if (selection !== "canonical-live-row-v1" || !(repository instanceof SupabasePrivateAccessSessionRepository)
    || typeof repository.resolveWithExpiry !== "function"
    || repository.sessionOwnerId !== (deps.ownerId ?? PRIVATE_ACCESS_DEFAULT_OWNER_ID)
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(repository.sessionOwnerId)) return null;
  const readSessionId = createEarlyAccessSessionIdReader(deps);
  return async cookieHeader => {
    try {
      const now = deps.now();
      if (!validInstant(now)) throw new OriginalGuestProofUnavailableError();
      const sessionHandleHash = readSessionId(cookieHeader);
      if (sessionHandleHash === null) return null;
      // Use the same ordinary repository predicate directly: the HTTP resolver
      // intentionally collapses provider failure to signed-out, whereas this
      // server-only proof port must preserve unavailable versus genuine NULL.
      const ordinary = await repository.resolve(sessionHandleHash, now);
      if (!ordinary.ok) throw new OriginalGuestProofUnavailableError();
      if (ordinary.value === null) return null;
      const expiry = await repository.resolveWithExpiry(sessionHandleHash, now);
      if (!expiry.ok) throw new OriginalGuestProofUnavailableError();
      if (expiry.value === null) return null;
      const current = deps.now();
      if (!validInstant(current) || !validInstant(expiry.value)) throw new OriginalGuestProofUnavailableError();
      if (expiry.value <= current || readSessionId(cookieHeader) !== sessionHandleHash) return null;
      // Fresh projection snapshot only; its row lock is not held through a
      // later AE claim transaction and grants no revocation-through-commit guarantee.
      return Object.freeze({ sessionHandleHash, expiresAtEpochMs: expiry.value });
    } catch {
      throw new OriginalGuestProofUnavailableError();
    }
  };
}

/** Registration supplies only its own composed canonical session directory.
 * Custom identity injection and non-session identity modes supply null; merely
 * exposing a similarly named method on another identity is not provenance. */
export function createOriginalGuestProofReader(
  canonicalDirectory: SessionScopedEarlyAccessIdentityDirectory | null,
): OriginalGuestProofReader | null {
  return canonicalDirectory === null || !canonicalDirectory.originalGuestProofAvailable ? null
    : cookieHeader => canonicalDirectory.readOriginalGuestProof(cookieHeader);
}
