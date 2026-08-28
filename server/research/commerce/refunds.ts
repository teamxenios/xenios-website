// xenios research: refund and replacement claims.
//
// Founder policy: there are NO ordinary returns. A member cannot send a product back
// because they changed their mind or never opened it. Only a defect, a loss, or a
// handling failure opens a claim, and the accepted reasons are enumerated below.
//
// Two rules shape the file.
//
// First, nothing restocks. A unit that left custody has a broken chain of custody and
// never re-enters allocatable inventory, so this service holds no inventory dependency
// at all and every resolution reports the returned unit as destroyed. There is no code
// path here that can raise a lot quantity.
//
// Second, money moves only on a provider result. `resolveWithRefund` calls the provider
// and moves the order to `refunded` through `transitionOrder` carrying the reference the
// provider returned. A disabled provider leaves the claim approved and unpaid, which is
// an honest state, rather than resolved, which would be a lie about money.

import type { ClaimDto, ClaimReason, CommerceDenialCode, CreateClaimRequest } from "@shared/research/commerce-api";
import {
  TERMINAL_ORDER_STATES,
  canTransitionOrder,
  transitionOrder,
  type OrderState,
} from "@shared/research/commerce";
import crypto from "crypto";
import type { ProviderFailureCode } from "@shared/research/capability";
import type { LotDisposition } from "../inventory/lots";
import type { PaymentProvider } from "../providers/payment";

export type { ClaimReason };

/**
 * The complete set of reasons that open a claim.
 *
 * A change-of-mind or unopened-package reason is absent on purpose. Product integrity
 * and chain of custody are the reason, and adding an entry here is a founder decision,
 * not an implementation detail.
 */
export const ACCEPTED_CLAIM_REASONS: readonly ClaimReason[] = [
  "damaged",
  "lost",
  "incorrect",
  "missing",
  "temperature_concern",
] as const;

export type ClaimState = ClaimDto["state"];
export type ClaimResolution = ClaimDto["resolution"];

/** The admin decisions that move a claim without resolving it. */
export type ClaimReviewDecision = "under_review" | "information_requested" | "approved" | "declined";

/**
 * The stored claim. Wider than the wire DTO on purpose: memberId, lotId, evidenceRefs,
 * reviewedBy, and notes are operator data, so a route that spreads this object would
 * leak. `toClaimDto` is the only projection that crosses the boundary.
 */
export interface ClaimRecord {
  claimId: string;
  orderId: string;
  memberId: string;
  sku: string;
  /** The lot the unit came from, when it is known. Never used to restock. */
  lotId: string | null;
  reason: ClaimReason;
  state: ClaimState;
  resolution: ClaimResolution;
  /** Opaque references. No image bytes and no URLs to private media cross this boundary. */
  evidenceRefs: string[];
  submittedAt: string;
  reviewedBy: string | null;
  notes: string;
}

export interface ClaimRepository {
  get(claimId: string): Promise<ClaimRecord | null>;
  save(claim: ClaimRecord): Promise<void>;
  listByMember(memberId: string): Promise<ClaimRecord[]>;
  listByOrder(orderId: string): Promise<ClaimRecord[]>;

  /**
   * Refund idempotency, owned by the repository rather than by this module.
   *
   * It lived in a per-process Map, which is not idempotency at all once the service
   * restarts or runs on a second instance: the map is empty, the key looks new, and a
   * repeated request issues a SECOND refund. Real money moves twice.
   *
   * Putting it on the repository makes durability the caller's responsibility and
   * visible in the interface, so an in-memory implementation is an explicit test-only
   * choice rather than an invisible production defect.
   */
  hasRefundKey(scope: string): Promise<boolean>;
  recordRefundKey(scope: string, refundReference: string): Promise<void>;
  listOpen(): Promise<ClaimRecord[]>;
}

/**
 * The slice of an order this service needs.
 *
 * `capturedAmountCents` is what the provider actually took, not the order total, because
 * a refund is bounded by money that really moved.
 *
 * `refundedCents` is carried and checked against the capture, but note that partial
 * refunds are NOT reachable today: the first refund moves the order to a terminal
 * refunded state, so a second is denied by the state machine before the arithmetic is
 * consulted. The bound is therefore a second line of defence rather than the active
 * one. If partial refunds are ever wanted, the terminal transition is what has to
 * change, not this field.
 */
export interface ClaimOrderView {
  orderId: string;
  memberId: string;
  state: OrderState;
  capturedAmountCents: number;
  /** The provider reference from the capture. Null when nothing was captured. */
  paymentReference: string | null;
  refundedCents: number;
  lines: Array<{ sku: string; lotId: string | null }>;
  /** Set by the last applied money transition, so a replay is absorbed. */
  lastAppliedIdempotencyKey?: string;
}

export interface ClaimOrderRepository {
  get(orderId: string): Promise<ClaimOrderView | null>;
  save(order: ClaimOrderView): Promise<void>;
}

