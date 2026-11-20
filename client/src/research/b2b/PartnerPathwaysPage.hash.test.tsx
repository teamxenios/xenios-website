// @vitest-environment jsdom

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import PartnerPathwaysPage from "./PartnerPathwaysPage";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;
let previousUrl = "";
let scrolled: { target: Element; options: unknown }[] = [];
const hadOwnScrollIntoView = Object.prototype.hasOwnProperty.call(HTMLElement.prototype, "scrollIntoView");
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

beforeEach(() => {
  previousUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  scrolled = [];
  // jsdom has no scrollIntoView; record which element asked to be scrolled, and how.
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: function (this: Element, options?: unknown) {
      scrolled.push({ target: this, options });
    },
  });
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
  document.title = "";
  window.history.replaceState(null, "", previousUrl);
  if (hadOwnScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      writable: true,
      value: originalScrollIntoView,
    });
  } else {
    delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  }
});

async function renderPage(page: ReactNode): Promise<HTMLDivElement> {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root?.render(page);
    await Promise.resolve();
  });
  return container;
}

describe("partner hub opened at #partnership-inquiry", () => {
  it("scrolls the inquiry section into view and focuses its heading", async () => {
    window.history.replaceState(null, "", "/research/partners#partnership-inquiry");
    const view = await renderPage(<PartnerPathwaysPage />);

    const section = view.querySelector("#partnership-inquiry");
    const heading = view.querySelector<HTMLElement>("#xr-b2b-inquiry-title");
    expect(section).not.toBeNull();
    expect(heading?.tagName).toBe("H2");
    expect(heading?.getAttribute("tabindex")).toBe("-1");
    expect(scrolled).toHaveLength(1);
    expect(scrolled[0].target).toBe(section);
    expect(scrolled[0].options).toEqual({ block: "start" });
    expect(document.activeElement).toBe(heading);
  });

  it("neither scrolls nor moves focus without a hash", async () => {
    window.history.replaceState(null, "", "/research/partners");
    await renderPage(<PartnerPathwaysPage />);

    expect(scrolled).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });

  it("neither scrolls nor moves focus for an unrelated hash", async () => {
    window.history.replaceState(null, "", "/research/partners#partnership-pathways-heading");
    await renderPage(<PartnerPathwaysPage />);

    expect(scrolled).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });
});
