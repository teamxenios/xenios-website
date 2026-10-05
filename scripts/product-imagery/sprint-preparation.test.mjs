import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertProspectiveFraming } from "./framing-receipt.mjs";
import { assertFrozenCalibrationManifest, buildPreparation, PREP_OUTPUTS } from "./prepare-execution-sprint.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const prepared = buildPreparation();

test("preparation artifacts are reproducible without refreshing the approved preview", () => {
  const values = [prepared.batch1, prepared.gates, prepared.evidence];
  for (const [index, path] of PREP_OUTPUTS.entries())
    assert.deepEqual(JSON.parse(readFileSync(resolve(ROOT, path), "utf8")), values[index]);
  assert.ok(prepared.gates.frozenPreview.pathsVerifiedUnchanged > 0);
  assert.ok(PREP_OUTPUTS.every((path) => !path.includes("/founder-preview/") && !path.startsWith("client/")));
});

test("framing observations retain historical review without promoting it to new authority", () => {
  const studies = prepared.evidence.studies;
  assert.equal(studies.length, 6);
  assert.deepEqual(studies.map((study) => study.historicalClaudeDecision),
    ["acceptable", "acceptable", "needs_change", "needs_change", "needs_change", "acceptable"]);
  assert.deepEqual(studies.filter((study) => study.rerenderRequestedByReview).map((study) => study.id),
    ["calibration-03-topical", "calibration-04-care-state", "calibration-05-restrictive-state"]);
  assert.ok(studies.every((study) => study.rerenderAuthorized === study.rerenderRequestedByReview));
  assert.equal(prepared.gates.calibrationRerenderAuthorization, true);
  assert.equal(prepared.gates.calibrationRerenderAuthorizationCommit, "cd66f3c411e6164981295d81c2116e50343edc86");
  assert.equal(studies[5].measurement.gate.passed, false);
  assert.match(studies[5].reviewInterpretation, /Historical visual ACCEPTABLE is preserved/);
  for (const flag of ["batch1RenderAuthorization", "publicationAuthorization",
    "runtimeIntegrationAuthorization", "productControlApproval", "managedSqlAuthorization", "deploymentAuthorization",
    "coreHl11Acceptance", "mediaCommerceAcceptance", "coreAbcAcceptance"])
    assert.equal(prepared.gates[flag], false);
  assert.equal(prepared.gates.observedDesignApproval.constitutesAssetOrRuntimeApproval, false);
});

test("historical review cannot be rebound through manifest reorder or substitution", () => {
  const calibration = JSON.parse(readFileSync(resolve(ROOT,
    "docs/product-imagery/manifests/global-art-direction-calibration.json"), "utf8"));
  assert.equal(assertFrozenCalibrationManifest(calibration), true);
  const reordered = structuredClone(calibration);
  reordered.assets.reverse();
  assert.throws(() => assertFrozenCalibrationManifest(reordered), /frozen source/);
  const substituted = structuredClone(calibration);
  substituted.assets[0].outputSha256 = "0".repeat(64);
  assert.throws(() => assertFrozenCalibrationManifest(substituted), /frozen source/);
});

test("future framing receipts fail closed on missing, failed, or mismatched measurements", () => {
  const studies = prepared.evidence.studies;
  for (const study of studies) {
    const receipt = study.measurement;
    const expected = { contentSha256: study.contentSha256,
      width: receipt.dimensions.width, height: receipt.dimensions.height };
    if (receipt.gate.passed) assert.equal(assertProspectiveFraming(receipt, expected), true);
    else assert.throws(() => assertProspectiveFraming(receipt, expected));
    assert.throws(() => assertProspectiveFraming(null, expected));
    assert.throws(() => assertProspectiveFraming({ ...receipt, measurements: null }, expected));
    assert.throws(() => assertProspectiveFraming(receipt, { ...expected, contentSha256: "0".repeat(64) }));
  }
  const failed = structuredClone(studies[2].measurement);
  failed.gate = { ...failed.gate, passed: true, failureCodes: [] };
  assert.throws(() => assertProspectiveFraming(failed, {
    contentSha256: studies[2].contentSha256, width: 1254, height: 1254,
  }), /subject height/);
  const extraAuthority = structuredClone(studies[0].measurement);
  extraAuthority.authority.runtimeIntegrationAuthorization = true;
  assert.throws(() => assertProspectiveFraming(extraAuthority, {
    contentSha256: studies[0].contentSha256, width: 1254, height: 1254,
  }), /exact closed schema/);
});
