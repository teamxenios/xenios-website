// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  type EarlyAccessPaymentOptionCode,
  type EarlyAccessPaymentOptionsPresentation,
} from "@shared/research/early-access-payment-options";
import { PaymentMethodSelector } from "./PaymentMethodSelector";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ALL: EarlyAccessPaymentOptionsPresentation = {
  state: "resolved",
  codes: [...EARLY_ACCESS_PAYMENT_OPTION_CODES],
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

function radios(container: HTMLElement): HTMLInputElement[] {
  return Array.from(
    container.querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  );
}

describe("PaymentMethodSelector", () => {
  it("fails closed while unresolved and when a resolved result has no known methods", () => {
    const view = render(
      <PaymentMethodSelector
        presentation={{ state: "unresolved" }}
        selectedCode={null}
        onSelect={() => {}}
      />,
    );
    expect(radios(view.host)).toHaveLength(0);
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
      "being confirmed",
    );

    view.rerender(
      <PaymentMethodSelector
        presentation={{
          state: "resolved",
          codes: ["card", "Apple Pay", { code: "zelle" }],
        }}
        selectedCode={null}
        onSelect={() => {}}
      />,
    );
    expect(radios(view.host)).toHaveLength(0);
    expect(view.host.querySelector('[role="status"]')?.textContent).toContain(
      "No payment methods",
    );
  });

  it("renders the seven exact choices once in canonical order with native radio semantics", () => {
    const view = render(
      <PaymentMethodSelector
        presentation={ALL}
        selectedCode={null}
        onSelect={() => {}}
      />,
    );
    const fieldset = view.host.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toBe(
      "Choose a payment method",
    );
    expect(fieldset?.getAttribute("aria-describedby")).toBe(
      fieldset?.querySelector("p")?.id,
    );

    const inputs = radios(view.host);
    expect(inputs.map((input) => input.value)).toEqual(
      EARLY_ACCESS_PAYMENT_OPTION_CODES,
    );
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
    expect(inputs.every((input) => input.checked === false)).toBe(true);
    expect(inputs.every((input) => input.id.length > 0)).toBe(true);
    expect(new Set(inputs.map((input) => input.id)).size).toBe(inputs.length);
    for (const input of inputs) {
      const label = view.host.querySelector<HTMLLabelElement>(
        `label[for="${input.id}"]`,
      );
      expect(label, input.value).not.toBeNull();
      expect((label?.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
    expect(inputs.map((input) => input.labels?.[0]?.textContent?.trim())).toEqual([
      "Zelle",
      "Venmo",
      "Cash App",
      "PayPal",
      "Apple Cash",
      "ACH / bank transfer / bank wire",
      "Other manual method",
    ]);
  });

  it("requires an affirmative choice and remains controlled", () => {
    const onSelect = vi.fn();
    function Harness() {
      const [selected, setSelected] =
        useState<EarlyAccessPaymentOptionCode | null>(null);
      return (
        <PaymentMethodSelector
          presentation={ALL}
          selectedCode={selected}
          onSelect={(code) => {
            onSelect(code);
            setSelected(code);
          }}
        />
      );
    }
    const view = render(<Harness />);
    expect(radios(view.host).some((input) => input.checked)).toBe(false);
    const paypal = radios(view.host).find((input) => input.value === "paypal")!;
    act(() => paypal.click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("paypal");
    expect(
      radios(view.host).filter((input) => input.checked).map((input) => input.value),
    ).toEqual(["paypal"]);
    expect(
      view.host.querySelector('[data-testid$="-option-paypal"]')?.className,
    ).toContain("ra-select-card-on");
  });

  it("disables every choice without calling the selection handler", () => {
    const onSelect = vi.fn();
    const view = render(
      <PaymentMethodSelector
        presentation={ALL}
        selectedCode={null}
        onSelect={onSelect}
        disabled
      />,
    );
    const first = radios(view.host)[0];
    expect(first.disabled).toBe(true);
    act(() => first.click());
    expect(onSelect).not.toHaveBeenCalled();
    expect(radios(view.host).some((input) => input.checked)).toBe(false);
  });

  it("drops a selected code that disappears without inventing a replacement or callback", () => {
    const onSelect = vi.fn();
    const view = render(
      <PaymentMethodSelector
        presentation={ALL}
        selectedCode="paypal"
        onSelect={onSelect}
      />,
    );
    expect(radios(view.host).find((input) => input.value === "paypal")?.checked).toBe(
      true,
    );
    view.rerender(
      <PaymentMethodSelector
        presentation={{ state: "resolved", codes: ["zelle"] }}
        selectedCode="paypal"
        onSelect={onSelect}
      />,
    );
    expect(radios(view.host).map((input) => input.value)).toEqual(["zelle"]);
    expect(radios(view.host).some((input) => input.checked)).toBe(false);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("ignores duplicates, unknown aliases, and caller-supplied hostile labels", () => {
    const canary = "HOSTILE-LABEL-CANARY";
    const view = render(
      <PaymentMethodSelector
        presentation={{
          state: "resolved",
          codes: [
            "other",
            "zelle",
            "zelle",
            "apple_pay",
            "card",
            { code: "venmo", label: canary, recipient: canary },
            canary,
          ],
        }}
        selectedCode={null}
        onSelect={() => {}}
      />,
    );
    expect(radios(view.host).map((input) => input.value)).toEqual([
      "zelle",
      "other",
    ]);
    expect(view.host.textContent).not.toContain(canary);
    expect(view.host.textContent).not.toContain("Apple Pay");
    expect(view.host.textContent).not.toContain("Google Pay");
    expect(view.host.textContent).not.toContain("Stripe");
  });

  it("is presentation-only and creates no browser, navigation, or payment effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const view = render(
      <PaymentMethodSelector
        presentation={ALL}
        selectedCode={null}
        onSelect={() => {}}
      />,
    );
    act(() => radios(view.host)[0].click());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("img")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\d/);
    expect(view.host.textContent).not.toMatch(
      /account number|routing number|phone number|recipient|destination handle|https?:\/\//i,
    );
  });

  it("reuses the Xenios Research tokens and contains no hard-coded color", () => {
    const source = readFileSync(
      path.join(HERE, "PaymentMethodSelector.tsx"),
      "utf8",
    );
    expect(source).toContain("ra-select-card");
    expect(source).toContain("ra-select-card-on");
    expect(source).toContain("var(--pulse)");
    expect(source).toContain("body-m");
    expect(source).toContain("body-s");
    expect(source).toContain("text-ink-2");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toContain("window.location");
    expect(source).not.toContain("localStorage");
    expect(source).not.toContain("sessionStorage");
  });
});
