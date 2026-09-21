import { describe, expect, it, vi } from "vitest";
import { createAssistedMemberHistoryReader, withAssistedOrderRequestHistory, ASSISTED_MEMBER_HISTORY_RPC } from "./member-order-history";
import { createCommerceOrdersPort } from "../customer-account/orders-projection";
import { registerCommerceApi, type CommerceDependencies } from "../commerce/routes";

const member = "10000000-0000-4000-8000-000000000001";
const other = "10000000-0000-4000-8000-000000000002";
const disconnected = { connected: false, complete: false };
const complete = { connected: true, complete: true };
const row = () => ({
  actorMemberId: member, kind: "assisted_request", requestId: "20000000-0000-4000-8000-000000000001",
  publicReference: "XRR-20260921-ABCDEF1234", status: "shipped", createdAt: "2026-09-21T10:00:00.000Z",
  updatedAt: "2026-09-21T11:00:00.000Z", estimatedTotalCents: null, currency: "USD",
  lines: [{ productName: "Synthetic request", specification: null, quantity: 1, lineEstimateCents: null }],
  trackingReference: "SYNTHETIC-REFERENCE",
});
const envelope = () => ({ schemaVersion: "assisted_member_history_v1", memberId: member, complete: true, requests: [row()] });
const rpcFor = (data: unknown) => ({ rpc: vi.fn(async () => ({ data, error: null })) });
const paidOrder = { orderId: "native-owned", recordKind: "order" as const, state: "payment_captured" as const,
  placedAt: "2026-09-20T10:00:00Z", totalCents: 100, shipments: [], shipmentsSource: "connected" as const,
  payment: { amountDueCents: 100, amountCapturedCents: 100, amountRefundedCents: 0, currency: "USD" as const } };
const base = () => ({
  listForMember: vi.fn(async () => [paidOrder]),
  getForMember: vi.fn(async () => ({ ...paidOrder, lines: [{ sku: "real", displayName: "Real paid order", quantity: 1, lineTotalCents: 100 }], shippingCents: 0, storeCreditAppliedCents: 0, reviewReason: null })),
  historySources: { commerce: complete, xea: complete, xec: complete, xrr: disconnected },
});

