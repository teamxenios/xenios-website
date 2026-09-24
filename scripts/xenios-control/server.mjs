import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import http from "node:http";
import path from "node:path";
import process from "node:process";
import {
  APP_ORIGIN,
  CONTROL_HOST,
  CONTROL_ORIGIN,
  CONTROL_PORT,
  appendControlLog,
  command,
  collectStatus,
  currentRuntime,
  gitReadOnly,
  loadBoundedLog,
  readJson,
  readTrackedSource,
  redact,
  repoRuntimeDirectory,
  runFixedCommand,
  trackedSourceFiles,
  writeJsonAtomic,
} from "./lib.mjs";
import { LAUNCH_CHECKLIST, ROUTES } from "./routes.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDirectory, "..", "..");
const runtimeDirectory = repoRuntimeDirectory(repoRoot);
const actionsPath = path.join(runtimeDirectory, "actions.json");
const csrfToken = randomBytes(32).toString("base64url");
const trackedFiles = new Set(trackedSourceFiles(repoRoot));
const runtime = currentRuntime();
const npmArgs = (...args) => [runtime.npmCli, ...args];

const ACTIONS = Object.freeze({
  "customer-smoke": {
    label: "Customer smoke",
    executable: process.execPath,
    args: npmArgs(
      "run", "test", "--",
      "client/src/App.routes.test.ts",
      "client/src/research/pages/Gateway.catalog-guard.test.tsx",
      "client/src/research/early-access-open-route.test.tsx",
      "client/src/research/pages/public-brand-pages.test.tsx",
    ),
    timeoutMs: 10 * 60_000,
  },
  typecheck: {
    label: "Typecheck",
    executable: process.execPath,
    args: npmArgs("run", "check"),
    timeoutMs: 10 * 60_000,
  },
  build: {
    label: "Production build",
    executable: process.execPath,
    args: npmArgs("run", "build"),
    timeoutMs: 15 * 60_000,
  },
  "restart-app": process.platform === "win32" ? {
    label: "Restart helper-managed app",
    executable: "powershell.exe",
    args: [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(scriptDirectory, "START_XENIOS.ps1"),
      "-AppOnly", "-RestartApp", "-NoBrowser",
    ],
    timeoutMs: 2 * 60_000,
  } : null,
  package: process.platform === "win32" ? {
    label: "Sanitized exact-source package",
    executable: "powershell.exe",
    args: [
      "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
      "-File", path.join(scriptDirectory, "PACKAGE_XENIOS.ps1"),
    ],
    timeoutMs: 10 * 60_000,
  } : null,
});

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
]);

function setSecurityHeaders(response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Security-Policy", "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
}

function json(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(`${JSON.stringify(body)}\n`);
}

function allowedHost(request) {
  return request.headers.host === `${CONTROL_HOST}:${CONTROL_PORT}`;
}

function allowedMutation(request) {
  return allowedHost(request)
    && request.headers.origin === CONTROL_ORIGIN
    && request.headers["x-xenios-control-token"] === csrfToken;
}

async function serveAsset(response, pathname) {
  const assetName = pathname === "/" ? "index.html" : pathname.slice(1);
  if (!new Set(["index.html", "styles.css", "app.js"]).has(assetName)) return false;
  const filePath = path.join(scriptDirectory, assetName);
  try {
    const content = await fs.readFile(filePath);
    setSecurityHeaders(response);
    response.writeHead(200, { "Content-Type": CONTENT_TYPES.get(path.extname(filePath)) });
    response.end(content);
  } catch {
    json(response, 404, { ok: false, error: "Asset unavailable." });
  }
  return true;
}

async function actionState() {
  return readJson(actionsPath, { activeAction: null, lastAction: null, history: [] });
}

async function startAction(actionId) {
  const definition = ACTIONS[actionId];
  if (!definition) return { accepted: false, status: 400, error: "Action is not available on this host." };
  const current = await actionState();
  if (current.activeAction) {
    return { accepted: false, status: 409, error: `Another bounded action is running: ${current.activeAction.label}.` };
  }
  const activeAction = {
    id: actionId,
    label: definition.label,
    status: "running",
    startedAt: new Date().toISOString(),
    sha: command(repoRoot, ["rev-parse", "HEAD"]),
    tree: command(repoRoot, ["rev-parse", "HEAD^{tree}"]),
  };
  await writeJsonAtomic(actionsPath, { ...current, activeAction });
  await appendControlLog(repoRoot, `action started: ${actionId}`);

  void (async () => {
    const result = await runFixedCommand({
      ...definition,
      cwd: repoRoot,
      onOutput: async (output) => {
        if (output) await fs.appendFile(path.join(runtimeDirectory, "actions.log"), `${output}\n`, { encoding: "utf8", mode: 0o600 });
      },
    });
    const finishedAt = new Date().toISOString();
    const finished = {
      ...activeAction,
      status: result.ok ? "passed" : "failed",
      finishedAt,
      exitCode: result.exitCode,
      timedOut: result.timedOut,
      durationMs: result.durationMs,
      outputTail: redact(result.output).slice(-12_000),
    };
    const latest = await actionState();
    const history = [finished, ...(latest.history ?? [])].slice(0, 12);
    await writeJsonAtomic(actionsPath, { activeAction: null, lastAction: finished, history });
    await appendControlLog(repoRoot, `action ${finished.status}: ${actionId} (${result.durationMs}ms)`);
  })().catch(async (error) => {
    const failed = { ...activeAction, status: "failed", finishedAt: new Date().toISOString(), error: redact(error.message) };
    await writeJsonAtomic(actionsPath, { activeAction: null, lastAction: failed, history: [failed] });
    await appendControlLog(repoRoot, `action failed unexpectedly: ${actionId}`);
  });
  return { accepted: true, status: 202, action: activeAction };
}

