#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import {
  readFileSync,
  realpathSync,
  statSync,
} from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";

const SCANNER_PATH = fileURLToPath(
  new URL("./scan-release-diff.mjs", import.meta.url),
);

const INPUTS = [
  {
    flag: "--production-base-sha",
    env: "XENIOS_RELEASE_PRODUCTION_BASE_SHA",
    key: "productionBaseSha",
  },
  {
    flag: "--candidate-sha",
    env: "XENIOS_RELEASE_CANDIDATE_SHA",
    key: "candidateSha",
  },
  {
    flag: "--pii-names-file",
    env: "XENIOS_RELEASE_PII_NAMES_FILE",
    key: "piiNamesFile",
  },
];

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function usage() {
  return [
    "usage: verify-release-diff-scan.mjs --production-base-sha <40-hex-sha> --candidate-sha <40-hex-sha> --pii-names-file <outside-repo-path>",
    "",
    "The same inputs may instead be supplied through:",
    "  XENIOS_RELEASE_PRODUCTION_BASE_SHA",
    "  XENIOS_RELEASE_CANDIDATE_SHA",
    "  XENIOS_RELEASE_PII_NAMES_FILE",
    "",
    "No ref names, implicit HEAD, or in-repository PII source files are accepted.",
  ].join("\n");
}

function parseInputs(argv, env) {
  const byFlag = new Map(INPUTS.map((input) => [input.flag, input]));
  const cli = {};

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const input = byFlag.get(flag);
    if (!input) {
      throw new Error(`unknown argument: ${flag}`);
    }
    if (Object.hasOwn(cli, input.key)) {
      throw new Error(`duplicate argument: ${flag}`);
    }
    const value = argv[index + 1];
    if (!value || byFlag.has(value)) {
      throw new Error(`missing value for ${flag}`);
    }
    cli[input.key] = value;
    index += 1;
  }

  const values = {};
  for (const input of INPUTS) {
    const cliValue = cli[input.key]?.trim();
    const envValue = env[input.env]?.trim();
    if (cliValue && envValue) {
      const normalizedCli = input.key.endsWith("Sha")
        ? cliValue.toLowerCase()
        : resolve(cliValue);
      const normalizedEnv = input.key.endsWith("Sha")
        ? envValue.toLowerCase()
        : resolve(envValue);
      if (normalizedCli !== normalizedEnv) {
        throw new Error(`${input.flag} conflicts with ${input.env}`);
      }
    }
    values[input.key] = cliValue || envValue;
    if (!values[input.key]) {
      throw new Error(`${input.flag} (or ${input.env}) is required`);
    }
  }

  return values;
}

function runGit(args, cwd) {
  return spawnSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
}

