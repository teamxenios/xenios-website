import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";
import { createProofSubmissionService } from "./submission-service";
import { createMemoryProofSubmissionStore } from "./memory-store";
import { INTERNAL_ORDER_EMAIL_RECIPIENT, type InternalOrderEmailSender } from "./internal-order-email";
import type { EarlyAccessProofPaymentPresentationPort } from "./payment-presentation";
import { proofProviderIdempotencyKey, proofSubmissionId } from "./submission-record";
import { customerSubmissionView } from "./customer-view";
import {
  EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS,
  customerPayloadIsClean,
} from "@shared/research/early-access-hardening";
import { EARLY_ACCESS_PROOF_BYTES_ARE_TRANSIENT } from "../hardening-contract";
import type {
  EarlyAccessAgreementAuthority,
  EarlyAccessLegalBindingDirectory,
} from "../hardening-contract";
import { createSendSemaphore, createSubmissionRateLimiter } from "./concurrency";
import type { PdfStructuralParser } from "./containers";
import { validJpeg, validPng } from "./test-fixtures";

const pdfParser: PdfStructuralParser = { async pageCount() { return 1; } };

const CHECKOUT: EarlyAccessCartCheckoutRecord = Object.freeze({
  cartCheckoutNumber: "XEAC-2026-0001",
  customerRef: "cust_alpha",
  contact: Object.freeze({ email: "buyer@example.test", phone: "+15125550100" }),
  shipTo: Object.freeze({
    recipientName: "A Buyer",
    line1: "1 Test Street",
    line2: null,
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "US" as const,
  }),
  idempotencyKey: "idem-1",
  intentHash: "hash-1",
  quoteId: "quote-1",
  children: Object.freeze([
    Object.freeze({
      orderNumber: "XEA-2026-0001-1",
      productId: "11111111-1111-4111-8111-111111111111",
      variantId: "22222222-2222-4222-8222-222222222222",
      sku: "BPC-157-5MG",
      quantity: 2,
      supplierId: "sup_1",
      supplierSku: "S-BPC-5",
      unitPriceCents: 16750,
      subtotalCents: 33500,
      discountCents: 0,
      payableCents: 33500,
    }),
  ]),
  invoice: Object.freeze({
    invoiceNumber: "INV-2026-0001",
    cartCheckoutNumber: "XEAC-2026-0001",
    paymentReference: "XEA-REF-0001",
    currency: "USD" as const,
    lines: Object.freeze([
      Object.freeze({
        orderNumber: "XEA-2026-0001-1",
        sku: "BPC-157-5MG",
        quantity: 2,
        unitPriceCents: 16750,
        subtotalCents: 33500,
        discountCents: 0,
        payableCents: 33500,
      }),
    ]),
    subtotalCents: 33500,
    discountCents: 0,
    shippingCents: 1500,
    taxCents: 0,
    payableTotalCents: 35000,
    instructions: "See the Early Access page.",
    issuedAt: "2026-08-09T10:00:00.000Z",
    status: "awaiting_payment" as const,
  }),
  paymentState: "awaiting_payment" as const,
  placedAt: "2026-08-09T10:00:00.000Z",
  attribution: null,
});

function resolvedPresentation(
  method = "zelle",
): EarlyAccessProofPaymentPresentationPort {
  return {
    async resolveChosenMethod(chosen: unknown) {
      if (chosen !== method) return { state: "not_enabled" as const };
      return {
        state: "resolved" as const,
        snapshot: {
          code: method as never,
          methodName: "Zelle",
          registryVersion: "gov-fingerprint-abc",
          presentedAt: "2026-08-09T11:00:00.000Z",
        },
      };
    },
  };
}

type SentMessage = {
  subject: string;
  text: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  idempotencyKey: string;
};

function recordingSender(
  behaviour: () => Promise<{ outcome: "accepted"; providerMessageId: string } | { outcome: "refused" } | { outcome: "ambiguous" }> = async () => ({
    outcome: "accepted" as const,
    providerMessageId: "prov_123",
  }),
): InternalOrderEmailSender & { sent: SentMessage[] } {
  const sent: SentMessage[] = [];
  return {
    sent,
    async send(input) {
      sent.push({ ...input, bytes: new Uint8Array(input.bytes) });
      return behaviour();
    },
  };
}

