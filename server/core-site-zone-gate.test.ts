// Tests for the core-site ZONE gate runner
// (scripts/acceptance/verify-changed-file-zones.mjs).
//
// WHERE THIS FILE LIVES AND WHY
// It sits beside server/core-site-protection.test.ts because vitest.config.ts includes
// only server/**/*.test.ts, shared/**/*.test.ts and client/src/**/*.test.{ts,tsx}. A test
// placed under scripts/ would never be collected by `npx vitest run`, which is the exact
// CI job this gate has to be enforced by, so scripts/ would have reproduced the original
// bug in a new place. tsconfig.json excludes **/*.test.ts from `npm run check`.
//
// The manifest admits this file the same way it admits every other test: by
// reportedZones.testFileSuffixes, which classifies any *.test.ts as "test" (passes, but is
// always REPORTED so review confirms it was strengthened rather than weakened). It is NOT
// admitted by infrastructureZones.exactFiles, which is an empty list at this baseline. The
// header comment on server/core-site-protection.test.ts claims the exactFiles route; that
// claim is stale, and it is reported as a finding rather than fixed here, because editing
// the manifest is a founder decision.
//
// WHAT IS ALREADY COVERED ELSEWHERE, SO THIS FILE DOES NOT REPEAT IT
// server/core-site-protection.test.ts already proves classifyChangedFiles sorts paths
// correctly and proves the content-hash tripwire. This file proves the thing that was
// missing: that a RUNNABLE gate turns that classification into a non-zero EXIT CODE, so a
// CI job can fail a pull request on it.
//
// ANTI-VACUITY: how these assertions were verified to be load-bearing.
// A test that only asserts "About.tsx is a violation" would pass even if the runner
// ignored violations entirely, because the classifier is a separate module. So every
// permissive-failure test here asserts on runZoneGate's exitCode and ok, which are
// derived from classification.violations and from nothing else.
// The proof was run, not assumed. Three separate permissive mutations were applied to
// scripts/acceptance/verify-changed-file-zones.mjs, the suite was run against each, and
// each one produced FAILING tests; the file was then restored and the suite returned to
// green. The mutations and their observed failures are recorded in the
// "anti-vacuity" describe block below, one comment per mutation.

import { describe, expect, it } from "vitest";
import {
  EXIT_PASS,
  EXIT_SETUP_ERROR,
  EXIT_VIOLATION,
  collectChangedFiles,
  dedupe,
  describeSource,
  formatZoneReport,
  main,
  parseArgs,
  parseFileList,
  runZoneGate,
} from "../scripts/acceptance/verify-changed-file-zones.mjs";
import {
  classifyChangedFiles,
  loadManifest,
} from "../scripts/acceptance/verify-core-site-protection.mjs";

const manifest = loadManifest();

/** Capture what main() writes, so exit-code tests never touch the real process. */
function captureMain(argv: string[], extra: Record<string, unknown> = {}) {
  let stdout = "";
  let stderr = "";
  const code = main(argv, {
    stdout: (text: string) => {
      stdout += text;
    },
    stderr: (text: string) => {
      stderr += text;
    },
    ...extra,
  });
  return { code, stdout, stderr };
}

