import type { NormalizedMasterOffering, NormalizedMasterOfferingVariant } from "./model";
import { isReviewedDatasetVariant } from "./reviewed-content";
import { inquiryReviewStateFor } from "./inquiry-review-states";
import { isFormulationHeld } from "../../../shared/research/master-offerings/formulation-hold";
import { isHcgStrengthReview } from "../../../shared/research/master-offerings/hcg-strength-review";
import { requiresProviderPathway } from "../../../shared/research/master-offerings/pathway-authority";
import { requestStoreWidening } from "../../../shared/research/master-offerings/quote-cart";
import { isResearchFormUnconfirmed } from "../../../client/src/research/product-media/reviewed-form-holds";

/** Shared by the customer listing, first-party media and Product Control commands. */
export function isPublishableSupplement(offering: NormalizedMasterOffering, variant: NormalizedMasterOfferingVariant,
  reviewedHolds?: ReadonlySet<string>) {
  if (offering.family !== "supplements" || offering.visibility !== "member" || variant.visibility !== "member"
    || offering.displayState !== "request_access" || variant.displayState !== "request_access"
    || !isReviewedDatasetVariant(offering, variant)) return false;
  const subject = { family: offering.family, displayState: offering.displayState,
    variantDisplayState: variant.displayState, specification: variant.label, reviewedHolds };
  const { comingSoon, nonMerchandise } = requestStoreWidening(subject);
  return !comingSoon && !nonMerchandise && !requiresProviderPathway(subject)
    && inquiryReviewStateFor(offering.id, variant.id) === null && !isHcgStrengthReview(offering.id, variant.id)
    && !isResearchFormUnconfirmed(variant.id, offering.id) && !isFormulationHeld(variant.label, reviewedHolds);
}
