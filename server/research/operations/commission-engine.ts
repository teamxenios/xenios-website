import { createHash } from "node:crypto";
import { roleCan, type OperationsActor } from "./state-machines";

export type CommissionRuleKind =
  | "percentage"
  | "bounty"
  | "new_customer_bonus"
  | "activation_bounty"
  | "campaign_rule"
  | "partner_specific"
  | "sliding_rate";

export interface SlidingRateTier {
  thresholdCents: number;
  rateBps: number;
}

export interface CampaignCommissionRule {
  campaign: string;
  rateBps?: number;
  bountyCents?: number;
}

export interface CommissionPolicy {
  id: string;
  version: string;
  partnerId: string | null;
  enabledRuleKinds: CommissionRuleKind[];
  baseRateBps: number;
  baseBountyCents: number;
  newCustomerBonusCents: number;
  activationBountyCents: number;
  slidingRate: SlidingRateTier[];
  campaigns: CampaignCommissionRule[];
  rateCeilingBps: number;
  ineligibleProductIds: string[];
  holdDays: number;
  effectiveAt: string;
}

export interface CommissionItem {
  productId: string;
  subtotalCents: number;
  discountCents: number;
  refundCents: number;
  chargebackCents: number;
  cancelled: boolean;
  collected: boolean;
  eligible: boolean;
}

export interface CommissionFacts {
  orderId: string;
  attributedPartnerId: string;
  campaign: string | null;
  items: CommissionItem[];
  taxCents: number;
  shippingCents: number;
  isNewCustomer: boolean;
  isActivation: boolean;
}

export interface CommissionCalculation {
  eligibleRevenueCents: number;
  excludedCents: number;
  rateBps: number;
  percentageCents: number;
  bountyCents: number;
  newCustomerBonusCents: number;
  activationBountyCents: number;
  commissionCents: number;
  policyId: string;
  policyVersion: string;
}

