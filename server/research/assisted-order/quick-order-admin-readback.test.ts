import express, { type RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  ASSISTED_ORDER_SOURCE,
  type AssistedOrderAdminDetail,
  type AssistedOrderLineSnapshot,
} from "../../../shared/research/assisted-order/contract";
import { assistedOrderExpressHandler, type ExpressAssistedOrderRequest } from "./express";
import { createAssistedOrderRouteTable } from "./http";
import type { AssistedOrderDependencies, AssistedOrderViewer } from "./ports";
import {
  PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE,
  QUICK_ORDER_ADMIN_DETAIL_RPC,
  QUICK_ORDER_ADMIN_ENVELOPE_VERSION,
} from "./quick-order-repository";
import { AssistedOrderService } from "./service";
import { SupabaseAssistedOrderRepository, type SupabaseRpcClient } from "./supabase-repository";

// Real repository, both real decoders, service, descriptors and Express adapter.
// RPC, admission/viewer and effects ports are synthetic. These tests do not prove
// installed SQL, managed authorization, durable evidence or full-server wiring.
type Row = Record<string, unknown>;
const REQUEST_ID = "a0000000-0000-4000-8000-000000000001";
const OTHER_REQUEST_ID = "a0000000-0000-4000-8000-000000000002";
const REFERENCE = "XRR-20261006-ABCDEF1234";
const CREATED_AT = "2026-10-06T12:00:00.000Z";
const OBSERVED_AT = "2026-10-06T12:05:00.000Z";
const UPDATED_AT = "2026-10-06T12:10:00.000Z";
const EVENT_KEY = `assisted-order:${REQUEST_ID}:quick-order-submitted:admin`;
const DETAIL_ROUTE = "/api/admin/research/assisted-orders/:requestId";
const DETAIL_URL = `/api/admin/research/assisted-orders/${REQUEST_ID}`;
const ADMIN_BEARER = "Bearer synthetic-admin-admission";
const UNAVAILABLE = {
  error: "assisted_order_unavailable",
  message: "The assisted order service is temporarily unavailable.",
};

function envelope(): Row {
  const line: AssistedOrderLineSnapshot = {
    lineId: "b0000000-0000-4000-8000-000000000001", productId: "synthetic-product",
    variantId: "synthetic-variant", productName: "Synthetic retained product",
    specification: null, format: null, packBasis: null, quantity: 2,
    minimumQuantity: 1, maximumQuantity: 100, quantityIncrement: 1,
    workflowMode: "direct_order_request", customerActionLabel: "Request order",
    unitPriceCents: 1_250, lineEstimateCents: 2_500, currency: "USD",
    catalogVersion: "synthetic-catalog-v1", priceVersion: "synthetic-price-v1",
    accessNotice: null, researchUseOnly: false,
  };
  const address = {
    line1: "1 Synthetic Test Way", line2: "", city: "Test City",
    region: "IL", postalCode: "60000", countryCode: "US",
  };
  const detail: AssistedOrderAdminDetail = {
    requestId: REQUEST_ID, publicReference: REFERENCE, status: "submitted", source: ASSISTED_ORDER_SOURCE,
    actorMemberId: null, fullLegalName: "Synthetic Test Customer", email: "synthetic-customer@example.invalid",
    mobilePhone: "+12025550100", organizationName: null,
    shippingAddress: { ...address }, billingAddress: { ...address }, lines: [line],
    estimatedTotalCents: 2_500, currency: "USD", generalNotes: null,
    agreements: [{ kind: "synthetic-terms", version: "synthetic-v1", acceptedAt: CREATED_AT }],
    affiliateAttributionRef: null, declaredAffiliateCode: null, declaredAffiliateCodeState: "not_provided",
    timeline: [{ status: "submitted", occurredAt: CREATED_AT, customerMessage: null }],
    documents: [], createdAt: CREATED_AT, updatedAt: CREATED_AT,
  };
  const estimate = { knownSubtotalCents: 2_500, estimateComplete: true, currency: "USD" };
  const payloadHash = "a".repeat(64);
  return {
    schemaVersion: QUICK_ORDER_ADMIN_ENVELOPE_VERSION, requestId: REQUEST_ID, detail,
    submittedEvent: {
      schemaVersion: "quick-order-v1", requestId: REQUEST_ID, eventType: "submitted",
      occurredAt: CREATED_AT, payloadHash,
    },
    enrichment: {
      schemaVersion: "quick-order-v1",
      companion: {
        requestId: REQUEST_ID, payloadHash,
        intake: {
          schemaVersion: "quick-order-v1", source: "person", sourceDetail: "Synthetic referrer",
          declaredCode: null, affiliationKind: "none", affiliationDetail: "", confirmedByCustomer: true,
          confirmedAt: CREATED_AT, requestAcknowledged: true, reviewState: "captured_unmatched",
          commissionState: "not_authorized", estimate: { ...estimate },
        },
      },
      receipt: {
        schemaVersion: "quick-order-v1", requestId: REQUEST_ID, publicReference: REFERENCE,
        payloadHash, attributionState: "captured_unmatched", estimate: { ...estimate },
      },
      obligation: {
        eventKey: EVENT_KEY, templateKey: PROPOSED_QUICK_ORDER_ADMIN_TEMPLATE,
        payload: { schemaVersion: "quick-order-v1", requestId: REQUEST_ID, publicReference: REFERENCE },
      },
      observation: {
        state: "observed", eventKey: EVENT_KEY, observedAt: OBSERVED_AT,
        notification: { status: "pending", attemptCount: 0, nextAttemptAt: CREATED_AT, completedAt: null },
      },
    },
  };
}

