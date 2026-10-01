/**
 * The committed binding artifact is reviewed state, so these tests hold it to
 * the same closed accounting the build enforced when it was generated: every
 * catalog variant is either bound to exactly one Product Control identity or
 * is one of nine explained unbound rows, nothing else. Two superseded bindings
 * remain archived evidence, never authority transferred to new identities.
 * A regenerated artifact
 * that drifts from the committed dataset fails here before it can ship.
 */

import fs from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { describe, expect, it } from "vitest";
import {
  MASTER_OFFERING_BINDINGS_ENV_VAR,
  MASTER_OFFERING_COMMITTED_BINDINGS_PATH,
  createProductionBindingReader,
  bindingsByOfferingVariantId,
  loadBindingIndex,
  masterOfferingProductionBindings,
} from "./production-bindings";

const DATASET_PATH = path.posix.join(
  "server",
  "research",
  "master-offerings",
  "data",
  "member-safe-master-offerings.generated.json",
);

interface DatasetShape {
  products: Array<{ id: string; variants: Array<{ id: string }> }>;
}

type BindingEntry = {
  offeringId: string;
  offeringVariantId: string;
  productControlSku: string;
  productId: string;
  variantId: string;
};
interface ArtifactShape {
  schemaVersion: number;
  boundCount: number;
  unboundCount: number;
  invariants: Record<string, unknown>;
  bindings: BindingEntry[];
  unbound: Array<{
    offeringId: string;
    offeringVariantId: string;
    sourceGroupId: string;
    reason: string;
    reasonCode: "binding_pending" | "shipping_service" | "quote_only";
  }>;
  supersededBindings: Array<{
    binding: BindingEntry;
    sourceGroupId: string;
    supersededBySourceGroupId: string;
    successorOfferingId: string;
    successorOfferingVariantId: string;
    disposition: "archived_not_transferred";
    sourceRows: string[];
  }>;
  retainedAuthority: {
    mode: string;
    predecessorSourceSha: string;
    predecessorBindingsCanonicalSha256: string;
    predecessorDatasetCanonicalSha256: string;
    predecessorReconciliationCanonicalSha256: string;
    candidateReconciliationFile: string;
    candidateReconciliationSha256: string;
    candidateReconciliationHashPolicy: string;
    predecessorWorkbookSha256: string;
    historicalPairCount: number;
    historicalPairMd5: string;
    retainedPairCount: number;
    retainedPairMd5: string;
    productionReadBackRefreshed: boolean;
    sourceRows: number;
    canonicalVariants: number;
    retainedIdentities: number;
    newIdentities: number;
  };
  productionReadBack: { at: string; source: string };
  reconciliation: {
    file: string;
    sha256: string;
    provenance: Record<string, string[]>;
    commerceHeldRows: string[];
  };
}

const HISTORICAL_PAIR_MD5 = "062a30f0d3d0a0571e78837b5b92d4f6";
const RETAINED_PAIR_MD5 = "86fdd019d3153e75920090136579b184";
const NEW_SOURCE_GROUPS = [
  "GRP-0421", "GRP-0422", "GRP-0423", "GRP-0424", "GRP-0425", "GRP-0426",
];
const ARCHIVED_BINDINGS: Record<string, BindingEntry> = {
  "GRP-0402": {
    offeringId: "mo_2aaac3a06aa0dd6b2923",
    offeringVariantId: "mov_7c55d415a9574e9ebda7",
    productControlSku: "GEN-GRP-0402",
    productId: "3d9261e4-0428-4850-8b57-f4ca9f0e9472",
    variantId: "5c705967-53dc-4fd0-9a35-c3c51abf937a",
  },
  "GRP-0407": {
    offeringId: "mo_1dd0658eb7bf15f91900",
    offeringVariantId: "mov_256cb0423eb6d2a77f65",
    productControlSku: "GEN-GRP-0407",
    productId: "a51871dd-cb32-4058-bde4-1f336b840cfa",
    variantId: "ed16b4d7-7a0e-4f34-a01f-b81966aac0b0",
  },
};
const SUPERSEDED_BY: Record<string, string> = {
  "GRP-0402": "GRP-0426",
  "GRP-0407": "GRP-0425",
};
function pairDigest(entries: readonly BindingEntry[]): string {
  return createHash("md5").update(
    entries.map((entry) => `${entry.productId}|${entry.variantId}`).sort().join("\n"),
  ).digest("hex");
}

