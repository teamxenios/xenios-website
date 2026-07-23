import { useState } from "react";
import { formatMoney } from "../../core";
import { ResearchDataTable, ResearchEmptyState, ResearchSecureNotice } from "../../ui/kit";
import { fetchActivationReconciliationCsv, getActivationReconciliation } from "../../adapters/adminOps";
import { AdminBoundary, AdminScreen } from "./AdminResearchHome";
import { fmtDateTime, useAdminResource } from "./auth";

// ---------------------------------------------------------------------------
// /admin/research/activation-reconciliation: verified founding-membership
// payments by reconciliation day and method, plus the obligation status
// census. Aggregates only, by design: no member ids, no evidence
// references, and no receiving details appear here or in the CSV.
// ---------------------------------------------------------------------------

type ReconciliationDay = {
  date: string;
  count: number;
  totalCents: number;
  byMethod: Record<string, { count: number; totalCents: number }>;
};

type ReconciliationDto = {
  report: {
    generatedAt: string;
    days: ReconciliationDay[];
    statusCounts: Record<string, number>;
  };
};

export default function ActivationReconciliation() {
  return (
    <AdminScreen
      title="Reconciliation"
      lead="Verified founding-membership payments by day and method. Aggregates only; nothing member-identifying leaves this report."
    >
      {(token) => <ReconciliationBody token={token} />}
    </AdminScreen>
  );
}

const loadReport = (t: string) => getActivationReconciliation<ReconciliationDto>(t);

type MethodRow = { key: string; date: string; method: string; count: number; totalCents: number };

function ReconciliationBody({ token }: { token: string }) {
  const resource = useAdminResource(token, loadReport);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function exportCsv() {
    setExporting(true);
    setExportError(null);
    const csv = await fetchActivationReconciliationCsv(token);
    setExporting(false);
    if (csv === null) {
      setExportError("The CSV export could not be fetched. Try again.");
      return;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activation-reconciliation-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  const report = resource.data?.report ?? null;
  const rows: MethodRow[] = (report?.days ?? []).flatMap((day) =>
    Object.entries(day.byMethod).map(([method, entry]) => ({
      key: `${day.date}-${method}`,
      date: day.date,
      method,
      count: entry.count,
      totalCents: entry.totalCents,
    })),
  );
  const totalCents = (report?.days ?? []).reduce((sum, day) => sum + day.totalCents, 0);
  const totalCount = (report?.days ?? []).reduce((sum, day) => sum + day.count, 0);

  return (
    <AdminBoundary
      state={resource.state}
      message={resource.message}
      deniedCode={resource.deniedCode}
      onRetry={resource.reload}
      unavailableTitle="Reconciliation is not open."
      unavailableBody="Founding membership activation is not enabled in this environment."
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="body-s text-ink-2" data-testid="reconciliation-summary">
            {totalCount} verified payment{totalCount === 1 ? "" : "s"}, {formatMoney(totalCents)} total
            {report?.generatedAt ? `, generated ${fmtDateTime(report.generatedAt)}` : ""}.
          </p>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={exporting}
            onClick={() => void exportCsv()}
            data-testid="reconciliation-export"
          >
            {exporting ? "Exporting..." : "Export CSV"}
          </button>
        </div>
        {exportError && (
          <p className="body-s" role="alert" style={{ color: "var(--error)" }}>
            {exportError}
          </p>
        )}

        {rows.length === 0 ? (
          <ResearchEmptyState
            title="No verified payments yet."
            body="Days appear here as payments are verified, keyed by their reconciliation date."
          />
        ) : (
          <ResearchDataTable<MethodRow>
            caption="Verified payments by reconciliation date and method"
            columns={[
              { key: "date", header: "Date", render: (r) => <span className="tabular">{r.date}</span> },
              { key: "method", header: "Method", render: (r) => r.method },
              { key: "count", header: "Count", render: (r) => <span className="tabular">{r.count}</span> },
              {
                key: "total",
                header: "Total",
                render: (r) => <span className="tabular">{formatMoney(r.totalCents)}</span>,
              },
            ]}
            rows={rows}
            rowKey={(r) => r.key}
          />
        )}

        {report && Object.keys(report.statusCounts).length > 0 && (
          <section aria-label="Obligation status census" className="card" data-testid="status-census">
            <p className="mono-label text-ink-mute mb-3">Obligations by status</p>
            <dl className="grid gap-2">
              {Object.entries(report.statusCounts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([status, count]) => (
                  <div key={status} className="flex items-baseline justify-between gap-4">
                    <dt className="body-s text-ink-2">{status.replace(/_/g, " ")}</dt>
                    <dd className="body-s tabular">{count}</dd>
                  </div>
                ))}
            </dl>
          </section>
        )}

        <ResearchSecureNotice>
          This report and its CSV carry aggregates only: no member ids, no evidence references, and no
          receiving destinations.
        </ResearchSecureNotice>
      </div>
    </AdminBoundary>
  );
}
