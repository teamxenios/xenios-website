import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS,
  type AdminProductDetail,
} from "@shared/research/product-admin";
import {
  MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS,
  type MemberProductDetail,
} from "@shared/research/member-catalog";
import type { DomainReadiness, RequiredInput } from "@shared/research/required-inputs";
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

const AT = "2026-07-27T13:00:00.000Z";
const BUCKET = "research-product-media-production";

type MediaSigner = (path: string, ttl: number) => unknown;

function signedMedia(path: string) {
  return {
    data: {
      signedUrl: `https://yvzeduaxbwgcwllhywff.supabase.co/storage/v1/object/sign/${BUCKET}/${path}?token=synthetic.signature.only`,
    },
    error: null,
  };
}

function catalogProduct(id = "product-a"): AdminProductDetail {
  return {
    id,
    productCode: id.toUpperCase(),
    slug: id,
    displayName: id === "product-a" ? "Alpha Research" : "Beta Research",
    canonicalName: id,
    aliases: [],
    lane: "research_material",
    category: "Research",
    classification: "Research material",
    status: "published",
    active: true,
    visibility: "public",
    availability: "in_stock",
    commerceApproval: "approved",
    qualityDocumentState: "approved",
    variantCount: 1,
    approvedVariantCount: 1,
    missingInputCount: 0,
    updatedAt: AT,
    publishedAt: AT,
    content: {
      shortDescription: "Reviewed product summary.",
      longDescription: null,
      overview: "Reviewed overview.",
      specifications: "Reviewed specifications.",
      researchInformation: "Research information.",
      storageInformation: "Reviewed storage information.",
      handlingInformation: null,
      shippingInformation: "Shipping information.",
      returnInformation: "Return information.",
      disclaimers: "Research use only.",
      citations: [],
      reviewDate: "2026-07-20",
    },
    variants: [{
      id: `${id}-variant`, productId: id, sku: `${id}-SKU`,
      catalogNumber: null, label: "Standard", strength: "10 mg", size: null,
      format: "Vial", presentation: "Single unit", shippingClass: "standard",
      memberEligible: true, status: "approved", active: true, sortOrder: 0,
      createdAt: AT, updatedAt: AT,
    }],
    prices: [{
      id: `${id}-price`, productId: id, variantId: `${id}-variant`,
      audience: "member", amountCents: 14900, currency: "USD",
      effectiveAt: "2026-07-01T00:00:00.000Z", expiresAt: null, status: "active",
      approvalNote: "Approved", version: 2, createdBy: "admin",
      approvedBy: "reviewer", createdAt: AT, updatedAt: AT,
    }],
    media: [{
      id: `${id}-media`, productId: id,
      variantId: `${id}-variant`, width: 1024, height: 1024, contentSha256: "a".repeat(64), illustrative: false,
      kind: "primary_image", state: "approved",
      storageKey: `${id}/${id}-media/${id}.webp`, filename: `${id}.webp`,
      contentType: "image/webp", sizeBytes: 100, altText: `${id} package`,
      sortOrder: 0, approvedBy: "reviewer", createdAt: AT, updatedAt: AT,
    }],
    history: [],
  };
}

function productInputs(productId: string): RequiredInput[] {
  return PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS.map((binding, index) => ({
    ...binding,
    id: `${productId}-input-${index}`,
    label: "Reviewed product fact",
    description: "Reviewed product fact",
    whyRequired: "Canonical product fact",
    recordId: productId,
    fieldPath: binding.key,
    currentState: "verified",
    blockingLevel: "blocks_display",
    responsibleRole: "product_admin",
    verificationMethod: "review",
    evidenceRequired: [],
    entryMode: "direct",
    valueSensitivity: "ordinary",
    enteredValue: "reviewed",
    externalReferenceName: null,
    enteredBy: "admin",
    enteredAt: AT,
    verifiedBy: "reviewer",
    verifiedAt: AT,
    rejectionReason: null,
    publicLaunchImpact: "Blocks release.",
    nextAction: "Review.",
    adminEntryHref: "/internal",
    version: index + 1,
    auditHistory: [],
  }));
}

