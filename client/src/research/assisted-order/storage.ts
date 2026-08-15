import type { AssistedOrderReceipt } from "../../../../shared/research/assisted-order/contract";

// Browser storage for the assisted-order overlay, in one place so every reader
// and writer agrees on the keys and so sign-out can sweep the whole family.
//
// The status token is a credential. It is stored ONLY under its own `.token`
// key and is stripped from the stored receipt JSON, so no second copy of the
// credential survives inside a document a later reader might forward or log.

export const ASSISTED_ORDER_STORAGE_PREFIX = "xenios.assisted-order.";

export function assistedOrderTokenKey(publicReference: string): string {
  return `${ASSISTED_ORDER_STORAGE_PREFIX}${publicReference}.token`;
}

export function assistedOrderReceiptKey(publicReference: string): string {
  return `${ASSISTED_ORDER_STORAGE_PREFIX}${publicReference}.receipt`;
}

/** The receipt as persisted: everything except the credential. */
export type StoredAssistedOrderReceipt = Omit<AssistedOrderReceipt, "statusToken">;

export function receiptForStorage(
  receipt: AssistedOrderReceipt,
): StoredAssistedOrderReceipt {
  const { statusToken: _statusToken, ...rest } = receipt;
  return rest;
}

function defaultStorage(): Storage {
  return window.sessionStorage;
}

/**
 * Persists a submission receipt for the confirmation and status pages. The
 * token goes under the `.token` key only; the receipt JSON never contains it.
 */
export function storeAssistedOrderReceipt(
  receipt: AssistedOrderReceipt,
  storage: Storage = defaultStorage(),
): void {
  storage.setItem(assistedOrderTokenKey(receipt.publicReference), receipt.statusToken);
  storage.setItem(
    assistedOrderReceiptKey(receipt.publicReference),
    JSON.stringify(receiptForStorage(receipt)),
  );
}

export function readAssistedOrderToken(
  publicReference: string,
  storage: Storage = defaultStorage(),
): string | null {
  return storage.getItem(assistedOrderTokenKey(publicReference));
}

export function readStoredAssistedOrderReceipt(
  publicReference: string,
  storage: Storage = defaultStorage(),
): StoredAssistedOrderReceipt | null {
  try {
    const raw = storage.getItem(assistedOrderReceiptKey(publicReference));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as StoredAssistedOrderReceipt)
      : null;
  } catch {
    return null;
  }
}

/**
 * Recomposes a full receipt from the two stored halves, for any reader that
 * genuinely needs the credential back. Returns null when the token half is
 * gone (for example after sign-out swept it).
 */
export function recomposeAssistedOrderReceipt(
  publicReference: string,
  storage: Storage = defaultStorage(),
): AssistedOrderReceipt | null {
  const stored = readStoredAssistedOrderReceipt(publicReference, storage);
  const token = readAssistedOrderToken(publicReference, storage);
  if (!stored || token === null) {
    return null;
  }
  return { ...stored, statusToken: token };
}

/**
 * Removes every assisted-order key (tokens and receipts alike). Called from
 * the Early Access sign-out so nothing of the previous customer's request,
 * least of all the status credential, survives for whoever unlocks next.
 */
export function clearAssistedOrderStorage(
  storage: Storage = defaultStorage(),
): void {
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key !== null && key.startsWith(ASSISTED_ORDER_STORAGE_PREFIX)) {
      storage.removeItem(key);
    }
  }
}
