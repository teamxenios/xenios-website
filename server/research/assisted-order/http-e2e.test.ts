// The narrowest HTTP end-to-end proof of the Phase Zero customer journey the
// 2026-08-18 recovery packet required:
//
//   CTA/config -> catalog -> submit -> XRR reference -> status -> admin queue
//
// Real Express doors registered exactly the way server/index.ts registers
// them (the same descriptor table, the same express handler adapter, the same
// viewer resolvers, an admin guard IN FRONT of the admin doors), over the
// composed production service with the in-memory repository port. No mocks of
// the code under test — only the infrastructure ports are fixtures.

import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import type { AssistedOrderSubmitInput } from "../../../shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";
import {
  assistedOrderExpressHandler,
  createAssistedOrderViewerResolvers,
  type ExpressAssistedOrderRequest,
} from "./express";
import { createAssistedOrderRouteTable } from "./http";
import { InMemoryAssistedOrderRepository } from "./memory-repository";
import type { AssistedOrderDocumentStore } from "./ports";
import { createAssistedOrderProductionComposition } from "./production";

const MEMBER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const ADMIN_BEARER = "Bearer admin-test";

const FORM_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((a) => ({
  ...assistedOrderFormPair(a),
  acceptedAt: "2026-08-19T12:00:00.000Z",
}));

const CATALOG_ITEM = Object.freeze({
  productId: "pc_product_1",
  variantId: "pc_variant_1",
  productName: "BPC-157",
  family: "research_vials",
  channel: "Peptides & Research",
  specification: "5 mg vial",
  format: null,
  packBasis: null,
  minimumQuantity: 1,
  maximumQuantity: 100,
  quantityIncrement: 1,
  unitPriceCents: 9900,
  currency: "USD" as const,
  workflowMode: "direct_order_request" as const,
  actionLabel: "Add to order request",
  accessNotice: null,
  researchUseOnly: false,
  catalogVersion: "catalog-v1",
  priceVersion: "price_1",
});

const documents: AssistedOrderDocumentStore = {
  createUpload: async (uploadRequest) => ({
    documentId: "assigned-by-service",
    uploadUrl: "https://storage.example/upload",
    objectPath: uploadRequest.objectPath,
    expiresAt: "2026-08-19T12:15:00.000Z",
    requiredHeaders: { "content-type": uploadRequest.mimeType },
  }),
  createDownload: async () => ({
    url: "https://storage.example/download",
    expiresAt: "2026-08-19T12:05:00.000Z",
  }),
};

function submitInput(): AssistedOrderSubmitInput {
  return {
    idempotencyKey: "http-e2e-1",
    contact: {
      fullLegalName: "Test Member",
      email: "member@example.com",
      mobilePhone: "+15125550100",
      ageConfirmed: true,
      shippingAddress: {
        line1: "100 Test Street",
        city: "Austin",
        region: "TX",
        postalCode: "78704",
        countryCode: "US",
      },
      billingSameAsShipping: true,
    },
    agreements: [
      {
        kind: "assisted_order_request_notice",
        version: "v1",
        acceptedAt: "2026-08-19T12:00:00.000Z",
      },
      ...FORM_PAIRS,
    ],
    lines: [
      {
        productId: CATALOG_ITEM.productId,
        variantId: CATALOG_ITEM.variantId,
        quantity: 2,
        expectedCatalogVersion: CATALOG_ITEM.catalogVersion,
        expectedPriceVersion: CATALOG_ITEM.priceVersion,
        expectedUnitPriceCents: CATALOG_ITEM.unitPriceCents,
      },
    ],
  };
}

type BuildOptions = {
  /** Override the single catalog row, to drive a non-direct pathway. */
  item?: typeof CATALOG_ITEM;
  /** Collect outbox intents, to prove exactly two land per submit. */
  notifications?: unknown[];
};

