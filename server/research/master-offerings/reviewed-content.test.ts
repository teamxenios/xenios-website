import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { projectMasterOfferingCard, projectMasterOfferingDetail } from "./customer-projection";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import dataset from "./data/member-safe-master-offerings.generated.json";
import batch from "./data/reviewed-public-content.json";
import type { NormalizedMasterOffering } from "./model";
import { getReviewedProductContent } from "./reviewed-content";

const committed = resolve(MASTER_OFFERINGS_COMMITTED_DATASET_PATH);

async function requestItem(offering: NormalizedMasterOffering) {
  const catalog = createRequestIntentCatalog({
    serviceFor: () => ({
      select: async () => ({ offerings: [offering], prices: new Map(), page: { total: 1, page: 1, pageSize: 100 } }),
    }),
    bindingFor: () => null,
    offeringVariantFor: () => null,
    catalogVersion: "synthetic-test",
  });
  const request = await catalog.list({
    actorType: "member", memberId: "synthetic-member", authUserId: "synthetic-user",
    normalizedEmail: null, earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]),
  }, {});
  return request.items[0];
}

describe("reviewed exact-variant catalog content", () => {
  it("binds every reviewed record to its canonical source pair", () => {
    const reader = new GeneratedMasterOfferingCatalogReader(committed);
    const offerings = new Map(reader.load().products.map((offering) => [offering.id, offering]));
    const identities = new Set<string>();
    for (const { offeringId, sourceVariantId, content } of batch.records) {
      const offering = offerings.get(offeringId)!;
      const variant = offering.variants.find((row) => row.id === sourceVariantId)!;
      expect(variant).toBeDefined();
      const identity = JSON.stringify([offeringId, sourceVariantId]);
      expect(identities.has(identity)).toBe(false);
      identities.add(identity);
      expect(getReviewedProductContent(offering, variant)).toEqual(content);
    }
  });

  it("projects reviewed content on both catalog surfaces only for the trusted dataset", async () => {
    const first = batch.records[0];
    const reader = new GeneratedMasterOfferingCatalogReader(committed);
    const approved = reader.load().products.find((row) => row.id === first.offeringId)!;
    const approvedCard = projectMasterOfferingCard(approved);
    expect(approvedCard.variants[0].reviewedContent).toEqual(first.content);
    expect(projectMasterOfferingDetail(approved).variants[0].reviewedContent).toEqual(first.content);

    const approvedRequest = await requestItem(approved);
    expect(approvedRequest).toMatchObject({
      sourceSelection: { variantId: first.sourceVariantId },
      reviewedContent: first.content,
      selectableForReview: false,
      intentExclusion: "non_merchandise",
      unitPriceCents: null,
    });
    expect(approvedRequest.variantId).not.toBe(first.sourceVariantId);

    const changed = structuredClone(dataset);
    const raw = changed.products.find((row) => row.id === first.offeringId)!;
    raw.variants[0].label = "Synthetic changed listing with the same exact IDs";
    const overrideReader = new GeneratedMasterOfferingCatalogReader("synthetic-override", {
      statMtimeMs: () => 1,
      readText: () => JSON.stringify(changed),
    });
    const override = overrideReader.load().products.find((row) => row.id === first.offeringId)!;
    expect(override.variants[0].id).toBe(first.sourceVariantId);
    const overrideCard = projectMasterOfferingCard(override);
    expect(overrideCard.variants[0]).toMatchObject({ label: raw.variants[0].label,
      action: approvedCard.variants[0].action, price: approvedCard.variants[0].price });
    expect(overrideCard.variants[0].reviewedContent).toBeUndefined();
    expect(projectMasterOfferingDetail(override).variants[0].reviewedContent).toBeUndefined();
    const overrideRequest = await requestItem(override);
    expect(overrideRequest).toMatchObject({ variantId: approvedRequest.variantId, specification: raw.variants[0].label,
      actionLabel: approvedRequest.actionLabel, selectableForReview: approvedRequest.selectableForReview,
      unitPriceCents: approvedRequest.unitPriceCents });
    expect(overrideRequest.reviewedContent).toBeUndefined();
  });
});
