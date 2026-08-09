import { describe, expect, it } from "vitest";
import {
  isSafePaymentUrl,
  parseEarlyAccessPaymentInstructionsPresentation,
  unresolvedEarlyAccessPaymentInstructions,
} from "./early-access-payment-instructions";

function method(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    code: "zelle",
    methodName: "Zelle",
    destinationLabel: "Zelle email",
    destinationValue: "configured-destination@example.test",
    paymentUrl: null,
    steps: ["Open your bank app.", "Send the exact amount due."],
    copyValue: "configured-destination@example.test",
    referenceRequired: true,
    ...overrides,
  };
}

function resolved(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: "resolved",
    amountDueDisplay: "$1,250.00",
    currency: "USD",
    paymentReference: "XEA-PAY-8F3K2Q",
    referenceLabel: "Payment reference",
    methods: [method()],
    ...overrides,
  };
}

describe("parseEarlyAccessPaymentInstructionsPresentation", () => {
  it("accepts the exact unresolved and resolved shapes", () => {
    expect(
      parseEarlyAccessPaymentInstructionsPresentation({ state: "unresolved" }),
    ).toEqual(unresolvedEarlyAccessPaymentInstructions());

    const parsed = parseEarlyAccessPaymentInstructionsPresentation(resolved());
    expect(parsed?.state).toBe("resolved");
    if (parsed?.state !== "resolved") throw new Error("expected resolved");
    expect(parsed.amountDueDisplay).toBe("$1,250.00");
    expect(parsed.paymentReference).toBe("XEA-PAY-8F3K2Q");
    expect(parsed.methods).toHaveLength(1);
    expect(parsed.methods[0]?.destinationValue).toBe(
      "configured-destination@example.test",
    );
    expect(parsed.methods[0]?.referenceRequired).toBe(true);
  });

  it("freezes what it returns, so browser code cannot rewrite a server decision", () => {
    const parsed = parseEarlyAccessPaymentInstructionsPresentation(resolved());
    if (parsed?.state !== "resolved") throw new Error("expected resolved");
    expect(Object.isFrozen(parsed)).toBe(true);
    expect(Object.isFrozen(parsed.methods)).toBe(true);
    expect(Object.isFrozen(parsed.methods[0])).toBe(true);
    expect(Object.isFrozen(parsed.methods[0]?.steps)).toBe(true);
  });

  it("accepts every supported method presentation type", () => {
    const parsed = parseEarlyAccessPaymentInstructionsPresentation(
      resolved({
        methods: [
          // Destination only.
          method({ code: "zelle" }),
          // Handle plus a link.
          method({
            code: "venmo",
            methodName: "Venmo",
            destinationLabel: "Venmo handle",
            destinationValue: "@configured-handle",
            paymentUrl: "https://venmo.example.test/configured-handle",
            copyValue: "@configured-handle",
            referenceRequired: true,
          }),
          // Cashtag.
          method({
            code: "cash_app",
            methodName: "Cash App",
            destinationLabel: "Cashtag",
            destinationValue: "$ConfiguredCashtag",
            copyValue: "$ConfiguredCashtag",
          }),
          // Link only, no in-page destination.
          method({
            code: "paypal",
            methodName: "PayPal",
            destinationLabel: null,
            destinationValue: null,
            paymentUrl: "https://paypal.example.test/configured",
            copyValue: null,
            steps: ["Open the PayPal link and send the exact amount due."],
          }),
          // Steps only, no destination and no link.
          method({
            code: "apple_cash",
            methodName: "Apple Cash",
            destinationLabel: null,
            destinationValue: null,
            paymentUrl: null,
            copyValue: null,
            steps: ["Ask your Xenios contact for the Apple Cash destination."],
            referenceRequired: false,
          }),
          // Bank transfer, reference required.
          method({
            code: "ach_wire",
            methodName: "ACH or bank wire",
            destinationLabel: "Beneficiary",
            destinationValue: "Configured Beneficiary Name",
            copyValue: "Configured Beneficiary Name",
          }),
          method({
            code: "other",
            methodName: "Other manual method",
            destinationLabel: null,
            destinationValue: null,
            paymentUrl: null,
            copyValue: null,
            steps: ["A Xenios operator will confirm how to send this payment."],
            referenceRequired: false,
          }),
        ],
      }),
    );
    if (parsed?.state !== "resolved") throw new Error("expected resolved");
    expect(parsed.methods.map((entry) => entry.code)).toEqual([
      "zelle",
      "venmo",
      "cash_app",
      "paypal",
      "apple_cash",
      "ach_wire",
      "other",
    ]);
  });

  it("refuses anything that is not exactly one of the two shapes", () => {
    const rejected: unknown[] = [
      null,
      undefined,
      "resolved",
      42,
      [],
      { state: "resolved" },
      { state: "unresolved", methods: [] },
      { ...resolved(), extra: true },
      { ...resolved(), state: "RESOLVED" },
      resolved({ methods: {} }),
      resolved({ methods: [method({ code: "bitcoin" })] }),
      resolved({ methods: [method({ methodName: "" })] }),
      resolved({ methods: [method({ referenceRequired: "yes" })] }),
      resolved({ methods: [method({ steps: "Send it." })] }),
      resolved({ methods: [method({ steps: [""] })] }),
      // Nothing a customer could act on.
      resolved({
        methods: [
          method({ destinationValue: null, paymentUrl: null, steps: [] }),
        ],
      }),
    ];
    for (const value of rejected) {
      expect(parseEarlyAccessPaymentInstructionsPresentation(value)).toBeNull();
    }
  });

  it("refuses a duplicated or reordered method list", () => {
    expect(
      parseEarlyAccessPaymentInstructionsPresentation(
        resolved({ methods: [method(), method()] }),
      ),
    ).toBeNull();
    expect(
      parseEarlyAccessPaymentInstructionsPresentation(
        resolved({
          methods: [
            method({ code: "venmo", methodName: "Venmo" }),
            method({ code: "zelle" }),
          ],
        }),
      ),
    ).toBeNull();
  });

  it("refuses money and reference values it did not expect", () => {
    const rejected = [
      resolved({ amountDueDisplay: "" }),
      resolved({ amountDueDisplay: "1250" .padEnd(64, "0") }),
      resolved({ currency: "usd" }),
      resolved({ currency: "DOLLARS" }),
      resolved({ paymentReference: "short" }),
      resolved({ paymentReference: "XEA PAY 8F3K2Q" }),
      resolved({ referenceLabel: "" }),
    ];
    for (const value of rejected) {
      expect(parseEarlyAccessPaymentInstructionsPresentation(value)).toBeNull();
    }
  });

  it("never evaluates an accessor and refuses a Proxy imitating a record", () => {
    let touched = 0;
    const withGetter = Object.defineProperty({ state: "resolved" }, "methods", {
      enumerable: true,
      get() {
        touched += 1;
        return [method()];
      },
    });
    expect(
      parseEarlyAccessPaymentInstructionsPresentation(withGetter),
    ).toBeNull();
    expect(touched).toBe(0);

    const proxied = new Proxy(resolved(), {});
    expect(parseEarlyAccessPaymentInstructionsPresentation(proxied)).toBeNull();
  });

  it("refuses a foreign prototype and prototype pollution", () => {
    const foreign = Object.assign(Object.create({ state: "unresolved" }), {});
    expect(parseEarlyAccessPaymentInstructionsPresentation(foreign)).toBeNull();

    const polluted = JSON.parse(
      '{"state":"unresolved","__proto__":{"polluted":true}}',
    ) as unknown;
    expect(parseEarlyAccessPaymentInstructionsPresentation(polluted)).toBeNull();
  });
});

describe("isSafePaymentUrl", () => {
  it("admits only absolute https links with no embedded credentials", () => {
    expect(isSafePaymentUrl("https://venmo.example.test/handle")).toBe(true);
    expect(
      isSafePaymentUrl("https://cash.example.test/$Cashtag?amount=1"),
    ).toBe(true);

    for (const value of [
      "http://venmo.example.test/handle",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//venmo.example.test/handle",
      "/relative/path",
      "https://user:secret@venmo.example.test/handle",
      "https://venmo.example.test/handle ",
      "",
      null,
      42,
    ]) {
      expect(isSafePaymentUrl(value)).toBe(false);
    }
  });

  it("keeps a hostile scheme out of the decoded presentation", () => {
    expect(
      parseEarlyAccessPaymentInstructionsPresentation(
        resolved({
          methods: [method({ paymentUrl: "javascript:alert(document.cookie)" })],
        }),
      ),
    ).toBeNull();
  });
});
