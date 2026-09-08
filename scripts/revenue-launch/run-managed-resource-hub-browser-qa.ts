/**
 * Bounded managed STAGING Resource Hub browser qualification, using normal DOM actions.
 * --plan ABS_PRIVATE_JSON [--execute --approved-plan-sha256 HEX]
 * --self-test performs only in-memory checks; the default verifies public metadata and
 * file bindings without reading the provision/password file or starting a browser.
 *
 * A separately launched, reviewed host owns real Auth/Storage/database transport and
 * its durable effect journal. This driver never calls an authenticated API directly,
 * injects sessions, creates identities, enables production, or retries uncertain writes.
 * One private PDF; eight password logins and eight canonical UI logouts; 45 screenshots
 * in five existing sessions. Two eligible downloads and two admin previews include
 * the pending-byte logout cases. No denied-download probes are part of this budget.
 * All evidence stays private. Screenshots can contain synthetic account identifiers.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { closeSync, existsSync, fsyncSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, realpathSync, writeSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { z } from "zod";

export const SOURCE_SHA = "8be5d582586217e4cf531e718c65032b79152022";
export const SOURCE_TREE = "6fc71d0a896d31d0843dd1eb63fa6265a3da9d28";
const PROJECT = "tetynodzrtmdbuzgboro";
const PDF_SHA = "9bf66f0c5ed7ce28d90cb0dca3a3402067a0b8df61a00a0ab8f833fc5f03a198";
export const WIDTHS = [320, 360, 390, 414, 768, 1024, 1280, 1440, 1920] as const;
const ROLES = ["adminA", "adminB", "eligible", "nonPartner", "suspended"] as const;
type Role = typeof ROLES[number];
type Host = "adminA" | "adminB";
const AUTH_CAPS = { adminA: { adminA: 2, adminB: 1, eligible: 2, nonPartner: 1, suspended: 1 }, adminB: { adminA: 0, adminB: 1, eligible: 0, nonPartner: 0, suspended: 0 } } as const;
const LIBRARY = "/research/partners/resources", ADMIN = "/admin/research/resource-hub";
const API_ADMIN = "/api/admin/research/resource-hub/resources", API_LIBRARY = "/api/research/partner/resources";
const STATUS = "/__managed_host/status", AUTH = "/__managed_supabase/auth/v1/";
const SOURCE_PATHS = ["client", "server", "shared", "package.json", "package-lock.json", "vite.config.ts", "tsconfig.json", "script/build.mjs"];
// Playwright serializes functions without their Node lexical scope. tsx's
// keepNames transform can insert an outer __name helper into nested functions.
// These fixed script strings cross that boundary verbatim; no shim is installed
// in the app, and no credential or fixture value is interpolated into them.
export const BROWSER_SCRIPTS = Object.freeze({
  saveObserver: `(function () {
    function observe(type) { void window.__managedHubSaveObserved(type); }
    const originalCreate = URL.createObjectURL.bind(URL);
    URL.createObjectURL = function (blob) { observe("object-url"); return originalCreate(blob); };
    const originalClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      if (this.hasAttribute("download")) observe("anchor-download");
      return originalClick.call(this);
    };
  })();`,
  timeOrigin: "performance.timeOrigin",
  layoutReady: `(async function () {
    await document.fonts.ready;
    await new Promise(function (resolve) {
      requestAnimationFrame(function () { requestAnimationFrame(resolve); });
    });
  })()`,
  layoutMetrics: "({ width: innerWidth, scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), height: document.documentElement.scrollHeight })",
  documentHeight: "document.documentElement.scrollHeight",
});
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const abs = z.string().refine(path.isAbsolute);
const filePin = z.object({ path: abs, sha256: hash }).strict();
const hostPin = z.object({ plan: filePin, ready: filePin }).strict();
export const driverPlanSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string().regex(/^hubbrowser-[a-z0-9-]{8,48}$/),
  sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE), sourceRoot: abs,
  driverFileSha256: hash, hostFile: filePin, provisionPlan: filePin,
  hosts: z.object({ adminA: hostPin, adminB: hostPin }).strict(),
  playwrightModule: filePin, chromiumExecutable: filePin, evidenceDirectory: abs,
  recovery: z.literal("preserve-all-stop-and-review-actual-state-before-retry"),
}).strict();
const actorSchema = z.object({ authUserId: z.string().uuid(), email: z.string().email(), memberId: z.string().uuid().nullable(), applicationId: z.string().uuid().nullable(), memberStatus: z.string().nullable(), partner: z.object({ id: z.string().uuid(), role: z.string(), state: z.string() }).strict().nullable() }).strict();
const actorsSchema = z.object({ adminA: actorSchema, adminB: actorSchema, eligible: actorSchema, nonPartner: actorSchema, suspended: actorSchema }).strict();
const hostPlanSchema = z.object({
  schemaVersion: z.literal(1), runId: z.string(), sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE), hostFileSha256: hash,
  target: z.object({ projectRef: z.literal(PROJECT), origin: z.literal(`https://${PROJECT}.supabase.co`) }).strict(), host: z.enum(["adminA", "adminB"]),
  actors: actorsSchema, pdf: z.object({ path: abs, sha256: z.literal(PDF_SHA), sizeBytes: z.literal(2333), metadata: z.object({ title: z.string().min(1), purpose: z.string().min(1), usagePolicy: z.literal("private"), audience: z.tuple([z.literal("research_rep")]), originalFilename: z.string().regex(/^[A-Za-z0-9._-]+\.pdf$/), changeSummary: z.string().optional() }).strict(), reviewReason: z.string().min(3), withdrawReason: z.string().min(3) }).strict(),
  existing: z.array(z.object({ resourceId: z.string().uuid(), versionId: z.string().uuid(), objectKey: z.string() }).strict()).max(8),
  distDirectory: abs, buildManifestFile: abs, buildManifestSha256: hash,
}).passthrough(); // Exact approved host-plan hash binds its separately validated full schema.
const readySchema = z.object({ status: z.literal("BROWSER_HOST_READY"), origin: z.string(), planSha256: hash, sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE), host: z.enum(["adminA", "adminB"]) }).strict();
const buildSchema = z.object({ sourceSha: z.literal(SOURCE_SHA), sourceTree: z.literal(SOURCE_TREE), buildExitCode: z.literal(0), files: z.array(z.object({ path: z.string().regex(/^[A-Za-z0-9_./-]+$/), sha256: hash, sizeBytes: z.number().int().nonnegative() }).strict()).min(1).max(10000) }).strict();
type Plan = z.infer<typeof driverPlanSchema>;
type HostPlan = z.infer<typeof hostPlanSchema>;
type Entry = z.infer<typeof buildSchema>["files"][number];
type Row = Record<string, unknown>;
class DriverFailure extends Error { constructor(readonly code: string) { super(code); } }
function fail(code: string): never { throw new DriverFailure(code); }
function check(value: unknown, code: string): asserts value { if (!value) fail(code); }
const sha256 = (value: Uint8Array | string) => createHash("sha256").update(value).digest("hex");
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function pageErrorDiagnostic(error: { name?: unknown; message?: unknown }) {
  const name = typeof error.name === "string" && ["Error", "ReferenceError", "TypeError", "SyntaxError", "RangeError", "EvalError", "URIError"].includes(error.name) ? error.name : "UnknownError";
  return { name, code: name === "ReferenceError" && error.message === "__name is not defined" ? "serialized_name_helper_missing" : "page_runtime_error" };
}
function object(value: unknown): Row { check(value && typeof value === "object" && !Array.isArray(value), "response_shape"); return value as Row; }
function decode<T>(schema: z.ZodType<T>, bytes: Buffer): T {
  let raw: unknown; try { raw = JSON.parse(bytes.toString("utf8")); } catch { return fail("json_parse"); }
  const result = schema.safeParse(raw); if (!result.success) return fail("schema_refused"); return result.data;
}
export function localOrigin(value: string) {
  let url: URL; try { url = new URL(value); } catch { return fail("loopback_origin"); }
  check(url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port && url.pathname === "/" && !url.search && !url.hash && !url.username && !url.password, "loopback_origin");
  return url.origin;
}
function privatePath(filename: string) {
  check(path.isAbsolute(filename), "absolute_private_path"); const actual = realpathSync(filename);
  let current = lstatSync(actual).isDirectory() ? actual : path.dirname(actual);
  while (true) { check(!existsSync(path.join(current, ".git")), "private_file_in_git"); const parent = path.dirname(current); if (parent === current) break; current = parent; }
  check(!lstatSync(filename).isSymbolicLink(), "private_file_symlink"); return actual;
}
function bytes(filename: string, max = 2 * 1024 * 1024) {
  const stat = lstatSync(filename); check(stat.isFile() && stat.size <= max, "bounded_regular_file"); const value = readFileSync(filename); check(value.length === stat.size && value.length <= max, "file_read_changed"); return value;
}
function pinned(pin: { path: string; sha256: string }, isPrivate = true, max?: number) {
  const value = bytes(isPrivate ? privatePath(pin.path) : pin.path, max); check(sha256(value) === pin.sha256, "file_hash_mismatch"); return value;
}
function inventory(root: string): string[] {
  const found: string[] = [];
  function walk(dir: string, prefix: string) { for (const e of readdirSync(dir, { withFileTypes: true })) { check(!e.isSymbolicLink(), "build_symlink"); const name = prefix + e.name; if (e.isDirectory()) walk(path.join(dir, e.name), `${name}/`); else { check(e.isFile(), "build_regular_file"); found.push(name); } } }
  walk(root, ""); return found.sort();
}
function verifyBuild(plan: HostPlan) {
  const manifest = decode(buildSchema, pinned({ path: plan.buildManifestFile, sha256: plan.buildManifestSha256 }));
  const entries = new Map<string, Entry>(manifest.files.map(e => [e.path, e]));
  check(entries.size === manifest.files.length && entries.has("index.html"), "complete_build_inventory");
  check(equal([...entries.keys()].sort(), inventory(plan.distDirectory)), "complete_build_inventory");
  for (const e of entries.values()) { check(!e.path.includes("..") && !e.path.startsWith("/") && !e.path.includes("//"), "asset_path"); const value = bytes(path.join(plan.distDirectory, e.path), 64 * 1024 * 1024); check(value.length === e.sizeBytes && sha256(value) === e.sha256, "build_asset_mismatch"); }
  return entries;
}
function verifySource(plan: Plan) {
  const git = (...args: string[]) => execFileSync("git", args, { cwd: plan.sourceRoot, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"] }).trim();
  check(git("rev-parse", `${SOURCE_SHA}^{tree}`) === SOURCE_TREE, "source_tree_mismatch");
  check(git("ls-tree", "-r", "HEAD", "--", ...SOURCE_PATHS) === git("ls-tree", "-r", SOURCE_SHA, "--", ...SOURCE_PATHS), "source_blob_mismatch");
  check(!git("status", "--porcelain", "--untracked-files=all", "--", ...SOURCE_PATHS), "runtime_source_dirty");
  check(sha256(bytes(fileURLToPath(import.meta.url))) === plan.driverFileSha256, "driver_source_mismatch");
  pinned(plan.hostFile, false);
}
export function assertControllerEnvironment(env: NodeJS.ProcessEnv) {
  for (const [key, value] of Object.entries(env)) {
    if (!value) continue;
    check(!/^(NODE_OPTIONS|NODE_PATH)$/i.test(key), "inherited_loader_configuration");
    // Playwright's Node controller runs outside Chromium's launch-env allowlist.
    // Refuse its diagnostic sinks before passwords are read or the module imports.
    check(!/^(DEBUG(?:_|$)|PWDEBUG(?:_|$)|NODE_DEBUG(?:_|$)|PW_TEST_TRACE_DIR$|PLAYWRIGHT_TRACE_DIR$)/i.test(key), "inherited_diagnostic_configuration");
  }
}
export function verifyLocalDriver(planFile: string) {
  check(process.versions.node === "20.19.0", "pinned_node_required");
  assertControllerEnvironment(process.env);
  const planBytes = bytes(privatePath(planFile)); const plan = decode(driverPlanSchema, planBytes);
  verifySource(plan);
  check(!existsSync(plan.evidenceDirectory), "fresh_evidence_directory_required"); privatePath(path.dirname(plan.evidenceDirectory));
  privatePath(plan.provisionPlan.path); // Existence only. No content or hash read before execution.
  const hosts = {} as Record<Host, { plan: HostPlan; origin: string; entries: Map<string, Entry> }>;
  for (const name of ["adminA", "adminB"] as const) {
    const pin = plan.hosts[name]; const hostPlan = decode(hostPlanSchema, pinned(pin.plan)); const ready = decode(readySchema, pinned(pin.ready));
    check(hostPlan.host === name && ready.host === name && hostPlan.runId === plan.runId && ready.planSha256 === pin.plan.sha256, "host_plan_binding");
    check(hostPlan.hostFileSha256 === plan.hostFile.sha256, "host_source_binding");
    hosts[name] = { plan: hostPlan, origin: localOrigin(ready.origin), entries: verifyBuild(hostPlan) };
  }
  check(hosts.adminA.origin !== hosts.adminB.origin, "distinct_host_origins");
  check(equal(hosts.adminA.plan.actors, hosts.adminB.plan.actors) && equal(hosts.adminA.plan.pdf, hosts.adminB.plan.pdf), "shared_fixture_binding");
  check(hosts.adminA.plan.buildManifestSha256 === hosts.adminB.plan.buildManifestSha256, "shared_build_binding");
  pinned(plan.playwrightModule, false); pinned(plan.chromiumExecutable, false, 512 * 1024 * 1024);
  return { plan, planSha256: sha256(planBytes), planFile, hosts };
}

// A narrow structural view of the locally pinned Playwright module keeps this script
// independent of an unrequested package/dependency change. No browser internals are used.
interface Locator { fill(value: string): Promise<void>; click(): Promise<void>; check(): Promise<void>; selectOption(value: string): Promise<unknown>; setInputFiles(value: { name: string; mimeType: string; buffer: Buffer }): Promise<void>; waitFor(options: { state: "visible" | "hidden" | "detached" }): Promise<void>; count(): Promise<number>; getAttribute(name: string): Promise<string | null>; getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator; getByText(text: string, options?: { exact?: boolean }): Locator; locator(selector: string): Locator; first(): Locator }
interface BrowserRequest { url(): string; method(): string; }
interface BrowserResponse { url(): string; status(): number; request(): BrowserRequest; body(): Promise<Buffer>; json(): Promise<unknown>; }
interface Download { createReadStream(): Promise<NodeJS.ReadableStream | null>; failure(): Promise<string | null>; }
interface Page { goto(url: string): Promise<unknown>; url(): string; locator(selector: string): Locator; getByRole(role: string, options: { name: string | RegExp; exact?: boolean }): Locator; getByTestId(id: string): Locator; getByText(text: string, options?: { exact?: boolean }): Locator; setDefaultTimeout(ms: number): void; setViewportSize(size: { width: number; height: number }): Promise<void>; evaluate<T>(expression: string): Promise<T>; screenshot(options: { path: string; fullPage: boolean; animations: "disabled" }): Promise<Buffer>; waitForURL(url: string): Promise<void>; waitForRequest(predicate: (r: BrowserRequest) => boolean): Promise<BrowserRequest>; waitForResponse(predicate: (r: BrowserResponse) => boolean): Promise<BrowserResponse>; waitForEvent(event: "download", options: { timeout: number }): Promise<Download>; on(event: "requestfinished" | "requestfailed", fn: (r: BrowserRequest) => void): void; on(event: "response", fn: (r: BrowserResponse) => void): void; on(event: "download", fn: () => void): void; on(event: "pageerror", fn: (error: { name: string; message: string }) => void): void; on(event: "console", fn: (message: { type(): string }) => void): void; close(): Promise<void>; }
interface BrowserContext { newPage(): Promise<Page>; close(): Promise<void>; route(pattern: string, fn: (route: { request(): BrowserRequest; continue(): Promise<void>; abort(code: string): Promise<void> }) => Promise<void>): Promise<void>; routeWebSocket(pattern: string, fn: (socket: { close(): void }) => void): Promise<void>; exposeBinding(name: string, fn: (source: unknown, type: unknown) => void): Promise<void>; addInitScript(script: { content: string }): Promise<void>; on(event: "page", fn: (page: Page) => void): void; }
interface Browser { newContext(options: { viewport: { width: number; height: number }; acceptDownloads: boolean; serviceWorkers: "block" }): Promise<BrowserContext>; close(): Promise<void>; version(): string; }
interface BrowserModule { chromium: { launch(options: { executablePath: string; headless: boolean; env: Record<string, string>; args: string[] }): Promise<Browser> }; }

function durable(fd: number, value: unknown) {
  const valueBytes = Buffer.from(`${JSON.stringify(value)}\n`); let offset = 0;
  while (offset < valueBytes.length) { const count = writeSync(fd, valueBytes, offset, valueBytes.length - offset); check(Number.isInteger(count) && count > 0 && count <= valueBytes.length - offset, "durable_write_failed"); offset += count; } fsyncSync(fd);
}
function writeExclusive(filename: string, value: unknown) { const fd = openSync(filename, "wx", 0o600); try { durable(fd, value); } finally { closeSync(fd); } }
function readActors(local: ReturnType<typeof verifyLocalDriver>) {
  const raw = object(JSON.parse(pinned(local.plan.provisionPlan).toString("utf8")));
  check(raw.schemaVersion === 1 && raw.projectRef === PROJECT && raw.origin === `https://${PROJECT}.supabase.co` && raw.recovery === local.plan.recovery, "provision_plan_binding");
  const actors = object(raw.actors); const result = {} as Record<Role, { email: string; password: string }>;
  for (const role of ROLES) {
    const actor = object(actors[role]); const { password, ...identity } = actor;
    check(typeof password === "string" && password.length >= 10 && password.length <= 200, "provision_password_shape");
    const parsed = actorSchema.safeParse(identity); check(parsed.success && equal(parsed.data, local.hosts.adminA.plan.actors[role]), "provision_actor_binding");
    result[role] = { email: parsed.data.email, password };
  }
  return result;
}
async function localRead(origin: string, route: string) {
  check(route.startsWith("/") && !route.startsWith("//") && !route.includes("\\"), "local_read_path");
  const response = await fetch(localOrigin(origin) + route, { redirect: "error", signal: AbortSignal.timeout(15000) });
  check(response.status === 200 && !response.redirected, "local_read_failed");
  const chunks: Uint8Array[] = []; let count = 0; const reader = response.body?.getReader();
  if (reader) while (true) { const item = await reader.read(); if (item.done) break; count += item.value.length; if (count > 64 * 1024 * 1024) { await reader.cancel(); fail("local_read_size"); } chunks.push(item.value); }
  return Buffer.concat(chunks);
}
async function hostStatus(local: ReturnType<typeof verifyLocalDriver>, name: Host) {
  const host = local.hosts[name]; const raw = object(JSON.parse((await localRead(host.origin, STATUS)).toString("utf8")));
  check(raw.status === "BROWSER_HOST_READY" && raw.sourceSha === SOURCE_SHA && raw.sourceTree === SOURCE_TREE && raw.host === name && raw.hostFileSha256 === local.plan.hostFile.sha256 && raw.planSha256 === local.plan.hosts[name].plan.sha256 && raw.buildManifestSha256 === host.plan.buildManifestSha256, "serving_host_binding");
  return raw;
}

export async function executeDriver(local: ReturnType<typeof verifyLocalDriver>, approvedHash: string) {
  assertControllerEnvironment(process.env);
  check(approvedHash === local.planSha256, "approved_plan_hash");
  const actors = readActors(local); // Only this explicit execution path reads passwords.
  const { plan, hosts } = local;
  const pdf = pinned({ path: hosts.adminA.plan.pdf.path, sha256: PDF_SHA }); check(pdf.length === 2333, "pdf_bytes");
  mkdirSync(plan.evidenceDirectory, { mode: 0o700 }); mkdirSync(path.join(plan.evidenceDirectory, "screens"), { mode: 0o700 });
  const journal = openSync(path.join(plan.evidenceDirectory, "driver-events.jsonl"), "wx", 0o600);
  const report: { [key: string]: unknown; status: string; steps: { name: string; passed: boolean }[]; matrix: unknown[]; assets: unknown[] } = {
    schemaVersion: 1, status: "FAIL", startedAt: new Date().toISOString(), runId: plan.runId, sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE,
    driverFileSha256: plan.driverFileSha256, hostFileSha256: plan.hostFile.sha256, planSha256: local.planSha256,
    hostPlanHashes: { adminA: plan.hosts.adminA.plan.sha256, adminB: plan.hosts.adminB.plan.sha256 }, buildManifestSha256: hosts.adminA.plan.buildManifestSha256,
    pdfSha256: PDF_SHA, pdfBytes: 2333, widths: WIDTHS, steps: [], matrix: [], assets: [],
    limitations: ["Real staging Auth through a loopback reverse proxy; direct-origin production Auth is not qualified.", "Actual 8be built client, canonical scoped Hub host; incidental full-shell endpoints remain outside this proof.", "Admin B observes only its retained run-owned fixtures, not the newly created A resource or an unfiltered global library.", "One identical PDF only. No denied-download HTTP probes, different-PDF race, full-library census, or production activation.", "Browser evidence is independent of host receipts, managed API concurrency evidence and formal ASTRA-B acceptance.", "No tracing, HAR, session-storage injection or raw error/console/request-body capture. Private screenshots require review before publication.", "Readonly save/DOM observers and external-request blocking are test instrumentation, not an OS security boundary."]
  };
  const contexts: BrowserContext[] = [], pending = new Set<Promise<void>>(), settled = new WeakSet<BrowserRequest>();
  const counts: Record<string, number> = {}; let browser: Browser | undefined, stage = "preflight_serving_binding", downloads = 0, saves = 0, pageErrors = 0, consoleErrors = 0, boundaryFailures = 0, assetFailures = 0, closed = false;
  const bump = (key: string, limit: number) => { counts[key] = (counts[key] ?? 0) + 1; check(counts[key] <= limit, "driver_budget_exceeded"); };
  const event = (name: string, detail: Row = {}) => durable(journal, { at: new Date().toISOString(), name, ...detail });
  const record = () => { report.steps.push({ name: stage, passed: true }); event("step_pass", { stage }); };
  const safe = () => check(!pageErrors && !boundaryFailures && !assetFailures, "observed_runtime_or_boundary_failure");
  const pageCard = (page: Page, id: string) => page.getByTestId(`resource-${id}`);
  const noCards = async (page: Page) => check(await page.locator('[data-testid^="resource-"] article').count() === 0 && await page.locator('article[data-testid^="resource-"]').count() === 0, "unexpected_resource_card");
  const emptyLibrary = async (page: Page) => { await page.getByText("No published resources for your role yet.", { exact: true }).waitFor({ state: "visible" }); await noCards(page); };
  const signInState = async (page: Page) => { await page.getByRole("link", { name: "Member Login", exact: true }).waitFor({ state: "visible" }); await noCards(page); };
  const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
  async function makePage(hostName: Host, label: string) {
    check(browser, "browser_not_started"); const origin = hosts[hostName].origin;
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, serviceWorkers: "block" }); contexts.push(context);
    const session = { role: null as Role | null };
    await context.route("**/*", async route => {
      const req = route.request();
      try {
        const url = new URL(req.url());
        if (url.protocol === "data:" || req.url().startsWith(`blob:${origin}/`)) { await route.continue(); return; }
        check(url.origin === origin, "external_browser_request");
        if (url.pathname.startsWith(AUTH)) {
          if (req.method() === "POST") {
            check(session.role, "auth_without_named_ui_session");
            if (url.pathname === AUTH + "token" && url.search === "?grant_type=password") bump(`${hostName}.password.${session.role}`, AUTH_CAPS[hostName][session.role]);
            else if (url.pathname === AUTH + "logout" && ["?scope=local", "?scope=global", ""].includes(url.search)) bump(`${hostName}.logout.${session.role}`, AUTH_CAPS[hostName][session.role]);
            else fail("auth_refresh_or_other_write");
          } else check(req.method() === "GET" && url.pathname === AUTH + "user" && !url.search, "unexpected_auth_read");
        }
        await route.continue();
      } catch (error) {
        boundaryFailures++;
        event("browser_request_refused", { context: label, targetSha256: sha256(req.url()), code: error instanceof DriverFailure ? error.code : "request_boundary_failure" });
        await route.abort("blockedbyclient");
      }
    });
    await context.routeWebSocket("**/*", socket => { boundaryFailures++; event("browser_websocket_refused", { context: label }); socket.close(); });
    await context.exposeBinding("__managedHubSaveObserved", (_source, type) => { if (type === "object-url" || type === "anchor-download") { saves++; event("save_observed", { context: label, type }); } });
    await context.addInitScript({ content: BROWSER_SCRIPTS.saveObserver });
    context.on("page", page => {
      page.setDefaultTimeout(15000);
      page.on("requestfinished", req => settled.add(req)); page.on("requestfailed", req => settled.add(req));
      page.on("download", () => { downloads++; event("download_observed", { context: label }); });
      page.on("pageerror", error => { pageErrors++; event("page_error", { context: label, stage, ...pageErrorDiagnostic(error) }); });
      page.on("console", message => { if (message.type() === "error") consoleErrors++; });
      page.on("response", response => {
        const url = new URL(response.url()); if (url.origin !== origin || response.status() !== 200) return;
        const entry = hosts[hostName].entries.get(url.pathname.slice(1)); if (!entry) return;
        const task = (async () => { const body = await response.body(); check(body.length === entry.sizeBytes && sha256(body) === entry.sha256, "served_asset_mismatch"); report.assets.push({ host: hostName, path: entry.path, sha256: entry.sha256 }); })().catch(() => { assetFailures++; });
        pending.add(task); void task.finally(() => pending.delete(task));
      });
    });
    return { page: await context.newPage(), context, origin, session, host: hostName, label };
  }
  type View = Awaited<ReturnType<typeof makePage>>;
  async function adminSignIn(view: View, role: "adminA" | "adminB") {
    safe(); view.session.role = role; await view.page.goto(view.origin + ADMIN); await view.page.getByTestId("form-adminx-signin").waitFor({ state: "visible" });
    await view.page.locator("#adminx-email").fill(actors[role].email); await view.page.locator("#adminx-password").fill(actors[role].password);
    event("ui_password_attempt", { host: view.host, role }); await view.page.getByTestId("form-adminx-signin").getByRole("button", { name: "Sign in", exact: true }).click();
    await view.page.getByTestId("button-adminx-signout").waitFor({ state: "visible" });
  }
  async function memberSignIn(view: View, role: "eligible" | "nonPartner" | "suspended") {
    safe(); view.session.role = role; await view.page.goto(view.origin + LIBRARY); await signInState(view.page);
    const login = view.page.getByRole("link", { name: "Member Login", exact: true });
    check(await login.getAttribute("href") === "/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Fresources", "safe_return_link");
    await login.click(); await view.page.locator("#ms-email").fill(actors[role].email); await view.page.locator("#ms-password").fill(actors[role].password);
    event("ui_password_attempt", { host: view.host, role }); await view.page.getByTestId("button-member-signin").click(); await view.page.waitForURL(view.origin + LIBRARY);
  }
  async function adminSignOut(view: View) { event("ui_logout_attempt", { host: view.host, role: view.session.role }); await view.page.getByTestId("button-adminx-signout").click(); await view.page.getByTestId("form-adminx-signin").waitFor({ state: "visible" }); }
  async function prepareAccountTab(view: View) {
    const tab = await view.context.newPage(); await tab.goto(view.origin + "/research/account");
    await tab.getByRole("button", { name: "Sign out", exact: true }).waitFor({ state: "visible" }); return tab;
  }
  async function memberSignOut(view: View, preparedTab?: Page) {
    const beforeOrigin = await view.page.evaluate<number>(BROWSER_SCRIPTS.timeOrigin); const tab = preparedTab ?? await prepareAccountTab(view);
    event("ui_logout_attempt", { host: view.host, role: view.session.role, separateAccountTab: true }); await tab.getByRole("button", { name: "Sign out", exact: true }).click();
    await tab.waitForURL(view.origin + "/research"); await signInState(view.page);
    check(view.page.url() === view.origin + LIBRARY && await view.page.evaluate<number>(BROWSER_SCRIPTS.timeOrigin) === beforeOrigin, "mounted_resources_navigation_changed"); await tab.close();
  }
  async function matrix(view: View, state: string) {
    for (const width of WIDTHS) {
      safe(); await view.page.setViewportSize({ width, height: width <= 768 ? 844 : 900 });
      await view.page.evaluate<void>(BROWSER_SCRIPTS.layoutReady);
      const metrics = await view.page.evaluate<{ width: number; scrollWidth: number; height: number }>(BROWSER_SCRIPTS.layoutMetrics);
      check(metrics.width === width && metrics.scrollWidth <= width + 1, "horizontal_overflow");
      const name = `screens/${state}-${width}.png`; const image = await view.page.screenshot({ path: path.join(plan.evidenceDirectory, name), fullPage: true, animations: "disabled" });
      check(await view.page.evaluate<number>(BROWSER_SCRIPTS.documentHeight) === metrics.height, "screenshot_layout_changed");
      report.matrix.push({ state, width, metrics, path: name, sha256: sha256(image), sizeBytes: image.length });
    }
    await view.page.setViewportSize({ width: 1440, height: 900 });
  }
  async function exactDownload(view: View, button: Locator, kind: "partner" | "admin") {
    safe(); const waiting = view.page.waitForEvent("download", { timeout: 20000 }); void waiting.catch(() => {});
    event("ui_download_attempt", { host: view.host, kind }); await button.click(); const download = await waiting;
    const stream = await download.createReadStream(); check(stream, "download_stream_missing"); const chunks: Buffer[] = []; let length = 0;
    for await (const chunk of stream) { const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk); length += part.length; check(length <= 2333, "download_size"); chunks.push(part); }
    check(length === 2333 && sha256(Buffer.concat(chunks)) === PDF_SHA && await download.failure() === null, "download_bytes_mismatch");
  }
  async function staleDownload(view: View, button: Locator, downloadPath: string, kind: "partner" | "admin") {
    safe(); const accountTab = kind === "partner" ? await prepareAccountTab(view) : undefined;
    const before = { downloads, saves }; const requested = view.page.waitForRequest(r => r.url() === view.origin + downloadPath && r.method() === "GET"); void requested.catch(() => {});
    event("ui_download_attempt", { host: view.host, kind }); await button.click(); const request = await requested;
    // Wait until the host has retrieved bytes and queued its four-second delay;
    // request-start alone cannot prove that the late response existed before logout.
    const deadline = Date.now() + 10000;
    let delayed = false;
    while (Date.now() < deadline) {
      const status = await hostStatus(local, view.host); const values = status.delayedDownloads;
      if (Array.isArray(values)) { const matching = values.map(object).filter(v => v.kind === kind); if (matching.length === 2 && matching[1].status === "waiting" && matching[1].sha256 === PDF_SHA) { delayed = true; break; } }
      await pause(100);
    }
    check(delayed, "delayed_bytes_not_observed");
    if (kind === "partner") await memberSignOut(view, accountTab); else await adminSignOut(view);
    await pause(4500); check(settled.has(request), "delayed_request_unsettled");
    check(downloads === before.downloads && saves === before.saves, "stale_bytes_saved_after_logout");
  }
  async function review(page: Page, origin: string, resource: string, version: string, action: string, reason?: string) {
    safe(); if (reason) { await page.getByTestId(`action-${action}-${version}`).click(); await page.getByTestId(`reason-${version}`).fill(reason); }
    const waiting = page.waitForResponse(r => r.url() === `${origin}${API_ADMIN}/${resource}/versions/${version}/review` && r.request().method() === "POST"); void waiting.catch(() => {});
    event("ui_review_attempt", { action }); await page.getByTestId(reason ? `confirm-${version}` : `action-${action}-${version}`).click();
    const response = await waiting; check(response.status() === 200, "review_response_status");
    const data = object(await response.json()); const value = object(data.resource); check(value.resourceId === resource && Array.isArray(value.versions), "review_response_binding");
    const result = value.versions.map(object).find(v => v.versionId === version); check(result, "review_version_missing");
    const expected = action === "publish" ? "published" : action === "withdraw" ? "withdrawn" : "in_review";
    check(result.state === expected && (action !== "approve_content" || typeof result.reviewedAt === "string"), "review_postcondition");
    if (action === "request_review") await page.getByTestId(`action-request_review-${version}`).waitFor({ state: "detached" });
    if (action === "approve_content") await page.getByTestId(`action-publish-${version}`).waitFor({ state: "visible" });
    if (action === "publish") await page.getByTestId(`action-withdraw-${version}`).waitFor({ state: "visible" });
  }
  try {
    event("start", { planSha256: local.planSha256, sourceSha: SOURCE_SHA, driverFileSha256: plan.driverFileSha256 });
    for (const name of ["adminA", "adminB"] as const) {
      const status = await hostStatus(local, name); const requestCounts = object(status.requestCounts);
      check(Object.keys(requestCounts).every(k => !/^(password_|logout_|objects$|resources$|versions$|reviews$|publications$|withdrawals$|deliveries$)/.test(k)), "host_already_used");
      const config = object(JSON.parse((await localRead(hosts[name].origin, "/api/config")).toString("utf8")));
      check(config.supabaseUrl === hosts[name].origin + "/__managed_supabase" && typeof config.supabaseAnonKey === "string" && config.supabaseAnonKey.length >= 20, "canonical_auth_proxy_config");
      const index = await localRead(hosts[name].origin, "/"); check(sha256(index) === hosts[name].entries.get("index.html")?.sha256, "served_index_mismatch");
      const assets = [...new Set([...index.toString("utf8").matchAll(/(?:src|href)="(\/assets\/[^"?#]+\.(?:js|css))"/g)].map(m => m[1]))];
      check(assets.some(a => a.endsWith(".js")), "entry_script_missing");
      for (const asset of assets) { const entry = hosts[name].entries.get(asset.slice(1)); check(entry && sha256(await localRead(hosts[name].origin, asset)) === entry.sha256, "served_entry_mismatch"); }
    }
    record();
    const module: unknown = await import(pathToFileURL(plan.playwrightModule.path).href); check(module && typeof module === "object" && "chromium" in module, "playwright_module_shape");
    const env: Record<string, string> = {}; for (const [key, value] of Object.entries(process.env)) if (value !== undefined && /^(SYSTEMROOT|WINDIR|TEMP|TMP|LOCALAPPDATA|USERPROFILE)$/i.test(key)) env[key] = value;
    browser = await (module as BrowserModule).chromium.launch({ executablePath: plan.chromiumExecutable.path, headless: true, env, args: ["--disable-background-networking", "--disable-extensions", "--disable-sync", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp", "--proxy-server=http://127.0.0.1:9"] }); report.browserVersion = browser.version();
    const admin = await makePage("adminA", "admin-session"), member = await makePage("adminA", "member-session"), observer = await makePage("adminB", "observer-session");
    stage = "admin_real_password_login"; await adminSignIn(admin, "adminA"); await admin.page.getByTestId("resource-hub-upload").waitFor({ state: "visible" }); record();
    stage = "one_private_pdf_upload_review_publish";
    const p = hosts.adminA.plan.pdf, metadata = p.metadata;
    await admin.page.locator("#resource-hub-title").fill(metadata.title); await admin.page.locator("#resource-hub-purpose").fill(metadata.purpose); await admin.page.locator("#resource-hub-usage").selectOption("private");
    await admin.page.locator("#resource-hub-audience-research_rep").check(); if (metadata.changeSummary) await admin.page.locator("#resource-hub-change-summary").fill(metadata.changeSummary);
    await admin.page.locator("#resource-hub-file").setInputFiles({ name: metadata.originalFilename, mimeType: "application/pdf", buffer: pdf });
    const uploaded = admin.page.waitForResponse(r => r.url() === admin.origin + API_ADMIN && r.request().method() === "POST"); void uploaded.catch(() => {});
    event("ui_upload_attempt"); await admin.page.getByTestId("resource-hub-submit").click(); const uploadResponse = await uploaded; check(uploadResponse.status() === 200, "upload_response_status");
    const resource = object(object(await uploadResponse.json()).resource); check(resource.title === metadata.title && Array.isArray(resource.versions) && resource.versions.length === 1, "upload_response_shape");
    const version = object(resource.versions[0]); const resourceId = z.string().uuid().parse(resource.resourceId), versionId = z.string().uuid().parse(version.versionId);
    check(version.sha256 === PDF_SHA && version.sizeBytes === 2333 && version.originalFilename === metadata.originalFilename && version.state === "draft", "upload_response_binding");
    report.created = { resourceId, versionId }; event("upload_ui_postcondition", { resourceId, versionId });
    await review(admin.page, admin.origin, resourceId, versionId, "request_review"); await review(admin.page, admin.origin, resourceId, versionId, "approve_content", p.reviewReason); await review(admin.page, admin.origin, resourceId, versionId, "publish");
    await admin.page.getByTestId(`action-withdraw-${versionId}`).waitFor({ state: "visible" }); record();
    stage = "admin_nine_width_matrix"; await matrix(admin, "admin"); record();
    stage = "admin_exact_preview"; await exactDownload(admin, admin.page.getByTestId(`preview-${versionId}`), "admin"); record();
    stage = "independent_admin_b_scoped_observer"; await adminSignIn(observer, "adminB"); await observer.page.getByTestId("resource-hub-upload").waitFor({ state: "visible" });
    check(await observer.page.getByText("Access denied.", { exact: true }).count() === 0 && await observer.page.getByTestId(`version-${versionId}`).count() === 0, "observer_scope");
    check(await observer.page.locator('[data-testid^="version-"]').count() > 0, "observer_retained_versions_missing"); await adminSignOut(observer); record();
    stage = "eligible_return_login_and_nine_width_matrix"; await memberSignIn(member, "eligible"); await pageCard(member.page, resourceId).waitFor({ state: "visible" });
    check(await member.page.locator('article[data-testid^="resource-"]').count() === 1 && await member.page.getByRole("button", { name: /^Share/ }).count() === 0, "eligible_library_scope"); await matrix(member, "eligible"); record();
    stage = "eligible_exact_download"; await exactDownload(member, member.page.getByTestId(`download-${resourceId}`), "partner"); record();
    stage = "mounted_member_logout_discards_pending_bytes"; await staleDownload(member, member.page.getByTestId(`download-${resourceId}`), `${API_LIBRARY}/${resourceId}/download`, "partner"); record();
    stage = "same_context_nonpartner_switch_and_nine_width_matrix"; await memberSignIn(member, "nonPartner"); await member.page.getByText("The partner platform is being prepared.", { exact: true }).waitFor({ state: "visible" }); await noCards(member.page); await matrix(member, "nonPartner"); await memberSignOut(member); record();
    stage = "same_context_suspended_switch_and_nine_width_matrix"; await memberSignIn(member, "suspended"); await emptyLibrary(member.page); await matrix(member, "suspended"); await memberSignOut(member); record();
    stage = "mounted_admin_logout_discards_pending_preview"; await staleDownload(admin, admin.page.getByTestId(`preview-${versionId}`), `${API_ADMIN}/${resourceId}/versions/${versionId}/download`, "admin"); record();
    stage = "same_context_admin_switch_forbidden_nine_width_matrix"; await adminSignIn(admin, "adminB"); await admin.page.getByText("Access denied.", { exact: true }).waitFor({ state: "visible" });
    check(await admin.page.getByTestId("resource-hub-upload").count() === 0 && await admin.page.locator('[data-testid^="version-"]').count() === 0, "forbidden_admin_data"); await matrix(admin, "adminForbidden"); await adminSignOut(admin); record();
    stage = "withdrawal_and_fresh_eligible_visibility"; await adminSignIn(admin, "adminA"); await admin.page.getByTestId(`action-withdraw-${versionId}`).waitFor({ state: "visible" });
    await review(admin.page, admin.origin, resourceId, versionId, "withdraw", p.withdrawReason); await admin.page.getByTestId(`version-${versionId}`).getByText("Withdrawn", { exact: true }).first().waitFor({ state: "visible" });
    await memberSignIn(member, "eligible"); await emptyLibrary(member.page); await memberSignOut(member); await adminSignOut(admin); record();
    stage = "final_scope_counts_and_source_binding"; check(report.matrix.length === 45 && downloads === 2, "matrix_or_download_count");
    for (const host of ["adminA", "adminB"] as const) for (const role of ROLES) for (const action of ["password", "logout"]) check((counts[`${host}.${action}.${role}`] ?? 0) === AUTH_CAPS[host][role], "exact_auth_budget");
    const finalHosts = { adminA: await hostStatus(local, "adminA"), adminB: await hostStatus(local, "adminB") };
    const a = object(finalHosts.adminA.requestCounts), b = object(finalHosts.adminB.requestCounts);
    for (const [key, expected] of Object.entries({ objects: 1, resources: 1, versions: 1, reviews: 2, publications: 1, withdrawals: 1, deliveries: 2 })) check(a[key] === expected && !b[key], "host_effect_counts");
    for (const host of ["adminA", "adminB"] as const) for (const role of ROLES) for (const action of ["password", "logout"]) check((object(finalHosts[host].requestCounts)[`${action}_${role}`] ?? 0) === AUTH_CAPS[host][role], "host_auth_count_comparison");
    report.finalHostStatus = finalHosts; await Promise.all([...pending]); verifySource(plan); verifyBuild(hosts.adminA.plan); verifyBuild(hosts.adminB.plan);
    check(sha256(bytes(privatePath(local.planFile))) === local.planSha256, "driver_plan_changed"); pinned(plan.provisionPlan); for (const host of ["adminA", "adminB"] as const) { pinned(plan.hosts[host].plan); pinned(plan.hosts[host].ready); }
    safe(); record(); report.status = "PASS_BROWSER_ASSERTIONS_HOST_RECONCILIATION_SEPARATE";
  } catch (error) {
    report.failure = { stage, code: error instanceof DriverFailure ? error.code : "browser_step_failed_private_review_required" }; report.steps.push({ name: stage, passed: false }); process.exitCode = 1;
  } finally {
    // Close ephemeral browser contexts only. No automatic logout retries, row/object
    // removal, token manipulation, or host shutdown after an uncertain effect.
    for (const context of contexts) try { await context.close(); } catch { boundaryFailures++; }
    try { await browser?.close(); closed = true; } catch { boundaryFailures++; }
    await Promise.all([...pending]);
    if (pageErrors || boundaryFailures || assetFailures) { report.status = "FAIL"; process.exitCode = 1; report.failure ??= { stage: "final_instrumentation", code: "runtime_asset_or_boundary_failure" }; }
    Object.assign(report, { completedAt: new Date().toISOString(), browserClosed: closed, counts, downloads, saveObserverEvents: saves, pageErrors, consoleErrorCount: consoleErrors, boundaryFailures, assetFailures, productionContacted: false, tracingEnabled: false, harEnabled: false, credentialsRecorded: false, retainedDataCleanupPerformed: false, recovery: plan.recovery });
    try { event("finish", { status: report.status }); writeExclusive(path.join(plan.evidenceDirectory, "managed-resource-hub-browser-result.json"), report); } finally { closeSync(journal); }
  }
  process.stdout.write(`${JSON.stringify({ status: report.status, passedSteps: report.steps.filter(s => s.passed).length, matrixCaptures: report.matrix.length })}\n`);
}

export async function selfTest() {
  check(localOrigin("http://127.0.0.1:5233") === "http://127.0.0.1:5233", "self_local_origin");
  for (const value of ["https://127.0.0.1:5233", "http://localhost:5233", `https://${PROJECT}.supabase.co`, "http://127.0.0.1:5233/x", "http://127.0.0.1:5233?x=y", "http://x@127.0.0.1:5233"]) { let refused = false; try { localOrigin(value); } catch { refused = true; } check(refused, "self_origin_refusal"); }
  check(WIDTHS.length === 9 && new Set(WIDTHS).size === 9, "self_matrix");
  check(Object.values(AUTH_CAPS).flatMap(Object.values).reduce<number>((a, b) => a + b, 0) === 8, "self_auth_budget");
  check(!driverPlanSchema.safeParse({ schemaVersion: 1, sourceSha: "3814c687ef9293f84f939c372fdbc01b278a9193" }).success, "self_wrong_source");
  assertControllerEnvironment({ DEBUG: "", NODE_OPTIONS: undefined });
  for (const key of ["DEBUG", "debug", "DEBUG_FILE", "DEBUG_FD", "PWDEBUG", "NODE_DEBUG", "NODE_DEBUG_NATIVE", "PW_TEST_TRACE_DIR", "PLAYWRIGHT_TRACE_DIR", "NODE_OPTIONS", "NODE_PATH"]) {
    let refused = false; try { assertControllerEnvironment({ [key]: "enabled" }); } catch { refused = true; } check(refused, "self_controller_diagnostics_refusal");
  }
  // This callback keeps the old nested-function shape. Under the actual pinned
  // tsx runner its serialized text contains an outer __name helper. Prove that
  // unsupported serialization is refused in an otherwise empty local realm;
  // this is an offline negative control, not a claim about run 2's lost message.
  const legacyObserver = () => { const observe = (type: string) => type; return observe("object-url"); };
  const legacySerialized = `(${legacyObserver.toString()})()`;
  check(legacySerialized.includes("__name"), "self_actual_tsx_keep_names_transform");
  let legacyRejected = false;
  try { runInNewContext(legacySerialized, {}, { timeout: 1000 }); } catch (error) { legacyRejected = pageErrorDiagnostic(error as Error).code === "serialized_name_helper_missing"; }
  check(legacyRejected, "self_missing_helper_negative_control");
  const observed: string[] = []; let originalUrls = 0, originalClicks = 0, frames = 0;
  class TestAnchor {
    constructor(readonly download: boolean) {}
    hasAttribute(name: string) { return this.download && name === "download"; }
    click() { originalClicks++; }
  }
  const dom = {
    window: { __managedHubSaveObserved(type: string) { observed.push(type); return Promise.resolve(); } },
    URL: { createObjectURL(_blob: unknown) { originalUrls++; return "blob:offline-fixture"; } }, HTMLAnchorElement: TestAnchor,
    performance: { timeOrigin: 12345 }, innerWidth: 320,
    document: { fonts: { ready: Promise.resolve() }, documentElement: { scrollWidth: 320, scrollHeight: 700 }, body: { scrollWidth: 319 } },
    requestAnimationFrame(callback: (at: number) => void) { frames++; callback(0); return frames; },
  };
  for (const script of Object.values(BROWSER_SCRIPTS)) check(!script.includes("__name"), "self_script_lexical_helper");
  runInNewContext(BROWSER_SCRIPTS.saveObserver, dom, { timeout: 1000 });
  check(dom.URL.createObjectURL({}) === "blob:offline-fixture", "self_original_url_result");
  new TestAnchor(true).click(); new TestAnchor(false).click();
  check(equal(observed, ["object-url", "anchor-download"]) && originalUrls === 1 && originalClicks === 2, "self_save_observer_semantics");
  check(runInNewContext(BROWSER_SCRIPTS.timeOrigin, dom, { timeout: 1000 }) === 12345, "self_serialized_time_origin");
  await runInNewContext(BROWSER_SCRIPTS.layoutReady, dom, { timeout: 1000 }); check(frames === 2, "self_two_frame_layout_wait");
  check(equal(runInNewContext(BROWSER_SCRIPTS.layoutMetrics, dom, { timeout: 1000 }), { width: 320, scrollWidth: 320, height: 700 }), "self_serialized_metrics");
  check(runInNewContext(BROWSER_SCRIPTS.documentHeight, dom, { timeout: 1000 }) === 700, "self_serialized_height");
  check(equal(pageErrorDiagnostic({ name: "private-value", message: "private-value" }), { name: "UnknownError", code: "page_runtime_error" }), "self_diagnostic_redaction");
  check(equal(pageErrorDiagnostic({ name: "ReferenceError", message: "other-private-value" }), { name: "ReferenceError", code: "page_runtime_error" }), "self_unknown_message_redaction");
  process.stdout.write(`${JSON.stringify({ offlineSerializedScripts: Object.entries(BROWSER_SCRIPTS).map(([name, script]) => ({ name, sha256: sha256(script), bytes: Buffer.byteLength(script) })), legacyMissingHelperNegativeControl: "PASS_ACTUAL_TSX_SERIALIZATION", browserStarted: false, privateInputsRead: false })}\n`);
  process.stdout.write("PASS bounded offline driver checks; no browser, private inputs or service calls.\n");
}
async function main(argv: string[]) {
  if (argv.length === 1 && argv[0] === "--self-test") { await selfTest(); return; }
  const args: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) { const key = argv[i]; check(["--plan", "--execute", "--approved-plan-sha256"].includes(key) && args[key] === undefined, "cli_arguments"); if (key === "--execute") args[key] = true; else { check(argv[i + 1] && !argv[i + 1].startsWith("--"), "cli_value"); args[key] = argv[++i]; } }
  check(typeof args["--plan"] === "string", "private_plan_required");
  check(args["--execute"] === true ? typeof args["--approved-plan-sha256"] === "string" && hash.safeParse(args["--approved-plan-sha256"]).success : args["--approved-plan-sha256"] === undefined, "execution_authorization_pair");
  const local = verifyLocalDriver(args["--plan"]);
  if (!args["--execute"]) { process.stdout.write(`${JSON.stringify({ status: "LOCAL_BROWSER_DRIVER_PREFLIGHT_PASS", planSha256: local.planSha256, sourceSha: SOURCE_SHA, sourceTree: SOURCE_TREE, credentialsRead: false, browserStarted: false })}\n`); return; }
  await executeDriver(local, args["--approved-plan-sha256"] as string);
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) void main(process.argv.slice(2)).catch(error => { process.exitCode = 1; process.stderr.write(`${JSON.stringify({ status: "STOP", code: error instanceof DriverFailure ? error.code : "driver_preflight_or_receipt_failure" })}\n`); });
