import { describe, expect, it } from "vitest";
import type {
  CartPriceSnapshot,
  CustomerPriceAudience,
  OrderLinePriceSnapshot,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  authorizeAudienceFromServerIdentity,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import type {
  CartPriceBindingDeps,
  VariantIdentity,
} from "./cart-price-binding";
import {
  computeQuoteHash,
  recomputeCheckout,
  type CheckoutPriceQuote,
} from "./checkout-recompute";
import {
  snapshotOrderLinesFromQuote,
  toOrderLinePriceColumns,
  toOrderLinePriceColumnRows,
} from "./order-price-snapshot";

const AT = "2026-07-28T12:00:00+00:00";
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

const VARIANT_A: VariantIdentity = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  displayName: "Product A / Variant A",
};

const VARIANT_B: VariantIdentity = {
  productId: "product-b",
  variantId: "variant-b",
  sku: "SKU-B",
  displayName: "Product B / Variant B",
};

function audience(kind: CustomerPriceAudience = "retail"): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: kind,
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

function makeDeps(): CartPriceBindingDeps {
  const variantsBySku = new Map([
    [VARIANT_A.sku, VARIANT_A],
    [VARIANT_B.sku, VARIANT_B],
  ]);
  const rows = [
    {
      priceId: UUID_A,
      productId: "product-a",
      variantId: "variant-a",
      amountCents: 14900,
      version: 2,
    },
    {
      priceId: UUID_B,
      productId: "product-b",
      variantId: "variant-b",
      amountCents: 5000,
      version: 1,
    },
  ];
  return {
    variants: {
      async findVariantBySku(sku) {
        return variantsBySku.get(sku) ?? null;
      },
    },
    priceResolver: {
      async resolveApprovedResearchPrice(input) {
        if (parseProductControlTimestamp(input.at) === null) {
          return { state: "unavailable", reason: "price_missing" };
        }
        const row = rows.find(
          (candidate) =>
            candidate.productId === input.productId &&
            candidate.variantId === input.variantId,
        );
        if (row === undefined) {
          return { state: "unavailable", reason: "price_missing" };
        }
        return {
          state: "available",
          price: {
            priceId: row.priceId,
            productId: row.productId,
            variantId: row.variantId,
            audience: input.authenticatedAudience.audience,
            amountCents: row.amountCents,
            currency: "USD",
            effectiveAt: "2026-07-01T00:00:00+00:00",
            expiresAt: null,
            version: row.version,
          },
        };
      },
    },
  };
}

async function genuineQuote(): Promise<CheckoutPriceQuote> {
  const result = await recomputeCheckout(
    {
      serverLines: [
        { sku: "SKU-A", quantity: 2 },
        { sku: "SKU-B", quantity: 1 },
      ],
      presented: {
        lines: [
          {
            sku: "SKU-A",
            quantity: 2,
            unitAmountCents: 14900,
            lineTotalCents: 29800,
            priceVersion: 2,
          },
          {
            sku: "SKU-B",
            quantity: 1,
            unitAmountCents: 5000,
            lineTotalCents: 5000,
            priceVersion: 1,
          },
        ],
        subtotalCents: 34800,
        currency: "USD",
      },
      authenticatedAudience: audience(),
      currency: "USD",
      at: AT,
    },
    makeDeps(),
  );
  if (result.state !== "quoted") {
    throw new Error(`expected a quote, got ${JSON.stringify(result)}`);
  }
  return result.quote;
}

/**
 * Rebuild a quote with a mutation applied and the hash HONESTLY recomputed
 * over the mutated content. This simulates an attacker (or a bug) that can
 * also recompute hashes, so the structural checks must stand on their own.
 */
function reforge(
  quote: CheckoutPriceQuote,
  mutate: (draft: {
    lines: CartPriceSnapshot[];
    subtotalCents: number;
    currency: string;
    quotedAt: string;
  }) => void,
): CheckoutPriceQuote {
  const draft = {
    lines: quote.lines.map((line) => ({ ...line })),
    subtotalCents: quote.subtotalCents,
    currency: quote.currency as string,
    quotedAt: quote.quotedAt,
  };
  mutate(draft);
  return {
    lines: draft.lines,
    subtotalCents: draft.subtotalCents,
    currency: draft.currency,
    quotedAt: draft.quotedAt,
    quoteHash: computeQuoteHash(
      draft.lines,
      draft.subtotalCents,
      draft.currency as CheckoutPriceQuote["currency"],
      draft.quotedAt,
    ),
  } as CheckoutPriceQuote;
}

