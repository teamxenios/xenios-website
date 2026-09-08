/**
 * Managed staging API qualification only. Default preflight is local and uses no credentials.
 * Usage: node --import tsx scripts/revenue-launch/managed-resource-hub-qa.ts --plan ABSOLUTE_PRIVATE_JSON
 * Execute only a reviewed plan: add --execute --approved-plan-sha256 HEX.
 * Never imports server/index.ts, starts jobs, signs in/out, grants accounts, or deletes recovery evidence.
 * Real browser logout/switching and non-null microsecond/concurrent CAS are NOT proved by this runner.
 */
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ACTOR_NAMES, EXPECTED_WRITES, HUB_BUCKET, HUB_TABLES, ManagedHubBoundaryError, assertStagingTarget, createManagedHubFetchBoundary, sha256, validateManagedHubPlan, type ActorName, type ManagedHubPlan } from "./lib/managed-resource-hub-boundary";
import { encodeResourceUploadMetadata, type ResourceAdminDto } from "../../shared/research/resource-hub/contract";

function fail(code: string): never { throw new ManagedHubBoundaryError(code); }
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
function externalFile(filename: string): string {
  if (!path.isAbsolute(filename)) fail("absolute_private_path_required");
  const actual = realpathSync(filename);
  const relative = path.relative(realpathSync(root), actual);
  if (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative)) fail("private_file_inside_checkout");
  // A different worktree is still Git, not private artifact storage.
  try {
    if (execFileSync("git", ["-C", statSync(actual).isDirectory() ? actual : path.dirname(actual), "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim() === "true") fail("private_file_inside_git");
  } catch (error) { if (error instanceof ManagedHubBoundaryError) throw error; }
  return actual;
}
function readJson(filename: string): unknown {
  const bytes = readFileSync(externalFile(filename));
  if (bytes.length > 64 * 1024) fail("private_json_size");
  try { return JSON.parse(bytes.toString("utf8")); } catch { return fail("private_json_parse"); }
}

/** Hash and parse one bounded read; a concurrent file replacement cannot change approved inputs. */
export function parseManagedHubPlanBytes(bytes: Uint8Array) {
  if (bytes.length > 64 * 1024) fail("private_json_size");
  let raw: unknown;
  try { raw = JSON.parse(Buffer.from(bytes).toString("utf8")); } catch { return fail("private_json_parse"); }
  return { plan: validateManagedHubPlan(raw), planSha256: sha256(bytes) };
}

/** A partial filesystem write is not a durable receipt. Complete it before fsync or fail closed. */
export function appendManagedHubJournal(
  descriptor: number,
  value: unknown,
  write: (fd: number, bytes: Uint8Array, offset: number, length: number) => number = (fd, bytes, offset, length) => writeSync(fd, bytes, offset, length),
  sync: (fd: number) => void = fsyncSync,
) {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`, "utf8");
  let offset = 0;
  while (offset < bytes.length) {
    const written = write(descriptor, bytes, offset, bytes.length - offset);
    if (!Number.isInteger(written) || written <= 0 || written > bytes.length - offset) fail("journal_short_write");
    offset += written;
  }
  sync(descriptor);
}

export function verifyLocalManagedHubPlan(planFile: string) {
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH) fail("inherited_node_loader_configuration");
  const bytes = readFileSync(externalFile(planFile));
  const { plan, planSha256 } = parseManagedHubPlanBytes(bytes);
  if (git("rev-parse", "HEAD") !== plan.sourceSha || git("rev-parse", "HEAD^{tree}") !== plan.sourceTree || git("status", "--porcelain", "--untracked-files=all")) fail("clean_source_binding");
  // The independently reviewed precision fix must be present, not merely mentioned in a plan.
  try { git("merge-base", "--is-ancestor", plan.precisionFixCommit, plan.sourceSha); } catch { fail("precision_fix_ancestry"); }
  if (plan.precisionFixCommit === "ad2a6b7ccd1339fa7ba5224e926a6be0b80a8a77" || plan.precisionFixCommit === "3814c687ef9293f84f939c372fdbc01b278a9193") fail("unfixed_source");
  const pdf = readFileSync(externalFile(plan.pdf.path));
  if (pdf.length !== plan.pdf.sizeBytes || sha256(pdf) !== plan.pdf.sha256) fail("approved_pdf_bytes");
  if (!path.isAbsolute(plan.receiptDirectory) || existsSync(plan.receiptDirectory)) fail("fresh_external_receipt_directory");
  externalFile(path.dirname(plan.receiptDirectory));
  // Existence/path validation only. Default preflight never opens the credentials file.
  externalFile(plan.credentialsFile);
  return { plan, pdf, planSha256 };
}

const credentialsSchema = z.object({
  projectRef: z.string(), origin: z.string(), serviceKey: z.string().min(20), anonKey: z.string().min(20),
  bearers: z.object({ admin: z.string().min(20), inside: z.string().min(20), outside: z.string().min(20), blocked: z.string().min(20), nonPartner: z.string().min(20) }).strict(),
}).strict();

export function validateManagedHubCredentials(raw: unknown, plan: ManagedHubPlan) {
  const parsed = credentialsSchema.safeParse(raw);
  if (!parsed.success) fail("credentials_schema");
  const keys = parsed.data;
  assertStagingTarget(keys.projectRef, keys.origin);
  if (keys.projectRef !== plan.target.projectRef || keys.origin !== plan.target.origin) fail("credentials_target_binding");
  if (keys.serviceKey.startsWith("sb_publishable_")) fail("service_key_grade");
  const decode = (token: string): Record<string, unknown> | null => {
    try { return JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8")); } catch { return null; }
  };
  // Decoding rejects obvious wrong-target keys; it is not authentication proof.
  const service = decode(keys.serviceKey);
  if (!/^sb_secret_[A-Za-z0-9_-]+$/.test(keys.serviceKey) && (service?.ref !== keys.projectRef || service?.role !== "service_role")) fail("legacy_service_key_binding");
  const publicKey = decode(keys.anonKey);
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(keys.anonKey) && (publicKey?.ref !== keys.projectRef || publicKey?.role !== "anon")) fail("anon_key_grade_or_binding");
  for (const name of ACTOR_NAMES) {
    const claims = decode(keys.bearers[name]);
    if (claims?.iss !== `${keys.origin}/auth/v1` || claims?.sub !== plan.actors[name].authUserId || typeof claims.exp !== "number" || claims.exp * 1000 < Date.now() + 15 * 60_000) fail("bearer_target_or_lifetime");
  }
  return keys;
}

/** CLI execution only: one process, one clean source, one run. Never call concurrently in an app process. */
async function execute(local: ReturnType<typeof verifyLocalManagedHubPlan>, approvedHash: string) {
  const { plan, pdf, planSha256 } = local;
  if (approvedHash !== planSha256) fail("approved_plan_hash");
  const credentials = validateManagedHubCredentials(readJson(plan.credentialsFile), plan);
  mkdirSync(plan.receiptDirectory, { mode: 0o700 }); // Nonrecursive and exclusive: no implicit retry/reuse.
  const journalPath = path.join(plan.receiptDirectory, "managed-api-events.jsonl");
  const journal = openSync(journalPath, "wx", 0o600);
  const append = (value: unknown) => appendManagedHubJournal(journal, value);
  const networkFetch = globalThis.fetch.bind(globalThis);
  const boundary = createManagedHubFetchBoundary(plan, networkFetch, append);
  const oldEnv = { ...process.env };
  const oldConsole = { log: console.log, warn: console.warn, error: console.error };
  let server: import("node:http").Server | undefined;
  const outcomes: { check: string; status: "PASS" }[] = [];
  let success = false;
  let failureCode: string | null = null;
  try {
    append({ type: "start", runId: plan.runId, sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, planSha256, projectRef: plan.target.projectRef, startedAt: new Date().toISOString(), recovery: plan.recovery });
    // Canonical guards import routes.ts, whose legacy DB module only constructs a pool when
    // DATABASE_URL exists. Remove inherited app/provider configuration BEFORE any dynamic imports.
    for (const key of Object.keys(process.env)) {
      if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE|NODE_PATH|NODE_OPTIONS)$/i.test(key)) delete process.env[key];
    }
    delete process.env.NODE_OPTIONS;
    Object.assign(process.env, {
      NODE_ENV: "production", SUPABASE_URL: credentials.origin, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey,
      SUPABASE_ANON_KEY: credentials.anonKey, ADMIN_EMAIL: plan.actors.admin.email,
      RESEARCH_RESOURCE_HUB_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true",
    });
    globalThis.fetch = boundary.fetch;
    // Existing modules log provider failures. Keep raw messages/identities out of all output.
    console.log = console.warn = console.error = () => {};
    const [{ default: express }, { requireSupabaseAdmin }, { requireMember }, { getSupabaseAdmin, getSupabaseAnon }, { resolveResourceHubService }, { registerResourceHubAdminApi }, { registerPartnerPortalApi }, { resolvePartnerPortalPort }] = await Promise.all([
      import("express"), import("../../server/routes"), import("../../server/research/member-auth"), import("../../server/supabase"),
      import("../../server/research/resource-hub/production"), import("../../server/research/resource-hub/admin-routes"),
      import("../../server/research/partners/portal-routes"), import("../../server/research/partners/portal-production"),
    ]);
    const admin = getSupabaseAdmin();
    const anon = getSupabaseAnon();
    const keyCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (keyCheck.error) fail("authenticated_service_key_check");
    const bucket = await admin.storage.getBucket(HUB_BUCKET);
    if (bucket.error || !bucket.data || bucket.data.id !== HUB_BUCKET || bucket.data.public !== false) fail("private_bucket_precheck");
    const portal = resolvePartnerPortalPort();
    for (const name of ACTOR_NAMES) {
      const expected = plan.actors[name];
      const user = await anon.auth.getUser(credentials.bearers[name]);
      if (user.error || user.data.user?.id !== expected.authUserId || user.data.user?.email?.toLowerCase() !== expected.email.toLowerCase() || !user.data.user.email_confirmed_at) fail("authenticated_identity_mismatch");
      const member = await admin.from("research_members").select("id,auth_user_id,status").eq("auth_user_id", expected.authUserId).maybeSingle();
      if (member.error || (member.data?.id ?? null) !== expected.memberId || (member.data?.status ?? null) !== expected.memberStatus) fail("canonical_member_mismatch");
      const partner = expected.memberId ? await portal.findPartnerForMember(expected.memberId) : null;
      if (expected.partner ? partner?.partnerId !== expected.partner.id || partner.role !== expected.partner.role || partner.state !== expected.partner.state : partner !== null) fail("canonical_partner_mismatch");
    }
    for (const table of HUB_TABLES) {
      const rows = await admin.from(table).select("id");
      if (rows.error || !Array.isArray(rows.data) || rows.data.length !== 0) fail("isolated_empty_hub_precheck");
    }
    outcomes.push({ check: "managed Auth, canonical identities, empty Hub tables and private bucket", status: "PASS" });
    const app = express();
    app.disable("x-powered-by");
    // Only this driver knows the ephemeral loopback request secret. Other local callers cannot
    // use the mounted service-role composition or trigger even a denied-delivery audit.
    const { randomBytes } = await import("node:crypto");
    const driverKey = randomBytes(32).toString("hex");
    app.use((req, res, next) => {
      if (req.get("x-managed-hub-driver") !== driverKey || req.query && Object.keys(req.query).length || !["GET", "POST"].includes(req.method)) { res.sendStatus(404); return; }
      const base = "/api/admin/research/resource-hub/resources";
      const allowed = req.path === base || req.path.startsWith(`${base}/`) || req.path === "/api/research/partner/resources" || /^\/api\/research\/partner\/resources\/[a-f0-9-]+\/download$/.test(req.path);
      if (!allowed) { res.sendStatus(404); return; }
      next();
    });
    app.use(express.json({ limit: "2mb" }));
    const hub = resolveResourceHubService();
    registerResourceHubAdminApi(app, requireSupabaseAdmin, { service: hub });
    registerPartnerPortalApi(app, { port: portal, submissionsEnabled: false, resourceHub: hub }, {
      requireMember: async (req, res, next) => { await requireMember(req, res, next); },
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
    const call = async (label: string, actorName: ActorName | null, route: string, expectedStatus: number, init: RequestInit = {}) => {
      boundary.assertHealthy();
      if (!route.startsWith("/api/")) fail("driver_route");
      const headers = new Headers(init.headers);
      headers.set("x-managed-hub-driver", driverKey);
      if (actorName) headers.set("Authorization", `Bearer ${credentials.bearers[actorName]}`);
      const response = await networkFetch(`${origin}${route}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(30_000) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      boundary.assertHealthy();
      if (response.status !== expectedStatus || response.redirected) fail("api_status");
      outcomes.push({ check: label, status: "PASS" });
      return { response, bytes, json: () => JSON.parse(Buffer.from(bytes).toString("utf8")) as { resource: ResourceAdminDto; resources: { resourceId: string; versionId: string }[] } };
    };
    await call("signed-out admin refusal", null, base, 401);
    await call("ordinary member admin refusal", "nonPartner", base, 403);
    await call("non-partner library refusal", "nonPartner", partnerBase, 404);
    await call("admin empty library", "admin", base, 200);
    for (const name of ["inside", "outside", "blocked"] as const) {
      if ((await call(`${name} canonical guard before writes`, name, partnerBase, 200)).json().resources.length !== 0) fail("initial_library_not_empty");
    }
    boundary.enableWrites();
    const upload = { method: "POST", headers: { "content-type": "application/pdf", "x-xenios-resource-upload": encodeResourceUploadMetadata(plan.pdf.metadata) }, body: pdf };
    const first = (await call("managed immutable PDF upload", "admin", base, 200, upload)).json().resource;
    const version = first.versions[0];
    if (first.resourceId !== boundary.scope.resourceId || first.versions.length !== 1 || version?.versionId !== boundary.scope.versionId || version.sha256 !== plan.pdf.sha256 || version.state !== "draft") fail("uploaded_projection");
    const retry = (await call("identical upload retry", "admin", base, 200, upload)).json().resource;
    if (JSON.stringify(retry) !== JSON.stringify(first)) fail("retry_changed_resource");
    await call("different filename retry refusal", "admin", base, 409, { ...upload, headers: { ...upload.headers, "x-xenios-resource-upload": encodeResourceUploadMetadata({ ...plan.pdf.metadata, originalFilename: `different-${plan.pdf.metadata.originalFilename}` }) } });
    const item = `${base}/${first.resourceId}`;
    const review = `${item}/versions/${version.versionId}/review`;
    const preview = await call("admin private byte preview", "admin", `${item}/versions/${version.versionId}/download`, 200);
    if (sha256(preview.bytes) !== plan.pdf.sha256) fail("preview_hash");
    const action = (name: "request_review" | "approve_content" | "publish" | "withdraw", reason?: string) => call(name, "admin", review, 200, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, reason, idempotencyKey: `${plan.runId}-${name}` }) });
    await action("request_review");
    await action("approve_content", `Managed qualification ${plan.runId}`);
    await action("publish");
    const library = (await call("in-audience published library", "inside", partnerBase, 200)).json().resources;
    if (library.length !== 1 || library[0]?.resourceId !== first.resourceId) fail("inside_library");
    for (const name of ["outside", "blocked"] as const) {
      if ((await call(`${name} library empty`, name, partnerBase, 200)).json().resources.length !== 0) fail("denied_library");
      await call(`${name} download denied`, name, `${partnerBase}/${first.resourceId}/download`, 404);
    }
    const delivered = await call("authorized download", "inside", `${partnerBase}/${first.resourceId}/download`, 200);
    if (sha256(delivered.bytes) !== plan.pdf.sha256 || delivered.response.headers.get("cache-control") !== "no-store") fail("delivery_hash_or_cache");
    await action("withdraw", `Qualification complete ${plan.runId}`);
    await call("withdrawn download denied", "inside", `${partnerBase}/${first.resourceId}/download`, 404);
    const retained = (await call("retained withdrawn version", "admin", item, 200)).json().resource;
    if (retained.currentPublishedVersionId !== null || retained.versions[0]?.state !== "withdrawn") fail("withdraw_postcondition");
    const rows = await admin.from(HUB_TABLES[2]).select("id,member_id,outcome,reason").eq("resource_id", first.resourceId);
    const expectedDeliveries = [
      { member_id: plan.actors.inside.memberId, outcome: "delivered", reason: null },
      { member_id: plan.actors.outside.memberId, outcome: "denied", reason: "audience" },
      { member_id: plan.actors.blocked.memberId, outcome: "denied", reason: "audience" },
      { member_id: plan.actors.inside.memberId, outcome: "denied", reason: "not_published" },
    ];
    if (rows.error || rows.data?.length !== 4 || expectedDeliveries.some((expected) => rows.data!.filter((row) => row.member_id === expected.member_id && row.outcome === expected.outcome && row.reason === expected.reason).length !== 1)) fail("delivery_ledger_postcondition");
    for (const [table, count] of [[HUB_TABLES[0], 1], [HUB_TABLES[1], 1], [HUB_TABLES[2], 4]] as const) {
      const persisted = await admin.from(table).select("id");
      if (persisted.error || persisted.data?.length !== count) fail("persisted_row_accounting");
    }
    for (const [name, expected] of Object.entries(EXPECTED_WRITES)) if (boundary.counts[name] !== expected) fail("write_accounting");
    boundary.assertHealthy();
    outcomes.push({ check: "expected writes and retained delivery audit", status: "PASS" });
    success = true;
  } catch (error) {
    failureCode = error instanceof ManagedHubBoundaryError ? error.code : "unclassified_failure_private_review_required";
  } finally {
    if (server) await new Promise<void>((resolve) => { server!.close(() => resolve()); server!.closeAllConnections(); });
    globalThis.fetch = networkFetch;
    for (const key of Object.keys(process.env)) delete process.env[key];
    Object.assign(process.env, oldEnv);
    Object.assign(console, oldConsole);
    const receipt = {
      schemaVersion: 1, runId: plan.runId, sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, planSha256,
      projectRef: plan.target.projectRef, finishedAt: new Date().toISOString(), status: success ? "PASS_BOUNDED_MANAGED_API" : "STOP_REVIEW_ACTUAL_STATE",
      failureCode, outcomes, requestCounts: boundary.counts, ownedScope: boundary.scope,
      preservedPartialWrites: true, cleanupPerformed: false, productionContacted: false,
      notProven: ["full browser composition", "real sign-in/logout/account switching", "non-null microsecond timestamp CAS", "concurrent review loser", "different-bytes retry", "upload race loser and bucket-wide orphan accounting", "production activation"],
      recovery: plan.recovery,
    };
    append({ type: "finish", ...receipt });
    closeSync(journal);
    writeFileSync(path.join(plan.receiptDirectory, "managed-api-result.json"), `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, failureCode, checksPassed: outcomes.length, productionContacted: false })}\n`);
  }
  if (!success) process.exitCode = 1;
}

export async function main(args: string[] = process.argv.slice(2)) {
  const allowed = new Set(["--plan", "--execute", "--approved-plan-sha256"]);
  const values = new Map<string, string>();
  let executeMode = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index]!;
    if (!allowed.has(key) || values.has(key) || key === "--execute" && executeMode) fail("arguments");
    if (key === "--execute") { executeMode = true; continue; }
    const value = args[++index];
    if (!value || value.startsWith("--")) fail("arguments");
    values.set(key, value);
  }
  const planFile = values.get("--plan");
  if (!planFile) fail("private_plan_required");
  const local = verifyLocalManagedHubPlan(planFile);
  if (!executeMode) {
    if (values.has("--approved-plan-sha256")) fail("execute_flag_required");
    process.stdout.write(`${JSON.stringify({ status: "LOCAL_PREFLIGHT_PASS", sourceSha: local.plan.sourceSha, sourceTree: local.plan.sourceTree, planSha256: local.planSha256, networkRequests: 0, credentialReads: 0, managedQualification: "NOT_RUN" })}\n`);
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
