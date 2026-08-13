import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  GeneratedMasterOfferingCatalogReader,
  MASTER_OFFERINGS_DATASET_ENV_VAR,
  describeMasterOfferingDatasetLocation,
  MasterOfferingDatasetUnavailable,
  createMasterOfferingCatalogReaderFromEnv,
  loadMasterOfferingDataset,
  type DatasetFileSystem,
} from "./dataset-reader";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import { noMasterOfferingCommerce } from "./customer-projection";
import { MasterOfferingCatalogService } from "./service";

function generatedOffering(overrides: Record<string, unknown> = {}) {
  return {
    id: "mo_1",
    slug: "research-vials-bpc-157",
    displayName: "BPC-157",
    canonicalName: "BPC-157",
    family: "research_vials",
    category: "Peptides & Research",
    subcategory: "Single peptide",
    brand: null,
    aliases: ["BPC 157"],
    displayState: "available_now",
    stateExplanation: "Available to request now.",
    copyState: "approved",
    variants: [
      { id: "mov_a", label: "5 mg vial", displayState: "available_now" },
      { id: "mov_b", label: "10 mg vial", displayState: "coming_soon" },
    ],
    ...overrides,
  };
}

function dataset(overrides: Record<string, unknown> = {}) {
  const products = (overrides.products as unknown[]) ?? [generatedOffering()];
  return {
    schemaVersion: 1,
    generatedAt: "2026-08-13T00:00:00.000Z",
    sourceWorkbookSha256: "c6937431bcb64f628352016d5af16ea133add9a0a05b5947d5a0ac75d9e2d438",
    sourceRowCount: 1236,
    canonicalProductCount: products.length,
    variantCount: products.reduce(
      (total: number, product) =>
        total + ((product as { variants: unknown[] }).variants?.length ?? 0),
      0,
    ),
    invariants: {
      containsSupplierIdentity: false,
      containsWholesaleCost: false,
      containsPlanningPrice: false,
      containsMargin: false,
      containsInternalNotes: false,
      containsProviderNames: false,
      planningRowCanBecomePurchasable: false,
    },
    ...overrides,
    products,
  };
}

