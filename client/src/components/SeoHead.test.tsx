// @vitest-environment jsdom
// SeoHead is the shared per-page head manager. The `robots` prop is new
// (route/SEO integrity pass): it must render a robots meta tag and, since a
// noindex page should not also endorse a canonical URL, it must skip and
// clean up canonical/hreflang links. Omitting `robots` must behave exactly
// as before (backward compatible for every other caller).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import SeoHead from "./SeoHead";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(el: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(el));
}

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
  document.head.querySelectorAll('meta[name="robots"], link[rel="canonical"], link[rel="alternate"]').forEach((el) => el.remove());
});

function robotsMeta(): string | null {
  return document.head.querySelector('meta[name="robots"]')?.getAttribute("content") ?? null;
}

function canonicalHref(): string | null {
  return document.head.querySelector('link[rel="canonical"]')?.getAttribute("href") ?? null;
}

describe("SeoHead default behavior (no robots prop)", () => {
  it("sets a canonical link and no robots meta", () => {
    render(<SeoHead title="Product, xenios" description="d" path="/product" />);
    expect(robotsMeta()).toBeNull();
    expect(canonicalHref()).toBe("https://xeniostechnology.com/product");
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(2);
  });
});

describe("SeoHead robots prop", () => {
  it("renders the robots meta content verbatim", () => {
    render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />);
    expect(robotsMeta()).toBe("noindex, nofollow");
  });

  it("neutralizes the canonical and hreflang alternates when noindex", () => {
    render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />);
    expect(canonicalHref()).toBeNull();
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(0);
  });

  it("clears a stale robots meta and restores canonical on navigation to an indexable page", () => {
    render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />);
    expect(robotsMeta()).toBe("noindex, nofollow");

    act(() => root!.render(<SeoHead title="Product, xenios" description="d" path="/product" />));

    expect(robotsMeta()).toBeNull();
    expect(canonicalHref()).toBe("https://xeniostechnology.com/product");
  });

  it("clears a stale canonical when navigating from an indexable page to a noindex one", () => {
    render(<SeoHead title="Product, xenios" description="d" path="/product" />);
    expect(canonicalHref()).toBe("https://xeniostechnology.com/product");

    act(() => root!.render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />));

    expect(canonicalHref()).toBeNull();
    expect(robotsMeta()).toBe("noindex, nofollow");
  });
});
