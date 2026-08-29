import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inventoryDirectory, inventorySha256 } from "./lib/immutable-dist.mjs";
import {
  assertCleanCandidateCheckout,
  assertPinnedExecutingRuntime,
  assertPinnedReleaseRuntime,
  REQUIRED_INSTALL_METHOD,
} from "./lib/provenance.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../..");

function args(argv) {
  const out = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--sha") out.sha = argv[++index];
    else if (["--help", "-h"].includes(argv[index])) out.help = true;
    else throw new Error(`unknown argument ${argv[index]}`);
  }
  return out;
}

export { inventoryDirectory } from "./lib/immutable-dist.mjs";

export async function main(argv = process.argv.slice(2)) {
  const parsed = args(argv);
  if (parsed.help || !parsed.sha) {
    console.log("usage: build-candidate-preview.mjs --sha <exact-sha>");
    process.exit(parsed.help ? 0 : 2);
  }
  const runtime = assertPinnedExecutingRuntime();
  const npmCli = runtime.npmCli;
  const runNpm = (npmArgs, options = {}) => execFileSync(
    process.execPath,
    [npmCli, ...npmArgs],
    { cwd: repoRoot, ...options },
  );
  const checkout = assertCleanCandidateCheckout({ sha: parsed.sha, cwd: repoRoot });
  const packageLockPath = join(repoRoot, "package-lock.json");
  const packageLockSha256 = () => createHash("sha256")
    .update(readFileSync(packageLockPath))
    .digest("hex");
  const lockBeforeInstall = packageLockSha256();
  if (lockBeforeInstall !== checkout.packageLockSha256) {
    throw new Error("package-lock.json hash differs from the verified clean checkout");
  }
  runNpm(["ci", "--no-audit", "--no-fund"], { stdio: "inherit" });
  if (packageLockSha256() !== lockBeforeInstall) {
    throw new Error("npm ci changed package-lock.json; candidate dependency graph is not immutable");
  }
  const postInstallCheckout = assertCleanCandidateCheckout({ sha: parsed.sha, cwd: repoRoot });
  if (postInstallCheckout.packageLockSha256 !== lockBeforeInstall) {
    throw new Error("verified package-lock.json changed during npm ci");
  }
  runNpm(["run", "build"], { stdio: "inherit" });
  const npmVersionAfterBuild = runNpm(["--version"], { encoding: "utf8" }).trim();
  assertPinnedReleaseRuntime({ nodeVersion: process.version, npmVersion: npmVersionAfterBuild });
  const postBuildCheckout = assertCleanCandidateCheckout({ sha: parsed.sha, cwd: repoRoot });
  if (postBuildCheckout.packageLockSha256 !== lockBeforeInstall) {
    throw new Error("verified package-lock.json changed during candidate build");
  }
  if (packageLockSha256() !== lockBeforeInstall) {
    throw new Error("candidate build changed package-lock.json");
  }
  const dist = join(repoRoot, "dist");
  const fileInventory = inventoryDirectory(dist, new Set(["evidence-provenance.json"]));
  if (fileInventory.length === 0) throw new Error("production build emitted no distribution files");
  const provenance = {
    schemaVersion: 1,
    kind: "xenios-evidence-build-provenance",
    candidateSha: checkout.candidateSha,
    sourceTree: checkout.sourceTree,
    builtAtUtc: new Date().toISOString(),
    nodeVersion: process.version,
    npmVersion: npmVersionAfterBuild,
    packageLockSha256: lockBeforeInstall,
    installMethod: REQUIRED_INSTALL_METHOD,
    distFileCount: fileInventory.length,
    distInventorySha256: inventorySha256(fileInventory),
    fileInventory,
  };
  mkdirSync(dist, { recursive: true });
  writeFileSync(join(dist, "evidence-provenance.json"), JSON.stringify(provenance, null, 2) + "\n");
  console.log(`candidate preview built: ${provenance.candidateSha} (${provenance.distFileCount} files, inventory ${provenance.distInventorySha256})`);
  return provenance;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
