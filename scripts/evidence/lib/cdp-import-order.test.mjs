// Regression proof for the browser-harness self-lock (2026-09-05).
//
// The synthetic capture runner imports this CDP helper before it spawns the
// mandatory clean `npm ci` in the same checkout. Importing `ws` at module
// scope can load the optional native `bufferutil` addon and keep its Windows
// binary mapped, preventing npm from replacing it. These tests prove both
// sides of the repair without mocks:
//   1. importing the complete capture-runner graph loads neither dependency;
//   2. CdpConnection.open() still uses the real installed WebSocket transport.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, test } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cdpUrl = pathToFileURL(resolve(here, "cdp.mjs")).href;
const captureRunnerUrl = pathToFileURL(resolve(here, "..", "capture-synthetic-journeys.mjs")).href;
const require = createRequire(import.meta.url);

function childReport(script) {
  return JSON.parse(
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, WS_NO_BUFFER_UTIL: "" },
      timeout: 30_000,
    }).trim(),
  );
}

function importCacheReport(moduleUrl) {
  return childReport(`
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    await import(${JSON.stringify(moduleUrl)});
    const keys = Object.keys(require.cache);
    console.log(JSON.stringify({
      cacheHasWs: keys.some((key) => /[\\\\/]node_modules[\\\\/]ws[\\\\/]/.test(key)),
      cacheHasBufferutil: keys.some((key) => /[\\\\/]node_modules[\\\\/]bufferutil[\\\\/]/.test(key)),
      cacheHasBufferutilNative: keys.some((key) => /[\\\\/]bufferutil[\\\\/].*\\.node$/i.test(key)),
      cacheHasEsbuild: keys.some((key) => /[\\\\/]node_modules[\\\\/](?:@esbuild[\\\\/]|esbuild[\\\\/])/.test(key)),
    }));
  `);
}

test("importing the complete synthetic-capture graph leaves native tooling unloaded", () => {
  expect(importCacheReport(captureRunnerUrl)).toEqual({
    cacheHasWs: false,
    cacheHasBufferutil: false,
    cacheHasBufferutilNative: false,
    cacheHasEsbuild: false,
  });
});

test("importing the CDP helper alone leaves ws and bufferutil unloaded", () => {
  expect(importCacheReport(cdpUrl)).toEqual({
    cacheHasWs: false,
    cacheHasBufferutil: false,
    cacheHasBufferutilNative: false,
    cacheHasEsbuild: false,
  });
});

test("control: loading ws reaches the installed native bufferutil addon", () => {
  const report = childReport(`
    import { createRequire } from "node:module";
    const require = createRequire(import.meta.url);
    let bufferutilInstalled = true;
    try { require.resolve("bufferutil"); } catch { bufferutilInstalled = false; }
    require("ws");
    const keys = Object.keys(require.cache);
    console.log(JSON.stringify({
      bufferutilInstalled,
      cacheHasWs: keys.some((key) => /[\\\\/]node_modules[\\\\/]ws[\\\\/]/.test(key)),
      cacheHasBufferutil: keys.some((key) => /[\\\\/]node_modules[\\\\/]bufferutil[\\\\/]/.test(key)),
      cacheHasBufferutilNative: keys.some((key) => /[\\\\/]bufferutil[\\\\/].*\\.node$/i.test(key)),
    }));
  `);

  expect(report.cacheHasWs).toBe(true);
  if (report.bufferutilInstalled) {
    expect(report.cacheHasBufferutil).toBe(true);
    expect(report.cacheHasBufferutilNative).toBe(true);
  }
});

test("CdpConnection.open uses real ws for a loopback request and clean close", async () => {
  const { WebSocket, WebSocketServer } = require("ws");
  const { CdpConnection } = await import(cdpUrl);
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise((resolveListening) => server.once("listening", resolveListening));
  const address = server.address();
  expect(address).not.toBeNull();
  const port = typeof address === "object" ? address.port : null;
  expect(typeof port).toBe("number");

  let received = null;
  let connection = null;
  server.on("connection", (socket) => {
    socket.on("message", (raw) => {
      received = JSON.parse(String(raw));
      socket.send(JSON.stringify({ id: received.id, result: { echoed: received.method } }));
    });
  });

  try {
    connection = await new CdpConnection(`ws://127.0.0.1:${port}/devtools/browser/test`).open();
    expect(connection.ws).toBeInstanceOf(WebSocket);
    const result = await connection.send("Target.getTargets", {}, undefined, { timeoutMs: 5_000 });
    expect(result).toEqual({ echoed: "Target.getTargets" });
    expect(received).toEqual({ id: 1, method: "Target.getTargets", params: {} });
    await connection.close();
    expect(connection.ws.readyState).toBe(WebSocket.CLOSED);
    connection = null;
  } finally {
    if (connection?.ws && connection.ws.readyState !== WebSocket.CLOSED) {
      await connection.close();
    }
    await new Promise((resolveClosed) => server.close(resolveClosed));
  }
});

test("CdpConnection.open rejects a refused loopback connection", async () => {
  const { CdpConnection } = await import(cdpUrl);
  await expect(
    new CdpConnection("ws://127.0.0.1:1/devtools/browser/none").open(),
  ).rejects.toBeInstanceOf(Error);
});
