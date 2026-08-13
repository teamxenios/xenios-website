import { describe, expect, it, vi } from "vitest";
import type { CareCapabilityStatus } from "@shared/care/contracts";
import type { TebraPracticeClient, TebraRemotePage } from "./tebra-client";
import type { ReadyTebraConfiguration, TebraConfiguration } from "./tebra-config";
import { createMemoryTebraLinkStore } from "./tebra-link-store";
import { createTebraSyncScheduler, type TebraTimer } from "./tebra-scheduler";

const NOW = new Date("2026-08-12T12:00:00.000Z");

const READY: ReadyTebraConfiguration = {
  state: "ready",
  endpoint: new URL("https://practice.example/soap"),
  username: "integration-user",
  password: "not-a-real-password",
  customerKey: "not-a-real-customer-key",
  practiceId: null,
  pollIntervalMinutes: 10,
  maxPagesPerRun: 5,
  overlapSeconds: 120,
};

const careEnabled = async (): Promise<CareCapabilityStatus> => ({
  rail: "care",
  state: "enabled",
  enabled: true,
  publicMessage: "Care is available in supported locations.",
  checkedAt: NOW.toISOString(),
});

function emptyPage(entity: "patient" | "appointment"): TebraRemotePage {
  return {
    records: [],
    nextCursor: {
      entity,
      fromModifiedAt: NOW.toISOString(),
      toModifiedAt: NOW.toISOString(),
      continuationToken: null,
    },
    hasMore: false,
  };
}

/** A timer that never fires on its own, so each tick happens where the test says. */
function manualTimer() {
  const pending: { handle: number; callback: () => void; delayMs: number }[] = [];
  let next = 1;
  const timer: TebraTimer = {
    schedule(callback, delayMs) {
      const handle = next++;
      pending.push({ handle, callback, delayMs });
      return handle;
    },
    cancel(handle) {
      const index = pending.findIndex((entry) => entry.handle === handle);
      if (index >= 0) pending.splice(index, 1);
    },
  };
  return {
    timer,
    pending,
    fire() {
      const entry = pending.shift();
      entry?.callback();
    },
  };
}

function scheduler(input: {
  config?: TebraConfiguration;
  client?: TebraPracticeClient;
  runOnStart?: boolean;
} = {}) {
  const client =
    input.client ??
    ({
      listPatientsModified: vi.fn(async () => emptyPage("patient")),
      listAppointmentsModified: vi.fn(async () => emptyPage("appointment")),
    } as unknown as TebraPracticeClient);
  const clock = manualTimer();
  const outcomes: unknown[] = [];

  return {
    client,
    clock,
    outcomes,
    scheduler: createTebraSyncScheduler({
      config: input.config ?? READY,
      client,
      links: createMemoryTebraLinkStore(),
      loadCareCapability: careEnabled,
      owner: "worker-a",
      timer: clock.timer,
      runOnStart: input.runOnStart,
      onOutcome: (outcome) => outcomes.push(outcome),
      now: () => NOW,
    }),
  };
}

