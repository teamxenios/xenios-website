import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import type { RecommendationLink, RecommendationLinks } from "@shared/research/referral-v1";
import { ResearchContext, type ResearchContextValue } from "./core";
import { assertFixturesAllowed, fixturesAllowed } from "./lib/fixtures";
import { ResearchEmptyState, ResearchLoadingState } from "./ui/kit";

// Imported only by the existing DEV gallery. These are display fixtures, not
// authenticated identities. No request from this module reaches a transport.
const CASES = {
  "partner-links": ["signed-out", "checking", "ready", "ineligible", "empty", "api401", "unavailable", "malformed", "refresh-failure", "loading"],
  "partner-dashboard": ["signed-out", "checking", "connected", "disconnected", "unconfirmed", "confirmed-zero", "unavailable", "generic-forbidden", "partner-missing", "api401", "malformed", "error", "loading"],
} as const;
export type PartnerGalleryPage = keyof typeof CASES;
export type PartnerDisplaySelection = Readonly<{ page: PartnerGalleryPage; case: string; origin: string }>;
const PATHS = ["/api/research/partner/dashboard", "/api/research/partner/links", "/api/research/partner/readable-codes"] as const;
type ReadPath = typeof PATHS[number];
type Violation = "request-shape" | "write" | "route" | "credential" | "retired" | "digest" | "storage-write" | "storage-remove" | "telemetry-limit";
const EXPECTED_EPOCH = Date.parse("2026-11-20T00:00:00.000Z");
const MAX_RECORDS = 64;
const CURRENT_CART = "xenios.research.memberCart.v2";
const LEGACY_CART = "xenios-research-cart-v1";

export function isPartnerGalleryPage(value: unknown): value is PartnerGalleryPage {
  return value === "partner-links" || value === "partner-dashboard";
}

/** Closed route/case grammar; no credential, actor, API URL or arbitrary payload input. */
export function partnerDisplaySelection(href: string): PartnerDisplaySelection | null {
  if (!fixturesAllowed()) return null;
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || !url.port
      || url.username || url.password || url.hash) return null;
    const page = url.pathname.slice("/research/__gallery/".length);
    if (!isPartnerGalleryPage(page) || url.pathname !== `/research/__gallery/${page}`) return null;
    const selected = url.search === "" ? (page === "partner-links" ? "ready" : "disconnected") : url.search.slice(6);
    if (url.search && url.search !== `?case=${selected}`) return null;
    if (!(CASES[page] as readonly string[]).includes(selected)) return null;
    return { page, case: selected, origin: url.origin };
  } catch { return null; }
}

function displayMarker(): string {
  // Deliberately invalid JWT header and signature. Only the payload satisfies
  // the accepted component's ephemeral readable-code partition parser.
  const payload = btoa(JSON.stringify({ sub: "f0000000-0000-4000-8000-000000000001",
    session_id: "f0000000-0000-4000-8000-000000000002", fixture: true })).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return `DISPLAY-NOT-A-CREDENTIAL.${payload}.NO-SIGNATURE`;
}

/** Complete context: no inherited real actor, callbacks, cart, or credentials. */
export function partnerDisplayContext(selection: PartnerDisplaySelection): ResearchContextValue {
  assertFixturesAllowed();
  const refuse = (): never => { throw new Error("Partner display fixture refuses mutations"); };
  const refuseAsync = async (): Promise<never> => refuse();
  const ordinary = selection.case !== "signed-out" && selection.case !== "checking";
  return {
    gate: "open", member: ordinary ? { firstName: "Display fixture", status: "active", applicationStatus: "active" } : null,
    memberToken: ordinary ? displayMarker() : null, memberChecking: selection.case === "checking",
    memberSessionStatus: ordinary ? "authenticated" : selection.case === "checking" ? "checking" : "signed_out",
    recovery: "none", clearRecovery: refuse, memberDenial: null, peekMemberDenial: () => null,
    establishMemberSession: refuseAsync, refreshMember: refuseAsync, signOutMember: refuseAsync,
    signOutRecoverySession: refuseAsync, submitPassword: refuseAsync, logout: refuseAsync,
    products: [], bySlug: new Map(), commerce: { research: false, consumer: false }, email: "",
    items: [], count: 0, addItem: refuse, removeItem: refuse, setQuantity: refuse, clearLane: refuse, laneItems: () => [],
  };
}

