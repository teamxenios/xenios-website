// V3 master import dry run.
//
// Reads the V3 workbook, runs it through the real importer, and writes
// docs/research-commerce/V3_IMPORT_DRYRUN.md. It writes nothing else: no
// database, no production record, no approved price. The workbook itself is not
// committed to this repository, so the release authority points this at a local
// copy when Product Control is ready to review the numbers.
//
// Usage:
//   npx tsx scripts/v3-import-dry-run.mts <sheets.json> [--sha256 <hash>]
//
// <sheets.json> is an object of { "<sheet name>": <rows as cell arrays> } for
// the sheets named below, with the header on row index 2, which is the shape
// this workbook uses.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { importV3Master } from "../server/research/v3-import/import.ts";
import {
  buildV3DryRunReport,
  renderV3DryRunMarkdown,
} from "../server/research/v3-import/dry-run.ts";
import {
  V3_SHEET_IMAGE_MANIFEST,
  V3_SHEET_OFFER_INDEX,
  V3_SHEET_PEPTIDE_MASTER,
  V3_SHEET_PRICE_BOOK,
  type V3Cell,
} from "../server/research/v3-import/workbook.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const [, , sheetsPath, ...rest] = process.argv;
if (sheetsPath === undefined) {
  console.error("usage: npx tsx scripts/v3-import-dry-run.mts <sheets.json> [--sha256 <hash>]");
  process.exit(2);
}

const shaFlag = rest.indexOf("--sha256");
const declaredSha = shaFlag === -1 ? null : rest[shaFlag + 1] ?? null;

const raw = readFileSync(sheetsPath, "utf8");
const parsed = JSON.parse(raw) as Record<string, V3Cell[][]>;

function sheet(name: string) {
  const rows = parsed[name];
  if (rows === undefined) {
    console.error(`the sheets file has no sheet named "${name}"`);
    process.exit(2);
  }
  return { name, rows };
}

const result = importV3Master({
  offerIndex: sheet(V3_SHEET_OFFER_INDEX),
  priceBook: sheet(V3_SHEET_PRICE_BOOK),
  imageManifest: sheet(V3_SHEET_IMAGE_MANIFEST),
  peptideMaster: sheet(V3_SHEET_PEPTIDE_MASTER),
});

const report = buildV3DryRunReport(result);
const markdown = renderV3DryRunMarkdown(report, {
  fileName: "XENIOS_RESEARCH_COMPLETE_MASTER_2026-08-01_V3.xlsx",
  sha256: declaredSha ?? createHash("sha256").update(raw).digest("hex"),
  generatedAt: new Date().toISOString().slice(0, 10),
});

const target = path.join(ROOT, "docs", "research-commerce", "V3_IMPORT_DRYRUN.md");
writeFileSync(target, markdown, "utf8");

console.log(`source rows      ${report.sourceRowCount}`);
console.log(`accepted         ${report.accepted}`);
console.log(`rejected         ${report.rejected}`);
console.log(`purchasable      ${report.purchasable}`);
console.log(`approved prices  ${report.withApprovedPrice}`);
console.log(`disputed variant ${report.blockedOnDisputedStrength}`);
console.log(`wrote            ${path.relative(ROOT, target)}`);

// A sample of rejections, so an operator can open the exact cells.
for (const rejection of result.rejections.slice(0, 20)) {
  console.log(
    `  reject row ${rejection.rowNumber} ${rejection.offerId ?? "(no id)"} ${rejection.reason}: ${rejection.detail}`,
  );
}
