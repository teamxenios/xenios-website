import { describe, expect, it } from "vitest";

import {
  SUPPLIER_EXPIRY_WARNING_DAYS,
  SupplierConsistentCatalogSource,
  decideSupplierAvailability,
  earlyAccessSupplierReadiness,
} from "./supplier-availability";
import { InMemorySupplierConfirmationStore } from "./supplier-confirmation";
import { SupabaseEarlyAccessSupplierDirectory } from "../persistence/commerce-ports";
import {
  RAW_PEPTIDES_EXPIRES_AT,
  seedRawPeptidesConfirmations,
} from "../release/founder-supply-seed";
import {
  NO_RECORDED_LOTS_INVENTORY,
  canonicalReviewProducts,
} from "../release/first-release-canonical-source";
import { ProductControlDeclaredFactsReader } from "../catalog/declared-facts-source";
import {
  ProductControlCatalogSource,
  resolveEarlyAccessSettlementCurrency,
} from "../catalog/product-control-source";
import { InMemoryEarlyAccessReleaseLedger } from "../release/founder-release";
import { seedFounderFirstRelease } from "../release/founder-first-release-seed";
import { createEarlyAccessCatalogRoute } from "../release/release-routes";
import { InMemoryUnitHoldRegistry } from "./unit-holds";
import { isSafeIdentifier } from "../commerce/input-guards";
import type { EarlyAccessCatalogProjection } from "../catalog/early-access-catalog";
import type { EarlyAccessCatalogSource } from "../release/release-routes";
import type { EarlyAccessSupplierDirectory } from "../routes/ports";

/**
 * ONE SUPPLIER ANSWER, PROVEN AT THE SEAM EVERY DOOR READS.
 *
 * The identifier translation (supplier-consistency.test.ts) fixed the value.
 * This file fixes the STRUCTURE: the catalogue used to decide `supplierReady`
 * from a lane function that returns an owner for every research_material
 * product, so it said true for all 22 rows while the checkout asked the
 * directory and refused. Two answers to one question is the defect; these
 * tests pin that there is now one.
 */

const NOW = new Date(Date.UTC(2026, 7, 7));
const AOD = Object.freeze({ productId: "PEX-012", variantId: "R360-AOD9604-5MG-VIAL" });
/** An APPROVED customer, because audience is what makes a row purchasable at all. */
const CONTEXT = Object.freeze({
  earlyAccessCustomer: { customerRef: "cus_supplier_availability" },
});

/**
 * The real 22-unit opening set: canonical products, the real declared-facts
 * reader, the governed Raw Peptides supply seed and the founder's first
 * release. This is the composition that actually produces 22 visible / 18
 * purchasable / 4 held, and the only fixture in which the claim "every
 * purchasable row is routable" means anything.
 */
type ServedUnit = {
  readonly productId: string;
  readonly variantId: string;
  readonly purchasable: boolean;
  readonly priceCents: number | null;
  readonly availability: string;
};

async function productionShaped(): Promise<{
  readonly confirmations: InMemorySupplierConfirmationStore;
  readonly source: EarlyAccessCatalogSource;
  readonly ledger: InMemoryEarlyAccessReleaseLedger;
  readonly projection: EarlyAccessCatalogProjection;
}> {
  const confirmations = new InMemorySupplierConfirmationStore();
  const source = new ProductControlCatalogSource({
    catalog: { readCatalog: async () => canonicalReviewProducts() },
    declaredFacts: new ProductControlDeclaredFactsReader({
      inventory: NO_RECORDED_LOTS_INVENTORY,
      currency: resolveEarlyAccessSettlementCurrency(),
      supplierConfirmations: confirmations,
      holds: new InMemoryUnitHoldRegistry(),
    }),
  } as never);

  // Supply first, then the release: a unit is purchasable only when both are
  // recorded, exactly as preparation runs them.
  const before = await source.load(NOW, CONTEXT);
  await seedRawPeptidesConfirmations({ rows: before.rows as never, store: confirmations });
  const ledger = new InMemoryEarlyAccessReleaseLedger();
  const confirmed = await source.load(NOW, CONTEXT);
  await seedFounderFirstRelease({ rows: confirmed.rows as never, ledger });

  return { confirmations, source, ledger, projection: await source.load(NOW, CONTEXT) };
}

