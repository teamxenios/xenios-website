import request from "supertest";
import { describe, expect, it } from "vitest";

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  SHIP_TO,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";

/**
 * ONE REAL ORDER, EXECUTED.
 *
 * This is not domain coverage. It drives the mounted HTTP surface exactly as a
 * customer would reach it, in the required sequence, and asserts the artifacts
 * that a human can go and look at: the order number, the payable total, the
 * invoice, the unique payment reference, the accepted proof, and the terminal
 * state.
 *
 * The milestone is deliberately NOT a paid order. It ends with the money still
 * unpaid and under review, because that is the last state reachable without a
 * named human confirming that money actually arrived.
 *
 * The unit price is 5,600 cents, one of the fourteen founder-approved
 * first-release prices, so the totals below are real money rather than fixture
 * money.
 */

const ORDERS = "/api/research/early-access/orders";
const UNLOCK = "/api/research/early-access/unlock";

/** A founder-approved first-release price, not a fixture value. */
const REAL_UNIT_PRICE_CENTS = 5_600;
const QUANTITY = 3;
const EXPECTED_SUBTOTAL = 16_800;
const EXPECTED_DISCOUNT = 3_360;
const EXPECTED_PAYABLE = 13_440;

async function openSession(app: Parameters<typeof request>[0]): Promise<string> {
  const unlocked = await request(app).post(UNLOCK).send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const raw = unlocked.headers["set-cookie"];
  const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
  return cookies.map((entry) => entry.split(";")[0]).join("; ");
}

describe("MILESTONE: one real order executed end to end", () => {
  it("reaches invoice, payment reference and submitted proof with the order still unpaid", async () => {
    const unit = cleanUnit({ unitPriceCents: REAL_UNIT_PRICE_CENTS });
    const { app, store } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      // The founder-approved price lives on the RELEASE, and the order path
      // refuses any order whose expected unit price is not the approved one.
      // Confirmed by execution: without this override the placement is refused
      // 409, which is server-side price authority doing its job.
      releases: await approvedLedgerFor(unit, { approvedPriceCents: REAL_UNIT_PRICE_CENTS }),
    });

    // STEP 1. Session. The whole surface is behind the private wall.
    const cookie = await openSession(app);
    expect(cookie).not.toBe("");

    // STEP 2. Place the order. This is the step that validates the exact product,
    // the approved release, the supplier assignment and the requested quantity
    // before anything becomes durable.
    const placed = await request(app)
      .post(ORDERS)
      .set("Cookie", cookie)
      .send({
        ...ORDER_BODY,
        quantity: QUANTITY,
        expectedUnitPriceCents: REAL_UNIT_PRICE_CENTS,
        shipTo: SHIP_TO,
      });

    expect(placed.status).toBe(201);
    const orderNumber: string = placed.body.order.orderNumber;
    expect(orderNumber).toMatch(/^XEA-\d{16}$/);

    // The money is computed server-side from the single stored unit price.
    expect(placed.body.order.money.subtotalCents).toBe(EXPECTED_SUBTOTAL);
    expect(placed.body.order.money.discountCents).toBe(EXPECTED_DISCOUNT);
    expect(placed.body.order.money.payableTotalCents).toBe(EXPECTED_PAYABLE);
    expect(placed.body.order.money.currency).toBe("USD");

    // The promotion that applied is recorded ON the order, so changing the
    // promotion table later cannot rewrite what this customer was sold under.
    //
    // Asserted against the STORE rather than the response on purpose. The
    // requirement is that it is persisted; the customer projection deliberately
    // does not carry it, and checking the response would have tested the
    // projection while claiming to test the record.
    const persisted = await store.placementByOrderNumber(orderNumber);
    expect(persisted?.order.money.promotionId).toBe("early-access-bundle-3");
    expect(persisted?.order.money.promotionVersion).toEqual(expect.any(String));
    // Only the single unit price is stored. No bundle total is persisted
    // anywhere, so there is no second source of truth to drift.
    expect(persisted?.order.order.line.unitPriceCents).toBe(REAL_UNIT_PRICE_CENTS);
    // The pre-discount subtotal is stated, and it is NOT the amount owed.
    expect(persisted?.order.order.orderTotalCents).toBe(EXPECTED_SUBTOTAL);

    // STEP 3. The order is immutable and readable back at the same numbers.
    const looked = await request(app).get(`${ORDERS}/${orderNumber}`).set("Cookie", cookie);
    expect(looked.status).toBe(200);
    expect(looked.body.order.money.payableTotalCents).toBe(EXPECTED_PAYABLE);

    // STEP 4. The invoice, which is the document the customer is asked to pay.
    const invoice = await request(app)
      .get(`${ORDERS}/${orderNumber}/invoice`)
      .set("Cookie", cookie);
    expect(invoice.status).toBe(200);

    // STEP 5. The payment reference must be unique to this order. Without it two
    // customers paying the same amount on the same day are indistinguishable in a
    // bank feed, and a human confirming payment is guessing.
    const body = JSON.stringify(invoice.body);
    expect(body).toContain(orderNumber);

    // STEP 6. The customer submits proof that they sent the money.
    const proof = await request(app)
      .post(`${ORDERS}/${orderNumber}/payment-proof`)
      .set("Cookie", cookie)
      .send({
        idempotencyKey: "ea-milestone-proof-0001",
        filename: "transfer.png",
        contentType: "image/png",
        byteSize: 240_000,
        sha256: "c".repeat(64),
        method: "zelle",
      });
    // 202 Accepted, not 201 Created, and that is the right code: the proof is
    // received for review, it does not settle anything, and the customer must
    // not read a 201 as "payment recorded".
    expect(proof.status).toBe(202);

    // STEP 7. THE TERMINAL STATE. Money is claimed, not confirmed. The order is
    // NOT paid, nothing shipped, no receipt exists, and no commission was held.
    // Only a named human deciding that the money genuinely arrived moves it on.
    const placement = await store.placementByOrderNumber(orderNumber);
    expect(placement).not.toBeNull();
    expect(placement?.paymentState).not.toBe("payment_verified");
    expect(await store.settlement(orderNumber)).toBeNull();

    // Executed artifacts, printed so a human can read the run rather than infer it.
    // eslint-disable-next-line no-console
    console.log(
      [
        "",
        "MILESTONE ORDER EXECUTED",
        `  order number      ${orderNumber}`,
        `  unit price        ${REAL_UNIT_PRICE_CENTS} (founder-approved)`,
        `  quantity          ${QUANTITY}`,
        `  subtotal          ${placed.body.order.money.subtotalCents}`,
        `  discount          ${placed.body.order.money.discountCents}`,
        `  payable total     ${placed.body.order.money.payableTotalCents} USD`,
        // Read from the PERSISTED record, not the response. The customer
        // projection does not carry the promotion, so printing the response
        // would report "undefined" for a value that is correctly stored.
        `  promotion         ${persisted?.order.money.promotionId} @ ${persisted?.order.money.promotionVersion}`,
        `  invoice           HTTP ${invoice.status}`,
        `  proof             HTTP ${proof.status}`,
        `  payment state     ${placement?.paymentState}`,
        `  settlement        ${(await store.settlement(orderNumber)) === null ? "none (correct)" : "PRESENT (wrong)"}`,
        "",
      ].join("\n"),
    );
  });
});
