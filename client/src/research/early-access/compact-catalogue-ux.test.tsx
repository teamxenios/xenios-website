// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import EarlyAccessRoute from "./EarlyAccessRoute";
import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import { toCardProducts, type EarlyAccessCatalogRowView } from "./earlyAccessCatalogView";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";

/**
 * THE COMPACT CATALOGUE UX, proven against the live catalogue's shape.
 *
 * The fixture below mirrors the production state this pilot runs against:
 * 22 visible units, 18 purchasable, 4 held. Nothing in these tests overrides
 * what the server decided; every count is computed from the rows, and the row
 * that arrives "AVAILABLE but not purchasable" must land on the held side,
 * because two independent server fields must agree before anything sells.
 */

const FULFILLMENT = EARLY_ACCESS_FULFILLMENT_TARGET_COPY;

const APPROVED: ReadonlyArray<readonly [string, string, number]> = [
  ["AOD-9604", "5 mg", 5_600],
  ["BPC-157", "5 mg", 3_350],
  ["BPC-157", "10 mg", 4_750],
  ["Cagrilintide", "10 mg", 14_000],
  ["DSIP", "10 mg", 7_000],
  ["GHK-Cu", "50 mg", 2_250],
  ["GHK-Cu", "100 mg", 4_200],
  ["Hexarelin", "10 mg", 8_400],
  ["Ipamorelin", "10 mg", 4_750],
  ["Kisspeptin", "10 mg", 7_000],
  ["KPV", "10 mg", 5_050],
  ["L-Glutathione", "500 mg", 4_475],
  ["MOTS-c", "10 mg", 4_475],
  ["NAD+", "500 mg", 7_000],
  ["NAD+", "1,000 mg", 10_075],
  ["Oxytocin", "5 mg", 4_475],
  ["PT-141", "10 mg", 3_925],
  ["Selank", "10 mg", 5_325],
  ["Semax", "10 mg", 5_325],
  ["Sermorelin", "5 mg", 5_050],
  ["Tesamorelin", "10 mg", 10_650],
  ["Thymosin Alpha 1", "10 mg", 10_650],
];

/** Held by the server's own availability state. */
const HELD_BY_STATE = new Set(["Cagrilintide 10 mg", "MOTS-c 10 mg", "NAD+ 500 mg"]);
/**
 * Marked AVAILABLE by one field but NOT purchasable by the other. The client
 * must treat the disagreement as held, never as sellable. With the three rows
 * above this makes the live 22 / 18 / 4 shape.
 */
const NOT_PURCHASABLE = new Set(["DSIP 10 mg"]);

function liveShapeRows(descriptions = "Lyophilised vial for research use."): EarlyAccessCatalogRowView[] {
  return APPROVED.map(([name, strength, priceCents], index) => {
    const key = `${name} ${strength}`;
    const held = HELD_BY_STATE.has(key);
    const purchasable = !held && !NOT_PURCHASABLE.has(key);
    return {
      productId: `prod-${index}`,
      variantId: `var-${index}`,
      displayName: name,
      strength,
      priceCents,
      currency: "USD",
      description: descriptions,
      availability: held ? "TEMPORARILY_HELD" : "AVAILABLE",
      purchasable,
    };
  });
}

let container: HTMLElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(element);
  });
  return container;
}

