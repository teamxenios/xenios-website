/**
 * RESERVED IS NOT SUBMITTED, AND THE CUSTOMER'S INBOX HAS TO AGREE.
 *
 * The checkout email fires when units are held and an invoice exists. No
 * payment has been made and no proof has been sent. It used to read "We have
 * your Early Access order", which told the customer their order was with us
 * before they had done either of the two things that actually submit it.
 *
 * These tests pin the distinction in the words the customer reads, because the
 * order-stage vocabulary being right on the server is worth nothing if the
 * email contradicts it.
 */

import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_EMAIL_EVENTS,
  renderEarlyAccessOutboxEmail,
  safeEarlyAccessPayload,
} from "./communications";

const CHECKOUT = "XEC-063A962A0053A65324F21E7F";

const RESERVED_PAYLOAD = {
  customerName: "Samuel",
  cartCheckoutNumber: CHECKOUT,
  invoiceNumber: "XEI-063A962A0053A65324F21E7F",
  amountDueDisplay: "$1,250.00",
  paymentReference: "XEACART-063A962A0053A65324F21E7F",
  methodLabels: ["Zelle"],
};

const SUBMITTED_PAYLOAD = {
  customerName: "Samuel",
  cartCheckoutNumber: CHECKOUT,
  invoiceNumber: "XEI-063A962A0053A65324F21E7F",
  paymentReference: "XEACART-063A962A0053A65324F21E7F",
};

/**
 * Render the way production does: through the per-event allowlist first, then
 * the outbox renderer. Rendering the raw payload would let this test pass while
 * the allowlist leaked, which is the opposite of what it is here to prove.
 */
function render(event: string, payload: Record<string, unknown>) {
  const safe = safeEarlyAccessPayload(event as never, payload);
  const rendered = renderEarlyAccessOutboxEmail(event, safe);
  if (rendered === null) throw new Error(`No template rendered for ${event}.`);
  return rendered;
}

describe("the checkout email says reserved, not received", () => {
  it("does not claim we have the order", () => {
    const { subject, text } = render("ea_checkout_created", RESERVED_PAYLOAD);
    expect(text).not.toContain("We have your Early Access order");
    expect(subject).not.toBe(`Your Early Access order ${CHECKOUT}`);
  });

  it("says reserved, in both the subject and the body", () => {
    const { subject, text } = render("ea_checkout_created", RESERVED_PAYLOAD);
    expect(subject.toLowerCase()).toContain("reserved");
    expect(text.toLowerCase()).toContain("is reserved");
  });

  it("says plainly that it is not submitted and nothing was charged", () => {
    const { text } = render("ea_checkout_created", RESERVED_PAYLOAD);
    expect(text.toLowerCase()).toContain("not submitted");
    expect(text.toLowerCase()).toContain("nothing has been charged");
  });

  it("tells the customer the two steps that remain", () => {
    const { text } = render("ea_checkout_created", RESERVED_PAYLOAD);
    expect(text.toLowerCase()).toContain("two steps remain");
    expect(text.toLowerCase()).toContain("upload your payment confirmation");
  });

  it("still carries the operational facts the customer needs to pay", () => {
    const { text } = render("ea_checkout_created", RESERVED_PAYLOAD);
    // The email was reworded, not gutted.
    expect(text).toContain("XEACART-063A962A0053A65324F21E7F");
    expect(text).toContain("$1,250.00");
    expect(text).toContain("Zelle");
  });
});

describe("the submitted-for-review email claims review, never verification", () => {
  it("says submitted for payment review", () => {
    const { subject, text } = render("ea_submitted_for_review", SUBMITTED_PAYLOAD);
    expect(subject.toLowerCase()).toContain("submitted for review");
    expect(text.toLowerCase()).toContain("submitted for payment review");
  });

  it("states that uploading did not verify the payment", () => {
    const { text } = render("ea_submitted_for_review", SUBMITTED_PAYLOAD);
    expect(text.toLowerCase()).toContain("not verified yet");
    expect(text.toLowerCase()).toContain("does not verify it");
    expect(text.toLowerCase()).toContain("no supplier has been released");
  });

  it("never claims the payment is verified or the order is paid", () => {
    const { subject, text } = render("ea_submitted_for_review", SUBMITTED_PAYLOAD);
    const whole = `${subject}\n${text}`.toLowerCase();
    expect(whole).not.toContain("has been verified");
    expect(whole).not.toContain("payment received");
    expect(whole).not.toContain("paid in full");
  });

  it("carries no proof metadata, because it is not a receipt for the file", () => {
    const hostile = {
      ...SUBMITTED_PAYLOAD,
      // Even if a caller passes these, the allowlist must drop them.
      filename: "receipt-secret.pdf",
      proofSha256: "a".repeat(64),
      providerMessageId: "resend-abc123",
      internalRecipient: "ops-inbox@internal.example",
    };

    // The allowlist is the boundary, so assert on it directly rather than only
    // on the rendered string. A field that never survives into the payload
    // cannot be rendered by any template, present or future.
    const safe = safeEarlyAccessPayload("ea_submitted_for_review" as never, hostile);
    expect(Object.keys(safe).sort()).toEqual([
      "cartCheckoutNumber",
      "customerName",
      "invoiceNumber",
      "paymentReference",
    ]);

    const { text } = render("ea_submitted_for_review", hostile);
    expect(text).not.toContain("receipt-secret.pdf");
    expect(text).not.toContain("a".repeat(64));
    expect(text).not.toContain("resend-abc123");
    expect(text).not.toContain("ops-inbox@internal.example");
    // Note: research@xeniostechnology.com is deliberately NOT asserted absent.
    // It is the public contact address in every Xenios Research signoff, so its
    // presence is the footer, not a leak of the internal submission recipient.
    // Asserting on the string would have tested the signoff and proved nothing.
  });
});

describe("the two events stay distinct", () => {
  it("both are registered and the reserved one keeps its original key", () => {
    // The key is unchanged on purpose: the existing founder checkout keeps its
    // notification identity and never needs reissuing.
    expect(EARLY_ACCESS_EMAIL_EVENTS).toContain("ea_checkout_created");
    expect(EARLY_ACCESS_EMAIL_EVENTS).toContain("ea_submitted_for_review");
  });

  it("reserved comes before submitted in the declared sequence", () => {
    const events = EARLY_ACCESS_EMAIL_EVENTS as readonly string[];
    expect(events.indexOf("ea_checkout_created")).toBeLessThan(
      events.indexOf("ea_submitted_for_review"),
    );
    expect(events.indexOf("ea_submitted_for_review")).toBeLessThan(
      events.indexOf("ea_payment_verified"),
    );
  });

  it("renders different subjects, so an inbox cannot confuse them", () => {
    const reserved = render("ea_checkout_created", RESERVED_PAYLOAD);
    const submitted = render("ea_submitted_for_review", SUBMITTED_PAYLOAD);
    expect(reserved.subject).not.toBe(submitted.subject);
  });
});
