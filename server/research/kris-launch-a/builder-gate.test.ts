import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BuilderArgsError, parseBuilderArgs } from "../../../scripts/research/builder-args";

/**
 * The negative control the builder gate never had.
 *
 * Adversarial review at the ROMAN_RELEASE_0_3 train tip found the artifact
 * builder's supervision could be skipped in two ways, and that NOTHING
 * executed the builder in CI, which is why both wiring defects survived
 * review: the untested layer is exactly where they sat. These tests pin the
 * two decisions that decide whether the gate runs at all.
 *
 * The builder itself is a top-level script (importing it runs it) and needs a
 * private intake file that is deliberately not in the repository, so the
 * decisions are tested at their own seam, plus a structural assertion over the
 * script's source for the one property no unit can observe from outside: that
 * the freshly built artifact passes the reader's refusal surface even when
 * there is no previous artifact to reconcile against.
 */

const BUILDER_SOURCE = fs.readFileSync(
  path.resolve("scripts/research/build-kris-launch-a.ts"),
  "utf8",
);

const DEFAULT_OUTPUT = "server/research/kris-launch-a/data/kris-launch-a-catalog.generated.json";

describe("builder arguments decide whether the gate runs", () => {
  it("takes the intake and defaults the output when nothing else is given", () => {
    expect(parseBuilderArgs(["intake.json"], DEFAULT_OUTPUT)).toEqual({
      intakePath: "intake.json",
      outputPath: DEFAULT_OUTPUT,
      allowPurchaseOpening: false,
    });
  });

  it("REGRESSION: an approval flag is a flag, never the output path", () => {
    // The defect: `argv[3] ?? DEFAULT_OUTPUT` made this invocation write to a
    // file literally named "--allow-purchase-opening", which never exists, so
    // the reconciliation gate was skipped entirely. The operator asking for
    // the most supervised build received the least supervised one.
    const parsed = parseBuilderArgs(["intake.json", "--allow-purchase-opening"], DEFAULT_OUTPUT);
    expect(parsed.outputPath).toBe(DEFAULT_OUTPUT);
    expect(parsed.allowPurchaseOpening).toBe(true);
    expect(parsed.outputPath).not.toBe("--allow-purchase-opening");
  });

  it("accepts an explicit output path alongside the flag, in either order", () => {
    const after = parseBuilderArgs(
      ["intake.json", "out.json", "--allow-purchase-opening"],
      DEFAULT_OUTPUT,
    );
    const before = parseBuilderArgs(
      ["intake.json", "--allow-purchase-opening", "out.json"],
      DEFAULT_OUTPUT,
    );
    expect(after).toEqual(before);
    expect(after.outputPath).toBe("out.json");
    expect(after.allowPurchaseOpening).toBe(true);
  });

  it("refuses an unknown flag rather than silently reading it as no approval", () => {
    // A misspelled approval flag must fail the command, not quietly become
    // "approval was never given" after the build has already decided.
    expect(() => parseBuilderArgs(["intake.json", "--allow-purchase-openings"], DEFAULT_OUTPUT))
      .toThrow(BuilderArgsError);
    expect(() => parseBuilderArgs(["intake.json", "--force"], DEFAULT_OUTPUT))
      .toThrow(BuilderArgsError);
  });

  it("refuses a missing intake and refuses surplus positionals", () => {
    expect(() => parseBuilderArgs([], DEFAULT_OUTPUT)).toThrow(BuilderArgsError);
    expect(() => parseBuilderArgs(["--allow-purchase-opening"], DEFAULT_OUTPUT))
      .toThrow(BuilderArgsError);
    expect(() => parseBuilderArgs(["a.json", "b.json", "c.json"], DEFAULT_OUTPUT))
      .toThrow(BuilderArgsError);
  });

  it("never lets a flag reach the output path, for every flag the builder knows", () => {
    for (const flag of ["--allow-purchase-opening"]) {
      const parsed = parseBuilderArgs(["intake.json", flag], DEFAULT_OUTPUT);
      expect(parsed.outputPath.startsWith("--")).toBe(false);
    }
  });
});

describe("the builder wires its arguments and scans the successor unconditionally", () => {
  it("uses the parser rather than raw argv indexing", () => {
    expect(BUILDER_SOURCE).toContain("parseBuilderArgs");
    // The two raw reads that caused the defect must be gone.
    expect(BUILDER_SOURCE).not.toMatch(/process\.argv\[3\]\s*\?\?/);
    expect(BUILDER_SOURCE).not.toMatch(/process\.argv\.includes\("--allow-purchase-opening"\)/);
  });

  it("REGRESSION: the successor passes the reader's refusal surface even with no previous artifact", () => {
    // The defect: `const successor = loadKrisDataset(artifact)` sat INSIDE
    // `if (fs.existsSync(resolvedOutput))`, so a first build (or any build
    // whose output path did not exist, including the flag-as-path case above)
    // wrote an artifact that the reader had never validated. The builder's own
    // comment claimed the opposite. The successor load must therefore be
    // reachable before the existsSync branch.
    const successorAt = BUILDER_SOURCE.indexOf("loadKrisDataset(artifact)");
    const branchAt = BUILDER_SOURCE.indexOf("if (fs.existsSync(resolvedOutput))");
    expect(successorAt).toBeGreaterThan(-1);
    expect(branchAt).toBeGreaterThan(-1);
    expect(successorAt).toBeLessThan(branchAt);
  });

  it("still refuses a purchase opening only with the explicit approval", () => {
    expect(BUILDER_SOURCE).toContain("opensNoPurchasePath");
    expect(BUILDER_SOURCE).toContain("allowPurchaseOpening");
    expect(BUILDER_SOURCE).toContain("--allow-purchase-opening only after explicit approval");
  });
});
