// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type {
  KrisCatalogPage,
  KrisCatalogQuery,
} from "@shared/research/kris-launch-a/contract";
import type { ApiResult } from "../lib/api";
import { KrisCatalogSurface } from "./KrisCatalogSurface";
import type { getKrisCatalog } from "./catalogApi";
import type { CatalogHistory } from "./useKrisQueryState";
import {
  KRIS_FIXTURE_DEFAULT_PAGE_SIZE,
  krisFixtureFetchCatalog,
} from "./__fixtures__/krisFixtureServer";

/**
 * The catalog list, driven against the real 420 item artifact.
 *
 * The headline check is the one a phone would fail: a page is a page. 420 cards
 * in the first DOM is a surface that stalls on open, and it is the easy mistake
 * to make when the whole catalog is available client side.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

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

/** An in-memory address bar, for the cases that are not about the real one. */
function memoryHistory(initial = ""): CatalogHistory {
  let search = initial;
  const listeners = new Set<() => void>();
  return {
    search: () => search,
    push: (next) => {
      search = next;
      listeners.forEach((listener) => listener());
    },
    replace: (next) => {
      search = next;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function cards(host: HTMLElement): Element[] {
  return Array.from(host.querySelectorAll('[data-testid="kris-card"]'));
}

type FetchCatalog = typeof getKrisCatalog;

async function mount(
  search = "",
  fetchCatalog: FetchCatalog = krisFixtureFetchCatalog,
) {
  const history = memoryHistory(search);
  const mounted = render(
    <KrisCatalogSurface
      memberToken="member-token"
      history={history}
      fetchCatalog={fetchCatalog}
    />,
  );
  await settle();
  return { ...mounted, history };
}

function setValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype =
    element instanceof HTMLInputElement
      ? window.HTMLInputElement.prototype
      : window.HTMLSelectElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  act(() =>
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? "input" : "change", {
        bubbles: true,
      }),
    ),
  );
}

