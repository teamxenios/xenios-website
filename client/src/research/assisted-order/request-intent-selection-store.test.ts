import { describe, expect, it, vi } from "vitest";
import { ASSISTED_ORDER_MAX_LINES } from "../../../../shared/research/assisted-order/contract";
import { EARLY_ACCESS_POLICY_MAX_QUANTITY } from "../../../../shared/research/early-access-quantity";
import { REQUEST_INTENT_ATTEMPT_KEY } from "./request-intent-attempt";
import { ASSISTED_ORDER_STORAGE_PREFIX } from "./storage";
import {
  REQUEST_SELECTION_KEY, REQUEST_SELECTION_MAX_CHARS, clearRequestSelectionCandidate,
  readRequestSelectionCandidate, writeRequestSelectionCandidate,
} from "./request-intent-selection-store";

const context = (scope = "a".repeat(64)) => ({ kind: "early_access_session", selectionScope: scope });
const line = () => ({ productId: "synthetic-product", variantId: "synthetic-variant", quantity: 2 });
const envelope = (change: Record<string, unknown> = {}) => ({ version: 1, context: context(), lines: [line()], ...change });
const live = () => true;
function memory(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return { values, getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }) };
}
function expectNoStorage(target: ReturnType<typeof memory>) {
  expect(target.getItem).not.toHaveBeenCalled();
  expect(target.setItem).not.toHaveBeenCalled();
  expect(target.removeItem).not.toHaveBeenCalled();
}

