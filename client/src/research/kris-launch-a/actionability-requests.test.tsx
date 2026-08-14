import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { productRequestHref } from "@shared/research/product-request-sources";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { krisPathwayView } from "../../../../server/research/kris-launch-a/pathway";
import { KrisLegacyBuyNow } from "./KrisLegacyBuyNow";
import {
  krisFixtureDetail,
  krisFixtureItems,
} from "./__fixtures__/krisFixtureServer";

function productionDetail(
  item: ReturnType<typeof krisFixtureItems>[number],
): KrisCatalogDetailView {
  const detail = krisFixtureDetail(item.family, item.slug);
  if (!detail) throw new Error(`Kris detail fixture is missing: ${item.slug}`);
  return {
    ...detail,
    pathway: krisPathwayView(item.purchaseMode, item.channel, item),
  };
}

function detailFor(
  predicate: (item: KrisCatalogDetailView) => boolean,
): KrisCatalogDetailView {
  for (const item of krisFixtureItems()) {
    const detail = productionDetail(item);
    if (predicate(detail)) return detail;
  }
  throw new Error("required Kris detail fixture is missing");
}

function hrefs(markup: string): string[] {
  return Array.from(markup.matchAll(/href="([^"]+)"/g), (match) =>
    match[1].replaceAll("&amp;", "&"),
  );
}

describe("Kris catalog actionability", () => {
  it("gives every one of the 420 visible details a truthful next action", () => {
    const items = krisFixtureItems();
    expect(items).toHaveLength(420);

    for (const item of items) {
      const detail = productionDetail(item);
      const markup = renderToStaticMarkup(<KrisLegacyBuyNow item={detail} />);

      expect(markup, item.slug).toMatch(/<(?:a|button)\b/);
      if (item.purchaseMode !== "direct_eligible") {
        expect(markup, item.slug).not.toContain('data-testid="kris-buy-now"');
      }
      if (item.price.state === "pending") {
        expect(markup, item.slug).toContain('data-testid="kris-request-price"');
        expect(markup, item.slug).not.toMatch(/\$\s*0(?:\.00)?\b/);
      }
    }
  });

  it("routes price and activation requests into the existing durable request form", () => {
    const price = detailFor((item) => item.purchaseMode === "price_pending");
    const activation = detailFor(
      (item) => item.purchaseMode === "classification_pending",
    );

    for (const item of [price, activation]) {
      expect(item.pathway?.kind).toBe(item.purchaseMode);
      const markup = renderToStaticMarkup(<KrisLegacyBuyNow item={item} />);
      expect(hrefs(markup)).toContain(
        productRequestHref(
          "products",
          `${item.displayName} (${item.specification})`,
        ),
      );
      expect(markup).not.toContain('data-testid="kris-buy-now"');
    }
  });

  it("turns an exact Product Control revalidation into a durable item request", () => {
    const item = detailFor((detail) => detail.purchaseMode === "direct_eligible");
    expect(item.legacyOrder).toBeNull();
    const markup = renderToStaticMarkup(<KrisLegacyBuyNow item={item} />);
    const request = hrefs(markup).find((href) =>
      href.startsWith("/research/member/product-requests/new?"),
    );

    expect(markup).toContain('data-testid="kris-request-item"');
    expect(request).toBeDefined();
    const query = new URL(request!, "https://xenios.test").searchParams;
    expect(query.get("source")).toBe("products");
    expect(query.get("product")).toBe(`${item.displayName} (${item.specification})`);
    expect(query.get("product")?.length).toBeLessThanOrEqual(180);
    expect(markup).not.toContain('data-testid="kris-buy-now"');
  });

  it("keeps exact provider interest commercial and the Care link product-blind", () => {
    const item = detailFor((detail) => detail.purchaseMode === "provider_workflow");
    const markup = renderToStaticMarkup(<KrisLegacyBuyNow item={item} />);
    const links = hrefs(markup);

    expect(links).toContain(
      productRequestHref("products", `${item.displayName} (${item.specification})`),
    );
    expect(links).toContain("/research/member/metabolic-care");
    expect(markup).toContain("Start Provider Workflow");
    expect(markup).toContain("Explore Xenios Care");
    expect(markup).not.toContain('data-testid="kris-buy-now"');
  });

  it("does not add a request fallback beside a valid exact Buy Now handoff", () => {
    const source = detailFor((detail) =>
      detail.purchaseMode === "direct_eligible" && detail.price.state === "priced",
    );
    if (source.price.state !== "priced") throw new Error("priced direct fixture is missing");
    const item: KrisCatalogDetailView = {
      ...source,
      canBuyNow: true,
      legacyOrder: {
        productId: "PEX-012",
        variantId: "R360-AOD9604-5MG-VIAL",
        unitPriceCents: source.price.amountCents,
        currency: source.price.currency,
        quantityLimit: 50,
        evaluatedAt: "2026-08-13T23:30:00.000Z",
      },
    };
    const markup = renderToStaticMarkup(<KrisLegacyBuyNow item={item} />);

    expect(markup).toContain('data-testid="kris-buy-now"');
    expect(hrefs(markup).some((href) => href.includes("/product-requests/"))).toBe(false);
  });

  it("does not place private operational fields into any action markup or URL", () => {
    const markup = krisFixtureItems()
      .map((item) =>
        renderToStaticMarkup(<KrisLegacyBuyNow item={productionDetail(item)} />),
      )
      .join("\n");

    expect(markup).not.toMatch(
      /buy cost|supplier cost|gross profit|margin|procurement note|source file|supplier alternative|internal coa|internal fulfillment/i,
    );
  });
});
