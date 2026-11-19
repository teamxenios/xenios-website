// Source-only until Root's isolated Actions allocation. Importing runs no QA.
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { release as kernelRelease } from "node:os";
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { launchChromium } from "./lib/chrome.mjs";
import { CdpConnection, PageSession } from "./lib/cdp.mjs";
import { PAGE_AUDIT_SOURCE, FOCUS_BASELINE_SOURCE, FOCUS_PROBE_SOURCE } from "./lib/page-audit.js";
import { createImmutableDistSnapshot, inventoryDirectory, inventorySha256 } from "./lib/immutable-dist.mjs";
import { assertPinnedExecutingRuntime } from "./lib/provenance.mjs";

export const QUALIFIED_BASELINE = "47e46709060684ada6d365b1544500539b296620";
export const QUALIFIED_BASELINE_TREE = "1868d4a15e9531371e3b5fdcd2609c48ec26ba51";
export const WHOLESALE_ROUTE = "/research/organizations";
export const ROUTES = Object.freeze(["/", "/r/SAMPLE-CODE", WHOLESALE_ROUTE]);
/** Fixed synthetic GETs, never provider/Auth configuration or readiness. */
export const READ_ONLY_GET_FIXTURES = Object.freeze({
  "/api/config": Object.freeze({ status: 200, body: Object.freeze({ metaPixelId: null, turnstileSiteKey: null,
    calendlyUrl: "", supabaseUrl: null, supabaseAnonKey: null }) }),
  "/api/research/me": Object.freeze({ status: 200, body: Object.freeze({ configured: true, authed: false }) }),
  "/api/research/business-inquiries/config": Object.freeze({ status: 503, body: Object.freeze({ enabled: false }) }),
});
export const WHOLESALE_PACKET = Object.freeze({
  sha256: "c75d2a32886265a876e9adb151ae4f6824738df0c920815bec81db438e1b0939",
  preparedSource: "68350df1fcccf3db806808a2568aed6371425c28",
  preparedTree: "f1d02ba49e48d12d25501204502f226a78ec030a",
  adoptedPageBlob: "1fb2de27cd75e7a16d5bd92aa57a3f756c604553",
});
export const WHOLESALE_EXPECTED = Object.freeze({
  title: "Wholesale and organization access | Xenios Research",
  description: "Wholesale product enquiries and reviewed organization access. Share exact items, variants, packages, quantities, and documentation needs with the Xenios team.",
  heading: "Wholesale enquiries for your organization.",
  unavailable: "Online business enquiries are not available in this session.",
});
export const CONFIGURATIONS = Object.freeze([
  { name: "phone100", width: 375, height: 812, font: 16 },
  { name: "phone200", width: 375, height: 812, font: 32 },
  { name: "desktop100", width: 1440, height: 900, font: 16 },
  { name: "desktop200", width: 1440, height: 900, font: 32 },
]);
export const OWNED_SOURCES = Object.freeze([
  "scripts/evidence/owned-runner-preview.ts", "scripts/evidence/owned-runner-browser-qa.mjs",
  "scripts/evidence/owned-runner-browser-qa.sh", "scripts/evidence/owned-runner-browser-qa.node-test.mjs",
  "scripts/evidence/lib/chrome.mjs", "scripts/evidence/lib/cdp.mjs", "scripts/evidence/lib/page-audit.js",
  "scripts/evidence/lib/immutable-dist.mjs", "scripts/evidence/lib/provenance.mjs",
  "server/research/seo/raw-http-document-policy.ts", "client/src/home/content.ts",
  "client/src/research/recommendation/Recipient.tsx", "client/src/research/recommendation/api.ts",
  "shared/research/referral-v1.ts", ".github/workflows/checks.yml", "package-lock.json",
  "client/src/research/b2b/OrganizationAccessPage.tsx", "client/src/research/b2b/ConnectedBusinessInquiryPage.tsx",
  "client/src/research/b2b/BusinessInquiryForm.tsx", "client/src/research/b2b/components.tsx",
  "client/src/research/b2b/pathways.css", "client/src/research/section.tsx", "client/src/research/layout.tsx",
  "client/src/research/core.tsx", "client/src/lib/config.ts", "client/src/lib/supabaseBrowser.ts",
  "client/src/research/lib/routes.ts", "client/src/research/seo/route-policy.ts",
  "scripts/evidence/routes.public.json",
]);
const SHA = /^[a-f0-9]{40}$/;
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function requireThat(value, code) { if (!value) throw new Error(code); }

export const PAGE_CHECKS = Object.freeze([
  "PAGE_CREATE", "NETWORK_BOUNDARY_SETUP", "VIEWPORT_SETUP", "FONT_SETUP", "BLANK_FONT_CALIBRATION",
  "RAW_DOCUMENT", "DOCUMENT_NAVIGATE", "EXPECTED_UI_TEXT", "DOCUMENT_FONT_CALIBRATION",
  "PAGE_AUDIT", "PAGE_VIEW", "UI_ASSERTION_BUILD", "SCREENSHOT", "CAPTURE_WRITE",
]);

/** Classify only frozen helper forms; never persist an exception's text. */
export function pageCheckFailureCode(check, error) {
  requireThat(PAGE_CHECKS.includes(check), "PAGE_CHECK_INVALID");
  const message = typeof error?.message === "string" && error.message.length <= 500 ? error.message : "";
  if (["OVERALL_DEADLINE", "BOUNDED_OPERATION_TIMEOUT", "EXPECTED_UI_STATE_MISSING",
    "FONT_CAPABILITY_NOT_EXECUTED", "SCREENSHOT_VIEWPORT_MISMATCH"].includes(message)) return message;
  if (check === "DOCUMENT_NAVIGATE") {
    if (/^navigate [^\r\n]+: load event not fired within \d+ ms$/.test(message)) return "PAGE_DOCUMENT_LOAD_TIMEOUT";
    if (/^network did not remain idle through paint within \d+ ms; \d+ request\(s\) pending \[[A-Za-z, ]*\]$/.test(message)) return "PAGE_DOCUMENT_IDLE_TIMEOUT";
  }
  return `PAGE_CHECK_${check}_FAILED`;
}

export async function runPageCheck(check, operation, receipts, now = Date.now) {
  requireThat(PAGE_CHECKS.includes(check) && receipts.length < PAGE_CHECKS.length, "PAGE_CHECK_INVALID");
  const started = now(), receipt = { check, state: "STARTED", elapsedMs: null };
  receipts.push(receipt);
  try {
    const value = await operation();
    receipt.state = "PASS";
    return value;
  } catch (error) {
    receipt.state = "FAILED";
    receipt.failure = pageCheckFailureCode(check, error);
    throw new Error(receipt.failure);
  } finally {
    receipt.elapsedMs = Math.max(0, Math.min(300000, now() - started));
  }
}

/** Never start optional diagnostics using the reserved cleanup/tail budget. */
export function failureObservationBudget(deadline, now, ceiling) {
  requireThat([750, 1500].includes(ceiling), "DIAGNOSTIC_CEILING_INVALID");
  return Number.isFinite(deadline) && Number.isFinite(now)
    ? Math.max(0, Math.min(ceiling, Math.floor(deadline - now - 25000 - 500))) : 0;
}

/** A fixed scalar projection, excluding page text, URLs, exceptions and IDs. */
export function pageFailureMetrics(sample) {
  const numeric = ["width", "height", "dpr", "scale", "root", "rem", "scrollWidth", "clientWidth",
    "h1Count", "mainCount", "inflightCount", "boundaryTargetCount", "boundarySetupErrorCount"];
  const boolean = ["loaded", "domReady", "bodyPresent", "expectedTextPresent", "emMedia"];
  return Object.fromEntries([
    ...numeric.map((key) => [key, typeof sample?.[key] === "number" && Number.isFinite(sample[key])
      && sample[key] >= 0 && sample[key] <= 10000000 ? sample[key] : null]),
    ...boolean.map((key) => [key, typeof sample?.[key] === "boolean" ? sample[key] : null]),
  ]);
}

/** A rendered badge, not a mention elsewhere in the page, proves this label. */
export function hasInfinityDevelopmentBadge(sample) {
  return sample?.rendered === true && typeof sample.text === "string"
    && sample.text.trim().replace(/\s+/gu, " ").toLowerCase() === "in development";
}

/** The outer configuration cleanup owns this page even if setup/visit fails. */
export async function visitConfigurationPage({ create, own, configure, visit }) {
  const page = await create();
  own(page);
  await configure(page);
  for (const route of ROUTES) await visit(page, route);
}

export function configurationBoundaryOptions(origin, violations) {
  return { fulfillments: [], allowedOrigins: [origin], allowedWebSocketOrigins: [],
    // This global record survives the page helper's per-navigation resets.
    onViolation: () => violations.push({ reason: "PROFILE_NETWORK_BOUNDARY_VIOLATION" }) };
}

/** Observe real terminal/idle state after all interaction and capture work. */
export async function settlePostInteractionNetwork(page, bounded) {
  await bounded(page.settle({ quietMs: 150, maxSettleMs: 5000 }), 5000);
  await bounded(page.waitForBoundaryTargets());
}

export function assertNetworkBoundaryComplete(network) {
  requireThat(!network.fulfillmentCount && !network.pending && !network.pendingTargets
    && !network.setupErrors, "NETWORK_BOUNDARY_INCOMPLETE");
}

/** Own data only: diagnostic projection must not invoke record accessors. */
function ownData(value, key) {
  if (!value || typeof value !== "object") return undefined;
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor && Object.hasOwn(descriptor, "value") ? descriptor.value : undefined;
}

function diagnosticPath(value, origin, assets, relative = false) {
  if (typeof value !== "string" || value.length > 4096) return { pathClass: "UNKNOWN", pathSha256: null };
  const unknown = (pathClass) => ({ pathClass, pathSha256: null });
  if (/^blob:/u.test(value)) return unknown("IN_MEMORY_BLOB");
  if (/^data:/u.test(value)) return unknown("IN_MEMORY_DATA");
  try {
    const url = relative ? new URL(value, origin) : new URL(value);
    if (url.username || url.password) return unknown("URL_CREDENTIALS");
    if (url.origin !== origin) return unknown("OFF_ORIGIN");
    if (url.search || url.hash) return unknown("QUERY_OR_FRAGMENT");
    if (/[\\%\s]/u.test(value) || value !== (relative && value.startsWith("/") ? url.pathname : origin + url.pathname)) return unknown("UNKNOWN");
    const fixed = { "/": "HOME_DOCUMENT", "/r/SAMPLE-CODE": "RECIPIENT_DOCUMENT",
      "/research/organizations": "WHOLESALE_DOCUMENT", "/sw.js": "SERVICE_WORKER_SCRIPT",
      "/offline.html": "OFFLINE_DOCUMENT", "/site.webmanifest": "MANIFEST",
      "/api/config": "CONFIG_FIXTURE", "/api/research/me": "SESSION_FIXTURE",
      "/api/research/business-inquiries/config": "BUSINESS_CONFIG_FIXTURE",
      "/api/research/referral/resolve": "RESOLVE_FIXTURE" };
    let pathClass = Object.hasOwn(fixed, url.pathname) ? fixed[url.pathname] : null;
    if (!pathClass && Set.prototype.has.call(assets, url.pathname.slice(1))
      && (/^\/assets\/[A-Za-z0-9._-]+\.(?:js|css|png|svg|jpe?g|webp|avif|ico|woff2?|ttf|otf|gif)$/u.test(url.pathname)
        || ["/favicon.ico", "/favicon.png", "/android-chrome-192x192.png", "/android-chrome-512x512.png", "/apple-touch-icon.png"].includes(url.pathname))) pathClass = "INVENTORIED_ASSET";
    return pathClass ? { pathClass, pathSha256: hash(url.pathname) } : unknown("UNKNOWN");
  } catch { return unknown("UNKNOWN"); }
}

