import { describe, expect, it } from "vitest";
import { parseReportingEvent, reportingEventKinds, toReportingRow } from "./contracts";

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const PARTNER_ID = "22222222-2222-4222-8222-222222222222";
const REFERRAL_ID = "33333333-3333-4333-8333-333333333333";
const event = { schemaVersion: 1, eventId: EVENT_ID, occurredAt: "2026-08-02T07:00:00-05:00", kind: "partner_referral_status", payload: { partnerReference: PARTNER_ID, referralReference: REFERRAL_ID, status: "received" } } as const;

describe("sanitized reporting contracts", () => {
  it("has a fixed version and finite event vocabulary", () => {
    expect(reportingEventKinds).toEqual(["partner_referral_status", "supplier_fulfillment_status", "inventory_reconciliation_summary"]);
    expect(parseReportingEvent(event)).toEqual({ ...event, occurredAt: "2026-08-02T12:00:00.000Z" });
  });

  it("projects only the fixed reporting columns", () => {
    expect(toReportingRow(event)).toEqual({ schemaVersion: 1, eventId: EVENT_ID, occurredAt: "2026-08-02T12:00:00.000Z", kind: event.kind, referenceA: PARTNER_ID, referenceB: REFERRAL_ID, status: "received", matchedLines: null, mismatchedLines: null });
  });

  it.each(["email", "name", "phone", "address", "token", "secret", "wholesaleCost", "clinicalNotes"])("rejects forbidden or unknown field %s", (field) => {
    expect(() => parseReportingEvent({ ...event, payload: { ...event.payload, [field]: `PRIVATE_${field}` } })).toThrow();
  });

  it("rejects unknown versions, malformed timestamps, negative counts, and extra envelope fields", () => {
    expect(() => parseReportingEvent({ ...event, schemaVersion: 2 })).toThrow();
    expect(() => parseReportingEvent({ ...event, occurredAt: "today" })).toThrow();
    expect(() => parseReportingEvent({ ...event, privateMarker: "PRIVATE" })).toThrow();
    expect(() => parseReportingEvent({ schemaVersion: 1, eventId: "44444444-4444-4444-8444-444444444444", occurredAt: event.occurredAt, kind: "inventory_reconciliation_summary", payload: { supplierReference: PARTNER_ID, reconciliationReference: REFERRAL_ID, matchedLines: -1, mismatchedLines: 0 } })).toThrow();
  });

  it("rejects encoded identifiers, free-form references, and non-UUID event identity", () => {
    for (const unsafe of ["partner_1", "cHJpdmF0ZUBleGFtcGxlLmNvbQ==", "private@example.com", "../private"]) {
      expect(() => parseReportingEvent({ ...event, eventId: unsafe })).toThrow();
      expect(() => parseReportingEvent({ ...event, payload: { ...event.payload, partnerReference: unsafe } })).toThrow();
    }
  });
});
