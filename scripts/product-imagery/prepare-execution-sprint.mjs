import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildFounderPreviewData } from "./build-founder-preview.mjs";
import { buildBatchOneManifest, LABEL_POLICY, FRAMING_POLICY } from "./batch-one-preparation.mjs";
import { hashBytes, measureImage, MEASUREMENT_SCRIPT } from "./framing-receipt.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const FROZEN_HANDOFF = "b3a60d2906c5e44eacd7f2150ec2c3c95dacc380";
const CALIBRATION_SOURCE = "aa4f31f9b650e68a7c7c2c749f00417d20607665";
export const CALIBRATION_AUTHORIZATION = "cd66f3c411e6164981295d81c2116e50343edc86";
const CALIBRATION_MANIFEST = "docs/product-imagery/manifests/global-art-direction-calibration.json";
const HISTORICAL_DECISIONS = new Map([
  ["calibration-01-vial", "acceptable"],
  ["calibration-02-bottle", "acceptable"],
  ["calibration-03-topical", "needs_change"],
  ["calibration-04-care-state", "needs_change"],
  ["calibration-05-restrictive-state", "needs_change"],
  ["calibration-06-unverified-identity", "acceptable"],
]);
export const PREP_OUTPUTS = [
  "docs/product-imagery/manifests/batch-001-prepared.json",
  "docs/product-imagery/manifests/imagery-preparation-gates.json",
  "docs/product-imagery/evidence/framing-preparation-2026-10-03.json",
];
const read = (path) => readFileSync(resolve(ROOT, path));
const json = (path) => JSON.parse(read(path));
const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 }).trim();

export function assertFrozenCalibrationManifest(calibration) {
  const frozen = JSON.parse(git("show", `${CALIBRATION_SOURCE}:${CALIBRATION_MANIFEST}`));
  assert.deepEqual(calibration, frozen, "calibration manifest must match the frozen source exactly");
  assert.equal(calibration.assets.length, HISTORICAL_DECISIONS.size);
  assert.equal(new Set(calibration.assets.map((asset) => asset.id)).size, HISTORICAL_DECISIONS.size);
  return true;
}

