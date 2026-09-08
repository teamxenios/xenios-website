import { createHash } from "node:crypto";
import { z } from "zod";
import { resourceUploadSchema } from "../../../shared/research/resource-hub/contract";

export const PRODUCTION_PROJECT = "yvzeduaxbwgcwllhywff";
export const HUB_BUCKET = "research-resource-library";
export const HUB_TABLES = ["research_resource_library", "research_resource_versions", "research_resource_deliveries"] as const;
export const EXPECTED_WRITES = Object.freeze({ objects: 1, resources: 1, versions: 1, reviews: 2, publications: 1, withdrawals: 1, deliveries: 4 });
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const gitId = z.string().regex(/^[a-f0-9]{40}$/);
const actor = z.object({ authUserId: z.string().uuid(), email: z.string().email(), memberId: z.string().uuid().nullable(), memberStatus: z.string().nullable(), partner: z.object({ id: z.string().uuid(), role: z.string(), state: z.string() }).strict().nullable() }).strict();

/** This private plan contains identities and local paths. Never print it. */
export const managedHubPlanSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string().regex(/^hubqa-[a-z0-9-]{8,48}$/),
  sourceSha: gitId, sourceTree: gitId, precisionFixCommit: gitId,
  sourceReview: z.object({ accepted: z.literal(true), reviewedSha: gitId, reviewedTree: gitId, evidenceSha256: digest }).strict(),
  target: z.object({ projectRef: z.string().regex(/^[a-z]{20}$/), origin: z.string(), isolatedQualificationEnvironment: z.literal(true), ownerApprovalSha256: digest }).strict(),
  credentialsFile: z.string().min(1), receiptDirectory: z.string().min(1),
  actors: z.object({ admin: actor, inside: actor, outside: actor, blocked: actor, nonPartner: actor }).strict(),
  pdf: z.object({ path: z.string().min(1), sha256: digest, sizeBytes: z.number().int().positive().max(1024 * 1024), metadata: resourceUploadSchema, benignSyntheticFixture: z.literal(true), contentAudienceApprovalSha256: digest }).strict(),
  expectedInitialHubRows: z.literal(0), expectedWrites: z.object({ objects: z.literal(1), resources: z.literal(1), versions: z.literal(1), reviews: z.literal(2), publications: z.literal(1), withdrawals: z.literal(1), deliveries: z.literal(4) }).strict(),
  recovery: z.literal("preserve-all-stop-and-review-actual-state-before-retry"),
}).strict();
export type ManagedHubPlan = z.infer<typeof managedHubPlanSchema>;
export type ActorName = keyof ManagedHubPlan["actors"];
export const ACTOR_NAMES: ActorName[] = ["admin", "inside", "outside", "blocked", "nonPartner"];
export const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
export class ManagedHubBoundaryError extends Error {
  constructor(readonly code: string) { super(`Managed Hub boundary refused: ${code}`); }
}
const refuse = (code: string): never => { throw new ManagedHubBoundaryError(code); };

export function assertStagingTarget(projectRef: string, origin: string): void {
  if (!/^[a-z]{20}$/.test(projectRef) || projectRef === PRODUCTION_PROJECT) refuse("project_binding");
  // Exact spelling rejects userinfo, aliases, ports, paths, fragments and normalized URL tricks.
  if (origin !== `https://${projectRef}.supabase.co`) refuse("origin_binding");
}