function readRepoJson<T>(repoRelative: string): T {
  return JSON.parse(fs.readFileSync(path.resolve(repoRelative), "utf8")) as T;
}

describe("the committed binding artifact", () => {
  const artifact = readRepoJson<ArtifactShape>(MASTER_OFFERING_COMMITTED_BINDINGS_PATH);
  const dataset = readRepoJson<DatasetShape>(DATASET_PATH);

  it("loads with zero problems and the declared count", () => {
    const { index, problem } = loadBindingIndex();
    expect(problem).toBeNull();
    expect(index.size).toBe(artifact.boundCount);
    expect(index.size).toBe(415);
  });

  it("re-keys by offering variant id with no loss, which is what the order seam looks up", () => {
    // The assisted-order composition holds an offering VARIANT id and nothing
    // else. It used to query the composite-keyed index directly, so all 417
    // lookups missed and every order line lost its price and its purchase
    // action, with submit answering HTTP 500. A miss returns null, which is
    // also the honest answer for a genuinely unbound variant, so nothing
    // complained. These assertions are the thing that would have complained.
    const { index } = loadBindingIndex();
    const byVariant = bindingsByOfferingVariantId(index);

    expect(byVariant.size).toBe(index.size);
    expect(byVariant.size).toBe(415);

    for (const binding of Array.from(index.values())) {
      const resolved = byVariant.get(binding.offeringVariantId);
      expect(resolved, binding.offeringVariantId).toBeDefined();
      expect(resolved?.productId).toBe(binding.productId);
      expect(resolved?.variantId).toBe(binding.variantId);
    }

    // And the composite key is NOT what this map answers to, which is exactly
    // the confusion that caused the outage.
    const first = Array.from(index.keys())[0];
    expect(first).toContain("|");
    expect(byVariant.get(first)).toBeUndefined();
  });

  it("accounts for every dataset variant exactly once", () => {
    expect(dataset.products).toHaveLength(424);
    const bound = new Set(
      artifact.bindings.map((entry) => `${entry.offeringId}|${entry.offeringVariantId}`),
    );
    const excluded = new Set(
      artifact.unbound.map((entry) => `${entry.offeringId}|${entry.offeringVariantId}`),
    );
    expect(bound.size).toBe(artifact.bindings.length);
    expect(excluded.size).toBe(9);
    expect(artifact.unboundCount).toBe(9);
    expect(artifact.unbound).toHaveLength(9);
    expect(bound.size + excluded.size).toBe(424);
    for (const product of dataset.products) {
      expect(product.variants).toHaveLength(1);
      const key = `${product.id}|${product.variants[0].id}`;
      const isBound = bound.has(key);
      const isExcluded = excluded.has(key);
      expect(isBound !== isExcluded).toBe(true);
    }
    // Both directions: no binding may point at a variant the dataset no
    // longer carries.
    const datasetKeys = new Set(
      dataset.products.map((product) => `${product.id}|${product.variants[0].id}`),
    );
    for (const key of bound) expect(datasetKeys.has(key)).toBe(true);
    for (const key of excluded) expect(datasetKeys.has(key)).toBe(true);
  });

  it("pins the local retained subset without claiming a refreshed production read-back", () => {
    const authority = artifact.retainedAuthority;
    expect(authority).toMatchObject({
      mode: "reviewed_predecessor_subset",
      historicalPairCount: 417,
      historicalPairMd5: HISTORICAL_PAIR_MD5,
      retainedPairCount: 415,
      retainedPairMd5: RETAINED_PAIR_MD5,
      productionReadBackRefreshed: false,
      sourceRows: 426,
      canonicalVariants: 424,
      retainedIdentities: 418,
      newIdentities: 6,
    });
    expect(authority.predecessorSourceSha).toMatch(/^[0-9a-f]{40}$/);
    for (const digest of [
      authority.predecessorBindingsCanonicalSha256,
      authority.predecessorDatasetCanonicalSha256,
      authority.predecessorReconciliationCanonicalSha256,
      authority.predecessorWorkbookSha256,
    ]) expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(authority.candidateReconciliationFile).toBe("master-catalog-reconciliation-20260821.json");
    expect(authority.candidateReconciliationHashPolicy).toBe("utf8_crlf_to_lf_source_text");
    const candidateReconciliationHash = createHash("sha256").update(
      fs.readFileSync(path.resolve("config", "research", authority.candidateReconciliationFile), "utf8").replace(/\r\n/g, "\n"),
    ).digest("hex");
    expect(authority.candidateReconciliationSha256).toBe(candidateReconciliationHash);
    expect(artifact.reconciliation.file).toBe(authority.candidateReconciliationFile);
    expect(artifact.reconciliation.sha256).toBe(candidateReconciliationHash);
    expect(pairDigest(artifact.bindings)).toBe(RETAINED_PAIR_MD5);
    const historical = [
      ...artifact.bindings,
      ...artifact.supersededBindings.map((entry) => entry.binding),
    ];
    expect(historical).toHaveLength(417);
    expect(new Set(historical.map((entry) => `${entry.productId}|${entry.variantId}`)).size).toBe(417);
    expect(pairDigest(historical)).toBe(HISTORICAL_PAIR_MD5);
    // This metadata is the original historical binding read-back, verbatim.
    // Its date differs from the separately recorded 2026-08-20 price census.
    expect(artifact.productionReadBack).toEqual({
      at: "2026-08-15T05:05:00.000Z",
      source: "production Supabase project yvzeduaxbwgcwllhywff, research_product_variants where sku like 'GEN-GRP-%', joined product_id; read back after the 11-chunk general Product Control initialization verified 217 products / 417 variants / 417 approved member prices",
    });
  });

  it("archives both superseded pairs exactly and never transfers them to the successors", async () => {
    expect(artifact.supersededBindings.map((entry) => entry.sourceGroupId).sort())
      .toEqual(["GRP-0402", "GRP-0407"]);
    const reader = createProductionBindingReader();
    for (const entry of artifact.supersededBindings) {
      const old = ARCHIVED_BINDINGS[entry.sourceGroupId];
      const nextGroup = SUPERSEDED_BY[entry.sourceGroupId];
      expect(entry.binding).toEqual(old);
      expect(entry.disposition).toBe("archived_not_transferred");
      expect(entry.supersededBySourceGroupId).toBe(nextGroup);
      expect(entry.sourceRows).toEqual([nextGroup, entry.sourceGroupId]);
      expect(artifact.reconciliation.provenance[nextGroup]).toEqual(entry.sourceRows);
      expect(artifact.bindings.some((binding) =>
        binding.offeringVariantId === old.offeringVariantId || binding.variantId === old.variantId,
      )).toBe(false);
      expect(dataset.products.some((product) =>
        product.id === old.offeringId || product.variants.some((variant) => variant.id === old.offeringVariantId),
      )).toBe(false);
      const successor = artifact.unbound.find((unbound) => unbound.sourceGroupId === nextGroup);
      expect(successor).toMatchObject({
        offeringId: entry.successorOfferingId,
        offeringVariantId: entry.successorOfferingVariantId,
        reasonCode: "binding_pending",
      });
      expect(await reader.readBinding({
        offeringId: old.offeringId, offeringVariantId: old.offeringVariantId,
      })).toBeNull();
      expect(await reader.readBinding({
        offeringId: entry.successorOfferingId,
        offeringVariantId: entry.successorOfferingVariantId,
      })).toBeNull();
    }
  });

  it("carries identity only: five fields, no price, no authority", () => {
    for (const entry of artifact.bindings) {
      expect(Object.keys(entry).sort()).toEqual([
        "offeringId",
        "offeringVariantId",
        "productControlSku",
        "productId",
        "variantId",
      ]);
    }
    for (const declared of Object.values(artifact.invariants)) {
      expect(declared).toBe(false);
    }
  });

  it("maps distinct Product Control identities per variant", () => {
    const variantUuids = new Set(artifact.bindings.map((entry) => entry.variantId));
    const skus = new Set(artifact.bindings.map((entry) => entry.productControlSku));
    expect(variantUuids.size).toBe(artifact.bindings.length);
    expect(skus.size).toBe(artifact.bindings.length);
  });
});

