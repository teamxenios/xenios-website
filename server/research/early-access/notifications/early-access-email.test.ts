import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import {
  EARLY_ACCESS_EMAIL_EVENTS,
  earlyAccessEventKey,
  emailSafePaymentSummary,
  renderEarlyAccessOutboxEmail,
  safeEarlyAccessPayload,
} from "./communications";
import { EmailPayloadRefused } from "../../membership-activation/emails";

// The outbox is mocked at the module boundary: this suite proves the PROJECTOR
// and the RENDERER, and it must never reach Supabase or Resend. Zero real mail.
const enqueued: Array<Record<string, unknown>> = [];
vi.mock("../../outbox", () => ({
  enqueueNotification: vi.fn(async (input: Record<string, unknown>) => {
    // Model the database's unique index on event_key: a repeated key is
    // accepted as already-queued and writes no second row, exactly as the real
    // insert-or-ignore does.
    if (enqueued.some((row) => row.eventKey === input.eventKey)) return true;
    enqueued.push(input);
    return true;
  }),
}));

const {
  projectEarlyAccessCheckoutCreated,
  projectEarlyAccessPaymentVerified,
  projectEarlyAccessReleased,
  projectEarlyAccessTracking,
  earlyAccessStatusUrl,
} = await import("./outbox-adapter");

const CUSTOMER = "buyer@example.com";
const OTHER_CUSTOMER = "someone-else@example.com";

const ORDER = {
  cartCheckoutNumber: "XEC-0000000000000001",
  recipientEmail: CUSTOMER,
  customerName: "A Buyer",
  invoiceNumber: "XEI-0000000000000001",
  lines: [
    { name: "BPC-157 5 mg", quantity: 2 },
    { name: "NAD+ 1000 mg", quantity: 1 },
  ],
  payment: emailSafePaymentSummary({
    amountDueDisplay: "$250.00",
    paymentReference: "XEACART-0000000000000001",
    methodLabels: ["Zelle", "Cash App"],
  }),
};

beforeEach(() => {
  enqueued.length = 0;
});
afterEach(() => {
  delete process.env.SITE_URL;
});

describe("durable event identities", () => {
  it("derives every key from a durable commerce fact, never from browser state", () => {
    expect(earlyAccessEventKey.checkoutCreated("XEC-1")).toBe("ea:checkout-created:XEC-1");
    expect(earlyAccessEventKey.paymentVerified("stl-9")).toBe("ea:payment-verified:stl-9");
    expect(earlyAccessEventKey.released("rel-3")).toBe("ea:release:rel-3");
    expect(earlyAccessEventKey.tracking("trk-7")).toBe("ea:tracking:trk-7");
  });
});

describe("ORDER CREATED", () => {
  it("enqueues exactly one notification for a checkout", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    expect(enqueued).toHaveLength(1);
    expect(enqueued[0].recipient).toBe(CUSTOMER);
    expect(enqueued[0].eventKey).toBe(`ea:checkout-created:${ORDER.cartCheckoutNumber}`);
  });

  it("projected twice, still one row: the retry cannot send a second email", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    await projectEarlyAccessCheckoutCreated(ORDER);
    await projectEarlyAccessCheckoutCreated(ORDER);
    expect(enqueued).toHaveLength(1);
  });

  it("carries the reference, the amount and the method LABELS", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    const payload = enqueued[0].payload as Record<string, unknown>;
    expect(payload.paymentReference).toBe("XEACART-0000000000000001");
    expect(payload.amountDueDisplay).toBe("$250.00");
    expect(payload.methodLabels).toEqual(["Zelle", "Cash App"]);
    expect(payload.statusUrl).toContain("/research/early-access");
  });

  it("addresses only the owning customer", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    expect(enqueued[0].recipient).toBe(CUSTOMER);
    expect(enqueued[0].recipient).not.toBe(OTHER_CUSTOMER);
  });
});

describe("PAYMENT VERIFIED", () => {
  const settled = {
    settlementIdentity: "stl-0000000000000001",
    cartCheckoutNumber: ORDER.cartCheckoutNumber,
    recipientEmail: CUSTOMER,
    customerName: "A Buyer",
    invoiceNumber: ORDER.invoiceNumber,
    verifiedAmountDisplay: "$250.00",
    receiptNumber: "XER-0000000000000001",
  };

  it("enqueues exactly one confirmation", async () => {
    await projectEarlyAccessPaymentVerified(settled);
    expect(enqueued).toHaveLength(1);
  });

  it("a settlement RETRY does not enqueue a second confirmation", async () => {
    await projectEarlyAccessPaymentVerified(settled);
    await projectEarlyAccessPaymentVerified(settled);
    expect(enqueued).toHaveLength(1);
  });
});

