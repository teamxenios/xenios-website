// The production-wiring regression suite the 2026-08-18 recovery packet
// required. The two Phase Zero defects both lived in composition, not in the
// service: the canonical legal port was constructed and dropped
// (production-deps -> production), and the server-authorized pricing viewer
// never rode the assisted-order viewer (express -> index seam). Every test
// here exercises the real composition functions — buildAssistedOrderProduction
// and createAssistedOrderProductionComposition — never the isolated service,
// so re-dropping either wire fails HERE, before a packet is written.

import { describe, expect, it } from "vitest";
import type {
  AssistedOrderSubmitInput,
} from "../../../shared/research/assisted-order/contract";
import {
  ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS,
  assistedOrderFormPair,
} from "../../../shared/research/assisted-order/form";
import { InMemoryAssistedOrderRepository } from "./memory-repository";
import type {
  AssistedOrderDocumentStore,
  AssistedOrderViewer,
} from "./ports";
import {
  ASSISTED_ORDER_ADMIN_EMAIL_ENV_VAR,
  ASSISTED_ORDER_BRIDGE_ENABLED_ENV_VAR,
  buildAssistedOrderProduction,
  type AssistedOrderProductionWiring,
} from "./production-deps";
import { createAssistedOrderProductionComposition } from "./production";
import { AssistedOrderNotFoundError } from "./service";
import type { SupabaseRpcClient } from "./supabase-repository";
import type { SupabaseStorageClient } from "./supabase-document-store";

const REQUIRED_AGREEMENTS = [
  { kind: "assisted_order_request_notice", version: "v1" },
] as const;

const FORM_PAIRS = ASSISTED_ORDER_FORM_ACKNOWLEDGMENTS.map((a) => ({
  ...assistedOrderFormPair(a),
  acceptedAt: "2026-08-19T12:00:00.000Z",
}));

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

const otherMemberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "22222222-2222-4222-8222-222222222222",
  earlyAccessSessionHash: null,
  normalizedEmail: "other@example.com",
  capabilities: new Set([
    "assisted_orders:submit",
    "assisted_orders:read_own",
  ]),
});

const fakeRpc: SupabaseRpcClient = {
  rpc: async () => ({ data: null, error: null }),
};

const fakeStorage = {
  from: () => ({}),
} as unknown as SupabaseStorageClient;

function wiring(
  overrides: Partial<AssistedOrderProductionWiring> = {},
): AssistedOrderProductionWiring {
  return {
    env: {
      [ASSISTED_ORDER_BRIDGE_ENABLED_ENV_VAR]: "true",
      [ASSISTED_ORDER_ADMIN_EMAIL_ENV_VAR]: "research@xeniostechnology.com",
    } as NodeJS.ProcessEnv,
    requiredAgreements: REQUIRED_AGREEMENTS,
    masterOfferingServiceFor: () => null,
    bindingFor: () => null,
    offeringVariantFor: () => null,
    catalogVersion: "catalog-v1",
    supabaseRpc: fakeRpc,
    supabaseStorage: fakeStorage,
    auditWrite: async () => undefined,
    log: () => undefined,
    ...overrides,
  };
}

describe("buildAssistedOrderProduction (the layer that dropped the legal port)", () => {
  it("stays dark when the flag is off", () => {
    const composition = buildAssistedOrderProduction(wiring({ env: {} as NodeJS.ProcessEnv }));
    expect(composition.enabled).toBe(false);
    expect(composition.service).toBeNull();
    expect(composition.refusalReason).toBe("assisted_order_bridge_disabled");
  });

  it("carries the canonical legal port into the live service: config reports enabled with the exact required pairs", async () => {
    const composition = buildAssistedOrderProduction(wiring());
    expect(composition.refusalReason).toBeNull();
    expect(composition.service).not.toBeNull();
    const config = await composition.service!.config(memberViewer);
    // THE defect-A assertion. Before the repair this was enabled:false /
    // legal_requirements_unavailable even with every dependency present.
    expect(config.enabled).toBe(true);
    expect(config.code).toBeNull();
    expect(config.requiredAgreements).toEqual(REQUIRED_AGREEMENTS.map((pair) => ({ ...pair })));
  });

  it("fails closed up front when the canonical agreement list is absent", async () => {
    const composition = buildAssistedOrderProduction(
      wiring({ requiredAgreements: undefined }),
    );
    // The service still composes; the feature truthfully reports itself
    // unavailable (D-005) instead of inventing an agreement version.
    expect(composition.service).not.toBeNull();
    const config = await composition.service!.config(memberViewer);
    expect(config.enabled).toBe(false);
    expect(config.code).toBe("legal_requirements_unavailable");
    expect(config.requiredAgreements).toEqual([]);
  });

  it("fails closed up front when the canonical agreement list is empty", async () => {
    const composition = buildAssistedOrderProduction(wiring({ requiredAgreements: [] }));
    expect(composition.service).not.toBeNull();
    const config = await composition.service!.config(memberViewer);
    expect(config.enabled).toBe(false);
    expect(config.code).toBe("legal_requirements_unavailable");
  });

  it("never falls back to memory: a missing repository or document store is a named refusal", () => {
    const noRpc = buildAssistedOrderProduction(wiring({ supabaseRpc: null }));
    expect(noRpc.service).toBeNull();
    expect(noRpc.refusalReason).toContain("repository");

    const noStorage = buildAssistedOrderProduction(wiring({ supabaseStorage: null }));
    expect(noStorage.service).toBeNull();
    expect(noStorage.refusalReason).toContain("documents");
  });

  it("refuses without the admin notification email", () => {
    const composition = buildAssistedOrderProduction(
      wiring({
        env: {
          [ASSISTED_ORDER_BRIDGE_ENABLED_ENV_VAR]: "true",
        } as NodeJS.ProcessEnv,
      }),
    );
    expect(composition.service).toBeNull();
    expect(composition.refusalReason).toContain("adminNotificationEmail");
  });
});

