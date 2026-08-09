import { describe, expect, it } from "vitest";
import type {
  EarlyAccessCartPaymentState,
  EarlyAccessCartStatus,
} from "@shared/research/early-access-cart";
import { EARLY_ACCESS_ORDER_STAGES } from "@shared/research/early-access-hardening";
import { projectEarlyAccessOrder, reservedEarlyAccessOrder } from "./orderStage";

/**
 * THE CUSTOMER'S ANSWER TO "WHERE IS MY ORDER", AND WHERE IT COMES FROM.
 *
 * The distinction these tests exist to defend is CHECKOUT RESERVED versus ORDER
 * SUBMITTED FOR PAYMENT REVIEW, and underneath both, the fact that neither one
 * means the money arrived. Every case below asserts the projection reads the
 * server and only the server: there is no input to this function representing
 * anything the browser did, saw, or uploaded, and these tests would have to be
 * rewritten, not merely adjusted, for one to be added.
 */

function child(orderNumber: string) {
  return {
    orderNumber,
    productId: "prod-1",
    variantId: "var-1",
    sku: `SKU-${orderNumber}`,
    quantity: 1,
    supplierId: "sup-1",
    supplierSku: "SUP-1",
    unitPriceCents: 1_000,
    subtotalCents: 1_000,
    discountCents: 0,
    payableCents: 1_000,
  };
}

function release(orderNumber: string, shippedAt: string | null) {
  return {
    releaseId: `rel-${orderNumber}`,
    cartCheckoutNumber: "XEC-ABCDEFGH12345678",
    orderNumber,
    supplierId: "sup-1",
    supplierSku: "SUP-1",
    quantity: 1,
    releasedAt: "2026-08-09T10:00:00.000Z",
    shippedAt,
    tracking: shippedAt === null ? [] : ["TRACK-1"],
  };
}

function status(
  overrides: Readonly<{
    state?: EarlyAccessCartPaymentState;
    paid?: boolean;
    externalProofCount?: number;
    released?: boolean;
    childOrderNumbers?: readonly string[];
    releases?: readonly ReturnType<typeof release>[];
  }> = {},
): EarlyAccessCartStatus {
  const numbers = overrides.childOrderNumbers ?? ["XEA-1"];
  return {
    checkout: {
      cartCheckoutNumber: "XEC-ABCDEFGH12345678",
      contact: { email: "a@b.test", phone: "+15550001111" },
      shipTo: {
        recipientName: "A B",
        line1: "1 Road",
        line2: null,
        city: "Town",
        region: "TX",
        postalCode: "77001",
        country: "US",
      },
      children: numbers.map(child),
      invoice: {
        invoiceNumber: "XEA-INV-0001",
        cartCheckoutNumber: "XEC-ABCDEFGH12345678",
        paymentReference: "XEA-PAY-8F3K2Q",
        currency: "USD",
        lines: [],
        subtotalCents: 1_000,
        discountCents: 0,
        shippingCents: 0,
        taxCents: 0,
        payableTotalCents: 1_000,
        instructions: "Concierge",
        issuedAt: "2026-08-09T09:00:00.000Z",
        status: "awaiting_payment",
      },
      paymentState: overrides.state ?? "awaiting_payment",
      placedAt: "2026-08-09T09:00:00.000Z",
    },
    payment: {
      state: overrides.state ?? "awaiting_payment",
      paid: overrides.paid ?? false,
      externalProofCount: overrides.externalProofCount ?? 0,
    },
    receipt: null,
    fulfilment: {
      released: overrides.released ?? false,
      childOrders: overrides.releases ?? [],
    },
  } as EarlyAccessCartStatus;
}

describe("checkout reserved is not order submitted", () => {
  it("a fresh checkout with no proof and no review is RESERVED, and says the customer still owes an action", () => {
    const order = projectEarlyAccessOrder(status());
    expect(order.stage).toBe("checkout_reserved");
    expect(order.submittedForReview).toBe(false);
    expect(order.paymentConfirmed).toBe(false);
    expect(order.label).toBe("Checkout reserved");
    expect(order.customerAction).not.toBeNull();
  });

  it("a recorded external proof moves it to SUBMITTED, and the wait becomes ours", () => {
    const order = projectEarlyAccessOrder(status({ externalProofCount: 1 }));
    expect(order.stage).toBe("payment_review_required");
    expect(order.submittedForReview).toBe(true);
    expect(order.customerAction).toBeNull();
  });

  it("the server saying under_review is enough on its own, with no proof counted", () => {
    const order = projectEarlyAccessOrder(status({ state: "under_review" }));
    expect(order.stage).toBe("payment_review_required");
    expect(order.submittedForReview).toBe(true);
  });

  it("SUBMITTED STILL MEANS UNPAID. The screen must not imply a screenshot settled anything", () => {
    const order = projectEarlyAccessOrder(status({ state: "under_review", externalProofCount: 3 }));
    expect(order.paymentConfirmed).toBe(false);
    expect(order.detail).toContain("not confirmed");
  });
});

