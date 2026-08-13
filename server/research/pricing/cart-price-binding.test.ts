import { describe, expect, it } from "vitest";
import type {
  CartPriceSnapshot,
  CustomerPriceAudience,
  PriceResolution,
  PriceUnavailableReason,
} from "@shared/research/pricing";
import { parseProductControlTimestamp } from "../catalog/product-control-reader";
import {
  authorizeAudienceFromServerIdentity,
  type ServerAuthorizedAudience,
} from "./authoritative-price-resolver";
import {
  bindCartPrice,
  DEFAULT_QUANTITY_POLICY,
  revalidateCartPriceSnapshot,
  type CartPriceBindingDeps,
  type VariantIdentity,
} from "./cart-price-binding";

const AT = "2026-07-28T12:00:00+00:00";
const LATER = "2026-07-28T14:00:00+00:00";
const PRICE_UUID = "11111111-1111-4111-8111-111111111111";

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

function variantA(overrides: Partial<VariantIdentity> = {}): VariantIdentity {
  return {
    productId: "product-a",
    variantId: "variant-a",
    sku: "SKU-A",
    displayName: "Product A / Variant A",
    ...overrides,
  };
}

function rowA(overrides: Partial<FakePriceRow> = {}): FakePriceRow {
  return {
    priceId: PRICE_UUID,
    productId: "product-a",
    variantId: "variant-a",
    audience: "retail",
    amountCents: 14900,
    currency: "USD",
    effectiveAt: "2026-07-01T00:00:00+00:00",
    expiresAt: null,
    version: 2,
    ...overrides,
  };
}

/**
 * In-memory fakes of the two reader interfaces, mirroring the pricing core's
 * fail-closed semantics: effectiveAt inclusive, expiresAt exclusive, one
 * in-window row or nothing. `force` short-circuits resolution for taxonomy
 * mapping tests. Call counts prove a rejected input never reached a reader.
 */
