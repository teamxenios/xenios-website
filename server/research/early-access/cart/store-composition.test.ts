import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EarlyAccessCartStoreUnavailable,
  isProductionLikeEnvironment,
  resolveEarlyAccessCartStore,
} from "./store-composition";
import { InMemoryEarlyAccessCartStore } from "./store";
import { EARLY_ACCESS_CART_ENV } from "./feature-flag";
import { registerPrivateEarlyAccessApi } from "../register";
import {
  EARLY_ACCESS_TEST_CONFIG,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "../routes/route-fixtures";

/**
 * F4 — THE CART MAY NOT SILENTLY REMEMBER A CHECKOUT IN RAM.
 *
 * The composition read `options.cartStore ?? new InMemoryEarlyAccessCartStore()`.
 * Harmless in a test, unacceptable in production, and dangerous precisely
 * because it was reached by OMISSION: a deployment that enabled the cart flag
 * without wiring the durable store would boot cleanly, accept real money
 * against a parent checkout held in process memory, and lose every child order
 * on the next restart. Nothing would look wrong until a customer asked where
 * their order had gone.
 *
 * A fallback you get by forgetting is a trapdoor, not a fallback.
 */

const DURABLE = new InMemoryEarlyAccessCartStore();

describe("what counts as production", () => {
  it("treats test and development as safe to improvise in", () => {
    expect(isProductionLikeEnvironment({ NODE_ENV: "test" })).toBe(false);
    expect(isProductionLikeEnvironment({ NODE_ENV: "development" })).toBe(false);
  });

  it("treats production, staging and UNKNOWN alike", () => {
    // Unknown counts as production on purpose. The failure modes are not
    // symmetric: refusing to boot a mislabelled box costs an engineer ten
    // minutes, and accepting money into RAM costs a customer their order.
    expect(isProductionLikeEnvironment({ NODE_ENV: "production" })).toBe(true);
    expect(isProductionLikeEnvironment({ NODE_ENV: "staging" })).toBe(true);
    expect(isProductionLikeEnvironment({})).toBe(true);
    expect(isProductionLikeEnvironment({ NODE_ENV: "" })).toBe(true);
  });
});

describe("resolving the store", () => {
  it("uses the durable store whenever one is configured", () => {
    expect(
      resolveEarlyAccessCartStore({ durable: DURABLE, env: { NODE_ENV: "production" } }),
    ).toBe(DURABLE);
  });

  it("REFUSES in production when no durable store was configured", () => {
    // The whole point of the phase. Failing to boot is the correct outcome.
    expect(() => resolveEarlyAccessCartStore({ env: { NODE_ENV: "production" } })).toThrow(
      EarlyAccessCartStoreUnavailable,
    );
  });

  it("refuses even when an ephemeral store is explicitly offered in production", () => {
    // Asking for the memory store loudly is still asking for the wrong thing
    // here. It is allowed to exist, not allowed to take money.
    expect(() =>
      resolveEarlyAccessCartStore({
        unsafeMemoryStore: new InMemoryEarlyAccessCartStore(),
        env: { NODE_ENV: "production" },
      }),
    ).toThrow(EarlyAccessCartStoreUnavailable);
  });

  it("says what to do, not merely that something is wrong", () => {
    let message = "";
    try {
      resolveEarlyAccessCartStore({ env: {} });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain("research_early_access_commit_cart_checkout");
    expect(message).toContain("RESEARCH_EARLY_ACCESS_CART_ENABLED");
  });

  it("allows an explicit memory store outside production", () => {
    const memory = new InMemoryEarlyAccessCartStore();
    expect(
      resolveEarlyAccessCartStore({ unsafeMemoryStore: memory, env: { NODE_ENV: "test" } }),
    ).toBe(memory);
  });

  it("allows the convenience default outside production", () => {
    // A test that loses its cart on restart has lost nothing.
    expect(resolveEarlyAccessCartStore({ env: { NODE_ENV: "test" } })).toBeInstanceOf(
      InMemoryEarlyAccessCartStore,
    );
  });
});

describe("the real registration, which is where the trapdoor was", () => {
  async function register(env: NodeJS.ProcessEnv, durable?: InMemoryEarlyAccessCartStore) {
    const unit = cleanUnit();
    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      agreements: new StubAgreementGate(true),
      suppliers: new StubSupplierDirectory(SUPPLIER_ASSIGNMENT),
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
      env,
      ...(durable === undefined ? {} : { cartCheckoutStore: durable }),
    });
    return app;
  }

  it("REFUSES TO BOOT: production, cart enabled, no durable store", async () => {
    // Before this change the same call returned a working app whose checkout
    // door wrote to a Map.
    await expect(
      register({ NODE_ENV: "production", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv),
    ).rejects.toThrow(EarlyAccessCartStoreUnavailable);
  });

  it("boots in production with the cart enabled AND a durable store", async () => {
    const app = await register(
      { NODE_ENV: "production", [EARLY_ACCESS_CART_ENV]: "true" } as NodeJS.ProcessEnv,
      new InMemoryEarlyAccessCartStore(),
    );
    // Mounted: the quote door exists and refuses an unauthenticated caller
    // rather than answering 404 for a missing route.
    const got = await request(app).post("/api/research/early-access/cart/quote").send({});
    expect(got.status).not.toBe(404);
  }, 30_000);

  it("boots in production with the cart DISABLED and no store, as before", async () => {
    // The flag being off must not be made harder by this change. Nothing about
    // the existing single-product deployment changes.
    const app = await register({ NODE_ENV: "production" } as NodeJS.ProcessEnv);
    const got = await request(app).post("/api/research/early-access/cart/quote").send({});
    expect(got.status).toBe(404);
  }, 30_000);
});
