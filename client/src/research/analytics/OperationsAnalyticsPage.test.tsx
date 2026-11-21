// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Session } from "@supabase/supabase-js";
import type { AdminSessionBinding } from "../pages/adminx/auth";
import { OPERATIONS_METRIC_VERSIONS, type MetricResult, type OperationsMetricId } from "@shared/research/analytics/operations";
import { getSupabaseBrowser } from "@/lib/supabaseBrowser";
import OperationsAnalyticsPage from "./OperationsAnalyticsPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mocks = vi.hoisted(() => ({
  session: { state: "ready", token: "canonical-screen-token", email: "admin@example.test", signingIn: false,
    signInError: null, signIn: vi.fn(), signOut: vi.fn(), binding: null as AdminSessionBinding | null | undefined },
  auth: { getSession: vi.fn(), onAuthStateChange: vi.fn() },
}));
vi.mock("../pages/adminx/auth", async (original) => ({
  ...await original<typeof import("../pages/adminx/auth")>(), useAdminSession: () => mocks.session,
}));
vi.mock("@/lib/supabaseBrowser", async (original) => ({
  ...await original<typeof import("@/lib/supabaseBrowser")>(), getSupabaseBrowser: vi.fn(async () => ({ auth: mocks.auth })),
}));
const at = Date.parse("2026-11-18T02:30:00.000Z"); // November 17 in Chicago.
const subject = "10000000-0000-4000-8000-000000000001";
const sessionId = "20000000-0000-4000-8000-000000000001";
let sdkSession: Session | null;
let bindingLive: boolean;
let root: Root | null = null, host: HTMLDivElement | null = null;
let fetcher: ReturnType<typeof vi.fn>;
function session(id = subject): Session {
  const claims = { sub: id, session_id: sessionId, exp: at / 1000 + 3600, amr: [{ method: "password" }] };
  return { access_token: `header.${btoa(JSON.stringify(claims))}.signature`, user: { id } } as Session;
}
function binding(generation: string): AdminSessionBinding {
  const value: AdminSessionBinding = { generation,
    isCurrent: () => bindingLive && mocks.session.binding === value,
    sessionFence: (actual) => bindingLive && mocks.session.binding === value && sdkSession !== null && actual?.access_token === sdkSession.access_token };
  return value;
}
function report(): MetricResult[] {
  return (Object.keys(OPERATIONS_METRIC_VERSIONS) as OperationsMetricId[]).map((metricId) => ({
    metricId, definitionVersion: OPERATIONS_METRIC_VERSIONS[metricId], environment: "staging", scope: "authorized_project",
    windowStart: "2026-11-17T06:00:00.000Z", windowEnd: "2026-11-18T06:00:00.000Z", timezone: "America/Chicago",
    asOf: "2026-11-18T02:30:00.000Z", evaluatedAt: null, observedAt: "2026-11-18T02:30:00.000Z",
    lastSuccessfulAt: null, coverageStart: null, coverageEnd: null, freshness: "not_measured", coverage: null,
    excludedFixtures: null, sampleSize: null, source: "canonical_request:fixture_cohort_provenance_unverified",
    populationKind: null, channel: null, evidenceCoverage: null, cohortRevision: null, backfillVersion: null,
    ingestedThrough: null, quantileMethod: null, value: null, unit: "requests", reason: "not_measured",
    summary: { unclassifiedRecordCount: 12 },
  }));
}
const response = (value: unknown = report()) => new Response(JSON.stringify(value), { status: 200, headers: { "Content-Type": "application/json" } });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve };
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(at);
  bindingLive = true; sdkSession = session(); mocks.session.state = "ready";
  mocks.session.token = "canonical-screen-token"; mocks.session.binding = binding("binding-1");
  mocks.auth.getSession.mockReset().mockImplementation(async () => ({ data: { session: sdkSession }, error: null }));
  mocks.auth.onAuthStateChange.mockReset().mockImplementation(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
  vi.mocked(getSupabaseBrowser).mockClear();
  fetcher = vi.fn(async (_url: RequestInfo | URL, _options?: RequestInit) => response()); vi.stubGlobal("fetch", fetcher);
  window.history.replaceState({}, "", "/admin/research/analytics");
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove(); root = null; host = null; vi.unstubAllGlobals(); vi.useRealTimers();
});
async function render() {
  if (!host) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => root!.render(<OperationsAnalyticsPage />)); return host;
}
async function click(view: HTMLElement, text: string) {
  const target = [...view.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!target) throw new Error(`Missing ${text}`); await act(async () => target.click());
}
function set(view: HTMLElement, name: string, value: string) {
  const control = view.querySelector(`[name="${name}"]`) as HTMLSelectElement | HTMLInputElement;
  const prototype = control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(control, value);
  control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
function workload(view: HTMLElement) {
  return [...view.querySelectorAll('[data-testid="ra-metric"]')].find((item) => item.textContent?.includes("Open workload"));
}

describe("canonical admin operations analytics connection", () => {
  it("fails closed for an old AdminScreen fixture with no binding instead of reading another SDK session", async () => {
    mocks.session.binding = undefined;
    const view = await render(); expect(view.textContent).toContain("Analytics session unavailable");
    expect(getSupabaseBrowser).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the Chicago date, real SDK bearer client and real renderer while preserving not-measured provenance", async () => {
    const view = await render();
    expect((view.querySelector('input[name="day"]') as HTMLInputElement).value).toBe("2026-11-17");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe("/api/admin/research/early-access/analytics?day=2026-11-17&responsePopulation=request&responseChannel=portal_published");
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe(`Bearer ${sdkSession!.access_token}`);
    expect(fetcher.mock.calls[0][1].headers.Authorization).not.toContain("canonical-screen-token");
    expect(workload(view)?.querySelector(".display-s")?.textContent).toBe("Not measured");
    expect(workload(view)?.textContent).not.toContain("12");
    expect(view.textContent).toContain("Source coverage counts are not workload totals");
  });
  it("shows loading and a cancel escape without displaying a fabricated report while fetch is stalled", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); expect(view.textContent).toContain("Loading operations report");
    expect(view.textContent).toContain("Cancel report read"); expect(workload(view)).toBeUndefined();
    await act(async () => pending.resolve(response())); expect(workload(view)?.textContent).toContain("Not measured");
  });
  it("dispatches only explicitly applied date/population/channel filters and clears the old report", async () => {
    const view = await render();
    await act(async () => { set(view, "day", "2026-11-16"); set(view, "responsePopulation", "support_case"); set(view, "responseChannel", "email_provider_accepted"); });
    expect(workload(view)).toBeUndefined(); expect(fetcher).toHaveBeenCalledTimes(1);
    await click(view, "Load report");
    const query = new URL(String(fetcher.mock.calls[1][0]), "https://example.test").searchParams;
    expect([...query.keys()].sort()).toEqual(["day", "responseChannel", "responsePopulation"]);
    expect(query.get("day")).toBe("2026-11-16"); expect(query.get("responsePopulation")).toBe("support_case");
    expect(query.get("responseChannel")).toBe("email_provider_accepted");
  });
  it("validates the date shape with a focused accessible error before another dispatch", async () => {
    const view = await render(); await act(async () => set(view, "day", "")); await click(view, "Load report");
    expect(fetcher).toHaveBeenCalledTimes(1); expect(view.textContent).toContain("Check the report filters");
    expect(view.querySelector('input[name="day"]')?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement?.textContent).toContain("Check the report filters");
  });
  it("keeps empty or incomplete aggregate replies unavailable rather than inventing zero activity", async () => {
    fetcher.mockResolvedValueOnce(response([])); const view = await render();
    expect(view.textContent).toContain("Report unavailable"); expect(workload(view)).toBeUndefined();
    expect(view.textContent).not.toContain("No activity");
  });
  it("retains a measured empty-cohort reason in a complete parsed report", async () => {
    const values = report().map((row) => ({ ...row, freshness: "current" as const, reason: "no_eligible_observations" as const, sampleSize: 0 }));
    fetcher.mockResolvedValueOnce(response(values)); const view = await render();
    expect(workload(view)?.querySelector(".display-s")?.textContent).toBe("No eligible observations");
  });
  it("shows unavailable without raw diagnostics and retries only after a user action", async () => {
    fetcher.mockResolvedValueOnce(new Response("private@example.test upstream secret", { status: 503 }));
    const view = await render(); expect(view.textContent).toContain("Report unavailable");
    expect(view.textContent).not.toContain("private@example.test"); expect(fetcher).toHaveBeenCalledTimes(1);
    await click(view, "Retry report"); expect(fetcher).toHaveBeenCalledTimes(2); expect(workload(view)).toBeDefined();
  });
  it.each([401, 403])("clears current data and latches denial after HTTP %i until a new binding", async (status) => {
    const view = await render(); expect(workload(view)).toBeDefined();
    fetcher.mockResolvedValueOnce(new Response("private body", { status })); await click(view, "Refresh report");
    expect(workload(view)).toBeUndefined(); expect(view.textContent).toContain(status === 403 ? "Analytics access denied" : "Sign in again");
    await render(); expect(fetcher).toHaveBeenCalledTimes(2);
    mocks.session.binding = binding("binding-2"); await render();
    expect(fetcher).toHaveBeenCalledTimes(3); expect(workload(view)).toBeDefined();
  });
  it("allows cancelling a stalled read and retrying without late report restoration", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await click(view, "Cancel report read"); expect(signal.aborted).toBe(true);
    expect(view.textContent).toContain("Report read cancelled"); expect(workload(view)).toBeUndefined();
    await click(view, "Retry report"); expect(workload(view)).toBeDefined();
    await act(async () => pending.resolve(response(report().map((row) => ({ ...row, value: 999, freshness: "current", reason: null })))));
    expect(workload(view)?.querySelector(".display-s")?.textContent).toBe("Not measured");
  });
  it("clears old report while a refresh is pending", async () => {
    const view = await render(); const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    await click(view, "Refresh report"); expect(workload(view)).toBeUndefined();
    expect(view.textContent).toContain("Loading operations report");
    await act(async () => pending.resolve(response())); expect(workload(view)).toBeDefined();
  });
  it("rejects a late result after a canonical binding and SDK identity replacement", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    sdkSession = session(sessionId); mocks.session.binding = binding("binding-2"); await render();
    expect(signal.aborted).toBe(true); expect(workload(view)?.querySelector(".display-s")?.textContent).toBe("Not measured");
    await act(async () => pending.resolve(response(report().map((row) => ({ ...row, value: 999, freshness: "current", reason: null })))));
    expect(workload(view)?.querySelector(".display-s")?.textContent).toBe("Not measured");
  });
  it("observes binding invalidation immediately and does not reopen that same binding when its check returns true", async () => {
    const view = await render(); bindingLive = false; await render();
    expect(workload(view)).toBeUndefined(); expect(view.textContent).toContain("Analytics session changed");
    bindingLive = true; await render(); expect(fetcher).toHaveBeenCalledTimes(1); expect(workload(view)).toBeUndefined();
  });
  it("unmounts report state on canonical logout and ignores an old pending response", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    sdkSession = null; mocks.session.state = "signed_out"; mocks.session.binding = null; await render();
    expect(signal.aborted).toBe(true); await act(async () => pending.resolve(response()));
    expect(workload(view)).toBeUndefined(); expect(view.textContent).toContain("Sign in required");
  });
  it("cancels the accepted client on unmount and ignores its pending result", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { root!.unmount(); root = null; }); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(response())); expect(view.textContent).toBe("");
  });
});