function launchState(status, actions) {
  const passed = new Set((actions.history ?? [])
    .filter((item) => item.status === "passed" && item.sha === status.sha && item.tree === status.tree)
    .map((item) => item.id));
  return LAUNCH_CHECKLIST.map((item) => ({
    ...item,
    complete: item.id === "git-clean" ? Boolean(status.sha && status.sha !== "unavailable" && status.dirty === false)
      : item.id === "checkout-dark" ? status.checkout.nativeStatus === "DARK"
        : item.id === "deploy" ? false
          : passed.has(item.id),
  }));
}

async function api(request, response, url) {
  if (!allowedHost(request)) {
    json(response, 403, { ok: false, error: "Use the loopback control URL exactly." });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/health") {
    json(response, 200, { ok: true, host: CONTROL_HOST, port: CONTROL_PORT });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/bootstrap") {
    json(response, 200, { ok: true, csrfToken, appOrigin: APP_ORIGIN, actionIds: Object.entries(ACTIONS).filter(([, value]) => value).map(([key]) => key) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/status") {
    json(response, 200, { ok: true, status: await collectStatus(repoRoot), actions: await actionState() });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/routes") {
    json(response, 200, { ok: true, routes: ROUTES });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/logs") {
    json(response, 200, { ok: true, log: await loadBoundedLog(repoRoot) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/git") {
    json(response, 200, { ok: true, git: await gitReadOnly(repoRoot) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/launch") {
    const [status, actions] = await Promise.all([collectStatus(repoRoot), actionState()]);
    json(response, 200, { ok: true, checklist: launchState(status, actions) });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/source") {
    const query = (url.searchParams.get("q") ?? "").trim().toLowerCase().slice(0, 120);
    const files = [...trackedFiles].filter((file) => !query || file.toLowerCase().includes(query)).slice(0, 400);
    json(response, 200, { ok: true, files, total: files.length, limited: files.length === 400 });
    return true;
  }
  if (request.method === "GET" && url.pathname === "/api/source/file") {
    try {
      const source = await readTrackedSource(repoRoot, url.searchParams.get("path") ?? "", trackedFiles);
      json(response, 200, { ok: true, source });
    } catch (error) {
      json(response, error.code === "TOO_LARGE" ? 413 : 403, { ok: false, error: error.message });
    }
    return true;
  }
  if (request.method === "POST" && url.pathname.startsWith("/api/actions/")) {
    if (!allowedMutation(request)) {
      json(response, 403, { ok: false, error: "Mutation guard rejected the request." });
      return true;
    }
    const actionId = decodeURIComponent(url.pathname.slice("/api/actions/".length));
    if (actionId === "refresh") {
      json(response, 200, { ok: true, status: await collectStatus(repoRoot) });
      return true;
    }
    const started = await startAction(actionId);
    json(response, started.status, { ok: started.accepted, ...started });
    return true;
  }
  if (url.pathname.startsWith("/api/")) {
    json(response, 404, { ok: false, error: "Unknown control endpoint." });
    return true;
  }
  return false;
}

export function createControlServer() {
  return http.createServer(async (request, response) => {
    try {
      if (!request.url || !["GET", "POST"].includes(request.method ?? "")) {
        json(response, 405, { ok: false, error: "Method not allowed." });
        return;
      }
      const url = new URL(request.url, CONTROL_ORIGIN);
      if (await api(request, response, url)) return;
      if (request.method !== "GET" || !(await serveAsset(response, url.pathname))) {
        json(response, 404, { ok: false, error: "Not found." });
      }
    } catch (error) {
      await appendControlLog(repoRoot, `request error: ${error.message}`);
      json(response, 500, { ok: false, error: "The control request failed safely." });
    }
  });
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  if (!runtime.compatible) {
    process.stderr.write(`Xenios Control Cockpit requires Node ${runtime.requiredNodeVersion} and npm ${runtime.requiredNpmVersion}; received Node ${runtime.nodeVersion} and npm ${runtime.npmVersion}.\n`);
    process.stderr.write("Run scripts/xenios-control/START_XENIOS.ps1, or set XENIOS_NODE_HOME to the exact pinned toolchain.\n");
    process.exitCode = 1;
  } else {
    await fs.mkdir(runtimeDirectory, { recursive: true });
    const server = createControlServer();
    server.listen(CONTROL_PORT, CONTROL_HOST, async () => {
      await appendControlLog(repoRoot, `control cockpit listening at ${CONTROL_ORIGIN}`);
      process.stdout.write(`Xenios Control Cockpit: ${CONTROL_ORIGIN}\n`);
      process.stdout.write(`Toolchain: Node ${runtime.nodeVersion} / npm ${runtime.npmVersion}.\n`);
      process.stdout.write("Local-only. Production mutations are not available.\n");
    });
    server.on("error", async (error) => {
      await appendControlLog(repoRoot, `control server error: ${error.message}`);
      process.stderr.write(`Xenios Control Cockpit failed: ${error.message}\n`);
      process.exitCode = 1;
    });
  }
}

export const __test = { allowedHost, launchState };
