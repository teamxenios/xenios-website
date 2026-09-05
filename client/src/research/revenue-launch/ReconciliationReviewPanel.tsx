import { useId, type ReactNode } from "react";
import {
  RECONCILIATION_FACT_KINDS,
  type EvidenceReference,
  type EvidenceState,
  type ExactIdentity,
  type FactKind,
  type ReconciliationReviewResponse,
  type ReviewFact,
} from "@shared/research/revenue-launch";

export type AvailableReconciliationReview = Extract<ReconciliationReviewResponse, { status: "AVAILABLE" }>;

const FACT_LABELS: Record<FactKind, string> = {
  identity_binding: "Identity binding",
  formulation: "Formulation",
  unit_of_sale: "Unit of sale",
  supplier: "Supplier",
};
const STATE_LABELS: Record<EvidenceState, string> = {
  UNKNOWN: "Unknown", PENDING: "Pending", CONFIRMED: "Confirmed", EXPIRED: "Expired", REJECTED: "Rejected",
};

function FactValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="body-s text-ink-mute">{label}</dt>
      <dd className="body-s mt-1 whitespace-pre-wrap" style={{ overflowWrap: "anywhere" }}>{children}</dd>
    </div>
  );
}

function ObservedTime({ value }: { value: string | null }) {
  return value === null ? <>Not recorded</> : <time dateTime={value}>{value}</time>;
}

function Identity({ title, identity }: { title: string; identity: ExactIdentity | null }) {
  return (
    <div className="min-w-0">
      <h4 className="body-s font-700">{title}</h4>
      {identity === null ? <p className="body-s mt-2">Not recorded. No identity is inferred from the source label.</p> : (
        <dl className="grid min-w-0 gap-3 mt-3">
          <FactValue label="Product ID">{identity.productId}</FactValue>
          <FactValue label="Variant ID">{identity.variantId}</FactValue>
          <FactValue label="SKU">{identity.sku}</FactValue>
        </dl>
      )}
    </div>
  );
}

function Evidence({ evidence }: { evidence: EvidenceReference | null }) {
  if (evidence === null) return <p className="body-s mt-3">No evidence reference supplied.</p>;
  return (
    <div className="min-w-0 mt-4">
      <p className="body-s font-700">Recorded evidence reference</p>
      <dl className="grid min-w-0 gap-3 mt-3">
        <FactValue label="Authority">{evidence.authority}</FactValue>
        <FactValue label="Record ID">{evidence.recordId}</FactValue>
        <FactValue label="Record revision">{evidence.recordRevision}</FactValue>
        <FactValue label="Evidence observed at"><ObservedTime value={evidence.observedAt} /></FactValue>
        <FactValue label="Reviewed at"><ObservedTime value={evidence.reviewedAt} /></FactValue>
        <FactValue label="Reviewer label">{evidence.reviewerLabel ?? "Not recorded"}</FactValue>
        <FactValue label="Evidence expires at"><ObservedTime value={evidence.expiresAt} /></FactValue>
      </dl>
      <p className="body-s text-ink-mute mt-3">Reference only. This view does not open raw evidence or infer a navigation link.</p>
    </div>
  );
}

function EvidenceFact({ kind, fact, headingId }: { kind: FactKind; fact: ReviewFact; headingId: string }) {
  return (
    <section aria-labelledby={headingId} data-fact-kind={kind} className="min-w-0 border rounded-md p-4">
      <h4 id={headingId} className="body-m font-700">{FACT_LABELS[kind]}</h4>
      <dl className="grid min-w-0 gap-3 mt-3">
        <FactValue label="State supplied by server"><span data-evidence-state={fact.state}>{STATE_LABELS[fact.state]}</span></FactValue>
        <FactValue label="Reason code">{fact.reason}</FactValue>
        <FactValue label="Fact observed at"><ObservedTime value={fact.observedAt} /></FactValue>
      </dl>
      <Evidence evidence={fact.evidence} />
    </section>
  );
}