function rowAt(value: unknown, path: string): Row {
  return path.split(".").reduce<unknown>((current, key) => (current as Row)[key], value) as Row;
}

const ADMIN_VIEWER: AssistedOrderViewer = {
  actorType: "admin", memberId: null, earlyAccessSessionHash: null,
  normalizedEmail: "synthetic-admin@example.invalid", actorLabel: "synthetic-admin@example.invalid",
  capabilities: new Set(["assisted_orders:read_all", "assisted_orders:manage"]),
};

function compose(reply: SupabaseRpcClient["rpc"], viewer = ADMIN_VIEWER) {
  const rpc = vi.fn(reply);
  const repository = new SupabaseAssistedOrderRepository({ rpc });
  const unused = vi.fn(async (): Promise<never> => { throw new Error("Unexpected synthetic dependency"); });
  const unusedSync = vi.fn((): never => { throw new Error("Unexpected synthetic dependency"); });
  const enqueue = vi.fn(async () => undefined);
  const audit = vi.fn(async () => undefined);
  let eventSequence = 0;
  const deps: AssistedOrderDependencies = {
    repository,
    catalog: { list: unused, resolveLine: unused },
    legal: { requiredAgreements: unused },
    submissionStanding: { accepted: unused },
    outbox: { enqueue }, audit: { record: audit },
    documents: { createUpload: unused, createDownload: unused },
    googleMirror: null,
    clock: { now: () => new Date(UPDATED_AT) },
    ids: {
      uuid: () => `c0000000-0000-4000-8000-${String(++eventSequence).padStart(12, "0")}`,
      publicReference: unusedSync, opaqueToken: unusedSync,
    },
    hasher: { hash: unusedSync, stableHash: unusedSync },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    adminNotificationEmail: "synthetic-admin@example.invalid", documentBucketName: "synthetic-documents",
  };
  const service = new AssistedOrderService(deps);
  const resolve = vi.fn(async (_request: ExpressAssistedOrderRequest) => viewer);
  const routes = createAssistedOrderRouteTable<ExpressAssistedOrderRequest>(service, { resolve });
  const door = (method: "GET" | "PATCH", path: string): RequestHandler => {
    const descriptor = routes.find(candidate => candidate.method === method && candidate.path === path);
    if (!descriptor || descriptor.auth !== "admin") throw new Error("Expected canonical admin descriptor");
    return assistedOrderExpressHandler(descriptor);
  };
  const admission: RequestHandler = (req, res, next) => {
    if (req.headers.authorization !== ADMIN_BEARER) {
      res.status(401).json({ error: "unauthorized" });
      return;
    }
    next();
  };
  const app = express();
  app.use(express.json());
  app.get(DETAIL_ROUTE, admission, door("GET", DETAIL_ROUTE));
  app.patch(`${DETAIL_ROUTE}/status`, admission, door("PATCH", `${DETAIL_ROUTE}/status`));
  return { app, service, repository, rpc, resolve, enqueue, audit, unused, unusedSync };
}

function reader(value: unknown, viewer = ADMIN_VIEWER) {
  return compose(async name => {
    if (name !== QUICK_ORDER_ADMIN_DETAIL_RPC) throw new Error("Unexpected fallback RPC");
    return { data: value, error: null };
  }, viewer);
}
function read(h: ReturnType<typeof compose>, requestId = REQUEST_ID) {
  return request(h.app).get(`/api/admin/research/assisted-orders/${requestId}`).set("authorization", ADMIN_BEARER);
}
function expectOnlyRead(h: ReturnType<typeof compose>, requestId = REQUEST_ID): void {
  expect(h.rpc.mock.calls).toEqual([[QUICK_ORDER_ADMIN_DETAIL_RPC, { p_request_id: requestId }]]);
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(h.audit).not.toHaveBeenCalled();
  expect(h.unused).not.toHaveBeenCalled();
  expect(h.unusedSync).not.toHaveBeenCalled();
}

