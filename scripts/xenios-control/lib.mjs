import { createHash } from "node:crypto";
import { execFile, execFileSync } from "node:child_process";
import { promises as fs } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CONTROL_HOST = "127.0.0.1";
export const CONTROL_PORT = 4177;
export const APP_HOST = "127.0.0.1";
export const APP_PORT = 5000;
export const CONTROL_ORIGIN = `http://${CONTROL_HOST}:${CONTROL_PORT}`;
export const APP_ORIGIN = `http://${APP_HOST}:${APP_PORT}`;
export const PRODUCTION_ORIGIN = "https://xeniostechnology.com";
export const REQUIRED_NODE_VERSION = "20.19.0";
export const REQUIRED_NPM_VERSION = "10.8.2";

const BLOCKED_SEGMENTS = new Set([
  ".git", ".xenios", ".agents", ".claude", "attached_assets", "node_modules",
  ".next", "dist", "build", "coverage", ".cache", "cache", "logs", "log",
  "tmp", "temp",
]);
const TEXT_EXTENSIONS = new Set([
  ".cjs", ".css", ".csv", ".html", ".js", ".json", ".jsx", ".md",
  ".mjs", ".ps1", ".scss", ".sh", ".sql", ".svg", ".toml", ".ts",
  ".tsx", ".txt", ".xml", ".yaml", ".yml",
]);
const SENSITIVE_BASENAME = /^(?:\.env(?:\..*)?|credentials?(?:\..*)?|secrets?(?:\..*)?|service[-_.]?account(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)(?:\..*)?)$/iu;
const SENSITIVE_EXTENSION = /\.(?:key|pem|p12|pfx|jks|keystore)$/iu;

export function repoRuntimeDirectory(repoRoot) {
  const digest = createHash("sha256").update(path.resolve(repoRoot).toLowerCase()).digest("hex").slice(0, 12);
  const local = process.env.LOCALAPPDATA || os.tmpdir();
  return path.join(local, "XeniosControl", digest);
}

export function normalizeRepoPath(input) {
  if (typeof input !== "string" || input.includes("\0")) return null;
  const normalized = input.replaceAll("\\", "/").replace(/^\.\//u, "");
  if (!normalized || normalized.startsWith("/") || /^[a-z]:/iu.test(normalized)) return null;
  const parts = normalized.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) return null;
  return parts.join("/");
}

export function isSafeSourcePath(input) {
  const normalized = normalizeRepoPath(input);
  if (!normalized) return false;
  const parts = normalized.toLowerCase().split("/");
  if (parts.some((part) => BLOCKED_SEGMENTS.has(part))) return false;
  const basename = parts.at(-1);
  if (SENSITIVE_BASENAME.test(basename) || SENSITIVE_EXTENSION.test(basename)) return false;
  if (!TEXT_EXTENSIONS.has(path.extname(basename))) return false;
  return true;
}

export function redact(input) {
  return String(input ?? "")
    .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]+/giu, "$1 [REDACTED]")
    .replace(/((?:password|passwd|secret|token|api[_-]?key|service[_-]?role[_-]?key|authorization)\s*[:=]\s*)[^\s,;]+/giu, "$1[REDACTED]")
    .replace(/\b(?:sk|rk|pk)_(?:live|test)_[A-Za-z0-9_-]+\b/gu, "[REDACTED_KEY]")
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, "[REDACTED_TOKEN]")
    .replace(/\bAKIA[0-9A-Z]{16}\b/gu, "[REDACTED_AWS_KEY]")
    .replace(/\bxox[baprs]-[A-Za-z0-9-]{24,}\b/gu, "[REDACTED_TOKEN]")
    .replace(/\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/gu, "[REDACTED_JWT]")
    .replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/gu, "[REDACTED_PRIVATE_KEY]")
    .slice(-200_000);
}

export function command(repoRoot, args, fallback = "unavailable") {
  try {
    return execFileSync("git", args, {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 2_000_000,
      windowsHide: true,
    }).trim() || fallback;
  } catch {
    return fallback;
  }
}

export function runtimeCompatible(nodeVersion, npmVersion) {
  return String(nodeVersion).replace(/^v/u, "") === REQUIRED_NODE_VERSION
    && String(npmVersion) === REQUIRED_NPM_VERSION;
}

