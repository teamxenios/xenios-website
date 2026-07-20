import { describe, expect, it } from "vitest";
import { DisabledPaymentProvider, TestPaymentProvider } from "../providers/payment";
import {
  createOrderService,
  type OrderRecord,
  type OrderRepository,
  type OrderServiceDeps,
} from "./orders";

const NOW = new Date("2026-07-20T00:00:00Z");
const LATER = new Date("2026-07-20T01:00:00Z");

function order(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    orderId: "ord_1",
    memberId: "mem_1",
    state: "checkout_pending",
    lines: [{ sku: "P001", displayName: "Product One", quantity: 2, lineTotalCents: 19800 }],
    totals: {
      subtotalCents: 19800,
      shippingCents: 1295,
      storeCreditAppliedCents: 0,
      totalCents: 21095,
    },
    providerReference: null,
    lastIdempotencyKey: null,
    reviewTriggers: [],
    createdAt: NOW.toISOString(),
    updatedAt: NOW.toISOString(),
    ...overrides,
  };
}

/** In-memory repository. Counts saves so a denial that writes anything is caught. */
function repository(seed: OrderRecord[] = []): OrderRepository & { saves: number } {
  const rows = new Map<string, OrderRecord>();
  seed.forEach((o) => rows.set(o.orderId, o));
  const repo = {
    saves: 0,
    get(orderId: string): OrderRecord | null {
      return rows.get(orderId) ?? null;
    },
    save(o: OrderRecord): void {
      repo.saves += 1;
      rows.set(o.orderId, o);
    },
    listByMember(memberId: string): OrderRecord[] {
      return repo.listAll().filter((o) => o.memberId === memberId);
    },
    findByIdempotencyKey(memberId: string, key: string): OrderRecord | null {
      const hit = repo
        .listAll()
        .find((o) => o.memberId === memberId && o.lastIdempotencyKey === key);
      return hit ?? null;
    },
    listAll(): OrderRecord[] {
      const out: OrderRecord[] = [];
      rows.forEach((value) => out.push(value));
      return out;
    },
  };
  return repo;
}

function deps(overrides: Partial<OrderServiceDeps> = {}): OrderServiceDeps {
  return {
    repository: repository([order()]),
    payment: new TestPaymentProvider(),
    commerceEnabled: true,
    ...overrides,
  };
}

