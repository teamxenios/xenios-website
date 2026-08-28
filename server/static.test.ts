import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { serveStatic } from "./static";

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
    <link rel="canonical" href="https://xeniostechnology.com" />
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

  it("serves the homepage as an indexable document with its own canonical and no template schema", async () => {
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
    expect(res.text).not.toContain("application/ld+json");
    // Exactly one robots directive survives: the policy's.
    expect(res.text.match(/name="robots"/gu)).toHaveLength(1);
  });

  it("serves a public Research editorial page as indexable with an exact canonical", async () => {
    const res = await request(app).get("/research/quality");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toMatch(/^index,follow/u);
    expect(canonical(res.text)).toBe("https://xeniostechnology.com/research/quality");
  });

  it("keeps a private member document at 200 but noindex, with no canonical or og:url", async () => {
    const res = await request(app).get("/research/member/orders");
    expect(res.status).toBe(200);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(robots(res.text)).toBe("noindex,nofollow,noarchive");
    expect(canonical(res.text)).toBeNull();
    expect(res.text).not.toContain('property="og:url"');
    expect(res.headers.link).toBeUndefined();
  });

  it("answers an unknown document with an authoritative 404 and noindex", async () => {
    const res = await request(app).get("/this-document-does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(robots(res.text)).toBe("noindex,nofollow,noarchive");
    expect(canonical(res.text)).toBeNull();
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
