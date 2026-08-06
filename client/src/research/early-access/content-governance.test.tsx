// @vitest-environment jsdom
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import {
  EarlyAccessProductCard,
  type EarlyAccessCardProduct,
} from "./EarlyAccessProductCard";
import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import { toCardProducts, type EarlyAccessCatalogRowView } from "./earlyAccessCatalogView";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";

/**
 * CONTENT GOVERNANCE for the compact catalogue slice.
 *
 * The founder decision this file enforces: the client AUTHORS NO PRODUCT
 * CONTENT. The server is the only source of product description truth. The
 * browser renders a description the server sent, verbatim, or renders nothing
 * in its place; it never infers copy from a product's name, never keeps its own
 * description table, and never adds dosing, administration, therapeutic,
 * disease, benefit or outcome language of its own.
 *
 * Two kinds of proof below:
 *  - source scans over every shipped (non-test) file in this directory, so a
 *    hard-coded description table or a second copy of the server's placeholder
 *    cannot land here quietly;
 *  - rendered-text scans over the catalogue chrome with all server content
 *    blanked, so every remaining word on the screen is client-authored, and
 *    none of it may be clinical.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

/** Every shipped source in this directory. Tests excluded: fixtures name products. */
function shippedSources(): Array<{ file: string; text: string }> {
  return readdirSync(HERE)
    .filter((file) => /\.(ts|tsx)$/.test(file) && !/\.test\.(ts|tsx)$/.test(file))
    .map((file) => ({ file, text: readFileSync(path.join(HERE, file), "utf8") }));
}

/**
 * The opening set's product names. If one of these ever appears in a shipped
 * client source, the client has started keeping product facts of its own.
 */
const PRODUCT_NAMES = [
  "AOD-9604",
  "BPC-157",
  "Cagrilintide",
  "DSIP",
  "GHK-Cu",
  "Hexarelin",
  "Ipamorelin",
  "Kisspeptin",
  "KPV",
  "L-Glutathione",
  "MOTS-c",
  "NAD+",
  "Oxytocin",
  "PT-141",
  "Selank",
  "Semax",
  "Sermorelin",
  "Tesamorelin",
  "Thymosin",
];

/**
 * Dosing, administration and therapeutic-claim language. None of it may be
 * client-authored, anywhere a customer can read.
 */
const PROHIBITED_RENDERED = [
  "mg/kg",
  "mcg/kg",
  "dose",
  "dosage",
  "inject",
  "injection",
  "subcutaneous",
  "intramuscular",
  "intravenous",
  "take daily",
  "administer",
  "treats",
  "cures",
  "heals",
  "for patients",
  "for human use",
  "for veterinary use",
];

/**
 * The same list for shipped sources, minus the bare "inject" stem: these files
 * legitimately describe dependency-injected test seams in comments, and a
 * comment is not customer copy. The rendered-text scan above still catches the
 * stem anywhere it could actually be read.
 */
