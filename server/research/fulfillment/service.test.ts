import { describe, expect, it } from "vitest";
import type {
  AssignFulfillmentInput,
  FulfillmentActor,
  FulfillmentAssignmentView,
  FulfillmentCommandResult,
  FulfillmentPreparationResult,
  FulfillmentQueueQuery,
  PrepareFulfillmentOrderInput,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import type { FulfillmentOperationsPort } from "./port";
import {
  FULFILLMENT_TRANSITIONS,
  createFulfillmentOperationsService,
  normalizeInstant,
} from "./service";

const INTERNAL: FulfillmentActor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  kind: "internal",
  role: "operations_admin",
};
const SUPPLIER: FulfillmentActor = {
  actorId: "22222222-2222-4222-8222-222222222222",
  kind: "supplier",
  role: "supplier_operator",
  supplierId: "33333333-3333-4333-8333-333333333333",
};
const AT = "2026-07-28T12:00:00.000Z";

class FakePort implements FulfillmentOperationsPort {
  assignments: AssignFulfillmentInput[] = [];
  transitions: TransitionFulfillmentInput[] = [];
  queries: FulfillmentQueueQuery[] = [];
  rows: FulfillmentAssignmentView[] = [];
  preparations: PrepareFulfillmentOrderInput[] = [];

  async listAssignments(query: FulfillmentQueueQuery) {
    this.queries.push(query);
    return this.rows;
  }

  async prepareOrder(input: PrepareFulfillmentOrderInput): Promise<FulfillmentPreparationResult> {
    this.preparations.push(input);
    return {
      fulfillmentOrderId: null,
      ready: false,
      reason: "PAID_ORDER_BOUNDARY_REQUIRED",
    };
  }

  async assign(input: AssignFulfillmentInput): Promise<FulfillmentCommandResult> {
    this.assignments.push(input);
    return {
      assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      state: "assigned",
      version: 1,
      idempotentReplay: false,
    };
  }

  async transition(input: TransitionFulfillmentInput): Promise<FulfillmentCommandResult> {
    this.transitions.push(input);
    return {
      assignmentId: input.assignmentId,
      state: "acknowledged",
      version: input.expectedVersion + 1,
      idempotentReplay: false,
    };
  }
}

function assignment(): AssignFulfillmentInput {
  return {
    actor: INTERNAL,
    supplierId: "33333333-3333-4333-8333-333333333333",
    supplierOfferId: "44444444-4444-4444-8444-444444444444",
    fulfillmentOrderId: "55555555-5555-4555-8555-555555555555",
    allocations: [
      {
        fulfillmentLineId: "66666666-6666-4666-8666-666666666666",
        reservationId: "77777777-7777-4777-8777-777777777777",
        reservationAllocationId: "88888888-8888-4888-8888-888888888888",
      },
    ],
    expectedVersion: 0,
    idempotencyKey: "assign:order:1",
    at: AT,
  };
}

function transition(
  overrides: Partial<TransitionFulfillmentInput> = {},
): TransitionFulfillmentInput {
  return {
    actor: SUPPLIER,
    assignmentId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    action: "acknowledge",
    expectedVersion: 1,
    idempotencyKey: "ack:order:1",
    at: AT,
    ...overrides,
  };
}

describe("fulfillment service", () => {
  it("keeps preparation fail-closed until the paid-order RPC boundary exists", async () => {
    const port = new FakePort();
    const service = createFulfillmentOperationsService(port);
    await expect(service.prepareOrder({
      actor: INTERNAL,
      orderId: "99999999-9999-4999-8999-999999999999",
      memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      reservationId: "77777777-7777-4777-8777-777777777777",
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
      expectedVersion: 0,
      idempotencyKey: "prepare:order:1",
      at: AT,
    })).resolves.toEqual({
      fulfillmentOrderId: null,
      ready: false,
      reason: "PAID_ORDER_BOUNDARY_REQUIRED",
    });
    expect(port.preparations).toHaveLength(1);
  });

  it("accepts a bounded internal exact-allocation assignment", async () => {
    const port = new FakePort();
    const service = createFulfillmentOperationsService(port);
    await expect(service.assign(assignment())).resolves.toMatchObject({
      state: "assigned",
      version: 1,
    });
    expect(port.assignments).toHaveLength(1);
  });

  it("rejects supplier-created assignments and reused reservation allocations", async () => {
    const service = createFulfillmentOperationsService(new FakePort());
    await expect(
      service.assign({ ...assignment(), actor: SUPPLIER }),
    ).rejects.toThrow(/Only internal operations/);
    const input = assignment();
    input.allocations.push({ ...input.allocations[0] });
    await expect(service.assign(input)).rejects.toThrow(/cannot be reused/);
  });

  it("permits multiple distinct exact-lot allocations for one line", async () => {
    const port = new FakePort();
    const service = createFulfillmentOperationsService(port);
    const input = assignment();
    input.allocations.push({
      ...input.allocations[0],
      reservationAllocationId: "99999999-9999-4999-8999-999999999999",
    });
    await expect(service.assign(input)).resolves.toMatchObject({ state: "assigned" });
  });

  it("requires positive optimistic versions and exact normalized instants", async () => {
    const service = createFulfillmentOperationsService(new FakePort());
    await expect(
      service.transition(transition({ expectedVersion: 0 })),
    ).rejects.toThrow(/positive expected version/);
    expect(() => normalizeInstant("2026-07-28")).toThrow(/normalized/);
  });

  it("requires evidence for packing, shipping, and exception states", async () => {
    const service = createFulfillmentOperationsService(new FakePort());
    await expect(service.transition(transition({ action: "pack" }))).rejects.toThrow(
      /label reference/,
    );
    await expect(service.transition(transition({ action: "ship" }))).rejects.toThrow(
      /label, carrier, service, and tracking/,
    );
    await expect(
      service.transition(transition({ action: "record_damage" })),
    ).rejects.toThrow(/requires a concise reason/);
  });

  it("passes supplier-scoped queue requests without widening them", async () => {
    const port = new FakePort();
    const service = createFulfillmentOperationsService(port);
    await service.listAssignments({ actor: SUPPLIER, states: ["assigned"], limit: 25 });
    expect(port.queries[0]).toEqual({
      actor: SUPPLIER,
      states: ["assigned"],
      limit: 25,
    });
  });
});

describe("fulfillment transition graph", () => {
  it("has one-way terminal outcomes", () => {
    for (const terminal of ["returned", "damaged", "lost", "recalled", "cancelled"] as const) {
      expect(FULFILLMENT_TRANSITIONS[terminal]).toEqual({});
    }
  });

  it("does not permit shipping before packing", () => {
    expect(FULFILLMENT_TRANSITIONS.assigned.ship).toBeUndefined();
    expect(FULFILLMENT_TRANSITIONS.acknowledged.ship).toBeUndefined();
    expect(FULFILLMENT_TRANSITIONS.picking.ship).toBeUndefined();
    expect(FULFILLMENT_TRANSITIONS.packed.ship).toBe("shipped");
  });
});
