// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import ContactForm from "./ContactForm";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

function render(ui: React.ReactElement): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(ui));
  return container;
}

function byTestId<T extends HTMLElement>(view: HTMLElement, id: string): T {
  const el = view.querySelector(`[data-testid="${id}"]`);
  if (!el) throw new Error(`missing [data-testid="${id}"]`);
  return el as T;
}

function setValue(el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement
      ? window.HTMLSelectElement.prototype
      : el instanceof HTMLTextAreaElement
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("ContactForm error wiring", () => {
  it("on a failed submit, shows one role=alert summary, marks invalid fields, and focuses the first invalid field", () => {
    const view = render(<ContactForm />);
    const form = byTestId<HTMLFormElement>(view, "form-contact");

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const summary = byTestId(view, "text-contact-validation-summary");
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.textContent).toContain("Please tell us who you are.");
    expect(summary.textContent).toContain("Message must be at least 20 characters.");

    const personaSelect = byTestId<HTMLSelectElement>(view, "select-contact-persona");
    expect(personaSelect.getAttribute("aria-invalid")).toBe("true");
    expect(personaSelect.getAttribute("aria-describedby")).toBe("cf-persona-error");
    expect(document.getElementById("cf-persona-error")?.textContent).toBe("Please tell us who you are.");

    const messageField = byTestId<HTMLTextAreaElement>(view, "textarea-contact-message");
    expect(messageField.getAttribute("aria-invalid")).toBe("true");
    expect(messageField.getAttribute("aria-describedby")).toBe("cf-message-error");

    // Persona is first in DOM order among the invalid fields, so it gets focus.
    expect(document.activeElement).toBe(personaSelect);
  });

  it("moves focus to the message field when persona is valid but the message is still too short", () => {
    const view = render(<ContactForm />);
    const form = byTestId<HTMLFormElement>(view, "form-contact");
    const personaSelect = byTestId<HTMLSelectElement>(view, "select-contact-persona");
    setValue(personaSelect, "investor");

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(personaSelect.getAttribute("aria-invalid")).toBe("false");
    const messageField = byTestId<HTMLTextAreaElement>(view, "textarea-contact-message");
    expect(messageField.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(messageField);
  });

  it("clears the validation summary and per-field errors once a valid submit succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );
    const view = render(<ContactForm />);
    const form = byTestId<HTMLFormElement>(view, "form-contact");
    setValue(byTestId<HTMLSelectElement>(view, "select-contact-persona"), "investor");
    setValue(
      byTestId<HTMLTextAreaElement>(view, "textarea-contact-message"),
      "This message is definitely at least twenty characters long.",
    );

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(view.querySelector('[data-testid="text-contact-validation-summary"]')).toBeNull();
    expect(view.querySelector('[data-testid="contact-success"]')).not.toBeNull();
  });

  it("marks the server-error banner as role=alert when submission fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: async () => ({ message: "Server rejected it." }),
      }),
    );
    const view = render(<ContactForm />);
    const form = byTestId<HTMLFormElement>(view, "form-contact");
    setValue(byTestId<HTMLSelectElement>(view, "select-contact-persona"), "investor");
    setValue(
      byTestId<HTMLTextAreaElement>(view, "textarea-contact-message"),
      "This message is definitely at least twenty characters long.",
    );

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const banner = byTestId(view, "text-contact-error");
    expect(banner.getAttribute("role")).toBe("alert");
  });
});

describe("ContactForm Health sender context", () => {
  async function submitValidForm(view: HTMLElement) {
    const form = byTestId<HTMLFormElement>(view, "form-contact");
    setValue(byTestId<HTMLSelectElement>(view, "select-contact-persona"), "other");
    setValue(
      byTestId<HTMLTextAreaElement>(view, "textarea-contact-message"),
      "I need help navigating the nonclinical Xenios Care support pathway.",
    );
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
  }

  it("uses the dedicated Care contact endpoint for the exact Health context", async () => {
    window.history.replaceState({}, "", "/contact?context=health");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<ContactForm />);
    await submitValidForm(view);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/care/contact",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it.each([
    "",
    "?context=care",
    "?context=Health",
    "?Context=health",
    "?context=health&source=care",
    "?context=health&context=research",
  ])("keeps near-match context %s on the generic contact endpoint", async (search) => {
    window.history.replaceState({}, "", `/contact${search}`);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const view = render(<ContactForm />);
    await submitValidForm(view);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/contact",
      expect.objectContaining({ method: "POST" }),
    );
  });
});
