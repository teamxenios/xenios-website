import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { addedLineSha256, GENERIC_CREDENTIAL_RULE, lfSha256, loadReviewedCredentialFixtures } from "./reviewed-credential-fixtures.mjs";
import { evaluateScannerResult } from "./verify-release-diff-scan.mjs";

const BASE = "a".repeat(40), SOURCE = "b".repeat(40), CANDIDATE = "c".repeat(40);
const FILE = "fixtures/local-session.js", REGISTRY = "reviewed.json", CONTEXT = "context.json";
const serialize = (value) => `${JSON.stringify(value, null, 2)}\n`;
const synthetic = ["synthetic", "local", "fixture", "value"].join("-");
const declaration = (value = synthetic) => `const ${"token"} = ${JSON.stringify(value)};`;

function fixture(lines = [declaration()], base = BASE, source = SOURCE, candidate = CANDIDATE) {
  const contents = `${lines.join("\n")}\n`;
  const findings = lines.map((line) => ({ file: FILE, addedLineSha256: addedLineSha256(line), demonstrablySyntheticLocal: true, explanation: "Benign local input for the static checker; no authentication consumer." }));
  const context = { schemaVersion: 1, reviewType: "STATIC_CONTEXT_DISPOSITION_ONLY", reviewedAt: "2026-09-07T23:00:00Z", productionBaseSha: base, candidateSha: source, repositoryRoot: "local", matchScope: "unit fixture", strictGateStatus: "FAIL_UNCHANGED", piiStatus: "unit fixture; no real PII", summary: { matches: lines.length, paths: 1, demonstrablySyntheticLocal: lines.length, unresolved: 0 }, limitations: ["Static unit fixture only."], findings };
  const counts = new Map(); for (const item of findings) counts.set(item.addedLineSha256, (counts.get(item.addedLineSha256) ?? 0) + 1);
  const registry = { schemaVersion: 1, rule: GENERIC_CREDENTIAL_RULE, productionBaseSha: base, reviewedSourceSha: source, independentReviewStatus: "ACCEPTED", contextReview: { path: CONTEXT, lfSha256: lfSha256(serialize(context)) }, files: [{ path: FILE, lfSha256: lfSha256(contents), matches: [...counts].map(([addedLineSha256, occurrences]) => ({ addedLineSha256, occurrences })) }] };
  const blobs = new Map([[`${source}:${FILE}`, contents], [`${candidate}:${FILE}`, contents]]);
  function refresh() { blobs.set(`${candidate}:${REGISTRY}`, serialize(registry)); blobs.set(`${candidate}:${CONTEXT}`, serialize(context)); }
  refresh();
  const options = { registryPath: REGISTRY, baseSha: base, candidateSha: candidate, readBlob: (sha, path) => { const value = blobs.get(`${sha}:${path}`); if (value === undefined) throw new Error("missing fixture"); return Buffer.from(value); }, isAncestor: (a, b) => (a === base && b === source) || (a === source && b === candidate) };
  return { lines, contents, context, registry, blobs, options, refresh, load: () => loadReviewedCredentialFixtures(options) };
}

test("only exact generic occurrences are consumed; identical-line multiplicity is retained", () => {
  const f = fixture([declaration(), declaration()]); const loaded = f.load();
  assert.equal(loaded.consume(FILE, f.lines[0], "GitHub token"), false);
  assert.equal(loaded.consume("different.js", f.lines[0], GENERIC_CREDENTIAL_RULE), false);
  assert.equal(loaded.consume(FILE, `${f.lines[0]} `, GENERIC_CREDENTIAL_RULE), false);
  assert.equal(loaded.consume(FILE, declaration(`${synthetic}-new`), GENERIC_CREDENTIAL_RULE), false);
  assert.equal(loaded.consume(FILE, f.lines[0], GENERIC_CREDENTIAL_RULE), true);
  assert.throws(() => loaded.finish(), /not all encountered/);
  assert.equal(loaded.consume(FILE, f.lines[1], GENERIC_CREDENTIAL_RULE), true);
  assert.equal(loaded.consume(FILE, f.lines[1], GENERIC_CREDENTIAL_RULE), false);
  loaded.finish(); assert.equal(loaded.reviewedMatchCount, 2);
});

