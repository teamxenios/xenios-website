// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Commissions from "./Commissions";
import * as partner from "../../adapters/partner";
import { COMMISSION_STATE_LABELS } from "../../partner-crm/commission-ledger";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const entry = (patch: Record<string, unknown> = {}) => ({
  id: "ledger-a", date: "2026-09-07", description: "Referred order commission",
  commissionCents: 1250, state: "held", ledger: "AFFILIATE_COMMISSION", ...patch,
});
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const loaded = (entries: unknown = [entry()]) => response({ ok: true, entries });
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
const render = () => act(async () => root.render(<><Commissions /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh commission ledger")!.click();
});
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  fetcher = vi.fn((path: string) => {
    if (path !== partner.PARTNER_API.commissions) throw new Error("Unexpected synthetic request");
    return Promise.resolve(loaded());
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("partner-owned affiliate commission reporting", () => {
  it("uses only the exact existing read-only bearer endpoint and offers no payout mutation", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(partner.PARTNER_API.commissions, {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" },
    });
    expect(text()).toContain("2026-09-07"); expect(text()).toContain("$12.50");
    expect(text()).toContain("Recorded amount"); expect(text()).toContain("Reported state");
    expect(text()).toContain("Affiliate commission and wholesale ledgers stay separate");
    expect(text()).toContain("Approved customer access does not require paid membership");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href="/research/partners/payouts"]')).not.toBeNull();
    expect(host.querySelector("form,input,textarea")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Refresh commission ledger"]);
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
  });
  it.each(["signed-out", "checking"])("does not request private money data while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); expect(host.querySelector("table")).toBeNull();
    expect(text()).not.toContain("$12.50"); if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it("preserves positive, zero, and negative amounts without netting or turning them into a balance", async () => {
    fetcher.mockResolvedValueOnce(loaded([entry(), entry({ id: "zero", commissionCents: 0 }),
      entry({ id: "reversal", commissionCents: -1250, state: "reversed", description: "Reversal of a referred order commission" })]));
    await render(); expect(Array.from(host.querySelectorAll("td .tabular")).map((node) => node.textContent)).toEqual(["$12.50", "$0.00", "-$12.50"]);
    expect(host.querySelector("tfoot")).toBeNull(); expect(text()).toContain("does not calculate a balance");
  });
  it.each([[Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"], [Number.MIN_SAFE_INTEGER, "-$90,071,992,547,409.91"]])
    ("preserves every recorded cent at safe-integer bound %s", async (commissionCents, expected) => {
      fetcher.mockResolvedValueOnce(loaded([entry({ commissionCents })])); await render();
      expect(host.querySelector("td .tabular")?.textContent).toBe(expected);
    });
  it.each(Object.keys(COMMISSION_STATE_LABELS))("labels canonical %s only as a reported ledger state without payout execution promises", async (state) => {
    fetcher.mockResolvedValueOnce(loaded([entry({ state })])); await render();
    expect(host.querySelector("tbody")?.textContent).toContain(COMMISSION_STATE_LABELS[state as keyof typeof COMMISSION_STATE_LABELS]);
    expect(text()).toContain("This page has no bank or provider receipt");
    expect(text()).not.toContain("Included in a completed payout"); expect(text()).not.toContain("queued for your next payout");
    expect(text()).not.toContain("The referred payment settled"); expect(text()).not.toContain("referred membership payment");
  });
  it("does not infer a zero balance from a valid empty ledger response", async () => {
    fetcher.mockResolvedValueOnce(loaded([])); await render(); expect(text()).toContain("No affiliate commission entries were returned");
    expect(text()).toContain("not a complete-history or zero-balance confirmation"); expect(text()).not.toMatch(/\$\d/);
  });
  it("clears A's ready ledger in B's first commit", async () => {
    fetcher.mockResolvedValueOnce(loaded([entry({ date: "2026-01-01" })])); await render();
    const b = deferred<Response>(); fetcher.mockReturnValueOnce(b.promise); session.token = "synthetic-partner-b"; await render();
    expect(snapshots.at(-1)).not.toContain("2026-01-01"); expect(host.querySelector("table")).toBeNull();
    await act(async () => b.resolve(loaded([entry({ date: "2026-02-02", commissionCents: 9900 })])));
    expect(text()).toContain("2026-02-02"); expect(text()).not.toContain("2026-01-01"); expect(text()).toContain("$99.00");
    expect(fetcher.mock.calls.at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it("ignores A's late success after B has loaded", async () => {
    const a = deferred<Response>(); fetcher.mockReturnValueOnce(a.promise).mockResolvedValueOnce(loaded([entry({ date: "2026-02-02" })]));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => a.resolve(loaded([entry({ date: "2026-01-01" })])));
    expect(text()).toContain("2026-02-02"); expect(text()).not.toContain("2026-01-01");
  });
  it("clears logout data and suppresses pending read publication", async () => {
    await render(); const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    session.token = null; await render(); const requests = fetcher.mock.calls.length;
    await act(async () => pending.resolve(loaded())); expect(host.querySelector("table")).toBeNull(); expect(text()).not.toContain("$12.50");
    expect(text()).toContain("Sign in to view your commission ledger"); expect(fetcher).toHaveBeenCalledTimes(requests);
  });
  it("does not restore a prior login's result after A-to-null-to-A", async () => {
    const old = deferred<Response>(); fetcher.mockReturnValueOnce(old.promise); await render();
    session.token = null; await render(); session.token = "synthetic-partner-a";
    fetcher.mockResolvedValueOnce(loaded([entry({ date: "2026-02-02" })])); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("2026-02-02"); expect(text()).not.toContain("2026-09-07");
  });
  it("clears re-verification and renewed-credential data until another read completes", async () => {
    await render(); session.checking = true; await render();
    expect(snapshots.at(-1)).not.toContain("$12.50"); expect(fetcher).toHaveBeenCalledTimes(1);
    session.checking = false; session.token = "synthetic-partner-a-refreshed";
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render(); expect(host.querySelector("table")).toBeNull();
    await act(async () => pending.resolve(loaded([entry({ commissionCents: 9800 })]))); expect(text()).toContain("$98.00");
  });
  it("keeps the newest overlapping refresh over an older denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    fetcher.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh();
    await act(async () => second.resolve(loaded([entry({ commissionCents: 9800 })])));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("$98.00"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("does not restore old ledger rows while retrying a failed refresh", async () => {
    await render(); fetcher.mockResolvedValueOnce(response({}, 500)); await refresh();
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await refresh();
    expect(host.querySelector("table")).toBeNull(); expect(text()).not.toContain("$12.50");
  });
  it("ignores a late unmounted result", async () => {
    const pending = deferred<Response>(); fetcher.mockReturnValueOnce(pending.promise); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(loaded())); expect(host.innerHTML).toBe("");
  });
  it("survives StrictMode replay without accepting the earlier read", async () => {
    const stale = deferred<Response>(); fetcher.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded([entry({ commissionCents: 9800 })]));
    await act(async () => root.render(<StrictMode><Commissions /></StrictMode>)); await act(async () => stale.resolve(loaded()));
    expect(text()).toContain("$98.00"); expect(text()).not.toContain("$12.50");
  });
});

describe("commission reporting fails closed without private data or invented balances", () => {
  it.each([401, 403, 404, 501, 503, 500])("does not convert HTTP %s into empty money data", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "PRIVATE@fixture.invalid" }, status)); await render();
    expect(host.querySelector("table")).toBeNull(); expect(text()).not.toMatch(/\$\d/); expect(text()).not.toContain("PRIVATE@fixture.invalid");
    expect(text()).not.toContain("No affiliate commission entries were returned");
  });
  it("retains partner denial authority without changing customer approval", async () => {
    fetcher.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE@fixture.invalid" }, 403)); await render();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Commission reporting access is separate from customer approval");
    expect(text()).not.toContain("PRIVATE@fixture.invalid"); expect(host.querySelector("table")).toBeNull();
  });
  it.each([
    {}, { ok: true }, { ok: true, entries: null }, { ok: true, entries: [entry(), entry()] },
    { ok: true, entries: [entry({ ledger: "WHITE_LABEL_WHOLESALE" })] },
    { ok: true, entries: [entry(), entry({ id: "wholesale", ledger: "WHITE_LABEL_WHOLESALE" })] },
    { ok: true, entries: [entry({ ledger: undefined })] }, { ok: true, entries: [entry({ commissionCents: "1250" })] },
    { ok: true, entries: [entry({ date: "2026-02-30" })] }, { ok: true, entries: [entry({ state: "guaranteed" })] },
    { ok: true, entries: [entry({ description: "PRIVATE@fixture.invalid" })] },
    { ok: true, entries: [entry({ email: "PRIVATE@fixture.invalid" })] },
    { ok: true, entries: [entry()], customer: "PRIVATE@fixture.invalid" },
  ])("refuses malformed, mixed-ledger, or identity-bearing success %j", async (body) => {
    fetcher.mockResolvedValueOnce(response(body)); await render(); expect(host.querySelector("table")).toBeNull();
    expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE"); expect(text()).not.toContain("$12.50");
    expect(text()).not.toContain("No affiliate commission entries were returned");
  });
  it("treats HTML success as unavailable", async () => {
    fetcher.mockResolvedValueOnce(response("PRIVATE-UPSTREAM", 200, "text/html")); await render();
    expect(text()).toContain("Commission reporting is unavailable right now"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it("refreshes unavailability with the same exact GET and no payout action", async () => {
    fetcher.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(loaded()); await render(); await refresh();
    expect(text()).toContain("$12.50"); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.every(([path, init]) => path === partner.PARTNER_API.commissions && init.method === "GET"
      && init.body === undefined && init.headers.Authorization === "Bearer synthetic-partner-a")).toBe(true);
  });
  it("contains a thrown adapter read and allows a safe retry", async () => {
    vi.spyOn(partner, "getPartnerCommissions").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    await refresh(); expect(text()).toContain("$12.50");
  });
});
