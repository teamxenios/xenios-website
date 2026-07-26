/**
 * Website 3's server-only projection for Website 4. It deliberately excludes
 * inventory, lots, payments, orders, member data, and all provider details.
 * Operations consumes this projection instead of reading product-admin tables.
 */
export interface ProductCommerceReadinessProjection {
  productId: string;
  variantId: string;
  sku: string;
  productApproved: boolean;
  productActive: boolean;
  variantApproved: boolean;
  variantActive: boolean;
  activePrice: {
    amountCents: number;
    currency: string;
    effectiveAt: string;
    version: number;
  } | null;
  shippingClass: string | null;
  exactLotCoaRequired: boolean;
  productDocumentationRequired: boolean;
}

export interface ProductCommerceReadinessReader {
  getForVariant(
    variantId: string,
  ): Promise<ProductCommerceReadinessProjection | null>;
}
