import { describe, expect, it, vi } from "vitest";
import type { CartPriceSnapshot } from "@shared/research/pricing";
import { newHumanRef, sha256Hex } from "../membership-activation/obligations";
import {
  computeQuoteHash,
  type CheckoutPriceQuote,
} from "../pricing/checkout-recompute";
import {
  createManualOrderInvoice,
  parseManualPaymentMethodSnapshot,
  parseManualPaymentProofMetadata,
  planExternallyCompletedManualRefund,
  planManualInvoiceExpiry,
  planManualPaymentVerification,
  projectManualPaymentForMember,
  reconcileManualPayment,
  reportManualOrderPayment,
  type ManualOrderInvoice,
  type ManualPaymentReport,
  type ManualPaymentReservationEvidence,
  type ManualPaymentVerificationPlan,
  type CommittedManualPaymentVerification,
  type CommittedManualPaymentVerificationPlan,
  type ManualPaymentAuthorizationPort,
  type ManualPaymentClockPort,
  type ManualPaymentCommitPort,
  type ManualPaymentMemberViewerPort,
  type ManualPaymentMethodRegistryPort,
  type ManualPaymentReferencePort,
  type ManualPaymentVerificationStatePort,
  type CommittedManualRefundPlan,
  type ManualRefundPlan,
  type PlanManualRefundInput,
  type PlanManualPaymentVerificationInput,
} from "./manual-order-payments";

const CREATED_AT = "2026-08-03T20:00:00.000Z";
const REPORTED_AT = "2026-08-03T20:10:00.000Z";
const VERIFIED_AT = "2026-08-03T20:15:00.000Z";
const DUE_AT = "2026-08-03T21:00:00.000Z";
const EXPIRES_AT = "2026-08-03T22:00:00.000Z";
const PRODUCT_A = "product_a";
const VARIANT_A = "variant_a";
const PRODUCT_B = "product_b";
const VARIANT_B = "variant_b";

function opaque(kind: string, value: string): string {
  return `${kind}:${sha256Hex(value)}`;
}

function authorization(
  role: "owner" | "admin" | "operations_admin" | null = "operations_admin",
): ManualPaymentAuthorizationPort {
  return { resolveRole: () => role };
}

function clock(at: string): ManualPaymentClockPort {
  return { now: vi.fn(() => at) };
}

function methodRegistry(
  resolved: unknown = method(),
): ManualPaymentMethodRegistryPort {
  return { resolveEnabledMethod: vi.fn(() => resolved) };
}

function referenceFactory(value = "XRM-AAAAAAAA"): ManualPaymentReferencePort {
  return { createHumanRef: vi.fn(() => value) };
}

function viewer(
  memberId: string | null = "member_alpha",
): ManualPaymentMemberViewerPort {
  return { resolveMemberId: vi.fn(() => memberId) };
}

function deterministicRandom(byte = 0): (size: number) => Buffer {
  return (size) => Buffer.alloc(size, byte);
}

function quote(
  overrides: Partial<CheckoutPriceQuote> = {},
): CheckoutPriceQuote {
  const lines: CartPriceSnapshot[] = [
    {
      productId: PRODUCT_A,
      variantId: VARIANT_A,
      sku: "SKU-A",
      displayName: "Product A",
      priceId: "11111111-1111-4111-8111-111111111111",
      priceVersion: 2,
      audience: "retail",
      currency: "USD",
      unitAmountCents: 12_500,
      quantity: 2,
      lineTotalCents: 25_000,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      pricedAt: CREATED_AT,
    },
    {
      productId: PRODUCT_B,
      variantId: VARIANT_B,
      sku: "SKU-B",
      displayName: "Product B",
      priceId: "22222222-2222-4222-8222-222222222222",
      priceVersion: 1,
      audience: "retail",
      currency: "USD",
      unitAmountCents: 5_000,
      quantity: 1,
      lineTotalCents: 5_000,
      effectiveAt: "2026-08-01T00:00:00.000Z",
      expiresAt: null,
      pricedAt: CREATED_AT,
    },
  ];
  const base: CheckoutPriceQuote = {
    lines,
    subtotalCents: 30_000,
    currency: "USD",
    quotedAt: CREATED_AT,
    quoteHash: computeQuoteHash(lines, 30_000, "USD", CREATED_AT),
  };
  return { ...base, ...overrides };
}

function method(overrides: Record<string, unknown> = {}): unknown {
  return {
    method: "zelle",
    configurationRef: opaque("payment_config", "zelle-v1"),
    instructionsRef: opaque("payment_instructions", "zelle-v1"),
    approvalRef: opaque("payment_approval", "zelle-v1"),
    approvedByRole: "owner",
    approvedAt: "2026-08-01T10:00:00.000Z",
    verificationRef: opaque("payment_verification", "zelle-v1"),
    verifiedByRole: "operations_admin",
    verifiedAt: "2026-08-01T11:00:00.000Z",
    enablementRef: opaque("payment_enablement", "zelle-v1"),
    enabledByRole: "owner",
    enabledAt: "2026-08-01T12:00:00.000Z",
    ...overrides,
  };
}

function invoice(): ManualOrderInvoice {
  const result = createManualOrderInvoice({
    invoiceId: "invoice_internal_1",
    memberId: "member_alpha",
    orderId: "order_alpha",
    quote: quote(),
    requestedMethod: "zelle",
    methodRegistry: methodRegistry(),
    referenceFactory: referenceFactory(),
    clock: clock(CREATED_AT),
    createdAt: CREATED_AT,
    dueAt: DUE_AT,
  });
  if (result.state !== "accepted") {
    throw new Error(`expected invoice: ${result.code}`);
  }
  return result.value;
}

function proof(overrides: Record<string, unknown> = {}): unknown {
  return {
    storageObjectRef:
      "private/manual-payment-proofs/member_alpha/order_alpha/proof_1",
    sha256: "a".repeat(64),
    mimeType: "image/png",
    sizeBytes: 12_345,
    uploadedAt: REPORTED_AT,
    ...overrides,
  };
}

function reportPayload(
  current = invoice(),
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    memberId: current.memberId,
    orderId: current.orderId,
    orderRef: current.orderRef,
    invoiceRef: current.invoiceRef,
    method: current.method.method,
    currency: current.currency,
    amountCents: current.amountCents,
    proof: proof(),
    reportedAt: REPORTED_AT,
    ...overrides,
  };
}

function report(current = invoice()): ManualPaymentReport {
  const result = reportManualOrderPayment(
    current,
    reportPayload(current),
    clock(REPORTED_AT),
  );
  if (result.state !== "accepted") {
    throw new Error(`expected report: ${result.code}`);
  }
  return result.value;
}

function key(productId: string, variantId: string, sku: string): string {
  return `${productId}:${variantId}:${sku}`;
}

function reservations(current = invoice()): ManualPaymentReservationEvidence[] {
  return current.lines.map((line, index) => ({
    reservationId: `reservation_${index + 1}`,
    memberId: current.memberId,
    orderId: current.orderId,
    lineKey: key(line.productId, line.variantId, line.sku),
    quantity: line.quantity,
    state: "held" as const,
    expiresAt: EXPIRES_AT,
  }));
}

function verificationEvidence(
  current = invoice(),
  overrides: Record<string, unknown> = {},
): unknown {
  return {
    memberId: current.memberId,
    orderId: current.orderId,
    orderRef: current.orderRef,
    invoiceRef: current.invoiceRef,
    method: current.method.method,
    currency: current.currency,
    amountCents: current.amountCents,
    receivingConfigurationRef: current.method.configurationRef,
    fundsObserved: "confirmed",
    proofReview: "accepted_readable",
    externalTransactionRef: opaque("external_txn", "verified-0001"),
    verifiedAt: VERIFIED_AT,
    idempotencyKey: "verify:order_alpha:0001",
    ...overrides,
  };
}

