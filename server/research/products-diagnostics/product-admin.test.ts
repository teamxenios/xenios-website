import { describe, expect, it, vi } from "vitest";
import type {
  AdminProductDetail,
  AdminProductListFilters,
  AdminProductMedia,
  AdminProductSummary,
  AdminProductVariant,
  CreateAdminPriceInput,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  DuplicateAdminProductInput,
  UpdateAdminProductInput,
} from "@shared/research/product-admin";
import {
  ProductAdminService,
  type ProductAdminIdempotency,
  type ProductAdminRepository,
  type ProductReleaseGate,
} from "./product-admin";
import {
  ProductAdminConflictError,
  ProductAdminValidationError,
} from "./product-admin-errors";

function detail(overrides: Partial<AdminProductDetail> = {}): AdminProductDetail {
  return {
    id: "product-1",
    productCode: "P-1",
    slug: "product-1",
    displayName: "Product 1",
    canonicalName: "Product 1",
    aliases: [],
    lane: "research_material",
    category: "research",
    classification: "research_material",
    status: "draft",
    active: true,
    visibility: "hidden",
    availability: "documentation_review",
    commerceApproval: "blocked_pending_written_approval",
    qualityDocumentState: "missing",
    variantCount: 0,
    approvedVariantCount: 0,
    missingInputCount: 1,
    updatedAt: "2026-07-26T12:00:00Z",
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
    media: [],
    history: [],
    ...overrides,
  };
}

function repository() {
  const record = detail();
  const repo: ProductAdminRepository = {
    list: vi.fn(async (_filters: AdminProductListFilters) => [record]),
    get: vi.fn(async () => record),
    create: vi.fn(async (input: CreateAdminProductInput) =>
      detail({
        productCode: input.productCode,
        slug: input.slug,
        displayName: input.displayName,
        canonicalName: input.canonicalName,
        aliases: input.aliases ?? [],
        lane: input.lane,
        category: input.category,
        classification: input.classification,
      }),
    ),
    duplicate: vi.fn(async (_id, input: DuplicateAdminProductInput) =>
      detail({
        id: "product-2",
        productCode: input.productCode,
        slug: input.slug,
        displayName: input.displayName,
      }),
    ),
    update: vi.fn(async (_id, input: UpdateAdminProductInput) =>
      detail(input as Partial<AdminProductDetail>),
    ),
    setLifecycle: vi.fn(async (_id, input) => detail(input)),
    createVariant: vi.fn(
      async (_id, input: CreateAdminVariantInput) =>
        detail({
          variants: [
            {
              id: "variant-1",
              productId: "product-1",
              sku: input.sku,
              catalogNumber: input.catalogNumber ?? null,
              label: input.label,
              strength: input.strength ?? null,
              size: input.size ?? null,
              format: input.format ?? null,
              presentation: input.presentation ?? null,
              shippingClass: input.shippingClass ?? null,
              memberEligible: input.memberEligible ?? false,
              status: "draft",
              active: false,
              sortOrder: input.sortOrder ?? 0,
              createdAt: "2026-07-26T12:00:00Z",
              updatedAt: "2026-07-26T12:00:00Z",
            },
          ],
        }),
    ),
    updateVariant: vi.fn(async () => record),
    createPrice: vi.fn(async () => record),
    approvePrice: vi.fn(async () => record),
    createMediaUpload: vi.fn(
      async (
        _id,
        input: {
          kind: AdminProductMedia["kind"];
          filename: string;
          contentType: string;
          sizeBytes: number;
          altText: string;
          sortOrder: number;
        },
      ) => ({
        media: {
          id: "media-1",
          productId: "product-1",
          kind: input.kind,
          state: "pending_upload",
          storageKey: "private/media-1",
          filename: input.filename,
          contentType: input.contentType,
          sizeBytes: input.sizeBytes,
          altText: input.altText,
          sortOrder: input.sortOrder,
          approvedBy: null,
          createdAt: "2026-07-26T12:00:00Z",
          updatedAt: "2026-07-26T12:00:00Z",
        },
        uploadUrl: "https://storage.invalid/upload",
        expiresAt: "2026-07-26T12:02:00Z",
      }),
    ),
    confirmMediaUpload: vi.fn(async () => record),
    updateMedia: vi.fn(async () => record),
  };
  return repo;
}

