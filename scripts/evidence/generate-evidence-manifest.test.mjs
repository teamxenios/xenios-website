import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertCanonicalMinimumPolicy,
  buildManifest,
  parseArgs,
} from "./generate-evidence-manifest.mjs";
import { EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS } from "./capture-browser-matrix.mjs";
import {
  EXACT_ROBOTS_TXT_DIRECTIVES,
  evaluateRobotsTxt,
} from "./lib/html-metadata.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const sourceTemplate = JSON.parse(
  readFileSync(join(here, "evidence-manifest.template.json"), "utf8"),
);
const SHA = "7".repeat(40);
const OTHER_SHA = "8".repeat(40);
const TREE = "9".repeat(40);
const HASH = "a".repeat(64);
const LOCK_HASH = "e".repeat(64);
const FORGED_STATUS_BODY_SHA256 = createHash("sha256")
  .update('{"error":"not_found","message":"The request was not found."}')
  .digest("hex");
const HARNESS_ORIGINS = Object.freeze({
  catalog: "http://127.0.0.1:5173",
  account: "http://127.0.0.1:5190",
  step1: "http://127.0.0.1:5191",
});
const ROBOTS_VALIDATION = evaluateRobotsTxt(
  `${EXACT_ROBOTS_TXT_DIRECTIVES.join("\n")}\n`,
);
const ROUTES_INVENTORY = {
  id: "scripts/evidence/routes.public.json",
  sha256: "d".repeat(64),
};
const RAW_ASSET_CONTRACT = Object.freeze({
  robots: Object.freeze({
    bodyPath: "raw-html/robots.txt",
    sourcePath: "client/public/robots.txt",
    bytes: 42,
    sha256: HASH,
    directivesValidation: ROBOTS_VALIDATION,
  }),
  sitemap: Object.freeze({
    bodyPath: "raw-html/sitemap.xml",
    sourcePath: "client/public/sitemap.xml",
    bytes: 42,
    sha256: HASH,
    locs: Object.freeze(["https://xeniostechnology.com/"]),
  }),
});

const BROWSER_ASSERTION_IDS = [
  "NO_HORIZONTAL_OVERFLOW",
  "NO_CLIPPED_TEXT",
  "TARGETS_44x44",
  "SINGLE_MAIN_LANDMARK",
  "NO_NESTED_MAIN",
  "NO_DUPLICATE_IDS",
  "SINGLE_H1",
  "FORM_CONTROLS_LABELLED",
  "IMAGES_HAVE_ALT",
  "ARIA_REFERENCES_RESOLVE",
  "DOCUMENT_LANG",
  "FOCUS_ORDER_REACHABLE",
  "FOCUS_VISIBLE_PRESENT",
  "EXPECTED_HTTP_FAILURES_OBSERVED",
  "CONSOLE_CLEAN",
  "NETWORK_CLEAN",
  "SAME_ORIGIN_NETWORK_BOUNDARY",
  "SELF_HOSTED_FONTS_LOADED",
  "ROUTE_LOCATION",
  "ROUTE_STATE_CONTRACT",
];

const SYNTHETIC_ONLY_ASSERTION_IDS = [
  "EXPECTED_SYNTHETIC_VIEW",
  "LOCAL_ORIGIN_NETWORK_BOUNDARY",
  "EXTERNAL_MUTATIONS",
];

const HTTP_ASSERTIONS = [
  ["STATUS_CODE", "PASS"],
  ["CONTENT_TYPE_HTML", "PASS"],
  ["X_ROBOTS_TAG", "PASS"],
  ["ROBOTS_META", "PASS"],
  ["RAW_HTML_TITLE", "PASS"],
  ["CANONICAL", "PASS"],
  ["OPEN_GRAPH", "PASS"],
  ["SITEMAP_PARITY", "PASS"],
  ["STRUCTURED_DATA_SCOPE", "PASS"],
  ["AUTHORITATIVE_404", "NOT_APPLICABLE"],
  ["PUBLIC_TO_PRIVATE_METADATA_RESTORATION", "NOT_APPLICABLE"],
];

const provenance = (overrides = {}) => ({
  kind: "xenios-evidence-build-provenance",
  candidateSha: SHA,
  sourceTree: TREE,
  distInventorySha256: "b".repeat(64),
  distFileCount: 42,
  builtAtUtc: "2026-08-29T17:00:00.000Z",
  nodeVersion: "v20.19.0",
  npmVersion: "10.8.2",
  packageLockSha256: LOCK_HASH,
  installMethod: "npm ci --no-audit --no-fund",
  ...overrides,
});

const externalResourceContract = () => ({
  result: "PASS",
  discoveredUrls: EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS
    .map((fixture) => new URL(fixture.url).toString())
    .sort(),
  substitutions: EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS.map((fixture) => ({
    url: new URL(fixture.url).toString(),
    contentType: fixture.contentType,
    reason: fixture.reason,
    responseBodySha256: createHash("sha256").update(fixture.body).digest("hex"),
  })),
});

const networkBoundaryFulfillments = () =>
  EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS.map((fixture) => ({
    url: new URL(fixture.url).toString(),
    method: "GET",
    resourceType: "Stylesheet",
    responseBodySha256: createHash("sha256").update(fixture.body).digest("hex"),
    responseBytes: Buffer.byteLength(fixture.body, "utf8"),
    reason: fixture.reason,
  }));

function makeTemplate() {
  const template = structuredClone(sourceTemplate);
  template.candidate = {
    ...template.candidate,
    sha: null,
    nodeVersion: "20.19.0",
    npmVersion: "10.8.2",
  };
  template.browserMatrix.requiredWidthsCssPx = [1440, 390];
  template.requiredSurfaces = ["orders"];
  template.requiredRepresentativeSurfaces = ["orders"];
  template.requiredRepresentativeJourneys = [
    { surface: "orders", state: "rich", widthsCssPx: [1440, 390] },
  ];
  template.requiredStates = ["empty", "rich"];
  return template;
}

const inventory = () => ({
  routes: [{
    path: "/research/orders",
    surface: "orders",
    state: "empty",
    indexable: false,
    public: false,
    coverageScope: "representative",
  }],
  zoomEquivalents: [{
    label: "200pct",
    widthCssPx: 720,
    deviceScaleFactor: 2,
    zoomPercent: 200,
    method: "1440 px screen at 200% browser zoom equivalent",
  }],
  metadataRestoration: [],
});

function assertionList(ids, overrides = {}) {
  return ids.map((id) => ({
    id,
    result: overrides[id] ?? "PASS",
    detail: `${id} fixture detail`,
  }));
}

function matrixRun({ widthCssPx, zoomPercent = 100, mediaVariant = "default", overrides = {} }) {
  const explicitNonFocus =
    zoomPercent !== 100 ||
    mediaVariant === "reduced-motion" ||
    (mediaVariant === "default" && ![1440, 390].includes(widthCssPx));
  const suffix = `${widthCssPx}-${zoomPercent}-${mediaVariant}`;
  return {
    candidateSha: SHA,
    artifactPath: `captures/orders-empty-${suffix}.png`,
    artifactSha256: HASH,
    textArtifactPath: `captures/orders-empty-${suffix}.text.txt`,
    textArtifactSha256: HASH,
    route: "/research/orders",
    surface: "orders",
    state: "empty",
    browserName: "chromium",
    browserVersion: "149.0.7827.55",
    widthCssPx,
    heightCssPx: widthCssPx <= 768 ? 844 : 900,
    deviceScaleFactor: zoomPercent === 200 ? 2 : 1,
    zoomPercent,
    colorScheme: mediaVariant === "forced-colors" ? "forced-colors" : "light",
    mediaVariant,
    screenshotCoverage: {
      fullPage: true,
      truncated: false,
      layoutStable: true,
      contentWidthCssPx: widthCssPx,
      contentHeightCssPx: widthCssPx <= 768 ? 844 : 900,
      postContentWidthCssPx: widthCssPx,
      postContentHeightCssPx: widthCssPx <= 768 ? 844 : 900,
      maxHeightCssPx: 12000,
      devicePixelRatio: zoomPercent === 200 ? 2 : 1,
      capturedWidthPx: widthCssPx * (zoomPercent === 200 ? 2 : 1),
      capturedHeightPx: (widthCssPx <= 768 ? 844 : 900) * (zoomPercent === 200 ? 2 : 1),
    },
    reducedMotionApplied: mediaVariant === "reduced-motion",
    forcedColorsActive: mediaVariant === "forced-colors",
    syntheticFixtureId: "none",
    coverageScope: "representative",
    timestampUtc: "2026-08-29T18:00:00.000Z",
    reviewer: "automated",
    consoleResult: "CLEAN",
    networkResult: "CLEAN",
    networkBoundaryViolations: [],
    networkBoundaryFulfillments: networkBoundaryFulfillments(),
    piiPhiReview: "MANUAL_PENDING",
    assertions: assertionList(BROWSER_ASSERTION_IDS, explicitNonFocus ? {
      FOCUS_ORDER_REACHABLE: "NOT_RUN",
      FOCUS_VISIBLE_PRESENT: "NOT_RUN",
    } : {}),
    focusWalk: explicitNonFocus ? null : {
      stops: [{
        identity: "focusable-1@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)",
        structuralPath: "html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)",
        selector: "a",
        indicator: true,
        baselineCaptured: true,
        focusVisible: true,
        focusVisualDelta: true,
        changedVisualProperties: ["self.outlineWidth"],
      }],
      cycled: true,
      earlyCycle: false,
      trapped: false,
      trappedAt: null,
      truncated: false,
      identityComplete: true,
      expectedIdentities: ["focusable-1@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)"],
      expectedIdentityCount: 1,
      visitedIdentityCount: 1,
      missingIdentities: [],
      missingIdentityCount: 0,
      completeSetCovered: true,
    },
    fontSnapshot: {
      applicable: true,
      bodyFontFamily: '"Inter Tight", sans-serif',
      interTight: { "500": true, "600": true, "700": true, "800": true, "900": true },
      jetBrainsMono: { "500": true, "600": true },
    },
    verdict: "AUTOMATED_PASS",
    runFile: `runs/orders-empty-${suffix}.json`,
    runFileSha256: HASH,
    ...overrides,
  };
}

