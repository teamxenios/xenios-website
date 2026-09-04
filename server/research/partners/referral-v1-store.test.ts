import { describe, expect, it, vi } from "vitest";
import { createSupabaseReferralV1Store, REFERRAL_V1_SCHEMA_VERSION, type ReferralV1Link } from "./referral-v1-store";

const actor = "00000000-0000-4000-8000-000000000001";
const link: ReferralV1Link = {
  id: "00000000-0000-4000-8000-000000000002", internalCode: "00000000-0000-4000-8000-000000000002",
  partnerId: "00000000-0000-4000-8000-000000000003", tokenKeyVersion: 1, tokenHashHex: "a".repeat(64), destinationPath: "/health",
  createdAt: "2026-09-04T00:00:00+00:00", expiresAt: "2026-10-04T00:00:00+00:00", revokedAt: null,
  availability: "ready", captureCount: 0, bindingCount: 0,
};
const issue = { actorAuthUserId: actor, idempotencyKey: "synthetic_request_01", linkId: link.id, tokenHashHex: "a".repeat(64), tokenKeyVersion: 1, destinationPath: "/health", expiresInDays: 30 as const };
const authority = { ok: true, value: { schemaVersion: REFERRAL_V1_SCHEMA_VERSION } };
function transport(data: unknown) {
  const rpc = vi.fn().mockResolvedValueOnce({ data: authority, error: null }).mockResolvedValue({ data, error: null });
  return { rpc, store: createSupabaseReferralV1Store({ rpc }) };
}

describe("Gen2 referral durable RPC adapter", () => {
  it("probes exact authority and sends verified actor plus bounded issue inputs", async () => {
    const { store, rpc } = transport({ ok: true, value: { link, created: true } });
    expect(await store.issue(issue)).toEqual({ ok: true, value: { link, created: true } });
    expect(rpc.mock.calls).toEqual([
      ["research_referral_v1_authority", undefined],
      ["research_referral_v1_execute", { p_operation: "issue", p_input: issue }],
    ]);
  });

  it.each([null, {}, { ok: true, value: { schemaVersion: "stale" } }, { ...authority, secret: "never expose" }])("fails closed on missing/drifted authority %j", async (data) => {
    const rpc = vi.fn().mockResolvedValue({ data, error: null });
    expect(await createSupabaseReferralV1Store({ rpc }).issue(issue)).toEqual({ ok: false, reason: "unavailable" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("does not log or expose thrown/provider errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const rpc = vi.fn().mockRejectedValue(new Error("provider payload that must not escape"));
    expect(await createSupabaseReferralV1Store({ rpc }).authority()).toEqual({ ok: false, reason: "unavailable" });
    rpc.mockResolvedValue({ data: authority, error: { message: "private provider response" } });
    expect(await createSupabaseReferralV1Store({ rpc }).authority()).toEqual({ ok: false, reason: "unavailable" });
    expect(log).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it.each([
    { actorAuthUserId: "member_abc" }, { actorAuthUserId: "test@example.invalid" },
    { linkId: "not-a-uuid" }, { tokenHashHex: "opaque-url-token" }, { tokenKeyVersion: 2 },
    { expiresInDays: 31 }, { destinationPath: "//evil.invalid" }, { destinationPath: "/research/member/products/.." },
    { destinationPath: "/research/member/products/%2e%2e" }, { destinationPath: "/research/organizations" },
    { destinationPath: "/health?token=secret" }, { idempotencyKey: "tiny" }, { partnerId: link.partnerId },
  ])("rejects unsafe/extra issue input without a network call %j", async (change) => {
    const { store, rpc } = transport(null);
    expect(await store.issue({ ...issue, ...change } as typeof issue)).toEqual({ ok: false, reason: "invalid_input" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { rawToken: "never-allowed" }, { customerEmail: "synthetic@example.invalid" },
    { internalCode: actor }, { destinationPath: "https://evil.invalid" }, { captureCount: -1 },
    { bindingCount: 1 }, { createdAt: "yesterday" }, { expiresAt: "2027-01-01T00:00:00Z" },
  ])("refuses malformed or expanded database link projection %j", async (change) => {
    const { store } = transport({ ok: true, value: { link: { ...link, ...change }, created: true } });
    expect(await store.issue(issue)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("accepts only closed denials", async () => {
    const good = transport({ ok: false, reason: "idempotency_conflict" });
    expect(await good.store.issue(issue)).toEqual({ ok: false, reason: "idempotency_conflict" });
    const bad = transport({ ok: false, reason: "database relation secret_customer missing" });
    expect(await bad.store.issue(issue)).toEqual({ ok: false, reason: "unavailable" });
  });

  it("preserves retained ineligible capture but never approves a newly ineligible capture", async () => {
    const touch = { touchId: actor, linkId: link.id, partnerId: link.partnerId, subjectKeyHash: "b".repeat(64), capturedAt: link.createdAt, expiresAt: link.expiresAt };
    const retained = transport({ ok: true, value: { touch, created: false, availability: "revoked" } });
    expect(await retained.store.capture({ tokenHashHex: issue.tokenHashHex, subjectKeyHash: touch.subjectKeyHash })).toEqual({ ok: true, value: { touch, created: false, availability: "revoked" } });
    const bad = transport({ ok: true, value: { touch, created: true, availability: "revoked" } });
    expect(await bad.store.capture({ tokenHashHex: issue.tokenHashHex, subjectKeyHash: touch.subjectKeyHash })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("never resolves an expired link as a current incoming recommendation", async () => {
    const { store } = transport({ ok: true, value: { link: { ...link, availability: "expired" } } });
    expect(await store.resolve({ tokenHashHex: issue.tokenHashHex })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("requires explicit none for absent account binding", async () => {
    const { store } = transport({ ok: true, value: { binding: null, created: false, availability: "ready" } });
    expect(await store.getBinding({ actorAuthUserId: actor })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("projects admin actor under trusted server input and bounds each lineage collection", async () => {
    const data = { ok: true, value: { links: [], events: [], touches: [], bindings: [] } };
    const { store, rpc } = transport(data);
    expect(await store.listAdmin({ adminAuthUserId: actor, limit: 20 })).toEqual(data);
    expect(rpc.mock.calls[1][1]).toEqual({ p_operation: "listAdmin", p_input: { actorAuthUserId: actor, limit: 20 } });
    const unsafe = transport({ ok: true, value: { ...data.value, touches: [{ subjectKeyHash: "a".repeat(64) }] } });
    expect(await unsafe.store.listAdmin({ adminAuthUserId: actor })).toEqual({ ok: false, reason: "unavailable" });
  });

  it("reprobes authority for each operation rather than caching a prior positive", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: authority, error: null })
      .mockResolvedValueOnce({ data: { ok: true, value: { binding: null, created: false, availability: "none" } }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "42883" } });
    const store = createSupabaseReferralV1Store({ rpc });
    expect((await store.getBinding({ actorAuthUserId: actor })).ok).toBe(true);
    expect(await store.getBinding({ actorAuthUserId: actor })).toEqual({ ok: false, reason: "unavailable" });
    expect(rpc).toHaveBeenCalledTimes(3);
  });
});
