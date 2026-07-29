// @vitest-environment jsdom
// SeoHead is the shared per-page head manager. The `robots` prop is new
// (route/SEO integrity pass): it must render a robots meta tag and, since a
// noindex page should not also endorse a canonical URL, it must skip and
// clean up canonical/hreflang links. Omitting `robots` restores the site
// default (client/index.html's static tag content) rather than removing the
// tag outright: an indexable page shipping with NO robots meta at all would
// silently drop max-image-preview:large sitewide (correction cycle 1 finding).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import SeoHead, { DEFAULT_ROBOTS } from "./SeoHead";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLDivElement | null = null;

function render(el: React.ReactElement) {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root!.render(el));
}

// client/index.html ships a static <meta name="robots"> before React ever
// mounts. jsdom's head starts empty, so any test that cares whether SeoHead
// preserves/restores that static default (rather than just "is not null")
// must seed it explicitly, matching the real document.
function seedStaticRobotsTag() {
  const meta = document.createElement("meta");
  meta.setAttribute("name", "robots");
  meta.setAttribute("content", DEFAULT_ROBOTS);
  document.head.appendChild(meta);
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

describe("DEFAULT_ROBOTS", () => {
  it("matches the literal static <meta name=\"robots\"> in client/index.html", () => {
    const html = readFileSync(resolve(__dirname, "..", "..", "index.html"), "utf8");
    const match = html.match(/<meta name="robots" content="([^"]+)" \/>/);
    expect(match).not.toBeNull();
    expect(DEFAULT_ROBOTS).toBe(match![1]);
  });
});

describe("SeoHead default behavior (no robots prop)", () => {
  it("sets a canonical link and the site default robots content", () => {
    render(<SeoHead title="Product, xenios" description="d" path="/product" />);
    expect(robotsMeta()).toBe(DEFAULT_ROBOTS);
    expect(canonicalHref()).toBe("https://xeniostechnology.com/product");
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(2);
  });

  it("preserves the static robots meta client/index.html ships, without duplicating it", () => {
    seedStaticRobotsTag();
    render(<SeoHead title="Product, xenios" description="d" path="/product" />);

    const metas = document.head.querySelectorAll('meta[name="robots"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe(DEFAULT_ROBOTS);
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

  it("overrides the seeded static default in place, without leaving a duplicate tag", () => {
    seedStaticRobotsTag();
    render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />);

    const metas = document.head.querySelectorAll('meta[name="robots"]');
    expect(metas).toHaveLength(1);
    expect(metas[0].getAttribute("content")).toBe("noindex, nofollow");
  });

  it("restores the site default (not absence) when navigating from noindex to an indexable page", () => {
    seedStaticRobotsTag();
    render(<SeoHead title="xenios admin" description="d" path="/admin" robots="noindex, nofollow" />);
    expect(robotsMeta()).toBe("noindex, nofollow");

    act(() => root!.render(<SeoHead title="Product, xenios" description="d" path="/product" />));

    expect(robotsMeta()).toBe(DEFAULT_ROBOTS);
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
