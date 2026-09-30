// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssistedOrderCustomerQuote } from "./api";

const api = vi.hoisted(() => ({ loadAssistedOrderQuote: vi.fn(), acceptAssistedOrderQuote: vi.fn(), loadAssistedOrderStatus: vi.fn() }));
const session = vi.hoisted(() => ({ memberToken: null as string | null, memberChecking: false }));
vi.mock("./api", async (original) => ({ ...await original<typeof import("./api")>(), ...api }));
vi.mock("../core", () => ({ useResearch: () => session }));
vi.mock("./assisted-order.css", () => ({}));
import { AssistedOrderApiError } from "./api";
import { CustomerQuotePanel } from "./CustomerQuotePanel";
import { AssistedOrderStatusPage } from "./AssistedOrderStatusPage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
const requestId = "11111111-1111-4111-8111-111111111111";
const publicReference = "XRR-20260930-ABCDEF1234";
const quote: AssistedOrderCustomerQuote = {
  requestId, publicReference, quoteId: "22222222-2222-4222-8222-222222222222", version: 3, state: "issued",
  lines: [{ lineId: "33333333-3333-4333-8333-333333333333", productName: "Synthetic research item",
    specification: "10 mg", quantity: 2, unitPriceCents: 16927, lineTotalCents: 33854, currency: "USD" }],
  totalCents: 33854, currency: "USD", validUntil: "2099-09-30T20:00:00Z", customerNote: "Review these exact terms.",
  acceptanceId: null, acceptedAt: null,
};
const acceptance = { quoteId: quote.quoteId, version: quote.version, totalCents: quote.totalCents, currency: quote.currency,
  acceptanceId: "44444444-4444-4444-8444-444444444444", acceptedAt: "2026-09-30T12:00:00Z" };
