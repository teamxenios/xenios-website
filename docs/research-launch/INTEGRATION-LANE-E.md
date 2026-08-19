# Lane E integration: launch fulfillment operations

Branch: `lane/launch-fulfillment-admin`. This lane never edits `register.ts`,
`server/index.ts`, or `persistence/commerce-ports.ts`; every change those
files need is a ready-to-paste snippet below. Everything else in the lane is
already committed and compiles/passes without any of these snippets applied -
the routes it adds fail closed (named 503) until the ports below are wired.

## What the lane shipped (no wiring needed)

- `client/src/research/adapters/earlyAccessAdminOrders.ts` - typed adapter
  over the five LIVE legacy operator endpoints plus the two new fail-closed
  reads and the assisted-order submitted count.
- `client/src/research/pages/adminx/EarlyAccessFulfillment.tsx` at
  `/admin/research/early-access/fulfillment` (registered in
  `adminx-section.tsx` and `lib/routes.ts`): payment-review queue (live),
  settled-awaiting-fulfillment queue (honest unavailable state until its RPC
  ships), per-order dispatch card (supplier packet + trail + tracking entry +
  mark-shipped with `TRACKING_REQUIRED` surfaced as guidance).
- `client/src/research/pages/adminx/AdminResearchHome.tsx` - the placeholder
  commerce tiles are replaced by four truthful tiles (payment review count,
  assisted-orders submitted count, settled-awaiting-fulfillment, exceptions);
  a tile without a live source renders its explicit unavailable state, never
  a fake zero.
- `server/research/early-access/notifications/tracking-notifier.ts` - the
  outbox-backed customer tracking notifier (first caller of
  `projectEarlyAccessTracking`), keyed by the committed tracking row's
  primary key (`orderNumber:sequence`).
- `server/research/early-access/routes/admin-routes.ts` (additive):
  - optional `trackingNotifications` dependency; the tracking route calls it
    fire-and-forget after `commitTracking` succeeds (a throwing notifier
    never breaks the 201).
  - `createEarlyAccessSettledAwaitingFulfillmentRoute` +
    `EARLY_ACCESS_ADMIN_FULFILLMENT_QUEUE_PATH`
    (`/api/admin/research/early-access/fulfillment-queue`) - 503
    `SETTLED_QUEUE_UNAVAILABLE` until its port is injected.
  - `createEarlyAccessAdminExceptionsRoute` +
    `EARLY_ACCESS_ADMIN_EXCEPTIONS_PATH`
    (`/api/admin/research/early-access/exceptions`) - 503
    `EXCEPTIONS_UNAVAILABLE` until its port is injected.
- `supabase/candidates/20260819_research_early_access_settled_awaiting_fulfillment.sql`
  (+ `_precheck` / `_postcheck`) - **FOUNDER-GATED CANDIDATE, not applied to
  production by this lane.** One read-only, `stable`, security-definer RPC
  `research_early_access_settled_awaiting_fulfillment()` over the deployed
  M67-family tables; execute for `service_role` only. Production mutation
  requires Samuel's current explicit approval, every time.

## Snippet 1 - register.ts: three optional registration options

Add beside `orderNotifications` in `EarlyAccessRegistrationOptions`
(`server/research/early-access/register.ts`, ~line 620):

```ts
  /**
   * Customer tracking mail for the legacy single-order flow, over the same
   * durable outbox. Absent means no mail; fire-and-forget by contract.
   */
  readonly trackingNotifications?: EarlyAccessTrackingNotifier;
  /**
   * The settled-awaiting-fulfillment queue read. Wire ONLY after the
   * founder-gated candidate RPC is deployed; while absent the route answers
   * 503 SETTLED_QUEUE_UNAVAILABLE by name.
   */
  readonly settledAwaitingFulfillment?: EarlyAccessAdminRouteDependencies["settledAwaitingFulfillment"];
  /** The open-exceptions read over the DEPLOYED RPC. */
  readonly openExceptions?: EarlyAccessAdminRouteDependencies["openExceptions"];
```

with the type imports (the route-dependency type is already imported there):

```ts
import type { EarlyAccessTrackingNotifier } from "./notifications/tracking-notifier";
```

Pass them through where `registerEarlyAccessAdminApi` is called (~line 1384),
beside the existing `notifications` spread:

```ts
    ...(options.trackingNotifications === undefined
      ? {}
      : { trackingNotifications: options.trackingNotifications }),
    ...(options.settledAwaitingFulfillment === undefined
      ? {}
      : { settledAwaitingFulfillment: options.settledAwaitingFulfillment }),
    ...(options.openExceptions === undefined ? {} : { openExceptions: options.openExceptions }),
```

## Snippet 2 - register.ts: mount the two GET routes

Inside `registerEarlyAccessAdminApi` (~line 1448, beside the other factories):

```ts
  const fulfillmentQueue = createEarlyAccessSettledAwaitingFulfillmentRoute(deps);
  const openExceptions = createEarlyAccessAdminExceptionsRoute(deps);

  app.get(EARLY_ACCESS_ADMIN_FULFILLMENT_QUEUE_PATH, guard, (req: Request, res: Response) => {
    void fulfillmentQueue({ adminEmail: adminEmailOf(req) }, res);
  });

  app.get(EARLY_ACCESS_ADMIN_EXCEPTIONS_PATH, guard, (req: Request, res: Response) => {
    void openExceptions({ adminEmail: adminEmailOf(req) }, res);
  });
```

with the imports added to the existing `./routes/admin-routes` import list:

```ts
  createEarlyAccessSettledAwaitingFulfillmentRoute,
  createEarlyAccessAdminExceptionsRoute,
  EARLY_ACCESS_ADMIN_FULFILLMENT_QUEUE_PATH,
  EARLY_ACCESS_ADMIN_EXCEPTIONS_PATH,
```

