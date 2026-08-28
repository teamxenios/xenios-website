#!/usr/bin/env node
// Evidence manifest generator (schemaVersion 2, same shape as the draft packet's
// docs/review/xenios-research-full-site-20260828/evidence-manifest.json).
//
//   node scripts/evidence/generate-evidence-manifest.mjs --out-dir <dir> [--template <existing-manifest.json>]
//        [--sha <sha>] [--reviewer <name>] [--artifact-root docs/review/xenios-research-full-site-20260828/browser]
//        [--output <path>]
//
// Reads browser-matrix.json, http-evidence.json and pii-scan.json from --out-dir
// (whichever exist) and merges them into the template: candidate SHA, tool
// versions, browserMatrix.runs, captures, httpHeadEvidence.records,
// accessibilityEvidence, and the accessibility / responsive / seo gates.
//
// It NEVER sets finalVerdict, readyForSamuelDeployReview or any lane verdict:
// gate results it writes are AUTOMATED_* values, distinct from a reviewer PASS.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateAccessibility } from "./lib/report.mjs";
import { gitSha } from "./capture-browser-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { template: join(here, "evidence-manifest.template.json"), reviewer: null, artifactRoot: "docs/review/xenios-research-full-site-20260828/browser" };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--out-dir") out.outDir = next();
    else if (a === "--template") out.template = next();
    else if (a === "--sha") out.sha = next();
    else if (a === "--reviewer") out.reviewer = next();
    else if (a === "--artifact-root") out.artifactRoot = next();
    else if (a === "--output") out.output = next();
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const readJson = (p) => (existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null);

