import { describe, expect, it } from "vitest";
import { renderAssistedOrderOutboxEmail } from "./communications";

/**
 * The two order emails the founder requires on every persisted request.
 *
 * These templates are the only place an order's contents become an outbound
 * message, so the assertions here are mostly about what must NEVER appear.
 * Every one of them is a real leak class rather than a hypothetical: retail
 * pricing is customer-safe, procurement economics are not; the admin link is an
 * operator fact, not a customer one; and a typed affiliate code is a claim that
 * must never be presented as verified attribution.
 */

const CUSTOMER = "research.assisted_order.submitted.customer";
const ADMIN = "research.assisted_order.submitted.admin";

function v2Payload(overrides: Record<string, unknown> = {}) {
  return {
    publicReference: "XRR-20260820-A1B2C3D4E5",
    fullLegalName: "Dana Okafor",
    email: "dana@example.com",
    lineCount: 2,
    totalQuantity: 12,
    estimatedTotalCents: 24_800,
    workflowModes: ["direct_order_request"],
    paymentState: "none_due_yet",
    nextSteps: ["A specialist confirms your agreements and pricing."],
    statusPath: "/research/early-access/order-request/XRR-20260820-A1B2C3D4E5",
    adminPath: "/admin/research/assisted-orders/8f14e45f-ceea-467a-9575-1f1f1f1f1f1f",
    lines: [
      {
        productName: "BPC-157",
        specification: "BPC-157 10 mg",
        quantity: 2,
        unitPriceCents: 4_900,
        lineEstimateCents: 9_800,
        workflowMode: "direct_order_request",
      },
      {
        productName: "Kisspeptin",
        specification: "KISSPEPTIN 10 mg",
        quantity: 10,
        unitPriceCents: 6_500,
        lineEstimateCents: 65_000,
        workflowMode: "direct_order_request",
      },
    ],
    ...overrides,
  };
}

describe("the customer confirmation email", () => {
  it("carries the reference, every item with its retail money, and the status link", () => {
    const mail = renderAssistedOrderOutboxEmail(CUSTOMER, v2Payload());
    expect(mail).not.toBeNull();
    expect(mail?.subject).toContain("XRR-20260820-A1B2C3D4E5");
    const body = mail!.text;
    expect(body).toContain("BPC-157 10 mg");
    expect(body).toContain("qty 2");
    expect(body).toContain("$49.00 each");
    expect(body).toContain("KISSPEPTIN 10 mg");
    expect(body).toContain("qty 10");
    expect(body).toContain("$65.00 each");
    expect(body).toContain("nothing is due yet");
    expect(body).toContain("A specialist confirms your agreements and pricing.");
    expect(body).toContain("/research/early-access/order-request/XRR-20260820-A1B2C3D4E5");
  });

  it("never shows the customer an operator surface", () => {
    const body = renderAssistedOrderOutboxEmail(CUSTOMER, v2Payload())!.text;
    expect(body).not.toContain("/admin/");
    expect(body).not.toMatch(/affiliate/i);
  });

  it("says price on request rather than zero for an unpriced line", () => {
    // A $0.00 in an order email reads as free. The founder's rule is that no
    // customer surface may ever show $0 for a product that has no price yet.
    const body = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload({
        lines: [
          {
            productName: "BAM15",
            specification: "BAM15 500 mcg",
            quantity: 1,
            unitPriceCents: null,
            lineEstimateCents: null,
            workflowMode: "request_pricing",
          },
        ],
      }),
    )!.text;
    expect(body).toContain("price on request");
    expect(body).not.toContain("$0.00");
  });
});

