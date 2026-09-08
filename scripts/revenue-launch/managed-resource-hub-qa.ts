/**
 * Managed staging API qualification only. Default preflight is local and uses no credentials.
 * Usage: node --import tsx scripts/revenue-launch/managed-resource-hub-qa.ts --plan ABSOLUTE_PRIVATE_JSON
 * Execute only a reviewed plan: add --execute --approved-plan-sha256 HEX.
 * Never imports server/index.ts, starts jobs, signs in/out, grants accounts, or deletes recovery evidence.
 * Real browser logout/switching is separate; stored race payloads share one approved PDF hash.
 */
import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, realpathSync, statSync, writeFileSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { ACTOR_NAMES, APPLICATION_SHA, APPLICATION_TREE, HARNESS_PATHS, EXPECTED_WRITES, HUB_BUCKET, HUB_TABLES, ManagedHubBoundaryError, assertStagingTarget, createManagedHubFetchBoundary, sha256, validateManagedHubPlan, type ActorName, type WorkerName, type FixtureName, type ManagedHubPlan } from "./lib/managed-resource-hub-boundary";
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
  if (git("rev-parse", `${APPLICATION_SHA}^{tree}`) !== APPLICATION_TREE) fail("application_tree_binding");
  try { git("merge-base", "--is-ancestor", APPLICATION_SHA, plan.sourceSha); } catch { fail("application_ancestry"); }
  const changed = git("diff", "--name-only", APPLICATION_SHA, plan.sourceSha).split("\n").filter(Boolean);
  if (changed.some(name => !HARNESS_PATHS.includes(name))) fail("application_runtime_changed");
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
  bearers: z.object({ adminA: z.string().min(20), adminB: z.string().min(20), eligible: z.string().min(20), nonPartner: z.string().min(20), suspended: z.string().min(20) }).strict(),
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


