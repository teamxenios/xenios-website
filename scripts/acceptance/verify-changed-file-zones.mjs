// Core-site ZONE gate: runs the changed-file classifier against a real PR diff.
//
// Why this file exists, stated plainly so nobody re-opens the hole.
//
// scripts/acceptance/verify-core-site-protection.mjs already contains the whole
// decision procedure. It exports classifyChangedFiles(changedFiles, manifest), which
// sorts every changed path into seam / test / allowed / infrastructure / violations,
// and classifyPath DEFAULTS TO "violation" for any path that sits in no zone. That is
// the correct, strict behaviour.
//
// The hole was never in the logic. It was in the wiring. CI (.github/workflows/checks.yml)
// ran only test, typecheck and build. The vitest suite server/core-site-protection.test.ts
// exercises the classifier against HAND-WRITTEN path lists and checks the content-HASH
// tripwire against the working tree. Nothing anywhere ran the classifier against the
// actual set of files a pull request changed. So a branch that edited a protected path
// which happens NOT to be one of the 21 hash-pinned files passed every CI job in green
// silence. That is exactly how PR #182 (four protected page edits beyond the pinned
// Home.tsx) and PR #179 (a new file under client/src/components/**) got as far as they did.
//
// This script closes that gap and nothing else. It adds NO zone logic of its own: it
// imports classifyChangedFiles from the existing gate so the two can never disagree.
// Widening a zone stays a founder decision made in the manifest, not a thing a runner
// script can quietly do.
//
// Relationship to the existing gate script:
//   verify-core-site-protection.mjs  = zones + content-hash tripwire, defaults to a git
//                                      range, is the local pre-review command.
//   verify-changed-file-zones.mjs    = zones ONLY, over an EXPLICIT changed-file list,
//                                      built to be fed a PR diff by a CI runner.
// Zones only, on purpose: the hash tripwire needs a working tree at the right commit and
// is already covered by the vitest suite, whereas the zone question is purely a function
// of the diff and is the part CI was missing.
//
// No shebang on purpose: same reason as verify-core-site-protection.mjs. This file is
// always invoked as `node scripts/...` and is also imported by
// server/core-site-zone-gate.test.ts, where a shebang breaks the Node 20 ESM runner.
//
// Usage:
//   node scripts/acceptance/verify-changed-file-zones.mjs <path> [<path> ...]
//   node scripts/acceptance/verify-changed-file-zones.mjs --files-from changed.txt
//   git diff --name-only origin/main...HEAD |
//     node scripts/acceptance/verify-changed-file-zones.mjs --files-from -
//   node scripts/acceptance/verify-changed-file-zones.mjs --base origin/main --head HEAD
//
// Exit codes:
//   0  every changed file landed in a zone that permits it
//   1  at least one changed file is a VIOLATION (the gate's whole job)
//   2  setup error: unreadable manifest, bad git ref, or an EMPTY changed-file set
//      without --allow-empty. An empty set is treated as a setup error deliberately:
//      a pull request always changes at least one file, so an empty list means the CI
//      step computed the diff wrong, and a gate that passes on a list it failed to
//      compute is a gate that is not running at all. See docs note in the report text.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

import {
  classifyChangedFiles,
  loadManifest,
  normalizePath,
  changedFilesBetween,
  MANIFEST_PATH,
  REPO_ROOT,
  DEFAULT_BASE_REF,
  DEFAULT_HEAD_REF,
} from "./verify-core-site-protection.mjs";

export const EXIT_PASS = 0;
export const EXIT_VIOLATION = 1;
export const EXIT_SETUP_ERROR = 2;

export const USAGE = [
  "usage: node scripts/acceptance/verify-changed-file-zones.mjs [options] [path ...]",
  "",
  "  --files-from <file>   read newline-separated paths from a file, or - for stdin",
  "  --base <ref>          compute the changed set from a git range instead",
  "  --head <ref>          the head of that range (default HEAD)",
  "  --manifest <file>     override the protection manifest path",
  "  --allow-empty         treat an empty changed-file set as a pass, not a setup error",
  "  -h, --help            print this",
].join("\n");

/* -------------------------------------------------------------------- arguments */

/**
 * Parse argv into an options object. Pure, so the tests can drive every branch
 * without spawning a process.
 * Throws on an unknown flag or a flag missing its value, which main() turns into
 * exit 2. Silently ignoring a mistyped flag would be its own quiet-failure hole.
 */
