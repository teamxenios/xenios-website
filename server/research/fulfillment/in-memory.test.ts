import { describe, expect, it } from "vitest";
import type {
  FulfillmentActor,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import { createInMemoryFulfillmentStore } from "./in-memory";
import { createFulfillmentOperationsService } from "./service";
import { createPaidOrderReleaseGate } from "./release-gate";
import { FulfillmentError } from "./errors";

const INTERNAL: FulfillmentActor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  kind: "internal",
  role: "operations_admin",
};
const SUPPLIER_A_ID = "33333333-3333-4333-8333-333333333333";
const SUPPLIER_B_ID = "43333333-3333-4333-8333-333333333333";
const SUPPLIER_A: FulfillmentActor = {
  actorId: "22222222-2222-4222-8222-222222222222",
  kind: "supplier",
  role: "supplier_operator",
  supplierId: SUPPLIER_A_ID,
};
const SUPPLIER_B: FulfillmentActor = {
  actorId: "52222222-2222-4222-8222-222222222222",
  kind: "supplier",
  role: "supplier_operator",
  supplierId: SUPPLIER_B_ID,
};
const MEMBER_ID = "99999999-9999-4999-8999-999999999999";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";
const AT = "2026-08-19T12:00:00.000Z";

function harness(options: { paid?: boolean } = {}) {
  const store = createInMemoryFulfillmentStore();
  store.seedSupplier({ supplierId: SUPPLIER_A_ID, supplierLabel: "Supplier A" });
  store.seedSupplier({ supplierId: SUPPLIER_B_ID, supplierLabel: "Supplier B" });
  store.seedFulfillmentOrder({
    fulfillmentOrderId: ORDER_ID,
    orderReference: "XEN-1001",
    memberId: MEMBER_ID,
    paid: options.paid ?? true,
    recipient: {
      name: "Recipient",
      addressLine1: "10 Delivery Way",
      addressLine2: null,
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
      phone: null,
    },
    shippingService: "ground",
    handlingProfile: "ambient",
    lines: [
      {
        lineId: "66666666-6666-4666-8666-666666666666",
        sku: "XEN-SKU-1",
        quantity: 2,
        lotId: "77777777-7777-4777-8777-777777777777",
        lotCode: "LOT-100",
      },
    ],
  });
  const service = createFulfillmentOperationsService(store, {
    paidOrderRelease: createPaidOrderReleaseGate((orderId) =>
      store.isOrderPaid(orderId),
    ),
  });
  return { store, service };
}

async function assign(service: ReturnType<typeof harness>["service"]) {
  return service.assign({
    actor: INTERNAL,
    supplierId: SUPPLIER_A_ID,
    supplierOfferId: "44444444-4444-4444-8444-444444444444",
    fulfillmentOrderId: ORDER_ID,
    allocations: [
      {
        fulfillmentLineId: "66666666-6666-4666-8666-666666666666",
        reservationId: "77777777-7777-4777-8777-777777777777",
        reservationAllocationId: "88888888-8888-4888-8888-888888888888",
      },
    ],
    expectedVersion: 0,
    idempotencyKey: "assign:xen-1001",
    at: AT,
  });
}

function step(
  assignmentId: string,
  version: number,
  overrides: Partial<TransitionFulfillmentInput>,
): TransitionFulfillmentInput {
  return {
    actor: SUPPLIER_A,
    assignmentId,
    action: "acknowledge",
    expectedVersion: version,
    idempotencyKey: `step:${version}:${overrides.action ?? "acknowledge"}`,
    at: AT,
    ...overrides,
  };
}

