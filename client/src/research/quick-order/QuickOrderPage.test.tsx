// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assistedOrderFormPair, requiredAssistedOrderFormAcknowledgments } from "@shared/research/assisted-order/form";
import { QuickOrderForm, type QuickOrderTransport } from "./QuickOrderPage";

vi.mock("@/clarity/PublicShell", () => ({ default: ({ children }: { children: ReactNode }) => <div>{children}</div> }));
const config = { enabled: true, csrfToken: "synthetic-csrf", agreements: [
  { kind: "terms", version: "synthetic-v1", label: "Synthetic terms", url: "/legal/synthetic-terms" },
  ...requiredAssistedOrderFormAcknowledgments({ includesResearchUseOnly: false }).map(ack => ({ ...assistedOrderFormPair(ack), label: ack.copy, type: "form_acknowledgment" as const, url: null })),
] };
const item = { productId: "synthetic-product", variantId: "synthetic-variant", productName: "Synthetic item", specification: "Exact test variant", family: "Synthetic",
  workflowMode: "direct_order_request", unitPriceCents: 2500, currency: "USD", catalogVersion: "synthetic-catalog-v1", priceVersion: "synthetic-price-v1",
  minimumQuantity: 1, maximumQuantity: 50, quantityIncrement: 1, researchUseOnly: false, requestable: true, accessNotice: null };
const receipt = { requestId: "454b01cd-4ce9-4a45-a5a3-454cef294c48", publicReference: "XRR-20261005-ABCDEF1234", status: "submitted", paymentStatus: "not_collected",
  commissionState: "not_authorized", attributionState: "direct_no_referrer", replayed: false,
  estimate: { knownSubtotalCents: 2500, estimateComplete: true, currency: "USD", excludes: "Synthetic estimate, not a payment quote." } };
const response = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body } as Response);
let host: HTMLDivElement, root: Root, transport: ReturnType<typeof vi.fn<QuickOrderTransport>>;
let posts: { url: string; init: RequestInit }[];
let postResult: () => Promise<Response>;
const text = () => host.textContent ?? "";
function input(name: string) { return host.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!; }
function change(name: string, value: string) { const node = input(name); act(() => {
  const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(node, value);
  node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true }));
}); }
function button(label: string) { const result = [...host.querySelectorAll("button")].find(node => node.textContent === label); if (!result) throw new Error(`Missing button ${label}`); return result; }
async function click(label: string) { await act(async () => button(label).click()); }
async function render(sessionKey: string | null = "synthetic-account-a", intakeEnabled = true) {
  await act(async () => root.render(<QuickOrderForm sessionKey={sessionKey} intakeEnabled={intakeEnabled} transport={transport} />));
}
async function fill() {
  await click("Add to request");
  for (const [name, value] of Object.entries({ fullLegalName: "Synthetic Customer", email: "synthetic@example.test", mobilePhone: "2025550123",
    "shipping.line1": "123 Example Street", "shipping.city": "Austin", "shipping.region": "TX", "shipping.postalCode": "78701",
    billingChoice: "same", sourceKind: "direct", affiliationKind: "none" })) change(name, value);
  for (const name of ["ageConfirmed", "referralConfirmed", "agreement-0", "agreement-1", "agreement-2", "agreement-3", "requestAcknowledged"]) act(() => input(name).click());
}
async function review() { await click("Review my request"); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  posts = []; postResult = async () => response(receipt, 201);
  transport = vi.fn<QuickOrderTransport>(async (url, init) => { if (init.method === "POST") { posts.push({ url, init }); return postResult(); }
    return response(url.endsWith("/config") ? config : { items: [item], total: 1, page: 1, pageSize: 24 }); });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); vi.restoreAllMocks(); });
