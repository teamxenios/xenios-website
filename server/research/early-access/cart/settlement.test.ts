import { describe, expect, it } from "vitest";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { InMemoryEarlyAccessCartStore } from "./store";
import { recordEarlyAccessCartExternalProof, settleEarlyAccessCart } from "./settlement";

const checkout = {
  cartCheckoutNumber: "XEC-0123456789ABCDEF",
  customerRef: "eac_0123456789abcdef0123456789abcdef",
  contact: { email: "buyer@example.com", phone: "+15125550100" },
  shipTo: { recipientName: "Buyer", line1: "1 Main", line2: null, city: "Austin", region: "TX", postalCode: "78701", country: "US" },
  idempotencyKey: "xeac_1234567890123456",
  intentHash: "a".repeat(64),
  quoteId: "xeaq_1234567890123456",
  children: [{ orderNumber: "XEA-CART-01234567-01", productId: "P", variantId: "V", sku: "SKU", quantity: 1, supplierId: "raw-peptides", supplierSku: "RP-1", unitPriceCents: 1000, subtotalCents: 1000, discountCents: 0, payableCents: 1000 }],
  invoice: { invoiceNumber: "XEI-0123456789ABCDEF", cartCheckoutNumber: "XEC-0123456789ABCDEF", paymentReference: "XEACART-0123456789ABCDEF", currency: "USD", lines: [{ orderNumber: "XEA-CART-01234567-01", sku: "SKU", quantity: 1, unitPriceCents: 1000, subtotalCents: 1000, discountCents: 0, payableCents: 1000 }], subtotalCents: 1000, discountCents: 0, shippingCents: 0, taxCents: 0, payableTotalCents: 1000, instructions: "manual", issuedAt: "2026-08-08T00:00:00.000Z", status: "awaiting_payment" },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-08T00:00:00.000Z",
  attribution: null,
} satisfies EarlyAccessCartCheckoutRecord;

describe("cart settlement", () => {
  it("requires proof, exact money, and settles every child exactly once", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    await store.commit(checkout);
    await expect(settleEarlyAccessCart({ checkouts: store, settlements: store }, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      externalTransactionId: "txn-1",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: false,
      actorId: "admin@example.com",
      at: "2026-08-08T00:01:00.000Z",
    })).resolves.toMatchObject({ committed: false, reason: "admin_confirmation_missing" });
    expect((await settleEarlyAccessCart({ checkouts: store, settlements: store }, { cartCheckoutNumber: checkout.cartCheckoutNumber, externalTransactionId: "txn-1", confirmedFundsReceived: true, confirmedAmountAndReference: true, actorId: "admin@example.com", at: "2026-08-08T00:01:00.000Z" })).committed).toBe(false);
    const proof = await recordEarlyAccessCartExternalProof({ checkouts: store, settlements: store }, { cartCheckoutNumber: checkout.cartCheckoutNumber, sha256: "b".repeat(64), filename: "proof.png", contentType: "image/png", byteSize: 100, provenanceNote: "Received by the named operator off platform", actorId: "admin@example.com", at: "2026-08-08T00:01:00.000Z" });
    expect(proof.committed).toBe(true);
    if (!proof.committed) return;
    const settled = await settleEarlyAccessCart({ checkouts: store, settlements: store }, { cartCheckoutNumber: checkout.cartCheckoutNumber, externalTransactionId: "txn-1", confirmedFundsReceived: true, confirmedAmountAndReference: true, actorId: "admin@example.com", at: "2026-08-08T00:02:00.000Z" });
    expect(settled.committed).toBe(true);
    if (!settled.committed) return;
    expect(settled.settlement.childReleases).toHaveLength(1);
    expect(settled.settlement.paymentVerifiedAt).toBe("2026-08-08T00:02:00.000Z");
    expect(settled.settlement.shipByAt).toBe("2026-08-11T00:02:00.000Z");
    const replay = await settleEarlyAccessCart({ checkouts: store, settlements: store }, { cartCheckoutNumber: checkout.cartCheckoutNumber, externalTransactionId: "txn-1", confirmedFundsReceived: true, confirmedAmountAndReference: true, actorId: "admin@example.com", at: "2026-08-08T00:03:00.000Z" });
    expect(replay).toMatchObject({ committed: false, reason: "already_settled" });
  });

  it("bridges an accepted transient submission to legacy proof metadata in the same action", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    await store.commit(checkout);
    const settled = await settleEarlyAccessCart({
      checkouts: store,
      settlements: store,
      submissionEvidence: {
        async acceptedForCheckout() {
          return {
            submissionId: "eas_1234567890123456",
            sha256: "c".repeat(64),
            filename: "payment-proof.pdf",
            contentType: "application/pdf",
            byteSize: 2048,
          };
        },
      },
    }, {
      cartCheckoutNumber: checkout.cartCheckoutNumber,
      externalTransactionId: "provider-txn-bridge-1",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-08T00:02:00.000Z",
    });
    expect(settled.committed).toBe(true);
    expect(await store.externalProofs(checkout.cartCheckoutNumber)).toMatchObject([
      {
        filename: "payment-proof.pdf",
        storedOnPlatform: false,
        recordedBy: "admin@example.com",
      },
    ]);
  });
});
