// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessMultiCartJourney } from "./EarlyAccessMultiCartJourney";
import type { EarlyAccessCardProduct } from "../EarlyAccessProductCard";
import {
  CART_ATTEMPT_STORAGE_KEY,
  LAST_CART_CHECKOUT_STORAGE_KEY,
} from "./cartAttemptStore";
import { readEarlyAccessHistoryState } from "./history";

/**
 * THE MOUNTED CART JOURNEY, AS A CUSTOMER ACTUALLY USES IT.
 *
 * "Mounted" is not "complete". These drive the real component: several
 * DIFFERENT products into one cart, quantities edited, a line removed, the
 * badge counting, search and filter leaving the basket alone, a refresh
 * restoring it, a held product refusing to be added, and the agreement
 * standing between the cart and a quote.
 *
 * The strictest assertions here are the NEGATIVE ones. Browser Back and
 * Forward move between steps and must never POST anything: no quote, no
 * checkout, no fresh idempotency key, no settlement. A checkout the customer
 * did not ask for is the worst bug this journey could have.
 */

const CART_KEY = "xenios.research.earlyAccess.cart.v1";

const PRODUCTS: readonly EarlyAccessCardProduct[] = [
  {
    productId: "prod-1",
    variantId: "var-1",
    name: "Alpha Research Material",
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "Alpha description",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 20,
  },
  {
    productId: "prod-2",
    variantId: "var-2",
    name: "Beta Research Material",
    strength: "5 mg",
    unitPriceCents: 3_350,
    currency: "USD",
    description: "Beta description",
    availability: "AVAILABLE",
    purchasable: true,
    quantityLimit: 20,
  },
  {
    productId: "prod-3",
    variantId: "var-3",
    name: "Gamma Research Material",
    strength: "10 mg",
    unitPriceCents: null,
    currency: "USD",
    description: "Gamma description",
    availability: "TEMPORARILY_HELD",
    purchasable: false,
    quantityLimit: null,
  },
] as unknown as readonly EarlyAccessCardProduct[];

let container: HTMLElement;
let root: Root;
let posted: Array<{ path: string; body: unknown }>;

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

/** Answers the agreement probe as ACCEPTED, and records every POST. */
function stubFetch(accepted = true) {
  posted = [];
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      posted.push({ path, body: init.body === undefined ? null : JSON.parse(String(init.body)) });
      if (path.endsWith("/agreements/accept")) {
        return jsonResponse({ ok: true, kind: "early_access_terms", version: "v1" });
      }
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/research/policies")) {
      return jsonResponse({
        policies: {
          "research-use": { title: "Research Use Policy", updated: "July 2026", sections: [] },
          terms: { title: "Terms of Service", updated: "July 2026", sections: [] },
          privacy: { title: "Privacy Policy", updated: "July 2026", sections: [] },
        },
      });
    }
    if (path.endsWith("/early-access/agreements")) {
      return jsonResponse({
        ok: true,
        required: [{ kind: "early_access_terms", version: "v1" }],
        accepted,
      });
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
  return stub;
}

async function settle(): Promise<void> {
  for (let pass = 0; pass < 10; pass += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountJourney(): Promise<void> {
  await act(async () => {
    root.render(
      <EarlyAccessMultiCartJourney products={PRODUCTS} onExitEarlyAccess={() => {}} />,
    );
  });
  await settle();
}

function text(): string {
  return container.textContent ?? "";
}

function buttons(label: string): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button")).filter(
    (button) => (button.textContent ?? "").trim() === label,
  ) as HTMLButtonElement[];
}

function cardFor(name: string): HTMLElement {
  const article = Array.from(container.querySelectorAll("article")).find((element) =>
    (element.textContent ?? "").includes(name),
  );
  if (!article) throw new Error(`no card rendered for ${name}`);
  return article as HTMLElement;
}

async function click(element: Element): Promise<void> {
  await act(async () => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await settle();
}

async function addToCart(name: string): Promise<void> {
  const card = cardFor(name);
  const add = Array.from(card.querySelectorAll("button")).find(
    (button) => (button.textContent ?? "").trim() === "Add to cart",
  );
  if (!add) throw new Error(`no Add to cart control on ${name}`);
  await click(add);
}

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  window.sessionStorage.clear();
  window.history.replaceState(null, "", "/research/early-access");
  // jsdom does not implement scrollTo; the journey calls it on every step.
  vi.stubGlobal("scrollTo", () => {});
  window.scrollTo = (() => {}) as typeof window.scrollTo;
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
});

