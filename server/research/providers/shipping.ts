// xenios research: shipping provider boundary.
//
// Four implementations, and the difference between them is the point:
//
//   Disabled              no quoting at all
//   ConfiguredRate        a real, honest, admin-configured flat rate with NO carrier
//                         involvement and therefore NO delivery commitment
//   Test                  deterministic quotes for tests
//   CarrierShippingAdapter the production carrier integration, written against a
//                         generic carrier REST contract over an INJECTED transport,
//                         inert until fully configured
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
import { assertNoSyntheticDataInProduction } from "../commerce/production-guards";
import { verifyStripeSignature } from "./payment";

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

// ---------------------------------------------------------------------------
// Carrier transport seam
// ---------------------------------------------------------------------------

/**
 * The injected transport the carrier adapter speaks through. The adapter is
 * written against generic carrier REST semantics; the production transport
 * (`buildFetchCarrierTransport`) supplies a base URL and a named auth header,
 * so swapping carriers is configuration plus a translation layer, never an
 * adapter rewrite. Tests inject a fake transport and no network exists here.
 *
 * The wire contract the adapter expects the transport to speak:
 *
 *   POST /v1/addresses/validate { address }
 *     -> 200 { valid, normalized?, reason? }
 *   POST /v1/rates { destination, service, weightGrams, profile }
 *     -> 200 { amountCents, service, deliveryDays?: { min, max } }
 *   POST /v1/shipments { clientReferenceId, orderId, destination, service,
 *                        weightGrams, profile, purchaseLabel }
 *     -> 201 { shipmentId, trackingNumber, carrier, labelUrl }
 *     -> 409 when the clientReferenceId was already used (the retry-safe path)
 *   GET  /v1/shipments/by-reference/{clientReferenceId}
 *     -> 200 { shipmentId, trackingNumber, carrier, labelUrl }
 *   GET  /v1/tracking/{trackingNumber}
 *     -> 200 { trackingNumber, status?, events?: [{ code, occurredAt }] }
 *   POST /v1/shipments/{shipmentId}/cancel
 *     -> 200 {}, 409 once the shipment has manifested
 *   POST /v1/shipments/{shipmentId}/return { clientReferenceId }
 *     -> 201 { shipmentId, trackingNumber, carrier, labelUrl }, 409 on replay
 */
export interface CarrierRequest {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
  /** Forwarded to the carrier as its idempotency or client-reference header. */
  idempotencyKey?: string;
}

export interface CarrierResponse {
  status: number;
  body: unknown;
}

export type CarrierTransport = (request: CarrierRequest) => Promise<CarrierResponse>;

/**
 * The production transport. Credentials arrive here by injection at resolution
 * time and never live on the adapter's config, so nothing serializable carries
 * the key. Inert until `resolveShippingProvider` constructs it from a complete
 * environment behind the live-shipping flag.
 */
export function buildFetchCarrierTransport(options: {
  baseUrl: string;
  authHeaderName: string;
  apiKey: string;
}): CarrierTransport {
  const base = options.baseUrl.replace(/\/+$/, "");
  return async (request) => {
    const headers: Record<string, string> = {
      "content-type": "application/json",
      [options.authHeaderName]: options.apiKey,
    };
    if (request.idempotencyKey) headers["idempotency-key"] = request.idempotencyKey;
    const response = await fetch(`${base}${request.path}`, {
      method: request.method,
      headers,
      body: request.body === undefined ? undefined : JSON.stringify(request.body),
    });
    const text = await response.text();
    let body: unknown = null;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = null;
      }
    }
    return { status: response.status, body };
  };
}

// ---------------------------------------------------------------------------
// Carrier adapter types and mapping
// ---------------------------------------------------------------------------

/** Ambient versus validated cold chain. Derived from the request, never assumed. */
export type PackageProfile = "ambient" | "cold_chain";

