import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import type {
  FulfillmentActor,
  TransitionFulfillmentInput,
} from "@shared/research/fulfillment/contracts";
import { createProductionFulfillmentOperationsPort } from "./production";

const source = readFileSync(resolve(__dirname, "production.ts"), "utf8");
const AT = "2026-08-19T12:00:00.000Z";
const INTERNAL: FulfillmentActor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  kind: "internal",
  role: "operations_admin",
};

function clientReturning(data: unknown, error: unknown = null) {
  return {
    rpc: vi.fn(async () => ({ data, error })),
  } as never;
}

function commandInput(): TransitionFulfillmentInput {
  return {
    actor: INTERNAL,
    assignmentId: "22222222-2222-4222-8222-222222222222",
    action: "acknowledge",
    expectedVersion: 1,
    idempotencyKey: "synthetic:transition:1",
    at: AT,
  };
}

function assignmentRow(overrides: Record<string, unknown> = {}) {
  return {
    assignmentId: "22222222-2222-4222-8222-222222222222",
    fulfillmentOrderId: "33333333-3333-4333-8333-333333333333",
    orderReference: "XEN-1001",
    supplierId: "44444444-4444-4444-8444-444444444444",
    supplierLabel: "Synthetic supplier",
    state: "assigned",
    version: 1,
    expectedShipAt: null,
    recipient: {
      name: "Synthetic recipient",
      addressLine1: "10 Test Way",
      addressLine2: null,
      city: "Austin",
      state: "TX",
      postalCode: "78701",
      country: "US",
      phone: null,
    },
    shippingService: "ground",
    handlingProfile: "ambient",
    lines: [{
      lineId: "55555555-5555-4555-8555-555555555555",
      sku: "SYNTHETIC-SKU",
      quantity: 1,
      lotId: "66666666-6666-4666-8666-666666666666",
      lotCode: "SYNTHETIC-LOT",
    }],
    labelReference: null,
    carrier: null,
    trackingReference: null,
    updatedAt: AT,
    ...overrides,
  };
}

describe("production fulfillment persistence boundary", () => {
  it("uses reviewed command RPCs for every mutation", () => {
    expect(source).toContain('.rpc("research_fulfillment_assign"');
    expect(source).toContain('.rpc("research_fulfillment_transition"');
    expect(source).not.toContain('.rpc("research_fulfillment_prepare_order"');
    expect(source).not.toMatch(/\.(insert|update|upsert|delete)\s*\(/);
  });

  it("reauthorizes supplier PII reads inside the reviewed fixed-path RPC", () => {
    expect(source).toContain('"research_fulfillment_list_assignments"');
    expect(source).toContain("p_actor_auth_user_id: query.actor.actorId");
    expect(source).toContain("p_supplier_scope_id:");
    expect(source).not.toMatch(/\.from\("research_fulfillment_/);
  });

  it("constructs the minimum-necessary projection explicitly", () => {
    expect(source).not.toContain("member_email");
    expect(source).not.toContain("assessment");
    expect(source).not.toContain("health");
    expect(source).not.toMatch(/return\s+\{\s*\.\.\.row/);
  });

  it("returns a truthful paid-order dependency instead of fake assignment state", () => {
    expect(source).toContain("fulfillmentOrderId: null");
    expect(source).toContain("ready: false");
    expect(source).toContain('reason: "PAID_ORDER_BOUNDARY_REQUIRED"');
  });

  it.each([
    [{ state: "invented" }, "state"],
    [{ version: 0 }, "version"],
    [{ idempotentReplay: "false" }, "idempotentReplay"],
  ] as const)("rejects malformed command evidence %j", async (patch, field) => {
    const port = createProductionFulfillmentOperationsPort(clientReturning({
      assignmentId: "22222222-2222-4222-8222-222222222222",
      state: "assigned",
      version: 2,
      idempotentReplay: false,
      ...patch,
    }));
    await expect(port.transition(commandInput())).rejects.toThrow(field);
  });

  it("rejects malformed queue semantics instead of casting them authoritative", async () => {
    const malformed = [
      assignmentRow({ state: "invented" }),
      assignmentRow({ version: -1 }),
      assignmentRow({ handlingProfile: "roomish" }),
      assignmentRow({ expectedShipAt: "tomorrow" }),
      assignmentRow({ recipient: { ...assignmentRow().recipient, country: "CA" } }),
      assignmentRow({ lines: [] }),
      assignmentRow({ lines: [{
        lineId: "55555555-5555-4555-8555-555555555555",
        sku: "SYNTHETIC-SKU",
        quantity: 0,
        lotId: "66666666-6666-4666-8666-666666666666",
        lotCode: "SYNTHETIC-LOT",
      }] }),
      assignmentRow({ updatedAt: "not-an-instant" }),
    ];
    for (const row of malformed) {
      const port = createProductionFulfillmentOperationsPort(clientReturning([row]));
      await expect(port.listAssignments({ actor: INTERNAL })).rejects.toThrow(
        /Fulfillment persistence returned invalid/,
      );
    }
  });

  it("refuses a queue response larger than the requested bound", async () => {
    const port = createProductionFulfillmentOperationsPort(
      clientReturning([assignmentRow(), assignmentRow({ assignmentId: "another" })]),
    );
    await expect(port.listAssignments({ actor: INTERNAL, limit: 1 })).rejects.toThrow(
      /queue length/,
    );
  });

  it("drops raw database error details at the persistence boundary", async () => {
    const port = createProductionFulfillmentOperationsPort(
      clientReturning(null, { message: "private_table private@example.invalid" }),
    );
    await expect(port.listAssignments({ actor: INTERNAL })).rejects.toThrow(
      /^Fulfillment queue unavailable\.$/,
    );
  });
});
