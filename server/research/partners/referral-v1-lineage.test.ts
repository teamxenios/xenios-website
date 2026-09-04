import { describe, expect, it, vi } from "vitest";
import type { ReferralLifecycleBinding } from "../../../shared/research/referral-v1";
import { readReferralV1Lineage, REFERRAL_LINEAGE_RPC, type ReferralV1LineageClient } from "./referral-v1-lineage";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const key = (n: number) => "auth:" + uid(n);
const boundAt = "2026-09-04T12:00:00.123456Z";
const binding: ReferralLifecycleBinding = { accountKey: key(1), partnerId: uid(2), linkId: uid(3), touchId: uid(4), boundAt, availability: "ready" };
const request = { accountKey: key(1), type: "request", reference: "XRR-20260904-ABCDEF0123", state: "submitted", occurredAt: "2026-09-04T12:00:01Z", boundAt, attribution: "account_binding_only" };
const order = { accountKey: key(1), type: "order", reference: uid(7), state: "checkout_pending", occurredAt: "2026-09-04T12:00:02Z", boundAt, attribution: "account_binding_only" };
const unavailable = { state: "unavailable", records: [] };
const available = (records: unknown[] = [request, order]) => ({ state: "available", records });
function database(data: unknown = available(), error: unknown = null) {
  return { rpc: vi.fn().mockResolvedValue({ data, error }) };
}

describe("Referral V1 canonical admin lineage RPC adapter", () => {
  it("uses only narrow RPC arguments and emits account-linked facts, not attribution claims", async () => {
    const db = database(available([{ ...request, affiliate_attribution_ref: binding.partnerId,
      email: "synthetic-private@example.invalid", clinicalNote: "synthetic-private", statusToken: "synthetic-private-token",
    }, { ...order, capturedAmount: 12345, providerReference: "synthetic-private-provider" }]));
    expect(await readReferralV1Lineage([binding], db)).toEqual(available([
      { accountKey: key(1), type: "order", reference: uid(7), state: "checkout_pending", occurredAt: order.occurredAt, attribution: "account_binding_only" },
      { accountKey: key(1), type: "request", reference: request.reference, state: "submitted", occurredAt: request.occurredAt, attribution: "account_binding_only" },
    ]));
    expect(db.rpc).toHaveBeenCalledExactlyOnceWith(REFERRAL_LINEAGE_RPC, { p_account_keys: [key(1)], p_limit: 100 });
  });

  it("derives chronology from the DB result, never the caller's boundAt", async () => {
    const db = database();
    const result = await readReferralV1Lineage([{ ...binding, boundAt: "2026-09-05T00:00:00Z" }], db);
    expect(result.state).toBe("available");
    expect(db.rpc.mock.calls[0][1]).not.toHaveProperty("boundAt");
    expect(JSON.stringify(result)).not.toContain('"boundAt"');
  });

  it("rejects even microsecond pre-bind records and accepts exact-bound offset timestamps", async () => {
    expect(await readReferralV1Lineage([binding], database(available([{ ...request, occurredAt: "2026-09-04T12:00:00.123455Z" }])))).toEqual(unavailable);
    const result = await readReferralV1Lineage([binding], database(available([{ ...order, occurredAt: "2026-09-04T07:00:00.123456-05:00" }])));
    expect(result.state).toBe("available");
    expect(result.records).toHaveLength(1);
  });

  it.each([null, undefined, {}, { state: "available", records: null }, unavailable])("does not invent empty success for absent/invalid data %j", async data => {
    const db = { rpc: vi.fn().mockResolvedValue({ data, error: null }) };
    expect(await readReferralV1Lineage([binding], db)).toEqual(unavailable);
  });

  it("suppresses provider errors, thrown calls, and getter failures", async () => {
    expect(await readReferralV1Lineage([binding], database(available(), { message: "synthetic-private" }))).toEqual(unavailable);
    expect(await readReferralV1Lineage([binding], { rpc: vi.fn().mockRejectedValue(new Error("synthetic-private")) })).toEqual(unavailable);
    const broken = { get rpc() { throw new Error("synthetic-private"); } } as unknown as ReferralV1LineageClient;
    expect(await readReferralV1Lineage([binding], broken)).toEqual(unavailable);
  });

  it("requires the RPC to establish readable sources even for empty input", async () => {
    expect(await readReferralV1Lineage([], null)).toEqual(unavailable);
    expect(await readReferralV1Lineage([], database(available([])))).toEqual(available([]));
    expect(await readReferralV1Lineage([], database(unavailable))).toEqual(unavailable);
  });

  it.each([
    { accountKey: uid(1) }, { accountKey: "email:synthetic@example.invalid" },
    { partnerId: "invalid" }, { linkId: "invalid" }, { touchId: "invalid" },
    { boundAt: "invalid" }, { boundAt: "2026-02-30T00:00:00Z" }, { boundAt: "2026-09-04T12:00:00.1234567Z" },
  ])("rejects invalid binding before RPC %j", async invalid => {
    const db = database();
    expect(await readReferralV1Lineage([{ ...binding, ...invalid }], db)).toEqual(unavailable);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it("rejects duplicate account bindings and more than 100 keys", async () => {
    const db = database();
    expect(await readReferralV1Lineage([binding, binding], db)).toEqual(unavailable);
    expect(await readReferralV1Lineage(Array.from({ length: 101 }, (_, i) => ({ ...binding, accountKey: key(100 + i) })), db)).toEqual(unavailable);
    expect(db.rpc).not.toHaveBeenCalled();
  });

  it.each([
    { accountKey: key(99) }, { reference: "/request?token=synthetic" },
    { state: "clinical-secret" }, { occurredAt: "not-a-date" }, { occurredAt: "2026-02-30T00:00:00Z" },
    { boundAt: "infinity" }, { attribution: "verified_canonical_ref" }, { type: "clinical" },
  ])("fails closed without partial rows for invalid canonical output %j", async invalid => {
    expect(await readReferralV1Lineage([binding], database(available([order, { ...request, ...invalid }])))).toEqual(unavailable);
  });

  it("rejects duplicate references and contradictory DB binding times", async () => {
    expect(await readReferralV1Lineage([binding], database(available([order, order])))).toEqual(unavailable);
    expect(await readReferralV1Lineage([binding], database(available([order, { ...request, boundAt: "2026-09-04T11:00:00Z" }])))).toEqual(unavailable);
  });

  it("caps per account and source, without incorrectly imposing one global 100-row cap", async () => {
    const second = { ...binding, accountKey: key(11) };
    const rows = [key(1), key(11)].flatMap((accountKey, accountIndex) =>
      Array.from({ length: 100 }, (_, i) => ({ ...order, accountKey, reference: uid(100 + accountIndex * 100 + i) })));
    const result = await readReferralV1Lineage([binding, second], database(available(rows)));
    expect(result.state).toBe("available");
    expect(result.records).toHaveLength(200);
    expect(await readReferralV1Lineage([binding, second], database(available([...rows, { ...order, reference: uid(500) }])))).toEqual(unavailable);
  });
});