function verificationPlan(current = invoice()): ManualPaymentVerificationPlan {
  const result = planManualPaymentVerification({
    invoice: current,
    report: report(current),
    evidence: verificationEvidence(current),
    authenticatedActorId: "admin_one",
    authorization: authorization(),
    clock: clock(VERIFIED_AT),
    state: verificationState(),
    reservations: reservations(current),
  });
  if (result.state !== "accepted") {
    throw new Error(`expected plan: ${result.code}`);
  }
  return result.value.plan;
}

function committedVerification(
  current = invoice(),
): CommittedManualPaymentVerification {
  const plan = verificationPlan(current);
  return {
    memberId: plan.memberId,
    orderId: plan.orderId,
    externalTransactionRef: plan.externalTransactionRef,
    verifiedAmountCents: plan.amountCents,
    currency: plan.currency,
    verifiedAt: plan.verifiedAt,
    verifiedByActorId: plan.verifiedByActorId,
    verifiedByRole: plan.verifiedByRole,
    verificationFingerprint: plan.planFingerprint,
    commitRef: opaque("verification_commit", "0001"),
    state: "verified_committed",
  };
}

interface CommitPortValues {
  readonly committedRefunds?: readonly unknown[];
  readonly verification?: unknown;
  readonly priorRefundPlan?: unknown;
  readonly externalRefundOwner?: unknown;
  readonly refundProofOwner?: unknown;
}

function commitPort(
  current = invoice(),
  values: CommitPortValues = {},
): ManualPaymentCommitPort {
  return {
    resolveVerification: vi.fn(() =>
      Object.prototype.hasOwnProperty.call(values, "verification")
        ? values.verification
        : committedVerification(current),
    ),
    listCommittedRefunds: vi.fn(() => values.committedRefunds ?? []),
    resolveRefundPlanByIdempotency: vi.fn(() => values.priorRefundPlan ?? null),
    resolveExternalRefundOwner: vi.fn(() => values.externalRefundOwner ?? null),
    resolveRefundProofOwner: vi.fn(() => values.refundProofOwner ?? null),
  };
}

interface VerificationStateValues {
  readonly prior?: unknown;
  readonly transactionOwner?: unknown;
  readonly proofOwner?: unknown;
}

function verificationState(
  values: VerificationStateValues = {},
): ManualPaymentVerificationStatePort {
  return {
    resolvePlanByIdempotency: vi.fn(() => values.prior ?? null),
    resolveExternalTransactionOwner: vi.fn(
      () => values.transactionOwner ?? null,
    ),
    resolveProofOwner: vi.fn(() => values.proofOwner ?? null),
  };
}

function occurrenceOwner(
  current = invoice(),
  idempotencyKey = "verify:order_alpha:0001",
): unknown {
  return {
    memberId: current.memberId,
    orderId: current.orderId,
    idempotencyKey,
  };
}

function committedVerificationPlan(
  plan: ManualPaymentVerificationPlan,
): CommittedManualPaymentVerificationPlan {
  return {
    memberId: plan.memberId,
    orderId: plan.orderId,
    idempotencyKey: plan.idempotencyKey,
    planFingerprint: plan.planFingerprint,
    plan,
    state: "verification_plan_committed",
  };
}

function verificationInput(
  current = invoice(),
  overrides: Partial<PlanManualPaymentVerificationInput> = {},
): PlanManualPaymentVerificationInput {
  return {
    invoice: current,
    report: report(current),
    evidence: verificationEvidence(current),
    authenticatedActorId: "admin_one",
    authorization: authorization(),
    clock: clock(VERIFIED_AT),
    state: verificationState(),
    reservations: reservations(current),
    ...overrides,
  };
}

