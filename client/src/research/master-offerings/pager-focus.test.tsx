// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  MasterOfferingCatalogListResponse,
  MasterOfferingCatalogPage,
  MasterOfferingCatalogQuery,
} from "@shared/research/master-offerings/contract";
import type { ApiResult } from "../lib/api";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";
import type { CatalogHistory } from "./useCatalogQueryState";
import { card, click, page, render, type } from "./catalog-test-fixtures";

/**
 * Pager focus belongs to the request the member made with the pager.
 *
 * Moving focus to Results after Previous or Next keeps a keyboard or
 * screen-reader user from being left at the bottom of the old page. But the
 * page loads asynchronously, and the member can move on before it arrives. On
 * a phone, moving focus out of Search also closes the keyboard mid-word.
 *
 * KAN-31/10703 found the case: Previous from page 2, then Search, and the
 * filtered result also lands on page 1. Focus followed the page number, so it
 * jumped from Search to Results. These tests hold each response back and
 * release it on purpose, through the real surface, query state and debounce.
 */

function memoryHistory(initial: string): CatalogHistory & {
  entries: string[];
  go(search: string): void;
  back(): void;
  forward(): void;
} {
  const entries = [initial];
  let index = 0;
  const listeners = new Set<() => void>();
  // Back and forward change the address bar, and React hears it from
  // popstate, not from any control on the page.
  const popstate = () =>
    act(() => {
      for (const listener of listeners) listener();
    });
  return {
    entries,
    search: () => entries[index] ?? "",
    push: (search) => {
      entries.splice(index + 1);
      entries.push(search);
      index = entries.length - 1;
    },
    replace: (search) => {
      entries[index] = search;
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** Arrive, by traversal, at an entry whose address is `search`. */
    go: (search) => {
      entries.splice(index + 1);
      entries.push(search);
      index = entries.length - 1;
      popstate();
    },
    back: () => {
      index -= 1;
      popstate();
    },
    forward: () => {
      index += 1;
      popstate();
    },
  };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function ok(catalog: MasterOfferingCatalogPage): ApiResult<MasterOfferingCatalogListResponse> {
  return { kind: "ok", data: { ok: true, audience: "member", launchScope: "all_members", catalog } };
}

/** A catalog whose every response waits until the test releases it. */
function heldCatalog() {
  const calls: Array<{
    query: MasterOfferingCatalogQuery;
    release(catalog: MasterOfferingCatalogPage): Promise<void>;
  }> = [];
  const fetchCatalog = vi.fn(
    (_token: string | null, query: MasterOfferingCatalogQuery) =>
      new Promise<ApiResult<MasterOfferingCatalogListResponse>>((resolve) => {
        calls.push({
          query,
          release: async (catalog) => {
            resolve(ok(catalog));
            await settle();
          },
        });
      }),
  );
  return { calls, fetchCatalog };
}

const unfiltered = (at: number) =>
  page({ page: at, totalPages: 3, total: 60, products: [card({ id: `mo_unfiltered_${at}` })] });
const filtered = page({ page: 1, totalPages: 1, total: 7, products: [card({ id: "mo_filtered_1" })] });

// A root left mounted after a failed assertion would poison every later
// render in this file, so every mount is unmounted in afterEach.
const mounted: Array<() => void> = [];

async function mountOnPageTwo(initial = "?page=2") {
  const history = memoryHistory(initial);
  const held = heldCatalog();
  const view = render(
    <MasterOfferingCatalogSurface
      memberToken="token"
      history={history}
      fetchCatalog={held.fetchCatalog as never}
    />,
  );
  mounted.push(view.unmount);
  await settle();
  expect(held.calls).toHaveLength(1);
  await held.calls[0].release(unfiltered(2));
  const host = view.host;
  const search = host.querySelector<HTMLInputElement>("#mo-catalog-search")!;
  const previous = () =>
    host.querySelector<HTMLButtonElement>('[data-testid="mo-toolbar-pager"] button:first-of-type')!;
  const count = () => host.querySelector('[data-testid="mo-result-count"]')?.textContent;
  expect(count()).toBe("Showing 1 of 60 offerings");
  return { ...view, ...held, history, search, previous, count };
}

describe("pager focus follows the pager's own request", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    while (mounted.length) mounted.pop()!();
    vi.useRealTimers();
  });

  it("keeps Search focused when a search supersedes a pending Previous and also lands on page 1 (10703)", async () => {
    const view = await mountOnPageTwo();

    click(view.previous());
    expect(view.calls[1].query).toEqual({ page: 1 });

    act(() => view.search.focus());
    type(view.search, "bpc");
    act(() => vi.advanceTimersByTime(250));
    expect(view.calls[2].query).toEqual({ q: "bpc" });
    expect(view.history.entries).toEqual(["?page=2", "?q=bpc"]);

    await view.calls[2].release(filtered);
    expect(view.count()).toBe("Showing 1 of 7 offerings");
    expect(document.activeElement).toBe(view.search);

    // The superseded unfiltered page arrives last and changes nothing.
    await view.calls[1].release(unfiltered(1));
    expect(view.count()).toBe("Showing 1 of 7 offerings");
    expect(document.activeElement).toBe(view.search);
  });

  it("keeps Search focused when the pending page arrives while a search is still debouncing", async () => {
    const view = await mountOnPageTwo();
    // The member is already in Search and taps Previous without leaving it,
    // then keeps typing. The Previous page lands inside the debounce window,
    // under the very query the pager asked for.
    act(() => view.search.focus());
    click(view.previous());
    type(view.search, "bp");

    await view.calls[1].release(unfiltered(1));
    expect(view.count()).toBe("Showing 1 of 60 offerings");
    expect(document.activeElement).toBe(view.search);

    act(() => vi.advanceTimersByTime(250));
    expect(view.calls[2].query).toEqual({ q: "bp" });
    await view.calls[2].release(filtered);
    expect(document.activeElement).toBe(view.search);
  });

  it("keeps focus where the member put it after asking, even without typing", async () => {
    const view = await mountOnPageTwo();
    click(view.previous());
    // On a phone, tapping into Search opens the keyboard. A late Previous page
    // must not close it.
    act(() => view.search.focus());

    await view.calls[1].release(unfiltered(1));
    expect(view.count()).toBe("Showing 1 of 60 offerings");
    expect(document.activeElement).toBe(view.search);
  });

  it("does not treat a back or forward result as the pager's page", async () => {
    const view = await mountOnPageTwo();
    click(view.previous());
    expect(view.calls[1].query).toEqual({ page: 1 });

    // Before Previous answers, the member goes back to a sorted first page.
    view.history.go("?sort=name_asc");
    expect(view.calls[2].query).toEqual({ sort: "name_asc" });
    await view.calls[2].release(page({ page: 1, totalPages: 3, total: 60, sort: "name_asc" }));
    expect(document.activeElement).toBe(document.body);
  });

  it("does not treat Back then Forward to the same address as the pager's page (10726)", async () => {
    const view = await mountOnPageTwo();
    const previous = view.previous();
    act(() => previous.focus());
    click(previous);
    expect(view.calls[1].query).toEqual({ page: 1 });
    expect(view.history.entries).toEqual(["?page=2", ""]);

    // Before Previous answers, Back to page 2, then Forward to the very
    // address Previous wrote. Each traversal is a new request; the Forward
    // one asks for the same URL but is not the pager's request.
    view.history.back();
    expect(view.calls[2].query).toEqual({ page: 2 });
    view.history.forward();
    expect(view.calls[3].query).toEqual({});

    await view.calls[3].release(unfiltered(1));
    expect(view.count()).toBe("Showing 1 of 60 offerings");
    expect([previous, document.body]).toContain(document.activeElement);

    // The superseded responses arrive last and change nothing.
    await view.calls[1].release(unfiltered(1));
    await view.calls[2].release(unfiltered(2));
    expect(view.count()).toBe("Showing 1 of 60 offerings");
    expect([previous, document.body]).toContain(document.activeElement);
  });

  it("still moves focus to Results when the asked-for page arrives", async () => {
    const view = await mountOnPageTwo();
    click(view.previous());
    expect(document.activeElement).toBe(document.body);

    await view.calls[1].release(unfiltered(1));
    expect(view.count()).toBe("Showing 1 of 60 offerings");
    expect(document.activeElement?.id).toBe("mo-catalog-results");
  });

  it("still moves focus to Results when the pager button itself held focus", async () => {
    const view = await mountOnPageTwo();
    // Chromium focuses a clicked button; the keyboard path focuses it too.
    const previous = view.previous();
    act(() => previous.focus());
    click(previous);

    await view.calls[1].release(unfiltered(1));
    expect(document.activeElement?.id).toBe("mo-catalog-results");
  });
});
