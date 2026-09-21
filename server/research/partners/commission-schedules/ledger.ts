import { createHash } from "node:crypto";
import type { OrderSettlement } from "../../commerce/order-payment-fulfillment";
import {
  commissionPeriodWindow,
  customerAttributionEndsAt,
  eligibleNetCollectedRevenueCents,
  incrementalCommissionForBasis,
  initialProgramTermEndsAt,
  totalCommissionForBasis,
  validateCommissionRevenueBreakdown,
  validateCommissionReversalAllocation,
  type CommissionCalculation,
  type CommissionPeriodWindow,
  type CommissionRevenueBreakdown,
  type CommissionReversalAllocation,
  type CommissionScheduleSnapshot,
  type ProgramCommissionState,
} from "@shared/research/commission-schedules";
import type { CommissionScheduleAuthority, ResolvedCommissionSchedule } from "./authority";
import { scheduleSnapshotIsAuthentic } from "./hash";

export type CommissionRevenueLane = "product_channel" | "care_clinical";
export type CommissionTermMode = "initial_term" | "post_term_tail";
export type CommissionLedgerEventKind = "accrual" | "refund_reversal" | "chargeback_reversal";

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CanonicalCommissionAttribution = Readonly<{
  /** Opaque canonical account/customer binding key; contains no customer PII. */
  customerBindingKey: string;
  acceptedRelationshipReference: string;
  firstEligibleTransactionAt: string;
  activeManagementConfirmed: boolean;
}>;

/**
 * Projection returned by a trusted server adapter over canonical order,
 * attribution, relationship, pricing, and settlement authorities. It is never
 * accepted as an HTTP/service command payload.
 */
export type CanonicalCommissionAccrualFact = Readonly<{
  partnerId: string;
  orderId: string;
  /** UUID join to the canonical legacy commission/order ledger; never synthesized. */
  canonicalOrderId: string;
  /** Canonical committed money fact; raw browser payment evidence is not accepted. */
  settlement: OrderSettlement;
  revenueLane: CommissionRevenueLane;
  revenue: CommissionRevenueBreakdown;
  attribution: CanonicalCommissionAttribution;
  priceAuthorityReference: string;
}>;

/** Trusted server projection of a committed refund or chargeback. */
export type CanonicalCommissionReversalFact = Readonly<{
  orderId: string;
  originalSettlementRef: string;
  kind: "refund" | "chargeback";
  /** Canonical committed refund/chargeback money fact. Amount is positive. */
  adjustment: OrderSettlement;
  /** Canonical allocation of adjustment cash back to original settled components. */
  allocation: CommissionReversalAllocation;
  authorityReference: string;
}>;

export type CommissionAccrualCommand = Readonly<{ orderId: string }>;
export type CommissionReversalCommand = Readonly<{
  orderId: string;
  adjustmentSettlementRef: string;
}>;

export interface CanonicalCommissionFactSource {
  /** Must join canonical order, settled money, price, and attribution records. */
  loadAccrualFact(orderId: string): Promise<CanonicalCommissionAccrualFact | null>;
  /** Must load a committed refund/chargeback record, never request-body evidence. */
  loadReversalFact(
    orderId: string,
    adjustmentSettlementRef: string,
  ): Promise<CanonicalCommissionReversalFact | null>;
}

export type CommissionLedgerEntry = Readonly<{
  entryId: string;
  eventKind: CommissionLedgerEventKind;
  partnerId: string;
  orderId: string;
  canonicalOrderId: string;
  originalSettlementRef: string;
  reversesEntryId: string | null;
  moneyEvidence: OrderSettlement;
  bindingId: string;
  bindingAuthorityReference: string;
  programId: CommissionScheduleSnapshot["definition"]["programId"];
  scheduleVersion: number;
  scheduleHash: string;
  scheduleSnapshot: CommissionScheduleSnapshot;
  periodKey: string;
  period: CommissionPeriodWindow;
  termMode: CommissionTermMode;
  eligibleBasisDeltaCents: number;
  commissionDeltaCents: number;
  calculation: CommissionCalculation;
  revenueSnapshot: CommissionRevenueBreakdown | null;
  attributionSnapshot: CanonicalCommissionAttribution;
  priceAuthorityReference: string;
  reversalAuthorityReference: string | null;
  reversalAllocationSnapshot: CommissionReversalAllocation | null;
  initialState: ProgramCommissionState;
  occurredAt: string;
}>;

