import { describe, expect, it, vi } from "vitest";
import type {
  AssistedOrderCatalogItem,
  AssistedOrderSubmitInput,
} from "../../../shared/research/assisted-order/contract";
import type {
  AssistedOrderCreateRecord,
  AssistedOrderDependencies,
  AssistedOrderLegalPort,
  AssistedOrderNotificationIntent,
  AssistedOrderViewer,
} from "./ports";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";

// Every submission must carry the operational form facts (D-005); the tests
// build them once from the shared module so copy drift fails here too.
const FORM_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((a) => ({
  ...assistedOrderFormPair(a),
  acceptedAt: "2026-08-15T12:00:00.000Z",
}));
/** Only the always-required facts, for proving the conditional RUO rule. */
const ALWAYS_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.filter(
  (a) => a.scope === "always",
).map((a) => ({ ...assistedOrderFormPair(a), acceptedAt: "2026-08-15T12:00:00.000Z" }));
import { InMemoryAssistedOrderRepository } from "./memory-repository";
import {
  SupabaseAssistedOrderRepository,
  type SupabaseRpcClient,
} from "./supabase-repository";
import {
  AssistedOrderAuthorizationError,
  AssistedOrderConflictError,
  AssistedOrderNotFoundError,
  AssistedOrderService,
} from "./service";

const memberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set([
    "assisted_orders:submit",
    "assisted_orders:read_own",
  ]),
});

const adminViewer: AssistedOrderViewer = Object.freeze({
  actorType: "admin",
  memberId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  earlyAccessSessionHash: null,
  normalizedEmail: "admin@example.com",
  capabilities: new Set([
    "assisted_orders:read_all",
    "assisted_orders:manage",
    "assisted_orders:documents_manage",
  ]),
});

// A repo admin authenticated by Supabase JWT email identity: manage
// capability, but no member row.
const jwtAdminViewer: AssistedOrderViewer = Object.freeze({
  actorType: "admin",
  memberId: null,
  earlyAccessSessionHash: null,
  normalizedEmail: "ops@xeniostechnology.com",
  actorLabel: "ops@xeniostechnology.com",
  capabilities: new Set([
    "assisted_orders:read_all",
    "assisted_orders:manage",
  ]),
});

// A customer whose early-access session lapsed: no capabilities at all, only
// the emailed status link.
const lapsedViewer: AssistedOrderViewer = Object.freeze({
  actorType: "early_access_session",
  memberId: null,
  earlyAccessSessionHash: null,
  normalizedEmail: null,
  capabilities: new Set([]),
});

function item(overrides: Partial<AssistedOrderCatalogItem> = {}): AssistedOrderCatalogItem {
  return Object.freeze({
    productId: "product-1",
    variantId: "variant-1",
    productName: "Research Product",
    family: "Research Peptides & Materials",
    channel: "RUO Research",
    specification: "10 mg",
    format: "Vial",
    packBasis: "Per vial",
    minimumQuantity: 1,
    maximumQuantity: 100,
    quantityIncrement: 1,
    unitPriceCents: 5000,
    currency: "USD",
    workflowMode: "direct_order_request",
    actionLabel: "Add to order request",
    accessNotice: "Research Use Only",
    researchUseOnly: true,
    catalogVersion: "catalog-v1",
    priceVersion: "price-v1",
    ...overrides,
  });
}

function input(overrides: Partial<AssistedOrderSubmitInput> = {}): AssistedOrderSubmitInput {
  return {
    idempotencyKey: "submit-1",
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
        acceptedAt: "2026-08-15T12:00:00.000Z",
      },
      ...FORM_PAIRS,
    ],
    lines: [
      {
        productId: "product-1",
        variantId: "variant-1",
        quantity: 2,
        expectedCatalogVersion: "catalog-v1",
        expectedPriceVersion: "price-v1",
        expectedUnitPriceCents: 5000,
      },
    ],
    ...overrides,
  };
}

