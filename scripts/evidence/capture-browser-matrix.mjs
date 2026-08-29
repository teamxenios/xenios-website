// Deterministic browser evidence matrix.
//
//   node scripts/evidence/capture-browser-matrix.mjs --base-url http://127.0.0.1:5184 --out-dir <dir> [--sha <sha>]
//       [--routes scripts/evidence/routes.public.json] [--widths 1440,320] [--only /research,/care]
//       [--reviewer <name>] [--no-focus-walk] [--no-media-variants] [--no-zoom] [--max-tab-stops 80]
//
// Per route x width: navigates, waits for network quiet, runs the in-page audit
// (overflow, clipped text, <44x44 targets, main landmarks, duplicate ids, headings,
// labels, alt text, aria refs), walks the Tab order recording focus-visible, then
// screenshots the default render. Per route (at 390 px) it also renders
// prefers-reduced-motion and forced-colors variants. A 200 % zoom equivalent is
// rendered as a 720 CSS px viewport at deviceScaleFactor 2.
//
// Outputs (all under --out-dir):
//   captures/<surface>--<state>--chromium--<width|200pct>[-<variant>]--01.png
//   captures/<same>.text.txt        rendered innerText (for the PII text scan)
//   runs/<index>-<slug>.json        full audit + assertions per run
//   browser-matrix.json             index of all runs + tool versions
//
// Never claims a release verdict: per-run results are AUTOMATED_PASS / _FAIL.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession } from "./lib/cdp.mjs";
import { PAGE_AUDIT_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";
import { analyseFocusWalk, applyReviewedAssertionNotes, artifactName, evaluateAudit, runVerdict, slug } from "./lib/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export const EVIDENCE_PWA_DISMISSAL_SOURCE = `
  try {
    window.sessionStorage.setItem("xenios-pwa-hint-dismissed", "1");
  } catch {}
`;

export function parseArgs(argv) {
  const out = { focusWalk: true, mediaVariants: true, zoom: true, maxTabStops: 80, reviewer: "automated", widths: null, only: null, routes: join(here, "routes.public.json") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--base-url") out.baseUrl = next();
    else if (a === "--out-dir") out.outDir = next();
    else if (a === "--sha") out.sha = next();
    else if (a === "--routes") out.routes = next();
    else if (a === "--widths") out.widths = next().split(",").map((w) => Number(w.trim())).filter(Boolean);
    else if (a === "--only") out.only = next().split(",").map((s) => s.trim());
    else if (a === "--reviewer") out.reviewer = next();
    else if (a === "--max-tab-stops") out.maxTabStops = Number(next());
    else if (a === "--no-focus-walk") out.focusWalk = false;
    else if (a === "--no-media-variants") out.mediaVariants = false;
    else if (a === "--no-zoom") out.zoom = false;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

export function gitSha(cwd = process.cwd()) {
  try {
    return execSync("git rev-parse HEAD", { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

async function focusWalk(page, maxStops) {
  // Start from the document so the walk begins at the first tab stop.
  await page.evaluate("(document.activeElement && document.activeElement.blur && document.activeElement.blur(), window.scrollTo(0,0), true)");
  const probes = [];
  for (let i = 0; i < maxStops; i++) {
    await page.pressTab();
    const probe = await page.evaluate(FOCUS_PROBE_SOURCE);
    probes.push(probe);
    if (probe.body && i > 0) break;
  }
  return analyseFocusWalk(probes, { maxStops });
}

export function compileExpectedHttpFailures(route, baseUrl) {
  const base = new URL(baseUrl);
  const compiled = (route.expectedHttpFailures ?? []).map((expected) => {
    if (!/^\/api\//u.test(expected.path ?? "")) throw new Error(`expected HTTP failure path must be an exact /api/ path: ${expected.path}`);
    if (!Number.isInteger(expected.status) || expected.status < 400 || expected.status > 599) throw new Error(`expected HTTP failure needs an exact 4xx/5xx status: ${expected.path}`);
    if (!['GET', 'HEAD'].includes(String(expected.method ?? "").toUpperCase())) throw new Error(`expected HTTP failure needs GET or HEAD: ${expected.path}`);
    if (Number(expected.count ?? 0) < 1) throw new Error(`expected HTTP failure needs a positive count: ${expected.path}`);
    if (!/^[a-f0-9]{64}$/u.test(expected.responseBodySha256 ?? "")) throw new Error(`expected HTTP failure needs an exact response-body SHA-256: ${expected.path}`);
    if (!expected.consoleText || !expected.reason || !expected.productionEvidence) throw new Error(`expected HTTP failure needs consoleText, reason, and productionEvidence: ${expected.path}`);
    const url = new URL(expected.path, base);
    if (url.origin !== base.origin) throw new Error(`expected HTTP failure must stay on the preview origin: ${expected.path}`);
    return { ...expected, method: expected.method.toUpperCase(), url: url.toString() };
  });
  const keys = compiled.map((expected) => `${expected.method} ${expected.url}`);
  if (new Set(keys).size !== keys.length) throw new Error("expected HTTP failure declarations must use unique method + URL pairs");
  return compiled;
}

export function bindReviewedAssertionNotes(routes, { sha, cwd = process.cwd(), resolveGitObject } = {}) {
  const resolver = resolveGitObject ?? ((candidateSha, sourcePath) =>
    execFileSync("git", ["rev-parse", "--verify", `${candidateSha}:${sourcePath}`], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim());
  return routes.map((route) => {
    if (!(route.reviewedAssertionNotes ?? []).length) return route;
    if (route.path !== "/hino" || route.externalMicrosite !== true) {
      throw new Error(`reviewed assertion notes are limited to the protected /hino external microsite: ${route.path}`);
    }
    if (!/^[a-f0-9]{40}$/u.test(sha ?? "")) throw new Error(`reviewed assertion notes require an exact 40-character candidate SHA: ${route.path}`);
    return {
      ...route,
      reviewedAssertionNotes: route.reviewedAssertionNotes.map((note) => {
        if (note.id !== "TARGETS_44x44"
          || !/^[a-f0-9]{40}$/u.test(note.productionCommit ?? "")
          || !note.reason
          || !note.productionEvidence
          || !(note.allowedFindingFingerprints ?? []).length
          || !note.allowedFindingFingerprints.every((fingerprint) => /^[a-f0-9]{64}$/u.test(fingerprint))) {
          throw new Error(`reviewed assertion note is incomplete or unsupported: ${route.path}`);
        }
        const source = note.candidateSource ?? {};
        if (!/^client\/public\/hino$/u.test(source.path ?? "") || !/^[a-f0-9]{40}$/u.test(source.gitTree ?? "")) {
          throw new Error(`reviewed assertion note has an invalid candidate source binding: ${route.path}`);
        }
        const actualGitTree = resolver(sha, source.path);
        const productionGitTree = resolver(note.productionCommit, source.path);
        if (actualGitTree !== source.gitTree || productionGitTree !== source.gitTree || actualGitTree !== productionGitTree) {
          throw new Error(`reviewed assertion source tree mismatch for ${route.path}: declared ${source.gitTree}, candidate ${actualGitTree}, production ${productionGitTree}`);
        }
        return {
          ...note,
          sourceBindingVerified: true,
          candidateSourceBinding: {
            candidateSha: sha,
            path: source.path,
            expectedGitTree: source.gitTree,
            actualGitTree,
            productionCommit: note.productionCommit,
            productionGitTree,
          },
        };
      }),
    };
  });
}

async function runOne(page, { baseUrl, route, width, height, deviceScaleFactor, zoomPercent, variant, media, doFocusWalk, maxTabStops, outDir, sha, browser, reviewer, sequence }) {
  const url = new URL(route.path, baseUrl).toString();
  await page.setViewport({ width, height, deviceScaleFactor, mobile: width <= 768 });
  await page.setMedia(media);
  const started = new Date();
  let navError = null;
  let audit = null;
  let walk = null;
  let navigationMs = null;
  try {
    ({ navigationMs } = await page.navigate(url));
    audit = await page.evaluate(PAGE_AUDIT_SOURCE);
    if (doFocusWalk) walk = await focusWalk(page, maxTabStops);
    // Restore scroll for the screenshot after the walk.
    await page.evaluate("(window.scrollTo(0,0), true)");
  } catch (e) {
    navError = String(e.message ?? e);
  }
  const consoleRecords = page.console.slice();
  const network = page.network.slice();
  const surfaceLabel = route.label ? `${route.surface}-${route.label}` : route.surface;
  const fileName = artifactName({ surface: surfaceLabel, state: route.state, browser: browser.browserName, width, zoomPercent, variant, sequence });
  let artifactPath = null;
  if (!navError) {
    const png = await page.screenshot({ fullPage: true });
    mkdirSync(join(outDir, "captures"), { recursive: true });
    writeFileSync(join(outDir, "captures", fileName), png);
    writeFileSync(join(outDir, "captures", fileName.replace(/\.png$/, ".text.txt")), await page.evaluate("document.body ? document.body.innerText : ''"));
    artifactPath = `captures/${fileName}`;
  }
  const expectedHttpFailures = compileExpectedHttpFailures(route, baseUrl);
  const rawAssertions = audit
    ? evaluateAudit(audit, { focusWalk: walk, console: consoleRecords, network, allowNetwork: route.allowNetwork?.map((s) => new RegExp(s)) ?? [], expectedHttpFailures })
    : [{ id: "NAVIGATION", result: "FAIL", detail: navError }];
  const assertions = audit
    ? applyReviewedAssertionNotes(rawAssertions, audit, route.reviewedAssertionNotes ?? [])
    : rawAssertions;
  const consoleErrors = consoleRecords.filter((c) => c.level !== "warning" && c.level !== "log:warning");
  const failedNet = network.filter((n) => (n.failed && !n.canceled) || n.status >= 400);
  return {
    candidateSha: sha,
    artifactPath,
    route: route.path,
    surface: route.surface,
    state: route.state,
    browserName: browser.browserName,
    browserVersion: browser.browserVersion,
    widthCssPx: width,
    heightCssPx: height,
    deviceScaleFactor,
    zoomPercent,
    zoomMethod: zoomPercent === 200 ? "720 CSS px viewport at deviceScaleFactor 2 (1440 px screen at 200% zoom)" : null,
    colorScheme: media.forcedColors ? "forced-colors" : media.colorScheme,
    mediaVariant: variant || "default",
    syntheticFixtureId: route.fixture ?? "none",
    pwaInstallHintState: "SESSION_DISMISSED_BEFORE_DOCUMENT",
    timestampUtc: started.toISOString(),
    reviewer,
    navigationMs,
    navigationError: navError,
    consoleResult: consoleErrors.length === 0 ? "CLEAN" : `ERRORS:${consoleErrors.length}`,
    consoleRecords: consoleRecords.slice(0, 40),
    networkResult: failedNet.length === 0 ? "CLEAN" : `FAILURES:${failedNet.length}`,
    networkFailures: failedNet.slice(0, 40),
    piiPhiReview: "MANUAL_PENDING",
    assertions,
    verdict: runVerdict(assertions),
    audit,
    focusWalk: walk,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.baseUrl || !args.outDir) {
    console.log("usage: capture-browser-matrix.mjs --base-url <url> --out-dir <dir> [--sha <sha>] [--routes <json>] [--widths a,b] [--only /p1,/p2] [--reviewer <name>] [--no-focus-walk] [--no-media-variants] [--no-zoom]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  mkdirSync(join(outDir, "runs"), { recursive: true });
  const inventory = JSON.parse(readFileSync(resolve(args.routes), "utf8"));
  const widths = args.widths ?? inventory.widthsCssPx;
  const sha = args.sha ?? gitSha() ?? "UNKNOWN";
  const routes = bindReviewedAssertionNotes(inventory.routes, { sha })
    .filter((r) => !args.only || args.only.includes(r.path));
  const browser = await launchChromium();
  const conn = await new CdpConnection(browser.wsUrl).open();
  const page = await PageSession.create(conn);
  await page.send("Page.addScriptToEvaluateOnNewDocument", {
    source: EVIDENCE_PWA_DISMISSAL_SOURCE,
  });
  const runs = [];
  const startedAt = new Date().toISOString();
  let index = 0;
  const record = async (opts) => {
    const run = await runOne(page, { ...opts, outDir, sha, browser, reviewer: args.reviewer, sequence: 1 });
    index++;
    const file = `runs/${String(index).padStart(3, "0")}-${slug(`${run.surface}-${run.route}-${run.widthCssPx}-${run.zoomPercent}-${run.mediaVariant}`)}.json`;
    writeFileSync(join(outDir, file), JSON.stringify(run, null, 2));
    const summary = { ...run, audit: undefined, focusWalk: undefined, consoleRecords: undefined, networkFailures: undefined, runFile: file };
    runs.push(summary);
    console.log(`${run.verdict.padEnd(26)} ${String(run.widthCssPx).padStart(4)}@${run.zoomPercent}% ${run.mediaVariant.padEnd(14)} ${run.route}  ${run.assertions.filter((a) => a.result === "FAIL").map((a) => a.id).join(",")}`);
  };
  try {
    for (const route of routes) {
      for (const width of widths) {
        await record({ baseUrl: args.baseUrl, route, width, height: width <= 768 ? 844 : 900, deviceScaleFactor: 1, zoomPercent: 100, variant: "", media: { colorScheme: "light" }, doFocusWalk: args.focusWalk && (width === widths[0] || width === 390), maxTabStops: args.maxTabStops });
      }
      if (args.zoom) {
        for (const z of inventory.zoomEquivalents ?? []) {
          await record({ baseUrl: args.baseUrl, route, width: z.widthCssPx, height: 450, deviceScaleFactor: z.deviceScaleFactor, zoomPercent: z.zoomPercent, variant: "", media: { colorScheme: "light" }, doFocusWalk: false, maxTabStops: args.maxTabStops });
        }
      }
      if (args.mediaVariants) {
        const w = widths.includes(390) ? 390 : widths[widths.length - 1];
        await record({ baseUrl: args.baseUrl, route, width: w, height: 844, deviceScaleFactor: 1, zoomPercent: 100, variant: "reduced-motion", media: { colorScheme: "light", reducedMotion: true }, doFocusWalk: false, maxTabStops: args.maxTabStops });
        await record({ baseUrl: args.baseUrl, route, width: w, height: 844, deviceScaleFactor: 1, zoomPercent: 100, variant: "forced-colors", media: { colorScheme: "light", forcedColors: true }, doFocusWalk: args.focusWalk, maxTabStops: args.maxTabStops });
      }
    }
    // Public -> private -> public client-side navigation: title/canonical must be restored.
    const restoration = [];
    for (const pair of inventory.metadataRestoration ?? []) {
      if (args.only && !args.only.includes(pair.public)) continue;
      await page.setViewport({ width: 1024, height: 900, deviceScaleFactor: 1, mobile: false });
      await page.setMedia({ colorScheme: "light" });
      const readMeta = () => page.evaluate("({ title: document.title, canonical: (document.querySelector('link[rel=canonical]')||{}).href || null, robots: (document.querySelector('meta[name=robots]')||{}).content || null, path: location.pathname })");
      await page.navigate(new URL(pair.public, args.baseUrl).toString());
      const before = await readMeta();
      await page.evaluate(`(history.pushState({}, '', ${JSON.stringify(pair.private)}), dispatchEvent(new PopStateEvent('popstate')), true)`);
      await page.settle();
      const during = await readMeta();
      await page.evaluate(`(history.pushState({}, '', ${JSON.stringify(pair.backTo)}), dispatchEvent(new PopStateEvent('popstate')), true)`);
      await page.settle();
      const after = await readMeta();
      const restored = before.title === after.title && before.canonical === after.canonical && before.robots === after.robots;
      restoration.push({ ...pair, before, during, after, result: restored ? "PASS" : "FAIL", privateSignalsNoindex: /noindex/i.test(during.robots ?? "") });
    }
    const matrix = {
      schemaVersion: 2,
      kind: "browser-matrix",
      candidateSha: sha,
      baseUrl: args.baseUrl,
      startedAtUtc: startedAt,
      finishedAtUtc: new Date().toISOString(),
      tool: { name: "scripts/evidence/capture-browser-matrix.mjs", node: process.version, browserName: browser.browserName, browserVersion: browser.browserVersion, chromiumRevision: browser.revision, protocolVersion: browser.protocolVersion, driver: "raw CDP over ws", controlledUiState: { pwaInstallHint: "session-dismissed before every document" } },
      widthsCssPx: widths,
      zoomEquivalents: args.zoom ? inventory.zoomEquivalents : [],
      routesFile: resolve(args.routes),
      runs,
      metadataRestoration: restoration,
      summary: {
        runs: runs.length,
        automatedPass: runs.filter((r) => r.verdict === "AUTOMATED_PASS").length,
        automatedPassWithNotes: runs.filter((r) => r.verdict === "AUTOMATED_PASS_WITH_NOTES").length,
        automatedFail: runs.filter((r) => r.verdict === "AUTOMATED_FAIL").length,
        failingAssertionIds: [...new Set(runs.flatMap((r) => r.assertions.filter((a) => a.result === "FAIL").map((a) => a.id)))],
      },
    };
    writeFileSync(join(outDir, "browser-matrix.json"), JSON.stringify(matrix, null, 2));
    console.log(`\n${matrix.summary.runs} runs: ${matrix.summary.automatedPass} pass, ${matrix.summary.automatedPassWithNotes} pass-with-notes, ${matrix.summary.automatedFail} fail -> ${join(outDir, "browser-matrix.json")}`);
    return matrix;
  } finally {
    await page.close();
    await conn.close();
    await browser.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
