/**
 * Quote-only Early Access.
 *
 * The customer-facing catalog carries no catalog price: every product says
 * "Request a quote". These helpers build that projection at the customer
 * boundary. They never touch the stored price, the server's own pricing (which
 * still decides eligibility, staff records and issued quotes), or any field a
 * customer needs to choose: identity, strength, quantity bounds and workflow
 * are unchanged. A removed price becomes null, never zero.
 */

export const EARLY_ACCESS_QUOTE_LABEL = "Request a quote";

/**
 * The first Early Access release is quote-only. Every customer composition
 * point reads this one constant, so the cutover and its rollback are one
 * revertible commit, not an environment flag. Staff pricing, issued quotes,
 * invoices and paid records are never affected by it.
 */
export const EARLY_ACCESS_QUOTE_ONLY_RELEASE = true;

/** The marker a quote-only storefront unit carries, so a client never infers it from a missing price. */
export const EARLY_ACCESS_QUOTE_PRICING = "quote" as const;

/** Workflows whose customer action becomes "Request a quote". Clinical and held actions keep their own words. */
const QUOTE_ACTION_WORKFLOWS: ReadonlySet<string> = new Set(["direct_order_request", "request_pricing", "request_activation"]);

/** Keys that carry a catalog amount in a customer response. */
const PRICE_KEYS: ReadonlySet<string> = new Set([
  "unitPriceCents",
  "priceCents",
  "amountCents",
  "lineEstimateCents",
  "estimatedTotalCents",
  "subtotalCents",
  "totalCents",
  "discountCents",
  "payableCents",
  "payableTotalCents",
  "currentUnitPriceCents",
  "fromCents",
  "toCents",
]);

/**
 * Every path in `value` where a catalog amount is present as a number. An
 * empty list means the value exposes no catalog price. For tests and audits.
 */
export function catalogPriceFields(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => catalogPriceFields(entry, path ? `${path}.${index}` : String(index)));
  }
  if (typeof value !== "object" || value === null) return [];
  const found: string[] = [];
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const here = path ? `${path}.${key}` : key;
    if (PRICE_KEYS.has(key) && typeof entry === "number") found.push(here);
    else found.push(...catalogPriceFields(entry, here));
  }
  return found;
}

type PricedItem = {
  readonly unitPriceCents: number | null;
  readonly priceVersion?: string | null;
  readonly workflowMode?: string;
  readonly actionLabel?: string;
};

export function quoteOnlyCatalogItem<T extends PricedItem>(item: T): T {
  const relabel = typeof item.workflowMode === "string" && QUOTE_ACTION_WORKFLOWS.has(item.workflowMode)
    && typeof item.actionLabel === "string";
  return Object.freeze({
    ...item,
    unitPriceCents: null,
    ...("priceVersion" in item ? { priceVersion: null } : {}),
    ...(relabel ? { actionLabel: EARLY_ACCESS_QUOTE_LABEL } : {}),
  });
}

export function quoteOnlyCatalogPage<P extends { readonly items: readonly PricedItem[] }>(page: P): P {
  return Object.freeze({ ...page, items: Object.freeze(page.items.map((item) => quoteOnlyCatalogItem(item))) });
}

type PricedLine = {
  readonly unitPriceCents: number | null;
  readonly lineEstimateCents: number | null;
  readonly priceVersion?: string | null;
};

/** A new-request receipt or a request status: no catalog-derived estimate, everything else kept. */
export function quoteOnlyRequestView<V extends { readonly estimatedTotalCents: number | null; readonly lines: readonly PricedLine[] }>(
  view: V,
): V {
  return Object.freeze({
    ...view,
    estimatedTotalCents: null,
    lines: Object.freeze(view.lines.map((line) => Object.freeze({
      ...line,
      unitPriceCents: null,
      lineEstimateCents: null,
      ...("priceVersion" in line ? { priceVersion: null } : {}),
    }))),
  });
}

export function quoteOnlyStorefrontUnit<U extends { readonly priceCents: number | null }>(
  unit: U,
): U & { readonly pricing: typeof EARLY_ACCESS_QUOTE_PRICING } {
  return Object.freeze({ ...unit, priceCents: null, pricing: EARLY_ACCESS_QUOTE_PRICING });
}