describe("the production binding reader", () => {
  const artifact = readRepoJson<ArtifactShape>(MASTER_OFFERING_COMMITTED_BINDINGS_PATH);

  it("answers the exact identity for a bound variant and null otherwise", async () => {
    const first = artifact.bindings[0];
    const answer = await masterOfferingProductionBindings.readBinding({
      offeringId: first.offeringId,
      offeringVariantId: first.offeringVariantId,
    });
    expect(answer).toEqual({
      offeringVariantId: first.offeringVariantId,
      productId: first.productId,
      variantId: first.variantId,
    });

    const excluded = artifact.unbound[0];
    expect(
      await masterOfferingProductionBindings.readBinding({
        offeringId: excluded.offeringId,
        offeringVariantId: excluded.offeringVariantId,
      }),
    ).toBeNull();
    expect(
      await masterOfferingProductionBindings.readBinding({
        offeringId: "mo_missing",
        offeringVariantId: "mov_missing",
      }),
    ).toBeNull();
  });

  it("fails closed to zero bindings when the artifact is absent", async () => {
    const messages: string[] = [];
    const reader = createProductionBindingReader({
      env: { [MASTER_OFFERING_BINDINGS_ENV_VAR]: "does-not-exist.json" },
      cwd: os.tmpdir(),
      log: (message) => messages.push(message),
    });
    const first = artifact.bindings[0];
    expect(
      await reader.readBinding({
        offeringId: first.offeringId,
        offeringVariantId: first.offeringVariantId,
      }),
    ).toBeNull();
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("on request");
  });

  it("rejects a malformed artifact whole rather than serving part of it", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mo-bindings-"));
    const file = path.join(directory, "broken.json");
    const good = artifact.bindings[0];
    fs.writeFileSync(
      file,
      JSON.stringify({
        ...artifact,
        boundCount: 2,
        bindings: [good, { offeringId: "mo_x", offeringVariantId: "mov_x" }],
      }),
      "utf8",
    );
    const { index, problem } = loadBindingIndex({
      env: { [MASTER_OFFERING_BINDINGS_ENV_VAR]: file },
      cwd: directory,
    });
    expect(index.size).toBe(0);
    expect(problem).toContain("malformed");
  });
});