function buildApp(options: BuildOptions = {}) {
  const item = options.item ?? CATALOG_ITEM;
  const repository = new InMemoryAssistedOrderRepository();
  const composition = createAssistedOrderProductionComposition({
    enabled: true,
    legal: {
      requiredAgreements: async () => [
        { kind: "assisted_order_request_notice", version: "v1" },
      ],
    },
    catalog: {
      list: async () => ({
        items: [item],
        total: 1,
        page: 1,
        pageSize: 24,
        families: [item.family],
        channels: [item.channel],
        workflowModes: [item.workflowMode],
      }),
      resolveLine: async (_viewer, requested) => ({
        lineId: "assigned-by-service",
        productId: item.productId,
        variantId: item.variantId,
        productName: item.productName,
        specification: item.specification,
        format: item.format,
        packBasis: item.packBasis,
        quantity: requested.quantity,
        minimumQuantity: item.minimumQuantity,
        maximumQuantity: item.maximumQuantity,
        quantityIncrement: item.quantityIncrement,
        workflowMode: item.workflowMode,
        customerActionLabel: item.actionLabel,
        unitPriceCents: item.unitPriceCents,
        lineEstimateCents: null,
        currency: "USD",
        catalogVersion: item.catalogVersion,
        priceVersion: item.priceVersion,
        accessNotice: item.accessNotice,
        researchUseOnly: item.researchUseOnly,
        authoritativeFingerprint: "authority-fingerprint",
      }),
    },
    repository,
    outbox: {
      enqueue: async (intent) => {
        options.notifications?.push(intent);
      },
    },
    audit: { record: async () => undefined },
    documents,
    adminNotificationEmail: "research@xeniostechnology.com",
  });
  expect(composition.refusalReason).toBeNull();

  const viewers = createAssistedOrderViewerResolvers({
    // The member resolves from a header only this test sends; the pricing
    // viewer rides along exactly as the production resolver carries it.
    resolveMember: async (req) => {
      // "1" is the customer who places the order; any other value is a
      // DIFFERENT signed-in member, which is what makes a real IDOR test
      // possible: authorized to use the feature, not authorized for this row.
      const header = req.headers["x-test-member"];
      if (typeof header !== "string" || header === "") return null;
      const id = header === "1" ? MEMBER_ID : OTHER_MEMBER_ID;
      const email = header === "1" ? "member@example.com" : "other@example.com";
      return { id, email, pricingViewer: { audience: "member", email } };
    },
    earlyAccess: () => null,
    adminEmail: () => "research@xeniostechnology.com",
  });

  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    composition.service!,
    viewers,
  );
  const door = (method: "GET" | "POST" | "PATCH", path: string): RequestHandler => {
    const descriptor = routes.find(
      (candidate) => candidate.method === method && candidate.path === path,
    );
    if (!descriptor) throw new Error(`descriptor missing: ${method} ${path}`);
    return assistedOrderExpressHandler(descriptor);
  };
  // The admin guard runs BEFORE the admin doors, exactly as
  // requireSupabaseAdmin does in server/index.ts.
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === ADMIN_BEARER) return next();
    res.status(401).json({ error: "unauthorized" });
  };

  const app = express();
  app.use(express.json());
  app.get("/api/research/early-access/assisted-orders/config", door("GET", "/api/research/early-access/assisted-orders/config"));
  app.get("/api/research/early-access/assisted-orders/catalog", door("GET", "/api/research/early-access/assisted-orders/catalog"));
  app.post("/api/research/early-access/assisted-orders", door("POST", "/api/research/early-access/assisted-orders"));
  app.get("/api/research/early-access/assisted-orders/:publicReference", door("GET", "/api/research/early-access/assisted-orders/:publicReference"));
  app.get("/api/admin/research/assisted-orders", requireAdmin, door("GET", "/api/admin/research/assisted-orders"));
  app.get("/api/admin/research/assisted-orders/:requestId", requireAdmin, door("GET", "/api/admin/research/assisted-orders/:requestId"));
  return app;
}

