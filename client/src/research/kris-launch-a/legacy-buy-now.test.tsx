// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it } from "vitest";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { KrisLegacyBuyNow, toKrisLegacyOrderSelection } from "./KrisLegacyBuyNow";
import { krisFixtureDetail, krisFixtureItems } from "./__fixtures__/krisFixtureServer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function direct(): KrisCatalogDetailView {
  const item = krisFixtureItems().find((row) => row.purchaseMode === "direct_eligible");
  if (!item || item.price.state !== "priced") throw new Error("real direct row missing");
  const detail = krisFixtureDetail(item.family, item.slug);
  if (!detail) throw new Error("real direct detail missing");
  return {
    ...detail,
    canBuyNow: true,
    legacyOrder: {
      productId: `pc-${item.id}`,
      variantId: `pcv-${item.id}`,
      unitPriceCents: item.price.amountCents,
      currency: item.price.currency,
      quantityLimit: 20,
      evaluatedAt: "2026-08-13T23:30:00.000Z",
    },
  };
}

function render(ui: React.ReactElement) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  return {
    host,
    unmount: () => {
      act(() => root.unmount());
      host.remove();
    },
  };
}

describe("Kris legacy single-order entry", () => {
  it("preserves exact Product Control identity, partner price and effective quantity", () => {
    const item = direct();
    const selected = toKrisLegacyOrderSelection(item, 20);
    expect(selected).toEqual({
      product: {
        productId: item.legacyOrder?.productId,
        variantId: item.legacyOrder?.variantId,
        name: item.displayName,
        strength: item.specification,
        unitPriceCents: item.price.state === "priced" ? item.price.amountCents : null,
        currency: item.price.state === "priced" ? item.price.currency : "",
        description: item.suppliedNote,
        availability: "AVAILABLE",
        quantityLimit: 20,
      },
      quantity: 20,
    });
    expect(toKrisLegacyOrderSelection(item, 21)).toBeNull();
  });

  it("renders Buy Now and enters the existing one-product journey", () => {
    const item = direct();
    const { host, unmount } = render(<KrisLegacyBuyNow item={item} />);
    const quantity = host.querySelector('[data-testid="kris-buy-now-quantity"] input');
    expect(quantity?.getAttribute("max")).toBe("20");
    const button = host.querySelector('[data-testid="kris-buy-now"]') as HTMLButtonElement;
    expect(button.textContent).toBe("Buy Now");
    act(() => button.click());
    expect(host.querySelector('[data-testid="kris-legacy-order"]')).not.toBeNull();
    expect(host.textContent).toContain(item.displayName);
    expect(host.innerHTML).not.toMatch(/add[-_ ]?to[-_ ]?cart|cart checkout|subscription/i);
    unmount();
  });

  it.each([
    ["provider_workflow", "Start Provider Workflow"],
    ["classification_pending", "Pending Activation"],
    ["price_pending", "Price Pending"],
  ] as const)("never renders Buy Now for %s", (mode, copy) => {
    const source =
      mode === "price_pending"
        ? krisFixtureItems().find((row) => row.purchaseMode === mode)
        : krisFixtureItems().find((row) => row.purchaseMode === mode && row.price.state === "priced");
    if (!source) throw new Error(`${mode} fixture missing`);
    const detail = krisFixtureDetail(source.family, source.slug);
    if (!detail) throw new Error(`${mode} detail missing`);
    const { host, unmount } = render(<KrisLegacyBuyNow item={detail} />);
    expect(host.textContent).toContain(copy);
    expect(host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    unmount();
  });

  it("refuses a forged handoff whose price differs from KRIS_VOLUME_PARTNER", () => {
    const item = direct();
    const forged = {
      ...item,
      legacyOrder: item.legacyOrder && {
        ...item.legacyOrder,
        unitPriceCents: item.legacyOrder.unitPriceCents + 1,
      },
    };
    expect(toKrisLegacyOrderSelection(forged, 1)).toBeNull();
    const { host, unmount } = render(<KrisLegacyBuyNow item={forged} />);
    expect(host.querySelector('[data-testid="kris-buy-now"]')).toBeNull();
    unmount();
  });
});
