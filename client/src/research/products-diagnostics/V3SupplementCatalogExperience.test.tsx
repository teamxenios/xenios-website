// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { V3SupplementCatalogExperience } from "./V3SupplementCatalogExperience";

const items = [
  { slug: "creatine-monohydrate", displayName: "Creatine Monohydrate" },
  { slug: "omega-3", displayName: "Omega-3" },
] as const;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function mount() {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(<V3SupplementCatalogExperience items={items} />));
  return host;
}

describe("V3 supplement catalog experience", () => {
  it("renders truthful pending profiles without purchase or numeric prices", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("Xenios Research catalog");
    expect(html).toContain("Price not currently available");
    expect(html).toContain("Request sourcing");
    expect(html).not.toMatch(/Add to cart|Buy now|\$\d|In stock|Only \d+ left/);
  });

  it("supports labeled search and a polite result count", () => {
    const view = mount();
    const search = view.querySelector<HTMLInputElement>("#supplement-search")!;
    expect(search.labels?.[0]?.textContent).toContain("Search supplements");
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "omega");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.textContent).toContain("Omega-3");
    expect(view.textContent).not.toContain("Creatine Monohydrate");
    expect(view.querySelector('[role="status"]')?.textContent).toContain("1 profile");
  });

  it("provides a useful empty result and reset action", () => {
    const view = mount();
    const search = view.querySelector<HTMLInputElement>("#supplement-search")!;
    act(() => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set?.call(search, "not-a-match");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(view.textContent).toContain("No supplements match that search.");
    const clear = Array.from(view.querySelectorAll("button")).find((button) =>
      button.textContent?.includes("Clear search"),
    )!;
    act(() => clear.click());
    expect(view.textContent).toContain("2 profiles");
  });

  it("uses reflow-safe cards and keyboard-reachable labeled controls", () => {
    const html = renderToStaticMarkup(
      <V3SupplementCatalogExperience items={items} />,
    );
    expect(html).toContain("md:grid-cols-2");
    expect(html).toContain('style="min-width:0;overflow-wrap:anywhere"');
    expect(html).not.toMatch(/min-width:\s*[4-9]\d\dpx|overflow-x:scroll/);
    const view = mount();
    expect(
      Array.from(view.querySelectorAll("a, button, input")).every(
        (element) =>
          !element.hasAttribute("tabindex") ||
          (element as HTMLElement).tabIndex >= 0,
      ),
    ).toBe(true);
  });
});
