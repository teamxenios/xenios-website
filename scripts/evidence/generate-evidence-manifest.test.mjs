import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { buildManifest } from "./generate-evidence-manifest.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const template = JSON.parse(readFileSync(join(here, "evidence-manifest.template.json"), "utf8"));
const SHA = "77d3f69f3966e76bb733165ee9c7732ccc78730d";

const run = (over = {}) => ({
  candidateSha: SHA,
  artifactPath: "captures/research-home--default--chromium--1440--01.png",
  route: "/research",
  surface: "public-research-homepage",
  state: "default",
  browserName: "chromium",
  browserVersion: "149.0.7827.55",
  widthCssPx: 1440,
  zoomPercent: 100,
  colorScheme: "light",
  mediaVariant: "default",
  syntheticFixtureId: "none",
  timestampUtc: "2026-08-28T20:00:00.000Z",
  reviewer: "automated",
  consoleResult: "CLEAN",
  networkResult: "CLEAN",
  piiPhiReview: "MANUAL_PENDING",
  assertions: [{ id: "TARGETS_44x44", result: "PASS", detail: "none" }, { id: "NO_HORIZONTAL_OVERFLOW", result: "PASS", detail: "" }],
  verdict: "AUTOMATED_PASS",
  runFile: "runs/001.json",
  ...over,
});

const matrix = (runs) => ({
  candidateSha: SHA,
  baseUrl: "http://127.0.0.1:5184",
  tool: { browserName: "chromium", browserVersion: "149.0.7827.55" },
  zoomEquivalents: [{ label: "200pct", widthCssPx: 720, deviceScaleFactor: 2, zoomPercent: 200 }],
  runs,
  metadataRestoration: [{ public: "/research/about", private: "/research/account", result: "PASS" }],
  summary: { runs: runs.length, automatedFail: runs.filter((r) => r.verdict === "AUTOMATED_FAIL").length, failingAssertionIds: [] },
});

describe("buildManifest", () => {
  it("keeps schemaVersion 2 and every capture carries the packet's required fields", () => {
    const m = buildManifest({ template, matrix: matrix([run()]), http: null, pii: null, sha: SHA, reviewer: "lead", artifactRoot: "docs/review/xenios-research-full-site-20260828/browser" });
    expect(m.schemaVersion).toBe(2);
    expect(m.candidate.sha).toBe(SHA);
    for (const field of template.captureSchema.requiredFields) expect(m.captures[0]).toHaveProperty(field);
    for (const field of template.browserRunSchema.requiredFields) expect(m.browserMatrix.runs[0]).toHaveProperty(field);
    expect(m.captures[0].artifactPath.startsWith(template.captureSchema.artifactPathMustBeUnder)).toBe(true);
    expect(m.captures[0].reviewer).toBe("lead");
  });

  it("never sets a final verdict or readiness, even from an all-pass matrix", () => {
    const m = buildManifest({ template, matrix: matrix([run()]), http: null, pii: null, sha: SHA, artifactRoot: "x" });
    expect(m.finalVerdict).toBe("PENDING");
    expect(m.readyForSamuelDeployReview).toBe(false);
    expect(m.browserMatrix.result).toBe("AUTOMATED_PASS");
    expect(m.gates.accessibility.result).toBe("AUTOMATED_PASS_MANUAL_REVIEW_PENDING");
    expect(m.accessibilityEvidence.manualReview).toBe("PENDING");
    for (const lane of Object.values(m.lanes)) expect(lane.finalVerdict).toBe("PENDING");
  });

  it("flags a matrix captured on a different SHA than the manifest candidate", () => {
    const m = buildManifest({ template, matrix: matrix([run()]), http: null, pii: null, sha: "0000000", artifactRoot: "x" });
    expect(m.browserMatrix.result).toBe("SHA_MISMATCH");
    expect(m.browserMatrix.candidateShaMatchesManifest).toBe(false);
  });

  it("derives responsive and accessibility gate failures from run assertions", () => {
    const bad = run({ widthCssPx: 320, assertions: [{ id: "NO_HORIZONTAL_OVERFLOW", result: "FAIL", detail: "412 > 320" }], verdict: "AUTOMATED_FAIL" });
    const mx = matrix([run(), bad]);
    mx.summary.failingAssertionIds = ["NO_HORIZONTAL_OVERFLOW"];
    const m = buildManifest({ template, matrix: mx, http: null, pii: null, sha: SHA, artifactRoot: "x" });
    expect(m.gates.responsive.result).toBe("AUTOMATED_FAIL");
    expect(m.gates.responsive.failingRuns).toEqual(["/research@320/100%"]);
    expect(m.gates.accessibility.result).toBe("AUTOMATED_FAIL");
    expect(m.browserMatrix.widthsCoveredCssPx).toEqual([1440, 320]);
    expect(m.surfaceCoverage.find((s) => s.surface === "public-research-homepage").covered).toBe(true);
    expect(m.surfaceCoverage.find((s) => s.surface === "hino").covered).toBe(false);
  });

  it("merges HTTP head evidence into httpHeadEvidence and the seo gate", () => {
    const http = {
      candidateSha: SHA,
      baseUrl: "http://127.0.0.1:5184",
      tool: {},
      sitemap: { status: 200, count: 3 },
      summary: { records: 1, automatedFail: 1, failingAssertionIds: ["AUTHORITATIVE_404"] },
      records: [
        {
          candidateSha: SHA,
          route: "/nope",
          surface: "not-found-error",
          indexable: false,
          status: 200,
          headers: { "x-robots-tag": "noindex" },
          metadata: { title: "t", canonical: null, jsonLd: [] },
          assertions: [
            { id: "STATUS_CODE", result: "FAIL" },
            { id: "X_ROBOTS_TAG", result: "PASS" },
            { id: "RAW_HTML_TITLE", result: "PASS" },
            { id: "CANONICAL", result: "NOT_APPLICABLE" },
            { id: "OPEN_GRAPH", result: "NOT_APPLICABLE" },
            { id: "SITEMAP_PARITY", result: "PASS" },
            { id: "STRUCTURED_DATA_SCOPE", result: "PASS" },
            { id: "AUTHORITATIVE_404", result: "FAIL" },
          ],
          result: "AUTOMATED_FAIL",
        },
      ],
    };
    const m = buildManifest({ template, matrix: matrix([run()]), http, pii: { summary: { result: "CLEAN", total: 0, byId: {} }, screenshots: ["a.png"] }, sha: SHA, artifactRoot: "x" });
    expect(m.httpHeadEvidence.result).toBe("AUTOMATED_FAIL");
    expect(m.httpHeadEvidence.records[0].xRobotsTag).toBe("noindex");
    expect(m.gates.seo.authoritative404).toBe("AUTOMATED_FAIL");
    expect(m.gates.seo.serverXRobotsTag).toBe("AUTOMATED_PASS");
    expect(m.gates.seo.canonical).toBeUndefined();
    expect(m.gates.seo.publicToPrivateMetadataRestoration).toBe("AUTOMATED_PASS");
    expect(m.gates.evidencePiiScan).toMatchObject({ result: "AUTOMATED_CLEAN", screenshotsRequiringManualReview: 1 });
  });

  it("does not mutate the template", () => {
    const before = JSON.stringify(template);
    buildManifest({ template, matrix: matrix([run()]), http: null, pii: null, sha: SHA, artifactRoot: "x" });
    expect(JSON.stringify(template)).toBe(before);
  });
});