/** Passive listeners only. Protocol IDs stay in bounded private lookup maps. */
export function observeOwnedCdpEvents(conn, page, { origin, assets, now = Date.now }) {
  const started = now(), sessions = new Map(), requests = new Map(), frames = new Map(), loaders = new Map();
  const events = [], off = [], awaitingOwnership = new Set();
  const truncated = { sessions: false, requests: false, events: false, lineage: false };
  let stopped = false, eventsSeen = 0, droppedEvents = 0, observerErrors = 0, unsubscribeErrors = 0;
  const id = (value) => typeof value === "string" && value.length > 0 && value.length <= 256 ? value : null;
  const closed = (value, choices) => choices.includes(value) ? value : "UNKNOWN";
  const resource = (value) => closed(value, ["Document", "Stylesheet", "Image", "Media", "Font", "Script", "TextTrack", "XHR", "Fetch",
    "Prefetch", "EventSource", "WebSocket", "Manifest", "SignedExchange", "Ping", "CSPViolationReport", "Preflight", "Other"]);
  const lineage = (map, value) => {
    if (!id(value)) return null;
    if (!map.has(value)) { if (map.size >= 64) { truncated.lineage = true; return null; } map.set(value, map.size); }
    return map.get(value);
  };
  const emit = (kind, session, fields = {}) => {
    if (stopped) return;
    eventsSeen = Math.min(1000000, eventsSeen + 1);
    const elapsed = now() - started;
    if (events.length >= 384) { events.splice(192, 1); truncated.events = true; droppedEvents = Math.min(1000000, droppedEvents + 1); }
    events.push({ sequence: eventsSeen - 1, kind, sessionOrdinal: session.ordinal, targetClass: session.kind,
      elapsedMs: Number.isFinite(elapsed) ? Math.max(0, Math.min(300000, elapsed)) : null, ...fields });
  };
  const request = (session, params, create) => {
    const requestId = id(ownData(params, "requestId"));
    if (requestId === null) return null;
    const key = session.ordinal + ":" + requestId;
    if (!requests.has(key) && create) {
      if (requests.size >= 128) { truncated.requests = true; return null; }
      requests.set(key, { ordinal: requests.size });
    }
    return requests.get(key) ?? null;
  };
  const listen = (method, callback, sessionId) => off.push(conn.on(method, (params) => {
    if (stopped) return;
    try { callback(params); } catch { observerErrors = Math.min(1000000, observerErrors + 1); }
  }, sessionId));
  const isOwnedChild = (sessionId) => {
    try { return Set.prototype.has.call(ownData(page, "boundarySessionIds"), sessionId); } catch { return false; }
  };
  const attach = (params) => {
    const sessionId = id(ownData(params, "sessionId"));
    if (!sessionId || sessions.has(sessionId) || awaitingOwnership.has(sessionId)) return;
    if (isOwnedChild(sessionId)) { install(sessionId, "CHILD"); return; }
    if (awaitingOwnership.size >= 16) { truncated.sessions = true; return; }
    // The existing boundary listener may run later in this same event dispatch.
    awaitingOwnership.add(sessionId);
    queueMicrotask(() => {
      awaitingOwnership.delete(sessionId);
      try { if (!stopped && isOwnedChild(sessionId)) install(sessionId, "CHILD"); } catch { observerErrors = Math.min(1000000, observerErrors + 1); }
    });
  };
  function install(sessionId, kind) {
    if (stopped || sessions.has(sessionId)) return;
    if (sessions.size >= 16) { truncated.sessions = true; return; }
    const session = { ordinal: sessions.size, kind };
    sessions.set(sessionId, session);
    emit("SESSION", session);
    listen("Network.requestWillBeSent", (params) => {
      const item = request(session, params, true), wire = ownData(params, "request");
      emit("REQUEST", session, { requestOrdinal: item?.ordinal ?? null,
        ...diagnosticPath(ownData(wire, "url"), origin, assets),
        method: closed(ownData(wire, "method"), ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"]),
        resourceType: resource(ownData(params, "type")),
        frameOrdinal: lineage(frames, ownData(params, "frameId")), loaderOrdinal: lineage(loaders, ownData(params, "loaderId")),
        currentLoaderOrdinal: lineage(loaders, ownData(page, "currentMainFrameLoaderId")),
        previousLoaderOrdinal: lineage(loaders, ownData(ownData(page, "mainFrameLoaderTransition"), "previousLoaderId")),
        generation: Number.isInteger(ownData(page, "recordsGeneration")) && ownData(page, "recordsGeneration") >= 0
          && ownData(page, "recordsGeneration") <= 1000000 ? ownData(page, "recordsGeneration") : null,
        initiatorType: closed(ownData(ownData(params, "initiator"), "type"), ["parser", "script", "preload", "SignedExchange", "preflight", "other"]) });
    }, sessionId);
    listen("Network.responseReceived", (params) => {
      const item = request(session, params, true), response = ownData(params, "response"), status = ownData(response, "status");
      const sw = ownData(response, "fromServiceWorker");
      emit("RESPONSE", session, { requestOrdinal: item?.ordinal ?? null,
        ...diagnosticPath(ownData(response, "url"), origin, assets), resourceType: resource(ownData(params, "type")),
        responseStatus: Number.isInteger(status) && status >= 100 && status <= 599 ? status : null,
        fromServiceWorker: typeof sw === "boolean" ? sw : null });
    }, sessionId);
    for (const [method, kind] of [["Network.loadingFinished", "FINISHED"], ["Network.loadingFailed", "FAILED"]]) {
      listen(method, (params) => {
        const canceled = ownData(params, "canceled");
        emit(kind, session, { requestOrdinal: request(session, params, false)?.ordinal ?? null,
          ...(kind === "FAILED" ? { resourceType: resource(ownData(params, "type")), canceled: typeof canceled === "boolean" ? canceled : null } : {}) });
      }, sessionId);
    }
    if (kind === "PAGE") {
      listen("Page.frameNavigated", (params) => {
        const frame = ownData(params, "frame");
        if (ownData(frame, "parentId")) return;
        emit("FRAME", session, { ...diagnosticPath(ownData(frame, "url"), origin, assets),
          frameOrdinal: lineage(frames, ownData(frame, "id")), loaderOrdinal: lineage(loaders, ownData(frame, "loaderId")),
          currentLoaderOrdinal: lineage(loaders, ownData(page, "currentMainFrameLoaderId")),
          previousLoaderOrdinal: lineage(loaders, ownData(ownData(page, "mainFrameLoaderTransition"), "previousLoaderId")) });
      }, sessionId);
      listen("Page.loadEventFired", () => emit("LOAD", session), sessionId);
    }
    listen("Target.attachedToTarget", attach, sessionId);
  }
  const pageSession = id(ownData(page, "sessionId"));
  requireThat(pageSession !== null, "TRACE_PAGE_IDENTITY_MISSING");
  install(pageSession, "PAGE");
  listen("Target.attachedToTarget", attach);
  const owned = ownData(page, "boundarySessionIds");
  try { for (const sessionId of Set.prototype.values.call(owned)) {
    if (sessions.size >= 16 && !sessions.has(sessionId)) { truncated.sessions = true; break; }
    if (id(sessionId)) install(sessionId, sessionId === pageSession ? "PAGE" : "CHILD");
  } } catch {}
  const summary = () => ({ scope: "PASSIVE_OWNED_CDP_EVENTS_ONLY", stopped, sessions: sessions.size, requests: requests.size,
    capturedEvents: events.length, eventsSeen, droppedEvents, retention: "FIRST_192_LAST_192",
    observerErrors, unsubscribeErrors, truncated: { ...truncated } });
  return {
    summary,
    snapshot() {
      const pending = [];
      try {
        for (const [key, value] of Map.prototype.entries.call(ownData(page, "inflight"))) {
          if (pending.length === 8) break;
          const sessionId = id(ownData(value, "sessionId")), session = sessions.get(sessionId);
          const requestId = sessionId === pageSession ? id(key) : typeof key === "string" && sessionId && key.startsWith(sessionId + ":") ? id(key.slice(sessionId.length + 1)) : null;
          pending.push({ pendingOrdinal: pending.length, sessionOrdinal: session?.ordinal ?? null,
            requestOrdinal: session && requestId ? requests.get(session.ordinal + ":" + requestId)?.ordinal ?? null : null });
        }
      } catch {}
      return { ...summary(), events: events.map((event) => ({ ...event })), pending };
    },
    stop() {
      if (!stopped) {
        stopped = true;
        for (const unsubscribe of off) { try { unsubscribe(); } catch { unsubscribeErrors++; } }
        awaitingOwnership.clear();
      }
      return summary();
    },
  };
}

/** Failure-only memory read; no idle reconciliation, requests or mutation. */
export function inflightFailureSnapshot(page, { origin, assets, ledger, now }) {
  const pending = ownData(page, "inflight");
  const output = { state: "UNAVAILABLE", pendingCount: null, truncated: false, entries: [],
    serverRecordsConsidered: 0, serverRecordsTruncated: false, serverRecordsAreNotCdpCompletionProof: true };
  let iterator;
  try {
    iterator = Map.prototype.entries.call(pending);
    output.pendingCount = Object.getOwnPropertyDescriptor(Map.prototype, "size").get.call(pending);
  } catch { return output; }
  const methods = ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "CONNECT", "TRACE"];
  const resources = ["Document", "Stylesheet", "Image", "Media", "Font", "Script", "TextTrack", "XHR", "Fetch",
    "Prefetch", "EventSource", "WebSocket", "Manifest", "SignedExchange", "Ping", "CSPViolationReport", "Preflight", "Other"];
  const closed = (value, choices) => choices.includes(value) ? value : "UNKNOWN";
  const identity = (value) => typeof value === "string" && value.length > 0 && value.length <= 256
    || Number.isInteger(value) && value >= 0;
  const relation = (left, right) => typeof left === typeof right && identity(left) && identity(right)
    ? left === right ? "SAME" : "DIFFERENT" : "UNKNOWN";
  const status = (value) => Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
  const counts = new Map(), ledgerLength = Array.isArray(ledger) ? ownData(ledger, "length") : 0;
  output.serverRecordsTruncated = ledgerLength > 256;
  for (let i = 0; i < Math.min(ledgerLength, 256); i++) {
    const row = ownData(ledger, String(i)), path = diagnosticPath(ownData(row, "target"), origin, assets, true);
    output.serverRecordsConsidered++;
    const method = closed(ownData(row, "method"), methods);
    if (path.pathSha256 && status(ownData(row, "status")) !== null) {
      const key = method + ":" + path.pathSha256;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const transition = ownData(page, "mainFrameLoaderTransition");
  for (let i = 0; i < Math.min(output.pendingCount, 8); i++) {
    const request = iterator.next().value[1], response = ownData(request, "responseRecord");
    const responseDescriptor = request && typeof request === "object" ? Object.getOwnPropertyDescriptor(request, "responseRecord") : null;
    const path = diagnosticPath(ownData(request, "url"), origin, assets);
    const method = closed(ownData(request, "method"), methods), session = ownData(request, "sessionId");
    const sessionRelation = relation(session, ownData(page, "sessionId"));
    const observed = ownData(request, "observedAtMs"), age = Number.isFinite(observed) && observed >= 0
      && Number.isFinite(now) && now >= observed ? now - observed : null;
    const sw = ownData(request, "responseFromServiceWorker");
    output.entries.push({ ordinal: i, ...path, method, resourceType: closed(ownData(request, "type"), resources),
      targetClass: sessionRelation === "SAME" ? "PAGE" : sessionRelation === "DIFFERENT" && ownData(request, "targetType") === "worker-or-child" ? "CHILD" : "UNKNOWN",
      sessionRelation, generationRelation: relation(ownData(request, "generation"), ownData(page, "recordsGeneration")),
      frameRelation: relation(ownData(request, "frameId"), ownData(page, "mainFrameId")),
      currentLoaderRelation: relation(ownData(request, "loaderId"), ownData(page, "currentMainFrameLoaderId")),
      previousLoaderRelation: relation(ownData(request, "loaderId"), ownData(transition, "previousLoaderId")),
      initiatorType: closed(ownData(request, "initiatorType"), ["parser", "script", "preload", "SignedExchange", "preflight", "other"]),
      responsePresent: responseDescriptor && !Object.hasOwn(responseDescriptor, "value") ? null : !!response && typeof response === "object",
      responseStatus: status(ownData(response, "status")),
      responseFromServiceWorker: typeof sw === "boolean" ? sw : null,
      ageMsCapped: age === null ? null : Math.min(300000, age), ageCapped: age === null ? null : age > 300000,
      samePathServerResponseRecordCount: path.pathSha256 ? counts.get(method + ":" + path.pathSha256) ?? 0 : null });
  }
  output.state = "OBSERVED_READ_ONLY";
  output.truncated = output.pendingCount > output.entries.length;
  return output;
}

export function rawDocumentMetadata(html) {
  const decode = (value) => value.replace(/&(?:amp|lt|gt|quot|#39);/g,
    (entity) => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" })[entity]);
  const tag = [...html.matchAll(/<meta\b[^>]*>/giu)].find((m) => /\sname\s*=\s*(["'])description\1/iu.test(m[0]))?.[0] ?? "";
  return { title: decode(/<title\b[^>]*>([\s\S]*?)<\/title>/iu.exec(html)?.[1]?.trim() ?? ""),
    description: decode(/\scontent\s*=\s*(["'])([\s\S]*?)\1/iu.exec(tag)?.[2] ?? "") };
}

export function safeNetworkUrl(value) {
  try {
    const u = new URL(value, "http://127.0.0.1");
    return `${u.origin === "http://127.0.0.1" ? "" : u.origin}${u.pathname}`.slice(0, 240);
  } catch { return "INVALID_URL"; }
}

/** Raw target boundary; URL parsing must not normalize hostile selectors. */
export function classifyRequest(method, target, assets) {
  if (typeof target !== "string" || !target.startsWith("/") || /[%\\\s?#\u0000-\u001f]/u.test(target)
    || target.includes("//") || target.split("/").some((part) => part === "." || part === "..")) return { kind: "refused" };
  if (method === "POST" && target === "/api/research/referral/resolve") return { kind: "resolve_fixture" };
  if (method === "GET" && Object.hasOwn(READ_ONLY_GET_FIXTURES, target)) return { kind: "readonly_fixture", path: target };
  if (target.startsWith("/api/")) return { kind: "refused" };
  if (method !== "GET" && method !== "HEAD") return { kind: "refused" };
  if (ROUTES.includes(target)) return { kind: "document" };
  if (target === "/research" || target.startsWith("/research/") || target === "/r" || target.startsWith("/r/")) return { kind: "refused" };
  const path = target.slice(1);
  if (path && assets.has(path) && path !== "PREVIEW-SOURCE.json"
    && (!/\.html?$/i.test(path) || path === "offline.html")) return { kind: "asset", path };
  return { kind: "refused" };
}

export function validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview }) {
  requireThat([sourceHead, sourceTree, runnerHead, runnerTree].every((x) => SHA.test(x ?? "")), "SOURCE_IDENTITY_INVALID");
  requireThat(preview?.sourceHead === sourceHead && preview?.sourceTree === sourceTree && preview?.executedCommit === runnerHead
    && preview?.executedTree === runnerTree && preview?.node === "v20.19.0", "PREVIEW_SOURCE_MISMATCH");
  requireThat(Array.isArray(runnerParents) && runnerParents.every((p) => SHA.test(p))
    && Array.isArray(preview.executedParents) && preview.executedParents.length === runnerParents.length
    && preview.executedParents.every((p, i) => p === runnerParents[i]), "PREVIEW_PARENT_MISMATCH");
  const direct = runnerHead === sourceHead;
  const baseHead = preview.baseHead;
  requireThat((baseHead === null && direct) || SHA.test(baseHead ?? ""), "BASE_IDENTITY_INVALID");
  requireThat(direct ? sourceTree === runnerTree : baseHead !== null && runnerParents.length === 2
    && runnerParents[0] === baseHead && runnerParents[1] === sourceHead, "RUNNER_GRAPH_MISMATCH");
  const sourceAndRunnerTreeEqual = sourceTree === runnerTree;
  return { sourceHead, sourceTree, baseHead, runnerHead, runnerTree, executedParents: [...runnerParents],
    checkoutKind: direct ? "DIRECT_SOURCE_CHECKOUT" : "PR_MERGE_CHECKOUT", sourceAndRunnerTreeEqual,
    evidenceScope: sourceAndRunnerTreeEqual ? "EXECUTED_TREE_EQUAL_TO_SOURCE_TREE" : "EXECUTED_COMPOSITION_ONLY",
    evidenceCommit: runnerHead, evidenceTree: runnerTree };
}

export function validateIsolation({ uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs }) {
  requireThat(Number.isInteger(uid) && uid > 0, "PRIVILEGE_DROP_MISSING");
  requireThat(/^net:\[\d+\]$/.test(netNamespace ?? "") && /^net:\[\d+\]$/.test(parentNetNamespace ?? "")
    && netNamespace !== parentNetNamespace, "NETWORK_NAMESPACE_MISSING");
  requireThat(Array.isArray(interfaces) && interfaces.length === 1 && interfaces[0] === "lo", "NETWORK_INTERFACE_ESCAPE");
  requireThat(Array.isArray(routes) && routes.length === 0 && /^0+$/.test(effectiveCaps) && noNewPrivs === "1", "NETWORK_PRIVILEGE_ESCAPE");
  return { uid, netNamespace, parentNetNamespace, interfaces, routes, effectiveCaps, noNewPrivs };
}

export function validateFontCalibration(sample, { width, font }) {
  const expectedMedia = font === 16;
  requireThat(sample && sample.width === width && sample.dpr === 1 && sample.scale === 1
    && Math.abs(sample.root - font) < 0.05 && Math.abs(sample.rem - font) < 0.05
    && sample.emMedia === expectedMedia, "FONT_CAPABILITY_NOT_EXECUTED");
  return sample;
}

/** Same child, no reset: reserve cleanup and a small diagnostic-settlement tail. */
export function ownedStartupBudget(deadline, now) {
  return Math.max(0, Math.min(45000, Math.floor(deadline - now - 25000 - 1500)));
}

/** Receipt validation is not a substitute for the real captured closes below. */
export function validateProfileReceipts(receipts) {
  requireThat(receipts.length === CONFIGURATIONS.length, "PROFILE_CONFIGURATION_INCOMPLETE");
  const profiles = new Set(), processes = new Set();
  for (let i = 0; i < receipts.length; i++) {
    const r = receipts[i], processIdentity = `${r.browserPid}:${r.browserStartTicks}`;
    requireThat(r.configuration === CONFIGURATIONS[i].name && typeof r.profile === "string" && r.profile.startsWith("/")
      && !profiles.has(r.profile) && Number.isInteger(r.browserPid) && r.browserPid > 0
      && /^\d+$/.test(r.browserStartTicks ?? "") && !processes.has(processIdentity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
    requireThat(r.cleanup?.page === true && r.cleanup?.cdp === true && r.cleanup?.browserExit === true
      && r.cleanup?.profileRemoved === true, "PROFILE_CLEANUP_UNCONFIRMED");
    requireThat(Number.isFinite(r.startedMs) && Number.isFinite(r.closedMs) && r.closedMs >= r.startedMs
      && (!i || r.startedMs >= receipts[i - 1].closedMs), "PROFILE_LIFETIME_OVERLAP");
    profiles.add(r.profile); processes.add(processIdentity);
  }
  return true;
}

export function assertInventorySafe(root) {
  const visit = (directory) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name), info = lstatSync(path);
      requireThat(!info.isSymbolicLink(), "DIST_SYMLINK_REFUSED");
      if (info.isDirectory()) visit(path); else requireThat(info.isFile(), "DIST_SPECIAL_FILE_REFUSED");
    }
  };
  requireThat(lstatSync(root).isDirectory() && !lstatSync(root).isSymbolicLink(), "DIST_ROOT_INVALID");
  visit(root);
}

const FONT_SAMPLE = (width) => `(() => {
  const e = document.createElement('div'); e.style.cssText = 'width:1rem;height:1rem;position:absolute;visibility:hidden';
  document.documentElement.append(e); const rem = e.getBoundingClientRect().width; e.remove();
  return {width:innerWidth,dpr:devicePixelRatio,scale:visualViewport.scale,
    root:parseFloat(getComputedStyle(document.documentElement).fontSize),rem,
    emMedia:matchMedia('(min-width:${width / 24}em)').matches};
})()`;

/** All browser requests stay attributed, even if page helpers reset telemetry. */
function observeRequests(conn, targetOrigin, violations) {
  const observe = ({ request }) => {
    if (!request) return;
    let allowed = false;
    try {
      const url = new URL(request.url);
      allowed = url.origin === targetOrigin && (request.method === "GET" || request.method === "HEAD"
        || request.method === "POST" && url.pathname === "/api/research/referral/resolve" && !url.search);
      if (["data:", "blob:", "about:"].includes(url.protocol)) allowed = true;
    } catch {}
    if (!allowed) violations.push({ method: request.method, target: safeNetworkUrl(request.url), reason: "OFF_CONTRACT_REQUEST" });
  };
  return conn.on("Network.requestWillBeSent", observe);
}

async function run() {
  const repo = realpathSync(resolve(dirname(fileURLToPath(import.meta.url)), "../.."));
  const env = process.env;
  const started = Number(env.XR_QA_STARTED_MS), deadline = started + 300000;
  const result = {
    schemaVersion: 1, kind: "OWNED_RUNNER_FRONTEND_BROWSER_QA", scope: "LOCAL_STATIC_404_FIXTURE_ONLY",
    qualifiedBaseline: QUALIFIED_BASELINE, qualifiedBaselineTree: QUALIFIED_BASELINE_TREE,
    productionQualified: false, managedAuthQualified: false, fullReleaseQualified: false,
    startedAt: new Date(started).toISOString(), state: "INCOMPLETE", phase: "capability",
    run: { id: env.XR_QA_RUN_ID, attempt: env.XR_QA_RUN_ATTEMPT, jobKey: env.XR_QA_JOB_KEY,
      numericJobId: env.XR_QA_JOB_ID || null, runnerImage: env.XR_QA_RUNNER_IMAGE,
      repository: "teamxenios/xenios-website" },
    captures: [], requests: [], violations: [], cleanup: {}, browserProfiles: [], pageChecks: [],
    wholesale: { packet: WHOLESALE_PACKET, scope: "LOCAL_PUBLIC_UNAVAILABLE_FIXTURES_ONLY", cases: [
      { id: "W01", status: "NOT_RUN", plannedParts: "heading/landmarks/metadata/public page with locked fixture gate" },
      { id: "W02", status: "NOT_RUN", reason: "Alias/query navigation excluded" },
      { id: "W03", status: "NOT_RUN", plannedParts: "unavailable anchors/observed focus/no form" },
      { id: "W04", status: "NOT_RUN", reason: "Destination navigation excluded; href inspection only" },
      { id: "W05", status: "NOT_RUN", plannedParts: "format/boundary text and DOM layout; middle cards lack separate PNGs" },
      { id: "W06", status: "NOT_RUN", reason: "375/1440/font cases planned;320 remains NOT_RUN" },
      { id: "W07", status: "NOT_RUN", reason: "Ready form excluded" },
      { id: "W08", status: "NOT_RUN", reason: "Forty-row ready-form interaction excluded" },
      { id: "W09", status: "NOT_RUN", reason: "Submission/uncertainty fixture not authorized" },
      { id: "W10", status: "NOT_RUN", plannedParts: "local source/fixture/capture correlation, no live deployment" },
    ] },
  };
  const out = realpathSync(env.XR_QA_OUT);
  const write = (name, value) => {
    requireThat(/^[a-z0-9][a-z0-9.-]+$/.test(name), "OUTPUT_NAME_INVALID");
    const bytes = Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value, null, 2) + "\n");
    writeFileSync(join(out, name), bytes, { flag: "wx", mode: 0o600 });
    return { file: name, bytes: bytes.length, sha256: hash(bytes) };
  };
  let browser, conn, page, preview, snapshot, observerOff, cleanupPromise, launchStarted = false, stopped = false;
  let activeProfile, closeConfigurationPromise, activePageCheck, pageEventTrace, diagnosticAssets = new Set();
  let watchdog;
  const bounded = (work, ceiling = 15000, cleanup = false) => {
    const remaining = deadline - Date.now() - (cleanup ? 3000 : 25000);
    const ms = Math.min(remaining, ceiling);
    if (ms <= 0) { void Promise.resolve(work).catch(() => {}); return Promise.reject(new Error("OVERALL_DEADLINE")); }
    let timer;
    return Promise.race([work, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("BOUNDED_OPERATION_TIMEOUT")), ms); })])
      .finally(() => clearTimeout(timer));
  };
  const setPhase = (phase) => { result.phase = phase; };
  try {
    requireThat(process.platform === "linux" && env.XR_QA_ACTIONS === "true"
      && Number.isFinite(started) && Date.now() >= started && Date.now() - started < 60000, "ACTIONS_CAPABILITY_MISSING");
    requireThat(/^\d+$/.test(env.XR_QA_RUN_ID ?? "") && /^\d+$/.test(env.XR_QA_RUN_ATTEMPT ?? "")
      && /^[a-zA-Z0-9_-]+$/.test(env.XR_QA_JOB_KEY ?? ""), "ACTIONS_IDENTITY_INVALID");
    const status = readFileSync("/proc/self/status", "utf8");
    result.isolation = validateIsolation({ uid: process.getuid(), netNamespace: readlinkSync("/proc/self/ns/net"),
      parentNetNamespace: env.XR_QA_PARENT_NET_NS,
      interfaces: JSON.parse(execFileSync("/usr/sbin/ip", ["-j", "link", "show"], { encoding: "utf8" })).map((i) => i.ifname).sort(),
      routes: [[], ["-6"]].flatMap((family) => JSON.parse(execFileSync("/usr/sbin/ip", [...family, "-j", "route", "show", "table", "main"], { encoding: "utf8" }))),
      effectiveCaps: /^CapEff:\s*(\w+)/m.exec(status)?.[1] ?? "unknown",
      noNewPrivs: /^NoNewPrivs:\s*(\d+)/m.exec(status)?.[1] ?? "unknown" });
    requireThat(/^pid:\[\d+\]$/.test(env.XR_QA_PARENT_PID_NS ?? "")
      && readlinkSync("/proc/self/ns/pid") !== env.XR_QA_PARENT_PID_NS, "PID_NAMESPACE_MISSING");
    result.isolation.pidNamespace = readlinkSync("/proc/self/ns/pid");
    const osRelease = readFileSync("/etc/os-release", "utf8");
    result.runner = { platform: process.platform, arch: process.arch, kernel: kernelRelease(),
      osId: /^ID=(.*)$/m.exec(osRelease)?.[1] ?? null, versionId: /^VERSION_ID=(.*)$/m.exec(osRelease)?.[1] ?? null };
    const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    requireThat(!git("status", "--porcelain=v1", "--untracked-files=all"), "CHECKOUT_DIRTY");
    const sourceHead = env.XR_QA_SOURCE_HEAD, sourceTree = git("rev-parse", `${sourceHead}^{tree}`);
    requireThat(SHA.test(sourceHead ?? "") && sourceTree === env.XR_QA_SOURCE_TREE, "EXPECTED_SOURCE_MISMATCH");
    const runnerHead = git("rev-parse", "HEAD"), runnerTree = git("rev-parse", "HEAD^{tree}");
    git("merge-base", "--is-ancestor", QUALIFIED_BASELINE, runnerHead);
    const runnerParents = git("show", "-s", "--format=%P", runnerHead).split(/\s+/).filter(Boolean);
    const markerBytes = readFileSync(join(repo, "dist/public/PREVIEW-SOURCE.json"));
    const marker = JSON.parse(markerBytes);
    result.source = validateSourceBinding({ sourceHead, sourceTree, runnerHead, runnerTree, runnerParents, preview: marker });
    if (marker.baseHead !== null) requireThat(git("rev-parse", `${marker.baseHead}^{commit}`) === marker.baseHead, "BASE_COMMIT_MISSING");
    result.previewMarker = { bytes: markerBytes.length, sha256: hash(markerBytes) };
    const runtime = assertPinnedExecutingRuntime();
    result.runtime = { nodeVersion: runtime.nodeVersion, npmVersion: runtime.npmVersion };
    result.sources = OWNED_SOURCES.map((path) => ({ path, sha256: hash(readFileSync(join(repo, path))) }));
    result.wholesale.sourceRebind = { source: result.source,
      actualPageBlob: git("rev-parse", "HEAD:client/src/research/b2b/OrganizationAccessPage.tsx"),
      preparedPageBlob: WHOLESALE_PACKET.adoptedPageBlob, metadataExpected: WHOLESALE_EXPECTED,
      finalSourceHashes: result.sources.filter((s) => s.path.includes("/b2b/") || s.path.includes("raw-http-document-policy")
        || s.path.includes("routes.public.json") || s.path.includes("/research/core") || s.path.includes("/research/layout")
        || s.path.includes("/research/section") || s.path.includes("/lib/config") || s.path.includes("/lib/supabaseBrowser")) };
    result.packageLockSha256 = result.sources.find((s) => s.path === "package-lock.json").sha256;
    const publicRoot = join(repo, "dist/public");
    assertInventorySafe(publicRoot);
    const inventory = inventoryDirectory(publicRoot), inventoryHash = inventorySha256(inventory);
    diagnosticAssets = new Set(inventory.map((file) => file.path));
    result.build = { inventory, inventorySha256: inventoryHash };
    snapshot = createImmutableDistSnapshot({ repoRoot: repo, sourceDistRoot: publicRoot,
      expectedInventory: inventory, expectedInventorySha256: inventoryHash });
    const stop = (reason) => {
      stopped = true; result.state = "FAILED_OR_NOT_EXECUTED"; result.failure = reason;
      void cleanup().finally(() => process.exit(1));
    };
    watchdog = setTimeout(() => stop("OVERALL_DEADLINE"), Math.max(1, deadline - Date.now() - 18000));
    process.once("SIGTERM", () => stop("TERMINATED"));
    setPhase("preview_start");
    const { startOwnedPreview, UNAVAILABLE_FIXTURE } = await import("./owned-runner-preview.ts");
    preview = await bounded(startOwnedPreview({ root: snapshot.distRoot, inventory, ledger: result.requests }));
    result.fixture = { kind: "STATIC_404_UNAVAILABLE", responseSha256: hash(JSON.stringify(UNAVAILABLE_FIXTURE)),
      realServerApiQualified: false, persistence: false };
    const chrome = realpathSync(env.XR_QA_CHROME);
    requireThat(lstatSync(chrome).isFile(), "CHROME_BINARY_INVALID");
    result.browserLauncher = { path: chrome, sha256: hash(readFileSync(chrome)) };
    for (const config of CONFIGURATIONS) {
      requireThat(!browser && !conn && !page && !launchStarted && !stopped
        && deadline - Date.now() > 25000, "PREVIOUS_PROFILE_NOT_CLOSED_OR_DEADLINE");
      closeConfigurationPromise = null;
      activeProfile = { configuration: config.name, startedMs: Date.now(), profile: null,
        browserPid: null, browserStartTicks: null, closedMs: null, cleanup: null };
      result.browserProfiles.push(activeProfile);
      setPhase(`${config.name}_browser_start`);
      const startupBudgetMs = ownedStartupBudget(deadline, Date.now());
      requireThat(startupBudgetMs > 0, "OVERALL_DEADLINE");
      activeProfile.startupBudgetMs = startupBudgetMs;
      launchStarted = true;
      browser = await bounded(launchChromium({ chromePath: chrome, timeoutMs: startupBudgetMs, onSpawned(handle) {
        // Capture ownership before readiness can reject. Do not require a live
        // /proc entry yet: a genuine early exit may already have removed it.
        browser = handle;
        activeProfile.profile = handle.userDataDir;
        activeProfile.browserPid = handle.process.pid ?? null;
        activeProfile.launchDiagnostics = handle.diagnostics();
        activeProfile.browserStartTicks = activeProfile.launchDiagnostics.startupObservations.find((o) => o.available && o.startTicks)?.startTicks ?? null;
      } }), startupBudgetMs + 1200);
      activeProfile.launchDiagnostics = browser.diagnostics();
      const processStat = readFileSync(`/proc/${browser.process.pid}/stat`, "utf8");
      const readyStartTicks = processStat.slice(processStat.lastIndexOf(")") + 2).trim().split(/\s+/)[19];
      requireThat(activeProfile.browserStartTicks === null || activeProfile.browserStartTicks === readyStartTicks, "BROWSER_PROCESS_IDENTITY_CHANGED");
      activeProfile.browserStartTicks = readyStartTicks;
      requireThat(Number.isInteger(activeProfile.browserPid) && /^\d+$/.test(activeProfile.browserStartTicks ?? ""), "BROWSER_PROCESS_IDENTITY_MISSING");
      const executable = realpathSync(`/proc/${browser.process.pid}/exe`);
      activeProfile.binary = { path: executable, sha256: hash(readFileSync(executable)) };
      activeProfile.browser = { version: browser.browserVersion, protocol: browser.protocolVersion, sandboxDisabled: false };
      activeProfile.identity = hash(JSON.stringify([activeProfile.browserPid, activeProfile.browserStartTicks, activeProfile.profile]));
      requireThat(!result.browserProfiles.slice(0, -1).some((r) => r.profile === activeProfile.profile
        || r.identity === activeProfile.identity), "PROFILE_IDENTITY_REUSED_OR_MISSING");
      conn = await bounded(new CdpConnection(browser.wsUrl).open());
      observerOff = observeRequests(conn, preview.origin, result.violations);
      await bounded(conn.send("Browser.setDownloadBehavior", { behavior: "deny" }));
      const beginRoute = (route) => {
        setPhase(`${config.name}_${route === "/" ? "home" : route === WHOLESALE_ROUTE ? "wholesale" : "recipient"}`);
        activePageCheck = { configuration: config.name, route, expectedText: route === "/" ? "Browse Peptides & Supplements"
          : route === WHOLESALE_ROUTE ? WHOLESALE_EXPECTED.unavailable : "We cannot check this recommendation right now.",
          checks: [] };
        result.pageChecks.push(activePageCheck);
      };
      beginRoute(ROUTES[0]);
      const setupChecks = activePageCheck.checks;
      await visitConfigurationPage({
        create: () => runPageCheck("PAGE_CREATE", () => bounded(PageSession.create(conn)), setupChecks),
        own: (ownedPage) => {
          page = ownedPage;
          requireThat(typeof page.targetId === "string" && page.targetId.length > 0
            && typeof page.sessionId === "string" && page.sessionId.length > 0, "PROFILE_PAGE_IDENTITY_MISSING");
          activeProfile.pageLifetime = { identity: hash(JSON.stringify([activeProfile.identity, page.targetId, page.sessionId])),
            createdMs: Date.now(), routes: [] };
          pageEventTrace = observeOwnedCdpEvents(conn, page, { origin: preview.origin, assets: diagnosticAssets });
        },
        configure: (ownedPage) => runPageCheck("NETWORK_BOUNDARY_SETUP", () => bounded(ownedPage.enforceNetworkBoundary(preview.origin,
          configurationBoundaryOptions(preview.origin, result.violations))), setupChecks),
        visit: async (ownedPage, route) => {
        requireThat(ownedPage === page, "PROFILE_PAGE_OWNERSHIP_CHANGED");
        if (route !== ROUTES[0]) beginRoute(route);
        const routeName = route === "/" ? "home" : route === WHOLESALE_ROUTE ? "wholesale" : "recipient";
        const requestStart = result.requests.length;
        activeProfile.pageLifetime.routes.push(route);
        activePageCheck.pageIdentity = activeProfile.pageLifetime.identity;
        const check = (name, operation) => runPageCheck(name, operation, activePageCheck.checks);
        const pageOff = conn.on("Network.requestWillBeSent", (p) => {
          if (!p.request) return;
          let u;
          try { u = new URL(p.request.url); } catch { return; }
          const safe = u.origin === preview.origin && (p.request.method === "GET" || p.request.method === "HEAD"
            || p.request.method === "POST" && u.pathname === "/api/research/referral/resolve" && !u.search);
          if (!safe && !["data:", "blob:"].includes(u.protocol)) result.violations.push({ target: safeNetworkUrl(u.href), reason: "PAGE_REQUEST_BLOCKED_OR_OFF_CONTRACT" });
        }, page.sessionId);
        await check("VIEWPORT_SETUP", () => bounded(page.setViewport({ width: config.width, height: config.height, deviceScaleFactor: 1 })));
        try {
          await check("FONT_SETUP", () => bounded(page.send("Page.setFontSizes", { fontSizes: { standard: config.font, fixed: config.font === 16 ? 13 : 26 } })));
          await check("BLANK_FONT_CALIBRATION", async () => {
            await bounded(page.navigate("about:blank", { quietMs: 50, maxSettleMs: 1000, loadTimeoutMs: 3000 }));
            const sample = await bounded(page.evaluate(FONT_SAMPLE(config.width)));
            activePageCheck.blankFont = pageFailureMetrics(sample);
            validateFontCalibration(sample, config);
          });
        } catch { throw new Error("FONT_CAPABILITY_NOT_EXECUTED"); }
        let rawDocument;
        if (route === WHOLESALE_ROUTE) {
          await check("RAW_DOCUMENT", async () => {
          const response = await bounded(fetch(preview.origin + route, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(3000) }));
          const html = await bounded(response.text());
          rawDocument = { client: "OWNED_NODE_HTTP_READ", status: response.status,
            robots: response.headers.get("x-robots-tag"), cacheControl: response.headers.get("cache-control"),
            referrerPolicy: response.headers.get("referrer-policy"), bodySha256: hash(html), ...rawDocumentMetadata(html) };
          requireThat(rawDocument.status === 200 && rawDocument.robots?.includes("noindex")
            && rawDocument.cacheControl === "no-store" && rawDocument.referrerPolicy === "no-referrer"
            && rawDocument.title === WHOLESALE_EXPECTED.title && rawDocument.description === WHOLESALE_EXPECTED.description,
          "WHOLESALE_RAW_DOCUMENT_METADATA_MISMATCH");
          });
        }
        await check("DOCUMENT_NAVIGATE", () => bounded(page.navigate(preview.origin + route, { quietMs: 150, maxSettleMs: 5000, loadTimeoutMs: 8000 })));
        await check("EXPECTED_UI_TEXT", () => waitForText(page, activePageCheck.expectedText, bounded));
        const font = await check("DOCUMENT_FONT_CALIBRATION", async () => {
          const sample = await bounded(page.evaluate(FONT_SAMPLE(config.width)));
          activePageCheck.documentFont = pageFailureMetrics(sample);
          return validateFontCalibration(sample, config);
        });
        const audit = await check("PAGE_AUDIT", () => bounded(page.evaluate(PAGE_AUDIT_SOURCE)));
        const view = await check("PAGE_VIEW", () => bounded(page.evaluate(`({ text:document.body.innerText, title:document.title,
          description:document.querySelector('meta[name="description"]')?.content ?? '',
          h1:document.querySelectorAll('h1').length,
          h1Text:document.querySelector('h1')?.textContent?.trim() ?? '',
          h3:[...document.querySelectorAll('h3')].map(e=>e.textContent.trim()),
          passwordInputs:document.querySelectorAll('input[type="password"]').length,
          inquiryFields:document.querySelector('#organization-inquiry')?.querySelectorAll('form,input,select,textarea').length ?? 0,
          fitHeadingPresent:!!document.getElementById('organization-fit-heading'),
          infinityStatus:(() => {
            const badge=document.querySelector('#infinity [data-copy="infinity.status"]');
            if(!badge) return {text:'',rendered:false,inViewport:false};
            const r=badge.getBoundingClientRect(); let rendered=r.width>0&&r.height>0;
            for(let node=badge;rendered&&node;node=node.parentElement) {
              const style=getComputedStyle(node);
              if(style.display==='none'||style.visibility==='hidden'||style.visibility==='collapse'||Number(style.opacity)===0) rendered=false;
            }
            return {text:badge.innerText,rendered,inViewport:rendered&&r.bottom>0&&r.top<innerHeight};
          })(),
          main:document.querySelectorAll('main').length, overflow:document.documentElement.scrollWidth > innerWidth + 1,
          robots:document.querySelector('meta[name="robots"]')?.content ?? '',
          authorityTags:document.querySelectorAll('link[rel="canonical"],meta[property^="og:"],script[type="application/ld+json"]').length,
          controls:[...document.querySelectorAll('a,button')].map(e=>({text:e.textContent.trim(),href:e.getAttribute('href'),
            height:e.getBoundingClientRect().height,disabled:!!e.disabled})).filter(e=>e.height>0) })`)));
        const assertions = await check("UI_ASSERTION_BUILD", () => {
        const assertions = [
          { name: "one_heading_and_main", passed: view.h1 === 1 && view.main === 1 },
          { name: "no_horizontal_overflow", passed: !view.overflow },
          { name: "actual_default_font_calibrated", passed: true },
          { name: "no_duplicate_ids", passed: audit.duplicateIds.length === 0 },
          { name: "no_unlabelled_controls", passed: audit.forms.unlabelledControls.length === 0 },
          { name: "no_invalid_aria_references", passed: audit.invalidAriaRefs.length === 0 },
          { name: "no_missing_image_alt", passed: audit.images.missingAlt.length === 0 },
          { name: "no_clipped_text", passed: audit.overflow.clippedText.length === 0 },
        ];
        if (route === "/") assertions.push(
          { name: "home_offerings", passed: view.text.includes("Tensa Health") && view.text.includes("Browse Peptides & Supplements") },
          { name: "infinity_in_development", passed: view.text.includes("Infinity") && hasInfinityDevelopmentBadge(view.infinityStatus) },
          { name: "home_cta_and_category_hrefs", passed: view.controls.some((c) => c.text === "Browse Peptides & Supplements" && c.href === "/earlyaccess")
            && ["clinical", "research_peptides", "supplements", "topicals"].every((category) => view.controls.some((c) => c.href === `/earlyaccess?category=${category}`)) });
        else if (route === WHOLESALE_ROUTE) assertions.push(
          { name: "wholesale_heading_and_metadata", passed: view.h1Text === WHOLESALE_EXPECTED.heading
            && view.title === WHOLESALE_EXPECTED.title && view.description === WHOLESALE_EXPECTED.description },
          { name: "wholesale_unavailable_no_auth_or_form", passed: view.text.includes(WHOLESALE_EXPECTED.unavailable)
            && view.passwordInputs === 0 && view.inquiryFields === 0 && view.fitHeadingPresent },
          { name: "wholesale_five_formats", passed: ["Vials", "Nasal sprays", "Capsules", "Strips", "Tablets"].every((label) => view.h3.includes(label)) },
          { name: "wholesale_boundaries_price_free", passed: view.text.includes("Wholesale and organization-specific terms remain private and human-approved.")
            && view.text.includes("A clinic's Research account never authorizes treatment, prescribing, telehealth, or pharmacy fulfillment.")
            && !/\$\s*\d|\bUSD\s*\d|\b\d+(?:\.\d{2})?\s*(?:USD|dollars)\b/i.test(view.text) },
          { name: "wholesale_safe_hrefs", passed: view.controls.some((c) => c.text === "Contact support" && c.href === "/research/support")
            && view.controls.some((c) => c.text === "Browse the catalog" && c.href === "/earlyaccess") },
          { name: "wholesale_noindex", passed: view.robots.includes("noindex") });
        else assertions.push(
          { name: "recipient_unavailable_truthful", passed: view.text.includes("We cannot check this recommendation right now.") && !view.text.includes("invalid, expired") },
          { name: "recipient_noindex", passed: view.robots.includes("noindex") },
          { name: "recipient_no_authority_tags", passed: view.authorityTags === 0 },
          { name: "recipient_controls_44px", passed: ["Try again", "Explore Xenios Health", "Research support", "Care support"].every((text) => view.controls.some((c) => c.text === text && c.height >= 44)) });
        return assertions;
        });
        activePageCheck.assertions = assertions;
        const slug = `${config.name}-${routeName}`;
        const screenshot = await check("SCREENSHOT", async () => {
          const image = await bounded(page.screenshot({ fullPage: false }));
          requireThat(image.coverage.capturedWidthPx === config.width && image.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
          return image;
        });
        const capture = await check("CAPTURE_WRITE", () => ({ route, configuration: config, browserIdentity: activeProfile.identity,
          pageIdentity: activeProfile.pageLifetime.identity, font, audit, assertions,
          ...(rawDocument ? { rawDocument } : {}),
          screenshot: write(`${slug}.png`, screenshot.bytes), text: write(`${slug}.text.json`, view),
          screenshotCoverage: screenshot.coverage, network: [] }));
        result.captures.push(capture);
        if (route === "/" && config.font === 32) {
          activePageCheck.homeDismissalProgress = {};
          capture.homeDismissal = await homeInstallDismissalProof(page, config, bounded, activePageCheck.homeDismissalProgress);
          delete activePageCheck.homeDismissalProgress;
          const dismissed = await bounded(page.screenshot({ fullPage: false }));
          requireThat(dismissed.coverage.capturedWidthPx === config.width && dismissed.coverage.capturedHeightPx === config.height,
            "SCREENSHOT_VIEWPORT_MISMATCH");
          capture.homeDismissal.screenshot = write(`${slug}-post-dismiss.png`, dismissed.bytes);
          capture.homeDismissal.screenshotCoverage = dismissed.coverage;
          capture.homeDismissal.screenshotState = capture.homeDismissal.nativeDismissExecuted
            ? "AFTER_NATIVE_DISMISS_AND_FOCUS" : "BANNER_ABSENT_WITHOUT_DISMISS";
        }
        if (config.name === "phone100" && route !== WHOLESALE_ROUTE) {
          activePageCheck.keyboardProgress = {};
          capture.keyboard = await keyboardProof(page, route, bounded, activePageCheck.keyboardProgress);
          delete activePageCheck.keyboardProgress;
          const focused = await bounded(page.screenshot({ fullPage: false }));
          capture.focusScreenshot = write(`${slug}-focus.png`, focused.bytes);
        }
        if (route === WHOLESALE_ROUTE) {
          if (config.name === "phone100") {
            activePageCheck.keyboardProgress = {};
            capture.keyboard = await wholesaleKeyboardProof(page, bounded, activePageCheck.keyboardProgress);
            delete activePageCheck.keyboardProgress;
          }
          // Capture positioning only; the keyboard observations above precede it.
          await bounded(page.evaluate("document.getElementById('organization-inquiry').scrollIntoView({block:'start',behavior:'instant'}); new Promise(r=>requestAnimationFrame(()=>r(true)))"));
          const section = await bounded(page.screenshot({ fullPage: false }));
          requireThat(section.coverage.capturedWidthPx === config.width && section.coverage.capturedHeightPx === config.height, "SCREENSHOT_VIEWPORT_MISMATCH");
          capture.sectionScreenshot = write(`${slug}-inquiry.png`, section.bytes);
          capture.fixtureRequests = result.requests.slice(requestStart).filter((r) => r.kind === "STATIC_READONLY_UNAVAILABLE_FIXTURE");
          requireThat(capture.fixtureRequests.some((r) => r.target.endsWith("/api/research/business-inquiries/config") && r.status === 503), "WHOLESALE_UNAVAILABLE_FIXTURE_NOT_OBSERVED");
        }
        await settlePostInteractionNetwork(page, bounded);
        capture.network = { violations: page.networkBoundaryViolations.map((v) => ({ target: safeNetworkUrl(v.url), reason: v.reason })),
          fulfillmentCount: page.networkBoundaryFulfillments.length, pending: page.inflight.size,
          pendingTargets: page.boundaryTargetPromises.size, setupErrors: page.boundarySetupErrors.length,
          console: page.console.map(({ level, text }) => ({ level, text: String(text).slice(0, 300) })) };
        result.violations.push(...capture.network.violations);
        assertNetworkBoundaryComplete(capture.network);
        pageOff();
        activePageCheck = null;
        },
      });
      setPhase(`${config.name}_browser_cleanup`);
      const closed = await closeConfiguration();
      requireThat(Object.values(closed).every(Boolean), "PROFILE_CLEANUP_UNCONFIRMED");
    }
    validateProfileReceipts(result.browserProfiles);
    requireThat(new Set(result.browserProfiles.map((profile) => profile.pageLifetime?.identity)).size === CONFIGURATIONS.length
      && result.browserProfiles.every((profile) => /^[a-f0-9]{64}$/u.test(profile.pageLifetime?.identity ?? "")
        && profile.pageLifetime.routes.length === ROUTES.length
        && profile.pageLifetime.routes.every((route, index) => route === ROUTES[index])
        && result.captures.filter((capture) => capture.configuration.name === profile.configuration)
          .every((capture) => capture.pageIdentity === profile.pageLifetime.identity)), "PROFILE_PAGE_LIFETIME_UNCONFIRMED");
    snapshot.assertUnchanged();
    requireThat(inventorySha256(inventoryDirectory(publicRoot)) === inventoryHash, "BUILD_CHANGED_DURING_QA");
    requireThat(OWNED_SOURCES.every((path, i) => hash(readFileSync(join(repo, path))) === result.sources[i].sha256), "SOURCE_CHANGED_DURING_QA");
    result.fixture.counters = JSON.parse(JSON.stringify(preview.counters));
    result.fixture.readOnlyGET = Object.entries(READ_ONLY_GET_FIXTURES).map(([path, f]) => ({ path, status: f.status,
      responseSha256: hash(JSON.stringify(f.body)), count: preview.counters.readOnlyGET[path] }));
    requireThat(preview.counters.resolve404 === 5 && !preview.counters.refused && !preview.counters.unexpected
      && !preview.counters.credentialAttempts, "PREVIEW_REQUEST_CONTRACT_FAILED");
    requireThat(preview.counters.readOnlyGET["/api/config"] >= 1 && preview.counters.readOnlyGET["/api/config"] <= 24
      && preview.counters.readOnlyGET["/api/research/me"] >= 4 && preview.counters.readOnlyGET["/api/research/me"] <= 8
      && preview.counters.readOnlyGET["/api/research/business-inquiries/config"] >= 4
      && preview.counters.readOnlyGET["/api/research/business-inquiries/config"] <= 8, "READONLY_BOOTSTRAP_CENSUS_FAILED");
    requireThat(!result.violations.length, "NETWORK_BOUNDARY_VIOLATION");
    requireThat(!stopped && result.captures.length === 12 && result.captures.every((c) => c.assertions.every((a) => a.passed)), "UI_ASSERTIONS_FAILED");
    for (const item of result.wholesale.cases) {
      if (["W01", "W03"].includes(item.id)) item.status = "PASS_LOCAL_UNAVAILABLE_FIXTURE_ONLY";
      else if (["W05", "W06", "W10"].includes(item.id)) item.status = "PARTIAL_LOCAL_FIXTURE_ONLY";
    }
    result.state = "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY";
    setPhase("complete");
  } catch (error) {
    result.state = "FAILED_OR_NOT_EXECUTED";
    result.failure = /^[A-Z0-9_]+$/.test(error?.message ?? "") ? error.message : "OWNED_QA_FAILED";
    await observePageFailure();
  } finally {
    clearTimeout(watchdog);
    await cleanup();
  }

  function cleanup() { return cleanupPromise ??= performCleanup(); }
  async function observePageFailure() {
    if (!activePageCheck || !page) return;
    const diagnostic = { scope: "LOCAL_PUBLIC_PAGE_FAILURE_DIAGNOSTIC_ONLY", acceptedCapture: false,
      configuration: activePageCheck.configuration, route: activePageCheck.route,
      lastCheck: activePageCheck.checks.at(-1)?.check ?? null,
      metricsState: "NOT_EXECUTED_BUDGET", screenshotState: "NOT_EXECUTED_BUDGET",
      pageState: pageFailureMetrics({ loaded: page.loaded, inflightCount: page.inflight.size,
        boundaryTargetCount: page.boundaryTargetPromises.size, boundarySetupErrorCount: page.boundarySetupErrors.length }) };
    if (activePageCheck.keyboardProgress) diagnostic.keyboardProgress = activePageCheck.keyboardProgress;
    if (activePageCheck.homeDismissalProgress) diagnostic.homeDismissalProgress = activePageCheck.homeDismissalProgress;
    result.failureDiagnostic = diagnostic;
    diagnostic.inflight = inflightFailureSnapshot(page, { origin: preview.origin, assets: diagnosticAssets,
      ledger: result.requests, now: Date.now() });
    if (pageEventTrace) diagnostic.eventTrace = pageEventTrace.snapshot();
    let budget = failureObservationBudget(deadline, Date.now(), 750);
    if (budget > 0) {
      try {
        const sample = await bounded(page.evaluate(`(() => {
          const de=document.documentElement, body=document.body;
          const e=document.createElement('div'); e.style.cssText='width:1rem;position:absolute;visibility:hidden';
          de.append(e); const rem=e.getBoundingClientRect().width; e.remove();
          return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,scale:visualViewport.scale,
            root:parseFloat(getComputedStyle(de).fontSize),rem,scrollWidth:de.scrollWidth,clientWidth:de.clientWidth,
            h1Count:document.querySelectorAll('h1').length,mainCount:document.querySelectorAll('main').length,
            domReady:document.readyState==='complete',bodyPresent:!!body,
            expectedTextPresent:!!body&&body.innerText.includes(${JSON.stringify(activePageCheck.expectedText)}),
            emMedia:matchMedia('(min-width:${CONFIGURATIONS.find((c) => c.name === activePageCheck.configuration).width / 24}em)').matches};
        })()`), budget);
        diagnostic.metrics = pageFailureMetrics(sample);
        diagnostic.metricsState = "OBSERVED";
      } catch { diagnostic.metricsState = "UNAVAILABLE"; }
    }
    budget = failureObservationBudget(deadline, Date.now(), 1500);
    if (budget > 0) {
      try {
        const image = await bounded(page.screenshot({ fullPage: false }), budget);
        diagnostic.screenshot = write(`diagnostic-${activePageCheck.configuration}-${activePageCheck.route === "/" ? "home" : activePageCheck.route === WHOLESALE_ROUTE ? "wholesale" : "recipient"}-failure.png`, image.bytes);
        diagnostic.screenshotState = "OBSERVED_NOT_ACCEPTED_CAPTURE";
      } catch { diagnostic.screenshotState = "UNAVAILABLE"; }
    }
  }
  function closeConfiguration() { return closeConfigurationPromise ??= performConfigurationClose(); }
  async function performConfigurationClose() {
    const status = { page: !page, cdp: !conn, browserExit: !launchStarted, profileRemoved: !launchStarted };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); status[name] = true; } catch { status[name] = false; } };
    observerOff?.(); observerOff = null;
    if (pageEventTrace) await close("eventTrace", () => {
      const initialPending = result.failureDiagnostic?.eventTrace?.pending ?? [];
      const finalTrace = result.failureDiagnostic ? pageEventTrace.snapshot() : null;
      const summary = pageEventTrace.stop();
      if (finalTrace) result.failureDiagnostic.eventTrace = { ...finalTrace, ...summary, failurePending: initialPending };
      if (activeProfile) activeProfile.eventTrace = summary;
      requireThat(summary.unsubscribeErrors === 0, "EVENT_TRACE_CLEANUP_UNCONFIRMED");
      pageEventTrace = null;
    });
    if (page) await close("page", () => page.close());
    if (conn) await close("cdp", () => conn.close());
    if (browser) {
      await close("browserExit", async () => {
        await browser.close();
        if (!await waitForOwnedExit(browser.process, 700)) {
          if (activeProfile) activeProfile.cleanupEscalatedToKill = true;
          browser.process.kill("SIGKILL");
          requireThat(await waitForOwnedExit(browser.process, 1200), "BROWSER_EXIT_UNCONFIRMED");
        }
        // A late writer may have recreated a directory after the first close.
        if (existsSync(browser.userDataDir)) await browser.close();
      });
      status.profileRemoved = !existsSync(browser.userDataDir);
      if (activeProfile) activeProfile.launchDiagnostics = browser.diagnostics();
    }
    if (activeProfile) {
      activeProfile.cleanup = { ...status };
      activeProfile.closedMs = Date.now();
    }
    if (Object.values(status).every(Boolean)) {
      page = null; conn = null; browser = null; launchStarted = false; activeProfile = null;
    }
    return status;
  }
  async function performCleanup() {
    const current = await closeConfiguration();
    result.cleanup = { ...current, completedProfiles: result.browserProfiles.every((r) => r.cleanup
      && Object.values(r.cleanup).every(Boolean)), server: !preview, snapshot: !snapshot };
    const close = async (name, fn) => { try { await bounded(Promise.resolve().then(fn), 3000, true); result.cleanup[name] = true; } catch { result.cleanup[name] = false; } };
    if (preview) await close("server", () => preview.close());
    if (snapshot) await close("snapshot", () => { snapshot.dispose(); requireThat(!existsSync(snapshot.parent), "SNAPSHOT_REMAINS"); });
    if (!Object.values(result.cleanup).every(Boolean)) { result.state = "FAILED_OR_NOT_EXECUTED"; result.failure ??= "CLEANUP_FAILED"; }
    result.finishedAt = new Date().toISOString();
    result.elapsedMs = Date.now() - started;
    write("result.json", result);
  }
  return result.state === "AUTOMATED_PASS_LOCAL_FIXTURE_ONLY" ? 0 : 1;
}

function waitForOwnedExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((done) => {
    const finish = (exited) => { clearTimeout(timer); child.off("exit", exitedHandler); done(exited); };
    const exitedHandler = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once("exit", exitedHandler);
  });
}

async function waitForText(page, text, bounded) {
  for (let i = 0; i < 40; i++) {
    if (await bounded(page.evaluate(`document.body.innerText.includes(${JSON.stringify(text)})`))) return;
    await bounded(new Promise((r) => setTimeout(r, 75)), 200);
  }
  throw new Error("EXPECTED_UI_STATE_MISSING");
}

export async function dispatchActivationKey(page, keyName, bounded) {
  requireThat(keyName === "Enter" || keyName === " ", "ACTIVATION_KEY_INVALID");
  const code = keyName === " " ? "Space" : "Enter", text = keyName === "Enter" ? "\r" : " ";
  for (const type of ["keyDown", "keyUp"]) await bounded(page.send("Input.dispatchKeyEvent", {
    type, key: keyName, code, windowsVirtualKeyCode: keyName === "Enter" ? 13 : 32,
    ...(type === "keyDown" ? { text, unmodifiedText: text } : {}),
  }));
}

/** Incremental collector skips focused/captured nodes; real Tab follows it. */
export async function tabWithFreshFocusBaseline(page, bounded, { shift = false } = {}) {
  await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
  await bounded(page.pressTab({ shift }));
}

