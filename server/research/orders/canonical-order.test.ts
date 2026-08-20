import { describe, expect, it } from "vitest";
import {
  canonicalOrderView,
  convertToCanonicalOrder,
  createMemberCanonicalOrderHistory,
  recordCanonicalFulfillmentEvent,
  recordCanonicalPaymentVerified,
  type CanonicalOrderBindingsPort,
  type CanonicalOrderConversionInput,
  type CanonicalOrderPaymentEvidence,
  type CanonicalOrderRepository,
} from "./canonical-order";
import { createInMemoryCanonicalOrderRepository } from "./memory-repository";
import { createCanonicalOrderService } from "./service";
import { canonicalOrderNumberFor, canonicalConversionKey } from "./order-number";
import { createCanonicalOrderRouteTable, type CanonicalOrderHttpRequest } from "./http";
import { isCanonicalOrderNumber } from "@shared/research/orders/canonical-order";

const AT = new Date("2026-08-19T18:00:00.000Z");

const PAYMENT: CanonicalOrderPaymentEvidence = {
  verificationId: "verif-1",
  verifiedBy: "admin-samuel",
  verifiedAt: "2026-08-19T17:55:00.000Z",
  externalTransactionId: "wire-9911",
};

function conversion(
  overrides: Partial<CanonicalOrderConversionInput> = {},
): CanonicalOrderConversionInput {
  return {
    source: { kind: "early_access_placement", sourceRef: "XEA-ABCDEFGH12345678" },
    customer: { customerRef: "cust-a", memberId: "member-a" },
    shipping: {
      recipient: "A Buyer",
      addressLines: ["1 Research Way"],
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US",
      serviceLabel: "Standard",
    },
    lines: [{ sku: "SKU-1", displayName: "Peptide A", quantity: 2, unitPriceCents: 5_000 }],
    shippingCents: 1_295,
    expectedTotalCents: 11_295,
    payment: PAYMENT,
    placedAt: "2026-08-19T17:00:00.000Z",
    convertedBy: { actor: "admin", actorId: "admin-samuel" },
    at: AT,
    ...overrides,
  };
}

function bindingsFor(map: Record<string, string[]>): CanonicalOrderBindingsPort {
  return { async customerRefsFor(memberId: string) { return map[memberId] ?? []; } };
}

async function convertOne(
  repository: CanonicalOrderRepository,
  overrides: Partial<CanonicalOrderConversionInput> = {},
) {
  const result = await convertToCanonicalOrder(conversion(overrides), repository);
  if (!result.ok) throw new Error(`expected conversion to succeed: ${result.code}`);
  return result.order;
}

describe("canonical order identity", () => {
  it("derives one order number per source transaction, stable across calls", () => {
    const key = canonicalConversionKey("early_access_placement", "XEA-ABCDEFGH12345678");
    const first = canonicalOrderNumberFor(key);
    expect(canonicalOrderNumberFor(key)).toBe(first);
    expect(isCanonicalOrderNumber(first)).toBe(true);
  });

  it("gives different sources different numbers, including across families", () => {
    const a = canonicalOrderNumberFor(canonicalConversionKey("early_access_placement", "XEA-1"));
    const b = canonicalOrderNumberFor(canonicalConversionKey("early_access_cart_checkout", "XEA-1"));
    const c = canonicalOrderNumberFor(canonicalConversionKey("early_access_placement", "XEA-2"));
    expect(new Set([a, b, c]).size).toBe(3);
  });
});

