// Reproducible, dev-only, synthetic-production-shape journey evidence.
//
// This tool starts three existing local harnesses, drives them through raw CDP,
// and writes supplemental evidence beside the primary browser matrix:
//
//   node scripts/evidence/capture-synthetic-journeys.mjs --out-dir <dir> --sha <40-char SHA>
//
// It is intentionally not production evidence and never makes a production
// readiness claim. The account and assisted-order preview processes receive a
// minimal environment with no provider credentials; CDP also rejects every
// browser request outside the three loopback harness origins. The one order
// submission is handled entirely by the Step 1 preview's in-memory repository,
// outbox and audit ports.
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createImmutableDistSnapshot,
  inventoryDirectory,
  inventorySha256,
} from "./lib/immutable-dist.mjs";
import { launchChromium } from "./lib/chrome.mjs";
import {
  CdpConnection,
  MAX_FULL_PAGE_HEIGHT_CSS_PX,
  PageSession,
  sleep,
  webSocketBoundarySource as sharedWebSocketBoundarySource,
} from "./lib/cdp.mjs";
import { evaluateRouteStateContract } from "./capture-browser-matrix.mjs";
import {
  FOCUS_BASELINE_RESET_SOURCE,
  FOCUS_BASELINE_SOURCE,
  FOCUS_PROBE_SOURCE,
  PAGE_AUDIT_SOURCE,
} from "./lib/page-audit.js";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  validatePreviewProvenance,
} from "./lib/provenance.mjs";
import {
  ASSERTION_IDS,
  analyseFocusWalk,
  artifactName,
  evaluateAudit,
  runVerdict,
} from "./lib/report.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const CLAIM_SCOPE = "UI_PRESENTATION_ONLY";
const EVIDENCE_CLASS = "synthetic-production-shape";
const CAPTURE_KIND = "dev-only-synthetic-production-shape";
const SYNTHETIC_REFERENCE_REDACTION = "SYNTHETIC-REFERENCE-REDACTED";
const FORGED_STATUS_REFERENCE = "XRR-20000101-0000000000";
const FORGED_STATUS_RESPONSE_BODY =
  '{"error":"not_found","message":"The request was not found."}';
const PARTNER_NOT_FOUND_RESPONSE_BODY = '{"ok":false,"code":"partner_not_found"}';
export const STATUS_CREDENTIAL_TRANSPORT = Object.freeze({
  NONE: "NONE",
  REQUEST_HEADER: "x-xenios-order-status-token request header",
});
const EXPECTED_CAPTURE_COUNT = 20;
const EXPECTED_ARTIFACT_COUNT = EXPECTED_CAPTURE_COUNT * 2;
const EXACTLY_ONCE_SYNTHETIC_ASSERTIONS = Object.freeze([
  "EXPECTED_SYNTHETIC_VIEW",
  "LOCAL_ORIGIN_NETWORK_BOUNDARY",
  "EXTERNAL_MUTATIONS",
]);
const PWA_DISMISSAL_SOURCE =
  "try { window.sessionStorage.setItem('xenios-pwa-hint-dismissed', '1'); } catch {}";
export const SYNTHETIC_PERSONA_STORAGE_TYPES =
  "cookies,indexeddb,local_storage";

export async function clearSyntheticPersonaState(page, origin) {
  await page.evaluate("(sessionStorage.clear(), true)");
  await page.send("Storage.clearDataForOrigin", {
    origin,
    storageTypes: SYNTHETIC_PERSONA_STORAGE_TYPES,
  });
  await page.send("Network.clearBrowserCookies");
}

const CASES = Object.freeze({
  catalog: Object.freeze({
    surface: "catalog",
    state: "default",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/member/catalog",
    fixture: "master-offerings-catalog-harness-v1",
    serverHarness: "catalog-component-vite-harness",
    expectedPath: "/src/research/master-offerings/__harness__/catalog-harness.html",
    expectedSelector: "h1",
    expectedText: "Full catalog",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["main", "h1"]),
      forbiddenSelectors: Object.freeze(["[data-testid='mo-skeleton']", "[role='alert']"]),
      requiredText: Object.freeze(["Full catalog", "Showing 3 of 6 offerings"]),
      forbiddenText: Object.freeze(["Unable to load the catalog"]),
    }),
  }),
  productDetail: Object.freeze({
    surface: "product-detail",
    state: "default",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/member/products/:slug",
    fixture: "master-offerings-detail-harness-v1",
    serverHarness: "catalog-component-vite-harness",
    expectedPath: "/src/research/master-offerings/__harness__/catalog-harness.html",
    expectedSelector: "h1",
    expectedText: "BPC-157 / TB-500",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["main", "h1", "[data-testid='mo-variant-selector']"]),
      forbiddenSelectors: Object.freeze(["[role='alert']"]),
      requiredText: Object.freeze(["BPC-157 / TB-500", "Choose a variant"]),
      forbiddenText: Object.freeze(["Product unavailable"]),
    }),
  }),
  accountOverviewRich: Object.freeze({
    surface: "account-overview",
    state: "rich",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/account",
    fixture: "account-portal-rich-persona",
    serverHarness: "account-portal-preview",
    expectedPath: "/research/account",
    expectedSelector: "#account-main-content",
    expectedText: "Membership",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["#account-main-content", ".account-surface"]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='account-loading']",
        "[data-testid='account-error']",
        "[data-testid='account-denied']",
      ]),
      requiredText: Object.freeze(["Your account, clearly organized.", "Membership"]),
      forbiddenText: Object.freeze(["Account data unavailable"]),
    }),
  }),
  ordersRich: Object.freeze({
    surface: "orders",
    state: "rich",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/account/orders",
    fixture: "account-portal-rich-persona",
    serverHarness: "account-portal-preview",
    expectedPath: "/research/account/orders",
    expectedSelector: "#account-main-content",
    expectedText: "Research commerce history",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["#account-main-content", ".account-list-card"]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='account-loading']",
        "[data-testid='account-error']",
        "[data-testid='account-denied']",
      ]),
      requiredText: Object.freeze(["Research commerce history", "Commerce history, without ambiguity."]),
      forbiddenText: Object.freeze(["No Research commerce records are visible here yet"]),
    }),
  }),
  ordersEmpty: Object.freeze({
    surface: "orders",
    state: "empty",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/account/orders",
    fixture: "account-portal-empty-persona",
    serverHarness: "account-portal-preview",
    expectedPath: "/research/account/orders",
    expectedSelector: "#account-main-content",
    expectedText: "No Research commerce records are visible here yet",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["#account-main-content", ".account-empty"]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='account-loading']",
        "[data-testid='account-error']",
        "[data-testid='account-denied']",
        ".account-list-card",
      ]),
      requiredText: Object.freeze([
        "Research commerce history",
        "No Research commerce records are visible here yet",
      ]),
      forbiddenText: Object.freeze(["No Research commerce records are attached to this account."]),
    }),
  }),
  membership: Object.freeze({
    surface: "membership",
    state: "rich",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/account/subscription",
    fixture: "account-portal-rich-persona",
    serverHarness: "account-portal-preview",
    expectedPath: "/research/account/subscription",
    expectedSelector: "#account-main-content",
    expectedText: "Membership",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze(["#account-main-content", ".account-surface"]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='account-loading']",
        "[data-testid='account-error']",
        "[data-testid='account-denied']",
      ]),
      requiredText: Object.freeze(["Membership, separated from Care.", "Next billing / renewal"]),
      forbiddenText: Object.freeze(["Membership data unavailable"]),
    }),
  }),
  orderReview: Object.freeze({
    surface: "order-flow",
    state: "review",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/early-access/order-request",
    fixture: "step1-assisted-order-in-memory",
    serverHarness: "step1-hotfix-preview",
    expectedPath: "/research/early-access/order-request",
    expectedSelector: "[data-testid='order-submit']",
    expectedText: "Submit order request",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze([
        "[data-testid='order-submit']",
        "[data-testid='order-step-review'][aria-current='step']",
      ]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='order-error']",
        "[data-testid='order-catalog-error']",
      ]),
      requiredText: Object.freeze(["Review and submit", "Submit order request"]),
      forbiddenText: Object.freeze(["Confirmation unavailable", "Submitting…"]),
    }),
  }),
  orderConfirmation: Object.freeze({
    surface: "order-flow",
    state: "confirmation",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/early-access/order-request/confirmation/:publicReference",
    fixture: "step1-assisted-order-in-memory",
    serverHarness: "step1-hotfix-preview",
    expectedPathPattern: "^/research/early-access/order-request/confirmation/XRR-[0-9]{8}-[A-F0-9]{10}$",
    expectedSelector: "[data-testid='order-confirmation-reference']",
    expectedText: "Reference:",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze([
        "[data-testid='order-confirmation-reference']",
        ".xenios-order-return-link",
      ]),
      forbiddenSelectors: Object.freeze([
        "[data-testid='order-confirmation-unavailable']",
        "[data-testid='order-error']",
      ]),
      requiredText: Object.freeze(["Request received", "Status", "Submitted"]),
      forbiddenText: Object.freeze(["Confirmation unavailable"]),
    }),
  }),
  orderStatusNeutralError: Object.freeze({
    surface: "order-status",
    state: "neutral-error",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/early-access/order-request/:publicReference",
    fixture: "step1-valid-shaped-forged-reference-without-status-token",
    serverHarness: "step1-hotfix-preview",
    expectedPath: `/research/early-access/order-request/${FORGED_STATUS_REFERENCE}`,
    expectedSelector: "[data-testid='order-status-heading']",
    expectedText: "Request status",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze([
        "[data-testid='order-status-heading']",
        ".xenios-order-error[role='alert']",
        ".xenios-order-return-link",
      ]),
      forbiddenSelectors: Object.freeze([
        ".xenios-order-panel",
        "[data-testid='order-confirmation-reference']",
      ]),
      requiredText: Object.freeze([
        "We verify this link before showing any request details.",
        "This secure status link is not valid or has expired.",
        "Return to Early Access",
      ]),
      forbiddenText: Object.freeze([
        FORGED_STATUS_REFERENCE,
        "Current status",
        "Track your request and complete any actions",
      ]),
    }),
  }),
  orderStatusServerVerified: Object.freeze({
    surface: "order-status",
    state: "server-verified",
    evidenceClass: EVIDENCE_CLASS,
    logicalRoute: "/research/early-access/order-request/:publicReference",
    fixture: "step1-same-session-status-token-server-verified",
    serverHarness: "step1-hotfix-preview",
    expectedPathPattern: "^/research/early-access/order-request/XRR-[0-9]{8}-[A-F0-9]{10}$",
    expectedSelector: "[data-testid='order-status-heading']",
    expectedText: "XRR-",
    semanticContract: Object.freeze({
      requiredSelectors: Object.freeze([
        "[data-testid='order-status-heading']",
        ".xenios-order-panel",
        ".xenios-order-return-link",
      ]),
      forbiddenSelectors: Object.freeze([
        ".xenios-order-error[role='alert']",
        "[data-testid='order-confirmation-unavailable']",
      ]),
      requiredText: Object.freeze([
        "Track your request and complete any actions Xenios requests.",
        "Current status",
        "submitted",
        "Return to Early Access",
      ]),
      forbiddenText: Object.freeze([
        "This secure status link is not valid or has expired.",
        "Confirmation unavailable",
      ]),
    }),
  }),
});

