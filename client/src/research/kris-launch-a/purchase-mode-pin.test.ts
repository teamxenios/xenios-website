import { describe, expect, it } from "vitest";
import type {
  KrisCatalogItemView,
  KrisCatalogPage,
  KrisLegacyOrderSelection,
  KrisPurchaseMode,
} from "@shared/research/kris-launch-a/contract";
import { pinKrisItemView, pinKrisPage } from "./purchase-mode-pin";

/**
 * The upgrade attacks QA drove against the previous candidate decoder, held
 * here as regression tests against THIS decoder. Each one presents a complete,
 * internally consistent envelope that claims more actionability than the row's
 * own channel and price permit, and the pin must return the canonical mode
 * with the order handoff discarded. The one legitimate direct row must pass
 * through untouched, because the pin exists to refuse upgrades, not to become
 * a second authority over rows the server already refused.
 */

const boundOrder: KrisLegacyOrderSelection = {
  productId: "pc-prod-1",
  variantId: "pc-var-1",
  unitPriceCents: 8800,
  currency: "USD",
  quantityLimit: 20,
  evaluatedAt: "2026-08-14T00:00:00.000Z",
};

function itemView(overrides: Partial<KrisCatalogItemView>): KrisCatalogItemView {
  return {
    id: "kli_38cfd981f7851984829a",
    slug: "clinical-formulations-503a-5-amino-1mq-5-amino-1mq-5mg-ml-5ml",
    displayName: "5-Amino-1Mq",
    specification: "5-AMINO-1MQ 5MG/ML (5ML)",
    family: "clinical_formulations_503a",
    familyLabel: "503A Clinical Formulations",
    channel: "clinical_provider_only",
    channelLabel: "Clinical / Provider Only",
    format: "Compounded Vial / Liquid",
    packBasis: "Per listed unit",
    moq: 1,
    dosageForm: "Compounded Vial / Liquid",
    price: {
      state: "priced",
      amountCents: 8800,
      currency: "USD",
      display: "$88.00",
      basis: "Per listed unit",
    },
    access: {
      channel: "clinical_provider_only",
      statusLabel: "Provider workflow required",
      notices: ["Provider workflow required."],
      purchasable: false,
    },
    purchaseMode: "provider_workflow",
    legacyOrder: null,
    canBuyNow: false,
    pathway: null,
    suppliedNote: "Provider workflow required.",
    ...overrides,
  };
}

