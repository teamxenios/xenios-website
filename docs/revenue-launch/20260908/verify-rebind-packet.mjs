#!/usr/bin/env node
// Reviewer's independent check of the fixture-registry re-bind. Run from the
// repository root with the pinned Node; prints one verdict per claim and exits
// 1 if any claim fails. It reads only Git objects and the two record pairs.
//
//   node docs/revenue-launch/20260908/verify-rebind-packet.mjs
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const REVIEWED = "8e125ca7cbd300a7e96e4dbca8f5eca654558bfe"; // B's accepted reviewedSourceSha
const REBOUND = "bf7b5fee78102289bcc6c68e9e336bb0ea0c9d5e";  // proposed reviewedSourceSha
const CANDIDATE = "45f95dfe51ef0aa226b39413c1fbd02fc121ece8";
const BASE = "ff3c496245739233b71e46f9e5d6e26af9d57017";
const OLD_DIR = "docs/revenue-launch/20260907";
const NEW_DIR = "docs/revenue-launch/20260908";

const lf = (bytes) => createHash("sha256").update(Buffer.from(bytes).toString("utf8").replace(/\r\n/g, "\n"), "utf8").digest("hex");
const blob = (sha, path) => execFileSync("git", ["cat-file", "blob", `${sha}:${path}`], { maxBuffer: 64 * 1024 * 1024 });
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
let failures = 0;
const claim = (text, ok, detail = "") => { console.log(`${ok ? "PASS" : "FAIL"}  ${text}${detail ? "  — " + detail : ""}`); if (!ok) failures++; };

const oldReg = json(`${OLD_DIR}/REVIEWED_SYNTHETIC_CREDENTIALS.json`);
const newReg = json(`${NEW_DIR}/REVIEWED_SYNTHETIC_CREDENTIALS.json`);
const oldCtx = json(`${OLD_DIR}/synthetic-credential-context-review.json`);
const newCtx = json(`${NEW_DIR}/synthetic-credential-context-review.json`);

// 1. B's accepted registry binds at its own reviewed source and NOT at the candidate.
const driftAtOld = oldReg.files.filter((f) => lf(blob(REVIEWED, f.path)) !== f.lfSha256);
const driftAtNew = oldReg.files.filter((f) => lf(blob(REBOUND, f.path)) !== f.lfSha256);
claim("accepted registry matches every pinned file at 8e125ca7", driftAtOld.length === 0, `${driftAtOld.length} drifted`);
claim("accepted registry drifts at bf7b5fe on exactly one file", driftAtNew.length === 1 && driftAtNew[0].path === "scripts/revenue-launch/new-account-browser-qualification.mjs", driftAtNew.map((f) => f.path).join(","));

// 2. The source delta of that one file is exactly one removed trailing blank line.
const before = blob(REVIEWED, driftAtNew[0]?.path ?? "").toString("utf8").replace(/\r\n/g, "\n");
const after = blob(REBOUND, driftAtNew[0]?.path ?? "").toString("utf8").replace(/\r\n/g, "\n");
claim("delta is one trailing newline: after + \"\\n\" === before", after + "\n" === before, `${before.length} -> ${after.length} bytes`);

// 3. Proposed registry: same 20 paths in order, same match lists, one lfSha256 changed to the bf7b5fe bytes.
const samePaths = oldReg.files.length === newReg.files.length && oldReg.files.every((f, i) => f.path === newReg.files[i].path);
const sameMatches = oldReg.files.every((f, i) => JSON.stringify(f.matches) === JSON.stringify(newReg.files[i].matches));
const changedHashes = oldReg.files.filter((f, i) => f.lfSha256 !== newReg.files[i].lfSha256).map((f) => f.path);
claim("proposed registry keeps the same 20 paths in the same order", samePaths);
claim("proposed registry keeps every match list (addedLineSha256 + occurrences) unchanged", sameMatches);
claim("proposed registry changes exactly one lfSha256, for the drifted file", changedHashes.length === 1 && changedHashes[0] === driftAtNew[0]?.path, changedHashes.join(","));
claim("every proposed lfSha256 equals the file bytes at bf7b5fe AND at the candidate", newReg.files.every((f) => lf(blob(REBOUND, f.path)) === f.lfSha256 && lf(blob(CANDIDATE, f.path)) === f.lfSha256));
const topDiff = Object.keys(oldReg).filter((k) => k !== "files" && JSON.stringify(oldReg[k]) !== JSON.stringify(newReg[k]));
claim("proposed registry top-level changes are only reviewedSourceSha, independentReviewStatus, contextReview", topDiff.sort().join(",") === "contextReview,independentReviewStatus,reviewedSourceSha", topDiff.join(","));
claim("proposed registry status is PENDING_REACCEPTANCE (the loader refuses it until a reviewer accepts)", newReg.independentReviewStatus === "PENDING_REACCEPTANCE", newReg.independentReviewStatus);
claim("proposed registry reviewedSourceSha is bf7b5fe and productionBaseSha is unchanged", newReg.reviewedSourceSha === REBOUND && newReg.productionBaseSha === BASE && oldReg.productionBaseSha === BASE);

// 4. Proposed context review: identical findings, candidateSha moved, placeholder reviewedAt, one appended limitation.
claim("context review findings are byte-identical (102 dispositions unchanged)", JSON.stringify(oldCtx.findings) === JSON.stringify(newCtx.findings) && oldCtx.findings.length === 102, `${oldCtx.findings.length} -> ${newCtx.findings.length}`);
const ctxDiff = Object.keys(oldCtx).filter((k) => k !== "findings" && JSON.stringify(oldCtx[k]) !== JSON.stringify(newCtx[k]));
claim("context review changes are only candidateSha, reviewedAt, limitations", ctxDiff.sort().join(",") === "candidateSha,limitations,reviewedAt", ctxDiff.join(","));
claim("context review limitations: the original list is intact with one appended", newCtx.limitations.length === oldCtx.limitations.length + 1 && oldCtx.limitations.every((l, i) => newCtx.limitations[i] === l));
claim("proposed contextReview.lfSha256 equals the proposed context file bytes", lf(readFileSync(`${NEW_DIR}/synthetic-credential-context-review.json`)) === newReg.contextReview.lfSha256 && newReg.contextReview.path === `${NEW_DIR}/synthetic-credential-context-review.json`);

// 5. Every match hash is still among the candidate's added lines with at least the recorded occurrences.
const diff = execFileSync("git", ["diff", `${BASE}..${CANDIDATE}`, "--unified=0"], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
const added = new Map(); let file = "";
for (const line of diff.split("\n")) {
  if (line.startsWith("+++ b/")) file = line.slice(6);
  else if (line.startsWith("+") && !line.startsWith("+++")) { const k = `${file}:${createHash("sha256").update(line.slice(1), "utf8").digest("hex")}`; added.set(k, (added.get(k) ?? 0) + 1); }
}
const missing = newReg.files.flatMap((f) => f.matches.filter((m) => (added.get(`${f.path}:${m.addedLineSha256}`) ?? 0) < m.occurrences).map((m) => `${f.path}:${m.addedLineSha256.slice(0, 12)}`));
claim("all 102 match occurrences are present among the candidate's added lines", missing.length === 0, missing.slice(0, 3).join(","));

console.log(failures === 0 ? "\nALL CLAIMS HOLD. Acceptance remains a reviewer's decision; this script does not set it." : `\n${failures} CLAIM(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
