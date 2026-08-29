import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./static";

// The document-policy cases below assert each document's INTENDED indexability
// (index vs noindex per the policy tables). The environment gate is exercised
// explicitly by the RESEARCH_INDEXABLE case, which toggles and restores it.
process.env.RESEARCH_INDEXABLE = "true";

// A production-shaped shell: global homepage metadata and JSON-LD exactly as
// client/index.html carries them, because that is what the SPA fallback used
// to send for EVERY document, including private routes and unknown paths.
const SHELL = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>xenios | shell</title>
    <meta name="robots" content="index,follow" />
    <meta property="og:url" content="https://xeniostechnology.com" />
    <meta property="og:title" content="Inherited title" />
    <meta property="og:image" content="https://xeniostechnology.com/og/xenios-og-image-v2.png" />
    <link rel="canonical" href="https://xeniostechnology.com" />
    <link href="/assets/fonts.css" rel="stylesheet" />
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"template-organization"}</script>
    <script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","name":"template-faq"}</script>
  </head>
  <body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>
`;

let distDir: string;
let app: express.Express;

beforeAll(() => {
  distDir = fs.mkdtempSync(path.join(os.tmpdir(), "xenios-static-"));
  fs.writeFileSync(path.join(distDir, "index.html"), SHELL, "utf8");
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(path.join(distDir, "assets", "app.js"), "console.log('app');\n", "utf8");
  fs.writeFileSync(path.join(distDir, "robots.txt"), "User-agent: *\nAllow: /\n", "utf8");
  fs.writeFileSync(path.join(distDir, "favicon.png"), "test-favicon", "utf8");
  // A static microsite subtree exactly as client/public/hino is built: its own
  // index documents must be served as files, never through the SPA policy.
  fs.mkdirSync(path.join(distDir, "hino", "story"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "hino", "index.html"), "<!doctype html><html><head><title>hino-static</title></head><body>hino</body></html>", "utf8");
  fs.writeFileSync(path.join(distDir, "hino", "story", "index.html"), "<!doctype html><html><head><title>hino-story-static</title></head><body>story</body></html>", "utf8");
  // An asset-only directory that shares its name with an SPA document (the
  // candidate ships client/public/research/*.jpg): it must never redirect.
  fs.mkdirSync(path.join(distDir, "research"), { recursive: true });
  fs.writeFileSync(path.join(distDir, "research", "hero.jpg"), "not-really-a-jpeg", "utf8");
  app = express();
  serveStatic(app, distDir);
});

afterAll(() => {
  fs.rmSync(distDir, { recursive: true, force: true });
});

function robots(html: string): string | null {
  const match = /<meta name="robots" content="([^"]+)" data-raw-http-policy="robots"/u.exec(html);
  return match ? match[1] : null;
}

function canonical(html: string): string | null {
  const match = /<link rel="canonical" href="([^"]+)" data-raw-http-policy="canonical"/u.exec(html);
  return match ? match[1] : null;
}

describe("the production static server answers documents through the raw HTTP policy", () => {
  it("still serves real built files untouched", async () => {
    const asset = await request(app).get("/assets/app.js");
    expect(asset.status).toBe(200);
    expect(asset.text).toContain("console.log('app')");
    const robotsTxt = await request(app).get("/robots.txt");
    expect(robotsTxt.status).toBe(200);
    expect(robotsTxt.text).toContain("User-agent");
  });

  it("answers the conventional favicon.ico request from the shipped PNG", async () => {
    const favicon = await request(app).get("/favicon.ico");
    expect(favicon.status).toBe(200);
    expect(favicon.headers["content-type"]).toMatch(/^image\/png/u);
    expect(Buffer.from(favicon.body).toString("utf8")).toBe("test-favicon");
  });

  it("serves the homepage with route-owned metadata and Organization/WebSite schema", async () => {
    const res = await request(app).get("/");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/u);
    expect(res.headers["x-robots-tag"]).toMatch(/^index,follow/u);
    expect(res.headers.link).toBe('<https://xeniostechnology.com>; rel="canonical"');
    expect(robots(res.text)).toMatch(/^index,follow/u);
    expect(canonical(res.text)).toBe("https://xeniostechnology.com");
    // The template's global JSON-LD is never route authority.
    expect(res.text).not.toContain("template-organization");
    expect(res.text).not.toContain("template-faq");
    expect(res.text.match(/data-raw-http-schema="Organization"/gu)).toHaveLength(1);
    expect(res.text.match(/data-raw-http-schema="WebSite"/gu)).toHaveLength(1);
    expect(res.text.match(/application\/ld\+json/gu)).toHaveLength(2);
    expect(res.text).toContain("xenios | The operating system for proactive health");
    expect(res.text).toContain("The professional stays in front. Xen and Athena carry the work behind them.");
    // Exactly one robots directive survives: the policy's.
    expect(res.text.match(/name="robots"/gu)).toHaveLength(1);
  });

  it("serves only reviewed JobPosting schema on careers routes", async () => {
    const careers = await request(app).get("/careers");
    expect(careers.text.match(/data-raw-http-schema="JobPosting:/gu)).toHaveLength(2);
    const detail = await request(app).get("/careers/founding-designer");
    expect(detail.text.match(/data-raw-http-schema="JobPosting:Founding Designer"/gu))
      .toHaveLength(1);
    const closed = await request(app).get("/careers/founding-coach-cohort");
    expect(closed.text).not.toContain('data-raw-http-schema="JobPosting:');
  });

  it("serves a public Research editorial page as indexable with an exact canonical", async () => {
    const res = await request(app).get("/research/quality");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toMatch(/^index,follow/u);
    expect(canonical(res.text)).toBe("https://xeniostechnology.com/research/quality");
  });

  it("keeps a private member document at 200 but noindex, with no canonical or Open Graph authority", async () => {
    const res = await request(app).get("/research/member/orders");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(robots(res.text)).toBe("noindex,nofollow,noarchive");
    expect(canonical(res.text)).toBeNull();
    expect(res.text).not.toContain('property="og:');
    expect(res.text).not.toContain('name="twitter:');
    expect(res.text).not.toContain("xenios | shell");
    expect(res.headers.link).toBeUndefined();
  });

  it("keeps the self-hosted font asset same-origin for Care and marketing documents", async () => {
    const care = await request(app).get("/care");
    expect(care.status).toBe(200);
    expect(care.text).not.toContain("fonts.googleapis.com");
    expect(care.text).not.toContain("fonts.gstatic.com");
    expect(care.text).toContain('href="/assets/fonts.css"');

    const marketing = await request(app).get("/");
    expect(marketing.text).not.toContain("fonts.googleapis.com");
    expect(marketing.text).not.toContain("fonts.gstatic.com");
    expect(marketing.text).toContain('href="/assets/fonts.css"');
  });

  it("pins production typography to same-origin Fontsource packages", () => {
    const clientIndex = fs.readFileSync(path.resolve("client/index.html"), "utf8");
    const fontEntry = fs.readFileSync(path.resolve("client/src/fonts.ts"), "utf8");
    expect(clientIndex).not.toMatch(/fonts\.(?:googleapis|gstatic)\.com/u);
    for (const asset of [
      "@fontsource/inter-tight/500.css",
      "@fontsource/inter-tight/600.css",
      "@fontsource/inter-tight/700.css",
      "@fontsource/inter-tight/800.css",
      "@fontsource/inter-tight/900.css",
      "@fontsource/jetbrains-mono/500.css",
      "@fontsource/jetbrains-mono/600.css",
    ]) {
      expect(fontEntry).toContain(`import \"${asset}\";`);
    }
  });

  it("answers an unknown document with an authoritative 404 and noindex", async () => {
    const res = await request(app).get("/this-document-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(robots(res.text)).toBe("noindex,nofollow,noarchive");
    expect(canonical(res.text)).toBeNull();
    expect(res.text).not.toContain('property="og:');
    expect(res.text).not.toContain('name="twitter:');
    expect(res.text).not.toContain("xenios | shell");
  });

  it("no longer soft-404s an unknown career slug", async () => {
    const res = await request(app).get("/careers/not-a-real-role");
    expect(res.status).toBe(404);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
  });

  it("serves the static /hino subtree byte-for-byte and never routes it through the policy", async () => {
    const hino = await request(app).get("/hino/");
    expect(hino.status).toBe(200);
    expect(hino.text).toContain("<title>hino-static</title>");
    expect(hino.text).not.toContain("data-raw-http-policy");
    expect(hino.headers["x-robots-tag"]).toBeUndefined();
    const story = await request(app).get("/hino/story/");
    expect(story.status).toBe(200);
    expect(story.text).toContain("hino-story-static");
    // express.static's production behaviour: a directory without a trailing
    // slash redirects to the slash form rather than falling into the SPA.
    const bare = await request(app).get("/hino");
    expect(bare.status).toBe(301);
    expect(bare.headers.location).toBe("/hino/");
    expect(bare.headers["content-type"]).toBe("text/html; charset=UTF-8");
    expect(bare.headers["content-security-policy"]).toBe("default-src 'none'");
    expect(bare.headers["x-content-type-options"]).toBe("nosniff");
    expect(bare.text).toContain("Redirecting to /hino/");
  });

  it("never redirects an SPA document whose path is also an asset-only directory", async () => {
    const res = await request(app).get("/research");
    expect(res.status).toBe(200);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain("<div id=\"root\">");
    const asset = await request(app).get("/research/hero.jpg");
    expect(asset.status).toBe(200);
    expect(asset.headers["content-type"]).toContain("image/jpeg");
    // supertest buffers image bodies (res.body is a Buffer, res.text is undefined)
    expect(Buffer.from(asset.body).toString("utf8")).toBe("not-really-a-jpeg");
  });

  it("keeps public documents noindex at the HTTP layer until RESEARCH_INDEXABLE is true", async () => {
    const previous = process.env.RESEARCH_INDEXABLE;
    try {
      delete process.env.RESEARCH_INDEXABLE;
      // the marketing site is never gated by the Research flag (production parity)
      const marketing = await request(app).get("/");
      expect(marketing.status).toBe(200);
      expect(marketing.headers["x-robots-tag"]).toContain("index,follow");
      expect(marketing.headers["x-robots-tag"]).not.toContain("noindex");
      const gated = await request(app).get("/research");
      expect(gated.status).toBe(200);
      expect(gated.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
      expect(gated.text).toContain('<meta name="robots" content="noindex,nofollow,noarchive" data-raw-http-policy="robots" />');
      expect(gated.text).not.toContain('rel="canonical"');
      expect(gated.text).not.toContain('property="og:');
      process.env.RESEARCH_INDEXABLE = "true";
      const open = await request(app).get("/research");
      expect(open.headers["x-robots-tag"]).toContain("index,follow");
      expect(open.headers["x-robots-tag"]).not.toContain("noindex");
    } finally {
      if (previous === undefined) delete process.env.RESEARCH_INDEXABLE;
      else process.env.RESEARCH_INDEXABLE = previous;
    }
  });

  it("does not hand out the raw shell with its template schema at /index.html", async () => {
    const res = await request(app).get("/index.html");
    expect(res.text).not.toContain("template-organization");
    expect(res.text).not.toContain("application/ld+json");
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
  });

  it("ignores a query suffix on a public path and canonicalizes to the exact document", async () => {
    const res = await request(app).get("/research/quality?utm_source=x");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toMatch(/^index,follow/u);
    expect(canonical(res.text)).toBe("https://xeniostechnology.com/research/quality");
  });
});
