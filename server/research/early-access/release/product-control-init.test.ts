import { describe, expect, it } from "vitest";

import type {
  AdminProductDetail,
  AdminProductVariant,
  CreateAdminProductInput,
  CreateAdminVariantInput,
  UpdateAdminProductInput,
} from "@shared/research/product-admin";
import {
  DISPUTED_BUT_RELEASED,
  EXPECTED_HELD_COUNT,
  EXPECTED_PRODUCT_COUNT,
  EXPECTED_PURCHASABLE_COUNT,
  EXPECTED_RELEASE_COUNT,
  EXPECTED_CONFIRMATION_COUNT,
  EXPECTED_VARIANT_COUNT,
  INITIALIZER_ACTOR,
  NAD_1000_PRICE_CENTS,
  NAD_1000_SKU,
  NEVER_RELEASED_PRODUCT_CODE,
  PRODUCT_CONTROL_CONFIRMATION_ID_PREFIX,
  PRODUCT_CONTROL_RELEASE_ID_PREFIX,
  assertApprovedSet,
  assertNoPriceRowIsSellable,
  classify,
  createOneProduct,
  deriveApprovedUnits,
  planProducts,
  proveJoins,
  refuseWhenStorefrontOpen,
  rekeyToProductionIds,
  run,
  verifyProduct,
  type PlannedProduct,
  type ProductControlWriter,
} from "../../../../scripts/initialize-product-control";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { InMemorySupplierConfirmationStore } from "../ops/supplier-confirmation";
import { NO_RECORDED_LOTS_INVENTORY } from "./first-release-canonical-source";
import { InMemoryEarlyAccessReleaseLedger } from "./founder-release";

/**
 * The Product Control initializer, exercised against a fake that enforces the
 * SAME schema rules production does.
 *
 * The fake is deliberately strict rather than permissive: it issues UUID primary
 * keys, defaults a product to draft and hidden, defaults a variant to an
 * inactive draft, refuses `active` on anything but an approved variant, and
 * refuses a draft-to-approved jump. Those are the four rules that decide whether
 * this command can work at all, and a lenient fake would prove nothing about
 * production while looking green.
 *
 * The final proof is end to end: the created catalogue is read back through the
 * REAL `ProductControlCatalogSource`, the REAL declared-facts reader and the
 * REAL eligibility gate, so "22 visible, 18 purchasable, 4 held" is measured
 * from the same code the storefront runs, not asserted from a fixture.
 */

// ---------------------------------------------------------------------------
// A Product Control that behaves like the schema
// ---------------------------------------------------------------------------

class FakeProductControl implements ProductControlWriter {
  readonly products = new Map<string, AdminProductDetail>();
  private sequence = 0;

  /** Shaped like a real UUID, because the whole defect was assuming otherwise. */
  private nextId(): string {
    this.sequence += 1;
    return `00000000-0000-4000-8000-${String(this.sequence).padStart(12, "0")}`;
  }

  async list(): Promise<readonly { productCode: string }[]> {
    return [...this.products.values()].map((product) => ({
      productCode: product.productCode,
    }));
  }

  async get(productId: string): Promise<AdminProductDetail | null> {
    return this.products.get(productId) ?? null;
  }

  async create(input: CreateAdminProductInput): Promise<AdminProductDetail> {
    if ([...this.products.values()].some((p) => p.productCode === input.productCode)) {
      throw new Error(`duplicate product code ${input.productCode}`);
    }
    const product: AdminProductDetail = {
      id: this.nextId(),
      productCode: input.productCode.toUpperCase(),
      slug: input.slug.toLowerCase(),
      displayName: input.displayName,
      canonicalName: input.canonicalName,
      aliases: [...(input.aliases ?? [])],
      lane: input.lane,
      category: input.category,
      classification: input.classification,
      // The create RPC's own hardcoded values, and the table defaults.
      status: "draft",
      active: true,
      visibility: "hidden",
      availability: "documentation_review",
      commerceApproval: "blocked_pending_written_approval",
      qualityDocumentState: "missing",
      variantCount: 0,
      approvedVariantCount: 0,
      missingInputCount: 0,
      updatedAt: "2026-08-05T00:00:00.000Z",
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
    };
    this.products.set(product.id, product);
    return product;
  }