export function packageProfileFor(request: QuoteRequest): PackageProfile {
  return request.temperatureControlled ? "cold_chain" : "ambient";
}

export interface CarrierAdapterConfig {
  /** Which carrier the transport speaks to, e.g. "ups". Presentation only. */
  carrier: string;
  /**
   * Explicit declaration that the carrier ACCOUNT includes a validated
   * temperature-controlled service. Defaults to false. Without this the adapter
   * refuses every cold-chain request rather than silently claiming a validated
   * cold chain it does not have.
   */
  supportsTemperatureControlled?: boolean;
  /** Webhook signing secret, injected from the environment at resolution time. */
  webhookSecret?: string;
  /** Injectable clock (milliseconds) so webhook timestamp tolerance is testable. */
  now?: () => number;
  /** Webhook timestamp tolerance. Defaults to SHIPPING_WEBHOOK_TOLERANCE_SECONDS. */
  toleranceSeconds?: number;
}

/** Default tolerance for carrier webhook timestamps, matching the payment rail. */
export const SHIPPING_WEBHOOK_TOLERANCE_SECONDS = 300;

/**
 * Delivery events mapping. Carrier event codes collapse onto the small honest
 * status set; anything unrecognized maps to "unknown" rather than a guess.
 * A created label is NOT "in transit", so label codes stay "unknown" on purpose.
 */
const CARRIER_EVENT_STATUS: Record<string, TrackingStatus["status"]> = {
  accepted: "in_transit",
  picked_up: "in_transit",
  in_transit: "in_transit",
  departed_facility: "in_transit",
  arrived_at_facility: "in_transit",
  out_for_delivery: "out_for_delivery",
  delivered: "delivered",
  exception: "exception",
  delivery_failed: "exception",
  return_to_sender: "exception",
};

export function mapCarrierTrackingStatus(code: string): TrackingStatus["status"] {
  const normalized = code.toLowerCase().replace(/^tracking\./, "");
  return CARRIER_EVENT_STATUS[normalized] ?? "unknown";
}

/** A verified, replay-checked carrier webhook event, already mapped. */
export interface CarrierDeliveryEvent {
  eventId: string;
  trackingNumber: string;
  status: TrackingStatus["status"];
  occurredAt: string | null;
  rawType: string;
}

export interface FulfillmentGroupShipment {
  /** Stable id of the fulfillment group. Also drives per-group idempotency. */
  groupId: string;
  request: QuoteRequest;
}

export interface GroupShipmentResult {
  groupId: string;
  clientReferenceId: string;
  result: ProviderResult<ShippingLabel>;
}

export interface ShipmentReconciliationRecord {
  clientReferenceId: string;
  trackingNumber: string | null;
}

export interface ShipmentReconciliationReport {
  /** Found at the carrier with the tracking number xenios recorded. */
  confirmed: string[];
  /** xenios believes it created these, the carrier has no record. Investigate. */
  missingAtCarrier: string[];
  /** Found at the carrier under a different (or missing local) tracking number. */
  trackingMismatch: Array<{
    clientReferenceId: string;
    localTrackingNumber: string | null;
    carrierTrackingNumber: string;
  }>;
  /** Lookups that failed outright, named so a retry can target them. */
  errors: Array<{ clientReferenceId: string; message: string }>;
}

type ProviderFailure = Extract<ProviderResult<never>, { ok: false }>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function asFiniteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Carrier adapter
// ---------------------------------------------------------------------------

/**
 * The production carrier adapter, complete over the injected transport.
 *
 * Still inert by default: without a config AND a transport every method returns
 * a MISCONFIGURED refusal, and `resolveShippingProvider` only constructs a
 * configured instance behind the live-shipping flag with a complete environment.
 * No credential is read here; the transport closes over it.
 *
 * Cold chain honesty: a temperature-controlled quote or label is refused unless
 * the config explicitly declares validated cold-chain support AND the request's
 * package profile actually requires it. The adapter never claims a validated
 * cold chain by default and never sells one to an ambient package.
 */
