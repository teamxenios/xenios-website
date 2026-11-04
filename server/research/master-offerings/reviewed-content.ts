import { createHash } from "node:crypto";
import type { NormalizedMasterOffering, NormalizedMasterOfferingVariant } from "./model";
import type { ReviewedProductContent, ReviewedProductContentRecord } from "@shared/research/master-offerings/approved-content";
import batch from "./data/reviewed-public-content.json";

const records: readonly ReviewedProductContentRecord[] = batch.records;
const contentByIdentity = new Map(
  records.map(({ offeringId, sourceVariantId, content }) => [JSON.stringify([offeringId, sourceVariantId]), content]),
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

export function getReviewedProductContent(
  offering: NormalizedMasterOffering,
  variant: NormalizedMasterOfferingVariant,
): ReviewedProductContent | undefined {
  if (!reviewedOfferings.has(offering) || !offering.variants.includes(variant)) return undefined;
  return contentByIdentity.get(JSON.stringify([offering.id, variant.id]));
}
