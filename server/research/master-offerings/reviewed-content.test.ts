import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { projectMasterOfferingCard, projectMasterOfferingDetail } from "./customer-projection";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import dataset from "./data/member-safe-master-offerings.generated.json";
import batch from "./data/reviewed-public-content.json";
import { getReviewedProductContent } from "./reviewed-content";

describe("reviewed exact-variant catalog content", () => {
  it("binds every reviewed record to its canonical source pair", () => {
    const offerings = new Map(dataset.products.map((offering) => [offering.id, offering]));
    const identities = new Set<string>();
    for (const { offeringId, sourceVariantId, content } of batch.records) {
      expect(offerings.get(offeringId)?.variants.some((variant) => variant.id === sourceVariantId)).toBe(true);
      const identity = JSON.stringify([offeringId, sourceVariantId]);
      expect(identities.has(identity)).toBe(false);
      identities.add(identity);
      expect(getReviewedProductContent(offeringId, sourceVariantId)).toEqual(content);
    }
  });

  it("projects the same reviewed copy through member and request catalog reads", async () => {
    const first = batch.records[0];
    const reader = new GeneratedMasterOfferingCatalogReader(resolve(MASTER_OFFERINGS_COMMITTED_DATASET_PATH));
    const offering = reader.load().products.find((row) => row.id === first.offeringId)!;
    expect(projectMasterOfferingCard(offering).variants[0].reviewedContent).toEqual(first.content);
    expect(projectMasterOfferingDetail(offering).variants[0].reviewedContent).toEqual(first.content);

    const requestCatalog = createRequestIntentCatalog({
      serviceFor: () => ({
        select: async () => ({ offerings: [offering], prices: new Map(), page: { total: 1, page: 1, pageSize: 100 } }),
      }),
      bindingFor: () => null,
      offeringVariantFor: () => null,
      catalogVersion: "synthetic-test",
    });
    const request = await requestCatalog.list({
      actorType: "member", memberId: "synthetic-member", authUserId: "synthetic-user",
      normalizedEmail: null, earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]),
    }, {});
    expect(request.items[0]).toMatchObject({
      sourceSelection: { variantId: first.sourceVariantId },
      reviewedContent: first.content,
      selectableForReview: false,
      intentExclusion: "non_merchandise",
      unitPriceCents: null,
    });
    expect(request.items[0].variantId).not.toBe(first.sourceVariantId);
  });

  it("refuses to borrow copy from a different offering or an unreviewed variant", () => {
    const service = "mo_003b0c272099eeb1f114";
    const serviceVariant = "mov_9b65ad5bb184691e19e0";
    const supplement = "mo_b126ee9235f0a810dc95";
    const supplementVariant = "mov_9813dabbc127f6b382fb";
    expect(getReviewedProductContent(service, serviceVariant)?.summary).toBeTruthy();
    expect(getReviewedProductContent(supplement, supplementVariant)?.brand).toBe("NutriDyn");
    expect(getReviewedProductContent(service, supplementVariant)).toBeUndefined();
    expect(getReviewedProductContent(supplement, serviceVariant)).toBeUndefined();
    expect(getReviewedProductContent("mo_d82610b6fe7ebf3b4d63", "mov_f5d63d95caa3d6d0a7a0")).toBeUndefined();
  });
});
