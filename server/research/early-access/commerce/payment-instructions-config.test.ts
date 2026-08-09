import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EARLY_ACCESS_PAYMENT_OPTION_CODES } from "@shared/research/early-access-payment-options";
import { parseEarlyAccessPaymentInstructionsPresentation } from "@shared/research/early-access-payment-instructions";
import {
  buildEarlyAccessPaymentInstructionsPresentation,
  createEnvPaymentInstructionsConfigSource,
  describeEarlyAccessPaymentInstructionsConfig,
  EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV,
  parseEarlyAccessPaymentInstructionsConfig,
  type EarlyAccessPaymentInstructionsConfig,
} from "./payment-instructions-config";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REFERENCE = "XEA-PAY-8F3K2Q";

/**
 * Values that would be a real destination if they were ever committed. They
 * exist ONLY in this test, which is the point: the source tree must be able to
 * present a payment method without holding one.
 */
const CONFIGURED = Object.freeze({
  zelle: "pay-destination@example.test",
  cashtag: "$ConfiguredCashtag",
  venmo: "@configured-handle",
});

function document(overrides: Record<string, unknown> = {}): unknown {
  return {
    referenceLabel: "Payment reference",
    methods: [
      {
        code: "zelle",
        methodName: "Zelle",
        destinationLabel: "Zelle email",
        destinationValue: CONFIGURED.zelle,
        steps: ["Open your bank app.", "Send the exact amount due."],
        referenceRequired: true,
      },
      {
        code: "cash_app",
        methodName: "Cash App",
        destinationLabel: "Cashtag",
        destinationValue: CONFIGURED.cashtag,
        paymentUrl: "https://cash.example.test/ConfiguredCashtag",
        referenceRequired: true,
      },
    ],
    ...overrides,
  };
}

function accepted(value: unknown): EarlyAccessPaymentInstructionsConfig {
  const result = parseEarlyAccessPaymentInstructionsConfig(value);
  if (result.state !== "accepted") {
    throw new Error(`expected accepted configuration, got ${result.code}`);
  }
  return result.value;
}

describe("parseEarlyAccessPaymentInstructionsConfig", () => {
  it("accepts a well-formed document and puts methods in canonical order", () => {
    const config = accepted(
      document({
        methods: [
          {
            code: "cash_app",
            methodName: "Cash App",
            destinationValue: CONFIGURED.cashtag,
            referenceRequired: true,
          },
          {
            code: "zelle",
            methodName: "Zelle",
            destinationValue: CONFIGURED.zelle,
            referenceRequired: true,
          },
        ],
      }),
    );
    expect(config.methods.map((method) => method.code)).toEqual([
      "zelle",
      "cash_app",
    ]);
  });

  it("defaults the copy value to the destination and the label to a plain one", () => {
    const config = accepted(
      parseJson(`{"methods":[{"code":"venmo","methodName":"Venmo","destinationValue":"${CONFIGURED.venmo}","referenceRequired":false}]}`),
    );
    expect(config.referenceLabel).toBe("Payment reference");
    expect(config.methods[0]?.copyValue).toBe(CONFIGURED.venmo);
    expect(config.methods[0]?.steps).toEqual([]);
  });

  it("treats an absent document as absent, not as an empty configuration", () => {
    for (const value of [null, undefined]) {
      const result = parseEarlyAccessPaymentInstructionsConfig(value);
      expect(result.state).toBe("refused");
      if (result.state !== "refused") throw new Error("expected refusal");
      expect(result.code).toBe("config_absent");
    }
  });

  it("refuses the WHOLE document when any one method is malformed", () => {
    const bad: unknown[] = [
      document({ methods: [] }),
      document({ methods: "zelle" }),
      document({ referenceLabel: "" }),
      document({ unexpected: true }),
      // Unknown code.
      document({
        methods: [
          { code: "bitcoin", methodName: "Bitcoin", destinationValue: "x", referenceRequired: true },
        ],
      }),
      // Duplicate code.
      document({
        methods: [
          { code: "zelle", methodName: "Zelle", destinationValue: CONFIGURED.zelle, referenceRequired: true },
          { code: "zelle", methodName: "Zelle again", destinationValue: CONFIGURED.zelle, referenceRequired: true },
        ],
      }),
      // Missing the required flag.
      document({
        methods: [{ code: "zelle", methodName: "Zelle", destinationValue: CONFIGURED.zelle }],
      }),
      // Nothing a customer could act on.
      document({
        methods: [{ code: "other", methodName: "Other", referenceRequired: false }],
      }),
      // Unexpected key on a method.
      document({
        methods: [
          {
            code: "zelle",
            methodName: "Zelle",
            destinationValue: CONFIGURED.zelle,
            referenceRequired: true,
            accountNumber: "123456789",
          },
        ],
      }),
    ];
    for (const value of bad) {
      const result = parseEarlyAccessPaymentInstructionsConfig(value);
      expect(result.state).toBe("refused");
      if (result.state !== "refused") throw new Error("expected refusal");
      expect(result.code).toBe("config_invalid");
    }
  });

  it("refuses a payment link that is not an absolute https URL without credentials", () => {
    for (const paymentUrl of [
      "http://cash.example.test/ConfiguredCashtag",
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "https://user:secret@cash.example.test/ConfiguredCashtag",
      "/cash/ConfiguredCashtag",
    ]) {
      const result = parseEarlyAccessPaymentInstructionsConfig(
        document({
          methods: [
            {
              code: "cash_app",
              methodName: "Cash App",
              destinationValue: CONFIGURED.cashtag,
              paymentUrl,
              referenceRequired: true,
            },
          ],
        }),
      );
      expect(result.state).toBe("refused");
    }
  });
});

