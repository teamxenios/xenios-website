// Password-recovery mode detection and preservation (ACCOUNT-EMAIL-SYSTEMS,
// founder decision 2026-07-19). The failure this prevents: the Supabase
// browser client initializes at provider level and CONSUMES the recovery hash
// (detectSessionInUrl) before the /research/reset-password route mounts, so a
// component that only inspects window.location.hash after initialization sees
// nothing and shows the request form to a member holding a valid link.
//
// The contract: capture the marker SYNCHRONOUSLY from the URL hash before any
// Supabase initialization, persist it in sessionStorage (surviving the hash
// being cleared and re-renders), let the PASSWORD_RECOVERY auth event also
// set it (whichever fires first), and clear it only when the recovery flow
// completes or fails terminally. Pure and storage-injected so the state
// machine is testable without a browser.

export type MarkerStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

export const RECOVERY_MARKER_KEY = "xenios-research-recovery-pending";

// Supabase recovery links land with #access_token=...&type=recovery (or an
// error description for expired/invalid links, which still means the visitor
// arrived from a recovery email and should see recovery-flow messaging).
export function isRecoveryHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  return /(^|[#&])type=recovery(&|$)/.test(hash);
}

export function isRecoveryErrorHash(hash: string | null | undefined): boolean {
  if (!hash) return false;
  return /(^|[#&])error(_code|_description)?=/.test(hash) && /otp|recovery|expired|invalid/i.test(hash);
}

// Called synchronously at provider setup, BEFORE the Supabase client exists.
// Returns true when the visitor is in recovery mode (fresh hash or a marker
// preserved from an earlier capture in this tab).
export function captureRecoveryMarker(hash: string | null | undefined, storage: MarkerStorage): boolean {
  try {
    if (isRecoveryHash(hash)) {
      storage.setItem(RECOVERY_MARKER_KEY, "1");
      return true;
    }
    return storage.getItem(RECOVERY_MARKER_KEY) === "1";
  } catch {
    // Storage unavailable (private mode edge cases): fall back to hash-only.
    return isRecoveryHash(hash);
  }
}

// The PASSWORD_RECOVERY auth event is the second capture path: it fires even
// when the hash was already consumed by the client library.
export function markRecoveryFromAuthEvent(event: string, storage: MarkerStorage): boolean {
  if (event !== "PASSWORD_RECOVERY") return false;
  try {
    storage.setItem(RECOVERY_MARKER_KEY, "1");
  } catch {
    /* state alone still carries it for this render */
  }
  return true;
}

export function clearRecoveryMarker(storage: MarkerStorage): void {
  try {
    storage.removeItem(RECOVERY_MARKER_KEY);
  } catch {
    /* nothing to clear */
  }
}
