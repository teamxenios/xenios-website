// Source-only until Root's isolated Actions allocation. Importing runs no QA.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { release as kernelRelease } from "node:os";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession } from "./lib/cdp.mjs";
import { PAGE_AUDIT_SOURCE, FOCUS_BASELINE_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";
import { createImmutableDistSnapshot, inventoryDirectory, inventorySha256 } from "./lib/immutable-dist.mjs";
import { assertPinnedExecutingRuntime } from "./lib/provenance.mjs";

export const QUALIFIED_BASELINE = "47e46709060684ada6d365b1544500539b296620";
export const QUALIFIED_BASELINE_TREE = "1868d4a15e9531371e3b5fdcd2609c48ec26ba51";
export const ROUTES = Object.freeze(["/", "/r/SAMPLE-CODE"]);
export const CONFIGURATIONS = Object.freeze([
  { name: "phone100", width: 375, height: 812, font: 16 },
  { name: "phone200", width: 375, height: 812, font: 32 },
  { name: "desktop100", width: 1440, height: 900, font: 16 },
  { name: "desktop200", width: 1440, height: 900, font: 32 },
]);
export const OWNED_SOURCES = Object.freeze([
  "scripts/evidence/owned-runner-preview.ts", "scripts/evidence/owned-runner-browser-qa.mjs",
  "scripts/evidence/owned-runner-browser-qa.sh", "scripts/evidence/owned-runner-browser-qa.node-test.mjs",
  "scripts/evidence/lib/chrome.mjs", "scripts/evidence/lib/cdp.mjs", "scripts/evidence/lib/page-audit.js",
  "scripts/evidence/lib/immutable-dist.mjs", "scripts/evidence/lib/provenance.mjs",
  "server/research/seo/raw-http-document-policy.ts", "client/src/home/content.ts",
  "client/src/research/recommendation/Recipient.tsx", "client/src/research/recommendation/api.ts",
  "shared/research/referral-v1.ts", ".github/workflows/checks.yml", "package-lock.json",
]);
const SHA = /^[a-f0-9]{40}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function requireThat(value, code) { if (!value) throw new Error(code); }

export function safeNetworkUrl(value) {
  try {
    const u = new URL(value, "http://127.0.0.1");
    return `${u.origin === "http://127.0.0.1" ? "" : u.origin}${u.pathname}`.slice(0, 240);
  } catch { return "INVALID_URL"; }
}

/** Raw target boundary; URL parsing must not normalize hostile selectors. */
export function classifyRequest(method, target, assets) {
  if (typeof target !== "string" || !target.startsWith("/") || /[%\\\s?#\u0000-\u001f]/u.test(target)
    || target.includes("//") || target.split("/").some((part) => part === "." || part === "..")) return { kind: "refused" };
  if (method === "POST" && target === "/api/research/referral/resolve") return { kind: "resolve_fixture" };
  if (method !== "GET" && method !== "HEAD") return { kind: "refused" };
  if (ROUTES.includes(target)) return { kind: "document" };
  const path = target.slice(1);
  if (path && assets.has(path) && path !== "PREVIEW-SOURCE.json"
    && (!/\.html?$/i.test(path) || path === "offline.html")) return { kind: "asset", path };
  return { kind: "refused" };
}

export function validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview }) {
  requireThat([sourceHead, sourceTree, runnerHead, runnerTree].every((x) => SHA.test(x ?? "")), "SOURCE_IDENTITY_INVALID");
  requireThat(preview?.sourceHead === sourceHead && preview?.sourceTree === sourceTree && preview?.executedCommit === runnerHead
    && preview?.executedTree === runnerTree && preview?.node === "v20.19.0", "PREVIEW_SOURCE_MISMATCH");
  requireThat(Array.isArray(runnerParents) && runnerParents.every((p) => SHA.test(p))
    && Array.isArray(preview.executedParents) && preview.executedParents.length === runnerParents.length
    && preview.executedParents.every((p, i) => p === runnerParents[i]), "PREVIEW_PARENT_MISMATCH");
  const direct = runnerHead === sourceHead;
  const baseHead = preview.baseHead;
  requireThat((baseHead === null && direct) || SHA.test(baseHead ?? ""), "BASE_IDENTITY_INVALID");
  requireThat(direct ? sourceTree === runnerTree : baseHead !== null && runnerParents.length === 2
    && runnerParents[0] === baseHead && runnerParents[1] === sourceHead, "RUNNER_GRAPH_MISMATCH");
  const sourceAndRunnerTreeEqual = sourceTree === runnerTree;
  return { sourceHead, sourceTree, baseHead, runnerHead, runnerTree, executedParents: [...runnerParents],
    checkoutKind: direct ? "DIRECT_SOURCE_CHECKOUT" : "PR_MERGE_CHECKOUT", sourceAndRunnerTreeEqual,
    evidenceScope: sourceAndRunnerTreeEqual ? "EXECUTED_TREE_EQUAL_TO_SOURCE_TREE" : "EXECUTED_COMPOSITION_ONLY",
    evidenceCommit: runnerHead, evidenceTree: runnerTree };
}

