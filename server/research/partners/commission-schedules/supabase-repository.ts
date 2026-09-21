import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROGRAM_COMMISSION_STATES,
  commissionScheduleDefinition,
  eligibleNetCollectedRevenueCents,
  validateCommissionRevenueBreakdown,
  validateCommissionReversalAllocation,
  type CommissionCalculation,
  type CommissionPeriodWindow,
  type CommissionRevenueBreakdown,
  type CommissionReversalAllocation,
  type CommissionScheduleSnapshot,
  type ProgramCommissionState,
} from "@shared/research/commission-schedules";
import { getSupabaseAdmin } from "../../../supabase";
import {
  createInMemoryCommissionProgramBindingRepository,
  type CommissionProgramBinding,
  type CommissionProgramBindingLifecycleEvent,
  type CommissionProgramBindingRepository,
} from "./authority";
import {
  commissionStateTransitionAllowed,
  type CommissionLedgerEntry,
  type CommissionLedgerRepository,
  type CommissionPeriodLedgerEvent,
  type StoredCommissionOperation,
} from "./ledger";
import { createCommissionScheduleSnapshot, scheduleSnapshotIsAuthentic } from "./hash";

const LEDGER_TABLE = "research_commission_ledger";
const PERIOD_TABLE = "research_commission_period_ledger";
const BINDING_TABLE = "research_partner_commission_program_bindings";
const BINDING_EVENT_TABLE = "research_partner_commission_program_binding_events";
const COMMIT_RPC = "research_program_commission_commit";
const TRANSITION_RPC = "research_program_commission_transition";
const BIND_RPC = "research_program_commission_bind";
const TERMINATE_BINDING_RPC = "research_program_commission_terminate_binding";
const LEDGER_SELECT = [
  "id", "partner_id", "order_id", "program_binding_id", "program_id", "schedule_version",
  "schedule_hash", "canonical_order_reference", "idempotency_key", "operation_fingerprint",
  "settlement_reference", "original_settlement_reference", "event_kind", "period_key",
  "period_index", "term_mode", "eligible_basis_delta_cents", "commission_delta_cents",
  "entry_snapshot", "occurred_at", "created_at",
].join(",");
const PERIOD_SELECT = [
  "id", "period_key", "source_ledger_id", "revision", "eligible_basis_delta_cents",
  "commission_delta_cents", "cumulative_eligible_basis_cents", "cumulative_commission_cents",
  "event_snapshot", "occurred_at",
].join(",");
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const source = value as Record<string, unknown>;
  return `{${Object.keys(source).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(source[key])}`
  ).join(",")}}`;
}

function persistenceFingerprint(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

type LedgerSnapshotRow = Readonly<{
  id: string;
  partner_id: string;
  order_id: string;
  program_binding_id: string;
  program_id: string;
  schedule_version: number;
  schedule_hash: string;
  canonical_order_reference: string;
  idempotency_key: string;
  operation_fingerprint: string;
  settlement_reference: string;
  original_settlement_reference: string;
  event_kind: string;
  period_key: string;
  period_index: number;
  term_mode: string;
  eligible_basis_delta_cents: number | string;
  commission_delta_cents: number | string;
  entry_snapshot: unknown;
  occurred_at: string;
  created_at: string;
}>;

type PeriodSnapshotRow = Readonly<{
  id: string;
  period_key: string;
  source_ledger_id: string;
  revision: number;
  eligible_basis_delta_cents: number | string;
  commission_delta_cents: number | string;
  cumulative_eligible_basis_cents: number | string;
  cumulative_commission_cents: number | string;
  event_snapshot: unknown;
  occurred_at: string;
}>;

function immutable<T>(value: T): T {
  const copy = structuredClone(value);
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== "object" || Object.isFrozen(candidate)) return;
    Object.values(candidate).forEach(freeze);
    Object.freeze(candidate);
  };
  freeze(copy);
  return copy;
}

function asStoredInteger(
  value: number | string,
  field: string,
  minimum = Number.MIN_SAFE_INTEGER,
): number {
  if (typeof value === "string" && !/^-?(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  return parsed;
}

function asSafeCents(value: number | string, field: string): number {
  return asStoredInteger(value, field, 0);
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  return value as Record<string, unknown>;
}

function textValue(value: unknown, field: string, minimumLength = 1): string {
  if (typeof value !== "string" || value.trim().length < minimumLength) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  return value;
}

function uuidValue(value: unknown, field: string): string {
  const parsed = textValue(value, field);
  if (!UUID.test(parsed)) throw new Error(`commission persistence returned invalid ${field}`);
  return parsed;
}

function instantValue(value: unknown, field: string): string {
  const parsed = textValue(value, field);
  if (!ISO_INSTANT.test(parsed) || !Number.isFinite(Date.parse(parsed))) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  return parsed;
}

function safeInteger(value: unknown, field: string, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`commission persistence returned invalid ${field}`);
  }
  return value;
}

function nullableText(value: unknown, field: string, minimumLength = 1): string | null {
  return value === null ? null : textValue(value, field, minimumLength);
}

function asPeriodWindow(value: unknown): CommissionPeriodWindow {
  const source = record(value, "period window");
  const period: CommissionPeriodWindow = {
    index: safeInteger(source.index, "period index", 0),
    startsAt: instantValue(source.startsAt, "period start"),
    endsAt: instantValue(source.endsAt, "period end"),
  };
  if (Date.parse(period.endsAt) <= Date.parse(period.startsAt)) {
    throw new Error("commission persistence returned invalid period boundary");
  }
  return period;
}

function asScheduleSnapshot(value: unknown): CommissionScheduleSnapshot {
  const source = record(value, "schedule snapshot");
  const definition = record(source.definition, "schedule definition") as unknown as CommissionScheduleSnapshot["definition"];
  const scheduleHash = textValue(source.scheduleHash, "schedule hash");
  if (source.hashAlgorithm !== "sha256" || !SHA256.test(scheduleHash)) {
    throw new Error("commission persistence returned invalid schedule snapshot metadata");
  }
  const expected = commissionScheduleDefinition(
    textValue(definition.programId, "schedule program"),
    safeInteger(definition.version, "schedule version", 1),
  );
  const snapshot = { definition, hashAlgorithm: "sha256" as const, scheduleHash };
  let authentic = false;
  try {
    authentic = expected !== null && scheduleSnapshotIsAuthentic(snapshot) &&
      createCommissionScheduleSnapshot(expected).scheduleHash === scheduleHash;
  } catch {
    authentic = false;
  }
  if (!authentic) throw new Error("commission persistence returned unauthentic schedule snapshot");
  return snapshot;
}

function asCalculation(value: unknown, basisCents: number, commissionCents: number): CommissionCalculation {
  const source = record(value, "calculation snapshot");
  if (
    safeInteger(source.eligibleBasisCents, "calculation basis", 0) !== basisCents ||
    safeInteger(source.commissionCents, "calculation commission", 0) !== commissionCents ||
    !Array.isArray(source.components)
  ) throw new Error("commission persistence returned an inconsistent calculation snapshot");
  source.components.forEach((component, index) => {
    const item = record(component, `calculation component ${index}`);
    safeInteger(item.basisCents, `calculation component ${index} basis`, 0);
    safeInteger(item.rateBasisPoints, `calculation component ${index} rate`, 0, 10_000);
    safeInteger(item.commissionCents, `calculation component ${index} commission`, 0);
  });
  return source as unknown as CommissionCalculation;
}

function asLedgerEntry(value: unknown): CommissionLedgerEntry {
  const source = record(value, "entry snapshot");
  const entryId = uuidValue(source.entryId, "entry id");
  const partnerId = uuidValue(source.partnerId, "partner id");
  const canonicalOrderId = uuidValue(source.canonicalOrderId, "canonical order id");
  const bindingId = uuidValue(source.bindingId, "binding id");
  const orderId = textValue(source.orderId, "order id");
  const originalSettlementRef = textValue(source.originalSettlementRef, "original settlement reference");
  const eventKind = source.eventKind;
  if (eventKind !== "accrual" && eventKind !== "refund_reversal" && eventKind !== "chargeback_reversal") {
    throw new Error("commission persistence returned invalid event kind");
  }
  const scheduleSnapshot = asScheduleSnapshot(source.scheduleSnapshot);
  const programId = textValue(source.programId, "program id");
  const scheduleVersion = safeInteger(source.scheduleVersion, "schedule version", 1);
  const scheduleHash = textValue(source.scheduleHash, "schedule hash");
  if (
    programId !== scheduleSnapshot.definition.programId ||
    scheduleVersion !== scheduleSnapshot.definition.version ||
    scheduleHash !== scheduleSnapshot.scheduleHash
  ) throw new Error("commission persistence returned mismatched schedule identity");
  const period = asPeriodWindow(source.period);
  const termMode = source.termMode;
  if (termMode !== "initial_term" && termMode !== "post_term_tail") {
    throw new Error("commission persistence returned invalid term mode");
  }
  const periodKey = textValue(source.periodKey, "period key");
  if (periodKey !== `${bindingId}:${period.index}:${termMode}`) {
    throw new Error("commission persistence returned mismatched period key");
  }
  const eligibleBasisDeltaCents = safeInteger(
    source.eligibleBasisDeltaCents,
    "eligible basis delta",
    Number.MIN_SAFE_INTEGER,
  );
  const commissionDeltaCents = safeInteger(
    source.commissionDeltaCents,
    "commission delta",
    Number.MIN_SAFE_INTEGER,
  );
  if (eligibleBasisDeltaCents === 0) {
    throw new Error("commission persistence returned zero eligible basis delta");
  }
  const money = record(source.moneyEvidence, "money evidence");
  if (money.currency !== "USD") throw new Error("commission persistence returned non-USD money evidence");
  const moneyEvidence = {
    settlementRef: textValue(money.settlementRef, "settlement reference"),
    externalTransactionRef: textValue(money.externalTransactionRef, "external transaction reference"),
    amountCents: safeInteger(money.amountCents, "settlement amount", 1),
    currency: "USD" as const,
    settledAt: instantValue(money.settledAt, "settlement instant"),
  };
  const occurredAt = instantValue(source.occurredAt, "entry occurrence");
  if (occurredAt !== moneyEvidence.settledAt) {
    throw new Error("commission persistence returned mismatched money occurrence");
  }
  const attribution = record(source.attributionSnapshot, "attribution snapshot");
  const activeManagementConfirmed = attribution.activeManagementConfirmed;
  if (typeof activeManagementConfirmed !== "boolean") {
    throw new Error("commission persistence returned invalid active-management evidence");
  }
  const attributionSnapshot = {
    customerBindingKey: textValue(attribution.customerBindingKey, "customer binding key", 3),
    acceptedRelationshipReference: textValue(
      attribution.acceptedRelationshipReference,
      "accepted relationship reference",
    ),
    firstEligibleTransactionAt: instantValue(
      attribution.firstEligibleTransactionAt,
      "first eligible transaction instant",
    ),
    activeManagementConfirmed,
  };
  if (Date.parse(attributionSnapshot.firstEligibleTransactionAt) > Date.parse(occurredAt)) {
    throw new Error("commission persistence returned future attribution evidence");
  }
  const calculation = asCalculation(
    source.calculation,
    Math.abs(eligibleBasisDeltaCents),
    Math.abs(commissionDeltaCents),
  );
  const initialState = source.initialState;
  if (!(PROGRAM_COMMISSION_STATES as readonly unknown[]).includes(initialState)) {
    throw new Error("commission persistence returned invalid initial state");
  }

  let revenueSnapshot: CommissionRevenueBreakdown | null = null;
  let reversalAllocationSnapshot: CommissionReversalAllocation | null = null;
  if (eventKind === "accrual") {
    if (
      eligibleBasisDeltaCents <= 0 || commissionDeltaCents < 0 || initialState !== "pending" ||
      source.reversesEntryId !== null || source.reversalAuthorityReference !== null ||
      source.reversalAllocationSnapshot !== null || originalSettlementRef !== moneyEvidence.settlementRef
    ) throw new Error("commission persistence returned invalid accrual topology");
    revenueSnapshot = record(source.revenueSnapshot, "revenue snapshot") as unknown as CommissionRevenueBreakdown;
    if (
      validateCommissionRevenueBreakdown(revenueSnapshot).length > 0 ||
      revenueSnapshot.settlementAmountCents !== moneyEvidence.amountCents ||
      eligibleNetCollectedRevenueCents(revenueSnapshot) !== eligibleBasisDeltaCents ||
      occurredAt < period.startsAt || occurredAt >= period.endsAt
    ) throw new Error("commission persistence returned invalid accrual revenue snapshot");
  } else {
    if (
      eligibleBasisDeltaCents >= 0 || commissionDeltaCents > 0 || initialState !== "reversed" ||
      source.revenueSnapshot !== null
    ) throw new Error("commission persistence returned invalid reversal topology");
    uuidValue(source.reversesEntryId, "reversed entry id");
    textValue(source.reversalAuthorityReference, "reversal authority reference", 3);
    reversalAllocationSnapshot = record(
      source.reversalAllocationSnapshot,
      "reversal allocation snapshot",
    ) as unknown as CommissionReversalAllocation;
    if (
      validateCommissionReversalAllocation(
        reversalAllocationSnapshot,
        moneyEvidence.amountCents,
      ).length > 0 ||
      reversalAllocationSnapshot.eligibleBasisReductionCents !== -eligibleBasisDeltaCents ||
      !SHA256.test(reversalAllocationSnapshot.originalRevenueSnapshotHash)
    ) throw new Error("commission persistence returned invalid reversal allocation snapshot");
  }

  return immutable({
    entryId,
    eventKind,
    partnerId,
    orderId,
    canonicalOrderId,
    originalSettlementRef,
    reversesEntryId: source.reversesEntryId as string | null,
    moneyEvidence,
    bindingId,
    bindingAuthorityReference: textValue(
      source.bindingAuthorityReference,
      "binding authority reference",
      3,
    ),
    programId: programId as CommissionLedgerEntry["programId"],
    scheduleVersion,
    scheduleHash,
    scheduleSnapshot,
    periodKey,
    period,
    termMode,
    eligibleBasisDeltaCents,
    commissionDeltaCents,
    calculation,
    revenueSnapshot,
    attributionSnapshot,
    priceAuthorityReference: textValue(source.priceAuthorityReference, "price authority reference", 3),
    reversalAuthorityReference: nullableText(
      source.reversalAuthorityReference,
      "reversal authority reference",
      3,
    ),
    reversalAllocationSnapshot,
    initialState: initialState as ProgramCommissionState,
    occurredAt,
  });
}

function asPeriodEvent(value: unknown): CommissionPeriodLedgerEvent {
  const source = record(value, "period snapshot");
  const periodEventId = uuidValue(source.periodEventId, "period event id");
  const sourceEntryId = uuidValue(source.sourceEntryId, "period source entry id");
  const partnerId = uuidValue(source.partnerId, "period partner id");
  const bindingId = uuidValue(source.bindingId, "period binding id");
  const period = asPeriodWindow(source.period);
  const termMode = source.termMode;
  if (termMode !== "initial_term" && termMode !== "post_term_tail") {
    throw new Error("commission persistence returned invalid period term mode");
  }
  const periodKey = textValue(source.periodKey, "period key");
  if (periodKey !== `${bindingId}:${period.index}:${termMode}`) {
    throw new Error("commission persistence returned mismatched period event key");
  }
  const programId = textValue(source.programId, "period program id");
  const scheduleVersion = safeInteger(source.scheduleVersion, "period schedule version", 1);
  const scheduleHash = textValue(source.scheduleHash, "period schedule hash");
  const definition = commissionScheduleDefinition(programId, scheduleVersion);
  if (
    definition === null || !SHA256.test(scheduleHash) ||
    createCommissionScheduleSnapshot(definition).scheduleHash !== scheduleHash
  ) {
    throw new Error("commission persistence returned invalid period schedule identity");
  }
  const eligibleBasisDeltaCents = safeInteger(
    source.eligibleBasisDeltaCents,
    "period eligible basis delta",
    Number.MIN_SAFE_INTEGER,
  );
  const commissionDeltaCents = safeInteger(
    source.commissionDeltaCents,
    "period commission delta",
    Number.MIN_SAFE_INTEGER,
  );
  if (eligibleBasisDeltaCents === 0) throw new Error("commission persistence returned zero period delta");
  return immutable({
    periodEventId,
    periodKey,
    revision: safeInteger(source.revision, "period revision", 1),
    sourceEntryId,
    partnerId,
    bindingId,
    programId: programId as CommissionPeriodLedgerEvent["programId"],
    scheduleVersion,
    scheduleHash,
    period,
    termMode,
    eligibleBasisDeltaCents,
    commissionDeltaCents,
    cumulativeEligibleBasisCents: safeInteger(
      source.cumulativeEligibleBasisCents,
      "cumulative eligible basis",
      0,
    ),
    cumulativeCommissionCents: safeInteger(
      source.cumulativeCommissionCents,
      "cumulative commission",
      0,
    ),
    occurredAt: instantValue(source.occurredAt, "period occurrence"),
  });
}

function entryFromRow(value: unknown): CommissionLedgerEntry {
  const source = record(value, "ledger row");
  const entry = asLedgerEntry(source.entry_snapshot);
  if (
    uuidValue(source.id, "ledger row id") !== entry.entryId ||
    uuidValue(source.partner_id, "ledger row partner id") !== entry.partnerId ||
    uuidValue(source.order_id, "ledger row canonical order id") !== entry.canonicalOrderId ||
    uuidValue(source.program_binding_id, "ledger row binding id") !== entry.bindingId ||
    source.program_id !== entry.programId ||
    safeInteger(source.schedule_version, "ledger row schedule version", 1) !== entry.scheduleVersion ||
    source.schedule_hash !== entry.scheduleHash ||
    source.canonical_order_reference !== entry.orderId ||
    textValue(source.idempotency_key, "ledger idempotency key", 3).trim().length < 3 ||
    !SHA256.test(textValue(source.operation_fingerprint, "ledger operation fingerprint")) ||
    textValue(source.settlement_reference, "ledger settlement reference") !==
      entry.moneyEvidence.settlementRef ||
    textValue(source.original_settlement_reference, "ledger original settlement reference") !==
      entry.originalSettlementRef ||
    source.event_kind !== entry.eventKind ||
    source.period_key !== entry.periodKey ||
    safeInteger(source.period_index, "ledger row period index", 0) !== entry.period.index ||
    source.term_mode !== entry.termMode ||
    asStoredInteger(
      source.eligible_basis_delta_cents as number | string,
      "ledger row eligible basis delta",
    ) !== entry.eligibleBasisDeltaCents ||
    asStoredInteger(
      source.commission_delta_cents as number | string,
      "ledger row commission delta",
    ) !== entry.commissionDeltaCents ||
    new Date(textValue(source.occurred_at, "ledger row occurrence")).toISOString() !==
      entry.occurredAt ||
    !Number.isFinite(Date.parse(textValue(source.created_at, "ledger recorded instant")))
  ) throw new Error("commission persistence returned a ledger row/snapshot mismatch");
  return entry;
}

function periodEventFromRow(value: unknown): CommissionPeriodLedgerEvent {
  const source = record(value, "period row");
  const event = asPeriodEvent(source.event_snapshot);
  if (
    uuidValue(source.id, "period row id") !== event.periodEventId ||
    textValue(source.period_key, "stored period key") !== event.periodKey ||
    uuidValue(source.source_ledger_id, "period source ledger id") !== event.sourceEntryId ||
    safeInteger(source.revision, "stored period revision", 1) !== event.revision ||
    asStoredInteger(
      source.eligible_basis_delta_cents as number | string,
      "stored period eligible basis delta",
    ) !== event.eligibleBasisDeltaCents ||
    asStoredInteger(
      source.commission_delta_cents as number | string,
      "stored period commission delta",
    ) !== event.commissionDeltaCents ||
    asSafeCents(source.cumulative_eligible_basis_cents as number | string, "stored cumulative basis") !==
      event.cumulativeEligibleBasisCents ||
    asSafeCents(source.cumulative_commission_cents as number | string, "stored cumulative commission") !==
      event.cumulativeCommissionCents ||
    new Date(textValue(source.occurred_at, "stored period occurrence")).toISOString() !==
      event.occurredAt
  ) throw new Error("commission persistence returned a period row/snapshot mismatch");
  return event;
}

function assertPairedSnapshots(
  entry: CommissionLedgerEntry,
  periodEvent: CommissionPeriodLedgerEvent,
): void {
  if (
    periodEvent.sourceEntryId !== entry.entryId || periodEvent.partnerId !== entry.partnerId ||
    periodEvent.bindingId !== entry.bindingId || periodEvent.programId !== entry.programId ||
    periodEvent.scheduleVersion !== entry.scheduleVersion ||
    periodEvent.scheduleHash !== entry.scheduleHash || periodEvent.periodKey !== entry.periodKey ||
    periodEvent.termMode !== entry.termMode || periodEvent.eligibleBasisDeltaCents !== entry.eligibleBasisDeltaCents ||
    periodEvent.commissionDeltaCents !== entry.commissionDeltaCents ||
    JSON.stringify(periodEvent.period) !== JSON.stringify(entry.period) ||
    periodEvent.occurredAt !== entry.occurredAt
  ) throw new Error("commission persistence returned unpaired ledger and period snapshots");
}

async function periodEventForLedger(
  client: SupabaseClient,
  ledgerId: string,
): Promise<CommissionPeriodLedgerEvent> {
  const found = await client.from(PERIOD_TABLE)
    .select(PERIOD_SELECT)
    .eq("source_ledger_id", ledgerId)
    .maybeSingle();
  if (found.error) throw new Error(`commission period event load failed: ${found.error.message}`);
  if (found.data === null) throw new Error("commission persistence is missing the paired period event");
  return periodEventFromRow(found.data);
}

/**
 * Durable repository backed only by the reviewed atomic SQL RPC. There is no
 * in-memory fallback: a missing candidate function or schema error fails the
 * money operation closed.
 */
export function createSupabaseProgramCommissionLedgerRepository(
  client: SupabaseClient = getSupabaseAdmin(),
): CommissionLedgerRepository {
  async function oneLedgerBy(column: string, value: string): Promise<LedgerSnapshotRow | null> {
    const found = await client.from(LEDGER_TABLE)
      .select(LEDGER_SELECT)
      .eq(column, value)
      .maybeSingle();
    if (found.error) throw new Error(`commission ledger load failed: ${found.error.message}`);
    return (found.data as LedgerSnapshotRow | null) ?? null;
  }

  async function ledgerRowsBy(column: string, value: string): Promise<LedgerSnapshotRow[]> {
    const found = await client.from(LEDGER_TABLE)
      .select(LEDGER_SELECT)
      .eq(column, value)
      .order("created_at", { ascending: true });
    if (found.error) throw new Error(`commission ledger list failed: ${found.error.message}`);
    return ((found.data ?? []) as unknown as LedgerSnapshotRow[]).slice();
  }

  return Object.freeze({
    async findOperation(idempotencyKey: string) {
      const row = await oneLedgerBy("idempotency_key", idempotencyKey);
      if (row === null) return null;
      if (row.idempotency_key !== idempotencyKey) {
        throw new Error("commission persistence returned a mismatched idempotency row");
      }
      const entry = entryFromRow(row);
      const periodEvent = await periodEventForLedger(client, row.id);
      assertPairedSnapshots(entry, periodEvent);
      return immutable({
        idempotencyKey: row.idempotency_key,
        fingerprint: row.operation_fingerprint,
        entry,
        periodEvent,
      });
    },
    async findEntryByMoneyEvidenceRef(settlementRef: string) {
      const row = await oneLedgerBy("settlement_reference", settlementRef);
      if (row === null) return null;
      const entry = entryFromRow(row);
      if (entry.moneyEvidence.settlementRef !== settlementRef) {
        throw new Error("commission persistence returned a mismatched money-evidence row");
      }
      return entry;
    },
    async findAccrualBySettlementRef(settlementRef: string) {
      const found = await client.from(LEDGER_TABLE)
        .select(LEDGER_SELECT)
        .eq("original_settlement_reference", settlementRef)
        .eq("event_kind", "accrual")
        .maybeSingle();
      if (found.error) throw new Error(`commission accrual load failed: ${found.error.message}`);
      const row = (found.data as LedgerSnapshotRow | null) ?? null;
      if (row === null) return null;
      const entry = entryFromRow(row);
      if (entry.eventKind !== "accrual" || entry.originalSettlementRef !== settlementRef) {
        throw new Error("commission persistence returned a mismatched accrual row");
      }
      return entry;
    },
    async listEntriesForSettlement(settlementRef: string) {
      const entries = (await ledgerRowsBy("original_settlement_reference", settlementRef))
        .map(entryFromRow);
      if (entries.some((entry) => entry.originalSettlementRef !== settlementRef)) {
        throw new Error("commission persistence returned a mismatched settlement history");
      }
      return entries;
    },
    async getPeriodProjection(periodKey: string) {
      const found = await client.from(PERIOD_TABLE)
        .select(PERIOD_SELECT)
        .eq("period_key", periodKey)
        .order("revision", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (found.error) throw new Error(`commission period projection failed: ${found.error.message}`);
      const row = (found.data as PeriodSnapshotRow | null) ?? null;
      if (row === null) return { revision: 0, cumulativeEligibleBasisCents: 0, cumulativeCommissionCents: 0 };
      const event = periodEventFromRow(row);
      if (event.periodKey !== periodKey) {
        throw new Error("commission persistence returned a mismatched period projection");
      }
      return {
        revision: event.revision,
        cumulativeEligibleBasisCents: event.cumulativeEligibleBasisCents,
        cumulativeCommissionCents: event.cumulativeCommissionCents,
      };
    },
    async commit(operation: StoredCommissionOperation, expectedPeriodRevision: number) {
      if (!Number.isSafeInteger(expectedPeriodRevision) || expectedPeriodRevision < 0) {
        throw new Error("commission atomic commit received an invalid expected revision");
      }
      const committed = await client.rpc(COMMIT_RPC, {
        p_operation: operation,
        p_expected_period_revision: expectedPeriodRevision,
      });
      if (committed.error) {
        throw new Error(`commission atomic commit failed closed: ${committed.error.message}`);
      }
      const status = (committed.data as { status?: unknown } | null)?.status;
      if (
        status !== "committed" && status !== "replayed" && status !== "idempotency_conflict" &&
        status !== "canonical_money_reused" && status !== "period_contention"
      ) throw new Error("commission atomic commit returned an unknown status");
      return status;
    },
    async listEntries() {
      const found = await client.from(LEDGER_TABLE)
        .select(LEDGER_SELECT)
        .not("entry_snapshot", "is", null)
        .order("created_at", { ascending: true });
      if (found.error) throw new Error(`commission ledger list failed: ${found.error.message}`);
      return ((found.data ?? []) as unknown as LedgerSnapshotRow[]).map(entryFromRow);
    },
    async listPeriodEvents() {
      const found = await client.from(PERIOD_TABLE)
        .select(PERIOD_SELECT)
        .order("occurred_at", { ascending: true })
        .order("revision", { ascending: true });
      if (found.error) throw new Error(`commission period event list failed: ${found.error.message}`);
      return ((found.data ?? []) as unknown as PeriodSnapshotRow[]).map(periodEventFromRow);
    },
  });
}

type BindingRow = Readonly<{
  id: string;
  partner_id: string;
  program_id: string;
  schedule_version: number;
  schedule_hash: string;
  effective_at: string;
  authority_reference: string;
  recorded_at: string;
}>;

type BindingEventRow = Readonly<{
  id: string;
  binding_id: string;
  sequence: number;
  event_kind: string;
  effective_at: string;
  authority_reference: string;
  recorded_at: string;
}>;

function iso(value: string): string {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error("commission persistence returned an invalid instant");
  return parsed.toISOString();
}

function bindingFromRow(value: unknown): CommissionProgramBinding {
  const source = record(value, "program binding row");
  const programId = textValue(source.program_id, "binding program id");
  const scheduleVersion = safeInteger(source.schedule_version, "binding schedule version", 1);
  const scheduleHash = textValue(source.schedule_hash, "binding schedule hash");
  const schedule = commissionScheduleDefinition(programId, scheduleVersion);
  if (
    schedule === null || !SHA256.test(scheduleHash) ||
    createCommissionScheduleSnapshot(schedule).scheduleHash !== scheduleHash
  ) throw new Error("commission persistence returned an unauthentic program binding");
  return {
    bindingId: uuidValue(source.id, "binding id"),
    partnerId: uuidValue(source.partner_id, "binding partner id"),
    programId,
    scheduleVersion,
    scheduleHash,
    effectiveAt: iso(textValue(source.effective_at, "binding effective instant")),
    terminatedAt: null,
    authorityReference: textValue(source.authority_reference, "binding authority reference", 3),
    recordedAt: iso(textValue(source.recorded_at, "binding recorded instant")),
  };
}

function bindingEventFromRow(value: unknown): CommissionProgramBindingLifecycleEvent {
  const source = record(value, "binding lifecycle row");
  if (source.event_kind !== "terminated") {
    throw new Error("commission persistence returned an invalid binding lifecycle kind");
  }
  return {
    eventId: uuidValue(source.id, "binding lifecycle event id"),
    bindingId: uuidValue(source.binding_id, "binding lifecycle binding id"),
    sequence: safeInteger(source.sequence, "binding lifecycle sequence", 1, 1),
    kind: "terminated",
    effectiveAt: iso(textValue(source.effective_at, "binding lifecycle effective instant")),
    authorityReference: textValue(
      source.authority_reference,
      "binding lifecycle authority reference",
      3,
    ),
    recordedAt: iso(textValue(source.recorded_at, "binding lifecycle recorded instant")),
  };
}

export function createSupabaseCommissionProgramBindingRepository(
  client: SupabaseClient = getSupabaseAdmin(),
): CommissionProgramBindingRepository {
  return Object.freeze({
    async listForPartner(partnerId: string) {
      const bindingResult = await client.from(BINDING_TABLE)
        .select("id,partner_id,program_id,schedule_version,schedule_hash,effective_at,authority_reference,recorded_at")
        .eq("partner_id", partnerId)
        .order("effective_at", { ascending: true });
      if (bindingResult.error) {
        throw new Error(`commission binding load failed closed: ${bindingResult.error.message}`);
      }
      const rows = (bindingResult.data ?? []) as BindingRow[];
      if (rows.length === 0) return [];
      const ids = rows.map((row) => row.id);
      const eventResult = await client.from(BINDING_EVENT_TABLE)
        .select("id,binding_id,sequence,event_kind,effective_at,authority_reference,recorded_at")
        .in("binding_id", ids)
        .order("sequence", { ascending: true });
      if (eventResult.error) {
        throw new Error(`commission binding lifecycle load failed closed: ${eventResult.error.message}`);
      }
      const bindings: CommissionProgramBinding[] = rows.map(bindingFromRow);
      if (bindings.some((binding) => binding.partnerId !== partnerId)) {
        throw new Error("commission persistence returned a cross-partner binding");
      }
      const bindingById = new Map(bindings.map((binding) => [binding.bindingId, binding]));
      const events: CommissionProgramBindingLifecycleEvent[] =
        ((eventResult.data ?? []) as BindingEventRow[]).map(bindingEventFromRow);
      events.forEach((event) => {
        const binding = bindingById.get(event.bindingId);
        if (binding === undefined || Date.parse(event.effectiveAt) <= Date.parse(binding.effectiveAt)) {
          throw new Error("commission persistence returned an orphaned binding lifecycle event");
        }
      });
      return createInMemoryCommissionProgramBindingRepository(bindings, events).listForPartner(partnerId);
    },
  });
}

export type CommissionProgramBindingCreateCommand = Readonly<{
  bindingId: string;
  partnerId: string;
  programId: string;
  scheduleVersion: number;
  scheduleHash: string;
  effectiveAt: string;
  authorityReference: string;
  recordedAt: string;
  recordedBy: string;
  idempotencyKey: string;
}>;

export type CommissionProgramBindingTerminationCommand = Readonly<{
  eventId: string;
  bindingId: string;
  effectiveAt: string;
  authorityReference: string;
  recordedAt: string;
  recordedBy: string;
  idempotencyKey: string;
}>;

export type CommissionProgramBindingWriteResult = Readonly<{
  status: "committed" | "replayed" | "idempotency_conflict" | "binding_contention";
  id: string;
}>;

function bindingWriteStatus(value: unknown, idField: "bindingId" | "eventId"): CommissionProgramBindingWriteResult {
  const payload = record(value, "binding writer result");
  if (
    payload.status !== "committed" && payload.status !== "replayed" &&
    payload.status !== "idempotency_conflict" && payload.status !== "binding_contention"
  ) throw new Error("commission binding writer returned an unknown status");
  return Object.freeze({ status: payload.status, id: uuidValue(payload[idField], idField) });
}

export function createSupabaseCommissionProgramBindingWriter(
  client: SupabaseClient = getSupabaseAdmin(),
): Readonly<{
  bind(command: CommissionProgramBindingCreateCommand): Promise<CommissionProgramBindingWriteResult>;
  terminate(command: CommissionProgramBindingTerminationCommand): Promise<CommissionProgramBindingWriteResult>;
}> {
  return Object.freeze({
    async bind(command: CommissionProgramBindingCreateCommand) {
      uuidValue(command.bindingId, "binding command id");
      uuidValue(command.partnerId, "binding command partner id");
      instantValue(command.effectiveAt, "binding command effective instant");
      instantValue(command.recordedAt, "binding command recorded instant");
      textValue(command.authorityReference, "binding command authority", 3);
      textValue(command.recordedBy, "binding command recorder", 3);
      textValue(command.idempotencyKey, "binding command idempotency key", 3);
      const schedule = commissionScheduleDefinition(command.programId, command.scheduleVersion);
      if (
        schedule === null || !SHA256.test(command.scheduleHash) ||
        createCommissionScheduleSnapshot(schedule).scheduleHash !== command.scheduleHash ||
        Date.parse(command.effectiveAt) < Date.parse(`${schedule.effectiveDate}T00:00:00.000Z`) ||
        (schedule.measurementPeriod.anchor === "contract_effective_at" &&
          command.effectiveAt !== `${schedule.effectiveDate}T00:00:00.000Z`)
      ) throw new Error("commission binding command does not match an effective reviewed schedule");
      const payload = {
        ...command,
        operationFingerprint: persistenceFingerprint({ kind: "bind", command }),
      };
      const result = await client.rpc(BIND_RPC, { p_command: payload });
      if (result.error) throw new Error(`commission binding write failed closed: ${result.error.message}`);
      return bindingWriteStatus(result.data, "bindingId");
    },
    async terminate(command: CommissionProgramBindingTerminationCommand) {
      uuidValue(command.eventId, "binding lifecycle command event id");
      uuidValue(command.bindingId, "binding lifecycle command binding id");
      instantValue(command.effectiveAt, "binding lifecycle command effective instant");
      instantValue(command.recordedAt, "binding lifecycle command recorded instant");
      textValue(command.authorityReference, "binding lifecycle command authority", 3);
      textValue(command.recordedBy, "binding lifecycle command recorder", 3);
      textValue(command.idempotencyKey, "binding lifecycle command idempotency key", 3);
      const payload = {
        ...command,
        operationFingerprint: persistenceFingerprint({ kind: "terminate_binding", command }),
      };
      const result = await client.rpc(TERMINATE_BINDING_RPC, { p_command: payload });
      if (result.error) {
        throw new Error(`commission binding lifecycle write failed closed: ${result.error.message}`);
      }
      return bindingWriteStatus(result.data, "eventId");
    },
  });
}

export type CommissionStateTransitionCommand = Readonly<{
  ledgerId: string;
  expectedSequence: number;
  fromState: ProgramCommissionState;
  toState: ProgramCommissionState;
  authorityReference: string;
  paymentEvidenceReference: string | null;
  occurredAt: string;
  idempotencyKey: string;
}>;

export type CommissionStateTransitionWriteResult = Readonly<{
  status: "committed" | "replayed" | "idempotency_conflict" | "state_contention";
  event: unknown | null;
}>;

function validateStateTransitionCommand(command: CommissionStateTransitionCommand): void {
  uuidValue(command.ledgerId, "state transition ledger id");
  safeInteger(command.expectedSequence, "state transition expected sequence", 0);
  if (
    !(PROGRAM_COMMISSION_STATES as readonly unknown[]).includes(command.fromState) ||
    !(PROGRAM_COMMISSION_STATES as readonly unknown[]).includes(command.toState)
  ) throw new Error("commission state transition contains an invalid state");
  textValue(command.authorityReference, "state transition authority", 3);
  nullableText(command.paymentEvidenceReference, "state transition payment evidence", 3);
  instantValue(command.occurredAt, "state transition occurrence");
  textValue(command.idempotencyKey, "state transition idempotency key", 3);
}

function stateEventSnapshot(value: unknown): Readonly<Record<string, unknown>> {
  const event = record(value, "state event snapshot");
  uuidValue(event.eventId, "state event id");
  uuidValue(event.ledgerId, "state event ledger id");
  safeInteger(event.sequence, "state event sequence", 1);
  if (
    !(PROGRAM_COMMISSION_STATES as readonly unknown[]).includes(event.fromState) ||
    !(PROGRAM_COMMISSION_STATES as readonly unknown[]).includes(event.toState)
  ) throw new Error("commission state writer returned an invalid event state");
  textValue(event.authorityReference, "state event authority", 3);
  nullableText(event.paymentEvidenceReference, "state event payment evidence", 3);
  instantValue(event.occurredAt, "state event occurrence");
  textValue(event.idempotencyKey, "state event idempotency key", 3);
  return immutable(event);
}

function validatedStateEvent(
  value: unknown,
  command: CommissionStateTransitionCommand,
): Readonly<Record<string, unknown>> {
  const event = stateEventSnapshot(value);
  if (
    uuidValue(event.ledgerId, "state event ledger id") !== command.ledgerId ||
    safeInteger(event.sequence, "state event sequence", 1) !== command.expectedSequence + 1 ||
    event.fromState !== command.fromState || event.toState !== command.toState ||
    event.authorityReference !== command.authorityReference ||
    event.paymentEvidenceReference !== command.paymentEvidenceReference ||
    event.occurredAt !== command.occurredAt || event.idempotencyKey !== command.idempotencyKey
  ) throw new Error("commission state writer returned a mismatched event snapshot");
  return event;
}

export function createSupabaseCommissionStateTransitionWriter(
  client: SupabaseClient = getSupabaseAdmin(),
): Readonly<{
  transition(command: CommissionStateTransitionCommand): Promise<CommissionStateTransitionWriteResult>;
}> {
  return Object.freeze({
    async transition(command) {
      validateStateTransitionCommand(command);
      if (!commissionStateTransitionAllowed(
        command.fromState,
        command.toState,
        command.paymentEvidenceReference,
      )) throw new Error("commission state transition rejected before persistence");
      const result = await client.rpc(TRANSITION_RPC, { p_command: command });
      if (result.error) {
        throw new Error(`commission state transition failed closed: ${result.error.message}`);
      }
      const payload = result.data as { status?: unknown; event?: unknown } | null;
      if (
        payload?.status !== "committed" && payload?.status !== "replayed" &&
        payload?.status !== "idempotency_conflict" && payload?.status !== "state_contention"
      ) throw new Error("commission state transition returned an unknown status");
      const event = payload.status === "state_contention"
        ? null
        : payload.status === "idempotency_conflict"
        ? stateEventSnapshot(payload.event)
        : validatedStateEvent(payload.event, command);
      if (payload.status === "state_contention" && payload.event !== null) {
        throw new Error("commission state contention returned an unexpected event");
      }
      return Object.freeze({ status: payload.status, event });
    },
  });
}
