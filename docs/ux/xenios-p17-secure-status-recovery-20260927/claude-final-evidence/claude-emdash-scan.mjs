// Claude independent em-dash scanner (review-only; not part of the candidate).
// Usage: node claude-emdash-scan.mjs <repoRoot> [--build]
// Source mode scans tracked text files under client/, server/, shared/, content/, config/ and
// script/ + scripts/ (non-test), wider than the candidate gate, and labels each hit as
// "comment" or "code/copy" with a line-level heuristic for manual review.
// Build mode scans every text file under dist/ (html/js/cjs/mjs/css/json/txt/svg/webmanifest/xml).
import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, extname } from "node:path";

const root = process.argv[2];
const buildMode = process.argv.includes("--build");
const FORMS = [
  ["U+2014", /—/g],
  ["&mdash;", /&mdash;/gi],
  ["&#8212;", /&#8212;/g],
  ["&#x2014;", /&#x2014;/gi],
  ["\\u2014", /\\u2014/gi],
];
const TEXT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".html", ".css", ".md", ".txt", ".svg", ".webmanifest", ".xml", ".sql", ".yml", ".yaml"]);
const TEST = /(^|\/)(__tests__|e2e)(\/|$)|\.(test|spec|node-test)\.[cm]?[jt]sx?$/i;

function classify(line) {
  const t = line.trim();
  if (/^(\/\/|\*|\/\*|<!--|#|--)/.test(t) || /^\{?\s*\/\*/.test(t)) return "comment";
  if (/\/\/[^'"`]*—/.test(line) && !/["'`][^"'`]*—/.test(line)) return "comment";
  return "code/copy";
}

function scanText(file, text, out) {
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    for (const [form, re] of FORMS) {
      re.lastIndex = 0;
      const n = (line.match(re) || []).length;
      if (n) out.push({ file, line: i + 1, form, count: n, kind: buildMode ? "build" : classify(line), text: line.trim().slice(0, 180) });
    }
  });
}

const findings = [];
if (!buildMode) {
  const tracked = execFileSync("git", ["ls-files", "client", "server", "shared", "content", "config", "script", "scripts"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  for (const f of tracked) {
    if (TEST.test(f) || !TEXT_EXT.has(extname(f).toLowerCase())) continue;
    scanText(f, readFileSync(join(root, f), "utf8"), findings);
  }
} else {
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  const dist = join(root, "dist");
  if (existsSync(dist)) for (const p of walk(dist)) {
    if (!TEXT_EXT.has(extname(p).toLowerCase())) continue;
    scanText(p.slice(root.length + 1).replaceAll("\\", "/"), readFileSync(p, "utf8"), findings);
  }
}

const total = findings.reduce((s, f) => s + f.count, 0);
const byTop = {};
for (const f of findings) { const k = `${f.file.split("/").slice(0, 2).join("/")} [${f.kind}]`; byTop[k] = (byTop[k] || 0) + f.count; }
console.log(JSON.stringify({ mode: buildMode ? "build" : "source", total, byTop, findings }, null, 1));
