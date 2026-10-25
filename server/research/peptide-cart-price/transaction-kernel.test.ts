import { describe, expect, it } from "vitest";
import type { CartPriceSnapshot } from "@shared/research/pricing";
import type {
  CanonicalCartPriceAuthorityPort,
  ProductControlQuantityLimitFact,
  ProductControlQuantityLimitPort,
} from "./authority-port";
import {
  authorizeAudienceFromServerIdentity,
  type ServerAuthorizedAudience,
} from "../pricing/authoritative-price-resolver";
import {
  projectPeptideCartTransaction,
  type AcceptedPriceFingerprint,
  type PeptideCartProjectionRequest,
} from "./transaction-kernel";

const AT = "2026-08-02T23:00:00Z";
const SKU_A = "PEP-BPC157-5MG";
const SKU_B = "PEP-TB500-10MG";
const PRICE_A = "11111111-1111-4111-8111-111111111111";
const PRICE_B = "22222222-2222-4222-8222-222222222222";

function audience(
  overrides: Partial<{
    audience: "retail" | "member" | "professional" | "wholesale";
    sourceVersion: string;
    evaluatedAt: string;
  }> = {},
): ServerAuthorizedAudience {
  const authorized = authorizeAudienceFromServerIdentity({
    audience: "member",
    sourceVersion: "member-session-v7",
    evaluatedAt: AT,
    ...overrides,
  });
  if (authorized === null) throw new Error("invalid test audience");
  return authorized;
}

function request(
  overrides: Partial<PeptideCartProjectionRequest> = {},
): PeptideCartProjectionRequest {
  return {
    evaluatedAt: AT,
    currency: "USD",
    lines: [{ sku: SKU_A, quantity: 2 }],
    ...overrides,
  };
}

function limit(
  sku = SKU_A,
  overrides: Partial<ProductControlQuantityLimitFact> = {},
): ProductControlQuantityLimitFact {
  return {
    sku,
    minQuantity: 1,
    maxQuantity: 6,
    increment: 1,
    sourceVersion: "quantity-policy-v3",
    effectiveAt: "2026-08-01T00:00:00Z",
    expiresAt: null,
    ...overrides,
  };
}

function snapshot(
  sku = SKU_A,
  quantity = 2,
  overrides: Partial<CartPriceSnapshot> = {},
): CartPriceSnapshot {
  const unitAmountCents = sku === SKU_A ? 14900 : 21900;
  return {
    productId: sku === SKU_A ? "product-a" : "product-b",
    variantId: sku === SKU_A ? "variant-a" : "variant-b",
    sku,
    displayName: sku === SKU_A ? "BPC-157 / 5 mg" : "TB-500 / 10 mg",
    priceId: sku === SKU_A ? PRICE_A : PRICE_B,
    priceVersion: 3,
    audience: "member",
    currency: "USD",
    unitAmountCents,
    quantity,
    lineTotalCents: unitAmountCents * quantity,
    effectiveAt: "2026-08-01T00:00:00Z",
    expiresAt: null,
    pricedAt: AT,
    ...overrides,
  };
}

function fingerprint(
  overrides: Partial<AcceptedPriceFingerprint> = {},
): AcceptedPriceFingerprint {
  return {
    priceId: PRICE_A,
    version: 3,
    audience: "member",
    currency: "USD",
    effectiveAt: "2026-08-01T00:00:00Z",
    expiresAt: null,
    ...overrides,
  };
}

function harness(config: {
  limits?: unknown;
  bind?: CanonicalCartPriceAuthorityPort["bind"];
} = {}) {
  const calls = { limits: 0, price: 0 };
  const quantityLimits: ProductControlQuantityLimitPort = {
    async resolveQuantityLimits() {
      calls.limits += 1;
      return config.limits ?? [limit()];
    },
  };
  const priceAuthority: CanonicalCartPriceAuthorityPort = {
    async bind(input) {
      calls.price += 1;
      if (config.bind) return config.bind(input);
      return {
        state: "bound",
        snapshot: snapshot(input.sku, input.quantity),
      };
    },
  };
  return { calls, deps: { quantityLimits, priceAuthority } };
}

