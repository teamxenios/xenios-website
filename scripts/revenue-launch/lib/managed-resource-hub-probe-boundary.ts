import { z } from "zod";
import {
  ACTOR_NAMES,
  EXPECTED_WRITES,
  HUB_BUCKET,
  HUB_TABLES,
  ManagedHubBoundaryError,
  assertStagingTarget,
  managedHubPlanSchema,
  sha256,
  validateManagedHubPlan,
  type ManagedHubPlan,
} from "./managed-resource-hub-boundary";

// ---------------------------------------------------------------------------
// Probe extension of the managed Hub boundary. The foundation boundary owns
// exactly one resource/version/object and stops on any non-2xx write, which is
// correct for the happy path and is precisely why it cannot prove the races:
// an upload race NEEDS the loser's version insert to reach Postgres and come
// back 23505, and a concurrent review NEEDS the loser's conditional PATCH to
// reach Postgres and come back with zero rows. This boundary lets exactly
// those two provider outcomes through as classified, capped, journaled
// conflicts. Everything else keeps the foundation's discipline: staging-only
// origin, no DELETE, no Auth writes, no rows outside this run's owned ids, and
// a durable write-ahead receipt before every request.
// ---------------------------------------------------------------------------

export const PROBE_RUN_ID = /^hubqa-[a-z0-9-]{8,40}-probes$/;

/** Attempts, not successes: `versions` counts both inserts, one of which must be the 23505 loser. */
export const PROBE_EXPECTED_WRITES = Object.freeze({
  objects: 2,
  resources: 2,
  versions: 2,
  versionConflicts: 1,
  reviews: 7,
  reviewConflicts: 2,
  publications: 1,
  withdrawals: 1,
  deliveries: 2,
});

/** Every reason/summary string a probe may write; the boundary refuses any other text. */
export function probeText(runId: string) {
  return {
    approvalA: `Probe approval A ${runId}`,
    approvalB: `Probe approval B ${runId}`,
    casMs: `Probe CAS ms ${runId}`,
    casUs: `Probe CAS us ${runId}`,
    casStale: `Probe CAS stale ${runId}`,
    withdraw: `Probe complete ${runId}`,
  } as const;
}

export const managedHubProbePlanSchema = managedHubPlanSchema
  .omit({ runId: true, expectedInitialHubRows: true, expectedWrites: true })
  .extend({
    kind: z.literal("managed-hub-probes"),
    runId: z.string().regex(PROBE_RUN_ID),
    /** The foundation run whose rows (and any other retained rows) this probe must leave byte-identical. */
    foundationRunId: z.string().regex(/^hubqa-[a-z0-9-]{8,48}$/).nullable(),
    retainedRows: z.object({ preserve: z.literal(true), maxRowsPerTable: z.literal(100) }).strict(),
    expectedWrites: z
      .object({
        objects: z.literal(2),
        resources: z.literal(2),
        versions: z.literal(2),
        versionConflicts: z.literal(1),
        reviews: z.literal(7),
        reviewConflicts: z.literal(2),
        publications: z.literal(1),
        withdrawals: z.literal(1),
        deliveries: z.literal(2),
      })
      .strict(),
  })
  .strict();
export type ManagedHubProbePlan = z.infer<typeof managedHubProbePlanSchema>;

function refuse(code: string): never {
  throw new ManagedHubBoundaryError(code);
}

/** The probe plan projected onto the foundation plan shape, so the foundation's actor/audience/fixture rules apply unchanged. */
export function toManagedPlan(plan: ManagedHubProbePlan): ManagedHubPlan {
  const { kind: _kind, foundationRunId: _foundation, retainedRows: _retained, expectedWrites: _writes, ...rest } = plan;
  return validateManagedHubPlan({ ...rest, expectedInitialHubRows: 0, expectedWrites: EXPECTED_WRITES });
}

