// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PartnerDashboardDto } from "@shared/research/commerce-api";
import { ACCOUNT_PORTAL_ROUTES, MEMBER_ROUTES, PARTNER_ROUTES } from "../../lib/routes";
import { PARTNER_API } from "../../adapters/partner";
import Dashboard from "./Dashboard";

const session = vi.hoisted(() => ({ token: "synthetic-member-one" as string | null, checking: false }));
vi.mock("../../core", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));

let host: HTMLDivElement;
let root: Root;
let fetcher: ReturnType<typeof vi.fn>;
const partner = (patch: Partial<PartnerDashboardDto> = {}): PartnerDashboardDto => ({
  partnerId: "synthetic-partner-one", role: "member_referral", state: "active",
  leadCount: 0, conversionCount: 2, totalCommissionCents: 12345, payableCents: 2345,
  conversions: [
    { attributedAt: "2026-09-04T12:00:00Z", eligibleNetCents: 20000, commissionCents: 10000, state: "paid" },
    { attributedAt: "2026-09-05T12:00:00Z", eligibleNetCents: 5000, commissionCents: 2345, state: "payable" },
  ],
  outstandingTraining: [], ...patch,
});
const response = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300, status,
  headers: new Headers({ "content-type": "application/json" }), json: async () => body,
});
const loaded = (value = partner()) => response({ ok: true, partner: value });
const render = () => act(async () => { root.render(<Dashboard />); });
const button = (label: string) => Array.from(host.querySelectorAll("button")).find(item => item.textContent === label)!;
const click = (label: string) => act(async () => { button(label).click(); });
const metric = (label: string) => Array.from(host.querySelectorAll('[data-testid="ra-metric"]'))
  .find(item => item.querySelector("p")?.textContent === label)!;
const metricValue = (label: string) => metric(label)?.querySelectorAll("p")[1]?.textContent;
const expectSignIn = () => {
  expect(host.textContent).toContain("Sign in to view your partner dashboard");
  expect(host.querySelector('a[href^="/research/sign-in"]')?.getAttribute("href"))
    .toBe("/research/sign-in?returnTo=%2Fresearch%2Fpartners%2Fdashboard");
  expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
};

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-member-one";
  session.checking = false;
  fetcher = vi.fn().mockResolvedValue(loaded()); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
});

