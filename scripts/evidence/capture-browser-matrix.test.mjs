import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  bindReviewedAssertionNotes,
  compileExpectedHttpFailures,
  EVIDENCE_EXTERNAL_RESOURCE_SUBSTITUTIONS,
  EVIDENCE_PWA_DISMISSAL_SOURCE,
  evaluateMetadataRestoration,
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

  it.each([
    [{ ...exactFailure, path: "https://example.com/api/care/appointments" }],
    [{ ...exactFailure, path: "/care/appointments" }],
    [{ ...exactFailure, method: "POST" }],
    [{ ...exactFailure, status: 200 }],
    [{ ...exactFailure, count: 0 }],
    [{ ...exactFailure, responseBodySha256: "not-a-hash" }],
    [{ ...exactFailure, productionEvidence: "" }],
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
    )).toThrow(/unique method \+ URL/u);
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
  it("uses a content-bound safe identifier instead of an operator-local absolute path", () => {
    const descriptor = routeInventoryDescriptor(
      "C:\\Users\\operator\\private-checkout\\custom-routes.json",
      '{"routes":[]}',
    );
    expect(descriptor).toMatchObject({
      id: "custom/custom-routes.json",
      sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });
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