describe("the zone gate fails a changed-file set that touches a protected glob", () => {
  // This is the PR #182 shape: protected PAGE files edited, none of them one of the 21
  // hash-pinned files, so the existing hash tripwire stays silent and every other CI job
  // is green. The zone gate is the only thing that catches it.
  it("returns a NON-EMPTY violations list and exit 1 for client/src/pages/About.tsx", () => {
    const result = runZoneGate({
      changedFiles: ["client/src/pages/About.tsx"],
      manifest,
    });

    expect(result.classification.violations).toEqual(["client/src/pages/About.tsx"]);
    expect(result.classification.violations.length).toBeGreaterThan(0);
    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
    expect(result.exitCode).not.toBe(EXIT_PASS);
    expect(result.text).toContain("RESULT: FAIL");
    expect(result.text).toContain("client/src/pages/About.tsx");
  });

  it("catches the PR #182 shape: several protected pages, none of them hash-pinned", () => {
    const changed = [
      "client/src/pages/About.tsx",
      "client/src/pages/Contact.tsx",
      "client/src/pages/Careers.tsx",
      "client/src/pages/Technology.tsx",
    ];
    // Every one of these is outside the manifest's hash-pinned file list, which is what
    // let this shape reach "green except the hash assertion" in the first place.
    const pinned = new Set(Object.keys(manifest.fileHashes.files ?? {}));
    for (const path of changed) expect(pinned.has(path)).toBe(false);

    const result = runZoneGate({ changedFiles: changed, manifest });
    expect(result.classification.violations).toEqual(changed);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("catches the PR #179 shape: a NEW file added under client/src/components/**", () => {
    // A brand-new file can never be hash-pinned, so the hash tripwire structurally cannot
    // see it. Only zone classification can.
    const result = runZoneGate({
      changedFiles: ["client/src/components/ResearchUpsellBanner.tsx"],
      manifest,
    });
    expect(result.classification.violations).toEqual([
      "client/src/components/ResearchUpsellBanner.tsx",
    ]);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("fails the whole set when one protected path hides among many allowed ones", () => {
    const result = runZoneGate({
      changedFiles: [
        "client/src/research/pages/Catalog.tsx",
        "server/research/commerce/routes.ts",
        "shared/care/consent.ts",
        "client/src/pages/About.tsx",
        "docs/phase2/NOTES.md",
      ],
      manifest,
    });
    expect(result.classification.violations).toEqual(["client/src/pages/About.tsx"]);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("holds the singular/plural trap: script/ (the production build) is a violation", () => {
    const result = runZoneGate({ changedFiles: ["script/build.mjs"], manifest });
    expect(result.classification.violations).toEqual(["script/build.mjs"]);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });
});

describe("the zone gate passes a changed-file set entirely inside allowed zones", () => {
  it("returns an EMPTY violations list and exit 0", () => {
    const changed = [
      "client/src/research/pages/Catalog.tsx",
      "client/src/care/CareAppointmentsPage.tsx",
      "server/research/commerce/routes.ts",
      "server/care/eligibility.ts",
      "shared/research/catalog.ts",
      "shared/care/consent.ts",
      "content/research-goals/recovery.md",
      "supabase/migrations/0007_research.sql",
    ];
    const result = runZoneGate({ changedFiles: changed, manifest });

    expect(result.classification.violations).toEqual([]);
    expect(result.classification.allowed).toEqual(changed);
    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(EXIT_PASS);
    expect(result.text).toContain("RESULT: PASS");
  });

  it("passes tooling under scripts/ (plural) as infrastructure, including this gate itself", () => {
    const result = runZoneGate({
      changedFiles: [
        "scripts/acceptance/verify-changed-file-zones.mjs",
        "scripts/acceptance/verify-core-site-protection.mjs",
        "docs/phase2/CORE_SITE_PROTECTION.md",
      ],
      manifest,
    });
    expect(result.classification.violations).toEqual([]);
    expect(result.classification.infrastructure).toHaveLength(3);
    expect(result.exitCode).toBe(EXIT_PASS);
  });

  it("passes but REPORTS a touched test file rather than allowing it silently", () => {
    const result = runZoneGate({
      changedFiles: ["server/core-site-zone-gate.test.ts"],
      manifest,
    });
    expect(result.classification.violations).toEqual([]);
    expect(result.classification.test).toEqual(["server/core-site-zone-gate.test.ts"]);
    expect(result.exitCode).toBe(EXIT_PASS);
    expect(result.text).toContain("STRENGTHENED, not weakened");
  });

  it("passes but REPORTS a touched seam file, so review knows a lease is required", () => {
    const seamPath = (manifest.permittedSeamFiles.files ?? [])[0]?.path as string;
    expect(typeof seamPath).toBe("string");
    const result = runZoneGate({ changedFiles: [seamPath], manifest });
    expect(result.classification.violations).toEqual([]);
    expect(result.classification.seam).toEqual([seamPath]);
    expect(result.exitCode).toBe(EXIT_PASS);
    expect(result.text).toContain("exclusive lease");
  });
});

describe("anti-vacuity: the exit code is load-bearing, not decorative", () => {
  // MUTATION 1 (applied and run, then reverted).
  //   In runZoneGate, replace   exitCode: failed ? EXIT_VIOLATION : EXIT_PASS
  //   with                      exitCode: EXIT_PASS
  // Observed: this describe block's "a permissive runner cannot pass these tests" case
  // and every "exit 1" assertion above failed with
  //   AssertionError: expected +0 to be 1 // Object.is equality
  //
  // MUTATION 2 (applied and run, then reverted).
  //   In formatZoneReport, replace   const failed = classification.violations.length > 0
  //   with                           const failed = false
  // Observed: the same exit-code assertions failed, plus
  //   expected '...RESULT: PASS' to contain 'RESULT: FAIL'
  //
  // MUTATION 3 (applied and run, then reverted).
  //   In runZoneGate, drop violations before reporting:
  //     classification.violations = []
  // Observed: expected [] to deeply equal [ 'client/src/pages/About.tsx' ], and the
  // exit-code assertions failed too.
  //
  // Each mutation left the imported classifier completely untouched, which is the point:
  // these assertions bind the RUNNER, not the already-tested classification.

  it("a permissive runner cannot pass these tests: violations always force a non-zero exit", () => {
    const violating = runZoneGate({ changedFiles: ["client/src/pages/About.tsx"], manifest });
    const clean = runZoneGate({ changedFiles: ["client/src/research/x.ts"], manifest });

    // The two must DIFFER. A runner hard-wired to 0 (or to 1) collapses this.
    expect(violating.exitCode).not.toBe(clean.exitCode);
    expect(violating.exitCode).toBe(EXIT_VIOLATION);
    expect(clean.exitCode).toBe(EXIT_PASS);
  });

  it("the verdict tracks the classifier exactly, path for path, over a mixed corpus", () => {
    // If the runner ever filtered, sampled, or truncated the violation list, this fails.
    const corpus = [
      "client/src/pages/About.tsx",
      "client/src/pages/Home.tsx",
      "client/src/components/Nav.tsx",
      "client/src/hooks/use-cart.ts",
      "client/src/lib/api.ts",
      "server/routes.ts",
      "server/services/email.ts",
      "shared/schema.ts",
      "vite.config.ts",
      "package.json",
      "script/build.mjs",
      "client/index.html",
      "client/src/research/ok.ts",
      "docs/note.md",
      "scripts/tool.mjs",
      "server/x.test.ts",
    ];
    const expected = classifyChangedFiles(corpus, manifest);
    const result = runZoneGate({ changedFiles: corpus, manifest });

    expect(result.classification).toEqual(expected);
    expect(result.classification.violations.length).toBeGreaterThan(0);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("main() propagates the non-zero exit code all the way to the process", () => {
    // Binds the actual CI contract: `node verify-changed-file-zones.mjs <path>` must exit
    // non-zero. A runner that printed FAIL and returned 0 would pass every test above that
    // only inspected runZoneGate, so this asserts the outermost boundary too.
    const failing = captureMain(["client/src/pages/About.tsx"]);
    expect(failing.code).toBe(EXIT_VIOLATION);
    expect(failing.stdout).toContain("RESULT: FAIL");

    const passing = captureMain(["client/src/research/pages/Catalog.tsx"]);
    expect(passing.code).toBe(EXIT_PASS);
    expect(passing.stdout).toContain("RESULT: PASS");
  });

  it("an empty changed-file set is a SETUP ERROR, never a silent pass", () => {
    // The vacuous-CI failure mode: a misconfigured diff step yields no paths and the gate
    // "passes" while classifying nothing. Exit 2 makes that loud.
    const result = runZoneGate({ changedFiles: [], manifest });
    expect(result.exitCode).toBe(EXIT_SETUP_ERROR);
    expect(result.ok).toBe(false);
    expect(result.text).toContain("SETUP ERROR");

    const opted = runZoneGate({ changedFiles: [], manifest, allowEmpty: true });
    expect(opted.exitCode).toBe(EXIT_PASS);
  });
});

describe("the runner is drivable from a real CI diff step", () => {
  it("accepts paths as positional arguments", () => {
    const options = parseArgs(["client/src/pages/About.tsx", "docs/x.md"]);
    expect(options.files).toEqual(["client/src/pages/About.tsx", "docs/x.md"]);
    expect(collectChangedFiles(options)).toEqual([
      "client/src/pages/About.tsx",
      "docs/x.md",
    ]);
  });

  it("accepts --files-from a file written by `git diff --name-only`", () => {
    const options = parseArgs(["--files-from", "changed.txt"]);
    const files = collectChangedFiles(options, {
      readFile: () => "client/src/pages/About.tsx\nclient/src/research/ok.ts\n\n",
    });
    expect(files).toEqual(["client/src/pages/About.tsx", "client/src/research/ok.ts"]);

    const result = runZoneGate({ changedFiles: files, manifest });
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("accepts --files-from - so the diff can be piped straight in", () => {
    const options = parseArgs(["--files-from", "-"]);
    const files = collectChangedFiles(options, {
      readStdin: () => "server/routes.ts\n",
    });
    expect(files).toEqual(["server/routes.ts"]);
    expect(captureMain(["--files-from", "-"], { readStdin: () => "server/routes.ts\n" }).code).toBe(
      EXIT_VIOLATION,
    );
  });

  it("accepts --base/--head and asks the existing gate for the range", () => {
    const options = parseArgs(["--base", "origin/main", "--head", "HEAD"]);
    const seen: string[][] = [];
    const files = collectChangedFiles(options, {
      gitRange: (base: string, head: string) => {
        seen.push([base, head]);
        return ["client/src/pages/About.tsx"];
      },
    });
    expect(seen).toEqual([["origin/main", "HEAD"]]);
    expect(files).toEqual(["client/src/pages/About.tsx"]);
  });

  it("normalizes Windows backslash paths and drops duplicates and comment lines", () => {
    expect(dedupe(["client\\src\\pages\\About.tsx", "client/src/pages/About.tsx"])).toEqual([
      "client/src/pages/About.tsx",
    ]);
    expect(parseFileList("a.ts\n# a comment\n\n  b.ts  \n")).toEqual(["a.ts", "b.ts"]);
  });

  it("rejects an unknown flag with exit 2 instead of silently classifying nothing", () => {
    // A typo like --file-from (singular) must not degrade into an empty, passing run.
    const result = captureMain(["--file-from", "changed.txt"]);
    expect(result.code).toBe(EXIT_SETUP_ERROR);
    expect(result.stderr).toContain("unknown option");
  });

  it("rejects a flag that is missing its value", () => {
    expect(() => parseArgs(["--files-from"])).toThrow(/needs a value/);
    expect(captureMain(["--base"]).code).toBe(EXIT_SETUP_ERROR);
  });

  it("names the source of the changed-file set in the report, for auditability", () => {
    expect(describeSource(parseArgs(["--files-from", "-"]))).toBe("stdin");
    expect(describeSource(parseArgs(["--base", "origin/main"]))).toBe("origin/main...HEAD");
    const { text } = formatZoneReport(
      classifyChangedFiles(["docs/x.md"], manifest),
      { source: "stdin", baselineSha: "abc123" },
    );
    expect(text).toContain("changed-file set  : stdin");
    expect(text).toContain("abc123");
  });

  it("--help exits 0 and prints the CI-facing usage", () => {
    const result = captureMain(["--help"]);
    expect(result.code).toBe(EXIT_PASS);
    expect(result.stdout).toContain("--files-from");
  });
});

describe("the zone gate reuses the existing classifier rather than reimplementing it", () => {
  it("agrees with classifyChangedFiles on every zone, for a path drawn from each", () => {
    // If this runner ever grew its own copy of the zone rules, the two would drift and
    // this test is what catches it.
    const sample = [
      "client/src/pages/About.tsx",
      "client/src/research/ok.ts",
      "docs/x.md",
      "scripts/tool.mjs",
      "server/x.test.ts",
      (manifest.permittedSeamFiles.files ?? [])[0]?.path as string,
    ];
    expect(runZoneGate({ changedFiles: sample, manifest }).classification).toEqual(
      classifyChangedFiles(sample, manifest),
    );
  });
});

describe("the .github zone contradiction is real and is reported, not papered over", () => {
  it("classifies .github/workflows/** as a VIOLATION at this baseline", () => {
    // .github/** matches no allowedWriteZone, no infrastructureZone prefix ("docs/",
    // "scripts/"), no exactFile and no seam, so classifyPath's default applies.
    //
    // This is a genuine contradiction, recorded here as an executable statement of it:
    // the pull request that INSTALLS this gate must add
    // .github/workflows/core-site-zone-gate.yml, and this gate classifies that file as a
    // violation of itself. Resolving it by adding ".github/" to infrastructureZones would
    // widen the protection manifest, which is a FOUNDER decision, not an agent's. So the
    // manifest is left untouched and the contradiction is surfaced for a decision.
    //
    // The test asserts the CURRENT behaviour. If the founder later adds ".github/" to
    // infrastructureZones.prefixes, this test fails loudly and points at the decision,
    // which is the correct way for a deliberate policy change to land.
    const result = runZoneGate({
      changedFiles: [".github/workflows/core-site-zone-gate.yml"],
      manifest,
    });
    expect(result.classification.violations).toEqual([
      ".github/workflows/core-site-zone-gate.yml",
    ]);
    expect(result.classification.infrastructure).toEqual([]);
    expect(result.exitCode).toBe(EXIT_VIOLATION);
  });

  it("confirms .github/ is absent from every zone list in the manifest", () => {
    const zoneLists = [
      ...(manifest.allowedWriteZones.prefixes ?? []),
      ...(manifest.allowedWriteZones.exactFiles ?? []),
      ...(manifest.infrastructureZones.prefixes ?? []),
      ...(manifest.infrastructureZones.exactFiles ?? []),
      ...(manifest.permittedSeamFiles.files ?? []).map((f: { path: string }) => f.path),
    ];
    expect(zoneLists.some((entry: string) => entry.startsWith(".github"))).toBe(false);
  });

  it("records that infrastructureZones.exactFiles is EMPTY at this baseline", () => {
    // server/core-site-protection.test.ts's header comment claims the manifest admits it
    // "by EXACT path (infrastructureZones.exactFiles)". That is stale: the list is empty
    // and test files are admitted by reportedZones.testFileSuffixes instead. Reported as a
    // finding; the manifest is not edited to make the comment true.
    expect(manifest.infrastructureZones.exactFiles).toEqual([]);
    expect(manifest.reportedZones.testFileSuffixes).toContain(".test.ts");
  });
});
