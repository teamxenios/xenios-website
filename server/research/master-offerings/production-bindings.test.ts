/**
 * The committed binding artifact is reviewed state, so these tests hold it to
 * the same closed accounting the build enforced when it was generated: every
 * catalog variant is either bound to exactly one Product Control identity or
 * is one of the three known exclusions, nothing else. A regenerated artifact
 * that drifts from the committed dataset fails here before it can ship.
 */

import fs from "node:fs";
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

interface ArtifactShape {
  schemaVersion: number;
  boundCount: number;
  unboundCount: number;
  invariants: Record<string, unknown>;
  bindings: Array<Record<string, string>>;
  unbound: Array<{ offeringId: string; offeringVariantId: string; reason: string }>;
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
    expect(index.size).toBe(417);
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
    expect(byVariant.size).toBe(417);

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
    expect(dataset.products).toHaveLength(420);
    const bound = new Set(
      artifact.bindings.map((entry) => `${entry.offeringId}|${entry.offeringVariantId}`),
    );
    const excluded = new Set(
      artifact.unbound.map((entry) => `${entry.offeringId}|${entry.offeringVariantId}`),
    );
    expect(bound.size).toBe(artifact.bindings.length);
    expect(excluded.size).toBe(3);
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
        schemaVersion: 1,
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