function mediaDependencies(
  signer: MediaSigner = vi.fn(async (path: string) => signedMedia(path)),
  products = [catalogProduct()],
) {
  const storageFrom = vi.fn(() => ({ createSignedUrl: signer }));
  const inventoryRead = vi.fn(async (identity: Record<string, string>) => ({
    data: [{
      id: `${identity.product_id}-lot`,
      product_id: identity.product_id,
      variant_id: identity.variant_id,
      sku: identity.sku,
      disposition: "released",
      version: 1,
      updated_at: AT,
    }],
    error: null,
  }));
  const allocatable = vi.fn(async () => ({ data: true, error: null }));
  const db = {
    storage: { from: storageFrom },
    from: vi.fn(() => {
      const identity: Record<string, string> = {};
      const query = {
        select: () => query,
        eq: (key: string, value: string) => {
          identity[key] = value;
          return query;
        },
        order: () => inventoryRead(identity),
      };
      return query;
    }),
    rpc: allocatable,
  };
  const ready = (domain: string): DomainReadiness => {
    const count = products.length * PRODUCT_COMMERCE_REQUIRED_INPUT_BINDINGS
      .filter((binding) => binding.domain === domain).length;
    return {
      domain, launchStatus: "public_enabled", softwareComplete: true,
      realInputsRequired: false, publicEnabled: true, manifestApproved: true,
      expectedInputCount: count, actualInputCount: count, blockingInputCount: 0,
      blockingKeys: [], version: 3,
    };
  };
  return {
    deps: {
      configured: () => true,
      db: () => db as unknown as SupabaseClient,
      products: { readCatalog: vi.fn(async () => products) },
      requiredInputs: {
        list: vi.fn(async () => products.flatMap((product) => productInputs(product.id))),
        readinessAll: vi.fn(async () => [ready("products"), ready("product_content")]),
      },
      now: () => new Date(AT),
    },
    signer,
    storageFrom,
    inventoryRead,
    allocatable,
  };
}

