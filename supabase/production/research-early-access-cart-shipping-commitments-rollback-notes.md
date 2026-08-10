# M64 rollback notes: the shipping-commitment work list

Migration: `supabase/migrations/20260810130000_research_early_access_cart_shipping_commitments.sql`
SHA-256: `2a4f3a216bd5a0f154f3a249affde8ce1a8d64b36b6612a46420e5dd38585147`

## What M64 owns

One routine and nothing else:

```
public.research_early_access_cart_shipping_commitments_due(timestamptz)
```

It creates no table, no column, no index, no trigger and no type. It writes no
row of any kind. It changes no routine created by M61, M62 or M63.

## The rollback

```sql
drop function if exists public.research_early_access_cart_shipping_commitments_due(timestamptz);
```

That is the whole of it. **No data can be lost by this**, because the routine
owns none: it is a `stable` read over rows M62 already owned.

## ROLLBACK IS ORDERED, NOT UNCONDITIONAL

Dropping the routine while the application still calls it turns every 72-hour
SLA sweep into a failure. `SupabaseEarlyAccessShippingSlaStore.dueBy` throws
`EarlyAccessPersistenceError` on an absent routine, the interval worker logs and
swallows it, and the named-admin manual drain answers 503. Nothing is corrupted
and nothing is settled, shipped or refunded by the failure, but the monitor is
silently blind: an order can pass its ship-by with nobody alerted.

So the order is:

1. **Withdraw the application half first.** Remove `shippingSla` from the
   durable branch of `server/research/early-access/persistence/production-deps.ts`.
   Registration then mounts no worker and no manual drain, because both are
   inside `if (options.shippingSla)`. Deploy that.
2. **Then** drop the routine.

Reversing the order leaves a window in which the SLA is unsupervised. It is a
short window and it breaks nothing, but it should be a decision rather than an
accident.

Nothing else in the system depends on this routine. The fulfilment door, the
settlement door, the customer status projection and every M62 routine are
independent of it and unaffected either way.

## What a rollback does NOT do

- It does not restore any privilege. M64 granted none to any table, so there is
  nothing to take back.
- It does not affect `research_early_access_record_cart_fulfilment_event`, the
  named-admin shipment door, or any shipment fact already recorded.
- It does not change `payment_verified_at`, `ship_by_at`, or the
  `research_ea_settlement_ship_by_exact` constraint. The 72-hour commitment
  remains exactly as M62 defined it; only the ability to enumerate due
  commitments goes away.

## Re-applying

`create or replace` plus idempotent grants, inside one transaction with a
preflight that refuses on absent M62 schema. Re-applying after a rollback is the
same operation as the first apply and is verified twice on PostgreSQL 16 and 17
by `scripts/verify-m64-shipping-commitments.sh`.
