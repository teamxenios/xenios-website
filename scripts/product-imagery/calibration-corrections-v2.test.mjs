import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildCorrections, buildReviewHtml, validateRegistry, validateSelection, AUTHORITY, DIRECTORY, REGISTRY, ROOT, REVIEW_CSS } from "./build-calibration-corrections-v2.mjs";
import { hashBytes } from "./framing-receipt.mjs";
const read = (p) => readFileSync(resolve(ROOT, p));
const registry = JSON.parse(read(REGISTRY));
const recorded = JSON.parse(read(`${DIRECTORY}/manifest.json`));
test("private correction artifacts reproduce exact bytes, prompts, measurements and closed authority", () => {
  const actual = buildCorrections();
  assert.deepEqual(actual, recorded);
  assert.deepEqual(actual.summary.selectedForIndependentReview, ["calibration-04-care-state"]);
  assert.deepEqual(actual.summary.needsFurtherCorrection, ["calibration-03-topical", "calibration-05-restrictive-state"]);
  assert.equal(actual.attempts.length, 9);
  assert.equal(actual.attempts.filter(a => a.measurement.gate.passed).length, 1);
  for (const a of actual.attempts) {
    assert.deepEqual(a.authority, AUTHORITY);
    assert.equal(hashBytes(read(a.repositoryPath)), a.sha256);
    assert.equal(hashBytes(Buffer.from(a.prompt)), a.promptSha256);
    assert.equal(a.provenance.officialValidatorRun, false);
    assert.equal(a.provenance.cryptographicSignatureValidated, false);
    assert.deepEqual(JSON.parse(read(a.framingPath)), a.measurement);
  }
});
test("registry rejects unauthorized studies, excess attempts, duplicate selection and changed reference ancestry", () => {
  for (const mutate of [
    r => r.attempts[0].studyId = "calibration-06-unverified-identity",
    r => r.attempts[0].attempt = 4,
    r => { r.attempts[0].selectedCandidate = true; r.attempts[1].selectedCandidate = true; },
    r => r.attempts[1].referencedImages[0].sha256 = "0".repeat(64),
    r => r.attempts[0].repositoryPath = `${DIRECTORY}/../escape.png`,
    r => r.authorizationCommit = "0".repeat(40),
    r => r.attempts[0].publicationAuthorization = true,
    r => r.runtimeIntegrationAuthorization = true,
  ]) { const r = structuredClone(registry); mutate(r); assert.throws(() => validateRegistry(r)); }
});
test("a failed or forged measurement can never select a correction", () => {
  const failed = recorded.attempts[0];
  assert.throws(() => validateSelection({ ...failed, selectedCandidate: true }, failed.measurement, failed.dimensions));
  const pass = recorded.attempts.find(a => a.selectedCandidate);
  const wrongHash = structuredClone(pass.measurement); wrongHash.input.contentSha256 = "0".repeat(64);
  assert.throws(() => validateSelection(pass, wrongHash, pass.dimensions));
  const extraAuthority = structuredClone(pass.measurement); extraAuthority.authority.runtimeIntegrationAuthorization = true;
  assert.throws(() => validateSelection(pass, extraAuthority, pass.dimensions));
  const fake = structuredClone(failed.measurement); fake.gate.passed = true; fake.gate.failureCodes = [];
  assert.throws(() => validateSelection({ ...failed, selectedCandidate: true }, fake, failed.dimensions));
});
test("candidate and reference byte drift fail closed without modifying an image", () => {
  const changed = structuredClone(registry); changed.attempts[0].sha256 = "0".repeat(64);
  changed.attempts[1].referencedImages[0].sha256 = "0".repeat(64);
  assert.throws(() => buildCorrections(changed), /candidate bytes changed/);
  const reference = structuredClone(registry); reference.attempts[0].referencedImages[0].sha256 = "0".repeat(64);
  assert.throws(() => buildCorrections(reference), /reference bytes changed/);
  const prompt = structuredClone(registry); prompt.attempts[0].prompt += " Changed.";
  assert.throws(() => buildCorrections(prompt), /frozen prompt drift/);
});
test("review contact sheet separates labels from unchanged contain-only source images", () => {
  const html = buildReviewHtml(recorded);
  assert.equal(html, read(`${DIRECTORY}/review.html`).toString());
  assert.equal(REVIEW_CSS, read(`${DIRECTORY}/review.css`).toString());
  assert.equal((html.match(/<img /g) ?? []).length, 6);
  assert.equal((html.match(/<figcaption>/g) ?? []).length, 6);
  assert.equal((html.match(/data-study=/g) ?? []).length, 3);
  assert.match(REVIEW_CSS, /object-fit:contain/);
  assert.doesNotMatch(REVIEW_CSS, /filter:|object-fit:cover|mix-blend/);
  assert.doesNotMatch(html, /<script|https?:\/\//);
  assert.match(html, /Latest failed attempt, NOT selected/);
});
