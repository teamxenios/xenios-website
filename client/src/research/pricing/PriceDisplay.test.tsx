// @vitest-environment jsdom
// PriceDisplay's honest states, rendered through real React: a valid price
// carries the full accessible phrase on a single amount node; zero, negative,
// and malformed amounts render the approved unavailable copy (the
// impossible-$0 invariant at the component layer); loading is a role=status
// skeleton with no number; an error renders unavailable, never a raw error
// string.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { PriceDisplay } from "./PriceDisplay";
import { PriceUnavailable } from "./PriceUnavailable";
import {
  PRICE_UNAVAILABLE_COPY,
  type CatalogPriceProjection,
  type CustomerPriceDto,
} from "./format";

let root: Root | null = null;
let container: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  container?.remove();
  root = null;
  container = null;
});

function render(node: ReactNode): HTMLDivElement {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root!.render(node);
  });
  return container!;
}

function basePriceFields(): CustomerPriceDto {
  return {
    priceId: "price-1",
    productId: "product-1",
    variantId: "variant-1",
    audience: "member",
    amountCents: 180000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    version: 1,
  };
}

// The priced branch of the projection nests the customer-safe fields under
// .price, matching shared/research/pricing.ts CatalogPriceProjection.
function memberPrice(overrides: Partial<CustomerPriceDto> = {}): CatalogPriceProjection {
  return { state: "priced", price: { ...basePriceFields(), ...overrides } };
}

describe("PriceDisplay (valid price)", () => {
  it("renders the formatted amount as a single text node with the full aria phrase", () => {
    const view = render(<PriceDisplay price={memberPrice()} unitLabel="per unit" />);
    const amount = view.querySelector('[data-testid="price-display-amount"]')!;
    expect(amount).not.toBeNull();
    expect(amount.childNodes.length).toBe(1);
    expect(amount.childNodes[0].nodeType).toBe(Node.TEXT_NODE);
    expect(amount.textContent).toBe("$1,800.00");
    expect(amount.getAttribute("aria-label")).toBe("Price: $1,800.00 per unit for members");
  });

  it("shows the audience qualifier visibly but hides it from the screen reader", () => {
    const view = render(<PriceDisplay price={memberPrice()} />);
    expect(view.textContent).toContain("for members");
    const qualifier = view.querySelector('[data-testid="price-display-audience"]')!;
    expect(qualifier).not.toBeNull();
    expect(qualifier.textContent).toContain("for members");
    expect(qualifier.getAttribute("aria-hidden")).toBe("true");
    // The amount's phrase already speaks the audience, once.
    const amount = view.querySelector('[data-testid="price-display-amount"]')!;
    expect(amount.getAttribute("aria-label")).toBe("Price: $1,800.00 for members");
  });

  it("renders a retail price with no qualifier, visible or spoken", () => {
    const view = render(
      <PriceDisplay price={memberPrice({ audience: "retail", amountCents: 100 })} />,
    );
    const amount = view.querySelector('[data-testid="price-display-amount"]')!;
    expect(amount.textContent).toBe("$1.00");
    expect(amount.getAttribute("aria-label")).toBe("Price: $1.00");
    expect(view.textContent).toBe("$1.00");
  });

  it("can suppress the visible qualifier where the surface already names the audience", () => {
    const view = render(<PriceDisplay price={memberPrice()} showAudience={false} />);
    expect(view.textContent).toBe("$1,800.00");
    const amount = view.querySelector('[data-testid="price-display-amount"]')!;
    expect(amount.getAttribute("aria-label")).toBe("Price: $1,800.00 for members");
  });
});

describe("PriceDisplay (the impossible-$0 invariant)", () => {
  const malformed: Array<[string, number]> = [
    ["zero", 0],
    ["negative", -500],
    ["float", 12.5],
    ["NaN", Number.NaN],
    ["beyond safe range", 2 ** 53],
  ];

  for (const [label, amountCents] of malformed) {
    it(`renders unavailable for a ${label} amount, never a formatted zero`, () => {
      const view = render(<PriceDisplay price={memberPrice({ amountCents })} />);
      expect(view.textContent).toBe(PRICE_UNAVAILABLE_COPY);
      expect(view.textContent).not.toContain("$");
    });
  }

  it("renders unavailable for an unsupported currency smuggled past the type", () => {
    // Double assertion on purpose: the shared contract types currency as the
    // literal "USD", so a non-USD value can only arrive the way a wire
    // payload would, past the compiler. The formatter still rejects it.
    const smuggled = {
      state: "priced",
      price: { ...basePriceFields(), currency: "EUR" },
    } as unknown as CatalogPriceProjection;
    const view = render(<PriceDisplay price={smuggled} />);
    expect(view.textContent).toBe(PRICE_UNAVAILABLE_COPY);
  });
});

describe("PriceDisplay (unavailable, missing, loading, error)", () => {
  it("renders the approved copy, exactly, for the not-available projection", () => {
    const view = render(<PriceDisplay price={{ state: "not_currently_available" }} />);
    expect(view.textContent).toBe("Not currently available");
    const unavailable = view.querySelector('[data-testid="price-display-unavailable"]');
    expect(unavailable).not.toBeNull();
  });

  it("renders unavailable when no projection has arrived at all", () => {
    expect(render(<PriceDisplay price={null} />).textContent).toBe(PRICE_UNAVAILABLE_COPY);
    if (root) act(() => root!.unmount());
    container?.remove();
    expect(render(<PriceDisplay />).textContent).toBe(PRICE_UNAVAILABLE_COPY);
  });

  it("renders a role=status skeleton while loading, with no number and no unavailable copy", () => {
    const view = render(<PriceDisplay price={memberPrice()} loading />);
    const status = view.querySelector('[role="status"]')!;
    expect(status).not.toBeNull();
    expect(status.textContent).toBe("Loading price");
    expect(view.textContent).not.toContain("$");
    expect(view.textContent).not.toContain(PRICE_UNAVAILABLE_COPY);
  });

  it("renders unavailable on error, never a raw error string", () => {
    const view = render(<PriceDisplay price={memberPrice()} error />);
    expect(view.textContent).toBe(PRICE_UNAVAILABLE_COPY);
    expect(view.textContent).not.toContain("Error");
    expect(view.textContent).not.toContain("$");
  });
});

describe("PriceUnavailable", () => {
  it("renders the approved copy as plain text", () => {
    const view = render(<PriceUnavailable />);
    expect(view.textContent).toBe("Not currently available");
    expect(view.querySelector('[data-testid="price-unavailable"]')).not.toBeNull();
  });
});