describe("the purchase-mode pin refuses every upgrade", () => {
  it("downgrades QA's exact drifted envelope: a provider row arriving as Buy Now", () => {
    // The real artifact row QA used: kli_38cfd981f7851984829a is
    // clinical_provider_only, canonical mode provider_workflow. The drifted
    // envelope claims direct_eligible with a bound order and canBuyNow true.
    const pinned = pinKrisItemView(
      itemView({
        purchaseMode: "direct_eligible",
        legacyOrder: boundOrder,
        canBuyNow: true,
        pathway: null,
      }),
    );
    expect(pinned.purchaseMode).toBe("provider_workflow");
    expect(pinned.legacyOrder).toBeNull();
    expect(pinned.canBuyNow).toBe(false);
  });

  it("downgrades a classification-pending row arriving as Buy Now", () => {
    const pinned = pinKrisItemView(
      itemView({
        channel: "classification_pending",
        channelLabel: "Supplier Catalog / Classification Pending",
        access: {
          channel: "classification_pending",
          statusLabel: "Classification pending",
          notices: ["Classification pending."],
          purchasable: false,
        },
        purchaseMode: "direct_eligible",
        legacyOrder: boundOrder,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("classification_pending");
    expect(pinned.legacyOrder).toBeNull();
    expect(pinned.canBuyNow).toBe(false);
  });

  it("downgrades a price-pending row arriving as Buy Now, regardless of channel", () => {
    const pinned = pinKrisItemView(
      itemView({
        channel: "ruo_research",
        price: { state: "pending", display: "Price pending" },
        purchaseMode: "direct_eligible",
        legacyOrder: boundOrder,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("price_pending");
    expect(pinned.legacyOrder).toBeNull();
    expect(pinned.canBuyNow).toBe(false);
  });

  it("treats a malformed price object as pending, the fail-closed direction", () => {
    const pinned = pinKrisItemView(
      itemView({
        channel: "ruo_research",
        price: { state: "haggled" } as unknown as KrisCatalogItemView["price"],
        purchaseMode: "direct_eligible",
        legacyOrder: boundOrder,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("price_pending");
    expect(pinned.canBuyNow).toBe(false);
  });

  it("refuses an unknown channel arriving as Buy Now", () => {
    const pinned = pinKrisItemView(
      itemView({
        channel: "concierge_special" as unknown as KrisCatalogItemView["channel"],
        purchaseMode: "direct_eligible",
        legacyOrder: boundOrder,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("classification_pending");
    expect(pinned.canBuyNow).toBe(false);
  });

  it("replaces a mode outside the closed vocabulary with the matrix verdict", () => {
    const pinned = pinKrisItemView(
      itemView({
        purchaseMode: "super_buy" as unknown as KrisPurchaseMode,
        legacyOrder: boundOrder,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("provider_workflow");
    expect(pinned.legacyOrder).toBeNull();
    expect(pinned.canBuyNow).toBe(false);
  });

  it("forces canBuyNow false when a direct row carries no order handoff", () => {
    const pinned = pinKrisItemView(
      itemView({
        channel: "ruo_research",
        purchaseMode: "direct_eligible",
        legacyOrder: null,
        canBuyNow: true,
      }),
    );
    expect(pinned.purchaseMode).toBe("direct_eligible");
    expect(pinned.canBuyNow).toBe(false);
  });

  it("keeps a wire row that is MORE restrictive than the matrix", () => {
    // A priced RUO row the server refused anyway (no binding, not ready). The
    // pin must not resurrect it: the server sees facts these fields cannot.
    const item = itemView({
      channel: "ruo_research",
      purchaseMode: "provider_workflow",
      legacyOrder: null,
      canBuyNow: false,
    });
    expect(pinKrisItemView(item)).toBe(item);
  });

  it("passes a legitimate direct row through untouched, same object", () => {
    const item = itemView({
      channel: "ruo_research",
      channelLabel: "RUO Research",
      purchaseMode: "direct_eligible",
      legacyOrder: boundOrder,
      canBuyNow: true,
    });
    expect(pinKrisItemView(item)).toBe(item);
  });
});

describe("pinKrisPage", () => {
  function page(items: readonly KrisCatalogItemView[]): KrisCatalogPage {
    return {
      ok: true,
      profile: "KRIS_VOLUME_PARTNER",
      page: 1,
      pageSize: 24,
      total: items.length,
      totalPages: 1,
      sort: "relevance",
      facets: { families: [], channels: [] },
      items,
    };
  }

  it("pins every row and keeps the page fields", () => {
    const drifted = itemView({
      purchaseMode: "direct_eligible",
      legacyOrder: boundOrder,
      canBuyNow: true,
    });
    const honest = itemView({
      channel: "ruo_research",
      purchaseMode: "direct_eligible",
      legacyOrder: boundOrder,
      canBuyNow: true,
    });
    const pinned = pinKrisPage(page([drifted, honest]));
    expect(pinned.items[0].purchaseMode).toBe("provider_workflow");
    expect(pinned.items[0].canBuyNow).toBe(false);
    expect(pinned.items[1]).toBe(honest);
    expect(pinned.total).toBe(2);
    expect(pinned.profile).toBe("KRIS_VOLUME_PARTNER");
  });

  it("returns the same page object when nothing needed pinning", () => {
    const honest = itemView({
      channel: "ruo_research",
      purchaseMode: "direct_eligible",
      legacyOrder: boundOrder,
      canBuyNow: true,
    });
    const input = page([honest]);
    expect(pinKrisPage(input)).toBe(input);
  });
});