export function validateIsolation({ uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs }) {
  requireThat(Number.isInteger(uid) && uid > 0, "PRIVILEGE_DROP_MISSING");
  requireThat(/^net:\[\d+\]$/.test(netNamespace ?? "") && /^net:\[\d+\]$/.test(parentNetNamespace ?? "")
    && netNamespace !== parentNetNamespace, "NETWORK_NAMESPACE_MISSING");
  requireThat(Array.isArray(interfaces) && interfaces.length === 1 && interfaces[0] === "lo", "NETWORK_INTERFACE_ESCAPE");
  requireThat(Array.isArray(routes) && routes.length === 0 && /^0+$/.test(effectiveCaps) && noNewPrivs === "1", "NETWORK_PRIVILEGE_ESCAPE");
  return { uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs };
}

export function validateFontCalibration(sample, { width, font }) {
  const expectedMedia = font === 16;
  requireThat(sample && sample.width === width && sample.dpr === 1 && sample.scale === 1
    && Math.abs(sample.root - font) < 0.05 && Math.abs(sample.rem - font) < 0.05
    && sample.emMedia === expectedMedia, "FONT_CAPABILITY_NOT_EXECUTED");
  return sample;
}

/** Same child, no reset: reserve cleanup and a small diagnostic-settlement tail. */
export function ownedStartupBudget(deadline, now) {
  return Math.max(0, Math.min(45000, Math.floor(deadline - now - 25000 - 1500)));
}

/** Receipt validation is not a substitute for the real captured closes below. */
export function validateProfileReceipts(receipts) {
  requireThat(receipts.length === CONFIGURATIONS.length, "PROFILE_CONFIGURATION_INCOMPLETE");
  const profiles = new Set(), processes = new Set();
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i], processIdentity = `${r.browserPid}:${r.browserStartTicks}`;
    requireThat(r.configuration === CONFIGURATIONS[i].name && typeof r.profile === "string" && r.profile.startsWith("/")
      && !profiles.has(r.profile) && Number.isInteger(r.browserPid) && r.browserPid > 0
      && /^\d+$/.test(r.browserStartTicks ?? "") && !processes.has(processIdentity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
    requireThat(r.cleanup?.page === true && r.cleanup?.cdp === true && r.cleanup?.browserExit === true
      && r.cleanup?.profileRemoved === true, "PROFILE_CLEANUP_UNCONFIRMED");
    requireThat(Number.isFinite(r.startedMs) && Number.isFinite(r.closedMs) && r.closedMs >= r.startedMs
      && (!i || r.startedMs >= receipts[i - 1].closedMs), "PROFILE_LIFETIME_OVERLAP");
    profiles.add(r.profile); processes.add(processIdentity);
  }
  return true;
}

export function assertInventorySafe(root) {
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), info = lstatSync(path);
      requireThat(!info.isSymbolicLink(), "DIST_SYMLINK_REFUSED");
      if (info.isDirectory()) visit(path); else requireThat(info.isFile(), "DIST_SPECIAL_FILE_REFUSED");
    }
  };
  requireThat(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), "DIST_ROOT_INVALID");
  visit(root);
}

