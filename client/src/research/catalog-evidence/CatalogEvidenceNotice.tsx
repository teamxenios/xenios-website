/**
 * Honest catalog-level evidence framing.
 *
 * The current member-safe catalog DTO has no product-document, lot, COA, or
 * approved storage fields. Absence from that DTO is not evidence that a
 * document does not exist elsewhere, so this component describes only what
 * this catalog view can prove. It never derives readiness or purchase authority
 * from documentation, and it contains no product-specific claims.
 */
export function CatalogEvidenceNotice() {
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
            This catalog view does not publish product-specific documents.
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
            This record contains no approved product-specific storage statement.
            Follow only the handling information supplied with the exact item.
          </dd>
        </div>
      </dl>
    </section>
  );
}

export default CatalogEvidenceNotice;
