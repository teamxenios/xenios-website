# M70 rollback notes: the Pack 02 account and organization schema

M70 is purely additive: eight new tables, their indexes and triggers, three
trigger functions, and three SECURITY DEFINER service_role-only functions,
plus one seed row (the roman-digital organization). It alters no existing
object and never touches the partner system's `public.research_organizations`
(decision D-004; the account table lives at
`public.research_account_organizations`).

## When rollback is clean

Before the account system has taken real bindings, rollback is a pure drop
with no data loss beyond the seed row. After real organization users,
customer bindings, or order-ownership rows exist, a drop destroys that
evidence; at that point prefer disabling the account API surface (it is the
only writer) and treating the schema as dormant instead of dropping it.

## Procedure (dependency order; run in one transaction)

```sql
begin;

drop function if exists public.research_account_accept_organization_invitation(uuid, bytea, uuid, text);
drop function if exists public.research_account_commit_customer_claim(uuid, bytea, uuid, text);
drop function if exists public.research_bind_verified_organization_user(uuid, uuid, text, text[], text, boolean);

drop table if exists public.research_organization_request_again;
drop table if exists public.research_account_binding_events;
drop table if exists public.research_organization_order_ownership;
drop table if exists public.research_customer_account_bindings;
drop table if exists public.research_account_claim_challenges;
drop table if exists public.research_organization_invitations;
drop table if exists public.research_organization_users;
drop table if exists public.research_account_organizations;

drop function if exists public.research_account_binding_events_immutable();
drop function if exists public.research_organization_request_again_validate();
drop function if exists public.research_organization_order_ownership_validate();

commit;
```

Dropping a table drops its own triggers and indexes with it; the three
trigger functions are dropped after their tables. `pgcrypto` stays: it is
shared infrastructure and predates M70 on every target database.

## Post-rollback verification

```sql
select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname in (
  'research_account_organizations','research_organization_users',
  'research_organization_invitations','research_account_claim_challenges',
  'research_customer_account_bindings','research_organization_order_ownership',
  'research_account_binding_events','research_organization_request_again');
-- expect 0
select to_regclass('public.research_organizations') is not null;
-- expect t where the partner table existed before; M70 and this rollback
-- leave it untouched in both directions
```
