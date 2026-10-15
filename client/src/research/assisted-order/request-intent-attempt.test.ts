import { describe, expect, it } from "vitest";
import {
  REQUEST_INTENT_ATTEMPT_KEY, clearConfirmedIntentAttempt, clearFirstRefusedIntentAttempt, markIntentInFlight, readIntentAttempt, postIntentAttempt,
} from "./request-intent-attempt";

import { RequestIntentHttpError } from "./request-intent-api";

function storage() {
  const values = new Map<string, string>();
  return { values, getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); } };
}
const attempt = { key: "10000000-0000-4000-8000-000000000001", acceptedAt: "2026-10-14T12:00:00.000Z", state: "in_flight" as const };
describe("private intent interrupted-attempt marker", () => {
  it("invokes the actual POST callback only after the marker, retains a lost response and replays the same attempt", async () => {
    const target = storage();
    let posts = 0;
    await expect(postIntentAttempt(target, attempt, async () => {
      posts += 1;
      expect(JSON.parse(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)!)).toEqual(attempt);
      throw new Error("synthetic response loss");
    })).rejects.toThrow("synthetic response loss");
    const restored = readIntentAttempt(target)!;
    expect(restored).toEqual({ ...attempt, state: "uncertain" });
    const committed = { kind: "unapproved_selection_request", status: "pending_review",
      requestId: "30000000-0000-4000-8000-000000000001",
      publicReference: "XRI-30000000000040008000000000000001", createdAt: attempt.acceptedAt };
    expect(await postIntentAttempt(target, restored, async () => {
      posts += 1;
      expect(readIntentAttempt(target)?.key).toBe(attempt.key);
      return committed;
    })).toEqual(committed);
    expect(posts).toBe(2);
    expect(readIntentAttempt(target)).toBeNull();
  });
  it("does not confirm success for HTML/malformed body or a stale mount", async () => {
    const target = storage();
    await expect(postIntentAttempt(target, attempt, async () => "<html>")).rejects.toThrow("unconfirmed");
    expect(readIntentAttempt(target)?.state).toBe("uncertain");
  });
  it("writes before POST, restores interrupted navigation as uncertain with unchanged identity", () => {
    const target = storage();
    markIntentInFlight(target, attempt);
    // This inspection belongs inside the caller's POST stub, not after the promise settles.
    expect(JSON.parse(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)!)).toEqual(attempt);
    expect(readIntentAttempt(target)).toEqual({ ...attempt, state: "uncertain" });
    markIntentInFlight(target, readIntentAttempt(target)!);
    expect(readIntentAttempt(target)?.key).toBe(attempt.key);
    expect(readIntentAttempt(target)?.acceptedAt).toBe(attempt.acceptedAt);
  });
  it("stores only the opaque attempt facts, not selections, contact or clinical information", () => {
    const target = storage();
    markIntentInFlight(target, { ...attempt, productId: "must-not-persist", email: "must-not-persist" } as typeof attempt);
    expect(Object.keys(JSON.parse(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)!)).sort()).toEqual(["acceptedAt", "key", "state"]);
  });
  it("refuses a replacement or corrupt marker rather than losing an uncertain attempt", () => {
    const target = storage();
    markIntentInFlight(target, attempt);
    expect(() => markIntentInFlight(target, { ...attempt, key: "10000000-0000-4000-8000-000000000002" })).toThrow();
    target.setItem(REQUEST_INTENT_ATTEMPT_KEY, "{}");
    expect(() => markIntentInFlight(target, attempt)).toThrow();
  });
  it("storage failure prevents the caller from starting POST", () => {
    const target = { getItem: () => null, setItem: () => { throw new Error("unavailable"); } };
    expect(() => markIntentInFlight(target, attempt)).toThrow("unavailable");
  });
  it("a stale mount cannot erase a newer attempt and a privacy sweep is not restored", () => {
    const target = storage();
    markIntentInFlight(target, attempt);
    expect(clearConfirmedIntentAttempt(target, { ...attempt, acceptedAt: "2026-10-14T12:01:00.000Z" })).toBe(false);
    target.removeItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(clearConfirmedIntentAttempt(target, attempt)).toBe(false);
    expect(readIntentAttempt(target)).toBeNull();
  });
});

describe("Doc163 first-refusal marker clearance", () => {
  it("clears only the owned marker after a first known prewrite refusal", () => {
    for (const status of [400, 401, 403, 429]) {
      const target = storage(); markIntentInFlight(target, attempt);
      expect(clearFirstRefusedIntentAttempt(target, attempt, {
        firstPost: true, stillCurrent: true, error: new RequestIntentHttpError(status, "synthetic_refusal"),
      })).toBe(true);
      expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    }
  });
  it("never clears an earlier uncertainty for any retry refusal, conflict, 5xx or unstructured error", () => {
    for (const status of [400, 401, 403, 429, 409, 500, 503]) {
      const target = storage(); markIntentInFlight(target, attempt);
      expect(clearFirstRefusedIntentAttempt(target, attempt, {
        firstPost: false, stillCurrent: true, error: new RequestIntentHttpError(status, "synthetic_refusal"),
      })).toBe(false);
      expect(readIntentAttempt(target)?.key).toBe(attempt.key);
    }
    for (const error of [new RequestIntentHttpError(409, "attempt_conflict"),
      new RequestIntentHttpError(503, "request_outcome_unconfirmed"), new Error("lost reply")]) {
      const target = storage(); markIntentInFlight(target, attempt);
      expect(clearFirstRefusedIntentAttempt(target, attempt, { firstPost: true, stillCurrent: true, error })).toBe(false);
      expect(readIntentAttempt(target)?.key).toBe(attempt.key);
    }
  });
  it("does not clear after a stale mount, privacy sweep, ownership change or failed storage removal", () => {
    const error = new RequestIntentHttpError(400, "invalid_request");
    const target = storage(); markIntentInFlight(target, attempt);
    expect(clearFirstRefusedIntentAttempt(target, attempt, { firstPost: true, stillCurrent: false, error })).toBe(false);
    expect(clearFirstRefusedIntentAttempt(target, { ...attempt, acceptedAt: "2026-10-14T12:01:00.000Z" },
      { firstPost: true, stillCurrent: true, error })).toBe(false);
    expect(clearFirstRefusedIntentAttempt({ ...target, removeItem: () => { throw new Error("storage unavailable"); } }, attempt,
      { firstPost: true, stillCurrent: true, error })).toBe(false);
    expect(readIntentAttempt(target)?.key).toBe(attempt.key);
    target.removeItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(clearFirstRefusedIntentAttempt(target, attempt, { firstPost: true, stillCurrent: true, error })).toBe(false);
  });
});