describe("generated dataset loading", () => {
  it("loads member-safe offerings and counts them itself", () => {
    const loaded = loadMasterOfferingDataset(dataset());
    expect(loaded.products).toHaveLength(1);
    expect(loaded.products[0].visibility).toBe("member");
    expect(loaded.products[0].variants.every((v) => v.visibility === "member")).toBe(
      true,
    );
    expect(loaded.summary.offerings).toBe(1);
    expect(loaded.summary.variants).toBe(2);
    expect(loaded.summary.countsAgree).toBe(true);
    expect(loaded.summary.families).toEqual({ research_vials: 1 });
  });

  it("reports a header that disagrees with the real count instead of trusting it", () => {
    const loaded = loadMasterOfferingDataset(
      dataset({ canonicalProductCount: 999 }),
    );
    expect(loaded.summary.offerings).toBe(1);
    expect(loaded.summary.declaredOfferings).toBe(999);
    expect(loaded.summary.countsAgree).toBe(false);
  });

  it("carries no private identity into the loaded catalog", () => {
    const loaded = loadMasterOfferingDataset(dataset());
    expect(loaded.products[0].canonicalKey).toBe("");
    expect(loaded.products[0].sourceReferences).toEqual([]);
    expect(loaded.products[0].variants[0].sourceReferences).toEqual([]);
  });

  it("refuses a dataset that carries a private key anywhere inside it", () => {
    for (const poisoned of [
      { supplierOrOwner: "Private supplier" },
      { products: [generatedOffering({ sourceSku: "PLAN-0001" })] },
      {
        products: [
          generatedOffering({
            variants: [
              {
                id: "mov_a",
                label: "5 mg",
                displayState: "available_now",
                updatedWholesaleCost: 12,
              },
            ],
          }),
        ],
      },
    ]) {
      expect(() => loadMasterOfferingDataset(dataset(poisoned))).toThrow(
        /private key/,
      );
    }
  });

  it("refuses when any privacy invariant is not exactly false", () => {
    expect(() =>
      loadMasterOfferingDataset(
        dataset({
          invariants: {
            containsSupplierIdentity: false,
            containsWholesaleCost: true,
            containsPlanningPrice: false,
            containsMargin: false,
            containsInternalNotes: false,
            containsProviderNames: false,
            planningRowCanBecomePurchasable: false,
          },
        }),
      ),
    ).toThrow(/containsWholesaleCost is not false/);

    expect(() =>
      loadMasterOfferingDataset(
        dataset({ invariants: { containsSupplierIdentity: false } }),
      ),
    ).toThrow(/is not false/);
  });

  it("refuses an unknown schema, an empty catalog, and a malformed shape", () => {
    expect(() => loadMasterOfferingDataset(dataset({ schemaVersion: 2 }))).toThrow(
      /schema version/,
    );
    expect(() => loadMasterOfferingDataset(dataset({ products: [] }))).toThrow(
      /no products/,
    );
    expect(() => loadMasterOfferingDataset("not an object")).toThrow(
      /not an object/,
    );
  });

  it("refuses a closed-vocabulary violation rather than dropping the row", () => {
    expect(() =>
      loadMasterOfferingDataset(
        dataset({ products: [generatedOffering({ family: "made_up_family" })] }),
      ),
    ).toThrow(/unknown family/);
    expect(() =>
      loadMasterOfferingDataset(
        dataset({ products: [generatedOffering({ displayState: "purchasable" })] }),
      ),
    ).toThrow(/unknown display state/);
    expect(() =>
      loadMasterOfferingDataset(
        dataset({ products: [generatedOffering({ variants: [] })] }),
      ),
    ).toThrow(/no member-safe variant/);
  });

  it("never shows an internal source SKU as a variant label", () => {
    // Twenty of the real catalog's 1,181 variants arrive labelled with the
    // reseller's own SKU, because the workbook's Variant / Format column
    // contains it. A supplier SKU is on the never-expose list, and "R190"
    // tells a buyer nothing either.
    for (const opaque of ["R190", "R305-GFSK", "R123L", "-", "   ", "R817E"]) {
      const loaded = loadMasterOfferingDataset(
        dataset({
          products: [
            generatedOffering({
              displayName: "Collagen Renew",
              variants: [
                { id: "mov_a", label: opaque, displayState: "available_now" },
              ],
            }),
          ],
        }),
      );
      // One variant means the variant is the product. Truthful, and it invents
      // nothing.
      expect(loaded.products[0].variants[0].label).toBe("Collagen Renew");
    }
  });

  it("keeps every descriptive label exactly as written", () => {
    for (const real of [
      "5 mg vial",
      "60 vegetarian capsules",
      "Per product family",
      "100 mg, 60 vegetarian capsules",
      "Exact MOQ may be higher by supplier and packaging",
      "10 ml",
    ]) {
      const loaded = loadMasterOfferingDataset(
        dataset({
          products: [
            generatedOffering({
              variants: [{ id: "mov_a", label: real, displayState: "available_now" }],
            }),
          ],
        }),
      );
      expect(loaded.products[0].variants[0].label).toBe(real);
    }
  });

  it("refuses rather than guess when several variants are unlabelled", () => {
    // Two variants both named after the product cannot be told apart, and
    // there is nothing truthful to call them.
    expect(() =>
      loadMasterOfferingDataset(
        dataset({
          products: [
            generatedOffering({
              variants: [
                { id: "mov_a", label: "R190", displayState: "available_now" },
                { id: "mov_b", label: "R191", displayState: "available_now" },
              ],
            }),
          ],
        }),
      ),
    ).toThrow(/unlabelled variant among several/);
  });

  it("refuses a duplicate id or slug instead of silently picking one", () => {
    expect(() =>
      loadMasterOfferingDataset(
        dataset({
          products: [generatedOffering(), generatedOffering({ slug: "other" })],
        }),
      ),
    ).toThrow(/duplicate offering id/);
    expect(() =>
      loadMasterOfferingDataset(
        dataset({
          products: [generatedOffering(), generatedOffering({ id: "mo_2" })],
        }),
      ),
    ).toThrow(/duplicate offering slug/);
  });
});

