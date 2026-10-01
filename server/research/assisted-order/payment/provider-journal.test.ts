import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { AssistedProviderJournalService, buildAssistedProviderJournal, type AssistedProviderJournalSource } from "./provider-journal";
import type { AssistedOrderViewer } from "../ports";
import type { SupabaseRpcClient, SupabaseRpcResponse } from "../supabase-repository";

const id = (n: number) => `a0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const REQUEST = id(1), QUOTE = id(2), ACCEPTANCE = id(3), ACTOR = id(4), ATTEMPT = id(5);
const WHEN = "2026-10-01T09:00:00.000Z";
const scope = { provider: "synthetic", accountId: "synthetic-account", mode: "test" as const };
const command = { quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE };
const viewer: AssistedOrderViewer = { actorType: "admin", authUserId: ACTOR, memberId: null,
  earlyAccessSessionHash: null, normalizedEmail: null, capabilities: new Set(["assisted_orders:manage"]) };
const authority = { schemaVersion: "assisted_order_provider_journal_v1", settlementEnabled: false, refundEnabled: false, liveExecutionEnabled: false };
const attempt = { schemaVersion: "assisted_order_provider_attempt_v1", attemptId: ATTEMPT, requestId: REQUEST,
  ...command, sourceId: "synthetic-source", expectedAmountCents: 16927, currency: "USD", state: "held", reservedAt: WHEN, replayed: false };
const event = () => ({ ...scope, eventId: "synthetic-event", providerPaymentId: "synthetic-payment", providerSessionId: null,
  attemptId: ATTEMPT, requestId: REQUEST, quoteId: QUOTE, quoteVersion: 1, acceptanceId: ACCEPTANCE,
  canonicalOrderId: null, kind: "captured", observedAmountCents: 16927, currency: "USD", occurredAt: WHEN, adjustmentId: null });
const receipt = { schemaVersion: "assisted_order_provider_journal_receipt_v1", journalId: id(6), sourceId: "synthetic-source",
  state: "held", classification: "bound", reason: "exact_binding", requestId: REQUEST, attemptId: ATTEMPT, receivedAt: WHEN, replayed: false };
const envelope = () => ({ rawBody: new TextEncoder().encode('{"synthetic":"original exact bytes"}'),
  headers: { "x-synthetic-signature": "synthetic-only" } });

function setup(options: { normalized?: unknown; noSource?: boolean; authenticated?: boolean; authority?: unknown;
  reservation?: unknown; journal?: unknown; failure?: SupabaseRpcResponse["error"] } = {}) {
  const rpc = vi.fn<SupabaseRpcClient["rpc"]>(async (name) => {
    if (options.failure) return { data: null, error: options.failure };
    const data = name === "research_assisted_order_provider_journal_authority" ? (options.authority ?? authority)
      : name === "research_assisted_order_provider_attempt_reserve" ? (options.reservation ?? attempt)
        : name === "research_assisted_order_provider_event_append" ? (options.journal ?? receipt)
          : { schemaVersion: "assisted_order_provider_uncertainty_v1", requestId: REQUEST, held: true, reason: "provider_attempt_held" };
    return { data, error: null };
  });
  const authenticateEvent = vi.fn<AssistedProviderJournalSource["authenticateEvent"]>(async () =>
    options.authenticated === false ? { ok: false, code: "REJECTED", message: "synthetic private signature", retryable: false }
      : { ok: true, value: options.normalized ?? event() });
  const source: AssistedProviderJournalSource = { sourceId: "synthetic-source", adapterRevision: "synthetic-v1", scope, authenticateEvent };
  const service = new AssistedProviderJournalService({ rpc }, options.noSource ? null : source);
  return { service, rpc, source, authenticateEvent };
}

describe("durable held provider service, no live transport", () => {
  it("requires explicit composition and an actual configured source", () => {
    const h = setup();
    expect(buildAssistedProviderJournal({ enabled: false, rpc: { rpc: h.rpc }, source: h.source })).toBeNull();
    expect(buildAssistedProviderJournal({ enabled: true, rpc: { rpc: h.rpc }, source: null })).toBeNull();
    expect(buildAssistedProviderJournal({ enabled: true, rpc: null, source: h.source })).toBeNull();
    expect(buildAssistedProviderJournal({ enabled: true, rpc: { rpc: h.rpc }, source: h.source })).toBeInstanceOf(AssistedProviderJournalService);
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("binds the server actor, source and stable key, leaving economics to SQL", async () => {
    const h = setup();
    expect(await h.service.reserveHeld(viewer, REQUEST, command)).toEqual(attempt);
    await h.service.reserveHeld(viewer, REQUEST, command);
    const calls = h.rpc.mock.calls.filter(([name]) => name.endsWith("attempt_reserve"));
    expect(calls[0]).toEqual(calls[1]);
    expect(calls[0][1]).toEqual({ p_request_id: REQUEST, p_quote_id: QUOTE, p_quote_version: 1,
      p_acceptance_id: ACCEPTANCE, p_source_id: "synthetic-source", p_actor_auth_user_id: ACTOR,
      p_adapter_revision: "synthetic-v1", p_expected_scope: scope,
      p_idempotency_key: expect.stringMatching(/^[a-f0-9]{64}$/) });
    expect(h.authenticateEvent).not.toHaveBeenCalled();
  });

  it.each(["amountCents", "currency", "sourceId", "provider", "actorAuthUserId", "idempotencyKey", "paid", "verified"])(
    "refuses browser authority field %s", async (field) => {
      const h = setup();
      await expect(h.service.reserveHeld(viewer, REQUEST, { ...command, [field]: "untrusted" })).rejects.toThrow();
      expect(h.rpc).not.toHaveBeenCalled();
    });

  it.each([{ actorType: "member" }, { authUserId: null }, { authUserId: "not-auth" }, { capabilities: new Set() }])(
    "refuses an unverified or wrong actor before RPC %#", async (patch) => {
      const h = setup();
      await expect(h.service.reserveHeld({ ...viewer, ...patch } as AssistedOrderViewer, REQUEST, command)).rejects.toThrow();
      expect(h.rpc).not.toHaveBeenCalled();
    });

  it.each([{ noSource: true }, { authority: { ...authority, liveExecutionEnabled: true } },
    { reservation: { ...attempt, state: "paid" } }, { reservation: { ...attempt, requestId: id(99) } },
    { reservation: { ...attempt, expectedAmountCents: 0 } }, { reservation: { ...attempt, sourceId: "other" } },
    { reservation: { ...attempt, secret: "not allowed" } }])("holds invalid composition or response %#", async (options) => {
    const h = setup(options);
    await expect(h.service.reserveHeld(viewer, REQUEST, command)).rejects.toThrow();
  });

  it("has no source default and never creates a journal from a signed-out/browser authentication claim", async () => {
    const off = setup({ noSource: true });
    expect(await off.service.receiveAuthenticated(envelope())).toEqual({ ok: false, code: "unavailable" });
    expect(off.rpc).not.toHaveBeenCalled();
    const h = setup({ authenticated: false });
    expect(await h.service.receiveAuthenticated({ ...envelope(), rawBody: new TextEncoder().encode('{"verified":true}') }))
      .toEqual({ ok: false, code: "unauthenticated" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("authenticates exact bytes and stores only digest and closed normalized facts", async () => {
    const h = setup({ normalized: { ...event(), rawBody: "private data", clientSecret: "private secret", headers: { signature: "private" } } });
    const input = envelope();
    expect(await h.service.receiveAuthenticated(input)).toEqual({ ok: true, receipt });
    expect(h.authenticateEvent.mock.calls[0][0].rawBody).toEqual(input.rawBody);
    expect(h.authenticateEvent.mock.calls[0][0].rawBody).not.toBe(input.rawBody);
    const stored = h.rpc.mock.calls.find(([name]) => name.endsWith("event_append"))![1]!;
    expect(stored).toEqual({ p_source_id: "synthetic-source", p_adapter_revision: "synthetic-v1", p_expected_scope: scope, p_event: {
      schemaVersion: "assisted_order_provider_event_v1", eventId: "synthetic-event",
      payloadSha256: createHash("sha256").update(input.rawBody).digest("hex"), kind: "captured", occurredAt: WHEN,
      claimedAttemptId: ATTEMPT, claimedRequestId: REQUEST, claimedQuoteId: QUOTE, claimedQuoteVersion: 1,
      claimedAcceptanceId: ACCEPTANCE, claimedCanonicalOrderId: null, providerPaymentId: "synthetic-payment",
      providerSessionId: null, adjustmentId: null, observedAmountCents: 16927, currency: "USD",
    } });
    expect(JSON.stringify(stored)).not.toMatch(/private|synthetic-only|original exact bytes/);
  });

  it.each([{ observedAmountCents: 1 }, { currency: "EUR" }, { requestId: id(98) }, { attemptId: id(99) },
    { kind: "refunded", adjustmentId: "refund-event" }, { kind: "dispute_opened" }])(
    "persists authenticated mismatched or unsupported financial facts for SQL quarantine %#", async (patch) => {
      const h = setup({ normalized: { ...event(), ...patch }, journal: { ...receipt, classification: "quarantined", requestId: null, attemptId: null, reason: "binding_mismatch" } });
      expect((await h.service.receiveAuthenticated(envelope())).ok).toBe(true);
      expect(h.rpc).toHaveBeenCalledWith("research_assisted_order_provider_event_append", expect.any(Object));
    });

  it("quarantines malformed authenticated facts without leaking them or guessing identity", async () => {
    const h = setup({ normalized: { ...event(), eventId: "\nsecret", attemptId: "not-uuid", observedAmountCents: -100,
      kind: "anything", occurredAt: "not-date", currency: "usd" },
      journal: { ...receipt, classification: "quarantined", requestId: null, attemptId: null, reason: "missing_event_identity" } });
    expect((await h.service.receiveAuthenticated(envelope())).ok).toBe(true);
    expect(h.rpc.mock.calls[1][1]?.p_event).toMatchObject({ eventId: null, claimedAttemptId: null,
      observedAmountCents: null, kind: "unknown", occurredAt: null, currency: null });
  });

  it.each([{ canonicalOrderId: "not-an-order" }, { adjustmentId: "\nnot-an-adjustment" }, { providerSessionId: {} }])(
    "does not silently erase a malformed optional financial claim %#", async (patch) => {
      const h = setup({ normalized: { ...event(), ...patch },
        journal: { ...receipt, classification: "quarantined", reason: "unsupported_financial_effect" } });
      expect((await h.service.receiveAuthenticated(envelope())).ok).toBe(true);
      expect(h.rpc.mock.calls[1][1]?.p_event).toMatchObject({ kind: "unknown" });
    });

  it.each([{ provider: "other" }, { accountId: "other-account" }, { mode: "live" }])(
    "quarantines adapter scope mismatch with all bindings stripped %#", async (patch) => {
      const h = setup({ normalized: { ...event(), ...patch },
        journal: { ...receipt, classification: "quarantined", requestId: null, attemptId: null, reason: "unknown_attempt" } });
      expect((await h.service.receiveAuthenticated(envelope())).ok).toBe(true);
      expect(h.rpc.mock.calls[1][1]?.p_event).toMatchObject({ kind: "unknown", claimedRequestId: null,
        claimedAttemptId: null, providerPaymentId: null, observedAmountCents: null });
    });

  it.each([new Uint8Array(), new Uint8Array(262_145)])("refuses invalid envelope bounds before authentication", async (rawBody) => {
    const h = setup();
    expect(await h.service.receiveAuthenticated({ ...envelope(), rawBody })).toEqual({ ok: false, code: "invalid_envelope" });
    expect(h.authenticateEvent).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not bind a digest to bytes mutated by the authenticator", async () => {
    const h = setup();
    h.authenticateEvent.mockImplementation(async (input) => { input.rawBody[0] = 0; return { ok: true, value: event() }; });
    expect(await h.service.receiveAuthenticated(envelope())).toEqual({ ok: false, code: "unauthenticated" });
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("does not acknowledge authentication when durable persistence fails", async () => {
    const h = setup({ failure: { code: "P0001", message: "private raw evidence must not escape" } });
    const response = await h.service.receiveAuthenticated(envelope());
    expect(response).toEqual({ ok: false, code: "persistence_unavailable" });
    expect(JSON.stringify(response)).not.toMatch(/private/);
  });

  it.each(["paid", "refunded"])("never accepts a %s response as a held journal receipt", async (state) => {
    const h = setup({ journal: { ...receipt, state } });
    expect(await h.service.receiveAuthenticated(envelope())).toEqual({ ok: false, code: "persistence_unavailable" });
  });

  it("uses SQL-derived provider uncertainty separately from historical financial state", async () => {
    const h = setup();
    expect(await h.service.uncertainty(REQUEST)).toEqual({ schemaVersion: "assisted_order_provider_uncertainty_v1",
      requestId: REQUEST, held: true, reason: "provider_attempt_held" });
    expect(h.rpc).toHaveBeenCalledExactlyOnceWith("research_assisted_order_provider_uncertainty", { p_request_id: REQUEST });
  });

  it("freezes configured scope rather than adopting a later adapter mutation", async () => {
    const h = setup();
    Object.assign(h.source, { sourceId: "attacker-source", adapterRevision: "other-revision", scope: { ...scope, accountId: "other" } });
    await h.service.reserveHeld(viewer, REQUEST, command);
    expect(h.rpc.mock.calls[1][1]).toMatchObject({ p_source_id: "synthetic-source", p_adapter_revision: "synthetic-v1", p_expected_scope: scope });
  });

  it.each([
    { ...receipt, replayed: true },
    { ...receipt, classification: "conflict", reason: "event_identity_conflict", requestId: null, attemptId: null },
    { ...receipt, classification: "quarantined", reason: "source_revoked", requestId: null, attemptId: null },
  ])("acknowledges a durable held replay/conflict/revocation receipt only %#", async (journal) => {
    const h = setup({ journal });
    expect(await h.service.receiveAuthenticated(envelope())).toEqual({ ok: true, receipt: journal });
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      "research_assisted_order_provider_journal_authority", "research_assisted_order_provider_event_append",
    ]);
  });

  it("times out authentication without persisting a success or exposing provider errors", async () => {
    vi.useFakeTimers();
    try {
      const h = setup();
      h.authenticateEvent.mockImplementation(() => new Promise(() => {}));
      const pending = h.service.receiveAuthenticated(envelope());
      await vi.advanceTimersByTimeAsync(5_000);
      expect(await pending).toEqual({ ok: false, code: "unauthenticated" });
      expect(h.rpc).not.toHaveBeenCalled();
    } finally { vi.useRealTimers(); }
  });

  it.each([{ ...receipt, reason: "not-a-journal-reason" }, { ...receipt, sourceId: "other" },
    { ...receipt, state: "held", classification: "quarantined" }, { ...receipt, requestId: null },
    { ...receipt, rawPayload: "private" }])("rejects inconsistent or widened journal receipts %#", async (journal) => {
    const h = setup({ journal });
    expect(await h.service.receiveAuthenticated(envelope())).toEqual({ ok: false, code: "persistence_unavailable" });
  });
});
