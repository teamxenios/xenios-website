// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  EARLY_ACCESS_QUANTITY_MAX,
  EARLY_ACCESS_QUANTITY_MIN,
  EarlyAccessQuantitySelector,
  isEarlyAccessRequestQuantity,
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

function field(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>('input[type="number"]');
  if (input === null) throw new Error("no quantity input rendered");
  return input;
}

function step(container: HTMLElement, direction: "increment" | "decrement"): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>(`[data-testid$="-${direction}"]`);
  if (button === null) throw new Error(`no ${direction} control rendered`);
  return button;
}

/** Type into the field and commit, which is what a real blur does. */
function type(container: HTMLElement, text: string): void {
  const input = field(container);
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // React's onBlur is delivered from the native FOCUSOUT event, which bubbles.
  // A dispatched "blur" does not bubble and never reaches the handler.
  act(() => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}

describe("EarlyAccessQuantitySelector", () => {
  it("renders one labeled stepper over the round's whole band", () => {
    const view = render(<EarlyAccessQuantitySelector value={null} onChange={() => {}} />);
    const fieldset = view.host.querySelector("fieldset");
    expect(fieldset).not.toBeNull();
    expect(fieldset?.querySelector("legend")?.textContent).toBe("How many units");
    expect(fieldset?.getAttribute("aria-describedby")).toBe(fieldset?.querySelector("p")?.id);

    const input = field(view.host);
    expect(input.getAttribute("min")).toBe(String(EARLY_ACCESS_QUANTITY_MIN));
    expect(input.getAttribute("max")).toBe(String(EARLY_ACCESS_QUANTITY_MAX));
    expect(input.getAttribute("step")).toBe("1");
    expect(input.getAttribute("inputmode")).toBe("numeric");
    expect(input.getAttribute("aria-label")).toBe("Number of research units");
    // Nothing chosen yet reads as empty rather than as a quantity nobody picked.
    expect(input.value).toBe("");

    // Both steppers name what they do, and point at the field they change.
    expect(step(view.host, "decrement").getAttribute("aria-label")).toBe("One fewer unit");
    expect(step(view.host, "increment").getAttribute("aria-label")).toBe("One more unit");
    expect(step(view.host, "increment").getAttribute("aria-controls")).toBe(input.id);

    const note = fieldset?.querySelector("p");
    expect(note?.textContent).toContain("3 units is the Research Bundle, 20% savings");
    expect(note?.textContent).toContain("Direct checkout supports up to 20 units");
    expect(note?.textContent).toContain(`Requests up to ${EARLY_ACCESS_QUANTITY_MAX} route to manual review`);
    expect(note?.textContent).not.toMatch(/\$\s*\d/);
  });

  it("gives the control NO multi-column grid, which is what collapsed the text", () => {
    // THE PRODUCTION DEFECT, still pinned. `sm:grid-cols-3` asks how wide the
    // VIEWPORT is, never how wide the CARD is, so on a 1440px desktop three
    // columns were forced inside a ~300px card and every option wrapped one
    // character per line. A stepper is a fixed-size control at every width,
    // which is why twenty quantities did not bring the wall of chips back.
    // Comments stripped first: the file DESCRIBES the defect it fixed, and a
    // scan that cannot tell prose from code would forbid explaining it.
    const source = readFileSync(path.join(HERE, "EarlyAccessQuantitySelector.tsx"), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
    expect(source).not.toMatch(/grid-cols-\d/);
    expect(source).not.toMatch(/(sm|md|lg|xl|2xl):grid-cols/);

    const view = render(<EarlyAccessQuantitySelector value={null} onChange={() => {}} />);
    const stepper = view.host.querySelector('[data-testid$="-stepper"]');
    expect(stepper?.className).toContain("flex");
    expect(stepper?.className).not.toContain("grid-cols");

    // Every control keeps a real tap target on a phone.
    for (const direction of ["decrement", "increment"] as const) {
      const button = step(view.host, direction);
      expect(Number.parseInt(String(button.style.minWidth), 10)).toBeGreaterThanOrEqual(44);
      expect(Number.parseInt(String(button.style.minHeight), 10)).toBeGreaterThanOrEqual(44);
    }
    expect(Number.parseInt(String(field(view.host).style.minHeight), 10)).toBeGreaterThanOrEqual(
      44,
    );
  });

  it("colors itself from :root tokens, because this route never mounts .research-app", () => {
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
    act(() => step(view.host, "increment").click());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(2);
    expect(typeof onChange.mock.calls[0][0]).toBe("number");
    expect(field(view.host).value).toBe("2");

    type(view.host, "17");
    expect(onChange).toHaveBeenLastCalledWith(17);
    expect(typeof onChange.mock.calls.at(-1)![0]).toBe("number");
    expect(field(view.host).value).toBe("17");
  });

  it("cannot be pushed past the band by the plus control or by typing", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<EarlyAccessQuantity | null>(EARLY_ACCESS_QUANTITY_MAX);
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
    // At the ceiling the plus control is disabled, so it cannot report 51.
    expect(step(view.host, "increment").disabled).toBe(true);
    act(() => step(view.host, "increment").click());
    expect(onChange).not.toHaveBeenCalled();

    // A typed value past the ceiling is clamped, never reported as typed.
    type(view.host, "51");
    expect(onChange).toHaveBeenLastCalledWith(EARLY_ACCESS_QUANTITY_MAX);
    type(view.host, "9999");
    expect(onChange).toHaveBeenLastCalledWith(EARLY_ACCESS_QUANTITY_MAX);
    for (const call of onChange.mock.calls) {
      expect(call[0]).toBeLessThanOrEqual(EARLY_ACCESS_QUANTITY_MAX);
    }
  });

  it("cannot be pushed past a narrower server-projected ceiling", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<EarlyAccessQuantity | null>(20);
      return (
        <EarlyAccessQuantitySelector
          value={value}
          maxQuantity={20}
          onChange={(quantity) => {
            onChange(quantity);
            setValue(quantity);
          }}
        />
      );
    }
    const view = render(<Harness />);
    expect(field(view.host).max).toBe("20");
    expect(step(view.host, "increment").disabled).toBe(true);
    type(view.host, "21");
    expect(onChange).toHaveBeenLastCalledWith(20);
    type(view.host, "50");
    expect(onChange).toHaveBeenLastCalledWith(20);
    expect(view.host.textContent).toContain("This direct cart line supports up to 20 units");
  });

  it("shows no selection when an old cart value exceeds a newly narrower ceiling", () => {
    const view = render(
      <EarlyAccessQuantitySelector value={50} maxQuantity={20} onChange={() => {}} />,
    );
    expect(field(view.host).value).toBe("");
  });

  it("cannot be pushed below one by the minus control or by typing", () => {
    const onChange = vi.fn();
    function Harness() {
      const [value, setValue] = useState<EarlyAccessQuantity | null>(EARLY_ACCESS_QUANTITY_MIN);
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
    expect(step(view.host, "decrement").disabled).toBe(true);
    act(() => step(view.host, "decrement").click());
    expect(onChange).not.toHaveBeenCalled();

    for (const attempt of ["0", "-4", "-1"]) {
      type(view.host, attempt);
      expect(onChange).toHaveBeenLastCalledWith(EARLY_ACCESS_QUANTITY_MIN);
    }
    // A decimal truncates toward a whole number and is never reported as one.
    type(view.host, "2.9");
    expect(onChange).toHaveBeenLastCalledWith(2);
    for (const call of onChange.mock.calls) {
      expect(Number.isInteger(call[0])).toBe(true);
      expect(call[0]).toBeGreaterThanOrEqual(EARLY_ACCESS_QUANTITY_MIN);
    }
  });

  it("shows nothing for a quantity this round does not offer", () => {
    const view = render(<EarlyAccessQuantitySelector value={null} onChange={() => {}} />);
    for (const value of [0, 51, 99, -1, 2.5, "2", null, undefined, Number.NaN]) {
      view.rerender(
        <EarlyAccessQuantitySelector
          value={value as unknown as EarlyAccessQuantity | null}
          onChange={() => {}}
        />,
      );
      expect(field(view.host).value).toBe("");
    }
    expect(EARLY_ACCESS_QUANTITY_MIN).toBe(1);
    expect(EARLY_ACCESS_QUANTITY_MAX).toBe(50);
    expect(isEarlyAccessRequestQuantity(2)).toBe(true);
    expect(isEarlyAccessRequestQuantity(50)).toBe(true);
    expect(isEarlyAccessRequestQuantity("2")).toBe(false);
    expect(isEarlyAccessRequestQuantity(51)).toBe(false);
    expect(isEarlyAccessRequestQuantity(0)).toBe(false);
  });

  it("an emptied field returns to the last good value rather than reporting one", () => {
    const onChange = vi.fn();
    const view = render(<EarlyAccessQuantitySelector value={5} onChange={onChange} />);
    expect(field(view.host).value).toBe("5");
    type(view.host, "");
    expect(onChange).not.toHaveBeenCalled();
    expect(field(view.host).value).toBe("5");
  });

  it("disables every control without calling the handler or dropping the selection", () => {
    const onChange = vi.fn();
    const view = render(
      <EarlyAccessQuantitySelector value={2} onChange={onChange} disabled />,
    );
    expect(field(view.host).disabled).toBe(true);
    expect(step(view.host, "increment").disabled).toBe(true);
    expect(step(view.host, "decrement").disabled).toBe(true);
    expect(field(view.host).value).toBe("2");
    act(() => step(view.host, "increment").click());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("prices nothing and creates no browser, submission, or navigation effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const view = render(<EarlyAccessQuantitySelector value={1} onChange={() => {}} />);
    act(() => step(view.host, "increment").click());
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    // A stepper needs buttons, unlike the radio chips this replaced. What must
    // still hold is that no button can SUBMIT anything: every one is
    // type="button", so none of them is a submit control by default.
    const buttons = Array.from(view.host.querySelectorAll("button"));
    expect(buttons).toHaveLength(2);
    expect(buttons.every((button) => button.getAttribute("type") === "button")).toBe(true);
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

  it("states the band from the shared policy rather than restating numbers", () => {
    // The whole point of this candidate: one place decides the ceiling. A
    // literal 50 in this file would be the third copy of a number that has
    // already drifted once.
    const source = readFileSync(path.join(HERE, "EarlyAccessQuantitySelector.tsx"), "utf8");
    expect(source).toContain("@shared/research/early-access-quantity");
    expect(source).not.toMatch(/=\s*50\b/);
  });
});