describe("the admin order alert", () => {
  it("carries the customer, the items with retail money, and the secure admin link", () => {
    const body = renderAssistedOrderOutboxEmail(ADMIN, v2Payload())!.text;
    expect(body).toContain("Dana Okafor");
    expect(body).toContain("dana@example.com");
    expect(body).toContain("KISSPEPTIN 10 mg");
    expect(body).toContain("$65.00 each");
    expect(body).toContain("Next action:");
    expect(body).toContain("/admin/research/assisted-orders/");
  });

  it("labels a typed affiliate code as unverified and keeps it apart from verified attribution", () => {
    const both = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        affiliateAttributionRef: "partner_7f3a",
        declaredAffiliateCode: "DANA10",
      }),
    )!.text;
    expect(both).toContain("verified partner_7f3a");
    expect(both).toContain('customer-entered "DANA10" (unverified)');

    const declaredOnly = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ declaredAffiliateCode: "DANA10" }),
    )!.text;
    expect(declaredOnly).toContain("unverified");
    expect(declaredOnly).not.toContain("verified partner_");
  });

  it("says so explicitly when no affiliate was recorded", () => {
    const body = renderAssistedOrderOutboxEmail(ADMIN, v2Payload())!.text;
    expect(body).toContain("Affiliate: none recorded");
  });

  it("leaks no procurement economics even when the payload carries them", () => {
    // The payload cannot carry these today, because the catalog authority has
    // no such fields. This proves the renderer is an allowlist rather than a
    // pass-through, so a future payload change cannot quietly start leaking.
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        wholesaleCostCents: 1_200,
        marginCents: 3_700,
        supplierName: "Contoso Peptides",
        internalPricingNote: "2.5x multiplier",
      }),
    )!.text;
    expect(body).not.toContain("1200");
    expect(body).not.toContain("3700");
    expect(body).not.toContain("Contoso");
    expect(body).not.toMatch(/multiplier/i);
  });

  it("CARRIES the shipping address, because manual fulfilment needs one", () => {
    // CHANGED DELIBERATELY 2026-08-21. This assertion used to be the opposite:
    // the admin alert deliberately carried no address, on the reasoning that
    // the operator would open the admin screen for anything that specific.
    //
    // Payment is manual at launch. The founder reads this email and replies to
    // the customer with availability and payment instructions, so an email
    // without an address cannot do the job it exists to do. Withholding it
    // would not protect anyone — it would just send the operator to the
    // database for every order.
    //
    // The narrowing that keeps this honest is the recipient, not the field:
    // it goes to the configured admin address only, and the customer template
    // still renders no address at all (asserted below).
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        mobilePhone: "+15125550100",
        shippingAddress: {
          recipientName: "Dana Okafor",
          line1: "1 Test Way",
          city: "Austin",
          region: "TX",
          postalCode: "78704",
          countryCode: "US",
        },
        customerNotes: "Please confirm cold-chain packing.",
        agreements: [{ kind: "early_access_terms", version: "v1" }],
        acceptedAt: "2026-08-21T10:00:00.000Z",
        operatorStatus: "Order received. Awaiting manual review.",
      }),
    )!.text;

    expect(body).toContain("1 Test Way");
    expect(body).toContain("Austin, TX, 78704");
    expect(body).toContain("+15125550100");
    expect(body).toContain("early_access_terms v1");
    expect(body).toContain("Please confirm cold-chain packing.");
    expect(body).toContain("Awaiting manual review");
    // Still says plainly that nothing is owed, so the operator knows there is
    // no money fact to reconcile yet.
    expect(body).toMatch(/nothing is due yet/i);
  });

  it("keeps the customer email free of the address it never needed", () => {
    // The customer knows where they live. Echoing a full address back over
    // mail adds exposure and tells them nothing.
    const body = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload({
        shippingAddress: {
          recipientName: "Dana Okafor",
          line1: "1 Test Way",
          city: "Austin",
        },
        mobilePhone: "+15125550100",
      }),
    )!.text;
    expect(body).not.toContain("1 Test Way");
    expect(body).not.toContain("+15125550100");
  });
});

