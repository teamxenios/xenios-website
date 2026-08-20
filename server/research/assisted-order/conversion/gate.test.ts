// The conversion gate's proof, and the lane's end-to-end proof: a request that
// really was quoted, really was accepted and really was paid becomes exactly
// one canonical order carrying the price the customer agreed to — and every
// path that skips one of those words refuses.

import { describe, expect, it, vi } from "vitest";
import {
  convertToCanonicalOrder,
  type CanonicalOrderActor,
  type CanonicalOrderShippingSnapshot,
} from "../../orders/canonical-order";
import { createInMemoryCanonicalOrderRepository } from "../../orders/memory-repository";
import { InMemoryAssistedOrderPaymentRepository } from "../payment/memory-repository";
import type {
  AssistedOrderPaymentDependencies,
  AssistedOrderPaymentRecord,
} from "../payment/ports";
import { AssistedOrderPaymentService } from "../payment/service";
import type { AssistedOrderViewer } from "../ports";
import {
  adjudicateAssistedRequestConversion,
  isRequestFulfillmentReady,
  type AcceptedQuoteSnapshot,
} from "./gate";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const REFERENCE = "XRR-20260819-ABCDEF0123";
const QUOTE_ID = "quote-1";
const ACCEPTANCE_ID = "acceptance-1";
const UNIT_CENTS = 12_400;
const QUANTITY = 2;
const SUBTOTAL_CENTS = UNIT_CENTS * QUANTITY;
const SHIPPING_CENTS = 1_500;
const MAX_QTY = 100;

const admin: CanonicalOrderActor = { actor: "admin", actorId: "ops@xenios" };

const shipping: CanonicalOrderShippingSnapshot = {
  recipient: "Dr Ada Lovelace",
  addressLines: ["1 Analytical Way"],
  city: "Austin",
  region: "TX",
  postalCode: "78701",
  country: "US",
  serviceLabel: "Standard",
};

function quoteSnapshot(
  overrides: Partial<AcceptedQuoteSnapshot> = {},
): AcceptedQuoteSnapshot {
  return Object.freeze({
    quoteId: QUOTE_ID,
    requestId: REQUEST_ID,
    requestPublicReference: REFERENCE,
    version: 3,
    state: "accepted",
    totalCents: SUBTOTAL_CENTS,
    currency: "USD" as const,
    acceptanceId: ACCEPTANCE_ID,
    acceptedAt: "2026-08-19T11:00:00.000Z",
    lines: [
      {
        lineId: "line-1",
        productId: "pc_product_1",
        variantId: "pc_variant_1",
        productName: "BPC-157 5 mg",
        quantity: QUANTITY,
        unitPriceCents: UNIT_CENTS,
        lineTotalCents: UNIT_CENTS * QUANTITY,
      },
    ],
    ...overrides,
  });
}

function paymentRecord(
  overrides: Partial<AssistedOrderPaymentRecord> = {},
): AssistedOrderPaymentRecord {
  return Object.freeze({
    paymentId: "pay-1",
    requestId: REQUEST_ID,
    requestPublicReference: REFERENCE,
    state: "paid" as const,
    revision: 5,
    amountDueCents: SUBTOTAL_CENTS,
    currency: "USD" as const,
    quoteId: QUOTE_ID,
    quoteVersion: 3,
    acceptanceId: ACCEPTANCE_ID,
    instructions: null,
    proofs: [],
    settlement: {
      settlementId: "settle-1",
      verifiedAmountCents: SUBTOTAL_CENTS,
      currency: "USD" as const,
      verifiedAt: "2026-08-19T12:00:00.000Z",
      verifiedByLabel: "finance@xeniostechnology.com",
      verifiedByKind: "admin" as const,
      evidenceRef: "bank-ref-1",
      settlementUniqueKey: "assisted-order-payment-settlement:pay-1",
    },
    refund: null,
    exceptionReason: null,
    history: [],
    openedAt: "2026-08-19T11:30:00.000Z",
    updatedAt: "2026-08-19T12:00:00.000Z",
    settledAt: "2026-08-19T12:00:00.000Z",
    ...overrides,
  }) as AssistedOrderPaymentRecord;
}

