import { describe, expect, it } from "vitest";
import { PAYOUT_STATUS_LABELS, readPayoutRecords } from "./payout-records";

const method = (patch: Record<string, unknown> = {}) => ({ label: "Payout method on file", configured: true, ...patch });
const payout = (patch: Record<string, unknown> = {}) => ({
  id: "payout-SYNTHETIC_One.1",
  date: "2026-09-07",
  amountCents: 15000,
  method: "synthetic_provider-v1",
  status: "built",
  ...patch,
});
const envelope = (payouts: unknown = [payout()], setup: unknown = method()) => ({ ok: true, method: setup, payouts });
const setupCases = [
  { label: "Payout method on file", configured: true },
  { label: "Payout method submitted, awaiting review", configured: false },
  { label: "Payout method needs attention", configured: false },
  { label: "No payout method on file", configured: false },
] as const;
const statuses = ["built", "submitted", "completed", "failed", "cancelled"] as const;
const payoutFields = ["id", "date", "amountCents", "method", "status"];

describe("existing partner payout records projection", () => {
  it("copies exact setup and payout facts without mutating, sorting, or aliasing input", () => {
    const setup = Object.freeze(method());
    const sourcePayouts = Object.freeze([
      Object.freeze(payout({ id: "synthetic-later", date: "2026-09-07", status: "submitted" })),
      Object.freeze(payout({ id: "synthetic-earlier", date: "2026-08-01", amountCents: 0, status: "failed", method: "No provider configured" })),
    ]);
    const source = Object.freeze(envelope(sourcePayouts, setup));
    const before = JSON.stringify(source);
    const result = readPayoutRecords(source);
    expect(result).toEqual({ method: setup, payouts: sourcePayouts });
    expect(result).not.toBe(source);
    expect(result!.method).not.toBe(setup);
    expect(result!.payouts).not.toBe(sourcePayouts);
    for (let index = 0; index < sourcePayouts.length; index++) expect(result!.payouts[index]).not.toBe(sourcePayouts[index]);
    expect(result?.payouts.map(({ id }) => id)).toEqual(["synthetic-later", "synthetic-earlier"]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(setupCases)("accepts the server's exact setup label $label with configured=$configured", (setup) => {
    expect(readPayoutRecords(envelope([], setup))).toEqual({ method: setup, payouts: [] });
  });

  it("distinguishes an explicit empty payout list from missing records", () => {
    expect(readPayoutRecords(envelope([]))).toEqual({ method: method(), payouts: [] });
    expect(readPayoutRecords({ ok: true, method: method() })).toBeNull();
    expect(readPayoutRecords(envelope(null))).toBeNull();
  });

  it("pins the five current payout DTO status keys", () => {
    expect(Object.keys(PAYOUT_STATUS_LABELS)).toEqual(statuses);
  });

  it.each(statuses)("preserves the reported %s status without promoting it based on setup", (status) => {
    const result = readPayoutRecords(envelope([payout({ status })]));
    expect(result?.payouts).toEqual([payout({ status })]);
  });

  it.each([0, 1, Number.MAX_SAFE_INTEGER])("preserves exact nonnegative safe-integer payout cents %s", (amountCents) => {
    expect(readPayoutRecords(envelope([payout({ amountCents })]))?.payouts[0].amountCents).toBe(amountCents);
  });

  it("accepts bounded safe IDs without normalizing case", () => {
    const rows = [
      payout({ id: "0" }), payout({ id: "A".repeat(192) }),
      payout({ id: "Payout-Mixed_Case.1" }), payout({ id: "payout-mixed_case.1" }),
    ];
    expect(readPayoutRecords(envelope(rows))?.payouts).toEqual(rows);
  });

  it.each(["2026-01-01", "2026-12-31", "2026-02-28", "2024-02-29", "2000-02-29", "2026-04-30"])("accepts real calendar date %s", (date) => {
    expect(readPayoutRecords(envelope([payout({ date })]))?.payouts[0].date).toBe(date);
  });

  it.each(["No provider configured", "a", "synthetic_provider-v1", `a${"1".repeat(63)}`])("preserves valid provider description %s", (provider) => {
    expect(readPayoutRecords(envelope([payout({ method: provider })]))?.payouts[0].method).toBe(provider);
  });
});

describe("payout envelope and setup validation", () => {
  it.each([
    null, undefined, false, 0, "payouts", [], {},
    { method: method(), payouts: [] }, { ok: false, method: method(), payouts: [] },
    { ok: "true", method: method(), payouts: [] }, { ok: true, payouts: [] },
    envelope({}), envelope("none"), envelope(false),
  ])("rejects malformed envelopes without inventing empty history: %j", (value) => {
    expect(readPayoutRecords(value)).toBeNull();
  });

  it.each(["ok", "method", "payouts"])("requires envelope.%s to be an own field", (field) => {
    const source: Record<string, unknown> = envelope([]);
    const inherited = Object.create({ [field]: source[field] }) as Record<string, unknown>;
    delete source[field];
    Object.assign(inherited, source);
    expect(readPayoutRecords(inherited)).toBeNull();
  });

  it.each([null, undefined, false, 0, "configured", [], {}])("requires a valid setup object, not %j", (setup) => {
    expect(readPayoutRecords({ ok: true, method: setup, payouts: [] })).toBeNull();
  });

  it.each(["label", "configured"])("requires method.%s as an own field", (field) => {
    const missing: Record<string, unknown> = method();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPayoutRecords(envelope([], missing))).toBeNull();
    expect(readPayoutRecords(envelope([], inherited))).toBeNull();
  });

  it.each(setupCases)("rejects an inconsistent configured flag for $label", ({ label, configured }) => {
    expect(readPayoutRecords(envelope([], { label, configured: !configured }))).toBeNull();
  });

  it("refuses nonboolean configuration and arbitrary or private setup labels", () => {
    for (const configured of [null, undefined, 0, 1, "true", "false", {}, []]) {
      expect(readPayoutRecords(envelope([], method({ configured })))).toBeNull();
    }
    for (const label of [null, undefined, "", "On file", "payout method on file", "Payout method on file ", "Payout method on file\n", "person@fixture.invalid", 1, {}, []]) {
      expect(readPayoutRecords(envelope([], method({ label })))).toBeNull();
    }
  });
});

describe("payout record validation and privacy", () => {
  it.each([null, undefined, false, 0, "payout", [], {}])("refuses malformed payout row %j", (value) => {
    expect(readPayoutRecords(envelope([value]))).toBeNull();
  });

  it.each(payoutFields)("requires each payout's own %s field", (field) => {
    const missing: Record<string, unknown> = payout();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPayoutRecords(envelope([missing]))).toBeNull();
    expect(readPayoutRecords(envelope([inherited]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["name", "Synthetic Person"],
    ["memberId", "synthetic-member"], ["partnerId", "synthetic-partner"],
    ["bankAccount", "synthetic-private-account"], ["routingNumber", "synthetic-routing"],
    ["contact", { email: "person@fixture.invalid" }], ["providerSecret", "synthetic-not-a-secret"],
    ["executionAllowed", true], ["totalCents", 15000],
  ])("refuses extra %s data at envelope, setup, and payout boundaries", (field, value) => {
    expect(readPayoutRecords({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readPayoutRecords(envelope([], method({ [field as string]: value })))).toBeNull();
    expect(readPayoutRecords(envelope([payout({ [field as string]: value })]))).toBeNull();
  });

  it("rejects unsafe, nonstring, or oversized payout IDs", () => {
    for (const id of ["", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb", "a\n", "a\u0000", "é-id", "A".repeat(193), null, 1, {}]) {
      expect(readPayoutRecords(envelope([payout({ id })]))).toBeNull();
    }
  });

  it("rejects invalid amounts without coercing, rounding, or clamping", () => {
    for (const amountCents of [-1, -Number.MAX_SAFE_INTEGER, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, -Infinity, "15000", "0", null, undefined, true, {}, []]) {
      expect(readPayoutRecords(envelope([payout({ amountCents })]))).toBeNull();
    }
  });

  it.each([
    "2026-02-29", "2024-02-30", "2026-02-31", "1900-02-29", "2100-02-29",
    "2026-04-31", "2026-09-31", "2026-01-00", "2026-00-01", "2026-13-01",
    "2026-1-01", "2026-01-1", "26-01-01", "02026-01-01", "2026/01/01",
    "2026-09-07T00:00:00Z", " 2026-09-07", "2026-09-07 ", "2026-09-07\n",
    "2026-09-07\u0000", "not-a-date", "", null, 0, {},
  ])("refuses impossible or noncanonical payout date %j", (date) => {
    expect(readPayoutRecords(envelope([payout({ date })]))).toBeNull();
  });

  it("refuses malformed or identifying provider strings", () => {
    for (const provider of [
      "", "No Provider Configured", "No provider configured ", "on file", "Provider", "0provider", "_provider", "-provider",
      "provider.name", "provider/name", "provider?name", "provider#name", "provider name", "person@fixture.invalid",
      "https://provider.fixture.invalid", "provider\n", "provider\u0000", "p".repeat(65), null, 1, {}, [],
    ]) expect(readPayoutRecords(envelope([payout({ method: provider })]))).toBeNull();
  });

  it("accepts only current DTO states, not raw settled state or inherited property names", () => {
    for (const status of ["settled", "paid", "pending", "COMPLETED", "completed ", "", "constructor", "toString", "__proto__", null, 1, {}]) {
      expect(readPayoutRecords(envelope([payout({ status })]))).toBeNull();
    }
  });

  it("rejects duplicate IDs even if the date, status, or amount differs", () => {
    expect(readPayoutRecords(envelope([
      payout(), payout({ date: "2026-08-01", status: "completed", amountCents: 5000 }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the complete response when malformed payout %s accompanies a valid row", (invalidIndex) => {
    const rows: unknown[] = [payout(), payout({ id: "synthetic-second-payout" })];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, amountCents: -1 };
    expect(readPayoutRecords(envelope(rows))).toBeNull();
  });
});