describe("Sync scheduler", () => {
  it("is inert until it is started", () => {
    const harness = scheduler();
    expect(harness.scheduler.isStarted()).toBe(false);
    expect(harness.clock.pending).toHaveLength(0);
    expect(harness.client.listPatientsModified).not.toHaveBeenCalled();
  });

  it("refuses to schedule a loop that could never run", () => {
    const harness = scheduler({ config: { state: "unconfigured" } });
    expect(harness.scheduler.start()).toBe(false);
    expect(harness.scheduler.isStarted()).toBe(false);
    expect(harness.clock.pending).toHaveLength(0);
  });

  it("waits a full interval before the first pass, so a restart does not stampede", () => {
    const harness = scheduler();
    expect(harness.scheduler.start()).toBe(true);

    expect(harness.clock.pending).toHaveLength(1);
    expect(harness.clock.pending[0].delayMs).toBe(10 * 60_000);
    expect(harness.client.listPatientsModified).not.toHaveBeenCalled();
  });

  it("runs both entities, patients first, and reschedules itself", async () => {
    const harness = scheduler();
    harness.scheduler.start();
    harness.clock.fire();
    await vi.waitFor(() => expect(harness.outcomes).toHaveLength(2));

    expect(harness.client.listPatientsModified).toHaveBeenCalledTimes(1);
    expect(harness.client.listAppointmentsModified).toHaveBeenCalledTimes(1);
    expect(harness.clock.pending).toHaveLength(1);
  });

  it("keeps looping after a pass throws", async () => {
    const exploding = {
      listPatientsModified: vi.fn(async () => {
        throw new Error("tebra_unavailable");
      }),
      listAppointmentsModified: vi.fn(async () => emptyPage("appointment")),
    } as unknown as TebraPracticeClient;

    const harness = scheduler({ client: exploding });
    harness.scheduler.start();
    harness.clock.fire();

    await vi.waitFor(() => expect(harness.clock.pending).toHaveLength(1));
    expect(harness.scheduler.isStarted()).toBe(true);
  });

  it("queues nothing behind a pass that is still running", async () => {
    // The anti-overlap mechanism: the next tick is scheduled only once a pass
    // settles, so a slow practice API cannot make runs pile up the way
    // setInterval would.
    let release: (() => void) | null = null;
    const slow = {
      listPatientsModified: vi.fn(
        () =>
          new Promise<TebraRemotePage>((resolve) => {
            release = () => resolve(emptyPage("patient"));
          }),
      ),
      listAppointmentsModified: vi.fn(async () => emptyPage("appointment")),
    } as unknown as TebraPracticeClient;

    const harness = scheduler({ client: slow, runOnStart: true });
    harness.scheduler.start();
    await vi.waitFor(() => expect(slow.listPatientsModified).toHaveBeenCalledTimes(1));
    expect(harness.clock.pending).toHaveLength(0);

    release?.();
    await vi.waitFor(() => expect(harness.clock.pending).toHaveLength(1));
  });

  it("refuses a manual pass while a scheduled one is still running", async () => {
    // The durable lease admits the same owner twice so a run can renew its own
    // lease, which would let an operator's manual sync overlap the scheduled
    // pass inside one process. This is the guard that stops it.
    let release: (() => void) | null = null;
    const slow = {
      listPatientsModified: vi.fn(
        () =>
          new Promise<TebraRemotePage>((resolve) => {
            release = () => resolve(emptyPage("patient"));
          }),
      ),
      listAppointmentsModified: vi.fn(async () => emptyPage("appointment")),
    } as unknown as TebraPracticeClient;

    const harness = scheduler({ client: slow, runOnStart: true });
    harness.scheduler.start();
    await vi.waitFor(() => expect(slow.listPatientsModified).toHaveBeenCalledTimes(1));

    await expect(harness.scheduler.runOnce()).resolves.toEqual([
      { entity: "patient", skipped: true, reason: "lease_held" },
      { entity: "appointment", skipped: true, reason: "lease_held" },
    ]);
    expect(slow.listPatientsModified).toHaveBeenCalledTimes(1);

    release?.();
    await vi.waitFor(() => expect(harness.outcomes).toHaveLength(2));
  });

  it("stops cleanly and schedules nothing further", async () => {
    const harness = scheduler();
    harness.scheduler.start();
    harness.scheduler.stop();

    expect(harness.scheduler.isStarted()).toBe(false);
    expect(harness.clock.pending).toHaveLength(0);
  });

  it("does not reschedule after a pass that finishes post stop", async () => {
    const harness = scheduler({ runOnStart: true });
    harness.scheduler.start();
    harness.scheduler.stop();

    await vi.waitFor(() => expect(harness.outcomes.length).toBeGreaterThan(0));
    expect(harness.clock.pending).toHaveLength(0);
  });

  it("runOnce is callable directly without starting the loop", async () => {
    const harness = scheduler();
    const outcomes = await harness.scheduler.runOnce();

    expect(outcomes).toHaveLength(2);
    expect(harness.scheduler.isStarted()).toBe(false);
    expect(harness.clock.pending).toHaveLength(0);
  });
});
