import { describe, expect, it } from "vitest";
import { EARLY_ACCESS_PAYMENT_OPTION_CODES } from "@shared/research/early-access-payment-options";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import {
  EARLY_ACCESS_EXACTLY_ONCE_INVARIANT,
  EARLY_ACCESS_VERIFIER_ROLES,
  readEarlyAccessVerifiedOrder,
  receiptIntentIdFor,
  supplierReleaseIntentIdFor,
  verificationUniqueKeyFor,
  verifyManualPayment,
  type EarlyAccessPaymentVerification,
  type EarlyAccessVerificationRecord,
  type EarlyAccessVerificationResult,
} from "./payment-verification";

const CREATED_AT = "2026-08-04T12:00:00.000Z";
const DECIDED_AT = "2026-08-04T14:00:00.000Z";
const REPLAYED_AT = "2026-08-04T18:00:00.000Z";

const FOUNDER = Object.freeze({ id: "adm_alex", role: "founder_admin" });
const OPERATIONS = Object.freeze({ id: "adm_dana", role: "operations_admin" });
const KEY = "verify-ord-ea-0001-a";
const OTHER_KEY = "verify-ord-ea-0001-b";

function order(overrides: Record<string, unknown> = {}): EarlyAccessOrder {
  const result = createEarlyAccessOrder({
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
    productId: "prd_bpc157",
    variantId: "var_5mg",
    sku: "XEA-BPC-5MG",
    quantity: 2,
    unitPriceCents: 12_450,
    currency: "USD",
    referralCode: "ALEX-2026",
    now: CREATED_AT,
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return Object.freeze({
    ...result.value,
    status: "payment_under_review",
    ...overrides,
  }) as EarlyAccessOrder;
}

function verify(overrides: Record<string, unknown> = {}): EarlyAccessVerificationResult {
  return verifyManualPayment({
    order: order(),
    actor: FOUNDER,
    decision: "approve",
    idempotencyKey: KEY,
    now: DECIDED_AT,
    appliedVerifications: [],
    method: "zelle",
    ...overrides,
  });
}

function applied(overrides: Record<string, unknown> = {}): EarlyAccessPaymentVerification {
  const result = verify(overrides);
  if (!result.ok) throw new Error(`fixture verification refused: ${result.code}`);
  return result.value;
}

/** A store whose insert loses on a duplicate key, the way a unique constraint does. */
class UniqueKeyStore {
  private readonly keys = new Set<string>();

  insert(key: string): boolean {
    if (this.keys.has(key)) return false;
    this.keys.add(key);
    return true;
  }

  get size(): number {
    return this.keys.size;
  }
}

describe("manual payment authorization", () => {
  it("lets a founder admin and an operations admin decide", () => {
    for (const actor of [FOUNDER, OPERATIONS]) {
      const result = verify({ actor });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.value.record.actorId).toBe(actor.id);
      expect(result.value.record.actorRole).toBe(actor.role);
    }
    expect([...EARLY_ACCESS_VERIFIER_ROLES]).toEqual(["founder_admin", "operations_admin"]);
  });

  it("refuses every other role for both approve and reject", () => {
    const roles = [
      "member",
      "support",
      "support_admin",
      "analyst",
      "partner",
      "affiliate",
      "coach",
      "admin",
      "owner",
      "operations",
      "founder",
      "FOUNDER_ADMIN",
      "founder_admin ",
      "",
      "*",
    ];
    for (const role of roles) {
      for (const decision of ["approve", "reject"]) {
        const result = verify({ actor: { id: "usr_someone", role }, decision });
        expect(result).toEqual({ ok: false, code: "forbidden" });
      }
    }
  });

  it("refuses a non string role, a missing role, and an extra actor field", () => {
    expect(verify({ actor: { id: "usr_x", role: null } })).toEqual({ ok: false, code: "forbidden" });
    expect(verify({ actor: { id: "usr_x" } })).toEqual({ ok: false, code: "actor_invalid" });
    expect(verify({ actor: { id: "usr_x", role: "founder_admin", elevated: true } })).toEqual({
      ok: false,
      code: "actor_invalid",
    });
    expect(verify({ actor: { id: "", role: "founder_admin" } })).toEqual({
      ok: false,
      code: "actor_invalid",
    });
    expect(verify({ actor: null })).toEqual({ ok: false, code: "actor_invalid" });
  });

  it("checks authorization before it reads the order, so a refusal leaks no payment state", () => {
    const result = verify({ actor: { id: "usr_member", role: "member" }, order: null });
    expect(result).toEqual({ ok: false, code: "forbidden" });
  });

  it("refuses an unauthorized actor even when replaying an already applied key", () => {
    const first = applied();
    const result = verify({
      actor: { id: "usr_member", role: "member" },
      appliedVerifications: [first.record],
    });
    expect(result).toEqual({ ok: false, code: "forbidden" });
  });
});

describe("manual payment approval", () => {
  it("applies once and reports the transition, the receipt, and the supplier release", () => {
    const value = applied();
    expect(value.outcome).toBe("applied");
    expect(value.commit.firstApplication).toBe(true);
    expect(value.commit.verificationUniqueKey).toBe(verificationUniqueKeyFor("ord_ea_0001"));
    expect(value.transition).toEqual({ from: "payment_under_review", to: "payment_verified" });
    expect(value.record).toEqual({
      orderId: "ord_ea_0001",
      idempotencyKey: KEY,
      decision: "approve",
      actorId: "adm_alex",
      actorRole: "founder_admin",
      decidedAt: DECIDED_AT,
      method: "zelle",
    });
    expect(value.receiptIntent).toEqual({
      intentId: receiptIntentIdFor("ord_ea_0001"),
      kind: "customer_receipt",
      orderReference: "ord_ea_0001",
      amountCents: 24_900,
      currency: "USD",
      issuedAt: DECIDED_AT,
      performed: false,
    });
    expect(value.supplierReleaseIntent).toEqual({
      intentId: supplierReleaseIntentIdFor("ord_ea_0001"),
      kind: "supplier_release",
      orderReference: "ord_ea_0001",
      sku: "XEA-BPC-5MG",
      quantity: 2,
      releasedAt: DECIDED_AT,
      performed: false,
    });
    expect(value.verifiedOrder?.status).toBe("payment_verified");
    expect(value.verifiedOrder?.verifiedByActorId).toBe("adm_alex");
    expect(value.verifiedOrder?.verificationIdempotencyKey).toBe(KEY);
  });

  it("may approve a payment seen directly, with no proof submitted", () => {
    const value = applied({ order: order({ status: "awaiting_payment" }) });
    expect(value.transition).toEqual({ from: "awaiting_payment", to: "payment_verified" });
    expect(value.outcome).toBe("applied");
  });

  it("carries only the canonical payment vocabulary, and null when none is stated", () => {
    for (const method of EARLY_ACCESS_PAYMENT_OPTION_CODES) {
      expect(applied({ method }).record.method).toBe(method);
    }
    const withoutMethod = verifyManualPayment({
      order: order(),
      actor: FOUNDER,
      decision: "approve",
      idempotencyKey: KEY,
      now: DECIDED_AT,
      appliedVerifications: [],
    });
    expect(withoutMethod.ok && withoutMethod.value.record.method).toBeNull();
    expect(verify({ method: "bitcoin" })).toEqual({ ok: false, code: "method_unsupported" });
  });

  it("neither intent has been performed", () => {
    const value = applied();
    expect(value.receiptIntent?.performed).toBe(false);
    expect(value.supplierReleaseIntent?.performed).toBe(false);
  });
});

describe("manual payment rejection", () => {
  it("moves the order to payment_rejected and produces no receipt or release", () => {
    const value = applied({ decision: "reject" });
    expect(value.transition).toEqual({ from: "payment_under_review", to: "payment_rejected" });
    expect(value.receiptIntent).toBeNull();
    expect(value.supplierReleaseIntent).toBeNull();
    expect(value.verifiedOrder).toBeNull();
  });

  it("refuses to reject a payment that was already verified", () => {
    const approvedRecord = applied().record;
    const result = verify({
      decision: "reject",
      idempotencyKey: OTHER_KEY,
      appliedVerifications: [approvedRecord],
    });
    expect(result).toEqual({ ok: false, code: "order_already_verified" });
  });

  it("refuses to approve a rejected order, including under a fresh key", () => {
    const rejectedRecord = applied({ decision: "reject" }).record;
    const order_ = order({ status: "payment_rejected" });
    expect(
      verify({
        order: order_,
        decision: "approve",
        idempotencyKey: OTHER_KEY,
        appliedVerifications: [rejectedRecord],
      }),
    ).toEqual({ ok: false, code: "order_rejected" });
    expect(
      verify({
        order: order_,
        decision: "approve",
        idempotencyKey: KEY,
        appliedVerifications: [rejectedRecord],
      }),
    ).toEqual({ ok: false, code: "idempotency_conflict" });
  });

  it("treats a second rejection as a no-op success", () => {
    const rejectedRecord = applied({ decision: "reject" }).record;
    const result = verify({
      order: order({ status: "payment_rejected" }),
      decision: "reject",
      idempotencyKey: OTHER_KEY,
      appliedVerifications: [rejectedRecord],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe("noop");
    expect(result.value.commit.firstApplication).toBe(false);
    expect(result.value.record).toEqual(rejectedRecord);
  });
});

describe("manual payment idempotency", () => {
  it("returns the same result for a replay of the same key, without applying again", () => {
    const first = applied();
    const replay = verify({
      appliedVerifications: [first.record],
      now: REPLAYED_AT,
      order: order({ status: "payment_verified" }),
    });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.outcome).toBe("replayed");
    expect(replay.value.commit.firstApplication).toBe(false);
    // The original decision, the original actor, and the original moment.
    expect(replay.value.record).toEqual(first.record);
    expect(replay.value.record.decidedAt).toBe(DECIDED_AT);
    expect(replay.value.receiptIntent).toEqual(first.receiptIntent);
    expect(replay.value.supplierReleaseIntent).toEqual(first.supplierReleaseIntent);
    expect(replay.value.verifiedOrder).toEqual(first.verifiedOrder);
  });

  it("refuses a used key that carries a different decision, actor, or method", () => {
    const first = applied();
    expect(verify({ decision: "reject", appliedVerifications: [first.record] })).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(verify({ actor: OPERATIONS, appliedVerifications: [first.record] })).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
    expect(verify({ method: "venmo", appliedVerifications: [first.record] })).toEqual({
      ok: false,
      code: "idempotency_conflict",
    });
  });

  it("treats a second approval under a different key as a no-op, not a second approval", () => {
    const first = applied();
    const second = verify({
      idempotencyKey: OTHER_KEY,
      actor: OPERATIONS,
      now: REPLAYED_AT,
      appliedVerifications: [first.record],
      order: order({ status: "payment_verified" }),
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.outcome).toBe("noop");
    expect(second.value.commit.firstApplication).toBe(false);
    // The stored decision wins: the second actor did not become the approver.
    expect(second.value.record).toEqual(first.record);
    expect(second.value.verifiedOrder).toEqual(first.verifiedOrder);
    expect(second.value.receiptIntent?.intentId).toBe(first.receiptIntent?.intentId);
  });

  it("refuses a malformed idempotency key", () => {
    for (const idempotencyKey of ["", "short", "has space", "a".repeat(129), 12_345, null]) {
      const result = verify({ idempotencyKey });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("idempotency_key_invalid");
    }
  });
});

describe("manual payment exactly once", () => {
  it("applies exactly once across a sequence of differently keyed calls", () => {
    let ledger: EarlyAccessVerificationRecord[] = [];
    const results: EarlyAccessPaymentVerification[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = verify({
        idempotencyKey: `verify-ord-ea-0001-${attempt}`,
        now: DECIDED_AT,
        appliedVerifications: ledger,
        order: order({ status: ledger.length === 0 ? "payment_under_review" : "payment_verified" }),
      });
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      results.push(result.value);
      if (result.value.outcome === "applied") ledger = [result.value.record];
    }

    expect(results.filter((value) => value.outcome === "applied")).toHaveLength(1);
    expect(results.filter((value) => value.commit.firstApplication)).toHaveLength(1);
    expect(ledger).toHaveLength(1);
    expect(new Set(results.map((value) => value.receiptIntent?.intentId)).size).toBe(1);
    expect(new Set(results.map((value) => value.supplierReleaseIntent?.intentId)).size).toBe(1);
    expect(new Set(results.map((value) => value.commit.verificationUniqueKey)).size).toBe(1);
  });

  it("gives concurrent callers on a stale ledger the same unique keys, so storage admits one", async () => {
    const concurrent = await Promise.all(
      ["verify-ord-ea-0001-x", "verify-ord-ea-0001-y", "verify-ord-ea-0001-z"].map(
        async (idempotencyKey) => verify({ idempotencyKey, appliedVerifications: [] }),
      ),
    );

    const verifications = new UniqueKeyStore();
    const receipts = new UniqueKeyStore();
    const releases = new UniqueKeyStore();
    let committed = 0;
    for (const result of concurrent) {
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      // Every racing caller derives its keys from the order, never from its own key.
      if (!verifications.insert(result.value.commit.verificationUniqueKey)) continue;
      committed += 1;
      receipts.insert(result.value.receiptIntent?.intentId ?? "");
      releases.insert(result.value.supplierReleaseIntent?.intentId ?? "");
    }

    expect(committed).toBe(1);
    expect(verifications.size).toBe(1);
    expect(receipts.size).toBe(1);
    expect(releases.size).toBe(1);
    expect(EARLY_ACCESS_EXACTLY_ONCE_INVARIANT.receiptsPerVerifiedOrder).toBe(1);
    expect(EARLY_ACCESS_EXACTLY_ONCE_INVARIANT.supplierReleasesPerVerifiedOrder).toBe(1);
    expect(EARLY_ACCESS_EXACTLY_ONCE_INVARIANT.uniqueKeysAreDerivedFrom).toBe("orderId");
  });

  it("derives every unique key from the order alone", () => {
    const first = applied();
    const other = applied({ actor: OPERATIONS, idempotencyKey: OTHER_KEY, now: REPLAYED_AT });
    expect(other.commit.verificationUniqueKey).toBe(first.commit.verificationUniqueKey);
    expect(other.receiptIntent?.intentId).toBe(first.receiptIntent?.intentId);
    expect(other.supplierReleaseIntent?.intentId).toBe(first.supplierReleaseIntent?.intentId);
    expect(verificationUniqueKeyFor("ord_ea_0002")).not.toBe(
      verificationUniqueKeyFor("ord_ea_0001"),
    );
  });

  it("refuses a ledger that already holds more than one decision for the order", () => {
    const first = applied();
    const second = { ...first.record, idempotencyKey: OTHER_KEY };
    expect(verify({ appliedVerifications: [first.record, second] })).toEqual({
      ok: false,
      code: "ledger_invalid",
    });
  });

  it("refuses a ledger entry that belongs to another order or is malformed", () => {
    const first = applied();
    expect(
      verify({ appliedVerifications: [{ ...first.record, orderId: "ord_ea_0002" }] }),
    ).toEqual({ ok: false, code: "ledger_invalid" });
    expect(verify({ appliedVerifications: [{ ...first.record, decision: "settled" }] })).toEqual({
      ok: false,
      code: "ledger_invalid",
    });
    expect(verify({ appliedVerifications: [{ ...first.record, actorRole: "member" }] })).toEqual({
      ok: false,
      code: "ledger_invalid",
    });
    expect(verify({ appliedVerifications: [{ ...first.record, extra: 1 }] })).toEqual({
      ok: false,
      code: "ledger_invalid",
    });
    expect(verify({ appliedVerifications: "none" })).toEqual({ ok: false, code: "ledger_invalid" });
  });

  it("refuses an order that claims a decided payment with no record behind it", () => {
    for (const status of ["payment_verified", "payment_rejected"]) {
      expect(verify({ order: order({ status }), appliedVerifications: [] })).toEqual({
        ok: false,
        code: "ledger_inconsistent",
      });
    }
  });
});

describe("manual payment input handling", () => {
  it("refuses an invalid order, an extra key, and a Proxy", () => {
    expect(verify({ order: null })).toEqual({ ok: false, code: "order_invalid" });
    expect(verify({ order: { ...order(), orderTotalCents: 1 } })).toEqual({
      ok: false,
      code: "order_invalid",
    });
    expect(verify({ note: "approve it" })).toEqual({ ok: false, code: "input_invalid" });
    expect(verifyManualPayment(new Proxy({}, {}))).toEqual({ ok: false, code: "input_invalid" });
    expect(verifyManualPayment(null)).toEqual({ ok: false, code: "input_invalid" });
  });

  it("refuses an unknown decision", () => {
    for (const decision of ["approved", "APPROVE", "settle", "", 1, null]) {
      const result = verify({ decision });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("decision_invalid");
    }
  });

  it("refuses a decision timestamp that is malformed or predates the order", () => {
    expect(verify({ now: "2026-08-04T14:00:00Z" })).toEqual({ ok: false, code: "timestamp_invalid" });
    expect(verify({ now: "2026-08-04T11:00:00.000Z" })).toEqual({
      ok: false,
      code: "timestamp_invalid",
    });
  });

  it("freezes the result and every nested decision object", () => {
    const value = applied();
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.record)).toBe(true);
    expect(Object.isFrozen(value.commit)).toBe(true);
    expect(Object.isFrozen(value.transition)).toBe(true);
    expect(Object.isFrozen(value.receiptIntent)).toBe(true);
    expect(Object.isFrozen(value.verifiedOrder)).toBe(true);
    expect(() => {
      (value.record as unknown as Record<string, unknown>).actorRole = "member";
    }).toThrow();
  });
});

describe("readEarlyAccessVerifiedOrder", () => {
  it("round trips the projection this module produced", () => {
    const value = applied();
    expect(readEarlyAccessVerifiedOrder(JSON.parse(JSON.stringify(value.verifiedOrder)))).toEqual(
      value.verifiedOrder,
    );
  });

  it("refuses a projection that is not verified, or that carries an extra field", () => {
    const value = applied();
    for (const status of ["awaiting_payment", "payment_under_review", "payment_rejected"]) {
      expect(readEarlyAccessVerifiedOrder({ ...value.verifiedOrder, status })).toBeNull();
    }
    expect(
      readEarlyAccessVerifiedOrder({ ...value.verifiedOrder, proofRef: "prf_0001" }),
    ).toBeNull();
    expect(readEarlyAccessVerifiedOrder({ ...value.verifiedOrder, actorRole: "member" })).toBeNull();
  });
});