function harness(
  catalogItem = item(),
  overrides: { legal?: AssistedOrderLegalPort | null } = {},
) {
  const repository = new InMemoryAssistedOrderRepository();
  const notifications: AssistedOrderNotificationIntent[] = [];
  const audit = vi.fn(async () => undefined);
  const mirror = vi.fn(async () => undefined);
  let sequence = 0;
  let referenceSequence = 0;
  const defaultLegal: AssistedOrderLegalPort = {
    requiredAgreements: async () => [
      { kind: "assisted_order_request_notice", version: "v1" },
    ],
  };
  const deps: AssistedOrderDependencies = {
    legal: overrides.legal !== undefined ? overrides.legal : defaultLegal,
    catalog: {
      list: async () => ({
        items: [catalogItem],
        total: 1,
        page: 1,
        pageSize: 24,
        families: [catalogItem.family],
        channels: [catalogItem.channel],
        workflowModes: [catalogItem.workflowMode],
      }),
      resolveLine: async (_viewer, requested) => ({
        lineId: "assigned-by-service",
        productId: catalogItem.productId,
        variantId: catalogItem.variantId,
        productName: catalogItem.productName,
        specification: catalogItem.specification,
        format: catalogItem.format,
        packBasis: catalogItem.packBasis,
        quantity: requested.quantity,
        minimumQuantity: catalogItem.minimumQuantity,
        maximumQuantity: catalogItem.maximumQuantity,
        quantityIncrement: catalogItem.quantityIncrement,
        workflowMode: catalogItem.workflowMode,
        customerActionLabel: catalogItem.actionLabel,
        unitPriceCents: catalogItem.unitPriceCents,
        lineEstimateCents: null,
        currency: "USD",
        catalogVersion: catalogItem.catalogVersion,
        priceVersion: catalogItem.priceVersion,
        accessNotice: catalogItem.accessNotice,
        researchUseOnly: catalogItem.researchUseOnly,
        authoritativeFingerprint: "authority-fingerprint",
      }),
    },
    repository,
    outbox: {
      enqueue: async (intent) => {
        notifications.push(intent);
      },
    },
    audit: { record: audit },
    documents: {
      createUpload: async (request) => ({
        documentId: "assigned-by-service",
        uploadUrl: "https://storage.example/upload",
        objectPath: request.objectPath,
        expiresAt: "2026-08-15T12:15:00.000Z",
        requiredHeaders: { "content-type": request.mimeType },
      }),
      createDownload: async () => ({
        url: "https://storage.example/download",
        expiresAt: "2026-08-15T12:05:00.000Z",
      }),
    },
    googleMirror: { enqueue: mirror },
    clock: { now: () => new Date("2026-08-15T12:00:00.000Z") },
    ids: {
      uuid: () => {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      },
      publicReference: () => {
        referenceSequence += 1;
        return `XRR-20260815-REF${String(referenceSequence).padStart(5, "0")}`;
      },
      opaqueToken: () => `token-${sequence}`,
    },
    hasher: {
      hash: (value) => `hash:${value}`,
      stableHash: (value) => JSON.stringify(value),
    },
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    adminNotificationEmail: "research@xeniostechnology.com",
    documentBucketName: "research-assisted-order-documents",
  };
  return {
    service: new AssistedOrderService(deps),
    repository,
    notifications,
    audit,
    mirror,
    deps,
  };
}

