import { describe, it, expect } from "vitest";
import express, { type Request, type Response } from "express";
import request from "supertest";
import fs from "fs";
import path from "path";

// The SPA is served by a catch-all (`app.use("/{*path}", ... sendFile index.html)`).
// Without an API 404 guard in front of it, an unknown /api path would fall through
// to that catch-all and return the SPA HTML at status 200, masking a wrong or
// removed endpoint as success. index.ts installs a JSON 404 guard for /api after
// every real route and before the SPA fallback. These tests pin that behavior.

function buildTail() {
  const app = express();
  // A representative real API route (stands in for the registered routers).
  app.get("/api/research/known", (_req: Request, res: Response) => {
    res.status(200).json({ ok: true });
  });
  // The guard exactly as index.ts installs it.
  app.use("/api/{*rest}", (_req: Request, res: Response) => {
    res.status(404).json({ message: "Not Found" });
  });
  // The SPA catch-all, matching server/static.ts serveStatic().
  app.use("/{*path}", (_req: Request, res: Response) => {
    res.status(200).type("html").send("<!doctype html><title>spa</title>");
  });
  return app;
}

describe("API 404 guard", () => {
  it("serves a real API route untouched", async () => {
    const res = await request(buildTail()).get("/api/research/known");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it("returns JSON 404 for an unknown /api path, never SPA HTML", async () => {
    const res = await request(buildTail()).get("/api/research/does-not-exist");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toMatch(/application\/json/);
    expect(res.body).toEqual({ message: "Not Found" });
    expect(res.text).not.toMatch(/<!doctype html>/i);
  });

  it("still serves the SPA for a non-API unknown path", async () => {
    const res = await request(buildTail()).get("/members/dashboard");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/html/);
    expect(res.text).toMatch(/<!doctype html>/i);
  });

  it("is wired in server/index.ts before the SPA fallback", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "index.ts"), "utf8");
    const guardIdx = src.indexOf('app.use("/api/{*rest}"');
    const serveStaticIdx = src.indexOf("serveStatic(app)");
    const viteIdx = src.indexOf("setupVite(");
    expect(guardIdx).toBeGreaterThan(-1);
    // The guard must come before both the production (serveStatic) and dev (vite)
    // SPA installers so it can never be shadowed by the catch-all.
    expect(guardIdx).toBeLessThan(serveStaticIdx);
    expect(guardIdx).toBeLessThan(viteIdx);
  });
});