describe("conversion", () => {
  it("computes money server-side and mints a paid order on payment evidence", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);

    expect(order.lines[0].lineTotalCents).toBe(10_000);
    expect(order.subtotalCents).toBe(10_000);
    expect(order.totalCents).toBe(11_295);
    expect(order.paymentState).toBe("paid");
    expect(order.fulfillmentState).toBe("unfulfilled");
    expect(order.revision).toBe(1);
  });

  it("refuses a conversion carrying no evidence at all", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const result = await convertToCanonicalOrder(
      conversion({ payment: null, acceptance: null }),
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_REQUIRED" });
  });

  it("refuses a source ref from the wrong id space", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const result = await convertToCanonicalOrder(
      conversion({ source: { kind: "early_access_placement", sourceRef: "XEC-1234" } }),
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "SOURCE_INVALID" });
  });

  it("refuses an unnamed converter", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const result = await convertToCanonicalOrder(
      conversion({ convertedBy: { actor: "admin", actorId: "  " } }),
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "ACTOR_REQUIRED" });
  });

  it("keeps an accepted quote awaiting payment rather than calling it paid", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      source: { kind: "assisted_request_quote", sourceRef: "XRR-20260819-abcdef1234" },
      payment: null,
      acceptance: {
        quoteRef: "quote-1",
        acceptanceId: "acc-1",
        acceptedAt: "2026-08-19T17:30:00.000Z",
      },
    });
    expect(order.paymentState).toBe("awaiting_payment");
    expect(order.source.quoteRef).toBe("quote-1");
  });
});

describe("negative: a client cannot alter line totals", () => {
  it("recomputes every line total from the authorized unit price", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    // A caller states a line total a tenth of the real one. It is not read.
    const smuggled = {
      sku: "SKU-1",
      displayName: "Peptide A",
      quantity: 2,
      unitPriceCents: 5_000,
      lineTotalCents: 1_000,
    };
    const result = await convertToCanonicalOrder(
      conversion({ lines: [smuggled] as unknown as CanonicalOrderConversionInput["lines"] }),
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "CLIENT_TOTAL_REFUSED" });
  });

  it("refuses an input that states its own order total", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const input = { ...conversion(), totalCents: 1 } as CanonicalOrderConversionInput;
    const result = await convertToCanonicalOrder(input, repository);
    expect(result).toMatchObject({ ok: false, code: "CLIENT_TOTAL_REFUSED" });
  });

  it("refuses when the echoed total disagrees with the computed total", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const result = await convertToCanonicalOrder(
      conversion({ expectedTotalCents: 9_999 }),
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
});

describe("negative: duplicate conversion returns the same order", () => {
  it("returns the incumbent, marked as a replay, and stores exactly one order", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const first = await convertToCanonicalOrder(conversion(), repository);
    const second = await convertToCanonicalOrder(conversion(), repository);

    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.order.orderNumber).toBe(first.order.orderNumber);
    expect(second.replayed).toBe(true);
    expect(repository.all()).toHaveLength(1);
  });

  it("absorbs a concurrent double conversion of one source", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const [a, b] = await Promise.all([
      convertToCanonicalOrder(conversion(), repository),
      convertToCanonicalOrder(conversion(), repository),
    ]);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.order.orderNumber).toBe(b.order.orderNumber);
    expect(repository.all()).toHaveLength(1);
  });

  it("refuses a second conversion of one source that tells a different story", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    await convertToCanonicalOrder(conversion(), repository);
    const conflicting = await convertToCanonicalOrder(
      conversion({
        lines: [{ sku: "SKU-1", displayName: "Peptide A", quantity: 4, unitPriceCents: 5_000 }],
        expectedTotalCents: 21_295,
      }),
      repository,
    );
    expect(conflicting).toMatchObject({ ok: false, code: "CONVERSION_CONFLICT" });
    expect(repository.all()).toHaveLength(1);
  });
});

