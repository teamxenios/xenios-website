import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SupabaseEarlyAccessCommerceStore } from "./commerce-store";
import {
  SupabaseConsumedTokenStore,
  SupabaseEarlyAccessCustomerRepository,
  SupabaseSessionBindingStore,
} from "./identity";
import {
  SupabaseEarlyAccessAuditSink,
  SupabaseEarlyAccessReleaseLedger,
} from "./records";
import { SupabaseEarlyAccessProofStorage } from "./proof-storage";
import {
  SupabaseEarlyAccessAgreementGate,
  SupabaseEarlyAccessReferralResolver,
  SupabaseEarlyAccessShippingPolicy,
  SupabaseEarlyAccessSupplierDirectory,
} from "./commerce-ports";
import type { EarlyAccessPersistenceCall } from "./executor";
import type { EarlyAccessPlacement, EarlyAccessSettlement } from "../routes/store";

/**
 * The REAL database proof for Early Access durable persistence.
 *
 * Gated on XENIOS_TEST_PG_URL exactly like durable-restart.pg.test.ts: absent,
 * the whole suite self-skips so CI stays green with no database. The
 * migration verifier script (scripts/verify-early-access-commerce-migration.sh)
 * runs this suite against disposable PostgreSQL 16 AND 17 containers after an
 * apply-twice pass, which is where the PG16/PG17 acceptance evidence in the
 * handoff comes from.
 *
 * Everything here drives the REAL adapters against the REAL SQL: the only
 * fake anywhere is the transport (node-postgres instead of PostgREST).
 */

const PG_URL = process.env.XENIOS_TEST_PG_URL ?? "";
const run = PG_URL ? describe : describe.skip;

const MIGRATIONS = [
  "20260804120000_research_early_access_identity_persistence.sql",
  "20260804121000_research_early_access_commerce_persistence.sql",
  "20260804122000_research_early_access_supplier_operations.sql",
  "20260804123000_research_early_access_reservation_holds.sql",
  "20260804130000_research_early_access_unit_holds.sql",
  "20260804140000_research_early_access_settled_transaction_refs.sql",
] as const;

type Pool = import("pg").Pool;

let pool: Pool | null = null;

/** Named-notation RPC executor over node-postgres: the PostgREST stand-in. */
function pgQuery(active: () => Pool) {
  return async (call: EarlyAccessPersistenceCall): Promise<unknown> => {
    const entries = Object.entries(call.args);
    const named = entries.map(([key], index) => `${key} => $${index + 1}`).join(", ");
    const values = entries.map(([, value]) =>
      value !== null && typeof value === "object" ? JSON.stringify(value) : value,
    );
    const { rows } = await active().query(
      `select public.${call.fn}(${named}) as result`,
      values,
    );
    return rows[0]?.result ?? null;
  };
}

const CUSTOMER_REF = `eac_${"a".repeat(32)}`;
const AFFILIATE_REF = `eac_${"b".repeat(32)}`;

function buildPlacement(overrides: {
  orderNumber: string;
  idempotencyKey: string;
  placedAt?: string;
  payableTotalCents?: number;
}): EarlyAccessPlacement {
  const placedAt = overrides.placedAt ?? "2026-08-04T00:00:00.000Z";
  const payable = overrides.payableTotalCents ?? 20000;
  return {
    orderNumber: overrides.orderNumber,
    customerRef: CUSTOMER_REF,
    idempotencyKey: overrides.idempotencyKey,
    order: {
      idempotencyKey: overrides.idempotencyKey,
      order: {
        orderId: overrides.orderNumber,
        customerRef: CUSTOMER_REF,
        status: "awaiting_payment",
        currency: "USD",
        line: {
          productId: "prod-1",
          variantId: "var-1",
          sku: "XEN-BPC-10",
          quantity: 2,
          unitPriceCents: 10000,
          lineTotalCents: 20000,
          currency: "USD",
          pricedAt: "2026-08-01T00:00:00.000Z",
        },
        orderTotalCents: 20000,
        unitPriceVersion: "v1",
      },
      releaseId: "rel-1",
      productVersion: "a".repeat(64),
      promotion: null,
      money: {
        currency: "USD",
        subtotalCents: 20000,
        discountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        payableTotalCents: payable,
        promotionId: null,
        promotionVersion: null,
      },
    },
    invoice: {
      invoiceNumber: `XEAINV-${overrides.orderNumber}`,
      orderId: overrides.orderNumber,
      payableTotalCents: payable,
      currency: "USD",
      paymentReference: `XEAPAY-${overrides.orderNumber}`,
      status: "awaiting_payment",
      issuedAt: placedAt,
    },
    shipTo: {
      recipientName: "A Researcher",
      line1: "1 Lab Way",
      line2: null,
      city: "Houston",
      region: "TX",
      postalCode: "77002",
      country: "US",
    },
    supplier: { supplierId: "apex-labs", supplierSku: "APX-BPC-10" },
    attribution: null,
    paymentState: "awaiting_payment",
    placedAt,
  } as unknown as EarlyAccessPlacement;
}

