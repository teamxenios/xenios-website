/**
 * The founder's supplier-availability confirmation, as versioned data.
 *
 * Samuel's answers of 2026-08-04, recorded verbatim (relayed through the
 * read-only reviewer, evidence reference below): supplier organization Raw
 * Peptides, contact Samuel Boadu 737-418-6381, maximum fulfillable quantity
 * 50 per product, fulfilment location Houston, Texas, cold chain REQUIRED
 * AND AVAILABLE end to end, confirmation expiry 30 DAYS (deliberately not
 * the two-year product shelf life, which is recorded separately in the
 * documentation state so the supply promise is re-confirmed monthly), and
 * OUR canonical R360 SKUs recorded as the supplier's own part numbers
 * because Raw Peptides uses ours - no second SKU authority is minted.
 *
 * One confirmation per RESOLVED founder first-release unit, through the same
 * resolution the pricing seed uses, so the two seeds can never disagree
 * about which unit a name means. The 8 unresolved rows get nothing: a
 * supply promise for a unit with no founder-locked identity would be a
 * promise about nothing.
 */

import {
  createSupplierConfirmation,
  type SupplierConfirmation,
  type SupplierConfirmationStore,
} from "../ops/supplier-confirmation";
import {
  resolveFounderFirstReleaseUnits,
  type UnresolvedFirstRelease,
} from "./founder-first-release-seed";
import type { EarlyAccessCatalogRow } from "../catalog/early-access-catalog";

export const RAW_PEPTIDES_CONFIRMED_AT = "2026-08-04T23:30:00.000Z";
/** 30 days, Samuel's explicit pick over the two-year shelf life. */
export const RAW_PEPTIDES_EXPIRES_AT = "2026-09-03T23:30:00.000Z";

export const RAW_PEPTIDES_SUPPLY = Object.freeze({
  supplierOrg: "Raw Peptides",
  supplierContact: "Samuel Boadu, 737-418-6381 (relationship owner)",
  maxQuantity: 50,
  fulfillmentLocation: "Houston, Texas",
  fulfillmentMethod: "cold_chain_courier",
  targetHandoffHours: 72,
  shippingRequirements:
    "Cold chain maintained end to end; insulated packaging with cold packs.",
  coldChainState: "required_and_available",
  documentationState:
    "supplier_states_2_year_shelf_life_from_receipt; COA per lot pending",
  confirmedBy: "Samuel Boadu",
  evidenceRef: "relay:bug-hunter/samuel-2026-08-04-supply-confirmation",
});

export type SeededSupplyConfirmation = Readonly<{
  sku: string;
  confirmationId: string;
  confirmation: SupplierConfirmation;
}>;

export type FounderSupplySeedOutcome = Readonly<{
  seeded: readonly SeededSupplyConfirmation[];
  unresolved: readonly UnresolvedFirstRelease[];
}>;

/**
 * Record one Raw Peptides confirmation per resolved first-release unit.
 * Idempotent: a replayed seed answers false from the store and the existing
 * record stands.
 */
export const RAW_PEPTIDES_CONFIRMATION_ID_PREFIX = "supconf-rawpeptides-";

export async function seedRawPeptidesConfirmations(input: {
  readonly rows: readonly EarlyAccessCatalogRow[];
  readonly store: SupplierConfirmationStore;
  /**
   * The identity namespace for the rows this run writes. It exists because the
   * confirmation id is derived from the SKU, and the SKU is stable across
   * re-keyings: the same unit confirmed against a different set of product and
   * variant ids would collide on the primary key and silently no-op. A distinct
   * prefix keeps the earlier rows intact and inert instead of overwriting them.
   * Defaults to the original namespace, so every existing caller is unchanged.
   */
  readonly confirmationIdPrefix?: string;
}): Promise<FounderSupplySeedOutcome> {
  const resolution = resolveFounderFirstReleaseUnits(input.rows);
  const seeded: SeededSupplyConfirmation[] = [];
  const prefix = input.confirmationIdPrefix ?? RAW_PEPTIDES_CONFIRMATION_ID_PREFIX;

  for (const { row } of resolution.resolved) {
    const created = createSupplierConfirmation({
      confirmationId: `${prefix}${row.sku.toLowerCase()}`,
      supplierOrg: RAW_PEPTIDES_SUPPLY.supplierOrg,
      supplierContact: RAW_PEPTIDES_SUPPLY.supplierContact,
      productId: row.productId,
      variantId: row.variantId,
      sku: row.sku,
      // Raw Peptides uses OUR canonical SKUs; recorded explicitly rather
      // than minting a second authority.
      supplierSku: row.sku,
      strength: row.strength ?? "",
      presentation: row.presentation ?? "",
      maxQuantity: RAW_PEPTIDES_SUPPLY.maxQuantity,
      fulfillmentLocation: RAW_PEPTIDES_SUPPLY.fulfillmentLocation,
      fulfillmentMethod: RAW_PEPTIDES_SUPPLY.fulfillmentMethod,
      targetHandoffHours: RAW_PEPTIDES_SUPPLY.targetHandoffHours,
      shippingRequirements: RAW_PEPTIDES_SUPPLY.shippingRequirements,
      coldChainState: RAW_PEPTIDES_SUPPLY.coldChainState,
      documentationState: RAW_PEPTIDES_SUPPLY.documentationState,
      confirmedAt: RAW_PEPTIDES_CONFIRMED_AT,
      expiresAt: RAW_PEPTIDES_EXPIRES_AT,
      confirmedBy: RAW_PEPTIDES_SUPPLY.confirmedBy,
      evidenceRef: RAW_PEPTIDES_SUPPLY.evidenceRef,
    });
    if (!created.ok) {
      throw new Error(`raw peptides confirmation refused for ${row.sku}: ${created.code}`);
    }
    await input.store.insert(created.value);
    seeded.push(
      Object.freeze({
        sku: row.sku,
        confirmationId: created.value.confirmationId,
        confirmation: created.value,
      }),
    );
  }

  return Object.freeze({
    seeded: Object.freeze(seeded),
    unresolved: resolution.unresolved,
  });
}