export type RefundCommandState =
  | "prepared"
  | "provider_in_flight"
  | "provider_retryable"
  | "reconciliation_required"
  | "terminal_refused"
  | "applied";

/**
 * Durable identity for one refund attempt. The provider key is minted once by
 * the store from claim + order + member + client key and is never replaced.
 */
export interface RefundCommand {
  commandId: string;
  claimId: string;
  orderId: string;
  memberId: string;
  clientIdempotencyKey: string;
  providerIdempotencyKey: string;
  providerName: string;
  paymentReference: string;
  amountCents: number;
  state: RefundCommandState;
  attempt: number;
}

export type RefundCommandOutcome =
  | "ready"
  | "execute"
  | "applied"
  | "safe_retryable"
  | "terminal_refused"
  | "reconciliation_required"
  | "refund_pending"
  | "order_not_found"
  | "order_state_invalid"
  | "payment_failed"
  | "idempotency_conflict"
  | "capability_disabled";

export interface RefundCommandResult {
  outcome: RefundCommandOutcome;
  command?: RefundCommand;
}

export interface RefundCommandStore {
  /** Lock claim + order, validate the balance, then durably record intent. */
  prepare(input: {
    claimId: string;
    adminId: string;
    amountCents: number;
    clientIdempotencyKey: string;
    providerName: string;
    asOf: Date;
  }): Promise<RefundCommandResult>;
  /** Atomically grant at most one ordinary caller permission to contact the provider. */
  claimProviderExecution(input: {
    commandId: string;
    providerIdempotencyKey: string;
    asOf: Date;
  }): Promise<RefundCommandResult>;
  /** Persist only a closed, non-success provider outcome. No domain money fact moves here. */
  recordProviderOutcome(input: {
    commandId: string;
    providerIdempotencyKey: string;
    attempt: number;
    outcome: "safe_retryable" | "terminal_refused" | "reconciliation_required";
    failureCode: ProviderFailureCode | "INVALID_SUCCESS_PROOF" | "PROVIDER_THROW";
    providerRefundReference: string | null;
    providerRefundedAmountCents: number | null;
    asOf: Date;
  }): Promise<RefundCommandResult>;
  /**
   * One atomic publish: provider proof + refund ledger + order state + claim
   * resolution. This also accepts exact proof supplied by a trusted reconciler
   * for a quarantined command; ordinary request retries never reach this method.
   * A stale snapshot becomes reconciliation_required, never success.
   */
  complete(input: {
    commandId: string;
    providerIdempotencyKey: string;
    attempt: number;
    providerRefundReference: string;
    providerRefundedAmountCents: number;
    asOf: Date;
  }): Promise<RefundCommandResult>;
}

/** Production-safe absence: no intent and no provider call can be authorized. */
export const unavailableRefundCommandStore: RefundCommandStore = {
  prepare: async () => ({ outcome: "capability_disabled" }),
  claimProviderExecution: async () => ({ outcome: "capability_disabled" }),
  recordProviderOutcome: async () => ({ outcome: "capability_disabled" }),
  complete: async () => ({ outcome: "capability_disabled" }),
};

export type RefundCrashPoint =
  | "after_intent_persisted"
  | "after_execution_claimed"
  | "after_provider_response"
  | "after_atomic_publish";

export interface RefundServiceDeps {
  claims: ClaimRepository;
  orders: ClaimOrderRepository;
  refundCommands: RefundCommandStore;
  payment: PaymentProvider;
  commerceEnabled: boolean;
  /** Injected so claim ids are deterministic under test. */
  newClaimId?: (sequence: number) => string;
  /** Test-only crash injector. Production leaves this absent. */
  crashAt?: (point: RefundCrashPoint) => void | Promise<void>;
}

export type RefundResolutionState = "pending" | "reconciliation_required";
export type ClaimDenial = {
  ok: false;
  codes: CommerceDenialCode[];
  /** Explicit financial uncertainty; wire routes still fail with a known 503 code. */
  refundState?: RefundResolutionState;
};
export type ClaimOutcome = { ok: true; claim: ClaimDto } | ClaimDenial;

/**
 * The result of resolving a claim.
 *
 * `restockedUnits` is typed as the literal 0 and `returnedLotDisposition` as the literal
 * "destroyed", so a future edit that tries to restock fails to compile rather than
 * quietly putting a returned unit back in the allocatable pool.
 */
export interface ResolutionSuccess {
  ok: true;
  claim: ClaimDto;
  restockedUnits: 0;
  returnedLotDisposition: Extract<LotDisposition, "destroyed">;
}

export type ResolutionOutcome = ResolutionSuccess | ClaimDenial;