/** Session 4's seam, satisfied here so this lane can be tested alone. */
function boundDirectory(
  overrides: Partial<{ memberId: string; owns: boolean }> = {},
): EarlyAccessLegalBindingDirectory {
  return {
    async forCustomer(customerRef: string) {
      return {
        ok: true as const,
        binding: {
          customerRef,
          memberId: overrides.memberId ?? "mem_alpha",
          establishedBy: "verified_link" as const,
          verifiedAt: "2026-08-01T00:00:00.000Z",
          attestedBy: null,
          aliasRefs: [],
        },
      };
    },
    async ownsCheckout() {
      return overrides.owns ?? true;
    },
  };
}

function satisfiedAgreements(satisfied = true): EarlyAccessAgreementAuthority {
  return {
    async currentPackage() {
      return {
        packageId: "ea-package",
        packageVersion: "pkg-v1",
        requirements: [],
        evaluatedAt: "2026-08-09T11:00:00.000Z",
      } as never;
    },
    async standingFor(memberId: string) {
      return {
        satisfied,
        packageId: "ea-package",
        packageVersion: "pkg-v1",
        memberId,
        blocking: [],
        evaluatedAt: "2026-08-09T11:00:00.000Z",
      };
    },
  };
}

function buildService(overrides: Partial<Parameters<typeof createProofSubmissionService>[0]> = {}) {
  const store = createMemoryProofSubmissionStore();
  const sender = recordingSender();
  const deps = {
    checkouts: { async byCheckoutNumber(n: string) { return n === CHECKOUT.cartCheckoutNumber ? CHECKOUT : null; } },
    submissions: store,
    bindings: boundDirectory(),
    agreements: satisfiedAgreements(),
    presentation: resolvedPresentation(),
    products: {
      async describe() {
        return { displayName: "BPC-157", strength: "5 mg" };
      },
    },
    sender,
    pdfParser,
    now: () => Date.parse("2026-08-09T11:00:00.000Z"),
    ...overrides,
  } as Parameters<typeof createProofSubmissionService>[0];
  return {
    submit: createProofSubmissionService(deps),
    store: (deps.submissions ?? store) as ReturnType<typeof createMemoryProofSubmissionStore>,
    sender: deps.sender as ReturnType<typeof recordingSender>,
  };
}

function request(overrides: Record<string, unknown> = {}) {
  return {
    customer: { customerRef: "cust_alpha" },
    cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
    bytes: validPng(),
    declaredContentType: "image/png",
    declaredFilename: "zelle.png",
    method: "zelle",
    ...overrides,
  } as Parameters<ReturnType<typeof createProofSubmissionService>>[0];
}

describe("the happy path", () => {
  it("sends exactly one internal email and records the submission as metadata", async () => {
    const { submit, store, sender } = buildService();
    const outcome = await submit(request());

    expect(outcome).toMatchObject({ ok: true, state: "submitted" });
    expect(sender.sent).toHaveLength(1);
    expect(store.all()).toHaveLength(1);

    const record = store.all()[0];
    expect(record.internalEmailAcceptance).toBe("accepted");
    expect(record.providerMessageId).toBe("prov_123");
    // The row is a claim. There is no field on it that can say otherwise.
    expect(Object.keys(record)).not.toContain("paid");
    expect(Object.keys(record)).not.toContain("verified");
    expect(Object.keys(record)).not.toContain("supplierReleased");
    expect(EARLY_ACCESS_PROOF_BYTES_ARE_TRANSIENT).toBe(true);
    // The stored row is metadata. No byte bearing field exists on it at all.
    expect(Object.keys(record)).not.toContain("bytes");
    expect(Object.keys(record)).not.toContain("base64");
    expect(Object.keys(record)).not.toContain("objectKey");
  });

  it("attaches the real bytes and the safe filename to the message", async () => {
    const { submit, sender } = buildService();
    await submit(request({ declaredFilename: "../../Zelle\u202egnp.exe" }));

    const message = sender.sent[0];
    expect(message.filename.endsWith(".png")).toBe(true);
    expect(message.filename).not.toContain("..");
    expect(message.bytes.length).toBe(validPng().length);
    expect(message.contentType).toBe("image/png");
  });

  it("carries the operational packet, with real product language and no destination", async () => {
    const { submit, sender } = buildService();
    await submit(request());

    const { subject, text } = sender.sent[0];
    expect(subject).toContain("XEAC-2026-0001");
    expect(text).toContain("BPC-157");
    expect(text).toContain("5 mg");
    expect(text).toContain("XEA-REF-0001");
    expect(text).toContain("USD 350.00");
    // The variant UUID must never be presented as a product identity.
    expect(text).not.toContain("22222222-2222-4222-8222-222222222222");
    // No receiving material may travel in email.
    expect(text.toLowerCase()).not.toContain("cashtag");
    expect(text.toLowerCase()).not.toContain("routing");
    expect(text.toLowerCase()).not.toContain("account number");
  });

  it("names the customer's chosen method and its governance version", async () => {
    const { submit, sender } = buildService();
    await submit(request());
    expect(sender.sent[0].text).toContain("Zelle (zelle)");
    expect(sender.sent[0].text).toContain("gov-fingerprint-abc");
  });
});

