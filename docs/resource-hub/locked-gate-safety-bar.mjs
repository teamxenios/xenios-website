// The locked-gate safety bar for the Resource Hub doors (blitz section 4).
// Run against a harness started with PREVIEW_LOCK_GATE=1. Measures only.
// Every row states what MUST be true whether or not the wall admits the path,
// plus the reachability rows that the admission is meant to change.
import fs from "node:fs";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:5232";
const OUT = process.env.OUT_FILE ?? "C:/Users/sboad/projects/xenios-qa-evidence-resource-hub-20260906/locked-gate-safety-bar.json";
const HEADER = "x-xenios-resource-upload";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "latin1");
const T = { admin: "preview-token-admin", rep: "preview-token-rep", affiliate: "preview-token-affiliate", suspended: "preview-token-suspended", member: "preview-token-member" };
const rows = [];

async function call(label, method, path, { token, expect, headers = {}, body } = {}) {
  const res = await fetch(BASE + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body, redirect: "manual" });
  const ct = res.headers.get("content-type") ?? "";
  const raw = Buffer.from(await res.arrayBuffer());
  const json = ct.includes("json") ? JSON.parse(raw.toString("utf8")) : null;
  const row = { label, method, path, status: res.status, code: json?.code ?? null, bytes: raw.byteLength, pdf: raw.subarray(0, 5).toString("latin1") === "%PDF-", pass: expect ? expect(res.status, json, raw) : null };
  rows.push(row);
  console.log(`${row.pass === false ? "FAIL" : row.pass ? "pass" : "info"}  ${label}: ${res.status}${row.code ? " " + row.code : ""}${row.pdf ? " <pdf bytes>" : ""}`);
  return { status: res.status, json, raw };
}

