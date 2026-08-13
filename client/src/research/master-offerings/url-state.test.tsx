// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";
import {
  catalogQueryToSearch,
  parseCatalogQueryFromSearch,
} from "./integration-packet";

/**
 * URL state, proved through the real address bar.
 *
 * The other catalog tests drive an in-memory history, which is the right tool
 * for back and forward but cannot answer the question a member actually asks:
 * if I paste this link, or hit reload, do I get the same view back?
 *
 * A hard reload is a fresh mount that has nothing but `window.location`. So
 * every test here unmounts and mounts again, reading only the address bar, and
 * asserts the second mount requests exactly what the first one was showing.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const CATALOG_PATH = "/research/member/catalog";

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
  });
}

function okPage() {
  return {
    kind: "ok" as const,
    data: {
      ok: true as const,
      audience: "member" as const,
      launchScope: "founder_admin" as const,
      catalog: {
        ok: true as const,
        page: 1,
        pageSize: 24,
        total: 0,
        totalPages: 0,
        products: [],
      },
    },
  };
}

/** Mount the surface on whatever the address bar currently says. */
async function mountFromAddressBar() {
  const fetchCatalog = vi.fn(async () => okPage());
  const mounted = render(
    <MasterOfferingCatalogSurface
      memberToken="token"
      fetchCatalog={fetchCatalog as never}
    />,
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

describe("catalog url state, through the real address bar", () => {
  beforeEach(() => {
    window.history.replaceState(null, "", CATALOG_PATH);
  });

  it("restores search, family, availability, page and page size from a pasted link", async () => {
    window.history.replaceState(
      null,
      "",
      `${CATALOG_PATH}?q=bpc&families=research_vials&states=available_now&page=3&pageSize=48`,
    );

    const first = await mountFromAddressBar();
    const expected = {
      q: "bpc",
      families: ["research_vials"],
      states: ["available_now"],
      page: 3,
      pageSize: 48,
    };
    expect(first.fetchCatalog).toHaveBeenCalledWith("token", expected);
    expect(
      first.host.querySelector<HTMLInputElement>("#mo-catalog-search")?.value,
    ).toBe("bpc");
    expect(
      first.host.querySelector<HTMLSelectElement>("#mo-catalog-family")?.value,
    ).toBe("research_vials");
    expect(
      first.host.querySelector<HTMLSelectElement>("#mo-catalog-state")?.value,
    ).toBe("available_now");
    first.unmount();

    // The reload: a brand new mount with nothing but the address bar.
    const second = await mountFromAddressBar();
    expect(second.fetchCatalog).toHaveBeenCalledWith("token", expected);
    expect(
      second.host.querySelector<HTMLInputElement>("#mo-catalog-search")?.value,
    ).toBe("bpc");
    second.unmount();
  });

  it("writes every control into the address bar, and the reload comes back the same", async () => {
    const first = await mountFromAddressBar();
    const family =
      first.host.querySelector<HTMLSelectElement>("#mo-catalog-family");
    const state =
      first.host.querySelector<HTMLSelectElement>("#mo-catalog-state");
    const search =
      first.host.querySelector<HTMLInputElement>("#mo-catalog-search");
    expect(family && state && search).toBeTruthy();

    if (family) setValue(family, "supplements");
    await settle();
    if (state) setValue(state, "coming_soon");
    await settle();
    if (search) setValue(search, "nad");
    await settle();

    expect(window.location.pathname).toBe(CATALOG_PATH);
    expect(parseCatalogQueryFromSearch(window.location.search)).toEqual({
      q: "nad",
      families: ["supplements"],
      states: ["coming_soon"],
    });
    first.unmount();

    const second = await mountFromAddressBar();
    expect(second.fetchCatalog).toHaveBeenCalledWith("token", {
      q: "nad",
      families: ["supplements"],
      states: ["coming_soon"],
    });
    expect(
      second.host.querySelector<HTMLSelectElement>("#mo-catalog-family")?.value,
    ).toBe("supplements");
    expect(
      second.host.querySelector<HTMLSelectElement>("#mo-catalog-state")?.value,
    ).toBe("coming_soon");
    expect(
      second.host.querySelector<HTMLInputElement>("#mo-catalog-search")?.value,
    ).toBe("nad");
    second.unmount();
  });

  it("clears the search out of the address bar when the box is emptied", async () => {
    window.history.replaceState(
      null,
      "",
      `${CATALOG_PATH}?q=bpc&families=research_vials`,
    );
    const mounted = await mountFromAddressBar();
    const search =
      mounted.host.querySelector<HTMLInputElement>("#mo-catalog-search");
    expect(search?.value).toBe("bpc");

    if (search) setValue(search, "");
    await settle();
    // Emptying the box used to hand back the query it came from, so the old
    // search stayed in the URL and in the results, and there was no way to
    // clear it short of editing the address bar by hand.
    expect(window.location.search).toBe("?families=research_vials");
    expect(mounted.fetchCatalog).toHaveBeenLastCalledWith("token", {
      families: ["research_vials"],
    });
    expect(search?.value).toBe("");
    mounted.unmount();
  });

  it("follows the browser back button without reloading the page", async () => {
    const mounted = await mountFromAddressBar();
    const family =
      mounted.host.querySelector<HTMLSelectElement>("#mo-catalog-family");
    if (family) setValue(family, "supplements");
    await settle();
    expect(window.location.search).toBe("?families=supplements");

    // popstate is the browser back and forward. The surface listens for it and
    // re-reads the URL, which is what keeps the rendered filters and the
    // address bar from drifting apart.
    window.history.replaceState(null, "", CATALOG_PATH);
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    await settle();
    expect(mounted.fetchCatalog).toHaveBeenLastCalledWith("token", {});
    expect(family?.value).toBe("all");
    mounted.unmount();
  });

  it("drops a page size the catalog route would refuse", async () => {
    window.history.replaceState(null, "", `${CATALOG_PATH}?pageSize=5000`);
    const mounted = await mountFromAddressBar();
    // The server answers an invalid-request refusal above its ceiling rather
    // than clamping, so asking would show the member a broken catalog.
    expect(mounted.fetchCatalog).toHaveBeenCalledWith("token", {});
    mounted.unmount();
  });

  it("round-trips the whole vocabulary through serialize and parse", () => {
    const query = {
      q: "bpc-157",
      families: ["research_vials"] as const,
      states: ["available_now"] as const,
      page: 4,
      pageSize: 48,
    };
    expect(parseCatalogQueryFromSearch(catalogQueryToSearch(query))).toEqual(
      query,
    );
    // Page one and the default page size are the absence of a parameter, so a
    // shared link does not freeze today's defaults into itself.
    expect(catalogQueryToSearch({ page: 1 })).toBe("");
    expect(catalogQueryToSearch({ pageSize: 0 })).toBe("");
    expect(catalogQueryToSearch({ pageSize: 5000 })).toBe("");
  });
});
