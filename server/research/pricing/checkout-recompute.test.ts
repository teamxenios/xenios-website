import { describe, expect, it } from "vitest";
import type {
  CustomerPriceAudience,
  PriceResolution,
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
  type CheckoutRejection,
  type PresentedCartLine,
  type RecomputeCheckoutInput,
} from "./checkout-recompute";

const AT = "2026-07-28T12:00:00+00:00";
const LATER = "2026-07-28T18:00:00+00:00";
const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";

interface FakePriceRow {
  priceId: string;
  productId: string;
  variantId: string;
  audience: CustomerPriceAudience;
  amountCents: number;
  currency: string;
  effectiveAt: string;
  expiresAt: string | null;
  version: number;
}

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

function rowFor(
  variant: VariantIdentity,
  overrides: Partial<FakePriceRow> = {},
): FakePriceRow {
  return {
    priceId: variant.sku === "SKU-A" ? UUID_A : UUID_B,
    productId: variant.productId,
    variantId: variant.variantId,
    audience: "retail",
    amountCents: variant.sku === "SKU-A" ? 14900 : 5000,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    version: 2,
    ...overrides,
  };
}

/** In-memory fakes mirroring the pricing core's fail-closed window semantics. */
function makeDeps(config: {
  variants?: VariantIdentity[];
  rows?: FakePriceRow[];
  forceByVariant?: Record<string, PriceResolution>;
} = {}) {
  const variantsBySku = new Map(
    (config.variants ?? [VARIANT_A, VARIANT_B]).map((identity) => [
      identity.sku,
      identity,
    ]),
  );
  const rows = config.rows ?? [rowFor(VARIANT_A), rowFor(VARIANT_B)];
  const calls = { resolve: 0 };
  const deps: CartPriceBindingDeps = {
    variants: {
      async findVariantBySku(sku) {
        return variantsBySku.get(sku) ?? null;
      },
    },
    priceResolver: {
      async resolveApprovedResearchPrice(input) {
        calls.resolve += 1;
        const forced = config.forceByVariant?.[input.variantId];
        if (forced) return forced;
        const at = parseProductControlTimestamp(input.at);
        if (at === null) return { state: "unavailable", reason: "price_missing" };
        const candidates = rows.filter(
          (row) =>
            row.productId === input.productId &&
            row.variantId === input.variantId &&
            row.audience === input.authenticatedAudience.audience &&
            row.currency === input.currency,
        );
        if (candidates.length === 0) {
          return { state: "unavailable", reason: "price_missing" };
        }
        const inWindow = candidates.filter((row) => {
          const effectiveAt = parseProductControlTimestamp(row.effectiveAt);
          const expiresAt =
            row.expiresAt === null
              ? null
              : parseProductControlTimestamp(row.expiresAt);
          return (
            effectiveAt !== null &&
            effectiveAt <= at &&
            (expiresAt === null || expiresAt > at)
          );
        });
        if (inWindow.length === 0) {
          const anyFuture = candidates.some((row) => {
            const effectiveAt = parseProductControlTimestamp(row.effectiveAt);
            return effectiveAt !== null && effectiveAt > at;
          });
          return {
            state: "unavailable",
            reason: anyFuture ? "price_future" : "price_expired",
          };
        }
        if (inWindow.length > 1) {
          return { state: "ambiguous", reason: "price_ambiguous" };
        }
        const row = inWindow[0];
        return {
          state: "available",
          price: {
            priceId: row.priceId,
            productId: row.productId,
            variantId: row.variantId,
            audience: row.audience,
            amountCents: row.amountCents,
            currency: "USD",
            effectiveAt: row.effectiveAt,
            expiresAt: row.expiresAt,
            version: row.version,
          },
        };
      },
    },
  };
  return { deps, calls };
}

function audience(
  kind: CustomerPriceAudience = "retail",
  evaluatedAt: string = AT,
): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: kind,
    sourceVersion: "session-v1",
    evaluatedAt,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

/** The honest client claim for the default two-line fixture. */
function honestPresented(): PresentedCartLine[] {
  return [
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
      priceVersion: 2,
    },
  ];
}