function links(origin: string): RecommendationLinks {
  const row = (suffix: string, patch: Partial<RecommendationLink> = {}): RecommendationLink => ({
    id: `f0000000-0000-4000-8000-0000000000${suffix}`, state: "ready", destinationPath: "/health",
    url: `${origin}/r/DISPLAY-READY`, createdAt: "2026-11-18T12:00:00.000Z", expiresAt: "2026-11-27T12:00:00.000Z",
    revokedAt: null, opens: 3, accountsLinked: 1, ...patch,
  });
  return { eligible: true, links: [row("20"), row("21", { state: "revoked", url: null, revokedAt: "2026-11-19T12:00:00.000Z" }),
    row("22", { state: "expired", url: null, expiresAt: "2026-11-19T12:00:00.000Z" }),
    row("23", { state: "partner_inactive", url: null }), row("24", { state: "unavailable", url: null }),
    row("25", { url: `${origin}/r/DISPLAY-OTHER` })] };
}

function dashboard(): PartnerDashboardDto {
  return { partnerId: "f0000000-0000-4000-8000-000000000010", role: "affiliate", state: "active", leadCount: 0,
    financialReporting: "connected", conversionCount: 2, totalCommissionCents: 1500, payableCents: 500,
    conversions: [{ attributedAt: "2026-11-18T12:00:00.000Z", eligibleNetCents: 10000, commissionCents: 1000, state: "held" },
      { attributedAt: "2026-11-19T12:00:00.000Z", eligibleNetCents: 5000, commissionCents: 500, state: "payable" }],
    outstandingTraining: [{ moduleKey: "referral-basics", version: "1.0" }] };
}

type Reply = { status: number; body: unknown; held?: boolean; error?: boolean };
function reply(selection: PartnerDisplaySelection, path: ReadPath, ordinal: number): Reply {
  const selected = selection.case;
  const main = path === (selection.page === "partner-links" ? PATHS[1] : PATHS[0]);
  if (main) {
    if (selected === "api401") return { status: 401, body: { ok: false, code: "sign_in_required" } };
    if (selected === "unavailable") return { status: 503, body: { ok: false, code: selection.page === "partner-links" ? "unavailable" : "capability_disabled" } };
  }
  if (path === PATHS[0]) {
    if (selected === "generic-forbidden") return { status: 403, body: { ok: false } };
    if (selected === "partner-missing") return { status: 404, body: { ok: false, code: "partner_not_found" } };
    if (selected === "error") return { status: 0, body: null, error: true };
    const partner = dashboard();
    if (["disconnected", "loading", "malformed"].includes(selected)) Object.assign(partner, {
      financialReporting: "not_connected", conversionCount: null, totalCommissionCents: null, payableCents: null, conversions: null,
    });
    if (selected === "malformed") partner.conversionCount = 0;
    if (selected === "confirmed-zero" || selected === "unconfirmed") Object.assign(partner, {
      conversionCount: 0, totalCommissionCents: 0, payableCents: 0, conversions: [],
    });
    if (selected === "unconfirmed") delete partner.financialReporting;
    return { status: 200, body: { ok: true, partner }, held: selected === "loading" && ordinal === 1 };
  }
  if (path === PATHS[1]) {
    if (selection.page === "partner-links" && selected === "refresh-failure" && ordinal === 2)
      return { status: 503, body: { ok: false, code: "unavailable" }, held: true };
    if (selection.page === "partner-links" && selected === "malformed") return { status: 200, body: { ok: true, eligible: "yes", links: [] } };
    const list = selected === "ineligible" ? { eligible: false, links: [] } : selected === "empty" ? { eligible: true, links: [] } : links(selection.origin);
    return { status: 200, body: { ok: true, ...list }, held: main && selected === "loading" && ordinal === 1 };
  }
  return { status: 200, body: { ok: true, aliases: selected === "empty" ? [] : [{
    code: "DISPLAY-CODE", assignedAt: "2026-11-19T12:00:00.000Z", link: links(selection.origin).links[0],
  }] } };
}