describe("peptide cart transaction projection", () => {
  it("projects exact authoritative price lineage and server-only integer totals", async () => {
    const { deps, calls } = harness({
      limits: [limit(SKU_A), limit(SKU_B, { maxQuantity: 4 })],
    });
    const result = await projectPeptideCartTransaction(
      request({
        lines: [
          { sku: SKU_A, quantity: 2 },
          { sku: SKU_B, quantity: 1 },
        ],
      }),
      { authenticatedAudience: audience() },
      deps,
    );

    expect(result).toMatchObject({
      state: "projected",
      authorityScope: "price_and_quantity_only",
      currency: "USD",
      audience: "member",
      evaluatedAt: AT,
      subtotalCents: 51700,
    });
    if (result.state !== "projected") throw new Error("expected projection");
    expect(result.lines.map((line) => line.sku)).toEqual([SKU_A, SKU_B]);
    expect(result.lines[0]).toMatchObject({
      priceId: PRICE_A,
      priceVersion: 3,
      unitAmountCents: 14900,
      lineTotalCents: 29800,
      quantityLimit: { minQuantity: 1, maxQuantity: 6, increment: 1 },
    });
    expect(result).not.toHaveProperty("checkoutReady");
    expect(JSON.stringify(result)).not.toMatch(/supplier|wholesale|sourceNote/i);
    expect(calls).toEqual({ limits: 1, price: 2 });
  });

  it.each([
    ["client unit price", { ...request(), unitPriceCents: 1 }],
    ["client subtotal", { ...request(), subtotalCents: 1 }],
    ["line price", request({ lines: [{ sku: SKU_A, quantity: 1, price: 1 } as never] })],
    ["line total", request({ lines: [{ sku: SKU_A, quantity: 1, lineTotalCents: 1 } as never] })],
    ["unknown key", { ...request(), surprise: true }],
    ["empty cart", request({ lines: [] })],
    ["fractional quantity", request({ lines: [{ sku: SKU_A, quantity: 1.5 }] })],
    ["zero quantity", request({ lines: [{ sku: SKU_A, quantity: 0 }] })],
    ["noncanonical sku", request({ lines: [{ sku: ` ${SKU_A}`, quantity: 1 }] })],
  ])("rejects hostile %s input before any authority call", async (_label, hostile) => {
    const { deps, calls } = harness();
    const result = await projectPeptideCartTransaction(
      hostile,
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({ state: "rejected", code: "invalid_request" });
    expect(calls).toEqual({ limits: 0, price: 0 });
  });

  it.each([
    "2026-08-02 23:00:00Z",
    "2026-08-02T23:00:00",
    "2026-02-30T23:00:00Z",
    "2026-08-02T23:00Z",
    "2026-08-02T23:00:00.1234567Z",
  ])("rejects noncanonical timestamp %s with zero authority calls", async (evaluatedAt) => {
    const { deps, calls } = harness();
    const result = await projectPeptideCartTransaction(
      request({ evaluatedAt }),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({ state: "rejected", code: "invalid_timestamp" });
    expect(calls).toEqual({ limits: 0, price: 0 });
  });

  it.each(["usd", "EUR", " USD"])(
    "enforces exact launch currency %s before authority calls",
    async (currency) => {
      const { deps, calls } = harness();
      const result = await projectPeptideCartTransaction(
        { ...request(), currency },
        { authenticatedAudience: audience() },
        deps,
      );
      expect(result).toMatchObject({ state: "rejected", code: "wrong_currency" });
      expect(calls).toEqual({ limits: 0, price: 0 });
    },
  );

  it("requires byte-identical server audience time and rejects forged context", async () => {
    const { deps, calls } = harness();
    const shifted = audience({ evaluatedAt: "2026-08-02T18:00:00-05:00" });
    const shiftedResult = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: shifted },
      deps,
    );
    expect(shiftedResult).toMatchObject({ state: "rejected", code: "wrong_audience" });

    const forged = {
      audience: "admin",
      sourceVersion: "forged",
      evaluatedAt: AT,
    } as unknown as ServerAuthorizedAudience;
    const forgedResult = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: forged },
      deps,
    );
    expect(forgedResult).toMatchObject({ state: "rejected", code: "wrong_audience" });
    expect(calls).toEqual({ limits: 0, price: 0 });
  });

  it("rejects duplicate SKU lines before authority calls", async () => {
    const { deps, calls } = harness();
    const result = await projectPeptideCartTransaction(
      request({
        lines: [
          { sku: SKU_A, quantity: 1 },
          { sku: SKU_A, quantity: 2 },
        ],
      }),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "rejected",
      code: "duplicate_sku",
      recovery: "merge_duplicate_line",
      lineIndex: 1,
      sku: SKU_A,
    });
    expect(calls).toEqual({ limits: 0, price: 0 });
  });

  it.each([
    ["missing", []],
    ["duplicate", [limit(), limit()]],
    ["wrong sku", [limit(SKU_B)]],
    ["zero min", [limit(SKU_A, { minQuantity: 0 })]],
    ["backward range", [limit(SKU_A, { minQuantity: 5, maxQuantity: 4 })]],
    ["zero increment", [limit(SKU_A, { increment: 0 })]],
    ["blank version", [limit(SKU_A, { sourceVersion: "" })]],
    ["free-text version", [limit(SKU_A, { sourceVersion: "private supplier note" })]],
    ["future", [limit(SKU_A, { effectiveAt: "2026-08-03T00:00:00Z" })]],
    ["expired", [limit(SKU_A, { expiresAt: AT })]],
    ["noncanonical time", [limit(SKU_A, { effectiveAt: "2026-08-01 00:00:00Z" })]],
    ["extra key", [{ ...limit(), supplierNote: "private" }]],
  ])("fails closed on %s quantity authority output before price lookup", async (_label, limits) => {
    const { deps, calls } = harness({ limits });
    const result = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "rejected",
      code: "quantity_policy_unavailable",
      recovery: "retry_later",
    });
    expect(calls).toEqual({ limits: 1, price: 0 });
  });

  it.each([
    [0, { minQuantity: 1, maxQuantity: 6, increment: 1 }],
    [7, { minQuantity: 1, maxQuantity: 6, increment: 1 }],
    [2, { minQuantity: 1, maxQuantity: 6, increment: 2 }],
  ])("enforces per-SKU quantity %s against Product Control limits", async (quantity, policy) => {
    const { deps, calls } = harness({ limits: [limit(SKU_A, policy)] });
    const result = await projectPeptideCartTransaction(
      request({ lines: [{ sku: SKU_A, quantity }] }),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "rejected",
      code: quantity === 0 ? "invalid_request" : "quantity_invalid",
    });
    expect(calls.price).toBe(0);
  });

  it("returns explicit reprice recovery without trusting a client amount", async () => {
    const { deps } = harness();
    const result = await projectPeptideCartTransaction(
      request({
        lines: [
          {
            sku: SKU_A,
            quantity: 2,
            acceptedPrice: fingerprint({ version: 2 }),
          },
        ],
      }),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "reprice_required",
      recovery: "review_updated_price",
      repricedSkus: [SKU_A],
      subtotalCents: 29800,
    });
    expect(JSON.stringify(result)).not.toContain("acceptedPrice");
  });

  it.each([
    ["wrong fingerprint audience", fingerprint({ audience: "wholesale" }), "wrong_audience"],
    ["wrong fingerprint currency", { ...fingerprint(), currency: "EUR" }, "wrong_currency"],
    ["client amount", { ...fingerprint(), unitAmountCents: 1 }, "invalid_request"],
    ["invalid price id", fingerprint({ priceId: "price-from-client" }), "invalid_request"],
  ])("rejects %s before calling either authority", async (_label, acceptedPrice, code) => {
    const { deps, calls } = harness();
    const result = await projectPeptideCartTransaction(
      request({ lines: [{ sku: SKU_A, quantity: 1, acceptedPrice: acceptedPrice as never }] }),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({ state: "rejected", code });
    expect(calls).toEqual({ limits: 0, price: 0 });
  });

  it.each([
    ["price_ambiguous", "price_ambiguous", "request_access"],
    ["wrong_audience", "wrong_audience", "reauthenticate"],
    ["price_expired", "price_unavailable", "remove_unavailable_item"],
    ["line_total_overflow", "calculation_overflow", "adjust_quantity"],
  ] as const)("maps %s to stable recovery contracts", async (reason, code, recovery) => {
    const { deps } = harness({
      bind: async () => ({ state: "rejected", reason }),
    });
    const result = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "rejected",
      code,
      recovery,
      authorityReason: reason,
    });
  });

  it("does not expose an unrecognized authority reason", async () => {
    const { deps } = harness({
      bind: async () =>
        ({ state: "rejected", reason: "private supplier note" }) as never,
    });
    const result = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toEqual({
      state: "rejected",
      code: "authority_unavailable",
      recovery: "retry_later",
      lineIndex: 0,
      sku: SKU_A,
    });
  });

  it.each([
    snapshot(SKU_A, 2, { currency: "EUR" as "USD" }),
    snapshot(SKU_A, 2, { audience: "wholesale" }),
    snapshot(SKU_A, 2, { pricedAt: "2026-08-02 23:00:00Z" }),
    snapshot(SKU_A, 2, { effectiveAt: "2026-08-03T00:00:00Z" }),
    snapshot(SKU_A, 2, { expiresAt: AT }),
    snapshot(SKU_A, 2, { unitAmountCents: 0, lineTotalCents: 0 }),
    snapshot(SKU_A, 2, { priceId: "not-a-price-id" }),
  ])("refuses malformed authority snapshots without exposing zero or fallback totals", async (hostile) => {
    const { deps } = harness({
      bind: async () => ({ state: "bound", snapshot: hostile }),
    });
    const result = await projectPeptideCartTransaction(
      request(),
      { authenticatedAudience: audience() },
      deps,
    );
    expect(result).toMatchObject({
      state: "rejected",
      code: "authority_unavailable",
      recovery: "retry_later",
    });
    expect(result).not.toHaveProperty("subtotalCents");
  });

  it("fails closed when either authority throws", async () => {
    const quantityFailure = harness();
    quantityFailure.deps.quantityLimits.resolveQuantityLimits = async () => {
      throw new Error("offline");
    };
    await expect(
      projectPeptideCartTransaction(
        request(),
        { authenticatedAudience: audience() },
        quantityFailure.deps,
      ),
    ).resolves.toMatchObject({
      state: "rejected",
      code: "quantity_policy_unavailable",
    });

    const priceFailure = harness({
      bind: async () => {
        throw new Error("offline");
      },
    });
    await expect(
      projectPeptideCartTransaction(
        request(),
        { authenticatedAudience: audience() },
        priceFailure.deps,
      ),
    ).resolves.toMatchObject({
      state: "rejected",
      code: "authority_unavailable",
    });
  });
});
