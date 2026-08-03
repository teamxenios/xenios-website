import { describe, expect, it } from "vitest";
import type { CartPriceSnapshot } from "@shared/research/pricing";
import {
  computeQuoteHash,
  type CheckoutPriceQuote,
} from "../pricing/checkout-recompute";
import {
  buildPaymentMemo,
  createManualOrderInvoice,
  isMemoSafe,
  newOrderHumanRef,
  ORDER_HUMAN_REF_PATTERN,
  planManualPaymentVerification,
  planManualRefund,
  projectInvoiceForMember,
  reportManualPayment,
  revalidateCheckoutQuote,
  type HeldReservation,
  type ManualOrderInvoice,
  type ManualPaymentReport,
  type ManualPaymentVerificationPlan,
  type ProviderTransactionEvidence,
} from "./manual-order-payments";

// ---------------------------------------------------------------------------
// Fixtures. Every instant is explicit; nothing here reads a clock.
// ---------------------------------------------------------------------------

const QUOTED_AT = "2026-08-03T12:00:00.000Z";
const ISSUED_AT = "2026-08-03T12:00:05.000Z";
const EXPIRES_AT = "2026-08-10T12:00:00.000Z";

function line(
  sku: string,
  unitAmountCents: number,
  quantity: number,
): CartPriceSnapshot {
  return {
    productId: `prod-${sku}`,
    variantId: `var-${sku}`,
    sku,
    displayName: `Displayed ${sku}`,
    priceId: `price-${sku}`,
    priceVersion: 1,
    audience: "member",
    currency: "USD",
    unitAmountCents,
    quantity,
    lineTotalCents: unitAmountCents * quantity,
    effectiveAt: "2026-07-01T00:00:00.000Z",
    expiresAt: null,
    pricedAt: QUOTED_AT,
  };
}

function quoteOf(lines: CartPriceSnapshot[]): CheckoutPriceQuote {
  const subtotalCents = lines.reduce((sum, l) => sum + l.lineTotalCents, 0);
  return {
    lines,
    subtotalCents,
    currency: "USD",
    quotedAt: QUOTED_AT,
    quoteHash: computeQuoteHash(lines, subtotalCents, "USD", QUOTED_AT),
  };
}

const LINES = [line("SKU-A", 12_000, 2), line("SKU-B", 3_450, 1)];
const QUOTE = quoteOf(LINES);
const TOTAL = 27_450;

function invoiceOrThrow(): ManualOrderInvoice {
  const created = createManualOrderInvoice(
    {
      invoiceId: "inv-1",
      orderIntentId: "order-intent-1",
      memberId: "member-1",
      quote: QUOTE,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
      instructionsRef: "manual-payment-instructions/v1",
      receivingAccountRef: "receiving-account/primary",
    },
    () => "XRO-ABCD2345",
  );
  if (!created.ok) throw new Error(`fixture invoice refused: ${created.reason}`);
  return created.value;
}

function reportOrThrow(invoice: ManualOrderInvoice): ManualPaymentReport {
  const reported = reportManualPayment({
    invoice,
    memberId: "member-1",
    method: "bank_transfer",
    reference: "BANKREF-9911",
    amountCents: TOTAL,
    currency: "usd",
    reportedAt: "2026-08-04T09:00:00.000Z",
    claimedPaidAt: "2026-08-04T08:30:00.000Z",
  });
  if (!reported.ok) throw new Error(`fixture report refused: ${reported.reason}`);
  return reported.value;
}

const EVIDENCE: ProviderTransactionEvidence = {
  transactionId: "txn-77",
  method: "bank_transfer",
  reference: "BANKREF-9911",
  amountCents: TOTAL,
  currency: "USD",
  settledAt: "2026-08-04T08:45:00.000Z",
  observedFrom: "2026-08-01T00:00:00.000Z",
  observedTo: "2026-08-05T00:00:00.000Z",
};

const RESERVATIONS: HeldReservation[] = [
  { reservationId: "res-a", sku: "SKU-A", quantity: 2, expiresAt: "2026-08-06T00:00:00.000Z" },
  { reservationId: "res-b", sku: "SKU-B", quantity: 1, expiresAt: "2026-08-06T00:00:00.000Z" },
];

const VERIFIED_AT = "2026-08-04T10:00:00.000Z";