export function validateManagedHubPlan(raw: unknown): ManagedHubPlan {
  const parsed = managedHubPlanSchema.safeParse(raw);
  if (!parsed.success) refuse("plan_schema");
  const plan = parsed.data;
  assertStagingTarget(plan.target.projectRef, plan.target.origin);
  if (plan.sourceReview.reviewedSha !== plan.sourceSha || plan.sourceReview.reviewedTree !== plan.sourceTree) refuse("source_review_binding");
  const { admin, inside, outside, blocked, nonPartner } = plan.actors;
  if (new Set(ACTOR_NAMES.map((key) => plan.actors[key].authUserId)).size !== 5) refuse("distinct_principals");
  if (new Set(ACTOR_NAMES.map((key) => plan.actors[key].email.toLowerCase())).size !== 5) refuse("distinct_emails");
  if (admin.partner || nonPartner.partner || !inside.partner || !outside.partner || !blocked.partner) refuse("role_plan");
  if ([inside, outside, blocked, nonPartner].some((a) => !a.memberId || a.memberStatus !== "active")) refuse("member_plan");
  if (inside.partner.state !== "active" || outside.partner.state !== "active" || !["suspended", "terminated"].includes(blocked.partner.state)) refuse("partner_state_plan");
  const audience = plan.pdf.metadata.audience as string[];
  if (audience.includes("all_partners") || !audience.includes(inside.partner.role) || audience.includes(outside.partner.role) || !audience.includes(blocked.partner.role)) refuse("audience_control");
  if (plan.pdf.metadata.usagePolicy !== "training" || plan.pdf.metadata.resourceId || plan.pdf.metadata.originalFilename.length > 160 || plan.pdf.metadata.idempotencyKey !== plan.runId) refuse("fixture_scope");
  return plan;
}

export interface BoundaryEvent { sequence: number; operation: string; phase: "attempt" | "response"; write: boolean; status?: number; resourceId?: string; versionId?: string; objectKey?: string }
export interface OwnedHubScope { resourceId: string | null; versionId: string | null; objectKey: string | null }
type Json = Record<string, unknown>;
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const storagePath = new RegExp(`^/storage/v1/object/${HUB_BUCKET}/(resource-library/(${uuid})/v1-(${uuid})\\.pdf)$`);

