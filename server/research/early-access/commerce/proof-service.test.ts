import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import { EARLY_ACCESS_PROOF_KEY_PREFIX, PROOF_BYTE_BEARING_KEYS } from "./payment-proof";
import {
  EARLY_ACCESS_MAX_PROOFS_PER_ORDER,
  EARLY_ACCESS_PROOF_RECORD_KEYS,
  InMemoryProofRepository,
  attachPaymentProof,
  currentProof,
  describeProofAttachment,
  isOpaqueStorageRef,
  isProofUploader,
  isStorableFilename,
  readEarlyAccessProofHistory,
  readEarlyAccessProofRecord,
  type EarlyAccessProofRecord,
} from "./proof-service";

const CREATED = "2026-08-04T12:00:00.000Z";
const FIRST = "2026-08-04T12:30:00.000Z";
const SECOND = "2026-08-04T13:00:00.000Z";

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
    now: CREATED,
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return Object.freeze({ ...result.value, ...overrides }) as EarlyAccessOrder;
}

function attach(overrides: Record<string, unknown> = {}) {
  return describeProofAttachment({
    order: order(),
    proofs: [],
    proofId: "prf_0001",
    storageRef: "obj_zelle_receipt_a1",
    filename: "zelle-receipt.png",
    contentType: "image/png",
    byteSize: 240_512,
    method: "zelle",
    uploadedBy: "cus_samuel",
    uploadedAt: FIRST,
    supersedesProofId: null,
    ...overrides,
  });
}

function firstRecord(): EarlyAccessProofRecord {
  const result = attach();
  if (!result.ok) throw new Error(`fixture proof refused: ${result.code}`);
  return result.value.record;
}

/** The replacement a customer sends when the first photo was unreadable. */
function replacement(overrides: Record<string, unknown> = {}) {
  return describeProofAttachment({
    order: order({ status: "payment_under_review" }),
    proofs: [firstRecord()],
    proofId: "prf_0002",
    storageRef: "obj_zelle_receipt_b2",
    filename: "zelle-receipt-clear.png",
    contentType: "image/png",
    byteSize: 310_000,
    method: "zelle",
    uploadedBy: "cus_samuel",
    uploadedAt: SECOND,
    supersedesProofId: "prf_0001",
    ...overrides,
  });
}

describe("proof attachment records metadata and nothing else", () => {
  it("accepts a first proof and derives the object key from validated ids", () => {
    const result = attach();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.proofId).toBe("prf_0001");
    expect(result.value.record.orderId).toBe("ord_ea_0001");
    expect(result.value.record.sequence).toBe(1);
    expect(result.value.record.supersedesProofId).toBeNull();
    expect(result.value.supersededProofId).toBeNull();
    // The caller's opaque reference never steers where bytes land.
    expect(result.value.record.objectKey).toBe(
      `${EARLY_ACCESS_PROOF_KEY_PREFIX}ord_ea_0001/prf_0001`,
    );
    expect(result.value.record.storageRef).toBe("obj_zelle_receipt_a1");
  });

  it("carries no field that could hold bytes and no field that could settle payment", () => {
    const result = attach();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value.record).sort()).toEqual(
      [...EARLY_ACCESS_PROOF_RECORD_KEYS].sort(),
    );
    for (const key of PROOF_BYTE_BEARING_KEYS) {
      expect(Object.keys(result.value.record)).not.toContain(key);
    }
    expect(result.value.paid).toBe(false);
    expect(result.value.verified).toBe(false);
    expect(result.value.orderStatus).toBe("payment_under_review");
    expect(JSON.stringify(result.value)).not.toContain("payment_verified");
  });

  it("refuses any request that carries the object or a pointer to it", () => {
    for (const key of PROOF_BYTE_BEARING_KEYS) {
      const result = describeProofAttachment({
        order: order(),
        proofs: [],
        proofId: "prf_0001",
        storageRef: "obj_zelle_receipt_a1",
        filename: "zelle-receipt.png",
        contentType: "image/png",
        byteSize: 240_512,
        method: "zelle",
        uploadedBy: "cus_samuel",
        uploadedAt: FIRST,
        supersedesProofId: null,
        [key]: "anything",
      });
      expect(result).toEqual({ ok: false, code: "proof_bytes_supplied" });
    }
  });

  it("surfaces the refusals payment-proof.ts already owns rather than restating them", () => {
    expect(attach({ filename: "../../etc/passwd.png" })).toEqual({
      ok: false,
      code: "filename_invalid",
    });
    expect(attach({ contentType: "image/svg+xml" })).toEqual({
      ok: false,
      code: "content_type_unsupported",
    });
    expect(attach({ byteSize: 0 })).toEqual({ ok: false, code: "byte_size_invalid" });
    expect(attach({ method: "bitcoin" })).toEqual({ ok: false, code: "method_unsupported" });
    expect(attach({ order: order({ status: "payment_verified" }) })).toEqual({
      ok: false,
      code: "order_not_awaiting_payment",
    });
    expect(attach({ uploadedAt: "2026-08-04T11:00:00.000Z" })).toEqual({
      ok: false,
      code: "submitted_at_invalid",
    });
  });
});

