# Rollback: research_early_access_cart_checkout

Migration: `supabase/migrations/20260807193000_research_early_access_cart_checkout.sql`
State: NOT applied to production. Feature ships disabled.

## What it adds

Six additive tables and one commit function, all new names, none of which any
existing code reads:

- `research_early_access_cart_quotes`
- `research_early_access_cart_checkouts`
- `research_early_access_cart_items`
- `research_early_access_cart_invoices`
- `research_early_access_cart_events`
- `research_early_access_cart_settlements`
- `research_early_access_commit_cart_checkout(...)`

It alters no existing table, drops nothing, and changes no existing function.
The single-product order path (`research_early_access_placements` and its
RPCs) is untouched.

## The rollback, in order of preference

**1. Unset the flag. This is the rollback.**

The cart's three routes are registered only when
`RESEARCH_EARLY_ACCESS_CART_ENABLED` is exactly the string `"true"`. Setting
it to anything else, or removing it, unmounts
`POST /api/research/early-access/cart/quote`,
`POST /api/research/early-access/cart/checkout` and
`GET /api/research/early-access/cart/:cartCheckoutNumber` on the next boot.
The single-product journey a customer can already complete is unaffected,
because it shares no code path with the cart beyond the seams both read.

No data is lost by this step. Rows already written stay readable by an
operator through SQL and can be honoured by hand.

**2. Leave the schema in place.**

The tables are additive and unread once the flag is off, so dropping them
buys nothing and risks losing a real customer's order. Retain them.

**3. Only if the schema itself must go**

Drop in dependency order, and only after confirming
`select count(*) from public.research_early_access_cart_checkouts;` is zero.
A non-zero count means a customer placed a real order and the correct action
is to fulfil or refund it first, not to drop the table.

```sql
drop function if exists public.research_early_access_commit_cart_checkout(jsonb);
drop table if exists public.research_early_access_cart_settlements;
drop table if exists public.research_early_access_cart_events;
drop table if exists public.research_early_access_cart_invoices;
drop table if exists public.research_early_access_cart_items;
drop table if exists public.research_early_access_cart_checkouts;
drop table if exists public.research_early_access_cart_quotes;
```

## Evidence

Applied twice against a disposable PostgreSQL 16 container, after the base
production schema and every preceding migration, with `ON_ERROR_STOP=1`. The
second pass produced no new failure and the six tables plus the commit
function were present after both passes.
