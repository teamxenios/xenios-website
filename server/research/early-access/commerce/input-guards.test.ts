import { describe, expect, it } from "vitest";
import {
  accepted,
  carriesAnyKey,
  isBoundedInteger,
  isBoundedText,
  isCanonicalTimestamp,
  isNotBefore,
  isOneOf,
  isPositiveCents,
  isSafeIdentifier,
  readPlainArray,
  readPlainRecord,
  refused,
} from "./input-guards";

describe("result constructors", () => {
  it("freezes both arms so a decision cannot be rewritten", () => {
    const ok = accepted<{ a: number }, "bad">({ a: 1 });
    const no = refused<{ a: number }, "bad">("bad");
    expect(Object.isFrozen(ok)).toBe(true);
    expect(Object.isFrozen(no)).toBe(true);
    expect(() => {
      (ok as unknown as Record<string, unknown>).ok = false;
    }).toThrow();
  });
});

describe("readPlainRecord", () => {
  it("detaches the exact required keys", () => {
    expect(readPlainRecord({ a: 1, b: "two" }, ["a", "b"])).toEqual({ a: 1, b: "two" });
  });

  it("refuses an extra key, a missing key, and a non-object", () => {
    expect(readPlainRecord({ a: 1, b: 2, c: 3 }, ["a", "b"])).toBeNull();
    expect(readPlainRecord({ a: 1 }, ["a", "b"])).toBeNull();
    expect(readPlainRecord(null, ["a"])).toBeNull();
    expect(readPlainRecord("a", ["a"])).toBeNull();
    expect(readPlainRecord([1], ["a"])).toBeNull();
  });

  it("allows an omitted optional key and refuses an unknown one", () => {
    expect(readPlainRecord({ a: 1 }, ["a"], ["b"])).toEqual({ a: 1 });
    expect(readPlainRecord({ a: 1, b: 2 }, ["a"], ["b"])).toEqual({ a: 1, b: 2 });
    expect(readPlainRecord({ a: 1, z: 2 }, ["a"], ["b"])).toBeNull();
  });

  it("refuses an accessor property without invoking it", () => {
    let reads = 0;
    const hostile = {};
    Object.defineProperty(hostile, "a", {
      get() {
        reads += 1;
        return 1;
      },
      enumerable: true,
      configurable: true,
    });
    expect(readPlainRecord(hostile, ["a"])).toBeNull();
    expect(reads).toBe(0);
  });

  it("refuses a non-enumerable property and an exotic prototype", () => {
    const hidden = {};
    Object.defineProperty(hidden, "a", { value: 1, enumerable: false, configurable: true });
    expect(readPlainRecord(hidden, ["a"])).toBeNull();

    class Holder {
      a = 1;
    }
    expect(readPlainRecord(new Holder(), ["a"])).toBeNull();
    expect(readPlainRecord(Object.assign(Object.create({ inherited: true }), { a: 1 }), ["a"])).toBeNull();
  });

  it("refuses a Proxy that imitates ordinary data properties", () => {
    expect(readPlainRecord(new Proxy({ a: 1 }, {}), ["a"])).toBeNull();
  });

  it("refuses a symbol key and a value that cannot be cloned", () => {
    const symbolKeyed: Record<string, unknown> = { a: 1 };
    (symbolKeyed as unknown as Record<symbol, unknown>)[Symbol("x")] = 2;
    expect(readPlainRecord(symbolKeyed, ["a"])).toBeNull();
    expect(readPlainRecord({ a: () => 1 }, ["a"])).toBeNull();
  });

  it("reads a frozen record produced by this domain", () => {
    expect(readPlainRecord(Object.freeze({ a: 1 }), ["a"])).toEqual({ a: 1 });
  });
});

