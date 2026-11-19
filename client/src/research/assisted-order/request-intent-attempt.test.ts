import { describe, expect, it } from "vitest";
import {
  REQUEST_INTENT_ATTEMPT_KEY, clearConfirmedIntentAttempt, clearFirstRefusedIntentAttempt, clearFirstPreparedRefusedIntentAttempt,
  markIntentInFlight, readIntentAttempt, postIntentAttempt,
} from "./request-intent-attempt";

import { createRequestIntentApi, RequestIntentHttpError, RequestIntentPreparationHttpError } from "./request-intent-api";

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
  it("clears after a first POST meets closed intake, never after a retry, a stale mount or for another attempt", () => {
    const error = new RequestIntentHttpError(503, "request_intent_unavailable");
    const first = storage(); markIntentInFlight(first, attempt);
    expect(clearFirstRefusedIntentAttempt(first, attempt, { firstPost: true, stillCurrent: true, error })).toBe(true);
    expect(first.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    for (const evidence of [{ firstPost: false, stillCurrent: true }, { firstPost: true, stillCurrent: false }]) {
      const target = storage(); markIntentInFlight(target, attempt);
      expect(clearFirstRefusedIntentAttempt(target, attempt, { ...evidence, error })).toBe(false);
      expect(readIntentAttempt(target)?.key).toBe(attempt.key);
    }
    // A later attempt cannot start beside an earlier uncertain marker, and its refusal cannot clear that marker.
    const earlier = storage(); markIntentInFlight(earlier, attempt);
    const later = { ...attempt, key: "10000000-0000-4000-8000-000000000002", acceptedAt: "2026-10-14T12:01:00.000Z" };
    expect(() => markIntentInFlight(earlier, later)).toThrow("An earlier attempt needs recovery before another submission.");
    expect(clearFirstRefusedIntentAttempt(earlier, later, { firstPost: true, stillCurrent: true, error })).toBe(false);
    expect(readIntentAttempt(earlier)).toEqual({ ...attempt, state: "uncertain" });
  });
});