function commerceFacts(product: MemberProductDetail | null) {
  if (product === null) throw new Error("catalog product was unexpectedly dropped");
  const { media: _presentation, ...facts } = product;
  return facts;
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

  it("signs only the production media bucket and retains independent commerce facts", async () => {
    const setup = mediaDependencies();
    const service = new MemberCatalogService(setup.deps);
    const product = await service.detail({ member: MEMBER, slug: "product-a" });
    expect(setup.storageFrom).toHaveBeenCalledWith(BUCKET);
    expect(setup.signer).toHaveBeenCalledWith(
      "product-a/product-a-media/product-a.webp",
      MEMBER_CATALOG_SIGNED_MEDIA_TTL_SECONDS,
    );
    expect(product).toMatchObject({
      id: "product-a",
      media: { policy: "xenios_signed_storage_v1" },
      price: { amountCents: 14900 },
      displayState: "unavailable",
      selection: null,
      variants: [{
        availability: "available",
        price: { amountCents: 14900 },
        selection: null,
        selectionFailure: "activation_authority_missing",
      }],
    });
  });

  it("isolates thrown, rejected, returned, and malformed signing results from catalog and detail", async () => {
    const baseline = new MemberCatalogService(mediaDependencies().deps);
    const baselineCatalog = await baseline.list({ member: MEMBER });
    const baselineDetail = await baseline.detail({ member: MEMBER, slug: "product-a" });
    expect(baselineCatalog.items).toHaveLength(1);
    expect(baselineDetail?.media).not.toBeNull();
    const signers: MediaSigner[] = [
      () => { throw new Error("storage unavailable"); },
      async () => { throw new Error("storage unavailable"); },
      async () => ({ data: null, error: { message: "storage unavailable" } }),
      async () => undefined,
      async () => null,
      async () => ({ data: {}, error: null }),
      async () => ({ data: { signedUrl: "" }, error: null }),
      async () => ({ data: { signedUrl: 42 }, error: null }),
      async () => ({ data: { signedUrl: "https://untrusted.example/image" }, error: null }),
    ];
    for (const signer of signers) {
      const service = new MemberCatalogService(mediaDependencies(signer).deps);
      const catalog = await service.list({ member: MEMBER });
      const detail = await service.detail({ member: MEMBER, slug: "product-a" });
      expect(catalog).toEqual({
        ...baselineCatalog,
        items: baselineCatalog.items.map((item) => ({ ...item, media: null })),
      });
      expect(detail?.media).toBeNull();
      expect(commerceFacts(detail)).toEqual(commerceFacts(baselineDetail));
    }
  });

  it("isolates a synchronous storage-client failure without hiding the product", async () => {
    const setup = mediaDependencies();
    setup.storageFrom.mockImplementation(() => { throw new Error("storage client unavailable"); });
    const service = new MemberCatalogService(setup.deps);
    const product = await service.detail({ member: MEMBER, slug: "product-a" });
    expect(product).toMatchObject({
      id: "product-a", media: null, price: { amountCents: 14900 },
      variants: [{ availability: "available", selectionFailure: "activation_authority_missing" }],
    });
    expect(setup.inventoryRead).toHaveBeenCalledTimes(1);
  });

  it("does not sign ambiguous media while another product keeps its valid presentation", async () => {
    const first = catalogProduct();
    first.media.push({
      ...first.media[0],
      id: "product-a-second-media",
      storageKey: "product-a/product-a-second-media/product-a.webp",
    });
    const products = [first, catalogProduct("product-b")];
    const signer = vi.fn(async (path: string) => {
      if (path === first.media[0].storageKey) throw new Error("one object unavailable");
      return signedMedia(path);
    });
    const service = new MemberCatalogService(mediaDependencies(signer, products).deps);
    const catalog = await service.list({ member: MEMBER });
    expect(signer).toHaveBeenCalledTimes(1);
    expect(signer).toHaveBeenCalledWith(products[1].media[0].storageKey, 300);
    expect(catalog.items).toHaveLength(2);
    // Two approved primary records remain ambiguous, regardless of signing success.
    expect(catalog.items.find((item) => item.id === "product-a")).toMatchObject({
      media: null, price: { amountCents: 14900 }, displayState: "unavailable", selection: null,
    });
    expect(catalog.items.find((item) => item.id === "product-b")).toMatchObject({
      media: { mediaId: "product-b-media" }, price: { amountCents: 14900 },
      displayState: "unavailable", selection: null,
    });
  });

  it("treats malformed media containers and rows as absent presentation", async () => {
    const good = catalogProduct();
    const baseline = await new MemberCatalogService(mediaDependencies().deps)
      .detail({ member: MEMBER, slug: "product-a" });
    const malformedMedia: unknown[] = [
      undefined, null, {}, "invalid", [], [null], [{}], ["invalid"],
      [{ ...good.media[0], approvedBy: 42 }],
      [{ ...good.media[0], id: null }],
      [{ ...good.media[0], altText: null }],
      [{ ...good.media[0], filename: "../private.webp" }],
      [{ ...good.media[0], updatedAt: 42 }],
      [{ ...good.media[0], storageKey: "other-product/media/image.webp" }],
      [{ ...good.media[0], state: "rejected" }],
    ];
    for (const media of malformedMedia) {
      const signer = vi.fn(async (path: string) => signedMedia(path));
      const product = { ...good, media } as AdminProductDetail;
      const service = new MemberCatalogService(mediaDependencies(signer, [product]).deps);
      const detail = await service.detail({ member: MEMBER, slug: "product-a" });
      expect(detail?.media).toBeNull();
      expect(commerceFacts(detail)).toEqual(commerceFacts(baseline));
      expect(signer).not.toHaveBeenCalled();
    }
    const signer = vi.fn(async (path: string) => signedMedia(path));
    const mixed = { ...good, media: [null, {}, good.media[0]] } as AdminProductDetail;
    const result = await new MemberCatalogService(mediaDependencies(signer, [mixed]).deps)
      .detail({ member: MEMBER, slug: "product-a" });
    expect(result?.media).toMatchObject({ mediaId: "product-a-media" });
    expect(commerceFacts(result)).toEqual(commerceFacts(baseline));
    expect(signer).toHaveBeenCalledTimes(1);
  });

  it("does not suppress required-input, readiness, or inventory read failures", async () => {
    const signingFailure: MediaSigner = async () => { throw new Error("storage unavailable"); };
    for (const key of ["list", "readinessAll"] as const) {
      const setup = mediaDependencies(signingFailure);
      setup.deps.requiredInputs[key].mockRejectedValue(new Error(`${key}_unavailable`));
      await expect(new MemberCatalogService(setup.deps).list({ member: MEMBER }))
        .rejects.toThrow(`${key}_unavailable`);
    }
    const failedInventory = mediaDependencies(signingFailure);
    failedInventory.inventoryRead.mockResolvedValue({ data: [], error: { message: "inventory read failed" } } as never);
    await expect(new MemberCatalogService(failedInventory.deps).list({ member: MEMBER }))
      .rejects.toThrow("member_catalog_inventory_unavailable");
    const failedAllocatability = mediaDependencies(signingFailure);
    failedAllocatability.allocatable.mockResolvedValue({ data: false, error: { message: "lot decision failed" } } as never);
    await expect(new MemberCatalogService(failedAllocatability.deps).list({ member: MEMBER }))
      .rejects.toThrow("member_catalog_inventory_unavailable");
  });
});
