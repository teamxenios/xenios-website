import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import {
  InMemoryProofRepository,
  attachPaymentProof,
  describeProofAttachment,
  type EarlyAccessProofRecord,
} from "./proof-service";
import {
  EARLY_ACCESS_VERIFICATION_ENTRY_KEYS,
  InMemoryVerificationRepository,
  decideManualPayment,
  readEarlyAccessVerificationEntry,
  readEarlyAccessVerificationHistory,
  recordManualPaymentDecision,
  type EarlyAccessVerificationEntry,
} from "./verification-service";

const CREATED = "2026-08-04T12:00:00.000Z";
const UPLOADED = "2026-08-04T12:30:00.000Z";
const DECIDED = "2026-08-04T13:00:00.000Z";
const REUPLOADED = "2026-08-04T14:00:00.000Z";
const REDECIDED = "2026-08-04T15:00:00.000Z";

const ORDER_TOTAL_CENTS = 24_900;
const KEY_ONE = "idem-ea-verify-00000001";
const KEY_TWO = "idem-ea-verify-00000002";
const ADMIN = Object.freeze({ id: "usr_alex_houston", role: "founder_admin" });

function order(overrides: Record<string, unknown> = {}): EarlyAccessOrder {
  const result = createEarlyAccessOrder({
    orderId: "ord_ea_0001",
    customerRef: "cus_samuel",
    productId: "prd_bpc157",
    variantId: "var_5mg",
    sku: "XEA-BPC-5MG",
    quantity: 2,
    unitPriceCents: 12_450,
    unitPriceVersion: "prdver-9f2c1a",
    currency: "USD",
    now: CREATED,
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return Object.freeze({
    ...result.value,
    status: "payment_under_review",
    ...overrides,
  }) as EarlyAccessOrder;
}

function proof(overrides: Record<string, unknown> = {}): EarlyAccessProofRecord {
  const result = describeProofAttachment({
    order: order({ status: "awaiting_payment" }),
    proofs: [],
    proofId: "prf_0001",
    storageRef: "obj_zelle_receipt_a1",
    filename: "zelle-receipt.png",
    contentType: "image/png",
    byteSize: 240_512,
    method: "zelle",
    uploadedBy: "cus_samuel",
    uploadedAt: UPLOADED,
    supersedesProofId: null,
    ...overrides,
  });
  if (!result.ok) throw new Error(`fixture proof refused: ${result.code}`);
  return result.value.record;
}

/** The clearer photo a customer sends after a rejection. */
function replacementProof(): EarlyAccessProofRecord {
  const result = describeProofAttachment({
    order: order(),
    proofs: [proof()],
    proofId: "prf_0002",
    storageRef: "obj_zelle_receipt_b2",
    filename: "zelle-receipt-clear.png",
    contentType: "image/png",
    byteSize: 310_000,
    method: "zelle",
    uploadedBy: "cus_samuel",
    uploadedAt: REUPLOADED,
    supersedesProofId: "prf_0001",
  });
  if (!result.ok) throw new Error(`fixture replacement refused: ${result.code}`);
  return result.value.record;
}

function decide(overrides: Record<string, unknown> = {}) {
  return decideManualPayment({
    order: order(),
    proofs: [proof()],
    decisions: [],
    actor: { ...ADMIN },
    decision: "approve",
    reason: "Zelle receipt matches the order total.",
    reviewedProofRef: "obj_zelle_receipt_a1",
    amountVerifiedCents: ORDER_TOTAL_CENTS,
    currency: "USD",
    idempotencyKey: KEY_ONE,
    now: DECIDED,
    method: "zelle",
    ...overrides,
  });
}

function entryFrom(result: ReturnType<typeof decide>): EarlyAccessVerificationEntry {
  if (!result.ok) throw new Error(`fixture decision refused: ${result.code}`);
  if (result.value.append === null) throw new Error("fixture decision appended nothing");
  return result.value.append;
}

function rejection(overrides: Record<string, unknown> = {}) {
  return decide({
    decision: "reject",
    reason: "The screenshot shows a different amount.",
    ...overrides,
  });
}

describe("a payment cannot be verified without a proof on file", () => {
  it("refuses every decision when the proof chain is empty", () => {
    for (const decision of ["approve", "reject"]) {
      expect(decide({ proofs: [], decision })).toEqual({ ok: false, code: "proof_missing" });
    }
  });

  it("refuses a proof chain that belongs to another order", () => {
    const foreign = { ...proof(), orderId: "ord_ea_0002" };
    expect(decide({ proofs: [foreign] })).toEqual({
      ok: false,
      code: "proof_history_invalid",
    });
  });

  it("refuses a decision made against a superseded proof", () => {
    const result = decide({
      proofs: [proof(), replacementProof()],
      // The admin is still looking at the photo the customer already replaced.
      reviewedProofRef: "obj_zelle_receipt_a1",
      now: REDECIDED,
    });
    expect(result).toEqual({ ok: false, code: "proof_ref_mismatch" });
  });

  it("accepts a decision against the current proof and records exactly what was reviewed", () => {
    const result = decide({
      proofs: [proof(), replacementProof()],
      reviewedProofRef: "obj_zelle_receipt_b2",
      now: REDECIDED,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry.reviewedProofId).toBe("prf_0002");
    expect(result.value.entry.reviewedProofRef).toBe("obj_zelle_receipt_b2");
  });
});

describe("the amount verified must equal the order's own total", () => {
  it("refuses an amount above, below, or beside the payable total", () => {
    // Short of the amount owed. Money is still owed, so there is no approval.
    for (const amountVerifiedCents of [ORDER_TOTAL_CENTS - 1, 1, 12_450]) {
      expect(decide({ amountVerifiedCents })).toEqual({
        ok: false,
        code: "payment_underpaid",
      });
    }
    // Over the amount owed. Nobody has recorded what to do with the excess yet.
    expect(decide({ amountVerifiedCents: ORDER_TOTAL_CENTS + 1 })).toEqual({
      ok: false,
      code: "payment_overpaid",
    });
    // Not an amount at all.
    for (const amountVerifiedCents of [0, -ORDER_TOTAL_CENTS, "24900", null, undefined]) {
      const result = decide({ amountVerifiedCents });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("amount_mismatch");
    }
  });

  it("refuses a currency the order was not billed in", () => {
    for (const currency of ["EUR", "usd", "", null]) {
      const result = decide({ currency });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("currency_mismatch");
    }
  });

  it("records the payable total the order states, not a number an admin invented", () => {
    const result = decide();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.entry.amountVerifiedCents).toBe(ORDER_TOTAL_CENTS);
    expect(result.value.entry.payableTotalCents).toBe(ORDER_TOTAL_CENTS);
    expect(result.value.entry.classification).toBe("EXACT_MATCH");
    expect(result.value.entry.exceptionId).toBeNull();
    expect(result.value.entry.currency).toBe("USD");
    expect(result.value.verification.receiptIntent?.payableTotalCents).toBe(ORDER_TOTAL_CENTS);
    expect(result.value.verification.receiptIntent?.verifiedAmountCents).toBe(ORDER_TOTAL_CENTS);
  });
});

describe("an order cannot be verified twice", () => {
  it("applies the first approval and nothing after it", () => {
    const first = decide();
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.outcome).toBe("applied");
    expect(first.value.verification.commit.firstApplication).toBe(true);
    expect(first.value.append).not.toBeNull();

    const applied = entryFrom(first);
    const replay = decide({ decisions: [applied] });
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.value.outcome).toBe("replayed");
    expect(replay.value.verification.commit.firstApplication).toBe(false);
    // Nothing new to write, so the effect is reported exactly once.
    expect(replay.value.append).toBeNull();
    expect(replay.value.entry).toEqual(applied);
  });

  it("treats a second approval under a fresh key as a no-op, never a second advance", () => {
    const applied = entryFrom(decide());
    const second = decide({
      decisions: [applied],
      idempotencyKey: KEY_TWO,
      actor: { id: "usr_other_admin", role: "operations_admin" },
      now: REDECIDED,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.outcome).toBe("noop");
    expect(second.value.append).toBeNull();
    expect(second.value.verification.commit.firstApplication).toBe(false);
    // The original decision still owns the record, including who made it.
    expect(second.value.entry.actorId).toBe(ADMIN.id);
  });

  it("refuses a reject that would undo a recorded approval", () => {
    const applied = entryFrom(decide());
    expect(
      decide({ decisions: [applied], decision: "reject", idempotencyKey: KEY_TWO, now: REDECIDED }),
    ).toEqual({ ok: false, code: "order_already_verified" });
  });

  it("refuses a reused key that carries a different decision, actor, or method", () => {
    const applied = entryFrom(decide());
    for (const overrides of [
      { decision: "reject" },
      { actor: { id: "usr_other_admin", role: "operations_admin" } },
      { method: "venmo" },
    ]) {
      const result = decide({ decisions: [applied], ...overrides });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("idempotency_conflict");
    }
  });

  it("keeps an approval in scope even after a newer proof arrives", () => {
    const applied = entryFrom(decide());
    const result = decide({
      decisions: [applied],
      proofs: [proof(), replacementProof()],
      reviewedProofRef: "obj_zelle_receipt_b2",
      idempotencyKey: KEY_TWO,
      now: REDECIDED,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // A new photo does not reopen money that a human already confirmed arrived.
    expect(result.value.outcome).toBe("noop");
    expect(result.value.append).toBeNull();
  });

  it("produces one receipt intent and one supplier release intent per order", () => {
    const first = decide();
    const applied = entryFrom(first);
    const replay = decide({ decisions: [applied] });
    expect(first.ok && replay.ok).toBe(true);
    if (!first.ok || !replay.ok) return;
    expect(replay.value.verification.receiptIntent).toEqual(first.value.verification.receiptIntent);
    expect(replay.value.verification.supplierReleaseIntent).toEqual(
      first.value.verification.supplierReleaseIntent,
    );
    expect(first.value.verification.receiptIntent?.performed).toBe(false);
    expect(first.value.verification.supplierReleaseIntent?.performed).toBe(false);
  });
});

describe("a rejected payment is not silently re-verified", () => {
  it("refuses an approval while the rejected proof is still the one on file", () => {
    const rejected = entryFrom(rejection());
    expect(rejected.decision).toBe("reject");
    expect(
      decide({ decisions: [rejected], idempotencyKey: KEY_TWO, now: REDECIDED }),
    ).toEqual({ ok: false, code: "payment_rejected_needs_new_proof" });
  });

  it("treats a repeated rejection as a no-op rather than a second decision", () => {
    const rejected = entryFrom(rejection());
    const again = rejection({ decisions: [rejected], idempotencyKey: KEY_TWO, now: REDECIDED });
    expect(again.ok).toBe(true);
    if (!again.ok) return;
    expect(again.value.outcome).toBe("noop");
    expect(again.value.append).toBeNull();
  });

  it("reopens only when a new proof is on file, and then records both decisions", () => {
    const rejected = entryFrom(rejection());
    const result = decide({
      decisions: [rejected],
      proofs: [proof(), replacementProof()],
      reviewedProofRef: "obj_zelle_receipt_b2",
      idempotencyKey: KEY_TWO,
      now: REDECIDED,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toBe("applied");
    expect(result.value.decision).toBe("approve");
    expect(result.value.append?.sequence).toBe(2);
    // The rejection is still readable, so the trail shows what the admin changed.
    expect(rejected.sequence).toBe(1);
    expect(rejected.reviewedProofId).toBe("prf_0001");
    expect(result.value.append?.reviewedProofId).toBe("prf_0002");
  });
});

describe("only an authorized named human decides, and always with a reason", () => {
  it("refuses an unauthorized role before it reads the order or the proofs", () => {
    for (const role of ["support", "affiliate", "member", "admin", "", null]) {
      const result = decide({ actor: { id: "usr_support", role }, proofs: [], order: null });
      expect(result.ok).toBe(false);
      // The refusal is `forbidden`, not `proof_missing`, so an unauthorized caller
      // learns nothing about the order's payment state.
      if (!result.ok) expect(result.code).toBe("forbidden");
    }
  });

  it("refuses a malformed actor", () => {
    for (const actor of [null, {}, { id: "x", role: "founder_admin" }, { id: "usr_a" }]) {
      const result = decide({ actor });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("actor_invalid");
    }
  });

  it("refuses a decision with no stated reason, or with control text in it", () => {
    for (const reason of ["", "  ", "short", "ok", " padded reason ", 42, null]) {
      const result = decide({ reason });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("reason_insufficient");
    }
    expect(decide({ reason: `bad\u0000reason here` })).toEqual({
      ok: false,
      code: "reason_insufficient",
    });
  });

  it("records the actor, the time, the reason, the order, and the proof reference", () => {
    const result = decide();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.entry).sort()).toEqual(
      [...EARLY_ACCESS_VERIFICATION_ENTRY_KEYS].sort(),
    );
    expect(result.value.entry.actorId).toBe(ADMIN.id);
    expect(result.value.entry.actorRole).toBe("founder_admin");
    expect(result.value.entry.decidedAt).toBe(DECIDED);
    expect(result.value.entry.orderId).toBe("ord_ea_0001");
    expect(result.value.entry.reviewedProofRef).toBe("obj_zelle_receipt_a1");
    expect(Object.isFrozen(result.value.entry)).toBe(true);
  });

  it("refuses hostile shapes and a decision stamped before the order existed", () => {
    expect(decide({ note: "x" })).toEqual({ ok: false, code: "input_invalid" });
    expect(decideManualPayment(new Proxy({}, {}))).toEqual({ ok: false, code: "input_invalid" });
    expect(decide({ decision: "maybe" })).toEqual({ ok: false, code: "decision_invalid" });
    expect(decide({ now: "2026-08-04T13:00:00Z" })).toEqual({
      ok: false,
      code: "timestamp_invalid",
    });
    expect(decide({ now: "2026-08-04T11:00:00.000Z" })).toEqual({
      ok: false,
      code: "timestamp_invalid",
    });
    expect(decide({ idempotencyKey: "short" })).toEqual({
      ok: false,
      code: "idempotency_key_invalid",
    });
    expect(decide({ decisions: "not-an-array" })).toEqual({
      ok: false,
      code: "decision_history_invalid",
    });
  });
});

describe("the verification trail is append only", () => {
  it("refuses a stored entry that has been edited", () => {
    const entry = entryFrom(decide());
    expect(readEarlyAccessVerificationEntry(entry)).toEqual(entry);
    // The row reader has no order to compare against, so it enforces the shape of the
    // amount. Whether it equals the order total is decided where the order is in hand.
    for (const broken of [
      { ...entry, amountVerifiedCents: 0 },
      { ...entry, amountVerifiedCents: 24_900.5 },
      { ...entry, currency: "EUR" },
      { ...entry, reason: "no" },
      { ...entry, actorRole: "support" },
      { ...entry, reviewedProofRef: "obj/zelle" },
      { ...entry, sequence: 0 },
    ]) {
      expect(readEarlyAccessVerificationEntry(broken)).toBeNull();
    }
  });

  it("refuses a trail with a gap, a reused key, or two orders in it", () => {
    const entry = entryFrom(decide());
    expect(readEarlyAccessVerificationHistory([entry])).toHaveLength(1);
    expect(readEarlyAccessVerificationHistory([{ ...entry, sequence: 2 }])).toBeNull();
    expect(readEarlyAccessVerificationHistory([entry, { ...entry, sequence: 2 }])).toBeNull();
    expect(
      readEarlyAccessVerificationHistory([
        entry,
        { ...entry, sequence: 2, idempotencyKey: KEY_TWO, orderId: "ord_ea_0002" },
      ]),
    ).toBeNull();
  });

  it("offers a store with no update, no delete, and no second approval", async () => {
    const repository = new InMemoryVerificationRepository();
    const entry = entryFrom(decide());
    expect((await repository.append(entry)).ok).toBe(true);
    expect(await repository.append(entry)).toEqual({ ok: false, code: "idempotency_conflict" });
    expect(
      await repository.append({ ...entry, idempotencyKey: KEY_TWO, sequence: 2 }),
    ).toEqual({ ok: false, code: "order_already_verified" });

    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).filter(
      (name) => name !== "constructor",
    );
    expect(surface.sort()).toEqual(["append", "approval", "history"]);
    expect((await repository.approval("ord_ea_0001"))?.idempotencyKey).toBe(KEY_ONE);
    expect(await repository.approval("ord_ea_0002")).toBeNull();
  });

  it("lets a rejection be followed by an approval, keeping both rows", async () => {
    const repository = new InMemoryVerificationRepository();
    const rejected = entryFrom(rejection());
    expect((await repository.append(rejected)).ok).toBe(true);
    const approved = entryFrom(
      decide({
        decisions: [rejected],
        proofs: [proof(), replacementProof()],
        reviewedProofRef: "obj_zelle_receipt_b2",
        idempotencyKey: KEY_TWO,
        now: REDECIDED,
      }),
    );
    expect((await repository.append(approved)).ok).toBe(true);
    const history = await repository.history("ord_ea_0001");
    expect(history.map((row) => row.decision)).toEqual(["reject", "approve"]);
    expect((await repository.approval("ord_ea_0001"))?.idempotencyKey).toBe(KEY_TWO);
  });
});

describe("the verification service over its repositories", () => {
  async function stand() {
    const proofs = new InMemoryProofRepository();
    const verifications = new InMemoryVerificationRepository();
    const attached = await attachPaymentProof(proofs, {
      order: order({ status: "awaiting_payment" }),
      proofId: "prf_0001",
      storageRef: "obj_zelle_receipt_a1",
      filename: "zelle-receipt.png",
      contentType: "image/png",
      byteSize: 240_512,
      method: "zelle",
      uploadedBy: "cus_samuel",
      uploadedAt: UPLOADED,
      supersedesProofId: null,
    });
    expect(attached.ok).toBe(true);
    return { proofs, verifications, deps: { proofs, verifications } };
  }

  const request = Object.freeze({
    order: order(),
    actor: { ...ADMIN },
    decision: "approve",
    reason: "Zelle receipt matches the order total.",
    reviewedProofRef: "obj_zelle_receipt_a1",
    amountVerifiedCents: ORDER_TOTAL_CENTS,
    currency: "USD",
    idempotencyKey: KEY_ONE,
    now: DECIDED,
    method: "zelle",
  });

  it("writes exactly one row for one payment, however many times it is called", async () => {
    const { verifications, deps } = await stand();
    const first = await recordManualPaymentDecision(deps, request);
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value.outcome).toBe("applied");

    const replay = await recordManualPaymentDecision(deps, request);
    expect(replay.ok).toBe(true);
    if (replay.ok) expect(replay.value.outcome).toBe("replayed");

    const again = await recordManualPaymentDecision(deps, {
      ...request,
      idempotencyKey: KEY_TWO,
      now: REDECIDED,
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.outcome).toBe("noop");

    expect(await verifications.history("ord_ea_0001")).toHaveLength(1);
  });

  it("refuses to decide an order that has no proof in the repository", async () => {
    const { deps } = await stand();
    const result = await recordManualPaymentDecision(deps, {
      ...request,
      order: order({ orderId: "ord_ea_0002" }),
    });
    expect(result).toEqual({ ok: false, code: "proof_missing" });
  });

  it("hands the verified order projection downstream only on an approval", async () => {
    const { deps } = await stand();
    const approved = await recordManualPaymentDecision(deps, request);
    expect(approved.ok).toBe(true);
    if (!approved.ok) return;
    expect(approved.value.verification.verifiedOrder?.status).toBe("payment_verified");
    expect(approved.value.verification.verifiedOrder?.orderTotalCents).toBe(ORDER_TOTAL_CENTS);

    const { deps: other } = await stand();
    const rejected = await recordManualPaymentDecision(other, {
      ...request,
      decision: "reject",
      reason: "The screenshot shows a different amount.",
    });
    expect(rejected.ok).toBe(true);
    if (!rejected.ok) return;
    expect(rejected.value.verification.verifiedOrder).toBeNull();
    expect(rejected.value.verification.receiptIntent).toBeNull();
    expect(rejected.value.verification.supplierReleaseIntent).toBeNull();
  });
});
