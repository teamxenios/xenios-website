// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BusinessInquiryForm, { type BusinessInquiryFormProps } from "./BusinessInquiryForm";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const receipt = { reference: `BE-${"A".repeat(24)}`, receivedAt: "2026-11-18T20:00:00.000Z", state: "needs_human_review", replayed: false };
const json = (value: unknown, status = 201) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let generation: string;
let fetcher: ReturnType<typeof vi.fn>;
const current = (key: string) => generation === key;
beforeEach(() => {
  generation = "generation-1";
  fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => json(receipt));
  vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  host?.remove(); root = null; host = null; vi.unstubAllGlobals();
});
async function render(props: Partial<BusinessInquiryFormProps> = {}) {
  if (!host) { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); }
  await act(async () => root!.render(<BusinessInquiryForm enabled contextGeneration={generation} isContextCurrent={current} {...props} />));
  return host;
}
function control(view: HTMLElement, name: string): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement {
  const found = view.querySelector(`[name="${name}"]`);
  if (!(found instanceof HTMLInputElement || found instanceof HTMLSelectElement || found instanceof HTMLTextAreaElement)) throw new Error(`Missing ${name}`);
  return found;
}
function set(view: HTMLElement, name: string, value: string) {
  const element = control(view, name);
  const prototype = element instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}
async function complete(view: HTMLElement) {
  await act(async () => {
    set(view, "contactName", "Example Contact"); set(view, "contactEmail", "contact@example.test");
    set(view, "organizationName", "Example Laboratory"); set(view, "organizationType", "research");
    set(view, "location", "Austin");
    (view.querySelector('input[name="categories"][value="research"]') as HTMLInputElement).click();
  });
}
async function submit(view: HTMLElement) {
  await act(async () => { view.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })); });
}
async function click(view: HTMLElement, label: string) {
  const button = [...view.querySelectorAll("button")].find((node) => node.textContent === label);
  if (!button) throw new Error(`Missing button ${label}`);
  await act(async () => button.click());
}
function posted(index = 0) { return JSON.parse(fetcher.mock.calls[index][1].body as string); }
function locked(view: HTMLElement) { return view.querySelector("form > fieldset")?.hasAttribute("disabled"); }
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