export type CommissionPeriodLedgerEvent = Readonly<{
  periodEventId: string;
  periodKey: string;
  revision: number;
  sourceEntryId: string;
  partnerId: string;
  bindingId: string;
  programId: CommissionLedgerEntry["programId"];
  scheduleVersion: number;
  scheduleHash: string;
  period: CommissionPeriodWindow;
  termMode: CommissionTermMode;
  eligibleBasisDeltaCents: number;
  commissionDeltaCents: number;
  cumulativeEligibleBasisCents: number;
  cumulativeCommissionCents: number;
  occurredAt: string;
}>;

export type CommissionLedgerDenialCode =
  | "invalid_request"
  | "idempotency_conflict"
  | "canonical_money_reused"
  | "canonical_money_amount_mismatch"
  | "partner_not_found"
  | "partner_not_active"
  | "program_binding_not_found"
  | "program_binding_ambiguous"
  | "program_binding_invalid"
  | "program_binding_not_effective"
  | "schedule_version_not_found"
  | "schedule_hash_mismatch"
  | "care_revenue_excluded"
  | "revenue_breakdown_invalid"
  | "reversal_allocation_invalid"
  | "reversal_allocation_mismatch"
  | "no_eligible_basis_reduction"
  | "reversal_exceeds_outstanding_basis"
  | "no_eligible_revenue"
  | "attribution_not_accepted"
  | "active_management_required"
  | "attribution_window_expired"
  | "program_term_ended"
  | "original_accrual_not_found"
  | "historical_schedule_invalid"
  | "no_outstanding_commission_basis"
  | "period_contention";

export type CommissionLedgerResult =
  | Readonly<{ ok: true; replayed: boolean; entry: CommissionLedgerEntry; periodEvent: CommissionPeriodLedgerEvent }>
  | Readonly<{ ok: false; code: CommissionLedgerDenialCode; issues?: readonly string[] }>;

export type StoredCommissionOperation = Readonly<{
  idempotencyKey: string;
  fingerprint: string;
  entry: CommissionLedgerEntry;
  periodEvent: CommissionPeriodLedgerEvent;
}>;

export type PeriodProjection = Readonly<{
  revision: number;
  cumulativeEligibleBasisCents: number;
  cumulativeCommissionCents: number;
}>;

export interface CommissionLedgerRepository {
  findOperation(idempotencyKey: string): Promise<StoredCommissionOperation | null>;
  findEntryByMoneyEvidenceRef(settlementRef: string): Promise<CommissionLedgerEntry | null>;
  findAccrualBySettlementRef(settlementRef: string): Promise<CommissionLedgerEntry | null>;
  listEntriesForSettlement(settlementRef: string): Promise<readonly CommissionLedgerEntry[]>;
  getPeriodProjection(periodKey: string): Promise<PeriodProjection>;
  /** Compare revision and append receipt, order event, and period event atomically. */
  commit(
    operation: StoredCommissionOperation,
    expectedPeriodRevision: number,
  ): Promise<
    "committed" | "replayed" | "idempotency_conflict" | "canonical_money_reused" | "period_contention"
  >;
  listEntries(): Promise<readonly CommissionLedgerEntry[]>;
  listPeriodEvents(): Promise<readonly CommissionPeriodLedgerEvent[]>;
}

export interface CommissionLedgerService {
  accrue(command: CommissionAccrualCommand): Promise<CommissionLedgerResult>;
  reverse(command: CommissionReversalCommand): Promise<CommissionLedgerResult>;
}

const VALID_STATE_TRANSITIONS: Readonly<Record<ProgramCommissionState, readonly ProgramCommissionState[]>> = {
  pending: ["held", "approved", "disputed", "reversed"],
  held: ["approved", "disputed", "reversed"],
  approved: ["payable", "disputed", "reversed"],
  payable: ["paid", "disputed", "reversed"],
  paid: ["disputed", "reversed"],
  disputed: ["held", "approved", "reversed"],
  reversed: [],
};

