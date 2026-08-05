import { describe, expect, it } from "vitest";

import { loadEarlyAccessCatalog } from "./earlyAccessCatalog";
import type {
  EarlyAccessStorefront,
  EarlyAccessStorefrontUnit,
} from "../../../../server/research/early-access/release/storefront-view";

/**
 * THE CONTRACT BETWEEN THE SERVER PROJECTION AND THE BROWSER READER.
 *
 * Why this file exists. Both sides were fully covered by their own tests and
 * both suites passed, while the storefront rendered NO products in a real
 * browser. The server answered with its rows under `units`; the reader accepted
 * only `rows` or `products` and reported the payload unreadable. Separately, the
 * reader re-derived availability from `blockers` and `supplierReady`, two fields
 * the server does not send, so every row would have resolved to
 * TEMPORARILY_HELD even once the key was found. Neither suite could see it,
 * because each tested its own side against its own fixtures.
 *
 * So the fixtures here are typed as the SERVER's own exported types. A rename on
 * the server side stops compiling this file; a rename on the reader side fails
 * its assertions. That is the whole point: the drift has to break something.
 */

const BASE_UNIT: EarlyAccessStorefrontUnit = {
  productId: "PEX-001",
  variantId: "R360-EXAMPLE-10MG-VIAL",
  slug: "example",
  displayName: "Example Research Material",
  canonicalName: "Example Research Material",
  sku: "R360-EXAMPLE-10MG-VIAL",
  strength: "10 mg",
  presentation: "Single vial, 10 mg",
  description: "An example unit.",
  imageState: "none",
  quantityLimit: 3,
  state: "purchasable",
  priceCents: 4750,
  currency: "USD",
  basis: "founder_release",
  releaseId: "rel-example",
  productVersion: "v1",
  productControlBlockers: [],
  waivedBlockers: [],
  hold: null,
  availability: "AVAILABLE",
  purchasable: true,
};

const HELD_UNIT: EarlyAccessStorefrontUnit = {
  ...BASE_UNIT,
  productId: "PEX-028",
  variantId: "R360-CAGRILINTIDE-10MG-VIAL",
  slug: "cagrilintide",
  displayName: "Cagrilintide",
  canonicalName: "Cagrilintide Research Material",
  sku: "R360-CAGRILINTIDE-10MG-VIAL",
  state: "held",
  priceCents: null,
  currency: "",
  basis: null,
  releaseId: null,
  productVersion: null,
  hold: "NO_FOUNDER_RELEASE",
  availability: "TEMPORARILY_HELD",
  purchasable: false,
};

function storefront(units: readonly EarlyAccessStorefrontUnit[]): EarlyAccessStorefront {
  const held = units.filter((unit) => !unit.purchasable).length;
  return {
    evaluatedAt: "2026-08-05T00:00:00.000Z",
    units,
    purchasableCount: units.length - held,
    heldCount: held,
    availableCount: units.filter((unit) => unit.availability === "AVAILABLE").length,
    confirmationRequiredCount: units.filter(
      (unit) => unit.availability === "AVAILABILITY_CONFIRMATION_REQUIRED",
    ).length,
    temporarilyHeldCount: units.filter((unit) => unit.availability === "TEMPORARILY_HELD").length,
  };
}

/** Answers exactly as the mounted route does, with the body the server builds. */
function serverAnswers(body: EarlyAccessStorefront) {
  return async <T>() => ({ kind: "ok" as const, data: { ok: true, ...body } as T });
}

describe("the browser reads what the server actually sends", () => {
  it("finds the rows the server sent, under the key the server uses", async () => {
    const result = await loadEarlyAccessCatalog(serverAnswers(storefront([BASE_UNIT, HELD_UNIT])));

    // The failure this pins: `unreadable` here meant an empty storefront in
    // production while every other test stayed green.
    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.received).toBe(2);
    expect(result.dropped).toBe(0);
  });

  it("renders a purchasable unit as available, with the server's price", async () => {
    const result = await loadEarlyAccessCatalog(serverAnswers(storefront([BASE_UNIT])));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const [product] = result.products;
    expect(product.availability).toBe("AVAILABLE");
    expect(product.unitPriceCents).toBe(4750);
  });

  it("renders a founder-held unit as held, with no price", async () => {
    const result = await loadEarlyAccessCatalog(serverAnswers(storefront([HELD_UNIT])));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    const [product] = result.products;
    expect(product.availability).toBe("TEMPORARILY_HELD");
    expect(product.unitPriceCents).toBeNull();
  });

  it("holds a unit the server did not mark purchasable, whatever its state says", async () => {
    // Two fields must agree. A single wrong field cannot open a purchase path.
    const contradictory: EarlyAccessStorefrontUnit = { ...BASE_UNIT, purchasable: false };
    const result = await loadEarlyAccessCatalog(serverAnswers(storefront([contradictory])));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.products[0]?.availability).toBe("TEMPORARILY_HELD");
  });

  it("holds a unit whose availability is not one this browser knows", async () => {
    const unknown = { ...BASE_UNIT, availability: "SOMETHING_NEW" } as unknown;
    const body = { ...storefront([BASE_UNIT]), units: [unknown] } as EarlyAccessStorefront;
    const result = await loadEarlyAccessCatalog(serverAnswers(body));

    expect(result.kind).toBe("ok");
    if (result.kind !== "ok") return;
    expect(result.products[0]?.availability).toBe("TEMPORARILY_HELD");
  });
});