function verifyOrThrow(): ManualPaymentVerificationPlan {
  const invoice = invoiceOrThrow();
  const plan = planManualPaymentVerification({
    invoice,
    report: reportOrThrow(invoice),
    evidence: EVIDENCE,
    reservations: RESERVATIONS,
    priorVerifiedReferences: [],
    adminId: "admin-1",
    adminName: "Samuel Boadu",
    verifiedAt: VERIFIED_AT,
  });
  if (!plan.ok) throw new Error(`fixture verification refused: ${plan.reason}`);
  return plan.value;
}

// ---------------------------------------------------------------------------

describe("quote revalidation", () => {
  it("accepts an authoritative quote", () => {
    const result = revalidateCheckoutQuote(QUOTE);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.subtotalCents).toBe(TOTAL);
      expect(result.value.currency).toBe("USD");
    }
  });

  it.each([
    [
      "a tampered subtotal",
      { ...QUOTE, subtotalCents: 1 },
      "quote_subtotal_mismatch",
    ],
    ["a tampered hash", { ...QUOTE, quoteHash: "0".repeat(64) }, "quote_hash_mismatch"],
    ["no lines", { ...QUOTE, lines: [] }, "quote_empty"],
  ])("refuses %s", (_label, tampered, reason) => {
    const result = revalidateCheckoutQuote(tampered as CheckoutPriceQuote);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("refuses a line whose total does not equal unit times quantity", () => {
    const bad = [{ ...LINES[0], lineTotalCents: 1 }, LINES[1]];
    const result = revalidateCheckoutQuote({
      ...QUOTE,
      lines: bad,
      subtotalCents: bad[0].lineTotalCents + bad[1].lineTotalCents,
    });
    expect(result.ok).toBe(false);
    // The shared snapshot validator already enforces
    // lineTotalCents === unitAmountCents * quantity, so it refuses first. The
    // recompute in this module is deliberate defense in depth: it does not
    // depend on that invariant holding elsewhere, and it also catches the
    // overflow case the validator cannot express.
    if (!result.ok) expect(result.reason).toBe("quote_line_invalid");
  });

  it("refuses a subtotal that does not equal the sum of valid lines", () => {
    // Every line is individually valid here, so this is the check that only
    // this module performs: the aggregate must be re-derived, not trusted.
    const single = [line("SKU-A", 12_000, 2)];
    const result = revalidateCheckoutQuote({
      lines: single,
      subtotalCents: 24_001,
      currency: "USD",
      quotedAt: QUOTED_AT,
      quoteHash: computeQuoteHash(single, 24_001, "USD", QUOTED_AT),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quote_subtotal_mismatch");
  });

  it("refuses an unsupported currency", () => {
    const result = revalidateCheckoutQuote({
      ...QUOTE,
      currency: "EUR" as never,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("currency_unsupported");
  });
});

describe("order reference and memo", () => {
  it("mints references in the order namespace, never the membership one", () => {
    for (let i = 0; i < 50; i += 1) {
      const ref = newOrderHumanRef();
      expect(ref).toMatch(ORDER_HUMAN_REF_PATTERN);
      expect(ref.startsWith("XRM-")).toBe(false);
    }
  });

  it("excludes ambiguous symbols", () => {
    const ref = newOrderHumanRef(() => Buffer.alloc(8, 0));
    expect(ref).toBe("XRO-AAAAAAAA");
    expect(/[IO01]/.test(ref.slice(4))).toBe(false);
  });

  it("builds a memo that is exactly the reference", () => {
    expect(buildPaymentMemo("XRO-ABCD2345")).toBe("XRO-ABCD2345");
    expect(isMemoSafe("XRO-ABCD2345")).toBe(true);
    expect(isMemoSafe("XRO-ABCD2345 SKU-A")).toBe(false);
  });

  it("keeps product identity out of the memo", () => {
    const invoice = invoiceOrThrow();
    for (const l of invoice.lines) {
      expect(invoice.memo).not.toContain(l.sku);
      expect(invoice.memo).not.toContain(l.displayName);
      expect(invoice.memo).not.toContain(l.productId);
    }
  });
});

describe("invoice creation", () => {
  it("prices the invoice from the revalidated quote", () => {
    const invoice = invoiceOrThrow();
    expect(invoice.amountCents).toBe(TOTAL);
    expect(invoice.currency).toBe("USD");
    expect(invoice.status).toBe("awaiting_payment");
    expect(invoice.lines).toHaveLength(2);
  });

  it("freezes the line snapshots", () => {
    const invoice = invoiceOrThrow();
    expect(Object.isFrozen(invoice)).toBe(true);
    expect(Object.isFrozen(invoice.lines)).toBe(true);
    expect(Object.isFrozen(invoice.lines[0])).toBe(true);
  });

  it("refuses when a tampered quote is presented", () => {
    const result = createManualOrderInvoice({
      invoiceId: "inv-1",
      orderIntentId: "order-intent-1",
      memberId: "member-1",
      quote: { ...QUOTE, subtotalCents: 1 },
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
      instructionsRef: "manual-payment-instructions/v1",
      receivingAccountRef: "receiving-account/primary",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("quote_subtotal_mismatch");
  });

  it("requires opaque configuration references", () => {
    const result = createManualOrderInvoice({
      invoiceId: "inv-1",
      orderIntentId: "order-intent-1",
      memberId: "member-1",
      quote: QUOTE,
      issuedAt: ISSUED_AT,
      expiresAt: EXPIRES_AT,
      instructionsRef: "",
      receivingAccountRef: "",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("config_reference_missing");
  });

  it("refuses an expiry that does not follow issuance", () => {
    const result = createManualOrderInvoice({
      invoiceId: "inv-1",
      orderIntentId: "order-intent-1",
      memberId: "member-1",
      quote: QUOTE,
      issuedAt: EXPIRES_AT,
      expiresAt: ISSUED_AT,
      instructionsRef: "manual-payment-instructions/v1",
      receivingAccountRef: "receiving-account/primary",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("instant_invalid");
  });
});

describe("member projection", () => {
  it("never exposes the receiving account or the line contents", () => {
    const projected = projectInvoiceForMember(invoiceOrThrow());
    const serialized = JSON.stringify(projected);
    expect(serialized).not.toContain("receiving-account");
    expect(serialized).not.toContain("SKU-A");
    expect(Object.keys(projected)).not.toContain("receivingAccountRef");
    expect(Object.keys(projected)).not.toContain("lines");
  });

  it("carries what a member needs to pay", () => {
    const projected = projectInvoiceForMember(invoiceOrThrow());
    expect(projected.memo).toMatch(ORDER_HUMAN_REF_PATTERN);
    expect(projected.amountCents).toBe(TOTAL);
    expect(projected.instructionsRef).toBe("manual-payment-instructions/v1");
  });
});

describe("customer payment report", () => {
  it("records a claim and never marks paid", () => {
    const report = reportOrThrow(invoiceOrThrow());
    expect(report.status).toBe("reported");
    expect(JSON.stringify(report)).not.toContain("paid\"");
    expect(report.currency).toBe("USD");
  });

  it("refuses a report from another member", () => {
    const result = reportManualPayment({
      invoice: invoiceOrThrow(),
      memberId: "member-2",
      method: "bank_transfer",
      reference: "BANKREF-9911",
      amountCents: TOTAL,
      currency: "USD",
      reportedAt: "2026-08-04T09:00:00.000Z",
      claimedPaidAt: "2026-08-04T08:30:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("identity_missing");
  });

  it("refuses a report after the invoice expired", () => {
    const result = reportManualPayment({
      invoice: invoiceOrThrow(),
      memberId: "member-1",
      method: "bank_transfer",
      reference: "BANKREF-9911",
      amountCents: TOTAL,
      currency: "USD",
      reportedAt: "2026-09-01T00:00:00.000Z",
      claimedPaidAt: "2026-08-31T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("invoice_expired");
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 2])(
    "refuses a non-positive-safe-integer amount: %s",
    (amountCents) => {
      const result = reportManualPayment({
        invoice: invoiceOrThrow(),
        memberId: "member-1",
        method: "bank_transfer",
        reference: "BANKREF-9911",
        amountCents,
        currency: "USD",
        reportedAt: "2026-08-04T09:00:00.000Z",
        claimedPaidAt: "2026-08-04T08:30:00.000Z",
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe("amount_invalid");
    },
  );
});

describe("named human verification", () => {
  it("emits plans only, and every one of them", () => {
    const plan = verifyOrThrow();
    expect(plan.verifiedAmountCents).toBe(TOTAL);
    expect(plan.verifiedBy).toEqual({ adminId: "admin-1", adminName: "Samuel Boadu" });
    expect(plan.intents.map((intent) => intent.kind)).toEqual([
      "settlement",
      "reservation_finalize",
      "receipt_candidate",
      "commission",
    ]);
    expect(Object.isFrozen(plan)).toBe(true);
  });

  const base = () => {
    const invoice = invoiceOrThrow();
    return {
      invoice,
      report: reportOrThrow(invoice),
      evidence: EVIDENCE,
      reservations: RESERVATIONS,
      priorVerifiedReferences: [] as string[],
      adminId: "admin-1",
      adminName: "Samuel Boadu",
      verifiedAt: VERIFIED_AT,
    };
  };

  it.each([
    [
      "an amount that does not match exactly",
      () => ({ ...base(), evidence: { ...EVIDENCE, amountCents: TOTAL - 1 } }),
      "amount_mismatch",
    ],
    [
      "a reference that does not match",
      () => ({ ...base(), evidence: { ...EVIDENCE, reference: "OTHER" } }),
      "reference_mismatch",
    ],
    [
      "a method that does not match",
      () => ({ ...base(), evidence: { ...EVIDENCE, method: "wire" as const } }),
      "method_mismatch",
    ],
    [
      "a currency that does not match",
      () => ({ ...base(), evidence: { ...EVIDENCE, currency: "EUR" } }),
      "currency_mismatch",
    ],
    [
      "a settlement outside the inspected window",
      () => ({
        ...base(),
        evidence: { ...EVIDENCE, settledAt: "2026-07-01T00:00:00.000Z" },
      }),
      "provider_evidence_missing",
    ],
    [
      "a reference already verified elsewhere",
      () => ({ ...base(), priorVerifiedReferences: ["bankref-9911"] }),
      "duplicate_reference",
    ],
    [
      "a reservation that expired before verification",
      () => ({
        ...base(),
        reservations: [
          { ...RESERVATIONS[0], expiresAt: "2026-08-04T09:00:00.000Z" },
        ],
      }),
      "reservation_expired",
    ],
    ["no held reservations", () => ({ ...base(), reservations: [] }), "reservation_missing"],
    ["an unnamed approver", () => ({ ...base(), adminName: "" }), "admin_not_named"],
    [
      "an invoice already verified",
      () => ({ ...base(), alreadyVerified: true }),
      "already_verified",
    ],
  ])("refuses %s", (_label, build, reason) => {
    const result = planManualPaymentVerification(build() as never);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe(reason);
  });

  it("matches a reference case-insensitively but never loosely", () => {
    const input = base();
    const ok = planManualPaymentVerification({
      ...input,
      evidence: { ...EVIDENCE, reference: "  bankref-9911  " },
    });
    expect(ok.ok).toBe(true);
    const loose = planManualPaymentVerification({
      ...input,
      evidence: { ...EVIDENCE, reference: "BANKREF-991" },
    });
    expect(loose.ok).toBe(false);
  });
});

describe("refund plan", () => {
  it("emits a commission reversal and never restocks", () => {
    const invoice = invoiceOrThrow();
    const result = planManualRefund({
      invoice,
      verification: verifyOrThrow(),
      amountCents: 1_000,
      affectedSkus: ["SKU-A"],
      adminId: "admin-1",
      adminName: "Samuel Boadu",
      requestedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.restock).toBe(false);
      expect(result.value.intents[0].kind).toBe("commission_reversal");
      expect(result.value.affectedLines[0].sku).toBe("SKU-A");
      expect(Object.isFrozen(result.value.affectedLines[0])).toBe(true);
    }
  });

  it("bounds refunds in aggregate, not just per call", () => {
    const invoice = invoiceOrThrow();
    const verification = verifyOrThrow();
    const first = planManualRefund({
      invoice,
      verification,
      amountCents: TOTAL - 100,
      affectedSkus: ["SKU-A"],
      adminId: "admin-1",
      adminName: "Samuel Boadu",
      requestedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(first.ok).toBe(true);
    // Each call alone looks acceptable; together they would exceed the verified
    // amount, so the aggregate bound must refuse the second.
    const second = planManualRefund({
      invoice,
      verification,
      amountCents: 200,
      affectedSkus: ["SKU-A"],
      priorRefundedCents: TOTAL - 100,
      adminId: "admin-1",
      adminName: "Samuel Boadu",
      requestedAt: "2026-08-05T01:00:00.000Z",
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("refund_exceeds_verified");
  });

  it("refuses a SKU that is not on the invoice", () => {
    const result = planManualRefund({
      invoice: invoiceOrThrow(),
      verification: verifyOrThrow(),
      amountCents: 100,
      affectedSkus: ["SKU-NOT-ON-INVOICE"],
      adminId: "admin-1",
      adminName: "Samuel Boadu",
      requestedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("refund_line_unknown");
  });

  it("requires a named approver", () => {
    const result = planManualRefund({
      invoice: invoiceOrThrow(),
      verification: verifyOrThrow(),
      amountCents: 100,
      affectedSkus: ["SKU-A"],
      adminId: "",
      adminName: "",
      requestedAt: "2026-08-05T00:00:00.000Z",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("admin_not_named");
  });
});
