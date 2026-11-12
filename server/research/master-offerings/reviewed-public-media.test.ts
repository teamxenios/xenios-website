/**
 * The public media registry itself: every record binds to a committed variant, every image
 * is the file its hash names, and a studio record (one that sets `representation`) never
 * sits on a held listing. Held carton proofs stay in internal review, so none may appear here.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  PRODUCT_MEDIA_REPRESENTATIONS, PRODUCT_MEDIA_REPRESENTATION_CAPTIONS,
} from "@shared/research/master-offerings/approved-content";
import { isResearchFormUnconfirmed } from "../../../client/src/research/product-media/reviewed-form-holds";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import mediaBatch from "./data/reviewed-public-media.json";
import { inquiryReviewStateFor } from "./inquiry-review-states";

type MediaRecord = (typeof mediaBatch.records)[number] & { media: { representation?: string } };
const records = mediaBatch.records as readonly MediaRecord[];
const sha256 = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");
const publicFile = (href: string) => resolve("client/public" + href);

/** Why a studio image may not be shown for this listing, or null when it may. */
function studioRefusal(record: Pick<MediaRecord, "offeringId" | "sourceVariantId"> & { media: { representation?: string; packagingDesign: boolean } }): string | null {
  const { representation, packagingDesign } = record.media;
  if (representation === undefined) return null;
  if (!(PRODUCT_MEDIA_REPRESENTATIONS as readonly string[]).includes(representation)) return "unknown representation";
  if (packagingDesign) return "studio record also sets packagingDesign";
  const hold = inquiryReviewStateFor(record.offeringId, record.sourceVariantId);
  if (hold) return "listing is held: " + hold.staffReviewCode;
  if (isResearchFormUnconfirmed(record.sourceVariantId, record.offeringId)) return "listing form is unconfirmed";
  return null;
}

describe("reviewed public media registry", () => {
  it("binds every record once to a committed offering variant", () => {
    const offerings = new Map(new GeneratedMasterOfferingCatalogReader(resolve(MASTER_OFFERINGS_COMMITTED_DATASET_PATH))
      .load().products.map((offering) => [offering.id, offering]));
    const seen = new Set<string>();
    for (const record of records) {
      const label = record.offeringId + ":" + record.sourceVariantId;
      expect(offerings.get(record.offeringId)?.variants.some((variant) => variant.id === record.sourceVariantId), label).toBe(true);
      expect(seen.has(label), label).toBe(false);
      seen.add(label);
    }
  });

  it("names each image by the sha256 of the file it serves", () => {
    for (const record of records) {
      const label = record.offeringId + ":" + record.sourceVariantId;
      expect(sha256(publicFile(record.media.primary.href)), label + " primary").toBe(record.primarySha256);
      const preview = (record.media as { labelPreview?: { href: string } }).labelPreview;
      if (preview) expect(sha256(publicFile(preview.href)), label + " label").toBe(record.labelPreviewSha256);
      else expect(record.labelPreviewSha256, label).toBeUndefined();
    }
  });

  it("puts no studio image on a held or form-unconfirmed listing", () => {
    for (const record of records) expect(studioRefusal(record), record.sourceVariantId).toBeNull();
  });

  it("refuses a planted studio record on a held listing, an unconfirmed form, or with two captions", () => {
    const held = records.find((record) => inquiryReviewStateFor(record.offeringId, record.sourceVariantId) !== null);
    expect(held, "a held registered listing exists to plant on").toBeDefined();
    const plant = (record: MediaRecord, representation: string, packagingDesign = false) =>
      studioRefusal({ ...record, media: { ...record.media, representation, packagingDesign } });
    expect(plant(held!, "proposed_carton")).toMatch(/^listing is held: /);
    const unheld = records.find((record) => studioRefusal({ ...record, media: { ...record.media, representation: "proposed_vial", packagingDesign: false } }) === null)!;
    expect(plant(unheld, "proposed_vial")).toBeNull();
    expect(plant(unheld, "proposed_vial", true)).toBe("studio record also sets packagingDesign");
    expect(plant(unheld, "photograph")).toBe("unknown representation");
    expect(studioRefusal({ offeringId: "mo_afb0add32da0de7426f5", sourceVariantId: "mov_9262033fe69a14a50f1c",
      media: { representation: "proposed_vial", packagingDesign: false } })).toBe("listing form is unconfirmed");
  });

  it("captions every studio image as unconfirmed about the actual container, with no price", () => {
    // The wording is not fixed here; only that each caption disclaims the real container.
    for (const caption of Object.values(PRODUCT_MEDIA_REPRESENTATION_CAPTIONS)) {
      expect(caption).toMatch(/unconfirmed|unverified|does not show the actual/);
      expect(caption).not.toMatch(/\$|price|USD/i);
    }
    for (const representation of ["proposed_carton", "proposed_vial"] as const) {
      expect(PRODUCT_MEDIA_REPRESENTATION_CAPTIONS[representation]).toMatch(/^Proposed /);
    }
    expect(Object.keys(PRODUCT_MEDIA_REPRESENTATION_CAPTIONS).sort()).toEqual([...PRODUCT_MEDIA_REPRESENTATIONS].sort());
  });
});
