import { describe, expect, it } from "vitest";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import {
  buildInternalOrderPacket,
  createResendInternalOrderEmailSender,
  INTERNAL_ORDER_EMAIL_RECIPIENT,
  renderInternalOrderEmail,
  assertPacketCarriesNoBytes,
  type ProductDisplayPort,
  type ResendLikeClient,
} from "./internal-order-email";
import { pendingSubmission } from "./submission-record";
import { validPng } from "./test-fixtures";

const CHECKOUT = {
  cartCheckoutNumber: "XEAC-2026-0007",
  customerRef: "cust_x",
  contact: { email: "buyer@example.test", phone: "+15125550100" },
  shipTo: {
    recipientName: "A Buyer",
    line1: "1 Test Street",
    line2: "Apt 4",
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "US",
  },
  idempotencyKey: "k",
  intentHash: "h",
  quoteId: "q",
  children: [
    {
      orderNumber: "XEA-2026-0007-1",
      productId: "11111111-1111-4111-8111-111111111111",
      variantId: "22222222-2222-4222-8222-222222222222",
      sku: "TB-500-10MG",
      quantity: 1,
      supplierId: "sup_1",
      supplierSku: "S-TB-10",
      unitPriceCents: 22500,
      subtotalCents: 22500,
      discountCents: 0,
      payableCents: 22500,
    },
  ],
  invoice: {
    invoiceNumber: "INV-7",
    cartCheckoutNumber: "XEAC-2026-0007",
    paymentReference: "XEA-REF-7",
    currency: "USD",
    lines: [],
    subtotalCents: 22500,
    discountCents: 0,
    shippingCents: 1500,
    taxCents: 0,
    payableTotalCents: 24000,
    instructions: "",
    issuedAt: "2026-08-09T10:00:00.000Z",
    status: "awaiting_payment",
  },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-09T10:00:00.000Z",
  attribution: null,
} as unknown as EarlyAccessCartCheckoutRecord;

const SUBMISSION = pendingSubmission({
  cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
  customerRef: CHECKOUT.customerRef,
  memberId: "mem_7",
  proofSha256: "a".repeat(64),
  filename: "transfer.png",
  contentType: "image/png",
  byteSize: 2048,
  method: {
    code: "cash_app",
    methodName: "Cash App",
    registryVersion: "gov-1",
    presentedAt: "2026-08-09T11:00:00.000Z",
  },
  packageVersion: "pkg-v1",
  at: "2026-08-09T11:00:00.000Z",
});

const NAMING_CATALOGUE: ProductDisplayPort = {
  async describe() {
    return { displayName: "TB-500", strength: "10 mg" };
  },
};

describe("the packet", () => {
  it("uses the authoritative display name and strength, never the identifiers", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: false,
      products: NAMING_CATALOGUE,
    });
    const { text } = renderInternalOrderEmail(packet);

    expect(text).toContain("TB-500");
    expect(text).toContain("10 mg");
    expect(text).toContain("TB-500-10MG");
    expect(text).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(text).not.toContain("11111111-1111-4111-8111-111111111111");
  });

  it("says so explicitly when the catalogue cannot name a unit", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: false,
      products: { async describe() { return null; } },
    });
    const { text } = renderInternalOrderEmail(packet);

    expect(packet.lines[0].displayUnresolved).toBe(true);
    expect(text).toContain("PRODUCT NAME UNRESOLVED");
    // Even unresolved, the opaque ids stay out of the operator's reading.
    expect(text).not.toContain("22222222-2222-4222-8222-222222222222");
  });

  it("survives an enrichment outage rather than losing the email", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: false,
      products: { async describe() { throw new Error("catalogue down"); } },
    });
    expect(packet.lines).toHaveLength(1);
    expect(packet.lines[0].displayUnresolved).toBe(true);
  });

  it("carries the money, the reference and the proof fingerprint", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: true,
      products: NAMING_CATALOGUE,
    });
    const { subject, text } = renderInternalOrderEmail(packet);

    expect(subject).toContain("XEAC-2026-0007");
    expect(subject).toContain("USD 240.00");
    expect(text).toContain("XEA-REF-7");
    expect(text).toContain("a".repeat(64));
    expect(text).toContain("2.0 KB");
    expect(text).toContain("renamed from the submitted name");
  });

  it("states that the upload settles nothing", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: false,
      products: NAMING_CATALOGUE,
    });
    const { text } = renderInternalOrderEmail(packet);
    expect(text).toContain("This is a CLAIM, not a verified");
    expect(text).toContain("No supplier has been released");
  });

  it("holds no bytes and no pointer to them", async () => {
    const packet = await buildInternalOrderPacket({
      checkout: CHECKOUT,
      submission: SUBMISSION,
      filenameRewritten: false,
      products: NAMING_CATALOGUE,
    });
    expect(() => assertPacketCarriesNoBytes(packet)).not.toThrow();
  });
});