export interface RefundService {
  submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<ClaimOutcome>;
  reviewClaim(
    claimId: string,
    adminId: string,
    decision: ClaimReviewDecision,
    asOf: Date,
    note?: string,
  ): Promise<ClaimOutcome>;
  resolveWithReplacement(claimId: string, adminId: string, asOf: Date): Promise<ResolutionOutcome>;
  resolveWithRefund(
    claimId: string,
    adminId: string,
    amountCents: number,
    idempotencyKey: string,
    asOf: Date,
  ): Promise<ResolutionOutcome>;
  listForMember(memberId: string): Promise<ClaimDto[]>;
  getForMember(memberId: string, claimId: string): Promise<ClaimDto | null>;
  listOpenForAdmin(): Promise<ClaimRecord[]>;
}

// ---------------------------------------------------------------------------
// Projection
// ---------------------------------------------------------------------------

export function toClaimDto(record: ClaimRecord): ClaimDto {
  return {
    claimId: record.claimId,
    orderId: record.orderId,
    sku: record.sku,
    reason: record.reason,
    state: record.state,
    resolution: record.resolution,
    submittedAt: record.submittedAt,
  };
}

// ---------------------------------------------------------------------------
// Accumulator
// ---------------------------------------------------------------------------

/** Preserves gate order and drops repeats, so the same code is never reported twice. */
class Denials {
  private readonly seen = new Set<CommerceDenialCode>();
  private readonly ordered: CommerceDenialCode[] = [];

  add(code: CommerceDenialCode): void {
    if (this.seen.has(code)) return;
    this.seen.add(code);
    this.ordered.push(code);
  }

  get list(): CommerceDenialCode[] {
    return this.ordered.slice();
  }

  get empty(): boolean {
    return this.ordered.length === 0;
  }
}

function deny(...codes: CommerceDenialCode[]): ClaimDenial {
  const denials = new Denials();
  codes.forEach((code) => denials.add(code));
  return { ok: false, codes: denials.list };
}

// ---------------------------------------------------------------------------
// Guards
// ---------------------------------------------------------------------------

/** Order states in which the member plausibly has, or was owed, the goods. */
const CLAIMABLE_ORDER_STATES: readonly OrderState[] = [
  "payment_captured",
  "processing",
  "partially_fulfilled",
  "fulfilled",
  "delivered",
  "exception",
] as const;

/** A claim no longer waiting on anyone. */
const CLOSED_CLAIM_STATES: readonly ClaimState[] = ["resolved", "declined"] as const;

/** Review moves that are legal from each state. Anything absent is denied. */
const CLAIM_REVIEW_TRANSITIONS: ReadonlyArray<{ from: ClaimState; to: ClaimReviewDecision }> = [
  { from: "submitted", to: "under_review" },
  { from: "submitted", to: "information_requested" },
  { from: "submitted", to: "approved" },
  { from: "submitted", to: "declined" },
  { from: "under_review", to: "information_requested" },
  { from: "under_review", to: "approved" },
  { from: "under_review", to: "declined" },
  { from: "information_requested", to: "under_review" },
  { from: "information_requested", to: "approved" },
  { from: "information_requested", to: "declined" },
];

/**
 * An evidence reference is an opaque handle to media stored elsewhere. A URL, a data
 * URI, or a filesystem path would either carry bytes or hand out a link to private
 * media, so both are refused at the boundary rather than sanitized later.
 */
