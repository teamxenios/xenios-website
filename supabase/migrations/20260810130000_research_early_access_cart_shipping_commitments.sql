-- Xenios Research Early Access shipping-commitment work list (M64).
--
-- WHY THIS MIGRATION EXISTS.
--
-- The 72-hour shipping SLA monitor reads ONE port:
--
--   EarlyAccessShippingSlaStore.dueBy(nowIso)
--     -> readonly { cartCheckoutNumber, shipByAt, stage }[]
--
-- That is a LIST read, and after M62 the deployment has no way to answer it.
-- `ship_by_at` exists only on public.research_early_access_cart_settlement_hardening,
-- and M62 deliberately runs
--
--   revoke all on <every M62 table> from public, anon, authenticated, service_role
--
-- with forced row level security and no compensating grant, so the application
-- cannot read that table directly at all. Of the thirteen routines M62 grants,
-- the only shipping-commitment reader is keyed by a SINGLE checkout number, and
-- no routine anywhere in this schema enumerates cart checkouts. The monitor was
-- therefore library code that no production composition could ever drive.
--
-- THE M62 BOUNDARY IS NOT WIDENED TO FIX THAT. No table gains a SELECT grant.
-- This migration adds ONE read-only routine behind the same security-definer
-- boundary every other Early Access read already uses, and grants EXECUTE on it
-- to service_role alone.
--
-- WHAT THE ROUTINE MAY AND MAY NOT DO.
--
--   * It is `stable`: it cannot insert, update or delete. Nothing here settles a
--     checkout, verifies a payment, creates a notification, creates or changes
--     shipment state, publishes anything, or moves a payment state.
--   * It returns three fields and no more: the checkout number, the durable
--     `ship_by_at`, and the durable shipment stage. No customer, contact,
--     supplier, payment, proof, transaction, agreement or internal-email fact
--     leaves it.
--   * `payment_verified_at` is deliberately NOT returned. The commitment
--     contract does not carry it, and `ship_by_at` is already constrained by
--     `research_ea_settlement_ship_by_exact` to be exactly
--     `payment_verified_at + interval '72 hours'`, so returning both would ship
--     the same fact twice and invite them to drift.
--
-- WHAT "DUE" MEANS HERE, AND WHAT IT DELIBERATELY DOES NOT MEAN.
--
-- The routine filters on the two facts the DATABASE owns: the commitment has
-- come due (`ship_by_at <= p_now`) and the checkout has not been superseded
-- (`disposition is null`). It does NOT decide overdue-ness, and it does NOT drop
-- a fully shipped commitment.
--
-- That is on purpose. `earlyAccessIsOverdue` in shared/research/early-access-hardening.ts
-- is the one place the rule "a shipped order is never overdue" lives, and it is
-- already covered by tests. Restating it in SQL would put the same rule in two
-- languages, where only one of them can be changed at a time. So this routine
-- reports the durable stage and the application decides, which is also why a
-- fully shipped commitment is still returned: the monitor counts it as examined
-- and then, correctly, alerts on nothing.
--
-- HOW `stage` IS DERIVED.
--
-- From durable fulfilment events only, with the SAME supersession rule as
-- `projectEarlyAccessShipmentEvents`: an event is active when no later event
-- names it in `supersedes_event_id`, so a `shipment_voided` retires the
-- `shipment_shipped` it supersedes. A child order counts as shipped when it has
-- an ACTIVE `shipment_shipped` event.
--
--   all child orders shipped   -> 'shipped'
--   some but not all           -> 'partially_shipped'
--   none                       -> 'processing'
--
-- Every row in this list has a settlement hardening record, so payment is
-- verified by construction and `checkout_reserved` is unreachable. That is why
-- the three values are exactly the three the commitment contract accepts.
--
-- ADDITIVE / FAIL-CLOSED:
--   * creates no table, alters no table, adds no column, adds no index;
--   * writes no row of any kind;
--   * touches neither M61, M62 nor M63; changes no existing routine;
--   * refuses to run at all if the prerequisite M62 schema is absent;
--   * re-runnable: `create or replace` plus idempotent grants, so a second
--     apply is a no-op in effect.
--
-- Requires the accepted M62 chain (research_early_access_cart_settlement_hardening,
-- research_early_access_cart_fulfilment_events) and the cart schema
-- (research_early_access_cart_checkouts, research_early_access_cart_items).

begin;

-- ---------------------------------------------------------------------------
-- Preflight. Fail closed rather than create a routine over absent schema.
-- ---------------------------------------------------------------------------

do $m64_preflight$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_cart_checkouts',
    'research_early_access_cart_items',
    'research_early_access_cart_settlement_hardening',
    'research_early_access_cart_fulfilment_events'
  ] loop
    if to_regclass('public.' || v_table) is null then
      raise exception
        'M64 requires the accepted M62 cart schema; public.% is absent', v_table
        using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_settlement_hardening'
      and att.attname = 'ship_by_at'
      and att.attnum > 0
      and not att.attisdropped
  ) then
    raise exception
      'M64 requires public.research_early_access_cart_settlement_hardening.ship_by_at'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_checkouts'
      and att.attname = 'disposition'
      and att.attnum > 0
      and not att.attisdropped
  ) then
    raise exception
      'M64 requires public.research_early_access_cart_checkouts.disposition (M62 duplicate guard)'
      using errcode = '55000';
  end if;