beforeEach(() => {
  // jsdom does not implement scrollIntoView; the route uses it to move the
  // customer to the continuation.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(rounds = 10): Promise<void> {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function mountSection(
  rows: EarlyAccessCatalogRowView[] = liveShapeRows(),
  extra: Partial<Parameters<typeof EarlyAccessCatalogSection>[0]> = {},
) {
  const { products, dropped } = toCardProducts(rows);
  const el = render(
    <EarlyAccessCatalogSection
      fulfillmentTargetCopy={FULFILLMENT}
      load={() =>
        Promise.resolve({ kind: "ok" as const, products, dropped, received: rows.length })
      }
      {...extra}
    />,
  );
  await settle(3);
  return el;
}

function setSearch(el: HTMLElement, value: string): void {
  const input = el.querySelector<HTMLInputElement>(
    "[data-testid='early-access-catalog-section-search']",
  );
  if (input === null) throw new Error("no search input");
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(el: HTMLElement, testid: string): void {
  const target = el.querySelector<HTMLButtonElement>(`[data-testid='${testid}']`);
  if (target === null) throw new Error(`nothing to press at ${testid}`);
  act(() => {
    target.click();
  });
}

function cards(el: HTMLElement): HTMLElement[] {
  return Array.from(el.querySelectorAll("article"));
}

describe("the toolbar counts come from the server's rows, not from this file", () => {
  it("counts All from the units the server returned", async () => {
    const el = await mountSection();
    const all = el.querySelector("[data-testid='early-access-catalog-section-filter-all']");
    expect(all?.getAttribute("data-count")).toBe("22");
    expect(all?.textContent).toContain("All 22");
    expect(cards(el)).toHaveLength(22);
  });

  it("counts Available strictly from unit purchasability", async () => {
    // 18, not 19: the row that said AVAILABLE while purchasable was false is
    // NOT available, whatever its label claimed.
    const el = await mountSection();
    expect(
      el
        .querySelector("[data-testid='early-access-catalog-section-filter-available']")
        ?.getAttribute("data-count"),
    ).toBe("18");
  });

  it("counts Held from the server state, including the non-purchasable disagreement", async () => {
    const el = await mountSection();
    expect(
      el
        .querySelector("[data-testid='early-access-catalog-section-filter-held']")
        ?.getAttribute("data-count"),
    ).toBe("4");
  });

  it("never overrides server purchasability client-side", async () => {
    // The disagreement row renders as held with no purchase surface at all.
    const el = await mountSection();
    const dsip = el.querySelector("[data-testid='early-access-catalog-card-var-4']");
    expect(dsip?.getAttribute("data-availability")).toBe("TEMPORARILY_HELD");
    expect(dsip?.querySelectorAll("button")).toHaveLength(0);
    expect(dsip?.textContent).not.toContain("$");
  });
});

describe("filters and search narrow what is shown, never what exists", () => {
  it("filters to available units on demand", async () => {
    const el = await mountSection();
    press(el, "early-access-catalog-section-filter-available");
    const shown = cards(el);
    expect(shown).toHaveLength(18);
    for (const card of shown) {
      expect(card.getAttribute("data-availability")).not.toBe("TEMPORARILY_HELD");
    }
  });

  it("filters to held units on demand, priceless and actionless", async () => {
    const el = await mountSection();
    press(el, "early-access-catalog-section-filter-held");
    const shown = cards(el);
    expect(shown).toHaveLength(4);
    for (const card of shown) {
      expect(card.getAttribute("data-availability")).toBe("TEMPORARILY_HELD");
      expect(card.querySelectorAll("button")).toHaveLength(0);
      expect(card.textContent).not.toContain("$");
    }
  });

  it("searches name and strength within the returned rows", async () => {
    const el = await mountSection();
    setSearch(el, "bpc");
    expect(cards(el)).toHaveLength(2);
    expect(el.textContent).toContain("BPC-157");

    setSearch(el, "1,000 mg");
    const byStrength = cards(el);
    expect(byStrength).toHaveLength(1);
    expect(byStrength[0].textContent).toContain("NAD+");
  });

  it("reports the shown-of-total count as a live status", async () => {
    const el = await mountSection();
    const status = el.querySelector("[data-testid='early-access-catalog-section-result-count']");
    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.textContent).toContain("Showing 22 of 22 products.");
    setSearch(el, "bpc");
    expect(
      el.querySelector("[data-testid='early-access-catalog-section-result-count']")?.textContent,
    ).toContain("Showing 2 of 22 products.");
  });

  it("renders an explicit empty result, never a blank grid, with one way back", async () => {
    const el = await mountSection();
    setSearch(el, "zzz-not-a-product");
    expect(cards(el)).toHaveLength(0);
    const empty = el.querySelector("[data-testid='early-access-catalog-section-no-matches']");
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain("No products match");
    press(el, "early-access-catalog-section-clear-filters");
    expect(cards(el)).toHaveLength(22);
  });

  it("keeps every toolbar control a native, keyboard-reachable element", async () => {
    const el = await mountSection();
    const search = el.querySelector<HTMLInputElement>(
      "[data-testid='early-access-catalog-section-search']",
    );
    expect(search?.tagName).toBe("INPUT");
    expect(search?.getAttribute("tabindex")).toBeNull();
    act(() => search?.focus());
    expect(document.activeElement).toBe(search);

    for (const which of ["all", "available", "held"] as const) {
      const button = el.querySelector<HTMLButtonElement>(
        `[data-testid='early-access-catalog-section-filter-${which}']`,
      );
      expect(button?.tagName).toBe("BUTTON");
      expect(button?.getAttribute("tabindex")).toBeNull();
      expect(button?.getAttribute("aria-pressed")).toBeDefined();
      act(() => button?.focus());
      expect(document.activeElement).toBe(button);
    }
  });
});

describe("the selection and its summary", () => {
  it("updates the selected count as products are added and removed", async () => {
    const el = await mountSection();
    press(el, "early-access-catalog-card-var-1-action");
    press(el, "early-access-catalog-card-var-14-action");
    const count = el.querySelector("[data-testid='early-access-selection-summary-count']");
    expect(count?.textContent).toContain("2 products");

    const remove = el.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-catalog-card-var-1-remove']",
    );
    expect(remove).not.toBeNull();
    act(() => remove?.click());
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-count']")?.textContent,
    ).toContain("1 product,");
  });

  it("derives the estimated subtotal from the exact server prices and chosen quantities", async () => {
    // NAD+ 1,000 mg arrives from the fixture at 10,075 cents, exactly as the
    // server priced it. Two of it plus one BPC-157 5 mg at 3,350 is 23,500
    // cents. No other figure may appear as the subtotal.
    const el = await mountSection();
    const nadCard = el.querySelector("[data-testid='early-access-catalog-card-var-14']");
    expect(nadCard?.textContent).toContain("$100.75");

    press(el, "early-access-catalog-card-var-14-quantity-increase");
    press(el, "early-access-catalog-card-var-14-action");
    press(el, "early-access-catalog-card-var-1-action");

    expect(
      el.querySelector("[data-testid='early-access-selection-summary-subtotal']")?.textContent,
    ).toBe("$235.00");
  });

  it("keeps the summary already-updated when a selected product's quantity changes", async () => {
    const el = await mountSection();
    press(el, "early-access-catalog-card-var-1-action");
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-subtotal']")?.textContent,
    ).toBe("$33.50");
    press(el, "early-access-catalog-card-var-1-quantity-increase");
    expect(
      el.querySelector("[data-testid='early-access-selection-summary-subtotal']")?.textContent,
    ).toBe("$67.00");
  });

  it("keeps the summary reachable without scrolling past the shelf", async () => {
    // Sticky on both form factors: a bottom bar while the single column
    // scrolls, a side rail beside the grid on desktop. The rail is a sibling
    // of the grid, not the 23rd card.
    const el = await mountSection();
    const rail = el.querySelector("[data-testid='early-access-catalog-section-summary-rail']");
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("sticky");
    expect(rail?.className).toContain("bottom-0");
    expect(rail?.className).toContain("lg:top-24");
    expect(rail?.closest("[data-testid='early-access-catalog']")).toBeNull();
  });

  it("hands the selection to the journey when Review order is pressed", async () => {
    const seen: unknown[] = [];
    const el = await mountSection(liveShapeRows(), {
      onReview: (lines) => seen.push(lines),
    });
    press(el, "early-access-catalog-card-var-1-action");
    press(el, "early-access-selection-summary-review");
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject([{ variantId: "var-1", quantity: 1, unitPriceCents: 3_350 }]);
  });

  it("holds Cagrilintide exactly as the server sent it: visible, held, unbuyable", async () => {
    const el = await mountSection();
    const cagri = el.querySelector("[data-testid='early-access-catalog-card-var-3']");
    expect(cagri?.textContent).toContain("Cagrilintide");
    expect(cagri?.getAttribute("data-availability")).toBe("TEMPORARILY_HELD");
    expect(cagri?.querySelectorAll("button")).toHaveLength(0);
    expect(cagri?.querySelectorAll("input")).toHaveLength(0);
    expect(cagri?.textContent).not.toContain("$");
    expect(cagri?.textContent).toContain("Temporarily unavailable");
  });
});