describe("prepared final first-refusal marker clearance", () => {
  const refused = () => new RequestIntentPreparationHttpError(409, "request_preparation_refused");
  const first = (error: unknown = refused()) => ({ firstPost: true, stillCurrent: true, error });
  it("clears only the exact owned marker after the first current typed final 409", () => {
    const target = storage(); markIntentInFlight(target, attempt);
    target.setItem("unrelated-key", "preserve");
    expect(clearFirstPreparedRefusedIntentAttempt(target, attempt, first())).toBe(true);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
    expect([...target.values]).toEqual([["unrelated-key", "preserve"]]);
    expect(attempt).toEqual({ key: "10000000-0000-4000-8000-000000000001",
      acceptedAt: "2026-10-14T12:00:00.000Z", state: "in_flight" });
  });
  it("uses the actual I2 transport refusal type without widening ordinary clearance", async () => {
    const target = storage(); let posts = 0;
    const api = createRequestIntentApi(() => null, async () => {
      posts += 1;
      return new Response(JSON.stringify({ error: "request_preparation_refused" }), { status: 409 });
    }, { continuation: "synthetic.continuation" });
    const failure = await postIntentAttempt(target, attempt,
      () => api.submitPrepared!({ idempotencyKey: attempt.key } as Parameters<typeof api.submit>[0], "synthetic.witness"))
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RequestIntentPreparationHttpError);
    expect(clearFirstRefusedIntentAttempt(target, attempt, first(failure))).toBe(false);
    expect(clearFirstPreparedRefusedIntentAttempt(target, attempt, first(failure))).toBe(true);
    expect(posts).toBe(1); expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBeNull();
  });
  it.each([
    new RequestIntentPreparationHttpError(400, "request_preparation_refused"),
    new RequestIntentPreparationHttpError(401, "request_preparation_refused"),
    new RequestIntentPreparationHttpError(403, "request_preparation_refused"),
    new RequestIntentPreparationHttpError(503, "request_preparation_unavailable"),
    new RequestIntentPreparationHttpError(503, "request_preparation_refused"),
    new RequestIntentPreparationHttpError(409, "request_preparation_unavailable"),
    new RequestIntentHttpError(409, "request_preparation_refused"),
    new RequestIntentHttpError(503, "request_intent_unavailable"),
    new Error("lost reply"), null, undefined,
    { name: "RequestIntentPreparationHttpError", status: 409, code: "request_preparation_refused" },
  ])("keeps the marker for other status, class, 503, network or lookalike errors %#", error => {
    const target = storage(); markIntentInFlight(target, attempt);
    const before = target.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(clearFirstPreparedRefusedIntentAttempt(target, attempt, { firstPost: true, stillCurrent: true, error })).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(before);
  });
  it.each([
    { firstPost: false, stillCurrent: true },
    { firstPost: true, stillCurrent: false },
    { firstPost: false, stillCurrent: false },
  ])("rejects a later POST/remount or stale mount %#", evidence => {
    const target = storage(); markIntentInFlight(target, attempt);
    const before = target.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(clearFirstPreparedRefusedIntentAttempt(target, attempt, { ...evidence, error: refused() })).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(before);
  });
  it("retains a real lost-response marker across remount and a later typed refusal", async () => {
    const target = storage(); let posts = 0;
    await expect(postIntentAttempt(target, attempt, async () => {
      posts += 1; throw new Error("synthetic lost response");
    })).rejects.toThrow("synthetic lost response");
    const restored = readIntentAttempt(target)!;
    expect(restored).toEqual({ ...attempt, state: "uncertain" });
    const before = target.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    expect(clearFirstPreparedRefusedIntentAttempt(target, restored,
      { firstPost: false, stillCurrent: true, error: refused() })).toBe(false);
    await expect(postIntentAttempt(target, restored, async () => {
      posts += 1; throw refused();
    })).rejects.toBeInstanceOf(RequestIntentPreparationHttpError);
    expect(clearFirstPreparedRefusedIntentAttempt(target, restored,
      { firstPost: false, stillCurrent: true, error: refused() })).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(before); expect(posts).toBe(2);
  });
  it.each([null, "{}", "not-json", JSON.stringify({ ...attempt, extra: "unknown" }),
    JSON.stringify({ ...attempt, key: "10000000-0000-4000-8000-000000000002" }),
    JSON.stringify({ ...attempt, acceptedAt: "2026-10-14T12:01:00.000Z" }),
  ])("preserves absent/corrupt/changed ownership rather than deleting it %#", raw => {
    const target = storage(); if (raw !== null) target.setItem(REQUEST_INTENT_ATTEMPT_KEY, raw);
    expect(clearFirstPreparedRefusedIntentAttempt(target, attempt, first())).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(raw);
  });
  it("returns false on read failure, remove failure, silent remove and readback failure", () => {
    const target = storage(); markIntentInFlight(target, attempt);
    const raw = target.getItem(REQUEST_INTENT_ATTEMPT_KEY);
    let removals = 0;
    expect(clearFirstPreparedRefusedIntentAttempt({
      getItem: () => { throw new Error("storage unavailable"); }, removeItem: () => { removals += 1; },
    }, attempt, first())).toBe(false);
    expect(removals).toBe(0);
    expect(clearFirstPreparedRefusedIntentAttempt({ ...target, removeItem: () => { throw new Error("remove unavailable"); } },
      attempt, first())).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(raw);
    expect(clearFirstPreparedRefusedIntentAttempt({ ...target, removeItem: () => {} }, attempt, first())).toBe(false);
    expect(target.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(raw);
    let reads = 0;
    expect(clearFirstPreparedRefusedIntentAttempt({
      getItem: key => { if (++reads > 1) throw new Error("readback unavailable"); return target.getItem(key); },
      removeItem: key => { removals += 1; target.removeItem(key); },
    }, attempt, first())).toBe(false);
    expect(removals).toBe(1); // A failed proof is not repaired by restoring erased data.
  });
  it("does not claim clearance when removal leaves a newer owned marker", () => {
    const target = storage(); markIntentInFlight(target, attempt);
    const newer = { ...attempt, key: "10000000-0000-4000-8000-000000000002" };
    expect(clearFirstPreparedRefusedIntentAttempt({ ...target,
      removeItem: key => target.setItem(key, JSON.stringify(newer)),
    }, attempt, first())).toBe(false);
    expect(readIntentAttempt(target)).toEqual({ ...newer, state: "uncertain" });
  });
});
