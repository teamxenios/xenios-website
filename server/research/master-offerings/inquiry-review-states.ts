import clinical from "./data/reviewed-inquiry-review-states.json";
import research from "./data/reviewed-inquiry-review-states.research.json";

/**
 * Reviewed "details under review" states for listings that can be asked about
 * but have no reviewed description, or whose label states an unconfirmed fact.
 *
 * The customer sentence and the neutral specification are reviewed copy. The
 * staff code names the kind of open question and nothing else; the reasons
 * themselves are not kept in this repository.
 */
export const INQUIRY_REVIEW_CODES = [
  "offering_decision", "identity_unconfirmed", "strength_or_formulation_unconfirmed",
  "label_or_source_needed", "category_display_decision", "risk_review",
  "wording_decision", "description_pending",
] as const;
export type InquiryReviewCode = typeof INQUIRY_REVIEW_CODES[number];

export type InquiryReviewState = Readonly<{
  /** The one sentence a customer sees for this listing. */
  customerMessage: string;
  /** Shown in place of the variant's label when the label states an unconfirmed fact. */
  neutralSpecification: string | null;
  /** For staff only. Never returned in a customer response. */
  staffReviewCode: InquiryReviewCode;
}>;

export type InquiryReviewStateBatch = Readonly<{
  schemaVersion: number;
  records: readonly Readonly<Record<string, unknown>>[];
}>;

const RECORD_KEYS = ["offeringId", "sourceVariantId", "customerMessage", "neutralSpecification", "staffReviewCode"];

export function readInquiryReviewStates(
  batches: readonly InquiryReviewStateBatch[],
): ReadonlyMap<string, InquiryReviewState> {
  const states = new Map<string, InquiryReviewState>();
  const variants = new Set<string>();
  for (const batch of batches) {
    if (batch.schemaVersion !== 1 || !Array.isArray(batch.records)) throw new Error("inquiry_review_states_invalid");
    for (const record of batch.records) {
      const { offeringId, sourceVariantId, customerMessage, neutralSpecification, staffReviewCode } = record;
      if (Object.keys(record).some((key) => !RECORD_KEYS.includes(key))
        || typeof offeringId !== "string" || !/^mo_[0-9a-f]+$/.test(offeringId)
        || typeof sourceVariantId !== "string" || !/^mov_[0-9a-f]+$/.test(sourceVariantId)
        || typeof customerMessage !== "string" || customerMessage.trim() !== customerMessage
        || customerMessage.length < 20
        || !(neutralSpecification === null
          || (typeof neutralSpecification === "string" && neutralSpecification.trim().length > 0))
        || !INQUIRY_REVIEW_CODES.includes(staffReviewCode as InquiryReviewCode)) {
        throw new Error("inquiry_review_state_invalid");
      }
      // A variant belongs to one offering, so one state per variant.
      if (variants.has(sourceVariantId)) throw new Error("inquiry_review_state_duplicate");
      variants.add(sourceVariantId);
      states.set(offeringId + ":" + sourceVariantId, {
        customerMessage,
        neutralSpecification: neutralSpecification as string | null,
        staffReviewCode: staffReviewCode as InquiryReviewCode,
      });
    }
  }
  return states;
}

const states = readInquiryReviewStates([clinical, research]);
const codeByVariant = new Map([...states].map(([key, state]) => [key.split(":")[1], state.staffReviewCode]));

export function inquiryReviewStateFor(offeringId: string, sourceVariantId: string): InquiryReviewState | null {
  return states.get(offeringId + ":" + sourceVariantId) ?? null;
}

/** Staff readback only: the kind of open question on a stored line's listing, as it stands now. */
export function inquiryReviewCodeForVariant(sourceVariantId: string): InquiryReviewCode | null {
  return codeByVariant.get(sourceVariantId) ?? null;
}

export function inquiryReviewStateCount(): number {
  return states.size;
}
