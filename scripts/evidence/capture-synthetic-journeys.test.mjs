import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import {
  SYNTHETIC_CAPTURE_CASES,
  SYNTHETIC_PERSONA_STORAGE_TYPES,
  STATUS_CREDENTIAL_TRANSPORT,
  assertSyntheticAssertionSchema,
  buildArtifactInventory,
  classifyBrowserBoundaryRequest,
  clearSyntheticPersonaState,
  emptyPersonaPartnerFailureDeclaration,
  evaluateSyntheticRouteStateContract,
  forgedStatusFailureDeclaration,
  parseArgs,
  safeChildEnvironment,
  sanitizeEvidenceText,
  sanitizeNetworkUrl,
  summariseCaptures,
  webSocketBoundarySource,
} from "./capture-synthetic-journeys.mjs";
import { ASSERTION_IDS } from "./lib/report.mjs";

describe("capture-synthetic-journeys", () => {
  it("defines the exact ten representative and status-truth states required by the supplemental gate", () => {
    expect(
      Object.values(SYNTHETIC_CAPTURE_CASES).map(({ surface, state }) => surface + "/" + state),
    ).toEqual([
      "catalog/default",
      "product-detail/default",
      "account-overview/rich",
      "orders/rich",
      "orders/empty",
      "membership/rich",
      "order-flow/review",
      "order-flow/confirmation",
      "order-status/neutral-error",
      "order-status/server-verified",
    ]);
    for (const captureCase of Object.values(SYNTHETIC_CAPTURE_CASES)) {
      expect(captureCase.evidenceClass).toBe("synthetic-production-shape");
      expect(captureCase.logicalRoute.startsWith("/research/")).toBe(true);
      expect(captureCase.fixture.length).toBeGreaterThan(0);
      expect(captureCase.expectedPath || captureCase.expectedPathPattern).toBeTruthy();
      expect(captureCase.semanticContract.requiredSelectors.length).toBeGreaterThan(0);
    }
  });

  it("parses explicit evidence arguments and rejects bad ports", () => {
    expect(
      parseArgs([
        "--out-dir",
        "out",
        "--sha",
        "a".repeat(40),
        "--reviewer",
        "release-lead",
        "--catalog-port",
        "5201",
        "--account-port",
        "5202",
        "--step1-port",
        "5203",
      ]),
    ).toMatchObject({
      outDir: "out",
      sha: "a".repeat(40),
      reviewer: "release-lead",
      catalogPort: 5201,
      accountPort: 5202,
      step1Port: 5203,
    });
    expect(() => parseArgs(["--catalog-port", "0"])).toThrow(/invalid port/u);
    expect(() => parseArgs(["--unknown"])).toThrow(/unknown argument/u);
  });

  it("does not pass provider credentials into preview child processes", () => {
    const child = safeChildEnvironment(
      {
        PATH: "fixture-path",
        TEMP: "fixture-temp",
        DATABASE_URL: "postgres://production.invalid",
        SUPABASE_SERVICE_ROLE_KEY: "production-key",
        RESEND_API_KEY: "production-key",
      },
      { NODE_ENV: "development", PORT: "5201" },
    );
    expect(child).toEqual({
      PATH: "fixture-path",
      TEMP: "fixture-temp",
      NODE_ENV: "development",
      PORT: "5201",
    });
    expect(JSON.stringify(child)).not.toContain("production");
  });

  it("clears only auth and persona state without restarting the service worker", async () => {
    const calls = [];
    const page = {
      async evaluate(source) {
        calls.push({ kind: "evaluate", source });
        return true;
      },
      async send(method, params) {
        calls.push({ kind: "send", method, params });
        return {};
      },
    };
    const origin = "http://127.0.0.1:5202";

    await clearSyntheticPersonaState(page, origin);

    expect(calls).toEqual([
      {
        kind: "evaluate",
        source: "(sessionStorage.clear(), true)",
      },
      {
        kind: "send",
        method: "Storage.clearDataForOrigin",
        params: {
          origin,
          storageTypes: "cookies,indexeddb,local_storage",
        },
      },
      {
        kind: "send",
        method: "Network.clearBrowserCookies",
        params: undefined,
      },
    ]);
    const storageTypes = SYNTHETIC_PERSONA_STORAGE_TYPES.split(",");
    expect(storageTypes).toEqual(["cookies", "indexeddb", "local_storage"]);
    expect(storageTypes).not.toContain("service_workers");
    expect(storageTypes).not.toContain("cache_storage");
    expect(SYNTHETIC_PERSONA_STORAGE_TYPES).not.toBe("all");
  });

  it("redacts generated references and preview tokens from textual artifacts", () => {
    const text = sanitizeEvidenceText(
      "Reference XRR-20260829-ABCDEF1234; preview-member-token-1; " +
        "preview-refresh-member-fixture-1; test.customer@example.invalid",
    );
    expect(text).toContain("SYNTHETIC-REFERENCE-REDACTED");
    expect(text).toContain("SYNTHETIC-MEMBER-TOKEN-REDACTED");
    expect(text).toContain("SYNTHETIC-REFRESH-TOKEN-REDACTED");
    expect(text).toContain("SYNTHETIC-EMAIL-REDACTED");
    expect(text).not.toMatch(/\bXRR-\d{8}-[A-F0-9]{10}\b/u);
    expect(
      sanitizeNetworkUrl("ws://127.0.0.1:5201/?token=random-hmr-secret#fragment"),
    ).toBe("ws://127.0.0.1:5201/?REDACTED");
  });

  it("sends the synthetic status credential by header without putting it in the URL", () => {
    const source = readFileSync(
      new URL("./capture-synthetic-journeys.mjs", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "headers: { 'x-xenios-order-status-token': token }",
    );
    expect(source).not.toContain("'?token=' + encodeURIComponent(token)");
    expect(STATUS_CREDENTIAL_TRANSPORT).toEqual({
      NONE: "NONE",
      REQUEST_HEADER: "x-xenios-order-status-token request header",
    });
    expect(source.match(/credentialTransport:/gu)).toHaveLength(2);
    expect(source).toContain(
      "credentialTransport: STATUS_CREDENTIAL_TRANSPORT.NONE",
    );
    expect(source).toContain(
      "credentialTransport: STATUS_CREDENTIAL_TRANSPORT.REQUEST_HEADER",
    );
  });

  it("requires exactly twenty captures and distinguishes every declared note", () => {
    const clean = Array.from({ length: 20 }, () => ({ verdict: "AUTOMATED_PASS" }));
    expect(summariseCaptures(clean)).toMatchObject({
      captures: 20,
      expectedCaptures: 20,
      expectedCaptureCountMatched: true,
      automatedPass: 20,
      automatedPassWithNotes: 0,
      automatedFail: 0,
      strictClean: true,
      result: "AUTOMATED_PASS",
      externalMutations: 0,
    });
    const denialEvidence = {
      kind: "VALID_SHAPED_REFERENCE_DENIED",
      referenceShape: "XRR-YYYYMMDD-10_HEX",
      credentialSource: "ABSENT",
      credentialTransport: STATUS_CREDENTIAL_TRANSPORT.NONE,
      credentialPresent: false,
      localServerMethod: "GET",
      localServerStatus: 404,
      localServerErrorCode: "not_found",
      localServerBodySha256: forgedStatusFailureDeclaration(
        "http://127.0.0.1:5219",
      ).responseBodySha256,
      referenceRendered: false,
      requestDetailsRendered: false,
      declaredExpectedFailure: true,
      externalMutations: 0,
    };
    const partnerAbsenceEvidence = {
      kind: "EMPTY_PERSONA_PARTNER_RELATION_ABSENT",
      endpoint: "/api/research/partner/me",
      method: "GET",
      status: 404,
      code: "partner_not_found",
      count: 1,
      responseBodySha256:
        "87d28f7ea8ea041e07906726a8d93d61da18844f7fdc7dee8ea804c143c51876",
      declaredExpectedFailure: true,
      externalMutations: 0,
    };
    const expectedDenials = Array.from({ length: 2 }, () => ({
      verdict: "AUTOMATED_PASS_WITH_NOTES",
      statusTruthEvidence: { ...denialEvidence },
    }));
    const expectedPartnerAbsences = Array.from({ length: 2 }, () => ({
      verdict: "AUTOMATED_PASS_WITH_NOTES",
      partnerAbsenceEvidence: { ...partnerAbsenceEvidence },
    }));
    expect(
      summariseCaptures([
        ...clean.slice(0, 16),
        ...expectedDenials,
        ...expectedPartnerAbsences,
      ]),
    ).toMatchObject({
      strictClean: false,
      completeWithExpectedDenialNotes: false,
      completeWithExpectedNotes: true,
      declaredDenialPassWithNotes: 2,
      declaredPartnerAbsencePassWithNotes: 2,
      zeroUndeclaredFailures: true,
      result: "AUTOMATED_PASS_WITH_NOTES",
    });
    expect(
      summariseCaptures([...clean.slice(0, 18), ...expectedDenials]),
    ).toMatchObject({
      completeWithExpectedDenialNotes: true,
      completeWithExpectedNotes: false,
      zeroUndeclaredFailures: false,
      result: "AUTOMATED_FAIL",
    });
    const dualTagged = Array.from({ length: 2 }, () => ({
      verdict: "AUTOMATED_PASS_WITH_NOTES",
      statusTruthEvidence: { ...denialEvidence },
      partnerAbsenceEvidence: { ...partnerAbsenceEvidence },
    }));
    const unrelatedNotes = Array.from({ length: 2 }, () => ({
      verdict: "AUTOMATED_PASS_WITH_NOTES",
    }));
    expect(
      summariseCaptures([...clean.slice(0, 16), ...dualTagged, ...unrelatedNotes]),
    ).toMatchObject({
      unclassifiedPassWithNotes: 4,
      zeroUndeclaredFailures: false,
      result: "AUTOMATED_FAIL",
    });
    expect(
      summariseCaptures([
        ...clean.slice(0, 16),
        ...expectedDenials,
        expectedPartnerAbsences[0],
        {
          ...expectedPartnerAbsences[1],
          partnerAbsenceEvidence: {
            ...partnerAbsenceEvidence,
            endpoint: "/api/research/partner/dashboard",
          },
        },
      ]),
    ).toMatchObject({
      declaredPartnerAbsencePassWithNotes: 1,
      unclassifiedPassWithNotes: 1,
      zeroUndeclaredFailures: false,
      result: "AUTOMATED_FAIL",
    });
    expect(summariseCaptures(clean.slice(0, 19))).toMatchObject({
      expectedCaptureCountMatched: false,
      result: "AUTOMATED_FAIL",
    });
  });

  it("evaluates route location and semantic state instead of hard-coding their PASS results", () => {
    const descriptor = SYNTHETIC_CAPTURE_CASES.catalog;
    const passing = evaluateSyntheticRouteStateContract(descriptor, {
      path: descriptor.expectedPath,
      bodyText: "Full catalog Showing 3 of 6 offerings",
      selectorPresence: {
        main: true,
        h1: true,
        "[data-testid='mo-skeleton']": false,
        "[role='alert']": false,
      },
    });
    expect(passing.map(({ result }) => result)).toEqual(["PASS", "PASS"]);

    const failing = evaluateSyntheticRouteStateContract(descriptor, {
      path: "/wrong",
      bodyText: "Unable to load the catalog",
      selectorPresence: {
        main: false,
        h1: false,
        "[data-testid='mo-skeleton']": true,
        "[role='alert']": true,
      },
    });
    expect(failing.map(({ result }) => result)).toEqual(["FAIL", "FAIL"]);
  });

  it("requires every browser, semantic, and synthetic assertion exactly once", () => {
    const ids = [
      "EXPECTED_SYNTHETIC_VIEW",
      "LOCAL_ORIGIN_NETWORK_BOUNDARY",
      "EXTERNAL_MUTATIONS",
      ...ASSERTION_IDS,
      "ROUTE_LOCATION",
      "ROUTE_STATE_CONTRACT",
    ];
    const assertions = ids.map((id) => ({ id, result: "PASS", detail: "fixture" }));
    expect(() => assertSyntheticAssertionSchema(assertions)).not.toThrow();
    expect(() =>
      assertSyntheticAssertionSchema([
        ...assertions,
        { id: "EXTERNAL_MUTATIONS", result: "PASS", detail: "duplicate" },
      ])
    ).toThrow(/assertion count|exactly once/u);
    expect(() =>
      assertSyntheticAssertionSchema(
        assertions.map((assertion) =>
          assertion.id === "ROUTE_STATE_CONTRACT"
            ? { ...assertion, result: "FAIL" }
            : assertion,
        ),
      )
    ).toThrow(/ROUTE_STATE_CONTRACT=PASS/u);
  });

  it("predeclares the exact forged-reference denial without exposing it after sanitization", () => {
    const declaration = forgedStatusFailureDeclaration("http://127.0.0.1:5219");
    expect(declaration).toMatchObject({
      method: "GET",
      status: 404,
      count: 1,
      consoleText:
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
    });
    expect(declaration.responseBodySha256).toMatch(/^[a-f0-9]{64}$/u);
    expect(sanitizeEvidenceText(declaration.url)).not.toMatch(/XRR-\d{8}-[A-F0-9]{10}/u);
  });

  it("predeclares only the empty persona's exact no-partner response", () => {
    const declaration = emptyPersonaPartnerFailureDeclaration(
      "http://127.0.0.1:5218",
    );
    expect(declaration).toEqual({
      url: "http://127.0.0.1:5218/api/research/partner/me",
      method: "GET",
      status: 404,
      count: 1,
      responseBodySha256:
        "87d28f7ea8ea041e07906726a8d93d61da18844f7fdc7dee8ea804c143c51876",
      consoleText:
        "Failed to load resource: the server responded with a status of 404 (Not Found)",
    });
    expect(Object.isFrozen(declaration)).toBe(true);
  });

  it("builds an exact forty-file candidate-bound inventory", () => {
    const captures = Array.from({ length: 20 }, (_, index) => ({
      artifactPath: `synthetic/captures/${index}.png`,
      artifactBytes: index + 1,
      artifactSha256: String(index).padStart(64, "a").slice(-64),
      textArtifactPath: `synthetic/captures/${index}.text.txt`,
      textArtifactBytes: index + 2,
      textArtifactSha256: String(index).padStart(64, "b").slice(-64),
    }));
    const inventory = buildArtifactInventory(captures, "c".repeat(40));
    expect(inventory.fileCount).toBe(40);
    expect(inventory.files).toHaveLength(40);
    expect(inventory.files.every((file) => file.candidateSha === "c".repeat(40))).toBe(true);
  });

  it("installs a fail-closed WebSocket constructor with only declared HMR origins", () => {
    const source = webSocketBoundarySource(new Set(["ws://127.0.0.1:5201"]));
    expect(source).toContain("ws://127.0.0.1:5201");
    expect(source).toContain("xeniosEvidenceBlockedWebSocket");
    expect(source).toContain("SecurityError");
    expect(source).not.toContain("wss://");
  });

  it("blocks every external HTTP(S)/WS(S) request with no font exception", () => {
    const policy = {
      allowedOrigins: new Set(["http://127.0.0.1:5201"]),
      allowedWebSocketOrigins: new Set(["ws://127.0.0.1:5201"]),
    };
    expect(classifyBrowserBoundaryRequest("http://127.0.0.1:5201/app.js", policy))
      .toBe("continue");
    expect(classifyBrowserBoundaryRequest("ws://127.0.0.1:5201/hmr", policy))
      .toBe("continue");
    for (const external of [
      "https://fonts.googleapis.com/css2?family=Inter",
      "https://fonts.gstatic.com/font.woff2",
      "https://example.com/collector.js",
      "wss://example.com/socket",
      "ftp://example.com/file",
    ]) {
      expect(classifyBrowserBoundaryRequest(external, policy), external).toBe("block");
    }
    expect(classifyBrowserBoundaryRequest("data:,local", policy)).toBe("continue");
  });
});
