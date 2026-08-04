// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessUnlockForm } from "./EarlyAccessUnlockForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SECRET = "  Correct Horse Battery  ";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function render(node: ReactElement) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return {
    host,
    rerender(next: ReactElement) {
      act(() => root!.render(next));
    },
  };
}

function password(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>('input[type="password"]')!;
}

function submitButton(container: HTMLElement): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

/** Drives the controlled field the way a real keystroke does. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** The exact event Enter produces in a real browser. Returns whether the
 *  component stopped the browser from navigating. */
function submitForm(container: HTMLElement): boolean {
  const form = container.querySelector("form")!;
  const event = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    form.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe("EarlyAccessUnlockForm", () => {
  it("is a real form with one labeled password field and a submit button", () => {
    const view = render(<EarlyAccessUnlockForm onSubmit={() => {}} />);
    expect(view.host.querySelectorAll("form")).toHaveLength(1);
    expect(view.host.querySelectorAll("h1")).toHaveLength(0);
    const heading = view.host.querySelector("h2")!;
    expect(view.host.querySelector("form")?.getAttribute("aria-labelledby")).toBe(heading.id);

    const input = password(view.host);
    expect(input.type).toBe("password");
    expect(input.getAttribute("autocomplete")).toBe("current-password");
    // No name: even a native submission could not serialize the secret into a
    // query string.
    expect(input.getAttribute("name")).toBeNull();
    const label = view.host.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
    expect(label?.textContent?.trim()).toBe("Access password");
    expect(submitButton(view.host).textContent).toBe("Unlock");
  });

  it("submits on Enter with the exact typed secret and never navigates", () => {
    const onSubmit = vi.fn();
    const view = render(<EarlyAccessUnlockForm onSubmit={onSubmit} />);
    typeInto(password(view.host), SECRET);
    const prevented = submitForm(view.host);

    expect(prevented).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    // Never trimmed or normalized: that would change the secret.
    expect(onSubmit).toHaveBeenCalledWith(SECRET);
    expect(window.location.search).toBe("");
    expect(view.host.querySelector("form")?.getAttribute("action")).toBeNull();
    expect(view.host.textContent).not.toContain("Correct Horse Battery");
  });

  it("refuses an empty attempt and refuses to submit twice while busy", () => {
    const onSubmit = vi.fn();
    const view = render(<EarlyAccessUnlockForm onSubmit={onSubmit} />);
    expect(submitButton(view.host).disabled).toBe(true);
    expect(submitForm(view.host)).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();

    typeInto(password(view.host), "opensesame");
    expect(submitButton(view.host).disabled).toBe(false);

    view.rerender(<EarlyAccessUnlockForm onSubmit={onSubmit} busy />);
    expect(submitButton(view.host).disabled).toBe(true);
    expect(submitButton(view.host).textContent).toBe("Checking...");
    expect(password(view.host).disabled).toBe(true);
    submitForm(view.host);
    act(() => submitButton(view.host).click());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the caller's error as an alert wired to the field", () => {
    const view = render(
      <EarlyAccessUnlockForm onSubmit={() => {}} error="That password did not match." />,
    );
    const alert = view.host.querySelector('[role="alert"]')!;
    expect(alert.textContent).toBe("That password did not match.");
    expect(password(view.host).getAttribute("aria-invalid")).toBe("true");
    expect(password(view.host).getAttribute("aria-describedby")).toContain(alert.id);

    // A blank or whitespace-only message is not an error worth announcing.
    for (const error of [null, undefined, "", "   "]) {
      view.rerender(<EarlyAccessUnlockForm onSubmit={() => {}} error={error} />);
      expect(view.host.querySelector('[role="alert"]')).toBeNull();
      expect(password(view.host).getAttribute("aria-invalid")).toBeNull();
    }
  });

  it("states the remaining attempts and closes the gate at zero", () => {
    const onSubmit = vi.fn();
    const view = render(
      <EarlyAccessUnlockForm onSubmit={onSubmit} attemptsRemaining={2} />,
    );
    const status = view.host.querySelector('[role="status"]')!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("2 attempts remain before this invitation locks.");

    view.rerender(<EarlyAccessUnlockForm onSubmit={onSubmit} attemptsRemaining={1} />);
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe(
      "1 attempt remains before this invitation locks.",
    );

    typeInto(password(view.host), "opensesame");
    view.rerender(<EarlyAccessUnlockForm onSubmit={onSubmit} attemptsRemaining={0} />);
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
      "No attempts remain",
    );
    expect(password(view.host).disabled).toBe(true);
    expect(submitButton(view.host).disabled).toBe(true);
    expect(submitForm(view.host)).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("ignores a count it cannot believe rather than locking or opening on it", () => {
    const onSubmit = vi.fn();
    const view = render(<EarlyAccessUnlockForm onSubmit={onSubmit} />);
    typeInto(password(view.host), "opensesame");
    for (const attemptsRemaining of [null, undefined, -1, 1.5, Number.NaN]) {
      view.rerender(
        <EarlyAccessUnlockForm onSubmit={onSubmit} attemptsRemaining={attemptsRemaining} />,
      );
      expect(view.host.querySelector('[role="status"]')).toBeNull();
      expect(password(view.host).disabled).toBe(false);
      expect(submitButton(view.host).disabled).toBe(false);
    }
    expect(submitForm(view.host)).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("creates no network, storage, cookie, or history effect with the secret", () => {
    const fetchSpy = vi.fn();
    const openSpy = vi.fn();
    const sendBeaconSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("open", openSpy);
    Object.defineProperty(window.navigator, "sendBeacon", {
      configurable: true,
      value: sendBeaconSpy,
    });
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const historyReplace = vi.spyOn(window.history, "replaceState");
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    const view = render(<EarlyAccessUnlockForm onSubmit={() => {}} />);
    typeInto(password(view.host), SECRET);
    submitForm(view.host);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(historyReplace).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    expect(document.cookie).toBe("");
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.querySelector("img")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
  });

  it("reuses the Research tokens and the secure notice with no hard-coded color", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessUnlockForm.tsx"), "utf8");
    expect(source).toContain("ResearchSecureNotice");
    expect(source).toContain("input-field");
    expect(source).toContain("btn btn-primary");
    expect(source).toContain("mono-label");
    expect(source).toContain("min-w-0");
    expect(source).toContain("var(--error)");
    expect(source).toContain("event.preventDefault()");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|window\.location|console\.|setTimeout/i,
    );
  });
});