function buildSettlement(orderNumber: string, externalTransactionId: string): EarlyAccessSettlement {
  return {
    orderNumber,
    verification: {
      orderId: orderNumber,
      idempotencyKey: `verify-${orderNumber}`,
      decision: "approve",
      actorId: "samuel.abc123def456",
      actorRole: "founder_admin",
      decidedAt: "2026-08-04T01:00:00.000Z",
      method: "manual_bank_review",
      reason: "Exact match against the stated reference.",
      reviewedProofId: `proof-${orderNumber}-1`,
      reviewedProofRef: "eaproof.abc",
      amountVerifiedCents: 20000,
      payableTotalCents: 20000,
      classification: "EXACT_MATCH",
    },
    verifiedOrder: {
      orderId: orderNumber,
      customerRef: CUSTOMER_REF,
      status: "payment_verified",
      productId: "prod-1",
      variantId: "var-1",
      sku: "XEN-BPC-10",
      quantity: 2,
      currency: "USD",
      orderTotalCents: 20000,
      verifiedAmountCents: 20000,
      referralCode: null,
      paymentMethod: "manual_bank_transfer",
      verifiedAt: "2026-08-04T01:00:00.000Z",
      verifiedByActorId: "samuel.abc123def456",
    },
    receipt: {
      receiptId: `early-access-receipt:${orderNumber}`,
      orderNumber,
      payableTotalCents: 20000,
      currency: "USD",
      issuedAt: "2026-08-04T01:00:00.000Z",
      issuedByActorId: "samuel.abc123def456",
    },
    ledgerEntry: {
      entryId: `early-access-verification:${orderNumber}`,
      orderNumber,
      amountCents: 20000,
      currency: "USD",
      externalTransactionId,
      recordedAt: "2026-08-04T01:00:00.000Z",
      recordedByActorId: "samuel.abc123def456",
    },
    supplierOrder: {
      releaseId: `early-access-supplier-release:${orderNumber}`,
      orderId: orderNumber,
      status: "released_to_supplier",
      releasedAt: "2026-08-04T01:00:00.000Z",
      releasedByActorId: "samuel.abc123def456",
    },
    supplierPacket: {
      releaseId: `early-access-supplier-release:${orderNumber}`,
      orderReference: orderNumber,
      supplierId: "apex-labs",
      supplierSku: "APX-BPC-10",
      quantity: 2,
      recipient: {
        recipientName: "A Researcher",
        line1: "1 Lab Way",
        line2: null,
        city: "Houston",
        region: "TX",
        postalCode: "77002",
        country: "US",
      },
    },
    outbox: {
      outboxId: `early-access-payment-confirmed:${orderNumber}`,
      orderNumber,
      kind: "early_access_payment_confirmed",
      queuedAt: "2026-08-04T01:00:00.000Z",
    },
    commission: null,
    settledAt: "2026-08-04T01:00:00.000Z",
  } as unknown as EarlyAccessSettlement;
}