/** Public Home observations only: no focus, click, style, storage or handler writes. */
export const HOME_DISMISS_STATE_SOURCE = String.raw`(() => {
  const rendered = (el) => {
    if (!el?.isConnected || !el.getClientRects().length) return false;
    for (let node=el; node; node=node.parentElement) {
      const cs=getComputedStyle(node);
      if (node.hasAttribute('inert') || node.getAttribute('aria-hidden')==='true'
        || cs.display==='none' || cs.visibility==='hidden' || cs.visibility==='collapse' || Number(cs.opacity)===0) return false;
    }
    return true;
  };
  const observe = (el) => {
    if (!el) return {present:false,rendered:false,inViewport:false,fullyInViewport:false,unobscured:false};
    const r=el.getBoundingClientRect(), visible=rendered(el), cs=getComputedStyle(el);
    const left=Math.max(0,r.left), right=Math.min(innerWidth,r.right), top=Math.max(0,r.top), bottom=Math.min(innerHeight,r.bottom);
    const inViewport=visible&&right>left&&bottom>top;
    const points=inViewport ? [[(left+right)/2,(top+bottom)/2],[left+1,top+1],[right-1,top+1],[left+1,bottom-1],[right-1,bottom-1]] : [];
    const unobscured=inViewport&&points.every(([x,y])=>el.contains(document.elementFromPoint(x,y)));
    const ring=cs.outlineStyle==='none' ? 0 : Math.max(0,parseFloat(cs.outlineWidth)||0)+Math.max(0,parseFloat(cs.outlineOffset)||0);
    let indicatorUnclipped=r.left-ring>=0&&r.top-ring>=0&&r.right+ring<=innerWidth&&r.bottom+ring<=innerHeight;
    for (let node=el.parentElement; node&&indicatorUnclipped; node=node.parentElement) {
      const style=getComputedStyle(node), box=node.getBoundingClientRect();
      if (['hidden','clip','scroll','auto'].includes(style.overflowX) && (r.left-ring<box.left || r.right+ring>box.right)) indicatorUnclipped=false;
      if (['hidden','clip','scroll','auto'].includes(style.overflowY) && (r.top-ring<box.top || r.bottom+ring>box.bottom)) indicatorUnclipped=false;
    }
    return {present:true,rendered:visible,inViewport,fullyInViewport:visible&&r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      unobscured,indicatorUnclipped,width:r.width,height:r.height};
  };
  const banners=[...document.querySelectorAll('[role="status"]')].filter(el=>
    el.textContent.includes('Add xenios to your home screen.') || el.textContent.includes('Install xenios: tap Share, then'));
  const dismisses=banners.flatMap(el=>[...el.querySelectorAll('button[aria-label="Dismiss"]')]);
  const dismiss=dismisses.length===1 ? dismisses[0] : null;
  const heading=document.querySelector('.xh-hero #xh-hero-title'), cta=document.querySelector('.xh-hero a[data-destination="healthRequest"]');
  const active=document.activeElement;
  return {atHome:location.pathname==='/'&&!location.search&&!location.hash,
    bannerCount:banners.length,dismissCount:dismisses.length,banner:observe(banners[0]),dismiss:observe(dismiss),
    activeIsDismiss:!!dismiss&&active===dismiss&&!dismiss.disabled&&dismiss.getAttribute('aria-label')==='Dismiss',
    activeIsHeroCta:!!cta&&active===cta,active:observe(active),
    activeKind:active===document.body||active===document.documentElement ? 'BODY' : active===dismiss ? 'DISMISS'
      : active===cta ? 'HERO_CTA' : active?.matches('a[href],button,summary,input,select,textarea,[tabindex]') ? 'OTHER_CONTROL' : 'OTHER',
    positiveTabIndexCount:[...document.querySelectorAll('[tabindex]')].filter(el=>el.tabIndex>0&&rendered(el)).length,
    heading:observe(heading),cta:observe(cta)};
})()`;