type Credentials = ReturnType<typeof validateManagedHubCredentials>;
/** Wholly separate environment before loading any canonical module with configuration caches. */
function configureProduction(plan: ManagedHubPlan, credentials: Credentials, worker: WorkerName) {
  for (const key of Object.keys(process.env)) if (!/^(PATH|SYSTEMROOT|WINDIR|TEMP|TMP|HOME|USERPROFILE)$/i.test(key)) delete process.env[key];
  Object.assign(process.env, { NODE_ENV: "production", SUPABASE_URL: credentials.origin, SUPABASE_SERVICE_ROLE_KEY: credentials.serviceKey, SUPABASE_ANON_KEY: credentials.anonKey, ADMIN_EMAIL: plan.actors[worker].email, RESEARCH_RESOURCE_HUB_ENABLED: "true", AFFILIATE_SYSTEM_ENABLED: "true", AFFILIATE_PORTAL_ENABLED: "true" });
  console.log = console.warn = console.error = () => {};
}
const wireRequest = z.object({ kind: z.literal("fetch"), id: z.number().int().positive(), url: z.string().max(8192), method: z.enum(["GET", "HEAD", "POST", "PATCH", "DELETE", "PUT"]), headers: z.array(z.tuple([z.string().max(256), z.string().max(8192)])).max(64), body: z.string().max(1400000).nullable() }).strict();
const wireResponse = z.object({ kind: z.literal("response"), id: z.number().int().positive(), status: z.number().int(), headers: z.array(z.tuple([z.string(), z.string()])), body: z.string().max(2800000) }).strict();
const workerInit = z.object({ kind: z.literal("init"), worker: z.enum(["adminA", "adminB"]), driverKey: z.string().regex(/^[a-f0-9]{64}$/), plan: z.unknown(), credentials: z.unknown() }).strict();
/** IPC only carries private data between this parent and its own two children; nothing is printed. */
async function runWorker() {
  if (!process.send || !process.connected || process.env.NODE_OPTIONS || process.env.NODE_PATH) fail("worker_requires_clean_parent_ipc");
  const send = process.send.bind(process);
  const raw = await new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new ManagedHubBoundaryError("worker_init_timeout")), 30_000);
    process.once("message", value => { clearTimeout(timer); resolve(value); });
  });
  const init = workerInit.parse(raw), plan = validateManagedHubPlan(init.plan), credentials = validateManagedHubCredentials(init.credentials, plan);
  configureProduction(plan, credentials, init.worker);
  let id = 0;
  const pending = new Map<number, { resolve: (value: Response) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  process.on("disconnect", () => process.exit(1));
  process.on("message", rawResponse => {
    const result = wireResponse.safeParse(rawResponse);
    if (!result.success) { for (const item of pending.values()) item.reject(new ManagedHubBoundaryError("broker_refused")); return; }
    const data = result.data, item = pending.get(data.id);
    if (!item) return;
    pending.delete(data.id); clearTimeout(item.timer);
    item.resolve(new Response(data.body ? Buffer.from(data.body, "base64") : null, { status: data.status, headers: data.headers }));
  });
  globalThis.fetch = async (input, options) => {
    const request = new Request(input, options), current = ++id;
    const body = request.method === "GET" || request.method === "HEAD" ? null : Buffer.from(await request.arrayBuffer()).toString("base64");
    const message = wireRequest.parse({ kind: "fetch", id: current, url: request.url, method: request.method, headers: [...request.headers], body });
    return await new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(current); reject(new ManagedHubBoundaryError("broker_response_timeout")); }, 30_000);
      pending.set(current, { resolve, reject, timer });
      send(message, error => { if (error) { clearTimeout(timer); pending.delete(current); reject(new ManagedHubBoundaryError("broker_send_failed")); } });
    });
  };
  const [{ default: express }, { requireSupabaseAdmin }, { requireMember }, { resolveResourceHubService }, { registerResourceHubAdminApi }, { registerPartnerPortalApi }, { resolvePartnerPortalPort }] = await Promise.all([
    import("express"), import("../../server/routes"), import("../../server/research/member-auth"), import("../../server/research/resource-hub/production"), import("../../server/research/resource-hub/admin-routes"), import("../../server/research/partners/portal-routes"), import("../../server/research/partners/portal-production"),
  ]);
  const app = express(); app.disable("x-powered-by");
  app.use((req, res, next) => {
    const base = "/api/admin/research/resource-hub/resources";
    if (req.get("x-managed-hub-driver") !== init.driverKey || Object.keys(req.query).length || !["GET", "POST"].includes(req.method) || !(req.path === base || req.path.startsWith(`${base}/`) || req.path === "/api/research/partner/resources" || /^\/api\/research\/partner\/resources\/[a-f0-9-]+\/download$/.test(req.path))) { res.sendStatus(404); return; }
    next();
  });
  app.use(express.json({ limit: "2mb" }));
  const hub = resolveResourceHubService();
  registerResourceHubAdminApi(app, requireSupabaseAdmin, { service: hub });
  registerPartnerPortalApi(app, { port: resolvePartnerPortalPort(), submissionsEnabled: false, resourceHub: hub }, { requireMember: async (req, res, next) => { await requireMember(req, res, next); } });
  const server = await new Promise<import("node:http").Server>((resolve, reject) => { const s = app.listen(0, "127.0.0.1", () => resolve(s)); s.on("error", reject); });
  const address = server.address();
  if (!address || typeof address === "string" || address.address !== "127.0.0.1") fail("loopback_binding");
  send({ kind: "ready", port: address.port });
}

