// xenios research: shipping provider boundary.
//
// Three implementations, and the difference between them is the point:
//
//   Disabled              no quoting at all
//   ConfiguredRate        a real, honest, admin-configured flat rate with NO carrier
//                         involvement and therefore NO delivery commitment
//   Test                  deterministic quotes for tests
//   carrier adapter shell unimplemented, refuses rather than faking
//
// ConfiguredRate exists because the founder decision is a $12.95 working launch rate.
// The trap it avoids: presenting a configured number as if a carrier returned it.
// Every quote carries `kind`, and a configured quote never carries a delivery range.

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";
import {
  STANDARD_SHIPPING_CENTS,
  configuredStandardQuote,
  type ShippingQuote,
} from "@shared/research/commerce";

export type ShippingService = ShippingQuote["service"];

export interface ShippingAddress {
  line1: string;
  line2?: string;
  city: string;
  /** Two-letter US state. Availability by state is a real constraint. */
  state: string;
  postalCode: string;
  country: "US";
}

export interface QuoteRequest {
  destination: ShippingAddress;
  service: ShippingService;
  /** Grams. Zero is invalid; an unknown weight must not silently quote. */
  weightGrams: number;
  temperatureControlled: boolean;
}

export interface ShippingLabel {
  providerReference: string;
  trackingNumber: string;
  carrier: string;
  labelUrl: string;
}

export interface TrackingStatus {
  trackingNumber: string;
  status: "unknown" | "in_transit" | "out_for_delivery" | "delivered" | "exception";
  lastUpdatedAt: string | null;
}

export interface ShippingProvider {
  readonly name: string;
  readonly quotesAreLive: boolean;

  quote(request: QuoteRequest): Promise<ProviderResult<ShippingQuote>>;
  buyLabel(request: QuoteRequest, orderId: string, idempotencyKey: string): Promise<ProviderResult<ShippingLabel>>;
  track(trackingNumber: string): Promise<ProviderResult<TrackingStatus>>;
  cancelLabel(providerReference: string): Promise<ProviderResult<void>>;
  validateAddress(address: ShippingAddress): Promise<ProviderResult<{ normalized: ShippingAddress }>>;
  verifyWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<{ eventId: string }>>;
}

// ---------------------------------------------------------------------------

export class DisabledShippingProvider implements ShippingProvider {
  readonly name = "disabled";
  readonly quotesAreLive = false;

  async quote() {
    return providerDisabled<ShippingQuote>("live_shipping_rates");
  }
  async buyLabel() {
    return providerDisabled<ShippingLabel>("live_shipping_rates");
  }
  async track() {
    return providerDisabled<TrackingStatus>("live_shipping_rates");
  }
  async cancelLabel() {
    return providerDisabled<void>("live_shipping_rates");
  }
  async validateAddress() {
    return providerDisabled<{ normalized: ShippingAddress }>("live_shipping_rates");
  }
  async verifyWebhook() {
    return providerDisabled<{ eventId: string }>("live_shipping_rates");
  }
}

/**
 * The launch provider. It can quote the configured standard rate honestly, and it
 * refuses everything that genuinely needs a carrier.
 *
 * Expedited, next-day, same-day, and temperature-controlled all REFUSE here rather
 * than returning a guessed price, because quoting a service xenios cannot actually
 * buy would be a promise it cannot keep.
 */
export class ConfiguredRateShippingProvider implements ShippingProvider {
  readonly name = "configured_rate";
  readonly quotesAreLive = false;

  constructor(private readonly standardRateCents: number = STANDARD_SHIPPING_CENTS) {}

  async quote(request: QuoteRequest): Promise<ProviderResult<ShippingQuote>> {
    if (request.weightGrams <= 0) {
      return providerMisconfigured<ShippingQuote>("Package weight is required to quote shipping.");
    }
    if (request.temperatureControlled) {
      return {
        ok: false,
        code: "REJECTED",
        message:
          "Temperature-controlled shipping requires a validated carrier service, which is not configured.",
        retryable: false,
      };
    }
    if (request.service !== "standard") {
      return {
        ok: false,
        code: "REJECTED",
        message: `${request.service} requires a live carrier quote, which is not configured.`,
        retryable: false,
      };
    }
    return providerOk({ ...configuredStandardQuote(), amountCents: this.standardRateCents });
  }

  // Buying a label genuinely requires a carrier. Refuse rather than pretend.
  async buyLabel() {
    return providerMisconfigured<ShippingLabel>(
      "Label purchase requires a carrier account, which is not configured.",
    );
  }
  async track() {
    return providerMisconfigured<TrackingStatus>(
      "Tracking requires a carrier account, which is not configured.",
    );
  }
  async cancelLabel() {
    return providerMisconfigured<void>("Label cancellation requires a carrier account.");
  }
  async validateAddress(address: ShippingAddress): Promise<ProviderResult<{ normalized: ShippingAddress }>> {
    // Structural validation only. This is explicitly NOT carrier address verification.
    if (!/^[A-Z]{2}$/.test(address.state)) {
      return { ok: false, code: "REJECTED", message: "State must be a two-letter code.", retryable: false };
    }
    if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
      return { ok: false, code: "REJECTED", message: "Postal code is not a valid US ZIP.", retryable: false };
    }
    return providerOk({ normalized: { ...address, state: address.state.toUpperCase() } });
  }
  async verifyWebhook() {
    return providerMisconfigured<{ eventId: string }>("No carrier webhook is configured.");
  }
}