export const SYNTHETIC_CAPTURE_CASES = CASES;

export function parseArgs(argv) {
  const out = {
    outDir: null,
    sha: null,
    reviewer: "automated",
    chromePath: null,
    catalogPort: null,
    accountPort: null,
    step1Port: null,
    help: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const next = () => {
      const value = argv[++index];
      if (!value) throw new Error("missing value for " + argument);
      return value;
    };
    if (argument === "--out-dir") out.outDir = next();
    else if (argument === "--sha") out.sha = next();
    else if (argument === "--reviewer") out.reviewer = next();
    else if (argument === "--chrome-path") out.chromePath = next();
    else if (argument === "--catalog-port") out.catalogPort = positivePort(next(), argument);
    else if (argument === "--account-port") out.accountPort = positivePort(next(), argument);
    else if (argument === "--step1-port") out.step1Port = positivePort(next(), argument);
    else if (argument === "--help" || argument === "-h") out.help = true;
    else throw new Error("unknown argument " + argument);
  }
  return out;
}

function positivePort(value, argument) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("invalid port for " + argument + ": " + value);
  }
  return port;
}

export function sanitizeEvidenceText(value) {
  return String(value)
    .replace(/\bXRR-\d{8}-[A-F0-9]{10}\b/gu, SYNTHETIC_REFERENCE_REDACTION)
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.invalid\b/giu,
      "SYNTHETIC-EMAIL-REDACTED",
    )
    .replace(/\bpreview-member-token-[123]\b/gu, "SYNTHETIC-MEMBER-TOKEN-REDACTED")
    .replace(/\bpreview-refresh-member-fixture-[A-Za-z0-9-]+\b/gu, "SYNTHETIC-REFRESH-TOKEN-REDACTED");
}

export function sanitizeNetworkUrl(value) {
  try {
    const parsed = new URL(String(value));
    parsed.username = "";
    parsed.password = "";
    parsed.hash = "";
    if (parsed.search) parsed.search = "?REDACTED";
    return sanitizeEvidenceText(parsed.toString());
  } catch {
    return sanitizeEvidenceText(value);
  }
}

const SYSTEM_ENV_KEYS = Object.freeze([
  "SystemRoot",
  "SYSTEMROOT",
  "WINDIR",
  "ComSpec",
  "COMSPEC",
  "PATH",
  "Path",
  "PATHEXT",
  "TEMP",
  "TMP",
  "TMPDIR",
  "LOCALAPPDATA",
  "APPDATA",
  "HOME",
  "USERPROFILE",
  "LANG",
  "LC_ALL",
  "NUMBER_OF_PROCESSORS",
]);

/** Build a child environment that cannot inherit provider or production keys. */
export function safeChildEnvironment(source = process.env, overrides = {}) {
  const env = {};
  for (const key of SYSTEM_ENV_KEYS) {
    if (source[key] !== undefined) env[key] = source[key];
  }
  return { ...env, ...overrides };
}