describe("compactness is structural, not stylistic accident", () => {
  it("renders the fulfillment sentence exactly once for the whole catalogue", async () => {
    const el = await mountSection();
    const occurrences = (el.textContent ?? "").split(FULFILLMENT).length - 1;
    expect(occurrences).toBe(1);
    expect(
      el.querySelectorAll("[data-testid='early-access-catalog-section-fulfillment']"),
    ).toHaveLength(1);
  });

  it("names the bundle offer once at catalogue level, not once per card", async () => {
    const el = await mountSection();
    const offers = (el.textContent ?? "").split(
      "Order three units as the Research Bundle",
    ).length - 1;
    expect(offers).toBe(1);
  });

  it("keeps the shelf inside minimum-width-safe wrappers so a phone never scrolls sideways", async () => {
    const el = await mountSection();
    const section = el.querySelector("[data-testid='early-access-catalog-section']");
    const grid = el.querySelector("[data-testid='early-access-catalog']");
    expect(grid?.className).toContain("min-w-0");
    expect(grid?.className).toContain("gap-4");
    // The two-column desktop split keeps the first column shrinkable.
    expect(section?.innerHTML).toContain("lg:grid-cols-[minmax(0,1fr)_300px]");
    // No card carries the old card-sized empty media block.
    expect(el.querySelector("[class*='aspect-square']")).toBeNull();
  });
});

