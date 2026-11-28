import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./static";
import { EARLY_ACCESS_SOCIAL_IDENTITY, HOME_SOCIAL_IDENTITY } from "../shared/research/social-metadata";

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
let fixtureRoot: string;
let app: express.Express;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), ".xenios-evidence-dist-"));
  distDir = path.join(fixtureRoot, "dist", "public");
  fs.mkdirSync(distDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "index.html"), SHELL, "utf8");
  fs.mkdirSync(path.join(distDir, "assets"));
  fs.writeFileSync(path.join(distDir, "assets", "app.js"), "console.log('app');\n", "utf8");
  fs.writeFileSync(path.join(distDir, "robots.txt"), "User-agent: *\nAllow: /\n", "utf8");
  fs.writeFileSync(path.join(distDir, "favicon.png"), "test-favicon", "utf8");
  fs.mkdirSync(path.join(distDir, "og"));
  for (const name of ["xenios-home-full-vision-v3.png", "xenios-early-access-v1.png"]) {
    fs.copyFileSync(path.resolve("client/public/og", name), path.join(distDir, "og", name));
  }
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
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
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

  it("answers GET and HEAD for favicon.ico from an evidence-shaped hidden snapshot", async () => {
    const favicon = await request(app).get("/favicon.ico");
    expect(favicon.status).toBe(200);
    expect(favicon.headers["content-type"]).toMatch(/^image\/png/u);
    expect(Buffer.from(favicon.body).toString("utf8")).toBe("test-favicon");

    const faviconHead = await request(app).head("/favicon.ico");
    expect(faviconHead.status).toBe(200);
    expect(faviconHead.headers["content-type"]).toMatch(/^image\/png/u);
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
    expect(res.text).toContain("Tensa Health &amp; Infinity");
    expect(res.text).toContain(HOME_SOCIAL_IDENTITY.description);
    expect(res.text).toContain(HOME_SOCIAL_IDENTITY.image);
    expect(res.text).not.toContain("The professional stays in front. Xen and Athena carry the work behind them.");
    // Exactly one robots directive survives: the policy's.
    expect(res.text.match(/name="robots"/gu)).toHaveLength(1);
  });

  it("serves a real multi-size ICO with its own MIME while retaining the PNG-only fallback", async () => {
    const bytes = fs.readFileSync(path.resolve("client/public/favicon.ico"));
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    expect(bytes.readUInt16LE(4)).toBe(3);
    for (const [index, size] of [16, 32, 48].entries()) {
      const entry = 6 + index * 16;
      expect(bytes[entry]).toBe(size);
      expect(bytes[entry + 1]).toBe(size);
      const length = bytes.readUInt32LE(entry + 8), offset = bytes.readUInt32LE(entry + 12);
      expect(offset + length).toBeLessThanOrEqual(bytes.length);
      expect(bytes.subarray(offset, offset + 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    }
    const file = path.join(distDir, "favicon.ico");
    try {
      fs.writeFileSync(file, bytes);
      const result = await request(app).get("/favicon.ico");
      expect(result.status).toBe(200);
      expect(result.headers["content-type"]).toMatch(/^image\/x-icon/u);
      expect(Buffer.from(result.body)).toEqual(bytes);
      const head = await request(app).head("/favicon.ico");
      expect(head.status).toBe(200);
      expect(head.headers["content-type"]).toMatch(/^image\/x-icon/u);
      expect(head.text).toBeUndefined();
    } finally {
      fs.unlinkSync(file);
    }
  });

  it("serves distinct real 1200x630 share PNGs publicly with exact binary bytes", async () => {
    for (const identity of [HOME_SOCIAL_IDENTITY, EARLY_ACCESS_SOCIAL_IDENTITY]) {
      const pathname = new URL(identity.image).pathname;
      const bytes = fs.readFileSync(path.resolve("client/public", "." + pathname));
      expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
      expect(bytes.readUInt32BE(16)).toBe(1200);
      expect(bytes.readUInt32BE(20)).toBe(630);
      const res = await request(app).get(pathname);
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toMatch(/^image\/png/u);
      expect(res.headers.location).toBeUndefined();
      expect(Buffer.from(res.body)).toEqual(bytes);
      const head = await request(app).head(pathname);
      expect(head.status).toBe(200);
      expect(head.headers["content-type"]).toMatch(/^image\/png/u);
    }
  });

  it("answers private Early Access with constant share metadata before JavaScript and keeps it noindex", async () => {
    const res = await request(app).get("/earlyaccess?token=private-token&email=private-customer");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(canonical(res.text)).toBeNull();
    expect(res.headers.link).toBeUndefined();
    expect(res.text).toContain(EARLY_ACCESS_SOCIAL_IDENTITY.image);
    expect(res.text).not.toContain(HOME_SOCIAL_IDENTITY.image);
    expect(res.text).not.toContain("application/ld+json");
    expect(res.text).not.toContain("private-token");
    expect(res.text).not.toContain("private-customer");
    const head = await request(app).head("/earlyaccess");
    expect(head.status).toBe(200);
    expect(head.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(head.headers.link).toBeUndefined();
  });

  it("preserves PWA identity and gives maskable icons their separately designed asset", () => {
    const manifest = JSON.parse(fs.readFileSync(path.resolve("client/public/site.webmanifest"), "utf8"));
    expect({id: manifest.id, start: manifest.start_url, scope: manifest.scope}).toEqual({id: "/", start: "/", scope: "/"});
    const maskable = manifest.icons.find((icon: {purpose: string}) => icon.purpose === "maskable");
    expect(maskable.src).toBe("/android-chrome-maskable-512x512.png");
    expect(manifest.icons.filter((icon: {purpose: string}) => icon.purpose === "any").every((icon: {src: string}) => icon.src !== maskable.src)).toBe(true);
    for (const icon of manifest.icons) {
      const bytes = fs.readFileSync(path.resolve("client/public", "." + icon.src));
      expect(`${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`).toBe(icon.sizes);
    }
    const template = fs.readFileSync(path.resolve("client/index.html"), "utf8");
    expect(template.match(/<link rel="icon"/gu)).toHaveLength(1);
    expect(template).toContain('type="image/png" href="/favicon.png"');
    expect(template).toContain('href="/site.webmanifest"');
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

  it("serves /health as the indexable canonical Care + Research gateway", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toMatch(/^index,follow/u);
    expect(res.headers.link).toBe(
      '<https://xeniostechnology.com/health>; rel="canonical"',
    );
    expect(canonical(res.text)).toBe("https://xeniostechnology.com/health");
    expect(res.text).toContain("Xenios | Care + Research");
    expect(res.text).toContain(
      "Begin provider-guided Care for personal health or explore the separate evidence-led Xenios Research pathway for legitimate nonclinical work.",
    );
    expect(res.text).not.toContain("template-organization");
    expect(res.text).not.toContain("template-faq");
    expect(res.text).not.toContain("application/ld+json");
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

  it.each([`r1_${"Ab0_-".repeat(8)}XyZ`, "sam-2026", "synthetic-source-token"])("serves the generic private recipient shell for GET/HEAD %s without resolving a referral", async selector => {
    const pathname = `/r/${selector}`;
    const res = await request(app).get(pathname);
    expect(res.status).toBe(200); expect(res.headers["content-type"]).toMatch(/text\/html/u);
    expect(res.headers["cache-control"]).toBe("no-store"); expect(res.headers.pragma).toBe("no-cache");
    expect(res.headers["referrer-policy"]).toBe("no-referrer"); expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(res.headers.link).toBeUndefined(); expect(res.headers.location).toBeUndefined(); expect(res.headers["set-cookie"]).toBeUndefined();
    expect(robots(res.text)).toBe("noindex,nofollow,noarchive"); expect(canonical(res.text)).toBeNull();
    expect(res.text).toContain("<title>Private document, xenios</title>");
    expect(res.text).toContain('<div id="root"></div>'); expect(res.text).toContain('type="module" src="/assets/app.js"');
    for (const value of [selector, 'property="og:', 'name="twitter:', 'rel="alternate"', "application/ld+json", "Inherited title", "template-organization", "template-faq"]) expect(res.text).not.toContain(value);
    const head = await request(app).head(pathname);
    expect(head.status).toBe(200); expect(head.text).toBeUndefined();
    for (const header of ["cache-control", "pragma", "referrer-policy", "x-robots-tag"]) expect(head.headers[header]).toBe(res.headers[header]);
    expect(head.headers.link).toBeUndefined(); expect(head.headers.location).toBeUndefined(); expect(head.headers["set-cookie"]).toBeUndefined();
  });

  it.each([
    "/r", "/r/AB", `/r/${"A".repeat(25)}`, "/r/-ABC", "/r/SAM_2026", "/r/SAM-2026/", "/r/SAM-2026/extra",
    "/R/SAM-2026", "/%72/SAM-2026", "/r/%53AM-2026", "/r/SAM%2F2026", "/r/SAM%252F2026", "/r/SAM%5C2026",
    `/r/r1_${"A".repeat(42)}`, `/r/r1_${"A".repeat(44)}`, `/r/R1_${"A".repeat(43)}`,
  ])("keeps malformed/encoded/extra recipient path %s an uncacheable private 404", async pathname => {
    const res = await request(app).get(pathname);
    expect(res.status).toBe(404); expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers.pragma).toBe("no-cache"); expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(res.headers.link).toBeUndefined(); expect(res.headers.location).toBeUndefined(); expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.text).toContain("<title>Not found, xenios</title>"); expect(canonical(res.text)).toBeNull();
    expect(res.text).not.toContain('property="og:'); expect(res.text).not.toContain('name="twitter:'); expect(res.text).not.toContain("application/ld+json");
  });

  it("never reflects query credentials or lets them replace the recipient path identity", async () => {
    const res = await request(app).get("/r/sam-2026?code=OTHER-CODE&token=private-query&email=private-customer&redirect=https%3A%2F%2Foutside.example");
    const plain = await request(app).get("/r/sam-2026");
    expect(res.status).toBe(200); expect(res.text).toBe(plain.text);
    expect(res.headers["cache-control"]).toBe("no-store"); expect(res.headers["referrer-policy"]).toBe("no-referrer");
    expect(res.headers.link).toBeUndefined(); expect(res.headers.location).toBeUndefined(); expect(res.headers["set-cookie"]).toBeUndefined();
    for (const value of ["sam-2026", "OTHER-CODE", "private-query", "private-customer", "outside.example"]) {
      expect(res.text).not.toContain(value); expect(JSON.stringify(res.headers)).not.toContain(value);
    }
  });

  it.each(["/r?code=SAM-2026", "/r/AB?code=SAM-2026", "/r/SAM-2026/extra?code=SAM-2026"])("does not promote query-selected document %s", async target => {
    const res = await request(app).get(target);
    expect(res.status).toBe(404); expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["referrer-policy"]).toBe("no-referrer"); expect(res.headers.link).toBeUndefined(); expect(res.headers.location).toBeUndefined();
    expect(res.text).not.toContain("SAM-2026"); expect(res.text).not.toContain('property="og:'); expect(res.text).not.toContain("application/ld+json");
  });

  it("leaves unrelated documents and real static assets outside recipient admission", async () => {
    const unrelated = await request(app).get("/risky/sam-2026");
    expect(unrelated.status).toBe(404); expect(unrelated.headers["cache-control"]).toBeUndefined();
    expect(unrelated.headers["referrer-policy"]).toBeUndefined();
    const health = await request(app).get("/health");
    expect(health.status).toBe(200); expect(canonical(health.text)).toBe("https://xeniostechnology.com/health");
    const asset = await request(app).get("/assets/app.js"); expect(asset.status).toBe(200); expect(asset.text).toContain("console.log('app')");
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
    const viteConfig = fs.readFileSync(path.resolve("vite.config.ts"), "utf8");
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
    expect(viteConfig).toMatch(/assetsInlineLimit:\s*0/u);
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
