import { describe, expect, it } from "vitest";
import { SupabaseEarlyAccessShipmentEventStore } from "./supabase-shipment-events";

describe("Supabase shipment event append", () => {
  it("passes a correction and named actor to the single M62 append RPC", async () => {
    const calls: unknown[] = [];
    const store = new SupabaseEarlyAccessShipmentEventStore(async (call) => {
      calls.push(call);
      return { recorded: true, eventId: "11310b1d-810e-4144-bff3-d3762d744e62" };
    });
    const command = {
      cartCheckoutNumber: "XEC-0123456789ABCDEF",
      orderNumber: "XEA-CART-01234567-01",
      eventType: "tracking_corrected" as const,
      supersedesEventId: "ac6235bd-abaa-411a-8550-d00225b1c42a",
      metadata: { tracking: ["TRACK-CORRECT"] },
    };

    await expect(store.record(command, "admin@example.com")).resolves.toEqual({
      recorded: true,
      eventId: "11310b1d-810e-4144-bff3-d3762d744e62",
    });
    expect(calls).toEqual([{
      fn: "research_early_access_record_cart_fulfilment_event",
      args: { p_event: command, p_actor_id: "admin@example.com" },
    }]);
  });
});