export function currentRuntime() {
  const nodeVersion = process.versions.node;
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  let npmVersion = "unavailable";
  try {
    npmVersion = execFileSync(process.execPath, [npmCli, "--version"], {
      encoding: "utf8",
      maxBuffer: 200_000,
      windowsHide: true,
    }).trim();
  } catch {
    // Runtime reporting must not guess an npm version.
  }
  return {
    nodeVersion,
    npmVersion,
    npmCli,
    requiredNodeVersion: REQUIRED_NODE_VERSION,
    requiredNpmVersion: REQUIRED_NPM_VERSION,
    compatible: runtimeCompatible(nodeVersion, npmVersion),
  };
}

export async function readJson(filePath, fallback = null) {
  try {
    return JSON.parse((await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/u, ""));
  } catch {
    return fallback;
  }
}

export async function writeJsonAtomic(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await fs.rename(temporary, filePath);
}

export async function probeUrl(url, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      response.resume();
      resolve({ online: true, status: response.statusCode ?? null });
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", () => resolve({ online: false, status: null }));
  });
}

export async function probeApiHealth(url, timeoutMs = 1_500) {
  return new Promise((resolve) => {
    const request = http.get(url, { timeout: timeoutMs }, (response) => {
      const contentType = String(response.headers["content-type"] ?? "");
      const chunks = [];
      let bytes = 0;
      response.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes <= 16_384) chunks.push(chunk);
      });
      response.on("end", () => {
        if (response.statusCode !== 200 || !contentType.toLowerCase().includes("application/json") || bytes > 16_384) {
          resolve({ online: false, status: response.statusCode ?? null });
          return;
        }
        try {
          const payload = JSON.parse(Buffer.concat(chunks).toString("utf8").replace(/^\uFEFF/u, ""));
          resolve({ online: payload?.status === "Xenios API is running", status: response.statusCode ?? null });
        } catch {
          resolve({ online: false, status: response.statusCode ?? null });
        }
      });
    });
    request.once("timeout", () => request.destroy(new Error("timeout")));
    request.once("error", () => resolve({ online: false, status: null }));
  });
}

export async function collectStatus(repoRoot) {
  const runtimeDir = repoRuntimeDirectory(repoRoot);
  const processState = await readJson(path.join(runtimeDir, "processes.json"), {});
  const actionState = await readJson(path.join(runtimeDir, "actions.json"), {});
  const catalog = await readJson(path.join(repoRoot, "docs", "production-completion", "catalog", "catalog-reconciliation.json"), {});
  const porcelain = command(repoRoot, ["status", "--porcelain=v1", "--untracked-files=normal"], "");
  const dirtyLines = porcelain ? porcelain.split(/\r?\n/u) : [];
  const [app, api] = await Promise.all([
    probeUrl(`${APP_ORIGIN}/`),
    probeApiHealth(`${APP_ORIGIN}/api/health`),
  ]);
  const counts = catalog?.counts ?? {};
  const catalogCounts = {
    total: Number(counts.unionUnits ?? 0),
    directBuy: Number(counts.direct_buy ?? 0),
    assistedOrder: Number(counts.assisted_order ?? 0),
    careRequired: Number(counts.care_required ?? 0),
    unavailable: Number(counts.unavailable ?? 0),
  };
  const missingServerVariables = ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "SITE_URL"].filter((name) => !process.env[name]);
  const nativeCheckout = catalogCounts.directBuy > 0 ? "REVIEW REQUIRED" : "DARK";

  return {
    generatedAt: new Date().toISOString(),
    project: path.basename(repoRoot),
    repoRoot,
    branch: command(repoRoot, ["branch", "--show-current"]),
    sha: command(repoRoot, ["rev-parse", "HEAD"]),
    shortSha: command(repoRoot, ["rev-parse", "--short=12", "HEAD"]),
    tree: command(repoRoot, ["rev-parse", "HEAD^{tree}"]),
    remote: command(repoRoot, ["remote", "get-url", "origin"]),
    dirty: dirtyLines.length > 0,
    dirtyCount: dirtyLines.length,
    app: {
      url: APP_ORIGIN,
      online: app.online,
      httpStatus: app.status,
      apiOnline: api.online && api.status === 200,
      mode: processState.appMode ?? (app.online ? "UNMANAGED_OR_UNKNOWN" : "OFFLINE"),
      limitations: processState.appMode === "CLIENT_ONLY"
        ? "API-backed authentication, account, catalog, checkout and Care actions are unavailable locally."
        : null,
    },
    productionUrl: PRODUCTION_ORIGIN,
    controlUrl: CONTROL_ORIGIN,
    runtime: currentRuntime(),
    checkout: {
      nativeStatus: nativeCheckout,
      reason: nativeCheckout === "DARK"
        ? "Authoritative catalog reconciliation contains zero direct-buy offerings."
        : "Direct-buy offerings exist; this cockpit never activates commerce.",
      catalogCounts,
      catalogAsOf: catalog?.asOf ?? null,
    },
    environment: {
      serverReady: missingServerVariables.length === 0,
      missingNames: missingServerVariables,
      note: "Only variable presence is reported; values are never exposed.",
    },
    lastAction: actionState.lastAction ?? null,
    activeAction: actionState.activeAction ?? null,
  };
}

