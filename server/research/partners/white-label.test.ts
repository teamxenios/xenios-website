import { describe, expect, it, vi } from "vitest";
import {
  assertWhiteLabelPartnerPayloadSafe,
  type WhiteLabelCommandResult,
  type WhiteLabelWorkspaceView,
} from "@shared/research/partners/white-label";
import {
  createWhiteLabelPartnerService,
  type WhiteLabelVariantAuthority,
  type WhiteLabelVariantAuthorityRecord,
  type WhiteLabelWorkspaceCommandPort,
} from "./white-label";

const ACTIVE_VARIANT: WhiteLabelVariantAuthorityRecord = {
  productId: "product-opaque",
  variantId: "variant-opaque",
  sku: "SKU-EXACT-1",
  productName: "Research peptide",
  variantName: "10 mg presentation",
  productApproved: true,
  productActive: true,
  variantApproved: true,
  variantActive: true,
  privateLabelApproved: true,
  qualityState: "verified",
};

function workspace(overrides: Partial<WhiteLabelWorkspaceView> = {}): WhiteLabelWorkspaceView {
  return {
    organizationId: "organization-opaque",
    organizationName: "North Studio",
    applicationState: "approved",
    version: 3,
    trackingState: "awaiting_partner",
    brand: {
      brandName: null,
      logoAssetReference: null,
      primaryColor: null,
      secondaryColor: null,
      mode: null,
      packagingNotes: null,
      packagingState: "not_started",
      packagingPreviewReference: null,
    },
    fulfillmentMode: null,
    variants: [],
    selections: [
      {
        selectionId: "selection-1",
        productId: ACTIVE_VARIANT.productId,
        variantId: ACTIVE_VARIANT.variantId,
        sku: ACTIVE_VARIANT.sku,
        productName: ACTIVE_VARIANT.productName,
        variantName: ACTIVE_VARIANT.variantName,
        requestedQuantity: 100,
        qualityState: "verified",
        createdAt: "2026-07-31T12:00:00.000Z",
      },
    ],
    quotes: [],
    supportTickets: [],
    updatedAt: "2026-07-31T12:00:00.000Z",
    ...overrides,
  };
}

function accepted(value = workspace(), idempotentReplay = false) {
  return { ok: true as const, value: { workspace: value, idempotentReplay } satisfies WhiteLabelCommandResult };
}

function port(current = workspace()): WhiteLabelWorkspaceCommandPort {
  return {
    getForMember: vi.fn(async () => current),
    applyForMember: vi.fn(async () => accepted(current)),
    updateBrandForMember: vi.fn(async () => accepted(current)),
    selectVariantForMember: vi.fn(async () => accepted(current)),
    requestQuoteForMember: vi.fn(async () => accepted(current)),
    submitPackagingForMember: vi.fn(async () => accepted(current)),
    setFulfillmentForMember: vi.fn(async () => accepted(current)),
    openSupportForMember: vi.fn(async () => accepted(current)),
  };
}

function authority(record: WhiteLabelVariantAuthorityRecord | null = ACTIVE_VARIANT): WhiteLabelVariantAuthority {
  return {
    listForMember: vi.fn(async () => (record ? [record] : [])),
    findExact: vi.fn(async (_memberId, sku) => (record?.sku === sku ? record : null)),
  };
}

const NOW = () => new Date("2026-07-31T13:00:00.000Z");

