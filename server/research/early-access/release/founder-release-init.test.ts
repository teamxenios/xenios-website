import { describe, expect, it } from "vitest";

import {
  DISPUTED_BUT_RELEASED,
  EXPECTED_RELEASE_COUNT,
  NEVER_RELEASED_PRODUCT_ID,
  NON_WAIVABLE,
  assertApprovedSet,
  deriveReleases,
  readPreState,
  refuseWhenStorefrontOpen,
  run,
  type ReleaseRow,
} from "../../../../scripts/initialize-founder-releases";
import { FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT } from "./founder-first-release-seed";

/**
 * The one-time founder-release initialization exists because the governed admin
 * route refuses a release on a unit carrying a non-waivable blocker, which would
 * make three accepted units vanish from the catalogue rather than render held.
 * That makes these refusals the only thing standing between a one-time script
 * and production, so each one is pinned here.
 */

function fakeLedger(seed: ReleaseRow[] = []) {
  const rows = new Map(seed.map((r) => [r.releaseId, r]));
  const appends: ReleaseRow[] = [];
  return {
    rows,
    appends,
    async all() {
      return [...rows.values()];
    },
    async append(draft: ReleaseRow) {
      appends.push(draft);
      if (rows.has(draft.releaseId)) return { ok: false, code: "duplicate" };
      rows.set(draft.releaseId, draft);
      return { ok: true };
    },
  };
}

const silent = () => {};

describe("refusing to run against an open storefront", () => {
  it("refuses when the flag is true", () => {
    expect(() => refuseWhenStorefrontOpen({ RESEARCH_EARLY_ACCESS_ENABLED: "true" })).toThrow(
      /refusing to run/i,
    );
  });

  it("runs when the flag is false or unset", () => {
    expect(() => refuseWhenStorefrontOpen({ RESEARCH_EARLY_ACCESS_ENABLED: "false" })).not.toThrow();
    expect(() => refuseWhenStorefrontOpen({})).not.toThrow();
  });
});

describe("the derived releases", () => {
  it("are exactly 21", async () => {
    expect(await deriveReleases()).toHaveLength(EXPECTED_RELEASE_COUNT);
  });

  it("exclude Cagrilintide, whose hold IS the absent release", async () => {
    const rows = await deriveReleases();

    expect(rows.some((r) => r.productId === NEVER_RELEASED_PRODUCT_ID)).toBe(false);
  });

  it("include the three disputed units, so they render held rather than vanish", async () => {
    const rows = await deriveReleases();

    for (const variantId of DISPUTED_BUT_RELEASED) {
      expect(rows.some((r) => r.variantId === variantId), `${variantId} missing`).toBe(true);
    }
  });

  it("never waive a non-waivable blocker", async () => {
    // The three disputed units are RELEASED and still HELD. The release waives
    // only founder-waivable codes; the dispute stays and keeps holding them.
    const rows = await deriveReleases();

    for (const row of rows) {
      const waived = (row.waivedBlockers as string[] | undefined) ?? [];
      expect(waived.filter((b) => NON_WAIVABLE.includes(b))).toEqual([]);
    }
  });

  it("carry the fields an auditor needs", async () => {
    const rows = await deriveReleases();

    for (const row of rows) {
      expect(row.releaseId).toBeTruthy();
      expect(row.productId).toBeTruthy();
      expect(row.variantId).toBeTruthy();
      expect(row.status).toBe("approved");
      expect(row.currency).toBe("USD");
      expect(Number.isSafeInteger(row.approvedPriceCents)).toBe(true);
      expect(row.approvedPriceCents as number).toBeGreaterThan(0);
      // The founder-approved ceiling, read from the shipped constant rather
      // than restated, so this test cannot disagree with what the seeder writes.
      expect(row.approvedQuantityLimit).toBe(FOUNDER_FIRST_RELEASE_QUANTITY_LIMIT);
      expect(row.approvedQuantityLimit).toBe(50);
      expect(row.actor).toBeTruthy();
      expect(row.reason).toBeTruthy();
      expect(row.recordedAt).toBeTruthy();
    }
  });

  it("price NAD+ 1000 mg at $100.75", async () => {
    const rows = await deriveReleases();
    const nad = rows.find((r) => r.variantId === "R360-NAD-1000MG-VIAL");

    expect(nad?.approvedPriceCents).toBe(10_075);
  });

  it("refuse a set that is not the approved one", async () => {
    const rows = await deriveReleases();

    expect(() => assertApprovedSet([])).toThrow(/derived 0 releases/i);
    expect(() =>
      assertApprovedSet(rows.filter((r) => r.variantId !== "R360-NAD-500MG-VIAL")),
    ).toThrow(/derived 20 releases/i);
    const withCagrilintide = [...rows.slice(1), { ...rows[0], productId: "PEX-028" }];
    expect(() => assertApprovedSet(withCagrilintide as ReleaseRow[])).toThrow(
      /Cagrilintide must never receive/i,
    );
    const waivingDispute = [
      ...rows.slice(1),
      { ...rows[0], waivedBlockers: ["STRENGTH_DISPUTE_UNRESOLVED"] },
    ];
    expect(() => assertApprovedSet(waivingDispute as ReleaseRow[])).toThrow(/never waivable/i);
  });
});

