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

  // The shipping-address assertion used to live in the test above, bundled in
  // with wholesale cost and margin. That bundling was the error: an address is
  // not procurement economics, it is operational data the founder needs to fill
  // the order, and the payload was already built to carry it. The real boundary
  // is per-RECIPIENT, so it is asserted per recipient below.
  it("gives the operator the shipping address, because that is the point", () => {
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        shippingAddress: {
          line1: "1 Test Way",
          line2: "Suite 4",
          city: "Austin",
          region: "TX",
          postalCode: "78701",
          countryCode: "US",
        },
      }),
    )!.text;
    expect(body).toContain("Ship to:");
    expect(body).toContain("1 Test Way");
    expect(body).toContain("Suite 4");
    expect(body).toContain("Austin, TX, 78701");
    expect(body).toContain("US");
  });

  // Section 8 of the founder's manual-intake brief, field by field. The bar is
  // that the founder can close the sale by REPLYING to this email, so each of
  // these is asserted rather than assumed.
  it("carries every field the founder needs to close the sale by reply", () => {
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({
        mobilePhone: "+1 512 555 0134",
        totalQuantity: 7,
        customerNotes: "Please ship to the lab, not the office.",
        operatorStatus: "Order received. Awaiting manual review.",
        acceptedAt: "2026-08-21T14:00:00.000Z",
        agreements: [
          { kind: "research_use_policy", version: "2026-07-01" },
          { kind: "terms_of_sale", version: "2026-06-15" },
        ],
        shippingAddress: {
          line1: "1 Test Way",
          city: "Austin",
          region: "TX",
          postalCode: "78701",
          countryCode: "US",
        },
      }),
    )!.text;
    expect(body).toContain("Status: Order received. Awaiting manual review.");
    expect(body).toContain("+1 512 555 0134");
    expect(body).toContain("Ship to:");
    expect(body).toContain("Total units: 7");
    expect(body).toContain("Order total:");
    expect(body).toContain("research_use_policy 2026-07-01");
    expect(body).toContain("terms_of_sale 2026-06-15");
    expect(body).toContain("2026-08-21T14:00:00.000Z");
    expect(body).toContain("Please ship to the lab, not the office.");
  });

  it("states a status even when the payload carries none", () => {
    const body = renderAssistedOrderOutboxEmail(ADMIN, v2Payload())!.text;
    expect(body).toContain("Status: Order received. Awaiting manual review.");
  });

  it("says the version is unrecorded rather than implying one", () => {
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ agreements: [{ kind: "research_use_policy" }] }),
    )!.text;
    expect(body).toContain("research_use_policy (version unrecorded)");
  });

  it("still renders a v1 payload that carries none of the new fields", () => {
    // Rows queued before this change must keep rendering. An outbox job whose
    // template throws walks to failed_permanent, which would lose a real order
    // notification — worse than a sparse email.
    const body = renderAssistedOrderOutboxEmail(ADMIN, {
      publicReference: "XRR-20260821-ABCDEF0123",
      fullLegalName: "Ada Lovelace",
      email: "ada@example.com",
    })!.text;
    expect(body).toContain("XRR-20260821-ABCDEF0123");
    expect(body).not.toContain("Ship to:");
    expect(body).not.toContain("Agreements accepted");
  });

  it("gives the customer a destination SUMMARY, not their street address", () => {
    // Section 9 asks for a shipping destination summary. The point is that a
    // customer can spot "that is not where I meant" before Xenios ships —
    // which needs city/region/country, and does not need their street read
    // back to them.
    const body = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload({
        shippingAddress: {
          line1: "1 Test Way",
          line2: "Suite 4",
          city: "Austin",
          region: "TX",
          postalCode: "78701",
          countryCode: "US",
        },
      }),
    )!.text;
    expect(body).toContain("Shipping to: Austin, TX, US");
    expect(body).not.toContain("1 Test Way");
    expect(body).not.toContain("Suite 4");
    expect(body).not.toContain("78701");
  });

  it("omits the destination line rather than printing a bare comma", () => {
    const body = renderAssistedOrderOutboxEmail(CUSTOMER, v2Payload())!.text;
    expect(body).not.toContain("Shipping to:");
  });

  it("never echoes the address back to the CUSTOMER", () => {
    // The customer knows where they live. Echoing it only adds a copy of their
    // address to a forwardable channel, so the customer template reads no
    // address field at all.
    const body = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload({
        shippingAddress: { line1: "1 Test Way", city: "Austin" },
        mobilePhone: "+1 512 555 0134",
        adminPath: "/admin/research/assisted-orders/x",
        declaredAffiliateCode: "DANA10",
      }),
    )!.text;
    expect(body).not.toContain("1 Test Way");
    expect(body).not.toContain("555 0134");
    expect(body).not.toContain("/admin/");
    expect(body).not.toContain("DANA10");
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
