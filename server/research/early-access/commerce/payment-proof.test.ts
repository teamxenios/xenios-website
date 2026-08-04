import { describe, expect, it } from "vitest";
import { EARLY_ACCESS_PAYMENT_OPTION_CODES } from "@shared/research/early-access-payment-options";
import { createEarlyAccessOrder, type EarlyAccessOrder } from "./early-access-order";
import * as proofModule from "./payment-proof";
import {
  EARLY_ACCESS_PROOF_CONTENT_TYPES,
  EARLY_ACCESS_PROOF_KEY_PREFIX,
  EARLY_ACCESS_PROOF_MAX_BYTES,
  PROOF_BYTE_BEARING_KEYS,
  describeProofSubmission,
} from "./payment-proof";

const NOW = "2026-08-04T12:00:00.000Z";
const LATER = "2026-08-04T12:30:00.000Z";

/**
 * One filename per allowed content type, with a deliberately matching
 * extension. Every test that enumerates the allowlist reads this map, so
 * widening the allowlist fails loudly here once instead of silently producing
 * an undefined filename in several places.
 */
const MATCHING_FILENAME: Record<(typeof EARLY_ACCESS_PROOF_CONTENT_TYPES)[number], string> = {
  "image/png": "proof.png",
  "image/jpeg": "proof.JPEG",
  "image/webp": "proof.webp",
  "application/pdf": "bank-statement.pdf",
};

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
    now: NOW,
  });
  if (!result.ok) throw new Error(`fixture order refused: ${result.code}`);
  return Object.freeze({ ...result.value, ...overrides }) as EarlyAccessOrder;
}

function submit(overrides: Record<string, unknown> = {}) {
  return describeProofSubmission({
    order: order(),
    proofId: "prf_0001",
    filename: "zelle-receipt.png",
    contentType: "image/png",
    byteSize: 240_512,
    submittedAt: LATER,
    method: "zelle",
    ...overrides,
  });
}

describe("payment proof metadata", () => {
  it("accepts a well formed submission and records only metadata", () => {
    const result = submit();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.proofId).toBe("prf_0001");
    expect(result.value.orderId).toBe("ord_ea_0001");
    expect(result.value.byteSize).toBe(240_512);
    expect(result.value.storageIntent.objectKey).toBe(
      `${EARLY_ACCESS_PROOF_KEY_PREFIX}ord_ea_0001/prf_0001`,
    );
    expect(result.value.storageIntent.bytesReceived).toBe(false);
    expect(result.value.storageIntent.performed).toBe(false);
  });

  it("accepts every allowed content type with a matching extension", () => {
    for (const contentType of EARLY_ACCESS_PROOF_CONTENT_TYPES) {
      const result = submit({
        contentType,
        filename: MATCHING_FILENAME[contentType],
      });
      expect(result.ok).toBe(true);
    }
  });

  it("refuses a content type outside the allowlist", () => {
    for (const contentType of [
      "image/svg+xml",
      "image/gif",
      "text/html",
      "application/octet-stream",
      "image/png; charset=utf-8",
      "",
      null,
    ]) {
      const result = submit({ contentType, filename: "proof.png" });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("content_type_unsupported");
    }
  });

  it("refuses a filename that traverses, separates, or disagrees with the content type", () => {
    for (const filename of [
      "../../etc/passwd.png",
      "dir/proof.png",
      "dir\\proof.png",
      "proof.svg",
      "proof.png.exe",
      "proof",
      "",
      " proof.png",
      `${"a".repeat(201)}.png`,
      42,
    ]) {
      const result = submit({ filename });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("filename_invalid");
    }
  });

  it("refuses a byte size outside one byte through ten megabytes", () => {
    for (const byteSize of [0, -1, 1.5, "100", null, EARLY_ACCESS_PROOF_MAX_BYTES + 1]) {
      const result = submit({ byteSize });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("byte_size_invalid");
    }
    expect(submit({ byteSize: EARLY_ACCESS_PROOF_MAX_BYTES }).ok).toBe(true);
  });

  it("refuses a proof that predates the order or carries a non canonical timestamp", () => {
    expect(submit({ submittedAt: "2026-08-04T11:59:59.999Z" })).toEqual({
      ok: false,
      code: "submitted_at_invalid",
    });
    expect(submit({ submittedAt: "2026-08-04T12:30:00Z" })).toEqual({
      ok: false,
      code: "submitted_at_invalid",
    });
  });

  it("accepts only the canonical payment method vocabulary", () => {
    for (const method of EARLY_ACCESS_PAYMENT_OPTION_CODES) {
      const result = submit({ method });
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value.method).toBe(method);
    }
    for (const method of ["bitcoin", "wire", "ZELLE", "", null]) {
      const result = submit({ method });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.code).toBe("method_unsupported");
    }
  });
});

