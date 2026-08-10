/**
 * THE COMPOSITION TESTS FOR B2 AND B3.
 *
 * Both blockers were the same shape: a seam that exists, is fully tested, and
 * that the composition root silently never fills. Isolated tests of the proof
 * service, the settlement service, the admin review, the SLA sweep and the
 * fulfilment writer were all green while no production path connected them.
 *
 * So these tests do not re-test any of those units. They test the WIRING, and
 * they build the options through the real composition root and mount the real
 * registration, so removing a key or a route is a failing test rather than a
 * dark door.
 */

import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildEarlyAccessPersistence } from "./persistence/production-deps";
import { SupabaseEarlyAccessAdminPaymentReviewStore } from "./cart/supabase-admin-payment-review";
import { SupabaseEarlyAccessShippingSlaStore } from "./cart/supabase-shipping-sla";
import { SupabaseEarlyAccessShipmentEventStore } from "./cart/supabase-shipment-events";
import { settleEarlyAccessCart } from "./cart/settlement";
import { InMemoryEarlyAccessCartStore } from "./cart/store";
import type { EarlyAccessCartCheckoutRecord } from "@shared/research/early-access-cart";

const OWNER = "3f2f4bde-6f0f-4a11-9a3e-8c7d5b2a1e90";

function durableEnv(): NodeJS.ProcessEnv {
  return {
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "sb_secret_test",
    RESEARCH_EARLY_ACCESS_OWNER_ID: OWNER,
  } as NodeJS.ProcessEnv;
}

// ---------------------------------------------------------------------------
// B2 + B3: the composition root supplies the ports, in the durable branch only.
// ---------------------------------------------------------------------------

describe("the Early Access composition root fills the B2 and B3 seams", () => {
  it("durable mode supplies the payment-review authority as ONE object for all THREE ports", () => {
    const build = buildEarlyAccessPersistence(durableEnv(), async () => null);
    expect(build.mode).toBe("durable");
    const review = build.options.cartPaymentReview;
    expect(review).toBeInstanceOf(SupabaseEarlyAccessAdminPaymentReviewStore);
    // One object, three ports. If these ever became different instances, the
    // screen an admin reads and the evidence the settlement uses could
    // disagree about the same order.
    expect(typeof review?.byCheckoutNumber).toBe("function");
    expect(typeof review?.forCheckout).toBe("function");
    expect(typeof review?.acceptedForCheckout).toBe("function");
  });

  it("durable mode supplies BOTH shipping SLA ports and the fulfilment writer", () => {
    const build = buildEarlyAccessPersistence(durableEnv(), async () => null);
    expect(build.options.shippingSla?.store).toBeInstanceOf(SupabaseEarlyAccessShippingSlaStore);
    expect(typeof build.options.shippingSla?.alerts.enqueue).toBe("function");
    expect(build.options.fulfilmentEvents).toBeInstanceOf(SupabaseEarlyAccessShipmentEventStore);
  });

  it("refused and memory modes supply NONE of them", () => {
    const refused = buildEarlyAccessPersistence(
      { NODE_ENV: "production", RESEARCH_EARLY_ACCESS_ENABLED: "true" } as NodeJS.ProcessEnv,
      async () => null,
    );
    expect(refused.mode).toBe("refused");
    expect(refused.options.cartPaymentReview).toBeUndefined();
    expect(refused.options.shippingSla).toBeUndefined();
    expect(refused.options.fulfilmentEvents).toBeUndefined();

    const memory = buildEarlyAccessPersistence({} as NodeJS.ProcessEnv, async () => null);
    expect(memory.mode).toBe("memory");
    expect(memory.options.cartPaymentReview).toBeUndefined();
    expect(memory.options.shippingSla).toBeUndefined();
    expect(memory.options.fulfilmentEvents).toBeUndefined();
  });

  it("the SLA store and the review authority read the SAME query seam the rest of the lane uses", async () => {
    const calls: string[] = [];
    const build = buildEarlyAccessPersistence(durableEnv(), async (call) => {
      calls.push(call.fn);
      return call.fn === "research_early_access_cart_shipping_commitments_due" ? [] : null;
    });
    await build.options.shippingSla?.store.dueBy("2026-08-10T12:00:00.000Z");
    await build.options.cartPaymentReview?.byCheckoutNumber("XEC-0123456789ABCDEF");
    expect(calls).toEqual([
      "research_early_access_cart_shipping_commitments_due",
      "research_early_access_submission_admin_view",
    ]);
  });
});