export class CarrierShippingAdapter implements ShippingProvider {
  readonly name = "carrier";
  readonly quotesAreLive = true;

  static readonly requiredEnvironmentVariables = [
    "SHIPPING_PROVIDER",
    "SHIPPING_API_BASE_URL",
    "SHIPPING_API_AUTH_HEADER",
    "SHIPPING_API_KEY",
    "SHIPPING_WEBHOOK_SECRET",
  ] as const;

  /**
   * First-line replay protection: event id -> when it was seen (ms). The
   * durable check is the webhook idempotency store. A stale timestamp is
   * already rejected beyond the tolerance window, so entries older than twice
   * the window are pruned on every insert and the map stays bounded on a
   * long-lived process.
   */
  private seenWebhookEvents = new Map<string, number>();

  constructor(
    private readonly config?: CarrierAdapterConfig,
    private readonly transport?: CarrierTransport,
  ) {}

  private nowMs(): number {
    return (this.config?.now ?? Date.now)();
  }

  private toleranceSeconds(): number {
    return this.config?.toleranceSeconds ?? SHIPPING_WEBHOOK_TOLERANCE_SECONDS;
  }

  // ----- guards ------------------------------------------------------------

  private notReady(): ProviderFailure | null {
    if (!this.config || !this.transport) {
      return {
        ok: false,
        code: "MISCONFIGURED",
        message: "The live carrier adapter is not configured. It refuses rather than faking.",
        retryable: false,
      };
    }
    return null;
  }

  /**
   * The cold-chain refusal matrix. Returns null only when service, package
   * profile, and declared carrier support all agree.
   */
  private temperatureRefusal(request: QuoteRequest): ProviderFailure | null {
    const coldChainService = request.service === "temperature_controlled";
    const profileRequiresColdChain = request.temperatureControlled;
    if (coldChainService && !this.config?.supportsTemperatureControlled) {
      return {
        ok: false,
        code: "REJECTED",
        message:
          "This carrier configuration does not declare a validated temperature-controlled service. Refusing to claim a validated cold chain.",
        retryable: false,
      };
    }
    if (coldChainService && !profileRequiresColdChain) {
      return {
        ok: false,
        code: "REJECTED",
        message:
          "The package profile is ambient. Refusing to sell temperature-controlled shipping it does not require.",
        retryable: false,
      };
    }
    if (profileRequiresColdChain && !coldChainService) {
      return {
        ok: false,
        code: "REJECTED",
        message: `The package requires a cold chain and ${request.service} cannot carry one.`,
        retryable: false,
      };
    }
    return null;
  }

  // ----- transport plumbing and failure mapping ----------------------------

  private async send(request: CarrierRequest): Promise<{ response?: CarrierResponse; failure?: ProviderFailure }> {
    try {
      return { response: await this.transport!(request) };
    } catch {
      // A transport throw is a network-shaped problem, never a carrier decision.
      return {
        failure: {
          ok: false,
          code: "RETRYABLE",
          message: "The carrier transport failed before a response arrived.",
          retryable: true,
        },
      };
    }
  }

  private failureFromStatus(status: number, context: string, body: unknown): ProviderFailure {
    if (status === 401 || status === 403) {
      return {
        ok: false,
        code: "MISCONFIGURED",
        message: `${context}: the carrier rejected the configured credential.`,
        retryable: false,
      };
    }
    const detail = asNonEmptyString(asRecord(body)?.message);
    const message = detail ? `${context}: ${detail}` : `${context} failed with carrier status ${status}.`;
    if (status === 429 || status >= 500) {
      return { ok: false, code: "RETRYABLE", message, retryable: true };
    }
    return { ok: false, code: "REJECTED", message, retryable: false };
  }