describe("the payment method is never defaulted", () => {
  it("refuses a submission with no method", async () => {
    const { submit, sender } = buildService();
    await expect(submit(request({ method: undefined }))).resolves.toEqual({
      ok: false,
      code: "method_required",
    });
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses a method the live presentation does not enable", async () => {
    const { submit, sender } = buildService();
    await expect(submit(request({ method: "venmo" }))).resolves.toEqual({
      ok: false,
      code: "method_not_enabled",
    });
    expect(sender.sent).toHaveLength(0);
  });

  it("fails closed, not to Zelle, when the presentation cannot be resolved", async () => {
    const { submit, sender } = buildService({
      presentation: { async resolveChosenMethod() { return { state: "unavailable" as const }; } },
    });
    await expect(submit(request())).resolves.toEqual({
      ok: false,
      code: "presentation_unavailable",
    });
    expect(sender.sent).toHaveLength(0);
  });
});

describe("duplicate submission", () => {
  it("does not send a second email on a concurrent double click", async () => {
    const { submit, sender, store } = buildService();
    const [first, second] = await Promise.all([submit(request()), submit(request())]);

    expect(sender.sent).toHaveLength(1);
    expect(store.all()).toHaveLength(1);
    const states = [first, second].map((outcome) => (outcome.ok ? outcome.state : outcome.code));
    // One request owns the send; the other reports the claim as in hand and
    // pending confirmation. Neither reports a failure and neither resends.
    expect(states).toContain("submitted");
    expect(states).toContain("unconfirmed");
  });

  it("takes over a send whose process died, relying on the provider key for safety", async () => {
    const store = createMemoryProofSubmissionStore();
    let clock = Date.parse("2026-08-09T11:00:00.000Z");
    const { submit, sender } = buildService({ submissions: store, now: () => clock });

    // Simulate a crash after the pending row was written and before any state
    // change: the store keeps the row, nothing was recorded as sent.
    store.failNextWrite(2);
    await submit(request());
    expect(store.all()[0].internalEmailAcceptance).toBe("not_attempted");
    expect(sender.sent).toHaveLength(1);

    // Inside the lease, a retry does not resend.
    clock += 30_000;
    await submit(request());
    expect(sender.sent).toHaveLength(1);

    // Past the lease, the retry does send, and the provider idempotency key is
    // identical, so the provider is the layer that drops the duplicate.
    clock += 40_000;
    await submit(request());
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[0].idempotencyKey).toBe(sender.sent[1].idempotencyKey);
  });

  it("answers a later retry of the same claim without resending", async () => {
    const { submit, sender } = buildService();
    await submit(request());
    const again = await submit(request());

    expect(again).toMatchObject({ ok: true, state: "already_submitted" });
    expect(sender.sent).toHaveLength(1);
  });

  it("treats a genuinely different screenshot as a new claim", async () => {
    const { submit, sender, store } = buildService();
    await submit(request());
    const second = await submit(
      request({ bytes: validJpeg(), declaredContentType: "image/jpeg", declaredFilename: "b.jpg" }),
    );

    expect(second).toMatchObject({ ok: true, state: "submitted" });
    expect(sender.sent).toHaveLength(2);
    expect(store.all()).toHaveLength(2);
  });

  it("presents a deterministic provider idempotency key so the provider dedupes too", async () => {
    const { submit, sender } = buildService();
    await submit(request());
    const expected = proofProviderIdempotencyKey(
      proofSubmissionId({
        cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
        proofSha256: (await import("node:crypto"))
          .createHash("sha256")
          .update(validPng())
          .digest("hex"),
        method: "zelle",
      }),
    );
    expect(sender.sent[0].idempotencyKey).toBe(expected);
  });
});

