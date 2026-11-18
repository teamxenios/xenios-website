import { useId, useState } from "react";
import { OPERATIONS_METRIC_VERSIONS, type MetricResult, type OperationsMetricId } from "../../../../shared/research/analytics/operations";
import { ResearchEmptyState, ResearchErrorState, ResearchLoadingState, ResearchMetricCard } from "../ui/kit";
import "./operations-insights.css";

const VIEWS = {
  operations: { label: "Operations", metrics: ["open_workload", "unassigned_actionable", "oldest_actionable_age", "first_review_time", "first_human_response"] },
  journey: { label: "Journey", metrics: ["requests_created", "admission_to_request", "request_to_quote", "captured_payments"] },
  delivery: { label: "Delivery and reliability", metrics: ["message_delivery", "outbox_overdue", "submit_failure_rate"] },
} as const;
type View = keyof typeof VIEWS;
const LABELS: Record<OperationsMetricId, string> = {
  requests_created: "New requests", open_workload: "Open workload", unassigned_actionable: "Unassigned actionable requests",
  oldest_actionable_age: "Oldest actionable request", first_review_time: "Time to first review",
  first_human_response: "Time to first human response", admission_to_request: "Catalog admission to request",
  request_to_quote: "Request to issued quote", captured_payments: "Captured payments and settled refunds",
  message_delivery: "Recipient delivery evidence", outbox_overdue: "Due notifications waiting",
  submit_failure_rate: "Request-submit failure rate",
};
const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago", year: "numeric", month: "short", day: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
});
function timestamp(value: string): string { return date.format(new Date(value)); }
function seconds(value: number): string {
  if (value < 60) return `${integer.format(value)} seconds`;
  if (value < 3600) return `${integer.format(value / 60)} minutes`;
  if (value < 86400) return `${integer.format(value / 3600)} hours`;
  return `${integer.format(value / 86400)} days`;
}
function displayedValue(result: MetricResult): string {
  if (result.freshness === "unavailable") return "Unavailable";
  if (result.freshness === "not_measured") return "Not measured";
  if (result.freshness === "not_configured") return "Not configured";
  if (result.reason === "recipient_outcomes_not_individually_observable") return "Per-recipient rate unavailable";
  if (result.reason === "no_eligible_observations") return "No eligible observations";
  if (result.metricId === "captured_payments") return result.sampleSize === 0 ? "No captured payments or settled refunds" : "Amounts by currency";
  if (result.value === null) return "Not measured";
  if (result.unit === "fraction") return percent.format(result.value);
  if (result.unit === "seconds") return seconds(result.value);
  return integer.format(result.value);
}
function observationSummary(result: MetricResult): string {
  if (result.freshness === "unavailable") return "The source could not supply a verified result.";
  if (result.freshness === "not_configured") return "The required data connection is not configured.";
  if (result.freshness === "not_measured") return "The source does not yet measure this stage.";
  const status = result.freshness === "stale" ? "Stale snapshot" : "Current observation";
  const coverage = result.coverage === "partial" ? "Partial coverage" : "Complete coverage";
  return `${status}. ${coverage}. Evaluated ${timestamp(result.evaluatedAt ?? result.asOf)}.`;
}

