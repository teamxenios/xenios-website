// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BusinessInquiryPage, BusinessInquiryRecord } from "@shared/research/business-inquiry";
import BusinessInquiryQueue, { type BusinessInquiryQueueProps } from "./BusinessInquiryQueue";
import { BusinessInquiryStaffError, type BusinessInquiryStaffApi } from "./business-inquiry-staff-api";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const firstId = "00000000-0000-4000-8000-000000000001";
const secondId = "00000000-0000-4000-8000-000000000002";
function record(id = firstId, letter = "A"): BusinessInquiryRecord {
  return { id, reference: `BE-${letter.repeat(24)}`, receivedAt: "2026-11-18T20:00:00.000Z",
    provenance: "web", category: "b2b_organization", state: "needs_human_review", revision: 1,
    assignedTo: null, organizationId: null, policyVersion: "synthetic-business-policy",
    enquiry: { contactName: `Example Contact ${letter}`, contactEmail: `example-${letter.toLowerCase()}@example.test`,
      organizationName: `Example Organization ${letter}`, organizationType: "research", location: "Austin",
      serviceArea: "Synthetic service area", categories: ["research"],
      selections: [{ description: "Exact requested item", variant: "Exact presentation", quantity: 2.5, unit: "bottle" },
        { description: "Second requested item", variant: "Other presentation", quantity: 7, unit: "vial" }],
      packagingPreference: "organization_brand", siteCount: 3, replenishment: "recurring", services: ["sourcing"],
      timing: "Synthetic timing", documentationNeeds: "Synthetic documentation", context: "Audited detail context",
      referral: "Reported source, not an owner" } };
}
const first = record(), second = record(secondId, "B");
function makeApi(page: BusinessInquiryPage = { items: [first, second], nextBefore: null }) {
  return {
    list: vi.fn(async (_before?: string, _options?: { signal?: AbortSignal }): Promise<BusinessInquiryPage> => page),
    read: vi.fn(async (id: string, _options?: { signal?: AbortSignal }): Promise<BusinessInquiryRecord> => id === secondId ? second : first),
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let root: Root | null = null, host: HTMLDivElement | null = null;
let generation: string;
const current = (value: string) => generation === value;
beforeEach(() => { generation = "lifetime-1"; });
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove(); root = null; host = null;
});
async function render(api: BusinessInquiryStaffApi | null, props: Partial<BusinessInquiryQueueProps> = {}) {
  if (!host) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => root!.render(<BusinessInquiryQueue api={api} contextGeneration={generation} isContextCurrent={current} {...props} />));
  return host;
}
async function button(view: HTMLElement, text: string) {
  const target = [...view.querySelectorAll("button")].find((item) => item.textContent === text);
  if (!target) throw new Error(`Missing button ${text}`);
  await act(async () => target.click());
}
function openButton(view: HTMLElement, reference: string): HTMLButtonElement {
  const target = [...view.querySelectorAll("button")].find((item) => item.getAttribute("aria-label") === `Open enquiry ${reference}`);
  if (!target) throw new Error("Missing enquiry control");
  return target;
}
async function open(view: HTMLElement, reference = first.reference) { await act(async () => openButton(view, reference).click()); }
function setSearch(view: HTMLElement, value: string) {
  const input = view.querySelector('input[type="search"]') as HTMLInputElement;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("injected business enquiry staff queue", () => {
  it("fails closed without a configured API or a current Root lifetime", async () => {
    const view = await render(null);
    expect(view.textContent).toContain("Staff queue unavailable");
    const api = makeApi(); await render(api, { isContextCurrent: () => false });
    expect(api.list).not.toHaveBeenCalled(); expect(view.textContent).not.toContain(first.reference);
  });
  it("lists one bounded page, then calls the actual detail read before showing items or context", async () => {
    const api = makeApi(); const view = await render(api);
    expect(api.list).toHaveBeenCalledExactlyOnceWith(undefined, { signal: expect.any(AbortSignal) });
    expect(view.textContent).toContain(first.reference); expect(view.textContent).toContain("Example Organization A");
    expect(view.textContent).not.toContain("Audited detail context"); expect(view.textContent).not.toContain("Exact requested item");
    expect(api.read).not.toHaveBeenCalled();
    const control = openButton(view, first.reference); control.focus();
    expect(control.type).toBe("button"); expect(document.activeElement).toBe(control);
    expect(document.getElementById(control.getAttribute("aria-controls")!)).not.toBeNull();
    await open(view);
    expect(api.read).toHaveBeenCalledExactlyOnceWith(firstId, { signal: expect.any(AbortSignal) });
    expect(view.textContent).toContain("Quantity: 2.5 bottle"); expect(view.textContent).toContain("Quantity: 7 vial");
    expect(view.textContent).toContain("Synthetic service area"); expect(view.textContent).toContain("Synthetic timing");
    expect(view.textContent).toContain("Synthetic documentation"); expect(view.textContent).toContain("Audited detail context");
    expect(view.textContent).toContain("Reported referral — unverified attribution");
    expect(document.activeElement?.textContent).toBe(`Enquiry ${first.reference}`);
    expect(view.textContent).not.toContain("9.5");
  });
  it("does not treat the list payload as detail while the audited read is pending", async () => {
    const pending = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => pending.promise);
    const view = await render(api); await open(view);
    expect(view.textContent).toContain("Loading enquiry detail"); expect(view.textContent).not.toContain("Audited detail context");
    await act(async () => pending.resolve({ ...first, enquiry: { ...first.enquiry, context: "Read endpoint content" } }));
    expect(view.textContent).toContain("Read endpoint content"); expect(view.textContent).not.toContain("Audited detail context");
  });
  it("distinguishes a verified empty page from an unavailable source", async () => {
    const view = await render(makeApi({ items: [], nextBefore: null }));
    expect(view.textContent).toContain("No enquiries on this page"); expect(view.textContent).not.toContain("Enquiries unavailable");
  });
  it("shows loading before the first list reply without inventing an empty result", async () => {
    const pending = deferred<BusinessInquiryPage>(); const api = makeApi(); api.list.mockImplementationOnce(() => pending.promise);
    const view = await render(api);
    expect(view.textContent).toContain("Loading business enquiries"); expect(view.textContent).not.toContain("No enquiries on this page");
    await act(async () => pending.resolve({ items: [first], nextBefore: null }));
    expect(view.textContent).toContain(first.reference);
  });
  it("offers an explicit same-page retry after unavailable without leaking diagnostics or automatic retries", async () => {
    const api = makeApi(); api.list.mockRejectedValueOnce(new Error("private@example.test provider diagnostic"));
    const view = await render(api);
    expect(view.textContent).toContain("Enquiries unavailable"); expect(view.textContent).not.toContain("private@example.test");
    expect(view.textContent).not.toContain("No enquiries on this page"); expect(api.list).toHaveBeenCalledTimes(1);
    await button(view, "Retry page"); expect(api.list).toHaveBeenCalledTimes(2);
    expect(api.list.mock.calls[1][0]).toBeUndefined(); expect(view.textContent).toContain(first.reference);
  });
  it("retries unavailable detail only through another actual read", async () => {
    const api = makeApi(); api.read.mockRejectedValueOnce(new BusinessInquiryStaffError("unavailable"));
    const view = await render(api); await open(view);
    expect(view.textContent).toContain("The enquiry detail could not be loaded"); expect(view.textContent).not.toContain("Audited detail context");
    await button(view, "Retry detail"); expect(api.read).toHaveBeenCalledTimes(2); expect(view.textContent).toContain("Audited detail context");
  });
  it("replaces its one page using the supplied cursor and clears prior detail", async () => {
    const api = makeApi(); api.list.mockResolvedValueOnce({ items: [first], nextBefore: firstId })
      .mockResolvedValueOnce({ items: [second], nextBefore: null });
    const view = await render(api); await open(view); await button(view, "Next page");
    expect(api.list.mock.calls[1][0]).toBe(firstId); expect(view.textContent).toContain("Page 2");
    expect(view.textContent).toContain(second.reference); expect(view.textContent).not.toContain(first.reference);
    expect(view.textContent).not.toContain("Audited detail context");
    await button(view, "First page"); expect(api.list.mock.calls[2][0]).toBeUndefined();
  });
  it("stops a repeated pagination cursor without another request loop", async () => {
    const api = makeApi(); api.list.mockResolvedValueOnce({ items: [first], nextBefore: firstId })
      .mockResolvedValueOnce({ items: [second], nextBefore: firstId });
    const view = await render(api); await button(view, "Next page");
    expect(view.textContent).toContain("server repeated a cursor");
    const next = [...view.querySelectorAll("button")].find((item) => item.textContent === "Next page")!;
    expect(next.disabled).toBe(true); await act(async () => next.click()); expect(api.list).toHaveBeenCalledTimes(2);
  });
  it("bounds one browsing session to twenty pages without retaining previous page rows", async () => {
    const api = makeApi(); let page = 0;
    api.list.mockImplementation(async () => {
      page += 1;
      const id = `00000000-0000-4000-8000-${String(page).padStart(12, "0")}`;
      return { items: [{ ...record(id), reference: `BE-${page.toString(16).toUpperCase().padStart(24, "0")}` }], nextBefore: id };
    });
    const view = await render(api);
    for (let index = 1; index < 20; index += 1) await button(view, "Next page");
    expect(api.list).toHaveBeenCalledTimes(20); expect(view.textContent).toContain("reached its page limit");
    expect(view.querySelectorAll('.xr-business-queue__list > li')).toHaveLength(1);
    expect([...view.querySelectorAll("button")].find((item) => item.textContent === "Next page")!.disabled).toBe(true);
  });
  it("refuses an overlarge or malformed page instead of rendering it as complete", async () => {
    const api = makeApi(); api.list.mockResolvedValueOnce({ items: Array.from({ length: 51 }, () => first), nextBefore: null });
    const view = await render(api); expect(view.textContent).toContain("Enquiries unavailable");
    expect(view.textContent).not.toContain(first.reference);
  });
  it("labels its search as page-local and does not send the query or synthesize detail reads", async () => {
    const api = makeApi(); const view = await render(api);
    await act(async () => setSearch(view, "Organization B"));
    expect(view.textContent).toContain("Find on this page"); expect(view.textContent).toContain(second.reference);
    expect(view.textContent).not.toContain(first.reference); expect(api.list).toHaveBeenCalledTimes(1); expect(api.read).not.toHaveBeenCalled();
  });
  it("clears previous detail immediately and ignores a late older successful read", async () => {
    const old = deferred<BusinessInquiryRecord>(); const latest = deferred<BusinessInquiryRecord>(); const api = makeApi();
    api.read.mockImplementationOnce(() => old.promise).mockImplementationOnce(() => latest.promise);
    const view = await render(api); await open(view); const oldSignal = api.read.mock.calls[0][1]!.signal!;
    await open(view, second.reference); expect(oldSignal.aborted).toBe(true);
    await act(async () => latest.resolve({ ...second, enquiry: { ...second.enquiry, context: "Current B detail" } }));
    await act(async () => old.resolve({ ...first, enquiry: { ...first.enquiry, context: "Obsolete A detail" } }));
    expect(view.textContent).toContain("Current B detail"); expect(view.textContent).not.toContain("Obsolete A detail");
  });
  it.each(["unauthenticated", "denied", "stale"] as const)("clears all private data and latches %s until a new actual generation", async (code) => {
    const api = makeApi(); const view = await render(api); await open(view);
    api.read.mockRejectedValueOnce(new BusinessInquiryStaffError(code)); await open(view, second.reference);
    expect(view.textContent).toContain("Private enquiries have been cleared");
    expect(view.textContent).not.toContain(first.reference); expect(view.textContent).not.toContain("Example Contact");
    expect(view.textContent).not.toContain("Audited detail context");
    const replacement = makeApi(); await render(replacement);
    expect(replacement.list).not.toHaveBeenCalled();
    generation = "lifetime-2"; await render(replacement);
    expect(replacement.list).toHaveBeenCalledTimes(1); expect(view.textContent).toContain(first.reference);
  });
  it("latches an observed invalid Root fence across false-to-true and API replacement until a new generation", async () => {
    let live = true;
    const isContextCurrent = (value: string) => live && value === generation;
    const api = makeApi(); const view = await render(api, { isContextCurrent }); await open(view);
    expect(view.textContent).toContain("Audited detail context");
    live = false; await render(api, { isContextCurrent });
    expect(view.textContent).toContain("Private enquiries have been cleared");
    expect(view.textContent).not.toContain(first.reference); expect(view.textContent).not.toContain("Audited detail context");
    live = true; await render(api, { isContextCurrent });
    expect(api.list).toHaveBeenCalledTimes(1); expect(view.textContent).not.toContain(first.reference);
    const replacement = makeApi(); await render(replacement, { isContextCurrent });
    expect(replacement.list).not.toHaveBeenCalled(); expect(view.textContent).not.toContain(first.reference);
    generation = "lifetime-2"; await render(replacement, { isContextCurrent });
    expect(replacement.list).toHaveBeenCalledTimes(1); expect(view.textContent).toContain(first.reference);
  });
  it.each(["unauthenticated", "denied"] as const)("honors older same-binding %s even after a newer detail succeeds", async (code) => {
    const old = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => old.promise);
    const view = await render(api); await open(view); await open(view, second.reference);
    expect(view.textContent).toContain("Audited detail context");
    await act(async () => old.reject(new BusinessInquiryStaffError(code)));
    expect(view.textContent).toContain("Private enquiries have been cleared"); expect(view.textContent).not.toContain("Example Contact");
    expect(view.textContent).not.toContain("Audited detail context");
  });
  it("does not revoke valid newer detail for a stale result caused by local cancellation", async () => {
    const old = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => old.promise);
    const view = await render(api); await open(view); await open(view, second.reference);
    await act(async () => old.reject(new BusinessInquiryStaffError("stale")));
    expect(view.textContent).toContain("Audited detail context"); expect(view.textContent).not.toContain("Private enquiries have been cleared");
  });
  it("lets a user stop a stalled page and explicitly retry without revoking the valid lifetime", async () => {
    const old = deferred<BusinessInquiryPage>(); const api = makeApi(); api.list.mockImplementationOnce(() => old.promise);
    const view = await render(api); const signal = api.list.mock.calls[0][1]!.signal!;
    await button(view, "Cancel page read"); expect(signal.aborted).toBe(true);
    expect(view.textContent).toContain("Page read cancelled"); expect(api.list).toHaveBeenCalledTimes(1);
    await button(view, "Retry page");
    await act(async () => old.reject(new BusinessInquiryStaffError("stale")));
    expect(view.textContent).toContain(first.reference); expect(view.textContent).not.toContain("Private enquiries have been cleared");
  });
  it("lets a user stop a stalled detail and load another without stale cancellation locking the queue", async () => {
    const old = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => old.promise);
    const view = await render(api); await open(view); await button(view, "Cancel detail read");
    expect(view.textContent).toContain("You stopped this detail read");
    await open(view, second.reference); await act(async () => old.reject(new BusinessInquiryStaffError("stale")));
    expect(view.textContent).toContain("Audited detail context"); expect(view.textContent).not.toContain("Private enquiries have been cleared");
  });
  it("a concurrent detail denial clears the queue and prevents a pending list from restoring it", async () => {
    const detail = deferred<BusinessInquiryRecord>(), page = deferred<BusinessInquiryPage>(); const api = makeApi();
    api.read.mockImplementationOnce(() => detail.promise);
    const view = await render(api); await open(view); api.list.mockImplementationOnce(() => page.promise);
    await button(view, "Refresh page"); await act(async () => detail.reject(new BusinessInquiryStaffError("denied")));
    await act(async () => page.resolve({ items: [first, second], nextBefore: null }));
    expect(view.textContent).toContain("Access denied"); expect(view.textContent).not.toContain(first.reference);
  });
  it("replaces the API identity immediately at the same generation and ignores old API refusal", async () => {
    const old = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => old.promise);
    const view = await render(api); await open(view); const signal = api.read.mock.calls[0][1]!.signal!;
    const replacement = makeApi({ items: [second], nextBefore: null }); await render(replacement);
    expect(signal.aborted).toBe(true); expect(view.textContent).not.toContain(first.reference);
    await act(async () => old.reject(new BusinessInquiryStaffError("denied")));
    expect(view.textContent).toContain(second.reference); expect(view.textContent).not.toContain("Access denied");
  });
  it.each(["list", "detail"] as const)("ignores late %s data after the Root context is replaced", async (operation) => {
    const old = deferred<BusinessInquiryPage | BusinessInquiryRecord>(); const api = makeApi();
    if (operation === "list") api.list.mockImplementationOnce(() => old.promise as Promise<BusinessInquiryPage>);
    else api.read.mockImplementationOnce(() => old.promise as Promise<BusinessInquiryRecord>);
    const view = await render(api); if (operation === "detail") await open(view);
    generation = "lifetime-2"; const replacement = makeApi({ items: [second], nextBefore: null }); await render(replacement);
    await act(async () => old.resolve(operation === "list" ? { items: [first], nextBefore: null } : first));
    expect(view.textContent).toContain(second.reference); expect(view.textContent).not.toContain(first.reference);
  });
  it("aborts pending reads on unmount and does not use their late result", async () => {
    const old = deferred<BusinessInquiryRecord>(); const api = makeApi(); api.read.mockImplementationOnce(() => old.promise);
    const view = await render(api); await open(view); const signal = api.read.mock.calls[0][1]!.signal!;
    await act(async () => { root!.unmount(); root = null; }); expect(signal.aborted).toBe(true);
    await act(async () => old.resolve(first)); expect(view.textContent).toBe("");
  });
  it("refuses a mismatched read DTO and renders optional text as text rather than HTML", async () => {
    const api = makeApi(); api.read.mockResolvedValueOnce(second)
      .mockResolvedValueOnce({ ...first, enquiry: { ...first.enquiry, context: '<img src="x" onerror="unsafe()">' } });
    const view = await render(api); await open(view);
    expect(view.textContent).toContain("The enquiry detail could not be loaded");
    await button(view, "Retry detail"); expect(view.textContent).toContain('<img src="x" onerror="unsafe()">');
    expect(view.querySelector("img")).toBeNull();
  });
});