describe("selection-only store (not authorization or catalog validation)", () => {
  it("uses the existing privacy-sweep namespace without touching legacy state", () => {
    expect(REQUEST_SELECTION_KEY.startsWith(ASSISTED_ORDER_STORAGE_PREFIX)).toBe(true);
    expect(REQUEST_SELECTION_KEY).not.toBe(REQUEST_INTENT_ATTEMPT_KEY);
    const target = memory({ legacy: "unchanged" });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "none" });
    expect(target.getItem.mock.calls[0]).toEqual([REQUEST_INTENT_ATTEMPT_KEY]);
    expect(target.values.get("legacy")).toBe("unchanged");
  });
  it("round trips only closed, frozen candidate lines, not a submittable payload", () => {
    const target = memory();
    expect(writeRequestSelectionCandidate(target, context(), [line()], live)).toBe(true);
    expect(JSON.parse(target.values.get(REQUEST_SELECTION_KEY)!)).toEqual(envelope());
    const result = readRequestSelectionCandidate(target, context(), live);
    expect(result).toEqual({ kind: "candidate", lines: [line()] });
    if (result.kind !== "candidate") throw new Error("missing candidate");
    expect(Object.isFrozen(result.lines)).toBe(true);
    expect(Object.isFrozen(result.lines[0])).toBe(true);
  });
  it("keeps an empty selection but does not claim it can submit", () => {
    const target = memory();
    expect(writeRequestSelectionCandidate(target, context(), [], live)).toBe(true);
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "candidate", lines: [] });
  });
  it.each([null, undefined, {}, { kind: "member", selectionScope: "a".repeat(64) },
    context(""), context("A".repeat(64)), context("a".repeat(63)),
    { ...context(), token: "forbidden" }, Object.create(context())])("does no storage access with invalid context %j", (invalid) => {
    const target = memory();
    expect(readRequestSelectionCandidate(target, invalid, live)).toEqual({ kind: "unavailable" });
    expect(writeRequestSelectionCandidate(target, invalid, [line()], live)).toBe(false);
    expect(clearRequestSelectionCandidate(target, invalid, live)).toBe(false);
    expectNoStorage(target);
  });
  it.each([() => false, () => { throw new Error("stale"); }, () => 1 as unknown as boolean])("does no storage access when the guard refuses", (guard) => {
    const target = memory();
    expect(readRequestSelectionCandidate(target, context(), guard)).toEqual({ kind: "unavailable" });
    expect(writeRequestSelectionCandidate(target, context(), [line()], guard)).toBe(false);
    expect(clearRequestSelectionCandidate(target, context(), guard)).toBe(false);
    expectNoStorage(target);
  });
  it("rejects an accessor context without invoking its getter", () => {
    const getter = vi.fn(() => "a".repeat(64));
    const value = { kind: "early_access_session", get selectionScope() { return getter(); } };
    const target = memory();
    expect(readRequestSelectionCandidate(target, value, live)).toEqual({ kind: "unavailable" });
    expect(getter).not.toHaveBeenCalled();
    expectNoStorage(target);
  });
  it.each(["", "{}", "not-json", JSON.stringify({ state: "uncertain", key: "synthetic" })])("raw attempt %j wins and stays byte-identical", (marker) => {
    const original = JSON.stringify(envelope());
    const target = memory({ [REQUEST_INTENT_ATTEMPT_KEY]: marker, [REQUEST_SELECTION_KEY]: original });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "blocked_attempt" });
    expect(writeRequestSelectionCandidate(target, context(), [line()], live)).toBe(false);
    expect(clearRequestSelectionCandidate(target, context(), live)).toBe(false);
    expect(target.values.get(REQUEST_INTENT_ATTEMPT_KEY)).toBe(marker);
    expect(target.values.get(REQUEST_SELECTION_KEY)).toBe(original);
    expect(target.getItem.mock.calls.every(([key]) => key === REQUEST_INTENT_ATTEMPT_KEY)).toBe(true);
    expect(target.setItem).not.toHaveBeenCalled();
    expect(target.removeItem).not.toHaveBeenCalled();
  });
  it.each(["b".repeat(64), "c".repeat(64)])("refuses another or renewed scope and clears only selections", (scope) => {
    const target = memory({ [REQUEST_SELECTION_KEY]: JSON.stringify(envelope()), legacy: "keep" });
    expect(readRequestSelectionCandidate(target, context(scope), live)).toEqual({ kind: "scope_mismatch" });
    expect(target.removeItem.mock.calls).toEqual([[REQUEST_SELECTION_KEY]]);
    expect(target.values.get("legacy")).toBe("keep");
  });
  it.each([null, [], {}, { ...envelope(), extra: "no" }, envelope({ version: 2 }),
    envelope({ context: { ...context(), token: "no" } }), envelope({ lines: [line(), line()] }),
    envelope({ lines: [{ ...line(), contact: "no" }] }), envelope({ lines: [null] })])("clears malformed envelope %j only under a current context", (value) => {
    const target = memory({ [REQUEST_SELECTION_KEY]: JSON.stringify(value), legacy: "keep" });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "invalid" });
    expect(target.removeItem.mock.calls).toEqual([[REQUEST_SELECTION_KEY]]);
    expect(target.values.get("legacy")).toBe("keep");
  });
  it.each(["{", "x".repeat(REQUEST_SELECTION_MAX_CHARS + 1)])("rejects malformed/oversized JSON before use", (raw) => {
    const target = memory({ [REQUEST_SELECTION_KEY]: raw });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "invalid" });
  });
  it.each(["contact", "notes", "productName", "unitPriceCents", "reference", "token", "acceptedAt", "selectableForReview"])("does not persist extra line field %s", (field) => {
    const target = memory();
    expect(writeRequestSelectionCandidate(target, context(), [{ ...line(), [field]: "no" }], live)).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, NaN, Infinity, "2", null, EARLY_ACCESS_POLICY_MAX_QUANTITY + 1])("rejects structural quantity %j without clamping", (quantity) => {
    const target = memory();
    expect(writeRequestSelectionCandidate(target, context(), [{ ...line(), quantity }], live)).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it.each(["", " product", "product ", "x".repeat(161), "product\u0000id", 1, null])("rejects bad identity %j", (productId) => {
    expect(writeRequestSelectionCandidate(memory(), context(), [{ ...line(), productId }], live)).toBe(false);
  });
  it("rejects oversized/duplicate arrays and allows distinct canonical identity pairs", () => {
    const target = memory();
    expect(writeRequestSelectionCandidate(target, context(), Array.from({ length: ASSISTED_ORDER_MAX_LINES + 1 }, (_, i) => ({ ...line(), variantId: String(i) })), live)).toBe(false);
    expect(writeRequestSelectionCandidate(target, context(), [line(), line()], live)).toBe(false);
    expect(writeRequestSelectionCandidate(target, context(), [line(), { ...line(), variantId: "other" }], live)).toBe(true);
  });
  it("rejects inherited or accessor line data without invoking accessors", () => {
    const getter = vi.fn(() => "synthetic");
    const accessor = { ...line(), get productId() { return getter(); } };
    expect(writeRequestSelectionCandidate(memory(), context(), [accessor], live)).toBe(false);
    expect(writeRequestSelectionCandidate(memory(), context(), [Object.create(line())], live)).toBe(false);
    expect(getter).not.toHaveBeenCalled();
  });
  it("rechecks the guard before writing instead of relying on first admission", () => {
    const target = memory();
    const guard = vi.fn().mockReturnValueOnce(true).mockReturnValueOnce(true).mockReturnValue(false);
    expect(writeRequestSelectionCandidate(target, context(), [line()], guard)).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it("refuses a context mutated by the guard before any storage access", () => {
    const current = context();
    const target = memory();
    expect(writeRequestSelectionCandidate(target, current, [line()], () => { current.selectionScope = "b".repeat(64); return true; })).toBe(false);
    expectNoStorage(target);
  });
  it("catches an attempt created during the freshness callback", () => {
    const target = memory();
    let calls = 0;
    const guard = () => { if (++calls === 2) target.values.set(REQUEST_INTENT_ATTEMPT_KEY, "pending"); return true; };
    expect(writeRequestSelectionCandidate(target, context(), [line()], guard)).toBe(false);
    expect(target.setItem).not.toHaveBeenCalled();
    expect(target.values.get(REQUEST_INTENT_ATTEMPT_KEY)).toBe("pending");
  });
  it("catches an attempt created during selection read and does not erase either key", () => {
    const raw = JSON.stringify(envelope());
    const target = memory({ [REQUEST_SELECTION_KEY]: raw });
    target.getItem.mockImplementation((key) => {
      if (key === REQUEST_SELECTION_KEY) target.values.set(REQUEST_INTENT_ATTEMPT_KEY, "uncertain");
      return target.values.get(key) ?? null;
    });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "blocked_attempt" });
    expect(target.removeItem).not.toHaveBeenCalled();
    expect(target.values.get(REQUEST_SELECTION_KEY)).toBe(raw);
  });
  it("does not discard invalid data after the freshness guard fails", () => {
    const target = memory({ [REQUEST_SELECTION_KEY]: "invalid" });
    let current = true;
    target.getItem.mockImplementation((key) => { if (key === REQUEST_SELECTION_KEY) current = false; return target.values.get(key) ?? null; });
    expect(readRequestSelectionCandidate(target, context(), () => current)).toEqual({ kind: "unavailable" });
    expect(target.removeItem).not.toHaveBeenCalled();
  });
  it("does not erase a replacement during invalid-cache cleanup", () => {
    const target = memory({ [REQUEST_SELECTION_KEY]: "invalid" });
    let reads = 0;
    target.getItem.mockImplementation((key) => {
      if (key === REQUEST_SELECTION_KEY && ++reads === 2) target.values.set(key, JSON.stringify(envelope()));
      return target.values.get(key) ?? null;
    });
    expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "unavailable" });
    expect(target.removeItem).not.toHaveBeenCalled();
  });
  it.each(["getItem", "setItem", "removeItem"] as const)("fails closed on storage %s errors", (operation) => {
    const target = memory({ [REQUEST_SELECTION_KEY]: "invalid" });
    target[operation].mockImplementation(() => { throw new Error("denied"); });
    if (operation === "getItem") expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "unavailable" });
    if (operation === "setItem") expect(writeRequestSelectionCandidate(target, context(), [line()], live)).toBe(false);
    if (operation === "removeItem") {
      expect(readRequestSelectionCandidate(target, context(), live)).toEqual({ kind: "unavailable" });
      expect(clearRequestSelectionCandidate(target, context(), live)).toBe(false);
    }
  });
  it("requires exact readback after write and after removal", () => {
    const target = memory();
    target.setItem.mockImplementation(() => {});
    expect(writeRequestSelectionCandidate(target, context(), [line()], live)).toBe(false);
    target.values.set(REQUEST_SELECTION_KEY, JSON.stringify(envelope()));
    target.removeItem.mockImplementation(() => {});
    expect(clearRequestSelectionCandidate(target, context(), live)).toBe(false);
  });
  it("clears only the selection key, with readback and current context", () => {
    const target = memory({ [REQUEST_SELECTION_KEY]: JSON.stringify(envelope()), legacy: "keep" });
    expect(clearRequestSelectionCandidate(target, context(), live)).toBe(true);
    expect(target.removeItem.mock.calls).toEqual([[REQUEST_SELECTION_KEY]]);
    expect(target.values.get("legacy")).toBe("keep");
  });
});