run("Early Access durable persistence against real PostgreSQL", () => {
  const query = pgQuery(() => {
    if (!pool) throw new Error("pool not started");
    return pool;
  });
  const store = new SupabaseEarlyAccessCommerceStore({ query });

  beforeAll(async () => {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: PG_URL, max: 5 });

    // The browser-facing roles exist on Supabase; a disposable container
    // needs them so the revoke/grant hygiene actually executes and the RLS
    // denial tests mean something.
    for (const role of ["anon", "authenticated", "service_role"]) {
      await pool.query(
        `do $$ begin
           if not exists (select 1 from pg_roles where rolname = '${role}') then
             create role ${role} nologin;
           end if;
         end $$;`,
      );
    }

    // APPLY TWICE: the second pass must be a no-op, not an error.
    for (let pass = 0; pass < 2; pass += 1) {
      for (const file of MIGRATIONS) {
        const sql = readFileSync(join(process.cwd(), "supabase", "migrations", file), "utf8");
        await pool.query(sql);
      }
    }
  }, 120_000);

  afterAll(async () => {
    await pool?.end();
    pool = null;
  });

  it("identity: unique emails, single-use tokens, bind-once sessions", async () => {
    const customers = new SupabaseEarlyAccessCustomerRepository(query);
    const record = {
      id: "cust-1",
      userId: null,
      email: "First@Example.com",
      normalizedEmail: "first@example.com",
      legalName: "First Example",
      phone: null,
      status: "INVITED",
      approvedBy: "Samuel Boadu",
      approvedAt: null,
      approvalReason: "pilot cohort",
      audience: "PRIVATE_EARLY_ACCESS",
      createdAt: "2026-08-04T00:00:00.000Z",
      updatedAt: "2026-08-04T00:00:00.000Z",
    };
    expect((await customers.insert(record as never)).ok).toBe(true);
    const duplicate = await customers.insert({
      ...record,
      id: "cust-2",
    } as never);
    expect(duplicate).toEqual({ ok: false, code: "EMAIL_ALREADY_REGISTERED" });
    expect((await customers.findById("cust-1"))?.legalName).toBe("First Example");
    expect((await customers.findByNormalizedEmail("first@example.com"))?.id).toBe("cust-1");

    const approved = { ...record, status: "APPROVED", approvedAt: "2026-08-04T00:00:00.000Z" };
    await customers.update(approved as never);
    expect((await customers.findById("cust-1"))?.status).toBe("APPROVED");

    const tokens = new SupabaseConsumedTokenStore(query);
    expect(await tokens.consume("jti-0001-abcd")).toBe(true);
    expect(await tokens.consume("jti-0001-abcd")).toBe(false);

    const bindings = new SupabaseSessionBindingStore(query);
    const sessionId = "d".repeat(64);
    expect(await bindings.bind(sessionId, "cust-1")).toBe(true);
    expect(await bindings.bind(sessionId, "cust-1")).toBe(false);
    expect(await bindings.get(sessionId)).toBe("cust-1");
    expect(await bindings.get("e".repeat(64))).toBeNull();
  });

  it("placement: order, reservation, immutable line, immutable money, and invoice land together", async () => {
    const placement = buildPlacement({ orderNumber: "XEA-PG-0001", idempotencyKey: "idem-1" });
    const committed = await store.commitPlacement(placement);
    expect(committed.committed).toBe(true);

    if (!pool) throw new Error("pool");
    for (const table of [
      "research_early_access_placements",
      "research_early_access_reservations",
      "research_early_access_order_lines",
      "research_early_access_money_snapshots",
      "research_early_access_invoices",
    ]) {
      const { rows } = await pool.query(
        `select count(*)::int as n from public.${table} where order_number = $1`,
        ["XEA-PG-0001"],
      );
      expect({ table, n: rows[0].n }).toEqual({ table, n: 1 });
    }

    const replay = await store.commitPlacement(
      buildPlacement({ orderNumber: "XEA-PG-9999", idempotencyKey: "idem-1" }),
    );
    expect(replay.committed).toBe(false);
    if (!replay.committed) {
      expect(replay.reason).toBe("idempotency_key_taken");
      expect(replay.placement.orderNumber).toBe("XEA-PG-0001");
    }

    const read = await store.placementByOrderNumber("XEA-PG-0001");
    expect(read?.idempotencyKey).toBe("idem-1");
    expect(await store.placementByIdempotencyKey("idem-1")).not.toBeNull();
  });

  it("a placement whose invoice money disagrees with the order money is REFUSED whole", async () => {
    const drifted = buildPlacement({ orderNumber: "XEA-PG-0002", idempotencyKey: "idem-2" });
    (drifted as { invoice: { payableTotalCents: number } }).invoice.payableTotalCents = 19999;
    await expect(store.commitPlacement(drifted)).rejects.toThrow();
    if (!pool) throw new Error("pool");
    const { rows } = await pool.query(
      "select count(*)::int as n from public.research_early_access_placements where order_number = $1",
      ["XEA-PG-0002"],
    );
    // Nothing landed: not the placement, so not the invoice either.
    expect(rows[0].n).toBe(0);
  });

  it("proofs: chain sequence enforced, state moves to under_review and never further", async () => {
    const intake = {
      orderNumber: "XEA-PG-0001",
      record: {
        proofId: "proof-XEA-PG-0001-1",
        orderId: "XEA-PG-0001",
        storageRef: "eaproof." + "1".repeat(40),
        objectKey: "XEA-PG-0001/proof-1",
        filename: "receipt.png",
        contentType: "image/png",
        byteSize: 1024,
        method: "manual_bank_transfer",
        uploadedBy: CUSTOMER_REF,
        uploadedAt: "2026-08-04T00:30:00.000Z",
        sequence: 1,
        supersedesProofId: null,
      },
      sha256: "c".repeat(64),
      receivedAt: "2026-08-04T00:30:00.000Z",
    };
    const committed = await store.commitProof(intake as never);
    expect(committed.committed).toBe(true);
    expect((await store.placementByOrderNumber("XEA-PG-0001"))?.paymentState).toBe(
      "under_review",
    );

    const wrongSequence = await store.commitProof({
      ...intake,
      record: { ...intake.record, proofId: "proof-XEA-PG-0001-9", sequence: 5 },
    } as never);
    expect(wrongSequence).toEqual({ committed: false, reason: "chain_moved" });

    const unknownOrder = await store.commitProof({
      ...intake,
      orderNumber: "XEA-PG-NOPE",
    } as never);
    expect(unknownOrder).toEqual({ committed: false, reason: "order_unknown" });

    expect(await store.proofs("XEA-PG-0001")).toHaveLength(1);
    const review = await store.awaitingReview();
    expect(review.map((entry) => entry.orderNumber)).toContain("XEA-PG-0001");
  });

  it("settlement: exactly once, first verifier preserved, transaction reference single-use", async () => {
    const settlement = buildSettlement("XEA-PG-0001", "BANK-TXN-777");
    const committed = await store.commitSettlement(settlement);
    expect(committed.committed).toBe(true);

    // Concurrent replays: BOTH callers get the SAME stored settlement.
    const [a, b] = await Promise.all([
      store.commitSettlement(buildSettlement("XEA-PG-0001", "BANK-TXN-888")),
      store.commitSettlement(buildSettlement("XEA-PG-0001", "BANK-TXN-999")),
    ]);
    for (const replay of [a, b]) {
      expect(replay.committed).toBe(false);
      if (!replay.committed && replay.reason === "already_settled") {
        expect(
          (replay.settlement as { ledgerEntry: { externalTransactionId: string } }).ledgerEntry
            .externalTransactionId,
        ).toBe("BANK-TXN-777");
      } else {
        throw new Error("expected already_settled");
      }
    }

    // The eight facts landed once.
    if (!pool) throw new Error("pool");
    for (const table of [
      "research_early_access_settlements",
      "research_early_access_verifications",
      "research_early_access_receipts",
      "research_early_access_ledger_entries",
      "research_early_access_supplier_orders",
      "research_early_access_outbox",
    ]) {
      const { rows } = await pool.query(
        `select count(*)::int as n from public.${table} where order_number = $1`,
        ["XEA-PG-0001"],
      );
      expect({ table, n: rows[0].n }).toEqual({ table, n: 1 });
    }
    expect((await store.placementByOrderNumber("XEA-PG-0001"))?.paymentState).toBe(
      "payment_verified",
    );

    // One arrival of money pays ONE order: a second order cannot claim the
    // same external reference.
    const other = buildPlacement({ orderNumber: "XEA-PG-0003", idempotencyKey: "idem-3" });
    expect((await store.commitPlacement(other)).committed).toBe(true);
    const stolen = await store.commitSettlement(buildSettlement("XEA-PG-0003", "BANK-TXN-777"));
    expect(stolen).toEqual({
      committed: false,
      reason: "transaction_id_used",
      settlement: null,
    });
  });

  it("a settlement claiming the wrong amount or currency is an integrity fault, not a commit", async () => {
    const wrongAmount = buildSettlement("XEA-PG-0003", "BANK-TXN-AMT");
    (wrongAmount as { receipt: { payableTotalCents: number } }).receipt.payableTotalCents = 1;
    await expect(store.commitSettlement(wrongAmount)).rejects.toThrow();

    if (!pool) throw new Error("pool");
    const { rows } = await pool.query(
      "select count(*)::int as n from public.research_early_access_settlements where order_number = $1",
      ["XEA-PG-0003"],
    );
    expect(rows[0].n).toBe(0);
  });

  it("dispatch: only after settlement, sequenced, and one fulfillment forever", async () => {
    const beforeSettlement = await store.commitDispatchEvent({
      orderNumber: "XEA-PG-0003",
      kind: "notification_attempt",
      channel: "email",
      recipient: "supplier",
      reference: null,
      outcome: "sent",
      actorId: "samuel.abc123def456",
      at: "2026-08-04T02:00:00.000Z",
      sequence: 1,
    } as never);
    expect(beforeSettlement).toEqual({ committed: false, reason: "not_settled" });

    const event = {
      orderNumber: "XEA-PG-0001",
      kind: "notification_attempt",
      channel: "email",
      recipient: "supplier",
      reference: null,
      outcome: "sent",
      actorId: "samuel.abc123def456",
      at: "2026-08-04T02:00:00.000Z",
      sequence: 1,
    };
    expect(await store.commitDispatchEvent(event as never)).toEqual({ committed: true });
    expect(await store.commitDispatchEvent(event as never)).toEqual({
      committed: false,
      reason: "sequence_moved",
    });

    const tracking = {
      orderId: "XEA-PG-0001",
      carrier: "ups",
      trackingNumber: "1Z999",
      recordedAt: "2026-08-04T03:00:00.000Z",
      recordedByActorId: "samuel.abc123def456",
      sequence: 1,
    };
    expect(await store.commitTracking(tracking as never)).toEqual({ committed: true });

    const fulfillment = {
      orderId: "XEA-PG-0001",
      fulfilledAt: "2026-08-04T04:00:00.000Z",
      fulfilledByActorId: "samuel.abc123def456",
      commissionHold: null,
      commissionAccrual: null,
    };
    expect(await store.commitFulfillment(fulfillment as never)).toEqual({ committed: true });
    expect(await store.commitFulfillment(fulfillment as never)).toEqual({
      committed: false,
      reason: "already_fulfilled",
    });

    const dispatch = await store.dispatch("XEA-PG-0001");
    expect(dispatch.events).toHaveLength(1);
    expect(dispatch.tracking).toHaveLength(1);
    expect(dispatch.fulfillment).not.toBeNull();
  });

  it("reservation expiry after money was submitted raises ONE admin exception, resolved by a named human", async () => {
    const expiringStore = new SupabaseEarlyAccessCommerceStore({
      query,
      reservationTtlMinutes: 60,
    });
    // Placed two hours ago with a one-hour reservation: expired before money.
    const placement = buildPlacement({
      orderNumber: "XEA-PG-0004",
      idempotencyKey: "idem-4",
      placedAt: "2026-08-04T00:00:00.000Z",
    });
    expect((await expiringStore.commitPlacement(placement)).committed).toBe(true);

    const lateProof = {
      orderNumber: "XEA-PG-0004",
      record: {
        proofId: "proof-XEA-PG-0004-1",
        orderId: "XEA-PG-0004",
        storageRef: "eaproof." + "2".repeat(40),
        objectKey: "XEA-PG-0004/proof-1",
        filename: "receipt.png",
        contentType: "image/png",
        byteSize: 1024,
        method: "manual_bank_transfer",
        uploadedBy: CUSTOMER_REF,
        uploadedAt: "2026-08-04T02:00:00.000Z",
        sequence: 1,
        supersedesProofId: null,
      },
      sha256: "e".repeat(64),
      receivedAt: "2026-08-04T02:00:00.000Z",
    };
    expect((await expiringStore.commitProof(lateProof as never)).committed).toBe(true);
    // The money was NOT auto-anything: the order is under review as usual...
    expect((await store.placementByOrderNumber("XEA-PG-0004"))?.paymentState).toBe(
      "under_review",
    );
    // ...and a human decision item exists, exactly once.
    const open = (await query({
      fn: "research_early_access_open_admin_exceptions",
      args: {},
    })) as ReadonlyArray<{ kind: string; orderNumber: string; id: number }>;
    const exceptions = open.filter((entry) => entry.orderNumber === "XEA-PG-0004");
    expect(exceptions).toHaveLength(1);
    expect(exceptions[0]?.kind).toBe("reservation_expired_after_payment_submission");

    expect(
      await query({
        fn: "research_early_access_resolve_admin_exception",
        args: { p_id: exceptions[0]?.id, p_resolved_by: "Samuel Boadu" },
      }),
    ).toBe(true);
    const remaining = (await query({
      fn: "research_early_access_open_admin_exceptions",
      args: {},
    })) as ReadonlyArray<{ orderNumber: string }>;
    expect(remaining.filter((entry) => entry.orderNumber === "XEA-PG-0004")).toHaveLength(0);
  });

  it("supplier confirmations: recorded with the full SUPPLIER_CONFIRMED_ON_DEMAND shape, expiring, withdrawable", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query,
      now: () => Date.parse("2026-08-04T00:00:00.000Z"),
    });
    expect(await directory.forUnit("prod-9", "var-9")).toBeNull();

    const confirmation = {
      confirmationId: "conf-1",
      supplierOrg: "apex-labs",
      contact: { name: "Apex Ops", channel: "email", handle: "ops@apex.example" },
      productId: "prod-9",
      variantId: "var-9",
      sku: "XEN-TB-5",
      supplierSku: "APX-TB-5",
      strength: "5 mg",
      presentation: "lyophilized vial",
      maxQuantity: 10,
      fulfillmentLocation: "Houston, TX",
      fulfillmentMethod: "courier_handoff",
      targetHandoffHours: 72,
      shippingRequirements: "insulated mailer with gel pack",
      coldChainState: "cool",
      documentationState: "coa_pending",
      confirmedAt: "2026-08-03T00:00:00.000Z",
      expiresAt: "2026-08-10T00:00:00.000Z",
      confirmedBy: "Samuel Boadu",
      evidence: { channel: "email", reference: "thread-123" },
    };
    expect(
      await query({
        fn: "research_early_access_record_supplier_confirmation",
        args: { p_record: confirmation },
      }),
    ).toBe("recorded");
    expect(
      await query({
        fn: "research_early_access_record_supplier_confirmation",
        args: { p_record: confirmation },
      }),
    ).toBe("duplicate");

    expect(await directory.forUnit("prod-9", "var-9")).toEqual({
      supplierId: "apex-labs",
      supplierSku: "APX-TB-5",
    });

    // Past its expiry the unit is unsellable again.
    const lateDirectory = new SupabaseEarlyAccessSupplierDirectory({
      query,
      now: () => Date.parse("2026-08-11T00:00:00.000Z"),
    });
    expect(await lateDirectory.forUnit("prod-9", "var-9")).toBeNull();

    expect(
      await query({
        fn: "research_early_access_withdraw_supplier_confirmation",
        args: { p_confirmation_id: "conf-1", p_withdrawn_by: "Samuel Boadu" },
      }),
    ).toBe(true);
    expect(await directory.forUnit("prod-9", "var-9")).toBeNull();
  });

  it("agreements, shipping, and referral grants answer from their tables and fail closed when empty", async () => {
    const gate = new SupabaseEarlyAccessAgreementGate({
      query,
      required: [{ kind: "early_access_terms", version: "v1" }],
    });
    expect(await gate.accepted(CUSTOMER_REF)).toBe(false);
    expect(
      await query({
        fn: "research_early_access_record_agreement",
        args: {
          p_customer_ref: CUSTOMER_REF,
          p_kind: "early_access_terms",
          p_version: "v1",
          p_accepted_at: "2026-08-04T00:00:00.000Z",
          p_evidence: { channel: "portal" },
        },
      }),
    ).toBe(true);
    expect(await gate.accepted(CUSTOMER_REF)).toBe(true);

    const shipping = new SupabaseEarlyAccessShippingPolicy(query);
    const destination = {
      recipientName: "A Researcher",
      line1: "1 Lab Way",
      line2: null,
      city: "Houston",
      region: "TX",
      postalCode: "77002",
      country: "US",
    };
    expect(await shipping.serves(destination)).toBe(false);
    await query({
      fn: "research_early_access_allow_shipping_region",
      args: { p_country: "US", p_region: "TX", p_added_by: "Samuel Boadu" },
    });
    expect(await shipping.serves(destination)).toBe(true);
    expect(await shipping.serves({ ...destination, region: "AK" })).toBe(false);

    const referrals = new SupabaseEarlyAccessReferralResolver(query);
    expect(await referrals.forCustomer(CUSTOMER_REF)).toBeNull();
    await query({
      fn: "research_early_access_grant_referral",
      args: {
        p_customer_ref: CUSTOMER_REF,
        p_referral_code: "FRIEND10",
        p_affiliate_id: "aff-1",
        p_affiliate_customer_ref: AFFILIATE_REF,
        p_hold_basis_points: 1000,
      },
    });
    expect(await referrals.forCustomer(CUSTOMER_REF)).toEqual({
      referralCode: "FRIEND10",
      affiliateId: "aff-1",
      affiliateCustomerRef: AFFILIATE_REF,
      holdBasisPoints: 1000,
    });
  });

  it("proof objects: reserved once, constraint-checked in the database as well", async () => {
    const storage = new SupabaseEarlyAccessProofStorage({ query });
    const input = {
      objectKey: "XEA-PG-0001/proof-object-1",
      contentType: "image/png",
      byteSize: 2048,
      sha256: "f".repeat(64),
    };
    const handle = await storage.reserve(input);
    expect(handle).toMatch(/^eaproof\.[a-f0-9]{40}$/);
    expect(await storage.reserve(input)).toBeNull();

    // The database refuses what the adapter would have refused, so a future
    // caller that skips the adapter still cannot store junk.
    expect(
      await query({
        fn: "research_early_access_reserve_proof_object",
        args: {
          p_storage_ref: "eaproof." + "9".repeat(40),
          p_bucket_id: "research-ea-payment-proofs-production",
          p_object_key: "XEA-PG-0001/proof-object-2",
          p_content_type: "text/html",
          p_byte_size: 2048,
          p_sha256: "f".repeat(64),
        },
      }),
    ).toBeNull();
  });

  it("the release ledger and the audit trail persist and read back", async () => {
    const ledger = new SupabaseEarlyAccessReleaseLedger(query);
    const draft = {
      releaseId: "rel-pg-1",
      productId: "prod-1",
      variantId: "var-1",
      productVersion: "b".repeat(64),
      status: "approved",
      approvedPriceCents: 29900,
      currency: "USD",
      waivedBlockers: [],
      approvedQuantityLimit: 3,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Founder approved this unit for the private early access portal.",
      recordedAt: "2026-08-04T00:00:00.000Z",
    };
    expect((await ledger.append(draft)).ok).toBe(true);
    const duplicate = await ledger.append(draft);
    expect(duplicate).toEqual({ ok: false, code: "DUPLICATE_RELEASE_ID" });
    expect((await ledger.history("prod-1", "var-1")).map((entry) => entry.releaseId)).toContain(
      "rel-pg-1",
    );

    const audit = new SupabaseEarlyAccessAuditSink(query);
    await audit.record({
      event: "early_access.payment.confirmed",
      orderNumber: "XEA-PG-0001",
      actor: "samuel.abc123def456",
      at: "2026-08-04T01:00:00.000Z",
      detail: { payable: 20000, currency: "USD" },
    });
    if (!pool) throw new Error("pool");
    const { rows } = await pool.query(
      "select count(*)::int as n from public.research_early_access_audit_events where order_number = $1 and event = $2",
      ["XEA-PG-0001", "early_access.payment.confirmed"],
    );
    expect(rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("append-only: nothing, not even the owner, rewrites a ledger row or an audit row", async () => {
    if (!pool) throw new Error("pool");
    await expect(
      pool.query("update public.research_early_access_ledger_entries set amount_cents = 1"),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query("delete from public.research_early_access_audit_events"),
    ).rejects.toThrow(/append-only/);
    await expect(
      pool.query("update public.research_early_access_releases set status = 'revoked'"),
    ).rejects.toThrow(/append-only/);
  });

  it("RLS and grants: browser roles reach neither the tables nor the functions", async () => {
    if (!pool) throw new Error("pool");
    const client = await pool.connect();
    try {
      for (const role of ["anon", "authenticated"]) {
        await client.query(`set role ${role}`);
        await expect(
          client.query("select * from public.research_early_access_placements"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          client.query("select * from public.research_early_access_ledger_entries"),
        ).rejects.toThrow(/permission denied/);
        await expect(
          client.query(
            "select public.research_early_access_placement('XEA-PG-0001')",
          ),
        ).rejects.toThrow(/permission denied/);
        await client.query("reset role");
      }
      // service_role runs the functions but may NOT touch the tables directly.
      await client.query("set role service_role");
      const { rows } = await client.query(
        "select public.research_early_access_placement('XEA-PG-0001') as result",
      );
      expect(rows[0].result.orderNumber).toBe("XEA-PG-0001");
      await expect(
        client.query("select * from public.research_early_access_placements"),
      ).rejects.toThrow(/permission denied/);
      await client.query("reset role");
    } finally {
      client.release();
    }
  });

  it("reservation holds: idempotent insert, one per draft, pure transitions, append-only exceptions", async () => {
    const { SupabaseEarlyAccessReservationStore } = await import("./reservation-store");
    const holds = new SupabaseEarlyAccessReservationStore(query);
    const reservation = {
      reservationId: "res-pg-1",
      customerId: "cust-1",
      orderDraftId: "draft-pg-1",
      productId: "prod-1",
      variantId: "var-1",
      quantity: 2,
      supplierConfirmationId: "conf-1",
      createdAt: "2026-08-04T00:00:00.000Z",
      expiresAt: "2026-08-04T12:00:00.000Z",
      status: "active",
      createdByActorId: "samuel.abc123def456",
      createdByActorRole: "founder_admin",
      auditEventId: "audit-res-1",
    };
    expect(await holds.insert(reservation as never)).toBe(true);
    // Replayed id: false, idempotent, never a throw.
    expect(await holds.insert(reservation as never)).toBe(false);
    // A SECOND reservation for the SAME draft is refused at insert.
    expect(
      await holds.insert({ ...reservation, reservationId: "res-pg-2" } as never),
    ).toBe(false);

    expect((await holds.byId("res-pg-1"))?.orderDraftId).toBe("draft-pg-1");
    expect((await holds.byOrderDraft("draft-pg-1"))?.reservationId).toBe("res-pg-1");
    expect(await holds.activeForUnit("prod-1", "var-1")).toHaveLength(1);

    // The pure module's transition persists; stored-active for the unit drops.
    expect(
      await holds.update({ ...reservation, status: "consumed" } as never),
    ).toBe(true);
    expect((await holds.byId("res-pg-1"))?.status).toBe("consumed");
    expect(await holds.activeForUnit("prod-1", "var-1")).toHaveLength(0);
    expect(
      await holds.update({ ...reservation, reservationId: "res-pg-9" } as never),
    ).toBe(false);

    const exception = {
      exceptionId: "exc-pg-1",
      reservationId: "res-pg-1",
      orderDraftId: "draft-pg-1",
      customerId: "cust-1",
      productId: "prod-1",
      variantId: "var-1",
      quantity: 2,
      supplierConfirmationId: "conf-1",
      reservationExpiredAt: "2026-08-04T12:00:00.000Z",
      paymentProofRef: "eaproof." + "3".repeat(40),
      payableTotalCents: 20000,
      currency: "USD",
      raisedAt: "2026-08-04T13:00:00.000Z",
      requiresHumanDecision: true,
      notifyAdmin: true,
      notifyCustomer: true,
    };
    expect(await holds.recordExpiryException(exception as never)).toBe(true);
    expect(await holds.recordExpiryException(exception as never)).toBe(false);
    expect((await holds.expiryExceptions()).map((entry) => entry.exceptionId)).toContain(
      "exc-pg-1",
    );

    // Append-only, even for the owner.
    if (!pool) throw new Error("pool");
    await expect(
      pool.query(
        "delete from public.research_early_access_reservation_expiry_exceptions",
      ),
    ).rejects.toThrow(/append-only/);
    // And the browser roles reach neither table nor functions.
    const client = await pool.connect();
    try {
      await client.query("set role anon");
      await expect(
        client.query("select * from public.research_early_access_reservation_holds"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        client.query("select public.research_early_access_reservation_by_id('res-pg-1')"),
      ).rejects.toThrow(/permission denied/);
      await client.query("reset role");
    } finally {
      client.release();
    }
  });

  it("settledTransactionRefs: every reference that ever settled, across ALL orders (F4)", async () => {
    // Runs after the settlement suite: XEA-PG-0001 settled with BANK-TXN-777.
    // A second order settles with its own reference; BOTH must be visible,
    // which is exactly the cross-order answer the classification needs.
    const second = buildPlacement({ orderNumber: "XEA-PG-0005", idempotencyKey: "idem-5" });
    expect((await store.commitPlacement(second)).committed).toBe(true);
    const settled = await store.commitSettlement(
      buildSettlement("XEA-PG-0005", "BANK-TXN-555"),
    );
    expect(settled.committed).toBe(true);

    const refs = await store.settledTransactionRefs();
    expect(refs).toContain("BANK-TXN-777");
    expect(refs).toContain("BANK-TXN-555");
    // Only settled references: the refused reuse attempts never joined.
    expect(refs).not.toContain("BANK-TXN-888");
    expect(refs).not.toContain("BANK-TXN-999");
    // Oldest settlement first, matching the in-memory insertion order.
    expect(refs.indexOf("BANK-TXN-777")).toBeLessThan(refs.indexOf("BANK-TXN-555"));

    // A restart forgets nothing: a second pool answers the same whole list.
    const { Pool } = await import("pg");
    const reborn = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const rebornStore = new SupabaseEarlyAccessCommerceStore({
        query: pgQuery(() => reborn),
      });
      expect(await rebornStore.settledTransactionRefs()).toEqual(refs);
    } finally {
      await reborn.end();
    }
  });

  it("supplier-confirmation PORT: insert, truthful byId, clock-derived liveness, caller-stamped withdraw", async () => {
    const { SupabaseSupplierConfirmationStore } = await import("./ops-stores");
    const store = new SupabaseSupplierConfirmationStore(query);
    const confirmation = {
      confirmationId: "conf-port-1",
      supplierOrg: "apex-labs",
      supplierContact: "Apex Ops, ops@apex.example",
      productId: "prod-10",
      variantId: "var-10",
      sku: "XEN-GHK-50",
      supplierSku: "APX-GHK-50",
      strength: "50 mg",
      presentation: "lyophilized vial",
      maxQuantity: 5,
      fulfillmentLocation: "Houston, TX",
      fulfillmentMethod: "courier_handoff",
      targetHandoffHours: 72,
      shippingRequirements: "insulated mailer with gel pack",
      coldChainState: "cool",
      documentationState: "coa_on_file",
      confirmedAt: "2026-08-03T00:00:00.000Z",
      expiresAt: "2026-08-10T00:00:00.000Z",
      confirmedBy: "Samuel Boadu",
      evidenceRef: "email thread-456",
      status: "active",
      withdrawnAt: null,
      withdrawnBy: null,
    };
    expect(await store.insert(confirmation as never)).toBe(true);
    expect(await store.insert(confirmation as never)).toBe(false);

    const read = await store.byId("conf-port-1");
    expect(read?.supplierContact).toBe("Apex Ops, ops@apex.example");
    expect(read?.evidenceRef).toBe("email thread-456");
    expect(read?.status).toBe("active");

    // Liveness is judged against the CALLER's instant.
    expect(
      (await store.liveForUnit("prod-10", "var-10", "2026-08-04T00:00:00.000Z"))
        ?.confirmationId,
    ).toBe("conf-port-1");
    expect(
      await store.liveForUnit("prod-10", "var-10", "2026-08-11T00:00:00.000Z"),
    ).toBeNull();

    // Withdrawal records the caller's named human and instant VERBATIM in the
    // canonical record, and ends liveness immediately.
    expect(
      await store.withdraw("conf-port-1", "Samuel Boadu", "2026-08-05T09:30:00.000Z"),
    ).toBe(true);
    const withdrawn = await store.byId("conf-port-1");
    expect(withdrawn?.status).toBe("withdrawn");
    expect(withdrawn?.withdrawnBy).toBe("Samuel Boadu");
    expect(withdrawn?.withdrawnAt).toBe("2026-08-05T09:30:00.000Z");
    expect(
      await store.liveForUnit("prod-10", "var-10", "2026-08-04T00:00:00.000Z"),
    ).toBeNull();
    expect(await store.withdraw("conf-port-none", "Samuel Boadu", "2026-08-05T00:00:00.000Z")).toBe(
      false,
    );
  });

  it("unit holds: recorded prohibitions survive, withdraw is a state change, rows never delete", async () => {
    const { SupabaseUnitHoldRegistry } = await import("./ops-stores");
    const registry = new SupabaseUnitHoldRegistry(query);
    const hold = {
      holdId: "hold-pg-1",
      kind: "REGULATORY_HOLD",
      productId: "prod-10",
      variantId: "var-10",
      reason: "Counsel moved the compound to regulatory hold.",
      recordedBy: "Samuel Boadu",
      recordedAt: "2026-08-04T00:00:00.000Z",
      status: "active",
      withdrawnBy: null,
      withdrawnAt: null,
    };
    expect(await registry.record(hold as never)).toBe(true);
    expect(await registry.record(hold as never)).toBe(false);
    expect(
      await registry.record({ ...hold, holdId: "hold-pg-2", kind: "STOP_SHIP" } as never),
    ).toBe(true);

    // Canonical blocker order, active only.
    expect(
      await registry.activeHoldsForUnit("prod-10", "var-10", "2026-08-04T01:00:00.000Z"),
    ).toEqual(["REGULATORY_HOLD", "STOP_SHIP"]);

    // Withdrawal is a recorded state change with the caller's stamp...
    expect(
      await registry.withdraw("hold-pg-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(true);
    // ...false on a repeat or an unknown id, exactly like the in-memory registry...
    expect(
      await registry.withdraw("hold-pg-1", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(false);
    expect(
      await registry.withdraw("hold-pg-none", "Samuel Boadu", "2026-08-05T00:00:00.000Z"),
    ).toBe(false);
    expect(
      await registry.activeHoldsForUnit("prod-10", "var-10", "2026-08-05T01:00:00.000Z"),
    ).toEqual(["STOP_SHIP"]);
    const withdrawnHold = await registry.byId("hold-pg-1");
    expect(withdrawnHold?.status).toBe("withdrawn");
    expect(withdrawnHold?.withdrawnAt).toBe("2026-08-05T00:00:00.000Z");

    // The row NEVER disappears: deletion is blocked for everyone, owner included.
    if (!pool) throw new Error("pool");
    await expect(
      pool.query("delete from public.research_early_access_unit_holds where hold_id = 'hold-pg-1'"),
    ).rejects.toThrow(/never deleted/);
    // Browser roles reach neither the table nor the reader function.
    const client = await pool.connect();
    try {
      await client.query("set role anon");
      await expect(
        client.query("select * from public.research_early_access_unit_holds"),
      ).rejects.toThrow(/permission denied/);
      await expect(
        client.query(
          "select public.research_early_access_active_hold_kinds_for_unit('prod-10','var-10')",
        ),
      ).rejects.toThrow(/permission denied/);
      await client.query("reset role");
    } finally {
      client.release();
    }
  });

  it("restart survival: a second, independent connection pool sees every fact", async () => {
    const { Pool } = await import("pg");
    const secondProcess = new Pool({ connectionString: PG_URL, max: 2 });
    try {
      const rebornStore = new SupabaseEarlyAccessCommerceStore({
        query: pgQuery(() => secondProcess),
      });
      const placement = await rebornStore.placementByOrderNumber("XEA-PG-0001");
      expect(placement?.paymentState).toBe("payment_verified");
      expect(await rebornStore.settlement("XEA-PG-0001")).not.toBeNull();
      expect((await rebornStore.dispatch("XEA-PG-0001")).fulfillment).not.toBeNull();
    } finally {
      await secondProcess.end();
    }
  });
});
