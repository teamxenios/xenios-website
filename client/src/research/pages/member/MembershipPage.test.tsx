// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Router } from "wouter";
import { memoryLocation } from "wouter/memory-location";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MembershipPage from "./MembershipPage";
import { useResearch } from "../../core";
import { cancelMembership, getMembership } from "../../adapters/member";
import { getStoreCredit } from "../../adapters/commerce";
import type { ApiResult } from "../../lib/api";

vi.mock("../../core", () => ({
  useResearch: vi.fn(),
  formatMoney: (cents: number) => `$${(cents / 100).toFixed(2)}`,
}));
vi.mock("../../ui/shells", () => ({
  ResearchMemberShell: ({ title, lead, children }: { title: string; lead: string; children: ReactNode }) =>
    <main><h1>{title}</h1><p>{lead}</p>{children}</main>,
}));
vi.mock("../../adapters/member", () => ({ getMembership: vi.fn(), cancelMembership: vi.fn() }));
vi.mock("../../adapters/commerce", () => ({ getStoreCredit: vi.fn() }));

let root: Root;
let container: HTMLDivElement;
let context: ReturnType<typeof useResearch>;
const legacyHistory = {
  status: "canceled", planLabel: "Historical fixture plan",
  startedAt: "2025-01-15", nextChargeAt: "2025-02-15",
  payments: [
    { id: "fixture-paid", at: "2025-01-15", label: "Historical payment", amountCents: 4700, status: "Paid" },
    { id: "fixture-refund", at: "2025-01-16", label: "Recorded historical refund", amountCents: -1200, status: "Refunded" },
  ],
  agreements: [{ key: "historical-terms", title: "Historical terms", version: "2025-1", accepted: true }],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
async function render() {
  vi.mocked(useResearch).mockReturnValue(context);
  const memory = memoryLocation({ path: "/research/member/membership", static: true });
  await act(async () => root.render(<Router hook={memory.hook}><MembershipPage /></Router>));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  context = { memberToken: "fixture-token-a", memberChecking: false,
    member: { firstName: "Fixture", status: "active", applicationStatus: "approved" } } as ReturnType<typeof useResearch>;
  vi.mocked(getMembership).mockReset().mockResolvedValue({ kind: "unavailable" });
  vi.mocked(getStoreCredit).mockReset().mockResolvedValue({ kind: "unavailable" });
  vi.mocked(cancelMembership).mockReset();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("read-only compatibility billing page without paid access", () => {
  it("does not sell membership or expose retired cancellation or activation controls", async () => {
    await render();
    expect(container.textContent).toContain("Paid membership is not required for approved customer access");
    expect(container.textContent).toContain("Historical billing records are unavailable");
    expect(container.textContent).not.toMatch(/\$50|\$25|Founding Membership|Access ends immediately|access has ended|forfeited|Cancel my membership/);
    expect(container.querySelector("button, form")).toBeNull();
    expect(cancelMembership).not.toHaveBeenCalled();
    expect(container.querySelector('a[href="/research/account/subscription"]')).not.toBeNull();
    expect(container.querySelector('a[href="/research/account/support"]')).not.toBeNull();
  });

  it("retains exact historical plan, payment, refund, schedule, and agreement records", async () => {
    vi.mocked(getMembership).mockResolvedValue({ kind: "ok", data: legacyHistory });
    await render();
    expect(container.textContent).toContain("Historical fixture plan");
    expect(container.textContent).toContain("canceled");
    expect(container.textContent).toContain("2025-02-15");
    expect(container.textContent).toContain("$47.00");
    expect(container.textContent).toContain("$-12.00");
    expect(container.textContent).toContain("Recorded accepted");
    expect(container.textContent).toContain("This page does not refund payments");
    expect(container.textContent).not.toContain("Acceptance opens later");
    expect(container.querySelector("button")).toBeNull();
    expect(cancelMembership).not.toHaveBeenCalled();
  });

  it.each([null, { payments: null, agreements: null }, {}])("does not turn missing historical data %j into zero or a plan", async data => {
    vi.mocked(getMembership).mockResolvedValue({ kind: "ok", data });
    await render();
    expect(container.textContent).toMatch(/unavailable/i);
    expect(container.textContent).not.toMatch(/\$0|\$25|\$50|Historical fixture plan/);
    expect(container.textContent).not.toContain("No payment rows were returned");
  });

  it("distinguishes an empty returned payment list from unavailable history without completeness claims", async () => {
    vi.mocked(getMembership).mockResolvedValue({ kind: "ok", data: { payments: [], agreements: [] } });
    await render();
    expect(container.textContent).toContain("No payment rows were returned");
    expect(container.textContent).toContain("History completeness is not reported");
    expect(container.textContent).not.toContain("$0");
  });

  it.each([undefined, null, "4700", Number.NaN, Number.POSITIVE_INFINITY, 1.5])("refuses malformed payment amount %s rather than rendering a zero", async amountCents => {
    vi.mocked(getMembership).mockResolvedValue({ kind: "ok", data: {
      ...legacyHistory, payments: [{ ...legacyHistory.payments[0], amountCents }],
    } });
    await render();
    expect(container.textContent).toContain("Historical billing records are unavailable");
    expect(container.textContent).not.toContain("$0");
    expect(container.textContent).not.toContain("Historical fixture plan");
  });

  it("preserves actual paused account status instead of activating access when billing is unavailable", async () => {
    context = { ...context, member: { firstName: "Fixture", status: "paused", applicationStatus: "approved" } };
    await render();
    const access = container.querySelector('[aria-labelledby="ra-membership-plan"]');
    expect(access?.textContent).toContain("paused");
    expect(access?.querySelector(".ra-badge-success")).toBeNull();
  });

  it("does not load account or credit records without a signed-in account", async () => {
    context = { ...context, member: null, memberToken: null };
    await render();
    expect(container.textContent).toContain("Please sign in");
    expect(getMembership).not.toHaveBeenCalled();
    expect(getStoreCredit).not.toHaveBeenCalled();
  });

  it("clears loaded historical records on principal switch and ignores the old request", async () => {
    const oldRead = deferred<ApiResult<unknown>>();
    const newRead = deferred<ApiResult<unknown>>();
    vi.mocked(getMembership).mockImplementation(token => token === "fixture-token-a" ? oldRead.promise : newRead.promise);
    await render();
    context = { ...context, memberToken: "fixture-token-b" };
    await render();
    await act(async () => oldRead.resolve({ kind: "ok", data: legacyHistory }));
    expect(container.textContent).not.toContain("Historical fixture plan");
    await act(async () => newRead.resolve({ kind: "ok", data: { payments: [] } }));
    expect(container.textContent).toContain("No payment rows were returned");
    expect(container.textContent).not.toContain("Historical fixture plan");
  });

  it("clears an already-loaded record on sign-out", async () => {
    vi.mocked(getMembership).mockResolvedValue({ kind: "ok", data: legacyHistory });
    await render();
    expect(container.textContent).toContain("Historical fixture plan");
    context = { ...context, memberToken: null, member: null };
    await render();
    expect(container.textContent).not.toContain("Historical fixture plan");
  });
});