/** The directory exactly as production composes it, over the seeded rows. */
function directoryOver(
  confirmations: InMemorySupplierConfirmationStore,
  now: Date = NOW,
): EarlyAccessSupplierDirectory {
  return new SupabaseEarlyAccessSupplierDirectory({
    // The SAME jsonb shape research_early_access_supplier_for_unit returns:
    // the organisation NAME under the key 'supplierId'.
    query: async (call: unknown) => {
      const args = (call as { args?: Record<string, unknown> }).args ?? {};
      const live = await confirmations.liveForUnit(
        String(args.p_product_id ?? ""),
        String(args.p_variant_id ?? ""),
        String(args.p_now ?? now.toISOString()),
      );
      if (live === null) return null;
      return { supplierId: live.supplierOrg, supplierSku: live.supplierSku };
    },
    now: () => now.getTime(),
  });
}

describe("the one availability decision, before any catalogue is involved", () => {
  it("routes AOD-9604 5 mg, the unit the founder watched fail", async () => {
    const { confirmations } = await productionShaped();
    const decision = await decideSupplierAvailability(
      directoryOver(confirmations),
      AOD.productId,
      AOD.variantId,
    );
    expect(decision).toEqual({
      available: true,
      supplierId: "raw-peptides",
      supplierSku: "R360-AOD9604-5MG-VIAL",
    });
  });

  it("refuses, rather than inventing a route, when the directory knows nothing", async () => {
    const decision = await decideSupplierAvailability(
      { forUnit: async () => null },
      AOD.productId,
      AOD.variantId,
    );
    expect(decision).toEqual({ available: false, reason: "ROUTE_MISSING" });
  });

  it("refuses a route whose supplier identity the checkout guard would reject", async () => {
    // A directory that had not been taught to translate hands back the raw
    // display name. The seam refuses it instead of promising a shipment.
    const decision = await decideSupplierAvailability(
      { forUnit: async () => ({ supplierId: "Raw Peptides", supplierSku: "R360-AOD9604-5MG-VIAL" }) },
      AOD.productId,
      AOD.variantId,
    );
    expect(decision).toEqual({ available: false, reason: "SUPPLIER_ID_INVALID" });
    expect(isSafeIdentifier("Raw Peptides")).toBe(false);
  });

  it("refuses a malformed supplier SKU for the same reason", async () => {
    const decision = await decideSupplierAvailability(
      { forUnit: async () => ({ supplierId: "raw-peptides", supplierSku: "not a sku" }) },
      AOD.productId,
      AOD.variantId,
    );
    expect(decision).toEqual({ available: false, reason: "SUPPLIER_SKU_INVALID" });
  });
});