describe("AssistedOrderService", () => {
  it("persists before notifications and returns an authoritative estimate", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    expect(receipt.publicReference).toBe("XRR-20260815-REF00001");
    expect(receipt.estimatedTotalCents).toBe(10000);
    expect(receipt.lines[0].workflowMode).toBe("direct_order_request");
    expect(h.notifications).toHaveLength(2);
    expect(h.notifications[0].requestId).toBe(receipt.requestId);
    expect(h.notifications[1].requestId).toBe(receipt.requestId);
    // CHANGED DELIBERATELY 2026-08-21. The admin payload used to carry no
    // shipping address. Payment is manual at launch — the operator reads that
    // email and replies with availability and payment instructions — so an
    // admin alert without an address cannot do its job, and withholding it
    // only sends the operator to the database for every order.
    //
    // The narrowing that keeps it honest is the RECIPIENT, so both directions
    // are asserted here rather than just the permissive one.
    const adminPayload = h.notifications[0].payload as Record<string, unknown>;
    const customerPayload = h.notifications[1].payload as Record<string, unknown>;
    expect(h.notifications[0].recipientKind).toBe("admin");
    expect(h.notifications[1].recipientKind).toBe("customer");
    expect(adminPayload).toHaveProperty("shippingAddress");
    expect(adminPayload).toHaveProperty("mobilePhone");
    // The customer already knows where they live; echoing it back adds
    // exposure and tells them nothing.
    expect(customerPayload).not.toHaveProperty("shippingAddress");
    expect(customerPayload).not.toHaveProperty("mobilePhone");
    // Documents stay behind the admin session in both directions.
    expect(adminPayload).not.toHaveProperty("documents");
    expect(customerPayload).not.toHaveProperty("documents");
    expect(h.audit).toHaveBeenCalled();
  });

  it("REFUSES a Care item at submit rather than explaining it afterwards", async () => {
    // CHANGED DELIBERATELY 2026-08-21. This test used to assert that a
    // provider-pathway item was ACCEPTED into the order request and that the
    // next-steps copy told the customer it would follow the Care pathway.
    //
    // The only thing keeping Care out of a durable order was the browser
    // declining to add it to the basket. A client-side guard is not a guard,
    // and `provider_request` appeared in the service exactly once — in that
    // copy, explaining the Care pathway to a customer whose Care item had
    // already been accepted.
    //
    // Payment is manual at launch, so a wrong acceptance ends with the founder
    // personally emailing payment instructions for a clinical product, in
    // writing, with nothing downstream to catch it. Refusing at the door is
    // the truthful answer; the customer is told where the product does belong.
    const h = harness(item({
      channel: "Clinical / Provider Only",
      workflowMode: "provider_request",
      actionLabel: "Start provider workflow",
      researchUseOnly: false,
    }));
    await expect(h.service.submit(memberViewer, input())).rejects.toThrow(
      /Xenios Care provider pathway/i,
    );
    // Nothing durable, and nobody emailed about an order that does not exist.
    expect(h.notifications).toHaveLength(0);
  });

  it("REFUSES an unavailable item at submit", async () => {
    const h = harness(item({
      workflowMode: "availability_review",
      actionLabel: "Request availability review",
    }));
    await expect(h.service.submit(memberViewer, input())).rejects.toThrow(
      /not available to order right now/i,
    );
    expect(h.notifications).toHaveLength(0);
  });

  it("still ADMITS the pathways that legitimately place a request", async () => {
    // Classification-pending and price-pending rows are askable. Refusing them
    // would have been the easy over-correction and would have taken the whole
    // Request Order flow with it.
    for (const workflowMode of ["request_activation", "request_pricing"] as const) {
      const h = harness(item({ workflowMode, actionLabel: "Request order" }));
      const receipt = await h.service.submit(memberViewer, input());
      expect(receipt.lines[0].workflowMode).toBe(workflowMode);
      expect(h.notifications).toHaveLength(2);
    }
  });

  it("never turns price pending into zero", async () => {
    const h = harness(item({
      unitPriceCents: null,
      priceVersion: null,
      workflowMode: "request_pricing",
      actionLabel: "Request pricing",
    }));
    const request = input({
      lines: [{
        productId: "product-1",
        variantId: "variant-1",
        quantity: 1,
        expectedCatalogVersion: "catalog-v1",
      }],
    });
    const receipt = await h.service.submit(memberViewer, request);
    expect(receipt.estimatedTotalCents).toBeNull();
    expect(receipt.lines[0].unitPriceCents).toBeNull();
    expect(receipt.lines[0].lineEstimateCents).toBeNull();
  });

  it("refuses stale expected prices", async () => {
    const h = harness();
    await expect(
      h.service.submit(memberViewer, input({
        lines: [{
          productId: "product-1",
          variantId: "variant-1",
          quantity: 1,
          expectedCatalogVersion: "catalog-v1",
          expectedPriceVersion: "price-v1",
          expectedUnitPriceCents: 4900,
        }],
      })),
    ).rejects.toMatchObject({ code: "price_changed" });
  });

  it("refuses quantities outside the authoritative MOQ and increment", async () => {
    const h = harness(item({ minimumQuantity: 10, quantityIncrement: 10 }));
    await expect(
      h.service.submit(memberViewer, input({
        lines: [{
          productId: "product-1",
          variantId: "variant-1",
          quantity: 11,
          expectedCatalogVersion: "catalog-v1",
          expectedPriceVersion: "price-v1",
          expectedUnitPriceCents: 5000,
        }],
      })),
    ).rejects.toThrow(/Quantity must begin at 10/);
  });

  it("replays the same idempotent submission with the stored identity and zero repeated effects", async () => {
    const h = harness();
    const first = await h.service.submit(memberViewer, input());
    const notificationCount = h.notifications.length;
    const auditCalls = h.audit.mock.calls.length;
    const mirrorCalls = h.mirror.mock.calls.length;
    const second = await h.service.submit(memberViewer, input());
    // The receipt reuses the stored requestId, never the freshly minted one.
    expect(second.requestId).toBe(first.requestId);
    expect(second.publicReference).toBe(first.publicReference);
    // A replay sends no new outbox intents, audit events, or mirror rows.
    expect(h.notifications).toHaveLength(notificationCount);
    expect(h.audit.mock.calls.length).toBe(auditCalls);
    expect(h.mirror.mock.calls.length).toBe(mirrorCalls);
  });

  it("rejects the same idempotency key for a different request", async () => {
    const h = harness();
    await h.service.submit(memberViewer, input());
    await expect(
      h.service.submit(memberViewer, input({
        generalNotes: "Different request",
      })),
    ).rejects.toBeInstanceOf(AssistedOrderConflictError);
  });

  it("refuses submission missing a required agreement, naming the pair", async () => {
    const h = harness();
    await expect(
      h.service.submit(memberViewer, input({ agreements: [] })),
    ).rejects.toThrow(/assisted_order_request_notice \(version v1\)/);
  });

  it("refuses the version alias 'current' because matching is exact", async () => {
    const h = harness();
    await expect(
      h.service.submit(memberViewer, input({
        agreements: [
          {
            kind: "assisted_order_request_notice",
            version: "current",
            acceptedAt: "2026-08-15T12:00:00.000Z",
          },
          ...FORM_PAIRS,
        ],
      })),
    ).rejects.toThrow(/assisted_order_request_notice \(version v1\)/);
  });

  it("accepts extra acknowledged agreement pairs beyond the required set", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input({
      agreements: [
        {
          kind: "assisted_order_request_notice",
          version: "v1",
          acceptedAt: "2026-08-15T12:00:00.000Z",
        },
        {
          kind: "extra_marketing_notice",
          version: "v7",
          acceptedAt: "2026-08-15T12:00:00.000Z",
        },
        ...FORM_PAIRS,
      ],
    }));
    expect(receipt.status).toBe("submitted");
  });

  it("fails closed when no legal requirements source is configured", async () => {
    const h = harness(item(), { legal: null });
    await expect(
      h.service.submit(memberViewer, input()),
    ).rejects.toThrow(/legal_requirements_unavailable/);
  });

  it("keeps the durable request when email and Google mirror fail", async () => {
    const h = harness();
    (h.deps.outbox as { enqueue(intent: AssistedOrderNotificationIntent): Promise<void> }).enqueue = async () => {
      throw new Error("email unavailable");
    };
    if (h.deps.googleMirror) {
      (h.deps.googleMirror as { enqueue(row: unknown): Promise<void> }).enqueue = async () => {
        throw new Error("Google unavailable");
      };
    }
    const receipt = await h.service.submit(memberViewer, input());
    const view = await h.repository.getStatus({
      memberId: memberViewer.memberId,
      earlyAccessSessionHash: null,
      publicReference: receipt.publicReference,
      statusTokenHash: null,
    });
    expect(view?.requestId).toBe(receipt.requestId);
  });

  it("requires evidence before paid status", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "reviewing" });
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "payment_pending" });
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "payment_review" });
    await expect(
      h.service.updateStatus(adminViewer, receipt.requestId, { status: "paid" }),
    ).rejects.toMatchObject({ code: "payment_evidence_required" });
  });

  it("accepts paid only with canonical verification evidence", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "reviewing" });
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "payment_pending" });
    await h.service.updateStatus(adminViewer, receipt.requestId, { status: "payment_review" });
    const updated = await h.service.updateStatus(adminViewer, receipt.requestId, {
      status: "paid",
      evidence: { paymentVerificationId: "payment-verification-1" },
    });
    expect(updated.status).toBe("paid");
  });

  it("does not collect government ID until identity is requested", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    await expect(
      h.service.createDocumentUpload(memberViewer, receipt.requestId, {
        publicReference: receipt.publicReference,
        statusToken: receipt.statusToken,
        documentType: "government_id",
        side: "front",
        fileName: "id-front.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      }),
    ).rejects.toMatchObject({ code: "identity_not_requested" });
  });

  it("creates a private upload only after identity request", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    await h.service.updateStatus(adminViewer, receipt.requestId, {
      status: "reviewing",
    });
    await h.service.updateStatus(adminViewer, receipt.requestId, {
      status: "identity_requested",
    });
    const ticket = await h.service.createDocumentUpload(memberViewer, receipt.requestId, {
      publicReference: receipt.publicReference,
      statusToken: receipt.statusToken,
      documentType: "government_id",
      side: "front",
      fileName: "id-front.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 1000,
    });
    expect(ticket.uploadUrl).toBe("https://storage.example/upload");
    expect(ticket.objectPath).toContain(receipt.requestId);
  });

  it("lets a manage-capability admin with no member row update status", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    const updated = await h.service.updateStatus(jwtAdminViewer, receipt.requestId, {
      status: "reviewing",
    });
    expect(updated.status).toBe("reviewing");
    const statusAudit = h.audit.mock.calls
      .map((call) => call[0] as { eventType: string; actorId: string | null })
      .find((event) => event.eventType === "assisted_order.status_changed");
    expect(statusAudit?.actorId).toBe("ops@xeniostechnology.com");
  });

  it("refuses status changes from a viewer with no recordable identity", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    const anonymousManager: AssistedOrderViewer = Object.freeze({
      actorType: "admin",
      memberId: null,
      earlyAccessSessionHash: null,
      normalizedEmail: null,
      capabilities: new Set([
        "assisted_orders:read_all",
        "assisted_orders:manage",
      ]),
    });
    await expect(
      h.service.updateStatus(anonymousManager, receipt.requestId, {
        status: "reviewing",
      }),
    ).rejects.toBeInstanceOf(AssistedOrderAuthorizationError);
  });

  it("grants a lapsed viewer with a valid status token read access to exactly their request", async () => {
    const h = harness();
    const first = await h.service.submit(memberViewer, input());
    const second = await h.service.submit(memberViewer, input({
      idempotencyKey: "submit-2",
    }));
    const view = await h.service.status(
      lapsedViewer,
      first.publicReference,
      first.statusToken,
    );
    expect(view.requestId).toBe(first.requestId);
    // The same token never opens a different request.
    await expect(
      h.service.status(lapsedViewer, second.publicReference, first.statusToken),
    ).rejects.toBeInstanceOf(AssistedOrderNotFoundError);
    // Without a token the lapsed viewer stays refused on capability.
    await expect(
      h.service.status(lapsedViewer, first.publicReference),
    ).rejects.toBeInstanceOf(AssistedOrderAuthorizationError);
  });

  it("refuses an invalid status token even for an in-capability viewer path", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    await expect(
      h.service.status(lapsedViewer, receipt.publicReference, "not-the-token"),
    ).rejects.toBeInstanceOf(AssistedOrderNotFoundError);
  });
});

