#!/usr/bin/env node
// Reproducible secret + PII scan over a release diff (P1 remediation,
// 2026-08-27). The earlier RC's "secret scan / PII scan: clean" rows were
// ad-hoc session work nobody could rerun; this script IS the procedure.
//
//   node scripts/acceptance/scan-release-diff.mjs <baseRef> <headRef> [--names-file <path>]
//
// SECRETS: scans the added lines of the diff for key/token/credential shapes.
// PII: scans the added lines for every name listed in --names-file — a
// local-only, OUTSIDE-the-repo file (one name per line, or TSV whose first
// column is the name). The names file is the sensitive input, which is
// exactly why it is a runtime argument and never a fixture: the scan is
// reproducible by anyone who holds the source list, and the repo itself
// carries no name. Omitting --names-file skips the PII half and says so.
//
// Exit 0 = clean (for the halves that ran). Exit 1 = findings. Exit 2 = usage.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const refs = [];
let namesFile = null;
const allowedNames = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--names-file") namesFile = args[++i];
  else if (args[i] === "--allow-name") allowedNames.push(args[++i].toLowerCase());
  else refs.push(args[i]);
}
const [baseRef, headRef] = refs;
if (!baseRef || !headRef) {
  console.error(
    "usage: scan-release-diff.mjs <baseRef> <headRef> [--names-file <path>] [--allow-name <name>]...",
  );
  console.error(
    "  --names-file: out-of-repo list, ONE NAME PER LINE (or TSV, first column), NO header row.",
  );
  console.error(
    "  --allow-name: a principal whose in-repo mention is deliberate (e.g. a partner named by",
  );
  console.error(
    "    the founder as relationship owner). Each allowance is printed, never silent.",
  );
  process.exit(2);
}

const diff = execFileSync("git", ["diff", `${baseRef}..${headRef}`, "--unified=0"], {
  encoding: "utf8",
  maxBuffer: 256 * 1024 * 1024,
});

// Only ADDED lines matter: the scan asks what this release introduces.
const added = [];
let file = "(unknown)";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) file = line.slice(6);
  else if (line.startsWith("+") && !line.startsWith("+++")) added.push({ file, text: line.slice(1) });
}

// --- Secret shapes -----------------------------------------------------------
const SECRET_PATTERNS = [
  ["private key block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["AWS access key id", /\bAKIA[0-9A-Z]{16}\b/],
  ["GitHub token", /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ["Stripe live secret", /\bsk_live_[A-Za-z0-9]{16,}\b/],
  ["Stripe restricted key", /\brk_live_[A-Za-z0-9]{16,}\b/],
  ["Supabase service key shape", /\beyJ[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{40,}\.[A-Za-z0-9_-]{20,}\b/],
  ["generic assigned secret", /\b(?:api[_-]?key|secret|token|password|passwd)\b\s*[:=]\s*['"][A-Za-z0-9+/_=-]{16,}['"]/i],
  ["connection string with credentials", /\b(?:postgres|postgresql|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s'"@/]+:[^\s'"@]+@/i],
  ["slack token", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
  ["resend key", /\bre_[A-Za-z0-9]{20,}\b/],
];

// Lines that legitimately name a pattern (this scanner, tests of it) are
// allowed by file, not by content guessing. The account-portal preview
// harness sets SYNTHETIC placeholder credentials by design and refuses
// NODE_ENV=production outright — its assignments are not secrets.
const SECRET_ALLOWED_FILES = new Set([
  "scripts/acceptance/scan-release-diff.mjs",
  "scripts/preview-account-portal.ts",
]);

const secretFindings = [];
for (const { file: f, text } of added) {
  if (SECRET_ALLOWED_FILES.has(f)) continue;
  for (const [label, pattern] of SECRET_PATTERNS) {
    if (pattern.test(text)) secretFindings.push({ file: f, label });
  }
}

// --- PII (names) -------------------------------------------------------------
let piiFindings = [];
let piiRan = false;
if (namesFile) {
  piiRan = true;
  const names = readFileSync(namesFile, "utf8")
    .split(/\r?\n/)
    .map((line) => line.split("\t")[0]?.trim() ?? "")
    .filter((name) => name.length > 3 && /\s/.test(name)); // full names only
  const haystack = added
    .map(({ file: f, text }) => ({ f, lower: text.toLowerCase() }))
    .filter(({ f }) => !SECRET_ALLOWED_FILES.has(f));
  for (const name of new Set(names.map((n) => n.toLowerCase()))) {
    if (allowedNames.includes(name)) {
      console.log(`pii allowance in effect: an imported name matching --allow-name is not scanned`);
      continue;
    }
    for (const { f, lower } of haystack) {
      if (lower.includes(name)) piiFindings.push({ file: f, label: "imported-name match" });
    }
  }
}

console.log(`scanned ${added.length} added lines across ${new Set(added.map((a) => a.file)).size} files (${baseRef}..${headRef})`);
console.log(`secret findings: ${secretFindings.length}`);
for (const f of secretFindings) console.log(`  SECRET ${f.label} in ${f.file}`);
if (piiRan) {
  console.log(`pii findings: ${piiFindings.length}`);
  for (const f of piiFindings) console.log(`  PII ${f.label} in ${f.file}`);
} else {
  console.log("pii scan: SKIPPED (no --names-file given — provide the out-of-repo name list to run it)");
}

process.exit(secretFindings.length + piiFindings.length > 0 ? 1 : 0);
