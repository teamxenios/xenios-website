// Raw HTTP document evidence (what a crawler sees before any script runs).
//
//   node scripts/evidence/capture-http-evidence.mjs --base-url http://127.0.0.1:5184 --out-dir <dir> [--sha <sha>] [--routes <json>] [--only /a,/b]
//
// Per route: status code, x-robots-tag, content-type, raw <title>, canonical,
// Open Graph, meta robots, JSON-LD types; plus sitemap parity against
// /sitemap.xml and the authoritative-404 probe. Writes http-evidence.json and
// the raw HTML of each response under raw-html/ for review.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluateHttpHead,
  evaluateRobotsTxt,
  evaluateSitemapLocs,
  extractHtmlMetadata,
  parseSitemapLocs,
} from "./lib/html-metadata.mjs";
import { slug } from "./lib/report.mjs";
import { gitSha } from "./capture-browser-matrix.mjs";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  fetchPreviewProvenance,
} from "./lib/provenance.mjs";
import { assertExternalMicrositeInventory } from "./lib/route-contract.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

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

export function assertEvidenceHttpUrl(rawUrl, allowedOrigin) {
  const url = new URL(rawUrl);
  if (url.protocol !== "http:" || url.origin !== allowedOrigin) {
    throw new Error(`HTTP evidence refused off-origin URL ${url.toString()}`);
  }
  return url.toString();
}

async function fetchDocument(url, { follow = 3, allowedOrigin } = {}) {
  if (!allowedOrigin) throw new Error("HTTP evidence requires an explicit allowed origin");
  const redirects = [];
  let current = assertEvidenceHttpUrl(url, allowedOrigin);
  for (let hop = 0; hop <= follow; hop++) {
    const res = await fetch(current, { redirect: "manual", headers: { accept: "text/html,application/xhtml+xml", "user-agent": "xenios-evidence/1 (raw-http)" } });
    const headers = {};
    for (const [k, v] of res.headers) headers[k.toLowerCase()] = v;
    const bodyBytes = Buffer.from(await res.arrayBuffer());
    const body = bodyBytes.toString("utf8");
    if (res.status >= 300 && res.status < 400 && headers.location && hop < follow) {
      const next = assertEvidenceHttpUrl(new URL(headers.location, current), allowedOrigin);
      redirects.push({ from: current, status: res.status, to: next });
      current = next;
      continue;
    }
    return { status: res.status, headers, body, bodyBytes, redirects, finalUrl: current };
  }
  throw new Error(`too many redirects from ${url}`);
}