function makeDeps(config: {
  variants?: VariantIdentity[];
  rows?: FakePriceRow[];
  force?: PriceResolution;
} = {}) {
  const variantsBySku = new Map(
    (config.variants ?? [variantA()]).map((identity) => [identity.sku, identity]),
  );
  const rows = config.rows ?? [rowA()];
  const calls = { lookup: 0, resolve: 0 };
  const deps: CartPriceBindingDeps = {
    variants: {
      async findVariantBySku(sku) {
        calls.lookup += 1;
        return variantsBySku.get(sku) ?? null;
      },
    },
    priceResolver: {
      async resolveApprovedResearchPrice(input) {
        calls.resolve += 1;
        if (config.force) return config.force;
        const at = parseProductControlTimestamp(input.at);
        if (at === null) return { state: "unavailable", reason: "price_missing" };
        const identity = rows.filter(
          (row) =>
            row.productId === input.productId &&
            row.variantId === input.variantId,
        );
        if (identity.length === 0) {
          return { state: "unavailable", reason: "price_missing" };
        }
        const forAudience = identity.filter(
          (row) => row.audience === input.authenticatedAudience.audience,
        );
        if (forAudience.length === 0) {
          return { state: "unavailable", reason: "wrong_audience" };
        }
        const forCurrency = forAudience.filter(
          (row) => row.currency === input.currency,
        );
        if (forCurrency.length === 0) {
          return { state: "unavailable", reason: "wrong_currency" };
        }
        const inWindow = forCurrency.filter((row) => {
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
          const anyFuture = forCurrency.some((row) => {
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

function bindInput(overrides: Record<string, unknown> = {}) {
  return {
    sku: "SKU-A",
    quantity: 2,
    authenticatedAudience: audience(),
    currency: "USD",
    at: AT,
    ...overrides,
  };
}

const EXPECTED_SNAPSHOT: CartPriceSnapshot = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  displayName: "Product A / Variant A",
  priceId: PRICE_UUID,
  priceVersion: 2,
  audience: "retail",
  currency: "USD",
  unitAmountCents: 14900,
  quantity: 2,
  lineTotalCents: 29800,
  effectiveAt: "2026-07-01T00:00:00+00:00",
  expiresAt: null,
  pricedAt: AT,
};

describe("bindCartPrice", () => {
  it("pins the exact authoritative price into a frozen snapshot", async () => {
    const { deps } = makeDeps();
    const result = await bindCartPrice(bindInput(), deps);
    expect(result).toEqual({ state: "bound", snapshot: EXPECTED_SNAPSHOT });
    if (result.state !== "bound") return;
    expect(Object.isFrozen(result.snapshot)).toBe(true);
    expect(result.snapshot.lineTotalCents).toBe(
      result.snapshot.unitAmountCents * result.snapshot.quantity,
    );
  });

  it("rejects every malformed quantity without consulting any reader", async () => {
    for (const quantity of [0, -1, -1000, 1.5, NaN, Infinity, -Infinity, 1e21, 51]) {
      const { deps, calls } = makeDeps();
      const result = await bindCartPrice(bindInput({ quantity }), deps);
      expect(result).toEqual({ state: "rejected", reason: "quantity_invalid" });
      expect(calls.lookup).toBe(0);
      expect(calls.resolve).toBe(0);
    }
  });

  it("honors an injected max-quantity policy and fails closed on a malformed one", async () => {
    const tight = makeDeps();
    await expect(
      bindCartPrice(bindInput({ quantity: 3 }), {
        ...tight.deps,
        quantityPolicy: { maxQuantity: 3 },
      }),
    ).resolves.toMatchObject({ state: "bound" });
    await expect(
      bindCartPrice(bindInput({ quantity: 4 }), {
        ...tight.deps,
        quantityPolicy: { maxQuantity: 3 },
      }),
    ).resolves.toEqual({ state: "rejected", reason: "quantity_invalid" });
    expect(DEFAULT_QUANTITY_POLICY.maxQuantity).toBe(50);
    for (const maxQuantity of [0, -5, 2.5, 51, NaN, Infinity]) {
      await expect(
        bindCartPrice(bindInput({ quantity: 1 }), {
          ...makeDeps().deps,
          quantityPolicy: { maxQuantity },
        }),
      ).resolves.toEqual({ state: "rejected", reason: "quantity_invalid" });
    }
  });

  it("rejects a line total that would leave safe integer cents", async () => {
    const { deps } = makeDeps({
      rows: [rowA({ amountCents: Number.MAX_SAFE_INTEGER - 1 })],
    });
    await expect(
      bindCartPrice(bindInput({ quantity: 2 }), deps),
    ).resolves.toEqual({ state: "rejected", reason: "line_total_overflow" });
  });

  it("fails closed on unknown, blank, or incoherently resolved SKUs", async () => {
    const unknown = makeDeps();
    await expect(
      bindCartPrice(bindInput({ sku: "SKU-MISSING" }), unknown.deps),
    ).resolves.toEqual({ state: "rejected", reason: "sku_unknown" });

    for (const sku of ["", "   "]) {
      const blank = makeDeps();
      await expect(
        bindCartPrice(bindInput({ sku }), blank.deps),
      ).resolves.toEqual({ state: "rejected", reason: "sku_unknown" });
      expect(blank.calls.lookup).toBe(0);
    }

    // A lookup that answers with a different SKU, or blank identity fields,
    // is a broken reader and must not price anything.
    const mismatched = makeDeps({ variants: [variantA({ sku: "SKU-B" })] });
    mismatched.deps.variants = {
      async findVariantBySku() {
        return variantA({ sku: "SKU-B" });
      },
    };
    await expect(
      bindCartPrice(bindInput(), mismatched.deps),
    ).resolves.toEqual({ state: "rejected", reason: "sku_unknown" });

    const blankIdentity = makeDeps();
    blankIdentity.deps.variants = {
      async findVariantBySku() {
        return variantA({ productId: "  " });
      },
    };
    await expect(
      bindCartPrice(bindInput(), blankIdentity.deps),
    ).resolves.toEqual({ state: "rejected", reason: "sku_unknown" });
  });

  it("maps every resolver failure through the typed taxonomy", async () => {
    const unavailableReasons: PriceUnavailableReason[] = [
      "price_missing",
      "price_inactive",
      "price_unapproved",
      "price_future",
      "price_expired",
      "wrong_audience",
      "wrong_currency",
      "product_inactive",
      "variant_inactive",
      "variant_unapproved",
      "member_ineligible",
    ];
    for (const reason of unavailableReasons) {
      const { deps } = makeDeps({ force: { state: "unavailable", reason } });
      await expect(bindCartPrice(bindInput(), deps)).resolves.toEqual({
        state: "rejected",
        reason,
      });
    }
    const { deps } = makeDeps({
      force: { state: "ambiguous", reason: "price_ambiguous" },
    });
    await expect(bindCartPrice(bindInput(), deps)).resolves.toEqual({
      state: "rejected",
      reason: "price_ambiguous",
    });
  });

  it("treats expiry boundaries exactly: effective inclusive, expiry exclusive", async () => {
    const window = {
      effectiveAt: "2026-07-28T12:00:00+00:00",
      expiresAt: "2026-07-28T14:00:00+00:00",
    };
    const { deps } = makeDeps({ rows: [rowA(window)] });
    await expect(
      bindCartPrice(
        bindInput({ at: window.effectiveAt, authenticatedAudience: audience("retail", window.effectiveAt) }),
        deps,
      ),
    ).resolves.toMatchObject({ state: "bound" });
    await expect(
      bindCartPrice(
        bindInput({
          at: "2026-07-28T13:59:59+00:00",
          authenticatedAudience: audience("retail", "2026-07-28T13:59:59+00:00"),
        }),
        deps,
      ),
    ).resolves.toMatchObject({ state: "bound" });
    await expect(
      bindCartPrice(
        bindInput({ at: window.expiresAt, authenticatedAudience: audience("retail", window.expiresAt) }),
        deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "price_expired" });
  });

  it("rejects forged or stale audiences at runtime before any reader runs", async () => {
    const forgeries: unknown[] = [
      { audience: "compare_at", sourceVersion: "session-v1", evaluatedAt: AT },
      { audience: "admin", sourceVersion: "session-v1", evaluatedAt: AT },
      { audience: "retail", sourceVersion: "   ", evaluatedAt: AT },
      { audience: "retail", sourceVersion: "session-v1", evaluatedAt: "garbage" },
      null,
      "retail",
    ];
    for (const forged of forgeries) {
      const { deps, calls } = makeDeps();
      const result = await bindCartPrice(
        bindInput({
          authenticatedAudience: forged as ServerAuthorizedAudience,
        }),
        deps,
      );
      expect(result).toEqual({
        state: "rejected",
        reason: "audience_unauthorized",
      });
      expect(calls.lookup).toBe(0);
      expect(calls.resolve).toBe(0);
    }
    // A genuinely branded authorization evaluated at a different instant is
    // stale for this pricing instant and fails identically.
    const stale = makeDeps();
    await expect(
      bindCartPrice(
        bindInput({ authenticatedAudience: audience("retail", LATER) }),
        stale.deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "audience_unauthorized" });
    expect(stale.calls.resolve).toBe(0);
  });

  it("rejects an unparseable pricing instant", async () => {
    const { deps, calls } = makeDeps();
    for (const at of ["", "yesterday", "2026-07-28", "2026-13-01T00:00:00+00:00"]) {
      await expect(bindCartPrice(bindInput({ at }), deps)).resolves.toEqual({
        state: "rejected",
        reason: "invalid_instant",
      });
    }
    expect(calls.resolve).toBe(0);
  });

  it("never lets a malformed or mismatched available price through, including -1", async () => {
    const cases: PriceResolution[] = [
      {
        state: "available",
        price: {
          priceId: PRICE_UUID,
          productId: "product-a",
          variantId: "variant-OTHER",
          audience: "retail",
          amountCents: 14900,
          currency: "USD",
          effectiveAt: "2026-07-01T00:00:00+00:00",
          expiresAt: null,
          version: 2,
        },
      },
      {
        state: "available",
        price: {
          priceId: PRICE_UUID,
          productId: "product-a",
          variantId: "variant-a",
          audience: "member",
          amountCents: 14900,
          currency: "USD",
          effectiveAt: "2026-07-01T00:00:00+00:00",
          expiresAt: null,
          version: 2,
        },
      },
      {
        state: "available",
        price: {
          priceId: PRICE_UUID,
          productId: "product-a",
          variantId: "variant-a",
          audience: "retail",
          amountCents: 0,
          currency: "USD",
          effectiveAt: "2026-07-01T00:00:00+00:00",
          expiresAt: null,
          version: 2,
        },
      },
      {
        state: "available",
        price: {
          priceId: PRICE_UUID,
          productId: "product-a",
          variantId: "variant-a",
          audience: "retail",
          amountCents: -1,
          currency: "USD",
          effectiveAt: "2026-07-01T00:00:00+00:00",
          expiresAt: null,
          version: 2,
        },
      },
    ];
    for (const force of cases) {
      const { deps } = makeDeps({ force });
      await expect(bindCartPrice(bindInput(), deps)).resolves.toEqual({
        state: "rejected",
        reason: "price_missing",
      });
    }
  });
});

describe("revalidateCartPriceSnapshot", () => {
  async function boundSnapshot(): Promise<CartPriceSnapshot> {
    const { deps } = makeDeps();
    const result = await bindCartPrice(bindInput(), deps);
    if (result.state !== "bound") throw new Error("expected bound snapshot");
    return result.snapshot;
  }

  function revalidateInput(
    snapshot: unknown,
    overrides: Record<string, unknown> = {},
  ) {
    return {
      snapshot,
      authenticatedAudience: audience("retail", LATER),
      currency: "USD",
      at: LATER,
      ...overrides,
    };
  }

  it("confirms an unchanged price and refreshes pricedAt", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps();
    const result = await revalidateCartPriceSnapshot(
      revalidateInput(snapshot),
      deps,
    );
    expect(result).toEqual({
      state: "valid",
      refreshed: { ...EXPECTED_SNAPSHOT, pricedAt: LATER },
    });
  });

  it("returns a typed reprice_required when the price version moved", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps({
      rows: [
        rowA({
          priceId: "22222222-2222-4222-8222-222222222222",
          amountCents: 15900,
          version: 3,
        }),
      ],
    });
    const result = await revalidateCartPriceSnapshot(
      revalidateInput(snapshot),
      deps,
    );
    expect(result).toMatchObject({
      state: "reprice_required",
      staleVersion: 2,
      currentVersion: 3,
    });
    if (result.state !== "reprice_required") return;
    expect(result.refreshed.unitAmountCents).toBe(15900);
    expect(result.refreshed.lineTotalCents).toBe(31800);
    expect(result.refreshed.pricedAt).toBe(LATER);
  });

  it("requires a reprice when the price row changed even at the same version", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps({
      rows: [
        rowA({
          priceId: "33333333-3333-4333-8333-333333333333",
          amountCents: 13900,
        }),
      ],
    });
    await expect(
      revalidateCartPriceSnapshot(revalidateInput(snapshot), deps),
    ).resolves.toMatchObject({
      state: "reprice_required",
      staleVersion: 2,
      currentVersion: 2,
    });
  });

  it("rejects when the price expired between add and revalidation", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps({
      rows: [rowA({ expiresAt: "2026-07-28T13:00:00+00:00" })],
    });
    await expect(
      revalidateCartPriceSnapshot(revalidateInput(snapshot), deps),
    ).resolves.toEqual({ state: "rejected", reason: "price_expired" });
  });

  it("rejects a snapshot presented by the wrong audience", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps();
    await expect(
      revalidateCartPriceSnapshot(
        revalidateInput(snapshot, {
          authenticatedAudience: audience("member", LATER),
        }),
        deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "wrong_audience" });
  });

  it("rejects tampered snapshots structurally, including the -1 sentinel", async () => {
    const snapshot = await boundSnapshot();
    const tampered: unknown[] = [
      { ...snapshot, lineTotalCents: snapshot.lineTotalCents + 1 },
      { ...snapshot, unitAmountCents: -1 },
      { ...snapshot, unitAmountCents: 0 },
      { ...snapshot, quantity: 2.5 },
      { ...snapshot, priceVersion: 0 },
      { ...snapshot, currency: "EUR" },
      { ...snapshot, audience: "compare_at" },
      { ...snapshot, pricedAt: "" },
      null,
      "snapshot",
      42,
    ];
    for (const candidate of tampered) {
      const { deps, calls } = makeDeps();
      await expect(
        revalidateCartPriceSnapshot(revalidateInput(candidate), deps),
      ).resolves.toEqual({ state: "rejected", reason: "snapshot_malformed" });
      expect(calls.resolve).toBe(0);
    }
  });

  it("rejects a SKU that now resolves to a different variant", async () => {
    const snapshot = await boundSnapshot();
    const { deps } = makeDeps({
      variants: [variantA({ variantId: "variant-b" })],
      rows: [rowA({ variantId: "variant-b" })],
    });
    await expect(
      revalidateCartPriceSnapshot(revalidateInput(snapshot), deps),
    ).resolves.toEqual({ state: "rejected", reason: "sku_remapped" });
  });

  it("re-applies the quantity policy and audience runtime checks", async () => {
    const snapshot = await boundSnapshot();
    const tightened = makeDeps();
    await expect(
      revalidateCartPriceSnapshot(revalidateInput(snapshot), {
        ...tightened.deps,
        quantityPolicy: { maxQuantity: 1 },
      }),
    ).resolves.toEqual({ state: "rejected", reason: "quantity_invalid" });

    const forged = makeDeps();
    await expect(
      revalidateCartPriceSnapshot(
        revalidateInput(snapshot, {
          authenticatedAudience: {
            audience: "retail",
            sourceVersion: "session-v1",
            evaluatedAt: AT,
          } as unknown as ServerAuthorizedAudience,
        }),
        forged.deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "audience_unauthorized" });
    expect(forged.calls.resolve).toBe(0);

    const badCurrency = makeDeps();
    await expect(
      revalidateCartPriceSnapshot(
        revalidateInput(snapshot, { currency: "EUR" }),
        badCurrency.deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "wrong_currency" });

    const badInstant = makeDeps();
    await expect(
      revalidateCartPriceSnapshot(
        revalidateInput(snapshot, { at: "not-a-time" }),
        badInstant.deps,
      ),
    ).resolves.toEqual({ state: "rejected", reason: "invalid_instant" });
  });
});
