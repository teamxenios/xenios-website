/**
 * Disposable, local-only PGlite rehearsal for the commission schedule candidate.
 * No connection string, filesystem data directory, Supabase client, or network
 * adapter is accepted.
 *
 * Usage:
 *   node server/research/partners/commission-schedules/sql-rehearsal.mjs <absolute local @electric-sql/pglite package directory>
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const runtimeDirectory = process.argv[2];
assert(runtimeDirectory && isAbsolute(runtimeDirectory), "absolute local PGlite directory required");
assert(!/^[\\/]{2}/.test(runtimeDirectory), "network runtime paths are refused");
const runtimeRoot = await realpath(runtimeDirectory);
const metadata = JSON.parse(await readFile(resolve(runtimeRoot, "package.json"), "utf8"));
assert.equal(metadata.name, "@electric-sql/pglite");
assert.equal(metadata.version, "0.5.8");
const insideRuntime = async (file) => {
  const path = await realpath(resolve(runtimeRoot, file));
  const rel = relative(runtimeRoot, path);
  assert(rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
  return path;
};
const [{ PGlite }, { pgcrypto }] = await Promise.all([
  import(pathToFileURL(await insideRuntime("dist/index.js")).href),
  import(pathToFileURL(await insideRuntime("dist/contrib/pgcrypto.js")).href),
]);

const root = process.cwd();
const candidatePath = "supabase/candidates/20260921_research_program_commission_schedules.sql";
const precheckPath = "supabase/candidates/20260921_research_program_commission_schedules_precheck.sql";
const postcheckPath = "supabase/candidates/20260921_research_program_commission_schedules_postcheck.sql";
const [candidate, precheck, postcheck] = await Promise.all(
  [candidatePath, precheckPath, postcheckPath].map((path) => readFile(resolve(root, path), "utf8")),
);

const bootstrap = `
  set timezone = 'UTC';
  create schema if not exists extensions;
  create extension if not exists pgcrypto with schema extensions;
  create role anon; create role authenticated; create role service_role bypassrls;
  create table public.research_partners (
    id uuid primary key default gen_random_uuid(),
    state text not null default 'active'
  );
  create table public.research_partner_lifecycle_events (
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.research_partners(id),
    to_state text not null,
    occurred_at timestamptz not null
  );
  create table public.research_commission_ledger (
    id uuid primary key default gen_random_uuid(),
    partner_id uuid not null references public.research_partners(id),
    order_id uuid not null,
    state text not null default 'pending'
      check (state in ('pending','held','approved','payable','paid','reversed','disputed','forfeited')),
    eligible_net_cents bigint not null check (eligible_net_cents >= 0),
    basis_points integer not null check (basis_points between 0 and 10000),
    amount_cents bigint not null check (amount_cents >= 0),
    reverses_ledger_id uuid references public.research_commission_ledger(id),
    source_reference text,
    payout_batch_id uuid,
    payout_reference text,
    actor_type text not null default 'system' check (actor_type in ('admin','system')),
    actor_id text,
    kind text check (kind is null or kind in ('accrual','transition','reversal')),
    created_at timestamptz not null default now(),
    check (state <> 'paid' or (payout_reference is not null and payout_batch_id is not null)),
    check (reverses_ledger_id is null or state = 'reversed')
  );
  create unique index research_commission_one_live_accrual_per_order
    on public.research_commission_ledger(order_id)
    where state in ('pending','held','approved','payable','paid');
  create or replace function public.research_ledger_is_append_only()
  returns trigger language plpgsql as $$ begin
    raise exception 'ledger is append only' using errcode = '55000';
  end; $$;
  create trigger research_commission_ledger_no_update before update or delete
    on public.research_commission_ledger for each row
    execute function public.research_ledger_is_append_only();
`;

function resultValue(results, column) {
  for (const result of results) {
    for (const row of result.rows ?? []) if (column in row) return row[column];
  }
  throw new Error(`result column missing: ${column}`);
}

function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) =>
    `${JSON.stringify(key)}:${canonicalJson(value[key])}`
  ).join(",")}}`;
}

function hash(value) {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function withOperationFingerprint(kind, command) {
  return {
    ...command,
    operationFingerprint: hash({ kind, command }),
  };
}

const clone = (value) => structuredClone(value);
const money = (settlementRef, amountCents, settledAt) => ({
  settlementRef,
  externalTransactionRef: `external:${settlementRef}`,
  amountCents,
  currency: "USD",
  settledAt,
});

async function freshDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(bootstrap);
  return db;
}

async function rpc(db, signature, args) {
  const placeholders = args.map((_, index) => `$${index + 1}`).join(",");
  const result = await db.query(`select public.${signature}(${placeholders}) result`, args);
  return result.rows[0].result;
}

async function serviceRpc(db, signature, args) {
  await db.exec("set role service_role");
  try {
    return await rpc(db, signature, args);
  } finally {
    await db.exec("reset role");
  }
}

let checks = 0;
const checked = () => { checks += 1; };
const db = await freshDb();
try {
  assert.equal((await db.query("select to_regprocedure('public.digest(bytea,text)') as digest")).rows[0].digest, null);
  assert.equal(resultValue(await db.exec(precheck), "commission_program_precheck").verdict, "APPLY_READY");
  checked();
  await db.exec(candidate);
  assert.equal(resultValue(await db.exec(postcheck), "commission_program_postcheck").verdict, "APPLIED_OK");
  checked();
  await db.exec(candidate);
  assert.equal(resultValue(await db.exec(postcheck), "commission_program_postcheck").verdict, "APPLIED_OK");
  checked();

  const seth = (await db.query(`
    select definition, schedule_hash from public.research_commission_program_schedules
    where program_id='seth_operating_advisor_2026_09_signed' and schedule_version=1
  `)).rows[0];
  assert.equal(seth.definition.measurementPeriod.anchor, "contract_effective_at");
  assert.equal(
    (await db.query(`select private.research_program_commission_total($1::jsonb,4999999,'initial_term') n`,
      [seth.definition])).rows[0].n,
    1249999,
  );
  assert.equal(
    (await db.query(`select private.research_program_commission_total($1::jsonb,5000001,'initial_term') n`,
      [seth.definition])).rows[0].n,
    1250000,
  );
  checked();

  const partner = "10000000-0000-4000-8000-000000000001";
  const binding = "20000000-0000-4000-8000-000000000001";
  await db.query("insert into public.research_partners(id,state) values ($1,'active')", [partner]);
  await db.query(`
    insert into public.research_partner_lifecycle_events(partner_id,to_state,occurred_at)
    values ($1,'active','2026-09-01T00:00:00.000Z')
  `, [partner]);
  const lateBindingCommand = {
    bindingId: "20000000-0000-4000-8000-000000000099",
    partnerId: partner,
    programId: "seth_operating_advisor_2026_09_signed",
    scheduleVersion: 1,
    scheduleHash: seth.schedule_hash,
    effectiveAt: "2026-09-03T00:00:00.000Z",
    authorityReference: "signed:seth:v1",
    recordedAt: "2026-09-21T00:00:00.000Z",
    recordedBy: "rehearsal",
    idempotencyKey: "binding:seth:late",
  };
  const lateBinding = withOperationFingerprint("bind", lateBindingCommand);
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_bind", [lateBinding]),
    /does not match an effective reviewed schedule/,
  );
  checked();

  const bindingCommandWithoutFingerprint = {
    ...lateBindingCommand,
    bindingId: binding,
    effectiveAt: "2026-09-02T00:00:00.000Z",
    idempotencyKey: "binding:seth:v1",
  };
  const bindingCommand = withOperationFingerprint("bind", bindingCommandWithoutFingerprint);
  assert.equal((await serviceRpc(db, "research_program_commission_bind", [bindingCommand])).status, "committed");
  assert.equal((await serviceRpc(db, "research_program_commission_bind", [bindingCommand])).status, "replayed");
  checked();

  const snapshot = {
    definition: seth.definition,
    hashAlgorithm: "sha256",
    scheduleHash: seth.schedule_hash,
  };
  const attribution = {
    customerBindingKey: "customer-binding:1",
    acceptedRelationshipReference: "accepted-customer:1",
    firstEligibleTransactionAt: "2026-09-02T00:00:00.000Z",
    activeManagementConfirmed: true,
  };
  const revenue = {
    grossEligibleProductChannelCents: 100000,
    preCollectionAdjustments: [],
    eligibleProductChannelCollectedCents: 100000,
    collectedExclusions: [{ kind: "tax", amountCents: 10000, authorityReference: null }],
    settlementAmountCents: 110000,
  };
  const calculation = {
    eligibleBasisCents: 100000,
    commissionCents: 25000,
    components: [{ basisCents: 100000, rateBasisPoints: 2500, commissionCents: 25000 }],
  };
  const period = {
    index: 0,
    startsAt: "2026-09-02T00:00:00.000Z",
    endsAt: "2026-10-02T00:00:00.000Z",
  };
  const entry = {
    entryId: "40000000-0000-4000-8000-000000000001",
    eventKind: "accrual",
    partnerId: partner,
    orderId: "order_pack04_0001",
    canonicalOrderId: "30000000-0000-4000-8000-000000000001",
    originalSettlementRef: "settlement:1",
    reversesEntryId: null,
    moneyEvidence: money("settlement:1", 110000, "2026-09-02T00:00:00.000Z"),
    bindingId: binding,
    bindingAuthorityReference: "signed:seth:v1",
    programId: "seth_operating_advisor_2026_09_signed",
    scheduleVersion: 1,
    scheduleHash: seth.schedule_hash,
    scheduleSnapshot: snapshot,
    periodKey: `${binding}:0:initial_term`,
    period,
    termMode: "initial_term",
    eligibleBasisDeltaCents: 100000,
    commissionDeltaCents: 25000,
    calculation,
    revenueSnapshot: revenue,
    attributionSnapshot: attribution,
    priceAuthorityReference: "catalog-price:v1",
    reversalAuthorityReference: null,
    reversalAllocationSnapshot: null,
    initialState: "pending",
    occurredAt: "2026-09-02T00:00:00.000Z",
  };
  const periodEvent = {
    periodEventId: "60000000-0000-4000-8000-000000000001",
    periodKey: entry.periodKey,
    revision: 1,
    sourceEntryId: entry.entryId,
    partnerId: partner,
    bindingId: binding,
    programId: entry.programId,
    scheduleVersion: 1,
    scheduleHash: seth.schedule_hash,
    period,
    termMode: "initial_term",
    eligibleBasisDeltaCents: 100000,
    commissionDeltaCents: 25000,
    cumulativeEligibleBasisCents: 100000,
    cumulativeCommissionCents: 25000,
    occurredAt: entry.occurredAt,
  };
  const accrual = {
    idempotencyKey: "accrual:settlement:1",
    fingerprint: hash({ kind: "accrual", settlement: "settlement:1" }),
    entry,
    periodEvent,
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [accrual, 0],
  )).status, "committed");
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [accrual, 0],
  )).status, "replayed");
  checked();

  const idempotencyConflict = clone(accrual);
  idempotencyConflict.fingerprint = "c".repeat(64);
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [idempotencyConflict, 0],
  )).status, "idempotency_conflict");
  checked();

  const missingEvidence = clone(accrual);
  missingEvidence.idempotencyKey = "accrual:missing-evidence";
  missingEvidence.fingerprint = "d".repeat(64);
  missingEvidence.entry.entryId = "40000000-0000-4000-8000-000000000002";
  missingEvidence.periodEvent.periodEventId = "60000000-0000-4000-8000-000000000002";
  missingEvidence.periodEvent.sourceEntryId = missingEvidence.entry.entryId;
  delete missingEvidence.entry.attributionSnapshot.customerBindingKey;
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [missingEvidence, 1]),
    /invalid commission operation snapshot/,
  );
  checked();

  const tamperedCommission = clone(accrual);
  tamperedCommission.idempotencyKey = "accrual:settlement:tampered";
  tamperedCommission.fingerprint = "e".repeat(64);
  tamperedCommission.entry.entryId = "40000000-0000-4000-8000-000000000003";
  tamperedCommission.entry.canonicalOrderId = "30000000-0000-4000-8000-000000000003";
  tamperedCommission.entry.orderId = "order_pack04_0003";
  tamperedCommission.entry.originalSettlementRef = "settlement:tampered";
  tamperedCommission.entry.moneyEvidence = money(
    "settlement:tampered",
    1000,
    "2026-09-03T00:00:00.000Z",
  );
  tamperedCommission.entry.revenueSnapshot = {
    grossEligibleProductChannelCents: 1000,
    preCollectionAdjustments: [],
    eligibleProductChannelCollectedCents: 1000,
    collectedExclusions: [],
    settlementAmountCents: 1000,
  };
  tamperedCommission.entry.eligibleBasisDeltaCents = 1000;
  tamperedCommission.entry.commissionDeltaCents = 999;
  tamperedCommission.entry.calculation = {
    eligibleBasisCents: 1000,
    commissionCents: 999,
    components: [{ basisCents: 1000, rateBasisPoints: 9990, commissionCents: 999 }],
  };
  tamperedCommission.entry.occurredAt = "2026-09-03T00:00:00.000Z";
  tamperedCommission.periodEvent = {
    ...tamperedCommission.periodEvent,
    periodEventId: "60000000-0000-4000-8000-000000000003",
    revision: 2,
    sourceEntryId: tamperedCommission.entry.entryId,
    eligibleBasisDeltaCents: 1000,
    commissionDeltaCents: 999,
    cumulativeEligibleBasisCents: 101000,
    cumulativeCommissionCents: 25999,
    occurredAt: tamperedCommission.entry.occurredAt,
  };
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [tamperedCommission, 1]),
    /exact schedule calculation/,
  );
  checked();

  const wrongRevision = clone(tamperedCommission);
  wrongRevision.idempotencyKey = "accrual:settlement:contention";
  wrongRevision.fingerprint = "f".repeat(64);
  wrongRevision.entry.entryId = "40000000-0000-4000-8000-000000000004";
  wrongRevision.entry.canonicalOrderId = "30000000-0000-4000-8000-000000000004";
  wrongRevision.entry.orderId = "order_pack04_0004";
  wrongRevision.entry.originalSettlementRef = "settlement:contention";
  wrongRevision.entry.moneyEvidence = money("settlement:contention", 1000, "2026-09-03T00:00:00.000Z");
  wrongRevision.entry.revenueSnapshot = {
    grossEligibleProductChannelCents: 1000,
    preCollectionAdjustments: [],
    eligibleProductChannelCollectedCents: 1000,
    collectedExclusions: [],
    settlementAmountCents: 1000,
  };
  wrongRevision.entry.commissionDeltaCents = 250;
  wrongRevision.entry.calculation = {
    eligibleBasisCents: 1000,
    commissionCents: 250,
    components: [{ basisCents: 1000, rateBasisPoints: 2500, commissionCents: 250 }],
  };
  wrongRevision.periodEvent = {
    ...wrongRevision.periodEvent,
    periodEventId: "60000000-0000-4000-8000-000000000004",
    sourceEntryId: wrongRevision.entry.entryId,
    commissionDeltaCents: 250,
    cumulativeCommissionCents: 25250,
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [wrongRevision, 0],
  )).status, "period_contention");
  checked();

  await db.query(`
    insert into public.research_partner_lifecycle_events(partner_id,to_state,occurred_at)
    values ($1,'suspended','2026-09-10T00:00:00.000Z')
  `, [partner]);
  const inactiveAccrual = clone(wrongRevision);
  inactiveAccrual.idempotencyKey = "accrual:settlement:inactive";
  inactiveAccrual.fingerprint = "0".repeat(64);
  inactiveAccrual.entry.entryId = "40000000-0000-4000-8000-000000000005";
  inactiveAccrual.entry.canonicalOrderId = "30000000-0000-4000-8000-000000000005";
  inactiveAccrual.entry.orderId = "order_pack04_0005";
  inactiveAccrual.entry.originalSettlementRef = "settlement:inactive";
  inactiveAccrual.entry.moneyEvidence = money(
    "settlement:inactive",
    1000,
    "2026-09-11T00:00:00.000Z",
  );
  inactiveAccrual.entry.occurredAt = "2026-09-11T00:00:00.000Z";
  inactiveAccrual.periodEvent.periodEventId = "60000000-0000-4000-8000-000000000005";
  inactiveAccrual.periodEvent.sourceEntryId = inactiveAccrual.entry.entryId;
  inactiveAccrual.periodEvent.occurredAt = inactiveAccrual.entry.occurredAt;
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [inactiveAccrual, 1]),
    /partner was not active at commission occurrence/,
  );
  checked();

  await db.query(`
    insert into public.research_partner_lifecycle_events(partner_id,to_state,occurred_at)
    values ($1,'active','2026-09-12T00:00:00.000Z')
  `, [partner]);
  const expiredAttribution = clone(inactiveAccrual);
  expiredAttribution.idempotencyKey = "accrual:settlement:expired-attribution";
  expiredAttribution.fingerprint = "9".repeat(64);
  expiredAttribution.entry.entryId = "40000000-0000-4000-8000-000000000006";
  expiredAttribution.entry.canonicalOrderId = "30000000-0000-4000-8000-000000000006";
  expiredAttribution.entry.orderId = "order_pack04_0006";
  expiredAttribution.entry.originalSettlementRef = "settlement:expired-attribution";
  expiredAttribution.entry.moneyEvidence = money(
    "settlement:expired-attribution",
    1000,
    "2027-09-02T00:00:00.000Z",
  );
  expiredAttribution.entry.periodKey = `${binding}:12:post_term_tail`;
  expiredAttribution.entry.period = {
    index: 12,
    startsAt: "2027-08-28T00:00:00.000Z",
    endsAt: "2027-09-27T00:00:00.000Z",
  };
  expiredAttribution.entry.termMode = "post_term_tail";
  expiredAttribution.entry.occurredAt = "2027-09-02T00:00:00.000Z";
  expiredAttribution.periodEvent = {
    ...expiredAttribution.periodEvent,
    periodEventId: "60000000-0000-4000-8000-000000000006",
    periodKey: expiredAttribution.entry.periodKey,
    revision: 1,
    sourceEntryId: expiredAttribution.entry.entryId,
    period: expiredAttribution.entry.period,
    termMode: "post_term_tail",
    cumulativeEligibleBasisCents: 1000,
    cumulativeCommissionCents: 250,
    occurredAt: expiredAttribution.entry.occurredAt,
  };
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [expiredAttribution, 0]),
    /commission attribution window expired/,
  );
  checked();

  const allocation = {
    allocationReference: "refund-allocation:1",
    originalRevenueSnapshotHash: hash(revenue),
    eligibleBasisReductionCents: 20000,
    components: [
      { kind: "eligible_product_channel", amountCents: 20000, authorityReference: "refund:1" },
      { kind: "tax", amountCents: 10000, authorityReference: "refund:1" },
    ],
  };
  const reversalEntry = {
    ...entry,
    entryId: "50000000-0000-4000-8000-000000000001",
    eventKind: "refund_reversal",
    reversesEntryId: entry.entryId,
    moneyEvidence: money("refund:1", 30000, "2026-09-20T00:00:00.000Z"),
    eligibleBasisDeltaCents: -20000,
    commissionDeltaCents: -5000,
    calculation: { eligibleBasisCents: 20000, commissionCents: 5000, components: [] },
    revenueSnapshot: null,
    reversalAuthorityReference: "commerce:refund:1",
    reversalAllocationSnapshot: allocation,
    initialState: "reversed",
    occurredAt: "2026-09-20T00:00:00.000Z",
  };
  const reversalPeriod = {
    ...periodEvent,
    periodEventId: "70000000-0000-4000-8000-000000000001",
    revision: 2,
    sourceEntryId: reversalEntry.entryId,
    eligibleBasisDeltaCents: -20000,
    commissionDeltaCents: -5000,
    cumulativeEligibleBasisCents: 80000,
    cumulativeCommissionCents: 20000,
    occurredAt: reversalEntry.occurredAt,
  };
  const reversal = {
    idempotencyKey: "refund_reversal:refund:1",
    fingerprint: hash({ kind: "refund_reversal", settlement: "refund:1" }),
    entry: reversalEntry,
    periodEvent: reversalPeriod,
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [reversal, 1],
  )).status, "committed");
  checked();

  const outOfOrderReversal = clone(reversal);
  outOfOrderReversal.idempotencyKey = "refund_reversal:refund:out-of-order";
  outOfOrderReversal.fingerprint = "8".repeat(64);
  outOfOrderReversal.entry.entryId = "50000000-0000-4000-8000-000000000008";
  outOfOrderReversal.entry.moneyEvidence = money(
    "refund:out-of-order",
    10000,
    "2026-09-19T00:00:00.000Z",
  );
  outOfOrderReversal.entry.eligibleBasisDeltaCents = -10000;
  outOfOrderReversal.entry.commissionDeltaCents = -2500;
  outOfOrderReversal.entry.calculation = {
    eligibleBasisCents: 10000,
    commissionCents: 2500,
    components: [],
  };
  outOfOrderReversal.entry.occurredAt = "2026-09-19T00:00:00.000Z";
  outOfOrderReversal.entry.reversalAllocationSnapshot = {
    allocationReference: "refund-allocation:out-of-order",
    originalRevenueSnapshotHash: hash(revenue),
    eligibleBasisReductionCents: 10000,
    components: [
      { kind: "eligible_product_channel", amountCents: 10000, authorityReference: "refund:out-of-order" },
    ],
  };
  outOfOrderReversal.periodEvent.periodEventId = "70000000-0000-4000-8000-000000000008";
  outOfOrderReversal.periodEvent.revision = 3;
  outOfOrderReversal.periodEvent.sourceEntryId = outOfOrderReversal.entry.entryId;
  outOfOrderReversal.periodEvent.eligibleBasisDeltaCents = -10000;
  outOfOrderReversal.periodEvent.commissionDeltaCents = -2500;
  outOfOrderReversal.periodEvent.cumulativeEligibleBasisCents = 70000;
  outOfOrderReversal.periodEvent.cumulativeCommissionCents = 17500;
  outOfOrderReversal.periodEvent.occurredAt = outOfOrderReversal.entry.occurredAt;
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [outOfOrderReversal, 2]),
    /must be appended in occurrence order/,
  );
  checked();

  const badAllocation = clone(reversal);
  badAllocation.idempotencyKey = "refund_reversal:refund:bad-allocation";
  badAllocation.fingerprint = "1".repeat(64);
  badAllocation.entry.entryId = "50000000-0000-4000-8000-000000000002";
  badAllocation.entry.moneyEvidence = money("refund:bad-allocation", 30000, "2026-09-21T00:00:00.000Z");
  badAllocation.entry.occurredAt = "2026-09-21T00:00:00.000Z";
  badAllocation.entry.reversalAllocationSnapshot.originalRevenueSnapshotHash = "2".repeat(64);
  badAllocation.periodEvent.periodEventId = "70000000-0000-4000-8000-000000000002";
  badAllocation.periodEvent.revision = 3;
  badAllocation.periodEvent.sourceEntryId = badAllocation.entry.entryId;
  badAllocation.periodEvent.cumulativeEligibleBasisCents = 60000;
  badAllocation.periodEvent.cumulativeCommissionCents = 15000;
  badAllocation.periodEvent.occurredAt = badAllocation.entry.occurredAt;
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [badAllocation, 2]),
    /does not bind eligible basis to original revenue/,
  );
  checked();

  const missingAllocationHash = clone(badAllocation);
  missingAllocationHash.idempotencyKey = "refund_reversal:refund:missing-allocation-hash";
  missingAllocationHash.fingerprint = "4".repeat(64);
  missingAllocationHash.entry.entryId = "50000000-0000-4000-8000-000000000003";
  missingAllocationHash.entry.moneyEvidence = money(
    "refund:missing-allocation-hash",
    30000,
    "2026-09-22T00:00:00.000Z",
  );
  missingAllocationHash.entry.occurredAt = "2026-09-22T00:00:00.000Z";
  missingAllocationHash.entry.reversalAllocationSnapshot.originalRevenueSnapshotHash = null;
  missingAllocationHash.periodEvent.periodEventId = "70000000-0000-4000-8000-000000000003";
  missingAllocationHash.periodEvent.sourceEntryId = missingAllocationHash.entry.entryId;
  missingAllocationHash.periodEvent.occurredAt = missingAllocationHash.entry.occurredAt;
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_commit", [missingAllocationHash, 2]),
    /invalid reversal allocation shape/,
  );
  checked();

  const approved = {
    ledgerId: entry.entryId,
    expectedSequence: 0,
    fromState: "pending",
    toState: "approved",
    authorityReference: "admin:approval:1",
    paymentEvidenceReference: null,
    occurredAt: "2026-09-21T00:00:00.000Z",
    idempotencyKey: "state:approval:1",
  };
  assert.equal((await serviceRpc(db, "research_program_commission_transition", [approved])).status, "committed");
  assert.equal((await serviceRpc(db, "research_program_commission_transition", [approved])).status, "replayed");
  const stale = { ...approved, toState: "held", idempotencyKey: "state:stale:1" };
  assert.equal((await serviceRpc(db, "research_program_commission_transition", [stale])).status, "state_contention");
  const skippedPaid = {
    ...approved,
    expectedSequence: 1,
    fromState: "approved",
    toState: "paid",
    paymentEvidenceReference: "payout:1",
    idempotencyKey: "state:skipped-paid:1",
  };
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_transition", [skippedPaid]),
    /illegal commission state transition/,
  );
  const payable = {
    ...approved,
    expectedSequence: 1,
    fromState: "approved",
    toState: "payable",
    occurredAt: "2026-09-21T01:00:00.000Z",
    idempotencyKey: "state:payable:1",
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_transition",
    [payable],
  )).status, "committed");
  const paidWithoutEvidence = {
    ...payable,
    expectedSequence: 2,
    fromState: "payable",
    toState: "paid",
    occurredAt: "2026-09-21T02:00:00.000Z",
    idempotencyKey: "state:paid-without-evidence:1",
  };
  await assert.rejects(
    () => serviceRpc(db, "research_program_commission_transition", [paidWithoutEvidence]),
    /illegal commission state transition/,
  );
  const paid = {
    ...paidWithoutEvidence,
    paymentEvidenceReference: "payout:bank:1",
    idempotencyKey: "state:paid:1",
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_transition",
    [paid],
  )).status, "committed");
  checked();

  const terminationCommand = {
    eventId: "80000000-0000-4000-8000-000000000001",
    bindingId: binding,
    effectiveAt: "2026-10-01T00:00:00.000Z",
    authorityReference: "signed:seth:termination",
    recordedAt: "2026-09-21T01:00:00.000Z",
    recordedBy: "rehearsal",
    idempotencyKey: "binding:seth:terminate",
  };
  const termination = withOperationFingerprint("terminate_binding", terminationCommand);
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_terminate_binding",
    [termination],
  )).status, "committed");
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_terminate_binding",
    [termination],
  )).status, "replayed");
  checked();

  const lateAllocation = {
    allocationReference: "refund-allocation:late",
    originalRevenueSnapshotHash: hash(revenue),
    eligibleBasisReductionCents: 10000,
    components: [
      { kind: "eligible_product_channel", amountCents: 10000, authorityReference: "refund:late" },
    ],
  };
  const lateReversalEntry = {
    ...entry,
    entryId: "50000000-0000-4000-8000-000000000004",
    eventKind: "refund_reversal",
    reversesEntryId: entry.entryId,
    moneyEvidence: money("refund:late", 10000, "2026-12-15T00:00:00.000Z"),
    eligibleBasisDeltaCents: -10000,
    commissionDeltaCents: -2500,
    calculation: { eligibleBasisCents: 10000, commissionCents: 2500, components: [] },
    revenueSnapshot: null,
    reversalAuthorityReference: "commerce:refund:late",
    reversalAllocationSnapshot: lateAllocation,
    initialState: "reversed",
    occurredAt: "2026-12-15T00:00:00.000Z",
  };
  const lateReversalPeriod = {
    ...periodEvent,
    periodEventId: "70000000-0000-4000-8000-000000000004",
    revision: 3,
    sourceEntryId: lateReversalEntry.entryId,
    eligibleBasisDeltaCents: -10000,
    commissionDeltaCents: -2500,
    cumulativeEligibleBasisCents: 70000,
    cumulativeCommissionCents: 17500,
    occurredAt: lateReversalEntry.occurredAt,
  };
  const lateReversal = {
    idempotencyKey: "refund_reversal:refund:late",
    fingerprint: hash({ kind: "refund_reversal", settlement: "refund:late" }),
    entry: lateReversalEntry,
    periodEvent: lateReversalPeriod,
  };
  assert.equal((await serviceRpc(
    db,
    "research_program_commission_commit",
    [lateReversal, 2],
  )).status, "committed");
  checked();

  await db.exec("set role service_role");
  await assert.rejects(
    () => db.exec("truncate table public.research_commission_program_schedules"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query(`insert into public.research_commission_ledger(
      partner_id,order_id,state,eligible_net_cents,basis_points,amount_cents,program_id
    ) values ($1,$2,'pending',1,1,1,'seth_operating_advisor_2026_09_signed')`, [
      partner,
      "30000000-0000-4000-8000-000000000099",
    ]),
    /must use research_program_commission_commit/,
  );
  await db.exec("reset role");
  checked();

  await db.exec("begin");
  await assert.rejects(
    () => db.query("update public.research_commission_period_ledger set revision=9 where revision=1"),
    /append-only/,
  );
  await db.exec("rollback");
  checked();

  const driftDb = await freshDb();
  try {
    await driftDb.exec(`create table public.research_commission_program_schedules(
      program_id text not null, schedule_version integer not null, schedule_hash text not null,
      definition jsonb not null, effective_at timestamptz not null, authority_class text not null,
      recorded_at timestamptz not null default now(), primary key(program_id,schedule_version),
      unique(program_id,schedule_version,schedule_hash)
    ); insert into public.research_commission_program_schedules values(
      'seth_operating_advisor_2026_09_signed',1,
      '549f97385d7e7c4bf78bde1f407798dfb35866da2024a97149476217aabe697c',
      '{}','2026-09-02Z','signed_agreement',now()
    );`);
    await assert.rejects(
      () => driftDb.exec(candidate),
      /differs from the exact reviewed v1 definition or hash/,
    );
    await driftDb.exec("rollback");
    checked();
  } finally {
    await driftDb.close();
  }

  console.log(JSON.stringify({
    status: "PASS",
    checks,
    engine: (await db.query("select version() version")).rows[0].version,
    runtime: `${metadata.name}@${metadata.version}`,
    candidatePath,
    precheckPath,
    postcheckPath,
    applyCount: 2,
    exactDefinitionDriftRefused: true,
    missingEvidenceRefused: true,
    missingReversalHashRefused: true,
    arbitraryCommissionRefused: true,
    reversalAllocationHashRefused: true,
    partnerStateAtOccurrenceEnforced: true,
    attributionWindowEnforced: true,
    periodOccurrenceOrderingEnforced: true,
    lateReversalAfterTerminationCommitted: true,
    lockedStateAndLifecycleWriters: true,
    serviceRoleTruncateDenied: true,
    productionMutated: false,
    scope: "isolated in-memory PostgreSQL/WASM; single-engine CAS, not a managed multi-session rehearsal",
  }, null, 2));
} finally {
  await db.close();
}
