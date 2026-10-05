import express from "express";
import { createServer, type Server } from "node:http";
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
    const app = express(), parserReached = vi.fn();
    app.use(createQuickOrderContainment());
    app.use((_req, _res, next) => { parserReached(); next(); });
    app.use(express.json({ limit: "64kb" }));
    app.use((_req, res) => res.type("html").send("unrelated fallback"));
    const server = createServer(app);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw Error("No local test port");
    return { url: `http://127.0.0.1:${address.port}`, parserReached };
  }
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
    const { url, parserReached } = await host();
    const response = await fetch(url + "/api/health/quick-order-other");
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("unrelated fallback");
    expect(parserReached).toHaveBeenCalledOnce();
  });
});
