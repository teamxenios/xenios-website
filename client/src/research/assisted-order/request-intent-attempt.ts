import type { RequestIntentReceipt } from "../../../../shared/research/assisted-order/request-intent";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";
import { isKnownIntentPrewriteRefusal } from "./request-intent-api";

// Reuse the existing sign-out/privacy-sweep prefix. Unlike the Research draft,
// this marker stores NO product IDs/names, quantities, contact or medical data.
export const REQUEST_INTENT_ATTEMPT_KEY = ASSISTED_ORDER_STORAGE_PREFIX + "intent-attempt.v1";
export type IntentAttempt = Readonly<{
  key: string;
  acceptedAt: string;
  state: "in_flight" | "uncertain";
}>;
export function readIntentAttempt(storage: Pick<Storage, "getItem">): IntentAttempt | null {
  try {
    const raw = storage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    if (typeof value !== "object" || value === null
      || Object.keys(value).some((key) => !["key", "acceptedAt", "state"].includes(key))
      || typeof value.key !== "string" || !/^[0-9a-f-]{36}$/i.test(value.key)
      || typeof value.acceptedAt !== "string" || !Number.isFinite(Date.parse(value.acceptedAt))
      || !["in_flight", "uncertain"].includes(value.state)) return null;
    return { key: value.key, acceptedAt: value.acceptedAt, state: "uncertain" };
  } catch { return null; }
}

/** Called synchronously before the POST. Failure MUST stop submission. */
export function markIntentInFlight(storage: Pick<Storage, "getItem" | "setItem">, attempt: IntentAttempt): void {
  const priorRaw = storage.getItem(REQUEST_INTENT_ATTEMPT_KEY);
  const prior = readIntentAttempt(storage);
  if (priorRaw !== null && (!prior || prior.key !== attempt.key || prior.acceptedAt !== attempt.acceptedAt)) {
    throw new Error("An earlier attempt needs recovery before another submission.");
  }
  const marker: IntentAttempt = { key: attempt.key, acceptedAt: attempt.acceptedAt, state: "in_flight" };
  storage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify(marker));
  const saved = readIntentAttempt(storage);
  if (!saved || saved.key !== attempt.key || saved.acceptedAt !== attempt.acceptedAt) {
    throw new Error("The attempt could not be preserved. No request was sent.");
  }
}

/** Clear only after an actual committed receipt, and only if this mount still owns the marker. */
export function clearConfirmedIntentAttempt(
  storage: Pick<Storage, "getItem" | "removeItem">, attempt: IntentAttempt,
): boolean {
  const current = readIntentAttempt(storage);
  if (!current || current.key !== attempt.key || current.acceptedAt !== attempt.acceptedAt) return false;
  storage.removeItem(REQUEST_INTENT_ATTEMPT_KEY);
  return true;
}
/** A first actual POST's well-formed prewrite refusal is not prior uncertainty.
 * The caller must count actual POST starts, not clicks or marker writes.
 * A remount, retry, stale mount, mismatched/corrupt marker or storage failure
 * cannot earn clearance. No fresh key is created by this helper.
 */
export function clearFirstRefusedIntentAttempt(
  storage: Pick<Storage, "getItem" | "removeItem">, attempt: IntentAttempt,
  evidence: Readonly<{ firstPost: boolean; stillCurrent: boolean; error: unknown }>,
): boolean {
  if (!evidence.firstPost || !evidence.stillCurrent || !isKnownIntentPrewriteRefusal(evidence.error)) return false;
  try {
    const current = readIntentAttempt(storage);
    if (!current || current.key !== attempt.key || current.acceptedAt !== attempt.acceptedAt) return false;
    storage.removeItem(REQUEST_INTENT_ATTEMPT_KEY);
    return storage.getItem(REQUEST_INTENT_ATTEMPT_KEY) === null;
  } catch { return false; }
}
// No failure/refusal path clears a prior uncertainty or automatically generates a replacement key.
// Reauthentication/closed tabs intentionally do not preserve this marker: staff duplicate-check guidance
// remains necessary. A null recovery response means "not confirmed", not "definitely never saved".


/** Volatile payload stays in the caller. This wrapper enforces marker-before-POST ordering. */
export async function postIntentAttempt(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">,
  attempt: IntentAttempt,
  post: () => Promise<unknown>,
  stillCurrent: () => boolean = () => true,
): Promise<RequestIntentReceipt> {
  markIntentInFlight(storage, attempt);
  const response = await post();
  if (typeof response !== "object" || response === null) throw new Error("Request outcome is unconfirmed.");
  const receipt = response as Partial<RequestIntentReceipt>;
  if (receipt.kind !== "unapproved_selection_request" || receipt.status !== "pending_review"
    || typeof receipt.requestId !== "string" || !/^[0-9a-f-]{36}$/i.test(receipt.requestId)
    || receipt.publicReference !== "XRI-" + receipt.requestId.replace(/-/g, "").toUpperCase()
    || typeof receipt.createdAt !== "string" || !Number.isFinite(Date.parse(receipt.createdAt))) {
    throw new Error("Request outcome is unconfirmed.");
  }
  if (!stillCurrent() || !clearConfirmedIntentAttempt(storage, attempt)) {
    throw new Error("The session changed. Contact support before submitting a replacement.");
  }
  return { kind: receipt.kind, requestId: receipt.requestId, publicReference: receipt.publicReference,
    status: receipt.status, createdAt: receipt.createdAt };
}