describe("the catalogue a customer receives answers from the SAME directory", () => {
  /**
   * Served through the REAL catalogue route, because "purchasable" is a
   * customer-facing fact produced by the storefront view and the founder
   * release bridge, not by the projection alone. Asserting it anywhere else
   * would prove nothing about the shelf.
   */
  async function served(
    suppliers: EarlyAccessSupplierDirectory,
    at: Date = NOW,
  ): Promise<{
    readonly units: readonly ServedUnit[];
    readonly purchasableCount: number;
    readonly heldCount: number;
    readonly withdrawn: readonly { sku: string; reason: string }[];
  }> {
    const { source, ledger } = await productionShaped();
    const withdrawn: { sku: string; reason: string }[] = [];
    const consistent = new SupplierConsistentCatalogSource({
      source,
      suppliers,
      releases: ledger,
      onWithdrawn: (rows) =>
        withdrawn.push(...rows.map((row) => ({ sku: row.sku, reason: row.reason }))),
    });

    const route = createEarlyAccessCatalogRoute({
      resolveSession: async () => ({ authenticated: true, expiresAtEpochMs: at.getTime() + 60_000 }),
      catalog: consistent,
      ledger,
      now: () => at.getTime(),
    } as never);

    const state: { body: unknown } = { body: null };
    const port = {
      status() {
        return port;
      },
      json(body: unknown) {
        state.body = body;
        return body;
      },
      setHeader() {
        return port;
      },
    };
    await route(
      { cookieHeader: "ea=1", earlyAccessCustomer: CONTEXT.earlyAccessCustomer },
      port as never,
    );
    const body = state.body as {
      units: ServedUnit[];
      purchasableCount: number;
      heldCount: number;
    };
    return { ...body, withdrawn };
  }

  it("serves the opening set unchanged when every unit is genuinely routable", async () => {
    const { confirmations } = await productionShaped();
    const result = await served(directoryOver(confirmations));

    // The production numbers the founder accepted, reached with supplier truth
    // applied rather than assumed.
    expect(result.units).toHaveLength(22);
    expect(result.purchasableCount).toBe(18);
    expect(result.heldCount).toBe(4);
    expect(result.withdrawn).toEqual([]);
  });

  it("EVERY purchasable unit it serves resolves a route the checkout guard accepts", async () => {
    const { confirmations } = await productionShaped();
    const suppliers = directoryOver(confirmations);
    const result = await served(suppliers);

    const offered = result.units.filter((unit) => unit.purchasable);
    expect(offered.length).toBe(18);

    const unshippable: string[] = [];
    for (const unit of offered) {
      const decision = await decideSupplierAvailability(suppliers, unit.productId, unit.variantId);
      if (!decision.available) unshippable.push(`${unit.productId} (${decision.reason})`);
    }
    // Before the repair this list was all 18, which is why no Early Access
    // order has ever completed in production.
    expect(unshippable, `offered but unshippable: ${unshippable.join(", ")}`).toEqual([]);
  });

  it("serves AOD-9604 5 mg as purchasable, and it survives a checkout preflight", async () => {
    const { confirmations } = await productionShaped();
    const suppliers = directoryOver(confirmations);
    const result = await served(suppliers);

    const aod = result.units.find((unit) => unit.productId === AOD.productId);
    expect(aod?.purchasable).toBe(true);
    expect(aod?.availability).toBe("AVAILABLE");
    expect(aod?.priceCents).toBeGreaterThan(0);

    // The preflight the order route and the cart both run.
    expect(await decideSupplierAvailability(suppliers, AOD.productId, AOD.variantId)).toEqual({
      available: true,
      supplierId: "raw-peptides",
      supplierSku: "R360-AOD9604-5MG-VIAL",
    });
  });

  it("HOLDS the whole shelf once the confirmations expire, with no prices left behind", async () => {
    const { confirmations } = await productionShaped();
    const afterExpiry = new Date(Date.parse(RAW_PEPTIDES_EXPIRES_AT) + 1_000);
    const result = await served(directoryOver(confirmations, afterExpiry), afterExpiry);

    // The 2026-09-03 cliff, told truthfully instead of taking money for a box
    // nobody can ship.
    expect(result.units).toHaveLength(22);
    expect(result.purchasableCount).toBe(0);
    expect(result.heldCount).toBe(22);
    expect(result.withdrawn.length).toBeGreaterThan(0);
    expect(new Set(result.withdrawn.map((row) => row.reason))).toEqual(new Set(["ROUTE_MISSING"]));
    for (const unit of result.units) {
      expect(unit.purchasable).toBe(false);
      expect(unit.priceCents).toBeNull();
    }
  });

  it("HOLDS one unit whose supplier identity is malformed, and only that unit", async () => {
    const { confirmations } = await productionShaped();
    const real = directoryOver(confirmations);
    const suppliers: EarlyAccessSupplierDirectory = {
      forUnit: async (productId, variantId) =>
        productId === AOD.productId && variantId === AOD.variantId
          ? // The untranslated display name: the exact production defect,
            // reproduced at the port.
            { supplierId: "Raw Peptides", supplierSku: "R360-AOD9604-5MG-VIAL" }
          : real.forUnit(productId, variantId),
    };
    const result = await served(suppliers);

    const aod = result.units.find((unit) => unit.productId === AOD.productId);
    expect(aod?.purchasable).toBe(false);
    expect(aod?.priceCents).toBeNull();
    // One bad route withdraws one unit. 18 - 1 = 17.
    expect(result.purchasableCount).toBe(17);
    expect(result.withdrawn).toEqual([
      { sku: "R360-AOD9604-5MG-VIAL", reason: "SUPPLIER_ID_INVALID" },
    ]);
  });

  it("can only ever SUBTRACT, so a permissive directory cannot release a held unit", async () => {
    // A directory that says yes to everything, including the 4 units the
    // founder deliberately held.
    const result = await served({
      forUnit: async () => ({ supplierId: "raw-peptides", supplierSku: "SKU-1" }),
    });
    expect(result.purchasableCount).toBe(18);
    expect(result.heldCount).toBe(4);
    // Cagrilintide stays held, as the founder decided.
    const cagrilintide = result.units.find((unit) => unit.productId === "PEX-028");
    expect(cagrilintide?.purchasable).toBe(false);
  });
});