const PROHIBITED_IN_SOURCE = PROHIBITED_RENDERED.filter((term) => term !== "inject");

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

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function settle(): Promise<void> {
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function product(overrides: Partial<EarlyAccessCardProduct> = {}): EarlyAccessCardProduct {
  return {
    productId: "prod-x",
    variantId: "var-x",
    name: "Example Unit",
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "",
    availability: "AVAILABLE",
    ...overrides,
  };
}

describe("the client introduces no product-specific description facts", () => {
  it("ships no product name, no description table, and no research-claim scaffolding", () => {
    for (const { file, text } of shippedSources()) {
      for (const name of PRODUCT_NAMES) {
        expect(text, `${file} carries the product name "${name}"`).not.toContain(name);
      }
      expect(text, `${file} authors research-focus copy`).not.toContain("Research focus");
    }
  });

  it("keeps exactly one client copy of the fulfillment sentence and no copy of the server's placeholder", () => {
    // The placeholder "…still being confirmed." belongs to the server. A second
    // client-side copy would be a fork that drifts the moment either changes.
    const carriers = shippedSources().filter(({ text }) =>
      text.includes("still being confirmed"),
    );
    expect(carriers.map(({ file }) => file)).toEqual([]);

    const fulfillmentCarriers = shippedSources().filter(({ text }) =>
      text.includes("Current fulfillment target:"),
    );
    expect(fulfillmentCarriers.map(({ file }) => file)).toEqual(["fulfillment-copy.ts"]);
  });

  it("adds no dosing, administration or therapeutic language in shipped sources", () => {
    for (const { file, text } of shippedSources()) {
      const lower = text.toLowerCase();
      for (const term of PROHIBITED_IN_SOURCE) {
        expect(lower, `${file} contains prohibited language "${term}"`).not.toContain(term);
      }
    }
  });
});

describe("the card renders the server's description, or nothing", () => {
  it("renders a server-supplied description verbatim", () => {
    const el = render(
      <EarlyAccessProductCard
        product={product({
          description: "Product information for this item is still being confirmed.",
        })}
        quantity={1}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(
      el.querySelector("[data-testid='early-access-product-card-description']")?.textContent,
    ).toBe("Product information for this item is still being confirmed.");
  });

  it("stays truthful when the server sends no description: absence renders as absence", () => {
    const el = render(
      <EarlyAccessProductCard
        product={product({ description: "" })}
        quantity={1}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
    expect(el.querySelector("[data-testid='early-access-product-card-description']")).toBeNull();
  });

  it("does not infer a description from the product name", () => {
    const el = render(
      <EarlyAccessProductCard
        product={product({ name: "Novel Peptide Z", description: "" })}
        quantity={1}
        onQuantityChange={() => {}}
        onSelect={() => {}}
      />,
    );
    // The name appears as the heading and inside the controls' accessible
    // labels. No prose element picks it up and writes about it.
    const prose = Array.from(el.querySelectorAll("p")).map((node) => node.textContent ?? "");
    for (const text of prose) {
      expect(text, `invented prose about the product: "${text}"`).not.toContain("Novel Peptide Z");
    }
  });
});

describe("every client-authored word on the catalogue is nonclinical", () => {
  it("renders a full catalogue of chrome with no prohibited language anywhere", async () => {
    // Descriptions are blanked, so every word rendered below is the client's
    // own: toolbar, counts, statuses, buttons, fulfillment framing, summary.
    // The fulfillment sentence itself is the canonical server wording, passed
    // through unchanged, and it is part of what must stay clean.
    const rows: EarlyAccessCatalogRowView[] = [
      {
        productId: "p1",
        variantId: "v1",
        displayName: "Unit One",
        strength: "10 mg",
        priceCents: 5_000,
        currency: "USD",
        description: "",
        availability: "AVAILABLE",
        purchasable: true,
      },
      {
        productId: "p2",
        variantId: "v2",
        displayName: "Unit Two",
        strength: "5 mg",
        priceCents: null,
        currency: "USD",
        description: "",
        availability: "TEMPORARILY_HELD",
        purchasable: false,
      },
      {
        productId: "p3",
        variantId: "v3",
        displayName: "Unit Three",
        strength: "2 mg",
        priceCents: 2_000,
        currency: "USD",
        description: "",
        availability: "AVAILABILITY_CONFIRMATION_REQUIRED",
        purchasable: true,
      },
    ];
    const { products, dropped } = toCardProducts(rows);
    const el = render(
      <EarlyAccessCatalogSection
        fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
        load={() => Promise.resolve({ kind: "ok" as const, products, dropped, received: 3 })}
      />,
    );
    await settle();

    // Exercise the selected state too, so its copy is scanned as well.
    const add = el.querySelector<HTMLButtonElement>(
      "[data-testid='early-access-catalog-card-v1-action']",
    );
    act(() => add?.click());

    const text = (el.textContent ?? "").toLowerCase();
    for (const term of PROHIBITED_RENDERED) {
      expect(text, `catalogue chrome contains prohibited language "${term}"`).not.toContain(term);
    }
  });
});