describe("BusinessInquiryForm private candidate (authored, unrun)", () => {
  it("defaults off, exposes help links, and sends no request", async () => {
    // Passing undefined exercises the default prop rather than an explicit false.
    const view = await render({ enabled: undefined });
    expect(view.querySelector("form")).toBeNull();
    expect(view.textContent).toContain("Online business enquiries are not available");
    expect(view.querySelector('a[href="/research/support"]')).not.toBeNull();
    expect(view.querySelector('a[href="/earlyaccess"]')).not.toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires the Root live context fence before collecting or sending details", async () => {
    const view = await render({ isContextCurrent: () => false });
    expect(view.querySelector("form")).toBeNull(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports accessible invalid-field errors, focuses the summary, and sends nothing", async () => {
    const view = await render(); await submit(view);
    const summary = view.querySelector('[role="alert"]');
    expect(document.activeElement).toBe(summary);
    expect(control(view, "contactName").getAttribute("aria-invalid")).toBe("true");
    const description = control(view, "contactName").getAttribute("aria-describedby");
    expect(description && document.getElementById(description)?.textContent).toContain("Add your name");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("shows a saved reference and focuses its heading only after a parsed committed receipt", async () => {
    const view = await render(); await complete(view); await submit(view);
    expect(view.textContent).toContain("Enquiry received"); expect(view.textContent).toContain(receipt.reference);
    expect(document.activeElement).toBe(view.querySelector("h2"));
    expect(view.querySelector("form")).toBeNull();
    expect(posted()).toMatchObject({ enquiry: { contactName: "Example Contact", categories: ["research"], selections: [] } });
    expect(Object.keys(posted())).toEqual(["attemptKey", "enquiry"]);
    expect(view.textContent).not.toContain("Prepared locally");
  });
  it("does not show early success or dispatch twice while the first submit is pending", async () => {
    const response = deferred<Response>(); fetcher.mockImplementationOnce(() => response.promise);
    const view = await render(); await complete(view); await submit(view); await submit(view);
    expect(fetcher).toHaveBeenCalledTimes(1); expect(locked(view)).toBe(true);
    expect(view.textContent).not.toContain(receipt.reference); expect(view.textContent).not.toContain("Enquiry received");
    await act(async () => response.resolve(json(receipt)));
    expect(view.textContent).toContain(receipt.reference);
  });
  it("captures an exact requested presentation and fractional quantity WITH its selected unit", async () => {
    const view = await render(); await complete(view); await click(view, "Add requested item");
    await act(async () => {
      set(view, "selections.0.description", "Exact requested description"); set(view, "selections.0.variant", "Requested presentation");
      set(view, "selections.0.quantity", "2.5"); set(view, "selections.0.unit", "bottle");
      set(view, "siteCount", "3"); set(view, "context", "Business context only");
      (view.querySelector('input[name="services"][value="sourcing"]') as HTMLInputElement).click();
    });
    await submit(view);
    expect(posted().enquiry.selections).toEqual([{ description: "Exact requested description", variant: "Requested presentation", quantity: 2.5, unit: "bottle" }]);
    expect(posted().enquiry).toMatchObject({ siteCount: 3, services: ["sourcing"], context: "Business context only" });
  });
  it("refuses a missing quantity unit, zero quantity and fractional site count without transport", async () => {
    const view = await render(); await complete(view); await click(view, "Add requested item");
    await act(async () => {
      set(view, "selections.0.description", "Requested item"); set(view, "selections.0.variant", "Requested presentation");
      set(view, "selections.0.quantity", "0"); set(view, "siteCount", "1.5");
    });
    await submit(view);
    expect(control(view, "selections.0.unit").getAttribute("aria-invalid")).toBe("true");
    expect(control(view, "selections.0.quantity").getAttribute("aria-invalid")).toBe("true");
    expect(control(view, "siteCount").getAttribute("aria-invalid")).toBe("true");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it.each([
    new Response("<html>not a receipt</html>", { status: 200, headers: { "Content-Type": "text/html" } }),
    json({ reference: "broken" }, 200),
    json({ error: "not_ready" }, 503),
  ])("locks an uncertain response without claiming saved success", async (response) => {
    fetcher.mockResolvedValueOnce(response);
    const view = await render(); await complete(view); await submit(view);
    expect(view.textContent).toContain("We could not confirm whether your enquiry was saved");
    expect(view.textContent).not.toContain("Enquiry received"); expect(locked(view)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("retries the exact frozen command/key after network uncertainty and does not accept edits", async () => {
    fetcher.mockRejectedValueOnce(new Error("private transport diagnostic"))
      .mockResolvedValueOnce(json({ ...receipt, replayed: true }, 200));
    const view = await render(); await complete(view); await submit(view);
    const original = fetcher.mock.calls[0][1].body;
    await act(async () => set(view, "contactName", "A different person"));
    await click(view, "Retry unchanged enquiry");
    expect(fetcher.mock.calls[1][1].body).toBe(original);
    expect(view.textContent).toContain(receipt.reference); expect(view.textContent).not.toContain("private transport");
  });
  it("does not unlock or mint a new attempt when an ambiguous retry later receives validation rejection", async () => {
    fetcher.mockRejectedValueOnce(new Error("lost response"))
      .mockResolvedValueOnce(json({ error: "invalid_request" }, 400))
      .mockResolvedValueOnce(json({ ...receipt, replayed: true }, 200));
    const view = await render(); await complete(view); await submit(view);
    await click(view, "Retry unchanged enquiry"); expect(locked(view)).toBe(true);
    await click(view, "Retry unchanged enquiry");
    expect(fetcher.mock.calls.map((call) => call[1].body)).toEqual(Array(3).fill(fetcher.mock.calls[0][1].body));
    expect(view.textContent).toContain(receipt.reference);
  });
  it("permits correction after a fresh authoritative validation rejection, sending only on another explicit submit", async () => {
    fetcher.mockResolvedValueOnce(json({ error: "invalid_request" }, 400)).mockResolvedValueOnce(json(receipt));
    const view = await render(); await complete(view); await submit(view);
    expect(locked(view)).toBe(false); expect(fetcher).toHaveBeenCalledTimes(1);
    const firstKey = posted().attemptKey;
    await act(async () => set(view, "location", "Updated business region"));
    expect(fetcher).toHaveBeenCalledTimes(1); await submit(view);
    expect(posted(1).attemptKey).not.toBe(firstKey); expect(posted(1).enquiry.location).toBe("Updated business region");
  });
  it("keeps a conflict locked and retries the same command rather than silently creating another enquiry", async () => {
    fetcher.mockResolvedValueOnce(json({ error: "conflict" }, 409))
      .mockResolvedValueOnce(json({ error: "conflict" }, 409));
    const view = await render(); await complete(view); await submit(view); await click(view, "Retry unchanged enquiry");
    expect(locked(view)).toBe(true); expect(fetcher.mock.calls[1][1].body).toBe(fetcher.mock.calls[0][1].body);
    expect(view.textContent).not.toContain("Enquiry received");
  });
  it("shows a sanitized denial without inventing a saved reference", async () => {
    fetcher.mockResolvedValueOnce(json({ error: "not_permitted" }, 403));
    const view = await render(); await complete(view); await submit(view);
    expect(view.textContent).toContain("This session cannot complete the enquiry");
    expect(view.textContent).not.toContain(receipt.reference); expect(locked(view)).toBe(true);
  });
  it("aborts and rejects a late result when Root switches the context generation", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); await complete(view); await submit(view);
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    generation = "generation-2"; await render();
    expect(signal.aborted).toBe(true); expect(control(view, "contactName").value).toBe("");
    await act(async () => pending.resolve(json(receipt)));
    expect(view.textContent).not.toContain(receipt.reference); expect(control(view, "contactName").value).toBe("");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("aborts on unmount and never renders a late confirmation", async () => {
    const pending = deferred<Response>(); fetcher.mockImplementationOnce(() => pending.promise);
    const view = await render(); await complete(view); await submit(view);
    const signal = fetcher.mock.calls[0][1].signal as AbortSignal;
    await act(async () => { root!.unmount(); root = null; });
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(json(receipt)));
    expect(view.textContent).toBe("");
  });
});
