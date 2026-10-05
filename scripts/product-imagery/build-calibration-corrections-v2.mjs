import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hashBytes, measureImage, assertProspectiveFraming, MEASUREMENT_SCRIPT } from "./framing-receipt.mjs";
import { extractC2paStructural } from "./extract-c2pa-provenance.mjs";
import { assertFrozenCalibrationManifest, CALIBRATION_AUTHORIZATION } from "./prepare-execution-sprint.mjs";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const DIRECTORY = "docs/product-imagery/evidence/calibration-corrections-v2";
export const REGISTRY = `${DIRECTORY}/attempts.json`;
export const STUDIES = ["calibration-03-topical", "calibration-04-care-state", "calibration-05-restrictive-state"];
export const AUTHORITY = Object.freeze({ independentAcceptance: false, publicationAuthorization: false,
  runtimeIntegrationAuthorization: false, commerceAuthority: false, productControlApproval: false,
  previewUpdateAuthorization: false, batch1RenderAuthorization: false, productionUseAuthorization: false });
const read = (p) => readFileSync(resolve(ROOT, p));
const json = (p) => JSON.parse(read(p));
const localImage = (p) => {
  assert.match(p, /^docs\/product-imagery\/evidence\/[a-zA-Z0-9_./-]+\.png$/);
  assert.ok(!p.split("/").includes(".."), "image path traversal");
  return resolve(ROOT, p);
};

export function validateRegistry(registry) {
  assert.deepEqual(Object.keys(registry).sort(), ["schemaVersion", "kind", "authorizationCommit",
    "preparedSourceCommit", "attemptLimitPerStudy", "attempts"].sort(), "unexpected registry authority or fields");
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.kind, "private_calibration_correction_attempt_registry");
  assert.equal(registry.authorizationCommit, CALIBRATION_AUTHORIZATION);
  assert.equal(registry.preparedSourceCommit, "eee7abe7c68f2aa382f8a49118f5239b671cdc2c");
  assert.equal(registry.attemptLimitPerStudy, 3);
  assert.ok(Array.isArray(registry.attempts) && registry.attempts.length > 0);
  const ids = new Set(), paths = new Set(), selected = new Set();
  for (const a of registry.attempts) {
    assert.deepEqual(Object.keys(a).sort(), ["id", "studyId", "attempt", "repositoryPath", "sha256",
      "generatorOutputPath", "toolRequestedAtUtc", "tool", "prompt", "referencedImages", "selectedCandidate"].sort(),
    "unexpected attempt authority or fields");
    assert.ok(STUDIES.includes(a.studyId), "unauthorized study");
    assert.ok(Number.isInteger(a.attempt) && a.attempt >= 1 && a.attempt <= 3, "attempt limit");
    const number = a.studyId.slice(12, 14);
    assert.equal(a.id, `study-${number}-attempt-${String(a.attempt).padStart(2, "0")}`);
    assert.ok(!ids.has(a.id) && !paths.has(a.repositoryPath), "duplicate attempt");
    ids.add(a.id); paths.add(a.repositoryPath);
    assert.ok(a.repositoryPath.startsWith(`${DIRECTORY}/`)); localImage(a.repositoryPath);
    assert.match(a.sha256, /^[a-f0-9]{64}$/);
    assert.equal(a.tool, "image_gen");
    assert.match(a.toolRequestedAtUtc, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} UTC$/);
    assert.ok(typeof a.prompt === "string" && a.prompt.length > 100);
    assert.equal(typeof a.selectedCandidate, "boolean");
    if (a.selectedCandidate) { assert.ok(!selected.has(a.studyId), "multiple selected candidates"); selected.add(a.studyId); }
    assert.equal(a.referencedImages.length, a.attempt === 1 ? 3 : 1);
    for (const ref of a.referencedImages) {
      assert.deepEqual(Object.keys(ref).sort(), ["repositoryPath", "sha256"]);
      localImage(ref.repositoryPath); assert.match(ref.sha256, /^[a-f0-9]{64}$/);
    }
  }
  // Edits must reference the exact prior attempt, not a different study's image.
  for (const a of registry.attempts.filter((a) => a.attempt > 1)) {
    const parent = registry.attempts.find((p) => p.studyId === a.studyId && p.attempt === a.attempt - 1);
    assert.ok(parent, "missing prior attempt");
    assert.deepEqual(a.referencedImages, [{ repositoryPath: parent.repositoryPath, sha256: parent.sha256 }]);
  }
  return true;
}

