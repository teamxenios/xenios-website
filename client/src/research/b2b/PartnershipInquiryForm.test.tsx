// @vitest-environment jsdom

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PartnershipInquiryForm from "./PartnershipInquiryForm";
import { PARTNERSHIP_INQUIRY_LIMITS } from "./pathways";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ success: true, autoReplySent: true }) })));
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  Reflect.deleteProperty(navigator, "clipboard");
  vi.unstubAllGlobals();
});

async function renderForm(strict = false): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    const form = <PartnershipInquiryForm initialPathway="research_organization" />;
    root?.render(strict ? <StrictMode>{form}</StrictMode> : form);
  });
  return container;
}

function setControl(view: HTMLElement, id: string, value: string) {
  const element = view.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!element) throw new Error(`Missing #${id}`);
  const prototype =
    element instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : element instanceof HTMLSelectElement
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) throw new Error(`Missing value setter for #${id}`);
  setter.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

async function completeDraft(view: HTMLElement) {
  await act(async () => {
    setControl(view, "b2b-name", "Synthetic Contact");
    setControl(view, "b2b-email", "contact@example.test");
    setControl(view, "b2b-organization", "Example Research Laboratory");
    setControl(view, "b2b-role", "Research operations lead");
    setControl(view, "b2b-website", "https://example.test");
    setControl(view, "b2b-region", "Texas");
    setControl(
      view,
      "b2b-context",
      "We are reviewing documented nonclinical research access, approximate quarterly volume, and lot-specific files.",
    );
  });
}

