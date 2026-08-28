// Xenios Research: durable checkout command/saga.
//
// This is the production money boundary. A database transaction cannot span a
// payment provider call, so the service deliberately does not pretend one can.
// Instead it:
//
//   1. evaluates every read-only gate;
//   2. obtains one durable activation/cart intention;
//   3. persists an immutable checkout command and reserves inventory/credit;
//   4. calls the provider with durable phase-specific idempotency keys; and
//   5. atomically publishes the order + finalizes internal effects, or atomically
//      compensates them after the provider proves no money moved.
//
// Ambiguous provider results remain explicit reconciliation states. Inventory,
// credit, and the activation lease stay held. A retry drives the SAME durable
// command with the SAME provider key; it never manufactures an order from an
// error and never releases value while money may have moved.

import { createHash } from "node:crypto";
import type { CartDto, CheckoutRequest, CommerceDenialCode } from "@shared/research/commerce-api";
import {
  evaluateLargeOrderReview,
  orderShippingTotalCents,
  type LargeOrderTrigger,
  type ShippingQuote,
  type SubscriptionFrequencyDays,
} from "@shared/research/commerce";
import type { ProviderFailureCode } from "@shared/research/capability";
import type { PaymentProvider } from "../providers/payment";
import type { ShippingProvider } from "../providers/shipping";
import type { CheckoutOrder, CheckoutOutcome, CheckoutService, ReservationRefusalCode } from "./checkout";
import type { OrderRecord, OrderRepository } from "./orders";

export const CHECKOUT_SAGA_PROTOCOL = "xenios:research-checkout-saga:v1";
export const DEFAULT_ACTIVATION_PRECHARGE_TTL_SECONDS = 30 * 60;

// ---------------------------------------------------------------------------
// Activation precharge port. This mirrors the activation lane's pinned export
// while this isolated branch waits for integration. `begin` below owns the
// atomic claim RPC; calling claim separately in the service would create a
// crash gap between the claim and command persistence.
// ---------------------------------------------------------------------------

export interface CheckoutActivationLineEvidence {
  productId: string;
  variantId: string;
  sku: string;
  productRevision: number;
  variantRevision: number;
  bindingFingerprint: string;
  activationLedgerRevision: number;
  activationEvidenceFingerprint: string;
  quantity: number;
  purchaseMode: "one_time" | "subscription";
  subscriptionFrequencyDays?: SubscriptionFrequencyDays;
}

export interface CheckoutActivationPrechargeEvidence {
  intentId: string;
  cartId: string;
  cartVersion: number;
  cartFingerprint: string;
  lines: readonly CheckoutActivationLineEvidence[];
  authorizedAt: string;
  expiresAt: string;
}

export type CheckoutActivationPrechargePortResult =
  | { ok: true; authorization: CheckoutActivationPrechargeEvidence }
  | {
      ok: false;
      code: "authority_unavailable" | "activation_not_live" | "cart_empty" | "cart_conflict";
    };

export interface CheckoutActivationPrechargePort {
  authorize(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    evaluatedAt: string;
    leaseTtlSeconds: number;
  }>): Promise<CheckoutActivationPrechargePortResult>;
  claim(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    expectedCartFingerprint: string;
    at: string;
  }>): Promise<unknown>;
  consume(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    expectedCartFingerprint: string;
    at: string;
  }>): Promise<unknown>;
  cancel(input: Readonly<{
    memberId: string;
    checkoutIdempotencyKey: string;
    intentId: string;
    checkoutCommandId: string;
    at: string;
  }>): Promise<unknown>;
}

export const unavailableCheckoutActivationPrechargePort: CheckoutActivationPrechargePort = {
  authorize: async () => ({ ok: false, code: "authority_unavailable" }),
  claim: async () => ({ ok: false, code: "authority_unavailable" }),
  consume: async () => ({ ok: false, code: "authority_unavailable" }),
  cancel: async () => ({ ok: false, code: "authority_unavailable" }),
};

// ---------------------------------------------------------------------------
// Durable command model
// ---------------------------------------------------------------------------

export type CheckoutSagaState =
  | "authorization_pending"
  | "authorization_reconciliation_pending"
  | "capture_pending"
  | "capture_reconciliation_pending"
  | "cancellation_pending"
  | "cancellation_reconciliation_pending"
  | "completed"
  | "rejected";

export type CheckoutReconciliationPhase = "authorization" | "capture" | "cancellation";

export interface CheckoutRequestBinding {
  shippingAddress: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: "US";
  };
  shippingService: CheckoutRequest["shippingService"];
  acceptedAgreementKeys: string[];
  researchAttestation: boolean;
  applyStoreCreditCents: number;
  paymentMethodReference: string;
}

export interface CheckoutSagaCommand {
  protocol: typeof CHECKOUT_SAGA_PROTOCOL;
  commandId: string;
  orderId: string;
  memberId: string;
  checkoutIdempotencyKey: string;
  checkoutIdempotencyKeyHash: string;
  providerAuthorizationKey: string;
  providerCaptureKey: string;
  providerCancellationKey: string;
  placedAt: string;
  request: CheckoutRequestBinding;
  activation: CheckoutActivationPrechargeEvidence;
  cart: CartDto;
  shippingQuote: ShippingQuote;
  totals: {
    currency: "usd";
    subtotalCents: number;
    shippingCents: number;
    storeCreditAppliedCents: number;
    totalCents: number;
  };
  reviewTriggers: LargeOrderTrigger[];
}

export interface CheckoutSagaSnapshot {
  command: CheckoutSagaCommand;
  commandDigest: string;
  state: CheckoutSagaState;
  reservationIds: string[];
  providerReference: string | null;
  authorizedAmountCents: number | null;
  capturedAmountCents: number | null;
  order: CheckoutOrder | null;
  lastReconciliationPhase: CheckoutReconciliationPhase | null;
}

export type CheckoutSagaStoreCode =
  | "capability_unavailable"
  | "not_found"
  | "idempotency_conflict"
  | "command_invalid"
  | "activation_unavailable"
  | "inventory_unavailable"
  | "credit_unavailable"
  | "state_conflict";