const SUMMARY_LABELS: Readonly<Record<string, string>> = {
  queued: "Queued", reviewing: "Reviewing", oldestOriginalSubmissionSeconds: "Longest total wait since submission",
  p90: "90th percentile", cohort: "Cohort size", stillUnreviewed: "Still awaiting first review", awaitingResponse: "Awaiting a human response",
  numerator: "Qualifying observations", denominator: "Eligible observations", immatureAdmissions: "Admissions still valid",
  immatureConversions: "Requests within still-valid admissions", validQuotes: "Current valid quotes", expiredQuotes: "Expired quotes",
  withdrawnQuotes: "Withdrawn quotes", oldestDueSeconds: "Oldest due notification", permanentFailures: "Permanent failures",
  uncertain: "Uncertain sends", validation: "Validation failures", accessDenied: "Access denials", transportUnknown: "Unknown transport outcomes",
};
const SOURCE_LABELS: Readonly<Record<string, string>> = {
  canonical_request: "Saved requests", authorized_workflow_projection: "Request workflow",
  authorized_human_response: "Human responses", trusted_admission_catalog_join: "Admission and catalog records",
  authorized_quote_issue: "Issued quotes", verified_payment_provider_ledger: "Verified payment records",
  frozen_recipient_evidence: "Frozen mail delivery evidence", notification_outbox: "Notification outbox",
  unsampled_submit_attempts: "Submit attempt records",
};
function resultDetails(result: MetricResult): readonly Readonly<{ label: string; value: string }>[] {
  if (result.freshness !== "current" && result.freshness !== "stale") return [];
  const details: { label: string; value: string }[] = [];
  for (const [key, label] of Object.entries(SUMMARY_LABELS)) {
    const value = result.summary[key];
    if (typeof value === "number") details.push({ label,
      value: key.endsWith("Seconds") || key === "p90" ? seconds(value) : integer.format(value) });
  }
  if (result.metricId === "captured_payments") {
    for (const [key, value] of Object.entries(result.summary)) {
      const match = /^([A-Z]{3})_(capture|settled_refund|net_cash_movement)$/.exec(key);
      if (!match || typeof value !== "number") continue;
      const labels: Readonly<Record<string, string>> = { capture: "Captured", settled_refund: "Settled refunds", net_cash_movement: "Net cash movement" };
      const label = labels[match[2]];
      // The source stores minor units. Expose the unit explicitly, including
      // currencies whose minor unit differs from a two-decimal dollar cent.
      details.push({ label: `${match[1]} ${label}`, value: `${integer.format(value)} minor units` });
    }
  }
  if (result.metricId === "message_delivery") {
    for (const [coverage, label] of [["recipient_specific", "Recipient-specific"], ["recipient_set_only", "Recipient-set"]] as const) {
      const denominator = result.summary[`${coverage}_denominator`];
      if (!denominator) continue;
      const delivered = result.summary[`${coverage}_delivered`];
      details.push({ label: `${label} delivery evidence`, value: `${integer.format(delivered ?? 0)} of ${integer.format(denominator)}` });
      for (const [outcome, outcomeLabel] of [["pending", "Pending"], ["bounced", "Bounced"], ["suppressed", "Suppressed"], ["uncertain", "Uncertain"]] as const) {
        const value = result.summary[`${coverage}_${outcome}`];
        if (typeof value === "number") details.push({ label: `${label} ${outcomeLabel.toLowerCase()}`, value: integer.format(value) });
      }
    }
  }
  return details;
}
function Metric({ result }: Readonly<{ result: MetricResult }>) {
  const details = resultDetails(result);
  return <ResearchMetricCard label={LABELS[result.metricId]} value={displayedValue(result)} summary={observationSummary(result)}>
    {result.metricId === "captured_payments" && <p>Payment captures and settled refunds are reported separately by currency.</p>}
    {result.metricId === "message_delivery" && <p>Recipient-set evidence covers the addressed set. Individual recipient outcomes require recipient-specific evidence.</p>}
    {result.metricId === "first_human_response" && <p>
      Population {result.populationKind === null ? "not specified" : result.populationKind === "support_case" ? "support cases" : "requests"}.
      {" "}Channel {result.channel === null ? "not specified" : result.channel === "email_provider_accepted" ? "email provider acceptance" : "private portal publication"}.
    </p>}
    {details.length > 0 && <dl className="xenios-insights__details">{details.map(detail =>
      <div key={detail.label}><dt>{detail.label}</dt><dd>{detail.value}</dd></div>)}</dl>}
    <details className="xenios-insights__provenance"><summary>Data details for {LABELS[result.metricId].toLowerCase()}</summary>
      <dl className="xenios-insights__details">
        <div><dt>Definition version</dt><dd>{result.definitionVersion}</dd></div>
        <div><dt>Source</dt><dd>{result.source.split(" + ").map(source => SOURCE_LABELS[source] ?? "Unrecognized source").join(", ")}</dd></div>
        <div><dt>Scope</dt><dd>Authorized workspace</dd></div>
        {result.sampleSize !== null && <div><dt>Sample size</dt><dd>{integer.format(result.sampleSize)}</dd></div>}
        {result.excludedFixtures !== null && <div><dt>Excluded fixture units</dt><dd>{integer.format(result.excludedFixtures)}</dd></div>}
        {result.lastSuccessfulAt && <div><dt>Last successful observation</dt><dd><time dateTime={result.lastSuccessfulAt}>{timestamp(result.lastSuccessfulAt)}</time></dd></div>}
        {result.coverageStart && <div><dt>Coverage begins</dt><dd><time dateTime={result.coverageStart}>{timestamp(result.coverageStart)}</time></dd></div>}
        {result.coverageEnd && <div><dt>Coverage through</dt><dd><time dateTime={result.coverageEnd}>{timestamp(result.coverageEnd)}</time></dd></div>}
        {result.cohortRevision !== null && <div><dt>Cohort revision</dt><dd>{result.cohortRevision}</dd></div>}
        {result.backfillVersion !== null && <div><dt>Backfill version</dt><dd>{result.backfillVersion}</dd></div>}
        {result.quantileMethod && <div><dt>Percentile method</dt><dd>Linear interpolation, type 7</dd></div>}
      </dl>
    </details>
  </ResearchMetricCard>;
}

