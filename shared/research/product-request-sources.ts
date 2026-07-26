/**
 * Browser-safe product-request attribution shared by the member UI and the
 * server adapter. Keeping the accepted vocabulary in shared/ prevents client
 * code from importing through the server tree.
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
