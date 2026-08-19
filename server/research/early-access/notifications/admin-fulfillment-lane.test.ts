import { describe, expect, it, vi } from "vitest";

// The launch-fulfillment operator lane, at the route-factory seam: the
// tracking-notification hook inside createEarlyAccessSupplierTrackingRoute,
// and the two new fail-closed reads (settled-awaiting-fulfillment, open
// exceptions). The factories are pure functions over injected dependencies
// and a response port, so every property here is exercised with no Express
// and no database. The tests live beside the notifier because this lane owns
// notifications/**; the factories under test are the lane's additive exports
// from ../routes/admin-routes.
import {
  createEarlyAccessAdminExceptionsRoute,
  createEarlyAccessSettledAwaitingFulfillmentRoute,
  createEarlyAccessSupplierTrackingRoute,
  type EarlyAccessAdminRouteDependencies,
  type EarlyAccessSettledAwaitingFulfillmentRow,
} from "../routes/admin-routes";
import type { EarlyAccessAdminDirectory } from "../routes/ports";
import type {
  EarlyAccessCommerceStore,
  EarlyAccessDispatch,
  EarlyAccessPlacement,
  EarlyAccessSettlement,
} from "../routes/store";
import type { EarlyAccessTrackingNotifier } from "./tracking-notifier";

const FOUNDER = "founder@example.com";
const ORDER_NUMBER = "XEA-0123456789ABCDEF";

const ADMINS: EarlyAccessAdminDirectory = {
  async resolve(adminEmail: string) {
    return adminEmail === FOUNDER
      ? Object.freeze({ actorId: "founder.aaaa1111", role: "founder_admin" as const })
      : null;
  },
};

/** A response port that records exactly what the route answered. */
function stubResponse() {
  const state = { status: 0, body: null as unknown };
  const port = {
    setHeader: () => {},
    status: (code: number) => {
      state.status = code;
    },
    json: (body: unknown) => {
      state.body = body;
    },
  };
  return { port, state };
}

/**
 * A release record that satisfies the domain's own reader, so
 * describeTrackingUpdate accepts a tracking write against it.
 */
const RELEASE = Object.freeze({
  releaseId: `rel-${ORDER_NUMBER}`,
  orderId: ORDER_NUMBER,
  supplierId: "supplier.one",
  supplierSku: "SKU-0001",
  quantity: 1,
  releasedByActorId: "founder.aaaa1111",
  releasedAt: "2026-08-18T12:00:00.000Z",
  verificationIdempotencyKey: "ea-confirm-key-000001",
});

const PLACEMENT = Object.freeze({
  orderNumber: ORDER_NUMBER,
  contact: Object.freeze({ email: "customer@example.com", phone: "+15550000000" }),
}) as unknown as EarlyAccessPlacement;

const SETTLEMENT = Object.freeze({
  orderNumber: ORDER_NUMBER,
  supplierOrder: RELEASE,
}) as unknown as EarlyAccessSettlement;

const EMPTY_DISPATCH: EarlyAccessDispatch = Object.freeze({
  events: Object.freeze([]),
  tracking: Object.freeze([]),
  fulfillment: null,
});

/**
 * The minimal settled-order store the tracking route touches. Tracking is
 * held mutable so the route's post-commit re-read sees the committed row.
 */
function settledStore() {
  let dispatch: EarlyAccessDispatch = EMPTY_DISPATCH;
  const committed: unknown[] = [];
  const store = {
    async placementByOrderNumber(orderNumber: string) {
      return orderNumber === ORDER_NUMBER ? PLACEMENT : null;
    },
    async settlement(orderNumber: string) {
      return orderNumber === ORDER_NUMBER ? SETTLEMENT : null;
    },
    async dispatch() {
      return dispatch;
    },
    async commitTracking(record: { sequence: number }) {
      if (record.sequence !== dispatch.tracking.length + 1) {
        return Object.freeze({ committed: false as const, reason: "sequence_moved" as const });
      }
      committed.push(record);
      dispatch = Object.freeze({
        ...dispatch,
        tracking: Object.freeze([...dispatch.tracking, record]) as never,
      });
      return Object.freeze({ committed: true as const });
    },
  } as unknown as EarlyAccessCommerceStore;
  return { store, committed };
}

function depsWith(
  store: EarlyAccessCommerceStore,
  extra: Partial<EarlyAccessAdminRouteDependencies> = {},
): EarlyAccessAdminRouteDependencies {
  return {
    store,
    admins: ADMINS,
    audit: { record: async () => {} },
    now: () => Date.parse("2026-08-19T12:00:00.000Z"),
    ...extra,
  };
}

const TRACKING_BODY = Object.freeze({ carrier: "UPS", trackingNumber: "1Z-TEST-000001" });

