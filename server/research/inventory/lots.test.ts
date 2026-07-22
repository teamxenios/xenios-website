import { describe, expect, it } from "vitest";
import {
  allocateFefo,
  evaluateLot,
  reservationIsExpired,
  splitByFulfillmentOwner,
  tracedShipmentsForLot,
  type InventoryLot,
  type LotReservation,
} from "./lots";

const NOW = new Date("2026-07-20T00:00:00Z");

function cleanLot(overrides: Partial<InventoryLot> = {}): InventoryLot {
  return {
    lotId: "LOT-1",
    sku: "P001",
    owner: "mitch",
    disposition: "available",
    quantityAvailable: 10,
    manufacturedDate: "2026-01-01",
    expiryDate: "2027-01-01",
    retestDate: null,
    shelfLifeSource: "supplier_document",
    documents: {
      coaOnFile: true,
      identityConfirmed: true,
      purityConfirmed: true,
      sterilityConfirmed: true,
      endotoxinConfirmed: true,
    },
    excursion: "none",
    recalled: false,
    ...overrides,
  };
}

describe("evaluateLot", () => {
  it("allocates a fully clean lot", () => {
    const r = evaluateLot(cleanLot(), NOW);
    expect(r.allocatable).toBe(true);
    expect(r.blockReasons).toEqual([]);
  });

  // Unknown data must never read as acceptable data.
  it("blocks a lot with an unknown expiry", () => {
    const r = evaluateLot(cleanLot({ expiryDate: null }), NOW);
    expect(r.allocatable).toBe(false);
    expect(r.blockReasons).toContain("expiry_unknown");
  });

  it("blocks a lot whose shelf life source is not confirmed", () => {
    const r = evaluateLot(cleanLot({ shelfLifeSource: "not_confirmed" }), NOW);
    expect(r.blockReasons).toContain("shelf_life_not_confirmed");
  });

  it("blocks an expired lot", () => {
    expect(evaluateLot(cleanLot({ expiryDate: "2026-07-19" }), NOW).blockReasons).toContain("expired");
  });

  it("treats expiry exactly at the evaluation instant as expired", () => {
    const r = evaluateLot(cleanLot({ expiryDate: "2026-07-20T00:00:00Z" }), NOW);
    expect(r.blockReasons).toContain("expired");
  });

  it("blocks a retest-overdue lot", () => {
    expect(evaluateLot(cleanLot({ retestDate: "2026-07-01" }), NOW).blockReasons).toContain(
      "retest_overdue",
    );
  });

  it("blocks quarantined, damaged, and recalled lots", () => {
    expect(evaluateLot(cleanLot({ disposition: "quarantined" }), NOW).blockReasons).toContain(
      "quarantined",
    );
    expect(evaluateLot(cleanLot({ disposition: "damaged" }), NOW).blockReasons).toContain("damaged");
    expect(evaluateLot(cleanLot({ recalled: true }), NOW).blockReasons).toContain("recalled");
  });

  it("blocks a lot with a pending temperature excursion", () => {
    expect(evaluateLot(cleanLot({ excursion: "pending_review" }), NOW).blockReasons).toContain(
      "excursion_pending",
    );
  });

  it("quarantines a lot whose excursion was rejected", () => {
    expect(evaluateLot(cleanLot({ excursion: "rejected" }), NOW).blockReasons).toContain("quarantined");
  });

  it("allows a lot whose excursion was reviewed and cleared", () => {
    expect(evaluateLot(cleanLot({ excursion: "cleared" }), NOW).allocatable).toBe(true);
  });

  it("blocks on any missing quality document", () => {
    for (const key of ["coaOnFile", "identityConfirmed", "purityConfirmed"] as const) {
      const lot = cleanLot();
      lot.documents[key] = false;
      expect(evaluateLot(lot, NOW).blockReasons).toContain("documentation_missing");
    }
  });

  it("distinguishes not-applicable from absent for sterility and endotoxin", () => {
    // null means not applicable to the format, which must not block.
    const notApplicable = cleanLot();
    notApplicable.documents.sterilityConfirmed = null;
    notApplicable.documents.endotoxinConfirmed = null;
    expect(evaluateLot(notApplicable, NOW).allocatable).toBe(true);

    // false means required and absent, which must block.
    const absent = cleanLot();
    absent.documents.sterilityConfirmed = false;
    expect(evaluateLot(absent, NOW).blockReasons).toContain("documentation_missing");
  });

  it("blocks a lot with no quantity", () => {
    expect(evaluateLot(cleanLot({ quantityAvailable: 0 }), NOW).blockReasons).toContain("no_quantity");
  });

  it("accumulates every blocking reason rather than stopping at the first", () => {
    const bad = cleanLot({
      disposition: "quarantined",
      expiryDate: null,
      excursion: "pending_review",
      shelfLifeSource: "not_confirmed",
      quantityAvailable: 0,
    });
    bad.documents.coaOnFile = false;
    const r = evaluateLot(bad, NOW);
    expect(r.blockReasons.length).toBeGreaterThanOrEqual(5);
  });
});

