import { afterEach, describe, expect, it, vi } from "vitest";
import {
  countAssistedOrdersSubmitted,
  getEarlyAccessPaymentOrder,
  getEarlyAccessSupplierOrder,
  listEarlyAccessAdminExceptions,
  listEarlyAccessFulfillmentQueue,
  listEarlyAccessPaymentQueue,
  markEarlyAccessShipped,
  postEarlyAccessTracking,
} from "./earlyAccessAdminOrders";

// The fulfillment operations adapter: exact paths, one bearer prefix, and
// honest envelopes. The negative cases matter most here - a 409 machine code
// must arrive as a routable denial the page can turn into guidance, and a
// 503 (the fail-closed queue before its RPC exists) must arrive as
// "unavailable", never as data.

const TOKEN = "admin-token";
const ORDER = "XEA-0123456789ABCDEF";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJson(status: number, body: unknown) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

function bearerOf(calls: Array<{ init?: RequestInit }>): string | undefined {
  return (calls[0]?.init?.headers as Record<string, string> | undefined)?.Authorization;
}

describe("early access fulfillment operations adapter", () => {
  it("reads the payment review queue with the bearer token", async () => {
    const calls = stubJson(200, { ok: true, items: [] });

    const result = await listEarlyAccessPaymentQueue(TOKEN);

    expect(result.kind).toBe("ok");
    expect(calls[0]?.path).toBe("/api/admin/research/payments");
    expect(calls[0]?.init?.method).toBe("GET");
    expect(bearerOf(calls)).toBe(`Bearer ${TOKEN}`);
  });

  it("reads one order by its number, encoded into the path", async () => {
    const calls = stubJson(200, { ok: true, order: { orderNumber: ORDER } });

    await getEarlyAccessPaymentOrder(TOKEN, ORDER);

    expect(calls[0]?.path).toBe(`/api/admin/research/payments/${ORDER}`);
  });

  it("reads the supplier packet and trail from the supplier-orders path", async () => {
    const calls = stubJson(200, {
      ok: true,
      packet: {},
      supplierOrder: {},
      events: [],
      tracking: [],
      fulfillment: null,
    });

    const result = await getEarlyAccessSupplierOrder(TOKEN, ORDER);

    expect(result.kind).toBe("ok");
    expect(calls[0]?.path).toBe(`/api/admin/research/supplier-orders/${ORDER}`);
  });

  it("posts tracking as the exact two-field body the route projects", async () => {
    const calls = stubJson(201, {
      ok: true,
      paymentState: "payment_verified",
      supplierOrder: {},
      events: [],
      tracking: [{ carrier: "UPS", trackingNumber: "1Z-TEST-000001", sequence: 1 }],
      fulfillment: null,
    });

    const result = await postEarlyAccessTracking(TOKEN, ORDER, {
      carrier: "UPS",
      trackingNumber: "1Z-TEST-000001",
    });

    expect(result.kind).toBe("ok");
    expect(calls[0]?.path).toBe(`/api/admin/research/supplier-orders/${ORDER}/tracking`);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      carrier: "UPS",
      trackingNumber: "1Z-TEST-000001",
    });
  });

  it("surfaces the shipped route's TRACKING_REQUIRED 409 as a routable denial", async () => {
    stubJson(409, { ok: false, code: "TRACKING_REQUIRED" });

    const result = await markEarlyAccessShipped(TOKEN, ORDER);

    expect(result).toMatchObject({ kind: "denied", code: "TRACKING_REQUIRED" });
  });

  it("reports the fail-closed fulfillment queue 503 as unavailable, never data", async () => {
    stubJson(503, { ok: false, code: "SETTLED_QUEUE_UNAVAILABLE" });

    const result = await listEarlyAccessFulfillmentQueue(TOKEN);

    expect(result.kind).toBe("unavailable");
  });

  it("reads the fulfillment queue and exceptions from their exported paths", async () => {
    const calls = stubJson(200, { ok: true, items: [] });

    await listEarlyAccessFulfillmentQueue(TOKEN);
    await listEarlyAccessAdminExceptions(TOKEN);

    expect(calls[0]?.path).toBe("/api/admin/research/early-access/fulfillment-queue");
    expect(calls[1]?.path).toBe("/api/admin/research/early-access/exceptions");
  });

  it("counts submitted assisted orders through the paged admin list", async () => {
    const calls = stubJson(200, { items: [], total: 4, page: 1, pageSize: 1 });

    const result = await countAssistedOrdersSubmitted(TOKEN);

    expect(result.kind === "ok" && result.data.total).toBe(4);
    expect(calls[0]?.path).toBe(
      "/api/admin/research/assisted-orders?status=submitted&page=1&pageSize=1",
    );
  });

  it("reports an unauthorized queue read honestly", async () => {
    stubJson(401, { ok: false, message: "Unauthorized" });

    const result = await listEarlyAccessPaymentQueue(TOKEN);

    expect(result.kind).toBe("unauthorized");
  });
});