export async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help || !args.baseUrl || !args.outDir) {
    console.log("usage: capture-http-evidence.mjs --base-url <url> --out-dir <dir> [--sha <sha>] [--routes <json>] [--only /a,/b]");
    process.exit(args.help ? 0 : 2);
  }
  const captureRuntime = assertPinnedExecutingRuntime();
  const inventory = JSON.parse(readFileSync(resolve(args.routes), "utf8"));
  assertExternalMicrositeInventory(inventory.routes);
  const routes = inventory.routes.filter((r) => !args.only || args.only.includes(r.path));
  const sha = args.sha ?? gitSha() ?? "UNKNOWN";
  const checkout = assertCleanCandidateCheckout({ sha });
  const provenance = await fetchPreviewProvenance(args.baseUrl, checkout);
  const outDir = resolve(args.outDir);
  mkdirSync(join(outDir, "raw-html"), { recursive: true });
  const origin = new URL(args.baseUrl).origin;
  const sitemapSourcePath = join(repoRoot, "client", "public", "sitemap.xml");
  const robotsSourcePath = join(repoRoot, "client", "public", "robots.txt");
  const sitemapSource = readFileSync(sitemapSourcePath);
  const robotsSource = readFileSync(robotsSourcePath);

  let sitemap = { status: null, locs: null, error: null };
  try {
    const res = await fetchDocument(new URL("/sitemap.xml", args.baseUrl).toString(), { allowedOrigin: origin });
    const locs = res.status === 200 ? parseSitemapLocs(res.body) : null;
    sitemap = {
      status: res.status,
      locs,
      error: null,
      count: locs?.length ?? 0,
      bodyPath: "raw-html/sitemap.xml",
      bodySha256: sha256(res.bodyBytes),
      bodyBytes: res.bodyBytes.length,
      sourcePath: "client/public/sitemap.xml",
      sourceSha256: sha256(sitemapSource),
      exactSourceMatch: res.bodyBytes.equals(sitemapSource),
      locsValidation: evaluateSitemapLocs(locs),
    };
    writeFileSync(join(outDir, sitemap.bodyPath), res.bodyBytes);
  } catch (e) {
    sitemap.error = String(e.message ?? e);
  }
  let robots = { status: null };
  try {
    const res = await fetchDocument(new URL("/robots.txt", args.baseUrl).toString(), { allowedOrigin: origin });
    robots = {
      status: res.status,
      bodyPath: "raw-html/robots.txt",
      bodySha256: sha256(res.bodyBytes),
      bodyBytes: res.bodyBytes.length,
      sourcePath: "client/public/robots.txt",
      sourceSha256: sha256(robotsSource),
      exactSourceMatch: res.bodyBytes.equals(robotsSource),
      directivesValidation: evaluateRobotsTxt(res.body),
    };
    writeFileSync(join(outDir, robots.bodyPath), res.bodyBytes);
  } catch (e) {
    robots.error = String(e.message ?? e);
  }

  const records = [];
  for (const route of routes) {
    const url = new URL(route.path, args.baseUrl).toString();
    const timestampUtc = new Date().toISOString();
    try {
      const res = await fetchDocument(url, { allowedOrigin: origin });
      const meta = extractHtmlMetadata(res.body);
      const file = `raw-html/${slug(route.path === "/" ? "root" : route.path)}.html`;
      writeFileSync(join(outDir, file), res.bodyBytes);
      const assertions = evaluateHttpHead({ route, status: res.status, headers: res.headers, meta, sitemapLocs: sitemap.locs, origin });
      records.push({
        candidateSha: sha,
        route: route.path,
        surface: route.surface,
        indexable: route.indexable,
        timestampUtc,
        status: res.status,
        redirects: res.redirects,
        finalUrl: res.finalUrl,
        headers: pick(res.headers, ["content-type", "x-robots-tag", "cache-control", "location", "content-security-policy", "x-frame-options", "strict-transport-security", "referrer-policy"]),
        metadata: meta,
        rawHtmlPath: file,
        rawHtmlSha256: sha256(res.bodyBytes),
        assertions,
        result: assertions.some((a) => a.result === "FAIL") ? "AUTOMATED_FAIL" : "AUTOMATED_PASS",
      });
      console.log(`${records.at(-1).result.padEnd(15)} ${String(res.status).padStart(3)} ${route.path}  ${assertions.filter((a) => a.result === "FAIL").map((a) => a.id).join(",")}`);
    } catch (e) {
      records.push({ candidateSha: sha, route: route.path, surface: route.surface, timestampUtc, status: null, error: String(e.message ?? e), assertions: [{ id: "STATUS_CODE", result: "FAIL", detail: String(e.message ?? e) }], result: "AUTOMATED_FAIL" });
      console.log(`AUTOMATED_FAIL  ERR ${route.path}  ${e.message}`);
    }
  }
  const finalProvenance = await fetchPreviewProvenance(args.baseUrl, checkout);
  if (JSON.stringify(finalProvenance) !== JSON.stringify(provenance)) {
    throw new Error("preview provenance changed during raw HTTP evidence capture");
  }
  const doc = {
    schemaVersion: 2,
    kind: "http-evidence",
    candidateSha: sha,
    baseUrl: args.baseUrl,
    provenance,
    capturedAtUtc: new Date().toISOString(),
    tool: { name: "scripts/evidence/capture-http-evidence.mjs", node: captureRuntime.nodeVersion, npm: captureRuntime.npmVersion },
    sitemap,
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