describe("negative: an unpaid path cannot masquerade as a paid order", () => {
  it("refuses to move an unpaid order toward the customer", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      source: { kind: "assisted_request_quote", sourceRef: "XRR-20260819-abcdef1234" },
      payment: null,
      acceptance: { quoteRef: "q", acceptanceId: "a", acceptedAt: "2026-08-19T17:30:00.000Z" },
    });

    for (const to of ["processing", "shipped"] as const) {
      const result = await recordCanonicalFulfillmentEvent(
        order.orderNumber,
        {
          to,
          evidenceRef: "dispatch-1",
          actor: { actor: "admin", actorId: "admin-samuel" },
          at: AT,
        },
        repository,
      );
      expect(result).toMatchObject({ ok: false, code: "FULFILLMENT_INVALID" });
    }
  });

  it("refuses payment evidence that names no verifier", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      source: { kind: "assisted_request_quote", sourceRef: "XRR-20260819-abcdef1234" },
      payment: null,
      acceptance: { quoteRef: "q", acceptanceId: "a", acceptedAt: "2026-08-19T17:30:00.000Z" },
    });
    const result = await recordCanonicalPaymentVerified(
      order.orderNumber,
      { ...PAYMENT, verifiedBy: "" },
      { actor: "admin", actorId: "admin-samuel" },
      AT,
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "EVIDENCE_INVALID" });
  });

  it("refuses a second, different verification on an order already paid", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);
    const result = await recordCanonicalPaymentVerified(
      order.orderNumber,
      { ...PAYMENT, verificationId: "verif-2" },
      { actor: "admin", actorId: "admin-samuel" },
      AT,
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "PAYMENT_STATE_INVALID" });
  });

  it("absorbs the same verification replayed", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      source: { kind: "assisted_request_quote", sourceRef: "XRR-20260819-abcdef1234" },
      payment: null,
      acceptance: { quoteRef: "q", acceptanceId: "a", acceptedAt: "2026-08-19T17:30:00.000Z" },
    });
    const actor = { actor: "admin" as const, actorId: "admin-samuel" };
    const first = await recordCanonicalPaymentVerified(order.orderNumber, PAYMENT, actor, AT, repository);
    const second = await recordCanonicalPaymentVerified(order.orderNumber, PAYMENT, actor, AT, repository);
    expect(first).toMatchObject({ ok: true, replayed: false });
    expect(second).toMatchObject({ ok: true, replayed: true });
  });
});

describe("fulfillment", () => {
  it("records tracking and surfaces the latest on the customer view", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);
    const actor = { actor: "admin" as const, actorId: "admin-ops" };

    await recordCanonicalFulfillmentEvent(
      order.orderNumber,
      { to: "processing", evidenceRef: "packet-1", actor, at: AT },
      repository,
    );
    const shipped = await recordCanonicalFulfillmentEvent(
      order.orderNumber,
      {
        to: "shipped",
        evidenceRef: "dispatch-1",
        trackingNumber: "1Z999",
        carrier: "UPS",
        actor,
        at: AT,
      },
      repository,
    );

    expect(shipped.ok).toBe(true);
    if (!shipped.ok) return;
    const view = canonicalOrderView(shipped.order);
    expect(view.fulfillmentState).toBe("shipped");
    expect(view.tracking).toEqual({ trackingNumber: "1Z999", carrier: "UPS" });
  });

  it("refuses an event that points at no evidence", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);
    const result = await recordCanonicalFulfillmentEvent(
      order.orderNumber,
      { to: "processing", evidenceRef: "   ", actor: { actor: "admin", actorId: "ops" }, at: AT },
      repository,
    );
    expect(result).toMatchObject({ ok: false, code: "FULFILLMENT_INVALID" });
  });

  it("absorbs the same evidence replayed, and refuses an illegal jump", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);
    const actor = { actor: "admin" as const, actorId: "ops" };
    const event = { to: "processing" as const, evidenceRef: "packet-1", actor, at: AT };

    await recordCanonicalFulfillmentEvent(order.orderNumber, event, repository);
    const replay = await recordCanonicalFulfillmentEvent(order.orderNumber, event, repository);
    expect(replay).toMatchObject({ ok: true, replayed: true });

    const jump = await recordCanonicalFulfillmentEvent(
      order.orderNumber,
      { to: "delivered", evidenceRef: "carrier-1", actor, at: AT },
      repository,
    );
    expect(jump).toMatchObject({ ok: false, code: "FULFILLMENT_INVALID" });
  });
});

