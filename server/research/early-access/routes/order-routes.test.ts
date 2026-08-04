import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

// The admin guard is the only thing these customer routes pull from the wider
// server, and dragging its module graph (Postgres, email, Turnstile) into a
// route test would prove nothing and slow everything. The admin surface has its
// own test file.
vi.mock("../../../routes", () => ({
  requireSupabaseAdmin(_req: unknown, res: { status(code: number): { json(body: unknown): unknown } }) {
    res.status(401).json({ ok: false });
  },
}));

import { InMemoryEarlyAccessReleaseLedger, earlyAccessReleaseVersion } from "../release/founder-release";
import {
  CUSTOMER_ALPHA,
  CUSTOMER_BETA,
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  OPERATIONAL_ONLY,
  SHIP_TO,
  StubAgreementGate,
  StubIdentityDirectory,
  StubShippingPolicy,
  StubSupplierDirectory,
  UNIT_PRICE_CENTS,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

// The Early Access commerce routes over real HTTP.
//
// Everything below runs through the registered Express app, the real Private
// Early Access gate, and the real commerce domain. The only stubs are the things
// that genuinely live outside this lane: who the customer is, what they have
// agreed to, which supplier is assigned, and where xenios can ship.
//
// The two properties these tests exist to defend, because both fail silently:
//
//   1. ONE CUSTOMER MUST NEVER READ ANOTHER'S ORDER. The gate is a shared
//      password, so a session is not an identity, and every read is authorized
//      against the resolved customer.
//   2. A PROOF IS NOT A PAYMENT. Submitting a screenshot must leave the order
//      unpaid, with no receipt, no supplier order, and no commission.

const ORDERS = "/api/research/early-access/orders";

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  expect(unlocked.status).toBe(200);
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  const cookie = raw.split(";")[0] ?? "";
  expect(cookie.length).toBeGreaterThan(0);
  return cookie;
}

/** The default: one clean unit, released and priced by the founder. */
async function releasedApp(overrides: Record<string, unknown> = {}) {
  const unit = cleanUnit();
  const harness = makeEarlyAccessApp({
    catalog: catalogOf([unit]),
    releases: await approvedLedgerFor(unit),
    ...overrides,
  });
  return { unit, ...harness };
}

async function place(app: Express, cookie: string, body: Record<string, unknown> = {}) {
  return request(app)
    .post(ORDERS)
    .set("Cookie", cookie)
    .send({ ...ORDER_BODY, ...body });
}

describe("placing an Early Access order", () => {
  it("prices, discounts, invoices and returns the order, all server side", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);

    const placed = await place(app, cookie);

    expect(placed.status).toBe(201);
    expect(placed.body.ok).toBe(true);
    expect(placed.body.replayed).toBe(false);
    const order = placed.body.order;
    // Three units at 19,900 is 59,700, less the twenty percent bundle, is 47,760.
    expect(order.money).toMatchObject({
      currency: "USD",
      unitPriceCents: UNIT_PRICE_CENTS,
      subtotalCents: 59_700,
      discountCents: 11_940,
      payableTotalCents: 47_760,
    });
    expect(order.paymentState).toBe("awaiting_payment");
    expect(order.orderNumber).toMatch(/^XEA-[0-9ABCDEFGHJKMNPQRSTVWXYZ]{16}$/);
    expect(order.invoice.paymentReference.length).toBeGreaterThan(0);
  });

  it("answers with no-store private headers", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.headers["cache-control"]).toBe("no-store");
    expect(placed.headers["x-robots-tag"]).toBe("noindex, nofollow");
    expect(placed.headers["referrer-policy"]).toBe("no-referrer");
  });

  it("ignores a price, a total and a referral code the client tries to send", async () => {
    const { app } = await releasedApp({ referrals: undefined });
    const cookie = await openSession(app);

    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({
        ...ORDER_BODY,
        priceCents: 1,
        totalCents: 1,
        unitPriceCents: 1,
        currency: "EUR",
        referralCode: "STOLEN-CODE",
        customerRef: "cust-somebody-else",
        orderId: "attacker-chosen-id",
      });

    // Not refused, and not obeyed: those keys are never read.
    expect(placed.status).toBe(201);
    expect(placed.body.order.money.payableTotalCents).toBe(47_760);
    expect(placed.body.order.money.currency).toBe("USD");
    expect(placed.body.order.orderNumber).not.toBe("attacker-chosen-id");
  });

  it("replays one idempotency key instead of placing a second order", async () => {
    const { app, store } = await releasedApp();
    const cookie = await openSession(app);

    const first = await place(app, cookie);
    const second = await place(app, cookie);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.replayed).toBe(true);
    expect(second.body.order.orderNumber).toBe(first.body.order.orderNumber);
    expect((await store.awaitingReview()).length).toBe(0);
  });

  it("refuses one key reused for a different order", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);

    await place(app, cookie);
    const conflicting = await place(app, cookie, { quantity: 1 });

    expect(conflicting.status).toBe(409);
    expect(conflicting.body.code).toBe("IDEMPOTENCY_CONFLICT");
  });
});

