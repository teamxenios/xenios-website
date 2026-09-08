import { createHash } from "node:crypto";
import { z } from "zod";
import { resourceUploadSchema } from "../../../shared/research/resource-hub/contract";

export const PRODUCTION_PROJECT = "yvzeduaxbwgcwllhywff";
export const STAGING_PROJECT = "tetynodzrtmdbuzgboro";
export const APPLICATION_SHA = "8be5d582586217e4cf531e718c65032b79152022";
export const APPLICATION_TREE = "6fc71d0a896d31d0843dd1eb63fa6265a3da9d28";
export const HARNESS_PATHS = ["scripts/revenue-launch/managed-resource-hub-qa.ts", "scripts/revenue-launch/lib/managed-resource-hub-boundary.ts", "server/research/e2e/managed-resource-hub-qa.test.ts"];
export const HUB_BUCKET = "research-resource-library";
export const HUB_TABLES = ["research_resource_library", "research_resource_versions", "research_resource_deliveries"] as const;
export const EXPECTED_ATTEMPTS = Object.freeze({ objects: 4, resources: 4, versions: 4, reviews: 7, publications: 2, withdrawals: 2, deliveries: 6 });
export const EXPECTED_WRITES = Object.freeze({ objects: 4, resources: 4, versions: 2, reviews: 4, publications: 2, withdrawals: 2, deliveries: 6 });
export const PHASES = ["preflight", "race_identical", "race_filename", "retry_controls", "precision_seed", "precision_match", "precision_stale", "precision_provider", "request_review", "review_race", "publish_control", "publish_journey", "delivery_checks", "withdraw_control", "withdraw_journey", "postchecks"] as const;
export type Phase = typeof PHASES[number];
export type WorkerName = "adminA" | "adminB";
export type FixtureName = "control" | "journey";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const gitId = z.string().regex(/^[a-f0-9]{40}$/);
const actor = z.object({ authUserId: z.string().uuid(), email: z.string().email(), memberId: z.string().uuid().nullable(), memberStatus: z.string().nullable(), partner: z.object({ id: z.string().uuid(), role: z.string(), state: z.string() }).strict().nullable() }).strict();
const review = z.object({ accepted: z.literal(true), reviewedSha: gitId, reviewedTree: gitId, evidenceSha256: digest }).strict();
const writesSchema = z.object({ objects: z.literal(4), resources: z.literal(4), versions: z.literal(2), reviews: z.literal(4), publications: z.literal(2), withdrawals: z.literal(2), deliveries: z.literal(6) }).strict();
/** Private identities/paths stay outside Git and output. Provisioning and browser writes are separate. */
export const managedHubPlanSchema = z.object({
  schemaVersion: z.literal(2), runId: z.string().regex(/^hubqa-[a-z0-9-]{8,48}$/),
  sourceSha: gitId, sourceTree: gitId, sourceReview: review,
  applicationSha: z.literal(APPLICATION_SHA), applicationTree: z.literal(APPLICATION_TREE), applicationReview: review,
  target: z.object({ projectRef: z.literal(STAGING_PROJECT), origin: z.string(), isolatedQualificationEnvironment: z.literal(true), ownerApprovalSha256: digest }).strict(),
  credentialsFile: z.string().min(1), receiptDirectory: z.string().min(1),
  actors: z.object({ adminA: actor, adminB: actor, eligible: actor, nonPartner: actor, suspended: actor }).strict(),
  pdf: z.object({ path: z.string().min(1), sha256: digest, sizeBytes: z.number().int().positive().max(1024 * 1024), losingFilename: z.string(), benignSyntheticFixture: z.literal(true), contentAudienceApprovalSha256: digest }).strict(),
  fixtures: z.object({ control: resourceUploadSchema, journey: resourceUploadSchema }).strict(),
  precisionTimestamp: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.123456\+00:00$/),
  baseline: z.object({ resources: z.number().int().nonnegative(), versions: z.number().int().nonnegative(), deliveries: z.number().int().nonnegative(), retainedStateReviewSha256: digest }).strict(),
  expectedAttempts: z.object({ objects: z.literal(4), resources: z.literal(4), versions: z.literal(4), reviews: z.literal(7), publications: z.literal(2), withdrawals: z.literal(2), deliveries: z.literal(6) }).strict(),
  expectedWrites: writesSchema, expectedRefusals: z.literal(5), recovery: z.literal("preserve-all-stop-and-review-actual-state-before-retry"),
}).strict();
export type ManagedHubPlan = z.infer<typeof managedHubPlanSchema>;
export type ActorName = keyof ManagedHubPlan["actors"];
export const ACTOR_NAMES: ActorName[] = ["adminA", "adminB", "eligible", "nonPartner", "suspended"];
export const sha256 = (value: Uint8Array | string): string => createHash("sha256").update(value).digest("hex");
export class ManagedHubBoundaryError extends Error { constructor(readonly code: string) { super(`Managed Hub boundary refused: ${code}`); } }
function refuse(code: string): never { throw new ManagedHubBoundaryError(code); }
export function assertStagingTarget(projectRef: string, origin: string): void {
  if (projectRef !== STAGING_PROJECT) refuse("project_binding");
  if (origin !== `https://${STAGING_PROJECT}.supabase.co`) refuse("origin_binding");
}
export function validateManagedHubPlan(raw: unknown): ManagedHubPlan {
  const parsed = managedHubPlanSchema.safeParse(raw);
  if (!parsed.success) refuse("plan_schema");
  const p = parsed.data;
  assertStagingTarget(p.target.projectRef, p.target.origin);
  if (p.sourceReview.reviewedSha !== p.sourceSha || p.sourceReview.reviewedTree !== p.sourceTree || p.applicationReview.reviewedSha !== p.applicationSha || p.applicationReview.reviewedTree !== p.applicationTree) refuse("source_review_binding");
  const { adminA, adminB, eligible, nonPartner, suspended } = p.actors;
  if (new Set(ACTOR_NAMES.map(k => p.actors[k].authUserId)).size !== 5) refuse("distinct_principals");
  if (new Set(ACTOR_NAMES.map(k => p.actors[k].email.toLowerCase())).size !== 5) refuse("distinct_emails");
  if (adminA.partner || adminB.partner || nonPartner.partner || !eligible.partner || !suspended.partner) refuse("role_plan");
  if ([eligible, nonPartner, suspended].some(a => !a.memberId || a.memberStatus !== "active")) refuse("member_plan");
  if (eligible.partner.state !== "active" || suspended.partner.state !== "suspended" || suspended.partner.role !== eligible.partner.role) refuse("partner_state_plan");
  if (!Number.isFinite(Date.parse(p.precisionTimestamp))) refuse("precision_timestamp");
  for (const name of ["control", "journey"] as const) {
    const m = p.fixtures[name];
    if (m.usagePolicy !== "private" || m.resourceId || m.idempotencyKey !== `${p.runId}-${name}` || !m.title.includes(p.runId) || m.originalFilename.length > 160 || m.changeSummary) refuse("fixture_scope");
    if (m.audience.length !== 1 || m.audience.includes("all_partners") || m.audience.some(a => a === eligible.partner?.role) !== (name === "journey")) refuse("audience_control");
  }
  if (p.fixtures.control.originalFilename !== p.fixtures.journey.originalFilename || p.pdf.losingFilename === p.fixtures.journey.originalFilename || !resourceUploadSchema.safeParse({ ...p.fixtures.journey, originalFilename: p.pdf.losingFilename }).success) refuse("filename_control");
  return p;
}
export interface OwnedHubScope { fixture: FixtureName; worker: WorkerName; resourceId: string; versionId: string; objectKey: string; objectAcknowledged: boolean; resourceAcknowledged: boolean; versionAcknowledged: boolean }
type BoundaryStage = "request_validation" | "journal_attempt" | "provider_request" | "provider_response" | "journal_response" | "barrier";
export interface BoundaryFailure { code: string; runPhase: Phase; worker: WorkerName; operation: string; stage: BoundaryStage; requestNumber: number }
export interface BoundaryEvent { sequence: number; operation: string; phase: "attempt" | "response" | "refusal"; runPhase: Phase; worker: WorkerName; write: boolean; status?: number; expectedRefusal?: string; failureCode?: string; failureStage?: BoundaryStage; acknowledged?: boolean; runScopedProjection?: boolean; resourceId?: string; versionId?: string; objectKey?: string }
type Json = Record<string, unknown>;
export interface ReviewSnapshot { state: string; reviewedAt: string | null; reviewedByAdmin: string | null; reviewReason: string | null }
const uuid = "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const storagePath = new RegExp(`^/storage/v1/object/${HUB_BUCKET}/(resource-library/(${uuid})/v1-(${uuid})\\.pdf)$`);
const fields = (row: Json, allowed: string[]) => Object.keys(row).every(k => allowed.includes(k));
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function jsonValue(bytes: Uint8Array): unknown { try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { refuse("provider_json"); } }
function rowValue(value: unknown): Json | null { const row = Array.isArray(value) ? (value.length === 1 ? value[0] : null) : value; return row && typeof row === "object" && !Array.isArray(row) ? row as Json : null; }
function latch() { let release = () => {}; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; }
async function boundedWait(promise: Promise<void>) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { await Promise.race([promise, new Promise<void>((_, reject) => { timer = setTimeout(() => reject(new ManagedHubBoundaryError("barrier_timeout_preserve_state")), 15_000); })]); }
  finally { if (timer) clearTimeout(timer); }
}
/** Combined broker for both isolated workers. No credentials, arbitrary RPC, delete or retry surface. */
export function createManagedHubFetchBoundary(plan: ManagedHubPlan, upstream: typeof fetch, record: (event: BoundaryEvent) => void) {
  assertStagingTarget(plan.target.projectRef, plan.target.origin);
  const owned: OwnedHubScope[] = [];
  const counts: Record<string, number> = {}, acknowledged: Record<string, number> = {};
  let phase: Phase = "preflight", sequence = 0, stopped = false, inflight = 0, refusals = 0;
  let firstFailure: BoundaryFailure | null = null;
  let snapshot: ReviewSnapshot | null = null;
  const phaseCounts: Record<string, number> = {};
  const deliveryKeys = new Set<string>();
  let readBarrier = latch(), winnerBarrier = latch();
  let idleBarrier = latch(); idleBarrier.release();
  const transports = new Set<AbortController>();
  const readParticipants = new Set<WorkerName>();
  const bump = (key: string, max: number, target = counts) => { target[key] = (target[key] ?? 0) + 1; if (target[key] > max) refuse("request_cap"); };
  const winner = (fixture: FixtureName) => { const found = owned.find(o => o.fixture === fixture && o.worker === "adminA" && o.versionAcknowledged); if (!found) refuse("winner_not_acknowledged"); return found; };
  const activeFixture = (): FixtureName => phase === "race_identical" || phase.startsWith("precision_") || phase.endsWith("_control") ? "control" : "journey";
  const phaseSpec = (p: Phase): Record<string, number> => {
    if (p === "race_identical" || p === "race_filename") return { objects: 2, resources: 2, versions: 2, refusals: 1 };
    if (p.startsWith("precision_") || p === "request_review") return { reviews: 1, ...(p === "precision_stale" || p === "precision_provider" ? { refusals: 1 } : {}) };
    if (p === "review_race") return { reviews: 2, refusals: 1 };
    if (p.startsWith("publish_")) return { publications: 1 };
    if (p.startsWith("withdraw_")) return { withdrawals: 1 };
    if (p === "delivery_checks") return { deliveries: 5 };
    if (p === "postchecks") return { deliveries: 1 };
    return {};
  };
  const assertPhaseComplete = () => { for (const [key, n] of Object.entries(phaseSpec(phase))) if (phaseCounts[key] !== n) refuse("phase_incomplete"); };
  const writeOperation = (op: keyof typeof EXPECTED_ATTEMPTS, worker: WorkerName) => {
    const cap = phaseSpec(phase)[op]; if (!cap) refuse("write_phase");
    bump(op, EXPECTED_ATTEMPTS[op]); bump(op, cap, phaseCounts);
    if (op !== "deliveries") bump(`${op}:${worker}`, 1, phaseCounts);
  };
  const bounded = (worker: WorkerName): typeof fetch => async (input, init) => {
    if (stopped) refuse("run_stopped");
    const req = new Request(input, init), url = new URL(req.url), method = req.method;
    const write = method !== "GET" && method !== "HEAD";
    let operation = "", scope: OwnedHubScope | undefined, projection = false, barrierRead = false;
    let stage: BoundaryStage = "request_validation";
    let controller: AbortController | undefined, transportTimeout: ReturnType<typeof setTimeout> | undefined;
    if (inflight === 0) idleBarrier = latch();
    inflight++;
    try {
      if (url.origin !== plan.target.origin || url.username || url.password || url.hash || /%2f|%5c|%00/i.test(url.pathname)) refuse("request_origin_or_path");
      if (!["GET", "HEAD", "POST", "PATCH"].includes(method)) refuse("method");
      if (write && phase === "preflight") refuse("preflight_is_read_only");
      bump("all", 600);
      if (url.pathname === "/auth/v1/user" && method === "GET" && !url.search) { operation = "auth_user_read"; bump(operation, 160); }
      else if (url.pathname === "/auth/v1/admin/users" && method === "GET" && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "1" && [...url.searchParams].length === 2) { operation = "service_key_check"; bump(operation, 4); }
      else if (url.pathname === `/storage/v1/bucket/${HUB_BUCKET}` && method === "GET" && !url.search && phase === "preflight") { operation = "private_bucket_read"; bump(operation, 1); }
      else if (url.pathname.startsWith("/storage/v1/object/")) {
        const m = storagePath.exec(url.pathname.replace("/object/authenticated/", "/object/"));
        if (!m || !m[1] || !m[2] || !m[3] || url.search) refuse("storage_path");
        if (method === "POST") {
          operation = "objects"; writeOperation("objects", worker);
          if (readParticipants.size !== 2) refuse("upload_barrier_incomplete");
          if (owned.some(o => o.resourceId === m[2] || o.versionId === m[3]) || req.headers.get("x-upsert") !== "false" || req.headers.get("content-type") !== "application/pdf") refuse("storage_immutable");
          const bytes = new Uint8Array(await req.clone().arrayBuffer());
          if (bytes.length !== plan.pdf.sizeBytes || sha256(bytes) !== plan.pdf.sha256) refuse("storage_bytes");
          scope = { fixture: activeFixture(), worker, resourceId: m[2], versionId: m[3], objectKey: m[1], objectAcknowledged: false, resourceAcknowledged: false, versionAcknowledged: false }; owned.push(scope);
        } else if (method === "GET") { scope = owned.find(o => o.objectKey === m[1] && o.objectAcknowledged); if (!scope) refuse("storage_scope"); operation = "object_read"; bump(operation, 16); }
        else refuse("storage_scope");
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice(9);
        let row: Json = {};
        if (write) { const bytes = new Uint8Array(await req.clone().arrayBuffer()); if (bytes.length > 16384) refuse("json_size"); row = rowValue(jsonValue(bytes)) ?? refuse("single_row_only"); if (Array.isArray(jsonValue(bytes))) refuse("single_row_only"); }
        const email = plan.actors[worker].email.toLowerCase();
        // Plain column identifiers may contain digits after the first character (sha256).
        // Relationship embeds, aliases, casts, JSON paths and functions remain forbidden.
        if (url.searchParams.has("select") && !/^(?:\*|[a-z_][a-z0-9_]*(?: *, *[a-z_][a-z0-9_]*)*)$/.test(url.searchParams.get("select") ?? "")) refuse("projection_scope");
        if (url.searchParams.has("order") && !["created_at.asc", "version_number.asc", "published_at.desc", "requested_at.desc"].includes(url.searchParams.get("order") ?? "")) refuse("order_scope");
        if ([...url.searchParams.keys()].some(k => url.searchParams.getAll(k).length !== 1)) refuse("duplicate_query_key");
        if (method === "GET" && ["research_members", "research_partners"].includes(table)) {
          const key = table === "research_members" ? "auth_user_id" : "member_id";
          const allowed = ACTOR_NAMES.map(n => table === "research_members" ? plan.actors[n].authUserId : plan.actors[n].memberId).filter(Boolean);
          if (!allowed.some(id => url.searchParams.get(key) === `eq.${id}`) || [...url.searchParams.keys()].some(k => ![key, "select", "limit"].includes(k))) refuse("identity_read_scope");
          url.searchParams.set("limit", "2"); operation = "identity_row_read";
        } else if (method === "HEAD" && HUB_TABLES.some(t => t === table)) {
          if (!["preflight", "postchecks"].includes(phase) || url.searchParams.get("select") !== "id" || url.searchParams.get("limit") !== "0" || [...url.searchParams].length !== 2 || req.headers.get("prefer") !== "count=exact") refuse("baseline_count_scope");
          operation = "baseline_count"; bump(operation, 6);
        } else if (method === "GET" && HUB_TABLES.some(t => t === table)) {
          if ([...url.searchParams.keys()].some(k => !["select", "limit", "order", "id", "resource_id", "state", "upload_idempotency_key"].includes(k))) refuse("hub_read_query");
          const ids = owned.map(o => table === HUB_TABLES[0] ? o.resourceId : o.versionId);
          const bound = (key: string, values: string[]) => !url.searchParams.has(key) || values.some(v => url.searchParams.get(key) === `eq.${v}`);
          if (!bound("id", ids) || !bound("resource_id", owned.map(o => o.resourceId)) || !bound("upload_idempotency_key", Object.values(plan.fixtures).map(m => m.idempotencyKey))) refuse("hub_read_scope");
          if (url.searchParams.has("state") && url.searchParams.get("state") !== "eq.published") refuse("hub_read_state");
          if (!url.searchParams.has("id") && !url.searchParams.has("resource_id") && !url.searchParams.has("upload_idempotency_key")) {
            const column = table === HUB_TABLES[2] ? "resource_id" : "id";
            const ownedIds = table === HUB_TABLES[2] ? owned.map(o => o.resourceId) : ids;
            // These columns are NOT NULL in the reviewed migration. This is an actual
            // provider query with an impossible predicate, never a synthetic response.
            url.searchParams.set(column, ownedIds.length ? `in.(${ownedIds.join(",")})` : "is.null"); projection = true;
          }
          url.searchParams.set("limit", "100"); operation = "hub_row_read";
          const race = phase === "race_identical" || phase === "race_filename";
          barrierRead = !readParticipants.has(worker) && table === HUB_TABLES[1] && (race ? url.searchParams.get("upload_idempotency_key") === `eq.${plan.fixtures[activeFixture()].idempotencyKey}` : phase === "review_race" && url.searchParams.get("id") === `eq.${winner("journey").versionId}`);
        } else if (table === HUB_TABLES[0] && method === "POST") {
          scope = owned.find(o => o.resourceId === row.id && o.worker === worker && o.fixture === activeFixture() && o.objectAcknowledged);
          if (!scope) refuse("resource_insert_scope"); const m = plan.fixtures[scope.fixture];
          if (url.search || row.title !== m.title || row.purpose !== m.purpose || row.kind !== "pdf" || row.created_by_admin !== email || row.current_published_version_id !== null || !fields(row, ["id", "title", "purpose", "kind", "created_at", "created_by_admin", "current_published_version_id"])) refuse("resource_insert_scope");
          operation = "resources"; writeOperation("resources", worker);
        } else if (table === HUB_TABLES[1] && method === "POST") {
          scope = owned.find(o => o.resourceId === row.resource_id && o.versionId === row.id && o.worker === worker && o.fixture === activeFixture() && o.resourceAcknowledged);
          if (!scope) refuse("version_insert_scope"); const m = plan.fixtures[scope.fixture];
          const filename = phase === "race_filename" && worker === "adminB" ? plan.pdf.losingFilename : m.originalFilename;
          if (url.search || row.version_number !== 1 || row.state !== "draft" || row.sha256 !== plan.pdf.sha256 || row.size_bytes !== plan.pdf.sizeBytes || row.original_filename !== filename || row.storage_key !== scope.objectKey || row.upload_idempotency_key !== m.idempotencyKey || row.uploaded_by_admin !== email || row.content_type !== "application/pdf" || row.usage_policy !== "private" || !same(row.audience, m.audience) || row.validation_ok !== true || !same(row.validation_reasons, []) || row.supersedes_version_id !== null || row.change_summary !== null || !fields(row, ["id", "resource_id", "version_number", "state", "usage_policy", "audience", "size_bytes", "sha256", "original_filename", "content_type", "storage_key", "validation_ok", "validation_reasons", "uploaded_at", "uploaded_by_admin", "supersedes_version_id", "change_summary", "upload_idempotency_key"])) refuse("version_insert_scope");
          operation = "versions"; writeOperation("versions", worker);
        } else if (table === HUB_TABLES[1] && method === "PATCH") {
          scope = winner(activeFixture());
          const expected = phase === "request_review" ? { state: "draft", reviewedAt: null, reviewedByAdmin: null, reviewReason: null } : phase === "review_race" ? { state: "in_review", reviewedAt: null, reviewedByAdmin: null, reviewReason: null } : snapshot;
          if (!expected || url.searchParams.get("id") !== `eq.${scope.versionId}` || url.searchParams.get("state") !== `eq.${expected.state}` || [...url.searchParams.keys()].some(k => !["id", "state", "reviewed_at", "reviewed_by_admin", "review_reason", "select"].includes(k)) || url.searchParams.get("select") !== "id") refuse("review_cas_scope");
          for (const [col, value] of [["reviewed_at", expected.reviewedAt], ["reviewed_by_admin", expected.reviewedByAdmin], ["review_reason", expected.reviewReason]] as const) if (url.searchParams.get(col) !== (value === null ? "is.null" : `eq.${value}`)) refuse("review_cas_scope");
          let valid = false;
          if (phase === "request_review") valid = same(row, { state: "in_review" });
          else if (phase === "precision_seed") valid = same(row, { state: "in_review", reviewed_at: plan.precisionTimestamp, reviewed_by_admin: email, review_reason: `Synthetic precision seed ${plan.runId}` });
          else if (phase === "precision_match") valid = same(row, { review_reason: `Synthetic precision match ${plan.runId}` });
          else if (phase === "precision_stale") valid = same(row, { review_reason: `Synthetic stale refusal ${plan.runId}` });
          else if (phase === "precision_provider") valid = same(row, { reviewed_at: "managed-qa-invalid-timestamp" });
          else if (phase === "review_race") valid = fields(row, ["state", "reviewed_at", "reviewed_by_admin", "review_reason"]) && Object.keys(row).length === 4 && row.state === "in_review" && typeof row.reviewed_at === "string" && Number.isFinite(Date.parse(row.reviewed_at)) && row.reviewed_by_admin === email && row.review_reason === `Managed qualification ${plan.runId}`;
          if (!valid || phase !== "review_race" && worker !== "adminA") refuse("review_provenance");
          if (phase === "review_race" && readParticipants.size !== 2) refuse("review_barrier_incomplete");
          operation = "reviews"; writeOperation("reviews", worker);
        } else if (["rpc/research_resource_hub_publish", "rpc/research_resource_hub_withdraw"].includes(table) && method === "POST") {
          scope = winner(activeFixture()); const withdraw = table.endsWith("withdraw");
          if (worker !== "adminA" || url.search || row.p_resource_id !== scope.resourceId || row.p_version_id !== scope.versionId || row.p_actor !== email || typeof row.p_at !== "string" || !Number.isFinite(Date.parse(row.p_at)) || !fields(row, ["p_resource_id", "p_version_id", "p_actor", "p_at", "p_reason"]) || (withdraw ? row.p_reason !== `Qualification complete ${plan.runId}` : row.p_reason !== undefined)) refuse("transition_scope");
          const transitionOperation = withdraw ? "withdrawals" : "publications";
          operation = transitionOperation; writeOperation(transitionOperation, worker);
        } else if (table === HUB_TABLES[2] && method === "POST") {
          scope = owned.find(o => o.resourceId === row.resource_id && o.resourceAcknowledged);
          if (!scope || worker !== "adminA" || url.search || ![scope.versionAcknowledged ? scope.versionId : null, null].includes(row.version_id as string | null) || ![plan.actors.eligible.memberId, plan.actors.suspended.memberId].includes(row.member_id as string) || !["delivered", "denied"].includes(String(row.outcome)) || !fields(row, ["id", "resource_id", "version_id", "member_id", "requested_at", "outcome", "reason"])) refuse("delivery_scope");
          const unavailable = scope.worker === "adminB" || phase === "postchecks";
          const expectedMember = !unavailable && scope.fixture === "journey" && row.outcome === "denied" ? plan.actors.suspended.memberId : plan.actors.eligible.memberId;
          const expected = row.member_id === expectedMember && row.version_id === (unavailable ? null : scope.versionId) && (row.outcome === "delivered" ? phase === "delivery_checks" && scope.fixture === "journey" && scope.worker === "adminA" && row.reason === null : row.reason === (unavailable ? "not_published" : "audience"));
          const deliveryKey = `${phase}:${scope.resourceId}:${String(row.member_id)}:${String(row.outcome)}`;
          if (!expected || phase === "postchecks" && scope !== winner("journey") || deliveryKeys.has(deliveryKey) || typeof row.id !== "string" || !new RegExp(`^${uuid}$`).test(row.id)) refuse("delivery_outcome_scope");
          deliveryKeys.add(deliveryKey); operation = "deliveries"; writeOperation("deliveries", worker);
        } else refuse("table_or_rpc");
      } else refuse("endpoint");
      const event: BoundaryEvent = { sequence: ++sequence, operation, phase: "attempt", runPhase: phase, worker, write, ...(projection ? { runScopedProjection: true } : {}), ...(write && scope ? { resourceId: scope.resourceId, versionId: scope.versionId, objectKey: scope.objectKey } : {}) };
      stage = "journal_attempt";
      record(event); // Durable before any provider request or barrier-dependent write.
      stage = "barrier";
      if (worker === "adminB" && (operation === "versions" || operation === "reviews" && phase === "review_race")) await boundedWait(winnerBarrier.promise);
      if (stopped) refuse("run_stopped");
      controller = new AbortController(); transports.add(controller);
      transportTimeout = setTimeout(() => controller?.abort(), 15_000);
      stage = "provider_request";
      const response = await upstream(url, { method, headers: req.headers, body: write ? await req.arrayBuffer() : undefined, redirect: "error", signal: controller.signal });
      stage = "provider_response";
      if (response.redirected || response.status >= 300 && response.status < 400) refuse("redirect");
      const chunks: Uint8Array[] = []; let size = 0; const reader = response.body?.getReader();
      if (reader) while (true) { const next = await reader.read(); if (next.done) break; size += next.value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); refuse("response_cap"); } chunks.push(next.value); }
      const bytes = Buffer.concat(chunks);
      let expectedRefusal: string | undefined;
      if (write && !response.ok) {
        const error = rowValue(jsonValue(bytes));
        if (operation === "versions" && worker === "adminB" && ["race_identical", "race_filename"].includes(phase) && response.status === 409 && error?.code === "23505") expectedRefusal = "owned_upload_unique_conflict";
        else if (operation === "reviews" && worker === "adminA" && phase === "precision_provider" && response.status === 400 && error?.code === "22007") expectedRefusal = "owned_invalid_timestamp_provider_refusal";
      }
      if (operation === "reviews" && response.ok) {
        const value = jsonValue(bytes), row = rowValue(value);
        const empty = value === null || Array.isArray(value) && value.length === 0;
        if (!empty && (!row || row.id !== scope?.versionId || Object.keys(row).length !== 1)) refuse("review_response_shape");
        if (empty) {
          if (phase === "precision_stale" && worker === "adminA" || phase === "review_race" && worker === "adminB") expectedRefusal = "owned_zero_row_cas";
          else refuse("unexpected_zero_row_cas");
        }
      }
      if ((phase === "precision_stale" || phase === "precision_provider") && operation === "reviews" && !expectedRefusal || worker === "adminB" && (operation === "versions" || phase === "review_race" && operation === "reviews") && !expectedRefusal) refuse("expected_refusal_missing");
      const ack = write && response.ok && !expectedRefusal;
      stage = "journal_response";
      record({ ...event, phase: "response", status: response.status, ...(expectedRefusal ? { expectedRefusal } : {}), ...(write ? { acknowledged: ack } : {}) });
      stage = "provider_response";
      if (response.status >= 500 || !response.ok && !expectedRefusal) refuse("provider_or_uncertain_write");
      if (expectedRefusal) { refusals++; bump("refusals", phaseSpec(phase).refusals ?? 0, phaseCounts); }
      if (ack) { acknowledged[operation] = (acknowledged[operation] ?? 0) + 1; if (scope && operation === "objects") scope.objectAcknowledged = true; if (scope && operation === "resources") scope.resourceAcknowledged = true; if (scope && operation === "versions") scope.versionAcknowledged = true; }
      if (worker === "adminA" && ack && (operation === "versions" || phase === "review_race" && operation === "reviews")) winnerBarrier.release();
      if (barrierRead) {
        stage = "barrier";
        const value = jsonValue(bytes), row = rowValue(value);
        if (phase === "review_race" ? !row || row.state !== "in_review" || row.reviewed_at !== null || row.reviewed_by_admin !== null || row.review_reason !== null : !(value === null || Array.isArray(value) && value.length === 0)) refuse("barrier_snapshot_mismatch");
        readParticipants.add(worker); if (readParticipants.size === 2) readBarrier.release(); await boundedWait(readBarrier.promise);
      }
      return new Response(bytes.length ? bytes : null, { status: response.status, statusText: response.statusText, headers: response.headers });
    } catch (error) {
      stopped = true;
      const code = error instanceof ManagedHubBoundaryError ? error.code : "transport_or_receipt_failure";
      // Retain typed metadata independently of SDK retry/wrapping; never parse provider text.
      firstFailure ??= Object.freeze({ code, runPhase: phase, worker, operation: operation || "not_classified", stage, requestNumber: counts.all ?? 0 });
      try { record({ sequence: ++sequence, operation: operation || "not_classified", phase: "refusal", runPhase: phase, worker, write, failureCode: code, failureStage: stage }); } catch { /* The original diagnostic survives a failed disk receipt. */ }
      if (error instanceof ManagedHubBoundaryError) throw error;
      refuse(code);
    }
    finally { if (transportTimeout) clearTimeout(transportTimeout); if (controller) { controller.abort(); transports.delete(controller); } inflight--; if (inflight === 0) idleBarrier.release(); }
  };
  return {
    fetch: bounded("adminA"), fetchFor: bounded, owned, counts, acknowledged, winner,
    beginPhase(next: Phase) { if (stopped || inflight) refuse("run_stopped_or_inflight"); if (PHASES[PHASES.indexOf(phase) + 1] !== next) refuse("phase_order"); assertPhaseComplete(); phase = next; for (const k of Object.keys(phaseCounts)) delete phaseCounts[k]; readParticipants.clear(); readBarrier = latch(); winnerBarrier = latch(); snapshot = null; },
    setExpectedReview(value: ReviewSnapshot) {
      if (stopped || inflight || !phase.startsWith("precision_")) refuse("review_snapshot_phase");
      const expected: ReviewSnapshot = phase === "precision_seed" ? { state: "draft", reviewedAt: null, reviewedByAdmin: null, reviewReason: null } : {
        state: "in_review", reviewedAt: phase === "precision_stale" ? plan.precisionTimestamp.replace(".123456", ".123457") : plan.precisionTimestamp,
        reviewedByAdmin: plan.actors.adminA.email.toLowerCase(), reviewReason: `Synthetic precision ${phase === "precision_match" ? "seed" : "match"} ${plan.runId}`,
      };
      if (value.state !== expected.state || value.reviewedAt !== expected.reviewedAt || value.reviewedByAdmin !== expected.reviewedByAdmin || value.reviewReason !== expected.reviewReason) refuse("review_snapshot_binding");
      snapshot = expected;
    },
    assertHealthy() { if (stopped) refuse("run_stopped"); },
    stop() { stopped = true; for (const controller of transports) controller.abort(); readBarrier.release(); winnerBarrier.release(); },
    async waitUntilIdle() { await boundedWait(idleBarrier.promise); if (inflight) refuse("broker_not_idle"); },
    assertComplete() { if (stopped || inflight || phase !== "postchecks") refuse("run_incomplete"); assertPhaseComplete(); for (const [k, n] of Object.entries(EXPECTED_ATTEMPTS)) if (counts[k] !== n) refuse("write_accounting"); for (const [k, n] of Object.entries(EXPECTED_WRITES)) if (acknowledged[k] !== n) refuse("acknowledgement_accounting"); if (refusals !== 5) refuse("refusal_accounting"); },
    get phase() { return phase; }, get expectedRefusals() { return refusals; },
    get failure(): Readonly<BoundaryFailure> | null { return firstFailure; },
  };
}
