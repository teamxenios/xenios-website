// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessCompactQuantityControl } from "./EarlyAccessCompactQuantityControl";
import { EARLY_ACCESS_QUANTITIES } from "./EarlyAccessQuantitySelector";

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

function button(container: HTMLElement, which: "decrease" | "increase"): HTMLButtonElement {
  const found = container.querySelector<HTMLButtonElement>(
    `[data-testid='early-access-compact-quantity-${which}']`,
  );
  if (found === null) throw new Error(`no ${which} button`);
  return found;
}

describe("EarlyAccessCompactQuantityControl", () => {
  it("derives its bounds from the ONE offered-quantity authority", () => {
    // The allowed set lives in EarlyAccessQuantitySelector and nowhere else.
    // If that module ever changes the offer, this control follows it without
    // an edit here.
    expect(EARLY_ACCESS_QUANTITIES).toEqual([1, 2, 3]);
    const source = readFileSync(
      path.join(HERE, "EarlyAccessCompactQuantityControl.tsx"),
      "utf8",
    );
    expect(source).toContain('from "./EarlyAccessQuantitySelector"');
    expect(source).toContain("EARLY_ACCESS_QUANTITIES");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|window\.location|setTimeout/i,
    );
  });

  it("steps up and down within the offered set only", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessCompactQuantityControl value={2} onChange={onChange} productLabel="Unit 10 mg" />,
    );
    act(() => button(view.host, "increase").click());
    expect(onChange).toHaveBeenLastCalledWith(3);
    act(() => button(view.host, "decrease").click());
    expect(onChange).toHaveBeenLastCalledWith(1);
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it("cannot go below the minimum: the floor is disabled and silent", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessCompactQuantityControl value={1} onChange={onChange} productLabel="Unit 10 mg" />,
    );
    expect(button(view.host, "decrease").disabled).toBe(true);
    act(() => button(view.host, "decrease").click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("cannot go above the maximum either", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessCompactQuantityControl value={3} onChange={onChange} productLabel="Unit 10 mg" />,
    );
    expect(button(view.host, "increase").disabled).toBe(true);
    act(() => button(view.host, "increase").click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("displays the minimum for a null value, because that is what Add would use", () => {
    const view = render(
      <EarlyAccessCompactQuantityControl value={null} onChange={() => {}} productLabel="Unit" />,
    );
    expect(
      view.host.querySelector("[data-testid='early-access-compact-quantity-value']")?.textContent,
    ).toBe("1");
    expect(button(view.host, "decrease").disabled).toBe(true);
  });

  it("names the bundle offer at three units and computes nothing", () => {
    const view = render(
      <EarlyAccessCompactQuantityControl value={3} onChange={() => {}} productLabel="Unit" />,
    );
    expect(view.host.textContent).toContain("Research Bundle, 20% savings");
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);

    view.rerender(
      <EarlyAccessCompactQuantityControl value={1} onChange={() => {}} productLabel="Unit" />,
    );
    expect(view.host.textContent).not.toContain("Research Bundle");
  });

  it("keeps both steps keyboard-reachable native buttons that name their product", () => {
    const view = render(
      <EarlyAccessCompactQuantityControl
        value={2}
        onChange={() => {}}
        productLabel="BPC-157 5 mg"
      />,
    );
    for (const which of ["decrease", "increase"] as const) {
      const control = button(view.host, which);
      expect(control.tagName).toBe("BUTTON");
      expect(control.type).toBe("button");
      expect(control.getAttribute("tabindex")).toBeNull();
      expect(control.getAttribute("aria-label")).toContain("BPC-157 5 mg");
      act(() => control.focus());
      expect(document.activeElement).toBe(control);
    }
  });
});
