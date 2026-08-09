/**
 * ONE PAYMENT, ONE SETTLEMENT.
 *
 * These reproduce the exact defect the red team found: a settled transaction id
 * correctly refused a whitespace-padded copy of itself, while case and
 * separator variants of the SAME id settled a SECOND checkout as though they
 * were different payments. That is a money defect, so each reported variant is
 * pinned here by name rather than covered by one generic case.
 */

import { beforeEach, describe, expect, it } from "vitest";

import {
  CANONICAL_TRANSACTION_ID_MIN_LENGTH,
  canonicalTransactionId,
  sameTransactionIdentity,
} from "../hardening-contract";
import { InMemoryEarlyAccessCartStore } from "./store";
import { settleEarlyAccessCart } from "./settlement";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";

const SETTLED = "TX-Canonical-002";

/** Every spelling the red team proved could settle a separate checkout. */
const COSMETIC_VARIANTS = [
  "tx-canonical-002",
  "TX-CANONICAL-002",
  "TX Canonical 002",
  "  TX-Canonical-002  ",
  "tx_canonical_002",
  "TX.Canonical.002",
];

describe("canonical transaction identity", () => {
  it("collapses every reported variant onto one identity", () => {
    const canonical = canonicalTransactionId(SETTLED);
    expect(canonical).toBe("TXCANONICAL002");
    for (const variant of COSMETIC_VARIANTS) {
      expect(canonicalTransactionId(variant)).toBe(canonical);
      expect(sameTransactionIdentity(SETTLED, variant)).toBe(true);
    }
  });

  it("keeps genuinely different provider ids apart", () => {
    expect(sameTransactionIdentity("TX-Canonical-002", "TX-Canonical-003")).toBe(false);
    expect(sameTransactionIdentity("ZEL-9931", "ZEL-9932")).toBe(false);
    // A digit transposition is a different payment, not a spelling of one.
    expect(sameTransactionIdentity("TX-Canonical-002", "TX-Canonical-020")).toBe(false);
  });

  it("refuses an id with too little substance to be an identity", () => {
    expect(canonicalTransactionId("--")).toBeNull();
    expect(canonicalTransactionId("   ")).toBeNull();
    expect(canonicalTransactionId("A-1")).toBeNull();
    expect(canonicalTransactionId("AB12")).toBe("AB12");
    expect("AB12".length).toBe(CANONICAL_TRANSACTION_ID_MIN_LENGTH);
  });

  it("never matches an unusable id against anything, including another unusable one", () => {
    expect(sameTransactionIdentity("--", "--")).toBe(false);
    expect(sameTransactionIdentity("--", "TX-Canonical-002")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The behaviour that actually moves money.
// ---------------------------------------------------------------------------

function checkoutRecord(number: string): EarlyAccessCartCheckoutRecord {
  return Object.freeze({
    cartCheckoutNumber: number,
    customerRef: "eac_00000000000000000000000000000001",
    contact: Object.freeze({ email: "buyer@example.com", phone: "+15125550123" }),
    shipTo: Object.freeze({
      recipientName: "A Buyer",
      line1: "1 Main St",
      line2: null,
      city: "Austin",
      region: "TX",
      postalCode: "78701",
      country: "US" as const,
    }),
    idempotencyKey: `idem-${number}`,
    intentHash: `hash-${number}`,
    quoteId: `xeaq_${number}`,
    children: Object.freeze([]),
    invoice: Object.freeze({
      invoiceNumber: `XEI-${number.slice(4)}`,
      cartCheckoutNumber: number,
      paymentReference: `XEACART-${number.slice(4)}`,
      currency: "USD" as const,
      lines: Object.freeze([]),
      subtotalCents: 25_000,
      discountCents: 0,
      shippingCents: 0,
      taxCents: 0,
      payableTotalCents: 25_000,
      instructions: "Pay by Zelle.",
      issuedAt: "2026-08-09T00:00:00.000Z",
      status: "awaiting_payment" as const,
    }),
    paymentState: "awaiting_payment" as const,
    placedAt: "2026-08-09T00:00:00.000Z",
    attribution: null,
  }) as EarlyAccessCartCheckoutRecord;
}

const ONE = "XEC-AAAAAAAAAAAAAAAA1111";
const TWO = "XEC-BBBBBBBBBBBBBBBB2222";

describe("a cosmetic variant cannot settle a second checkout", () => {
  let store: InMemoryEarlyAccessCartStore;

  async function settle(checkoutNumber: string, transactionId: string) {
    const proof = await store.recordExternalProof(
      Object.freeze({
        evidenceRef: `eaext.${checkoutNumber}0000000000000000`,
        cartCheckoutNumber: checkoutNumber,
        sha256: "a".repeat(64),
        filename: "receipt.pdf",
        contentType: "application/pdf",
        byteSize: 1024,
        provenanceNote: "received by the operator off platform",
        recordedAt: "2026-08-09T01:00:00.000Z",
        recordedBy: "admin:samuel",
        storedOnPlatform: false,
      }),
    );
    expect(proof.committed).toBe(true);

    return settleEarlyAccessCart(
      { checkouts: store, settlements: store },
      {
        cartCheckoutNumber: checkoutNumber,
        evidenceRef: `eaext.${checkoutNumber}0000000000000000`,
        externalTransactionId: transactionId,
        verifiedAmountCents: 25_000,
        verifiedCurrency: "USD",
        actorId: "admin:samuel",
        at: "2026-08-09T02:00:00.000Z",
      },
    );
  }

  beforeEach(async () => {
    store = new InMemoryEarlyAccessCartStore();
    await store.commit(checkoutRecord(ONE));
    await store.commit(checkoutRecord(TWO));
    const first = await settle(ONE, SETTLED);
    expect(first.committed).toBe(true);
  });

  it.each(COSMETIC_VARIANTS)("refuses %s as transaction_id_used", async (variant) => {
    const second = await settle(TWO, variant);
    expect(second.committed).toBe(false);
    if (second.committed === false) {
      expect(second.reason).toBe("transaction_id_used");
    }
  });

  it("still admits a genuinely different payment on the second checkout", async () => {
    const second = await settle(TWO, "TX-Canonical-003");
    expect(second.committed).toBe(true);
  });

  it("refuses an id that canonicalizes to nothing usable", async () => {
    const second = await settle(TWO, "---");
    expect(second.committed).toBe(false);
    if (second.committed === false) {
      expect(second.reason).toBe("input_invalid");
    }
  });

  it("keeps the raw operator-typed id on the settlement record", async () => {
    const settlement = await store.settlement(ONE);
    // Reconciliation against a bank statement needs what was actually typed,
    // so the canonical form must not overwrite it.
    expect(settlement?.externalTransactionId).toBe(SETTLED);
  });
});
