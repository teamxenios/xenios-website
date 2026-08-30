// @vitest-environment jsdom
// WaitlistForm mounts Turnstile, whose effect resolves getConfig() (a mocked
// fetch) in a microtask outside the synchronous render act(). React needs
// this flag set for act() to recognize that as a supported test environment
// (same shim used by research/persona-states.test.tsx).
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { act } from "react";
import WaitlistForm from "./WaitlistForm";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

// Turnstile always calls getConfig() -> fetch("/api/config") on mount. Stub
// it to resolve immediately with no site key (Turnstile then stays
// invisible, matching "server skips verification" when unconfigured), so the
// tests never make a real network call. The waitlist submit endpoint is
// stubbed per test.
function stubFetch(waitlistHandler?: () => Promise<{ ok: boolean; json: () => Promise<unknown> }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url === "/api/config") {
        return Promise.resolve({ ok: false, json: async () => ({}) } as Response);
      }
      if (waitlistHandler) return waitlistHandler() as Promise<Response>;
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

beforeEach(() => {
  stubFetch();
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
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

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto = el instanceof HTMLSelectElement ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("WaitlistForm error wiring", () => {
  it("on a failed submit, shows one role=alert summary, marks every invalid field, and focuses the first invalid field", () => {
    const view = render(<WaitlistForm />);
    const form = byTestId<HTMLFormElement>(view, "form-waitlist-full");

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const summary = byTestId(view, "text-validation-summary");
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.textContent).toContain("Please enter your name.");
    expect(summary.textContent).toContain("Please enter a valid email address.");
    expect(summary.textContent).toContain("Please choose the role that fits best.");
    expect(summary.textContent).toContain("Please choose how many clients you work with.");

    const nameInput = byTestId<HTMLInputElement>(view, "input-name");
    expect(nameInput.getAttribute("aria-invalid")).toBe("true");
    expect(nameInput.getAttribute("aria-describedby")).toBe("wl-name-error");
    expect(document.getElementById("wl-name-error")?.textContent).toBe("Please enter your name.");

    const emailInput = byTestId<HTMLInputElement>(view, "input-email");
    expect(emailInput.getAttribute("aria-invalid")).toBe("true");
    expect(emailInput.getAttribute("aria-describedby")).toBe("wl-email-error");

    // Name is first in DOM order among the invalid fields, so it gets focus.
    expect(document.activeElement).toBe(nameInput);
  });

  it("focuses the consent checkbox when it is the only remaining invalid field", () => {
    const view = render(<WaitlistForm />);
    const form = byTestId<HTMLFormElement>(view, "form-waitlist-full");

    setValue(byTestId<HTMLInputElement>(view, "input-name"), "Jordan Test");
    setValue(byTestId<HTMLInputElement>(view, "input-email"), "jordan@example.com");
    setValue(byTestId<HTMLSelectElement>(view, "select-role"), "Personal trainers");
    setValue(byTestId<HTMLSelectElement>(view, "select-client-count"), "Just me / under 10");

    act(() => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const nameInput = byTestId<HTMLInputElement>(view, "input-name");
    expect(nameInput.getAttribute("aria-invalid")).toBe("false");
    const consent = byTestId<HTMLInputElement>(view, "checkbox-consent");
    expect(consent.getAttribute("aria-invalid")).toBe("true");
    expect(consent.getAttribute("aria-describedby")).toBe("wl-consent-error");
    const consentLabel = byTestId<HTMLLabelElement>(view, "label-consent");
    expect(consentLabel.htmlFor).toBe("wl-consent");
    expect(consentLabel.className).toContain("min-h-11");
    expect(consentLabel.className).toContain("min-w-11");
    expect(document.activeElement).toBe(consent);
  });

  it("preserves the on-dark consent treatment with the shared native checkbox", () => {
    const view = render(<WaitlistForm onDark />);
    const label = byTestId<HTMLLabelElement>(view, "label-consent");
    const checkbox = byTestId<HTMLInputElement>(view, "checkbox-consent");

    expect(label.className).toContain("text-paper");
    expect(label.className).not.toContain("text-ink-2");
    expect(checkbox.id).toBe("wl-consent");
    expect(checkbox.className).toBe("h-4 w-4 shrink-0 accent-[var(--pulse)]");
  });

  it("clears the validation summary once a valid submit succeeds", async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ success: true, count: 551 }) }));
    const onSuccess = vi.fn();
    const view = render(<WaitlistForm onSuccess={onSuccess} />);
    const form = byTestId<HTMLFormElement>(view, "form-waitlist-full");

    setValue(byTestId<HTMLInputElement>(view, "input-name"), "Jordan Test");
    setValue(byTestId<HTMLInputElement>(view, "input-email"), "jordan@example.com");
    setValue(byTestId<HTMLSelectElement>(view, "select-role"), "Personal trainers");
    setValue(byTestId<HTMLSelectElement>(view, "select-client-count"), "Just me / under 10");
    byTestId<HTMLInputElement>(view, "checkbox-consent").click();

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(view.querySelector('[data-testid="text-validation-summary"]')).toBeNull();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("marks the server-error banner as role=alert when submission fails", async () => {
    stubFetch(async () => ({ ok: false, json: async () => ({ message: "Server rejected it." }) }));
    const view = render(<WaitlistForm />);
    const form = byTestId<HTMLFormElement>(view, "form-waitlist-full");

    setValue(byTestId<HTMLInputElement>(view, "input-name"), "Jordan Test");
    setValue(byTestId<HTMLInputElement>(view, "input-email"), "jordan@example.com");
    setValue(byTestId<HTMLSelectElement>(view, "select-role"), "Personal trainers");
    setValue(byTestId<HTMLSelectElement>(view, "select-client-count"), "Just me / under 10");
    byTestId<HTMLInputElement>(view, "checkbox-consent").click();

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    const banner = byTestId(view, "text-error");
    expect(banner.getAttribute("role")).toBe("alert");
  });
});
