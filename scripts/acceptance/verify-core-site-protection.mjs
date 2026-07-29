// Core-site protection gate.
//
// Samuel's directive: the main xenios website outside /research and /care must not be
// redesigned, rewritten, or behaviorally modified. This script is the enforcement of
// that invariant. Every Research and Care candidate branch runs it before review.
//
// It answers two questions against docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json:
//   1. Did this branch change a file outside the Research/Care allowed write zones?
//   2. Do the curated high-risk protected files still hash to their baseline?
//
// No shebang on purpose: this file is always invoked as `node scripts/...` and is also
// imported by server/core-site-protection.test.ts, where a shebang breaks the Node 20
// ESM module runner. Same reason as scripts/import-price-decisions.mjs. This script is
// plain .mjs and imports nothing from TypeScript, so no tsx registration is needed.
//
// Usage:
//   node scripts/acceptance/verify-core-site-protection.mjs [baseRef] [headRef]
//   node scripts/acceptance/verify-core-site-protection.mjs origin/main HEAD   (default)
//
// Exit 0 on pass, 1 on violation, 2 on a setup error (bad manifest, bad git ref).

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = resolve(HERE, "..", "..");
export const MANIFEST_PATH = resolve(
  REPO_ROOT,
  "docs",
  "phase2",
  "CORE_SITE_PROTECTION_MANIFEST.json",
);

export const DEFAULT_BASE_REF = "origin/main";
export const DEFAULT_HEAD_REF = "HEAD";

/* ------------------------------------------------------------------ manifest */

