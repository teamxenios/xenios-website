/**
 * The legacy order-lifecycle notifier: mail rides the durable outbox family,
 * keyed by durable commerce identities, and can never refuse money. The
 * projections are injected, so every assertion here is about WHAT the
 * notifier asks the family to send and what happens when the family fails.
 */
import { describe, expect, it, vi } from "vitest";

import type { EarlyAccessPlacement, EarlyAccessSettlement } from "../routes/store";
import {
  NO_LEGACY_ORDER_NOTIFIER,
  createOutboxLegacyOrderNotifier,
  type LegacyOrderProjections,
} from "./legacy-order-notifier";

const ORDER_NUMBER = "XEC-TEST-0001";

function placement(overrides: Record<string, unknown> = {}): EarlyAccessPlacement {
  return {
    orderNumber: ORDER_NUMBER,
    customerRef: "eac_" + "a".repeat(32),
    idempotencyKey: "idem-ea-0001-000001",
    order: {
      idempotencyKey: "idem-ea-0001-000001",
      releaseId: "rel_ea_0001",
      money: { payableTotalCents: 2_464, currency: "USD" },
      order: {
        orderId: ORDER_NUMBER,
        customerRef: "eac_" + "a".repeat(32),
        status: "awaiting_payment",
        currency: "USD",
        line: { sku: "XEA-AOD-5MG", quantity: 1, unitPriceCents: 2_464 },
        money: { payableTotalCents: 2_464, currency: "USD" },
      },
    },
    invoice: { invoiceNumber: "XEI-TEST-0001", paymentReference: "XRM-TEST-0001" },
    contact: { email: "kris@example.com", phone: "+15550000000" },
    ...overrides,
  } as unknown as EarlyAccessPlacement;
}

function settlement(): EarlyAccessSettlement {
  return {
    orderNumber: ORDER_NUMBER,
    verification: { amountVerifiedCents: 2_464 },
    receipt: { receiptId: "XER-TEST-0001" },
  } as unknown as EarlyAccessSettlement;
}

function projections() {
  return {
    placed: vi.fn(async () => true),
    submitted: vi.fn(async () => true),
    verified: vi.fn(async () => true),
  } satisfies Record<keyof LegacyOrderProjections, ReturnType<typeof vi.fn>>;
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("the legacy order lifecycle notifier", () => {
  it("projects the placed order with the durable identities and the reduced payment shape", async () => {
    const fakes = projections();
    const notifier = createOutboxLegacyOrderNotifier({
      projections: fakes as unknown as LegacyOrderProjections,
      siteUrl: "https://xeniostechnology.com/",
      warn: () => {},
    });
    notifier.orderPlaced(placement());
    await flush();
    expect(fakes.placed).toHaveBeenCalledTimes(1);
    const input = fakes.placed.mock.calls[0][0] as Record<string, unknown>;
    expect(input.cartCheckoutNumber).toBe(ORDER_NUMBER);
    expect(input.recipientEmail).toBe("kris@example.com");
    expect(input.invoiceNumber).toBe("XEI-TEST-0001");
    expect(input.statusUrl).toBe("https://xeniostechnology.com/research/early-access");
    expect(input.payment).toEqual({
      amountDueDisplay: "$24.64 USD",
      paymentReference: "XRM-TEST-0001",
      methodLabels: [],
    });
    // No destination, no supplier, no proof material in the projection input.
    expect(JSON.stringify(input).toLowerCase()).not.toMatch(
      /destination|supplier|zelle|cashtag|routing/,
    );
  });

  it("keys the submission mail by the proof id", async () => {
    const fakes = projections();
    const notifier = createOutboxLegacyOrderNotifier({
      projections: fakes as unknown as LegacyOrderProjections,
      warn: () => {},
    });
    notifier.proofSubmitted(placement(), "eaproofid.abc123");
    await flush();
    expect(fakes.submitted).toHaveBeenCalledTimes(1);
    const input = fakes.submitted.mock.calls[0][0] as Record<string, unknown>;
    expect(input.proofId).toBe("eaproofid.abc123");
    expect(input.orderNumber).toBe(ORDER_NUMBER);
    expect(input.paymentReference).toBe("XRM-TEST-0001");
  });

  it("keys the confirmation mail by the order number with the verified amount", async () => {
    const fakes = projections();
    const notifier = createOutboxLegacyOrderNotifier({
      projections: fakes as unknown as LegacyOrderProjections,
      warn: () => {},
    });
    notifier.paymentVerified(placement(), settlement());
    await flush();
    expect(fakes.verified).toHaveBeenCalledTimes(1);
    const input = fakes.verified.mock.calls[0][0] as Record<string, unknown>;
    expect(input.settlementIdentity).toBe(ORDER_NUMBER);
    expect(input.verifiedAmountDisplay).toBe("$24.64 USD");
    expect(input.receiptNumber).toBe("XER-TEST-0001");
  });

  it("NEVER throws into the caller: a rejecting projection is a log line, not an error", async () => {
    const warned: string[] = [];
    const notifier = createOutboxLegacyOrderNotifier({
      projections: {
        placed: vi.fn(async () => {
          throw new Error("outbox down");
        }),
        submitted: vi.fn(async () => false),
        verified: vi.fn(async () => true),
      } as unknown as LegacyOrderProjections,
      warn: (message) => warned.push(message),
    });
    expect(() => notifier.orderPlaced(placement())).not.toThrow();
    expect(() => notifier.proofSubmitted(placement(), "p1")).not.toThrow();
    await flush();
    expect(warned.some((m) => m.includes("outbox down"))).toBe(true);
    expect(warned.some((m) => m.includes("not queued"))).toBe(true);
  });

  it("mails nobody when the placement carries no contact", async () => {
    const fakes = projections();
    const notifier = createOutboxLegacyOrderNotifier({
      projections: fakes as unknown as LegacyOrderProjections,
      warn: () => {},
    });
    notifier.orderPlaced(placement({ contact: undefined }));
    notifier.proofSubmitted(placement({ contact: undefined }), "p1");
    notifier.paymentVerified(placement({ contact: undefined }), settlement());
    await flush();
    expect(fakes.placed).not.toHaveBeenCalled();
    expect(fakes.submitted).not.toHaveBeenCalled();
    expect(fakes.verified).not.toHaveBeenCalled();
  });

  it("the default notifier does nothing at all", () => {
    expect(() => NO_LEGACY_ORDER_NOTIFIER.orderPlaced(placement())).not.toThrow();
    expect(() => NO_LEGACY_ORDER_NOTIFIER.proofSubmitted(placement(), "p1")).not.toThrow();
    expect(() => NO_LEGACY_ORDER_NOTIFIER.paymentVerified(placement(), settlement())).not.toThrow();
  });
});
