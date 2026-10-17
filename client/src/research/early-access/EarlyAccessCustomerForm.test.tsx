// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_COUNTRY_CODE,
  EARLY_ACCESS_COUNTRY_LABEL,
  EarlyAccessCustomerForm,
  type EarlyAccessCustomerValues,
} from "./EarlyAccessCustomerForm";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));

const EMPTY: EarlyAccessCustomerValues = {
  fullName: "",
  email: "",
  phone: "",
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
};

const FILLED: EarlyAccessCustomerValues = {
  fullName: "Samuel Boadu",
  email: "member@example.com",
  phone: "713 555 0142",
  line1: "1 Research Way",
  line2: "Suite 4",
  city: "Houston",
  state: "TX",
  postalCode: "77002",
};

const EXPECTED_AUTOCOMPLETE: Record<string, string> = {
  fullName: "name",
  email: "email",
  phone: "tel",
  line1: "address-line1",
  line2: "address-line2",
  city: "address-level2",
  state: "address-level1",
  postalCode: "postal-code",
};

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

function form(overrides: Partial<Parameters<typeof EarlyAccessCustomerForm>[0]> = {}) {
  return (
    <EarlyAccessCustomerForm
      values={EMPTY}
      onChange={() => {}}
      onSubmit={() => {}}
      {...overrides}
    />
  );
}

function inputFor(container: HTMLElement, field: string): HTMLInputElement {
  return container.querySelector<HTMLInputElement>(
    `[data-testid="early-access-customer-form-${field}"]`,
  )!;
}

function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function submitForm(container: HTMLElement): boolean {
  const element = container.querySelector("form")!;
  const event = new Event("submit", { bubbles: true, cancelable: true });
  act(() => {
    element.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

describe("EarlyAccessCustomerForm", () => {
  it("labels every field and carries the right autocomplete hint", () => {
    const view = render(form());
    expect(view.host.querySelectorAll("form")).toHaveLength(1);
    expect(view.host.querySelectorAll("h1")).toHaveLength(0);
    const heading = view.host.querySelector("h2")!;
    expect(view.host.querySelector("form")?.getAttribute("aria-labelledby")).toBe(heading.id);

    const inputs = Array.from(view.host.querySelectorAll<HTMLInputElement>("input"));
    expect(inputs).toHaveLength(9);
    for (const input of inputs) {
      expect(input.id.length, input.id).toBeGreaterThan(0);
      const label = view.host.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
      expect(label, input.id).not.toBeNull();
      expect((label?.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(new Set(inputs.map((input) => input.id)).size).toBe(inputs.length);

    for (const [field, expected] of Object.entries(EXPECTED_AUTOCOMPLETE)) {
      expect(inputFor(view.host, field).getAttribute("autocomplete"), field).toBe(expected);
    }
    expect(inputFor(view.host, "email").type).toBe("email");
    expect(inputFor(view.host, "phone").type).toBe("tel");
    // Only the apartment line is optional, and it says so.
    const optionalLabels = Array.from(view.host.querySelectorAll("label")).filter((label) =>
      (label.textContent ?? "").includes("(optional)"),
    );
    expect(optionalLabels).toHaveLength(1);
    expect(optionalLabels[0].getAttribute("for")).toBe(inputFor(view.host, "line2").id);
  });

  it("stays fully controlled and reports the field that changed", () => {
    const onChange = vi.fn();
    const view = render(form({ values: FILLED, onChange }));
    for (const [field, value] of Object.entries(FILLED)) {
      expect(inputFor(view.host, field).value, field).toBe(value);
    }
    typeInto(inputFor(view.host, "city"), "Austin");
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("city", "Austin");
    // Controlled means the caller owns the value: no prop change, no new value.
    expect(inputFor(view.host, "city").value).toBe("Houston");
  });

  it("renders each caller error as an alert wired to its own field", () => {
    const view = render(
      form({
        errors: {
          email: "Enter an email we can reach you at.",
          postalCode: "That ZIP is not one we ship to yet.",
        },
      }),
    );
    const alerts = Array.from(view.host.querySelectorAll('[role="alert"]'));
    expect(alerts.map((alert) => alert.textContent)).toEqual([
      "Enter an email we can reach you at.",
      "That ZIP is not one we ship to yet.",
    ]);
    const email = inputFor(view.host, "email");
    expect(email.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(email.getAttribute("aria-describedby")!)?.textContent).toBe(
      "Enter an email we can reach you at.",
    );
    // A field the caller did not flag stays unflagged.
    expect(inputFor(view.host, "city").getAttribute("aria-invalid")).toBeNull();
    expect(inputFor(view.host, "city").getAttribute("aria-describedby")).toBeNull();

    // Blank and whitespace-only messages are not errors worth announcing.
    view.rerender(form({ errors: { email: "", phone: "   " } }));
    expect(view.host.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it("hands control back on submit and never lets the browser navigate", () => {
    const onSubmit = vi.fn();
    const view = render(form({ values: FILLED, onSubmit }));
    expect(submitForm(view.host)).toBe(true);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(view.host.querySelector("form")?.getAttribute("action")).toBeNull();
    expect(window.location.search).toBe("");
  });

  it("goes quiet while busy: every field and the submit are disabled", () => {
    const onSubmit = vi.fn();
    const onChange = vi.fn();
    const view = render(form({ values: FILLED, onSubmit, onChange, busy: true }));
    const editable = Array.from(
      view.host.querySelectorAll<HTMLInputElement>("input:not([readonly])"),
    );
    expect(editable).toHaveLength(8);
    expect(editable.every((input) => input.disabled)).toBe(true);
    const button = view.host.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe("Saving...");
    submitForm(view.host);
    act(() => button.click());
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("fixes the country to the United States and keeps it out of the values", () => {
    const view = render(form());
    const country = inputFor(view.host, "country");
    expect(country.readOnly).toBe(true);
    expect(country.value).toBe(EARLY_ACCESS_COUNTRY_LABEL);
    expect(EARLY_ACCESS_COUNTRY_CODE).toBe("US");
    expect(Object.keys(EMPTY)).not.toContain("country");
    expect(
      document.getElementById(country.getAttribute("aria-describedby")!)?.textContent,
    ).toContain("United States only");
  });

  it("shows no money and creates no network, storage, or history effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const historyReplace = vi.spyOn(window.history, "replaceState");
    const view = render(form({ values: FILLED }));
    typeInto(inputFor(view.host, "line1"), "2 Research Way");
    submitForm(view.host);

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(historyReplace).not.toHaveBeenCalled();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.querySelector("img")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
    expect(view.host.textContent).not.toMatch(
      /card number|account number|routing number|security code|cvv/i,
    );
  });

  it("reuses the Checkout field idiom and hard-codes no color", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessCustomerForm.tsx"), "utf8");
    expect(source).toContain("input-field");
    expect(source).toContain("mono-label");
    expect(source).toContain("btn btn-primary");
    expect(source).toContain("grid-cols-1");
    expect(source).toContain("md:grid-cols-[2fr_1fr_1fr]");
    expect(source).toContain("min-w-0");
    expect(source).toContain("var(--error)");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|window\.location|console\.|setTimeout/i,
    );
  });
});
