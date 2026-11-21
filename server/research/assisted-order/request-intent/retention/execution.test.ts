import { describe, expect, it, vi } from "vitest";
import { retentionExecutionAdapter } from "./execution";

const input = { requestId: "10000000-0000-4000-8000-000000000001", executionId: "20000000-0000-4000-8000-000000000001" };
const evidence = { ...input, status: "erased", erasedAt: "2026-11-18T19:00:00Z", deadlineAt: "2026-11-18T18:00:00Z",
  removedAccessEvents: 2, removedPolicySnapshots: 1, removedRequests: 1 };
describe("explicit durable retention adapter", () => {
  it("forwards identities only, with one call and no policy or lifecycle substitution", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: evidence, error: null });
    expect(await retentionExecutionAdapter({ rpc }).execute(input)).toEqual(evidence);
    expect(rpc.mock.calls).toEqual([["request_intent_retention_execute", {
      p_request_id: input.requestId, p_execution_id: input.executionId,
    }]]);
  });
  it("refuses supplied authority/clock fields before calling SQL", async () => {
    const rpc = vi.fn();
    for (const extra of [{ classification: "unconverted" }, { asOf: "2100-01-01T00:00:00Z" }, { policy: "approved" }]) {
      await expect(retentionExecutionAdapter({ rpc }).execute({ ...input, ...extra })).rejects.toThrow();
    }
    expect(rpc).not.toHaveBeenCalled();
  });
  it("preserves explicit refusal and never retries a transport or serialization failure", async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: { status: "blocked", reason: "disabled" }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: "40001", message: "fixture serialization" } });
    const adapter = retentionExecutionAdapter({ rpc });
    expect(await adapter.execute(input)).toEqual({ status: "blocked", reason: "disabled" });
    await expect(adapter.execute(input)).rejects.toThrow("Retention execution failed.");
    expect(rpc).toHaveBeenCalledTimes(2);
  });
  it("rejects mismatched receipts, invented success, early erasure and raw personal fields", async () => {
    for (const bad of [{ ...evidence, requestId: input.executionId }, { ...evidence, executionId: input.requestId },
      { ...evidence, removedPolicySnapshots: 0 }, { ...evidence, deadlineAt: "2026-11-19T00:00:00Z" },
      { ...evidence, contact: "must not leak" }, { status: "blocked", reason: "unknown" }]) {
      const rpc = vi.fn().mockResolvedValue({ data: bad, error: null });
      await expect(retentionExecutionAdapter({ rpc }).execute(input)).rejects.toThrow();
      expect(rpc).toHaveBeenCalledTimes(1);
    }
  });
});
