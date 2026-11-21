import { z } from "zod";
import { getSupabaseAdmin } from "../../supabase";
import { buildOperationsReport } from "./report";
import type {
  MetricResult, OperationsScope, OperationsSources, OperationsWindow,
  ResponseChannel, ResponsePopulation,
} from "../../../shared/research/analytics/operations";

export const OPERATIONS_SNAPSHOT_RPC = "request_intent_operations_snapshot";
export const OPERATIONS_PROVENANCE_REASON = "fixture_cohort_provenance_unverified";
export const OPERATIONS_SOURCE_KEYS = ["requests", "workflows", "workflowEvents", "outbox", "support"] as const;
type SourceKey = typeof OPERATIONS_SOURCE_KEYS[number];
const instant = z.string().datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)));
const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const observation = z.discriminatedUnion("state", [
  z.object({ state: z.literal("observed"), totalRecords: count, windowRecords: count, latestAt: instant.nullable() }).strict(),
  z.object({ state: z.literal("unavailable"), totalRecords: z.null(), windowRecords: z.null(), latestAt: z.null() }).strict(),
]);
const snapshotSchema = z.object({
  schemaVersion: z.literal(1), observedAt: instant, windowStart: instant, windowEnd: instant,
  sources: z.object({ requests: observation, workflows: observation, workflowEvents: observation,
    outbox: observation, support: observation }).strict(),
}).strict();
export type OperationsSnapshot = z.infer<typeof snapshotSchema>;
export type OperationsProjectScope = Readonly<{ projectId: string; environment: "staging" | "production" }>;
export type OperationsSnapshotRpc = (name: string, args: { p_start_at: string; p_end_at: string }) =>
  PromiseLike<{ data: unknown; error: unknown }>;

export function operationsProjectScope(scope: OperationsProjectScope): OperationsScope {
  if (!/^[a-z0-9][a-z0-9_-]{2,99}$/.test(scope.projectId) || !["staging", "production"].includes(scope.environment)) {
    throw new Error("invalid_operations_project");
  }
  // The calculator's historical key is not an organization partition. Only
  // this configured project namespace is used; no browser scope is accepted.
  return { tenantId: `project:${scope.projectId}`, environment: scope.environment, scopeKind: "project" };
}

export function parseOperationsSnapshot(value: unknown, window: Pick<OperationsWindow, "start" | "end">): OperationsSnapshot {
  const snapshot = snapshotSchema.parse(value);
  if (Date.parse(snapshot.windowStart) !== Date.parse(window.start) || Date.parse(snapshot.windowEnd) !== Date.parse(window.end)) {
    throw new Error("operations_snapshot_window_mismatch");
  }
  for (const source of Object.values(snapshot.sources)) {
    if (source.state === "observed" && (source.windowRecords > source.totalRecords
      || (source.totalRecords === 0) !== (source.latestAt === null)
      || (source.latestAt && Date.parse(source.latestAt) > Date.parse(snapshot.observedAt)))) {
      throw new Error("invalid_operations_coverage");
    }
  }
  return snapshot;
}

export async function readOperationsSnapshot(
  window: Pick<OperationsWindow, "start" | "end">,
  rpc: OperationsSnapshotRpc = (name, args) => getSupabaseAdmin().rpc(name, args),
): Promise<OperationsSnapshot> {
  const { data, error } = await rpc(OPERATIONS_SNAPSHOT_RPC, { p_start_at: window.start, p_end_at: window.end });
  if (error) throw new Error("operations_snapshot_unavailable");
  return parseOperationsSnapshot(data, window);
}

/**
 * Existing request/outbox/support tables carry no reviewed fixture/cohort
 * binding. Observing their counts cannot manufacture operational facts. The
 * live adapter therefore reports that explicit limit through the accepted
 * aggregate contract; it never passes unknown rows as synthetic:false.
 */
export function operationsReportFromSnapshot(
  scope: OperationsProjectScope,
  window: Pick<OperationsWindow, "start" | "end">,
  snapshot: OperationsSnapshot,
  response: Readonly<{ population: ResponsePopulation; channel: ResponseChannel }>,
): readonly MetricResult[] {
  const verified = parseOperationsSnapshot(snapshot, window);
  const unknown = (source?: SourceKey): { freshness: "unavailable" | "not_measured"; observedAt: string } => ({
    freshness: source && verified.sources[source].state === "unavailable" ? "unavailable" : "not_measured",
    observedAt: verified.observedAt,
  });
  const sources: OperationsSources = {
    requests: unknown("requests"), workflows: unknown("workflows"),
    responses: unknown(response.population === "support_case" ? "support" : "workflowEvents"),
    admissions: unknown(), quotes: unknown(), payments: unknown(), deliveries: unknown("outbox"),
    outbox: unknown("outbox"), submitAttempts: unknown(),
    workflowCapabilities: { assignment: false, actionableEpisodes: false },
  };
  const report = buildOperationsReport(operationsProjectScope(scope), { ...window, asOf: verified.observedAt }, sources, response);
  const coverageSource: Partial<Record<MetricResult["metricId"], SourceKey>> = {
    requests_created: "requests", open_workload: "workflows", unassigned_actionable: "workflows",
    oldest_actionable_age: "workflows", first_review_time: "workflows", request_to_quote: "requests",
    first_human_response: response.population === "support_case" ? "support" : "workflowEvents",
    message_delivery: "outbox", outbox_overdue: "outbox",
  };
  return report.map(result => {
    const key = coverageSource[result.metricId];
    const source = key && verified.sources[key];
    return source?.state === "observed" ? {
      ...result,
      source: `${result.source}:${OPERATIONS_PROVENANCE_REASON}`,
      summary: { unclassifiedRecordCount: result.metricId === "requests_created" ? source.windowRecords : source.totalRecords },
    } : result;
  });
}
