import { createHash } from "node:crypto";
import type { NormalizedMasterOffering, NormalizedMasterOfferingVariant } from "./model";
import type { ReviewedProductContent, ReviewedProductContentRecord, ReviewedProductMedia } from "@shared/research/master-offerings/approved-content";
import { createHeldEducationLookup } from "./held-education";
import { heldEducationRegistrations } from "./held-education-registrations";
import type { InquiryReviewState } from "./inquiry-review-states";
import batch from "./data/reviewed-public-content.json";
import mediaBatch from "./data/reviewed-public-media.json";

const records: readonly ReviewedProductContentRecord[] = batch.records;
const contentByIdentity = new Map(
  records.map(({ offeringId, sourceVariantId, content }) => [JSON.stringify([offeringId, sourceVariantId]), content]),
);

const mediaByIdentity = new Map<string, ReviewedProductMedia>(
  mediaBatch.records.map(({ offeringId, sourceVariantId, media }) => [JSON.stringify([offeringId, sourceVariantId]), media]),
);
const reviewedOfferings = new WeakSet<NormalizedMasterOffering>();

/** Bind public copy to the reviewed source bytes, including when an override is configured. */
export function registerReviewedProductDataset(
  datasetText: string,
  offerings: readonly NormalizedMasterOffering[],
): void {
  const revision = createHash("sha256").update(datasetText.replaceAll("\r\n", "\n")).digest("hex");
  if (revision !== batch.datasetSha256) return;
  for (const offering of offerings) reviewedOfferings.add(offering);
}

function reviewedProductKey(offering: NormalizedMasterOffering, variant: NormalizedMasterOfferingVariant): string | undefined {
  if (!reviewedOfferings.has(offering) || !offering.variants.includes(variant)) return undefined;
  return JSON.stringify([offering.id, variant.id]);
}

export function getReviewedProductContent(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
): ReviewedProductContent | undefined {
  const key = reviewedProductKey(offering, variant);
  return key === undefined ? undefined : contentByIdentity.get(key);
}

const heldEducation = createHeldEducationLookup(heldEducationRegistrations);

/** Only use on the two inquiry displays that also expose the independent customer hold notice.
 * A held SKU may not fall back to an ordinary content record, even if one is added accidentally.
 */
export function getInquiryDisplayContent(offering: NormalizedMasterOffering, variant: NormalizedMasterOfferingVariant,
  hold: InquiryReviewState | null): ReviewedProductContent | undefined {
  if (!hold) return getReviewedProductContent(offering, variant);
  if (reviewedProductKey(offering, variant) === undefined) return undefined;
  return heldEducation({ datasetSha256: batch.datasetSha256, family: offering.family,
    offeringId: offering.id, sourceVariantId: variant.id }, hold);
}

export function getReviewedProductMedia(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
): ReviewedProductMedia | undefined {
  const key = reviewedProductKey(offering, variant);
  return key === undefined ? undefined : mediaByIdentity.get(key);
}