describe("SupabaseAssistedOrderRepository error mapping", () => {
  const address = Object.freeze({
    line1: "100 Test Street",
    city: "Austin",
    region: "TX",
    postalCode: "78704",
    countryCode: "US",
  });
  const createRecord: AssistedOrderCreateRecord = Object.freeze({
    requestId: "22222222-2222-4222-8222-222222222222",
    publicReference: "XRR-20260815-REF99999",
    statusTokenHash: "hash:token-raw",
    requestFingerprint: "fingerprint-1",
    idempotencyKeyHash: "hash:idempotency-1",
    actorMemberId: null,
    earlyAccessSessionHash: null,
    normalizedEmail: "member@example.com",
    fullLegalName: "Test Member",
    mobilePhone: "+15125550100",
    organizationName: null,
    shippingAddress: address,
    billingAddress: address,
    ageConfirmed: true,
    agreements: [],
    generalNotes: null,
    affiliateAttributionRef: null,
    estimatedTotalCents: null,
    currency: "USD",
    source: "early_access_manual_order_bridge",
    lines: [],
    createdAt: "2026-08-15T12:00:00.000Z",
  });

  function failingClient(error: {
    message: string;
    code?: string;
  }): SupabaseRpcClient {
    return { rpc: async () => ({ data: null, error }) };
  }

  it("maps the RPC idempotency conflict (23505) to the 409 conflict error, not a 500", async () => {
    const repository = new SupabaseAssistedOrderRepository(
      failingClient({
        message: "assisted order idempotency conflict",
        code: "23505",
      }),
    );
    const attempt = repository.createOrReplay(createRecord, "token-raw");
    await expect(attempt).rejects.toBeInstanceOf(AssistedOrderConflictError);
    await expect(
      repository.createOrReplay(createRecord, "token-raw"),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
  });

  it("maps other unique violations (23505) to a conflict error", async () => {
    const repository = new SupabaseAssistedOrderRepository(
      failingClient({
        message: 'duplicate key value violates unique constraint "research_assisted_order_requests_public_reference_key"',
        code: "23505",
      }),
    );
    await expect(
      repository.createOrReplay(createRecord, "token-raw"),
    ).rejects.toMatchObject({
      name: "AssistedOrderConflictError",
      code: "duplicate_record",
    });
  });

  it("maps serialization failures (40001) to a retryable conflict error", async () => {
    const repository = new SupabaseAssistedOrderRepository(
      failingClient({
        message: "could not serialize access due to concurrent update",
        code: "40001",
      }),
    );
    await expect(
      repository.createOrReplay(createRecord, "token-raw"),
    ).rejects.toMatchObject({
      name: "AssistedOrderConflictError",
      code: "serialization_conflict",
    });
  });

  it("keeps unrecognized database errors as generic failures", async () => {
    const repository = new SupabaseAssistedOrderRepository(
      failingClient({ message: "relation does not exist", code: "42P01" }),
    );
    const attempt = repository.createOrReplay(createRecord, "token-raw");
    await expect(attempt).rejects.toThrow(/research_assisted_order_submit failed/);
    await expect(
      repository.createOrReplay(createRecord, "token-raw"),
    ).rejects.not.toBeInstanceOf(AssistedOrderConflictError);
  });

  it("marks a differing stored requestId as a replay", async () => {
    const client: SupabaseRpcClient = {
      rpc: async () => ({
        data: {
          requestFingerprint: "fingerprint-1",
          statusTokenHash: "hash:token-raw",
          receipt: {
            requestId: "33333333-3333-4333-8333-333333333333",
            publicReference: "XRR-20260814-REF00001",
            createdAt: "2026-08-14T12:00:00.000Z",
            estimatedTotalCents: null,
            lines: [],
          },
        },
        error: null,
      }),
    };
    const repository = new SupabaseAssistedOrderRepository(client);
    const stored = await repository.createOrReplay(createRecord, "token-raw");
    expect(stored.replayed).toBe(true);
    expect(stored.receipt.requestId).toBe(
      "33333333-3333-4333-8333-333333333333",
    );
  });
});

describe("AssistedOrderService config (D-005)", () => {
  it("publishes the legal set and form acknowledgments when legal resolves", async () => {
    const h = harness();
    const view = await h.service.config(memberViewer);
    expect(view.enabled).toBe(true);
    expect(view.code).toBeNull();
    expect(view.formId).toBe("assisted_order_form_v1");
    expect(view.requiredAgreements).toEqual([
      { kind: "assisted_order_request_notice", version: "v1" },
    ]);
    expect(view.formAcknowledgments.map((a) => a.id)).toEqual([
      "accuracy",
      "contact_consent",
      "request_notice",
      "research_use_only",
    ]);
    // The RUO acknowledgment is published with its condition so the wizard
    // can render it only when the request carries an RUO line.
    expect(
      view.formAcknowledgments.find((a) => a.id === "research_use_only")?.scope,
    ).toBe("research_use_only");
    for (const acknowledgment of view.formAcknowledgments) {
      expect(acknowledgment.kind.startsWith("assisted_order_form_v1:")).toBe(true);
      expect(acknowledgment.copy.length).toBeGreaterThan(10);
    }
  });

  it("reports disabled up front when no legal source is configured", async () => {
    const h = harness(item(), { legal: null });
    const view = await h.service.config(memberViewer);
    expect(view.enabled).toBe(false);
    expect(view.code).toBe("legal_requirements_unavailable");
    expect(view.requiredAgreements).toEqual([]);
  });

  it("reports disabled when the legal source resolves to an empty set", async () => {
    const h = harness(item(), { legal: { requiredAgreements: async () => [] } });
    const view = await h.service.config(memberViewer);
    expect(view.enabled).toBe(false);
    expect(view.code).toBe("legal_requirements_unavailable");
  });

  it("refuses a submission missing a form acknowledgment, naming it", async () => {
    const h = harness();
    await expect(
      h.service.submit(memberViewer, input({
        agreements: [
          {
            kind: "assisted_order_request_notice",
            version: "v1",
            acceptedAt: "2026-08-15T12:00:00.000Z",
          },
          ...FORM_PAIRS.slice(1),
        ],
      })),
    ).rejects.toThrow(/accuracy acknowledgment/);
  });

  it("refuses a form acknowledgment at a drifted copy hash", async () => {
    const h = harness();
    await expect(
      h.service.submit(memberViewer, input({
        agreements: [
          {
            kind: "assisted_order_request_notice",
            version: "v1",
            acceptedAt: "2026-08-15T12:00:00.000Z",
          },
          { ...FORM_PAIRS[0], version: "deadbeefdeadbeef" },
          ...FORM_PAIRS.slice(1),
        ],
      })),
    ).rejects.toThrow(/accuracy acknowledgment/);
  });

  it("pins each precomputed copy hash to the actual copy", async () => {
    const { createHash } = await import("node:crypto");
    for (const acknowledgment of ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS) {
      const expected = createHash("sha256")
        .update(acknowledgment.copy, "utf8")
        .digest("hex")
        .slice(0, 16);
      expect(`${acknowledgment.id}:${acknowledgment.copyHash}`).toBe(
        `${acknowledgment.id}:${expected}`,
      );
    }
  });
});

describe("the research-use-only acknowledgment is conditional", () => {
  it("refuses an RUO request that omits the RUO acknowledgment", async () => {
    const h = harness(item({ researchUseOnly: true }));
    await expect(
      h.service.submit(memberViewer, input({
        agreements: [
          { kind: "assisted_order_request_notice", version: "v1", acceptedAt: "2026-08-15T12:00:00.000Z" },
          ...ALWAYS_PAIRS,
        ],
      })),
    ).rejects.toThrow(/research use only acknowledgment/);
  });

  it("accepts a non-RUO request without the RUO acknowledgment", async () => {
    const h = harness(item({ researchUseOnly: false }));
    const receipt = await h.service.submit(memberViewer, input({
      agreements: [
        { kind: "assisted_order_request_notice", version: "v1", acceptedAt: "2026-08-15T12:00:00.000Z" },
        ...ALWAYS_PAIRS,
      ],
    }));
    expect(receipt.status).toBe("submitted");
  });
});

/**
 * THE TYPED AFFILIATE CODE (founder decision, 2026-08-20).
 *
 * The whole point is that it is a CLAIM, not attribution. The service already
 * refuses a browser-supplied `affiliateAttributionRef` so the browser cannot
 * choose which partner an order pays; the typed code is accepted precisely
 * because it grants nothing. These prove both halves of that: it is stored and
 * surfaced, and it moves nothing it must not move.
 */
describe("the customer-typed affiliate code", () => {
  it("is stored, normalized, as its own fact", async () => {
    const h = harness();
    const receipt = await h.service.submit(
      memberViewer,
      input({ declaredAffiliateCode: " dana10 " }),
    );
    // Read it back the way an operator does. Storing it is not enough: the
    // founder has to be able to SEE it to match it by hand.
    const detail = await h.service.adminDetail(adminViewer, receipt.requestId);
    expect(detail.declaredAffiliateCode).toBe("DANA10");
    expect(detail.declaredAffiliateCodeState).toBe("captured_unmatched");
  });

  it("never lands in the server-verified attribution field", async () => {
    // The invariant that matters most. If a typed string could reach here, the
    // browser would be choosing which partner an order pays.
    const h = harness();
    const receipt = await h.service.submit(
      memberViewer,
      input({
        declaredAffiliateCode: "DANA10",
        affiliateAttributionRef: "partner_forged_by_browser",
      }),
    );
    const detail = await h.service.adminDetail(adminViewer, receipt.requestId);
    expect(detail.affiliateAttributionRef).toBeNull();
    expect(detail.declaredAffiliateCode).toBe("DANA10");
  });

  it("lets an order through with no code at all", async () => {
    const h = harness();
    const receipt = await h.service.submit(memberViewer, input());
    expect(receipt.publicReference).toBeTruthy();
    const detail = await h.service.adminDetail(adminViewer, receipt.requestId);
    expect(detail.declaredAffiliateCodeState).toBe("not_provided");
  });

  it("lets an order through when the code is unknown or malformed", async () => {
    // Founder rule: an unknown code must NOT block an order. Malformed input is
    // dropped, and the customer still gets their request.
    for (const raw of ["NOBODY-HAS-THIS-CODE", "<script>alert(1)</script>", "a b c"]) {
      const h = harness();
      const receipt = await h.service.submit(
        memberViewer,
        input({ idempotencyKey: `k-${raw}`, declaredAffiliateCode: raw }),
      );
      expect(receipt.publicReference, raw).toBeTruthy();
    }
  });

  it("drops a malformed code rather than storing it", async () => {
    const h = harness();
    const receipt = await h.service.submit(
      memberViewer,
      input({ declaredAffiliateCode: "<script>" }),
    );
    const detail = await h.service.adminDetail(adminViewer, receipt.requestId);
    expect(detail.declaredAffiliateCode).toBeNull();
    expect(detail.declaredAffiliateCodeState).toBe("invalid_ignored");
  });

  it("changes no price, and no pathway, whatever the code says", async () => {
    const plain = harness();
    const a = await plain.service.submit(memberViewer, input());
    const withCode = harness();
    const b = await withCode.service.submit(
      memberViewer,
      input({ declaredAffiliateCode: "FREE100.OFF" }),
    );
    expect(b.estimatedTotalCents).toBe(a.estimatedTotalCents);
    expect(b.lines[0].unitPriceCents).toBe(a.lines[0].unitPriceCents);
    expect(b.lines[0].workflowMode).toBe(a.lines[0].workflowMode);
  });

  it("cannot mark anything paid, or move the request out of submitted", async () => {
    const h = harness();
    const receipt = await h.service.submit(
      memberViewer,
      input({ declaredAffiliateCode: "PAID" }),
    );
    const detail = await h.service.adminDetail(adminViewer, receipt.requestId);
    // Whatever the customer typed, the request begins where every request does.
    expect(detail.status).toBe("submitted");
    expect(detail.declaredAffiliateCode).toBe("PAID");
  });

  it("reaches the ADMIN notification and never the customer's", async () => {
    const h = harness();
    await h.service.submit(memberViewer, input({ declaredAffiliateCode: "DANA10" }));
    const admin = h.notifications.find((n) => n.recipientKind === "admin");
    const customer = h.notifications.find((n) => n.recipientKind === "customer");
    expect((admin?.payload as Record<string, unknown>)?.declaredAffiliateCode).toBe("DANA10");
    // The customer has no business seeing internal affiliate bookkeeping.
    expect(JSON.stringify(customer?.payload)).not.toContain("DANA10");
    expect(JSON.stringify(customer?.payload)).not.toMatch(/affiliate/i);
  });

  it("does not duplicate notifications when the same submission replays", async () => {
    const h = harness();
    const first = await h.service.submit(memberViewer, input({ declaredAffiliateCode: "DANA10" }));
    const replay = await h.service.submit(memberViewer, input({ declaredAffiliateCode: "DANA10" }));
    expect(replay.publicReference).toBe(first.publicReference);
    expect(h.notifications).toHaveLength(2);
  });
});