type ReadFact = { method: "GET"; path: ReadPath; ordinal: number; status: number | null;
  responseSha256: string | null; terminal: "pending" | "response" | "error" | "aborted" };
type CleanupFact = { area: "session" | "local" | "other"; key: "current-cart" | "legacy-cart" | "other";
  hadValue: boolean | null; completed: boolean };
export type PartnerDisplaySnapshot = {
  schemaVersion: 1; mode: "DEV_ONLY_PARTNER_COMPONENT_DISPLAY"; page: PartnerGalleryPage; case: string;
  generation: number; active: boolean; reads: ReadFact[]; pending: number; held: number;
  provider: "NOT_OBSERVED" | "UNMOUNTED";
  violations: Violation[]; droppedRecords: number;
  restore: { fetch: boolean | null; storage: boolean | null; hook: boolean | null };
  clock: { expectedEpochMs: number; observedEpochMs: number };
  storage: { coverage: "gallery-only"; before: { session: number; local: number }; after: { session: number; local: number };
    cleanup: CleanupFact[]; setItemAttempts: number };
};
export type PartnerDisplayHook = {
  snapshot: () => PartnerDisplaySnapshot;
  releasePending: (...args: never[]) => { released: number; generation: number; status: "released" };
  dispose: (...args: never[]) => { generation: number; active: false;
    restore: PartnerDisplaySnapshot["restore"]; provider: "NOT_OBSERVED" };
};
declare global { interface Window { __xeniosPartnerComponentDisplayV1?: PartnerDisplayHook } }
type PendingRead = { held: boolean; abort: () => void; finish: () => void };
let nextGeneration = 0;