describe("readPlainArray", () => {
  it("reads a dense bounded array", () => {
    expect(readPlainArray([1, 2], 4)).toEqual([1, 2]);
    expect(readPlainArray([], 4)).toEqual([]);
  });

  it("refuses over-length, sparse, decorated, and non-array input", () => {
    expect(readPlainArray([1, 2, 3], 2)).toBeNull();
    const sparse: unknown[] = [];
    sparse.length = 2;
    expect(readPlainArray(sparse, 4)).toBeNull();
    const decorated: unknown[] = [1];
    (decorated as unknown as Record<string, unknown>).extra = 2;
    expect(readPlainArray(decorated, 4)).toBeNull();
    expect(readPlainArray({ length: 1, 0: "a" }, 4)).toBeNull();
    expect(readPlainArray(new Proxy([1], {}), 4)).toBeNull();
  });
});

describe("scalar guards", () => {
  it("bounds identifiers", () => {
    expect(isSafeIdentifier("ord_0001")).toBe(true);
    expect(isSafeIdentifier("ab")).toBe(false);
    expect(isSafeIdentifier("_leading")).toBe(false);
    expect(isSafeIdentifier("has space")).toBe(false);
    expect(isSafeIdentifier(12345)).toBe(false);
    expect(isSafeIdentifier(`a${"b".repeat(200)}`)).toBe(false);
  });

  it("accepts only canonical millisecond UTC timestamps", () => {
    expect(isCanonicalTimestamp("2026-08-04T12:00:00.000Z")).toBe(true);
    expect(isCanonicalTimestamp("2026-08-04T12:00:00Z")).toBe(false);
    expect(isCanonicalTimestamp("2026-08-04T12:00:00.000+01:00")).toBe(false);
    expect(isCanonicalTimestamp("2026-02-30T12:00:00.000Z")).toBe(false);
    expect(isCanonicalTimestamp(1_754_308_800_000)).toBe(false);
  });

  it("orders canonical timestamps without a clock", () => {
    expect(isNotBefore("2026-08-04T12:00:00.000Z", "2026-08-04T11:59:59.999Z")).toBe(true);
    expect(isNotBefore("2026-08-04T12:00:00.000Z", "2026-08-04T12:00:00.000Z")).toBe(true);
    expect(isNotBefore("2026-08-04T11:00:00.000Z", "2026-08-04T12:00:00.000Z")).toBe(false);
  });

  it("bounds money and integers", () => {
    expect(isPositiveCents(1, 100)).toBe(true);
    expect(isPositiveCents(0, 100)).toBe(false);
    expect(isPositiveCents(-1, 100)).toBe(false);
    expect(isPositiveCents(101, 100)).toBe(false);
    expect(isPositiveCents(1.5, 100)).toBe(false);
    expect(isPositiveCents(Number.NaN, 100)).toBe(false);
    expect(isPositiveCents(Number.POSITIVE_INFINITY, 100)).toBe(false);
    expect(isPositiveCents("10", 100)).toBe(false);
    expect(isBoundedInteger(1, 1, 3)).toBe(true);
    expect(isBoundedInteger(4, 1, 3)).toBe(false);
  });

  it("refuses untrimmed, empty, oversized, and control-bearing text", () => {
    expect(isBoundedText("Samuel Boadu", 64)).toBe(true);
    expect(isBoundedText(" Samuel", 64)).toBe(false);
    expect(isBoundedText("", 64)).toBe(false);
    expect(isBoundedText("a".repeat(65), 64)).toBe(false);
    expect(isBoundedText("line\nbreak", 64)).toBe(false);
    expect(isBoundedText("null\u0000byte", 64)).toBe(false);
    expect(isBoundedText("sep\u2028arator", 64)).toBe(false);
    expect(isBoundedText(42, 64)).toBe(false);
  });

  it("matches a closed vocabulary only", () => {
    expect(isOneOf("a", ["a", "b"])).toBe(true);
    expect(isOneOf("A", ["a", "b"])).toBe(false);
    expect(isOneOf(new String("a"), ["a", "b"])).toBe(false);
  });
});

describe("carriesAnyKey", () => {
  it("detects a forbidden key regardless of value", () => {
    expect(carriesAnyKey({ total: undefined }, ["total"])).toBe(true);
    expect(carriesAnyKey({ other: 1 }, ["total"])).toBe(false);
    expect(carriesAnyKey(null, ["total"])).toBe(false);
    expect(carriesAnyKey(Object.create(null) as object, ["total"])).toBe(false);
  });
});
