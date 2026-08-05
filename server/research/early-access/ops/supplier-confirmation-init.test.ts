import { describe, expect, it } from "vitest";

import {
  APPROVED_CONFIRMATION_IDS,
  EXPECTED_CONFIRMATION_COUNT,
  assertApprovedSet,
  deriveConfirmations,
  readPreState,
  refuseWhenStorefrontOpen,
  run,
  type ConfirmationRow,
} from "../../../../scripts/initialize-supplier-confirmations";

/**
 * The one-time supplier-confirmation initialization is the only writer of the
 * catalog-level confirmations, and it runs against production. These tests pin
 * the refusals, because a refusal that silently stops working is how a one-time
 * script writes twice.
 */

/** A store that records everything, so writes can be counted and inspected. */
function fakeStore() {
  const rows = new Map<string, ConfirmationRow>();
  const inserts: ConfirmationRow[] = [];
  return {
    rows,
    inserts,
    async byId(id: string) {
      return rows.get(id) ?? null;
    },
    async insert(row: ConfirmationRow) {
      inserts.push(row);
      if (rows.has(row.confirmationId)) return false;
      rows.set(row.confirmationId, row);
      return true;
    },
  };
}

const silent = () => {};

describe("refusing to run against an open storefront", () => {
  it("refuses when the flag is true", () => {
    expect(() => refuseWhenStorefrontOpen({ RESEARCH_EARLY_ACCESS_ENABLED: "true" })).toThrow(
      /refusing to run/i,
    );
    expect(() => refuseWhenStorefrontOpen({ RESEARCH_EARLY_ACCESS_ENABLED: "TRUE" })).toThrow();
  });

  it("runs when the flag is false or unset", () => {
    expect(() => refuseWhenStorefrontOpen({ RESEARCH_EARLY_ACCESS_ENABLED: "false" })).not.toThrow();
    expect(() => refuseWhenStorefrontOpen({})).not.toThrow();
  });
});

describe("the derived rows", () => {
  it("are exactly the 22 approved identities", async () => {
    const rows = await deriveConfirmations();

    expect(rows).toHaveLength(EXPECTED_CONFIRMATION_COUNT);
    expect([...rows.map((r) => r.confirmationId)].sort()).toEqual([...APPROVED_CONFIRMATION_IDS].sort());
    expect(() => assertApprovedSet(rows)).not.toThrow();
  });

  it("include Cagrilintide, because supply is confirmed and the RELEASE is what holds it", async () => {
    const rows = await deriveConfirmations();

    expect(rows.some((r) => r.variantId === "R360-CAGRILINTIDE-10MG-VIAL")).toBe(true);
  });

  it("refuse a set that is not the approved one", () => {
    expect(() => assertApprovedSet([])).toThrow(/derived 0 rows/i);
    const wrong = Array.from({ length: EXPECTED_CONFIRMATION_COUNT }, (_, i) => ({
      confirmationId: `supconf-wrong-${i}`,
      variantId: "x",
    })) as ConfirmationRow[];
    expect(() => assertApprovedSet(wrong)).toThrow(/do not match the approved set/i);
  });
});

describe("running the initialization", () => {
  it("writes nothing in dry run", async () => {
    const store = fakeStore();

    const outcome = await run({ store, execute: false, log: silent, env: {} });

    expect(outcome).toMatchObject({ mode: "dry_run", result: "would_create", count: 22 });
    expect(store.inserts).toHaveLength(0);
    expect(store.rows.size).toBe(0);
  });

  it("creates 22 rows on execute and verifies them by reading back", async () => {
    const store = fakeStore();

    const outcome = await run({ store, execute: true, log: silent, env: {} });

    expect(outcome).toMatchObject({ mode: "execute", result: "created", count: 22, verified: 22 });
    expect(store.rows.size).toBe(22);
  });

  it("is idempotent: a second execute reports ALREADY_INITIALIZED and writes nothing", async () => {
    const store = fakeStore();
    await run({ store, execute: true, log: silent, env: {} });
    const insertsAfterFirst = store.inserts.length;

    const outcome = await run({ store, execute: true, log: silent, env: {} });

    expect(outcome.result).toBe("already_initialized");
    expect(store.inserts).toHaveLength(insertsAfterFirst);
    expect(store.rows.size).toBe(22);
  });

  it("refuses a partial state rather than completing it", async () => {
    // The dangerous middle state: an interrupted first run. Writing the
    // remainder would paper over whatever interrupted it.
    const store = fakeStore();
    const rows = await deriveConfirmations();
    await store.insert(rows[0]);
    await store.insert(rows[1]);

    await expect(run({ store, execute: true, log: silent, env: {} })).rejects.toThrow(
      /PARTIAL STATE/,
    );
    expect(store.rows.size).toBe(2);
  });

  it("refuses to write while the storefront flag is true", async () => {
    const store = fakeStore();

    await expect(
      run({ store, execute: true, log: silent, env: { RESEARCH_EARLY_ACCESS_ENABLED: "true" } }),
    ).rejects.toThrow(/refusing to run/i);
    expect(store.inserts).toHaveLength(0);
  });

  it("touches nothing but supplier confirmations", async () => {
    // Structural, not aspirational: the only collaborator it is given is a
    // confirmation store, so it has no way to reach a customer, order, invoice,
    // settlement, price, dispute or release.
    const store = fakeStore();

    await run({ store, execute: true, log: silent, env: {} });

    for (const row of store.inserts) {
      expect(row.confirmationId).toMatch(/^supconf-rawpeptides-/);
      expect(Object.keys(row)).not.toContain("priceCents");
      expect(Object.keys(row)).not.toContain("releaseId");
      expect(Object.keys(row)).not.toContain("supplierMasterStrength");
    }
  });
});

describe("pre-state classification", () => {
  it("reports clean, already_initialized and partial distinctly", async () => {
    const rows = await deriveConfirmations();
    const store = fakeStore();

    expect(await readPreState(store, rows)).toEqual({ kind: "clean" });

    await store.insert(rows[0]);
    const partial = await readPreState(store, rows);
    expect(partial.kind).toBe("partial");

    for (const row of rows.slice(1)) await store.insert(row);
    expect(await readPreState(store, rows)).toEqual({ kind: "already_initialized" });
  });
});
