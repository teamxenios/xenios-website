// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { FullCatalogPage } from "./FullCatalogPage";
import { click, page, render, setViewportWidth } from "./catalog-test-fixtures";

/**
 * The member catalog on a phone keeps Search and paging in reach.
 *
 * Samuel's iPhone report (KAN-225/10657): Search started inside the collapsed
 * filters, and Previous / Next only existed after the last card, so a member
 * had to scroll back up to search and all the way down to change page. The
 * fix is one toolbar that sticks below the member header on phones and holds
 * Search, the filter toggle and a compact pager. jsdom lays nothing out, so
 * these tests hold the structure and the CSS contract; painted behaviour at
 * 320/375/390/430 px still needs a real browser.
 */

const here = dirname(fileURLToPath(import.meta.url));
const css = readFileSync(resolve(here, "catalog-toolbar.css"), "utf8");

function hasHiddenAncestor(element: Element | null): boolean {
  for (let node = element; node; node = node.parentElement) {
    if (node.classList.contains("hidden")) return true;
  }
  return false;
}

describe("member catalog toolbar", () => {
  it("keeps Search visible outside the collapsed filter fields", () => {
    setViewportWidth(375);
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={vi.fn()} />,
    );
    const search = host.querySelector<HTMLInputElement>("#mo-catalog-search");
    const fields = host.querySelector("#mo-catalog-filter-fields");
    expect(search).not.toBeNull();
    expect(fields?.className).toContain("hidden");
    expect(fields?.contains(search)).toBe(false);
    expect(hasHiddenAncestor(search)).toBe(false);
    // Still a labelled control, not a placeholder-only box.
    expect(host.querySelector('label[for="mo-catalog-search"]')?.textContent).toContain("Search the catalog");
    unmount();
  });

  it("puts Search, the filter toggle and a compact pager in one toolbar", () => {
    const onQueryChange = vi.fn();
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ page: 2 }}
        page={page({ page: 2, totalPages: 3, total: 60 })}
        onQueryChange={onQueryChange}
      />,
    );
    const toolbar = host.querySelector('[data-testid="mo-catalog-toolbar"]');
    expect(toolbar?.classList.contains("research-catalog-toolbar")).toBe(true);
    expect(toolbar?.querySelector("#mo-catalog-search")).not.toBeNull();
    expect(toolbar?.querySelector('[data-testid="mo-filter-toggle"]')).not.toBeNull();

    const quick = toolbar?.querySelector('[data-testid="mo-toolbar-pager"]');
    expect(quick?.tagName).toBe("DIV");
    expect(quick?.getAttribute("role")).toBe("group");
    expect(quick?.getAttribute("aria-label")).toBe("Catalog pages, quick controls");
    expect(quick?.querySelector('[data-testid="mo-toolbar-page-position"]')?.textContent).toBe("Page 2 of 3");
    const buttons = Array.from(quick?.querySelectorAll("button") ?? []);
    expect(buttons.map((button) => button.textContent)).toEqual(["Previous", "Next"]);
    for (const button of buttons) expect(button.className).toContain("min-h-[44px]");

    click(buttons[1]);
    expect(onQueryChange).toHaveBeenLastCalledWith({ page: 3 });
    click(buttons[0]);
    expect(onQueryChange).toHaveBeenLastCalledWith({ page: 1 });

    // The full pager after the last card is unchanged, and it stays the only
    // navigation landmark named "Catalog pages".
    expect(host.querySelectorAll('nav[aria-label="Catalog pages"]')).toHaveLength(1);
    expect(host.querySelector('[data-testid="mo-page-position"]')?.textContent).toBe("Page 2 of 3");
    unmount();
  });

  it("disables the compact pager at the edges and omits it for a single page", () => {
    const first = render(
      <FullCatalogPage query={{}} page={page({ page: 1, totalPages: 4, total: 80 })} onQueryChange={vi.fn()} />,
    );
    const firstButtons = Array.from(first.host.querySelectorAll<HTMLButtonElement>('[data-testid="mo-toolbar-pager"] button'));
    expect(firstButtons.map((button) => button.disabled)).toEqual([true, false]);
    first.unmount();

    const last = render(
      <FullCatalogPage query={{ page: 4 }} page={page({ page: 4, totalPages: 4, total: 80 })} onQueryChange={vi.fn()} />,
    );
    const lastButtons = Array.from(last.host.querySelectorAll<HTMLButtonElement>('[data-testid="mo-toolbar-pager"] button'));
    expect(lastButtons.map((button) => button.disabled)).toEqual([false, true]);
    last.unmount();

    const single = render(<FullCatalogPage query={{}} page={page()} onQueryChange={vi.fn()} />);
    expect(single.host.querySelector('[data-testid="mo-toolbar-pager"]')).toBeNull();
    expect(single.host.querySelector('[data-testid="mo-catalog-toolbar"] #mo-catalog-search')).not.toBeNull();
    single.unmount();
  });

  it("counts on the toggle only the filters it hides, while the summary still counts Search", () => {
    const { host, unmount } = render(
      <FullCatalogPage
        query={{ q: "bpc", families: ["research_vials"] }}
        page={page()}
        onQueryChange={vi.fn()}
      />,
    );
    expect(host.querySelector('[data-testid="mo-filter-toggle"]')?.textContent).toBe("Show filters (1 active)");
    expect(host.querySelector('[data-testid="mo-active-filter-count"]')?.textContent).toBe("2 active filters");
    unmount();
  });

  it("keeps focus in Search when a search resets the page, and still moves it after an explicit page change", () => {
    const onQueryChange = vi.fn();
    const view = render(
      <FullCatalogPage
        query={{ page: 3 }}
        page={page({ page: 3, totalPages: 5, total: 100 })}
        onQueryChange={onQueryChange}
      />,
    );
    const search = view.host.querySelector<HTMLInputElement>("#mo-catalog-search")!;
    act(() => search.focus());
    expect(document.activeElement).toBe(search);

    // A debounced search answers with page 1 of a narrower result.
    view.rerender(
      <FullCatalogPage
        query={{ q: "bpc" }}
        page={page({ page: 1, totalPages: 2, total: 30 })}
        onQueryChange={onQueryChange}
      />,
    );
    expect(document.activeElement).toBe(search);

    // An explicit Next from the toolbar is a page change the member asked for.
    click(view.host.querySelector('[data-testid="mo-toolbar-pager"] button:last-of-type'));
    expect(onQueryChange).toHaveBeenLastCalledWith({ q: "bpc", page: 2 });
    view.rerender(
      <FullCatalogPage
        query={{ q: "bpc", page: 2 }}
        page={page({ page: 2, totalPages: 2, total: 30 })}
        onQueryChange={onQueryChange}
      />,
    );
    expect(document.activeElement?.id).toBe("mo-catalog-results");
    view.unmount();
  });

  it("pins the sticky contract below the member header on phones only", () => {
    const phone = css.match(/@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(phone).toMatch(/\.research-catalog-toolbar \{[^}]*position: sticky;[^}]*top: var\(--research-sticky-chrome-height, 0px\);[^}]*z-index: 30;/);
    // The open filter fields scroll inside the toolbar rather than covering the page.
    expect(phone).toMatch(/#mo-catalog-filter-fields \{[^}]*max-height: [^;]+;[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/);
    // A focused results heading lands below both sticky layers.
    expect(phone).toMatch(/\.research-catalog-results-heading \{[^}]*scroll-margin-top: calc\(var\(--research-sticky-chrome-height, 0px\) \+ var\(--research-catalog-toolbar-height, 0px\) \+ 8px\);/);
    // Nothing outside the phone media query makes the toolbar sticky.
    expect(css.replace(phone, "")).not.toContain("position: sticky");
  });

  it("gives the results heading the scroll margin class", () => {
    const { host, unmount } = render(
      <FullCatalogPage query={{}} page={page()} onQueryChange={vi.fn()} />,
    );
    expect(host.querySelector("#mo-catalog-results")?.classList.contains("research-catalog-results-heading")).toBe(true);
    unmount();
  });
});
