import { describe, expect, it, vi } from "vitest";
import { operationsProjectScope, operationsReportFromSnapshot, parseOperationsSnapshot, readOperationsSnapshot,
  OPERATIONS_SNAPSHOT_RPC, type OperationsSnapshot } from "./snapshot";

const window = { start: "2026-11-18T06:00:00.000Z", end: "2026-11-19T06:00:00.000Z" };
const scope = { projectId: "configured-project", environment: "staging" as const };
const response = { population: "request", channel: "portal_published" } as const;
function observed(n = 0) { return { state: "observed" as const, totalRecords: n, windowRecords: n,
  latestAt: n ? "2026-11-18T07:00:00.000Z" : null }; }
function snapshot(): OperationsSnapshot { return { schemaVersion: 1, observedAt: "2026-11-18T15:00:00.000Z",
  windowStart: window.start, windowEnd: window.end,
  sources: { requests: observed(3), workflows: observed(), workflowEvents: observed(), outbox: observed(2), support: observed() } }; }

describe("read-only canonical operations snapshot", () => {
  it("calls one backend RPC with only the UTC window and rejects a failed source", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: snapshot(), error: null });
    expect(await readOperationsSnapshot(window, rpc)).toEqual(snapshot());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith(OPERATIONS_SNAPSHOT_RPC, { p_start_at: window.start, p_end_at: window.end });
    rpc.mockResolvedValueOnce({ data: snapshot(), error: { message: "SENSITIVE UPSTREAM" } });
    await expect(readOperationsSnapshot(window, rpc)).rejects.toThrow("operations_snapshot_unavailable");
  });
  it("refuses window drift, incomplete snapshots, unsafe counts and unsolicited raw fields", () => {
    expect(() => parseOperationsSnapshot({ ...snapshot(), windowStart: "2026-11-17T06:00:00Z" }, window)).toThrow();
    expect(() => parseOperationsSnapshot({ ...snapshot(), contact: { email: "private@example.invalid" } }, window)).toThrow();
    const bad = snapshot(); bad.sources.requests = { ...observed(), totalRecords: Number.MAX_SAFE_INTEGER + 1 };
    expect(() => parseOperationsSnapshot(bad, window)).toThrow();
    bad.sources.requests = { ...observed(1), windowRecords: 2 };
    expect(() => parseOperationsSnapshot(bad, window)).toThrow();
    bad.sources.requests = { ...observed(1), latestAt: "2026-11-19T07:00:00Z" };
    expect(() => parseOperationsSnapshot(bad, window)).toThrow();
  });
  it("keeps unclassified legacy counts separate from all twelve operational values", () => {
    const report = operationsReportFromSnapshot(scope, window, snapshot(), response);
    expect(report).toHaveLength(12);
    expect(report.every(row => row.scope === "authorized_project" && row.value === null && row.freshness === "not_measured")).toBe(true);
    expect(report.find(row => row.metricId === "requests_created")).toMatchObject({
      summary: { unclassifiedRecordCount: 3 }, excludedFixtures: null, sampleSize: null, coverage: null,
    });
    const empty = snapshot(); empty.sources.requests = observed();
    expect(operationsReportFromSnapshot(scope, window, empty, response)[0]).toMatchObject({
      value: null, freshness: "not_measured", summary: { unclassifiedRecordCount: 0 },
    });
  });
  it("does not turn optional-table failure or provider acceptance into a zero or delivered rate", () => {
    const value = snapshot();
    value.sources.workflows = { state: "unavailable", totalRecords: null, windowRecords: null, latestAt: null };
    const report = operationsReportFromSnapshot(scope, window, value, response);
    expect(report.find(row => row.metricId === "open_workload")).toMatchObject({ freshness: "unavailable", value: null });
    expect(report.find(row => row.metricId === "message_delivery")).toMatchObject({ freshness: "not_measured", value: null, evidenceCoverage: null });
    expect(report.find(row => row.metricId === "admission_to_request")).toMatchObject({ value: null, sampleSize: null });
  });
  it("names the configured project without inventing an organization binding", () => {
    expect(operationsProjectScope(scope)).toEqual({ tenantId: "project:configured-project", environment: "staging", scopeKind: "project" });
    expect(() => operationsProjectScope({ ...scope, projectId: "https://untrusted.example" })).toThrow();
  });
});
