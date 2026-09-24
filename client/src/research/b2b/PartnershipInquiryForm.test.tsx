// @vitest-environment jsdom

import { act } from "react";
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

async function renderForm(): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(<PartnershipInquiryForm initialPathway="research_organization" />);
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

describe("PartnershipInquiryForm", () => {
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
