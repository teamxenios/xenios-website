import { describe, expect, it, vi } from "vitest";
import type { OriginalGuestProof, OriginalGuestProofReader } from "../../early-access/identity/original-guest-proof";
import { sha256AssistedOrderHasher } from "../defaults";
import { CUSTOMER_CAPABILITIES } from "../express";
import { requestIntentOwner } from "./service";
import { createPreparedFixtureGuestResolver } from "./prepared-fixture-guest";

const proof: OriginalGuestProof = Object.freeze({ customerRef: "eac_" + "a".repeat(32), sessionHandleHash: "b".repeat(64), expiresAtEpochMs: 12_345 });
const clock = { now: () => new Date(1_000) }, request = { headers: { cookie: "synthetic-signed-cookie" } };
function fixture(raw: unknown = proof) {
  // Deliberate negative provider-shape probe; never application authority.
  const reader = vi.fn<OriginalGuestProofReader>(async () => raw as OriginalGuestProof | null);
  return { reader, resolve: createPreparedFixtureGuestResolver(reader, clock)! };
}

describe("private original-guest projection, not fixture selection or write authority", () => {
  it("stays unavailable without the actual registered reader or explicit canonical clock", () => {
    expect(createPreparedFixtureGuestResolver(null, clock)).toBeNull();
    expect(createPreparedFixtureGuestResolver(async () => proof, null)).toBeNull();
  });
  it("preserves exact original ref/H1/actual expiry and reuses canonical H2, owner and capabilities", async () => {
    const f = fixture(), context = (await f.resolve(request))!;
    expect(f.reader).toHaveBeenCalledExactlyOnceWith(request.headers.cookie);
    expect(context.proof).toEqual(proof); expect(context.proof.expiresAtEpochMs).toBe(12_345);
    expect(context.viewer.earlyAccessSessionHash).toBe(sha256AssistedOrderHasher.hash(proof.sessionHandleHash));
    expect(context.viewer.earlyAccessSessionHash).not.toBe(proof.sessionHandleHash);
    expect(context.viewer.capabilities).toBe(CUSTOMER_CAPABILITIES);
    expect(context.viewer).toMatchObject({ actorType: "early_access_session", memberId: null, authUserId: null, normalizedEmail: null });
    expect(requestIntentOwner(context.viewer, sha256AssistedOrderHasher)).toBe(sha256AssistedOrderHasher.stableHash([
      "request-intent-owner", "session", proof.customerRef, sha256AssistedOrderHasher.hash(proof.sessionHandleHash),
    ]));
    expect(context).not.toHaveProperty("ready"); expect(context).not.toHaveProperty("selection");
    expect(context).not.toHaveProperty("continuation"); expect(context).not.toHaveProperty("witness");
  });
  it.each(["Bearer synthetic-member", "Bearer synthetic-recovery", "", "malformed"])("rejects header %j before any guest read", async authorization => {
    const f = fixture();
    await expect(f.resolve({ headers: { ...request.headers, authorization } })).rejects.toMatchObject({ status: 401 });
    expect(f.reader).not.toHaveBeenCalled();
  });
  it("keeps genuine no-proof null distinct from ordinary selection or provider failure", async () => {
    const f = fixture(null); expect(await f.resolve(request)).toBeNull(); expect(f.reader).toHaveBeenCalledTimes(1);
    f.reader.mockRejectedValueOnce(Error("private provider diagnostic"));
    await expect(f.resolve(request)).rejects.toMatchObject({ code: "request_preparation_unavailable", status: 503 });
    await expect(f.resolve(request)).resolves.toBeNull();
  });
  it.each([
    { ...proof, customerRef: "primary-or-email" }, { ...proof, sessionHandleHash: "not-H1" },
    { ...proof, expiresAtEpochMs: Number.NaN }, { ...proof, expiresAtEpochMs: Number.POSITIVE_INFINITY },
    { ...proof, expiresAtEpochMs: 1_000 }, { ...proof, expiresAtEpochMs: 999 },
    { ...proof, expiresAtEpochMs: Number.MAX_SAFE_INTEGER + 1 },
    { ...proof, aliasRefs: ["eac_" + "c".repeat(32)] },
  ])("rejects malformed, expired or promoted proof %j without fallback", async raw => {
    const f = fixture(raw); await expect(f.resolve(request)).rejects.toMatchObject({ status: 503 }); expect(f.reader).toHaveBeenCalledTimes(1);
  });
  it("does not invoke proof accessors or accept inherited identity", async () => {
    const getter = vi.fn(() => proof.customerRef), raw = { ...proof };
    Object.defineProperty(raw, "customerRef", { get: getter });
    await expect(fixture(raw).resolve(request)).rejects.toMatchObject({ status: 503 }); expect(getter).not.toHaveBeenCalled();
    await expect(fixture(Object.create(proof)).resolve(request)).rejects.toMatchObject({ status: 503 });
  });
  it("uses the actual post-read clock to deny expiry crossing, without renewing the provider bound", async () => {
    const reader = vi.fn<OriginalGuestProofReader>(async () => proof), now = vi.fn(() => new Date(proof.expiresAtEpochMs));
    await expect(createPreparedFixtureGuestResolver(reader, { now })!(request)).rejects.toMatchObject({ status: 503 });
    expect(now).toHaveBeenCalledTimes(1); expect(proof.expiresAtEpochMs).toBe(12_345);
    await expect(createPreparedFixtureGuestResolver(reader, { now: () => new Date(Number.NaN) })!(request)).rejects.toMatchObject({ status: 503 });
  });
});
