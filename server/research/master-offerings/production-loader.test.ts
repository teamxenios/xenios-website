import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  GeneratedMasterOfferingCatalogReader,
  createMasterOfferingCatalogReaderFromEnv,
} from "./dataset-reader";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import {
  MasterOfferingCatalogService,
  InMemoryMasterOfferingCatalogReader,
  type MasterOfferingCatalogReader,
} from "./service";
import { noMasterOfferingCommerce } from "./customer-projection";
import type {
  NormalizedMasterOffering,
  NormalizedMasterOfferingVariant,
} from "./model";
import { offering, variant } from "./test-fixtures";

const REPO_ROOT = process.cwd();
const COMMITTED = path.resolve(REPO_ROOT, MASTER_OFFERINGS_COMMITTED_DATASET_PATH);

/**
 * The pinned shape of the catalog that is committed right now.
 *
 * A failure here is not necessarily a bug. It is the signal that the dataset
 * changed, which is exactly what a master catalog swap does. Read the
 * reconciliation change report, satisfy yourself the new numbers are the ones
 * you meant, and then update these two numbers in the same commit as the data.
 * What must never happen is the catalog silently becoming a different catalog.
 */
const PINNED_OFFERINGS = 420;
const PINNED_VARIANTS = 420;

describe("the committed dataset artifact", () => {
  it("is present in the repository, not only on somebody's machine", () => {
    expect(fs.existsSync(COMMITTED)).toBe(true);
  });

  it("loads through the real reader, which re-checks privacy on every load", () => {
    // The reader refuses a dataset carrying any banned private key and refuses
    // one whose declared invariants are not all false. Loading it here is
    // therefore a privacy assertion, not just a parse.
    const loaded = new GeneratedMasterOfferingCatalogReader(COMMITTED).load();
    expect(loaded.products.length).toBeGreaterThan(0);
  });

  it("agrees with its own declared header", () => {
    const loaded = new GeneratedMasterOfferingCatalogReader(COMMITTED).load();
    const variants = loaded.products.reduce(
      (total, product) => total + product.variants.length,
      0,
    );
    expect(loaded.summary.offerings).toBe(loaded.products.length);
    expect(loaded.summary.variants).toBe(variants);
    expect(loaded.summary.sourceWorkbookSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("carries exactly the catalog we think it carries", () => {
    const loaded = new GeneratedMasterOfferingCatalogReader(COMMITTED).load();
    const variants = loaded.products.reduce(
      (total, product) => total + product.variants.length,
      0,
    );
    expect(loaded.products.length).toBe(PINNED_OFFERINGS);
    expect(variants).toBe(PINNED_VARIANTS);
  });

  it("is what a plain clone resolves to with no environment variable set", () => {
    const reader = createMasterOfferingCatalogReaderFromEnv({});
    expect(reader).toBeInstanceOf(GeneratedMasterOfferingCatalogReader);
    expect(reader?.readCatalog().length).toBe(PINNED_OFFERINGS);
  });

  it("indexes every member offering by slug, and refuses an unknown one", () => {
    const reader = new GeneratedMasterOfferingCatalogReader(COMMITTED);
    const all = reader.readCatalog();
    for (const product of all) {
      expect(reader.readBySlug(product.slug)?.id).toBe(product.id);
    }
    expect(reader.readBySlug("no-such-offering-anywhere")).toBeNull();
  });
});

/** A reader that answers by index and counts how often it is asked to scan. */
class CountingIndexedReader implements MasterOfferingCatalogReader {
  scans = 0;
  lookups = 0;

  constructor(private readonly products: readonly NormalizedMasterOffering[]) {}

  readCatalog(): readonly NormalizedMasterOffering[] {
    this.scans += 1;
    return this.products;
  }

  readBySlug(slug: string): NormalizedMasterOffering | null {
    this.lookups += 1;
    const matches = this.products.filter(
      (product) => product.visibility === "member" && product.slug === slug,
    );
    return matches.length === 1 ? matches[0] : null;
  }
}

function twoVariantOffering(): NormalizedMasterOffering {
  return offering({
    slug: "research-vials-test-product",
    variants: [
      variant({ id: "mov_first", label: "5 mg" }),
      variant({ id: "mov_second", label: "10 mg" }),
    ],
  });
}

describe("detail and variant lookup do not walk the catalog", () => {
  it("answers a detail request through the index, never a scan", async () => {
    const reader = new CountingIndexedReader([twoVariantOffering()]);
    const service = new MasterOfferingCatalogService(
      reader,
      noMasterOfferingCommerce,
    );
    const detail = await service.detail("research-vials-test-product");
    expect(detail).not.toBeNull();
    expect(reader.lookups).toBe(1);
    expect(reader.scans).toBe(0);
  });

  it("still works, and still refuses ambiguity, on a reader with no index", async () => {
    const duplicated = [twoVariantOffering(), twoVariantOffering()];
    const service = new MasterOfferingCatalogService(
      new InMemoryMasterOfferingCatalogReader(duplicated),
      noMasterOfferingCommerce,
    );
    // Two offerings share the slug. The scan counted matches and refused; the
    // fallback must keep doing exactly that rather than taking the first.
    expect(await service.detail("research-vials-test-product")).toBeNull();
  });

  it("returns one variant without resolving the others", async () => {
    const reader = new CountingIndexedReader([twoVariantOffering()]);
    let priced = 0;
    let resolvedCommerce = 0;
    const service = new MasterOfferingCatalogService(
      reader,
      async () => {
        resolvedCommerce += 1;
        return { binding: null, selection: null };
      },
      {
        priceFor: async (
          _offering: NormalizedMasterOffering,
          _variant: NormalizedMasterOfferingVariant,
        ) => {
          priced += 1;
          return { state: "on_request" as const };
        },
      },
    );

    const view = await service.variant("research-vials-test-product", "mov_second");
    expect(view?.id).toBe("mov_second");
    expect(view?.label).toBe("10 mg");
    // The offering has two variants. One was asked for, so one was resolved.
    expect(priced).toBe(1);
    expect(resolvedCommerce).toBe(1);
    expect(reader.scans).toBe(0);
  });

  it("refuses an unknown variant, a blank variant, and a bad slug", async () => {
    const service = new MasterOfferingCatalogService(
      new CountingIndexedReader([twoVariantOffering()]),
      noMasterOfferingCommerce,
    );
    expect(
      await service.variant("research-vials-test-product", "mov_nope"),
    ).toBeNull();
    expect(await service.variant("research-vials-test-product", "  ")).toBeNull();
    expect(await service.variant("NOT A SLUG", "mov_first")).toBeNull();
  });

  it("creates no purchase authority on the variant path", async () => {
    const service = new MasterOfferingCatalogService(
      new CountingIndexedReader([twoVariantOffering()]),
      noMasterOfferingCommerce,
    );
    const view = await service.variant("research-vials-test-product", "mov_first");
    expect(view?.action.kind).not.toBe("add_to_cart");
    expect(JSON.stringify(view)).not.toContain("add_to_cart");
  });
});
