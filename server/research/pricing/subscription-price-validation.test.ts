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
  PriceLineageReaders,
  VariantIdentity,
} from "./cart-price-binding";
import {
  parseClaimedPriceVersion,
  validateSubscriptionPriceVersion,
} from "./subscription-price-validation";

const AT = "2026-07-28T12:00:00+00:00";
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

const VARIANT_A: VariantIdentity = {
  productId: "product-a",
  variantId: "variant-a",
  sku: "SKU-A",
  displayName: "Product A / Variant A",
};

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

function makeReaders(config: {
  variants?: VariantIdentity[];
  rows?: FakePriceRow[];
  force?: PriceResolution;
} = {}) {
  const variantsBySku = new Map(
    (config.variants ?? [VARIANT_A]).map((identity) => [identity.sku, identity]),
  );
  const rows = config.rows ?? [rowA()];
  const calls = { resolve: 0 };
  const readers: PriceLineageReaders = {
    variants: {
      async findVariantBySku(sku) {
        return variantsBySku.get(sku) ?? null;
      },
    },
    priceResolver: {
      async resolveApprovedResearchPrice(input) {
        calls.resolve += 1;
        if (config.force) return config.force;
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
  return { readers, calls };
}

function audience(kind: CustomerPriceAudience = "retail"): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: kind,
    sourceVersion: "session-v1",
    evaluatedAt: AT,
  });
  if (authorized === null) throw new Error("expected authorized audience");
  return authorized;
}

function input(overrides: Record<string, unknown> = {}) {
  return {
    sku: "SKU-A",
    claimedPriceVersion: "2",
    authenticatedAudience: audience(),
    currency: "USD",
    at: AT,
    ...overrides,
  };
}

