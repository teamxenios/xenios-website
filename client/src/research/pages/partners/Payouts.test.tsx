// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import Payouts from "./Payouts";
import * as partner from "../../adapters/partner";
import { __resetCapabilitiesCache } from "../../lib/capabilities";
import { PAYOUT_STATUS_LABELS } from "../../partner-crm/payout-records";

const session = vi.hoisted(() => ({ token: "synthetic-partner-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));
const CAPABILITIES = "/api/research/capabilities";
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const enabled = () => response({ ok: true, capabilities: { affiliate_payouts: { enabled: true } } });
const entry = (patch: Record<string, unknown> = {}) => ({
  id: "batch-a", date: "2026-09-07", amountCents: 1250, method: "test", status: "built", ...patch,
});
const payload = (patch: Record<string, unknown> = {}) => ({
  ok: true, method: { label: "Payout method on file", configured: true }, payouts: [entry()], ...patch,
});
const loaded = (patch: Record<string, unknown> = {}) => response(payload(patch));
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
type ReadInit = { headers: { Authorization: string }; method?: string; body?: unknown };
let capabilityRead: Mock<(init: ReadInit) => Promise<Response>>;
let payoutRead: Mock<(init: ReadInit) => Promise<Response>>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><Payouts /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh payout records")!.click();
});
const noPrivateData = () => {
  expect(host.querySelector("table")).toBeNull();
  expect(host.querySelector("#pp-method")).toBeNull();
  expect(text()).not.toContain("No payout method on file");
  expect(text()).not.toContain("On file (reported)");
  expect(text()).not.toContain("Setup not verified (reported)");
  expect(text()).not.toContain("Ready for payouts");
  expect(text()).not.toContain("Scheduled");
  expect(text()).not.toContain("No payout records were returned");
  expect(text()).not.toMatch(/\$\d/);
};
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-partner-a"; session.checking = false; snapshots.length = 0;
  __resetCapabilitiesCache();
  capabilityRead = vi.fn(() => Promise.resolve(enabled()));
  payoutRead = vi.fn(() => Promise.resolve(loaded()));
  fetcher = vi.fn((path: string, init: ReadInit) => {
    if (path === CAPABILITIES) return capabilityRead(init);
    if (path === partner.PARTNER_API.payouts) return payoutRead(init);
    throw new Error("Unexpected synthetic request");
  });
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks(); __resetCapabilitiesCache();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("payout capability and account isolation", () => {
  it("reads only the existing bearer endpoints and never starts a payout or setup mutation", async () => {
    await render();
    expect(fetcher.mock.calls).toEqual([
      [CAPABILITIES, { headers: { Authorization: "Bearer synthetic-partner-a" }, credentials: "same-origin", cache: "no-store" }],
      [partner.PARTNER_API.payouts, { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-partner-a" } }],
    ]);
    expect(text()).toContain("$12.50"); expect(text()).toContain("Built (reported)");
    expect(host.querySelector('a[href="/research/account"]')).not.toBeNull();
    expect(host.querySelector('a[href="/research/partners/commissions"]')).not.toBeNull();
    expect(host.querySelector("form,input,textarea,select")).toBeNull();
    expect(Array.from(host.querySelectorAll("button")).map((button) => button.textContent)).toEqual(["Refresh payout records"]);
    expect(host.innerHTML).not.toContain("synthetic-partner-a");
    expect(text()).toContain("Approved customer access does not require paid membership");
  });
  it.each(["signed-out", "checking"])("does not read capabilities or private records while %s", async (state) => {
    if (state === "signed-out") session.token = null; else session.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); noPrivateData();
    if (state === "signed-out") expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it.each([
    { ok: true, capabilities: { affiliate_payouts: { enabled: false } } },
    { ok: true, capabilities: { affiliate_payouts: { enabled: "true" } } },
    { ok: true, capabilities: { product_commerce: { enabled: true } } },
    { ok: false, capabilities: { affiliate_payouts: { enabled: true } } },
    {}, null,
  ])("does not load records through missing or non-enabled capability %j", async (body) => {
    capabilityRead.mockResolvedValueOnce(response(body)); await render();
    expect(payoutRead).not.toHaveBeenCalled(); noPrivateData(); expect(text()).toContain("Partner payouts are being configured");
  });
  it.each([401, 403, 404, 500, 503])("does not infer enabled payouts after capability HTTP %s", async (status) => {
    capabilityRead.mockResolvedValueOnce(response({ ok: true, capabilities: { affiliate_payouts: { enabled: true } } }, status));
    await render(); expect(payoutRead).not.toHaveBeenCalled(); noPrivateData();
  });
  it("keeps a rejected capability read closed without showing its error", async () => {
    capabilityRead.mockRejectedValueOnce(new Error("PRIVATE@fixture.invalid")); await render();
    expect(payoutRead).not.toHaveBeenCalled(); noPrivateData(); expect(text()).not.toContain("PRIVATE");
  });
  it("mounts the record loader only after the server capability explicitly enables it", async () => {
    const pending = deferred<Response>(); capabilityRead.mockReturnValueOnce(pending.promise);
    await render(); expect(payoutRead).not.toHaveBeenCalled(); noPrivateData();
    await act(async () => pending.resolve(enabled())); expect(payoutRead).toHaveBeenCalledTimes(1); expect(text()).toContain("$12.50");
  });
  it("clears A's records and method in B's first commit before B's capability resolves", async () => {
    await render(); const b = deferred<Response>(); capabilityRead.mockReturnValueOnce(b.promise);
    session.token = "synthetic-partner-b"; await render();
    expect(snapshots.at(-1)).not.toContain("$12.50"); expect(snapshots.at(-1)).not.toContain("On file (reported)"); noPrivateData();
    payoutRead.mockResolvedValueOnce(loaded({ method: { label: "Payout method needs attention", configured: false }, payouts: [entry({ date: "2026-02-02", amountCents: 9900 })] }));
    await act(async () => b.resolve(enabled()));
    expect(text()).toContain("$99.00"); expect(text()).toContain("Payout method needs attention"); expect(text()).not.toContain("$12.50");
    expect(payoutRead.mock.calls.at(-1)?.[0].headers.Authorization).toBe("Bearer synthetic-partner-b");
  });
  it("ignores A's late enabled capability after B's capability is disabled", async () => {
    const a = deferred<Response>(); capabilityRead.mockReturnValueOnce(a.promise).mockResolvedValueOnce(response({ ok: true, capabilities: {} }));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => a.resolve(enabled())); expect(payoutRead).not.toHaveBeenCalled(); noPrivateData();
  });
  it("ignores A's late records after B loads", async () => {
    const a = deferred<Response>(); payoutRead.mockReturnValueOnce(a.promise).mockResolvedValueOnce(loaded({ payouts: [entry({ amountCents: 9900 })] }));
    await render(); session.token = "synthetic-partner-b"; await render();
    await act(async () => a.resolve(loaded())); expect(text()).toContain("$99.00"); expect(text()).not.toContain("$12.50");
  });
  it("clears logout data and suppresses pending publication", async () => {
    await render(); const pending = deferred<Response>(); payoutRead.mockReturnValueOnce(pending.promise); await refresh();
    session.token = null; await render(); const requests = fetcher.mock.calls.length;
    await act(async () => pending.resolve(loaded())); noPrivateData(); expect(text()).toContain("Sign in to view payout records");
    expect(fetcher).toHaveBeenCalledTimes(requests);
  });
  it("does not restore a prior login's response after A-to-null-to-A", async () => {
    const old = deferred<Response>(); payoutRead.mockReturnValueOnce(old.promise); await render();
    session.token = null; await render(); session.token = "synthetic-partner-a";
    payoutRead.mockResolvedValueOnce(loaded({ payouts: [entry({ amountCents: 9900 })] })); await render();
    await act(async () => old.resolve(loaded())); expect(text()).toContain("$99.00"); expect(text()).not.toContain("$12.50");
  });
  it("clears re-verification and refreshed credentials until a fresh authorized read", async () => {
    await render(); session.checking = true; await render(); noPrivateData(); expect(payoutRead).toHaveBeenCalledTimes(1);
    session.checking = false; session.token = "synthetic-partner-a-refreshed";
    const pending = deferred<Response>(); payoutRead.mockReturnValueOnce(pending.promise); await render(); noPrivateData();
    await act(async () => pending.resolve(loaded({ payouts: [entry({ amountCents: 9900 })] }))); expect(text()).toContain("$99.00");
  });
  it("keeps the newest overlapping refresh over an older denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    payoutRead.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise); await refresh(); await refresh(); noPrivateData();
    await act(async () => second.resolve(loaded({ payouts: [entry({ amountCents: 9900 })] })));
    await act(async () => first.resolve(response({ ok: false, code: "partner_not_active" }, 403)));
    expect(text()).toContain("$99.00"); expect(text()).not.toContain("Your partner account is not active");
  });
  it("does not resurrect old method status while retrying a failed refresh", async () => {
    await render(); payoutRead.mockResolvedValueOnce(response({}, 500)); await refresh(); noPrivateData();
    const pending = deferred<Response>(); payoutRead.mockReturnValueOnce(pending.promise); await refresh(); noPrivateData();
  });
  it("ignores an unmounted pending read", async () => {
    const pending = deferred<Response>(); payoutRead.mockReturnValueOnce(pending.promise); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(loaded())); expect(host.innerHTML).toBe("");
  });
  it("survives StrictMode replay without publishing a superseded read", async () => {
    const stale = deferred<Response>(); payoutRead.mockReturnValueOnce(stale.promise).mockResolvedValueOnce(loaded({ payouts: [entry({ amountCents: 9900 })] }));
    await act(async () => root.render(<StrictMode><Payouts /></StrictMode>));
    await act(async () => stale.resolve(loaded())); expect(text()).toContain("$99.00"); expect(text()).not.toContain("$12.50");
  });
});

describe("payout records preserve facts without eligibility or execution claims", () => {
  it.each([
    ["Payout method on file", true], ["Payout method submitted, awaiting review", false],
    ["Payout method needs attention", false], ["No payout method on file", false],
  ])("renders source setup label %s only as reported status", async (label, configured) => {
    payoutRead.mockResolvedValueOnce(loaded({ method: { label, configured } })); await render();
    expect(text()).toContain(label); expect(text()).toContain("not payout eligibility or a completed tax review");
    expect(text()).not.toContain("Ready for payouts"); expect(text()).not.toContain("nothing is lost");
  });
  it.each(Object.keys(PAYOUT_STATUS_LABELS))("renders canonical %s without inventing scheduling or bank receipts", async (status) => {
    payoutRead.mockResolvedValueOnce(loaded({ payouts: [entry({ status })] })); await render();
    expect(host.querySelector("tbody")?.textContent).toContain(`${PAYOUT_STATUS_LABELS[status as keyof typeof PAYOUT_STATUS_LABELS]} (reported)`);
    expect(text()).toContain("no schedule, balance, or bank receipt is inferred"); expect(text()).not.toContain("Scheduled");
  });
  it.each([[0, "$0.00"], [Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"]])("preserves every cent in %s without balance calculation", async (amountCents, expected) => {
    payoutRead.mockResolvedValueOnce(loaded({ payouts: [entry({ amountCents })] })); await render();
    expect(host.querySelector("td .tabular")?.textContent).toBe(expected); expect(host.querySelector("tfoot")).toBeNull();
  });
  it("distinguishes an exact empty response from unavailable history", async () => {
    payoutRead.mockResolvedValueOnce(loaded({ payouts: [] })); await render();
    expect(text()).toContain("No payout records were returned for this account");
    expect(text()).toContain("not a complete-history or zero-balance confirmation"); expect(text()).not.toMatch(/\$\d/);
  });
  it.each([401, 403, 404, 501, 503, 500])("does not convert HTTP %s into method setup or empty payout records", async (status) => {
    payoutRead.mockResolvedValueOnce(response({ message: "PRIVATE@fixture.invalid" }, status)); await render();
    noPrivateData(); expect(text()).not.toContain("PRIVATE");
  });
  it("preserves server partner denial authority separately from approved customer access", async () => {
    payoutRead.mockResolvedValueOnce(response({ ok: false, code: "partner_not_active", message: "PRIVATE@fixture.invalid" }, 403)); await render();
    expect(text()).toContain("Your partner account is not active"); expect(text()).toContain("Payout reporting access is separate from customer approval");
    noPrivateData(); expect(text()).not.toContain("PRIVATE");
  });
  it.each([
    {}, { ok: true }, payload({ payouts: null }), payload({ method: null }),
    payload({ method: { label: "Payout method on file", configured: "true" } }),
    payload({ method: { label: "No payout method on file", configured: true } }),
    payload({ payouts: [entry({ status: undefined })] }), payload({ payouts: [entry({ method: undefined })] }),
    payload({ payouts: [entry({ status: "scheduled" })] }), payload({ payouts: [entry({ amountCents: -1 })] }),
    payload({ payouts: [entry({ date: "2026-02-30" })] }), payload({ payouts: [entry(), entry()] }),
    payload({ payouts: [entry({ method: "PRIVATE@fixture.invalid" })] }), payload({ payouts: [entry({ customerEmail: "PRIVATE@fixture.invalid" })] }),
    payload({ customer: "PRIVATE@fixture.invalid" }),
  ])("refuses malformed or identity-bearing success without setup defaults %j", async (body) => {
    payoutRead.mockResolvedValueOnce(response(body)); await render(); noPrivateData();
    expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
  });
  it("treats HTML as unavailable without echoing upstream content", async () => {
    payoutRead.mockResolvedValueOnce(response("PRIVATE-UPSTREAM", 200, "text/html")); await render(); noPrivateData();
    expect(text()).toContain("Payout reporting is unavailable right now"); expect(text()).not.toContain("PRIVATE");
  });
  it("refreshes unavailability using only the same bearer GET", async () => {
    payoutRead.mockResolvedValueOnce(response({}, 503)).mockResolvedValueOnce(loaded()); await render(); await refresh();
    expect(text()).toContain("$12.50"); expect(payoutRead).toHaveBeenCalledTimes(2);
    expect(payoutRead.mock.calls.every(([init]) => init.method === "GET" && init.body === undefined
      && init.headers.Authorization === "Bearer synthetic-partner-a")).toBe(true);
  });
  it("contains a thrown adapter and allows read-only retry", async () => {
    vi.spyOn(partner, "getPartnerPayouts").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); noPrivateData(); expect(text()).toContain("could not be read safely"); expect(text()).not.toContain("PRIVATE");
    await refresh(); expect(text()).toContain("$12.50");
  });
});
