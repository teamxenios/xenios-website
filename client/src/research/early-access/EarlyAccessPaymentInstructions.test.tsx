// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EarlyAccessPaymentInstructions } from "./EarlyAccessPaymentInstructions";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEST_ID = "early-access-payment-instructions";
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

function presentation(overrides: Record<string, unknown> = {}): unknown {
  return {
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
        steps: ["Open your bank app.", "Send the exact amount due."],
        copyValue: CONFIGURED_DESTINATION,
        referenceRequired: true,
      },
    ],
    ...overrides,
  };
}

describe("EarlyAccessPaymentInstructions", () => {
  it("fails closed while unresolved, absent, or malformed", () => {
    for (const value of [
      undefined,
      null,
      { state: "unresolved" },
      { state: "resolved" },
      presentation({ methods: [{ code: "zelle" }] }),
      "resolved",
    ]) {
      const container = render(
        <EarlyAccessPaymentInstructions presentation={value} />,
      );
      expect(
        container.querySelector(`[data-testid="${TEST_ID}-pending"]`),
      ).not.toBeNull();
      expect(container.textContent).not.toContain(CONFIGURED_DESTINATION);
      expect(container.textContent).not.toContain("$1,250.00");
      act(() => root!.unmount());
      host?.remove();
    }
  });

  it("shows a configured method and hides one the server did not publish", () => {
    const container = render(
      <EarlyAccessPaymentInstructions presentation={presentation()} />,
    );
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-method-zelle"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-method-venmo"]`),
    ).toBeNull();
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-destination-zelle"]`)
        ?.textContent,
    ).toBe(CONFIGURED_DESTINATION);
  });

  it("says so plainly when no method is confirmed yet", () => {
    const container = render(
      <EarlyAccessPaymentInstructions presentation={presentation({ methods: [] })} />,
    );
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-no-methods"]`),
    ).not.toBeNull();
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-methods"]`),
    ).toBeNull();
  });

  it("renders the server amount and the server payment reference verbatim", () => {
    const container = render(
      <EarlyAccessPaymentInstructions presentation={presentation()} />,
    );
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-amount-due"]`)
        ?.textContent,
    ).toBe("$1,250.00 USD");
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-payment-reference"]`)
        ?.textContent,
    ).toBe("XEA-PAY-8F3K2Q");
  });

  it("does no money arithmetic in the browser", () => {
    const source = readFileSync(
      path.join(HERE, "EarlyAccessPaymentInstructions.tsx"),
      "utf8",
    );
    // No division, multiplication, addition, or currency formatting of cents.
    expect(source).not.toMatch(/\/\s*100\b/);
    expect(source).not.toMatch(/\*\s*100\b/);
    expect(source).not.toContain("Intl.NumberFormat");
    expect(source).not.toMatch(/Cents\b/);
    // No network call either. The panel is handed a decision, it does not fetch one.
    expect(source).not.toMatch(/\bfetch\s*\(/);
  });

  it("renders every supported method presentation type safely", () => {
    const container = render(
      <EarlyAccessPaymentInstructions
        presentation={presentation({
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
            {
              code: "venmo",
              methodName: "Venmo",
              destinationLabel: "Venmo handle",
              destinationValue: "@configured-handle",
              paymentUrl: "https://venmo.example.test/configured-handle",
              steps: [],
              copyValue: "@configured-handle",
              referenceRequired: true,
            },
            {
              code: "paypal",
              methodName: "PayPal",
              destinationLabel: null,
              destinationValue: null,
              paymentUrl: "https://paypal.example.test/configured",
              steps: ["Open the link and send the exact amount due."],
              copyValue: null,
              referenceRequired: false,
            },
            {
              code: "ach_wire",
              methodName: "ACH or bank wire",
              destinationLabel: "Beneficiary",
              destinationValue: "Configured Beneficiary Name",
              paymentUrl: null,
              steps: ["Your bank may take one to three business days."],
              copyValue: "Configured Beneficiary Name",
              referenceRequired: true,
            },
            {
              code: "other",
              methodName: "Other manual method",
              destinationLabel: null,
              destinationValue: null,
              paymentUrl: null,
              steps: ["A Xenios operator will confirm how to send this payment."],
              copyValue: null,
              referenceRequired: false,
            },
          ],
        })}
      />,
    );

    for (const code of ["zelle", "venmo", "paypal", "ach_wire", "other"]) {
      expect(
        container.querySelector(`[data-testid="${TEST_ID}-method-${code}"]`),
      ).not.toBeNull();
    }
    // A method with no copyable value renders no copy control.
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-copy-paypal"]`),
    ).toBeNull();
    expect(
      container.querySelector(`[data-testid="${TEST_ID}-copy-zelle"]`),
    ).not.toBeNull();
    // Reference requirement is stated per method, either way.
    expect(
      container.querySelector(
        `[data-testid="${TEST_ID}-reference-required-ach_wire"]`,
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        `[data-testid="${TEST_ID}-reference-optional-other"]`,
      ),
    ).not.toBeNull();

    const link = container.querySelector<HTMLAnchorElement>(
      `[data-testid="${TEST_ID}-link-venmo"]`,
    );
    expect(link?.getAttribute("href")).toBe(
      "https://venmo.example.test/configured-handle",
    );
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");
  });

  it("copies the exact server value and settles nothing by doing it", () => {
    const onCopy = vi.fn();
    const container = render(
      <EarlyAccessPaymentInstructions
        presentation={presentation()}
        onCopy={onCopy}
      />,
    );

    const copyMethod = container.querySelector<HTMLButtonElement>(
      `[data-testid="${TEST_ID}-copy-zelle"]`,
    );
    const copyReference = container.querySelector<HTMLButtonElement>(
      `[data-testid="${TEST_ID}-copy-reference"]`,
    );
    act(() => copyMethod!.click());
    act(() => copyReference!.click());

    expect(onCopy).toHaveBeenNthCalledWith(1, CONFIGURED_DESTINATION);
    expect(onCopy).toHaveBeenNthCalledWith(2, "XEA-PAY-8F3K2Q");
    expect(copyMethod!.textContent).toBe("Copied");

    // Copying says nothing about the order having been paid.
    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("payment received");
    expect(text).not.toContain("payment confirmed");
    expect(text).toContain("does not send money");
    expect(text).toContain("does not mark this order paid");
  });

  it("has no form, submit control, or settlement affordance at all", () => {
    const container = render(
      <EarlyAccessPaymentInstructions presentation={presentation()} />,
    );
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('input[type="submit"]')).toBeNull();
    for (const button of Array.from(container.querySelectorAll("button"))) {
      expect(button.getAttribute("type")).toBe("button");
      expect(button.textContent?.toLowerCase()).toContain("cop");
    }
  });
});