/** Render an already validated server projection. Never derive fact state or authority. */
export function ReconciliationReviewContent({ review }: { review: AvailableReconciliationReview }) {
  const headingId = useId();
  const exceptionRows = review.rows.filter((row) => row.issueKinds.length > 0).length;
  const issueEntries = review.rows.reduce((count, row) => count + row.issueKinds.length, 0);
  return (
    <section aria-labelledby={headingId} className="min-w-0">
      <h2 id={headingId} className="body-l font-700">Source reconciliation review</h2>
      <p className="body-s text-ink-2 mt-2">
        Read-only evidence as observed. These separate facts do not approve a price, release a product,
        confirm purchase eligibility or authorize fulfillment. Source assumptions remain source assumptions.
      </p>
      <p className="body-s mt-3">
        {review.source.scope === "phase_a" ? "Full Phase A" : "Phase A exception subset"}: {review.coverage.returnedRows} of {review.coverage.expectedRows} source rows returned;
        {" "}{exceptionRows} exception rows and {issueEntries} issue entries. Row coverage is not evidence completeness or launch readiness.
      </p>
      <p className="body-s text-ink-mute mt-3">
        Server projected at <ObservedTime value={review.projectedAt} />. This timestamp does not refresh the individual observations below.
        States are shown as supplied by the server, not recalculated from the browser clock. Refetch to obtain a new server observation.
      </p>
      <details className="card min-w-0 mt-4">
        <summary className="body-m font-700" style={{ cursor: "pointer", minHeight: 44 }}>Source-set lineage</summary>
        <dl className="grid min-w-0 gap-4 mt-4 sm:grid-cols-2">
          <FactValue label="Source set">{review.source.sourceSetId}</FactValue>
          <FactValue label="Schema version">{review.schemaVersion}</FactValue>
          <FactValue label="Package SHA-256">{review.source.packageSha256}</FactValue>
          <FactValue label="Manifest SHA-256">{review.source.manifestSha256}</FactValue>
          <FactValue label="Source file SHA-256">{review.source.sourceFileSha256}</FactValue>
        </dl>
      </details>
      <div className="grid min-w-0 gap-6 mt-6">
        {review.rows.map((row, index) => {
          const rowHeadingId = `${headingId}-row-${index}`;
          return (
            <article key={row.sourceId} aria-labelledby={rowHeadingId} data-source-id={row.sourceId} className="card min-w-0">
              <p className="body-s text-ink-mute" style={{ overflowWrap: "anywhere" }}>Source assertion · {row.sourceId}</p>
              <h3 id={rowHeadingId} className="body-m font-700 mt-2" style={{ overflowWrap: "anywhere" }}>{row.productLabel}</h3>
              <dl className="grid min-w-0 gap-4 mt-4">
                <FactValue label="Source configuration — assumptions preserved">{row.configurationLabel}</FactValue>
                <FactValue label="Recorded issue kinds">{row.issueKinds.length ? row.issueKinds.join(", ") : "No issue kinds listed. This is not confirmation of all facts."}</FactValue>
              </dl>
              <div className="grid min-w-0 gap-5 mt-5 sm:grid-cols-2">
                <Identity title="Exact recorded identity — not commerce approval" identity={row.exactIdentity} />
                <Identity title="Proposed identity — not a confirmed binding or approval" identity={row.proposedIdentity} />
              </div>
              <div className="grid min-w-0 gap-4 mt-5 lg:grid-cols-2">
                {RECONCILIATION_FACT_KINDS.map((kind) => (
                  <EvidenceFact key={kind} kind={kind} fact={row.facts[kind]} headingId={`${rowHeadingId}-${kind}`} />
                ))}
              </div>
              <details className="min-w-0 mt-5">
                <summary className="body-s font-700" style={{ cursor: "pointer", minHeight: 44 }}>Exact row lineage</summary>
                <dl className="grid min-w-0 gap-3 mt-3 sm:grid-cols-2">
                  <FactValue label="Source ID">{row.sourceId}</FactValue>
                  <FactValue label="Launch item ID">{row.launchItemId}</FactValue>
                  <FactValue label="Source pointer">{row.sourcePointer}</FactValue>
                  <FactValue label="Source row SHA-256">{row.sourceRowSha256}</FactValue>
                </dl>
              </details>
            </article>
          );
        })}
      </div>
    </section>
  );
}
