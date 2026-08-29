import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  createImmutableDistSnapshot,
  importImmutableDistEntry,
  inventoryDirectory,
  inventorySha256,
} from "./immutable-dist.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../..");

describe("immutable candidate distribution", () => {
  it("loads a preview entry with external packages from the verified npm-ci install", async () => {
    const sourceParent = mkdtempSync(join(tmpdir(), "xr-immutable-source-"));
    const sourceDistRoot = join(sourceParent, "dist");
    mkdirSync(sourceDistRoot);
    writeFileSync(
      join(sourceDistRoot, "index.cjs"),
      "const ws = require('ws'); module.exports = { resolved: typeof ws.WebSocket === 'function' };\n",
    );
    const expectedInventory = inventoryDirectory(sourceDistRoot);
    const snapshot = createImmutableDistSnapshot({
      repoRoot,
      sourceDistRoot,
      expectedInventory,
      expectedInventorySha256: inventorySha256(expectedInventory),
    });
    try {
      expect(snapshot.parent.startsWith(join(repoRoot, "node_modules"))).toBe(true);
      const loaded = await importImmutableDistEntry(snapshot);
      expect(loaded.default).toEqual({ resolved: true });
      expect(snapshot.assertUnchanged().sha256).toBe(inventorySha256(expectedInventory));
    } finally {
      snapshot.dispose();
      rmSync(sourceParent, { recursive: true, force: true });
    }
  });

  it("rejects an inventory that does not bind the copied bytes", () => {
    const sourceParent = mkdtempSync(join(tmpdir(), "xr-immutable-source-"));
    const sourceDistRoot = join(sourceParent, "dist");
    mkdirSync(sourceDistRoot);
    writeFileSync(join(sourceDistRoot, "index.cjs"), "module.exports = true;\n");
    try {
      expect(() => createImmutableDistSnapshot({
        repoRoot,
        sourceDistRoot,
        expectedInventory: inventoryDirectory(sourceDistRoot),
        expectedInventorySha256: "0".repeat(64),
      })).toThrow(/failed verification/u);
    } finally {
      rmSync(sourceParent, { recursive: true, force: true });
    }
  });

  it("fails the end-of-capture revalidation if verified snapshot bytes change", () => {
    const sourceParent = mkdtempSync(join(tmpdir(), "xr-immutable-source-"));
    const sourceDistRoot = join(sourceParent, "dist");
    mkdirSync(sourceDistRoot);
    writeFileSync(join(sourceDistRoot, "index.cjs"), "module.exports = true;\n");
    const expectedInventory = inventoryDirectory(sourceDistRoot);
    const snapshot = createImmutableDistSnapshot({
      repoRoot,
      sourceDistRoot,
      expectedInventory,
      expectedInventorySha256: inventorySha256(expectedInventory),
    });
    try {
      writeFileSync(join(snapshot.distRoot, "index.cjs"), "module.exports = false;\n");
      expect(() => snapshot.assertUnchanged()).toThrow(/changed after verification/u);
    } finally {
      snapshot.dispose();
      rmSync(sourceParent, { recursive: true, force: true });
    }
  });
});