describe("the direct sender", () => {
  function client(): ResendLikeClient & { calls: Array<[Record<string, unknown>, Record<string, unknown> | undefined]> } {
    const calls: Array<[Record<string, unknown>, Record<string, unknown> | undefined]> = [];
    return {
      calls,
      emails: {
        async send(payload, options) {
          calls.push([payload, options]);
          return { data: { id: "prov_abc" } };
        },
      },
    };
  }

  const message = {
    subject: "s",
    text: "t",
    filename: "proof.png",
    contentType: "image/png",
    bytes: validPng(),
    idempotencyKey: "idem-key-1",
  };

  it("addresses exactly the internal research mailbox, which is not a parameter", async () => {
    const resend = client();
    const sender = createResendInternalOrderEmailSender({ client: resend, fromEmail: "xenios <team@x.test>" });
    await sender.send(message);

    expect(resend.calls[0][0].to).toBe(INTERNAL_ORDER_EMAIL_RECIPIENT);
    expect(INTERNAL_ORDER_EMAIL_RECIPIENT).toBe("research@xeniostechnology.com");
    // There is no recipient input on the send signature at all.
    expect(Object.keys(message)).not.toContain("to");
    expect(Object.keys(message)).not.toContain("recipient");
  });

  it("attaches the file rather than inlining it, and sends no HTML", async () => {
    const resend = client();
    const sender = createResendInternalOrderEmailSender({ client: resend, fromEmail: "f@x.test" });
    await sender.send(message);

    const payload = resend.calls[0][0] as { attachments: Array<Record<string, unknown>>; html?: unknown };
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toBe("proof.png");
    expect(payload.html).toBeUndefined();
  });

  it("passes the deterministic idempotency key to the provider", async () => {
    const resend = client();
    const sender = createResendInternalOrderEmailSender({ client: resend, fromEmail: "f@x.test" });
    await sender.send(message);
    expect(resend.calls[0][1]).toEqual({ idempotencyKey: "idem-key-1" });
  });

  it("reports a provider error as a clean refusal", async () => {
    const sender = createResendInternalOrderEmailSender({
      client: { emails: { async send() { return { error: { message: "invalid" } }; } } },
      fromEmail: "f@x.test",
    });
    await expect(sender.send(message)).resolves.toEqual({ outcome: "refused" });
  });

  it("reports a thrown transport error as ambiguous, because the message may exist", async () => {
    const sender = createResendInternalOrderEmailSender({
      client: { emails: { async send() { throw new Error("ECONNRESET"); } } },
      fromEmail: "f@x.test",
    });
    await expect(sender.send(message)).resolves.toEqual({ outcome: "ambiguous" });
  });

  it("reports an acceptance with no id as ambiguous rather than accepted", async () => {
    const sender = createResendInternalOrderEmailSender({
      client: { emails: { async send() { return { data: null }; } } },
      fromEmail: "f@x.test",
    });
    await expect(sender.send(message)).resolves.toEqual({ outcome: "ambiguous" });
  });
});
