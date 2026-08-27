import type { ImportDryRunReportDto } from "@shared/research/client-import/contract";
import {
  ResearchDataTable,
  ResearchMetricCard,
  ResearchSecureNotice,
  ResearchStatusBadge,
} from "../../../ui/kit";
import "../../../account-portal/account-portal.css";

export type ImportReviewAttribution = Readonly<{
  sourcePartner: string;
  relationshipOwner: string;
}>;

export type ImportReviewDisposition = Readonly<{
  approved: number;
  blocked: number;
  skipped: number;
}>;

export function ClientImportDryRunSummaryView({
  report,
  attribution,
  disposition,
}: {
  report: ImportDryRunReportDto;
  attribution?: ImportReviewAttribution;
  disposition?: ImportReviewDisposition;
}) {
  const mappingRows = report.exceptions.map((exception, index) => ({
    id: `${exception.kind}-${index}`,
    ...exception,
  }));

  return (
    <div className="research-app account-grid client-import-dry-run" data-testid="client-import-summary">
      <section className="account-surface account-surface-dark">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="account-section-label" style={{ color: "#c8c4bb" }}>Admin-only staging review</p>
            <h1 className="account-section-title">Client import dry run</h1>
            <p className="body-s mt-3" style={{ color: "#d9d6ce" }}>{report.sourceLabel}</p>
          </div>
          <ResearchStatusBadge label="Dry run · no sends" tone="pending" />
        </div>
      </section>

      <ResearchSecureNotice>
        This is a counts-only staging projection. It creates no active accounts, sends no invitations, and displays no imported customer names, emails, phone numbers, source rows, or raw product text — exceptions carry canonical codes and non-reversible references only.
      </ResearchSecureNotice>

      <section className="account-grid account-grid-3" aria-label="Import counts">
        <ResearchMetricCard label="Source rows" value={String(report.totalRows)} summary="Rows parsed into the staging dry run." />
        <ResearchMetricCard label="Rejected rows" value={String(report.rejectedRows)} summary="Refused outright (blank or oversized fields); every one is counted, none dropped silently." />
        <ResearchMetricCard label="Unique people" value={String(report.uniquePeople)} summary="Case-insensitive normalized person keys, never displayed here." />
        <ResearchMetricCard label="Duplicate rows" value={String(report.duplicateNameRows)} summary="Additional name-key rows detected for aggregation." />
        <ResearchMetricCard label="Missing contact" value={String(report.missingContact)} summary="People blocked from invitation because required contact fields are absent." />
        <ResearchMetricCard label="Mapped interests" value={String(report.mappedInterestMentions)} summary={`${report.distinctInterestKeys} distinct canonical interest keys.`} />
        <ResearchMetricCard label="Invitation eligible" value={String(report.invitationEligible)} summary="Eligible for a later approved wave; no invitation was sent." />
      </section>

      <div className="account-grid account-grid-2">
        <section className="account-surface" aria-labelledby="import-state-heading">
          <p className="account-section-label">Staging state</p>
          <h2 id="import-state-heading" className="account-section-title">Consent and account status</h2>
          <div className="mt-5">
            {Object.entries(report.consentStatusCounts).map(([state, count]) => (
              <div className="account-data-row" key={`consent-${state}`}><span className="account-data-label">Consent · {state.replaceAll("_", " ")}</span><span className="account-data-value tabular">{count}</span></div>
            ))}
            {Object.entries(report.accountStatusCounts).map(([state, count]) => (
              <div className="account-data-row" key={`account-${state}`}><span className="account-data-label">Account · {state.replaceAll("_", " ")}</span><span className="account-data-value tabular">{count}</span></div>
            ))}
          </div>
        </section>

        <section className="account-surface" aria-labelledby="import-attribution-heading">
          <p className="account-section-label">Authorized staff projection</p>
          <h2 id="import-attribution-heading" className="account-section-title">Source and ownership</h2>
          {attribution ? (
            <div className="mt-5">
              <div className="account-data-row"><span className="account-data-label">Source partner</span><span className="account-data-value">{attribution.sourcePartner}</span></div>
              <div className="account-data-row"><span className="account-data-label">Relationship owner</span><span className="account-data-value">{attribution.relationshipOwner}</span></div>
            </div>
          ) : <div className="account-empty mt-5">Attribution is withheld from this projection.</div>}
          <p className="body-s text-ink-mute mt-4">These fields are never part of the customer-facing account overview unless separately authorized.</p>
        </section>
      </div>

      {disposition ? (
        <section className="account-grid account-grid-3" aria-label="Review disposition">
          <ResearchMetricCard label="Approved" value={String(disposition.approved)} summary="Approved for a future controlled action; no action occurs in dry-run mode." />
          <ResearchMetricCard label="Blocked" value={String(disposition.blocked)} summary="Requires data or governance resolution before progression." />
          <ResearchMetricCard label="Skipped" value={String(disposition.skipped)} summary="Intentionally excluded from this review packet." />
        </section>
      ) : null}

      <section className="account-surface" aria-labelledby="mapping-exceptions-heading">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="account-section-label">Mapping review</p><h2 id="mapping-exceptions-heading" className="account-section-title">Counts and exceptions</h2></div>
          <ResearchStatusBadge label={`${report.unmappedInterests.length} unmapped`} tone={report.unmappedInterests.length ? "warning" : "success"} />
        </div>
        <div className="mt-6">
          <ResearchDataTable
            caption="Client import mapping exceptions"
            rows={mappingRows}
            rowKey={(row) => row.id}
            empty="No mapping exceptions were reported."
            columns={[
              { key: "kind", header: "Exception", render: (row) => row.kind.replaceAll("_", " ") },
              // Non-reversible product-string reference (P1-11): operators
              // recompute it from the source file they hold; no raw input is
              // ever reflected into this surface.
              { key: "ref", header: "Reference", render: (row) => <span className="tabular">{row.ref ?? "—"}</span> },
              { key: "count", header: "Occurrences", render: (row) => <span className="tabular">{row.occurrences}</span> },
            ]}
          />
        </div>
        {report.ambiguousBlendStrings.length ? (
          <div className="account-empty mt-5">
            <p className="body-s font-700">{report.ambiguousBlendStrings.length} ambiguous blend strings require manual review.</p>
            <p className="body-s mt-2">No person identity or source row is shown in this summary.</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
