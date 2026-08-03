import { describe, expect, it, vi } from "vitest";
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

const approvedRights = {
  status: "WRITTEN_PERMISSION_APPROVED" as const,
  evidenceReference: "agreement://momentous/creatine/2026-01",
  grantedBy: "Momentous media licensing",
  permissionDate: "2026-01-15",
  expiresAt: null,
  limitations: "Current exact packaging only",
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

  it("causally re-evaluates rights on held jobs without another source lookup", async () => {
    const warningAdapter: OfficialSourceAdapter = {
      ...adapter,
      lookup: async (sourceRow) => ({
        ...(await adapter.lookup(sourceRow)),
        warnings: ["official source warning"],
      }),
    };
    const first = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter: warningAdapter,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    const throwingAdapter: OfficialSourceAdapter = {
      ...adapter,
      lookup: async () => {
        throw new Error("should not run");
      },
    };
    const rightsResolver = vi.fn(() => approvedRights);
    const resumed = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter: throwingAdapter,
      previous: first,
      rightsResolver,
      now: () => new Date("2026-08-02T00:05:00.000Z"),
    });
    expect(rightsResolver).toHaveBeenCalledOnce();
    expect(resumed.jobs[0].attemptCount).toBe(first.jobs[0].attemptCount + 1);
    expect(resumed.jobs[0].status).toBe("AWAITING_REVIEW");
    expect(resumed.media[0]).toMatchObject({
      approvalStatus: "AWAITING_REVIEW",
      rights: approvedRights,
    });
    expect(resumed.summary.rightsApproved).toBe(1);
    expect(resumed.summary.failures).toBe(0);
    expect(resumed.warnings).toEqual([
      { sourceRowId: row.sourceRowId, message: "official source warning" },
    ]);
  });

  it("keeps a held row fail-closed when an approved status has no evidence", async () => {
    const first = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter,
      now: () => new Date("2026-08-02T00:00:00.000Z"),
    });
    const resumed = await runSupplementIngestionBatch({
      batchId: "batch-1",
      rows: [row],
      adapter,
      previous: first,
      rightsResolver: () => ({
        status: "WRITTEN_PERMISSION_APPROVED",
        evidenceReference: null,
        grantedBy: null,
        permissionDate: null,
        expiresAt: null,
        limitations: null,
      }),
      now: () => new Date("2026-08-02T00:05:00.000Z"),
    });
    expect(resumed.jobs[0].status).toBe("HELD");
    expect(resumed.media[0].approvalStatus).toBe("RIGHTS_PENDING");
    expect(resumed.summary).toMatchObject({
      rightsApproved: 0,
      assetsDownloaded: 0,
      derivativesCreated: 0,
      assetsLinked: 0,
    });
  });
});
