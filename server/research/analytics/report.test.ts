import { describe, expect, it } from "vitest";
import type { AnalyticsSource, OperationsSources, ScopedFact } from "../../../shared/research/analytics/operations";
import { chicagoDayWindow } from "./calendar";
import { buildOperationsReport } from "./report";

const scope = { tenantId: "tenant-qa", environment: "production" as const };
const window = { start: "2026-11-16T06:00:00Z", end: "2026-11-17T06:00:00Z", asOf: "2026-11-18T06:00:00Z" };
const at = "2026-11-16T12:00:00Z";
function fact(id: string) { return { ...scope, id, synthetic: false, ingestedAt: window.asOf }; }
function available<T extends ScopedFact>(records: readonly T[]): Extract<AnalyticsSource<T>, { records: readonly T[] }> {
  return { freshness: "current", observedAt: window.asOf, lastSuccessfulAt: window.asOf,
    coverageStart: window.start, cohortRevision: 1, backfillVersion: 0, records };
}
function sources(): OperationsSources {
  const absent = { freshness: "not_measured" as const, observedAt: window.asOf };
  return { workflowCapabilities: { assignment: false, actionableEpisodes: false },
    requests: absent, workflows: absent, responses: absent, admissions: absent, quotes: absent,
    payments: absent, deliveries: absent, outbox: absent, submitAttempts: absent };
}
function report(input: OperationsSources) {
  return Object.fromEntries(buildOperationsReport(scope, window, input,
    { population: "request", channel: "portal_published" }).map(row => [row.metricId, row]));
}