export function buildPreparation() {
  // Do not regenerate or mutate the approved preview while Core A/B/C is pending.
  const previewPaths = git("ls-tree", "-r", "--name-only", FROZEN_HANDOFF,
    "docs/product-imagery/founder-preview").split(/\r?\n/).filter(Boolean);
  assert.equal(git("diff", "--no-ext-diff", "--exit-code", FROZEN_HANDOFF, "--",
    "docs/product-imagery/founder-preview"), "", "frozen preview changed");
  assert.equal(git("ls-files", "--others", "--exclude-standard", "--",
    "docs/product-imagery/founder-preview"), "", "unexpected preview files");
  const data = buildFounderPreviewData();
  const batch1 = buildBatchOneManifest(data.batch1);
  const calibration = json(CALIBRATION_MANIFEST);
  assert.equal(git("hash-object", "--path", CALIBRATION_MANIFEST, CALIBRATION_MANIFEST),
    git("rev-parse", `${CALIBRATION_SOURCE}:${CALIBRATION_MANIFEST}`), "frozen calibration manifest blob changed");
  assertFrozenCalibrationManifest(calibration);
  const studies = calibration.assets.map((asset) => {
    const historicalDecision = HISTORICAL_DECISIONS.get(asset.id);
    assert.ok(historicalDecision, `unknown historical asset identity: ${asset.id}`);
    assert.equal(hashBytes(read(asset.repositoryPath)), asset.outputSha256, `original changed: ${asset.id}`);
    const measurement = measureImage(asset.repositoryPath);
    assert.equal(measurement.input.contentSha256, asset.outputSha256);
    return {
      id: asset.id, repositoryPath: asset.repositoryPath, contentSha256: asset.outputSha256,
      historicalClaudeDecision: historicalDecision,
      historicalReviewCommit: "96e06765dbec9063a7311f128d0ab8accf8588b5",
      rerenderRequestedByReview: historicalDecision === "needs_change",
      rerenderAuthorized: historicalDecision === "needs_change",
      rerenderAuthorizationCommit: CALIBRATION_AUTHORIZATION, measurement,
      reviewInterpretation: asset.id === "calibration-06-unverified-identity"
        ? "Historical visual ACCEPTABLE is preserved; prospective numeric framing fails. No new rerender scope or approval inferred."
        : "Prospective measurement is separate from historical visual review and never grants exact-asset or publication approval.",
    };
  });
  const evidence = {
    schemaVersion: 1, kind: "read_only_frozen_calibration_framing_observation",
    sourceCalibrationCommit: CALIBRATION_SOURCE,
    sourceCalibrationTree: "354ddc3aff94de3307dfd09df03dde87066799ea",
    measurementScript: MEASUREMENT_SCRIPT, measurementScriptSha256: hashBytes(read(MEASUREMENT_SCRIPT)),
    prospectiveReceiptVerifier: "scripts/product-imagery/framing-receipt.mjs",
    prospectiveReceiptVerifierSha256: hashBytes(read("scripts/product-imagery/framing-receipt.mjs")),
    policy: FRAMING_POLICY, studies,
    renderPerformed: false, imagesChanged: false, publicApproval: false,
  };
  const gates = {
    schemaVersion: 1, kind: "execution_sprint_v2_imagery_preparation_only",
    frozenPreview: { handoff: FROZEN_HANDOFF, source: "e9ebc7b7df44a8921dd4b64100590da51310ba9a",
      sourceTree: "e9a7a5c5697bc9cdf85a69dd5b6fdb0f483f8fca", pathsVerifiedUnchanged: previewPaths.length,
      updateGate: "Accepted exact Core A/B/C successor required before private preview refresh." },
    observedDesignApproval: { commit: "a4e647eb69959eb91fc05dde8f211342d692b04c",
      fidelityVerdictCommit: "316ca72c95262675dffef6aa4d858ae9c533605e", decisions: ["A", "B", "C", "D", "E"],
      canonicalDecisionFilesModified: false, constitutesAssetOrRuntimeApproval: false },
    observedCoreCoordination: "3eaa017fcbd28989c65ffc4bb439a554aa1f3f59",
    observedCoreRuntime: "c0e25c73a0d789829ea213e2ee040c68e06f0a75",
    candidateCount: batch1.count, labelPolicy: LABEL_POLICY,
    framingEvidencePath: PREP_OUTPUTS[2],
    calibrationCorrectionScope: ["calibration-03-topical", "calibration-04-care-state", "calibration-05-restrictive-state"],
    calibrationRerenderAuthorization: true,
    calibrationRerenderAuthorizationCommit: CALIBRATION_AUTHORIZATION,
    authorizationScope: "Private correction studies 03, 04 and 05 only; no Batch 1, publication, Core wiring or production use.",
    batch1RenderAuthorization: false,
    publicationAuthorization: false, runtimeIntegrationAuthorization: false,
    productControlApproval: false, managedSqlAuthorization: false, deploymentAuthorization: false,
    coreHl11Acceptance: false, mediaCommerceAcceptance: false, coreAbcAcceptance: false,
    status: "PREPARATION_COMPLETE_THREE_PRIVATE_CALIBRATION_CORRECTIONS_AUTHORIZED",
    batch1Readiness: "NOT_READY",
    nextGate: "Render only private calibration 03/04/05 under cd66f3c, then require framing and independent exact-asset review. No Batch 1 product rendering inferred.",
  };
  return { batch1, gates, evidence };
}

export function writePreparation() {
  const result = buildPreparation();
  // Deliberately no call to writeFounderPreviewArtifacts or any renderer.
  for (const [index, value] of [result.batch1, result.gates, result.evidence].entries())
    writeFileSync(resolve(ROOT, PREP_OUTPUTS[index]), `${JSON.stringify(value, null, 2)}\n`);
  return result;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const { batch1, evidence } = writePreparation();
  console.log(JSON.stringify({ candidates: batch1.count, measuredOriginals: evidence.studies.length,
    framingPassed: evidence.studies.filter((s) => s.measurement.gate.passed).map((s) => s.id),
    renderAuthorized: false, previewChanged: false, outputs: PREP_OUTPUTS }, null, 2));
}
