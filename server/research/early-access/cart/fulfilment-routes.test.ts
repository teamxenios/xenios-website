import { describe, expect, it, vi } from "vitest";
import { createEarlyAccessCartFulfilmentEventAdminRoute } from "./fulfilment-routes";
import { SupabaseEarlyAccessShipmentEventStore } from "./supabase-shipment-events";
import type {
  EarlyAccessFulfilmentEventCommand,
  EarlyAccessFulfilmentEventCommit,
} from "./supabase-shipment-events";

const CHECKOUT = "XEC-0123456789ABCDEF";
const ORDER = "XEA-CART-01234567-01";
const EVENT_ID = "11111111-2222-4333-8444-555555555555";
const ADMIN = { id: "admin@example.com" };

function response() {
  const sent: { status: number; body: unknown }[] = [];
  const headers: Record<string, string> = {};
  return {
    sent,
    headers,
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
    status(code: number) {
      return {
        json(body: unknown) {
          sent.push({ status: code, body });
        },
      };
    },
  } as never;
}

function routeOver(
  commit: EarlyAccessFulfilmentEventCommit = { recorded: true, eventId: EVENT_ID },
) {
  const calls: { command: EarlyAccessFulfilmentEventCommand; actorId: string }[] = [];
  const route = createEarlyAccessCartFulfilmentEventAdminRoute({
    events: {
      async record(command, actorId) {
        calls.push({ command, actorId });
        return commit;
      },
    },
  });
  return { route, calls };
}

