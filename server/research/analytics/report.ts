import {
  OPERATIONS_METRIC_VERSIONS,
  type AnalyticsSource, type MetricResult, type OperationsMetricId, type OperationsScope,
  type OperationsSources, type OperationsWindow, type ResponseChannel, type ResponsePopulation,
  type ScopedFact,
} from "../../../shared/research/analytics/operations";

type Prepared<T extends ScopedFact> = {
  name: string;
  source: AnalyticsSource<T>;
  rows: readonly T[];
  excluded: number;
  invalid: boolean;
};
type Calculation = Pick<MetricResult, "value" | "sampleSize" | "summary"> & {
  reason?: MetricResult["reason"];
};

function instant(value: string): number {
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-\d\dT(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) throw new Error("invalid_analytics_instant");
  const time = Date.parse(value);
  if (!Number.isFinite(time) || new Date(`${value.slice(0, 10)}T00:00:00Z`).toISOString().slice(0, 10) !== value.slice(0, 10)) throw new Error("invalid_analytics_instant");
  return time;
}
function prepare<T extends ScopedFact>(name: string, source: AnalyticsSource<T>, scope: OperationsScope): Prepared<T> {
  if (!("records" in source)) return { name, source, rows: [], excluded: 0, invalid: false };
  const partition = source.records.filter(row => row.tenantId === scope.tenantId && row.environment === scope.environment);
  const eligible = partition.filter(row => (row.scopeKind ?? "tenant") === (scope.scopeKind ?? "tenant"));
  const unique = new Map<string, T>();
  let invalid = eligible.length !== partition.length;
  for (const row of eligible.filter(row => !row.synthetic)) {
    if (!row.id || row.synthetic !== false) invalid = true;
    try {
      if (instant(row.ingestedAt) > instant(source.lastSuccessfulAt)) invalid = true;
    } catch { invalid = true; }
    const prior = unique.get(row.id);
    // These minimized fact contracts are flat. Conflicting duplicate facts
    // must be reconciled by the source adapter, not chosen by arrival order.
    const canonical = (value: T) => {
      const normalized = { ...value, scopeKind: value.scopeKind ?? "tenant" };
      return JSON.stringify(normalized, Object.keys(normalized).sort());
    };
    if (prior && canonical(prior) !== canonical(row)) invalid = true;
    unique.set(row.id, row);
  }
  return { name, source, rows: [...unique.values()], excluded: new Set(eligible.filter(row => row.synthetic).map(row => row.id)).size, invalid };
}
function nonnegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("invalid_analytics_source");
  return value;
}
function quantiles(seconds: readonly number[]): Readonly<{ median: number | null; p90: number | null }> {
  if (!seconds.length) return { median: null, p90: null };
  const sorted = [...seconds].sort((a, b) => a - b);
  const percentile = (fraction: number) => {
    const index = (sorted.length - 1) * fraction;
    const lower = Math.floor(index);
    return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
  };
  return { median: percentile(0.5), p90: percentile(0.9) };
}

/**
 * Pure server-side calculations from complete, authorized source snapshots.
 * The caller supplies no browser facts. This function loads no data and grants
 * no access. Route authorization, source completeness and fixture marking are
 * required adapter responsibilities before this report can be mounted.
 */