/** Promise adapter only; preserves the production store and real SDK's predicates/results. */
function storeClient(client: import("@supabase/supabase-js").SupabaseClient): import("../../server/research/resource-hub/supabase-store").SupabaseQueryLike {
  type Port = import("../../server/research/resource-hub/supabase-store").SupabaseQueryLike;
  type From = ReturnType<Port["from"]>;
  const select = (query: ReturnType<ReturnType<typeof client.from>["select"]>): ReturnType<From["select"]> => ({
    eq: (column, value) => select(query.eq(column, value)), order: (column, options) => select(query.order(column, options)),
    maybeSingle: async () => { const result = await query.maybeSingle(); return { ...result, data: result.data === null ? null : z.record(z.unknown()).parse(result.data) }; },
    then: async fn => { const result = await query; return fn({ ...result, data: result.data === null ? null : z.array(z.record(z.unknown())).parse(result.data) }); },
  });
  const update = (query: ReturnType<ReturnType<typeof client.from>["update"]>): ReturnType<From["update"]> => ({
    eq: (column, value) => update(query.eq(column, value)), is: (column, value) => update(query.is(column, value)), select: columns => ({ maybeSingle: async () => await query.select(columns).maybeSingle() }),
  });
  return { from: table => ({ select: columns => select(client.from(table).select(columns)), insert: async row => await client.from(table).insert(row), update: patch => update(client.from(table).update(patch)) }), rpc: async (name, args) => await client.rpc(name, args) };
}

/** Observe exits before claiming that this private composition has stopped. */
export async function stopManagedHubWorkers(children: ChildProcess[]): Promise<boolean> {
  const results = await Promise.all(children.map(child => new Promise<boolean>(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) { resolve(true); return; }
    const exited = () => { clearTimeout(timer); resolve(true); };
    const timer = setTimeout(() => { child.off("exit", exited); resolve(false); }, 5_000);
    child.once("exit", exited);
    if (child.connected) child.disconnect();
    child.kill();
  })));
  return results.every(Boolean);
}

