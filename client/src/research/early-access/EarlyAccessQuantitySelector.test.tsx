// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_QUANTITIES,
  EarlyAccessQuantitySelector,
  isEarlyAccessQuantity,
  type EarlyAccessQuantity,
} from "./EarlyAccessQuantitySelector";

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

function radios(container: HTMLElement): HTMLInputElement[] {
  return Array.from(container.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
}

describe("EarlyAccessQuantitySelector", () => {
  it("renders one labeled radiogroup with the three offered quantities", () => {
    const view = render(
      <EarlyAccessQuantitySelector value={null} onChange={() => {}} />,
    );
    const fieldset = view.host.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toBe("How many units");
    expect(fieldset?.getAttribute("aria-describedby")).toBe(
      fieldset?.querySelector("p")?.id,
    );

    const inputs = radios(view.host);
    expect(inputs.map((input) => input.value)).toEqual(["1", "2", "3"]);
    expect(new Set(inputs.map((input) => input.name)).size).toBe(1);
    expect(new Set(inputs.map((input) => input.id)).size).toBe(inputs.length);
    expect(inputs.every((input) => !input.checked)).toBe(true);
    // The chip SHOWS the number and ANNOUNCES the full phrase, so a sighted
    // customer reads a chip and a screen-reader user hears "2 research units".
    expect(inputs.map((input) => input.labels?.[0]?.textContent?.trim())).toEqual([
      "11 research unit",
      "22 research units",
      "33 research units",
    ]);
    for (const input of inputs) {
      expect(view.host.querySelector(`label[for="${input.id}"]`), input.value).not.toBeNull();
    }

    // The bundle offer is stated ONCE, full width, in its own line rather than
    // inside a one-third-width option. "20% savings" is the offer's name; this
    // component still computes no money.
    const note = fieldset?.querySelector("p");
    expect(note?.textContent).toContain("3 units is the Research Bundle, 20% savings");
    expect(note?.textContent).not.toMatch(/\$\s*\d/);
  });

  it("gives the options NO nested multi-column grid, which is what collapsed the text", () => {
    // THE PRODUCTION DEFECT, pinned. `sm:grid-cols-3` asks how wide the
    // VIEWPORT is, never how wide the CARD is, so on a 1440px desktop three
    // columns were forced inside a ~300px card and every option wrapped one
    // character per line. The options are a wrapping flex row now, and no
    // viewport-breakpoint column rule may return to this control.
    // Comments stripped first: the file DESCRIBES the defect it fixed, and a
    // scan that cannot tell prose from code would forbid explaining it.
    const source = readFileSync(path.join(HERE, "EarlyAccessQuantitySelector.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/grid-cols-\d/);
    expect(source).not.toMatch(/(sm|md|lg|xl|2xl):grid-cols/);

    const view = render(<EarlyAccessQuantitySelector value={null} onChange={() => {}} />);
    const options = view.host.querySelector('[data-testid$="-options"]');
    expect(options?.className).toContain("flex");
    expect(options?.className).toContain("flex-wrap");
    expect(options?.className).not.toContain("grid-cols");

    // Every chip keeps a real tap target, so the narrow-card layout is not
    // bought back by making the controls too small to press.
    for (const quantity of [1, 2, 3]) {
      const chip = view.host.querySelector<HTMLElement>(
        `[data-testid$="-option-${quantity}"]`,
      );
      expect(Number.parseInt(String(chip?.style.minWidth), 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(String(chip?.style.minHeight), 10)).toBeGreaterThanOrEqual(40);
    }
  });

  it("colors itself from :root tokens, because this route never mounts .research-app", () => {
    // The shared `ra-*` classes resolve their colors from `--ra-*` variables
    // declared on `.research-app`. /research/early-access does not mount
    // inside that wrapper, so those borders come out invalid and invisible.
    // These chips use tokens declared on :root instead.
    const source = readFileSync(path.join(HERE, "EarlyAccessQuantitySelector.tsx"), "utf8");
    expect(source).not.toContain("ra-select-card");
    expect(source).not.toContain("var(--ra-");
    expect(source).toContain("var(--pulse)");
    expect(source).toContain("var(--rule)");
  });

  it("reports a number, not the DOM string, and stays controlled", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<EarlyAccessQuantity | null>(null);
      return (
        <EarlyAccessQuantitySelector
          value={value}
          onChange={(quantity) => {
            onChange(quantity);
            setValue(quantity);
          }}
        />
      );
    }
    const view = render(<Harness />);
    act(() => radios(view.host)[2].click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(3);
    expect(typeof onChange.mock.calls[0][0]).toBe("number");
    expect(radios(view.host).filter((input) => input.checked).map((input) => input.value)).toEqual([
      "3",
    ]);
    expect(
      view.host.querySelector('[data-testid$="-option-3"]')?.getAttribute("data-selected"),
    ).toBe("true");
    expect(
      view.host.querySelector('[data-testid$="-option-1"]')?.getAttribute("data-selected"),
    ).toBe("false");
  });

  it("selects nothing for a quantity this round does not offer", () => {
    const view = render(
      <EarlyAccessQuantitySelector value={null} onChange={() => {}} />,
    );
    for (const value of [0, 4, 99, -1, 2.5, "2", null, undefined, Number.NaN]) {
      view.rerender(
        <EarlyAccessQuantitySelector
          value={value as unknown as EarlyAccessQuantity | null}
          onChange={() => {}}
        />,
      );
      expect(radios(view.host)).toHaveLength(3);
      expect(radios(view.host).some((input) => input.checked)).toBe(false);
    }
    expect(EARLY_ACCESS_QUANTITIES).toEqual([1, 2, 3]);
    expect(isEarlyAccessQuantity(2)).toBe(true);
    expect(isEarlyAccessQuantity("2")).toBe(false);
    expect(isEarlyAccessQuantity(4)).toBe(false);
  });

  it("disables every choice without calling the handler or dropping the selection", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessQuantitySelector value={2} onChange={onChange} disabled />,
    );
    expect(radios(view.host).every((input) => input.disabled)).toBe(true);
    expect(radios(view.host).find((input) => input.value === "2")?.checked).toBe(true);
    act(() => radios(view.host)[0].click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("prices nothing and creates no browser, submission, or navigation effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const view = render(
      <EarlyAccessQuantitySelector value={1} onChange={() => {}} />,
    );
    act(() => radios(view.host)[1].click());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
    expect(view.host.textContent).not.toMatch(
      /account number|routing number|recipient|handle|qr code/i,
    );
  });

  it("hard-codes no color and creates no side effect", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessQuantitySelector.tsx"), "utf8");
    expect(source).toContain("var(--pulse)");
    expect(source).toContain("min-w-0");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|window\.location|setTimeout/i,
    );
  });
});