function matrixRuns() {
  return [
    matrixRun({ widthCssPx: 1440 }),
    matrixRun({ widthCssPx: 390 }),
    matrixRun({ widthCssPx: 720, zoomPercent: 200 }),
    matrixRun({ widthCssPx: 390, mediaVariant: "reduced-motion" }),
    matrixRun({ widthCssPx: 390, mediaVariant: "forced-colors" }),
  ];
}

function makeMatrix(overrides = {}) {
  const runs = matrixRuns();
  return {
    schemaVersion: 3,
    kind: "browser-matrix",
    candidateSha: SHA,
    baseUrl: "http://127.0.0.1:5184",
    provenance: provenance(),
    externalResourceContract: externalResourceContract(),
    routesInventory: structuredClone(ROUTES_INVENTORY),
    startedAtUtc: "2026-08-29T17:55:00.000Z",
    finishedAtUtc: "2026-08-29T18:01:00.000Z",
    tool: { node: "v20.19.0", npm: "10.8.2", browserName: "chromium", browserVersion: "149.0.7827.55" },
    widthsCssPx: [1440, 390],
    zoomEquivalents: inventory().zoomEquivalents,
    metadataRestoration: [],
    runs,
    summary: { runs: runs.length, automatedPass: runs.length, automatedPassWithNotes: 0, automatedFail: 0, failingAssertionIds: [] },
    ...overrides,
  };
}

function syntheticCapture(widthCssPx, overrides = {}) {
  const suffix = `${widthCssPx}`;
  return {
    candidateSha: SHA,
    surface: "orders",
    state: "rich",
    evidenceClass: "synthetic-production-shape",
    coverageScope: "representative",
    syntheticFixtureId: "synthetic-orders-rich",
    serverHarness: "account-portal-preview",
    logicalRoute: "/research/orders",
    actualUrl: `http://127.0.0.1:5190/research/orders?width=${widthCssPx}`,
    artifactPath: `synthetic/captures/orders-rich-${suffix}.png`,
    artifactSha256: HASH,
    artifactBytes: 1024,
    textArtifactPath: `synthetic/captures/orders-rich-${suffix}.text.txt`,
    textArtifactSha256: HASH,
    textArtifactBytes: 128,
    browserName: "chromium",
    browserVersion: "149.0.7827.55",
    widthCssPx,
    heightCssPx: widthCssPx <= 768 ? 844 : 900,
    deviceScaleFactor: 1,
    zoomPercent: 100,
    colorScheme: "light",
    mediaVariant: "default",
    screenshotCoverage: {
      fullPage: true,
      truncated: false,
      layoutStable: true,
      contentWidthCssPx: widthCssPx,
      contentHeightCssPx: widthCssPx <= 768 ? 844 : 900,
      postContentWidthCssPx: widthCssPx,
      postContentHeightCssPx: widthCssPx <= 768 ? 844 : 900,
      maxHeightCssPx: 12000,
      devicePixelRatio: 1,
      capturedWidthPx: widthCssPx,
      capturedHeightPx: widthCssPx <= 768 ? 844 : 900,
    },
    timestampUtc: "2026-08-29T18:05:00.000Z",
    reviewer: "automated",
    consoleResult: "CLEAN",
    networkResult: "CLEAN",
    claimScope: "UI_PRESENTATION_ONLY",
    externalMutations: 0,
    piiPhiReview: "MANUAL_PENDING",
    assertions: assertionList([
      ...BROWSER_ASSERTION_IDS.filter((id) =>
        !["SAME_ORIGIN_NETWORK_BOUNDARY", "SELF_HOSTED_FONTS_LOADED"].includes(id),
      ),
      ...SYNTHETIC_ONLY_ASSERTION_IDS,
    ]),
    focusWalk: {
      stops: [{
        identity: "focusable-1@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)",
        structuralPath: "html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)",
        selector: "a",
        indicator: true,
        baselineCaptured: true,
        focusVisible: true,
        focusVisualDelta: true,
        changedVisualProperties: ["self.outlineWidth"],
      }],
      cycled: true,
      earlyCycle: false,
      trapped: false,
      trappedAt: null,
      truncated: false,
      identityComplete: true,
      expectedIdentities: ["focusable-1@html:nth-of-type(1)>body:nth-of-type(1)>a:nth-of-type(1)"],
      expectedIdentityCount: 1,
      visitedIdentityCount: 1,
      missingIdentities: [],
      missingIdentityCount: 0,
      completeSetCovered: true,
    },
    verdict: "AUTOMATED_PASS",
    ...overrides,
  };
}

function statusTruthEvidence(state, overrides = {}) {
  const common = {
    referenceShape: "XRR-YYYYMMDD-10_HEX",
    localServerMethod: "GET",
    externalMutations: 0,
  };
  if (state === "neutral-error") {
    return {
      ...common,
      kind: "VALID_SHAPED_REFERENCE_DENIED",
      credentialSource: "ABSENT",
      credentialTransport: "NONE",
      credentialPresent: false,
      localServerStatus: 404,
      localServerErrorCode: "not_found",
      localServerBodySha256: FORGED_STATUS_BODY_SHA256,
      referenceRendered: false,
      requestDetailsRendered: false,
      declaredExpectedFailure: true,
      ...overrides,
    };
  }
  return {
    ...common,
    kind: "SAME_SESSION_SERVER_VERIFIED",
    credentialSource: "SESSION_STORAGE_SEPARATE_TOKEN_KEY",
    credentialTransport: "x-xenios-order-status-token request header",
    credentialPresent: true,
    localServerStatus: 200,
    responseReferenceMatchedPath: true,
    serverStatus: "submitted",
    lineCount: 1,
    statusDetailsRendered: true,
    ...overrides,
  };
}

function statusCapture(widthCssPx, state, overrides = {}) {
  const capture = syntheticCapture(widthCssPx, {
    surface: "order-status",
    state,
    syntheticFixtureId: state === "neutral-error"
      ? "step1-valid-shaped-forged-reference-without-status-token"
      : "step1-same-session-status-token-server-verified",
    logicalRoute: "/research/early-access/order-request/:publicReference",
    actualUrl:
      `${HARNESS_ORIGINS.step1}/research/early-access/order-request/` +
      "SYNTHETIC-REFERENCE-REDACTED",
    serverHarness: "step1-hotfix-preview",
    artifactPath: `synthetic/captures/order-status-${state}-${widthCssPx}.png`,
    textArtifactPath: `synthetic/captures/order-status-${state}-${widthCssPx}.text.txt`,
    statusTruthEvidence: statusTruthEvidence(state),
  });
  if (state === "neutral-error") {
    for (const id of ["CONSOLE_CLEAN", "NETWORK_CLEAN"]) {
      capture.assertions.find((assertion) => assertion.id === id).result = "PASS_WITH_NOTES";
    }
    capture.consoleResult = "DECLARED_EXPECTED_FAILURE";
    capture.networkResult = "DECLARED_EXPECTED_FAILURE";
    capture.verdict = "AUTOMATED_PASS_WITH_NOTES";
  }
  return { ...capture, ...overrides };
}

