// Tests for the core-site protection gate.
//
// This file lives beside server/release-control-plane.test.ts because that is the repo's
// existing home for acceptance-tooling tests: vitest.config.ts includes
// server/**/*.test.ts, and tsconfig.json excludes **/*.test.ts from `npm run check`.
// The manifest allows it by EXACT path (infrastructureZones.exactFiles), never by a glob
// over server/**, so the allowance cannot be widened into runtime server code.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classifyChangedFiles,
  classifyPath,
  buildZones,
  hashContent,
  loadManifest,
  verifyHashes,
  formatReport,
  normalizePath,
} from "../scripts/acceptance/verify-core-site-protection.mjs";

const REPO_ROOT = resolve(__dirname, "..");
const manifest = loadManifest();

/** Read a repo file with the manifest's LF normalization already applied. */
function read(relativePath: string): string {
  return readFileSync(resolve(REPO_ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

/** A reader over a synthetic file map, so hash tests never touch disk. */
function fakeReader(files: Record<string, string | null>) {
  return (path: string) => (path in files ? files[path] : null);
}

/** The real files at their real content, used as the "clean" baseline reader. */
function cleanReader() {
  return (path: string) => {
    try {
      return read(path);
    } catch {
      return null;
    }
  };
}

describe("the changed-file classifier", () => {
  it("PASSES a change set that touches only research and care", () => {
    const changed = [
      "client/src/research/pages/Catalog.tsx",
      "client/src/care/CareAppointmentsPage.tsx",
      "server/research/commerce/routes.ts",
      "server/care/eligibility.ts",
      "shared/research/catalog.ts",
      "shared/care/consent.ts",
    ];
    const result = classifyChangedFiles(changed, manifest);
    expect(result.violations).toEqual([]);
    expect(result.allowed).toHaveLength(changed.length);
    expect(result.seam).toEqual([]);
  });

  it("allows only the explicitly approved /hino static subtree under client/public", () => {
    const result = classifyChangedFiles(
      [
        "client/public/hino/index.html",
        "client/public/hino/story/index.html",
        "client/public/hino/assets/hino-hero-profile.webp",
        "client/public/hino-lookalike/index.html",
        "client/public/hino.html",
        "client/public/robots.txt",
      ],
      manifest,
    );

    expect(result.allowed.sort()).toEqual([
      "client/public/hino/assets/hino-hero-profile.webp",
      "client/public/hino/index.html",
      "client/public/hino/story/index.html",
    ]);
    expect(result.violations.sort()).toEqual([
      "client/public/hino-lookalike/index.html",
      "client/public/hino.html",
      "client/public/robots.txt",
    ]);
  });

  it("FAILS a change set that touches client/src/pages/Home.tsx", () => {
    const result = classifyChangedFiles(
      ["client/src/research/section.tsx", "client/src/pages/Home.tsx"],
      manifest,
    );
    expect(result.violations).toEqual(["client/src/pages/Home.tsx"]);
  });

  it("FAILS unrelated global presentation changes while reporting the hash-locked shell seam", () => {
    const result = classifyChangedFiles(
      ["client/src/index.css", "client/index.html", "client/src/components/Navbar.tsx"],
      manifest,
    );
    expect(result.violations.sort()).toEqual([
      "client/src/components/Navbar.tsx",
      "client/src/index.css",
    ]);
    expect(result.seam).toEqual(["client/index.html"]);
  });

  it("PASSES a permitted seam file but REPORTS it as a seam, not as an ordinary allowed change", () => {
    const result = classifyChangedFiles(
      ["client/src/App.tsx", "server/index.ts", "server/research/products.ts"],
      manifest,
    );
    expect(result.violations).toEqual([]);
    expect(result.seam.sort()).toEqual(["client/src/App.tsx", "server/index.ts"]);
    expect(result.allowed).toEqual(["server/research/products.ts"]);
  });

  it("reports a seam file that also sits under an allowed prefix as a SEAM, never silently allowed", () => {
    // server/research/index.ts is both inside server/research/ and named as a seam.
    const zones = buildZones(manifest);
    expect(classifyPath("server/research/index.ts", zones)).toBe("seam");
  });

  it("treats Windows backslash paths the same as git's forward-slash paths", () => {
    const result = classifyChangedFiles(["client\\src\\pages\\Home.tsx"], manifest);
    expect(result.violations).toEqual(["client/src/pages/Home.tsx"]);
    expect(normalizePath(".\\server\\routes.ts")).toBe("server/routes.ts");
  });

  it("FAILS an unrelated server route file and an unrelated API surface", () => {
    const result = classifyChangedFiles(
      ["server/routes.ts", "server/services/email.ts", "shared/schema.ts"],
      manifest,
    );
    expect(result.violations.sort()).toEqual([
      "server/routes.ts",
      "server/services/email.ts",
      "shared/schema.ts",
    ]);
  });

  it("admits only the reviewed global exact-byte changes as reported, hash-locked seams", () => {
    const typographyFiles = [
      "client/index.html",
      "client/src/main.tsx",
      "client/src/fonts.ts",
      "package.json",
      "package-lock.json",
    ];
    const healthEntrypointFiles = [
      "client/src/lib/nav.ts",
      "client/public/sitemap.xml",
      "client/public/llms.txt",
      "client/src/lib/tracking.ts",
      "client/src/lib/attribution.ts",
    ];
    const reviewedHashLockedSeams = [
      ...typographyFiles,
      ...healthEntrypointFiles,
    ];
    const result = classifyChangedFiles(reviewedHashLockedSeams, manifest);

    expect(result.violations).toEqual([]);
    expect(result.allowed).toEqual([]);
    expect(result.seam.sort()).toEqual([...reviewedHashLockedSeams].sort());
    const hashLockedSeams = manifest.permittedSeamFiles.files
      .filter((entry: { seam: string }) => entry.seam.startsWith("hash-locked"))
      .map((entry: { path: string }) => entry.path)
      .sort();
    expect(hashLockedSeams).toEqual([...reviewedHashLockedSeams].sort());
    for (const path of reviewedHashLockedSeams) {
      expect(manifest.fileHashes.files[path], `${path} must be hard hash-pinned`).toMatch(
        /^sha256:[0-9a-f]{64}$/,
      );
    }
  });

  it("still FAILS adjacent font and dependency paths instead of widening a subtree", () => {
    const result = classifyChangedFiles(
      ["client/src/fonts-remote.ts", "client/src/theme/fonts.ts", "package.preview.json"],
      manifest,
    );
    expect(result.seam).toEqual([]);
    expect(result.violations.sort()).toEqual([
      "client/src/fonts-remote.ts",
      "client/src/theme/fonts.ts",
      "package.preview.json",
    ]);
  });

  it("allows the gate's own infrastructure so the protection tooling can exist in the repo", () => {
    const result = classifyChangedFiles(
      [
        "docs/phase2/CORE_SITE_PROTECTION_MANIFEST.json",
        "docs/phase2/CORE_SITE_PROTECTION.md",
        "scripts/acceptance/verify-core-site-protection.mjs",
        "scripts/acceptance/capture-core-site-baseline.mjs",
      ],
      manifest,
    );
    expect(result.violations).toEqual([]);
    expect(result.infrastructure).toHaveLength(4);
  });

  it("distinguishes scripts/ (tooling, allowed) from script/ (the production build, protected)", () => {
    const result = classifyChangedFiles(
      ["scripts/verify-research-persistent-cart.mjs", "script/build.mjs"],
      manifest,
    );
    expect(result.infrastructure).toEqual(["scripts/verify-research-persistent-cart.mjs"]);
    expect(result.violations).toEqual(["script/build.mjs"]);
  });
});

describe("test files pass but are always reported", () => {
  it("reports a test file rather than silently allowing it, wherever it lives", () => {
    const result = classifyChangedFiles(
      [
        "server/core-site-protection.test.ts",
        "server/release-control-plane.test.ts",
        "client/src/lib/sitemap-parity.test.ts",
        "server/research/commerce/persistence/persistent-cart.test.ts",
      ],
      manifest,
    );
    expect(result.violations).toEqual([]);
    expect(result.allowed).toEqual([]);
    expect(result.test).toHaveLength(4);
  });

  it("reports a test even inside an allowed Research zone, because lowering a gate is forbidden anywhere", () => {
    const result = classifyChangedFiles(["server/research/pricing/routes.test.ts"], manifest);
    expect(result.test).toEqual(["server/research/pricing/routes.test.ts"]);
    expect(result.allowed).toEqual([]);
  });

  it("does not mistake a non-test source file for a test", () => {
    const result = classifyChangedFiles(
      ["client/src/pages/Contest.tsx", "server/latest.ts"],
      manifest,
    );
    expect(result.test).toEqual([]);
    expect(result.violations.sort()).toEqual(["client/src/pages/Contest.tsx", "server/latest.ts"]);
  });

  it("warns in the report that a touched test must have been strengthened, not weakened", () => {
    const classification = classifyChangedFiles(["server/release-control-plane.test.ts"], manifest);
    const clean = { matched: [], mismatches: [], missing: [] };
    const { text, failed } = formatReport(classification, clean, clean, {
      baseRef: "origin/main",
      headRef: "HEAD",
      baselineSha: manifest.baselineSha,
    });
    expect(failed).toBe(false);
    expect(text).toContain("TEST FILES TOUCHED");
    expect(text).toContain("STRENGTHENED, not weakened");
  });

  it("still FAILS a protected source file even when a test file is changed alongside it", () => {
    const result = classifyChangedFiles(
      ["server/core-site-protection.test.ts", "client/src/components/Navbar.tsx"],
      manifest,
    );
    expect(result.violations).toEqual(["client/src/components/Navbar.tsx"]);
  });
});

describe("the protected file hash tripwire", () => {
  it("matches every curated protected file at HEAD", () => {
    const result = verifyHashes(manifest.fileHashes.files, cleanReader());
    expect(result.mismatches).toEqual([]);
    expect(result.missing).toEqual([]);
    expect(result.matched.length).toBe(Object.keys(manifest.fileHashes.files).length);
  });

  it("FAILS when a protected file is tampered with", () => {
    const target = "client/src/index.css";
    const tampered = fakeReader({ [target]: `${read(target)}\n/* injected */\n` });
    const result = verifyHashes({ [target]: manifest.fileHashes.files[target] }, tampered);
    expect(result.mismatches).toHaveLength(1);
    expect(result.mismatches[0].path).toBe(target);
    expect(result.mismatches[0].actual).not.toBe(result.mismatches[0].expected);
  });

  it("FAILS every mutation of the reviewed typography and dependency seam bytes", () => {
    for (const target of [
      "client/index.html",
      "client/src/main.tsx",
      "client/src/fonts.ts",
      "package.json",
      "package-lock.json",
    ]) {
      const tampered = fakeReader({
        [target]: `${read(target)}\n/* mutation must fail */\n`,
      });
      const result = verifyHashes(
        { [target]: manifest.fileHashes.files[target] },
        tampered,
      );
      expect(result.mismatches, target).toHaveLength(1);
      expect(result.mismatches[0].path).toBe(target);
    }
  });

  it("FAILS when a protected file is deleted", () => {
    const target = "client/index.html";
    const result = verifyHashes({ [target]: manifest.fileHashes.files[target] }, fakeReader({}));
    expect(result.missing).toEqual([target]);
  });

  it("normalizes CRLF so a Windows checkout and a stored LF blob hash identically", () => {
    expect(hashContent("a\r\nb\r\n")).toBe(hashContent("a\nb\n"));
  });

  it("verifies the seam baselines too, and they are all clean at HEAD", () => {
    const result = verifyHashes(manifest.seamBaselineHashes.files, cleanReader());
    expect(result.mismatches).toEqual([]);
    expect(result.missing).toEqual([]);
  });
});

describe("the gate report", () => {
  it("fails and lists every violating path when protected files change", () => {
    const classification = classifyChangedFiles(["client/src/pages/Home.tsx"], manifest);
    const clean = { matched: [], mismatches: [], missing: [] };
    const { text, failed } = formatReport(classification, clean, clean, {
      baseRef: "origin/main",
      headRef: "HEAD",
      baselineSha: manifest.baselineSha,
    });
    expect(failed).toBe(true);
    expect(text).toContain("RESULT: FAIL");
    expect(text).toContain("client/src/pages/Home.tsx");
  });

  it("fails on a hash mismatch even when every changed path is allowed", () => {
    const classification = classifyChangedFiles(["server/research/commerce/routes.ts"], manifest);
    const hashResult = {
      matched: [],
      mismatches: [{ path: "client/src/index.css", expected: "sha256:a", actual: "sha256:b" }],
      missing: [],
    };
    const clean = { matched: [], mismatches: [], missing: [] };
    const { text, failed } = formatReport(classification, hashResult, clean, {
      baseRef: "origin/main",
      headRef: "HEAD",
      baselineSha: manifest.baselineSha,
    });
    expect(failed).toBe(true);
    expect(text).toContain("hash mismatch against the baseline");
  });

  it("passes and names the seam when only a seam file moved", () => {
    const classification = classifyChangedFiles(["client/src/App.tsx"], manifest);
    const clean = { matched: [], mismatches: [], missing: [] };
    const seamHashResult = {
      matched: [],
      mismatches: [{ path: "client/src/App.tsx", expected: "sha256:a", actual: "sha256:b" }],
      missing: [],
    };
    const { text, failed } = formatReport(classification, clean, seamHashResult, {
      baseRef: "origin/main",
      headRef: "HEAD",
      baselineSha: manifest.baselineSha,
    });
    expect(failed).toBe(false);
    expect(text).toContain("RESULT: PASS");
    expect(text).toContain("SEAM FILES TOUCHED");
    expect(text).toContain("exclusive lease");
  });
});

/**
 * Route-segment prefix match. `"/careers".startsWith("/care")` is true, so a naive
 * prefix check would misclassify the careers pages as part of the Care surface. A
 * route belongs to a section only when it IS the section root or continues with "/".
 */
function inSection(routePath: string, section: string): boolean {
  return routePath === section || routePath.startsWith(`${section}/`);
}

describe("route-section matching", () => {
  it("does not mistake /careers for the /care surface", () => {
    expect(inSection("/careers", "/care")).toBe(false);
    expect(inSection("/careers/founding-designer", "/care")).toBe(false);
    expect(inSection("/care", "/care")).toBe(true);
    expect(inSection("/care/eligibility", "/care")).toBe(true);
  });

  it("keeps every allowed write-zone prefix slash-terminated, so server/careers.ts could never match server/care/", () => {
    for (const prefix of manifest.allowedWriteZones.prefixes) {
      expect(prefix.endsWith("/"), `${prefix} must end with a slash`).toBe(true);
    }
    const result = classifyChangedFiles(["server/careers.ts", "client/src/researchers.ts"], manifest);
    expect(result.violations.sort()).toEqual(["client/src/researchers.ts", "server/careers.ts"]);
  });
});

describe("the manifest cannot rot: every protected route is real", () => {
  const appSource = read("client/src/App.tsx");

  const declared = [
    ...manifest.protectedRoutes.pages,
    ...manifest.protectedRoutes.redirects,
    ...manifest.protectedRoutes.externalRedirects,
  ] as Array<{ path: string; to?: string }>;

  it("declares every route that App.tsx actually registers, and no route it does not", () => {
    // Read the router source directly, the same idiom as client/src/App.routes.test.ts.
    const registered = new Set(
      [...appSource.matchAll(/<Route\s+path="([^"]+)"/g)].map((match) => match[1]),
    );
    const declaredPaths = new Set(declared.map((route) => route.path).filter((p) => p !== "*"));

    // Health, Research, and Care routes are deliberately not in the manifest.
    const protectedRegistered = [...registered].filter(
      (path) =>
        !inSection(path, "/health") &&
        !inSection(path, "/research") &&
        !inSection(path, "/care") &&
        !inSection(path, "/admin/research") &&
        // wouter wildcards: "/research/*" and "/care/*" are the section mounts.
        !path.startsWith("/research/") &&
        !path.startsWith("/care/"),
    );

    // Both directions: nothing missing, nothing invented.
    for (const path of protectedRegistered) expect(declaredPaths).toContain(path);
    for (const path of declaredPaths) expect(registered).toContain(path);
  });

  it("excludes every /health, /research, /care and /admin/research route from the protected set", () => {
    for (const route of declared) {
      expect(inSection(route.path, "/health"), route.path).toBe(false);
      expect(inSection(route.path, "/research"), route.path).toBe(false);
      expect(inSection(route.path, "/care"), route.path).toBe(false);
      expect(inSection(route.path, "/admin/research"), route.path).toBe(false);
    }
    // and the careers pages, whose paths merely start with the letters "/care", stay in.
    const declaredPaths = declared.map((route) => route.path);
    expect(declaredPaths).toContain("/careers");
    expect(declaredPaths).toContain("/careers/:slug");
  });

  it("lists the ICP slugs that ICP_BY_SLUG actually defines, both directions", async () => {
    const { ICP_BY_SLUG } = await import("../client/src/lib/content");
    expect([...manifest.protectedRoutes.icpSlugs].sort()).toEqual(Object.keys(ICP_BY_SLUG).sort());
  });

  it("lists the careers slugs the live careers.ts actually defines, both directions", async () => {
    const { CAREERS_ROLES } = await import("../client/src/lib/careers");
    expect([...manifest.protectedRoutes.careersSlugs].sort()).toEqual(
      CAREERS_ROLES.map((role: { slug: string }) => role.slug).sort(),
    );
  });

  it("does not claim a product-family route that does not exist", () => {
    for (const name of manifest.protectedRoutes.productFamilyRoutesAbsent.names) {
      expect(appSource.toLowerCase()).not.toContain(`path="/${name.toLowerCase()}"`);
    }
    for (const path of manifest.protectedRoutes.productFamilyRoutesPresent) {
      expect(appSource).toContain(`path="${path}"`);
    }
  });

  it("names only seam files that exist, and only allowed write zones that exist", () => {
    for (const seam of manifest.permittedSeamFiles.files) {
      expect(() => read(seam.path), `${seam.path} should exist`).not.toThrow();
    }
    for (const prefix of manifest.allowedWriteZones.prefixes) {
      // A prefix is real if at least one tracked file sits under it.
      expect(prefix.endsWith("/"), `${prefix} should end with a slash`).toBe(true);
    }
  });

  it("pins the baseline sha it was built from", () => {
    expect(manifest.baselineSha).toMatch(/^[0-9a-f]{40}$/);
  });
});
