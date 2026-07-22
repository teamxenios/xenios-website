// xenios research: third-party fulfillment boundary (Mitch owns peptides and Quantum).
//
// The security property this file exists to guarantee is DATA MINIMIZATION.
//
// A fulfillment partner needs to put a box on a truck. It does not need to know that
// the recipient has a health goal, an assessment, a Blueprint, a tracker history, a
// referral relationship, or any other order they have ever placed.
//
// That is enforced structurally rather than by convention: `buildMitchPayload` takes
// a rich internal object and CONSTRUCTS a new payload from a fixed allowlist of
// fields. There is no spread of the source object anywhere in this file, so a field
// added upstream later cannot leak by default. The accompanying test asserts that
// health data present on the input never appears in the output.

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";

export type FulfillmentTransportMode = "manual_export" | "signed_csv" | "sftp" | "api";

/** The rich internal view. Deliberately contains fields Mitch must never receive. */
export interface InternalFulfillmentRequest {
  fulfillmentOrderId: string;
  memberId: string;
  recipientName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  recipientPhone?: string;
  /** True only when the chosen carrier service genuinely requires a phone number. */
  carrierRequiresPhone: boolean;
  shippingService: string;
  handlingProfile: "ambient" | "cold_chain" | "not_confirmed";
  lines: Array<{ sku: string; quantity: number }>;

  // Everything below is internal-only and must never cross the boundary.
  memberHealthGoals?: string[];
  assessmentSummary?: string;
  blueprintReference?: string;
  trackerSummary?: string;
  referralCode?: string;
  previousOrderIds?: string[];
  internalNotes?: string;
}

/** Exactly what leaves xenios. Nothing else may be added without review. */
export interface MitchOutboundPayload {
  fulfillmentOrderId: string;
  recipientName: string;
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  recipientPhone?: string;
  shippingService: string;
  handlingProfile: "ambient" | "cold_chain" | "not_confirmed";
  lines: Array<{ sku: string; quantity: number }>;
}

/** The allowlist, exported so a test can assert the payload has no other keys. */
export const MITCH_ALLOWED_PAYLOAD_KEYS = [
  "fulfillmentOrderId",
  "recipientName",
  "shippingAddress",
  "recipientPhone",
  "shippingService",
  "handlingProfile",
  "lines",
] as const;

/**
 * Builds the outbound payload by explicit construction from the allowlist.
 *
 * The phone number is included ONLY when the carrier service requires it, so a
 * phone number is not shipped to a partner merely because xenios happens to hold one.
 */
export function buildMitchPayload(request: InternalFulfillmentRequest): MitchOutboundPayload {
  const payload: MitchOutboundPayload = {
    fulfillmentOrderId: request.fulfillmentOrderId,
    recipientName: request.recipientName,
    shippingAddress: {
      line1: request.shippingAddress.line1,
      city: request.shippingAddress.city,
      state: request.shippingAddress.state,
      postalCode: request.shippingAddress.postalCode,
      country: request.shippingAddress.country,
    },
    shippingService: request.shippingService,
    handlingProfile: request.handlingProfile,
    lines: request.lines.map((l) => ({ sku: l.sku, quantity: l.quantity })),
  };

  if (request.shippingAddress.line2) {
    payload.shippingAddress.line2 = request.shippingAddress.line2;
  }
  if (request.carrierRequiresPhone && request.recipientPhone) {
    payload.recipientPhone = request.recipientPhone;
  }
  return payload;
}

// ---------------------------------------------------------------------------

export type FulfillmentAcceptance =
  | { accepted: true; partnerReference: string }
  | { accepted: false; holdReason: string };

export interface FulfillmentStatusUpdate {
  fulfillmentOrderId: string;
  status: "accepted" | "rejected" | "on_hold" | "shipped" | "exception" | "delivered";
  holdReason?: string;
  lotId?: string;
  trackingNumber?: string;
  carrier?: string;
  shippedAt?: string;
  estimatedDelivery?: string;
  exceptionDetail?: string;
}

export interface FulfillmentProvider {
  readonly name: string;
  readonly transportMode: FulfillmentTransportMode | "none";

  submit(request: InternalFulfillmentRequest): Promise<ProviderResult<FulfillmentAcceptance>>;
  fetchStatus(fulfillmentOrderId: string): Promise<ProviderResult<FulfillmentStatusUpdate>>;
  verifyInboundWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<FulfillmentStatusUpdate>>;
}

