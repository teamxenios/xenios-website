import { describe, expect, it } from "vitest";
import type { CommissionState } from "@shared/research/distribution";
import { COMMISSION_STATE_LABELS, formatCommissionCents, readCommissionLedger } from "./commission-ledger";

const entry = (patch: Record<string, unknown> = {}) => ({
  id: "commission-SYNTHETIC_One.1",
  date: "2026-09-07",
  description: "Referred order commission",
  commissionCents: 1500,
  state: "pending",
  ledger: "AFFILIATE_COMMISSION",
  ...patch,
});
const envelope = (entries: unknown = [entry()]) => ({ ok: true, entries });
const states = ["pending", "held", "approved", "payable", "paid", "reversed", "disputed", "forfeited"] as const satisfies readonly CommissionState[];
const requiredFields = ["id", "date", "description", "commissionCents", "state", "ledger"];

describe("existing affiliate commission ledger projection", () => {
  it("copies the exact ledger facts without mutating, sorting, or netting entries", () => {
    const sourceEntries = Object.freeze([
      Object.freeze(entry({ id: "synthetic-reversal", date: "2026-09-07", description: "Reversal of a referred order commission", commissionCents: -1600, state: "reversed" })),
      Object.freeze(entry({ id: "synthetic-original", date: "2026-08-01", commissionCents: 1500, state: "paid" })),
      Object.freeze(entry({ id: "synthetic-zero", date: "2026-08-15", commissionCents: 0, state: "held" })),
    ]);
    const source = Object.freeze(envelope(sourceEntries));
    const before = JSON.stringify(source);
    const result = readCommissionLedger(source);
    expect(result).toEqual(sourceEntries);
    expect(result).not.toBe(sourceEntries);
    for (let index = 0; index < sourceEntries.length; index++) expect(result![index]).not.toBe(sourceEntries[index]);
    expect(result?.map(({ id }) => id)).toEqual(["synthetic-reversal", "synthetic-original", "synthetic-zero"]);
    expect(result?.map(({ commissionCents }) => commissionCents)).toEqual([-1600, 1500, 0]);
    expect(Object.keys(result![0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("distinguishes an explicit empty ledger from absent entries", () => {
    expect(readCommissionLedger(envelope([]))).toEqual([]);
    expect(readCommissionLedger({ ok: true })).toBeNull();
    expect(readCommissionLedger(envelope(null))).toBeNull();
  });

  it("pins the eight canonical state keys", () => {
    expect(Object.keys(COMMISSION_STATE_LABELS)).toEqual(states);
  });

  it.each(states)("preserves the reported %s state without promoting it", (state) => {
    expect(readCommissionLedger(envelope([entry({ state })]))).toEqual([entry({ state })]);
  });

  it.each(["Referred order commission", "Reversal of a referred order commission"])("accepts only the server's static description %s", (description) => {
    expect(readCommissionLedger(envelope([entry({ description })]))?.[0].description).toBe(description);
  });

  it.each([-Number.MAX_SAFE_INTEGER, -1, 0, 1, Number.MAX_SAFE_INTEGER])("preserves signed safe-integer commission cents %s", (commissionCents) => {
    const result = readCommissionLedger(envelope([entry({ commissionCents })]));
    expect(result).toEqual([entry({ commissionCents })]);
    expect(result?.[0].state).toBe("pending");
  });

  it("accepts bounded safe IDs and preserves case-sensitive distinct entries", () => {
    const rows = [
      entry({ id: "0" }), entry({ id: "A".repeat(192) }),
      entry({ id: "Commission-Mixed_Case.1" }), entry({ id: "commission-mixed_case.1" }),
    ];
    expect(readCommissionLedger(envelope(rows))).toEqual(rows);
  });

  it.each(["2026-01-01", "2026-12-31", "2026-02-28", "2024-02-29", "2000-02-29", "2026-04-30"])("accepts real calendar day %s", (date) => {
    expect(readCommissionLedger(envelope([entry({ date })]))?.[0].date).toBe(date);
  });
});

describe("commission ledger schema and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "ledger", [], [entry()], {}, { entries: [] },
    { ok: false, entries: [] }, { ok: "true", entries: [] }, { ok: 1, entries: [] },
    { ok: true, entries: {} }, { ok: true, entries: "none" }, { ok: true, rows: [] },
  ])("rejects malformed envelopes without returning a false empty ledger: %j", (value) => {
    expect(readCommissionLedger(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "entry", [], {}])("rejects malformed entry %j", (value) => {
    expect(readCommissionLedger(envelope([value]))).toBeNull();
  });

  it.each(requiredFields)("requires an own %s entry field", (field) => {
    const missing: Record<string, unknown> = entry();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readCommissionLedger(envelope([missing]))).toBeNull();
    expect(readCommissionLedger(envelope([inherited]))).toBeNull();
  });

  it("requires both envelope keys to be own properties", () => {
    expect(readCommissionLedger(Object.assign(Object.create({ ok: true }), { entries: [] }))).toBeNull();
    expect(readCommissionLedger(Object.assign(Object.create({ entries: [] }), { ok: true }))).toBeNull();
    expect(readCommissionLedger(Object.create(envelope([])))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["name", "Synthetic Person"],
    ["memberId", "synthetic-member"], ["orderId", "synthetic-private-order"],
    ["phone", "synthetic-phone"], ["contact", { email: "person@fixture.invalid" }],
    ["privateMemberOrders", [{ id: "synthetic-private-order" }]],
    ["totalCents", 9999], ["payoutEligible", true], ["currency", "USD"],
  ])("refuses extra %s data at both envelope and entry boundaries", (field, value) => {
    expect(readCommissionLedger({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readCommissionLedger(envelope([entry({ [field as string]: value })]))).toBeNull();
  });

  it("rejects arbitrary or identifying description text rather than displaying it", () => {
    for (const description of [
      "", "Referred order commission ", "referred order commission", "Referred order commission.",
      "Synthetic Person", "person@fixture.invalid", "Commission for order SYNTHETIC-PRIVATE-1",
      "Referred order commission\n", "Referred order commission\u0000", null, 1, {},
    ]) expect(readCommissionLedger(envelope([entry({ description })]))).toBeNull();
  });

  it("rejects unsafe or oversized entry IDs", () => {
    for (const id of [
      "", ".", "..", "_hidden", "-hidden", "nested/id", "nested\\id", "id?query", "id#fragment",
      "id with space", "id%2Fencoded", "id\n", "id\u0000", "é-id", "A".repeat(193), null, 1, {},
    ]) expect(readCommissionLedger(envelope([entry({ id })]))).toBeNull();
  });

  it("never coerces, rounds, or clamps invalid monetary values", () => {
    for (const commissionCents of [
      0.5, -0.5, Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1,
      Number.NaN, Infinity, -Infinity, "1500", "-1500", "0", null, undefined, true, {}, [],
    ]) expect(readCommissionLedger(envelope([entry({ commissionCents })]))).toBeNull();
  });

  it.each([
    "2026-02-29", "2024-02-30", "2026-02-31", "1900-02-29", "2100-02-29",
    "2026-04-31", "2026-09-31", "2026-01-00", "2026-00-01", "2026-13-01",
    "2026-1-01", "2026-01-1", "26-01-01", "02026-01-01", "2026/01/01",
    "2026-09-07T00:00:00Z", " 2026-09-07", "2026-09-07 ", "2026-09-07\n",
    "2026-09-07\r", "2026-09-07\u0000", "not-a-date", "", null, 0, {},
  ])("refuses impossible or noncanonical date %j without normalization", (date) => {
    expect(readCommissionLedger(envelope([entry({ date })]))).toBeNull();
  });

  it("rejects arbitrary states and inherited object-property names", () => {
    for (const state of ["", "PAID", "paid ", "eligible", "unknown", "constructor", "toString", "__proto__", null, 1, {}]) {
      expect(readCommissionLedger(envelope([entry({ state })]))).toBeNull();
    }
  });

  it("rejects duplicate IDs even when amounts, dates, and state differ", () => {
    expect(readCommissionLedger(envelope([
      entry(), entry({ date: "2026-08-01", commissionCents: -1500, state: "reversed" }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the whole ledger if malformed entry %s accompanies a valid entry", (invalidIndex) => {
    const rows: unknown[] = [entry(), entry({ id: "synthetic-second-entry" })];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, commissionCents: "1500" };
    expect(readCommissionLedger(envelope(rows))).toBeNull();
  });
});

describe("commission and wholesale ledgers never merge", () => {
  it.each(["WHITE_LABEL_WHOLESALE", "affiliate_commission", "AFFILIATE_COMMISSION ", "", null, undefined, 1, {}])("refuses another or missing ledger %j", (ledger) => {
    expect(readCommissionLedger(envelope([entry({ ledger })]))).toBeNull();
  });

  it("rejects an entire mixed-ledger response instead of merging or hiding its wholesale entry", () => {
    const affiliate = entry();
    const wholesale = entry({ id: "synthetic-wholesale", ledger: "WHITE_LABEL_WHOLESALE", commissionCents: -1000 });
    expect(readCommissionLedger(envelope([affiliate, wholesale]))).toBeNull();
    expect(readCommissionLedger(envelope([wholesale, affiliate]))).toBeNull();
  });
});

describe("exact commission-cent formatting", () => {
  it.each([
    [Number.MAX_SAFE_INTEGER, "$90,071,992,547,409.91"],
    [-Number.MAX_SAFE_INTEGER, "-$90,071,992,547,409.91"],
    [1, "$0.01"], [-1, "-$0.01"],
    [0, "$0.00"], [-0, "$0.00"],
    [99, "$0.99"], [100, "$1.00"],
    [123456789, "$1,234,567.89"],
    [-123456789, "-$1,234,567.89"],
  ] as const)("formats %s cents without losing a minor unit", (cents, expected) => {
    expect(formatCommissionCents(cents)).toBe(expected);
  });

  it.each([
    Number.NaN, Infinity, -Infinity, 0.5, -0.5,
    Number.MAX_SAFE_INTEGER + 1, -Number.MAX_SAFE_INTEGER - 1,
  ])("refuses to format invalid or unsafe cents %s", (cents) => {
    expect(formatCommissionCents(cents)).toBe("Amount unavailable");
  });
});
