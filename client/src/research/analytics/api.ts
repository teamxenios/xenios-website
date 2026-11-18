import { z } from "zod";
import type { Session } from "@supabase/supabase-js";
import { getSupabaseBrowser, isRecoveryAccessToken } from "@/lib/supabaseBrowser";
import { isRecoveryHash } from "@shared/research/recovery";
import {
  OPERATIONS_METRIC_VERSIONS, type MetricResult, type OperationsMetricId,
  type ResponseChannel, type ResponsePopulation,
} from "../../../../shared/research/analytics/operations";

const PATH = "/api/admin/research/early-access/analytics";
const instant = z.string().datetime({ offset: true });
const finite = z.number().finite();
const integer = finite.int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const metricSchema = z.object({
  metricId: z.enum(Object.keys(OPERATIONS_METRIC_VERSIONS) as [OperationsMetricId, ...OperationsMetricId[]]),
  definitionVersion: integer, environment: z.enum(["staging", "production"]), scope: z.enum(["authorized_tenant", "authorized_project"]),
  windowStart: instant, windowEnd: instant, timezone: z.literal("America/Chicago"), asOf: instant,
  evaluatedAt: instant.nullable(), observedAt: instant, lastSuccessfulAt: instant.nullable(),
  coverageStart: instant.nullable(), coverageEnd: instant.nullable(),
  freshness: z.enum(["current", "stale", "unavailable", "not_measured", "not_configured"]),
  coverage: z.enum(["complete", "partial"]).nullable(), excludedFixtures: integer.nullable(), sampleSize: integer.nullable(),
  source: z.string().min(1).max(500), populationKind: z.enum(["request", "support_case"]).nullable(),
  channel: z.enum(["portal_published", "email_provider_accepted"]).nullable(),
  evidenceCoverage: z.enum(["recipient_specific", "recipient_set_only", "mixed"]).nullable(),
  cohortRevision: integer.nullable(), backfillVersion: integer.nullable(), ingestedThrough: instant.nullable(),
  quantileMethod: z.literal("linear_interpolation_type_7").nullable(), value: finite.nonnegative().nullable(),
  unit: z.enum(["requests", "seconds", "fraction", "currency_minor_units", "messages"]),
  reason: z.enum(["no_eligible_observations", "source_unavailable", "not_measured", "not_configured", "invalid_source", "recipient_outcomes_not_individually_observable"]).nullable(),
  summary: z.record(finite.nullable()),
}).strict();

export function parseOperationsMetrics(value: unknown): readonly MetricResult[] | null {
  const result = z.array(metricSchema).length(Object.keys(OPERATIONS_METRIC_VERSIONS).length).safeParse(value);
  if (!result.success || new Set(result.data.map(row => row.metricId)).size !== result.data.length
    || result.data.some(row => row.definitionVersion !== OPERATIONS_METRIC_VERSIONS[row.metricId]
      || row.scope !== result.data[0].scope || row.environment !== result.data[0].environment
      || row.windowStart !== result.data[0].windowStart || row.windowEnd !== result.data[0].windowEnd
      || row.asOf !== result.data[0].asOf)) return null;
  return result.data;
}
type Identity = Readonly<{ key: string; token: string }>;
function identity(session: Session | null): Identity | null {
  const token = session?.access_token;
  if (!token || !session?.user?.id || isRecoveryAccessToken(token)) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(globalThis.atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    const uuid = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
    if (claims.sub !== session.user.id || !uuid.test(claims.sub) || typeof claims.session_id !== "string"
      || !uuid.test(claims.session_id) || typeof claims.exp !== "number" || !Number.isFinite(claims.exp)
      || claims.exp * 1000 <= Date.now()) return null;
    return { key: `${claims.sub}:${claims.session_id}`, token };
  } catch { return null; }
}
function recoveryPage(): boolean {
  return typeof window !== "undefined" && isRecoveryHash(window.location.hash);
}
export type OperationsAnalyticsQuery = Readonly<{
  day: string; responsePopulation?: ResponsePopulation; responseChannel?: ResponseChannel;
}>;
export type OperationsAnalyticsResult =
  | { kind: "ready"; report: readonly MetricResult[] }
  | { kind: "error"; code: "sign_in_required" | "forbidden" | "unavailable" | "invalid_request" | "superseded" };

/** Transport only. No credential store, role inference, or mounted Auth state. */
export function createOperationsAnalyticsClient(fetcher: typeof fetch = fetch) {
  let sequence = 0;
  let active: AbortController | null = null;
  function cancel() { sequence += 1; active?.abort(); active = null; }
  async function load(query: OperationsAnalyticsQuery): Promise<OperationsAnalyticsResult> {
    const generation = ++sequence;
    active?.abort();
    const controller = new AbortController();
    active = controller;
    let unsubscribe: (() => void) | undefined;
    let changed = false;
    try {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(query.day)) return { kind: "error", code: "invalid_request" };
      if (recoveryPage()) return { kind: "error", code: "sign_in_required" };
      const client = await getSupabaseBrowser();
      if (!client) return { kind: "error", code: "sign_in_required" };
      const before = await client.auth.getSession();
      const captured = before.error ? null : identity(before.data.session);
      if (!captured) return { kind: "error", code: "sign_in_required" };
      if (generation !== sequence) return { kind: "error", code: "superseded" };
      const listener = client.auth.onAuthStateChange((event, session) => {
        // Synchronous callback only: never re-enter SDK Auth from this event.
        if (event === "SIGNED_OUT" || event === "PASSWORD_RECOVERY" || identity(session)?.key !== captured.key) changed = true;
      });
      unsubscribe = () => listener.data.subscription.unsubscribe();
      const params = new URLSearchParams({ day: query.day });
      if (query.responsePopulation) params.set("responsePopulation", query.responsePopulation);
      if (query.responseChannel) params.set("responseChannel", query.responseChannel);
      const response = await fetcher(`${PATH}?${params}`, {
        method: "GET", credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", Authorization: `Bearer ${captured.token}` },
      });
      const body: unknown = response.ok ? await response.json() : null;
      const after = await client.auth.getSession();
      if (generation !== sequence || changed || recoveryPage() || after.error || identity(after.data.session)?.key !== captured.key) {
        return { kind: "error", code: "superseded" };
      }
      if (!response.ok) return { kind: "error", code: response.status === 401 ? "sign_in_required"
        : response.status === 403 ? "forbidden" : response.status === 400 ? "invalid_request" : "unavailable" };
      const report = parseOperationsMetrics(body);
      return report?.every(row => row.scope === "authorized_project")
        ? { kind: "ready", report } : { kind: "error", code: "unavailable" };
    } catch {
      return { kind: "error", code: generation !== sequence || changed || controller.signal.aborted ? "superseded" : "unavailable" };
    } finally {
      unsubscribe?.();
      if (active === controller) active = null;
    }
  }
  return { load, cancel };
}
