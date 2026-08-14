// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Route, Router } from "wouter";
import { MEMBER_ROUTES } from "../lib/routes";
import { KrisCatalogSurface } from "./KrisCatalogSurface";
import KrisProductRoute from "./KrisProductRoute";
import {
  KRIS_API_BASE,
  KRIS_CATALOG_PATH,
  krisCatalogHref,
  krisCatalogUrl,
  krisDetailUrl,
  krisItemHref,
} from "./integration-packet";
import {
  krisFixtureFetchCatalog,
  krisFixtureFetchDetail,
} from "./__fixtures__/krisFixtureServer";

/**
 * The deep link, end to end.
 *
 * A card emits an href, a registered route matches that exact href, and the
 * page it lands on has everything it needs from the URL alone. Each of those
 * three can be right on its own while the chain is broken, so they are held to
 * the same strings here and then driven.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("the API paths, which all come from one constant", () => {
  const serverRoutes = readFileSync(
    resolve(
      __dirname,
      "..",
      "..",
      "..",
      "..",
      "server",
      "research",
      "kris-launch-a",
      "routes.ts",
    ),
    "utf8",
  )
    .split(/\r?\n/)
    .join("\n");

  it("builds every request from KRIS_API_BASE", () => {
    expect(krisCatalogUrl()).toBe(KRIS_API_BASE + "/catalog");
    expect(krisCatalogUrl({ q: "bpc", page: 2, pageSize: 48 })).toBe(
      KRIS_API_BASE + "/catalog?q=bpc&page=2&pageSize=48",
    );
    expect(krisDetailUrl("research_capsules", "research-capsules-bam15-bam15-500-mcg")).toBe(
      KRIS_API_BASE + "/products/research-capsules-bam15-bam15-500-mcg",
    );
    expect(krisCatalogUrl().startsWith(KRIS_API_BASE)).toBe(true);
    expect(krisDetailUrl("supplements", "x").startsWith(KRIS_API_BASE)).toBe(true);
  });

  it("matches the mounted server base and detail shape", () => {
    expect(KRIS_API_BASE).toBe("/api/research/kris-launch-a/v1");
    expect(serverRoutes).toContain(
      'export const KRIS_CATALOG_BASE_PATH = "/api/research/kris-launch-a/v1";',
    );
    expect(serverRoutes).toContain(
      "export const KRIS_CATALOG_DETAIL_ROUTE = `${KRIS_CATALOG_BASE_PATH}/products/:slug`;",
    );
  });

  it("encodes the API slug and both browser-route segments", () => {
    expect(krisDetailUrl("supplements", "a b/../admin")).toBe(
      KRIS_API_BASE + "/products/a%20b%2F..%2Fadmin",
    );
    expect(krisItemHref("supplements", "a b/../admin")).toBe(
      KRIS_CATALOG_PATH + "/supplements/a%20b%2F..%2Fadmin",
    );
  });
});

describe("the routed pages", () => {
  // Normalized, because this repository checks out CRLF on Windows.
  const section = readFileSync(resolve(__dirname, "..", "section.tsx"), "utf8")
    .split(/\r?\n/)
    .join("\n");

  it("registers both routes in the manifest and the router", () => {
    expect(MEMBER_ROUTES.krisCatalog).toBe("/research/member/kris-catalog");
    expect(MEMBER_ROUTES.krisCatalogProduct).toBe(
      "/research/member/kris-catalog/:family/:slug",
    );
    expect(KRIS_CATALOG_PATH).toBe(MEMBER_ROUTES.krisCatalog);
    // routes-parity.test.ts reads the raw router source, so the literal has to
    // be present character for character.
    expect(section).toContain('"/research/member/kris-catalog"');
    expect(section).toContain('"/research/member/kris-catalog/:family/:slug"');
  });

  it("keeps both pages behind the member gate and code split", () => {
    for (const route of [
      '<Route path="/research/member/kris-catalog">',
      '<Route path="/research/member/kris-catalog/:family/:slug">',
    ]) {
      const at = section.indexOf(route);
      expect(at).toBeGreaterThan(-1);
      expect(section.slice(at, at + 220)).toContain("<L member component=");
    }
    expect(section).toContain(
      'lazy(\n  () => import("./kris-launch-a/KrisCatalogRoute"),\n)',
    );
    expect(section).toContain(
      'lazy(\n  () => import("./kris-launch-a/KrisProductRoute"),\n)',
    );
  });

  it("matches the item route before the list route", () => {
    // wouter takes the first match. The two segment route has to be registered
    // above the bare one or a deep link would render the list.
    expect(section.indexOf('"/research/member/kris-catalog/:family/:slug"')).toBeLessThan(
      section.indexOf('"/research/member/kris-catalog"'),
    );
  });
});

async function routeAt(href: string) {
  window.history.replaceState(null, "", href);
  const mounted = render(
    <Router>
      <Route path={MEMBER_ROUTES.krisCatalogProduct}>
        {() => <KrisProductRoute fetchDetail={krisFixtureFetchDetail as never} />}
      </Route>
    </Router>,
  );
  await settle();
  return mounted;
}

function detailFingerprint(host: HTMLElement) {
  return {
    url: window.location.pathname,
    name: host.querySelector('[data-testid="kris-detail-name"]')?.textContent,
    price: host.querySelector('[data-testid="kris-price"]')?.textContent,
    priceState: host
      .querySelector('[data-testid="kris-price"]')
      ?.getAttribute("data-state"),
    badge: host.querySelector('[data-testid="kris-access-badge"]')?.textContent,
    notices: Array.from(
      host.querySelectorAll('[data-testid="kris-access-notice"]'),
    ).map((node) => node.textContent),
    note: host.querySelector('[data-testid="kris-supplied-note"]')?.textContent,
    disclosures: Array.from(
      host.querySelectorAll('[data-testid="kris-disclosure"]'),
    ).length,
  };
}

describe("a card link, followed and then reloaded", () => {
  it("goes from the catalog to the item and back with nothing but the URL", async () => {
    window.history.replaceState(null, "", KRIS_CATALOG_PATH + "?families=research_capsules");
    const list = render(
      <KrisCatalogSurface
        memberToken="token"
        fetchCatalog={krisFixtureFetchCatalog as never}
      />,
    );
    await settle();
    const href = list.host
      .querySelector('[data-testid="kris-card-link"]')
      ?.getAttribute("href");
    expect(href).toBeTruthy();
    expect(href?.startsWith(KRIS_CATALOG_PATH + "/research_capsules/")).toBe(true);
    list.unmount();

    // Follow the link the card actually rendered.
    const first = await routeAt(href!);
    expect(
      first.host.querySelector('[data-testid="kris-detail-name"]'),
    ).not.toBeNull();
    const before = detailFingerprint(first.host);
    expect(before.disclosures).toBeGreaterThan(0);
    first.unmount();

    // THE REFRESH: a fresh mount with nothing but the address bar.
    const second = await routeAt(href!);
    expect(detailFingerprint(second.host)).toEqual(before);
    second.unmount();
  });

  it("restores a pasted item link cold, including the pending price", async () => {
    const href = krisItemHref(
      "research_capsules",
      "research-capsules-bam15-bam15-500-mcg",
    );
    const { host, unmount } = await routeAt(href);
    expect(host.querySelector('[data-testid="kris-detail-name"]')?.textContent).toBe(
      "BAM15",
    );
    expect(host.querySelector('[data-testid="kris-price"]')?.textContent).toBe(
      "Price pending",
    );
    // The channel notices the supplied note does not carry survive a cold load.
    expect(host.textContent).toContain("Research use only");
    expect(host.querySelector('[data-testid="kris-supplied-note"]')?.textContent).toBe(
      "Price pending.",
    );
    unmount();
  });

  it("answers an unknown family itself rather than asking the server", async () => {
    const { host, unmount } = await routeAt(
      "/research/member/kris-catalog/not_a_family/whatever",
    );
    expect(host.textContent).toContain("That item is not in this catalog.");
    expect(host.querySelector('[data-testid="kris-detail-skeleton"]')).toBeNull();
    unmount();
  });

  it("answers a slug that is not in the catalog with the honest copy", async () => {
    const { host, unmount } = await routeAt(
      krisItemHref("supplements", "not-a-real-item"),
    );
    expect(host.textContent).toContain("This catalog is not available right now.");
    expect(host.querySelector('[data-testid="kris-detail-retry"]')).not.toBeNull();
    unmount();
  });

  it("keeps the list href and the item href on the same base", () => {
    expect(krisCatalogHref({ q: "bpc", page: 2 })).toBe(
      KRIS_CATALOG_PATH + "?q=bpc&page=2",
    );
    expect(krisItemHref("supplements", "a-b").startsWith(KRIS_CATALOG_PATH)).toBe(
      true,
    );
  });
});