describe("the refusal vocabulary, in the order the checks run", () => {
  it("SESSION_REQUIRED without a live Early Access session", async () => {
    const { app } = await releasedApp();
    const placed = await request(app).post(ORDERS).send({ ...ORDER_BODY });
    expect(placed.status).toBe(401);
    expect(placed.body.code).toBe("SESSION_REQUIRED");
  });

  it("SESSION_REQUIRED for a forged cookie, even with an identity on file", async () => {
    const { app } = await releasedApp();
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", "xenios_ea=not-a-real-signed-session")
      .send({ ...ORDER_BODY });
    expect(placed.status).toBe(401);
    expect(placed.body.code).toBe("SESSION_REQUIRED");
  });

  it("IDENTITY_REQUIRED when the session is live but nobody is behind it", async () => {
    const { app } = await releasedApp({
      identity: new StubIdentityDirectory().always(null),
    });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("IDENTITY_REQUIRED");
  });

  it("AGREEMENT_REQUIRED when the customer has not accepted what they must", async () => {
    const { app } = await releasedApp({ agreements: new StubAgreementGate(false) });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(403);
    expect(placed.body.code).toBe("AGREEMENT_REQUIRED");
  });

  it("PRODUCT_HELD for a unit Product Control holds on its contents", async () => {
    const doubtful = cleanUnit({
      blockers: [...OPERATIONAL_ONLY, "STRENGTH_DISPUTE_UNRESOLVED"],
    });
    const { app } = await releasedApp({
      catalog: catalogOf([doubtful]),
      releases: await approvedLedgerFor(doubtful),
    });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRODUCT_HELD");
  });

  it("PRODUCT_HELD for a unit that is not in the catalog at all", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await place(app, cookie, { productId: "prod-does-not-exist" });
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRODUCT_HELD");
  });

  it("RELEASE_REQUIRED when no founder has approved the unit", async () => {
    const unit = cleanUnit();
    const { app } = await releasedApp({
      catalog: catalogOf([unit]),
      releases: new InMemoryEarlyAccessReleaseLedger(),
    });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("RELEASE_REQUIRED");
  });

  it("RELEASE_STALE when the product changed after the founder approved it", async () => {
    const approvedAgainst = cleanUnit();
    const ledger = await approvedLedgerFor(approvedAgainst);
    // The founder approved a 10 mg vial; Product Control now says 20 mg.
    const changed = cleanUnit({ strength: "20 mg" });
    const { app } = await releasedApp({ catalog: catalogOf([changed]), releases: ledger });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("RELEASE_STALE");
  });

  it("RELEASE_REVOKED after the founder pulls the unit", async () => {
    const unit = cleanUnit();
    const ledger = await approvedLedgerFor(unit);
    const revoked = await ledger.append({
      releaseId: "rel-route-0002",
      productId: unit.productId,
      variantId: unit.variantId,
      productVersion: earlyAccessReleaseVersion(unit),
      status: "revoked",
      approvedPriceCents: 0,
      currency: "",
      waivedBlockers: [],
      approvedQuantityLimit: 0,
      expiresAt: null,
      actor: "Samuel Boadu",
      reason: "Pulled pending the lab documentation.",
      recordedAt: new Date(Date.UTC(2026, 7, 2)).toISOString(),
    });
    expect(revoked.ok).toBe(true);

    const { app } = await releasedApp({ catalog: catalogOf([unit]), releases: ledger });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("RELEASE_REVOKED");
  });

  it("PRICE_CHANGED when the customer echoes a price the server no longer holds", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await place(app, cookie, { expectedUnitPriceCents: 9_900 });
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRICE_CHANGED");
    // The current price is returned so the storefront can re-render truthfully.
    expect(placed.body.unitPriceCents).toBe(UNIT_PRICE_CENTS);
  });

  it("QUANTITY_EXCEEDED above the portal ceiling", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await place(app, cookie, { quantity: 4 });
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("QUANTITY_EXCEEDED");
  });

  it("QUANTITY_EXCEEDED above the per-unit supply cap Product Control recorded", async () => {
    const capped = cleanUnit({ quantityLimit: 1 });
    const { app } = await releasedApp({
      catalog: catalogOf([capped]),
      releases: await approvedLedgerFor(capped),
    });
    const cookie = await openSession(app);
    const placed = await place(app, cookie, { quantity: 2 });
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("QUANTITY_EXCEEDED");
    expect(placed.body.maximum).toBe(1);
  });

  it("SUPPLIER_UNAVAILABLE when no supplier is assigned to the unit", async () => {
    const { app } = await releasedApp({ suppliers: new StubSupplierDirectory(null) });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("SUPPLIER_UNAVAILABLE");
  });

  it("SHIPPING_UNAVAILABLE when xenios does not serve the destination", async () => {
    const { app } = await releasedApp({ shipping: new StubShippingPolicy(false) });
    const cookie = await openSession(app);
    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("SHIPPING_UNAVAILABLE");
  });

  it("REQUEST_INVALID for a malformed shipping destination", async () => {
    const { app } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await place(app, cookie, {
      shipTo: { ...SHIP_TO, country: "United States" },
    });
    expect(placed.status).toBe(400);
    expect(placed.body.code).toBe("REQUEST_INVALID");
  });
});

