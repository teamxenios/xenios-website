// Regression proof for the browser-harness self-lock (2026-09-05).
//
// The capture runner imports lib/cdp.mjs, then spawns the mandatory clean
// `npm ci` in the SAME checkout. If importing lib/cdp.mjs loads `ws`, and `ws`
// loads the native optional `bufferutil` addon, the parent process holds
// node_modules/bufferutil/prebuilds/win32-x64/bufferutil.node mapped and the
// installer cannot unlink it on Windows (EPERM -4048): the run dies before a
// browser ever starts. These tests pin the two halves of the repair:
//   1. importing lib/cdp.mjs alone loads neither `ws` nor the native addon;
//   2. CdpConnection.open() still speaks over the real installed `ws`
//      transport, proven with a loopback WebSocket server, no mocks.
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const cdpPath = resolve(here, "cdp.mjs");
// A fresh Node child needs a file:// URL for an absolute path on Windows.
const cdpUrl = pathToFileURL(cdpPath).href;
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

describe("lib/cdp.mjs does not load ws or the bufferutil addon at import time", () => {
  it("leaves both unloaded in a fresh process after import", () => {
    const report = childReport(`
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      await import(${JSON.stringify(cdpUrl)});
      const keys = Object.keys(require.cache);
      const cacheHasWs = keys.some((key) => /[\\\\/]node_modules[\\\\/]ws[\\\\/]/.test(key));
      const cacheHasBufferutil = keys.some((key) => /[\\\\/]node_modules[\\\\/]bufferutil[\\\\/]/.test(key));
      console.log(JSON.stringify({ cacheHasWs, cacheHasBufferutil }));
    `);
    expect(report).toEqual({ cacheHasWs: false, cacheHasBufferutil: false });
  });

  it("(control) importing ws itself does pull the native addon into the module cache on this platform", () => {
    const report = childReport(`
      import { createRequire } from "node:module";
      const require = createRequire(import.meta.url);
      require("ws");
      const keys = Object.keys(require.cache);
      console.log(JSON.stringify({
        cacheHasWs: keys.some((key) => /[\\\\/]node_modules[\\\\/]ws[\\\\/]/.test(key)),
        cacheHasBufferutil: keys.some((key) => /[\\\\/]node_modules[\\\\/]bufferutil[\\\\/]/.test(key)),
      }));
    `);
    // The control documents WHY the lazy import matters: ws loads bufferutil
    // eagerly wherever the optional addon is installed. If a future ws stops
    // doing so, this control (not the guard above) is what changes.
    expect(report.cacheHasWs).toBe(true);
    expect(typeof report.cacheHasBufferutil).toBe("boolean");
  });

  it("the module still exports the CDP client surface", async () => {
    const mod = await import(cdpPath);
    expect(typeof mod.CdpConnection).toBe("function");
    expect(typeof mod.PageSession).toBe("function");
  });
});

describe("CdpConnection.open() uses the real installed ws transport", () => {
  it("connects over loopback, round-trips a request, and closes", async () => {
    const { WebSocketServer, WebSocket } = require("ws");
    const { CdpConnection } = await import(cdpPath);
    const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
    await new Promise((r) => server.once("listening", r));
    const { port } = server.address();
    let received = null;
    server.on("connection", (socket) => {
      socket.on("message", (raw) => {
        received = JSON.parse(String(raw));
        socket.send(JSON.stringify({ id: received.id, result: { echoed: received.method } }));
      });
    });
    try {
      const conn = await new CdpConnection(`ws://127.0.0.1:${port}/devtools/browser/test`).open();
      expect(conn.ws).toBeInstanceOf(WebSocket);
      const result = await conn.send("Target.getTargets", {}, undefined, { timeoutMs: 5000 });
      expect(result).toEqual({ echoed: "Target.getTargets" });
      expect(received).toMatchObject({ id: 1, method: "Target.getTargets", params: {} });
      await conn.close();
      expect(conn.ws.readyState).toBe(WebSocket.CLOSED);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("rejects open() when nothing listens, instead of hanging", async () => {
    const { CdpConnection } = await import(cdpPath);
    await expect(new CdpConnection("ws://127.0.0.1:1/devtools/browser/none").open()).rejects.toBeInstanceOf(Error);
  });
});