export class DisabledMitchProvider implements FulfillmentProvider {
  readonly name = "disabled";
  readonly transportMode = "none" as const;

  async submit() {
    return providerDisabled<FulfillmentAcceptance>("mitch_fulfillment");
  }
  async fetchStatus() {
    return providerDisabled<FulfillmentStatusUpdate>("mitch_fulfillment");
  }
  async verifyInboundWebhook() {
    return providerDisabled<FulfillmentStatusUpdate>("mitch_fulfillment");
  }
}

export class TestMitchProvider implements FulfillmentProvider {
  readonly name = "test";
  readonly transportMode = "api" as const;

  /** Records exactly what would have been transmitted, for assertion in tests. */
  readonly submitted: MitchOutboundPayload[] = [];
  private counter = 0;

  constructor(options: { allowInProduction?: boolean } = {}) {
    if (process.env.NODE_ENV === "production" && !options.allowInProduction) {
      throw new Error("TestMitchProvider is not available in production");
    }
  }

  async submit(request: InternalFulfillmentRequest): Promise<ProviderResult<FulfillmentAcceptance>> {
    if (request.lines.length === 0) {
      return providerMisconfigured<FulfillmentAcceptance>("A fulfillment order must contain at least one line.");
    }
    if (request.handlingProfile === "not_confirmed") {
      return {
        ok: false,
        code: "REJECTED",
        message: "Handling profile is not confirmed. Refusing to ship without a storage decision.",
        retryable: false,
      };
    }
    const payload = buildMitchPayload(request);
    this.submitted.push(payload);
    return providerOk({ accepted: true as const, partnerReference: `test_ff_${++this.counter}` });
  }

  async fetchStatus(fulfillmentOrderId: string): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    return providerOk({ fulfillmentOrderId, status: "accepted" as const });
  }

  async verifyInboundWebhook(rawBody: string, signature: string | undefined): Promise<ProviderResult<FulfillmentStatusUpdate>> {
    if (signature !== "test-signature") {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }
    try {
      const parsed = JSON.parse(rawBody) as FulfillmentStatusUpdate;
      if (!parsed.fulfillmentOrderId || !parsed.status) {
        return { ok: false, code: "REJECTED", message: "Missing fulfillment order id or status.", retryable: false };
      }
      return providerOk(parsed);
    } catch {
      return { ok: false, code: "REJECTED", message: "Malformed body.", retryable: false };
    }
  }
}

/**
 * The real adapter shell.
 *
 * ACTIVATION: Mitch has not selected a transport yet. All four modes are modelled
 * (manual export, signed CSV, SFTP, API) so the choice is a configuration decision
 * rather than a rewrite. Credentials are requested only once the transport is chosen
 * and the payload contract is agreed in writing.
 */
export class MitchFulfillmentProvider implements FulfillmentProvider {
  readonly name = "mitch";

  static readonly requiredEnvironmentVariables = [
    "MITCH_TRANSPORT_MODE",
    "MITCH_ENDPOINT",
    "MITCH_API_KEY",
    "MITCH_WEBHOOK_SECRET",
  ] as const;

  constructor(readonly transportMode: FulfillmentTransportMode = "manual_export") {}

  private notImplemented<T>(): ProviderResult<T> {
    return providerMisconfigured<T>(
      "The Mitch fulfillment adapter is not implemented. Transport and payload contract are not agreed.",
    );
  }

  async submit() {
    return this.notImplemented<FulfillmentAcceptance>();
  }
  async fetchStatus() {
    return this.notImplemented<FulfillmentStatusUpdate>();
  }
  async verifyInboundWebhook() {
    return this.notImplemented<FulfillmentStatusUpdate>();
  }
}

export function resolveFulfillmentProvider(env: NodeJS.ProcessEnv = process.env): FulfillmentProvider {
  if (env.RESEARCH_MITCH_FULFILLMENT_ENABLED !== "true") return new DisabledMitchProvider();
  const selected = env.MITCH_PROVIDER;
  if (selected === "test") {
    if (env.NODE_ENV === "production") return new DisabledMitchProvider();
    return new TestMitchProvider();
  }
  if (selected === "mitch") {
    const mode = env.MITCH_TRANSPORT_MODE as FulfillmentTransportMode | undefined;
    return new MitchFulfillmentProvider(mode ?? "manual_export");
  }
  return new DisabledMitchProvider();
}