describe("the reader on disk", () => {
  function files(
    text: string,
    mtimeMs = 1,
  ): DatasetFileSystem & { readText: ReturnType<typeof vi.fn> } {
    const readText = vi.fn(() => text);
    return { statMtimeMs: () => mtimeMs, readText };
  }

  it("reads once and re-reads only when the file changes", () => {
    let mtimeMs = 1;
    const readText = vi.fn(() => JSON.stringify(dataset()));
    const reader = new GeneratedMasterOfferingCatalogReader("catalog.json", {
      statMtimeMs: () => mtimeMs,
      readText,
    });
    reader.readCatalog();
    reader.readCatalog();
    reader.readCatalog();
    expect(readText).toHaveBeenCalledTimes(1);
    mtimeMs = 2;
    reader.readCatalog();
    expect(readText).toHaveBeenCalledTimes(2);
  });

  it("raises unavailable, never an empty catalog, when the file is missing", () => {
    const reader = new GeneratedMasterOfferingCatalogReader("missing.json", {
      statMtimeMs: () => {
        throw new Error("ENOENT");
      },
      readText: () => "",
    });
    // Zero offerings would read as "Xenios sells nothing". Unavailable is the
    // truth and the surface says so.
    expect(() => reader.readCatalog()).toThrow(MasterOfferingDatasetUnavailable);
    expect(() => reader.readCatalog()).toThrow(/not readable/);
  });

  it("raises unavailable on unparseable content", () => {
    const reader = new GeneratedMasterOfferingCatalogReader(
      "catalog.json",
      files("{ not json"),
    );
    expect(() => reader.readCatalog()).toThrow(/not valid JSON/);
  });

  it("refuses to be constructed with no path", () => {
    expect(() => new GeneratedMasterOfferingCatalogReader("   ")).toThrow(
      /no dataset path configured/,
    );
  });

  const absent = { exists: () => false };
  const present = { exists: () => true };

  it("is absent rather than empty when there is no dataset anywhere", () => {
    // Probed as absent deliberately. The repository ships a committed artifact,
    // so against the real filesystem the honest answer is that one exists, and
    // this assertion would be testing the worktree rather than the rule.
    expect(
      createMasterOfferingCatalogReaderFromEnv({}, undefined, absent),
    ).toBeNull();
    expect(
      createMasterOfferingCatalogReaderFromEnv(
        { [MASTER_OFFERINGS_DATASET_ENV_VAR]: "  " },
        undefined,
        absent,
      ),
    ).toBeNull();
    expect(
      createMasterOfferingCatalogReaderFromEnv(
        { [MASTER_OFFERINGS_DATASET_ENV_VAR]: "catalog.json" },
        files(JSON.stringify(dataset())),
        absent,
      ),
    ).toBeInstanceOf(GeneratedMasterOfferingCatalogReader);
  });

  it("finds the committed artifact with no environment variable set", () => {
    // The point of the committed artifact: a plain git clone serves the catalog
    // with no operator setup and no path from anybody's machine.
    const location = describeMasterOfferingDatasetLocation({}, present, "/srv/app");
    expect(location?.source).toBe("committed_artifact");
    expect(location?.filePath).toBe(
      path.resolve("/srv/app", MASTER_OFFERINGS_COMMITTED_DATASET_PATH),
    );
  });

  it("lets an operator override the committed artifact, and does not fall back on a typo", () => {
    // A named path that does not exist must fail against THAT path. Falling
    // back to the committed artifact would serve a different dataset while the
    // operator believed their override was live.
    const location = describeMasterOfferingDatasetLocation(
      { [MASTER_OFFERINGS_DATASET_ENV_VAR]: "/etc/secrets/catalog.json" },
      absent,
      "/srv/app",
    );
    expect(location?.source).toBe("environment_override");
    expect(location?.filePath).toBe(path.resolve("/etc/secrets/catalog.json"));
  });

  it("serves a real catalog through the service, priced on request", async () => {
    const reader = new GeneratedMasterOfferingCatalogReader(
      "catalog.json",
      files(JSON.stringify(dataset())),
    );
    const service = new MasterOfferingCatalogService(
      reader,
      noMasterOfferingCommerce,
    );
    const page = await service.list({});
    expect(page.total).toBe(1);
    expect(page.products[0].displayName).toBe("BPC-157");
    expect(page.products[0].variants.map((v) => v.label)).toEqual([
      "5 mg vial",
      "10 mg vial",
    ]);
    expect(page.products[0].priceSummary.display).toBe("Price on request");

    const detail = await service.detail("research-vials-bpc-157");
    expect(detail?.variants).toHaveLength(2);
    expect(detail?.variants[0].action.kind).toBe("request_access");
  });

  it("lets a search reach a loaded offering by alias", async () => {
    const reader = new GeneratedMasterOfferingCatalogReader(
      "catalog.json",
      files(JSON.stringify(dataset())),
    );
    const service = new MasterOfferingCatalogService(
      reader,
      noMasterOfferingCommerce,
    );
    expect((await service.list({ q: "BPC 157" })).total).toBe(1);
    expect((await service.list({ q: "bpc-157" })).total).toBe(1);
    expect((await service.list({ q: "nothing here" })).total).toBe(0);
  });
});
