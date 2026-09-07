// Local preview probe: seeds synthetic resources through the admin API, then
// checks the locked wall + portal + hub. This is not a production auth test.
import fs from "node:fs";
import { pathToFileURL } from "node:url";

const HEADER = "x-xenios-resource-upload";
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF\n", "latin1");
const T = { admin: "preview-token-admin", rep: "preview-token-rep", affiliate: "preview-token-affiliate", suspended: "preview-token-suspended", member: "preview-token-member" };
const LIBRARY = "/api/research/partner/resources";
const ADMIN = "/api/admin/research/resource-hub/resources";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u;
const KNOWN_CODES = new Set(["not_found", "partner_not_found", "member_required", "forbidden", "unauthorized", "resource_state_conflict", "capability_disabled", "resource_hub_unavailable"]);
const PRIVATE_MARKER = /storage_?key|resource-library\/|(?:created|uploaded|reviewed|published|withdrawn)_?by_?admin|admin@preview|member-admin|preview-token-(?:admin|rep|affiliate|suspended|member)|(?:review|withdraw)_?reason|upload_?idempotency_?key|Safety bar seed\.|Safety bar\./iu;
const LIMITATIONS = [
  "Preview member auth substitutes fixed persona tokens for canonical requireMember; JWT verification, recovery sessions, closed accounts and canonical identity linkage are not proved.",
  "The preview boundary answers wrong methods and unrelated routes before the research wall; those rows prove preview containment only.",
  "No browser sign-in/returnTo journey, production mount flags, HEAD behavior or delivery-ledger state is observed by this probe.",
];

export function localPreviewBase(value) {
  const url = new URL(value);
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)
      || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("A loopback HTTP preview origin is required.");
  }
  return url.origin;
}

// Inspect decoded JSON as well as raw bytes, so escaped JSON field names cannot
// hide a match. Only the boolean result survives; response bodies are never logged.
export function partnerPayloadHasNoPrivateFields(raw, json) {
  return !PRIVATE_MARKER.test(raw.toString("utf8"))
    && !PRIVATE_MARKER.test(JSON.stringify(json) ?? "");
}