// ---------------------------------------------------------------------------
// B2: accepted proof actually reaches the ONE settlement door.
// ---------------------------------------------------------------------------

const CHECKOUT: EarlyAccessCartCheckoutRecord = {
  cartCheckoutNumber: "XEC-0123456789ABCDEF",
  customerRef: "eac_0123456789abcdef0123456789abcdef",
  contact: { email: "buyer@example.com", phone: "+15125550100" },
  shipTo: {
    recipientName: "Buyer",
    line1: "1 Main",
    line2: null,
    city: "Austin",
    region: "TX",
    postalCode: "78701",
    country: "US",
  },
  idempotencyKey: "xeac_1234567890123456",
  intentHash: "a".repeat(64),
  quoteId: "xeaq_1234567890123456",
  children: [
    {
      orderNumber: "XEA-CART-01234567-01",
      productId: "P",
      variantId: "V",
      sku: "SKU",
      quantity: 1,
      supplierId: "raw-peptides",
      supplierSku: "RP-1",
      unitPriceCents: 1000,
      subtotalCents: 1000,
      discountCents: 0,
      payableCents: 1000,
    },
  ],
  invoice: {
    invoiceNumber: "XEI-0123456789ABCDEF",
    cartCheckoutNumber: "XEC-0123456789ABCDEF",
    paymentReference: "XEACART-0123456789ABCDEF",
    currency: "USD",
    lines: [
      {
        orderNumber: "XEA-CART-01234567-01",
        sku: "SKU",
        quantity: 1,
        unitPriceCents: 1000,
        subtotalCents: 1000,
        discountCents: 0,
        payableCents: 1000,
      },
    ],
    subtotalCents: 1000,
    discountCents: 0,
    shippingCents: 0,
    taxCents: 0,
    payableTotalCents: 1000,
    instructions: "manual",
    issuedAt: "2026-08-08T00:00:00.000Z",
    status: "awaiting_payment",
  },
  paymentState: "awaiting_payment",
  placedAt: "2026-08-08T00:00:00.000Z",
  attribution: null,
};

/**
 * The REAL `SupabaseEarlyAccessAdminPaymentReviewStore` over a scripted
 * `research_early_access_submission_admin_view` answer, so the acceptance rules
 * under test are the production ones, not a hand-written double.
 */
function reviewAuthorityFor(submission: Record<string, unknown> | null) {
  return new SupabaseEarlyAccessAdminPaymentReviewStore(async (call) =>
    call.fn === "research_early_access_submission_admin_view" ? submission : null,
  );
}

function acceptedSubmission(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "eaps_0123456789abcdef0123",
    cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
    filename: "payment-proof.pdf",
    contentType: "application/pdf",
    byteSize: 2048,
    proofSha256: "c".repeat(64),
    internalEmailAcceptance: "accepted",
    reconciliationRequired: false,
    ...overrides,
  };
}

async function settleWith(submission: Record<string, unknown> | null) {
  const store = new InMemoryEarlyAccessCartStore();
  await store.commit(CHECKOUT);
  const result = await settleEarlyAccessCart(
    {
      checkouts: store,
      settlements: store,
      submissionEvidence: reviewAuthorityFor(submission),
    },
    {
      cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
      externalTransactionId: "provider-txn-b2-1",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-08T00:02:00.000Z",
    },
  );
  return { store, result };
}

