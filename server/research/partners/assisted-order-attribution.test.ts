// The assisted-order attribution seam, proven from the partners side: the
// affiliate ref stored on a submission comes ONLY from the verified signed
// attribution cookie. A body-supplied value is ignored, an absent cookie is
// null, and a forged cookie is null. These tests drive the real route table
// and the real service over the in-memory repository — no mocks of the code
// under test.

import { describe, expect, it } from "vitest";
import type { AssistedOrderSubmitInput } from "../../../shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";
import {
  createAssistedOrderRouteTable,
  type AssistedOrderHttpRequest,
} from "../assisted-order/http";
import { InMemoryAssistedOrderRepository } from "../assisted-order/memory-repository";
import { AssistedOrderService } from "../assisted-order/service";
import type {
  AssistedOrderAttributionResolver,
  AssistedOrderDependencies,
  AssistedOrderViewer,
} from "../assisted-order/ports";
import {
  ATTRIBUTION_COOKIE_NAME,
  mintAttributionToken,
  verifiedAttributionRefFromCookieHeader,
} from "./attribution-cookie";

// AssistedOrderHttpRequest lives in http.ts, not ports.ts.
type HttpRequest = AssistedOrderHttpRequest;

const SECRET = "assisted-order-attribution-secret";
const NOW = new Date("2026-08-19T12:00:00.000Z");

const FORM_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((a) => ({
  ...assistedOrderFormPair(a),
  acceptedAt: NOW.toISOString(),
}));

const memberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
}) as AssistedOrderViewer;

function submitInput(
  overrides: Partial<AssistedOrderSubmitInput> = {},
): AssistedOrderSubmitInput {
  return {
    idempotencyKey: "attribution-seam-1",
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
        acceptedAt: NOW.toISOString(),
      },
      ...FORM_PAIRS,
    ],
    lines: [
      {
        productId: "product-1",
        variantId: "variant-1",
        quantity: 1,
        expectedCatalogVersion: "catalog-v1",
        expectedPriceVersion: "price-v1",
        expectedUnitPriceCents: 5000,
      },
    ],
    ...overrides,
  };
}

function harness() {
  const repository = new InMemoryAssistedOrderRepository();
  let sequence = 0;
  const deps: AssistedOrderDependencies = {
    legal: {
      requiredAgreements: async () => [
        { kind: "assisted_order_request_notice", version: "v1" },
      ],
    },
    submissionStanding: { accepted: async () => true },
    catalog: {
      list: async () => ({
        items: [],
        total: 0,
        page: 1,
        pageSize: 24,
        families: [],
        channels: [],
        workflowModes: [],
      }),
      resolveLine: async (_viewer, requested) => ({
        lineId: "assigned-by-service",
        productId: "product-1",
        variantId: "variant-1",
        productName: "Research Product",
        specification: "10 mg",
        format: "Vial",
        packBasis: "Per vial",
        quantity: requested.quantity,
        minimumQuantity: 1,
        maximumQuantity: 100,
        quantityIncrement: 1,
        workflowMode: "direct_order_request",
        customerActionLabel: "Add to order request",
        unitPriceCents: 5000,
        lineEstimateCents: null,
        currency: "USD",
        catalogVersion: "catalog-v1",
        priceVersion: "price-v1",
        accessNotice: null,
        researchUseOnly: false,
        authoritativeFingerprint: "authority-fingerprint",
      }),
    },
    repository,
    outbox: { enqueue: async () => undefined },
    audit: { record: async () => undefined },
    documents: {
      createUpload: async (request) => ({
        documentId: "assigned-by-service",
        uploadUrl: "https://storage.example/upload",
        objectPath: request.objectPath,
        expiresAt: NOW.toISOString(),
        requiredHeaders: { "content-type": request.mimeType },
      }),
      createDownload: async () => ({
        url: "https://storage.example/download",
        expiresAt: NOW.toISOString(),
      }),
    },
    googleMirror: null,
    clock: { now: () => NOW },
    ids: {
      uuid: () => {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      },
      publicReference: () => `XRR-20260819-REF${String((sequence += 1)).padStart(5, "0")}`,
      opaqueToken: () => `token-${sequence}`,
    },
    hasher: {
      hash: (value) => `hash:${value}`,
      stableHash: (value) => JSON.stringify(value),
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
    },
    adminNotificationEmail: "research@xeniostechnology.com",
    documentBucketName: "research-assisted-order-documents",
  };
  const service = new AssistedOrderService(deps);
  // The exact resolver shape the composition root wires: the cookie verify
  // helper over the link secret and the request clock.
  const resolver: AssistedOrderAttributionResolver = {
    resolve: (cookieHeader) =>
      verifiedAttributionRefFromCookieHeader(SECRET, cookieHeader, NOW),
  };
  const routes = createAssistedOrderRouteTable(
    service,
    { resolve: async () => memberViewer },
    resolver,
  );
  const submitRoute = routes.find(
    (route) =>
      route.method === "POST" &&
      route.path === "/api/research/early-access/assisted-orders",
  );
  if (!submitRoute) throw new Error("submit descriptor missing");
  return { service, repository, submitRoute };
}

