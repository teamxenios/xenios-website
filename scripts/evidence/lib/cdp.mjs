// Minimal Chrome DevTools Protocol client on top of `ws` (flat session mode).
import { createHash } from "node:crypto";

export class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map(); // key: `${sessionId ?? ""}|${method}`
  }

  async open() {
    // `ws` is loaded here, not at module scope: importing it can load the
    // native `bufferutil` addon, and a parent process that holds that addon
    // makes the clean `npm ci` it later spawns in the same checkout fail on
    // Windows (EPERM unlinking bufferutil.node). Deferring the import to the
    // first real connection keeps the exact ws transport and lets the clean
    // install/build finish before any native module is mapped from the tree.
    const { default: WebSocket } = await import("ws");
    this.ws = new WebSocket(this.wsUrl, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    this.ws.on("message", (raw) => this.onMessage(JSON.parse(String(raw))));
    this.ws.on("close", () => {
      for (const [, p] of this.pending) {
        clearTimeout(p.timeout);
        p.reject(new Error("CDP connection closed"));
      }
      this.pending.clear();
    });
    return this;
  }

  onMessage(msg) {
    if (msg.id !== undefined) {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timeout);
      if (msg.error) p.reject(new Error(`${p.method}: ${msg.error.message}`));
      else p.resolve(msg.result ?? {});
      return;
    }
    const key = `${msg.sessionId ?? ""}|${msg.method}`;
    for (const fn of this.listeners.get(key) ?? []) fn(msg.params ?? {});
  }

  send(method, params = {}, sessionId, { timeoutMs } = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = Number.isFinite(timeoutMs) && timeoutMs > 0
        ? setTimeout(() => {
            const pending = this.pending.get(id);
            if (!pending) return;
            this.pending.delete(id);
            pending.reject(new Error(`${method}: timed out after ${timeoutMs}ms`));
          }, timeoutMs)
        : null;
      this.pending.set(id, { resolve, reject, method, timeout });
      try {
        this.ws.send(JSON.stringify({ id, method, params, sessionId }), (error) => {
          if (!error) return;
          const pending = this.pending.get(id);
          if (!pending) return;
          this.pending.delete(id);
          clearTimeout(pending.timeout);
          pending.reject(error);
        });
      } catch (error) {
        this.pending.delete(id);
        clearTimeout(timeout);
        reject(error);
      }
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

/** Reviewed ceiling that prevents an accidental unbounded bitmap capture. */
export const MAX_FULL_PAGE_HEIGHT_CSS_PX = 24000;

/**
 * Error-response bodies are audit telemetry, not active network requests. CDP
 * occasionally fails to answer Network.getResponseBody, so every read must
 * resolve to either an exact hash or an explicit unavailable value promptly.
 */
const ERROR_RESPONSE_BODY_TIMEOUT_MS = 2000;

// Chromium can restart a controlling service worker while a main-frame
// navigation is loading. In that narrow transition, CDP can strand the old
// loader's requestWillBeSent entries even after the current loader completes
// exact replacements through the new worker. Never release an entry without
// a completed, current-loader replacement and a tightly bounded transition.
const SERVICE_WORKER_RESTART_SUPERSESSION_MS = 1000;
const SERVICE_WORKER_RESTART_RESOURCE_TYPES = new Set(["Other", "Script", "Stylesheet"]);

/** A page session: one target, one sessionId, console/network bookkeeping. */
export class PageSession {
  constructor(conn, targetId, sessionId) {
    this.conn = conn;
    this.targetId = targetId;
    this.sessionId = sessionId;
    this.console = [];
    this.network = [];
    this.networkBoundaryOrigin = null;
    this.networkBoundaryViolations = [];
    this.networkBoundaryFulfillments = [];
    this.inflight = new Map();
    this.recordsGeneration = 0;
    this.errorResponseBodyTelemetry = new Set();
    this.errorResponseBodyTimeoutMs = ERROR_RESPONSE_BODY_TIMEOUT_MS;
    this.boundarySessionIds = new Set();
    this.boundaryTelemetrySessionIds = new Set();
    this.boundaryTargetPromises = new Set();
    this.boundarySetupErrors = [];
    this.boundaryConfiguration = null;
    this.mainFrameId = null;
    this.currentMainFrameLoaderId = null;
    this.mainFrameLoaderTransition = null;
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
    // Evidence must observe the candidate's network behavior, not Chromium's
    // timing-dependent HTTP cache revalidation. In particular, a stale-while-
    // revalidate response can create an `Other` request that CDP never closes.
    // This does not disable Cache Storage or service-worker lifecycle coverage.
    await page.send("Network.setCacheDisabled", { cacheDisabled: true });
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
          // Worker bootstrap blob scripts are reported once on the page target
          // without a matching completion and again on the auto-attached worker
          // target, where they are audited. Ignore only the incomplete duplicate.
          if (
            p.type === "Script" &&
            (/^blob:/u.test(p.request.url) || !p.loaderId)
          ) return;
          page.inflight.set(p.requestId, {
            url: p.request.url,
            method: p.request.method,
            type: p.type,
            frameId: p.frameId ?? null,
            loaderId: p.loaderId ?? null,
            initiatorType: p.initiator?.type ?? null,
            observedAtMs: Date.now(),
            generation: page.recordsGeneration,
            sessionId,
          });
        },
        sessionId,
      ),
      conn.on(
        "Network.responseReceived",
        (p) => {
          const req = page.inflight.get(p.requestId);
          const record = { url: p.response.url, status: p.response.status, type: p.type, method: req?.method ?? "GET" };
          page.network.push(record);
          if (req) {
            req.responseRecord = record;
            req.responseFromServiceWorker = p.response.fromServiceWorker === true;
          }
        },
        sessionId,
      ),
      conn.on(
        "Network.loadingFinished",
        (p) => {
          const req = page.inflight.get(p.requestId);
          const record = req?.responseRecord;
          // loadingFinished is authoritative for network idleness. Reading an
          // error body is a separate, bounded audit operation and must never
          // manufacture a still-in-flight request after HTTP completion.
          page.inflight.delete(p.requestId);
          page.reconcileSupersededServiceWorkerRestartRequest(req);
          if (record?.status >= 400) {
            page.queueErrorResponseBodyTelemetry({
              record,
              requestId: p.requestId,
              sessionId,
            });
          }
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
      conn.on("Page.frameNavigated", (p) => page.recordMainFrameNavigation(p.frame), sessionId),
      conn.on("Page.loadEventFired", () => (page.loaded = true), sessionId),
    );
    return page;
  }

  send(method, params = {}) {
    return this.conn.send(method, params, this.sessionId);
  }

  recordMainFrameNavigation(frame) {
    if (!frame?.id || frame.parentId || !frame.loaderId) return;
    const observedAtMs = Date.now();
    const previousLoaderId = this.currentMainFrameLoaderId;
    if (
      this.mainFrameId === frame.id &&
      previousLoaderId &&
      previousLoaderId !== frame.loaderId
    ) {
      this.mainFrameLoaderTransition = Object.freeze({
        frameId: frame.id,
        previousLoaderId,
        currentLoaderId: frame.loaderId,
        observedAtMs,
        generation: this.recordsGeneration,
      });
    } else if (this.mainFrameId !== frame.id || previousLoaderId !== frame.loaderId) {
      this.mainFrameLoaderTransition = null;
    }
    this.mainFrameId = frame.id;
    this.currentMainFrameLoaderId = frame.loaderId;
  }

  reconcileSupersededServiceWorkerRestartRequest(completedRequest) {
    const transition = this.mainFrameLoaderTransition;
    const record = completedRequest?.responseRecord;
    if (
      !transition ||
      !completedRequest ||
      completedRequest.generation !== this.recordsGeneration ||
      transition.generation !== this.recordsGeneration ||
      completedRequest.sessionId !== this.sessionId ||
      completedRequest.method !== "GET" ||
      !SERVICE_WORKER_RESTART_RESOURCE_TYPES.has(completedRequest.type) ||
      !completedRequest.frameId ||
      completedRequest.frameId !== transition.frameId ||
      completedRequest.loaderId !== transition.currentLoaderId ||
      this.currentMainFrameLoaderId !== transition.currentLoaderId ||
      !completedRequest.initiatorType ||
      completedRequest.responseFromServiceWorker !== true ||
      record?.status !== 200 ||
      !Number.isFinite(completedRequest.observedAtMs) ||
      completedRequest.observedAtMs < transition.observedAtMs
    ) return 0;

    const candidates = [...this.inflight.entries()].filter(([, candidate]) => (
      candidate.generation === this.recordsGeneration &&
      candidate.sessionId === this.sessionId &&
      candidate.method === completedRequest.method &&
      candidate.url === completedRequest.url &&
      candidate.type === completedRequest.type &&
      candidate.frameId === transition.frameId &&
      candidate.loaderId === transition.previousLoaderId &&
      candidate.initiatorType === completedRequest.initiatorType &&
      !candidate.responseRecord &&
      Number.isFinite(candidate.observedAtMs) &&
      candidate.observedAtMs <= transition.observedAtMs &&
      completedRequest.observedAtMs - candidate.observedAtMs <=
        SERVICE_WORKER_RESTART_SUPERSESSION_MS
    ));
    if (candidates.length !== 1) return 0;
    this.inflight.delete(candidates[0][0]);
    return 1;
  }

  resetRecords() {
    this.recordsGeneration += 1;
    for (const telemetry of this.errorResponseBodyTelemetry) telemetry.cancel();
    this.errorResponseBodyTelemetry = new Set();
    this.console = [];
    this.network = [];
    this.networkBoundaryViolations = [];
    this.networkBoundaryFulfillments = [];
    this.inflight.clear();
    this.mainFrameLoaderTransition = null;
    this.loaded = false;
  }

  /**
   * Queue an exact error-response body digest without extending network idle.
   * A reset cancels the generation locally; the underlying CDP reply may still
   * arrive, but it can no longer mutate or drain the next capture's records.
   */
  queueErrorResponseBodyTelemetry({ record, requestId, sessionId }) {
    record.bodySha256 = null;
    record.bodyBytes = null;

    const generation = this.recordsGeneration;
    const telemetrySet = this.errorResponseBodyTelemetry;
    let resolveTelemetry;
    const telemetry = {
      generation,
      record,
      settled: false,
      timeout: null,
      promise: new Promise((resolve) => { resolveTelemetry = resolve; }),
      cancel: null,
    };
    const finish = (result, writeResult = true) => {
      if (telemetry.settled) return;
      telemetry.settled = true;
      clearTimeout(telemetry.timeout);
      telemetrySet.delete(telemetry);
      try {
        if (
          writeResult &&
          generation === this.recordsGeneration &&
          telemetrySet === this.errorResponseBodyTelemetry &&
          this.network.includes(record) &&
          result
        ) {
          const { body = "", base64Encoded = false } = result;
          const bytes = base64Encoded ? Buffer.from(body, "base64") : Buffer.from(body, "utf8");
          record.bodySha256 = createHash("sha256").update(bytes).digest("hex");
          record.bodyBytes = bytes.length;
        }
      } catch {
        // A malformed CDP reply is unavailable telemetry, never an unhandled
        // rejection or a promise that can strand the capture.
        record.bodySha256 = null;
        record.bodyBytes = null;
      } finally {
        resolveTelemetry();
      }
    };
    telemetry.cancel = () => finish(null, false);
    telemetrySet.add(telemetry);
    telemetry.timeout = setTimeout(() => finish(null), this.errorResponseBodyTimeoutMs);

    // Promise.resolve().then(...) also converts a synchronous test-double or
    // connection failure into the same fail-closed unavailable result.
    void Promise.resolve()
      .then(() => this.conn.send(
        "Network.getResponseBody",
        { requestId },
        sessionId,
        { timeoutMs: this.errorResponseBodyTimeoutMs },
      ))
      .then((result) => finish(result), () => finish(null));
    return telemetry.promise;
  }

  /** Finish all body telemetry for this capture by the settle deadline. */
  async waitForErrorResponseBodyTelemetry({ deadline }) {
    while (this.errorResponseBodyTelemetry.size > 0) {
      const generation = this.recordsGeneration;
      const pending = [...this.errorResponseBodyTelemetry]
        .filter((telemetry) => telemetry.generation === generation);
      if (pending.length === 0) return;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) {
        for (const telemetry of pending) telemetry.cancel();
        return;
      }
      let deadlineTimer;
      await Promise.race([
        Promise.all(pending.map((telemetry) => telemetry.promise)),
        new Promise((resolve) => {
          deadlineTimer = setTimeout(resolve, remainingMs);
        }),
      ]);
      clearTimeout(deadlineTimer);
      if (Date.now() >= deadline) {
        for (const telemetry of [...this.errorResponseBodyTelemetry]) {
          if (telemetry.generation === generation) telemetry.cancel();
        }
        return;
      }
    }
  }

  /**
   * Fail closed before page HTTP(S) traffic can leave the declared preview
   * origin. WebSockets are disabled entirely: the evidence proxy has no
   * upgrade path and a capture must never discover a production socket.
   */
  async enforceNetworkBoundary(origin, options = {}) {
    const { fulfillments = [] } = options;
    const allowedOrigin = new URL(origin).origin;
    const allowedOrigins = new Set(
      [...(options.allowedOrigins ?? [allowedOrigin])].map((value) => new URL(value).origin),
    );
    allowedOrigins.add(allowedOrigin);
    const allowedWebSocketOrigins = new Set(
      [...(options.allowedWebSocketOrigins ?? [])].map((value) => new URL(value).origin),
    );
    const signature = JSON.stringify({
      allowedOrigins: [...allowedOrigins].sort(),
      allowedWebSocketOrigins: [...allowedWebSocketOrigins].sort(),
    });
    if (this.boundaryConfiguration && this.boundaryConfiguration.signature !== signature) {
      throw new Error("network boundary is already fixed to a different origin policy");
    }
    if (this.boundaryConfiguration) return;
    this.networkBoundaryOrigin = allowedOrigin;
    this.boundaryConfiguration = Object.freeze({
      signature,
      allowedOrigins,
      allowedWebSocketOrigins,
      exactFulfillments: new Map(
        fulfillments.map((fixture) => [new URL(fixture.url).toString(), fixture]),
      ),
      onViolation: typeof options.onViolation === "function" ? options.onViolation : null,
      onWebSocket: typeof options.onWebSocket === "function" ? options.onWebSocket : null,
    });

    this.installBoundarySession(this.sessionId);
    const attach = (params) => this.queueBoundaryTarget(params);
    this.unsubscribe.push(
      this.conn.on("Target.attachedToTarget", attach, this.sessionId),
      // `Target.autoAttachRelated` reports service/shared-worker sessions at
      // browser scope rather than through the page session.
      this.conn.on("Target.attachedToTarget", attach),
    );
    await this.send("Runtime.addBinding", { name: BOUNDARY_WEBSOCKET_BINDING });
    await this.send("Runtime.addBinding", { name: BOUNDARY_WEBRTC_BINDING });
    await this.send("Page.addScriptToEvaluateOnNewDocument", {
      source: networkConstructorBoundarySource(allowedWebSocketOrigins),
    });
    if (allowedWebSocketOrigins.size === 0) {
      await this.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] });
    }
    await this.send("Fetch.enable", {
      patterns: [{ urlPattern: "*", requestStage: "Request" }],
    });
    await this.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: "worker" }, { type: "iframe" }],
    });
    await this.conn.send("Target.setAutoAttach", {
      autoAttach: true,
      waitForDebuggerOnStart: true,
      flatten: true,
      filter: [{ type: "shared_worker" }, { type: "service_worker" }],
    });
    await this.waitForBoundaryTargets();
  }

  installBoundarySession(sessionId) {
    if (this.boundarySessionIds.has(sessionId)) return;
    this.boundarySessionIds.add(sessionId);
    const config = this.boundaryConfiguration;
    const send = (method, params = {}) => this.conn.send(method, params, sessionId);
    this.unsubscribe.push(
      this.conn.on("Fetch.requestPaused", (params) => {
        const request = params.request ?? {};
        const fixture = config.exactFulfillments.get(request.url);
        if (fixture) {
          const body = Buffer.from(fixture.body ?? "", "utf8");
          const sha256 = createHash("sha256").update(body).digest("hex");
          this.networkBoundaryFulfillments.push({
            url: request.url,
            method: request.method ?? "GET",
            resourceType: params.resourceType ?? null,
            responseBodySha256: sha256,
            responseBytes: body.length,
            reason: fixture.reason,
          });
          void send("Fetch.fulfillRequest", {
            requestId: params.requestId,
            responseCode: 200,
            responseHeaders: [
              { name: "Content-Type", value: fixture.contentType ?? "text/plain; charset=utf-8" },
              { name: "Cache-Control", value: "no-store" },
              { name: "Access-Control-Allow-Origin", value: "*" },
            ],
            body: body.toString("base64"),
          }).catch((error) => {
            this.console.push({ level: "exception", text: `Fetch.fulfillRequest: ${error.message}` });
          });
          return;
        }
        if (isEvidenceBoundaryUrlForOrigins(request.url, config.allowedOrigins)) {
          void send("Fetch.continueRequest", { requestId: params.requestId }).catch((error) => {
            this.console.push({ level: "exception", text: `Fetch.continueRequest: ${error.message}` });
          });
          return;
        }
        this.recordBoundaryViolation({
          url: request.url ?? "",
          method: request.method ?? "GET",
          resourceType: params.resourceType ?? null,
          targetType: "http",
          reason: "off-origin request blocked before dispatch",
        });
        void send("Fetch.failRequest", {
          requestId: params.requestId,
          errorReason: "BlockedByClient",
        }).catch((error) => {
          this.console.push({ level: "exception", text: `Fetch.failRequest: ${error.message}` });
        });
      }, sessionId),
      this.conn.on("Runtime.bindingCalled", (params) => {
        if (params.name === BOUNDARY_WEBRTC_BINDING) {
          this.recordBoundaryViolation({
            url: "webrtc://blocked",
            method: "WEBRTC",
            resourceType: "WebRTC",
            targetType: "worker-or-page",
            reason: "RTCPeerConnection blocked before native construction",
          });
          return;
        }
        if (params.name !== BOUNDARY_WEBSOCKET_BINDING) return;
        let url = "INVALID";
        try {
          url = JSON.parse(params.payload)?.url ?? "INVALID";
        } catch {}
        this.recordBoundaryViolation({
          url,
          method: "WEBSOCKET",
          resourceType: "WebSocket",
          targetType: "worker-or-page",
          reason: "WebSocket blocked before native construction",
        });
      }, sessionId),
      this.conn.on("Network.webSocketCreated", (params) => {
        const url = params.url ?? "";
        const allowed = isAllowedWebSocketUrl(url, config.allowedWebSocketOrigins);
        config.onWebSocket?.(Object.freeze({ url: safeBoundaryUrl(url), allowed }));
        if (!allowed) {
          this.recordBoundaryViolation({
            url,
            method: "WEBSOCKET",
            resourceType: "WebSocket",
            targetType: "worker-or-page",
            reason: "WebSocket requests are prohibited during evidence capture",
          });
        }
      }, sessionId),
    );
  }

  installChildNetworkTelemetry(sessionId) {
    if (this.boundaryTelemetrySessionIds.has(sessionId)) return;
    this.boundaryTelemetrySessionIds.add(sessionId);
    const key = (requestId) => `${sessionId}:${requestId}`;
    this.unsubscribe.push(
      this.conn.on("Runtime.consoleAPICalled", (params) => {
        if (!["error", "warning", "assert"].includes(params.type)) return;
        const rawUrl = params.stackTrace?.callFrames?.[0]?.url;
        this.console.push({
          level: params.type,
          text: params.args.map(argText).join(" ").slice(0, 500),
          targetType: "worker-or-child",
          ...(rawUrl ? { url: safeBoundaryUrl(rawUrl) } : {}),
        });
      }, sessionId),
      this.conn.on("Runtime.exceptionThrown", (params) => {
        const details = params.exceptionDetails;
        const rawUrl = details?.url ?? details?.stackTrace?.callFrames?.[0]?.url;
        this.console.push({
          level: "exception",
          text: String(details?.exception?.description ?? details?.text ?? "").slice(0, 500),
          targetType: "worker-or-child",
          ...(rawUrl ? { url: safeBoundaryUrl(rawUrl) } : {}),
        });
      }, sessionId),
      this.conn.on("Network.requestWillBeSent", (params) => {
        if (!isEvidenceBoundaryUrlForOrigins(
          params.request.url,
          this.boundaryConfiguration.allowedOrigins,
        )) {
          this.recordBoundaryViolation({
            url: params.request.url,
            method: params.request.method ?? "GET",
            resourceType: params.type ?? null,
            targetType: "worker-or-child",
            reason: "off-origin child-target request blocked by the closed-loopback browser proxy",
          });
        }
        this.inflight.set(key(params.requestId), {
          url: params.request.url,
          method: params.request.method,
          type: params.type,
          targetType: "worker-or-child",
          sessionId,
        });
      }, sessionId),
      this.conn.on("Network.responseReceived", (params) => {
        const request = this.inflight.get(key(params.requestId));
        const record = {
          url: params.response.url,
          status: params.response.status,
          type: params.type,
          method: request?.method ?? "GET",
          targetType: "worker-or-child",
        };
        this.network.push(record);
        if (request) {
          request.responseRecord = record;
          // CDP worker targets omit loadingFinished for their bootstrap
          // blob/data Script even though responseReceived proves the complete
          // in-memory source was delivered. Do not let that protocol quirk
          // manufacture a permanent pending request.
          if (
            params.type === "Script" &&
            /^(?:blob:|data:)/u.test(params.response.url) &&
            params.response.status < 400
          ) {
            this.inflight.delete(key(params.requestId));
          }
        }
      }, sessionId),
      this.conn.on("Network.loadingFinished", (params) => {
        const requestKey = key(params.requestId);
        const request = this.inflight.get(requestKey);
        const record = request?.responseRecord;
        this.inflight.delete(requestKey);
        if (record?.status >= 400) {
          this.queueErrorResponseBodyTelemetry({
            record,
            requestId: params.requestId,
            sessionId,
          });
        }
      }, sessionId),
      this.conn.on("Network.loadingFailed", (params) => {
        const requestKey = key(params.requestId);
        const request = this.inflight.get(requestKey);
        this.inflight.delete(requestKey);
        this.network.push({
          url: request?.url ?? "",
          status: 0,
          type: params.type,
          failed: true,
          error: params.errorText,
          canceled: Boolean(params.canceled),
          targetType: "worker-or-child",
        });
      }, sessionId),
    );
  }

  recordBoundaryViolation(record) {
    const frozen = Object.freeze({ ...record, url: safeBoundaryUrl(record.url) });
    this.networkBoundaryViolations.push(frozen);
    this.boundaryConfiguration?.onViolation?.(frozen);
  }

  queueBoundaryTarget(params) {
    const sessionId = params?.sessionId;
    if (!sessionId || this.boundarySessionIds.has(sessionId)) return;
    const targetType = params.targetInfo?.type ?? "unknown";
    const targetUrl = params.targetInfo?.url ?? "";
    // Chromium may expose browser-owned extension service workers even in an
    // extension-disabled ephemeral profile. They are not page descendants and
    // are outside candidate evidence; resume them without instrumenting them.
    if (/^(?:chrome-extension|devtools):/u.test(targetUrl)) {
      void this.conn.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
      return;
    }
    const promise = this.configureBoundaryTarget(sessionId, targetType)
      .catch((error) => {
        this.boundarySetupErrors.push(`${targetType} target: ${error.message}`);
      })
      .finally(() => this.boundaryTargetPromises.delete(promise));
    this.boundaryTargetPromises.add(promise);
  }

  async configureBoundaryTarget(sessionId, targetType) {
    const config = this.boundaryConfiguration;
    this.installBoundarySession(sessionId);
    this.installChildNetworkTelemetry(sessionId);
    const attach = (params) => this.queueBoundaryTarget(params);
    this.unsubscribe.push(this.conn.on("Target.attachedToTarget", attach, sessionId));
    try {
      await this.conn.send("Runtime.enable", {}, sessionId);
      await this.conn.send("Network.enable", {}, sessionId);
      await this.conn.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
      await this.conn.send("Runtime.addBinding", { name: BOUNDARY_WEBSOCKET_BINDING }, sessionId);
      await this.conn.send("Runtime.addBinding", { name: BOUNDARY_WEBRTC_BINDING }, sessionId);
      await this.conn.send("Runtime.evaluate", {
        expression: networkConstructorBoundarySource(config.allowedWebSocketOrigins),
        awaitPromise: false,
      }, sessionId);
      if (config.allowedWebSocketOrigins.size === 0) {
        await this.conn.send("Network.setBlockedURLs", { urls: ["ws://*", "wss://*"] }, sessionId);
      }
      try {
        await this.conn.send("Fetch.enable", {
          patterns: [{ urlPattern: "*", requestStage: "Request" }],
        }, sessionId);
      } catch (error) {
        // Dedicated/shared/service workers do not expose the Fetch domain.
        // Their Network events are still audited, their WebSocket constructor
        // is replaced before execution, and Chromium's proxy is a closed
        // loopback endpoint, so off-origin dispatch remains fail closed.
        if (targetType === "iframe" || !/Fetch\.enable.*(?:wasn't found|not found)/iu.test(error.message)) {
          throw error;
        }
      }
      await this.conn.send("Target.setAutoAttach", {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: [{ type: "worker" }],
      }, sessionId);
    } finally {
      await this.conn.send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch(() => {});
    }
    return targetType;
  }

  async waitForBoundaryTargets() {
    while (this.boundaryTargetPromises.size > 0) {
      await Promise.all([...this.boundaryTargetPromises]);
    }
    if (this.boundarySetupErrors.length > 0) {
      throw new Error(
        `worker/service-worker network boundary setup failed (${this.boundarySetupErrors.join("; ")})`,
      );
    }
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

  async navigate(url, {
    loadTimeoutMs = 30000,
    quietMs = 800,
    maxSettleMs = 8000,
    resetRecords = true,
  } = {}) {
    if (resetRecords) this.resetRecords();
    else this.loaded = false;
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
    await this.waitForBoundaryTargets();
    const settleStart = Date.now();
    const settleDeadline = settleStart + maxSettleMs;
    let quietSince = this.inflight.size === 0 ? Date.now() : null;
    while (Date.now() < settleDeadline) {
      await this.waitForBoundaryTargets();
      if (this.inflight.size === 0) {
        quietSince ??= Date.now();
        if (Date.now() - quietSince >= quietMs) {
          // The paint itself may trigger lazy resources or worker activity.
          // Release only when the full quiet interval survives that paint and
          // a final child-target telemetry flush.
          await this.evaluate("new Promise(r => requestAnimationFrame(() => setTimeout(r, 50)))");
          await this.waitForBoundaryTargets();
          if (this.inflight.size === 0) {
            await this.waitForErrorResponseBodyTelemetry({ deadline: settleDeadline });
            await this.waitForBoundaryTargets();
            if (this.inflight.size === 0) {
              return Object.freeze({ reachedIdle: true, pendingRequests: 0 });
            }
          }
          quietSince = null;
        }
      } else {
        quietSince = null;
      }
      await sleep(25);
    }
    await this.waitForBoundaryTargets();
    const pendingTypes = [...new Set(
      [...this.inflight.values()].map((request) => request.type ?? "Unknown"),
    )].sort();
    throw new Error(
      `network did not remain idle through paint within ${maxSettleMs} ms; ` +
        `${this.inflight.size} request(s) pending [${pendingTypes.join(", ")}]`,
    );
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

  async screenshot({ fullPage = true, maxHeight = MAX_FULL_PAGE_HEIGHT_CSS_PX } = {}) {
    if (!fullPage) {
      const { data } = await this.send("Page.captureScreenshot", { format: "png" });
      const bytes = Buffer.from(data, "base64");
      const dimensions = pngDimensions(bytes);
      return Object.freeze({
        bytes,
        coverage: Object.freeze({
          fullPage: false,
          truncated: false,
          capturedWidthPx: dimensions.width,
          capturedHeightPx: dimensions.height,
        }),
      });
    }
    if (
      !Number.isFinite(maxHeight) ||
      maxHeight < 1 ||
      maxHeight > MAX_FULL_PAGE_HEIGHT_CSS_PX
    ) {
      throw new Error(
        `full-page screenshot maxHeight must be between 1 and the hard safety ceiling of ` +
          `${MAX_FULL_PAGE_HEIGHT_CSS_PX} CSS px`,
      );
    }
    const metrics = await this.send("Page.getLayoutMetrics");
    const size = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.ceil(size.width);
    const height = Math.max(1, Math.ceil(size.height));
    if (height > maxHeight) {
      throw new Error(
        `full-page screenshot requires ${height} CSS px but the declared safety ceiling is ${maxHeight}; ` +
          "capture refused instead of truncating",
      );
    }
    const devicePixelRatio = Number(await this.evaluate("devicePixelRatio"));
    if (!Number.isFinite(devicePixelRatio) || devicePixelRatio <= 0) {
      throw new Error("full-page screenshot could not establish devicePixelRatio");
    }
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    const bytes = Buffer.from(data, "base64");
    const dimensions = pngDimensions(bytes);
    const postMetrics = await this.send("Page.getLayoutMetrics");
    const postSize = postMetrics.cssContentSize ?? postMetrics.contentSize;
    const coverage = assertStableFullPageScreenshotCoverage({
      contentWidthCssPx: width,
      contentHeightCssPx: height,
      postContentWidthCssPx: Math.ceil(postSize.width),
      postContentHeightCssPx: Math.max(1, Math.ceil(postSize.height)),
      devicePixelRatio,
      capturedWidthPx: dimensions.width,
      capturedHeightPx: dimensions.height,
      maxHeightCssPx: maxHeight,
    });
    return Object.freeze({
      bytes,
      coverage,
    });
  }

  async close() {
    for (const telemetry of this.errorResponseBodyTelemetry) telemetry.cancel();
    this.errorResponseBodyTelemetry.clear();
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

export function isEvidenceBoundaryUrl(rawUrl, allowedOrigin) {
  return isEvidenceBoundaryUrlForOrigins(rawUrl, new Set([allowedOrigin]));
}

export function pngDimensions(bytes) {
  const signature = "89504e470d0a1a0a";
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || bytes.subarray(0, 8).toString("hex") !== signature) {
    throw new Error("screenshot did not return a valid PNG header");
  }
  const width = bytes.readUInt32BE(16);
  const height = bytes.readUInt32BE(20);
  if (width < 1 || height < 1) throw new Error("screenshot PNG has invalid dimensions");
  return Object.freeze({ width, height });
}

export function assertStableFullPageScreenshotCoverage({
  contentWidthCssPx,
  contentHeightCssPx,
  postContentWidthCssPx,
  postContentHeightCssPx,
  devicePixelRatio,
  capturedWidthPx,
  capturedHeightPx,
  maxHeightCssPx,
}) {
  if (
    postContentWidthCssPx !== contentWidthCssPx ||
    postContentHeightCssPx !== contentHeightCssPx
  ) {
    throw new Error(
      `full-page layout changed during capture from ${contentWidthCssPx}x${contentHeightCssPx} ` +
        `to ${postContentWidthCssPx}x${postContentHeightCssPx} CSS px; capture refused`,
    );
  }
  if (
    capturedWidthPx !== Math.round(contentWidthCssPx * devicePixelRatio) ||
    capturedHeightPx !== Math.round(contentHeightCssPx * devicePixelRatio)
  ) {
    throw new Error(
      `full-page screenshot bitmap ${capturedWidthPx}x${capturedHeightPx} did not cover ` +
        `${contentWidthCssPx}x${contentHeightCssPx} CSS px at devicePixelRatio ${devicePixelRatio}`,
    );
  }
  return Object.freeze({
    fullPage: true,
    truncated: false,
    layoutStable: true,
    contentWidthCssPx,
    contentHeightCssPx,
    postContentWidthCssPx,
    postContentHeightCssPx,
    maxHeightCssPx,
    devicePixelRatio,
    capturedWidthPx,
    capturedHeightPx,
  });
}

const BOUNDARY_WEBSOCKET_BINDING = "xeniosEvidenceBlockedWebSocket";
const BOUNDARY_WEBRTC_BINDING = "xeniosEvidenceBlockedWebRtc";

/** All non-HTTP constructors that need a synchronous pre-dispatch guard. */
export function networkConstructorBoundarySource(allowedWebSocketOrigins = new Set()) {
  return `${webSocketBoundarySource(allowedWebSocketOrigins)}\n${webRtcBoundarySource()}`;
}

/** Constructor guard used in pages, dedicated workers and shared workers. */
export function webSocketBoundarySource(allowedWebSocketOrigins = new Set()) {
  return `(() => {
    const allowed = new Set(${JSON.stringify([...allowedWebSocketOrigins])});
    const NativeWebSocket = globalThis.WebSocket;
    if (typeof NativeWebSocket !== "function" || NativeWebSocket.__xeniosEvidenceBoundary) return;
    function EvidenceWebSocket(url, protocols) {
      const parsed = new URL(String(url), globalThis.location && globalThis.location.href || "http://evidence.invalid/");
      if (!allowed.has(parsed.origin) || !["ws:", "wss:"].includes(parsed.protocol)) {
        try {
          globalThis.${BOUNDARY_WEBSOCKET_BINDING}(JSON.stringify({ url: parsed.href }));
        } catch {}
        throw new DOMException("WebSocket blocked by the local evidence boundary", "SecurityError");
      }
      return protocols === undefined
        ? new NativeWebSocket(url)
        : new NativeWebSocket(url, protocols);
    }
    Object.setPrototypeOf(EvidenceWebSocket, NativeWebSocket);
    EvidenceWebSocket.prototype = NativeWebSocket.prototype;
    Object.defineProperty(EvidenceWebSocket, "__xeniosEvidenceBoundary", { value: true });
    for (const name of ["CONNECTING", "OPEN", "CLOSING", "CLOSED"]) {
      Object.defineProperty(EvidenceWebSocket, name, { value: NativeWebSocket[name] });
    }
    globalThis.WebSocket = EvidenceWebSocket;
  })();`;
}

/**
 * WebRTC/STUN uses UDP and therefore bypasses both Fetch interception and an
 * HTTP proxy. Disable both standard and legacy constructors before candidate
 * code runs. Telemetry deliberately contains no ICE URL or credential data.
 */
export function webRtcBoundarySource() {
  return `(() => {
    for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) {
      const NativePeerConnection = globalThis[name];
      if (typeof NativePeerConnection !== "function" || NativePeerConnection.__xeniosEvidenceBoundary) continue;
      function EvidenceBlockedPeerConnection() {
        try { globalThis.${BOUNDARY_WEBRTC_BINDING}("{}"); } catch {}
        const error = typeof DOMException === "function"
          ? new DOMException("WebRTC blocked by the local evidence boundary", "SecurityError")
          : Object.assign(new Error("WebRTC blocked by the local evidence boundary"), { name: "SecurityError" });
        throw error;
      }
      Object.setPrototypeOf(EvidenceBlockedPeerConnection, NativePeerConnection);
      EvidenceBlockedPeerConnection.prototype = NativePeerConnection.prototype;
      Object.defineProperty(EvidenceBlockedPeerConnection, "__xeniosEvidenceBoundary", { value: true });
      globalThis[name] = EvidenceBlockedPeerConnection;
    }
  })();`;
}

function isAllowedWebSocketUrl(rawUrl, allowedOrigins) {
  try {
    const url = new URL(rawUrl);
    return ["ws:", "wss:"].includes(url.protocol) && allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}

function safeBoundaryUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl));
    url.username = "";
    url.password = "";
    url.hash = "";
    if (url.search) url.search = "?REDACTED";
    return url.toString();
  } catch {
    return "INVALID";
  }
}

function isEvidenceBoundaryUrlForOrigins(rawUrl, allowedOrigins) {
  try {
    const url = new URL(rawUrl);
    if (["data:", "about:"].includes(url.protocol)) return true;
    if (url.protocol === "blob:") return allowedOrigins.has(url.origin);
    return ["http:", "https:"].includes(url.protocol) && allowedOrigins.has(url.origin);
  } catch {
    return false;
  }
}