describe("proof attachment treats every stored string as hostile", () => {
  it("refuses a storage reference that is a path, a traversal, or control text", () => {
    for (const storageRef of [
      "obj/zelle/receipt",
      "obj\\zelle\\receipt",
      "../../secrets",
      "obj..receipt",
      "obj\u0000receipt",
      "obj\u0007receipt",
      "obj\u2028receipt",
      "/absolute/path",
      "https://example.test/proof.png",
      " obj_leading_space",
      "",
      "ab",
      42,
      null,
    ]) {
      const result = attach({ storageRef });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("storage_ref_invalid");
    }
  });

  it("refuses an uploader that is a path, a traversal, or control text", () => {
    for (const uploadedBy of [
      "cus/samuel",
      "cus\\samuel",
      "cus\u0000samuel",
      "cus\u0007samuel",
      "cus\u009fsamuel",
      "\nsamuel",
      " samuel",
      "",
      "ab",
      `${"a".repeat(129)}`,
      42,
      null,
    ]) {
      const result = attach({ uploadedBy });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("uploader_invalid");
    }
  });

  it("refuses a filename carrying a separator, a traversal, or a null byte", () => {
    for (const filename of [
      "dir/proof.png",
      "dir\\proof.png",
      "../proof.png",
      "proof\u0000.png",
      "proof\u0007.png",
    ]) {
      const result = attach({ filename });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("filename_invalid");
    }
  });

  it("exposes the three string guards and they agree with the refusals", () => {
    expect(isOpaqueStorageRef("obj_zelle_receipt_a1")).toBe(true);
    expect(isOpaqueStorageRef("obj/zelle")).toBe(false);
    expect(isOpaqueStorageRef("obj..zelle")).toBe(false);
    expect(isOpaqueStorageRef("obj\u0000zelle")).toBe(false);

    expect(isProofUploader("Samuel Boadu")).toBe(true);
    expect(isProofUploader("ops@xenios.test")).toBe(true);
    expect(isProofUploader("ops/admin")).toBe(false);
    expect(isProofUploader("ops\u0000admin")).toBe(false);

    expect(isStorableFilename("zelle-receipt.png")).toBe(true);
    expect(isStorableFilename("dir/zelle.png")).toBe(false);
    expect(isStorableFilename("..\\zelle.png")).toBe(false);
    expect(isStorableFilename("zelle\u0000.png")).toBe(false);
  });

  it("refuses a stored record whose object key points somewhere else", () => {
    const record = firstRecord();
    expect(readEarlyAccessProofRecord(record)).not.toBeNull();
    expect(
      readEarlyAccessProofRecord({
        ...record,
        objectKey: `${EARLY_ACCESS_PROOF_KEY_PREFIX}ord_other/prf_0001`,
      }),
    ).toBeNull();
    expect(readEarlyAccessProofRecord({ ...record, filename: "dir/proof.png" })).toBeNull();
    expect(readEarlyAccessProofRecord({ ...record, storageRef: "obj/zelle" })).toBeNull();
    expect(readEarlyAccessProofRecord({ ...record, uploadedBy: "cus\u0000samuel" })).toBeNull();
  });

  it("refuses hostile shapes outright", () => {
    expect(attach({ note: "x" })).toEqual({ ok: false, code: "input_invalid" });
    expect(describeProofAttachment(new Proxy({}, {}))).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect(attach({ order: null })).toEqual({ ok: false, code: "order_invalid" });
    expect(attach({ proofs: "not-an-array" })).toEqual({
      ok: false,
      code: "proof_history_invalid",
    });
  });
});

