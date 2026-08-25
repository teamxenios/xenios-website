// The composed Early Access intake door, built the way server/index.ts builds
// it: the real descriptor table, the real express adapter, the real viewer
// resolvers, an admin guard IN FRONT of the admin doors, over the real
// production composition. Only infrastructure ports are fixtures.
//
// This harness exists so the launch-invariant suite attacks the SAME seam a
// customer reaches, rather than a module in isolation. The 2026-08-20
// conversion-QA lane found four defects that every module's own green unit
// tests missed, all of them at composition seams.

import express, { type Express, type RequestHandler } from "express";
import {
  assistedOrderActionGroupFor,
  type AssistedOrderCatalogItem,
} from "@shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "@shared/research/assisted-order/form";
import {
  assistedOrderExpressHandler,
  createAssistedOrderViewerResolvers,
  type ExpressAssistedOrderRequest,
} from "../../server/research/assisted-order/express";
import { createAssistedOrderRouteTable } from "../../server/research/assisted-order/http";
import { InMemoryAssistedOrderRepository } from "../../server/research/assisted-order/memory-repository";
import type { AssistedOrderDocumentStore } from "../../server/research/assisted-order/ports";
import { createAssistedOrderProductionComposition } from "../../server/research/assisted-order/production";

export const MEMBER_A = "11111111-1111-4111-8111-111111111111";
export const MEMBER_B = "22222222-2222-4222-8222-222222222222";
export const ADMIN_BEARER = "Bearer admin-test";
export const ACCEPTED_AT = "2026-08-20T12:00:00.000Z";

/** The exact legal pair this deployment requires, plus every form pair. */
export const LEGAL_PAIR = Object.freeze({
  kind: "assisted_order_request_notice",
  version: "v1",
});

export const AGREEMENTS = [
  { ...LEGAL_PAIR, acceptedAt: ACCEPTED_AT },
  ...ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((acknowledgment) => ({
    ...assistedOrderFormPair(acknowledgment),
    acceptedAt: ACCEPTED_AT,
  })),
];

/**
 * The authoritative price. Every negative control that involves money compares
 * against THIS number, never against a number the request carried.
 */
export const AUTHORITATIVE_UNIT_PRICE_CENTS = 9900;

/** The founder-stated ceiling: 100 units per exact variant. */
export const FOUNDER_MAX_QUANTITY = 100;

type CatalogOverrides = Partial<AssistedOrderCatalogItem>;

export function catalogItem(overrides: CatalogOverrides = {}): AssistedOrderCatalogItem {
  return {
    productId: "pc_product_1",
    variantId: "pc_variant_1",
    productName: "BPC-157",
    family: "research_vials",
    channel: "Peptides & Research",
    specification: "5 mg vial",
    format: null,
    packBasis: null,
    minimumQuantity: 1,
    maximumQuantity: FOUNDER_MAX_QUANTITY,
    quantityIncrement: 1,
    unitPriceCents: AUTHORITATIVE_UNIT_PRICE_CENTS,
    currency: "USD",
    workflowMode: "direct_order_request",
    actionLabel: "Add to order request",
    accessNotice: null,
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price_1",
    ...overrides,
  } as AssistedOrderCatalogItem;
}

const documents: AssistedOrderDocumentStore = {
  createUpload: async (uploadRequest) => ({
    documentId: "assigned-by-service",
    uploadUrl: "https://storage.example/upload",
    objectPath: uploadRequest.objectPath,
    expiresAt: "2026-08-20T12:15:00.000Z",
    requiredHeaders: { "content-type": uploadRequest.mimeType },
  }),
  createDownload: async () => ({
    url: "https://storage.example/download",
    expiresAt: "2026-08-20T12:05:00.000Z",
  }),
};

export type DoorHarness = Readonly<{
  app: Express;
  /** Everything the outbox was asked to send, for the notification invariants. */
  enqueued: unknown[];
  /** Which member the member-resolver will answer with for `x-test-member`. */
  memberFor: Map<string, string>;
}>;

/**
 * Compose the door over a catalog the caller controls.
 *
 * `resolveLine` answers from the catalog item whose (productId, variantId)
 * matches, so a request naming an unknown pair is refused by the authority
 * rather than by the fixture.
 */