export function parseArgs(argv = []) {
  const options = {
    files: [],
    filesFrom: null,
    base: null,
    head: null,
    manifestPath: null,
    allowEmpty: false,
    help: false,
  };

  const needsValue = (index, flag) => {
    if (index + 1 >= argv.length) throw new Error(`${flag} needs a value`);
    return argv[index + 1];
  };

  for (let i = 0; i < argv.length; i += 1) {
    const argument = argv[i];
    switch (argument) {
      case "-h":
      case "--help":
        options.help = true;
        break;
      case "--files-from":
        options.filesFrom = needsValue(i, argument);
        i += 1;
        break;
      case "--base":
        options.base = needsValue(i, argument);
        i += 1;
        break;
      case "--head":
        options.head = needsValue(i, argument);
        i += 1;
        break;
      case "--manifest":
        options.manifestPath = needsValue(i, argument);
        i += 1;
        break;
      case "--allow-empty":
        options.allowEmpty = true;
        break;
      default:
        if (argument.startsWith("-")) throw new Error(`unknown option ${argument}`);
        options.files.push(argument);
    }
  }
  return options;
}

/** Split a blob of newline-separated paths, dropping blanks and comment lines. */
export function parseFileList(text) {
  return String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

/** Drop duplicates while keeping first-seen order, so a report reads predictably. */
export function dedupe(paths) {
  const seen = new Set();
  const ordered = [];
  for (const path of paths) {
    const file = normalizePath(path);
    if (seen.has(file)) continue;
    seen.add(file);
    ordered.push(file);
  }
  return ordered;
}

/**
 * Resolve the changed-file set from the parsed options.
 * `deps` is injected so the tests exercise stdin and the git range with no process
 * and no repository.
 */
export function collectChangedFiles(options, deps = {}) {
  const readFile = deps.readFile ?? ((path) => readFileSync(path, "utf8"));
  const readStdin = deps.readStdin ?? (() => readFileSync(0, "utf8"));
  const gitRange = deps.gitRange ?? changedFilesBetween;
  const repoRoot = deps.repoRoot ?? REPO_ROOT;

  const collected = [...options.files];

  if (options.filesFrom !== null) {
    const text = options.filesFrom === "-" ? readStdin() : readFile(options.filesFrom);
    collected.push(...parseFileList(text));
  }

  if (options.base !== null || options.head !== null) {
    const base = options.base ?? DEFAULT_BASE_REF;
    const head = options.head ?? DEFAULT_HEAD_REF;
    collected.push(...gitRange(base, head, repoRoot));
  }

  return dedupe(collected);
}

/** A short human label for where the changed-file set came from, for the report. */
export function describeSource(options) {
  const sources = [];
  if (options.files.length > 0) sources.push("command line");
  if (options.filesFrom === "-") sources.push("stdin");
  else if (options.filesFrom !== null) sources.push(options.filesFrom);
  if (options.base !== null || options.head !== null) {
    sources.push(`${options.base ?? DEFAULT_BASE_REF}...${options.head ?? DEFAULT_HEAD_REF}`);
  }
  return sources.length > 0 ? sources.join(" + ") : "nothing (no input given)";
}

/* -------------------------------------------------------------------- reporting */

/**
 * Render the classification.
 * `failed` is derived from classification.violations and from NOTHING else, so there is
 * no second place where a permissive edit could make the gate pass.
 */
export function formatZoneReport(classification, context = {}) {
  const { source = "unknown", baselineSha = "unknown" } = context;
  const counts = {
    allowed: classification.allowed.length,
    infrastructure: classification.infrastructure.length,
    seam: classification.seam.length,
    test: classification.test.length,
    violations: classification.violations.length,
  };
  const total =
    counts.allowed + counts.infrastructure + counts.seam + counts.test + counts.violations;

  const lines = [];
  lines.push("core-site zone gate (changed-file classification)");
  lines.push(`  manifest baseline : ${baselineSha}`);
  lines.push(`  changed-file set  : ${source}`);
  lines.push(`  files classified  : ${total}`);
  lines.push("");
  lines.push(`  allowed (research/care) : ${counts.allowed}`);
  lines.push(`  infrastructure          : ${counts.infrastructure}`);
  lines.push(`  seam                    : ${counts.seam}`);
  lines.push(`  test                    : ${counts.test}`);
  lines.push(`  violations              : ${counts.violations}`);

  const section = (title, paths, note) => {
    if (paths.length === 0) return;
    lines.push("");
    lines.push(title);
    if (note) for (const noteLine of note) lines.push(`  ${noteLine}`);
    for (const path of paths) lines.push(`  - ${path}`);
  };

  section("ALLOWED (inside a Research or Care write zone):", classification.allowed);
  section("INFRASTRUCTURE (docs and tooling, never bundled or served):", classification.infrastructure);
  section("SEAM FILES TOUCHED (permitted, but each needs an exclusive lease, the", classification.seam, [
    "minimum diff, a focused regression test, and QA confirmation of no",
    "unrelated change before this branch is approved):",
  ]);
  section("TEST FILES TOUCHED (permitted: a test is never bundled or served, so it", classification.test, [
    "cannot change what a visitor sees. Review must still confirm each one was",
    "STRENGTHENED, not weakened. Lowering an existing safety or regression gate",
    "to make a build pass is forbidden):",
  ]);

  const failed = classification.violations.length > 0;

  if (failed) {
    lines.push("");
    lines.push("FAIL: these changed files are in NO permitted zone.");
    lines.push("The main website outside /research and /care must not be modified.");
    for (const path of classification.violations) lines.push(`  - ${path}`);
    lines.push("");
    lines.push("What to do: see docs/phase2/CORE_SITE_PROTECTION.md. Either move the change");
    lines.push("into client/src/research, client/src/care, server/research, server/care, or");
    lines.push("shared/research, or request an exclusive seam lease if the change genuinely");
    lines.push("needs one of the permitted seam files. Do not widen the manifest to pass.");
  }

  lines.push("");
  lines.push(failed ? "RESULT: FAIL" : "RESULT: PASS");
  return { text: lines.join("\n"), failed };
}

/* -------------------------------------------------------------------------- run */

/**
 * The gate itself. Takes an explicit changed-file list, returns the verdict.
 * Pure over its inputs (no git, no argv, no process), which is what lets the test
 * assert the EXIT CODE rather than only the classification.
 */
export function runZoneGate({
  changedFiles,
  manifest,
  manifestPath = MANIFEST_PATH,
  source = "explicit list",
  allowEmpty = false,
} = {}) {
  const loaded = manifest ?? loadManifest(manifestPath);
  const files = dedupe(changedFiles ?? []);

  if (files.length === 0 && !allowEmpty) {
    return {
      ok: false,
      exitCode: EXIT_SETUP_ERROR,
      classification: { seam: [], test: [], allowed: [], infrastructure: [], violations: [] },
      text: [
        "core-site zone gate (changed-file classification)",
        `  changed-file set  : ${source}`,
        "",
        "SETUP ERROR: the changed-file set is empty.",
        "A pull request always changes at least one file, so an empty list means the",
        "diff was computed wrong (a missing base ref or a shallow clone), and a gate",
        "that passes on a list it failed to compute is a gate that is not running.",
        "Fix the diff step, or pass --allow-empty if an empty set is genuinely expected.",
        "",
        "RESULT: SETUP ERROR",
      ].join("\n"),
    };
  }

  const classification = classifyChangedFiles(files, loaded);
  const { text, failed } = formatZoneReport(classification, {
    source,
    baselineSha: loaded.baselineSha,
  });

  return {
    ok: !failed,
    exitCode: failed ? EXIT_VIOLATION : EXIT_PASS,
    classification,
    text,
  };
}

export function main(argv = process.argv.slice(2), io = {}) {
  const out = io.stdout ?? ((text) => process.stdout.write(text));
  const err = io.stderr ?? ((text) => process.stderr.write(text));

  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    err(`core-site zone gate: ${error.message}\n\n${USAGE}\n`);
    return EXIT_SETUP_ERROR;
  }

  if (options.help) {
    out(`${USAGE}\n`);
    return EXIT_PASS;
  }

  let result;
  try {
    const changedFiles = collectChangedFiles(options, io);
    result = runZoneGate({
      changedFiles,
      manifestPath: options.manifestPath ?? MANIFEST_PATH,
      source: describeSource(options),
      allowEmpty: options.allowEmpty,
    });
  } catch (error) {
    err(`core-site zone gate could not run: ${error.message}\n`);
    return EXIT_SETUP_ERROR;
  }

  out(`${result.text}\n`);
  return result.exitCode;
}

const invokedDirectly =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exit(main());
