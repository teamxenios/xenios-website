import { describe, expect, it, vi } from "vitest";
import {
  DEFAULT_TEBRA_RETRY_POLICY,
  runWithTebraRetry,
  tebraRetryDelayMs,
} from "./tebra-retry";

describe("Retry schedule", () => {
  it("backs off exponentially and stops widening at the ceiling", () => {
    const policy = { maxAttempts: 5, baseDelayMs: 250, maxDelayMs: 2_000 };
    expect([1, 2, 3, 4, 5].map((attempt) => tebraRetryDelayMs(attempt, policy))).toEqual([
      250, 500, 1_000, 2_000, 2_000,
    ]);
  });

  it("is deterministic, so a retry test proves the same thing twice", () => {
    expect(tebraRetryDelayMs(2, DEFAULT_TEBRA_RETRY_POLICY)).toBe(
      tebraRetryDelayMs(2, DEFAULT_TEBRA_RETRY_POLICY),
    );
  });
});

describe("Bounded retry", () => {
  it("returns on the first success without sleeping", async () => {
    const sleep = vi.fn(async () => undefined);
    await expect(
      runWithTebraRetry(async () => "value", { sleep }),
    ).resolves.toEqual({ ok: true, value: "value", attempts: 1 });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("sleeps between attempts and reports how many it took", async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi
      .fn<[], Promise<string>>()
      .mockRejectedValueOnce(new Error("tebra_unavailable"))
      .mockRejectedValueOnce(new Error("tebra_unavailable"))
      .mockResolvedValue("value");

    await expect(runWithTebraRetry(operation, { sleep })).resolves.toEqual({
      ok: true,
      value: "value",
      attempts: 3,
    });
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([250, 500]);
  });

  it("stops immediately on a failure another attempt cannot fix", async () => {
    const sleep = vi.fn(async () => undefined);
    const operation = vi.fn(async () => {
      throw new Error("tebra_invalid_payload");
    });

    await expect(runWithTebraRetry(operation, { sleep })).resolves.toEqual({
      ok: false,
      code: "tebra_invalid_payload",
      retryable: false,
      attempts: 1,
    });
    expect(sleep).not.toHaveBeenCalled();
  });

  it("honours the attempt ceiling", async () => {
    const operation = vi.fn(async () => {
      throw new Error("tebra_unavailable");
    });

    const outcome = await runWithTebraRetry(operation, {
      policy: { maxAttempts: 2, baseDelayMs: 1, maxDelayMs: 1 },
      sleep: async () => undefined,
    });

    expect(outcome).toEqual({
      ok: false,
      code: "tebra_unavailable",
      retryable: true,
      attempts: 2,
    });
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("never reveals what the upstream call said", async () => {
    const outcome = await runWithTebraRetry(
      async () => {
        throw new Error("SOAP fault: patient Jane Doe 1974-03-02");
      },
      { policy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 } },
    );

    expect(JSON.stringify(outcome)).not.toContain("Jane Doe");
    expect(outcome).toMatchObject({ ok: false, code: "tebra_unavailable" });
  });
});