const FONT_SAMPLE = (width) => `(() => {
  const e = document.createElement('div'); e.style.cssText = 'width:1rem;height:1rem;position:absolute;visibility:hidden';
  document.documentElement.append(e); const rem = e.getBoundingClientRect().width; e.remove();
  return {width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale,
    root:parseFloat(getComputedStyle(document.documentElement).fontSize),rem,
    emMedia:matchMedia('(min-width:${width / 24}em)').matches};
})()`;

/** All browser requests stay attributed, even if page helpers reset telemetry. */
function observeRequests(conn, targetOrigin, violations) {
  const observe = ({ request }) => {
    if (!request) return;
    let allowed = false;
    try {
      const url = new URL(request.url);
      allowed = url.origin === targetOrigin && (request.method === "GET" || request.method === "HEAD"
        || request.method === "POST" && url.pathname === "/api/research/referral/resolve" && !url.search);
      if (["data:", "blob:", "about:"].includes(url.protocol)) allowed = true;
    } catch {}
    if (!allowed) violations.push({ method: request.method, target: safeNetworkUrl(request.url), reason: "OFF_CONTRACT_REQUEST" });
  };
  return conn.on("Network.requestWillBeSent", observe);
}

async function run() {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  const env = process.env;
  const started = Number(env.XR_QA_STARTED_MS), deadline = started + 300000;
  const result = {
    schemaVersion: 1, kind: "OWNED_RUNNER_FRONTEND_BROWSER_QA", scope: "LOCAL_STATIC_404_FIXTURE_ONLY",
    qualifiedBaseline: QUALIFIED_BASELINE, qualifiedBaselineTree: QUALIFIED_BASELINE_TREE,
    productionQualified: false, managedAuthQualified: false, fullReleaseQualified: false,
    startedAt: new Date(started).toISOString(), state: "INCOMPLETE", phase: "capability",
    run: { id: env.XR_QA_RUN_ID, attempt: env.XR_QA_RUN_ATTEMPT, jobKey: env.XR_QA_JOB_KEY,
      numericJobId: env.XR_QA_JOB_ID || null, runnerImage: env.XR_QA_RUNNER_IMAGE,
      repository: "teamxenios/xenios-website" },
    captures: [], requests: [], violations: [], cleanup: {}, browserProfiles: [],
  };
  const out = realpathSync(env.XR_QA_OUT);
  const write = (name, value) => {
    requireThat(/^[a-z0-9][a-z0-9.-]+$/.test(name), "OUTPUT_NAME_INVALID");
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n");
    writeFileSync(join(out, name), bytes, { flag: "wx", mode: 0o600 });
    return { file: name, bytes: bytes.length, sha256: hash(bytes) };
  };
  let browser, conn, page, preview, snapshot, observerOff, cleanupPromise, launchStarted = false, stopped = false;
  let activeProfile, closeConfigurationPromise;
  let watchdog;
  const bounded = (work, ceiling = 15000, cleanup = false) => {
    const remaining = deadline - Date.now() - (cleanup ? 3000 : 25000);
    const ms = Math.min(remaining, ceiling);
    if (ms <= 0) { void Promise.resolve(work).catch(() => {}); return Promise.reject(new Error("OVERALL_DEADLINE")); }
    let timer;
    return Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("BOUNDED_OPERATION_TIMEOUT")), ms); })])
      .finally(() => clearTimeout(timer));
  };
  const setPhase = (phase) => { result.phase = phase; };
  try {
    requireThat(process.platform === "linux" && env.XR_QA_ACTIONS === "true"
      && Number.isFinite(started) && Date.now() >= started && Date.now() - started < 60000, "ACTIONS_CAPABILITY_MISSING");
    requireThat(/^\d+$/.test(env.XR_QA_RUN_ID ?? "") && /^\d+$/.test(env.XR_QA_RUN_ATTEMPT ?? "")
      && /^[a-zA-Z0-9_-]+$/.test(env.XR_QA_JOB_KEY ?? ""), "ACTIONS_IDENTITY_INVALID");
    const status = readFileSync("/proc/self/status", "utf8");
    result.isolation = validateIsolation({ uid: process.getuid(), netNamespace: readlinkSync("/proc/self/ns/net"),
      parentNetNamespace: env.XR_QA_PARENT_NET_NS,
      interfaces: JSON.parse(execFileSync("/usr/sbin/ip", ["-j", "link", "show"], { encoding: "utf8" })).map((i) => i.ifname).sort(),
      routes: [[], ["-6"]].flatMap((family) => JSON.parse(execFileSync("/usr/sbin/ip", [...family, "-j", "route", "show", "table", "main"], { encoding: "utf8" }))),
      effectiveCaps: /^CapEff:\s*(\w+)/m.exec(status)?.[1] ?? "unknown",
      noNewPrivs: /^NoNewPrivs:\s*(\d+)/m.exec(status)?.[1] ?? "unknown" });
    requireThat(/^pid:\[\d+\]$/.test(env.XR_QA_PARENT_PID_NS ?? "")
      && readlinkSync("/proc/self/ns/pid") !== env.XR_QA_PARENT_PID_NS, "PID_NAMESPACE_MISSING");
    result.isolation.pidNamespace = readlinkSync("/proc/self/ns/pid");
    const osRelease = readFileSync("/etc/os-release", "utf8");
    result.runner = { platform: process.platform, arch: process.arch, kernel: kernelRelease(),
      osId: /^ID=(.*)$/m.exec(osRelease)?.[1] ?? null, versionId: /^VERSION_ID=(.*)$/m.exec(osRelease)?.[1] ?? null };
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    requireThat(!git("status", "--porcelain=v1", "--untracked-files=all"), "CHECKOUT_DIRTY");
    const sourceHead = env.XR_QA_SOURCE_HEAD, sourceTree = git("rev-parse", `${sourceHead}^{tree}`);
    requireThat(SHA.test(sourceHead ?? "") && sourceTree === env.XR_QA_SOURCE_TREE, "EXPECTED_SOURCE_MISMATCH");
    const runnerHead = git("rev-parse", "HEAD"), runnerTree = git("rev-parse", "HEAD^{tree}");
    git("merge-base", "--is-ancestor", QUALIFIED_BASELINE, runnerHead);
    const runnerParents = git("show", "-s", "--format=%P", runnerHead).split(/\s+/).filter(Boolean);
    const markerBytes = readFileSync(join(repo, "dist/public/PREVIEW-SOURCE.json"));
    const marker = JSON.parse(markerBytes);
    result.source = validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview: marker });
    if (marker.baseHead !== null) requireThat(git("rev-parse", `${marker.baseHead}^{commit}`) === marker.baseHead, "BASE_COMMIT_MISSING");
    result.previewMarker = { bytes: markerBytes.length, sha256: hash(markerBytes) };
    const runtime = assertPinnedExecutingRuntime();
    result.runtime = { nodeVersion: runtime.nodeVersion, npmVersion: runtime.npmVersion };
    result.sources = OWNED_SOURCES.map((path) => ({ path, sha256: hash(readFileSync(join(repo, path))) }));
    result.packageLockSha256 = result.sources.find((s) => s.path === "package-lock.json").sha256;
    const publicRoot = join(repo, "dist/public");
    assertInventorySafe(publicRoot);
    const inventory = inventoryDirectory(publicRoot), inventoryHash = inventorySha256(inventory);
    result.build = { inventory, inventorySha256: inventoryHash };
    snapshot = createImmutableDistSnapshot({ repoRoot: repo, sourceDistRoot: publicRoot,
      expectedInventory: inventory, expectedInventorySha256: inventoryHash });
    const stop = (reason) => {
      stopped = true; result.state = "FAILED_OR_NOT_EXECUTED"; result.failure = reason;
      void cleanup().finally(() => process.exit(1));
    };
    watchdog = setTimeout(() => stop("OVERALL_DEADLINE"), Math.max(1, deadline - Date.now() - 18000));
    process.once("SIGTERM", () => stop("TERMINATED"));
    setPhase("preview_start");
    const { startOwnedPreview, UNAVAILABLE_FIXTURE } = await import("./owned-runner-preview.ts");
    preview = await bounded(startOwnedPreview({ root: snapshot.distRoot, inventory, ledger: result.requests }));
    result.fixture = { kind: "STATIC_404_UNAVAILABLE", responseSha256: hash(JSON.stringify(UNAVAILABLE_FIXTURE)),
      realServerApiQualified: false, persistence: false };
    const chrome = realpathSync(env.XR_QA_CHROME);
    requireThat(lstatSync(chrome).isFile(), "CHROME_BINARY_INVALID");
    result.browserLauncher = { path: chrome, sha256: hash(readFileSync(chrome)) };
    for (const config of CONFIGURATIONS) {
      requireThat(!browser && !conn && !page && !launchStarted && !stopped
        && deadline - Date.now() > 25000, "PREVIOUS_PROFILE_NOT_CLOSED_OR_DEADLINE");
      closeConfigurationPromise = null;
      activeProfile = { configuration: config.name, startedMs: Date.now(), profile: null,
        browserPid: null, browserStartTicks: null, closedMs: null, cleanup: null };
      result.browserProfiles.push(activeProfile);
      setPhase(`${config.name}_browser_start`);
      const startupBudgetMs = ownedStartupBudget(deadline, Date.now());
      requireThat(startupBudgetMs > 0, "OVERALL_DEADLINE");
      activeProfile.startupBudgetMs = startupBudgetMs;
      launchStarted = true;
      browser = await bounded(launchChromium({ chromePath: chrome, timeoutMs: startupBudgetMs, onSpawned(handle) {
        // Capture ownership before readiness can reject. Do not require a live
        // /proc entry yet: a genuine early exit may already have removed it.
        browser = handle;
        activeProfile.profile = handle.userDataDir;
        activeProfile.browserPid = handle.process.pid ?? null;
        activeProfile.launchDiagnostics = handle.diagnostics();
        activeProfile.browserStartTicks = activeProfile.launchDiagnostics.startupObservations.find((o) => o.available && o.startTicks)?.startTicks ?? null;
      } }), startupBudgetMs + 1200);
      activeProfile.launchDiagnostics = browser.diagnostics();
      const processStat = readFileSync(`/proc/${browser.process.pid}/stat`, "utf8");
      const readyStartTicks = processStat.slice(processStat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
      requireThat(activeProfile.browserStartTicks === null || activeProfile.browserStartTicks === readyStartTicks, "BROWSER_PROCESS_IDENTITY_CHANGED");
      activeProfile.browserStartTicks = readyStartTicks;
      requireThat(Number.isInteger(activeProfile.browserPid) && /^\d+$/.test(activeProfile.browserStartTicks ?? ""), "BROWSER_PROCESS_IDENTITY_MISSING");
      const executable = realpathSync(`/proc/${browser.process.pid}/exe`);
      activeProfile.binary = { path: executable, sha256: hash(readFileSync(executable)) };
      activeProfile.browser = { version: browser.browserVersion, protocol: browser.protocolVersion, sandboxDisabled: false };
      activeProfile.identity = hash(JSON.stringify([activeProfile.browserPid, activeProfile.browserStartTicks, activeProfile.profile]));
      requireThat(!result.browserProfiles.slice(0, -1).some((r) => r.profile === activeProfile.profile
        || r.identity === activeProfile.identity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
      conn = await bounded(new CdpConnection(browser.wsUrl).open());
      observerOff = observeRequests(conn, preview.origin, result.violations);
      await bounded(conn.send("Browser.setDownloadBehavior", { behavior: "deny" }));
      for (const route of ROUTES) {
        setPhase(`${config.name}_${route === "/" ? "home" : "recipient"}`);
        page = await bounded(PageSession.create(conn));
        await bounded(page.enforceNetworkBoundary(preview.origin, { fulfillments: [], allowedOrigins: [preview.origin], allowedWebSocketOrigins: [] }));
        const pageOff = conn.on("Network.requestWillBeSent", (p) => {
          if (!p.request) return;
          let u;
          try { u = new URL(p.request.url); } catch { return; }
          const safe = u.origin === preview.origin && (p.request.method === "GET" || p.request.method === "HEAD"
            || p.request.method === "POST" && u.pathname === "/api/research/referral/resolve" && !u.search);
          if (!safe && !["data:", "blob:"].includes(u.protocol)) result.violations.push({ target: safeNetworkUrl(u.href), reason: "PAGE_REQUEST_BLOCKED_OR_OFF_CONTRACT" });
        }, page.sessionId);
        await bounded(page.setViewport({ width: config.width, height: config.height, deviceScaleFactor: 1 }));
        try {
          await bounded(page.send("Page.setFontSizes", { fontSizes: { standard: config.font, fixed: config.font === 16 ? 13 : 26 } }));
          await bounded(page.navigate("about:blank", { quietMs: 50, maxSettleMs: 1000, loadTimeoutMs: 3000 }));
          validateFontCalibration(await bounded(page.evaluate(FONT_SAMPLE(config.width))), config);
        } catch { throw new Error("FONT_CAPABILITY_NOT_EXECUTED"); }
        await bounded(page.navigate(preview.origin + route, { quietMs: 150, maxSettleMs: 5000, loadTimeoutMs: 8000 }));
        await waitForText(page, route === "/" ? "Browse Peptides & Supplements" : "We cannot check this recommendation right now.", bounded);
        const font = validateFontCalibration(await bounded(page.evaluate(FONT_SAMPLE(config.width))), config);
        const audit = await bounded(page.evaluate(PAGE_AUDIT_SOURCE));
        const view = await bounded(page.evaluate(`({ text:document.body.innerText, h1:document.querySelectorAll('h1').length,
          main:document.querySelectorAll('main').length, overflow:document.documentElement.scrollWidth > innerWidth + 1,
          robots:document.querySelector('meta[name="robots"]')?.content ?? '',
          authorityTags:document.querySelectorAll('link[rel="canonical"],meta[property^="og:"],script[type="application/ld+json"]').length,
          controls:[...document.querySelectorAll('a,button')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),
            height:e.getBoundingClientRect().height,disabled:!!e.disabled})).filter(e=>e.height>0) })`));
        const assertions = [
          { name: "one_heading_and_main", passed: view.h1 === 1 && view.main === 1 },
          { name: "no_horizontal_overflow", passed: !view.overflow },
          { name: "actual_default_font_calibrated", passed: true },
          { name: "no_duplicate_ids", passed: audit.duplicateIds.length === 0 },
          { name: "no_unlabelled_controls", passed: audit.forms.unlabelledControls.length === 0 },
          { name: "no_invalid_aria_references", passed: audit.invalidAriaRefs.length === 0 },
          { name: "no_missing_image_alt", passed: audit.images.missingAlt.length === 0 },
          { name: "no_clipped_text", passed: audit.overflow.clippedText.length === 0 },
        ];
        if (route === "/") assertions.push(
          { name: "home_offerings", passed: view.text.includes("Tensa Health") && view.text.includes("Browse Peptides & Supplements") },
          { name: "infinity_in_development", passed: view.text.includes("Infinity") && view.text.includes("In development") },
          { name: "home_cta_and_category_hrefs", passed: view.controls.some((c) => c.text === "Browse Peptides & Supplements" && c.href === "/earlyaccess")
            && ["clinical", "research_peptides", "supplements", "topicals"].every((category) => view.controls.some((c) => c.href === `/earlyaccess?category=${category}`)) });
        else assertions.push(
          { name: "recipient_unavailable_truthful", passed: view.text.includes("We cannot check this recommendation right now.") && !view.text.includes("invalid, expired") },
          { name: "recipient_noindex", passed: view.robots.includes("noindex") },
          { name: "recipient_no_authority_tags", passed: view.authorityTags === 0 },
          { name: "recipient_controls_44px", passed: ["Try again", "Explore Xenios Health", "Research support", "Care support"].every((text) => view.controls.some((c) => c.text === text && c.height >= 44)) });
        const slug = `${config.name}-${route === "/" ? "home" : "recipient"}`;
        const screenshot = await bounded(page.screenshot({ fullPage: false }));
        requireThat(screenshot.coverage.capturedWidthPx === config.width && screenshot.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
        const capture = { route, configuration: config, browserIdentity: activeProfile.identity, font, audit, assertions,
          screenshot: write(`${slug}.png`, screenshot.bytes), text: write(`${slug}.text.json`, view),
          screenshotCoverage: screenshot.coverage, network: [] };
        result.captures.push(capture);
        if (config.name === "phone100") {
          capture.keyboard = await keyboardProof(page, route, bounded);
          const focused = await bounded(page.screenshot({ fullPage: false }));
          capture.focusScreenshot = write(`${slug}-focus.png`, focused.bytes);
        }
        await bounded(page.waitForBoundaryTargets());
        capture.network = { violations: page.networkBoundaryViolations.map((v) => ({ target: safeNetworkUrl(v.url), reason: v.reason })),
          fulfillmentCount: page.networkBoundaryFulfillments.length, pending: page.inflight.size,
          pendingTargets: page.boundaryTargetPromises.size, setupErrors: page.boundarySetupErrors.length,
          console: page.console.map(({ level, text }) => ({ level, text: String(text).slice(0, 300) })) };
        result.violations.push(...capture.network.violations);
        requireThat(!capture.network.fulfillmentCount && !capture.network.pending && !capture.network.pendingTargets
          && !capture.network.setupErrors, "NETWORK_BOUNDARY_INCOMPLETE");
        pageOff();
        await bounded(page.close()); page = null;
      }
      setPhase(`${config.name}_browser_cleanup`);
      const closed = await closeConfiguration();
      requireThat(Object.values(closed).every(Boolean), "PROFILE_CLEANUP_UNCONFIRMED");
    }
    validateProfileReceipts(result.browserProfiles);
    snapshot.assertUnchanged();
    requireThat(inventorySha256(inventoryDirectory(publicRoot)) === inventoryHash, "BUILD_CHANGED_DURING_QA");
    requireThat(OWNED_SOURCES.every((path, i) => hash(readFileSync(join(repo, path))) === result.sources[i].sha256), "SOURCE_CHANGED_DURING_QA");
    result.fixture.counters = { ...preview.counters };
    requireThat(preview.counters.resolve404 === 5 && !preview.counters.refused && !preview.counters.unexpected
      && !preview.counters.credentialAttempts, "PREVIEW_REQUEST_CONTRACT_FAILED");
    requireThat(!result.violations.length, "NETWORK_BOUNDARY_VIOLATION");
    requireThat(!stopped && result.captures.length === 8 && result.captures.every((c) => c.assertions.every((a) => a.passed)), "UI_ASSERTIONS_FAILED");
    result.state = "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY";
    setPhase("complete");
  } catch (error) {
    result.state = "FAILED_OR_NOT_EXECUTED";
    result.failure = /^[A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "OWNED_QA_FAILED";
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }

  function cleanup() { return cleanupPromise ??= performCleanup(); }
  function closeConfiguration() { return closeConfigurationPromise ??= performConfigurationClose(); }
  async function performConfigurationClose() {
    const status = { page: !page, cdp: !conn, browserExit: !launchStarted, profileRemoved: !launchStarted };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); status[name] = true; } catch { status[name] = false; } };
    observerOff?.(); observerOff = null;
    if (page) await close("page", () => page.close());
    if (conn) await close("cdp", () => conn.close());
    if (browser) {
      await close("browserExit", async () => {
        await browser.close();
        if (!await waitForOwnedExit(browser.process, 700)) {
          if (activeProfile) activeProfile.cleanupEscalatedToKill = true;
          browser.process.kill("SIGKILL");
          requireThat(await waitForOwnedExit(browser.process, 1200), "BROWSER_EXIT_UNCONFIRMED");
        }
        // A late writer may have recreated a directory after the first close.
        if (existsSync(browser.userDataDir)) await browser.close();
      });
      status.profileRemoved = !existsSync(browser.userDataDir);
      if (activeProfile) activeProfile.launchDiagnostics = browser.diagnostics();
    }
    if (activeProfile) {
      activeProfile.cleanup = { ...status };
      activeProfile.closedMs = Date.now();
    }
    if (Object.values(status).every(Boolean)) {
      page = null; conn = null; browser = null; launchStarted = false; activeProfile = null;
    }
    return status;
  }
  async function performCleanup() {
    const current = await closeConfiguration();
    result.cleanup = { ...current, completedProfiles: result.browserProfiles.every((r) => r.cleanup
      && Object.values(r.cleanup).every(Boolean)), server: !preview, snapshot: !snapshot };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); result.cleanup[name] = true; } catch { result.cleanup[name] = false; } };
    if (preview) await close("server", () => preview.close());
    if (snapshot) await close("snapshot", () => { snapshot.dispose(); requireThat(!existsSync(snapshot.parent), "SNAPSHOT_REMAINS"); });
    if (!Object.values(result.cleanup).every(Boolean)) { result.state = "FAILED_OR_NOT_EXECUTED"; result.failure ??= "CLEANUP_FAILED"; }
    result.finishedAt = new Date().toISOString();
    result.elapsedMs = Date.now() - started;
    write("result.json", result);
  }
  return result.state === "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY" ? 0 : 1;
}

function waitForOwnedExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((done) => {
    const finish = (exited) => { clearTimeout(timer); child.off("exit", exitedHandler); done(exited); };
    const exitedHandler = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", exitedHandler);
  });
}

async function waitForText(page, text, bounded) {
  for (let i = 0; i < 40; i++) {
    if (await bounded(page.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`))) return;
    await bounded(new Promise((r) => setTimeout(r, 75)), 200);
  }
  throw new Error("EXPECTED_UI_STATE_MISSING");
}

async function key(page, keyName, bounded) {
  const code = keyName === " " ? "Space" : keyName;
  for (const type of ["keyDown", "keyUp"]) await bounded(page.send("Input.dispatchKeyEvent", {
    type, key: keyName, code, windowsVirtualKeyCode: keyName === "Enter" ? 13 : 32,
    ...(type === "keyDown" && keyName === " " ? { text: " " } : {}),
  }));
}

async function keyboardProof(page, route, bounded) {
  await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
  const walk = [];
  const desired = route === "/" ? null : ["Try again", "Explore Xenios Health", "Research support", "Care support"];
  let found = 0, actionDone = false;
  for (let i = 0; i < (route === "/" ? 36 : 16); i++) {
    await bounded(page.pressTab());
    const sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const text = await bounded(page.evaluate("document.activeElement?.textContent?.trim() ?? ''"));
    walk.push({ sample, text: text.slice(0, 100) });
    if (desired && text === desired[found]) {
      requireThat(sample.indicator && sample.inViewport, "KEYBOARD_FOCUS_NOT_VISIBLE");
      if (found === 0) { await key(page, "Enter", bounded); await waitForText(page, "We cannot check this recommendation right now.", bounded); actionDone = true; }
      found++;
      if (found === desired.length) break;
    }
    if (!desired && !actionDone) {
      const menu = await bounded(page.evaluate("document.activeElement?.tagName === 'SUMMARY' && document.activeElement.parentElement?.matches('details.xh-mobile-nav:not([open])')"));
      if (menu) {
        requireThat(sample.indicator, "KEYBOARD_HOME_FOCUS_NOT_VISIBLE");
        await key(page, "Enter", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === true")), "KEYBOARD_MENU_DID_NOT_OPEN");
        await key(page, " ", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === false")), "KEYBOARD_MENU_DID_NOT_CLOSE");
        actionDone = true;
        break;
      }
    }
  }
  requireThat(actionDone && (!desired || found === desired.length), "KEYBOARD_CONTRACT_INCOMPLETE");
  await bounded(page.pressTab({ shift: true }));
  const reverse = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  requireThat(reverse.indicator && reverse.inViewport, "KEYBOARD_REVERSE_FOCUS_NOT_VISIBLE");
  return { walk, reverse, enterOrSpaceAction: actionDone, policyOrAccountSubmitted: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== "--run") {
    process.stderr.write("OWNED_QA_INVOCATION_REFUSED\n"); process.exitCode = 1;
  } else {
    run().then((code) => { process.exit(code); }).catch(() => {
      process.stderr.write("OWNED_QA_PRECONDITION_FAILED\n"); process.exit(1);
    });
  }
}