export function validateManagedHubProbePlan(raw: unknown): { plan: ManagedHubProbePlan; managed: ManagedHubPlan } {
  const parsed = managedHubProbePlanSchema.safeParse(raw);
  if (!parsed.success) refuse("probe_plan_schema");
  const plan = parsed.data;
  const managed = toManagedPlan(plan);
  if (plan.foundationRunId === plan.runId) refuse("probe_run_identity");
  return { plan, managed };
}

export interface ProbeEvent {
  sequence: number;
  operation: string;
  phase: "attempt" | "response";
  write: boolean;
  status?: number;
  /** A provider outcome this probe deliberately provokes (23505 loser, zero-row CAS). */
  expectedConflict?: boolean;
  resourceId?: string;
  versionId?: string;
  objectKey?: string;
  /** Predicate kinds of a conditional PATCH; values are never journaled. */
  predicates?: Record<string, "is" | "eq">;
}

export interface OwnedProbeScope {
  /** Owned (resourceId, versionId, objectKey) triples in upload order; at most two. */
  uploads: { resourceId: string; versionId: string; objectKey: string }[];
  winnerVersionId: string | null;
  winnerResourceId: string | null;
}

type Json = Record<string, unknown>;
type HubTable = (typeof HUB_TABLES)[number];
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const storagePath = new RegExp(`^/storage/v1/object/${HUB_BUCKET}/(resource-library/(${uuid})/v1-(${uuid})\\.pdf)$`);
const PROVENANCE_COLUMNS = ["reviewed_at", "reviewed_by_admin", "review_reason"] as const;

export interface ProbeBoundaryOptions {
  /** How long a gated write may wait for its second concurrent read before the run fails closed. */
  gateMs?: number;
}

/** A one-shot barrier: opens after `needed` observations, or fails the run closed after `gateMs`. */
function createGate(needed: number) {
  let seen = 0;
  let open: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    open = resolve;
  });
  return {
    observe() {
      if (++seen >= needed) open();
    },
    seen: () => seen,
    async wait(gateMs: number, code: string) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new ManagedHubBoundaryError(code)), gateMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The SDK's only network outlet during a probe run. Not a general proxy.
 * `retain()` teaches it the ids that already exist in staging, so reads that
 * walk retained rows (admin list, published list) stay allowed while writes
 * never can touch them. Two barriers make the races real rather than lucky:
 * every version insert waits for the second upload-key lookup, and, once
 * `armReviewGate()` is called, the next review PATCHes wait for two reads of
 * the winner version.
 */
