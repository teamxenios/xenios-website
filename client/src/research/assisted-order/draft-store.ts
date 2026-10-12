import type { AssistedOrderCatalogItem } from "../../../../shared/research/assisted-order/contract";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";
import type { AssistedOrderSelection, AssistedOrderSelectionMap } from "./wizard-state";
import { catalogItemKey } from "./wizard-state";

// The wizard's in-progress draft, persisted so a refresh or a retry within ONE
// unexpired Early Access session, in the same tab, does not cost the customer
// their basket or their attempt identity.
//
// WHAT IT DOES NOT SURVIVE, BY DESIGN: session expiry, sign-out and re-unlock
// (the protected-path sweep removes every assisted-order key, this one
// included) and closing the tab (sessionStorage dies with it). After any of
// those a rebuilt request submits under a new key and the server cannot
// signal a conflict with an earlier attempt. The release runbook and the staff
// duplicate check cover that window; the sweep itself belongs to the Early
// Access route owner and is not changed here.
//
// WHAT IS STORED: the selected catalog rows (the server's own projection,
// display-only), quantities, per-line and general notes, the current step, and
// the attempt's idempotency key so a resumed submission replays as the SAME
// request instead of creating a second one.
//
// Beside the key sit the attempt's frozen acceptedAt (the server fingerprints
// it, so a retry must resend the same value to replay) and the attempt state,
// which turns "uncertain" the moment a submission ends without a definitive
// answer and never turns back: from then on the key and timestamp are kept
// through every retry and refresh, so the earlier request can be replayed or
// conflict, but never be duplicated.
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

// "none": no submission has been attempted under this key, or every attempt
// was refused before anything could be persisted. "uncertain": at least one
// attempt ended without a definitive answer (network failure, 5xx, non-JSON
// body), so the request may already exist server-side.
export type AssistedOrderAttemptState = "none" | "uncertain";

// What the STORE accepts is one state wider. "in_flight" is written just
// before a POST and means: this attempt has left the browser and its outcome
// is not yet known. If the page is lost while it is set (refresh, navigation),
// nothing can say whether the request committed, so a restored draft reads it
// as "uncertain". In the same uninterrupted page it is replaced by the real
// outcome: "uncertain" after a lost answer or a conflict, "none" after a
// definitive pre-persistence refusal (only when no earlier attempt under this
// key was uncertain).
export type AssistedOrderStoredAttemptState = AssistedOrderAttemptState | "in_flight";

const wizardSteps: readonly AssistedOrderWizardStep[] = [
  "products",
  "contact",
  "review",
];

export type AssistedOrderDraft = Readonly<{
  idempotencyKey: string;
  acceptedAt: string | null;
  attemptState: AssistedOrderAttemptState;
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

// The frozen acceptance timestamp travels as the bounded free text the server
// accepts for agreements.*.acceptedAt. Anything else reads as "not stamped".
const MAX_ACCEPTED_AT_LENGTH = 60;

function parseAcceptedAt(value: unknown): string | null {
  return typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ACCEPTED_AT_LENGTH
    ? value
    : null;
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
    // "uncertain" survives a read, and so does an interrupted "in_flight": a
    // page lost mid-POST cannot know whether the request committed, so the
    // restored attempt is treated as uncertain. Anything else (an older draft,
    // a typo, a foreign value) is the safe "none".
    const attemptState: AssistedOrderAttemptState =
      record.attemptState === "uncertain" || record.attemptState === "in_flight"
        ? "uncertain"
        : "none";
    return Object.freeze({
      idempotencyKey: record.idempotencyKey,
      acceptedAt: parseAcceptedAt(record.acceptedAt),
      attemptState,
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
    // Optional so a caller that has not attempted a submission yet stores the
    // "not stamped" / "none" defaults without naming them.
    acceptedAt?: string | null;
    attemptState?: AssistedOrderStoredAttemptState;
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
        acceptedAt: draft.acceptedAt ?? null,
        attemptState: draft.attemptState ?? "none",
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

/**
 * Called after a successful submission so the next request, and its attempt
 * identity (key, frozen acceptedAt, attempt state), starts clean.
 */
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
