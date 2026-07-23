import { describe, expect, it, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import {
  CarrierShippingAdapter,
  ConfiguredRateShippingProvider,
  DisabledShippingProvider,
  TestShippingProvider,
  mapCarrierTrackingStatus,
  packageProfileFor,
  resolveShippingProvider,
  validateCarrierShippingEnvironment,
  type CarrierAdapterConfig,
  type CarrierRequest,
  type CarrierResponse,
  type CarrierTransport,
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

// ---------------------------------------------------------------------------
// Carrier adapter
// ---------------------------------------------------------------------------

const WEBHOOK_SECRET = "whsec_test_only";

function fakeTransport(handler: (req: CarrierRequest) => CarrierResponse | Promise<CarrierResponse>) {
  const calls: CarrierRequest[] = [];
  const transport: CarrierTransport = async (req) => {
    calls.push(req);
    return handler(req);
  };
  return { transport, calls };
}

const NOW_MS = new Date("2026-07-22T00:00:00.000Z").getTime();

function adapter(
  handler: (req: CarrierRequest) => CarrierResponse | Promise<CarrierResponse>,
  config: Partial<CarrierAdapterConfig> = {},
) {
  const { transport, calls } = fakeTransport(handler);
  const provider = new CarrierShippingAdapter(
    { carrier: "generic", webhookSecret: WEBHOOK_SECRET, now: () => NOW_MS, ...config },
    transport,
  );
  return { provider, calls };
}

const LABEL_BODY = {
  shipmentId: "shp_1",
  trackingNumber: "1Z000TEST0001",
  carrier: "generic",
  labelUrl: "https://example.invalid/labels/shp_1",
};

/** The timestamp-bound signed scheme: `t=<unix seconds>,v1=<hmac over "t.rawBody">`. */
function signed(body: unknown, atSeconds: number = NOW_MS / 1000): { rawBody: string; signature: string } {
  const rawBody = JSON.stringify(body);
  const mac = createHmac("sha256", WEBHOOK_SECRET).update(`${atSeconds}.${rawBody}`, "utf8").digest("hex");
  return { rawBody, signature: `t=${atSeconds},v1=${mac}` };
}

describe("CarrierShippingAdapter", () => {
  it("refuses every operation when unconfigured rather than faking", async () => {
    const p = new CarrierShippingAdapter();
    for (const r of [
      await p.quote(request()),
      await p.buyLabel(request(), "ord_1", "ref_1"),
      await p.track("1Z"),
      await p.cancelLabel("shp_1"),
      await p.validateAddress(request().destination),
      await p.verifyWebhook("{}", "sig"),
      await p.createShipmentsForGroups("ord_1", [{ groupId: "g1", request: request() }]),
      await p.reconcileShipments([{ clientReferenceId: "ord_1:g1", trackingNumber: null }]),
    ]) {
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    }
  });

  it("declares credential names only", () => {
    expect(CarrierShippingAdapter.requiredEnvironmentVariables).toEqual([
      "SHIPPING_PROVIDER",
      "SHIPPING_API_BASE_URL",
      "SHIPPING_API_AUTH_HEADER",
      "SHIPPING_API_KEY",
      "SHIPPING_WEBHOOK_SECRET",
    ]);
  });

  describe("quoting", () => {
    it("maps a carrier rate to a live quote with the carrier's delivery range", async () => {
      const { provider, calls } = adapter(() => ({
        status: 200,
        body: { amountCents: 1899, service: "standard", deliveryDays: { min: 2, max: 5 } },
      }));
      const r = await provider.quote(request());
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.kind).toBe("live_carrier_quote");
        expect(r.value.amountCents).toBe(1899);
        expect(r.value.estimatedDeliveryRange).toEqual({ earliestDays: 2, latestDays: 5 });
        expect(r.value.disclosure).toContain("estimate");
      }
      expect(calls[0].path).toBe("/v1/rates");
      expect((calls[0].body as { profile: string }).profile).toBe("ambient");
    });

    it("never invents a delivery range the carrier did not confirm", async () => {
      const { provider } = adapter(() => ({ status: 200, body: { amountCents: 1899 } }));
      const r = await provider.quote(request());
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.estimatedDeliveryRange).toBeNull();
    });

    it("refuses to quote an unknown package weight without calling the carrier", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: {} }));
      const r = await provider.quote(request({ weightGrams: 0 }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
      expect(calls).toHaveLength(0);
    });

    it("rejects a malformed rate response rather than quoting a guess", async () => {
      const { provider } = adapter(() => ({ status: 200, body: { amountCents: "cheap" } }));
      const r = await provider.quote(request());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("PERMANENT_FAILURE");
    });
  });

  describe("cold chain refusal matrix", () => {
    const coldChain = () =>
      request({ service: "temperature_controlled", temperatureControlled: true });

    it("refuses temperature_controlled when the config does not declare validated support", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: {} }));
      const r = await provider.quote(coldChain());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("validated");
      expect(calls).toHaveLength(0);
    });

    it("refuses to sell cold chain to an ambient package even when supported", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: {} }), {
        supportsTemperatureControlled: true,
      });
      const r = await provider.quote(request({ service: "temperature_controlled" }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("ambient");
      expect(calls).toHaveLength(0);
    });

    it("refuses an ambient service for a package that requires a cold chain", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: {} }), {
        supportsTemperatureControlled: true,
      });
      const r = await provider.quote(request({ temperatureControlled: true }));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("cold chain");
      expect(calls).toHaveLength(0);
    });

    it("quotes cold chain when support is declared AND the package requires it", async () => {
      const { provider, calls } = adapter(() => ({
        status: 200,
        body: { amountCents: 6495, deliveryDays: { min: 1, max: 2 } },
      }), { supportsTemperatureControlled: true });
      const r = await provider.quote(coldChain());
      expect(r.ok).toBe(true);
      expect((calls[0].body as { profile: string }).profile).toBe("cold_chain");
    });

    it("applies the same refusal to label purchase", async () => {
      const { provider, calls } = adapter(() => ({ status: 201, body: LABEL_BODY }));
      const r = await provider.buyLabel(coldChain(), "ord_1", "ref_1");
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe("address validation", () => {
    it("returns the carrier's normalized address", async () => {
      const { provider } = adapter(() => ({
        status: 200,
        body: {
          valid: true,
          normalized: { line1: "1 EXAMPLE ST", city: "HOUSTON", state: "tx", postalCode: "77002-1234" },
        },
      }));
      const r = await provider.validateAddress(request().destination);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.normalized.line1).toBe("1 EXAMPLE ST");
        expect(r.value.normalized.state).toBe("TX");
      }
    });

    it("rejects an address the carrier could not validate, with the carrier's reason", async () => {
      const { provider } = adapter(() => ({
        status: 200,
        body: { valid: false, reason: "Undeliverable address." },
      }));
      const r = await provider.validateAddress(request().destination);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toBe("Undeliverable address.");
    });

    it("structurally rejects a malformed ZIP before spending a carrier call", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: { valid: true } }));
      const r = await provider.validateAddress({ ...request().destination, postalCode: "7700" });
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });
  });

  describe("idempotent shipment creation and labels", () => {
    it("maps a created shipment onto a label", async () => {
      const { provider, calls } = adapter(() => ({ status: 201, body: LABEL_BODY }));
      const r = await provider.buyLabel(request(), "ord_1", "ord_1:g1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.providerReference).toBe("shp_1");
        expect(r.value.trackingNumber).toBe("1Z000TEST0001");
        expect(r.value.labelUrl).toContain("shp_1");
      }
      expect(calls[0].idempotencyKey).toBe("ord_1:g1");
      expect((calls[0].body as { clientReferenceId: string }).clientReferenceId).toBe("ord_1:g1");
      expect((calls[0].body as { purchaseLabel: boolean }).purchaseLabel).toBe(true);
    });

    it("a replayed create lands on the ORIGINAL shipment through the 409 path", async () => {
      const { provider, calls } = adapter((req) => {
        if (req.method === "POST") return { status: 409, body: { message: "reference already used" } };
        return { status: 200, body: LABEL_BODY };
      });
      const r = await provider.createShipment(request(), "ord_1", "ord_1:g1");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.trackingNumber).toBe("1Z000TEST0001");
      expect(calls[1].method).toBe("GET");
      expect(calls[1].path).toBe("/v1/shipments/by-reference/ord_1%3Ag1");
    });

    it("refuses an empty client reference id", async () => {
      const { provider, calls } = adapter(() => ({ status: 201, body: LABEL_BODY }));
      const r = await provider.createShipment(request(), "ord_1", "");
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it("creates a return shipment against the original", async () => {
      const { provider, calls } = adapter(() => ({
        status: 201,
        body: { ...LABEL_BODY, shipmentId: "shp_ret_1", trackingNumber: "1Z000RET0001" },
      }));
      const r = await provider.createReturnShipment("shp_1", "ord_1:return");
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.trackingNumber).toBe("1Z000RET0001");
      expect(calls[0].path).toBe("/v1/shipments/shp_1/return");
      expect(calls[0].idempotencyKey).toBe("ord_1:return");
    });
  });

  describe("split fulfillment", () => {
    it("creates one shipment per group under a per-group reference, pricing left upstream", async () => {
      let n = 0;
      const { provider, calls } = adapter(() => ({
        status: 201,
        body: { ...LABEL_BODY, shipmentId: `shp_${++n}`, trackingNumber: `TRK${n}` },
      }));
      const r = await provider.createShipmentsForGroups("ord_9", [
        { groupId: "ambient", request: request() },
        { groupId: "backorder", request: request() },
      ]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value).toHaveLength(2);
        expect(r.value[0].clientReferenceId).toBe("ord_9:ambient");
        expect(r.value[1].clientReferenceId).toBe("ord_9:backorder");
        expect(r.value.every((g) => g.result.ok)).toBe(true);
      }
      expect(calls).toHaveLength(2);
    });

    it("refuses duplicate group ids outright", async () => {
      const { provider, calls } = adapter(() => ({ status: 201, body: LABEL_BODY }));
      const r = await provider.createShipmentsForGroups("ord_9", [
        { groupId: "g1", request: request() },
        { groupId: "g1", request: request() },
      ]);
      expect(r.ok).toBe(false);
      expect(calls).toHaveLength(0);
    });

    it("one failing group does not poison the others", async () => {
      let n = 0;
      const { provider } = adapter(() => {
        n += 1;
        if (n === 1) return { status: 422, body: { message: "bad weight" } };
        return { status: 201, body: LABEL_BODY };
      });
      const r = await provider.createShipmentsForGroups("ord_9", [
        { groupId: "g1", request: request() },
        { groupId: "g2", request: request() },
      ]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value[0].result.ok).toBe(false);
        expect(r.value[1].result.ok).toBe(true);
      }
    });
  });

  describe("tracking and delivery events mapping", () => {
    it("maps the newest tracking event onto the honest status set", async () => {
      const { provider } = adapter(() => ({
        status: 200,
        body: {
          trackingNumber: "TRK1",
          status: "in_transit",
          events: [
            { code: "picked_up", occurredAt: "2026-07-20T10:00:00Z" },
            { code: "out_for_delivery", occurredAt: "2026-07-21T08:00:00Z" },
          ],
        },
      }));
      const r = await provider.track("TRK1");
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.status).toBe("out_for_delivery");
        expect(r.value.lastUpdatedAt).toBe("2026-07-21T08:00:00Z");
      }
    });

    it("maps unrecognized carrier codes to unknown rather than guessing", () => {
      expect(mapCarrierTrackingStatus("label_created")).toBe("unknown");
      expect(mapCarrierTrackingStatus("carrier_specific_mystery")).toBe("unknown");
      expect(mapCarrierTrackingStatus("tracking.delivered")).toBe("delivered");
      expect(mapCarrierTrackingStatus("RETURN_TO_SENDER")).toBe("exception");
    });
  });

  describe("cancellation", () => {
    it("cancels an unmanifested shipment", async () => {
      const { provider, calls } = adapter(() => ({ status: 200, body: {} }));
      const r = await provider.cancelLabel("shp_1");
      expect(r.ok).toBe(true);
      expect(calls[0].path).toBe("/v1/shipments/shp_1/cancel");
    });

    it("refuses once the shipment has manifested", async () => {
      const { provider } = adapter(() => ({ status: 409, body: {} }));
      const r = await provider.cancelLabel("shp_1");
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.retryable).toBe(false);
        expect(r.message).toContain("manifested");
      }
    });
  });

  describe("failure mapping", () => {
    it("maps an auth rejection to MISCONFIGURED", async () => {
      const { provider } = adapter(() => ({ status: 401, body: {} }));
      const r = await provider.quote(request());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    });

    it("marks 5xx and 429 retryable", async () => {
      for (const status of [500, 503, 429]) {
        const { provider } = adapter(() => ({ status, body: {} }));
        const r = await provider.quote(request());
        expect(r.ok).toBe(false);
        if (!r.ok) {
          expect(r.code).toBe("RETRYABLE");
          expect(r.retryable).toBe(true);
        }
      }
    });

    it("marks a 422 rejection non-retryable and carries the carrier's message", async () => {
      const { provider } = adapter(() => ({ status: 422, body: { message: "weight exceeds service limit" } }));
      const r = await provider.quote(request());
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.code).toBe("REJECTED");
        expect(r.message).toContain("weight exceeds service limit");
      }
    });

    it("maps a transport throw to a retryable failure", async () => {
      const { provider } = adapter(() => {
        throw new Error("connection reset");
      });
      const r = await provider.quote(request());
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.retryable).toBe(true);
    });
  });

  describe("webhook verification", () => {
    it("verifies a signed delivery event and maps its status", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const { rawBody, signature } = signed({
        id: "evt_1",
        type: "delivered",
        trackingNumber: "TRK1",
        occurredAt: "2026-07-21T12:00:00Z",
      });
      const r = await provider.verifyDeliveryEvent(rawBody, signature);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.status).toBe("delivered");
        expect(r.value.trackingNumber).toBe("TRK1");
        expect(r.value.occurredAt).toBe("2026-07-21T12:00:00Z");
      }
    });

    it("rejects a missing or wrong signature", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const { rawBody } = signed({ id: "evt_1", type: "delivered", trackingNumber: "TRK1" });
      expect((await provider.verifyDeliveryEvent(rawBody, undefined)).ok).toBe(false);
      expect((await provider.verifyDeliveryEvent(rawBody, "deadbeef")).ok).toBe(false);
    });

    it("rejects a tampered body even with a previously valid signature", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const { signature } = signed({ id: "evt_1", type: "delivered", trackingNumber: "TRK1" });
      const tampered = JSON.stringify({ id: "evt_1", type: "delivered", trackingNumber: "TRK-OTHER" });
      expect((await provider.verifyDeliveryEvent(tampered, signature)).ok).toBe(false);
    });

    it("rejects a replayed event id", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const { rawBody, signature } = signed({ id: "evt_1", type: "delivered", trackingNumber: "TRK1" });
      expect((await provider.verifyDeliveryEvent(rawBody, signature)).ok).toBe(true);
      const replay = await provider.verifyDeliveryEvent(rawBody, signature);
      expect(replay.ok).toBe(false);
      if (!replay.ok) expect(replay.message).toContain("Duplicate");
    });

    // The timestamp is part of what is signed, so a captured genuine webhook
    // cannot be replayed after the tolerance window (e.g. after a restart has
    // emptied the in-process seen-event map).
    it("rejects a genuinely signed event whose timestamp is outside the tolerance window", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const staleSeconds = NOW_MS / 1000 - 301; // one second past the 300s window
      const { rawBody, signature } = signed(
        { id: "evt_old", type: "delivered", trackingNumber: "TRK1" },
        staleSeconds,
      );
      const r = await provider.verifyDeliveryEvent(rawBody, signature);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("tolerance");

      const futureSeconds = NOW_MS / 1000 + 301;
      const future = signed({ id: "evt_future", type: "delivered", trackingNumber: "TRK1" }, futureSeconds);
      expect((await provider.verifyDeliveryEvent(future.rawBody, future.signature)).ok).toBe(false);
    });

    it("rejects an unbound signature (no timestamp) as malformed", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const rawBody = JSON.stringify({ id: "evt_1", type: "delivered", trackingNumber: "TRK1" });
      const bare = createHmac("sha256", WEBHOOK_SECRET).update(rawBody, "utf8").digest("hex");
      const r = await provider.verifyDeliveryEvent(rawBody, bare);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain("Malformed");
    });

    it("refuses to verify anything without a configured webhook secret", async () => {
      const { transport } = fakeTransport(() => ({ status: 200, body: {} }));
      const provider = new CarrierShippingAdapter({ carrier: "generic" }, transport);
      const r = await provider.verifyWebhook("{}", "sig");
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.code).toBe("MISCONFIGURED");
    });

    it("exposes the interface-level verifyWebhook over the same check", async () => {
      const { provider } = adapter(() => ({ status: 200, body: {} }));
      const { rawBody, signature } = signed({ id: "evt_9", type: "in_transit", trackingNumber: "TRK1" });
      const r = await provider.verifyWebhook(rawBody, signature);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.eventId).toBe("evt_9");
    });
  });

  describe("reconciliation", () => {
    it("classifies confirmed, missing, and mismatched shipments", async () => {
      const { provider } = adapter((req) => {
        if (req.path.endsWith("/ord_1%3Ag1")) return { status: 200, body: { ...LABEL_BODY, trackingNumber: "TRK1" } };
        if (req.path.endsWith("/ord_1%3Ag2")) return { status: 404, body: {} };
        return { status: 200, body: { ...LABEL_BODY, trackingNumber: "TRK-CARRIER" } };
      });
      const r = await provider.reconcileShipments([
        { clientReferenceId: "ord_1:g1", trackingNumber: "TRK1" },
        { clientReferenceId: "ord_1:g2", trackingNumber: "TRK2" },
        { clientReferenceId: "ord_1:g3", trackingNumber: "TRK3" },
      ]);
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.value.confirmed).toEqual(["ord_1:g1"]);
        expect(r.value.missingAtCarrier).toEqual(["ord_1:g2"]);
        expect(r.value.trackingMismatch).toEqual([
          { clientReferenceId: "ord_1:g3", localTrackingNumber: "TRK3", carrierTrackingNumber: "TRK-CARRIER" },
        ]);
        expect(r.value.errors).toEqual([]);
      }
    });

    it("names lookups that failed so a retry can target them", async () => {
      const { provider } = adapter(() => ({ status: 500, body: {} }));
      const r = await provider.reconcileShipments([{ clientReferenceId: "ord_1:g1", trackingNumber: "TRK1" }]);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.value.errors).toHaveLength(1);
    });
  });
});

