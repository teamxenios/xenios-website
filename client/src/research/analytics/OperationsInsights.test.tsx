// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OPERATIONS_METRIC_VERSIONS, type MetricResult, type OperationsMetricId } from "../../../../shared/research/analytics/operations";
import { OperationsInsights } from "./OperationsInsights";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement("div"); document.body.append(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });
const render = (element: ReactNode) => act(() => root.render(element));
function chooseView(view: "operations" | "journey" | "delivery") {
  act(() => {
    const select = container.querySelector("select")!;
    select.value = view;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

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
  const labelElement = [...container.querySelectorAll(".mono-label")].find(node => node.textContent === label);
  if (!labelElement) throw new Error(`Missing metric card ${label}`);
  return labelElement.closest('[data-testid="ra-metric"]')! as HTMLElement;
}
const value = (label: string) => card(label).querySelector(".display-s")?.textContent;

describe("staff operations insights presentation", () => {
  it("shows real zero, unmeasured, unavailable, stale and partial states distinctly", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({
      unassigned_actionable: { value: null, freshness: "not_measured", reason: "not_measured" },
      oldest_actionable_age: { value: null, freshness: "unavailable", reason: "source_unavailable" },
      first_review_time: { value: 120, unit: "seconds", freshness: "stale", coverage: "partial" },
    }) }} />);
    expect(value("Open workload")).toBe("0");
    expect(value("Unassigned actionable requests")).toBe("Not measured");
    expect(value("Oldest actionable request")).toBe("Unavailable");
    expect(value("Time to first review")).toBe("Median 2 minutes");
    expect(card("Time to first review").textContent).toContain("Stale snapshot. Partial coverage");
  });
  it("explains why set-only evidence cannot produce a per-recipient rate", () => {
    const values = report({ message_delivery: { unit: "fraction", value: null,
      reason: "recipient_outcomes_not_individually_observable", evidenceCoverage: "recipient_set_only",
      summary: { recipient_set_only_delivered: 1, recipient_set_only_denominator: 1, recipient_specific_denominator: 0 } } });
    render(<OperationsInsights data={{ state: "ready", report: values }} />);
    chooseView("delivery");
    const item = card("Recipient delivery evidence");
    expect(value("Recipient delivery evidence")).toBe("Per-recipient rate unavailable");
    expect(item.textContent).toContain("Recipient-set delivery evidence");
    expect(item.textContent).toContain("1 of 1");
    expect(item.textContent).not.toContain("100%");
  });
  it("shows recipient-specific and set-only denominators separately for mixed coverage", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({ message_delivery: {
      value: 0.5, unit: "fraction", evidenceCoverage: "mixed",
      summary: { recipient_specific_delivered: 1, recipient_specific_denominator: 2,
        recipient_set_only_delivered: 1, recipient_set_only_denominator: 1 },
    } }) }} />);
    chooseView("delivery");
    expect(value("Recipient delivery evidence")).toBe("50%");
    const item = card("Recipient delivery evidence");
    expect(item.textContent).toContain("Recipient-specific delivery evidence1 of 2");
    expect(item.textContent).toContain("Recipient-set delivery evidence1 of 1");
  });
  it("keeps absent coverage metadata unknown", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({ open_workload: { coverage: null } }) }} />);
    expect(card("Open workload").textContent).toContain("Coverage unknown");
    expect(card("Open workload").textContent).not.toContain("Complete coverage");
  });
  it("keeps missing delivered counts unknown when a recipient-set denominator exists", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({ message_delivery: {
      value: null, reason: "recipient_outcomes_not_individually_observable",
      summary: { recipient_set_only_denominator: 2, recipient_set_only_delivered: null },
    } }) }} />);
    chooseView("delivery");
    expect(card("Recipient delivery evidence").textContent).toContain("Delivery count unavailable");
    expect(card("Recipient delivery evidence").textContent).not.toContain("0 of 2");
  });
  it("shows currencies, refunds and net cash movement without combining amounts", () => {
    render(<OperationsInsights data={{ state: "ready", report: report({ captured_payments: {
      unit: "currency_minor_units", value: null, sampleSize: 3,
      summary: { USD_capture: 10000, USD_settled_refund: 500, USD_net_cash_movement: 9500, EUR_capture: 2000 },
    } }) }} />);
    chooseView("journey");
    const item = card("Captured payments and settled refunds");
    expect(item.textContent).toContain("USD Captured");
    expect(item.textContent).toContain("USD Settled refunds");
    expect(item.textContent).toContain("EUR Captured");
    expect(item.textContent).toContain("9,500 minor units");
  });
  it("keeps error/loading data out of the displayed report and refreshes only on action", () => {
    const refresh = vi.fn();
    render(<OperationsInsights data={{ state: "loading" }} onRefresh={refresh} />);
    expect(container.querySelector('[role="status"]')?.textContent).toContain("Loading insights");
    expect(refresh).not.toHaveBeenCalled();
    render(<OperationsInsights data={{ state: "unavailable" }} onRefresh={refresh} />);
    expect(container.textContent).not.toContain("Open workload");
    act(() => [...container.querySelectorAll("button")].find(node => node.textContent === "Try again")!.click());
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it("rejects mixed environment snapshots instead of presenting a combined report", () => {
    const values = report({ requests_created: { environment: "staging" } });
    render(<OperationsInsights data={{ state: "ready", report: values }} />);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("could not be verified");
    expect(container.querySelector("select")).toBeNull();
  });
});