export function commissionStateTransitionAllowed(
  from: ProgramCommissionState,
  to: ProgramCommissionState,
  paymentEvidenceReference: string | null = null,
): boolean {
  if (!VALID_STATE_TRANSITIONS[from].includes(to)) return false;
  return to !== "paid" || (paymentEvidenceReference !== null && paymentEvidenceReference.trim().length > 0);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  ).join(",")}}`;
}

function hash(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function commissionRevenueSnapshotHash(value: CommissionRevenueBreakdown): string {
  return hash(value);
}

function deterministicUuid(value: unknown): string {
  const raw = hash(value).slice(0, 32).split("");
  raw[12] = "5";
  raw[16] = ((Number.parseInt(raw[16], 16) & 0x3) | 0x8).toString(16);
  const hex = raw.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function positiveSafeCents(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validSettlement(value: OrderSettlement): boolean {
  return value !== null && typeof value === "object" && value.currency === "USD" &&
    typeof value.settlementRef === "string" &&
    value.settlementRef.trim().length > 0 &&
    typeof value.externalTransactionRef === "string" &&
    value.externalTransactionRef.trim().length > 0 &&
    positiveSafeCents(value.amountCents) &&
    typeof value.settledAt === "string" && ISO_INSTANT.test(value.settledAt) &&
    Number.isFinite(Date.parse(value.settledAt));
}

function periodKey(
  bindingId: string,
  period: CommissionPeriodWindow,
  mode: CommissionTermMode,
): string {
  return `${bindingId}:${period.index}:${mode}`;
}

function scheduleAnchorAt(resolved: ResolvedCommissionSchedule): string {
  return resolved.schedule.measurementPeriod.anchor === "contract_effective_at"
    ? `${resolved.schedule.effectiveDate}T00:00:00.000Z`
    : resolved.binding.effectiveAt;
}

function resolveTermMode(
  resolved: ResolvedCommissionSchedule,
  settledAt: string,
): CommissionTermMode | null {
  const endsAt = initialProgramTermEndsAt(resolved.schedule, scheduleAnchorAt(resolved));
  if (endsAt === null) return null;
  if (Date.parse(settledAt) < Date.parse(endsAt)) return "initial_term";
  return resolved.schedule.postTermTailRatePolicy === null ? null : "post_term_tail";
}

function validateAttribution(
  resolved: ResolvedCommissionSchedule,
  input: CanonicalCommissionAccrualFact,
): CommissionLedgerDenialCode | null {
  const settledAt = Date.parse(input.settlement.settledAt);
  if (
    input.attribution === null || typeof input.attribution !== "object" ||
    typeof input.attribution.customerBindingKey !== "string" ||
    typeof input.attribution.acceptedRelationshipReference !== "string" ||
    typeof input.attribution.firstEligibleTransactionAt !== "string" ||
    !ISO_INSTANT.test(input.attribution.firstEligibleTransactionAt) ||
    typeof input.attribution.activeManagementConfirmed !== "boolean"
  ) return "attribution_not_accepted";
  const firstAt = Date.parse(input.attribution.firstEligibleTransactionAt);
  if (
    input.attribution.acceptedRelationshipReference.trim().length === 0 ||
    input.attribution.customerBindingKey.trim().length < 3 ||
    !Number.isFinite(firstAt) || firstAt > settledAt ||
    firstAt < Date.parse(resolved.binding.effectiveAt)
  ) return "attribution_not_accepted";
  if (
    resolved.schedule.customerAttribution.requiresActiveManagement &&
    !input.attribution.activeManagementConfirmed
  ) return "active_management_required";
  const end = customerAttributionEndsAt(
    resolved.schedule,
    input.attribution.firstEligibleTransactionAt,
  );
  if (end !== null && settledAt >= Date.parse(end)) return "attribution_window_expired";
  return null;
}

function validPeriodProjection(projection: PeriodProjection): boolean {
  return Number.isSafeInteger(projection.revision) && projection.revision >= 0 &&
    Number.isSafeInteger(projection.cumulativeEligibleBasisCents) &&
    projection.cumulativeEligibleBasisCents >= 0 &&
    Number.isSafeInteger(projection.cumulativeCommissionCents) &&
    projection.cumulativeCommissionCents >= 0;
}

function projectionMatchesSchedule(
  resolved: ResolvedCommissionSchedule,
  projection: PeriodProjection,
  termMode: CommissionTermMode,
): boolean {
  if (!validPeriodProjection(projection)) return false;
  try {
    return totalCommissionForBasis(
      resolved.schedule,
      projection.cumulativeEligibleBasisCents,
      termMode,
    ).commissionCents === projection.cumulativeCommissionCents;
  } catch {
    return false;
  }
}

function replayResult(operation: StoredCommissionOperation): CommissionLedgerResult {
  return { ok: true, replayed: true, entry: operation.entry, periodEvent: operation.periodEvent };
}

function immutable<T>(value: T): T {
  const clone = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    Object.values(candidate).forEach(freeze);
    Object.freeze(candidate);
  };
  freeze(clone);
  return clone;
}

function operationFingerprint(kind: string, input: unknown): string {
  return hash({ kind, input });
}

async function existingOperationResult(
  repository: CommissionLedgerRepository,
  idempotencyKey: string,
  fingerprint: string,
): Promise<CommissionLedgerResult | null> {
  const existing = await repository.findOperation(idempotencyKey);
  if (existing === null) return null;
  return existing.fingerprint === fingerprint
    ? replayResult(existing)
    : { ok: false, code: "idempotency_conflict" };
}

export function createCommissionLedgerService(deps: Readonly<{
  authority: CommissionScheduleAuthority;
  facts: CanonicalCommissionFactSource;
  repository: CommissionLedgerRepository;
}>): CommissionLedgerService {
  const service: CommissionLedgerService = {
    async accrue(command): Promise<CommissionLedgerResult> {
      if (command.orderId.trim().length === 0) return { ok: false, code: "invalid_request" };
      const input = await deps.facts.loadAccrualFact(command.orderId);
      if (input === null || input.orderId !== command.orderId) {
        return { ok: false, code: "invalid_request" };
      }
      if (
        !UUID.test(input.partnerId) || input.orderId.trim().length === 0 || !UUID.test(input.canonicalOrderId) ||
        input.priceAuthorityReference.trim().length === 0 || !validSettlement(input.settlement)
      ) return { ok: false, code: "invalid_request" };

      const key = `accrual:${input.settlement.settlementRef}`;
      const fingerprint = operationFingerprint("accrual", input);
      const replay = await existingOperationResult(deps.repository, key, fingerprint);
      if (replay !== null) return replay;
      if (await deps.repository.findEntryByMoneyEvidenceRef(input.settlement.settlementRef)) {
        return { ok: false, code: "canonical_money_reused" };
      }

      const resolution = await deps.authority.resolveForPartner({
        partnerId: input.partnerId,
        occurredAt: input.settlement.settledAt,
      });
      if (!resolution.ok) return { ok: false, code: resolution.code };
      const { binding, schedule, snapshot } = resolution.value;

      if (input.revenueLane === "care_clinical") {
        return { ok: false, code: "care_revenue_excluded" };
      }
      if (input.revenueLane !== "product_channel") {
        return { ok: false, code: "invalid_request" };
      }
      const issues = [...validateCommissionRevenueBreakdown(input.revenue)];
      [...input.revenue.preCollectionAdjustments, ...input.revenue.collectedExclusions]
        .forEach((exclusion, index) => {
        if (!schedule.exclusions.includes(exclusion.kind)) issues.push(`exclusion_${index}_not_authorized`);
        });
      if (issues.length > 0) return { ok: false, code: "revenue_breakdown_invalid", issues };
      if (input.revenue.settlementAmountCents !== input.settlement.amountCents) {
        return { ok: false, code: "canonical_money_amount_mismatch" };
      }
      const basisCents = eligibleNetCollectedRevenueCents(input.revenue);
      if (basisCents === 0) return { ok: false, code: "no_eligible_revenue" };
      const attributionDenial = validateAttribution(resolution.value, input);
      if (attributionDenial !== null) return { ok: false, code: attributionDenial };
      const termMode = resolveTermMode(resolution.value, input.settlement.settledAt);
      if (termMode === null) return { ok: false, code: "program_term_ended" };
      const period = commissionPeriodWindow(schedule, scheduleAnchorAt(resolution.value), input.settlement.settledAt);
      if (period === null) return { ok: false, code: "invalid_request" };
      const keyForPeriod = periodKey(binding.bindingId, period, termMode);

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const prior = await deps.repository.getPeriodProjection(keyForPeriod);
        if (!projectionMatchesSchedule(resolution.value, prior, termMode)) {
          return { ok: false, code: "historical_schedule_invalid" };
        }
        const calculation = incrementalCommissionForBasis(
          schedule,
          prior.cumulativeEligibleBasisCents,
          basisCents,
          termMode,
        );
        const entryId = deterministicUuid({ kind: "commission", key, fingerprint });
        const entry: CommissionLedgerEntry = immutable({
          entryId,
          eventKind: "accrual",
          partnerId: input.partnerId,
          orderId: input.orderId,
          canonicalOrderId: input.canonicalOrderId,
          originalSettlementRef: input.settlement.settlementRef,
          reversesEntryId: null,
          moneyEvidence: input.settlement,
          bindingId: binding.bindingId,
          bindingAuthorityReference: binding.authorityReference,
          programId: schedule.programId,
          scheduleVersion: schedule.version,
          scheduleHash: snapshot.scheduleHash,
          scheduleSnapshot: snapshot,
          periodKey: keyForPeriod,
          period,
          termMode,
          eligibleBasisDeltaCents: basisCents,
          commissionDeltaCents: calculation.commissionCents,
          calculation,
          revenueSnapshot: input.revenue,
          attributionSnapshot: input.attribution,
          priceAuthorityReference: input.priceAuthorityReference,
          reversalAuthorityReference: null,
          reversalAllocationSnapshot: null,
          initialState: "pending",
          occurredAt: input.settlement.settledAt,
        });
        const periodEvent: CommissionPeriodLedgerEvent = immutable({
          periodEventId: deterministicUuid({ kind: "commission_period", entryId, revision: prior.revision + 1 }),
          periodKey: keyForPeriod,
          revision: prior.revision + 1,
          sourceEntryId: entryId,
          partnerId: input.partnerId,
          bindingId: binding.bindingId,
          programId: schedule.programId,
          scheduleVersion: schedule.version,
          scheduleHash: snapshot.scheduleHash,
          period,
          termMode,
          eligibleBasisDeltaCents: basisCents,
          commissionDeltaCents: calculation.commissionCents,
          cumulativeEligibleBasisCents: prior.cumulativeEligibleBasisCents + basisCents,
          cumulativeCommissionCents: prior.cumulativeCommissionCents + calculation.commissionCents,
          occurredAt: input.settlement.settledAt,
        });
        const operation = immutable({ idempotencyKey: key, fingerprint, entry, periodEvent });
        const committed = await deps.repository.commit(operation, prior.revision);
        if (committed === "committed") return { ok: true, replayed: false, entry, periodEvent };
        if (committed === "replayed") {
          const found = await deps.repository.findOperation(key);
          if (found !== null && found.fingerprint === fingerprint) return replayResult(found);
        }
        if (committed === "idempotency_conflict") return { ok: false, code: "idempotency_conflict" };
        if (committed === "canonical_money_reused") return { ok: false, code: "canonical_money_reused" };
      }
      return { ok: false, code: "period_contention" };
    },

    async reverse(command): Promise<CommissionLedgerResult> {
      if (command.orderId.trim().length === 0 || command.adjustmentSettlementRef.trim().length === 0) {
        return { ok: false, code: "invalid_request" };
      }
      const input = await deps.facts.loadReversalFact(
        command.orderId,
        command.adjustmentSettlementRef,
      );
      if (
        input === null || input.orderId !== command.orderId ||
        input.adjustment.settlementRef !== command.adjustmentSettlementRef
      ) return { ok: false, code: "invalid_request" };
      if (
        (input.kind !== "refund" && input.kind !== "chargeback") ||
        input.orderId.trim().length === 0 || input.originalSettlementRef.trim().length === 0 ||
        input.authorityReference.trim().length === 0 || !validSettlement(input.adjustment)
      ) return { ok: false, code: "invalid_request" };
      const allocationIssues = validateCommissionReversalAllocation(
        input.allocation,
        input.adjustment.amountCents,
      );
      if (allocationIssues.length > 0) {
        return { ok: false, code: "reversal_allocation_invalid", issues: allocationIssues };
      }
      const key = `${input.kind}_reversal:${input.adjustment.settlementRef}`;
      const fingerprint = operationFingerprint(`${input.kind}_reversal`, input);
      const replay = await existingOperationResult(deps.repository, key, fingerprint);
      if (replay !== null) return replay;
      if (await deps.repository.findEntryByMoneyEvidenceRef(input.adjustment.settlementRef)) {
        return { ok: false, code: "canonical_money_reused" };
      }

      const original = await deps.repository.findAccrualBySettlementRef(input.originalSettlementRef);
      if (original === null || original.orderId !== input.orderId) {
        return { ok: false, code: "original_accrual_not_found" };
      }
      if (Date.parse(input.adjustment.settledAt) < Date.parse(original.occurredAt)) {
        return { ok: false, code: "invalid_request" };
      }
      if (!scheduleSnapshotIsAuthentic(original.scheduleSnapshot)) {
        return { ok: false, code: "historical_schedule_invalid" };
      }
      if (
        original.scheduleHash !== original.scheduleSnapshot.scheduleHash ||
        original.programId !== original.scheduleSnapshot.definition.programId ||
        original.scheduleVersion !== original.scheduleSnapshot.definition.version ||
        original.revenueSnapshot === null
      ) return { ok: false, code: "historical_schedule_invalid" };
      if (
        input.allocation.originalRevenueSnapshotHash !==
          commissionRevenueSnapshotHash(original.revenueSnapshot)
      ) return { ok: false, code: "reversal_allocation_mismatch" };
      const requestedBasisReduction = input.allocation.eligibleBasisReductionCents;
      if (requestedBasisReduction === 0) {
        return { ok: false, code: "no_eligible_basis_reduction" };
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        // Re-read the order balance on every optimistic retry. Two different
        // refund references may race on the same original settlement; carrying
        // a stale reduction across a period-contention retry could over-reverse.
        const settlementEntries = await deps.repository.listEntriesForSettlement(
          input.originalSettlementRef,
        );
        const outstandingBasisBigInt = settlementEntries.reduce(
          (total, entry) => total + BigInt(entry.eligibleBasisDeltaCents),
          0n,
        );
        if (
          outstandingBasisBigInt > BigInt(Number.MAX_SAFE_INTEGER) ||
          outstandingBasisBigInt < BigInt(Number.MIN_SAFE_INTEGER)
        ) return { ok: false, code: "historical_schedule_invalid" };
        const outstandingBasis = Number(outstandingBasisBigInt);
        if (outstandingBasis <= 0) {
          return { ok: false, code: "no_outstanding_commission_basis" };
        }
        if (requestedBasisReduction > outstandingBasis) {
          return { ok: false, code: "reversal_exceeds_outstanding_basis" };
        }
        const basisReduction = requestedBasisReduction;
        const prior = await deps.repository.getPeriodProjection(original.periodKey);
        if (!validPeriodProjection(prior) || prior.cumulativeEligibleBasisCents < basisReduction) {
          return { ok: false, code: "historical_schedule_invalid" };
        }
        const expectedBefore = totalCommissionForBasis(
          original.scheduleSnapshot.definition,
          prior.cumulativeEligibleBasisCents,
          original.termMode,
        );
        if (expectedBefore.commissionCents !== prior.cumulativeCommissionCents) {
          return { ok: false, code: "historical_schedule_invalid" };
        }
        const after = totalCommissionForBasis(
          original.scheduleSnapshot.definition,
          prior.cumulativeEligibleBasisCents - basisReduction,
          original.termMode,
        );
        const commissionDeltaCents = after.commissionCents - prior.cumulativeCommissionCents;
        const calculation: CommissionCalculation = immutable({
          eligibleBasisCents: basisReduction,
          commissionCents: Math.abs(commissionDeltaCents),
          components: [],
        });
        const entryId = deterministicUuid({ kind: "commission", key, fingerprint });
        const entry: CommissionLedgerEntry = immutable({
          entryId,
          eventKind: input.kind === "refund" ? "refund_reversal" : "chargeback_reversal",
          partnerId: original.partnerId,
          orderId: original.orderId,
          canonicalOrderId: original.canonicalOrderId,
          originalSettlementRef: original.originalSettlementRef,
          reversesEntryId: original.entryId,
          moneyEvidence: input.adjustment,
          bindingId: original.bindingId,
          bindingAuthorityReference: original.bindingAuthorityReference,
          programId: original.programId,
          scheduleVersion: original.scheduleVersion,
          scheduleHash: original.scheduleHash,
          scheduleSnapshot: original.scheduleSnapshot,
          periodKey: original.periodKey,
          period: original.period,
          termMode: original.termMode,
          eligibleBasisDeltaCents: -basisReduction,
          commissionDeltaCents,
          calculation,
          revenueSnapshot: null,
          attributionSnapshot: original.attributionSnapshot,
          priceAuthorityReference: original.priceAuthorityReference,
          reversalAuthorityReference: input.authorityReference,
          reversalAllocationSnapshot: input.allocation,
          initialState: "reversed",
          occurredAt: input.adjustment.settledAt,
        });
        const periodEvent: CommissionPeriodLedgerEvent = immutable({
          periodEventId: deterministicUuid({ kind: "commission_period", entryId, revision: prior.revision + 1 }),
          periodKey: original.periodKey,
          revision: prior.revision + 1,
          sourceEntryId: entryId,
          partnerId: original.partnerId,
          bindingId: original.bindingId,
          programId: original.programId,
          scheduleVersion: original.scheduleVersion,
          scheduleHash: original.scheduleHash,
          period: original.period,
          termMode: original.termMode,
          eligibleBasisDeltaCents: -basisReduction,
          commissionDeltaCents,
          cumulativeEligibleBasisCents: prior.cumulativeEligibleBasisCents - basisReduction,
          cumulativeCommissionCents: after.commissionCents,
          occurredAt: input.adjustment.settledAt,
        });
        const operation = immutable({ idempotencyKey: key, fingerprint, entry, periodEvent });
        const committed = await deps.repository.commit(operation, prior.revision);
        if (committed === "committed") return { ok: true, replayed: false, entry, periodEvent };
        if (committed === "replayed") {
          const found = await deps.repository.findOperation(key);
          if (found !== null && found.fingerprint === fingerprint) return replayResult(found);
        }
        if (committed === "idempotency_conflict") return { ok: false, code: "idempotency_conflict" };
        if (committed === "canonical_money_reused") return { ok: false, code: "canonical_money_reused" };
      }
      return { ok: false, code: "period_contention" };
    },
  };
  return Object.freeze(service);
}

export function createInMemoryCommissionLedgerRepository(): CommissionLedgerRepository {
  const operations = new Map<string, StoredCommissionOperation>();
  const entries: CommissionLedgerEntry[] = [];
  const periodEvents: CommissionPeriodLedgerEvent[] = [];
  const repository: CommissionLedgerRepository = {
    async findOperation(idempotencyKey) {
      return operations.get(idempotencyKey) ?? null;
    },
    async findEntryByMoneyEvidenceRef(settlementRef) {
      return entries.find((entry) => entry.moneyEvidence.settlementRef === settlementRef) ?? null;
    },
    async findAccrualBySettlementRef(settlementRef) {
      return entries.find((entry) =>
        entry.eventKind === "accrual" && entry.originalSettlementRef === settlementRef
      ) ?? null;
    },
    async listEntriesForSettlement(settlementRef) {
      return entries.filter((entry) => entry.originalSettlementRef === settlementRef);
    },
    async getPeriodProjection(key) {
      const latest = periodEvents
        .filter((event) => event.periodKey === key)
        .sort((left, right) => right.revision - left.revision)[0];
      return latest === undefined
        ? { revision: 0, cumulativeEligibleBasisCents: 0, cumulativeCommissionCents: 0 }
        : {
            revision: latest.revision,
            cumulativeEligibleBasisCents: latest.cumulativeEligibleBasisCents,
            cumulativeCommissionCents: latest.cumulativeCommissionCents,
          };
    },
    async commit(operation, expectedPeriodRevision) {
      const existing = operations.get(operation.idempotencyKey);
      if (existing !== undefined) {
        return existing.fingerprint === operation.fingerprint ? "replayed" : "idempotency_conflict";
      }
      const latestEvent = periodEvents
        .filter((event) => event.periodKey === operation.periodEvent.periodKey)
        .sort((left, right) => right.revision - left.revision)[0];
      const latestRevision = latestEvent?.revision ?? 0;
      if (
        latestRevision !== expectedPeriodRevision ||
        (latestEvent !== undefined &&
          Date.parse(operation.periodEvent.occurredAt) < Date.parse(latestEvent.occurredAt))
      ) return "period_contention";
      operations.set(operation.idempotencyKey, operation);
      entries.push(operation.entry);
      periodEvents.push(operation.periodEvent);
      return "committed";
    },
    async listEntries() {
      return [...entries];
    },
    async listPeriodEvents() {
      return [...periodEvents];
    },
  };
  return Object.freeze(repository);
}
