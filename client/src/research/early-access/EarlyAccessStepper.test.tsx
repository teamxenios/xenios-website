// @vitest-environment jsdom
import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessStepper } from "./EarlyAccessStepper";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const STEPS = ["Unlock", "Your details", "Quantity", "Review"] as const;

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

function items(container: HTMLElement): HTMLLIElement[] {
  return Array.from(container.querySelectorAll<HTMLLIElement>("ol li"));
}

describe("EarlyAccessStepper", () => {
  it("renders one ordered list in order with a single current step", () => {
    const view = render(<EarlyAccessStepper steps={[...STEPS]} activeIndex={1} />);
    expect(view.host.querySelectorAll("ol")).toHaveLength(1);
    expect(view.host.querySelector("ol")?.getAttribute("aria-label")).toBe(
      "Early access steps",
    );
    expect(items(view.host)).toHaveLength(STEPS.length);
    expect(items(view.host).map((li) => li.textContent)).toEqual([
      "1Unlock",
      "2Your details (you are here)",
      "3Quantity",
      "4Review",
    ]);
    const current = view.host.querySelectorAll('[aria-current="step"]');
    expect(current).toHaveLength(1);
    expect(current[0].textContent).toContain("Your details");
  });

  it("announces the position in words, never by weight or color alone", () => {
    const view = render(<EarlyAccessStepper steps={[...STEPS]} activeIndex={2} />);
    const status = view.host.querySelector('[role="status"]')!;
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Step 3 of 4: Quantity.");
    expect(view.host.querySelector("ol")?.getAttribute("aria-describedby")).toBe(status.id);
    expect(view.host.textContent).toContain("(you are here)");

    view.rerender(<EarlyAccessStepper steps={[...STEPS]} activeIndex={3} />);
    expect(view.host.querySelector('[role="status"]')?.textContent).toBe(
      "Step 4 of 4: Review.",
    );
  });

  it("marks nothing current for an index outside the supplied range", () => {
    const view = render(<EarlyAccessStepper steps={[...STEPS]} activeIndex={-1} />);
    for (const activeIndex of [-1, 4, 99, 1.5, Number.NaN]) {
      view.rerender(<EarlyAccessStepper steps={[...STEPS]} activeIndex={activeIndex} />);
      expect(view.host.querySelectorAll('[aria-current="step"]')).toHaveLength(0);
      expect(view.host.querySelector('[role="status"]')?.textContent).toBe(
        "4 steps in this flow.",
      );
      expect(view.host.textContent).not.toContain("you are here");
    }
  });

  it("renders nothing at all without steps and repeats a duplicate label safely", () => {
    const view = render(<EarlyAccessStepper steps={[]} activeIndex={0} />);
    expect(view.host.innerHTML).toBe("");

    view.rerender(<EarlyAccessStepper steps={["Review", "Review"]} activeIndex={1} />);
    expect(items(view.host)).toHaveLength(2);
    expect(items(view.host)[1].getAttribute("aria-current")).toBe("step");
    expect(items(view.host)[0].getAttribute("aria-current")).toBeNull();
  });

  it("is inert: no control, no link, no money, and no browser effect", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const storageGet = vi.spyOn(Storage.prototype, "getItem");
    const storageSet = vi.spyOn(Storage.prototype, "setItem");
    const historyPush = vi.spyOn(window.history, "pushState");
    const view = render(<EarlyAccessStepper steps={[...STEPS]} activeIndex={0} />);
    expect(view.host.querySelector("button")).toBeNull();
    expect(view.host.querySelector("a")).toBeNull();
    expect(view.host.querySelector("input")).toBeNull();
    expect(view.host.querySelector("form")).toBeNull();
    expect(view.host.querySelector("[href]")).toBeNull();
    expect(view.host.textContent).not.toMatch(/\$\s*\d/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
    expect(storageSet).not.toHaveBeenCalled();
    expect(historyPush).not.toHaveBeenCalled();
  });

  it("reuses the Research tokens and hard-codes no color or side effect", () => {
    const source = readFileSync(path.join(HERE, "EarlyAccessStepper.tsx"), "utf8");
    expect(source).toContain("body-s");
    expect(source).toContain("mono-label");
    expect(source).toContain("text-ink-mute");
    expect(source).toContain("min-w-0");
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(source).not.toMatch(
      /fetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|window\.location|setTimeout|setInterval/i,
    );
  });
});
