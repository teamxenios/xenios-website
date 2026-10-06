import express, { type NextFunction, type Request, type Response } from "express";
import { createServer, type Server } from "node:http";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  createServer: vi.fn(),
  middlewares: vi.fn(),
  transformIndexHtml: vi.fn(),
  ssrFixStacktrace: vi.fn(),
}));
vi.mock("vite", async importOriginal => ({
  ...await importOriginal<typeof import("vite")>(),
  createServer: boundary.createServer,
}));
import { setupVite } from "../../../vite";

// Composition UNIT test: actual setupVite, actual client/index.html read and real
// sendRawHttpDocument/policy; only Vite's server/transform transport is synthetic.
// No real Vite server, transform pipeline, HMR or browser qualification is claimed.
const OWNED_TARGETS = [
  "/health/quick-order",
  "/health/quick-order?ref=SYNTHETIC_REFERRAL&email=synthetic%40example.invalid",
  "/HEALTH/QUICK-ORDER/",
  "/%68ealth/quick-%6frder",
] as const;
const PRIVACY_CASES = OWNED_TARGETS.flatMap(target => [
  { method: "GET" as const, target }, { method: "HEAD" as const, target },
]);
const TRANSFORMED_HEAD = `
<meta name="robots" content="index,follow" />
<link rel="canonical" href="https://example.invalid/synthetic-vite-public" />
<meta property="og:url" content="https://example.invalid/synthetic-vite-public" />
<meta name="twitter:title" content="synthetic-vite-public" />
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"synthetic-vite-public"}</script>
<!-- synthetic-vite-transform -->
`;
let server: Server | undefined;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("RESEARCH_INDEXABLE", "true");
  boundary.middlewares.mockImplementation((_req: Request, _res: Response, next: NextFunction) => next());
  boundary.transformIndexHtml.mockImplementation(async (_target: string, html: string) => html.replace("</head>", `${TRANSFORMED_HEAD}</head>`));
  boundary.createServer.mockResolvedValue({
    middlewares: boundary.middlewares,
    transformIndexHtml: boundary.transformIndexHtml,
    ssrFixStacktrace: boundary.ssrFixStacktrace,
  });
  const app = express();
  server = createServer(app);
  await setupVite(server, app);
});
afterEach(async () => {
  try {
    if (server?.listening) {
      const ownedServer = server;
      await new Promise<void>((resolve, reject) => ownedServer.close(error => error ? reject(error) : resolve()));
    }
  } finally {
    server = undefined;
    vi.unstubAllEnvs();
  }
});