describe("member-bound assisted request history", () => {
  it("uses only the member-scoped RPC and strips server ownership proof", async () => {
    const rpc = rpcFor(envelope());
    const result = await createAssistedMemberHistoryReader(rpc).readForMember(member);
    expect(rpc.rpc).toHaveBeenCalledExactlyOnceWith(ASSISTED_MEMBER_HISTORY_RPC, { p_member_id: member });
    expect(result.source).toEqual(complete);
    expect(result.requests[0]).toMatchObject({ kind: "assisted_request", estimatedTotalCents: null, trackingReference: "SYNTHETIC-REFERENCE" });
    expect(result.requests[0]).not.toHaveProperty("actorMemberId");
    expect(result.requests[0]).not.toHaveProperty("payment");
    expect(result.requests[0]).not.toHaveProperty("trackingUrl");
  });

  it("empty is complete only after a valid empty member-bound read", async () => {
    expect(await createAssistedMemberHistoryReader(rpcFor({ ...envelope(), requests: [] })).readForMember(member))
      .toEqual({ requests: [], source: complete });
    expect(await createAssistedMemberHistoryReader(null).readForMember(member)).toEqual({ requests: [], source: disconnected });
    const rpc = rpcFor(envelope());
    expect(await createAssistedMemberHistoryReader(rpc).readForMember("not-a-member-key")).toEqual({ requests: [], source: disconnected });
    expect(rpc.rpc).not.toHaveBeenCalled();
  });

  const invalid: [string, (data: ReturnType<typeof envelope>) => unknown][] = [
    ["foreign envelope", (data) => ({ ...data, memberId: other })],
    ["foreign row", (data) => ({ ...data, requests: [{ ...row(), actorMemberId: other }] })],
    ["mixed member rows", (data) => ({ ...data, requests: [row(), { ...row(), actorMemberId: other, requestId: other }] })],
    ["unknown provenance", (data) => ({ ...data, schemaVersion: "untrusted" })],
    ["wrong record kind", (data) => ({ ...data, requests: [{ ...row(), kind: "order" }] })],
    ["private extra field", (data) => ({ ...data, requests: [{ ...row(), internalNote: "private" }] })],
    ["invalid timestamp", (data) => ({ ...data, requests: [{ ...row(), createdAt: "yesterday" }] })],
    ["negative estimate", (data) => ({ ...data, requests: [{ ...row(), estimatedTotalCents: -1 }] })],
    ["duplicate request", (data) => ({ ...data, requests: [row(), row()] })],
    ["duplicate reference", (data) => ({ ...data, requests: [row(), { ...row(), requestId: other }] })],
    ["missing lines", (data) => ({ ...data, requests: [{ ...row(), lines: [] }] })],
    ["missing completeness", (data) => ({ ...data, complete: undefined })],
    ["unexplained partial", (data) => ({ ...data, complete: false })],
    ["over limit", (data) => ({ ...data, requests: Array.from({ length: 101 }, row) })],
  ];
  it.each(invalid)("fails %s closed without returning mixed data", async (_label, change) => {
    expect(await createAssistedMemberHistoryReader(rpcFor(change(envelope()))).readForMember(member))
      .toEqual({ requests: [], source: disconnected });
  });

  it("preserves bounded partial records without a complete-history assertion", async () => {
    const requests = Array.from({ length: 100 }, (_, i) => ({ ...row(), requestId: `20000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
      publicReference: `XRR-20260921-${i.toString(16).toUpperCase().padStart(10, "0")}` }));
    const result = await createAssistedMemberHistoryReader(rpcFor({ ...envelope(), requests, complete: false })).readForMember(member);
    expect(result.requests).toHaveLength(100);
    expect(result.source).toEqual({ connected: true, complete: false });
  });

  it("accepts the canonical 200-line maximum and rejects the 201-line sentinel", async () => {
    const data = { ...envelope(), requests: [{ ...row(), lines: Array.from({ length: 200 }, () => row().lines[0]) }] };
    expect((await createAssistedMemberHistoryReader(rpcFor(data)).readForMember(member)).requests[0].lines).toHaveLength(200);
    data.requests[0].lines.push(row().lines[0]);
    expect(await createAssistedMemberHistoryReader(rpcFor(data)).readForMember(member)).toEqual({ requests: [], source: disconnected });
  });

  it("preserves a 500-character tracking reference and rejects overflow", async () => {
    expect((await createAssistedMemberHistoryReader(rpcFor({ ...envelope(), requests: [{ ...row(), trackingReference: "R".repeat(500) }] })).readForMember(member)).requests[0].trackingReference).toHaveLength(500);
    expect(await createAssistedMemberHistoryReader(rpcFor({ ...envelope(), requests: [{ ...row(), trackingReference: "R".repeat(501) }] })).readForMember(member)).toEqual({ requests: [], source: disconnected });
  });

  it.each(["rpc-error", "throw"])("isolates %s from existing order history", async (failure) => {
    const rpc = { rpc: async () => { if (failure === "throw") throw new Error("private provider detail"); return { data: null, error: { code: "PGRST202" } }; } };
    const decorated = withAssistedOrderRequestHistory(base(), createAssistedMemberHistoryReader(rpc));
    const read = await decorated.listForMemberWithHistory(member);
    expect(read.rows).toEqual([paidOrder]);
    expect(read.requests).toEqual([]);
    expect(read.historySources).toMatchObject({ commerce: complete, xrr: disconnected });
    const account = await createCommerceOrdersPort(decorated).ordersFor(member);
    expect(account.research).toHaveLength(1);
    expect(account.history.availability).toBe("partial");
    expect(account.history.authoritativeRecordCount).toBeNull();
  });

  it("keeps requests separate in both canonical native and account projections", async () => {
    const native = base();
    const decorated = withAssistedOrderRequestHistory(native, createAssistedMemberHistoryReader(rpcFor(envelope())));
    expect(await decorated.listForMember(member)).toEqual([paidOrder]);
    expect(await decorated.getForMember(member, "native-owned")).toMatchObject({ orderId: "native-owned" });
    expect(native.getForMember).toHaveBeenCalledWith(member, "native-owned");
    const account = await createCommerceOrdersPort(decorated).ordersFor(member);
    expect(account.research).toHaveLength(1);
    expect(account.requests).toHaveLength(1);
    expect(account.requests![0].estimatedTotalCents).toBeNull();
    expect(account.history).toMatchObject({ availability: "complete", authoritativeRecordCount: 2 });
  });

  it("mounted native route ignores buyer-selected identity and emits the real reader payload", async () => {
    const rpc = rpcFor(envelope());
    const orders = withAssistedOrderRequestHistory(base(), createAssistedMemberHistoryReader(rpc));
    const routes = new Map<string, (...args: any[]) => unknown>();
    const app = Object.fromEntries(["get", "post", "patch", "delete"].map((method) => [method, (path: string, ...handlers: any[]) => routes.set(`${method} ${path}`, handlers.at(-1))]));
    const guard = (_req: any, _res: any, next: () => void) => next();
    registerCommerceApi(app as never, { orders } as CommerceDependencies, { requireActiveMember: guard, requireAdmin: guard, requireMember: guard });
    let body: any;
    const response = { set: () => response, status: () => response, json: (value: unknown) => { body = value; return response; } };
    await routes.get("get /api/research/orders")!({ researchMember: { id: member }, query: { memberId: other }, body: { memberId: other } }, response);
    expect(rpc.rpc).toHaveBeenCalledWith(ASSISTED_MEMBER_HISTORY_RPC, { p_member_id: member });
    expect(body.orders).toHaveLength(1);
    expect(body.requests).toHaveLength(1);
    expect(body.requestsSource).toEqual(complete);
    expect(JSON.stringify(body)).not.toContain("actorMemberId");
  });
});
