import express, { type Express, type Request } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { FulfillmentActor } from "@shared/research/fulfillment/contracts";
import { createInMemoryFulfillmentStore, type InMemoryFulfillmentStore } from "./in-memory";
import { createFulfillmentOperationsService } from "./service";
import { createPaidOrderReleaseGate } from "./release-gate";
import {
  registerFulfillmentRoutes,
  type FulfillmentHttpDependencies,
} from "./register";

const INTERNAL: FulfillmentActor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  kind: "internal",
  role: "operations_admin",
};
const SUPPLIER_A_ID = "33333333-3333-4333-8333-333333333333";
const SUPPLIER_A: FulfillmentActor = {
  actorId: "22222222-2222-4222-8222-222222222222",
  kind: "supplier",
  role: "supplier_operator",
  supplierId: SUPPLIER_A_ID,
};
const MEMBER_ID = "99999999-9999-4999-8999-999999999999";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";
const AT = "2026-08-19T12:00:00.000Z";

interface Harness {
  app: Express;
  store: InMemoryFulfillmentStore;
}

function build(overrides: Partial<FulfillmentHttpDependencies> = {}): Harness {
  const store = createInMemoryFulfillmentStore();
  store.seedSupplier({ supplierId: SUPPLIER_A_ID, supplierLabel: "Supplier A" });
  store.seedFulfillmentOrder({
    fulfillmentOrderId: ORDER_ID,
    orderReference: "XEN-1001",
    memberId: MEMBER_ID,
    paid: false,
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
  const app = express();
  app.use(express.json());
  registerFulfillmentRoutes(app, {
    service,
    requireAdmin: (req, res, next) => {
      if (req.header("x-test-admin") === "yes") return next();
      res.status(401).json({ ok: false, code: "UNAUTHENTICATED" });
    },
    resolveInternalActor: (req: Request) =>
      req.header("x-test-admin") === "yes" ? INTERNAL : null,
    resolveSupplierActor: (req: Request) =>
      req.header("x-test-supplier") === SUPPLIER_A_ID ? SUPPLIER_A : null,
    customerReads: {
      resolveMemberId: (req: Request) => req.header("x-test-member") ?? null,
      findAssignmentForMember: (memberId, orderReference) =>
        store.findAssignmentForMember(memberId, orderReference),
    },
    now: () => AT,
    ...overrides,
  });
  return { app, store };
}

function assignBody(idempotencyKey = "assign:xen-1001") {
  return {
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
    idempotencyKey,
  };
}

async function assignPaid(harness: Harness): Promise<string> {
  harness.store.markOrderPaid(ORDER_ID);
  const response = await request(harness.app)
    .post("/api/research/fulfillment/admin/assignments")
    .set("x-test-admin", "yes")
    .send(assignBody());
  expect(response.status).toBe(201);
  return response.body.result.assignmentId as string;
}

describe("fulfillment HTTP surface", () => {
  it("walls admin routes behind the injected admin guard", async () => {
    const { app } = build();
    await request(app)
      .get("/api/research/fulfillment/admin/assignments")
      .expect(401);
    await request(app)
      .post("/api/research/fulfillment/admin/assignments")
      .send(assignBody())
      .expect(401);
  });

  it("refuses to release an unpaid order to a supplier over HTTP", async () => {
    const { app } = build();
    const response = await request(app)
      .post("/api/research/fulfillment/admin/assignments")
      .set("x-test-admin", "yes")
      .send(assignBody());
    expect(response.status).toBe(409);
    expect(response.body.code).toBe("UNPAID_ORDER");
    expect(response.body.message).toMatch(/Unpaid orders never release/);
  });

  it("assigns a paid order and replays idempotently", async () => {
    const harness = build();
    harness.store.markOrderPaid(ORDER_ID);
    const first = await request(harness.app)
      .post("/api/research/fulfillment/admin/assignments")
      .set("x-test-admin", "yes")
      .send(assignBody());
    expect(first.status).toBe(201);
    const replay = await request(harness.app)
      .post("/api/research/fulfillment/admin/assignments")
      .set("x-test-admin", "yes")
      .send(assignBody());
    expect(replay.status).toBe(200);
    expect(replay.body.result.idempotentReplay).toBe(true);
  });

  it("records acknowledgement, tracking, and exception through admin transitions", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    const ack = await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({ action: "acknowledge", expectedVersion: 1, idempotencyKey: "ack:xen-1001" });
    expect(ack.status).toBe(200);
    expect(ack.body.result.state).toBe("acknowledged");

    const exception = await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({
        action: "record_exception",
        expectedVersion: 2,
        idempotencyKey: "exc:xen-1001",
        reason: "supplier reported a stock shortfall",
      });
    expect(exception.status).toBe(200);
    expect(exception.body.result.state).toBe("exception");

    const tracking = await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({
        action: "record_tracking",
        expectedVersion: 3,
        idempotencyKey: "trk:xen-1001",
        labelReference: "LBL-1",
        carrier: "UPS",
        service: "ground",
        trackingReference: "1Z999",
      });
    expect(tracking.status).toBe(200);
    expect(tracking.body.result.state).toBe("tracking_created");
  });

  it("returns 409 with a typed code on stale versions", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({ action: "acknowledge", expectedVersion: 1, idempotencyKey: "ack:xen-1001" })
      .expect(200);
    const stale = await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({ action: "acknowledge", expectedVersion: 1, idempotencyKey: "ack:retry:1" });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe("VERSION_CONFLICT");
  });

  it("scopes the supplier queue and rejects supplier dispositions", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    const unauthenticated = await request(harness.app).get(
      "/api/research/fulfillment/supplier/assignments",
    );
    expect(unauthenticated.status).toBe(401);

    const queue = await request(harness.app)
      .get("/api/research/fulfillment/supplier/assignments")
      .set("x-test-supplier", SUPPLIER_A_ID);
    expect(queue.status).toBe(200);
    expect(queue.body.assignments).toHaveLength(1);
    const view = queue.body.assignments[0];
    expect(view.assignmentId).toBe(id);
    // The supplier projection carries fulfillment data only.
    expect(JSON.stringify(view)).not.toMatch(/commission|margin|affiliate|memberId/);

    const forbidden = await request(harness.app)
      .post(`/api/research/fulfillment/supplier/assignments/${id}/transition`)
      .set("x-test-supplier", SUPPLIER_A_ID)
      .send({
        action: "record_refund",
        expectedVersion: 1,
        idempotencyKey: "ref:xen-1001",
        reason: "supplier should not do this",
      });
    expect(forbidden.status).toBe(403);
  });

  it("lets a supplier acknowledge their own assignment", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    const ack = await request(harness.app)
      .post(`/api/research/fulfillment/supplier/assignments/${id}/transition`)
      .set("x-test-supplier", SUPPLIER_A_ID)
      .send({ action: "acknowledge", expectedVersion: 1, idempotencyKey: "ack:sup:1001" });
    expect(ack.status).toBe(200);
    expect(ack.body.result.state).toBe("acknowledged");
  });

  it("answers 503 fail-closed when supplier access is not wired", async () => {
    const { app } = build({ resolveSupplierActor: undefined });
    const response = await request(app)
      .get("/api/research/fulfillment/supplier/assignments")
      .set("x-test-supplier", SUPPLIER_A_ID);
    expect(response.status).toBe(503);
    expect(response.body.code).toBe("FULFILLMENT_NOT_CONFIGURED");
  });

  it("serves the customer a safe status that never marks tracking as shipped", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    for (const [action, version, extras] of [
      ["acknowledge", 1, {}],
      ["start_picking", 2, {}],
      ["pack", 3, { labelReference: "LBL-1" }],
      [
        "record_tracking",
        4,
        { labelReference: "LBL-1", carrier: "UPS", service: "ground", trackingReference: "1Z999" },
      ],
    ] as const) {
      await request(harness.app)
        .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
        .set("x-test-admin", "yes")
        .send({
          action,
          expectedVersion: version,
          idempotencyKey: `cust:xen-1001:${version}`,
          ...extras,
        })
        .expect(200);
    }
    const status = await request(harness.app)
      .get("/api/research/fulfillment/orders/XEN-1001/status")
      .set("x-test-member", MEMBER_ID);
    expect(status.status).toBe(200);
    expect(status.body.status.status).toBe("tracking_created");
    expect(status.body.status.shipped).toBe(false);
    expect(status.body.status.trackingReference).toBe("1Z999");
    expect(JSON.stringify(status.body)).not.toMatch(/Supplier A|LOT-100|supplierId/);
  });

  it("hides other members' orders and requires customer identity", async () => {
    const harness = build();
    await assignPaid(harness);
    await request(harness.app)
      .get("/api/research/fulfillment/orders/XEN-1001/status")
      .expect(401);
    const foreign = await request(harness.app)
      .get("/api/research/fulfillment/orders/XEN-1001/status")
      .set("x-test-member", "89999999-9999-4999-8999-999999999999");
    expect(foreign.status).toBe(404);
  });

  it("answers 503 fail-closed when customer reads are not wired", async () => {
    const { app } = build({ customerReads: undefined });
    const response = await request(app)
      .get("/api/research/fulfillment/orders/XEN-1001/status")
      .set("x-test-member", MEMBER_ID);
    expect(response.status).toBe(503);
  });

  it("rejects unknown actions before they reach the service", async () => {
    const harness = build();
    const id = await assignPaid(harness);
    await request(harness.app)
      .post(`/api/research/fulfillment/admin/assignments/${id}/transition`)
      .set("x-test-admin", "yes")
      .send({ action: "teleport", expectedVersion: 1, idempotencyKey: "bad:action:1" })
      .expect(422);
  });
});
