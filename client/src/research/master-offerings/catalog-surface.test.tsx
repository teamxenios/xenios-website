// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { MasterOfferingCatalogListResponse } from "@shared/research/master-offerings/contract";
import type { ApiResult } from "../lib/api";
import { MasterOfferingCatalogSurface } from "./MasterOfferingCatalogSurface";
import { useCatalogQueryState, type CatalogHistory } from "./useCatalogQueryState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return { host, unmount: () => act(() => root.unmount()) };
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** An in-memory history with a real back stack, so back/forward is testable. */
function testHistory(initial = ""): CatalogHistory & {
  back(): void;
  entries: string[];
} {
  let entries = [initial];
  let index = 0;
  // An array, not a Set: this repository's TypeScript target rejects iterating
  // a Set without downlevelIteration.
  const listeners: Array<() => void> = [];
  return {
    entries,
    search: () => entries[index],
    push(search) {
      entries = entries.slice(0, index + 1).concat(search);
      index = entries.length - 1;
      this.entries = entries;
    },
    replace(search) {
      entries[index] = search;
      this.entries = entries;
    },
    subscribe(listener) {
      listeners.push(listener);
      return () => {
        const at = listeners.indexOf(listener);
        if (at >= 0) listeners.splice(at, 1);
      };
    },
    back() {
      if (index > 0) index -= 1;
      for (const listener of listeners) listener();
    },
  };
}

function card(id: string, name: string) {
  return {
    id,
    slug: name.toLowerCase().replace(/\s+/g, "-"),
    displayName: name,
    canonicalName: name,
    family: "research_vials" as const,
    familyLabel: "Research Vials",
    category: "Peptides & Research",
    subcategory: null,
    brand: null,
    displayState: "available_now" as const,
    displayLabel: "Available Now",
    stateExplanation: "Available now.",
    copyState: "approved" as const,
    variantCount: 1,
    variants: [
      {
        id: `${id}_v`,
        label: "5 mg vial",
        displayState: "available_now" as const,
        displayLabel: "Available Now",
        price: { state: "on_request" as const },
      },
    ],
    priceSummary: {
      state: "none" as const,
      variantCount: 1,
      pricedVariantCount: 0,
      currency: null,
      fromCents: null,
      toCents: null,
      display: "Price on request",
    },
  };
}

function okPage(
  names: string[],
  total = names.length,
): ApiResult<MasterOfferingCatalogListResponse> {
  return {
    kind: "ok",
    data: {
      ok: true,
      audience: "member",
      launchScope: "founder_admin",
      catalog: {
        ok: true,
        page: 1,
        pageSize: 24,
        total,
        totalPages: Math.max(1, Math.ceil(total / 24)),
        products: names.map((name, index) => card(`mo_${index}`, name)),
      },
    },
  };
}

