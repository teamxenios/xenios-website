import { describe, expect, it, vi } from "vitest";
import { providerOk } from "../../../../shared/research/capability";
import {
  prepareAssistedProviderAttempt,
  receiveAssistedProviderEvent,
  type AssistedOrderProviderAdapter,
  type AssistedProviderAttempt,
  type AssistedProviderEventAuthority,
  type AuthenticatedAssistedProviderEvent,
  type BoundAssistedProviderEvent,
} from "./provider-adapter";

const unbound: AssistedProviderAttempt = {
  provider: "reviewed-card-provider", accountId: "merchant-1", mode: "test",
  attemptId: "attempt-1", requestId: "request-1", canonicalOrderId: null,
  quoteId: "quote-1", quoteVersion: 3, acceptanceId: "acceptance-1",
  expectedAmountCents: 16927, currency: "USD", creationKey: "attempt-1:create",
  creationStartedAt: "2026-09-30T10:00:00.000Z", creationReplayUntil: "2026-09-30T11:00:00.000Z",
  providerPaymentId: null, providerSessionId: null,
};
const bound: AssistedProviderAttempt = { ...unbound, providerPaymentId: "payment-1", providerSessionId: "session-1" };
const now = new Date("2026-09-30T10:30:00.000Z");
const fact: AuthenticatedAssistedProviderEvent = {
  provider: bound.provider, accountId: bound.accountId, mode: "test",
  eventId: "event-1", providerPaymentId: "payment-1", providerSessionId: "session-1",
  attemptId: bound.attemptId, requestId: bound.requestId, canonicalOrderId: null,
  quoteId: bound.quoteId, quoteVersion: bound.quoteVersion, acceptanceId: bound.acceptanceId,
  kind: "captured", observedAmountCents: 16927, currency: "USD",
  occurredAt: "2026-09-30T10:05:00.000Z", adjustmentId: null,
};
const envelope = { rawBody: new Uint8Array([1, 2, 3]), headers: { "provider-signature": "synthetic-only" } };

function setup(event: AuthenticatedAssistedProviderEvent = fact) {
  const adapter = {
    scope: { provider: bound.provider, accountId: bound.accountId, mode: "test" as const },
    createAttempt: vi.fn(async (_attempt: AssistedProviderAttempt) => providerOk({ providerPaymentId: "payment-1", providerSessionId: "session-1", state: "pending" as const })),
    retrieveAttempt: vi.fn(async (_attempt: AssistedProviderAttempt) => providerOk({ providerPaymentId: "payment-1", providerSessionId: "session-1", state: "authorized" as const })),
    authenticateEvent: vi.fn(async () => providerOk(event)),
    requestRefund: vi.fn(async () => providerOk({ state: "pending" as const })),
    requestCancellation: vi.fn(async () => providerOk({ state: "pending" as const })),
  } satisfies AssistedOrderProviderAdapter;
  const authority = { commit: vi.fn(async (_event: BoundAssistedProviderEvent) => ({ replayed: false })) } satisfies AssistedProviderEventAuthority;
  return { adapter, authority };
}