describe("nothing persists unless everything persists", () => {
  it("leaves no order behind when the placement is refused", async () => {
    const { app, store } = await releasedApp({ shipping: new StubShippingPolicy(false) });
    const cookie = await openSession(app);

    const placed = await place(app, cookie);
    expect(placed.status).toBe(409);

    // Not the order, not the invoice, not the idempotency claim. The key is
    // still free, so a corrected request is a first attempt rather than a
    // conflict against a half-written order.
    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
    expect(await store.placementByOrderNumber("XEA-0000000000000001")).toBeNull();
  });

  it("commits the order and its invoice together, never one without the other", async () => {
    const { app, store } = await releasedApp();
    const cookie = await openSession(app);

    const placed = await place(app, cookie);
    const stored = await store.placementByOrderNumber(placed.body.order.orderNumber);

    expect(stored).not.toBeNull();
    expect(stored?.invoice.orderId).toBe(placed.body.order.orderNumber);
    expect(stored?.invoice.totalCents).toBe(47_760);
    expect(stored?.paymentState).toBe("awaiting_payment");
  });

  it("two concurrent placements under one key produce ONE order", async () => {
    const { app, store } = await releasedApp();
    const cookie = await openSession(app);

    const [first, second] = await Promise.all([place(app, cookie), place(app, cookie)]);

    const numbers = [first.body.order?.orderNumber, second.body.order?.orderNumber];
    expect(numbers[0]).toBe(numbers[1]);
    expect([first.status, second.status].sort()).toEqual([200, 201]);
    expect(await store.placementByOrderNumber("XEA-0000000000000002")).toBeNull();
  });
});

