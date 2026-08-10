/**
 * THE 72-HOUR SHIPPING SLA MONITOR, COMPOSED.
 *
 * `runEarlyAccessShippingSlaSweep` is a pure function over two ports. This file
 * is the whole of the production composition around it: the durable work list
 * (M64's read-only routine), the durable alert sink (the one notification
 * outbox), an in-process interval worker, and a named-admin manual drain. That
 * is deliberately the SAME shape the notification outbox itself already has
 * (`startOutboxWorker` plus `POST /api/admin/research/outbox/run`), because an
 * operator who has learned one of them has learned both.
 *
 * WHAT THE MONITOR CANNOT DO, BY CONSTRUCTION RATHER THAN BY PROMISE.
 *
 * It is handed exactly two ports: a READ and an outbox insert. It holds no
 * checkout store, no settlement store, no fulfilment writer and no supplier
 * port, so there is no expression in this process by which a sweep could
 * settle a payment, move a payment state, create or alter shipment state, or
 * change `paymentVerifiedAt` or `shipByAt`. M64's routine is `stable`, so the
 * read cannot write either.
 *
 * IDEMPOTENT ACROSS RUNS. The event key is derived from the checkout number and
 * the durable ship-by instant, and the outbox's unique index on `event_key` is
 * the claim and the enqueue at once. A second sweep over the same late order
 * inserts nothing and reports nothing new.
 *
 * BUILT ONLY IN THE DURABLE BRANCH. The composition root supplies these ports
 * only when Early Access persistence resolved to `durable`, so a memory or
 * refused deployment has no monitor at all rather than a monitor over a store
 * that forgets. Tests never supply them, so no test starts a timer.
 */

import {
  runEarlyAccessShippingSlaSweep,
  type EarlyAccessShippingAlertSink,
  type EarlyAccessShippingSlaStore,
  type EarlyAccessShippingSlaSweepResult,
} from "./shipping-sla-monitor";

export type EarlyAccessShippingSlaDeps = Readonly<{
  store: EarlyAccessShippingSlaStore;
  alerts: EarlyAccessShippingAlertSink;
}>;

/** Sixty seconds, the same cadence the notification outbox worker runs at. A
 * 72-hour deadline does not need a tighter one, and a looser one would make the
 * manual drain the only responsive path. */
export const EARLY_ACCESS_SHIPPING_SLA_INTERVAL_MS = 60 * 1000;

export type EarlyAccessShippingSlaWorker = Readonly<{
  /** Runs one sweep now. The manual drain and the timer share this exactly. */
  sweep(now?: Date): Promise<EarlyAccessShippingSlaSweepResult>;
  stop(): void;
}>;

/**
 * Start the in-process monitor.
 *
 * The timer is `unref`ed so it can never hold a process open, and the interval
 * handle is captured so a caller (a test, or a shutdown path) can stop it. A
 * sweep that throws is logged and swallowed: a database blip must not take the
 * process down, and the next tick tries again.
 *
 * Nothing is logged about WHICH orders are late. The alert row carries that,
 * behind the admin surface; a process log is not an authenticated surface.
 */
export function startEarlyAccessShippingSlaWorker(
  deps: EarlyAccessShippingSlaDeps,
  options: Readonly<{
    intervalMs?: number;
    log?: (message: string, source?: string) => void;
    now?: () => Date;
  }> = {},
): EarlyAccessShippingSlaWorker {
  const clock = options.now ?? (() => new Date());
  const sweep = (now?: Date) => runEarlyAccessShippingSlaSweep(now ?? clock(), deps);

  const timer = setInterval(() => {
    void sweep().catch((error) => {
      console.error("[ea-shipping-sla] sweep error:", error instanceof Error ? error.message : "unknown");
    });
  }, options.intervalMs ?? EARLY_ACCESS_SHIPPING_SLA_INTERVAL_MS);
  (timer as unknown as { unref?: () => void }).unref?.();

  options.log?.(
    `Early Access shipping SLA monitor started (${
      (options.intervalMs ?? EARLY_ACCESS_SHIPPING_SLA_INTERVAL_MS) / 1000
    }s interval)`,
    "ea-shipping-sla",
  );

  return Object.freeze({
    sweep,
    stop: () => clearInterval(timer),
  });
}

/**
 * The named-admin manual drain, so an operator can run the sweep without
 * waiting for a tick and see exactly what it did.
 *
 * The response is counters only: examined, overdue, alerts, failures. It names
 * no order, so the drain cannot become a second, weaker projection of who is
 * late. That answer lives on the admin order surfaces that already exist.
 */
export function createEarlyAccessShippingSlaSweepAdminRoute(
  deps: Readonly<{ worker: Pick<EarlyAccessShippingSlaWorker, "sweep"> }>,
) {
  return async (
    request: Readonly<{ actor?: Readonly<{ id: string }> | null }>,
    response: Readonly<{
      status(code: number): { json(body: unknown): void };
      setHeader?(name: string, value: string): void;
    }>,
  ): Promise<void> => {
    response.setHeader?.("Cache-Control", "no-store, private, max-age=0");
    response.setHeader?.("Pragma", "no-cache");
    response.setHeader?.("X-Content-Type-Options", "nosniff");
    if (request.actor === null || request.actor === undefined) {
      response.status(401).json({ ok: false, code: "UNAUTHORIZED" });
      return;
    }
    try {
      const summary = await deps.worker.sweep();
      response.status(200).json({ ok: true, summary });
    } catch {
      response.status(503).json({ ok: false, code: "UNAVAILABLE" });
    }
  };
}
