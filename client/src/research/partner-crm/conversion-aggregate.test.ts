import { describe, expect, it } from "vitest";
import { readConversionAggregates } from "./conversion-aggregate";

const row = (patch: Record<string, unknown> = {}) => ({ period: "2026-09", activations: 3, ...patch });
const envelope = (rows: unknown = [row()]) => ({ ok: true, rows });
const invalidCounts: unknown[] = [-1, 1.5, "3", "0", null, undefined, Number.NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1, true, {}, []];

describe("existing partner CRM conversion aggregate projection", () => {
  it("copies only aggregate facts without mutating, sorting, or totaling the server rows", () => {
    const sourceRows = Object.freeze([
      Object.freeze(row({ period: "2026-09", activations: 3, renewals: null })),
      Object.freeze(row({ period: "2025-12", activations: 0 })),
      Object.freeze(row({ period: "2026-07", activations: 8, renewals: 2 })),
    ]);
    const source = Object.freeze(envelope(sourceRows));
    const before = JSON.stringify(source);
    const result = readConversionAggregates(source);
    expect(result).toEqual(sourceRows);
    expect(result).not.toBe(sourceRows);
    for (let index = 0; index < sourceRows.length; index++) expect(result![index]).not.toBe(sourceRows[index]);
    expect(result?.map(({ period }) => period)).toEqual(["2026-09", "2025-12", "2026-07"]);
    expect(Object.keys(result![1])).toEqual(["period", "activations"]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("preserves the difference between absent, null, and zero renewals", () => {
    const result = readConversionAggregates(envelope([
      row({ period: "2026-07" }),
      row({ period: "2026-08", renewals: null }),
      row({ period: "2026-09", renewals: 0 }),
    ]));
    expect(result).toEqual([
      { period: "2026-07", activations: 3 },
      { period: "2026-08", activations: 3, renewals: null },
      { period: "2026-09", activations: 3, renewals: 0 },
    ]);
    expect(Object.hasOwn(result![0], "renewals")).toBe(false);
    expect(Object.hasOwn(result![1], "renewals")).toBe(true);
    expect(Object.hasOwn(result![2], "renewals")).toBe(true);
  });

  it("refuses explicitly undefined renewals instead of treating the field as absent", () => {
    expect(readConversionAggregates(envelope([row({ renewals: undefined })]))).toBeNull();
  });

  it("distinguishes an explicit empty response from missing or unreadable history", () => {
    expect(readConversionAggregates(envelope([]))).toEqual([]);
    expect(readConversionAggregates({ ok: true })).toBeNull();
    expect(readConversionAggregates(envelope(null))).toBeNull();
  });

  it.each(Array.from({ length: 12 }, (_, index) => `2026-${String(index + 1).padStart(2, "0")}`))
    ("accepts exact server month bucket %s", (period) => {
      expect(readConversionAggregates(envelope([row({ period })]))).toEqual([row({ period })]);
    });

  it("uses the server's four-digit year syntax without inventing a date window", () => {
    expect(readConversionAggregates(envelope([
      row({ period: "0000-01" }), row({ period: "9999-12" }),
    ]))).toEqual([row({ period: "0000-01" }), row({ period: "9999-12" })]);
  });

  it("accepts nonnegative safe-integer event counts at both bounds", () => {
    const rows = [
      row({ period: "2026-08", activations: 0, renewals: 0 }),
      row({ activations: Number.MAX_SAFE_INTEGER, renewals: Number.MAX_SAFE_INTEGER }),
    ];
    expect(readConversionAggregates(envelope(rows))).toEqual(rows);
  });
});

describe("conversion aggregate input boundary", () => {
  it.each([
    null, undefined, false, 0, "rows", [], [row()], {}, { rows: [] },
    { ok: false, rows: [] }, { ok: "true", rows: [] }, { ok: 1, rows: [] },
    { ok: true, rows: {} }, { ok: true, rows: "none" }, { ok: true, rows: false },
  ])("rejects malformed envelopes without inferring zero activity: %j", (value) => {
    expect(readConversionAggregates(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "row", [], {}])("rejects malformed aggregate row %j", (value) => {
    expect(readConversionAggregates(envelope([value]))).toBeNull();
  });

  it.each(["period", "activations"])("requires an own %s field on each row", (field) => {
    const missing: Record<string, unknown> = { ...row() };
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readConversionAggregates(envelope([missing]))).toBeNull();
    expect(readConversionAggregates(envelope([inherited]))).toBeNull();
  });

  it("requires both envelope fields to be own properties", () => {
    expect(readConversionAggregates(Object.assign(Object.create({ ok: true }), { rows: [] }))).toBeNull();
    expect(readConversionAggregates(Object.assign(Object.create({ rows: [] }), { ok: true }))).toBeNull();
    expect(readConversionAggregates(Object.create(envelope([])))).toBeNull();
  });

  it("does not consume inherited optional renewals as server evidence", () => {
    const sourceRow = Object.assign(Object.create({ renewals: 99 }), row());
    const result = readConversionAggregates(envelope([sourceRow]));
    expect(result).toEqual([row()]);
    expect(Object.hasOwn(result![0], "renewals")).toBe(false);
  });

  it.each(["activations", "renewals"])("never coerces or rounds malformed %s", (field) => {
    const values = field === "renewals" ? invalidCounts.filter((value) => value !== null) : invalidCounts;
    for (const value of values) {
      expect(readConversionAggregates(envelope([row({ [field]: value })])), `${field}: ${String(value)}`).toBeNull();
    }
  });

  it.each([
    "2026-00", "2026-13", "2026-9", "2026-009", "26-09", "02026-09",
    "2026-09-01", "2026-09T00:00:00Z", "2026/09", " 2026-09", "2026-09 ",
    "2026-09\n", "2026-09\r", "2026-09\u0000", "２０２６-09", "person@fixture.invalid", "", null, 202609, {},
  ])("rejects malformed month bucket %j without normalizing it", (period) => {
    expect(readConversionAggregates(envelope([row({ period })]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["name", "Synthetic Person"],
    ["memberId", "synthetic-member"], ["contactId", "synthetic-contact"],
    ["phone", "synthetic-phone"], ["identity", { email: "person@fixture.invalid" }],
    ["contacts", [{ name: "Synthetic Person" }]], ["total", 99], ["canManage", true],
  ])("refuses extra %s data at both envelope and row boundaries", (field, value) => {
    expect(readConversionAggregates({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readConversionAggregates(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it("does not admit nested identity data through an expected count field", () => {
    expect(readConversionAggregates(envelope([row({ activations: { email: "person@fixture.invalid" } })]))).toBeNull();
    expect(readConversionAggregates(envelope([row({ renewals: [{ memberId: "synthetic-member" }] })]))).toBeNull();
  });

  it("rejects duplicate periods even when their reported counts differ", () => {
    expect(readConversionAggregates(envelope([row(), row({ activations: 9, renewals: 2 })]))).toBeNull();
  });

  it.each([0, 1])("rejects the entire response when malformed row %s accompanies a valid row", (invalidIndex) => {
    const rows: unknown[] = [row({ period: "2026-08" }), row()];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, activations: -1 };
    expect(readConversionAggregates(envelope(rows))).toBeNull();
  });
});