  async update(
    productId: string,
    input: UpdateAdminProductInput,
  ): Promise<AdminProductDetail> {
    const product = this.require(productId);
    const next: AdminProductDetail = {
      ...product,
      availability: input.availability ?? product.availability,
      commerceApproval: input.commerceApproval ?? product.commerceApproval,
      qualityDocumentState:
        input.qualityDocumentState ?? product.qualityDocumentState,
    };
    this.products.set(productId, next);
    return next;
  }

  async setLifecycle(
    productId: string,
    input: { status: "published"; active: boolean; visibility: "public" },
    actor: string,
    at: string,
  ): Promise<AdminProductDetail> {
    const product = this.require(productId);
    // research_products_public_requires_published.
    if (input.visibility === "public" && !(input.status === "published" && input.active)) {
      throw new Error("public visibility requires a published, active product");
    }
    const next: AdminProductDetail = {
      ...product,
      status: input.status,
      active: input.active,
      visibility: input.visibility,
      publishedAt: input.status === "published" ? at : product.publishedAt,
    };
    this.products.set(productId, next);
    return next;
  }

  async createVariant(
    productId: string,
    input: CreateAdminVariantInput,
  ): Promise<AdminProductDetail> {
    const product = this.require(productId);
    const variant: AdminProductVariant = {
      id: this.nextId(),
      productId,
      sku: input.sku,
      catalogNumber: input.catalogNumber ?? null,
      label: input.label,
      strength: input.strength ?? null,
      size: input.size ?? null,
      format: input.format ?? null,
      presentation: input.presentation ?? null,
      shippingClass: input.shippingClass ?? null,
      memberEligible: input.memberEligible ?? false,
      // research_product_variant_lifecycle_guard: new variants must be
      // inactive drafts, whatever the caller asked for.
      status: "draft",
      active: false,
      sortOrder: input.sortOrder ?? 0,
      createdAt: "2026-08-05T00:00:00.000Z",
      updatedAt: "2026-08-05T00:00:00.000Z",
    };
    const next = { ...product, variants: [...product.variants, variant] };
    this.products.set(productId, next);
    return next;
  }

  async updateVariant(
    productId: string,
    variantId: string,
    input: { status?: "in_review" | "approved"; active?: boolean },
  ): Promise<AdminProductDetail> {
    const product = this.require(productId);
    const variant = product.variants.find((item) => item.id === variantId);
    if (variant === undefined) throw new Error("variant not found");
    const status = input.status ?? variant.status;
    const active = input.active ?? variant.active;
    if (active && status !== "approved") {
      throw new Error("only approved variants may be active");
    }
    const legal =
      status === variant.status ||
      (variant.status === "draft" && ["in_review", "archived"].includes(status)) ||
      (variant.status === "in_review" && ["draft", "approved", "archived"].includes(status));
    if (!legal) {
      throw new Error(`invalid variant state transition: ${variant.status} -> ${status}`);
    }
    const next = {
      ...product,
      variants: product.variants.map((item) =>
        item.id === variantId ? { ...item, status, active } : item,
      ),
    };
    this.products.set(productId, next as AdminProductDetail);
    return next as AdminProductDetail;
  }

  private require(productId: string): AdminProductDetail {
    const product = this.products.get(productId);
    if (product === undefined) throw new Error("product not found");
    return product;
  }

  /** Exactly the filter `LiveProductControlReader` applies. */
  async readCatalog(): Promise<AdminProductDetail[]> {
    return [...this.products.values()].filter(
      (product) =>
        product.status === "published" &&
        product.visibility === "public" &&
        product.active,
    );
  }
}

// ---------------------------------------------------------------------------
// A whole initialization, run offline
// ---------------------------------------------------------------------------