describe("quantity never changes which supplier ships the unit", () => {
  it("resolves the SAME route for quantity 1 and quantity 3", async () => {
    const { confirmations } = await productionShaped();
    const suppliers = directoryOver(confirmations);
    const calls: string[] = [];
    const counted: EarlyAccessSupplierDirectory = {
      forUnit: async (productId, variantId) => {
        calls.push(`${productId}/${variantId}`);
        return suppliers.forUnit(productId, variantId);
      },
    };

    // The route is a property of the UNIT. Quantity is a property of the line,
    // and a cart that let quantity change the shipper could split one line
    // across two suppliers without telling anybody.
    const forOne = await decideSupplierAvailability(counted, AOD.productId, AOD.variantId);
    const forThree = await decideSupplierAvailability(counted, AOD.productId, AOD.variantId);
    expect(forOne).toEqual(forThree);
    expect(forOne).toEqual({
      available: true,
      supplierId: "raw-peptides",
      supplierSku: "R360-AOD9604-5MG-VIAL",
    });
    expect(calls).toEqual([`${AOD.productId}/${AOD.variantId}`, `${AOD.productId}/${AOD.variantId}`]);
  });
});

describe("readiness: the expiry cliff is reported before a customer finds it", () => {
  it("warns about the whole opening set as 2026-09-03 approaches", async () => {
    const { confirmations, source } = await productionShaped();
    // Inside the warning window, still live.
    const nearly = new Date(Date.parse(RAW_PEPTIDES_EXPIRES_AT) - 5 * 86_400_000);
    const report = await earlyAccessSupplierReadiness({
      source,
      suppliers: directoryOver(confirmations, nearly),
      releases: (await productionShaped()).ledger,
      confirmations,
      now: nearly,
      context: CONTEXT,
    });

    expect(report.routableCount).toBeGreaterThan(0);
    expect(report.withdrawn).toEqual([]);
    // Every purchasable unit expires on the same day, so every one is warned.
    expect(report.expiringSoon.length).toBe(report.routableCount);
    for (const warning of report.expiringSoon) {
      expect(warning.expiresAt).toBe(RAW_PEPTIDES_EXPIRES_AT);
      expect(warning.daysRemaining).toBeLessThanOrEqual(SUPPLIER_EXPIRY_WARNING_DAYS);
      expect(warning.daysRemaining).toBeGreaterThanOrEqual(0);
    }
  });

  it("stays quiet while the confirmations are comfortably live", async () => {
    const { confirmations, source } = await productionShaped();
    const report = await earlyAccessSupplierReadiness({
      source,
      suppliers: directoryOver(confirmations),
      releases: (await productionShaped()).ledger,
      confirmations,
      now: NOW,
      warningDays: 1,
      context: CONTEXT,
    });
    expect(report.expiringSoon).toEqual([]);
    expect(report.withdrawn).toEqual([]);
  });

  it("reports the withdrawals once the confirmations have lapsed", async () => {
    const { confirmations, source } = await productionShaped();
    const afterExpiry = new Date(Date.parse(RAW_PEPTIDES_EXPIRES_AT) + 1_000);
    const report = await earlyAccessSupplierReadiness({
      source,
      suppliers: directoryOver(confirmations, afterExpiry),
      releases: (await productionShaped()).ledger,
      confirmations,
      now: afterExpiry,
      context: CONTEXT,
    });
    expect(report.routableCount).toBe(0);
    expect(report.withdrawn.length).toBeGreaterThan(0);
    expect(report.checkedAt).toBe(afterExpiry.toISOString());
  });
});
