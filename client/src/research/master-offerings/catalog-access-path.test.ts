import { describe, expect, it } from "vitest";
import { MASTER_OFFERING_DISPLAY_STATES } from "@shared/research/master-offerings/contract";
import { CUSTOMER_ACTIONS } from "@shared/research/launch/customer-action";
import {
  CATALOG_ACCESS_PATHS,
  CATALOG_ACCESS_PATH_DESCRIPTIONS,
  CATALOG_ACCESS_PATH_LABELS,
  accessPathCountsOnPage,
  accessPathOfVariant,
  accessPathsOfCard,
  isCatalogAccessPath,
  isContradictoryPurchase,
  refineCardsByAccessPath,
} from "./catalog-access-path";
import { ACTIONS, ADD_TO_CART, ON_REQUEST, card, variant } from "./catalog-test-fixtures";

describe("catalog access path vocabulary", () => {
  it("is exactly the six-word customer vocabulary, with a label and a description for each", () => {
    expect(CATALOG_ACCESS_PATHS).toEqual(CUSTOMER_ACTIONS);
    for (const path of CATALOG_ACCESS_PATHS) {
      expect(CATALOG_ACCESS_PATH_LABELS[path]).toMatch(/\S/);
      expect(CATALOG_ACCESS_PATH_DESCRIPTIONS[path]).toMatch(/\S/);
    }
    expect(isCatalogAccessPath("BUY_NOW")).toBe(true);
    expect(isCatalogAccessPath("buy_now")).toBe(false);
    expect(isCatalogAccessPath("live")).toBe(false);
    expect(isCatalogAccessPath(null)).toBe(false);
  });

  it("never makes a clinical, stock, price, or wholesale claim in its copy", () => {
    const copy = [
      ...Object.values(CATALOG_ACCESS_PATH_LABELS),
      ...Object.values(CATALOG_ACCESS_PATH_DESCRIPTIONS),
    ].join(" ");
    expect(copy).not.toMatch(/in stock|ships today|wholesale|cures?|treats?|clinically proven|\$\d/i);
  });

  it("restates the server action and can only downgrade it", () => {
    expect(accessPathOfVariant(variant({ action: ADD_TO_CART }))).toBe("BUY_NOW");
    expect(accessPathOfVariant(variant({ action: ADD_TO_CART, price: ON_REQUEST }))).toBe(
      "REQUEST_QUOTE",
    );
    expect(accessPathOfVariant(variant({ action: ACTIONS.request_access }))).toBe("ASSISTED_ORDER");
    expect(
      accessPathOfVariant(variant({ action: ACTIONS.request_access, price: ON_REQUEST })),
    ).toBe("REQUEST_QUOTE");
    expect(accessPathOfVariant(variant({ action: ACTIONS.explore_care }))).toBe("CARE");
    expect(accessPathOfVariant(variant({ action: ACTIONS.notify_me }))).toBe("TEMPORARILY_HELD");
    expect(accessPathOfVariant(variant({ action: ACTIONS.join_waitlist }))).toBe("TEMPORARILY_HELD");
    expect(accessPathOfVariant(variant({ action: ACTIONS.get_updates }))).toBe("NOT_AVAILABLE");
    expect(accessPathOfVariant(variant({ action: ACTIONS.none }))).toBe("NOT_AVAILABLE");
  });

  it("treats a purchase on any state other than available_now as a contradiction, and downgrades it to Not available", () => {
    for (const displayState of MASTER_OFFERING_DISPLAY_STATES) {
      const row = variant({ displayState, action: ADD_TO_CART });
      const contradictory = displayState !== "available_now";
      expect(isContradictoryPurchase(row)).toBe(contradictory);
      expect(accessPathOfVariant(row)).toBe(contradictory ? "NOT_AVAILABLE" : "BUY_NOW");
      // A non-purchase action is never a contradiction, whatever the state.
      expect(isContradictoryPurchase(variant({ displayState, action: ACTIONS.request_access }))).toBe(false);
    }
  });

  it("lists a card's paths in vocabulary order without duplicates", () => {
    const product = card({
      variants: [
        variant({ id: "mov_1", action: ACTIONS.none }),
        variant({ id: "mov_2", action: ACTIONS.request_access }),
        variant({ id: "mov_3", action: ACTIONS.request_access }),
        variant({ id: "mov_4", action: ADD_TO_CART }),
      ],
    });
    expect(accessPathsOfCard(product)).toEqual(["BUY_NOW", "ASSISTED_ORDER", "NOT_AVAILABLE"]);
  });

  it("refines a page by any-variant match and keeps every variant of a shown card", () => {
    const buy = card({ id: "mo_buy", variants: [variant({ id: "mov_1", action: ADD_TO_CART }), variant({ id: "mov_2", action: ACTIONS.none })] });
    const care = card({ id: "mo_care", variants: [variant({ id: "mov_3", action: ACTIONS.explore_care })] });
    const held = card({ id: "mo_held", variants: [variant({ id: "mov_4", action: ACTIONS.notify_me })] });
    const products = [buy, care, held];
    expect(refineCardsByAccessPath(products, null)).toBe(products);
    expect(refineCardsByAccessPath(products, "BUY_NOW")).toEqual([buy]);
    expect(refineCardsByAccessPath(products, "NOT_AVAILABLE")).toEqual([buy]);
    expect(refineCardsByAccessPath(products, "CARE")).toEqual([care]);
    expect(refineCardsByAccessPath(products, "TEMPORARILY_HELD")).toEqual([held]);
    expect(refineCardsByAccessPath(products, "REQUEST_QUOTE")).toEqual([]);
    // Shown cards are the same objects, variants intact: nothing is merged or trimmed.
    expect(refineCardsByAccessPath(products, "BUY_NOW")[0]?.variants.length).toBe(2);
  });

  it("counts cards per path on the page, keeping zeros", () => {
    const counts = accessPathCountsOnPage([
      card({ id: "a", variants: [variant({ action: ADD_TO_CART })] }),
      card({ id: "b", variants: [variant({ action: ADD_TO_CART }), variant({ id: "x", action: ACTIONS.explore_care })] }),
    ]);
    expect(counts.get("BUY_NOW")).toBe(2);
    expect(counts.get("CARE")).toBe(1);
    expect(counts.get("REQUEST_QUOTE")).toBe(0);
    expect(counts.size).toBe(CATALOG_ACCESS_PATHS.length);
  });
});