type Harness = Readonly<{
  writer: FakeProductControl;
  confirmations: InMemorySupplierConfirmationStore;
  ledger: InMemoryEarlyAccessReleaseLedger;
  confirmed: () => readonly { productId: string; variantId: string; confirmationId: string }[];
  releases: () => Promise<readonly Record<string, unknown>[]>;
  rekey: () => ReturnType<typeof rekeyToProductionIds>;
}>;

function harness(): Harness {
  const writer = new FakeProductControl();
  const store = new InMemorySupplierConfirmationStore();
  const inserted: { productId: string; variantId: string; confirmationId: string }[] = [];
  // Delegating rather than subclassing, so the store's real behaviour decides
  // every answer and this wrapper only records what went in.
  const confirmations = new Proxy(store, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        if (prop === "insert") {
          inserted.push(args[0] as { productId: string; variantId: string; confirmationId: string });
        }
        return (value as (...a: unknown[]) => unknown).apply(target, args);
      };
    },
  });
  // The REAL in-memory ledger, not a recording stub. It validates every draft
  // and refuses a duplicate release id, which is the behaviour the production
  // ledger has and the behaviour a stub would quietly not have.
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: () => writer.readCatalog() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
    }),
  } as never);
  return {
    writer,
    confirmations,
    ledger,
    confirmed: () => inserted,
    releases: async () =>
      (await ledger.all()) as unknown as readonly Record<string, unknown>[],
    rekey: () =>
      rekeyToProductionIds({
        source: source as never,
        confirmations: confirmations as never,
        ledger: ledger as never,
      }),
  };
}

const CLOSED = { RESEARCH_EARLY_ACCESS_ENABLED: "false" } as NodeJS.ProcessEnv;

async function initialized(): Promise<Harness> {
  const h = harness();
  await run({ writer: h.writer, execute: true, log: () => {}, env: CLOSED, rekey: h.rekey });
  return h;
}

// ---------------------------------------------------------------------------
// 1-5: the approved set
// ---------------------------------------------------------------------------

