import { describe, expect, it } from "vitest";

import { earlyAccessSupplierIdentifier } from "./supplier-identity";
import { isSafeIdentifier } from "../commerce/input-guards";
import { SupabaseEarlyAccessSupplierDirectory } from "../persistence/commerce-ports";
import { RAW_PEPTIDES_SUPPLY, seedRawPeptidesConfirmations } from "../release/founder-supply-seed";
import { InMemorySupplierConfirmationStore } from "./supplier-confirmation";
import { canonicalReviewProducts } from "../release/first-release-canonical-source";
import { projectEarlyAccessCatalog } from "../catalog/early-access-catalog";
import { purchasableSupplierIssues } from "../cart/supplier-consistency";
import type { CartCatalogUnit } from "../cart/ports";

/**
 * THE DEFECT THE FOUNDER FOUND, AND THE CONTRACT THAT MAKES IT UNREPEATABLE.
 *
 * Production showed AOD-9604 as purchasable and answered SUPPLIER_UNAVAILABLE
 * when a customer tried to buy it. The supplier row existed and the lookup
 * found it: the RPC returns `'supplierId', supplier_org`, and supplier_org is
 * the organisation NAME "Raw Peptides", which the order route rejects because
 * isSafeIdentifier permits no space. It was never an AOD-9604 problem. Every
 * one of the 18 purchasable units carried the same name and failed the same
 * way, which is why no Early Access order has ever completed.
 *
 * These tests pin three things: the name really is unroutable as an
 * identifier, the boundary translates it without weakening the guard, and
 * every purchasable row in the production-shaped catalogue resolves a route
 * the checkout guard accepts.
 */

describe("a supplier's name is not a supplier's identifier", () => {
  it("proves the exact production value fails the guard the order route applies", () => {
    // If this ever stops being true the bug is fixed elsewhere and this file
    // should be re-read rather than deleted.
    expect(RAW_PEPTIDES_SUPPLY.supplierOrg).toBe("Raw Peptides");
    expect(isSafeIdentifier("Raw Peptides")).toBe(false);
  });

  it("derives a stable identifier from the recorded name, deterministically", () => {
    expect(earlyAccessSupplierIdentifier("Raw Peptides")).toBe("raw-peptides");
    expect(earlyAccessSupplierIdentifier("Raw Peptides")).toBe(
      earlyAccessSupplierIdentifier("  raw   peptides  "),
    );
    expect(isSafeIdentifier(earlyAccessSupplierIdentifier("Raw Peptides") as string)).toBe(true);
  });

  it("keeps a value that is ALREADY an identifier exactly as recorded", () => {
    // A deployment that starts writing real supplier ids must not have them
    // re-slugged underneath it.
    expect(earlyAccessSupplierIdentifier("supplier-apex")).toBe("supplier-apex");
    expect(earlyAccessSupplierIdentifier("apex-labs")).toBe("apex-labs");
  });

  it("FAILS CLOSED for a name that cannot produce an identifier", () => {
    // null is the answer the order route already refuses on, so nothing here
    // can turn an unroutable unit into a sellable one.
    for (const hopeless of ["", "   ", "!!!", "  --  ", 42, null, undefined, {}]) {
      expect(earlyAccessSupplierIdentifier(hopeless as unknown)).toBeNull();
    }
  });

  it("translates at the durable boundary, so the port never sees a display name", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      // The exact jsonb shape the RPC returns today.
      query: async () => ({ supplierId: "Raw Peptides", supplierSku: "R360-AOD9604-5MG-VIAL" }),
      now: () => Date.UTC(2026, 7, 7),
    });
    const route = await directory.forUnit("PEX-012", "R360-AOD9604-5MG-VIAL");
    expect(route).toEqual({ supplierId: "raw-peptides", supplierSku: "R360-AOD9604-5MG-VIAL" });
    // The value the order route validates now passes the validation it applies.
    expect(isSafeIdentifier(route?.supplierId as string)).toBe(true);
    expect(isSafeIdentifier(route?.supplierSku as string)).toBe(true);
  });

  it("still answers null when the supplier name is unusable, rather than inventing a route", async () => {
    const directory = new SupabaseEarlyAccessSupplierDirectory({
      query: async () => ({ supplierId: "   ", supplierSku: "R360-AOD9604-5MG-VIAL" }),
      now: () => Date.UTC(2026, 7, 7),
    });
    expect(await directory.forUnit("PEX-012", "R360-AOD9604-5MG-VIAL")).toBeNull();
  });
});

