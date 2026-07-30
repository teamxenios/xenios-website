import { afterEach, describe, expect, it, vi } from "vitest";
import type { TrackerObservationInput } from "@shared/research/member-platform";
import {
  getTrackerProgress,
  recordTrackerObservation,
} from "./tracker";

const TOKEN = "member-token";
const INPUT: TrackerObservationInput = {
  metricKey: "sleep_and_recovery",
  recordedAt: "2026-07-30T15:00:00.000Z",
  timezone: "America/Chicago",
  unit: "hours",
  value: 7.5,
  notes: "Rested",
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubJson(status: number, body: unknown) {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string, init?: RequestInit) => {
      calls.push({ path, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }),
  );
  return calls;
}

describe("tracker adapter", () => {
  it.each([7, 30, 90] as const)(
    "reads the canonical %d-day tracker window with one bearer prefix",
    async (windowDays) => {
      const calls = stubJson(200, {
        ok: true,
        progress: { unlocked: true, windowDays, metrics: [] },
      });

      const result = await getTrackerProgress(windowDays, TOKEN);

      expect(result.kind).toBe("ok");
      expect(calls).toHaveLength(1);
      expect(calls[0]?.path).toBe(
        `/api/research/tracker?windowDays=${windowDays}`,
      );
      expect(calls[0]?.init?.method).toBe("GET");
      expect(
        (calls[0]?.init?.headers as Record<string, string>).Authorization,
      ).toBe(`Bearer ${TOKEN}`);
    },
  );

  it("posts the shared observation input to the canonical tracker endpoint", async () => {
    const calls = stubJson(200, {
      ok: true,
      observation: {
        observationId: "observation-1",
        metricKey: INPUT.metricKey,
        source: "manual",
        recordedAt: INPUT.recordedAt,
        timezone: INPUT.timezone,
        unit: INPUT.unit,
        originalValue: INPUT.value,
        normalizedValue: INPUT.value,
        confidence: "high",
        notes: INPUT.notes,
        planId: null,
        createdAt: INPUT.recordedAt,
      },
    });

    const result = await recordTrackerObservation(INPUT, TOKEN);

    expect(result.kind).toBe("ok");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.path).toBe("/api/research/tracker");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(
      (calls[0]?.init?.headers as Record<string, string>).Authorization,
    ).toBe(`Bearer ${TOKEN}`);
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual(INPUT);
  });

  it("fails closed on malformed, mismatched, or duplicate tracker progress", async () => {
    const marker = "HOSTILE_PRIVATE_TRACKER_MARKER";
    const observation = {
      observationId: "observation-1",
      metricKey: "sleep_and_recovery",
      source: "manual",
      recordedAt: INPUT.recordedAt,
      timezone: INPUT.timezone,
      unit: INPUT.unit,
      originalValue: INPUT.value,
      normalizedValue: INPUT.value,
      confidence: "high",
      notes: INPUT.notes,
      planId: null,
      createdAt: INPUT.recordedAt,
    };
    const metric = {
      metricKey: "sleep_and_recovery",
      textSummary: "One entry",
      observations: [observation],
    };
    const malformedBodies = [
      { ok: true, progress: { unlocked: true, windowDays: 90, metrics: [] } },
      {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [{ ...metric, metricKey: marker }],
        },
      },
      {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [metric, metric],
        },
      },
      {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [{ ...metric, textSummary: { marker } }],
        },
      },
      {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [
            {
              ...metric,
              observations: [
                { ...observation, metricKey: "plan_adherence", notes: marker },
              ],
            },
          ],
        },
      },
      {
        ok: true,
        progress: {
          unlocked: true,
          windowDays: 30,
          metrics: [
            {
              ...metric,
              observations: [
                { ...observation, originalValue: { marker } },
              ],
            },
          ],
        },
      },
    ];

    for (const body of malformedBodies) {
      stubJson(200, body);
      const result = await getTrackerProgress(30, TOKEN);
      expect(result).toMatchObject({
        kind: "error",
        code: "invalid_tracker_response",
      });
      expect(JSON.stringify(result)).not.toContain(marker);
    }
  });

  it("fails closed when the saved observation is malformed or for another metric", async () => {
    const marker = "HOSTILE_SAVED_OBSERVATION_MARKER";
    stubJson(200, {
      ok: true,
      observation: {
        observationId: "observation-2",
        metricKey: "plan_adherence",
        source: "manual",
        recordedAt: INPUT.recordedAt,
        timezone: INPUT.timezone,
        unit: null,
        originalValue: marker,
        normalizedValue: null,
        confidence: "high",
        notes: null,
        planId: null,
        createdAt: INPUT.recordedAt,
      },
    });

    const result = await recordTrackerObservation(INPUT, TOKEN);

    expect(result).toMatchObject({
      kind: "error",
      code: "invalid_tracker_response",
    });
    expect(JSON.stringify(result)).not.toContain(marker);
  });

  it.each([
    [401, { ok: false, code: "recovery_session" }, "unauthorized"],
    [403, { ok: false, code: "membership_inactive" }, "denied"],
    [404, { ok: false }, "unavailable"],
    [503, { ok: false }, "unavailable"],
    [500, { ok: false, message: "failed" }, "error"],
  ] as const)(
    "maps HTTP %d to %s without inventing tracker data",
    async (status, body, expectedKind) => {
      stubJson(status, body);
      const result = await getTrackerProgress(30, TOKEN);
      expect(result.kind).toBe(expectedKind);
    },
  );

  it("does not add an authorization header without a token", async () => {
    const calls = stubJson(200, {
      ok: true,
      progress: { unlocked: false, windowDays: 30, metrics: [] },
    });

    await getTrackerProgress(30, null);

    expect(
      (calls[0]?.init?.headers as Record<string, string>).Authorization,
    ).toBeUndefined();
  });
});