function httpSubmit(
  body: AssistedOrderSubmitInput,
  cookieHeader?: string,
): HttpRequest {
  return {
    method: "POST",
    path: "/api/research/early-access/assisted-orders",
    headers: cookieHeader ? { cookie: cookieHeader } : {},
    query: {},
    params: {},
    body,
  };
}

function cookieFor(partnerId: string, secret = SECRET): string {
  const token = mintAttributionToken(secret, {
    partnerId,
    code: "v1.code.nonce.sig",
    subjectKey: "opaque-subject",
    issuedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  });
  return `${ATTRIBUTION_COOKIE_NAME}=${token}`;
}

async function storedRefOf(
  h: ReturnType<typeof harness>,
  requestId: string,
): Promise<string | null> {
  const detail = await h.repository.getAdmin(requestId);
  expect(detail).not.toBeNull();
  return detail!.affiliateAttributionRef;
}

describe("assisted-order attribution seam", () => {
  it("records the partner from a valid attribution cookie", async () => {
    const h = harness();
    const response = await h.submitRoute.handler(
      httpSubmit(submitInput(), cookieFor("partner-1")),
    );
    expect(response.status).toBe(201);
    const requestId = (response.body as { requestId: string }).requestId;
    expect(await storedRefOf(h, requestId)).toBe("partner-1");
  });

  it("ignores a body-spoofed affiliateAttributionRef outright", async () => {
    const h = harness();
    const response = await h.submitRoute.handler(
      httpSubmit(submitInput({ affiliateAttributionRef: "partner-thief" })),
    );
    expect(response.status).toBe(201);
    const requestId = (response.body as { requestId: string }).requestId;
    expect(await storedRefOf(h, requestId)).toBeNull();
  });

  it("stores the cookie's partner even when the body claims another", async () => {
    const h = harness();
    const response = await h.submitRoute.handler(
      httpSubmit(
        submitInput({ affiliateAttributionRef: "partner-thief" }),
        cookieFor("partner-1"),
      ),
    );
    expect(response.status).toBe(201);
    const requestId = (response.body as { requestId: string }).requestId;
    expect(await storedRefOf(h, requestId)).toBe("partner-1");
  });

  it("records null when no cookie is present", async () => {
    const h = harness();
    const response = await h.submitRoute.handler(httpSubmit(submitInput()));
    expect(response.status).toBe(201);
    const requestId = (response.body as { requestId: string }).requestId;
    expect(await storedRefOf(h, requestId)).toBeNull();
  });

  it("records null for a forged cookie", async () => {
    const h = harness();
    const response = await h.submitRoute.handler(
      httpSubmit(submitInput(), cookieFor("partner-1", "some-other-secret")),
    );
    expect(response.status).toBe(201);
    const requestId = (response.body as { requestId: string }).requestId;
    expect(await storedRefOf(h, requestId)).toBeNull();
  });

  it("replays idempotently regardless of attribution state changes", async () => {
    const h = harness();
    const first = await h.submitRoute.handler(
      httpSubmit(submitInput(), cookieFor("partner-1")),
    );
    expect(first.status).toBe(201);
    // The same request resubmitted after the cookie expired or was cleared is
    // the SAME request: attribution never forks request identity.
    const replay = await h.submitRoute.handler(httpSubmit(submitInput()));
    expect(replay.status).toBe(201);
    expect((replay.body as { requestId: string }).requestId).toBe(
      (first.body as { requestId: string }).requestId,
    );
    // And the original attribution, captured at first submit, is untouched.
    expect(
      await storedRefOf(h, (first.body as { requestId: string }).requestId),
    ).toBe("partner-1");
  });
});
