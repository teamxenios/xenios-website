// Opt in for this release only with:
// XENIOS_RELEASE_REVIEWED_FIXTURES_FILE=docs/revenue-launch/20260907/REVIEWED_SYNTHETIC_CREDENTIALS.json
// The scanner reads that repository-relative path from the candidate Git blob,
// never the working tree. Independent review must be ACCEPTED before use.
// This classifies only exact generic matches; it is not a file exemption.
import { createHash } from "node:crypto";

export const GENERIC_CREDENTIAL_RULE = "generic assigned secret";
const HEX40 = /^[a-f0-9]{40}$/;
const HEX64 = /^[a-f0-9]{64}$/;
const fail = (message) => { throw new Error(`reviewed fixture registry: ${message}`); };
export const lfSha256 = (bytes) => createHash("sha256")
  .update(Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
export const addedLineSha256 = (text) => createHash("sha256").update(text, "utf8").digest("hex");

function shape(value, keys, label) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).sort().join("|") !== [...keys].sort().join("|")) fail(`${label} schema is invalid`);
}
function repoPath(path) {
  if (typeof path !== "string" || !/^[A-Za-z0-9_.\/-]+$/.test(path) ||
      path.split("/").some((part) => !part || part === "." || part === "..")) fail("repository path is invalid");
  return path;
}
function digest(value, pattern = HEX64) {
  if (typeof value !== "string" || !pattern.test(value)) fail("digest is invalid");
}
function json(bytes, label) {
  let text; let value;
  try { text = Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n"); value = JSON.parse(text); }
  catch { fail(`${label} JSON is invalid`); }
  // Canonical JSON also refuses duplicate object keys hidden by JSON.parse.
  if (text !== `${JSON.stringify(value, null, 2)}\n`) fail(`${label} JSON must use canonical two-space formatting`);
  return value;
}
function count(map, key, amount = 1) { map.set(key, (map.get(key) ?? 0) + amount); }
function equalCounts(left, right) {
  return left.size === right.size && [...left].every(([key, amount]) => right.get(key) === amount);
}

// readBlob(sha, path) and isAncestor(olderSha, newerSha) must use immutable Git
// objects. Injection keeps schema/refusal tests independent of network or apps.
export function loadReviewedCredentialFixtures({ registryPath, baseSha, candidateSha, readBlob, isAncestor }) {
  repoPath(registryPath); digest(baseSha, HEX40); digest(candidateSha, HEX40);
  const read = (sha, path) => {
    try { return readBlob(sha, repoPath(path)); }
    catch { fail("a required Git blob is unavailable"); }
  };
  const registryBytes = read(candidateSha, registryPath);
  const registry = json(registryBytes, "registry");
  shape(registry, ["schemaVersion", "rule", "productionBaseSha", "reviewedSourceSha", "independentReviewStatus", "contextReview", "files"], "registry");
  if (registry.schemaVersion !== 1 || registry.rule !== GENERIC_CREDENTIAL_RULE) fail("version or rule is not supported");
  digest(registry.productionBaseSha, HEX40); digest(registry.reviewedSourceSha, HEX40);
  if (registry.productionBaseSha !== baseSha) fail("production base does not match");
  if (registry.independentReviewStatus !== "ACCEPTED") fail("independent review has not been accepted");
  if (!isAncestor(baseSha, registry.reviewedSourceSha) || !isAncestor(registry.reviewedSourceSha, candidateSha)) fail("reviewed source is not in the release ancestry");
  shape(registry.contextReview, ["path", "lfSha256"], "context review reference");
  repoPath(registry.contextReview.path); digest(registry.contextReview.lfSha256);
  const contextBytes = read(candidateSha, registry.contextReview.path);
  if (lfSha256(contextBytes) !== registry.contextReview.lfSha256) fail("context review digest differs");
  const context = json(contextBytes, "context review");
  shape(context, ["schemaVersion", "reviewType", "reviewedAt", "productionBaseSha", "candidateSha", "repositoryRoot", "matchScope", "strictGateStatus", "piiStatus", "summary", "limitations", "findings"], "context review");
  if (context.schemaVersion !== 1 || context.reviewType !== "STATIC_CONTEXT_DISPOSITION_ONLY" ||
      context.productionBaseSha !== baseSha || context.candidateSha !== registry.reviewedSourceSha ||
      !Array.isArray(context.findings) || !context.findings.length) fail("context review identity or findings are invalid");
  shape(context.summary, ["matches", "paths", "demonstrablySyntheticLocal", "unresolved"], "context summary");
  if (context.summary.matches !== context.findings.length ||
      context.summary.demonstrablySyntheticLocal !== context.findings.length || context.summary.unresolved !== 0 ||
      context.summary.paths !== new Set(context.findings.map((item) => item?.file)).size ||
      !Number.isFinite(Date.parse(context.reviewedAt)) || typeof context.repositoryRoot !== "string" ||
      typeof context.matchScope !== "string" || context.strictGateStatus !== "FAIL_UNCHANGED" ||
      typeof context.piiStatus !== "string" || !Array.isArray(context.limitations) ||
      !context.limitations.every((item) => typeof item === "string" && item.length > 0)) fail("context metadata is invalid");
  const reviewedCounts = new Map();
  for (const item of context.findings) {
    shape(item, ["file", "addedLineSha256", "demonstrablySyntheticLocal", "explanation"], "context finding");
    repoPath(item.file); digest(item.addedLineSha256);
    if (item.demonstrablySyntheticLocal !== true || typeof item.explanation !== "string" || !item.explanation.trim()) fail("context finding is unresolved");
    count(reviewedCounts, `${item.file}:${item.addedLineSha256}`);
  }
  if (!Array.isArray(registry.files) || !registry.files.length || registry.files.length > 1000) fail("file list is invalid");
  const expectedCounts = new Map(); const paths = new Set();
  for (const file of registry.files) {
    shape(file, ["path", "lfSha256", "matches"], "file");
    repoPath(file.path); digest(file.lfSha256);
    if (paths.has(file.path)) fail("duplicate file entry");
    paths.add(file.path);
    if (lfSha256(read(registry.reviewedSourceSha, file.path)) !== file.lfSha256 ||
        lfSha256(read(candidateSha, file.path)) !== file.lfSha256) fail("reviewed file content has drifted");
    if (!Array.isArray(file.matches) || !file.matches.length) fail("match list is invalid");
    for (const match of file.matches) {
      shape(match, ["addedLineSha256", "occurrences"], "match");
      digest(match.addedLineSha256);
      if (!Number.isSafeInteger(match.occurrences) || match.occurrences < 1 || match.occurrences > 10000) fail("occurrence count is invalid");
      const key = `${file.path}:${match.addedLineSha256}`;
      if (expectedCounts.has(key)) fail("duplicate match entry");
      expectedCounts.set(key, match.occurrences);
    }
  }
  if (!equalCounts(expectedCounts, reviewedCounts)) fail("registry does not exactly cover the context review");
  const remaining = new Map(expectedCounts); let consumed = 0;
  return {
    registrySha256: lfSha256(registryBytes),
    get reviewedMatchCount() { return consumed; },
    consume(file, text, label) {
      if (label !== GENERIC_CREDENTIAL_RULE) return false;
      const key = `${file}:${addedLineSha256(text)}`;
      if (!(remaining.get(key) > 0)) return false;
      remaining.set(key, remaining.get(key) - 1); consumed++; return true;
    },
    finish() {
      if ([...remaining.values()].some((amount) => amount !== 0)) fail("reviewed occurrences were not all encountered in the added lines");
    },
  };
}
