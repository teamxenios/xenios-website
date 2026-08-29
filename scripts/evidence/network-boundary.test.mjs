import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertEvidenceHttpUrl } from "./capture-http-evidence.mjs";
import { launchChromium } from "./lib/chrome.mjs";
import {
  assertStableFullPageScreenshotCoverage,
  CdpConnection,
  isEvidenceBoundaryUrl,
  PageSession,
  sleep,
} from "./lib/cdp.mjs";

const ORIGIN = "http://127.0.0.1:5184";

describe("evidence network boundary", () => {
  it("allows only the exact HTTP preview origin for raw document capture", () => {
    expect(assertEvidenceHttpUrl(`${ORIGIN}/research`, ORIGIN)).toBe(`${ORIGIN}/research`);
    expect(() => assertEvidenceHttpUrl("https://example.com/research", ORIGIN)).toThrow(/off-origin/u);
    expect(() => assertEvidenceHttpUrl("http://127.0.0.1:9999/research", ORIGIN)).toThrow(/off-origin/u);
    expect(() => assertEvidenceHttpUrl("https://127.0.0.1:5184/research", ORIGIN)).toThrow(/off-origin/u);
  });

  it("allows safe in-document URLs but rejects external and socket traffic", () => {
    expect(isEvidenceBoundaryUrl(`${ORIGIN}/assets/app.js`, ORIGIN)).toBe(true);
    expect(isEvidenceBoundaryUrl("data:image/png;base64,AA==", ORIGIN)).toBe(true);
    expect(isEvidenceBoundaryUrl(`blob:${ORIGIN}/00000000-0000-0000-0000-000000000000`, ORIGIN)).toBe(true);
    expect(isEvidenceBoundaryUrl("https://fonts.example.com/font.woff2", ORIGIN)).toBe(false);
    expect(isEvidenceBoundaryUrl("ws://127.0.0.1:5184/socket", ORIGIN)).toBe(false);
    expect(isEvidenceBoundaryUrl("not a URL", ORIGIN)).toBe(false);
  });

  it("rejects a dimension-matching bitmap if layout grew during capture", () => {
    expect(() => assertStableFullPageScreenshotCoverage({
      contentWidthCssPx: 800,
      contentHeightCssPx: 6000,
      postContentWidthCssPx: 800,
      postContentHeightCssPx: 6100,
      devicePixelRatio: 1,
      capturedWidthPx: 800,
      capturedHeightPx: 6000,
      maxHeightCssPx: 12000,
    })).toThrow(/layout changed during capture/u);
  });
});

