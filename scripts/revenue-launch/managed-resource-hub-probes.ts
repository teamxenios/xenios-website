/**
 * Managed staging PROBES for the Resource Hub activation hardening. Runs after (or
 * independently of) the foundation harness and proves what that harness records as
 * not proven: the upload-race loser and its private residue, identical/different
 * retries, zero-version admin handling, the concurrent review loser, and NULL,
 * millisecond and microsecond `reviewed_at` round trips through the real adapter.
 * Usage: node --import tsx scripts/revenue-launch/managed-resource-hub-probes.ts --plan ABSOLUTE_PRIVATE_JSON
 * Execute only a reviewed plan: add --execute --approved-plan-sha256 HEX.
 * Never imports server/index.ts, starts jobs, signs in/out, grants accounts, deletes anything,
 * or touches rows that existed before the run. Real browser logout/switching is NOT proved here.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HUB_BUCKET, HUB_TABLES, ManagedHubBoundaryError, sha256, type ActorName, type ManagedHubPlan } from "./lib/managed-resource-hub-boundary";
import {
  PROBE_EXPECTED_WRITES,
  createManagedHubProbeBoundary,
  probeText,
  validateManagedHubProbePlan,
  type ManagedHubProbePlan,
} from "./lib/managed-resource-hub-probe-boundary";
import { appendManagedHubJournal, validateManagedHubCredentials } from "./managed-resource-hub-qa";
import { encodeResourceUploadMetadata, type ResourceAdminDto, type ResourceCardDto } from "../../shared/research/resource-hub/contract";

function fail(code: string): never {
  throw new ManagedHubBoundaryError(code);
}
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
/** Same private-file rule as the foundation runner: absolute, outside every checkout, never inside Git. */
function externalFile(filename: string): string {
  if (!path.isAbsolute(filename)) fail("absolute_private_path_required");
  const actual = realpathSync(filename);
  const relative = path.relative(realpathSync(root), actual);
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) fail("private_file_inside_checkout");
  try {
    if (execFileSync("git", ["-C", statSync(actual).isDirectory() ? actual : path.dirname(actual), "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() === "true") fail("private_file_inside_git");
  } catch (error) {
    if (error instanceof ManagedHubBoundaryError) throw error;
  }
  return actual;
}
function readJson(filename: string): unknown {
  const bytes = readFileSync(externalFile(filename));
  if (bytes.length > 64 * 1024) fail("private_json_size");
  try {
    return JSON.parse(bytes.toString("utf8"));
  } catch {
    return fail("private_json_parse");
  }
}

export function parseManagedHubProbePlanBytes(bytes: Uint8Array) {
  if (bytes.length > 64 * 1024) fail("private_json_size");
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(bytes).toString("utf8"));
  } catch {
    return fail("private_json_parse");
  }
  return { ...validateManagedHubProbePlan(raw), planSha256: sha256(bytes) };
}

/** Provider timestamptz text: `2026-09-08T16:00:00.123456+00:00`, fraction optional, never a `Z`. */
export const PROVIDER_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?\+00:00$/;

/** The microsecond value a probe writes: the observed second with a fraction Date cannot represent. */
export function microsecondVariant(providerText: string): string {
  if (!PROVIDER_TIMESTAMP.test(providerText)) fail("provider_timestamp_shape");
  return `${providerText.slice(0, 19)}.123456+00:00`;
}

/** The PDF variant used ONLY to provoke the different-bytes refusal; the boundary refuses it at storage anyway. */
export function differentBytesVariant(pdf: Uint8Array): Uint8Array {
  return Buffer.concat([Buffer.from(pdf), Buffer.from("\n% probe variant: never stored\n", "latin1")]);
}

