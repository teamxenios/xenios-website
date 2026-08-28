import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { carePageGate } from "./care";
import { careDocumentCsp } from "./care-document-csp";

function buildShellApp() {
  const app = express();
  app.use(careDocumentCsp);
  app.use(carePageGate);
  app.use((_req, res) => res.status(200).send("test shell"));
  return app;
}

function parseCsp(value: string | undefined): Record<string, string[]> {
  if (value === undefined) return {};

  return Object.fromEntries(
    value
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [directive, ...sources] = part.split(/\s+/u);
        return [directive, sources];
      }),
  );
}

const expectedBaseline = {
  "default-src": ["'self'"],
  "base-uri": ["'none'"],
  "object-src": ["'none'"],
  "frame-ancestors": ["'none'"],
  "form-action": ["'self'"],
  "script-src": ["'self'"],
  "script-src-attr": ["'none'"],
  "style-src": ["'self'", "'unsafe-inline'"],
  "style-src-elem": ["'self'"],
  "style-src-attr": ["'unsafe-inline'"],
  "font-src": ["'self'"],
  "img-src": ["'self'", "data:"],
  "connect-src": ["'self'"],
  "frame-src": ["'none'"],
  "worker-src": ["'self'"],
  "manifest-src": ["'self'"],
  "media-src": ["'self'"],
  "upgrade-insecure-requests": [],
};

describe("Care document baseline CSP", () => {
  it.each([
    "/care",
    "/CARE/",
    "/c%61re/schedule",
    "/care/portal?from=navigation",
  ])("applies the exact policy to canonical Care path %s", async (path) => {
    const response = await request(buildShellApp())
      .get(path)
      .set("Accept", "application/json")
      .set("Sec-Fetch-Dest", "empty");

    expect(response.status).toBe(200);
    expect(parseCsp(response.headers["content-security-policy"])).toEqual(
      expectedBaseline,
    );
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(response.text).toBe("test shell");
  });

  it.each([
    "/careers",
    "/api/care/status",
    "/care%2Fschedule",
    "/care/%ZZ",
    "/care//schedule",
    "/research",
  ])(
    "does not classify non-canonical path %s as a Care document",
    async (path) => {
      const response = await request(buildShellApp()).get(path);

      expect(response.status).toBe(200);
      expect(response.headers["content-security-policy"]).toBeUndefined();
      expect(response.headers["x-robots-tag"]).toBeUndefined();
    },
  );

  it("contains no scheduling, portal, Meta, font-CDN, wildcard, or broad script source", async () => {
    const response = await request(buildShellApp()).get("/care");
    const directives = parseCsp(response.headers["content-security-policy"]);
    const sources = Object.values(directives).flat();

    expect(sources).not.toContain("*");
    expect(sources).not.toContain("http:");
    expect(sources).not.toContain("https:");
    expect(sources).not.toContain("'unsafe-eval'");
    expect(directives["script-src"]).not.toContain("'unsafe-inline'");
    expect(directives["frame-src"]).toEqual(["'none'"]);
    expect(response.headers["content-security-policy"]).not.toMatch(
      /tebra|portal|facebook|connect\.facebook|fbcdn|fonts\.google/iu,
    );
  });

  it("is mounted before the privacy gate and both static server branches", () => {
    const indexSource = readFileSync(resolve(__dirname, "index.ts"), "utf8");
    const cspIndex = indexSource.indexOf("app.use(careDocumentCsp)");
    const privacyIndex = indexSource.indexOf("app.use(carePageGate)");
    const staticIndex = indexSource.indexOf("serveStatic(app)");
    const viteIndex = indexSource.indexOf("await setupVite(httpServer, app)");

    expect(cspIndex).toBeGreaterThan(-1);
    expect(cspIndex).toBeLessThan(privacyIndex);
    expect(privacyIndex).toBeLessThan(staticIndex);
    expect(privacyIndex).toBeLessThan(viteIndex);
  });
});
