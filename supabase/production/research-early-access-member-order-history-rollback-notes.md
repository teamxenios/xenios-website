# M67 rollback notes: Early Access member order history

Migration: `supabase/migrations/20260813120000_research_early_access_member_order_history.sql`

## What M67 does

It creates two read-only routines and nothing else:

- `public.research_early_access_legal_bindings_for_member(uuid) -> jsonb`
- `public.research_early_access_placements_for_customers(text[]) -> jsonb`

Both are `stable` and `security definer`, both have `execute` revoked from
`public`, `anon` and `authenticated`, and both are granted to `service_role`
only. No table gains any grant.

It creates no table, no column, no index, no trigger and no type. It writes no
row. It changes no existing routine. It touches none of M61, M62, M63, M64,
M65 or M66.

## Why it exists

Two reads were impossible, not merely absent.

M62 runs `revoke all on <every M62 table> from public, anon, authenticated,
service_role` and grants thirteen routines, of which the only bindings reader
is `research_early_access_legal_binding_for_customer(text)`. That answers the
FORWARD direction from a single handle. Nothing enumerates a member's handles,
so the member-first index `research_ea_legal_binding_member_customer_uidx` was
built for a query no role was permitted to issue.

The commerce persistence migration revokes its own tables from `service_role`
the same way, and its placement readers are keyed by order number or
idempotency key, or list the ones awaiting review. None finds a customer's own
orders.

The result was that a customer who still held their order number could read
that one order, and a customer who did not could prove exactly who they were
and be shown nothing they had bought.

## Rollback

Rollback is unconditional and destroys no data, because M67 writes nothing.

```sql
begin;
drop function if exists public.research_early_access_legal_bindings_for_member(uuid);
drop function if exists public.research_early_access_placements_for_customers(text[]);
commit;
```

After the drop:

- Member order history stops answering. The application's Early Access side of
  `GET /api/research/orders` raises rather than returning an empty list, so a
  customer is told the history is unavailable instead of being told they have
  no orders.
- Every other Early Access read is unaffected. The forward binding lookup, the
  single-order read, the invoice read, proof submission, settlement, dispatch
  and the shipping SLA work list all use different routines and are untouched.
- The M62 and commerce revoke boundaries are exactly as they were. M67 never
  moved them, so dropping it cannot leave them widened.

## Order relative to the application

Either order is safe, which is unusual and worth stating.

- Migration applied, application not yet deployed: the routines exist and
  nothing calls them. No behaviour changes.
- Application deployed, migration not applied: the routine is missing, the call
  fails, and the order history reports itself unavailable. No customer is shown
  a wrong or empty history, and no other surface is affected.

The second case is a degraded surface rather than an outage, so the deployment
does not have to be sequenced behind the migration. Applying first is still
preferred, because it makes the feature work from the first request.

## Rehearsal required before production

Not yet performed at the time of writing. Required:

- Apply twice at `psql` exit 0 on disposable PostgreSQL 16 and 17, proving the
  second apply is a no-op through `create or replace`.
- Prove the preflight fails closed with SQLSTATE 55000 on a database that lacks
  the Early Access schema, leaving no routine behind.
- Prove the post-condition block catches its own failure modes rather than
  passing vacuously: a non-`stable` routine, a non-security-definer routine, an
  `execute` grant to PUBLIC, and a direct `SELECT` grant on either table must
  each raise.
- Behavioural checks: a member with one handle, a member with an alias handle,
  a member with no binding, and, most importantly, an EMPTY `text[]` returning
  an empty result rather than every order. That last case is the one defect in
  this migration that would be both catastrophic and silent.
