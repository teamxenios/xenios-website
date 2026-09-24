import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { isSafeSourcePath, normalizeRepoPath, probeApiHealth, readJson, readTrackedSource, redact, runtimeCompatible } from "./lib.mjs";
import { ROUTES } from "./routes.mjs";
import { __test, createControlServer } from "./server.mjs";

const controlDirectory = path.dirname(fileURLToPath(import.meta.url));

function request(server, { pathname, method = "GET", headers = {} }) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const outgoing = http.request({
      hostname: "127.0.0.1",
      port: address.port,
      path: pathname,
      method,
      headers: { Host: "127.0.0.1:4177", ...headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => {
        const body = Buffer.concat(chunks).toString("utf8");
        resolve({ status: response.statusCode, body: body ? JSON.parse(body) : null });
      });
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
}

async function close(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function removeTempFixture(directory) {
  const tempRoot = `${path.resolve(os.tmpdir())}${path.sep}`.toLowerCase();
  const resolved = path.resolve(directory);
  assert.ok(resolved.toLowerCase().startsWith(tempRoot), `refusing cleanup outside temp: ${resolved}`);
  await rm(resolved, { recursive: true, force: true });
}

test("source path policy confines reads and excludes sensitive or generated paths", () => {
  assert.equal(normalizeRepoPath("client\\src\\App.tsx"), "client/src/App.tsx");
  assert.equal(normalizeRepoPath("../.env"), null);
  assert.equal(isSafeSourcePath("client/src/App.tsx"), true);
  assert.equal(isSafeSourcePath(".env"), false);
  assert.equal(isSafeSourcePath("config/.env.local"), false);
  assert.equal(isSafeSourcePath("keys/service-account.json"), false);
  assert.equal(isSafeSourcePath("node_modules/pkg/index.js"), false);
  assert.equal(isSafeSourcePath("dist/server.js"), false);
  assert.equal(isSafeSourcePath(".xenios/SESSION_REGISTRY.json"), false);
  assert.equal(isSafeSourcePath(".agents/memory/MEMORY.md"), false);
  assert.equal(isSafeSourcePath(".claude/launch.json"), false);
  assert.equal(isSafeSourcePath("attached_assets/pasted.txt"), false);
  assert.equal(isSafeSourcePath("assets/photo.png"), false);
});

test("tracked source reader rejects traversal and untracked files", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xenios-control-test-"));
  try {
    await writeFile(path.join(root, "safe.md"), "safe\n", "utf8");
    await assert.rejects(() => readTrackedSource(root, "../safe.md", new Set(["safe.md"])), /not available/iu);
    await assert.rejects(() => readTrackedSource(root, "safe.md", new Set()), /not available/iu);
    assert.equal((await readTrackedSource(root, "safe.md", new Set(["safe.md"]))).content, "safe\n");
  } finally {
    await removeTempFixture(root);
  }
});

test("JSON state accepts Windows PowerShell UTF-8 BOM", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "xenios-control-json-"));
  try {
    const file = path.join(root, "state.json");
    await writeFile(file, `\uFEFF${JSON.stringify({ appMode: "CLIENT_ONLY" })}`, "utf8");
    assert.deepEqual(await readJson(file), { appMode: "CLIENT_ONLY" });
  } finally {
    await removeTempFixture(root);
  }
});

test("API health probe rejects a Vite HTML fallback despite HTTP 200", async () => {
  const server = http.createServer((_request, response) => {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end("<!doctype html><title>Vite</title>");
  });
  await listen(server);
  try {
    const address = server.address();
    assert.deepEqual(await probeApiHealth(`http://127.0.0.1:${address.port}/api/health`), { online: false, status: 200 });
  } finally {
    await close(server);
  }
});

test("log redaction removes authorization and common credential assignments", () => {
  const output = redact("Authorization=top-secret Bearer abc.def.ghi api_key=live-value password=hunter2");
  assert.doesNotMatch(output, /top-secret|abc\.def\.ghi|live-value|hunter2/u);
  assert.match(output, /REDACTED/u);
});

test("launch checklist requires both an exact SHA and a clean tree", () => {
  const actions = { history: [] };
  const base = { sha: "abc123", checkout: { nativeStatus: "DARK" } };
  const dirty = __test.launchState({ ...base, dirty: true }, actions);
  const clean = __test.launchState({ ...base, dirty: false }, actions);
  assert.equal(dirty.find((item) => item.id === "git-clean").complete, false);
  assert.equal(clean.find((item) => item.id === "git-clean").complete, true);
});

test("launch action evidence is bound to the current commit and tree", () => {
  const status = { sha: "current-sha", tree: "current-tree", dirty: false, checkout: { nativeStatus: "DARK" } };
  const stale = __test.launchState(status, { history: [{ id: "build", status: "passed", sha: "old-sha", tree: "old-tree" }] });
  const current = __test.launchState(status, { history: [{ id: "build", status: "passed", sha: "current-sha", tree: "current-tree" }] });
  assert.equal(stale.find((item) => item.id === "build").complete, false);
  assert.equal(current.find((item) => item.id === "build").complete, true);
});

