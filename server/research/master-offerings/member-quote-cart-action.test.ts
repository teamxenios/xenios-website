import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { MasterOfferingAction } from "@shared/research/master-offerings/contract";
import { HCG_STRENGTH_REVIEW as held } from "@shared/research/master-offerings/hcg-strength-review";
import { QUOTE_CART_PATH, quoteCartHref } from "@shared/research/master-offerings/quote-cart";
import type { AssistedOrderViewer } from "../assisted-order/ports";
import { createRequestIntentCatalog } from "../assisted-order/request-intent/catalog";
import { REQUEST_INTENT_ALL_LISTED_ENV } from "../assisted-order/request-intent/production";
import { resolveMasterOfferingAction, type MasterOfferingActionCapabilities } from "./action";
import { QUOTE_CART_ALL_LISTED_ENV } from "./composition";
import { GeneratedMasterOfferingCatalogReader } from "./dataset-reader";
import { buildMasterOfferingPriceList } from "./price-list-export";
import { NO_MASTER_OFFERING_PRICES } from "./price-projection";
import { reviewedHeldSpecifications } from "./reviewed-holds";
import { MasterOfferingCatalogService } from "./service";
import { offering, variant } from "./test-fixtures";
import { cartSelection } from "./testing/cart-selection.test-support";

/**
 * The member full catalog under the quote-only release: every listed variant's
 * action is the quote cart, and it is the same set of rows the quote request
 * form can take. Real catalog, no database, no browser.
 */
const reader = new GeneratedMasterOfferingCatalogReader(
  resolve("server/research/master-offerings/data/member-safe-master-offerings.generated.json"),
);
const holds = reviewedHeldSpecifications();
const viewer: AssistedOrderViewer = {
  actorType: "early_access_session", memberId: null, normalizedEmail: null,
  earlyAccessCustomerRef: "synthetic-customer", earlyAccessSessionHash: "synthetic-session",
  capabilities: new Set(["assisted_orders:submit"]),
};

type MemberRow = { key: string; action: MasterOfferingAction };

async function memberRows(capabilities: MasterOfferingActionCapabilities): Promise<MemberRow[]> {
  const service = new MasterOfferingCatalogService(
    reader, async () => ({ binding: null, selection: null }), undefined, capabilities);
  const rows: MemberRow[] = [];
  for (let page = 1; ; page += 1) {
    const result = await service.list({ page, pageSize: 100 });
    for (const product of result.products) {
      for (const entry of product.variants) {
        rows.push({ key: [product.family, product.slug, entry.id].join("|"), action: entry.action });
      }
    }
    if (page >= result.totalPages) return rows;
  }
}

async function formRows(allListedInquirable: boolean): Promise<Map<string, boolean>> {
  const service = new MasterOfferingCatalogService(reader, async () => ({ binding: null, selection: null }));
  const catalog = createRequestIntentCatalog({
    serviceFor: () => service, bindingFor: () => null, offeringVariantFor: () => null,
    catalogVersion: "synthetic", reviewedFormulationHolds: holds, allListedInquirable,
  });
  const selectable = new Map<string, boolean>();
  for (let page = 1; ; page += 1) {
    const result = await catalog.list(viewer, { page, pageSize: 100 });
    for (const item of result.items) {
      const source = item.sourceSelection!;
      const key = [source.family, source.slug, source.variantId].join("|");
      expect(selectable.has(key), key).toBe(false);
      selectable.set(key, item.selectableForReview === true);
    }
    if (selectable.size >= result.total) return selectable;
  }
}

/** The row a quote-cart link names, read back the way the form reads it. */
function keyFromHref(href: string): string {
  const url = new URL(href, "https://xenios.invalid");
  expect(url.pathname).toBe(QUOTE_CART_PATH);
  expect([...url.searchParams.keys()].sort()).toEqual(["family", "intent", "qty", "slug", "variant"]);
  expect(url.searchParams.get("qty")).toBe("1");
  expect(url.searchParams.get("intent")).toBe("request_quote");
  return [url.searchParams.get("family"), url.searchParams.get("slug"), url.searchParams.get("variant")].join("|");
}