export function trackedSourceFiles(repoRoot) {
  const output = command(repoRoot, ["ls-files", "-z"], "");
  return output.split("\0").filter(Boolean).map((value) => value.replaceAll("\\", "/")).filter(isSafeSourcePath);
}

export async function readTrackedSource(repoRoot, relativePath, trackedSet) {
  const normalized = normalizeRepoPath(relativePath);
  if (!normalized || !isSafeSourcePath(normalized) || !trackedSet.has(normalized)) {
    const error = new Error("Source path is not available.");
    error.code = "NOT_ALLOWED";
    throw error;
  }
  const root = path.resolve(repoRoot);
  const absolute = path.resolve(root, ...normalized.split("/"));
  const relative = path.relative(root, absolute);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    const error = new Error("Source path escapes the repository.");
    error.code = "NOT_ALLOWED";
    throw error;
  }
  const [realRoot, realFile] = await Promise.all([fs.realpath(root), fs.realpath(absolute)]);
  const realRelative = path.relative(realRoot, realFile);
  if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) {
    const error = new Error("Source path resolves outside the repository.");
    error.code = "NOT_ALLOWED";
    throw error;
  }
  const stat = await fs.stat(realFile);
  if (!stat.isFile() || stat.size > 512_000) {
    const error = new Error("Source file is unavailable or exceeds 500 KiB.");
    error.code = "TOO_LARGE";
    throw error;
  }
  const content = await fs.readFile(realFile, "utf8");
  if (content.includes("\0")) throw new Error("Binary files are not displayed.");
  if (/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u.test(content)
      || /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9_-]{16,}\b/u.test(content)
      || /\bgh[pousr]_[A-Za-z0-9]{20,}\b/u.test(content)
      || /\bAKIA[0-9A-Z]{16}\b/u.test(content)
      || /\bxox[baprs]-[A-Za-z0-9-]{24,}\b/u.test(content)
      || /\beyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/u.test(content)) {
    const error = new Error("Source file is withheld by the credential marker guard.");
    error.code = "NOT_ALLOWED";
    throw error;
  }
  return { path: normalized, size: stat.size, content };
}

export async function runFixedCommand({ executable, args, cwd, timeoutMs, onOutput }) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = execFile(executable, args, {
      cwd,
      windowsHide: true,
      timeout: timeoutMs,
      maxBuffer: 300_000,
      encoding: "utf8",
      env: { ...process.env, FORCE_COLOR: "0" },
    }, (error, stdout, stderr) => {
      const output = redact(`${stdout ?? ""}${stderr ?? ""}`);
      onOutput?.(output);
      resolve({
        ok: !error,
        exitCode: typeof error?.code === "number" ? error.code : (error ? 1 : 0),
        timedOut: Boolean(error?.killed),
        durationMs: Date.now() - startedAt,
        output,
      });
    });
    child.once("error", (error) => onOutput?.(redact(error.message)));
  });
}

export async function loadBoundedLog(repoRoot) {
  const runtimeDir = repoRuntimeDirectory(repoRoot);
  const candidates = ["control.log", "app.stdout.log", "app.stderr.log", "control.stdout.log", "control.stderr.log", "actions.log"];
  const sections = [];
  for (const name of candidates) {
    try {
      const filePath = path.join(runtimeDir, name);
      const stat = await fs.stat(filePath);
      const handle = await fs.open(filePath, "r");
      const length = Math.min(stat.size, 80_000);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, stat.size - length);
      await handle.close();
      sections.push(`--- ${name} ---\n${buffer.toString("utf8")}`);
    } catch {
      // Missing logs are expected before the first helper-managed start.
    }
  }
  return redact(sections.join("\n"));
}

export async function appendControlLog(repoRoot, line) {
  const runtimeDir = repoRuntimeDirectory(repoRoot);
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.appendFile(path.join(runtimeDir, "control.log"), `${new Date().toISOString()} ${redact(line)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function gitReadOnly(repoRoot) {
  const log = command(repoRoot, ["log", "-8", "--date=iso-strict", "--pretty=format:%h%x09%ad%x09%s"], "");
  const status = command(repoRoot, ["status", "--short", "--branch"], "");
  return { status: redact(status), commits: redact(log) };
}