export type OperationsInsightsState = Readonly<{ state: "loading" }> | Readonly<{ state: "unavailable" }> |
  Readonly<{ state: "ready"; report: readonly MetricResult[] }>;

/** The authorized parent owns transport, identity lifetime and data loading. */
export function OperationsInsights({ data, onRefresh }: Readonly<{ data: OperationsInsightsState; onRefresh?: () => void }>) {
  const [view, setView] = useState<View>("operations");
  const viewId = useId();
  if (data.state === "loading") return <ResearchLoadingState label="Loading insights" />;
  if (data.state === "unavailable") return <ResearchErrorState message="Insights are unavailable. Refresh this report or check the request queue's own status." onRetry={onRefresh} />;
  if (!data.report.length) return <ResearchEmptyState title="No report data" body="A verified reporting snapshot is not available." />;
  const first = data.report[0];
  const ids = new Set(data.report.map(row => row.metricId));
  const coherent = ids.size === 12 && data.report.length === 12 && data.report.every(row =>
    OPERATIONS_METRIC_VERSIONS[row.metricId] === row.definitionVersion && row.environment === first.environment &&
    row.windowStart === first.windowStart && row.windowEnd === first.windowEnd && row.asOf === first.asOf &&
    [row.windowStart, row.windowEnd, row.asOf, row.evaluatedAt, row.lastSuccessfulAt, row.coverageStart, row.coverageEnd]
      .every(value => value === null || Number.isFinite(Date.parse(value))));
  if (!coherent) return <ResearchErrorState message="The reporting snapshot could not be verified. Refresh to request a consistent report." onRetry={onRefresh} />;
  return <section className="xenios-insights" aria-label="Operations insights">
    <div className="xenios-insights__controls">
      <label htmlFor={viewId}>Report view<select id={viewId} value={view} onChange={event => setView(event.target.value as View)}>
        {Object.entries(VIEWS).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}
      </select></label>
      {onRefresh && <button type="button" className="btn btn-secondary" onClick={onRefresh}>Refresh report</button>}
    </div>
    <p className="xenios-insights__window">{first.environment === "staging" ? "Staging" : "Production"}. Reporting in America/Chicago.<br />
      <time dateTime={first.windowStart}>{timestamp(first.windowStart)}</time> to <time dateTime={first.windowEnd}>{timestamp(first.windowEnd)}</time>, end excluded.</p>
    <div className="xenios-insights__grid">{VIEWS[view].metrics.map(id => <Metric key={id} result={data.report.find(row => row.metricId === id)!} />)}</div>
  </section>;
}