describe("white-label partner service", () => {
  it("builds a partner-safe workspace from server-authoritative exact variant readiness", async () => {
    const service = createWhiteLabelPartnerService({ port: port(), variants: authority(), now: NOW });
    const result = await service.get("member-a");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.variants).toEqual([
      expect.objectContaining({ sku: "SKU-EXACT-1", selectable: true, qualityState: "verified" }),
    ]);
    expect(() => assertWhiteLabelPartnerPayloadSafe(result.value)).not.toThrow();
    expect(JSON.stringify(result.value)).not.toMatch(/supplierCost|margin|multiplier|commission|payout/i);
  });

  it("fails closed for unknown, inactive, cross-SKU, or non-private-label variants", async () => {
    for (const candidate of [
      null,
      { ...ACTIVE_VARIANT, productActive: false },
      { ...ACTIVE_VARIANT, variantApproved: false },
      { ...ACTIVE_VARIANT, privateLabelApproved: false },
      { ...ACTIVE_VARIANT, qualityState: "blocked" as const },
    ]) {
      const store = port();
      const service = createWhiteLabelPartnerService({ port: store, variants: authority(candidate), now: NOW });
      const result = await service.selectVariant("member-a", {
        sku: "SKU-EXACT-1",
        requestedQuantity: 100,
        expectedVersion: 3,
        idempotencyKey: "selection-command-0001",
      });
      expect(result).toMatchObject({ ok: false, code: "white_label_variant_unavailable" });
      expect(store.selectVariantForMember).not.toHaveBeenCalled();
    }
  });

  it("passes the canonical product, variant, and SKU identity to the atomic command port", async () => {
    const store = port();
    const variants = authority();
    const service = createWhiteLabelPartnerService({ port: store, variants, now: NOW });
    await service.selectVariant("member-a", {
      sku: "SKU-EXACT-1",
      requestedQuantity: 100,
      expectedVersion: 3,
      idempotencyKey: "selection-command-0001",
    });
    expect(variants.findExact).toHaveBeenCalledWith("member-a", "SKU-EXACT-1");
    expect(store.selectVariantForMember).toHaveBeenCalledWith(
      "member-a",
      expect.objectContaining({ sku: "SKU-EXACT-1" }),
      ACTIVE_VARIANT,
      "2026-07-31T13:00:00.000Z",
    );
  });

  it("revalidates every exact selection before requesting a quote", async () => {
    const store = port();
    const variants = authority({ ...ACTIVE_VARIANT, qualityState: "blocked" });
    const service = createWhiteLabelPartnerService({ port: store, variants, now: NOW });
    const result = await service.requestQuote("member-a", {
      selectionIds: ["selection-1"],
      note: null,
      expectedVersion: 3,
      idempotencyKey: "quote-command-0000001",
    });
    expect(result).toMatchObject({ ok: false, code: "white_label_variant_unavailable" });
    expect(store.requestQuoteForMember).not.toHaveBeenCalled();
  });

  it("requires approval and a positive optimistic version for configuration", async () => {
    const store = port(workspace({ applicationState: "under_review" }));
    const service = createWhiteLabelPartnerService({ port: store, variants: authority(), now: NOW });
    const result = await service.updateBrand("member-a", {
      brandName: "North",
      logoAssetReference: null,
      primaryColor: "#111111",
      secondaryColor: "#eeeeee",
      mode: "co_branded",
      packagingNotes: null,
      expectedVersion: 0,
      idempotencyKey: "brand-command-0000001",
    });
    expect(result).toMatchObject({ ok: false, code: "white_label_not_approved" });
    expect(store.updateBrandForMember).not.toHaveBeenCalled();
  });

  it("treats fulfillment as a stored preference and exposes no provider action dependency", async () => {
    const store = port();
    const service = createWhiteLabelPartnerService({ port: store, variants: authority(), now: NOW });
    const result = await service.setFulfillment("member-a", {
      mode: "blind_shipping",
      expectedVersion: 3,
      idempotencyKey: "fulfillment-command-01",
    });
    expect(result.ok).toBe(true);
    expect(store.setFulfillmentForMember).toHaveBeenCalledTimes(1);
    expect(Object.keys(service)).not.toContain("buyLabel");
    expect(Object.keys(service)).not.toContain("executeFulfillment");
    expect(Object.keys(service)).not.toContain("payout");
  });

  it("preserves caller idempotency identity across concurrent retries", async () => {
    const store = port();
    vi.mocked(store.openSupportForMember).mockResolvedValue(accepted(workspace(), true));
    const service = createWhiteLabelPartnerService({ port: store, variants: authority(), now: NOW });
    const input = {
      subject: "Packaging question",
      topic: "brand" as const,
      detail: "Please confirm the preview review sequence.",
      expectedVersion: 3,
      idempotencyKey: "support-command-000001",
    };
    const results = await Promise.all([service.openSupport("member-a", input), service.openSupport("member-a", input)]);
    expect(results.every((result) => result.ok && result.value.idempotentReplay)).toBe(true);
    expect(store.openSupportForMember).toHaveBeenNthCalledWith(1, "member-a", input, "2026-07-31T13:00:00.000Z");
    expect(store.openSupportForMember).toHaveBeenNthCalledWith(2, "member-a", input, "2026-07-31T13:00:00.000Z");
  });

  it("blocks internal economics even when a repository projection is malformed", async () => {
    const unsafe = { ...workspace(), supplierCostCents: 1234 } as unknown as WhiteLabelWorkspaceView;
    const service = createWhiteLabelPartnerService({ port: port(unsafe), variants: authority(), now: NOW });
    await expect(service.get("member-a")).rejects.toThrow("partner payload blocked");
  });
});