export function summariseCaptures(captures) {
  const automatedPass = captures.filter((capture) => capture.verdict === "AUTOMATED_PASS").length;
  const automatedPassWithNotes = captures.filter(
    (capture) => capture.verdict === "AUTOMATED_PASS_WITH_NOTES",
  ).length;
  const automatedFail = captures.filter((capture) => capture.verdict === "AUTOMATED_FAIL").length;
  const declaredReferenceDenialPassWithNotes = captures.filter(
    (capture) =>
      capture.verdict === "AUTOMATED_PASS_WITH_NOTES" &&
      capture.statusTruthEvidence?.kind === "VALID_SHAPED_REFERENCE_DENIED",
  ).length;
  const declaredPartnerAbsencePassWithNotes = captures.filter(
    (capture) =>
      capture.verdict === "AUTOMATED_PASS_WITH_NOTES" &&
      capture.partnerAbsenceEvidence?.kind === "OWNED_PARTNER_RELATION_ABSENT",
  ).length;
  const declaredDenialPassWithNotes =
    declaredReferenceDenialPassWithNotes + declaredPartnerAbsencePassWithNotes;
  const strictClean = captures.length === EXPECTED_CAPTURE_COUNT
    && automatedPass === EXPECTED_CAPTURE_COUNT
    && automatedPassWithNotes === 0
    && automatedFail === 0;
  const completeWithExpectedDenialNotes = captures.length === EXPECTED_CAPTURE_COUNT
    && automatedFail === 0
    && automatedPassWithNotes === 4
    && declaredReferenceDenialPassWithNotes === 2
    && declaredPartnerAbsencePassWithNotes === 2
    && automatedPass === EXPECTED_CAPTURE_COUNT - 4;
  return {
    captures: captures.length,
    expectedCaptures: EXPECTED_CAPTURE_COUNT,
    expectedCaptureCountMatched: captures.length === EXPECTED_CAPTURE_COUNT,
    automatedPass,
    automatedPassWithNotes,
    automatedFail,
    declaredDenialPassWithNotes,
    declaredReferenceDenialPassWithNotes,
    declaredPartnerAbsencePassWithNotes,
    strictClean,
    completeWithExpectedDenialNotes,
    zeroUndeclaredFailures: completeWithExpectedDenialNotes || strictClean,
    result: strictClean
      ? "AUTOMATED_PASS"
      : completeWithExpectedDenialNotes
        ? "AUTOMATED_PASS_WITH_NOTES"
        : "AUTOMATED_FAIL",
    externalMutations: 0,
  };
}

export function buildArtifactInventory(captures, candidateSha) {
  const files = captures.flatMap((capture) => [
    {
      path: capture.artifactPath,
      kind: "screenshot",
      bytes: capture.artifactBytes,
      sha256: capture.artifactSha256,
      candidateSha,
    },
    {
      path: capture.textArtifactPath,
      kind: "rendered-page-text",
      bytes: capture.textArtifactBytes,
      sha256: capture.textArtifactSha256,
      candidateSha,
    },
  ]).sort((left, right) => left.path.localeCompare(right.path));
  const uniquePaths = new Set(files.map((file) => file.path));
  if (files.length !== EXPECTED_ARTIFACT_COUNT || uniquePaths.size !== files.length) {
    throw new Error(
      `synthetic artifact inventory requires exactly ${EXPECTED_ARTIFACT_COUNT} unique screenshot/text files`,
    );
  }
  return {
    scope: "synthetic capture artifacts; this JSON envelope is excluded to avoid a self-hash",
    candidateSha,
    fileCount: files.length,
    inventorySha256: createHash("sha256")
      .update(JSON.stringify(files))
      .digest("hex"),
    files,
  };
}

function assertPrerequisites() {
  const viteCli = join(repoRoot, "node_modules", "vite", "bin", "vite.js");
  const tsxCli = join(repoRoot, "node_modules", "tsx", "dist", "cli.mjs");
  const candidateBuild = join(repoRoot, "scripts", "evidence", "build-candidate-preview.mjs");
  for (const file of [viteCli, tsxCli, candidateBuild]) {
    if (!existsSync(file)) throw new Error("required capture prerequisite is missing: " + file);
  }
  return { viteCli, tsxCli, candidateBuild };
}

function assertOutputOutsideCheckout(outDir) {
  const pathFromCheckout = relative(repoRoot, outDir);
  if (
    pathFromCheckout === "" ||
    (!pathFromCheckout.startsWith("..") && !isAbsolute(pathFromCheckout))
  ) {
    throw new Error(
      "synthetic evidence output must be outside the exact candidate checkout",
    );
  }
}

function assertFreshOutput(outDir) {
  const syntheticDir = join(outDir, "synthetic");
  const output = join(outDir, "synthetic-journey-evidence.json");
  if (existsSync(output) || (existsSync(syntheticDir) && readdirSync(syntheticDir).length > 0)) {
    throw new Error(
      "synthetic evidence output already exists; use a fresh output directory to avoid mixed-run artifacts: " +
        outDir,
    );
  }
}

function buildAndValidateCandidatePreview(sha, prerequisites) {
  const checkout = assertCleanCandidateCheckout({ sha, cwd: repoRoot });
  execFileSync(
    process.execPath,
    [prerequisites.candidateBuild, "--sha", sha],
    {
      cwd: repoRoot,
      env: safeChildEnvironment(process.env, { NODE_ENV: "production" }),
      stdio: "inherit",
    },
  );
  const postBuildCheckout = assertCleanCandidateCheckout({ sha, cwd: repoRoot });
  if (postBuildCheckout.sourceTree !== checkout.sourceTree) {
    throw new Error("candidate source tree changed during preview build");
  }
  const distRoot = join(repoRoot, "dist");
  const distIndex = join(distRoot, "public", "index.html");
  const provenancePath = join(distRoot, "evidence-provenance.json");
  if (!existsSync(distIndex) || !existsSync(provenancePath)) {
    throw new Error("fresh candidate preview did not emit its index and provenance files");
  }
  const rawProvenance = JSON.parse(readFileSync(provenancePath, "utf8"));
  const provenance = validatePreviewProvenance(rawProvenance, postBuildCheckout);
  const actualInventory = inventoryDirectory(
    distRoot,
    new Set(["evidence-provenance.json"]),
  );
  const actualInventorySha256 = inventorySha256(actualInventory);
  if (
    actualInventory.length !== provenance.distFileCount ||
    actualInventorySha256 !== provenance.distInventorySha256 ||
    JSON.stringify(actualInventory) !== JSON.stringify(rawProvenance.fileInventory)
  ) {
    throw new Error("fresh candidate preview distribution does not match its provenance inventory");
  }
  const immutableDist = createImmutableDistSnapshot({
    repoRoot,
    sourceDistRoot: distRoot,
    expectedInventory: rawProvenance.fileInventory,
    expectedInventorySha256: provenance.distInventorySha256,
  });
  const snapshotRoot = immutableDist.distRoot;
  return {
    checkout: postBuildCheckout,
    provenance,
    distIndex: join(snapshotRoot, "public", "index.html"),
    clientDist: join(snapshotRoot, "public"),
    assertUnchanged: () => immutableDist.assertUnchanged(),
    dispose: () => immutableDist.dispose(),
  };
}

async function availablePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  await new Promise((resolveClose) => server.close(resolveClose));
  if (!port) throw new Error("could not reserve a local preview port");
  return port;
}

function startHarness(label, nodeArgs, env) {
  const output = [];
  const child = spawn(process.execPath, nodeArgs, {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  const append = (chunk) => {
    output.push(sanitizeEvidenceText(String(chunk)));
    if (output.length > 80) output.shift();
  };
  child.stdout.on("data", append);
  child.stderr.on("data", append);
  return {
    label,
    child,
    tail: () => output.join("").slice(-4000),
  };
}

async function waitForHarness(handle, url, timeoutMs = 30000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    if (handle.child.exitCode !== null) {
      throw new Error(
        handle.label + " exited before becoming ready (" + handle.child.exitCode + "): " + handle.tail(),
      );
    }
    try {
      const response = await fetch(url, { redirect: "manual" });
      if (response.status > 0 && response.status < 500) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }
  throw new Error(
    handle.label + " did not become ready at " + url + ": " +
      String(lastError && (lastError.message || lastError)) + " " + handle.tail(),
  );
}

async function stopHarness(handle) {
  if (!handle || handle.child.exitCode !== null) return;
  handle.child.kill();
  await Promise.race([
    new Promise((resolveExit) => handle.child.once("exit", resolveExit)),
    sleep(2000),
  ]);
  if (handle.child.exitCode === null) handle.child.kill("SIGKILL");
}

function selectorExpression(selector) {
  return JSON.stringify(String(selector));
}

async function waitForExpression(page, expression, label, timeoutMs = 20000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      if (await page.evaluate(expression)) return;
    } catch (error) {
      lastError = error;
    }
    await sleep(50);
  }
  throw new Error(
    "timed out waiting for " + label +
      (lastError ? ": " + String(lastError.message || lastError) : ""),
  );
}