describe("the 420 item catalog is navigable one page at a time", () => {
  it("renders a page of cards and never the whole catalog", async () => {
    const { host, unmount } = await mount();
    expect(cards(host)).toHaveLength(KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    expect(cards(host).length).toBeLessThan(420);
    expect(
      host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    ).toBe("Showing 24 of 420 items");
    expect(
      host.querySelector('[data-testid="kris-page-position"]')?.textContent,
    ).toBe("Page 1 of 18");
    unmount();
  });

  it("reaches the last item by paging, still one page at a time", async () => {
    const { host, unmount } = await mount("?page=18");
    expect(cards(host)).toHaveLength(420 - 17 * KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    expect(
      host.querySelector('[data-testid="kris-page-position"]')?.textContent,
    ).toBe("Page 18 of 18");
    expect(
      host.querySelector<HTMLButtonElement>('[data-testid="kris-next-page"]')
        ?.disabled,
    ).toBe(true);
    unmount();
  });

  it("changes the cards when the page changes, rather than appending them", async () => {
    const { host, unmount } = await mount();
    const first = cards(host).map((card) => card.getAttribute("data-item-id"));
    const next = host.querySelector<HTMLButtonElement>(
      '[data-testid="kris-next-page"]',
    );
    act(() => next?.click());
    await settle();
    const second = cards(host).map((card) => card.getAttribute("data-item-id"));
    expect(second).toHaveLength(KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    expect(second).not.toEqual(first);
    expect(second.filter((id) => first.includes(id))).toEqual([]);
    unmount();
  });

  it("honours the largest page size it offers, and still not 420", async () => {
    const { host, unmount } = await mount("?pageSize=96");
    expect(cards(host)).toHaveLength(96);
    expect(
      host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    ).toBe("Showing 96 of 420 items");
    unmount();
  });

  it("drops a hand-edited page size that would ask for everything", async () => {
    const { host, unmount } = await mount("?pageSize=5000");
    expect(cards(host)).toHaveLength(KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    unmount();
  });

  it("filters by family, by access channel and by search", async () => {
    const { host, unmount } = await mount("?families=supplements");
    expect(
      host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    ).toBe("Showing 20 of 20 items");

    const channel = host.querySelector<HTMLSelectElement>("#kris-channel");
    setValue(channel!, "ruo_research");
    await settle();
    // Supplements are not an RUO channel, so this combination is empty and the
    // surface says so as a FILTER result, not as a broken catalog.
    expect(host.textContent).toContain("Nothing matches these filters.");
    expect(host.textContent).not.toContain("This catalog is not available right now.");

    const clear = host.querySelector<HTMLButtonElement>(
      '[data-testid="kris-clear-filters"]',
    );
    act(() => clear?.click());
    await settle();
    expect(cards(host)).toHaveLength(KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    unmount();
  });

  it("counts the facets it shows in the filter labels", async () => {
    const { host, unmount } = await mount();
    const channel = host.querySelector<HTMLSelectElement>("#kris-channel");
    const options = Array.from(channel?.options ?? []).map(
      (option) => option.textContent,
    );
    expect(options).toContain("Clinical / Provider Only (244)");
    expect(options).toContain("RUO Research (121)");
    unmount();
  });
});

describe("the states a member can land in", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function mountWith(result: ApiResult<KrisCatalogPage>) {
    const fetchCatalog: FetchCatalog = vi.fn(async () => result);
    const mounted = await mount("", fetchCatalog);
    return { ...mounted, fetchCatalog };
  }

  it("shows a loading state before the first answer", async () => {
    let release: () => void = () => undefined;
    const pending = new Promise<ApiResult<KrisCatalogPage>>((resolve) => {
      release = () => resolve({ kind: "unavailable" });
    });
    const fetchCatalog = vi.fn(() => pending);
    const history = memoryHistory("");
    const { host, unmount } = render(
      <KrisCatalogSurface
        memberToken="member-token"
        history={history}
        fetchCatalog={fetchCatalog as FetchCatalog}
      />,
    );
    expect(
      host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    ).toBe("Loading the catalog");
    expect(host.querySelector('[data-testid="kris-skeleton"]')).not.toBeNull();
    release();
    await settle();
    unmount();
  });

  it("separates a catalog that is unavailable from filters that matched nothing", async () => {
    const { host, unmount } = await mountWith({ kind: "unavailable" });
    expect(host.textContent).toContain("This catalog is not available right now.");
    expect(host.textContent).toContain(
      "It is being prepared, and no items are missing from it.",
    );
    // The two states must never be confused: telling a member their filters
    // matched nothing while the catalog is down blames their search.
    expect(host.textContent).not.toContain("Nothing matches these filters.");
    expect(host.querySelector('[data-testid="kris-retry"]')).not.toBeNull();
    unmount();
  });

  it("retries an unavailable catalog on demand", async () => {
    const fetchCatalog = vi
      .fn<FetchCatalog>()
      .mockResolvedValueOnce({ kind: "unavailable" })
      .mockImplementation(() => krisFixtureFetchCatalog(null, {}));
    const { host, unmount } = await mount("", fetchCatalog);
    const retry = host.querySelector<HTMLButtonElement>('[data-testid="kris-retry"]');
    expect(retry).not.toBeNull();
    act(() => retry?.click());
    await settle();
    expect(cards(host)).toHaveLength(KRIS_FIXTURE_DEFAULT_PAGE_SIZE);
    unmount();
  });

  it("asks the member to sign in when the route says authentication is required", async () => {
    const { host, unmount } = await mountWith({
      kind: "unauthorized",
      code: "kris_catalog_auth_required",
    });
    expect(host.textContent).toContain("Please sign in to view this catalog.");
    // Signing in again would not help a restricted member, so there is no retry
    // offered here.
    expect(host.querySelector('[data-testid="kris-retry"]')).toBeNull();
    unmount();
  });

  it("does not tell a restricted member to sign in again", async () => {
    const { host, unmount } = await mountWith({
      kind: "denied",
      code: "kris_catalog_forbidden",
    });
    expect(host.textContent).toContain(
      "This catalog is not open to your account yet.",
    );
    expect(host.textContent).not.toContain("Please sign in");
    unmount();
  });

  it("reads a disabled catalog as unavailable, not as an error", async () => {
    const { host, unmount } = await mountWith({
      kind: "denied",
      code: "kris_catalog_disabled",
    });
    expect(host.textContent).toContain("This catalog is not available right now.");
    unmount();
  });

  it("treats a 200 that is not the contract as an unmounted route", async () => {
    // The SPA catch-all answers the app shell with 200 on a route that is not
    // there. That is not an empty catalog, and it must never render as one.
    const fetchCatalog = vi.fn(async () => ({
      kind: "ok" as const,
      data: { ok: false },
    }));
    const { host, unmount } = await mount(
      "",
      fetchCatalog as unknown as FetchCatalog,
    );
    expect(host.textContent).toContain("This catalog is not available right now.");
    expect(cards(host)).toHaveLength(0);
    unmount();
  });

  it("shows the honest error copy for an invalid request", async () => {
    const { host, unmount } = await mountWith({
      kind: "error",
      code: "kris_catalog_invalid_request",
      message: "nope",
    });
    expect(host.textContent).toContain("The catalog could not be loaded.");
    expect(host.querySelector('[data-testid="kris-retry"]')).not.toBeNull();
    unmount();
  });

  it("never lets a slow first request overwrite a fast later one", async () => {
    const seen: KrisCatalogQuery[] = [];
    const fetchCatalog = vi.fn(async (_token: string | null, query: KrisCatalogQuery) => {
      seen.push(query);
      if (seen.length === 1) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { kind: "unavailable" as const };
      }
      return krisFixtureFetchCatalog(_token, query);
    });
    const { host, unmount } = await mount("", fetchCatalog as never);
    const search = host.querySelector<HTMLInputElement>("#kris-search");
    setValue(search!, "semaglutide");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 40));
    });
    // The stale unavailable answer must not have replaced the fresh results.
    expect(host.textContent).not.toContain("This catalog is not available right now.");
    expect(cards(host).length).toBeGreaterThan(0);
    unmount();
  });
});