describe("RELEASE and TRACKING", () => {
  it("one notification per durable release identity, and a retry adds none", async () => {
    const release = {
      releaseId: "rel-0000000000000001",
      cartCheckoutNumber: ORDER.cartCheckoutNumber,
      recipientEmail: CUSTOMER,
      customerName: "A Buyer",
      releaseReference: "REL-1",
      lines: ORDER.lines,
    };
    await projectEarlyAccessReleased(release);
    await projectEarlyAccessReleased(release);
    expect(enqueued).toHaveLength(1);
  });

  it("one notification per durable tracking identity, and a retry adds none", async () => {
    const tracking = {
      trackingEventId: "trk-0000000000000001",
      cartCheckoutNumber: ORDER.cartCheckoutNumber,
      recipientEmail: CUSTOMER,
      customerName: "A Buyer",
      carrierLabel: "UPS",
      trackingReference: "1Z999",
    };
    await projectEarlyAccessTracking(tracking);
    await projectEarlyAccessTracking(tracking);
    expect(enqueued).toHaveLength(1);
  });

  it("a release notification names no supplier", async () => {
    await projectEarlyAccessReleased({
      releaseId: "rel-2",
      cartCheckoutNumber: ORDER.cartCheckoutNumber,
      recipientEmail: CUSTOMER,
      customerName: "A Buyer",
      lines: ORDER.lines,
    });
    const serialized = JSON.stringify(enqueued[0]);
    for (const term of ["supplier", "apex", "renew360", "wholesale", "cost"]) {
      expect(serialized.toLowerCase()).not.toContain(term);
    }
  });
});

describe("PAYMENT DESTINATIONS NEVER TRAVEL IN EMAIL", () => {
  it("reduces a full payment presentation to three safe fields, dropping the rest", () => {
    const summary = emailSafePaymentSummary({
      amountDueDisplay: "$250.00",
      paymentReference: "XEACART-1",
      methodLabels: ["Zelle"],
      // Everything below belongs on the authenticated page, never in mail.
      destinationValue: "zelle@example.com",
      copyValue: "zelle@example.com",
      paymentUrl: "https://cash.app/$example",
    } as never);
    expect(Object.keys(summary).sort()).toEqual([
      "amountDueDisplay",
      "methodLabels",
      "paymentReference",
    ]);
    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain("zelle@example.com");
    expect(serialized).not.toContain("cash.app");
  });

  it("the allowlist drops any unexpected key before it reaches the outbox", () => {
    const payload = safeEarlyAccessPayload("ea_checkout_created", {
      customerName: "A Buyer",
      cartCheckoutNumber: "XEC-1",
      paymentReference: "XEACART-1",
      supplierId: "supplier-apex",
      internalNote: "wholesale 40%",
    });
    expect(payload.supplierId).toBeUndefined();
    expect(payload.internalNote).toBeUndefined();
    expect(payload.paymentReference).toBe("XEACART-1");
  });

  it.each([
    "paymentInstructions",
    "receivingHandle",
    "destinationValue",
    "cashtag",
    "accountNumber",
    "routingNumber",
    "iban",
    "deepLink",
  ])("refuses a payload carrying %s, at render time, fail closed", (key) => {
    expect(() =>
      renderEarlyAccessOutboxEmail("ea_checkout_created", {
        cartCheckoutNumber: "XEC-1",
        [key]: "should never be emailed",
      }),
    ).toThrow(EmailPayloadRefused);
  });

  it("the rendered order email contains a reference and a sign-in link, not a destination", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    const rendered = renderEarlyAccessOutboxEmail(
      "ea_checkout_created",
      enqueued[0].payload as Record<string, unknown>,
    );
    expect(rendered).not.toBeNull();
    expect(rendered!.text).toContain("XEACART-0000000000000001");
    expect(rendered!.text).toContain("Use your payment reference");
    expect(rendered!.text).toContain("/research/early-access");
    expect(rendered!.text).toContain("Zelle");
    for (const forbidden of ["zelle@", "cash.app", "routing", "IBAN", "account number"]) {
      expect(rendered!.text.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});

describe("the status link is safe to put in an unauthenticated channel", () => {
  it("carries no token, customer reference or email", async () => {
    await projectEarlyAccessCheckoutCreated(ORDER);
    const url = String((enqueued[0].payload as Record<string, unknown>).statusUrl);
    expect(url).toContain("/research/early-access");
    for (const secret of ["token", "eac_", "@example.com", "password", "session"]) {
      expect(url).not.toContain(secret);
    }
  });

  it("refuses a non-https deployment override rather than emailing an untrusted link", () => {
    process.env.SITE_URL = "http://evil.example.com";
    expect(earlyAccessStatusUrl()).toContain("xeniostechnology.com");
  });
});

describe("renderers", () => {
  it("returns null for a template that is not ours, so other branches still dispatch", () => {
    expect(renderEarlyAccessOutboxEmail("applicant_approved", {})).toBeNull();
  });

  it("renders every declared event", () => {
    for (const event of EARLY_ACCESS_EMAIL_EVENTS) {
      const rendered = renderEarlyAccessOutboxEmail(event, {
        customerName: "A Buyer",
        cartCheckoutNumber: "XEC-1",
        statusUrl: "https://xeniostechnology.com/research/early-access",
      });
      expect(rendered, event).not.toBeNull();
      expect(rendered!.subject.length, event).toBeGreaterThan(0);
      expect(rendered!.text, event).toContain("XEC-1");
    }
  });

  it("never renders a provider credential", () => {
    process.env.RESEND_API_KEY = "re_should_never_appear";
    const rendered = renderEarlyAccessOutboxEmail("ea_checkout_created", {
      customerName: "A Buyer",
      cartCheckoutNumber: "XEC-1",
    });
    expect(rendered!.text).not.toContain("re_should_never_appear");
    delete process.env.RESEND_API_KEY;
  });
});