export function buildOperationsReport(
  scope: OperationsScope,
  window: OperationsWindow,
  sources: OperationsSources,
  response: Readonly<{ population: ResponsePopulation; channel: ResponseChannel }>,
): readonly MetricResult[] {
  const start = instant(window.start), end = instant(window.end), asOf = instant(window.asOf);
  if (!scope.tenantId || !["production", "staging"].includes(scope.environment)
      || (scope.scopeKind !== undefined && !["tenant", "project"].includes(scope.scopeKind)) || start >= end ||
      !["request", "support_case"].includes(response.population) ||
      !["portal_published", "email_provider_accepted"].includes(response.channel)) throw new Error("invalid_analytics_scope");
  const inWindow = (value: string) => instant(value) >= start && instant(value) < end;
  const requests = prepare("canonical_request", sources.requests, scope);
  const workflows = prepare("authorized_workflow_projection", sources.workflows, scope);
  const responses = prepare("authorized_human_response", sources.responses, scope);
  const admissions = prepare("trusted_admission_catalog_join", sources.admissions, scope);
  const quotes = prepare("authorized_quote_issue", sources.quotes, scope);
  const payments = prepare("verified_payment_provider_ledger", sources.payments, scope);
  const deliveries = prepare("frozen_recipient_evidence", sources.deliveries, scope);
  const outbox = prepare("notification_outbox", sources.outbox, scope);
  const attempts = prepare("unsampled_submit_attempts", sources.submitAttempts, scope);

  function metric(id: OperationsMetricId, unit: MetricResult["unit"], inputs: readonly Prepared<ScopedFact>[], calculate: (evaluatedAt: number) => Calculation): MetricResult {
    const observed = inputs.map(input => input.source.observedAt);
    const result: MetricResult = {
      metricId: id, definitionVersion: OPERATIONS_METRIC_VERSIONS[id], environment: scope.environment,
      scope: scope.scopeKind === "project" ? "authorized_project" : "authorized_tenant", windowStart: window.start, windowEnd: window.end, timezone: "America/Chicago",
      asOf: window.asOf, evaluatedAt: null, observedAt: window.asOf, lastSuccessfulAt: null, coverageStart: null, coverageEnd: null,
      freshness: "current", coverage: null, excludedFixtures: null, sampleSize: null,
      source: inputs.map(input => input.name).join(" + "), populationKind: null, channel: null,
      evidenceCoverage: null, cohortRevision: null, backfillVersion: null, ingestedThrough: null,
      quantileMethod: null, value: null, reason: null, summary: {}, unit,
    };
    try {
      if (observed.some(value => instant(value) > asOf)) throw new Error("invalid_analytics_source");
      result.observedAt = observed.reduce((a, b) => instant(a) > instant(b) ? a : b);
      const missing = inputs.find(input => !("records" in input.source));
      if (missing) {
        result.freshness = missing.source.freshness;
        result.reason = missing.source.freshness === "unavailable" ? "source_unavailable" : missing.source.freshness as "not_measured" | "not_configured";
        return result;
      }
      const snapshots = inputs.map(input => {
        if (!("records" in input.source)) throw new Error("invalid_analytics_source");
        const source = input.source;
        if (input.invalid || instant(source.observedAt) > asOf || instant(source.lastSuccessfulAt) > instant(source.observedAt) ||
            !Number.isSafeInteger(source.cohortRevision) || source.cohortRevision < 1 ||
            !Number.isSafeInteger(source.backfillVersion) || source.backfillVersion < 0) throw new Error("invalid_analytics_source");
        instant(source.coverageStart);
        return source;
      });
      if (new Set(snapshots.map(source => source.cohortRevision)).size !== 1) throw new Error("invalid_analytics_source");
      result.lastSuccessfulAt = snapshots.map(source => source.lastSuccessfulAt).reduce((a, b) => instant(a) < instant(b) ? a : b);
      result.coverageStart = snapshots.map(source => source.coverageStart).reduce((a, b) => instant(a) > instant(b) ? a : b);
      result.cohortRevision = snapshots[0].cohortRevision;
      result.backfillVersion = Math.max(...snapshots.map(source => source.backfillVersion));
      result.ingestedThrough = result.lastSuccessfulAt;
      result.freshness = snapshots.some(source => source.freshness === "stale") ? "stale" : "current";
      if (result.freshness === "stale" && new Set(snapshots.map(source => instant(source.lastSuccessfulAt))).size !== 1) {
        return { ...result, freshness: "unavailable", reason: "source_unavailable" };
      }
      const evaluatedAt = result.freshness === "stale" ? instant(result.lastSuccessfulAt) : asOf;
      if (evaluatedAt < start || instant(result.coverageStart) >= end) return { ...result, freshness: "unavailable", reason: "source_unavailable" };
      result.evaluatedAt = new Date(evaluatedAt).toISOString();
      result.coverageEnd = new Date(Math.min(end, evaluatedAt)).toISOString();
      result.coverage = instant(result.coverageStart) > start || evaluatedAt < end ? "partial" : "complete";
      result.excludedFixtures = inputs.reduce((count, input) => count + input.excluded, 0);
      const calculation = calculate(evaluatedAt);
      Object.assign(result, calculation, { reason: calculation.reason ?? null });
      if (calculation.reason === "not_measured") result.freshness = "not_measured";
      if (result.value !== null) nonnegative(result.value);
      for (const value of Object.values(result.summary)) if (value !== null && !Number.isFinite(value)) throw new Error("invalid_analytics_source");
      return result;
    } catch {
      return { ...result, freshness: "unavailable", reason: "invalid_source", value: null, sampleSize: null, summary: {} };
    }
  }
  const created = metric("requests_created", "requests", [requests], evaluatedAt => {
    const cohort = requests.rows.filter(row => inWindow(row.committedAt) && instant(row.committedAt) <= evaluatedAt);
    return { value: cohort.length, sampleSize: cohort.length, summary: {} };
  });
  const workload = metric("open_workload", "requests", [workflows], evaluatedAt => {
    if (workflows.rows.some(row => !["queued", "reviewing"].includes(row.state))) throw new Error("invalid_analytics_source");
    const rows = workflows.rows.filter(row => instant(row.committedAt) <= evaluatedAt);
    return { value: rows.length, sampleSize: rows.length, summary: {
      queued: rows.filter(row => row.state === "queued").length,
      reviewing: rows.filter(row => row.state === "reviewing").length,
    } };
  });
  const unassigned = metric("unassigned_actionable", "requests", [workflows], evaluatedAt => {
    if (!sources.workflowCapabilities.assignment || workflows.rows.some(row => row.actionable === undefined || row.activeOwnerPresent === undefined)) {
      return { value: null, sampleSize: null, summary: {}, reason: "not_measured" };
    }
    const rows = workflows.rows.filter(row => instant(row.committedAt) <= evaluatedAt && row.actionable);
    return { value: rows.filter(row => !row.activeOwnerPresent).length, sampleSize: rows.length, summary: {} };
  });
  const age = metric("oldest_actionable_age", "seconds", [workflows], (evaluatedAt): Calculation => {
    if (!sources.workflowCapabilities.actionableEpisodes || workflows.rows.some(row => row.actionable === undefined || (row.actionable && !row.actionableEpisodeStartedAt))) {
      return { value: null, sampleSize: null, summary: {}, reason: "not_measured" };
    }
    const rows = workflows.rows.filter(row => row.actionable && instant(row.committedAt) <= evaluatedAt);
    const ages = rows.map(row => {
      const episode = instant(row.actionableEpisodeStartedAt!);
      if (episode < instant(row.committedAt)) throw new Error("invalid_analytics_source");
      return nonnegative((evaluatedAt - episode) / 1000);
    });
    return { value: ages.length ? Math.max(...ages) : null, sampleSize: rows.length,
      reason: rows.length ? null : "no_eligible_observations",
      summary: { oldestOriginalSubmissionSeconds: rows.length ? Math.max(...rows.map(row => (evaluatedAt - instant(row.committedAt)) / 1000)) : null } };
  });
  const review = metric("first_review_time", "seconds", [workflows], evaluatedAt => {
    const cohort = workflows.rows.filter(row => inWindow(row.committedAt) && instant(row.committedAt) <= evaluatedAt);
    const samples = cohort.filter(row => row.firstReviewAt !== null && instant(row.firstReviewAt) <= evaluatedAt)
      .map(row => nonnegative((instant(row.firstReviewAt!) - instant(row.committedAt)) / 1000));
    const distribution = quantiles(samples);
    return { value: distribution.median, sampleSize: samples.length,
      reason: samples.length ? null : "no_eligible_observations",
      summary: { ...distribution, cohort: cohort.length, stillUnreviewed: cohort.length - samples.length } };
  });
  review.quantileMethod = "linear_interpolation_type_7";
  const human = metric("first_human_response", "seconds", [responses], evaluatedAt => {
    const cohort = responses.rows.filter(row => row.population === response.population && row.channel === response.channel && inWindow(row.originCreatedAt) && instant(row.originCreatedAt) <= evaluatedAt);
    const samples = cohort.filter(row => row.firstHumanResponseAt !== null && instant(row.firstHumanResponseAt) <= evaluatedAt)
      .map(row => nonnegative((instant(row.firstHumanResponseAt!) - instant(row.originCreatedAt)) / 1000));
    const distribution = quantiles(samples);
    return { value: distribution.median, sampleSize: samples.length,
      reason: samples.length ? null : "no_eligible_observations",
      summary: { ...distribution, cohort: cohort.length, awaitingResponse: cohort.length - samples.length } };
  });
  human.populationKind = response.population;
  human.channel = response.channel;
  human.quantileMethod = "linear_interpolation_type_7";
  const admission = metric("admission_to_request", "fraction", [admissions], evaluatedAt => {
    const cohort = admissions.rows.filter(row => {
      const access = instant(row.firstCatalogAccessAt), from = instant(row.validFrom), until = instant(row.validUntil);
      if (until <= from || access < from || access >= until) throw new Error("invalid_analytics_source");
      return inWindow(row.firstCatalogAccessAt) && access <= evaluatedAt;
    });
    const matured = cohort.filter(row => instant(row.validUntil) <= evaluatedAt);
    const converted = (row: typeof cohort[number]) => row.firstRequestAt !== null && instant(row.firstRequestAt) >= instant(row.firstCatalogAccessAt)
      && instant(row.firstRequestAt) < instant(row.validUntil) && instant(row.firstRequestAt) <= evaluatedAt;
    const numerator = matured.filter(converted).length;
    return { value: matured.length ? numerator / matured.length : null, sampleSize: matured.length,
      reason: matured.length ? null : "no_eligible_observations",
      summary: { numerator, denominator: matured.length, immatureAdmissions: cohort.length - matured.length,
        immatureConversions: cohort.filter(row => instant(row.validUntil) > evaluatedAt && converted(row)).length } };
  });
  const quoted = metric("request_to_quote", "fraction", [requests, quotes], evaluatedAt => {
    const cohort = requests.rows.filter(row => inWindow(row.committedAt) && instant(row.committedAt) <= evaluatedAt);
    const cohortIds = new Set(cohort.map(row => row.id));
    const issued = quotes.rows.filter(row => cohortIds.has(row.requestId) && row.issuedAt !== null && instant(row.issuedAt) <= evaluatedAt);
    const numerator = cohort.filter(row => issued.some(quote => quote.requestId === row.id && instant(quote.issuedAt!) >= instant(row.committedAt))).length;
    return { value: cohort.length ? numerator / cohort.length : null, sampleSize: cohort.length,
      reason: cohort.length ? null : "no_eligible_observations",
      summary: { numerator, denominator: cohort.length, validQuotes: issued.filter(row => row.currentStatus === "valid").length,
        expiredQuotes: issued.filter(row => row.currentStatus === "expired").length, withdrawnQuotes: issued.filter(row => row.currentStatus === "withdrawn").length } };
  });
  const captured = metric("captured_payments", "currency_minor_units", [payments], evaluatedAt => {
    const rows = payments.rows.filter(row => !row.test && inWindow(row.occurredAt) && instant(row.occurredAt) <= evaluatedAt);
    const summary: Record<string, number> = {};
    for (const row of rows) {
      if (!/^[A-Z]{3}$/.test(row.currency) || !Number.isSafeInteger(row.amountMinor)) throw new Error("invalid_analytics_source");
      nonnegative(row.amountMinor);
      const key = `${row.currency}_${row.kind}`;
      summary[key] = (summary[key] ?? 0) + row.amountMinor;
      if (!Number.isSafeInteger(summary[key])) throw new Error("invalid_analytics_source");
    }
    for (const currency of new Set(rows.map(row => row.currency))) {
      summary[`${currency}_net_cash_movement`] = (summary[`${currency}_capture`] ?? 0) - (summary[`${currency}_settled_refund`] ?? 0);
    }
    return { value: null, sampleSize: rows.length, summary };
  });
  const delivery = metric("message_delivery", "fraction", [deliveries], evaluatedAt => {
    const cohort = deliveries.rows.filter(row => inWindow(row.acceptedAt) && instant(row.acceptedAt) <= evaluatedAt);
    const summary: Record<string, number | null> = {};
    for (const coverage of ["recipient_specific", "recipient_set_only"] as const) {
      const units = cohort.filter(row => row.coverage === coverage);
      const hasDelivery = (row: typeof units[number]) => row.deliveredAt !== null && instant(row.deliveredAt) <= evaluatedAt && instant(row.deliveredAt) >= instant(row.acceptedAt);
      const delivered = units.filter(hasDelivery).length;
      summary[`${coverage}_delivered`] = delivered;
      summary[`${coverage}_denominator`] = units.length;
      summary[`${coverage}_rate`] = units.length ? delivered / units.length : null;
      for (const outcome of ["pending", "bounced", "suppressed", "uncertain"] as const) {
        summary[`${coverage}_${outcome}`] = units.filter(row => !hasDelivery(row) && row.outcome === outcome).length;
      }
    }
    return { value: summary.recipient_specific_rate, sampleSize: cohort.length,
      reason: summary.recipient_specific_denominator ? null : cohort.length ? "recipient_outcomes_not_individually_observable" : "no_eligible_observations", summary };
  });
  if ((delivery.freshness === "current" || delivery.freshness === "stale") && "records" in deliveries.source) {
    const coverage = new Set(deliveries.rows.filter(row => inWindow(row.acceptedAt) && instant(row.acceptedAt) <= instant(delivery.evaluatedAt!)).map(row => row.coverage));
    delivery.evidenceCoverage = coverage.size > 1 ? "mixed" : coverage.values().next().value ?? null;
  }
  const overdue = metric("outbox_overdue", "messages", [outbox], evaluatedAt => {
    const rows = outbox.rows.filter(row => row.status !== "sent" && instant(row.dueAt) <= evaluatedAt);
    const due = rows.filter(row => row.status !== "failed_permanent" && !row.uncertain);
    return { value: due.length, sampleSize: due.length, summary: {
      oldestDueSeconds: due.length ? Math.max(...due.map(row => (evaluatedAt - instant(row.dueAt)) / 1000)) : null,
      permanentFailures: rows.filter(row => row.status === "failed_permanent").length,
      uncertain: rows.filter(row => row.uncertain).length,
    } };
  });
  const failures = metric("submit_failure_rate", "fraction", [attempts], evaluatedAt => {
    const rows = attempts.rows.filter(row => inWindow(row.completedAt) && instant(row.completedAt) <= evaluatedAt);
    const numerator = rows.filter(row => row.outcome === "server_failure" || row.outcome === "application_failure").length;
    return { value: rows.length ? numerator / rows.length : null, sampleSize: rows.length,
      reason: rows.length ? null : "no_eligible_observations", summary: {
        numerator, denominator: rows.length, validation: rows.filter(row => row.outcome === "validation").length,
        accessDenied: rows.filter(row => row.outcome === "access_denied").length,
        transportUnknown: rows.filter(row => row.outcome === "transport_unknown").length,
      } };
  });
  return [created, workload, unassigned, age, review, human, admission, quoted, captured, delivery, overdue, failures];
}