export class TestShippingProvider implements ShippingProvider {
  readonly name = "test";
  readonly quotesAreLive = true;

  private labels = new Map<string, ShippingLabel>();
  private byIdempotencyKey = new Map<string, string>();
  private counter = 0;

  constructor(options: { allowInProduction?: boolean } = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowInProduction) {
      throw new Error("TestShippingProvider is not available in production");
    }
  }

  async quote(request: QuoteRequest): Promise<ProviderResult<ShippingQuote>> {
    if (request.weightGrams <= 0) {
      return providerMisconfigured<ShippingQuote>("Package weight is required.");
    }
    const base: Record<ShippingService, number> = {
      standard: 1295,
      expedited_2day: 2495,
      next_day: 4995,
      same_day: 7995,
      temperature_controlled: 6495,
    };
    return providerOk({
      kind: "live_carrier_quote",
      service: request.service,
      amountCents: base[request.service],
      estimatedDeliveryRange:
        request.service === "standard" ? { earliestDays: 3, latestDays: 7 } : { earliestDays: 1, latestDays: 2 },
      disclosure: "Test carrier quote. Not a real carrier rate.",
    });
  }

  async buyLabel(_request: QuoteRequest, orderId: string, idempotencyKey: string): Promise<ProviderResult<ShippingLabel>> {
    const existingRef = this.byIdempotencyKey.get(idempotencyKey);
    if (existingRef) {
      return providerOk(this.labels.get(existingRef)!, existingRef);
    }
    const ref = `test_label_${++this.counter}`;
    const label: ShippingLabel = {
      providerReference: ref,
      trackingNumber: `TEST${this.counter.toString().padStart(8, "0")}`,
      carrier: "test-carrier",
      labelUrl: `https://example.invalid/labels/${ref}`,
    };
    this.labels.set(ref, label);
    this.byIdempotencyKey.set(idempotencyKey, ref);
    void orderId;
    return providerOk(label, ref);
  }

  async track(trackingNumber: string): Promise<ProviderResult<TrackingStatus>> {
    return providerOk({ trackingNumber, status: "in_transit" as const, lastUpdatedAt: null });
  }

  async cancelLabel(providerReference: string): Promise<ProviderResult<void>> {
    if (!this.labels.has(providerReference)) {
      return { ok: false, code: "REJECTED", message: "Unknown label.", retryable: false };
    }
    this.labels.delete(providerReference);
    return providerOk(undefined as void);
  }

  async validateAddress(address: ShippingAddress): Promise<ProviderResult<{ normalized: ShippingAddress }>> {
    return providerOk({ normalized: address });
  }

  async verifyWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<{ eventId: string }>> {
    if (signature !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    try {
      const parsed = JSON.parse(rawBody) as { id?: string };
      if (!parsed.id) {
        return { ok: false, code: "REJECTED", message: "Missing event id.", retryable: false };
      }
      return providerOk({ eventId: parsed.id });
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed body.", retryable: false };
    }
  }
}

/**
 * Carrier adapter shell. Unimplemented on purpose.
 *
 * ACTIVATION: implement against the selected carrier, then supply the named
 * credentials. Do not request them until quoting, split fulfillment, and the
 * order state machine are all complete and green.
 */
export class CarrierShippingAdapter implements ShippingProvider {
  readonly name = "carrier";
  readonly quotesAreLive = true;

  static readonly requiredEnvironmentVariables = ["SHIPPING_PROVIDER", "SHIPPING_API_KEY"] as const;

  private notImplemented<T>(): ProviderResult<T> {
    return providerMisconfigured<T>("The live carrier adapter is not implemented.");
  }

  async quote() {
    return this.notImplemented<ShippingQuote>();
  }
  async buyLabel() {
    return this.notImplemented<ShippingLabel>();
  }
  async track() {
    return this.notImplemented<TrackingStatus>();
  }
  async cancelLabel() {
    return this.notImplemented<void>();
  }
  async validateAddress() {
    return this.notImplemented<{ normalized: ShippingAddress }>();
  }
  async verifyWebhook() {
    return this.notImplemented<{ eventId: string }>();
  }
}

/**
 * Resolution. Note this defaults to ConfiguredRate rather than Disabled, because a
 * flat standard rate needs no credential and no carrier, and quoting it honestly is
 * strictly better for a member than showing nothing. Live rates still require the
 * live-shipping flag.
 */
export function resolveShippingProvider(env: NodeJS.ProcessEnv = process.env): ShippingProvider {
  if (env.RESEARCH_SHIPPING_DISABLED === "true") return new DisabledShippingProvider();

  if (env.RESEARCH_LIVE_SHIPPING_ENABLED === "true") {
    const selected = env.SHIPPING_PROVIDER;
    if (selected === "test") {
      if (env.NODE_ENV === "production") return new ConfiguredRateShippingProvider();
      return new TestShippingProvider();
    }
    if (selected && selected !== "configured") return new CarrierShippingAdapter();
  }
  return new ConfiguredRateShippingProvider();
}
