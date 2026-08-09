import { describe, expect, it } from "vitest";
import {
  earlyAccessShippingOverdueEventKey,
  runEarlyAccessShippingSlaSweep,
} from "./shipping-sla-monitor";

describe("Early Access 72-hour shipping SLA sweep", () => {
  it("uses one durable unique enqueue and emits one deterministic alert across retries", async () => {
    const claimed = new Set<string>();
    const enqueued: string[] = [];
    const deps = {
      store: {
        async dueBy() {
          return [
            {
              cartCheckoutNumber: "XEC-1234567890ABCDEF",
              shipByAt: "2026-08-12T01:00:00.000Z",
              stage: "processing" as const,
            },
          ];
        },
      },
      alerts: {
        async enqueue(input: { eventKey: string }) {
          if (claimed.has(input.eventKey)) return false;
          claimed.add(input.eventKey);
          enqueued.push(input.eventKey);
          return true;
        },
      },
    };
    const first = await runEarlyAccessShippingSlaSweep(
      new Date("2026-08-12T01:00:00.001Z"),
      deps,
    );
    const retry = await runEarlyAccessShippingSlaSweep(
      new Date("2026-08-12T02:00:00.000Z"),
      deps,
    );
    expect(first.alertsEnqueued).toBe(1);
    expect(retry.alertsEnqueued).toBe(0);
    expect(enqueued).toEqual([
      earlyAccessShippingOverdueEventKey(
        "XEC-1234567890ABCDEF",
        "2026-08-12T01:00:00.000Z",
      ),
    ]);
  });

  it("never alerts a shipped order", async () => {
    let enqueued = false;
    const result = await runEarlyAccessShippingSlaSweep(
      new Date("2026-08-20T00:00:00.000Z"),
      {
        store: {
          async dueBy() {
            return [
              {
                cartCheckoutNumber: "XEC-1234567890ABCDEF",
                shipByAt: "2026-08-12T01:00:00.000Z",
                stage: "shipped" as const,
              },
            ];
          },
        },
        alerts: { async enqueue() { enqueued = true; return true; } },
      },
    );
    expect(result.overdue).toBe(0);
    expect(enqueued).toBe(false);
  });
});
