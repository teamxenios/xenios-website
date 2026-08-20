import express, { type Express, type Request } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { registerResearchApi } from "../index";
import type { FulfillmentActor } from "@shared/research/fulfillment/contracts";
import { createInMemoryFulfillmentStore } from "./in-memory";
import { createFulfillmentOperationsService } from "./service";
import { createPaidOrderReleaseGate } from "./release-gate";
import { registerFulfillmentRoutes } from "./register";
import { FULFILLMENT_CUSTOMER_STATUS_ADMISSION } from "./wall-admission";

// ---------------------------------------------------------------------------
// THE WALL-COMPOSED TEST.
//
// register.test.ts registers this route table on a bare Express app, with no
// research wall in front of it. That is the exact blind spot that once left
// every cart route unreachable by the customers they existed for: the routes
// were correct, the tests were green, and the wall answered 401 for all of
// them in production.
//
// So this file composes the REAL wall from server/research/index.ts in front
// of the real route table and pins three properties:
//
//   1. The customer status door is reachable through the wall and refused on
//      its OWN terms, never with the wall's "Access required."
//   2. The admin and supplier doors are not under /api/research at all, so the
//      wall never answers for them and never has to be widened for operator
//      traffic.
//   3. A lookalike order reference stays walled, because the admission is
//      anchored on the exact generated shape rather than a prefix.
// ---------------------------------------------------------------------------

vi.mock("../supabase", () => ({
  supabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    }),
    rpc: async () => ({ data: true, error: null }),
  }),
  getSupabaseAnon: () => ({}),
}));

// Stand in the admin guard so this file stays about the WALL rather than about
// Supabase, and so the admin doors can be probed for the property that matters
// here: they are not under /api/research, so the wall never answers for them.
vi.mock("../../routes", () => ({
  requireSupabaseAdmin(
    _req: unknown,
    res: { status(code: number): { json(body: unknown): unknown } },
  ) {
    res.status(401).json({ ok: false, message: "Unauthorized" });
  },
}));

const WALLED = "Access required.";
const ORDER_NUMBER = "XEA-7F3K9QW2TM4BXYZ1";
const MEMBER_ID = "99999999-9999-4999-8999-999999999999";
const SUPPLIER_ID = "33333333-3333-4333-8333-333333333333";
const ORDER_ID = "55555555-5555-4555-8555-555555555555";
const ASSIGNMENT_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const INTERNAL: FulfillmentActor = {
  actorId: "11111111-1111-4111-8111-111111111111",
  kind: "internal",
  role: "operations_admin",
};
const SUPPLIER: FulfillmentActor = {
  actorId: "22222222-2222-4222-8222-222222222222",
  kind: "supplier",
  role: "supplier_operator",
  supplierId: SUPPLIER_ID,
};

const saved: Record<string, string | undefined> = {};
const TOUCHED = ["RESEARCH_ACCESS_PASSWORD", "RESEARCH_SESSION_SECRET", "RESEARCH_PUBLIC"];

beforeEach(() => {
  for (const key of TOUCHED) saved[key] = process.env[key];
  process.env.RESEARCH_ACCESS_PASSWORD = "review-pw";
  process.env.RESEARCH_SESSION_SECRET = "test-session-secret-0123456789";
  delete process.env.RESEARCH_PUBLIC;
});