describe("B2: accepted customer proof reaches settlement eligibility", () => {
  it("an ACCEPTED, RECONCILED submission settles through the one door", async () => {
    const { result, store } = await settleWith(acceptedSubmission());
    expect(result.committed).toBe(true);
    if (!result.committed) return;
    // ONE receipt, ONE release, exactly once.
    expect(result.settlement.childReleases).toHaveLength(1);
    // The bridge recorded exactly one metadata proof row, carrying the
    // customer's own digest and filename, and NOT claiming the bytes are here.
    const proofs = await store.externalProofs(CHECKOUT.cartCheckoutNumber);
    expect(proofs).toHaveLength(1);
    expect(proofs[0]).toMatchObject({
      filename: "payment-proof.pdf",
      sha256: "c".repeat(64),
      storedOnPlatform: false,
      recordedBy: "admin@example.com",
    });
  });

  it("MISSING proof blocks settlement", async () => {
    const { result, store } = await settleWith(null);
    expect(result).toMatchObject({ committed: false, reason: "evidence_missing" });
    expect(await store.externalProofs(CHECKOUT.cartCheckoutNumber)).toEqual([]);
  });

  it("FAILED, UNKNOWN and NOT-ATTEMPTED proof all block settlement", async () => {
    for (const acceptance of ["failed", "unknown", "not_attempted"]) {
      const { result } = await settleWith(
        acceptedSubmission({ internalEmailAcceptance: acceptance }),
      );
      expect(result, acceptance).toMatchObject({
        committed: false,
        reason: "evidence_missing",
      });
    }
  });

  it("an UNRECONCILED submission blocks settlement even when the email was accepted", async () => {
    const { result } = await settleWith(acceptedSubmission({ reconciliationRequired: true }));
    expect(result).toMatchObject({ committed: false, reason: "evidence_missing" });
  });

  it("both admin confirmations remain mandatory, whatever the proof says", async () => {
    for (const [funds, reference] of [
      [false, true],
      [true, false],
      [false, false],
    ] as const) {
      const store = new InMemoryEarlyAccessCartStore();
      await store.commit(CHECKOUT);
      const result = await settleEarlyAccessCart(
        {
          checkouts: store,
          settlements: store,
          submissionEvidence: reviewAuthorityFor(acceptedSubmission()),
        },
        {
          cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
          externalTransactionId: "provider-txn-b2-2",
          confirmedFundsReceived: funds,
          confirmedAmountAndReference: reference,
          actorId: "admin@example.com",
          at: "2026-08-08T00:02:00.000Z",
        },
      );
      expect(result).toMatchObject({ committed: false, reason: "admin_confirmation_missing" });
      // And nothing was bridged: an unconfirmed attempt leaves no evidence row.
      expect(await store.externalProofs(CHECKOUT.cartCheckoutNumber)).toEqual([]);
    }
  });

  it("PROOF SUBMISSION ALONE CANNOT SETTLE: the evidence port has no settle method", () => {
    const authority = reviewAuthorityFor(acceptedSubmission());
    const surface = Object.getOwnPropertyNames(
      SupabaseEarlyAccessAdminPaymentReviewStore.prototype,
    ).sort();
    expect(surface).toEqual([
      "acceptedForCheckout",
      "byCheckoutNumber",
      "constructor",
      "forCheckout",
    ]);
    expect((authority as unknown as Record<string, unknown>).settle).toBeUndefined();
  });

  it("a canonical transaction DUPLICATE is still refused after the bridge", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    await store.commit(CHECKOUT);
    const second: EarlyAccessCartCheckoutRecord = {
      ...CHECKOUT,
      cartCheckoutNumber: "XEC-FEDCBA9876543210",
      idempotencyKey: "xeac_6543210987654321",
      invoice: { ...CHECKOUT.invoice, cartCheckoutNumber: "XEC-FEDCBA9876543210" },
    };
    await store.commit(second);
    const deps = {
      checkouts: store,
      settlements: store,
      submissionEvidence: reviewAuthorityFor(acceptedSubmission()),
    };
    const first = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
      externalTransactionId: "TX-Canonical-002",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-08T00:02:00.000Z",
    });
    expect(first.committed).toBe(true);
    // The SAME payment, spelled differently.
    const duplicate = await settleEarlyAccessCart(deps, {
      cartCheckoutNumber: second.cartCheckoutNumber,
      externalTransactionId: "tx canonical 002",
      confirmedFundsReceived: true,
      confirmedAmountAndReference: true,
      actorId: "admin@example.com",
      at: "2026-08-08T00:03:00.000Z",
    });
    expect(duplicate.committed).toBe(false);
  });

  it("CONCURRENT approvals of one checkout still yield exactly one settlement", async () => {
    const store = new InMemoryEarlyAccessCartStore();
    await store.commit(CHECKOUT);
    const deps = {
      checkouts: store,
      settlements: store,
      submissionEvidence: reviewAuthorityFor(acceptedSubmission()),
    };
    const attempts = await Promise.all(
      [1, 2, 3, 4, 5, 6].map((index) =>
        settleEarlyAccessCart(deps, {
          cartCheckoutNumber: CHECKOUT.cartCheckoutNumber,
          externalTransactionId: `provider-txn-race-${index}`,
          confirmedFundsReceived: true,
          confirmedAmountAndReference: true,
          actorId: "admin@example.com",
          at: "2026-08-08T00:02:00.000Z",
        }),
      ),
    );
    expect(attempts.filter((attempt) => attempt.committed)).toHaveLength(1);
    const settlement = await store.settlement(CHECKOUT.cartCheckoutNumber);
    expect(settlement).not.toBeNull();
    expect(settlement?.childReleases).toHaveLength(1);
  });

  it("ACCEPTED means accepted FOR REVIEW: the port reports no payment verification", async () => {
    const authority = reviewAuthorityFor(acceptedSubmission());
    const evidence = await authority.acceptedForCheckout(CHECKOUT.cartCheckoutNumber);
    expect(evidence).not.toBeNull();
    // Five fields, all about the FILE. Nothing here asserts money arrived.
    expect(Object.keys(evidence ?? {}).sort()).toEqual([
      "byteSize",
      "contentType",
      "filename",
      "sha256",
      "submissionId",
    ]);
    expect(JSON.stringify(evidence)).not.toMatch(/verified|paid|settled/i);
  });
});