export function validateSelection(attempt, measurement, dimensions) {
  assert.equal(measurement.input.contentSha256, attempt.sha256);
  if (attempt.selectedCandidate) assertProspectiveFraming(measurement, { contentSha256: attempt.sha256, ...dimensions });
  return attempt.selectedCandidate ? "framing_pass_pending_independent_review" :
    measurement.gate.passed ? "framing_pass_not_selected" : "rejected_by_framing_gate";
}

export function buildCorrections(registry = json(REGISTRY)) {
  validateRegistry(registry);
  const prompts = ["calibration-corrections-v2.json", "calibration-corrections-v2-followups.json",
    "calibration-corrections-v2-final-attempts.json"].map((name) => json(`docs/product-imagery/prompts/${name}`));
  const originalManifest = json("docs/product-imagery/manifests/global-art-direction-calibration.json");
  assertFrozenCalibrationManifest(originalManifest);
  for (const original of originalManifest.assets) assert.equal(hashBytes(read(original.repositoryPath)), original.outputSha256);
  const originalAssets = STUDIES.map((id) => originalManifest.assets.find((a) => a.id === id));
  const observations = registry.attempts.map((attempt) => {
    const promptJob = prompts[attempt.attempt - 1].jobs.find((j) => (j.studyId ?? j.id) === attempt.studyId);
    assert.ok(promptJob, "missing frozen prompt");
    assert.equal(attempt.prompt, attempt.attempt === 1
      ? `${promptJob.referenceImageRoles.join("\n")}\n${promptJob.prompt}` : promptJob.prompt, "frozen prompt drift");
    const bytes = read(attempt.repositoryPath);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(hashBytes(bytes), attempt.sha256, "candidate bytes changed");
    for (const ref of attempt.referencedImages) assert.equal(hashBytes(read(ref.repositoryPath)), ref.sha256, "reference bytes changed");
    if (attempt.attempt === 1) {
      const original = originalAssets.find((a) => a.id === attempt.studyId);
      const expected = [original, originalManifest.assets.find((a) => a.id === "calibration-01-vial"),
        originalManifest.assets.find((a) => a.id === "calibration-02-bottle")];
      assert.deepEqual(attempt.referencedImages, expected.map((a) => ({ repositoryPath: a.repositoryPath, sha256: a.outputSha256 })));
    }
    const dimensions = { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
    const measurement = measureImage(attempt.repositoryPath);
    const status = validateSelection(attempt, measurement, dimensions);
    let provenance;
    try {
      const structural = extractC2paStructural(localImage(attempt.repositoryPath));
      assert.equal(structural.sha256, attempt.sha256);
      provenance = { status: "structural_metadata_extracted_only", ...structural,
        cryptographicSignatureValidated: false, trustChainValidated: false, officialValidatorRun: false };
    } catch (error) {
      provenance = { status: "structural_extraction_unavailable", reason: error.message,
        cryptographicSignatureValidated: false, trustChainValidated: false, officialValidatorRun: false };
    }
    return { ...attempt, byteSize: bytes.length, dimensions, promptSha256: hashBytes(Buffer.from(attempt.prompt)),
      sourcePixelsUnmodified: true, illustrativeOnly: true, exactPackagingClaim: false, status,
      framingPath: `${DIRECTORY}/${attempt.id}-framing.json`, measurement, provenance, authority: { ...AUTHORITY } };
  });
  return { schemaVersion: 1, kind: "bounded_private_calibration_corrections_v2",
    authorizationCommit: CALIBRATION_AUTHORIZATION, preparedSourceCommit: registry.preparedSourceCommit,
    originalCalibrationSource: "aa4f31f9b650e68a7c7c2c749f00417d20607665",
    originalAssets: originalAssets.map((a) => ({ id: a.id, repositoryPath: a.repositoryPath, sha256: a.outputSha256 })),
    measurementScript: MEASUREMENT_SCRIPT, measurementScriptSha256: hashBytes(read(MEASUREMENT_SCRIPT)),
    registrySha256: hashBytes(Buffer.from(`${JSON.stringify(registry, null, 2)}\n`)),
    authority: { ...AUTHORITY }, attempts: observations,
    summary: { attempts: observations.length, selectedForIndependentReview: observations.filter((a) => a.selectedCandidate).map((a) => a.studyId),
      needsFurtherCorrection: STUDIES.filter((id) => !observations.some((a) => a.studyId === id && a.selectedCandidate)),
      batch1ProductRenders: 0, previewChanged: false, originalsChanged: false, publicAssetsAdded: 0 } };
}

const esc = (s) => String(s).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const imageUrl = (p) => relative(resolve(ROOT, DIRECTORY), resolve(ROOT, p)).replaceAll("\\", "/");
export function buildReviewHtml(manifest) {
  const figure = (p, label) => `<figure><img src="${esc(imageUrl(p))}" alt="${esc(label)}"><figcaption>${esc(label)}<br>Illustrative calibration study; not an exact product or approved asset.</figcaption></figure>`;
  const rows = manifest.originalAssets.map((original) => {
    const attempts = manifest.attempts.filter((a) => a.studyId === original.id);
    const shown = attempts.find((a) => a.selectedCandidate) ?? attempts.at(-1);
    const m = shown.measurement.measurements;
    return `<section data-study="${esc(original.id)}"><h2>${esc(original.id)}</h2><p>${esc(shown.status)}. Final attempt ${shown.attempt}; independent approval pending.</p><div class="comparison">${figure(original.repositoryPath, "Frozen original")}${figure(shown.repositoryPath, shown.selectedCandidate ? "Measured candidate for independent review" : "Latest failed attempt, NOT selected")}</div><p>Height ${(100*m.subjectHeight.normalized).toFixed(2)}%; top margin ${(100*m.topMargin.normalized).toFixed(2)}%; horizon ${(100*m.horizon.normalized).toFixed(2)}%.</p><p class="hash">SHA-256 ${esc(shown.sha256)}</p><p>${esc(shown.measurement.gate.failureCodes.join(", ") || "Numeric framing gate passed; this is not asset approval.")}</p><details><summary>All retained attempts</summary><ul>${attempts.map((a)=>`<li><a href="${esc(imageUrl(a.repositoryPath))}">${esc(a.id)}</a>: ${esc(a.status)}</li>`).join("")}</ul></details></section>`;
  }).join("\n");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>Private calibration correction evidence</title><link rel="stylesheet" href="review.css"></head><body><main><p class="eyebrow">PRIVATE / NOT PUBLISHED / NO COMMERCE AUTHORITY</p><h1>Calibration corrections 03 / 04 / 05</h1><p>${manifest.summary.selectedForIndependentReview.length} measured candidate(s); ${manifest.summary.needsFurtherCorrection.length} studies still need correction. ${manifest.summary.attempts} raw attempts retained. No Batch 1 product renders, no preview update, no Core wiring. Framing success is not independent acceptance.</p><p>Authorization ${CALIBRATION_AUTHORIZATION}; prepared source ${esc(manifest.preparedSourceCommit)}.</p>${rows}</main></body></html>\n`;
}
export const REVIEW_CSS = `*{box-sizing:border-box}body{margin:0;background:#f7f6f3;color:#252423;font:16px/1.5 system-ui,sans-serif}main{max-width:1120px;margin:auto;padding:32px 20px}h1{font-size:clamp(1.7rem,4vw,2.6rem);line-height:1.15}h2{font-size:1.3rem}p,li,figcaption{overflow-wrap:anywhere}.eyebrow{font-size:.8rem;letter-spacing:.08em}section{border-top:1px solid #bbb;padding:24px 0;margin-top:24px}.comparison{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:20px}figure{margin:0;min-width:0}img{display:block;width:100%;height:auto;aspect-ratio:1;object-fit:contain;object-position:center;background:#211e1c}figcaption{padding:10px 0;font-size:.85rem}.hash{font-family:monospace;font-size:.8rem}a{color:#493277}@media(max-width:600px){main{padding:20px 12px}.comparison{grid-template-columns:1fr;gap:12px}}\n`;

export function writeCorrections() {
  const manifest = buildCorrections();
  for (const a of manifest.attempts) writeFileSync(resolve(ROOT, a.framingPath), `${JSON.stringify(a.measurement, null, 2)}\n`);
  writeFileSync(resolve(ROOT, DIRECTORY, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  writeFileSync(resolve(ROOT, DIRECTORY, "review.html"), buildReviewHtml(manifest));
  writeFileSync(resolve(ROOT, DIRECTORY, "review.css"), REVIEW_CSS);
  return manifest;
}
if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) console.log(JSON.stringify(writeCorrections().summary, null, 2));
