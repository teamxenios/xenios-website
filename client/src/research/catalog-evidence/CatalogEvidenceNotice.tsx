/**
 * Honest catalog-level evidence framing.
 *
 * Report which reviewed fields are shown for the selected variant.
 * This notice never derives readiness or purchase authority from documentation.
 */
export function CatalogEvidenceNotice({
  hasReviewedDocuments = false,
  hasReviewedStorage = false,
}: {
  hasReviewedDocuments?: boolean;
  hasReviewedStorage?: boolean;
}) {
  return (
    <section
      aria-labelledby="catalog-evidence-heading"
      className="grid min-w-0 gap-3"
      data-testid="catalog-evidence-notice"
    >
      <h2 id="catalog-evidence-heading" className="body-l font-700">
        Documentation and handling
      </h2>
      <dl className="grid min-w-0 gap-3 md:grid-cols-3">
        <div className="card grid min-w-0 gap-2">
          <dt className="form-label">Product documentation</dt>
          <dd className="body-s text-ink-2 min-w-0 break-words">
            {hasReviewedDocuments
              ? "The product documents shown above apply to the selected variant."
              : "This catalog view does not publish product-specific documents."}{" "}
            Listing status, price, and action do not prove documentation is
            complete.
          </dd>
        </div>
        <div className="card grid min-w-0 gap-2">
          <dt className="form-label">Lot and COA availability</dt>
          <dd className="body-s text-ink-2 min-w-0 break-words">
            No lot-specific COA is attached to this catalog view. This view does
            not establish that a document exists or applies to the exact item.
          </dd>
        </div>
        <div className="card grid min-w-0 gap-2">
          <dt className="form-label">Storage information</dt>
          <dd className="body-s text-ink-2 min-w-0 break-words">
            {hasReviewedStorage
              ? "The storage information shown above applies to the selected variant."
              : "This record contains no approved product-specific storage statement."}{" "}
            Follow only the handling information supplied with the exact item.
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default CatalogEvidenceNotice;
