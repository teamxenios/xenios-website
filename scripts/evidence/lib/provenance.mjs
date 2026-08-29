import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const EXACT_SHA = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
export const REQUIRED_NODE_VERSION = "v20.19.0";
export const REQUIRED_NPM_VERSION = "10.8.2";
export const REQUIRED_INSTALL_METHOD = "npm ci --no-audit --no-fund";

export function assertPinnedReleaseRuntime({
  nodeVersion = process.version,
  npmVersion,
} = {}) {
  if (nodeVersion !== REQUIRED_NODE_VERSION || npmVersion !== REQUIRED_NPM_VERSION) {
    throw new Error(
      `candidate preview requires Node ${REQUIRED_NODE_VERSION} and npm ${REQUIRED_NPM_VERSION}; ` +
        `received Node ${nodeVersion ?? "unknown"} and npm ${npmVersion ?? "unknown"}`,
    );
  }
  return { nodeVersion, npmVersion };
}

/** Locate npm beside the executing Node binary so PATH cannot select another toolchain. */
export function siblingNpmCli(execPath = process.execPath) {
  const runtimeDir = dirname(execPath);
  return [
    join(runtimeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    resolve(runtimeDir, "../lib/node_modules/npm/bin/npm-cli.js"),
  ].find((candidate) => existsSync(candidate)) ?? null;
}

/** Fail closed unless the capture process itself uses the pinned Node/npm pair. */
export function assertPinnedExecutingRuntime({ execPath = process.execPath } = {}) {
  const npmCli = siblingNpmCli(execPath);
  if (!npmCli) {
    throw new Error(`evidence runtime could not locate npm beside ${execPath}`);
  }
  const npmVersion = execFileSync(execPath, [npmCli, "--version"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  const runtime = assertPinnedReleaseRuntime({
    nodeVersion: process.version,
    npmVersion,
  });
  return Object.freeze({ ...runtime, npmCli });
}

export function assertCleanCandidateCheckout({ sha, cwd = process.cwd() }) {
  if (!EXACT_SHA.test(sha ?? "")) {
    throw new Error("evidence capture requires an exact 40-character candidate SHA");
  }
  const git = (...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const head = git("rev-parse", "HEAD");
  if (head !== sha) throw new Error(`candidate SHA ${sha} does not equal checkout HEAD ${head}`);
  const status = git("status", "--porcelain=v2", "--untracked-files=all");
  if (status) throw new Error("evidence capture requires a clean checkout with zero untracked files");
  const sourceTree = git("rev-parse", `${sha}^{tree}`);
  if (!EXACT_SHA.test(sourceTree)) throw new Error("candidate source tree could not be resolved");
  const packageLockPath = join(cwd, "package-lock.json");
  if (!existsSync(packageLockPath)) throw new Error("candidate checkout has no package-lock.json");
  const packageLockSha256 = createHash("sha256")
    .update(readFileSync(packageLockPath))
    .digest("hex");
  return { candidateSha: sha, head, sourceTree, packageLockSha256, clean: true };
}

export function validatePreviewProvenance(value, checkout) {
  if (!value || value.kind !== "xenios-evidence-build-provenance") {
    throw new Error("preview did not return Xenios evidence build provenance");
  }
  if (value.candidateSha !== checkout.candidateSha || value.sourceTree !== checkout.sourceTree) {
    throw new Error("preview build provenance does not match the exact candidate checkout");
  }
  if (!SHA256.test(value.distInventorySha256 ?? "") || !Number.isInteger(value.distFileCount) || value.distFileCount < 1) {
    throw new Error("preview build provenance has no valid distribution inventory binding");
  }
  if (
    !SHA256.test(value.packageLockSha256 ?? "") ||
    value.packageLockSha256 !== checkout.packageLockSha256 ||
    value.installMethod !== REQUIRED_INSTALL_METHOD
  ) {
    throw new Error("preview build provenance has no exact package-lock/npm-ci binding");
  }
  if (!Number.isFinite(Date.parse(value.builtAtUtc ?? ""))) {
    throw new Error("preview build provenance has no valid build timestamp");
  }
  assertPinnedReleaseRuntime({
    nodeVersion: value.nodeVersion,
    npmVersion: value.npmVersion,
  });
  return Object.freeze({
    kind: value.kind,
    candidateSha: value.candidateSha,
    sourceTree: value.sourceTree,
    distInventorySha256: value.distInventorySha256,
    distFileCount: value.distFileCount,
    builtAtUtc: value.builtAtUtc,
    nodeVersion: value.nodeVersion,
    npmVersion: value.npmVersion,
    packageLockSha256: value.packageLockSha256,
    installMethod: value.installMethod,
  });
}

export async function fetchPreviewProvenance(baseUrl, checkout) {
  const base = new URL(baseUrl);
  if (base.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(base.hostname)) {
    throw new Error("evidence preview must use an HTTP loopback origin");
  }
  const url = new URL("/__xenios_evidence_provenance", base);
  const response = await fetch(url, {
    redirect: "error",
    headers: { accept: "application/json", "user-agent": "xenios-evidence-provenance/1" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`preview provenance returned HTTP ${response.status}`);
  return validatePreviewProvenance(await response.json(), checkout);
}
