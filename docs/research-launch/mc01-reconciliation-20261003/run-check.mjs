// Local-only qualification collector. Run with the pinned Node 20 runtime.
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import path from "node:path";

const base = "3eaa017fcbd28989c65ffc4bb439a554aa1f3f59";
const root = process.cwd();
const out = path.join(root, "docs/research-launch/mc01-reconciliation-20261003/evidence");
const [job, label = job] = process.argv.slice(2);
if (!/^[a-z0-9-]+$/.test(label ?? "")) throw Error("Invalid job label");
if (process.version !== "v20.19.0") throw Error("Use pinned Node 20.19.0");
const git = (...args) => execFileSync("git", args, {
  cwd: root, encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
}).trim();
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const tests = git("ls-files").split("\n").filter((file) => /\.test\.(ts|tsx)$/.test(file) && (
  /^server\/research\/(catalog|commerce|product-activation|products-diagnostics|master-offerings)\//.test(file) ||
  /^server\/research\/early-access\/(catalog\/|cart\/|release\/canonical-payment-eligibility)/.test(file) ||
  /^client\/src\/research\/(adapters\/(cartProductSelection|memberCatalog|commerce)|products-diagnostics\/RequiredInputState)/.test(file) ||
  /^client\/src\/research\/.*cart/i.test(file) ||
  /^shared\/research\/.*cart/i.test(file)
));
const verifier = "supabase/verification/research_media_commerce_decoupling_local.mjs";
const jobs = {
  "product-control-ui": ["node_modules/vitest/vitest.mjs", "run", "client/src/research/pages/adminx/ProductPriceReviewPanel.test.tsx", "--maxWorkers=1", "--no-file-parallelism"],
  affected: ["node_modules/vitest/vitest.mjs", "run", ...tests, "--maxWorkers=1", "--no-file-parallelism"],
  typescript: ["node_modules/typescript/bin/tsc", "--noEmit"],
  build: [path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js"), "run", "build"],
  "sql-syntax": ["--check", verifier],
  "sql-source": [verifier, "--source-only"],
  "sql-local": [verifier],
  protection: ["scripts/acceptance/verify-core-site-protection.mjs"],
  "protection-base": ["scripts/acceptance/verify-core-site-protection.mjs", base, "HEAD"],
  "no-em-dash": ["--import", "tsx", "scripts/acceptance/verify-no-em-dash.mjs", "--source"],
  dag: ["--import", "tsx", "scripts/acceptance/verify-migration-dag.ts"],
};
if (!(job in jobs)) throw Error("Unknown local verification job");
function state() {
  const sourcePaths = git("diff", "--name-only", base).split("\n").filter((file) =>
    file && !file.startsWith(".xenios/") && !file.startsWith("docs/") && existsSync(file));
  for (const file of [verifier, "supabase/candidates/20261003_research_media_commerce_decoupling.sql"])
    if (!sourcePaths.includes(file)) sourcePaths.push(file);
  return {
    head: git("rev-parse", "HEAD"), tree: git("rev-parse", "HEAD^{tree}"),
    dirty: git("status", "--porcelain").split("\n").filter(Boolean),
    sourceHashes: Object.fromEntries(sourcePaths.sort().map((file) => [file, hash(readFileSync(file))])),
  };
}
mkdirSync(out, { recursive: true });
const logPath = path.join(out, `${label}.log`);
if (existsSync(logPath) || existsSync(path.join(out, `${label}.json`)))
  throw Error("Use a new label; earlier evidence must be preserved");
const startedAt = new Date().toISOString();
const before = state();
const env = { ...process.env,
  PATH: `${path.dirname(process.execPath)}${path.delimiter}${process.env.PATH ?? ""}`,
  XENIOS_MASTER_OFFERINGS_DATASET: path.join(root, "server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
};
let log = "";
writeFileSync(logPath, "");
const child = spawn(process.execPath, jobs[job], { cwd: root, env, windowsHide: true });
const capture = (part) => { log += part.toString(); appendFileSync(logPath, part); };
child.stdout.on("data", capture);
child.stderr.on("data", capture);
const exit = await new Promise((resolve, reject) => {
  child.on("error", reject);
  child.on("close", (code, signal) => resolve({ code, signal }));
});
const completedAt = new Date().toISOString();
const after = state();
const receipt = {
  job, label, base, executable: process.execPath, node: process.version,
  args: jobs[job], cwd: root, startedAt, completedAt,
  elapsedMs: Date.parse(completedAt) - Date.parse(startedAt), ...exit,
  before, after, sourceUnchangedAtBoundaries: JSON.stringify(before.sourceHashes) === JSON.stringify(after.sourceHashes),
  logSha256: hash(log), collectorSha256: hash(readFileSync(new URL(import.meta.url))),
  provenanceLimit: "Boundary source hashes and launcher provenance only; not continuous filesystem or child-process attestation.",
};
writeFileSync(path.join(out, `${label}.log`), log);
writeFileSync(path.join(out, `${label}.json`), JSON.stringify(receipt, null, 2) + "\n");
process.stdout.write(log.split(/\r?\n/).slice(-100).join("\n") + "\n");
process.stdout.write(JSON.stringify({ job, label, ...exit, elapsedMs: receipt.elapsedMs,
  sourceUnchangedAtBoundaries: receipt.sourceUnchangedAtBoundaries,
  logSha256: receipt.logSha256 }) + "\n");
process.exitCode = exit.code ?? 1;