describe("the cart holds several different products", () => {
  it("adds two DIFFERENT products, counts them, and survives a search and a filter", async () => {
    stubFetch();
    await mountJourney();

    await addToCart("Alpha Research Material");
    await addToCart("Beta Research Material");

    // The badge counts distinct products and total units, both from the store.
    expect(text()).toContain("2 products");
    expect(text()).toContain("2 units");

    const stored = JSON.parse(window.sessionStorage.getItem(CART_KEY) ?? "{}");
    expect(stored.items).toHaveLength(2);

    // A search that hides a card must not remove it from the cart.
    const search = container.querySelector("#early-access-cart-search") as HTMLInputElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "Alpha");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    expect(text()).toContain("2 products");

    // And neither must a filter.
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(search, "");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    const heldFilter = Array.from(container.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").startsWith("Held"),
    )!;
    await click(heldFilter);
    expect(text()).toContain("2 products");
    expect(JSON.parse(window.sessionStorage.getItem(CART_KEY) ?? "{}").items).toHaveLength(2);
  });

  it("refuses to add a HELD product: there is no control to add it", async () => {
    stubFetch();
    await mountJourney();
    const card = cardFor("Gamma Research Material");
    expect(card.textContent).toContain("Temporarily unavailable");
    expect(
      Array.from(card.querySelectorAll("button")).map((button) => (button.textContent ?? "").trim()),
    ).not.toContain("Add to cart");
    // And nothing about it is priced, so it cannot read as an offer.
    expect(card.textContent).toContain("Not available to order");
  });

  it("edits a quantity and removes a line from the cart panel", async () => {
    stubFetch();
    await mountJourney();
    await addToCart("Alpha Research Material");
    await addToCart("Beta Research Material");
    await click(buttons("View cart (2)")[0]!);

    const select = container.querySelector("#cart-qty-var-1") as HTMLSelectElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
      setter.call(select, "3");
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await settle();
    let stored = JSON.parse(window.sessionStorage.getItem(CART_KEY) ?? "{}");
    expect(stored.items.find((item: { variantId: string }) => item.variantId === "var-1").quantity).toBe(3);
    expect(text()).toContain("4 units");

    await click(buttons("Remove")[0]!);
    stored = JSON.parse(window.sessionStorage.getItem(CART_KEY) ?? "{}");
    expect(stored.items).toHaveLength(1);
    expect(text()).toContain("1 products");
  });

  it("restores the cart after a REFRESH, from the browser store alone", async () => {
    stubFetch();
    await mountJourney();
    await addToCart("Alpha Research Material");
    await addToCart("Beta Research Material");

    // Unmount and remount: exactly what a refresh does to this component.
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mountJourney();
    expect(text()).toContain("2 products");
  });
});

describe("the agreement stands between the cart and a quote", () => {
  it("refuses Continue to shipping until the policy is accepted, and says where it is", async () => {
    stubFetch(false);
    await mountJourney();
    await addToCart("Alpha Research Material");
    await click(buttons("View cart (1)")[0]!);
    await click(buttons("Continue to shipping")[0]!);

    // Sent back to the step that carries the acceptance, and told so.
    expect(text()).toContain("Research Use Policy must be accepted");
    expect(container.querySelector('[data-testid="early-access-cart-agreement-mount"]')).not.toBeNull();
    // Nothing was quoted.
    expect(posted.filter((entry) => entry.path.includes("/cart/quote"))).toEqual([]);
  });

  it("lets the cart continue once the server says the policy is on file", async () => {
    stubFetch(true);
    await mountJourney();
    await addToCart("Alpha Research Material");
    await click(buttons("View cart (1)")[0]!);
    await click(buttons("Continue to shipping")[0]!);
    expect(text()).toContain("Contact & Shipping");
  });
});

