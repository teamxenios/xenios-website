import { afterEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  RECOVERY_OPERATION_AUTHORITY, RECOVERY_OPERATION_RPC,
  type RecoveryBeginInput, type RecoveryIntent, type RecoveryOperationState, type RecoveryOperationStore,
} from "../checkout-recovery-operation-contract";
import {
  createSupabaseCheckoutRecoveryOperationStore, RecoveryOperationStoreError, type RecoveryOperationRpcClient,
} from "./checkout-recovery-operation-store";

const owner = "11111111-1111-4111-8111-111111111111";
const otherOwner = "22222222-2222-4222-8222-222222222222";
const cycleId = "33333333-3333-4333-8333-333333333333";
const executionId = "44444444-4444-4444-8444-444444444444";
const memberId = "55555555-5555-4555-8555-555555555555";
const orderId = "66666666-6666-4666-8666-666666666666";
const intentId = "77777777-7777-4777-8777-777777777777";
const fence = "9007199254740993";
const observed = "2026-09-10T12:00:00.123456+01:00";
const before = "2026-09-10T11:55:00.000Z";
const leaseUntil = "2026-09-10T12:02:00.654321+00:00";
const input: RecoveryBeginInput = { intentId, executionId, observedUpdatedAt: observed, observedPhase: "reserved", decision: "settle" };
const pending: RecoveryIntent = { ...input, memberId, orderId, requestKey: "fixture_request_0001" };
const state = (patch: Partial<RecoveryOperationState> = {}): RecoveryOperationState => ({
  schemaVersion: 1, owner, fence, cycleId, before, leaseUntil, after: null, pending: null, exhausted: false, ...patch,
});
const response = (status: string, value = state()) => ({ status, state: value });

function fixture(data: unknown, error: unknown = null) {
  const rpc = vi.fn<RecoveryOperationRpcClient["rpc"]>(async () => ({ data, error }));
  const client: RecoveryOperationRpcClient = { rpc };
  return { rpc, client, store: createSupabaseCheckoutRecoveryOperationStore(client) };
}
type MethodCall = [string, (store: RecoveryOperationStore) => Promise<unknown>, unknown];
const methods: MethodCall[] = [
  ["read", store => store.read(), response("read")],
  ["claim", store => store.claim(owner), response("acquired")],
  ["renew", store => store.renew(owner, fence), response("ok")],
  ["begin", store => store.begin(owner, fence, input), response("ok", state({ pending }))],
  ["complete", store => store.complete(owner, fence, intentId, "left_pending"), response("ok")],
  ["exhaust", store => store.exhaust(owner, fence), response("ok", state({ exhausted: true }))],
  ["release", store => store.release(owner, fence), response("ok", state({ owner: null, leaseUntil: null }))],
];
afterEach(() => vi.unstubAllGlobals());

