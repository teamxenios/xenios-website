import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import manifest from "../../../content/research-products/supplement-candidates/reviewed-60-manifest.json";
import { appendReviewedSupplementSource, readReviewedSupplementManifest, SUPPLEMENT_FOUNDATION_SHA256,
  SUPPLEMENT_SOURCE_EXCLUSIONS } from "./supplement-source";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { MasterOfferingCatalogService } from "./service";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { getReviewedProductContent, getReviewedProductMedia } from "./reviewed-content";

const data = path.resolve("server/research/master-offerings/data");
const read = (name: string) => JSON.parse(fs.readFileSync(path.join(data, name), "utf8"));
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const dataset = read("member-safe-master-offerings.generated.json");
const copy = () => structuredClone(manifest);
const reader = new GeneratedMasterOfferingCatalogReader(path.join(data, "member-safe-master-offerings.generated.json"));
const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
const catalog = createRequestIntentCatalog({ serviceFor: () => service, bindingFor: () => null,
  offeringVariantFor: () => null, catalogVersion: "supplement-source-synthetic-viewer" });
const guest = { actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-supplement-review", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
function foundationText(): string {
  const foundation = structuredClone(dataset);
  delete foundation.foundationGeneratedAt;
  delete foundation.additionalSourceRowCount;
  delete foundation.additionalListingCount;
  foundation.generatedAt = "2026-08-15T04:10:09.357Z";
  foundation.canonicalProductCount = 420;
  foundation.variantCount = 420;
  foundation.products = foundation.products.slice(0, 420);
  return JSON.stringify(foundation, null, 1) + "\n";
}

describe("curated supplement source admission", () => {
  it("preserves thirty exact packages per brand, including Fuel as sports nutrition", () => {
    const source = readReviewedSupplementManifest(manifest);
    expect(source.records.filter(row => row.brand === "Pure Encapsulations")).toHaveLength(30);
    expect(source.records.filter(row => row.brand === "Momentous" && row.catalogType === "dietary_supplement")).toHaveLength(29);
    expect(source.records.filter(row => row.catalogType === "sports_nutrition").map(row => row.productName)).toEqual(["Fuel"]);
    expect(source.records.filter(row => row.listingState !== "request_only").map(row => row.candidateKey).sort())
      .toEqual(Object.keys(SUPPLEMENT_SOURCE_EXCLUSIONS).sort());
  });

  it("reproduces the expanded candidate from exact reviewed foundation bytes", () => {
    expect(createHash("sha256").update(foundationText()).digest("hex")).toBe(SUPPLEMENT_FOUNDATION_SHA256);
    const result = appendReviewedSupplementSource(foundationText(), manifest);
    expect(result.catalog).toEqual(dataset);
    expect(result.catalog.products).toHaveLength(476);
    expect(result.familyCounts.supplements).toBe(76);
    expect(result.contentRecords).toHaveLength(56);
    expect(result.excluded).toHaveLength(4);
    expect(() => appendReviewedSupplementSource(foundationText() + " ", manifest))
      .toThrow("Foundation bytes have not been reviewed");
  });

  it("preserves all 420 original product objects and exact content/media rows", () => {
    expect(digest(dataset.products.slice(0, 420))).toBe("7f485d1aeb321a868746b757bc2a1ebfff1578c6e45c3d29a2c63f5059db607b");
    expect(digest(read("reviewed-public-content.json").records.slice(0, 263)))
      .toBe("39229673982298b9b192f1ec4c7a9aa0f6943946ebc3bb10a90c7936c15a7877");
    expect(digest(read("reviewed-public-media.json").records))
      .toBe("9e90d011d454ed3154fe349042811e748288004434070a5f3a7b71f0e57267f6");
    expect(read("reviewed-public-content.json").records).toHaveLength(319);
    expect(read("reviewed-public-media.json").records).toHaveLength(258);
  });

  it("rejects duplicate selected variants and multiple packages counted as distinct products", () => {
    const variants = copy();
    variants.records[1].officialVariantId = variants.records[0].officialVariantId;
    expect(() => readReviewedSupplementManifest(variants)).toThrow("Duplicate curated package or product");
    const products = copy();
    products.records[1].productName = products.records[0].productName;
    expect(() => readReviewedSupplementManifest(products)).toThrow("Duplicate curated package or product");
  });

  it.each(Object.keys(SUPPLEMENT_SOURCE_EXCLUSIONS))("refuses promotion of excluded %s", candidateKey => {
    const source = copy();
    const record = source.records.find(row => row.candidateKey === candidateKey)!;
    record.listingState = "request_only";
    record.exclusionReason = null;
    record.evidenceOwner = null;
    expect(() => readReviewedSupplementManifest(source)).toThrow("A source publication or hidden hold was changed");
  });

  it("rejects invented commerce evidence or unexpected monetary fields", () => {
    const priced = copy();
    (priced.commercialEvidence as Record<string, unknown>).xeniosPrice = 1200;
    expect(() => readReviewedSupplementManifest(priced)).toThrow("must remain null");
    const injected = copy();
    (injected.records[0] as Record<string, unknown>).retailReferencePrice = { amount: 25, currency: "USD" };
    expect(() => readReviewedSupplementManifest(injected)).toThrow("Unexpected supplement source field");
    const extraCopy = copy();
    (extraCopy.records[0].content as Record<string, unknown>).image = "https://example.com/unlicensed.png";
    expect(() => readReviewedSupplementManifest(extraCopy)).toThrow("Unexpected supplement source field");
  });
});

describe("expanded source through the actual generated reader and request catalog", () => {
  it("finds the admitted packages by brand and the existing supplements category", async () => {
    expect((await catalog.list(guest, { search: "Pure Encapsulations", family: "supplements", pageSize: 100 })).items).toHaveLength(29);
    expect((await catalog.list(guest, { search: "Momentous", family: "supplements", pageSize: 100 })).items).toHaveLength(27);
    expect((await catalog.list(guest, { family: "supplements", pageSize: 100 })).items).toHaveLength(76);
    expect(reader.load().products).toHaveLength(476);
    for (const name of ["Pure Encapsulations OptiFerin-C", "Momentous 100% Plant Protein Powder", "Momentous Tyrosine", "Momentous Ashwagandha"]) {
      expect(reader.load().products.some(row => row.displayName === name)).toBe(false);
      expect((await catalog.list(guest, { search: name, pageSize: 100 })).items).toHaveLength(0);
    }
  });

  it("resolves every new unbound package as request-only with bound detail content and no invented media", async () => {
    const products = reader.load().products.slice(420);
    expect(products).toHaveLength(56);
    const resolved = await catalog.resolveMany(guest, products.map(row => ({
      productId: `unbound:${row.id}`, variantId: `unbound:${row.variants[0].id}`,
    })));
    expect(resolved).toHaveLength(56);
    for (const [index, item] of resolved.entries()) {
      expect(item).not.toBeNull();
      expect(item).toMatchObject({ selectableForReview: true, workflowMode: "request_pricing",
        unitPriceCents: null, priceVersion: null, clinicalReviewRequired: false });
      expect(item!.reviewedContent?.summary).toBeTruthy();
      expect(item!.reviewedContent?.specifications?.some(spec => spec.label === "Package" && spec.value === products[index].variants[0].label)).toBe(true);
      expect(item!.reviewedMedia).toBeUndefined();
    }
    const fuel = products.find(row => row.displayName === "Momentous Fuel")!;
    const detail = await service.detail(fuel.slug);
    expect(detail?.variants[0].reviewedContent?.specifications)
      .toContainEqual({ label: "Product type", value: "Sports nutrition" });
    expect(detail?.variants[0].reviewedContent?.storage).toBeUndefined();
    expect(detail?.variants[0].reviewedContent?.label).toContain("Nutrition Facts");
  });

  it("keeps historical copy and media available under the exact new byte binding", () => {
    const products = reader.load().products;
    const byId = new Map(products.map(row => [row.id, row]));
    for (const record of read("reviewed-public-content.json").records) {
      const row = byId.get(record.offeringId)!;
      expect(getReviewedProductContent(row, row.variants[0])).toEqual(record.content);
    }
    for (const record of read("reviewed-public-media.json").records) {
      const row = byId.get(record.offeringId)!;
      expect(getReviewedProductMedia(row, row.variants[0])).toEqual(record.media);
    }
    const wire = JSON.stringify(products.slice(420));
    for (const forbidden of ["retailReferencePrice", "officialRetailPrice", "wholesalePrice", "imageUrl", "certifications", "xeniosPrice"]) {
      expect(wire).not.toContain(forbidden);
    }
    const text = fs.readFileSync(path.join(data, "member-safe-master-offerings.generated.json"), "utf8").replaceAll("\r\n", "\n");
    const hash = createHash("sha256").update(text).digest("hex");
    expect(read("reviewed-public-content.json").datasetSha256).toBe(hash);
    expect(read("reviewed-public-media.json").datasetSha256).toBe(hash);
  });
});