describe("negative: customer A cannot read customer B", () => {
  it("omits another customer's order from the list and the detail read", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const mine = await convertOne(repository);
    const theirs = await convertOne(repository, {
      source: { kind: "early_access_placement", sourceRef: "XEA-ZZZZZZZZ99999999" },
      customer: { customerRef: "cust-b", memberId: "member-b" },
    });

    const history = createMemberCanonicalOrderHistory({
      bindings: bindingsFor({ "member-a": ["cust-a"], "member-b": ["cust-b"] }),
      repository,
    });

    const listed = await history.listForMember("member-a");
    expect(listed.map((order) => order.orderNumber)).toEqual([mine.orderNumber]);
    expect(await history.getForMember("member-a", theirs.orderNumber)).toBeNull();
    expect(await history.getForMember("member-b", theirs.orderNumber)).not.toBeNull();
  });

  it("shows nothing to a member bound to nothing, and to an empty member id", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository);
    const history = createMemberCanonicalOrderHistory({
      bindings: bindingsFor({ "member-a": ["cust-a"] }),
      repository,
    });
    expect(await history.listForMember("member-unbound")).toEqual([]);
    expect(await history.listForMember("")).toEqual([]);
    expect(await history.getForMember("member-unbound", order.orderNumber)).toBeNull();
  });

  it("re-checks ownership even when the store answers with a foreign row", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    await convertOne(repository, { customer: { customerRef: "cust-b", memberId: "member-b" } });
    // A store that ignores its filter must not become a disclosure.
    const leaky = {
      ...repository,
      async listByCustomerRefs() {
        return repository.all();
      },
    };
    const history = createMemberCanonicalOrderHistory({
      bindings: bindingsFor({ "member-a": ["cust-a"] }),
      repository: leaky,
    });
    expect(await history.listForMember("member-a")).toEqual([]);
  });

  it("propagates a failed durable read instead of rendering an empty history", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const history = createMemberCanonicalOrderHistory({
      bindings: bindingsFor({ "member-a": ["cust-a"] }),
      repository: {
        async listByCustomerRefs(): Promise<never> {
          throw new Error("store unavailable");
        },
      },
    });
    await expect(history.listForMember("member-a")).rejects.toThrow("store unavailable");
    void repository;
  });
});

describe("negative: affiliate metadata cannot change order ownership", () => {
  it("keeps the order in the buyer's history and out of the affiliate's", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      attribution: { affiliateAttributionRef: "aff-touch-1" },
    });

    const history = createMemberCanonicalOrderHistory({
      // The affiliate is a real member with their own handle. Attribution on
      // someone else's order must not put it in their history.
      bindings: bindingsFor({ "member-a": ["cust-a"], "member-affiliate": ["cust-affiliate"] }),
      repository,
    });

    expect((await history.listForMember("member-a")).map((o) => o.orderNumber)).toEqual([
      order.orderNumber,
    ]);
    expect(await history.listForMember("member-affiliate")).toEqual([]);
    expect(await history.getForMember("member-affiliate", order.orderNumber)).toBeNull();
  });

  it("never exposes attribution, evidence or verifier identity on the wire", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const order = await convertOne(repository, {
      attribution: { affiliateAttributionRef: "aff-touch-1" },
    });
    const serialized = JSON.stringify(canonicalOrderView(order));

    for (const secret of ["aff-touch-1", "verif-1", "admin-samuel", "wire-9911"]) {
      expect(serialized).not.toContain(secret);
    }
  });
});

