// The Research/Care import boundary, enforced structurally.
//
// The provider-workflow pathway deliberately ends in a human-coordinated
// request, not a bridge into clinical intake. Care's intake carries no product
// concept (eligibility, approved definition, telehealth and privacy consent,
// a patient and nothing else), and that absence is load-bearing: a catalog row
// that could pre-select itself into a clinical intake would put a purchase
// where a provider authorization belongs.
//
// Today the two domains share zero imports in either direction. This test
// keeps it that way on purpose: under parallel-lane pressure, the cheapest
// wrong move is a "small" import across the boundary, and this makes that
// move a red test instead of a review comment.

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
const KRIS_DIR = path.resolve(REPO_ROOT, "server/research/kris-launch-a");
const CARE_DIR = path.resolve(REPO_ROOT, "server/care");

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((entry) => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return entry.name.endsWith(".ts") ? [full] : [];
    });
}

/** Every module specifier a file imports or re-exports. */
function importedSpecifiers(file: string): string[] {
  const text = fs.readFileSync(file, "utf8");
  const specifiers: string[] = [];
  const pattern = /(?:from|import)\s+["']([^"']+)["']/g;
  for (let match = pattern.exec(text); match !== null; match = pattern.exec(text)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

function crossings(dir: string, banned: RegExp): Array<{ file: string; specifier: string }> {
  return sourceFiles(dir).flatMap((file) =>
    importedSpecifiers(file)
      .filter((specifier) => banned.test(specifier))
      .map((specifier) => ({ file: path.relative(REPO_ROOT, file), specifier })),
  );
}

describe("the Research/Care import boundary", () => {
  it("no kris-launch-a module reaches into Care", () => {
    expect(crossings(KRIS_DIR, /(^|\/)care(\/|$)|@shared\/care/)).toEqual([]);
  });

  it("no Care module reaches into kris-launch-a", () => {
    expect(crossings(CARE_DIR, /kris-launch-a/)).toEqual([]);
  });

  it("negative control: the scanner does see ordinary imports", () => {
    // If the specifier regex ever broke, both boundary cases above would pass
    // vacuously. This pins that the scanner finds a known real import.
    const projection = path.join(KRIS_DIR, "projection.ts");
    expect(importedSpecifiers(projection)).toContain("./purchase-mode");
    expect(crossings(KRIS_DIR, /purchase-mode/).length).toBeGreaterThan(0);
  });
});
