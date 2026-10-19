import { ASSISTED_ORDER_MAX_LINES, normalizeRequiredText } from "../../../../shared/research/assisted-order/contract";
import { EARLY_ACCESS_POLICY_MAX_QUANTITY } from "../../../../shared/research/early-access-quantity";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";

export const REQUEST_SELECTION_KEY = `${ASSISTED_ORDER_STORAGE_PREFIX}intent-selections.v1`;
export const REQUEST_SELECTION_MAX_CHARS = 100_000;
export type RequestSelectionContext = Readonly<{ kind: "early_access_session"; selectionScope: string }>;
export type RequestSelectionLine = Readonly<{ productId: string; variantId: string; quantity: number }>;
type SelectionStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;
type Refusal = "blocked_attempt" | "unavailable";
export type RequestSelectionCandidate =
  | Readonly<{ kind: "candidate"; lines: readonly RequestSelectionLine[] }>
  | Readonly<{ kind: "none" | "invalid" | "scope_mismatch" | Refusal }>;

function closedRecord(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const own = Reflect.ownKeys(value);
  return own.length === keys.length && own.every((key) => typeof key === "string" && keys.includes(key)
    && "value" in Object.getOwnPropertyDescriptor(value, key)!);
}
function scopeOf(value: unknown): string | null {
  return closedRecord(value, ["kind", "selectionScope"]) && value.kind === "early_access_session"
    && typeof value.selectionScope === "string" && /^[0-9a-f]{64}$/.test(value.selectionScope)
    ? value.selectionScope : null;
}
function identity(value: unknown): value is string {
  return typeof value === "string" && !value.includes("\u0000")
    && normalizeRequiredText("selection.identity", value, 160) === value;
}
function selectionLines(value: unknown): readonly RequestSelectionLine[] | null {
  if (!Array.isArray(value) || value.length > ASSISTED_ORDER_MAX_LINES) return null;
  const seen = new Set<string>();
  const result: RequestSelectionLine[] = [];
  for (const line of value) {
    if (!closedRecord(line, ["productId", "variantId", "quantity"])
      || !identity(line.productId) || !identity(line.variantId)
      || typeof line.quantity !== "number" || !Number.isSafeInteger(line.quantity)
      || line.quantity < 1 || line.quantity > EARLY_ACCESS_POLICY_MAX_QUANTITY) return null;
    const key = JSON.stringify([line.productId, line.variantId]);
    if (seen.has(key)) return null;
    seen.add(key);
    result.push(Object.freeze({ productId: line.productId, variantId: line.variantId, quantity: line.quantity }));
  }
  return Object.freeze(result);
}

// The caller supplies a freshly server-verified scope and mount/context guard.
// This library cannot establish liveness or authorize reading/submitting orders.
// No async gap; repeated checks are not an atomic cross-tab storage transaction.
function admission(storage: SelectionStorage, context: unknown, scope: string, stillCurrent: () => boolean): Refusal | null {
  if (scopeOf(context) !== scope || stillCurrent() !== true || scopeOf(context) !== scope) return "unavailable";
  // Always the FIRST storage key inspected; even an empty/corrupt marker wins.
  if (storage.getItem(REQUEST_INTENT_ATTEMPT_KEY) !== null) return "blocked_attempt";
  if (stillCurrent() !== true || scopeOf(context) !== scope) return "unavailable";
  // Catch a marker created while the caller rechecked its current context.
  return storage.getItem(REQUEST_INTENT_ATTEMPT_KEY) !== null ? "blocked_attempt" : null;
}
function discard(
  storage: SelectionStorage, context: unknown, scope: string, stillCurrent: () => boolean,
  original: string, reason: "invalid" | "scope_mismatch",
): RequestSelectionCandidate {
  // Do not erase a replacement written since this read, or any attempt marker.
  if (storage.getItem(REQUEST_SELECTION_KEY) !== original) return { kind: "unavailable" };
  const refused = admission(storage, context, scope, stillCurrent);
  if (refused) return { kind: refused };
  storage.removeItem(REQUEST_SELECTION_KEY);
  return storage.getItem(REQUEST_SELECTION_KEY) === null ? { kind: reason } : { kind: "unavailable" };
}

/** Untrusted IDs/quantities only. Before hydration, pass a candidate through
 * validateRetainedRequestSelections with the CURRENT COMPLETE canonical catalog.
 * No cached price/eligibility facts and no reuse/migration of the XRR draft.
 */
export function readRequestSelectionCandidate(
  storage: SelectionStorage, currentContext: unknown, stillCurrent: () => boolean,
): RequestSelectionCandidate {
  try {
    const scope = scopeOf(currentContext);
    if (!scope) return { kind: "unavailable" };
    const refused = admission(storage, currentContext, scope, stillCurrent);
    if (refused) return { kind: refused };
    const raw = storage.getItem(REQUEST_SELECTION_KEY);
    const afterRead = admission(storage, currentContext, scope, stillCurrent);
    if (afterRead) return { kind: afterRead };
    if (raw === null) return { kind: "none" };
    let value: unknown;
    try { value = raw.length <= REQUEST_SELECTION_MAX_CHARS ? JSON.parse(raw) : null; } catch { value = null; }
    if (!closedRecord(value, ["version", "context", "lines"]) || value.version !== 1 || !scopeOf(value.context)) {
      return discard(storage, currentContext, scope, stillCurrent, raw, "invalid");
    }
    if (scopeOf(value.context) !== scope) return discard(storage, currentContext, scope, stillCurrent, raw, "scope_mismatch");
    const lines = selectionLines(value.lines);
    if (!lines) return discard(storage, currentContext, scope, stillCurrent, raw, "invalid");
    const final = admission(storage, currentContext, scope, stillCurrent);
    return final ? { kind: final } : { kind: "candidate", lines };
  } catch { return { kind: "unavailable" }; }
}

export function writeRequestSelectionCandidate(
  storage: SelectionStorage, currentContext: unknown, rawLines: unknown, stillCurrent: () => boolean,
): boolean {
  try {
    const scope = scopeOf(currentContext);
    if (!scope || admission(storage, currentContext, scope, stillCurrent)) return false;
    const lines = selectionLines(rawLines);
    if (!lines) return false;
    const raw = JSON.stringify({ version: 1, context: { kind: "early_access_session", selectionScope: scope }, lines });
    if (raw.length > REQUEST_SELECTION_MAX_CHARS || admission(storage, currentContext, scope, stillCurrent)) return false;
    storage.setItem(REQUEST_SELECTION_KEY, raw);
    const saved = storage.getItem(REQUEST_SELECTION_KEY);
    return saved === raw && admission(storage, currentContext, scope, stillCurrent) === null;
  } catch { return false; }
}

export function clearRequestSelectionCandidate(
  storage: SelectionStorage, currentContext: unknown, stillCurrent: () => boolean,
): boolean {
  try {
    const scope = scopeOf(currentContext);
    if (!scope || admission(storage, currentContext, scope, stillCurrent)) return false;
    storage.removeItem(REQUEST_SELECTION_KEY);
    return storage.getItem(REQUEST_SELECTION_KEY) === null
      && admission(storage, currentContext, scope, stillCurrent) === null;
  } catch { return false; }
}