describe("running the initialization", () => {
  it("writes nothing in dry run", async () => {
    const ledger = fakeLedger();

    const outcome = await run({ ledger, execute: false, log: silent, env: {} });

    expect(outcome).toMatchObject({ mode: "dry_run", result: "would_create", count: 21 });
    expect(ledger.appends).toHaveLength(0);
    expect(ledger.rows.size).toBe(0);
  });

  it("creates 21 on execute and verifies every field by reading back", async () => {
    const ledger = fakeLedger();

    const outcome = await run({ ledger, execute: true, log: silent, env: {} });

    expect(outcome).toMatchObject({ mode: "execute", result: "created", count: 21, verified: 21 });
    expect(ledger.rows.size).toBe(21);
  });

  it("fails loudly when a row reads back with a different price", async () => {
    // Trusting the write is how a wrong price reaches a customer.
    const ledger = fakeLedger();
    const corrupting = {
      ...ledger,
      async append(draft: ReleaseRow) {
        const stored =
          draft.variantId === "R360-NAD-1000MG-VIAL"
            ? { ...draft, approvedPriceCents: 1 }
            : draft;
        return ledger.append(stored as ReleaseRow);
      },
    };

    await expect(run({ ledger: corrupting, execute: true, log: silent, env: {} })).rejects.toThrow(
      /read back as 1, expected 10075/,
    );
  });

  it("is idempotent: a second execute reports ALREADY_INITIALIZED and writes nothing", async () => {
    const ledger = fakeLedger();
    await run({ ledger, execute: true, log: silent, env: {} });
    const after = ledger.appends.length;

    const outcome = await run({ ledger, execute: true, log: silent, env: {} });

    expect(outcome.result).toBe("already_initialized");
    expect(ledger.appends).toHaveLength(after);
    expect(ledger.rows.size).toBe(21);
  });

  it("refuses a partial state rather than completing it", async () => {
    const rows = await deriveReleases();
    const ledger = fakeLedger([rows[0], rows[1], rows[2]]);

    await expect(run({ ledger, execute: true, log: silent, env: {} })).rejects.toThrow(
      /PARTIAL STATE/,
    );
    expect(ledger.rows.size).toBe(3);
  });

  it("refuses to write while the storefront flag is true", async () => {
    const ledger = fakeLedger();

    await expect(
      run({ ledger, execute: true, log: silent, env: { RESEARCH_EARLY_ACCESS_ENABLED: "true" } }),
    ).rejects.toThrow(/refusing to run/i);
    expect(ledger.appends).toHaveLength(0);
  });

  it("has no write path to any other domain", async () => {
    // Structural. The only collaborator it accepts is a release ledger, so it
    // cannot reach a customer, order, invoice, settlement, payment, receipt,
    // refund, commission, supplier order, shipment, price row, dispute or
    // catalog identity. The rows themselves carry no such field either.
    const ledger = fakeLedger();

    await run({ ledger, execute: true, log: silent, env: {} });

    for (const row of ledger.appends) {
      for (const forbidden of [
        "customerId",
        "orderNumber",
        "invoiceId",
        "settlementId",
        "supplierOrderId",
        "shipmentId",
        "supplierMasterStrength",
      ]) {
        expect(Object.keys(row)).not.toContain(forbidden);
      }
    }
  });
});

describe("pre-state classification", () => {
  it("reports clean, partial and already_initialized distinctly", async () => {
    const rows = await deriveReleases();

    expect(await readPreState(fakeLedger(), rows)).toEqual({ kind: "clean" });
    expect((await readPreState(fakeLedger([rows[0]]), rows)).kind).toBe("partial");
    expect(await readPreState(fakeLedger([...rows]), rows)).toEqual({
      kind: "already_initialized",
    });
  });
});
