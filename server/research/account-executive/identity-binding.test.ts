import { describe, expect, it } from "vitest";
import { memberOwnerHash } from "./identity-binding";
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
});
