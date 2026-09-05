import type { AssistedOrderCatalogItem } from "@shared/research/assisted-order/contract";
import { EARLY_ACCESS_POLICY_MAX_QUANTITY } from "@shared/research/early-access-quantity";
import { isMasterOfferingFamily } from "@shared/research/master-offerings/contract";
import { loadAssistedOrderCatalog } from "../assisted-order/api";
import type { StorefrontIntent } from "../storefront/entry-intent";

const KEYS = ["family", "slug", "variant", "qty", "intent"] as const;
const ACTIONS = {
  buy_now: "BUY_NOW", assisted_order: "ASSISTED_ORDER",
  request_quote: "REQUEST_QUOTE", care: "CARE",
} as const;

/** A navigation hint only. Unknown, duplicate, credential and referral fields fail closed. */
export function orderEntryIntentFromSearch(search: string): StorefrontIntent | null {
  const params = new URLSearchParams(search);
  const keys = [...params.keys()];
  if (keys.length !== KEYS.length || keys.some((key) =>
    !KEYS.includes(key as typeof KEYS[number]) || params.getAll(key).length !== 1)) return null;
  const rawAction = params.get("intent") ?? "";
  if (!Object.hasOwn(ACTIONS, rawAction)) return null;
  const action = ACTIONS[rawAction as keyof typeof ACTIONS];
  const rawQuantity = params.get("qty") ?? "";
  const family = params.get("family") ?? "";
  const slug = params.get("slug") ?? "";
  const variantId = params.get("variant") ?? "";
  const quantity = Number(rawQuantity);
  // Navigation uses the assisted-policy ceiling, not the lower direct-cart
  // durability ceiling. A retained hint never grants either lane permission.
  if (!action || !isMasterOfferingFamily(family) ||
    !/^[a-z0-9][a-z0-9-]{0,191}$/.test(slug) || !/^[A-Za-z0-9._-]{1,80}$/.test(variantId) ||
    !/^[1-9]\d{0,2}$/.test(rawQuantity) || !Number.isSafeInteger(quantity) ||
    quantity > EARLY_ACCESS_POLICY_MAX_QUANTITY) return null;
  return { family, slug, variantId, quantity, action };
}

export function orderEntryIntentFromReturnTo(returnTo: string | null): StorefrontIntent | null {
  const match = /^\/research\/member\/catalog\/([a-z0-9_]+)\/([a-z0-9-]+)\?(.+)$/.exec(returnTo ?? "");
  if (!match) return null;
  const params = new URLSearchParams(match[3]);
  if ([...params.keys()].some((key) => !["variant", "qty", "intent"].includes(key))) return null;
  params.set("family", match[1]);
  params.set("slug", match[2]);
  return orderEntryIntentFromSearch(params.toString());
}

export function orderEntryIntentHref(
  path: "/research/early-access" | "/research/early-access/order-request",
  intent: StorefrontIntent | null,
): string {
  if (!intent) return path;
  if (intent.action === "CARE") return "/care/schedule";
  const params = new URLSearchParams({ family: intent.family, slug: intent.slug,
    variant: intent.variantId, qty: String(intent.quantity), intent: intent.action.toLowerCase() });
  return orderEntryIntentFromSearch(params.toString()) ? `${path}?${params}` : path;
}

/** Compare the server's source mapping, never Product Control IDs or display-name guesses. */
export function matchesOrderEntryIntent(item: AssistedOrderCatalogItem, intent: StorefrontIntent): boolean {
  const source = item?.sourceSelection;
  return source?.family === intent.family && source.slug === intent.slug && source.variantId === intent.variantId;
}

export function orderEntryQuantityAllowed(item: AssistedOrderCatalogItem, quantity: number): boolean {
  const { minimumQuantity: min, maximumQuantity: max, quantityIncrement: step } = item;
  return Number.isSafeInteger(quantity) && Number.isSafeInteger(min) && min > 0 &&
    Number.isSafeInteger(step) && step > 0 && quantity >= min && quantity <= EARLY_ACCESS_POLICY_MAX_QUANTITY &&
    (max === null || (Number.isSafeInteger(max) && quantity <= max)) && (quantity - min) % step === 0;
}

export type OrderEntryIntentResolution =
  | Readonly<{ kind: "matched"; item: AssistedOrderCatalogItem; quantity: number }>
  | Readonly<{ kind: "care" }>
  | Readonly<{ kind: "unavailable" | "missing" | "ambiguous" | "quantity_unavailable" }>;

export function resolveOrderEntryIntent(
  intent: StorefrontIntent, items: readonly AssistedOrderCatalogItem[],
): OrderEntryIntentResolution {
  if (intent.action === "CARE") return { kind: "care" };
  const matching = items.filter((item) => matchesOrderEntryIntent(item, intent));
  if (matching.length === 0) return { kind: "missing" };
  if (matching.length !== 1) return { kind: "ambiguous" };
  const item = matching[0];
  if (item.workflowMode === "provider_request") return { kind: "care" };
  if (item.family !== intent.family) return { kind: "unavailable" };
  if (!["direct_order_request", "request_pricing", "request_activation"].includes(item.workflowMode)) {
    return { kind: "unavailable" };
  }
  if (!orderEntryQuantityAllowed(item, intent.quantity)) return { kind: "quantity_unavailable" };
  if (typeof item.productName !== "string" || !item.productName.trim() || item.productName.length > 240 ||
    (item.specification !== null && typeof item.specification !== "string")) {
    return { kind: "unavailable" };
  }
  return { kind: "matched", item, quantity: intent.quantity };
}

/** Bounded family read; a partial/changed/malformed page set never proves a unique match. */
export async function loadOrderEntryIntent(
  intent: StorefrontIntent, signal?: AbortSignal,
): Promise<OrderEntryIntentResolution> {
  if (intent.action === "CARE") return { kind: "care" };
  const items: AssistedOrderCatalogItem[] = [];
  let total: number | null = null;
  let pageSize: number | null = null;
  for (let page = 1; page <= 10; page += 1) {
    const result = await loadAssistedOrderCatalog({ family: intent.family, page, pageSize: 100 }, signal);
    if (!result || !Array.isArray(result.items) || !Number.isSafeInteger(result.total) || result.total < 0 ||
      result.page !== page || !Number.isSafeInteger(result.pageSize) || result.pageSize < 1 || result.pageSize > 100 ||
      (total !== null && result.total !== total) || (pageSize !== null && result.pageSize !== pageSize) ||
      result.items.some((item) => !item || typeof item !== "object") ||
      result.items.length !== Math.min(result.pageSize, Math.max(0, result.total - (page - 1) * result.pageSize))) return { kind: "unavailable" };
    total = result.total;
    pageSize = result.pageSize;
    items.push(...result.items);
    if (page * result.pageSize >= total) return resolveOrderEntryIntent(intent, items);
    if (result.items.length < result.pageSize) return { kind: "unavailable" };
  }
  return { kind: "unavailable" };
}
