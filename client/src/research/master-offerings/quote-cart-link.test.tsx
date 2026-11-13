// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { isMasterOfferingFamily } from "@shared/research/master-offerings/contract";
import { QUOTE_CART_PATH, quoteCartHref } from "@shared/research/master-offerings/quote-cart";
import { orderEntryIntentFromSearch } from "../early-access/orderEntryIntent";
import { accessPathOfVariant } from "./catalog-access-path";
import { ACTIONS, card, render, variant } from "./catalog-test-fixtures";
import { MasterOfferingCard } from "./MasterOfferingCard";
import { MasterOfferingVariantAction } from "./MasterOfferingDetail";

type Row = { family: string; slug: string; variants: { id: string }[] };
function datasetRows(): Row[] {
  const parsed = JSON.parse(readFileSync(resolve(
    "server/research/master-offerings/data/member-safe-master-offerings.generated.json"), "utf8")) as unknown;
  return (Array.isArray(parsed) ? parsed : Object.values(parsed as Record<string, unknown>).find(Array.isArray)) as Row[];
}

describe("a quote-cart link from the member catalog", () => {
  it("is a link the quote request form accepts, for every listing in the dataset", () => {
    const rows = datasetRows();
    expect(rows.length).toBeGreaterThan(400);
    for (const row of rows) {
      if (!isMasterOfferingFamily(row.family)) throw new Error("unknown family " + row.family);
      for (const entry of row.variants) {
        const href = quoteCartHref({ family: row.family, slug: row.slug, variantId: entry.id });
        const url = new URL(href, "https://xenios.invalid");
        expect(url.pathname, href).toBe(QUOTE_CART_PATH);
        // The form's own parser: it refuses anything but one exact, well-formed selection.
        expect(orderEntryIntentFromSearch(url.search), href).toEqual({
          family: row.family, slug: row.slug, variantId: entry.id, quantity: 1, action: "REQUEST_QUOTE",
        });
      }
    }
  });

  it("is the bare form address, which carries no selection, when the form would refuse the link", () => {
    const href = quoteCartHref({ family: "research_vials", slug: "Not A Slug", variantId: "mov_1" });
    expect(href).toBe(QUOTE_CART_PATH);
    expect(orderEntryIntentFromSearch(new URL(href, "https://xenios.invalid").search)).toBeNull();
  });

  it("is stated as a quote request in the customer vocabulary", () => {
    expect(accessPathOfVariant(variant({ action: ACTIONS.request_quote }))).toBe("REQUEST_QUOTE");
  });

  it("renders on the card and on the detail page as a link that says Add to quote cart", () => {
    const row = variant({ action: ACTIONS.request_quote });
    const href = (ACTIONS.request_quote as { href: string }).href;
    const onCard = render(<MasterOfferingCard product={card({ variants: [row] })} />);
    const cardLink = onCard.host.querySelector('[data-testid="mo-card-action"]');
    expect(cardLink?.tagName).toBe("A");
    expect(cardLink?.textContent).toBe("Add to quote cart");
    expect(cardLink?.getAttribute("href")).toBe(href);
    expect(cardLink?.getAttribute("data-customer-action")).toBe("REQUEST_QUOTE");
    onCard.unmount();
    const onDetail = render(<MasterOfferingVariantAction productName="Fixture" variant={row} />);
    const link = onDetail.host.querySelector('[data-testid="mo-cta"]');
    expect(link?.tagName).toBe("A");
    expect(link?.textContent).toBe("Add to quote cart");
    expect(link?.getAttribute("href")).toBe(href);
    onDetail.unmount();
  });
});