describe("catalog surface", () => {
  it("shows a loading state, then the catalog", async () => {
    const fetchCatalog = vi.fn(async () => okPage(["BPC-157"]));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={testHistory()}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    expect(host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe(
      "Loading the catalog",
    );
    expect(host.querySelector('[data-testid="mo-skeleton"]')).not.toBeNull();
    await settle();
    expect(host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe(
      "Showing 1 of 1 offerings",
    );
    expect(host.querySelector('[data-testid="mo-skeleton"]')).toBeNull();
    unmount();
  });

  it("offers a retry that actually refetches after a failure", async () => {
    const fetchCatalog = vi
      .fn()
      .mockResolvedValueOnce({ kind: "error", message: "boom" })
      .mockResolvedValueOnce(okPage(["BPC-157"]));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={testHistory()}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    await settle();
    expect(host.textContent).toContain("The catalog could not be loaded.");
    const retry = host.querySelector('[data-testid="mo-retry"]');
    expect(retry).not.toBeNull();
    act(() => retry?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();
    expect(fetchCatalog).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[data-testid="mo-result-count"]')?.textContent).toBe(
      "Showing 1 of 1 offerings",
    );
    unmount();
  });

  it("tells a restricted member the truth and offers no pointless retry", async () => {
    const fetchCatalog = vi.fn(async () => ({
      kind: "denied" as const,
      code: "master_offerings_launch_restricted",
    }));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={testHistory()}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    await settle();
    expect(host.textContent).toContain(
      "The full catalog is not open to your account yet.",
    );
    expect(host.textContent).not.toContain("sign in");
    expect(host.querySelector('[data-testid="mo-retry"]')).toBeNull();
    unmount();
  });

  it("never shows an empty catalog when the server is unavailable", async () => {
    const fetchCatalog = vi.fn(async () => ({ kind: "unavailable" as const }));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken={null}
        history={testHistory()}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    await settle();
    // "0 offerings" would read as "Xenios sells nothing".
    expect(host.textContent).not.toContain("Showing 0 of 0");
    expect(host.textContent).toContain("The full catalog is not available yet.");
    unmount();
  });

  it("opens a deep link with its filters already applied", async () => {
    const fetchCatalog = vi.fn(async () => okPage(["BPC-157"]));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={testHistory("?q=bpc&families=research_vials&page=3")}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    await settle();
    expect(fetchCatalog).toHaveBeenCalledWith("token", {
      q: "bpc",
      families: ["research_vials"],
      page: 3,
    });
    expect(
      host.querySelector<HTMLInputElement>("#mo-catalog-search")?.value,
    ).toBe("bpc");
    expect(
      host.querySelector<HTMLSelectElement>("#mo-catalog-family")?.value,
    ).toBe("research_vials");
    unmount();
  });

  it("writes a filter change into history and honours the back button", async () => {
    const history = testHistory();
    const fetchCatalog = vi.fn(async () => okPage(["BPC-157"]));
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={history}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    await settle();

    const select = host.querySelector<HTMLSelectElement>("#mo-catalog-family");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (select) {
      setter?.call(select, "supplements");
      act(() => select.dispatchEvent(new Event("change", { bubbles: true })));
    }
    await settle();
    expect(history.search()).toBe("?families=supplements");
    expect(fetchCatalog).toHaveBeenLastCalledWith("token", {
      families: ["supplements"],
    });

    act(() => history.back());
    await settle();
    expect(history.search()).toBe("");
    expect(fetchCatalog).toHaveBeenLastCalledWith("token", {});
    unmount();
  });

  it("ignores a slow earlier response that lands after a newer one", async () => {
    let resolveFirst: ((value: unknown) => void) | null = null;
    const fetchCatalog = vi
      .fn()
      .mockImplementationOnce(
        () => new Promise((resolve) => (resolveFirst = resolve)),
      )
      .mockResolvedValueOnce(okPage(["Second"]));
    const history = testHistory();
    const { host, unmount } = render(
      <MasterOfferingCatalogSurface
        memberToken="token"
        history={history}
        fetchCatalog={fetchCatalog as never}
      />,
    );
    const select = host.querySelector<HTMLSelectElement>("#mo-catalog-family");
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    if (select) {
      setter?.call(select, "supplements");
      act(() => select.dispatchEvent(new Event("change", { bubbles: true })));
    }
    await settle();
    expect(host.textContent).toContain("Second");
    // The stale first response arrives last and must not win.
    act(() => resolveFirst?.(okPage(["First"])));
    await settle();
    expect(host.textContent).toContain("Second");
    expect(host.textContent).not.toContain("First");
    unmount();
  });
});

describe("catalog url state", () => {
  function Probe({ history }: { history: CatalogHistory }) {
    const { query, setQuery } = useCatalogQueryState(history);
    return (
      <button
        type="button"
        data-testid="probe"
        onClick={() => setQuery({ ...query, page: (query.page ?? 1) + 1 })}
      >
        {JSON.stringify(query)}
      </button>
    );
  }

  it("does not stack an identical entry when nothing changed", () => {
    const history = testHistory("?q=bpc");
    const push = vi.spyOn(history, "push");
    const { host, unmount } = render(<Probe history={history} />);
    expect(host.querySelector('[data-testid="probe"]')?.textContent).toBe(
      '{"q":"bpc"}',
    );
    unmount();
    expect(push).not.toHaveBeenCalled();
  });

  it("drops anything outside the closed vocabulary from a hand-edited link", () => {
    const history = testHistory("?audience=admin&states=purchasable&q=bpc");
    const { host, unmount } = render(<Probe history={history} />);
    expect(host.querySelector('[data-testid="probe"]')?.textContent).toBe(
      '{"q":"bpc"}',
    );
    unmount();
  });
});