describe("snapshotOrderLinesFromQuote", () => {
  it("snapshots every line with agreedAt stamped from the quote", async () => {
    const quote = await genuineQuote();
    const result = snapshotOrderLinesFromQuote(quote);
    expect(result.state).toBe("complete");
    if (result.state !== "complete") return;
    expect(result.lines).toHaveLength(2);
    expect(result.lines[0]).toEqual({
      productId: "product-a",
      variantId: "variant-a",
      sku: "SKU-A",
      displayName: "Product A / Variant A",
      priceId: UUID_A,
      priceVersion: 2,
      audience: "retail",
      currency: "USD",
      unitAmountCents: 14900,
      quantity: 2,
      lineTotalCents: 29800,
      effectiveAt: "2026-07-01T00:00:00+00:00",
      expiresAt: null,
      agreedAt: AT,
    });
    for (const line of result.lines) {
      expect(line.agreedAt).toBe(quote.quotedAt);
      expect(Object.isFrozen(line)).toBe(true);
    }
    expect(Object.isFrozen(result.lines)).toBe(true);
  });

  it("the historical record is immutable: writes throw", async () => {
    const quote = await genuineQuote();
    const result = snapshotOrderLinesFromQuote(quote);
    if (result.state !== "complete") throw new Error("expected complete");
    const line = result.lines[0] as { unitAmountCents: number };
    expect(() => {
      line.unitAmountCents = 1;
    }).toThrow(TypeError);
  });

  it("refuses a quote whose hash does not recompute", async () => {
    const quote = await genuineQuote();
    const tampered = {
      ...quote,
      lines: quote.lines.map((line) =>
        line.sku === "SKU-A"
          ? { ...line, priceId: "99999999-9999-4999-8999-999999999999" }
          : line,
      ),
    } as CheckoutPriceQuote;
    expect(snapshotOrderLinesFromQuote(tampered)).toEqual({
      state: "refused",
      reason: "quote_hash_mismatch",
    });
  });

  it("refuses partial lineage: one bad line refuses the whole quote", async () => {
    const quote = await genuineQuote();
    const cases = [
      reforge(quote, (draft) => {
        draft.lines[0].unitAmountCents = -1;
      }),
      reforge(quote, (draft) => {
        draft.lines[0].lineTotalCents = draft.lines[0].lineTotalCents + 1;
      }),
      reforge(quote, (draft) => {
        draft.lines[1].priceVersion = 0;
      }),
      reforge(quote, (draft) => {
        (draft.lines[1] as { audience: string }).audience = "compare_at";
      }),
      reforge(quote, (draft) => {
        draft.lines[0].pricedAt = "2026-07-28T13:00:00+00:00";
      }),
    ];
    for (const tampered of cases) {
      const result = snapshotOrderLinesFromQuote(tampered);
      expect(result).toEqual({ state: "refused", reason: "line_malformed" });
    }
  });

  it("refuses a subtotal that does not equal the line sum", async () => {
    const quote = await genuineQuote();
    const tampered = reforge(quote, (draft) => {
      draft.subtotalCents = draft.subtotalCents + 100;
    });
    expect(snapshotOrderLinesFromQuote(tampered)).toEqual({
      state: "refused",
      reason: "subtotal_mismatch",
    });
  });

  it("refuses empty and structurally malformed quotes", async () => {
    const quote = await genuineQuote();
    expect(
      snapshotOrderLinesFromQuote(
        reforge(quote, (draft) => {
          draft.lines.length = 0;
          draft.subtotalCents = 100;
        }),
      ),
    ).toEqual({ state: "refused", reason: "quote_empty" });

    const malformed: unknown[] = [
      null,
      "quote",
      { ...quote, subtotalCents: 0 },
      { ...quote, subtotalCents: -34800 },
      { ...quote, subtotalCents: 1.5 },
      { ...quote, quoteHash: "" },
      reforge(quote, (draft) => {
        draft.currency = "EUR";
      }),
      reforge(quote, (draft) => {
        draft.quotedAt = "not-a-time";
      }),
    ];
    for (const candidate of malformed) {
      expect(
        snapshotOrderLinesFromQuote(candidate as CheckoutPriceQuote),
      ).toEqual({ state: "refused", reason: "quote_malformed" });
    }
  });

  it("refuses a line whose currency escapes the allowlist", async () => {
    const quote = await genuineQuote();
    const tampered = reforge(quote, (draft) => {
      (draft.lines[0] as { currency: string }).currency = "EUR";
    });
    // The shared snapshot guard catches the off-allowlist currency first;
    // either way, nothing is snapshotted.
    expect(snapshotOrderLinesFromQuote(tampered)).toEqual({
      state: "refused",
      reason: "line_malformed",
    });
  });

  it("never emits the legacy -1 sentinel from any refusal", async () => {
    const quote = await genuineQuote();
    const tampered = reforge(quote, (draft) => {
      draft.lines[0].unitAmountCents = -1;
      draft.lines[0].lineTotalCents = -2;
    });
    const result = snapshotOrderLinesFromQuote(tampered);
    expect(result.state).toBe("refused");
    expect(JSON.stringify(result)).not.toContain("-1");
  });
});