export function buildDoor(items: readonly AssistedOrderCatalogItem[] = [catalogItem()]): DoorHarness {
  const repository = new InMemoryAssistedOrderRepository();
  const enqueued: unknown[] = [];
  const memberFor = new Map<string, string>([
    ["a", MEMBER_A],
    ["b", MEMBER_B],
  ]);

  const composition = createAssistedOrderProductionComposition({
    enabled: true,
    legal: { requiredAgreements: async () => [LEGAL_PAIR] },
    // This standalone door fixture predates the durable Early Access
    // agreement-standing port. Its callers authenticate as a fixture member
    // and carry the exact required agreement pairs in `submission()`, so the
    // test port grants standing only to that resolved member identity. The
    // production composition remains fail closed and is covered separately by
    // the real binding/agreement-gate tests.
    submissionStanding: {
      accepted: async (viewer) => viewer.memberId !== null,
    },
    catalog: {
      list: async (_viewer, query) => {
        const search = query.search?.trim().toLocaleLowerCase() ?? "";
        const filtered = items.filter((item) => {
          if (query.family && item.family !== query.family) return false;
          if (query.channel && item.channel !== query.channel) return false;
          if (query.actionGroup && assistedOrderActionGroupFor(item.workflowMode) !== query.actionGroup) {
            return false;
          }
          if (query.workflowMode && item.workflowMode !== query.workflowMode) return false;
          if (!search) return true;
          return [
            item.productName,
            item.family,
            item.channel,
            item.specification,
            item.format,
            item.packBasis,
          ].some((value) => value?.toLocaleLowerCase().includes(search));
        });
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 24;
        const start = (page - 1) * pageSize;
        return {
          items: filtered.slice(start, start + pageSize),
          total: filtered.length,
          page,
          pageSize,
          // Filter choices describe the whole fixture catalog, not only the
          // current result page, matching the production adapter's behavior.
          families: [...new Set(items.map((item) => item.family))],
          channels: [...new Set(items.map((item) => item.channel))],
          workflowModes: [...new Set(items.map((item) => item.workflowMode))],
        };
      },
      resolveLine: async (_viewer, requested) => {
        const item = items.find(
          (candidate) =>
            candidate.productId === requested.productId &&
            candidate.variantId === requested.variantId,
        );
        if (!item) throw new Error("Catalog item is unavailable or not authorized.");
        return {
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
          // The authority's own price. Deliberately NOT read from `requested`:
          // a browser number must never reach a stored line.
          unitPriceCents: item.unitPriceCents,
          lineEstimateCents: null,
          currency: "USD",
          catalogVersion: item.catalogVersion,
          priceVersion: item.priceVersion,
          accessNotice: item.accessNotice,
          researchUseOnly: item.researchUseOnly,
          authoritativeFingerprint: "authority-fingerprint",
        };
      },
    },
    repository,
    outbox: {
      enqueue: async (message: unknown) => {
        enqueued.push(message);
      },
    },
    audit: { record: async () => undefined },
    documents,
    adminNotificationEmail: "research@xeniostechnology.com",
  });
  if (composition.refusalReason !== null || !composition.service) {
    throw new Error(`composition refused: ${String(composition.refusalReason)}`);
  }

  const viewers = createAssistedOrderViewerResolvers({
    resolveMember: async (req) => {
      const key = req.headers["x-test-member"];
      const id = typeof key === "string" ? memberFor.get(key) : undefined;
      if (!id) return null;
      return {
        id,
        email: `${key}@example.com`,
        pricingViewer: { audience: "member", email: `${key}@example.com` },
      };
    },
    earlyAccess: () => null,
    earlyAccessBindings: () => null,
    adminEmail: () => "research@xeniostechnology.com",
  });

  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(
    composition.service,
    viewers,
  );
  const door = (method: "GET" | "POST" | "PATCH", routePath: string): RequestHandler => {
    const descriptor = routes.find(
      (candidate) => candidate.method === method && candidate.path === routePath,
    );
    if (!descriptor) throw new Error(`descriptor missing: ${method} ${routePath}`);
    return assistedOrderExpressHandler(descriptor);
  };
  const requireAdmin: RequestHandler = (req, res, next) => {
    if (req.headers.authorization === ADMIN_BEARER) return next();
    res.status(401).json({ error: "unauthorized" });
  };

  const app = express();
  app.use(express.json());
  app.get(
    "/api/research/early-access/assisted-orders/config",
    door("GET", "/api/research/early-access/assisted-orders/config"),
  );
  app.get(
    "/api/research/early-access/assisted-orders/catalog",
    door("GET", "/api/research/early-access/assisted-orders/catalog"),
  );
  app.post(
    "/api/research/early-access/assisted-orders",
    door("POST", "/api/research/early-access/assisted-orders"),
  );
  app.get(
    "/api/research/early-access/assisted-orders/:publicReference",
    door("GET", "/api/research/early-access/assisted-orders/:publicReference"),
  );
  app.get(
    "/api/admin/research/assisted-orders",
    requireAdmin,
    door("GET", "/api/admin/research/assisted-orders"),
  );
  app.get(
    "/api/admin/research/assisted-orders/:requestId",
    requireAdmin,
    door("GET", "/api/admin/research/assisted-orders/:requestId"),
  );

  return { app, enqueued, memberFor };
}

/** A well-formed submission. Callers mutate the copy to attack one thing. */
export function submission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    idempotencyKey: "launch-invariant-1",
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
    agreements: AGREEMENTS,
    lines: [{ productId: "pc_product_1", variantId: "pc_variant_1", quantity: 2 }],
    ...overrides,
  };
}