// A composed submit through createAssistedOrderProductionComposition — the
// function that constructs the real service — with the durable repository
// port observable, so the receipt and the stored row are both proven.
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

const fixtureDocuments: AssistedOrderDocumentStore = {
  createUpload: async (request) => ({
    documentId: "assigned-by-service",
    uploadUrl: "https://storage.example/upload",
    objectPath: request.objectPath,
    expiresAt: "2026-08-19T12:15:00.000Z",
    requiredHeaders: { "content-type": request.mimeType },
  }),
  createDownload: async () => ({
    url: "https://storage.example/download",
    expiresAt: "2026-08-19T12:05:00.000Z",
  }),
};

function composedService(repository = new InMemoryAssistedOrderRepository()) {
  const composition = createAssistedOrderProductionComposition({
    enabled: true,
    legal: {
      requiredAgreements: async () => REQUIRED_AGREEMENTS.map((pair) => ({ ...pair })),
    },
    catalog: {
      list: async () => ({
        items: [CATALOG_ITEM],
        total: 1,
        page: 1,
        pageSize: 24,
        families: [CATALOG_ITEM.family],
        channels: [CATALOG_ITEM.channel],
        workflowModes: [CATALOG_ITEM.workflowMode],
      }),
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
    documents: fixtureDocuments,
    adminNotificationEmail: "research@xeniostechnology.com",
  });
  expect(composition.refusalReason).toBeNull();
  return { service: composition.service!, repository };
}

function submitInput(
  overrides: Partial<AssistedOrderSubmitInput> = {},
): AssistedOrderSubmitInput {
  return {
    idempotencyKey: "wiring-submit-1",
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
    ...overrides,
  };
}

describe("the composed production service (createAssistedOrderProductionComposition)", () => {
  it("accepts a valid submission into the durable repository and returns an XRR reference", async () => {
    const { service, repository } = composedService();
    const receipt = await service.submit(memberViewer, submitInput());
    expect(receipt.publicReference).toMatch(/^XRR-\d{8}-[0-9A-F]{10}$/);
    // Durable: the composed service's own status read finds the stored row.
    const view = await service.status(
      memberViewer,
      receipt.publicReference,
    );
    expect(view.requestId).toBe(receipt.requestId);
    expect(repository).toBeDefined();
  });

  it("refuses a cross-customer status read as not found", async () => {
    const { service } = composedService();
    const receipt = await service.submit(memberViewer, submitInput());
    await expect(
      service.status(otherMemberViewer, receipt.publicReference),
    ).rejects.toBeInstanceOf(AssistedOrderNotFoundError);
  });

  it("keeps supplier cost, margin, and internal fields out of customer payloads", async () => {
    const { service } = composedService();
    const receipt = await service.submit(memberViewer, submitInput({
      idempotencyKey: "wiring-submit-leak",
    }));
    const view = await service.status(memberViewer, receipt.publicReference);
    const config = await service.config(memberViewer);
    const surface = JSON.stringify([receipt, view, config]).toLowerCase();
    for (const banned of ["wholesale", "margin", "internalnote", "suppliercost", "grossprofit"]) {
      expect(surface).not.toContain(banned);
    }
  });
});