function supplementalArtifactInventory(captures) {
  const files = captures.flatMap((capture) => [
    {
      path: capture.artifactPath,
      kind: "screenshot",
      bytes: capture.artifactBytes,
      sha256: capture.artifactSha256,
      candidateSha: SHA,
    },
    {
      path: capture.textArtifactPath,
      kind: "rendered-page-text",
      bytes: capture.textArtifactBytes,
      sha256: capture.textArtifactSha256,
      candidateSha: SHA,
    },
  ]).sort((left, right) => left.path.localeCompare(right.path));
  return {
    scope: "synthetic capture artifacts; this JSON envelope is excluded to avoid a self-hash",
    candidateSha: SHA,
    fileCount: files.length,
    inventorySha256: createHash("sha256").update(JSON.stringify(files)).digest("hex"),
    files,
  };
}

function makeSupplemental(overrides = {}) {
  const captures = [syntheticCapture(1440), syntheticCapture(390)];
  return {
    schemaVersion: 1,
    kind: "synthetic-production-shape-journeys",
    candidateSha: SHA,
    provenance: provenance(),
    startedAtUtc: "2026-08-29T18:02:00.000Z",
    generatedAtUtc: "2026-08-29T18:06:00.000Z",
    harnessOrigins: structuredClone(HARNESS_ORIGINS),
    claimScope: "UI_PRESENTATION_ONLY",
    externalMutations: 0,
    safetyBoundary: {
      environment: "DEV_ONLY",
      productionDeploymentContacted: false,
      blockedBrowserRequests: [],
      externalHttpRequestPolicy: "BLOCK_ALL; NO_SUBSTITUTIONS_OR_FULFILLMENTS",
      observedWebSockets: [],
      backendAdapters: "SYNTHETIC_IN_MEMORY",
    },
    tool: { node: "v20.19.0", npm: "10.8.2", browserName: "chromium", browserVersion: "149.0.7827.55" },
    captures,
    artifactInventory: supplementalArtifactInventory(captures),
    summary: { captures: 2, automatedPass: 2, automatedFail: 0 },
    ...overrides,
  };
}

function httpRecord(overrides = {}) {
  return {
    candidateSha: SHA,
    route: "/research/orders",
    surface: "orders",
    indexable: false,
    status: 200,
    finalUrl: "http://127.0.0.1:5184/research/orders",
    redirects: [],
    timestampUtc: "2026-08-29T18:10:00.000Z",
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex,nofollow,noarchive",
    },
    metadata: {
      title: "Orders",
      robotsMeta: "noindex,nofollow,noarchive",
      robotsMetaEntries: ["noindex,nofollow,noarchive"],
      robotsMetaCount: 1,
      canonical: null,
      canonicalLinks: [],
      canonicalLinkCount: 0,
      openGraph: { title: null, description: null, image: null, url: null, type: null },
      openGraphEntries: [],
      jsonLd: [],
    },
    rawHtmlPath: "raw-html/research-orders.html",
    rawHtmlSha256: HASH,
    assertions: HTTP_ASSERTIONS.map(([id, result]) => ({ id, result, detail: id })),
    result: "AUTOMATED_PASS",
    ...overrides,
  };
}

function makeHttp(overrides = {}) {
  const records = [httpRecord()];
  return {
    schemaVersion: 2,
    kind: "http-evidence",
    candidateSha: SHA,
    baseUrl: "http://127.0.0.1:5184",
    provenance: provenance(),
    capturedAtUtc: "2026-08-29T18:11:00.000Z",
    tool: { name: "capture-http", node: "v20.19.0", npm: "10.8.2" },
    sitemap: {
      status: 200,
      error: null,
      count: 1,
      locs: ["https://xeniostechnology.com/"],
      bodyPath: "raw-html/sitemap.xml",
      bodySha256: HASH,
      bodyBytes: 42,
      sourcePath: "client/public/sitemap.xml",
      sourceSha256: HASH,
      exactSourceMatch: true,
      directivesValidation: ROBOTS_VALIDATION,
      locsValidation: { result: "PASS", count: 1, invalidLocs: [], duplicates: [] },
    },
    robots: {
      status: 200,
      error: null,
      bodyPath: "raw-html/robots.txt",
      bodySha256: HASH,
      bodyBytes: 42,
      sourcePath: "client/public/robots.txt",
      sourceSha256: HASH,
      exactSourceMatch: true,
      directivesValidation: ROBOTS_VALIDATION,
    },
    records,
    summary: { records: 1, automatedPass: 1, automatedFail: 0, failingAssertionIds: [] },
    ...overrides,
  };
}

function fullRunArtifact(record) {
  const {
    runFile: _runFile,
    runFileSha256: _runFileSha256,
    reducedMotionApplied,
    forcedColorsActive,
    ...full
  } = record;
  return {
    ...full,
    audit: {
      reducedMotionApplied,
      forcedColorsActive,
    },
  };
}

function rawHtmlArtifact(record) {
  const metadata = record.metadata ?? {};
  const head = [
    `<title>${metadata.title ?? ""}</title>`,
    metadata.description == null
      ? ""
      : `<meta name="description" content="${metadata.description}">`,
    metadata.robotsMeta == null
      ? ""
      : `<meta name="robots" content="${metadata.robotsMeta}">`,
    ...(metadata.canonicalLinks ?? []).map((href) =>
      `<link rel="canonical" href="${href}">`,
    ),
    ...(metadata.openGraphEntries ?? []).map((entry) =>
      `<meta property="${entry.property}" content="${entry.content ?? ""}">`,
    ),
    ...(metadata.jsonLd ?? []).map((entry) =>
      `<script type="application/ld+json">${JSON.stringify({
        ...(entry.hasContext ? { "@context": "https://schema.org" } : {}),
        "@type": entry.type,
      })}</script>`,
    ),
  ].join("");
  return `<!doctype html><html><head>${head}</head><body><div id="root"></div></body></html>`;
}

function fixtureArtifactReader(matrix, http) {
  return (path) => {
    const run = matrix?.runs?.find((candidate) => candidate.runFile === path);
    if (run) return JSON.stringify(fullRunArtifact(run));
    const record = http?.records?.find((candidate) => candidate.rawHtmlPath === path);
    if (record) return rawHtmlArtifact(record);
    return null;
  };
}

function build(overrides = {}) {
  const input = {
    template: makeTemplate(),
    matrix: makeMatrix(),
    supplemental: makeSupplemental(),
    http: makeHttp(),
    pii: null,
    inventory: inventory(),
    routesInventory: structuredClone(ROUTES_INVENTORY),
    rawAssetContract: structuredClone(RAW_ASSET_CONTRACT),
    actualEvidenceFiles: [],
    sha: SHA,
    sourceTree: TREE,
    packageLockSha256: LOCK_HASH,
    reviewer: "lead",
    artifactRoot: "docs/review/xenios-research-full-site-20260829/browser",
    artifactExists: () => true,
    generatedAtUtc: "2026-08-29T19:00:00.000Z",
    ...overrides,
  };
  if (!("artifactRead" in overrides)) {
    input.artifactRead = fixtureArtifactReader(input.matrix, input.http);
  }
  return buildManifest(input);
}

