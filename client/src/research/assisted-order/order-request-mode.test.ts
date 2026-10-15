// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { ASSISTED_ORDER_DRAFT_KEY } from "./draft-store";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { readOrderRequestContinuity, selectOrderRequestDoor } from "./order-request-mode";

const key = "10000000-0000-4000-8000-000000000001";
const acceptedAt = "2026-10-14T12:00:00Z";
beforeEach(() => window.sessionStorage.clear());
describe("request-door continuity without authority or storage mutation", () => {
  it("uses the configured mode only with no retained attempt", () => {
    expect(readOrderRequestContinuity(window.sessionStorage)).toBe("none");
    for (const kind of ["checking", "legacy", "mixed", "unavailable"] as const) {
      expect(selectOrderRequestDoor({ kind }, "none")).toBe(kind);
    }
  });
  it("keeps an interrupted mixed marker on mixed recovery even when off or unknown", () => {
    const raw = JSON.stringify({ key, acceptedAt, state: "in_flight" });
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, raw);
    for (const kind of ["legacy", "mixed", "unavailable"] as const) {
      expect(selectOrderRequestDoor({ kind }, readOrderRequestContinuity(window.sessionStorage))).toBe("mixed");
    }
    expect(window.sessionStorage.getItem(REQUEST_INTENT_ATTEMPT_KEY)).toBe(raw);
  });
  it("retains legacy in-flight and uncertain key/acceptedAt instead of switching them to mixed", () => {
    for (const attemptState of ["in_flight", "uncertain"]) {
      const raw = JSON.stringify({ idempotencyKey: key, acceptedAt, attemptState, selections: [], step: "review", generalNotes: "" });
      window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, raw);
      expect(selectOrderRequestDoor({ kind: "mixed" }, readOrderRequestContinuity(window.sessionStorage))).toBe("legacy");
      expect(window.sessionStorage.getItem(ASSISTED_ORDER_DRAFT_KEY)).toBe(raw);
    }
  });
  it("blocks competing saved attempts rather than choose a possible duplicate", () => {
    window.sessionStorage.setItem(REQUEST_INTENT_ATTEMPT_KEY, JSON.stringify({ key, acceptedAt, state: "uncertain" }));
    window.sessionStorage.setItem(ASSISTED_ORDER_DRAFT_KEY, JSON.stringify({ idempotencyKey: key, acceptedAt, attemptState: "uncertain", selections: [] }));
    expect(readOrderRequestContinuity(window.sessionStorage)).toBe("blocked");
    expect(window.sessionStorage.length).toBe(2);
  });
  it("blocks corrupt or inaccessible state without clearing it or assuming absence", () => {
    for (const storageKey of [ASSISTED_ORDER_DRAFT_KEY, REQUEST_INTENT_ATTEMPT_KEY]) {
      window.sessionStorage.clear(); window.sessionStorage.setItem(storageKey, "not-json");
      expect(readOrderRequestContinuity(window.sessionStorage)).toBe("blocked");
      expect(window.sessionStorage.getItem(storageKey)).toBe("not-json");
    }
    expect(readOrderRequestContinuity(null)).toBe("blocked");
    expect(readOrderRequestContinuity({ getItem: () => { throw new Error("synthetic denied"); } })).toBe("blocked");
  });
});