describe("unbound reasons are source-identity facts, not a shared null-price label", () => {
  const artifact = readRepoJson<ArtifactShape>(MASTER_OFFERING_COMMITTED_BINDINGS_PATH);
  const dataset = readRepoJson<{ products: Array<{ id: string; displayName: string }> }>(DATASET_PATH);
  const nameOf = (offeringId: string) =>
    dataset.products.find((product) => product.id === offeringId)?.displayName ?? null;

  it("separates six unreleased identities, two genuine quote-only rows and one shipping service", () => {
    const bySource = new Map(artifact.unbound.map((entry) => [entry.sourceGroupId, entry]));
    expect(bySource.size).toBe(9);
    expect(artifact.unbound.filter((entry) => entry.reasonCode === "binding_pending")
      .map((entry) => entry.sourceGroupId).sort()).toEqual(NEW_SOURCE_GROUPS);
    expect(artifact.unbound.filter((entry) => entry.reasonCode === "quote_only")
      .map((entry) => entry.sourceGroupId).sort()).toEqual(["GRP-0244", "GRP-0365"]);
    expect(artifact.unbound.filter((entry) => entry.reasonCode === "shipping_service")
      .map((entry) => entry.sourceGroupId)).toEqual(["GRP-0364"]);
    expect(nameOf(bySource.get("GRP-0244")!.offeringId)).toBe("BAM15");
    expect(nameOf(bySource.get("GRP-0365")!.offeringId)).toBe("Syringes & Alcohol Swabs");
    expect(bySource.get("GRP-0364")).toMatchObject({
      offeringId: "mo_003b0c272099eeb1f114",
      offeringVariantId: "mov_9b65ad5bb184691e19e0",
      reasonCode: "shipping_service",
    });
    expect(nameOf(bySource.get("GRP-0364")!.offeringId)).toBe("FedEx Standard Overnight");
    expect(bySource.get("GRP-0364")!.reason).toMatch(/^shipping service row/);
    expect(bySource.get("GRP-0244")!.reason).toMatch(/^price pending/);
    expect(bySource.get("GRP-0365")!.reason).toMatch(/^price pending/);
    for (const entry of artifact.unbound) expect(entry.reason.trim().length).toBeGreaterThan(0);
    expect(bySource.get("GRP-0422")).toMatchObject({
      offeringId: "mo_2babbadce5172426bde2",
      offeringVariantId: "mov_f61758881da2b7bfa539",
      reasonCode: "binding_pending",
    });
    expect(artifact.reconciliation.commerceHeldRows).toEqual(["GRP-0422"]);
  });
});
