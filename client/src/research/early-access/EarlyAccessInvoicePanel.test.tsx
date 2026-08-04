// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";

import { EarlyAccessInvoicePanel } from "./EarlyAccessInvoicePanel";
import { EARLY_ACCESS_FULFILLMENT_TARGET_COPY } from "./fulfillment-copy";
import type { EarlyAccessInvoiceView } from "../adapters/earlyAccessOrder";

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

/** The real numbers from a three-unit bundle at a founder-approved price. */
function invoice(overrides: Partial<EarlyAccessInvoiceView> = {}): EarlyAccessInvoiceView {
  return {
    invoiceNumber: "XEA-INV-0001",
    orderNumber: "XEA-0000000000000001",
    issuedAt: "2026-08-04T12:00:00.000Z",
    status: "issued",
    lines: [],
    subtotalCents: 16_800,
    discountCents: 3_360,
    discountLabel: "3-Unit Research Bundle",
    payableTotalCents: 13_440,
    currency: "USD",
    paymentReference: "XEA-REF-0000000000000001",
    instructions: ["Send by Zelle to payments@example.test", "Include the payment reference"],
    ...overrides,
  };
}

function panel(overrides: Partial<EarlyAccessInvoiceView> = {}) {
  return render(
    <EarlyAccessInvoicePanel
      invoice={invoice(overrides)}
      fulfillmentTargetCopy={EARLY_ACCESS_FULFILLMENT_TARGET_COPY}
    />,
  );
}

describe("invoice and payment instructions", () => {
  it("renders the server's amounts exactly and derives none of them", () => {
    const el = panel();
    expect(el.textContent).toContain("$168.00");
    expect(el.textContent).toContain("$33.60");
    expect(el.textContent).toContain("$134.40");
  });

  it("renders a total that disagrees with its parts, rather than silently correcting it", () => {
    // THE RULE. If the server ever sends parts that do not add up, the server is
    // wrong and must be fixed there. A browser that "corrects" a total is a
    // second pricing runtime, and the customer would be shown a figure they will
    // not be charged. This asserts the component does NOT do that.
    const el = panel({ subtotalCents: 16_800, discountCents: 3_360, payableTotalCents: 99_999 });
    expect(el.querySelector("[data-testid='early-access-invoice-total']")?.textContent).toBe(
      "$999.99",
    );
  });

  it("gives the payment reference its own region and says why it is required", () => {
    // A transfer that arrives without it cannot be matched to this order, and a
    // human reading the bank feed is left guessing.
    const el = panel();
    expect(el.querySelector("[data-testid='early-access-invoice-reference']")?.textContent).toBe(
      "XEA-REF-0000000000000001",
    );
    expect(el.textContent).toContain("we cannot match your payment to this order");
  });

  it("states on the payment screen that paying does not make the order paid", () => {
    // A customer who believes the transfer settles it will expect a shipment
    // that is not coming yet.
    const el = panel();
    expect(el.textContent).toContain("not paid until a member of our team confirms");
  });

  it("hides the discount line entirely when the server applied none", () => {
    // A zero discount line reads as an offer that was lost.
    const el = panel({ discountCents: 0, discountLabel: null });
    expect(el.querySelector("[data-testid='early-access-invoice-discount']")).toBeNull();
    expect(el.textContent).toContain("$168.00");
  });

  it("uses the server's own discount label rather than inventing one", () => {
    const el = panel({ discountLabel: "Founder bundle" });
    expect(el.textContent).toContain("Founder bundle");
  });

  it("renders instructions as given, whether a string or a list", () => {
    const asList = panel();
    expect(asList.textContent).toContain("Include the payment reference");

    const asString = panel({ instructions: "Pay by bank transfer." });
    expect(asString.textContent).toContain("Pay by bank transfer.");

    const none = panel({ instructions: null });
    expect(none.querySelector("[data-testid='early-access-invoice-instructions']")).toBeNull();
  });

  it("carries the fulfillment target as a target and never a promise", () => {
    const el = panel();
    expect(el.textContent).toContain(EARLY_ACCESS_FULFILLMENT_TARGET_COPY);
    const text = (el.textContent ?? "").toLowerCase();
    expect(text).not.toContain("guarantee");
    expect(text).not.toContain("will arrive");
  });

  it("respects a non-USD currency from the server", () => {
    const el = panel({ currency: "EUR" });
    expect(el.querySelector("[data-testid='early-access-invoice-total']")?.textContent).toContain(
      "€",
    );
  });
});
