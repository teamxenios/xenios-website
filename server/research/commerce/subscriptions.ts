// xenios research: the product-subscription service. Lifecycle, member actions,
// and the renewal gate.
//
// Three rules shape this file.
//
// First, every state change goes through `applySubscriptionAction`, the shared
// allowed-transition table, and every applied change appends a state event. The
// event trail is APPEND ONLY: the repository port has no way to update or delete
// history, so a pause, skip, or reschedule is auditable rather than being a quiet
// overwrite of the schedule columns.
//
// Second, ownership is checked on read. The member id comes only from the method
// argument, and another member's subscription answers `subscription_not_found`
// rather than existing, so a cross-member action is impossible rather than
// merely unlikely.
//
// Third, a renewal must EARN the right to proceed. `evaluateRenewal` re-runs
// every gate (membership, commerce flag, SKU eligibility, lot allocation, lot
// quality, payment capability, agreements) as of the instant supplied by the
// caller, accumulates every refusal, and never proceeds on any failed gate. A
// subscription that was fine when it was created is refused the moment it stops
// being fine.

import { randomUUID } from "node:crypto";
import {
  evaluatePurchaseEligibility,
  type CatalogProduct,
  type PurchaseBlockReason,
} from "@shared/research/catalog";
import {
  applySubscriptionAction,
  SUBSCRIPTION_FREQUENCIES,
  type Actor,
  type SubscriptionAction,
  type SubscriptionFrequencyDays,
  type SubscriptionState,
} from "@shared/research/commerce";
import type {
  CommerceDenialCode,
  SubscriptionActionRequest,
  SubscriptionDto,
} from "@shared/research/commerce-api";
import { allocateFefo, type InventoryLot, type LotEvaluation } from "../inventory/lots";
import type { PaymentProvider } from "../providers/payment";

// ---------------------------------------------------------------------------
// Records
// ---------------------------------------------------------------------------

/** Matches the database bound (migration 23) and the cart's per-line ceiling. */
export const MAX_SUBSCRIPTION_QUANTITY = 1000;

/**
 * The stored subscription. Wider than the wire DTO on purpose: the payment
 * reference, the price version, and the shipping address reference are operator
 * data that must never be serialized to a member by a route that spreads this
 * object. Serialization goes through `toDto` by explicit construction.
 */
export interface SubscriptionRecord {
  subscriptionId: string;
  memberId: string;
  sku: string;
  quantity: number;
  frequencyDays: SubscriptionFrequencyDays;
  state: SubscriptionState;
  /** ISO instant of the next renewal charge. Null unless a schedule exists. */
  nextRenewalAt: string | null;
  nextShipmentAt: string | null;
  /** The provider's stored payment method reference. Never card data. */
  paymentProviderReference: string | null;
  /** Which published price the member agreed to, so a price change is explicit. */
  priceVersion: string;
  /** Opaque reference to a stored shipping address. Never the address itself. */
  shippingAddressRef: string | null;
  createdAt: string;
  updatedAt: string;
  cancelledAt: string | null;
}

/**
 * One appended row per applied state change. History, never current state:
 * there is no update or delete path for an event anywhere in this module.
 */
export interface SubscriptionStateEvent {
  subscriptionId: string;
  action: SubscriptionAction;
  fromState: SubscriptionState;
  toState: SubscriptionState;
  actorType: Actor;
  actorId: string | null;
  /** When the change takes effect (a reschedule target, a pushed renewal). */
  effectiveAt: string | null;
  occurredAt: string;
}

export interface SubscriptionRepository {
  get(subscriptionId: string): Promise<SubscriptionRecord | null>;
  save(record: SubscriptionRecord): Promise<void>;
  listByMember(memberId: string): Promise<SubscriptionRecord[]>;
  /** Append only. There is deliberately no update or delete for history. */
  appendEvent(event: SubscriptionStateEvent): Promise<void>;
  listEvents(subscriptionId: string): Promise<SubscriptionStateEvent[]>;
}

// ---------------------------------------------------------------------------
// Service contract
// ---------------------------------------------------------------------------

