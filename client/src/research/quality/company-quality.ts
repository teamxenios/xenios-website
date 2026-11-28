/** Company confirmation is a source, not an approved public lot record.
 * Exact public documents continue through shared/research/quality/public-lot.
 * No supplier document or qualified-review approval is inferred here. */
export const COMPANY_QUALITY_STATEMENT =
  "U.S.-manufactured. Independently tested by accredited U.S. laboratories.";

export const COMPANY_QUALITY_CONFIRMATION = {
  id: "xenios-sourcing-2026-11-18",
  statement: COMPANY_QUALITY_STATEMENT,
  provenance: "company_confirmed",
  confirmedBy: "Xenios",
  confirmedAt: "2026-11-18",
  scope: "The products described in Xenios's sourcing statement. This is not a statement about research supplies or shipping services.",
  independentDocumentReview: {
    state: "not_recorded",
    reviewer: null,
    reviewedAt: null,
  },
} as const;