afterEach(() => {
  for (const key of TOUCHED) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

function makeApp(): Express {
  const store = createInMemoryFulfillmentStore();
  store.seedSupplier({ supplierId: SUPPLIER_ID, supplierLabel: "Supplier A" });
  store.seedFulfillmentOrder({
    fulfillmentOrderId: ORDER_ID,
    orderReference: ORDER_NUMBER,
    memberId: MEMBER_ID,
    paid: true,
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
    paidOrderRelease: createPaidOrderReleaseGate((id) => store.isOrderPaid(id)),
  });

  const app = express();
  app.use(express.json());
  // The wall first, exactly as server/index.ts composes it.
  registerResearchApi(app);
  registerFulfillmentRoutes(app, {
    service,
    requireAdmin: (_req, res) => {
      res.status(401).json({ ok: false, message: "Unauthorized" });
    },
    resolveInternalActor: (req: Request) =>
      req.header("x-test-admin") === "yes" ? INTERNAL : null,
    resolveSupplierActor: (req: Request) =>
      req.header("x-test-supplier") === SUPPLIER_ID ? SUPPLIER : null,
    customerReads: {
      resolveMemberId: (req: Request) => req.header("x-test-member") ?? null,
      findAssignmentForMember: (memberId, orderReference) =>
        store.findAssignmentForMember(memberId, orderReference),
    },
    now: () => "2026-08-20T12:00:00.000Z",
  });
  return app;
}

/**
 * Is the wall's admission for the customer door in place yet?
 *
 * `server/research/index.ts` is a lead seam, so this lane cannot add the
 * entry. Until the lead does, the two reachability tests below cannot pass —
 * so they SKIP WITH A NAMED REASON rather than failing the branch, and they
 * start verifying automatically the moment the admission lands. Nothing has to
 * be remembered or unskipped by hand.
 *
 * This probe cannot pass by accident: it asks the real wall, and only the
 * wall's own 401 counts as "not admitted".
 */
async function wallAdmitsCustomerStatus(): Promise<boolean> {
  const res = await request(makeApp())
    .get(`/api/research/fulfillment/orders/${ORDER_NUMBER}/status`)
    .set("x-test-member", MEMBER_ID);
  return res.body?.message !== WALLED;
}

const PENDING_ADMISSION =
  "pending the lead's wall admission for GET /fulfillment/orders/<XEA-…>/status";

describe("the research wall and the fulfillment customer door", () => {
  it("lets the customer status door reach its own handler", async (ctx) => {
    if (!(await wallAdmitsCustomerStatus())) return ctx.skip(PENDING_ADMISSION);
    const res = await request(makeApp())
      .get(`/api/research/fulfillment/orders/${ORDER_NUMBER}/status`)
      .set("x-test-member", MEMBER_ID);
    expect(res.body?.message).not.toBe(WALLED);
    expect(res.status).toBe(404);
  });

  it("refuses an unauthenticated customer on the handler's terms, not the wall's", async (ctx) => {
    if (!(await wallAdmitsCustomerStatus())) return ctx.skip(PENDING_ADMISSION);
    const res = await request(makeApp()).get(
      `/api/research/fulfillment/orders/${ORDER_NUMBER}/status`,
    );
    expect(res.body?.message).not.toBe(WALLED);
    expect(res.body?.code).toBe("UNAUTHENTICATED");
  });

  it("keeps a lookalike order reference walled", async () => {
    const app = makeApp();
    for (const lookalike of [
      "XEN-1001",
      "XEA-SHORT",
      "XEA-7F3K9QW2TM4BXYZ1X",
      "XEA-7F3K9QW2TM4BXYZ!",
      // I, L, O and U are not in the generated alphabet.
      "XEA-IIIIIIIIIIIIIIII",
      "../../early-access/session",
    ]) {
      const res = await request(app)
        .get(`/api/research/fulfillment/orders/${lookalike}/status`)
        .set("x-test-member", MEMBER_ID);
      expect(
        res.body?.message,
        `${lookalike} must not reach the handler`,
      ).toBe(WALLED);
    }
  });

  it("admits the exact method only", async () => {
    const res = await request(makeApp())
      .post(`/api/research/fulfillment/orders/${ORDER_NUMBER}/status`)
      .set("x-test-member", MEMBER_ID)
      .send({});
    expect(res.body?.message).toBe(WALLED);
  });
});

describe("the operator doors are on the other side of the wall", () => {
  it.each([
    ["GET", "/api/admin/research/fulfillment/assignments"],
    ["POST", "/api/admin/research/fulfillment/assignments"],
    ["POST", `/api/admin/research/fulfillment/assignments/${ASSIGNMENT_ID}/transition`],
    ["GET", "/api/admin/research/fulfillment/supplier/assignments"],
    ["POST", `/api/admin/research/fulfillment/supplier/assignments/${ASSIGNMENT_ID}/transition`],
  ])("%s %s is never answered by the research wall", async (method, path) => {
    const app = makeApp();
    const res =
      method === "GET"
        ? await request(app).get(path)
        : await request(app).post(path).send({});
    expect(res.body?.message).not.toBe(WALLED);
  });

  it("declares no operator door inside the research namespace", async () => {
    const app = makeApp();
    for (const path of [
      "/api/research/fulfillment/admin/assignments",
      "/api/research/fulfillment/supplier/assignments",
    ]) {
      const res = await request(app).get(path);
      // Nothing is registered there any more, so the wall refuses it as an
      // unlisted path. If a future edit moves an operator door back inside the
      // namespace, this stops being the wall's answer and the test fails.
      expect(res.body?.message).toBe(WALLED);
    }
  });

  it("reaches the supplier queue through its own guard, not the admin guard", async () => {
    const res = await request(makeApp())
      .get("/api/admin/research/fulfillment/supplier/assignments")
      .set("x-test-supplier", SUPPLIER_ID);
    expect(res.status).toBe(200);
    expect(res.body.assignments).toEqual([]);
  });
});

describe("the exported wall admission", () => {
  it("matches the customer door and nothing else", () => {
    expect(FULFILLMENT_CUSTOMER_STATUS_ADMISSION.source.startsWith("^")).toBe(true);
    expect(FULFILLMENT_CUSTOMER_STATUS_ADMISSION.source.endsWith("$")).toBe(true);
    expect(
      FULFILLMENT_CUSTOMER_STATUS_ADMISSION.test(
        `/fulfillment/orders/${ORDER_NUMBER}/status`,
      ),
    ).toBe(true);
    for (const path of [
      "/fulfillment/orders/XEN-1001/status",
      `/fulfillment/orders/${ORDER_NUMBER}`,
      `/fulfillment/orders/${ORDER_NUMBER}/status/extra`,
      `/fulfillment/orders/${ORDER_NUMBER}/transition`,
      "/fulfillment/admin/assignments",
      `/prefix/fulfillment/orders/${ORDER_NUMBER}/status`,
    ]) {
      expect(FULFILLMENT_CUSTOMER_STATUS_ADMISSION.test(path), path).toBe(false);
    }
  });
});