export type CheckoutSagaReadResult =
  | { ok: true; snapshot: CheckoutSagaSnapshot | null }
  | { ok: false; code: "capability_unavailable" };

export type CheckoutSagaMutationResult =
  | { ok: true; snapshot: CheckoutSagaSnapshot; idempotent: boolean }
  | {
      ok: false;
      code: CheckoutSagaStoreCode;
      reservationRefusals?: ReservationRefusalCode[];
    };

/**
 * Implementations own the internal transaction. In production every mutation
 * below is one database RPC. `begin` must claim the exact activation intent in
 * the same transaction that persists the command/reservations/credit hold; a
 * successful begin is the proof required before provider I/O. `completeCaptured` must consume the activation
 * intention, finalize reservations, append the credit spend, insert the order
 * projection/events, and mark the command complete in ONE transaction.
 * `compensate` must cancel the activation intention, release reservations and
 * the credit hold, and mark the command rejected in ONE transaction.
 */
export interface CheckoutSagaStore {
  find(memberId: string, checkoutIdempotencyKeyHash: string): Promise<CheckoutSagaReadResult>;
  begin(command: CheckoutSagaCommand): Promise<CheckoutSagaMutationResult>;
  recordAuthorization(input: Readonly<{
    commandId: string;
    providerReference: string;
    authorizedAmountCents: number;
    at: string;
  }>): Promise<CheckoutSagaMutationResult>;
  markReconciliation(input: Readonly<{
    commandId: string;
    phase: CheckoutReconciliationPhase;
    providerReference: string | null;
    providerCode: ProviderFailureCode;
    at: string;
  }>): Promise<CheckoutSagaMutationResult>;
  markCancellationPending(input: Readonly<{
    commandId: string;
    providerReference: string;
    at: string;
  }>): Promise<CheckoutSagaMutationResult>;
  completeCaptured(input: Readonly<{
    commandId: string;
    providerReference: string;
    capturedAmountCents: number;
    at: string;
  }>): Promise<CheckoutSagaMutationResult>;
  compensate(input: Readonly<{
    commandId: string;
    at: string;
    reason: "authorization_rejected" | "authorization_cancelled" | "capture_rejected";
  }>): Promise<CheckoutSagaMutationResult>;
}

export const unavailableCheckoutSagaStore: CheckoutSagaStore = {
  find: async () => ({ ok: false, code: "capability_unavailable" }),
  begin: async () => ({ ok: false, code: "capability_unavailable" }),
  recordAuthorization: async () => ({ ok: false, code: "capability_unavailable" }),
  markReconciliation: async () => ({ ok: false, code: "capability_unavailable" }),
  markCancellationPending: async () => ({ ok: false, code: "capability_unavailable" }),
  completeCaptured: async () => ({ ok: false, code: "capability_unavailable" }),
  compensate: async () => ({ ok: false, code: "capability_unavailable" }),
};

// ---------------------------------------------------------------------------
// Canonical encoding and identifiers
// ---------------------------------------------------------------------------

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const nested = source[key];
    if (nested !== undefined) out[key] = canonicalize(nested);
  }
  return out;
}

export function canonicalCheckoutJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function checkoutSha256(value: unknown): string {
  return createHash("sha256").update(canonicalCheckoutJson(value), "utf8").digest("hex");
}