function wholeNonNegative(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function validateCommissionPolicy(policy: CommissionPolicy): string[] {
  const errors: string[] = [];
  if (!policy.id.trim() || !policy.version.trim()) errors.push("Policy id and version are required.");
  if (!wholeNonNegative(policy.baseRateBps) || policy.baseRateBps > 10_000) errors.push("Base rate must be 0–10000 bps.");
  if (!wholeNonNegative(policy.rateCeilingBps) || policy.rateCeilingBps > 10_000) errors.push("Rate ceiling must be 0–10000 bps.");
  if (policy.baseRateBps > policy.rateCeilingBps) errors.push("Base rate exceeds the policy ceiling.");
  for (const amount of [policy.baseBountyCents, policy.newCustomerBonusCents, policy.activationBountyCents]) {
    if (!wholeNonNegative(amount)) errors.push("Bounties and bonuses must be whole non-negative cents.");
  }
  if (!Number.isInteger(policy.holdDays) || policy.holdDays < 0 || policy.holdDays > 365) {
    errors.push("Hold days must be an integer from 0 to 365.");
  }
  let lastThreshold = -1;
  for (const tier of policy.slidingRate) {
    if (!wholeNonNegative(tier.thresholdCents) || tier.thresholdCents <= lastThreshold) {
      errors.push("Sliding thresholds must be unique and ascending.");
    }
    if (!wholeNonNegative(tier.rateBps) || tier.rateBps > policy.rateCeilingBps) {
      errors.push("Sliding rates must stay within the policy ceiling.");
    }
    lastThreshold = tier.thresholdCents;
  }
  for (const campaign of policy.campaigns) {
    if (!campaign.campaign.trim()) errors.push("Campaign names are required.");
    if (campaign.rateBps !== undefined && (!wholeNonNegative(campaign.rateBps) || campaign.rateBps > policy.rateCeilingBps)) {
      errors.push("Campaign rates must stay within the policy ceiling.");
    }
    if (campaign.bountyCents !== undefined && !wholeNonNegative(campaign.bountyCents)) {
      errors.push("Campaign bounties must be whole non-negative cents.");
    }
  }
  if (Number.isNaN(Date.parse(policy.effectiveAt))) errors.push("Policy effective date is invalid.");
  return Array.from(new Set(errors));
}

function policyHas(policy: CommissionPolicy, kind: CommissionRuleKind): boolean {
  return policy.enabledRuleKinds.includes(kind);
}

/**
 * Calculates from collected eligible item revenue only. Tax and shipping are
 * accepted as transaction facts for audit but never enter the basis.
 */
export function calculateCommission(facts: CommissionFacts, policy: CommissionPolicy): CommissionCalculation {
  const policyErrors = validateCommissionPolicy(policy);
  if (policyErrors.length) throw new Error(policyErrors.join(" "));
  const invalidFact = facts.items.some((item) =>
    [item.subtotalCents, item.discountCents, item.refundCents, item.chargebackCents].some(
      (value) => !wholeNonNegative(value),
    ),
  );
  if (invalidFact || !wholeNonNegative(facts.taxCents) || !wholeNonNegative(facts.shippingCents)) {
    throw new Error("Commission facts must use whole non-negative cents.");
  }

  let eligibleRevenueCents = 0;
  let excludedCents = facts.taxCents + facts.shippingCents;
  for (const item of facts.items) {
    const ineligible =
      !item.eligible ||
      !item.collected ||
      item.cancelled ||
      policy.ineligibleProductIds.includes(item.productId);
    if (ineligible) {
      excludedCents += item.subtotalCents;
      continue;
    }
    const net = Math.max(0, item.subtotalCents - item.discountCents - item.refundCents - item.chargebackCents);
    eligibleRevenueCents += net;
    excludedCents += item.discountCents + item.refundCents + item.chargebackCents;
  }

  let rateBps = policyHas(policy, "percentage") || policyHas(policy, "partner_specific") ? policy.baseRateBps : 0;
  if (policyHas(policy, "sliding_rate")) {
    for (const tier of policy.slidingRate) {
      if (eligibleRevenueCents >= tier.thresholdCents) rateBps = tier.rateBps;
    }
  }
  let bountyCents = policyHas(policy, "bounty") ? policy.baseBountyCents : 0;
  if (facts.campaign && policyHas(policy, "campaign_rule")) {
    const campaign = policy.campaigns.find((rule) => rule.campaign === facts.campaign);
    if (campaign?.rateBps !== undefined) rateBps = campaign.rateBps;
    if (campaign?.bountyCents !== undefined) bountyCents = campaign.bountyCents;
  }
  rateBps = Math.min(rateBps, policy.rateCeilingBps);
  const percentageCents = Math.floor((eligibleRevenueCents * rateBps) / 10_000);
  const newCustomerBonusCents =
    facts.isNewCustomer && policyHas(policy, "new_customer_bonus") ? policy.newCustomerBonusCents : 0;
  const activationBountyCents =
    facts.isActivation && policyHas(policy, "activation_bounty") ? policy.activationBountyCents : 0;
  return {
    eligibleRevenueCents,
    excludedCents,
    rateBps,
    percentageCents,
    bountyCents,
    newCustomerBonusCents,
    activationBountyCents,
    commissionCents: percentageCents + bountyCents + newCustomerBonusCents + activationBountyCents,
    policyId: policy.id,
    policyVersion: policy.version,
  };
}

export type CommissionLedgerState = "pending" | "approved" | "payable" | "paid" | "reversed";
export type CommissionEventKind = "accrued" | "approved" | "payable" | "paid" | "reversed";

export interface CommissionEvent {
  id: string;
  chainId: string;
  partnerId: string;
  orderId: string;
  kind: CommissionEventKind;
  state: CommissionLedgerState;
  amountCents: number;
  eligibleRevenueCents: number;
  policyId: string;
  policyVersion: string;
  actorId: string;
  actorRole: OperationsActor["role"];
  reason: string | null;
  providerReference: string | null;
  idempotencyKey: string;
  occurredAt: string;
}

export interface PayoutProvider {
  pay(input: { partnerId: string; amountCents: number; batchId: string }): Promise<
    | { ok: true; settled: true; providerReference: string }
    | { ok: true; settled: false; providerReference: string }
    | { ok: false; code: string }
  >;
}

export type CommissionResult<T> =
  | { ok: true; value: T; idempotent: boolean }
  | {
      ok: false;
      code:
        | "forbidden"
        | "policy_invalid"
        | "override_rejected"
        | "attribution_mismatch"
        | "duplicate_order"
        | "not_found"
        | "invalid_state"
        | "invalid_amount"
        | "provider_refused"
        | "provider_unsettled"
        | "idempotency_conflict";
      message: string;
    };

const copy = <T>(value: T): T => structuredClone(value);
const digest = (value: string) => createHash("sha256").update(value).digest("hex");

export class CommissionLedger {
  private readonly events: CommissionEvent[] = [];
  private readonly commands = new Map<string, { fingerprint: string; value: unknown }>();

  constructor(private readonly policies: Map<string, CommissionPolicy>) {}

  list(partnerId?: string): CommissionEvent[] {
    return copy(this.events.filter((event) => !partnerId || event.partnerId === partnerId));
  }

  accrue(input: {
    partnerId: string;
    attributionPartnerId: string;
    facts: CommissionFacts;
    requestedRateBps?: unknown;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CommissionResult<CommissionEvent> {
    const fp = digest(JSON.stringify({ action: "accrue", ...input, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CommissionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (input.actor.role !== "system") return this.failure("forbidden", "Only the server may accrue commission.");
    if (input.requestedRateBps !== undefined) return this.failure("override_rejected", "Client commission overrides are not accepted.");
    if (input.partnerId !== input.attributionPartnerId || input.facts.attributedPartnerId !== input.partnerId) {
      return this.failure("attribution_mismatch", "Commission partner must match the immutable attribution winner.");
    }
    if (this.events.some((event) => event.orderId === input.facts.orderId && event.kind === "accrued")) {
      return this.failure("duplicate_order", "That order already has a commission chain.");
    }
    const policy = this.policies.get(input.partnerId) ?? this.policies.get("*");
    if (!policy) return this.failure("policy_invalid", "No server-side commission policy is configured.");
    const errors = validateCommissionPolicy(policy);
    if (errors.length) return this.failure("policy_invalid", errors.join(" "));
    const calculation = calculateCommission(input.facts, policy);
    const event = this.event({
      chainId: `commission_${digest(`${input.partnerId}:${input.facts.orderId}`).slice(0, 20)}`,
      partnerId: input.partnerId,
      orderId: input.facts.orderId,
      kind: "accrued",
      state: "pending",
      amountCents: calculation.commissionCents,
      eligibleRevenueCents: calculation.eligibleRevenueCents,
      policyId: calculation.policyId,
      policyVersion: calculation.policyVersion,
      actor: input.actor,
      reason: null,
      providerReference: null,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    });
    this.events.push(event);
    return this.store(input.idempotencyKey, fp, event);
  }

  transition(input: {
    chainId: string;
    to: "approved" | "payable";
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CommissionResult<CommissionEvent> {
    const fp = digest(JSON.stringify({ action: "transition", ...input, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CommissionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "commissions:manage")) return this.failure("forbidden", "This role cannot manage commission.");
    const latest = this.latest(input.chainId);
    if (!latest) return this.failure("not_found", "Commission chain not found.");
    const allowed = (latest.state === "pending" && input.to === "approved") || (latest.state === "approved" && input.to === "payable");
    if (!allowed) return this.failure("invalid_state", `Cannot move ${latest.state} to ${input.to}.`);
    const event = this.event({
      ...latest,
      kind: input.to,
      state: input.to,
      actor: input.actor,
      reason: null,
      providerReference: null,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    });
    this.events.push(event);
    return this.store(input.idempotencyKey, fp, event);
  }

  async pay(input: {
    chainId: string;
    batchId: string;
    actor: OperationsActor;
    provider: PayoutProvider;
    idempotencyKey: string;
    occurredAt: Date;
  }): Promise<CommissionResult<CommissionEvent>> {
    const fp = digest(JSON.stringify({ action: "pay", ...input, provider: undefined, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CommissionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!roleCan(input.actor.role, "payouts:manage")) return this.failure("forbidden", "This role cannot execute payouts.");
    const latest = this.latest(input.chainId);
    if (!latest) return this.failure("not_found", "Commission chain not found.");
    if (latest.state !== "payable") return this.failure("invalid_state", "Only payable commission can be paid.");
    const result = await input.provider.pay({
      partnerId: latest.partnerId,
      amountCents: latest.amountCents,
      batchId: input.batchId,
    });
    if (!result.ok) return this.failure("provider_refused", result.code);
    if (!result.settled) return this.failure("provider_unsettled", "The payout provider has not settled this batch.");
    if (!result.providerReference.trim()) return this.failure("provider_refused", "Payout proof is missing.");
    const event = this.event({
      ...latest,
      kind: "paid",
      state: "paid",
      actor: input.actor,
      reason: null,
      providerReference: result.providerReference,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    });
    this.events.push(event);
    return this.store(input.idempotencyKey, fp, event);
  }

  reverse(input: {
    chainId: string;
    reason: "refund" | "chargeback";
    revenueReversedCents: number;
    actor: OperationsActor;
    idempotencyKey: string;
    occurredAt: Date;
  }): CommissionResult<CommissionEvent> {
    const fp = digest(JSON.stringify({ action: "reverse", ...input, occurredAt: input.occurredAt.toISOString() }));
    const replay = this.replay<CommissionEvent>(input.idempotencyKey, fp);
    if (replay) return replay;
    if (!["system", "admin", "operations_manager"].includes(input.actor.role)) {
      return this.failure("forbidden", "This role cannot reverse commission.");
    }
    if (!Number.isInteger(input.revenueReversedCents) || input.revenueReversedCents <= 0) {
      return this.failure("invalid_amount", "Reversed revenue must be positive whole cents.");
    }
    const latest = this.latest(input.chainId);
    if (!latest) return this.failure("not_found", "Commission chain not found.");
    if (latest.state === "reversed") return this.failure("invalid_state", "Commission is already reversed.");
    const ratio = latest.eligibleRevenueCents === 0 ? 1 : Math.min(1, input.revenueReversedCents / latest.eligibleRevenueCents);
    const amount = Math.min(latest.amountCents, Math.ceil(latest.amountCents * ratio));
    const event = this.event({
      ...latest,
      kind: "reversed",
      state: "reversed",
      amountCents: -amount,
      actor: input.actor,
      reason: input.reason,
      providerReference: null,
      idempotencyKey: input.idempotencyKey,
      occurredAt: input.occurredAt,
    });
    this.events.push(event);
    return this.store(input.idempotencyKey, fp, event);
  }

  balance(partnerId: string): { pending: number; approved: number; payable: number; paid: number; reversed: number } {
    const result = { pending: 0, approved: 0, payable: 0, paid: 0, reversed: 0 };
    const chains = new Set(this.events.filter((event) => event.partnerId === partnerId).map((event) => event.chainId));
    for (const chainId of Array.from(chains)) {
      const latest = this.latest(chainId)!;
      if (latest.state === "reversed") {
        result.reversed += Math.abs(latest.amountCents);
      } else {
        result[latest.state] += latest.amountCents;
      }
    }
    return result;
  }

  private latest(chainId: string): CommissionEvent | null {
    const chain = this.events.filter((event) => event.chainId === chainId);
    return chain.length ? chain[chain.length - 1] : null;
  }

  private event(input: Omit<CommissionEvent, "id" | "actorId" | "actorRole" | "occurredAt"> & {
    actor: OperationsActor;
    occurredAt: Date;
  }): CommissionEvent {
    const { actor, occurredAt, ...event } = input;
    return {
      ...event,
      id: `commission_evt_${digest(`${event.chainId}:${event.idempotencyKey}`).slice(0, 20)}`,
      actorId: actor.id,
      actorRole: actor.role,
      occurredAt: occurredAt.toISOString(),
    };
  }

  private replay<T>(key: string, fp: string): CommissionResult<T> | null {
    const prior = this.commands.get(key);
    if (!prior) return null;
    if (prior.fingerprint !== fp) return this.failure("idempotency_conflict", "That key belongs to another commission command.");
    return { ok: true, value: copy(prior.value as T), idempotent: true };
  }

  private store<T>(key: string, fp: string, value: T): CommissionResult<T> {
    this.commands.set(key, { fingerprint: fp, value: copy(value) });
    return { ok: true, value: copy(value), idempotent: false };
  }

  private failure(
    code: Extract<CommissionResult<never>, { ok: false }>["code"],
    message: string,
  ): CommissionResult<never> {
    return { ok: false, code, message };
  }
}

export interface LawrencePartnerModel {
  partnerId: string;
  customCode: string;
  customLinks: string[];
  campaigns: string[];
  revenueThresholds: SlidingRateTier[];
  rateCeilingBps: number;
  bountyCents: number;
  milestoneRules: Array<{ revenueCents: number; rewardCents: number }>;
  optionalRetainerCents: number | null;
  holdDays: number;
  payoutSchedule: string;
  cohortRetentionWindowDays: number;
  cohortContributionWindowDays: number;
  reviewDate: string;
  agreementVersion: string;
}

export function validateLawrenceModel(model: LawrencePartnerModel): string[] {
  const errors: string[] = [];
  if (!model.partnerId.trim() || !model.customCode.trim() || !model.agreementVersion.trim()) {
    errors.push("Partner, custom code, and agreement version are required.");
  }
  if (!wholeNonNegative(model.rateCeilingBps) || model.rateCeilingBps > 10_000) errors.push("Rate ceiling is invalid.");
  if (!wholeNonNegative(model.bountyCents)) errors.push("Bounty must use whole non-negative cents.");
  if (model.optionalRetainerCents !== null && !wholeNonNegative(model.optionalRetainerCents)) {
    errors.push("Optional retainer must use whole non-negative cents.");
  }
  if (!Number.isInteger(model.holdDays) || model.holdDays < 0) errors.push("Hold days are invalid.");
  if (Number.isNaN(Date.parse(model.reviewDate))) errors.push("Review date is invalid.");
  if (model.revenueThresholds.some((tier) => tier.rateBps > model.rateCeilingBps)) {
    errors.push("A threshold rate exceeds the editable ceiling.");
  }
  return Array.from(new Set(errors));
}