/** Pure merge; exported for tests. */
export function buildManifest({ template, matrix, http, pii, sha, reviewer, artifactRoot, generatedAtUtc = new Date().toISOString() }) {
  const m = JSON.parse(JSON.stringify(template));
  m.schemaVersion = 2;
  m.candidate = { ...(m.candidate ?? {}), sha, nodeVersion: process.versions.node, frozenAt: m.candidate?.frozenAt ?? null, originVerified: m.candidate?.originVerified ?? "PENDING" };
  m.generated = { atUtc: generatedAtUtc, by: "scripts/evidence/generate-evidence-manifest.mjs", reviewer: reviewer ?? "automated", note: "Automated evidence merge. finalVerdict, lane verdicts and readiness are never set by this tool." };

  if (matrix) {
    const shaMismatch = matrix.candidateSha !== sha;
    const runs = matrix.runs.map((r) => ({
      candidateSha: r.candidateSha,
      route: r.route,
      surface: r.surface,
      state: r.state,
      browserName: r.browserName,
      browserVersion: r.browserVersion,
      widthCssPx: r.widthCssPx,
      zoomPercent: r.zoomPercent,
      colorScheme: r.colorScheme,
      mediaVariant: r.mediaVariant,
      syntheticFixtureId: r.syntheticFixtureId,
      assertions: r.assertions,
      timestampUtc: r.timestampUtc,
      reviewer: reviewer ?? r.reviewer,
      consoleResult: r.consoleResult,
      networkResult: r.networkResult,
      piiPhiReview: r.piiPhiReview,
      verdict: r.verdict,
      runFile: r.runFile,
    }));
    m.browserMatrix = {
      ...(m.browserMatrix ?? {}),
      result: shaMismatch ? "SHA_MISMATCH" : matrix.summary.automatedFail > 0 ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      candidateSha: matrix.candidateSha,
      candidateShaMatchesManifest: !shaMismatch,
      tool: matrix.tool,
      baseUrl: matrix.baseUrl,
      widthsCoveredCssPx: [...new Set(matrix.runs.map((r) => r.widthCssPx).filter((w) => matrix.runs.some((r) => r.widthCssPx === w && r.zoomPercent === 100)))].sort((a, b) => b - a),
      twoHundredPercentZoomEquivalent: matrix.zoomEquivalents?.[0] ?? null,
      browserVersions: [`${matrix.tool.browserName} ${matrix.tool.browserVersion}`],
      metadataRestoration: matrix.metadataRestoration ?? [],
      summary: matrix.summary,
      runs,
    };
    m.captures = matrix.runs
      .filter((r) => r.artifactPath)
      .map((r) => ({
        candidateSha: r.candidateSha,
        artifactPath: `${artifactRoot.replace(/\/$/, "")}/${r.artifactPath.replace(/^captures\//, "")}`,
        localPath: r.artifactPath,
        route: r.route,
        surface: r.surface,
        state: r.state,
        browserName: r.browserName,
        browserVersion: r.browserVersion,
        widthCssPx: r.widthCssPx,
        zoomPercent: r.zoomPercent,
        colorScheme: r.colorScheme,
        mediaVariant: r.mediaVariant,
        syntheticFixtureId: r.syntheticFixtureId,
        assertions: r.assertions.map((a) => `${a.id}=${a.result}`),
        timestampUtc: r.timestampUtc,
        reviewer: reviewer ?? r.reviewer,
        consoleResult: r.consoleResult,
        networkResult: r.networkResult,
        piiPhiReview: r.piiPhiReview,
      }));
    m.accessibilityEvidence = { ...(m.accessibilityEvidence ?? {}), ...aggregateAccessibility(matrix.runs) };
    const overflowFails = matrix.runs.filter((r) => r.assertions.some((a) => a.id === "NO_HORIZONTAL_OVERFLOW" && a.result === "FAIL"));
    m.gates = m.gates ?? {};
    m.gates.responsive = { result: overflowFails.length ? "AUTOMATED_FAIL" : "AUTOMATED_PASS", failingRuns: overflowFails.map((r) => `${r.route}@${r.widthCssPx}/${r.zoomPercent}%`), artifact: "browser-matrix.json" };
    m.gates.accessibility = { result: matrix.summary.automatedFail > 0 ? "AUTOMATED_FAIL" : "AUTOMATED_PASS_MANUAL_REVIEW_PENDING", failingAssertionIds: matrix.summary.failingAssertionIds, artifact: "browser-matrix.json", note: "Automated output alone is not an accessibility pass; manualReview remains PENDING." };
    const coveredSurfaces = new Set(matrix.runs.map((r) => r.surface));
    m.surfaceCoverage = (m.requiredSurfaces ?? []).map((s) => ({ surface: s, covered: coveredSurfaces.has(s), states: [...new Set(matrix.runs.filter((r) => r.surface === s).map((r) => r.state))] }));
  }

  if (http) {
    const byId = (id) => {
      const seen = http.records.flatMap((r) => r.assertions.filter((a) => a.id === id && a.result !== "NOT_APPLICABLE"));
      if (seen.length === 0) return "NOT_APPLICABLE";
      if (seen.some((a) => a.result === "NOT_RUN")) return "PENDING";
      return seen.some((a) => a.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS";
    };
    m.httpHeadEvidence = {
      ...(m.httpHeadEvidence ?? {}),
      result: http.summary.automatedFail > 0 ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      candidateSha: http.candidateSha,
      baseUrl: http.baseUrl,
      tool: http.tool,
      sitemap: http.sitemap,
      records: http.records.map((r) => ({ candidateSha: r.candidateSha, route: r.route, surface: r.surface, indexable: r.indexable, status: r.status, xRobotsTag: r.headers?.["x-robots-tag"] ?? null, title: r.metadata?.title ?? null, canonical: r.metadata?.canonical ?? null, jsonLdTypes: (r.metadata?.jsonLd ?? []).map((j) => j.type), assertions: r.assertions, result: r.result, rawHtmlPath: r.rawHtmlPath, timestampUtc: r.timestampUtc })),
    };
    m.gates = m.gates ?? {};
    const restoration = matrix?.metadataRestoration ?? [];
    m.gates.seo = {
      ...(m.gates.seo ?? {}),
      result: http.summary.automatedFail > 0 || restoration.some((r) => r.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      actualPublicRouteComposition: "PENDING",
      serverXRobotsTag: byId("X_ROBOTS_TAG"),
      rawHtmlTitleCanonicalOpenGraph: [byId("RAW_HTML_TITLE"), byId("CANONICAL"), byId("OPEN_GRAPH")].includes("AUTOMATED_FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      sitemapParity: byId("SITEMAP_PARITY"),
      routeScopedStructuredData: byId("STRUCTURED_DATA_SCOPE"),
      authoritative404: byId("AUTHORITATIVE_404"),
      publicToPrivateMetadataRestoration: restoration.length === 0 ? "PENDING" : restoration.every((r) => r.result === "PASS") ? "AUTOMATED_PASS" : "AUTOMATED_FAIL",
      artifact: "http-evidence.json",
    };
  }

  if (pii) {
    m.gates = m.gates ?? {};
    m.gates.evidencePiiScan = { result: pii.summary.result === "CLEAN" ? "AUTOMATED_CLEAN" : "FINDINGS", findings: pii.summary.total, byId: pii.summary.byId, screenshotsRequiringManualReview: pii.screenshots?.length ?? 0, artifact: "pii-scan.json" };
  }

  // Guard: never let the generator flip these.
  m.finalVerdict = template.finalVerdict ?? "PENDING";
  m.readyForSamuelDeployReview = false;
  return m;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.outDir) {
    console.log("usage: generate-evidence-manifest.mjs --out-dir <dir> [--template <manifest.json>] [--sha <sha>] [--reviewer <name>] [--artifact-root <repo-relative dir>] [--output <path>]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  const template = readJson(resolve(args.template));
  if (!template) throw new Error(`template not found: ${args.template}`);
  const matrix = readJson(join(outDir, "browser-matrix.json"));
  const http = readJson(join(outDir, "http-evidence.json"));
  const pii = readJson(join(outDir, "pii-scan.json"));
  const sha = args.sha ?? matrix?.candidateSha ?? http?.candidateSha ?? gitSha() ?? "UNKNOWN";
  const manifest = buildManifest({ template, matrix, http, pii, sha, reviewer: args.reviewer, artifactRoot: args.artifactRoot });
  const output = resolve(args.output ?? join(outDir, "evidence-manifest.json"));
  writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`manifest -> ${output}\n  browserMatrix: ${manifest.browserMatrix?.result ?? "absent"} (${manifest.browserMatrix?.runs?.length ?? 0} runs)\n  httpHeadEvidence: ${manifest.httpHeadEvidence?.result ?? "absent"} (${manifest.httpHeadEvidence?.records?.length ?? 0} records)\n  evidencePiiScan: ${manifest.gates?.evidencePiiScan?.result ?? "absent"}\n  finalVerdict: ${manifest.finalVerdict}`);
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