function expectPrivateHtml(html: string): void {
  expect(html).toContain('<meta name="robots" content="noindex,nofollow,noarchive"');
  expect(html).toContain("<title>Private document, xenios</title>");
  expect(html).not.toMatch(/<link\b[^>]*\brel=["']canonical["']/iu);
  expect(html).not.toMatch(/<meta\b[^>]*(?:property=["']og:|name=["']twitter:)/iu);
  expect(html).not.toMatch(/application\/ld\+json/iu);
  expect(html).not.toContain("synthetic-vite-public");
  expect(html).not.toContain("Care and research products | Xenios");
  expect(html).not.toContain("SYNTHETIC_REFERRAL");
  expect(html).not.toContain("synthetic@example.invalid");
  expect(html).not.toContain("synthetic%40example.invalid");
}

describe("Quick Order setupVite document composition unit with controlled transport", () => {
  it.each(OWNED_TARGETS)("applies the real fallback policy after transform for GET and HEAD %s", async target => {
    const get = await request(server!).get(target);
    expect(get.status).toBe(200);
    expect(get.headers.location).toBeUndefined();
    expect(get.headers["content-type"]).toMatch(/^text\/html/);
    expect(get.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(get.headers.link).toBeUndefined();
    expectPrivateHtml(get.text);
    expect(get.text).toContain("<!-- synthetic-vite-transform -->");
    expect(get.text).toContain('src="/src/main.tsx?v=');
    expect(boundary.createServer).toHaveBeenCalledTimes(1);
    expect(boundary.transformIndexHtml).toHaveBeenCalledWith(target, expect.stringContaining('src="/src/main.tsx?v='));

    const head = await request(server!).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.location).toBeUndefined();
    for (const header of ["content-type", "content-length", "x-robots-tag", "link"]) {
      expect(head.headers[header]).toBe(get.headers[header]);
    }
    expect(head.text).toBeUndefined();
    expect(boundary.middlewares).toHaveBeenCalledTimes(2);
    expect(boundary.transformIndexHtml).toHaveBeenCalledTimes(2);
    expect(boundary.ssrFixStacktrace).not.toHaveBeenCalled();
  });

  // The common frozen sendRawHttpDocument currently omits these for Quick Order.
  // Keep the required assertions; source prediction is not an observed test run.
  it.each(PRIVACY_CASES)("requires private cache/referrer headers for $method $target", async ({ method, target }) => {
    const response = await (method === "GET" ? request(server!).get(target) : request(server!).head(target));
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("runs the real fallback again for a direct refresh without carrying referral query values into HTML", async () => {
    const first = await request(server!).get("/health/quick-order");
    const refreshed = await request(server!).get("/health/quick-order?ref=SYNTHETIC_REFERRAL");
    expect(first.status).toBe(200);
    expect(refreshed.status).toBe(200);
    expectPrivateHtml(first.text);
    expectPrivateHtml(refreshed.text);
    expect(boundary.transformIndexHtml.mock.calls.map(([target]) => target)).toEqual([
      "/health/quick-order", "/health/quick-order?ref=SYNTHETIC_REFERRAL",
    ]);
  });

  it.each([
    { target: "/", canonical: "https://xeniostechnology.com" },
    { target: "/quality", canonical: "https://xeniostechnology.com/quality" },
  ])("preserves public GET/HEAD metadata at $target", async ({ target, canonical }) => {
    const get = await request(server!).get(target);
    expect(get.status).toBe(200);
    expect(get.headers["x-robots-tag"]).toMatch(/^index,follow/);
    expect(get.headers.link).toBe(`<${canonical}>; rel="canonical"`);
    expect(get.text).toContain(`<link rel="canonical" href="${canonical}"`);
    expect(get.text).toContain(`property="og:url" content="${canonical}"`);
    expect(get.text).not.toContain("synthetic-vite-public");
    if (target === "/") {
      expect(get.text).toContain('data-raw-http-schema="Organization"');
      expect(get.text).toContain('data-raw-http-schema="WebSite"');
    }
    const head = await request(server!).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.link).toBe(get.headers.link);
    expect(head.headers["x-robots-tag"]).toBe(get.headers["x-robots-tag"]);
    expect(head.text).toBeUndefined();
  });

  it("retains the exact Health gateway redirect", async () => {
    for (const method of ["GET", "HEAD"] as const) {
      const response = await (method === "GET" ? request(server!).get("/health?from=synthetic") : request(server!).head("/health?from=synthetic"));
      expect(response.status).toBe(301);
      expect(response.headers.location).toBe("/?from=synthetic");
    }
  });

  it.each(["true", "false"])("retains Access Hub GET/HEAD policy with RESEARCH_INDEXABLE=%s", async flag => {
    vi.stubEnv("RESEARCH_INDEXABLE", flag);
    const target = "/research/access-hub?from=synthetic";
    const get = await request(server!).get(target);
    expect(get.status).toBe(200);
    expect(get.headers.location).toBeUndefined();
    expect(get.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(get.headers.link).toBeUndefined();
    expectPrivateHtml(get.text);
    const head = await request(server!).head(target);
    expect(head.status).toBe(200);
    expect(head.headers.location).toBeUndefined();
    expect(head.headers["x-robots-tag"]).toBe(get.headers["x-robots-tag"]);
    expect(head.headers.link).toBeUndefined();
    expect(head.text).toBeUndefined();
  });

  it.each(["/health/quick-order-extra", "/health/quick-order/child"])("keeps neighboring document %s outside intake ownership", async target => {
    const response = await request(server!).get(target);
    expect(response.status).toBe(404);
    expect(response.headers.location).toBeUndefined();
    expect(response.headers["x-robots-tag"]).toBe("noindex,nofollow,noarchive");
    expect(response.headers.link).toBeUndefined();
  });
});
