// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_CUSTOMER_ORDERS } from "@shared/research/customer-account/fixtures";
import AccountOrders from "../../account/AccountOrders";

const session = vi.hoisted(() => ({ memberToken: "member-a" as string | null }));
vi.mock("../../core", () => ({ useResearch: () => session }));
vi.mock("../AccountPortalShell", () => ({ AccountPortalShell: ({ children }: { children: React.ReactNode }) => <main>{children}</main> }));

const request = () => ({
  kind: "assisted_request", requestId: "11111111-1111-4111-8111-111111111111",
  publicReference: "XRR-20260921-ABCDEF1234", status: "submitted",
  createdAt: "2026-09-21T12:00:00Z", updatedAt: "2026-09-21T12:00:00Z",
  estimatedTotalCents: null, currency: "USD", trackingReference: null,
  lines: [{ productName: "Synthetic requested material", specification: null, quantity: 1, lineEstimateCents: null }],
});
const data = (requests: unknown = [request()], source = { connected: true, complete: true }) => ({
  ...FIXTURE_CUSTOMER_ORDERS, requests,
  history: { ...FIXTURE_CUSTOMER_ORDERS.history, sources: { ...FIXTURE_CUSTOMER_ORDERS.history.sources, xrr: source } },
});
const response = (value: unknown) => new Response(JSON.stringify({ kind: "ok", data: value }), { headers: { "content-type": "application/json" } });
let host: HTMLDivElement; let root: Root; let fetcher: ReturnType<typeof vi.fn>;
const render = () => act(async () => root.render(<AccountOrders />));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  session.memberToken = "member-a";
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fetcher = vi.fn(async () => response(data())); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("mounted account orders request history", () => {
  it("retains verified payment evidence after history advances to shipped", async () => {
    fetcher.mockResolvedValue(response(data([{ ...request(), status: "shipped", paymentVerified: true }])));
    await render();
    const history = host.querySelector('[data-testid="assisted-request-history"]')!;
    expect(history.textContent).toContain("Request status: shipped");
    expect(history.textContent).toContain("Payment verified");
  });
  it.each([
    ["paid", true, "Payment verified"], ["paid", false, "Payment record under review"],
    ["paid", undefined, "Payment record under review"], ["payment_pending", undefined, "Payment step paused"],
    ["payment_review", undefined, "Payment review"], ["supplier_processing", true, "Payment verified"],
    ["delivered", false, "Payment record under review"], ["closed", true, "Payment verified"],
    ["cancelled", true, "Payment verified"], ["reviewing", true, "Payment verified"],
  ] as const)("renders %s with evidence=%s without a raw paid assertion", async (status, paymentVerified, label) => {
    fetcher.mockResolvedValue(response(data([{ ...request(), status, paymentVerified }])));
    await render();
    const history = host.querySelector('[data-testid="assisted-request-history"]')!;
    expect(history.querySelector('[data-testid="assisted-request-payment"]')?.textContent).toContain(label);
    expect(history.textContent).not.toContain("Request status: paid");
    if (paymentVerified === true) expect(history.textContent).toContain("Fulfillment eligibility is checked separately.");
    else expect(history.textContent).not.toContain("Payment verified");
    if (status === "payment_pending") expect(history.textContent).toContain("Do not send funds based on this status.");
    if (!["paid", "payment_pending", "payment_review"].includes(status)) {
      expect(history.textContent).toContain(`Request status: ${status.replaceAll("_", " ")}`);
    }
  });

  it("clears verified payment with the old principal before the new owner read completes", async () => {
    fetcher.mockResolvedValue(response(data([{ ...request(), status: "paid", paymentVerified: true }])));
    await render(); expect(host.textContent).toContain("Payment verified");
    let resolve!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    session.memberToken = "member-b"; await render();
    expect(host.textContent).not.toContain("Payment verified");
    expect(host.textContent).not.toContain("XRR-20260921-ABCDEF1234");
    await act(async () => resolve(response(data([{ ...request(), publicReference: "XRR-20260921-ABCDEF9999",
      status: "paid", paymentVerified: false }]))));
    expect(host.textContent).toContain("Payment record under review");
    expect(host.textContent).not.toContain("Payment verified");
  });

  it("does not publish a late verified response from the prior principal", async () => {
    let resolve!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    await render();
    fetcher.mockResolvedValue(response(data([]))); session.memberToken = "member-b"; await render();
    await act(async () => resolve(response(data([{ ...request(), status: "paid", paymentVerified: true }]))));
    expect(host.textContent).not.toContain("Payment verified");
    expect(host.textContent).not.toContain("XRR-20260921-ABCDEF1234");
    expect(host.textContent).toContain("No assisted order requests were returned");
  });

  it.each(["true", 1, null])("does not display malformed financial authority (%j)", async (paymentVerified) => {
    fetcher.mockResolvedValue(response(data([{ ...request(), status: "paid", paymentVerified }])));
    await render();
    expect(host.textContent).toContain("Assisted request history is unavailable.");
    expect(host.textContent).not.toContain("Payment verified");
    expect(host.textContent).not.toContain("Request status: paid");
  });
  it("uses the canonical bearer read and renders a separate nullable request estimate with the partial-source warning", async () => {
    await render();
    expect(fetcher).toHaveBeenCalledWith("/api/research/customer-account/orders", expect.objectContaining({ cache: "no-store" }));
    expect(new Headers(fetcher.mock.calls[0][1].headers).get("Authorization")).toBe("Bearer member-a");
    const requests = host.querySelector('[data-testid="assisted-request-history"]')!;
    expect(requests.textContent).toContain("Estimate: Price on request");
    expect(requests.textContent).not.toContain("$0.00");
    expect(requests.querySelector("a")?.getAttribute("href")).toBe("/research/early-access/order-request/XRR-20260921-ABCDEF1234");
    expect(host.textContent).toContain("Some commerce history is currently unavailable.");
    expect(host.textContent).toContain("Research cart checkouts (XEC)");
    expect(host.querySelector("#research-orders-heading")?.closest("section")?.textContent).not.toContain("XRR-20260921-ABCDEF1234");
  });
  it("shows a recorded zero estimate and opaque tracking text without inventing a carrier link", async () => {
    fetcher.mockResolvedValue(response(data([{ ...request(), estimatedTotalCents: 0, trackingReference: "OPAQUE-RECORDED-REFERENCE" }])));
    await render();
    expect(host.querySelector('[data-testid="assisted-request-estimate"]')?.textContent).toBe("Estimate: $0.00");
    expect(host.querySelector('[data-testid="assisted-request-tracking"]')?.textContent).toContain("OPAQUE-RECORDED-REFERENCE");
    expect(host.querySelector('a[href*="OPAQUE-RECORDED"]')).toBeNull();
  });
  it.each([undefined, null, [{ ...request(), kind: "order" }]])("does not call absent/malformed/cross-lineage requests empty (%j)", async (requests) => {
    fetcher.mockResolvedValue(response({ ...data(), requests })); await render();
    expect(host.textContent).toContain("Assisted request history is unavailable.");
    expect(host.textContent).not.toContain("No assisted order requests were returned");
    expect(host.textContent).not.toContain("XRR-20260921-ABCDEF1234");
  });
  it("distinguishes connected empty from unavailable empty", async () => {
    fetcher.mockResolvedValue(response(data([]))); await render();
    expect(host.textContent).toContain("No assisted order requests were returned for this account.");
    session.memberToken = "member-b";
    fetcher.mockResolvedValue(response(data([], { connected: false, complete: false }))); await render();
    expect(host.textContent).toContain("Assisted request history is unavailable.");
    expect(host.textContent).not.toContain("No assisted order requests were returned");
  });
  it("counts separate request rows toward an explicitly complete source count without claiming no orders attached", async () => {
    fetcher.mockResolvedValue(response({ ...data(), research: [], history: {
      availability: "complete", authoritativeRecordCount: 1,
      sources: Object.fromEntries(["commerce", "xea", "xec", "xrr"].map((key) => [key, { connected: true, complete: true }])),
    } }));
    await render();
    expect(host.textContent).toContain("1 record");
    expect(host.textContent).not.toContain("does not match the authoritative source count");
    expect(host.textContent).not.toContain("No Research commerce records are attached");
    expect(host.textContent).toContain("assisted requests are listed separately below");
  });
  it("clears the old account's request records immediately while the next owner read is pending", async () => {
    await render(); expect(host.textContent).toContain("XRR-20260921-ABCDEF1234");
    let resolve!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise<Response>((done) => { resolve = done; }));
    session.memberToken = "member-b"; await render();
    expect(host.textContent).not.toContain("XRR-20260921-ABCDEF1234");
    await act(async () => resolve(response(data([]))));
    expect(host.textContent).not.toContain("XRR-20260921-ABCDEF1234");
  });
});
