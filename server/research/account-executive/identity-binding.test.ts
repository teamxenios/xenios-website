import { describe, expect, it, vi } from "vitest";
import { memberOwnerHash, createAeIdentityBinding, isVerifiedGuestOwnership } from "./identity-binding";
import { requestIntentOwner } from "../assisted-order/request-intent/service";
import { sha256AssistedOrderHasher } from "../assisted-order/defaults";
import type { AssistedOrderViewer } from "../assisted-order/ports";

describe("AE canonical request owner namespace", () => {
  const user = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const member: AssistedOrderViewer = { actorType: "member", authUserId: user,
    memberId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", earlyAccessCustomerRef: null,
    earlyAccessSessionHash: null, normalizedEmail: "synthetic@example.invalid",
    capabilities: new Set(["assisted_orders:submit"]) };
  it("uses the existing request owner hasher exactly and normalizes UUID case", () => {
    expect(memberOwnerHash(user)).toBe(requestIntentOwner(member, sha256AssistedOrderHasher));
    expect(memberOwnerHash(user.toUpperCase())).toBe(memberOwnerHash(user));
  });
  it("never treats an equal-contact guest session as the authenticated owner", () => {
    const guest: AssistedOrderViewer = { ...member, actorType: "early_access_session", authUserId: null,
      memberId: null, earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session" };
    expect(requestIntentOwner(guest, sha256AssistedOrderHasher)).not.toBe(memberOwnerHash(user));
    expect(() => memberOwnerHash("synthetic@example.invalid")).toThrow();
  });
  it("requires exact custodian request/customer/hash evidence and rejects copied or fabricated objects", async () => {
    const scope = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", request = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const proof = { claimId: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee", requestId: request, customerAuthUserId: user, ownerHash: "f".repeat(64) };
    const rpc = vi.fn(async () => ({ data: proof, error: null }));
    const identity = createAeIdentityBinding({ rpc }, scope);
    expect(isVerifiedGuestOwnership(proof, proof)).toBe(false);
    const verified = await identity.verifyGuestRequestOwnership({ actorAuthUserId: user, sessionId: scope,
      customerAuthUserId: user, requestId: request, ownerHash: proof.ownerHash });
    expect(isVerifiedGuestOwnership(verified, proof)).toBe(true);
    expect(isVerifiedGuestOwnership(structuredClone(verified), proof)).toBe(false);
    expect(isVerifiedGuestOwnership(verified, { ...proof, ownerHash: "0".repeat(64) })).toBe(false);
  });
  it("denies recovery and injected identity fields before a claim RPC", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null })), identity = createAeIdentityBinding({ rpc }, user);
    const session = { authUserId: user, sessionId: user, purpose: "ordinary" as const };
    const command = { commandId: user, requestId: user };
    expect(await identity.claim({ ...session, purpose: "recovery" }, command, null)).toEqual({ ok: false, code: "access_denied" });
    expect(await identity.claim(session, { ...command, customerAuthUserId: user }, null)).toEqual({ ok: false, code: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });
});
