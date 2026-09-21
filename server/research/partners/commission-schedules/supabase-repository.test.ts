import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { SETH_OPERATING_ADVISOR_SCHEDULE } from "@shared/research/commission-schedules";
import { createCommissionScheduleSnapshot } from "./hash";
import { createSupabaseProgramCommissionLedgerRepository } from "./supabase-repository";
import type { StoredCommissionOperation } from "./ledger";

const PARTNER_ID = "10000000-0000-4000-8000-000000000001";
const BINDING_ID = "20000000-0000-4000-8000-000000000001";
const ORDER_ID = "30000000-0000-4000-8000-000000000001";
const ENTRY_ID = "40000000-0000-4000-8000-000000000001";

function entrySnapshot(): Record<string, unknown> {
  const scheduleSnapshot = createCommissionScheduleSnapshot(SETH_OPERATING_ADVISOR_SCHEDULE);
  return {
    entryId: ENTRY_ID,
    eventKind: "accrual",
    partnerId: PARTNER_ID,
    orderId: "order-1",
    canonicalOrderId: ORDER_ID,
    originalSettlementRef: "settlement:1",
    reversesEntryId: null,
    moneyEvidence: {
      settlementRef: "settlement:1",
      externalTransactionRef: "external:settlement:1",
      amountCents: 100_000,
      currency: "USD",
      settledAt: "2026-09-02T00:00:00.000Z",
    },
    bindingId: BINDING_ID,
    bindingAuthorityReference: "signed:seth:v1",
    programId: SETH_OPERATING_ADVISOR_SCHEDULE.programId,
    scheduleVersion: 1,
    scheduleHash: scheduleSnapshot.scheduleHash,
    scheduleSnapshot,
    periodKey: `${BINDING_ID}:0:initial_term`,
    period: {
      index: 0,
      startsAt: "2026-09-02T00:00:00.000Z",
      endsAt: "2026-10-02T00:00:00.000Z",
    },
    termMode: "initial_term",
    eligibleBasisDeltaCents: 100_000,
    commissionDeltaCents: 25_000,
    calculation: {
      eligibleBasisCents: 100_000,
      commissionCents: 25_000,
      components: [{ basisCents: 100_000, rateBasisPoints: 2_500, commissionCents: 25_000 }],
    },
    revenueSnapshot: {
      grossEligibleProductChannelCents: 100_000,
      preCollectionAdjustments: [],
      eligibleProductChannelCollectedCents: 100_000,
      collectedExclusions: [],
      settlementAmountCents: 100_000,
    },
    attributionSnapshot: {
      customerBindingKey: "customer-binding:1",
      acceptedRelationshipReference: "accepted:1",
      firstEligibleTransactionAt: "2026-09-02T00:00:00.000Z",
      activeManagementConfirmed: true,
    },
    priceAuthorityReference: "catalog-price:v1",
    reversalAuthorityReference: null,
    reversalAllocationSnapshot: null,
    initialState: "pending",
    occurredAt: "2026-09-02T00:00:00.000Z",
  };
}

function ledgerRow(snapshot: Record<string, unknown>): Record<string, unknown> {
  return {
    id: ENTRY_ID,
    partner_id: PARTNER_ID,
    order_id: ORDER_ID,
    program_binding_id: BINDING_ID,
    program_id: SETH_OPERATING_ADVISOR_SCHEDULE.programId,
    schedule_version: 1,
    schedule_hash: createCommissionScheduleSnapshot(SETH_OPERATING_ADVISOR_SCHEDULE).scheduleHash,
    canonical_order_reference: "order-1",
    idempotency_key: "accrual:settlement:1",
    operation_fingerprint: "a".repeat(64),
    settlement_reference: "settlement:1",
    original_settlement_reference: "settlement:1",
    event_kind: "accrual",
    period_key: `${BINDING_ID}:0:initial_term`,
    period_index: 0,
    term_mode: "initial_term",
    eligible_basis_delta_cents: "100000",
    commission_delta_cents: "25000",
    entry_snapshot: snapshot,
    occurred_at: "2026-09-02T00:00:00.000Z",
    created_at: "2026-09-02T00:00:01.000Z",
  };
}

function fakeClient(options: Readonly<{
  row?: Record<string, unknown> | null;
  rpcError?: string;
  rpcData?: unknown;
}> = {}): SupabaseClient {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "not", "order", "limit", "in"]) {
    builder[method] = () => builder;
  }
  builder.maybeSingle = async () => ({ data: options.row ?? null, error: null });
  return {
    from: () => builder,
    rpc: async () => ({
      data: options.rpcData ?? null,
      error: options.rpcError === undefined ? null : { message: options.rpcError },
    }),
  } as unknown as SupabaseClient;
}

describe("Supabase program commission repository", () => {
  it("accepts an authentic immutable ledger snapshot", async () => {
    const repository = createSupabaseProgramCommissionLedgerRepository(
      fakeClient({ row: ledgerRow(entrySnapshot()) }),
    );
    await expect(repository.findEntryByMoneyEvidenceRef("settlement:1"))
      .resolves.toMatchObject({ entryId: ENTRY_ID, eligibleBasisDeltaCents: 100_000 });
  });

  it("fails closed when PostgREST returns a malformed snapshot", async () => {
    const malformed = entrySnapshot();
    delete (malformed.attributionSnapshot as Record<string, unknown>).customerBindingKey;
    const repository = createSupabaseProgramCommissionLedgerRepository(
      fakeClient({ row: ledgerRow(malformed) }),
    );
    await expect(repository.findEntryByMoneyEvidenceRef("settlement:1"))
      .rejects.toThrow(/customer binding key/);
  });

  it("fails closed when an outer PostgREST row disagrees with its immutable snapshot", async () => {
    const row = ledgerRow(entrySnapshot());
    row.commission_delta_cents = "24999";
    const repository = createSupabaseProgramCommissionLedgerRepository(fakeClient({ row }));
    await expect(repository.findEntryByMoneyEvidenceRef("settlement:1"))
      .rejects.toThrow(/row\/snapshot mismatch/);
  });

  it("fails closed when the atomic RPC is missing or unavailable", async () => {
    const repository = createSupabaseProgramCommissionLedgerRepository(
      fakeClient({ rpcError: "function research_program_commission_commit does not exist" }),
    );
    await expect(repository.commit({} as StoredCommissionOperation, 0))
      .rejects.toThrow(/atomic commit failed closed/);
  });
});