describe("manual order payment method and invoice boundary", () => {
  it("allows only approved manual methods and never card", () => {
    for (const name of [
      "cash_app",
      "zelle",
      "venmo",
      "paypal",
      "apple_cash",
      "ach_wire",
      "other",
    ]) {
      expect(
        parseManualPaymentMethodSnapshot(method({ method: name })).state,
      ).toBe("accepted");
    }
    for (const name of ["card", "stripe", "cash", "Zelle", ""]) {
      expect(
        parseManualPaymentMethodSnapshot(method({ method: name })),
      ).toEqual({
        state: "refused",
        code: "method_unavailable",
      });
    }
  });

  it("requires exact method keys, opaque references, and ordered approvals", () => {
    expect(
      parseManualPaymentMethodSnapshot(
        method({ recipient: "private@example.test" }),
      ),
    ).toEqual({ state: "refused", code: "validation_failed" });
    expect(
      parseManualPaymentMethodSnapshot(
        method({ configurationRef: "https://example.test/private" }),
      ),
    ).toEqual({ state: "refused", code: "method_unavailable" });
    expect(
      parseManualPaymentMethodSnapshot(
        method({ enabledAt: "2026-07-01T00:00:00.000Z" }),
      ),
    ).toEqual({ state: "refused", code: "method_unavailable" });
    for (const patch of [
      { configurationRef: "payment_config:15551234567" },
      { instructionsRef: "payment_instructions:15551234567" },
      { verificationRef: "payment_verification:15551234567" },
      { enablementRef: "payment_enablement:15551234567" },
    ]) {
      expect(parseManualPaymentMethodSnapshot(method(patch))).toEqual({
        state: "refused",
        code: "method_unavailable",
      });
    }
  });

  it("creates frozen XRM-derived references and immutable authoritative lines", () => {
    const created = invoice();
    expect(created.humanRef).toBe("XRM-AAAAAAAA");
    expect(created.orderRef).toBe("XRO-AAAAAAAA");
    expect(created.invoiceRef).toBe("INV-XRM-AAAAAAAA");
    expect(created.paymentMemo).toBe("INV-XRM-AAAAAAAA");
    expect(created.receiptRef).toBe("RCPT-XRM-AAAAAAAA");
    expect(created.amountCents).toBe(30_000);
    expect(created.lines).toHaveLength(2);
    expect(created.lines.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(created)).toBe(true);
    expect(JSON.stringify(created)).not.toMatch(
      /recipient|accountNumber|routingNumber|wholesale|supplierCost|margin/i,
    );
  });

  it("rejects altered hashes, subtotal changes, mixed currency, fractions, overflow, and stale method timestamps", () => {
    const genuine = quote();
    const alteredLine = {
      ...genuine.lines[0],
      unitAmountCents: genuine.lines[0].unitAmountCents + 1,
    };
    const cases: CheckoutPriceQuote[] = [
      { ...genuine, quoteHash: "b".repeat(64) },
      { ...genuine, subtotalCents: 30_001 },
      {
        ...genuine,
        lines: [alteredLine, genuine.lines[1]],
        quoteHash: computeQuoteHash(
          [alteredLine, genuine.lines[1]],
          30_000,
          "USD",
          CREATED_AT,
        ),
      },
      {
        ...genuine,
        lines: [
          { ...genuine.lines[0], currency: "EUR" as "USD" },
          genuine.lines[1],
        ],
        quoteHash: computeQuoteHash(
          [{ ...genuine.lines[0], currency: "EUR" as "USD" }, genuine.lines[1]],
          30_000,
          "USD",
          CREATED_AT,
        ),
      },
      { ...genuine, subtotalCents: 30_000.5 },
      { ...genuine, subtotalCents: Number.MAX_SAFE_INTEGER + 1 },
    ];
    for (const candidate of cases) {
      const created = createManualOrderInvoice({
        invoiceId: "invoice_internal_1",
        memberId: "member_alpha",
        orderId: "order_alpha",
        quote: candidate,
        requestedMethod: "zelle",
        methodRegistry: methodRegistry(),
        referenceFactory: referenceFactory(),
        clock: clock(CREATED_AT),
        createdAt: CREATED_AT,
        dueAt: DUE_AT,
      });
      expect(created.state).toBe("refused");
    }
    expect(
      createManualOrderInvoice({
        invoiceId: "invoice_internal_1",
        memberId: "member_alpha",
        orderId: "order_alpha",
        quote: genuine,
        requestedMethod: "zelle",
        methodRegistry: methodRegistry(
          method({ enabledAt: "2026-08-03T20:01:00.000Z" }),
        ),
        referenceFactory: referenceFactory(),
        clock: clock(CREATED_AT),
        createdAt: CREATED_AT,
        dueAt: DUE_AT,
      }),
    ).toEqual({ state: "refused", code: "method_unavailable" });
  });

  it("authorizes invoice methods only through the registry and server clock", () => {
    const common = {
      invoiceId: "invoice_internal_1",
      memberId: "member_alpha",
      orderId: "order_alpha",
      quote: quote(),
      requestedMethod: "zelle",
      referenceFactory: referenceFactory(),
      createdAt: CREATED_AT,
      dueAt: DUE_AT,
    };
    const registryNull = vi.fn(() => null);
    expect(
      createManualOrderInvoice({
        ...common,
        methodRegistry: { resolveEnabledMethod: registryNull },
        clock: clock(CREATED_AT),
      }),
    ).toEqual({ state: "refused", code: "validation_failed" });
    expect(registryNull).toHaveBeenCalledWith({
      method: "zelle",
      evaluatedAt: CREATED_AT,
    });

    const registryThrows = vi.fn(() => {
      throw new Error("registry unavailable");
    });
    expect(
      createManualOrderInvoice({
        ...common,
        methodRegistry: { resolveEnabledMethod: registryThrows },
        clock: clock(CREATED_AT),
      }),
    ).toEqual({ state: "refused", code: "method_unavailable" });
    expect(
      createManualOrderInvoice({
        ...common,
        methodRegistry: methodRegistry(method({ method: "paypal" })),
        clock: clock(CREATED_AT),
      }),
    ).toEqual({ state: "refused", code: "method_unavailable" });
    const ignoredRegistry = methodRegistry();
    expect(
      createManualOrderInvoice({
        ...common,
        requestedMethod: method(),
        methodRegistry: ignoredRegistry,
        clock: clock(CREATED_AT),
      }),
    ).toEqual({ state: "refused", code: "method_unavailable" });
    expect(ignoredRegistry.resolveEnabledMethod).not.toHaveBeenCalled();

    for (const hostileClock of [
      { now: () => "not-a-time" },
      {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      clock("2026-08-03T20:00:01.000Z"),
    ]) {
      expect(
        createManualOrderInvoice({
          ...common,
          methodRegistry: methodRegistry(),
          clock: hostileClock,
        }),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
  });

  it("creates references only through the trusted reference factory", () => {
    const common = {
      invoiceId: "invoice_internal_1",
      memberId: "member_alpha",
      orderId: "order_alpha",
      quote: quote(),
      requestedMethod: "zelle",
      methodRegistry: methodRegistry(),
      clock: clock(CREATED_AT),
      createdAt: CREATED_AT,
      dueAt: DUE_AT,
    };
    const createHumanRef = vi.fn(() => "XRM-BBBBBBBB");
    const accepted = createManualOrderInvoice({
      ...common,
      referenceFactory: { createHumanRef },
    });
    expect(accepted.state).toBe("accepted");
    if (accepted.state === "accepted") {
      expect(accepted.value.humanRef).toBe("XRM-BBBBBBBB");
      expect(accepted.value.orderRef).toBe("XRO-BBBBBBBB");
      expect(accepted.value.invoiceRef).toBe("INV-XRM-BBBBBBBB");
    }
    expect(createHumanRef).toHaveBeenCalledOnce();

    expect(
      createManualOrderInvoice({
        ...common,
        referenceFactory: {
          createHumanRef: () => {
            throw new Error("reference source unavailable");
          },
        },
      }),
    ).toEqual({ state: "refused", code: "validation_failed" });
    for (const hostileRef of ["not-a-ref", "XRM-short", null]) {
      expect(
        createManualOrderInvoice({
          ...common,
          referenceFactory: {
            createHumanRef: () => hostileRef as unknown as string,
          },
        }),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
  });

  it("does not change the adjacent membership reference generator", () => {
    expect(newHumanRef(deterministicRandom(0))).toBe("XRM-AAAAAAAA");
    expect(newHumanRef(deterministicRandom(31))).toBe("XRM-99999999");
  });
});

describe("manual payment proof and report boundary", () => {
  it("accepts only private opaque proof metadata and exact safe fields", () => {
    const parsed = parseManualPaymentProofMetadata(proof());
    expect(parsed.state).toBe("accepted");
    if (parsed.state !== "accepted") return;
    expect(Object.keys(parsed.value).sort()).toEqual(
      [
        "storageObjectRef",
        "sha256",
        "mimeType",
        "sizeBytes",
        "uploadedAt",
      ].sort(),
    );
    expect(parsed.value.storageObjectRef).not.toMatch(/https?:|data:/i);
    expect(Object.keys(parsed.value)).not.toContain("bytes");
    expect(Object.keys(parsed.value)).not.toContain("content");
  });

  it("rejects URLs, traversal, bytes, bad hashes, bad MIME, oversized files, and unknown keys", () => {
    const cases = [
      proof({ storageObjectRef: "https://example.test/proof.png" }),
      proof({ storageObjectRef: "private/manual-payment-proofs/../secret" }),
      proof({ bytes: "private-bytes" }),
      proof({ sha256: "not-a-hash" }),
      proof({ sha256: 123 }),
      proof({ sha256: { hostile: true } }),
      proof({ mimeType: "image/svg+xml" }),
      proof({ sizeBytes: 15 * 1024 * 1024 + 1 }),
      proof({ sizeBytes: 1.5 }),
      proof({ uploadedAt: "August 3, 2026" }),
    ];
    for (const candidate of cases) {
      expect(parseManualPaymentProofMetadata(candidate)).toEqual({
        state: "refused",
        code: "proof_invalid",
      });
    }
  });

  it("requires exact member/order/reference/method/currency/amount equality", () => {
    const current = invoice();
    for (const patch of [
      { memberId: "member_other" },
      { orderId: "order_other" },
      { orderRef: "XRO-BBBBBBBB" },
      { invoiceRef: "INV-XRM-BBBBBBBB" },
      { method: "paypal" },
      { currency: "EUR" },
      { amountCents: current.amountCents + 1 },
    ]) {
      expect(
        reportManualOrderPayment(
          current,
          reportPayload(current, patch),
          clock(REPORTED_AT),
        ),
      ).toEqual({
        state: "refused",
        code: "report_mismatch",
      });
    }
  });

  it("a report remains explicitly unverified and creates no paid-side effect", () => {
    const current = report();
    expect(current.state).toBe("reported_unverified");
    const serialized = JSON.stringify(current);
    expect(serialized).not.toMatch(
      /payment_verified|order_paid|receipt_issue|supplier_release|commission_evaluate/,
    );
    expect(Object.isFrozen(current)).toBe(true);
  });

  it("refuses extra report fields, expired reports, and proof uploaded after report", () => {
    const current = invoice();
    expect(
      reportManualOrderPayment(
        current,
        reportPayload(current, { memo: "forged" }),
        clock(REPORTED_AT),
      ),
    ).toEqual({ state: "refused", code: "validation_failed" });
    expect(
      reportManualOrderPayment(
        current,
        reportPayload(current, { reportedAt: "2026-08-03T21:01:00.000Z" }),
        clock("2026-08-03T21:01:00.000Z"),
      ),
    ).toEqual({ state: "refused", code: "invoice_expired" });
    expect(
      reportManualOrderPayment(
        current,
        reportPayload(current, {
          proof: proof({ uploadedAt: "2026-08-03T20:11:00.000Z" }),
        }),
        clock(REPORTED_AT),
      ),
    ).toEqual({ state: "refused", code: "invoice_expired" });
  });

  it("binds proof storage and upload time to the exact invoice scope", () => {
    const current = invoice();
    for (const candidate of [
      proof({
        storageObjectRef:
          "private/manual-payment-proofs/member_other/order_alpha/proof_1",
      }),
      proof({
        storageObjectRef:
          "private/manual-payment-proofs/member_alpha/order_other/proof_1",
      }),
      proof({ uploadedAt: "2026-08-03T19:59:59.999Z" }),
    ]) {
      expect(
        reportManualOrderPayment(
          current,
          reportPayload(current, { proof: candidate }),
          clock(REPORTED_AT),
        ),
      ).toEqual({ state: "refused", code: "invoice_expired" });
    }
  });

  it("uses only the server clock for payment reporting", () => {
    const current = invoice();
    for (const hostileClock of [
      { now: () => null as unknown as string },
      {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      clock("2026-08-03T20:11:00.000Z"),
    ]) {
      expect(
        reportManualOrderPayment(current, reportPayload(current), hostileClock),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
  });
});

describe("manual payment verification planning", () => {
  it("produces the exact stable non-executed atomic-commit intents", () => {
    const current = invoice();
    const result = planManualPaymentVerification({
      invoice: current,
      report: report(current),
      evidence: verificationEvidence(current),
      authenticatedActorId: "admin_one",
      authorization: authorization(),
      clock: clock(VERIFIED_AT),
      state: verificationState(),
      reservations: reservations(current),
    });
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.value.replayed).toBe(false);
    expect(result.value.plan.execution).toBe("not_executed");
    expect(result.value.plan.atomicity).toBe(
      "requires_separately_reviewed_commit",
    );
    expect(result.value.plan.effects.map((effect) => effect.kind)).toEqual([
      "payment_verified",
      "order_paid",
      "receipt_issue",
      "reservation_finalize",
      "supplier_release",
      "audit_append",
      "notification_enqueue",
      "commission_evaluate",
    ]);
    expect(
      result.value.plan.effects.every(
        (effect) => effect.execution === "not_executed",
      ),
    ).toBe(true);
    expect(
      new Set(result.value.plan.effects.map((effect) => effect.effectId)).size,
    ).toBe(8);
    expect(result.value.plan.verifiedByActorId).toBe("admin_one");
    expect(result.value.plan.verifiedByRole).toBe("operations_admin");
    expect(Object.isFrozen(result.value.plan)).toBe(true);
  });

  it("rejects forged roles and strict-key violations", () => {
    const current = invoice();
    const common = {
      invoice: current,
      report: report(current),
      authenticatedActorId: "admin_one",
      authorization: authorization(),
      clock: clock(VERIFIED_AT),
      state: verificationState(),
      reservations: reservations(current),
    };
    for (const forgedIdentity of [
      { actorRole: "member" },
      { actorRole: "owner" },
      { actorRole: "operations_admin" },
      { actorId: "admin_one" },
    ]) {
      expect(
        planManualPaymentVerification({
          ...common,
          evidence: verificationEvidence(current, forgedIdentity),
        }),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
    expect(
      planManualPaymentVerification({
        ...common,
        evidence: verificationEvidence(current, { forgedApproved: true }),
      }),
    ).toEqual({ state: "refused", code: "validation_failed" });
  });

  it("trusts only the authorization port and fails closed on null or errors", () => {
    const current = invoice();
    const durableState = verificationState();
    const common = {
      invoice: current,
      report: report(current),
      evidence: verificationEvidence(current),
      authenticatedActorId: "admin_one",
      clock: clock(VERIFIED_AT),
      state: durableState,
      reservations: reservations(current),
    };
    const nullResolver = vi.fn(() => null);
    expect(
      planManualPaymentVerification({
        ...common,
        authorization: { resolveRole: nullResolver },
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(nullResolver).toHaveBeenCalledOnce();
    expect(nullResolver).toHaveBeenCalledWith("admin_one");
    expect(durableState.resolvePlanByIdempotency).not.toHaveBeenCalled();
    expect(durableState.resolveExternalTransactionOwner).not.toHaveBeenCalled();
    expect(durableState.resolveProofOwner).not.toHaveBeenCalled();

    const throwingResolver = vi.fn(() => {
      throw new Error("authorization unavailable");
    });
    expect(
      planManualPaymentVerification({
        ...common,
        authorization: { resolveRole: throwingResolver },
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(throwingResolver).toHaveBeenCalledOnce();
    expect(throwingResolver).toHaveBeenCalledWith("admin_one");

    const invalidActorState = verificationState();
    const invalidActorAuthorization = vi.fn(() => "owner" as const);
    expect(
      planManualPaymentVerification({
        ...common,
        authenticatedActorId: "",
        authorization: { resolveRole: invalidActorAuthorization },
        state: invalidActorState,
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(invalidActorAuthorization).not.toHaveBeenCalled();
    expect(invalidActorState.resolvePlanByIdempotency).not.toHaveBeenCalled();
    expect(
      invalidActorState.resolveExternalTransactionOwner,
    ).not.toHaveBeenCalled();
    expect(invalidActorState.resolveProofOwner).not.toHaveBeenCalled();
  });

  it("uses the server clock and exact durable state lookup scope", () => {
    const current = invoice();
    for (const hostileClock of [
      { now: () => null as unknown as string },
      {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      clock("2026-08-03T20:15:01.000Z"),
    ]) {
      expect(
        planManualPaymentVerification(
          verificationInput(current, { clock: hostileClock }),
        ),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }

    const resolvePlanByIdempotency = vi.fn(() => null);
    const resolveExternalTransactionOwner = vi.fn(() => null);
    const resolveProofOwner = vi.fn(() => null);
    const result = planManualPaymentVerification(
      verificationInput(current, {
        state: {
          resolvePlanByIdempotency,
          resolveExternalTransactionOwner,
          resolveProofOwner,
        },
      }),
    );
    expect(result.state).toBe("accepted");
    expect(resolvePlanByIdempotency).toHaveBeenCalledWith({
      memberId: current.memberId,
      orderId: current.orderId,
      idempotencyKey: "verify:order_alpha:0001",
    });
    expect(resolveExternalTransactionOwner).toHaveBeenCalledWith(
      opaque("external_txn", "verified-0001"),
    );
    expect(resolveProofOwner).toHaveBeenCalledWith("a".repeat(64));
  });

  it("rejects raw recipient digits in verification opaque references", () => {
    const current = invoice();
    const common = {
      invoice: current,
      report: report(current),
      authenticatedActorId: "admin_one",
      authorization: authorization(),
      clock: clock(VERIFIED_AT),
      state: verificationState(),
      reservations: reservations(current),
    };
    for (const patch of [
      { receivingConfigurationRef: "payment_config:15551234567" },
      { externalTransactionRef: "external_txn:15551234567" },
    ]) {
      expect(
        planManualPaymentVerification({
          ...common,
          evidence: verificationEvidence(current, patch),
        }),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
  });

  it("rejects every cross-order and economic mismatch", () => {
    const current = invoice();
    const common = {
      invoice: current,
      report: report(current),
      authenticatedActorId: "admin_one",
      authorization: authorization(),
      clock: clock(VERIFIED_AT),
      state: verificationState(),
      reservations: reservations(current),
    };
    for (const patch of [
      { memberId: "member_other" },
      { orderId: "order_other" },
      { orderRef: "XRO-BBBBBBBB" },
      { invoiceRef: "INV-XRM-BBBBBBBB" },
      { method: "paypal" },
      { currency: "EUR" },
      { amountCents: 29_999 },
      { verifiedAt: "2026-08-03T21:01:00.000Z" },
    ]) {
      expect(
        planManualPaymentVerification({
          ...common,
          evidence: verificationEvidence(current, patch),
        }).state,
      ).toBe("refused");
    }
  });

  it("refuses duplicate transaction and proof evidence", () => {
    const current = invoice();
    const currentReport = report(current);
    expect(
      planManualPaymentVerification(
        verificationInput(current, {
          report: currentReport,
          state: verificationState({
            transactionOwner: occurrenceOwner(current),
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "duplicate_transaction" });
    expect(
      planManualPaymentVerification(
        verificationInput(current, {
          report: currentReport,
          state: verificationState({ proofOwner: occurrenceOwner(current) }),
        }),
      ),
    ).toEqual({ state: "refused", code: "duplicate_proof" });
  });

  it("refuses missing, released, expired, duplicate, wrong-member, and wrong-quantity reservations", () => {
    const current = invoice();
    const currentReservations = reservations(current);
    const common = verificationInput(current);
    const cases: unknown[][] = [
      [currentReservations[0]],
      [
        { ...currentReservations[0], state: "released" },
        currentReservations[1],
      ],
      [
        { ...currentReservations[0], expiresAt: "2026-08-03T20:14:00.000Z" },
        currentReservations[1],
      ],
      [
        { ...currentReservations[0], expiresAt: VERIFIED_AT },
        currentReservations[1],
      ],
      [
        currentReservations[0],
        { ...currentReservations[1], lineKey: currentReservations[0].lineKey },
      ],
      [
        currentReservations[0],
        {
          ...currentReservations[1],
          reservationId: currentReservations[0].reservationId,
        },
      ],
      [
        { ...currentReservations[0], memberId: "member_other" },
        currentReservations[1],
      ],
      [{ ...currentReservations[0], quantity: 999 }, currentReservations[1]],
    ];
    for (const candidate of cases) {
      expect(
        planManualPaymentVerification({ ...common, reservations: candidate }),
      ).toEqual({ state: "refused", code: "reservation_mismatch" });
    }
  });

  it("rejects an invoice whose authoritative lines collapse to one line key", () => {
    const current = invoice();
    const forgedInvoice = {
      ...current,
      lines: [
        current.lines[0],
        {
          ...current.lines[1],
          productId: current.lines[0].productId,
          variantId: current.lines[0].variantId,
          sku: current.lines[0].sku,
        },
      ],
    } as ManualOrderInvoice;
    expect(
      planManualPaymentVerification({
        invoice: forgedInvoice,
        report: report(forgedInvoice),
        evidence: verificationEvidence(forgedInvoice),
        authenticatedActorId: "admin_one",
        authorization: authorization(),
        clock: clock(VERIFIED_AT),
        state: verificationState(),
        reservations: reservations(forgedInvoice),
      }),
    ).toEqual({ state: "refused", code: "reservation_mismatch" });
  });

  it("replays the same idempotency fingerprint and conflicts on changed payload", () => {
    const current = invoice();
    const currentReport = report(current);
    const evidence = verificationEvidence(current);
    const first = planManualPaymentVerification(
      verificationInput(current, { report: currentReport, evidence }),
    );
    if (first.state !== "accepted") throw new Error("expected first plan");
    const prior = committedVerificationPlan(first.value.plan);
    const replay = planManualPaymentVerification(
      verificationInput(current, {
        report: currentReport,
        evidence,
        clock: clock("2026-08-03T20:45:00.000Z"),
        state: verificationState({
          prior,
          transactionOwner: occurrenceOwner(current),
          proofOwner: occurrenceOwner(current),
        }),
      }),
    );
    expect(replay.state).toBe("accepted");
    if (replay.state === "accepted") {
      expect(replay.value.replayed).toBe(true);
      expect(replay.value.plan).toEqual(first.value.plan);
    }
    expect(
      planManualPaymentVerification(
        verificationInput(current, {
          report: currentReport,
          evidence: verificationEvidence(current, {
            externalTransactionRef: opaque("external_txn", "changed-0002"),
          }),
          clock: clock("2026-08-03T20:45:00.000Z"),
          state: verificationState({
            prior,
            transactionOwner: occurrenceOwner(current),
            proofOwner: occurrenceOwner(current),
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
  });

  it("rejects tampered, malformed, throwing, and wrong-owner verification state", () => {
    const current = invoice();
    const currentReport = report(current);
    const evidence = verificationEvidence(current);
    const common = verificationInput(current, {
      report: currentReport,
      evidence,
    });
    const first = planManualPaymentVerification(common);
    if (first.state !== "accepted") throw new Error("expected first plan");
    const prior = committedVerificationPlan(first.value.plan);
    const alteredPlan: ManualPaymentVerificationPlan = {
      ...first.value.plan,
      effects: first.value.plan.effects.map((effect, index) =>
        index === 0 ? { ...effect, reference: "XRO-TAMPERED" } : effect,
      ),
    };
    expect(
      planManualPaymentVerification({
        ...common,
        state: verificationState({
          prior: {
            ...prior,
            plan: alteredPlan,
          },
          transactionOwner: occurrenceOwner(current),
          proofOwner: occurrenceOwner(current),
        }),
      }),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
    expect(
      planManualPaymentVerification({
        ...common,
        state: verificationState({
          prior: { ...prior, untrusted: true },
          transactionOwner: occurrenceOwner(current),
          proofOwner: occurrenceOwner(current),
        }),
      }),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
    expect(
      planManualPaymentVerification({
        ...common,
        state: verificationState({
          prior,
          transactionOwner: {
            ...(occurrenceOwner(current) as Record<string, unknown>),
            memberId: "member_other",
          },
          proofOwner: occurrenceOwner(current),
        }),
      }),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });

    const throwingState: ManualPaymentVerificationStatePort = {
      resolvePlanByIdempotency: () => {
        throw new Error("state unavailable");
      },
      resolveExternalTransactionOwner: () => null,
      resolveProofOwner: () => null,
    };
    expect(
      planManualPaymentVerification({ ...common, state: throwingState }),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
  });

  it("binds idempotency to complete proof metadata and report timestamps", () => {
    const current = invoice();
    const currentReport = report(current);
    const evidence = verificationEvidence(current);
    const common = verificationInput(current, { evidence });
    const first = planManualPaymentVerification({
      ...common,
      report: currentReport,
    });
    if (first.state !== "accepted") throw new Error("expected first plan");
    const prior = committedVerificationPlan(first.value.plan);
    const metadataResult = reportManualOrderPayment(
      current,
      reportPayload(current, {
        proof: proof({
          storageObjectRef:
            "private/manual-payment-proofs/member_alpha/order_alpha/proof_2",
          sha256: "b".repeat(64),
          mimeType: "application/pdf",
          sizeBytes: 54_321,
          uploadedAt: "2026-08-03T20:09:00.000Z",
        }),
      }),
      clock(REPORTED_AT),
    );
    if (metadataResult.state !== "accepted") {
      throw new Error("expected metadata report");
    }
    const timestampResult = reportManualOrderPayment(
      current,
      reportPayload(current, {
        reportedAt: "2026-08-03T20:11:00.000Z",
      }),
      clock("2026-08-03T20:11:00.000Z"),
    );
    if (timestampResult.state !== "accepted") {
      throw new Error("expected timestamp report");
    }
    for (const changedReport of [metadataResult.value, timestampResult.value]) {
      expect(
        planManualPaymentVerification({
          ...common,
          report: changedReport,
          state: verificationState({
            prior,
            transactionOwner: occurrenceOwner(current),
            proofOwner: occurrenceOwner(current),
          }),
        }),
      ).toEqual({ state: "refused", code: "idempotency_conflict" });
    }
  });

  it("expiry plans only release holds and never create paid-side intents", () => {
    const current = invoice();
    const result = planManualInvoiceExpiry(
      current,
      clock("2026-08-03T21:01:00.000Z"),
      reservations(current),
    );
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    expect(result.value.releaseReservationIds).toEqual([
      "reservation_1",
      "reservation_2",
    ]);
    expect(JSON.stringify(result.value)).not.toMatch(
      /paid|receipt|supplier|commission/,
    );
  });

  it("fails expiry closed on clock errors and non-exact reservation cardinality", () => {
    const current = invoice();
    for (const hostileClock of [
      { now: () => null as unknown as string },
      {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      clock(DUE_AT),
    ]) {
      expect(
        planManualInvoiceExpiry(current, hostileClock, reservations(current)),
      ).toEqual({ state: "refused", code: "validation_failed" });
    }
    const currentReservations = reservations(current);
    for (const candidate of [
      [currentReservations[0]],
      [
        currentReservations[0],
        {
          ...currentReservations[1],
          reservationId: currentReservations[0].reservationId,
        },
      ],
      [
        currentReservations[0],
        {
          ...currentReservations[1],
          lineKey: currentReservations[0].lineKey,
        },
      ],
      [currentReservations[0], { ...currentReservations[1], quantity: 999 }],
    ]) {
      expect(
        planManualInvoiceExpiry(
          current,
          clock("2026-08-03T21:01:00.000Z"),
          candidate,
        ),
      ).toEqual({ state: "refused", code: "reservation_mismatch" });
    }
  });
});

describe("externally completed refund record planning", () => {
  function refundEvidence(
    current: ManualOrderInvoice,
    overrides: Record<string, unknown> = {},
  ): unknown {
    return {
      externalRefundRef: opaque("external_refund", "completed-0001"),
      externalTransactionRef: opaque("external_txn", "verified-0001"),
      method: "zelle",
      reason: "customer_service_resolution",
      proof: proof({
        storageObjectRef:
          "private/manual-payment-proofs/member_alpha/order_alpha/refund_1",
        sha256: "c".repeat(64),
        uploadedAt: "2026-08-03T20:29:00.000Z",
      }),
      completedAt: "2026-08-03T20:30:00.000Z",
      amountCents: 5_000,
      currency: "USD",
      idempotencyKey: "refund:order_alpha:0001",
      allocations: [
        {
          lineKey: key(
            current.lines[1].productId,
            current.lines[1].variantId,
            current.lines[1].sku,
          ),
          amountCents: 5_000,
        },
      ],
      ...overrides,
    };
  }

  function committedRefund(
    current: ManualOrderInvoice,
    overrides: Record<string, unknown> = {},
  ): unknown {
    return {
      memberId: current.memberId,
      orderId: current.orderId,
      externalRefundRef: opaque("external_refund", "committed-0001"),
      idempotencyKey: "refund:order_alpha:prior1",
      amountCents: 1_000,
      currency: "USD",
      proofSha256: "e".repeat(64),
      allocations: [
        {
          lineKey: key(
            current.lines[1].productId,
            current.lines[1].variantId,
            current.lines[1].sku,
          ),
          amountCents: 1_000,
        },
      ],
      refundFingerprint: "d".repeat(64),
      state: "refund_committed",
      ...overrides,
    };
  }

  function refundInput(
    current = invoice(),
    overrides: Partial<PlanManualRefundInput> = {},
  ): PlanManualRefundInput {
    return {
      invoice: current,
      evidence: refundEvidence(current),
      authenticatedActorId: "admin_one",
      authorization: authorization("admin"),
      clock: clock("2026-08-03T20:30:00.000Z"),
      commits: commitPort(current),
      ...overrides,
    };
  }

  function committedRefundPlan(
    plan: ManualRefundPlan,
  ): CommittedManualRefundPlan {
    return {
      memberId: plan.memberId,
      orderId: plan.orderId,
      idempotencyKey: plan.idempotencyKey,
      refundFingerprint: plan.refundFingerprint,
      plan,
      state: "refund_plan_committed",
    };
  }

  it("records only a completed external refund plan and never moves money or restocks", () => {
    const current = invoice();
    const input = refundInput(current);
    const result = planExternallyCompletedManualRefund(input);
    expect(result.state).toBe("accepted");
    if (result.state !== "accepted") return;
    const plan = result.value.plan;
    expect(result.value.replayed).toBe(false);
    expect(plan.refundRef).toMatch(/^RFND-XRM-[A-F0-9]{12}$/);
    expect(
      planExternallyCompletedManualRefund(refundInput(current)),
    ).toMatchObject({
      state: "accepted",
      value: { plan: { refundRef: plan.refundRef } },
    });
    expect(plan.movesMoney).toBe(false);
    expect(plan.restocksInventory).toBe(false);
    expect(plan.method).toBe("zelle");
    expect(plan.reason).toBe("customer_service_resolution");
    expect(plan.recordedByActorId).toBe("admin_one");
    expect(plan.recordedByRole).toBe("admin");
    expect(plan.effects.map((effect) => effect.kind)).toEqual([
      "credit_record",
      "refund_record",
      "commission_reversal_evaluate",
      "audit_append",
      "notification_enqueue",
    ]);
    expect(plan.effects.map((effect) => effect.kind)).not.toContain(
      "inventory_write",
    );
  });

  it("rejects excess/refunded-again amounts, unknown lines, duplicates, and unverified transaction evidence", () => {
    const current = invoice();
    const base = refundInput(current);
    expect(
      planExternallyCompletedManualRefund({
        ...base,
        evidence: refundEvidence(current, {
          amountCents: 30_001,
          allocations: [
            {
              lineKey: key(
                current.lines[0].productId,
                current.lines[0].variantId,
                current.lines[0].sku,
              ),
              amountCents: 30_001,
            },
          ],
        }),
      }),
    ).toEqual({ state: "refused", code: "refund_exceeds_verified" });
    expect(
      planExternallyCompletedManualRefund({
        ...base,
        evidence: refundEvidence(current, {
          allocations: [{ lineKey: "unknown:line:key", amountCents: 5_000 }],
        }),
      }),
    ).toEqual({ state: "refused", code: "refund_line_unknown" });
    expect(
      planExternallyCompletedManualRefund({
        ...base,
        evidence: refundEvidence(current),
        commits: commitPort(current, {
          externalRefundOwner: occurrenceOwner(
            current,
            "refund:order_alpha:0001",
          ),
        }),
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    expect(
      planExternallyCompletedManualRefund({
        ...base,
        evidence: refundEvidence(current, {
          externalTransactionRef: "external_txn_wrong_9999",
        }),
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });

    const first = planExternallyCompletedManualRefund({
      ...base,
      evidence: refundEvidence(current, {
        amountCents: 20_000,
        allocations: [
          {
            lineKey: key(
              current.lines[0].productId,
              current.lines[0].variantId,
              current.lines[0].sku,
            ),
            amountCents: 20_000,
          },
        ],
      }),
    });
    if (first.state !== "accepted") throw new Error("expected first refund");
    const firstPlan = first.value.plan;
    expect(
      planExternallyCompletedManualRefund({
        ...base,
        evidence: refundEvidence(current, {
          externalRefundRef: opaque("external_refund", "completed-0002"),
          amountCents: 10_001,
          idempotencyKey: "refund:order_alpha:0002",
          allocations: [
            {
              lineKey: key(
                current.lines[0].productId,
                current.lines[0].variantId,
                current.lines[0].sku,
              ),
              amountCents: 10_001,
            },
          ],
        }),
        commits: commitPort(current, {
          committedRefunds: [
            {
              memberId: current.memberId,
              orderId: current.orderId,
              externalRefundRef: firstPlan.externalRefundRef,
              idempotencyKey: firstPlan.idempotencyKey,
              amountCents: firstPlan.amountCents,
              currency: "USD",
              proofSha256: firstPlan.proofSha256,
              allocations: firstPlan.allocations,
              refundFingerprint: firstPlan.refundFingerprint,
              state: "refund_committed",
            },
          ],
        }),
      }),
    ).toEqual({ state: "refused", code: "refund_exceeds_verified" });
  });

  it("resolves authorization and committed state only through trusted ports", () => {
    const current = invoice();
    const evidence = refundEvidence(current);
    const common = refundInput(current, { evidence });
    const nullAuthorization = vi.fn(() => null);
    const unauthorizedCommits = commitPort(current);
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: { resolveRole: nullAuthorization },
        commits: unauthorizedCommits,
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(nullAuthorization).toHaveBeenCalledWith("admin_one");
    for (const resolver of [
      unauthorizedCommits.resolveVerification,
      unauthorizedCommits.listCommittedRefunds,
      unauthorizedCommits.resolveRefundPlanByIdempotency,
      unauthorizedCommits.resolveExternalRefundOwner,
      unauthorizedCommits.resolveRefundProofOwner,
    ]) {
      expect(resolver).not.toHaveBeenCalled();
    }

    const throwingAuthorization = vi.fn(() => {
      throw new Error("authorization unavailable");
    });
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: { resolveRole: throwingAuthorization },
        commits: commitPort(current),
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });

    const invalidActorCommits = commitPort(current);
    const invalidActorAuthorization = vi.fn(() => "owner" as const);
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authenticatedActorId: "",
        authorization: { resolveRole: invalidActorAuthorization },
        commits: invalidActorCommits,
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(invalidActorAuthorization).not.toHaveBeenCalled();
    for (const resolver of [
      invalidActorCommits.resolveVerification,
      invalidActorCommits.listCommittedRefunds,
      invalidActorCommits.resolveRefundPlanByIdempotency,
      invalidActorCommits.resolveExternalRefundOwner,
      invalidActorCommits.resolveRefundProofOwner,
    ]) {
      expect(resolver).not.toHaveBeenCalled();
    }

    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: authorization("admin"),
        commits: commitPort(current, { verification: null }),
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });

    const resolveThrows: ManualPaymentCommitPort = {
      ...commitPort(current),
      resolveVerification: () => {
        throw new Error("verification store unavailable");
      },
    };
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: authorization("admin"),
        commits: resolveThrows,
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });

    const listThrows: ManualPaymentCommitPort = {
      ...commitPort(current),
      listCommittedRefunds: () => {
        throw new Error("refund store unavailable");
      },
    };
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: authorization("admin"),
        commits: listThrows,
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });

    const nonArrayList = {
      ...commitPort(current),
      listCommittedRefunds: () => "forged-non-array",
    } as unknown as ManualPaymentCommitPort;
    expect(
      planExternallyCompletedManualRefund({
        ...common,
        authorization: authorization("admin"),
        commits: nonArrayList,
      }),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });

    for (const commits of [
      {
        ...commitPort(current),
        resolveRefundPlanByIdempotency: () => {
          throw new Error("refund plan store unavailable");
        },
      },
      {
        ...commitPort(current),
        resolveExternalRefundOwner: () => {
          throw new Error("external-ref index unavailable");
        },
      },
      {
        ...commitPort(current),
        resolveRefundProofOwner: () => {
          throw new Error("proof index unavailable");
        },
      },
    ]) {
      expect(
        planExternallyCompletedManualRefund({
          ...common,
          authorization: authorization("admin"),
          commits,
        }),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
  });

  it("calls durable commit ports with the exact authenticated invoice scope", () => {
    const current = invoice();
    const resolveVerification = vi.fn(() => committedVerification(current));
    const listCommittedRefunds = vi.fn(() => []);
    const resolveRefundPlanByIdempotency = vi.fn(() => null);
    const resolveExternalRefundOwner = vi.fn(() => null);
    const resolveRefundProofOwner = vi.fn(() => null);
    const result = planExternallyCompletedManualRefund({
      invoice: current,
      evidence: refundEvidence(current),
      authenticatedActorId: "admin_one",
      authorization: authorization("admin"),
      clock: clock("2026-08-03T20:30:00.000Z"),
      commits: {
        resolveVerification,
        listCommittedRefunds,
        resolveRefundPlanByIdempotency,
        resolveExternalRefundOwner,
        resolveRefundProofOwner,
      },
    });
    expect(result.state).toBe("accepted");
    expect(resolveVerification).toHaveBeenCalledOnce();
    expect(resolveVerification).toHaveBeenCalledWith({
      memberId: current.memberId,
      orderId: current.orderId,
      externalTransactionRef: opaque("external_txn", "verified-0001"),
    });
    expect(listCommittedRefunds).toHaveBeenCalledOnce();
    expect(listCommittedRefunds).toHaveBeenCalledWith({
      memberId: current.memberId,
      orderId: current.orderId,
    });
    expect(resolveRefundPlanByIdempotency).toHaveBeenCalledWith({
      memberId: current.memberId,
      orderId: current.orderId,
      idempotencyKey: "refund:order_alpha:0001",
    });
    expect(resolveExternalRefundOwner).toHaveBeenCalledWith(
      opaque("external_refund", "completed-0001"),
    );
    expect(resolveRefundProofOwner).toHaveBeenCalledWith("c".repeat(64));
  });

  it("uses only the server clock for refund completion", () => {
    const current = invoice();
    for (const hostileClock of [
      { now: () => null as unknown as string },
      {
        now: () => {
          throw new Error("clock unavailable");
        },
      },
      clock("2026-08-03T20:30:01.000Z"),
    ]) {
      expect(
        planExternallyCompletedManualRefund(
          refundInput(current, { clock: hostileClock }),
        ),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
  });

  it("replays only the exact committed refund plan and occurrence owners", () => {
    const current = invoice();
    const first = planExternallyCompletedManualRefund(refundInput(current));
    if (first.state !== "accepted") throw new Error("expected first refund");
    const plan = first.value.plan;
    const committedRecord = {
      memberId: plan.memberId,
      orderId: plan.orderId,
      externalRefundRef: plan.externalRefundRef,
      idempotencyKey: plan.idempotencyKey,
      amountCents: plan.amountCents,
      currency: plan.currency,
      proofSha256: plan.proofSha256,
      allocations: plan.allocations,
      refundFingerprint: plan.refundFingerprint,
      state: "refund_committed" as const,
    };
    const owner = occurrenceOwner(current, plan.idempotencyKey);
    const replayCommits = commitPort(current, {
      committedRefunds: [committedRecord],
      priorRefundPlan: committedRefundPlan(plan),
      externalRefundOwner: owner,
      refundProofOwner: owner,
    });
    const replay = planExternallyCompletedManualRefund(
      refundInput(current, {
        clock: clock("2026-08-03T20:45:00.000Z"),
        commits: replayCommits,
      }),
    );
    expect(replay).toEqual({
      state: "accepted",
      value: { plan, replayed: true },
    });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          evidence: refundEvidence(current, {
            amountCents: 4_999,
            allocations: [
              {
                lineKey: key(
                  current.lines[1].productId,
                  current.lines[1].variantId,
                  current.lines[1].sku,
                ),
                amountCents: 4_999,
              },
            ],
          }),
          clock: clock("2026-08-03T20:45:00.000Z"),
          commits: replayCommits,
        }),
      ),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
  });

  it("rejects malformed, wrong-owner, and incomplete committed replay state", () => {
    const current = invoice();
    const first = planExternallyCompletedManualRefund(refundInput(current));
    if (first.state !== "accepted") throw new Error("expected first refund");
    const plan = first.value.plan;
    const prior = committedRefundPlan(plan);
    const committedRecord = {
      memberId: plan.memberId,
      orderId: plan.orderId,
      externalRefundRef: plan.externalRefundRef,
      idempotencyKey: plan.idempotencyKey,
      amountCents: plan.amountCents,
      currency: plan.currency,
      proofSha256: plan.proofSha256,
      allocations: plan.allocations,
      refundFingerprint: plan.refundFingerprint,
      state: "refund_committed" as const,
    };
    const owner = occurrenceOwner(current, plan.idempotencyKey);
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          commits: commitPort(current, {
            priorRefundPlan: { ...prior, untrusted: true },
            committedRefunds: [committedRecord],
            externalRefundOwner: owner,
            refundProofOwner: owner,
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          commits: commitPort(current, {
            priorRefundPlan: prior,
            committedRefunds: [],
            externalRefundOwner: owner,
            refundProofOwner: owner,
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          commits: commitPort(current, {
            priorRefundPlan: prior,
            committedRefunds: [committedRecord],
            externalRefundOwner: {
              memberId: "member_other",
              orderId: current.orderId,
              idempotencyKey: plan.idempotencyKey,
            },
            refundProofOwner: owner,
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          commits: commitPort(current, {
            priorRefundPlan: prior,
            committedRefunds: [committedRecord],
            externalRefundOwner: owner,
            refundProofOwner: null,
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "idempotency_conflict" });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          commits: commitPort(current, {
            committedRefunds: [committedRecord],
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
  });

  it("rejects cross-order external-ref and proof ownership collisions", () => {
    const current = invoice();
    const foreignOwner = {
      memberId: "member_other",
      orderId: "order_other",
      idempotencyKey: "refund:foreign_order:0001",
    };
    for (const commits of [
      commitPort(current, { externalRefundOwner: foreignOwner }),
      commitPort(current, { refundProofOwner: foreignOwner }),
    ]) {
      expect(
        planExternallyCompletedManualRefund(refundInput(current, { commits })),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
  });

  it("caps a refund by the selected line subtotal", () => {
    const current = invoice();
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          evidence: refundEvidence(current, {
            amountCents: 5_001,
            allocations: [
              {
                lineKey: key(
                  current.lines[1].productId,
                  current.lines[1].variantId,
                  current.lines[1].sku,
                ),
                amountCents: 5_001,
              },
            ],
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "refund_exceeds_verified" });
  });

  it("requires exact positive unique known allocations whose sum equals the refund", () => {
    const current = invoice();
    const lineKey = key(
      current.lines[1].productId,
      current.lines[1].variantId,
      current.lines[1].sku,
    );
    for (const allocations of [
      [],
      [{ lineKey, amountCents: 4_999 }],
      [
        { lineKey, amountCents: 2_500 },
        { lineKey, amountCents: 2_500 },
      ],
      [{ lineKey, amountCents: 0 }],
      [{ lineKey, amountCents: -5_000 }],
    ]) {
      expect(
        planExternallyCompletedManualRefund(
          refundInput(current, {
            evidence: refundEvidence(current, { allocations }),
          }),
        ),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          evidence: refundEvidence(current, {
            allocations: [{ lineKey: "unknown:line:key", amountCents: 5_000 }],
          }),
        }),
      ),
    ).toEqual({ state: "refused", code: "refund_line_unknown" });
  });

  it("caps cumulative committed allocation per line despite order headroom", () => {
    const current = invoice();
    const lineKey = key(
      current.lines[1].productId,
      current.lines[1].variantId,
      current.lines[1].sku,
    );
    const prior = committedRefund(current, {
      amountCents: 4_000,
      allocations: [{ lineKey, amountCents: 4_000 }],
    });
    expect(
      planExternallyCompletedManualRefund(
        refundInput(current, {
          evidence: refundEvidence(current, {
            amountCents: 2_000,
            allocations: [{ lineKey, amountCents: 2_000 }],
          }),
          commits: commitPort(current, { committedRefunds: [prior] }),
        }),
      ),
    ).toEqual({ state: "refused", code: "refund_exceeds_verified" });
  });

  it("rejects malformed, duplicate, negative, and cross-scope committed refunds", () => {
    const current = invoice();
    const base = refundInput(current);
    const duplicate = committedRefund(current);
    const cases: readonly (readonly unknown[])[] = [
      [committedRefund(current, { amountCents: -1 })],
      [committedRefund(current, { memberId: "member_other" })],
      [committedRefund(current, { orderId: "order_other" })],
      [committedRefund(current, { idempotencyKey: 123 })],
      [committedRefund(current, { proofSha256: { hostile: true } })],
      [duplicate, duplicate],
      [
        committedRefund(current),
        committedRefund(current, {
          externalRefundRef: opaque("external_refund", "committed-0002"),
        }),
      ],
    ];
    for (const committedRefunds of cases) {
      expect(
        planExternallyCompletedManualRefund({
          ...base,
          commits: commitPort(current, { committedRefunds }),
        }),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
  });

  it("rejects request-controlled actor fields and plaintext opaque references", () => {
    const current = invoice();
    const common = refundInput(current);
    for (const patch of [
      { actorId: "admin_one" },
      { actorRole: "owner" },
      { actorRole: "operations_admin" },
      { externalRefundRef: "external_refund:15551234567" },
      { externalTransactionRef: "external_txn:15551234567" },
    ]) {
      expect(
        planExternallyCompletedManualRefund({
          ...common,
          evidence: refundEvidence(current, patch),
        }),
      ).toEqual({ state: "refused", code: "refund_evidence_invalid" });
    }
  });
});

describe("member projection and reconciliation", () => {
  it("projects an explicit safe member shape with no private or economic internals", () => {
    const current = invoice();
    const resolveMemberId = vi.fn(() => current.memberId);
    const result = projectManualPaymentForMember(current, report(current), {
      resolveMemberId,
    });
    expect(result.state).toBe("accepted");
    expect(resolveMemberId).toHaveBeenCalledOnce();
    expect(resolveMemberId).toHaveBeenCalledWith();
    if (result.state !== "accepted") return;
    const pending = result.value;
    expect(Object.keys(pending).sort()).toEqual(
      [
        "orderRef",
        "invoiceRef",
        "paymentMemo",
        "amountCents",
        "currency",
        "method",
        "status",
        "dueAt",
      ].sort(),
    );
    expect(pending.status).toBe("reported_pending_verification");
    expect(JSON.stringify(pending)).not.toMatch(
      /configuration|instruction|storage|sha256|proof|provider|transaction|supplier|wholesale|margin|recipient|account/i,
    );
    const foreign = { ...report(current), orderId: "order_other" };
    expect(
      projectManualPaymentForMember(
        current,
        foreign as ManualPaymentReport,
        viewer(current.memberId),
      ),
    ).toEqual({ state: "refused", code: "report_mismatch" });
  });

  it("authorizes member projection only through the viewer port", () => {
    const current = invoice();
    const nullViewer = vi.fn(() => null);
    expect(
      projectManualPaymentForMember(current, report(current), {
        resolveMemberId: nullViewer,
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(nullViewer).toHaveBeenCalledOnce();
    expect(
      projectManualPaymentForMember(
        current,
        report(current),
        viewer("member_other"),
      ),
    ).toEqual({ state: "refused", code: "not_permitted" });
    expect(
      projectManualPaymentForMember(current, report(current), {
        resolveMemberId: () => {
          throw new Error("viewer unavailable");
        },
      }),
    ).toEqual({ state: "refused", code: "not_permitted" });
  });

  it("detects the closed reconciliation anomaly taxonomy without raw detail", () => {
    expect(
      reconcileManualPayment({
        now: "2026-08-03T22:00:00.000Z",
        invoiceDueAt: DUE_AT,
        reported: false,
        paid: true,
        supplierReleased: false,
        receiptIssued: false,
        notificationFailed: true,
        originalAmountCents: 30_000,
        currentAmountCents: 30_001,
        externalTransactionUseCount: 2,
        proofUseCount: 2,
        senderAmountTimeFingerprintUseCount: 2,
      }),
    ).toEqual([
      "duplicate_transaction",
      "duplicate_proof",
      "same_sender_amount_time",
      "paid_without_supplier_release",
      "receipt_missing",
      "notification_failed",
      "proof_overdue",
    ]);
    expect(
      reconcileManualPayment({
        now: VERIFIED_AT,
        invoiceDueAt: DUE_AT,
        reported: true,
        paid: false,
        supplierReleased: true,
        receiptIssued: false,
        notificationFailed: false,
        originalAmountCents: 30_000,
        currentAmountCents: 29_999,
        externalTransactionUseCount: 1,
        proofUseCount: 1,
        senderAmountTimeFingerprintUseCount: 1,
      }),
    ).toEqual(["supplier_release_without_paid", "total_changed_after_proof"]);
  });

  it("returns only input_invalid for malformed reconciliation evidence", () => {
    const valid = {
      now: VERIFIED_AT,
      invoiceDueAt: DUE_AT,
      reported: false,
      paid: false,
      supplierReleased: false,
      receiptIssued: false,
      notificationFailed: false,
      originalAmountCents: 30_000,
      currentAmountCents: 30_000,
      externalTransactionUseCount: 0,
      proofUseCount: 0,
      senderAmountTimeFingerprintUseCount: 0,
    };
    for (const candidate of [
      { ...valid, now: "not-a-time" },
      { ...valid, originalAmountCents: 0 },
      { ...valid, externalTransactionUseCount: -1 },
      { ...valid, paid: "true" as unknown as boolean },
    ]) {
      const result = reconcileManualPayment(candidate);
      expect(result).toEqual(["input_invalid"]);
      expect(Object.isFrozen(result)).toBe(true);
    }
  });
});
