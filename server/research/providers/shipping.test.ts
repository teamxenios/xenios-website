import { describe, expect, it, afterEach } from "vitest";
import {
  CarrierShippingAdapter,
  ConfiguredRateShippingProvider,
  DisabledShippingProvider,
  TestShippingProvider,
  resolveShippingProvider,
  type QuoteRequest,
} from "./shipping";
import { STANDARD_SHIPPING_CENTS } from "@shared/research/commerce";

function request(overrides: Partial<QuoteRequest> = {}): QuoteRequest {
  return {
    destination: { line1: "1 Example Street", city: "Houston", state: "TX", postalCode: "77002", country: "US" },
    service: "standard",
    weightGrams: 250,
    temperatureControlled: false,
    ...overrides,
  };
}

describe("DisabledShippingProvider", () => {
  it("refuses every operation without throwing", async () => {
    const p = new DisabledShippingProvider();
    for (const r of [
      await p.quote(),
      await p.buyLabel(),
      await p.track(),
      await p.cancelLabel(),
      await p.validateAddress(),
      await p.verifyWebhook(),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("DISABLED");
    }
  });
});

describe("ConfiguredRateShippingProvider", () => {
  const p = new ConfiguredRateShippingProvider();

  it("quotes the founder standard rate", async () => {
    const r = await p.quote(request());
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.amountCents).toBe(STANDARD_SHIPPING_CENTS);
  });

  // The core honesty property of this provider.
  it("labels the quote as a configured fallback and carries no delivery date", async () => {
    const r = await p.quote(request());
    if (r.ok) {
      expect(r.value.kind).toBe("configured_fallback");
      expect(r.value.estimatedDeliveryRange).toBeNull();
      expect(r.value.disclosure).toContain("not a live carrier quote");
    }
  });

  it("declares that its quotes are not live", () => {
    expect(p.quotesAreLive).toBe(false);
  });

  // Refusing beats guessing a price for a service xenios cannot actually buy.
  it("refuses every service that genuinely needs a carrier", async () => {
    for (const service of ["expedited_2day", "next_day", "same_day"] as const) {
      const r = await p.quote(request({ service }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("live carrier quote");
    }
  });

  it("refuses temperature-controlled shipping without a validated service", async () => {
    const r = await p.quote(request({ temperatureControlled: true }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("validated carrier service");
  });

  it("refuses to quote an unknown package weight", async () => {
    const r = await p.quote(request({ weightGrams: 0 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("refuses to buy a label or track without a carrier account", async () => {
    expect((await p.buyLabel()).ok).toBe(false);
    expect((await p.track()).ok).toBe(false);
  });

  describe("structural address validation", () => {
    it("accepts a well formed US address and normalizes the state", async () => {
      const r = await p.validateAddress({
        line1: "1 Example Street",
        city: "Houston",
        state: "TX",
        postalCode: "77002",
        country: "US",
      });
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.normalized.state).toBe("TX");
    });

    it("rejects a malformed state or ZIP", async () => {
      const bad = { line1: "x", city: "y", country: "US" as const };
      expect((await p.validateAddress({ ...bad, state: "Texas", postalCode: "77002" })).ok).toBe(false);
      expect((await p.validateAddress({ ...bad, state: "TX", postalCode: "7700" })).ok).toBe(false);
    });

    it("accepts ZIP+4", async () => {
      const r = await p.validateAddress({
        line1: "x",
        city: "y",
        state: "TX",
        postalCode: "77002-1234",
        country: "US",
      });
      expect(r.ok).toBe(true);
    });
  });
});

describe("TestShippingProvider", () => {
  it("returns a live-kind quote with a delivery range", async () => {
    const p = new TestShippingProvider();
    const r = await p.quote(request());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.kind).toBe("live_carrier_quote");
      expect(r.value.estimatedDeliveryRange).not.toBeNull();
    }
  });

  it("is idempotent on label purchase", async () => {
    const p = new TestShippingProvider();
    const a = await p.buyLabel(request(), "ord_1", "key_1");
    const b = await p.buyLabel(request(), "ord_1", "key_1");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) expect(b.value.trackingNumber).toBe(a.value.trackingNumber);
  });

  it("issues a distinct label for a different key", async () => {
    const p = new TestShippingProvider();
    const a = await p.buyLabel(request(), "ord_1", "key_1");
    const b = await p.buyLabel(request(), "ord_2", "key_2");
    if (a.ok && b.ok) expect(b.value.trackingNumber).not.toBe(a.value.trackingNumber);
  });

  it("refuses to cancel an unknown label", async () => {
    const p = new TestShippingProvider();
    expect((await p.cancelLabel("nope")).ok).toBe(false);
  });

  it("rejects an unsigned webhook", async () => {
    const p = new TestShippingProvider();
    expect((await p.verifyWebhook(JSON.stringify({ id: "e1" }), undefined)).ok).toBe(false);
  });
});

describe("CarrierShippingAdapter shell", () => {
  it("refuses rather than faking a quote", async () => {
    const r = await new CarrierShippingAdapter().quote();
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
  });

  it("declares credential names only", () => {
    expect(CarrierShippingAdapter.requiredEnvironmentVariables).toEqual([
      "SHIPPING_PROVIDER",
      "SHIPPING_API_KEY",
    ]);
  });
});

describe("resolveShippingProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  // Deliberately NOT disabled by default: a flat rate needs no credential, and
  // quoting it honestly serves a member better than showing nothing.
  it("defaults to the configured rate provider", () => {
    expect(resolveShippingProvider({} as NodeJS.ProcessEnv).name).toBe("configured_rate");
  });

  it("can be explicitly disabled", () => {
    expect(
      resolveShippingProvider({ RESEARCH_SHIPPING_DISABLED: "true" } as NodeJS.ProcessEnv).name,
    ).toBe("disabled");
  });

  it("does not use a live carrier unless the live flag is on", () => {
    const p = resolveShippingProvider({ SHIPPING_PROVIDER: "carrier" } as NodeJS.ProcessEnv);
    expect(p.name).toBe("configured_rate");
  });

  it("selects the carrier adapter when live shipping is enabled", () => {
    const p = resolveShippingProvider({
      RESEARCH_LIVE_SHIPPING_ENABLED: "true",
      SHIPPING_PROVIDER: "carrier",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("carrier");
  });

  it("falls back to the configured rate rather than the test provider in production", () => {
    const p = resolveShippingProvider({
      RESEARCH_LIVE_SHIPPING_ENABLED: "true",
      SHIPPING_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("configured_rate");
  });
});
