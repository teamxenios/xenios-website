import { describe, expect, it } from "vitest";
import { createEarlyAccessOrder } from "./early-access-order";
import {
  supplierReleaseIntentIdFor,
  verifyManualPayment,
  type EarlyAccessVerifiedOrder,
} from "./payment-verification";
import {
  SUPPLIER_RECIPIENT_KEYS,
  SUPPLIER_RELEASE_PACKET_KEYS,
  buildSupplierReleasePacket,
} from "./supplier-release";

const CREATED_AT = "2026-08-04T12:00:00.000Z";
const DECIDED_AT = "2026-08-04T14:00:00.000Z";

const RECIPIENT = Object.freeze({
  recipientName: "Samuel Boadu",
  line1: "1200 Binz Street",
  line2: "Suite 1100",
  city: "Houston",
  region: "TX",
  postalCode: "77004",
  country: "US",
});

const RELEASE = Object.freeze({
  supplierId: "sup_apex",
  supplierSku: "APX-BPC-5MG-VIAL",
  recipient: RECIPIENT,
});

function verifiedOrder(overrides: Record<string, unknown> = {}): EarlyAccessVerifiedOrder {
  const created = createEarlyAccessOrder({
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
  if (!created.ok) throw new Error(`fixture order refused: ${created.code}`);
  const decided = verifyManualPayment({
    order: { ...created.value, status: "payment_under_review" },
    actor: { id: "adm_alex", role: "founder_admin" },
    decision: "approve",
    idempotencyKey: "verify-ord-ea-0001-a",
    now: DECIDED_AT,
    appliedVerifications: [],
    method: "zelle",
  });
  if (!decided.ok || !decided.value.verifiedOrder) {
    throw new Error("fixture verification refused");
  }
  return Object.freeze({
    ...decided.value.verifiedOrder,
    ...overrides,
  }) as EarlyAccessVerifiedOrder;
}

function build(releaseOverrides: Record<string, unknown> = {}, orderOverrides: Record<string, unknown> = {}) {
  return buildSupplierReleasePacket(verifiedOrder(orderOverrides), { ...RELEASE, ...releaseOverrides });
}

describe("supplier release packet", () => {
  it("carries the supplier sku, the quantity, and where the box goes", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.supplierId).toBe("sup_apex");
    expect(result.value.supplierSku).toBe("APX-BPC-5MG-VIAL");
    expect(result.value.quantity).toBe(2);
    expect(result.value.orderReference).toBe("ord_ea_0001");
    expect(result.value.recipient).toEqual(RECIPIENT);
  });

  it("uses the same release id the verification handed out", () => {
    const result = build();
    expect(result.ok && result.value.releaseId).toBe(supplierReleaseIntentIdFor("ord_ea_0001"));
  });

  it("takes the quantity from the verified order, never from the release request", () => {
    const result = buildSupplierReleasePacket(verifiedOrder(), { ...RELEASE, quantity: 99 });
    expect(result).toEqual({ ok: false, code: "release_invalid" });
    expect(build().ok && (build() as { value: { quantity: number } }).value.quantity).toBe(2);
  });

  it("exposes exactly the reviewed key set and nothing else", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.value).sort()).toEqual([...SUPPLIER_RELEASE_PACKET_KEYS].sort());
    expect(Object.keys(result.value.recipient).sort()).toEqual([...SUPPLIER_RECIPIENT_KEYS].sort());
  });
});

