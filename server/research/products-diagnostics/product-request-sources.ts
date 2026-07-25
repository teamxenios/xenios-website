/**
 * Browser-safe Website 3 source contract. Both the member UI and the server
 * adapter import this module so rendered attribution can never drift from the
 * accepted request vocabulary.
 */
export const PRODUCT_REQUEST_ENTRY_POINTS = [
  "empty_search",
  "products",
  "blends",
  "supplements",
  "programs",
  "quantum",
  "diagnostics",
  "glp_cards",
  "support",
] as const;

export type ProductRequestEntryPoint =
  (typeof PRODUCT_REQUEST_ENTRY_POINTS)[number];

export function productRequestHref(
  source: ProductRequestEntryPoint,
  productName?: string,
): string {
  const params = new URLSearchParams({ source });
  if (productName?.trim()) params.set("product", productName.trim());
  return `/research/member/product-requests/new?${params.toString()}`;
}
