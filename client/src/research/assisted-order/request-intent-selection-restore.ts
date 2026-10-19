import { ASSISTED_ORDER_MAX_LINES, normalizeRequiredText } from "../../../../shared/research/assisted-order/contract";
import type { RequestIntentCatalogItem } from "../../../../shared/research/assisted-order/request-intent";
import { orderEntryQuantityAllowed } from "../early-access/orderEntryIntent";
import { catalogItemKey } from "./wizard-state";

export type ValidatedRequestSelection = Readonly<{ item: RequestIntentCatalogItem; quantity: number }>;
export type RequestSelectionValidation =
  | Readonly<{ kind: "valid"; selections: readonly ValidatedRequestSelection[] }>
  | Readonly<{ kind: "invalid" }>;

function exactIdentity(value: unknown): value is string {
  return typeof value === "string" && !value.includes("\u0000")
    && normalizeRequiredText("selection.identity", value, 160) === value;
}

/** Validate decoded, untrusted selection lines against a CURRENT complete catalog.
 * This does not read storage, establish an owner, prove catalog completeness or
 * authorize submission. Caller must establish those boundaries separately.
 * No cached names/prices/eligibility facts, quantity adjustment or substitutions.
 * Any invalid line rejects the whole draft; an empty selection list is valid.
 */
export function validateRetainedRequestSelections(
  raw: unknown, currentCatalog: readonly RequestIntentCatalogItem[],
): RequestSelectionValidation {
  try {
    if (!Array.isArray(raw) || raw.length > ASSISTED_ORDER_MAX_LINES
      || !Array.isArray(currentCatalog) || currentCatalog.length > 50_000) return { kind: "invalid" };
    const byIdentity = new Map<string, RequestIntentCatalogItem>();
    for (const item of currentCatalog) {
      if (!item || !exactIdentity(item.productId) || !exactIdentity(item.variantId)) return { kind: "invalid" };
      const key = catalogItemKey(item);
      if (byIdentity.has(key)) return { kind: "invalid" };
      byIdentity.set(key, item);
    }
    const seen = new Set<string>();
    const selections: ValidatedRequestSelection[] = [];
    for (const line of raw) {
      if (!line || typeof line !== "object" || Array.isArray(line)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(line))) return { kind: "invalid" };
      const keys = Reflect.ownKeys(line);
      if (keys.length !== 3 || keys.some((key) => !["productId", "variantId", "quantity"].includes(String(key)))
        || keys.some((key) => typeof key !== "string")) return { kind: "invalid" };
      if (!exactIdentity(line.productId) || !exactIdentity(line.variantId)) return { kind: "invalid" };
      const key = catalogItemKey(line);
      if (seen.has(key)) return { kind: "invalid" };
      seen.add(key);
      const item = byIdentity.get(key);
      if (!item || item.selectableForReview !== true || !orderEntryQuantityAllowed(item, line.quantity)) {
        return { kind: "invalid" };
      }
      selections.push(Object.freeze({ item, quantity: line.quantity }));
    }
    return { kind: "valid", selections: Object.freeze(selections) };
  } catch {
    return { kind: "invalid" };
  }
}