export function verifyLocalProbePlan(planFile: string) {
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH) fail("inherited_node_loader_configuration");
  const bytes = readFileSync(externalFile(planFile));
  const { plan, managed, planSha256 } = parseManagedHubProbePlanBytes(bytes);
  if (git("rev-parse", "HEAD") !== plan.sourceSha || git("rev-parse", "HEAD^{tree}") !== plan.sourceTree || git("status", "--porcelain", "--untracked-files=all")) fail("clean_source_binding");
  try {
    git("merge-base", "--is-ancestor", plan.precisionFixCommit, plan.sourceSha);
  } catch {
    fail("precision_fix_ancestry");
  }
  if (plan.precisionFixCommit === "ad2a6b7ccd1339fa7ba5224e926a6be0b80a8a77" || plan.precisionFixCommit === "3814c687ef9293f84f939c372fdbc01b278a9193") fail("unfixed_source");
  const pdf = readFileSync(externalFile(plan.pdf.path));
  if (pdf.length !== plan.pdf.sizeBytes || sha256(pdf) !== plan.pdf.sha256) fail("approved_pdf_bytes");
  if (!path.isAbsolute(plan.receiptDirectory) || existsSync(plan.receiptDirectory)) fail("fresh_external_receipt_directory");
  externalFile(path.dirname(plan.receiptDirectory));
  externalFile(plan.credentialsFile); // Existence/path validation only; preflight never opens it.
  return { plan, managed, pdf, planSha256 };
}

type Row = Record<string, unknown>;
type Outcome = { check: string; status: "PASS" };
type ApiBody = { resource: ResourceAdminDto; resources: unknown[]; code?: string };

/** Order-independent digest of a row set; identity values stay in memory, only the digest is recorded. */
function canonical(rows: Row[]): string {
  const sorted = [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return sha256(JSON.stringify(sorted.map((row) => Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]])))));
}