test("runtime compatibility requires the exact repository toolchain", () => {
  assert.equal(runtimeCompatible("20.19.0", "10.8.2"), true);
  assert.equal(runtimeCompatible("v20.19.0", "10.8.2"), true);
  assert.equal(runtimeCompatible("24.14.1", "11.11.0"), false);
  assert.equal(runtimeCompatible("20.19.0", "10.9.0"), false);
});

test("Windows helpers pin toolchain, install in the resolved repo and exclude machine state", () => {
  const start = readFileSync(path.join(controlDirectory, "START_XENIOS.ps1"), "utf8");
  const common = readFileSync(path.join(controlDirectory, "XeniosControl.Common.ps1"), "utf8");
  const packaging = readFileSync(path.join(controlDirectory, "PACKAGE_XENIOS.ps1"), "utf8");
  const index = readFileSync(path.join(controlDirectory, "index.html"), "utf8");
  assert.match(common, /20\.19\.0/u);
  assert.match(common, /10\.8\.2/u);
  assert.match(common, /\$isInternalLayout/u);
  assert.match(common, /\$extractedCandidates\.Count -eq 1/u);
  assert.match(start, /Push-Location -LiteralPath \$repoRoot/u);
  assert.match(start, /SUPABASE_ANON_KEY/u);
  assert.match(start, /SITE_URL/u);
  for (const excluded of [".xenios", ".agents", ".claude", "attached_assets"]) {
    assert.match(packaging, new RegExp(excluded.replace(".", "\\."), "u"));
  }
  assert.doesNotMatch(packaging, /Branch at packaging: `\$branch/u);
  assert.match(index, /id="repo-path"/u);
  assert.match(index, /id="copy-repo-path"/u);
});

test("live HTTP guards reject alternate host, origin/token failures, unknown actions and traversal", async () => {
  const server = createControlServer();
  await listen(server);
  try {
    const alternateHost = await request(server, { pathname: "/api/status", headers: { Host: "attacker.invalid" } });
    assert.equal(alternateHost.status, 403);

    const bootstrap = await request(server, { pathname: "/api/bootstrap" });
    assert.equal(bootstrap.status, 200);
    const token = bootstrap.body.csrfToken;

    const missingOrigin = await request(server, {
      pathname: "/api/actions/refresh",
      method: "POST",
      headers: { "X-Xenios-Control-Token": token },
    });
    assert.equal(missingOrigin.status, 403);

    const wrongOrigin = await request(server, {
      pathname: "/api/actions/refresh",
      method: "POST",
      headers: { Origin: "http://attacker.invalid", "X-Xenios-Control-Token": token },
    });
    assert.equal(wrongOrigin.status, 403);

    const wrongToken = await request(server, {
      pathname: "/api/actions/refresh",
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4177", "X-Xenios-Control-Token": "wrong" },
    });
    assert.equal(wrongToken.status, 403);

    const unknownAction = await request(server, {
      pathname: "/api/actions/not-allowlisted",
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4177", "X-Xenios-Control-Token": token },
    });
    assert.equal(unknownAction.status, 400);

    const traversal = await request(server, { pathname: "/api/source/file?path=..%2F.env" });
    assert.equal(traversal.status, 403);

    const validRefresh = await request(server, {
      pathname: "/api/actions/refresh",
      method: "POST",
      headers: { Origin: "http://127.0.0.1:4177", "X-Xenios-Control-Token": token },
    });
    assert.equal(validRefresh.status, 200);
    assert.equal(validRefresh.body.status.runtime.compatible, true);
  } finally {
    await close(server);
  }
});

test("route audit exposes launch blockers and keeps early access authority-specific", () => {
  const apply = ROUTES.find((route) => route.path === "/research/apply");
  const catalog = ROUTES.find((route) => route.path === "/research/catalog");
  const earlyAccess = ROUTES.find((route) => route.path === "/research/early-access");
  assert.equal(apply?.status, "Blocked");
  assert.match(apply?.note ?? "", /legal-pending/iu);
  assert.equal(catalog?.status, "Blocked");
  assert.match(catalog?.note ?? "", /unmounted/iu);
  assert.equal(earlyAccess?.checkout, "Server-gated manual/assisted");
  assert.match(earlyAccess?.note ?? "", /native direct checkout remains dark/iu);
  for (const path of [
    "/care/schedule", "/research/reset-password", "/research/quality",
    "/research/testing", "/research/documents", "/research/support",
    "/research/about", "/research/how-it-works", "/research/faq",
    "/research/policies",
  ]) {
    assert.ok(ROUTES.some((route) => route.path === path), `missing route audit row: ${path}`);
  }
});
