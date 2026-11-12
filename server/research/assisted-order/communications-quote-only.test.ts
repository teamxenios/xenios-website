import { describe, expect, it } from "vitest";
import { renderAssistedOrderOutboxEmail } from "./communications";

/**
 * Quote-only customer confirmation. A payload marked `pricing: "quote"` names
 * every item, strength and quantity and states no amount: no unit price, no
 * line total, no estimated value, and never $0 or "free". A payload without the
 * marker (every row queued before the cutover) renders exactly as before.
 * Synthetic values only.
 */

const CUSTOMER = "research.assisted_order.submitted.customer";
const ADMIN = "research.assisted_order.submitted.admin";

function payload(overrides: Record<string, unknown> = {}) {
  return {
    publicReference: "XRR-20260101-SYNTH00001",
    lineCount: 1,
    totalQuantity: 2,
    paymentState: "none_due_yet",
    nextSteps: ["A specialist confirms your agreements and pricing."],
    lines: [{
      productName: "Synthetic Peptide",
      specification: "Synthetic Peptide 10 mg",
      quantity: 2,
      unitPriceCents: null,
      lineEstimateCents: null,
      workflowMode: "direct_order_request",
    }],
    ...overrides,
  };
}

describe("the customer confirmation email, quote-only", () => {
  it("lists the item and quantity with no amount and says a quote follows review", () => {
    const body = renderAssistedOrderOutboxEmail(CUSTOMER, payload({ pricing: "quote" }))!.text;
    expect(body).toContain("Synthetic Peptide 10 mg");
    expect(body).toContain("qty 2");
    expect(body).not.toMatch(/\$|\d each|line total|Estimated value|price on request|to be confirmed|\bfree\b/i);
    expect(body).toContain("Xenios reviews each request and confirms availability, a quote and payment details before fulfillment.");
  });

  it("states no amount even if one arrives on a quote payload", () => {
    const body = renderAssistedOrderOutboxEmail(CUSTOMER, payload({
      pricing: "quote",
      estimatedTotalCents: 9_800,
      lines: [{ productName: "Synthetic Peptide", specification: "10 mg", quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800 }],
    }))!.text;
    expect(body).not.toMatch(/\$|49\.00|98\.00|Estimated value/);
  });

  it("renders a payload without the marker exactly as before", () => {
    const body = renderAssistedOrderOutboxEmail(CUSTOMER, payload({
      estimatedTotalCents: 9_800,
      lines: [{ productName: "Synthetic Peptide", specification: "10 mg", quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800 }],
    }))!.text;
    expect(body).toContain("$49.00 each");
    expect(body).toContain("$98.00 line total");
    expect(body).toContain("Estimated value: $98.00 USD (estimate)");
  });

  it("leaves the staff email's pricing alone", () => {
    const body = renderAssistedOrderOutboxEmail(ADMIN, payload({
      pricing: "quote",
      estimatedTotalCents: 9_800,
      adminPath: "/admin/research/assisted-orders/synthetic",
      lines: [{ productName: "Synthetic Peptide", specification: "10 mg", quantity: 2, unitPriceCents: 4_900, lineEstimateCents: 9_800 }],
    }))!.text;
    expect(body).toContain("$49.00");
  });
});