## Snippet 3 - persistence/commerce-ports.ts: the port methods (OTHER LANE OWNS THIS FILE)

```ts
import type {
  EarlyAccessAdminExceptionRow,
  EarlyAccessSettledAwaitingFulfillmentRow,
} from "../routes/admin-routes";

const FULFILLMENT_OPS_RPC = {
  /** Founder-gated candidate: supabase/candidates/20260819_..._fulfillment.sql */
  settledAwaitingFulfillment: "research_early_access_settled_awaiting_fulfillment",
  /** Deployed by migration 20260804121000. */
  openExceptions: "research_early_access_open_admin_exceptions",
} as const;

/**
 * The two fulfillment-operations reads. Read-only by construction: both RPCs
 * are security definer, service_role execute only, and neither takes an
 * argument, so nothing here can write or be steered.
 */
export class SupabaseEarlyAccessFulfillmentOpsReads {
  constructor(private readonly query: EarlyAccessPersistenceQuery) {}

  async settledAwaitingFulfillment(): Promise<
    readonly EarlyAccessSettledAwaitingFulfillmentRow[]
  > {
    const raw = await runEarlyAccessCall(this.query, {
      fn: FULFILLMENT_OPS_RPC.settledAwaitingFulfillment,
      args: {},
    });
    const rows = expectArray(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment, raw);
    return Object.freeze(
      rows.map((row) => {
        const record = expectObject(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment, row);
        if (
          typeof record.orderNumber !== "string" ||
          typeof record.settledAt !== "string" ||
          typeof record.sku !== "string" ||
          typeof record.quantity !== "number" ||
          typeof record.payableTotalCents !== "number" ||
          typeof record.currency !== "string" ||
          typeof record.trackingCount !== "number" ||
          typeof record.dispatchEventCount !== "number"
        ) {
          throw new EarlyAccessPersistenceError(FULFILLMENT_OPS_RPC.settledAwaitingFulfillment);
        }
        return Object.freeze({
          orderNumber: record.orderNumber,
          settledAt: record.settledAt,
          sku: record.sku,
          quantity: record.quantity,
          payableTotalCents: record.payableTotalCents,
          currency: record.currency,
          trackingCount: record.trackingCount,
          dispatchEventCount: record.dispatchEventCount,
        });
      }),
    );
  }

  async openExceptions(): Promise<readonly EarlyAccessAdminExceptionRow[]> {
    const raw = await runEarlyAccessCall(this.query, {
      fn: FULFILLMENT_OPS_RPC.openExceptions,
      args: {},
    });
    const rows = expectArray(FULFILLMENT_OPS_RPC.openExceptions, raw);
    return Object.freeze(
      rows.map((row) => {
        const record = expectObject(FULFILLMENT_OPS_RPC.openExceptions, row);
        if (
          typeof record.id !== "number" ||
          typeof record.kind !== "string" ||
          typeof record.raisedAt !== "string"
        ) {
          throw new EarlyAccessPersistenceError(FULFILLMENT_OPS_RPC.openExceptions);
        }
        return Object.freeze({
          id: record.id,
          kind: record.kind,
          orderNumber: typeof record.orderNumber === "string" ? record.orderNumber : null,
          detail: record.detail ?? null,
          raisedAt: record.raisedAt,
        });
      }),
    );
  }
}
```

(`expectObject` and `EarlyAccessPersistenceError` come from `./executor`,
already imported by that file's siblings.)

## Snippet 4 - persistence/production-deps.ts: build the ports

Inside `buildEarlyAccessPersistence`, where `run` exists (after ~line 224):

```ts
  const fulfillmentOps = new SupabaseEarlyAccessFulfillmentOpsReads(run);
  // The exceptions RPC is DEPLOYED (migration 20260804121000): wire always.
  options.openExceptions = () => fulfillmentOps.openExceptions();
  // FOUNDER-GATED: uncomment ONLY after Samuel approves and applies
  // supabase/candidates/20260819_research_early_access_settled_awaiting_fulfillment.sql
  // (precheck verdict APPLY_READY, postcheck verdict DEPLOYED_AND_LOCKED).
  // Until then the route's named 503 is the correct, honest answer.
  // options.settledAwaitingFulfillment = () => fulfillmentOps.settledAwaitingFulfillment();
```

## Snippet 5 - server/index.ts: the outbox-backed tracking notifier

Beside the existing `legacyOrderNotifications` construction (~line 384):

```ts
import { createOutboxTrackingNotifier } from "./research/early-access/notifications/tracking-notifier";

const earlyAccessTrackingNotifications = createOutboxTrackingNotifier({
  ...(process.env.SITE_URL ? { siteUrl: process.env.SITE_URL } : {}),
});
```

and in the `registerPrivateEarlyAccessApi(app, { ... })` options, beside
`orderNotifications`:

```ts
  trackingNotifications: earlyAccessTrackingNotifications,
```

## Founder gate summary

| Item | State | Gate |
| --- | --- | --- |
| Exceptions RPC | deployed | route wiring only (snippets 1, 2, 3, 4) |
| Settled-awaiting-fulfillment RPC | candidate only | **Samuel's explicit approval + canonical migration DAG registration + precheck/postcheck**, then uncomment in snippet 4 |
| Tracking mail | code complete | wiring only (snippets 1, 5); sends only where the outbox worker runs |

No real email is sent by this lane: the notifier enqueues into the existing
durable `research_notification_outbox` and the worker in `server/index.ts`
owns delivery, retries and idempotency (unique `event_key`).
