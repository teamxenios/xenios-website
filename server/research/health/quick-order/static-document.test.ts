import express from "express";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { serveStatic } from "../../../static";

// Real static middleware and document policy, with a test-owned synthetic build.
// This is document composition coverage, not a production build/browser result.
const SHELL = `<!doctype html><html lang="en"><head>
<meta charset="utf-8" />
<title>Synthetic inherited public title</title>
<meta name="description" content="Synthetic inherited public description" />
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://example.invalid/inherited" />
<meta property="og:url" content="https://example.invalid/inherited" />
<meta property="og:title" content="Synthetic inherited social title" />
<meta name="twitter:card" content="summary_large_image" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"synthetic-inherited-organization"}</script>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"FAQPage","name":"synthetic-inherited-faq"}</script>
<link rel="stylesheet" href="/assets/synthetic-app.css" />
</head><body><!-- synthetic-built-shell --><div id="root"></div>
<script type="module" src="/assets/synthetic-app.js"></script></body></html>`;
const OWNED_TARGETS = [
  "/health/quick-order",
  "/health/quick-order?ref=SYNTHETIC_REFERRAL&email=synthetic%40example.invalid",
  "/HEALTH/QUICK-ORDER/",
  "/%68ealth/quick-%6frder",
] as const;
const PRIVACY_CASES = OWNED_TARGETS.flatMap(target => [
  { method: "GET" as const, target }, { method: "HEAD" as const, target },
]);
const TEMP_PARENT = path.resolve(os.tmpdir());
const TEMP_PREFIX = "xenios-quick-order-static-";
let fixtureRoot: string | undefined;
let app: express.Express;

beforeAll(() => {
  fixtureRoot = fs.mkdtempSync(path.join(TEMP_PARENT, TEMP_PREFIX));
  const dist = path.join(fixtureRoot, "dist", "public");
  fs.mkdirSync(path.join(dist, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dist, "index.html"), SHELL, "utf8");
  fs.writeFileSync(path.join(dist, "assets", "synthetic-app.js"), "export const syntheticAsset = true;\n", "utf8");
  fs.writeFileSync(path.join(dist, "assets", "synthetic-app.css"), "body { color: black; }\n", "utf8");
  app = express();
  serveStatic(app, dist);
});
beforeEach(() => { vi.stubEnv("RESEARCH_INDEXABLE", "true"); });
afterEach(() => { vi.unstubAllEnvs(); });
afterAll(() => {
  if (!fixtureRoot) return;
  const ownedRoot = path.resolve(fixtureRoot);
  if (path.dirname(ownedRoot) !== TEMP_PARENT || !path.basename(ownedRoot).startsWith(TEMP_PREFIX)) {
    throw new Error("Refusing cleanup outside the test-owned temporary directory");
  }
  fs.rmSync(ownedRoot, { recursive: true, force: true });
});