async function execute(local: ReturnType<typeof verifyLocalManagedHubPlan>, approvedHash: string) {
  const { plan, pdf, planSha256 } = local;
  if (approvedHash !== planSha256) fail("approved_plan_hash");
  const credentials = validateManagedHubCredentials(readJson(plan.credentialsFile), plan);
  mkdirSync(plan.receiptDirectory, { mode: 0o700 });
  const journal = openSync(path.join(plan.receiptDirectory, "managed-api-events.jsonl"), "wx", 0o600);
  const append = (value: unknown) => appendManagedHubJournal(journal, value);
  const networkFetch = globalThis.fetch.bind(globalThis), oldEnv = { ...process.env }, oldConsole = { log: console.log, warn: console.warn, error: console.error };
  const boundary = createManagedHubFetchBoundary(plan, networkFetch, append);
  const children: ChildProcess[] = [];
  const outcomes: { check: string; status: "PASS" }[] = [];
  let success = false, failureCode: string | null = null;
  try {
    append({ type: "start", runId: plan.runId, sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, applicationSha: plan.applicationSha, applicationTree: plan.applicationTree, planSha256, projectRef: plan.target.projectRef, startedAt: new Date().toISOString(), recovery: plan.recovery, runScopedProjection: true });
    configureProduction(plan, credentials, "adminA"); globalThis.fetch = boundary.fetch;
    const [{ getSupabaseAdmin, getSupabaseAnon }, { resolvePartnerPortalPort }, { createSupabaseResourceHubStore }, { ResourceHubConflict }] = await Promise.all([import("../../server/supabase"), import("../../server/research/partners/portal-production"), import("../../server/research/resource-hub/supabase-store"), import("../../server/research/resource-hub/store")]);
    const admin = getSupabaseAdmin(), anon = getSupabaseAnon(), portal = resolvePartnerPortalPort();
    const store = createSupabaseResourceHubStore(() => storeClient(admin));
    const serviceCheck = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (serviceCheck.error) fail("authenticated_service_key_check");
    const bucket = await admin.storage.getBucket(HUB_BUCKET);
    if (bucket.error || !bucket.data || bucket.data.id !== HUB_BUCKET || bucket.data.public !== false) fail("private_bucket_precheck");
    for (const name of ACTOR_NAMES) {
      const expected = plan.actors[name], user = await anon.auth.getUser(credentials.bearers[name]);
      if (user.error || user.data.user?.id !== expected.authUserId || user.data.user?.email?.toLowerCase() !== expected.email.toLowerCase() || !user.data.user.email_confirmed_at) fail("authenticated_identity_mismatch");
      const member = await admin.from("research_members").select("id,auth_user_id,status").eq("auth_user_id", expected.authUserId).maybeSingle();
      if (member.error || (member.data?.id ?? null) !== expected.memberId || (member.data?.status ?? null) !== expected.memberStatus) fail("canonical_member_mismatch");
      const partner = expected.memberId ? await portal.findPartnerForMember(expected.memberId) : null;
      if (expected.partner ? partner?.partnerId !== expected.partner.id || partner.role !== expected.partner.role || partner.state !== expected.partner.state : partner !== null) fail("canonical_partner_mismatch");
    }
    const countRows = async (after: boolean) => {
      for (const [table, key] of [[HUB_TABLES[0], "resources"], [HUB_TABLES[1], "versions"], [HUB_TABLES[2], "deliveries"]] as const) {
        const result = await admin.from(table).select("id", { count: "exact", head: true }).limit(0);
        if (result.error || result.count !== plan.baseline[key] + (after ? EXPECTED_WRITES[key] : 0)) fail("baseline_or_delta_mismatch");
      }
    };
    await countRows(false);
    for (const fixture of Object.values(plan.fixtures)) if (await store.findVersionByUploadKey(fixture.idempotencyKey)) fail("run_key_already_exists");
    outcomes.push({ check: "managed Auth, exact five roles, retained baseline counts, unused run keys, private bucket", status: "PASS" });
    const { randomBytes } = await import("node:crypto");
    const driverKey = randomBytes(32).toString("hex");
    const origins = new Map<WorkerName, string>();
    const startWorker = async (worker: WorkerName) => {
      const child = spawn(process.execPath, ["--import", "tsx", fileURLToPath(import.meta.url), "--worker"], { cwd: root, stdio: ["ignore", "ignore", "ignore", "ipc"], windowsHide: true, env: process.env });
      children.push(child);
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new ManagedHubBoundaryError("worker_ready_timeout")), 30_000);
        child.once("error", () => { clearTimeout(timer); boundary.stop(); reject(new ManagedHubBoundaryError("worker_start_failed")); });
        child.once("exit", () => { clearTimeout(timer); boundary.stop(); reject(new ManagedHubBoundaryError("worker_exited")); });
        child.on("message", (raw: unknown) => {
          const ready = z.object({ kind: z.literal("ready"), port: z.number().int().min(1).max(65535) }).strict().safeParse(raw);
          if (ready.success) { if (origins.has(worker)) { boundary.stop(); return; } origins.set(worker, `http://127.0.0.1:${ready.data.port}`); clearTimeout(timer); resolve(); return; }
          void (async () => {
            const message = wireRequest.parse(raw);
            const response = await boundary.fetchFor(worker)(message.url, { method: message.method, headers: message.headers, body: message.body === null ? undefined : Buffer.from(message.body, "base64") });
            const data = { kind: "response", id: message.id, status: response.status, headers: [...response.headers], body: Buffer.from(await response.arrayBuffer()).toString("base64") };
            if (!child.connected) fail("worker_disconnected_after_request");
            child.send(data, error => { if (error) boundary.stop(); });
          })().catch(() => { boundary.stop(); if (child.connected) child.send({ kind: "refused" }); });
        });
        child.send({ kind: "init", worker, driverKey, plan, credentials });
      });
    };
    await startWorker("adminA"); await startWorker("adminB");
    const base = "/api/admin/research/resource-hub/resources", partnerBase = "/api/research/partner/resources";
    const call = async (label: string, worker: WorkerName, actor: ActorName | null, route: string, expected: number, init: RequestInit = {}) => {
      boundary.assertHealthy(); const origin = origins.get(worker); if (!origin || !route.startsWith("/api/")) fail("driver_route");
      const headers = new Headers(init.headers); headers.set("x-managed-hub-driver", driverKey); if (actor) headers.set("authorization", `Bearer ${credentials.bearers[actor]}`);
      const response = await networkFetch(`${origin}${route}`, { ...init, headers, redirect: "error", signal: AbortSignal.timeout(45_000) });
      const bytes = new Uint8Array(await response.arrayBuffer()); boundary.assertHealthy();
      if (response.status !== expected || response.redirected || bytes.length > 2 * 1024 * 1024) fail("api_status_or_response");
      outcomes.push({ check: label, status: "PASS" });
      return { response, bytes, json: () => JSON.parse(Buffer.from(bytes).toString("utf8")) as { resource: ResourceAdminDto; resources: { resourceId: string; versionId: string; actions?: { share?: boolean } }[] } };
    };
    const get = (label: string, actor: ActorName | null, route: string, status: number) => call(label, "adminA", actor, route, status);
    await get("signed-out admin refusal", null, base, 401); await get("ordinary member admin refusal", "nonPartner", base, 403);
    await get("non-partner library refusal", "nonPartner", partnerBase, 404);
    await call("adminB cannot use adminA composition", "adminA", "adminB", base, 403);
    await call("adminA cannot use adminB composition", "adminB", "adminA", base, 403);
    for (const worker of ["adminA", "adminB"] as const) if ((await call(`${worker} initial scoped library`, worker, worker, base, 200)).json().resources.length) fail("initial_run_projection");
    const upload = (fixture: FixtureName, losing = false, bytes: Uint8Array = pdf): RequestInit => ({ method: "POST", headers: { "content-type": "application/pdf", "x-xenios-resource-upload": encodeResourceUploadMetadata({ ...plan.fixtures[fixture], ...(losing ? { originalFilename: plan.pdf.losingFilename } : {}) }) }, body: bytes });
    const race = async (fixture: FixtureName) => {
      boundary.beginPhase(fixture === "control" ? "race_identical" : "race_filename");
      const result = await Promise.allSettled([call(`${fixture} winning upload`, "adminA", "adminA", base, 200, upload(fixture)), call(`${fixture} losing upload recovery`, "adminB", "adminB", base, fixture === "control" ? 200 : 409, upload(fixture, fixture === "journey"))]);
      const first = result[0], second = result[1]; if (!first || first.status !== "fulfilled" || !second || second.status !== "fulfilled") fail("upload_race_failed_review_state");
      const expected = boundary.winner(fixture), resource = first.value.json().resource;
      if (resource.resourceId !== expected.resourceId || resource.versions.length !== 1 || resource.versions[0]?.versionId !== expected.versionId || resource.versions[0].sha256 !== plan.pdf.sha256 || resource.versions[0].state !== "draft") fail("upload_winner_projection");
      if (fixture === "control" && JSON.stringify(second.value.json().resource) !== JSON.stringify(resource)) fail("identical_race_recovery_projection");
    };
    await race("control"); await race("journey");
    const control = boundary.winner("control"), journey = boundary.winner("journey");
    boundary.beginPhase("retry_controls");
    for (const fixture of ["control", "journey"] as const) {
      const response = await call(`${fixture} identical retry`, "adminA", "adminA", base, 200, upload(fixture));
      if (response.json().resource.resourceId !== boundary.winner(fixture).resourceId) fail("retry_changed_resource");
    }
    await call("same bytes different filename retry refusal", "adminA", "adminA", base, 409, upload("journey", true));
    const differentBytes = Buffer.concat([pdf, Buffer.from("\n% local retry difference; never stored\n")]);
    await call("different bytes retry refused before storage", "adminA", "adminA", base, 409, upload("journey", false, differentBytes));
    const rawVersion = async (id: string) => { const row = await store.getVersion(id); if (!row) fail("owned_version_missing"); return row; };
    const expectConflict = async (operation: () => Promise<void>, typed: boolean) => { let error: unknown; try { await operation(); } catch (caught) { error = caught; } if (!(error instanceof Error) || (error instanceof ResourceHubConflict) !== typed) fail("provider_conflict_classification"); boundary.assertHealthy(); };
    boundary.beginPhase("precision_seed");
    let row = await rawVersion(control.versionId); boundary.setExpectedReview(row);
    await store.updateVersion(control.versionId, { state: "in_review", reviewedAt: plan.precisionTimestamp, reviewedByAdmin: plan.actors.adminA.email.toLowerCase(), reviewReason: `Synthetic precision seed ${plan.runId}` }, row);
    row = await rawVersion(control.versionId);
    if (row.reviewedAt !== plan.precisionTimestamp || row.reviewedByAdmin !== plan.actors.adminA.email.toLowerCase() || row.reviewReason !== `Synthetic precision seed ${plan.runId}`) fail("microsecond_roundtrip");
    boundary.beginPhase("precision_match"); boundary.setExpectedReview(row);
    await store.updateVersion(control.versionId, { reviewReason: `Synthetic precision match ${plan.runId}` }, row);
    row = await rawVersion(control.versionId);
    if (row.reviewedAt !== plan.precisionTimestamp || row.reviewReason !== `Synthetic precision match ${plan.runId}`) fail("microsecond_matching_cas");
    const preserved = JSON.stringify(row);
    boundary.beginPhase("precision_stale"); const stale = { ...row, reviewedAt: plan.precisionTimestamp.replace(".123456", ".123457") }; boundary.setExpectedReview(stale);
    await expectConflict(() => store.updateVersion(control.versionId, { reviewReason: `Synthetic stale refusal ${plan.runId}` }, stale), true);
    if (JSON.stringify(await rawVersion(control.versionId)) !== preserved) fail("stale_cas_overwrite");
    boundary.beginPhase("precision_provider"); boundary.setExpectedReview(row);
    await expectConflict(() => store.updateVersion(control.versionId, { reviewedAt: "managed-qa-invalid-timestamp" }, row), false);
    if (JSON.stringify(await rawVersion(control.versionId)) !== preserved) fail("provider_refusal_overwrite");
    outcomes.push({ check: "actual managed adapter preserves six timestamp digits; matching CAS, stale CAS and provider errors distinguished", status: "PASS" });
    const action = (fixture: FixtureName, worker: WorkerName, name: "request_review" | "approve_content" | "publish" | "withdraw", status = 200) => {
      const owned = boundary.winner(fixture), reason = name === "approve_content" ? `Managed qualification ${plan.runId}` : name === "withdraw" ? `Qualification complete ${plan.runId}` : undefined;
      return call(`${fixture} ${worker} ${name}`, worker, worker, `${base}/${owned.resourceId}/versions/${owned.versionId}/review`, status, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: name, reason, idempotencyKey: `${plan.runId}-${fixture}-${name}-${worker}` }) });
    };
    boundary.beginPhase("request_review"); await action("journey", "adminA", "request_review");
    boundary.beginPhase("review_race");
    const reviews = await Promise.allSettled([action("journey", "adminA", "approve_content"), action("journey", "adminB", "approve_content", 409)]);
    if (reviews.some(result => result.status !== "fulfilled")) fail("review_race_failed_review_state");
    const reviewed = await rawVersion(journey.versionId);
    if (reviewed.reviewedByAdmin !== plan.actors.adminA.email.toLowerCase() || reviewed.reviewReason !== `Managed qualification ${plan.runId}` || !reviewed.reviewedAt) fail("concurrent_review_winner");
    boundary.beginPhase("publish_control"); await action("control", "adminA", "publish");
    boundary.beginPhase("publish_journey"); await action("journey", "adminA", "publish");
    boundary.beginPhase("delivery_checks");
    for (const owned of [control, journey]) {
      const preview = await get("authorized admin private preview", "adminA", `${base}/${owned.resourceId}/versions/${owned.versionId}/download`, 200);
      if (sha256(preview.bytes) !== plan.pdf.sha256 || preview.response.headers.get("cache-control") !== "no-store") fail("admin_preview_hash_or_cache");
    }
    const library = (await get("eligible sees only journey", "eligible", partnerBase, 200)).json().resources;
    if (library.length !== 1 || library[0]?.resourceId !== journey.resourceId || library[0].actions?.share !== false) fail("eligible_library_scope");
    if ((await get("suspended library empty", "suspended", partnerBase, 200)).json().resources.length) fail("suspended_library");
    await get("eligible outside-audience denied", "eligible", `${partnerBase}/${control.resourceId}/download`, 404);
    await get("suspended direct download denied", "suspended", `${partnerBase}/${journey.resourceId}/download`, 404);
    const delivered = await get("eligible private bytes delivered", "eligible", `${partnerBase}/${journey.resourceId}/download`, 200);
    if (sha256(delivered.bytes) !== plan.pdf.sha256 || delivered.response.headers.get("cache-control") !== "no-store") fail("delivery_hash_or_cache");
    for (const orphan of boundary.owned.filter(o => o.worker === "adminB")) {
      const item = (await get("retained empty orphan resource", "adminA", `${base}/${orphan.resourceId}`, 200)).json().resource;
      if (item.versions.length || item.currentPublishedVersionId !== null || await store.getVersion(orphan.versionId)) fail("orphan_row_isolation");
      await get("orphan admin preview refused", "adminA", `${base}/${orphan.resourceId}/versions/${orphan.versionId}/download`, 404);
      await call("orphan admin review refused", "adminA", "adminA", `${base}/${orphan.resourceId}/versions/${orphan.versionId}/review`, 404, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "request_review", idempotencyKey: `${plan.runId}-orphan` }) });
      await get("orphan delivery denied and audited", "eligible", `${partnerBase}/${orphan.resourceId}/download`, 404);
    }
    boundary.beginPhase("withdraw_control"); await action("control", "adminA", "withdraw");
    boundary.beginPhase("withdraw_journey"); await action("journey", "adminA", "withdraw");
    boundary.beginPhase("postchecks");
    await get("withdrawn journey denied and audited", "eligible", `${partnerBase}/${journey.resourceId}/download`, 404);
    const expectedAudit = new Map<string, { memberId: string | null; outcome: string; reason: string | null }[]>([
      [control.resourceId, [{ memberId: plan.actors.eligible.memberId, outcome: "denied", reason: "audience" }]],
      [journey.resourceId, [{ memberId: plan.actors.suspended.memberId, outcome: "denied", reason: "audience" }, { memberId: plan.actors.eligible.memberId, outcome: "delivered", reason: null }, { memberId: plan.actors.eligible.memberId, outcome: "denied", reason: "not_published" }]],
    ]);
    for (const owned of boundary.owned) {
      const blob = await admin.storage.from(HUB_BUCKET).download(owned.objectKey);
      if (blob.error || !blob.data || sha256(new Uint8Array(await blob.data.arrayBuffer())) !== plan.pdf.sha256) fail("retained_object_hash");
      const resource = await store.getResource(owned.resourceId), versions = await store.listVersions(owned.resourceId);
      if (!resource || resource.currentPublishedVersionId !== null || versions.length !== (owned.worker === "adminA" ? 1 : 0) || versions.some(v => v.state !== "withdrawn")) fail("retained_resource_postcondition");
      const expected = expectedAudit.get(owned.resourceId) ?? [{ memberId: plan.actors.eligible.memberId, outcome: "denied", reason: "not_published" }];
      const rows = await store.listDeliveries(owned.resourceId);
      if (rows.length !== expected.length || expected.some(e => rows.filter(r => r.memberId === e.memberId && r.outcome === e.outcome && r.reason === e.reason).length !== 1)) fail("delivery_ledger_postcondition");
    }
    await countRows(true); boundary.assertComplete();
    outcomes.push({ check: "two withdrawn winners, two empty resource/object orphans, exact retained bytes and six delivery audits", status: "PASS" });
    success = true;
  } catch (error) { failureCode = error instanceof ManagedHubBoundaryError ? error.code : "unclassified_failure_private_review_required"; }
  finally {
    boundary.stop();
    const workersStopped = await stopManagedHubWorkers(children);
    try { await boundary.waitUntilIdle(); } catch { success = false; failureCode ??= "broker_not_idle_review_uncertain_state"; }
    if (!workersStopped) { success = false; failureCode ??= "worker_exit_not_observed"; }
    globalThis.fetch = networkFetch; for (const key of Object.keys(process.env)) delete process.env[key]; Object.assign(process.env, oldEnv); Object.assign(console, oldConsole);
    const receipt = { schemaVersion: 2, runId: plan.runId, sourceSha: plan.sourceSha, sourceTree: plan.sourceTree, applicationSha: plan.applicationSha, applicationTree: plan.applicationTree, planSha256, projectRef: plan.target.projectRef, finishedAt: new Date().toISOString(), status: success ? "PASS_BOUNDED_MANAGED_API" : "STOP_REVIEW_ACTUAL_STATE", failureCode, outcomes, requestCounts: boundary.counts, acknowledgedWrites: boundary.acknowledged, expectedRefusals: boundary.expectedRefusals, stoppedPhase: boundary.phase, ownedScope: boundary.owned, preservedPartialWrites: true, cleanupPerformed: false, productionContacted: false, runScopedProjection: true, notProven: ["full browser composition", "real sign-in/logout/account switching", "different-hash stored PDF upload race recovery", "bucket-wide retained orphan inventory", "unfiltered retained-library behavior", "provisioning and browser write budgets", "production activation"], recovery: plan.recovery };
    append({ type: "finish", workersStopped, ...receipt }); closeSync(journal);
    writeFileSync(path.join(plan.receiptDirectory, "managed-api-result.json"), `${JSON.stringify({ ...receipt, workersStopped }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
    process.stdout.write(`${JSON.stringify({ status: receipt.status, failureCode, checksPassed: outcomes.length, productionContacted: false })}\n`);
  }
  if (!success) process.exitCode = 1;
}
export async function main(args: string[] = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === "--worker") { await runWorker(); return; }
  const allowed = new Set(["--plan", "--execute", "--approved-plan-sha256"]), values = new Map<string, string>(); let executeMode = false;
  for (let index = 0; index < args.length; index++) {
    const key = args[index]; if (!key || !allowed.has(key) || values.has(key) || key === "--execute" && executeMode) fail("arguments");
    if (key === "--execute") { executeMode = true; continue; }
    const value = args[++index]; if (!value || value.startsWith("--")) fail("arguments"); values.set(key, value);
  }
  const planFile = values.get("--plan"); if (!planFile) fail("private_plan_required");
  const local = verifyLocalManagedHubPlan(planFile);
  if (!executeMode) {
    if (values.has("--approved-plan-sha256")) fail("execute_flag_required");
    process.stdout.write(`${JSON.stringify({ status: "LOCAL_PREFLIGHT_PASS", sourceSha: local.plan.sourceSha, sourceTree: local.plan.sourceTree, applicationSha: local.plan.applicationSha, applicationTree: local.plan.applicationTree, planSha256: local.planSha256, networkRequests: 0, credentialReads: 0, managedQualification: "NOT_RUN" })}\n`); return;
  }
  await execute(local, values.get("--approved-plan-sha256") ?? "");
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error: unknown) => {
  process.stderr.write(`${JSON.stringify({ status: "REFUSED", code: error instanceof ManagedHubBoundaryError ? error.code : "local_preflight_failed" })}\n`); process.exitCode = 1;
});
