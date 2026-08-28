import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { evaluateScannerResult } from "./verify-release-diff-scan.mjs";

const GATE_PATH = fileURLToPath(
  new URL("./verify-release-diff-scan.mjs", import.meta.url),
);
const SCANNER_PATH = fileURLToPath(
  new URL("./scan-release-diff.mjs", import.meta.url),
);
const RELEASE_ENV_KEYS = [
  "XENIOS_RELEASE_PRODUCTION_BASE_SHA",
  "XENIOS_RELEASE_CANDIDATE_SHA",
  "XENIOS_RELEASE_PII_NAMES_FILE",
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
  });
  assert.ifError(result.error);
  return result;
}

function git(cwd, ...args) {
  const result = run("git", args, cwd);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

function createFixture(t) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), "xenios-release-scan-"));
  const repository = join(fixtureRoot, "repository");
  const namesFile = join(fixtureRoot, "synthetic-name-source.txt");
  mkdirSync(repository);
  t.after(() => {
    assert.ok(fixtureRoot.startsWith(join(tmpdir(), "xenios-release-scan-")));
    rmSync(fixtureRoot, { recursive: true, force: true });
  });

  git(repository, "init", "--quiet");
  git(repository, "config", "user.email", "fixture@example.invalid");
  git(repository, "config", "user.name", "Release Scan Fixture");
  writeFileSync(join(repository, "fixture.txt"), "base fixture\n", "utf8");
  git(repository, "add", "fixture.txt");
  git(repository, "commit", "--quiet", "-m", "base");
  const baseSha = git(repository, "rev-parse", "HEAD");

  writeFileSync(
    join(repository, "fixture.txt"),
    "base fixture\nclean candidate change\n",
    "utf8",
  );
  git(repository, "add", "fixture.txt");
  git(repository, "commit", "--quiet", "-m", "candidate");
  const candidateSha = git(repository, "rev-parse", "HEAD");

  writeFileSync(namesFile, "Synthetiq Fixtureperson\n", "utf8");
  return { baseSha, candidateSha, fixtureRoot, namesFile, repository };
}

function cleanEnvironment() {
  const env = { ...process.env };
  for (const key of RELEASE_ENV_KEYS) delete env[key];
  return env;
}

function runGate(fixture, args) {
  return spawnSync(process.execPath, [GATE_PATH, ...args], {
    cwd: fixture.repository,
    encoding: "utf8",
    env: cleanEnvironment(),
  });
}

function completeArguments(fixture) {
  return [
    "--production-base-sha",
    fixture.baseSha,
    "--candidate-sha",
    fixture.candidateSha,
    "--pii-names-file",
    fixture.namesFile,
  ];
}

test("clean release diff succeeds only with complete zero summaries", (t) => {
  const fixture = createFixture(t);
  const result = runGate(fixture, completeArguments(fixture));

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^secret findings: 0$/m);
  assert.match(result.stdout, /^pii findings: 0$/m);
  assert.doesNotMatch(result.stdout, /SKIPPED/);
});

test("missing or invalid explicit inputs fail with usage status", async (t) => {
  const fixture = createFixture(t);

  await t.test("missing names file argument", () => {
    const result = runGate(fixture, [
      "--production-base-sha",
      fixture.baseSha,
      "--candidate-sha",
      fixture.candidateSha,
    ]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--pii-names-file .* is required/);
  });

  await t.test("symbolic candidate ref", () => {
    const args = completeArguments(fixture);
    args[3] = "HEAD";
    const result = runGate(fixture, args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /candidate must be an exact 40-hex commit SHA/);
  });

  await t.test("names file inside repository", () => {
    const inRepositoryNames = join(fixture.repository, "names.txt");
    writeFileSync(inRepositoryNames, "Synthetiq Fixtureperson\n", "utf8");
    const args = completeArguments(fixture);
    args[5] = inRepositoryNames;
    const result = runGate(fixture, args);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /must remain outside the Git repository/);
  });
});

test("the existing scanner's SKIPPED output is a hard gate failure", (t) => {
  const fixture = createFixture(t);
  const skippedScan = run(
    process.execPath,
    [SCANNER_PATH, fixture.baseSha, fixture.candidateSha],
    fixture.repository,
  );

  assert.equal(skippedScan.status, 0, skippedScan.stderr);
  assert.match(skippedScan.stdout, /SKIPPED/);
  const assessment = evaluateScannerResult(skippedScan);
  assert.equal(assessment.exitCode, 1);
  assert.match(assessment.error, /skipped check/);
});

test("SKIPPED on stderr is also a hard gate failure", () => {
  const assessment = evaluateScannerResult({
    status: 0,
    stdout: "secret findings: 0\npii findings: 0\n",
    stderr: "pii scan: SKIPPED\n",
  });

  assert.equal(assessment.exitCode, 1);
  assert.match(assessment.error, /skipped check/);
});

test("a nonzero scanner finding remains nonzero through the gate", (t) => {
  const fixture = createFixture(t);
  writeFileSync(
    join(fixture.repository, "fixture.txt"),
    "base fixture\nSynthetiq Fixtureperson\n",
    "utf8",
  );
  git(fixture.repository, "add", "fixture.txt");
  git(fixture.repository, "commit", "--quiet", "-m", "synthetic finding");
  fixture.candidateSha = git(fixture.repository, "rev-parse", "HEAD");

  const result = runGate(fixture, completeArguments(fixture));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /^pii findings: 1$/m);
});