describe("provider accepted but the confirmation write failed", () => {
  it("reports the proof as received and never as failed", async () => {
    const store = createMemoryProofSubmissionStore();
    const { submit, sender } = buildService({ submissions: store });
    // Both the primary write and the fallback write fail.
    store.failNextWrite(2);

    const outcome = await submit(request());

    expect(sender.sent).toHaveLength(1);
    expect(outcome).toMatchObject({ ok: true, state: "unconfirmed" });
    if (!outcome.ok) return;
    // The contract's decision: unconfirmed asks the customer to retry, which
    // is true and actionable, and never claims no internal email exists.
    expect(customerSubmissionView(outcome.row).state).toBe("needs_retry");
    expect(customerSubmissionView(outcome.row).retryAllowed).toBe(true);
  });

  it("leaves a durable row behind, because the pending row was written first", async () => {
    const store = createMemoryProofSubmissionStore();
    const { submit } = buildService({ submissions: store });
    store.failNextWrite(2);

    await submit(request());

    // The row exists and is not lost, which is what makes reconciliation
    // possible at all. Its state is the pre-send one, which is exactly the
    // "a send was attempted and we do not know what happened" signal.
    expect(store.all()).toHaveLength(1);
    expect(store.all()[0].internalEmailAcceptance).toBe("not_attempted");
  });

  it("records confirmation_unknown when only the primary write fails", async () => {
    const store = createMemoryProofSubmissionStore();
    const { submit } = buildService({ submissions: store });
    store.failNextWrite(1);

    const outcome = await submit(request());

    expect(outcome).toMatchObject({ ok: true, state: "unconfirmed" });
    expect(store.all()[0].internalEmailAcceptance).toBe("unknown");
  });

  it("lets a customer retry an unknown submission, and the provider dedupes it", async () => {
    const store = createMemoryProofSubmissionStore();
    let clock = Date.parse("2026-08-09T11:00:00.000Z");
    const { submit, sender } = buildService({ submissions: store, now: () => clock });
    store.failNextWrite(1);
    await submit(request());
    expect(store.all()[0].internalEmailAcceptance).toBe("unknown");

    // An unknown acceptance is deliberately NOT terminal: the customer holds
    // the bytes and can send them again. Safety comes from the identity, not
    // from refusing the retry.
    clock += 61_000;
    const retry = await submit(request());
    expect(retry).toMatchObject({ ok: true, state: "submitted" });
    expect(sender.sent).toHaveLength(2);
    expect(sender.sent[0].idempotencyKey).toBe(sender.sent[1].idempotencyKey);
  });

  it("refuses a submission whose agreements are no longer current", async () => {
    const { submit, sender } = buildService({ agreements: satisfiedAgreements(false) });
    await expect(submit(request())).resolves.toEqual({
      ok: false,
      code: "agreements_not_current",
    });
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses when the legal binding points at a member who does not own the checkout", async () => {
    const { submit, sender } = buildService({ bindings: boundDirectory({ owns: false }) });
    await expect(submit(request())).resolves.toEqual({
      ok: false,
      code: "binding_owner_mismatch",
    });
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses when no legal binding exists", async () => {
    const { submit, sender } = buildService({
      bindings: {
        async forCustomer() {
          return { ok: false as const, code: "binding_absent" as const };
        },
        async ownsCheckout() {
          return true;
        },
      },
    });
    await expect(submit(request())).resolves.toEqual({ ok: false, code: "binding_absent" });
    expect(sender.sent).toHaveLength(0);
  });
});

describe("network ambiguity and clean refusal are different states", () => {
  it("treats a thrown transport error as ambiguous, not as failure", async () => {
    const sender: InternalOrderEmailSender = {
      async send() {
        throw new Error("socket hang up");
      },
    };
    const store = createMemoryProofSubmissionStore();
    const { submit } = buildService({ sender, submissions: store });

    const outcome = await submit(request());
    expect(outcome).toMatchObject({ ok: true, state: "unconfirmed" });
    expect(store.all()[0].internalEmailAcceptance).toBe("unknown");
  });

  it("treats a clean provider refusal as a retryable failure", async () => {
    const sender = recordingSender(async () => ({ outcome: "refused" as const }));
    const store = createMemoryProofSubmissionStore();
    const { submit } = buildService({ sender, submissions: store });

    await expect(submit(request())).resolves.toEqual({ ok: false, code: "send_failed" });
    expect(store.all()[0].internalEmailAcceptance).toBe("failed");
  });

  it("lets a customer retry after a clean refusal, and that retry does send", async () => {
    let calls = 0;
    const sender = recordingSender(async () =>
      calls++ === 0 ? { outcome: "refused" as const } : { outcome: "accepted" as const, providerMessageId: "prov_9" },
    );
    const { submit } = buildService({ sender });

    await submit(request());
    const retry = await submit(request());

    expect(retry).toMatchObject({ ok: true, state: "submitted" });
    expect(sender.sent).toHaveLength(2);
  });
});

