import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createCheckoutRecoveryPass, RECOVERY_PASS_EFFECTS, type CheckoutRecoveryPassInput, type RecoveryPassContext } from "./checkout-recovery-pass";
import type { CheckoutRecoveryOperationOptions } from "./checkout-recovery-operation";
import type { RecoveryOperationState } from "./checkout-recovery-operation-contract";
import { EXECUTION_COLUMNS } from "./persistence/checkout-executions-store";

const owner = "11111111-1111-4111-8111-111111111111";
const member = "22222222-2222-4222-8222-222222222222";
const outsider = "33333333-3333-4333-8333-333333333333";
const execution = "44444444-4444-4444-8444-444444444444";
const order = "55555555-5555-4555-8555-555555555555";
const cycle = "66666666-6666-4666-8666-666666666666";
const intent = "77777777-7777-4777-8777-777777777777";
const now = "2026-09-10T23:00:00.000Z";
const observed = "2026-09-10T20:00:00.123456+00:00";
const context = (): RecoveryPassContext => ({ environment: "staging", projectRef: "abcdefghijklmnopqrst", applicationSha: "a".repeat(40),
  approvalSha256: "b".repeat(64), expiresAt: "2026-09-10T23:30:00.000Z", effects: [...RECOVERY_PASS_EFFECTS], memberIds: [member] });
const row = (patch: Record<string, unknown> = {}) => ({ id: execution, member_id: member, request_key: "recovery_fixture_request",
  request_body_sha256: "c".repeat(64), order_id: order, phase: "authorized", version: 1, provider_reference: "pi_fixture_recovery",
  amount_cents: 1000, currency: "usd", payment_method_reference: "pm_fixture_recovery", quote_fingerprint: "fixture-quote",
  price_version: null, authorization_key: "fixture-auth-key", capture_key: "fixture-capture-key", cancel_key: "fixture-cancel-key",
  reservation_ids: [], last_provider_result: null, authorization_first_attempted_at: observed, local_commit_failure: null,
  created_at: observed, updated_at: observed, committed_at: null, settled_at: null, ...patch });

/** Real installed SDK serialization, recording fetch only. This is not SQL or a
 * managed server; the separate contact proof exercises canonical SQL effects. */
function fixture() {
  let state: RecoveryOperationState | null = null;
  let rows: ReturnType<typeof row>[] = [];
  const events: string[] = [];
  let beforeClaim: (() => void) | undefined;
  const originalFetch = vi.fn(async () => { throw new Error("network forbidden"); });
  vi.stubGlobal("fetch", originalFetch);
  // Node20 has no built-in WebSocket. The installed SDK accepts a constructor
  // at startup; this refusing constructor proves the pass never uses Realtime.
  vi.stubGlobal("WebSocket", class { constructor() { throw new Error("realtime forbidden"); } });
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input));
    expect(url.origin).toBe("https://abcdefghijklmnopqrst.supabase.co");
    const name = url.pathname.replace("/rest/v1/rpc/", "");
    if (url.pathname === "/rest/v1/research_checkout_executions") {
      expect(init?.method).toBe("GET");
      expect(url.searchParams.get("select")).toBe(EXECUTION_COLUMNS.replaceAll(" ", ""));
      expect(url.searchParams.get("member_id")).toBe(`eq.${member}`);
      expect(url.searchParams.get("request_key")).toBe("eq.recovery_fixture_request");
      events.push("execution_read");
      return Response.json(rows.length ? [rows[0]] : []);
    }
    expect(init?.method).toBe("POST");
    const args = JSON.parse(String(init?.body));
    if (name === "research_checkout_executions_list_recoverable") {
      events.push("discovery");
      return Response.json(state?.after ? [] : rows);
    }
    expect(name).toBe("research_checkout_recovery_operation");
    const action = args.p_action; events.push(action);
    if (action === "read") return Response.json(state ? { status: "read", state } : { status: "absent" });
    if (action === "claim") {
      beforeClaim?.();
      state = { schemaVersion: 1, owner: args.p_owner, fence: "1", cycleId: cycle, before: "2026-09-10T22:55:00.000Z",
        leaseUntil: "2026-09-10T23:02:00.000Z", after: null, pending: state?.pending ?? null, exhausted: false };
      return Response.json({ status: "acquired", state });
    }
    expect(state).not.toBeNull();
    if (action === "begin") state!.pending = { ...args.p_data, memberId: rows[0].member_id, orderId: order, requestKey: rows[0].request_key };
    else if (action === "complete") { state!.after = { executionId: state!.pending!.executionId, updatedAt: state!.pending!.observedUpdatedAt }; state!.pending = null; }
    else if (action === "exhaust") state!.exhausted = true;
    else if (action === "release") { state!.owner = null; state!.leaseUntil = null; }
    else expect(action).toBe("renew");
    return Response.json({ status: "ok", state });
  });
  const authorize = vi.fn(async () => structuredClone(config.context));
  const connect = vi.fn(() => createClient(`https://${config.context.projectRef}.supabase.co`, "fixture-client-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: transport },
  }));
  const payment = { retrievePayment: vi.fn(async () => ({ ok: false as const, code: "RETRYABLE" as const, message: "synthetic unknown provider" })),
    cancelAuthorization: vi.fn(async () => ({ ok: true as const, value: undefined })) };
  const config: CheckoutRecoveryPassInput = { enabled: true, context: context(), authorize, connect, payment, now: () => new Date(now), newId: () => intent };
  const setForeignPending = () => {
    state = { schemaVersion: 1, owner: null, fence: "1", cycleId: cycle, before: "2026-09-10T22:55:00.000Z", leaseUntil: null,
      after: null, exhausted: false, pending: { intentId: intent, executionId: execution, memberId: outsider, orderId: order,
        requestKey: "recovery_fixture_request", observedUpdatedAt: observed, observedPhase: "authorized", decision: "settle" } };
  };
  return { config, authorize, connect, payment, transport, originalFetch, events, setForeignPending,
    setRows(value: ReturnType<typeof row>[]) { rows = value; }, setClaimRace() { beforeClaim = setForeignPending; },
    state: () => structuredClone(state), run: () => createCheckoutRecoveryPass(config).runOnce({ owner }) };
}
afterEach(() => vi.unstubAllGlobals());

