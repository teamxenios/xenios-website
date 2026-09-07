// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import OrderDetail from "./OrderDetail";
import * as commerce from "../../adapters/commerce";

const current = vi.hoisted(() => ({ token: "synthetic-customer-a" as string | null, checking: false, id: "ord-a" as string | undefined }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: current.token, memberChecking: current.checking }),
}));
vi.mock("wouter", async (original) => ({ ...await original<typeof import("wouter")>(), useParams: () => ({ id: current.id }) }));

const order = (orderId = "ord-a") => ({
  orderId, recordKind: "order", state: "processing", placedAt: "2026-09-07T12:00:00Z", totalCents: 15095,
  lines: [{ sku: "SKU-A", displayName: "Synthetic item A", quantity: 2, lineTotalCents: 14695 }],
  shippingCents: 400, storeCreditAppliedCents: 0, reviewReason: null, shipments: [],
});
const claim = (claimId = "claim-a", orderId = "ord-a") => ({
  claimId, orderId, sku: "SKU-A", reason: "damaged", state: "submitted", resolution: null, submittedAt: "2026-09-07T13:00:00Z",
});
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const detailResponse = (record: unknown = order()) => response({ ok: true, order: record });
const claimsResponse = (claims: unknown = [claim()]) => response({ ok: true, claims });
const submittedResponse = (record: unknown = claim("claim-new")) => response({ ok: true, claim: record });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
let root: Root;
let host: HTMLDivElement;
let fetcher: ReturnType<typeof vi.fn>;
const snapshots: string[] = [];
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.innerHTML); }); return null; }
const render = () => act(async () => root.render(<><OrderDetail /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refreshButton = () => Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh record")!;
const refresh = () => act(async () => refreshButton().click());
const claimsPanel = () => host.querySelector('[data-testid="ra-order-claims"]');
const form = () => host.querySelector<HTMLFormElement>('form[aria-label="Report an issue with this order"]')!;
const field = () => host.querySelector<HTMLTextAreaElement>('[data-testid="ra-claim-detail"]')!;
const submitButton = () => host.querySelector<HTMLButtonElement>('[data-testid="ra-claim-submit"]')!;
const posts = () => fetcher.mock.calls.filter(([, init]) => init.method === "POST");
const detailCalls = () => fetcher.mock.calls.filter(([url]) => url.startsWith("/api/research/orders/"));
const claimReads = () => fetcher.mock.calls.filter(([url, init]) => url === "/api/research/claims" && init.method === "GET");
const fill = (value = "  Synthetic issue detail  ") => act(async () => {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(field(), value);
  field().dispatchEvent(new Event("input", { bubbles: true }));
});
const submit = (times = 1) => act(async () => {
  const target = form(); for (let i = 0; i < times; i++) target.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
});
function serve(options: {
  detail?: () => Response | Promise<Response>;
  claims?: () => Response | Promise<Response>;
  submit?: () => Response | Promise<Response>;
} = {}) {
  fetcher.mockImplementation((url: string, init: RequestInit) => {
    if (init.method === "GET" && url.startsWith("/api/research/orders/")) return options.detail?.() ?? detailResponse();
    if (url === "/api/research/claims" && init.method === "GET") return options.claims?.() ?? claimsResponse();
    if (url === "/api/research/claims" && init.method === "POST") return options.submit?.() ?? submittedResponse();
    throw new Error("Unexpected synthetic request");
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  current.token = "synthetic-customer-a"; current.id = "ord-a"; current.checking = false; snapshots.length = 0;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  fetcher = vi.fn(); serve(); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("canonical member order-detail reads", () => {
  it("uses only exact existing no-store bearer GETs, with no mutation on page read", async () => {
    await render();
    expect(fetcher.mock.calls).toEqual([
      ["/api/research/orders/ord-a", { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-customer-a" } }],
      ["/api/research/claims", { method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-customer-a" } }],
    ]);
    expect(text()).toContain("Synthetic item A"); expect(claimsPanel()?.textContent).toContain("Arrived damaged");
    expect(posts()).toHaveLength(0);
  });
  it.each([undefined, "", "%E0%A4%A", "%2F", "../ord-a", "%252F", "ord-a?email=private", "ord-a#claim", ".."])("rejects invalid route input %s without a fetch", async (id) => {
    current.id = id; await render(); expect(fetcher).not.toHaveBeenCalled();
    expect(text()).toContain("This record address is not valid."); expect(form()).toBeNull();
  });
  it.each(["signed-out", "checking"])("does not load private records while %s", async (mode) => {
    if (mode === "signed-out") current.token = null; else current.checking = true;
    await render(); expect(fetcher).not.toHaveBeenCalled(); expect(text()).not.toContain("Synthetic item A");
  });
  it("clears A's private title, rows, claims, and draft in B's first commit", async () => {
    await render(); await fill("A-PRIVATE-DRAFT"); const pending = deferred<Response>(); serve({ detail: () => pending.promise });
    current.token = "synthetic-customer-b"; await render();
    expect(snapshots.at(-1)).not.toContain("Order ord-a"); expect(snapshots.at(-1)).not.toContain("Synthetic item A");
    expect(snapshots.at(-1)).not.toContain("A-PRIVATE-DRAFT"); expect(claimsPanel()).toBeNull();
    await act(async () => pending.resolve(detailResponse({ ...order(), lines: [{ ...order().lines[0], displayName: "B-only item" }] })));
    expect(text()).toContain("B-only item"); expect(field().value).toBe("");
    expect(detailCalls().at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-customer-b");
  });
  it("isolates a same-account route change and ignores the former order's late result", async () => {
    const stale = deferred<Response>(); serve({ detail: () => stale.promise }); await render();
    current.id = "ord-b"; serve({ detail: () => detailResponse(order("ord-b")), claims: () => claimsResponse([claim("claim-b", "ord-b")]) });
    await render(); await act(async () => stale.resolve(detailResponse()));
    expect(text()).toContain("Order ord-b"); expect(text()).not.toContain("Order ord-a");
    expect(host.querySelector('[data-testid="ra-claim-claim-b"]')).not.toBeNull();
  });
  it("clears data for logout and re-verification with no private reads", async () => {
    await render(); await fill("A-PRIVATE-DRAFT"); current.checking = true; await render();
    expect(text()).not.toContain("Order ord-a"); expect(form()).toBeNull(); expect(detailCalls()).toHaveLength(1);
    current.checking = false; current.token = null; await render(); expect(text()).toContain("Please sign in.");
    expect(detailCalls()).toHaveLength(1);
  });
  it("does not restore the prior login's pending result after A-to-null-to-A", async () => {
    const stale = deferred<Response>(); serve({ detail: () => stale.promise }); await render();
    current.token = null; await render();
    current.token = "synthetic-customer-a"; serve({ detail: () => detailResponse({ ...order(), lines: [] }) }); await render();
    await act(async () => stale.resolve(detailResponse())); expect(text()).not.toContain("Synthetic item A");
  });
  it("refreshes token-bound data without retaining a former token's report draft", async () => {
    await render(); await fill("OLD-TOKEN-DRAFT"); const next = deferred<Response>(); serve({ detail: () => next.promise });
    current.token = "synthetic-customer-a-refreshed"; await render(); expect(snapshots.at(-1)).not.toContain("OLD-TOKEN-DRAFT");
    await act(async () => next.resolve(detailResponse())); expect(field().value).toBe("");
  });
  it("uses latest-order-read wins and clears former claims during reload", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>(); let reads = 0;
    serve({ detail: () => ++reads === 1 ? first.promise : second.promise, claims: () => claimsResponse([]) });
    await refresh(); expect(claimsPanel()).toBeNull(); await refresh();
    await act(async () => second.resolve(detailResponse({ ...order(), lines: [] })));
    await act(async () => first.resolve(response({ ok: false, code: "account_closed" }, 403)));
    expect(text()).toContain("Order ord-a"); expect(text()).not.toContain("This account is closed.");
  });
  it("ignores a previous account's late claims", async () => {
    const stale = deferred<Response>(); serve({ claims: () => stale.promise }); await render();
    current.token = "synthetic-customer-b"; serve({ claims: () => claimsResponse([]) }); await render();
    await act(async () => stale.resolve(claimsResponse())); expect(claimsPanel()).toBeNull();
    expect(text()).toContain("No issue reports were returned for this record.");
  });
  it("ignores late reads after unmount", async () => {
    const pending = deferred<Response>(); serve({ detail: () => pending.promise }); await render();
    await act(async () => root.render(null)); await act(async () => pending.resolve(detailResponse()));
    expect(host.innerHTML).toBe(""); expect(claimReads()).toHaveLength(0);
  });
  it("survives StrictMode effect replay without accepting an older result", async () => {
    const stale = deferred<Response>(); let reads = 0;
    serve({ detail: () => ++reads === 1 ? stale.promise : detailResponse({ ...order(), lines: [] }) });
    await act(async () => root.render(<StrictMode><OrderDetail /></StrictMode>));
    await act(async () => stale.resolve(detailResponse())); expect(text()).not.toContain("Synthetic item A");
  });
});

describe("existing issue-report action is exact and principal-bound", () => {
  it("submits one exact existing payload despite two synchronous submits and blocks refresh while pending", async () => {
    const pending = deferred<Response>(); serve({ submit: () => pending.promise }); await render(); await fill();
    await submit(2); expect(posts()).toHaveLength(1);
    expect(posts()[0]).toEqual(["/api/research/claims", {
      method: "POST", credentials: "same-origin", cache: "no-store",
      headers: { Authorization: "Bearer synthetic-customer-a", "Content-Type": "application/json" },
      body: JSON.stringify({ orderId: "ord-a", sku: "SKU-A", reason: "damaged", detail: "Synthetic issue detail", evidenceRefs: [] }),
    }]);
    expect(field().disabled).toBe(true); expect(submitButton().disabled).toBe(true); expect(refreshButton().disabled).toBe(true);
    await refresh(); expect(detailCalls()).toHaveLength(1);
    await act(async () => pending.resolve(submittedResponse()));
    expect(text()).toContain("The server returned report claim-new with status Submitted.");
    expect(field().value).toBe(""); expect(claimReads()).toHaveLength(2); expect(refreshButton().disabled).toBe(false);
  });
  it("does not send an empty, oversized, or whitespace-only report", async () => {
    await render();
    for (const value of ["", "   ", "x".repeat(2001)]) { await fill(value); await submit(); }
    expect(posts()).toHaveLength(0); expect(text()).toContain("Please describe what happened.");
  });
  it("ignores a pending submission outcome after logout and does not reload claims", async () => {
    const pending = deferred<Response>(); serve({ submit: () => pending.promise }); await render(); await fill(); await submit();
    current.token = null; await render(); const reads = claimReads().length;
    await act(async () => pending.resolve(submittedResponse())); expect(text()).toContain("Please sign in.");
    expect(text()).not.toContain("claim-new"); expect(claimReads()).toHaveLength(reads); expect(posts()).toHaveLength(1);
  });
  it("does not publish A's pending success into B's account or draft", async () => {
    const pending = deferred<Response>(); serve({ submit: () => pending.promise }); await render(); await fill(); await submit();
    current.token = "synthetic-customer-b"; serve({ claims: () => claimsResponse([]) }); await render(); await fill("B-PRIVATE-DRAFT");
    const reads = claimReads().length; await act(async () => pending.resolve(submittedResponse()));
    expect(text()).not.toContain("claim-new"); expect(field().value).toBe("B-PRIVATE-DRAFT"); expect(claimReads()).toHaveLength(reads);
  });
  it("does not publish a pending report into a different order on the same account", async () => {
    const pending = deferred<Response>(); serve({ submit: () => pending.promise }); await render(); await fill(); await submit();
    current.id = "ord-b"; serve({ detail: () => detailResponse(order("ord-b")), claims: () => claimsResponse([]) }); await render();
    await act(async () => pending.resolve(submittedResponse())); expect(text()).toContain("Order ord-b"); expect(text()).not.toContain("claim-new");
  });
  it.each([
    response({ ok: false }, 503), response({ message: "PRIVATE-UPSTREAM" }, 500), response("PRIVATE-UPSTREAM", 200, "text/html"),
    response({ ok: true }), submittedResponse({ ...claim(), orderId: "ord-other" }),
    submittedResponse({ ...claim(), sku: "SKU-OTHER" }), submittedResponse({ ...claim(), reason: "lost" }),
    submittedResponse({ ...claim(), state: "invented" }),
  ])("holds an uncertain response without success, duplicate retry, or a false not-sent statement", async (reply) => {
    serve({ submit: () => reply }); await render(); await fill("RETAINED-DRAFT"); await submit();
    expect(text()).toContain("We could not confirm whether your report was recorded.");
    expect(text()).not.toContain("was not sent"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    expect(text()).not.toContain("The server returned report"); expect(field().value).toBe("RETAINED-DRAFT");
    expect(submitButton().disabled).toBe(true); expect(refreshButton().disabled).toBe(true);
    await submit(); await refresh(); expect(posts()).toHaveLength(1); expect(detailCalls()).toHaveLength(1); expect(claimReads()).toHaveLength(1);
  });
  it("treats a thrown submission as uncertain, retaining the draft without retry", async () => {
    vi.spyOn(commerce, "submitClaim").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); await fill("RETAINED-DRAFT"); await submit();
    expect(text()).toContain("We could not confirm whether your report was recorded.");
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(field().value).toBe("RETAINED-DRAFT");
  });
  it.each([401, 403])("does not show claim success for an authoritative access refusal %s", async (status) => {
    serve({ submit: () => response({ ok: false, ...(status === 403 ? { code: "account_closed" } : {}), message: "PRIVATE-UPSTREAM" }, status) });
    await render(); await fill(); await submit(); expect(text()).not.toContain("The server returned report");
    expect(text()).not.toContain("PRIVATE-UPSTREAM"); expect(claimReads()).toHaveLength(1); expect(refreshButton().disabled).toBe(false);
  });
  it("does not let initial claims overwrite the newer post-submit read", async () => {
    const stale = deferred<Response>(); let reads = 0;
    serve({ claims: () => ++reads === 1 ? stale.promise : claimsResponse([claim("claim-current")]) });
    await render(); await fill(); await submit(); await act(async () => stale.resolve(claimsResponse()));
    expect(host.querySelector('[data-testid="ra-claim-claim-current"]')).not.toBeNull();
    expect(host.querySelector('[data-testid="ra-claim-claim-a"]')).toBeNull();
  });
});

describe("record provenance and unavailable states", () => {
  it.each([
    ["resolved", "refund"], ["resolved", "replacement"], ["resolved", "partial_refund"],
    ["approved", "refund"], ["approved", "replacement"], ["information_requested", null],
  ])("does not promote reported claim state %s / %s to payment or shipment execution", async (state, resolution) => {
    serve({ claims: () => claimsResponse([{ ...claim(), state, resolution }]) }); await render();
    expect(text()).toContain("A report status or resolution does not confirm");
    expect(text()).not.toContain("A refund was issued"); expect(text()).not.toContain("A replacement is being shipped");
    expect(text()).not.toContain("research@xeniostechnology.com");
    if (resolution) expect(text()).toContain("Reported resolution:");
  });
  it("does not infer order type, shipment completeness, or a tracking URL from a legacy record", async () => {
    const { recordKind: _recordKind, ...legacy } = order();
    serve({ detail: () => detailResponse(legacy) }); await render();
    expect(text()).toContain("Record ord-a"); expect(text()).toContain("Shipment details unavailable.");
    expect(text()).not.toContain("No shipments yet.");
    expect(host.querySelector('a[href="mailto:team@xeniostechnology.com"]')).not.toBeNull();
    expect(Array.from(host.querySelectorAll("a")).some((a) => a.getAttribute("href")?.includes("subject="))).toBe(false);
    expect(text()).not.toContain("research@xeniostechnology.com");
  });
  it("shows request provenance and missing item details without inventing claimable items", async () => {
    serve({ detail: () => detailResponse({ ...order(), recordKind: "request", lines: [] }) }); await render();
    expect(text()).toContain("Request ord-a"); expect(form()).toBeNull(); expect(text()).toContain("Item details are needed to report an issue.");
  });
  it("renders connected split shipments with one shipping total and only recorded tracking", async () => {
    serve({ detail: () => detailResponse({ ...order(), shipmentsSource: "connected", shipments: [
      { owner: "mitch", status: "processing", trackingNumber: null, carrier: null },
      { owner: "xenios", status: "delivered", trackingNumber: "SYNTHETIC-TRACK", carrier: "Carrier" },
    ] }) }); await render();
    expect(host.querySelectorAll('[data-testid="ra-shipping-total"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="ra-shipping-total"]')?.textContent).toBe("$4.00");
    expect(text()).toContain("No tracking number was returned for this shipment."); expect(text()).toContain("SYNTHETIC-TRACK");
    expect(Array.from(host.querySelectorAll("a")).some((a) => a.href.includes("SYNTHETIC-TRACK"))).toBe(false);
  });
  it("keeps review presentation informational and labels connected empty shipments accurately", async () => {
    serve({ detail: () => detailResponse({ ...order(), reviewReason: "large_order_review", state: "manual_review", shipmentsSource: "connected" }) }); await render();
    expect(host.querySelector('[data-testid="ra-review-banner"]')).not.toBeNull();
    expect(text()).toContain("No shipment records returned."); expect(text()).not.toContain("Payment captured");
  });
  it.each([
    [401, { ok: false }, "Please sign in."], [403, { ok: false }, "This order is not available."],
    [403, { ok: false, code: "account_closed", message: "PRIVATE-UPSTREAM" }, "This account is closed."],
    [404, { ok: false }, "This order is not available."], [503, { ok: false }, "This order is not available."],
    [500, { message: "PRIVATE-UPSTREAM" }, "This record could not be verified."],
  ])("clears record and claim surfaces for detail response %s", async (status, body, expected) => {
    await render(); serve({ detail: () => response(body, status) }); await refresh();
    expect(text()).toContain(expected); expect(text()).not.toContain("Synthetic item A"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    expect(claimsPanel()).toBeNull(); expect(form()).toBeNull(); expect(claimReads()).toHaveLength(1);
  });
  it.each([{}, { ok: true }, { ok: true, order: order("other-order") }, { ok: true, order: { ...order(), lines: null } }])("does not show malformed or mismatched detail success", async (body) => {
    serve({ detail: () => response(body) }); await render(); expect(text()).toContain("This record could not be verified.");
    expect(form()).toBeNull(); expect(claimReads()).toHaveLength(0);
  });
  it("filters valid other-order reports without exposing them", async () => {
    serve({ claims: () => claimsResponse([claim(), claim("OTHER-PRIVATE-CLAIM", "other-order")]) }); await render();
    expect(host.querySelector('[data-testid="ra-claim-claim-a"]')).not.toBeNull(); expect(host.innerHTML).not.toContain("OTHER-PRIVATE-CLAIM");
  });
  it.each([response({ ok: false }, 503), response({ ok: true }), claimsResponse([claim(), claim()]),
    claimsResponse([{ ...claim(), state: "invented" }]), claimsResponse([{ ...claim(), sku: "WRONG-SKU" }]),
  ])("keeps the verified order while treating malformed/unavailable claims as unknown, not empty", async (reply) => {
    serve({ claims: () => reply }); await render(); expect(text()).toContain("Order ord-a");
    expect(text()).toContain("Issue-report history is unavailable or still loading."); expect(claimsPanel()).toBeNull();
    expect(text()).not.toContain("No issue reports were returned");
  });
  it("contains a thrown order loader and supports a guarded read retry", async () => {
    vi.spyOn(commerce, "getOrder").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("This record could not be verified."); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    await refresh(); expect(text()).toContain("Order ord-a");
  });
  it("contains a thrown claims loader without inventing no reports", async () => {
    vi.spyOn(commerce, "listClaims").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("Order ord-a"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    expect(text()).toContain("Issue-report history is unavailable or still loading.");
  });
});
