import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { projectMasterOfferingCard, projectMasterOfferingDetail } from "./customer-projection";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import dataset from "./data/member-safe-master-offerings.generated.json";
import batch from "./data/reviewed-public-content.json";
import type { NormalizedMasterOffering } from "./model";
import { getReviewedProductContent, getReviewedProductMedia } from "./reviewed-content";

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

function readChangedOffering(offeringId: string, variantLabel: string) {
  const changed = structuredClone(dataset);
  const raw = changed.products.find((row) => row.id === offeringId)!;
  raw.variants[0].label = variantLabel;
  const reader = new GeneratedMasterOfferingCatalogReader("synthetic-override", {
    statMtimeMs: () => 1,
    readText: () => JSON.stringify(changed),
  });
  return reader.load().products.find((row) => row.id === offeringId)!;
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

  it.each([
    ["10mg", "mo_af289f611c02b3fcef01", "mov_ca3e45ae9712aee91430"],
    ["5mg", "mo_e4de11c77d16c4c3b83d", "mov_09db3e866424b64994d3"],
    ["15mg", "mo_9a755fa72de0409cd937", "mov_257330ea83ecbfc45fae"],
  ])("binds the %s artwork to the exact BPC variant on both projections", async (strength, offeringId, variantId) => {
    const reader = new GeneratedMasterOfferingCatalogReader(committed);
    const offerings = reader.load().products;
    const bpc = offerings.find((row) => row.id === offeringId)!;
    const variant = bpc.variants.find((row) => row.id === variantId)!;
    const media = getReviewedProductMedia(bpc, variant);
    expect(media).toMatchObject({
      primary: { href: "/research/product-media/bpc-157-xenios-" + strength + "-render.webp" },
      labelPreview: { href: "/research/product-media/bpc-157-xenios-" + strength + "-front-label.webp" },
      packagingDesign: true,
    });
    expect(projectMasterOfferingCard(bpc).variants[0].reviewedMedia).toEqual(media);
    expect((await requestItem(bpc)).reviewedMedia).toEqual(media);
    expect(getReviewedProductMedia({ ...bpc }, variant)).toBeUndefined();
    expect(getReviewedProductMedia(bpc, { ...variant })).toBeUndefined();

    const changed = readChangedOffering(bpc.id, "Synthetic changed BPC variant with the same IDs");
    expect(changed.variants[0].id).toBe(variant.id);
    expect(projectMasterOfferingCard(changed).variants[0].reviewedMedia).toBeUndefined();
    expect(projectMasterOfferingDetail(changed).variants[0].reviewedMedia).toBeUndefined();
    expect((await requestItem(changed)).reviewedMedia).toBeUndefined();
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

    const changedLabel = "Synthetic changed listing with the same exact IDs";
    const override = readChangedOffering(first.offeringId, changedLabel);
    expect(override.variants[0].id).toBe(first.sourceVariantId);
    const overrideCard = projectMasterOfferingCard(override);
    expect(overrideCard.variants[0]).toMatchObject({ label: changedLabel,
      action: approvedCard.variants[0].action, price: approvedCard.variants[0].price });
    expect(overrideCard.variants[0].reviewedContent).toBeUndefined();
    expect(projectMasterOfferingDetail(override).variants[0].reviewedContent).toBeUndefined();
    const overrideRequest = await requestItem(override);
    expect(overrideRequest).toMatchObject({ variantId: approvedRequest.variantId, specification: changedLabel,
      actionLabel: approvedRequest.actionLabel, selectableForReview: approvedRequest.selectableForReview,
      unitPriceCents: approvedRequest.unitPriceCents });
    expect(overrideRequest.reviewedContent).toBeUndefined();
  });
});