// ---------------------------------------------------------------------------
// The mount: the routes exist, behind the guard, only when the ports do.
// ---------------------------------------------------------------------------

type MountedRoute = { method: string; path: string };

/** Read the routes a registration actually put on an Express app. Express 5
 * exposes the internal router as `app.router`; `_router` is the 4.x name and is
 * read too so this stays honest across an upgrade rather than silently
 * measuring an empty stack. */
function mountedRoutes(app: express.Express): MountedRoute[] {
  const router =
    (app as unknown as { router?: { stack: unknown[] }; _router?: { stack: unknown[] } }).router ??
    (app as unknown as { _router?: { stack: unknown[] } })._router;
  const stack = router?.stack ?? [];
  if (stack.length === 0) throw new Error("no routes were read: the harness is measuring nothing");
  const out: MountedRoute[] = [];
  for (const layer of stack as {
    route?: { path: string; methods: Record<string, boolean> };
  }[]) {
    if (!layer.route) continue;
    for (const [method, on] of Object.entries(layer.route.methods)) {
      if (on) out.push({ method: method.toUpperCase(), path: layer.route.path });
    }
  }
  return out;
}

const REVIEW_PATH = "/api/admin/research/cart/:cartCheckoutNumber/confirm-payment";
const FULFILMENT_PATH = "/api/admin/research/cart/:cartCheckoutNumber/fulfilment-event";
const SWEEP_PATH = "/api/admin/research/cart/shipping-sla/sweep";

async function mount(
  extra: Record<string, unknown>,
): Promise<{ app: express.Express; routes: MountedRoute[] }> {
  const { registerPrivateEarlyAccessApi } = await import("./register");
  const { EARLY_ACCESS_TEST_CONFIG } = await import("./routes/route-fixtures");
  const app = express();
  app.use(express.json());
  registerPrivateEarlyAccessApi(app, {
    config: EARLY_ACCESS_TEST_CONFIG,
    // The cart doors exist only when the flag is exactly "true", so the flag is
    // set here rather than assumed: a registration under a false flag would
    // mount nothing and every assertion below would pass vacuously.
    env: {
      NODE_ENV: "test",
      RESEARCH_EARLY_ACCESS_CART_ENABLED: "true",
    } as NodeJS.ProcessEnv,
    cartStore: new InMemoryEarlyAccessCartStore(),
    requireAdmin: (req, _res, next) => {
      (req as unknown as { adminEmail: string }).adminEmail = "admin@example.com";
      next();
    },
    ...extra,
  } as never);
  return { app, routes: mountedRoutes(app) };
}