/** CLI execution only: one process, one clean source, one run. Never call concurrently in an app process. */
async function execute(local: ReturnType<typeof verifyLocalProbePlan>, approvedHash: string) {
  const { plan, managed, pdf, planSha256 } = local;
  if (approvedHash !== planSha256) fail("approved_plan_hash");
  const credentials = validateManagedHubCredentials(readJson(plan.credentialsFile), managed);
  mkdirSync(plan.receiptDirectory, { mode: 0o700 });
  const journal = openSync(path.join(plan.receiptDirectory, "managed-probe-events.jsonl"), "wx", 0o600);
  const append = (value: unknown) => appendManagedHubJournal(journal, value);
  const networkFetch = globalThis.fetch.bind(globalThis);
  const boundary = createManagedHubProbeBoundary(plan, networkFetch, append);
  const text = probeText(plan.runId);
  const oldEnv = { ...process.env };
  const oldConsole = { log: console.log, warn: console.warn, error: console.error };
  let server: import("node:http").Server | undefined;
  const outcomes: Outcome[] = [];
  const evidence: Record<string, unknown> = {};
  let success = false;
  let failureCode: string | null = null;
  try {
    append({ type: "start", kind: "managed-hub-probes", runId: plan.runId, foundationRunId: plan.foundationRunId, sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, planSha256, projectRef: plan.target.projectRef, startedAt: new Date().toISOString(), recovery: plan.recovery });
    for (const key of Object.keys(process.env)) {
      if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|NODE_PATH|NODE_OPTIONS)$/i.test(key)) delete process.env[key];
    }
    delete process.env.NODE_OPTIONS;
    Object.assign(process.env, {
      NODE_ENV: "production",
      SUPABASE_URL: credentials.origin,
      SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey,
      SUPABASE_ANON_KEY: credentials.anonKey,
      ADMIN_EMAIL: plan.actors.admin.email,
      RESEARCH_RESOURCE_HUB_ENABLED: "true",
      AFFILIATE_SYSTEM_ENABLED: "true",
      AFFILIATE_PORTAL_ENABLED: "true",
    });
    globalThis.fetch = boundary.fetch;
    console.log = console.warn = console.error = () => {};
    const [{ default: express }, { requireSupabaseAdmin }, { requireMember }, { getSupabaseAdmin, getSupabaseAnon }, { resolveResourceHubService }, { registerResourceHubAdminApi }, { registerPartnerPortalApi }, { resolvePartnerPortalPort }, { createSupabaseResourceHubStore }, { isResourceHubConflict }] = await Promise.all([
      import("express"),
      import("../../server/routes"),
      import("../../server/research/member-auth"),
      import("../../server/supabase"),
      import("../../server/research/resource-hub/production"),
      import("../../server/research/resource-hub/admin-routes"),
      import("../../server/research/partners/portal-routes"),
      import("../../server/research/partners/portal-production"),
      import("../../server/research/resource-hub/supabase-store"),
      import("../../server/research/resource-hub/store"),
    ]);
    const admin = getSupabaseAdmin();
    const anon = getSupabaseAnon();
    const keyCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (keyCheck.error) fail("authenticated_service_key_check");
    const bucket = await admin.storage.getBucket(HUB_BUCKET);
    if (bucket.error || !bucket.data || bucket.data.id !== HUB_BUCKET || bucket.data.public !== false) fail("private_bucket_precheck");
    const portal = resolvePartnerPortalPort();
    for (const name of Object.keys(plan.actors) as ActorName[]) {
      const expected = plan.actors[name];
      const user = await anon.auth.getUser(credentials.bearers[name]);
      if (user.error || user.data.user?.id !== expected.authUserId || user.data.user?.email?.toLowerCase() !== expected.email.toLowerCase() || !user.data.user.email_confirmed_at) fail("authenticated_identity_mismatch");
      const member = await admin.from("research_members").select("id,auth_user_id,status").eq("auth_user_id", expected.authUserId).maybeSingle();
      if (member.error || (member.data?.id ?? null) !== expected.memberId || (member.data?.status ?? null) !== expected.memberStatus) fail("canonical_member_mismatch");
      const partner = expected.memberId ? await portal.findPartnerForMember(expected.memberId) : null;
      if (expected.partner ? partner?.partnerId !== expected.partner.id || partner.role !== expected.partner.role || partner.state !== expected.partner.state : partner !== null) fail("canonical_partner_mismatch");
    }
    // Retained rows are read once, digested, and taught to the boundary. Nothing may change them.
    const retained: Record<string, { count: number; hash: string; ids: string[] }> = {};
    for (const table of HUB_TABLES) {
      const rows = await admin.from(table).select("*");
      if (rows.error || !Array.isArray(rows.data)) fail("retained_snapshot_read");
      if (rows.data.length >= plan.retainedRows.maxRowsPerTable) fail("retained_rows_exceed_probe_snapshot");
      const ids = (rows.data as Row[]).map((row) => String(row.id));
      boundary.retain(table, ids);
      retained[table] = { count: rows.data.length, hash: canonical(rows.data as Row[]), ids };
    }
    const priorKey = await admin.from(HUB_TABLES[1]).select("id").eq("upload_idempotency_key", plan.runId);
    if (priorKey.error || (priorKey.data ?? []).length !== 0) fail("probe_key_already_used");
    outcomes.push({ check: "managed Auth, canonical identities, private bucket and digested retained rows", status: "PASS" });

    const app = express();
    app.disable("x-powered-by");
    const { randomBytes } = await import("node:crypto");
    const driverKey = randomBytes(32).toString("hex");
    app.use((req, res, next) => {
      if (req.get("x-managed-hub-driver") !== driverKey || (req.query && Object.keys(req.query).length) || !["GET", "POST"].includes(req.method)) {
        res.sendStatus(404);
        return;
      }
      const base = "/api/admin/research/resource-hub/resources";
      const allowed = req.path === base || req.path.startsWith(`${base}/`) || req.path === "/api/research/partner/resources" || /^\/api\/research\/partner\/resources\/[a-f0-9-]+\/download$/.test(req.path);
      if (!allowed) {
        res.sendStatus(404);
        return;
      }
      next();
    });
    app.use(express.json({ limit: "2mb" }));
    const hub = resolveResourceHubService();
    registerResourceHubAdminApi(app, requireSupabaseAdmin, { service: hub });
    registerPartnerPortalApi(app, { port: portal, submissionsEnabled: false, resourceHub: hub }, {
      requireMember: async (req, res, next) => {
        await requireMember(req, res, next);
      },
    });
    server = await new Promise<import("node:http").Server>((resolve, reject) => {
      const listening = app.listen(0, "127.0.0.1", () => resolve(listening));
      listening.on("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string" || address.address !== "127.0.0.1") fail("loopback_binding");
    const origin = `http://127.0.0.1:${address.port}`;
    const base = "/api/admin/research/resource-hub/resources";
    const partnerBase = "/api/research/partner/resources";
    const raw = async (actorName: ActorName | null, route: string, init: RequestInit = {}) => {
      boundary.assertHealthy();
      if (!route.startsWith("/api/")) fail("driver_route");
      const headers = new Headers(init.headers);
      headers.set("x-managed-hub-driver", driverKey);
      if (actorName) headers.set("Authorization", `Bearer ${credentials.bearers[actorName]}`);
      const response = await networkFetch(`${origin}${route}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(45_000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      boundary.assertHealthy();
      if (response.redirected) fail("api_redirect");
      return { status: response.status, bytes, headers: response.headers, json: () => JSON.parse(Buffer.from(bytes).toString("utf8")) as ApiBody };
    };
    const call = async (label: string, actorName: ActorName | null, route: string, expectedStatus: number, init: RequestInit = {}) => {
      const result = await raw(actorName, route, init);
      if (result.status !== expectedStatus) fail("api_status");
      outcomes.push({ check: label, status: "PASS" });
      return result;
    };
    const uploadInit = (bytes: Uint8Array, filename = plan.pdf.metadata.originalFilename): RequestInit => ({
      method: "POST",
      headers: { "content-type": "application/pdf", "x-xenios-resource-upload": encodeResourceUploadMetadata({ ...plan.pdf.metadata, originalFilename: filename }) },
      body: bytes,
    });
    const reviewInit = (body: Row): RequestInit => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const countsNow = () => JSON.stringify(boundary.counts);
    const count = (name: keyof typeof PROBE_EXPECTED_WRITES) => boundary.counts[name] ?? 0;

    // Probe 1: upload race. The boundary holds both version inserts until both key lookups answered.
    boundary.enableWrites();
    const [first, second] = await Promise.all([raw("admin", base, uploadInit(pdf)), raw("admin", base, uploadInit(pdf))]);
    if (first.status !== 200 || second.status !== 200) fail("race_status");
    const winner = first.json().resource;
    if (JSON.stringify(winner) !== JSON.stringify(second.json().resource)) fail("race_projection_mismatch");
    if (boundary.scope.uploads.length !== 2 || count("versions") !== 2 || count("versionConflicts") !== 1 || count("objects") !== 2 || count("resources") !== 2) fail("race_not_observed");
    if (boundary.lookupsObserved() < 2) fail("race_gate_not_exercised");
    const version = winner.versions[0];
    if (!version || winner.resourceId !== boundary.scope.winnerResourceId || winner.versions.length !== 1 || version.versionId !== boundary.scope.winnerVersionId || version.sha256 !== plan.pdf.sha256 || version.state !== "draft" || version.reviewedAt !== null) fail("winner_projection");
    const residual = boundary.scope.uploads.find((u) => u.resourceId !== winner.resourceId);
    if (!residual) fail("residual_scope");
    outcomes.push({ check: "concurrent identical uploads: one version, loser recovered to the winner after a 23505 insert", status: "PASS" });
    evidence.race = { winnerResourceId: winner.resourceId, winnerVersionId: version.versionId, residualResourceId: residual.resourceId, lookupsBeforeInserts: boundary.lookupsObserved(), loserPath: "unique_violation_then_identity_recheck" };

    // Probe 2: retries against the settled key never write.
    const settled = countsNow();
    const retry = (await call("identical retry after the race", "admin", base, 200, uploadInit(pdf))).json().resource;
    if (JSON.stringify(retry) !== JSON.stringify(winner)) fail("retry_changed_resource");
    await call("different filename retry refusal", "admin", base, 409, uploadInit(pdf, `different-${plan.pdf.metadata.originalFilename}`));
    await call("different bytes retry refusal", "admin", base, 409, uploadInit(differentBytesVariant(pdf)));
    await call("different bytes and filename retry refusal", "admin", base, 409, uploadInit(differentBytesVariant(pdf), `different-${plan.pdf.metadata.originalFilename}`));
    if (countsNow() !== settled) fail("retry_wrote");
    outcomes.push({ check: "no retry variant wrote an object or a row", status: "PASS" });

    // Probe 3: the residual is a private, zero-version resource that no partner can see.
    const listed = (await call("admin list with a zero-version resource", "admin", base, 200)).json().resources as ResourceAdminDto[];
    const residualView = listed.find((r) => r.resourceId === residual.resourceId);
    const winnerView = listed.find((r) => r.resourceId === winner.resourceId);
    if (!residualView || residualView.versions.length !== 0 || residualView.currentPublishedVersionId !== null || !winnerView || winnerView.versions.length !== 1) fail("residual_projection");
    const residualItem = (await call("admin item read of the zero-version resource", "admin", `${base}/${residual.resourceId}`, 200)).json().resource;
    if (residualItem.versions.length !== 0) fail("residual_item");
    const residualVersions = await admin.from(HUB_TABLES[1]).select("id").eq("resource_id", residual.resourceId);
    if (residualVersions.error || (residualVersions.data ?? []).length !== 0) fail("residual_version_rows");
    const residualObject = await admin.storage.from(HUB_BUCKET).download(residual.objectKey);
    if (residualObject.error || !residualObject.data || sha256(new Uint8Array(await residualObject.data.arrayBuffer())) !== plan.pdf.sha256) fail("residual_object");
    for (const name of ["inside", "outside", "blocked"] as const) {
      if ((await call(`${name} library empty before publication`, name, partnerBase, 200)).json().resources.length !== 0) fail("library_not_empty");
    }
    outcomes.push({ check: "residual object retained privately with no version row and no partner visibility", status: "PASS" });

    // Probe 4: request review (NULL-provenance conditional update).
    const item = `${base}/${winner.resourceId}`;
    const reviewRoute = `${item}/versions/${version.versionId}/review`;
    const requested = (await call("request_review", "admin", reviewRoute, 200, reviewInit({ action: "request_review", idempotencyKey: `${plan.runId}-request` }))).json().resource;
    if (requested.versions[0]?.state !== "in_review" || requested.versions[0].reviewedAt !== null) fail("request_review_state");

    // Probe 5: concurrent approvals. The boundary holds both PATCHes until both reads of the version answered.
    boundary.armReviewGate();
    const [approvalA, approvalB] = await Promise.all([
      raw("admin", reviewRoute, reviewInit({ action: "approve_content", reason: text.approvalA, idempotencyKey: `${plan.runId}-approve-a` })),
      raw("admin", reviewRoute, reviewInit({ action: "approve_content", reason: text.approvalB, idempotencyKey: `${plan.runId}-approve-b` })),
    ]);
    boundary.disarmReviewGate();
    const statuses = [approvalA.status, approvalB.status].sort();
    if (statuses[0] !== 200 || statuses[1] !== 409 || count("reviews") !== 3 || count("reviewConflicts") !== 1) fail("concurrent_review_not_observed");
    const loser = approvalA.status === 409 ? approvalA : approvalB;
    if (loser.json().code !== "resource_state_conflict") fail("concurrent_review_denial");
    outcomes.push({ check: "concurrent approvals: exactly one recorded, the other a typed conflict from a zero-row conditional update", status: "PASS" });

    // Probe 6: reviewed_at precision through the real adapter and real PostgREST.
    const store = createSupabaseResourceHubStore(() => admin as never);
    const observed = await store.getVersion(version.versionId);
    if (!observed || observed.state !== "in_review" || !observed.reviewedAt || !PROVIDER_TIMESTAMP.test(observed.reviewedAt) || observed.reviewedByAdmin !== plan.actors.admin.email.toLowerCase() || !observed.reviewReason || !knownReason(observed.reviewReason)) fail("reviewed_snapshot");
    const approvedView = (await call("admin item after approval", "admin", item, 200)).json().resource;
    if (approvedView.versions[0]?.reviewedAt !== observed.reviewedAt) fail("reviewed_at_projection");
    await store.updateVersion(version.versionId, { changeSummary: text.casMs }, observed);
    const observedMs = await store.getVersion(version.versionId);
    if (!observedMs || observedMs.changeSummary !== text.casMs || observedMs.reviewedAt !== observed.reviewedAt) fail("cas_ms");
    outcomes.push({ check: "non-NULL reviewed_at conditional update matches the provider text exactly", status: "PASS" });
    const micro = microsecondVariant(observedMs.reviewedAt ?? "");
    await store.updateVersion(version.versionId, { reviewedAt: micro }, observedMs);
    const observedUs = await store.getVersion(version.versionId);
    if (!observedUs || observedUs.reviewedAt !== micro) fail("microsecond_round_trip");
    await store.updateVersion(version.versionId, { changeSummary: text.casUs }, observedUs);
    const afterUs = await store.getVersion(version.versionId);
    if (!afterUs || afterUs.changeSummary !== text.casUs || afterUs.reviewedAt !== micro) fail("cas_us");
    outcomes.push({ check: "microsecond reviewed_at survives read-back and a conditional update keyed on it", status: "PASS" });
    const truncated = new Date(micro).toISOString();
    if (truncated === micro || !truncated.endsWith("Z")) fail("truncation_fixture");
    const stale = await store.updateVersion(version.versionId, { changeSummary: text.casStale }, { ...afterUs, reviewedAt: truncated }).then(() => null, (error: unknown) => error);
    if (!isResourceHubConflict(stale)) fail("stale_truncated_snapshot_accepted");
    const afterStale = await store.getVersion(version.versionId);
    if (!afterStale || afterStale.changeSummary !== text.casUs || afterStale.reviewedAt !== micro) fail("stale_wrote");
    if (count("reviews") !== 7 || count("reviewConflicts") !== 2) fail("review_accounting");
    outcomes.push({ check: "a millisecond-truncated snapshot of a microsecond review is refused without a write", status: "PASS" });
    evidence.precision = { serviceReviewedAt: observed.reviewedAt, microsecondValue: micro, truncatedSnapshot: truncated };

    // Probe 7: the winner publishes and delivers unchanged after every race.
    await call("publish", "admin", reviewRoute, 200, reviewInit({ action: "publish", idempotencyKey: `${plan.runId}-publish` }));
    const library = (await call("in-audience library after publication", "inside", partnerBase, 200)).json().resources as ResourceCardDto[];
    if (library.length !== 1 || library[0]?.resourceId !== winner.resourceId || library[0].reviewedAt !== micro) fail("published_library");
    const delivered = await call("authorized download of the winner", "inside", `${partnerBase}/${winner.resourceId}/download`, 200);
    if (sha256(delivered.bytes) !== plan.pdf.sha256 || delivered.headers.get("cache-control") !== "no-store") fail("delivery_hash_or_cache");
    await call("withdraw", "admin", reviewRoute, 200, reviewInit({ action: "withdraw", reason: text.withdraw, idempotencyKey: `${plan.runId}-withdraw` }));
    await call("withdrawn download denied", "inside", `${partnerBase}/${winner.resourceId}/download`, 404);
    const retainedItem = (await call("retained withdrawn winner", "admin", item, 200)).json().resource;
    if (retainedItem.currentPublishedVersionId !== null || retainedItem.versions[0]?.state !== "withdrawn" || retainedItem.versions[0].reviewedAt !== micro || retainedItem.versions[0].changeSummary !== text.casUs) fail("withdraw_postcondition");
    outcomes.push({ check: "winner published, delivered byte-exact, withdrawn, and denied afterwards", status: "PASS" });

    // Probe 8: retained rows unchanged; fresh rows exactly this run's; both objects still private.
    for (const table of HUB_TABLES) {
      const rows = await admin.from(table).select("*");
      if (rows.error || !Array.isArray(rows.data)) fail("retained_recheck_read");
      const before = retained[table]!;
      const old = (rows.data as Row[]).filter((row) => before.ids.includes(String(row.id)));
      const fresh = (rows.data as Row[]).filter((row) => !before.ids.includes(String(row.id)));
      if (old.length !== before.count || canonical(old) !== before.hash) fail("retained_rows_changed");
      const expectedFresh = table === HUB_TABLES[0] ? 2 : table === HUB_TABLES[1] ? 1 : 2;
      if (fresh.length !== expectedFresh) fail("fresh_row_accounting");
      const inScope = (row: Row) =>
        table === HUB_TABLES[0] ? [winner.resourceId, residual.resourceId].includes(String(row.id)) : table === HUB_TABLES[1] ? row.id === version.versionId : row.resource_id === winner.resourceId;
      if (!fresh.every(inScope)) fail("fresh_row_scope");
    }
    for (const upload of boundary.scope.uploads) {
      const object = await admin.storage.from(HUB_BUCKET).download(upload.objectKey);
      if (object.error || !object.data || sha256(new Uint8Array(await object.data.arrayBuffer())) !== plan.pdf.sha256) fail("object_retention");
    }
    for (const [name, expected] of Object.entries(PROBE_EXPECTED_WRITES)) if (boundary.counts[name] !== expected) fail("write_accounting");
    boundary.assertHealthy();
    outcomes.push({ check: "retained rows byte-identical, fresh rows exactly this run's, both objects retained privately", status: "PASS" });
    success = true;
  } catch (error) {
    failureCode = error instanceof ManagedHubBoundaryError ? error.code : "unclassified_failure_private_review_required";
  } finally {
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => resolve());
        server!.closeAllConnections();
      });
    }
    globalThis.fetch = networkFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    Object.assign(console, oldConsole);
    const receipt = {
      schemaVersion: 1,
      kind: "managed-hub-probes",
      runId: plan.runId,
      foundationRunId: plan.foundationRunId,
      sourceSha: plan.sourceSha,
      sourceTree: plan.sourceTree,
      planSha256,
      projectRef: plan.target.projectRef,
      finishedAt: new Date().toISOString(),
      status: success ? "PASS_BOUNDED_MANAGED_PROBES" : "STOP_REVIEW_ACTUAL_STATE",
      failureCode,
      outcomes,
      requestCounts: boundary.counts,
      ownedScope: boundary.scope,
      evidence,
      preservedPartialWrites: true,
      cleanupPerformed: false,
      productionContacted: false,
      proven: success
        ? [
            "upload race loser recovered after 23505 with winner identity recheck",
            "different-bytes and different-filename retries refused without writes",
            "zero-version residual resource: admin-visible, partner-invisible, object retained privately",
            "concurrent review loser from a zero-row conditional update",
            "NULL, millisecond and microsecond reviewed_at round trips through the real adapter",
            "millisecond-truncated snapshot refused without a write",
            "winner byte-exact through publish, delivery and withdrawal",
            "retained rows byte-identical",
          ]
        : [],
      notProven: ["full browser composition", "real sign-in/logout/account switching", "bucket-wide orphan enumeration beyond this run's two objects", "production activation"],
      recovery: plan.recovery,
    };
    append({ type: "finish", ...receipt });
    closeSync(journal);
    writeFileSync(path.join(plan.receiptDirectory, "managed-probes-result.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, failureCode, checksPassed: outcomes.length, productionContacted: false })}\n`);
  }
  if (!success) process.exitCode = 1;

  function knownReason(reason: string): boolean {
    return reason === text.approvalA || reason === text.approvalB;
  }
}

export async function main(args: string[] = process.argv.slice(2)) {
  const allowed = new Set(["--plan", "--execute", "--approved-plan-sha256"]);
  const values = new Map<string, string>();
  let executeMode = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (!allowed.has(key) || values.has(key) || (key === "--execute" && executeMode)) fail("arguments");
    if (key === "--execute") {
      executeMode = true;
      continue;
    }
    const value = args[++index];
    if (!value || value.startsWith("--")) fail("arguments");
    values.set(key, value);
  }
  const planFile = values.get("--plan");
  if (!planFile) fail("private_plan_required");
  const local = verifyLocalProbePlan(planFile);
  if (!executeMode) {
    if (values.has("--approved-plan-sha256")) fail("execute_flag_required");
    process.stdout.write(`${JSON.stringify({ status: "LOCAL_PREFLIGHT_PASS", kind: "managed-hub-probes", sourceSha: local.plan.sourceSha, sourceTree: local.plan.sourceTree, planSha256: local.planSha256, networkRequests: 0, credentialReads: 0, managedQualification: "NOT_RUN" })}\n`);
    return;
  }
  await execute(local, values.get("--approved-plan-sha256") ?? "");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    process.stderr.write(`${JSON.stringify({ status: "REFUSED", code: error instanceof ManagedHubBoundaryError ? error.code : "local_preflight_failed" })}\n`);
    process.exitCode = 1;
  });
}

export type { ManagedHubPlan, ManagedHubProbePlan };
