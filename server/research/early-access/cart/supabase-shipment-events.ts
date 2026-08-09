import {
  EarlyAccessPersistenceError,
  expectObject,
  runEarlyAccessCall,
  type EarlyAccessPersistenceQuery,
} from "../persistence/executor";

export type EarlyAccessFulfilmentEventType =
  | "shipment_shipped"
  | "tracking_added"
  | "tracking_corrected"
  | "shipment_voided";

export type EarlyAccessFulfilmentEventCommand = Readonly<{
  cartCheckoutNumber: string;
  orderNumber: string;
  eventType: EarlyAccessFulfilmentEventType;
  supersedesEventId: string | null;
  metadata: Readonly<Record<string, unknown>>;
}>;

export type EarlyAccessFulfilmentEventCommit =
  | Readonly<{ recorded: true; eventId: string }>
  | Readonly<{
      recorded: false;
      reason:
        | "checkout_unknown"
        | "checkout_superseded"
        | "payment_not_verified"
        | "child_order_unknown"
        | "superseded_event_unknown";
    }>;

const RPC = "research_early_access_record_cart_fulfilment_event";
const REFUSALS = Object.freeze([
  "checkout_unknown",
  "checkout_superseded",
  "payment_not_verified",
  "child_order_unknown",
  "superseded_event_unknown",
] as const);

/** Appends shipment/tracking facts through M62; corrections never rewrite rows. */
export class SupabaseEarlyAccessShipmentEventStore {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async record(
    command: EarlyAccessFulfilmentEventCommand,
    actorId: string,
  ): Promise<EarlyAccessFulfilmentEventCommit> {
    const raw = expectObject(
      RPC,
      await runEarlyAccessCall(this.query, {
        fn: RPC,
        args: {
          p_event: command,
          p_actor_id: actorId,
        },
      }),
    );
    if (raw.recorded === true && typeof raw.eventId === "string") {
      return Object.freeze({ recorded: true as const, eventId: raw.eventId });
    }
    if (
      raw.recorded === false &&
      typeof raw.reason === "string" &&
      (REFUSALS as readonly string[]).includes(raw.reason)
    ) {
      return Object.freeze({
        recorded: false as const,
        reason: raw.reason as (typeof REFUSALS)[number],
      });
    }
    throw new EarlyAccessPersistenceError(RPC);
  }
}