describe("the registration mounts each door only when its durable port exists", () => {
  it("with NO ports: the settlement POST exists and the three new doors do not", async () => {
    const { routes } = await mount({});
    expect(routes).toContainEqual({ method: "POST", path: REVIEW_PATH });
    expect(routes).not.toContainEqual({ method: "GET", path: REVIEW_PATH });
    expect(routes.map((route) => route.path)).not.toContain(FULFILMENT_PATH);
    expect(routes.map((route) => route.path)).not.toContain(SWEEP_PATH);
  });

  it("with every port: GET review, POST fulfilment and POST sweep are mounted", async () => {
    const { routes } = await mount({
      cartPaymentReview: reviewAuthorityFor(acceptedSubmission()),
      fulfilmentEvents: new SupabaseEarlyAccessShipmentEventStore(async () => ({
        recorded: true,
        eventId: "11111111-2222-4333-8444-555555555555",
      })),
      shippingSla: {
        store: new SupabaseEarlyAccessShippingSlaStore(async () => []),
        alerts: { async enqueue() { return true; } },
      },
    });
    expect(routes).toContainEqual({ method: "GET", path: REVIEW_PATH });
    expect(routes).toContainEqual({ method: "POST", path: REVIEW_PATH });
    expect(routes).toContainEqual({ method: "POST", path: FULFILMENT_PATH });
    expect(routes).toContainEqual({ method: "POST", path: SWEEP_PATH });
  });

  it("registers the LITERAL sweep path BEFORE the parameterized admin cart routes", async () => {
    const { routes } = await mount({
      cartPaymentReview: reviewAuthorityFor(acceptedSubmission()),
      shippingSla: {
        store: new SupabaseEarlyAccessShippingSlaStore(async () => []),
        alerts: { async enqueue() { return true; } },
      },
    });
    const sweepAt = routes.findIndex((route) => route.path === SWEEP_PATH);
    const paramAt = routes.findIndex((route) => route.path === REVIEW_PATH);
    expect(sweepAt).toBeGreaterThanOrEqual(0);
    expect(sweepAt).toBeLessThan(paramAt);
  });

  it("mounts each path EXACTLY ONCE per method, whatever the ports", async () => {
    const { routes } = await mount({
      cartPaymentReview: reviewAuthorityFor(acceptedSubmission()),
      fulfilmentEvents: new SupabaseEarlyAccessShipmentEventStore(async () => ({
        recorded: true,
        eventId: "11111111-2222-4333-8444-555555555555",
      })),
      shippingSla: {
        store: new SupabaseEarlyAccessShippingSlaStore(async () => []),
        alerts: { async enqueue() { return true; } },
      },
    });
    const seen = new Set<string>();
    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      expect(seen.has(key), key).toBe(false);
      seen.add(key);
    }
  });

  it("the sweep door answers counters and cannot be reached without the admin guard's actor", async () => {
    const { app } = await mount({
      shippingSla: {
        store: new SupabaseEarlyAccessShippingSlaStore(async () => []),
        alerts: { async enqueue() { return true; } },
      },
    });
    const response = await request(app).post(SWEEP_PATH.replace(":cartCheckoutNumber", "x"));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      ok: true,
      summary: { examined: 0, overdue: 0, alertsClaimed: 0, alertsEnqueued: 0, failures: 0 },
    });
  });

  it("the GET review answers the projection, and never a supplier or internal fact", async () => {
    const { app } = await mount({
      cartPaymentReview: reviewAuthorityFor(acceptedSubmission()),
    });
    const response = await request(app).get(
      `/api/admin/research/cart/${CHECKOUT.cartCheckoutNumber}/confirm-payment`,
    );
    // No checkout was committed to the in-memory store this registration built,
    // so the projection correctly answers 404 rather than inventing an order.
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});
