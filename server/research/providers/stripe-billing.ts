// xenios research: membership billing provider seam, Stripe pieces.
//
// membership.ts today activates a member only through the admin-attested path:
// a human verifies the $50 activation payment reference and the active $25
// monthly subscription reference by hand. This file is the Phase 5 seam that
// replaces hand attestation with verified Stripe objects, while changing
// nothing about who decides: the state machine in membership.ts still owns
// every transition, and this adapter only creates, cancels, reconciles, and
// verifies provider objects.
//
// Nothing here flips a flag. The resolver returns Disabled unless
// RESEARCH_MEMBERSHIP_BILLING_ENABLED is "true" AND stripe is the selected
// provider AND every credential NAME is present. The adapter refuses to
// construct without a complete configuration, so a half-configured billing
// path cannot exist.
//
// No card data is stored or handled: the activation payment happens on the
// provider's hosted checkout page, and the subscription is created against a
// provider customer. xenios only ever holds opaque provider references.

import {
  providerDisabled,
  providerMisconfigured,
  providerOk,
  type ProviderResult,
} from "@shared/research/capability";
import type { MemberBillingState } from "@shared/research/membership-types";
import {
  STRIPE_WEBHOOK_TOLERANCE_SECONDS,
  asJsonObject,
  buildFetchStripeTransport,
  mapStripeFailure,
  stripeTransportFailure,
  unrecognizedProviderStatus,
  verifyStripeSignature,
  type StripeRequest,
  type StripeResponse,
  type StripeTransport,
} from "./payment";

// The membership offer, fixed by the approved membership terms. The provider
// price objects (named by env var) must charge exactly these amounts; a
// mismatch is refused as MISCONFIGURED rather than charging the wrong number.
export const ACTIVATION_AMOUNT_CENTS = 5000;
export const MEMBERSHIP_MONTHLY_AMOUNT_CENTS = 2500;

// ---------------------------------------------------------------------------
// Seam types
// ---------------------------------------------------------------------------

export interface BillingCustomer {
  customerId: string;
}

export interface ActivationCheckout {
  /** The provider reference for the $50 activation payment session. */
  reference: string;
  /** The provider-hosted page where the member pays. Card data never touches xenios. */
  checkoutUrl: string;
  amountCents: number;
}

export interface SubscriptionState {
  /** The separate recurring reference, distinct from the activation reference. */
  subscriptionId: string;
  /** The provider's own status word, for the audit trail. */
  providerStatus: string;
  /** The domain billing state membership.ts stores. */
  billingState: MemberBillingState;
  cancelAtPeriodEnd: boolean;
  latestInvoiceReference?: string;
}

export interface BillingWebhookVerification {
  eventId: string;
  eventType: string;
  /**
   * The billing state this event maps to, when the event type is one this code
   * was written for. Undefined means verified but carrying no billing effect;
   * the caller ignores it rather than guessing.
   */
  billingEffect?: MemberBillingState;
  subscriptionReference?: string;
  paymentReference?: string;
  verified: true;
}

/**
 * The membership billing seam. membership.ts (or its Phase 5 successor) is the
 * only intended caller; the provider never decides a member's status, it only
 * reports what the money did.
 */
export interface MembershipBillingProvider {
  readonly name: string;

  createCustomer(input: {
    memberId: string;
    email: string;
    idempotencyKey: string;
  }): Promise<ProviderResult<BillingCustomer>>;

