// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { CatalogDiscoveryPage } from "./CatalogDiscoveryPresentation";
import {
  parseCatalogDiscoveryQuery,
  serializeCatalogDiscoveryQuery,
} from "./catalog-discovery-query";
import type { CatalogHistory } from "./useCatalogQueryState";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const mounted: Array<() => void> = [];

afterEach(() => {
  while (mounted.length) mounted.pop()?.();
});
function history(initial = ""): CatalogHistory & {
  back(): void;
  forward(): void;
  entries(): string[];
} {
  let stack = [initial];
  let index = 0;
  const listeners: Array<() => void> = [];
  const notify = () => listeners.forEach((listener) => listener());
  return {
    search: () => stack[index],
    push(search) {
      stack = stack.slice(0, index + 1).concat(search);
      index = stack.length - 1;
    },
    replace(search) {
      stack[index] = search;
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
      notify();
    },
    forward() {
      if (index < stack.length - 1) index += 1;
      notify();
    },
    entries: () => stack.slice(),
  };
}

function record(): Record<string, unknown> {
  return {
    productId: "product-1",
    variantId: "variant-1",
    displayName: "Example offering",
    variantLabel: "10 mg vial",
    category: { key: "research", label: "Research" },
    strength: { key: "ten-mg", label: "10 mg" },
    form: { key: "vial", label: "Vial" },
    status: "live",
    accessPath: "direct_order",
    action: {
      kind: "request_order",
      href: "/research/member/product-requests/new",
    },
    savedInterest: { availability: "unavailable" },
  };
}

function mount(testHistory: CatalogHistory) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  act(() =>
    root.render(
      <CatalogDiscoveryPage
        records={[record()]}
        state="ready"
        history={testHistory}
      />,
    ),
  );
  mounted.push(() => {
    act(() => root.unmount());
    host.remove();
  });
  return host;
}

function select(view: HTMLElement, id: string, value: string) {
  const element = view.querySelector<HTMLSelectElement>(`#${id}`);
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLSelectElement.prototype,
    "value",
  )?.set;
  act(() => {
    setter?.call(element, value);
    element?.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("catalog discovery URL state", () => {
  it("round-trips every explicit discovery filter in deterministic order", () => {
    const query = {
      q: "bpc 157",
      category: "research",
      strength: "ten-mg",
      form: "vial",
      access: "direct_order" as const,
      status: "live" as const,
    };
    const search = serializeCatalogDiscoveryQuery(query);
    expect(search).toBe(
      "?q=bpc+157&category=research&strength=ten-mg&form=vial&access=direct_order&status=live",
    );
    expect(parseCatalogDiscoveryQuery(search)).toEqual(query);
  });

  it("drops malformed and pending-activation-shaped URL values", () => {
    expect(
      parseCatalogDiscoveryQuery(
        "?category=../admin&strength=10%20mg&form=%00&access=buy&status=pending_pharmacy_activation",
      ),
    ).toEqual({});
  });

  it("restores filters through back and forward without a reload", () => {
    const testHistory = history(
      "?category=research&strength=ten-mg&form=vial&access=direct_order&status=live",
    );
    const view = mount(testHistory);
    expect(
      view.querySelector<HTMLSelectElement>("#catalog-discovery-strength")
        ?.value,
    ).toBe("ten-mg");
    expect(
      view.querySelector<HTMLSelectElement>("#catalog-discovery-status")?.value,
    ).toBe("live");

    select(view, "catalog-discovery-status", "held");
    expect(testHistory.search()).toContain("status=held");
    expect(
      view.querySelector<HTMLSelectElement>("#catalog-discovery-status")?.value,
    ).toBe("held");

    act(() => testHistory.back());
    expect(
      view.querySelector<HTMLSelectElement>("#catalog-discovery-status")?.value,
    ).toBe("live");
    expect(testHistory.search()).toContain("status=live");

    act(() => testHistory.forward());
    expect(
      view.querySelector<HTMLSelectElement>("#catalog-discovery-status")?.value,
    ).toBe("held");
    expect(testHistory.entries()).toHaveLength(2);
  });
});
