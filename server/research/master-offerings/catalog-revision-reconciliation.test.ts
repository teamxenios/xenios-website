import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { catalogRevisionFromGeneratedArtifact } from "./catalog-revision";
import { assertGeneratedArtifactSafe } from "./catalog-revision-artifact";
import { MASTER_OFFERINGS_COMMITTED_DATASET_PATH } from "./dataset-location";

function currentArtifact(): any {
  return JSON.parse(readFileSync(path.resolve(MASTER_OFFERINGS_COMMITTED_DATASET_PATH), "utf8"));
}

describe("revision tools over the real reconciled 424-variant artifact", () => {
  it("loads current reviewed lineage through both revision and privacy entry points", () => {
    const artifact = currentArtifact();
    const revision = catalogRevisionFromGeneratedArtifact({ label: "current", parsed: artifact });
    expect(revision.offerings).toHaveLength(424);
    expect(revision.sourceWorkbookSha256).toBe(artifact.sourceWorkbookSha256);
    expect(revision.offerings.every((offering) => offering.canonicalKey === "")).toBe(true);
    expect(revision.offerings.every((offering) => offering.variants.every((variant) => variant.sourceSkus.length === 0))).toBe(true);
    expect(assertGeneratedArtifactSafe(artifact, [])).toEqual({ offerings: 424, variants: 424, countsAgree: true });
  });

  it("does not waive stale or missing reconciliation metadata in either entry point", () => {
    for (const mutate of [
      (artifact: any) => { artifact.reconciliation.sha256 = "0".repeat(64); },
      (artifact: any) => { delete artifact.reconciliation; },
    ]) {
      const artifact = currentArtifact();
      mutate(artifact);
      expect(() => catalogRevisionFromGeneratedArtifact({ label: "stale", parsed: artifact })).toThrow(/pinned authority/);
      expect(() => assertGeneratedArtifactSafe(artifact, [])).toThrow(/pinned authority/);
    }
  });

  it("refuses identity overlays that sever the reviewed hold or change canonical accounting", () => {
    for (const mutate of [
      (artifact: any) => {
        const held = artifact.products.find((offering: any) => offering.id === "mo_2babbadce5172426bde2");
        held.variants[0].id = "mov_unreviewed_identity";
      },
      (artifact: any) => {
        artifact.products.pop();
        artifact.canonicalProductCount -= 1;
        artifact.variantCount -= 1;
      },
    ]) {
      const artifact = currentArtifact();
      mutate(artifact);
      expect(() => catalogRevisionFromGeneratedArtifact({ label: "unreviewed-overlay", parsed: artifact })).toThrow(/pinned authority/);
      expect(() => assertGeneratedArtifactSafe(artifact, [])).toThrow(/pinned authority/);
    }
  });
});
