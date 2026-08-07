import { describe, expect, it, vi } from "vitest";
import { toReportingRow } from "../../../shared/research/reporting/contracts";
import { createDisabledGoogleSheetsAdapter, GOOGLE_SHEETS_REPORTING_DISABLED_REASON } from "./google-sheets";

describe("disabled Google Sheets reporting adapter", () => {
  it("fails closed without consulting globals or making a network call", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const sink = createDisabledGoogleSheetsAdapter();
    const result = await sink.write(toReportingRow({ schemaVersion: 1, eventId: "11111111-1111-4111-8111-111111111111", occurredAt: "2026-08-02T12:00:00.000Z", kind: "supplier_fulfillment_status", payload: { supplierReference: "22222222-2222-4222-8222-222222222222", fulfillmentReference: "33333333-3333-4333-8333-333333333333", status: "pending" } }));
    expect(result).toEqual({ status: "permanent_failure", reason: GOOGLE_SHEETS_REPORTING_DISABLED_REASON });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
