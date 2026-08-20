// The defect-B chain, end to end through the REAL pieces: the assisted-order
// express member resolver attaches the server-derived pricing viewer, the
// index seam hands it to the real master-offerings composition, the real
// approved-price authority resolves it, and the assisted-order catalog
// projects the price. A viewer that rides the same chain WITHOUT a grant
// truthfully stays "Price on request" — never zero.
//
// CHANGED DELIBERATELY 2026-08-20. When this was written, an Early Access
// session was such a grantless viewer, and that was the whole defect: 420
// catalog rows and not one price. An Early Access session now carries the
// Early Access RETAIL grant (see early-access-retail-pricing.ts), so the case
// below is no longer "an Early Access session" but the narrower and still
// essential one it always really tested: NO GRANT MEANS NO PRICE. The Early
// Access behaviour itself is proved in early-access-retail-pricing.test.ts.
//
// This test lives INSIDE the master-offerings lane on purpose: the lane
// boundary (catalog-boundaries.test.ts) allows only the composition root to
// import `composition` and `service`, and this proof needs both.

import { describe, expect, it } from "vitest";
import type { Request } from "express";
import type { AdminProductDetail } from "@shared/research/product-admin";
import { createAssistedOrderViewerResolvers } from "../assisted-order/express";
import {
  createAssistedOrderMasterCatalogCallbacks,
  type AssistedOrderMasterCatalogService,
} from "../assisted-order/production-catalog";
import type { MemberRow } from "../member-auth";
import { createMasterOfferingCatalogDependencies } from "./composition";
import {
  masterOfferingViewerForMember,
  pricingIdentityFromViewer,
} from "./member-pricing-viewer";
import { InMemoryMasterOfferingCatalogReader } from "./service";
import { offering, variant } from "./test-fixtures";

const OFFERING = offering({
  variants: [variant({ id: "mov_a", label: "5 mg vial" })],
});

const BINDING = {
  offeringVariantId: "mov_a",
  productId: "pc_product_1",
  variantId: "pc_variant_1",
};

/** A Product Control product with one approved, active, in-window price. */
function pricedProduct(): AdminProductDetail {
  return {
    id: "pc_product_1",
    status: "published",
    visibility: "public",
    active: true,
    variants: [
      {
        id: "pc_variant_1",
        productId: "pc_product_1",
        status: "approved",
        active: true,
        memberEligible: true,
        sku: "XEN-BPC-5",
      },
    ],
    prices: [
      {
        id: "price_1",
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        audience: "member",
        amountCents: 9900,
        currency: "USD",
        effectiveAt: "2026-08-01T00:00:00.000Z",
        expiresAt: null,
        status: "active",
        approvalNote: null,
        version: 1,
        createdBy: "ops",
        approvedBy: "founder",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      },
    ],
  } as unknown as AdminProductDetail;
}

const MEMBER_ROW: MemberRow = {
  id: "11111111-1111-4111-8111-111111111111",
  application_id: "app-1",
  auth_user_id: "auth-1",
  email: "member@example.com",
  first_name: "Test",
  status: "active",
  created_at: "2026-08-01T00:00:00.000Z",
};

function realCatalogCallbacks() {
  const dependencies = createMasterOfferingCatalogDependencies(
    {
      bindings: { readBinding: () => BINDING },
      selections: {
        select: async () => ({ ok: false, code: "product_commerce_unapproved" as const }),
      },
      pricingSource: { readProductForPricing: async () => pricedProduct() },
      // The REAL null-safe helper the composition root uses; before the
      // repair the inline version threw on an absent viewer.
      identityFor: (viewer) => pricingIdentityFromViewer(viewer),
      catalogReader: new InMemoryMasterOfferingCatalogReader([OFFERING]),
      env: {},
    },
    () => null,
  );
  // The exact seam server/index.ts wires: the pricing viewer rides the
  // assisted-order viewer into serviceForViewer.
  return createAssistedOrderMasterCatalogCallbacks({
    serviceFor: (viewer) => {
      try {
        const service = dependencies.serviceForViewer(viewer.pricingViewer as never);
        return service instanceof Promise
          ? null
          : (service as unknown as AssistedOrderMasterCatalogService);
      } catch {
        return null;
      }
    },
    bindingFor: (offeringVariantId) =>
      offeringVariantId === BINDING.offeringVariantId
        ? { productId: BINDING.productId, variantId: BINDING.variantId }
        : null,
    offeringVariantFor: (identity) =>
      identity.productId === BINDING.productId && identity.variantId === BINDING.variantId
        ? BINDING.offeringVariantId
        : null,
    catalogVersion: "catalog-v1",
  });
}

function viewerResolvers(memberRow: MemberRow | null) {
  return createAssistedOrderViewerResolvers({
    resolveMember: async () =>
      memberRow
        ? {
            id: memberRow.id,
            email: memberRow.email,
            pricingViewer: masterOfferingViewerForMember(memberRow, ""),
          }
        : null,
    earlyAccess: () => ({
      identity: { resolve: async () => ({ email: "ea@example.com" }) },
      readSessionId: () => "ea-session-1",
    }),
    adminEmail: () => "research@xeniostechnology.com",
  });
}

describe("the server-authorized pricing viewer rides the assisted-order viewer (defect B)", () => {
  it("prices the catalog with the canonical approved member price for an authenticated member", async () => {
    const resolvers = viewerResolvers(MEMBER_ROW);
    const viewer = await resolvers.customer({ headers: {} } as unknown as Request);
    expect(viewer.actorType).toBe("member");
    expect(viewer.pricingViewer).toBeTruthy();

    const catalog = realCatalogCallbacks();
    const page = await catalog.list(viewer, { page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    // THE defect-B assertion. Before the repair this was null ("Price on
    // request") for every viewer, member or not.
    expect(item.unitPriceCents).toBe(9900);
    expect(item.priceVersion).toBe("price_1");
    expect(item.workflowMode).toBe("direct_order_request");
  });

  it("keeps a viewer with no pricing grant on Price on request — never zero", async () => {
    const resolvers = viewerResolvers(null);
    const viewer = await resolvers.customer({
      headers: { cookie: "ea=1" },
    } as unknown as Request);
    expect(viewer.actorType).toBe("early_access_session");
    expect(viewer.pricingViewer ?? null).toBeNull();

    const catalog = realCatalogCallbacks();
    const page = await catalog.list(viewer, { page: 1, pageSize: 24 });
    expect(page.items).toHaveLength(1);
    const item = page.items[0];
    expect(item.unitPriceCents).toBeNull();
    expect(item.unitPriceCents).not.toBe(0);
    expect(item.workflowMode).toBe("request_pricing");
  });

  it("admin viewers carry no customer pricing grant", async () => {
    const resolvers = viewerResolvers(null);
    const viewer = await resolvers.admin({ headers: {} } as unknown as Request);
    expect(viewer.actorType).toBe("admin");
    expect(viewer.pricingViewer ?? null).toBeNull();
  });
});