describe("F6 J: history carries exactly earlyAccess and step", () => {
  it("every navigation writes a state with those two keys and nothing else", async () => {
    stubFetch();
    await mountJourney();
    expect(readEarlyAccessHistoryState(window.history.state)).toEqual({
      earlyAccess: true,
      step: "catalog",
    });

    await addToCart("Alpha Research Material");
    await click(buttons("View cart (1)")[0]!);
    const state = window.history.state as Record<string, unknown>;
    expect(Object.keys(state).sort()).toEqual(["earlyAccess", "step"]);
    expect(state.step).toBe("cart");

    // No contact, address, money, identity or key ever reaches history.
    const serialized = JSON.stringify(state);
    for (const forbidden of ["email", "phone", "line1", "customerRef", "idempotencyKey", "Cents"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

describe("Back and Forward move, and never buy", () => {
  it("a popstate to any step POSTs nothing and mints no idempotency key", async () => {
    stubFetch();
    await mountJourney();
    await addToCart("Alpha Research Material");
    await click(buttons("View cart (1)")[0]!);
    const postsBefore = posted.length;

    // Walk backward and forward across every step the customer could reach,
    // including the two that require a checkout that does not exist.
    for (const step of ["catalog", "cart", "details", "review", "payment", "status", "cart"]) {
      await act(async () => {
        window.dispatchEvent(
          new PopStateEvent("popstate", { state: { earlyAccess: true, step } }),
        );
      });
      await settle();
    }

    expect(posted.length).toBe(postsBefore);
    expect(posted.filter((entry) => entry.path.includes("/cart/quote"))).toEqual([]);
    expect(posted.filter((entry) => entry.path.includes("/cart/checkout"))).toEqual([]);
    // And no attempt key was created, so no checkout could have been started.
    expect(window.sessionStorage.getItem(CART_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LAST_CART_CHECKOUT_STORAGE_KEY)).toBeNull();
  });

  it("a popstate to review or payment without a quote or a checkout lands on a REACHABLE step", async () => {
    stubFetch();
    await mountJourney();
    await addToCart("Alpha Research Material");

    await act(async () => {
      window.dispatchEvent(
        new PopStateEvent("popstate", { state: { earlyAccess: true, step: "payment" } }),
      );
    });
    await settle();
    // Not "Payment": there is no checkout, so the guard refuses to render a
    // step whose data does not exist rather than showing an empty one.
    expect(text()).not.toContain("Use the payment reference");
    expect(posted.filter((entry) => entry.path.includes("/cart/checkout"))).toEqual([]);
  });

  // Found in a browser: signing out and unlocking again restored the `status`
  // step from a stale history entry, with no checkout to show. The guard that
  // refuses exactly that ran on popstate and on navigate, never on MOUNT.
  it("a stale history entry does not survive a remount: an impossible step is corrected on arrival", async () => {
    stubFetch();
    for (const step of ["status", "payment", "review", "details", "cart"]) {
      window.sessionStorage.clear();
      window.history.replaceState({ earlyAccess: true, step }, "", "/research/early-access");
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await mountJourney();

      // Every one of those steps needs a quote, a checkout or a basket, and
      // this browser has none, so the only honest place to land is the shelf.
      expect(text()).toContain("Research Catalogue");
      expect(window.history.state).toEqual({ earlyAccess: true, step: "catalog" });
      expect(posted.filter((entry) => entry.path.includes("/cart/"))).toEqual([]);
    }
  });

  it("a reachable history entry is preserved on mount, so recovery still works", async () => {
    stubFetch();
    window.sessionStorage.setItem(
      CART_KEY,
      JSON.stringify({ version: 1, items: [{ productId: "prod-1", variantId: "var-1", quantity: 1 }] }),
    );
    window.history.replaceState({ earlyAccess: true, step: "cart" }, "", "/research/early-access");
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await mountJourney();
    // The basket exists, so `cart` is a step this browser can actually be on.
    expect(window.history.state).toEqual({ earlyAccess: true, step: "cart" });
    expect(text()).toContain("Your cart");
  });

  it("a foreign or malformed history state falls back to the catalogue rather than throwing", async () => {
    stubFetch();
    await mountJourney();
    for (const state of [null, {}, { earlyAccess: true }, { earlyAccess: true, step: "nope" }, { earlyAccess: true, step: "cart", email: "x@y.z" }]) {
      await act(async () => {
        window.dispatchEvent(new PopStateEvent("popstate", { state }));
      });
      await settle();
      expect(text()).toContain("Research Catalogue");
    }
  });
});

describe("F6 K: malformed browser state fails closed", () => {
  it("a corrupt cart is discarded, its key removed, and nothing is submitted", async () => {
    stubFetch();
    for (const corrupt of [
      "not json at all",
      JSON.stringify({ version: 2, items: [] }),
      JSON.stringify({ version: 1, items: [{ productId: "p", variantId: "v", quantity: 99 }] }),
      JSON.stringify({ version: 1, items: [{ productId: "p", variantId: "v", quantity: 1, email: "x@y.z" }] }),
      JSON.stringify({ version: 1, items: [
        { productId: "p", variantId: "v", quantity: 1 },
        { productId: "p", variantId: "v", quantity: 2 },
      ] }),
    ]) {
      window.sessionStorage.setItem(CART_KEY, corrupt);
      await act(async () => {
        root.unmount();
      });
      root = createRoot(container);
      await mountJourney();

      expect(text()).toContain("0 products");
      expect(window.sessionStorage.getItem(CART_KEY)).toBeNull();
      expect(posted.filter((entry) => entry.path.includes("/cart/"))).toEqual([]);
    }
  });

  it("a malformed attempt key or checkout pointer is removed rather than replayed", async () => {
    stubFetch();
    window.sessionStorage.setItem(CART_ATTEMPT_STORAGE_KEY, "not-a-key");
    window.sessionStorage.setItem(LAST_CART_CHECKOUT_STORAGE_KEY, "XEC-lowercase-and-short");
    await mountJourney();

    expect(window.sessionStorage.getItem(CART_ATTEMPT_STORAGE_KEY)).toBeNull();
    expect(window.sessionStorage.getItem(LAST_CART_CHECKOUT_STORAGE_KEY)).toBeNull();
    // A malformed pointer must not be looked up, and must not be submitted.
    expect(posted).toEqual([]);
  });
});
