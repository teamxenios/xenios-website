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
import type {
  AssistedOrderCatalogQuery,
  AssistedOrderSubmitInput,
} from "../../../shared/research/assisted-order/contract";
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

function buildApp(onCatalogQuery?: (query: AssistedOrderCatalogQuery) => void) {
  const repository = new InMemoryAssistedOrderRepository();
  const composition = createAssistedOrderProductionComposition({
    enabled: true,
    legal: {
      requiredAgreements: async () => [
        { kind: "assisted_order_request_notice", version: "v1" },
      ],
    },
    catalog: {
      list: async (_viewer, query) => {
        onCatalogQuery?.(query);
        return {
          items: [CATALOG_ITEM],
          total: 1,
          page: 1,
          pageSize: 24,
          families: [CATALOG_ITEM.family],
          channels: [CATALOG_ITEM.channel],
          workflowModes: [CATALOG_ITEM.workflowMode],
        };
      },
      resolveLine: async (_viewer, requested) => ({
        lineId: "assigned-by-service",
        productId: CATALOG_ITEM.productId,
        variantId: CATALOG_ITEM.variantId,
        productName: CATALOG_ITEM.productName,
        specification: CATALOG_ITEM.specification,
        format: CATALOG_ITEM.format,
        packBasis: CATALOG_ITEM.packBasis,
        quantity: requested.quantity,
        minimumQuantity: CATALOG_ITEM.minimumQuantity,
        maximumQuantity: CATALOG_ITEM.maximumQuantity,
        quantityIncrement: CATALOG_ITEM.quantityIncrement,
        workflowMode: CATALOG_ITEM.workflowMode,
        customerActionLabel: CATALOG_ITEM.actionLabel,
        unitPriceCents: CATALOG_ITEM.unitPriceCents,
        lineEstimateCents: null,
        currency: "USD",
        catalogVersion: CATALOG_ITEM.catalogVersion,
        priceVersion: CATALOG_ITEM.priceVersion,
        accessNotice: CATALOG_ITEM.accessNotice,
        researchUseOnly: CATALOG_ITEM.researchUseOnly,
        authoritativeFingerprint: "authority-fingerprint",
      }),
    },
    repository,
    outbox: { enqueue: async () => undefined },
    audit: { record: async () => undefined },
    documents,
    adminNotificationEmail: "research@xeniostechnology.com",
  });
  expect(composition.refusalReason).toBeNull();

  const viewers = createAssistedOrderViewerResolvers({
    // The member resolves from a header only this test sends; the pricing
    // viewer rides along exactly as the production resolver carries it.
    resolveMember: async (req) =>
      req.headers["x-test-member"] === "1"
        ? {
            id: MEMBER_ID,
            email: "member@example.com",
            pricingViewer: { audience: "member", email: "member@example.com" },
          }
        : null,
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
  it("parses the structured customer Action group without deriving button copy", async () => {
    let observed: AssistedOrderCatalogQuery | undefined;
    const app = buildApp((query) => {
      observed = query;
    });

    const response = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .query({
        q: "Alpha",
        family: "research_peptides_materials",
        action: "request_order",
      })
      .set("x-test-member", "1");

    expect(response.status).toBe(200);
    expect(observed).toMatchObject({
      search: "Alpha",
      family: "research_peptides_materials",
      actionGroup: "request_order",
    });
  });

  it("rejects tampered Action and workflow tokens instead of broadening the catalog", async () => {
    const observed: AssistedOrderCatalogQuery[] = [];
    const app = buildApp((query) => observed.push(query));

    const invalidAction = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .query({ action: "direct_order_request" })
      .set("x-test-member", "1");
    expect(invalidAction.status).toBe(400);
    expect(invalidAction.body).toMatchObject({
      error: "validation_error",
      field: "action",
    });

    const invalidWorkflow = await request(app)
      .get("/api/research/early-access/assisted-orders/catalog")
      .query({ workflowMode: "anything_goes" })
      .set("x-test-member", "1");
    expect(invalidWorkflow.status).toBe(400);
    expect(invalidWorkflow.body).toMatchObject({
      error: "validation_error",
      field: "workflowMode",
    });
    expect(observed).toEqual([]);
  });

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
