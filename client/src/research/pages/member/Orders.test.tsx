// @vitest-environment jsdom
import { StrictMode, act, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Orders from "./Orders";
import * as commerce from "../../adapters/commerce";
import * as capabilities from "../../lib/capabilities";

const session = vi.hoisted(() => ({ token: "synthetic-customer-a" as string | null, checking: false }));
vi.mock("../../core", async (original) => ({
  ...await original<typeof import("../../core")>(),
  useResearch: () => ({ memberToken: session.token, memberChecking: session.checking }),
}));

const order = (id = "ord-a") => ({
  orderId: id, state: "processing", placedAt: "2026-09-07T12:00:00Z", totalCents: 15095, shipments: [],
});
const response = (body: unknown, status = 200, type = "application/json") => new Response(JSON.stringify(body), {
  status, headers: { "content-type": type },
});
const listed = (orders: unknown = [order()]) => response({ ok: true, orders });
const enabled = () => response({ ok: true, capabilities: { product_commerce: { enabled: true } } });
const disabled = () => response({ ok: true, capabilities: {} });
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
function Snapshot() { useLayoutEffect(() => { snapshots.push(host.textContent ?? ""); }); return null; }
const render = () => act(async () => root.render(<><Orders /><Snapshot /></>));
const text = () => host.textContent ?? "";
const refresh = () => act(async () => {
  Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Refresh order history")!.click();
});
const orderCalls = () => fetcher.mock.calls.filter(([url]) => url === "/api/research/orders");
function serve(read: () => Promise<Response> | Response, capabilityRead: () => Promise<Response> | Response = enabled) {
  fetcher.mockImplementation((path: string) => {
    if (path === "/api/research/orders") return read();
    if (path === "/api/research/capabilities") return capabilityRead();
    throw new Error("Unexpected synthetic request");
  });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  session.token = "synthetic-customer-a"; session.checking = false; snapshots.length = 0;
  capabilities.__resetCapabilitiesCache();
  fetcher = vi.fn(); serve(() => listed()); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  await act(async () => root.unmount()); host.remove(); vi.unstubAllGlobals(); vi.restoreAllMocks();
  capabilities.__resetCapabilitiesCache();
  delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("member order history uses the current canonical account", () => {
  it("only reads the existing bearer endpoints with no-store and no query or body", async () => {
    await render();
    expect(orderCalls()).toEqual([["/api/research/orders", {
      method: "GET", credentials: "same-origin", cache: "no-store", headers: { Authorization: "Bearer synthetic-customer-a" },
    }]]);
    expect(fetcher.mock.calls.every(([path, init]) => ["/api/research/orders", "/api/research/capabilities"].includes(path)
      && (init.method ?? "GET") === "GET" && init.body === undefined)).toBe(true);
    expect(text()).toContain("ord-a"); expect(text()).toContain("$150.95");
    expect(host.querySelector('a[aria-label="View record ord-a"]')?.getAttribute("href")).toBe("/research/member/orders/ord-a");
    expect(text()).toContain("Record type unavailable");
  });
  it.each([true, false])("does not read private data while checking or signed out (checking=%s)", async (checking) => {
    session.checking = checking; if (!checking) session.token = null;
    await render(); expect(fetcher).not.toHaveBeenCalled(); expect(text()).not.toContain("ord-a");
    if (!checking) expect(host.querySelector('a[href="/research/sign-in"]')).not.toBeNull();
  });
  it("clears displayed A rows in B's first commit before B's read settles", async () => {
    await render(); const b = deferred<Response>(); serve(() => b.promise);
    session.token = "synthetic-customer-b"; await render();
    expect(snapshots.at(-1)).not.toContain("ord-a"); expect(text()).not.toContain("ord-a");
    expect(orderCalls().at(-1)?.[1].headers.Authorization).toBe("Bearer synthetic-customer-b");
    await act(async () => b.resolve(listed([order("ord-b")])));
    expect(text()).toContain("ord-b"); expect(text()).not.toContain("ord-a");
  });
  it("ignores A's late response after B has loaded", async () => {
    const a = deferred<Response>(); serve(() => a.promise); await render();
    serve(() => listed([order("ord-b")])); session.token = "synthetic-customer-b"; await render();
    await act(async () => a.resolve(listed()));
    expect(text()).toContain("ord-b"); expect(text()).not.toContain("ord-a");
  });
  it("clears rows on logout and never republishes a late refresh", async () => {
    await render(); const pending = deferred<Response>(); serve(() => pending.promise); await refresh();
    session.token = null; await render(); const calls = fetcher.mock.calls.length;
    expect(snapshots.at(-1)).not.toContain("ord-a"); expect(text()).toContain("Please sign in.");
    await act(async () => pending.resolve(listed()));
    expect(text()).not.toContain("ord-a"); expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it("does not restore A's old data after A-to-null-to-A sign-in", async () => {
    const stale = deferred<Response>(); serve(() => stale.promise); await render();
    session.token = null; await render(); serve(() => listed([order("ord-new-a")]));
    session.token = "synthetic-customer-a"; await render(); await act(async () => stale.resolve(listed()));
    expect(text()).toContain("ord-new-a"); expect(text()).not.toContain("ord-a");
  });
  it("clears rows during session verification then reloads the unchanged credential", async () => {
    await render(); session.checking = true; await render();
    expect(snapshots.at(-1)).not.toContain("ord-a"); expect(orderCalls()).toHaveLength(1);
    const pending = deferred<Response>(); serve(() => pending.promise); session.checking = false; await render();
    expect(orderCalls()).toHaveLength(2); expect(text()).not.toContain("ord-a");
    await act(async () => pending.resolve(listed([order("ord-reverified")])));
    expect(text()).toContain("ord-reverified");
  });
  it("rechecks a refreshed token without showing the former token's rows", async () => {
    await render(); const refreshed = deferred<Response>(); serve(() => refreshed.promise);
    session.token = "synthetic-customer-a-refreshed"; await render();
    expect(snapshots.at(-1)).not.toContain("ord-a");
    await act(async () => refreshed.resolve(listed([order("ord-current")])));
    expect(text()).toContain("ord-current");
  });
  it("uses latest-request-wins for overlapping refreshes including a late denial", async () => {
    await render(); const first = deferred<Response>(); const second = deferred<Response>();
    let reads = 0; serve(() => ++reads === 1 ? first.promise : second.promise);
    await refresh(); await refresh(); expect(text()).not.toContain("ord-a");
    await act(async () => second.resolve(listed([order("ord-new")])));
    await act(async () => first.resolve(response({ ok: false, code: "account_closed" }, 403)));
    expect(text()).toContain("ord-new"); expect(text()).not.toContain("This account is closed.");
  });
  it("does not resurrect previously successful data while retrying a denial", async () => {
    await render(); serve(() => response({ ok: false, code: "account_closed" }, 403)); await refresh();
    expect(text()).toContain("This account is closed."); expect(text()).not.toContain("ord-a");
    const pending = deferred<Response>(); serve(() => pending.promise); await refresh();
    expect(text()).not.toContain("ord-a"); expect(host.querySelector("table")).toBeNull();
  });
  it("ignores late reads after unmount and has no extra requests", async () => {
    const pending = deferred<Response>(); serve(() => pending.promise); await render();
    await act(async () => root.render(null)); const calls = fetcher.mock.calls.length;
    await act(async () => pending.resolve(listed()));
    expect(host.textContent).toBe(""); expect(fetcher).toHaveBeenCalledTimes(calls);
  });
  it("survives StrictMode effect replay without accepting the older read", async () => {
    const first = deferred<Response>(); let reads = 0;
    serve(() => ++reads === 1 ? first.promise : listed([order("ord-current")]));
    await act(async () => root.render(<StrictMode><Orders /></StrictMode>));
    await act(async () => first.resolve(listed()));
    expect(text()).toContain("ord-current"); expect(text()).not.toContain("ord-a");
  });
});

describe("truthful order-source and failure presentation", () => {
  it.each([undefined, "unavailable"])("does not turn unknown shipment completeness into no shipments (%s)", async (source) => {
    serve(() => listed([{ ...order(), shipmentsSource: source }])); await render();
    expect(text()).toContain("Shipment details unavailable"); expect(text()).not.toContain("No shipments yet");
  });
  it("labels an explicitly connected empty shipment list without a delivery claim", async () => {
    serve(() => listed([{ ...order(), shipmentsSource: "connected" }])); await render();
    expect(text()).toContain("No shipment records returned"); expect(text()).not.toContain("Delivered");
  });
  it("renders connected recorded tracking as text without inventing a carrier URL", async () => {
    serve(() => listed([{ ...order(), recordKind: "request", shipmentsSource: "connected", shipments: [
      { owner: "xenios", status: "label_created", trackingNumber: "TRACK-SYNTHETIC", carrier: null },
    ] }])); await render();
    expect(text()).toContain("Xenios: label_created, tracking TRACK-SYNTHETIC");
    expect(host.querySelector('a[aria-label="View request ord-a"]')).not.toBeNull();
    expect(text()).toContain("Request record");
    expect(Array.from(host.querySelectorAll("a")).some((a) => a.href.includes("TRACK-SYNTHETIC"))).toBe(false);
  });
  it("preserves the canonical manual-review note without promoting the record to paid or fulfilled", async () => {
    serve(() => listed([{ ...order(), state: "manual_review" }])); await render();
    expect(host.querySelector('[data-testid="ra-orders-review-note"]')).not.toBeNull();
    expect(text()).toContain("Pending review"); expect(text()).not.toContain("Payment captured");
  });
  it("keeps historical rows visible when new commerce is disabled", async () => {
    serve(() => listed(), disabled); await render(); expect(text()).toContain("ord-a");
    expect(host.querySelector('[data-testid="ra-capability-product_commerce"]')).toBeNull();
  });
  it("qualifies an enabled empty response without claiming complete history or eligibility", async () => {
    serve(() => listed([])); await render(); expect(text()).toContain("No orders yet.");
    expect(text()).toContain("No order records were returned by this source.");
    expect(text()).toContain("not a confirmation of a complete history");
  });
  it("does not show another principal's previously enabled capability while B's capability is pending", async () => {
    serve(() => listed([])); await render(); expect(text()).toContain("No orders yet.");
    const pending = deferred<Response>(); serve(() => listed([]), () => pending.promise);
    session.token = "synthetic-customer-b"; await render();
    expect(text()).not.toContain("No orders yet."); expect(text()).toContain("Ordering is not open yet.");
    await act(async () => pending.resolve(disabled())); expect(text()).not.toContain("No orders yet.");
  });
  it("ignores the former principal's late enabled capability", async () => {
    const pending = deferred<Response>(); serve(() => listed([]), () => pending.promise); await render();
    serve(() => listed([]), disabled); session.token = "synthetic-customer-b"; await render();
    await act(async () => pending.resolve(enabled())); expect(text()).not.toContain("No orders yet.");
  });
  it.each([
    [401, { ok: false }, "Please sign in."],
    [403, { ok: false }, "Order history is unavailable."],
    [403, { ok: false, code: "account_closed", message: "PRIVATE-UPSTREAM" }, "This account is closed."],
    [404, { ok: false }, "Order history is unavailable."],
    [503, { ok: false }, "Order history is unavailable."],
    [500, { message: "PRIVATE-UPSTREAM" }, "Order history could not be verified."],
  ])("fails closed for HTTP %s without leaking server details", async (status, body, expected) => {
    serve(() => response(body, status)); await render(); expect(text()).toContain(expected);
    expect(text()).not.toContain("ord-a"); expect(text()).not.toContain("No orders yet."); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it.each([{}, { orders: [] }, { ok: true, orders: null }, { ok: true, orders: [{ ...order(), totalCents: -1 }] },
    { ok: true, orders: [order(), order()] }, { ok: true, orders: [{ ...order(), state: "paid_by_assumption" }] },
  ])("refuses a malformed successful payload instead of rendering a fake empty or payable record", async (body) => {
    serve(() => response(body)); await render(); expect(text()).toContain("Order history could not be verified.");
    expect(host.querySelector("table")).toBeNull(); expect(text()).not.toContain("No orders yet.");
  });
  it("treats HTML success as unavailable", async () => {
    serve(() => response("<html>PRIVATE-UPSTREAM</html>", 200, "text/html")); await render();
    expect(text()).toContain("Order history is unavailable."); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
  it("handles thrown loaders and lets the existing retry read recover", async () => {
    vi.spyOn(commerce, "listOrders").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("Order history could not be verified."); expect(text()).not.toContain("PRIVATE-UPSTREAM");
    await act(async () => Array.from(host.querySelectorAll("button")).find((button) => button.textContent === "Try again")!.click());
    expect(text()).toContain("ord-a");
  });
  it("keeps a thrown capability read fail-closed without hiding known historical rows", async () => {
    vi.spyOn(capabilities, "fetchCapabilities").mockRejectedValueOnce(new Error("PRIVATE-UPSTREAM"));
    await render(); expect(text()).toContain("ord-a"); expect(text()).not.toContain("PRIVATE-UPSTREAM");
  });
});