describe("reading an order back", () => {
  async function placedOrder() {
    const identity = new StubIdentityDirectory();
    const { app, store } = await releasedApp({ identity });
    const alphaCookie = await openSession(app);
    identity.bind(alphaCookie.split("=")[1] ?? alphaCookie, CUSTOMER_ALPHA);
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", alphaCookie)
      .send({ ...ORDER_BODY });
    expect(placed.status).toBe(201);
    return {
      app,
      store,
      identity,
      alphaCookie,
      orderNumber: placed.body.order.orderNumber as string,
    };
  }

  it("returns the owner's own order", async () => {
    const { app, alphaCookie, orderNumber } = await placedOrder();
    const read = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", alphaCookie);
    expect(read.status).toBe(200);
    expect(read.body.order.orderNumber).toBe(orderNumber);
    expect(read.body.payment.paid).toBe(false);
    expect(read.body.receipt).toBeNull();
  });

  it("returns the owner's own invoice", async () => {
    const { app, alphaCookie, orderNumber } = await placedOrder();
    const read = await request(app)
      .get(`${ORDERS}/${orderNumber}/invoice`)
      .set("Cookie", alphaCookie);
    expect(read.status).toBe(200);
    expect(read.body.invoice.payableTotalCents).toBe(47_760);
    expect(read.body.invoice.orderNumber).toBe(orderNumber);
    // The invoice may never carry a payment destination.
    expect(JSON.stringify(read.body)).not.toMatch(/routing|account number|wallet/i);
  });

  it("REFUSES a second signed-in customer reading the first customer's order", async () => {
    const { app, identity, orderNumber } = await placedOrder();

    // A second, genuinely live session, belonging to somebody else. The shared
    // gate password is not a key to the order book.
    const betaCookie = await openSession(app);
    identity.bind(betaCookie.split("=")[1] ?? betaCookie, CUSTOMER_BETA);

    const order = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", betaCookie);
    const invoice = await request(app)
      .get(`${ORDERS}/${orderNumber}/invoice`)
      .set("Cookie", betaCookie);

    expect(order.status).toBe(404);
    expect(order.body.code).toBe("ORDER_NOT_FOUND");
    expect(invoice.status).toBe(404);
    // Identical to a genuinely missing order, so the endpoint is not an oracle
    // for which order numbers exist.
    const missing = await request(app)
      .get(`${ORDERS}/XEA-0000000000009999`)
      .set("Cookie", betaCookie);
    expect(missing.status).toBe(404);
    expect(missing.body).toEqual(order.body);
  });

  it("refuses a lookup with no session at all", async () => {
    const { app, orderNumber } = await placedOrder();
    const read = await request(app).get(`${ORDERS}/${orderNumber}`);
    expect(read.status).toBe(401);
    expect(read.body.code).toBe("SESSION_REQUIRED");
  });

  it("exposes no sequential internal id anywhere in the response", async () => {
    const { app, alphaCookie, orderNumber } = await placedOrder();
    const read = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", alphaCookie);
    const body = JSON.stringify(read.body);
    expect(body).not.toContain("releaseId");
    expect(body).not.toContain("productVersion");
    expect(body).not.toContain("customerRef");
    expect(body).not.toContain("supplierId");
  });
});

