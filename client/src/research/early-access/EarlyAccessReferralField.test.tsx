// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_REFERRAL_MAX_LENGTH,
  EarlyAccessReferralField,
} from "./EarlyAccessReferralField";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));

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

function field(container: HTMLElement): HTMLInputElement {
  return container.querySelector<HTMLInputElement>("input")!;
}

/** Drives a controlled React input the way a real keystroke or paste does. */
function typeInto(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  act(() => {
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function Harness({ onValue, initial = "" }: { onValue: (value: string) => void; initial?: string }) {
  const [value, setValue] = useState(initial);
  return (
    <EarlyAccessReferralField
      value={value}
      onChange={(next) => {
        onValue(next);
        setValue(next);
      }}
    />
  );
}

describe("EarlyAccessReferralField", () => {
  it("is a single labeled optional text field with a hint", () => {
    const view = render(
      <EarlyAccessReferralField value="" onChange={() => {}} />,
    );
    const input = field(view.host);
    expect(input.type).toBe("text");
    expect(input.maxLength).toBe(EARLY_ACCESS_REFERRAL_MAX_LENGTH);
    expect(input.getAttribute("autocomplete")).toBe("off");
    const label = view.host.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`);
    expect(label).not.toBeNull();
    expect(label?.textContent).toContain("optional");
    const hint = document.getElementById(input.getAttribute("aria-describedby")!);
    expect(hint?.textContent).toContain("Leave this empty");
  });

  it("drops leading whitespace while keeping a space inside a name", () => {
    const seen = vi.fn();
    const view = render(<Harness onValue={seen} />);
    typeInto(field(view.host), "   Jane");
    expect(seen).toHaveBeenLastCalledWith("Jane");
    typeInto(field(view.host), "Jane ");
    expect(seen).toHaveBeenLastCalledWith("Jane ");
    typeInto(field(view.host), "Jane Smith");
    expect(seen).toHaveBeenLastCalledWith("Jane Smith");
    expect(field(view.host).value).toBe("Jane Smith");
  });

  it("caps a long paste at the maximum length", () => {
    const seen = vi.fn();
    const view = render(<Harness onValue={seen} />);
    typeInto(field(view.host), "x".repeat(500));
    const last = seen.mock.calls[seen.mock.calls.length - 1][0] as string;
    expect(last).toHaveLength(EARLY_ACCESS_REFERRAL_MAX_LENGTH);
    expect(field(view.host).value).toHaveLength(EARLY_ACCESS_REFERRAL_MAX_LENGTH);
  });

  it("trims on blur, and only when trimming would change the value", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessReferralField value="XEN-2026  " onChange={onChange} />,
    );
    // React delegates onBlur from the native focusout event.
    act(() => field(view.host).dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("XEN-2026");

    onChange.mockClear();
    view.rerender(<EarlyAccessReferralField value="XEN-2026" onChange={onChange} />);
    // React delegates onBlur from the native focusout event.
    act(() => field(view.host).dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("never auto-submits: Enter is swallowed inside a form", () => {
    const onSubmit = vi.fn();
    const view = render(
      <form onSubmit={onSubmit}>
        <EarlyAccessReferralField value="XEN-2026" onChange={() => {}} />
      </form>,
    );
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      field(view.host).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("disables cleanly and creates no browser, lookup, or navigation effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessReferralField value="XEN-2026" onChange={onChange} disabled />,
    );
    expect(field(view.host).disabled).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
  });

  it("reuses the Research form tokens with no hard-coded color", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessReferralField.tsx"), "utf8");
    expect(source).toContain("input-field");
    expect(source).toContain("mono-label");
    expect(source).toContain("body-s");
    expect(source).toContain("min-w-0");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|window\.location|setTimeout|console\./i,
    );
  });
});