function deterministicUuid(namespace: string, memberId: string, idempotencyKey: string): string {
  const chars = createHash("sha256")
    .update(canonicalCheckoutJson([CHECKOUT_SAGA_PROTOCOL, namespace, memberId, idempotencyKey]), "utf8")
    .digest("hex")
    .slice(0, 32)
    .split("");
  // RFC-4122-shaped deterministic identifier. The hash is the entropy; these
  // bits make it acceptable to UUID columns without claiming it is random.
  chars[12] = "5";
  chars[16] = ((Number.parseInt(chars[16]!, 16) & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function providerCommandKey(phase: string, commandId: string): string {
  const digest = createHash("sha256")
    .update(canonicalCheckoutJson([CHECKOUT_SAGA_PROTOCOL, phase, commandId]), "utf8")
    .digest("hex");
  return `xr_checkout_${phase}_v1_${digest}`;
}

function cloneCart(cart: CartDto): CartDto {
  return {
    ...cart,
    lines: cart.lines.map((line) => ({ ...line })),
    shipmentGroups: cart.shipmentGroups.map((group) => ({ ...group, skus: [...group.skus] })),
    blockingReasons: [...cart.blockingReasons],
    requiredAgreements: [...cart.requiredAgreements],
  };
}

function cloneActivation(value: CheckoutActivationPrechargeEvidence): CheckoutActivationPrechargeEvidence {
  return { ...value, lines: value.lines.map((line) => ({ ...line })) };
}

function cloneCommand(command: CheckoutSagaCommand): CheckoutSagaCommand {
  return {
    ...command,
    request: {
      ...command.request,
      shippingAddress: { ...command.request.shippingAddress },
      acceptedAgreementKeys: [...command.request.acceptedAgreementKeys],
    },
    activation: cloneActivation(command.activation),
    cart: cloneCart(command.cart),
    shippingQuote: {
      ...command.shippingQuote,
      estimatedDeliveryRange: command.shippingQuote.estimatedDeliveryRange
        ? { ...command.shippingQuote.estimatedDeliveryRange }
        : null,
    },
    totals: { ...command.totals },
    reviewTriggers: [...command.reviewTriggers],
  };
}

function cloneOrder(order: CheckoutOrder | null): CheckoutOrder | null {
  if (!order) return null;
  return {
    ...order,
    lines: order.lines.map((line) => ({ ...line })),
    shipmentGroups: order.shipmentGroups.map((group) => ({ ...group, skus: [...group.skus] })),
    reviewTriggers: [...order.reviewTriggers],
    reservationIds: [...order.reservationIds],
  };
}

function cloneSnapshot(snapshot: CheckoutSagaSnapshot): CheckoutSagaSnapshot {
  return {
    ...snapshot,
    command: cloneCommand(snapshot.command),
    reservationIds: [...snapshot.reservationIds],
    order: cloneOrder(snapshot.order),
  };
}

// ---------------------------------------------------------------------------
// Read-only evaluation
// ---------------------------------------------------------------------------

class Denials {
  private readonly values: CommerceDenialCode[] = [];
  add(value: CommerceDenialCode): void {
    if (!this.values.includes(value)) this.values.push(value);
  }
  addAll(values: readonly CommerceDenialCode[]): void {
    values.forEach((value) => this.add(value));
  }
  get list(): CommerceDenialCode[] {
    return [...this.values];
  }
  get empty(): boolean {
    return this.values.length === 0;
  }
}

function structurallyValidAddress(address: CheckoutRequest["shippingAddress"] | undefined): boolean {
  if (!address || address.country !== "US") return false;
  if (typeof address.line1 !== "string" || address.line1.trim() === "") return false;
  if (address.line2 !== undefined && typeof address.line2 !== "string") return false;
  if (typeof address.city !== "string" || address.city.trim() === "") return false;
  if (typeof address.state !== "string" || !/^[A-Za-z]{2}$/.test(address.state)) return false;
  if (typeof address.postalCode !== "string" || !/^\d{5}(-\d{4})?$/.test(address.postalCode)) return false;
  return true;
}

function normalizedRequestBinding(req: CheckoutRequest): CheckoutRequestBinding | null {
  if (!structurallyValidAddress(req.shippingAddress)) return null;
  if (!Array.isArray(req.acceptedAgreementKeys) || req.acceptedAgreementKeys.some((key) => typeof key !== "string")) {
    return null;
  }
  const accepted = Array.from(new Set(req.acceptedAgreementKeys.map((key) => key.trim()).filter(Boolean))).sort();
  return {
    shippingAddress: {
      line1: req.shippingAddress.line1.trim(),
      ...(req.shippingAddress.line2?.trim() ? { line2: req.shippingAddress.line2.trim() } : {}),
      city: req.shippingAddress.city.trim(),
      state: req.shippingAddress.state.toUpperCase(),
      postalCode: req.shippingAddress.postalCode,
      country: "US",
    },
    shippingService: req.shippingService,
    acceptedAgreementKeys: accepted,
    researchAttestation: req.researchAttestation === true,
    applyStoreCreditCents: req.applyStoreCreditCents ?? 0,
    paymentMethodReference: req.paymentMethodReference ?? "",
  };
}

function validPaymentMethodReference(value: string | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9_:-]{3,200}$/.test(value) &&
    // A browser must supply only an opaque provider token. A string that looks
    // like a PAN is rejected at the boundary and is never persisted.
    !/\d{13,19}/.test(value)
  );
}

function validSafeMoney(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function activationMatchesCart(
  activation: CheckoutActivationPrechargeEvidence,
  cart: CartDto,
  asOf: Date,
): boolean {
  if (
    !activation.intentId ||
    !activation.cartId ||
    !Number.isSafeInteger(activation.cartVersion) ||
    activation.cartVersion <= 0 ||
    !/^sha256:[a-f0-9]{64}$/.test(activation.cartFingerprint) ||
    !Number.isFinite(Date.parse(activation.authorizedAt)) ||
    !Number.isFinite(Date.parse(activation.expiresAt)) ||
    Date.parse(activation.expiresAt) <= asOf.getTime()
  ) {
    return false;
  }
  const cartLines = [...cart.lines].sort((a, b) => a.sku.localeCompare(b.sku));
  const activationLines = [...activation.lines].sort((a, b) => a.sku.localeCompare(b.sku));
  if (cartLines.length !== activationLines.length) return false;
  return cartLines.every((line, index) => {
    const evidence = activationLines[index];
    if (!evidence) return false;
    return (
      evidence.sku === line.sku &&
      evidence.quantity === line.quantity &&
      evidence.purchaseMode === line.purchaseMode &&
      (evidence.subscriptionFrequencyDays ?? null) === (line.subscriptionFrequencyDays ?? null) &&
      Boolean(evidence.productId) &&
      Boolean(evidence.variantId) &&
      Number.isSafeInteger(evidence.productRevision) &&
      evidence.productRevision > 0 &&
      Number.isSafeInteger(evidence.variantRevision) &&
      evidence.variantRevision > 0 &&
      Number.isSafeInteger(evidence.activationLedgerRevision) &&
      evidence.activationLedgerRevision > 0 &&
      /^sha256:[a-f0-9]{64}$/.test(evidence.bindingFingerprint) &&
      /^sha256:[a-f0-9]{64}$/.test(evidence.activationEvidenceFingerprint)
    );
  });
}

interface CheckoutEvaluation {
  denials: Denials;
  cart: CartDto;
  quote: ShippingQuote | null;
  request: CheckoutRequestBinding | null;
  reviewTriggers: LargeOrderTrigger[];
  totals: CheckoutSagaCommand["totals"] | null;
}

export interface AtomicCheckoutDeps {
  cart: { revalidate(memberId: string, asOf: Date): Promise<CartDto> };
  activation: CheckoutActivationPrechargePort;
  saga: CheckoutSagaStore;
  payment: PaymentProvider;
  shipping: ShippingProvider;
  commerceEnabled: boolean;
  /** True only when composition resolved both reviewed activation + saga RPCs. */
  atomicCapabilityReady?: boolean;
  serviceableStates: string[];
  acceptedAgreementKeys: string[];
  packageWeightGrams?: number;
  unusualQuantityThreshold?: number;
  isFraudFlagged?: (memberId: string) => boolean;
  activationLeaseTtlSeconds?: number;
}

const DEFAULT_PACKAGE_WEIGHT_GRAMS = 500;

async function evaluate(
  deps: AtomicCheckoutDeps,
  memberId: string,
  req: CheckoutRequest,
  asOf: Date,
): Promise<CheckoutEvaluation> {
  const denials = new Denials();
  let cart: CartDto;
  try {
    cart = await deps.cart.revalidate(memberId, asOf);
  } catch {
    cart = {
      lines: [],
      shipmentGroups: [],
      subtotalCents: 0,
      shippingCents: 0,
      storeCreditAppliedCents: 0,
      estimatedTotalCents: 0,
      checkoutReady: false,
      blockingReasons: ["cart_revalidation_failed"],
      requiredAgreements: [],
    };
    denials.add("cart_revalidation_failed");
  }

  if (!deps.commerceEnabled) denials.add("commerce_disabled");
  if (deps.atomicCapabilityReady !== true) denials.add("capability_disabled");
  if (cart.lines.length === 0) denials.add("cart_empty");
  if (!cart.checkoutReady) {
    denials.add("cart_revalidation_failed");
    denials.addAll(cart.blockingReasons);
  }
  for (const line of cart.lines) {
    if (
      !Number.isSafeInteger(line.quantity) ||
      line.quantity <= 0 ||
      !validSafeMoney(line.unitPriceCents) ||
      !validSafeMoney(line.lineTotalCents) ||
      line.lineTotalCents !== line.unitPriceCents * line.quantity
    ) {
      denials.add(line.blockedReason ?? "unconfirmed_supplier_facts");
    }
  }

  const request = normalizedRequestBinding(req);
  if (!request) denials.add("address_invalid");
  const required = Array.from(new Set([...deps.acceptedAgreementKeys, ...cart.requiredAgreements]));
  const presented = new Set(request?.acceptedAgreementKeys ?? []);
  if (required.some((key) => !presented.has(key))) denials.add("agreement_required");

  const serviceable = new Set(deps.serviceableStates.map((state) => state.toUpperCase()));
  if (!request || !serviceable.has(request.shippingAddress.state)) denials.add("state_not_serviceable");

  let quote: ShippingQuote | null = null;
  if (request) {
    const result = await deps.shipping.quote({
      destination: request.shippingAddress,
      service: request.shippingService,
      weightGrams: deps.packageWeightGrams ?? DEFAULT_PACKAGE_WEIGHT_GRAMS,
      temperatureControlled: request.shippingService === "temperature_controlled",
    });
    if (result.ok) quote = result.value;
    else denials.add("shipping_unavailable");
  } else {
    denials.add("shipping_unavailable");
  }

  // Provider capability is learned from the already-resolved adapter, not by
  // making a remote status request before the durable command exists.
  if (deps.payment.name === "disabled") denials.add("payment_disabled");

  let totals: CheckoutSagaCommand["totals"] | null = null;
  let reviewTriggers: LargeOrderTrigger[] = [];
  if (quote) {
    const shippingCents = orderShippingTotalCents([quote]);
    const subtotalCents = cart.subtotalCents;
    const storeCreditAppliedCents = cart.storeCreditAppliedCents;
    if (
      !validSafeMoney(subtotalCents) ||
      !validSafeMoney(shippingCents) ||
      !validSafeMoney(storeCreditAppliedCents) ||
      storeCreditAppliedCents > subtotalCents + shippingCents ||
      request?.applyStoreCreditCents !== storeCreditAppliedCents
    ) {
      denials.add("cart_revalidation_failed");
    } else {
      const totalCents = subtotalCents + shippingCents - storeCreditAppliedCents;
      // A zero-dollar workflow needs its own explicit authority. It must not be
      // disguised as a captured provider payment.
      if (totalCents <= 0) denials.add("payment_disabled");
      totals = { currency: "usd", subtotalCents, shippingCents, storeCreditAppliedCents, totalCents };
      reviewTriggers = evaluateLargeOrderReview({
        totalCents: subtotalCents + shippingCents,
        maxUnitQuantity: cart.lines.reduce((max, line) => Math.max(max, line.quantity), 0),
        fraudFlagged: deps.isFraudFlagged?.(memberId) ?? false,
        unusualQuantityThreshold: deps.unusualQuantityThreshold,
      }).triggers;
      // Admin review/capture still uses the legacy split writer. Until that
      // lifecycle is moved onto this saga, refuse before reserving or charging.
      if (reviewTriggers.length > 0) denials.add("large_order_review_required");
    }
  }

  if (!validPaymentMethodReference(req.paymentMethodReference) && (totals?.totalCents ?? 1) > 0) {
    denials.add("payment_method_required");
  }

  return { denials, cart, quote, request, reviewTriggers, totals };
}

function activationDenials(code: Exclude<CheckoutActivationPrechargePortResult, { ok: true }>["code"]): CommerceDenialCode[] {
  switch (code) {
    case "authority_unavailable":
      return ["capability_disabled"];
    case "activation_not_live":
      return ["product_not_purchasable"];
    case "cart_empty":
      return ["cart_empty"];
    case "cart_conflict":
      return ["cart_revalidation_failed"];
  }
}

function storeDenials(code: CheckoutSagaStoreCode): CommerceDenialCode[] {
  switch (code) {
    case "capability_unavailable":
      return ["capability_disabled"];
    case "idempotency_conflict":
      return ["idempotency_conflict"];
    case "inventory_unavailable":
      return ["insufficient_stock"];
    case "activation_unavailable":
      return ["product_not_purchasable"];
    case "credit_unavailable":
      return ["cart_revalidation_failed"];
    case "not_found":
    case "command_invalid":
    case "state_conflict":
      return ["order_state_invalid"];
  }
}

function failed(
  denials: CommerceDenialCode[],
  extras: Partial<Extract<CheckoutOutcome, { ok: false }>> = {},
): CheckoutOutcome {
  return { ok: false, denials, ...extras };
}

function pending(snapshot: CheckoutSagaSnapshot, phase: CheckoutReconciliationPhase): CheckoutOutcome {
  return failed(["checkout_reconciliation_pending"], {
    retryable: true,
    reconciliation: { commandId: snapshot.command.commandId, phase },
  });
}

function requestMatchesCommand(req: CheckoutRequest, command: CheckoutSagaCommand): boolean {
  const normalized = normalizedRequestBinding(req);
  return normalized !== null && canonicalCheckoutJson(normalized) === canonicalCheckoutJson(command.request);
}

function commandFrom(
  memberId: string,
  req: CheckoutRequest,
  evaluation: CheckoutEvaluation,
  activation: CheckoutActivationPrechargeEvidence,
): CheckoutSagaCommand {
  const commandId = deterministicUuid("command", memberId, req.idempotencyKey);
  const orderId = deterministicUuid("order", memberId, req.idempotencyKey);
  return {
    protocol: CHECKOUT_SAGA_PROTOCOL,
    commandId,
    orderId,
    memberId,
    checkoutIdempotencyKey: req.idempotencyKey,
    checkoutIdempotencyKeyHash: checkoutSha256(["checkout-key", memberId, req.idempotencyKey]),
    providerAuthorizationKey: providerCommandKey("authorize", commandId),
    providerCaptureKey: providerCommandKey("capture", commandId),
    providerCancellationKey: providerCommandKey("cancel", commandId),
    // The durable activation authority owns the checkout snapshot instant.
    // Using it (rather than each process's local retry clock) makes two racing
    // instances build the same immutable command for the same idempotency key.
    placedAt: activation.authorizedAt,
    request: evaluation.request!,
    activation: cloneActivation(activation),
    cart: cloneCart(evaluation.cart),
    shippingQuote: {
      ...evaluation.quote!,
      estimatedDeliveryRange: evaluation.quote!.estimatedDeliveryRange
        ? { ...evaluation.quote!.estimatedDeliveryRange }
        : null,
    },
    totals: { ...evaluation.totals! },
    reviewTriggers: [...evaluation.reviewTriggers],
  };
}

function validAuthorization(
  snapshot: CheckoutSagaSnapshot,
  providerReference: string,
  amountCents: number,
  currency: string,
  captureDeferred: boolean,
): boolean {
  return (
    Boolean(providerReference) &&
    amountCents === snapshot.command.totals.totalCents &&
    currency === snapshot.command.totals.currency &&
    captureDeferred &&
    snapshot.command.totals.totalCents > 0
  );
}

async function storeMutation(
  mutation: Promise<CheckoutSagaMutationResult>,
): Promise<CheckoutSagaSnapshot | CheckoutOutcome> {
  const result = await mutation;
  if (!result.ok) return failed(storeDenials(result.code), { reservationRefusals: result.reservationRefusals });
  return result.snapshot;
}

// ---------------------------------------------------------------------------
// Service and recovery driver
// ---------------------------------------------------------------------------

export function createAtomicCheckoutService(deps: AtomicCheckoutDeps): CheckoutService {
  async function validate(memberId: string, req: CheckoutRequest, asOf: Date) {
    const result = await evaluate(deps, memberId, req, asOf);
    return { ok: result.denials.empty, denials: result.denials.list };
  }

  async function reconcileCancellation(snapshot: CheckoutSagaSnapshot, asOf: Date): Promise<CheckoutOutcome> {
    const reference = snapshot.providerReference;
    if (!reference) {
      const compensated = await storeMutation(
        deps.saga.compensate({
          commandId: snapshot.command.commandId,
          at: asOf.toISOString(),
          reason: "authorization_rejected",
        }),
      );
      return "ok" in compensated ? compensated : failed(["payment_failed"]);
    }

    const cancelled = await deps.payment.cancelAuthorization(
      reference,
      snapshot.command.providerCancellationKey,
    );
    if (cancelled.ok) {
      const compensated = await storeMutation(
        deps.saga.compensate({
          commandId: snapshot.command.commandId,
          at: asOf.toISOString(),
          reason: "authorization_cancelled",
        }),
      );
      return "ok" in compensated ? compensated : failed(["payment_failed"]);
    }

    // A rejected cancellation may mean capture won the race. Ask the provider;
    // only an explicit captured fact can publish the order.
    if (cancelled.code === "REJECTED") {
      const status = await deps.payment.retrieveStatus(reference);
      if (
        status.ok &&
        status.value.status === "captured" &&
        status.value.currency === snapshot.command.totals.currency &&
        status.value.capturedAmountCents === snapshot.command.totals.totalCents
      ) {
        const completed = await storeMutation(
          deps.saga.completeCaptured({
            commandId: snapshot.command.commandId,
            providerReference: reference,
            capturedAmountCents: snapshot.command.totals.totalCents,
            at: asOf.toISOString(),
          }),
        );
        if ("ok" in completed) return completed;
        if (completed.order) return { ok: true, order: completed.order, idempotent: true };
        return failed(["order_state_invalid"]);
      }
      if (status.ok && status.value.status === "cancelled") {
        const compensated = await storeMutation(
          deps.saga.compensate({
            commandId: snapshot.command.commandId,
            at: asOf.toISOString(),
            reason: "authorization_cancelled",
          }),
        );
        return "ok" in compensated ? compensated : failed(["payment_failed"]);
      }
    }

    const marked = await storeMutation(
      deps.saga.markReconciliation({
        commandId: snapshot.command.commandId,
        phase: "cancellation",
        providerReference: reference,
        providerCode: cancelled.code,
        at: asOf.toISOString(),
      }),
    );
    return "ok" in marked ? marked : pending(marked, "cancellation");
  }

  async function drive(initial: CheckoutSagaSnapshot, asOf: Date, replay: boolean): Promise<CheckoutOutcome> {
    let snapshot = initial;
    for (let step = 0; step < 8; step += 1) {
      if (snapshot.state === "completed") {
        return snapshot.order
          ? { ok: true, order: snapshot.order, idempotent: replay }
          : failed(["order_state_invalid"]);
      }
      if (snapshot.state === "rejected") return failed(["payment_failed"]);
      if (
        snapshot.state === "cancellation_pending" ||
        snapshot.state === "cancellation_reconciliation_pending"
      ) {
        return reconcileCancellation(snapshot, asOf);
      }

      if (
        snapshot.state === "authorization_pending" ||
        snapshot.state === "authorization_reconciliation_pending"
      ) {
        const auth = await deps.payment.createAuthorization({
          amountCents: snapshot.command.totals.totalCents,
          currency: snapshot.command.totals.currency,
          orderId: snapshot.command.orderId,
          memberId: snapshot.command.memberId,
          idempotencyKey: snapshot.command.providerAuthorizationKey,
          paymentMethodReference: snapshot.command.request.paymentMethodReference,
        });
        if (!auth.ok) {
          if (auth.retryable || (auth.code === "PERMANENT_FAILURE" && !auth.providerReference)) {
            const marked = await storeMutation(
              deps.saga.markReconciliation({
                commandId: snapshot.command.commandId,
                phase: "authorization",
                providerReference: auth.providerReference ?? null,
                providerCode: auth.code,
                at: asOf.toISOString(),
              }),
            );
            return "ok" in marked ? marked : pending(marked, "authorization");
          }
          if (auth.providerReference) {
            const marked = await storeMutation(
              deps.saga.markCancellationPending({
                commandId: snapshot.command.commandId,
                providerReference: auth.providerReference,
                at: asOf.toISOString(),
              }),
            );
            if ("ok" in marked) return marked;
            return reconcileCancellation(marked, asOf);
          }
          const compensated = await storeMutation(
            deps.saga.compensate({
              commandId: snapshot.command.commandId,
              at: asOf.toISOString(),
              reason: "authorization_rejected",
            }),
          );
          return "ok" in compensated ? compensated : failed(["payment_failed"]);
        }
        if (
          !validAuthorization(
            snapshot,
            auth.value.providerReference,
            auth.value.amountCents,
            auth.value.currency,
            auth.value.captureDeferred,
          )
        ) {
          const marked = await storeMutation(
            deps.saga.markReconciliation({
              commandId: snapshot.command.commandId,
              phase: "authorization",
              providerReference: auth.value.providerReference,
              providerCode: "PERMANENT_FAILURE",
              at: asOf.toISOString(),
            }),
          );
          return "ok" in marked ? marked : pending(marked, "authorization");
        }
        const recorded = await storeMutation(
          deps.saga.recordAuthorization({
            commandId: snapshot.command.commandId,
            providerReference: auth.value.providerReference,
            authorizedAmountCents: auth.value.amountCents,
            at: asOf.toISOString(),
          }),
        );
        if ("ok" in recorded) return recorded;
        snapshot = recorded;
        continue;
      }

      if (snapshot.state === "capture_pending" || snapshot.state === "capture_reconciliation_pending") {
        const reference = snapshot.providerReference;
        if (!reference) return failed(["order_state_invalid"]);
        const capture = await deps.payment.captureAuthorization(
          reference,
          snapshot.command.totals.totalCents,
          snapshot.command.providerCaptureKey,
        );
        if (!capture.ok) {
          if (capture.retryable || capture.code === "PERMANENT_FAILURE") {
            const marked = await storeMutation(
              deps.saga.markReconciliation({
                commandId: snapshot.command.commandId,
                phase: "capture",
                providerReference: reference,
                providerCode: capture.code,
                at: asOf.toISOString(),
              }),
            );
            return "ok" in marked ? marked : pending(marked, "capture");
          }
          const cancelling = await storeMutation(
            deps.saga.markCancellationPending({
              commandId: snapshot.command.commandId,
              providerReference: reference,
              at: asOf.toISOString(),
            }),
          );
          if ("ok" in cancelling) return cancelling;
          return reconcileCancellation(cancelling, asOf);
        }
        if (
          capture.value.providerReference !== reference ||
          capture.value.capturedAmountCents !== snapshot.command.totals.totalCents ||
          capture.value.currency !== snapshot.command.totals.currency
        ) {
          const marked = await storeMutation(
            deps.saga.markReconciliation({
              commandId: snapshot.command.commandId,
              phase: "capture",
              providerReference: reference,
              providerCode: "PERMANENT_FAILURE",
              at: asOf.toISOString(),
            }),
          );
          return "ok" in marked ? marked : pending(marked, "capture");
        }
        const completed = await storeMutation(
          deps.saga.completeCaptured({
            commandId: snapshot.command.commandId,
            providerReference: reference,
            capturedAmountCents: capture.value.capturedAmountCents,
            at: asOf.toISOString(),
          }),
        );
        if ("ok" in completed) return completed;
        if (!completed.order) return failed(["order_state_invalid"]);
        return { ok: true, order: completed.order, idempotent: replay };
      }
    }
    return pending(snapshot, snapshot.lastReconciliationPhase ?? "authorization");
  }

  async function submit(memberId: string, req: CheckoutRequest, asOf: Date): Promise<CheckoutOutcome> {
    if (
      !req ||
      typeof req.idempotencyKey !== "string" ||
      !/^[A-Za-z0-9:_-]{1,200}$/.test(req.idempotencyKey)
    ) {
      return failed(["idempotency_conflict"]);
    }
    const keyHash = checkoutSha256(["checkout-key", memberId, req.idempotencyKey]);
    const existing = await deps.saga.find(memberId, keyHash);
    if (!existing.ok) return failed(["capability_disabled"]);
    if (existing.snapshot) {
      if (!requestMatchesCommand(req, existing.snapshot.command)) {
        return failed(["idempotency_conflict"]);
      }
      return drive(existing.snapshot, asOf, true);
    }

    const evaluated = await evaluate(deps, memberId, req, asOf);
    if (!evaluated.denials.empty || !evaluated.quote || !evaluated.request || !evaluated.totals) {
      return failed(evaluated.denials.list);
    }

    const precharge = await deps.activation.authorize({
      memberId,
      checkoutIdempotencyKey: req.idempotencyKey,
      evaluatedAt: asOf.toISOString(),
      leaseTtlSeconds: deps.activationLeaseTtlSeconds ?? DEFAULT_ACTIVATION_PRECHARGE_TTL_SECONDS,
    });
    if (!precharge.ok) return failed(activationDenials(precharge.code));
    if (!activationMatchesCart(precharge.authorization, evaluated.cart, asOf)) {
      return failed(["product_not_purchasable", "cart_revalidation_failed"]);
    }

    const command = commandFrom(memberId, req, evaluated, precharge.authorization);
    const begun = await deps.saga.begin(command);
    if (!begun.ok) {
      return failed(storeDenials(begun.code), { reservationRefusals: begun.reservationRefusals });
    }
    return drive(begun.snapshot, asOf, begun.idempotent);
  }

  return { validate, submit };
}

// ---------------------------------------------------------------------------
// In-memory reference store. It is linearizable across service instances and
// models the transaction state machine for crash/concurrency attacks. Optional
// effects are test composition adapters only; production uses the SQL RPC.
// ---------------------------------------------------------------------------

export interface InMemoryCheckoutSagaEffects {
  reserve?(command: CheckoutSagaCommand): Promise<
    | { ok: true; reservationIds: string[] }
    | { ok: false; refusals: ReservationRefusalCode[] }
  >;
  /**
   * Authoritative spendable balance for the test transaction. When a command
   * requests credit and this capability is absent, begin fails closed.
   */
  storeCreditBalanceCents?(memberId: string, at: Date): Promise<number>;
  complete?(command: CheckoutSagaCommand, reservationIds: readonly string[], order: CheckoutOrder): Promise<void>;
  compensate?(command: CheckoutSagaCommand, reservationIds: readonly string[]): Promise<void>;
}

export interface InMemoryCheckoutSagaControl {
  store: CheckoutSagaStore;
  inspect(commandId: string): Promise<CheckoutSagaSnapshot | null>;
  setCrashPoint(point: "record_authorization" | "mark_reconciliation" | "complete" | "compensate" | null): void;
}

function serialQueue(): <T>(work: () => Promise<T>) => Promise<T> {
  let tail: Promise<void> = Promise.resolve();
  return async <T>(work: () => Promise<T>): Promise<T> => {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await prior;
    try {
      return await work();
    } finally {
      release();
    }
  };
}

function orderFromSnapshot(snapshot: CheckoutSagaSnapshot): CheckoutOrder {
  const command = snapshot.command;
  return {
    orderId: command.orderId,
    memberId: command.memberId,
    state: "payment_captured",
    placedAt: command.placedAt,
    subtotalCents: command.totals.subtotalCents,
    shippingCents: command.totals.shippingCents,
    storeCreditAppliedCents: command.totals.storeCreditAppliedCents,
    totalCents: command.totals.totalCents,
    lines: command.cart.lines.map((line) => ({ ...line })),
    shipmentGroups: command.cart.shipmentGroups.map((group) => ({ ...group, skus: [...group.skus] })),
    paymentReference: snapshot.providerReference,
    captured: true,
    reviewTriggers: [...command.reviewTriggers],
    idempotencyKey: command.checkoutIdempotencyKey,
    reservationIds: [...snapshot.reservationIds],
  };
}

export function checkoutOrderRecord(order: CheckoutOrder, at: string): OrderRecord {
  return {
    orderId: order.orderId,
    memberId: order.memberId,
    state: order.state,
    lines: order.lines.map((line) => ({
      sku: line.sku,
      displayName: line.displayName,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents ?? -1,
    })),
    totals: {
      subtotalCents: order.subtotalCents,
      shippingCents: order.shippingCents,
      storeCreditAppliedCents: order.storeCreditAppliedCents,
      totalCents: order.totalCents,
    },
    providerReference: order.paymentReference,
    authorizedAmountCents: order.totalCents,
    capturedAmountCents: order.totalCents,
    checkoutIdempotencyKey: order.idempotencyKey,
    lastIdempotencyKey: order.idempotencyKey,
    reviewTriggers: [...order.reviewTriggers],
    createdAt: order.placedAt,
    updatedAt: at,
    shipments: order.shipmentGroups.map((group) => ({
      owner: group.owner,
      status: "pending",
      trackingNumber: null,
      carrier: null,
    })),
  };
}

export function createInMemoryCheckoutSagaControl(
  effects: InMemoryCheckoutSagaEffects = {},
): InMemoryCheckoutSagaControl {
  const serialize = serialQueue();
  const byScope = new Map<string, CheckoutSagaSnapshot>();
  const byCommand = new Map<string, CheckoutSagaSnapshot>();
  let crashPoint: "record_authorization" | "mark_reconciliation" | "complete" | "compensate" | null = null;

  const scope = (memberId: string, keyHash: string) => `${memberId.length}:${memberId}:${keyHash}`;
  const response = (snapshot: CheckoutSagaSnapshot, idempotent: boolean): CheckoutSagaMutationResult => ({
    ok: true,
    snapshot: cloneSnapshot(snapshot),
    idempotent,
  });
  const crash = (point: NonNullable<typeof crashPoint>) => {
    if (crashPoint === point) {
      crashPoint = null;
      throw new Error(`simulated checkout saga crash at ${point}`);
    }
  };

  const store: CheckoutSagaStore = {
    find: (memberId, keyHash) =>
      serialize(async () => ({
        ok: true as const,
        snapshot: byScope.has(scope(memberId, keyHash))
          ? cloneSnapshot(byScope.get(scope(memberId, keyHash))!)
          : null,
      })),

    begin: (command) =>
      serialize(async () => {
        const key = scope(command.memberId, command.checkoutIdempotencyKeyHash);
        const existing = byScope.get(key);
        if (existing) {
          return canonicalCheckoutJson(existing.command) === canonicalCheckoutJson(command)
            ? response(existing, true)
            : ({ ok: false as const, code: "idempotency_conflict" as const });
        }
        if (byCommand.has(command.commandId)) return { ok: false as const, code: "idempotency_conflict" as const };
        if (command.totals.storeCreditAppliedCents > 0) {
          if (!effects.storeCreditBalanceCents) {
            return { ok: false as const, code: "credit_unavailable" as const };
          }
          const balance = await effects.storeCreditBalanceCents(
            command.memberId,
            new Date(command.placedAt),
          );
          const activeHolds = Array.from(byCommand.values())
            .filter((value) =>
              value.command.memberId === command.memberId &&
              value.state !== "completed" &&
              value.state !== "rejected"
            )
            .reduce((sum, value) => sum + value.command.totals.storeCreditAppliedCents, 0);
          if (
            !Number.isSafeInteger(balance) ||
            balance < 0 ||
            balance - activeHolds < command.totals.storeCreditAppliedCents
          ) {
            return { ok: false as const, code: "credit_unavailable" as const };
          }
        }
        const reserved = effects.reserve
          ? await effects.reserve(cloneCommand(command))
          : { ok: true as const, reservationIds: command.cart.lines.map((line, index) => `rsv_${command.commandId}_${index}_${line.sku}`) };
        if (!reserved.ok) {
          return {
            ok: false as const,
            code: "inventory_unavailable" as const,
            reservationRefusals: [...reserved.refusals],
          };
        }
        const snapshot: CheckoutSagaSnapshot = {
          command: cloneCommand(command),
          commandDigest: `sha256:${checkoutSha256(command)}`,
          state: "authorization_pending",
          reservationIds: [...reserved.reservationIds],
          providerReference: null,
          authorizedAmountCents: null,
          capturedAmountCents: null,
          order: null,
          lastReconciliationPhase: null,
        };
        byScope.set(key, snapshot);
        byCommand.set(command.commandId, snapshot);
        return response(snapshot, false);
      }),

    recordAuthorization: (input) =>
      serialize(async () => {
        const current = byCommand.get(input.commandId);
        if (!current) return { ok: false as const, code: "not_found" as const };
        if (
          current.state === "capture_pending" ||
          current.state === "capture_reconciliation_pending" ||
          current.state === "completed"
        ) {
          if (
            current.providerReference === input.providerReference &&
            current.authorizedAmountCents === input.authorizedAmountCents
          ) return response(current, true);
          return { ok: false as const, code: "state_conflict" as const };
        }
        if (
          current.state !== "authorization_pending" &&
          current.state !== "authorization_reconciliation_pending"
        ) return { ok: false as const, code: "state_conflict" as const };
        crash("record_authorization");
        current.providerReference = input.providerReference;
        current.authorizedAmountCents = input.authorizedAmountCents;
        current.state = "capture_pending";
        current.lastReconciliationPhase = null;
        return response(current, false);
      }),

    markReconciliation: (input) =>
      serialize(async () => {
        const current = byCommand.get(input.commandId);
        if (!current) return { ok: false as const, code: "not_found" as const };
        if (current.state === "completed" || current.state === "rejected") return response(current, true);
        crash("mark_reconciliation");
        if (input.providerReference) {
          if (current.providerReference && current.providerReference !== input.providerReference) {
            return { ok: false as const, code: "state_conflict" as const };
          }
          current.providerReference = input.providerReference;
        }
        current.state = `${input.phase}_reconciliation_pending` as CheckoutSagaState;
        current.lastReconciliationPhase = input.phase;
        return response(current, false);
      }),

    markCancellationPending: (input) =>
      serialize(async () => {
        const current = byCommand.get(input.commandId);
        if (!current) return { ok: false as const, code: "not_found" as const };
        if (current.state === "completed" || current.state === "rejected") return response(current, true);
        if (current.providerReference && current.providerReference !== input.providerReference) {
          return { ok: false as const, code: "state_conflict" as const };
        }
        current.providerReference = input.providerReference;
        current.state = "cancellation_pending";
        current.lastReconciliationPhase = "cancellation";
        return response(current, false);
      }),

    completeCaptured: (input) =>
      serialize(async () => {
        const current = byCommand.get(input.commandId);
        if (!current) return { ok: false as const, code: "not_found" as const };
        if (current.state === "completed") return response(current, true);
        if (
          !["capture_pending", "capture_reconciliation_pending", "cancellation_pending", "cancellation_reconciliation_pending"].includes(current.state) ||
          current.providerReference !== input.providerReference ||
          ((current.state === "capture_pending" || current.state === "capture_reconciliation_pending") &&
            current.authorizedAmountCents !== input.capturedAmountCents) ||
          ((current.state === "cancellation_pending" || current.state === "cancellation_reconciliation_pending") &&
            current.authorizedAmountCents !== null &&
            current.authorizedAmountCents !== input.capturedAmountCents) ||
          current.command.totals.totalCents !== input.capturedAmountCents
        ) return { ok: false as const, code: "state_conflict" as const };
        crash("complete");
        const order = orderFromSnapshot(current);
        await effects.complete?.(cloneCommand(current.command), [...current.reservationIds], cloneOrder(order)!);
        current.authorizedAmountCents ??= input.capturedAmountCents;
        current.capturedAmountCents = input.capturedAmountCents;
        current.order = order;
        current.state = "completed";
        current.lastReconciliationPhase = null;
        return response(current, false);
      }),

    compensate: (input) =>
      serialize(async () => {
        const current = byCommand.get(input.commandId);
        if (!current) return { ok: false as const, code: "not_found" as const };
        if (current.state === "rejected") return response(current, true);
        if (current.state === "completed" || current.capturedAmountCents !== null) {
          return { ok: false as const, code: "state_conflict" as const };
        }
        if (
          current.providerReference !== null &&
          current.state !== "cancellation_pending" &&
          current.state !== "cancellation_reconciliation_pending"
        ) return { ok: false as const, code: "state_conflict" as const };
        crash("compensate");
        await effects.compensate?.(cloneCommand(current.command), [...current.reservationIds]);
        current.state = "rejected";
        current.lastReconciliationPhase = null;
        return response(current, false);
      }),
  };

  return {
    store,
    inspect: (commandId) =>
      serialize(async () => {
        const value = byCommand.get(commandId);
        return value ? cloneSnapshot(value) : null;
      }),
    setCrashPoint(point) {
      crashPoint = point;
    },
  };
}

/** Test-composition helper: mirror the atomic result into existing in-memory ports. */
export function inMemoryCheckoutSagaEffects(input: Readonly<{
  orders?: OrderRepository;
  reserve?: InMemoryCheckoutSagaEffects["reserve"];
  storeCreditBalanceCents?: InMemoryCheckoutSagaEffects["storeCreditBalanceCents"];
  finalizeReservations?: (ids: readonly string[]) => Promise<void>;
  releaseReservations?: (ids: readonly string[]) => Promise<void>;
  spendCredit?: (memberId: string, amountCents: number, orderId: string, at: Date) => Promise<void>;
}>): InMemoryCheckoutSagaEffects {
  return {
    reserve: input.reserve,
    storeCreditBalanceCents: input.storeCreditBalanceCents,
    async complete(command, reservationIds, order) {
      await input.finalizeReservations?.(reservationIds);
      if (command.totals.storeCreditAppliedCents > 0) {
        await input.spendCredit?.(
          command.memberId,
          command.totals.storeCreditAppliedCents,
          command.orderId,
          new Date(command.placedAt),
        );
      }
      await input.orders?.save(checkoutOrderRecord(order, command.placedAt));
    },
    async compensate(_command, reservationIds) {
      await input.releaseReservations?.(reservationIds);
    },
  };
}
