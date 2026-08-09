// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";

import { EarlyAccessCartPayment } from "./EarlyAccessCartPayment";
import type { EarlyAccessCartCheckout } from "@shared/research/early-access-cart";

/**
 * ONE AMOUNT ON THE PAYMENT SCREEN, AND THE SERVER DECIDES IT.
 *
 * The screen used to show its own "Amount due", formatted in the browser from
 * `payableTotalCents` with `Intl.NumberFormat` and a `/ 100`, while the
 * instructions panel showed the server's `amountDueDisplay`. Two amounts,
 * derived two different ways, on the page where someone is about to send money
 * by hand. If they ever disagreed, nothing on the page told the customer which
 * one to trust.
 *
 * Two tests, deliberately different in kind. The first is behavioural: render
 * it and count. The second reads the source, because "no client-side money
 * arithmetic" is a property of the code and a future `/ 100` could reappear
 * somewhere a render test does not happen to look.
 */

const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

const CHECKOUT: EarlyAccessCartCheckout = {
  cartCheckoutNumber: "XEC-ONEAMOUNTAAAAAAAAAAAAAAA",
  contact: { email: "buyer@example.com", phone: "+15555550100" },
  shipTo: {
    recipientName: "A Buyer",
    line1: "1 Test Way",
    line2: null,
    city: "Houston",
    region: "TX",
    postalCode: "77002",
    country: "US",
  },
  children: [],
  invoice: {
    invoiceNumber: "XEI-ONEAMOUNTAAAAAAAAAAAAAAA",
    cartCheckoutNumber: "XEC-ONEAMOUNTAAAAAAAAAAAAAAA",
    paymentReference: "XEACART-ONEAMOUNTAAAAAAAAAAAAAAA",
    currency: "USD",
    lines: [],
    subtotalCents: 10_350,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    // The figure the browser USED to format and display on its own.
    payableTotalCents: 10_350,
    instructions: "Use the payment reference exactly as shown.",
    issuedAt: "2026-08-09T00:45:48.379Z",
    status: "awaiting_payment",
  },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-09T00:45:48.379Z",
} as EarlyAccessCartCheckout;

const RESOLVED = {
  state: "resolved",
  amountDueDisplay: "$103.50",
  currency: "USD",
  paymentReference: "XEACART-ONEAMOUNTAAAAAAAAAAAAAAA",
  referenceLabel: "Payment reference",
  methods: [
    {
      code: "zelle",
      methodName: "Zelle",
      destinationLabel: "Send to",
      destinationValue: "payments@example.com",
      paymentUrl: null,
      steps: ["Include the payment reference."],
      copyValue: "payments@example.com",
      referenceRequired: true,
    },
  ],
};

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  if (root) act(() => root!.unmount());
  host?.remove();
  root = null;
  host = null;
});

function payment(instructions?: unknown): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(
    <EarlyAccessCartPayment
      checkout={CHECKOUT}
      paymentInstructions={instructions}
      copied={false}
      onCopy={() => {}}
      onSubmitOrder={() => {}}
      onStatus={() => {}}
    />,
    );
  });
  return host;
}

/** Every text node matching a pattern, so "exactly one" is countable. */
function occurrences(pattern: RegExp): string[] {
  const text = host?.textContent ?? "";
  return text.match(new RegExp(pattern.source, "g")) ?? [];
}

describe("the payment screen shows exactly one amount", () => {
  it("shows the SERVER amount once, and never the browser's own formatting of the same money", () => {
    payment(RESOLVED);

    // The server's figure is present, exactly once.
    expect(occurrences(/\$103\.50/)).toHaveLength(1);

    // And there is no second "Amount due" row. Before this change the summary
    // list carried its own, so the page had two.
    expect(occurrences(/Amount due/)).toHaveLength(1);
  });

  it("says details are being confirmed when unresolved, rather than falling back to a browser total", () => {
    payment(undefined);

    // No amount at all. The old fallback would have rendered $103.50 here from
    // payableTotalCents, which is precisely the second source of truth this
    // removes: an amount shown while the server has not said what to pay.
    expect(occurrences(/\$103\.50/)).toHaveLength(0);
    expect(occurrences(/103\.50/)).toHaveLength(0);
  });
});

/**
 * Comments are stripped before matching. The file explains in prose what it no
 * longer does, and that explanation names `/ 100` and `Intl.NumberFormat`. A
 * check that reads the prose fails on the documentation of its own rule, which
 * would teach the next person to delete the comment rather than keep the
 * property. The property is about CODE.
 */
function codeOnly(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

describe("the payment component performs no money arithmetic", () => {
  const source = codeOnly(
    readFileSync(path.join(HERE, "EarlyAccessCartPayment.tsx"), "utf8"),
  );

  it.each([
    ["divides cents", /\/\s*100\b/],
    ["multiplies to cents", /\*\s*100\b/],
    ["formats currency in the browser", /Intl\.NumberFormat/],
  ])("does not %s", (_label, pattern) => {
    expect(source).not.toMatch(pattern);
  });

  it("no longer carries a money helper that could drift back into use", () => {
    expect(source).not.toMatch(/function money\s*\(/);
  });

  it("reads a non-trivial file, so the assertions above are not vacuous", () => {
    expect(source.length).toBeGreaterThan(600);
    expect(source).toContain("EarlyAccessPaymentInstructions");
  });
});