describe("ownership, state and abuse", () => {
  it("answers a checkout that is not the caller's exactly as it answers an unknown one", async () => {
    const { submit } = buildService();
    const foreign = await submit(request({ customer: { customerRef: "cust_other" } }));
    const unknown = await submit(request({ cartCheckoutNumber: "XEAC-2026-9999" }));
    expect(foreign).toEqual({ ok: false, code: "not_found" });
    expect(unknown).toEqual({ ok: false, code: "not_found" });
  });

  it("admits an alias of the same customer", async () => {
    const { submit } = buildService();
    const outcome = await submit(
      request({ customer: { customerRef: "cust_new", aliases: ["cust_alpha"] } }),
    );
    expect(outcome).toMatchObject({ ok: true });
  });

  it("refuses once payment is no longer open", async () => {
    const { submit, sender } = buildService({
      checkouts: {
        async byCheckoutNumber() {
          return { ...CHECKOUT, paymentState: "payment_verified" as const };
        },
      },
    });
    await expect(submit(request())).resolves.toEqual({ ok: false, code: "payment_closed" });
    expect(sender.sent).toHaveLength(0);
  });

  it("refuses a superseded checkout", async () => {
    const { submit } = buildService({
      checkouts: {
        async byCheckoutNumber() {
          return { ...CHECKOUT, disposition: "duplicate_superseded" as const };
        },
      },
    });
    await expect(submit(request())).resolves.toEqual({ ok: false, code: "checkout_superseded" });
  });

  it("rate limits one customer without affecting the shared capacity", async () => {
    const limiter = createSubmissionRateLimiter(2, 60_000);
    const { submit, sender } = buildService({ rateLimiter: limiter });

    await submit(request());
    await submit(request({ bytes: validJpeg(), declaredContentType: "image/jpeg" }));
    const third = await submit(request({ bytes: validPng(8), declaredFilename: "c.png" }));

    expect(third).toEqual({ ok: false, code: "rate_limited" });
    expect(sender.sent).toHaveLength(2);
  });

  it("refuses rather than queueing without end when send capacity is exhausted", async () => {
    const semaphore = createSendSemaphore(1, 0);
    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const sender: InternalOrderEmailSender = {
      async send() {
        await blocked;
        return { outcome: "accepted", providerMessageId: "prov_slow" };
      },
    };
    const { submit } = buildService({ semaphore, sender, rateLimiter: createSubmissionRateLimiter(50, 60_000) });

    const first = submit(request());
    await new Promise((resolve) => setTimeout(resolve, 0));
    const second = await submit(
      request({ bytes: validJpeg(), declaredContentType: "image/jpeg", declaredFilename: "d.jpg" }),
    );

    expect(second).toEqual({ ok: false, code: "capacity_exhausted" });
    release();
    await expect(first).resolves.toMatchObject({ ok: true });
  });

  it("cannot settle, verify or release anything", async () => {
    const { submit } = buildService();
    const outcome = await submit(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(Object.keys(outcome.row)).not.toContain("paid");
    expect(Object.keys(outcome.row)).not.toContain("verified");
    expect(Object.keys(outcome.row)).not.toContain("supplierReleased");
    expect(Object.keys(outcome.row)).not.toContain("settlementId");
  });
});

describe("the customer projection discloses nothing internal", () => {
  it("omits every internal field, checked deeply", async () => {
    const { submit } = buildService();
    const outcome = await submit(request());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const view = customerSubmissionView(outcome.row);
    const serialized = JSON.stringify(view);

    for (const key of EARLY_ACCESS_SUBMISSION_FORBIDDEN_CUSTOMER_KEYS) {
      expect(serialized, `leaked ${key}`).not.toContain(`"${key}"`);
    }
    expect(customerPayloadIsClean(view)).toBe(true);
    expect(serialized).not.toContain("prov_123");
    expect(serialized).not.toContain(INTERNAL_ORDER_EMAIL_RECIPIENT);
    expect(serialized).not.toContain("gov-fingerprint-abc");
    expect(serialized).not.toContain("cust_alpha");
  });
});

describe("internal recipient", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("is exactly research@xeniostechnology.com", () => {
    expect(INTERNAL_ORDER_EMAIL_RECIPIENT).toBe("research@xeniostechnology.com");
  });
});