/** Install before children mount; strict interception, never a network fallback. */
export function installPartnerDisplay(selection: PartnerDisplaySelection, target: Window = window) {
  assertFixturesAllowed();
  const verified = partnerDisplaySelection(`${selection.origin}/research/__gallery/${selection.page}?case=${selection.case}`);
  const actual = partnerDisplaySelection(target.location.href);
  if (!verified || !actual || actual.origin !== selection.origin || actual.page !== selection.page || actual.case !== selection.case
    || target.__xeniosPartnerComponentDisplayV1)
    throw new Error("Partner display requires an isolated loopback gallery");
  const sizes = () => ({ session: target.sessionStorage.length, local: target.localStorage.length });
  const before = sizes();
  if (before.session !== 0 || before.local !== 0) throw new Error("Partner display requires empty stores");
  const context = partnerDisplayContext(selection);
  const generation = ++nextGeneration;
  const reads: ReadFact[] = [];
  const violations: Violation[] = [];
  const cleanup: CleanupFact[] = [];
  const pending = new Map<number, PendingRead>();
  const counts = new Map<ReadPath, number>();
  let active = true;
  let finalized = false;
  let provider: PartnerDisplaySnapshot["provider"] = "NOT_OBSERVED";
  let droppedRecords = 0;
  let setItemAttempts = 0;
  const restore: PartnerDisplaySnapshot["restore"] = { fetch: null, storage: null, hook: null };
  const violation = (kind: Violation) => { if (violations.length < MAX_RECORDS) violations.push(kind); else droppedRecords++; };
  const refuse = (kind: Violation): never => { violation(kind); throw new TypeError("Partner display refused a request"); };
  const originalFetch = target.fetch;
  const storagePrototype = Object.getPrototypeOf(target.sessionStorage) as Storage;
  const originalRemove = storagePrototype.removeItem;
  const originalSet = storagePrototype.setItem;
  const removeItem = function (this: Storage, key: string) {
    const area = this === target.sessionStorage ? "session" : this === target.localStorage ? "local" : "other";
    const fact: CleanupFact = { area, key: key === CURRENT_CART ? "current-cart" : key === LEGACY_CART ? "legacy-cart" : "other", hadValue: null, completed: false };
    // Observe key presence only, never retain, hash or report stored values.
    try { fact.hadValue = this.getItem(key) !== null; } catch { /* The original call still runs. */ }
    if (cleanup.length < MAX_RECORDS) cleanup.push(fact); else { droppedRecords++; violation("telemetry-limit"); }
    try { originalRemove.call(this, key); fact.completed = true; }
    catch (error) { violation("storage-remove"); throw error; }
  };
  const setItem = function (): never { setItemAttempts++; return refuse("storage-write"); };
  const fetcher: typeof fetch = async (input, init) => {
    if (!active) return refuse("retired");
    let path: ReadPath;
    let signal: AbortSignal | null | undefined;
    try {
      const request = typeof Request !== "undefined" && input instanceof Request ? input : null;
      const raw = typeof input === "string" ? input : input instanceof URL ? input.href : request?.url;
      if (!raw || (init?.method ?? request?.method ?? "GET") !== "GET" || init?.body != null || request?.body != null) return refuse("write");
      const url = new URL(raw, selection.origin);
      if (url.origin !== selection.origin || url.search || url.hash || url.username || url.password
        || !(PATHS as readonly string[]).includes(url.pathname)) return refuse("route");
      path = url.pathname as ReadPath;
      const headers = new Headers(init?.headers ?? request?.headers);
      if (headers.get("authorization") !== `Bearer ${context.memberToken}` || !context.memberToken
        || [...headers.keys()].some(key => !["accept", "authorization"].includes(key))
        || ((init?.credentials ?? request?.credentials) === "include")) return refuse("credential");
      signal = init?.signal ?? request?.signal;
    } catch (error) {
      if (!(error instanceof TypeError && error.message === "Partner display refused a request")) violation("request-shape");
      throw new TypeError("Partner display refused a request");
    }
    if (reads.length >= MAX_RECORDS) { droppedRecords++; return refuse("telemetry-limit"); }
    const ordinal = (counts.get(path) ?? 0) + 1;
    counts.set(path, ordinal);
    const id = reads.length;
    const fact: ReadFact = { method: "GET", path, ordinal, status: null, responseSha256: null, terminal: "pending" };
    reads.push(fact);
    const prepared = reply(selection, path, ordinal);
    return new Promise<Response>((resolve, reject) => {
      let settled = false;
      let finishing = false;
      const settle = (terminal: ReadFact["terminal"], error?: Error, response?: Response) => {
        if (settled) return;
        settled = true; pending.delete(id); signal?.removeEventListener("abort", abort);
        fact.terminal = terminal;
        if (error) reject(error); else resolve(response!);
      };
      const abort = () => settle("aborted", new DOMException("Display read retired", "AbortError"));
      const finish = () => {
        if (settled || finishing) return;
        finishing = true;
        void (async () => {
          if (!active || signal?.aborted) { abort(); return; }
          if (prepared.error) { settle("error", new TypeError("In-memory display read failed")); return; }
          try {
            const body = JSON.stringify(prepared.body);
            const hash = await target.crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
            if (!active || signal?.aborted || settled) { abort(); return; }
            const response = new Response(body, { status: prepared.status,
              headers: { "content-type": "application/json", "cache-control": "no-store" } });
            fact.status = response.status;
            fact.responseSha256 = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
            settle("response", undefined, response);
          } catch { if (!settled) { violation("digest"); settle("error", new TypeError("Display response could not be prepared")); } }
        })();
      };
      pending.set(id, { held: prepared.held === true, abort, finish });
      if (signal?.aborted) abort();
      else { signal?.addEventListener("abort", abort, { once: true }); if (!prepared.held) finish(); }
    });
  };
  const hook: PartnerDisplayHook = {
    snapshot: () => ({ schemaVersion: 1, mode: "DEV_ONLY_PARTNER_COMPONENT_DISPLAY", page: selection.page, case: selection.case,
      generation, active, provider, reads: reads.map(item => ({ ...item })), pending: pending.size,
      held: [...pending.values()].filter(item => item.held).length, violations: [...violations], droppedRecords,
      restore: { ...restore }, clock: { expectedEpochMs: EXPECTED_EPOCH, observedEpochMs: Date.now() },
      storage: { coverage: "gallery-only", before: { ...before }, after: sizes(), cleanup: cleanup.map(item => ({ ...item })), setItemAttempts } }),
    releasePending: (...args: never[]) => {
      if (args.length || !active || !["loading", "refresh-failure"].includes(selection.case)) throw new TypeError("No held display read may be released");
      const held = [...pending.values()].filter(item => item.held);
      if (held.length === 0) throw new TypeError("No held display read may be released");
      for (const item of held) { item.held = false; item.finish(); }
      return { released: held.length, generation, status: "released" };
    },
    dispose: (...args: never[]) => {
      if (args.length || !active) throw new TypeError("No active display resources may be disposed");
      dispose();
      // A resolved Response can still be awaiting json()/React work. Retire
      // reads now, but KEEP the refusal guard and hook until native unmount.
      // pending=0 is never treated as proof that consumers have stopped.
      return { generation, active: false, restore: { ...restore }, provider: "NOT_OBSERVED" };
    },
  };
  const dispose = () => {
    if (!active) return;
    active = false;
    for (const item of pending.values()) item.abort();
  };
  // Private lifecycle callback, never exposed on the controller hook. The
  // wrapper calls this AFTER the actual descendant passive-unmount cleanup.
  const restoreAfterConsumerUnmount = () => {
    if (finalized) return;
    if (active) throw new Error("Display consumers must retire before restoration");
    finalized = true;
    provider = "UNMOUNTED";
    restore.fetch = target.fetch === fetcher;
    if (restore.fetch) target.fetch = originalFetch;
    restore.storage = storagePrototype.removeItem === removeItem && storagePrototype.setItem === setItem;
    if (storagePrototype.removeItem === removeItem) storagePrototype.removeItem = originalRemove;
    if (storagePrototype.setItem === setItem) storagePrototype.setItem = originalSet;
    restore.hook = target.__xeniosPartnerComponentDisplayV1 === hook;
    if (restore.hook) delete target.__xeniosPartnerComponentDisplayV1;
  };
  try {
    target.fetch = fetcher;
    storagePrototype.removeItem = removeItem;
    storagePrototype.setItem = setItem;
    target.__xeniosPartnerComponentDisplayV1 = hook;
  } catch {
    dispose();
    restoreAfterConsumerUnmount(); // Installation failed before any child mounted.
    throw new Error("Partner display resources could not be installed");
  }
  return { selection, context, hook, dispose, restoreAfterConsumerUnmount };
}

