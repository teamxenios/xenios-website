// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Conversions from "./Conversions";
import * as partner from "../../adapters/partner";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const row = (period = "2026-09", activations = 7, renewals: number | null = null) => ({ period, activations, renewals });
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const loaded = (rows: unknown = [row()]) => response({ ok: true, rows });
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
const render = () => act(async () => root.render(<><Conversions /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh conversion reporting")!.click();
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  fetcher = vi.fn((path: string) => {
    if (path !== partner.PARTNER_API.conversions) throw new Error("Unexpected synthetic request");
    return Promise.resolve(loaded());
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("partner-scoped aggregate conversion reporting", () => {
  it("uses exactly the existing no-store bearer GET and displays aggregate events, never a grant or individual", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.conversions, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("2026-09"); expect(text()).toContain("Recorded conversions"); expect(text()).toContain("Not reported");
    expect(text()).toContain("not unique people, verified purchases, earned commissions, or current account approvals");
    expect(text()).toContain("approved customer access does not require paid membership");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href="/research/partners/links"]')).not.toBeNull();
    expect(host.querySelector("form,input,textarea")).toBeNull(); expect(host.innerHTML).not.toContain("synthetic-partner-a");
  });
  it.each(["signed-out", "checking"])("does not read private reporting while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); expect(host.querySelector("table")).toBeNull();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it("keeps reported zero counts distinct from unknown renewals and from absent rows", async () => {
    fetcher.mockResolvedValueOnce(loaded([row("2026-08", 0, 0), { period: "2026-09", activations: 2 }]));
    await render(); expect(Array.from(host.querySelectorAll("td .tabular")).map((node) => node.textContent)).toEqual(["0", "0", "2", "Not reported"]);
    expect(text()).not.toContain("Reported later"); expect(text()).not.toContain("No aggregate rows were returned");
  });
  it("does not assert complete history or zero customers from a valid empty response", async () => {
    fetcher.mockResolvedValueOnce(loaded([])); await render();
    expect(text()).toContain("No aggregate rows were returned for this account.");
    expect(text()).toContain("does not establish a complete history or zero unique customers");
    expect(text()).not.toContain("when tracking begins");
  });
  it("clears A's rows in B's first commit while B's read is pending", async () => {
    fetcher.mockResolvedValueOnce(loaded([row("2026-01", 13)])); await render();
    const b = deferred<Response>(); fetcher.mockReturnValueOnce(b.promise); session.token = "synthetic-partner-b"; await render();
    expect(snapshots.at(-1)).not.toContain("2026-01"); expect(host.querySelector("table")).toBeNull();
    await act(async () => b.resolve(loaded([row("2026-02", 23)])));
    expect(text()).toContain("2026-02"); expect(text()).not.toContain("2026-01");
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it("ignores A's late success after B has loaded", async () => {
    const a = deferred<Response>(); fetcher.mockReturnValueOnce(a.promise).mockResolvedValueOnce(loaded([row("2026-02")]));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => a.resolve(loaded([row("2026-01")])));
    expect(text()).toContain("2026-02"); expect(text()).not.toContain("2026-01");
  });
  it("clears logout data and ignores a pending refresh", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    session.token = null; await render(); const requests = fetcher.mock.calls.length;
    await act(async () => pending.resolve(loaded())); expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain("Sign in to view partner conversion reporting"); expect(fetcher).toHaveBeenCalledTimes(requests);
  });
  it("does not restore a former login's read after A-to-null-to-A", async () => {
    const old = deferred<Response>(); fetcher.mockReturnValueOnce(old.promise); await render();
    session.token = null; await render(); session.token = "synthetic-partner-a";
    fetcher.mockResolvedValueOnce(loaded([row("2026-02")])); await render();
    await act(async () => old.resolve(loaded([row("2026-01")])));
    expect(text()).toContain("2026-02"); expect(text()).not.toContain("2026-01");
  });
  it("clears re-verification and refreshed-credential state before another read", async () => {
    await render(); session.checking = true; await render();
    expect(snapshots.at(-1)).not.toContain("2026-09"); expect(fetcher).toHaveBeenCalledTimes(1);
    session.checking = false; session.token = "synthetic-partner-a-refreshed";
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render();
    expect(host.querySelector("table")).toBeNull(); await act(async () => pending.resolve(loaded([row("2026-08")])));
    expect(text()).toContain("2026-08"); expect(text()).not.toContain("2026-09");
  });
  it("keeps the latest overlapping refresh when an older request returns a denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh();
    await act(async () => second.resolve(loaded([row("2026-08")])));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("2026-08"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("does not resurrect earlier successful rows while retrying a failed refresh", async () => {
    await render(); fetcher.mockResolvedValueOnce(response({}, 500)); await refresh();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    expect(host.querySelector("table")).toBeNull(); expect(text()).not.toContain("2026-09");
  });
  it("ignores a late response after unmount", async () => {
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(loaded()));
    expect(host.innerHTML).toBe(""); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("handles StrictMode effect replay without accepting an older response", async () => {
    const stale = deferred<Response>(); fetcher.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([row("2026-08")]));
    await act(async () => root.render(<StrictMode><Conversions /></StrictMode>));
    await act(async () => stale.resolve(loaded())); expect(text()).toContain("2026-08"); expect(text()).not.toContain("2026-09");
  });
});

describe("conversion failures do not become fake empty data or authority", () => {
  it.each([401, 403, 404, 501, 503, 500])("fails closed for HTTP %s without publishing the upstream message", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "PRIVATE@fixture.invalid" }, status)); await render();
    expect(host.querySelector("table")).toBeNull(); expect(text()).not.toContain("PRIVATE@fixture.invalid");
    expect(text()).not.toContain("No aggregate rows were returned"); expect(text()).not.toContain("platform launches");
  });
  it("preserves exact canonical partner denial without changing customer approval", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE@fixture.invalid" }, 403));
    await render(); expect(text()).toContain("Your partner account is not active");
    expect(text()).toContain("Partner reporting access is separate from customer account access");
    expect(text()).not.toContain("PRIVATE@fixture.invalid"); expect(host.querySelector("table")).toBeNull();
  });
  it.each([
    {}, { ok: true }, { ok: true, rows: null }, { ok: true, rows: [row(), row()] },
    { ok: true, rows: [{ ...row(), activations: -1 }] }, { ok: true, rows: [{ ...row(), renewals: "1" }] },
    { ok: true, rows: [{ ...row(), period: "PRIVATE@fixture.invalid" }] },
    { ok: true, rows: [{ ...row(), email: "PRIVATE@fixture.invalid" }] },
    { ok: true, rows: [row()], customer: "PRIVATE@fixture.invalid" },
  ])("refuses the entire malformed or identity-bearing response %j", async (body) => {
    fetcher.mockResolvedValueOnce(response(body)); await render(); expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
    expect(text()).not.toContain("No aggregate rows were returned");
  });
  it("treats HTML success as unavailable, not a published aggregate report", async () => {
    fetcher.mockResolvedValueOnce(response("PRIVATE-UPSTREAM", 200, "text/html")); await render();
    expect(text()).toContain("Partner conversion reporting is unavailable right now");
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(host.querySelector("table")).toBeNull();
  });
  it("retries unavailable reads with the same existing GET and no mutations or private URL data", async () => {
    fetcher.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(loaded()); await render();
    expect(text()).toContain("This does not mean zero conversions"); await refresh(); expect(text()).toContain("2026-09");
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([path, init]) => path === partner.PARTNER_API.conversions && init.method === "GET"
      && init.body === undefined && init.headers.Authorization === "Bearer synthetic-partner-a")).toBe(true);
  });
  it("contains a thrown adapter loader with safe retryable copy", async () => {
    vi.spyOn(partner, "getPartnerConversions").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    await refresh(); expect(text()).toContain("2026-09");
  });
});
