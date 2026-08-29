// Scan an evidence output directory for secrets / PII markers.
//
//   node scripts/evidence/pii-scan.mjs --out-dir <dir> [--fail-on-findings]
//
// Every artifact must be classified and validated. UTF-8 text and every file
// NAME are scanned with the patterns in lib/pii-scan.mjs. Strict PNG screenshots
// are listed for mandatory manual PII/PHI review; unknown extensions, malformed
// text, or opaque binary containers make coverage incomplete. Writes
// pii-scan.json.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateEvidenceArtifactBytes } from "./lib/evidence-artifact-scan-policy.mjs";
import { scanFileName, scanText, summariseFindings } from "./lib/pii-scan.mjs";

function parseArgs(argv) {
  const out = { failOnFindings: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--out-dir") out.outDir = argv[++i];
    else if (a === "--sha") out.sha = argv[++i];
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
  const textArtifacts = [];
  const unscannableArtifacts = [];
  const fileInventory = [];
  let textFiles = 0;
  for (const file of walk(outDir)) {
    const rel = relative(outDir, file).replace(/\\/g, "/");
    if (["pii-scan.json", "evidence-manifest.json"].includes(rel)) continue;
    const bytes = readFileSync(file);
    fileInventory.push({
      path: rel,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    findings.push(...scanFileName(rel));
    const validation = validateEvidenceArtifactBytes(rel, bytes);
    if (!validation.valid) {
      unscannableArtifacts.push({ path: rel, reason: validation.reason });
    } else if (validation.kind === "MANUAL_IMAGE") {
      screenshots.push(rel);
    } else if (validation.kind === "TEXT") {
      textFiles++;
      textArtifacts.push(rel);
      findings.push(...scanText(validation.text, { source: rel }));
    }
  }
  fileInventory.sort((a, b) => a.path.localeCompare(b.path));
  screenshots.sort((a, b) => a.localeCompare(b));
  textArtifacts.sort((a, b) => a.localeCompare(b));
  unscannableArtifacts.sort((a, b) => a.path.localeCompare(b.path));
  return {
    findings,
    screenshots,
    textArtifacts,
    unscannableArtifacts,
    textFiles,
    fileInventory,
  };
}

function discoverCandidateSha(outDir) {
  const values = [];
  for (const name of ["browser-matrix.json", "synthetic-journey-evidence.json", "http-evidence.json"]) {
    const file = join(outDir, name);
    if (!existsSync(file)) continue;
    try {
      const value = JSON.parse(readFileSync(file, "utf8"))?.candidateSha;
      if (value) values.push(value);
    } catch {}
  }
  return new Set(values).size === 1 ? values[0] : null;
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.outDir) {
    console.log("usage: pii-scan.mjs --out-dir <dir> [--sha <exact-sha>] [--fail-on-findings]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  const candidateSha = args.sha ?? discoverCandidateSha(outDir);
  if (!/^[a-f0-9]{40}$/u.test(candidateSha ?? "")) {
    throw new Error("pii-scan requires one exact 40-character candidate SHA shared by the evidence inputs");
  }
  const {
    findings,
    screenshots,
    textArtifacts,
    unscannableArtifacts,
    textFiles,
    fileInventory,
  } = scanDirectory(outDir);
  const summary = summariseFindings(findings);
  if (summary.result === "CLEAN" && unscannableArtifacts.length > 0) {
    summary.result = "INCOMPLETE";
  }
  const doc = {
    schemaVersion: 4,
    kind: "evidence-pii-scan",
    candidateSha,
    scannedAtUtc: new Date().toISOString(),
    evidenceRoot: ".",
    textFilesScanned: textFiles,
    textArtifacts,
    fileInventory,
    inventorySha256: createHash("sha256").update(JSON.stringify(fileInventory)).digest("hex"),
    scanCoverage: {
      result: unscannableArtifacts.length === 0 ? "COMPLETE" : "INCOMPLETE",
      classifiedFiles: fileInventory.length - unscannableArtifacts.length,
      totalFiles: fileInventory.length,
      textFiles,
      manualImageFiles: screenshots.length,
      unscannableFiles: unscannableArtifacts.length,
    },
    summary,
    findings,
    screenshots,
    unscannableArtifacts,
    screenshotReview: "MANUAL_PENDING: validated PNG pixels cannot be text-scanned; each capture's *.text.txt page text was scanned instead.",
  };
  writeFileSync(join(outDir, "pii-scan.json"), JSON.stringify(doc, null, 2));
  console.log(`pii-scan: ${doc.summary.result} (${findings.length} findings across ${textFiles} text files; ${screenshots.length} screenshots need manual review; ${unscannableArtifacts.length} unscannable artifacts) -> ${join(outDir, "pii-scan.json")}`);
  for (const f of findings.slice(0, 30)) console.log(`  ${f.id.padEnd(18)} ${f.source}:${f.line}  ${f.redacted}`);
  for (const artifact of unscannableArtifacts.slice(0, 30)) {
    console.log(`  UNSCANNABLE        ${artifact.path}  ${artifact.reason}`);
  }
  if (args.failOnFindings && (findings.length || unscannableArtifacts.length)) process.exit(1);
  return doc;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