describe("the tracking route's notification hook", () => {
  it("hands the committed record and the placement to the injected notifier", async () => {
    const { store, committed } = settledStore();
    const notifier: EarlyAccessTrackingNotifier = { trackingPosted: vi.fn() };
    const route = createEarlyAccessSupplierTrackingRoute(
      depsWith(store, { trackingNotifications: notifier }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER, orderNumber: ORDER_NUMBER, body: { ...TRACKING_BODY } }, port);

    expect(state.status).toBe(201);
    expect(committed).toHaveLength(1);
    expect(notifier.trackingPosted).toHaveBeenCalledTimes(1);
    expect(notifier.trackingPosted).toHaveBeenCalledWith(
      PLACEMENT,
      expect.objectContaining({
        orderId: ORDER_NUMBER,
        carrier: "UPS",
        trackingNumber: "1Z-TEST-000001",
        sequence: 1,
      }),
    );
  });

  it("commits the tracking write and answers 201 even when the notifier throws", async () => {
    const { store, committed } = settledStore();
    const notifier: EarlyAccessTrackingNotifier = {
      trackingPosted: () => {
        throw new Error("notifier exploded");
      },
    };
    const route = createEarlyAccessSupplierTrackingRoute(
      depsWith(store, { trackingNotifications: notifier }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER, orderNumber: ORDER_NUMBER, body: { ...TRACKING_BODY } }, port);

    // The property that matters: the durable write happened and the operator
    // saw success. Mail is a consequence, never a precondition.
    expect(state.status).toBe(201);
    expect(committed).toHaveLength(1);
    expect((state.body as { tracking: unknown[] }).tracking).toHaveLength(1);
  });

  it("enqueues nothing when no notifier port is configured", async () => {
    const { store, committed } = settledStore();
    // No trackingNotifications in deps at all: the pre-hook construction.
    const route = createEarlyAccessSupplierTrackingRoute(depsWith(store));
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER, orderNumber: ORDER_NUMBER, body: { ...TRACKING_BODY } }, port);

    expect(state.status).toBe(201);
    expect(committed).toHaveLength(1);
  });

  it("does not notify when the commit is refused", async () => {
    const { store } = settledStore();
    const refusingStore = Object.create(store) as EarlyAccessCommerceStore;
    (refusingStore as { commitTracking: unknown }).commitTracking = async () =>
      Object.freeze({ committed: false as const, reason: "sequence_moved" as const });
    const notifier: EarlyAccessTrackingNotifier = { trackingPosted: vi.fn() };
    const route = createEarlyAccessSupplierTrackingRoute(
      depsWith(refusingStore, { trackingNotifications: notifier }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER, orderNumber: ORDER_NUMBER, body: { ...TRACKING_BODY } }, port);

    expect(state.status).toBe(409);
    expect(notifier.trackingPosted).not.toHaveBeenCalled();
  });
});

describe("the settled-awaiting-fulfillment queue route", () => {
  const ROWS: readonly EarlyAccessSettledAwaitingFulfillmentRow[] = Object.freeze([
    Object.freeze({
      orderNumber: ORDER_NUMBER,
      settledAt: "2026-08-18T13:00:00.000Z",
      sku: "SKU-0001",
      quantity: 1,
      payableTotalCents: 47_760,
      currency: "USD",
      trackingCount: 0,
      dispatchEventCount: 0,
    }),
  ]);

  it("refuses by name while the RPC port is absent, never an empty list", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessSettledAwaitingFulfillmentRoute(depsWith(store));
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER }, port);

    expect(state.status).toBe(503);
    expect(state.body).toEqual({ ok: false, code: "SETTLED_QUEUE_UNAVAILABLE" });
  });

  it("answers the port's rows once the port exists", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessSettledAwaitingFulfillmentRoute(
      depsWith(store, { settledAwaitingFulfillment: async () => ROWS }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER }, port);

    expect(state.status).toBe(200);
    expect(state.body).toEqual({ ok: true, items: [{ ...ROWS[0] }] });
  });

  it("collapses a throwing port into 503, never a fabricated queue", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessSettledAwaitingFulfillmentRoute(
      depsWith(store, {
        settledAwaitingFulfillment: async () => {
          throw new Error("rpc missing");
        },
      }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER }, port);

    expect(state.status).toBe(503);
    expect(state.body).toEqual({ ok: false, code: "UNAVAILABLE" });
  });

  it("refuses a caller the directory does not resolve", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessSettledAwaitingFulfillmentRoute(
      depsWith(store, { settledAwaitingFulfillment: async () => ROWS }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: "support@example.com" }, port);

    expect(state.status).toBe(403);
    expect(state.body).toEqual({ ok: false, code: "ACTOR_NOT_PERMITTED" });
  });
});

describe("the open-exceptions route", () => {
  it("refuses by name while the port is absent", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessAdminExceptionsRoute(depsWith(store));
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER }, port);

    expect(state.status).toBe(503);
    expect(state.body).toEqual({ ok: false, code: "EXCEPTIONS_UNAVAILABLE" });
  });

  it("answers the deployed RPC's projection once wired", async () => {
    const { store } = settledStore();
    const exception = Object.freeze({
      id: 7,
      kind: "overpayment",
      orderNumber: ORDER_NUMBER,
      detail: { observedCents: 50_000 },
      raisedAt: "2026-08-18T14:00:00.000Z",
    });
    const route = createEarlyAccessAdminExceptionsRoute(
      depsWith(store, { openExceptions: async () => Object.freeze([exception]) }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: FOUNDER }, port);

    expect(state.status).toBe(200);
    expect(state.body).toEqual({ ok: true, items: [{ ...exception }] });
  });

  it("refuses a caller the directory does not resolve", async () => {
    const { store } = settledStore();
    const route = createEarlyAccessAdminExceptionsRoute(
      depsWith(store, { openExceptions: async () => Object.freeze([]) }),
    );
    const { port, state } = stubResponse();

    await route({ adminEmail: "" }, port);

    expect(state.status).toBe(403);
  });
});
