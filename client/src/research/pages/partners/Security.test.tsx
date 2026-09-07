// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Security from "./Security";
import * as partner from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({
  id: "synthetic-session-record-a", startedAt: "2026-09-07T12:34:56.123Z",
  device: "A-only device label", approximateLocation: "A-only approximate location", current: true, ...patch,
});
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const loaded = (sessions: unknown = [entry()]) => response({ ok: true, sessions });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><Security /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh session records")!.click();
});
const noPrivateData = () => {
  expect(host.querySelector("table")).toBeNull();
  expect(text()).not.toContain("A-only device label"); expect(text()).not.toContain("A-only approximate location");
  expect(text()).not.toContain("2026-09-07T12:34:56.123Z");
  expect(text()).not.toContain("No session records were returned");
  expect(text()).not.toContain("Marked current (reported)");
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  fetcher = vi.fn((path: string, init: RequestInit) => {
    if (path !== partner.PARTNER_API.securitySessions || init.method !== "GET") throw new Error("Unexpected synthetic request");
    return Promise.resolve(loaded());
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("read-only partner session reporting", () => {
  it("uses only the exact existing bearer GET, without Auth operations or row identifiers in markup/storage", async () => {
    const storageWrite = vi.spyOn(Storage.prototype, "setItem"); await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.securitySessions, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("A-only device label"); expect(text()).toContain("A-only approximate location");
    expect(text()).toContain("2026-09-07T12:34:56.123Z"); expect(text()).toContain("Marked current (reported)");
    expect(host.innerHTML).not.toContain("synthetic-session-record-a"); expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(storageWrite).not.toHaveBeenCalled(); expect(host.querySelector("form,input,textarea,select")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Refresh session records"]);
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href^="mailto:"]')?.getAttribute("href")).toBe("mailto:team@xeniostechnology.com?subject=Account%20security%20concern");
    expect(window.location.href).not.toMatch(/synthetic-|A-only/);
  });
  it("preserves the five basic security guidance topics without a support lock promise", async () => {
    await render();
    for (const topic of ["One account, one person", "A strong, unique password", "We never ask for credentials", "Sign out on shared devices", "Report anything odd, fast"]) expect(text()).toContain(topic);
    expect(text()).toContain("Contacting support does not itself lock the account, change a password, or revoke a session");
    expect(text()).not.toContain("team will lock it first"); expect(text()).not.toContain("research@xeniostechnology.com");
  });
  it.each(["signed-out", "checking"])("makes no private request while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it("does not confuse a source current marker with current Auth/session validity", async () => {
    fetcher.mockResolvedValueOnce(loaded([entry(), entry({ id: "other", current: false, device: null, approximateLocation: null })]));
    await render(); expect(text()).toContain("Source current-session marker");
    expect(text()).toContain("Marked current (reported)"); expect(text()).toContain("Not marked current (reported)");
    expect(text()).toContain("Device not reported"); expect(text()).toContain("Location not reported");
    expect(text()).toContain("not a complete sign-in history or an account-safety check");
    expect(text()).toContain("whether a session is still valid"); expect(text()).toContain("No sessions are revoked here");
    expect(host.querySelector(".ra-badge-success")).toBeNull();
  });
  it("keeps an exact empty response compatible with the currently absent production source without implying safety", async () => {
    fetcher.mockResolvedValueOnce(loaded([])); await render();
    expect(text()).toContain("No session records were returned"); expect(text()).toContain("source may be unavailable or incomplete");
    expect(text()).toContain("not evidence of no sign-ins, no other sessions, or account safety");
    expect(text()).not.toContain("No session history recorded yet"); expect(text()).not.toContain("platform launches");
  });
  it("renders returned device/location text without navigation or executable markup", async () => {
    fetcher.mockResolvedValueOnce(loaded([entry({ device: '<img src=x onerror="synthetic()">', approximateLocation: "https://location.fixture.invalid/" })]));
    await render(); expect(text()).toContain('<img src=x onerror="synthetic()">');
    expect(host.querySelector("tbody img,tbody a,tbody script")).toBeNull();
  });
  it.each([401, 403, 404, 501, 503, 500])("does not convert HTTP %s into no-session or safe-account evidence", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "PRIVATE-UPSTREAM" }, status)); await render(); noPrivateData();
    expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it("preserves canonical partner denial separately from customer access", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE-UPSTREAM" }, 403)); await render();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Partner reporting access is separate from customer approval");
    noPrivateData(); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it.each([
    {}, { ok: true }, { ok: true, sessions: null }, { ok: true, sessions: [entry(), entry()] },
    { ok: true, sessions: [entry({ id: "../other" })] }, { ok: true, sessions: [entry({ startedAt: "2026-02-30T12:34:56Z" })] },
    { ok: true, sessions: [entry({ startedAt: "2026-09-07" })] }, { ok: true, sessions: [entry({ current: undefined })] },
    { ok: true, sessions: [entry({ current: null })] }, { ok: true, sessions: [entry({ current: "true" })] },
    { ok: true, sessions: [entry({ current: 1 })] }, { ok: true, sessions: [entry({ device: undefined })] },
    { ok: true, sessions: [entry({ approximateLocation: undefined })] }, { ok: true, sessions: [entry({ device: {} })] },
    { ok: true, sessions: [entry({ accessToken: "PRIVATE-TOKEN" })] },
    { ok: true, sessions: [entry()], userEmail: "PRIVATE@fixture.invalid" },
  ])("rejects malformed, missing, coercible or extra private data: %j", async (body) => {
    fetcher.mockResolvedValueOnce(response(body)); await render(); noPrivateData();
    expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("does not render HTML fallback or its private content", async () => {
    fetcher.mockResolvedValueOnce(response("PRIVATE-UPSTREAM", 200, "text/html")); await render(); noPrivateData();
    expect(text()).toContain("Session reporting is unavailable right now"); expect(text()).not.toContain("PRIVATE");
  });
  it("contains a thrown loader and allows read-only retry", async () => {
    vi.spyOn(partner, "getPartnerSecuritySessions").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); noPrivateData(); expect(text()).not.toContain("PRIVATE"); await refresh(); expect(text()).toContain("A-only device label");
  });
});

describe("security-report account and generation isolation", () => {
  it("removes A labels and marker in B's first commit before B completes", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise);
    session.token = "synthetic-partner-b"; await render(); noPrivateData();
    expect(snapshots.at(-1)).not.toContain("A-only"); expect(snapshots.at(-1)).not.toContain("Marked current (reported)");
    await act(async () => pending.resolve(loaded([entry({ id: "b", device: "B-only device", approximateLocation: null, current: false })])));
    expect(text()).toContain("B-only device"); expect(text()).not.toContain("A-only");
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it("ignores A's late success once B has loaded", async () => {
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise).mockResolvedValueOnce(loaded([entry({ device: "B-only device", approximateLocation: null })]));
    await render(); session.token = "synthetic-partner-b"; await render(); await act(async () => pending.resolve(loaded()));
    expect(text()).toContain("B-only device"); expect(text()).not.toContain("A-only");
  });
  it("drops logout data and prevents a late response from publishing", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    session.token = null; await render(); const requests = fetcher.mock.calls.length;
    await act(async () => pending.resolve(loaded())); noPrivateData(); expect(fetcher).toHaveBeenCalledTimes(requests);
    expect(text()).toContain("Sign in to view reported session records");
  });
  it("does not resurrect a prior login response after A-null-A", async () => {
    const old = deferred<Response>(); fetcher.mockReturnValueOnce(old.promise); await render();
    session.token = null; await render(); session.token = "synthetic-partner-a";
    fetcher.mockResolvedValueOnce(loaded([entry({ device: "New login device", approximateLocation: null })])); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("New login device"); expect(text()).not.toContain("A-only");
  });
  it("drops re-verification data and waits for the refreshed credential's read", async () => {
    await render(); session.checking = true; await render(); noPrivateData(); expect(fetcher).toHaveBeenCalledTimes(1);
    session.checking = false; session.token = "synthetic-partner-a-refreshed";
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render(); noPrivateData();
    await act(async () => pending.resolve(loaded([entry({ device: "Reverified device", approximateLocation: null })])));
    expect(text()).toContain("Reverified device"); expect(text()).not.toContain("A-only");
  });
  it("keeps the latest overlapping refresh over an old denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh(); noPrivateData();
    await act(async () => second.resolve(loaded([entry({ device: "Latest device", approximateLocation: null })])));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("Latest device"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("does not revive old private rows while retrying a failed refresh", async () => {
    await render(); fetcher.mockResolvedValueOnce(response({}, 500)); await refresh(); noPrivateData();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh(); noPrivateData();
  });
  it("ignores a late unmounted result", async () => {
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(loaded())); expect(host.innerHTML).toBe("");
  });
  it("survives StrictMode replay without publishing the first response", async () => {
    const stale = deferred<Response>(); fetcher.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([entry({ device: "Latest device", approximateLocation: null })]));
    await act(async () => root.render(<StrictMode><Security /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("Latest device"); expect(text()).not.toContain("A-only");
  });
  it("refreshes unavailable reporting using only the same GET, never Auth sign-out/revoke/lock", async () => {
    fetcher.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(loaded()); await render(); await refresh();
    expect(text()).toContain("A-only device label"); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([path, init]) => path === partner.PARTNER_API.securitySessions && init.method === "GET"
      && init.body === undefined && init.headers.Authorization === "Bearer synthetic-partner-a")).toBe(true);
  });
});