export async function runSafetyBar({ base = "http://127.0.0.1:5232", fetchImpl = fetch, log = console.log } = {}) {
  base = localPreviewBase(base);
  const rows = [];
  let gate = null;
  let lib = null;
  let dl = null;
  let partnerResponses = 0;
  let privatePayloads = true;

  function record(row) {
    rows.push(row);
    log(`${row.pass ? "pass" : "FAIL"}  ${row.label}${row.status == null ? "" : `: ${row.status}`}`);
  }

  async function call(label, method, path, { token, expect, headers = {}, body, scope = "preview wall + substituted member guard + hub" } = {}) {
    const row = { label, method, path, scope, status: null, code: null, bytes: 0, pdf: false, pass: false };
    let json = null;
    let raw = Buffer.alloc(0);
    try {
      const res = await fetchImpl(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body, redirect: "manual", signal: AbortSignal.timeout(10_000) });
      raw = Buffer.from(await res.arrayBuffer());
      row.status = res.status;
      row.bytes = raw.byteLength;
      row.pdf = raw.subarray(0, 5).toString("latin1") === "%PDF-";
      if ((res.headers.get("content-type") ?? "").includes("json")) json = JSON.parse(raw.toString("utf8"));
      row.code = KNOWN_CODES.has(json?.code) ? json.code : null;
      row.pass = expect(res.status, json, raw) === true;
    } catch {
      // Transport, parse and assertion errors fail without exposing server text.
      row.pass = false;
    }
    if (path.startsWith("/api/research/partner/")) {
      partnerResponses++;
      row.privateFieldsAbsent = partnerPayloadHasNoPrivateFields(raw, json);
      privatePayloads = privatePayloads && row.privateFieldsAbsent;
      row.pass = row.pass && row.privateFieldsAbsent;
    }
    record(row);
    return { status: row.status, json, raw, pass: row.pass };
  }

  function finish() {
    if (partnerResponses > 0) record({ label: "partner response bodies contain no checked private fields or fixture values", scope: "response bodies checked in memory only", pass: privatePayloads });
    const gateState = gate?.json;
    const summary = {
      base, at: new Date().toISOString(),
      gate: gateState ? { configured: gateState.configured === true, publicMode: gateState.publicMode === true, authed: gateState.authed === true } : null,
      reachableUnderLockedGate: gate?.pass === true && lib?.pass === true && dl?.pass === true,
      libraryStatus: lib?.status ?? null, deliveryStatus: dl?.status ?? null,
      pass: rows.filter((r) => r.pass).length, fail: rows.filter((r) => !r.pass).length,
      claimScope: "LOCAL_PREVIEW_ONLY", limitations: LIMITATIONS,
    };
    return { summary, rows };
  }

  gate = await call("gate state (must be configured and locked)", "GET", "/api/research/me", {
    scope: "preview gate state", expect: (s, j) => s === 200 && j?.configured === true && j.publicMode === false && j.authed === false,
  });
  if (!gate.pass) return finish(); // Do not seed a misconfigured target.

  const jsonHeaders = { "Content-Type": "application/json" };
  const versionOf = (j, id) => j?.resource?.versions?.find((v) => v.versionId === id);
  async function transition(label, resource, input, expect) {
    const result = await call(label, "POST", `${ADMIN}/${resource.resourceId}/versions/${resource.versionId}/review`, {
      token: T.admin, headers: jsonHeaders, body: JSON.stringify(input), expect, scope: "fixture setup through preview admin API",
    });
    if (!result.pass) throw new Error("Fixture transition failed.");
  }
  async function seed(title, usagePolicy, audience, key) {
    const metadata = { title, purpose: `${title}: what this material is for and how a partner may use it.`, usagePolicy, audience, originalFilename: `${key}.pdf`, idempotencyKey: key };
    const created = await call(`seed ${key}`, "POST", ADMIN, {
      token: T.admin, headers: { "Content-Type": "application/pdf", [HEADER]: Buffer.from(JSON.stringify(metadata)).toString("base64url") }, body: PDF,
      scope: "fixture setup through preview admin API",
      expect: (s, j) => s === 200 && j?.ok === true && UUID.test(j.resource?.resourceId) && UUID.test(j.resource?.versions?.[0]?.versionId)
        && j.resource.versions[0].state === "draft" && j.resource.currentPublishedVersionId === null,
    });
    if (!created.pass) throw new Error("Fixture upload failed.");
    const resource = { resourceId: created.json.resource.resourceId, versionId: created.json.resource.versions[0].versionId };
    await transition(`approve ${key}`, resource, { action: "approve_content", reason: "Safety bar seed.", idempotencyKey: `sb-a-${resource.versionId}` },
      (s, j) => s === 200 && j?.ok === true && j.resource?.resourceId === resource.resourceId && versionOf(j, resource.versionId)?.state === "in_review" && typeof versionOf(j, resource.versionId)?.reviewedAt === "string");
    await transition(`${usagePolicy === "draft" ? "refuse draft-policy publication" : "publish"} ${key}`, resource, { action: "publish", idempotencyKey: `sb-p-${resource.versionId}` },
      usagePolicy === "draft"
        ? (s, j) => s === 409 && j?.ok === false && j.code === "resource_state_conflict"
        : (s, j) => s === 200 && j?.ok === true && j.resource?.resourceId === resource.resourceId && j.resource.currentPublishedVersionId === resource.versionId && versionOf(j, resource.versionId)?.state === "published");
    return resource;
  }

  try {
    const repOnly = await seed("REP-ONLY worksheet", "private", ["research_rep"], "sb-reponly-0001");
    const shared = await seed("Shared one-pager", "external_share", ["all_partners"], "sb-shared-0001");
    const draftPolicy = await seed("Draft script", "draft", ["all_partners"], "sb-draft-0001");
    const withdrawn = await seed("Withdrawn sheet", "external_share", ["all_partners"], "sb-withdrawn-0001");
    await transition("withdraw published fixture", withdrawn, { action: "withdraw", reason: "Safety bar.", idempotencyKey: "sb-w-0001" },
      (s, j) => s === 200 && j?.ok === true && j.resource?.resourceId === withdrawn.resourceId && j.resource.currentPublishedVersionId === null && versionOf(j, withdrawn.versionId)?.state === "withdrawn");

    const download = (resource) => `${LIBRARY}/${resource.resourceId}/download`;
    const isLibrary = (s, j) => s === 200 && j?.ok === true && Array.isArray(j.resources);
    const isPdf = (s, _j, raw) => s === 200 && raw.equals(PDF);
    const refused = (s) => s === 401 || s === 403;
    const notFound = (s, j) => s === 404 && j?.code === "not_found";
    lib = await call("REACH library, eligible partner bearer", "GET", LIBRARY, { token: T.rep, expect: isLibrary });
    dl = await call("REACH delivery, eligible partner receives exact fixture bytes", "GET", download(repOnly), { token: T.rep, expect: isPdf });
    await call("no bearer: library refused", "GET", LIBRARY, { expect: refused });
    await call("no bearer: delivery refused", "GET", download(repOnly), { expect: refused });
    // These routes are intercepted BEFORE the research wall in this preview.
    for (const [method, path] of [["POST", LIBRARY], ["POST", download(repOnly)], ["GET", "/api/research/partner/commissions"]]) {
      await call(`preview containment only: ${method} ${path}`, method, path, {
        token: T.rep, ...(method === "POST" ? { headers: jsonHeaders, body: "{}" } : {}),
        scope: "preview boundary before research wall; no wall-admission claim",
        expect: (s, j) => s === 404 && j?.error === "resource_hub_preview_route_not_available",
      });
    }
    // Always run denials, even if admission failed. A closed library is a failure,
    // never a reason to skip the assertions that distinguish the downstream guard.
    await call("rep sees exactly the two permitted fixture versions", "GET", LIBRARY, {
      token: T.rep, expect: (s, j) => isLibrary(s, j) && j.resources.length === 2
        && [repOnly, shared].every((r) => j.resources.some((card) => card.resourceId === r.resourceId && card.versionId === r.versionId)),
    });
    await call("affiliate sees only the shared fixture, no rep-only metadata", "GET", LIBRARY, {
      token: T.affiliate, expect: (s, j) => isLibrary(s, j) && j.resources.length === 1 && j.resources[0].resourceId === shared.resourceId
        && j.resources[0].versionId === shared.versionId && !JSON.stringify(j).includes(repOnly.resourceId) && !JSON.stringify(j).includes("REP-ONLY"),
    });
    await call("affiliate cannot fetch rep-only bytes", "GET", download(repOnly), { token: T.affiliate, expect: notFound });
    await call("member without partner record", "GET", LIBRARY, { token: T.member, expect: (s, j) => s === 404 && j?.code === "partner_not_found" });
    await call("suspended partner: empty library", "GET", LIBRARY, { token: T.suspended, expect: (s, j) => isLibrary(s, j) && j.resources.length === 0 });
    await call("suspended partner: no bytes", "GET", download(shared), { token: T.suspended, expect: notFound });
    await call("withdrawn resource denied", "GET", download(withdrawn), { token: T.rep, expect: notFound });
    await call("unpublished draft-policy resource denied", "GET", download(draftPolicy), { token: T.rep, expect: notFound });
    await call("unknown UUID denied; ledger not observed", "GET", `${LIBRARY}/00000000-0000-4000-8000-000000000000/download`, { token: T.rep, expect: notFound });
    await call("malformed id refused by locked wall", "GET", `${LIBRARY}/not-a-uuid/download`, { token: T.rep, expect: (s, j) => s === 401 && j?.message === "Access required." });
    await call("invalid preview bearer: library denied", "GET", LIBRARY, { token: "not-a-real-token", expect: refused });
    await call("invalid preview bearer: delivery denied", "GET", download(repOnly), { token: "not-a-real-token", expect: refused });
  } catch {
    record({ label: "fixture setup and probe completed", scope: "probe execution", pass: false });
  }
  return finish();
}

export async function runCli({ env = process.env, log = console.log, writeFile = fs.writeFileSync, run = runSafetyBar } = {}) {
  try {
    const report = await run({ base: env.BASE_URL ?? "http://127.0.0.1:5232", log });
    writeFile(env.OUT_FILE ?? "locked-gate-safety-bar.json", JSON.stringify(report, null, 2));
    log(`SAFETY BAR ${JSON.stringify(report.summary)}`);
    return report.summary.fail === 0 && report.summary.reachableUnderLockedGate ? 0 : 1;
  } catch {
    log("FAIL  safety bar could not complete; raw server/error content is withheld.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await runCli();
}
