import type { ReviewedProductContent, ReviewedProductContentRecord } from "@shared/research/master-offerings/approved-content";
import batch from "./data/reviewed-public-content.json";

const records: readonly ReviewedProductContentRecord[] = batch.records;
const contentByIdentity = new Map(
  records.map(({ offeringId, sourceVariantId, content }) => [JSON.stringify([offeringId, sourceVariantId]), content]),
);

export function getReviewedProductContent(offeringId: string, sourceVariantId: string): ReviewedProductContent | undefined {
  return contentByIdentity.get(JSON.stringify([offeringId, sourceVariantId]));
}