export interface SubscriptionServiceDeps {
  repository: SubscriptionRepository;
  /** Keyed by SKU. The only authority on eligibility and display names. */
  catalog: Map<string, CatalogProduct>;
  lots: InventoryLot[];
  commerceEnabled: boolean;
  quantumCommerceEnabled: boolean;
  /** A renewal never proceeds for a lapsed membership. Injected, never assumed. */
  isMembershipActive(memberId: string): Promise<boolean> | boolean;
  /**
   * True when the named agreement is effective paper for this member. The
   * agreements engine owns what "effective" means; this seam only asks.
   */
  hasEffectiveAgreement(memberId: string, agreementKey: string): Promise<boolean> | boolean;
  /** Agreement keys a renewal requires. An empty list requires nothing. */
  requiredAgreementKeys: string[];
  /** Probed without side effects before a renewal may proceed. */
  payment: Pick<PaymentProvider, "retrieveStatus">;
  /** Injected for tests; defaults to a UUID so ids are database-compatible. */
  newId?(): string;
}

export interface CreateSubscriptionInput {
  sku: string;
  quantity: number;
  frequencyDays: SubscriptionFrequencyDays;
  paymentProviderReference?: string | null;
  priceVersion: string;
  shippingAddressRef?: string | null;
}

export type SubscriptionDenial = { ok: false; code: CommerceDenialCode; message: string };
export type SubscriptionMutation = { ok: true; subscription: SubscriptionDto } | SubscriptionDenial;

/**
 * Renewal refusals are more precise than the member-facing denial codes, because
 * the consumer is the renewal scheduler and the operator queue, not a member. A
 * lot-level refusal names the exact quality failure rather than folding it into
 * a generic stock message.
 */
export type RenewalRefusalCode =
  | CommerceDenialCode
  | "coa_missing"
  | "lot_expired"
  | "lot_recalled"
  | "renewal_not_due";

export type RenewalDecision =
  | { ok: true; subscription: SubscriptionRecord }
  | { ok: false; refusals: RenewalRefusalCode[]; message: string };

export interface SubscriptionService {
  create(memberId: string, input: CreateSubscriptionInput, asOf: Date): Promise<SubscriptionMutation>;
  listForMember(memberId: string): Promise<SubscriptionDto[]>;
  /** The member-facing action surface (routes' CommerceDependencies.subscriptions). */
  apply(
    memberId: string,
    subscriptionId: string,
    req: SubscriptionActionRequest,
    asOf: Date,
  ): Promise<SubscriptionMutation>;
  /** pending -> active. System or provider webhook only, per the shared table. */
  activate(
    subscriptionId: string,
    actor: Actor,
    asOf: Date,
    paymentProviderReference?: string,
  ): Promise<SubscriptionMutation>;
  /** A failed renewal charge moves the subscription into the retry state. */
  recordPaymentFailure(subscriptionId: string, actor: Actor, asOf: Date): Promise<SubscriptionMutation>;
  /** The retry succeeded; the subscription returns to active with a schedule. */
  resolvePaymentIssue(subscriptionId: string, actor: Actor, asOf: Date): Promise<SubscriptionMutation>;
  /** The renewal gate. Refuses with every precise code; never partially proceeds. */
  evaluateRenewal(subscriptionId: string, asOf: Date): Promise<RenewalDecision>;
}

// ---------------------------------------------------------------------------
// Denial mapping (same shape as the cart's, kept local so neither file owns the
// other's internals)
// ---------------------------------------------------------------------------

const ELIGIBILITY_TO_DENIAL: Readonly<Record<PurchaseBlockReason, CommerceDenialCode>> = {
  commerce_capability_disabled: "commerce_disabled",
  lane_commerce_disabled: "lane_not_purchasable",
  lane_decision_pending: "lane_not_purchasable",
  commerce_not_approved: "product_not_purchasable",
  availability_not_purchasable: "product_not_purchasable",
  unconfirmed_commerce_critical_facts: "unconfirmed_supplier_facts",
  quality_documentation_incomplete: "product_not_purchasable",
  subscription_not_eligible: "subscription_action_invalid",
};

