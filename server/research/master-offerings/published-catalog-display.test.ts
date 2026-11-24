import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { loadMasterOfferingDataset } from "./dataset-reader";
import { registerReviewedProductDataset } from "./reviewed-content";
import { loadBindingIndex } from "./production-bindings";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { readPilotDisplay } from "../assisted-order/request-intent/published-catalog-display";

const selected = {
  offeringId: "mo_ab12", offeringVariantId: "mov_1234",
  productId: "00000000-0000-4000-8000-000000000001", variantId: "00000000-0000-4000-8000-000000000002",
};
const revisionId = "00000000-0000-4000-8000-000000000003";
const assetId = "00000000-0000-4000-8000-000000000004";
const content = { summary: "Reviewed pilot copy", overview: "Reviewed catalog overview" };
const media = { representation: "catalog_reference", packagingDesign: false,
  primary: { href: "/api/research/catalog-media/" + revisionId + "/" + assetId, altText: "Reviewed packaging image", width: 200, height: 200 } };
const record = { revisionId, generation: 1, identity: selected, content, media,
  provenance: { contentSha256: "a".repeat(64), mediaSha256: "b".repeat(64), rightsApprovalSha256: "c".repeat(64) } };

describe("reading the selected Product Control catalog revision", () => {
  it("returns only approved display fields and reads the current pointer again after withdrawal", async () => {
    const readPublishedRevision = vi.fn().mockResolvedValueOnce(record).mockResolvedValueOnce(null);
    const pilot = { selected, readPublishedRevision };
    expect(await readPilotDisplay(pilot, selected)).toEqual({ content, media });
    expect(await readPilotDisplay(pilot, selected)).toBeNull();
    expect(readPublishedRevision).toHaveBeenCalledTimes(2);
  });
  it.each(Object.keys(selected) as (keyof typeof selected)[])("does no source read when the listing differs on %s", async key => {
    const readPublishedRevision = vi.fn();
    expect(await readPilotDisplay({ selected, readPublishedRevision }, { ...selected, [key]: selected[key] + "a" })).toBeNull();
    expect(readPublishedRevision).not.toHaveBeenCalled();
  });
  it.each([
    { ...record, identity: { ...selected, variantId: assetId } },
    { ...record, generation: 0 },
    { ...record, revisionId: "00000000-0000-0000-0000-000000000000" },
    { ...record, content: { ...content, price: 123 } },
    { ...record, content: { ...content, overview: "Price: 59" } },
    { ...record, media: { ...media, primary: { ...media.primary, altText: "Reference package, USD 59" } } },
    { ...record, media: { ...media, storage_key: "private" } },
    { ...record, provenance: { ...record.provenance, rightsApprovalSha256: "" } },
    { ...record, media: { ...media, primary: { ...media.primary, href: "https://example.org/private" } } },
    { ...record, media: { ...media, primary: { ...media.primary, href: "/research/catalog-media/" + revisionId + "/" + assetId } } },
    { ...record, media: { ...media, primary: { ...media.primary, href: "/api/research/catalog-media/" + assetId + "/" + assetId } } },
    { ...record, media: { ...media, primary: { ...media.primary, href: media.primary.href + "?token=value" } } },
  ])("retains the reviewed fallback for an invalid published record", async value => {
    expect(await readPilotDisplay({ selected, readPublishedRevision: async () => value }, selected)).toBeNull();
  });
  it("retains the reviewed fallback when the current revision cannot be read", async () => {
    expect(await readPilotDisplay({ selected, readPublishedRevision: async () => { throw new Error("offline"); } }, selected)).toBeNull();
  });
  it("uses a publication for the exact catalog listing and leaves request resolution on its existing source", async () => {
    const raw = readFileSync(new URL("./data/member-safe-master-offerings.generated.json", import.meta.url), "utf8");
    const dataset = loadMasterOfferingDataset(JSON.parse(raw));
    registerReviewedProductDataset(raw, dataset.products);
    const offering = dataset.products.find(row => row.id === "mo_b126ee9235f0a810dc95")!;
    const variant = offering.variants[0];
    const binding = loadBindingIndex({ env: {}, cwd: process.cwd() }).index.get(offering.id + "|" + variant.id)!;
    const identity = { offeringId: offering.id, offeringVariantId: variant.id, productId: binding.productId, variantId: binding.variantId };
    const readPublishedRevision = vi.fn().mockResolvedValueOnce({ ...record, identity }).mockResolvedValueOnce(null);
    const catalog = createRequestIntentCatalog({
      serviceFor: () => ({ select: async () => ({ offerings: [offering], prices: new Map(), page: { page: 1, pageSize: 100, total: 1 } }) }),
      bindingFor: id => id === variant.id ? binding : null,
      offeringVariantFor: () => variant.id, catalogVersion: "fixture",
      publication: { selected: identity, readPublishedRevision },
    });
    const viewer = { actorType: "member", memberId: "fixture", normalizedEmail: null,
      earlyAccessSessionHash: null, capabilities: new Set(["assisted_orders:submit"]) } as AssistedOrderViewer;
    expect((await catalog.list(viewer, { page: 2, pageSize: 1 })).items).toEqual([]);
    expect((await catalog.list(viewer, { family: "research_peptides_materials" })).items).toEqual([]);
    expect(readPublishedRevision).not.toHaveBeenCalled();
    const first = (await catalog.list(viewer, {})).items[0];
    expect(first.reviewedContent).toEqual(content);
    expect(first.reviewedMedia).toEqual(media);
    const original = (await catalog.resolveMany(viewer, [identity]))[0]!;
    expect(original.reviewedContent?.summary).toBeTruthy();
    expect(original.reviewedContent).not.toEqual(content);
    expect(readPublishedRevision).toHaveBeenCalledTimes(1);
    expect((await catalog.list(viewer, {})).items[0]).toEqual(original);
    expect(readPublishedRevision).toHaveBeenLastCalledWith(identity);
  });
});
