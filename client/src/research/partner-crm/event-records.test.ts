import { describe, expect, it } from "vitest";
import { EVENT_SCHEDULE_LABELS, prepareEventRequest, readPartnerEventRecords } from "./event-records";

const row = (patch: Record<string, unknown> = {}) => ({
  id: "event-SYNTHETIC_One.1",
  name: "Synthetic Event One",
  date: "2026-09-07",
  location: null,
  status: "scheduled",
  ...patch,
});
const envelope = (events: unknown = [row()]) => ({ ok: true, events });
const requiredFields = ["id", "name", "date", "location", "status"];

describe("reported partner event projection", () => {
  it("copies only reported fields without aliases, mutation, sorting, or deriving event occurrence", () => {
    const sourceRows = Object.freeze([
      Object.freeze(row({ id: "synthetic-later", date: "2026-12-31" })),
      Object.freeze(row({ id: "synthetic-earlier", date: "2024-02-29" })),
      Object.freeze(row({ id: "synthetic-no-date", date: null, status: "not scheduled" })),
    ]);
    const source = Object.freeze(envelope(sourceRows));
    const before = JSON.stringify(source);
    const result = readPartnerEventRecords(source);
    expect(result).toEqual(sourceRows);
    expect(result).not.toBe(sourceRows);
    for (let index = 0; index < sourceRows.length; index++) expect(result![index]).not.toBe(sourceRows[index]);
    expect(result?.map(({ id }) => id)).toEqual(["synthetic-later", "synthetic-earlier", "synthetic-no-date"]);
    expect(Object.keys(result![0])).toEqual(requiredFields);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("accepts an explicit empty list but does not manufacture one for missing source data", () => {
    expect(readPartnerEventRecords(envelope([]))).toEqual([]);
    expect(readPartnerEventRecords({ ok: true })).toBeNull();
    expect(readPartnerEventRecords(envelope(null))).toBeNull();
  });

  it("exposes only schedule facts, not approval, confirmation, or attendance states", () => {
    expect(EVENT_SCHEDULE_LABELS).toEqual({ scheduled: "Scheduled", "not scheduled": "Not scheduled" });
  });

  it.each([
    { date: "2026-09-07", status: "scheduled" },
    { date: null, status: "scheduled" },
    { date: null, status: "not scheduled" },
  ])("preserves permitted source schedule/date combination %j with no inferred venue", (patch) => {
    expect(readPartnerEventRecords(envelope([row(patch)]))).toEqual([row(patch)]);
    expect(readPartnerEventRecords(envelope([row(patch)]))?.[0].location).toBeNull();
  });

  it("does not merge equal event names or dates when source IDs differ", () => {
    const rows = [row(), row({ id: "event-SYNTHETIC_Two.2" })];
    expect(readPartnerEventRecords(envelope(rows))).toEqual(rows);
  });

  it("preserves safe ID and opaque name boundaries and spelling", () => {
    const rows = [
      row({ id: "0", name: " Synthetic Événement • 東京 " }),
      row({ id: "A".repeat(192), name: "N".repeat(200) }),
      row({ id: "Event-Mixed_Case.1", name: "<Synthetic event> / code?value#fragment" }),
      row({ id: "event-mixed_case.1", name: "Synthetic  Event" }),
    ];
    expect(readPartnerEventRecords(envelope(rows))).toEqual(rows);
  });

  it.each([
    "2026-01-01", "2026-12-31", "2026-04-30", "2024-02-29", "2000-02-29", "1900-02-28",
  ])("accepts exact real calendar date %s without promoting a past or future schedule marker", (date) => {
    expect(readPartnerEventRecords(envelope([row({ date })]))).toEqual([row({ date })]);
  });
});

describe("partner event DTO schema and privacy boundary", () => {
  it.each([
    null, undefined, false, 0, "events", [], [row()], {}, { events: [] },
    { ok: false, events: [] }, { ok: "true", events: [] }, { ok: 1, events: [] },
    { ok: true, events: {} }, { ok: true, events: "none" }, { ok: true, events: undefined }, { ok: true, rows: [] },
  ])("rejects malformed envelopes instead of returning a fake empty list: %j", (value) => {
    expect(readPartnerEventRecords(value)).toBeNull();
  });

  it.each([null, undefined, false, 0, "event", [], {}])("rejects malformed row %j", (value) => {
    expect(readPartnerEventRecords(envelope([value]))).toBeNull();
  });

  it("requires own envelope fields", () => {
    expect(readPartnerEventRecords(Object.assign(Object.create({ ok: true }), { events: [] }))).toBeNull();
    expect(readPartnerEventRecords(Object.assign(Object.create({ events: [] }), { ok: true }))).toBeNull();
    expect(readPartnerEventRecords(Object.create(envelope([])))).toBeNull();
  });

  it.each(requiredFields)("requires an own %s field even for nullable source facts", (field) => {
    const missing: Record<string, unknown> = row();
    const inherited = Object.create({ [field]: missing[field] }) as Record<string, unknown>;
    delete missing[field];
    Object.assign(inherited, missing);
    expect(readPartnerEventRecords(envelope([missing]))).toBeNull();
    expect(readPartnerEventRecords(envelope([inherited]))).toBeNull();
  });

  it.each([
    ["email", "person@fixture.invalid"], ["partnerId", "synthetic-partner"], ["memberId", "synthetic-member"],
    ["organizationId", "synthetic-organization"], ["organization", { name: "Synthetic Organization" }],
    ["identity", { name: "Synthetic Person" }], ["token", "synthetic-not-a-token"],
    ["canRequest", true], ["canRegister", true], ["canManage", true], ["approved", true],
    ["confirmed", true], ["attendees", []], ["attendanceCount", 0], ["complete", true],
  ])("refuses extra %s data at envelope and row boundaries", (field, value) => {
    expect(readPartnerEventRecords({ ...envelope(), [field as string]: value })).toBeNull();
    expect(readPartnerEventRecords(envelope([row({ [field as string]: value })]))).toBeNull();
  });

  it.each([
    "", ".", "..", "_hidden", "-hidden", "a/b", "a\\b", "a?b", "a#b", "with space", "a%2Fb",
    "a\n", "a\u0000", "é-id", "A".repeat(193), null, undefined, 1, {}, [],
  ])("rejects unsafe or oversized ID %j without decoding or coercion", (id) => {
    expect(readPartnerEventRecords(envelope([row({ id })]))).toBeNull();
  });

  it.each(["", " ", "\u00a0", "N".repeat(201), null, undefined, false, 0, {}, []])("rejects invalid nonblank bounded name %j", (name) => {
    expect(readPartnerEventRecords(envelope([row({ name })]))).toBeNull();
  });

  it("rejects all C0 controls and DEL embedded in event names", () => {
    for (const code of [...Array.from({ length: 32 }, (_, index) => index), 127]) {
      expect(readPartnerEventRecords(envelope([row({ name: `Synthetic${String.fromCharCode(code)}Event` })]))).toBeNull();
    }
  });

  it.each([undefined, "", "Synthetic venue", "To be confirmed", "Unknown", false, 0, {}, []])("requires literal null location because the source carries no venue: %j", (location) => {
    expect(readPartnerEventRecords(envelope([row({ location })]))).toBeNull();
  });

  it.each([
    "approved", "confirmed", "attended", "completed", "cancelled", "pending", "submitted", "active",
    "Scheduled", "NOT SCHEDULED", "scheduled ", " not scheduled", "toString", "constructor", "__proto__", null, undefined, false, 0, {}, [],
  ])("rejects unknown or noncanonical state %j", (status) => {
    expect(readPartnerEventRecords(envelope([row({ status })]))).toBeNull();
  });

  it.each([
    undefined, "", "2026-02-29", "2024-02-30", "1900-02-29", "2100-02-29", "2026-04-31", "2026-09-31",
    "2026-01-00", "2026-00-01", "2026-13-01", "2026-9-07", "2026-09-7", "26-09-07",
    "2026-09-07T00:00:00Z", "2026/09/07", "2026-09-07 to 2026-09-30", " 2026-09-07", "2026-09-07 ",
    "2026-09-07\n", "2026-09-07\u0000", "not-a-date", false, 0, {}, [],
  ])("rejects noncanonical or impossible date %j", (date) => {
    expect(readPartnerEventRecords(envelope([row({ date })]))).toBeNull();
  });

  it("refuses a dated not-scheduled row rather than silently correcting its state or date", () => {
    expect(readPartnerEventRecords(envelope([row({ date: "2026-09-07", status: "not scheduled" })]))).toBeNull();
  });

  it("rejects duplicate IDs even when names, dates, and schedule facts differ", () => {
    expect(readPartnerEventRecords(envelope([
      row(), row({ name: "Synthetic Other Name", date: null, status: "not scheduled" }),
    ]))).toBeNull();
  });

  it.each([0, 1])("rejects the full response when malformed row %s accompanies a valid row", (invalidIndex) => {
    const rows = [row(), row({ id: "synthetic-second-event" })];
    rows[invalidIndex] = { ...rows[invalidIndex], status: "approved" };
    expect(readPartnerEventRecords(envelope(rows))).toBeNull();
  });
});

describe("existing trim-only event request draft", () => {
  const draft = () => ({ name: "Synthetic Request", date: "2026-09-07", location: "Synthetic Venue", description: "Synthetic proposal text" });

  it("trims the four required fields into a new exact body without mutating frozen input", () => {
    const source = Object.freeze({ name: "  Synthetic Request  ", date: "\t2026-09-07\n", location: " Synthetic Venue ", description: " \nSynthetic proposal text\t " });
    const before = JSON.stringify(source);
    const result = prepareEventRequest(source);
    expect(result).toEqual({ body: draft() });
    expect("body" in result && result.body).not.toBe(source);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each(["name", "date", "location", "description"] as const)("requires nonblank trimmed %s without inventing a value", (field) => {
    for (const blank of ["", " ", "\t\r\n", "\u00a0"]) {
      expect(prepareEventRequest({ ...draft(), [field]: blank })).toEqual({ error: "Please fill in the event name, date, location, and description." });
    }
  });

  it("projects only the four existing request fields, not injected identity, permission, or approval", () => {
    const source = { ...draft(), partnerId: "synthetic-partner", organizationId: "synthetic-organization", approved: true, canRegister: true };
    expect(prepareEventRequest(source)).toEqual({ body: draft() });
  });

  it("adds no new intake length limits to the existing required fields", () => {
    const source = { name: "N".repeat(201), date: "D".repeat(1001), location: "L".repeat(1001), description: "P".repeat(5001) };
    expect(prepareEventRequest(source)).toEqual({ body: source });
  });

  it("does not add date, venue, URL, or internal-whitespace normalization policies", () => {
    const source = {
      name: "Synthetic  event\nrequest",
      date: "After synthetic review / 2026-02-30",
      location: "Synthetic venue\nhttps://fixture.invalid/Path?Token=Ab_C-1#Fragment",
      description: "Synthetic proposal\n  Internal spacing preserved",
    };
    expect(prepareEventRequest(source)).toEqual({ body: source });
  });
});