describe("the named-admin fulfilment door", () => {
  it("refuses an unauthenticated caller and writes nothing", async () => {
    const { route, calls } = routeOver();
    const res = response();
    await route({ actor: null, cartCheckoutNumber: CHECKOUT, body: {} }, res);
    expect((res as never as { sent: unknown[] }).sent).toEqual([
      { status: 401, body: { ok: false, code: "UNAUTHORIZED" } },
    ]);
    expect(calls).toEqual([]);
  });

  it("records a shipment through the M62 RPC, with the ACTOR from the guard", async () => {
    const { route, calls } = routeOver();
    const res = response();
    await route(
      {
        actor: ADMIN,
        cartCheckoutNumber: CHECKOUT,
        // A body that also tries to name its own actor. It must be ignored.
        body: { orderNumber: ORDER, eventType: "shipment_shipped", actorId: "someone-else" },
      },
      res,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.actorId).toBe(ADMIN.id);
    expect(calls[0]?.command).toEqual({
      cartCheckoutNumber: CHECKOUT,
      orderNumber: ORDER,
      eventType: "shipment_shipped",
      supersedesEventId: null,
      metadata: { tracking: [] },
    });
    expect((res as never as { sent: unknown[] }).sent).toEqual([
      { status: 201, body: { ok: true, recorded: true, eventId: EVENT_ID } },
    ]);
  });

  it("carries tracking and a carrier label, and NOTHING else from the body", async () => {
    const { route, calls } = routeOver();
    await route(
      {
        actor: ADMIN,
        cartCheckoutNumber: CHECKOUT,
        body: {
          orderNumber: ORDER,
          eventType: "tracking_added",
          tracking: ["1Z999AA10123456784"],
          carrierLabel: "UPS",
          supplierId: "raw-peptides",
          internalNote: "customer called twice",
          customerEmail: "buyer@example.com",
        },
      },
      response(),
    );
    expect(calls[0]?.command.metadata).toEqual({
      tracking: ["1Z999AA10123456784"],
      carrierLabel: "UPS",
    });
    const serialized = JSON.stringify(calls[0]?.command.metadata);
    for (const forbidden of ["supplier", "internalNote", "customerEmail", "@"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("a CORRECTION must name the fact it supersedes", async () => {
    for (const eventType of ["tracking_corrected", "shipment_voided"]) {
      const { route, calls } = routeOver();
      const res = response();
      await route(
        { actor: ADMIN, cartCheckoutNumber: CHECKOUT, body: { orderNumber: ORDER, eventType } },
        res,
      );
      expect((res as never as { sent: { status: number; body: { code?: string } }[] }).sent[0]).toEqual({
        status: 400,
        body: { ok: false, code: "SUPERSEDES_INVALID" },
      });
      expect(calls).toEqual([]);
    }
  });

  it("a correction target that is not an event identity is refused", async () => {
    const { route, calls } = routeOver();
    const res = response();
    await route(
      {
        actor: ADMIN,
        cartCheckoutNumber: CHECKOUT,
        body: { orderNumber: ORDER, eventType: "tracking_corrected", supersedesEventId: "; drop" },
      },
      res,
    );
    expect((res as never as { sent: { status: number }[] }).sent[0]?.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("an ORIGINAL fact may NOT claim to supersede anything", async () => {
    for (const eventType of ["shipment_shipped", "tracking_added"]) {
      const { route, calls } = routeOver();
      const res = response();
      await route(
        {
          actor: ADMIN,
          cartCheckoutNumber: CHECKOUT,
          body: { orderNumber: ORDER, eventType, supersedesEventId: EVENT_ID },
        },
        res,
      );
      expect((res as never as { sent: { body: { code?: string } }[] }).sent[0]?.body.code).toBe(
        "SUPERSEDES_INVALID",
      );
      expect(calls).toEqual([]);
    }
  });

  it("passes a valid correction straight through with its target", async () => {
    const { route, calls } = routeOver();
    await route(
      {
        actor: ADMIN,
        cartCheckoutNumber: CHECKOUT,
        body: {
          orderNumber: ORDER,
          eventType: "tracking_corrected",
          supersedesEventId: EVENT_ID,
          tracking: ["1Z999AA10123456999"],
        },
      },
      response(),
    );
    expect(calls[0]?.command).toMatchObject({
      eventType: "tracking_corrected",
      supersedesEventId: EVENT_ID,
    });
  });

  it("refuses an unknown event type, an unknown checkout grammar and a bad order number", async () => {
    const cases: [Record<string, unknown> | undefined, string, number][] = [
      [{ orderNumber: ORDER, eventType: "shipment_deleted" }, CHECKOUT, 400],
      [{ orderNumber: "not-an-order", eventType: "shipment_shipped" }, CHECKOUT, 400],
      [{ orderNumber: ORDER, eventType: "shipment_shipped" }, "nonsense", 404],
      [undefined, CHECKOUT, 400],
    ];
    for (const [body, checkout, status] of cases) {
      const { route, calls } = routeOver();
      const res = response();
      await route({ actor: ADMIN, cartCheckoutNumber: checkout, body }, res);
      expect((res as never as { sent: { status: number }[] }).sent[0]?.status).toBe(status);
      expect(calls).toEqual([]);
    }
  });

  it("refuses tracking that is not a bounded list of safe references", async () => {
    for (const tracking of [["  "], [123], new Array(11).fill("1Z999AA10123456784"), "one"]) {
      const { route, calls } = routeOver();
      const res = response();
      await route(
        {
          actor: ADMIN,
          cartCheckoutNumber: CHECKOUT,
          body: { orderNumber: ORDER, eventType: "tracking_added", tracking },
        },
        res,
      );
      expect((res as never as { sent: { status: number }[] }).sent[0]?.status).toBe(400);
      expect(calls).toEqual([]);
    }
  });

  it("maps every database refusal to a status, and never claims a write happened", async () => {
    const expected: Record<string, number> = {
      checkout_unknown: 404,
      child_order_unknown: 404,
      checkout_superseded: 409,
      payment_not_verified: 409,
      superseded_event_unknown: 409,
    };
    for (const [reason, status] of Object.entries(expected)) {
      const { route } = routeOver({ recorded: false, reason: reason as never });
      const res = response();
      await route(
        {
          actor: ADMIN,
          cartCheckoutNumber: CHECKOUT,
          body: { orderNumber: ORDER, eventType: "shipment_shipped" },
        },
        res,
      );
      expect((res as never as { sent: { status: number; body: unknown }[] }).sent[0]).toEqual({
        status,
        body: { ok: false, code: reason, recorded: false },
      });
    }
  });

  it("sets private headers on every answer", async () => {
    const { route } = routeOver();
    const res = response();
    await route({ actor: null, cartCheckoutNumber: CHECKOUT, body: {} }, res);
    expect((res as never as { headers: Record<string, string> }).headers).toMatchObject({
      "Cache-Control": "no-store, private, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
  });
});

describe("the writer speaks only through the accepted M62 RPC", () => {
  it("calls research_early_access_record_cart_fulfilment_event and nothing else", async () => {
    const calls: { fn: string; args: unknown }[] = [];
    const store = new SupabaseEarlyAccessShipmentEventStore(async (call) => {
      calls.push({ fn: call.fn, args: call.args });
      return { recorded: true, eventId: EVENT_ID };
    });
    const route = createEarlyAccessCartFulfilmentEventAdminRoute({ events: store });
    await route(
      {
        actor: ADMIN,
        cartCheckoutNumber: CHECKOUT,
        body: { orderNumber: ORDER, eventType: "shipment_shipped" },
      },
      response(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.fn).toBe("research_early_access_record_cart_fulfilment_event");
    expect(calls[0]?.args).toMatchObject({ p_actor_id: ADMIN.id });
  });

  it("has exactly one write method: there is no second fulfilment mutation path", () => {
    expect(
      Object.getOwnPropertyNames(SupabaseEarlyAccessShipmentEventStore.prototype).sort(),
    ).toEqual(["constructor", "record"]);
  });

  it("never touches the fulfilment table directly", async () => {
    // The table is revoked from service_role, so a direct write would fail in
    // production anyway. This pins the intent in the source that a reviewer
    // reads rather than leaving it to the database to catch.
    const { readFileSync } = await import("node:fs");
    const { resolve } = await import("node:path");
    for (const file of ["supabase-shipment-events.ts", "fulfilment-routes.ts"]) {
      const source = readFileSync(resolve(__dirname, file), "utf8");
      expect(source).not.toMatch(/getSupabaseAdmin|\.from\(/);
    }
  });
});

describe("the customer shipment projection is unchanged by the admin door", () => {
  it("still exposes only customer-safe fields", async () => {
    const { projectEarlyAccessShipmentEvents } = await import("./shipment-status");
    const result = projectEarlyAccessShipmentEvents({
      cartCheckoutNumber: CHECKOUT,
      lines: [{ orderNumber: ORDER, quantity: 1 }],
      events: [
        {
          eventId: EVENT_ID,
          cartCheckoutNumber: CHECKOUT,
          orderNumber: ORDER,
          kind: "shipment_shipped",
          tracking: [],
          recordedAt: "2026-08-10T12:00:00.000Z",
          recordedBy: "admin@example.com",
          supersedesEventId: null,
        },
      ],
      paymentVerifiedAt: "2026-08-07T12:00:00.000Z",
      shipByAt: "2026-08-10T12:00:00.000Z",
      nowIso: "2026-08-11T00:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `recordedBy` is an operator identity. It must not reach the customer view.
    expect(JSON.stringify(result.fulfilment)).not.toContain("admin@example.com");
    expect(Object.keys(result.fulfilment.lines[0] ?? {}).sort()).toEqual([
      "orderNumber",
      "quantity",
      "shippedAt",
      "tracking",
    ]);
    expect(result.fulfilment.stage).toBe("shipped");
    expect(result.fulfilment.overdue).toBe(false);
  });
});