function baseInput(
  overrides: Partial<RecomputeCheckoutInput> = {},
): RecomputeCheckoutInput {
  return {
    serverLines: [
      { sku: "SKU-B", quantity: 1 },
      { sku: "SKU-A", quantity: 2 },
    ],
    presented: {
      lines: honestPresented(),
      subtotalCents: 34800,
      currency: "USD",
    },
    authenticatedAudience: audience(),
    currency: "USD",
    at: AT,
    ...overrides,
  };
}

async function quoteOrThrow(
  input: RecomputeCheckoutInput,
  deps: CartPriceBindingDeps,
): Promise<CheckoutPriceQuote> {
  const result = await recomputeCheckout(input, deps);
  if (result.state !== "quoted") {
    throw new Error(`expected a quote, got ${JSON.stringify(result)}`);
  }
  return result.quote;
}

function reasonsOf(rejections: readonly CheckoutRejection[]): string[] {
  return rejections.map((entry) => entry.reason).sort();
}

describe("recomputeCheckout", () => {
  it("re-resolves every line, recomputes money server side, and emits a deterministic quote", async () => {
    const { deps } = makeDeps();
    const quote = await quoteOrThrow(baseInput(), deps);
    expect(quote.lines.map((line) => line.sku)).toEqual(["SKU-A", "SKU-B"]);
    expect(quote.subtotalCents).toBe(34800);
    expect(quote.currency).toBe("USD");
    expect(quote.quotedAt).toBe(AT);
    expect(quote.quoteHash).toMatch(/^[0-9a-f]{64}$/);
    expect(quote.lines[0]).toMatchObject({
      priceId: UUID_A,
      priceVersion: 2,
      unitAmountCents: 14900,
      quantity: 2,
      lineTotalCents: 29800,
      pricedAt: AT,
    });
  });

  it("emits an immutable quote", async () => {
    const { deps } = makeDeps();
    const quote = await quoteOrThrow(baseInput(), deps);
    expect(Object.isFrozen(quote)).toBe(true);
    expect(Object.isFrozen(quote.lines)).toBe(true);
    for (const line of quote.lines) expect(Object.isFrozen(line)).toBe(true);
    expect(() => {
      (quote as { subtotalCents: number }).subtotalCents = 1;
    }).toThrow(TypeError);
    expect(() => {
      (quote.lines[0] as { unitAmountCents: number }).unitAmountCents = 1;
    }).toThrow(TypeError);
  });

  it("hashes stably: the same cart at the same instant always hashes identically", async () => {
    const first = await quoteOrThrow(baseInput(), makeDeps().deps);
    const second = await quoteOrThrow(baseInput(), makeDeps().deps);
    expect(first.quoteHash).toBe(second.quoteHash);
    expect(
      computeQuoteHash(
        first.lines,
        first.subtotalCents,
        first.currency,
        first.quotedAt,
      ),
    ).toBe(first.quoteHash);
  });

  it("flips the hash on any economic change", async () => {
    const baseline = await quoteOrThrow(baseInput(), makeDeps().deps);

    const differentQuantity = await quoteOrThrow(
      baseInput({
        serverLines: [
          { sku: "SKU-B", quantity: 1 },
          { sku: "SKU-A", quantity: 3 },
        ],
        presented: {
          lines: honestPresented().map((line) =>
            line.sku === "SKU-A"
              ? { ...line, quantity: 3, lineTotalCents: 44700 }
              : line,
          ),
          subtotalCents: 49700,
          currency: "USD",
        },
      }),
      makeDeps().deps,
    );

    const differentAmount = await quoteOrThrow(
      baseInput({
        presented: {
          lines: honestPresented().map((line) =>
            line.sku === "SKU-A"
              ? { ...line, unitAmountCents: 15900, lineTotalCents: 31800, priceVersion: 3 }
              : line,
          ),
          subtotalCents: 36800,
          currency: "USD",
        },
      }),
      makeDeps({
        rows: [
          rowFor(VARIANT_A, { amountCents: 15900, version: 3 }),
          rowFor(VARIANT_B),
        ],
      }).deps,
    );

    // Same amounts, but the price version moved: still a different agreement.
    const differentVersion = await quoteOrThrow(
      baseInput({
        presented: {
          lines: honestPresented().map((line) =>
            line.sku === "SKU-A" ? { ...line, priceVersion: 5 } : line,
          ),
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      makeDeps({
        rows: [rowFor(VARIANT_A, { version: 5 }), rowFor(VARIANT_B)],
      }).deps,
    );

    const differentInstant = await quoteOrThrow(
      baseInput({ at: LATER, authenticatedAudience: audience("retail", LATER) }),
      makeDeps().deps,
    );

    const fewerLines = await quoteOrThrow(
      baseInput({
        serverLines: [{ sku: "SKU-A", quantity: 2 }],
        presented: {
          lines: honestPresented().filter((line) => line.sku === "SKU-A"),
          subtotalCents: 29800,
          currency: "USD",
        },
      }),
      makeDeps().deps,
    );

    const hashes = [
      baseline.quoteHash,
      differentQuantity.quoteHash,
      differentAmount.quoteHash,
      differentVersion.quoteHash,
      differentInstant.quoteHash,
      fewerLines.quoteHash,
    ];
    expect(new Set(hashes).size).toBe(hashes.length);
  });

  it("rejects a tampered client line total", async () => {
    const { deps } = makeDeps();
    const result = await recomputeCheckout(
      baseInput({
        presented: {
          lines: honestPresented().map((line) =>
            line.sku === "SKU-A" ? { ...line, lineTotalCents: 29799 } : line,
          ),
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      deps,
    );
    expect(result).toEqual({
      state: "rejected",
      rejections: [{ sku: "SKU-A", reason: "amount_mismatch", detail: null }],
    });
  });

  it("rejects a tampered client unit amount and quantity", async () => {
    const { deps } = makeDeps();
    const result = await recomputeCheckout(
      baseInput({
        presented: {
          lines: honestPresented().map((line) =>
            line.sku === "SKU-B"
              ? { ...line, unitAmountCents: 1, quantity: 999 }
              : line,
          ),
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      deps,
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(result.rejections).toEqual([
      { sku: "SKU-B", reason: "amount_mismatch", detail: null },
    ]);
  });

  it("rejects a tampered subtotal at the cart level", async () => {
    const { deps } = makeDeps();
    const result = await recomputeCheckout(
      baseInput({
        presented: {
          lines: honestPresented(),
          subtotalCents: 34700,
          currency: "USD",
        },
      }),
      deps,
    );
    expect(result).toEqual({
      state: "rejected",
      rejections: [{ sku: null, reason: "amount_mismatch", detail: "subtotal" }],
    });
  });

  it("reports stale_version with the current version when the price moved", async () => {
    // The member added at version 2; pricing later activated version 3 at a
    // new amount. The client still presents version 2 numbers.
    const { deps } = makeDeps({
      rows: [
        rowFor(VARIANT_A, {
          priceId: "44444444-4444-4444-8444-444444444444",
          amountCents: 15900,
          version: 3,
        }),
        rowFor(VARIANT_B),
      ],
    });
    const result = await recomputeCheckout(baseInput(), deps);
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(result.rejections).toContainEqual({
      sku: "SKU-A",
      reason: "stale_version",
      detail: "current_version:3",
    });
    expect(result.rejections).toContainEqual({
      sku: "SKU-A",
      reason: "amount_mismatch",
      detail: null,
    });
  });

  it("rejects a line whose price expired between cart add and checkout", async () => {
    const { deps } = makeDeps({
      rows: [
        rowFor(VARIANT_A, { expiresAt: "2026-07-28T13:00:00+00:00" }),
        rowFor(VARIANT_B),
      ],
    });
    const result = await recomputeCheckout(
      baseInput({
        at: LATER,
        authenticatedAudience: audience("retail", LATER),
      }),
      deps,
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(result.rejections).toContainEqual({
      sku: "SKU-A",
      reason: "line_missing_price",
      detail: "price_expired",
    });
  });

  it("rejects an ambiguous line", async () => {
    const { deps } = makeDeps({
      rows: [
        rowFor(VARIANT_A),
        rowFor(VARIANT_A, { priceId: "55555555-5555-4555-8555-555555555555" }),
        rowFor(VARIANT_B),
      ],
    });
    const result = await recomputeCheckout(baseInput(), deps);
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(result.rejections).toContainEqual({
      sku: "SKU-A",
      reason: "ambiguous",
      detail: "price_ambiguous",
    });
  });

  it("accumulates every rejection instead of stopping at the first", async () => {
    const { deps } = makeDeps({
      rows: [rowFor(VARIANT_B)],
    });
    const result = await recomputeCheckout(
      baseInput({
        serverLines: [
          { sku: "SKU-A", quantity: 2 },
          { sku: "SKU-B", quantity: 1 },
          { sku: "SKU-MISSING", quantity: 1 },
        ],
        presented: {
          lines: [
            ...honestPresented().map((line) =>
              line.sku === "SKU-B" ? { ...line, lineTotalCents: 1 } : line,
            ),
            {
              sku: "SKU-MISSING",
              quantity: 1,
              unitAmountCents: 100,
              lineTotalCents: 100,
              priceVersion: 1,
            },
          ],
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      deps,
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(reasonsOf(result.rejections)).toEqual([
      "amount_mismatch",
      "line_missing_price",
      "sku_unknown",
    ]);
    // The subtotal is not compared when a line failed to resolve: the server
    // sum would not describe the full cart, so no misleading extra rejection.
    expect(
      result.rejections.some(
        (entry) => entry.reason === "amount_mismatch" && entry.sku === null,
      ),
    ).toBe(false);
  });

  it("rejects duplicate server lines and duplicate presented lines", async () => {
    const duplicateServer = await recomputeCheckout(
      baseInput({
        serverLines: [
          { sku: "SKU-A", quantity: 2 },
          { sku: "SKU-A", quantity: 1 },
        ],
      }),
      makeDeps().deps,
    );
    expect(duplicateServer).toEqual({
      state: "rejected",
      rejections: [{ sku: "SKU-A", reason: "duplicate_line", detail: null }],
    });

    const duplicatePresented = await recomputeCheckout(
      baseInput({
        presented: {
          lines: [...honestPresented(), honestPresented()[0]],
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      makeDeps().deps,
    );
    expect(duplicatePresented.state).toBe("rejected");
    if (duplicatePresented.state !== "rejected") return;
    expect(duplicatePresented.rejections).toContainEqual({
      sku: "SKU-A",
      reason: "duplicate_line",
      detail: "presented",
    });
  });

  it("rejects an empty cart", async () => {
    const result = await recomputeCheckout(
      baseInput({
        serverLines: [],
        presented: { lines: [], subtotalCents: 0, currency: "USD" },
      }),
      makeDeps().deps,
    );
    expect(result).toEqual({
      state: "rejected",
      rejections: [{ sku: null, reason: "empty_cart", detail: null }],
    });
  });

  it("rejects presented lines that do not match the server cart", async () => {
    const missing = await recomputeCheckout(
      baseInput({
        presented: {
          lines: honestPresented().filter((line) => line.sku !== "SKU-B"),
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      makeDeps().deps,
    );
    expect(missing.state).toBe("rejected");
    if (missing.state !== "rejected") return;
    expect(missing.rejections).toContainEqual({
      sku: "SKU-B",
      reason: "presented_line_missing",
      detail: null,
    });

    const unknown = await recomputeCheckout(
      baseInput({
        presented: {
          lines: [
            ...honestPresented(),
            {
              sku: "SKU-GHOST",
              quantity: 1,
              unitAmountCents: 100,
              lineTotalCents: 100,
              priceVersion: 1,
            },
          ],
          subtotalCents: 34800,
          currency: "USD",
        },
      }),
      makeDeps().deps,
    );
    expect(unknown.state).toBe("rejected");
    if (unknown.state !== "rejected") return;
    expect(unknown.rejections).toContainEqual({
      sku: "SKU-GHOST",
      reason: "presented_line_unknown",
      detail: null,
    });
  });

  it("rejects a forged audience once, before any resolution", async () => {
    const { deps, calls } = makeDeps();
    const result = await recomputeCheckout(
      baseInput({
        authenticatedAudience: {
          audience: "compare_at",
          sourceVersion: "session-v1",
          evaluatedAt: AT,
        } as unknown as ServerAuthorizedAudience,
      }),
      deps,
    );
    expect(result).toEqual({
      state: "rejected",
      rejections: [{ sku: null, reason: "audience_unauthorized", detail: null }],
    });
    expect(calls.resolve).toBe(0);
  });

  it("rejects bad instants and unsupported currencies at the cart level", async () => {
    const badInstant = await recomputeCheckout(
      baseInput({ at: "tomorrow" }),
      makeDeps().deps,
    );
    expect(badInstant).toEqual({
      state: "rejected",
      rejections: [{ sku: null, reason: "invalid_instant", detail: null }],
    });

    const badCurrency = await recomputeCheckout(
      baseInput({ currency: "EUR" }),
      makeDeps().deps,
    );
    expect(badCurrency).toEqual({
      state: "rejected",
      rejections: [{ sku: null, reason: "currency_unsupported", detail: null }],
    });

    const badPresentedCurrency = await recomputeCheckout(
      baseInput({
        presented: {
          lines: honestPresented(),
          subtotalCents: 34800,
          currency: "EUR",
        },
      }),
      makeDeps().deps,
    );
    expect(badPresentedCurrency.state).toBe("rejected");
    if (badPresentedCurrency.state !== "rejected") return;
    expect(badPresentedCurrency.rejections).toContainEqual({
      sku: null,
      reason: "currency_unsupported",
      detail: "presented_currency",
    });

    // Casing is normalized, not rejected.
    const casedCurrency = await recomputeCheckout(
      baseInput({
        currency: " usd ",
        presented: {
          lines: honestPresented(),
          subtotalCents: 34800,
          currency: "usd",
        },
      }),
      makeDeps().deps,
    );
    expect(casedCurrency.state).toBe("quoted");
  });

  it("rejects invalid quantities per line", async () => {
    for (const quantity of [0, -2, 1.5, NaN, 1e21]) {
      const result = await recomputeCheckout(
        baseInput({
          serverLines: [
            { sku: "SKU-A", quantity },
            { sku: "SKU-B", quantity: 1 },
          ],
        }),
        makeDeps().deps,
      );
      expect(result.state).toBe("rejected");
      if (result.state !== "rejected") return;
      expect(result.rejections).toContainEqual({
        sku: "SKU-A",
        reason: "quantity_invalid",
        detail: null,
      });
    }
  });

  it("rejects a subtotal that would leave safe integer cents", async () => {
    const huge = Number.MAX_SAFE_INTEGER - 1;
    const { deps } = makeDeps({
      rows: [
        rowFor(VARIANT_A, { amountCents: huge }),
        rowFor(VARIANT_B, { amountCents: huge }),
      ],
    });
    const result = await recomputeCheckout(
      baseInput({
        serverLines: [
          { sku: "SKU-A", quantity: 1 },
          { sku: "SKU-B", quantity: 1 },
        ],
        presented: {
          lines: honestPresented().map((line) => ({
            ...line,
            quantity: 1,
            unitAmountCents: huge,
            lineTotalCents: huge,
          })),
          subtotalCents: 0,
          currency: "USD",
        },
      }),
      deps,
    );
    expect(result.state).toBe("rejected");
    if (result.state !== "rejected") return;
    expect(result.rejections).toContainEqual({
      sku: null,
      reason: "subtotal_overflow",
      detail: null,
    });
  });

  it("never emits a quote from a smuggled negative or zero amount", async () => {
    for (const amountCents of [-1, 0]) {
      const { deps } = makeDeps({
        forceByVariant: {
          "variant-a": {
            state: "available",
            price: {
              priceId: UUID_A,
              productId: "product-a",
              variantId: "variant-a",
              audience: "retail",
              amountCents,
              currency: "USD",
              effectiveAt: "2026-07-01T00:00:00+00:00",
              expiresAt: null,
              version: 2,
            },
          },
        },
      });
      const result = await recomputeCheckout(baseInput(), deps);
      expect(result.state).toBe("rejected");
      if (result.state !== "rejected") return;
      expect(result.rejections).toContainEqual({
        sku: "SKU-A",
        reason: "line_missing_price",
        detail: "price_missing",
      });
    }
  });

  it("is deterministic: no clock is read anywhere", async () => {
    const first = await recomputeCheckout(baseInput(), makeDeps().deps);
    const second = await recomputeCheckout(baseInput(), makeDeps().deps);
    expect(first).toEqual(second);
  });
});
