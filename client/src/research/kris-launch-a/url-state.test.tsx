// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { KrisCatalogSurface } from "./KrisCatalogSurface";
import { KRIS_CATALOG_PATH, krisQueryToSearch, parseKrisQueryFromSearch } from "./integration-packet";
import { krisFixtureFetchCatalog } from "./__fixtures__/krisFixtureServer";

/**
 * URL state, proved through the real address bar.
 *
 * An in-memory history is the right tool for back and forward, but it cannot
 * answer the question a member actually asks: if I paste this link, or hit
 * reload, do I get the same view back?
 *
 * A hard reload is a fresh mount that has nothing but `window.location`. So
 * every test here unmounts and mounts again, reading only the address bar, and
 * asserts the second mount requests and renders exactly what the first one was
 * showing. That is the reload, run rather than reasoned about.
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

/** Mount the surface on whatever the address bar currently says. */
async function mountFromAddressBar() {
  const fetchCatalog = vi.fn(krisFixtureFetchCatalog);
  const mounted = render(
    <KrisCatalogSurface memberToken="token" fetchCatalog={fetchCatalog as never} />,
  );
  await settle();
  return { ...mounted, fetchCatalog };
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

/** Everything a member can see about which view they are looking at. */
function viewFingerprint(host: HTMLElement) {
  return {
    url: window.location.pathname + window.location.search,
    search: host.querySelector<HTMLInputElement>("#kris-search")?.value,
    family: host.querySelector<HTMLSelectElement>("#kris-family")?.value,
    channel: host.querySelector<HTMLSelectElement>("#kris-channel")?.value,
    sort: host.querySelector<HTMLSelectElement>("#kris-sort")?.value,
    pageSize: host.querySelector<HTMLSelectElement>("#kris-page-size")?.value,
    count: host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    position: host.querySelector('[data-testid="kris-page-position"]')?.textContent,
    firstCard: host
      .querySelector('[data-testid="kris-card-link"]')
      ?.getAttribute("href"),
    cardCount: host.querySelectorAll('[data-testid="kris-card"]').length,
  };
}

describe("catalog url state, through the real address bar", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", KRIS_CATALOG_PATH);
  });

  it("restores search, family, channel, sort, page and page size from a pasted link", async () => {
    window.history.replaceState(
      null,
      "",
      KRIS_CATALOG_PATH +
        "?q=peptide&families=research_peptides_and_materials&channels=ruo_research&sort=price_asc&page=2&pageSize=48",
    );

    const first = await mountFromAddressBar();
    const expected = {
      q: "peptide",
      families: ["research_peptides_and_materials"],
      channels: ["ruo_research"],
      sort: "price_asc",
      page: 2,
      pageSize: 48,
    };
    expect(first.fetchCatalog).toHaveBeenCalledWith("token", expected);
    const shown = viewFingerprint(first.host);
    expect(shown.search).toBe("peptide");
    expect(shown.family).toBe("research_peptides_and_materials");
    expect(shown.channel).toBe("ruo_research");
    expect(shown.sort).toBe("price_asc");
    expect(shown.pageSize).toBe("48");
    first.unmount();

    // THE RELOAD: a brand new mount with nothing but the address bar.
    const second = await mountFromAddressBar();
    expect(second.fetchCatalog).toHaveBeenCalledWith("token", expected);
    expect(viewFingerprint(second.host)).toEqual(shown);
    second.unmount();
  });

  it("writes every control into the address bar, and the reload comes back identical", async () => {
    const first = await mountFromAddressBar();
    setValue(first.host.querySelector<HTMLSelectElement>("#kris-family")!, "supplements");
    await settle();
    setValue(first.host.querySelector<HTMLSelectElement>("#kris-channel")!, "supplement");
    await settle();
    setValue(first.host.querySelector<HTMLSelectElement>("#kris-sort")!, "name_desc");
    await settle();
    setValue(first.host.querySelector<HTMLInputElement>("#kris-search")!, "nad");
    await settle();
    setValue(first.host.querySelector<HTMLSelectElement>("#kris-page-size")!, "48");
    await settle();

    expect(window.location.pathname).toBe(KRIS_CATALOG_PATH);
    expect(parseKrisQueryFromSearch(window.location.search)).toEqual({
      q: "nad",
      families: ["supplements"],
      channels: ["supplement"],
      sort: "name_desc",
      pageSize: 48,
    });
    const before = viewFingerprint(first.host);
    first.unmount();

    const second = await mountFromAddressBar();
    expect(second.fetchCatalog).toHaveBeenCalledWith("token", {
      q: "nad",
      families: ["supplements"],
      channels: ["supplement"],
      sort: "name_desc",
      pageSize: 48,
    });
    expect(viewFingerprint(second.host)).toEqual(before);
    second.unmount();
  });

  it("keeps a paged view identical across a reload, down to the first card", async () => {
    const first = await mountFromAddressBar();
    const next = first.host.querySelector<HTMLButtonElement>(
      '[data-testid="kris-next-page"]',
    );
    act(() => next?.click());
    await settle();
    act(() => next?.click());
    await settle();
    expect(window.location.search).toBe("?page=3");
    const before = viewFingerprint(first.host);
    expect(before.position).toBe("Page 3 of 18");
    expect(before.cardCount).toBe(24);
    first.unmount();

    const second = await mountFromAddressBar();
    expect(viewFingerprint(second.host)).toEqual(before);
    second.unmount();
  });

  it("clears the search out of the address bar when the box is emptied", async () => {
    window.history.replaceState(
      null,
      "",
      KRIS_CATALOG_PATH + "?q=bpc&families=research_peptides_and_materials",
    );
    const mounted = await mountFromAddressBar();
    const search = mounted.host.querySelector<HTMLInputElement>("#kris-search");
    expect(search?.value).toBe("bpc");

    setValue(search!, "");
    await settle();
    // Emptying the box must not hand back the query it came from, or the old
    // search stays in the URL and in the results with no way to clear it.
    expect(window.location.search).toBe("?families=research_peptides_and_materials");
    expect(mounted.fetchCatalog).toHaveBeenLastCalledWith("token", {
      families: ["research_peptides_and_materials"],
    });
    expect(search?.value).toBe("");
    mounted.unmount();
  });

  it("follows the browser back button without reloading the page", async () => {
    const mounted = await mountFromAddressBar();
    setValue(
      mounted.host.querySelector<HTMLSelectElement>("#kris-family")!,
      "supplements",
    );
    await settle();
    expect(window.location.search).toBe("?families=supplements");

    // popstate is the browser back and forward. The surface listens for it and
    // re-reads the URL, which keeps the rendered filters and the address bar
    // from drifting apart.
    window.history.replaceState(null, "", KRIS_CATALOG_PATH);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await settle();
    expect(mounted.fetchCatalog).toHaveBeenLastCalledWith("token", {});
    expect(
      mounted.host.querySelector<HTMLSelectElement>("#kris-family")?.value,
    ).toBe("all");
    expect(
      mounted.host.querySelector('[data-testid="kris-result-count"]')?.textContent,
    ).toBe("Showing 24 of 420 items");
    mounted.unmount();
  });

  it("drops anything outside the closed vocabulary from a hand-edited link", async () => {
    window.history.replaceState(
      null,
      "",
      KRIS_CATALOG_PATH +
        "?families=not_a_family&channels=wholesale&sort=margin_desc&pageSize=5000&page=-3&profile=DEFAULT",
    );
    const mounted = await mountFromAddressBar();
    // A hand-edited URL can narrow this catalog. It can never name a family, a
    // channel, a sort, a page size or a price profile the contract does not
    // have.
    expect(mounted.fetchCatalog).toHaveBeenCalledWith("token", {});
    mounted.unmount();
  });

  it("round-trips the whole vocabulary through serialize and parse", () => {
    const query = {
      q: "bpc-157",
      families: ["research_peptides_and_materials"] as const,
      channels: ["ruo_research"] as const,
      sort: "name_asc" as const,
      page: 4,
      pageSize: 48,
    };
    expect(parseKrisQueryFromSearch(krisQueryToSearch(query))).toEqual(query);
    // Page one and the default page size are the absence of a parameter, so a
    // shared link does not freeze today's defaults into itself.
    expect(krisQueryToSearch({ page: 1 })).toBe("");
    expect(krisQueryToSearch({ pageSize: 0 })).toBe("");
    expect(krisQueryToSearch({ pageSize: 5000 })).toBe("");
  });
});