  private malformedResponse(context: string): ProviderFailure {
    return {
      ok: false,
      code: "PERMANENT_FAILURE",
      message: `${context}: the carrier response is missing required fields.`,
      retryable: false,
    };
  }

  private parseLabel(body: unknown, context: string): ProviderResult<ShippingLabel> {
    const record = asRecord(body);
    const shipmentId = record ? asNonEmptyString(record.shipmentId) : null;
    const trackingNumber = record ? asNonEmptyString(record.trackingNumber) : null;
    const carrier = record ? asNonEmptyString(record.carrier) : null;
    const labelUrl = record ? asNonEmptyString(record.labelUrl) : null;
    if (!shipmentId || !trackingNumber || !carrier || !labelUrl) {
      return this.malformedResponse(context);
    }
    return providerOk({ providerReference: shipmentId, trackingNumber, carrier, labelUrl }, shipmentId);
  }

  // ----- address validation -------------------------------------------------

  async validateAddress(address: ShippingAddress): Promise<ProviderResult<{ normalized: ShippingAddress }>> {
    const guard = this.notReady();
    if (guard) return guard;

    // Structural pre-check. A malformed address never spends a carrier call.
    if (!/^[A-Z]{2}$/i.test(address.state)) {
      return { ok: false, code: "REJECTED", message: "State must be a two-letter code.", retryable: false };
    }
    if (!/^\d{5}(-\d{4})?$/.test(address.postalCode)) {
      return { ok: false, code: "REJECTED", message: "Postal code is not a valid US ZIP.", retryable: false };
    }

    const { response, failure } = await this.send({
      method: "POST",
      path: "/v1/addresses/validate",
      body: { address: { ...address, state: address.state.toUpperCase() } },
    });
    if (failure) return failure;
    if (response!.status !== 200) {
      return this.failureFromStatus(response!.status, "Address validation", response!.body);
    }
    const record = asRecord(response!.body);
    if (!record || typeof record.valid !== "boolean") {
      return this.malformedResponse("Address validation");
    }
    if (!record.valid) {
      const reason = asNonEmptyString(record.reason) ?? "The carrier could not validate this address.";
      return { ok: false, code: "REJECTED", message: reason, retryable: false };
    }
    const normalized = asRecord(record.normalized);
    if (normalized) {
      const line1 = asNonEmptyString(normalized.line1);
      const city = asNonEmptyString(normalized.city);
      const state = asNonEmptyString(normalized.state);
      const postalCode = asNonEmptyString(normalized.postalCode);
      if (line1 && city && state && postalCode) {
        const value: ShippingAddress = {
          line1,
          city,
          state: state.toUpperCase(),
          postalCode,
          country: "US",
        };
        const line2 = asNonEmptyString(normalized.line2);
        if (line2) value.line2 = line2;
        return providerOk({ normalized: value });
      }
    }
    // Valid without a normalization payload: the input, uppercased state, stands.
    return providerOk({ normalized: { ...address, state: address.state.toUpperCase() } });
  }

  // ----- quoting ------------------------------------------------------------

  async quote(request: QuoteRequest): Promise<ProviderResult<ShippingQuote>> {
    const guard = this.notReady();
    if (guard) return guard;
    if (request.weightGrams <= 0) {
      return providerMisconfigured<ShippingQuote>("Package weight is required to quote shipping.");
    }
    const refusal = this.temperatureRefusal(request);
    if (refusal) return refusal;

    const { response, failure } = await this.send({
      method: "POST",
      path: "/v1/rates",
      body: {
        destination: request.destination,
        service: request.service,
        weightGrams: request.weightGrams,
        profile: packageProfileFor(request),
      },
    });
    if (failure) return failure;
    if (response!.status !== 200) {
      return this.failureFromStatus(response!.status, "Rate quote", response!.body);
    }
    const record = asRecord(response!.body);
    const amountCents = record ? asFiniteNumber(record.amountCents) : null;
    if (amountCents === null || amountCents <= 0) {
      return this.malformedResponse("Rate quote");
    }
    // A delivery range appears only when the carrier confirmed one. Never invented.
    const days = record ? asRecord(record.deliveryDays) : null;
    const earliestDays = days ? asFiniteNumber(days.min) : null;
    const latestDays = days ? asFiniteNumber(days.max) : null;
    const estimatedDeliveryRange =
      earliestDays !== null && latestDays !== null ? { earliestDays, latestDays } : null;
    return providerOk({
      kind: "live_carrier_quote" as const,
      service: request.service,
      amountCents,
      estimatedDeliveryRange,
      disclosure: `Live ${this.config!.carrier} carrier quote. Delivery timing is an estimate, not a commitment.`,
    });
  }