function expectPrivateHtml(html: string): void {
  expect(html).toContain('<meta name="robots" content="noindex,nofollow,noarchive"');
  expect(html).toContain("<title>Private document, xenios</title>");
  expect(html).not.toMatch(/<link\b[^>]*\brel=["']canonical["']/iu);
  expect(html).not.toMatch(/<meta\b[^>]*(?:property=["']og:|name=["']twitter:)/iu);
  expect(html).not.toMatch(/application\/ld\+json/iu);
  expect(html).not.toContain("Synthetic inherited");
  expect(html).not.toContain("synthetic-inherited-");
  expect(html).not.toContain("SYNTHETIC_REFERRAL");
  expect(html).not.toContain("synthetic@example.invalid");
  expect(html).not.toContain("synthetic%40example.invalid");
}

describe("Quick Order through real serveStatic with a synthetic build", () => {
  it.each(OWNED_TARGETS)("serves direct GET and HEAD as private HTML at %s", async target => {
    const get = await request(app).get(target);
    expect(get.status).toBe(200);
    expect(get.headers.location).toBeUndefined();
    expect(get.headers["content-type"]).toMatch(/^text\/html/);
    expect(get.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(get.headers.link).toBeUndefined();
    expectPrivateHtml(get.text);
    expect(get.text).toContain("<!-- synthetic-built-shell -->");
    expect(get.text).toContain('src="/assets/synthetic-app.js"');
    expect(get.text).toContain('href="/assets/synthetic-app.css"');

    const head = await request(app).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.location).toBeUndefined();
    for (const header of ["content-type", "content-length", "x-robots-tag", "link"]) {
      expect(head.headers[header]).toBe(get.headers[header]);
    }
    expect(head.text).toBeUndefined();
  });

  // Required assertions intentionally retained. Frozen static.ts only supplies
  // these headers for /status; failure is source-predicted, not an executed result.
  it.each(PRIVACY_CASES)("requires private cache/referrer headers for $method $target", async ({ method, target }) => {
    const response = await (method === "GET" ? request(app).get(target) : request(app).head(target));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("applies document policy again on a direct refresh while built assets remain ordinary files", async () => {
    const first = await request(app).get("/health/quick-order");
    const refreshed = await request(app).get("/health/quick-order?ref=SYNTHETIC_REFERRAL");
    expect(first.status).toBe(200);
    expect(refreshed.status).toBe(200);
    expectPrivateHtml(first.text);
    expectPrivateHtml(refreshed.text);
    expect(refreshed.text).toBe(first.text);
    const asset = await request(app).get("/assets/synthetic-app.js");
    expect(asset.status).toBe(200);
    expect(asset.text).toBe("export const syntheticAsset = true;\n");
    expect(asset.headers["content-type"]).toMatch(/javascript/);
    expect(asset.headers["x-robots-tag"]).toBeUndefined();
  });

  it.each([
    { target: "/", canonical: "https://xeniostechnology.com" },
    { target: "/quality", canonical: "https://xeniostechnology.com/quality" },
  ])("preserves public indexable GET/HEAD behavior at $target", async ({ target, canonical }) => {
    const get = await request(app).get(target);
    expect(get.status).toBe(200);
    expect(get.headers["x-robots-tag"]).toMatch(/^index,follow/);
    expect(get.headers.link).toBe(`<${canonical}>; rel="canonical"`);
    expect(get.text).toContain(`<link rel="canonical" href="${canonical}"`);
    expect(get.text).toContain(`property="og:url" content="${canonical}"`);
    expect(get.text).not.toContain("synthetic-inherited-");
    if (target === "/") {
      expect(get.text).toContain('data-raw-http-schema="Organization"');
      expect(get.text).toContain('data-raw-http-schema="WebSite"');
    }
    const head = await request(app).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.link).toBe(get.headers.link);
    expect(head.headers["x-robots-tag"]).toBe(get.headers["x-robots-tag"]);
    expect(head.text).toBeUndefined();
  });

  it("preserves the exact Health gateway redirect without redirecting the intake", async () => {
    for (const method of ["GET", "HEAD"] as const) {
      const response = await (method === "GET" ? request(app).get("/health?from=synthetic") : request(app).head("/health?from=synthetic"));
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe("/?from=synthetic");
    }
  });

  it.each(["true", "false"])("preserves the Access Hub document when RESEARCH_INDEXABLE=%s", async flag => {
    vi.stubEnv("RESEARCH_INDEXABLE", flag);
    const target = "/research/access-hub?from=synthetic";
    const get = await request(app).get(target);
    expect(get.status).toBe(200);
    expect(get.headers.location).toBeUndefined();
    expect(get.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(get.headers.link).toBeUndefined();
    expectPrivateHtml(get.text);
    const head = await request(app).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.location).toBeUndefined();
    expect(head.headers["x-robots-tag"]).toBe(get.headers["x-robots-tag"]);
    expect(head.headers.link).toBeUndefined();
    expect(head.text).toBeUndefined();
  });

  it.each(["/health/quick-order-extra", "/health/quick-order/child"])("does not broaden intake document ownership to %s", async target => {
    const response = await request(app).get(target);
    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(response.headers.link).toBeUndefined();
  });
});