function requireDismissFocus(sample, state) {
  requireThat(state.activeIsDismiss && state.dismiss.rendered && state.dismiss.fullyInViewport
    && state.dismiss.unobscured && state.dismiss.indicatorUnclipped && state.dismiss.width >= 44 && state.dismiss.height >= 44
    && sample.indicator && sample.inViewport, "HOME_DISMISS_FOCUS_OR_TARGET_NOT_VISIBLE");
}

function requireHomeContent(state) {
  requireThat(state.atHome && state.heading.rendered && state.heading.inViewport && state.heading.unobscured,
    "HOME_POST_DISMISS_HERO_OBSCURED");
}

/** Native keyboard dismissal, with the original overlap capture retained by the caller. */
export async function homeInstallDismissalProof(page, config, bounded, progress = {}) {
  requireThat(["phone200", "desktop200"].includes(config.name) && config.font === 32, "HOME_DISMISS_CONFIGURATION_INVALID");
  startKeyboardProgress(progress);
  const loader = page.currentMainFrameLoaderId;
  requireThat(typeof loader === "string" && loader.length > 0, "HOME_DISMISS_DOCUMENT_IDENTITY_UNAVAILABLE");
  const read = () => bounded(page.evaluate(HOME_DISMISS_STATE_SOURCE));
  const before = await read();
  requireThat(before.atHome && before.positiveTabIndexCount === 0, "HOME_DISMISS_DOCUMENT_OR_TAB_ORDER_CHANGED");
  let afterRemoval = before, afterRemovalFocus = null, next = null, activated = false;
  const key = config.name === "phone200" ? "Enter" : " ";
  if (before.bannerCount) {
    requireThat(before.bannerCount === 1 && before.dismissCount === 1 && before.banner.rendered,
      "HOME_INSTALL_HINT_CONTROL_AMBIGUOUS");
    let state, sample, reached = false;
    for (let i = 0; i < 48; i++) {
      progress.phase = "HOME_DISMISS_REVERSE_TAB";
      await tabWithFreshFocusBaseline(page, bounded, { shift: true });
      sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
      state = await read();
      keyboardStep(progress, sample, state.activeKind, i, "exact accessible Dismiss", true);
      if (state.activeIsDismiss) { requireDismissFocus(sample, state); reached = true; break; }
    }
    requireThat(reached, "HOME_DISMISS_NOT_KEYBOARD_REACHABLE");
    progress.phase = "HOME_DISMISS_NATIVE_ACTIVATION";
    await dispatchActivationKey(page, key, bounded);
    await bounded(page.evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))"));
    afterRemoval = await read();
    afterRemovalFocus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    progress.afterRemoval = afterRemoval;
    progress.afterRemovalFocus = afterRemovalFocus;
    requireThat(afterRemoval.bannerCount === 0 && afterRemoval.dismissCount === 0, "HOME_INSTALL_HINT_NOT_REMOVED");
    requireHomeContent(afterRemoval);
    requireThat(afterRemovalFocus.body === false && typeof afterRemovalFocus.identity === "string"
      && afterRemovalFocus.identity.length > 0 && afterRemovalFocus.indicator && afterRemovalFocus.inViewport
      && afterRemoval.activeKind !== "BODY" && afterRemoval.activeKind !== "DISMISS"
      && afterRemoval.active.rendered && afterRemoval.active.fullyInViewport
      && afterRemoval.active.unobscured && afterRemoval.active.indicatorUnclipped,
      "HOME_POST_DISMISS_FOCUS_NOT_RESTORED");
    // The application owns restoration. Observe its actual focus and NEW order;
    // never infer the successor from the removed Dismiss or repair BODY here.
    const order = await bounded(page.evaluate(FOCUS_BASELINE_SOURCE));
    const index = order.tabbableIdentities.indexOf(afterRemovalFocus.identity);
    requireThat(index >= 0 && order.tabbableIdentities.length > 1 && afterRemoval.positiveTabIndexCount === 0,
      "HOME_DISMISS_TAB_SUCCESSOR_UNAVAILABLE");
    const expectedNext = order.tabbableIdentities[(index + 1) % order.tabbableIdentities.length];
    activated = true;
    progress.phase = "HOME_DISMISS_CONTINUATION_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    state = await read();
    keyboardStep(progress, sample, state.activeKind, 0, "actual next logical control", false);
    next = { sample, state, fromIdentity: afterRemovalFocus.identity, expectedIdentity: expectedNext,
      orderObservedAfterRemoval: true };
    requireThat(!sample.body && sample.identity === expectedNext && sample.indicator && sample.inViewport
      && state.active.fullyInViewport && state.active.unobscured && state.active.indicatorUnclipped,
      "HOME_DISMISS_CONTINUATION_FOCUS_NOT_VISIBLE_OR_LOGICAL");
  } else {
    requireThat(before.dismissCount === 0, "HOME_INSTALL_HINT_CONTROL_AMBIGUOUS");
    requireHomeContent(before);
  }
  let current = await read(), ctaFocus = next?.sample ?? null;
  for (let i = 0; !current.activeIsHeroCta && i < 48; i++) {
    progress.phase = "HOME_POST_DISMISS_CTA_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    ctaFocus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    current = await read();
    keyboardStep(progress, ctaFocus, current.activeKind, i, "hero primary CTA without activation", false);
  }
  requireThat(current.bannerCount === 0 && current.activeIsHeroCta && ctaFocus?.indicator && ctaFocus.inViewport
    && current.cta.rendered && current.cta.fullyInViewport && current.cta.unobscured && current.cta.indicatorUnclipped
    && current.cta.height >= 44, "HOME_POST_DISMISS_CTA_NOT_UNOBSTRUCTED");
  requireThat(current.atHome && page.currentMainFrameLoaderId === loader, "HOME_DISMISS_NAVIGATION_CHANGED");
  return { state: activated ? "NATIVE_DISMISS_AND_FOCUS_OBSERVED" : "BANNER_ABSENT_NATIVE_DISMISS_NOT_EXECUTED",
    nativeDismissExecuted: activated, key: activated ? (key === " " ? "Space" : "Enter") : null,
    before, afterRemoval, afterRemovalFocus, next, cta: { state: current, focus: ctaFocus }, navigationUnchanged: true,
    heroCoverage: "VISIBLE_HEADING_PORTION_AT_REMOVAL", ctaCoverage: "FULL_VISIBLE_PRIMARY_CTA_AFTER_NATIVE_TAB",
    installPromptTelemetry: "NOT_INSTRUMENTED_EXISTING_SOURCE_TESTS_SEPARATE", acceptedRouteCaptureCountAdded: 0 };
}

