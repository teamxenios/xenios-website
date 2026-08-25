import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const HINO_ROOT = resolve(__dirname, "..", "..", "client", "public", "hino");
const PRODUCTION_BASE = "https://xeniostechnology.com/hino";

const canonicalRoutes = [
  ["/", "index.html"],
  ["/story", "story/index.html"],
  ["/legacy", "legacy/index.html"],
  ["/media", "media/index.html"],
  ["/collective", "collective/index.html"],
  ["/retreat", "retreat/index.html"],
  ["/merch", "merch/index.html"],
  ["/research", "research/index.html"],
  ["/contact", "contact/index.html"],
  ["/press", "press/index.html"],
  ["/training", "training/index.html"],
  ["/privacy", "privacy/index.html"],
  ["/terms", "terms/index.html"],
  ["/research-use", "research-use/index.html"],
] as const;

function read(relativePath: string): string {
  return readFileSync(resolve(HINO_ROOT, relativePath), "utf8").replace(/\r\n/g, "\n");
}

describe("the isolated Hollywood Hino static microsite", () => {
  it("ships every approved route as a standalone document with no source runtime dependency", () => {
    for (const [route, file] of canonicalRoutes) {
      const html = read(file);
      expect(html, route).toContain("<!DOCTYPE html>");
      expect(html, route).toContain('href="/hino/site.css"');
      expect(html, route).toContain('src="/hino/site.js"');
      expect(html, route).toMatch(
        /<meta name="robots" content="noindex, nofollow(?:, (?:nocache|noarchive))?"\/>?/,
      );
      expect(html, route).toContain(PRODUCTION_BASE);
      expect(html, route).not.toContain("http://localhost:3000");
      expect(html, route).not.toMatch(/\/(?:_next|@id|@vite)\//);
    }
  });

  it("uses the user-selected hooded profile as the first image on the site", () => {
    const home = read("index.html");
    const firstImage = home.match(/<img\b[^>]*\bsrc="([^"]+)"/i)?.[1];
    expect(firstImage).toBe("/hino/assets/hino-hero-profile.webp");
  });

  it("publishes only the five supplied non-Getty image derivatives", () => {
    const expectedAssets = [
      "hino-archive-02.webp",
      "hino-archive-03.webp",
      "hino-archive-04.webp",
      "hino-archive-05.webp",
      "hino-hero-profile.webp",
    ];
    const actualAssets = readdirSync(resolve(HINO_ROOT, "assets")).sort();
    expect(actualAssets).toEqual(expectedAssets);

    const sources = canonicalRoutes.flatMap(([, file]) => {
      return [...read(file).matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)].map((match) => match[1]);
    });
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((source) => source.startsWith("/hino/assets/hino-"))).toBe(true);
    expect(sources.some((source) => /getty|495406087|5db391/i.test(source))).toBe(false);
  });

  it("keeps every internal Hino link under /hino and leaves the canonical Research catalog external", () => {
    for (const [route, file] of canonicalRoutes) {
      const html = read(file);
      const rootRelativeLinks = [...html.matchAll(/href="(\/[^"#]+)"/gi)].map((match) => match[1]);
      expect(
        rootRelativeLinks.every(
          (href) => href.startsWith("/hino/") || href.startsWith("/research/catalog"),
        ),
        route,
      ).toBe(true);
    }

    expect(read("research/index.html")).toContain(
      'href="https://xeniostechnology.com/research/catalog"',
    );
  });

  it("includes the complete dated 127-entry retail-reference list", () => {
    const research = read("research/index.html");
    const list = research.match(/<ol class="catalog-list">([\s\S]*?)<\/ol>/)?.[1] ?? "";
    const renderedText = research.replaceAll("<!-- -->", "");
    expect([...list.matchAll(/<li>/g)]).toHaveLength(127);
    expect(renderedText).toContain("Showing 127 of 127 entries");
    expect(research).toContain("Retail price / unit");
    expect(research).toContain("Price pending");
    expect(research).toContain("Research use only");
  });

  it("keeps all three requested YouTube players privacy-gated", () => {
    const media = read("media/index.html");
    expect([...media.matchAll(/class="video-consent"/g)]).toHaveLength(3);
    expect(media).not.toContain("youtube.com/embed/");

    const script = read("site.js");
    for (const id of ["9iGir_DXeMU", "PHMouuOEst8", "3t_sry94H_s"]) {
      expect(script).toContain(id);
    }
    expect(script).toContain("youtube-nocookie.com/embed/");
  });

  it("redirects both legacy Collective aliases inside the /hino subtree", () => {
    for (const alias of ["hino-collective", "xenios-kollective"]) {
      const html = read(`${alias}/index.html`);
      expect(html).toContain('content="0; url=/hino/collective/"');
      expect(html).toContain('href="/hino/collective/"');
    }
  });
});