async function waitForSelector(page, selector, timeoutMs = 20000) {
  await waitForExpression(
    page,
    "Boolean(document.querySelector(" + selectorExpression(selector) + "))",
    selector,
    timeoutMs,
  );
}

async function focusWalk(page, maxStops = 100) {
  await page.evaluate(
    "(document.activeElement && document.activeElement.blur && document.activeElement.blur(), window.scrollTo(0,0), true)",
  );
  await page.evaluate(FOCUS_BASELINE_RESET_SOURCE);
  const expectedIdentities = new Set();
  const refreshBaseline = async () => {
    const baseline = await page.evaluate(FOCUS_BASELINE_SOURCE);
    for (const identity of baseline?.tabbableIdentities ?? []) expectedIdentities.add(identity);
  };
  await refreshBaseline();
  const probes = [];
  for (let index = 0; index < maxStops; index++) {
    await refreshBaseline();
    await page.pressTab();
    const probe = await page.evaluate(FOCUS_PROBE_SOURCE);
    probes.push(probe);
    if (probe.body && index > 0) break;
  }
  return analyseFocusWalk(probes, { maxStops, expectedIdentities: [...expectedIdentities] });
}

async function applyControlledPwaState(page) {
  await page.evaluate(
    "(() => {" +
      " try { sessionStorage.setItem('xenios-pwa-hint-dismissed', '1'); } catch {}" +
      " const dismiss = document.querySelector('[aria-label=\"Dismiss\"]');" +
      " if (dismiss) dismiss.click();" +
      " return true;" +
      "})()",
  );
  await page.evaluate("new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))");
}

export function evaluateSyntheticRouteStateContract(descriptor, snapshot) {
  const stateRoute = {
    path: descriptor.expectedPath || snapshot.path,
    semanticContract: descriptor.semanticContract,
  };
  const [, stateAssertion] = evaluateRouteStateContract(stateRoute, snapshot);
  let locationPass = snapshot.path === descriptor.expectedPath;
  let expected = descriptor.expectedPath;
  if (descriptor.expectedPathPattern) {
    locationPass = new RegExp(descriptor.expectedPathPattern, "u").test(snapshot.path);
    expected = descriptor.expectedPathPattern;
  }
  return [
    {
      id: "ROUTE_LOCATION",
      result: locationPass ? "PASS" : "FAIL",
      detail: sanitizeEvidenceText("path=" + snapshot.path + " expected=" + expected),
    },
    stateAssertion,
  ];
}

export function forgedStatusFailureDeclaration(step1Origin) {
  return Object.freeze({
    url:
      step1Origin +
      "/api/research/early-access/assisted-orders/" +
      FORGED_STATUS_REFERENCE,
    method: "GET",
    status: 404,
    count: 1,
    responseBodySha256: createHash("sha256")
      .update(FORGED_STATUS_RESPONSE_BODY)
      .digest("hex"),
    consoleText:
      "Failed to load resource: the server responded with a status of 404 (Not Found)",
  });
}

/** Exact canonical denial for an authenticated customer with no owned partner relation. */
export function partnerNotFoundFailureDeclaration(accountOrigin) {
  return Object.freeze({
    url: accountOrigin + "/api/research/partner/me",
    method: "GET",
    status: 404,
    count: 1,
    resourceType: "Fetch",
    responseBodySha256: createHash("sha256")
      .update(PARTNER_NOT_FOUND_RESPONSE_BODY)
      .digest("hex"),
    consoleCount: 1,
    consoleText:
      "Failed to load resource: the server responded with a status of 404 (Not Found)",
  });
}

export function assertSyntheticAssertionSchema(assertions) {
  const expectedIds = [
    ...EXACTLY_ONCE_SYNTHETIC_ASSERTIONS,
    ...ASSERTION_IDS,
    "ROUTE_LOCATION",
    "ROUTE_STATE_CONTRACT",
  ];
  if (assertions.length !== expectedIds.length) {
    throw new Error(
      `synthetic capture assertion count ${assertions.length} does not match ${expectedIds.length}`,
    );
  }
  for (const id of expectedIds) {
    const matching = assertions.filter((assertion) => assertion.id === id);
    if (matching.length !== 1) {
      throw new Error(`synthetic capture requires assertion ${id} exactly once`);
    }
  }
  for (const id of [
    ...EXACTLY_ONCE_SYNTHETIC_ASSERTIONS,
    "ROUTE_LOCATION",
    "ROUTE_STATE_CONTRACT",
  ]) {
    const assertion = assertions.find((candidate) => candidate.id === id);
    if (assertion?.result !== "PASS") {
      // Name the failing route and carry the assertion's own detail: a bare
      // "requires X=PASS" hides which page and which contract clause failed.
      throw new Error(
        `synthetic capture requires ${id}=PASS (${assertion?.result ?? "MISSING"}): ${assertion?.detail ?? "no detail"}`,
      );
    }
  }
}

function resetPageTelemetry(page) {
  page.console.length = 0;
  page.network.length = 0;
}

async function setInputValue(page, selector, value) {
  const expression =
    "(() => {" +
    " const el = document.querySelector(" + selectorExpression(selector) + ");" +
    " if (!el) return false;" +
    " const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;" +
    " const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;" +
    " setter.call(el, " + JSON.stringify(String(value)) + ");" +
    " el.dispatchEvent(new Event('input', { bubbles: true }));" +
    " el.dispatchEvent(new Event('change', { bubbles: true }));" +
    " return el.value === " + JSON.stringify(String(value)) + ";" +
    "})()";
  if (!(await page.evaluate(expression))) throw new Error("could not fill " + selector);
}

async function clickSelector(page, selector) {
  const expression =
    "(() => {" +
    " const el = document.querySelector(" + selectorExpression(selector) + ");" +
    " if (!el || el.disabled) return false;" +
    " el.click();" +
    " return true;" +
    "})()";
  if (!(await page.evaluate(expression))) throw new Error("could not click " + selector);
}

async function checkSelector(page, selector) {
  const expression =
    "(() => {" +
    " const el = document.querySelector(" + selectorExpression(selector) + ");" +
    " if (!el || el.disabled) return false;" +
    " if (!el.checked) el.click();" +
    " return el.checked === true;" +
    "})()";
  if (!(await page.evaluate(expression))) throw new Error("could not check " + selector);
}

async function localJsonPost(page, path, body) {
  return page.evaluate(
    "(async () => {" +
      " const response = await fetch(" + JSON.stringify(path) + ", {" +
      " method: 'POST', credentials: 'include'," +
      " headers: { 'content-type': 'application/json' }," +
      " body: JSON.stringify(" + JSON.stringify(body) + ")" +
      " });" +
      " let payload = null;" +
      " try { payload = await response.json(); } catch {}" +
      " return { ok: response.ok, status: response.status, payload };" +
      "})()",
  );
}

async function navigateAndWaitAccount(page, origin, path) {
  await page.navigate(origin + path);
  await waitForSelector(page, "#account-main-content");
  await waitForExpression(
    page,
    "!document.querySelector('[data-testid=\"account-loading\"]')",
    "account resource to settle",
  );
}