/** The five actions a member may request over the wire. Everything else is a
 * system action and is not reachable through `apply`. */
const MEMBER_ACTIONS: ReadonlySet<SubscriptionActionRequest["action"]> = new Set<
  SubscriptionActionRequest["action"]
>(["pause", "resume", "skip", "reschedule", "cancel"]);

function isValidQuantity(quantity: number): boolean {
  return Number.isInteger(quantity) && quantity > 0 && quantity <= MAX_SUBSCRIPTION_QUANTITY;
}

function isFrequency(value: unknown): value is SubscriptionFrequencyDays {
  return (SUBSCRIPTION_FREQUENCIES as readonly unknown[]).includes(value);
}

function addDays(asOf: Date, days: number): string {
  return new Date(asOf.getTime() + days * 24 * 60 * 60 * 1000).toISOString();
}

function denial(code: CommerceDenialCode, message: string): SubscriptionDenial {
  return { ok: false, code, message };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createSubscriptionService(deps: SubscriptionServiceDeps): SubscriptionService {
  const newId = deps.newId ?? randomUUID;

  function toDto(record: SubscriptionRecord): SubscriptionDto {
    // Explicit construction. The payment reference, price version, and address
    // reference never reach a member through this function.
    return {
      subscriptionId: record.subscriptionId,
      sku: record.sku,
      displayName: deps.catalog.get(record.sku)?.displayName ?? record.sku,
      state: record.state,
      frequencyDays: record.frequencyDays,
      quantity: record.quantity,
      nextChargeAt: record.nextRenewalAt,
      nextShipmentAt: record.nextShipmentAt,
    };
  }

  /**
   * The single write path for a state change. Runs the shared transition table,
   * persists the new revision, and appends the event. Nothing else in this file
   * assigns a state.
   */
  async function transition(
    record: SubscriptionRecord,
    action: SubscriptionAction,
    actor: Actor,
    asOf: Date,
    changes: Partial<SubscriptionRecord> = {},
    effectiveAt: string | null = null,
  ): Promise<SubscriptionMutation> {
    const result = applySubscriptionAction(record.state, action, actor);
    if (!result.ok) {
      return denial("subscription_action_invalid", result.message);
    }

    const next: SubscriptionRecord = {
      ...record,
      ...changes,
      state: result.state,
      updatedAt: asOf.toISOString(),
    };
    await deps.repository.save(next);
    await deps.repository.appendEvent({
      subscriptionId: record.subscriptionId,
      action,
      fromState: record.state,
      toState: result.state,
      actorType: actor,
      actorId: null,
      effectiveAt,
      occurredAt: asOf.toISOString(),
    });
    return { ok: true, subscription: toDto(next) };
  }

  /** Ownership is the gate. Another member's subscription does not exist here. */
  async function getOwned(memberId: string, subscriptionId: string): Promise<SubscriptionRecord | null> {
    const record = await deps.repository.get(subscriptionId);
    if (!record) return null;
    if (record.memberId !== memberId) return null;
    return record;
  }

  /** A schedule instant that is still ahead is kept; anything else is recomputed. */
  function scheduleFrom(record: SubscriptionRecord, asOf: Date): string {
    if (record.nextRenewalAt !== null && new Date(record.nextRenewalAt).getTime() > asOf.getTime()) {
      return record.nextRenewalAt;
    }
    return addDays(asOf, record.frequencyDays);
  }

  async function create(
    memberId: string,
    input: CreateSubscriptionInput,
    asOf: Date,
  ): Promise<SubscriptionMutation> {
    const product = deps.catalog.get(input.sku);
    if (!product) {
      return denial("product_not_found", `Unknown SKU ${input.sku}.`);
    }
    if (!deps.commerceEnabled) {
      return denial("commerce_disabled", "Product commerce is not enabled.");
    }
    if (!isValidQuantity(input.quantity)) {
      return denial(
        "quantity_invalid",
        `Quantity must be a whole number between 1 and ${MAX_SUBSCRIPTION_QUANTITY}.`,
      );
    }
    if (!isFrequency(input.frequencyDays)) {
      return denial("subscription_action_invalid", "A subscription needs a frequency of 30, 60, or 90 days.");
    }
    if (!product.subscriptionEligible) {
      return denial(
        "subscription_action_invalid",
        `${product.displayName} is not available as a subscription.`,
      );
    }

    const record: SubscriptionRecord = {
      subscriptionId: newId(),
      memberId,
      sku: input.sku,
      quantity: input.quantity,
      frequencyDays: input.frequencyDays,
      // Pending until a system or provider actor activates it. A subscription
      // never charges out of creation alone.
      state: "pending",
      nextRenewalAt: null,
      nextShipmentAt: null,
      paymentProviderReference: input.paymentProviderReference ?? null,
      priceVersion: input.priceVersion,
      shippingAddressRef: input.shippingAddressRef ?? null,
      createdAt: asOf.toISOString(),
      updatedAt: asOf.toISOString(),
      cancelledAt: null,
    };
    await deps.repository.save(record);
    return { ok: true, subscription: toDto(record) };
  }

  async function listForMember(memberId: string): Promise<SubscriptionDto[]> {
    return (await deps.repository.listByMember(memberId))
      .filter((record) => record.memberId === memberId)
      .map(toDto);
  }

  async function apply(
    memberId: string,
    subscriptionId: string,
    req: SubscriptionActionRequest,
    asOf: Date,
  ): Promise<SubscriptionMutation> {
    const record = await getOwned(memberId, subscriptionId);
    if (!record) {
      return denial("subscription_not_found", `No subscription ${subscriptionId}.`);
    }

    // The body arrives as unvalidated JSON, so the action set and every optional
    // field are checked at runtime before the state machine is consulted.
    if (!MEMBER_ACTIONS.has(req.action)) {
      return denial("subscription_action_invalid", `Unknown subscription action ${String(req.action)}.`);
    }
    if (req.frequencyDays !== undefined && !isFrequency(req.frequencyDays)) {
      return denial("subscription_action_invalid", "Frequency must be 30, 60, or 90 days.");
    }
    if (req.quantity !== undefined && !isValidQuantity(req.quantity)) {
      return denial(
        "quantity_invalid",
        `Quantity must be a whole number between 1 and ${MAX_SUBSCRIPTION_QUANTITY}.`,
      );
    }

    let rescheduleTo: Date | null = null;
    if (req.action === "reschedule") {
      rescheduleTo = req.rescheduleTo === undefined ? null : new Date(req.rescheduleTo);
      if (rescheduleTo === null || Number.isNaN(rescheduleTo.getTime())) {
        return denial("subscription_action_invalid", "A reschedule needs a valid target date.");
      }
      if (rescheduleTo.getTime() <= asOf.getTime()) {
        return denial("subscription_action_invalid", "A reschedule target must be in the future.");
      }
    }

    // Field updates ride along only when the transition itself is legal; they
    // are folded into `changes` and applied by the single write path.
    const changes: Partial<SubscriptionRecord> = {};
    if (req.frequencyDays !== undefined) changes.frequencyDays = req.frequencyDays;
    if (req.quantity !== undefined) changes.quantity = req.quantity;
    const frequencyDays = req.frequencyDays ?? record.frequencyDays;

    let effectiveAt: string | null = null;
    switch (req.action) {
      case "pause":
        // The schedule column is kept as history; a paused subscription is
        // excluded from renewal by its state, not by a blanked date.
        break;
      case "resume": {
        const next = scheduleFrom({ ...record, frequencyDays }, asOf);
        changes.nextRenewalAt = next;
        changes.nextShipmentAt = next;
        effectiveAt = next;
        break;
      }
      case "skip": {
        // Skipping pushes the renewal exactly one cycle past where it stood.
        const base =
          record.nextRenewalAt !== null ? new Date(record.nextRenewalAt) : asOf;
        const next = addDays(base, frequencyDays);
        changes.nextRenewalAt = next;
        changes.nextShipmentAt = next;
        effectiveAt = next;
        break;
      }
      case "reschedule": {
        const next = (rescheduleTo as Date).toISOString();
        changes.nextRenewalAt = next;
        changes.nextShipmentAt = next;
        effectiveAt = next;
        break;
      }
      case "cancel":
        // A cancelled subscription must not keep a schedule, so it can never
        // quietly continue charging (the database enforces the same).
        changes.nextRenewalAt = null;
        changes.nextShipmentAt = null;
        changes.cancelledAt = asOf.toISOString();
        break;
    }

    return transition(record, req.action, "member", asOf, changes, effectiveAt);
  }

  async function activate(
    subscriptionId: string,
    actor: Actor,
    asOf: Date,
    paymentProviderReference?: string,
  ): Promise<SubscriptionMutation> {
    const record = await deps.repository.get(subscriptionId);
    if (!record) {
      return denial("subscription_not_found", `No subscription ${subscriptionId}.`);
    }
    const next = addDays(asOf, record.frequencyDays);
    return transition(
      record,
      "activate",
      actor,
      asOf,
      {
        nextRenewalAt: next,
        nextShipmentAt: next,
        paymentProviderReference: paymentProviderReference ?? record.paymentProviderReference,
      },
      next,
    );
  }

  async function recordPaymentFailure(
    subscriptionId: string,
    actor: Actor,
    asOf: Date,
  ): Promise<SubscriptionMutation> {
    const record = await deps.repository.get(subscriptionId);
    if (!record) {
      return denial("subscription_not_found", `No subscription ${subscriptionId}.`);
    }
    // The retry state. The schedule is kept so a resolved issue can retry, and
    // the state (not a flag) is what excludes it from renewal meanwhile.
    return transition(record, "report_payment_issue", actor, asOf);
  }

  async function resolvePaymentIssue(
    subscriptionId: string,
    actor: Actor,
    asOf: Date,
  ): Promise<SubscriptionMutation> {
    const record = await deps.repository.get(subscriptionId);
    if (!record) {
      return denial("subscription_not_found", `No subscription ${subscriptionId}.`);
    }
    const next = scheduleFrom(record, asOf);
    return transition(
      record,
      "resolve_payment_issue",
      actor,
      asOf,
      { nextRenewalAt: next, nextShipmentAt: next },
      next,
    );
  }

  /**
   * Mines the precise lot-level refusals out of a failed allocation. Only a
   * FAILED allocation reaches here: while any clean lot can satisfy the
   * quantity, a bad lot elsewhere in the pool is FEFO's problem, not a refusal.
   */
  function preciseLotRefusals(sku: string, rejected: readonly LotEvaluation[]): RenewalRefusalCode[] {
    const codes: RenewalRefusalCode[] = [];
    const push = (code: RenewalRefusalCode): void => {
      if (!codes.includes(code)) codes.push(code);
    };
    for (const evaluation of rejected) {
      if (evaluation.blockReasons.includes("expired")) push("lot_expired");
      if (evaluation.blockReasons.includes("recalled")) push("lot_recalled");
      if (evaluation.blockReasons.includes("documentation_missing")) {
        const lot = deps.lots.find((l) => l.lotId === evaluation.lotId && l.sku === sku);
        if (lot && !lot.documents.coaOnFile) push("coa_missing");
      }
    }
    return codes;
  }

  /** Probes the provider without side effects, exactly as checkout does. */
  async function paymentIsUsable(): Promise<boolean> {
    const probe = await deps.payment.retrieveStatus("");
    if (probe.ok) return true;
    return probe.code !== "DISABLED" && probe.code !== "MISCONFIGURED";
  }

  async function evaluateRenewal(subscriptionId: string, asOf: Date): Promise<RenewalDecision> {
    const record = await deps.repository.get(subscriptionId);
    if (!record) {
      return {
        ok: false,
        refusals: ["subscription_not_found"],
        message: `No subscription ${subscriptionId}.`,
      };
    }

    // Fails closed and accumulates: every gate runs, every refusal is reported,
    // and a single refusal is enough to stop the renewal outright.
    const refusals: RenewalRefusalCode[] = [];
    const refuse = (code: RenewalRefusalCode): void => {
      if (!refusals.includes(code)) refusals.push(code);
    };

    if (record.state !== "active") refuse("subscription_action_invalid");

    // The renewal must actually be DUE. No schedule, an unparseable schedule,
    // or a nextRenewalAt still in the future all refuse, so this gate cannot
    // approve an early charge or wave the same cycle through before its time.
    // (Advancing nextRenewalAt after a successful renewal charge needs a
    // "renew" action in the shared transition vocabulary; until then the due
    // check is the in-service guard.)
    const dueMs = record.nextRenewalAt === null ? NaN : new Date(record.nextRenewalAt).getTime();
    if (!Number.isFinite(dueMs) || dueMs > asOf.getTime()) refuse("renewal_not_due");

    if (!(await deps.isMembershipActive(record.memberId))) refuse("membership_inactive");

    if (!deps.commerceEnabled) refuse("commerce_disabled");

    const product = deps.catalog.get(record.sku);
    if (!product) {
      refuse("product_not_found");
    } else {
      const eligibility = evaluatePurchaseEligibility(product, {
        productCommerceEnabled: deps.commerceEnabled,
        quantumCommerceEnabled: deps.quantumCommerceEnabled,
        asSubscription: true,
      });
      for (const blockReason of eligibility.blockReasons) {
        refuse(ELIGIBILITY_TO_DENIAL[blockReason]);
      }
    }

    // A lot that is expired, recalled, undocumented, or unknown-expiry
    // contributes nothing, because allocateFefo refuses it before counting it.
    const allocation = allocateFefo(deps.lots, record.sku, record.quantity, asOf);
    if (!allocation.ok) {
      refuse("insufficient_stock");
      for (const code of preciseLotRefusals(record.sku, allocation.rejected)) refuse(code);
    }

    if (!(await paymentIsUsable())) refuse("payment_disabled");

    for (const key of deps.requiredAgreementKeys) {
      if (!(await deps.hasEffectiveAgreement(record.memberId, key))) {
        refuse("agreement_required");
      }
    }

    if (refusals.length > 0) {
      return {
        ok: false,
        refusals,
        message: `Subscription ${subscriptionId} may not renew: ${refusals.join(", ")}.`,
      };
    }
    return { ok: true, subscription: record };
  }

  return {
    create,
    listForMember,
    apply,
    activate,
    recordPaymentFailure,
    resolvePaymentIssue,
    evaluateRenewal,
  };
}

// ---------------------------------------------------------------------------
// In-memory repository: the deterministic double for tests and unconfigured
// deployments. Copies on the way in and out so a caller cannot mutate stored
// state through a held reference. Events only ever append.
// ---------------------------------------------------------------------------

function cloneRecord(record: SubscriptionRecord): SubscriptionRecord {
  return { ...record };
}

function cloneEvent(event: SubscriptionStateEvent): SubscriptionStateEvent {
  return { ...event };
}

export function createInMemorySubscriptionRepository(
  seed: readonly SubscriptionRecord[] = [],
): SubscriptionRepository {
  const rows = new Map<string, SubscriptionRecord>();
  const events: SubscriptionStateEvent[] = [];
  seed.forEach((record) => rows.set(record.subscriptionId, cloneRecord(record)));
  return {
    async get(subscriptionId) {
      const found = rows.get(subscriptionId);
      return found ? cloneRecord(found) : null;
    },
    async save(record) {
      rows.set(record.subscriptionId, cloneRecord(record));
    },
    async listByMember(memberId) {
      return Array.from(rows.values())
        .filter((record) => record.memberId === memberId)
        .map(cloneRecord);
    },
    async appendEvent(event) {
      events.push(cloneEvent(event));
    },
    async listEvents(subscriptionId) {
      return events.filter((event) => event.subscriptionId === subscriptionId).map(cloneEvent);
    },
  };
}
