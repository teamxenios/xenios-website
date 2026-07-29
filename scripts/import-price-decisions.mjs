#!/usr/bin/env node
// Founder price-decision import CLI. DRY RUN ONLY.
//
// Reads a founder decision JSON file, validates every row, and prints the
// dry-run import plan with identity resolution unavailable (no readers, no
// database, no network). This tool has no execution path of any kind, and it
// refuses any flag that suggests one. Production mutation happens only
// through the release manager's protected approval flow, using the SECURITY
// DEFINER RPCs research_admin_create_product_price and
// research_admin_approve_product_price.
//
// Usage: node scripts/import-price-decisions.mjs <decisions.json>

import { readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Flags that suggest execution. Any of these is refused outright. */
export const EXECUTION_FLAGS = [
  "--execute",
  "--live",
  "--apply",
  "--write",
  "--commit",
  "--force",
  "--mutate",
  "--yes",
];

/** Return the first execution-suggesting flag in argv, or null. */
export function findExecutionFlag(argv) {
  for (const arg of argv) {
    const bare = String(arg).split("=")[0].toLowerCase();
    if (EXECUTION_FLAGS.includes(bare)) return arg;
  }
  return null;
}

export const REFUSAL_MESSAGE = [
  "REFUSED. This tool is dry-run only and has no execution path.",
  "No flag can make it write to any database.",
  "Production mutation happens only through the release manager's protected",
  "approval flow, using the SECURITY DEFINER RPCs",
  "research_admin_create_product_price and research_admin_approve_product_price.",
].join("\n");

/**
 * Parse argv (already stripped of node and the script path).
 * Returns { kind: "run", path } | { kind: "refused", flag } |
 * { kind: "usage", message }.
 */
export function parseCliArgs(argv) {
  const flag = findExecutionFlag(argv);
  if (flag !== null) return { kind: "refused", flag };
  const positional = argv.filter((arg) => !String(arg).startsWith("-"));
  if (positional.length !== 1) {
    return {
      kind: "usage",
      message:
        "Usage: node scripts/import-price-decisions.mjs <decisions.json>\n" +
        "Dry run only. No database is read or written.",
    };
  }
  return { kind: "run", path: positional[0] };
}

const BANNER = [
  "================================================================",
  " FOUNDER PRICE-DECISION IMPORT - DRY RUN ONLY",
  " NO DATABASE WAS TOUCHED. THIS TOOL CANNOT TOUCH A DATABASE.",
  "================================================================",
].join("\n");

const FOOTER = [
  "----------------------------------------------------------------",
  "NO DATABASE WAS TOUCHED. This tool has no execution path.",
  "Production mutation requires the release manager's protected approval",
  "flow, using the SECURITY DEFINER RPCs research_admin_create_product_price",
  "and research_admin_approve_product_price. A model or script output never",
  "authorizes that mutation.",
  "----------------------------------------------------------------",
].join("\n");

/** Render the human-readable dry-run report from validation + plan data. */
export function formatDryRunReport(validation, plan) {
  const lines = [BANNER, ""];
  lines.push(
    `Document: ${validation.counts.total} row(s), ` +
      `${validation.counts.valid} valid, ${validation.counts.fatal} fatal, ` +
      `${validation.counts.warnings} warning(s)`,
  );
  for (const issue of validation.documentIssues) {
    lines.push(`  DOCUMENT FATAL [${issue.code}] ${issue.message}`);
  }
  lines.push("");
  for (const row of validation.rows) {
    const label = row.decisionId ?? `row ${row.index}`;
    if (row.valid) {
      lines.push(`Row ${row.index} (${label}): valid, ${row.classification}`);
    } else {
      lines.push(`Row ${row.index} (${label}): FATAL`);
    }
    for (const issue of row.issues) {
      lines.push(
        `  ${issue.severity.toUpperCase()} [${issue.code}]` +
          `${issue.field ? ` ${issue.field}:` : ""} ${issue.message}`,
      );
    }
  }
  if (plan !== null) {
    lines.push("");
    lines.push(
      `Dry-run plan (identity resolution unavailable, evaluated at ${plan.evaluatedAt}):`,
    );
    for (const row of plan.rows) {
      lines.push(`  ${row.decisionId}: ${row.classification}`);
      for (const reason of row.reasons) {
        lines.push(`    - ${reason}`);
      }
    }
    const counts = Object.entries(plan.counts)
      .map(([classification, count]) => `${classification} ${count}`)
      .join(", ");
    lines.push(`Counts: ${counts}`);
  } else {
    lines.push("");
    lines.push("No dry-run plan: the document has fatal schema errors.");
  }
  lines.push("");
  lines.push(FOOTER);
  return lines.join("\n");
}

async function defaultLoadModules() {
  const specifier = new URL(
    "../server/research/pricing/price-decision-import.ts",
    import.meta.url,
  ).href;
  try {
    return await import(specifier);
  } catch {
    // Plain node cannot import TypeScript; register the repo's existing tsx
    // loader (a dependency already, not a new one) and retry.
    const { register } = await import("tsx/esm/api");
    register();
    return await import(specifier);
  }
}

/**
 * Run the CLI. io lets tests inject readFile, output capture, and the
 * pricing module. Returns the process exit code: 0 dry run complete,
 * 1 fatal schema errors, 2 usage error or refused execution flag.
 */
export async function runCli(argv, io = {}) {
  const log = io.log ?? ((line) => console.log(line));
  const error = io.error ?? ((line) => console.error(line));
  const readFile = io.readFile ?? ((file) => readFileSync(file, "utf8"));
  const loadModules = io.loadModules ?? defaultLoadModules;
  const now = io.now ?? (() => new Date().toISOString());

  const parsed = parseCliArgs(argv);
  if (parsed.kind === "refused") {
    error(`Refused flag: ${parsed.flag}`);
    error(REFUSAL_MESSAGE);
    return 2;
  }
  if (parsed.kind === "usage") {
    error(parsed.message);
    return 2;
  }

  let raw;
  try {
    raw = readFile(parsed.path);
  } catch (cause) {
    error(`Could not read ${parsed.path}: ${cause?.message ?? cause}`);
    return 2;
  }

  let json;
  try {
    json = JSON.parse(raw);
  } catch (cause) {
    error(`Not valid JSON: ${cause?.message ?? cause}`);
    return 1;
  }

  const { validateDecisionDocument, planImport } = await loadModules();
  const validation = validateDecisionDocument(json);

  // Readers-absent dry run: identity resolution is unavailable, so every row
  // with exact ids is blocked and every row without them is unresolved.
  const plan = validation.documentValid
    ? await planImport({
        rows: validation.validRows,
        source: null,
        evaluatedAt: now(),
      })
    : null;

  log(formatDryRunReport(validation, plan));
  return validation.documentValid ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (invokedDirectly) {
  runCli(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (cause) => {
      console.error(`Unexpected failure: ${cause?.stack ?? cause}`);
      process.exitCode = 1;
    },
  );
}