async function signInAccountPersona(page, origin, email, returnTo) {
  const url = origin + "/research/sign-in?returnTo=" + encodeURIComponent(returnTo);
  await page.navigate(url);
  await waitForSelector(page, "#ms-email");
  await setInputValue(page, "#ms-email", email);
  await setInputValue(page, "#ms-password", "preview-password");
  await clickSelector(page, "[data-testid='button-member-signin']");
  await waitForExpression(
    page,
    "location.pathname === " + JSON.stringify(returnTo),
    "account sign-in redirect to " + returnTo,
  );
  await navigateAndWaitAccount(page, origin, returnTo);
}

async function captureCurrentPage({
  page,
  browser,
  descriptor,
  width,
  outDir,
  sha,
  reviewer,
  blockedRequests,
  statusTruthEvidence = null,
  partnerAbsenceEvidence = null,
}) {
  const height = width <= 768 ? 844 : 900;
  await page.setViewport({ width, height, deviceScaleFactor: 1, mobile: width <= 768 });
  await page.setMedia({ colorScheme: "light" });
  await page.settle({ quietMs: 300, maxSettleMs: 4000 });
  await applyControlledPwaState(page);
  await page.evaluate("(window.scrollTo(0, 0), new Promise(r => requestAnimationFrame(() => r(true))))");

  const timestampUtc = new Date().toISOString();
  const audit = await page.evaluate(PAGE_AUDIT_SOURCE);
  const walk = await focusWalk(page);
  await page.evaluate("(window.scrollTo(0, 0), true)");
  const expected = await page.evaluate(
    "(() => {" +
      " const el = document.querySelector(" + selectorExpression(descriptor.expectedSelector) + ");" +
      " const text = el ? String(el.textContent || '').replace(/\\s+/g, ' ').trim() : '';" +
      " return { present: Boolean(el), text, expectedTextPresent: Boolean(el) && text.includes(" +
        JSON.stringify(descriptor.expectedText) + ") };" +
      "})()",
  );
  const semanticSelectors = [
    ...(descriptor.semanticContract.requiredSelectors || []),
    ...(descriptor.semanticContract.forbiddenSelectors || []),
  ];
  const semanticSnapshot = await page.evaluate(
    "(() => {" +
      " const selectors = " + JSON.stringify(semanticSelectors) + ";" +
      " return {" +
      " path: location.pathname," +
      " bodyText: document.body ? document.body.innerText : ''," +
      " selectorPresence: Object.fromEntries(selectors.map(selector => [selector, Boolean(document.querySelector(selector))]))" +
      " };" +
      "})()",
  );
  const rawAssertions = [
    {
      id: "EXPECTED_SYNTHETIC_VIEW",
      result: expected.present && expected.expectedTextPresent ? "PASS" : "FAIL",
      detail:
        descriptor.expectedSelector + " present=" + expected.present +
        ", expected text present=" + expected.expectedTextPresent,
    },
    {
      id: "LOCAL_ORIGIN_NETWORK_BOUNDARY",
      result: blockedRequests.length === 0 ? "PASS" : "FAIL",
      detail:
        blockedRequests.length === 0
          ? "all browser requests stayed on declared loopback harness origins; every external HTTP(S) request is fail-closed"
          : blockedRequests.length + " non-loopback request(s) were blocked",
      count: blockedRequests.length,
    },
    {
      id: "EXTERNAL_MUTATIONS",
      result: "PASS",
      detail: "0; preview routes use synthetic in-memory ports and child processes inherited no provider credentials",
      count: 0,
    },
    ...evaluateAudit(audit, {
      focusWalk: walk,
      console: page.console.slice(),
      network: page.network.slice(),
      networkBoundaryViolations: blockedRequests.slice(),
      expectedHttpFailures: descriptor.expectedHttpFailures || [],
    }),
    ...evaluateSyntheticRouteStateContract(descriptor, semanticSnapshot),
  ];
  const assertions = rawAssertions.map((assertion) => ({
    ...assertion,
    detail: sanitizeEvidenceText(assertion.detail),
  }));
  assertSyntheticAssertionSchema(assertions);
  const verdict = runVerdict(assertions);
  const consoleAssertion = assertions.find((assertion) => assertion.id === "CONSOLE_CLEAN");
  const networkAssertion = assertions.find((assertion) => assertion.id === "NETWORK_CLEAN");
  const fileName = artifactName({
    surface: descriptor.surface + "-synthetic",
    state: descriptor.state,
    browser: browser.browserName,
    width,
    sequence: 1,
  });
  const captureDir = join(outDir, "synthetic", "captures");
  mkdirSync(captureDir, { recursive: true });
  const artifactPath = "synthetic/captures/" + fileName;
  const textArtifactPath = artifactPath.replace(/\.png$/u, ".text.txt");
  const screenshot = await page.screenshot({
    fullPage: true,
    maxHeight: MAX_FULL_PAGE_HEIGHT_CSS_PX,
  });
  const png = screenshot.bytes;
  writeFileSync(join(outDir, artifactPath), png);
  const bodyText = await page.evaluate("document.body ? document.body.innerText : ''");
  const sanitizedBodyText = sanitizeEvidenceText(bodyText) + "\n";
  const artifactSha256 = createHash("sha256").update(png).digest("hex");
  const textArtifactSha256 = createHash("sha256").update(sanitizedBodyText).digest("hex");
  writeFileSync(join(outDir, textArtifactPath), sanitizedBodyText);
  const actualUrl = sanitizeEvidenceText(await page.evaluate("location.href"));

  return {
    candidateSha: sha,
    captureKind: CAPTURE_KIND,
    surface: descriptor.surface,
    state: descriptor.state,
    evidenceClass: descriptor.evidenceClass,
    coverageScope: "representative",
    syntheticFixtureId: descriptor.fixture,
    serverHarness: descriptor.serverHarness,
    logicalRoute: descriptor.logicalRoute,
    actualUrl,
    artifactPath,
    artifactSha256,
    artifactBytes: png.length,
    screenshotCoverage: screenshot.coverage,
    localPath: artifactPath,
    textArtifactPath,
    textArtifactSha256,
    textArtifactBytes: Buffer.byteLength(sanitizedBodyText, "utf8"),
    browserName: browser.browserName,
    browserVersion: browser.browserVersion,
    widthCssPx: width,
    heightCssPx: height,
    deviceScaleFactor: 1,
    zoomPercent: 100,
    colorScheme: "light",
    mediaVariant: "default",
    timestampUtc,
    reviewer,
    consoleResult:
      consoleAssertion?.result === "PASS"
        ? "CLEAN"
        : consoleAssertion?.result === "PASS_WITH_NOTES"
          ? "DECLARED_EXPECTED_FAILURE"
          : "ERRORS",
    networkResult:
      networkAssertion?.result === "PASS"
        ? "CLEAN"
        : networkAssertion?.result === "PASS_WITH_NOTES"
          ? "DECLARED_EXPECTED_FAILURE"
          : "FAILURES",
    claimScope: CLAIM_SCOPE,
    externalMutations: 0,
    piiPhiReview: "MANUAL_PENDING",
    assertions,
    verdict,
    focusWalk: walk,
    ...(statusTruthEvidence ? { statusTruthEvidence } : {}),
    ...(partnerAbsenceEvidence ? { partnerAbsenceEvidence } : {}),
  };
}

async function captureAtBothWidths(context, descriptor) {
  const captured = [];
  for (const width of [1440, 390]) {
    const capture = await captureCurrentPage({ ...context, descriptor, width });
    captured.push(capture);
    const failures = capture.assertions
      .filter((assertion) => assertion.result === "FAIL")
      .map((assertion) => assertion.id)
      .join(",");
    console.log(
      capture.verdict.padEnd(26) + " " + String(width).padStart(4) + " " +
        descriptor.surface + "/" + descriptor.state + (failures ? " " + failures : ""),
    );
    if (failures) {
      for (const assertion of capture.assertions.filter((item) => item.result === "FAIL")) {
        console.log("  " + assertion.id + ": " + assertion.detail);
      }
    }
  }
  return captured;
}