describe("the approved set", () => {
  it("derives exactly 19 products", async () => {
    const plans = planProducts(await deriveApprovedUnits());
    expect(plans).toHaveLength(EXPECTED_PRODUCT_COUNT);
    expect(EXPECTED_PRODUCT_COUNT).toBe(19);
  });

  it("derives exactly 22 variants", async () => {
    const units = await deriveApprovedUnits();
    expect(units).toHaveLength(EXPECTED_VARIANT_COUNT);
    expect(EXPECTED_VARIANT_COUNT).toBe(22);
  });

  it("carries the exact product identities, including the never-released one", async () => {
    const plans = planProducts(await deriveApprovedUnits());
    const codes = plans.map((plan) => plan.productCode);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain(NEVER_RELEASED_PRODUCT_CODE);
    for (const plan of plans) {
      expect(plan.create.productCode).toBe(plan.productCode);
      expect(plan.create.slug.trim()).not.toBe("");
      expect(plan.create.canonicalName.trim()).not.toBe("");
      // SUPPLIER_NOT_ASSIGNED is non-waivable and resolves from the lane.
      expect(plan.create.lane).toBe("research_material");
    }
  });

  it("carries the exact variant identities", async () => {
    const units = await deriveApprovedUnits();
    const skus = units.map((unit) => unit.sku);
    expect(new Set(skus).size).toBe(skus.length);
    for (const sku of DISPUTED_BUT_RELEASED) expect(skus).toContain(sku);
    expect(skus).toContain(NAD_1000_SKU);
    for (const unit of units) {
      expect(unit.variant.sku).toBe(unit.sku);
      expect(unit.variant.strength ?? "").not.toBe("");
      expect(unit.variant.presentation ?? "").not.toBe("");
    }
  });

  it("requires zero price rows, and proves no price row could be sellable", async () => {
    // Product Control prices carry a PriceAudience; Early Access authorizes only
    // `private_early_access`, which that vocabulary cannot express. So the
    // customer price is the founder release's, and writing catalogue prices
    // would be writing money nothing reads.
    expect(() => assertNoPriceRowIsSellable()).not.toThrow();
    const outcome = await run({
      writer: new FakeProductControl(),
      execute: false,
      log: () => {},
      env: CLOSED,
    });
    expect(outcome.prices).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 6-8: the states written
// ---------------------------------------------------------------------------

describe("the states written", () => {
  it("publishes every product public and active with a published_at", async () => {
    const h = await initialized();
    const products = [...h.writer.products.values()];
    expect(products).toHaveLength(EXPECTED_PRODUCT_COUNT);
    for (const product of products) {
      expect(product.status).toBe("published");
      expect(product.visibility).toBe("public");
      expect(product.active).toBe(true);
      expect(product.publishedAt).not.toBeNull();
    }
  });

  it("brings every variant to the approved, active live state", async () => {
    const h = await initialized();
    const variants = [...h.writer.products.values()].flatMap((p) => p.variants);
    expect(variants).toHaveLength(EXPECTED_VARIANT_COUNT);
    for (const variant of variants) {
      expect(variant.status).toBe("approved");
      expect(variant.active).toBe(true);
    }
  });

  it("approves commerce only for the released products", async () => {
    const h = await initialized();
    for (const product of h.writer.products.values()) {
      if (product.productCode === NEVER_RELEASED_PRODUCT_CODE) {
        expect(product.commerceApproval).toBe("blocked_pending_written_approval");
        expect(product.availability).toBe("documentation_review");
      } else {
        expect(product.commerceApproval).toBe("approved");
        expect(product.availability).toBe("in_stock");
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 9-13: the re-key, the joins, and the old rows
// ---------------------------------------------------------------------------

describe("the re-key onto production ids", () => {
  it("keys every release to a live Product Control unit", async () => {
    const h = await initialized();
    const live = new Set(
      (await h.writer.readCatalog()).flatMap((product) =>
        product.variants.map((variant) => `${product.id}::${variant.id}`),
      ),
    );
    expect(await h.releases()).toHaveLength(EXPECTED_RELEASE_COUNT);
    for (const release of await h.releases()) {
      expect(live.has(`${String(release.productId)}::${String(release.variantId)}`)).toBe(true);
      expect(String(release.releaseId).startsWith(PRODUCT_CONTROL_RELEASE_ID_PREFIX)).toBe(true);
    }
  });

  it("keys every confirmation to a live Product Control unit", async () => {
    const h = await initialized();
    const live = new Set(
      (await h.writer.readCatalog()).flatMap((product) =>
        product.variants.map((variant) => `${product.id}::${variant.id}`),
      ),
    );
    const stored = h.confirmed();
    expect(stored).toHaveLength(EXPECTED_CONFIRMATION_COUNT);
    for (const confirmation of stored) {
      expect(live.has(`${confirmation.productId}::${confirmation.variantId}`)).toBe(true);
      expect(
        confirmation.confirmationId.startsWith(PRODUCT_CONTROL_CONFIRMATION_ID_PREFIX),
      ).toBe(true);
    }
  });

  it("leaves the canonical-keyed rows inert, and says so if they ever join", async () => {
    const h = await initialized();
    const live = (await h.writer.readCatalog()).flatMap((product) =>
      product.variants.map((variant) => `${product.id}::${variant.id}`),
    );
    // The 43 historical rows name PEX codes and R360 SKUs. None can name a UUID.
    const oldKeys = ["PEX-012::R360-AOD9604-5MG-VIAL", "PEX-028::R360-CAGRILINTIDE-10MG-VIAL"];
    const newKeys = (await h.releases()).map(
      (r) => `${String(r.productId)}::${String(r.variantId)}`,
    );
    expect(() =>
      proveJoins({ liveKeys: live, newKeys, oldKeys, what: "release" }),
    ).not.toThrow();
    // And the proof is real: a canonical key that DID join would be refused.
    expect(() =>
      proveJoins({ liveKeys: live, newKeys: [], oldKeys: [live[0]], what: "release" }),
    ).toThrow(/not inert/);
  });

  it("refuses a duplicate active release identity", () => {
    expect(() =>
      proveJoins({
        liveKeys: ["a::b"],
        newKeys: ["a::b", "a::b"],
        oldKeys: [],
        what: "release",
      }),
    ).toThrow(/duplicate active release identity/);
  });

  it("refuses a duplicate active confirmation identity", () => {
    expect(() =>
      proveJoins({
        liveKeys: ["a::b"],
        newKeys: ["a::b", "a::b"],
        oldKeys: [],
        what: "confirmation",
      }),
    ).toThrow(/duplicate active confirmation identity/);
  });
});

// ---------------------------------------------------------------------------
// 14-20: Cagrilintide, the disputes, and the one named price
// ---------------------------------------------------------------------------

describe("Cagrilintide", () => {
  it("exists, is published and public, and is therefore visible", async () => {
    const h = await initialized();
    const product = [...h.writer.products.values()].find(
      (item) => item.productCode === NEVER_RELEASED_PRODUCT_CODE,
    );
    expect(product).toBeDefined();
    expect(product?.status).toBe("published");
    expect(product?.visibility).toBe("public");
  });

  it("receives no founder release", async () => {
    const h = await initialized();
    const product = [...h.writer.products.values()].find(
      (item) => item.productCode === NEVER_RELEASED_PRODUCT_CODE,
    );
    const ids = new Set(product?.variants.map((variant) => variant.id) ?? []);
    expect((await h.releases()).some((release) => ids.has(String(release.variantId)))).toBe(false);
    expect(await h.releases()).toHaveLength(EXPECTED_RELEASE_COUNT);
  });

  it("does receive a supplier confirmation", async () => {
    const h = await initialized();
    const product = [...h.writer.products.values()].find(
      (item) => item.productCode === NEVER_RELEASED_PRODUCT_CODE,
    );
    const ids = new Set(product?.variants.map((variant) => variant.id) ?? []);
    const stored = h.confirmed();
    expect(stored.some((confirmation) => ids.has(confirmation.variantId))).toBe(true);
  });

  it("carries no customer price and no purchase path", async () => {
    const h = await initialized();
    const product = [...h.writer.products.values()].find(
      (item) => item.productCode === NEVER_RELEASED_PRODUCT_CODE,
    );
    expect(product?.prices).toEqual([]);
    // Commerce approval is what `offerStatePermitsPurchase` requires, and it is
    // the one thing this product deliberately never gets.
    expect(product?.commerceApproval).toBe("blocked_pending_written_approval");
  });
});

describe("the disputed units and the named price", () => {
  it("creates the three disputed units so they stay visible", async () => {
    const h = await initialized();
    const skus = [...h.writer.products.values()]
      .flatMap((product) => product.variants)
      .map((variant) => variant.sku);
    for (const sku of DISPUTED_BUT_RELEASED) expect(skus).toContain(sku);
  });

  it("waives nothing non-waivable, so the disputes still hold them", async () => {
    const h = await initialized();
    for (const release of await h.releases()) {
      const waived = (release.waivedBlockers as string[] | undefined) ?? [];
      expect(waived).not.toContain("STRENGTH_DISPUTE_UNRESOLVED");
      expect(waived).not.toContain("IDENTITY_DISPUTE_UNRESOLVED");
      expect(waived).not.toContain("SUPPLIER_NOT_ASSIGNED");
      expect(waived).not.toContain("FULFILLMENT_UNAVAILABLE");
    }
  });

  it("keeps NAD+ 1000 mg at $100.75", async () => {
    const units = await deriveApprovedUnits();
    const nad = units.find((unit) => unit.sku === NAD_1000_SKU);
    expect(nad?.unitPriceCents).toBe(NAD_1000_PRICE_CENTS);
    expect(NAD_1000_PRICE_CENTS / 100).toBe(100.75);

    const h = await initialized();
    const product = [...h.writer.products.values()].find((item) =>
      item.variants.some((variant) => variant.sku === NAD_1000_SKU),
    );
    const variant = product?.variants.find((item) => item.sku === NAD_1000_SKU);
    const release = (await h.releases()).find((item) => String(item.variantId) === variant?.id);
    expect(release?.approvedPriceCents).toBe(NAD_1000_PRICE_CENTS);
    expect(release?.currency).toBe("USD");
  });
});

// ---------------------------------------------------------------------------
// 21-30: the safety behaviour
// ---------------------------------------------------------------------------

describe("safety", () => {
  it("writes nothing on a dry run", async () => {
    const h = harness();
    const outcome = await run({
      writer: h.writer,
      execute: false,
      log: () => {},
      env: CLOSED,
    });
    expect(outcome.mode).toBe("dry_run");
    expect(outcome.result).toBe("would_create");
    expect(outcome.products).toBe(EXPECTED_PRODUCT_COUNT);
    expect(outcome.variants).toBe(EXPECTED_VARIANT_COUNT);
    // The only claims that matter: nothing exists afterwards.
    expect(h.writer.products.size).toBe(0);
    expect(h.confirmed()).toHaveLength(0);
    expect(await h.releases()).toHaveLength(0);
  });

  it("creates every expected row on execute", async () => {
    const h = harness();
    const outcome = await run({
      writer: h.writer,
      execute: true,
      log: () => {},
      env: CLOSED,
      rekey: h.rekey,
    });
    expect(outcome.result).toBe("created");
    expect(outcome.products).toBe(EXPECTED_PRODUCT_COUNT);
    expect(outcome.variants).toBe(EXPECTED_VARIANT_COUNT);
    expect(outcome.releases).toBe(EXPECTED_RELEASE_COUNT);
    expect(outcome.confirmations).toBe(EXPECTED_CONFIRMATION_COUNT);
  });

  it("verifies every created row field-exact, and refuses a drifted one", async () => {
    const writer = new FakeProductControl();
    const plan = planProducts(await deriveApprovedUnits())[0];
    const created = await createOneProduct(writer, plan);
    expect(() => verifyProduct(plan, created)).not.toThrow();

    const drifted: PlannedProduct = {
      ...plan,
      update: { ...plan.update, commerceApproval: "blocked_by_lane" },
    };
    expect(() => verifyProduct(drifted, created)).toThrow(/commerce approval/);
  });

  it("returns ALREADY_INITIALIZED on a rerun and writes nothing more", async () => {
    const h = await initialized();
    const before = h.writer.products.size;
    const outcome = await run({
      writer: h.writer,
      execute: true,
      log: () => {},
      env: CLOSED,
      rekey: h.rekey,
    });
    expect(outcome.result).toBe("already_initialized");
    expect(outcome.products).toBe(0);
    expect(h.writer.products.size).toBe(before);
    expect(await h.releases()).toHaveLength(EXPECTED_RELEASE_COUNT);
  });

  it("refuses a partially initialized Product Control", async () => {
    const writer = new FakeProductControl();
    const plans = planProducts(await deriveApprovedUnits());
    await createOneProduct(writer, plans[0]);
    await expect(
      run({ writer, execute: true, log: () => {}, env: CLOSED, rekey: async () => ({}) as never }),
    ).rejects.toThrow(/PARTIAL STATE/);
  });

  it("classifies a partial release or confirmation state rather than writing over it", () => {
    expect(classify([], 21, "releases")).toEqual({ kind: "clean" });
    expect(classify(["a"], 1, "releases")).toEqual({ kind: "already_initialized" });
    const partial = classify(["a"], 21, "releases");
    expect(partial.kind).toBe("partial");
    const partialConfirmations = classify(["a", "b"], 22, "confirmations");
    expect(partialConfirmations.kind).toBe("partial");
  });

  it("refuses a conflicting state instead of creating a second identity", async () => {
    const writer = new FakeProductControl();
    const plans = planProducts(await deriveApprovedUnits());
    await createOneProduct(writer, plans[0]);
    // Every duplicate product code is refused at the write surface too, so even
    // a bypassed pre-state check cannot mint a second product for one code.
    await expect(createOneProduct(writer, plans[0])).rejects.toThrow(/duplicate product code/);
  });

  it("refuses to run while the storefront flag is true", async () => {
    const open = { RESEARCH_EARLY_ACCESS_ENABLED: "true" } as NodeJS.ProcessEnv;
    expect(() => refuseWhenStorefrontOpen(open)).toThrow(/refusing to run/);
    await expect(
      run({ writer: new FakeProductControl(), execute: false, log: () => {}, env: open }),
    ).rejects.toThrow(/refusing to run/);
  });

  it("refuses to finish a write with no re-key, rather than leaving a dead catalogue", async () => {
    const h = harness();
    await expect(
      run({ writer: h.writer, execute: true, log: () => {} , env: CLOSED }),
    ).rejects.toThrow(/no re-key was supplied/);
  });

  it("cannot write outside Product Control, releases and confirmations", () => {
    // The command holds exactly three write surfaces, and the writer interface
    // is the whole of what it may call. No order, invoice, settlement, payment,
    // receipt, refund, commission, supplier-order or shipment method exists on
    // it, so an unrelated domain write is not merely unwise, it is unreachable.
    const allowed = [
      "list",
      "get",
      "create",
      "update",
      "setLifecycle",
      "createVariant",
      "updateVariant",
      "readCatalog",
    ];
    const surface = Object.getOwnPropertyNames(FakeProductControl.prototype).filter(
      (name) => name !== "constructor" && !name.startsWith("next") && name !== "require",
    );
    expect(surface.sort()).toEqual(allowed.sort());
  });

  it("refuses a derived set that is not the approved shape", async () => {
    const units = await deriveApprovedUnits();
    expect(() => assertApprovedSet(units)).not.toThrow();
    expect(() => assertApprovedSet(units.slice(1))).toThrow(/derived 21 units/);
    // Same counts, Cagrilintide swapped for a stand-in, so the refusal that
    // fires is the one that names it rather than the arithmetic one.
    const held = units.find((unit) => unit.productCode === NEVER_RELEASED_PRODUCT_CODE);
    const donor = units.find((unit) => unit.productCode !== NEVER_RELEASED_PRODUCT_CODE);
    const swapped = units.map((unit) =>
      unit === held
        ? { ...donor!, productCode: "PEX-999", sku: "R360-STANDIN-1MG-VIAL" }
        : unit,
    );
    expect(() => assertApprovedSet(swapped)).toThrow(/Cagrilintide/);
  });
});

// ---------------------------------------------------------------------------
// 31: the projection, measured through the real gate
// ---------------------------------------------------------------------------

describe("the final projection", () => {
  it("is exactly 19 products, 22 visible, 18 purchasable, 4 held", async () => {
    const h = harness();
    const outcome = await run({
      writer: h.writer,
      execute: true,
      log: () => {},
      env: CLOSED,
      rekey: h.rekey,
    });
    expect(h.writer.products.size).toBe(EXPECTED_PRODUCT_COUNT);
    expect(outcome.projection).toEqual({
      visible: EXPECTED_VARIANT_COUNT,
      purchasable: EXPECTED_PURCHASABLE_COUNT,
      held: EXPECTED_HELD_COUNT,
    });
    expect(EXPECTED_VARIANT_COUNT).toBe(22);
    expect(EXPECTED_PURCHASABLE_COUNT).toBe(18);
    expect(EXPECTED_HELD_COUNT).toBe(4);
  });

  it("records the actor, the instant and the reason on every release", async () => {
    const h = await initialized();
    for (const release of await h.releases()) {
      expect(String(release.actor).trim()).not.toBe("");
      expect(String(release.recordedAt).trim()).not.toBe("");
      expect(String(release.reason).trim()).not.toBe("");
      expect(release.status).toBe("approved");
    }
    expect(INITIALIZER_ACTOR).toContain("Samuel Boadu");
  });
});