function idempotency(): ProductAdminIdempotency {
  const settled = new Map<string, unknown>();
  return {
    async run<T>(scope: string, key: string, action: () => Promise<T>) {
      const id = `${scope}:${key}`;
      if (settled.has(id)) return settled.get(id) as T;
      const value = await action();
      settled.set(id, value);
      return value;
    },
  };
}

function service(
  gate: ProductReleaseGate = {
    evaluate: async () => ({
      displayReady: true,
      commerceReady: false,
      blockingKeys: [],
    }),
  },
) {
  const repo = repository();
  return {
    repo,
    service: new ProductAdminService(
      repo,
      gate,
      idempotency(),
      () => "2026-07-26T12:00:00Z",
    ),
  };
}

describe("ProductAdminService", () => {
  it("normalizes product identity and replays a repeated idempotency key", async () => {
    const { service: subject, repo } = service();
    const input: CreateAdminProductInput = {
      productCode: " p-100 ",
      slug: "product-100",
      displayName: " Product 100 ",
      canonicalName: "Product 100",
      aliases: ["Alias", "Alias"],
      lane: "research_material",
      category: "Research",
      classification: "research_material",
    };
    const first = await subject.create(input, "admin@example.invalid", "same-key");
    const replay = await subject.create(input, "admin@example.invalid", "same-key");
    expect(first).toEqual(replay);
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        productCode: "P-100",
        displayName: "Product 100",
        aliases: ["Alias"],
      }),
      "admin@example.invalid",
      "2026-07-26T12:00:00Z",
    );
  });

  it("keeps publish fail-closed when canonical inputs block display", async () => {
    const { service: subject, repo } = service({
      evaluate: async () => ({
        displayReady: false,
        commerceReady: false,
        blockingKeys: ["products.image.approval"],
      }),
    });
    await expect(
      subject.publish("product-1", "admin@example.invalid", "publish-1"),
    ).rejects.toEqual(
      expect.objectContaining<ProductAdminConflictError>({
        code: "product_release_blocked",
        blockingKeys: ["products.image.approval"],
      }),
    );
    expect(repo.setLifecycle).not.toHaveBeenCalled();
  });

  it("publishes visibility only after the canonical display gate passes", async () => {
    const { service: subject, repo } = service();
    await subject.publish("product-1", "admin@example.invalid", "publish-1");
    expect(repo.setLifecycle).toHaveBeenCalledWith(
      "product-1",
      { status: "published", active: true, visibility: "public" },
      "admin@example.invalid",
      "2026-07-26T12:00:00Z",
      expect.stringContaining("canonical display-readiness"),
    );
  });

  it("creates a normalized SKU without modeling inventory truth", async () => {
    const { service: subject, repo } = service();
    await subject.createVariant(
      "product-1",
      {
        sku: " sku-1 ",
        label: "Primary",
        shippingClass: "ambient",
      },
      "admin@example.invalid",
      "variant-1",
    );
    expect(repo.createVariant).toHaveBeenCalledWith(
      "product-1",
      expect.objectContaining({
        sku: "SKU-1",
        shippingClass: "ambient",
      }),
      "admin@example.invalid",
      "2026-07-26T12:00:00Z",
    );
  });

  it("rejects active or archived variant states without explicit safe lifecycle fields", async () => {
    const { service: subject, repo } = service();

    expect(() =>
      subject.updateVariant(
        "product-1",
        "variant-1",
        { active: true },
        "admin@example.invalid",
        "variant-active-1",
      ),
    ).toThrow(ProductAdminValidationError);
    expect(() =>
      subject.updateVariant(
        "product-1",
        "variant-1",
        { status: "archived" },
        "admin@example.invalid",
        "variant-archive-1",
      ),
    ).toThrow(ProductAdminValidationError);
    await expect(
      subject.updateVariant(
        "product-1",
        "variant-1",
        { status: "approved", active: true },
        "admin@example.invalid",
        "variant-review-1",
      ),
    ).resolves.toBeDefined();
    expect(repo.updateVariant).toHaveBeenCalledTimes(1);
  });

  it("rejects negative prices and invalid effective windows", async () => {
    const { service: subject } = service();
    const base: CreateAdminPriceInput = {
      variantId: "variant-1",
      audience: "retail",
      amountCents: -1,
      currency: "USD",
      effectiveAt: "2026-07-26T12:00:00Z",
    };
    await expect(
      subject.createPrice(
        "product-1",
        base,
        "admin@example.invalid",
        "price-1",
      ),
    ).rejects.toBeInstanceOf(ProductAdminValidationError);
    await expect(
      subject.createPrice(
        "product-1",
        {
          ...base,
          amountCents: 1000,
          expiresAt: "2026-07-25T12:00:00Z",
        },
        "admin@example.invalid",
        "price-2",
      ),
    ).rejects.toBeInstanceOf(ProductAdminValidationError);
  });

  it("requires verified image metadata before a private upload is prepared", async () => {
    const { service: subject, repo } = service();
    await expect(
      subject.createMediaUpload(
        "product-1",
        {
          kind: "primary_image",
          filename: "front.png",
          contentType: "image/png",
          sizeBytes: 100,
          altText: "",
        },
        "admin@example.invalid",
        "media-1",
      ),
    ).rejects.toBeInstanceOf(ProductAdminValidationError);
    expect(repo.createMediaUpload).not.toHaveBeenCalled();
  });

  it("does not copy variants, prices, or media through the duplicate contract", async () => {
    const { service: subject, repo } = service();
    await subject.duplicate(
      "product-1",
      { productCode: "P-2", slug: "product-2", displayName: "Product 2" },
      "admin@example.invalid",
      "duplicate-1",
    );
    expect(repo.duplicate).toHaveBeenCalledWith(
      "product-1",
      {
        productCode: "P-2",
        slug: "product-2",
        displayName: "Product 2",
      },
      "admin@example.invalid",
      "2026-07-26T12:00:00Z",
    );
  });

  it("filters active blocking inputs through the canonical required-input state", () => {
    expect(
      ProductAdminService.activeBlockingInputs("product-1", [
        {
          id: "a",
          key: "products.price",
          domain: "products",
          label: "RETAIL PRICE REQUIRED",
          description: "Enter price",
          whyRequired: "Required for commerce",
          recordType: "product",
          recordId: "product-1",
          fieldPath: "price",
          currentState: "missing",
          blockingLevel: "blocks_transaction",
          responsibleRole: "product_admin",
          verificationMethod: "Review",
          evidenceRequired: [],
          entryMode: "direct",
          valueSensitivity: "ordinary",
          enteredValue: null,
          externalReferenceName: null,
          enteredBy: null,
          enteredAt: null,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          publicLaunchImpact: "Blocks sale",
          nextAction: "Enter price",
          adminEntryHref: "/admin/research/products/product-1",
          version: 1,
          auditHistory: [],
        },
        {
          id: "b",
          key: "products.price.other",
          domain: "products",
          label: "OTHER PRICE REQUIRED",
          description: "Other",
          whyRequired: "Other product",
          recordType: "product",
          recordId: "product-2",
          fieldPath: "price",
          currentState: "missing",
          blockingLevel: "blocks_transaction",
          responsibleRole: "product_admin",
          verificationMethod: "Review",
          evidenceRequired: [],
          entryMode: "direct",
          valueSensitivity: "ordinary",
          enteredValue: null,
          externalReferenceName: null,
          enteredBy: null,
          enteredAt: null,
          verifiedBy: null,
          verifiedAt: null,
          rejectionReason: null,
          publicLaunchImpact: "Blocks sale",
          nextAction: "Enter price",
          adminEntryHref: "/admin/research/products/product-2",
          version: 1,
          auditHistory: [],
        },
      ]),
    ).toHaveLength(1);
  });
});
