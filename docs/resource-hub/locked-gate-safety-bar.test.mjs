// Probe self-tests only: no HTTP listener, application imports or network calls.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { localPreviewBase, partnerPayloadHasNoPrivateFields, runCli, runSafetyBar } from "./locked-gate-safety-bar.mjs";

const LIBRARY = "/api/research/partner/resources";
const ADMIN = "/api/admin/research/resource-hub/resources";
const SECRET = "SYNTHETIC-PRIVATE-CONTENT-DO-NOT-EMIT";
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function fixtureTransport(options = {}) {
  const resources = [];
  const calls = [];
  async function fetchImpl(url, request) {
    const path = new URL(url).pathname;
    const token = request.headers.Authorization;
    calls.push({ path, method: request.method, token });
    if (path === "/api/research/me") return json({ configured: true, publicMode: options.openGate === true, authed: false });
    if (path === ADMIN) {
      if (options.badUpload) return json({ ok: false, message: SECRET }, 503);
      const meta = JSON.parse(Buffer.from(request.headers["x-xenios-resource-upload"], "base64url").toString());
      const resource = {
        resourceId: uuid(resources.length + 1), currentPublishedVersionId: null,
        versions: [{ versionId: uuid(resources.length + 101), state: "draft", usagePolicy: meta.usagePolicy, reviewedAt: null }],
        meta, bytes: request.body,
      };
      resources.push(resource);
      return json({ ok: true, resource });
    }
    if (path.startsWith(`${ADMIN}/`)) {
      const resource = resources.find((r) => path.includes(r.resourceId));
      const version = resource.versions[0];
      const input = JSON.parse(request.body);
      if (options.failTransition === input.action) return json({ ok: false, message: SECRET }, 503);
      if (options.lieTransition === input.action) return json({ ok: true, resource });
      if (input.action === "approve_content") {
        version.state = "in_review";
        version.reviewedAt = "2026-09-07T00:00:00Z";
      } else if (input.action === "publish") {
        if (version.usagePolicy === "draft") return options.allowDraftPublication
          ? json({ ok: true, resource }) : json({ ok: false, code: "resource_state_conflict" }, 409);
        version.state = "published";
        resource.currentPublishedVersionId = version.versionId;
      } else if (input.action === "withdraw") {
        version.state = "withdrawn";
        resource.currentPublishedVersionId = null;
      }
      return json({ ok: true, resource });
    }
    if (request.method === "POST" || path.endsWith("/commissions")) return options.genericContainment
      ? json({ error: "unrelated_404" }, 404) : json({ error: "resource_hub_preview_route_not_available" }, 404);
    if (!token || path.includes("not-a-uuid") || options.blockedAdmission) return json({ ok: false, message: "Access required." }, 401);
    if (token === "Bearer not-a-real-token") return json({ ok: false, code: "member_required" }, 401);
    if (token === "Bearer preview-token-member") return json({ ok: false, code: "partner_not_found" }, 404);
    const allowed = resources.filter((r) => r.versions[0].state === "published"
      && token !== "Bearer preview-token-suspended"
      && (r.meta.audience.includes("all_partners") || token === "Bearer preview-token-rep"));
    if (path === LIBRARY) {
      const cards = allowed.map((r) => ({ resourceId: r.resourceId, versionId: r.versions[0].versionId, title: r.meta.title }));
      const body = { ok: true, resources: cards };
      if (options.leak === "library") body.storageKey = SECRET;
      if (options.leak === "actor") body.actor = "member-admin";
      if (options.leak === "token") body.unexpected = "preview-token-admin";
      return json(body);
    }
    const resource = allowed.find((r) => path.includes(r.resourceId));
    if (!resource) return json({ ok: false, code: "not_found", ...(options.leak === "denial" ? { reviewReason: SECRET } : {}) }, 404);
    if (options.badDelivery) return json({ ok: false, code: "capability_disabled" }, 503);
    return new Response(options.wrongPdf ? "%PDF-wrong-content" : resource.bytes, { headers: { "content-type": "application/pdf" } });
  }
  return { fetchImpl, calls };
}

async function execute(options = {}) {
  const transport = fixtureTransport(options);
  const logs = [];
  const report = await runSafetyBar({ fetchImpl: transport.fetchImpl, log: (line) => logs.push(line) });
  let written = "";
  const exitCode = await runCli({ run: async () => report, env: {}, log: (line) => logs.push(line), writeFile: (_path, value) => { written = value; } });
  assert.equal(`${written}\n${logs.join("\n")}`.includes(SECRET), false, "private server text must never enter evidence or logs");
  for (const value of ["member-admin", "preview-token-admin"]) {
    assert.equal(`${written}\n${logs.join("\n")}`.includes(value), false, "synthetic private fixture values must not enter evidence or logs");
  }
  return { ...transport, report, exitCode, logs };
}