describe("createEnvPaymentInstructionsConfigSource", () => {
  it("reads the named variable and refuses when it is absent or malformed", () => {
    const present = createEnvPaymentInstructionsConfigSource({
      [EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV]: JSON.stringify(document()),
    } as NodeJS.ProcessEnv);
    expect(parseEarlyAccessPaymentInstructionsConfig(present.read()).state).toBe(
      "accepted",
    );

    const absent = createEnvPaymentInstructionsConfigSource({} as NodeJS.ProcessEnv);
    expect(absent.read()).toBeNull();

    const malformed = createEnvPaymentInstructionsConfigSource({
      [EARLY_ACCESS_PAYMENT_INSTRUCTIONS_ENV]: "{not json",
    } as NodeJS.ProcessEnv);
    const parsed = parseEarlyAccessPaymentInstructionsConfig(malformed.read());
    expect(parsed.state).toBe("refused");
    // The unreadable document is never echoed back in the failure value.
    expect(JSON.stringify(parsed)).not.toContain("not json");
  });
});

describe("buildEarlyAccessPaymentInstructionsPresentation", () => {
  const config = accepted(document());

  it("shows a configured method and hides an unconfigured one", () => {
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config,
      // The registry enables more methods than the deployment configured.
      enabledCodes: [...EARLY_ACCESS_PAYMENT_OPTION_CODES],
      amountDueCents: 125_000,
      currency: "USD",
      paymentReference: REFERENCE,
    });
    if (presentation.state !== "resolved") throw new Error("expected resolved");
    expect(presentation.methods.map((method) => method.code)).toEqual([
      "zelle",
      "cash_app",
    ]);
  });

  it("hides a configured method the protected registry has not enabled", () => {
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config,
      enabledCodes: ["zelle"],
      amountDueCents: 125_000,
      currency: "USD",
      paymentReference: REFERENCE,
    });
    if (presentation.state !== "resolved") throw new Error("expected resolved");
    expect(presentation.methods.map((method) => method.code)).toEqual(["zelle"]);
  });

  it("formats the amount on the server and publishes no cents to the browser", () => {
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config,
      enabledCodes: ["zelle"],
      amountDueCents: 125_000,
      currency: "USD",
      paymentReference: REFERENCE,
    });
    if (presentation.state !== "resolved") throw new Error("expected resolved");
    expect(presentation.amountDueDisplay).toBe("$1,250.00");
    expect(presentation.paymentReference).toBe(REFERENCE);
    expect(JSON.stringify(presentation)).not.toContain("125000");
    expect(Object.keys(presentation)).not.toContain("payableTotalCents");
  });

  it("produces exactly what the browser decoder accepts", () => {
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config,
      enabledCodes: ["zelle", "cash_app"],
      amountDueCents: 125_000,
      currency: "USD",
      paymentReference: REFERENCE,
    });
    expect(
      parseEarlyAccessPaymentInstructionsPresentation(
        JSON.parse(JSON.stringify(presentation)) as unknown,
      ),
    ).not.toBeNull();
  });

  it("fails closed on any unexpected order value", () => {
    const bad = [
      { amountDueCents: 0 },
      { amountDueCents: -1 },
      { amountDueCents: 1.5 },
      { amountDueCents: 100_000_001 },
      { amountDueCents: "125000" },
      { currency: "usd" },
      { currency: "DOLLARS" },
      { paymentReference: "short" },
      { paymentReference: "XEA PAY" },
      { enabledCodes: "zelle" as unknown as readonly unknown[] },
      { enabledCodes: ["zelle", "bitcoin"] },
    ];
    for (const overrides of bad) {
      const presentation = buildEarlyAccessPaymentInstructionsPresentation({
        config,
        enabledCodes: ["zelle"],
        amountDueCents: 125_000,
        currency: "USD",
        paymentReference: REFERENCE,
        ...overrides,
      });
      expect(presentation.state).toBe("unresolved");
    }
  });

  it("never settles, releases, or otherwise moves the order", () => {
    const presentation = buildEarlyAccessPaymentInstructionsPresentation({
      config,
      enabledCodes: ["zelle"],
      amountDueCents: 125_000,
      currency: "USD",
      paymentReference: REFERENCE,
    });
    const serialized = JSON.stringify(presentation);
    for (const forbidden of [
      "paid",
      "verified",
      "settle",
      "receipt",
      "release",
      "supplier",
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("configuration is never disclosed by accident", () => {
  it("describes configuration with codes and counts only", () => {
    const config = accepted(document());
    const described = describeEarlyAccessPaymentInstructionsConfig(config);
    expect(described).toEqual({ methodCount: 2, codes: ["zelle", "cash_app"] });
    const serialized = JSON.stringify(described);
    for (const value of Object.values(CONFIGURED)) {
      expect(serialized).not.toContain(value);
    }
    expect(serialized).not.toContain("cash.example.test");
  });

  it("holds no destination in source and logs nothing itself", () => {
    for (const file of [
      "payment-instructions-config.ts",
      "../cart/payment-instructions-route.ts",
    ]) {
      const source = readFileSync(path.join(HERE, file), "utf8");
      // No logging call of any kind can exist in a module that handles
      // payment configuration.
      expect(source).not.toMatch(/console\s*\./);
      // No configured destination is written down here. The '@example.test'
      // values used above live only in this test file.
      expect(source).not.toContain("@example.test");
      expect(source).not.toMatch(/\$[A-Z][A-Za-z0-9]{4,}/);
    }
  });
});

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown;
}
