import {
  TEBRA_SYNC_ENTITIES,
  type TebraSyncEntity,
  type TebraSyncOutcome,
} from "@shared/care/tebra";
import type { TebraSyncDependencies } from "./tebra-sync";
import { runTebraSyncCycle, tebraSyncOwner } from "./tebra-sync";

/**
 * The periodic driver for the poller.
 *
 * It is inert until start is called, and nothing in this lane calls it. It
 * exists so the integration lane schedules the cycle correctly rather than
 * reaching for setInterval, which is the wrong primitive here: setInterval
 * queues the next tick regardless of whether the previous one finished, so a
 * slow practice API produces overlapping runs that pile up. This reschedules
 * only after a run settles.
 */

export interface TebraTimer {
  schedule(callback: () => void, delayMs: number): unknown;
  cancel(handle: unknown): void;
}

export const systemTebraTimer: TebraTimer = {
  schedule: (callback, delayMs) => setTimeout(callback, delayMs),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export interface TebraSchedulerDependencies extends Omit<TebraSyncDependencies, "audit"> {
  audit?: TebraSyncDependencies["audit"];
  timer?: TebraTimer;
  /** Reports each outcome. Counts only; the summary carries nothing identifying. */
  onOutcome?: (outcome: TebraSyncOutcome) => void;
  /** Run one pass as soon as start is called. Off by default, so a restart does not stampede. */
  runOnStart?: boolean;
}

export interface TebraSyncScheduler {
  /** Returns false when configuration is not ready, so a dead loop is never scheduled. */
  start(): boolean;
  stop(): void;
  isStarted(): boolean;
  /** One pass over both entities, patients first. Safe to call directly. */
  runOnce(): Promise<TebraSyncOutcome[]>;
}

export function createTebraSyncScheduler(
  deps: TebraSchedulerDependencies,
): TebraSyncScheduler {
  const timer = deps.timer ?? systemTebraTimer;
  let handle: unknown = null;
  let started = false;
  let inFlight = false;

  /**
   * A cheap in-process guard so a redundant pass does not even reach the store.
   * Separation itself is the durable lease's job: the scheduled and manual
   * triggers hold distinct owners, so the lease refuses the second one whether
   * it starts in this process or another.
   */
  async function runOnce(): Promise<TebraSyncOutcome[]> {
    if (inFlight) {
      return (TEBRA_SYNC_ENTITIES as readonly TebraSyncEntity[]).map((entity) => ({
        entity,
        skipped: true as const,
        reason: "lease_held" as const,
      }));
    }

    inFlight = true;
    try {
      // Patients first: an appointment is refused until its patient is linked.
      const outcomes: TebraSyncOutcome[] = [];
      for (const entity of TEBRA_SYNC_ENTITIES as readonly TebraSyncEntity[]) {
        const outcome = await runTebraSyncCycle({
          entity,
          config: deps.config,
          client: deps.client,
          links: deps.links,
          loadCareCapability: deps.loadCareCapability,
          owner: tebraSyncOwner(deps.owner, "scheduled"),
          audit: deps.audit,
          now: deps.now,
        });
        outcomes.push(outcome);
        deps.onOutcome?.(outcome);
      }
      return outcomes;
    } finally {
      inFlight = false;
    }
  }

  function scheduleNext(): void {
    if (!started || deps.config.state !== "ready") return;
    handle = timer.schedule(() => {
      void tick();
    }, deps.config.pollIntervalMinutes * 60_000);
  }

  async function tick(): Promise<void> {
    try {
      await runOnce();
    } catch {
      // A failed pass must not end the loop. The cycle already reports its own
      // failures, and the next window reaches back over anything missed.
    } finally {
      // Rescheduled only once a pass has settled, so the loop can never queue
      // a second pass behind a slow one the way setInterval would.
      scheduleNext();
    }
  }

  return {
    start() {
      if (started) return true;
      if (deps.config.state !== "ready") return false;
      started = true;
      if (deps.runOnStart) {
        void tick();
      } else {
        scheduleNext();
      }
      return true;
    },
    stop() {
      started = false;
      if (handle !== null) timer.cancel(handle);
      handle = null;
    },
    isStarted: () => started,
    runOnce,
  };
}
