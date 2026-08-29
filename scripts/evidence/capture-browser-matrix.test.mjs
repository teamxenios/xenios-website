import { describe, expect, it } from "vitest";

import { bindReviewedAssertionNotes, compileExpectedHttpFailures, EVIDENCE_PWA_DISMISSAL_SOURCE } from "./capture-browser-matrix.mjs";

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
});
