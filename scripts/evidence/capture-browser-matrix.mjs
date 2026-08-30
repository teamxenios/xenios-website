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
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync, execSync } from "node:child_process";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession } from "./lib/cdp.mjs";
import {
  FOCUS_BASELINE_RESET_SOURCE,
  FOCUS_BASELINE_SOURCE,
  PAGE_AUDIT_SOURCE,
  FOCUS_PROBE_SOURCE,
} from "./lib/page-audit.js";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  fetchPreviewProvenance,
} from "./lib/provenance.mjs";
import { analyseFocusWalk, applyReviewedAssertionNotes, artifactName, evaluateAudit, runVerdict, slug } from "./lib/report.mjs";
import {
  assertExternalMicrositeInventory,
  assertExternalMicrositeRoute,
} from "./lib/route-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export const EVIDENCE_PWA_DISMISSAL_SOURCE = `
  try {
    window.sessionStorage.setItem("xenios-pwa-hint-dismissed", "1");
  } catch {}
`;

// Production typography is bundled from pinned Fontsource packages. Any
// network-generating external URL in the candidate document is therefore a
// contract violation; there are deliberately no evidence substitutions.
export const EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS = Object.freeze([]);

const INTER_TIGHT_WEIGHTS = Object.freeze(["500", "600", "700", "800", "900"]);
const JETBRAINS_MONO_WEIGHTS = Object.freeze(["500", "600"]);

function tagAttribute(tag, name) {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "iu").exec(tag);
  return match?.[2] ?? null;
}

export function validateExternalResourceContract(html, substitutions = EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS) {
  const discovered = [];
  for (const tag of String(html).match(/<(?:link|script|img|source|video|audio|iframe)\b[^>]*>/giu) ?? []) {
    const tagName = /^<([a-z]+)/iu.exec(tag)?.[1]?.toLowerCase();
    if (tagName === "link") {
      const rel = (tagAttribute(tag, "rel") ?? "").toLowerCase().split(/\s+/u);
      if (!rel.some((value) => ["stylesheet", "preconnect", "dns-prefetch", "modulepreload", "preload", "prefetch", "icon"].includes(value))) continue;
    }
    for (const attribute of ["href", "src"]) {
      const value = tagAttribute(tag, attribute);
      if (/^https?:\/\//iu.test(value ?? "")) discovered.push(new URL(value).toString());
    }
  }
  const actual = [...new Set(discovered)].sort();
  const declared = [...new Set(substitutions.map((fixture) => new URL(fixture.url).toString()))].sort();
  if (JSON.stringify(actual) !== JSON.stringify(declared)) {
    throw new Error(
      `served candidate external-resource inventory mismatch: actual=${JSON.stringify(actual)} declared=${JSON.stringify(declared)}`,
    );
  }
  return {
    result: "PASS",
    discoveredUrls: actual,
    substitutions: substitutions.map((fixture) => ({
      url: new URL(fixture.url).toString(),
      contentType: fixture.contentType,
      reason: fixture.reason,
      responseBodySha256: createHash("sha256").update(fixture.body).digest("hex"),
    })),
  };
}

export function evaluateSelfHostedFontSnapshot(route, snapshot) {
  if (assertExternalMicrositeRoute(route)) {
    return {
      id: "SELF_HOSTED_FONTS_LOADED",
      result: "NOT_APPLICABLE",
      detail: snapshot?.reason ?? "external microsite owns its static typography",
    };
  }
  const failures = [];
  if (snapshot?.applicable !== true) failures.push("font probe was not applicable");
  if (!String(snapshot?.bodyFontFamily ?? "").toLowerCase().includes("inter tight")) {
    failures.push(`body computed font-family did not include Inter Tight (${snapshot?.bodyFontFamily ?? "missing"})`);
  }
  for (const weight of INTER_TIGHT_WEIGHTS) {
    if (snapshot?.interTight?.[weight] !== true) failures.push(`Inter Tight ${weight} did not load`);
  }
  for (const weight of JETBRAINS_MONO_WEIGHTS) {
    if (snapshot?.jetBrainsMono?.[weight] !== true) failures.push(`JetBrains Mono ${weight} did not load`);
  }
  return {
    id: "SELF_HOSTED_FONTS_LOADED",
    result: failures.length === 0 ? "PASS" : "FAIL",
    detail: failures.length === 0
      ? "pinned same-origin Inter Tight 500/600/700/800/900 and JetBrains Mono 500/600 loaded; body uses Inter Tight"
      : failures.join("; "),
    count: failures.length,
  };
}

async function collectSelfHostedFontSnapshot(page, route) {
  if (assertExternalMicrositeRoute(route)) {
    return { applicable: false, reason: "external microsite owns its static typography" };
  }
  return page.evaluate(`(async () => {
    await document.fonts.ready;
    const load = async (family, weight) => {
      const descriptor = weight + ' 16px "' + family + '"';
      const faces = await document.fonts.load(descriptor, "Xenios evidence");
      return faces.length > 0 && document.fonts.check(descriptor, "Xenios evidence");
    };
    const interWeights = ${JSON.stringify(INTER_TIGHT_WEIGHTS)};
    const monoWeights = ${JSON.stringify(JETBRAINS_MONO_WEIGHTS)};
    return {
      applicable: true,
      bodyFontFamily: document.body ? getComputedStyle(document.body).fontFamily : "",
      interTight: Object.fromEntries(await Promise.all(interWeights.map(async (weight) => [weight, await load("Inter Tight", weight)]))),
      jetBrainsMono: Object.fromEntries(await Promise.all(monoWeights.map(async (weight) => [weight, await load("JetBrains Mono", weight)]))),
    };
  })()`);
}

export function evaluateMetadataRestoration(pair, before, during, after) {
  const expectedPrivatePath = pair.privateExpectedPath ?? pair.private;
  const returnToMatched = pair.privateExpectedReturnTo
    ? during.searchParams?.returnTo === pair.privateExpectedReturnTo
    : true;
  const pathsMatched = before.path === pair.public
    && during.path === expectedPrivatePath
    && after.path === pair.backTo
    && returnToMatched;
  const allPresent = (required, presence) => (required ?? []).every((value) => presence?.[value] === true);
  const publicContractSize = (pair.publicRequiredSelectors?.length ?? 0) + (pair.publicRequiredText?.length ?? 0);
  const privateContractSize = (pair.privateRequiredSelectors?.length ?? 0) + (pair.privateRequiredText?.length ?? 0);
  const publicIdentityMatched = publicContractSize > 0
    && allPresent(pair.publicRequiredSelectors, before.selectorPresence)
    && allPresent(pair.publicRequiredText, before.requiredTextPresence)
    && allPresent(pair.publicRequiredSelectors, after.selectorPresence)
    && allPresent(pair.publicRequiredText, after.requiredTextPresence);
  const privateIdentityMatched = privateContractSize > 0
    && allPresent(pair.privateRequiredSelectors, during.selectorPresence)
    && allPresent(pair.privateRequiredText, during.requiredTextPresence);
  const privateSignalsNoindex = /\bnoindex\b/iu.test(during.robots ?? "");
  const metadataChangedDuring = before.title !== during.title
    || before.canonical !== during.canonical
    || before.robots !== during.robots;
  const restored = before.title === after.title
    && before.canonical === after.canonical
    && before.robots === after.robots;
  const failures = [
    !pathsMatched && `paths/search did not match public=${pair.public}, private=${expectedPrivatePath}, backTo=${pair.backTo}`,
    !publicIdentityMatched && "public page identity was not present before and after navigation",
    !privateIdentityMatched && "private boundary identity was not present during navigation",
    !privateSignalsNoindex && "private boundary did not expose a noindex robots meta directive",
    !metadataChangedDuring && "private metadata did not differ from public metadata",
    !restored && "public title/canonical/robots metadata was not restored exactly",
  ].filter(Boolean);
  return {
    pathsMatched,
    publicIdentityMatched,
    privateIdentityMatched,
    privateSignalsNoindex,
    metadataChangedDuring,
    restored,
    failures,
    result: failures.length === 0 ? "PASS" : "FAIL",
  };
}

export function routeInventoryDescriptor(routesPath, routesSource) {
  const absolute = resolve(routesPath);
  const portableBasename = basename(routesPath.replaceAll("\\", "/"));
  return {
    id: absolute === resolve(here, "routes.public.json")
      ? "scripts/evidence/routes.public.json"
      : `custom/${portableBasename}`,
    sha256: createHash("sha256").update(routesSource).digest("hex"),
  };
}

async function validateServedExternalResourceContract(baseUrl) {
  const response = await fetch(new URL("/", baseUrl), {
    redirect: "error",
    headers: { accept: "text/html", "user-agent": "xenios-evidence-resource-contract/1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`candidate root returned HTTP ${response.status}`);
  return validateExternalResourceContract(await response.text());
}

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
  await page.evaluate(FOCUS_BASELINE_RESET_SOURCE);
  const expectedIdentities = new Set();
  const refreshBaseline = async () => {
    const baseline = await page.evaluate(FOCUS_BASELINE_SOURCE);
    for (const identity of baseline?.tabbableIdentities ?? []) expectedIdentities.add(identity);
  };
  await refreshBaseline();
  const probes = [];
  for (let i = 0; i < maxStops; i++) {
    // Incrementally baseline controls revealed during the walk. Existing
    // baselines are immutable, and the currently focused control is skipped.
    await refreshBaseline();
    await page.pressTab();
    const probe = await page.evaluate(FOCUS_PROBE_SOURCE);
    probes.push(probe);
    if (probe.body && i > 0) break;
  }
  return analyseFocusWalk(probes, { maxStops, expectedIdentities: [...expectedIdentities] });
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

export function evaluateRouteStateContract(route, snapshot) {
  const expectedPath = new URL(route.expectedBrowserPath ?? route.path, "https://evidence.invalid").pathname;
  const locationPass = snapshot.path === expectedPath;
  const locationAssertion = {
    id: "ROUTE_LOCATION",
    result: locationPass ? "PASS" : "FAIL",
    detail: `path=${snapshot.path} expected=${expectedPath}`,
  };
  const contract = route.semanticContract;
  if (!contract) {
    return [
      locationAssertion,
      {
        id: "ROUTE_STATE_CONTRACT",
        result: "FAIL",
        detail: "blocking route-specific semantic contract is missing",
        count: 1,
      },
    ];
  }
  const bodyText = String(snapshot.bodyText ?? "").toLowerCase();
  const missingSelectors = (contract.requiredSelectors ?? []).filter(
    (selector) => snapshot.selectorPresence?.[selector] !== true,
  );
  const presentForbiddenSelectors = (contract.forbiddenSelectors ?? []).filter(
    (selector) => snapshot.selectorPresence?.[selector] === true,
  );
  const missingText = (contract.requiredText ?? []).filter(
    (text) => !bodyText.includes(String(text).toLowerCase()),
  );
  const presentForbiddenText = (contract.forbiddenText ?? []).filter(
    (text) => bodyText.includes(String(text).toLowerCase()),
  );
  const failures = [
    ...missingSelectors.map((value) => `missing selector ${value}`),
    ...presentForbiddenSelectors.map((value) => `forbidden selector ${value}`),
    ...missingText.map((value) => `missing text ${JSON.stringify(value)}`),
    ...presentForbiddenText.map((value) => `forbidden text ${JSON.stringify(value)}`),
  ];
  return [
    locationAssertion,
    {
      id: "ROUTE_STATE_CONTRACT",
      result: failures.length === 0 ? "PASS" : "FAIL",
      detail: failures.length === 0 ? "declared selectors and text matched" : failures.join("; "),
      count: failures.length,
    },
  ];
}

async function runOne(page, { baseUrl, route, width, height, deviceScaleFactor, zoomPercent, variant, media, doFocusWalk, maxTabStops, outDir, sha, browser, reviewer, sequence }) {
  const url = new URL(route.path, baseUrl).toString();
  await page.setViewport({ width, height, deviceScaleFactor, mobile: width <= 768 });
  await page.setMedia(media);
  const started = new Date();
  let navError = null;
  let audit = null;
  let walk = null;
  let fontSnapshot = null;
  let navigationMs = null;
  try {
    ({ navigationMs } = await page.navigate(url));
    fontSnapshot = await collectSelfHostedFontSnapshot(page, route);
    audit = await page.evaluate(PAGE_AUDIT_SOURCE);
    if (doFocusWalk) walk = await focusWalk(page, maxTabStops);
    // Restore scroll for the screenshot after the walk.
    await page.evaluate("(window.scrollTo(0,0), true)");
  } catch (e) {
    navError = String(e.message ?? e);
  }
  const surfaceLabel = route.label ? `${route.surface}-${route.label}` : route.surface;
  const fileName = artifactName({ surface: surfaceLabel, state: route.state, browser: browser.browserName, width, zoomPercent, variant, sequence });
  let artifactPath = null;
  let artifactSha256 = null;
  let textArtifactPath = null;
  let textArtifactSha256 = null;
  let screenshotCoverage = null;
  if (!navError) {
    const screenshot = await page.screenshot({ fullPage: true });
    const png = screenshot.bytes;
    screenshotCoverage = screenshot.coverage;
    const pageText = await page.evaluate("document.body ? document.body.innerText : ''");
    mkdirSync(join(outDir, "captures"), { recursive: true });
    writeFileSync(join(outDir, "captures", fileName), png);
    const textFileName = fileName.replace(/\.png$/, ".text.txt");
    writeFileSync(join(outDir, "captures", textFileName), pageText);
    artifactPath = `captures/${fileName}`;
    artifactSha256 = createHash("sha256").update(png).digest("hex");
    textArtifactPath = `captures/${textFileName}`;
    textArtifactSha256 = createHash("sha256").update(pageText).digest("hex");
  }
  const expectedHttpFailures = compileExpectedHttpFailures(route, baseUrl);
  const semanticSelectors = [
    ...(route.semanticContract?.requiredSelectors ?? []),
    ...(route.semanticContract?.forbiddenSelectors ?? []),
  ];
  const semanticSnapshot = audit
    ? await page.evaluate(`(() => {
        const selectors = ${JSON.stringify(semanticSelectors)};
        return {
          path: location.pathname,
          bodyText: document.body ? document.body.innerText : "",
          selectorPresence: Object.fromEntries(selectors.map((selector) => [selector, Boolean(document.querySelector(selector))])),
        };
      })()`)
    : { path: "", bodyText: "", selectorPresence: {} };
  let documentMetadata = null;
  if (audit) {
    await page.settle({ quietMs: 150, maxSettleMs: 2000 });
    await page.waitForBoundaryTargets();
    documentMetadata = await page.evaluate(`(() => ({
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute("content") ?? null,
      canonical: document.querySelector('link[rel="canonical"]')?.href ?? null,
      openGraph: {
        title: document.querySelector('meta[property="og:title"]')?.getAttribute("content") ?? null,
        description: document.querySelector('meta[property="og:description"]')?.getAttribute("content") ?? null,
        image: document.querySelector('meta[property="og:image"]')?.getAttribute("content") ?? null,
        url: document.querySelector('meta[property="og:url"]')?.getAttribute("content") ?? null,
        type: document.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? null,
      },
    }))()`);
  }
  // Snapshot telemetry only after screenshot, rendered text, and semantic reads
  // have completed. Those final operations can trigger lazy resources or child
  // target activity and must be included in the blocking assertions.
  const consoleRecords = page.console.slice();
  const network = page.network.slice();
  const networkBoundaryViolations = page.networkBoundaryViolations.slice();
  const networkBoundaryFulfillments = page.networkBoundaryFulfillments.slice();
  const rawAssertions = audit
    ? [
        ...evaluateAudit(audit, {
          focusWalk: walk,
          console: consoleRecords,
          network,
          networkBoundaryViolations,
          networkBoundaryFulfillments,
          allowNetwork: route.allowNetwork?.map((s) => new RegExp(s)) ?? [],
          expectedHttpFailures,
         }),
        evaluateSelfHostedFontSnapshot(route, fontSnapshot),
        ...evaluateRouteStateContract(route, semanticSnapshot),
      ]
    : [{ id: "NAVIGATION", result: "FAIL", detail: navError }];
  const assertions = audit
    ? applyReviewedAssertionNotes(rawAssertions, audit, route.reviewedAssertionNotes ?? [])
    : rawAssertions;
  const consoleErrors = consoleRecords.filter((c) => c.level !== "warning" && c.level !== "log:warning");
  const failedNet = network.filter((n) => (n.failed && !n.canceled) || n.status >= 400);
  return {
    candidateSha: sha,
    artifactPath,
    artifactSha256,
    textArtifactPath,
    textArtifactSha256,
    screenshotCoverage,
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
    coverageScope: route.coverageScope ?? "representative",
    pwaInstallHintState: "SESSION_DISMISSED_BEFORE_DOCUMENT",
    timestampUtc: started.toISOString(),
    reviewer,
    navigationMs,
    navigationError: navError,
    consoleResult: consoleErrors.length === 0 ? "CLEAN" : `ERRORS:${consoleErrors.length}`,
    consoleRecords: consoleRecords.slice(0, 40),
    networkResult: failedNet.length === 0 ? "CLEAN" : `FAILURES:${failedNet.length}`,
    networkFailures: failedNet.slice(0, 40),
    networkBoundaryViolations,
    networkBoundaryFulfillments,
    documentMetadata,
    piiPhiReview: "MANUAL_PENDING",
    assertions,
    verdict: runVerdict(assertions),
    audit,
    focusWalk: walk,
    fontSnapshot,
  };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.baseUrl || !args.outDir) {
    console.log("usage: capture-browser-matrix.mjs --base-url <url> --out-dir <dir> [--sha <sha>] [--routes <json>] [--widths a,b] [--only /p1,/p2] [--reviewer <name>] [--no-focus-walk] [--no-media-variants] [--no-zoom]");
    process.exit(args.help ? 0 : 2);
  }
  const captureRuntime = assertPinnedExecutingRuntime();
  const routesPath = resolve(args.routes);
  const routesSource = readFileSync(routesPath, "utf8");
  const inventory = JSON.parse(routesSource);
  assertExternalMicrositeInventory(inventory.routes);
  const widths = args.widths ?? inventory.widthsCssPx;
  const sha = args.sha ?? gitSha() ?? "UNKNOWN";
  const checkout = assertCleanCandidateCheckout({ sha });
  const provenance = await fetchPreviewProvenance(args.baseUrl, checkout);
  const externalResourceContract = await validateServedExternalResourceContract(args.baseUrl);
  const outDir = resolve(args.outDir);
  mkdirSync(join(outDir, "runs"), { recursive: true });
  const routes = bindReviewedAssertionNotes(inventory.routes, { sha })
    .filter((r) => !args.only || args.only.includes(r.path));
  const browser = await launchChromium();
  const conn = await new CdpConnection(browser.wsUrl).open();
  const page = await PageSession.create(conn);
  await page.enforceNetworkBoundary(new URL(args.baseUrl).origin, {
    fulfillments: EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS,
  });
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
    const runBytes = Buffer.from(JSON.stringify(run, null, 2), "utf8");
    writeFileSync(join(outDir, file), runBytes);
    const summary = {
      ...run,
      reducedMotionApplied: Boolean(run.audit?.reducedMotionApplied),
      forcedColorsActive: Boolean(run.audit?.forcedColorsActive),
      audit: undefined,
      consoleRecords: undefined,
      networkFailures: undefined,
      runFile: file,
      runFileSha256: createHash("sha256").update(runBytes).digest("hex"),
    };
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
      const semanticSelectors = [
        ...(pair.publicRequiredSelectors ?? []),
        ...(pair.privateRequiredSelectors ?? []),
      ];
      const semanticText = [
        ...(pair.publicRequiredText ?? []),
        ...(pair.privateRequiredText ?? []),
      ];
      const readMeta = () => page.evaluate(`(() => {
        const selectors = ${JSON.stringify(semanticSelectors)};
        const requiredText = ${JSON.stringify(semanticText)};
        const bodyText = (document.body?.innerText ?? "").toLowerCase();
        return {
          title: document.title,
          canonical: (document.querySelector('link[rel=canonical]') || {}).href || null,
          robots: (document.querySelector('meta[name=robots]') || {}).content || null,
          path: location.pathname,
          searchParams: Object.fromEntries(new URLSearchParams(location.search)),
          selectorPresence: Object.fromEntries(selectors.map((selector) => [selector, Boolean(document.querySelector(selector))])),
          requiredTextPresence: Object.fromEntries(requiredText.map((text) => [text, bodyText.includes(String(text).toLowerCase())])),
        };
      })()`);
      await page.navigate(new URL(pair.public, args.baseUrl).toString());
      const before = await readMeta();
      await page.evaluate(`(history.pushState({}, '', ${JSON.stringify(pair.private)}), dispatchEvent(new PopStateEvent('popstate')), true)`);
      await page.settle();
      const during = await readMeta();
      await page.evaluate(`(history.pushState({}, '', ${JSON.stringify(pair.backTo)}), dispatchEvent(new PopStateEvent('popstate')), true)`);
      await page.settle();
      const after = await readMeta();
      restoration.push({
        ...pair,
        before,
        during,
        after,
        ...evaluateMetadataRestoration(pair, before, during, after),
      });
    }
    const finalProvenance = await fetchPreviewProvenance(args.baseUrl, checkout);
    if (JSON.stringify(finalProvenance) !== JSON.stringify(provenance)) {
      throw new Error("preview provenance changed during browser evidence capture");
    }
    const matrix = {
      schemaVersion: 3,
      kind: "browser-matrix",
      candidateSha: sha,
      baseUrl: args.baseUrl,
      provenance,
      externalResourceContract,
      startedAtUtc: startedAt,
      finishedAtUtc: new Date().toISOString(),
      tool: { name: "scripts/evidence/capture-browser-matrix.mjs", node: captureRuntime.nodeVersion, npm: captureRuntime.npmVersion, browserName: browser.browserName, browserVersion: browser.browserVersion, chromiumRevision: browser.revision, protocolVersion: browser.protocolVersion, driver: "raw CDP over ws", controlledUiState: { pwaInstallHint: "session-dismissed before every document" } },
      widthsCssPx: widths,
      zoomEquivalents: args.zoom ? inventory.zoomEquivalents : [],
      routesInventory: routeInventoryDescriptor(routesPath, routesSource),
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