describe("submitting payment proof", () => {
  const PROOF = Object.freeze({
    filename: "transfer.png",
    contentType: "image/png",
    byteSize: 240_000,
    sha256: "a".repeat(64),
    method: "zelle",
  });

  async function placedOrder() {
    const { app, store } = await releasedApp();
    const cookie = await openSession(app);
    const placed = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(placed.status).toBe(201);
    return { app, store, cookie, orderNumber: placed.body.order.orderNumber as string };
  }

  it("accepts the metadata and leaves the order UNPAID", async () => {
    const { app, store, cookie, orderNumber } = await placedOrder();

    const submitted = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF });

    expect(submitted.status).toBe(202);
    expect(submitted.body.payment).toEqual({
      state: "under_review",
      paid: false,
      verified: false,
    });
    // Every artifact that would exist if a human had confirmed the money is
    // present and explicitly absent, so the body cannot read as a receipt.
    expect(submitted.body.receipt).toBeNull();
    expect(submitted.body.supplierOrder).toBeNull();
    expect(submitted.body.commission).toBeNull();
    expect(submitted.body.message).toMatch(/not a receipt/i);

    expect(await store.settlement(orderNumber)).toBeNull();
    expect((await store.dispatch(orderNumber)).fulfillment).toBeNull();
    expect((await store.placementByOrderNumber(orderNumber))?.paymentState).toBe("under_review");
  });

  it("stores the digest and an opaque storage handle, never a URL", async () => {
    const { app, store, cookie, orderNumber } = await placedOrder();
    await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF });

    const proofs = await store.proofs(orderNumber);
    expect(proofs).toHaveLength(1);
    expect(proofs[0]?.sha256).toBe(PROOF.sha256);
    expect(proofs[0]?.record.storageRef).not.toMatch(/https?:|\/|\\/);
  });

  it("refuses a request that tries to hand the handler bytes", async () => {
    const { app, cookie, orderNumber } = await placedOrder();
    for (const key of ["base64", "file", "data", "url", "downloadUrl"]) {
      const submitted = await request(app)
        .post(`${ORDERS}/${orderNumber}/payment-proof`)
        .set("Cookie", cookie)
        .send({ ...PROOF, [key]: "iVBORw0KGgo=" });
      expect(submitted.status).toBe(400);
      expect(submitted.body.code).toBe("PROOF_BYTES_SUPPLIED");
    }
  });

  it("requires the declared type and the extension to agree", async () => {
    const { app, cookie, orderNumber } = await placedOrder();
    const mismatched = [
      { contentType: "image/png", filename: "payload.exe" },
      { contentType: "application/pdf", filename: "screenshot.png" },
      { contentType: "image/gif", filename: "screenshot.gif" },
      { contentType: "image/png", filename: "../../etc/passwd.png" },
    ];
    for (const shape of mismatched) {
      const submitted = await request(app)
        .post(`${ORDERS}/${orderNumber}/payment-proof`)
        .set("Cookie", cookie)
        .send({ ...PROOF, ...shape });
      expect(submitted.status).toBe(415);
      expect(submitted.body.code).toBe("CONTENT_TYPE_UNSUPPORTED");
    }
  });

  it("accepts jpg, jpeg, png and pdf", async () => {
    for (const shape of [
      { contentType: "image/jpeg", filename: "transfer.jpg" },
      { contentType: "image/jpeg", filename: "transfer.jpeg" },
      { contentType: "image/png", filename: "transfer.png" },
      { contentType: "application/pdf", filename: "transfer.pdf" },
    ]) {
      const { app, cookie, orderNumber } = await placedOrder();
      const submitted = await request(app)
        .post(`${ORDERS}/${orderNumber}/payment-proof`)
        .set("Cookie", cookie)
        .send({ ...PROOF, ...shape });
      expect(submitted.status).toBe(202);
    }
  });

  it("PINS the webp gap: the route allows it and the domain does not, yet", async () => {
    // EARLY_ACCESS_PROOF_UPLOAD_TYPES lists image/webp because a phone
    // screenshot is commonly webp, but EARLY_ACCESS_PROOF_CONTENT_TYPES in
    // commerce/payment-proof.ts still lists png, jpeg and pdf only, and that
    // module belongs to another lane. Until it is widened this refuses one layer
    // deeper. When the domain list grows, this test flips to 202 and the routes
    // need no change at all.
    const { app, cookie, orderNumber } = await placedOrder();
    const submitted = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF, contentType: "image/webp", filename: "transfer.webp" });
    expect(submitted.status).toBe(415);
    expect(submitted.body.code).toBe("CONTENT_TYPE_UNSUPPORTED");
  });

  it("enforces the size ceiling", async () => {
    const { app, cookie, orderNumber } = await placedOrder();
    const submitted = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF, byteSize: 10 * 1024 * 1024 + 1 });
    expect(submitted.status).toBe(413);
    expect(submitted.body.code).toBe("BYTE_SIZE_INVALID");
  });

  it("refuses a malformed digest", async () => {
    const { app, cookie, orderNumber } = await placedOrder();
    const submitted = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF, sha256: "not-a-digest" });
    expect(submitted.status).toBe(400);
    expect(submitted.body.code).toBe("CHECKSUM_INVALID");
  });

  it("REFUSES a second customer attaching proof to somebody else's order", async () => {
    const identity = new StubIdentityDirectory();
    const { app, store } = await releasedApp({ identity });
    const alphaCookie = await openSession(app);
    identity.bind(alphaCookie.split("=")[1] ?? alphaCookie, CUSTOMER_ALPHA);
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", alphaCookie)
      .send({ ...ORDER_BODY });
    const orderNumber = placed.body.order.orderNumber as string;

    const betaCookie = await openSession(app);
    identity.bind(betaCookie.split("=")[1] ?? betaCookie, CUSTOMER_BETA);
    const submitted = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", betaCookie)
      .send({ ...PROOF });

    expect(submitted.status).toBe(404);
    expect(await store.proofs(orderNumber)).toHaveLength(0);
  });

  it("chains a replacement proof and keeps the order under review", async () => {
    const { app, store, cookie, orderNumber } = await placedOrder();
    const first = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF });
    const second = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({ ...PROOF, filename: "clearer.png" });

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    const chain = await store.proofs(orderNumber);
    expect(chain).toHaveLength(2);
    expect(chain[1]?.record.supersedesProofId).toBe(chain[0]?.record.proofId);
    expect((await store.placementByOrderNumber(orderNumber))?.paymentState).toBe("under_review");
    expect(await store.settlement(orderNumber)).toBeNull();
  });
});
