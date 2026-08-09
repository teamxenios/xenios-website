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
        onSubmitOrder={() => undefined}
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
        onSubmitOrder={() => undefined}
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
        onSubmitOrder={() => undefined}
        onStatus={() => undefined}
        paymentInstructions={PRESENTATION}
      />,
    );
    // The exact server state, pinned. It moved from customer-facing text to a
    // data attribute so a person is not shown database vocabulary, and the
    // assertion got STRICTER in the move: it now checks the precise value on
    // the precise element rather than searching the whole screen for a
    // substring that any other node could have satisfied.
    expect(
      container
        .querySelector('[data-testid="early-access-payment-state"]')
        ?.getAttribute("data-payment-state"),
    ).toBe("awaiting_payment");
    const text = container.textContent?.toLowerCase() ?? "";
    // The same fact, in words a customer can act on.
    expect(text).toContain("not confirmed by xenios yet");
    expect(text).not.toContain("payment received");
    expect(text).not.toContain("payment verified");
    // Raw state vocabulary must not reach the customer as readable text.
    expect(container.textContent).not.toContain("awaiting_payment");
    expect(container.querySelector("form")).toBeNull();
  });

  it("says the checkout is reserved and NOT yet submitted for review", () => {
    const container = render(
      <EarlyAccessCartPayment
        checkout={CHECKOUT}
        copied={false}
        onCopy={() => undefined}
        onSubmitOrder={() => undefined}
        onStatus={() => undefined}
        paymentInstructions={PRESENTATION}
      />,
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Checkout reserved");
    expect(text).toContain("has not been submitted for payment review yet");
    // The two milestones must never be conflated on this screen.
    expect(text).not.toContain("Order submitted");
    expect(text.toLowerCase()).not.toContain("order placed");
  });
});