export function createManagedHubProbeBoundary(
  plan: ManagedHubProbePlan,
  upstream: typeof fetch,
  record: (event: ProbeEvent) => void,
  options: ProbeBoundaryOptions = {},
) {
  assertStagingTarget(plan.target.projectRef, plan.target.origin);
  const text = probeText(plan.runId);
  const gateMs = options.gateMs ?? 20_000;
  const scope: OwnedProbeScope = { uploads: [], winnerVersionId: null, winnerResourceId: null };
  const retained: Record<HubTable, Set<string>> = {
    [HUB_TABLES[0]]: new Set(),
    [HUB_TABLES[1]]: new Set(),
    [HUB_TABLES[2]]: new Set(),
  };
  const counts: Record<string, number> = {};
  const insertedResources = new Set<string>();
  const raceGate = createGate(2);
  let reviewGate: ReturnType<typeof createGate> | null = null;
  let sequence = 0;
  let writesEnabled = false;
  let stopped = false;
  const bump = (name: string, max: number) => {
    counts[name] = (counts[name] ?? 0) + 1;
    if (counts[name] > max) refuse("request_cap");
  };
  const equals = (value: unknown, expected: unknown) => JSON.stringify(value) === JSON.stringify(expected);
  const fields = (row: Json, allowed: readonly string[]) => Object.keys(row).every((key) => allowed.includes(key));
  const ownedResourceIds = () => scope.uploads.map((u) => u.resourceId);
  const ownedVersionIds = () => scope.uploads.map((u) => u.versionId);
  const knownIds = (table: HubTable) =>
    new Set([...retained[table], ...(table === HUB_TABLES[0] ? ownedResourceIds() : table === HUB_TABLES[1] ? ownedVersionIds() : [])]);
  const adminEmail = plan.actors.admin.email.toLowerCase();
  const partnerMembers = [plan.actors.inside.memberId, plan.actors.outside.memberId, plan.actors.blocked.memberId];
  const knownReasons = new Set<string>([text.approvalA, text.approvalB]);
  const knownSummaries = new Set<string>([text.casMs, text.casUs, text.casStale]);
  const jsonBody = async (request: Request): Promise<Json> => {
    if (Number(request.headers.get("content-length") ?? 0) > 16384) refuse("json_size");
    const body = await request.clone().text();
    if (Buffer.byteLength(body) > 16384) refuse("json_size");
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      refuse("json_body");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) refuse("single_row_only");
    return parsed as Json;
  };
  const stop = (code: string): never => {
    stopped = true;
    refuse(code);
  };

  const boundedFetch: typeof fetch = async (input, init) => {
    if (stopped) refuse("run_stopped");
    const req = new Request(input, init);
    const url = new URL(req.url);
    const method = req.method;
    const write = method !== "GET" && method !== "HEAD";
    let operation = "";
    let conflictCounter: { name: string; max: number } | null = null;
    let versionInsert = false;
    let winnerVersionRead = false;
    try {
      if (url.origin !== plan.target.origin || url.username || url.password || url.hash || /%2f|%5c|%00/i.test(url.pathname)) refuse("request_origin_or_path");
      if (!["GET", "POST", "PATCH"].includes(method)) refuse("method");
      if (write && !writesEnabled) refuse("preflight_is_read_only");
      bump("all", 320);
      const detail: Partial<ProbeEvent> = {};
      if (url.pathname === "/auth/v1/user" && method === "GET" && !url.search) {
        operation = "auth_user_read";
        bump(operation, 80);
      } else if (url.pathname === "/auth/v1/admin/users" && method === "GET" && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "1" && [...url.searchParams].length === 2) {
        operation = "service_key_check";
        bump(operation, 2);
      } else if (url.pathname === `/storage/v1/bucket/${HUB_BUCKET}` && method === "GET" && !url.search) {
        operation = "private_bucket_read";
        bump(operation, 2);
      } else if (url.pathname.startsWith("/storage/v1/object/")) {
        const match = storagePath.exec(url.pathname.replace("/object/authenticated/", "/object/"));
        if (!match || url.search) refuse("storage_path");
        const objectKey = match[1]!;
        const resourceId = match[2]!;
        const versionId = match[3]!;
        if (method === "POST") {
          operation = "objects";
          bump(operation, PROBE_EXPECTED_WRITES.objects);
          if (req.headers.get("x-upsert") !== "false" || req.headers.get("content-type") !== "application/pdf") refuse("storage_immutable");
          if (scope.uploads.some((u) => u.resourceId === resourceId || u.versionId === versionId || u.objectKey === objectKey)) refuse("storage_scope");
          if (knownIds(HUB_TABLES[0]).has(resourceId) || knownIds(HUB_TABLES[1]).has(versionId)) refuse("storage_scope");
          const bytes = new Uint8Array(await req.clone().arrayBuffer());
          if (bytes.length !== plan.pdf.sizeBytes || sha256(bytes) !== plan.pdf.sha256) refuse("storage_bytes");
          scope.uploads.push({ resourceId, versionId, objectKey });
          Object.assign(detail, { resourceId, versionId, objectKey });
        } else if (method === "GET" && scope.uploads.some((u) => u.objectKey === objectKey)) {
          operation = "object_read";
          bump(operation, 8);
          detail.objectKey = objectKey;
        } else refuse("storage_scope");
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice("/rest/v1/".length);
        const row = write ? await jsonBody(req) : {};
        if (url.searchParams.has("select") && !/^[a-z_*, ]+$/.test(url.searchParams.get("select") ?? "")) refuse("projection_scope");
        if (url.searchParams.has("order") && !["created_at.asc", "version_number.asc", "published_at.desc", "requested_at.desc"].includes(url.searchParams.get("order") ?? "")) refuse("order_scope");
        if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) refuse("duplicate_query_key");
        if (method === "GET" && ["research_members", "research_partners"].includes(table)) {
          const key = table === "research_members" ? "auth_user_id" : "member_id";
          const allowed = ACTOR_NAMES.map((name) => (table === "research_members" ? plan.actors[name].authUserId : plan.actors[name].memberId)).filter(Boolean);
          if (!allowed.some((id) => url.searchParams.get(key) === `eq.${id}`) || [...url.searchParams.keys()].some((name) => ![key, "select", "limit"].includes(name))) refuse("identity_read_scope");
          url.searchParams.set("limit", "2");
          operation = "identity_row_read";
        } else if (method === "GET" && (HUB_TABLES as readonly string[]).includes(table)) {
          const hubTable = table as HubTable;
          if ([...url.searchParams.keys()].some((name) => !["select", "limit", "order", "id", "resource_id", "state", "upload_idempotency_key"].includes(name))) refuse("hub_read_query");
          const bound = (name: string, ids: Set<string>) => {
            if (!url.searchParams.has(name)) return true;
            const value = url.searchParams.get(name) ?? "";
            return value.startsWith("eq.") && ids.has(value.slice(3));
          };
          if (!bound("id", knownIds(hubTable)) || !bound("resource_id", knownIds(HUB_TABLES[0]))) refuse("hub_read_scope");
          if (url.searchParams.has("upload_idempotency_key") && url.searchParams.get("upload_idempotency_key") !== `eq.${plan.runId}`) refuse("hub_read_scope");
          if (url.searchParams.has("state") && url.searchParams.get("state") !== "eq.published") refuse("hub_read_state");
          url.searchParams.set("limit", "100");
          if (hubTable === HUB_TABLES[1] && url.searchParams.has("upload_idempotency_key")) {
            operation = "upload_key_lookup";
            bump(operation, 12);
          } else {
            operation = "hub_row_read";
            winnerVersionRead = hubTable === HUB_TABLES[1] && !!scope.winnerVersionId && url.searchParams.get("id") === `eq.${scope.winnerVersionId}`;
          }
        } else if (table === HUB_TABLES[0] && method === "POST") {
          const resourceId = String(row.id);
          if (url.search || !ownedResourceIds().includes(resourceId) || insertedResources.has(resourceId) || row.title !== plan.pdf.metadata.title || row.purpose !== plan.pdf.metadata.purpose || row.kind !== "pdf" || row.created_by_admin !== adminEmail || row.current_published_version_id !== null || !fields(row, ["id", "title", "purpose", "kind", "created_at", "created_by_admin", "current_published_version_id"])) refuse("resource_insert_scope");
          operation = "resources";
          bump(operation, PROBE_EXPECTED_WRITES.resources);
          insertedResources.add(resourceId);
          detail.resourceId = resourceId;
        } else if (table === HUB_TABLES[1] && method === "POST") {
          const upload = scope.uploads.find((u) => u.versionId === row.id);
          if (url.search || !upload || row.resource_id !== upload.resourceId || row.storage_key !== upload.objectKey || row.version_number !== 1 || row.state !== "draft" || row.sha256 !== plan.pdf.sha256 || row.size_bytes !== plan.pdf.sizeBytes || row.original_filename !== plan.pdf.metadata.originalFilename || row.upload_idempotency_key !== plan.runId || row.uploaded_by_admin !== adminEmail || row.content_type !== "application/pdf" || row.usage_policy !== "training" || !equals(row.audience, plan.pdf.metadata.audience) || row.validation_ok !== true || !equals(row.validation_reasons, []) || row.supersedes_version_id !== null || !fields(row, ["id", "resource_id", "version_number", "state", "usage_policy", "audience", "size_bytes", "sha256", "original_filename", "content_type", "storage_key", "validation_ok", "validation_reasons", "uploaded_at", "uploaded_by_admin", "supersedes_version_id", "change_summary", "upload_idempotency_key"])) refuse("version_insert_scope");
          operation = "versions";
          bump(operation, PROBE_EXPECTED_WRITES.versions);
          versionInsert = true;
          conflictCounter = { name: "versionConflicts", max: PROBE_EXPECTED_WRITES.versionConflicts };
          Object.assign(detail, { resourceId: upload.resourceId, versionId: upload.versionId });
        } else if (table === HUB_TABLES[1] && method === "PATCH") {
          const versionId = (url.searchParams.get("id") ?? "").slice(3);
          if (!url.searchParams.get("id")?.startsWith("eq.") || !ownedVersionIds().includes(versionId)) refuse("review_cas_scope");
          if (!["eq.draft", "eq.in_review"].includes(url.searchParams.get("state") ?? "")) refuse("review_cas_scope");
          if ([...url.searchParams.keys()].some((key) => !["id", "state", ...PROVENANCE_COLUMNS, "select"].includes(key))) refuse("review_cas_scope");
          const predicates: Record<string, "is" | "eq"> = {};
          for (const column of PROVENANCE_COLUMNS) {
            const value = url.searchParams.get(column);
            if (value === "is.null") predicates[column] = "is";
            else if (value?.startsWith("eq.")) {
              const expected = value.slice(3);
              if (column === "reviewed_at" && !Number.isFinite(Date.parse(expected))) refuse("review_cas_scope");
              if (column === "reviewed_by_admin" && expected !== adminEmail) refuse("review_cas_scope");
              if (column === "review_reason" && !knownReasons.has(expected)) refuse("review_cas_scope");
              predicates[column] = "eq";
            } else refuse("review_cas_scope");
          }
          if (Object.keys(row).length === 0 || !fields(row, ["state", ...PROVENANCE_COLUMNS, "change_summary"])) refuse("review_patch_scope");
          if (row.state !== undefined && row.state !== "in_review") refuse("review_patch_scope");
          if (row.reviewed_at !== undefined && (typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at)))) refuse("review_provenance");
          if (row.reviewed_by_admin !== undefined && row.reviewed_by_admin !== adminEmail) refuse("review_provenance");
          if (row.review_reason !== undefined && !knownReasons.has(String(row.review_reason))) refuse("review_provenance");
          if (row.change_summary !== undefined && !knownSummaries.has(String(row.change_summary))) refuse("review_patch_scope");
          // Provenance always lands together: an actor or reason without its timestamp is refused.
          if ((row.reviewed_by_admin !== undefined || row.review_reason !== undefined) && row.reviewed_at === undefined) refuse("review_provenance");
          operation = "reviews";
          bump(operation, PROBE_EXPECTED_WRITES.reviews);
          conflictCounter = { name: "reviewConflicts", max: PROBE_EXPECTED_WRITES.reviewConflicts };
          Object.assign(detail, { versionId, predicates });
        } else if (["rpc/research_resource_hub_publish", "rpc/research_resource_hub_withdraw"].includes(table) && method === "POST") {
          if (url.search || !scope.winnerVersionId || row.p_resource_id !== scope.winnerResourceId || row.p_version_id !== scope.winnerVersionId || row.p_actor !== adminEmail || typeof row.p_at !== "string" || !fields(row, ["p_resource_id", "p_version_id", "p_actor", "p_at", "p_reason"])) refuse("transition_scope");
          const withdraw = table.endsWith("withdraw");
          if (withdraw ? row.p_reason !== text.withdraw : row.p_reason !== undefined) refuse("withdraw_reason");
          operation = withdraw ? "withdrawals" : "publications";
          bump(operation, 1);
          Object.assign(detail, { resourceId: scope.winnerResourceId, versionId: scope.winnerVersionId });
        } else if (table === HUB_TABLES[2] && method === "POST") {
          if (url.search || !scope.winnerVersionId || row.resource_id !== scope.winnerResourceId || ![scope.winnerVersionId, null].includes(row.version_id as string | null) || !partnerMembers.includes(row.member_id as string) || !["delivered", "denied", "failed"].includes(String(row.outcome)) || !fields(row, ["id", "resource_id", "version_id", "member_id", "requested_at", "outcome", "reason"])) refuse("delivery_scope");
          operation = "deliveries";
          bump(operation, PROBE_EXPECTED_WRITES.deliveries);
          detail.resourceId = scope.winnerResourceId ?? undefined;
        } else refuse("table_or_rpc");
      } else refuse("endpoint");

      // The race is only real if BOTH uploads looked the key up before EITHER
      // insert reached Postgres, and both approvals read the version before
      // either PATCH did. Gated writes wait; a stalled twin fails the run closed.
      if (versionInsert) await raceGate.wait(gateMs, "race_gate_timeout");
      if (operation === "reviews" && reviewGate) await reviewGate.wait(gateMs, "review_gate_timeout");
      const event: ProbeEvent = { sequence: ++sequence, operation, phase: "attempt", write, ...detail };
      record(event); // Synchronous durable receipt must succeed BEFORE the request is sent.
      const response = await upstream(url, { method, headers: req.headers, body: write ? await req.arrayBuffer() : undefined, redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (response.redirected || (response.status >= 300 && response.status < 400)) refuse("redirect");
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader) {
        for (;;) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 2 * 1024 * 1024) {
            await reader.cancel();
            refuse("response_cap");
          }
          chunks.push(next.value);
        }
      }
      const bytes = Buffer.concat(chunks);
      let expectedConflict = false;
      if (write && conflictCounter) {
        if (versionInsert && response.status === 409) {
          let code: unknown;
          try {
            code = (JSON.parse(bytes.toString("utf8")) as Json).code;
          } catch {
            code = undefined;
          }
          if (code !== "23505") stop("provider_or_uncertain_write");
          expectedConflict = true;
        } else if (!versionInsert && response.status === 200 && bytes.toString("utf8").trim() === "[]") {
          expectedConflict = true;
        }
        if (expectedConflict) {
          counts[conflictCounter.name] = (counts[conflictCounter.name] ?? 0) + 1;
          if (counts[conflictCounter.name]! > conflictCounter.max) stop("conflict_cap");
        }
      }
      if (operation === "upload_key_lookup" && writesEnabled && response.ok) raceGate.observe();
      if (winnerVersionRead && reviewGate && response.ok) reviewGate.observe();
      if (versionInsert && response.status === 201) {
        // Exactly one insert may win. A second 201 means the unique key did not
        // hold in this database, which is a finding, never a pass.
        if (scope.winnerVersionId) stop("unexpected_second_version");
        const upload = scope.uploads.find((u) => u.versionId === detail.versionId)!;
        scope.winnerVersionId = upload.versionId;
        scope.winnerResourceId = upload.resourceId;
      }
      record({ ...event, phase: "response", status: response.status, ...(expectedConflict ? { expectedConflict } : {}) });
      if (response.status >= 500 || (write && !response.ok && !expectedConflict)) stop("provider_or_uncertain_write");
      return new Response(bytes.length ? bytes : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      stopped = true;
      if (error instanceof ManagedHubBoundaryError) throw error;
      refuse("transport_or_receipt_failure");
    }
  };

  return {
    fetch: boundedFetch,
    scope,
    counts,
    /** Ids that already existed before this run; reads may walk them, writes never name them. */
    retain(table: HubTable, ids: readonly string[]) {
      if (writesEnabled) refuse("retain_after_writes");
      for (const id of ids) retained[table].add(id);
    },
    enableWrites: () => {
      if (stopped) refuse("run_stopped");
      writesEnabled = true;
    },
    /** Hold the next review PATCHes until two reads of the winner version have answered. */
    armReviewGate: () => {
      if (stopped || !scope.winnerVersionId) refuse("review_gate_scope");
      reviewGate = createGate(2);
    },
    disarmReviewGate: () => {
      reviewGate = null;
    },
    assertHealthy: () => {
      if (stopped) refuse("run_stopped");
    },
    lookupsObserved: () => raceGate.seen(),
    reviewReadsObserved: () => reviewGate?.seen() ?? 0,
  };
}
