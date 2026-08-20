# M75 rollback and containment — declared affiliate code

Migration: `supabase/migrations/20260820190000_research_assisted_order_declared_affiliate_code.sql`
Requires: M71 (`research_assisted_order_bridge`), applied 2026-08-19 as managed
migration `20260819203614`.

## What it changes

Two nullable columns on `public.research_assisted_order_requests`
(`declared_affiliate_code`, `declared_affiliate_code_state`), three CHECK
constraints, two column comments, and a `create or replace` of
`public.research_assisted_order_submit(jsonb)` that adds two optional payload
reads plus a sanitizing block.

It creates no table, no index, no trigger, no type, no policy, and no new
routine. It writes no business row. It alters no existing column's type,
nullability, or default, and rewrites no existing row.

## Containment: why a rollback is rarely the right answer here

The migration is additive and backward compatible in both directions:

- **Old runtime, new schema.** The current production runtime never sends the
  two keys. They resolve to `null` and `'not_provided'`, which satisfies every
  constraint, so existing Early Access keeps working unchanged. This is the
  state the recommended production order deliberately sits in between the
  migration and the deploy.
- **New runtime, old schema.** Not a state the recommended order produces, but
  worth stating: the new runtime sends two extra JSON keys. The OLD routine
  ignores unknown keys entirely, so a submission still succeeds — the typed code
  is simply not stored. That is why deploying before migrating is degraded but
  not destructive, and why the migration is the safer thing to do first.

So the ordinary containment for a problem with the typed code is **not** to
reverse the schema: it is to stop writing the field (deploy the previous
runtime), leaving the columns in place and unused.

## Rollback, if the schema itself must be reversed

Only meaningful if the migration is applied and then the schema must go back.
Run inside one transaction:

```sql
begin;

-- 1. Restore the M71 submit routine. Take the body from the M71 file at its
--    pinned source sha (310ef190fd7136828ee6fcace7ec3bfb7567896f), NOT from an
--    older copy, and re-apply its revoke/grant lines afterwards.
--    create or replace function public.research_assisted_order_submit(...) ...
--    revoke all on function public.research_assisted_order_submit(jsonb)
--      from public, anon, authenticated;
--    grant execute on function public.research_assisted_order_submit(jsonb)
--      to service_role;

-- 2. Drop the constraints, then the columns.
alter table public.research_assisted_order_requests
  drop constraint if exists research_assisted_order_requests_declared_code_agreement,
  drop constraint if exists research_assisted_order_requests_declared_code_state,
  drop constraint if exists research_assisted_order_requests_declared_code_shape;

alter table public.research_assisted_order_requests
  drop column if exists declared_affiliate_code_state,
  drop column if exists declared_affiliate_code;

commit;
```

**Data loss:** dropping the columns discards every typed affiliate code
collected while the migration was live. Those codes are unverified commercial
metadata and carry no money, no commission and no entitlement, so nothing
financial is lost — but if any have been matched by hand, export them first:

```sql
select public_reference, declared_affiliate_code, declared_affiliate_code_state
from public.research_assisted_order_requests
where declared_affiliate_code is not null;
```

**Order 1 before 2.** The replaced routine references both columns; dropping
them while it is still installed leaves a submit path that fails at runtime.

## Security properties that must survive either direction

- `research_assisted_order_submit` stays SECURITY DEFINER with `search_path`
  pinned to `public`.
- Its ACL stays `postgres` and `service_role` only. No `anon`, no
  `authenticated`, no PUBLIC. Managed Supabase grants EXECUTE to client roles at
  create time, which is what refused M71's first production apply, so the
  revoke/grant pair must be re-stated by anything that replaces the routine.
- Row level security on `research_assisted_order_requests` stays ENABLED and
  FORCED.
- `affiliate_attribution_ref` is never written from a payload value. A typed
  code must never reach it.

The migration's own post-condition asserts all four and aborts the apply rather
than reporting success, and the behavioural suite at
`supabase/verification/research-assisted-order-declared-affiliate-code.verify.sql`
re-checks them after each apply.