  // ----- shipment creation and labels --------------------------------------

  /**
   * Retry-safe idempotent shipment creation. The client reference id is the
   * idempotency unit: a replayed create that hits the carrier's 409 fetches the
   * ORIGINAL shipment by reference and returns it, so a network retry can never
   * produce a second label for the same reference.
   */
  async createShipment(
    request: QuoteRequest,
    orderId: string,
    clientReferenceId: string,
  ): Promise<ProviderResult<ShippingLabel>> {
    const guard = this.notReady();
    if (guard) return guard;
    if (!clientReferenceId) {
      return providerMisconfigured<ShippingLabel>("A client reference id is required to create a shipment.");
    }
    if (request.weightGrams <= 0) {
      return providerMisconfigured<ShippingLabel>("Package weight is required to create a shipment.");
    }
    const refusal = this.temperatureRefusal(request);
    if (refusal) return refusal;

    const { response, failure } = await this.send({
      method: "POST",
      path: "/v1/shipments",
      idempotencyKey: clientReferenceId,
      body: {
        clientReferenceId,
        orderId,
        destination: request.destination,
        service: request.service,
        weightGrams: request.weightGrams,
        profile: packageProfileFor(request),
        purchaseLabel: true,
      },
    });
    if (failure) return failure;
    if (response!.status === 200 || response!.status === 201) {
      return this.parseLabel(response!.body, "Shipment creation");
    }
    if (response!.status === 409) {
      return this.fetchShipmentByReference(clientReferenceId);
    }
    return this.failureFromStatus(response!.status, "Shipment creation", response!.body);
  }

  private async fetchShipmentByReference(clientReferenceId: string): Promise<ProviderResult<ShippingLabel>> {
    const { response, failure } = await this.send({
      method: "GET",
      path: `/v1/shipments/by-reference/${encodeURIComponent(clientReferenceId)}`,
    });
    if (failure) return failure;
    if (response!.status !== 200) {
      return this.failureFromStatus(response!.status, "Shipment lookup", response!.body);
    }
    return this.parseLabel(response!.body, "Shipment lookup");
  }

  async buyLabel(
    request: QuoteRequest,
    orderId: string,
    idempotencyKey: string,
  ): Promise<ProviderResult<ShippingLabel>> {
    return this.createShipment(request, orderId, idempotencyKey);
  }

  /**
   * Split fulfillment: one shipment per fulfillment group, each idempotent under
   * `${orderId}:${groupId}`, so retrying the whole order re-lands on the same
   * shipments. PRICING DELIBERATELY ABSENT: shipping is charged once per order
   * upstream (`orderShippingTotalCents`), and this helper never quotes, prices,
   * or charges anything.
   */
  async createShipmentsForGroups(
    orderId: string,
    groups: readonly FulfillmentGroupShipment[],
  ): Promise<ProviderResult<GroupShipmentResult[]>> {
    const guard = this.notReady();
    if (guard) return guard;
    if (groups.length === 0) {
      return providerMisconfigured<GroupShipmentResult[]>("At least one fulfillment group is required.");
    }
    const ids = new Set(groups.map((g) => g.groupId));
    if (ids.size !== groups.length) {
      return {
        ok: false,
        code: "REJECTED",
        message: "Fulfillment group ids must be unique within an order.",
        retryable: false,
      };
    }
    const results: GroupShipmentResult[] = [];
    for (const group of groups) {
      const clientReferenceId = `${orderId}:${group.groupId}`;
      results.push({
        groupId: group.groupId,
        clientReferenceId,
        result: await this.createShipment(group.request, orderId, clientReferenceId),
      });
    }
    return providerOk(results);
  }