describe("buildManifest strict evidence inspection", () => {
  it("accepts only a complete, artifact-bound, exact-candidate evidence bundle", () => {
    const manifest = build();
    expect(manifest.schemaVersion).toBe(2);
    expect(manifest.browserMatrix.result).toBe("AUTOMATED_PASS");
    expect(manifest.syntheticJourneyEvidence.result).toBe("AUTOMATED_PASS");
    expect(manifest.httpHeadEvidence.result).toBe("AUTOMATED_PASS");
    expect(manifest.gates.evidenceProvenance).toMatchObject({
      result: "AUTOMATED_PASS",
      provenanceMatches: true,
      baseUrlOriginMatches: true,
      candidateSha: SHA,
      sourceTree: TREE,
    });
    expect(manifest.gates.evidenceCoverage.result).toBe("AUTOMATED_PASS");
    expect(manifest.gates.seo.result).toBe("AUTOMATED_PASS");
    expect(manifest.candidate).toMatchObject({
      sourceTree: TREE,
      distInventorySha256: "b".repeat(64),
      distFileCount: 42,
      nodeVersion: "20.19.0",
      npmVersion: "10.8.2",
      runtimeEvidence: "MATCHED_MATRIX_HTTP_BUILD_PROVENANCE",
    });
    if (process.versions.node !== "20.19.0") {
      expect(manifest.candidate.nodeVersion).not.toBe(process.versions.node);
    }
    for (const field of sourceTemplate.captureSchema.requiredFields) {
      expect(manifest.captures[0]).toHaveProperty(field);
    }
    for (const field of sourceTemplate.browserRunSchema.requiredFields) {
      expect(manifest.browserMatrix.runs[0]).toHaveProperty(field);
    }
    expect(manifest.captures[0].artifactPath).toMatch(/^docs\/review\/xenios-research-full-site-20260829\/browser\//u);
    expect(manifest.captures[0].reviewer).toBe("lead");
    expect(manifest.finalVerdict).toBe("PENDING");
    expect(manifest.readyForSamuelDeployReview).toBe(false);
  });

  it("binds browser and raw title/description evidence to one exact route contract", () => {
    const exactInventory = inventory();
    exactInventory.routes[0].metadataContract = {
      title: "Orders, xenios research",
      description: "Your private xenios research order history.",
    };
    const exactMatrix = makeMatrix();
    for (const run of exactMatrix.runs) {
      run.documentMetadata = {
        title: exactInventory.routes[0].metadataContract.title,
        description: exactInventory.routes[0].metadataContract.description,
        canonical: null,
        openGraph: {
          title: null,
          description: null,
          image: null,
          url: null,
          type: null,
        },
      };
    }
    const exactHttp = makeHttp();
    exactHttp.records[0].metadata.title = exactInventory.routes[0].metadataContract.title;
    exactHttp.records[0].metadata.description = exactInventory.routes[0].metadataContract.description;
    expect(build({ inventory: exactInventory, matrix: exactMatrix, http: exactHttp }))
      .toMatchObject({
        browserMatrix: { result: "AUTOMATED_PASS" },
        httpHeadEvidence: { result: "AUTOMATED_PASS" },
      });

    const browserDrift = structuredClone(exactMatrix);
    browserDrift.runs[0].documentMetadata.title = "Forged browser title";
    expect(build({
      inventory: exactInventory,
      matrix: browserDrift,
      http: exactHttp,
    }).browserMatrix.result).toBe("INVALID_EVIDENCE");

    const indexableInventory = structuredClone(exactInventory);
    indexableInventory.routes[0].indexable = true;
    const indexableMatrix = structuredClone(exactMatrix);
    const productionUrl = "https://xeniostechnology.com/research/orders";
    for (const run of indexableMatrix.runs) {
      run.documentMetadata.canonical = productionUrl;
      run.documentMetadata.openGraph = {
        title: exactInventory.routes[0].metadataContract.title,
        description: exactInventory.routes[0].metadataContract.description,
        image: "https://xeniostechnology.com/og/xenios-og-image-v2.png",
        url: productionUrl,
        type: "website",
      };
    }
    expect(build({
      inventory: indexableInventory,
      matrix: indexableMatrix,
      supplemental: null,
      http: null,
    }).browserMatrix.result).toBe("AUTOMATED_PASS");
    const socialDrift = structuredClone(indexableMatrix);
    socialDrift.runs[0].documentMetadata.openGraph.title = "Hostile social title";
    expect(build({
      inventory: indexableInventory,
      matrix: socialDrift,
      supplemental: null,
      http: null,
    }).browserMatrix.result).toBe("INVALID_EVIDENCE");

    const rawDrift = structuredClone(exactHttp);
    rawDrift.records[0].metadata.description = "Forged raw description";
    expect(build({
      inventory: exactInventory,
      matrix: exactMatrix,
      http: rawDrift,
    }).httpHeadEvidence.result).toBe("INVALID_EVIDENCE");
  });

  it("rejects late synthetic violations and envelope/artifact disagreements", () => {
    const blocked = makeSupplemental();
    blocked.safetyBoundary.blockedBrowserRequests.push({
      url: "https://example.invalid/?REDACTED",
      method: "GET",
      protocol: "https:",
      prevention: "blocked before dispatch",
      targetType: "worker",
    });
    expect(build({ supplemental: blocked }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const inventoryTamper = makeSupplemental();
    inventoryTamper.artifactInventory.inventorySha256 = "f".repeat(64);
    expect(build({ supplemental: inventoryTamper }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const originalMatrix = makeMatrix();
    const matrixTamper = structuredClone(originalMatrix);
    matrixTamper.runs[0].reviewer = "forged-envelope";
    expect(build({
      matrix: matrixTamper,
      artifactRead: fixtureArtifactReader(originalMatrix, makeHttp()),
    }).browserMatrix.result).toBe("INVALID_EVIDENCE");

    const originalHttp = makeHttp();
    const httpTamper = structuredClone(originalHttp);
    httpTamper.records[0].metadata.title = "Forged envelope title";
    expect(build({
      http: httpTamper,
      artifactRead: fixtureArtifactReader(makeMatrix(), originalHttp),
    }).httpHeadEvidence.result).toBe("INVALID_EVIDENCE");
  });

  it("rejects missing, malformed, or unverifiable artifact hashes", () => {
    for (const badRun of [
      matrixRun({ widthCssPx: 1440, overrides: { artifactSha256: null } }),
      matrixRun({ widthCssPx: 1440, overrides: { artifactSha256: "short" } }),
      matrixRun({ widthCssPx: 1440, overrides: { textArtifactPath: null } }),
      matrixRun({ widthCssPx: 1440, overrides: { runFile: null } }),
    ]) {
      const matrix = makeMatrix();
      matrix.runs[0] = badRun;
      expect(build({ matrix }).browserMatrix.completeness.result).toBe("INVALID_EVIDENCE");
    }

    const matrix = makeMatrix();
    const denied = matrix.runs[0].artifactPath;
    const manifest = build({ matrix, artifactExists: (path) => path !== denied });
    expect(manifest.browserMatrix.completeness.result).toBe("INVALID_EVIDENCE");

    const reusedArtifact = makeMatrix();
    reusedArtifact.runs[1].artifactPath = reusedArtifact.runs[0].artifactPath;
    expect(build({ matrix: reusedArtifact }).browserMatrix.completeness).toMatchObject({
      result: "INVALID_EVIDENCE",
      duplicateArtifactPaths: [reusedArtifact.runs[0].artifactPath],
    });
  });

  it("requires exact semantic, network-boundary, expected-failure, and focus assertions", () => {
    const cases = [
      ["ROUTE_STATE_CONTRACT", "NOT_APPLICABLE"],
      ["ROUTE_LOCATION", "FAIL"],
      ["EXPECTED_HTTP_FAILURES_OBSERVED", "NOT_RUN"],
      ["SAME_ORIGIN_NETWORK_BOUNDARY", "NOT_RUN"],
      ["FOCUS_ORDER_REACHABLE", "NOT_RUN"],
    ];
    for (const [id, result] of cases) {
      const matrix = makeMatrix();
      matrix.runs[0].assertions.find((assertion) => assertion.id === id).result = result;
      expect(build({ matrix }).browserMatrix.completeness.result).toBe("INVALID_EVIDENCE");
    }

    const permitted = makeMatrix();
    const zoomRun = permitted.runs.find((run) => run.zoomPercent === 200);
    expect(zoomRun.assertions.find((a) => a.id === "FOCUS_ORDER_REACHABLE").result).toBe("NOT_RUN");
    expect(build({ matrix: permitted }).browserMatrix.completeness.result).toBe("AUTOMATED_PASS");

    const truncatedFocus = makeMatrix();
    truncatedFocus.runs[0].focusWalk.truncated = true;
    expect(build({ matrix: truncatedFocus }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const nonCyclingFocus = makeMatrix();
    nonCyclingFocus.runs[0].focusWalk.cycled = false;
    expect(build({ matrix: nonCyclingFocus }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    for (const mutate of [
      (walk) => { walk.identityComplete = false; },
      (walk) => { walk.completeSetCovered = false; },
      (walk) => { walk.expectedIdentities.push("focusable-2@html:nth-of-type(1)>body:nth-of-type(1)>button:nth-of-type(1)"); },
      (walk) => { walk.stops[0].identity = "a.nav-link|same text"; },
      (walk) => { walk.stops.push({ ...walk.stops[0] }); },
      (walk) => { walk.stops[0].baselineCaptured = false; },
      (walk) => { walk.stops[0].focusVisible = false; },
      (walk) => { walk.stops[0].focusVisualDelta = false; },
      (walk) => { walk.stops[0].indicator = false; },
      (walk) => { walk.stops[0].changedVisualProperties = []; },
    ]) {
      const forgedFocus = makeMatrix();
      mutate(forgedFocus.runs[0].focusWalk);
      expect(build({ matrix: forgedFocus }).browserMatrix.completeness)
        .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });
    }

    const truncatedScreenshot = makeMatrix();
    truncatedScreenshot.runs[0].screenshotCoverage.truncated = true;
    expect(build({ matrix: truncatedScreenshot }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const forgedScreenshotDimensions = makeMatrix();
    forgedScreenshotDimensions.runs[0].screenshotCoverage.capturedHeightPx -= 1;
    expect(build({ matrix: forgedScreenshotDimensions }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const unpinnedCapture = makeMatrix();
    unpinnedCapture.tool.node = "v24.14.1";
    expect(build({ matrix: unpinnedCapture }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", envelopeInvalid: true });

    const missingFontWeight = makeMatrix();
    missingFontWeight.runs[0].fontSnapshot.interTight["900"] = false;
    expect(build({ matrix: missingFontWeight }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const undeclaredExternalResource = makeMatrix();
    undeclaredExternalResource.externalResourceContract.discoveredUrls.push("https://example.com/extra.css");
    expect(build({ matrix: undeclaredExternalResource }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", envelopeInvalid: true });

    const unexpectedFulfillment = makeMatrix();
    unexpectedFulfillment.runs[0].networkBoundaryFulfillments = [{
      url: "https://example.com/forbidden.css",
      method: "GET",
      resourceType: "Stylesheet",
      responseBodySha256: HASH,
      responseBytes: 1,
      reason: "undeclared",
    }];
    expect(build({ matrix: unexpectedFulfillment }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const boundaryViolation = makeMatrix();
    boundaryViolation.runs[0].networkBoundaryViolations = [{
      url: "https://example.com/forbidden.css",
    }];
    expect(build({ matrix: boundaryViolation }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", invalidRuns: [0] });

    const hinoTemplate = makeTemplate();
    hinoTemplate.requiredSurfaces = ["hino"];
    hinoTemplate.requiredRepresentativeSurfaces = [];
    hinoTemplate.requiredRepresentativeJourneys = [];
    hinoTemplate.requiredStates = ["default"];
    const hinoInventory = inventory();
    hinoInventory.routes = [{
      path: "/hino",
      surface: "hino",
      state: "default",
      indexable: false,
      externalMicrosite: true,
    }];
    const hinoMatrix = makeMatrix();
    hinoMatrix.runs = hinoMatrix.runs.map((run) => ({
      ...run,
      route: "/hino",
      surface: "hino",
      state: "default",
      networkBoundaryFulfillments: [],
      fontSnapshot: {
        applicable: false,
        reason: "external microsite owns its static typography",
      },
      assertions: run.assertions.map((assertion) => assertion.id === "SELF_HOSTED_FONTS_LOADED"
        ? { ...assertion, result: "NOT_APPLICABLE" }
        : assertion),
    }));
    expect(build({
      template: hinoTemplate,
      inventory: hinoInventory,
      matrix: hinoMatrix,
      supplemental: null,
      http: null,
    }).browserMatrix.completeness.result).toBe("AUTOMATED_PASS");

    const forgedExternalInventory = inventory();
    forgedExternalInventory.routes[0].externalMicrosite = true;
    const forgedExternalMatrix = makeMatrix();
    forgedExternalMatrix.runs = forgedExternalMatrix.runs.map((run) => ({
      ...run,
      networkBoundaryFulfillments: [],
      fontSnapshot: {
        applicable: false,
        reason: "external microsite owns its static typography",
      },
      assertions: run.assertions.map((assertion) =>
        assertion.id === "SELF_HOSTED_FONTS_LOADED"
          ? { ...assertion, result: "NOT_APPLICABLE" }
          : assertion,
      ),
    }));
    expect(build({
      inventory: forgedExternalInventory,
      matrix: forgedExternalMatrix,
      supplemental: null,
      http: null,
    }).browserMatrix.completeness).toMatchObject({
      result: "INVALID_EVIDENCE",
      envelopeInvalid: true,
    });

    for (const id of SYNTHETIC_ONLY_ASSERTION_IDS) {
      const supplemental = makeSupplemental();
      supplemental.captures[0].assertions.find((assertion) => assertion.id === id).result = "NOT_RUN";
      expect(build({ supplemental }).syntheticJourneyEvidence.result).toBe("INVALID_EVIDENCE");
    }

    const truncatedSyntheticFocus = makeSupplemental();
    truncatedSyntheticFocus.captures[0].focusWalk.truncated = true;
    expect(build({ supplemental: truncatedSyntheticFocus }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const nonCyclingSyntheticFocus = makeSupplemental();
    nonCyclingSyntheticFocus.captures[0].focusWalk.cycled = false;
    expect(build({ supplemental: nonCyclingSyntheticFocus }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const forgedSyntheticFocus = makeSupplemental();
    forgedSyntheticFocus.captures[0].focusWalk.stops[0].baselineCaptured = false;
    expect(build({ supplemental: forgedSyntheticFocus }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const undeclaredDenialNotes = makeSupplemental();
    const undeclaredDenialCapture = undeclaredDenialNotes.captures[0];
    undeclaredDenialCapture.assertions.find((a) => a.id === "NETWORK_CLEAN").result =
      "PASS_WITH_NOTES";
    undeclaredDenialCapture.networkResult = "DECLARED_EXPECTED_FAILURE";
    undeclaredDenialCapture.verdict = "AUTOMATED_PASS_WITH_NOTES";
    expect(build({ supplemental: undeclaredDenialNotes }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");
  });

  it("fails closed on missing zoom, media, width, duplicate, or unexpected inventory records", () => {
    const withoutZoom = makeMatrix();
    withoutZoom.runs = withoutZoom.runs.filter((run) => run.zoomPercent !== 200);
    expect(build({ matrix: withoutZoom }).browserMatrix.completeness).toMatchObject({
      result: "COVERAGE_INCOMPLETE",
      missingRunKeys: ["/research/orders|720|200|default"],
    });

    const badMedia = makeMatrix();
    badMedia.runs.find((run) => run.mediaVariant === "forced-colors").forcedColorsActive = false;
    expect(build({ matrix: badMedia }).browserMatrix.completeness).toMatchObject({
      result: "COVERAGE_INCOMPLETE",
      invalidMediaRuns: ["/research/orders|390|100|forced-colors"],
    });

    const badWidths = makeMatrix({ widthsCssPx: [1440] });
    expect(build({ matrix: badWidths }).browserMatrix.completeness.widthsMatch).toBe(false);

    const staleRouteInventory = makeMatrix({
      routesInventory: { ...ROUTES_INVENTORY, sha256: "e".repeat(64) },
    });
    expect(build({ matrix: staleRouteInventory }).browserMatrix.completeness)
      .toMatchObject({ result: "INVALID_EVIDENCE", envelopeInvalid: true });

    const unexpectedRestoration = makeMatrix({
      metadataRestoration: [{
        public: "/research/about",
        private: "/research/account",
        backTo: "/research/about",
        result: "PASS",
        privateSignalsNoindex: true,
      }],
    });
    expect(build({ matrix: unexpectedRestoration }).browserMatrix.completeness)
      .toMatchObject({
        result: "COVERAGE_INCOMPLETE",
        unexpectedRestoration: [
          "/research/about->/research/account->/research/about",
        ],
      });

    const restorationInventory = inventory();
    restorationInventory.metadataRestoration = [{
      public: "/research/about",
      private: "/research/account",
      privateExpectedPath: "/research/account",
      backTo: "/research/about",
      publicRequiredSelectors: ["[data-page='about']"],
      publicRequiredText: ["About Xenios"],
      privateRequiredSelectors: ["[data-page='account']"],
      privateRequiredText: ["Account"],
    }];
    const restorationMatrix = makeMatrix({
      metadataRestoration: [{
        public: "/research/about",
        private: "/research/account",
        backTo: "/research/about",
        before: {
          path: "/research/about",
          title: "About",
          canonical: "https://www.xenioshealth.com/research/about",
          robots: null,
          selectorPresence: { "[data-page='about']": true },
          requiredTextPresence: { "About Xenios": true },
        },
        during: {
          path: "/research/account",
          title: "Account",
          canonical: null,
          robots: "noindex,nofollow",
          selectorPresence: { "[data-page='account']": true },
          requiredTextPresence: { Account: true },
        },
        after: {
          path: "/research/about",
          title: "About",
          canonical: "https://www.xenioshealth.com/research/about",
          robots: null,
          selectorPresence: { "[data-page='about']": true },
          requiredTextPresence: { "About Xenios": true },
        },
        result: "PASS",
        pathsMatched: true,
        publicIdentityMatched: true,
        privateSignalsNoindex: true,
        privateIdentityMatched: true,
        metadataChangedDuring: true,
        restored: true,
        failures: [],
      }],
    });
    expect(build({
      inventory: restorationInventory,
      matrix: restorationMatrix,
    }).browserMatrix.completeness.result).toBe("AUTOMATED_PASS");
    restorationMatrix.metadataRestoration[0].during.path = "/research/about";
    expect(build({
      inventory: restorationInventory,
      matrix: restorationMatrix,
    }).browserMatrix.completeness).toMatchObject({
      result: "COVERAGE_INCOMPLETE",
      invalidRestoration: [
        "/research/about->/research/account->/research/about",
      ],
    });

    const duplicateHttp = makeHttp();
    duplicateHttp.records.push(structuredClone(duplicateHttp.records[0]));
    expect(build({ http: duplicateHttp }).httpHeadEvidence.completeness).toMatchObject({
      result: "INVALID_EVIDENCE",
      duplicateRoutes: ["/research/orders"],
      duplicateRawHtmlPaths: ["raw-html/research-orders.html"],
    });
  });

  it("requires the exact declared forged-neutral and server-verified status journeys", () => {
    const template = makeTemplate();
    template.requiredSurfaces.push("order-status");
    template.requiredRepresentativeSurfaces.push("order-status");
    template.requiredStates.push("neutral-error", "server-verified");
    template.requiredRepresentativeJourneys.push(
      { surface: "order-status", state: "neutral-error", widthsCssPx: [1440, 390] },
      { surface: "order-status", state: "server-verified", widthsCssPx: [1440, 390] },
    );

    const missing = build({ template });
    expect(missing.syntheticJourneyEvidence).toMatchObject({
      result: "COVERAGE_INCOMPLETE",
      summary: {
        missingCaptureKeys: [
          "order-status|neutral-error|1440",
          "order-status|neutral-error|390",
          "order-status|server-verified|1440",
          "order-status|server-verified|390",
        ],
      },
    });

    const supplemental = makeSupplemental();
    for (const state of ["neutral-error", "server-verified"]) {
      for (const width of [1440, 390]) {
        supplemental.captures.push(statusCapture(width, state));
      }
    }
    supplemental.artifactInventory = supplementalArtifactInventory(supplemental.captures);
    const complete = build({ template, supplemental });
    expect(complete.syntheticJourneyEvidence.result).toBe("AUTOMATED_PASS");
    expect(complete.gates.evidenceCoverage.result).toBe("AUTOMATED_PASS");

    const missingTruth = structuredClone(supplemental);
    delete missingTruth.captures.find((capture) => capture.state === "neutral-error")
      .statusTruthEvidence;
    expect(build({ template, supplemental: missingTruth }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const forgedNeutralDisclosure = structuredClone(supplemental);
    forgedNeutralDisclosure.captures.find((capture) => capture.state === "neutral-error")
      .statusTruthEvidence.referenceRendered = true;
    expect(build({ template, supplemental: forgedNeutralDisclosure }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const wrongReservedDenialReference = structuredClone(supplemental);
    wrongReservedDenialReference.captures.find((capture) => capture.state === "neutral-error")
      .actualUrl =
        "http://127.0.0.1:5190/research/early-access/order-request/" +
        "SYNTHETIC-REFERENCE-REDACTED-OTHER";
    expect(build({
      template,
      supplemental: wrongReservedDenialReference,
    }).syntheticJourneyEvidence.result).toBe("INVALID_EVIDENCE");

    const forgedDenialBody = structuredClone(supplemental);
    forgedDenialBody.captures.find((capture) => capture.state === "neutral-error")
      .statusTruthEvidence.localServerBodySha256 = HASH;
    expect(build({ template, supplemental: forgedDenialBody }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const forgedCleanDenial = structuredClone(supplemental);
    const cleanDenial = forgedCleanDenial.captures.find(
      (capture) => capture.state === "neutral-error",
    );
    for (const id of ["CONSOLE_CLEAN", "NETWORK_CLEAN"]) {
      cleanDenial.assertions.find((assertion) => assertion.id === id).result = "PASS";
    }
    cleanDenial.consoleResult = "CLEAN";
    cleanDenial.networkResult = "CLEAN";
    cleanDenial.verdict = "AUTOMATED_PASS";
    expect(build({ template, supplemental: forgedCleanDenial }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const leakedCredential = structuredClone(supplemental);
    leakedCredential.captures.find((capture) => capture.state === "server-verified")
      .statusTruthEvidence.statusToken = "secret";
    expect(build({ template, supplemental: leakedCredential }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const forgedServerMatch = structuredClone(supplemental);
    forgedServerMatch.captures.find((capture) => capture.state === "server-verified")
      .statusTruthEvidence.responseReferenceMatchedPath = false;
    expect(build({ template, supplemental: forgedServerMatch }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const tokenInQuery = structuredClone(supplemental);
    tokenInQuery.captures.find((capture) => capture.state === "server-verified").actualUrl +=
      "?token=secret";
    expect(build({ template, supplemental: tokenInQuery }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");

    const forgedHeaderTransport = structuredClone(supplemental);
    forgedHeaderTransport.captures.find((capture) => capture.state === "server-verified")
      .statusTruthEvidence.credentialTransport = "query parameter";
    expect(build({ template, supplemental: forgedHeaderTransport }).syntheticJourneyEvidence.result)
      .toBe("INVALID_EVIDENCE");
  });

  it("does not trust a stale HTTP record or an incomplete HTTP assertion summary", () => {
    const stale = makeHttp();
    stale.records[0].candidateSha = OTHER_SHA;
    stale.summary = { records: 1, automatedPass: 1, automatedFail: 0, failingAssertionIds: [] };
    expect(build({ http: stale }).httpHeadEvidence.completeness).toMatchObject({
      result: "INVALID_EVIDENCE",
      invalidRecords: [0],
    });

    const incomplete = makeHttp();
    incomplete.records[0].assertions.pop();
    expect(build({ http: incomplete }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const forgedStatusPass = makeHttp();
    forgedStatusPass.records[0].status = 201;
    expect(forgedStatusPass.records[0].assertions
      .find((assertion) => assertion.id === "STATUS_CODE").result).toBe("PASS");
    expect(build({ http: forgedStatusPass }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    const forgedContentTypePass = makeHttp();
    forgedContentTypePass.records[0].headers["content-type"] = "text/plain; charset=utf-8";
    expect(forgedContentTypePass.records[0].assertions
      .find((assertion) => assertion.id === "CONTENT_TYPE_HTML").result).toBe("PASS");
    expect(build({ http: forgedContentTypePass }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    const inapplicableLaundering = makeHttp();
    inapplicableLaundering.records[0].assertions
      .find((assertion) => assertion.id === "STATUS_CODE").result = "NOT_APPLICABLE";
    expect(build({ http: inapplicableLaundering }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const missingRobotsMeta = makeHttp();
    missingRobotsMeta.records[0].assertions
      .find((assertion) => assertion.id === "ROBOTS_META").result = "NOT_APPLICABLE";
    expect(build({ http: missingRobotsMeta }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    for (const mutate of [
      (record) => { record.assertions.find((a) => a.id === "CANONICAL").result = "NOT_APPLICABLE"; },
      (record) => {
        record.metadata.canonical = "https://xeniostechnology.com/research/orders";
        record.metadata.canonicalLinks = [record.metadata.canonical];
        record.metadata.canonicalLinkCount = 1;
      },
      (record) => {
        record.metadata.openGraphEntries = [{ property: "og:title", content: "leaked" }];
      },
      (record) => { record.headers["x-robots-tag"] = "noindex"; },
    ]) {
      const forgedAbsence = makeHttp();
      mutate(forgedAbsence.records[0]);
      expect(build({ http: forgedAbsence }).httpHeadEvidence.completeness.result)
        .toBe("INVALID_EVIDENCE");
    }

    const forgedRobotsAsset = makeHttp();
    forgedRobotsAsset.robots.sourceSha256 = "f".repeat(64);
    expect(build({ http: forgedRobotsAsset }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    const malformedRobotsContract = structuredClone(RAW_ASSET_CONTRACT);
    malformedRobotsContract.robots.directivesValidation = evaluateRobotsTxt(
      "User-agent: *\nDisallow: /\n",
    );
    const malformedRobotsEvidence = makeHttp();
    malformedRobotsEvidence.robots.directivesValidation =
      malformedRobotsContract.robots.directivesValidation;
    expect(build({
      http: malformedRobotsEvidence,
      rawAssetContract: malformedRobotsContract,
    }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const forgedSitemapSet = makeHttp();
    forgedSitemapSet.sitemap.locs = ["https://evil.example/"];
    forgedSitemapSet.sitemap.locsValidation = { result: "PASS", count: 1, invalidLocs: [], duplicates: [] };
    expect(build({ http: forgedSitemapSet }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    const escapedOrigin = makeHttp();
    escapedOrigin.records[0].finalUrl = "https://example.com/research/orders";
    expect(build({ http: escapedOrigin }).httpHeadEvidence.completeness.result)
      .toBe("INVALID_EVIDENCE");

    const hinoInventory = inventory();
    hinoInventory.routes = [{
      path: "/hino",
      surface: "hino",
      state: "default",
      indexable: false,
      externalMicrosite: true,
    }];
    const hinoRecord = httpRecord({
      route: "/hino",
      surface: "hino",
      finalUrl: "http://127.0.0.1:5184/hino/",
      rawHtmlPath: "raw-html/hino.html",
      headers: { "content-type": "text/html; charset=utf-8" },
      metadata: {
        ...httpRecord().metadata,
        robotsMeta: "noindex, nofollow, nocache",
        robotsMetaEntries: ["noindex, nofollow, nocache"],
        robotsMetaCount: 1,
      },
    });
    for (const assertion of hinoRecord.assertions) {
      if (["X_ROBOTS_TAG", "CANONICAL", "OPEN_GRAPH", "SITEMAP_PARITY", "STRUCTURED_DATA_SCOPE", "AUTHORITATIVE_404", "PUBLIC_TO_PRIVATE_METADATA_RESTORATION"].includes(assertion.id)) {
        assertion.result = "NOT_APPLICABLE";
      }
    }
    expect(build({
      inventory: hinoInventory,
      matrix: null,
      supplemental: null,
      http: makeHttp({ records: [hinoRecord] }),
    }).httpHeadEvidence.completeness.result).toBe("AUTOMATED_PASS");

    const forgedExternalInventory = inventory();
    forgedExternalInventory.routes[0].externalMicrosite = true;
    const forgedExternalRecord = httpRecord();
    for (const assertion of forgedExternalRecord.assertions) {
      if (["X_ROBOTS_TAG", "SITEMAP_PARITY", "STRUCTURED_DATA_SCOPE"].includes(assertion.id)) {
        assertion.result = "NOT_APPLICABLE";
      }
    }
    expect(build({
      inventory: forgedExternalInventory,
      matrix: null,
      supplemental: null,
      http: makeHttp({ records: [forgedExternalRecord] }),
    }).httpHeadEvidence.completeness).toMatchObject({
      result: "INVALID_EVIDENCE",
      envelopeInvalid: true,
    });
  });

  it("independently validates exact production canonical and complete Open Graph metadata", () => {
    const publicInventory = inventory();
    publicInventory.routes = [{
      path: "/research/about",
      surface: "about",
      state: "default",
      indexable: true,
      coverageScope: "representative",
      metadataContract: { title: "About", description: "About Xenios" },
    }];
    const publicRecord = httpRecord({
      route: "/research/about",
      surface: "about",
      indexable: true,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "x-robots-tag": "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1",
      },
      finalUrl: "http://127.0.0.1:5184/research/about",
      metadata: {
        title: "About",
        description: "About Xenios",
        robotsMeta: "index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1",
        robotsMetaEntries: ["index,follow,max-snippet:-1,max-image-preview:large,max-video-preview:-1"],
        robotsMetaCount: 1,
        canonical: "https://xeniostechnology.com/research/about",
        canonicalLinks: ["https://xeniostechnology.com/research/about"],
        canonicalLinkCount: 1,
        openGraph: {
          title: "About",
          description: "About Xenios",
          image: "https://xeniostechnology.com/og/xenios-og-image-v2.png",
          url: "https://xeniostechnology.com/research/about",
          type: "website",
        },
        openGraphEntries: [
          { property: "og:title", content: "About" },
          { property: "og:description", content: "About Xenios" },
          { property: "og:image", content: "https://xeniostechnology.com/og/xenios-og-image-v2.png" },
          { property: "og:url", content: "https://xeniostechnology.com/research/about" },
          { property: "og:type", content: "website" },
        ],
        jsonLd: [],
      },
      rawHtmlPath: "raw-html/research-about.html",
      assertions: HTTP_ASSERTIONS.map(([id, result]) => ({
        id,
        result: ["CANONICAL", "OPEN_GRAPH"].includes(id) ? "PASS" : result,
        detail: id,
      })),
    });
    const publicRawAssetContract = structuredClone(RAW_ASSET_CONTRACT);
    publicRawAssetContract.sitemap.locs = [
      "https://xeniostechnology.com/",
      "https://xeniostechnology.com/research/about",
    ];
    const publicHttp = () => {
      const value = makeHttp({ records: [structuredClone(publicRecord)] });
      value.sitemap.locs = [...publicRawAssetContract.sitemap.locs];
      value.sitemap.count = 2;
      value.sitemap.locsValidation = { result: "PASS", count: 2, invalidLocs: [], duplicates: [] };
      return value;
    };
    const publicManifest = build({
      inventory: publicInventory,
      matrix: null,
      supplemental: null,
      http: publicHttp(),
      rawAssetContract: publicRawAssetContract,
    });
    expect(publicManifest.httpHeadEvidence.completeness.result).toBe("AUTOMATED_PASS");

    const hostileCanonical = publicHttp();
    hostileCanonical.records[0].metadata.canonical = "https://evil.example/research/about";
    expect(build({
      inventory: publicInventory,
      matrix: null,
      supplemental: null,
      http: hostileCanonical,
      rawAssetContract: publicRawAssetContract,
    }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const hostileOpenGraph = publicHttp();
    hostileOpenGraph.records[0].metadata.openGraph.url = "https://evil.example/research/about";
    expect(build({
      inventory: publicInventory,
      matrix: null,
      supplemental: null,
      http: hostileOpenGraph,
      rawAssetContract: publicRawAssetContract,
    }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const hostileOpenGraphImage = publicHttp();
    hostileOpenGraphImage.records[0].metadata.openGraph.image =
      "https://user:secret@xeniostechnology.com/og/xenios-og-image-v2.png";
    expect(build({
      inventory: publicInventory,
      matrix: null,
      supplemental: null,
      http: hostileOpenGraphImage,
      rawAssetContract: publicRawAssetContract,
    }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");

    const incompleteOpenGraph = publicHttp();
    incompleteOpenGraph.records[0].metadata.openGraph.type = null;
    expect(build({
      inventory: publicInventory,
      matrix: null,
      supplemental: null,
      http: incompleteOpenGraph,
      rawAssetContract: publicRawAssetContract,
    }).httpHeadEvidence.completeness.result).toBe("INVALID_EVIDENCE");
  });

  it("validates every provenance and requires matrix/HTTP build and origin agreement", () => {
    const mismatchedBuild = makeHttp({
      provenance: provenance({ distInventorySha256: "c".repeat(64) }),
    });
    const buildMismatch = build({ http: mismatchedBuild });
    expect(buildMismatch.browserMatrix.completeness.result).toBe("AUTOMATED_PASS");
    expect(buildMismatch.httpHeadEvidence.completeness.result).toBe("AUTOMATED_PASS");
    expect(buildMismatch.gates.evidenceProvenance.result).toBe("PROVENANCE_MISMATCH");
    expect(buildMismatch.gates.evidenceCoverage.result).toBe("PROVENANCE_MISMATCH");
    expect(buildMismatch.gates.seo.result).toBe("PROVENANCE_MISMATCH");

    const differentOrigin = makeHttp({ baseUrl: "http://127.0.0.1:6184" });
    expect(build({ http: differentOrigin }).gates.evidenceProvenance).toMatchObject({
      result: "PROVENANCE_MISMATCH",
      provenanceMatches: true,
      baseUrlOriginMatches: false,
    });

    const staleMatrix = makeMatrix({ provenance: provenance({ sourceTree: OTHER_SHA }) });
    expect(build({ matrix: staleMatrix })).toMatchObject({
      browserMatrix: { completeness: { result: "PROVENANCE_INVALID" } },
      gates: { evidenceProvenance: { result: "INVALID_EVIDENCE" } },
    });

    const wrongLock = makeMatrix({
      provenance: provenance({ packageLockSha256: "f".repeat(64) }),
    });
    expect(build({ matrix: wrongLock }).browserMatrix.completeness.result)
      .toBe("PROVENANCE_INVALID");

    const staleSynthetic = makeSupplemental({
      provenance: provenance({ candidateSha: OTHER_SHA }),
    });
    expect(build({ supplemental: staleSynthetic }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      provenanceInspection: { result: "INVALID_EVIDENCE" },
    });

    const exactHarnesses = build().syntheticJourneyEvidence;
    expect(exactHarnesses.harnessOriginsInspection).toEqual({
      result: "AUTOMATED_PASS",
      normalized: HARNESS_ORIGINS,
    });

    const missingHarness = makeSupplemental();
    delete missingHarness.harnessOrigins.catalog;
    expect(build({ supplemental: missingHarness }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      harnessOriginsInspection: { result: "INVALID_EVIDENCE", normalized: null },
    });

    const duplicateHarnessOrigin = makeSupplemental();
    duplicateHarnessOrigin.harnessOrigins.account = duplicateHarnessOrigin.harnessOrigins.step1;
    expect(build({ supplemental: duplicateHarnessOrigin }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      harnessOriginsInspection: { result: "INVALID_EVIDENCE", normalized: null },
    });

    const crossHarness = makeSupplemental();
    crossHarness.captures[0].serverHarness = "step1-hotfix-preview";
    expect(build({ supplemental: crossHarness }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      summary: { invalidCaptureIndices: [0] },
    });

    const forgedCaptureOrigin = makeSupplemental();
    forgedCaptureOrigin.captures[0].actualUrl =
      "http://127.0.0.1:5999/research/orders?width=1440";
    expect(build({ supplemental: forgedCaptureOrigin }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      summary: { invalidCaptureIndices: [0] },
    });

    const unknownHarness = makeSupplemental();
    unknownHarness.captures[0].serverHarness = "unbound-local-preview";
    expect(build({ supplemental: unknownHarness }).syntheticJourneyEvidence).toMatchObject({
      result: "INVALID_EVIDENCE",
      summary: { invalidCaptureIndices: [0] },
    });
  });

  it("binds a clean PII result to the exact evidence-file inventory", () => {
    const screenshots = [
      ...makeMatrix().runs.map((run) => run.artifactPath),
      ...makeSupplemental().captures.map((capture) => capture.artifactPath),
    ].sort((a, b) => a.localeCompare(b));
    const fileInventory = [
      { path: "artifact-index.json", bytes: 17, sha256: HASH },
      ...screenshots.map((path) => ({ path, bytes: 67, sha256: HASH })),
    ].sort((a, b) => a.path.localeCompare(b.path));
    const pii = {
      schemaVersion: 4,
      kind: "evidence-pii-scan",
      candidateSha: SHA,
      findings: [],
      screenshots,
      textArtifacts: ["artifact-index.json"],
      unscannableArtifacts: [],
      textFilesScanned: 1,
      fileInventory,
      inventorySha256: createHash("sha256").update(JSON.stringify(fileInventory)).digest("hex"),
      scanCoverage: {
        result: "COMPLETE",
        classifiedFiles: fileInventory.length,
        totalFiles: fileInventory.length,
        textFiles: 1,
        manualImageFiles: screenshots.length,
        unscannableFiles: 0,
      },
      summary: { result: "CLEAN", total: 0, byId: {} },
    };
    expect(build({ pii, actualEvidenceFiles: fileInventory }).gates.evidencePiiScan.result)
      .toBe("AUTOMATED_CLEAN_MANUAL_SCREENSHOT_REVIEW_PENDING");

    const extra = [...fileInventory, { path: "stale-extra.json", bytes: 1, sha256: HASH }];
    expect(build({ pii, actualEvidenceFiles: extra }).gates.evidencePiiScan).toMatchObject({
      result: "INVALID_EVIDENCE",
      inventoryMatches: false,
    });

    const unknown = [
      ...fileInventory,
      { path: "opaque-evidence.bin", bytes: 32, sha256: HASH },
    ].sort((a, b) => a.path.localeCompare(b.path));
    const forgedComplete = {
      ...pii,
      fileInventory: unknown,
      inventorySha256: createHash("sha256").update(JSON.stringify(unknown)).digest("hex"),
      scanCoverage: {
        ...pii.scanCoverage,
        classifiedFiles: unknown.length,
        totalFiles: unknown.length,
      },
    };
    expect(build({ pii: forgedComplete, actualEvidenceFiles: unknown }).gates.evidencePiiScan)
      .toMatchObject({
        result: "INVALID_EVIDENCE",
        scanCoverageMatches: false,
        unscannableArtifacts: [
          { path: "opaque-evidence.bin", reason: "unsupported artifact extension: .bin" },
        ],
      });
  });

  it("resets stale approval and generated-evidence state and rejects a different template SHA", () => {
    const stale = makeTemplate();
    stale.status = "APPROVED";
    stale.finalVerdict = "PASS";
    stale.readyForSamuelDeployReview = true;
    stale.candidate = {
      ...stale.candidate,
      sha: SHA,
      frozenAt: "2026-08-29T00:00:00.000Z",
      originVerified: "PASS",
    };
    Object.values(stale.lanes).forEach((lane) => {
      lane.finalLaneSha = SHA;
      lane.finalVerdict = "PASS";
    });
    stale.gates.adversarialReview = {
      result: "PASS",
      reviewedSha: SHA,
      artifact: "stale.md",
      p0: 0,
      p1: 0,
      p2: 0,
    };
    stale.browserMatrix.result = "AUTOMATED_PASS";
    stale.browserMatrix.runs = [{ stale: true }];
    stale.httpHeadEvidence.result = "AUTOMATED_PASS";
    stale.httpHeadEvidence.records = [{ stale: true }];
    stale.gates.evidencePiiScan = { result: "AUTOMATED_CLEAN" };

    const manifest = build({
      template: stale,
      matrix: null,
      supplemental: null,
      http: null,
      pii: null,
    });
    expect(manifest).toMatchObject({
      status: "PENDING",
      finalVerdict: "PENDING",
      readyForSamuelDeployReview: false,
      candidate: { sha: SHA, frozenAt: null, originVerified: "PENDING" },
      browserMatrix: { result: "NOT_RUN", runs: [] },
      syntheticJourneyEvidence: { result: "NOT_RUN", captures: [] },
      httpHeadEvidence: { result: "NOT_RUN", records: [] },
      gates: {
        adversarialReview: { result: "PENDING", reviewedSha: null, artifact: null },
        evidencePiiScan: { result: "NOT_RUN", artifact: null },
        seo: { result: "NOT_RUN" },
      },
    });
    for (const lane of Object.values(manifest.lanes)) {
      expect(lane).toMatchObject({ finalLaneSha: null, finalVerdict: "PENDING" });
    }

    const wrong = makeTemplate();
    wrong.candidate.sha = OTHER_SHA;
    expect(() => build({ template: wrong })).toThrow(/does not match/u);
    expect(() => build({ sha: "short" })).toThrow(/exact 40-character/u);
  });

  it("does not mutate its template and keeps the final recut artifact default", () => {
    const template = makeTemplate();
    const before = JSON.stringify(template);
    build({ template });
    expect(JSON.stringify(template)).toBe(before);
    expect(parseArgs([]).artifactRoot).toBe(
      "docs/review/xenios-research-full-site-20260829/browser",
    );
    expect(sourceTemplate.captureSchema.artifactPathMustBeUnder).toBe(
      "docs/review/xenios-research-full-site-20260829/",
    );
    expect(sourceTemplate.requiredRepresentativeJourneys.slice(-2)).toEqual([
      { surface: "order-status", state: "neutral-error", widthsCssPx: [1440, 390] },
      { surface: "order-status", state: "server-verified", widthsCssPx: [1440, 390] },
    ]);
    expect(sourceTemplate.requiredRepresentativeJourneys
      .reduce((count, journey) => count + journey.widthsCssPx.length, 0)).toBe(20);
  });

  it("rejects a selected template that weakens the committed minimum policy", () => {
    expect(assertCanonicalMinimumPolicy(structuredClone(sourceTemplate), sourceTemplate))
      .toBeTruthy();
    for (const weaken of [
      (template) => { template.requiredSurfaces.pop(); },
      (template) => { template.browserMatrix.requiredWidthsCssPx = [1440]; },
      (template) => { template.browserMatrix.requiresTwoHundredPercentZoomEquivalent = false; },
      (template) => { template.requiredRepresentativeJourneys[0].widthsCssPx = [1440]; },
      (template) => { template.httpHeadEvidence.requiredAssertions.pop(); },
      (template) => { template.captureSchema.realCustomerDataAllowed = true; },
    ]) {
      const selected = structuredClone(sourceTemplate);
      weaken(selected);
      expect(() => assertCanonicalMinimumPolicy(selected, sourceTemplate))
        .toThrow(/weakens the canonical minimum policy/u);
    }
  });
});