async function submit(view: HTMLElement) {
  const form = view.querySelector("form");
  if (!form) throw new Error("Missing inquiry form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

describe("PartnershipInquiryForm", () => {
  it("binds a delayed receipt to the submitted details rather than a later unsent draft", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    const submitted = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));

    await act(async () => {
      setControl(view, "b2b-email", "unsent@example.test");
      setControl(view, "b2b-pathway", "supplier_lab_fulfillment");
      setControl(view, "b2b-context", "This different draft has not been submitted and must not be presented as accepted.");
    });
    await act(async () => {
      pending.resolve({ ok: true, json: async () => ({ success: true, autoReplySent: true }) } as Response);
    });

    const receipt = view.querySelector(".xr-b2b-prepared")!;
    expect(receipt.textContent).toContain("Your Research organizations inquiry was accepted for delivery.");
    expect(receipt.textContent).toContain("contact@example.test");
    expect(receipt.textContent).not.toContain("unsent@example.test");
    expect((receipt.querySelector("#b2b-summary") as HTMLTextAreaElement).value).toBe(submitted.message);
    expect((view.querySelector("#b2b-email") as HTMLInputElement).value).toBe("unsent@example.test");
    expect(fetch).toHaveBeenCalledOnce();
  });

  it("copies only the accepted snapshot when the editable draft changed during submission", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    const submitted = JSON.parse(String(vi.mocked(fetch).mock.calls[0]?.[1]?.body));
    await act(async () => setControl(view, "b2b-organization", "Unsent second organization"));
    await act(async () => {
      pending.resolve({ ok: true, json: async () => ({ success: true, autoReplySent: false }) } as Response);
    });

    const copy = view.querySelector(".xr-b2b-prepared button") as HTMLButtonElement;
    await act(async () => copy.click());
    expect(writeText).toHaveBeenCalledExactlyOnceWith(submitted.message);
    expect(writeText.mock.calls[0]?.[0]).not.toContain("Unsent second organization");
    expect(view.textContent).toContain("A confirmation email could not be confirmed");
    expect(view.textContent).not.toContain("A confirmation email was also accepted");
  });

  it("retains a later draft after an uncertain result and binds an explicit retry to its own payload", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    await act(async () => setControl(view, "b2b-email", "later@example.test"));
    await act(async () => pending.reject(new Error("Synthetic connection interrupted")));
    expect(view.querySelector(".xr-b2b-prepared")).toBeNull();
    expect(view.textContent).toContain("Receipt has not been confirmed");
    expect((view.querySelector("#b2b-email") as HTMLInputElement).value).toBe("later@example.test");
    expect((view.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(false);

    await submit(view);
    const retried = JSON.parse(String(vi.mocked(fetch).mock.calls[1]?.[1]?.body));
    expect(retried.email).toBe("later@example.test");
    expect(view.querySelector(".xr-b2b-prepared")?.textContent).toContain("later@example.test");
    expect((view.querySelector("#b2b-summary") as HTMLTextAreaElement).value).toBe(retried.message);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("admits one contact request for duplicate same-render and pending submit events", async () => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    const view = await renderForm();
    await completeDraft(view);
    const form = view.querySelector("form")!;
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await submit(view);
    expect(fetch).toHaveBeenCalledOnce();
    expect((view.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => {
      pending.resolve({ ok: true, json: async () => ({ success: true, autoReplySent: true }) } as Response);
    });
    expect(view.querySelectorAll(".xr-b2b-prepared")).toHaveLength(1);
    expect((view.querySelector('[type="submit"]') as HTMLButtonElement).disabled).toBe(false);
  });

  it.each(["resolve", "reject"] as const)("ignores a late %s after unmount without publishing into a replacement form", async (outcome) => {
    const pending = deferred<Response>();
    vi.mocked(fetch).mockImplementationOnce(() => pending.promise);
    const previous = await renderForm();
    await completeDraft(previous);
    await submit(previous);
    act(() => root?.unmount());
    root = null;
    previous.remove();
    const replacement = await renderForm();
    await completeDraft(replacement);
    await act(async () => setControl(replacement, "b2b-email", "replacement@example.test"));
    await act(async () => {
      if (outcome === "resolve") {
        pending.resolve({ ok: true, json: async () => ({ success: true, autoReplySent: true }) } as Response);
      } else {
        pending.reject(new Error("Synthetic late failure"));
      }
    });
    expect(replacement.querySelector(".xr-b2b-prepared")).toBeNull();
    expect(replacement.querySelector('[role="alert"]')).toBeNull();
    expect((replacement.querySelector("#b2b-email") as HTMLInputElement).value).toBe("replacement@example.test");
    expect(fetch).toHaveBeenCalledOnce();
    await submit(replacement);
    expect(replacement.querySelector(".xr-b2b-prepared")?.textContent).toContain("replacement@example.test");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it.each(["resolve", "reject"] as const)("does not apply an old clipboard %s to a newer submitted receipt", async (outcome) => {
    const pendingCopy = deferred<void>();
    const writeText = vi.fn(async (_value: string): Promise<void> => undefined).mockImplementationOnce(() => pendingCopy.promise);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    const originalSummary = (view.querySelector("#b2b-summary") as HTMLTextAreaElement).value;
    await act(async () => (view.querySelector(".xr-b2b-prepared button") as HTMLButtonElement).click());
    await act(async () => setControl(view, "b2b-email", "new-receipt@example.test"));
    await submit(view);
    expect(view.querySelector(".xr-b2b-prepared")?.textContent).toContain("new-receipt@example.test");
    await act(async () => {
      if (outcome === "resolve") pendingCopy.resolve();
      else pendingCopy.reject(new Error("Synthetic clipboard refusal"));
    });
    expect(writeText).toHaveBeenCalledExactlyOnceWith(originalSummary);
    expect(view.querySelector(".xr-b2b-prepared button")?.textContent).toBe("Copy summary");
    expect(view.textContent).not.toContain("Automatic copy is unavailable");
    await act(async () => (view.querySelector(".xr-b2b-prepared button") as HTMLButtonElement).click());
    expect(writeText.mock.calls[1]?.[0]).toBe((view.querySelector("#b2b-summary") as HTMLTextAreaElement).value);
    expect(view.querySelector(".xr-b2b-prepared button")?.textContent).toBe("Copied");
  });

  it("still submits one truthful receipt after Strict Mode lifecycle restart", async () => {
    const view = await renderForm(true);
    await completeDraft(view);
    await submit(view);
    expect(fetch).toHaveBeenCalledOnce();
    expect(view.querySelector(".xr-b2b-prepared")?.textContent).toContain("contact@example.test");
  });

  it("does not invite duplicate submission when only the courtesy confirmation fails", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, autoReplySent: false }) } as Response);
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    expect(view.textContent).toContain("accepted for delivery");
    expect(view.textContent).toContain("You do not need to resubmit");
    expect(view.textContent).not.toContain("will be sent separately");
  });

  it("preserves the draft and gives no receipt on unavailable delivery", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: false, json: async () => ({ success: false, message: "We could not confirm delivery." }) } as Response);
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("Receipt has not been confirmed");
    expect((view.querySelector('#b2b-email') as HTMLInputElement).value).toBe("contact@example.test");
    expect(view.querySelector('#b2b-summary')).toBeNull();
  });

  it("rejects an unsuccessful response even when HTTP status is successful", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({ ok: true, json: async () => ({ success: false }) } as Response);
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    expect(view.querySelector('[role="alert"]')).not.toBeNull();
    expect(view.querySelector('#b2b-summary')).toBeNull();
  });

  it("submits through the canonical contact endpoint and confirms only after 2xx", async () => {
    const fetchSpy = vi.mocked(fetch);
    const view = await renderForm();

    await completeDraft(view);
    await submit(view);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(fetchSpy).toHaveBeenCalledWith("/api/contact", expect.objectContaining({ method: "POST" }));
    const payload = JSON.parse(String((fetchSpy.mock.calls[0]?.[1] as RequestInit).body));
    expect(payload).toMatchObject({ persona: "enterprise", email: "contact@example.test" });
    expect(payload.website).toBeUndefined();
    expect(payload.message).toContain("Website: https://example.test/");
    expect(view.textContent).toContain("Your Research organizations inquiry was accepted for delivery.");
    expect(view.textContent).toContain("not an account approval");
    expect(view.textContent).toContain("A confirmation email was also accepted for delivery");
    expect(view.textContent).not.toContain("Application received");
    const summary = view.querySelector("#b2b-summary") as HTMLTextAreaElement;
    expect(summary.value).toContain("Synthetic Contact");
    expect(summary.value).toContain("Example Research Laboratory");

  });

  it("does not show success when the endpoint rejects the inquiry", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({ message: "Please try again later." }) })));
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    expect(view.textContent).toContain("Please try again later");
    expect(view.textContent).not.toContain("Inquiry submitted");
  });

  it("copies the locally prepared summary only after an explicit action", async () => {
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = await renderForm();

    await completeDraft(view);
    await submit(view);
    expect(writeText).not.toHaveBeenCalled();

    const copyButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy summary"),
    ) as HTMLButtonElement;
    await act(async () => {
      copyButton.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain("Example Research Laboratory");
    expect(view.textContent).toContain("Copied");
  });

  it("renders an actionable error summary and does not prepare an incomplete request", async () => {
    const view = await renderForm();

    await submit(view);

    const error = view.querySelector(".xr-b2b-form-errors") as HTMLDivElement;
    expect(error?.textContent).toContain("Add your name.");
    expect(error?.textContent).toContain("Add a valid business email.");
    expect(error?.textContent).toContain("Describe the business context in at least 40 characters.");
    expect(document.activeElement).toBe(error);
    expect(error.querySelector('a[href="#b2b-email"]')).not.toBeNull();

    const name = view.querySelector("#b2b-name") as HTMLInputElement;
    const context = view.querySelector("#b2b-context") as HTMLTextAreaElement;
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(name.getAttribute("aria-describedby")).toBe("b2b-name-error");
    expect(view.querySelector("#b2b-name-error")?.textContent).toContain("Add your name.");
    expect(context.getAttribute("aria-describedby")).toBe("b2b-context-help b2b-context-error");
    expect(view.querySelector("#b2b-context-help")).not.toBeNull();
    expect(view.querySelector("#b2b-context-error")).not.toBeNull();
    expect(view.textContent).not.toContain("Inquiry submitted");
  });

  it("requires an optional website to use an explicit HTTP or HTTPS URL", async () => {
    const view = await renderForm();
    await completeDraft(view);
    await act(async () => setControl(view, "b2b-website", "ftp://private.example.test"));

    await submit(view);

    const website = view.querySelector("#b2b-website") as HTMLInputElement;
    expect(website.getAttribute("aria-invalid")).toBe("true");
    expect(view.querySelector("#b2b-website-error")?.textContent).toContain("http:// or https://");
    expect(website.getAttribute("aria-describedby")).toBe("b2b-website-help b2b-website-error");
    expect(view.textContent).not.toContain("Inquiry submitted");
  });

  it("shows a manual-copy fallback when clipboard access is unavailable", async () => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);

    const copyButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy summary"),
    ) as HTMLButtonElement;
    await act(async () => copyButton.click());

    expect(view.querySelector('[role="alert"]')?.textContent).toContain("Automatic copy is unavailable");
  });

  it("shows the same manual-copy fallback when the clipboard rejects the request", async () => {
    const writeText = vi.fn(async (_value: string) => {
      throw new Error("clipboard denied");
    });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);

    const copyButton = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Copy summary"),
    ) as HTMLButtonElement;
    await act(async () => {
      copyButton.click();
      await Promise.resolve();
    });

    expect(writeText).toHaveBeenCalledOnce();
    expect(view.querySelector('[role="alert"]')?.textContent).toContain("Automatic copy is unavailable");
  });

  it("removes a stale prepared state as soon as the draft changes", async () => {
    const view = await renderForm();
    await completeDraft(view);
    await submit(view);
    expect(view.textContent).toContain("Inquiry submitted");

    await act(async () => setControl(view, "b2b-name", "Synthetic Contact Two"));

    expect(view.textContent).not.toContain("Inquiry submitted");
    expect(view.querySelector("#b2b-summary")).toBeNull();
  });

  it("exposes explicit browser-side length bounds for every free-text control", async () => {
    const view = await renderForm();
    const expected = {
      "b2b-name": PARTNERSHIP_INQUIRY_LIMITS.name,
      "b2b-email": PARTNERSHIP_INQUIRY_LIMITS.businessEmail,
      "b2b-organization": PARTNERSHIP_INQUIRY_LIMITS.organization,
      "b2b-role": PARTNERSHIP_INQUIRY_LIMITS.role,
      "b2b-website": PARTNERSHIP_INQUIRY_LIMITS.website,
      "b2b-region": PARTNERSHIP_INQUIRY_LIMITS.region,
      "b2b-context": PARTNERSHIP_INQUIRY_LIMITS.context,
    } as const;

    for (const [id, limit] of Object.entries(expected)) {
      const control = view.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement;
      expect(control.maxLength).toBe(limit);
    }
  });
});
