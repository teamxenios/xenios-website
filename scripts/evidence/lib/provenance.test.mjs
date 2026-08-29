import { describe, expect, it } from "vitest";
import { validatePreviewProvenance } from "./provenance.mjs";

const checkout = {
  candidateSha: "a".repeat(40),
  sourceTree: "b".repeat(40),
  packageLockSha256: "d".repeat(64),
  clean: true,
};

describe("validatePreviewProvenance", () => {
  it("accepts a build bound to the exact candidate and source tree", () => {
    expect(validatePreviewProvenance({
      kind: "xenios-evidence-build-provenance",
      candidateSha: checkout.candidateSha,
      sourceTree: checkout.sourceTree,
      distInventorySha256: "c".repeat(64),
      distFileCount: 42,
      builtAtUtc: "2026-08-29T17:00:00.000Z",
      nodeVersion: "v20.19.0",
      npmVersion: "10.8.2",
      packageLockSha256: checkout.packageLockSha256,
      installMethod: "npm ci --no-audit --no-fund",
    }, checkout)).toMatchObject({ candidateSha: checkout.candidateSha, distFileCount: 42 });
  });

  it("rejects a stale SHA, tree, inventory, or timestamp", () => {
    const base = {
      kind: "xenios-evidence-build-provenance",
      candidateSha: checkout.candidateSha,
      sourceTree: checkout.sourceTree,
      distInventorySha256: "c".repeat(64),
      distFileCount: 1,
      builtAtUtc: "2026-08-29T17:00:00.000Z",
      nodeVersion: "v20.19.0",
      npmVersion: "10.8.2",
      packageLockSha256: checkout.packageLockSha256,
      installMethod: "npm ci --no-audit --no-fund",
    };
    for (const over of [
      { candidateSha: "d".repeat(40) },
      { sourceTree: "e".repeat(40) },
      { distInventorySha256: "short" },
      { distFileCount: 0 },
      { builtAtUtc: "not-a-time" },
      { packageLockSha256: "e".repeat(64) },
      { installMethod: "npm install" },
    ]) {
      expect(() => validatePreviewProvenance({ ...base, ...over }, checkout)).toThrow();
    }
  });

  it("rejects a build made with any runtime other than the release pins", () => {
    const base = {
      kind: "xenios-evidence-build-provenance",
      candidateSha: checkout.candidateSha,
      sourceTree: checkout.sourceTree,
      distInventorySha256: "c".repeat(64),
      distFileCount: 1,
      builtAtUtc: "2026-08-29T17:00:00.000Z",
      nodeVersion: "v20.19.0",
      npmVersion: "10.8.2",
      packageLockSha256: checkout.packageLockSha256,
      installMethod: "npm ci --no-audit --no-fund",
    };
    expect(() => validatePreviewProvenance({ ...base, nodeVersion: "v24.14.1" }, checkout)).toThrow(/Node v20\.19\.0/u);
    expect(() => validatePreviewProvenance({ ...base, npmVersion: "11.9.0" }, checkout)).toThrow(/npm 10\.8\.2/u);
  });
});
