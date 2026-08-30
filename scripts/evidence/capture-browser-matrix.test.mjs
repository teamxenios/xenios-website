import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindReviewedAssertionNotes,
  compileExpectedHttpFailures,
  establishEvidencePwaControl,
  EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS,
  EVIDENCE_PWA_CONTROLLER_CHANGE_KEY,
  EVIDENCE_PWA_DISMISSAL_SOURCE,
  EVIDENCE_PWA_WARMUP_PATH,
  evaluateEvidencePhaseTelemetry,
  evaluateMetadataRestoration,
  evaluatePwaControllerSnapshot,
  evaluatePwaWarmupNetworkRecords,
  evaluateRunPhaseBoundaryTelemetry,
  pwaControllerSnapshotSource,
  pwaVerifiedControllerResetSource,
  evaluateRouteStateContract,
  evaluateSelfHostedFontSnapshot,
  routeInventoryDescriptor,
  validateExternalResourceContract,
} from "./capture-browser-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));

const exactFailure = {
  path: "/api/care/appointments",
  method: "GET",
  status: 503,
  count: 1,
  responseBodySha256: "a".repeat(64),
  consoleText: "Failed to load resource: the server responded with a status of 503 (Service Unavailable)",
  reason: "intentional disabled state",
  productionEvidence: "production parity artifact hash",
};

