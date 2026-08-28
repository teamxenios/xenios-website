// Scan an evidence output directory for secrets / PII markers.
//
//   node scripts/evidence/pii-scan.mjs --out-dir <dir> [--fail-on-findings]
//
// Text files (json, md, txt, html, xml) and every file NAME are scanned with
// the patterns in lib/pii-scan.mjs. Screenshots cannot be text-scanned; they
// are listed under `screenshots` for the mandatory manual PII/PHI review and
// their sibling `*.text.txt` page-text dumps ARE scanned. Writes pii-scan.json.
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { scanFileName, scanText, summariseFindings } from "./lib/pii-scan.mjs";

const TEXT_EXT = new Set([".json", ".md", ".txt", ".html", ".xml", ".csv", ".log"]);
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

function parseArgs(argv) {
  const out = { failOnFindings: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") out.outDir = argv[++i];
    else if (a === "--fail-on-findings") out.failOnFindings = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

export function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

export function scanDirectory(outDir) {
  const findings = [];
  const screenshots = [];
  let textFiles = 0;
  for (const file of walk(outDir)) {
    const rel = relative(outDir, file).replace(/\\/g, "/");
    if (rel === "pii-scan.json") continue;
    const ext = rel.slice(rel.lastIndexOf(".")).toLowerCase();
    findings.push(...scanFileName(rel));
    if (IMAGE_EXT.has(ext)) screenshots.push(rel);
    else if (TEXT_EXT.has(ext)) {
      textFiles++;
      findings.push(...scanText(readFileSync(file, "utf8"), { source: rel }));
    }
  }
  return { findings, screenshots, textFiles };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.outDir) {
    console.log("usage: pii-scan.mjs --out-dir <dir> [--fail-on-findings]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  const { findings, screenshots, textFiles } = scanDirectory(outDir);
  const doc = {
    schemaVersion: 2,
    kind: "evidence-pii-scan",
    scannedAtUtc: new Date().toISOString(),
    outDir,
    textFilesScanned: textFiles,
    summary: summariseFindings(findings),
    findings,
    screenshots,
    screenshotReview: "MANUAL_PENDING: images cannot be text-scanned; each capture's *.text.txt page text was scanned instead.",
  };
  writeFileSync(join(outDir, "pii-scan.json"), JSON.stringify(doc, null, 2));
  console.log(`pii-scan: ${doc.summary.result} (${findings.length} findings across ${textFiles} text files; ${screenshots.length} screenshots need manual review) -> ${join(outDir, "pii-scan.json")}`);
  for (const f of findings.slice(0, 30)) console.log(`  ${f.id.padEnd(18)} ${f.source}:${f.line}  ${f.redacted}`);
  if (args.failOnFindings && findings.length) process.exit(1);
  return doc;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
