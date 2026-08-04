// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EarlyAccessCatalogSection } from "./EarlyAccessCatalogSection";
import type { EarlyAccessCatalogLoad } from "../adapters/earlyAccessCatalog";
import type { EarlyAccessCardProduct } from "./EarlyAccessProductCard";

const FULFILLMENT =
  "Current fulfillment target: within 72 hours after payment verification and product availability confirmation. Tracking will be provided when the shipment is released.";

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

function product(index: number, availability: EarlyAccessCardProduct["availability"]): EarlyAccessCardProduct {
  return {
    productId: `prod-${index}`,
    variantId: `var-${index}`,
    name: `Product ${index}`,
    strength: "10 mg",
    unitPriceCents: 5_600,
    currency: "USD",
    description: "Lyophilised vial for research use.",
    availability,
  };
}

async function mount(load: EarlyAccessCatalogLoad, onSelect = vi.fn()) {
  const el = render(
    <EarlyAccessCatalogSection
      fulfillmentTargetCopy={FULFILLMENT}
      load={() => Promise.resolve(load)}
      onSelect={onSelect}
    />,
  );
  // Flush the effect's promise.
  await act(async () => {
    await Promise.resolve();
  });
  return { el, onSelect };
}

function state(el: HTMLElement): string | null {
  return el
    .querySelector("[data-testid='early-access-catalog-section']")
    ?.getAttribute("data-state") ?? null;
}

describe("early access catalogue section", () => {
  it("renders exactly the rows the server sent", async () => {
    const products = Array.from({ length: 22 }, (_, i) => product(i, "AVAILABLE"));
    const { el } = await mount({ kind: "ok", products, dropped: 0, received: 22 });

    expect(state(el)).toBe("ok");
    expect(el.querySelectorAll("article")).toHaveLength(22);
    expect(
      el.querySelector("[data-testid='early-access-catalog-section']")?.getAttribute("data-received"),
    ).toBe("22");
  });

  it("shows a lapsed session as lapsed, never as an empty catalogue", async () => {
    // A signed-out customer shown an empty shelf concludes there is nothing to
    // buy. The truth is that they need to unlock again, and only one of those
    // leads them to the right action.
    const { el } = await mount({ kind: "locked" });
    expect(state(el)).toBe("locked");
    const text = el.textContent ?? "";
    expect(text).toContain("Unlock again");
    expect(text).toContain("Nothing has been ordered or charged");
    expect(el.querySelectorAll("article")).toHaveLength(0);
  });

  it("shows an unreadable response as a fault on our side", async () => {
    // Not an empty catalogue either. Naming it a fault is what gets it reported
    // instead of absorbed as "there is nothing available".
    const { el } = await mount({ kind: "unreadable", reason: "bad shape" });
    expect(state(el)).toBe("fault");
    expect(el.textContent).toContain("fault on our side, not an empty catalogue");
  });

  it("shows a transport error as the same fault, not as an empty catalogue", async () => {
    const { el } = await mount({ kind: "error", message: "network down" });
    expect(state(el)).toBe("fault");
    // The customer is never shown the raw transport message.
    expect(el.textContent).not.toContain("network down");
  });

  it("distinguishes a genuinely empty catalogue from every fault", async () => {
    const { el } = await mount({ kind: "ok", products: [], dropped: 0, received: 0 });
    expect(state(el)).toBe("ok");
    expect(el.querySelector("[data-testid='early-access-catalog-empty']")).not.toBeNull();
  });

  it("keeps held and confirmation-required rows visible", async () => {
    const { el } = await mount({
      kind: "ok",
      products: [
        product(1, "AVAILABLE"),
        product(2, "AVAILABILITY_CONFIRMATION_REQUIRED"),
        product(3, "TEMPORARILY_HELD"),
      ],
      dropped: 0,
      received: 3,
    });
    expect(el.querySelectorAll("article")).toHaveLength(3);
    expect(el.querySelectorAll("[data-availability='TEMPORARILY_HELD']")).toHaveLength(1);
    expect(el.querySelectorAll("[data-availability='AVAILABILITY_CONFIRMATION_REQUIRED']")).toHaveLength(1);
  });

  it("surfaces dropped rows rather than quietly rendering fewer", async () => {
    const { el } = await mount({
      kind: "ok",
      products: [product(1, "AVAILABLE")],
      dropped: 2,
      received: 3,
    });
    expect(el.querySelector("[data-testid='early-access-catalog-dropped']")?.textContent).toContain(
      "2 products are",
    );
  });

  it("holds no product data of its own", async () => {
    // The section renders exactly what it was given. If it ever carried fixture
    // rows, an empty server response would still paint a catalogue, which is the
    // single most misleading thing this screen could do.
    const { el } = await mount({ kind: "ok", products: [], dropped: 0, received: 0 });
    expect(el.querySelectorAll("article")).toHaveLength(0);
  });

  it("reports the chosen product upward without acting on it", async () => {
    const onSelect = vi.fn();
    const { el } = await mount(
      { kind: "ok", products: [product(1, "AVAILABLE")], dropped: 0, received: 1 },
      onSelect,
    );
    act(() => {
      el.querySelector<HTMLButtonElement>("article button")?.click();
    });
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect.mock.calls[0][0]).toMatchObject({ productId: "prod-1" });
  });
});
