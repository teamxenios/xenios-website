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

  it("DOES carry the shipping address now, which this test previously forbade", () => {
    // DELIBERATE POLICY CHANGE (founder, 2026-08-21). This assertion used to
    // read `expect(body).not.toContain("1 Test Way")`, because the original
    // boundary kept every address out of every email and put operator depth
    // behind the admin link.
    //
    // Payment automation is now deferred and the founder fulfils these orders
    // by hand, from the email, without opening the database — so the address
    // has to be in the ADMIN email. It is inverted here rather than deleted so
    // the reversal is visible to the next reader instead of looking like the
    // coverage was quietly dropped.
    //
    // The customer half of this boundary did NOT move: see "the operator
    // surface never crosses into the customer email".
    const body = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ shippingAddress: { line1: "1 Test Way", city: "Boston" } }),
    )!.text;
    expect(body).toContain("1 Test Way");
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

describe("the admin email is enough to fulfil an order by hand", () => {
  // Payment automation is deferred (founder, 2026-08-21): the founder works
  // these orders from the email itself. Anything missing here is a trip to the
  // database, so each field is asserted by the value an operator would need,
  // never merely by presence.
  const operatorPayload = () =>
    v2Payload({
      mobilePhone: "+15550102000",
      organizationName: "Okafor Research",
      shippingAddress: {
        line1: "1 Research Way",
        line2: "Suite 4",
        city: "Boston",
        region: "MA",
        postalCode: "02110",
        countryCode: "US",
      },
      agreements: [
        { kind: "research_use_policy", version: "2026-05", acceptedAt: "2026-08-21T14:00:00.000Z" },
        {
          kind: "assisted_order_form_v1:accuracy",
          version: "aeb2ba5a069dd3f4",
          acceptedAt: "2026-08-21T14:00:00.000Z",
        },
      ],
      generalNotes: "Please ship cold chain.",
      orderStatusLabel: "Order Received / Awaiting Manual Review",
      lines: [
        {
          productName: "BPC-157",
          specification: "BPC-157 10 mg",
          quantity: 2,
          unitPriceCents: 4_900,
          lineEstimateCents: 9_800,
          workflowMode: "direct_order_request",
          customerNotes: "Prefer the 10 mg vial.",
        },
      ],
    });

  const adminText = () =>
    renderAssistedOrderOutboxEmail(
      ADMIN,
      operatorPayload(),
    )!.text;

  it("states the order is received and awaiting manual review, not paid", () => {
    const text = adminText();
    expect(text).toContain("Order Received / Awaiting Manual Review");
    expect(text).toContain("Nothing is paid, reserved or shipped yet.");
  });

  it("carries the phone and the full shipping address", () => {
    const text = adminText();
    expect(text).toContain("+15550102000");
    expect(text).toContain("1 Research Way");
    expect(text).toContain("Suite 4");
    expect(text).toContain("Boston, MA, 02110");
    expect(text).toContain("US");
  });

  it("says so plainly when no phone was provided, rather than omitting the row", () => {
    const text = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ mobilePhone: "" }),
    )!.text;
    expect(text).toContain("Phone: not provided");
  });

  it("carries the order total and every line's retail money", () => {
    const text = adminText();
    expect(text).toContain("Order total: $248.00 USD (estimate)");
    expect(text).toContain("$49.00 each");
    expect(text).toContain("$98.00 line total");
  });

  it("carries each agreement at its exact version and acceptance time", () => {
    const text = adminText();
    expect(text).toContain("research_use_policy (version 2026-05 | 2026-08-21T14:00:00.000Z)");
    expect(text).toContain("assisted_order_form_v1:accuracy (version aeb2ba5a069dd3f4");
  });

  it("marks an agreement missing its version as unrecorded rather than dropping it", () => {
    // A silently missing agreement is indistinguishable from one never
    // accepted; an operator must be able to see that the evidence is thin.
    const text = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ agreements: [{ kind: "research_use_policy", version: "", acceptedAt: "" }] }),
    )!.text;
    expect(text).toContain("research_use_policy (version not recorded | time not recorded)");
  });

  it("carries the general note and the per-line note", () => {
    const text = adminText();
    expect(text).toContain("Please ship cold chain.");
    expect(text).toContain("BPC-157: Prefer the 10 mg vial.");
  });

  it("keeps blank separator lines, so a shipping address is not misread", () => {
    expect(adminText()).toContain("\n\n");
  });

  it("renders a partial address rather than nothing", () => {
    const text = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload({ shippingAddress: { line1: "1 Research Way", countryCode: "US" } }),
    )!.text;
    expect(text).toContain("1 Research Way");
    expect(text).toContain("Ship to:");
  });

  it("still renders when the operator fields are absent entirely", () => {
    // Rows queued before this change carry none of them; they must render,
    // not walk to failed_permanent.
    const text = renderAssistedOrderOutboxEmail(
      ADMIN,
      v2Payload(),
    )!.text;
    expect(text).toContain("XRR-20260820-A1B2C3D4E5");
    expect(text).not.toContain("Ship to:");
    expect(text).not.toContain("Agreements accepted:");
  });
});

describe("the operator surface never crosses into the customer email", () => {
  it("mails the customer no phone, address, agreement version or internal status", () => {
    const operatorFields = {
      mobilePhone: "+15550102000",
      shippingAddress: {
        line1: "1 Research Way",
        city: "Boston",
        region: "MA",
        postalCode: "02110",
        countryCode: "US",
      },
      agreements: [
        { kind: "research_use_policy", version: "2026-05", acceptedAt: "2026-08-21T14:00:00.000Z" },
      ],
      generalNotes: "Please ship cold chain.",
      orderStatusLabel: "Order Received / Awaiting Manual Review",
      declaredAffiliateCode: "DANA10",
      affiliateAttributionRef: "ref_verified_1",
      adminPath: "/admin/research/assisted-orders/8f14e45f",
    };
    const text = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload(operatorFields),
    )!.text;
    for (const leak of [
      "+15550102000",
      "1 Research Way",
      "02110",
      "2026-05",
      "Please ship cold chain.",
      "Awaiting Manual Review",
      "DANA10",
      "ref_verified_1",
      "/admin/",
    ]) {
      expect(text).not.toContain(leak);
    }
  });

  it("tells the customer their order was received and that instructions are coming", () => {
    const text = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload(),
    )!.text;
    expect(text).toContain("Order received");
    expect(text).toContain("payment instructions");
  });

  it("never tells the customer the order is paid, confirmed, in stock or shipped", () => {
    const rendered = renderAssistedOrderOutboxEmail(
      CUSTOMER,
      v2Payload(),
    )!;
    const whole = `${rendered.subject}\n${rendered.text}`.toLowerCase();
    for (const forbidden of ["paid", "in stock", "has shipped", "your payment", "confirmed."]) {
      expect(whole).not.toContain(forbidden);
    }
  });
});
