// Production-parity CRITICAL ENDPOINT DIFF (2026-08-29 incident).
//
// Before a deploy: capture the non-sensitive behaviour of every critical
// endpoint on the CURRENT live production origin. After a deploy (or against
// a candidate preview): capture again and classify each endpoint as
//   SAME                  identical status / content-type / safe headers / shape fingerprint
//   INTENTIONAL_CHANGE    differs, and expectations.json names the change with a rationale
//   REGRESSION            differs in a way the expectations do not allow — deployment-blocking
//   HUMAN_REVIEW_REQUIRED differs only in a field marked reviewable (e.g. redirect target)
// An unexplained disappearance of a currently-live route (2xx/3xx/401/403 -> 404/5xx)
// is always REGRESSION.
//
// Captures never store bodies: only a stable SHAPE fingerprint (sorted JSON key
// paths for JSON; tag/attribute skeleton for HTML) so no customer data, token or
// secret can land in an evidence file. No credentials are sent.
//
// Usage:
//   node scripts/release/critical-endpoint-diff.mjs capture --base-url https://xeniostechnology.com --out baseline.json
//   node scripts/release/critical-endpoint-diff.mjs capture --base-url http://127.0.0.1:5184 --out candidate.json
//   node scripts/release/critical-endpoint-diff.mjs compare --baseline baseline.json --candidate candidate.json \
//        --expectations scripts/release/critical-endpoint-expectations.json --out diff.json
// Exit code: 0 when no REGRESSION and no HUMAN_REVIEW_REQUIRED remains; 1 on REGRESSION; 2 on HUMAN_REVIEW_REQUIRED only.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_ENDPOINTS = Object.freeze([
  // method, path, class
  ["GET", "/api/health", "health"],
  ["GET", "/", "marketing-document"],
  ["GET", "/research", "research-document"],
  ["GET", "/research/early-access", "research-document"],
  ["GET", "/research/early-access/order-request", "research-document"],
  ["GET", "/research/access-hub", "research-document"],
  ["GET", "/research/policies/accessibility", "research-document"],
  ["GET", "/research/quality", "research-document"],
  ["GET", "/research/partners", "research-document"],
  ["GET", "/api/research/early-access/assisted-orders/config", "assisted-order-config-door"],
  ["GET", "/api/research/early-access/assisted-orders/catalog", "assisted-order-read-door"],
  ["GET", "/api/research/early-access/session", "early-access-session"],
  ["GET", "/api/research/early-access/cart/capability", "early-access-cart-capability"],
  ["GET", "/api/research/early-access/catalog", "catalog-read"],
  ["GET", "/research/sign-in", "sign-in-boundary"],
  ["GET", "/research/account", "account-unauthorized-boundary"],
  ["GET", "/api/research/customer-account/overview", "account-api-unauthorized-boundary"],
  ["GET", "/api/care/status", "care-public-status"],
  ["GET", "/api/care/tebra/configuration", "care-tebra-public-config"],
  ["GET", "/care", "care-document"],
  ["GET", "/care/appointments", "care-document"],
  ["GET", "/hino", "static-microsite-redirect"],
  ["GET", "/hino/", "static-microsite"],
  ["GET", "/robots.txt", "robots"],
  ["GET", "/sitemap.xml", "sitemap"],
  ["GET", "/research/this-route-does-not-exist-xr-critical-diff", "authoritative-404"],
  ["GET", "/api/this-route-does-not-exist-xr-critical-diff", "api-404"],
]);

const SAFE_HEADERS = ["content-type", "x-robots-tag", "cache-control", "location", "content-security-policy", "referrer-policy"];