describe("rows queued before the v2 payload existed", () => {
  // The bump from v1 to v2 must not strand anything already in the outbox: the
  // worker walks an unrenderable template key to failed_permanent, so a v1 row
  // that returned null here would become an order nobody was ever told about.
  const v1Customer = {
    publicReference: "XRR-20260819-99AABBCCDD",
    lineCount: 3,
    estimatedTotalCents: 15_000,
    statusPath: "/research/early-access/order-request/XRR-20260819-99AABBCCDD",
  };
  const v1Admin = {
    publicReference: "XRR-20260819-99AABBCCDD",
    fullLegalName: "Prior Customer",
    email: "prior@example.com",
    lineCount: 3,
    estimatedTotalCents: 15_000,
    workflowModes: ["direct_order_request"],
    adminPath: "/admin/research/assisted-orders/1f1f1f1f-ceea-467a-9575-8f14e45fcee1",
  };

  it("still renders the v1 customer payload", () => {
    const mail = renderAssistedOrderOutboxEmail(CUSTOMER, v1Customer);
    expect(mail).not.toBeNull();
    expect(mail!.text).toContain("XRR-20260819-99AABBCCDD");
    expect(mail!.text).toContain("Requested items: 3");
    expect(mail!.text).not.toContain("Items:");
  });

  it("still renders the v1 admin payload", () => {
    const mail = renderAssistedOrderOutboxEmail(ADMIN, v1Admin);
    expect(mail).not.toBeNull();
    expect(mail!.text).toContain("Prior Customer");
    expect(mail!.text).toContain("Affiliate: none recorded");
  });
});

describe("an unknown template key", () => {
  it("returns null so the worker refuses rather than inventing a message", () => {
    expect(renderAssistedOrderOutboxEmail("research.assisted_order.nope", {})).toBeNull();
  });
});

describe("the per-line note reaches the operator", () => {
  it("attributes a line note to its product instead of merging it into one blob", () => {
    // The wizard offers a note per line, and the request stores it, but until
    // now only the single general note was carried outward. A line note is the
    // one that changes what ships.
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        customerNotes: "Please confirm cold-chain packing.",
        lines: [
          {
            productName: "BPC-157",
            specification: "BPC-157 10 mg",
            quantity: 2,
            unitPriceCents: 4_900,
            lineEstimateCents: 9_800,
            workflowMode: "direct_order_request",
            customerNotes: "Send the 10 mg vial, not the 5 mg.",
          },
          {
            productName: "Kisspeptin",
            specification: "KISSPEPTIN 10 mg",
            quantity: 10,
            unitPriceCents: 6_500,
            lineEstimateCents: 65_000,
            workflowMode: "direct_order_request",
          },
        ],
      }),
    )!.text;
    expect(body).toContain("Please confirm cold-chain packing.");
    expect(body).toContain("BPC-157: Send the 10 mg vial, not the 5 mg.");
  });

  it("keeps line notes out of the customer email", () => {
    const body = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload({
        lines: [
          {
            productName: "BPC-157",
            specification: "BPC-157 10 mg",
            quantity: 2,
            unitPriceCents: 4_900,
            lineEstimateCents: 9_800,
            workflowMode: "direct_order_request",
            customerNotes: "Send the 10 mg vial, not the 5 mg.",
          },
        ],
      }),
    )!.text;
    expect(body).not.toContain("Send the 10 mg vial");
  });

  it("renders no notes section at all when there are none", () => {
    expect(renderAssistedOrderOutboxEmail(ADMIN, v2Payload())!.text).not.toContain(
      "CUSTOMER NOTES",
    );
  });
});

describe("the admin email is readable by a human under time pressure", () => {
  it("keeps its paragraph breaks instead of collapsing into one block", () => {
    // The previous filter dropped every deliberate blank line, so SHIPPING ran
    // straight into ORDER. That is how an address gets misread as an order line.
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        shippingAddress: { line1: "1 Test Way", city: "Austin", region: "TX" },
      }),
    )!.text;
    expect(body).toContain("\n\n");
    expect(body).not.toContain("US\nORDER");
  });

  it("still drops rows that are genuinely absent", () => {
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ workflowModes: [], adminPath: "" }),
    )!.text;
    expect(body).not.toContain("Workflow:");
    expect(body).not.toContain("Review: https");
  });
});