let container: HTMLDivElement;
let root: Root;
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const button = (label: string) => Array.from(container.querySelectorAll("button")).find((node) => node.textContent === label);
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}
beforeEach(() => {
  vi.resetAllMocks();
  session.memberToken = null;
  session.memberChecking = false;
  api.loadAssistedOrderQuote.mockResolvedValue(quote);
  api.acceptAssistedOrderQuote.mockResolvedValue(acceptance);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("customer quote acceptance", () => {
  it("renders exact version, per-unit and total USD cents without a GET acceptance or card collection", async () => {
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} statusToken="synthetic-guest" />));
    await flush();
    expect(container.textContent).toContain("Quote version 3");
    expect(container.textContent).toContain("USD 169.27 each");
    expect(container.textContent).toContain("Quote total: USD 338.54");
    expect(container.textContent).toContain("does not charge you");
    expect(button("Card payment unavailable")?.disabled).toBe(true);
    expect(container.querySelector("input")).toBeNull();
    expect(api.acceptAssistedOrderQuote).not.toHaveBeenCalled();
    expect(container.innerHTML).not.toContain("synthetic-guest");
    expect(container.querySelector('a[href="/research/support"]')).not.toBeNull();
  });

  it("requires explicit acceptance, suppresses repeated clicks and confirms acceptance, never payment", async () => {
    const pending = deferred<typeof acceptance>();
    api.acceptAssistedOrderQuote.mockReturnValue(pending.promise);
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} memberToken="synthetic-member" />));
    await flush();
    const acceptButton = button("Accept quote version 3")!;
    act(() => { acceptButton.click(); acceptButton.click(); });
    expect(api.acceptAssistedOrderQuote).toHaveBeenCalledTimes(1);
    expect(api.acceptAssistedOrderQuote).toHaveBeenCalledWith(publicReference, quote, undefined, "synthetic-member", expect.any(AbortSignal));
    expect(button("Recording acceptance…")?.disabled).toBe(true);
    expect(button("Refresh quote")?.disabled).toBe(true);
    pending.resolve(acceptance);
    await flush();
    expect(container.textContent).toContain("Quote accepted on");
    expect(container.textContent).toContain("not a payment or fulfillment confirmation");
    expect(button("Accept quote version 3")).toBeUndefined();
    expect(button("Card payment unavailable")?.disabled).toBe(true);
  });

  it.each(["expired", "withdrawn", "superseded", "accepted"] as const)("never offers acceptance for %s", async (state) => {
    api.loadAssistedOrderQuote.mockResolvedValue({ ...quote, state, ...(state === "accepted" ? acceptance : {}) });
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    await flush();
    expect(button("Accept quote version 3")).toBeUndefined();
    expect(api.acceptAssistedOrderQuote).not.toHaveBeenCalled();
  });

  it("removes acceptance when the displayed quote expires without requiring navigation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    api.loadAssistedOrderQuote.mockResolvedValue({ ...quote, validUntil: "2026-09-30T12:00:01Z" });
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    await flush();
    expect(button("Accept quote version 3")).toBeDefined();
    await act(async () => { vi.advanceTimersByTime(1001); });
    expect(button("Accept quote version 3")).toBeUndefined();
    expect(container.textContent).toContain("This quote has expired");
  });

  it.each([404, 503, 401])("uses neutral unavailable copy for HTTP %s without reflecting server messages", async (status) => {
    api.loadAssistedOrderQuote.mockRejectedValue(new AssistedOrderApiError(status, "private", "raw evidence and credentials"));
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    await flush();
    expect(container.textContent).not.toContain("raw evidence");
    expect(container.textContent).not.toContain("Synthetic research item");
    expect(button("Accept quote version 3")).toBeUndefined();
    expect(button("Refresh quote")).toBeDefined();
  });

  it("discards a stale acceptance and requires a fresh review instead of automatic retry", async () => {
    api.acceptAssistedOrderQuote.mockRejectedValue(new AssistedOrderApiError(409, "quote_stale", "private details"));
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    await flush();
    act(() => button("Accept quote version 3")!.click());
    await flush();
    expect(container.textContent).toContain("Refresh the quote and review its current terms");
    expect(container.textContent).not.toContain("Quote accepted on");
    expect(button("Accept quote version 3")).toBeUndefined();
    expect(api.acceptAssistedOrderQuote).toHaveBeenCalledTimes(1);
  });

  it("synchronously drops the previous owner's quote and ignores late acceptance on principal change", async () => {
    const pending = deferred<typeof acceptance>();
    api.acceptAssistedOrderQuote.mockReturnValue(pending.promise);
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} memberToken="owner-a" />));
    await flush();
    act(() => button("Accept quote version 3")!.click());
    api.loadAssistedOrderQuote.mockReturnValue(new Promise(() => {}));
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} memberToken="owner-b" />));
    expect(container.textContent).not.toContain("Synthetic research item");
    pending.resolve(acceptance);
    await flush();
    expect(container.textContent).not.toContain("Quote accepted on");
    expect(container.textContent).not.toContain("Synthetic research item");
  });

  it("drops the previous reference and ignores its late quote read", async () => {
    const pending = deferred<AssistedOrderCustomerQuote>();
    api.loadAssistedOrderQuote.mockReturnValueOnce(pending.promise).mockReturnValue(new Promise(() => {}));
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    act(() => root.render(<CustomerQuotePanel requestId="55555555-5555-4555-8555-555555555555" publicReference="XRR-20260930-ABCDEF9999" />));
    pending.resolve(quote);
    await flush();
    expect(container.textContent).not.toContain("Synthetic research item");
  });

  it("refuses a mismatched request projection", async () => {
    api.loadAssistedOrderQuote.mockResolvedValue({ ...quote, requestId: "unrelated" });
    act(() => root.render(<CustomerQuotePanel requestId={requestId} publicReference={publicReference} />));
    await flush();
    expect(container.textContent).not.toContain("Synthetic research item");
    expect(button("Accept quote version 3")).toBeUndefined();
  });

  it("does not mount or fetch quotes before the owner's status request succeeds", async () => {
    window.history.replaceState({}, "", `/research/early-access/assisted-order/status/${publicReference}`);
    const pending = deferred<any>();
    api.loadAssistedOrderStatus.mockReturnValue(pending.promise);
    act(() => root.render(<AssistedOrderStatusPage />));
    await flush();
    expect(api.loadAssistedOrderQuote).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Your quote");
    pending.resolve({ requestId, publicReference, status: "submitted", estimatedTotalCents: 33854,
      lines: [], timeline: [], documents: [], actionRequired: null });
    await flush();
    expect(api.loadAssistedOrderQuote).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Your quote");
  });

  it("keeps quotes inaccessible after an owner-status denial or while member identity is unresolved", async () => {
    window.history.replaceState({}, "", `/research/early-access/assisted-order/status/${publicReference}`);
    session.memberChecking = true;
    act(() => root.render(<AssistedOrderStatusPage />));
    await flush();
    expect(api.loadAssistedOrderStatus).not.toHaveBeenCalled();
    expect(api.loadAssistedOrderQuote).not.toHaveBeenCalled();
    session.memberChecking = false;
    api.loadAssistedOrderStatus.mockRejectedValue(new AssistedOrderApiError(404, "not_found", "private"));
    act(() => root.render(<AssistedOrderStatusPage />));
    await flush();
    expect(api.loadAssistedOrderQuote).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain("Your quote");
  });
});