/** The SDK's only network outlet. Not a general proxy; DELETE and Auth writes never pass. */
export function createManagedHubFetchBoundary(plan: ManagedHubPlan, upstream: typeof fetch, record: (event: BoundaryEvent) => void) {
  assertStagingTarget(plan.target.projectRef, plan.target.origin);
  const scope: OwnedHubScope = { resourceId: null, versionId: null, objectKey: null };
  const counts: Record<string, number> = {};
  let sequence = 0;
  let writesEnabled = false;
  let stopped = false;
  const bump = (name: string, max: number) => { counts[name] = (counts[name] ?? 0) + 1; if (counts[name] > max) refuse("request_cap"); };
  const equals = (value: unknown, expected: unknown) => JSON.stringify(value) === JSON.stringify(expected);
  const own = (row: Json) => row.resource_id === scope.resourceId && row.id === scope.versionId;
  const fields = (row: Json, allowed: string[]) => Object.keys(row).every((key) => allowed.includes(key));
  const jsonBody = async (request: Request): Promise<Json> => {
    if (Number(request.headers.get("content-length") ?? 0) > 16384) refuse("json_size");
    const text = await request.clone().text();
    if (Buffer.byteLength(text) > 16384) refuse("json_size");
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { refuse("json_body"); }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) refuse("single_row_only");
    return parsed as Json;
  };
  const boundedFetch: typeof fetch = async (input, init) => {
    if (stopped) refuse("run_stopped");
    const req = new Request(input, init);
    const url = new URL(req.url);
    const method = req.method;
    let operation = "";
    const write = method !== "GET" && method !== "HEAD";
    try {
      if (url.origin !== plan.target.origin || url.username || url.password || url.hash || /%2f|%5c|%00/i.test(url.pathname)) refuse("request_origin_or_path");
      if (!["GET", "POST", "PATCH"].includes(method)) refuse("method");
      if (write && !writesEnabled) refuse("preflight_is_read_only");
      bump("all", 240);
      if (url.pathname === "/auth/v1/user" && method === "GET" && !url.search) {
        operation = "auth_user_read"; bump(operation, 80);
      } else if (url.pathname === "/auth/v1/admin/users" && method === "GET" && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "1" && [...url.searchParams].length === 2) {
        operation = "service_key_check"; bump(operation, 2);
      } else if (url.pathname === `/storage/v1/bucket/${HUB_BUCKET}` && method === "GET" && !url.search) {
        operation = "private_bucket_read"; bump(operation, 2);
      } else if (url.pathname.startsWith("/storage/v1/object/")) {
        const match = storagePath.exec(url.pathname.replace("/object/authenticated/", "/object/"));
        if (!match || url.search) refuse("storage_path");
        if (method === "POST") {
          operation = "objects"; bump(operation, 1);
          if (scope.objectKey || req.headers.get("x-upsert") !== "false" || req.headers.get("content-type") !== "application/pdf") refuse("storage_immutable");
          const bytes = new Uint8Array(await req.clone().arrayBuffer());
          if (bytes.length !== plan.pdf.sizeBytes || sha256(bytes) !== plan.pdf.sha256) refuse("storage_bytes");
          scope.resourceId = match[2]!; scope.versionId = match[3]!; scope.objectKey = match[1]!;
        } else if (method === "GET" && match[1] === scope.objectKey) { operation = "object_read"; bump(operation, 8); }
        else refuse("storage_scope");
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice("/rest/v1/".length);
        const row = write ? await jsonBody(req) : {};
        const actorEmail = plan.actors.admin.email.toLowerCase();
        // Disallow relationship embeds/functions/aliases in otherwise allowed table reads.
        if (url.searchParams.has("select") && !/^[a-z_*, ]+$/.test(url.searchParams.get("select") ?? "")) refuse("projection_scope");
        if (url.searchParams.has("order") && !["created_at.asc", "version_number.asc", "published_at.desc", "requested_at.desc"].includes(url.searchParams.get("order") ?? "")) refuse("order_scope");
        if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) refuse("duplicate_query_key");
        if (method === "GET" && ["research_members", "research_partners"].includes(table)) {
          const key = table === "research_members" ? "auth_user_id" : "member_id";
          const allowed = ACTOR_NAMES.map((name) => table === "research_members" ? plan.actors[name].authUserId : plan.actors[name].memberId).filter(Boolean);
          if (!allowed.some((id) => url.searchParams.get(key) === `eq.${id}`) || [...url.searchParams.keys()].some((name) => ![key, "select", "limit"].includes(name))) refuse("identity_read_scope");
          url.searchParams.set("limit", "2"); operation = "identity_row_read";
        } else if (method === "GET" && (HUB_TABLES as readonly string[]).includes(table)) {
          if ([...url.searchParams.keys()].some((name) => !["select", "limit", "order", "id", "resource_id", "state", "upload_idempotency_key"].includes(name))) refuse("hub_read_query");
          const bound = (name: string, value: string | null) => !url.searchParams.has(name) || (value !== null && url.searchParams.get(name) === `eq.${value}`);
          if (!bound("id", table === HUB_TABLES[0] ? scope.resourceId : scope.versionId) || !bound("resource_id", scope.resourceId) || !bound("upload_idempotency_key", plan.runId)) refuse("hub_read_scope");
          if (url.searchParams.has("state") && url.searchParams.get("state") !== "eq.published") refuse("hub_read_state");
          url.searchParams.set("limit", "100"); operation = "hub_row_read";
        } else if (table === HUB_TABLES[0] && method === "POST") {
          if (url.search || row.id !== scope.resourceId || row.title !== plan.pdf.metadata.title || row.purpose !== plan.pdf.metadata.purpose || row.kind !== "pdf" || row.created_by_admin !== actorEmail || row.current_published_version_id !== null || !fields(row, ["id", "title", "purpose", "kind", "created_at", "created_by_admin", "current_published_version_id"])) refuse("resource_insert_scope");
          operation = "resources"; bump(operation, 1);
        } else if (table === HUB_TABLES[1] && method === "POST") {
          if (url.search || !own(row) || row.version_number !== 1 || row.state !== "draft" || row.sha256 !== plan.pdf.sha256 || row.size_bytes !== plan.pdf.sizeBytes || row.original_filename !== plan.pdf.metadata.originalFilename || row.storage_key !== scope.objectKey || row.upload_idempotency_key !== plan.runId || row.uploaded_by_admin !== actorEmail || row.content_type !== "application/pdf" || row.usage_policy !== "training" || !equals(row.audience, plan.pdf.metadata.audience) || row.validation_ok !== true || !equals(row.validation_reasons, []) || row.supersedes_version_id !== null || !fields(row, ["id", "resource_id", "version_number", "state", "usage_policy", "audience", "size_bytes", "sha256", "original_filename", "content_type", "storage_key", "validation_ok", "validation_reasons", "uploaded_at", "uploaded_by_admin", "supersedes_version_id", "change_summary", "upload_idempotency_key"])) refuse("version_insert_scope");
          operation = "versions"; bump(operation, 1);
        } else if (table === HUB_TABLES[1] && method === "PATCH") {
          if (url.searchParams.get("id") !== `eq.${scope.versionId}` || !["eq.draft", "eq.in_review"].includes(url.searchParams.get("state") ?? "") || url.searchParams.get("reviewed_at") !== "is.null" || url.searchParams.get("reviewed_by_admin") !== "is.null" || url.searchParams.get("review_reason") !== "is.null" || [...url.searchParams.keys()].some((key) => !["id", "state", "reviewed_at", "reviewed_by_admin", "review_reason", "select"].includes(key)) || row.state !== "in_review" || !fields(row, ["state", "reviewed_at", "reviewed_by_admin", "review_reason"])) refuse("review_cas_scope");
          if (Object.keys(row).length !== 1 && (Object.keys(row).length !== 4 || typeof row.reviewed_at !== "string" || !Number.isFinite(Date.parse(row.reviewed_at)) || row.reviewed_by_admin !== actorEmail || row.review_reason !== `Managed qualification ${plan.runId}`)) refuse("review_provenance");
          operation = "reviews"; bump(operation, 2);
        } else if (["rpc/research_resource_hub_publish", "rpc/research_resource_hub_withdraw"].includes(table) && method === "POST") {
          if (url.search || row.p_resource_id !== scope.resourceId || row.p_version_id !== scope.versionId || row.p_actor !== actorEmail || typeof row.p_at !== "string" || !fields(row, ["p_resource_id", "p_version_id", "p_actor", "p_at", "p_reason"])) refuse("transition_scope");
          const withdraw = table.endsWith("withdraw");
          if (withdraw ? row.p_reason !== `Qualification complete ${plan.runId}` : row.p_reason !== undefined) refuse("withdraw_reason");
          operation = withdraw ? "withdrawals" : "publications"; bump(operation, 1);
        } else if (table === HUB_TABLES[2] && method === "POST") {
          if (url.search || row.resource_id !== scope.resourceId || ![scope.versionId, null].includes(row.version_id as string | null) || ![plan.actors.inside.memberId, plan.actors.outside.memberId, plan.actors.blocked.memberId].includes(row.member_id as string) || !["delivered", "denied", "failed"].includes(String(row.outcome)) || !fields(row, ["id", "resource_id", "version_id", "member_id", "requested_at", "outcome", "reason"])) refuse("delivery_scope");
          operation = "deliveries"; bump(operation, 4);
        } else refuse("table_or_rpc");
      } else refuse("endpoint");
      const event = { sequence: ++sequence, operation, phase: "attempt" as const, write, ...(write ? { resourceId: scope.resourceId ?? undefined, versionId: scope.versionId ?? undefined, objectKey: scope.objectKey ?? undefined } : {}) };
      record(event); // Synchronous durable receipt must succeed BEFORE the request is sent.
      const response = await upstream(url, { method, headers: req.headers, body: write ? await req.arrayBuffer() : undefined, redirect: "error", signal: AbortSignal.timeout(15_000) });
      if (response.redirected || response.status >= 300 && response.status < 400) refuse("redirect");
      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = response.body?.getReader();
      if (reader) {
        while (true) {
          const next = await reader.read();
          if (next.done) break;
          size += next.value.length;
          if (size > 2 * 1024 * 1024) { await reader.cancel(); refuse("response_cap"); }
          chunks.push(next.value);
        }
      }
      const bytes = Buffer.concat(chunks);
      record({ ...event, phase: "response", status: response.status });
      if (response.status >= 500 || (write && !response.ok)) { stopped = true; refuse("provider_or_uncertain_write"); }
      return new Response(bytes.length ? bytes : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      stopped = true;
      if (error instanceof ManagedHubBoundaryError) throw error;
      refuse("transport_or_receipt_failure");
    }
  };
  return { fetch: boundedFetch, scope, counts, enableWrites: () => { if (stopped) refuse("run_stopped"); writesEnabled = true; }, assertHealthy: () => { if (stopped) refuse("run_stopped"); } };
}
