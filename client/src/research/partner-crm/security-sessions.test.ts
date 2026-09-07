import { describe, expect, it } from "vitest";
import { readPartnerSecuritySessions } from "./security-sessions";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "session-SYNTHETIC_One.1",
  startedAt: "2026-09-07T12:34:56.123Z",
  device: "Synthetic Browser",
  approximateLocation: "Synthetic Region",
  current: false,
  ...patch,
});
const envelope = (sessions: unknown = [row()]) => ({ ok: true, sessions });
const requiredFields = ["id", "startedAt", "device", "approximateLocation", "current"];

describe("reported partner security-session projection", () => {
  it("copies only the reported fields without mutation, aliases, sorting, or current-browser inference", () => {
    const sourceRows = Object.freeze([
      Object.freeze(row({ id: "synthetic-later", startedAt: "2026-09-07T12:34:56Z", current: false })),
      Object.freeze(row({ id: "synthetic-earlier", startedAt: "2026-08-01T01:02:03+05:30", device: null, approximateLocation: null, current: true })),
    ]);
    const source = Object.freeze(envelope(sourceRows));
    const before = JSON.stringify(source);
    const result = readPartnerSecuritySessions(source);
    expect(result).toEqual(sourceRows);
    expect(result).not.toBe(sourceRows);
    for (let index = 0; index < sourceRows.length; index++) expect(result![index]).not.toBe(sourceRows[index]);
    expect(result?.map(({ id }) => id)).toEqual(["synthetic-later", "synthetic-earlier"]);
    expect(result?.map(({ current }) => current)).toEqual([false, true]);
    expect(Object.keys(result![0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("distinguishes empty reported history from missing history without adding a browser session", () => {
    expect(readPartnerSecuritySessions(envelope([]))).toEqual([]);
    expect(readPartnerSecuritySessions({ ok: true })).toBeNull();
    expect(readPartnerSecuritySessions(envelope(null))).toBeNull();
  });

  it.each([
    { device: null, approximateLocation: null },
    { device: "Synthetic Browser", approximateLocation: null },
    { device: null, approximateLocation: "Synthetic Region" },
    { device: "Synthetic Browser", approximateLocation: "Synthetic Region" },
  ])("preserves independently nullable device/location facts %j", (patch) => {
    expect(readPartnerSecuritySessions(envelope([row(patch)]))).toEqual([row(patch)]);
  });

  it.each([true, false])("preserves the exact reported current flag %s", (current) => {
    expect(readPartnerSecuritySessions(envelope([row({ current })]))?.[0].current).toBe(current);
  });

  it("does not choose a current browser when multiple source rows are reported current", () => {
    const rows = [row({ id: "synthetic-first", current: true }), row({ id: "synthetic-second", current: true })];
    expect(readPartnerSecuritySessions(envelope(rows))).toEqual(rows);
  });

  it("preserves safe ID and nullable-label boundaries and spelling", () => {
    const rows = [
      row({ id: "0", device: " Synthetic Browser • Exact ", approximateLocation: " Synthetic Region " }),
      row({ id: "A".repeat(192), device: "D".repeat(200), approximateLocation: "L".repeat(200) }),
      row({ id: "Session-Mixed_Case.1" }), row({ id: "session-mixed_case.1" }),
    ];
    expect(readPartnerSecuritySessions(envelope(rows))).toEqual(rows);
  });

  it.each([
    "2026-09-07T12:34:56Z",
    "2026-09-07T12:34:56.1Z",
    "2026-09-07T12:34:56.12Z",
    "2026-09-07T12:34:56.123Z",
    "2026-09-07T12:34:56.000Z",
    "2026-09-07T12:34:56+00:00",
    "2026-09-07T12:34:56-00:00",
    "2026-09-07T12:34:56.1+05:30",
    "2026-09-07T12:34:56.12-06:00",
    "2026-09-07T12:34:56.123+14:00",
    "2026-09-07T12:34:56+23:59",
    "2026-09-07T12:34:56-23:59",
    "2026-01-01T00:15:00+05:30",
    "2026-12-31T23:59:59-05:00",
    "2024-02-29T00:00:00Z",
    "2000-02-29T23:59:59.999Z",
  ])("accepts an exact zoned timestamp without normalizing it: %s", (startedAt) => {
    expect(readPartnerSecuritySessions(envelope([row({ startedAt })]))?.[0].startedAt).toBe(startedAt);
  });
});

describe("partner session DTO schema and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "sessions", [], [row()], {}, { sessions: [] },
    { ok: false, sessions: [] }, { ok: "true", sessions: [] }, { ok: 1, sessions: [] },
    { ok: true, sessions: {} }, { ok: true, sessions: "none" }, { ok: true, rows: [] },
  ])("rejects malformed envelopes without fabricating empty history: %j", (value) => {
    expect(readPartnerSecuritySessions(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "session", [], {}])("rejects malformed session row %j", (value) => {
    expect(readPartnerSecuritySessions(envelope([value]))).toBeNull();
  });

  it("requires own ok and sessions envelope fields", () => {
    expect(readPartnerSecuritySessions(Object.assign(Object.create({ ok: true }), { sessions: [] }))).toBeNull();
    expect(readPartnerSecuritySessions(Object.assign(Object.create({ sessions: [] }), { ok: true }))).toBeNull();
    expect(readPartnerSecuritySessions(Object.create(envelope([])))).toBeNull();
  });

  it.each(requiredFields)("requires an own %s on every row, including nullable labels", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPartnerSecuritySessions(envelope([missing]))).toBeNull();
    expect(readPartnerSecuritySessions(envelope([inherited]))).toBeNull();
  });

  it.each([
    ["accessToken", "synthetic-not-a-token"], ["refreshToken", "synthetic-not-a-refresh-token"],
    ["authorization", "synthetic-not-an-authorization"], ["cookie", "synthetic-not-a-cookie"],
    ["email", "person@fixture.invalid"], ["memberId", "synthetic-member"],
    ["partnerId", "synthetic-partner"], ["identity", { name: "Synthetic Person" }],
    ["ipAddress", "192.0.2.1"], ["canRevoke", true], ["sourceReady", true], ["complete", true],
  ])("refuses extra %s data at envelope and row boundaries", (field, value) => {
    expect(readPartnerSecuritySessions({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readPartnerSecuritySessions(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it("rejects unsafe or oversized identifiers without decoding or coercing", () => {
    for (const id of ["", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb", "a\n", "a\u0000", "é-id", "A".repeat(193), null, 1, {}, []]) {
      expect(readPartnerSecuritySessions(envelope([row({ id })]))).toBeNull();
    }
  });

  it.each(["device", "approximateLocation"])("requires null or a bounded nonblank label for %s", (field) => {
    for (const value of [undefined, "", "   ", "X".repeat(201), "synthetic\ntext", "synthetic\rtext", "synthetic\ttext", "synthetic\u0000text", "synthetic\u001ftext", "synthetic\u007ftext", false, 0, {}, []]) {
      expect(readPartnerSecuritySessions(envelope([row({ [field]: value })]))).toBeNull();
    }
  });

  it("does not coerce current from truthy or falsey nonboolean values", () => {
    for (const current of [null, undefined, 0, 1, -1, "true", "false", "", {}, [], Number.NaN]) {
      expect(readPartnerSecuritySessions(envelope([row({ current })]))).toBeNull();
    }
  });

  it.each([
    "2026-02-29T12:00:00Z", "2024-02-30T12:00:00Z", "1900-02-29T12:00:00Z", "2100-02-29T12:00:00Z",
    "2026-04-31T12:00:00Z", "2026-09-31T12:00:00Z", "2026-01-00T12:00:00Z", "2026-00-01T12:00:00Z", "2026-13-01T12:00:00Z",
    "2026-09-07T24:00:00Z", "2026-09-07T25:00:00Z", "2026-09-07T12:60:00Z", "2026-09-07T12:00:60Z",
    "2026-09-07T12:00:00+24:00", "2026-09-07T12:00:00-24:00", "2026-09-07T12:00:00+00:60", "2026-09-07T12:00:00-06:60",
    "2026-09-07T12:00:00+05", "2026-09-07T12:00:00+0530", "2026-09-07T12:00:00+5:30",
    "2026-09-07T12:00:00", "2026-09-07", "2026-09-07 12:00:00Z", "2026-09-07t12:00:00Z", "2026-09-07T12:00:00z",
    "2026-9-07T12:00:00Z", "2026-09-7T12:00:00Z", "2026-09-07T1:00:00Z", "2026-09-07T12:0:00Z", "2026-09-07T12:00:0Z",
    "2026-09-07T12:00:00.Z", "2026-09-07T12:00:00.1234Z", "2026-09-07T12:00:00.1234+05:30", "2026-09-07T12:00:00,123Z",
    " 2026-09-07T12:00:00Z", "2026-09-07T12:00:00Z ", "2026-09-07T12:00:00Z\n", "2026-09-07T12:00:00Z\u0000",
    "not-a-timestamp", "", null, 0, {},
  ])("rejects impossible or noncanonical timestamp %j", (startedAt) => {
    expect(readPartnerSecuritySessions(envelope([row({ startedAt })]))).toBeNull();
  });

  it("rejects duplicate session IDs even if their timestamps and current flags differ", () => {
    expect(readPartnerSecuritySessions(envelope([
      row(), row({ startedAt: "2026-08-01T00:00:00Z", current: true }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the full response when malformed row %s accompanies a valid row", (invalidIndex) => {
    const rows: unknown[] = [row(), row({ id: "synthetic-second-session" })];
    rows[invalidIndex] = { ...rows[invalidIndex] as object, current: "true" };
    expect(readPartnerSecuritySessions(envelope(rows))).toBeNull();
  });
});
