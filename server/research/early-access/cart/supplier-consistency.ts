import type { CartCatalogUnit, EarlyAccessCartSupplierPort } from "./ports";

export type PurchasableSupplierIssue = Readonly<{
  productId: string;
  variantId: string;
  code: "SUPPLIER_READY_FALSE" | "SUPPLIER_ROUTE_MISSING" | "SUPPLIER_ID_INVALID" | "SUPPLIER_SKU_INVALID";
}>;

const SAFE_ID = /^[A-Za-z0-9:_./-]{2,200}$/;

/**
 * A production boot/readiness contract: every row sold by the catalogue must be
 * routable by the exact supplier directory used during checkout. It never repairs
 * or fabricates data. Callers either fix the route or project the row held.
 */
export async function purchasableSupplierIssues(
  rows: readonly CartCatalogUnit[],
  suppliers: EarlyAccessCartSupplierPort,
): Promise<readonly PurchasableSupplierIssue[]> {
  const issues: PurchasableSupplierIssue[] = [];
  for (const row of rows.filter((candidate) => candidate.purchasable)) {
    if (!row.supplierReady) {
      issues.push({ productId: row.productId, variantId: row.variantId, code: "SUPPLIER_READY_FALSE" });
      continue;
    }
    const route = await suppliers.forUnit(row.productId, row.variantId);
    if (route === null) {
      issues.push({ productId: row.productId, variantId: row.variantId, code: "SUPPLIER_ROUTE_MISSING" });
      continue;
    }
    if (!SAFE_ID.test(route.supplierId)) issues.push({ productId: row.productId, variantId: row.variantId, code: "SUPPLIER_ID_INVALID" });
    if (!SAFE_ID.test(route.supplierSku)) issues.push({ productId: row.productId, variantId: row.variantId, code: "SUPPLIER_SKU_INVALID" });
  }
  return Object.freeze(issues);
}

export async function supplierConsistentPurchasability(
  rows: readonly CartCatalogUnit[],
  suppliers: EarlyAccessCartSupplierPort,
): Promise<readonly CartCatalogUnit[]> {
  const issues = await purchasableSupplierIssues(rows, suppliers);
  const keys = new Set(issues.map((issue) => `${issue.productId}\u0000${issue.variantId}`));
  return Object.freeze(rows.map((row) => {
    if (!row.purchasable || !keys.has(`${row.productId}\u0000${row.variantId}`)) return row;
    return Object.freeze({ ...row, purchasable: false, availability: "TEMPORARILY_HELD", priceCents: null });
  }));
}