describe("operational metrics from trusted scoped facts", () => {
  it("labels project mode explicitly and refuses mixed partition kinds under the same opaque key", () => {
    const project = { tenantId: "project:configured-project", environment: "production" as const, scopeKind: "project" as const };
    const input = sources();
    const row = { ...fact("project-request"), ...project, committedAt: at };
    input.requests = available([row]);
    const run = () => buildOperationsReport(project, window, input, { population: "request", channel: "portal_published" });
    expect(run()[0]).toMatchObject({ scope: "authorized_project", value: 1 });
    input.requests = available([row, { ...row, id: "tenant-row", scopeKind: "tenant" }]);
    expect(run()[0]).toMatchObject({ scope: "authorized_project", value: null, reason: "invalid_source" });
    expect(report(sources()).requests_created.scope).toBe("authorized_tenant");
    expect(() => buildOperationsReport({ ...project, scopeKind: "client" as never }, window, input,
      { population: "request", channel: "portal_published" })).toThrow("invalid_analytics_scope");
  });
  it("keeps all twelve unmeasured stages explicit without substituting zero", () => {
    const results = Object.values(report(sources()));
    expect(results).toHaveLength(12);
    expect(results.every(row => row.freshness === "not_measured" && row.value === null)).toBe(true);
  });
  it("deduplicates committed requests, excludes fixtures and other scopes, and uses half-open windows", () => {
    const input = sources();
    const first = { ...fact("request-a"), committedAt: window.start };
    input.requests = available([first, { ...first }, { ...fact("fixture"), committedAt: at, synthetic: true },
      { ...fact("other-tenant"), committedAt: at, tenantId: "other" },
      { ...fact("other-environment"), committedAt: at, environment: "staging" },
      { ...fact("at-end"), committedAt: window.end }]);
    expect(report(input).requests_created).toMatchObject({ value: 1, excludedFixtures: 1, sampleSize: 1 });
  });
  it("marks a failed or partial source honestly and preserves a stale observation", () => {
    const input = sources();
    input.requests = { freshness: "unavailable", observedAt: window.asOf };
    expect(report(input).requests_created).toMatchObject({ value: null, freshness: "unavailable" });
    input.requests = { ...available([]), freshness: "stale", coverageStart: at,
      observedAt: window.end, lastSuccessfulAt: window.end };
    expect(report(input).requests_created).toMatchObject({ value: 0, freshness: "stale", coverage: "partial", lastSuccessfulAt: window.end });
  });
  it("refuses conflicting duplicates and future observations without returning source strings", () => {
    const input = sources();
    input.requests = available([{ ...fact("same"), committedAt: at }, { ...fact("same"), committedAt: window.end }]);
    expect(report(input).requests_created).toMatchObject({ value: null, reason: "invalid_source" });
    input.requests = { ...available([]), observedAt: "2026-12-01T00:00:00Z" };
    expect(report(input).requests_created).toMatchObject({ value: null, reason: "invalid_source" });
    input.requests = { freshness: "not_measured", observedAt: "SENSITIVE INVALID DATE" };
    expect(report(input).requests_created).toMatchObject({ value: null, reason: "invalid_source", observedAt: window.asOf });
  });
  it("freezes stale ages and mature cohorts at their last successful snapshot", () => {
    const input = sources();
    const frozenAt = "2026-11-16T13:00:00Z";
    input.workflowCapabilities = { assignment: true, actionableEpisodes: true };
    input.workflows = { ...available([{ ...fact("waiting"), ingestedAt: frozenAt, committedAt: at,
      state: "queued" as const, firstReviewAt: null, actionable: true, activeOwnerPresent: false,
      actionableEpisodeStartedAt: at }]), freshness: "stale", lastSuccessfulAt: frozenAt };
    input.admissions = { ...available([{ ...fact("still-valid-at-snapshot"), ingestedAt: frozenAt,
      validFrom: at, firstCatalogAccessAt: at, validUntil: window.end, firstRequestAt: null }]),
      freshness: "stale", lastSuccessfulAt: frozenAt };
    expect(report(input).oldest_actionable_age).toMatchObject({ value: 3600, freshness: "stale",
      evaluatedAt: "2026-11-16T13:00:00.000Z", coverage: "partial" });
    expect(report(input).admission_to_request).toMatchObject({ value: null,
      summary: { denominator: 0, immatureAdmissions: 1 } });
  });
  it("reports no value for a wholly unobserved window and labels current partial days", () => {
    const input = sources();
    input.requests = { ...available([]), freshness: "stale", lastSuccessfulAt: "2026-11-15T12:00:00Z", coverageStart: "2026-11-14T06:00:00Z" };
    expect(report(input).requests_created).toMatchObject({ value: null, freshness: "unavailable" });
    input.requests = available([{ ...fact("known"), ingestedAt: at, committedAt: at }]);
    const partial = buildOperationsReport(scope, { ...window, asOf: at }, { ...input,
      requests: { ...available([{ ...fact("known"), ingestedAt: at, committedAt: at }]), observedAt: at, lastSuccessfulAt: at } },
    { population: "request", channel: "portal_published" }).find(row => row.metricId === "requests_created");
    expect(partial).toMatchObject({ value: 1, coverage: "partial", coverageEnd: "2026-11-16T12:00:00.000Z" });
  });
  it("recognizes equivalent stale snapshot epochs with different ISO precision", () => {
    const input = sources();
    const frozenAt = "2026-11-16T13:00:00Z";
    input.requests = { ...available([{ ...fact("request-a"), ingestedAt: frozenAt, committedAt: at }]),
      freshness: "stale", lastSuccessfulAt: frozenAt };
    input.quotes = { ...available([{ ...fact("quote-a"), ingestedAt: frozenAt, requestId: "request-a",
      issuedAt: "2026-11-16T12:30:00Z", currentStatus: "valid" as const }]),
      freshness: "stale", lastSuccessfulAt: "2026-11-16T13:00:00.000Z" };
    expect(report(input).request_to_quote).toMatchObject({ freshness: "stale", value: 1 });
  });
  it("uses the canonical two-state workflow and keeps unimplemented ownership metrics unmeasured", () => {
    const input = sources();
    input.workflows = available([{ ...fact("request-a"), committedAt: at, state: "queued", firstReviewAt: null },
      { ...fact("request-b"), committedAt: at, state: "reviewing", firstReviewAt: "2026-11-16T12:01:00Z" }]);
    const results = report(input);
    expect(results.open_workload).toMatchObject({ value: 2, summary: { queued: 1, reviewing: 1 } });
    expect(results.unassigned_actionable).toMatchObject({ value: null, freshness: "not_measured" });
    expect(results.oldest_actionable_age).toMatchObject({ value: null, freshness: "not_measured" });
    expect(results.first_review_time).toMatchObject({ value: 60, sampleSize: 1,
      summary: { median: 60, p90: 60, cohort: 2, stillUnreviewed: 1 } });
  });
  it("retains original waiting age when an actionable episode starts again", () => {
    const input = sources();
    input.workflowCapabilities = { assignment: true, actionableEpisodes: true };
    input.workflows = available([{ ...fact("requeued"), committedAt: at, state: "queued", firstReviewAt: null,
      actionable: true, activeOwnerPresent: false, actionableEpisodeStartedAt: "2026-11-18T05:59:00Z" }]);
    expect(report(input).oldest_actionable_age).toMatchObject({ value: 60,
      summary: { oldestOriginalSubmissionSeconds: 151200 } });
    expect(report(input).unassigned_actionable.value).toBe(1);
  });
  it("keeps human response channels and origin populations apart and shows censoring", () => {
    const input = sources();
    input.responses = available([
      { ...fact("request-portal"), population: "request", channel: "portal_published", originCreatedAt: at, firstHumanResponseAt: "2026-11-16T12:00:10Z" },
      { ...fact("request-email"), population: "request", channel: "email_provider_accepted", originCreatedAt: at, firstHumanResponseAt: "2026-11-16T12:01:00Z" },
      { ...fact("support-email"), population: "support_case", channel: "email_provider_accepted", originCreatedAt: at, firstHumanResponseAt: "2026-11-16T12:10:00Z" },
      { ...fact("request-unanswered"), population: "request", channel: "portal_published", originCreatedAt: at, firstHumanResponseAt: null },
    ]);
    expect(report(input).first_human_response).toMatchObject({ value: 10, populationKind: "request", channel: "portal_published",
      sampleSize: 1, summary: { cohort: 2, awaitingResponse: 1 } });
  });
  it("calculates conversion only for matured admitted cohorts, including late committed facts", () => {
    const input = sources();
    const base = { ...fact("admission-a"), validFrom: at, firstCatalogAccessAt: at,
      validUntil: window.end, firstRequestAt: "2026-11-16T12:30:00Z" };
    input.admissions = available([base, { ...base, id: "admission-b", firstRequestAt: null },
      { ...base, id: "immature", validUntil: "2026-11-19T00:00:00Z" }]);
    expect(report(input).admission_to_request).toMatchObject({ value: 0.5, summary: {
      numerator: 1, denominator: 2, immatureAdmissions: 1, immatureConversions: 1 } });
  });
  it("does not turn an empty denominator into a percentage", () => {
    const input = sources();
    input.admissions = available([]);
    expect(report(input).admission_to_request).toMatchObject({ value: null, reason: "no_eligible_observations", summary: { denominator: 0 } });
  });
  it("counts issued quotes by request cohort once and keeps drafts outside conversion", () => {
    const input = sources();
    input.requests = available([{ ...fact("request-a"), committedAt: at }, { ...fact("request-b"), committedAt: at }]);
    input.quotes = available([
      { ...fact("quote-1"), requestId: "request-a", issuedAt: "2026-11-17T12:00:00Z", currentStatus: "expired" },
      { ...fact("quote-2"), requestId: "request-a", issuedAt: "2026-11-18T00:00:00Z", currentStatus: "valid" },
      { ...fact("draft"), requestId: "request-b", issuedAt: null, currentStatus: "draft" },
    ]);
    expect(report(input).request_to_quote).toMatchObject({ value: 0.5, summary: {
      numerator: 1, denominator: 2, validQuotes: 1, expiredQuotes: 1, withdrawnQuotes: 0 } });
  });
  it("keeps currencies and settled refunds separate, excluding test payments", () => {
    const input = sources();
    input.payments = available([
      { ...fact("capture-a"), kind: "capture", occurredAt: at, amountMinor: 10000, currency: "USD", test: false },
      { ...fact("refund-a"), kind: "settled_refund", occurredAt: at, amountMinor: 2500, currency: "USD", test: false },
      { ...fact("capture-b"), kind: "capture", occurredAt: at, amountMinor: 3000, currency: "EUR", test: false },
      { ...fact("test-payment"), kind: "capture", occurredAt: at, amountMinor: 999999, currency: "USD", test: true },
    ]);
    expect(report(input).captured_payments).toMatchObject({ value: null, sampleSize: 3,
      summary: { USD_capture: 10000, USD_settled_refund: 2500, USD_net_cash_movement: 7500, EUR_capture: 3000 } });
  });
  it("counts frozen recipient units once and keeps set-only delivery separate", () => {
    const input = sources();
    const delivered = { ...fact("message-a-binding-a"), coverage: "recipient_specific" as const,
      acceptedAt: at, deliveredAt: "2026-11-17T01:00:00Z", outcome: "pending" as const };
    input.deliveries = available([delivered, { ...delivered },
      { ...delivered, id: "message-a-binding-b", deliveredAt: null },
      { ...delivered, id: "message-b-set", coverage: "recipient_set_only" }]);
    expect(report(input).message_delivery).toMatchObject({ value: 0.5, evidenceCoverage: "mixed",
      summary: { recipient_specific_delivered: 1, recipient_specific_denominator: 2,
        recipient_set_only_delivered: 1, recipient_set_only_denominator: 1 } });
    input.deliveries = available([{ ...delivered, coverage: "recipient_set_only" }]);
    expect(report(input).message_delivery).toMatchObject({ value: null, evidenceCoverage: "recipient_set_only" });
    expect(report(input).message_delivery.reason).toBe("recipient_outcomes_not_individually_observable");
  });
  it("separates due jobs, permanent failures and uncertain sends without counting future jobs", () => {
    const input = sources();
    input.outbox = available([
      { ...fact("due"), dueAt: window.end, status: "pending", uncertain: false },
      { ...fact("future"), dueAt: "2026-12-01T00:00:00Z", status: "pending", uncertain: false },
      { ...fact("permanent"), dueAt: at, status: "failed_permanent", uncertain: false },
      { ...fact("uncertain"), dueAt: at, status: "failed_retryable", uncertain: true },
    ]);
    expect(report(input).outbox_overdue).toMatchObject({ value: 1,
      summary: { oldestDueSeconds: 86400, permanentFailures: 1, uncertain: 1 } });
  });
  it("reports delivery exception breakdowns at each supported granularity", () => {
    const input = sources();
    input.deliveries = available((["pending", "bounced", "suppressed", "uncertain"] as const).map(outcome => ({
      ...fact(`unit-${outcome}`), acceptedAt: at, deliveredAt: null, outcome, coverage: "recipient_specific" as const,
    })));
    expect(report(input).message_delivery).toMatchObject({ value: 0, summary: {
      recipient_specific_denominator: 4, recipient_specific_pending: 1, recipient_specific_bounced: 1,
      recipient_specific_suppressed: 1, recipient_specific_uncertain: 1,
    } });
  });
  it("counts submit attempts separately from committed requests", () => {
    const input = sources();
    input.submitAttempts = available([
      { ...fact("attempt-1"), completedAt: at, outcome: "success" },
      { ...fact("attempt-2"), completedAt: at, outcome: "server_failure" },
      { ...fact("attempt-3"), completedAt: at, outcome: "validation" },
      { ...fact("attempt-4"), completedAt: at, outcome: "transport_unknown" },
    ]);
    expect(report(input).submit_failure_rate).toMatchObject({ value: 0.25, summary: { numerator: 1, denominator: 4, transportUnknown: 1, validation: 1 } });
  });
  it("exports only aggregate fields and rejects invalid source dates safely", () => {
    const input = sources();
    input.requests = available([{ ...fact("PRIVATE-ID"), tenantId: "tenant-qa", committedAt: at,
      ...{ email: "SENSITIVE@example.invalid", address: "SENSITIVE STREET" } }]);
    expect(JSON.stringify(report(input))).not.toMatch(/PRIVATE-ID|tenant-qa|SENSITIVE|example.invalid/);
    input.requests = available([{ ...fact("bad-date"), committedAt: "2026-02-30T12:00:00Z" }]);
    expect(report(input).requests_created).toMatchObject({ value: null, reason: "invalid_source" });
  });
});

describe("Chicago calendar windows", () => {
  it.each([["2026-03-08", 23], ["2026-11-01", 25], ["2026-11-16", 24]] as const)("uses the actual duration of %s", (day, hours) => {
    const dayWindow = chicagoDayWindow(day);
    expect((Date.parse(dayWindow.end) - Date.parse(dayWindow.start)) / 3600000).toBe(hours);
  });
  it("rejects a normalized invalid date", () => {
    expect(() => chicagoDayWindow("2026-02-30")).toThrow("invalid_analytics_day");
  });
});
