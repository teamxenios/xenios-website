import { describe, expect, it } from "vitest";

import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { InMemoryEarlyAccessCartStore } from "./store";
import {
  recordEarlyAccessCartExternalProof,
  settleEarlyAccessCart,
  type EarlyAccessCartSettlementDeps,
} from "./settlement";
import type { EarlyAccessCartSettlementStore } from "./ports";

const grant = Object.freeze({
  referralCode: "XEN-PARTNER-7",
  affiliateId: "aff_partner_7",
  affiliateCustomerRef: "eac_ffffffffffffffffffffffffffffffff",
  holdBasisPoints: 1_500,
});

const referrals = { async forCustomer() { return grant; } };
const noReferrals = { async forCustomer() { return null; } };

function checkout(attributed: boolean): EarlyAccessCartCheckoutRecord {
  return {
    cartCheckoutNumber: "XEC-0123456789ABCDEF",
    customerRef: "eac_0123456789abcdef0123456789abcdef",
    contact: { email: "buyer@example.com", phone: "+15125550100" },
    shipTo: { recipientName: "Buyer", line1: "1 Main", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" },
    idempotencyKey: "xeac_1234567890123456",
    intentHash: "a".repeat(64),
    quoteId: "xeaq_1234567890123456",
    children: [{ orderNumber: "XEA-CART-01234567-01", productId: "P", variantId: "V", sku: "SKU", quantity: 3, supplierId: "raw-peptides", supplierSku: "RP-1", unitPriceCents: 19_900, subtotalCents: 59_700, discountCents: 11_940, payableCents: 47_760 }],
    invoice: { invoiceNumber: "XEI-0123456789ABCDEF", cartCheckoutNumber: "XEC-0123456789ABCDEF", paymentReference: "XEACART-0123456789ABCDEF", currency: "USD", lines: [{ orderNumber: "XEA-CART-01234567-01", sku: "SKU", quantity: 3, unitPriceCents: 19_900, subtotalCents: 59_700, discountCents: 11_940, payableCents: 47_760 }], subtotalCents: 59_700, discountCents: 11_940, shippingCents: 0, taxCents: 0, payableTotalCents: 47_760, instructions: "manual", issuedAt: "2026-08-18T00:00:00.000Z", status: "awaiting_payment" },
    paymentState: "awaiting_payment",
    placedAt: "2026-08-18T00:00:00.000Z",
    attribution: attributed
      ? {
          affiliateId: "aff_partner_7",
          codeId: "XEN-PARTNER-7",
          campaignId: null,
          method: "referral_session",
          attributedAt: "2026-08-01T00:00:00.000Z",
          expiresAt: "2026-10-30T00:00:00.000Z",
          scheduleId: null,
          scheduleVersion: null,
        }
      : null,
  };
}

async function placedWithProof(record: EarlyAccessCartCheckoutRecord) {
  const store = new InMemoryEarlyAccessCartStore();
  await store.commit(record);
  const proof = await recordEarlyAccessCartExternalProof(
    { checkouts: store, settlements: store },
    {
      cartCheckoutNumber: record.cartCheckoutNumber,
      sha256: "b".repeat(64),
      filename: "proof.png",
      contentType: "image/png",
      byteSize: 100,
      provenanceNote: "Received by the named operator off platform",
      actorId: "admin@example.com",
      at: "2026-08-19T00:01:00.000Z",
    },
  );
  expect(proof.committed).toBe(true);
  return store;
}

function settleInput(at = "2026-08-19T00:02:00.000Z") {
  return {
    cartCheckoutNumber: "XEC-0123456789ABCDEF",
    externalTransactionId: "TX-Cart-Commission-001",
    confirmedFundsReceived: true,
    confirmedAmountAndReference: true,
    actorId: "admin@example.com",
    at,
  };
}

describe("cart settlement commission hold", () => {
  it("a settlement WITHOUT attribution writes no commission and needs no resolver", async () => {
    const store = await placedWithProof(checkout(false));
    const settled = await settleEarlyAccessCart(
      { checkouts: store, settlements: store, referrals },
      settleInput(),
    );
    expect(settled.committed).toBe(true);
    expect(store.commissionEvents()).toEqual([]);
  });

  it("an attributed settlement holds the commission atomically with the money", async () => {
    const store = await placedWithProof(checkout(true));
    const settled = await settleEarlyAccessCart(
      { checkouts: store, settlements: store, referrals },
      settleInput(),
    );
    expect(settled.committed).toBe(true);
    const events = store.commissionEvents();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      orderReference: "XEC-0123456789ABCDEF",
      affiliateId: "aff_partner_7",
      referralCode: "XEN-PARTNER-7",
      // 15 percent of the 47,760 subtotal-less-discount basis. Never of the
      // 59,700 pre-discount subtotal, and never of the payable total.
      commissionBasisCents: 47_760,
      commissionAmountCents: 7_164,
      payout: false,
    });
  });

  it("a duplicate settlement event does not double-accrue", async () => {
    const store = await placedWithProof(checkout(true));
    const first = await settleEarlyAccessCart(
      { checkouts: store, settlements: store, referrals },
      settleInput(),
    );
    expect(first.committed).toBe(true);
    const replay = await settleEarlyAccessCart(
      { checkouts: store, settlements: store, referrals },
      settleInput("2026-08-19T00:05:00.000Z"),
    );
    expect(replay).toMatchObject({ committed: false, reason: "already_settled" });
    expect(store.commissionEvents()).toHaveLength(1);
  });

  it("an attributed checkout with NO resolver wired refuses by name, settling nothing", async () => {
    const store = await placedWithProof(checkout(true));
    const refused = await settleEarlyAccessCart(
      { checkouts: store, settlements: store },
      settleInput(),
    );
    expect(refused).toEqual({
      committed: false,
      reason: "commission_persistence_unavailable",
      settlement: null,
    });
    expect(await store.settlement("XEC-0123456789ABCDEF")).toBeNull();
    expect(store.commissionEvents()).toEqual([]);
  });

  it("a store without the atomic door refuses by name rather than half-writing", async () => {
    const store = await placedWithProof(checkout(true));
    // The same durable store, minus the one capability under test. This is the
    // production shape until the founder applies the candidate SQL.
    const withoutAtomicDoor: EarlyAccessCartSettlementStore = {
      recordExternalProof: (proof) => store.recordExternalProof(proof),
      externalProofs: (checkoutNumber) => store.externalProofs(checkoutNumber),
      settlement: (checkoutNumber) => store.settlement(checkoutNumber),
      commitSettlement: (input) => store.commitSettlement(input),
      status: (checkoutNumber) => store.status(checkoutNumber),
    };
    const deps: EarlyAccessCartSettlementDeps = {
      checkouts: store,
      settlements: withoutAtomicDoor,
      referrals,
    };
    const refused = await settleEarlyAccessCart(deps, settleInput());
    expect(refused).toEqual({
      committed: false,
      reason: "commission_persistence_unavailable",
      settlement: null,
    });
    expect(await store.settlement("XEC-0123456789ABCDEF")).toBeNull();
  });

  it("a revoked grant settles the money and holds nothing", async () => {
    const store = await placedWithProof(checkout(true));
    const settled = await settleEarlyAccessCart(
      { checkouts: store, settlements: store, referrals: noReferrals },
      settleInput(),
    );
    expect(settled.committed).toBe(true);
    expect(store.commissionEvents()).toEqual([]);
  });

  it("a grant re-pointed at another affiliate settles the money and credits NOBODY", async () => {
    const store = await placedWithProof(checkout(true));
    const settled = await settleEarlyAccessCart(
      {
        checkouts: store,
        settlements: store,
        referrals: { async forCustomer() { return { ...grant, affiliateId: "aff_other" }; } },
      },
      settleInput(),
    );
    expect(settled.committed).toBe(true);
    expect(store.commissionEvents()).toEqual([]);
  });
});
