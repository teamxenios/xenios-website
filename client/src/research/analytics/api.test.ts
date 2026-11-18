// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import { buildOperationsReport } from "../../../../server/research/analytics/report";
import type { OperationsSources } from "../../../../shared/research/analytics/operations";
import { createOperationsAnalyticsClient, parseOperationsMetrics } from "./api";

const auth = vi.hoisted(() => ({ getSession: vi.fn(), onAuthStateChange: vi.fn() }));
vi.mock("@/lib/supabaseBrowser", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/supabaseBrowser")>(),
  getSupabaseBrowser: vi.fn(async () => ({ auth })),
}));
const now = Date.parse("2026-11-18T15:00:00Z");
const subject = "10000000-0000-4000-8000-000000000001";
const sid = "20000000-0000-4000-8000-000000000001";
function session(method = "password", id = subject, sessionId = sid): Session {
  const claims = { sub: id, session_id: sessionId, exp: now / 1000 + 3600, amr: [{ method }] };
  return { access_token: `header.${btoa(JSON.stringify(claims))}.signature`, user: { id } } as Session;
}
function metrics() {
  const absent = { freshness: "not_measured" as const, observedAt: new Date(now).toISOString() };
  const sources: OperationsSources = { workflowCapabilities: { assignment: false, actionableEpisodes: false },
    requests: absent, workflows: absent, responses: absent, admissions: absent, quotes: absent,
    payments: absent, deliveries: absent, outbox: absent, submitAttempts: absent };
  return buildOperationsReport({ tenantId: "project:configured-project", environment: "staging", scopeKind: "project" },
    { start: "2026-11-18T06:00:00.000Z", end: "2026-11-19T06:00:00.000Z", asOf: absent.observedAt }, sources,
    { population: "request", channel: "portal_published" });
}
let current: Session | null;
const listeners = new Set<(event: string, value: Session | null) => void>();
function event(name: string, value: Session | null) { for (const listener of listeners) listener(name, value); }
const reply = () => new Response(JSON.stringify(metrics()), { status: 200, headers: { "Content-Type": "application/json" } });
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(now); current = session(); listeners.clear();
  auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: current }, error: null }));
  auth.onAuthStateChange.mockReset().mockImplementation(listener => {
    listeners.add(listener); return { data: { subscription: { unsubscribe: () => listeners.delete(listener) } } };
  });
  window.history.replaceState({}, "", "/");
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("operations transport follows the current SDK identity", () => {
  it("sends the SDK bearer only in a private GET header, never a supplied actor or scope", async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => reply());
    const result = await createOperationsAnalyticsClient(fetcher).load({ day: "2026-11-18" });
    expect(result.kind).toBe("ready");
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/research/early-access/analytics?day=2026-11-18");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store", credentials: "same-origin",
      headers: { Authorization: "Bearer " + current!.access_token } });
    expect(listeners.size).toBe(0);
  });
  it("does not send anonymous, recovery or locally mismatched credentials", async () => {
    const fetcher = vi.fn(async () => reply());
    for (const value of [null, session("recovery"), session("otp")]) {
      current = value;
      expect(await createOperationsAnalyticsClient(fetcher).load({ day: "2026-11-18" })).toMatchObject({ kind: "error", code: "sign_in_required" });
    }
    current = { ...session(), user: { id: sid } } as Session;
    expect((await createOperationsAnalyticsClient(fetcher).load({ day: "2026-11-18" })).kind).toBe("error");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each(["subject", "session", "signout-return"])("discards a late response across a %s change", async change => {
    let begin!: () => void; const started = new Promise<void>(resolve => { begin = resolve; });
    let finish!: (response: Response) => void; const pending = new Promise<Response>(resolve => { finish = resolve; });
    const fetcher = vi.fn(async () => { begin(); return pending; });
    const load = createOperationsAnalyticsClient(fetcher).load({ day: "2026-11-18" });
    await started;
    if (change === "signout-return") { event("SIGNED_OUT", null); event("SIGNED_IN", current); }
    else {
      current = change === "subject" ? session("password", sid) : session("password", subject, subject);
      event("SIGNED_IN", current);
    }
    finish(reply()); expect(await load).toEqual({ kind: "error", code: "superseded" }); expect(listeners.size).toBe(0);
  });
  it("keeps same-subject/session refresh valid but rejects cancelled work and malformed aggregates", async () => {
    const fetcher = vi.fn(async () => { event("TOKEN_REFRESHED", current); return reply(); });
    expect((await createOperationsAnalyticsClient(fetcher).load({ day: "2026-11-18" })).kind).toBe("ready");
    const bad = metrics().map((row, i) => i ? row : { ...row, email: "private@example.invalid" });
    expect(parseOperationsMetrics(bad)).toBeNull();
    expect(parseOperationsMetrics(metrics().map((row, i) => i ? row : { ...row, scope: "authorized_tenant" })))).toBeNull();
    let begin!: () => void; const started = new Promise<void>(resolve => { begin = resolve; });
    let finish!: (response: Response) => void; const pending = new Promise<Response>(resolve => { finish = resolve; });
    const client = createOperationsAnalyticsClient(async () => { begin(); return pending; });
    const load = client.load({ day: "2026-11-18" }); await started; client.cancel(); finish(reply());
    expect(await load).toEqual({ kind: "error", code: "superseded" });
  });
  it("maps denial and outages without returning an upstream response body", async () => {
    for (const [status, code] of [[401, "sign_in_required"], [403, "forbidden"], [503, "unavailable"]] as const) {
      const client = createOperationsAnalyticsClient(async () => new Response("PRIVATE UPSTREAM", { status }));
      expect(await client.load({ day: "2026-11-18" })).toEqual({ kind: "error", code });
    }
  });
});