  /**
   * Return shipment for an existing outbound shipment. Idempotent under the
   * supplied client reference id through the same 409-then-fetch path.
   */
  async createReturnShipment(
    originalProviderReference: string,
    clientReferenceId: string,
  ): Promise<ProviderResult<ShippingLabel>> {
    const guard = this.notReady();
    if (guard) return guard;
    if (!clientReferenceId) {
      return providerMisconfigured<ShippingLabel>("A client reference id is required for a return shipment.");
    }
    const { response, failure } = await this.send({
      method: "POST",
      path: `/v1/shipments/${encodeURIComponent(originalProviderReference)}/return`,
      idempotencyKey: clientReferenceId,
      body: { clientReferenceId },
    });
    if (failure) return failure;
    if (response!.status === 200 || response!.status === 201) {
      return this.parseLabel(response!.body, "Return shipment");
    }
    if (response!.status === 409) {
      return this.fetchShipmentByReference(clientReferenceId);
    }
    return this.failureFromStatus(response!.status, "Return shipment", response!.body);
  }

  // ----- tracking and cancellation ------------------------------------------

  async track(trackingNumber: string): Promise<ProviderResult<TrackingStatus>> {
    const guard = this.notReady();
    if (guard) return guard;
    const { response, failure } = await this.send({
      method: "GET",
      path: `/v1/tracking/${encodeURIComponent(trackingNumber)}`,
    });
    if (failure) return failure;
    if (response!.status !== 200) {
      return this.failureFromStatus(response!.status, "Tracking", response!.body);
    }
    const record = asRecord(response!.body);
    if (!record) return this.malformedResponse("Tracking");

    // Prefer the newest event; fall back to the summary status; never guess.
    const events = Array.isArray(record.events) ? record.events : [];
    let status: TrackingStatus["status"] = "unknown";
    let lastUpdatedAt: string | null = null;
    const summary = asNonEmptyString(record.status);
    if (summary) status = mapCarrierTrackingStatus(summary);
    for (const entry of events) {
      const event = asRecord(entry);
      const code = event ? asNonEmptyString(event.code) : null;
      if (!code) continue;
      status = mapCarrierTrackingStatus(code);
      lastUpdatedAt = event ? asNonEmptyString(event.occurredAt) : null;
    }
    return providerOk({ trackingNumber, status, lastUpdatedAt });
  }

  async cancelLabel(providerReference: string): Promise<ProviderResult<void>> {
    const guard = this.notReady();
    if (guard) return guard;
    const { response, failure } = await this.send({
      method: "POST",
      path: `/v1/shipments/${encodeURIComponent(providerReference)}/cancel`,
    });
    if (failure) return failure;
    if (response!.status === 200) return providerOk(undefined as void, providerReference);
    if (response!.status === 409) {
      return {
        ok: false,
        code: "REJECTED",
        message: "The shipment has already manifested and can no longer be cancelled.",
        retryable: false,
      };
    }
    return this.failureFromStatus(response!.status, "Label cancellation", response!.body);
  }

  // ----- webhooks -----------------------------------------------------------