  /** The $50 one-time activation payment, on the provider's hosted page. */
  createActivationCheckout(input: {
    customerId: string;
    memberId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderResult<ActivationCheckout>>;

  /** The $25 monthly subscription. Returns the separate recurring reference. */
  startSubscription(input: {
    customerId: string;
    memberId: string;
    idempotencyKey: string;
  }): Promise<ProviderResult<SubscriptionState>>;

  cancelSubscription(
    subscriptionId: string,
    options?: { atPeriodEnd?: boolean },
  ): Promise<ProviderResult<SubscriptionState>>;

  /** Undoes a pending at-period-end cancellation. Refused once fully cancelled. */
  reactivateSubscription(subscriptionId: string): Promise<ProviderResult<SubscriptionState>>;

  /** Reconciliation: fetch the provider's current subscription state. */
  reconcileSubscription(subscriptionId: string): Promise<ProviderResult<SubscriptionState>>;

  verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<ProviderResult<BillingWebhookVerification>>;
}

// ---------------------------------------------------------------------------
// Disabled (the production default)
// ---------------------------------------------------------------------------

export class DisabledMembershipBillingProvider implements MembershipBillingProvider {
  readonly name = "disabled";

  async createCustomer() {
    return providerDisabled<BillingCustomer>("membership_billing");
  }
  async createActivationCheckout() {
    return providerDisabled<ActivationCheckout>("membership_billing");
  }
  async startSubscription() {
    return providerDisabled<SubscriptionState>("membership_billing");
  }
  async cancelSubscription() {
    return providerDisabled<SubscriptionState>("membership_billing");
  }
  async reactivateSubscription() {
    return providerDisabled<SubscriptionState>("membership_billing");
  }
  async reconcileSubscription() {
    return providerDisabled<SubscriptionState>("membership_billing");
  }
  async verifyWebhook() {
    return providerDisabled<BillingWebhookVerification>("membership_billing");
  }
}

// ---------------------------------------------------------------------------
// Status and event mapping
// ---------------------------------------------------------------------------

/**
 * Subscription status to domain billing state. `paused` and anything else
 * Stripe adds later are deliberately unmapped: an unrecognized status is an
 * explicit provider error, never a guessed membership state.
 */
const SUBSCRIPTION_STATUS_BILLING: Record<string, MemberBillingState> = {
  incomplete: "subscription_pending",
  incomplete_expired: "cancelled",
  trialing: "active",
  active: "active",
  past_due: "past_due",
  unpaid: "past_due",
  canceled: "cancelled",
};

/**
 * Billing event types to their domain billing effect.
 *
 * A failed payment maps to past_due; the provider runs its own retry schedule
 * and every retry outcome arrives as another signed invoice event, so retry
 * handling is event-driven here, never adapter-driven. customer.subscription
 * .updated is deliberately unmapped: its payload summarizes too many distinct
 * changes, so the caller reconciles via reconcileSubscription instead.
 */
const BILLING_EVENT_EFFECTS: Record<string, MemberBillingState> = {
  "checkout.session.completed": "subscription_pending",
  "invoice.paid": "active",
  "invoice.payment_succeeded": "active",
  "invoice.payment_failed": "past_due",
  "invoice.payment_action_required": "past_due",
  "customer.subscription.deleted": "cancelled",
  "charge.refunded": "refunded",
  "charge.dispute.created": "disputed",
};

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const STRIPE_BILLING_ENVIRONMENT_VARIABLES = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_RESEARCH_ACTIVATION",
  "STRIPE_PRICE_RESEARCH_MEMBERSHIP",
] as const;

export interface StripeBillingConfig {
  secretKey: string;
  webhookSecret: string;
  activationPriceId: string;
  membershipPriceId: string;
  transport?: StripeTransport;
  now?: () => number;
  toleranceSeconds?: number;
}

/** Reports missing VARIABLE NAMES only. A value never appears in the result. */
export function validateStripeBillingConfig(
  env: NodeJS.ProcessEnv = process.env,
):
  | {
      ok: true;
      secretKey: string;
      webhookSecret: string;
      activationPriceId: string;
      membershipPriceId: string;
    }
  | { ok: false; missingEnvironmentVariables: string[] } {
  const secretKey = env.STRIPE_SECRET_KEY;
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  const activationPriceId = env.STRIPE_PRICE_RESEARCH_ACTIVATION;
  const membershipPriceId = env.STRIPE_PRICE_RESEARCH_MEMBERSHIP;
  const missing: string[] = [];
  if (!secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!webhookSecret) missing.push("STRIPE_WEBHOOK_SECRET");
  if (!activationPriceId) missing.push("STRIPE_PRICE_RESEARCH_ACTIVATION");
  if (!membershipPriceId) missing.push("STRIPE_PRICE_RESEARCH_MEMBERSHIP");
  if (!secretKey || !webhookSecret || !activationPriceId || !membershipPriceId) {
    return { ok: false, missingEnvironmentVariables: missing };
  }
  return { ok: true, secretKey, webhookSecret, activationPriceId, membershipPriceId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readString(source: Record<string, unknown> | null, key: string): string | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readNumber(source: Record<string, unknown> | null, key: string): number | undefined {
  if (!source) return undefined;
  const value = source[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// ---------------------------------------------------------------------------
// Stripe adapter
// ---------------------------------------------------------------------------

export class StripeMembershipBillingAdapter implements MembershipBillingProvider {
  readonly name = "stripe";

  private readonly transport: StripeTransport;
  private readonly webhookSecret: string;
  private readonly activationPriceId: string;
  private readonly membershipPriceId: string;
  private readonly now: () => number;
  private readonly toleranceSeconds: number;

  constructor(config: StripeBillingConfig) {
    if (!config.secretKey || !config.webhookSecret || !config.activationPriceId || !config.membershipPriceId) {
      throw new Error(
        "StripeMembershipBillingAdapter requires a complete configuration. " +
          "Use resolveMembershipBillingProvider, which falls back to Disabled when anything is absent.",
      );
    }
    this.transport = config.transport ?? buildFetchStripeTransport(config.secretKey);
    this.webhookSecret = config.webhookSecret;
    this.activationPriceId = config.activationPriceId;
    this.membershipPriceId = config.membershipPriceId;
    this.now = config.now ?? Date.now;
    this.toleranceSeconds = config.toleranceSeconds ?? STRIPE_WEBHOOK_TOLERANCE_SECONDS;
  }

  private async call(request: StripeRequest): Promise<StripeResponse | null> {
    try {
      return await this.transport(request);
    } catch {
      return null;
    }
  }

  /** Maps one subscription response body to the domain SubscriptionState. */
  private toSubscriptionState(body: unknown, context: string): ProviderResult<SubscriptionState> {
    const subscription = asJsonObject(body);
    const subscriptionId = readString(subscription, "id");
    const providerStatus = readString(subscription, "status");
    if (!subscription || !subscriptionId || !providerStatus) {
      return unrecognizedProviderStatus(context, "unparseable response");
    }
    const billingState = SUBSCRIPTION_STATUS_BILLING[providerStatus];
    if (!billingState) return unrecognizedProviderStatus(context, providerStatus);

    const latestInvoice = asJsonObject(subscription.latest_invoice);
    const latestInvoiceReference =
      readString(latestInvoice, "id") ?? readString(subscription, "latest_invoice");

    return providerOk<SubscriptionState>(
      {
        subscriptionId,
        providerStatus,
        billingState,
        cancelAtPeriodEnd: subscription.cancel_at_period_end === true,
        latestInvoiceReference,
      },
      subscriptionId,
    );
  }

  async createCustomer(input: {
    memberId: string;
    email: string;
    idempotencyKey: string;
  }): Promise<ProviderResult<BillingCustomer>> {
    const response = await this.call({
      method: "POST",
      path: "/v1/customers",
      form: {
        email: input.email,
        "metadata[memberId]": input.memberId,
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    const customer = asJsonObject(response.body);
    const customerId = readString(customer, "id");
    if (!customerId) return unrecognizedProviderStatus("customer creation", "response without an id");
    return providerOk<BillingCustomer>({ customerId }, customerId);
  }

  async createActivationCheckout(input: {
    customerId: string;
    memberId: string;
    idempotencyKey: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<ProviderResult<ActivationCheckout>> {
    const response = await this.call({
      method: "POST",
      path: "/v1/checkout/sessions",
      form: {
        mode: "payment",
        customer: input.customerId,
        "line_items[0][price]": this.activationPriceId,
        "line_items[0][quantity]": "1",
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
        "metadata[memberId]": input.memberId,
        "metadata[purpose]": "research_membership_activation",
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);

    const session = asJsonObject(response.body);
    const reference = readString(session, "id");
    const checkoutUrl = readString(session, "url");
    if (!reference || !checkoutUrl) {
      return unrecognizedProviderStatus("activation checkout", "response without id or url");
    }
    // The price object lives at the provider; a wrong price id would silently
    // charge the wrong number. Refuse anything that is not exactly the $50
    // activation amount, naming the variable, never a value.
    const amountTotal = readNumber(session, "amount_total");
    if (amountTotal !== undefined && amountTotal !== ACTIVATION_AMOUNT_CENTS) {
      return providerMisconfigured<ActivationCheckout>(
        `The activation price does not charge ${ACTIVATION_AMOUNT_CENTS} cents. Check STRIPE_PRICE_RESEARCH_ACTIVATION.`,
      );
    }
    return providerOk<ActivationCheckout>(
      { reference, checkoutUrl, amountCents: amountTotal ?? ACTIVATION_AMOUNT_CENTS },
      reference,
    );
  }

  async startSubscription(input: {
    customerId: string;
    memberId: string;
    idempotencyKey: string;
  }): Promise<ProviderResult<SubscriptionState>> {
    const response = await this.call({
      method: "POST",
      path: "/v1/subscriptions",
      form: {
        customer: input.customerId,
        "items[0][price]": this.membershipPriceId,
        payment_behavior: "default_incomplete",
        "metadata[memberId]": input.memberId,
        "expand[0]": "latest_invoice",
      },
      idempotencyKey: input.idempotencyKey,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);

    // Same guard as activation: the recurring price must be exactly $25/month.
    const subscription = asJsonObject(response.body);
    const items = asJsonObject(subscription?.items);
    const firstItem = Array.isArray(items?.data) ? asJsonObject(items.data[0]) : null;
    const price = asJsonObject(firstItem?.price);
    const unitAmount = readNumber(price, "unit_amount");
    if (unitAmount !== undefined && unitAmount !== MEMBERSHIP_MONTHLY_AMOUNT_CENTS) {
      return providerMisconfigured<SubscriptionState>(
        `The membership price does not charge ${MEMBERSHIP_MONTHLY_AMOUNT_CENTS} cents monthly. Check STRIPE_PRICE_RESEARCH_MEMBERSHIP.`,
      );
    }
    return this.toSubscriptionState(response.body, "subscription start");
  }

  async cancelSubscription(
    subscriptionId: string,
    options: { atPeriodEnd?: boolean } = {},
  ): Promise<ProviderResult<SubscriptionState>> {
    const atPeriodEnd = options.atPeriodEnd ?? true;
    const response = atPeriodEnd
      ? await this.call({
          method: "POST",
          path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
          form: { cancel_at_period_end: "true" },
        })
      : await this.call({
          method: "DELETE",
          path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
        });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    return this.toSubscriptionState(response.body, "subscription cancellation");
  }

  async reactivateSubscription(subscriptionId: string): Promise<ProviderResult<SubscriptionState>> {
    // Only a pending at-period-end cancellation can be undone. A fully
    // cancelled subscription is refused by the provider, which maps to
    // REJECTED here; the caller starts a new subscription instead.
    const response = await this.call({
      method: "POST",
      path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
      form: { cancel_at_period_end: "false" },
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    return this.toSubscriptionState(response.body, "subscription reactivation");
  }

  async reconcileSubscription(subscriptionId: string): Promise<ProviderResult<SubscriptionState>> {
    const response = await this.call({
      method: "GET",
      path: `/v1/subscriptions/${encodeURIComponent(subscriptionId)}`,
    });
    if (!response) return stripeTransportFailure();
    if (response.status !== 200) return mapStripeFailure(response.status, response.body);
    return this.toSubscriptionState(response.body, "subscription reconciliation");
  }

  async verifyWebhook(
    rawBody: string,
    signatureHeader: string | undefined,
  ): Promise<ProviderResult<BillingWebhookVerification>> {
    if (!signatureHeader) {
      return { ok: false, code: "REJECTED", message: "Missing signature header.", retryable: false };
    }
    const failure = verifyStripeSignature(
      rawBody,
      signatureHeader,
      this.webhookSecret,
      this.now(),
      this.toleranceSeconds,
    );
    if (failure === "malformed") {
      return { ok: false, code: "REJECTED", message: "Malformed signature header.", retryable: false };
    }
    if (failure === "stale") {
      return { ok: false, code: "REJECTED", message: "Webhook timestamp is outside the tolerance window.", retryable: false };
    }
    if (failure) {
      return { ok: false, code: "REJECTED", message: "Invalid signature.", retryable: false };
    }

    let event: Record<string, unknown> | null = null;
    try {
      event = asJsonObject(JSON.parse(rawBody));
    } catch {
      event = null;
    }
    if (!event) {
      return { ok: false, code: "REJECTED", message: "Malformed webhook body.", retryable: false };
    }
    const eventId = readString(event, "id");
    const eventType = readString(event, "type");
    if (!eventId || !eventType) {
      return { ok: false, code: "REJECTED", message: "Webhook missing id or type.", retryable: false };
    }

    // Replay of a verified event id is the caller's event store's job, exactly
    // as on the commerce webhook surface.
    const dataObject = asJsonObject(asJsonObject(event.data)?.object);
    const objectId = readString(dataObject, "id");
    const subscriptionReference =
      objectId && objectId.startsWith("sub_") ? objectId : readString(dataObject, "subscription");
    const paymentReference =
      readString(dataObject, "payment_intent") ??
      (objectId && objectId.startsWith("pi_") ? objectId : undefined);

    return providerOk<BillingWebhookVerification>({
      eventId,
      eventType,
      billingEffect: BILLING_EVENT_EFFECTS[eventType],
      subscriptionReference,
      paymentReference,
      verified: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Resolution
// ---------------------------------------------------------------------------

/**
 * Chooses the membership billing provider. Defaults to Disabled.
 *
 * Three independent conditions must all hold before the Stripe adapter exists:
 * the billing flag is on, stripe is the selected payments provider, and every
 * credential name resolves. Anything less is a truthful Disabled, never a
 * partially configured adapter.
 */
export function resolveMembershipBillingProvider(
  env: NodeJS.ProcessEnv = process.env,
): MembershipBillingProvider {
  if (env.RESEARCH_MEMBERSHIP_BILLING_ENABLED !== "true") {
    return new DisabledMembershipBillingProvider();
  }
  const selected = env.PAYMENTS_PROVIDER ?? env.PAYMENT_PROVIDER;
  if (selected !== "stripe") return new DisabledMembershipBillingProvider();
  const config = validateStripeBillingConfig(env);
  if (!config.ok) return new DisabledMembershipBillingProvider();
  return new StripeMembershipBillingAdapter({
    secretKey: config.secretKey,
    webhookSecret: config.webhookSecret,
    activationPriceId: config.activationPriceId,
    membershipPriceId: config.membershipPriceId,
  });
}
