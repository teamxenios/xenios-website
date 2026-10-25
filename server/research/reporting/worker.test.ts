import { describe, expect, it, vi } from "vitest";
import type { ReportingQueue, ReportingSink } from "./port";
import { runReportingWorker } from "./worker";

const DELIVERY_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const event = { schemaVersion: 1 as const, eventId: EVENT_ID, occurredAt: "2026-08-02T12:00:00.000Z", kind: "partner_referral_status" as const, payload: { partnerReference: "22222222-2222-4222-8222-222222222222", referralReference: "33333333-3333-4333-8333-333333333333", status: "received" as const } };
function queue(attempt = 1): ReportingQueue & Record<string, ReturnType<typeof vi.fn>> {
  return { claim: vi.fn(async () => [{ deliveryId: DELIVERY_ID, event, attempt }]), acknowledge: vi.fn(async () => undefined), retry: vi.fn(async () => undefined), deadLetter: vi.fn(async () => undefined) };
}

describe("reporting worker", () => {
  it.each(["written", "already_present"] as const)("acknowledges %s idempotently", async (status) => {
    const q = queue(); const sink: ReportingSink = { write: vi.fn(async () => ({ status })) };
    const summary = await runReportingWorker(q, sink);
    expect(q.acknowledge).toHaveBeenCalledWith(DELIVERY_ID);
    expect(summary).toMatchObject(status === "written" ? { delivered: 1, reconciled: 0 } : { delivered: 0, reconciled: 1 });
  });

  it("uses bounded exponential retry without leaking the event into the reason", async () => {
    const q = queue(1); const sink: ReportingSink = { write: vi.fn(async () => ({ status: "retryable_failure", reason: "temporary" })) };
    await runReportingWorker(q, sink, { batchSize: 1, maxAttempts: 3, baseRetryDelayMs: 500 });
    expect(q.retry).toHaveBeenCalledWith(DELIVERY_ID, 1, 500, "reporting_sink_retryable_failure");
  });

  it("dead-letters permanent failures and exhausted retries", async () => {
    const q1 = queue();
    await runReportingWorker(q1, { write: async () => ({ status: "permanent_failure", reason: "disabled" }) });
    expect(q1.deadLetter).toHaveBeenCalledWith(DELIVERY_ID, 1, "reporting_sink_permanent_failure");
    const q2 = queue(3);
    await runReportingWorker(q2, { write: async () => ({ status: "retryable_failure", reason: "temporary" }) }, { batchSize: 1, maxAttempts: 3, baseRetryDelayMs: 1 });
    expect(q2.deadLetter).toHaveBeenCalledWith(DELIVERY_ID, 3, "reporting_sink_retry_exhausted");
  });

  it("turns thrown sink errors into bounded retries", async () => {
    const q = queue();
    await runReportingWorker(q, { write: async () => { throw new Error("PRIVATE provider body"); } });
    expect(q.retry).toHaveBeenCalledWith(DELIVERY_ID, 1, 1_000, "reporting_sink_retryable_failure");
  });

  it("dead-letters malformed runtime events without calling the sink", async () => {
    const q = queue();
    q.claim.mockResolvedValue([{ deliveryId: DELIVERY_ID, event: { ...event, payload: { ...event.payload, email: "PRIVATE@example.com" } }, attempt: 1 }]);
    const write = vi.fn(async () => ({ status: "written" as const }));
    await runReportingWorker(q, { write });
    expect(write).not.toHaveBeenCalled();
    expect(q.deadLetter).toHaveBeenCalledWith(DELIVERY_ID, 1, "invalid_reporting_event");
  });

  it("refuses unsafe worker bounds before claiming work", async () => {
    const q = queue();
    await expect(runReportingWorker(q, { write: async () => ({ status: "written" }) }, { batchSize: 101, maxAttempts: 3, baseRetryDelayMs: 1 })).rejects.toThrow("batchSize");
    expect(q.claim).not.toHaveBeenCalled();
  });

  it("rejects malformed and duplicate queue projections before provider work", async () => {
    const q = queue();
    const write = vi.fn(async () => ({ status: "written" as const }));
    q.claim.mockResolvedValue([{ deliveryId: "not-a-uuid", event, attempt: 1 }]);
    await expect(runReportingWorker(q, { write })).rejects.toThrow("invalid delivery");
    q.claim.mockResolvedValue([
      { deliveryId: DELIVERY_ID, event, attempt: 1 },
      { deliveryId: DELIVERY_ID.toUpperCase(), event, attempt: 1 },
    ]);
    await expect(runReportingWorker(q, { write })).rejects.toThrow("duplicate delivery");
    expect(write).not.toHaveBeenCalled();
  });

  it("reconciles a lost acknowledgement by replaying the same provider idempotency identity", async () => {
    const q = queue();
    q.acknowledge.mockRejectedValueOnce(new Error("response lost")).mockResolvedValueOnce(undefined);
    const written = new Set<string>();
    const write = vi.fn(async (row) => {
      if (written.has(row.eventId)) return { status: "already_present" as const };
      written.add(row.eventId);
      return { status: "written" as const };
    });
    await expect(runReportingWorker(q, { write })).rejects.toThrow("response lost");
    const replay = await runReportingWorker(q, { write });
    expect(replay).toMatchObject({ delivered: 0, reconciled: 1 });
    expect(write).toHaveBeenCalledTimes(2);
    expect(written).toEqual(new Set([EVENT_ID]));
    expect(q.acknowledge).toHaveBeenLastCalledWith(DELIVERY_ID);
  });

  it("does not leak provider reasons into durable queue commands", async () => {
    const q = queue();
    await runReportingWorker(q, { write: async () => ({ status: "retryable_failure", reason: "PRIVATE provider payload" }) });
    const serialized = JSON.stringify(q.retry.mock.calls);
    expect(serialized).not.toContain("PRIVATE");
    expect(serialized).toContain("reporting_sink_retryable_failure");
  });
});
