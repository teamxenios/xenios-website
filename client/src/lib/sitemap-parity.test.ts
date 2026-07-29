// Static parity test: client/public/sitemap.xml and client/public/robots.txt
// are hand-maintained, so they drift from the actual routes over time. This
// pins the sitemap against the two real slug sources so any future addition,
// removal, or rename of an ICP or a careers role fails the build the moment
// sitemap.xml is not updated to match.
//
// Note: xenios has two unrelated "CAREERS_ROLES" exports. Only lib/careers.ts
// is imported by pages/Careers.tsx (the live /careers and /careers/:slug
// routes); lib/content.ts's CAREERS_ROLES is not imported by any route and is
// not the source of truth for public URLs. This test intentionally checks
// against the live one.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { ICP_BY_SLUG } from "./content";
import { CAREERS_ROLES } from "./careers";

const here = resolve(__dirname);
// Normalize line endings: this repo checks out CRLF on Windows
// (core.autocrlf), and the parsing below assumes bare \n.
const sitemap = readFileSync(resolve(here, "..", "..", "public", "sitemap.xml"), "utf8").replace(/\r\n/g, "\n");
const robots = readFileSync(resolve(here, "..", "..", "public", "robots.txt"), "utf8").replace(/\r\n/g, "\n");

const SITE = "https://xeniostechnology.com";

function sitemapPaths(): string[] {
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  return locs.map((loc) => {
    expect(loc.startsWith(SITE)).toBe(true);
    return loc.slice(SITE.length) || "/";
  });
}

describe("sitemap.xml matches the live route data", () => {
  it("lists exactly the /for/:slug ICP pages that exist in ICP_BY_SLUG (both directions)", () => {
    const paths = sitemapPaths();
    const sitemapForSlugs = paths
      .filter((p) => p.startsWith("/for/"))
      .map((p) => p.slice("/for/".length))
      .sort();
    const icpSlugs = Object.keys(ICP_BY_SLUG).sort();

    expect(sitemapForSlugs).toEqual(icpSlugs);
  });

  it("lists exactly the /careers/:slug roles that exist in the live careers.ts CAREERS_ROLES (both directions)", () => {
    const paths = sitemapPaths();
    const sitemapCareerSlugs = paths
      .filter((p) => p.startsWith("/careers/"))
      .map((p) => p.slice("/careers/".length))
      .sort();
    const liveCareerSlugs = CAREERS_ROLES.map((role) => role.slug).sort();

    expect(sitemapCareerSlugs).toEqual(liveCareerSlugs);
  });

  it("includes /mvps and /early-interest", () => {
    const paths = sitemapPaths();
    expect(paths).toContain("/mvps");
    expect(paths).toContain("/early-interest");
  });

  it("does not list /llms.txt (a text file, not an indexable page)", () => {
    expect(sitemap).not.toContain("llms.txt");
  });

  it("has no duplicate URLs", () => {
    const paths = sitemapPaths();
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe("robots.txt", () => {
  it("keeps the sitemap pointer and the general Allow: /", () => {
    expect(robots).toContain("Sitemap: https://xeniostechnology.com/sitemap.xml");
    expect(robots).toMatch(/User-agent: \*\n(?:.*\n)*?Allow: \//);
  });

  it("disallows /api/ and /admin for every declared crawler, as defense in depth", () => {
    const blocks = robots.split(/\n(?=User-agent:)/).filter((b) => b.startsWith("User-agent:"));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(block).toContain("Disallow: /api/");
      expect(block).toContain("Disallow: /admin");
    }
  });
});