/** Read and shallow-validate the protection manifest. Throws on a malformed file. */
export function loadManifest(manifestPath = MANIFEST_PATH) {
  if (!existsSync(manifestPath)) {
    throw new Error(`protection manifest not found at ${manifestPath}`);
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const required = [
    "baselineSha",
    "protectedRoutes",
    "allowedWriteZones",
    "infrastructureZones",
    "permittedSeamFiles",
    "fileHashes",
  ];
  for (const key of required) {
    if (!manifest[key]) throw new Error(`protection manifest is missing "${key}"`);
  }
  return manifest;
}

/** Normalize a path to the repo-relative forward-slash form git reports. */
export function normalizePath(path) {
  return String(path).replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

/** The zone lists the classifier works from, flattened out of the manifest. */
export function buildZones(manifest) {
  return {
    allowedPrefixes: (manifest.allowedWriteZones.prefixes ?? []).map(normalizePath),
    allowedFiles: new Set((manifest.allowedWriteZones.exactFiles ?? []).map(normalizePath)),
    infrastructurePrefixes: (manifest.infrastructureZones.prefixes ?? []).map(normalizePath),
    infrastructureFiles: new Set(
      (manifest.infrastructureZones.exactFiles ?? []).map(normalizePath),
    ),
    seamFiles: new Set((manifest.permittedSeamFiles.files ?? []).map((f) => normalizePath(f.path))),
    testSuffixes: manifest.reportedZones?.testFileSuffixes ?? [],
  };
}

/** True when the path is a test file, by the repo's naming convention. */
export function isTestFile(path, testSuffixes) {
  const file = normalizePath(path);
  return (testSuffixes ?? []).some((suffix) => file.endsWith(suffix));
}

/**
 * Classify one changed path. Returns one of:
 *   "seam"           passes, REPORTED  - a permitted integration point, needs a lease
 *   "test"           passes, REPORTED  - a test file, cannot change what a visitor sees,
 *                                        but could lower an existing gate, so review sees it
 *   "allowed"        passes, silent    - inside a Research or Care write zone
 *   "infrastructure" passes, silent    - docs and tooling, never bundled or served
 *   "violation"      FAILS
 *
 * Order matters. A seam file is checked FIRST, so a file that is both named as a seam
 * and sits under an allowed prefix is still reported as a seam, never silently allowed.
 * Test files are checked SECOND, so a test inside the Research zone is still reported,
 * because "do not lower an existing gate to make a build pass" applies everywhere.
 */
export function classifyPath(path, zones) {
  const file = normalizePath(path);
  if (zones.seamFiles.has(file)) return "seam";
  if (isTestFile(file, zones.testSuffixes)) return "test";
  if (zones.allowedFiles.has(file)) return "allowed";
  if (zones.infrastructureFiles.has(file)) return "infrastructure";
  for (const prefix of zones.allowedPrefixes) if (file.startsWith(prefix)) return "allowed";
  for (const prefix of zones.infrastructurePrefixes) if (file.startsWith(prefix)) {
    return "infrastructure";
  }
  return "violation";
}

/**
 * Classify a whole changed-file set.
 * Pure: takes the paths, returns the verdict. This is the function the tests drive,
 * so the gate's decision is testable without git.
 */
export function classifyChangedFiles(changedFiles, manifest) {
  const zones = buildZones(manifest);
  const result = { seam: [], test: [], allowed: [], infrastructure: [], violations: [] };
  for (const path of changedFiles) {
    const verdict = classifyPath(path, zones);
    if (verdict === "violation") result.violations.push(normalizePath(path));
    else result[verdict].push(normalizePath(path));
  }
  return result;
}

/* --------------------------------------------------------------------- hashes */

/**
 * sha256 over UTF-8 content with CRLF normalized to LF.
 * This repo checks out CRLF on Windows (core.autocrlf), so the raw bytes on disk differ
 * from the stored blob. Normalizing makes the digest identical either way.
 */
export function hashContent(content) {
  return `sha256:${createHash("sha256").update(String(content).replace(/\r\n/g, "\n"), "utf8").digest("hex")}`;
}

/** Hash a file on disk with the same normalization. Returns null if it is missing. */
export function hashFile(absolutePath) {
  if (!existsSync(absolutePath)) return null;
  return hashContent(readFileSync(absolutePath, "utf8"));
}

/**
 * Compare a map of {path: expectedHash} against a reader.
 * `readFileAt(relativePath)` returns the file's content, or null when it is missing.
 * Pure over the reader, so the tests can tamper with content without touching disk.
 */
export function verifyHashes(expected, readFileAt) {
  const mismatches = [];
  const missing = [];
  const matched = [];
  for (const [path, expectedHash] of Object.entries(expected)) {
    const content = readFileAt(path);
    if (content === null || content === undefined) {
      missing.push(path);
      continue;
    }
    const actual = hashContent(content);
    if (actual !== expectedHash) mismatches.push({ path, expected: expectedHash, actual });
    else matched.push(path);
  }
  return { matched, mismatches, missing };
}

/** The default reader: the working tree at the repo root. */
export function worktreeReader(repoRoot = REPO_ROOT) {
  return (relativePath) => {
    const absolute = resolve(repoRoot, relativePath);
    return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
  };
}

/* ------------------------------------------------------------------------ git */

function git(args, repoRoot = REPO_ROOT) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** Resolve the merge base so a stale base ref does not report unrelated files. */
export function mergeBase(baseRef, headRef, repoRoot = REPO_ROOT) {
  try {
    return git(["merge-base", baseRef, headRef], repoRoot).trim();
  } catch {
    return baseRef;
  }
}

/** The changed-file set between two refs, as repo-relative forward-slash paths. */
export function changedFilesBetween(baseRef, headRef, repoRoot = REPO_ROOT) {
  const base = mergeBase(baseRef, headRef, repoRoot);
  const output = git(["diff", "--name-only", `${base}..${headRef}`], repoRoot);
  return output
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizePath);
}

/* ------------------------------------------------------------------- reporting */

export function formatReport(classification, hashResult, seamHashResult, context) {
  const lines = [];
  const { baseRef, headRef, baselineSha } = context;
  lines.push("core-site protection gate");
  lines.push(`  manifest baseline : ${baselineSha}`);
  lines.push(`  comparing         : ${baseRef}..${headRef}`);
  lines.push(
    `  changed files     : ${
      classification.allowed.length +
      classification.infrastructure.length +
      classification.seam.length +
      classification.test.length +
      classification.violations.length
    }`,
  );
  lines.push(`  allowed (research/care) : ${classification.allowed.length}`);
  lines.push(`  infrastructure          : ${classification.infrastructure.length}`);
  lines.push(`  protected file hashes   : ${hashResult.matched.length} verified`);

  if (classification.test.length > 0) {
    lines.push("");
    lines.push("TEST FILES TOUCHED (permitted: a test cannot change what a visitor sees.");
    lines.push("Review must still confirm each one was STRENGTHENED, not weakened. Lowering");
    lines.push("an existing safety or regression gate to make a build pass is forbidden):");
    for (const path of classification.test) lines.push(`  - ${path}`);
  }

  if (classification.seam.length > 0) {
    lines.push("");
    lines.push("SEAM FILES TOUCHED (permitted, but each needs an exclusive lease, the");
    lines.push("minimum diff, a focused regression test, and QA confirmation of no");
    lines.push("unrelated change before this branch is approved):");
    for (const path of classification.seam) lines.push(`  - ${path}`);
  }

  if (seamHashResult && seamHashResult.mismatches.length > 0) {
    lines.push("");
    lines.push("SEAM CONTENT CHANGED since the baseline (reported, not a failure):");
    for (const { path } of seamHashResult.mismatches) lines.push(`  - ${path}`);
  }

  if (classification.violations.length > 0) {
    lines.push("");
    lines.push("FAIL: changed files outside the allowed Research/Care write zones.");
    lines.push("The main website outside /research and /care must not be modified.");
    for (const path of classification.violations) lines.push(`  - ${path}`);
  }

  if (hashResult.mismatches.length > 0) {
    lines.push("");
    lines.push("FAIL: protected file content changed (hash mismatch against the baseline).");
    for (const { path, expected, actual } of hashResult.mismatches) {
      lines.push(`  - ${path}`);
      lines.push(`      expected ${expected}`);
      lines.push(`      actual   ${actual}`);
    }
  }

  if (hashResult.missing.length > 0) {
    lines.push("");
    lines.push("FAIL: protected file is missing (deleted or moved).");
    for (const path of hashResult.missing) lines.push(`  - ${path}`);
  }

  const failed =
    classification.violations.length > 0 ||
    hashResult.mismatches.length > 0 ||
    hashResult.missing.length > 0;

  lines.push("");
  lines.push(failed ? "RESULT: FAIL" : "RESULT: PASS");
  if (failed) {
    lines.push("");
    lines.push("What to do: see docs/phase2/CORE_SITE_PROTECTION.md. Either move the change");
    lines.push("into client/src/research, client/src/care, server/research, server/care, or");
    lines.push("shared/research, or request an exclusive seam lease if the change genuinely");
    lines.push("needs one of the permitted seam files. Do not widen the manifest to pass.");
  }
  return { text: lines.join("\n"), failed };
}

/* ------------------------------------------------------------------------- run */

/** Run the whole gate. Returns { ok, text, classification, hashResult, seamHashResult }. */
export function runGate({
  baseRef = DEFAULT_BASE_REF,
  headRef = DEFAULT_HEAD_REF,
  repoRoot = REPO_ROOT,
  manifestPath = MANIFEST_PATH,
  changedFiles,
  readFileAt,
} = {}) {
  const manifest = loadManifest(manifestPath);
  const files = changedFiles ?? changedFilesBetween(baseRef, headRef, repoRoot);
  const reader = readFileAt ?? worktreeReader(repoRoot);

  const classification = classifyChangedFiles(files, manifest);
  const hashResult = verifyHashes(manifest.fileHashes.files ?? {}, reader);
  const seamHashResult = verifyHashes(manifest.seamBaselineHashes?.files ?? {}, reader);

  const { text, failed } = formatReport(classification, hashResult, seamHashResult, {
    baseRef,
    headRef,
    baselineSha: manifest.baselineSha,
  });
  return { ok: !failed, text, classification, hashResult, seamHashResult, manifest };
}

export function main(argv = process.argv.slice(2)) {
  const baseRef = argv[0] || DEFAULT_BASE_REF;
  const headRef = argv[1] || DEFAULT_HEAD_REF;
  let result;
  try {
    result = runGate({ baseRef, headRef });
  } catch (error) {
    process.stderr.write(`core-site protection gate could not run: ${error.message}\n`);
    return 2;
  }
  process.stdout.write(`${result.text}\n`);
  return result.ok ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
