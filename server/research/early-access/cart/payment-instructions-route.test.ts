import { describe, expect, it, vi } from "vitest";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { parseEarlyAccessPaymentInstructionsPresentation } from "@shared/research/early-access-payment-instructions";
import { cartCustomerPayloadIsClean } from "@shared/research/early-access-hardening";
import type {
  ManualOrderPaymentMethod,
  ManualPaymentClockPort,
  ManualPaymentMethodRegistryPort,
} from "../../commerce/manual-order-payments";
import type { EarlyAccessPaymentInstructionsConfigSource } from "../commerce/payment-instructions-config";
import {
  createEarlyAccessCartPaymentInstructionsRoute,
  EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH,
} from "./payment-instructions-route";
import type {
  EarlyAccessCartCheckoutStore,
  EarlyAccessCartSettlementStore,
} from "./ports";
import type { EarlyAccessCartIdentityPort } from "./routes";

const CART_NUMBER = "XEC-ABCDEFGH12345678";
const OTHER_CART_NUMBER = "XEC-ZYXWVUTS87654321";
const REFERENCE = "XEA-PAY-8F3K2Q";
const EVALUATED_AT = "2026-08-04T05:30:00.000Z";
const ENABLED_AT = "2026-08-04T05:00:00.000Z";
const CONFIGURED_DESTINATION = "pay-destination@example.test";

function opaque(kind: string, marker: string): string {
  const seed = `${kind}_${marker}`
    .split("")
    .reduce((total, character) => total + character.charCodeAt(0), 0)
    .toString(16);
  return `${kind}:${seed.padStart(64, "0").slice(-64)}`;
}

function snapshot(method: ManualOrderPaymentMethod): unknown {
  return {
    method,
    configurationRef: opaque("payment_config", method),
    instructionsRef: opaque("payment_instructions", method),
    approvalRef: opaque("payment_approval", method),
    approvedByRole: "owner",
    approvedAt: "2026-08-04T04:00:00.000Z",
    verificationRef: opaque("payment_verification", method),
    verifiedByRole: "operations_admin",
    verifiedAt: "2026-08-04T04:30:00.000Z",
    enablementRef: opaque("payment_enablement", method),
    enabledByRole: "owner",
    enabledAt: ENABLED_AT,
  };
}

function checkoutRecord(
  overrides: Record<string, unknown> = {},
): EarlyAccessCartCheckoutRecord {
  return {
    cartCheckoutNumber: CART_NUMBER,
    customerRef: "cust_owner",
    contact: { email: "buyer@example.test", fullName: "Buyer" },
    shipTo: {},
    idempotencyKey: "xeac_abcdefghijklmnop",
    intentHash: "hash",
    quoteId: "xeaq_abcdefghijklmnop",
    children: [],
    invoice: {
      invoiceNumber: "XEA-INV-0001",
      cartCheckoutNumber: CART_NUMBER,
      paymentReference: REFERENCE,
      currency: "USD",
      lines: [],
      subtotalCents: 125_000,
      discountCents: 0,
      shippingCents: 0,
      taxCents: 0,
      payableTotalCents: 125_000,
      instructions: "Payment instructions are provided by the Xenios concierge.",
      issuedAt: EVALUATED_AT,
      status: "awaiting_payment",
    },
    paymentState: "awaiting_payment",
    placedAt: EVALUATED_AT,
    attribution: null,
    ...overrides,
  } as unknown as EarlyAccessCartCheckoutRecord;
}

const CONFIG_DOCUMENT = Object.freeze({
  referenceLabel: "Payment reference",
  methods: [
    {
      code: "zelle",
      methodName: "Zelle",
      destinationLabel: "Zelle email",
      destinationValue: CONFIGURED_DESTINATION,
      steps: ["Send the exact amount due."],
      referenceRequired: true,
    },
  ],
});

