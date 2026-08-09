import { describe, expect, it } from "vitest";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { readEarlyAccessAdminPaymentReview } from "./admin-payment-review";

const checkout = {
  cartCheckoutNumber: "XEC-0123456789ABCDEF",
  contact: { email: "buyer@example.com", phone: null },
  paymentState: "under_review",
  disposition: null,
  children: [],
  invoice: {
    invoiceNumber: "XEI-0123456789ABCDEF",
    paymentReference: "XEACART-0123456789ABCDEF",
    payableTotalCents: 2500,
    currency: "USD",
    lines: [{ orderNumber: "XEA-CART-01234567-01", sku: "SKU-1", quantity: 1, payableCents: 2500 }],
  },
} as unknown as EarlyAccessCartCheckoutRecord;

const submission = {
  submissionId: "eas_1234567890123456",
  method: { code: "wire", methodName: "Wire transfer", registryVersion: "v1", presentedAt: "2026-08-09T00:00:00.000Z" },
  filename: "proof.pdf",
  byteSize: 1200,
  proofSha256: "sensitive-hash",
  submissionKey: "sensitive-key",
  internalRecipient: "research@xeniostechnology.com",
  internalEmailAcceptance: "accepted",
  providerMessageId: "sensitive-provider-id",
  lastError: null,
  reconciliationRequired: false,
  createdAt: "2026-08-09T00:00:00.000Z",
};

describe("founder payment review projection", () => {
  it("shows the review facts and drops transport metadata the screen does not need", async () => {
    const review = await readEarlyAccessAdminPaymentReview({
      checkouts: { byCheckoutNumber: async () => checkout } as never,
      settlements: { settlement: async () => null } as never,
      submissions: { byCheckoutNumber: async () => submission as never },
      agreements: { forCheckout: async () => ({ satisfied: true, packageVersion: "ea-legal-v1" }) },
    }, checkout.cartCheckoutNumber);

    expect(review).toMatchObject({
      canApprove: true,
      blockers: [],
      amountDueCents: 2500,
      paymentReference: "XEACART-0123456789ABCDEF",
      submission: { methodName: "Wire transfer", filename: "proof.pdf" },
    });
    const serialized = JSON.stringify(review);
    expect(serialized).not.toContain("sensitive-provider-id");
    expect(serialized).not.toContain("sensitive-hash");
    expect(serialized).not.toContain("sensitive-key");
    expect(serialized).not.toContain("internalRecipient");
  });

  it("blocks an unreconciled submission and stale agreement package", async () => {
    const review = await readEarlyAccessAdminPaymentReview({
      checkouts: { byCheckoutNumber: async () => checkout } as never,
      settlements: { settlement: async () => null } as never,
      submissions: {
        byCheckoutNumber: async () => ({ ...submission, internalEmailAcceptance: "unknown", reconciliationRequired: true }) as never,
      },
      agreements: { forCheckout: async () => ({ satisfied: false, packageVersion: "ea-legal-v2" }) },
    }, checkout.cartCheckoutNumber);

    expect(review?.canApprove).toBe(false);
    expect(review?.blockers).toEqual(["agreements_not_current", "submission_unreconciled"]);
  });
});