describe("parseClaimedPriceVersion", () => {
  it("accepts only the canonical rendering of a positive safe integer", () => {
    expect(parseClaimedPriceVersion("1")).toBe(1);
    expect(parseClaimedPriceVersion("42")).toBe(42);
    expect(parseClaimedPriceVersion("9007199254740991")).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it("rejects every non-canonical or unsafe claim", () => {
    for (const claim of [
      "",
      " 2",
      "2 ",
      "02",
      "2.0",
      "+2",
      "-1",
      "0",
      "1e3",
      "abc",
      "Infinity",
      "NaN",
      "0x10",
      "9007199254740993",
      "99999999999999999999",
    ]) {
      expect(parseClaimedPriceVersion(claim)).toBeNull();
    }
  });
});

describe("validateSubscriptionPriceVersion", () => {
  it("confirms a claim that names the current version exactly", async () => {
    const { readers } = makeReaders();
    const result = await validateSubscriptionPriceVersion(input(), readers);
    expect(result).toEqual({
      state: "version_confirmed",
      version: 2,
      currentPrice: {
        priceId: PRICE_UUID,
        productId: "product-a",
        variantId: "variant-a",
        audience: "retail",
        amountCents: 14900,
        currency: "USD",
        effectiveAt: "2026-07-01T00:00:00+00:00",
        expiresAt: null,
        version: 2,
      },
    });
  });

  it("reports a stale claim with the current version and price", async () => {
    const { readers } = makeReaders();
    const result = await validateSubscriptionPriceVersion(
      input({ claimedPriceVersion: "1" }),
      readers,
    );
    expect(result).toMatchObject({
      state: "version_stale",
      claimedVersion: 1,
      currentVersion: 2,
    });
  });

  it("detects the stored-verbatim wire string a subscription carries today", async () => {
    // subscriptions.ts stores priceVersion verbatim from wire input with no
    // validation, so a record can carry any string at all. Every such claim
    // must surface as stale rather than confirmed.
    const { readers } = makeReaders();
    for (const claimedPriceVersion of ["999", "1", "3"]) {
      const result = await validateSubscriptionPriceVersion(
        input({ claimedPriceVersion }),
        readers,
      );
      expect(result).toMatchObject({
        state: "version_stale",
        currentVersion: 2,
      });
    }
  });

  it("treats malformed claims as stale with a null claimedVersion", async () => {
    const { readers } = makeReaders();
    for (const claimedPriceVersion of ["", "  ", "v2", "02", "2.0", "-2", "1e2"]) {
      const result = await validateSubscriptionPriceVersion(
        input({ claimedPriceVersion }),
        readers,
      );
      expect(result).toMatchObject({
        state: "version_stale",
        claimedVersion: null,
        currentVersion: 2,
      });
    }
  });

  it("cannot be steered by the claim: resolution ignores the claimed version", async () => {
    // An old expired version 1 row sits beside the current version 2 row. A
    // claim of "1" must not select the old row; it is stale against v2.
    const { readers } = makeReaders({
      rows: [
        rowA({
          priceId: "33333333-3333-4333-8333-333333333333",
          version: 1,
          amountCents: 9900,
          effectiveAt: "2026-01-01T00:00:00+00:00",
          expiresAt: "2026-07-01T00:00:00+00:00",
        }),
        rowA(),
      ],
    });
    const result = await validateSubscriptionPriceVersion(
      input({ claimedPriceVersion: "1" }),
      readers,
    );
    expect(result).toMatchObject({
      state: "version_stale",
      claimedVersion: 1,
      currentVersion: 2,
    });
    if (result.state !== "version_stale") return;
    expect(result.currentPrice.amountCents).toBe(14900);
  });

  it("answers price_unavailable when there is no current price", async () => {
    const missing = makeReaders({ rows: [] });
    await expect(
      validateSubscriptionPriceVersion(input(), missing.readers),
    ).resolves.toEqual({ state: "price_unavailable", reason: "price_missing" });

    const expired = makeReaders({
      rows: [rowA({ expiresAt: "2026-07-15T00:00:00+00:00" })],
    });
    await expect(
      validateSubscriptionPriceVersion(input(), expired.readers),
    ).resolves.toEqual({ state: "price_unavailable", reason: "price_expired" });

    const future = makeReaders({
      rows: [rowA({ effectiveAt: "2026-08-01T00:00:00+00:00" })],
    });
    await expect(
      validateSubscriptionPriceVersion(input(), future.readers),
    ).resolves.toEqual({ state: "price_unavailable", reason: "price_future" });

    const ambiguous = makeReaders({
      rows: [rowA(), rowA({ priceId: "22222222-2222-4222-8222-222222222222" })],
    });
    await expect(
      validateSubscriptionPriceVersion(input(), ambiguous.readers),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "price_ambiguous",
    });

    const unknownSku = makeReaders();
    await expect(
      validateSubscriptionPriceVersion(
        input({ sku: "SKU-GONE" }),
        unknownSku.readers,
      ),
    ).resolves.toEqual({ state: "price_unavailable", reason: "sku_unknown" });

    const memberIneligible = makeReaders({
      force: { state: "unavailable", reason: "member_ineligible" },
    });
    await expect(
      validateSubscriptionPriceVersion(
        input({ authenticatedAudience: audience("member") }),
        memberIneligible.readers,
      ),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "member_ineligible",
    });
  });

  it("fails closed on forged audiences, bad instants, and bad currencies", async () => {
    const forged = makeReaders();
    await expect(
      validateSubscriptionPriceVersion(
        input({
          authenticatedAudience: {
            audience: "compare_at",
            sourceVersion: "session-v1",
            evaluatedAt: AT,
          } as unknown as ServerAuthorizedAudience,
        }),
        forged.readers,
      ),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "audience_unauthorized",
    });
    expect(forged.calls.resolve).toBe(0);

    const staleAuthorization = makeReaders();
    const otherInstant = authorizeAudienceFromServerIdentity({
      audience: "retail",
      sourceVersion: "session-v1",
      evaluatedAt: "2026-07-28T11:00:00+00:00",
    });
    await expect(
      validateSubscriptionPriceVersion(
        input({ authenticatedAudience: otherInstant }),
        staleAuthorization.readers,
      ),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "audience_unauthorized",
    });

    const badInstant = makeReaders();
    await expect(
      validateSubscriptionPriceVersion(
        input({ at: "renewal-day" }),
        badInstant.readers,
      ),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "invalid_instant",
    });

    const badCurrency = makeReaders();
    await expect(
      validateSubscriptionPriceVersion(
        input({ currency: "EUR" }),
        badCurrency.readers,
      ),
    ).resolves.toEqual({
      state: "price_unavailable",
      reason: "wrong_currency",
    });
  });

  it("is deterministic for identical explicit inputs", async () => {
    const first = await validateSubscriptionPriceVersion(
      input(),
      makeReaders().readers,
    );
    const second = await validateSubscriptionPriceVersion(
      input(),
      makeReaders().readers,
    );
    expect(first).toEqual(second);
  });
});