describe("allocateFefo", () => {
  it("takes the earliest expiring lot first", () => {
    const lots = [
      cleanLot({ lotId: "LATE", expiryDate: "2027-06-01", quantityAvailable: 10 }),
      cleanLot({ lotId: "EARLY", expiryDate: "2026-09-01", quantityAvailable: 10 }),
    ];
    const r = allocateFefo(lots, "P001", 5, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toEqual([{ lotId: "EARLY", quantity: 5 }]);
  });

  it("spans lots in expiry order when one is not enough", () => {
    const lots = [
      cleanLot({ lotId: "LATE", expiryDate: "2027-06-01", quantityAvailable: 10 }),
      cleanLot({ lotId: "EARLY", expiryDate: "2026-09-01", quantityAvailable: 4 }),
    ];
    const r = allocateFefo(lots, "P001", 6, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.lines).toEqual([
        { lotId: "EARLY", quantity: 4 },
        { lotId: "LATE", quantity: 2 },
      ]);
    }
  });

  // The safety-critical case: a blocked lot must be skipped even though it expires first.
  it("skips an expired lot and uses a later clean one", () => {
    const lots = [
      cleanLot({ lotId: "EXPIRED", expiryDate: "2026-01-01", quantityAvailable: 50 }),
      cleanLot({ lotId: "GOOD", expiryDate: "2027-01-01", quantityAvailable: 5 }),
    ];
    const r = allocateFefo(lots, "P001", 5, NOW);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toEqual([{ lotId: "GOOD", quantity: 5 }]);
  });

  it("skips a quarantined lot", () => {
    const lots = [
      cleanLot({ lotId: "QUAR", disposition: "quarantined", expiryDate: "2026-08-01", quantityAvailable: 50 }),
      cleanLot({ lotId: "GOOD", expiryDate: "2027-01-01", quantityAvailable: 5 }),
    ];
    const r = allocateFefo(lots, "P001", 5, NOW);
    if (r.ok) expect(r.lines.map((l) => l.lotId)).toEqual(["GOOD"]);
  });

  // All-or-nothing: a partial allocation would create an unfulfillable order.
  it("fails rather than partially allocating", () => {
    const lots = [cleanLot({ lotId: "ONLY", quantityAvailable: 3 })];
    const r = allocateFefo(lots, "P001", 5, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("insufficient_allocatable_stock");
      expect(r.requested).toBe(5);
      expect(r.allocatable).toBe(3);
    }
  });

  it("reports why each candidate lot was refused", () => {
    const lots = [
      cleanLot({ lotId: "BAD1", disposition: "quarantined" }),
      cleanLot({ lotId: "BAD2", expiryDate: null }),
    ];
    const r = allocateFefo(lots, "P001", 1, NOW);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.rejected.map((e) => e.lotId).sort()).toEqual(["BAD1", "BAD2"]);
      expect(r.rejected.find((e) => e.lotId === "BAD2")!.blockReasons).toContain("expiry_unknown");
    }
  });

  it("ignores lots belonging to a different sku", () => {
    const lots = [cleanLot({ lotId: "OTHER", sku: "P999", quantityAvailable: 100 })];
    expect(allocateFefo(lots, "P001", 1, NOW).ok).toBe(false);
  });

  it("refuses a non-positive quantity", () => {
    expect(allocateFefo([cleanLot()], "P001", 0, NOW).ok).toBe(false);
  });
});

describe("recall traceability", () => {
  it("returns every order that received the recalled lot, and only that lot", () => {
    const shipments = [
      { orderId: "o1", lotId: "LOT-A", memberId: "m1", shippedAt: "2026-07-01" },
      { orderId: "o2", lotId: "LOT-B", memberId: "m2", shippedAt: "2026-07-02" },
      { orderId: "o3", lotId: "LOT-A", memberId: "m3", shippedAt: "2026-07-03" },
    ];
    const traced = tracedShipmentsForLot(shipments, "LOT-A");
    expect(traced.map((s) => s.orderId)).toEqual(["o1", "o3"]);
  });
});

describe("split fulfillment", () => {
  it("groups an order into per-owner fulfillment orders", () => {
    const groups = splitByFulfillmentOwner([
      { sku: "P001", quantity: 1, owner: "mitch" },
      { sku: "S010", quantity: 2, owner: "xenios" },
      { sku: "P006", quantity: 1, owner: "mitch" },
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.owner === "mitch")!.lines).toHaveLength(2);
    expect(groups.find((g) => g.owner === "xenios")!.lines).toHaveLength(1);
  });

  it("produces a single group when one owner covers the order", () => {
    const groups = splitByFulfillmentOwner([{ sku: "P001", quantity: 1, owner: "mitch" }]);
    expect(groups).toHaveLength(1);
  });

  it("produces no groups for an empty order", () => {
    expect(splitByFulfillmentOwner([])).toEqual([]);
  });
});

describe("reservation expiry", () => {
  function reservation(overrides: Partial<LotReservation> = {}): LotReservation {
    return {
      reservationId: "res_1",
      memberId: "mem_1",
      sku: "P001",
      quantity: 2,
      lines: [{ lotId: "LOT-1", quantity: 2 }],
      status: "held",
      expiresAt: "2026-07-20T00:30:00.000Z",
      createdAt: "2026-07-20T00:00:00.000Z",
      releasedAt: null,
      finalizedAt: null,
      ...overrides,
    };
  }

  it("a held reservation is expired at and after its expiry instant", () => {
    expect(reservationIsExpired(reservation(), new Date("2026-07-20T00:29:59Z"))).toBe(false);
    expect(reservationIsExpired(reservation(), new Date("2026-07-20T00:30:00Z"))).toBe(true);
    expect(reservationIsExpired(reservation(), new Date("2026-07-21T00:00:00Z"))).toBe(true);
  });

  it("only a held reservation can expire; terminal states never do", () => {
    const past = new Date("2027-01-01T00:00:00Z");
    expect(reservationIsExpired(reservation({ status: "released" }), past)).toBe(false);
    expect(reservationIsExpired(reservation({ status: "finalized" }), past)).toBe(false);
  });
});
