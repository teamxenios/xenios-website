import { describe, expect, it } from "vitest";
import type {
  OfficialSourceAdapter,
  SupplementManifestRow,
} from "../official-sources/contracts";
import { runSupplementIngestionBatch } from "./supplement-ingestion";

const row: SupplementManifestRow = {
  sourceRowId: "222",
  canonicalProductId: "MOM-0001",
  canonicalVariantId: "MOM-0001",
  exactSku: "SKU-1",
  supplierProductCode: "SKU-1",
  upc: null,
  brand: "Momentous",
  productName: "Creatine",
  variantOrFormat: "60 servings",
  packageCount: "60 servings",
  flavor: null,
  form: "Powder",
  sizeOrWeight: null,
  recommendedPrice: 49.95,
  currentOfferState: "HELD_PENDING_GATES",
  officialProductUrl: "https://www.livemomentous.com/products/creatine",
};

const adapter: OfficialSourceAdapter = {
  id: "fixture",
  supports: () => true,
  lookup: async () => ({
    sourceUrl: row.officialProductUrl!,
    warnings: [],
    candidates: [
      {
        officialProductUrl: row.officialProductUrl!,
        officialImageUrl: "https://www.livemomentous.com/creatine.png",
        brand: "Momentous",
        officialProductId: "p1",
        officialVariantId: "v1",
        officialSku: "SKU-1",
        upc: null,
        productName: "Creatine",
        variantName: "60 servings",
        packageCount: "60 servings",
        form: "Powder",
        flavor: null,
        sizeOrWeight: null,
        width: 1600,
        height: 1600,
        format: "image/png",
        altText: "Momentous Creatine",
        retrievedAt: "2026-08-02T00:00:00.000Z",
        sourceAdapter: "fixture",
        sourceHash: "hash",
      },
    ],
  }),
};

describe("runSupplementIngestionBatch", () => {
  it("discovers exact official media but holds it when rights are pending", async () => {
    const result = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    expect(result.summary).toMatchObject({
      exactMatches: 1,
      rightsPending: 1,
      assetsDownloaded: 0,
      assetsLinked: 0,
    });
    expect(result.jobs[0].status).toBe("HELD");
    expect(result.media[0]).toMatchObject({
      approvalStatus: "RIGHTS_PENDING",
      publicUrl: null,
      altText: "Momentous Creatine, 60 servings",
    });
  });

  it("resumes terminal held jobs without another lookup", async () => {
    const first = await runSupplementIngestionBatch({ batchId: "batch-1", rows: [row], adapter });
    const throwingAdapter: OfficialSourceAdapter = {
      ...adapter,
      lookup: async () => {
        throw new Error("should not run");
      },
    };
    const resumed = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter: throwingAdapter,
      previous: first,
    });
    expect(resumed.jobs[0].attemptCount).toBe(first.jobs[0].attemptCount);
    expect(resumed.summary.failures).toBe(0);
  });
});