function recorder() {
  const headers: Record<string, string> = {};
  const sent: { status: number | null; body: unknown } = {
    status: null,
    body: null,
  };
  const response = {
    status(code: number) {
      sent.status = code;
      return response;
    },
    json(body: unknown) {
      sent.body = body;
    },
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
  return { response, sent, headers };
}

function harness(
  overrides: Partial<{
    customerRef: string | null;
    aliases: readonly string[];
    record: EarlyAccessCartCheckoutRecord | null;
    settlement: Awaited<ReturnType<EarlyAccessCartSettlementStore["settlement"]>>;
    enabledMethods: readonly ManualOrderPaymentMethod[];
    config: unknown;
    configThrows: boolean;
    clockThrows: boolean;
  }> = {},
) {
  const enabled = new Set<ManualOrderPaymentMethod>(
    overrides.enabledMethods ?? ["zelle", "venmo"],
  );
  const commit = vi.fn();
  const identity: EarlyAccessCartIdentityPort = {
    resolve: vi.fn(async () =>
      overrides.customerRef === null
        ? null
        : {
            customerRef: overrides.customerRef ?? "cust_owner",
            aliases: overrides.aliases ?? [],
          },
    ),
  };
  const checkouts = {
    byIdempotencyKey: vi.fn(async () => null),
    byCheckoutNumber: vi.fn(async () =>
      overrides.record === undefined ? checkoutRecord() : overrides.record,
    ),
    commit,
  } as unknown as EarlyAccessCartCheckoutStore;
  const settlements = {
    settlement: vi.fn(async () => overrides.settlement ?? null),
  };
  const config: EarlyAccessPaymentInstructionsConfigSource = {
    read: vi.fn(() => {
      if (overrides.configThrows === true) {
        throw new Error("configuration unavailable");
      }
      return "config" in overrides ? overrides.config : CONFIG_DOCUMENT;
    }),
  };
  const methodRegistry: ManualPaymentMethodRegistryPort = {
    resolveEnabledMethod: vi.fn(({ method }) =>
      enabled.has(method) ? snapshot(method) : null,
    ),
  };
  const clock: ManualPaymentClockPort = {
    now: vi.fn(() => {
      if (overrides.clockThrows === true) throw new Error("clock unavailable");
      return EVALUATED_AT;
    }),
  };
  return {
    route: createEarlyAccessCartPaymentInstructionsRoute({
      identity,
      checkouts,
      settlements,
      config,
      methodRegistry,
      clock,
    }),
    commit,
    checkouts,
    settlements,
    config,
    methodRegistry,
  };
}

describe("createEarlyAccessCartPaymentInstructionsRoute", () => {
  it("is registered under the cart checkout it belongs to", () => {
    expect(EARLY_ACCESS_CART_PAYMENT_INSTRUCTIONS_PATH).toBe(
      "/api/research/early-access/cart/:cartCheckoutNumber/payment-instructions",
    );
  });

  it("refuses an unauthenticated caller and discloses nothing", async () => {
    const { route } = harness({ customerRef: null });
    const { response, sent, headers } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);

    expect(sent.status).toBe(401);
    expect(sent.body).toEqual({ ok: false, code: "SESSION_REQUIRED" });
    expect(JSON.stringify(sent.body)).not.toContain(CONFIGURED_DESTINATION);
    expect(headers["Cache-Control"]).toBe("no-store, private, max-age=0");
  });

  it("answers 404 for someone else's checkout, exactly as for an unknown one", async () => {
    const notOwned = harness({
      customerRef: "cust_someone_else",
      record: checkoutRecord(),
    });
    const first = recorder();
    await notOwned.route({ cartCheckoutNumber: CART_NUMBER }, first.response);
    expect(first.sent.status).toBe(404);
    expect(first.sent.body).toEqual({ ok: false, code: "NOT_FOUND" });

    const unknown = harness({ record: null });
    const second = recorder();
    await unknown.route(
      { cartCheckoutNumber: OTHER_CART_NUMBER },
      second.response,
    );
    expect(second.sent.status).toBe(404);
    expect(second.sent.body).toEqual(first.sent.body);
  });

  it("preserves an owned customerRef alias without exposing the identity seam", async () => {
    const { route } = harness({
      customerRef: "roman_member_ref",
      aliases: ["cust_owner"],
    });
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);

    expect(sent.status).toBe(200);
    expect(JSON.stringify(sent.body)).not.toContain("roman_member_ref");
    expect(JSON.stringify(sent.body)).not.toContain("cust_owner");
  });

  it("closes payable instructions when durable settlement already exists", async () => {
    const { route, settlements, config, methodRegistry } = harness({
      settlement: { cartCheckoutNumber: CART_NUMBER } as never,
    });

    for (let replay = 0; replay < 2; replay += 1) {
      const { response, sent } = recorder();
      await route({ cartCheckoutNumber: CART_NUMBER }, response);
      expect(sent.status).toBe(409);
      expect(sent.body).toEqual({ ok: false, code: "PAYMENT_CLOSED" });
      expect(JSON.stringify(sent.body)).not.toContain(CONFIGURED_DESTINATION);
      expect(JSON.stringify(sent.body)).not.toContain(REFERENCE);
    }

    expect(settlements.settlement).toHaveBeenCalledTimes(2);
    expect(config.read).not.toHaveBeenCalled();
    expect(methodRegistry.resolveEnabledMethod).not.toHaveBeenCalled();
  });

  it.each([
    ["under_review", null],
    ["payment_verified", null],
    ["payment_rejected", null],
    ["awaiting_payment", "duplicate_superseded"],
  ] as const)(
    "closes instructions for payment state %s and disposition %s",
    async (paymentState, disposition) => {
      const { route, config } = harness({
        record: checkoutRecord({ paymentState, disposition }),
      });
      const { response, sent } = recorder();
      await route({ cartCheckoutNumber: CART_NUMBER }, response);

      expect(sent.status).toBe(409);
      expect(sent.body).toEqual({ ok: false, code: "PAYMENT_CLOSED" });
      expect(config.read).not.toHaveBeenCalled();
    },
  );

  it("refuses a checkout number that is not the canonical shape", async () => {
    const { route, checkouts } = harness();
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: "../admin" }, response);
    expect(sent.status).toBe(404);
    expect(checkouts.byCheckoutNumber).not.toHaveBeenCalled();
  });

  it("serves the server's own amount and reference for the owned checkout", async () => {
    const { route } = harness();
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);

    expect(sent.status).toBe(200);
    const body = sent.body as { ok: boolean; presentation: unknown };
    expect(body.ok).toBe(true);
    const decoded = parseEarlyAccessPaymentInstructionsPresentation(
      JSON.parse(JSON.stringify(body.presentation)) as unknown,
    );
    if (decoded?.state !== "resolved") throw new Error("expected resolved");
    expect(decoded.amountDueDisplay).toBe("$1,250.00");
    expect(decoded.paymentReference).toBe(REFERENCE);
    // The browser is never handed the integer it could re-total.
    expect(JSON.stringify(body.presentation)).not.toContain("125000");
  });

  it("shows only methods that are both configured and enabled", async () => {
    // venmo is enabled in the registry but not configured; paypal is neither.
    const { route } = harness({ enabledMethods: ["zelle", "venmo"] });
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);
    const body = sent.body as { presentation: { methods: { code: string }[] } };
    expect(body.presentation.methods.map((method) => method.code)).toEqual([
      "zelle",
    ]);

    // With zelle disabled in the registry, the configured method disappears.
    const disabled = harness({ enabledMethods: ["venmo"] });
    const second = recorder();
    await disabled.route({ cartCheckoutNumber: CART_NUMBER }, second.response);
    const disabledBody = second.sent.body as {
      presentation: { methods: unknown[] };
    };
    expect(disabledBody.presentation.methods).toEqual([]);
    expect(JSON.stringify(second.sent.body)).not.toContain(
      CONFIGURED_DESTINATION,
    );
  });

  it("fails closed with no payment details when configuration or the registry is unusable", async () => {
    const cases = [
      harness({ config: null }),
      harness({ config: { methods: [] } }),
      harness({ configThrows: true }),
      harness({ clockThrows: true }),
    ];
    for (const { route } of cases) {
      const { response, sent } = recorder();
      await route({ cartCheckoutNumber: CART_NUMBER }, response);
      expect(sent.status).toBe(503);
      expect(sent.body).toEqual({ ok: false, code: "UNAVAILABLE" });
      expect(JSON.stringify(sent.body)).not.toContain(CONFIGURED_DESTINATION);
    }
  });

  it("reads only: it never settles, releases, or writes anything", async () => {
    const { route, commit, checkouts, settlements } = harness();
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);

    expect(sent.status).toBe(200);
    expect(commit).not.toHaveBeenCalled();
    expect(checkouts.byCheckoutNumber).toHaveBeenCalledTimes(1);
    expect(settlements.settlement).toHaveBeenCalledTimes(1);

    const serialized = JSON.stringify(sent.body).toLowerCase();
    for (const forbidden of [
      "paid",
      "verified",
      "settle",
      "receipt",
      "release",
      "supplier",
      "outbox",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
    // The checkout the route read is still awaiting a named admin's verification.
    expect(checkoutRecord().paymentState).toBe("awaiting_payment");
  });

  it("never leaks the protected registry's refs or roles to the browser", async () => {
    const { route } = harness();
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);
    const serialized = JSON.stringify(sent.body);
    for (const forbidden of [
      "configurationRef",
      "instructionsRef",
      "approvalRef",
      "enablementRef",
      "operations_admin",
      "customerRef",
      "idempotencyKey",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  // The shared deep predicate, applied to the RESOLVED presentation rather than
  // to a hand-written key list, so this surface is held to the same standard as
  // the quote, checkout and status projections and cannot drift from them.
  it("carries no forbidden customer key at any depth", async () => {
    const { route } = harness();
    const { response, sent } = recorder();
    await route({ cartCheckoutNumber: CART_NUMBER }, response);
    expect(sent.status).toBe(200);
    expect(cartCustomerPayloadIsClean(sent.body)).toBe(true);
  });
});