describe("bounded recovery pass entry gates", () => {
  it("construction is inert, and disabled invocation does not even authorize or connect", async () => {
    const f = fixture(); f.config.enabled = false;
    const pass = createCheckoutRecoveryPass(f.config);
    expect(Object.keys(pass)).toEqual(["runOnce"]);
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
    expect(await pass.runOnce({ owner })).toMatchObject({ ok: false, status: "disabled", attempted: 0 });
    expect(f.authorize).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled(); expect(f.transport).not.toHaveBeenCalled();
  });
  it.each([null, {}, { owner: { toString: () => owner } }, { owner, extra: true }, { owner, maxPages: null },
    { owner, pageSize: 201 }, { owner, maxAttempts: 0 }, { owner, maxPages: 51 }])("refuses malformed options before authorization (%#)", async options => {
    const f = fixture(); const result = await createCheckoutRecoveryPass(f.config).runOnce(options as CheckoutRecoveryOperationOptions);
    expect(result).toMatchObject({ ok: false, status: "failed", attempted: 0 }); expect(f.authorize).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([
    { environment: { toString: () => "staging" } }, { environment: "preview" }, { projectRef: "wrong" }, { applicationSha: "a".repeat(39) },
    { approvalSha256: "B".repeat(64) }, { expiresAt: now }, { expiresAt: "2026-02-30T23:30:00.000Z" }, { expiresAt: "infinity" },
    { effects: RECOVERY_PASS_EFFECTS.slice(1) }, { effects: [...RECOVERY_PASS_EFFECTS, "send_notifications"] },
    { effects: [RECOVERY_PASS_EFFECTS[0], ...RECOVERY_PASS_EFFECTS.slice(0, 3)] }, { memberIds: [] }, { memberIds: [member, member] },
    { memberIds: ["other"] }, { extra: true },
  ])("refuses invalid authority context before construction (%#)", async patch => {
    const f = fixture(); Object.assign(f.config.context, patch);
    expect(await f.run()).toMatchObject({ ok: false, status: "failed", attempted: 0 }); expect(f.authorize).not.toHaveBeenCalled(); expect(f.connect).not.toHaveBeenCalled();
  });
  it.each([{ environment: "production" }, { projectRef: "zzzzzzzzzzzzzzzzzzzz" }, { applicationSha: "d".repeat(40) },
    { approvalSha256: "e".repeat(64) }, { expiresAt: "2026-09-10T23:31:00.000Z" }, { memberIds: "all" }])(
    "refuses a fresh mismatched binding before connecting (%#)", async patch => {
      const f = fixture(); f.authorize.mockImplementation(async () => ({ ...context(), ...patch }) as RecoveryPassContext);
      expect(await f.run()).toMatchObject({ ok: false, status: "failed", attempted: 0 }); expect(f.connect).not.toHaveBeenCalled();
    });
  it("suppresses private authorization and connection exceptions", async () => {
    const f = fixture(); f.authorize.mockRejectedValue(new Error("private authorization material"));
    expect(JSON.stringify(await f.run())).not.toContain("private");
    f.authorize.mockResolvedValue(context()); f.connect.mockImplementation(() => { throw new Error("private database material"); });
    expect(JSON.stringify(await f.run())).not.toContain("private");
  });
});

describe("actual SDK and executor contact with network-denied recording fetch", () => {
  it("runs one empty bounded durable pass without Auth, row writes or provider calls", async () => {
    const f = fixture(); expect(await f.run()).toMatchObject({ ok: true, status: "exhausted", attempted: 0 });
    expect(f.events).toEqual(["read", "claim", "discovery", "renew", "exhaust", "release"]);
    expect(f.authorize).toHaveBeenCalledTimes(7); expect(f.payment.retrievePayment).not.toHaveBeenCalled();
    expect(f.payment.cancelAuthorization).not.toHaveBeenCalled(); expect(f.originalFetch).not.toHaveBeenCalled();
  });
  it("uses exact managed microseconds and actual executor inspection; unknown provider never settles", async () => {
    const f = fixture(); f.setRows([row()]);
    expect(await f.run()).toMatchObject({ ok: true, status: "exhausted", attempted: 1, recorded: 1, escalated: 1, settled: 0 });
    expect(f.payment.retrievePayment).toHaveBeenCalledExactlyOnceWith("pi_fixture_recovery");
    expect(f.payment.cancelAuthorization).not.toHaveBeenCalled(); expect(f.state()?.after?.updatedAt).toBe(observed);
    expect(f.events.filter(x => x === "execution_read")).toHaveLength(2); expect(f.originalFetch).not.toHaveBeenCalled();
  });
  it("rejects a complete mixed-member page before any intent or provider effect", async () => {
    const f = fixture(); f.setRows([row(), row({ id: "88888888-8888-4888-8888-888888888888", member_id: outsider })]);
    expect(await f.run()).toMatchObject({ ok: false, code: "discovery_failed", attempted: 0, recorded: 0 });
    expect(f.events).not.toContain("begin"); expect(f.payment.retrievePayment).not.toHaveBeenCalled(); expect(f.state()?.owner).toBeNull();
  });
  it("refuses already-pending foreign work before claiming the global lease", async () => {
    const f = fixture(); f.setForeignPending();
    expect(await f.run()).toMatchObject({ ok: false, code: "claim_failed", attempted: 0 }); expect(f.events).toEqual(["read"]);
  });
  it("releases the acknowledged lease when foreign pending work wins the read/claim race", async () => {
    const f = fixture(); f.setClaimRace();
    expect(await f.run()).toMatchObject({ ok: false, code: "read_failed", resumed: 1, attempted: 0, releaseFailed: false });
    expect(f.events).toEqual(["read", "claim", "release"]); expect(f.state()?.owner).toBeNull();
    expect(f.state()?.pending?.memberId).toBe(outsider); expect(f.payment.retrievePayment).not.toHaveBeenCalled();
  });
  it("rechecks authorization for each operation and reports unreleased ownership if authority expires", async () => {
    const f = fixture(); f.authorize.mockImplementation(async () => {
      if (f.events.includes("claim")) throw new Error("private revoked approval");
      return context();
    });
    expect(await f.run()).toMatchObject({ ok: false, code: "discovery_failed", releaseFailed: true, attempted: 0 });
    expect(f.events).toEqual(["read", "claim"]); expect(f.state()?.owner).toBe(owner); expect(f.payment.retrievePayment).not.toHaveBeenCalled();
  });
  it("canonicalizes effect/member ordering but never broadens the approved scope", async () => {
    const f = fixture(); f.config.context.memberIds = [outsider, member];
    f.authorize.mockImplementation(async () => ({ ...context(), effects: [...RECOVERY_PASS_EFFECTS].reverse(), memberIds: [member, outsider] }));
    expect(await f.run()).toMatchObject({ ok: true, status: "exhausted" }); expect(f.originalFetch).not.toHaveBeenCalled();
  });
});
