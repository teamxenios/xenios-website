import { isSafeIdentifier } from "../commerce/input-guards";

/**
 * A SUPPLIER'S NAME AND A SUPPLIER'S IDENTIFIER ARE TWO DIFFERENT THINGS.
 *
 * This module exists because production could not sell anything, and the
 * reason was one field carrying the wrong vocabulary.
 *
 * WHAT HAPPENED. `research_early_access_supplier_for_unit` builds its answer
 * as `jsonb_build_object('supplierId', supplier_org, 'supplierSku',
 * supplier_sku)`. `supplier_org` is a free-text organisation NAME: the
 * confirmation domain validates it with `isSafeText`, and the table's only
 * constraint is a length check, so "Raw Peptides" is legal to write and legal
 * to store. The order route then validates the value it receives as
 * `supplierId` with `isSafeIdentifier`, whose pattern
 * (/^[A-Za-z0-9][A-Za-z0-9_.:-]{2,127}$/) contains no space. Every one of the
 * 22 confirmations carries `supplierOrg: "Raw Peptides"`, so every purchasable
 * unit resolved a real supplier row and then had it thrown away, and the
 * customer was told SUPPLIER_UNAVAILABLE. The founder saw it on AOD-9604
 * because AOD-9604 is the first card on the shelf; it was never an AOD-9604
 * problem. It was all 18.
 *
 * WHAT THIS DOES, AND WHAT IT REFUSES TO DO. It derives a stable identifier
 * from the supplier's own recorded name. It does NOT invent a supplier, does
 * NOT invent a route, and does NOT relax the guard that caught this. The
 * supplier, the SKU and the confirmation row are exactly what operations
 * recorded; only the ENCODING of the supplier's identity is translated into
 * the vocabulary the contract requires, at the one boundary whose job is
 * already translating the database's answer into the port's type.
 *
 * IT FAILS CLOSED. A name that cannot produce a valid identifier returns
 * null, and null is the answer the order route already refuses on. Nothing
 * here can turn an unroutable unit into a sellable one.
 *
 * THE PROPER FIX, for when a migration is in scope: give the confirmation
 * record its own `supplier_id` column, written deliberately by operations
 * alongside the display name, and have the RPC return that. This function is
 * then deleted and the two vocabularies stop sharing a field. That is a
 * schema change with a production data write, which this successor
 * deliberately does not make.
 */

/**
 * The identifier form of a supplier's recorded name.
 *
 * Lowercased, runs of anything outside the identifier alphabet collapsed to a
 * single hyphen, trimmed of leading and trailing hyphens. "Raw Peptides"
 * becomes "raw-peptides", deterministically, so the same organisation always
 * resolves to the same identifier and two orders from one supplier group
 * together.
 *
 * Returns null when the result would not satisfy `isSafeIdentifier`, which is
 * the fail-closed direction: an unroutable supplier must read as no supplier.
 */
export function earlyAccessSupplierIdentifier(organisationName: unknown): string | null {
  if (typeof organisationName !== "string") return null;
  // Already an identifier: a deployment that starts recording real supplier
  // ids keeps them verbatim rather than having them re-slugged.
  const trimmed: string = organisationName.trim();
  if (isSafeIdentifier(trimmed)) return trimmed;

  const slug = trimmed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return isSafeIdentifier(slug) ? slug : null;
}
