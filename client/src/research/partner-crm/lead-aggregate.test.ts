import { describe, expect, it } from "vitest";
import { LEAD_CHANNEL_LABELS, readLeadAggregates } from "./lead-aggregate";

const row = (patch: Record<string, unknown> = {}) => ({ period: "2026-09", channel: "signed_link", leads: 3, ...patch });
const envelope = (rows: unknown = [row()]) => ({ ok: true, rows });

describe("existing partner CRM aggregate projection", () => {
  it("copies only existing aggregate facts and preserves server order", () => {
    const sourceRows = [row({ period: "2026-08", leads: 0 }), row({ channel: "event", leads: 7 })];
    const source = envelope(sourceRows);
    const result = readLeadAggregates(source);
    expect(result).toEqual(source.rows);
    expect(result).not.toBe(source.rows);
    expect(result![0]).not.toBe(sourceRows[0]);
  });
  it("distinguishes an explicit empty result from absent or malformed rows", () => {
    expect(readLeadAggregates(envelope([]))).toEqual([]);
    expect(readLeadAggregates({ ok: true })).toBeNull();
    expect(readLeadAggregates(envelope(null))).toBeNull();
  });
  it.each(Object.keys(LEAD_CHANNEL_LABELS))("accepts only the existing channel %s", (channel) => {
    expect(readLeadAggregates(envelope([row({ channel })]))?.[0].channel).toBe(channel);
  });
  it.each([null, [], {}, { rows: [] }, { ok: false, rows: [] }, { ok: "true", rows: [] }, { ok: true, rows: {} }])
    ("rejects malformed envelopes without inferring empty activity: %j", (value) => {
      expect(readLeadAggregates(value)).toBeNull();
    });
  it.each([-1, 1.5, "3", null, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])
    ("never coerces or rounds invalid event count %s", (leads) => {
      expect(readLeadAggregates(envelope([row({ leads })]))).toBeNull();
    });
  it.each(["2026-00", "2026-13", "2026-9", "2026-09-01", "2026-09\n", "person@fixture.invalid"])
    ("rejects non-month bucket %s", (period) => {
      expect(readLeadAggregates(envelope([row({ period })]))).toBeNull();
    });
  it.each(["network_lead", "recruiter", "person@fixture.invalid", "constructor", "__proto__"])
    ("does not render arbitrary channel/role/identity text %s", (channel) => {
      expect(readLeadAggregates(envelope([row({ channel })]))).toBeNull();
    });
  it("refuses extra contact/identity fields rather than silently retaining them", () => {
    expect(readLeadAggregates({ ...envelope(), email: "person@fixture.invalid" })).toBeNull();
    expect(readLeadAggregates(envelope([row({ memberId: "synthetic-person" })]))).toBeNull();
    expect(readLeadAggregates(envelope([row({ name: "Synthetic Person" })]))).toBeNull();
  });
  it("rejects the entire response if one row is invalid or duplicates a bucket", () => {
    expect(readLeadAggregates(envelope([row(), row({ channel: "bad" })]))).toBeNull();
    expect(readLeadAggregates(envelope([row(), row()]))).toBeNull();
    expect(readLeadAggregates(envelope([null]))).toBeNull();
  });
});