describe("toOrderLinePriceColumns", () => {
  async function orderLines(): Promise<readonly OrderLinePriceSnapshot[]> {
    const result = snapshotOrderLinesFromQuote(await genuineQuote());
    if (result.state !== "complete") throw new Error("expected complete");
    return result.lines;
  }

  it("maps to exactly the six database columns, all non-null", async () => {
    const [first] = await orderLines();
    const mapped = toOrderLinePriceColumns(first);
    expect(mapped).toEqual({
      state: "mapped",
      columns: {
        price_id: UUID_A,
        price_version: 2,
        audience: "retail",
        unit_amount_cents: 14900,
        currency: "USD",
        priced_at: AT,
      },
    });
    if (mapped.state !== "mapped") return;
    expect(Object.keys(mapped.columns)).toHaveLength(6);
    for (const value of Object.values(mapped.columns)) {
      expect(value).not.toBeNull();
      expect(value).not.toBeUndefined();
    }
    expect(mapped.columns.price_version).toBeGreaterThan(0);
    expect(mapped.columns.unit_amount_cents).toBeGreaterThan(0);
    expect(Object.isFrozen(mapped.columns)).toBe(true);
  });

  it("refuses a non-uuid price id rather than failing in the database", async () => {
    const [first] = await orderLines();
    const nonUuid = { ...first, priceId: "price-a" };
    expect(toOrderLinePriceColumns(nonUuid)).toEqual({
      state: "refused",
      reason: "price_id_not_uuid",
    });
  });

  it("refuses malformed lines, including any -1 sentinel", async () => {
    const [first] = await orderLines();
    const cases: unknown[] = [
      { ...first, unitAmountCents: -1 },
      { ...first, unitAmountCents: 0 },
      { ...first, priceVersion: -1 },
      { ...first, currency: "EUR" },
      { ...first, agreedAt: "" },
      null,
    ];
    for (const candidate of cases) {
      expect(
        toOrderLinePriceColumns(candidate as OrderLinePriceSnapshot),
      ).toEqual({ state: "refused", reason: "line_malformed" });
    }
  });

  it("maps a whole order all-or-none, naming the refusing line", async () => {
    const lines = await orderLines();
    const happy = toOrderLinePriceColumnRows(lines);
    expect(happy.state).toBe("mapped");
    if (happy.state !== "mapped") return;
    expect(happy.rows).toHaveLength(2);
    expect(happy.rows.map((row) => row.price_id)).toEqual([UUID_A, UUID_B]);
    expect(Object.isFrozen(happy.rows)).toBe(true);

    const withBadLine = [lines[0], { ...lines[1], unitAmountCents: -1 }];
    expect(
      toOrderLinePriceColumnRows(withBadLine as OrderLinePriceSnapshot[]),
    ).toEqual({ state: "refused", reason: "line_malformed", index: 1 });

    const withNonUuid = [{ ...lines[0], priceId: "legacy-1" }, lines[1]];
    expect(
      toOrderLinePriceColumnRows(withNonUuid as OrderLinePriceSnapshot[]),
    ).toEqual({ state: "refused", reason: "price_id_not_uuid", index: 0 });
  });
});