end;
$m64_preflight$;

-- ---------------------------------------------------------------------------
-- The one read routine.
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_cart_shipping_commitments_due(
  p_now timestamptz
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'cartCheckoutNumber', due.checkout_number,
        'shipByAt',           due.ship_by_at,
        'stage',              due.stage
      )
      -- Deterministic: oldest commitment first, checkout number breaking ties,
      -- so two sweeps over an unchanged database return byte-identical lists.
      order by due.ship_by_at, due.checkout_number
    ),
    '[]'::jsonb
  )
  from (
    select
      c.checkout_number,
      h.ship_by_at,
      case
        when i.total > 0 and i.shipped >= i.total then 'shipped'
        when i.shipped > 0 then 'partially_shipped'
        else 'processing'
      end as stage
    from public.research_early_access_cart_settlement_hardening h
    join public.research_early_access_cart_checkouts c
      on c.id = h.cart_checkout_id
    cross join lateral (
      select
        count(*) as total,
        count(*) filter (
          where exists (
            select 1
            from public.research_early_access_cart_fulfilment_events e
            where e.cart_item_id = it.id
              and e.event_type = 'shipment_shipped'
              and not exists (
                select 1
                from public.research_early_access_cart_fulfilment_events s
                where s.supersedes_event_id = e.id
              )
          )
        ) as shipped
      from public.research_early_access_cart_items it
      where it.cart_checkout_id = c.id
    ) as i
    where h.ship_by_at <= p_now
      and c.disposition is null
  ) as due
$$;

comment on function public.research_early_access_cart_shipping_commitments_due(timestamptz) is
  'Read-only 72-hour shipping SLA work list: every non-superseded cart checkout whose durable ship_by_at has come due, with its durable shipment stage. Writes nothing, decides no overdue-ness, and exposes no customer, supplier, payment or proof fact.';

-- ---------------------------------------------------------------------------
-- Privileges. The same shape as every other Early Access routine: nothing for
-- the public roles, EXECUTE for service_role, and NO table grant anywhere.
-- ---------------------------------------------------------------------------

revoke all on function public.research_early_access_cart_shipping_commitments_due(timestamptz)
  from public, anon, authenticated;
grant execute on function public.research_early_access_cart_shipping_commitments_due(timestamptz)
  to service_role;

-- ---------------------------------------------------------------------------
-- Post-condition. The migration proves its own effect and its own boundary
-- before committing.
-- ---------------------------------------------------------------------------

do $m64_postcondition$
declare
  v_oid oid;
  v_provolatile "char";
  v_prosecdef boolean;
  v_role text;
  v_table text;
begin
  select p.oid, p.provolatile, p.prosecdef
  into v_oid, v_provolatile, v_prosecdef
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_cart_shipping_commitments_due'
    -- Matched on the argument TYPE, not on the rendered signature:
    -- pg_get_function_identity_arguments includes the parameter NAME, so a
    -- string comparison would silently miss.
    and p.pronargs = 1
    and p.proargtypes[0] = 'pg_catalog.timestamptz'::regtype;

  if v_oid is null then
    raise exception 'M64 post-condition: the read routine was not created'
      using errcode = '55000';
  end if;
  if v_provolatile <> 's' then
    raise exception 'M64 post-condition: the read routine must be STABLE, found volatility %',
      v_provolatile using errcode = '55000';
  end if;
  if not v_prosecdef then
    raise exception 'M64 post-condition: the read routine must be SECURITY DEFINER'
      using errcode = '55000';
  end if;

  -- PUBLIC is a pseudo-role and has no pg_roles entry, so it is read straight
  -- off the ACL (grantee 0) rather than through has_function_privilege.
  if exists (
    select 1
    from pg_proc p, aclexplode(p.proacl) acl
    where p.oid = v_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'M64 post-condition: PUBLIC may execute the read routine'
      using errcode = '55000';
  end if;

  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = v_role)
       and has_function_privilege(v_role, v_oid, 'EXECUTE') then
      raise exception 'M64 post-condition: % may execute the read routine', v_role
        using errcode = '55000';
    end if;
  end loop;

  if exists (select 1 from pg_roles where rolname = 'service_role')
     and not has_function_privilege('service_role', v_oid, 'EXECUTE') then
    raise exception 'M64 post-condition: service_role cannot execute the read routine'
      using errcode = '55000';
  end if;

  -- THE BOUNDARY M64 MUST NOT MOVE. If any of these became directly readable,
  -- the routine would no longer be the only way in and this migration would
  -- have widened exactly what it exists to avoid widening.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    foreach v_table in array array[
      'research_early_access_cart_settlement_hardening',
      'research_early_access_cart_fulfilment_events'
    ] loop
      if has_table_privilege('service_role', 'public.' || v_table, 'SELECT') then
        raise exception
          'M64 post-condition: service_role has direct SELECT on public.%, the M62 boundary is broken',
          v_table using errcode = '55000';
      end if;
    end loop;
  end if;
end;
$m64_postcondition$;

commit;