test("LF file hashes are platform stable while added-line hashes remain exact", () => {
  assert.equal(lfSha256("a\r\nb\r\n"), lfSha256("a\nb\n"));
  assert.notEqual(addedLineSha256("a"), addedLineSha256("a "));
  const f = fixture(); f.blobs.set(`${CANDIDATE}:${FILE}`, f.contents.replaceAll("\n", "\r\n"));
  assert.doesNotThrow(() => f.load());
});

for (const [name, change, error] of [
  ["pending independent review", f => { f.registry.independentReviewStatus = "PENDING"; }, /independent review/],
  ["unknown rule", f => { f.registry.rule = "all credentials"; }, /rule/],
  ["unknown field", f => { f.registry.allowAllTests = true; }, /schema/],
  ["wrong base", f => { f.registry.productionBaseSha = "d".repeat(40); }, /base/],
  ["invalid digest", f => { f.registry.files[0].lfSha256 = "invalid"; }, /digest/],
  ["unsafe path", f => { f.registry.files[0].path = "../outside.js"; }, /path/],
  ["duplicate path", f => { f.registry.files.push(structuredClone(f.registry.files[0])); }, /duplicate file/],
  ["duplicate match", f => { f.registry.files[0].matches.push(structuredClone(f.registry.files[0].matches[0])); }, /duplicate match/],
  ["zero occurrence", f => { f.registry.files[0].matches[0].occurrences = 0; }, /occurrence/],
  ["extra occurrence", f => { f.registry.files[0].matches[0].occurrences++; }, /exactly cover/],
  ["context digest drift", f => { f.context.matchScope = "changed"; }, /context review digest/],
  ["unresolved context", f => { f.context.findings[0].demonstrablySyntheticLocal = false; f.registry.contextReview.lfSha256 = lfSha256(serialize(f.context)); }, /unresolved/],
  ["context added-line drift", f => { f.context.findings[0].addedLineSha256 = "e".repeat(64); f.registry.contextReview.lfSha256 = lfSha256(serialize(f.context)); }, /exactly cover/],
  ["context summary drift", f => { f.context.summary.matches++; f.registry.contextReview.lfSha256 = lfSha256(serialize(f.context)); }, /metadata/],
]) test(`rejects ${name}`, () => { const f = fixture(); change(f); f.refresh(); assert.throws(() => f.load(), error); });

for (const [name, change, error] of [
  ["candidate context-only file drift", f => f.blobs.set(`${CANDIDATE}:${FILE}`, `${f.contents}// changed context\n`), /content has drifted/],
  ["candidate new literal", f => f.blobs.set(`${CANDIDATE}:${FILE}`, `${declaration(`${synthetic}-new`)}\n`), /content has drifted/],
  ["reviewed source drift", f => f.blobs.set(`${SOURCE}:${FILE}`, "different\n"), /content has drifted/],
  ["missing Git blob", f => f.blobs.delete(`${CANDIDATE}:${FILE}`), /Git blob/],
  ["missing source ancestry", f => { f.options.isAncestor = () => false; }, /ancestry/],
  ["malformed JSON", f => f.blobs.set(`${CANDIDATE}:${REGISTRY}`, "{"), /JSON/],
  ["duplicate JSON keys", f => f.blobs.set(`${CANDIDATE}:${REGISTRY}`, serialize(f.registry).replace('  "schemaVersion": 1,', '  "schemaVersion": 1,\n  "schemaVersion": 1,')), /canonical/],
  ["absolute opt-in path", f => { f.options.registryPath = "/outside/reviewed.json"; }, /path/],
]) test(`rejects ${name}`, () => { const f = fixture(); change(f); assert.throws(() => f.load(), error); });