describe("Quick Order canonical admin readback composition", () => {
  it("returns canonical detail plus narrow Quick Order evidence through the real admin HTTP route", async () => {
    const value = envelope();
    const before = JSON.stringify(value);
    const h = reader(value);
    const response = await read(h);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers["content-type"]).toMatch(/application\/json/);
    expect(response.body).toEqual({
      ...rowAt(value, "detail"),
      quickOrder: {
        intake: rowAt(value, "enrichment.companion.intake"),
        observation: {
          state: "observed", observedAt: OBSERVED_AT,
          notification: rowAt(value, "enrichment.observation.notification"),
        },
      },
    });
    expect(response.body.quickOrder.observation).not.toHaveProperty("eventKey");
    expect(response.body).not.toHaveProperty("submittedEvent");
    expect(response.body).not.toHaveProperty("enrichment");
    expect(JSON.stringify(value)).toBe(before);
    expectOnlyRead(h);
  });

  it("rejects unauthenticated admission before resolving a viewer or calling the RPC", async () => {
    const h = reader(envelope());
    const response = await request(h.app).get(DETAIL_URL);
    expect(response.status).toBe(401);
    expect(h.resolve).not.toHaveBeenCalled();
    expect(h.rpc).not.toHaveBeenCalled();
  });

  it("enforces read_all before RPC even for an admitted admin with manage capability", async () => {
    const h = reader(envelope(), { ...ADMIN_VIEWER, capabilities: new Set(["assisted_orders:manage"]) });
    const response = await read(h);
    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: "forbidden", message: "This request is not authorized." });
    expect(h.resolve).toHaveBeenCalledTimes(1);
    expect(h.rpc).not.toHaveBeenCalled();
    expect(h.enqueue).not.toHaveBeenCalled();
    expect(h.audit).not.toHaveBeenCalled();
  });

  it("preserves explicit legacy null enrichment through the same reader", async () => {
    const value = envelope();
    value.submittedEvent = null;
    value.enrichment = null;
    // The new Quick Order line restrictions must not redefine legacy detail.
    rowAt(value, "detail.lines.0").researchUseOnly = true;
    const h = reader(value);
    const response = await read(h);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ...rowAt(value, "detail"), quickOrder: null });
    expectOnlyRead(h);
  });

  it("maps an explicitly absent canonical request to not-found, not a fabricated legacy record", async () => {
    const h = reader(null);
    const response = await read(h);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "not_found", message: "The request was not found." });
    expectOnlyRead(h);
  });

  it.each([
    { label: "omitted companion", corrupt: (value: Row) => { delete rowAt(value, "enrichment").companion; } },
    { label: "null companion", corrupt: (value: Row) => { rowAt(value, "enrichment").companion = null; } },
    { label: "malformed companion declaration", corrupt: (value: Row) => { rowAt(value, "enrichment.companion.intake").commissionState = "authorized"; } },
    { label: "omitted receipt", corrupt: (value: Row) => { delete rowAt(value, "enrichment").receipt; } },
    { label: "mismatched receipt hash", corrupt: (value: Row) => { rowAt(value, "enrichment.receipt").payloadHash = "b".repeat(64); } },
    { label: "omitted obligation", corrupt: (value: Row) => { delete rowAt(value, "enrichment").obligation; } },
    { label: "malformed obligation payload", corrupt: (value: Row) => { rowAt(value, "enrichment.obligation.payload").recoveryUrl = "https://example.invalid/private"; } },
    { label: "marker with null enrichment", corrupt: (value: Row) => { value.enrichment = null; } },
    { label: "missing submitted marker", corrupt: (value: Row) => { delete value.submittedEvent; } },
    { label: "notification from another event", corrupt: (value: Row) => { rowAt(value, "enrichment.observation").eventKey = `assisted-order:${OTHER_REQUEST_ID}:quick-order-submitted:admin`; } },
  ])("fails closed for $label without partial detail or legacy fallback", async ({ corrupt }) => {
    const value = envelope();
    corrupt(value);
    const h = reader(value);
    const response = await read(h);
    expect(response.status).toBe(500);
    expect(response.body).toEqual(UNAVAILABLE);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.text).not.toContain(REFERENCE);
    expectOnlyRead(h);
  });

  it.each(["missing RPC", "transport rejection"])("does not downgrade %s to the old unmarked detail reader", async failure => {
    const value = envelope();
    const h = compose(async name => {
      if (name === QUICK_ORDER_ADMIN_DETAIL_RPC) {
        if (failure === "transport rejection") throw new Error("synthetic-private-rpc-diagnostic");
        return { data: null, error: { code: "PGRST202", message: "synthetic-private-rpc-diagnostic" } };
      }
      // A tempting successful old-reader response must never become fallback.
      return { data: value.detail, error: null };
    });
    const response = await read(h);
    expect(response.status).toBe(500);
    expect(response.body).toEqual(UNAVAILABLE);
    expect(response.text).not.toContain("synthetic-private-rpc-diagnostic");
    expectOnlyRead(h);
  });

  it("binds the repository result to the requested path ID", async () => {
    const h = reader(envelope());
    const response = await read(h, OTHER_REQUEST_ID);
    expect(response.status).toBe(500);
    expect(response.body).toEqual(UNAVAILABLE);
    expectOnlyRead(h, OTHER_REQUEST_ID);
  });

  it.each([
    { label: "line display fields", corrupt: (value: Row) => { rowAt(value, "detail.lines.0").productName = 42; } },
    { label: "timeline event", corrupt: (value: Row) => { rowAt(value, "detail.timeline.0").occurredAt = 42; } },
    { label: "document record", corrupt: (value: Row) => { rowAt(value, "detail").documents = [{ documentId: "synthetic-document" }]; } },
    { label: "shipping address", corrupt: (value: Row) => { rowAt(value, "detail").shippingAddress = null; } },
    { label: "billing address", corrupt: (value: Row) => { rowAt(value, "detail").billingAddress = []; } },
    { label: "agreement collection", corrupt: (value: Row) => { rowAt(value, "detail").agreements = {}; } },
  ])("still executes canonical nested validation for $label after envelope validation", async ({ corrupt }) => {
    // Each mutation is deliberately outside the pure envelope decoder's checks.
    const value = envelope();
    corrupt(value);
    const h = reader(value);
    const response = await read(h);
    expect(response.status).toBe(500);
    expect(response.body).toEqual(UNAVAILABLE);
    expectOnlyRead(h);
  });

  it("preserves submitted intake after a status mutation and discards the earlier notification observation", async () => {
    const value = envelope();
    const original = JSON.stringify(value);
    const updatedDetail = {
      ...rowAt(value, "detail"), status: "reviewing", updatedAt: UPDATED_AT,
      timeline: [
        ...(rowAt(value, "detail").timeline as unknown[]),
        { status: "reviewing", occurredAt: UPDATED_AT, customerMessage: "Synthetic status review" },
      ],
      // Status RPC output cannot replace immutable intake with a new assertion.
      quickOrder: { intake: { declaredCode: "FORGED_REPLACEMENT" }, observation: { state: "observed" } },
    };
    const h = compose(async name => {
      if (name === QUICK_ORDER_ADMIN_DETAIL_RPC) return { data: value, error: null };
      if (name === "research_assisted_order_set_status") return { data: updatedDetail, error: null };
      throw new Error("Unexpected status-path RPC");
    });
    const before = await read(h);
    expect(before.status).toBe(200);
    const response = await request(h.app).patch(`${DETAIL_URL}/status`)
      .set("authorization", ADMIN_BEARER)
      .send({ status: "reviewing", customerMessage: "Synthetic status review" });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("reviewing");
    expect(response.body.updatedAt).toBe(UPDATED_AT);
    expect(response.body.quickOrder).toEqual({ intake: before.body.quickOrder.intake, observation: { state: "stale" } });
    expect(response.body.quickOrder.observation).not.toHaveProperty("notification");
    expect(response.text).not.toContain("FORGED_REPLACEMENT");
    expect(JSON.stringify(value)).toBe(original);
    expect(h.rpc.mock.calls.map(([name]) => name)).toEqual([
      QUICK_ORDER_ADMIN_DETAIL_RPC, QUICK_ORDER_ADMIN_DETAIL_RPC, "research_assisted_order_set_status",
    ]);
    expect(h.rpc.mock.calls[2][1]).toMatchObject({
      p_request_id: REQUEST_ID, p_expected_status: "submitted", p_new_status: "reviewing",
      p_actor_id: ADMIN_VIEWER.actorLabel, p_actor_type: "admin", p_occurred_at: UPDATED_AT,
    });
    expect(h.enqueue).toHaveBeenCalledTimes(1);
    expect(h.audit).toHaveBeenCalledTimes(1);
    expect(h.unused).not.toHaveBeenCalled();
    expect(h.unusedSync).not.toHaveBeenCalled();
  });
});