function adjudicate(
  overrides: {
    quote?: AcceptedQuoteSnapshot;
    payment?: AssistedOrderPaymentRecord | null;
    requirePaid?: boolean;
    affiliateCode?: string | null;
    maxQuantityPerVariant?: number;
  } = {},
) {
  return adjudicateAssistedRequestConversion(
    {
      quote: overrides.quote ?? quoteSnapshot(),
      payment:
        overrides.payment === undefined ? paymentRecord() : overrides.payment,
      customer: { customerRef: "cust-ref-1", memberId: "member-1" },
      shipping,
      shippingCents: SHIPPING_CENTS,
      affiliateCode:
        overrides.affiliateCode === undefined ? "XENIOS-ADA" : overrides.affiliateCode,
      convertedBy: admin,
      at: new Date("2026-08-19T13:00:00.000Z"),
      maxQuantityPerVariant: overrides.maxQuantityPerVariant ?? MAX_QTY,
    },
    { requirePaid: overrides.requirePaid ?? false },
  );
}

// ---------------------------------------------------------------------------

describe("the conversion gate builds an exact, frozen conversion", () => {
  it("carries the accepted quote's price, not a fresh one", () => {
    const result = adjudicate();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.input.lines).toEqual([
      {
        sku: "pc_variant_1",
        displayName: "BPC-157 5 mg",
        quantity: QUANTITY,
        unitPriceCents: UNIT_CENTS,
      },
    ]);
    expect(result.input.expectedTotalCents).toBe(
      SUBTOTAL_CENTS + SHIPPING_CENTS,
    );
  });

  it("carries the request lineage and the acceptance evidence", () => {
    const result = adjudicate();
    if (!result.ok) throw new Error("expected ok");
    expect(result.input.source).toEqual({
      kind: "assisted_request_quote",
      sourceRef: REFERENCE,
      requestRef: REFERENCE,
    });
    expect(result.input.acceptance).toEqual({
      quoteRef: QUOTE_ID,
      acceptanceId: ACCEPTANCE_ID,
      acceptedAt: "2026-08-19T11:00:00.000Z",
    });
  });

  it("copies the affiliate code onto the order without touching the money", () => {
    const withCode = adjudicate({ affiliateCode: "XENIOS-ADA" });
    const withoutCode = adjudicate({ affiliateCode: null });
    if (!withCode.ok || !withoutCode.ok) throw new Error("expected ok");
    expect(withCode.input.attribution).toEqual({
      affiliateAttributionRef: "XENIOS-ADA",
    });
    expect(withoutCode.input.attribution).toBeNull();
    // The code changed nothing else.
    expect(withCode.input.expectedTotalCents).toBe(
      withoutCode.input.expectedTotalCents,
    );
    expect(withCode.input.lines).toEqual(withoutCode.input.lines);
  });

  it("emits payment evidence only when money is real", () => {
    const paid = adjudicate();
    const unpaid = adjudicate({
      payment: paymentRecord({
        state: "under_review",
        settlement: null,
        settledAt: null,
      }),
    });
    if (!paid.ok || !unpaid.ok) throw new Error("expected ok");
    expect(paid.input.payment).toMatchObject({
      verificationId: "settle-1",
      verifiedBy: "finance@xeniostechnology.com",
    });
    expect(unpaid.input.payment).toBeNull();
  });
});

describe("a stale quote refuses", () => {
  it("refuses when the payment covers an older quote version", () => {
    const result = adjudicate({
      quote: quoteSnapshot({ version: 4 }),
      payment: paymentRecord({ quoteVersion: 3 }),
    });
    expect(result).toMatchObject({ ok: false, code: "QUOTE_STALE" });
  });

  it("refuses when the payment points at a different quote entirely", () => {
    const result = adjudicate({
      payment: paymentRecord({ quoteId: "quote-other" }),
    });
    expect(result).toMatchObject({ ok: false, code: "LINEAGE_MISMATCH" });
  });

  it("refuses when the acceptance id does not match", () => {
    const result = adjudicate({
      payment: paymentRecord({ acceptanceId: "acceptance-other" }),
    });
    expect(result).toMatchObject({ ok: false, code: "LINEAGE_MISMATCH" });
  });

  it("refuses a quote that was never accepted", () => {
    const result = adjudicate({
      quote: quoteSnapshot({ state: "issued", acceptanceId: null }),
    });
    expect(result).toMatchObject({ ok: false, code: "QUOTE_NOT_ACCEPTED" });
  });

  it("refuses a quote that expired or was superseded after acceptance", () => {
    const result = adjudicate({
      quote: quoteSnapshot({ state: "expired" }),
    });
    expect(result).toMatchObject({ ok: false, code: "QUOTE_NOT_ACCEPTED" });
  });
});