describe("Phase Zero HTTP journey: CTA -> catalog -> submit -> XRR -> status -> admin queue", () => {
  it("walks the whole journey over real doors", async () => {
    const app = buildApp();

    // 1. The CTA's config probe: enabled, with the exact legal pairs.
    const config = await request(app).get(
      "/api/research/early-access/assisted-orders/config",
    );
    expect(config.status).toBe(200);
    expect(config.body.enabled).toBe(true);
    expect(config.body.requiredAgreements).toEqual([
      { kind: "assisted_order_request_notice", version: "v1" },
    ]);

    // 2. The member browses the catalog.
    const catalog = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .set("x-test-member", "1");
    expect(catalog.status).toBe(200);
    expect(catalog.body.items).toHaveLength(1);
    expect(catalog.body.items[0].unitPriceCents).toBe(9900);

    // 3. An anonymous submit is refused; admission is not authorization.
    const anonymous = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .send(submitInput());
    expect(anonymous.status).toBe(403);

    // 4. The member submits and receives a durable XRR reference.
    const submitted = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1")
      .send(submitInput());
    expect(submitted.status).toBe(201);
    const reference: string = submitted.body.publicReference;
    expect(reference).toMatch(/^XRR-\d{8}-[0-9A-F]{10}$/);

    // 5. The member reads their own status by reference.
    const status = await request(app)
      .get(`/api/research/early-access/assisted-orders/${reference}`)
      .set("x-test-member", "1");
    expect(status.status).toBe(200);
    expect(status.body.requestId).toBe(submitted.body.requestId);

    // 6. The admin queue answers only behind the guard.
    const unguarded = await request(app).get("/api/admin/research/assisted-orders");
    expect(unguarded.status).toBe(401);

    const queue = await request(app)
      .get("/api/admin/research/assisted-orders")
      .set("authorization", ADMIN_BEARER);
    expect(queue.status).toBe(200);
    expect(JSON.stringify(queue.body)).toContain(reference);

    // 7. The admin detail shows the request; the customer surface never
    // carried supplier cost or margin, and the admin DTO carries no secrets
    // this fixture never provided.
    const detail = await request(app)
      .get(`/api/admin/research/assisted-orders/${submitted.body.requestId}`)
      .set("authorization", ADMIN_BEARER);
    expect(detail.status).toBe(200);
    const surfaces = JSON.stringify([submitted.body, status.body, catalog.body]).toLowerCase();
    for (const banned of ["wholesale", "margin", "suppliercost", "grossprofit"]) {
      expect(surfaces).not.toContain(banned);
    }
  });
});

/**
 * NEGATIVE CONTROLS OVER THE REAL DOORS.
 *
 * Every Phase Zero defect that actually reached a customer this month was
 * unit-green and broken through the door: the legal port that was built and
 * never passed on, the pricing viewer that was read and never attached, the
 * form acknowledgments the client never sent. So these assert through Express,
 * over the composed production service, not against the service object.
 *
 * Each one is a rule the founder stated, expressed as the thing that must NOT
 * happen.
 */
