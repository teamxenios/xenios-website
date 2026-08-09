import { createHash } from "node:crypto";
import { earlyAccessIsOverdue } from "@shared/research/early-access-hardening";

export type EarlyAccessShippingCommitment = Readonly<{
  cartCheckoutNumber: string;
  shipByAt: string;
  stage: "processing" | "partially_shipped" | "shipped";
}>;

export interface EarlyAccessShippingSlaStore {
  dueBy(nowIso: string): Promise<readonly EarlyAccessShippingCommitment[]>;
}

export interface EarlyAccessShippingAlertSink {
  /** Durable unique insert. False means this deterministic event already exists. */
  enqueue(input: Readonly<{
    eventKey: string;
    cartCheckoutNumber: string;
    shipByAt: string;
    overdueAt: string;
  }>): Promise<boolean>;
}

export type EarlyAccessShippingSlaSweepResult = Readonly<{
  examined: number;
  overdue: number;
  alertsClaimed: number;
  alertsEnqueued: number;
  failures: number;
}>;

export function earlyAccessShippingOverdueEventKey(
  cartCheckoutNumber: string,
  shipByAt: string,
): string {
  const digest = createHash("sha256")
    .update("xenios:ea-cart-shipping-overdue:v1|", "utf8")
    .update(cartCheckoutNumber, "utf8")
    .update("|", "utf8")
    .update(shipByAt, "utf8")
    .digest("hex");
  return `ea_cart_shipping_overdue:${digest}`;
}

/** The existing outbox's unique insert is both claim and enqueue: there is no loss gap. */
export async function runEarlyAccessShippingSlaSweep(
  now: Date,
  deps: Readonly<{ store: EarlyAccessShippingSlaStore; alerts: EarlyAccessShippingAlertSink }>,
): Promise<EarlyAccessShippingSlaSweepResult> {
  if (!Number.isFinite(now.getTime())) {
    return { examined: 0, overdue: 0, alertsClaimed: 0, alertsEnqueued: 0, failures: 1 };
  }
  const nowIso = now.toISOString();
  const due = await deps.store.dueBy(nowIso);
  const result = { examined: due.length, overdue: 0, alertsClaimed: 0, alertsEnqueued: 0, failures: 0 };
  for (const commitment of due) {
    if (!earlyAccessIsOverdue({ ...commitment, nowIso })) continue;
    result.overdue += 1;
    const eventKey = earlyAccessShippingOverdueEventKey(
      commitment.cartCheckoutNumber,
      commitment.shipByAt,
    );
    try {
      const inserted = await deps.alerts.enqueue({
        eventKey,
        cartCheckoutNumber: commitment.cartCheckoutNumber,
        shipByAt: commitment.shipByAt,
        overdueAt: nowIso,
      });
      if (!inserted) continue;
      result.alertsClaimed += 1;
      result.alertsEnqueued += 1;
    } catch {
      result.failures += 1;
    }
  }
  return Object.freeze(result);
}