describe("provider-neutral assisted payment boundary (unmounted contract)", () => {
  it("has no default provider or default persistence authority", async () => {
    const { adapter, authority } = setup();
    expect(await prepareAssistedProviderAttempt(null, unbound, now)).toEqual({ ok: false, code: "unavailable" });
    expect(await receiveAssistedProviderEvent(null, bound, envelope, authority)).toEqual({ ok: false, code: "unavailable" });
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, null)).toEqual({ ok: false, code: "unavailable" });
    expect(adapter.authenticateEvent).not.toHaveBeenCalled();
  });

  it("creates from the server-reserved accepted-quote binding and fixed key without marking paid", async () => {
    const { adapter, authority } = setup();
    expect(await prepareAssistedProviderAttempt(adapter, unbound, now)).toEqual({ ok: true, value: { providerPaymentId: "payment-1", providerSessionId: "session-1", state: "pending" } });
    expect(adapter.createAttempt).toHaveBeenCalledWith(unbound);
    expect(Object.isFrozen(adapter.createAttempt.mock.calls[0][0])).toBe(true);
    expect(adapter.retrieveAttempt).not.toHaveBeenCalled();
    expect(authority.commit).not.toHaveBeenCalled();
  });

  it("recovers an existing payment by retrieval, even after creation key expiry", async () => {
    const { adapter } = setup();
    expect((await prepareAssistedProviderAttempt(adapter, bound, new Date("2026-10-05T00:00:00Z"))).ok).toBe(true);
    expect(adapter.retrieveAttempt).toHaveBeenCalledWith(bound);
    expect(adapter.createAttempt).not.toHaveBeenCalled();
  });

  it.each(["2026-09-30T09:59:59Z", "2026-09-30T11:00:00Z", "2026-10-01T00:00:00Z"])("does not replay a missing-reference create outside the explicit guarantee: %s", async (at) => {
    const { adapter } = setup();
    expect(await prepareAssistedProviderAttempt(adapter, unbound, new Date(at))).toEqual({ ok: false, code: "creation_uncertain" });
    expect(adapter.createAttempt).not.toHaveBeenCalled();
  });

  it("does not invent a no-funds outcome on an interrupted create", async () => {
    const { adapter } = setup();
    adapter.createAttempt.mockRejectedValueOnce(new Error("private provider response"));
    expect(await prepareAssistedProviderAttempt(adapter, unbound, now)).toEqual({ ok: false, code: "creation_uncertain" });
  });

  it("treats a provider refusal after create as uncertain, not proof no payment exists", async () => {
    const { adapter } = setup();
    adapter.createAttempt.mockResolvedValueOnce({ ok: false, code: "RETRYABLE", message: "private response", retryable: true });
    expect(await prepareAssistedProviderAttempt(adapter, unbound, now)).toEqual({ ok: false, code: "creation_uncertain" });
  });

  it.each([
    { accountId: "" }, { provider: "" }, { acceptanceId: "" }, { quoteVersion: 0 },
    { expectedAmountCents: 0 }, { currency: "usd" }, { creationKey: "" },
    { creationReplayUntil: "not-a-date" }, { providerSessionId: "session-with-no-payment" },
  ])("refuses incomplete attempt binding before network: %j", async (change) => {
    const { adapter } = setup();
    expect(await prepareAssistedProviderAttempt(adapter, { ...unbound, ...change }, now)).toEqual({ ok: false, code: "invalid_attempt" });
    expect(adapter.createAttempt).not.toHaveBeenCalled();
  });

  it("refuses a changed provider session on retrieval", async () => {
    const { adapter } = setup();
    adapter.retrieveAttempt.mockResolvedValueOnce(providerOk({ providerPaymentId: "payment-1", providerSessionId: "foreign-session", state: "authorized" }));
    expect(await prepareAssistedProviderAttempt(adapter, bound, now)).toEqual({ ok: false, code: "binding_mismatch" });
  });

  it("authenticates original bytes before passing an allowlisted bound fact to authority", async () => {
    const { adapter, authority } = setup({ ...fact, clientSecret: "must-not-persist", rawProviderData: "must-not-persist" } as AuthenticatedAssistedProviderEvent);
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: true, value: { replayed: false } });
    expect(adapter.authenticateEvent).toHaveBeenCalledWith(envelope);
    const recorded = authority.commit.mock.calls[0][0];
    expect(recorded).toMatchObject({ ...fact, expectedAmountCents: 16927 });
    expect(recorded).not.toHaveProperty("clientSecret");
    expect(recorded).not.toHaveProperty("rawProviderData");
    expect(recorded).not.toHaveProperty("rawBody");
    expect(recorded.eventKey).toMatch(/^[a-f0-9]{64}$/);
    expect(recorded.paymentEvidenceKey).toMatch(/^[a-f0-9]{64}$/);
    expect(recorded.payloadFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(recorded)).toBe(true);
  });

  it("does not consume unauthenticated input or expose provider failure text", async () => {
    const { adapter, authority } = setup();
    adapter.authenticateEvent.mockRejectedValueOnce(new Error("secret raw body"));
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: false, code: "unauthenticated" });
    expect(authority.commit).not.toHaveBeenCalled();
  });

  it.each([
    { provider: "other" }, { accountId: "other" }, { mode: "live" },
    { providerPaymentId: "other" }, { providerSessionId: null },
    { attemptId: "other" }, { requestId: "other" }, { canonicalOrderId: "other" },
    { quoteId: "other" }, { quoteVersion: 4 }, { acceptanceId: "other" },
    { currency: "EUR" }, { currency: "usd" },
  ])("refuses authenticated but unrelated money: %j", async (change) => {
    const { adapter, authority } = setup({ ...fact, ...change } as AuthenticatedAssistedProviderEvent);
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: false, code: "binding_mismatch" });
    expect(authority.commit).not.toHaveBeenCalled();
  });

  it.each([16926, 16928, 0, 1.5, Number.NaN])("requires exact integer settlement cents: %s", async (amount) => {
    const { adapter, authority } = setup({ ...fact, observedAmountCents: amount });
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: false, code: "invalid_event" });
    expect(authority.commit).not.toHaveBeenCalled();
  });

  it.each(["refunded", "dispute_opened", "dispute_won", "dispute_lost"] as const)("accepts a bounded partial %s fact separately from full settlement", async (kind) => {
    const { adapter, authority } = setup({ ...fact, kind, observedAmountCents: 100, adjustmentId: "adjustment-1" });
    expect((await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).ok).toBe(true);
    expect(authority.commit.mock.calls[0][0]).toMatchObject({ kind, observedAmountCents: 100, expectedAmountCents: 16927 });
  });

  it.each([
    { kind: "refunded", observedAmountCents: 16928, adjustmentId: "refund-1" },
    { kind: "refunded", observedAmountCents: 100, adjustmentId: null },
    { kind: "cancelled", observedAmountCents: 1 },
    { kind: "pending", observedAmountCents: 16927 },
    { kind: "some_new_provider_event" }, { occurredAt: "invalid" }, { eventId: "" },
  ])("refuses ambiguous lifecycle facts: %j", async (change) => {
    const { adapter, authority } = setup({ ...fact, ...change } as AuthenticatedAssistedProviderEvent);
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: false, code: "invalid_event" });
    expect(authority.commit).not.toHaveBeenCalled();
  });

  it("requires a persisted payment binding before event authentication", async () => {
    const { adapter, authority } = setup();
    expect(await receiveAssistedProviderEvent(adapter, unbound, envelope, authority)).toEqual({ ok: false, code: "invalid_attempt" });
    expect(adapter.authenticateEvent).not.toHaveBeenCalled();
  });

  it("defers replay and interrupted-write handling to durable atomic authority, never a volatile dedupe cache", async () => {
    const { adapter, authority } = setup();
    authority.commit.mockRejectedValueOnce(new Error("transaction rolled back"));
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: false, code: "persistence_unavailable" });
    expect((await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).ok).toBe(true);
    authority.commit.mockResolvedValueOnce({ replayed: true });
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: true, value: { replayed: true } });
    const attempts = authority.commit.mock.calls.map(([event]) => event);
    expect(attempts).toHaveLength(3);
    expect(attempts[0]).toEqual(attempts[1]);
    expect(attempts[1]).toEqual(attempts[2]);
  });

  it("holds stable event/payment uniqueness keys while changed content changes the replay fingerprint", async () => {
    const first = setup();
    const changed = setup({ ...fact, occurredAt: "2026-09-30T10:06:00Z" });
    await receiveAssistedProviderEvent(first.adapter, bound, envelope, first.authority);
    await receiveAssistedProviderEvent(changed.adapter, bound, envelope, changed.authority);
    const a = first.authority.commit.mock.calls[0][0];
    const b = changed.authority.commit.mock.calls[0][0];
    expect(a.eventKey).toBe(b.eventKey);
    expect(a.paymentEvidenceKey).toBe(b.paymentEvidenceKey);
    expect(a.payloadFingerprint).not.toBe(b.payloadFingerprint);
  });

  it("allowlists the durable receipt too", async () => {
    const { adapter, authority } = setup();
    authority.commit.mockResolvedValueOnce({ replayed: false, privateEvidence: "not-for-response" } as { replayed: boolean });
    expect(await receiveAssistedProviderEvent(adapter, bound, envelope, authority)).toEqual({ ok: true, value: { replayed: false } });
  });
});
