import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import { loadAssistedOrderCatalog } from "./api";
import {
  addOrUpdateSelection,
  catalogItemKey,
  clampQuantity,
  removeSelection,
  selectableInResearchRequest,
  type AssistedOrderSelectionMap,
} from "./wizard-state";

// Re-resolves persisted or stale selection snapshots against the live catalog
// projection. Used when a draft is restored after a session bounce and when a
// submission is refused with price_changed / catalog_changed: the customer
// must review CURRENT server values, and the client never invents them.
//
// The catalog endpoint has no by-id lookup, so this searches by product name
// and matches the exact (productId, variantId) key. A selection that no
// longer resolves is reported missing so the caller can remove it and say so.

export type SelectionRefreshResult = Readonly<{
  selections: AssistedOrderSelectionMap;
  refreshedCount: number;
  missing: readonly string[];
}>;

export async function refreshSelectionSnapshots(
  selections: AssistedOrderSelectionMap,
): Promise<SelectionRefreshResult> {
  const wanted = Array.from(selections.values());
  if (wanted.length === 0) {
    return { selections, refreshedCount: 0, missing: [] };
  }

  const found = new Map<string, AssistedOrderCatalogItem>();
  const names = Array.from(
    new Set(wanted.map((selection) => selection.item.productName)),
  );
  for (const name of names) {
    const page = await loadAssistedOrderCatalog({
      search: name,
      pageSize: 24,
    });
    for (const item of page.items) {
      found.set(catalogItemKey(item), item);
    }
  }

  let next = selections;
  let refreshedCount = 0;
  const missing: string[] = [];
  for (const selection of wanted) {
    const key = catalogItemKey(selection.item);
    const fresh = found.get(key);
    if (!fresh || !selectableInResearchRequest(fresh)) {
      missing.push(selection.item.productName);
      next = removeSelection(next, selection.item);
      continue;
    }
    refreshedCount += 1;
    next = addOrUpdateSelection(
      next,
      fresh,
      clampQuantity(fresh, selection.quantity),
      selection.notes,
    );
  }
  return {
    selections: next,
    refreshedCount,
    missing: Object.freeze(missing),
  };
}