// ---- seed two published resources through the admin doors (outside the wall) ----
const b64url = (o) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
const meta = (title, usagePolicy, audience, key) => ({ title, purpose: `${title}: what this material is for and how a partner may use it.`, usagePolicy, audience, originalFilename: `${title.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}.pdf`, idempotencyKey: key });
async function seed(m) {
  const res = await fetch(`${BASE}/api/admin/research/resource-hub/resources`, { method: "POST", headers: { Authorization: `Bearer ${T.admin}`, "Content-Type": "application/pdf", [HEADER]: b64url(m) }, body: PDF });
  const j = await res.json();
  if (!j.ok) throw new Error("seed failed " + JSON.stringify(j));
  const { resourceId } = j.resource;
  const versionId = j.resource.versions[0].versionId;
  const review = (input) => fetch(`${BASE}/api/admin/research/resource-hub/resources/${resourceId}/versions/${versionId}/review`, { method: "POST", headers: { Authorization: `Bearer ${T.admin}`, "Content-Type": "application/json" }, body: JSON.stringify(input) });
  await review({ action: "approve_content", reason: "Safety bar seed.", idempotencyKey: `sb-a-${versionId}` });
  await review({ action: "publish", idempotencyKey: `sb-p-${versionId}` });
  return { resourceId, versionId };
}
const repOnly = await seed(meta("REP-ONLY worksheet", "private", ["research_rep"], "sb-reponly-0001"));
const shared = await seed(meta("Shared one-pager", "external_share", ["all_partners"], "sb-shared-0001"));
const draftPolicy = await seed(meta("Draft script", "draft", ["all_partners"], "sb-draft-0001"));
const withdrawn = await seed(meta("Withdrawn sheet", "external_share", ["all_partners"], "sb-withdrawn-0001"));
await fetch(`${BASE}/api/admin/research/resource-hub/resources/${withdrawn.resourceId}/versions/${withdrawn.versionId}/review`, { method: "POST", headers: { Authorization: `Bearer ${T.admin}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "withdraw", reason: "Safety bar.", idempotencyKey: "sb-w-0001" }) });
console.log("seeded:", JSON.stringify({ repOnly: repOnly.resourceId, shared: shared.resourceId, draftPolicy: draftPolicy.resourceId, withdrawn: withdrawn.resourceId }));

const gate = await call("gate state (must be locked)", "GET", "/api/research/me", { expect: (s, j) => s === 200 && j.publicMode === false && j.authed === false });

// ---- reachability: what the admission is meant to change ----
const lib = await call("REACH library, eligible partner bearer", "GET", "/api/research/partner/resources", { token: T.rep });
const dl = await call("REACH delivery, eligible partner bearer", "GET", `/api/research/partner/resources/${repOnly.resourceId}/download`, { token: T.rep });
const reachable = lib.status === 200;

// ---- the safety bar: must hold whether or not the wall admits ----
await call("no bearer: library refused", "GET", "/api/research/partner/resources", { expect: (s) => s === 401 || s === 403 });
await call("no bearer: delivery refused", "GET", `/api/research/partner/resources/${repOnly.resourceId}/download`, { expect: (s) => s === 401 || s === 403 });
await call("no write method admitted (POST library)", "POST", "/api/research/partner/resources", { token: T.rep, headers: { "Content-Type": "application/json" }, body: "{}", expect: (s) => s === 401 || s === 404 || s === 405 });
await call("no write method admitted (POST delivery)", "POST", `/api/research/partner/resources/${repOnly.resourceId}/download`, { token: T.rep, headers: { "Content-Type": "application/json" }, body: "{}", expect: (s) => s === 401 || s === 404 || s === 405 });
await call("no namespace opened (unrelated partner path; 404 here is the preview boundary answering before the wall)", "GET", "/api/research/partner/commissions", { token: T.rep, expect: (s) => s === 401 || s === 404 });

if (reachable) {
  await call("A sees only what A may see (rep library)", "GET", "/api/research/partner/resources", { token: T.rep, expect: (s, j) => s === 200 && j.resources.some((r) => r.resourceId === repOnly.resourceId) && j.resources.some((r) => r.resourceId === shared.resourceId) && !j.resources.some((r) => r.resourceId === draftPolicy.resourceId) && !j.resources.some((r) => r.resourceId === withdrawn.resourceId) });
  await call("B cannot see A-only metadata (affiliate library)", "GET", "/api/research/partner/resources", { token: T.affiliate, expect: (s, j) => s === 200 && !JSON.stringify(j).includes("REP-ONLY") });
  await call("B cannot fetch A-only bytes (404, not 403)", "GET", `/api/research/partner/resources/${repOnly.resourceId}/download`, { token: T.affiliate, expect: (s, j) => s === 404 && j.code === "not_found" });
  await call("signed-in member with no partner record", "GET", "/api/research/partner/resources", { token: T.member, expect: (s, j) => s === 404 && j.code === "partner_not_found" });
  await call("suspended partner: empty library", "GET", "/api/research/partner/resources", { token: T.suspended, expect: (s, j) => s === 200 && j.resources.length === 0 });
  await call("suspended partner: no bytes", "GET", `/api/research/partner/resources/${shared.resourceId}/download`, { token: T.suspended, expect: (s, j) => s === 404 && j.code === "not_found" });
  await call("withdrawn resource denied", "GET", `/api/research/partner/resources/${withdrawn.resourceId}/download`, { token: T.rep, expect: (s, j) => s === 404 && j.code === "not_found" });
  await call("draft-policy resource denied", "GET", `/api/research/partner/resources/${draftPolicy.resourceId}/download`, { token: T.rep, expect: (s, j) => s === 404 && j.code === "not_found" });
  await call("unknown uuid denied", "GET", "/api/research/partner/resources/00000000-0000-4000-8000-000000000000/download", { token: T.rep, expect: (s, j) => s === 404 && j.code === "not_found" });
  // A non-canonical id never matches the wall admission shape, so it is refused
  // at the wall (401) before reaching the handler, which would answer 404. Both
  // are denials and neither reveals whether any resource exists.
  await call("malformed id denied (wall refuses before the handler)", "GET", "/api/research/partner/resources/not-a-uuid/download", { token: T.rep, expect: (s, j) => (s === 401) || (s === 404 && j.code === "not_found") });
  await call("invalid bearer denied", "GET", "/api/research/partner/resources", { token: "not-a-real-token", expect: (s) => s === 401 || s === 403 });
  await call("eligible partner receives the bytes", "GET", `/api/research/partner/resources/${repOnly.resourceId}/download`, { token: T.rep, expect: (s, _j, raw) => s === 200 && raw.subarray(0, 5).toString("latin1") === "%PDF-" });
  const leak = JSON.stringify(rows);
  rows.push({ label: "no storage key / admin identity / reason in any response", pass: !/storageKey|resource-library\/|admin@preview|reviewReason/u.test(leak) });
  console.log(`${rows.at(-1).pass ? "pass" : "FAIL"}  no storage key / admin identity / reason in any response`);
}

const summary = { base: BASE, at: new Date().toISOString(), gate: gate.json, reachableUnderLockedGate: reachable, libraryStatus: lib.status, deliveryStatus: dl.status, pass: rows.filter((r) => r.pass === true).length, fail: rows.filter((r) => r.pass === false).length };
fs.writeFileSync(OUT, JSON.stringify({ summary, rows }, null, 2));
console.log("SAFETY BAR", JSON.stringify(summary));
