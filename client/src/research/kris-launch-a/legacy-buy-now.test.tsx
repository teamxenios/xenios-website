// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import type { KrisCatalogDetailView } from "@shared/research/kris-launch-a/contract";
import { KrisLegacyBuyNow, toKrisLegacyOrderSelection } from "./KrisLegacyBuyNow";

// The non-direct branches now render the pathway request, which reads the
// member token the same way the routed pages do.
vi.mock("../core", () => ({
  useResearch: () => ({ memberToken: "member-token" }),
}));
import { krisFixtureDetail, krisFixtureItems } from "./__fixtures__/krisFixtureServer";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function direct(): KrisCatalogDetailView {
  // The committed Launch A row and the canonical Product Control fixture are
  // both real repository identities. Never mint pc-/pcv- stand-ins here: a
  // test that passes with invented commerce identity can hide a release bug.
  const item = krisFixtureItems().find(
    (row) => row.id === "kli_ab4498834d24d715da48",
  );
  if (!item || item.price.state !== "priced") throw new Error("real direct row missing");
  if (item.purchaseMode !== "direct_eligible") throw new Error("real direct row is not eligible");
  const detail = krisFixtureDetail(item.family, item.slug);
  if (!detail) throw new Error("real direct detail missing");
  return {
    ...detail,
    canBuyNow: true,
    legacyOrder: {
      productId: "PEX-012",
      variantId: "R360-AOD9604-5MG-VIAL",
      unitPriceCents: item.price.amountCents,
      currency: item.price.currency,
      quantityLimit: 50,
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
    const selected = toKrisLegacyOrderSelection(item, 50);
    expect(selected).toEqual({
      product: {
        productId: "PEX-012",
        variantId: "R360-AOD9604-5MG-VIAL",
        name: item.displayName,
        strength: item.specification,
        unitPriceCents: item.price.state === "priced" ? item.price.amountCents : null,
        currency: item.price.state === "priced" ? item.price.currency : "",
        description: item.suppliedNote,
        availability: "AVAILABLE",
        quantityLimit: 50,
      },
      quantity: 50,
    });
    expect(toKrisLegacyOrderSelection(item, 51)).toBeNull();
  });

  it("renders Buy Now and enters the existing one-product journey", () => {
    const item = direct();
    const { host, unmount } = render(<KrisLegacyBuyNow item={item} />);
    const quantity = host.querySelector('[data-testid="kris-buy-now-quantity"] input');
    expect(quantity?.getAttribute("max")).toBe("50");
    const button = host.querySelector('[data-testid="kris-buy-now"]') as HTMLButtonElement;
    expect(button.textContent).toBe("Buy Now");
    act(() => button.click());
    expect(host.querySelector('[data-testid="kris-legacy-order"]')).not.toBeNull();
    expect(host.textContent).toContain(item.displayName);
    expect(host.innerHTML).not.toMatch(/add[-_ ]?to[-_ ]?cart|cart checkout|subscription/i);
    unmount();
  });

  it.each([
    ["provider_workflow", "Provider workflow required", "Request provider pathway"],
    ["classification_pending", "Pending Activation", "Register interest"],
    ["price_pending", "Price Pending", "Request price"],
  ] as const)("never renders Buy Now for %s", (mode, copy, requestLabel) => {
    const source =
      mode === "price_pending"
        ? krisFixtureItems().find((row) => row.purchaseMode === mode)
        : krisFixtureItems().find((row) => row.purchaseMode === mode && row.price.state === "priced");
    if (!source) throw new Error(`${mode} fixture missing`);
    const detail = krisFixtureDetail(source.family, source.slug);
    if (!detail) throw new Error(`${mode} detail missing`);
    const { host, unmount } = render(<KrisLegacyBuyNow item={detail} />);
    expect(host.textContent).toContain(copy);
    // Every non-direct mode now carries a working request; none carries Buy Now.
    expect(
      host.querySelector('[data-testid="kris-pathway-submit"]')?.textContent,
    ).toBe(requestLabel);
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