describe("the member catalog's action under the quote-only release", () => {
  it("offers the quote cart on exactly the rows the quote request form can take", async () => {
    const member = await memberRows({ quoteCartOnly: true, reviewedFormulationHolds: holds });
    const form = await formRows(false);
    expect(member.length).toBe(form.size);
    const notOffered: string[] = [];
    for (const row of member) {
      expect(form.has(row.key), row.key).toBe(true);
      if (row.action.kind === "request_quote") {
        expect(row.action.label).toBe("Add to quote cart");
        // The link names this row and no other, and the form can take it.
        expect(keyFromHref(row.action.href)).toBe(row.key);
        expect(form.get(row.key), row.key).toBe(true);
      } else {
        notOffered.push(row.key);
        expect(form.get(row.key), row.key).toBe(false);
      }
      expect(["add_to_cart", "request_early_access_purchase"]).not.toContain(row.action.kind);
    }
    // Today the request store refuses supply and service lines, so some rows
    // are listed and not offered. If this is ever empty the comparison above
    // has no refused case left and the next test is the only one that matters.
    expect(notOffered.length).toBeGreaterThan(0);
    expect(notOffered.length).toBe([...form.values()].filter((selectable) => !selectable).length);
  });

  it("offers the quote cart on every listed row once the request store accepts every listed line", async () => {
    const member = await memberRows({ quoteCartOnly: true, allListedInquirable: true, reviewedFormulationHolds: holds });
    const form = await formRows(true);
    expect(member.length).toBe(form.size);
    for (const row of member) {
      expect(row.action.kind, row.key).toBe("request_quote");
      expect(form.get(row.key), row.key).toBe(true);
    }
  });

  it("offers the held listing the quote cart, and a clinical row too, without a purchase", async () => {
    const member = await memberRows({ quoteCartOnly: true, reviewedFormulationHolds: holds });
    const heldRow = member.find((row) => row.key.endsWith("|" + held.variantId));
    expect(heldRow?.action.kind).toBe("request_quote");
    const before = await memberRows({ reviewedFormulationHolds: holds });
    // Rows that said "Explore Care" before, less the ones the form cannot take yet
    // (a supply or service row can carry the care display state).
    const form = await formRows(false);
    const clinical = before.filter((row) => row.action.kind === "explore_care" && form.get(row.key) === true)
      .map((row) => row.key);
    expect(clinical.length).toBeGreaterThan(200);
    const after = new Map(member.map((row) => [row.key, row.action.kind]));
    for (const key of clinical) expect(after.get(key), key).toBe("request_quote");
  });

  it("leaves the earlier mapping untouched when the release is not quote-only", async () => {
    const rows = await memberRows({ reviewedFormulationHolds: holds });
    expect(rows.some((row) => row.action.kind === "request_quote")).toBe(false);
  });

  it("states the quote path in the price list for the same rows", async () => {
    const document = buildMasterOfferingPriceList({
      offerings: await reader.readCatalog(), prices: NO_MASTER_OFFERING_PRICES, audience: "member",
      generatedAt: "2026-11-11T16:00:00.000Z",
      capabilities: { quoteCartOnly: true, reviewedFormulationHolds: holds },
    });
    if (!document.ok) throw new Error("price list refused");
    const form = await formRows(false);
    expect(document.rows.length).toBe(form.size);
    for (const row of document.rows) {
      const key = [row.family, row.offeringSlug, row.variantId].join("|");
      expect(row.purchasePath === "Request a quote", key).toBe(form.get(key));
      expect(row.purchasePath).not.toBe("Apply for approval");
    }
  });
});

describe("the resolver under quoteCartOnly", () => {
  it("cannot resolve Add to Cart, even with an exact Product Control binding and a valid selection", async () => {
    const product = offering();
    const presentation = product.variants[0];
    const selection = await cartSelection();
    const commerce = {
      binding: { offeringVariantId: presentation.id, productId: selection.productId, variantId: selection.variantId },
      selection,
    };
    // Control: without the capability this exact input is a purchase.
    expect(resolveMasterOfferingAction(product, presentation, commerce).kind).toBe("add_to_cart");
    expect(resolveMasterOfferingAction(product, presentation, commerce, undefined, { quoteCartOnly: true })).toEqual({
      kind: "request_quote", label: "Add to quote cart",
      href: quoteCartHref({ family: product.family, slug: product.slug, variantId: presentation.id }),
    });
  });

  it("cannot resolve the manual purchase request either", () => {
    const product = offering();
    const presentation = product.variants[0];
    const none = { binding: null, selection: null };
    expect(resolveMasterOfferingAction(product, presentation, none, undefined,
      { manualEarlyAccessPurchase: true }).kind).toBe("request_early_access_purchase");
    expect(resolveMasterOfferingAction(product, presentation, none, undefined,
      { manualEarlyAccessPurchase: true, quoteCartOnly: true }).kind).toBe("request_quote");
  });

  it("offers nothing on an unavailable variant and no quote link on a row that is not member-visible", () => {
    const none = { binding: null, selection: null };
    const unavailable = variant({ displayState: "unavailable" });
    expect(resolveMasterOfferingAction(offering({ variants: [unavailable] }), unavailable, none, undefined,
      { quoteCartOnly: true }).kind).toBe("none");
    const hidden = variant({ visibility: "admin" });
    expect(resolveMasterOfferingAction(offering({ variants: [hidden] }), hidden, none, undefined,
      { quoteCartOnly: true }).kind).not.toBe("request_quote");
  });

  it("falls back to the bare quote form address for a slug or variant id the form would refuse", () => {
    expect(quoteCartHref({ family: "research_vials", slug: "Not A Slug", variantId: "mov_1" })).toBe(QUOTE_CART_PATH);
    expect(quoteCartHref({ family: "research_vials", slug: "a-slug", variantId: "has space" })).toBe(QUOTE_CART_PATH);
  });

  it("reads the same setting name as the quote request lane", () => {
    expect(QUOTE_CART_ALL_LISTED_ENV).toBe(REQUEST_INTENT_ALL_LISTED_ENV);
  });
});