describe("supplier release minimum necessary", () => {
  it("excludes payment, proof, price, member identity, and affiliate data", () => {
    const source = verifiedOrder();
    const result = buildSupplierReleasePacket(source, RELEASE);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const serialized = JSON.stringify(result.value);

    // Money and cost.
    expect(serialized).not.toContain(String(source.orderTotalCents));
    expect(serialized).not.toContain("orderTotalCents");
    expect(serialized).not.toContain("12450");
    expect(serialized).not.toContain("price");
    expect(serialized).not.toContain("cost");
    // Payment and proof.
    expect(serialized).not.toContain("zelle");
    expect(serialized).not.toContain("paymentMethod");
    expect(serialized).not.toContain("proof");
    expect(serialized).not.toContain("verify-ord-ea-0001-a");
    expect(serialized).not.toContain("adm_alex");
    // Member identity beyond the shipping need.
    expect(serialized).not.toContain("cus_samuel");
    expect(serialized).not.toContain("customerRef");
    // Affiliate attribution.
    expect(serialized).not.toContain("ALEX-2026");
    expect(serialized).not.toContain("referral");
    // Internal catalog identity and any other supplier's mapping.
    expect(serialized).not.toContain("XEA-BPC-5MG");
    expect(serialized).not.toContain("prd_bpc157");
    expect(serialized).not.toContain("var_5mg");
  });

  it("keeps the projection stable when the verified order grows a new field", () => {
    // A field added upstream cannot reach a supplier: the reader refuses the unknown
    // key outright rather than passing it through.
    const result = buildSupplierReleasePacket(
      { ...verifiedOrder(), internalMarginCents: 4_000 },
      RELEASE,
    );
    expect(result).toEqual({ ok: false, code: "verified_order_invalid" });
  });
});

describe("supplier release requires a verified payment", () => {
  it("refuses any order that is not payment_verified", () => {
    for (const status of ["awaiting_payment", "payment_under_review", "payment_rejected", "paid"]) {
      const result = buildSupplierReleasePacket({ ...verifiedOrder(), status }, RELEASE);
      expect(result).toEqual({ ok: false, code: "verified_order_invalid" });
    }
  });

  it("refuses a missing, malformed, or Proxy wrapped verified order", () => {
    expect(buildSupplierReleasePacket(null, RELEASE)).toEqual({
      ok: false,
      code: "verified_order_invalid",
    });
    expect(buildSupplierReleasePacket(new Proxy({ ...verifiedOrder() }, {}), RELEASE)).toEqual({
      ok: false,
      code: "verified_order_invalid",
    });
  });
});

describe("supplier release input handling", () => {
  it("refuses a malformed supplier mapping", () => {
    expect(build({ supplierId: "" })).toEqual({ ok: false, code: "supplier_invalid" });
    expect(build({ supplierSku: null })).toEqual({ ok: false, code: "supplier_invalid" });
    expect(buildSupplierReleasePacket(verifiedOrder(), null)).toEqual({
      ok: false,
      code: "release_invalid",
    });
  });

  it("refuses an incomplete or hostile recipient", () => {
    expect(build({ recipient: { ...RECIPIENT, country: "USA" } })).toEqual({
      ok: false,
      code: "recipient_invalid",
    });
    expect(build({ recipient: { ...RECIPIENT, postalCode: "" } })).toEqual({
      ok: false,
      code: "recipient_invalid",
    });
    expect(build({ recipient: { ...RECIPIENT, recipientName: " Samuel" } })).toEqual({
      ok: false,
      code: "recipient_invalid",
    });
    expect(build({ recipient: { ...RECIPIENT, email: "samuel@example.com" } })).toEqual({
      ok: false,
      code: "recipient_invalid",
    });
    const { city: _omitted, ...withoutCity } = RECIPIENT;
    expect(build({ recipient: withoutCity })).toEqual({ ok: false, code: "recipient_invalid" });
  });

  it("accepts a recipient with no second address line", () => {
    const result = build({ recipient: { ...RECIPIENT, line2: null } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.recipient.line2).toBeNull();
  });

  it("freezes the packet and the recipient", () => {
    const result = build();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.isFrozen(result.value)).toBe(true);
    expect(Object.isFrozen(result.value.recipient)).toBe(true);
    expect(() => {
      (result.value as unknown as Record<string, unknown>).quantity = 99;
    }).toThrow();
  });

  it("is deterministic", () => {
    expect(build()).toEqual(build());
  });
});