describe("owned partner dashboard", () => {
  it("uses one canonical bearer read and only the bounded account/catalog/referral navigation", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(PARTNER_API.dashboard, expect.objectContaining({
      method: "GET", cache: "no-store", credentials: "same-origin",
      headers: { Authorization: "Bearer synthetic-member-one" },
    }));
    expect(Array.from(host.querySelectorAll("nav a")).map(item => item.getAttribute("href")))
      .toEqual([ACCOUNT_PORTAL_ROUTES.home, MEMBER_ROUTES.fullCatalog, PARTNER_ROUTES.links, ACCOUNT_PORTAL_ROUTES.support]);
    expect(host.querySelector('nav[aria-label="Partner areas"]')).toBeNull();
    expect(host.textContent).toContain("Referral eligibility is checked when you open the referral tools");
    expect(host.textContent).toContain("Member referral");
    expect(host.textContent).not.toContain("synthetic-partner-one");
    expect(host.querySelector("form")).toBeNull();
  });

  it("does not read or fabricate a partner for a signed-out visitor and preserves the dashboard return path", async () => {
    session.token = null; await render();
    expectSignIn();
    expect(fetcher).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain("Member referral");
    expect(host.textContent).not.toContain("Apply to become");
  });

  it.each([null, "synthetic-saved-member"])("waits for account restoration before sign-in or dashboard reads (token: %s)", async (token) => {
    session.token = token; session.checking = true; await render();
    expect(host.querySelector('[role="status"]')?.textContent).toContain("Checking your account");
    expect(host.querySelector('a[href^="/research/sign-in"]')).toBeNull();
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    session.checking = false; await render();
    if (token) {
      expect(metricValue("Net recorded commissions")).toBe("$123.45");
      expect(fetcher).toHaveBeenCalledTimes(1);
    } else {
      expectSignIn();
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("removes old dashboard data during account rechecking and reads fresh data after it settles", async () => {
    await render();
    expect(metricValue("Net recorded commissions")).toBe("$123.45");
    session.checking = true; await render();
    expect(host.textContent).toContain("Checking your account");
    expect(host.textContent).not.toContain("$123.45");
    expect(host.querySelector('[data-testid="pd-identity"]')).toBeNull();
    expect(host.querySelector('a[href^="/research/sign-in"]')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    session.checking = false; await render();
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(2);
    await act(async () => finish(loaded(partner({ totalCommissionCents: 500 }))));
    expect(metricValue("Net recorded commissions")).toBe("$5.00");
  });

  it("offers the same preserved return path for an expired session without showing counts", async () => {
    fetcher.mockResolvedValue(response({ ok: false, code: "expired", message: "private upstream detail" }, 401));
    await render(); expectSignIn();
    expect(host.textContent).not.toContain("private upstream detail");
  });

  it.each([0, 918])("never interprets legacy leadCount %s as an observed lead count", async (leadCount) => {
    fetcher.mockResolvedValue(loaded(partner({ leadCount }))); await render();
    expect(metricValue("Leads")).toBe("Not reported");
    expect(metric("Leads").textContent).toContain("This is not a zero count");
    expect(metricValue("Commission-linked conversions")).toBe("2");
    expect(metricValue("Net recorded commissions")).toBe("$123.45");
    expect(metricValue("Payable balance")).toBe("$23.45");
    expect(host.textContent).toContain("after reversals");
    expect(host.textContent).toContain("pending, held, approved, payable, paid, or disputed");
    expect(host.textContent).toContain("does not confirm a scheduled or completed payout");
    expect(host.textContent).not.toContain("before holds and reversals");
    expect(host.textContent).not.toContain("queued for your next payout");
  });

  it("shows genuine zero supported metrics only after a successful read, without claiming no referrals or purchases", async () => {
    fetcher.mockResolvedValue(loaded(partner({ conversionCount: 0, totalCommissionCents: 0, payableCents: 0, conversions: [] })));
    await render();
    expect(metricValue("Commission-linked conversions")).toBe("0");
    expect(metricValue("Net recorded commissions")).toBe("$0.00");
    expect(metricValue("Payable balance")).toBe("$0.00");
    expect(metricValue("Leads")).toBe("Not reported");
    expect(host.textContent).toContain("This does not mean there have been no referrals or purchases");
  });

  it.each([404, 501, 503, 403])("distinguishes an unavailable %s read from empty activity and allows a read-only retry", async (status) => {
    fetcher.mockResolvedValueOnce(response({ message: "private provider detail" }, status)).mockResolvedValue(loaded());
    await render();
    expect(host.textContent).toContain("Partner activity is unavailable right now");
    expect(metricValue("Commission-linked conversions")).toBe("Unavailable");
    expect(metricValue("Net recorded commissions")).toBe("Unavailable");
    expect(metricValue("Payable balance")).toBe("Unavailable");
    expect(host.textContent).not.toContain("platform is being prepared");
    expect(host.textContent).not.toContain("private provider detail");
    expect(host.textContent).not.toContain("No commission-linked activity is recorded");
    await click("Refresh dashboard");
    expect(metricValue("Net recorded commissions")).toBe("$123.45");
    expect(fetcher.mock.calls.every(([, options]) => options.method === "GET")).toBe(true);
  });

  it.each([
    [404, "partner_not_found", "No partner account found."],
    [403, "partner_not_active", "Your partner account is not active."],
  ] as const)("uses the owned-account denial for %s %s without inventing partner or customer access", async (status, code, title) => {
    fetcher.mockResolvedValue(response({ ok: false, code, message: "private person detail" }, status));
    await render();
    expect(host.textContent).toContain(title);
    expect(host.textContent).toContain("Partner access is separate from your customer account and catalog access");
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    expect(host.textContent).not.toContain("private person detail");
    expect(host.querySelector(`a[href="${ACCOUNT_PORTAL_ROUTES.home}"]`)).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not turn a pending server partner state into active earning or referral permission", async () => {
    fetcher.mockResolvedValue(loaded(partner({ state: "certification_pending" }))); await render();
    expect(host.querySelector('[data-testid="pd-identity"]')?.textContent).toContain("certification pending");
    expect(host.querySelector('[data-testid="pd-identity"]')?.textContent).not.toContain("active");
    expect(host.querySelector("button")).toBeNull();
  });

  it("uses a safe error on failed reads without reflecting upstream messages or previous balances", async () => {
    fetcher.mockResolvedValue(response({ message: "private person detail" }, 500)); await render();
    expect(host.textContent).toContain("The partner dashboard could not be loaded");
    expect(host.textContent).not.toContain("private person detail");
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    fetcher.mockResolvedValue(loaded()); await click("Try again");
    expect(metricValue("Net recorded commissions")).toBe("$123.45");
  });

  it.each([
    null, {}, { ...partner(), conversionCount: "0" }, { ...partner(), totalCommissionCents: -1 },
    { ...partner(), payableCents: 2.3 }, { ...partner(), totalCommissionCents: Number.MAX_SAFE_INTEGER + 1 },
    { ...partner(), role: "toString" }, { ...partner(), state: "invented_active" },
    { ...partner(), conversions: [null] }, { ...partner(), outstandingTraining: null },
    { ...partner(), conversions: [{ ...partner().conversions[0], attributedAt: "private person detail" }] },
    { ...partner(), conversions: [{ ...partner().conversions[0], commissionCents: "2345" }] },
    { ...partner(), conversions: [{ ...partner().conversions[0], state: "constructor" }] },
  ])("fails closed on malformed successful data: %j", async (value) => {
    fetcher.mockResolvedValue(response({ ok: true, partner: value })); await render();
    expect(host.textContent).toContain("dashboard response could not be read safely");
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    expect(host.querySelector("table")).toBeNull();
    expect(host.textContent).not.toContain("private person detail");
  });

  it("renders only server-listed training and no extra customer fields", async () => {
    fetcher.mockResolvedValue(loaded({ ...partner({ outstandingTraining: [{ moduleKey: "referral_basics", version: "1.2" }] }),
      customerEmail: "synthetic-private@example.invalid", purchasedItems: ["private item"], health: "private health",
    } as PartnerDashboardDto));
    await render();
    expect(host.textContent).toContain("referral basics");
    expect(host.querySelector(`a[href="${PARTNER_ROUTES.training}"]`)).toBeNull();
    expect(host.querySelector(`a[href="${ACCOUNT_PORTAL_ROUTES.support}"]`)?.textContent).toBe("Account support");
    expect(host.textContent).toContain("next authorized training step");
    expect(host.textContent).not.toContain("synthetic-private");
    expect(host.textContent).not.toContain("private item");
    expect(host.textContent).not.toContain("private health");
  });

  it("normalizes valid server attribution dates without requiring one timestamp spelling", async () => {
    fetcher.mockResolvedValue(loaded(partner({ conversions: [
      { ...partner().conversions[0], attributedAt: "2026-09-04 12:00:00+00:00" },
    ] })));
    await render();
    expect(host.querySelector("tbody")?.textContent).toContain("2026-09-04T12:00:00.000Z");
    expect(host.querySelector('[data-testid="ra-error"]')).toBeNull();
  });

  it("drops old-principal activity on account changes and ignores a late response", async () => {
    let finish!: (value: unknown) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
      .mockResolvedValue(loaded(partner({ role: "affiliate", totalCommissionCents: 500 })));
    await render();
    expect(host.querySelector('[data-testid="ra-metric"]')).toBeNull();
    session.token = "synthetic-member-two"; await render();
    expect(metricValue("Net recorded commissions")).toBe("$5.00");
    await act(async () => finish(loaded()));
    expect(metricValue("Net recorded commissions")).toBe("$5.00");
    expect(host.querySelector('[data-testid="pd-identity"]')?.textContent).toContain("Affiliate");
    session.token = null; await render();
    expectSignIn(); expect(fetcher).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain("$5.00");
  });

  it("contains the metric grid at narrow widths and keeps the current navigation targets usable", async () => {
    await render();
    const grid = host.querySelector<HTMLElement>('[data-testid="pd-metrics"]')!;
    expect(grid.style.gridTemplateColumns).toBe("repeat(auto-fit, minmax(min(100%, 220px), 1fr))");
    expect(grid.style.overflowWrap).toBe("anywhere");
    for (const link of host.querySelectorAll<HTMLElement>("nav a")) expect(link.style.minHeight).toBe("44px");
    expect(host.querySelector<HTMLElement>('[data-testid="ra-table"]')?.parentElement?.style.overflowX).toBe("auto");
  });
});