export function PartnerGalleryFixture({ page, children }: { page: PartnerGalleryPage; children: ReactNode }) {
  const [runtime, setRuntime] = useState<ReturnType<typeof installPartnerDisplay> | null>(null);
  const installedRef = useRef<ReturnType<typeof installPartnerDisplay> | null>(null);
  const [failed, setFailed] = useState(false);
  const href = typeof window === "undefined" ? "" : window.location.href;
  useLayoutEffect(() => {
    const selection = partnerDisplaySelection(href);
    if (!selection || selection.page !== page) { setFailed(true); return; }
    try {
      const installed = installPartnerDisplay(selection);
      installedRef.current = installed;
      setRuntime(installed); setFailed(false);
      return () => installed.dispose();
    } catch { setFailed(true); }
  }, [page, href]);
  useEffect(() => () => {
    const installed = installedRef.current;
    if (!installed) return;
    installed.dispose();
    // Descendant passive cleanup invalidates accepted Links/Dashboard reads.
    // This microtask runs after that synchronous unmount traversal. Until
    // then, all automatic/late requests still hit the closed refusal guard.
    queueMicrotask(() => installed.restoreAfterConsumerUnmount());
  }, []);
  if (!fixturesAllowed() || failed) return <ResearchEmptyState title="Not available." body="This isolated development display could not be opened." />;
  const selection = partnerDisplaySelection(href);
  if (!runtime || !selection || runtime.selection.page !== selection.page || runtime.selection.case !== selection.case
    || !runtime.hook.snapshot().active) return <ResearchLoadingState />;
  return <ResearchContext.Provider value={runtime.context}>{children}</ResearchContext.Provider>;
}
