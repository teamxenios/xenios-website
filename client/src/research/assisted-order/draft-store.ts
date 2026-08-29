import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";
import type { AssistedOrderSelection, AssistedOrderSelectionMap } from "./wizard-state";
import { catalogItemKey } from "./wizard-state";

// The wizard's in-progress draft, persisted so an Early Access session bounce
// (expiry, re-unlock, refresh) does not cost the customer their basket.
//
// WHAT IS STORED: the selected catalog rows (the server's own projection,
// display-only), quantities, per-line and general notes, the current step, and
// the attempt's idempotency key so a resumed submission replays as the SAME
// request instead of creating a second one.
//
// WHAT IS NEVER STORED: names, email, phone, addresses, or anything from the
// contact step. That matches the pendingOrderStore decision: contact details
// live in memory only. Stored prices are estimates for display; the server
// re-prices every line at submission and the client copy says so.
//
// The key lives under the shared assisted-order prefix so the sign-out sweep
// (clearAssistedOrderStorage) removes the draft along with everything else.

export const ASSISTED_ORDER_DRAFT_KEY = `${ASSISTED_ORDER_STORAGE_PREFIX}draft.v1`;

export type AssistedOrderWizardStep = "products" | "contact" | "review";

const wizardSteps: readonly AssistedOrderWizardStep[] = [
  "products",
  "contact",
  "review",
];

export type AssistedOrderDraft = Readonly<{
  idempotencyKey: string;
  step: AssistedOrderWizardStep;
  selections: readonly AssistedOrderSelection[];
  generalNotes: string;
  savedAt: string;
}>;

function defaultStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function isCatalogItem(value: unknown): value is AssistedOrderCatalogItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.productId === "string" &&
    item.productId.length > 0 &&
    typeof item.variantId === "string" &&
    item.variantId.length > 0 &&
    typeof item.productName === "string" &&
    typeof item.minimumQuantity === "number" &&
    typeof item.quantityIncrement === "number" &&
    (item.unitPriceCents === null || typeof item.unitPriceCents === "number") &&
    typeof item.catalogVersion === "string"
  );
}

function parseSelection(value: unknown): AssistedOrderSelection | null {
  if (typeof value !== "object" || value === null) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (!isCatalogItem(record.item)) {
    return null;
  }
  const item = record.item;
  const quantity =
    typeof record.quantity === "number" &&
    Number.isSafeInteger(record.quantity) &&
    record.quantity >= 1
      ? record.quantity
      : item.minimumQuantity;
  const notes = typeof record.notes === "string" ? record.notes : "";
  return Object.freeze({ item, quantity, notes });
}

/**
 * Reads the persisted draft. Anything malformed reads as "no draft": the
 * wizard starts clean rather than rendering garbage or throwing.
 */
export function readAssistedOrderDraft(
  storage?: Storage | null,
): AssistedOrderDraft | null {
  const target = storage ?? defaultStorage();
  if (!target) {
    return null;
  }
  try {
    const raw = target.getItem(ASSISTED_ORDER_DRAFT_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const record = parsed as Record<string, unknown>;
    if (
      typeof record.idempotencyKey !== "string" ||
      record.idempotencyKey.length === 0 ||
      !Array.isArray(record.selections)
    ) {
      return null;
    }
    const selections: AssistedOrderSelection[] = [];
    const seen = new Set<string>();
    for (const entry of record.selections) {
      const selection = parseSelection(entry);
      if (!selection) {
        return null;
      }
      const key = catalogItemKey(selection.item);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      selections.push(selection);
    }
    const step = wizardSteps.includes(record.step as AssistedOrderWizardStep)
      ? (record.step as AssistedOrderWizardStep)
      : "products";
    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      step,
      selections: Object.freeze(selections),
      generalNotes:
        typeof record.generalNotes === "string" ? record.generalNotes : "",
      savedAt: typeof record.savedAt === "string" ? record.savedAt : "",
    });
  } catch {
    return null;
  }
}

export function storeAssistedOrderDraft(
  draft: Readonly<{
    idempotencyKey: string;
    step: AssistedOrderWizardStep;
    selections: AssistedOrderSelectionMap;
    generalNotes: string;
  }>,
  storage?: Storage | null,
): void {
  const target = storage ?? defaultStorage();
  if (!target) {
    return;
  }
  try {
    target.setItem(
      ASSISTED_ORDER_DRAFT_KEY,
      JSON.stringify({
        idempotencyKey: draft.idempotencyKey,
        step: draft.step,
        selections: Array.from(draft.selections.values()),
        generalNotes: draft.generalNotes,
        savedAt: new Date().toISOString(),
      }),
    );
  } catch {
    // Storage can be full or unavailable; the wizard still works in memory.
  }
}

/** Called after a successful submission so the next request starts clean. */
export function clearAssistedOrderDraft(
  storage?: Storage | null,
): void {
  const target = storage ?? defaultStorage();
  if (!target) {
    return;
  }
  try {
    target.removeItem(ASSISTED_ORDER_DRAFT_KEY);
  } catch {
    // Nothing to do: an unclearable draft is re-validated on every read.
  }
}

/** Rebuilds the wizard's selection map from a persisted draft. */
export function draftSelectionMap(
  draft: AssistedOrderDraft,
): AssistedOrderSelectionMap {
  const map = new Map<string, AssistedOrderSelection>();
  for (const selection of draft.selections) {
    map.set(catalogItemKey(selection.item), selection);
  }
  return map;
}
