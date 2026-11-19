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
import { EARLY_ACCESS_SOCIAL_IDENTITY, HOME_SOCIAL_IDENTITY } from "../../../shared/research/social-metadata";
import { HOME_SEO } from "../home/content";

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
  document.head.querySelectorAll('meta[property^="og:"],meta[name^="twitter:"],meta[name="description"],script[type="application/ld+json"]').forEach((el) => el.remove());
  document.head.querySelectorAll('[data-private-metadata-fixture]').forEach(el => el.remove());
});

describe("private application metadata opt-out", () => {
  const publicTags = 'meta[property^="og:" i],meta[name^="og:" i],meta[property^="twitter:" i],meta[name^="twitter:" i],script[type="application/ld+json" i],script[data-jsonld],link[rel~="canonical" i],link[rel~="alternate" i][hreflang]';
  const privateProps = { title: "Private workspace, xenios", description: "Sign in to use your private workspace.", path: "/private-workspace?reference=must-not-be-published#private-fragment" };
  function seed(tag: "meta" | "link" | "script", attrs: Record<string, string>) {
    const node = document.createElement(tag);
    node.setAttribute("data-private-metadata-fixture", "");
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    document.head.appendChild(node); return node;
  }

  it("cleans every inherited public copy and unrelated schema, preserves app assets, then restores homepage metadata", () => {
    seedStaticRobotsTag();
    const icon = seed("link", { rel: "icon", href: "/favicon.ico" });
    const manifest = seed("link", { rel: "manifest", href: "/site.webmanifest" });
    render(<SeoHead {...HOME_SEO} />);
    expect(document.head.querySelectorAll(publicTags).length).toBeGreaterThan(0);
    seed("meta", { property: "og:title", content: "duplicate public title" });
    seed("meta", { name: "OG:custom", content: "legacy public authority" });
    seed("meta", { property: "TWITTER:label1", content: "legacy public card" });
    seed("meta", { name: "twitter:creator", content: "duplicate social identity" });
    seed("meta", { name: "robots", content: "index,follow" });
    seed("meta", { name: "description", content: "stale public description" });
    seed("link", { rel: "canonical", href: "https://fixture.example.invalid/stale" });
    seed("link", { rel: "alternate", hreflang: "fr", href: "https://fixture.example.invalid/fr" });
    seed("link", { rel: "alternate", hreflang: "de", href: "https://fixture.example.invalid/de" });
    seed("script", { type: "application/ld+json" }).textContent = JSON.stringify({ "@type": "FAQPage", name: "stale unrelated schema" });

    act(() => root!.render(<SeoHead {...privateProps} publicMetadata={false} />));
    expect(document.title).toBe(privateProps.title);
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(privateProps.description);
    expect(robotsMeta()).toBe("noindex,nofollow,noarchive");
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelectorAll(publicTags)).toHaveLength(0);
    expect(document.head.innerHTML).not.toMatch(/must-not-be-published|private-fragment|stale public|legacy public|duplicate public|duplicate social|stale unrelated/);
    expect(icon.isConnected).toBe(true); expect(icon.getAttribute("href")).toBe("/favicon.ico");
    expect(manifest.isConnected).toBe(true); expect(manifest.getAttribute("href")).toBe("/site.webmanifest");

    act(() => root!.render(<SeoHead {...HOME_SEO} />));
    expect(document.title).toBe(HOME_SOCIAL_IDENTITY.title);
    expect(robotsMeta()).toBe(DEFAULT_ROBOTS); expect(canonicalHref()).toBe(HOME_SOCIAL_IDENTITY.url);
    expect(document.head.querySelector('meta[property="og:title"]')?.getAttribute("content")).toBe(HOME_SOCIAL_IDENTITY.title);
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(HOME_SOCIAL_IDENTITY.image);
    expect(document.head.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(HOME_SOCIAL_IDENTITY.image);
    expect(document.head.querySelectorAll('meta[property^="og:"]')).toHaveLength(10);
    expect(document.head.querySelectorAll('meta[name^="twitter:"]')).toHaveLength(6);
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(2);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="alternate"][hreflang]')).toHaveLength(2);
    expect(document.head.querySelectorAll('link[hreflang="fr"],link[hreflang="de"]')).toHaveLength(0);
    expect(icon.isConnected).toBe(true); expect(manifest.isConnected).toBe(true);
  });

  it.each([undefined, "index,follow", "noindex, nofollow", "none"])("forces private robots independent of supplied directive %s", robots => {
    render(<SeoHead {...privateProps} robots={robots} publicMetadata={false} />);
    expect(document.title).toBe(privateProps.title);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(privateProps.description);
    expect(robotsMeta()).toBe("noindex,nofollow,noarchive");
    expect(document.head.querySelectorAll(publicTags)).toHaveLength(0);
  });

  it("responds to the prop alone on the same route and restores the unchanged Early Access share identity", () => {
    const props = { title: "Generic entry", description: "Generic entry description.", path: "/earlyaccess?reference=private-source" };
    render(<SeoHead {...props} />);
    expect(document.title).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.title);
    act(() => root!.render(<SeoHead {...props} publicMetadata={false} />));
    expect(document.title).toBe(props.title);
    expect(document.head.querySelector('meta[name="description"]')?.getAttribute("content")).toBe(props.description);
    expect(document.head.querySelectorAll(publicTags)).toHaveLength(0);
    act(() => root!.render(<SeoHead {...props} publicMetadata />));
    expect(document.title).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.title);
    expect(document.head.querySelector('meta[property="og:url"]')?.getAttribute("content")).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.url);
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.image);
    expect(document.head.querySelector('meta[name="twitter:image"]')?.getAttribute("content")).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.image);
    expect(robotsMeta()).toBe("noindex,nofollow,noarchive"); expect(canonicalHref()).toBeNull();
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(0);
    expect(document.head.innerHTML).not.toContain("private-source");
  });
});