describe("a cross-customer payment refuses", () => {
  it("refuses a payment belonging to another request", () => {
    const result = adjudicate({
      payment: paymentRecord({
        requestId: "00000000-0000-4000-8000-0000000000ff",
      }),
    });
    expect(result).toMatchObject({ ok: false, code: "LINEAGE_MISMATCH" });
  });

  it("refuses an amount owed that disagrees with the accepted total", () => {
    const result = adjudicate({
      payment: paymentRecord({ amountDueCents: SUBTOTAL_CENTS - 1 }),
    });
    expect(result).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
});

describe("an unpaid request cannot become fulfillment-ready", () => {
  const unsettledStates = [
    "payment_required",
    "instructions_presented",
    "proof_submitted",
    "under_review",
    "rejected",
    "exception",
    "refunded",
  ] as const;

  it.each(unsettledStates)("refuses release while %s", (state) => {
    const result = adjudicate({
      payment: paymentRecord({ state, settlement: null, settledAt: null }),
      requirePaid: true,
    });
    expect(result).toMatchObject({ ok: false, code: "PAYMENT_NOT_SETTLED" });
  });

  it("refuses release when no payment exists at all", () => {
    const result = adjudicate({ payment: null, requirePaid: true });
    expect(result).toMatchObject({ ok: false, code: "PAYMENT_MISSING" });
  });

  it("reports a settled payment as ready and everything else as not", () => {
    expect(isRequestFulfillmentReady(paymentRecord())).toBe(true);
    expect(isRequestFulfillmentReady(null)).toBe(false);
    for (const state of unsettledStates) {
      expect(
        isRequestFulfillmentReady(paymentRecord({ state, settlement: null })),
      ).toBe(false);
    }
  });

  it("still converts an accepted-but-unpaid request, marked unready", () => {
    const result = adjudicate({
      payment: paymentRecord({
        state: "instructions_presented",
        settlement: null,
        settledAt: null,
      }),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fulfillmentReady).toBe(false);
    expect(result.input.payment).toBeNull();
  });

  it("treats a refunded payment as not ready, even though it once was paid", () => {
    const refunded = paymentRecord({ state: "refunded" });
    expect(isRequestFulfillmentReady(refunded)).toBe(false);
    const result = adjudicate({ payment: refunded, requirePaid: true });
    expect(result).toMatchObject({ ok: false, code: "PAYMENT_NOT_SETTLED" });
  });
});

describe("missing price never becomes zero", () => {
  it("refuses a line with a zero unit price", () => {
    const result = adjudicate({
      quote: quoteSnapshot({
        totalCents: 0,
        lines: [
          {
            lineId: "line-1",
            productId: "p",
            variantId: "v",
            productName: "Syringes & Alcohol Swabs",
            quantity: 1,
            unitPriceCents: 0,
            lineTotalCents: 0,
          },
        ],
      }),
      payment: null,
    });
    expect(result).toMatchObject({ ok: false, code: "PRICE_MISSING" });
  });

  it("refuses a line whose price is missing entirely", () => {
    const result = adjudicate({
      quote: quoteSnapshot({
        lines: [
          {
            lineId: "line-1",
            productId: "p",
            variantId: "v",
            productName: "BAM15 500 mcg",
            quantity: 1,
            unitPriceCents: undefined as unknown as number,
            lineTotalCents: 0,
          },
        ],
      }),
      payment: null,
    });
    expect(result).toMatchObject({ ok: false, code: "PRICE_MISSING" });
  });

  it("refuses a quote whose stored total disagrees with its own lines", () => {
    const result = adjudicate({
      quote: quoteSnapshot({ totalCents: SUBTOTAL_CENTS + 5_000 }),
      payment: null,
    });
    expect(result).toMatchObject({ ok: false, code: "TOTAL_MISMATCH" });
  });
});

describe("quantity", () => {
  function withQuantity(quantity: number) {
    const unit = 100;
    return adjudicate({
      quote: quoteSnapshot({
        totalCents: unit * quantity,
        lines: [
          {
            lineId: "line-1",
            productId: "p",
            variantId: "v",
            productName: "Item",
            quantity,
            unitPriceCents: unit,
            lineTotalCents: unit * quantity,
          },
        ],
      }),
      payment: null,
    });
  }

  it("accepts 100 of one exact variant", () => {
    expect(withQuantity(100).ok).toBe(true);
  });

  it("refuses 101", () => {
    expect(withQuantity(101)).toMatchObject({
      ok: false,
      code: "QUANTITY_EXCEEDED",
    });
  });

  it("sums repeated lines of the same variant before comparing", () => {
    const unit = 100;
    const result = adjudicate({
      quote: quoteSnapshot({
        totalCents: unit * 120,
        lines: [
          {
            lineId: "a",
            productId: "p",
            variantId: "v",
            productName: "Item",
            quantity: 60,
            unitPriceCents: unit,
            lineTotalCents: unit * 60,
          },
          {
            lineId: "b",
            productId: "p",
            variantId: "v",
            productName: "Item",
            quantity: 60,
            unitPriceCents: unit,
            lineTotalCents: unit * 60,
          },
        ],
      }),
      payment: null,
    });
    expect(result).toMatchObject({ ok: false, code: "QUANTITY_EXCEEDED" });
  });

  it("follows the injected limit rather than a second hardcoded copy", () => {
    expect(
      adjudicate({
        quote: quoteSnapshot(),
        payment: null,
        maxQuantityPerVariant: 1,
      }),
    ).toMatchObject({ ok: false, code: "QUANTITY_EXCEEDED" });
  });
});

// ---------------------------------------------------------------------------
// End to end: the whole loop, through the real engines.
// ---------------------------------------------------------------------------

describe("request -> quote -> payment -> exactly one canonical order", () => {
  const memberViewer: AssistedOrderViewer = Object.freeze({
    actorType: "member",
    memberId: "member-1",
    earlyAccessSessionHash: null,
    normalizedEmail: "member@example.com",
    actorLabel: "member@example.com",
    capabilities: new Set(["assisted_orders:read_own"]),
  });
  const adminViewer: AssistedOrderViewer = Object.freeze({
    actorType: "admin",
    memberId: null,
    earlyAccessSessionHash: null,
    normalizedEmail: "ops@xeniostechnology.com",
    actorLabel: "ops@xeniostechnology.com",
    capabilities: new Set(["assisted_orders:manage"]),
  });
  const verifierViewer: AssistedOrderViewer = Object.freeze({
    actorType: "admin",
    memberId: null,
    earlyAccessSessionHash: null,
    normalizedEmail: "finance@xeniostechnology.com",
    actorLabel: "finance@xeniostechnology.com",
    capabilities: new Set(["assisted_orders:manage"]),
  });

  function paymentService() {
    let sequence = 0;
    const deps: AssistedOrderPaymentDependencies = {
      repository: new InMemoryAssistedOrderPaymentRepository(),
      quotes: {
        acceptedQuoteFor: async () => ({
          quoteId: QUOTE_ID,
          requestId: REQUEST_ID,
          requestPublicReference: REFERENCE,
          version: 3,
          state: "accepted",
          totalCents: SUBTOTAL_CENTS,
          currency: "USD" as const,
          acceptanceId: ACCEPTANCE_ID,
          acceptedAt: "2026-08-19T11:00:00.000Z",
          validUntil: "2026-08-26T11:00:00.000Z",
        }),
      },
      requests: {
        byPublicReference: async (reference) =>
          reference === REFERENCE
            ? {
                requestId: REQUEST_ID,
                publicReference: REFERENCE,
                actorMemberId: "member-1",
                earlyAccessSessionHash: null,
                normalizedEmail: "member@example.com",
              }
            : null,
      },
      verification: {
        verifierFor: async (viewer) =>
          viewer.actorLabel === "finance@xeniostechnology.com"
            ? { adminId: "admin-finance", label: "finance@xeniostechnology.com" }
            : null,
      },
      instructions: {
        compose: async (input) => ({
          methodCode: input.methodCode,
          methodLabel: "Bank transfer",
          body: "Send the amount quoting your reference.",
          expiresAt: "2026-08-26T12:00:00.000Z",
        }),
      },
      audit: { record: vi.fn(async () => undefined) },
      clock: { now: () => new Date("2026-08-19T12:00:00.000Z") },
      ids: {
        uuid: () => {
          sequence += 1;
          return `id-${sequence}`;
        },
      },
    };
    return new AssistedOrderPaymentService(deps);
  }

  async function paidPayment() {
    const service = paymentService();
    const opened = await service.open(adminViewer, REQUEST_ID);
    await service.presentInstructions(adminViewer, opened.paymentId, "wire");
    await service.submitProof(memberViewer, REFERENCE, {
      paymentId: opened.paymentId,
      customerReference: "WIRE-1",
      note: "",
      idempotencyKey: "k1",
    });
    await service.beginReview(adminViewer, opened.paymentId);
    await service.markPaid(verifierViewer, {
      paymentId: opened.paymentId,
      verifiedAmountCents: SUBTOTAL_CENTS,
      evidenceRef: "bank-ref-1",
    });
    return service.adminRecord(adminViewer, opened.paymentId);
  }

  it("mints one order carrying the sold price, and replays a duplicate", async () => {
    const payment = await paidPayment();
    const decision = adjudicate({ payment });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    expect(decision.fulfillmentReady).toBe(true);

    const repository = createInMemoryCanonicalOrderRepository();
    const first = await convertToCanonicalOrder(decision.input, repository);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.replayed).toBe(false);
    expect(first.order.paymentState).toBe("paid");
    expect(first.order.totalCents).toBe(SUBTOTAL_CENTS + SHIPPING_CENTS);
    expect(first.order.lines[0].unitPriceCents).toBe(UNIT_CENTS);
    expect(first.order.attribution).toEqual({
      affiliateAttributionRef: "XENIOS-ADA",
    });
    expect(first.order.source.requestRef).toBe(REFERENCE);

    // The duplicate conversion. Same source, same content, one order.
    const second = await convertToCanonicalOrder(decision.input, repository);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.replayed).toBe(true);
    expect(second.order.orderNumber).toBe(first.order.orderNumber);
  });

  it("mints an awaiting_payment order for an accepted but unpaid request", async () => {
    const service = paymentService();
    const opened = await service.open(adminViewer, REQUEST_ID);
    await service.presentInstructions(adminViewer, opened.paymentId, "wire");
    const payment = await service.adminRecord(adminViewer, opened.paymentId);

    const decision = adjudicate({ payment });
    if (!decision.ok) throw new Error("expected ok");
    expect(decision.fulfillmentReady).toBe(false);

    const repository = createInMemoryCanonicalOrderRepository();
    const converted = await convertToCanonicalOrder(decision.input, repository);
    expect(converted.ok).toBe(true);
    if (!converted.ok) return;
    expect(converted.order.paymentState).toBe("awaiting_payment");
    expect(converted.order.paymentEvidence).toBeNull();
    // And the request is still not releasable.
    expect(isRequestFulfillmentReady(payment)).toBe(false);
  });

  it("refuses a conversion input that smuggles its own total", async () => {
    const payment = await paidPayment();
    const decision = adjudicate({ payment });
    if (!decision.ok) throw new Error("expected ok");

    const hostile = {
      ...decision.input,
      totalCents: 1,
      subtotalCents: 1,
    };
    const repository = createInMemoryCanonicalOrderRepository();
    const result = await convertToCanonicalOrder(hostile, repository);
    expect(result).toMatchObject({ ok: false, code: "CLIENT_TOTAL_REFUSED" });
  });
});