export function webSocketBoundarySource(allowedWebSocketOrigins) {
  return sharedWebSocketBoundarySource(allowedWebSocketOrigins);
}

export function classifyBrowserBoundaryRequest(
  requestUrl,
  { allowedOrigins, allowedWebSocketOrigins },
) {
  try {
    const parsed = new URL(requestUrl);
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return allowedOrigins.has(parsed.origin) ? "continue" : "block";
    }
    if (parsed.protocol === "ws:" || parsed.protocol === "wss:") {
      return allowedWebSocketOrigins.has(parsed.origin) ? "continue" : "block";
    }
    if (["about:", "blob:", "data:"].includes(parsed.protocol)) {
      return "continue";
    }
  } catch {
    // Invalid or relative URLs fail closed.
  }
  return "block";
}

async function installLocalOriginBoundary(
  _conn,
  page,
  {
    allowedOrigins,
    allowedWebSocketOrigins,
    blockedRequests,
    observedWebSockets,
  },
) {
  const primaryOrigin = [...allowedOrigins][0];
  await page.enforceNetworkBoundary(primaryOrigin, {
    allowedOrigins,
    allowedWebSocketOrigins,
    onViolation: (record) => {
      let protocol = "INVALID";
      try {
        protocol = new URL(record.url).protocol;
      } catch {}
      blockedRequests.push({
        url: sanitizeNetworkUrl(record.url),
        method: record.method ?? "GET",
        protocol,
        prevention: record.reason,
        targetType: record.targetType ?? null,
      });
    },
    onWebSocket: (record) => observedWebSockets.push({
      url: sanitizeNetworkUrl(record.url),
      allowed: record.allowed,
    }),
  });
  return () => {};
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.outDir || !args.sha) {
    console.log(
      "usage: capture-synthetic-journeys.mjs --out-dir <dir> --sha <40-char SHA> " +
        "[--reviewer <name>] [--chrome-path <path>] [--catalog-port <port>] " +
        "[--account-port <port>] [--step1-port <port>]",
    );
    return args.help
      ? null
      : Promise.reject(new Error("--out-dir and exact --sha are required"));
  }
  const captureRuntime = assertPinnedExecutingRuntime();
  const outDir = resolve(args.outDir);
  const sha = args.sha;
  assertOutputOutsideCheckout(outDir);
  const prerequisites = assertPrerequisites();
  const candidatePreview = buildAndValidateCandidatePreview(sha, prerequisites);
  const provenance = candidatePreview.provenance;
  assertFreshOutput(outDir);
  mkdirSync(outDir, { recursive: true });

  const catalogPort = args.catalogPort || await availablePort();
  const accountPort = args.accountPort || await availablePort();
  const step1Port = args.step1Port || await availablePort();
  if (new Set([catalogPort, accountPort, step1Port]).size !== 3) {
    candidatePreview.dispose();
    throw new Error("catalog, account and Step 1 preview ports must be distinct");
  }
  const catalogOrigin = "http://127.0.0.1:" + catalogPort;
  const accountOrigin = "http://127.0.0.1:" + accountPort;
  const step1Origin = "http://127.0.0.1:" + step1Port;
  const allowedOrigins = new Set([catalogOrigin, accountOrigin, step1Origin]);
  const allowedWebSocketOrigins = new Set([
    catalogOrigin.replace(/^http:/u, "ws:").replace(/^https:/u, "wss:"),
  ]);

  const harnesses = [
    startHarness(
      "catalog component harness",
      [
        prerequisites.viteCli,
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        String(catalogPort),
        "--strictPort",
      ],
      safeChildEnvironment(process.env, { NODE_ENV: "development" }),
    ),
    startHarness(
      "account portal preview",
      [prerequisites.tsxCli, join(repoRoot, "scripts", "preview-account-portal.ts")],
      safeChildEnvironment(process.env, {
        NODE_ENV: "development",
        PORT: String(accountPort),
        XENIOS_STATIC_DIST_DIR: candidatePreview.clientDist,
      }),
    ),
    startHarness(
      "Step 1 assisted-order preview",
      [prerequisites.tsxCli, join(repoRoot, "scripts", "preview-step1-hotfix.ts")],
      safeChildEnvironment(process.env, {
        NODE_ENV: "development",
        PORT: String(step1Port),
        XENIOS_STEP1_PREVIEW_ENABLED: "true",
        XENIOS_STATIC_DIST_DIR: candidatePreview.clientDist,
      }),
    ),
  ];

  let browser = null;
  let conn = null;
  let page = null;
  let removeBoundary = null;
  const captures = [];
  const blockedRequests = [];
  const observedWebSockets = [];
  const startedAtUtc = new Date().toISOString();
  try {
    await Promise.all([
      waitForHarness(
        harnesses[0],
        catalogOrigin + "/src/research/master-offerings/__harness__/catalog-harness.html",
      ),
      waitForHarness(harnesses[1], accountOrigin + "/api/config"),
      waitForHarness(harnesses[2], step1Origin + "/research/early-access"),
    ]);

    browser = await launchChromium({
      chromePath: args.chromePath || undefined,
      extraArgs: [
        "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost",
      ],
    });
    conn = await new CdpConnection(browser.wsUrl).open();
    page = await PageSession.create(conn);
    await page.send("Page.addScriptToEvaluateOnNewDocument", { source: PWA_DISMISSAL_SOURCE });
    removeBoundary = await installLocalOriginBoundary(conn, page, {
      allowedOrigins,
      allowedWebSocketOrigins,
      blockedRequests,
      observedWebSockets,
    });

    const captureContext = {
      page,
      browser,
      outDir,
      sha,
      reviewer: args.reviewer,
      blockedRequests,
    };

    // Catalog and product detail: real components, stylesheet and deterministic
    // fixture data in the existing unrouted Vite harness.
    resetPageTelemetry(page);
    await page.navigate(
      catalogOrigin + "/src/research/master-offerings/__harness__/catalog-harness.html",
    );
    await waitForExpression(page, "document.querySelector('h1')?.textContent.includes('Full catalog')", "catalog");
    captures.push(...await captureAtBothWidths(captureContext, CASES.catalog));

    resetPageTelemetry(page);
    await page.navigate(
      catalogOrigin +
        "/src/research/master-offerings/__harness__/catalog-harness.html?surface=detail#detail",
    );
    await waitForExpression(
      page,
      "document.querySelector('h1')?.textContent.includes('BPC-157 / TB-500')",
      "product detail",
    );
    captures.push(...await captureAtBothWidths(captureContext, CASES.productDetail));

    // Rich account persona through the real sign-in form and production bundle.
    resetPageTelemetry(page);
    await signInAccountPersona(page, accountOrigin, "fixture1@preview.invalid", "/research/account");
    captures.push(...await captureAtBothWidths(captureContext, CASES.accountOverviewRich));

    resetPageTelemetry(page);
    await navigateAndWaitAccount(page, accountOrigin, "/research/account/orders");
    captures.push(...await captureAtBothWidths(captureContext, CASES.ordersRich));

    resetPageTelemetry(page);
    await navigateAndWaitAccount(page, accountOrigin, "/research/account/subscription");
    captures.push(...await captureAtBothWidths(captureContext, CASES.membership));

    // Clear only auth/persona state for the loopback preview origin. Preserve
    // its service worker and static cache while switching to the authoritative
    // empty persona through the same real sign-in journey. This persona has no
    // owned partner relation, so its navigation probe must receive the exact
    // canonical production 404; any status, body, count or URL drift still fails.
    const missingPartnerFailure = partnerNotFoundFailureDeclaration(accountOrigin);
    const ordersEmptyDescriptor = Object.freeze({
      ...CASES.ordersEmpty,
      expectedHttpFailures: Object.freeze([missingPartnerFailure]),
    });
    const ordersEmptyPartnerAbsence = Object.freeze({
      kind: "OWNED_PARTNER_RELATION_ABSENT",
      fixture: CASES.ordersEmpty.fixture,
      localServerUrl: missingPartnerFailure.url,
      localServerMethod: missingPartnerFailure.method,
      localServerStatus: missingPartnerFailure.status,
      localServerErrorCode: "partner_not_found",
      localServerBodySha256: missingPartnerFailure.responseBodySha256,
      resourceType: missingPartnerFailure.resourceType,
      networkCount: missingPartnerFailure.count,
      consoleCount: missingPartnerFailure.consoleCount,
      consoleText: missingPartnerFailure.consoleText,
      declaredExpectedFailure: true,
      externalMutations: 0,
    });
    await clearSyntheticPersonaState(page, accountOrigin);
    resetPageTelemetry(page);
    await signInAccountPersona(
      page,
      accountOrigin,
      "fixture2@preview.invalid",
      "/research/account/orders",
    );
    captures.push(...await captureAtBothWidths(
      { ...captureContext, partnerAbsenceEvidence: ordersEmptyPartnerAbsence },
      ordersEmptyDescriptor,
    ));

    // Step 1: establish only the local preview session and required agreement,
    // then exercise the production wizard. The preview submission repository,
    // outbox and audit sinks are all process-local arrays/maps.
    resetPageTelemetry(page);
    await page.navigate(step1Origin + "/research/early-access");
    const unlock = await localJsonPost(page, "/api/research/early-access/unlock", {
      password: "correct horse battery staple",
    });
    if (!unlock || !unlock.ok) {
      throw new Error("Step 1 preview unlock failed with status " + String(unlock && unlock.status));
    }
    const agreement = await localJsonPost(
      page,
      "/api/research/early-access/agreements/accept",
      { kind: "early_access_terms", version: "v1" },
    );
    if (!agreement || !agreement.ok) {
      throw new Error(
        "Step 1 preview agreement acceptance failed with status " +
          String(agreement && agreement.status),
      );
    }

    // A valid-shaped, bare reference is denied by the real local service. The
    // expected 404 is predeclared byte-for-byte and then captured as an exact
    // expected denial; the customer UI must stay neutral and hide the URL's
    // reference until a matching server response has been verified.
    const forgedFailure = forgedStatusFailureDeclaration(step1Origin);
    const forgedPreflight = await page.evaluate(
      "(async () => {" +
        " const reference = " + JSON.stringify(FORGED_STATUS_REFERENCE) + ";" +
        " const tokenKey = 'xenios.assisted-order.' + reference + '.token';" +
        " const response = await fetch('/api/research/early-access/assisted-orders/' + encodeURIComponent(reference), { credentials: 'include' });" +
        " return { status: response.status, body: await response.text(), tokenPresent: Boolean(sessionStorage.getItem(tokenKey)) };" +
        "})()",
    );
    const forgedPreflightSha256 = createHash("sha256")
      .update(forgedPreflight.body)
      .digest("hex");
    if (
      forgedPreflight.status !== forgedFailure.status ||
      forgedPreflight.body !== FORGED_STATUS_RESPONSE_BODY ||
      forgedPreflightSha256 !== forgedFailure.responseBodySha256 ||
      forgedPreflight.tokenPresent
    ) {
      throw new Error("valid-shaped forged status preflight did not match the exact denial contract");
    }
    await page.settle({ quietMs: 150, maxSettleMs: 2000 });
    resetPageTelemetry(page);
    const neutralStatusDescriptor = {
      ...CASES.orderStatusNeutralError,
      expectedHttpFailures: Object.freeze([forgedFailure]),
    };
    await page.navigate(
      step1Origin + "/research/early-access/order-request/" + FORGED_STATUS_REFERENCE,
    );
    await waitForSelector(page, ".xenios-order-error[role='alert']");
    await waitForExpression(
      page,
      "!document.body.innerText.includes(" + JSON.stringify(FORGED_STATUS_REFERENCE) + ") && !document.querySelector('.xenios-order-panel')",
      "neutral unverified order status without reference disclosure",
    );
    captures.push(...await captureAtBothWidths(
      {
        ...captureContext,
        statusTruthEvidence: Object.freeze({
          kind: "VALID_SHAPED_REFERENCE_DENIED",
          referenceShape: "XRR-YYYYMMDD-10_HEX",
          credentialSource: "ABSENT",
          credentialTransport: STATUS_CREDENTIAL_TRANSPORT.NONE,
          credentialPresent: false,
          localServerMethod: "GET",
          localServerStatus: forgedFailure.status,
          localServerErrorCode: "not_found",
          localServerBodySha256: forgedPreflightSha256,
          referenceRendered: false,
          requestDetailsRendered: false,
          declaredExpectedFailure: true,
          externalMutations: 0,
        }),
      },
      neutralStatusDescriptor,
    ));

    resetPageTelemetry(page);
    await page.navigate(step1Origin + "/research/early-access/order-request");
    await waitForSelector(page, "[data-testid='order-card-add-qa-research-direct-5mg']");
    await clickSelector(page, "[data-testid='order-card-add-qa-research-direct-5mg']");
    await clickSelector(page, "[data-testid='order-continue-contact']");
    await waitForSelector(page, "[data-testid='order-contact-name']");
    const contactFields = [
      ["[data-testid='order-contact-name']", "Synthetic Evidence Fixture"],
      ["[data-testid='order-contact-email']", "evidence@example.org"],
      ["[data-testid='order-contact-phone']", "+1 555 010 2000"],
      ["[data-testid='order-contact-line1']", "1 Synthetic Research Way"],
      ["[data-testid='order-contact-city']", "Austin"],
      ["[data-testid='order-contact-region']", "TX"],
      ["[data-testid='order-contact-postal']", "78701"],
      ["[data-testid='order-contact-country']", "US"],
    ];
    for (const [selector, value] of contactFields) {
      await setInputValue(page, selector, value);
    }
    await checkSelector(page, "[data-testid='order-age-confirm']");
    await clickSelector(page, "[data-testid='order-continue-review']");
    await waitForSelector(page, "[data-testid='order-submit']");
    const acknowledgmentCount = await page.evaluate(
      "document.querySelectorAll('[data-testid^=\"order-ack-\"]').length",
    );
    if (!acknowledgmentCount) throw new Error("Step 1 review exposed no required acknowledgments");
    const acknowledgmentsChecked = await page.evaluate(
      "(() => {" +
        " const controls = Array.from(document.querySelectorAll('[data-testid^=\"order-ack-\"]'));" +
        " for (const control of controls) if (!control.checked) control.click();" +
        " return controls.length > 0 && controls.every(control => control.checked);" +
        "})()",
    );
    if (!acknowledgmentsChecked) {
      throw new Error("Step 1 review acknowledgments could not be checked");
    }
    await waitForExpression(
      page,
      "!document.querySelector('[data-testid=\"order-submit\"]').disabled",
      "enabled assisted-order submit",
    );
    captures.push(...await captureAtBothWidths(captureContext, CASES.orderReview));

    resetPageTelemetry(page);
    await clickSelector(page, "[data-testid='order-submit']");
    await waitForExpression(
      page,
      "location.pathname.includes('/confirmation/') && Boolean(document.querySelector('[data-testid=\"order-confirmation-reference\"]'))",
      "assisted-order confirmation",
    );
    captures.push(...await captureAtBothWidths(captureContext, CASES.orderConfirmation));

    // Submission stored the bearer credential in this tab's sessionStorage.
    // Navigate to the separate status route and independently re-read the
    // local server response. Only booleans/status/counts enter evidence; the
    // reference and token never leave the browser or textual artifacts.
    const submittedReference = await page.evaluate(
      "location.pathname.split('/').filter(Boolean).at(-1) || ''",
    );
    if (!/^XRR-\d{8}-[A-F0-9]{10}$/u.test(submittedReference)) {
      throw new Error("submitted preview receipt did not expose a valid reference path");
    }
    const storedStatusTokenPresent = await page.evaluate(
      "Boolean(sessionStorage.getItem('xenios.assisted-order.' + " +
        JSON.stringify(submittedReference) + " + '.token'))",
    );
    if (!storedStatusTokenPresent) {
      throw new Error("same-session status token was not stored after accepted submission");
    }
    resetPageTelemetry(page);
    await page.navigate(
      step1Origin + "/research/early-access/order-request/" + submittedReference,
    );
    await waitForExpression(
      page,
      "document.querySelector('[data-testid=\"order-status-heading\"]')?.textContent === " +
        JSON.stringify(submittedReference) +
        " && Boolean(document.querySelector('.xenios-order-panel'))",
      "same-session server-verified assisted-order status",
    );
    const verifiedStatusProof = await page.evaluate(
      "(async () => {" +
        " const reference = location.pathname.split('/').filter(Boolean).at(-1) || '';" +
        " const token = sessionStorage.getItem('xenios.assisted-order.' + reference + '.token');" +
        " if (!token) return { tokenPresent: false };" +
        " const response = await fetch('/api/research/early-access/assisted-orders/' + encodeURIComponent(reference), { credentials: 'include', headers: { 'x-xenios-order-status-token': token } });" +
        " const payload = await response.json();" +
        " return {" +
        "   tokenPresent: true," +
        "   httpStatus: response.status," +
        "   responseReferenceMatchedPath: payload.publicReference === reference," +
        "   serverStatus: payload.status," +
        "   lineCount: Array.isArray(payload.lines) ? payload.lines.length : -1" +
        " };" +
        "})()",
    );
    if (
      !verifiedStatusProof.tokenPresent ||
      verifiedStatusProof.httpStatus !== 200 ||
      !verifiedStatusProof.responseReferenceMatchedPath ||
      verifiedStatusProof.serverStatus !== "submitted" ||
      verifiedStatusProof.lineCount < 1
    ) {
      throw new Error("same-session local status response did not verify the submitted request");
    }
    captures.push(...await captureAtBothWidths(
      {
        ...captureContext,
        statusTruthEvidence: Object.freeze({
          kind: "SAME_SESSION_SERVER_VERIFIED",
          referenceShape: "XRR-YYYYMMDD-10_HEX",
          credentialSource: "SESSION_STORAGE_SEPARATE_TOKEN_KEY",
          credentialTransport: STATUS_CREDENTIAL_TRANSPORT.REQUEST_HEADER,
          credentialPresent: true,
          localServerMethod: "GET",
          localServerStatus: verifiedStatusProof.httpStatus,
          responseReferenceMatchedPath: true,
          serverStatus: verifiedStatusProof.serverStatus,
          lineCount: verifiedStatusProof.lineCount,
          statusDetailsRendered: true,
          externalMutations: 0,
        }),
      },
      CASES.orderStatusServerVerified,
    ));

    // Flush late child-target events before sealing the envelope. A request
    // triggered by the final screenshot/body read must not arrive after an
    // earlier per-capture boundary assertion and silently escape the result.
    await page.settle({ quietMs: 300, maxSettleMs: 4000 });
    await page.waitForBoundaryTargets();
    if (blockedRequests.length > 0) {
      throw new Error(
        `synthetic evidence blocked ${blockedRequests.length} browser request(s); ` +
          "refusing to emit a passing envelope",
      );
    }

    // Bind the completed capture to the same immutable distribution bytes that
    // were verified before harness startup. A one-time startup inventory is
    // insufficient because the harness reads static assets on demand.
    candidatePreview.assertUnchanged();
    const evidence = {
      schemaVersion: 1,
      kind: "synthetic-production-shape-journeys",
      candidateSha: sha,
      generatedAtUtc: new Date().toISOString(),
      startedAtUtc,
      provenance,
      harnessOrigins: {
        catalog: catalogOrigin,
        account: accountOrigin,
        step1: step1Origin,
      },
      claimScope: CLAIM_SCOPE,
      evidenceClass: EVIDENCE_CLASS,
      externalMutations: 0,
      safetyBoundary: {
        environment: "DEV_ONLY",
        productionDeploymentContacted: false,
        browserNetwork: "THREE_DECLARED_LOOPBACK_HTTP_ORIGINS_AND_CATALOG_HMR_WEBSOCKET_ONLY",
        browserNetworkEnforcement:
          "CDP request interception plus pre-construction WebSocket guard plus Chromium external DNS fail-closed rule",
        blockedBrowserRequests: blockedRequests,
        externalHttpRequestPolicy: "BLOCK_ALL; NO_SUBSTITUTIONS_OR_FULFILLMENTS",
        observedWebSockets,
        allowedNonHttpDocumentSchemes: ["about:", "blob:", "data:"],
        allowedNonHttpNetworkSchemes: ["catalog-origin ws: for Vite HMR only"],
        childEnvironment: "SYSTEM_RUNTIME_KEYS_PLUS_EXPLICIT_LOCAL_PREVIEW_KEYS_ONLY",
        backendAdapters: "SYNTHETIC_IN_MEMORY",
      },
      tool: {
        name: "scripts/evidence/capture-synthetic-journeys.mjs",
        node: captureRuntime.nodeVersion,
        npm: captureRuntime.npmVersion,
        browserName: browser.browserName,
        browserVersion: browser.browserVersion,
        chromiumRevision: browser.revision,
        protocolVersion: browser.protocolVersion,
        driver: "raw CDP over ws",
        buildBinding:
          "fresh production build; exact source tree and on-disk dist inventory revalidated before harness startup",
      },
      harnesses: [
        {
          id: "catalog-component-vite-harness",
          source: "client/src/research/master-offerings/__harness__/harness.tsx",
          productionBundle: false,
          synthetic: true,
          sourceTree: provenance.sourceTree,
          candidateBinding: "EXACT_CLEAN_CHECKOUT_SOURCE_TREE",
        },
        {
          id: "account-portal-preview",
          source: "scripts/preview-account-portal.ts",
          productionBundle: true,
          synthetic: true,
          distInventorySha256: provenance.distInventorySha256,
          candidateBinding: "FRESH_PROVENANCED_PRODUCTION_BUNDLE",
        },
        {
          id: "step1-hotfix-preview",
          source: "scripts/preview-step1-hotfix.ts",
          productionBundle: true,
          synthetic: true,
          distInventorySha256: provenance.distInventorySha256,
          candidateBinding: "FRESH_PROVENANCED_PRODUCTION_BUNDLE",
        },
      ],
      captures,
      artifactInventory: buildArtifactInventory(captures, sha),
      summary: summariseCaptures(captures),
    };
    const output = join(outDir, "synthetic-journey-evidence.json");
    writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n");
    console.log(
      "\n" + evidence.summary.captures + " synthetic captures: " +
        evidence.summary.automatedPass + " pass, " +
        evidence.summary.automatedPassWithNotes + " pass-with-notes, " +
        evidence.summary.automatedFail + " fail -> " + output,
    );
    return evidence;
  } finally {
    if (removeBoundary) removeBoundary();
    if (page) await page.close().catch(() => {});
    if (conn) await conn.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
    await Promise.all(harnesses.map((harness) => stopHarness(harness)));
    candidatePreview.dispose();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