describe("http surface", () => {
  const request = (
    overrides: Partial<CanonicalOrderHttpRequest> = {},
  ): CanonicalOrderHttpRequest => ({
    method: "GET",
    path: "/api/research/order-history",
    headers: {},
    query: {},
    params: {},
    body: undefined,
    ...overrides,
  });

  function tableFor(memberId: string | null, service: Parameters<typeof createCanonicalOrderRouteTable>[0]) {
    return createCanonicalOrderRouteTable(service, { async resolve() { return memberId; } });
  }

  it("exposes only member-authenticated reads", () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const service = createCanonicalOrderService({ repository, bindings: bindingsFor({}) });
    const routes = createCanonicalOrderRouteTable(service, { async resolve() { return null; } });
    expect(routes.map((route) => route.method)).toEqual(["GET", "GET"]);
    expect(routes.every((route) => route.auth === "member")).toBe(true);
  });

  it("answers 401 without a member and 404 for a malformed order number", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const service = createCanonicalOrderService({ repository, bindings: bindingsFor({}) });

    const anonymous = tableFor(null, service);
    expect((await anonymous[0].handler(request())).status).toBe(401);

    const signedIn = tableFor("member-a", service);
    const malformed = await signedIn[1].handler(request({ params: { orderNumber: "not-an-order" } }));
    expect(malformed.status).toBe(404);
  });

  it("answers 404 rather than 403 for another customer's real order", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const theirs = await convertOne(repository, {
      customer: { customerRef: "cust-b", memberId: "member-b" },
    });
    const service = createCanonicalOrderService({
      repository,
      bindings: bindingsFor({ "member-a": ["cust-a"], "member-b": ["cust-b"] }),
    });

    const response = await tableFor("member-a", service)[1].handler(
      request({ params: { orderNumber: theirs.orderNumber } }),
    );
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ ok: false, code: "order_not_found" });
  });

  it("fails honestly when the store is down instead of answering an empty list", async () => {
    const service = {
      async listForMember(): Promise<never> {
        throw new Error("store unavailable");
      },
      async getForMember(): Promise<never> {
        throw new Error("store unavailable");
      },
    };
    const response = await tableFor("member-a", service)[0].handler(request());
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ ok: false, code: "order_history_unavailable" });
  });
});

describe("service composition", () => {
  it("converts each family once and lists them newest first for the owner", async () => {
    const repository = createInMemoryCanonicalOrderRepository();
    const service = createCanonicalOrderService({
      repository,
      bindings: bindingsFor({ "member-a": ["cust-a"] }),
    });

    const common = {
      customerRef: "cust-a",
      memberId: "member-a",
      shipping: conversion().shipping,
      lines: conversion().lines,
      shippingCents: 1_295,
      expectedTotalCents: 11_295,
      convertedBy: { actor: "admin" as const, actorId: "admin-samuel" },
      at: AT,
    };

    const placement = await service.convertEarlyAccessPlacement({
      ...common,
      orderNumber: "XEA-ABCDEFGH12345678",
      payment: PAYMENT,
      placedAt: "2026-08-17T10:00:00.000Z",
    });
    const cart = await service.convertEarlyAccessCartCheckout({
      ...common,
      cartCheckoutNumber: "XEC-ABCDEFGH12345678",
      payment: { ...PAYMENT, verificationId: "verif-cart" },
      placedAt: "2026-08-18T10:00:00.000Z",
    });
    const request = await service.convertAcceptedAssistedRequest({
      ...common,
      requestRef: "XRR-20260819-abcdef1234",
      acceptance: { quoteRef: "q-1", acceptanceId: "acc-1", acceptedAt: "2026-08-19T09:00:00.000Z" },
      placedAt: "2026-08-19T09:00:00.000Z",
    });

    expect([placement.ok, cart.ok, request.ok]).toEqual([true, true, true]);

    const listed = await service.listForMember("member-a");
    expect(listed).toHaveLength(3);
    expect(listed.map((order) => order.source.kind)).toEqual([
      "assisted_request_quote",
      "early_access_cart_checkout",
      "early_access_placement",
    ]);
    expect(listed[0].paymentState).toBe("awaiting_payment");
    expect(listed[1].paymentState).toBe("paid");
  });
});
