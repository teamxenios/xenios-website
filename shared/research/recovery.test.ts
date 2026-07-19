import { describe, expect, it } from "vitest";
import {
  RECOVERY_MARKER_KEY,
  captureRecoveryMarker,
  clearRecoveryMarker,
  isRecoveryErrorHash,
  isRecoveryHash,
  markRecoveryFromAuthEvent,
  type MarkerStorage,
} from "./recovery";

// The recovery state machine that keeps a valid Supabase recovery link usable
// even though client initialization consumes the URL hash before the
// reset-password route mounts (founder decision, 2026-07-19).

function fakeStorage(initial: Record<string, string> = {}): MarkerStorage & { store: Record<string, string> } {
  const store = { ...initial };
  return {
    store,
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => {
      store[k] = v;
    },
    removeItem: (k) => {
      delete store[k];
    },
  };
}

describe("recovery hash detection", () => {
  it("recognizes a valid Supabase recovery hash", () => {
    expect(isRecoveryHash("#access_token=abc&refresh_token=def&type=recovery")).toBe(true);
    expect(isRecoveryHash("#type=recovery")).toBe(true);
  });

  it("rejects malformed and unrelated hashes", () => {
    expect(isRecoveryHash("")).toBe(false);
    expect(isRecoveryHash(null)).toBe(false);
    expect(isRecoveryHash("#type=signup")).toBe(false);
    expect(isRecoveryHash("#sometype=recovery")).toBe(false);
    expect(isRecoveryHash("#foo=bar&type=recoveryX")).toBe(false);
  });

  it("recognizes an expired/invalid recovery-link error hash", () => {
    expect(isRecoveryErrorHash("#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired")).toBe(true);
    expect(isRecoveryErrorHash("#error_description=Recovery+link+expired")).toBe(true);
    expect(isRecoveryErrorHash("#type=recovery")).toBe(false);
    expect(isRecoveryErrorHash("")).toBe(false);
  });
});

describe("marker capture and preservation", () => {
  it("captures a fresh recovery hash and persists the marker", () => {
    const storage = fakeStorage();
    expect(captureRecoveryMarker("#access_token=abc&type=recovery", storage)).toBe(true);
    expect(storage.store[RECOVERY_MARKER_KEY]).toBe("1");
  });

  it("recovery hash already cleared but the preserved marker still opens recovery mode", () => {
    const storage = fakeStorage({ [RECOVERY_MARKER_KEY]: "1" });
    // Second render / later mount: hash is gone (consumed by the client lib).
    expect(captureRecoveryMarker("", storage)).toBe(true);
    expect(captureRecoveryMarker(null, storage)).toBe(true);
  });

  it("no hash and no marker means no recovery mode", () => {
    expect(captureRecoveryMarker("", fakeStorage())).toBe(false);
  });

  it("the PASSWORD_RECOVERY auth event sets the marker even with no hash (event before route mount)", () => {
    const storage = fakeStorage();
    expect(markRecoveryFromAuthEvent("PASSWORD_RECOVERY", storage)).toBe(true);
    expect(storage.store[RECOVERY_MARKER_KEY]).toBe("1");
    // The marker now survives until the reset page consumes it.
    expect(captureRecoveryMarker("", storage)).toBe(true);
  });

  it("other auth events never set the marker", () => {
    const storage = fakeStorage();
    for (const event of ["SIGNED_IN", "SIGNED_OUT", "TOKEN_REFRESHED", "USER_UPDATED"]) {
      expect(markRecoveryFromAuthEvent(event, storage)).toBe(false);
    }
    expect(storage.store[RECOVERY_MARKER_KEY]).toBeUndefined();
  });

  it("clearing the marker ends recovery mode", () => {
    const storage = fakeStorage({ [RECOVERY_MARKER_KEY]: "1" });
    clearRecoveryMarker(storage);
    expect(captureRecoveryMarker("", storage)).toBe(false);
  });

  it("storage failures fall back to hash-only detection", () => {
    const broken: MarkerStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(captureRecoveryMarker("#type=recovery", broken)).toBe(true);
    expect(captureRecoveryMarker("", broken)).toBe(false);
    expect(markRecoveryFromAuthEvent("PASSWORD_RECOVERY", broken)).toBe(true);
    expect(() => clearRecoveryMarker(broken)).not.toThrow();
  });
});