describe("proof history is append only", () => {
  it("records a replacement as a new entry and leaves the original untouched", () => {
    const original = firstRecord();
    const result = replacement();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.record.sequence).toBe(2);
    expect(result.value.record.supersedesProofId).toBe("prf_0001");
    expect(result.value.supersededProofId).toBe("prf_0001");
    // The original record is a different object and is unchanged by the replacement.
    expect(original.proofId).toBe("prf_0001");
    expect(original.storageRef).toBe("obj_zelle_receipt_a1");
    expect(Object.isFrozen(original)).toBe(true);
    expect(currentProof([original, result.value.record])?.proofId).toBe("prf_0002");
  });

  it("requires a replacement to name the proof it supersedes, and only the current one", () => {
    expect(replacement({ supersedesProofId: null })).toEqual({
      ok: false,
      code: "supersede_required",
    });
    expect(replacement({ supersedesProofId: "prf_9999" })).toEqual({
      ok: false,
      code: "supersede_target_stale",
    });
    expect(attach({ supersedesProofId: "prf_0000" })).toEqual({
      ok: false,
      code: "supersede_not_permitted",
    });
  });

  it("refuses a replacement that predates the proof it replaces", () => {
    expect(replacement({ uploadedAt: "2026-08-04T12:29:59.999Z" })).toEqual({
      ok: false,
      code: "uploaded_at_before_prior",
    });
    const original = firstRecord();
    const backdated = describeProofAttachment({
      order: order({ status: "payment_under_review" }),
      proofs: [{ ...original, uploadedAt: SECOND }],
      proofId: "prf_0002",
      storageRef: "obj_zelle_receipt_b2",
      filename: "later.png",
      contentType: "image/png",
      byteSize: 1_024,
      method: "zelle",
      uploadedBy: "cus_samuel",
      uploadedAt: FIRST,
      supersedesProofId: "prf_0001",
    });
    expect(backdated).toEqual({ ok: false, code: "uploaded_at_before_prior" });
  });

  it("refuses a repeated proof id and a repeated storage reference", () => {
    expect(replacement({ proofId: "prf_0001" })).toEqual({
      ok: false,
      code: "proof_id_duplicate",
    });
    expect(replacement({ storageRef: "obj_zelle_receipt_a1" })).toEqual({
      ok: false,
      code: "storage_ref_invalid",
    });
  });

  it("refuses a history that does not hold together as a chain", () => {
    const original = firstRecord();
    for (const proofs of [
      [{ ...original, sequence: 2 }],
      [{ ...original, supersedesProofId: "prf_0000" }],
      [original, { ...original, sequence: 2, supersedesProofId: "prf_0001" }],
    ]) {
      expect(readEarlyAccessProofHistory(proofs)).toBeNull();
    }
    expect(readEarlyAccessProofHistory([original])).toHaveLength(1);
  });

  it("refuses an unbounded chain", async () => {
    const repository = new InMemoryProofRepository();
    let previous: string | null = null;
    for (let index = 1; index <= EARLY_ACCESS_MAX_PROOFS_PER_ORDER; index += 1) {
      const result = await attachPaymentProof(repository, {
        order: order({ status: index === 1 ? "awaiting_payment" : "payment_under_review" }),
        proofId: `prf_${String(index).padStart(4, "0")}`,
        storageRef: `obj_receipt_${index}`,
        filename: "proof.png",
        contentType: "image/png",
        byteSize: 1_024,
        method: "zelle",
        uploadedBy: "cus_samuel",
        uploadedAt: FIRST,
        supersedesProofId: previous,
      });
      expect(result.ok).toBe(true);
      previous = `prf_${String(index).padStart(4, "0")}`;
    }
    const overflow = await attachPaymentProof(repository, {
      order: order({ status: "payment_under_review" }),
      proofId: "prf_0009",
      storageRef: "obj_receipt_9",
      filename: "proof.png",
      contentType: "image/png",
      byteSize: 1_024,
      method: "zelle",
      uploadedBy: "cus_samuel",
      uploadedAt: FIRST,
      supersedesProofId: previous,
    });
    expect(overflow).toEqual({ ok: false, code: "proof_limit_reached" });
  });
});