describe("live CDP evidence boundary regressions", () => {
  let browser;
  let connection;

  beforeAll(async () => {
    browser = await launchChromium();
    connection = await new CdpConnection(browser.wsUrl).open();
  });

  afterAll(async () => {
    await connection?.close();
    await browser?.close();
  });

  const serve = async (handler) => {
    const server = createServer(handler);
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    const origin = `http://127.0.0.1:${address.port}`;
    return {
      origin,
      async close() {
        server.closeAllConnections?.();
        await new Promise((resolve) => server.close(resolve));
      },
    };
  };

  it("records dedicated-worker, SharedWorker, and service-worker egress before release", async () => {
    const fixture = await serve((request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      if (request.url === "/sw.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(`
          self.addEventListener("install", (event) => {
            event.waitUntil(fetch("https://example.com/private?token=service-worker-secret").catch(() => undefined));
            self.skipWaiting();
          });
        `);
        return;
      }
      response.end(`<!doctype html><html><body><main>boundary</main><script>
        const source = 'try { new WebSocket("wss://user:secret@example.com/socket?token=worker-secret") } catch {}';
        new Worker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
        new SharedWorker(URL.createObjectURL(new Blob([source], { type: "text/javascript" })));
        navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      </script></body></html>`);
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.navigate(`${fixture.origin}/`, { quietMs: 100, maxSettleMs: 5000 });
      for (let attempt = 0; attempt < 100 && page.networkBoundaryViolations.length < 3; attempt += 1) {
        await sleep(25);
      }
      await page.waitForBoundaryTargets();
      expect(page.networkBoundaryViolations.filter((entry) => entry.method === "WEBSOCKET").length)
        .toBeGreaterThanOrEqual(2);
      expect(page.networkBoundaryViolations.some((entry) =>
        entry.method === "GET" && entry.url.startsWith("https://example.com/private?REDACTED"),
      )).toBe(true);
      expect(JSON.stringify(page.networkBoundaryViolations)).not.toMatch(/worker-secret|service-worker-secret|user:secret/u);
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 30000);

  it("fails closed when a request never reaches network idle", async () => {
    const fixture = await serve((request, response) => {
      if (request.url === "/hang") return;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><body><script>fetch("/hang").catch(() => undefined)</script></body></html>');
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await expect(page.navigate(`${fixture.origin}/`, { quietMs: 50, maxSettleMs: 350 }))
        .rejects.toThrow(/network did not remain idle through paint/u);
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 30000);

  it("does not release a request that begins during the final paint check", async () => {
    const fixture = await serve((request, response) => {
      if (request.url === "/hang") return;
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><html><body><main>paint race</main></body></html>");
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.navigate(`${fixture.origin}/`, { quietMs: 50, maxSettleMs: 3000 });
      await page.evaluate("(setTimeout(() => fetch('/hang').catch(() => undefined), 810), true)");
      await expect(page.settle({ quietMs: 800, maxSettleMs: 2500 }))
        .rejects.toThrow(/network did not remain idle through paint/u);
      expect(page.inflight.size).toBe(1);
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 30000);

  it("blocks WebRTC/STUN before any UDP packet can leave Chromium", async () => {
    const udp = createSocket("udp4");
    let receivedPackets = 0;
    udp.on("message", () => { receivedPackets += 1; });
    await new Promise((resolve, reject) => {
      udp.once("error", reject);
      udp.bind(0, "127.0.0.1", resolve);
    });
    const udpPort = udp.address().port;
    const fixture = await serve((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><html><body><main>webrtc boundary</main></body></html>");
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.navigate(`${fixture.origin}/`, { quietMs: 50, maxSettleMs: 3000 });
      const outcome = await page.evaluate(`(() => {
        try {
          const peer = new RTCPeerConnection({
            iceServers: [{ urls: "stun:127.0.0.1:${udpPort}" }],
          });
          peer.createDataChannel("evidence");
          return "CONSTRUCTED";
        } catch (error) {
          return String(error && error.name || "ERROR");
        }
      })()`);
      await sleep(250);
      await page.waitForBoundaryTargets();
      expect(outcome).toBe("SecurityError");
      expect(receivedPackets).toBe(0);
      expect(page.networkBoundaryViolations).toContainEqual(expect.objectContaining({
        url: "webrtc://blocked",
        method: "WEBRTC",
        resourceType: "WebRTC",
        reason: "RTCPeerConnection blocked before native construction",
      }));
    } finally {
      await page.close();
      await fixture.close();
      await new Promise((resolve) => udp.close(resolve));
    }
  }, 30000);

  it("captures all content beyond the old 6000px cutoff or refuses explicitly", async () => {
    const fixture = await serve((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><body style="margin:0;min-height:6101px"><main>long page</main></body></html>');
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
      await page.navigate(`${fixture.origin}/`, { quietMs: 50, maxSettleMs: 3000 });
      await expect(page.screenshot({ fullPage: true, maxHeight: 6000 }))
        .rejects.toThrow(/capture refused instead of truncating/u);
      const screenshot = await page.screenshot({ fullPage: true, maxHeight: 12000 });
      expect(screenshot.coverage).toMatchObject({
        fullPage: true,
        truncated: false,
        contentHeightCssPx: 6101,
        capturedHeightPx: 6101,
      });
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 30000);
});