describe("compileExpectedHttpFailures", () => {
  it("binds an exact API failure to the preview origin", () => {
    expect(compileExpectedHttpFailures(
      { expectedHttpFailures: [exactFailure] },
      "http://127.0.0.1:5184/care/appointments",
    )).toEqual([{
      ...exactFailure,
      url: "http://127.0.0.1:5184/api/care/appointments",
    }]);
  });

  it("binds exact document and worker failures only to a route whose expected status matches", () => {
    const routePath = "/research/lots/XR-EVIDENCE-NEGATIVE-LOT";
    const documentFailure = {
      ...exactFailure,
      path: routePath,
      status: 404,
      resourceType: "Document",
      consoleCount: 1,
      consoleText: "Failed to load resource: the server responded with a status of 404 (Not Found)",
    };
    const workerFailure = {
      ...documentFailure,
      resourceType: "Fetch",
      targetType: "worker-or-child",
      responseBodySha256: "b".repeat(64),
      consoleCount: 0,
    };
    delete workerFailure.consoleText;
    expect(compileExpectedHttpFailures(
      { path: routePath, expectStatus: 404, expectedHttpFailures: [documentFailure, workerFailure] },
      `http://127.0.0.1:5184${routePath}`,
    )).toEqual([
      expect.objectContaining({ ...documentFailure, url: `http://127.0.0.1:5184${routePath}` }),
      expect.objectContaining({ ...workerFailure, url: `http://127.0.0.1:5184${routePath}` }),
    ]);
    expect(() => compileExpectedHttpFailures(
      { path: routePath, expectStatus: 200, expectedHttpFailures: [documentFailure] },
      "http://127.0.0.1:5184",
    )).toThrow(/route's exact expected document path/u);
  });

  it.each([
    [{ ...exactFailure, path: "https://example.com/api/care/appointments" }],
    [{ ...exactFailure, path: "/care/appointments" }],
    [{ ...exactFailure, method: "POST" }],
    [{ ...exactFailure, status: 200 }],
    [{ ...exactFailure, count: 0 }],
    [{ ...exactFailure, responseBodySha256: "not-a-hash" }],
    [{ ...exactFailure, productionEvidence: "" }],
    [{ ...exactFailure, consoleCount: 0 }],
    [{ ...exactFailure, targetType: "worker-or-child" }],
  ])("rejects a broad or incomplete declaration %#", (failure) => {
    expect(() => compileExpectedHttpFailures(
      { expectedHttpFailures: [failure] },
      "http://127.0.0.1:5184",
    )).toThrow();
  });

  it("rejects duplicate method and URL declarations", () => {
    expect(() => compileExpectedHttpFailures(
      { expectedHttpFailures: [exactFailure, { ...exactFailure, status: 500 }] },
      "http://127.0.0.1:5184",
    )).toThrow(/unique method \+ URL \+ resourceType \+ targetType/u);
    const typedSibling = {
      ...exactFailure,
      resourceType: "Fetch",
      responseBodySha256: "b".repeat(64),
      consoleCount: 0,
    };
    delete typedSibling.consoleText;
    expect(() => compileExpectedHttpFailures(
      { expectedHttpFailures: [exactFailure, typedSibling] },
      "http://127.0.0.1:5184",
    )).toThrow(/non-overlapping exact resourceType/u);
  });

  it("rejects two network declarations that claim the same console signal", () => {
    const routePath = "/research/lots/XR-EVIDENCE-NEGATIVE-LOT";
    const consoleText = "Failed to load resource: the server responded with a status of 404 (Not Found)";
    const baseFailure = {
      ...exactFailure,
      path: routePath,
      status: 404,
      resourceType: "Document",
      consoleCount: 1,
      consoleText,
    };
    expect(() => compileExpectedHttpFailures({
      path: routePath,
      expectStatus: 404,
      expectedHttpFailures: [
        baseFailure,
        {
          ...baseFailure,
          resourceType: "Fetch",
          targetType: "worker-or-child",
          responseBodySha256: "b".repeat(64),
        },
      ],
    }, "http://127.0.0.1:5184")).toThrow(/unique URL \+ consoleText/u);
  });
});

describe("bindReviewedAssertionNotes", () => {
  const sha = "c".repeat(40);
  const gitTree = "d".repeat(40);
  const route = {
    path: "/hino",
    externalMicrosite: true,
    reviewedAssertionNotes: [{
      id: "TARGETS_44x44",
      allowedFindingFingerprints: ["f".repeat(64)],
      reason: "protected production-parity debt",
      productionCommit: "3".repeat(40),
      productionEvidence: "live matrix hash",
      candidateSource: { path: "client/public/hino", gitTree },
    }],
  };

  it("machine-binds an exact candidate source tree before a note can apply", () => {
    const [bound] = bindReviewedAssertionNotes([route], {
      sha,
      resolveGitObject: (candidateSha, sourcePath) => {
        expect([sha, "3".repeat(40)]).toContain(candidateSha);
        expect(sourcePath).toBe("client/public/hino");
        return gitTree;
      },
    });
    expect(bound.reviewedAssertionNotes[0]).toMatchObject({
      sourceBindingVerified: true,
      candidateSourceBinding: {
        candidateSha: sha,
        path: "client/public/hino",
        expectedGitTree: gitTree,
        actualGitTree: gitTree,
        productionCommit: "3".repeat(40),
        productionGitTree: gitTree,
      },
    });
  });

  it("rejects a candidate source-tree drift", () => {
    expect(() => bindReviewedAssertionNotes([route], {
      sha,
      resolveGitObject: (candidateSha) => candidateSha === sha ? "e".repeat(40) : gitTree,
    })).toThrow(/source tree mismatch/u);
  });

  it("rejects notes attached to any route other than the external Hino microsite", () => {
    expect(() => bindReviewedAssertionNotes(
      [{ ...route, path: "/care", externalMicrosite: false }],
      { sha, resolveGitObject: () => gitTree },
    )).toThrow(/limited to the protected \/hino/u);
  });
});

describe("controlled evidence UI state", () => {
  it("uses the product's documented session-only PWA dismissal key", () => {
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain(
      'sessionStorage.setItem("xenios-pwa-hint-dismissed", "1")',
    );
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain(EVIDENCE_PWA_CONTROLLER_CHANGE_KEY);
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain('addEventListener("controllerchange"');
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain('getItem(key) === null');
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain(EVIDENCE_PWA_WARMUP_PATH);
    expect(EVIDENCE_PWA_DISMISSAL_SOURCE).toContain("data:image/svg+xml");
  });

  it("reads the persistent controller-change counter last with no later await", () => {
    const source = pwaControllerSnapshotSource();
    const registrationAwait = source.indexOf("const registration");
    const tupleCapture = source.indexOf("const active =");
    const counterRead = source.indexOf("getItem(key)");
    const returnedSnapshot = source.indexOf("return {", counterRead);
    expect(registrationAwait).toBeGreaterThanOrEqual(0);
    expect(tupleCapture).toBeGreaterThan(registrationAwait);
    expect(counterRead).toBeGreaterThan(tupleCapture);
    expect(returnedSnapshot).toBeGreaterThan(counterRead);
    expect(source.slice(counterRead)).not.toMatch(/\bawait\b/u);
  });

  it("verifies and resets the warm-up counter atomically after registration lookup", () => {
    const source = pwaVerifiedControllerResetSource("http://127.0.0.1:5184");
    const registrationAwait = source.indexOf("await new Promise");
    const counterRead = source.indexOf("const counterValue");
    const tupleVerification = source.indexOf("const resetApplied");
    const conditionalReset = source.indexOf("if (resetApplied)");
    expect(registrationAwait).toBeGreaterThanOrEqual(0);
    expect(counterRead).toBeGreaterThan(registrationAwait);
    expect(tupleVerification).toBeGreaterThan(counterRead);
    expect(conditionalReset).toBeGreaterThan(tupleVerification);
    expect(source.slice(counterRead)).not.toMatch(/\bawait\b/u);
  });

  const baseUrl = "http://127.0.0.1:5184";
  const scriptUrl = `${baseUrl}/sw.js`;
  const scope = `${baseUrl}/`;
  const activeController = (counterValue = "0") => ({
    supported: true,
    registrationScope: scope,
    activeScriptUrl: scriptUrl,
    activeState: "activated",
    controllerScriptUrl: scriptUrl,
    controllerState: "activated",
    controllerMatchesActive: true,
    controllerChangeCounterValue: counterValue,
    controllerChangeCount: Number(counterValue),
  });
  const warmupLifecycle = () => ({
    ...activeController("1"),
    activeState: "activating",
    controllerState: "activating",
    pathname: EVIDENCE_PWA_WARMUP_PATH,
  });
  const warmupNetworkRecords = () => [
    {
      url: `${baseUrl}${EVIDENCE_PWA_WARMUP_PATH}`,
      method: "GET",
      status: 200,
      type: "Document",
    },
    {
      url: scriptUrl,
      method: "GET",
      status: 200,
      type: "Script",
      targetType: "worker-or-child",
    },
    {
      url: `${baseUrl}${EVIDENCE_PWA_WARMUP_PATH}`,
      method: "GET",
      status: 200,
      type: "Fetch",
      targetType: "worker-or-child",
    },
  ];
  const warmupPage = ({
    lifecycle = warmupLifecycle(),
    postSettle = activeController("1"),
    controllerReset = {
      snapshot: activeController("1"),
      resetApplied: true,
      postResetCounterValue: "0",
    },
    network = null,
  } = {}) => ({
    setViewport: vi.fn().mockResolvedValue(undefined),
    setMedia: vi.fn().mockResolvedValue(undefined),
    navigate: vi.fn().mockResolvedValue({ navigationMs: 123 }),
    evaluate: vi.fn()
      .mockResolvedValueOnce(lifecycle)
      .mockResolvedValueOnce(postSettle)
      .mockResolvedValueOnce(controllerReset)
      .mockResolvedValueOnce(activeController("0")),
    settle: vi.fn().mockResolvedValue({ reachedIdle: true, pendingRequests: 0 }),
    waitForBoundaryTargets: vi.fn().mockResolvedValue(undefined),
    resetRecords: vi.fn(),
    network: network ?? warmupNetworkRecords(),
    console: [],
    networkBoundaryViolations: [],
    networkBoundaryFulfillments: [],
    inflight: new Map(),
    errorResponseBodyTelemetry: new Set(),
    boundaryTargetPromises: new Set(),
    boundarySetupErrors: [],
  });

  it("establishes and attests one exact active controller before any recorded route", async () => {
    const page = warmupPage();
    await expect(establishEvidencePwaControl(page, baseUrl)).resolves.toMatchObject({
      result: "PASS",
      warmupUrl: `${baseUrl}${EVIDENCE_PWA_WARMUP_PATH}`,
      expectedScriptUrl: scriptUrl,
      expectedScope: scope,
      recordedRunControllerChangeBaseline: 0,
      lifecycle: { controllerChangeCount: 1 },
      networkRecords: [
        expect.objectContaining({ type: "Document", targetType: null }),
        expect.objectContaining({ type: "Script", targetType: "worker-or-child" }),
        expect.objectContaining({ type: "Fetch", targetType: "worker-or-child" }),
      ],
      postSettleSnapshot: { controllerChangeCount: 1 },
      preResetSnapshot: { controllerChangeCount: 1 },
      controllerCounterResetApplied: true,
      controllerCounterValueAfterReset: "0",
      recordedRunBaselineSnapshot: { controllerChangeCount: 0 },
      telemetry: {
        networkRecordCount: 3,
        networkRecordMultisetResult: "PASS",
        networkRecordMismatchCount: 0,
        networkFailureCount: 0,
        unexpectedNetworkRecordCount: 0,
        networkBoundaryViolationCount: 0,
      },
    });
    expect(page.navigate).toHaveBeenCalledWith(`${baseUrl}${EVIDENCE_PWA_WARMUP_PATH}`);
    expect(page.settle).toHaveBeenCalled();
    expect(page.resetRecords).toHaveBeenCalledTimes(1);
  });

  it("accepts only the exact three-record warm-up multiset", () => {
    expect(evaluatePwaWarmupNetworkRecords(
      [...warmupNetworkRecords()].reverse(),
      baseUrl,
    )).toMatchObject({
      id: "PWA_WARMUP_NETWORK_EXACT",
      result: "PASS",
      count: 0,
      networkRecords: warmupNetworkRecords().map((record) => ({
        ...record,
        targetType: record.targetType ?? null,
      })),
    });
  });

  it.each([
    ["missing worker fetch", (records) => records.slice(0, 2)],
    ["extra request", (records) => [...records, { ...records[0], url: `${baseUrl}/extra` }]],
    ["duplicate request", (records) => [...records, records[2]]],
    ["method drift", (records) => records.map((record, index) =>
      index === 2 ? { ...record, method: "POST" } : record)],
    ["status drift", (records) => records.map((record, index) =>
      index === 2 ? { ...record, status: "200" } : record)],
    ["resource-type drift", (records) => records.map((record, index) =>
      index === 2 ? { ...record, type: "Other" } : record)],
    ["main target-type drift", (records) => records.map((record, index) =>
      index === 0 ? { ...record, targetType: "worker-or-child" } : record)],
    ["missing child target type", (records) => records.map((record, index) =>
      index === 1 ? { ...record, targetType: undefined } : record)],
  ])("rejects %s in the warm-up network multiset", (_name, mutate) => {
    expect(evaluatePwaWarmupNetworkRecords(mutate(warmupNetworkRecords()), baseUrl)).toMatchObject({
      result: "FAIL",
      count: expect.any(Number),
      networkRecords: [],
    });
  });

  it("serializes only the five approved fields from successful raw records", () => {
    const audited = evaluatePwaWarmupNetworkRecords(
      warmupNetworkRecords().map((record) => ({
        ...record,
        responseBody: "must-not-persist",
        checkoutPath: "C:\\private\\candidate",
      })),
      baseUrl,
    );
    expect(audited.result).toBe("PASS");
    expect(audited.networkRecords.every((record) =>
      Object.keys(record).sort().join(",") === "method,status,targetType,type,url",
    )).toBe(true);
    expect(JSON.stringify(audited.networkRecords)).not.toMatch(/must-not-persist|private/u);
  });

  it("rejects warm-up traffic outside the exact three-record multiset", async () => {
    const page = warmupPage({
      network: [
        ...warmupNetworkRecords(),
        { url: "https://unexpected.invalid/collector", method: "GET", status: 200 },
      ],
    });
    await expect(establishEvidencePwaControl(page, baseUrl)).rejects.toThrow(
      /exact three required records/u,
    );
  });

  it("rejects a second controller transition before the warm-up counter is reset", async () => {
    const page = warmupPage({ postSettle: activeController("2") });
    await expect(establishEvidencePwaControl(page, baseUrl)).rejects.toThrow(
      /post-settle controller state was invalid/u,
    );
  });

  it("does not erase a controller transition that arrives before the atomic reset", async () => {
    const page = warmupPage({
      controllerReset: {
        snapshot: activeController("2"),
        resetApplied: false,
        postResetCounterValue: "2",
      },
    });
    await expect(establishEvidencePwaControl(page, baseUrl)).rejects.toThrow(
      /atomic reset failed/u,
    );
    expect(page.resetRecords).not.toHaveBeenCalled();
  });

  it("requires the exact active tuple and zero controller changes on every recorded run", () => {
    expect(evaluatePwaControllerSnapshot(activeController("0"), baseUrl)).toMatchObject({
      id: "PWA_CONTROLLER_STABLE",
      result: "PASS",
      count: 0,
    });
    expect(evaluatePwaControllerSnapshot(activeController("1"), baseUrl)).toMatchObject({
      id: "PWA_CONTROLLER_STABLE",
      result: "FAIL",
    });
    expect(evaluatePwaControllerSnapshot({
      ...activeController("0"),
      controllerScriptUrl: "https://unexpected.invalid/sw.js",
    }, baseUrl)).toMatchObject({ result: "FAIL" });
  });

  it("binds every network-generating external URL in the candidate HTML to an exact local substitution", () => {
    const html = readFileSync(resolve(here, "../../client/index.html"), "utf8");
    expect(validateExternalResourceContract(html)).toMatchObject({
      result: "PASS",
      discoveredUrls: [],
      substitutions: [],
    });
    expect(EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS).toEqual([]);
    expect(() => validateExternalResourceContract(
      html.replace("</head>", '<script src="https://unknown.example/collector.js"></script></head>'),
    )).toThrow(/external-resource inventory mismatch/u);
  });
});

describe("evidence envelope path privacy", () => {
  it.each([
    "C:\\Users\\operator\\private-checkout\\custom-routes.json",
    "/home/operator/private-checkout/custom-routes.json",
    "\\\\private-server\\operator\\private-checkout\\custom-routes.json",
  ])("uses a content-bound safe identifier for %s", (routesPath) => {
    const descriptor = routeInventoryDescriptor(routesPath, '{"routes":[]}');
    expect(descriptor).toMatchObject({
      id: "custom/custom-routes.json",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
    expect(JSON.stringify(descriptor)).not.toContain("operator");
    expect(JSON.stringify(descriptor)).not.toMatch(/[A-Za-z]:[\\/]/u);
  });
});

describe("evaluateSelfHostedFontSnapshot", () => {
  const loaded = {
    applicable: true,
    bodyFontFamily: '"Inter Tight", system-ui, sans-serif',
    interTight: { "500": true, "600": true, "700": true, "800": true, "900": true },
    jetBrainsMono: { "500": true, "600": true },
  };

  it("requires every pinned weight and the computed body family", () => {
    expect(evaluateSelfHostedFontSnapshot({}, loaded)).toMatchObject({ result: "PASS", count: 0 });
    expect(evaluateSelfHostedFontSnapshot({}, {
      ...loaded,
      interTight: { ...loaded.interTight, "900": false },
    })).toMatchObject({ result: "FAIL", count: 1 });
  });

  it("is explicitly not applicable only to the external Hino microsite", () => {
    expect(evaluateSelfHostedFontSnapshot(
      { path: "/hino", externalMicrosite: true },
      { applicable: false, reason: "external microsite owns its static typography" },
    )).toMatchObject({ result: "NOT_APPLICABLE" });
    expect(() => evaluateSelfHostedFontSnapshot(
      { path: "/care", externalMicrosite: true },
      { applicable: false, reason: "external microsite owns its static typography" },
    )).toThrow(/reserved for the exact \/hino/u);
  });
});

describe("evaluateMetadataRestoration", () => {
  const pair = {
    public: "/research/about",
    private: "/research/account",
    privateExpectedPath: "/research/sign-in",
    privateExpectedReturnTo: "/research/account",
    backTo: "/research/about",
    publicRequiredSelectors: ["#about-purpose"],
    publicRequiredText: ["A more accountable way"],
    privateRequiredSelectors: ['[data-testid="form-member-signin"]'],
    privateRequiredText: ["Sign in."],
  };
  const publicSnapshot = {
    path: "/research/about",
    searchParams: {},
    title: "About",
    canonical: "https://xeniostechnology.com/research/about",
    robots: "index,follow",
    selectorPresence: { "#about-purpose": true },
    requiredTextPresence: { "A more accountable way": true },
  };
  const privateSnapshot = {
    path: "/research/sign-in",
    searchParams: { returnTo: "/research/account" },
    title: "Sign in",
    canonical: null,
    robots: "noindex,nofollow",
    selectorPresence: { '[data-testid="form-member-signin"]': true },
    requiredTextPresence: { "Sign in.": true },
  };

  it("passes only an exact public-private-public transition with identity and metadata changes", () => {
    expect(evaluateMetadataRestoration(pair, publicSnapshot, privateSnapshot, publicSnapshot)).toMatchObject({
      pathsMatched: true,
      publicIdentityMatched: true,
      privateIdentityMatched: true,
      privateSignalsNoindex: true,
      metadataChangedDuring: true,
      restored: true,
      result: "PASS",
    });
  });

  it("blocks the historical no-navigation false pass even when before and after metadata match", () => {
    const result = evaluateMetadataRestoration(pair, publicSnapshot, publicSnapshot, publicSnapshot);
    expect(result).toMatchObject({
      pathsMatched: false,
      privateIdentityMatched: false,
      metadataChangedDuring: false,
      result: "FAIL",
    });
  });
});

describe("evaluateEvidencePhaseTelemetry", () => {
  const cleanPage = () => ({
    network: [{ url: "http://127.0.0.1:5184/research/about", status: 200 }],
    console: [{ level: "warning", text: "non-blocking warning" }],
    networkBoundaryViolations: [],
    networkBoundaryFulfillments: [],
    inflight: new Map(),
    errorResponseBodyTelemetry: new Set(),
    boundaryTargetPromises: new Set(),
    boundarySetupErrors: [],
  });

  it("passes a settled closing phase with no blocking telemetry", () => {
    expect(evaluateEvidencePhaseTelemetry(cleanPage())).toMatchObject({
      result: "PASS",
      count: 0,
      networkRecordCount: 1,
      networkFailureCount: 0,
      consoleErrorCount: 0,
      childConsoleErrorCount: 0,
    });
  });

  it("fails on a child-target exception even when every request succeeded", () => {
    const page = cleanPage();
    page.console.push({
      level: "exception",
      text: "worker failed",
      targetType: "worker-or-child",
    });
    expect(evaluateEvidencePhaseTelemetry(page)).toMatchObject({
      result: "FAIL",
      count: 1,
      consoleErrorCount: 1,
      childConsoleErrorCount: 1,
    });
  });

  it("fails closed when the phase telemetry source is incomplete", () => {
    expect(evaluateEvidencePhaseTelemetry({})).toMatchObject({
      result: "FAIL",
      count: 1,
      telemetrySourceErrorCount: 1,
    });
  });

  it("requires exactly zero browser network records in finalization", () => {
    expect(evaluateEvidencePhaseTelemetry(cleanPage(), {
      expectedNetworkRecordCount: 0,
    })).toMatchObject({
      result: "FAIL",
      count: 1,
      networkRecordCount: 1,
      expectedNetworkRecordCount: 0,
      networkRecordCountMismatchCount: 1,
    });
  });
});

describe("evaluateRunPhaseBoundaryTelemetry", () => {
  const settledPage = () => ({
    inflight: new Map(),
    errorResponseBodyTelemetry: new Set(),
    boundaryTargetPromises: new Set(),
    boundarySetupErrors: [],
  });

  it("passes only an exact settled run boundary", () => {
    expect(evaluateRunPhaseBoundaryTelemetry(settledPage())).toMatchObject({
      id: "EVIDENCE_PHASE_SETTLED",
      result: "PASS",
      count: 0,
      pendingRequestCount: 0,
      pendingBodyTelemetryCount: 0,
      pendingBoundaryTargetCount: 0,
    });
  });

  it("fails before reset when a final PWA read overlaps an in-flight request", () => {
    const page = settledPage();
    page.inflight.set("late-request", { url: "http://127.0.0.1:5184/late" });
    expect(evaluateRunPhaseBoundaryTelemetry(page)).toMatchObject({
      result: "FAIL",
      count: 1,
      pendingRequestCount: 1,
    });
  });

  it("snapshots pending state after the final PWA read and before resetting", () => {
    const source = readFileSync(resolve(here, "capture-browser-matrix.mjs"), "utf8");
    const runStart = source.indexOf("async function runOne");
    const runEnd = source.indexOf("export async function main", runStart);
    const runSource = source.slice(runStart, runEnd);
    const pwaRead = runSource.indexOf("await page.evaluate(pwaControllerSnapshotSource())");
    const phaseSnapshot = runSource.indexOf("evaluateRunPhaseBoundaryTelemetry(page)");
    const recordReset = runSource.lastIndexOf("page.resetRecords()");
    expect(pwaRead).toBeGreaterThanOrEqual(0);
    expect(phaseSnapshot).toBeGreaterThan(pwaRead);
    expect(recordReset).toBeGreaterThan(phaseSnapshot);
    expect(runSource).toContain("page.navigate(url, { resetRecords: false })");
  });
});

describe("evaluateRouteStateContract", () => {
  const confirmationRoute = {
    path: "/research/order/confirmation",
    semanticContract: {
      requiredSelectors: ["[data-testid='order-confirmation-unavailable']"],
      requiredText: ["Confirmation unavailable"],
      forbiddenText: ["Request received", "Status: submitted"],
    },
  };

  it("passes only the neutral unavailable confirmation state", () => {
    const assertions = evaluateRouteStateContract(confirmationRoute, {
      path: "/research/order/confirmation",
      bodyText: "Confirmation unavailable. Return to your order.",
      selectorPresence: { "[data-testid='order-confirmation-unavailable']": true },
    });
    expect(assertions).toEqual([
      expect.objectContaining({ id: "ROUTE_LOCATION", result: "PASS" }),
      expect.objectContaining({ id: "ROUTE_STATE_CONTRACT", result: "PASS" }),
    ]);
  });

  it("blocks an arbitrary URL that renders a false submitted receipt", () => {
    const assertions = evaluateRouteStateContract(confirmationRoute, {
      path: "/research/order/confirmation",
      bodyText: "Request received. Status: submitted.",
      selectorPresence: { "[data-testid='order-confirmation-unavailable']": false },
    });
    const state = assertions.find((assertion) => assertion.id === "ROUTE_STATE_CONTRACT");
    expect(state).toMatchObject({ result: "FAIL", count: 4 });
    expect(state.detail).toContain("missing selector");
    expect(state.detail).toContain("forbidden text");
  });

  it("blocks a redirect or route mismatch even when state text happens to match", () => {
    const assertions = evaluateRouteStateContract(confirmationRoute, {
      path: "/research/order/status",
      bodyText: "Confirmation unavailable",
      selectorPresence: { "[data-testid='order-confirmation-unavailable']": true },
    });
    expect(assertions.find((assertion) => assertion.id === "ROUTE_LOCATION")).toMatchObject({
      result: "FAIL",
    });
  });

  it("treats a missing route identity contract as release-blocking", () => {
    const assertions = evaluateRouteStateContract(
      { path: "/research/about" },
      { path: "/research/about", bodyText: "generic page", selectorPresence: {} },
    );
    expect(assertions.find((assertion) => assertion.id === "ROUTE_STATE_CONTRACT")).toMatchObject({
      result: "FAIL",
      count: 1,
    });
  });
});
