// Admin CLI: run the client-import DRY RUN against a local two-column TSV
// (name<TAB>product per line, optional header). The input file must live
// OUTSIDE the repository; this script refuses paths inside it.
//
//   npx tsx scripts/research/client-import-dry-run.ts C:\path\to\clients.tsv
//
// Output: the aggregate ImportDryRunReportDto as JSON on stdout — counts and
// product strings only. Person names are parsed, staged in memory for the
// counts, and never printed, logged, or written anywhere by this script.

import { readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { runImportDryRun } from "../../server/research/client-import/importer";

const scriptDir = dirname(fileURLToPath(import.meta.url));

function fail(message: string): never {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) fail("usage: client-import-dry-run.ts <path-to-tsv-outside-repo>");

const absolute = resolve(inputPath);
const repoRoot = resolve(scriptDir, "..", "..");
if (absolute.startsWith(repoRoot + sep)) {
  fail("refusing: the input file must not live inside the repository (client data never enters git).");
}

const lines = readFileSync(absolute, "utf8").split(/\r?\n/).filter((l) => l.trim() !== "");
const rows = lines
  .map((line) => {
    const [name = "", product = ""] = line.split("\t");
    return { name: name.trim(), product: product.trim() };
  })
  .filter((row, index) => {
    // Drop a header row if present.
    if (index === 0 && /^client\s*name$/i.test(row.name)) return false;
    return row.name !== "";
  });

if (rows.length === 0) fail("no data rows found (expected name<TAB>product lines).");

const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "").slice(0, 12);
const { report } = runImportDryRun({
  batchId: `imp-cli-${stamp}`,
  sourceLabel: `local-dry-run:${absolute.split(sep).pop() ?? "input"}`,
  rows,
  sourcePartner: process.env.IMPORT_SOURCE_PARTNER ?? "vitality_advisors",
  relationshipOwner: process.env.IMPORT_RELATIONSHIP_OWNER ?? "Seth Grant",
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
