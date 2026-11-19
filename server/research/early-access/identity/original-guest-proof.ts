import type { SessionScopedEarlyAccessIdentityDirectory } from "./session-scoped-identity";

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

/** Registration supplies only its own composed canonical session directory.
 * Custom identity injection and non-session identity modes supply null; merely
 * exposing a similarly named method on another identity is not provenance. */
export function createOriginalGuestProofReader(
  canonicalDirectory: SessionScopedEarlyAccessIdentityDirectory | null,
): OriginalGuestProofReader {
  return canonicalDirectory === null ? async () => null
    : cookieHeader => canonicalDirectory.readOriginalGuestProof(cookieHeader);
}