describe("what the order door must refuse", () => {
  const member = (app: ReturnType<typeof buildApp>) =>
    request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1");

  it("refuses a tampered unit price instead of quietly repricing it", async () => {
    // The browser is not a price authority. A submit claiming a cheaper unit
    // price must fail loudly; silently substituting the real price would let a
    // tampered order through and charge a number the customer never saw.
    const app = buildApp();
    const response = await member(app).send({
      ...submitInput(),
      lines: [{ ...submitInput().lines[0], expectedUnitPriceCents: 1 }],
    });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("price_changed");
  });

  it("refuses a quantity above the catalog ceiling", async () => {
    const app = buildApp();
    const response = await member(app).send({
      ...submitInput(),
      lines: [{ ...submitInput().lines[0], quantity: CATALOG_ITEM.maximumQuantity + 1 }],
    });
    expect(response.status).toBe(400);
    expect(response.body.field).toContain("quantity");
  });

  it("never turns a Care product into a direct order", async () => {
    // A provider-pathway row may still be REQUESTED — that is the honest
    // answer — but it must never come back as a direct order. The pathway is
    // decided by the canonical workflow mode, never by the fact it is priced.
    const app = buildApp({
      item: { ...CATALOG_ITEM, workflowMode: "provider_request" as const },
    });
    const response = await member(app).send(submitInput());
    expect(response.status).toBe(201);
    expect(response.body.lines[0].workflowMode).toBe("provider_request");
    expect(response.body.lines[0].workflowMode).not.toBe("direct_order_request");
  });

  it("keeps a price-pending row unpriced rather than rendering it as free", async () => {
    const app = buildApp({
      item: {
        ...CATALOG_ITEM,
        workflowMode: "request_pricing" as const,
        unitPriceCents: null as unknown as number,
        priceVersion: null as unknown as string,
      },
    });
    const response = await member(app).send({
      ...submitInput(),
      lines: [
        {
          productId: CATALOG_ITEM.productId,
          variantId: CATALOG_ITEM.variantId,
          quantity: 2,
          expectedCatalogVersion: CATALOG_ITEM.catalogVersion,
        },
      ],
    });
    expect(response.status).toBe(201);
    expect(response.body.lines[0].unitPriceCents).toBeNull();
    expect(response.body.lines[0].lineEstimateCents).toBeNull();
    expect(response.body.estimatedTotalCents).toBeNull();
    expect(JSON.stringify(response.body)).not.toContain('"unitPriceCents":0');
  });

  it("refuses a submit missing the required form acknowledgments", async () => {
    // The exact defect that made every real browser submit fail in August: the
    // client rendered the legal pairs and never the form facts. Pinned here so
    // a future client change that drops them fails at the door.
    const app = buildApp();
    const response = await member(app).send({
      ...submitInput(),
      agreements: [
        { kind: "assisted_order_request_notice", version: "v1", acceptedAt: "2026-08-19T12:00:00.000Z" },
      ],
    });
    expect(response.status).toBe(400);
    expect(response.body.field).toBe("agreements");
  });

  it("does not let one customer read another customer's order", async () => {
    const app = buildApp();
    const submitted = await member(app).send(submitInput());
    expect(submitted.status).toBe(201);
    // A DIFFERENT signed-in member holding the reference. They are authorized
    // to use the feature, so this is a genuine ownership check rather than a
    // capability one, and the answer is 404 — never a 403, which would confirm
    // the reference exists.
    const foreign = await request(app)
      .get(`/api/research/early-access/assisted-orders/${submitted.body.publicReference}`)
      .set("x-test-member", "2");
    expect(foreign.status).toBe(404);

    // And an anonymous reader with no capability at all is refused outright.
    const anonymous = await request(app).get(
      `/api/research/early-access/assisted-orders/${submitted.body.publicReference}`,
    );
    expect(anonymous.status).toBe(403);
  });
});

describe("the manual-order chain, over the real doors", () => {
  it("creates exactly one request, one reference and two notifications", async () => {
    // The founder's launch: submit produces a durable reference AND lands in
    // two inboxes. Exactly two — a duplicate admin mail is a duplicate order
    // in the founder's queue.
    const notifications: unknown[] = [];
    const app = buildApp({ notifications });
    const submitted = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1")
      .send({ ...submitInput(), declaredAffiliateCode: "DANA10" });
    expect(submitted.status).toBe(201);
    expect(submitted.body.publicReference).toMatch(/^XRR-\d{8}-[0-9A-F]{10}$/);

    expect(notifications).toHaveLength(2);
    const kinds = notifications
      .map((intent) => (intent as { recipientKind: string }).recipientKind)
      .sort();
    expect(kinds).toEqual(["admin", "customer"]);
  });

  it("carries the typed affiliate code to the operator without ever verifying it", async () => {
    // A typed code is a CLAIM. It must reach the founder so they can match it
    // by hand, and it must never be promoted into verified attribution, which
    // is derived only from the signed cookie.
    const app = buildApp();
    const submitted = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1")
      .send({ ...submitInput(), declaredAffiliateCode: "dana10" });
    expect(submitted.status).toBe(201);

    const detail = await request(app)
      .get(`/api/admin/research/assisted-orders/${submitted.body.requestId}`)
      .set("authorization", ADMIN_BEARER);
    expect(detail.status).toBe(200);
    expect(detail.body.declaredAffiliateCode).toBe("DANA10");
    expect(detail.body.declaredAffiliateCodeState).toBe("captured_unmatched");
    expect(detail.body.affiliateAttributionRef).toBeNull();
  });

  it("does not create a second order when the customer submits twice", async () => {
    const notifications: unknown[] = [];
    const app = buildApp({ notifications });
    const first = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1")
      .send(submitInput());
    const second = await request(app)
      .post("/api/research/early-access/assisted-orders")
      .set("x-test-member", "1")
      .send(submitInput());
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.publicReference).toBe(first.body.publicReference);
    // And the founder's inbox does not get the order twice.
    expect(notifications).toHaveLength(2);
  });
});