describe("constant homepage and private Early Access share identities", () => {
  const content = (selector: string) => document.head.querySelector(selector)?.getAttribute("content");
  it("replaces inherited home authority with the constant private entry and removes all schema", () => {
    render(<SeoHead {...HOME_SEO} />);
    expect(document.title).toBe(HOME_SOCIAL_IDENTITY.title);
    const stale = document.createElement("script");
    stale.type = "application/ld+json";
    stale.textContent = JSON.stringify({ "@type": "FAQPage", private: "old schema" });
    document.head.appendChild(stale);
    act(() => root!.render(<SeoHead title="private-customer" description="private-selection" path="/earlyaccess?token=secret-token&ref=private-referral#customer-name" />));
    expect(document.title).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.title);
    expect(content('meta[name="description"]')).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.description);
    expect(content('meta[property="og:url"]')).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.url);
    expect(content('meta[property="og:image"]')).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.image);
    expect(content('meta[name="twitter:image"]')).toBe(EARLY_ACCESS_SOCIAL_IDENTITY.image);
    expect(robotsMeta()).toBe("noindex,nofollow,noarchive");
    expect(canonicalHref()).toBeNull();
    expect(document.head.querySelectorAll('link[rel="alternate"],script[type="application/ld+json"]')).toHaveLength(0);
    for (const value of ["secret-token", "private-customer", "private-selection", "private-referral", "customer-name", "old schema"]) expect(document.head.innerHTML).not.toContain(value);
  });

  it("restores the distinct homepage identity after private entry without stale tags", () => {
    render(<SeoHead title="private" description="private" path="/earlyaccess/?category=supplements" />);
    act(() => root!.render(<SeoHead {...HOME_SEO} path="/?utm_source=private-campaign" />));
    expect(document.title).toBe(HOME_SOCIAL_IDENTITY.title);
    expect(content('meta[property="og:url"]')).toBe(HOME_SOCIAL_IDENTITY.url);
    expect(content('meta[property="og:image"]')).toBe(HOME_SOCIAL_IDENTITY.image);
    expect(content('meta[name="twitter:image:alt"]')).toBe(HOME_SOCIAL_IDENTITY.imageAlt);
    expect(content('meta[property="og:image:width"]')).toBe("1200");
    expect(content('meta[property="og:image:height"]')).toBe("630");
    expect(content('meta[property="og:image:type"]')).toBe("image/png");
    expect(canonicalHref()).toBe(HOME_SOCIAL_IDENTITY.url);
    expect(robotsMeta()).toBe(DEFAULT_ROBOTS);
    expect(document.head.innerHTML).not.toContain("private-campaign");
    expect(document.head.querySelectorAll('script[type="application/ld+json"]')).toHaveLength(2);
    for (const selector of ['meta[property="og:url"]','meta[property="og:image"]','meta[name="twitter:image"]']) expect(document.head.querySelectorAll(selector)).toHaveLength(1);
  });
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

  it("keeps canonical authority for an explicit index directive, including the real homepage props", () => {
    render(<SeoHead {...HOME_SEO} />);
    expect(robotsMeta()).toBe(HOME_SEO.robots);
    expect(canonicalHref()).toBe(HOME_SOCIAL_IDENTITY.url);
    expect(document.head.querySelectorAll('link[rel="alternate"]')).toHaveLength(2);
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