function startKeyboardProgress(progress) {
  Object.assign(progress, { state: "INCOMPLETE_DIAGNOSTIC", accepted: false, phase: "START", stepCount: 0,
    droppedSteps: 0, retention: "FIRST_32_LAST_32", steps: [] });
}

function keyboardStep(progress, sample, text, desiredIndex, expectedControl, shift) {
  if (progress.steps.length >= 64) { progress.steps.splice(32, 1); progress.droppedSteps++; }
  const step = { sequence: progress.stepCount++, sample, text: text.slice(0, 100), desiredIndex, expectedControl, shift };
  progress.steps.push(step);
  progress.lastStep = step;
  progress.phase = "CHECK_FOCUS";
}

export async function keyboardProof(page, route, bounded, progress = {}) {
  startKeyboardProgress(progress);
  const walk = [];
  const desired = route === "/" ? null : ["Try again", "Explore Xenios Health", "Research support", "Care support"];
  let found = 0, actionDone = false;
  for (let i = 0; i < (route === "/" ? 36 : 16); i++) {
    progress.phase = "FORWARD_TAB";
    await tabWithFreshFocusBaseline(page, bounded);
    const sample = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
    const text = await bounded(page.evaluate("document.activeElement?.textContent?.trim() ?? ''"));
    walk.push({ sample, text: text.slice(0, 100) });
    keyboardStep(progress, sample, text, found, desired?.[found] ?? "native menu", false);
    if (desired && text === desired[found]) {
      requireThat(sample.indicator && sample.inViewport, "KEYBOARD_FOCUS_NOT_VISIBLE");
      if (found === 0) {
        progress.phase = "ACTIVATE_RETRY";
        await dispatchActivationKey(page, "Enter", bounded);
        await waitForText(page, "We cannot check this recommendation right now.", bounded);
        actionDone = true;
      }
      found++;
      if (found === desired.length) break;
    }
    if (!desired && !actionDone) {
      const menu = await bounded(page.evaluate("document.activeElement?.tagName === 'SUMMARY' && document.activeElement.parentElement?.matches('details.xh-mobile-nav:not([open])')"));
      if (menu) {
        requireThat(sample.indicator, "KEYBOARD_HOME_FOCUS_NOT_VISIBLE");
        await dispatchActivationKey(page, "Enter", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === true")), "KEYBOARD_MENU_DID_NOT_OPEN");
        await dispatchActivationKey(page, " ", bounded);
        requireThat(await bounded(page.evaluate("document.activeElement?.closest('details.xh-mobile-nav')?.open === false")), "KEYBOARD_MENU_DID_NOT_CLOSE");
        actionDone = true;
        break;
      }
    }
  }
  requireThat(actionDone && (!desired || found === desired.length), "KEYBOARD_CONTRACT_INCOMPLETE");
  progress.phase = "REVERSE_TAB";
  await tabWithFreshFocusBaseline(page, bounded, { shift: true });
  const reverse = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  keyboardStep(progress, reverse, "", found, "reverse focus", true);
  requireThat(reverse.indicator && reverse.inViewport, "KEYBOARD_REVERSE_FOCUS_NOT_VISIBLE");
  return { walk, reverse, enterOrSpaceAction: actionDone, policyOrAccountSubmitted: false };
}

async function wholesaleKeyboardProof(page, bounded, progress = {}) {
  startKeyboardProgress(progress);
  const observations = [];
  for (const [index, label] of ["Start a business enquiry", "Start a wholesale enquiry"].entries()) {
    let found = false;
    for (let i = 0; i < 48; i++) {
      progress.phase = "WHOLESALE_TAB";
      await tabWithFreshFocusBaseline(page, bounded, { shift: index === 1 });
      const text = await bounded(page.evaluate("document.activeElement?.textContent?.trim() ?? ''"));
      const focus = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
      keyboardStep(progress, focus, text, index, label, index === 1);
      if (text !== label) continue;
      requireThat(focus.indicator && focus.inViewport, "WHOLESALE_KEYBOARD_FOCUS_NOT_VISIBLE");
      await dispatchActivationKey(page, "Enter", bounded);
      let target;
      for (let settle = 0; settle < 40; settle++) {
        target = await bounded(page.evaluate(`(() => {
        const section=document.getElementById('organization-inquiry'), r=section.getBoundingClientRect();
        const y=Math.min(innerHeight-1,Math.max(1,r.top+8)), x=Math.min(innerWidth-1,Math.max(1,r.left+r.width/2));
        return { hash:location.hash, top:r.top, bottom:r.bottom,
          inViewport:r.top>=-1&&r.top<innerHeight&&r.bottom>0,
          unobscured:section.contains(document.elementFromPoint(x,y)),
          activeTag:document.activeElement?.tagName ?? null,
          activeText:(document.activeElement?.textContent ?? '').trim().slice(0,100) };
        })()`));
        if (target.hash === "#organization-inquiry" && target.inViewport && target.unobscured) break;
        await bounded(new Promise((r) => setTimeout(r, 50)), 100);
      }
      requireThat(target.hash === "#organization-inquiry" && target.inViewport && target.unobscured, "WHOLESALE_ANCHOR_TARGET_HIDDEN_OR_UNREACHED");
      observations.push({ label, openingFocus: focus, target, focusTransferAssumed: false });
      found = true; break;
    }
    requireThat(found, "WHOLESALE_ANCHOR_CONTROL_UNREACHABLE");
  }
  progress.phase = "WHOLESALE_CONTINUATION_TAB";
  await tabWithFreshFocusBaseline(page, bounded);
  const next = await bounded(page.evaluate(FOCUS_PROBE_SOURCE));
  keyboardStep(progress, next, "", observations.length, "continuation focus", false);
  requireThat(!next.body && next.indicator && next.inViewport, "WHOLESALE_KEYBOARD_CONTINUATION_NOT_VISIBLE");
  return { observations, next, policyOrAccountSubmitted: false, liveGateOrReadinessProved: false };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.length !== 3 || process.argv[2] !== "--run") {
    process.stderr.write("OWNED_QA_INVOCATION_REFUSED\n"); process.exitCode = 1;
  } else {
    run().then((code) => { process.exit(code); }).catch(() => {
      process.stderr.write("OWNED_QA_PRECONDITION_FAILED\n"); process.exit(1);
    });
  }
}
