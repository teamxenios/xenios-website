// @vitest-environment jsdom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { OPERATIONS_METRIC_VERSIONS, type MetricResult, type OperationsMetricId } from "../../../../shared/research/analytics/operations";
import { OperationsInsights } from "./OperationsInsights";

function metric(metricId: OperationsMetricId, changes: Partial<MetricResult> = {}): MetricResult {
  return { metricId, definitionVersion: OPERATIONS_METRIC_VERSIONS[metricId], environment: "production",
    scope: "authorized_tenant", windowStart: "2026-11-16T06:00:00Z", windowEnd: "2026-11-17T06:00:00Z",
    asOf: "2026-11-18T06:00:00Z", evaluatedAt: "2026-11-18T06:00:00Z", timezone: "America/Chicago",
    observedAt: "2026-11-18T06:00:00Z", lastSuccessfulAt: "2026-11-18T06:00:00Z",
    coverageStart: "2026-11-16T06:00:00Z", coverageEnd: "2026-11-17T06:00:00Z", coverage: "complete",
    freshness: "current", excludedFixtures: 0, sampleSize: 0, source: "canonical_request",
    populationKind: null, channel: null, evidenceCoverage: null, cohortRevision: 1, backfillVersion: 0,
    ingestedThrough: "2026-11-18T06:00:00Z", quantileMethod: null, value: 0, unit: "requests", reason: null,
    summary: {}, ...changes };
}
function report(changes: Partial<Record<OperationsMetricId, Partial<MetricResult>>> = {}): MetricResult[] {
  return (Object.keys(OPERATIONS_METRIC_VERSIONS) as OperationsMetricId[]).map(id => metric(id, changes[id]));
}
function card(label: string) {
  const labelElement = screen.getByText(label, { selector: ".mono-label" });
  return within(labelElement.closest('[data-testid="ra-metric"]')! as HTMLElement);
}

describe("staff operations insights presentation", () => {
  it("shows real zero, unmeasured, unavailable, stale and partial states distinctly", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({
      unassigned_actionable: { value: null, freshness: "not_measured", reason: "not_measured" },
      oldest_actionable_age: { value: null, freshness: "unavailable", reason: "source_unavailable" },
      first_review_time: { value: 120, unit: "seconds", freshness: "stale", coverage: "partial" },
    }) }} />);
    expect(card("Open workload").getByText("0")).toBeTruthy();
    expect(card("Unassigned actionable requests").getByText("Not measured")).toBeTruthy();
    expect(card("Oldest actionable request").getByText("Unavailable")).toBeTruthy();
    expect(card("Time to first review").getByText("2 minutes")).toBeTruthy();
    expect(card("Time to first review").getByText(/Stale snapshot\. Partial coverage/)).toBeTruthy();
  });
  it("shows mixed delivery evidence separately and explains a set-only rate", () => {
    const values = report({ message_delivery: { unit: "fraction", value: null,
      reason: "recipient_outcomes_not_individually_observable", evidenceCoverage: "recipient_set_only",
      summary: { recipient_set_only_delivered: 1, recipient_set_only_denominator: 1, recipient_specific_denominator: 0 } } });
    render(<OperationsInsights data={{ state: "ready", report: values }} />);
    fireEvent.change(screen.getByLabelText("Report view"), { target: { value: "delivery" } });
    const item = card("Recipient delivery evidence");
    expect(item.getByText("Per-recipient rate unavailable")).toBeTruthy();
    expect(item.getByText("Recipient-set delivery evidence")).toBeTruthy();
    expect(item.getByText("1 of 1")).toBeTruthy();
    expect(item.queryByText("100%")).toBeNull();
  });
  it("shows currencies, refunds and net cash movement without combining amounts", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({ captured_payments: {
      unit: "currency_minor_units", value: null, sampleSize: 3,
      summary: { USD_capture: 10000, USD_settled_refund: 500, USD_net_cash_movement: 9500, EUR_capture: 2000 },
    } }) }} />);
    fireEvent.change(screen.getByLabelText("Report view"), { target: { value: "journey" } });
    const item = card("Captured payments and settled refunds");
    expect(item.getByText("USD Captured")).toBeTruthy();
    expect(item.getByText("USD Settled refunds")).toBeTruthy();
    expect(item.getByText("EUR Captured")).toBeTruthy();
    expect(item.getByText("9,500 minor units")).toBeTruthy();
  });
  it("keeps error/loading data out of the displayed report and refreshes only on action", () => {
    const refresh = vi.fn();
    const { rerender } = render(<OperationsInsights data={{ state: "loading" }} onRefresh={refresh} />);
    expect(screen.getByRole("status").textContent).toContain("Loading insights");
    expect(refresh).not.toHaveBeenCalled();
    rerender(<OperationsInsights data={{ state: "unavailable" }} onRefresh={refresh} />);
    expect(screen.queryByText("Open workload")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed environment snapshots instead of presenting a combined report", () => {
    const values = report({ requests_created: { environment: "staging" } });
    render(<OperationsInsights data={{ state: "ready", report: values }} />);
    expect(screen.getByRole("alert").textContent).toContain("could not be verified");
    expect(screen.queryByLabelText("Report view")).toBeNull();
  });
});
