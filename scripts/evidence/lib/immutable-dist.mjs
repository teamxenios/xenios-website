import { createHash } from "node:crypto";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export function inventoryDirectory(root, excluded = new Set()) {
  const files = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const fullPath = join(dir, name);
      if (statSync(fullPath).isDirectory()) visit(fullPath);
      else {
        const path = relative(root, fullPath).replace(/\\/gu, "/");
        if (excluded.has(path)) continue;
        const bytes = readFileSync(fullPath);
        files.push({
          path,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
      }
    }
  };
  visit(root);
  return files;
}

export function inventorySha256(inventory) {
  return createHash("sha256").update(JSON.stringify(inventory)).digest("hex");
}

/**
 * Copy a verified production distribution beneath the repository's ignored
 * node_modules directory. Keeping the snapshot below repoRoot allows an
 * esbuild bundle with external packages to resolve the verified install while
 * still preventing later writes to the authoring dist directory from changing
 * what the preview serves.
 */
export function createImmutableDistSnapshot({
  repoRoot,
  sourceDistRoot,
  expectedInventory,
  expectedInventorySha256,
}) {
  const nodeModulesRoot = join(repoRoot, "node_modules");
  if (!existsSync(nodeModulesRoot)) {
    throw new Error("immutable preview snapshot requires the verified npm-ci node_modules install");
  }
  const parent = mkdtempSync(join(nodeModulesRoot, ".xenios-evidence-dist-"));
  const distRoot = join(parent, "dist");
  try {
    cpSync(sourceDistRoot, distRoot, { recursive: true, errorOnExist: true });
    const inventory = inventoryDirectory(distRoot, new Set(["evidence-provenance.json"]));
    const sha256 = inventorySha256(inventory);
    if (
      sha256 !== expectedInventorySha256 ||
      JSON.stringify(inventory) !== JSON.stringify(expectedInventory)
    ) {
      throw new Error("immutable distribution snapshot failed verification");
    }
    let disposed = false;
    const assertUnchanged = () => {
      if (disposed) throw new Error("immutable distribution snapshot has been disposed");
      const currentInventory = inventoryDirectory(
        distRoot,
        new Set(["evidence-provenance.json"]),
      );
      const currentSha256 = inventorySha256(currentInventory);
      if (
        currentSha256 !== expectedInventorySha256 ||
        JSON.stringify(currentInventory) !== JSON.stringify(expectedInventory)
      ) {
        throw new Error("immutable distribution snapshot changed after verification");
      }
      return Object.freeze({ inventory: currentInventory, sha256: currentSha256 });
    };
    return Object.freeze({
      parent,
      distRoot,
      inventory,
      sha256,
      assertUnchanged,
      dispose() {
        if (disposed) return;
        disposed = true;
        rmSync(parent, { recursive: true, force: true });
      },
    });
  } catch (error) {
    rmSync(parent, { recursive: true, force: true });
    throw error;
  }
}

export async function importImmutableDistEntry(snapshot, entry = "index.cjs") {
  const entryPath = resolve(snapshot.distRoot, entry);
  const withinSnapshot = relative(snapshot.distRoot, entryPath);
  if (withinSnapshot.startsWith("..") || isAbsolute(withinSnapshot)) {
    throw new Error("immutable distribution entry escaped its verified snapshot");
  }
  if (!existsSync(entryPath)) {
    throw new Error(`immutable distribution entry is missing: ${entry}`);
  }
  return import(pathToFileURL(entryPath).href);
}