describe("packageProfileFor", () => {
  it("derives the profile from the request, never assumes", () => {
    expect(packageProfileFor(request())).toBe("ambient");
    expect(packageProfileFor(request({ temperatureControlled: true }))).toBe("cold_chain");
  });
});

describe("validateCarrierShippingEnvironment", () => {
  it("reports missing NAMES only, never values", () => {
    const check = validateCarrierShippingEnvironment({
      SHIPPING_PROVIDER: "carrier",
      SHIPPING_API_KEY: "k",
    } as NodeJS.ProcessEnv);
    expect(check.configured).toBe(false);
    expect(check.missing).toEqual([
      "SHIPPING_API_BASE_URL",
      "SHIPPING_API_AUTH_HEADER",
      "SHIPPING_WEBHOOK_SECRET",
    ]);
    expect(JSON.stringify(check)).not.toContain("k");
  });

  it("treats a whitespace value as missing", () => {
    const check = validateCarrierShippingEnvironment({ SHIPPING_PROVIDER: "  " } as NodeJS.ProcessEnv);
    expect(check.missing).toContain("SHIPPING_PROVIDER");
  });

  it("is satisfied by a complete environment", () => {
    const check = validateCarrierShippingEnvironment({
      SHIPPING_PROVIDER: "carrier",
      SHIPPING_API_BASE_URL: "https://carrier.example.invalid",
      SHIPPING_API_AUTH_HEADER: "x-api-key",
      SHIPPING_API_KEY: "k",
      SHIPPING_WEBHOOK_SECRET: "s",
    } as NodeJS.ProcessEnv);
    expect(check.configured).toBe(true);
    expect(check.missing).toEqual([]);
  });
});