describe("in-memory fulfillment store", () => {
  it("walks the full minimum pipeline to delivered", async () => {
    const { service } = harness();
    const assigned = await assign(service);
    const id = assigned.assignmentId;
    let version = assigned.version;

    for (const [action, extras] of [
      ["acknowledge", {}],
      ["start_picking", {}],
      ["pack", { labelReference: "LBL-1" }],
      [
        "record_tracking",
        {
          labelReference: "LBL-1",
          carrier: "UPS",
          service: "ground",
          trackingReference: "1Z999",
        },
      ],
      ["ship", {}],
      ["deliver", {}],
    ] as const) {
      const result = await service.transition(
        step(id, version, { action, ...extras }),
      );
      version = result.version;
    }

    const [view] = await service.listAssignments({ actor: SUPPLIER_A });
    expect(view.state).toBe("delivered");
    expect(view.trackingReference).toBe("1Z999");
    expect(view.version).toBe(7);
  });

  it("never releases an unpaid order, even if a caller bypasses the service gate", async () => {
    const { store, service } = harness({ paid: false });
    await expect(assign(service)).rejects.toThrow(/ORDER_NOT_PAID/);
    // Direct port call simulating a miswired composition root.
    await expect(
      store.assign({
        actor: INTERNAL,
        supplierId: SUPPLIER_A_ID,
        supplierOfferId: "44444444-4444-4444-8444-444444444444",
        fulfillmentOrderId: ORDER_ID,
        allocations: [],
        expectedVersion: 0,
        idempotencyKey: "assign:bypass",
        at: AT,
      }),
    ).rejects.toMatchObject({ code: "UNPAID_ORDER" });
    store.markOrderPaid(ORDER_ID);
    await expect(assign(service)).resolves.toMatchObject({ state: "assigned" });
  });

  it("recording tracking does not mean shipped", async () => {
    const { service } = harness();
    const assigned = await assign(service);
    const id = assigned.assignmentId;
    await service.transition(step(id, 1, { action: "acknowledge" }));
    await service.transition(step(id, 2, { action: "start_picking" }));
    await service.transition(step(id, 3, { action: "pack", labelReference: "LBL-1" }));
    const tracked = await service.transition(
      step(id, 4, {
        action: "record_tracking",
        labelReference: "LBL-1",
        carrier: "UPS",
        service: "ground",
        trackingReference: "1Z999",
      }),
    );
    expect(tracked.state).toBe("tracking_created");
    const [view] = await service.listAssignments({ actor: SUPPLIER_A });
    expect(view.trackingReference).toBe("1Z999");
    expect(view.state).not.toBe("shipped");
    // Shipping is its own explicit step.
    const shipped = await service.transition(step(id, 5, { action: "ship" }));
    expect(shipped.state).toBe("shipped");
  });

  it("refuses shipping straight from packed", async () => {
    const { service } = harness();
    const assigned = await assign(service);
    const id = assigned.assignmentId;
    await service.transition(step(id, 1, { action: "acknowledge" }));
    await service.transition(step(id, 2, { action: "start_picking" }));
    await service.transition(step(id, 3, { action: "pack", labelReference: "LBL-1" }));
    await expect(
      service.transition(step(id, 4, { action: "ship" })),
    ).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
  });

  it("replays identical commands idempotently and rejects reused keys", async () => {
    const { service } = harness();
    const first = await assign(service);
    const replay = await assign(service);
    expect(replay).toEqual({ ...first, idempotentReplay: true });
    await expect(
      service.transition(
        step(first.assignmentId, 1, {
          action: "acknowledge",
          idempotencyKey: "assign:xen-1001",
        }),
      ),
    ).resolves.toMatchObject({ state: "acknowledged" });
    // Same key, different command payload.
    await expect(
      service.transition(
        step(first.assignmentId, 2, {
          action: "start_picking",
          idempotencyKey: "assign:xen-1001",
        }),
      ),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_REUSED" });
  });

  it("enforces optimistic versions", async () => {
    const { service } = harness();
    const assigned = await assign(service);
    await service.transition(step(assigned.assignmentId, 1, { action: "acknowledge" }));
    await expect(
      service.transition(step(assigned.assignmentId, 1, { action: "acknowledge", idempotencyKey: "stale:retry:1" })),
    ).rejects.toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("hides other suppliers' assignments from queue and transitions", async () => {
    const { service } = harness();
    const assigned = await assign(service);
    expect(await service.listAssignments({ actor: SUPPLIER_B })).toEqual([]);
    await expect(
      service.transition(
        step(assigned.assignmentId, 1, { actor: SUPPLIER_B, action: "acknowledge" }),
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("scopes customer reads to the owning member", async () => {
    const { store, service } = harness();
    await assign(service);
    const otherMember = "89999999-9999-4999-8999-999999999999";
    expect(await store.findAssignmentForMember(otherMember, "XEN-1001")).toBeNull();
    const owned = await store.findAssignmentForMember(MEMBER_ID, "XEN-1001");
    expect(owned?.orderReference).toBe("XEN-1001");
  });

  it("throws typed errors for unknown records", async () => {
    const { service } = harness();
    await expect(
      service.transition(
        step("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", 1, { action: "acknowledge" }),
      ),
    ).rejects.toBeInstanceOf(FulfillmentError);
  });
});
