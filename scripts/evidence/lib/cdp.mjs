// Minimal Chrome DevTools Protocol client on top of `ws` (flat session mode).
import { createHash } from "node:crypto";
import WebSocket from "ws";

export class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map(); // key: `${sessionId ?? ""}|${method}`
  }

  async open() {
    this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => this.onMessage(JSON.parse(String(raw))));
    this.ws.on("close", () => {
      for (const [, p] of this.pending) p.reject(new Error("CDP connection closed"));
      this.pending.clear();
    });
    return this;
  }

  onMessage(msg) {
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result ?? {});
      return;
    }
    const key = `${msg.sessionId ?? ""}|${msg.method}`;
    for (const fn of this.listeners.get(key) ?? []) fn(msg.params ?? {});
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  on(method, fn, sessionId) {
    const key = `${sessionId ?? ""}|${method}`;
    if (!this.listeners.has(key)) this.listeners.set(key, new Set());
    this.listeners.get(key).add(fn);
    return () => this.listeners.get(key)?.delete(fn);
  }

  async close() {
    await new Promise((r) => {
      this.ws.once("close", r);
      this.ws.close();
      setTimeout(r, 500);
    });
  }
}

/** A page session: one target, one sessionId, console/network bookkeeping. */
export class PageSession {
  constructor(conn, targetId, sessionId) {
    this.conn = conn;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.console = [];
    this.network = [];
    this.inflight = new Map();
    this.loaded = false;
    this.unsubscribe = [];
  }

  static async create(conn) {
    const { targetId } = await conn.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await conn.send("Target.attachToTarget", { targetId, flatten: true });
    const page = new PageSession(conn, targetId, sessionId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Log.enable");
    await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
    page.unsubscribe.push(
      conn.on(
        "Runtime.consoleAPICalled",
        (p) => {
          if (["error", "warning", "assert"].includes(p.type)) {
            page.console.push({ level: p.type, text: p.args.map(argText).join(" ").slice(0, 500) });
          }
        },
        sessionId,
      ),
      conn.on(
        "Runtime.exceptionThrown",
        (p) => {
          page.console.push({
            level: "exception",
            text: String(p.exceptionDetails?.exception?.description ?? p.exceptionDetails?.text ?? "").slice(0, 500),
          });
        },
        sessionId,
      ),
      conn.on(
        "Log.entryAdded",
        (p) => {
          if (p.entry?.level === "error" || p.entry?.level === "warning") {
            page.console.push({ level: `log:${p.entry.level}`, text: String(p.entry.text).slice(0, 500), url: p.entry.url });
          }
        },
        sessionId,
      ),
      conn.on(
        "Network.requestWillBeSent",
        (p) => {
          page.inflight.set(p.requestId, { url: p.request.url, method: p.request.method, type: p.type });
        },
        sessionId,
      ),
      conn.on(
        "Network.responseReceived",
        (p) => {
          const req = page.inflight.get(p.requestId);
          const record = { url: p.response.url, status: p.response.status, type: p.type, method: req?.method ?? "GET" };
          page.network.push(record);
          if (req) req.responseRecord = record;
        },
        sessionId,
      ),
      conn.on(
        "Network.loadingFinished",
        (p) => {
          const req = page.inflight.get(p.requestId);
          const record = req?.responseRecord;
          if (!record || record.status < 400) {
            page.inflight.delete(p.requestId);
            return;
          }
          page.send("Network.getResponseBody", { requestId: p.requestId })
            .then(({ body = "", base64Encoded = false }) => {
              const bytes = base64Encoded ? Buffer.from(body, "base64") : Buffer.from(body, "utf8");
              record.bodySha256 = createHash("sha256").update(bytes).digest("hex");
              record.bodyBytes = bytes.length;
            })
            .catch(() => {
              record.bodySha256 = null;
              record.bodyBytes = null;
            })
            .finally(() => page.inflight.delete(p.requestId));
        },
        sessionId,
      ),
      conn.on(
        "Network.loadingFailed",
        (p) => {
          const req = page.inflight.get(p.requestId);
          page.inflight.delete(p.requestId);
          page.network.push({
            url: req?.url ?? "",
            status: 0,
            type: p.type,
            failed: true,
            error: p.errorText,
            canceled: Boolean(p.canceled),
          });
        },
        sessionId,
      ),
      conn.on("Page.loadEventFired", () => (page.loaded = true), sessionId),
    );
    return page;
  }

  send(method, params = {}) {
    return this.conn.send(method, params, this.sessionId);
  }

  resetRecords() {
    this.console = [];
    this.network = [];
    this.inflight.clear();
    this.loaded = false;
  }

  async setViewport({ width, height, deviceScaleFactor = 1, mobile = false }) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor,
      mobile,
      screenWidth: width,
      screenHeight: height,
    });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile });
  }

  async setMedia({ reducedMotion = false, forcedColors = false, colorScheme = "light" } = {}) {
    await this.send("Emulation.setEmulatedMedia", {
      features: [
        { name: "prefers-reduced-motion", value: reducedMotion ? "reduce" : "no-preference" },
        { name: "forced-colors", value: forcedColors ? "active" : "none" },
        { name: "prefers-color-scheme", value: colorScheme },
      ],
    });
  }

  async navigate(url, { loadTimeoutMs = 30000, quietMs = 800, maxSettleMs = 8000 } = {}) {
    this.resetRecords();
    const started = Date.now();
    const nav = await this.send("Page.navigate", { url });
    if (nav.errorText) throw new Error(`navigate ${url}: ${nav.errorText}`);
    while (!this.loaded && Date.now() - started < loadTimeoutMs) await sleep(25);
    if (!this.loaded) throw new Error(`navigate ${url}: load event not fired within ${loadTimeoutMs} ms`);
    await this.settle({ quietMs, maxSettleMs });
    return { navigationMs: Date.now() - started, frameId: nav.frameId };
  }

  /** Wait until no request has been in flight for quietMs (bounded), then one painted frame. */
  async settle({ quietMs = 800, maxSettleMs = 8000 } = {}) {
    const settleStart = Date.now();
    let quietSince = Date.now();
    while (Date.now() - settleStart < maxSettleMs) {
      if (this.inflight.size === 0) {
        if (Date.now() - quietSince >= quietMs) break;
      } else {
        quietSince = Date.now();
      }
      await sleep(25);
    }
    await this.evaluate("new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))");
  }

  async evaluate(expression, { awaitPromise = true } = {}) {
    const res = await this.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise });
    if (res.exceptionDetails) {
      throw new Error(`evaluate: ${res.exceptionDetails.exception?.description ?? res.exceptionDetails.text}`);
    }
    return res.result?.value;
  }

  async pressTab({ shift = false } = {}) {
    const modifiers = shift ? 8 : 0;
    await this.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers });
    await this.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9, modifiers });
  }

  async screenshot({ fullPage = true, maxHeight = 6000 } = {}) {
    if (!fullPage) {
      const { data } = await this.send("Page.captureScreenshot", { format: "png" });
      return Buffer.from(data, "base64");
    }
    const metrics = await this.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.ceil(size.width);
    const height = Math.max(1, Math.min(Math.ceil(size.height), maxHeight));
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    return Buffer.from(data, "base64");
  }

  async close() {
    for (const off of this.unsubscribe) off();
    try {
      await this.conn.send("Target.closeTarget", { targetId: this.targetId });
    } catch {}
  }
}

function argText(a) {
  if (a.value !== undefined) return typeof a.value === "string" ? a.value : JSON.stringify(a.value);
  return a.description ?? a.type;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