export function shapeFingerprint(contentType, body) {
  const ct = (contentType || "").toLowerCase();
  if (ct.includes("application/json")) {
    try {
      const parsed = JSON.parse(body);
      const paths = [];
      const walk = (value, prefix) => {
        if (Array.isArray(value)) {
          paths.push(prefix + "[]");
          if (value.length > 0) walk(value[0], prefix + "[]");
          return;
        }
        if (value && typeof value === "object") {
          for (const key of Object.keys(value).sort()) walk(value[key], prefix ? prefix + "." + key : key);
          return;
        }
        paths.push(prefix + ":" + (value === null ? "null" : typeof value));
      };
      walk(parsed, "");
      // A few booleans carry the FEATURE STATE, not customer data: keep them so
      // "enabled:true -> enabled:false" is a visible change, never a hidden one.
      const state = parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? Object.entries(parsed).filter(([k, v]) => typeof v === "boolean" && /^(enabled|authenticated|openAccess|available|status)$/.test(k)).map(([k, v]) => `${k}=${v}`)
        : [];
      return { kind: "json", fingerprint: sha(paths.join("\n")), keyPaths: paths.length, state };
    } catch {
      return { kind: "json-unparseable", fingerprint: sha(body.length.toString()), keyPaths: 0, state: [] };
    }
  }
  if (ct.includes("text/html")) {
    const skeleton = body
      .replace(/<script[\s\S]*?<\/script>/gi, "<script/>")
      .replace(/<style[\s\S]*?<\/style>/gi, "<style/>")
      .replace(/>[^<]+</g, "><")            // drop text nodes
      .replace(/(href|src|content|href)="[^"]*"/gi, '$1="…"') // drop attribute values
      .replace(/\s+/g, " ");
    const markers = {
      root: /id="root"/.test(body),
      metaRobots: (body.match(/<meta name="robots" content="([^"]*)"/) || [])[1] || null,
      canonical: (body.match(/<link rel="canonical" href="([^"]*)"/) || [])[1] || null,
      jsonLd: (body.match(/application\/ld\+json/g) || []).length,
      title: (body.match(/<title>([^<]*)<\/title>/) || [])[1] || null,
    };
    return { kind: "html", fingerprint: sha(skeleton), markers };
  }
  return { kind: ct.split(";")[0] || "unknown", fingerprint: sha(body.length + ":" + body.slice(0, 64)) };
}

function sha(text) {
  return createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);
}

export async function captureEndpoint(baseUrl, method, route) {
  const url = baseUrl.replace(/\/$/, "") + route;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, { method, redirect: "manual", headers: { accept: "*/*" } });
    const body = await response.text();
    const headers = {};
    for (const name of SAFE_HEADERS) {
      const value = response.headers.get(name);
      if (value !== null) headers[name] = name === "location" ? value.replace(/^https?:\/\/[^/]+/, "") : value;
    }
    return {
      method,
      path: route,
      status: response.status,
      contentType: (response.headers.get("content-type") || "").split(";")[0],
      headers,
      shape: shapeFingerprint(response.headers.get("content-type") || "", body),
      ms: Date.now() - startedAt,
    };
  } catch (error) {
    return { method, path: route, status: 0, contentType: "", headers: {}, shape: { kind: "unreachable", fingerprint: "" }, error: String(error && error.message ? error.message : error), ms: Date.now() - startedAt };
  }
}

export async function capture(baseUrl, endpoints = DEFAULT_ENDPOINTS, capturedAt = new Date().toISOString()) {
  const records = [];
  for (const [method, route, routeClass] of endpoints) {
    const record = await captureEndpoint(baseUrl, method, route);
    records.push({ ...record, routeClass });
  }
  return { schemaVersion: 1, kind: "critical-endpoint-capture", baseUrl, capturedAt, records };
}

function isLive(status) {
  return (status >= 200 && status < 400) || status === 401 || status === 403;
}