describe("injected recovery-operation RPC vocabulary", () => {
  it("constructs without reading a client, environment, singleton or server", () => {
    const f = fixture(null);
    expect(f.store.authority).toBe(RECOVERY_OPERATION_AUTHORITY);
    expect(f.store.durable).toBe(true);
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(methods)("uses the exact SQL action/arguments for %s", async (name, call, wire) => {
    const f = fixture(wire);
    await call(f.store);
    expect(f.rpc).toHaveBeenCalledTimes(1);
    expect(f.rpc).toHaveBeenCalledWith(RECOVERY_OPERATION_RPC, {
      p_action: name, p_owner: name === "read" ? null : owner,
      p_fence: name === "read" || name === "claim" ? null : fence,
      p_data: name === "begin" ? input : name === "complete" ? { intentId, code: "left_pending" } : {},
    });
  });
  it("uses only explicit absent as a missing read and explicit busy as contention", async () => {
    expect(await fixture({ status: "absent" }).store.read()).toBeNull();
    expect(await fixture({ status: "busy" }).store.claim(owner)).toEqual({ status: "busy" });
  });
  it("preserves bigint maximum and microseconds, including historical expired lease reads", async () => {
    const supplied = state({ fence: "9223372036854775807", leaseUntil: "2020-01-01T00:00:00.123456Z", pending });
    expect(await fixture(response("read", supplied)).store.read()).toEqual(supplied);
  });
  it("copies transport-owned nested state without depending on JSONB property ordering", async () => {
    const supplied = state({ pending, after: { executionId: otherOwner, updatedAt: "2026-09-10T11:00:00.123455Z" } });
    const reversed = Object.fromEntries(Object.entries(supplied).reverse());
    const actual = await fixture({ status: "read", state: reversed }).store.read();
    expect(actual).toEqual(supplied);
    supplied.after!.updatedAt = before;
    expect(actual!.after!.updatedAt).toBe("2026-09-10T11:00:00.123455Z");
    expect(actual!.pending).not.toBe(pending);
  });
  it.each(["settled_committed", "settled_cancelled", "left_pending", "contended", "needs_person", "vanished", "skipped", "attempt_failed"] as const)(
    "allows the closed completion code %s without adding a payload", async code => {
      const f = fixture(response("ok"));
      await f.store.complete(owner, fence, intentId, code);
      expect(f.rpc.mock.calls[0][1].p_data).toEqual({ intentId, code });
    },
  );
});

describe("recovery-operation adapter input refusal before RPC", () => {
  it.each([null, undefined, {}, { rpc: false }])("refuses an invalid injected client (%#)", client => {
    expect(() => createSupabaseCheckoutRecoveryOperationStore(client as RecoveryOperationRpcClient)).toThrow("recovery_request_invalid");
  });
  it.each(["bad-id", owner.toUpperCase().replace("11111111", "AAAAAAAA"), "{11111111-1111-4111-8111-111111111111}", "", null, undefined, 1])(
    "refuses noncanonical owner input (%#)", async invalidOwner => {
      const f = fixture(response("acquired"));
      await expect(f.store.claim(invalidOwner as string)).rejects.toThrow("recovery_request_invalid");
      expect(f.rpc).not.toHaveBeenCalled();
    },
  );
  it.each([0, 1, 1n, "0", "01", "-1", "+1", "1e3", "1.0", " 1", "1 ", "9223372036854775808", null, undefined])(
    "refuses malformed/out-of-range fencing before mutation (%#)", async invalidFence => {
      const f = fixture(response("ok"));
      await expect(f.store.renew(owner, invalidFence as string)).rejects.toThrow("recovery_request_invalid");
      expect(f.rpc).not.toHaveBeenCalled();
    },
  );
  it.each(Object.keys(input))("requires begin input field %s", async field => {
    const malformed: Record<string, unknown> = { ...input }; delete malformed[field];
    const f = fixture(response("ok", state({ pending })));
    await expect(f.store.begin(owner, fence, malformed as unknown as RecoveryBeginInput)).rejects.toThrow("recovery_request_invalid");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each([
    { intentId: "bad-id" }, { executionId: "bad-id" }, { observedPhase: "committed" }, { observedPhase: "paid" },
    { decision: "authorize" }, { observedUpdatedAt: "2026-09-10T11:00:00" },
    { observedUpdatedAt: "2026-09-10T11:00:00.1234567Z" }, { observedUpdatedAt: "2026-02-30T00:00:00Z" },
    { observedUpdatedAt: "2026-09-10T24:00:00Z" }, { observedUpdatedAt: "2026-09-10T11:00:60Z" },
    { observedUpdatedAt: "2026-09-10T11:00:00+16:00" }, { observedUpdatedAt: "2026-09-10T11:00:00+01:60" },
    { observedUpdatedAt: "2026-09-10T11:00:00z" }, { memberId }, { orderId }, { requestKey: "fixture_request_0001" },
  ])("refuses malformed/extra begin input (%#)", async patch => {
    const f = fixture(response("ok", state({ pending })));
    await expect(f.store.begin(owner, fence, { ...input, ...patch } as RecoveryBeginInput)).rejects.toThrow("recovery_request_invalid");
    expect(f.rpc).not.toHaveBeenCalled();
  });
  it.each(["2026-09-10 11:00:00.123456+00", "2026-09-10T12:00:00.123456+0100", "2026-09-10T12:00:00.123456+01:00", "2024-02-29T00:00:00Z"])(
    "transmits valid SQL timestamp spelling unchanged: %s", async observedUpdatedAt => {
      const given = { ...input, observedUpdatedAt };
      const f = fixture(response("ok", state({ pending: { ...pending, observedUpdatedAt } })));
      await f.store.begin(owner, fence, given);
      expect(f.rpc.mock.calls[0][1].p_data.observedUpdatedAt).toBe(observedUpdatedAt);
    },
  );
  it.each([
    ["invalid-id", "left_pending"], [intentId, "sent"], [intentId, ""], [intentId, null], [intentId, undefined],
  ])("refuses invalid completion input (%#)", async (id, code) => {
    const f = fixture(response("ok"));
    await expect(f.store.complete(owner, fence, id as string, code as Parameters<RecoveryOperationStore["complete"]>[3]))
      .rejects.toThrow("recovery_request_invalid");
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

describe("strict SQL acknowledgement envelopes", () => {
  for (const [name, call, valid] of methods) {
    it.each([null, undefined, [], [valid], {}, "ok", { status: "ok" }, { status: "absent", state: state() }])(
      `${name} refuses missing/array/malformed result (%#)`, async data => {
        await expect(call(fixture(data).store)).rejects.toBeInstanceOf(RecoveryOperationStoreError);
      },
    );
    it(`${name} refuses an extra response payload`, async () => {
      await expect(call(fixture({ ...(valid as object), payload: "unexpected" }).store)).rejects.toThrow("recovery_response_invalid");
    });
    it(`${name} refuses its wrong SQL status`, async () => {
      await expect(call(fixture({ ...(valid as object), status: name === "read" ? "ok" : "read" }).store)).rejects.toThrow("recovery_response_invalid");
    });
    it(`${name} rejects a success-shaped result carrying an error`, async () => {
      await expect(call(fixture(valid, { message: "private fixture error", details: "private fixture details" }).store)).rejects.toThrow("recovery_rpc_failed");
    });
  }
  it.each([null, undefined, {}, { data: response("read") }, { error: null }])("requires complete transport data/error metadata (%#)", async wire => {
    const f = fixture(null);
    f.rpc.mockResolvedValue(wire as { data: unknown; error: unknown });
    await expect(f.store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each([undefined, false, 0, "", { code: "55000", message: "private fixture lease detail" }])("accepts only explicit error:null (%#)", async error => {
    const f = fixture(response("read"));
    f.rpc.mockResolvedValue({ data: response("read"), error });
    await expect(f.store.read()).rejects.toThrow("recovery_rpc_failed");
  });
  it("sanitizes thrown transport errors without retaining a private cause", async () => {
    const f = fixture(null);
    f.rpc.mockRejectedValue(new Error("private fixture URL and SQL text"));
    const error = await f.store.read().catch(value => value);
    expect(error).toBeInstanceOf(RecoveryOperationStoreError);
    expect(error.message).toBe("recovery_rpc_failed");
    expect(error.code).toBe("recovery_rpc_failed");
    expect(error.cause).toBeUndefined();
    expect(String(error.stack)).not.toContain("private fixture");
  });
  it.each([
    ["claim", response("acquired", state({ owner: otherOwner }))],
    ["renew", response("ok", state({ owner: otherOwner }))],
    ["renew", response("ok", state({ fence: "2" }))],
    ["begin", response("ok")],
    ["complete", response("ok", state({ pending }))],
    ["exhaust", response("ok")],
    ["release", response("ok")],
    ["release", response("ok", state({ owner: null, leaseUntil: null, fence: "2" }))],
  ])("refuses impossible %s acknowledgement shape/binding", async (name, data) => {
    const call = methods.find(([method]) => method === name)![1];
    await expect(call(fixture(data).store)).rejects.toThrow("recovery_response_invalid");
  });
});

describe("strict state, intent and cursor projection", () => {
  it.each(Object.keys(state()))("requires every state field: %s", async field => {
    const value: Record<string, unknown> = { ...state() }; delete value[field];
    await expect(fixture({ status: "read", state: value }).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each([
    { schemaVersion: 2 }, { owner: "bad-id" }, { owner: null }, { leaseUntil: null },
    { cycleId: "BAD-ID" }, { fence: 1 }, { fence: "01" }, { fence: "9223372036854775808" },
    { exhausted: "false" }, { before: "2026-09-10T11:55:00.000001Z" }, { before: "2026-09-10" },
    { before: "2026-02-30T00:00:00Z" }, { leaseUntil: "2026-09-10T12:02:00.1234567Z" },
    { leaseUntil: "2026-09-10T12:02:00" }, { privatePayload: "unexpected" },
    { pending: [] }, { after: [] }, { pending: {} }, { after: {} },
  ])("refuses malformed/extra state fields (%#)", async patch => {
    await expect(fixture({ status: "read", state: { ...state(), ...patch } }).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each(Object.keys(pending))("requires every pending intent field: %s", async field => {
    const value: Record<string, unknown> = { ...pending }; delete value[field];
    await expect(fixture(response("read", state({ pending: value as unknown as RecoveryIntent }))).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each([
    { memberId: "bad" }, { orderId: "bad" }, { requestKey: "short" }, { requestKey: "x".repeat(121) },
    { observedPhase: "committed" }, { decision: "capture" }, { observedUpdatedAt: before },
    { observedUpdatedAt: "2026-09-10T11:00:00.1234567Z" }, { providerBody: {} },
  ])("refuses malformed pending intent (%#)", async patch => {
    await expect(fixture(response("read", state({ pending: { ...pending, ...patch } as RecoveryIntent }))).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each([
    { executionId: "bad", updatedAt: observed }, { executionId }, { updatedAt: observed },
    { executionId, updatedAt: before }, { executionId, updatedAt: "2026-09-10T11:55:00.000001Z" },
    { executionId, updatedAt: "2026-09-10T11:00:00" }, { executionId, updatedAt: observed, extra: true },
  ])("refuses malformed/out-of-horizon cursor (%#)", async after => {
    await expect(fixture(response("read", state({ after: after as RecoveryOperationState["after"] }))).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it("refuses pending work on an exhausted state", async () => {
    await expect(fixture(response("read", state({ pending, exhausted: true }))).store.read()).rejects.toThrow("recovery_response_invalid");
  });
  it.each(["2026-09-10T11:00:00.123456Z", "2026-09-10T11:00:00.123457Z"])(
    "rejects a pending position at or behind offset-equivalent cursor: %s", async updatedAt => {
      await expect(fixture(response("read", state({ pending, after: { executionId, updatedAt } }))).store.read()).rejects.toThrow("recovery_response_invalid");
    },
  );
  it("keeps a pending position one microsecond ahead and preserves every raw timestamp", async () => {
    const value = state({ pending, after: { executionId, updatedAt: "2026-09-10T11:00:00.123455Z" } });
    expect(await fixture(response("read", value)).store.read()).toEqual(value);
  });
  it("uses canonical UUID ordering when pending and cursor instants are equal", async () => {
    const value = state({ pending, after: { executionId: otherOwner, updatedAt: "2026-09-10T11:00:00.123456Z" } });
    expect(await fixture(response("read", value)).store.read()).toEqual(value);
    await expect(fixture(response("read", state({ pending, after: { executionId: intentId, updatedAt: "2026-09-10T11:00:00.123456Z" } }))).store.read()).rejects.toThrow("recovery_response_invalid");
  });
});

describe("installed Supabase SDK RPC contact serialization, transport denied by default", () => {
  it("serializes all seven actions through only the exact RPC path and preserves bigint/timestamp bytes", async () => {
    const origin = "https://recovery-fixture.invalid";
    const expectedPath = `/rest/v1/rpc/${RECOVERY_OPERATION_RPC}`;
    const requests: Array<{ action: string; data: Record<string, unknown>; owner: unknown; fence: unknown }> = [];
    let current = state({ owner: null, leaseUntil: null });
    let reads = 0;
    const network = vi.fn(() => { throw new Error("real network forbidden"); });
    vi.stubGlobal("fetch", network);
    vi.stubGlobal("WebSocket", class { constructor() { throw new Error("realtime transport forbidden"); } });
    const recordingFetch: typeof fetch = async (resource, options) => {
      const request = new Request(resource, options);
      const url = new URL(request.url);
      if (url.origin !== origin || url.pathname !== expectedPath || url.search !== "" || request.method !== "POST") {
        throw new Error("unexpected SDK transport request");
      }
      const body = JSON.parse(await request.text()) as Record<string, unknown>;
      expect(Object.keys(body).sort()).toEqual(["p_action", "p_data", "p_fence", "p_owner"]);
      const action = body.p_action as string;
      expect(["read", "claim", "renew", "begin", "complete", "exhaust", "release"]).toContain(action);
      requests.push({ action, data: body.p_data as Record<string, unknown>, owner: body.p_owner, fence: body.p_fence });
      let data: unknown;
      if (action === "read") data = reads++ === 0 ? { status: "absent" } : response("read", current);
      else if (action === "claim") { current = state(); data = response("acquired", current); }
      else {
        if (action === "begin") current = { ...current, pending: { ...(body.p_data as unknown as RecoveryBeginInput), memberId, orderId, requestKey: pending.requestKey } };
        if (action === "complete") current = { ...current, pending: null, after: { updatedAt: observed, executionId } };
        if (action === "exhaust") current = { ...current, exhausted: true };
        if (action === "release") current = { ...current, owner: null, leaseUntil: null };
        data = response("ok", current);
      }
      return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
    };
    const sdk = createClient(origin, "fixture-only", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { fetch: recordingFetch },
    });
    // Compile-time compatibility with the actual installed SDK: no any/client cast.
    const client: RecoveryOperationRpcClient = sdk;
    const store = createSupabaseCheckoutRecoveryOperationStore(client);
    expect(await store.read()).toBeNull();
    expect(await store.claim(owner)).toEqual({ status: "acquired", state: state() });
    await store.renew(owner, fence);
    expect((await store.begin(owner, fence, input)).pending).toEqual(pending);
    await store.complete(owner, fence, intentId, "left_pending");
    await store.exhaust(owner, fence);
    await store.release(owner, fence);
    expect(await store.read()).toEqual(current);
    expect(requests.map(request => request.action)).toEqual(["read", "claim", "renew", "begin", "complete", "exhaust", "release", "read"]);
    for (const request of requests) {
      expect(request.owner).toBe(request.action === "read" ? null : owner);
      expect(request.fence).toBe(request.action === "read" || request.action === "claim" ? null : fence);
      if (!["begin", "complete"].includes(request.action)) expect(request.data).toEqual({});
    }
    expect(requests.find(request => request.action === "begin")!.data).toEqual(input);
    expect(requests.find(request => request.action === "complete")!.data).toEqual({ intentId, code: "left_pending" });
    expect(network).not.toHaveBeenCalled();
  });
});
