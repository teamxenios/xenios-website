import express from "express";
import { createServer, request as httpRequest, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createQuickOrderContainment } from "./containment";

// A real HTTP request through a small Express composition. This does not prove
// the protected application mount, which remains an unapplied proposal.
describe("Quick Order default-off raw boundary", () => {
  const servers: Server[] = [];
  afterEach(async () => {
    await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => {
      server.closeAllConnections();
      server.close(() => resolve());
    })));
  });
  async function host() {
    const app = express(), parserReached = vi.fn(), verifierReached = vi.fn();
    const observations: { originalUrl: string; effectiveUrl: string; parsed: boolean; retained: boolean }[] = [];
    // Same root order and normalization as server/index.ts. Express preserves
    // originalUrl across the rewrite; downstream routing uses the effective url.
    app.use((req, _res, next) => {
      if (req.url.startsWith("//")) req.url = req.url.replace(/^\/{2,}/, "/");
      next();
    });
    app.use((req, res, next) => {
      res.once("finish", () => observations.push({ originalUrl: req.originalUrl, effectiveUrl: req.url,
        parsed: req.body !== undefined, retained: (req as express.Request & { rawBody?: unknown }).rawBody !== undefined }));
      next();
    });
    app.use(createQuickOrderContainment());
    app.use((_req, _res, next) => { parserReached(); next(); });
    app.use(express.json({ limit: "2mb", verify: (req, _res, bytes) => {
      verifierReached(); (req as typeof req & { rawBody?: unknown }).rawBody = bytes;
    } }));
    app.use((_req, res) => res.type("html").send("unrelated fallback"));
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No local test port");
    return { url: `http://127.0.0.1:${address.port}`, parserReached, verifierReached, observations };
  }
  async function rawPost(url: string, path: string) {
    const local = new URL(url);
    // Never let fetch normalize the target before it reaches this boundary.
    // Absolute-form targets still go to the same loopback socket destination.
    return new Promise<{ status: number | undefined; body: string; headers: import("node:http").IncomingHttpHeaders }>((resolve, reject) => {
      const request = httpRequest({ hostname: local.hostname, port: local.port, path, method: "POST",
        headers: { "Content-Type": "application/json" } }, incoming => {
        let body = ""; incoming.setEncoding("utf8");
        incoming.on("data", chunk => { body += chunk; });
        incoming.on("end", () => resolve({ status: incoming.statusCode, body, headers: incoming.headers }));
        incoming.on("error", reject);
      });
      request.on("error", reject); request.end('{"synthetic":"raw-target"}');
    });
  }
  it.each([
    "/api/health/quick-order", "/api/health/quick-order?source=test",
    "/API/HEALTH/QUICK-ORDER/requests", "/Api/Health/Quick-Order/requests",
    "/api/health/x/../quick-order/requests", "/api/health/x/%2e%2e/quick-order/requests",
    "/api/health/./quick-order/requests", "/api/health/%2E/quick-order/requests",
    "/api/health/quick-order\\requests", "/api\\health\\quick-order\\requests",
    "//api/health/quick-order/requests", "////api/health/quick-order/requests?source=test",
    "/api//health/quick-order/requests", "/api/health/quick-order//requests",
    "/api/health/quick-order%2Frequests", "/api%2Fhealth%2Fquick-order/requests",
    "/api/health/quick-order%5crequests",
    "/api/health/quick-order/../other", "/api/health/quick-order/%2e%2e/other",
    "http://quick-order.invalid/api/health/quick-order/requests",
    "http:////quick-order.invalid/api/health/quick-order/requests",
    "http:////quick-order.invalid/api/health/quick-order/../other",
    "https://quick-order.invalid/api/health/x/../quick-order/requests",
    "http://quick-order.invalid/api/health/quick-order/../other",
    "/api/health/quick-order#routing-suffix",
  ])("refuses owned raw target %s before any parser or rawBody verifier", async path => {
    const { url, parserReached, verifierReached, observations } = await host();
    const response = await rawPost(url, path);
    expect(response.status).toBe(503);
    expect(response.headers["cache-control"]).toBe("no-store, private");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    expect(JSON.parse(response.body)).toEqual({ code: "feature_disabled", message: "Quick Order is not available for customer requests yet." });
    expect(parserReached).not.toHaveBeenCalled();
    expect(verifierReached).not.toHaveBeenCalled();
    expect(observations).toEqual([{ originalUrl: path, effectiveUrl: path.replace(/^\/{2,}/, "/"), parsed: false, retained: false }]);
  });
  it.each([
    "//other", "/api/health/quick-order-other", "/API/HEALTH/QUICK-ORDER-other",
    "/api/health/x/../other", "/api/health/x/%2e%2e/other", "/api/health/other\\requests",
    "/api/health/other%2Frequests", "/api/health/other/%ZZ",
    "http://quick-order.invalid/other",
    "/other?next=/api/health/quick-order/requests",
    "//external.invalid/api/health/quick-order/requests",
  ])("leaves unrelated raw target %s to the host parser", async path => {
    const { url, parserReached, verifierReached, observations } = await host();
    const response = await rawPost(url, path);
    expect(response.status).toBe(200);
    expect(response.body).toBe("unrelated fallback");
    expect(parserReached).toHaveBeenCalledOnce();
    expect(verifierReached).toHaveBeenCalledOnce();
    expect(observations).toEqual([{ originalUrl: path, effectiveUrl: path.replace(/^\/{2,}/, "/"), parsed: true, retained: true }]);
  });
  it.each(["/api/health/quick-order", "/api/health/quick-order/config", "/api/health/quick-order/requests?source=test"])("returns private disabled JSON for %s", async path => {
    const { url, parserReached } = await host();
    const response = await fetch(url + path);
    expect(response.status).toBe(503);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(await response.json()).toEqual({ code: "feature_disabled", message: "Quick Order is not available for customer requests yet." });
    expect(parserReached).not.toHaveBeenCalled();
  });
  it.each(["//api/health/quick-order", "//api/health/quick-order/requests", "////api/health/quick-order/requests?source=test"])("terminates normalized %s before parsing or rawBody retention", async path => {
    const { url, parserReached, verifierReached, observations } = await host();
    const response = await fetch(url + path, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"synthetic":"boundary-test"}',
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store, private");
    expect(await response.json()).toMatchObject({ code: "feature_disabled" });
    expect(parserReached).not.toHaveBeenCalled();
    expect(verifierReached).not.toHaveBeenCalled();
    expect(observations).toEqual([{ originalUrl: path, effectiveUrl: path.replace(/^\/{2,}/, "/"), parsed: false, retained: false }]);
  });
  it.each(["http://quick-order.invalid/api/health/quick-order/requests?source=test", "/api/health/quick-order#routing-suffix"])("uses Express pathname semantics for the raw target %s", async path => {
    const { url, parserReached, verifierReached, observations } = await host();
    const local = new URL(url);
    // fetch would normalize these before sending. The socket destination stays
    // loopback; only the HTTP request-target is supplied in absolute/raw form.
    const response = await new Promise<{ status: number | undefined; body: string }>((resolve, reject) => {
      const request = httpRequest({ hostname: local.hostname, port: local.port, path, method: "POST",
        headers: { "Content-Type": "application/json" } }, incoming => {
        let body = ""; incoming.setEncoding("utf8");
        incoming.on("data", chunk => { body += chunk; });
        incoming.on("end", () => resolve({ status: incoming.statusCode, body }));
        incoming.on("error", reject);
      });
      request.on("error", reject); request.end('{"synthetic":"raw-target"}');
    });
    expect(response.status).toBe(503);
    expect(JSON.parse(response.body)).toMatchObject({ code: "feature_disabled" });
    expect(parserReached).not.toHaveBeenCalled();
    expect(verifierReached).not.toHaveBeenCalled();
    expect(observations).toEqual([{ originalUrl: path, effectiveUrl: path, parsed: false, retained: false }]);
  });
  it("does not parse an oversized malformed body or reach fallback", async () => {
    const { url, parserReached } = await host();
    const response = await fetch(url + "/api/health/quick-order/requests", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: "{" + " ".repeat(70_000),
    });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "feature_disabled" });
    expect(parserReached).not.toHaveBeenCalled();
  });
  it("does not capture a neighboring route", async () => {
    const { url, parserReached, verifierReached, observations } = await host();
    const response = await fetch(url + "//api/health/quick-order-other", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: '{"synthetic":"unrelated"}',
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("unrelated fallback");
    expect(parserReached).toHaveBeenCalledOnce();
    expect(verifierReached).toHaveBeenCalledOnce();
    expect(observations).toEqual([{ originalUrl: "//api/health/quick-order-other", effectiveUrl: "/api/health/quick-order-other", parsed: true, retained: true }]);
  });
});