export function classify(baseline, candidate, expectations) {
  const byKey = (records) => new Map(records.map((r) => [r.method + " " + r.path, r]));
  const b = byKey(baseline.records); const c = byKey(candidate.records);
  const allowed = new Map((expectations.intentionalChanges || []).map((x) => [x.method + " " + x.path, x]));
  const results = [];
  for (const [key, before] of b) {
    const after = c.get(key);
    if (!after) { results.push({ key, classification: "REGRESSION", reason: "endpoint missing from the candidate capture" }); continue; }
    const diffs = [];
    if (before.status !== after.status) diffs.push(`status ${before.status} -> ${after.status}`);
    if (before.contentType !== after.contentType) diffs.push(`content-type ${before.contentType || "-"} -> ${after.contentType || "-"}`);
    for (const h of SAFE_HEADERS) {
      const x = before.headers[h]; const y = after.headers[h];
      if ((x ?? null) !== (y ?? null)) diffs.push(`header ${h}: ${x ?? "-"} -> ${y ?? "-"}`);
    }
    const stateBefore = (before.shape.state || []).join(","); const stateAfter = (after.shape.state || []).join(",");
    if (stateBefore !== stateAfter) diffs.push(`feature-state ${stateBefore || "-"} -> ${stateAfter || "-"}`);
    if (before.shape.kind !== after.shape.kind) diffs.push(`shape-kind ${before.shape.kind} -> ${after.shape.kind}`);
    else if (before.shape.fingerprint !== after.shape.fingerprint) diffs.push("shape-fingerprint changed");
    const disappeared = isLive(before.status) && !isLive(after.status);
    if (diffs.length === 0) { results.push({ key, classification: "SAME", diffs }); continue; }
    const rule = allowed.get(key);
    if (disappeared && !(rule && rule.allowDisappearance === true)) {
      results.push({ key, classification: "REGRESSION", reason: "a currently-live critical endpoint disappeared (" + diffs.join("; ") + ")", diffs });
      continue;
    }
    if (rule) {
      const unexplained = diffs.filter((d) => !(rule.allow || []).some((pattern) => new RegExp(pattern).test(d)));
      if (unexplained.length === 0) { results.push({ key, classification: "INTENTIONAL_CHANGE", rationale: rule.rationale, diffs }); continue; }
      if ((rule.reviewable || []).length && unexplained.every((d) => (rule.reviewable || []).some((pattern) => new RegExp(pattern).test(d)))) {
        results.push({ key, classification: "HUMAN_REVIEW_REQUIRED", rationale: rule.rationale, diffs: unexplained }); continue;
      }
      results.push({ key, classification: "REGRESSION", reason: "change not covered by the expectation: " + unexplained.join("; "), diffs });
      continue;
    }
    // shape-only fingerprint drift on an HTML document with unchanged status/headers/markers is reviewable, not blocking
    const onlyShape = diffs.every((d) => d === "shape-fingerprint changed");
    results.push({ key, classification: onlyShape ? "HUMAN_REVIEW_REQUIRED" : "REGRESSION", reason: onlyShape ? "document skeleton changed without an expectation entry" : diffs.join("; "), diffs });
  }
  for (const key of c.keys()) if (!b.has(key)) results.push({ key, classification: "INTENTIONAL_CHANGE", rationale: "endpoint absent from the baseline capture (new)", diffs: [] });
  const counts = { SAME: 0, INTENTIONAL_CHANGE: 0, REGRESSION: 0, HUMAN_REVIEW_REQUIRED: 0 };
  for (const r of results) counts[r.classification] += 1;
  return { schemaVersion: 1, kind: "critical-endpoint-diff", baseline: { baseUrl: baseline.baseUrl, capturedAt: baseline.capturedAt }, candidate: { baseUrl: candidate.baseUrl, capturedAt: candidate.capturedAt }, counts, results, verdict: counts.REGRESSION > 0 ? "REGRESSION" : counts.HUMAN_REVIEW_REQUIRED > 0 ? "HUMAN_REVIEW_REQUIRED" : "PASS" };
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const command = process.argv[2];
  if (command === "capture") {
    const baseUrl = arg("--base-url"); const out = arg("--out");
    if (!baseUrl || !out) { console.error("capture requires --base-url and --out"); process.exit(64); }
    const result = await capture(baseUrl);
    writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
    for (const r of result.records) console.log(`${String(r.status).padStart(3)} ${r.method} ${r.path} ${r.contentType} ${r.shape.state ? r.shape.state.join(",") : ""}`);
    console.log(`captured ${result.records.length} endpoints from ${baseUrl} -> ${out}`);
  } else if (command === "compare") {
    const baseline = JSON.parse(readFileSync(arg("--baseline"), "utf8"));
    const candidate = JSON.parse(readFileSync(arg("--candidate"), "utf8"));
    const expectations = JSON.parse(readFileSync(arg("--expectations", path.join(HERE, "critical-endpoint-expectations.json")), "utf8"));
    const diff = classify(baseline, candidate, expectations);
    const out = arg("--out"); if (out) writeFileSync(out, JSON.stringify(diff, null, 2) + "\n");
    for (const r of diff.results) console.log(`${r.classification.padEnd(22)} ${r.key}${r.diffs && r.diffs.length ? "  [" + r.diffs.join("; ") + "]" : ""}${r.rationale ? "  — " + r.rationale : ""}${r.reason ? "  — " + r.reason : ""}`);
    console.log(`critical endpoint diff: ${JSON.stringify(diff.counts)} verdict=${diff.verdict}`);
    process.exit(diff.verdict === "REGRESSION" ? 1 : diff.verdict === "HUMAN_REVIEW_REQUIRED" ? 2 : 0);
  } else {
    console.error("usage: critical-endpoint-diff.mjs capture|compare ...");
    process.exit(64);
  }
}
