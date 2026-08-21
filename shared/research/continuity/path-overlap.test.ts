// Lease conflict detection for xenios-os.
//
// Lives under shared/ because vitest's include covers server/**, shared/** and
// client/src/** but not scripts/**. The implementation stays next to the CLI
// that uses it (scripts/agentic/path-overlap.mjs); only the proof lives here.
//
// The cases below are taken from the LIVE board on 2026-08-21, when the old
// truncating implementation made REQUEST-CENTER unclaimable by anyone.

import { describe, expect, it } from "vitest";
// @ts-expect-error -- plain .mjs module, no type declarations by design
import { patternSegments, patternsOverlap, segmentsIntersect } from "../../../scripts/agentic/path-overlap.mjs";

const overlaps = patternsOverlap as (a: string, b: string) => boolean;

describe("patterns with an inline globstar take the conservative answer", () => {
  // CORRECTED 2026-08-21, after general-platform-07 found false negatives in
  // the first version of this fix.
  //
  // The first attempt read `**request**` as a WITHIN-SEGMENT wildcard, which
  // made REQUEST-CENTER claimable and looked like the right answer. It was
  // not. Under that reading `server/research/**request**` and
  // `server/research/master-offerings/**` both cover
  // `server/research/master-offerings/request-projection.ts`, yet overlaps()
  // returned false — handing two sessions the same file. Verified with witness
  // files for all three of 07's cases before this correction landed.
  //
  // Whoever wrote `**request**` meant "anything under here mentioning
  // request", which crosses directories. Deciding that precisely means
  // intersecting two regular languages; these patterns are rare and
  // pathological, so the module over-reports instead. Over-reporting blocks a
  // claim, which is recoverable. Under-reporting puts two writers in one file,
  // which is not.
  //
  // CONSEQUENCE, recorded deliberately: REQUEST-CENTER is NOT claimable while
  // its paths are written this way. The fix for that belongs in
  // ACTIVE_TASKS.json — narrow the paths to real directories — and not in this
  // module.
  const REQUEST_CENTER = [
    "client/src/research/**request**",
    "server/research/**request**",
    "shared/research/**request**",
  ];

  it.each([
    ["server/research/master-offerings/**", "server/research/master-offerings/request-projection.ts"],
    ["client/src/research/pages/partners/**", "client/src/research/pages/partners/analytics-request.tsx"],
    ["server/research/catalog/**", "server/research/catalog/request-hook.ts"],
  ])("conflicts with %s, which really can hold %s", (leasePath) => {
    const taskPath = leasePath.startsWith("client")
      ? "client/src/research/**request**"
      : "server/research/**request**";
    expect(overlaps(taskPath, leasePath), `${taskPath} vs ${leasePath}`).toBe(true);
    expect(overlaps(leasePath, taskPath), `${leasePath} vs ${taskPath}`).toBe(true);
  });

  it("is symmetric for every REQUEST-CENTER path against a same-tree lease", () => {
    for (const taskPath of REQUEST_CENTER) {
      const sameTree = `${taskPath.split("/**")[0]}/partners/**`;
      expect(overlaps(taskPath, sameTree)).toBe(overlaps(sameTree, taskPath));
    }
  });

  it("does NOT conflict across different trees, which the old truncation also got right", () => {
    expect(overlaps("server/research/**request**", "client/src/research/pages/**")).toBe(false);
    expect(overlaps("client/src/research/**request**", "server/research/partners/**")).toBe(false);
    expect(overlaps("shared/research/**request**", "e2e/**")).toBe(false);
  });

  it("still reports the obvious real conflict", () => {
    expect(overlaps("server/research/**request**", "server/research/product-requests.ts")).toBe(true);
  });
});

describe("globstar crosses directories; a plain star does not", () => {
  it("matches any depth under a globstar", () => {
    expect(overlaps("server/research/**", "server/research/partners/portal.ts")).toBe(true);
    expect(overlaps("server/**/*.ts", "server/research/partners/portal.ts")).toBe(true);
  });

  it("does not let a within-segment wildcard swallow a directory", () => {
    // `research-*` names a sibling directory, not everything beneath research.
    expect(overlaps("server/research-*/x.ts", "server/research/partners/x.ts")).toBe(false);
    expect(overlaps("server/*/x.ts", "server/research/partners/x.ts")).toBe(false);
  });

  it("treats a globstar segment as matching zero segments", () => {
    expect(overlaps("server/**/partners/**", "server/partners/portal.ts")).toBe(true);
  });
});

describe("directory leases still conflict with files beneath them", () => {
  it("an ancestor directory conflicts with a file under it, in both directions", () => {
    expect(overlaps("server/research/catalog", "server/research/catalog/price.ts")).toBe(true);
    expect(overlaps("server/research/catalog/price.ts", "server/research/catalog")).toBe(true);
  });

  it("a trailing globstar covers the directory itself", () => {
    expect(overlaps("server/research/partners/**", "server/research/partners")).toBe(true);
  });

  it("identical paths conflict", () => {
    expect(overlaps("shared/research/affiliate-system.ts", "shared/research/affiliate-system.ts")).toBe(true);
  });

  it("siblings do not conflict", () => {
    expect(overlaps("server/research/partners/**", "server/research/supplier/**")).toBe(false);
    expect(overlaps("shared/research/affiliate-system.ts", "shared/research/supplier/workspace.ts")).toBe(false);
  });
});

describe("real lease pairs from the board behave", () => {
  it("the supplier workspace does not collide with the fulfillment engine", () => {
    expect(overlaps("client/src/research/supplier/**", "server/research/fulfillment/**")).toBe(false);
    expect(overlaps("shared/research/supplier/**", "shared/research/fulfillment/**")).toBe(false);
  });

  it("the supplier workspace DOES collide with itself", () => {
    expect(overlaps("client/src/research/supplier/**", "client/src/research/supplier/api.ts")).toBe(true);
  });

  it("catalog action unification collides with the lead's master-offerings work", () => {
    expect(overlaps("server/research/master-offerings/**", "server/research/master-offerings/action.ts")).toBe(true);
  });
});

describe("segment intersection and splitting", () => {
  it("collapses runs of stars", () => {
    expect(segmentsIntersect("**request**", "product-requests.ts")).toBe(true);
    expect(segmentsIntersect("**request**", "pages")).toBe(false);
    expect(segmentsIntersect("*", "anything")).toBe(true);
    expect(segmentsIntersect("*", "")).toBe(true);
  });

  it("intersects two wildcard segments", () => {
    expect(segmentsIntersect("a*", "*b")).toBe(true);
    expect(segmentsIntersect("a*", "b*")).toBe(false);
  });

  it("tolerates Windows separators and trailing slashes", () => {
    expect(patternSegments("server\\research\\partners\\")).toEqual(["server", "research", "partners"]);
    expect(overlaps("server\\research\\partners\\**", "server/research/partners/portal.ts")).toBe(true);
  });
});