  /**
   * Verifies, replay-checks, and maps one carrier delivery event. The
   * signature header is the same timestamp-bound signed scheme as the payment
   * and fulfillment rails (`t=<unix seconds>,v1=<hex hmac>`, HMAC-SHA256 over
   * `${t}.${rawBody}`), verified in constant time with a staleness window, so
   * a captured genuine webhook cannot be replayed after the window closes.
   * Replay inside the window is refused by the seen-event map below (and
   * durably by the caller's event store). Call exactly once per inbound
   * delivery.
   */
  async verifyDeliveryEvent(
    rawBody: string,
    signature: string | undefined,
  ): Promise<ProviderResult<CarrierDeliveryEvent>> {
    const guard = this.notReady();
    if (guard) return guard;
    if (!this.config!.webhookSecret) {
      return providerMisconfigured<CarrierDeliveryEvent>("No carrier webhook secret is configured.");
    }
    if (!signature) {
      return { ok: false, code: "REJECTED", message: "Missing webhook signature.", retryable: false };
    }
    const failure = verifyStripeSignature(
      rawBody,
      signature,
      this.config!.webhookSecret,
      this.nowMs(),
      this.toleranceSeconds(),
    );
    if (failure === "malformed") {
      return { ok: false, code: "REJECTED", message: "Malformed webhook signature header.", retryable: false };
    }
    if (failure === "stale") {
      return {
        ok: false,
        code: "REJECTED",
        message: "Webhook timestamp is outside the tolerance window.",
        retryable: false,
      };
    }
    if (failure) {
      return { ok: false, code: "REJECTED", message: "Invalid webhook signature.", retryable: false };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    const record = asRecord(parsed);
    const eventId = record ? asNonEmptyString(record.id) : null;
    const rawType = record ? asNonEmptyString(record.type) : null;
    const trackingNumber = record ? asNonEmptyString(record.trackingNumber) : null;
    if (!eventId || !rawType || !trackingNumber) {
      return {
        ok: false,
        code: "REJECTED",
        message: "Webhook missing id, type, or tracking number.",
        retryable: false,
      };
    }
    if (this.seenWebhookEvents.has(eventId)) {
      return { ok: false, code: "REJECTED", message: "Duplicate webhook event.", retryable: false };
    }
    const nowMs = this.nowMs();
    const horizonMs = nowMs - this.toleranceSeconds() * 2 * 1000;
    this.seenWebhookEvents.forEach((seenAtMs, seenId) => {
      if (seenAtMs < horizonMs) this.seenWebhookEvents.delete(seenId);
    });
    this.seenWebhookEvents.set(eventId, nowMs);
    return providerOk({
      eventId,
      trackingNumber,
      status: mapCarrierTrackingStatus(rawType),
      occurredAt: record ? asNonEmptyString(record.occurredAt) : null,
      rawType,
    });
  }

  async verifyWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<{ eventId: string }>> {
    const verified = await this.verifyDeliveryEvent(rawBody, signature);
    if (!verified.ok) return verified;
    return providerOk({ eventId: verified.value.eventId }, verified.providerReference);
  }

  // ----- reconciliation -----------------------------------------------------

  /**
   * Compares xenios shipment records against the carrier's, keyed by client
   * reference id. Read-only: it classifies, it never mutates or re-creates.
   */
  async reconcileShipments(
    records: readonly ShipmentReconciliationRecord[],
  ): Promise<ProviderResult<ShipmentReconciliationReport>> {
    const guard = this.notReady();
    if (guard) return guard;
    const report: ShipmentReconciliationReport = {
      confirmed: [],
      missingAtCarrier: [],
      trackingMismatch: [],
      errors: [],
    };
    for (const record of records) {
      const { response, failure } = await this.send({
        method: "GET",
        path: `/v1/shipments/by-reference/${encodeURIComponent(record.clientReferenceId)}`,
      });
      if (failure) {
        report.errors.push({ clientReferenceId: record.clientReferenceId, message: failure.message });
        continue;
      }
      if (response!.status === 404) {
        report.missingAtCarrier.push(record.clientReferenceId);
        continue;
      }
      if (response!.status !== 200) {
        const mapped = this.failureFromStatus(response!.status, "Reconciliation lookup", response!.body);
        report.errors.push({ clientReferenceId: record.clientReferenceId, message: mapped.message });
        continue;
      }
      const carrierTracking = asNonEmptyString(asRecord(response!.body)?.trackingNumber);
      if (!carrierTracking) {
        report.errors.push({
          clientReferenceId: record.clientReferenceId,
          message: "The carrier record has no tracking number.",
        });
        continue;
      }
      if (record.trackingNumber === carrierTracking) {
        report.confirmed.push(record.clientReferenceId);
      } else {
        report.trackingMismatch.push({
          clientReferenceId: record.clientReferenceId,
          localTrackingNumber: record.trackingNumber,
          carrierTrackingNumber: carrierTracking,
        });
      }
    }
    return providerOk(report);
  }
}

// ---------------------------------------------------------------------------
// Environment validation and resolution
// ---------------------------------------------------------------------------

/**
 * Names only, never values. The optional
 * SHIPPING_TEMPERATURE_CONTROLLED_VALIDATED=true flag additionally declares a
 * validated cold-chain service and is deliberately NOT required: its absence
 * means the adapter refuses cold chain, which is the safe default.
 */
export function validateCarrierShippingEnvironment(env: NodeJS.ProcessEnv = process.env): {
  configured: boolean;
  missing: string[];
} {
  const missing = CarrierShippingAdapter.requiredEnvironmentVariables.filter((name) => {
    const value = env[name];
    return typeof value !== "string" || value.trim() === "";
  });
  return { configured: missing.length === 0, missing: [...missing] };
}

/**
 * Resolution. Note this defaults to ConfiguredRate rather than Disabled, because a
 * flat standard rate needs no credential and no carrier, and quoting it honestly is
 * strictly better for a member than showing nothing. Live rates still require the
 * live-shipping flag, and an explicitly selected but incomplete carrier resolves to
 * Disabled rather than silently falling back, so a half-configured live carrier
 * fails loudly instead of quietly quoting the flat rate.
 */
export function resolveShippingProvider(env: NodeJS.ProcessEnv = process.env): ShippingProvider {
  if (env.RESEARCH_SHIPPING_DISABLED === "true") return new DisabledShippingProvider();

  if (env.RESEARCH_LIVE_SHIPPING_ENABLED === "true") {
    const selected = env.SHIPPING_PROVIDER;
    if (selected === "test") {
      if (env.NODE_ENV === "production") return new ConfiguredRateShippingProvider();
      return new TestShippingProvider();
    }
    if (selected && selected !== "configured") {
      const check = validateCarrierShippingEnvironment(env);
      if (!check.configured) return new DisabledShippingProvider();
      // The synthetic-data guard: a live carrier adapter must never construct
      // over sandbox fixtures while the process is production-like. Throws
      // loudly BEFORE the adapter (and any carrier call) exists.
      assertNoSyntheticDataInProduction(
        {
          shippingConfig: {
            carrier: selected,
            baseUrl: env.SHIPPING_API_BASE_URL,
            authHeaderName: env.SHIPPING_API_AUTH_HEADER,
            apiKey: env.SHIPPING_API_KEY,
            webhookSecret: env.SHIPPING_WEBHOOK_SECRET,
          },
        },
        env,
      );
      return new CarrierShippingAdapter(
        {
          carrier: selected,
          supportsTemperatureControlled: env.SHIPPING_TEMPERATURE_CONTROLLED_VALIDATED === "true",
          webhookSecret: env.SHIPPING_WEBHOOK_SECRET,
        },
        buildFetchCarrierTransport({
          baseUrl: env.SHIPPING_API_BASE_URL!,
          authHeaderName: env.SHIPPING_API_AUTH_HEADER!,
          apiKey: env.SHIPPING_API_KEY!,
        }),
      );
    }
  }
  return new ConfiguredRateShippingProvider();
}