describe("resolveShippingProvider", () => {
  const original = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = original;
  });

  // A clean (non-synthetic-marked) configuration: the live flag makes the
  // process production-like, where the synthetic-data guard refuses markers.
  const fullCarrierEnv = {
    RESEARCH_LIVE_SHIPPING_ENABLED: "true",
    SHIPPING_PROVIDER: "carrier",
    SHIPPING_API_BASE_URL: "https://api.carrier-unit.test",
    SHIPPING_API_AUTH_HEADER: "x-api-key",
    SHIPPING_API_KEY: "test-key-never-used",
    SHIPPING_WEBHOOK_SECRET: "test-secret-never-used",
  } as NodeJS.ProcessEnv;

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
    const p = resolveShippingProvider(
      { ...fullCarrierEnv, RESEARCH_LIVE_SHIPPING_ENABLED: undefined } as NodeJS.ProcessEnv,
    );
    expect(p.name).toBe("configured_rate");
  });

  // A half-configured live carrier fails loudly rather than silently quoting
  // the flat rate as if the carrier selection had worked.
  it("resolves an explicitly selected but incomplete carrier to disabled", () => {
    const p = resolveShippingProvider({
      RESEARCH_LIVE_SHIPPING_ENABLED: "true",
      SHIPPING_PROVIDER: "carrier",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("disabled");
  });

  it("selects the carrier adapter only when fully configured", () => {
    expect(resolveShippingProvider(fullCarrierEnv).name).toBe("carrier");
  });

  it("falls back to the configured rate rather than the test provider in production", () => {
    const p = resolveShippingProvider({
      RESEARCH_LIVE_SHIPPING_ENABLED: "true",
      SHIPPING_PROVIDER: "test",
      NODE_ENV: "production",
    } as NodeJS.ProcessEnv);
    expect(p.name).toBe("configured_rate");
  });

  // The synthetic-data production guard, wired at the construction chokepoint:
  // the live-shipping flag makes the process production-like, so a sandbox
  // endpoint can never become the live carrier path.
  it("refuses to construct the live carrier over a synthetic-marked configuration", () => {
    expect(() =>
      resolveShippingProvider({
        ...fullCarrierEnv,
        SHIPPING_API_BASE_URL: "https://carrier.example.invalid",
      } as NodeJS.ProcessEnv),
    ).toThrow(/Synthetic fixture data/);
  });
});
