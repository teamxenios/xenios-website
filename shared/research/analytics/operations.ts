import type { RequestWorkflowV1 } from "../assisted-order/request-intent-workflow";

export const OPERATIONS_METRIC_VERSIONS = {
  requests_created: 1, open_workload: 1, unassigned_actionable: 1,
  oldest_actionable_age: 1, first_review_time: 1, first_human_response: 2,
  admission_to_request: 2, request_to_quote: 1, captured_payments: 1,
  message_delivery: 2, outbox_overdue: 1, submit_failure_rate: 1,
} as const;
export type OperationsMetricId = keyof typeof OPERATIONS_METRIC_VERSIONS;
export type AnalyticsFreshness = "current" | "stale" | "unavailable" | "not_measured" | "not_configured";
export type ResponsePopulation = "request" | "support_case";
export type ResponseChannel = "portal_published" | "email_provider_accepted";
export type DeliveryCoverage = "recipient_specific" | "recipient_set_only";

/** Server-resolved scope. Adapters must authorize it before loading source facts. */
export interface OperationsScope {
  tenantId: string;
  environment: "production" | "staging";
}
export interface OperationsWindow {
  start: string;
  end: string;
  asOf: string;
}
export interface ScopedFact extends OperationsScope {
  id: string;
  synthetic: boolean;
  ingestedAt: string;
}
export interface RequestFact extends ScopedFact { committedAt: string }
export interface WorkflowFact extends ScopedFact {
  state: RequestWorkflowV1["state"];
  committedAt: string;
  firstReviewAt: string | null;
  /** Supply these only when the authoritative projection supports them. */
  activeOwnerPresent?: boolean;
  actionable?: boolean;
  actionableEpisodeStartedAt?: string;
}
export interface ResponseFact extends ScopedFact {
  /** id identifies the canonical origin, population and channel together. */
  population: ResponsePopulation;
  channel: ResponseChannel;
  originCreatedAt: string;
  firstHumanResponseAt: string | null;
}
export interface AdmissionFact extends ScopedFact {
  validFrom: string;
  validUntil: string;
  firstCatalogAccessAt: string;
  /** A server-linked committed request in this admission, never an email join. */
  firstRequestAt: string | null;
}
export interface QuoteFact extends ScopedFact {
  requestId: string;
  issuedAt: string | null;
  currentStatus: "draft" | "valid" | "expired" | "withdrawn";
}
export interface PaymentFact extends ScopedFact {
  kind: "capture" | "settled_refund";
  occurredAt: string;
  amountMinor: number;
  currency: string;
  test: boolean;
}
export interface DeliveryFact extends ScopedFact {
  /** id is the frozen logical-message plus binding/set unit, not webhook ID. */
  coverage: DeliveryCoverage;
  acceptedAt: string;
  deliveredAt: string | null;
  outcome: "pending" | "bounced" | "suppressed" | "uncertain";
}
export interface OutboxFact extends ScopedFact {
  dueAt: string;
  status: "pending" | "processing" | "failed_retryable" | "failed_permanent" | "sent";
  uncertain: boolean;
}
export interface SubmitAttemptFact extends ScopedFact {
  completedAt: string;
  outcome: "success" | "validation" | "access_denied" | "server_failure" | "application_failure" | "transport_unknown";
}

/** A complete scoped source snapshot, not a truncated page or sampled feed. */
export type AnalyticsSource<T extends ScopedFact> = {
  freshness: "current" | "stale";
  observedAt: string;
  lastSuccessfulAt: string;
  coverageStart: string;
  cohortRevision: number;
  backfillVersion: number;
  records: readonly T[];
} | {
  freshness: "unavailable" | "not_measured" | "not_configured";
  observedAt: string;
};
export interface OperationsSources {
  workflowCapabilities: Readonly<{ assignment: boolean; actionableEpisodes: boolean }>;
  requests: AnalyticsSource<RequestFact>;
  workflows: AnalyticsSource<WorkflowFact>;
  responses: AnalyticsSource<ResponseFact>;
  admissions: AnalyticsSource<AdmissionFact>;
  quotes: AnalyticsSource<QuoteFact>;
  payments: AnalyticsSource<PaymentFact>;
  deliveries: AnalyticsSource<DeliveryFact>;
  outbox: AnalyticsSource<OutboxFact>;
  submitAttempts: AnalyticsSource<SubmitAttemptFact>;
}
export interface MetricResult {
  metricId: OperationsMetricId;
  definitionVersion: number;
  environment: OperationsScope["environment"];
  scope: "authorized_tenant";
  windowStart: string;
  windowEnd: string;
  timezone: "America/Chicago";
  asOf: string;
  evaluatedAt: string | null;
  observedAt: string;
  lastSuccessfulAt: string | null;
  coverageStart: string | null;
  coverageEnd: string | null;
  freshness: AnalyticsFreshness;
  coverage: "complete" | "partial" | null;
  excludedFixtures: number | null;
  sampleSize: number | null;
  source: string;
  populationKind: ResponsePopulation | null;
  channel: ResponseChannel | null;
  evidenceCoverage: DeliveryCoverage | "mixed" | null;
  cohortRevision: number | null;
  backfillVersion: number | null;
  ingestedThrough: string | null;
  quantileMethod: "linear_interpolation_type_7" | null;
  value: number | null;
  unit: "requests" | "seconds" | "fraction" | "currency_minor_units" | "messages";
  reason: "no_eligible_observations" | "source_unavailable" | "not_measured" | "not_configured" | "invalid_source" | "recipient_outcomes_not_individually_observable" | null;
  /** Closed numeric summaries only. No IDs, contact fields or free text. */
  summary: Readonly<Record<string, number | null>>;
}
