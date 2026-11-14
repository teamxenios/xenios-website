import type { RequestIntentReceipt } from "../../../../shared/research/assisted-order/request-intent";
import { EARLY_ACCESS_TEAM_EMAIL, teamDraft } from "../../../../shared/research/early-access/quote-contact";
import { isResearchCartScope } from "../cart-session";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";

// A confirmed request's NON-SECRET display facts, kept for this browser tab so a
// reload shows the saved reference again instead of a blank form. Like the
// attempt marker it holds no product, quantity, contact or medical data, and the
// Early Access sign-out sweep (clearAssistedOrderStorage) removes it. It is not a
// credential: recovery and staff reads keep their own identity checks, and
// nothing here reads or claims a request status.
export const REQUEST_INTENT_RECEIPT_RECORD_KEY = ASSISTED_ORDER_STORAGE_PREFIX + "intent-receipt.v1";
export const REQUEST_INTENT_PUBLIC_REFERENCE = /^XRI-[0-9A-F]{32}$/;
export { EARLY_ACCESS_TEAM_EMAIL as RESEARCH_SUPPORT_EMAIL };

// One opaque id per page load. A record written during THIS load is never
// reopened by a later mount of the same load: an in-page remount (session
// re-check, owner key change, parent rerender) keeps the accepted behaviour of
// showing a fresh form, while a reload or a restored tab, which evaluates this
// module again, shows the saved reference. In that later load the record keeps
// its earlier id, so every mount reopens it until "Start another request", an
// owner or recovery boundary, or the Early Access sweep forgets it.
const PAGE_LOAD_ID = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2);

type ConfirmedReceiptRecord = Readonly<{ owner: string; publicReference: string; createdAt: string; pageLoad: string }>;

/** The receipt the server confirmed, rebuilt from its public reference alone. */
export function receiptFromPublicReference(publicReference: string, createdAt: string): RequestIntentReceipt | null {
  if (!REQUEST_INTENT_PUBLIC_REFERENCE.test(publicReference) || !Number.isFinite(Date.parse(createdAt))) return null;
  const hex = publicReference.slice(4).toLowerCase();
  const requestId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-");
  return { kind: "unapproved_selection_request", requestId, publicReference, status: "pending_review", createdAt };
}

function parseRecord(raw: string | null): ConfirmedReceiptRecord | null {
  if (raw === null) return null;
  const value: unknown = JSON.parse(raw);
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).some((key) => !["owner", "publicReference", "createdAt", "pageLoad"].includes(key))
    || typeof record.owner !== "string" || typeof record.publicReference !== "string" || typeof record.createdAt !== "string"
    || typeof record.pageLoad !== "string" || record.pageLoad.length === 0
    || !REQUEST_INTENT_PUBLIC_REFERENCE.test(record.publicReference) || !Number.isFinite(Date.parse(record.createdAt))) return null;
  return { owner: record.owner, publicReference: record.publicReference, createdAt: record.createdAt, pageLoad: record.pageLoad };
}

/**
 * The receipt confirmed in an EARLIER page load of this tab for THIS owner.
 * Another owner's record is discarded, never shown. A record from the current
 * page load is left in place but not reopened (see PAGE_LOAD_ID).
 */
export function readConfirmedReceiptRecord(
  storage: Pick<Storage, "getItem" | "removeItem">, owner: string,
): RequestIntentReceipt | null {
  try {
    const record = parseRecord(storage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY));
    if (!record) return null;
    if (record.owner !== owner) { storage.removeItem(REQUEST_INTENT_RECEIPT_RECORD_KEY); return null; }
    if (record.pageLoad === PAGE_LOAD_ID) return null;
    return receiptFromPublicReference(record.publicReference, record.createdAt);
  } catch { return null; }
}

/** Read the confirmation time for this verified scope and exact reference. */
export function referenceConfirmedInThisTab(
  storage: Pick<Storage, "getItem"> | null, publicReference: string, verifiedScope: string | null,
): string | null {
  if (!storage || !isResearchCartScope(verifiedScope)) return null;
  try {
    const record = parseRecord(storage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY));
    return record && record.owner === verifiedScope && record.publicReference === publicReference ? record.createdAt : null;
  } catch { return null; }
}

/** Best effort after an actual committed receipt. A storage fault never affects the confirmation itself. */
export function rememberConfirmedReceipt(
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">, owner: string, receipt: RequestIntentReceipt,
): boolean {
  if (!REQUEST_INTENT_PUBLIC_REFERENCE.test(receipt.publicReference) || !Number.isFinite(Date.parse(receipt.createdAt))) return false;
  try {
    const record: ConfirmedReceiptRecord = {
      owner, publicReference: receipt.publicReference, createdAt: receipt.createdAt, pageLoad: PAGE_LOAD_ID,
    };
    storage.setItem(REQUEST_INTENT_RECEIPT_RECORD_KEY, JSON.stringify(record));
    const saved = parseRecord(storage.getItem(REQUEST_INTENT_RECEIPT_RECORD_KEY));
    if (saved && saved.owner === owner && saved.publicReference === receipt.publicReference) return true;
  } catch { /* fall through to the cleanup below */ }
  forgetConfirmedReceipt(storage);
  return false;
}

export function forgetConfirmedReceipt(storage: Pick<Storage, "removeItem">): void {
  try { storage.removeItem(REQUEST_INTENT_RECEIPT_RECORD_KEY); } catch { /* nothing else to release */ }
}

/** The registered confirmation route for a review request; it carries the public reference only. */
export function requestIntentConfirmationHref(publicReference: string): string {
  return "/research/early-access/order-request/confirmation/" + encodeURIComponent(publicReference);
}

/** Support email prefilled with the reference, so staff can route it without a token or personal data. */
export function requestIntentSupportMailto(publicReference: string): string {
  const valid = publicReference.length === 36 && REQUEST_INTENT_PUBLIC_REFERENCE.test(publicReference);
  const subject = "Early Access request" + (valid ? " " + publicReference : "");
  const body = (valid ? "Reference: " + publicReference + "\n\n" : "")
    + "Please do not include medical information or payment details in email.";
  return teamDraft(subject, body);
}
