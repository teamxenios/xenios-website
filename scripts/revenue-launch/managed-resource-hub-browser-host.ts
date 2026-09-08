/**
 * Bounded STAGING browser host. Local preflight is the default and reads no credentials.
 * --plan ABSOLUTE_PRIVATE_JSON [--execute --approved-plan-sha256 HEX]
 *
 * Serves an externally hash-bound build of the unchanged 8be application. All identity,
 * membership, partner and Hub decisions use canonical code and real Supabase services.
 * Browser Auth uses a loopback reverse proxy to real GoTrue so effects can be journaled
 * BEFORE dispatch. This does not qualify a direct-origin Supabase browser deployment.
 * Passwords enter only the actual application form; there is no credential helper,
 * token injection, fixture identity adapter, job runner, deletion or production mode.
 *
 * Combined two-host ceiling: eight password sign-ins/eight logouts, zero refresh.
 * A: adminA 2, adminB 1, eligible 2, nonPartner 1, suspended 1. B: adminB 1 only.
 * Only A may create ONE additional resource/version/object, review twice, publish once,
 * withdraw once, and append at most TWO delivery audits. B has ZERO Hub writes.
 * Generated upload key/resource/version IDs are frozen and journaled before effects;
 * they are not replaced in canonical code. Retained rows/objects are never deleted.
 * A successful byte response waits four seconds to permit a mounted-tab logout test;
 * cancellation can still leave an actual delivery audit and is never a zero-write claim.
 * A host receipt is transport evidence, not browser acceptance or ASTRA-B acceptance.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Express, Request, Response } from "express";
import { z } from "zod";
import { decodeResourceUploadMetadata, resourceUploadSchema, resourceVersionReviewSchema, type ResourceUploadInput } from "../../shared/research/resource-hub/contract";

export const SOURCE_SHA = "8be5d582586217e4cf531e718c65032b79152022";
export const SOURCE_TREE = "6fc71d0a896d31d0843dd1eb63fa6265a3da9d28";
export const STAGING_PROJECT = "tetynodzrtmdbuzgboro";
export const STAGING_ORIGIN = `https://${STAGING_PROJECT}.supabase.co`;
export const PDF_SHA = "9bf66f0c5ed7ce28d90cb0dca3a3402067a0b8df61a00a0ab8f833fc5f03a198";
export const BUCKET = "research-resource-library";
export const TABLES = ["research_resource_library", "research_resource_versions", "research_resource_deliveries"] as const;
export const ACTORS = ["adminA", "adminB", "eligible", "nonPartner", "suspended"] as const;
export type Actor = typeof ACTORS[number];
export const AUTH_CAPS = Object.freeze({ adminA: { adminA: 2, adminB: 1, eligible: 2, nonPartner: 1, suspended: 1 }, adminB: { adminA: 0, adminB: 1, eligible: 0, nonPartner: 0, suspended: 0 } });
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const actorSchema = z.object({ authUserId: uuid, email: z.string().email(), memberId: uuid.nullable(), applicationId: uuid.nullable(), memberStatus: z.string().nullable(), partner: z.object({ id: uuid, role: z.string(), state: z.string() }).strict().nullable() }).strict();
const ownedSchema = z.object({ resourceId: uuid, versionId: uuid, objectKey: z.string() }).strict();
const metadataSchema = resourceUploadSchema.omit({ idempotencyKey: true, resourceId: true }).extend({ usagePolicy: z.literal("private") });
export const browserPlanSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string().regex(/^hubbrowser-[a-z0-9-]{8,48}$/), sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE),
  hostFileSha256: hash, ownerApprovalSha256: hash, target: z.object({ projectRef: z.literal(STAGING_PROJECT), origin: z.literal(STAGING_ORIGIN) }).strict(),
  host: z.enum(["adminA", "adminB"]), credentialsFile: z.string().min(1), receiptDirectory: z.string().min(1),
  actors: z.object({ adminA: actorSchema, adminB: actorSchema, eligible: actorSchema, nonPartner: actorSchema, suspended: actorSchema }).strict(),
  pdf: z.object({ path: z.string().min(1), sha256: z.literal(PDF_SHA), sizeBytes: z.number().int().positive().max(1024 * 1024), metadata: metadataSchema, reviewReason: z.string().min(3).max(400), withdrawReason: z.string().min(3).max(400) }).strict(),
  existing: z.array(ownedSchema).max(8), distDirectory: z.string().min(1), buildManifestFile: z.string().min(1), buildManifestSha256: hash,
}).strict();
export type BrowserPlan = z.infer<typeof browserPlanSchema>;
type Owned = z.infer<typeof ownedSchema>;
type Row = Record<string, unknown>;
export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export class BrowserBoundaryError extends Error { constructor(readonly code: string) { super(`Browser host refused: ${code}`); } }
function fail(code: string): never { throw new BrowserBoundaryError(code); }
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const fields = (row: Row, allowed: string[]) => Object.keys(row).every((key) => allowed.includes(key));
const uuidPattern = "[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}";
const objectPattern = new RegExp(`^resource-library/(${uuidPattern})/v1-(${uuidPattern})\\.pdf$`);
function json(bytes: Uint8Array, limit = 65536): unknown {
  if (bytes.length > limit) fail("json_size");
  try { return JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { return fail("json_parse"); }
}
function rowOf(value: unknown): Row { if (!value || typeof value !== "object" || Array.isArray(value)) fail("single_row_required"); return value as Row; }
export function assertBrowserCasResult(data: unknown, versionId: string | undefined) {
  const rows = Array.isArray(data) ? data : [data];
  if (!versionId || rows.length !== 1 || rowOf(rows[0]).id !== versionId || !fields(rowOf(rows[0]), ["id"])) fail("review_cas_zero_or_invalid_result");
}
export function validateBrowserPlan(raw: unknown): BrowserPlan {
  const parsed = browserPlanSchema.safeParse(raw); if (!parsed.success) fail("plan_schema");
  const plan = parsed.data;
  if (new Set(ACTORS.map((a) => plan.actors[a].authUserId)).size !== 5 || new Set(ACTORS.map((a) => plan.actors[a].email.toLowerCase())).size !== 5) fail("distinct_actors");
  for (const name of ["adminA", "adminB"] as const) if (plan.actors[name].memberId || plan.actors[name].applicationId || plan.actors[name].memberStatus || plan.actors[name].partner) fail("admin_identity_scope");
  for (const name of ["eligible", "nonPartner", "suspended"] as const) if (!plan.actors[name].memberId || !plan.actors[name].applicationId || plan.actors[name].memberStatus !== "active") fail("member_identity_scope");
  const { eligible, nonPartner, suspended } = plan.actors;
  if (nonPartner.partner || eligible.partner?.state !== "active" || suspended.partner?.state !== "suspended") fail("partner_identity_scope");
  if (plan.pdf.metadata.audience.includes("all_partners") || !plan.pdf.metadata.audience.includes(eligible.partner.role as never) || !plan.pdf.metadata.audience.includes(suspended.partner.role as never)) fail("audience_scope");
  if (new Set(plan.existing.map((v) => v.objectKey)).size !== plan.existing.length) fail("duplicate_owned_objects");
  for (const item of plan.existing) if (item.objectKey !== `resource-library/${item.resourceId}/v1-${item.versionId}.pdf` || !objectPattern.test(item.objectKey)) fail("owned_object_binding");
  return plan;
}

export interface BrowserEvent { operation: string; phase: "attempt" | "response" | "local"; write: boolean; sequence?: number; status?: number; actor?: Actor; scope?: Owned; detail?: string }
/** Complete a durable, private, redacted record before allowing any remote effect. */
export function appendBrowserJournal(fd: number, event: unknown, write = writeSync, sync = fsyncSync) {
  const bytes = Buffer.from(`${JSON.stringify(event)}\n`); let offset = 0;
  while (offset < bytes.length) { const count = write(fd, bytes, offset, bytes.length - offset); if (!Number.isInteger(count) || count <= 0 || count > bytes.length - offset) fail("journal_write"); offset += count; }
  sync(fd);
}

