import { z } from "zod";
import { aeIdentifier, aeInstant, aeGuestClaimCommandSchema, aeGuestClaimReceiptSchema,
  type AeFailure, type AeResult } from "../../../shared/research/account-executive/workspace";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";
import type { AeVerifiedSession } from "./workspace";

/** The existing requestIntentOwner member namespace, with canonical UUID case.
 * A guest-session hash never becomes this hash by contact/referral matching. */
export function memberOwnerHash(authUserId: string): string {
  return sha256AssistedOrderHasher.stableHash(["request-intent-owner", "member", aeIdentifier.parse(authUserId)]);
}

export interface AeCanonicalRpc {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }>;
}
export function aeRpcFailure(error: { code?: string } | null): AeFailure {
  const code = error?.code;
  return { ok: false, code: code === "42501" ? "access_denied" : code === "P0002" ? "not_found"
    : code === "40001" ? "revision_conflict" : code === "23505" ? "idempotency_conflict"
    : code === "22023" || code === "22P02" ? "invalid_input" : "unavailable" };
}
const guestProofSchema = z.object({ customerRef: z.string().regex(/^eac_[a-f0-9]{32}$/),
  sessionHash: z.string().regex(/^[a-f0-9]{64}$/), expiresAt: aeInstant }).strict();
const ownershipSchema = z.object({ claimId: aeIdentifier, requestId: aeIdentifier,
  customerAuthUserId: aeIdentifier, ownerHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
export type AeGuestProof = z.infer<typeof guestProofSchema>;
export type AeGuestClaimReceipt = z.infer<typeof aeGuestClaimReceiptSchema>;
export type AeVerifiedGuestOwnership = Readonly<z.infer<typeof ownershipSchema>>;
const verifiedGuestOwnership = new WeakSet<object>();

/** An object copied from a DTO/body cannot attest ownership. Only the scoped
 * canonical custodian read below registers this process-local evidence object. */
export function isVerifiedGuestOwnership(value: unknown, expected: {
  requestId: string; customerAuthUserId: string; ownerHash: string;
}): value is AeVerifiedGuestOwnership {
  if (!value || typeof value !== "object" || !verifiedGuestOwnership.has(value)) return false;
  const proof = value as AeVerifiedGuestOwnership;
  return proof.requestId === expected.requestId && proof.customerAuthUserId === expected.customerAuthUserId && proof.ownerHash === expected.ownerHash;
}

export function createAeIdentityBinding(client: AeCanonicalRpc, operationalScopeId: string) {
  const scope = aeIdentifier.parse(operationalScopeId);
  return {
    async verifyGuestRequestOwnership(input: { actorAuthUserId: string; sessionId: string;
      customerAuthUserId: string; requestId: string; ownerHash: string }): Promise<AeVerifiedGuestOwnership | null> {
      try {
        const parsed = z.object({ actorAuthUserId: aeIdentifier, sessionId: aeIdentifier, customerAuthUserId: aeIdentifier,
          requestId: aeIdentifier, ownerHash: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(input);
        const response = await client.rpc("ae_workspace_guest_ownership", { p_actor_user_id: parsed.actorAuthUserId,
          p_session_id: parsed.sessionId, p_scope_id: scope, p_customer_auth_user_id: parsed.customerAuthUserId,
          p_request_id: parsed.requestId, p_owner_hash: parsed.ownerHash });
        if (response.error) return null;
        const value = ownershipSchema.safeParse(response.data);
        if (!value.success || value.data.requestId !== parsed.requestId || value.data.customerAuthUserId !== parsed.customerAuthUserId ||
          value.data.ownerHash !== parsed.ownerHash) return null;
        const proof = Object.freeze(value.data);
        verifiedGuestOwnership.add(proof);
        return proof;
      } catch { return null; }
    },
    async claim(verifiedSession: AeVerifiedSession, raw: unknown, verifiedOriginalGuestProof: AeGuestProof | null): Promise<AeResult<AeGuestClaimReceipt>> {
      // Canonical Auth has verified the JWT before providing this session.
      const session = z.object({ authUserId: aeIdentifier, purpose: z.literal("ordinary"), sessionId: aeIdentifier }).strict().safeParse(verifiedSession);
      if (!session.success) return { ok: false, code: "access_denied" };
      const command = aeGuestClaimCommandSchema.safeParse(raw);
      if (!command.success) return { ok: false, code: "invalid_input" };
      const proof = verifiedOriginalGuestProof === null ? null : guestProofSchema.safeParse(verifiedOriginalGuestProof);
      if (proof && !proof.success) return { ok: false, code: "unavailable" };
      try {
        const response = await client.rpc("ae_workspace_claim", { p_actor_user_id: session.data.authUserId,
          p_session_id: session.data.sessionId, p_scope_id: scope, p_command: command.data,
          p_guest_ref: proof?.data?.customerRef ?? null, p_guest_session_hash: proof?.data?.sessionHash ?? null,
          p_guest_expires_at: proof?.data?.expiresAt ?? null });
        if (response.error) return aeRpcFailure(response.error);
        const receipt = aeGuestClaimReceiptSchema.safeParse(response.data);
        return receipt.success && receipt.data.requestId === command.data.requestId
          ? { ok: true, value: receipt.data } : { ok: false, code: "unavailable" };
      } catch { return { ok: false, code: "unavailable" }; }
    },
  };
}
