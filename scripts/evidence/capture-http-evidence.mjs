#!/usr/bin/env node
// Raw HTTP document evidence (what a crawler sees before any script runs).
//
//   node scripts/evidence/capture-http-evidence.mjs --base-url http://127.0.0.1:5184 --out-dir <dir> [--sha <sha>] [--routes <json>] [--only /a,/b]
//
// Per route: status code, x-robots-tag, content-type, raw <title>, canonical,
// Open Graph, meta robots, JSON-LD types; plus sitemap parity against
// /sitemap.xml and the authoritative-404 probe. Writes http-evidence.json and
// the raw HTML of each response under raw-html/ for review.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { evaluateHttpHead, extractHtmlMetadata, parseSitemapLocs } from "./lib/html-metadata.mjs";
import { slug } from "./lib/report.mjs";
import { gitSha } from "./capture-browser-matrix.mjs";

const here = dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const out = { routes: join(here, "routes.public.json"), only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--base-url") out.baseUrl = next();
    else if (a === "--out-dir") out.outDir = next();
    else if (a === "--sha") out.sha = next();
    else if (a === "--routes") out.routes = next();
    else if (a === "--only") out.only = next().split(",").map((s) => s.trim());
    else if (a === "--help" || a === "-h") out.help = true;
    else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

async function fetchDocument(url) {
  const res = await fetch(url, { redirect: "manual", headers: { accept: "text/html,application/xhtml+xml", "user-agent": "xenios-evidence/1 (raw-http)" } });
  const headers = {};
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
  const body = await res.text();
  return { status: res.status, headers, body };
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.baseUrl || !args.outDir) {
    console.log("usage: capture-http-evidence.mjs --base-url <url> --out-dir <dir> [--sha <sha>] [--routes <json>] [--only /a,/b]");
    process.exit(args.help ? 0 : 2);
  }
  const outDir = resolve(args.outDir);
  mkdirSync(join(outDir, "raw-html"), { recursive: true });
  const inventory = JSON.parse(readFileSync(resolve(args.routes), "utf8"));
  const routes = inventory.routes.filter((r) => !args.only || args.only.includes(r.path));
  const sha = args.sha ?? gitSha() ?? "UNKNOWN";
  const origin = new URL(args.baseUrl).origin;

  let sitemap = { status: null, locs: null, error: null };
  try {
    const res = await fetchDocument(new URL("/sitemap.xml", args.baseUrl).toString());
    sitemap = { status: res.status, locs: res.status === 200 ? parseSitemapLocs(res.body) : null, error: null, count: res.status === 200 ? parseSitemapLocs(res.body).length : 0 };
    writeFileSync(join(outDir, "raw-html", "sitemap.xml"), res.body);
  } catch (e) {
    sitemap.error = String(e.message ?? e);
  }
  let robots = { status: null, body: null };
  try {
    const res = await fetchDocument(new URL("/robots.txt", args.baseUrl).toString());
    robots = { status: res.status, body: res.body.slice(0, 4000) };
  } catch (e) {
    robots.error = String(e.message ?? e);
  }

  const records = [];
  for (const route of routes) {
    const url = new URL(route.path, args.baseUrl).toString();
    const timestampUtc = new Date().toISOString();
    try {
      const res = await fetchDocument(url);
      const meta = extractHtmlMetadata(res.body);
      const file = `raw-html/${slug(route.path === "/" ? "root" : route.path)}.html`;
      writeFileSync(join(outDir, file), res.body);
      const assertions = evaluateHttpHead({ route, status: res.status, headers: res.headers, meta, sitemapLocs: sitemap.locs, origin });
      records.push({
        candidateSha: sha,
        route: route.path,
        surface: route.surface,
        indexable: route.indexable,
        timestampUtc,
        status: res.status,
        headers: pick(res.headers, ["content-type", "x-robots-tag", "cache-control", "location", "content-security-policy", "x-frame-options", "strict-transport-security", "referrer-policy"]),
        metadata: meta,
        rawHtmlPath: file,
        assertions,
        result: assertions.some((a) => a.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      });
      console.log(`${records.at(-1).result.padEnd(15)} ${String(res.status).padStart(3)} ${route.path}  ${assertions.filter((a) => a.result === "FAIL").map((a) => a.id).join(",")}`);
    } catch (e) {
      records.push({ candidateSha: sha, route: route.path, surface: route.surface, timestampUtc, status: null, error: String(e.message ?? e), assertions: [{ id: "STATUS_CODE", result: "FAIL", detail: String(e.message ?? e) }], result: "AUTOMATED_FAIL" });
      console.log(`AUTOMATED_FAIL  ERR ${route.path}  ${e.message}`);
    }
  }
  const doc = {
    schemaVersion: 2,
    kind: "http-evidence",
    candidateSha: sha,
    baseUrl: args.baseUrl,
    capturedAtUtc: new Date().toISOString(),
    tool: { name: "scripts/evidence/capture-http-evidence.mjs", node: process.version },
    sitemap: { status: sitemap.status, count: sitemap.count ?? null, error: sitemap.error },
    robots,
    records,
    summary: {
      records: records.length,
      automatedPass: records.filter((r) => r.result === "AUTOMATED_PASS").length,
      automatedFail: records.filter((r) => r.result === "AUTOMATED_FAIL").length,
      failingAssertionIds: [...new Set(records.flatMap((r) => r.assertions.filter((a) => a.result === "FAIL").map((a) => a.id)))],
    },
  };
  writeFileSync(join(outDir, "http-evidence.json"), JSON.stringify(doc, null, 2));
  console.log(`\n${doc.summary.records} records: ${doc.summary.automatedPass} pass, ${doc.summary.automatedFail} fail -> ${join(outDir, "http-evidence.json")}`);
  return doc;
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
