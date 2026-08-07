import express from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";

import { registerPrivateEarlyAccessApi } from "./register";
import {
  EARLY_ACCESS_TEST_CONFIG,
  EARLY_ACCESS_TEST_PASSWORD,
  StubAgreementGate,
  StubReferralResolver,
  StubShippingPolicy,
  StubSupplierDirectory,
  SUPPLIER_ASSIGNMENT,
  approvedLedgerFor,
  catalogOf,
  cleanUnit,
  sequentialOrderNumbers,
  sequentialProofIds,
} from "./routes/route-fixtures";
import type { EarlyAccessSupplierDirectory } from "./routes/ports";

const UNLOCK = "/api/research/early-access/unlock";
const CATALOG = "/api/research/early-access/catalog";

/**
 * THE SEAM IS MOUNTED, NOT MERELY WRITTEN.
 *
 * `ops/supplier-availability.ts` proves the decision is correct. This file
 * proves `registerPrivateEarlyAccessApi` actually applies it, because the
 * defect it closes was never in a function: it was that the catalogue and the
 * checkout consulted DIFFERENT things, and a module nobody composed would
 * leave that exactly as it was.
 *
 * The historical shape is worth stating plainly. `supplierReady` on a row
 * comes from the product's lane, which yields a fulfillment owner for every
 * research material, so it was true whether or not any supplier row existed.
 * The order route asked the mounted directory. The shelf therefore advertised
 * units the order door refused, and `!row.supplierReady` was dead code.
 */
describe("registration decides the catalogue against the mounted supplier directory", () => {
  async function servedCatalog(suppliers: EarlyAccessSupplierDirectory): Promise<{
    readonly purchasableCount: number;
    readonly heldCount: number;
    readonly units: readonly {
      productId: string;
      purchasable: boolean;
      priceCents: number | null;
    }[];
  }> {
    const unit = cleanUnit();
    const app = express();
    app.use(express.json());
    registerPrivateEarlyAccessApi(app, {
      config: EARLY_ACCESS_TEST_CONFIG,
      catalog: catalogOf([unit]),
      releases: await approvedLedgerFor(unit),
      agreements: new StubAgreementGate(true),
      suppliers,
      shipping: new StubShippingPolicy(true),
      referrals: new StubReferralResolver(null),
      orderNumber: sequentialOrderNumbers(),
      proofId: sequentialProofIds(),
    });

    const unlocked = await request(app)
      .post(UNLOCK)
      .send({ password: EARLY_ACCESS_TEST_PASSWORD });
    expect(unlocked.status).toBe(200);
    const raw = unlocked.headers["set-cookie"];
    const cookies = Array.isArray(raw) ? raw : raw === undefined ? [] : [raw];
    const cookie = cookies.map((entry) => entry.split(";")[0]).join("; ");

    const served = await request(app).get(CATALOG).set("Cookie", cookie);
    expect(served.status).toBe(200);
    return served.body;
  }

  it("offers the unit when the mounted directory can genuinely route it", async () => {
    const served = await servedCatalog(new StubSupplierDirectory(SUPPLIER_ASSIGNMENT));
    expect(served.purchasableCount).toBe(1);
    expect(served.units[0]?.purchasable).toBe(true);
  });

  it("HOLDS the unit when the mounted directory has no route for it", async () => {
    // The exact production split-brain: a released, cleanly projected unit
    // that the checkout could never have fulfilled. Before the seam was
    // mounted this served purchasableCount 1 and then refused at the order
    // door. It now holds the unit on the shelf instead.
    const served = await servedCatalog({ forUnit: async () => null });
    expect(served.purchasableCount).toBe(1 - 1);
    expect(served.heldCount).toBe(1);
    expect(served.units[0]?.purchasable).toBe(false);
    // And no amount is left sitting beside a unit nobody can ship.
    expect(served.units[0]?.priceCents).toBeNull();
  });

  it("HOLDS the unit when the directory answers a supplier NAME rather than an id", async () => {
    // "Raw Peptides" is what `research_early_access_supplier_for_unit` returns
    // under the key `supplierId`, and it fails `isSafeIdentifier` on the
    // space. A directory that has not been taught to translate must not put
    // the unit on the shelf.
    const served = await servedCatalog({
      forUnit: async () => ({ supplierId: "Raw Peptides", supplierSku: "R360-AOD9604-5MG-VIAL" }),
    });
    expect(served.purchasableCount).toBe(0);
    expect(served.units[0]?.purchasable).toBe(false);
  });

  it("HOLDS the unit when the directory answers a malformed supplier SKU", async () => {
    const served = await servedCatalog({
      forUnit: async () => ({ supplierId: "raw-peptides", supplierSku: "not a sku" }),
    });
    expect(served.purchasableCount).toBe(0);
  });
});