describe("payment confirmation is the server's word and nothing else", () => {
  it("only `paid` sets paymentConfirmed", () => {
    expect(projectEarlyAccessOrder(status({ paid: true, state: "payment_verified" })).paymentConfirmed).toBe(true);
    expect(projectEarlyAccessOrder(status({ paid: false, state: "payment_verified" })).paymentConfirmed).toBe(false);
  });

  it("a released, shipped order with paid false still reports the payment unconfirmed", () => {
    // Fulfilment must never be allowed to imply a payment fact. If those two
    // ever disagree in production it is a real incident, and the screen has to
    // show the disagreement rather than paper over it.
    const order = projectEarlyAccessOrder(
      status({ paid: false, released: true, releases: [release("XEA-1", "2026-08-09T12:00:00.000Z")] }),
    );
    expect(order.stage).toBe("shipped");
    expect(order.paymentConfirmed).toBe(false);
  });

  it("no number of recorded proofs can confirm a payment", () => {
    const order = projectEarlyAccessOrder(status({ externalProofCount: 99 }));
    expect(order.paymentConfirmed).toBe(false);
  });
});

describe("fulfilment stages", () => {
  it("verified but not released is PAYMENT VERIFIED", () => {
    const order = projectEarlyAccessOrder(status({ state: "payment_verified", paid: true }));
    expect(order.stage).toBe("payment_verified");
  });

  it("released with nothing shipped is PROCESSING", () => {
    const order = projectEarlyAccessOrder(
      status({ state: "payment_verified", paid: true, released: true, releases: [release("XEA-1", null)] }),
    );
    expect(order.stage).toBe("processing");
    expect(order.shippedCount).toBe(0);
  });

  it("one of two shipped is PARTIALLY SHIPPED and counts honestly", () => {
    const order = projectEarlyAccessOrder(
      status({
        state: "payment_verified",
        paid: true,
        released: true,
        childOrderNumbers: ["XEA-1", "XEA-2"],
        releases: [release("XEA-1", "2026-08-09T12:00:00.000Z"), release("XEA-2", null)],
      }),
    );
    expect(order.stage).toBe("partially_shipped");
    expect(order.shippedCount).toBe(1);
    expect(order.childCount).toBe(2);
  });

  it("every child shipped is SHIPPED", () => {
    const order = projectEarlyAccessOrder(
      status({
        state: "payment_verified",
        paid: true,
        released: true,
        childOrderNumbers: ["XEA-1", "XEA-2"],
        releases: [
          release("XEA-1", "2026-08-09T12:00:00.000Z"),
          release("XEA-2", "2026-08-09T13:00:00.000Z"),
        ],
      }),
    );
    expect(order.stage).toBe("shipped");
    expect(order.shippedCount).toBe(2);
  });

  it("a rejected payment is a FLAG, not a stage, so it cannot fork the contract vocabulary", () => {
    const order = projectEarlyAccessOrder(status({ state: "payment_rejected", externalProofCount: 1 }));
    // The contract deliberately keeps rejection in EarlyAccessCartPaymentState.
    expect(EARLY_ACCESS_ORDER_STAGES).not.toContain("payment_rejected");
    expect(order.paymentRejected).toBe(true);
    expect(order.paymentConfirmed).toBe(false);
    // The submission still happened, so the stage reflects that honestly.
    expect(order.stage).toBe("payment_review_required");
  });

  it("a refusal on an untouched checkout still reads as reserved, with the flag set", () => {
    const order = projectEarlyAccessOrder(status({ state: "payment_rejected" }));
    expect(order.stage).toBe("checkout_reserved");
    expect(order.paymentRejected).toBe(true);
    expect(order.submittedForReview).toBe(false);
  });
});