describe("every purchasable unit is routable by the directory checkout uses", () => {
  /**
   * The production-shaped catalogue: the canonical products, the real Raw
   * Peptides supply seed, and the real supplier lookup shape. No stub
   * supplier is injected anywhere in this test, which is exactly what every
   * existing order test did and exactly why the suite stayed green while
   * production could not sell.
   */
  async function productionShaped() {
    const confirmations = new InMemorySupplierConfirmationStore();
    const projection = projectEarlyAccessCatalog({
      products: canonicalReviewProducts().map((product) => ({
        product,
        audience: null,
        currency: "USD",
        variantFacts: [],
      })) as never,
      now: new Date(Date.UTC(2026, 7, 7)),
    });
    const outcome = await seedRawPeptidesConfirmations({
      rows: projection.rows as never,
      store: confirmations,
    });
    return { confirmations, projection, seeded: outcome.seeded, unresolved: outcome.unresolved };
  }

  /** The directory exactly as production composes it, over the seeded rows. */
  function directoryOver(confirmations: InMemorySupplierConfirmationStore) {
    return new SupabaseEarlyAccessSupplierDirectory({
      // The SAME jsonb shape research_early_access_supplier_for_unit returns:
      // supplier_org under the key 'supplierId'. That substitution is the bug.
      query: async (call: unknown) => {
        const args = (call as { args?: Record<string, unknown> }).args ?? {};
        const live = await confirmations.liveForUnit(
          String(args.p_product_id ?? ""),
          String(args.p_variant_id ?? ""),
          String(args.p_now ?? new Date(Date.UTC(2026, 7, 7)).toISOString()),
        );
        if (live === null) return null;
        return { supplierId: live.supplierOrg, supplierSku: live.supplierSku };
      },
      now: () => Date.UTC(2026, 7, 7),
    });
  }

  it("routes EVERY seeded unit through the checkout guard, with AOD-9604 pinned", async () => {
    const { confirmations, seeded } = await productionShaped();
    const directory = directoryOver(confirmations);

    // The whole opening set, not a sample.
    expect(seeded.length).toBeGreaterThanOrEqual(22);

    const unroutable: string[] = [];
    for (const confirmation of seeded) {
      const route = await directory.forUnit(confirmation.confirmation.productId, confirmation.confirmation.variantId);
      if (
        route === null ||
        !isSafeIdentifier(route.supplierId) ||
        !isSafeIdentifier(route.supplierSku)
      ) {
        unroutable.push(`${confirmation.confirmation.productId}/${confirmation.confirmation.variantId}`);
      }
    }
    // Before the translation this list was every single unit, which is why no
    // Early Access order has ever completed in production.
    expect(unroutable, `units the checkout guard would refuse: ${unroutable.join(", ")}`).toEqual(
      [],
    );

    // AOD-9604 5 mg explicitly, because it is the unit the founder watched fail.
    const aod = seeded.find(
      (confirmation) =>
        confirmation.confirmation.productId === "PEX-012" &&
        confirmation.confirmation.variantId === "R360-AOD9604-5MG-VIAL",
    );
    expect(aod, "AOD-9604 5 mg was not seeded").toBeDefined();
    const aodRoute = await directory.forUnit(aod!.confirmation.productId, aod!.confirmation.variantId);
    expect(aodRoute).toEqual({
      supplierId: "raw-peptides",
      supplierSku: "R360-AOD9604-5MG-VIAL",
    });
  });

  it("reports the row rather than hiding it when a route genuinely does not resolve", async () => {
    const { seeded } = await productionShaped();
    const units: CartCatalogUnit[] = seeded.slice(0, 3).map((confirmation) => ({
      productId: confirmation.confirmation.productId,
      variantId: confirmation.confirmation.variantId,
      displayName: confirmation.confirmation.productId,
      strength: "",
      sku: confirmation.sku,
      purchasable: true,
      availability: "AVAILABLE",
      priceCents: 1_000,
      currency: "USD",
      quantityLimit: 3,
      supplierReady: true,
    }));
    expect(units.length).toBe(3);

    const issues = await purchasableSupplierIssues(units, {
      forUnit: async (productId) =>
        productId === units[0]!.productId ? null : { supplierId: "ok", supplierSku: "ok" },
    });
    expect(issues).toEqual([
      {
        productId: units[0]!.productId,
        variantId: units[0]!.variantId,
        code: "SUPPLIER_ROUTE_MISSING",
      },
    ]);
  });
});