/* ------------------------------------------------------------------ route */

const POLICIES = {
  "research-use": {
    title: "Research Use Policy",
    updated: "July 2026",
    sections: [
      {
        heading: "Purpose",
        paragraphs: [
          "Research materials listed through xenios are offered solely for legitimate nonclinical research, analytical, laboratory, or product-development purposes. They are not offered for human or veterinary use.",
        ],
      },
    ],
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => "application/json" },
    json: async () => body,
  } as unknown as Response;
}

function stubRouteFetch(options: { accepted: boolean; units?: EarlyAccessCatalogRowView[] }) {
  const answers = { accepted: options.accepted };
  const stub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (init?.method === "POST") {
      if (path.endsWith("/agreements/accept")) {
        answers.accepted = true;
        return jsonResponse({
          ok: true,
          kind: "early_access_terms",
          version: "v1",
          alreadyAccepted: false,
        });
      }
      return jsonResponse({ ok: true });
    }
    if (path.endsWith("/early-access/session")) {
      return jsonResponse({ authenticated: true, expiresAt: null });
    }
    if (path.endsWith("/research/policies")) {
      return jsonResponse({ policies: POLICIES });
    }
    if (path.endsWith("/early-access/agreements")) {
      return jsonResponse({
        ok: true,
        required: [{ kind: "early_access_terms", version: "v1" }],
        accepted: answers.accepted,
      });
    }
    if (path.endsWith("/early-access/catalog")) {
      return jsonResponse({ ok: true, units: options.units ?? liveShapeRows() });
    }
    return jsonResponse({ ok: true });
  });
  vi.stubGlobal("fetch", stub);
}

async function mountRoute(options: { accepted: boolean }): Promise<HTMLElement> {
  stubRouteFetch(options);
  const el = render(<EarlyAccessRoute />);
  await settle();
  return el;
}

describe("step 4, on the mounted route", () => {
  it("does not repeat the long welcome introduction above the shelf", async () => {
    const host = await mountRoute({ accepted: true });
    expect(host.querySelector("[data-testid='early-access-welcome']")).toBeNull();
    expect(host.textContent).not.toContain(
      "You are entering the private first release of Xenios Research.",
    );
    // The shelf is there in its place.
    expect(host.querySelectorAll("article").length).toBe(22);
  });

  it("still welcomes a customer who has not yet reached the catalogue", async () => {
    const host = await mountRoute({ accepted: false });
    expect(host.querySelector("[data-testid='early-access-welcome']")).not.toBeNull();
  });

  it("keeps the accepted policy to one line, with the document one disclosure away", async () => {
    const host = await mountRoute({ accepted: true });
    // Compact by default: the confirmation line, no unfolded policy body.
    expect(host.querySelector("[data-testid='early-access-agreement-accepted']")).not.toBeNull();
    expect(host.textContent).toContain("Research Use Policy accepted");
    expect(host.querySelector("[data-testid='early-access-agreement-policy']")).toBeNull();

    const toggle = host.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-agreement-view-policy']",
    );
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("tabindex")).toBeNull();
    act(() => toggle?.focus());
    expect(document.activeElement).toBe(toggle);

    // One press exposes the EXACT served document.
    act(() => toggle?.click());
    expect(toggle?.getAttribute("aria-expanded")).toBe("true");
    expect(host.querySelector("[data-testid='early-access-agreement-policy']")).not.toBeNull();
    expect(host.textContent).toContain("They are not offered for human or veterinary use.");

    // And one more press folds it away again.
    act(() => toggle?.click());
    expect(host.querySelector("[data-testid='early-access-agreement-policy']")).toBeNull();
  });

  it("renders the fulfillment sentence exactly once on the whole step", async () => {
    const host = await mountRoute({ accepted: true });
    const occurrences = (host.textContent ?? "").split(FULFILLMENT).length - 1;
    expect(occurrences).toBe(1);
  });

  it("keeps the selection summary present on the step without scrolling the shelf", async () => {
    const host = await mountRoute({ accepted: true });
    const rail = host.querySelector(
      "[data-testid='early-access-catalog-section-summary-rail']",
    );
    expect(rail).not.toBeNull();
    expect(rail?.className).toContain("sticky");
  });

  it("moves the customer to the journey's continuation when they ask to review", async () => {
    const host = await mountRoute({ accepted: true });
    press(host, "early-access-catalog-card-var-1-action");
    press(host, "early-access-selection-summary-review");
    expect(document.activeElement).toBe(
      host.querySelector("[data-testid='early-access-next-steps']"),
    );
  });
});