test("complete synthetic preview yields explicit limited scope and green exit", async () => {
  const { report, exitCode } = await execute();
  assert.equal(exitCode, 0);
  assert.equal(report.summary.reachableUnderLockedGate, true);
  assert.equal(report.summary.fail, 0);
  assert.equal(report.summary.pass, 34);
  assert.equal(report.summary.claimScope, "LOCAL_PREVIEW_ONLY");
  assert.equal(report.rows.filter((r) => r.scope?.startsWith("preview boundary")).length, 3);
});

for (const leak of ["library", "denial", "actor", "token"]) {
  test(`a private field in an actual ${leak} response fails without exposing its value`, async () => {
    const { report, exitCode } = await execute({ leak });
    assert.equal(exitCode, 1);
    assert.ok(report.rows.some((r) => r.privateFieldsAbsent === false));
    assert.equal(report.rows.at(-1).pass, false);
  });
}

test("escaped JSON keys and non-JSON private content are inspected", () => {
  const raw = Buffer.from('{"storage\\u004bey":"hidden"}');
  assert.equal(partnerPayloadHasNoPrivateFields(raw, JSON.parse(raw)), false);
  assert.equal(partnerPayloadHasNoPrivateFields(Buffer.from("<html>admin@preview.invalid</html>"), null), false);
  assert.equal(partnerPayloadHasNoPrivateFields(Buffer.from('{"ok":true}'), { ok: true }), true);
});

test("failed admission is not skipped or reported green", async () => {
  const { report, calls, exitCode } = await execute({ blockedAdmission: true });
  assert.equal(exitCode, 1);
  assert.equal(report.summary.reachableUnderLockedGate, false);
  assert.ok(report.rows.filter((r) => r.label.startsWith("REACH")).every((r) => !r.pass));
  assert.ok(calls.some((r) => r.token === "Bearer preview-token-affiliate"));
  assert.ok(calls.some((r) => r.token === "Bearer preview-token-suspended"));
});

for (const options of [{ badDelivery: true }, { wrongPdf: true }]) {
  test(`delivery failure fails reachability: ${JSON.stringify(options)}`, async () => {
    const { report, exitCode } = await execute(options);
    assert.equal(exitCode, 1);
    assert.equal(report.summary.libraryStatus, 200);
    assert.equal(report.summary.reachableUnderLockedGate, false);
  });
}

for (const options of [
  { badUpload: true }, { failTransition: "approve_content" }, { failTransition: "publish" },
  { failTransition: "withdraw" }, { lieTransition: "approve_content" },
  { lieTransition: "publish" }, { lieTransition: "withdraw" }, { allowDraftPublication: true },
]) {
  test(`fixture failure cannot masquerade as a valid denial: ${JSON.stringify(options)}`, async () => {
    const { report, exitCode } = await execute(options);
    assert.equal(exitCode, 1);
    assert.ok(report.summary.fail > 0);
    assert.equal(report.rows.some((r) => r.label.startsWith("REACH")), false);
  });
}

test("a generic 404 cannot prove the preview boundary answered", async () => {
  const { report, exitCode } = await execute({ genericContainment: true });
  assert.equal(exitCode, 1);
  assert.ok(report.rows.filter((r) => r.scope?.startsWith("preview boundary")).every((r) => !r.pass));
});

test("an unlocked gate fails before any fixture write", async () => {
  const { calls, exitCode } = await execute({ openGate: true });
  assert.equal(exitCode, 1);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].method, "GET");
});

test("transport and output errors fail without including raw error text", async () => {
  const report = await runSafetyBar({ fetchImpl: async () => { throw new Error(SECRET); }, log: () => {} });
  assert.equal(report.summary.fail, 1);
  const logs = [];
  const exitCode = await runCli({ run: async () => report, writeFile: () => { throw new Error(SECRET); }, log: (line) => logs.push(line) });
  assert.equal(exitCode, 1);
  assert.equal(logs.join("\n").includes(SECRET), false);
});

test("loopback-only origin validation and actual CLI failure exit require no network", () => {
  assert.equal(localPreviewBase("http://127.0.0.1:5232/"), "http://127.0.0.1:5232");
  for (const value of ["https://example.invalid", "http://user:password@127.0.0.1:5232", "http://127.0.0.1:5232/path", "http://127.0.0.1:5232/?token=hidden"]) {
    assert.throws(() => localPreviewBase(value));
  }
  const child = spawnSync(process.execPath, [fileURLToPath(new URL("./locked-gate-safety-bar.mjs", import.meta.url))], {
    env: { ...process.env, BASE_URL: "https://example.invalid" }, encoding: "utf8", timeout: 30_000,
  });
  assert.equal(child.error, undefined, "CLI process must finish within its bounded startup allowance");
  assert.equal(child.status, 1);
  assert.match(child.stdout, /FAIL/);
});
