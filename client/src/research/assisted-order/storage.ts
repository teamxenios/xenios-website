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

const PUBLIC_REFERENCE = /^XRR-\d{8}-[0-9A-F]{10}$/u;

function isStoredAssistedOrderReceipt(
  value: unknown,
  expectedPublicReference: string,
): value is StoredAssistedOrderReceipt {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const receipt = value as Record<string, unknown>;
  return (
    receipt.publicReference === expectedPublicReference &&
    PUBLIC_REFERENCE.test(expectedPublicReference) &&
    typeof receipt.requestId === "string" &&
    receipt.requestId.trim().length > 0 &&
    receipt.status === "submitted" &&
    typeof receipt.createdAt === "string" &&
    receipt.createdAt.trim().length > 0 &&
    (receipt.estimatedTotalCents === null ||
      (Number.isSafeInteger(receipt.estimatedTotalCents) &&
        Number(receipt.estimatedTotalCents) >= 0)) &&
    receipt.currency === "USD" &&
    Array.isArray(receipt.lines) &&
    receipt.lines.every((line) => typeof line === "object" && line !== null) &&
    Array.isArray(receipt.nextSteps) &&
    receipt.nextSteps.every((step) => typeof step === "string") &&
    !("statusToken" in receipt)
  );
}

export function receiptForStorage(
  receipt: AssistedOrderReceipt,
): StoredAssistedOrderReceipt {
  const { statusToken: _statusToken, ...rest } = receipt;
  return rest;
}

function defaultStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Persists a submission receipt for the confirmation and status pages. The
 * token goes under the `.token` key only; the receipt JSON never contains it.
 */
export function storeAssistedOrderReceipt(
  receipt: AssistedOrderReceipt,
  storage?: Storage | null,
): boolean {
  const target = storage ?? defaultStorage();
  if (!target) {
    return false;
  }
  const tokenKey = assistedOrderTokenKey(receipt.publicReference);
  const receiptKey = assistedOrderReceiptKey(receipt.publicReference);
  try {
    // Write the non-secret half first and the credential last. If either write
    // fails, remove both halves so a quota/privacy fault cannot leave a bearer
    // token stranded without the receipt it belongs to.
    target.setItem(receiptKey, JSON.stringify(receiptForStorage(receipt)));
    target.setItem(tokenKey, receipt.statusToken);
    return true;
  } catch {
    for (const key of [tokenKey, receiptKey]) {
      try {
        target.removeItem(key);
      } catch {
        // Best effort per half. The accepted server request remains durable;
        // the confirmation path still carries its non-secret reference.
      }
    }
    return false;
  }
}

export function readAssistedOrderToken(
  publicReference: string,
  storage?: Storage | null,
): string | null {
  const target = storage ?? defaultStorage();
  if (!target) {
    return null;
  }
  try {
    return target.getItem(assistedOrderTokenKey(publicReference));
  } catch {
    // Some privacy modes expose Storage but reject reads. A denied read is the
    // same as a missing credential; it must not crash the neutral status page.
    return null;
  }
}

export function readStoredAssistedOrderReceipt(
  publicReference: string,
  storage?: Storage | null,
): StoredAssistedOrderReceipt | null {
  const target = storage ?? defaultStorage();
  if (!target) {
    return null;
  }
  try {
    const raw = target.getItem(assistedOrderReceiptKey(publicReference));
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isStoredAssistedOrderReceipt(parsed, publicReference) ? parsed : null;
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
  storage?: Storage | null,
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
  storage?: Storage | null,
): void {
  const target = storage ?? defaultStorage();
  if (!target) {
    return;
  }
  // Snapshot the key family first. Removing while walking the live Storage
  // index can skip entries, and one browser/privacy failure must not prevent a
  // later bearer-token key from being attempted.
  const keys: string[] = [];
  let length = 0;
  try {
    length = target.length;
  } catch {
    return;
  }
  for (let index = 0; index < length; index += 1) {
    try {
      const key = target.key(index);
      if (key !== null && key.startsWith(ASSISTED_ORDER_STORAGE_PREFIX)) {
        keys.push(key);
      }
    } catch {
      // Keep inspecting the remaining slots when one lookup is unavailable.
    }
  }
  for (const key of keys) {
    try {
      target.removeItem(key);
    } catch {
      // Best effort is per key: a failed draft/receipt deletion must not stop
      // the subsequent status-token deletions.
    }
  }
}