function evidenceRefIsOpaque(ref: string): boolean {
  const trimmed = ref.trim();
  if (trimmed === "") return false;
  if (trimmed.length > 200) return false;
  if (trimmed.indexOf("://") !== -1) return false;
  if (/^(https?|data|file|ftp|blob):/i.test(trimmed)) return false;
  if (/[\s<>"']/.test(trimmed)) return false;
  return true;
}

function reasonIsAccepted(reason: string): boolean {
  return ACCEPTED_CLAIM_REASONS.indexOf(reason as ClaimReason) !== -1;
}

/**
 * A disabled or misconfigured provider is a capability state, not a transient
 * payment failure. Both are reported as `payment_disabled` so an operator is not
 * invited to retry a refund that cannot succeed until the capability is fixed.
 */
function refundDenialCode(code: ProviderFailureCode): CommerceDenialCode {
  return code === "DISABLED" || code === "MISCONFIGURED" ? "payment_disabled" : "payment_failed";
}

function commandDenial(outcome: RefundCommandOutcome): ClaimDenial {
  if (outcome === "reconciliation_required") return refundBlocked("reconciliation_required");
  if (outcome === "refund_pending") return refundBlocked("pending");
  if (outcome === "capability_disabled") return deny("capability_disabled");
  if (outcome === "idempotency_conflict") return deny("idempotency_conflict");
  if (outcome === "order_not_found") return deny("order_not_found");
  if (outcome === "order_state_invalid") return deny("order_state_invalid");
  return deny("payment_failed");
}

function refundBlocked(refundState: RefundResolutionState): ClaimDenial {
  return { ok: false, codes: ["capability_disabled"], refundState };
}

function boundedCommandText(value: string, max: number): boolean {
  return value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value);
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export function createRefundService(deps: RefundServiceDeps): RefundService {
  const mintId = deps.newClaimId ?? ((sequence: number): string => `clm_${sequence}`);
  let counter = 0;

  async function submitClaim(memberId: string, req: CreateClaimRequest, asOf: Date): Promise<ClaimOutcome> {
    const denials = new Denials();

    if (!deps.commerceEnabled) denials.add("commerce_disabled");

    // Only the five enumerated reasons open a claim. Everything else, including a
    // change of mind or an unopened package, is refused: there are no ordinary returns.
    if (!reasonIsAccepted(req.reason)) denials.add("forbidden");

    if (!req.evidenceRefs.every(evidenceRefIsOpaque)) denials.add("forbidden");

    const order = await deps.orders.get(req.orderId);
    if (!order) {
      denials.add("order_not_found");
      return { ok: false, codes: denials.list };
    }

    // A member may claim only against their own order, and the denial does not reveal
    // whether the order exists for someone else.
    if (order.memberId !== memberId) {
      return deny("order_not_found");
    }

    if (CLAIMABLE_ORDER_STATES.indexOf(order.state) === -1) denials.add("order_state_invalid");

    const line = order.lines.find((l) => l.sku === req.sku);
    if (!line) denials.add("product_not_found");

    if (!denials.empty) return { ok: false, codes: denials.list };

    // Idempotency: a member who taps submit twice gets the claim they already have.
    const open = (await deps.claims.listByOrder(req.orderId)).find(
        (c) =>
          c.sku === req.sku &&
          c.reason === req.reason &&
          CLOSED_CLAIM_STATES.indexOf(c.state) === -1,
      );
    if (open) return { ok: true, claim: toClaimDto(open) };

    const record: ClaimRecord = {
      claimId: mintId(++counter),
      orderId: req.orderId,
      memberId,
      sku: req.sku,
      lotId: line ? line.lotId : null,
      reason: req.reason,
      state: "submitted",
      resolution: null,
      evidenceRefs: req.evidenceRefs.slice(),
      submittedAt: asOf.toISOString(),
      reviewedBy: null,
      notes: req.detail,
    };
    await deps.claims.save(record);
    return { ok: true, claim: toClaimDto(record) };
  }

  async function reviewClaim(
    claimId: string,
    adminId: string,
    decision: ClaimReviewDecision,
    asOf: Date,
    note?: string,
  ): Promise<ClaimOutcome> {
    void asOf;
    const claim = await deps.claims.get(claimId);
    if (!claim) return deny("order_not_found");

    const legal = CLAIM_REVIEW_TRANSITIONS.some((t) => t.from === claim.state && t.to === decision);
    if (!legal) return deny("order_state_invalid");

    claim.state = decision;
    claim.reviewedBy = adminId;
    if (note !== undefined) claim.notes = note;
    await deps.claims.save(claim);
    return { ok: true, claim: toClaimDto(claim) };
  }

  async function resolveWithReplacement(claimId: string, adminId: string, asOf: Date): Promise<ResolutionOutcome> {
    void asOf;
    const claim = await deps.claims.get(claimId);
    if (!claim) return deny("order_not_found");
    // A replacement commits a physical shipment and moves the order to a terminal
    // state, so it is gated on the capability exactly as a refund is.
    if (!deps.commerceEnabled) return deny("commerce_disabled");
    if (claim.state !== "approved") return deny("order_state_invalid");

    const order = await deps.orders.get(claim.orderId);
    if (!order) return deny("order_not_found");

    const moved = transitionOrder({ from: order.state, to: "replaced", actor: "admin" });
    if (!moved.ok) return deny("order_state_invalid");
    order.state = moved.state;
    await deps.orders.save(order);

    claim.state = "resolved";
    claim.resolution = "replacement";
    claim.reviewedBy = adminId;
    await deps.claims.save(claim);

    // The replaced unit is destroyed, not restocked. Its chain of custody is broken and
    // no inventory quantity is touched anywhere in this function.
    return { ok: true, claim: toClaimDto(claim), restockedUnits: 0, returnedLotDisposition: "destroyed" };
  }

  async function resolveWithRefund(
    claimId: string,
    adminId: string,
    amountCents: number,
    idempotencyKey: string,
    asOf: Date,
  ): Promise<ResolutionOutcome> {
    // Every refusal in this block happens before intent persistence and therefore
    // mutates nothing. A disabled provider is recognized by capability identity,
    // not by attempting to build a command that could never run.
    if (!deps.commerceEnabled) return deny("commerce_disabled");
    if (deps.payment.name === "disabled") return deny("payment_disabled");
    if (!Number.isInteger(amountCents) || amountCents <= 0) return deny("payment_failed");
    if (!boundedCommandText(claimId, 255) || !boundedCommandText(adminId, 255)) return deny("forbidden");
    if (!boundedCommandText(idempotencyKey, 255)) return deny("idempotency_conflict");
    if (!boundedCommandText(deps.payment.name, 80)) return deny("payment_disabled");
    if (!(asOf instanceof Date) || !Number.isFinite(asOf.getTime())) return deny("forbidden");

    let prepared: RefundCommandResult;
    try {
      prepared = await deps.refundCommands.prepare({
        claimId,
        adminId,
        amountCents,
        clientIdempotencyKey: idempotencyKey,
        providerName: deps.payment.name,
        asOf,
      });
    } catch {
      return deny("capability_disabled");
    }

    async function appliedResolution(): Promise<ResolutionOutcome> {
      let claim: ClaimRecord | null;
      try {
        claim = await deps.claims.get(claimId);
      } catch {
        return refundBlocked("reconciliation_required");
      }
      if (
        !claim ||
        claim.state !== "resolved" ||
        (claim.resolution !== "refund" && claim.resolution !== "partial_refund")
      ) {
        return refundBlocked("reconciliation_required");
      }
      return {
        ok: true,
        claim: toClaimDto(claim),
        restockedUnits: 0,
        returnedLotDisposition: "destroyed",
      };
    }

    if (prepared.outcome === "applied") return appliedResolution();
    if (prepared.outcome === "terminal_refused") return deny("payment_failed");
    if (prepared.outcome !== "ready" || !prepared.command) return commandDenial(prepared.outcome);
    await deps.crashAt?.("after_intent_persisted");

    let execution: RefundCommandResult;
    try {
      execution = await deps.refundCommands.claimProviderExecution({
        commandId: prepared.command.commandId,
        providerIdempotencyKey: prepared.command.providerIdempotencyKey,
        asOf,
      });
    } catch {
      return refundBlocked("reconciliation_required");
    }
    if (execution.outcome === "applied") return appliedResolution();
    if (execution.outcome === "terminal_refused") return deny("payment_failed");
    if (execution.outcome !== "execute" || !execution.command) return commandDenial(execution.outcome);
    const command = execution.command;
    await deps.crashAt?.("after_execution_claimed");

    let result: Awaited<ReturnType<PaymentProvider["refund"]>>;
    try {
      result = await deps.payment.refund(
        command.paymentReference,
        command.amountCents,
        command.providerIdempotencyKey,
      );
    } catch {
      try {
        await deps.refundCommands.recordProviderOutcome({
          commandId: command.commandId,
          providerIdempotencyKey: command.providerIdempotencyKey,
          attempt: command.attempt,
          outcome: "reconciliation_required",
          failureCode: "PROVIDER_THROW",
          providerRefundReference: null,
          providerRefundedAmountCents: null,
          asOf,
        });
      } catch {
        // The durable in-flight command is already the conservative truth.
      }
      return refundBlocked("reconciliation_required");
    }
    await deps.crashAt?.("after_provider_response");

    if (!result.ok) {
      const providerOutcome =
        result.code === "DISABLED" || result.code === "MISCONFIGURED"
          ? "safe_retryable"
          : result.code === "RETRYABLE"
            ? "reconciliation_required"
            : "terminal_refused";
      try {
        const recorded = await deps.refundCommands.recordProviderOutcome({
          commandId: command.commandId,
          providerIdempotencyKey: command.providerIdempotencyKey,
          attempt: command.attempt,
          outcome: providerOutcome,
          failureCode: result.code,
          providerRefundReference: null,
          providerRefundedAmountCents: null,
          asOf,
        });
        if (recorded.outcome !== providerOutcome) {
          return refundBlocked("reconciliation_required");
        }
      } catch {
        return refundBlocked("reconciliation_required");
      }
      return providerOutcome === "reconciliation_required"
        ? refundBlocked("reconciliation_required")
        : deny(refundDenialCode(result.code));
    }

    const reference = result.value.providerReference;
    const reported = result.value.refundedAmountCents;
    if (
      result.value.status !== "refunded" ||
      !boundedCommandText(reference, 255) ||
      !Number.isInteger(reported) ||
      reported !== command.amountCents
    ) {
      try {
        await deps.refundCommands.recordProviderOutcome({
          commandId: command.commandId,
          providerIdempotencyKey: command.providerIdempotencyKey,
          attempt: command.attempt,
          outcome: "reconciliation_required",
          failureCode: "INVALID_SUCCESS_PROOF",
          providerRefundReference: boundedCommandText(reference, 255) ? reference : null,
          providerRefundedAmountCents: Number.isInteger(reported) ? reported : null,
          asOf,
        });
      } catch {
        // The already-durable in-flight state remains fail closed.
      }
      return refundBlocked("reconciliation_required");
    }

    let completed: RefundCommandResult;
    try {
      completed = await deps.refundCommands.complete({
        commandId: command.commandId,
        providerIdempotencyKey: command.providerIdempotencyKey,
        attempt: command.attempt,
        providerRefundReference: reference,
        providerRefundedAmountCents: reported,
        asOf,
      });
    } catch {
      return refundBlocked("reconciliation_required");
    }
    if (completed.outcome !== "applied") return refundBlocked("reconciliation_required");
    await deps.crashAt?.("after_atomic_publish");
    return appliedResolution();
  }

  async function listForMember(memberId: string): Promise<ClaimDto[]> {
    return (await deps.claims.listByMember(memberId)).map(toClaimDto);
  }

  async function getForMember(memberId: string, claimId: string): Promise<ClaimDto | null> {
    const claim = await deps.claims.get(claimId);
    // A cross-member read is indistinguishable from a missing claim.
    if (!claim || claim.memberId !== memberId) return null;
    return toClaimDto(claim);
  }

  async function listOpenForAdmin(): Promise<ClaimRecord[]> {
    return deps.claims.listOpen();
  }

  return {
    submitClaim,
    reviewClaim,
    resolveWithReplacement,
    resolveWithRefund,
    listForMember,
    getForMember,
    listOpenForAdmin,
  };
}

// ---------------------------------------------------------------------------
// In-memory repositories
// ---------------------------------------------------------------------------

export function createInMemoryClaimRepository(seed: readonly ClaimRecord[] = []): ClaimRepository {
  const byId = new Map<string, ClaimRecord>();
  const order: string[] = [];
  /**
   * Test-only durability. A real implementation persists this alongside the claims,
   * because losing it means a repeated refund key issues a second refund.
   */
  const refundKeys = new Map<string, string>();

  function put(claim: ClaimRecord): void {
    if (!byId.has(claim.claimId)) order.push(claim.claimId);
    byId.set(claim.claimId, claim);
  }

  seed.forEach(put);

  function all(): ClaimRecord[] {
    const out: ClaimRecord[] = [];
    order.forEach((id) => {
      const found = byId.get(id);
      if (found) out.push(found);
    });
    return out;
  }

  const repository: ClaimRepository = {
    async get(claimId) {
      return byId.get(claimId) ?? null;
    },
    async save(claim) {
      put(claim);
    },
    async listByMember(memberId) {
      return all().filter((c) => c.memberId === memberId);
    },
    async listByOrder(orderId) {
      return all().filter((c) => c.orderId === orderId);
    },
    async listOpen() {
      return all().filter((c) => CLOSED_CLAIM_STATES.indexOf(c.state) === -1);
    },
    async hasRefundKey(scope) {
      return refundKeys.has(scope);
    },
    async recordRefundKey(scope, refundReference) {
      refundKeys.set(scope, refundReference);
    },
  };
  Object.defineProperty(repository, MEMORY_CLAIM_STATE, {
    value: { byId, order, refundKeys } satisfies MemoryClaimState,
  });
  return repository;
}

export function createInMemoryClaimOrderRepository(
  seed: readonly ClaimOrderView[] = [],
): ClaimOrderRepository {
  const byId = new Map<string, ClaimOrderView>();
  seed.forEach((order) => byId.set(order.orderId, order));
  const repository: ClaimOrderRepository = {
    async get(orderId) {
      return byId.get(orderId) ?? null;
    },
    async save(order) {
      byId.set(order.orderId, order);
    },
  };
  Object.defineProperty(repository, MEMORY_ORDER_STATE, {
    value: { byId } satisfies MemoryOrderState,
  });
  return repository;
}

const MEMORY_CLAIM_STATE = Symbol("xenios.memory.claims");
const MEMORY_ORDER_STATE = Symbol("xenios.memory.claim-orders");

interface MemoryClaimState {
  byId: Map<string, ClaimRecord>;
  order: string[];
  refundKeys: Map<string, string>;
}

interface MemoryOrderState {
  byId: Map<string, ClaimOrderView>;
}

interface MemoryRefundCommand extends RefundCommand {
  adminId: string;
  expectedOrderState: OrderState;
  expectedRefundedCents: number;
  providerRefundReference: string | null;
  providerRefundedAmountCents: number | null;
  failureCode: string | null;
}

interface MemoryRefundCoordinator {
  commandsByScope: Map<string, MemoryRefundCommand>;
  commandsById: Map<string, MemoryRefundCommand>;
  tail: Promise<void>;
}

const MEMORY_COORDINATORS = new WeakMap<
  ClaimRepository,
  WeakMap<ClaimOrderRepository, MemoryRefundCoordinator>
>();

function memoryCoordinator(claims: ClaimRepository, orders: ClaimOrderRepository): MemoryRefundCoordinator {
  let byOrders = MEMORY_COORDINATORS.get(claims);
  if (!byOrders) {
    byOrders = new WeakMap();
    MEMORY_COORDINATORS.set(claims, byOrders);
  }
  let coordinator = byOrders.get(orders);
  if (!coordinator) {
    coordinator = { commandsByScope: new Map(), commandsById: new Map(), tail: Promise.resolve() };
    byOrders.set(orders, coordinator);
  }
  return coordinator;
}

async function withMemoryRefundLock<T>(
  coordinator: MemoryRefundCoordinator,
  action: () => Promise<T> | T,
): Promise<T> {
  const prior = coordinator.tail;
  let release!: () => void;
  coordinator.tail = new Promise<void>((resolve) => {
    release = resolve;
  });
  await prior;
  try {
    return await action();
  } finally {
    release();
  }
}

function publicCommand(command: MemoryRefundCommand): RefundCommand {
  return {
    commandId: command.commandId,
    claimId: command.claimId,
    orderId: command.orderId,
    memberId: command.memberId,
    clientIdempotencyKey: command.clientIdempotencyKey,
    providerIdempotencyKey: command.providerIdempotencyKey,
    providerName: command.providerName,
    paymentReference: command.paymentReference,
    amountCents: command.amountCents,
    state: command.state,
    attempt: command.attempt,
  };
}

function existingCommandOutcome(command: MemoryRefundCommand): RefundCommandResult {
  if (command.state === "applied") return { outcome: "applied", command: publicCommand(command) };
  if (command.state === "terminal_refused") {
    return { outcome: "terminal_refused", command: publicCommand(command) };
  }
  if (command.state === "provider_in_flight" || command.state === "reconciliation_required") {
    return { outcome: "reconciliation_required", command: publicCommand(command) };
  }
  return { outcome: "ready", command: publicCommand(command) };
}

export interface InspectableInMemoryRefundCommandStore extends RefundCommandStore {
  inspect(): RefundCommand[];
}

/**
 * Single-process reference for attack tests. Its command coordinator is shared
 * by every service built over the same in-memory claim + order repositories,
 * so restart/race tests exercise the same durable lifecycle shape as the RPC.
 */
export function createInMemoryRefundCommandStore(input: {
  claims: ClaimRepository;
  orders: ClaimOrderRepository;
}): InspectableInMemoryRefundCommandStore {
  const claimState = (input.claims as ClaimRepository & { [MEMORY_CLAIM_STATE]?: MemoryClaimState })[
    MEMORY_CLAIM_STATE
  ];
  const orderState = (input.orders as ClaimOrderRepository & { [MEMORY_ORDER_STATE]?: MemoryOrderState })[
    MEMORY_ORDER_STATE
  ];
  const coordinator = memoryCoordinator(input.claims, input.orders);

  const unavailable = (): RefundCommandResult => ({ outcome: "capability_disabled" });

  return {
    inspect: () => Array.from(coordinator.commandsById.values(), publicCommand),

    prepare(request) {
      return withMemoryRefundLock(coordinator, async () => {
        if (!claimState || !orderState) return unavailable();
        const scope = `${request.claimId}\u0000${request.clientIdempotencyKey}`;
        const existing = coordinator.commandsByScope.get(scope);
        if (existing) {
          if (
            existing.amountCents !== request.amountCents ||
            existing.providerName !== request.providerName
          ) {
            return { outcome: "idempotency_conflict" };
          }
          return existingCommandOutcome(existing);
        }

        const claim = claimState.byId.get(request.claimId);
        if (!claim) return { outcome: "order_not_found" };
        if (claim.state !== "approved") return { outcome: "order_state_invalid" };
        const order = orderState.byId.get(claim.orderId);
        if (!order || order.memberId !== claim.memberId) return { outcome: "order_not_found" };
        if (
          !Number.isInteger(request.amountCents) ||
          request.amountCents <= 0 ||
          order.paymentReference === null ||
          request.amountCents > order.capturedAmountCents - order.refundedCents
        ) {
          return { outcome: "payment_failed" };
        }
        if (
          TERMINAL_ORDER_STATES.has(order.state) ||
          !canTransitionOrder(order.state, "refunded", "admin")
        ) {
          return { outcome: "order_state_invalid" };
        }
        const anotherActive = Array.from(coordinator.commandsById.values()).some(
          (command) =>
            command.orderId === order.orderId &&
            command.state !== "applied" &&
            command.state !== "terminal_refused",
        );
        if (anotherActive) return { outcome: "refund_pending" };

        const digest = crypto
          .createHash("sha256")
          .update(
            [request.claimId, order.orderId, order.memberId, request.clientIdempotencyKey].join("|"),
            "utf8",
          )
          .digest("hex");
        const command: MemoryRefundCommand = {
          commandId: `refund_command_${digest.slice(0, 32)}`,
          claimId: request.claimId,
          orderId: order.orderId,
          memberId: order.memberId,
          clientIdempotencyKey: request.clientIdempotencyKey,
          providerIdempotencyKey: `xrrf_v1_${digest}`,
          providerName: request.providerName,
          paymentReference: order.paymentReference,
          amountCents: request.amountCents,
          state: "prepared",
          attempt: 0,
          adminId: request.adminId,
          expectedOrderState: order.state,
          expectedRefundedCents: order.refundedCents,
          providerRefundReference: null,
          providerRefundedAmountCents: null,
          failureCode: null,
        };
        coordinator.commandsByScope.set(scope, command);
        coordinator.commandsById.set(command.commandId, command);
        return { outcome: "ready", command: publicCommand(command) };
      });
    },

    claimProviderExecution(request) {
      return withMemoryRefundLock(coordinator, () => {
        const command = coordinator.commandsById.get(request.commandId);
        if (!command || command.providerIdempotencyKey !== request.providerIdempotencyKey) {
          return { outcome: "idempotency_conflict" };
        }
        if (command.state === "prepared" || command.state === "provider_retryable") {
          command.state = "provider_in_flight";
          command.attempt += 1;
          return { outcome: "execute", command: publicCommand(command) };
        }
        return existingCommandOutcome(command);
      });
    },

    recordProviderOutcome(request) {
      return withMemoryRefundLock(coordinator, () => {
        const command = coordinator.commandsById.get(request.commandId);
        if (
          !command ||
          command.providerIdempotencyKey !== request.providerIdempotencyKey ||
          command.attempt !== request.attempt
        ) {
          return { outcome: "idempotency_conflict" };
        }
        if (command.state === "applied") return { outcome: "applied", command: publicCommand(command) };
        if (command.state !== "provider_in_flight") return existingCommandOutcome(command);
        command.state =
          request.outcome === "safe_retryable"
            ? "provider_retryable"
            : request.outcome === "terminal_refused"
              ? "terminal_refused"
              : "reconciliation_required";
        command.failureCode = request.failureCode;
        command.providerRefundReference = request.providerRefundReference;
        command.providerRefundedAmountCents = request.providerRefundedAmountCents;
        return { outcome: request.outcome, command: publicCommand(command) };
      });
    },

    complete(request) {
      return withMemoryRefundLock(coordinator, () => {
        if (!claimState || !orderState) return unavailable();
        const command = coordinator.commandsById.get(request.commandId);
        if (
          !command ||
          command.providerIdempotencyKey !== request.providerIdempotencyKey ||
          command.attempt !== request.attempt
        ) {
          return { outcome: "idempotency_conflict" };
        }
        if (command.state === "applied") return { outcome: "applied", command: publicCommand(command) };
        if (
          command.state !== "provider_in_flight" &&
          command.state !== "reconciliation_required"
        ) {
          return existingCommandOutcome(command);
        }

        command.providerRefundReference = request.providerRefundReference;
        command.providerRefundedAmountCents = request.providerRefundedAmountCents;
        if (
          !boundedCommandText(request.providerRefundReference, 255) ||
          request.providerRefundedAmountCents !== command.amountCents
        ) {
          command.state = "reconciliation_required";
          command.failureCode = "INVALID_SUCCESS_PROOF";
          return { outcome: "reconciliation_required", command: publicCommand(command) };
        }

        const claim = claimState.byId.get(command.claimId);
        const order = orderState.byId.get(command.orderId);
        const moved = order
          ? transitionOrder({
              from: order.state,
              to: "refunded",
              actor: "admin",
              providerConfirmation: request.providerRefundReference,
              idempotencyKey: command.providerIdempotencyKey,
              lastAppliedIdempotencyKey: order.lastAppliedIdempotencyKey,
            })
          : null;
        if (
          !claim ||
          !order ||
          claim.state !== "approved" ||
          claim.orderId !== command.orderId ||
          claim.memberId !== command.memberId ||
          order.memberId !== command.memberId ||
          order.state !== command.expectedOrderState ||
          order.paymentReference !== command.paymentReference ||
          order.refundedCents !== command.expectedRefundedCents ||
          order.capturedAmountCents - order.refundedCents < command.amountCents ||
          !moved?.ok
        ) {
          command.state = "reconciliation_required";
          command.failureCode = "STALE_DOMAIN_SNAPSHOT";
          return { outcome: "reconciliation_required", command: publicCommand(command) };
        }

        // This synchronous block is the in-memory equivalent of the SQL RPC's
        // transaction: no await or injected crash can observe a partial publish.
        order.state = moved.state;
        order.refundedCents += command.amountCents;
        order.lastAppliedIdempotencyKey = command.providerIdempotencyKey;
        claim.state = "resolved";
        claim.resolution =
          order.refundedCents >= order.capturedAmountCents ? "refund" : "partial_refund";
        claim.reviewedBy = command.adminId;
        claimState.refundKeys.set(
          `${command.claimId}:${command.clientIdempotencyKey}`,
          request.providerRefundReference,
        );
        command.state = "applied";
        command.failureCode = null;
        return { outcome: "applied", command: publicCommand(command) };
      });
    },
  };
}