function requireGitSuccess(result, description) {
  if (result.error) {
    throw new Error(`${description}: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(description);
  }
  return result.stdout.trim();
}

function resolveRepositoryRoot(cwd) {
  const output = requireGitSuccess(
    runGit(["rev-parse", "--show-toplevel"], cwd),
    "current directory is not inside a Git repository",
  );
  return realpathSync(output);
}

function requireExactCommit(sha, label, repositoryRoot) {
  if (!SHA_PATTERN.test(sha)) {
    throw new Error(`${label} must be an exact 40-hex commit SHA`);
  }
  const normalized = sha.toLowerCase();
  const resolved = requireGitSuccess(
    runGit(["rev-parse", "--verify", `${normalized}^{commit}`], repositoryRoot),
    `${label} does not resolve to a commit in this repository`,
  ).toLowerCase();
  if (resolved !== normalized) {
    throw new Error(`${label} did not resolve to the supplied exact commit SHA`);
  }
  return normalized;
}

function isWithin(root, target) {
  const pathFromRoot = relative(root, target);
  return (
    pathFromRoot === "" ||
    (!isAbsolute(pathFromRoot) &&
      pathFromRoot !== ".." &&
      !pathFromRoot.startsWith(`..${sep}`))
  );
}

function requireExternalNamesFile(inputPath, repositoryRoot) {
  let namesPath;
  try {
    namesPath = realpathSync(resolve(inputPath));
    if (!statSync(namesPath).isFile()) {
      throw new Error("not a regular file");
    }
  } catch {
    throw new Error("PII names file must exist, be readable, and be a regular file");
  }

  if (isWithin(repositoryRoot, namesPath)) {
    throw new Error("PII names file must remain outside the Git repository");
  }

  let contents;
  try {
    contents = readFileSync(namesPath, "utf8");
  } catch {
    throw new Error("PII names file must exist, be readable, and be a regular file");
  }
  const usableNames = contents
    .split(/\r?\n/)
    .map((line) => line.split("\t")[0]?.trim() ?? "")
    .filter((name) => name.length > 3 && /\s/.test(name));
  if (usableNames.length === 0) {
    throw new Error(
      "PII names file must contain at least one full-name entry in the scanner's accepted format",
    );
  }

  return namesPath;
}

export function evaluateScannerResult(result) {
  if (result.error) {
    return {
      exitCode: 2,
      error: `release-diff scanner could not run: ${result.error.message}`,
    };
  }
  if (!Number.isInteger(result.status)) {
    return {
      exitCode: 2,
      error: "release-diff scanner ended without an exit status",
    };
  }
  if (result.status !== 0) {
    return { exitCode: result.status, error: null };
  }

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  if (`${stdout}\n${stderr}`.includes("SKIPPED")) {
    return {
      exitCode: 1,
      error: "release-diff scanner reported a skipped check",
    };
  }

  const lines = stdout.split(/\r?\n/);
  if (lines.filter((line) => line === "secret findings: 0").length !== 1) {
    return {
      exitCode: 1,
      error: "release-diff scanner did not emit exactly one clean secret summary",
    };
  }
  if (lines.filter((line) => line === "pii findings: 0").length !== 1) {
    return {
      exitCode: 1,
      error: "release-diff scanner did not emit exactly one clean PII summary",
    };
  }

  return { exitCode: 0, error: null };
}

export function runReleaseDiffScanGate({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  env = process.env,
} = {}) {
  let inputs;
  let repositoryRoot;
  let productionBaseSha;
  let candidateSha;
  let piiNamesFile;

  try {
    inputs = parseInputs(argv, env);
    repositoryRoot = resolveRepositoryRoot(cwd);
    productionBaseSha = requireExactCommit(
      inputs.productionBaseSha,
      "production base",
      repositoryRoot,
    );
    candidateSha = requireExactCommit(
      inputs.candidateSha,
      "candidate",
      repositoryRoot,
    );
    piiNamesFile = requireExternalNamesFile(
      inputs.piiNamesFile,
      repositoryRoot,
    );

    const ancestry = runGit(
      ["merge-base", "--is-ancestor", productionBaseSha, candidateSha],
      repositoryRoot,
    );
    if (ancestry.error || ancestry.status > 1) {
      throw new Error("could not verify production-base ancestry");
    }
    if (ancestry.status !== 0) {
      throw new Error("production base must be an ancestor of the candidate");
    }
  } catch (error) {
    return {
      exitCode: 2,
      stdout: "",
      stderr: `${error.message}\n\n${usage()}\n`,
    };
  }

  const scan = spawnSync(
    process.execPath,
    [
      SCANNER_PATH,
      productionBaseSha,
      candidateSha,
      "--names-file",
      piiNamesFile,
    ],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
      maxBuffer: 256 * 1024 * 1024,
    },
  );
  const assessment = evaluateScannerResult(scan);
  const assessmentMessage = assessment.error
    ? `release-diff gate: ${assessment.error}\n`
    : "";

  return {
    exitCode: assessment.exitCode,
    stdout: scan.stdout ?? "",
    stderr: `${scan.stderr ?? ""}${assessmentMessage}`,
  };
}

const invokedPath = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) {
  const result = runReleaseDiffScanGate();
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