describe("payment proof never stores bytes", () => {
  it("refuses any request that carries the object or a pointer to it", () => {
    for (const key of PROOF_BYTE_BEARING_KEYS) {
      const result = describeProofSubmission({
        order: order(),
        proofId: "prf_0001",
        filename: "zelle-receipt.png",
        contentType: "image/png",
        byteSize: 240_512,
        submittedAt: LATER,
        method: "zelle",
        [key]: "anything",
      });
      expect(result).toEqual({ ok: false, code: "proof_bytes_supplied" });
    }
  });

  it("describes an intent that has not been performed", () => {
    const result = submit();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.storageIntent.action).toBe("store_private_proof_object");
    expect(result.value.storageIntent.objectKey.startsWith(EARLY_ACCESS_PROOF_KEY_PREFIX)).toBe(true);
    expect(Object.isFrozen(result.value.storageIntent)).toBe(true);
  });
});

describe("payment proof cannot mark a payment received", () => {
  it("moves the order to payment_under_review and nothing else", () => {
    for (const status of ["awaiting_payment", "payment_under_review"] as const) {
      for (const contentType of EARLY_ACCESS_PROOF_CONTENT_TYPES) {
        for (const method of EARLY_ACCESS_PAYMENT_OPTION_CODES) {
          const result = describeProofSubmission({
            order: order({ status }),
            proofId: "prf_0001",
            filename: MATCHING_FILENAME[contentType],
            contentType,
            byteSize: 1_024,
            submittedAt: LATER,
            method,
          });
          expect(result.ok).toBe(true);
          if (!result.ok) continue;
          expect(result.value.transition.from).toBe(status);
          expect(result.value.transition.to).toBe("payment_under_review");
          expect(result.value.orderStatus).toBe("payment_under_review");
          expect(result.value.paid).toBe(false);
          expect(result.value.verified).toBe(false);
        }
      }
    }
  });

  it("refuses to touch an order whose payment was already decided", () => {
    for (const status of ["payment_verified", "payment_rejected"]) {
      const result = submit({ order: order({ status }) });
      expect(result).toEqual({ ok: false, code: "order_not_awaiting_payment" });
    }
  });

  it("exports no function that could verify, approve, or settle a payment", () => {
    const exported = Object.keys(proofModule).filter(
      (name) => typeof (proofModule as unknown as Record<string, unknown>)[name] === "function",
    );
    expect(exported.sort()).toEqual(["describeProofSubmission", "earlyAccessProofObjectKey"]);
    const serialized = JSON.stringify(submit());
    expect(serialized).not.toContain("payment_verified");
    expect(serialized).not.toContain("\"paid\":true");
  });
});

describe("payment proof hostile input", () => {
  it("refuses an extra key, a missing key, a Proxy, and an invalid order", () => {
    expect(submit({ note: "x" })).toEqual({ ok: false, code: "input_invalid" });
    expect(describeProofSubmission({ order: order() })).toEqual({ ok: false, code: "input_invalid" });
    expect(describeProofSubmission(new Proxy({}, {}))).toEqual({ ok: false, code: "input_invalid" });
    expect(submit({ order: null })).toEqual({ ok: false, code: "order_invalid" });
    expect(submit({ order: { ...order(), orderTotalCents: 1 } })).toEqual({
      ok: false,
      code: "order_invalid",
    });
    expect(submit({ proofId: "no" })).toEqual({ ok: false, code: "proof_id_invalid" });
  });

  it("freezes the submission", () => {
    const result = submit();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(() => {
      (result.value as unknown as Record<string, unknown>).paid = true;
    }).toThrow();
  });
});

describe("proof format allowlist agrees with the upload route", () => {
  it("accepts a webp screenshot, the common phone bank-transfer proof", () => {
    const result = submit({ filename: "transfer.webp", contentType: "image/webp" });
    expect(result.ok).toBe(true);
  });

  it("still refuses a filename whose extension contradicts the declared type", () => {
    expect(submit({ filename: "transfer.webp", contentType: "image/png" }).ok).toBe(false);
    expect(submit({ filename: "transfer.png", contentType: "image/webp" }).ok).toBe(false);
  });

  it("pins the domain allowlist to the upload route's, in both directions", async () => {
    // The bug this pins: the route accepted webp while the domain did not, so a
    // valid proof passed the door and was refused one layer deeper. Whichever
    // list is widened next, the other must be widened with it.
    const { EARLY_ACCESS_PROOF_UPLOAD_TYPES } = await import(
      "../routes/order-routes"
    );
    expect([...EARLY_ACCESS_PROOF_CONTENT_TYPES].sort()).toEqual(
      Object.keys(EARLY_ACCESS_PROOF_UPLOAD_TYPES).sort(),
    );
    for (const contentType of EARLY_ACCESS_PROOF_CONTENT_TYPES) {
      const routeExtensions = [...EARLY_ACCESS_PROOF_UPLOAD_TYPES[contentType]].sort();
      const accepted = routeExtensions.filter(
        (extension: string) =>
          submit({ filename: `proof${extension}`, contentType }).ok,
      );
      expect(accepted).toEqual(routeExtensions);
    }
  });
});
