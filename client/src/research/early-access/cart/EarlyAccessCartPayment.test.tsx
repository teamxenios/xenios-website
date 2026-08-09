// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { EarlyAccessCartCheckout } from "@shared/research/early-access-cart";
import { EarlyAccessCartPayment } from "./EarlyAccessCartPayment";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const PANEL = "early-access-payment-instructions";
const CONFIGURED_DESTINATION = "pay-destination@example.test";

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.restoreAllMocks();
});

function render(node: ReactElement): HTMLDivElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

const CHECKOUT = {
  cartCheckoutNumber: "XEC-ABCDEFGH12345678",
  contact: { email: "buyer@example.test", fullName: "Buyer" },
  shipTo: {},
  children: [],
  invoice: {
    invoiceNumber: "XEA-INV-0001",
    cartCheckoutNumber: "XEC-ABCDEFGH12345678",
    paymentReference: "XEA-PAY-8F3K2Q",
    currency: "USD",
    lines: [],
    subtotalCents: 125_000,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    payableTotalCents: 125_000,
    instructions: "Payment instructions are provided by the Xenios concierge.",
    issuedAt: "2026-08-04T05:30:00.000Z",
    status: "awaiting_payment",
  },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-04T05:30:00.000Z",
} as unknown as EarlyAccessCartCheckout;

const PRESENTATION = {
  state: "resolved",
  amountDueDisplay: "$1,250.00",
  currency: "USD",
  paymentReference: "XEA-PAY-8F3K2Q",
  referenceLabel: "Payment reference",
  methods: [
    {
      code: "zelle",
      methodName: "Zelle",
      destinationLabel: "Zelle email",
      destinationValue: CONFIGURED_DESTINATION,
      paymentUrl: null,
      steps: ["Send the exact amount due."],
      copyValue: CONFIGURED_DESTINATION,
      referenceRequired: true,
    },
  ],
};

describe("EarlyAccessCartPayment", () => {
  it("shows the payment screen unchanged when no instructions are supplied", () => {
    const container = render(
      <EarlyAccessCartPayment
        checkout={CHECKOUT}
        copied={false}
        onCopy={() => undefined}
        onStatus={() => undefined}
      />,
    );
    expect(container.textContent).toContain("XEA-PAY-8F3K2Q");
    // The panel is present but says details are being confirmed, and no
    // destination is invented in its place.
    expect(container.querySelector(`[data-testid="${PANEL}-pending"]`)).not.toBeNull();
    expect(container.textContent).not.toContain(CONFIGURED_DESTINATION);
  });

  it("renders the server's payment instructions when the journey supplies them", () => {
    const container = render(
      <EarlyAccessCartPayment
        checkout={CHECKOUT}
        copied={false}
        onCopy={() => undefined}
        onStatus={() => undefined}
        paymentInstructions={PRESENTATION}
      />,
    );
    expect(container.querySelector(`[data-testid="${PANEL}"]`)).not.toBeNull();
    expect(
      container.querySelector(`[data-testid="${PANEL}-destination-zelle"]`)
        ?.textContent,
    ).toBe(CONFIGURED_DESTINATION);
    expect(
      container.querySelector(`[data-testid="${PANEL}-amount-due"]`)?.textContent,
    ).toBe("$1,250.00 USD");
  });

  it("keeps the order awaiting payment however the screen is rendered", () => {
    const container = render(
      <EarlyAccessCartPayment
        checkout={CHECKOUT}
        copied={false}
        onCopy={() => undefined}
        onStatus={() => undefined}
        paymentInstructions={PRESENTATION}
      />,
    );
    expect(container.textContent).toContain("awaiting_payment");
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("payment received");
    expect(text).not.toContain("payment verified");
    expect(container.querySelector("form")).toBeNull();
  });
});
