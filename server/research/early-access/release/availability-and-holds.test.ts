import request from "supertest";
import { describe, expect, it } from "vitest";

import { buildEarlyAccessStorefront } from "./storefront-view";
import {
  EARLY_ACCESS_TEST_PASSWORD,
  ORDER_BODY,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  makeEarlyAccessApp,
} from "../routes/route-fixtures";
import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";

const NOW = new Date("2026-08-04T12:00:00.000Z");

function projectionOf(rows: readonly EarlyAccessCatalogRow[]) {
  return {
    evaluatedAt: NOW.toISOString(),
    rows,
    productsWithoutVariants: [],
  } as never;
}

async function storefrontFor(row: EarlyAccessCatalogRow, releases = [] as never[]) {
  const built = buildEarlyAccessStorefront({
    projection: projectionOf([row]),
    releases,
  });
  return built.units[0];
}

describe("the canonical availability states", () => {
  it("marks a released unit AVAILABLE and purchasable", async () => {
    const unit = cleanUnit();
    const ledger = await approvedLedgerFor(unit);
    const projected = await storefrontFor(unit, (await ledger.all()) as never);
    expect(projected.state).toBe("purchasable");
    expect(projected.availability).toBe("AVAILABLE");
    expect(projected.purchasable).toBe(true);
  });

  it("marks a clean unconfirmed unit AVAILABILITY_CONFIRMATION_REQUIRED, visible and unsellable", async () => {
    // FULFILLMENT_UNAVAILABLE is the only nonwaivable gap: exactly what a
    // recorded supplier confirmation closes. The row renders; payment cannot.
    const unit = cleanUnit({
      blockers: ["PRICE_NOT_APPROVED", "FULFILLMENT_UNAVAILABLE"] as never,
    });
    const projected = await storefrontFor(unit);
    expect(projected.state).not.toBe("purchasable");
    expect(projected.availability).toBe("AVAILABILITY_CONFIRMATION_REQUIRED");
    expect(projected.purchasable).toBe(false);
    expect(projected.priceCents).toBeNull();
  });

  it("marks a disputed unit TEMPORARILY_HELD, never confirmation-required", async () => {
    const unit = cleanUnit({
      blockers: ["STRENGTH_DISPUTE_UNRESOLVED", "FULFILLMENT_UNAVAILABLE"] as never,
    });
    const projected = await storefrontFor(unit);
    expect(projected.availability).toBe("TEMPORARILY_HELD");
    expect(projected.purchasable).toBe(false);
  });

  it("marks an expired release TEMPORARILY_HELD even when the row is otherwise clean", async () => {
    const unit = cleanUnit();
    const ledger = await approvedLedgerFor(unit, {
      expiresAt: "2026-08-01T00:00:00.000Z",
    });
    const projected = await storefrontFor(unit, (await ledger.all()) as never);
    expect(projected.state).not.toBe("purchasable");
    expect(projected.hold).toBe("RELEASE_EXPIRED");
    expect(projected.availability).toBe("TEMPORARILY_HELD");
  });
});

describe("QA R4: a hold recorded after a founder release wins", () => {
  it("holds the row, hides the price, and stales the release the instant the hold projects", async () => {
    const unit = cleanUnit();
    const ledger = await approvedLedgerFor(unit);
    const releases = (await ledger.all()) as never;

    // Before the hold: sold under the founder release.
    const before = await storefrontFor(unit, releases);
    expect(before.availability).toBe("AVAILABLE");

    // The regulator speaks. The NEXT projection carries the hold in the
    // blockers, under its own non-waivable name. Nothing about the release
    // changed; everything about the row did.
    const held = cleanUnit({
      blockers: [...unit.blockers, "REGULATORY_HOLD"] as never,
    });
    const after = await storefrontFor(held, releases);
    expect(after.state).not.toBe("purchasable");
    expect(after.purchasable).toBe(false);
    expect(after.availability).toBe("TEMPORARILY_HELD");
    expect(after.priceCents).toBeNull();
    // The old release does not cover the new world: the fingerprint the
    // founder approved no longer matches a row that carries the hold.
    expect(after.hold).not.toBeNull();
  });

  it("refuses order creation for the held row at the mounted route", async () => {
    const unit = cleanUnit({
      blockers: ["PRICE_NOT_APPROVED", "REGULATORY_HOLD"] as never,
    });
    const { app } = makeEarlyAccessApp({
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
    });
    const unlocked = await request(app)
      .post("/api/research/early-access/unlock")
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");

    const placed = await request(app)
      .post("/api/research/early-access/orders")
      .set("Cookie", cookie)
      .send(ORDER_BODY);
    expect(placed.status).toBe(409);
    expect(placed.body.code).toBe("PRODUCT_HELD");
  });
});