/** Restricts transport, not product decisions. Canonical guards/store/scanner stay intact. */
export function createBrowserBoundary(plan: BrowserPlan, upstream: typeof fetch, record: (event: BrowserEvent) => void) {
  validateBrowserPlan(plan);
  const counts: Record<string, number> = {}; const sessions = new Map<string, Actor>();
  let stopped = false, failed = false, sequence = 0, writesEnabled = false, upload: ResourceUploadInput | null = null, extra: Owned | null = null;
  let firstRefusal: { code: string; operation: string; phase: string } | null = null;
  const active = new Set<Promise<globalThis.Response>>(), controllers = new Set<AbortController>();
  const owned = () => [...plan.existing, ...(extra ? [extra] : [])];
  const assertHealthy = () => { if (stopped) fail("run_stopped"); };
  const bump = (name: string, max: number) => { counts[name] = (counts[name] ?? 0) + 1; if (counts[name] > max) fail("request_cap"); };
  const actorFor = (token: string) => sessions.get(sha256(token));
  const authUser = (raw: unknown, expected?: Actor): Actor => {
    const row = rowOf(raw); const name = ACTORS.find((a) => plan.actors[a].authUserId === row.id && plan.actors[a].email.toLowerCase() === String(row.email).toLowerCase());
    if (!name || expected && name !== expected || !row.email_confirmed_at) fail("verified_auth_identity"); return name;
  };
  const requestJson = async (req: globalThis.Request) => rowOf(json(new Uint8Array(await req.clone().arrayBuffer()), 16384));
  const dispatch: typeof fetch = async (input, init) => {
    assertHealthy(); const req = new globalThis.Request(input, init), url = new URL(req.url); const method = req.method;
    const write = method !== "GET"; let operation = "", actor: Actor | undefined, controller: AbortController | undefined;
    try {
      if (url.origin !== STAGING_ORIGIN || url.username || url.password || url.hash || /%2f|%5c|%00/i.test(url.pathname) || !["GET", "POST", "PATCH"].includes(method)) fail("origin_path_method");
      bump("remote_all", 800);
      if ([...url.searchParams.keys()].some((key) => url.searchParams.getAll(key).length !== 1)) fail("duplicate_query");
      if (url.pathname.startsWith("/auth/v1/")) {
        const bearer = (req.headers.get("authorization") ?? "").replace(/^Bearer /, "");
        if (url.pathname === "/auth/v1/token" && method === "POST" && url.search === "?grant_type=password") {
          if (!writesEnabled) fail("preflight_read_only");
          const row = await requestJson(req); actor = ACTORS.find((a) => plan.actors[a].email.toLowerCase() === String(row.email).toLowerCase());
          if (!actor || !fields(row, ["email", "password", "gotrue_meta_security"]) || typeof row.password !== "string" || row.password.length < 10 || row.password.length > 200 || row.gotrue_meta_security && !same(row.gotrue_meta_security, {})) fail("password_scope");
          operation = `password_${actor}`; bump(operation, AUTH_CAPS[plan.host][actor]);
        } else if (url.pathname === "/auth/v1/logout" && method === "POST" && ["?scope=local", "?scope=global", ""].includes(url.search)) {
          if (!writesEnabled) fail("preflight_read_only"); actor = actorFor(bearer); if (!actor) fail("logout_session_scope");
          if (["adminA", "adminB"].includes(actor) ? url.search === "?scope=local" : url.search !== "?scope=local") fail("canonical_logout_scope");
          operation = `logout_${actor}`; bump(operation, AUTH_CAPS[plan.host][actor]);
          if ((await req.clone().text()).length) fail("logout_body");
        } else if (url.pathname === "/auth/v1/user" && method === "GET" && !url.search) {
          actor = actorFor(bearer); if (!actor) fail("session_not_created_by_real_auth"); operation = "auth_user"; bump(operation, 160);
        } else if (method === "GET" && url.pathname === "/auth/v1/admin/users" && url.searchParams.get("page") === "1" && url.searchParams.get("per_page") === "1" && [...url.searchParams].length === 2 && !writesEnabled) {
          operation = "service_key_self_check"; bump(operation, 1);
        } else if (method === "GET" && ACTORS.some((a) => url.pathname === `/auth/v1/admin/users/${plan.actors[a].authUserId}`) && !url.search && !writesEnabled) {
          actor = ACTORS.find((a) => url.pathname.endsWith(plan.actors[a].authUserId)); operation = "auth_fixture_precheck"; bump(operation, 5);
        } else fail("auth_endpoint_or_refresh");
      } else if (url.pathname === `/storage/v1/bucket/${BUCKET}` && method === "GET" && !url.search && !writesEnabled) { operation = "bucket_precheck"; bump(operation, 1);
      } else if (url.pathname.startsWith("/storage/v1/object/")) {
        const key = url.pathname.replace(/^\/storage\/v1\/object\/(authenticated\/)?research-resource-library\//, ""); const match = objectPattern.exec(key);
        if (!match || url.search) fail("object_path");
        if (method === "POST") {
          if (!writesEnabled || plan.host !== "adminA" || !upload || extra || req.headers.get("x-upsert") !== "false" || req.headers.get("content-type") !== "application/pdf") fail("immutable_upload_scope");
          const bytes = new Uint8Array(await req.clone().arrayBuffer()); if (bytes.length !== plan.pdf.sizeBytes || sha256(bytes) !== PDF_SHA) fail("pdf_bytes");
          if (owned().some((o) => o.resourceId === match[1] || o.versionId === match[2])) fail("existing_id_reuse");
          extra = { resourceId: match[1]!, versionId: match[2]!, objectKey: key }; operation = "objects"; bump(operation, 1);
        } else if (method === "GET" && owned().some((o) => o.objectKey === key)) { operation = "object_read"; bump(operation, plan.host === "adminA" ? 4 : 1); }
        else fail("object_scope");
      } else if (url.pathname.startsWith("/rest/v1/")) {
        const table = url.pathname.slice(9), row = write ? await requestJson(req) : {};
        if (url.searchParams.has("select") && !/^[a-z0-9_*, ]+$/.test(url.searchParams.get("select")!)) fail("projection_scope");
        if (method === "GET") {
          const ids = (values: (string | null)[], key: string) => values.some((id) => id && url.searchParams.get(key) === `eq.${id}`);
          if (["research_members", "research_partners", "research_applications"].includes(table)) {
            const key = table === "research_members" ? "auth_user_id" : table === "research_partners" ? "member_id" : "id";
            const values = ACTORS.map((a) => table === "research_members" ? plan.actors[a].authUserId : table === "research_partners" ? plan.actors[a].memberId : plan.actors[a].applicationId);
            if (!ids(values, key) || [...url.searchParams.keys()].some((k) => ![key, "select", "limit"].includes(k))) fail("core_read_scope");
            if (table === "research_applications" && url.searchParams.get("select") !== "status") fail("application_projection");
            url.searchParams.set("limit", "2"); operation = `read_${table}`;
          } else if ((TABLES as readonly string[]).includes(table)) {
            if ([...url.searchParams.keys()].some((k) => !["select", "limit", "order", "id", "resource_id", "state", "upload_idempotency_key"].includes(k))) fail("hub_query");
            if (url.searchParams.has("id") && !ids(owned().map((o) => table === TABLES[0] ? o.resourceId : o.versionId), "id")) fail("hub_id_scope");
            if (url.searchParams.has("resource_id") && !ids(owned().map((o) => o.resourceId), "resource_id")) fail("hub_resource_scope");
            if (url.searchParams.has("upload_idempotency_key") && (!upload || url.searchParams.get("upload_idempotency_key") !== `eq.${upload.idempotencyKey}`)) fail("upload_key_scope");
            if (url.searchParams.has("state") && url.searchParams.get("state") !== "eq.published") fail("hub_state_query");
            if (url.searchParams.has("order") && !["created_at.asc", "version_number.asc", "published_at.desc", "requested_at.desc"].includes(url.searchParams.get("order")!)) fail("hub_order");
            // Explicit qualification scope: do not read another concurrent run's Hub rows.
            // This is a transport data restriction, not a replacement role decision.
            const scopeKey = table === TABLES[2] ? "resource_id" : "id";
            const scopeIds = [...new Set(owned().map((o) => table === TABLES[1] ? o.versionId : o.resourceId))];
            if (!url.searchParams.has(scopeKey)) url.searchParams.set(scopeKey, scopeIds.length ? `in.(${scopeIds.join(",")})` : "is.null");
            url.searchParams.set("limit", "100"); operation = `read_${table}`;
          } else fail("read_table");
          bump("database_reads", 500);
        } else {
          if (!writesEnabled || plan.host !== "adminA" || !extra || !upload) fail("database_write_scope");
          const admin = plan.actors.adminA.email.toLowerCase();
          if (table === TABLES[0] && method === "POST") {
            if (url.search || row.id !== extra.resourceId || row.title !== upload.title || row.purpose !== upload.purpose || row.kind !== "pdf" || row.created_by_admin !== admin || row.current_published_version_id !== null || !fields(row, ["id", "title", "purpose", "kind", "created_at", "created_by_admin", "current_published_version_id"])) fail("resource_insert");
            operation = "resources"; bump(operation, 1);
          } else if (table === TABLES[1] && method === "POST") {
            if (url.search || row.id !== extra.versionId || row.resource_id !== extra.resourceId || row.version_number !== 1 || row.state !== "draft" || row.sha256 !== PDF_SHA || row.size_bytes !== plan.pdf.sizeBytes || row.storage_key !== extra.objectKey || row.original_filename !== upload.originalFilename || row.upload_idempotency_key !== upload.idempotencyKey || row.uploaded_by_admin !== admin || row.content_type !== "application/pdf" || row.usage_policy !== "private" || !same(row.audience, upload.audience) || row.validation_ok !== true || !same(row.validation_reasons, []) || row.supersedes_version_id !== null || (row.change_summary ?? "") !== (upload.changeSummary ?? "") || !fields(row, ["id", "resource_id", "version_number", "state", "sha256", "size_bytes", "storage_key", "original_filename", "upload_idempotency_key", "uploaded_by_admin", "content_type", "usage_policy", "audience", "validation_ok", "validation_reasons", "supersedes_version_id", "change_summary", "uploaded_at"])) fail("version_insert");
            operation = "versions"; bump(operation, 1);
          } else if (table === TABLES[1] && method === "PATCH") {
            if (url.searchParams.get("id") !== `eq.${extra.versionId}` || url.searchParams.get("select") !== "id" || !["eq.draft", "eq.in_review"].includes(url.searchParams.get("state") ?? "") || ["reviewed_at", "reviewed_by_admin", "review_reason"].some((k) => url.searchParams.get(k) !== "is.null") || [...url.searchParams.keys()].some((k) => !["id", "state", "reviewed_at", "reviewed_by_admin", "review_reason", "select"].includes(k)) || row.state !== "in_review" || !fields(row, ["state", "reviewed_at", "reviewed_by_admin", "review_reason"])) fail("review_cas");
            const approval = Object.keys(row).length === 4;
            if (approval ? row.reviewed_by_admin !== admin || row.review_reason !== plan.pdf.reviewReason || !Number.isFinite(Date.parse(String(row.reviewed_at))) || url.searchParams.get("state") !== "eq.in_review" : Object.keys(row).length !== 1 || url.searchParams.get("state") !== "eq.draft") fail("review_provenance");
            operation = "reviews"; bump(operation, 2); bump(approval ? "content_approval" : "request_review", 1);
          } else if (method === "POST" && ["rpc/research_resource_hub_publish", "rpc/research_resource_hub_withdraw"].includes(table)) {
            const withdraw = table.endsWith("withdraw");
            if (url.search || row.p_resource_id !== extra.resourceId || row.p_version_id !== extra.versionId || row.p_actor !== admin || !Number.isFinite(Date.parse(String(row.p_at))) || !fields(row, ["p_resource_id", "p_version_id", "p_actor", "p_at", "p_reason"]) || (withdraw ? row.p_reason !== plan.pdf.withdrawReason : row.p_reason !== undefined)) fail("transition_scope");
            operation = withdraw ? "withdrawals" : "publications"; bump(operation, 1);
          } else if (table === TABLES[2] && method === "POST") {
            if (url.search || row.resource_id !== extra.resourceId || row.version_id !== extra.versionId || row.member_id !== plan.actors.eligible.memberId || row.outcome !== "delivered" || row.reason !== null || !fields(row, ["id", "resource_id", "version_id", "member_id", "requested_at", "outcome", "reason"])) fail("delivery_scope");
            operation = "deliveries"; bump(operation, 2);
          } else fail("write_table_or_rpc");
        }
      } else fail("endpoint");
      const event: BrowserEvent = { operation, sequence: ++sequence, phase: "attempt", write, ...(actor ? { actor } : {}), ...(write && extra ? { scope: { ...extra } } : {}) };
      assertHealthy(); // Shutdown may have occurred while an async body was being read.
      record(event);
      const body = write ? await req.arrayBuffer() : undefined; assertHealthy();
      controller = new AbortController(); controllers.add(controller);
      const response = await upstream(url, { method, headers: req.headers, body, redirect: "error", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
      if (response.redirected || response.status >= 300 && response.status < 400) fail("provider_redirect");
      const parts: Uint8Array[] = []; let size = 0; const reader = response.body?.getReader();
      if (reader) while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 2 * 1024 * 1024) { await reader.cancel(); fail("response_size"); } parts.push(part.value); }
      const bytes = Buffer.concat(parts); record({ ...event, phase: "response", status: response.status });
      if (!response.ok) fail("provider_or_uncertain_effect");
      if (operation.startsWith("password_")) {
        const payload = rowOf(json(bytes)); authUser(payload.user, actor);
        if (typeof payload.access_token !== "string" || typeof payload.refresh_token !== "string") fail("auth_session_response");
        sessions.set(sha256(payload.access_token), actor!); // No token or password in any receipt.
      } else if (operation === "auth_user" || operation === "auth_fixture_precheck") { const data = rowOf(json(bytes)); authUser(data.user ?? data, actor); }
      else if (operation === "reviews") {
        assertBrowserCasResult(json(bytes), extra?.versionId);
      }
      else if (operation.startsWith("read_research_resource_")) {
        const data = json(bytes); const rows = data === null ? [] : Array.isArray(data) ? data : [data];
        for (const raw of rows) {
          const row = rowOf(raw);
          const valid = operation === `read_${TABLES[0]}` ? owned().some((o) => o.resourceId === row.id)
            : operation === `read_${TABLES[1]}` ? owned().some((o) => o.resourceId === row.resource_id && o.versionId === row.id)
              : owned().some((o) => o.resourceId === row.resource_id && (row.version_id === undefined || row.version_id === null || o.versionId === row.version_id));
          if (!valid) fail("unowned_response_row");
        }
      }
      return new globalThis.Response(bytes.length ? bytes : null, { status: response.status, headers: response.headers });
    } catch (error) {
      stopped = true; failed = true;
      firstRefusal ??= { code: error instanceof BrowserBoundaryError ? error.code : "transport_or_journal_failure", operation: operation || "request_validation", phase: "boundary" };
      try { record({ operation: "boundary_refusal", phase: "local", write: false, detail: firstRefusal.code }); } catch { /* Original cause is retained in memory even when the durable writer failed. */ }
      if (error instanceof BrowserBoundaryError) throw error; return fail("transport_or_journal_failure");
    }
    finally { if (controller) controllers.delete(controller); }
  };
  const bounded: typeof fetch = (input, init) => { const pending = dispatch(input, init); active.add(pending); void pending.then(() => active.delete(pending), () => active.delete(pending)); return pending; };
  return {
    fetch: bounded, counts, owned, extra: () => extra, assertHealthy, actorFor,
    enableWrites() { assertHealthy(); writesEnabled = true; },
    stop() { stopped = true; for (const controller of controllers) controller.abort(); },
    hasFailed: () => failed,
    firstRefusal: () => firstRefusal,
    async drain() { while (active.size) await Promise.allSettled([...active]); },
    bindUpload(raw: unknown) {
      assertHealthy(); if (plan.host !== "adminA") fail("observer_upload");
      const parsed = resourceUploadSchema.safeParse(raw); if (!parsed.success) fail("upload_metadata");
      const { idempotencyKey, resourceId, ...metadata } = parsed.data;
      const normalize = (v: typeof metadata) => ({ ...v, changeSummary: v.changeSummary ?? "" });
      if (resourceId || !same(normalize(metadata), normalize(plan.pdf.metadata))) fail("approved_metadata");
      if (upload && !same(upload, parsed.data)) fail("second_upload_identity");
      if (!upload) { record({ operation: "bind_upload_key", phase: "local", write: false, detail: sha256(idempotencyKey) }); upload = parsed.data; }
    },
  };
}

const SOURCE_PATHS = ["client", "server", "shared", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "script/build.mjs"];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function privatePath(filename: string) {
  if (!path.isAbsolute(filename)) fail("absolute_private_path"); const actual = realpathSync(filename);
  try { if (execFileSync("git", ["-C", lstatSync(actual).isDirectory() ? actual : path.dirname(actual), "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() === "true") fail("private_path_in_git"); } catch (error) { if (error instanceof BrowserBoundaryError) throw error; }
  return actual;
}
const manifestSchema = z.object({ sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE), buildExitCode: z.literal(0), files: z.array(z.object({ path: z.string().regex(/^[A-Za-z0-9_./-]+$/), sha256: hash, sizeBytes: z.number().int().nonnegative() }).strict()).min(1).max(10000) }).strict();
export function verifyBuildFiles(directory: string, raw: unknown) {
  const parsed = manifestSchema.safeParse(raw); if (!parsed.success) fail("build_manifest");
  const manifest = parsed.data; const actual = realpathSync(directory); const files = new Map(manifest.files.map((f) => [f.path, f]));
  if (files.size !== manifest.files.length || !files.has("index.html")) fail("build_inventory");
  const found: string[] = [];
  const walk = (dir: string, prefix = "") => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const name = prefix + entry.name; if (entry.isSymbolicLink()) fail("asset_symlink"); if (entry.isDirectory()) walk(path.join(dir, entry.name), `${name}/`); else found.push(name); } };
  walk(actual);
  if (!same([...files.keys()].sort(), found.sort())) fail("build_inventory");
  for (const [name, entry] of files) { if (name.includes("..") || name.startsWith("/") || name.includes("//")) fail("asset_path"); const bytes = readFileSync(path.join(actual, name)); if (bytes.length !== entry.sizeBytes || sha256(bytes) !== entry.sha256) fail("asset_hash"); }
  return { directory: actual, files };
}
export function verifyBrowserLocal(planFile: string) {
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH) fail("inherited_node_configuration");
  const bytes = readFileSync(privatePath(planFile)); const plan = validateBrowserPlan(json(bytes));
  if (sha256(readFileSync(fileURLToPath(import.meta.url))) !== plan.hostFileSha256) fail("host_source_hash");
  if (git("ls-tree", "-r", "HEAD", "--", ...SOURCE_PATHS) !== git("ls-tree", "-r", SOURCE_SHA, "--", ...SOURCE_PATHS) || git("status", "--porcelain", "--untracked-files=all", "--", ...SOURCE_PATHS)) fail("application_source_binding");
  if (git("rev-parse", `${SOURCE_SHA}^{tree}`) !== SOURCE_TREE) fail("source_tree");
  const pdf = readFileSync(privatePath(plan.pdf.path)); if (pdf.length !== plan.pdf.sizeBytes || sha256(pdf) !== PDF_SHA) fail("approved_pdf");
  const buildBytes = readFileSync(privatePath(plan.buildManifestFile)); if (sha256(buildBytes) !== plan.buildManifestSha256) fail("build_manifest_hash");
  const build = verifyBuildFiles(plan.distDirectory, json(buildBytes, 2 * 1024 * 1024));
  if (!path.isAbsolute(plan.receiptDirectory) || existsSync(plan.receiptDirectory)) fail("fresh_receipt_directory");
  privatePath(path.dirname(plan.receiptDirectory)); privatePath(plan.credentialsFile); // Existence only; no credential read in preflight.
  return { plan, planSha256: sha256(bytes), build };
}

const credentialsSchema = z.object({ projectRef: z.literal(STAGING_PROJECT), origin: z.literal(STAGING_ORIGIN), serviceKey: z.string().min(20), anonKey: z.string().min(20) }).strict();
export function validateBrowserCredentials(raw: unknown) {
  const parsed = credentialsSchema.safeParse(raw); if (!parsed.success) fail("server_credentials_schema"); const keys = parsed.data;
  const claims = (token: string): Row | null => { try { return rowOf(JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"))); } catch { return null; } };
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(keys.serviceKey) && (claims(keys.serviceKey)?.ref !== STAGING_PROJECT || claims(keys.serviceKey)?.role !== "service_role")) fail("service_key_binding");
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(keys.anonKey) && (claims(keys.anonKey)?.ref !== STAGING_PROJECT || claims(keys.anonKey)?.role !== "anon")) fail("public_key_binding");
  return keys;
}

export const ADMIN_BASE = "/api/admin/research/resource-hub/resources";
export const PARTNER_BASE = "/api/research/partner/resources";
const incidental = new Set(["/api/research/catalog", "/api/research/customer-account/overview", "/api/research/customer-account/catalog-priority"]);
export function allowedBrowserRoute(method: string, pathname: string, observer: boolean): boolean {
  if (method === "GET" && ["/api/config", "/api/research/me", "/api/research/member/me", "/api/admin/me", ADMIN_BASE, PARTNER_BASE, ...incidental].includes(pathname)) return true;
  if (method === "GET" && new RegExp(`^${ADMIN_BASE}/${uuidPattern}(?:/versions/${uuidPattern}/download)?$`).test(pathname)) return true;
  if (method === "GET" && !observer && new RegExp(`^${PARTNER_BASE}/${uuidPattern}/download$`).test(pathname)) return true;
  return !observer && method === "POST" && (pathname === ADMIN_BASE || new RegExp(`^${ADMIN_BASE}/${uuidPattern}/versions/${uuidPattern}/review$`).test(pathname));
}

/** Pipe control for Windows: exactly `stop\n` requests the same graceful freeze/drain. */
export function createStdinStopHandler(stop: () => void, invalid: () => void) {
  let text = "", complete = false;
  return (chunk: Buffer | string) => {
    if (complete) return;
    text += chunk.toString();
    if (Buffer.byteLength(text) > 16 || /[^stop\r\n]/.test(text)) { complete = true; invalid(); return; }
    if (text.includes("\n")) { complete = true; if (text === "stop\n" || text === "stop\r\n") stop(); else invalid(); }
  };
}

export async function runBrowserHost(local: ReturnType<typeof verifyBrowserLocal>, approvedHash: string) {
  if (approvedHash !== local.planSha256) fail("approved_plan_hash"); const { plan, build } = local;
  const keys = validateBrowserCredentials(json(readFileSync(privatePath(plan.credentialsFile))));
  mkdirSync(plan.receiptDirectory, { mode: 0o700 }); const journal = openSync(path.join(plan.receiptDirectory, "browser-host-events.jsonl"), "wx", 0o600);
  const append = (value: unknown) => appendBrowserJournal(journal, value);
  const originalFetch = globalThis.fetch.bind(globalThis);
  const boundary = createBrowserBoundary(plan, originalFetch, append); let server: import("node:http").Server | undefined; let failureCode: string | null = null; let timer: ReturnType<typeof setTimeout> | undefined;
  let origin = ""; let apiRequests = 0, assetRequests = 0; let closing = false; const servedAssets: Record<string, string> = {};
  const delayedTimers = new Set<ReturnType<typeof setTimeout>>();
  const delayedDownloads: { kind: "admin" | "partner"; sha256: string; status: "waiting" | "sent" | "client_disconnected" | "host_stopped" }[] = [];
  const finish = () => {
    closing = true;
    boundary.stop();
    for (const handle of delayedTimers) clearTimeout(handle); delayedTimers.clear();
    for (const entry of delayedDownloads) if (entry.status === "waiting") entry.status = "host_stopped";
    server?.close(); server?.closeAllConnections();
  };
  const stdinStop = createStdinStopHandler(finish, () => { failureCode = "stdin_control_refused"; finish(); });
  try {
    append({ type: "start", sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, hostFileSha256: plan.hostFileSha256, planSha256: local.planSha256, host: plan.host, startedAt: new Date().toISOString(), authCaps: AUTH_CAPS[plan.host], refreshCap: 0, proxyOriginLimitation: true, retained: plan.existing });
    for (const key of Object.keys(process.env)) if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE)$/i.test(key)) delete process.env[key];
    Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: STAGING_ORIGIN, SUPABASE_SERVICE_ROLE_KEY: keys.serviceKey, SUPABASE_ANON_KEY: keys.anonKey, ADMIN_EMAIL: plan.actors[plan.host].email, RESEARCH_RESOURCE_HUB_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true", RESEARCH_REFERRAL_V1_ENABLED: "false", RESEARCH_FOUNDING_ACTIVATION_ENABLED: "false", RESEARCH_MEMBERSHIP_BILLING_ENABLED: "false" });
    globalThis.fetch = boundary.fetch; console.log = console.warn = console.error = () => {};
    const [{ default: express }, { requireSupabaseAdmin }, { requireMember }, { getSupabaseAdmin }, { registerMemberApi }, { resolveResourceHubService }, { registerResourceHubAdminApi }, { registerPartnerPortalApi }, { resolvePartnerPortalPort }] = await Promise.all([
      import("express"), import("../../server/routes"), import("../../server/research/member-auth"), import("../../server/supabase"), import("../../server/research/members"), import("../../server/research/resource-hub/production"), import("../../server/research/resource-hub/admin-routes"), import("../../server/research/partners/portal-routes"), import("../../server/research/partners/portal-production"),
    ]);
    const admin = getSupabaseAdmin(), portal = resolvePartnerPortalPort();
    const bucket = await admin.storage.getBucket(BUCKET); if (bucket.error || bucket.data?.id !== BUCKET || bucket.data.public !== false) fail("private_bucket_precheck");
    for (const name of ACTORS) {
      const expected = plan.actors[name]; const user = await admin.auth.admin.getUserById(expected.authUserId); if (user.error || !user.data.user) fail("auth_fixture_precheck");
      const member = await admin.from("research_members").select("id,auth_user_id,application_id,status").eq("auth_user_id", expected.authUserId).maybeSingle();
      if (member.error || (member.data?.id ?? null) !== expected.memberId || (member.data?.application_id ?? null) !== expected.applicationId || (member.data?.status ?? null) !== expected.memberStatus) fail("member_precheck");
      const partner = expected.memberId ? await portal.findPartnerForMember(expected.memberId) : null;
      if (expected.partner ? partner?.partnerId !== expected.partner.id || partner.role !== expected.partner.role || partner.state !== expected.partner.state : partner !== null) fail("partner_precheck");
    }
    for (const table of TABLES) { const rows = await admin.from(table).select(table === TABLES[0] ? "id" : "id,resource_id"); if (rows.error) fail("hub_precheck"); }
    const app: Express = express(); app.disable("x-powered-by");
    app.use((req, res, next) => {
      try {
        boundary.assertHealthy();
        if (req.get("host") !== new URL(origin).host || req.get("origin") && req.get("origin") !== origin || req.get("sec-fetch-site") === "cross-site" || /%|\\/.test(req.path)) { res.sendStatus(403); return; }
        res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; object-src 'none'; frame-src 'none'; base-uri 'none'; form-action 'self'" });
        if (req.path.startsWith("/__managed_supabase/")) { if (++apiRequests > 300) fail("local_api_cap"); next(); return; }
        if (req.path.startsWith("/api/")) {
          if (++apiRequests > 300) fail("local_api_cap");
          if (req.originalUrl.includes("?") || !allowedBrowserRoute(req.method, req.path, plan.host === "adminB")) { res.sendStatus(503); return; }
        } else if (req.method !== "GET") { res.sendStatus(404); return; }
        next();
      } catch (error) { failureCode = error instanceof BrowserBoundaryError ? error.code : "local_gate"; boundary.stop(); res.sendStatus(503); finish(); }
    });
    app.use(express.json({ limit: "16kb" }));
    app.get("/__managed_host/status", (_req, res) => res.json({ status: "BROWSER_HOST_READY", sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, host: plan.host, hostFileSha256: plan.hostFileSha256, planSha256: local.planSha256, buildManifestSha256: plan.buildManifestSha256, requestCounts: { ...boundary.counts }, ownedScope: boundary.owned(), extraScope: boundary.extra(), delayedDownloads: delayedDownloads.map((entry) => ({ ...entry })), proxyOriginLimitation: true }));
    app.all("/__managed_supabase/auth/v1/:operation", async (req, res) => {
      try {
        const authPath = req.originalUrl.slice("/__managed_supabase".length);
        if (!["GET", "POST"].includes(req.method) || !["token", "user", "logout"].includes(String(req.params.operation))) { res.sendStatus(403); return; }
        const headers = new Headers({ apikey: keys.anonKey, "content-type": "application/json" });
        headers.set("Authorization", req.get("authorization") ?? `Bearer ${keys.anonKey}`);
        const response = await boundary.fetch(`${STAGING_ORIGIN}${authPath}`, { method: req.method, headers, body: req.method === "POST" && req.params.operation === "token" ? JSON.stringify(req.body) : undefined });
        const bytes = Buffer.from(await response.arrayBuffer()); res.status(response.status).type("application/json").send(bytes);
      } catch (error) { failureCode = error instanceof BrowserBoundaryError ? error.code : "auth_proxy"; boundary.stop(); res.status(503).json({ error: "qualification_host_stopped" }); finish(); }
    });
    app.use("/__managed_supabase", (_req, res) => { res.sendStatus(403); });
    app.get("/api/config", (_req, res) => res.json({ supabaseUrl: `${origin}/__managed_supabase`, supabaseAnonKey: keys.anonKey, metaPixelId: null, turnstileSiteKey: null, calendlyUrl: "" }));
    app.get("/api/research/me", (_req, res) => res.json({ configured: true, authed: false, publicMode: false }));
    app.get("/api/admin/me", requireSupabaseAdmin, (req, res) => res.json({ success: true, email: (req as Request & { adminEmail?: string }).adminEmail }));
    for (const route of incidental) app.get(route, (_req, res) => res.status(503).json({ ok: false, code: "outside_browser_qualification_scope" }));
    app.use((req, res, next) => {
      try {
        if (req.method === "POST" && req.path === ADMIN_BASE) boundary.bindUpload(decodeResourceUploadMetadata(req.get("x-xenios-resource-upload")));
        if (req.method === "POST" && req.path.endsWith("/review")) {
          const parsed = resourceVersionReviewSchema.safeParse(req.body), extra = boundary.extra();
          if (!parsed.success || !extra || req.path !== `${ADMIN_BASE}/${extra.resourceId}/versions/${extra.versionId}/review`) fail("review_route_scope");
          if (parsed.data.action === "approve_content" && parsed.data.reason !== plan.pdf.reviewReason || parsed.data.action === "withdraw" && parsed.data.reason !== plan.pdf.withdrawReason) fail("review_reason_scope");
        }
        if (req.method === "GET" && req.path.endsWith("/download")) {
          const send = res.send.bind(res); let scheduled = false;
          res.send = ((body: unknown) => {
            if (closing) { res.destroy(); return res; }
            if (res.statusCode !== 200 || !Buffer.isBuffer(body) || scheduled) return send(body); scheduled = true;
            const entry: typeof delayedDownloads[number] = { kind: req.path.startsWith(ADMIN_BASE) ? "admin" : "partner", sha256: sha256(body), status: "waiting" }; delayedDownloads.push(entry);
            append({ type: "delayed_delivery", ...entry, delayMs: 4000 });
            const handle = setTimeout(() => {
              delayedTimers.delete(handle); if (closing) return;
              try { entry.status = res.destroyed ? "client_disconnected" : "sent"; append({ type: "delayed_delivery_settled", ...entry }); if (!res.destroyed) send(body); }
              catch { failureCode = "delayed_delivery_receipt_or_send"; finish(); }
            }, 4000); delayedTimers.add(handle); return res;
          }) as Response["send"];
        }
        next();
      } catch (error) { failureCode = error instanceof BrowserBoundaryError ? error.code : "browser_scope"; boundary.stop(); res.sendStatus(503); finish(); }
    });
    registerMemberApi(app);
    const hub = resolveResourceHubService(); registerResourceHubAdminApi(app, requireSupabaseAdmin, { service: hub });
    registerPartnerPortalApi(app, { port: portal, submissionsEnabled: false, resourceHub: hub }, { requireMember: async (req, res, next) => { await requireMember(req, res, next); } });
    app.get("*", (req, res) => {
      try {
        if (++assetRequests > 2000) fail("asset_request_cap");
        const route = req.path.slice(1); const name = build.files.has(route) ? route : ["/", "/research", "/research/sign-in", "/research/account", "/research/partners/resources", "/admin/research/resource-hub"].includes(req.path) ? "index.html" : null;
        if (!name) { res.sendStatus(404); return; } const entry = build.files.get(name)!; const filename = path.join(build.directory, name);
        if (lstatSync(filename).isSymbolicLink()) fail("asset_symlink"); const bytes = readFileSync(filename); if (bytes.length !== entry.sizeBytes || sha256(bytes) !== entry.sha256) fail("served_asset_hash");
        servedAssets[name] = entry.sha256; append({ type: "served_asset", path: name, sha256: entry.sha256, sizeBytes: bytes.length }); res.type(path.extname(name)).send(bytes);
      } catch (error) { failureCode = error instanceof BrowserBoundaryError ? error.code : "static_asset"; boundary.stop(); res.sendStatus(503); finish(); }
    });
    server = await new Promise<import("node:http").Server>((resolve, reject) => { const listening = app.listen(0, "127.0.0.1", () => resolve(listening)); listening.on("error", reject); });
    const address = server.address(); if (!address || typeof address === "string" || address.address !== "127.0.0.1") fail("loopback_binding"); origin = `http://127.0.0.1:${address.port}`;
    boundary.enableWrites(); process.stdout.write(`${JSON.stringify({ status: "BROWSER_HOST_READY", origin, host: plan.host, sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, planSha256: local.planSha256 })}\n`);
    timer = setTimeout(() => { failureCode = "observation_time_cap"; finish(); }, 30 * 60 * 1000);
    process.stdin.on("data", stdinStop); process.stdin.resume();
    process.once("SIGINT", finish); process.once("SIGTERM", finish);
    await new Promise<void>((resolve) => server!.once("close", resolve));
  } catch (error) { failureCode = error instanceof BrowserBoundaryError ? error.code : "host_failure_private_review_required"; }
  finally {
    if (timer) clearTimeout(timer); finish(); await boundary.drain(); finish();
    process.stdin.removeListener("data", stdinStop); process.stdin.pause();
    process.removeListener("SIGINT", finish); process.removeListener("SIGTERM", finish);
    // CLI-only process: retain the stopped transport and suppressed provider logging until exit.
    // Canonical async continuations must never regain an unbounded native network outlet.
    if (boundary.hasFailed()) failureCode = boundary.firstRefusal()?.code ?? failureCode ?? "boundary_stopped_review_actual_state";
    const receipt = { status: failureCode ? "STOP_REVIEW_ACTUAL_STATE" : "HOST_STOPPED_BROWSER_VERIFICATION_SEPARATE", failureCode, firstRefusal: boundary.firstRefusal(), sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, host: plan.host, hostFileSha256: plan.hostFileSha256, planSha256: local.planSha256, buildManifestSha256: plan.buildManifestSha256, finishedAt: new Date().toISOString(), requestCounts: boundary.counts, apiRequests, assetRequests, servedAssets, delayedDownloads, ownedScope: boundary.owned(), extraScope: boundary.extra(), cleanupPerformed: false, allRetainedDataPreserved: true, productionContacted: false, notProven: ["direct-origin Auth browser configuration", "unscoped full Hub library", "full production shell", "ASTRA-B acceptance", "browser assertions without independent driver evidence", "managed concurrency", "production activation"] };
    append({ type: "finish", ...receipt }); closeSync(journal); writeFileSync(path.join(plan.receiptDirectory, "browser-host-result.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    if (failureCode) process.exitCode = 1;
  }
}

export async function main(args = process.argv.slice(2)) {
  const values = new Map<string, string>(); let execute = false;
  for (let i = 0; i < args.length; i++) { const key = args[i]!; if (key === "--execute" && !execute) { execute = true; continue; } if (!["--plan", "--approved-plan-sha256"].includes(key) || values.has(key) || !args[i + 1] || args[i + 1]!.startsWith("--")) fail("arguments"); values.set(key, args[++i]!); }
  const filename = values.get("--plan"); if (!filename) fail("private_plan_required"); const local = verifyBrowserLocal(filename);
  if (!execute) { if (values.has("--approved-plan-sha256")) fail("execute_flag_required"); process.stdout.write(`${JSON.stringify({ status: "LOCAL_PREFLIGHT_PASS", sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, host: local.plan.host, planSha256: local.planSha256, networkRequests: 0, credentialReads: 0 })}\n`); return; }
  await runBrowserHost(local, values.get("--approved-plan-sha256") ?? "");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => { process.stderr.write(`${JSON.stringify({ status: "REFUSED", code: error instanceof BrowserBoundaryError ? error.code : "local_preflight_failed" })}\n`); process.exitCode = 1; });