describe("isolated Quick Order component", () => {
  it("defaults disabled and collects nothing without the session/readiness boundary", async () => {
    await act(async () => root.render(<QuickOrderForm sessionKey="synthetic-account-a" transport={transport} />));
    expect(host.querySelector("input")).toBeNull(); expect(transport).not.toHaveBeenCalled();
    await render(null); expect(host.querySelector("form")).toBeNull(); expect(transport).not.toHaveBeenCalled();
  });
  it("renders current legal links and operational facts without duplicate shell", async () => { await render();
    expect(host.querySelector("header")).toBeNull(); expect(host.querySelector("main")).toBeNull();
    expect(input("agreement-1").parentElement?.textContent).toContain("I confirm that the information I provided is accurate");
    expect(input("agreement-1").parentElement?.querySelector("a")).toBeNull();
    expect(input("agreement-0").parentElement?.querySelector("a")?.getAttribute("href")).toBe("/legal/synthetic-terms");
  });
  it("focuses a field-linked error summary without sending omissions", async () => { await render(); await review();
    expect(posts).toHaveLength(0); const summary = host.querySelector('[role="alert"]')!; expect(document.activeElement).toBe(summary);
    expect(input("fullLegalName").getAttribute("aria-invalid")).toBe("true");
    act(() => summary.querySelector<HTMLAnchorElement>("a")!.click()); expect(document.activeElement).toBe(input("fullLegalName"));
  });
  it("maps server validation errors to safe field errors and summary focus", async () => {
    postResult = async () => response({ code: "invalid_input", field: "phone", message: "private reflected payload" }, 422);
    await render(); await fill(); await review(); await click("Submit request for review");
    expect(input("mobilePhone").getAttribute("aria-invalid")).toBe("true"); expect(text()).toContain("Check your US phone number.");
    expect(text()).not.toContain("private reflected payload"); expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
    expect(text()).not.toContain("Confirmation is unresolved"); expect(input("mobilePhone").closest("fieldset")?.disabled).toBe(false);
  });
  it("offers the existing Care route without selecting or pricing provider rows", async () => {
    transport.mockImplementation(async url => response(url.endsWith("/config") ? config : { items: [{ ...item, workflowMode: "provider_request", requestable: false, unitPriceCents: null, priceVersion: null,
      accessNotice: "Continue through Xenios Care for provider routing." }], total: 1, page: 1, pageSize: 24 }));
    await render(); expect(host.querySelector('a[href="/care"]')?.textContent).toBe("Explore Xenios Care");
    expect(button("Not requestable here").disabled).toBe(true); expect(text()).not.toContain("$25.00"); expect(posts).toHaveLength(0);
  });
  it("supports explicit direct/none, optional suite/code and receipt only after validated write", async () => { await render(); await fill(); await review();
    expect(text()).toContain("Confirm your request"); expect(document.activeElement?.textContent).toBe("Confirm your request");
    await click("Submit request for review"); expect(posts).toHaveLength(1); const payload = JSON.parse(posts[0].init.body as string);
    expect(payload.referral).toEqual({ kind: "direct", detail: "", declaredCode: "", confirmed: true });
    expect(payload.affiliation).toEqual({ kind: "none", detail: "" }); expect(payload.contact.shippingAddress.line2).toBe("");
    expect(posts[0].init.headers).toHaveProperty("X-CSRF-Token", config.csrfToken);
    expect(text()).toContain(receipt.publicReference); expect(text()).toContain("No payment was collected");
    expect(host.querySelector("input")).toBeNull(); expect(document.activeElement?.textContent).toBe("Request received");
  });
  it("invalidates review after a field or quantity changes", async () => { await render(); await fill(); await review(); change("fullLegalName", "Changed Synthetic Name");
    expect(text()).not.toContain("Confirm your request"); await review(); const quantity = host.querySelector<HTMLInputElement>('input[type="number"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(quantity, "2"); quantity.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(text()).not.toContain("Confirm your request"); expect(posts).toHaveLength(0);
  });
  it("requires conditional referral, affiliation and full separate billing", async () => { await render(); await fill(); change("sourceKind", "person"); change("affiliationKind", "clinic"); change("billingChoice", "different"); await review();
    expect(input("sourceDetail").getAttribute("aria-invalid")).toBe("true"); expect(input("affiliationDetail").getAttribute("aria-invalid")).toBe("true"); expect(input("billing.line1").getAttribute("aria-invalid")).toBe("true");
    for (const [name, value] of Object.entries({ sourceDetail: "Synthetic Source", affiliationDetail: "Synthetic Clinic", "billing.line1": "456 Example Road", "billing.city": "Dallas", "billing.region": "TX", "billing.postalCode": "75201" })) change(name, value);
    await review(); expect(text()).toContain("456 Example Road"); expect(text()).toContain("Synthetic Clinic");
  });
  it.each([{}, { ...receipt, publicReference: "" }, { ...receipt, paymentStatus: "paid" }])("never treats malformed HTTP success as receipt: %j", async body => {
    postResult = async () => response(body, 201); await render(); await fill(); await review(); await click("Submit request for review");
    expect(text()).not.toContain("Request received"); expect(text()).toContain("Confirmation is unresolved"); expect(input("fullLegalName").disabled || input("fullLegalName").closest("fieldset")?.disabled).toBe(true);
  });
  it("recovers an unknown outcome with exactly the same key and payload", async () => {
    postResult = async () => { throw new Error("synthetic network loss"); }; await render(); await fill(); await review(); await click("Submit request for review");
    const first = posts[0].init.body; postResult = async () => response({ ...receipt, replayed: true }); await click("Retry confirmation");
    expect(posts).toHaveLength(2); expect(posts[1].init.body).toBe(first); expect(text()).toContain(receipt.publicReference);
  });
  it("refreshes session-bound CSRF after 403 while preserving the same actor attempt", async () => {
    let token = "synthetic-initial-token";
    transport.mockImplementation(async (url, init) => {
      if (init.method === "POST") { posts.push({ url, init }); return response(posts.length === 1 ? { code: "csrf_rejected" } : { ...receipt, replayed: true }, posts.length === 1 ? 403 : 200); }
      return response(url.endsWith("/config") ? { ...config, csrfToken: token } : { items: [item], total: 1, page: 1, pageSize: 24 });
    });
    await render(); await fill(); await review(); await click("Submit request for review");
    expect(text()).toContain("Confirmation is unresolved"); const firstPayload = posts[0].init.body;
    token = "synthetic-refreshed-token"; await click("Retry confirmation");
    expect(posts[0].init.headers).toHaveProperty("X-CSRF-Token", "synthetic-initial-token");
    expect(posts[1].init.headers).toHaveProperty("X-CSRF-Token", "synthetic-refreshed-token");
    expect(posts[1].init.body).toBe(firstPayload); expect(text()).toContain(receipt.publicReference);
  });
  it("recovers an earlier unknown request when current legal/intake configuration is disabled", async () => {
    let disabled = false;
    transport.mockImplementation(async (url, init) => {
      if (init.method === "POST") { posts.push({ url, init }); if (posts.length === 1) throw new Error("synthetic response loss"); return response({ ...receipt, replayed: true }); }
      return response(url.endsWith("/config") ? disabled ? { enabled: false, csrfToken: "synthetic-recovery-token", agreements: [] } : config : { items: [item], total: 1, page: 1, pageSize: 24 });
    });
    await render(); await fill(); await review(); await click("Submit request for review"); disabled = true;
    await click("Retry confirmation"); expect(posts).toHaveLength(2); expect(posts[1].init.body).toBe(posts[0].init.body);
    expect(posts[1].init.headers).toHaveProperty("X-CSRF-Token", "synthetic-recovery-token"); expect(text()).toContain(receipt.publicReference);
  });
  it.each(["disabled", "outage"])("preserves same-account recovery across a new transport and config %s", async mode => {
    postResult = async () => { throw new Error("synthetic response loss"); };
    await render(); await fill(); await review(); await click("Submit request for review");
    const originalBody = posts[0].init.body;
    let outage = mode === "outage";
    transport = vi.fn<QuickOrderTransport>(async (url, init) => {
      if (init.method === "POST") { posts.push({ url, init }); return response({ ...receipt, replayed: true }); }
      if (outage) throw new Error("synthetic configuration outage");
      return response({ enabled: false, csrfToken: "synthetic-rotated-transport-token", agreements: [] });
    });
    await render();
    expect(text()).toContain("Confirmation is unresolved"); expect(button("Retry confirmation").disabled).toBe(false);
    expect(input("fullLegalName").value).toBe("Synthetic Customer");
    expect(input("fullLegalName").closest("fieldset")?.disabled).toBe(true);
    if (outage) {
      await click("Retry confirmation"); expect(posts).toHaveLength(1);
      expect(text()).toContain("Confirmation is unresolved"); outage = false;
    }
    await click("Retry confirmation"); expect(posts).toHaveLength(2); expect(posts[1].init.body).toBe(originalBody);
    expect(posts[1].init.headers).toHaveProperty("X-CSRF-Token", "synthetic-rotated-transport-token");
    expect(text()).toContain(receipt.publicReference);
  });
  it("preserves only same-session receipt recovery when intakeEnabled becomes false", async () => {
    postResult = async () => { throw new Error("synthetic response loss"); };
    await render(); await fill(); await review(); await click("Submit request for review");
    const originalBody = posts[0].init.body, callsBeforeDisable = transport.mock.calls.length;
    await render("synthetic-account-a", false);
    expect(transport.mock.calls).toHaveLength(callsBeforeDisable);
    expect(text()).toContain("Confirmation is unresolved"); expect(input("fullLegalName").closest("fieldset")?.disabled).toBe(true);
    transport.mockImplementation(async (url, init) => {
      if (init.method === "POST") { posts.push({ url, init }); return response({ ...receipt, replayed: true }); }
      return response({ enabled: false, csrfToken: "synthetic-disabled-intake-recovery", agreements: [] });
    });
    await click("Retry confirmation"); expect(posts).toHaveLength(2); expect(posts[1].init.body).toBe(originalBody);
    expect(text()).toContain(receipt.publicReference); expect(host.querySelector("input")).toBeNull();
    await render(null, false); expect(text()).not.toContain(receipt.publicReference); expect(text()).toContain("No information is collected here");
  });
  it("stops a new POST if intake disables while its CSRF refresh is pending", async () => {
    await render(); await fill(); await review();
    let finish!: (value: Response) => void;
    transport.mockImplementation(async (url, init) => {
      if (init.method === "POST") { posts.push({ url, init }); return response(receipt, 201); }
      return new Promise(resolve => { finish = resolve; });
    });
    await click("Submit request for review"); await render("synthetic-account-a", false);
    await act(async () => finish(response(config)));
    expect(posts).toHaveLength(0); expect(host.querySelector("input")).toBeNull(); expect(text()).toContain("No information is collected here");
  });
  it("does not POST a fresh request after intake disables during review", async () => {
    await render(); await fill(); await review();
    transport.mockImplementation(async () => response({ enabled: false, csrfToken: "synthetic-current-token", agreements: [] }));
    await click("Submit request for review"); expect(posts).toHaveLength(0); expect(text()).toContain("This attempt was not sent"); expect(text()).not.toContain("Confirmation is unresolved");
  });
  it("double click cannot create two pending writes", async () => {
    let finish!: (value: Response) => void; postResult = () => new Promise(resolve => { finish = resolve; });
    await render(); await fill(); await review(); await act(async () => { const submit = button("Submit request for review"); submit.click(); submit.click(); });
    expect(posts).toHaveLength(1); await act(async () => finish(response(receipt, 201))); expect(text()).toContain(receipt.publicReference);
  });
  it("discards late receipts and all contact values across an account boundary", async () => {
    let finish!: (value: Response) => void; postResult = () => new Promise(resolve => { finish = resolve; }); await render(); await fill(); await review(); await click("Submit request for review");
    const oldSignal = posts[0].init.signal; await render("synthetic-account-b"); expect(oldSignal?.aborted).toBe(true);
    expect(input("fullLegalName").value).toBe(""); await act(async () => finish(response(receipt, 201))); expect(text()).not.toContain(receipt.publicReference);
  });
  it("aborts on unmount and remount does not retain personal data or duplicate handlers", async () => {
    await render(); await fill(); await act(async () => root.render(null)); await render(); expect(input("fullLegalName").value).toBe("");
    await fill(); await review(); await click("Submit request for review"); expect(posts).toHaveLength(1);
  });
  it("suppresses a stale catalog response after a newer search", async () => {
    let finish!: (value: Response) => void;
    transport.mockImplementation(async (url) => { if (url.endsWith("/config")) return response(config);
      if (url.includes("search=new")) return response({ items: [{ ...item, productName: "New result" }], total: 1, page: 1, pageSize: 24 });
      return new Promise(resolve => { finish = resolve; }); }); await render();
    const search = host.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(search, "new"); search.dispatchEvent(new Event("input", { bubbles: true })); });
    await click("Search"); expect(text()).toContain("New result"); await act(async () => finish(response({ items: [item], total: 1, page: 1, pageSize: 24 })));
    expect(text()).toContain("New result"); expect(text()).not.toContain("Synthetic item");
  });
  it("supports variant page 2 with exact server totals", async () => {
    transport.mockImplementation(async url => response(url.endsWith("/config") ? config : url.includes("page=2") ? { items: [{ ...item, productName: "Variant 25" }], total: 25, page: 2, pageSize: 24 }
      : { items: Array.from({ length: 24 }, (_, index) => ({ ...item, variantId: `variant-${index}` })), total: 25, page: 1, pageSize: 24 }));
    await render(); expect(text()).toContain("25 matching variants"); await click("Next"); expect(text()).toContain("Variant 25"); expect(text()).toContain("Page 2 of 2"); expect(button("Next").disabled).toBe(true);
  });
  it("has no browser storage of personal data", async () => { const local = vi.spyOn(Storage.prototype, "setItem"); await render(); await fill(); await review(); await click("Submit request for review"); expect(local).not.toHaveBeenCalled(); });
});