test("strict wrapper still refuses missing PII even after reviewed generic dispositions", () => {
  const result = evaluateScannerResult({ status: 0, stdout: "raw secret findings: 1\nreviewed fixture findings: 1\nunresolved secret findings: 0\nsecret findings: 0\npii scan: SKIPPED\n", stderr: "" });
  assert.equal(result.exitCode, 1);
});

// Exercise the existing scanner's actual detectors, not duplicated test regexes.
// Markers are inert generated strings in a disposable Git repository; no API,
// credential, account, application fixture or network action is invoked.
test("actual scanner keeps every key-shape detector and PII active on a reviewed generic line", async (t) => {
  const tempParent = realpathSync(tmpdir()); const tempRoot = mkdtempSync(join(tempParent, "xenios-reviewed-fixtures-"));
  const repo = join(tempRoot, "repo"); mkdirSync(repo);
  const git = (...args) => execFileSync("git", ["-c", "core.autocrlf=false", "-c", "user.name=Local Fixture", "-c", "user.email=fixture@example.invalid", ...args], { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const scanner = fileURLToPath(new URL("./scan-release-diff.mjs", import.meta.url));
  const wrapper = fileURLToPath(new URL("./verify-release-diff-scan.mjs", import.meta.url));
  const run = (base, candidate, optIn, names) => {
    const env = { ...process.env }; delete env.XENIOS_RELEASE_REVIEWED_FIXTURES_FILE;
    if (optIn) env.XENIOS_RELEASE_REVIEWED_FIXTURES_FILE = REGISTRY;
    return spawnSync(process.execPath, [scanner, base, candidate, ...(names ? ["--names-file", names] : [])], { cwd: repo, env, encoding: "utf8" });
  };
  try {
    git("init", "-q"); writeFileSync(join(repo, "base.txt"), "local fixture\n"); git("add", "."); git("commit", "-qm", "fixture base"); const base = git("rev-parse", "HEAD");
    const approvedLines = Array.from({ length: 102 }, (_, index) => `{ ${declaration(`${synthetic}-${index}`)} }`);
    mkdirSync(join(repo, "fixtures")); writeFileSync(join(repo, FILE), `${approvedLines.join("\n")}\n`); git("add", "."); git("commit", "-qm", "fixture source"); const source = git("rev-parse", "HEAD");
    const f = fixture(approvedLines, base, source); writeFileSync(join(repo, REGISTRY), serialize(f.registry)); writeFileSync(join(repo, CONTEXT), serialize(f.context)); git("add", "."); git("commit", "-qm", "fixture review"); const reviewed = git("rev-parse", "HEAD");
    let result = run(base, reviewed, false); assert.equal(result.status, 1); assert.match(result.stdout, /^secret findings: 102$/m);
    result = run(base, reviewed, true); assert.equal(result.status, 0);
    assert.match(result.stdout, /^raw secret findings: 102$/m); assert.match(result.stdout, /^reviewed fixture findings: 102$/m);
    assert.match(result.stdout, /^unresolved secret findings: 0$/m); assert.match(result.stdout, /^secret findings: 0$/m);
    assert.match(result.stdout, /pii scan: SKIPPED/);
    // A dirty working-tree registry cannot override the candidate's pinned blob.
    writeFileSync(join(repo, REGISTRY), "{}"); result = run(base, reviewed, true); assert.equal(result.status, 0);
    const unreviewedPath = "fixtures/unreviewed-session.js";
    await t.test("new unreviewed generic match blocks scanner and strict wrapper after all 102 approved occurrences", () => {
      writeFileSync(join(repo, unreviewedPath), `${declaration(`${synthetic}-unreviewed`)}\n`);
      git("add", unreviewedPath); git("commit", "-qm", "unreviewed benign fixture"); const withUnreviewed = git("rev-parse", "HEAD");
      const names = join(tempRoot, "negative-control-names.txt"); writeFileSync(names, "Synthetic Fixture Principal\n");
      const raw = run(base, withUnreviewed, true, names);
      const env = { ...process.env, XENIOS_RELEASE_REVIEWED_FIXTURES_FILE: REGISTRY, XENIOS_RELEASE_PRODUCTION_BASE_SHA: base, XENIOS_RELEASE_CANDIDATE_SHA: withUnreviewed, XENIOS_RELEASE_PII_NAMES_FILE: names };
      const gated = spawnSync(process.execPath, [wrapper, "--production-base-sha", base, "--candidate-sha", withUnreviewed, "--pii-names-file", names], { cwd: repo, env, encoding: "utf8" });
      for (const checked of [raw, gated]) {
        assert.equal(checked.status, 1);
        assert.match(checked.stdout, /^raw secret findings: 103$/m);
        assert.match(checked.stdout, /^reviewed fixture findings: 102$/m);
        assert.match(checked.stdout, /^unresolved secret findings: 1$/m);
        assert.match(checked.stdout, /^secret findings: 1$/m);
        assert.match(checked.stdout, /^pii findings: 0$/m);
        assert.ok(checked.stdout.includes(`SECRET ${GENERIC_CREDENTIAL_RULE} in ${unreviewedPath}`));
        assert.equal(checked.stderr, "");
      }
    });
    writeFileSync(join(repo, unreviewedPath), "// Completed local refusal fixture.\n");
    const markers = [
      ["private key block", ["-----BEGIN", "PRIVATE KEY-----"].join(" ")],
      ["AWS access key id", "AK" + "IA" + "0".repeat(16)],
      ["GitHub token", "gh" + "p_" + "x".repeat(36)],
      ["Stripe live secret", "sk" + "_live_" + "x".repeat(16)],
      ["Stripe restricted key", "rk" + "_live_" + "x".repeat(16)],
      ["Supabase service key shape", "ey" + "J" + "x".repeat(40) + "." + "x".repeat(40) + "." + "x".repeat(20)],
      ["connection string with credentials", ["postgres", "://", "fixture", ":", "unused", "@fixture.invalid/db"].join("")],
      ["slack token", "xox" + "b-" + "x".repeat(10)],
      ["resend key", "r" + "e_" + "x".repeat(20)],
    ];
    const lines = markers.map(([, marker]) => `${declaration()} /* ${marker} */`);
    lines.push(`${declaration()} /* Synthetic Fixture Principal */`);
    writeFileSync(join(repo, FILE), `${lines.join("\n")}\n`); git("add", FILE, unreviewedPath); git("commit", "-qm", "inert detector fixtures"); const detectorSource = git("rev-parse", "HEAD");
    const detectors = fixture(lines, base, detectorSource); writeFileSync(join(repo, REGISTRY), serialize(detectors.registry)); writeFileSync(join(repo, CONTEXT), serialize(detectors.context)); git("add", REGISTRY, CONTEXT); git("commit", "-qm", "detector fixture review"); const detectorCandidate = git("rev-parse", "HEAD");
    const names = join(tempRoot, "synthetic-names.txt"); writeFileSync(names, "Synthetic Fixture Principal\n");
    result = run(base, detectorCandidate, true, names); assert.equal(result.status, 1);
    for (const [label] of markers) assert.ok(result.stdout.includes(`SECRET ${label} in ${FILE}`), `actual detector remains active: ${label}`);
    assert.match(result.stdout, /^raw secret findings: 19$/m); assert.match(result.stdout, /^reviewed fixture findings: 10$/m);
    assert.match(result.stdout, /^unresolved secret findings: 9$/m); assert.match(result.stdout, /^secret findings: 9$/m);
    assert.match(result.stdout, /pii findings: 1/);
  } finally {
    const checkedRoot = resolve(tempRoot);
    assert.equal(dirname(checkedRoot), tempParent);
    assert.ok(checkedRoot.startsWith(join(tempParent, "xenios-reviewed-fixtures-")));
    rmSync(checkedRoot, { recursive: true, force: true });
  }
});