describe("the proof repository", () => {
  it("stores a chain, exposes the current proof, and offers no way to edit it", async () => {
    const repository = new InMemoryProofRepository();
    const first = await attachPaymentProof(repository, {
      order: order(),
      proofId: "prf_0001",
      storageRef: "obj_zelle_receipt_a1",
      filename: "zelle-receipt.png",
      contentType: "image/png",
      byteSize: 240_512,
      method: "zelle",
      uploadedBy: "cus_samuel",
      uploadedAt: FIRST,
      supersedesProofId: null,
    });
    expect(first.ok).toBe(true);

    const second = await attachPaymentProof(repository, {
      order: order({ status: "payment_under_review" }),
      proofId: "prf_0002",
      storageRef: "obj_zelle_receipt_b2",
      filename: "clearer.png",
      contentType: "image/png",
      byteSize: 310_000,
      method: "zelle",
      uploadedBy: "cus_samuel",
      uploadedAt: SECOND,
      supersedesProofId: "prf_0001",
    });
    expect(second.ok).toBe(true);

    const history = await repository.history("ord_ea_0001");
    expect(history.map((entry) => entry.proofId)).toEqual(["prf_0001", "prf_0002"]);
    expect((await repository.current("ord_ea_0001"))?.proofId).toBe("prf_0002");

    const surface = Object.getOwnPropertyNames(Object.getPrototypeOf(repository)).filter(
      (name) => name !== "constructor",
    );
    expect(surface.sort()).toEqual(["append", "current", "history"]);
    expect(Object.isFrozen(history)).toBe(true);
  });

  it("re-validates on the way in and refuses a hand written record", async () => {
    const repository = new InMemoryProofRepository();
    const record = firstRecord();
    expect(await repository.append({ ...record, storageRef: "obj/../escape" })).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect(await repository.append({ ...record, sequence: 2 })).toEqual({
      ok: false,
      code: "input_invalid",
    });
    expect((await repository.append(record)).ok).toBe(true);
    expect(await repository.append(record)).toEqual({ ok: false, code: "proof_id_duplicate" });
    expect(await repository.history("ord_ea_0001")).toHaveLength(1);
  });

  it("refuses a record that would break the chain it is joining", async () => {
    const repository = new InMemoryProofRepository();
    const record = firstRecord();
    expect((await repository.append(record)).ok).toBe(true);
    const orphan = replacement();
    expect(orphan.ok).toBe(true);
    if (!orphan.ok) return;
    expect(
      await repository.append({ ...orphan.value.record, supersedesProofId: "prf_0000" }),
    ).toEqual({ ok: false, code: "proof_chain_broken" });
    expect((await repository.append(orphan.value.record)).ok).toBe(true);
  });

  it("keeps a chain for one order separate from another order", async () => {
    const repository = new InMemoryProofRepository();
    expect((await repository.append(firstRecord())).ok).toBe(true);
    expect(await repository.history("ord_ea_0002")).toHaveLength(0);
    expect(await repository.current("ord_ea_0002")).toBeNull();
  });
});
