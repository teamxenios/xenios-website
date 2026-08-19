import { describe, expect, it, vi } from "vitest";
import type { AssistedOrderViewer } from "../ports";
import { InMemoryAssistedOrderQuoteRepository } from "./memory-repository";
import type { AssistedOrderQuoteDependencies } from "./ports";
import {
  AssistedOrderQuoteAuthorizationError,
  AssistedOrderQuoteConflictError,
  AssistedOrderQuoteNotFoundError,
  AssistedOrderQuoteService,
  AssistedOrderQuoteValidationError,
} from "./service";

const REQUEST_ID = "00000000-0000-4000-8000-000000000001";
const REFERENCE = "XRR-20260819-ABCDEF0123";

const memberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "11111111-1111-4111-8111-111111111111",
  earlyAccessSessionHash: null,
  normalizedEmail: "member@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
});

const otherMemberViewer: AssistedOrderViewer = Object.freeze({
  actorType: "member",
  memberId: "22222222-2222-4222-8222-222222222222",
  earlyAccessSessionHash: null,
  normalizedEmail: "other@example.com",
  capabilities: new Set(["assisted_orders:submit", "assisted_orders:read_own"]),
});

const adminViewer: AssistedOrderViewer = Object.freeze({
  actorType: "admin",
  memberId: null,
  earlyAccessSessionHash: null,
  normalizedEmail: "ops@xeniostechnology.com",
  actorLabel: "ops@xeniostechnology.com",
  capabilities: new Set([
    "assisted_orders:read_all",
    "assisted_orders:manage",
  ]),
});

function harness(options: {
  now?: string;
  pricedUnitCents?: number | null;
} = {}) {
  const repository = new InMemoryAssistedOrderQuoteRepository();
  const audit = vi.fn(async () => undefined);
  let sequence = 0;
  let nowIso = options.now ?? "2026-08-19T12:00:00.000Z";
  const binding = {
    requestId: REQUEST_ID,
    publicReference: REFERENCE,
    actorMemberId: memberViewer.memberId,
    earlyAccessSessionHash: null,
    normalizedEmail: "member@example.com",
  };
  const deps: AssistedOrderQuoteDependencies = {
    repository,
    requests: {
      bindingFor: async (requestId) =>
        requestId === REQUEST_ID ? binding : null,
      byPublicReference: async (reference) =>
        reference === REFERENCE ? binding : null,
    },
    requestLines: {
      linesFor: async () => [
        {
          lineId: "line-priced",
          productId: "pc_product_1",
          variantId: "pc_variant_1",
          productName: "BPC-157",
          specification: "5 mg vial",
          quantity: 2,
          unitPriceCents:
            options.pricedUnitCents === undefined ? 9900 : options.pricedUnitCents,
          currency: "USD",
        },
        {
          lineId: "line-pending",
          productId: "pc_product_2",
          variantId: "pc_variant_2",
          productName: "Research Buffer",
          specification: null,
          quantity: 1,
          unitPriceCents: null,
          currency: "USD",
        },
      ],
    },
    audit: { record: audit },
    clock: { now: () => new Date(nowIso) },
    ids: {
      uuid: () => {
        sequence += 1;
        return `00000000-0000-4000-8000-${String(sequence).padStart(12, "0")}`;
      },
    },
  };
  return {
    service: new AssistedOrderQuoteService(deps),
    repository,
    audit,
    setNow: (iso: string) => {
      nowIso = iso;
    },
  };
}

const VALID_UNTIL = "2026-08-26T12:00:00.000Z";

