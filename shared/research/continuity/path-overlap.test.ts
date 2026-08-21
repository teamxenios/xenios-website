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

describe("the regression that hid P1 work from nine sessions", () => {
  // The four leases xenios-os falsely reported as conflicting with
  // REQUEST-CENTER. None of them contains a path that could hold a
  // `**request**` file.
  const REQUEST_CENTER = [
    "client/src/research/**request**",
    "server/research/**request**",
    "shared/research/**request**",
  ];

  it.each([
    ["server/research/account-identity/**", "claude-opus5-main"],
    ["client/src/research/pages/partners/**", "claude-fable-desktop"],
    ["server/research/partners/**", "claude-fable-desktop"],
    ["shared/research/affiliate-system.ts", "claude-fable-desktop"],
    ["server/research/master-offerings/**", "claude-fable-s7"],
    ["server/research/catalog/**", "claude-fable-s7"],
    ["client/src/research/demo/**", "claude-fable-s9-conversion-qa"],
    ["e2e/**", "claude-fable-s9-conversion-qa"],
  ])("REQUEST-CENTER does not conflict with %s (held by %s)", (leasePath) => {
    for (const taskPath of REQUEST_CENTER) {
      expect(overlaps(taskPath, leasePath), `${taskPath} vs ${leasePath}`).toBe(false);
      expect(overlaps(leasePath, taskPath), `${leasePath} vs ${taskPath}`).toBe(false);
    }
  });

  it("still reports a REAL request conflict, so the fix does not open a hole", () => {
    // A file whose name genuinely contains "request", directly under the
    // pattern's directory, IS inside REQUEST-CENTER's claim.
    expect(overlaps("server/research/**request**", "server/research/product-requests.ts")).toBe(true);
    expect(overlaps("client/src/research/**request**", "client/src/research/RequestPanel.tsx")).toBe(false);
    expect(overlaps("client/src/research/**request**", "client/src/research/product-request.tsx")).toBe(true);
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
