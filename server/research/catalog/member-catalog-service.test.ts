import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminProductDetail } from "@shared/research/product-admin";
import type { MemberRow } from "../member-auth";
import { MemberCatalogService } from "./member-catalog-service";

const MEMBER: MemberRow = {
  id: "member-1",
  application_id: "application-1",
  auth_user_id: "auth-1",
  email: "member@example.invalid",
  first_name: "Member",
  status: "active",
  billing_state: "active",
  created_at: "2026-07-27T12:00:00.000Z",
  updated_at: "2026-07-27T12:30:00.000Z",
};

function dependencies(configured = true) {
  return {
    configured: () => configured,
    db: () =>
      ({
        storage: {
          from: vi.fn(() => ({
            createSignedUrl: vi.fn(),
          })),
        },
      }) as unknown as SupabaseClient,
    products: {
      readCatalog: vi.fn(async () => []),
    },
    requiredInputs: {
      list: vi.fn(async () => []),
      readinessAll: vi.fn(async () => []),
    },
    now: () => new Date("2026-07-27T13:00:00.000Z"),
  };
}

const MEDIA_PRODUCT = {
  id: "product-1",
  productCode: "PRODUCT-1",
  slug: "product-1",
  displayName: "Product 1",
  canonicalName: "Product 1",
  aliases: [],
  lane: "research_material",
  category: "Research",
  classification: "Research material",
  status: "draft",
  active: false,
  visibility: "hidden",
  availability: "not_available",
  commerceApproval: "pending",
  qualityDocumentState: "missing",
  variantCount: 0,
  approvedVariantCount: 0,
  missingInputCount: 0,
  updatedAt: "2026-07-27T12:30:00.000Z",
  publishedAt: null,
  content: {
    shortDescription: null,
    longDescription: null,
    overview: null,
    specifications: null,
    researchInformation: null,
    storageInformation: null,
    handlingInformation: null,
    shippingInformation: null,
    returnInformation: null,
    disclaimers: null,
    citations: [],
    reviewDate: null,
  },
  variants: [],
  prices: [],
  media: [
    {
      id: "media-1",
      productId: "product-1",
      kind: "primary_image",
      state: "approved",
      storageKey: "product-1/media-1/product-1.webp",
      filename: "product-1.webp",
      contentType: "image/webp",
      sizeBytes: 100,
      altText: "Product 1",
      sortOrder: 0,
      approvedBy: "reviewer",
      createdAt: "2026-07-27T12:00:00.000Z",
      updatedAt: "2026-07-27T12:30:00.000Z",
    },
  ],
  history: [],
} as unknown as AdminProductDetail;

function mediaDependencies(
  createSignedUrl: ReturnType<typeof vi.fn>,
  product: AdminProductDetail = MEDIA_PRODUCT,
) {
  return {
    ...dependencies(),
    db: () =>
      ({
        storage: {
          from: vi.fn(() => ({ createSignedUrl })),
        },
      }) as unknown as SupabaseClient,
    products: {
      readCatalog: vi.fn(async () => [product]),
    },
  };
}

describe("MemberCatalogService", () => {
  it("returns a truthful empty catalog without manufacturing Product Control or inventory facts", async () => {
    const deps = dependencies();
    const service = new MemberCatalogService(deps);
    await expect(service.list({ member: MEMBER })).resolves.toEqual({
      audience: "member",
      currency: "USD",
      evaluatedAt: "2026-07-27T13:00:00.000Z",
      items: [],
      categories: [],
      lanes: [],
    });
    expect(deps.products.readCatalog).toHaveBeenCalledTimes(1);
    expect(deps.requiredInputs.list).toHaveBeenCalledTimes(1);
    expect(deps.requiredInputs.readinessAll).toHaveBeenCalledTimes(1);
  });

  it("fails closed before reads when production persistence is unavailable", async () => {
    const deps = dependencies(false);
    const service = new MemberCatalogService(deps);
    await expect(service.list({ member: MEMBER })).rejects.toThrow(
      "member_catalog_not_configured",
    );
    expect(deps.products.readCatalog).not.toHaveBeenCalled();
  });

  it("treats thrown, rejected, and returned signing failures as absent presentation", async () => {
    const signers = [
      vi.fn(() => {
        throw new Error("storage unavailable");
      }),
      vi.fn(async () => {
        throw new Error("storage unavailable");
      }),
      vi.fn(async () => ({ data: null, error: { message: "storage unavailable" } })),
    ];

    for (const signer of signers) {
      const service = new MemberCatalogService(mediaDependencies(signer));
      await expect(service.list({ member: MEMBER })).resolves.toMatchObject({
        items: [],
      });
      expect(signer).toHaveBeenCalledTimes(1);
    }
  });

  it("does not sign a mismatched media path", async () => {
    const signer = vi.fn();
    const product = {
      ...MEDIA_PRODUCT,
      media: [
        {
          ...MEDIA_PRODUCT.media[0],
          storageKey: "product-1/media-other/product-1.webp",
        },
      ],
    } as AdminProductDetail;
    const service = new MemberCatalogService(
      mediaDependencies(signer, product),
    );
    await expect(service.list({ member: MEMBER })).resolves.toMatchObject({
      items: [],
    });
    expect(signer).not.toHaveBeenCalled();
  });

  it("does not hide independent required-input read failures", async () => {
    const deps = dependencies();
    deps.requiredInputs.list = vi.fn(async () => {
      throw new Error("required_input_read_failed");
    });
    const service = new MemberCatalogService(deps);
    await expect(service.list({ member: MEMBER })).rejects.toThrow(
      "required_input_read_failed",
    );
  });
});
