import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

const tamper = vi.hoisted(() => ({ on: false }));

vi.mock("../../../routes", () => ({
  requireSupabaseAdmin(_req: unknown, res: { status(code: number): { json(body: unknown): unknown } }) {
    res.status(401).json({ ok: false });
  },
}));

/**
 * A money snapshot that does not hold together is unreachable through the
 * commerce domain today: `order-service.ts` derives the subtotal, the discount
 * and the payable total from one another in integer arithmetic, so they cannot
 * disagree. That is exactly why the route checks them anyway, and exactly why
 * the check needs a test that does not depend on the domain staying correct.
 *
 * So the domain is wrapped, not replaced: every call runs the real function, and
 * only when the flag is set does the result come back with a payable total that
 * contradicts its own discount. That is the shape the money lane's change could
 * produce if `payableTotalCents` and the pre-discount subtotal ever came apart,
 * and the route must refuse it with nothing persisted.
 */
vi.mock("../commerce/order-service", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../commerce/order-service")>();
  return {
    ...actual,
    async createEarlyAccessOrder(input: Parameters<typeof actual.createEarlyAccessOrder>[0]) {
      const result = await actual.createEarlyAccessOrder(input);
      if (!tamper.on || !result.ok) return result;
      return Object.freeze({
        ok: true as const,
        value: Object.freeze({
          ...result.value,
          record: Object.freeze({
            ...result.value.record,
            // The customer owes the discounted amount; this claims they owe the
            // full subtotal while still reporting the discount. It corrupts the
            // money snapshot, which is where the payable total now lives, so the
            // guard actually reads what is being tampered with.
            money: Object.freeze({
              ...result.value.record.money,
              payableTotalCents: result.value.record.money.subtotalCents,
            }),
          }),
        }),
      });
    },
  };
});

import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "./route-fixtures";
import { earlyAccessMoneySnapshotHolds } from "./order-routes";
import type { EarlyAccessReleaseOrder } from "../commerce/order-service";

const ORDERS = "/api/research/early-access/orders";

async function openSession(app: Express): Promise<string> {
  const unlocked = await request(app)
    .post("/api/research/early-access/unlock")
    .send({ password: EARLY_ACCESS_TEST_PASSWORD });
  const header = unlocked.headers["set-cookie"];
  const raw = Array.isArray(header) ? header[0] : String(header ?? "");
  return raw.split(";")[0] ?? "";
}

describe("PAYABLE_TOTAL_INVALID", () => {
  it("refuses the order and persists nothing when the money does not add up", async () => {
    const unit = cleanUnit();
    const { app, store } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
    });
    const cookie = await openSession(app);

    tamper.on = true;
    try {
      const placed = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
      expect(placed.status).toBe(422);
      expect(placed.body.code).toBe("PAYABLE_TOTAL_INVALID");
    } finally {
      tamper.on = false;
    }

    expect(await store.placementByIdempotencyKey(ORDER_BODY.idempotencyKey)).toBeNull();
    expect(await store.placementByOrderNumber("XEA-0000000000000001")).toBeNull();

    // And the same request succeeds once the arithmetic holds, so the refusal
    // was the snapshot check and not something incidental.
    const retried = await request(app).post(ORDERS).set("Cookie", cookie).send({ ...ORDER_BODY });
    expect(retried.status).toBe(201);
  });
});

describe("the money snapshot check itself", () => {
  // The amounts live on the immutable money snapshot, which is the authority
  // named in MONEY_MODEL_DECISION.md. These fixtures previously used the flat
  // pre-money-model fields, so every patch below corrupted a property the guard
  // does not read and the whole file asserted nothing about the real check.
  const SOUND = {
    money: {
      currency: "USD",
      subtotalCents: 59_700,
      discountCents: 11_940,
      payableTotalCents: 47_760,
    },
    order: {
      currency: "USD",
      orderTotalCents: 59_700,
      line: { lineTotalCents: 59_700 },
    },
  } as unknown as EarlyAccessReleaseOrder;

  /** Patches the money snapshot, since that is what the guard actually reads. */
  function broken(patch: Record<string, unknown>): EarlyAccessReleaseOrder {
    return {
      ...SOUND,
      money: { ...(SOUND as unknown as { money: object }).money, ...patch },
    } as unknown as EarlyAccessReleaseOrder;
  }

  it("accepts a snapshot whose parts agree", () => {
    expect(earlyAccessMoneySnapshotHolds(SOUND)).toBe(true);
  });

  it.each([
    ["a payable total that is not subtotal minus discount", { payableTotalCents: 50_000 }],
    ["a payable total of zero", { payableTotalCents: 0, discountCents: 59_700 }],
    ["a negative discount", { discountCents: -1, payableTotalCents: 59_701 }],
    ["a discount that swallows the whole order", { discountCents: 59_700, payableTotalCents: 0 }],
    ["a non-integer amount", { payableTotalCents: 47_760.5 }],
  ])("refuses %s", (_label, patch) => {
    expect(earlyAccessMoneySnapshotHolds(broken(patch))).toBe(false);
  });

  it("refuses a stored subtotal that disagrees with its own line", () => {
    expect(
      earlyAccessMoneySnapshotHolds({
        ...SOUND,
        order: { currency: "USD", orderTotalCents: 59_700, line: { lineTotalCents: 1 } },
      } as unknown as EarlyAccessReleaseOrder),
    ).toBe(false);
  });
});
