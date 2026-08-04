// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_PAYMENT_OPTION_CODES,
  type EarlyAccessPaymentOptionCode,
} from "@shared/research/early-access-payment-options";
import { PrivateEarlyAccessPage } from "./PrivateEarlyAccessPage";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const READY_ACCESS = Object.freeze({
  configured: true,
  approved: true,
  verified: true,
  enabled: true,
});
const READY_OPTIONS = {
  state: "resolved",
  codes: [...EARLY_ACCESS_PAYMENT_OPTION_CODES],
} as const;

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

function page(overrides: Partial<Parameters<typeof PrivateEarlyAccessPage>[0]> = {}) {
  return (
    <PrivateEarlyAccessPage
      accessState={READY_ACCESS}
      paymentOptions={READY_OPTIONS}
      selectedPaymentMethod={null}
      onPaymentMethodSelect={() => {}}
      {...overrides}
    />
  );
}

function radios(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

describe("PrivateEarlyAccessPage", () => {
  it("renders one main, one focus target, and one labeled payment fieldset in the Xenios shell", () => {
    const view = render(page());
    expect(view.host.querySelectorAll("main")).toHaveLength(1);
    expect(view.host.querySelectorAll("h1")).toHaveLength(1);
    const main = view.host.querySelector("main")!;
    const heading = view.host.querySelector("h1")!;
    expect(main.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(heading.getAttribute("tabindex")).toBe("-1");
    expect(heading.textContent).toBe("Private Early Access");
    expect(main.className).toContain("research-app");
    expect(main.className).toContain("container-x");
    expect(view.host.querySelectorAll("fieldset")).toHaveLength(1);
    expect(view.host.querySelector("legend")?.textContent).toBe("Choose a payment method");
    expect(view.host.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it("shows all seven canonical categories once and explicitly distinguishes Apple Cash from Apple Pay", () => {
    const view = render(page());
    expect(radios(view.host).map((input) => input.value)).toEqual(EARLY_ACCESS_PAYMENT_OPTION_CODES);
    expect(radios(view.host).map((input) => input.labels?.[0]?.textContent?.trim())).toEqual([
      "Zelle",
      "Venmo",
      "Cash App",
      "PayPal",
      "Apple Cash",
      "ACH / bank transfer / bank wire",
      "Other manual method",
    ]);
    expect(view.host.textContent).toContain("Apple Cash is not Apple Pay");
    expect(radios(view.host).some((input) => input.value === "apple_pay")).toBe(false);
    expect(view.host.textContent).not.toContain("Google Pay");
    expect(view.host.textContent).not.toContain("Stripe");
    expect(view.host.textContent).not.toContain("credit card");
  });

  it("renders only a strict resolved canonical subset and normalizes an out-of-scope selection", () => {
    const onSelect = vi.fn();
    const view = render(
      page({
        paymentOptions: { state: "resolved", codes: ["venmo", "apple_cash"] },
        selectedPaymentMethod: "paypal",
        onPaymentMethodSelect: onSelect,
      }),
    );
    expect(radios(view.host).map((input) => input.value)).toEqual(["venmo", "apple_cash"]);
    expect(radios(view.host).every((input) => !input.checked)).toBe(true);
    act(() => radios(view.host)[1].click());
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("apple_cash");
  });

  it("requires configured, approved, verified, and enabled to all be exactly true", () => {
    const view = render(page());
    for (const key of ["configured", "approved", "verified", "enabled"] as const) {
      view.rerender(page({ accessState: { ...READY_ACCESS, [key]: false } }));
      expect(radios(view.host)).toHaveLength(0);
      expect(view.host.querySelector('[data-testid="private-early-access-pending"]')).not.toBeNull();

      const missing = { ...READY_ACCESS } as Record<string, unknown>;
      delete missing[key];
      view.rerender(page({ accessState: missing }));
      expect(radios(view.host)).toHaveLength(0);
    }

    for (const invalid of ["ready", true, null, { ...READY_ACCESS, active: true }]) {
      view.rerender(page({ accessState: invalid }));
      expect(radios(view.host)).toHaveLength(0);
    }
  });

  it("fails closed for unresolved, empty, malformed, reordered, and private-bearing method projections", () => {
    const view = render(page());
    for (const paymentOptions of [
      { state: "unresolved" },
      { state: "resolved", codes: [] },
      { state: "resolved", codes: ["paypal", "zelle"] },
      { state: "resolved", codes: ["zelle", "zelle"] },
      { state: "resolved", codes: ["zelle", "card"] },
      { state: "resolved", codes: ["zelle"], receivingDetails: "private marker" },
    ]) {
      view.rerender(page({ paymentOptions }));
      expect(radios(view.host)).toHaveLength(0);
      expect(view.host.querySelector('[data-testid="private-early-access-pending"]')).not.toBeNull();
      expect(view.host.textContent).toContain("not available yet");
      expect(view.host.textContent).toContain("Nothing has been submitted or paid");
      expect(view.host.textContent).not.toContain("private marker");
    }
  });

  it("does not evaluate hostile access or payment getters and refuses transparent proxies", () => {
    const marker = "HOSTILE-PRIVATE-RECEIVING-CANARY";
    const paymentGetter = vi.fn(() => marker);
    const paymentOptions = { state: "resolved", codes: ["zelle"] } as Record<string, unknown>;
    Object.defineProperty(paymentOptions, "receivingDetails", {
      enumerable: true,
      get: paymentGetter,
    });
    const view = render(page({ paymentOptions }));
    expect(paymentGetter).not.toHaveBeenCalled();
    expect(radios(view.host)).toHaveLength(0);

    const accessGetter = vi.fn(() => true);
    const accessState: Record<string, unknown> = {
      approved: true,
      verified: true,
      enabled: true,
    };
    Object.defineProperty(accessState, "configured", {
      enumerable: true,
      get: accessGetter,
    });
    view.rerender(page({ accessState, paymentOptions: READY_OPTIONS }));
    expect(accessGetter).not.toHaveBeenCalled();
    expect(radios(view.host)).toHaveLength(0);

    view.rerender(page({ accessState: new Proxy({ ...READY_ACCESS }, {}), paymentOptions: READY_OPTIONS }));
    expect(radios(view.host)).toHaveLength(0);
    expect(view.host.textContent).not.toContain(marker);
    expect(view.host.textContent).not.toMatch(
      /account number|routing number|phone number|recipient handle|destination handle|qr code/i,
    );
  });

  it("has no submission, navigation, network, storage, cookie, provider, or payment effect", () => {
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
    const onSelect = vi.fn();
    const view = render(page({ onPaymentMethodSelect: onSelect }));
    act(() => radios(view.host)[0].click());

    expect(onSelect).toHaveBeenCalledWith("zelle");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    expect(sendBeaconSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(historyReplace).not.toHaveBeenCalled();
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.querySelector("[action]")).toBeNull();
    expect(view.host.querySelector("img")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
  });

  it("disables selection without inventing another method or callback", () => {
    const onSelect = vi.fn();
    const view = render(
      page({
        selectedPaymentMethod: "paypal",
        onPaymentMethodSelect: onSelect,
        selectionDisabled: true,
      }),
    );
    expect(radios(view.host).every((input) => input.disabled)).toBe(true);
    expect(radios(view.host).find((input) => input.value === "paypal")?.checked).toBe(true);
    act(() => radios(view.host)[0].click());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("uses the established responsive Xenios visual language and remains unmounted", () => {
    const source = readFileSync(path.join(HERE, "PrivateEarlyAccessPage.tsx"), "utf8");
    const selectorSource = readFileSync(path.join(HERE, "PaymentMethodSelector.tsx"), "utf8");
    expect(source).toContain("PaymentMethodSelector");
    expect(source).toContain("ResearchPendingPanel");
    expect(source).toContain("ResearchSecureNotice");
    expect(source).toContain("research-app");
    expect(source).toContain("container-x");
    expect(source).toContain("ra-pagehead");
    expect(source).toContain("card");
    expect(source).toContain("text-pulse");
    expect(source).toContain("min-w-0");
    expect(source).toContain("w-full");
    expect(selectorSource).toContain("grid-cols-1");
    expect(selectorSource).toContain("sm:grid-cols-2");
    expect(selectorSource).toContain("break-words");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|window\.|document\.cookie|localStorage|sessionStorage/i,
    );

    for (const integrationPath of [
      path.join(HERE, "..", "section.tsx"),
      path.join(HERE, "..", "pages", "Gateway.tsx"),
      path.join(HERE, "..", "..", "App.tsx"),
    ]) {
      expect(readFileSync(integrationPath, "utf8")).not.toContain("PrivateEarlyAccessPage");
    }
  });

  it("never passes an unknown selected value through the controlled boundary", () => {
    const view = render(page({ selectedPaymentMethod: "card" as EarlyAccessPaymentOptionCode }));
    expect(radios(view.host).every((input) => !input.checked)).toBe(true);
    expect(view.host.textContent).not.toContain("card");
  });
});