describe("the projection is total and closed", () => {
  it("every payment state the contract allows produces a known stage", () => {
    const states: readonly EarlyAccessCartPaymentState[] = [
      "awaiting_payment",
      "under_review",
      "payment_verified",
      "payment_rejected",
    ];
    for (const state of states) {
      const order = projectEarlyAccessOrder(status({ state }));
      expect(EARLY_ACCESS_ORDER_STAGES).toContain(order.stage);
      expect(order.label.length).toBeGreaterThan(0);
      expect(order.detail.length).toBeGreaterThan(0);
    }
  });

  it("a checkout with no children is never reported as shipped", () => {
    const order = projectEarlyAccessOrder(status({ childOrderNumbers: [], released: true }));
    expect(order.stage).toBe("processing");
    expect(order.shippedCount).toBe(0);
  });
});

describe("the two stages the cart status cannot know are never guessed", () => {
  it("published instructions move it to awaiting-your-payment, and NOT to submitted", () => {
    const order = projectEarlyAccessOrder(status(), { instructionsResolved: true });
    expect(order.stage).toBe("payment_instructions_shown");
    expect(order.submittedForReview).toBe(false);
    expect(order.paymentConfirmed).toBe(false);
  });

  it("a submission still in flight is explicitly SHORT of submitted for review", () => {
    const order = projectEarlyAccessOrder(status(), {
      instructionsResolved: true,
      submission: {
        state: "in_progress",
        method: "zelle",
        methodLabel: "Zelle",
        filename: "receipt.png",
        acceptedAt: null,
        retryAllowed: true,
      },
    });
    expect(order.stage).toBe("customer_submission_pending");
    // The whole point: started is not submitted, and neither is paid.
    expect(order.submittedForReview).toBe(false);
    expect(order.paymentConfirmed).toBe(false);
  });

  it("needs_retry is also short of submitted, and asks the customer to send again", () => {
    const order = projectEarlyAccessOrder(status(), {
      submission: {
        state: "needs_retry",
        method: "zelle",
        methodLabel: "Zelle",
        filename: "receipt.png",
        acceptedAt: null,
        retryAllowed: true,
      },
    });
    expect(order.stage).toBe("customer_submission_pending");
    expect(order.submittedForReview).toBe(false);
    expect(order.customerAction).toContain("again");
  });

  it("accepted_for_review IS submitted, and still is not paid", () => {
    const order = projectEarlyAccessOrder(status(), {
      submission: {
        state: "accepted_for_review",
        method: "zelle",
        methodLabel: "Zelle",
        filename: "receipt.png",
        acceptedAt: "2026-08-09T12:00:00.000Z",
        retryAllowed: false,
      },
    });
    expect(order.stage).toBe("payment_review_required");
    expect(order.submittedForReview).toBe(true);
    expect(order.paymentConfirmed).toBe(false);
  });

  it("with no server answer at all it stays reserved rather than being flattered forward", () => {
    const order = projectEarlyAccessOrder(status(), { submission: null });
    expect(order.stage).toBe("checkout_reserved");
  });
});

describe("ship-by and overdue come from the contract, not from this module", () => {
  it("no server commitment means no date and never overdue", () => {
    const order = projectEarlyAccessOrder(status({ released: true }));
    expect(order.shipByAt).toBeNull();
    expect(order.overdue).toBe(false);
  });

  it("past the commitment and unshipped is overdue", () => {
    const order = projectEarlyAccessOrder(
      status({ released: true, releases: [release("XEA-1", null)] }),
      { shipByAt: "2026-08-09T00:00:00.000Z", nowIso: "2026-08-10T00:00:00.000Z" },
    );
    expect(order.stage).toBe("processing");
    expect(order.overdue).toBe(true);
  });

  it("a shipped order is never overdue, however late it was", () => {
    const order = projectEarlyAccessOrder(
      status({ released: true, releases: [release("XEA-1", "2026-08-20T00:00:00.000Z")] }),
      { shipByAt: "2026-08-09T00:00:00.000Z", nowIso: "2026-08-30T00:00:00.000Z" },
    );
    expect(order.stage).toBe("shipped");
    expect(order.overdue).toBe(false);
  });

  it("the pre-status placeholder is reserved and confirms nothing", () => {
    const order = reservedEarlyAccessOrder();
    expect(order.stage).toBe("checkout_reserved");
    expect(order.submittedForReview).toBe(false);
    expect(order.paymentConfirmed).toBe(false);
  });
});
