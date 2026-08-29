import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { assertEvidenceHttpUrl } from "./capture-http-evidence.mjs";
import { launchChromium } from "./lib/chrome.mjs";
import {
  assertStableFullPageScreenshotCoverage,
  CdpConnection,
  isEvidenceBoundaryUrl,
  MAX_FULL_PAGE_HEIGHT_CSS_PX,
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
      maxHeightCssPx: MAX_FULL_PAGE_HEIGHT_CSS_PX,
    })).toThrow(/layout changed during capture/u);
  });

  it("removes an unanswered timed CDP command from the pending map", async () => {
    const connection = new CdpConnection("ws://preview.test/devtools");
    connection.ws = { send: () => {} };
    await expect(connection.send(
      "Network.getResponseBody",
      { requestId: "never-replies" },
      "session",
      { timeoutMs: 10 },
    )).rejects.toThrow(/timed out after 10ms/u);
    expect(connection.pending.size).toBe(0);
  });

  it("keeps late body telemetry from a reset generation out of the next capture", async () => {
    const pending = new Map();
    const connection = {
      send(_method, { requestId }) {
        return new Promise((resolve) => pending.set(requestId, resolve));
      },
    };
    const page = new PageSession(connection, "target", "session");
    const stale = { url: "http://preview.test/stale", status: 503 };
    page.network.push(stale);
    const staleTelemetry = page.queueErrorResponseBodyTelemetry({
      record: stale,
      requestId: "stale",
      sessionId: "session",
    });

    page.resetRecords();
    const current = { url: "http://preview.test/current", status: 503 };
    page.network.push(current);
    const currentTelemetry = page.queueErrorResponseBodyTelemetry({
      record: current,
      requestId: "current",
      sessionId: "session",
    });
    await Promise.resolve();

    pending.get("stale")({ body: "stale body", base64Encoded: false });
    await staleTelemetry;
    expect(page.errorResponseBodyTelemetry.size).toBe(1);
    expect(current).toMatchObject({ bodySha256: null, bodyBytes: null });

    pending.get("current")({ body: "current body", base64Encoded: false });
    await currentTelemetry;
    expect(page.errorResponseBodyTelemetry.size).toBe(0);
    expect(current).toMatchObject({
      bodySha256: createHash("sha256").update("current body").digest("hex"),
      bodyBytes: Buffer.byteLength("current body"),
    });
  });

  it("bounds unavailable body telemetry and leaves an explicit fail-closed result", async () => {
    const connection = { send: () => new Promise(() => {}) };
    const page = new PageSession(connection, "target", "session");
    page.errorResponseBodyTimeoutMs = 20;
    const record = { url: "http://preview.test/failure", status: 503 };
    page.network.push(record);
    page.queueErrorResponseBodyTelemetry({ record, requestId: "failure", sessionId: "session" });

    await page.waitForErrorResponseBodyTelemetry({ deadline: Date.now() + 200 });
    expect(page.errorResponseBodyTelemetry.size).toBe(0);
    expect(record).toMatchObject({ bodySha256: null, bodyBytes: null });
  });

  it("turns a malformed CDP body reply into resolved unavailable telemetry", async () => {
    const connection = { send: async () => ({ body: {}, base64Encoded: false }) };
    const page = new PageSession(connection, "target", "session");
    const record = { url: "http://preview.test/malformed", status: 503 };
    page.network.push(record);

    await page.queueErrorResponseBodyTelemetry({
      record,
      requestId: "malformed",
      sessionId: "session",
    });

    expect(page.errorResponseBodyTelemetry.size).toBe(0);
    expect(record).toMatchObject({ bodySha256: null, bodyBytes: null });
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

  it("settles exact 4xx/5xx body hashes for page and child-target requests", async () => {
    const pageFailureBody = '{"error":"page_expected_failure"}\n';
    const workerFailureBody = '{"error":"worker_expected_failure"}\n';
    const fixture = await serve((request, response) => {
      if (request.url === "/page-failure") {
        response.writeHead(418, { "Content-Type": "application/json; charset=utf-8" });
        response.end(pageFailureBody);
        return;
      }
      if (request.url === "/worker-failure") {
        response.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
        response.end(workerFailureBody);
        return;
      }
      if (request.url === "/worker.js") {
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.end(`
          fetch("/worker-failure")
            .then((result) => result.text())
            .then(() => postMessage("done"));
        `);
        return;
      }
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end(`<!doctype html><html><body><main>error telemetry</main><script>
        const pageFailure = fetch("/page-failure").then((result) => result.text());
        const workerFailure = new Promise((resolve) => {
          const worker = new Worker("/worker.js");
          worker.onmessage = resolve;
        });
        Promise.all([pageFailure, workerFailure]).then(() => {
          document.documentElement.dataset.telemetryComplete = "true";
        });
      </script></body></html>`);
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.navigate(`${fixture.origin}/`, { quietMs: 100, maxSettleMs: 5000 });
      expect(await page.evaluate("document.documentElement.dataset.telemetryComplete"))
        .toBe("true");
      expect(page.inflight.size).toBe(0);
      expect(page.errorResponseBodyTelemetry.size).toBe(0);
      expect(page.network).toContainEqual(expect.objectContaining({
        url: `${fixture.origin}/page-failure`,
        method: "GET",
        status: 418,
        bodySha256: createHash("sha256").update(pageFailureBody).digest("hex"),
        bodyBytes: Buffer.byteLength(pageFailureBody),
      }));
      expect(page.network).toContainEqual(expect.objectContaining({
        url: `${fixture.origin}/worker-failure`,
        method: "GET",
        status: 503,
        targetType: "worker-or-child",
        bodySha256: createHash("sha256").update(workerFailureBody).digest("hex"),
        bodyBytes: Buffer.byteLength(workerFailureBody),
      }));
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

  it("captures reviewed long pages beyond the old 12000px ceiling or refuses explicitly", async () => {
    const fixture = await serve((_request, response) => {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html><body style="margin:0;min-height:13822px"><main>long page</main></body></html>');
    });
    const page = await PageSession.create(connection);
    try {
      await page.enforceNetworkBoundary(fixture.origin);
      await page.setViewport({ width: 800, height: 600, deviceScaleFactor: 1 });
      await page.navigate(`${fixture.origin}/`, { quietMs: 50, maxSettleMs: 3000 });
      await expect(page.screenshot({ fullPage: true, maxHeight: 24001 }))
        .rejects.toThrow(/hard safety ceiling of 24000 CSS px/u);
      await expect(page.screenshot({ fullPage: true, maxHeight: 12000 }))
        .rejects.toThrow(/capture refused instead of truncating/u);
      const screenshot = await page.screenshot({ fullPage: true });
      expect(screenshot.coverage).toMatchObject({
        fullPage: true,
        truncated: false,
        contentHeightCssPx: 13822,
        capturedHeightPx: 13822,
        maxHeightCssPx: MAX_FULL_PAGE_HEIGHT_CSS_PX,
      });
    } finally {
      await page.close();
      await fixture.close();
    }
  }, 30000);
});