describe("AssistedOrderQuoteService.issue", () => {
  it("prices catalog lines from the stored authoritative price and pending lines from the admin with a basis", async () => {
    const h = harness();
    const view = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [
        { requestLineId: "line-priced" },
        { requestLineId: "line-pending", unitPriceCents: 4500, pricingBasis: "supplier quote SQ-118" },
      ],
      validUntil: VALID_UNTIL,
    });
    expect(view.totalCents).toBe(2 * 9900 + 4500);
    expect(view.lines.map((line) => line.priceSource)).toEqual(["catalog", "quoted"]);
    expect(view.state).toBe("issued");
    // The internal pricing basis never enters the customer projection.
    expect(JSON.stringify(view)).not.toContain("SQ-118");
    expect(JSON.stringify(view).toLowerCase()).not.toContain("pricingbasis");
  });

  it("refuses an admin price on a line that already carries the authoritative price", async () => {
    const h = harness();
    await expect(
      h.service.issue(adminViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-priced", unitPriceCents: 1, pricingBasis: "x" }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteValidationError);
  });

  it("refuses a price-pending line without a positive admin price and recorded basis", async () => {
    const h = harness();
    await expect(
      h.service.issue(adminViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-pending" }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteValidationError);
    await expect(
      h.service.issue(adminViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-pending", unitPriceCents: 0, pricingBasis: "b" }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteValidationError);
    await expect(
      h.service.issue(adminViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-pending", unitPriceCents: 4500 }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteValidationError);
  });

  it("supersedes the previous issued quote and bumps the version", async () => {
    const h = harness();
    const first = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    const second = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    expect(second.version).toBe(first.version + 1);
    const all = await h.service.forRequest(memberViewer, REFERENCE);
    expect(all.map((quote) => quote.state)).toEqual(["superseded", "issued"]);
  });

  it("requires the manage capability", async () => {
    const h = harness();
    await expect(
      h.service.issue(memberViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-priced" }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteAuthorizationError);
  });
});

describe("AssistedOrderQuoteService.accept", () => {
  it("accepts the exact issued quote, mints evidence, and replays identically", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    const acceptance = await h.service.accept(memberViewer, REFERENCE, {
      quoteId: quote.quoteId,
      version: quote.version,
      expectedTotalCents: quote.totalCents,
    });
    expect(acceptance.replayed).toBe(false);
    expect(acceptance.acceptanceId).toBeTruthy();

    const replay = await h.service.accept(memberViewer, REFERENCE, {
      quoteId: quote.quoteId,
      version: quote.version,
      expectedTotalCents: quote.totalCents,
    });
    expect(replay.replayed).toBe(true);
    expect(replay.acceptanceId).toBe(acceptance.acceptanceId);
  });

  it("refuses a stale version or total with QUOTE_CHANGED", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    await expect(
      h.service.accept(memberViewer, REFERENCE, {
        quoteId: quote.quoteId,
        version: quote.version,
        expectedTotalCents: quote.totalCents + 1,
      }),
    ).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
    await expect(
      h.service.accept(memberViewer, REFERENCE, {
        quoteId: quote.quoteId,
        version: quote.version + 1,
        expectedTotalCents: quote.totalCents,
      }),
    ).rejects.toMatchObject({ code: "QUOTE_CHANGED" });
  });

  it("refuses acceptance after expiry and records the lazy transition", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    h.setNow("2026-08-27T12:00:00.000Z");
    await expect(
      h.service.accept(memberViewer, REFERENCE, {
        quoteId: quote.quoteId,
        version: quote.version,
        expectedTotalCents: quote.totalCents,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteConflictError);
    const all = await h.service.forRequest(memberViewer, REFERENCE);
    expect(all[0].state).toBe("expired");
  });

  it("collapses a cross-customer acceptance into not-found", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    await expect(
      h.service.accept(otherMemberViewer, REFERENCE, {
        quoteId: quote.quoteId,
        version: quote.version,
        expectedTotalCents: quote.totalCents,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteNotFoundError);
  });

  it("blocks issuing a new quote while one is accepted", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    await h.service.accept(memberViewer, REFERENCE, {
      quoteId: quote.quoteId,
      version: quote.version,
      expectedTotalCents: quote.totalCents,
    });
    await expect(
      h.service.issue(adminViewer, {
        requestId: REQUEST_ID,
        lines: [{ requestLineId: "line-priced" }],
        validUntil: VALID_UNTIL,
      }),
    ).rejects.toMatchObject({ code: "quote_already_accepted" });
  });
});

describe("AssistedOrderQuoteService.decline and withdraw", () => {
  it("lets the owner decline an issued quote, once", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    const declined = await h.service.decline(memberViewer, REFERENCE, quote.quoteId);
    expect(declined.state).toBe("declined");
    await expect(
      h.service.decline(memberViewer, REFERENCE, quote.quoteId),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteConflictError);
  });

  it("lets an admin withdraw an issued quote and nobody accept it afterwards", async () => {
    const h = harness();
    const quote = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-priced" }],
      validUntil: VALID_UNTIL,
    });
    const withdrawn = await h.service.withdraw(adminViewer, quote.quoteId);
    expect(withdrawn.state).toBe("withdrawn");
    await expect(
      h.service.accept(memberViewer, REFERENCE, {
        quoteId: quote.quoteId,
        version: quote.version,
        expectedTotalCents: quote.totalCents,
      }),
    ).rejects.toBeInstanceOf(AssistedOrderQuoteConflictError);
  });

  it("keeps the customer view free of internal notes", async () => {
    const h = harness();
    const view = await h.service.issue(adminViewer, {
      requestId: REQUEST_ID,
      lines: [{ requestLineId: "line-pending", unitPriceCents: 4500, pricingBasis: "wholesale ledger row 4" }],
      validUntil: VALID_UNTIL,
      customerNote: "Payment instructions follow on acceptance.",
      internalNote: "margin check pending",
    });
    const surface = JSON.stringify(view).toLowerCase();
    expect(surface).not.toContain("wholesale");
    expect(surface).not.toContain("margin");
    expect(surface).not.toContain("internalnote");
    expect(view.customerNote).toBe("Payment instructions follow on acceptance.");
  });
});