describe("order authorization", () => {
  it("authorizes with a real provider reference and never invents one", async () => {
    const d = deps();
    const service = createOrderService(d);

    const result = await service.authorize("ord_1", "system", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.state).toBe("payment_authorized");
    expect(result.order.providerReference).toMatch(/^test_auth_/);
    expect(result.order.capturedAmountCents).toBeUndefined();
  });

  it("holds a review-triggered order in manual_review with the authorization uncaptured", async () => {
    const repo = repository([order({ reviewTriggers: ["total_exceeds_threshold"] })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.authorize("ord_1", "system", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.state).toBe("manual_review");
    expect(result.order.providerReference).not.toBeNull();
    expect(result.order.capturedAmountCents).toBeUndefined();

    expect(service.adminLargeOrderQueue()).toEqual([
      {
        orderId: "ord_1",
        totalCents: 21095,
        triggers: ["total_exceeds_threshold"],
        heldSince: NOW.toISOString(),
      },
    ]);
  });

  it("refuses and writes nothing when commerce is disabled", async () => {
    const repo = repository([order()]);
    const service = createOrderService(deps({ repository: repo, commerceEnabled: false }));

    const result = await service.authorize("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("commerce_disabled");
    expect(repo.saves).toBe(0);
    expect(repo.get("ord_1")!.state).toBe("checkout_pending");
  });

  it("refuses an unknown order", async () => {
    const service = createOrderService(deps());
    const result = await service.authorize("ord_missing", "system", NOW);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toEqual(["order_not_found"]);
  });

  it("refuses a member actor, who may never reach a paid state", async () => {
    const repo = repository([order()]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.authorize("ord_1", "member", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("order_state_invalid");
    expect(repo.saves).toBe(0);
  });
});

describe("delayed capture", () => {
  it("runs the founder flow: authorize, review, approve, capture", async () => {
    const repo = repository([order({ reviewTriggers: ["total_exceeds_threshold"] })]);
    const service = createOrderService(deps({ repository: repo }));

    const authorized = await service.authorize("ord_1", "system", NOW);
    expect(authorized.ok).toBe(true);
    if (!authorized.ok) return;
    const reference = authorized.order.providerReference;

    const approved = await service.approve("ord_1", "samuel", LATER);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.order.state).toBe("approved");
    expect(approved.order.approvedBy).toBe("samuel");

    const captured = await service.capture("ord_1", "system", LATER);
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    expect(captured.order.state).toBe("payment_captured");
    expect(captured.order.capturedAmountCents).toBe(21095);
    // The capture reuses the authorization reference. Nothing is fabricated.
    expect(captured.order.providerReference).toBe(reference);
  });

  it("refuses a capture before approval", async () => {
    const repo = repository([order({ state: "manual_review", providerReference: "test_auth_1" })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.capture("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("order_state_invalid");
    expect(repo.saves).toBe(0);
    expect(repo.get("ord_1")!.state).toBe("manual_review");
  });

  it("refuses a capture with no prior authorization", async () => {
    const repo = repository([order({ state: "approved", providerReference: null })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.capture("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("payment_failed");
    expect(repo.saves).toBe(0);
    expect(repo.get("ord_1")!.state).toBe("approved");
  });

  it("refuses a held order when the provider cannot defer capture", async () => {
    const repo = repository([
      order({
        state: "approved",
        providerReference: "auth_ref",
        reviewTriggers: ["total_exceeds_threshold"],
      }),
    ]);
    const payment = new TestPaymentProvider();
    Object.defineProperty(payment, "supportsDeferredCapture", { value: false });
    const service = createOrderService(deps({ repository: repo, payment }));

    const result = await service.capture("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("capability_disabled");
    expect(repo.get("ord_1")!.state).toBe("approved");
  });

  it("refuses to capture a cancelled order", async () => {
    const repo = repository([order({ state: "approved", providerReference: "test_auth_1" })]);
    const service = createOrderService(deps({ repository: repo }));

    const cancelled = await service.cancel("ord_1", "admin", "member changed their mind", NOW);
    expect(cancelled.ok).toBe(true);
    if (!cancelled.ok) return;
    expect(cancelled.order.state).toBe("cancelled");

    const result = await service.capture("ord_1", "system", LATER);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("order_state_invalid");
    expect(repo.get("ord_1")!.state).toBe("cancelled");
    expect(repo.get("ord_1")!.capturedAmountCents).toBeUndefined();
  });
});

describe("a disabled provider", () => {
  it("never produces a paid state on authorize", async () => {
    const repo = repository([order()]);
    const service = createOrderService(
      deps({ repository: repo, payment: new DisabledPaymentProvider() }),
    );

    const result = await service.authorize("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toEqual(["capability_disabled", "payment_disabled"]);
    expect(repo.saves).toBe(0);
    expect(repo.get("ord_1")!.state).toBe("checkout_pending");
    expect(repo.get("ord_1")!.providerReference).toBeNull();
  });

  it("never produces a paid state on capture", async () => {
    const repo = repository([order({ state: "approved", providerReference: "auth_ref" })]);
    const service = createOrderService(
      deps({ repository: repo, payment: new DisabledPaymentProvider() }),
    );

    const result = await service.capture("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toEqual(["capability_disabled", "payment_disabled"]);
    expect(repo.get("ord_1")!.state).toBe("approved");
    expect(repo.get("ord_1")!.capturedAmountCents).toBeUndefined();
  });
});

describe("idempotency", () => {
  it("absorbs a repeated authorize key and returns the same order", async () => {
    const repo = repository([order()]);
    const service = createOrderService(deps({ repository: repo }));

    const first = await service.authorize("ord_1", "system", NOW, "key_a");
    const second = await service.authorize("ord_1", "system", LATER, "key_a");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.idempotent).toBe(true);
    expect(second.order.orderId).toBe(first.order.orderId);
    expect(second.order.providerReference).toBe(first.order.providerReference);
    expect(second.order.state).toBe("payment_authorized");
    expect(repo.saves).toBe(1);
  });

  it("absorbs a repeated capture key without capturing twice", async () => {
    const repo = repository([order({ state: "approved" })]);
    const payment = new TestPaymentProvider();
    const service = createOrderService(deps({ repository: repo, payment }));

    const auth = await payment.createAuthorization({
      amountCents: 21095,
      currency: "usd",
      orderId: "ord_1",
      memberId: "mem_1",
      idempotencyKey: "seed",
    });
    expect(auth.ok).toBe(true);
    if (!auth.ok) return;
    repo.save({ ...repo.get("ord_1")!, providerReference: auth.value.providerReference });
    const savesBefore = repo.saves;

    const first = await service.capture("ord_1", "system", NOW, "cap_a");
    const second = await service.capture("ord_1", "system", LATER, "cap_a");

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(second.idempotent).toBe(true);
    expect(second.order.capturedAmountCents).toBe(21095);
    expect(repo.saves).toBe(savesBefore + 1);
  });

  it("refuses a key already bound to another order", async () => {
    const repo = repository([
      order({ orderId: "ord_1", state: "approved", lastIdempotencyKey: "shared" }),
      order({ orderId: "ord_2" }),
    ]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.authorize("ord_2", "system", NOW, "shared");

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toContain("order_state_invalid");
    expect(repo.get("ord_2")!.state).toBe("checkout_pending");
  });
});

describe("cancellation", () => {
  it("releases the authorization and records the reason", async () => {
    const repo = repository([order()]);
    const service = createOrderService(deps({ repository: repo }));

    const authorized = await service.authorize("ord_1", "system", NOW);
    expect(authorized.ok).toBe(true);

    const result = await service.cancel("ord_1", "admin", "duplicate order", LATER);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.state).toBe("cancelled");
    expect(result.order.cancellationReason).toBe("duplicate order");
    expect(result.order.authorizationReleaseFailed).toBe(false);
  });

  it("flags a failed release rather than swallowing it", async () => {
    const repo = repository([order({ providerReference: "unknown_ref" })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.cancel("ord_1", "admin", "test", NOW);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.order.state).toBe("cancelled");
    expect(result.order.authorizationReleaseFailed).toBe(true);
  });

  it("refuses to cancel an already cancelled order", async () => {
    const repo = repository([order({ state: "cancelled" })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = await service.cancel("ord_1", "admin", "again", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toEqual(["order_state_invalid"]);
  });
});

describe("fulfillment evidence", () => {
  it("moves a captured order through processing to delivered", async () => {
    const repo = repository([order({ state: "payment_captured" })]);
    const service = createOrderService(deps({ repository: repo }));

    expect(service.beginProcessing("ord_1", "system", NOW).ok).toBe(true);
    expect(service.markFulfilled("ord_1", "system", NOW).ok).toBe(true);
    const delivered = service.markDelivered("ord_1", "provider_webhook", LATER, "carrier_evt_1");

    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    expect(delivered.order.state).toBe("delivered");
  });

  it("refuses to mark an unfulfilled order delivered", () => {
    const repo = repository([order({ state: "payment_captured" })]);
    const service = createOrderService(deps({ repository: repo }));

    const result = service.markDelivered("ord_1", "system", NOW);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.denials).toEqual(["order_state_invalid"]);
    expect(repo.get("ord_1")!.state).toBe("payment_captured");
  });
});

describe("member reads", () => {
  it("returns null for an order belonging to another member", () => {
    const repo = repository([order({ orderId: "ord_1", memberId: "mem_1" })]);
    const service = createOrderService(deps({ repository: repo }));

    expect(service.getForMember("mem_1", "ord_1")).not.toBeNull();
    expect(service.getForMember("mem_2", "ord_1")).toBeNull();
    expect(service.getForMember("mem_2", "ord_missing")).toBeNull();
  });

  it("lists only the calling member's orders", () => {
    const repo = repository([
      order({ orderId: "ord_1", memberId: "mem_1" }),
      order({ orderId: "ord_2", memberId: "mem_2" }),
    ]);
    const service = createOrderService(deps({ repository: repo }));

    const list = service.listForMember("mem_1");

    expect(list.map((o) => o.orderId)).toEqual(["ord_1"]);
  });

  it("serializes the detail view without operator fields", () => {
    const repo = repository([
      order({
        providerReference: "test_auth_1",
        lastIdempotencyKey: "key_a",
        reviewTriggers: ["fraud_rule"],
        shipments: [{ owner: "mitch", status: "pending", trackingNumber: null, carrier: null }],
      }),
    ]);
    const service = createOrderService(deps({ repository: repo }));

    const detail = service.getForMember("mem_1", "ord_1")!;

    expect(detail.reviewReason).toBe("fraud_rule");
    expect(detail.totalCents).toBe(21095);
    expect(detail.shippingCents).toBe(1295);
    expect(detail.shipments).toHaveLength(1);
    expect(Object.keys(detail)).not.toContain("providerReference");
    expect(Object.keys(detail)).not.toContain("lastIdempotencyKey");
    expect(Object.keys(detail)).not.toContain("memberId");
  });
});
