-- Roman Health: read-only legacy Early Access order history bridge.
--
-- PREPARED ONLY. Do not run from an agent session. This adds no table and
-- rewrites no history. It exposes three service-role-only, SECURITY DEFINER
-- reads over the already-applied M62 member/customer binding and the durable
-- legacy single-order tables.

begin;

do $precheck$
begin
  if to_regclass('public.research_early_access_legal_bindings') is null
     or to_regclass('public.research_early_access_placements') is null
     or to_regclass('public.research_early_access_order_lines') is null
     or to_regclass('public.research_early_access_money_snapshots') is null
     or to_regclass('public.research_early_access_settlements') is null
     or to_regclass('public.research_early_access_dispatch_events') is null
     or to_regclass('public.research_early_access_tracking') is null
     or to_regclass('public.research_early_access_fulfillments') is null
     or to_regprocedure('public.research_early_access_legal_binding_for_customer(text)') is null
  then
    raise exception 'Roman order history requires the applied legacy commerce and M62 legal-binding authority'
      using errcode = '55000';
  end if;
end;
$precheck$;

create or replace function public.research_early_access_customer_refs_for_member(
  p_member_id uuid
) returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_refs jsonb;
begin
  if p_member_id is null then
    raise exception 'member identity is required' using errcode = '22023';
  end if;

  -- A ref claimed by two members is not assigned to either by this reader.
  -- Fail the whole read so an operator repairs the contradictory durable fact.
  if exists (
    with claims as (
      select b.member_id, b.customer_ref as customer_ref
        from public.research_early_access_legal_bindings b
      union all
      select b.member_id, alias_ref
        from public.research_early_access_legal_bindings b
        cross join lateral unnest(b.alias_refs) alias_ref
    ), mine as (
      select distinct customer_ref from claims where member_id = p_member_id
    )
    select 1
      from mine
      join claims using (customer_ref)
     group by mine.customer_ref
    having count(distinct claims.member_id) <> 1
  ) then
    raise exception 'ambiguous Early Access customer ownership for member'
      using errcode = '21000';
  end if;

  with refs as (
    select b.customer_ref
      from public.research_early_access_legal_bindings b
     where b.member_id = p_member_id
    union
    select alias_ref
      from public.research_early_access_legal_bindings b
      cross join lateral unnest(b.alias_refs) alias_ref
     where b.member_id = p_member_id
  )
  select coalesce(jsonb_agg(customer_ref order by customer_ref), '[]'::jsonb)
    into v_refs
    from refs;

  return v_refs;
end;
$$;

create or replace function public.research_early_access_orders_for_member(
  p_member_id uuid
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  with owned_refs as (
    select jsonb_array_elements_text(
      public.research_early_access_customer_refs_for_member(p_member_id)
    ) as customer_ref
  ), owned as (
    select
      p.order_number,
      p.placed_at,
      p.payment_state,
      l.sku,
      l.quantity,
      l.line_total_cents,
      m.payable_total_cents,
      m.currency,
      case
        when f.order_number is not null then 'fulfilled'
        when exists (
          select 1 from public.research_early_access_dispatch_events d
           where d.order_number = p.order_number
             and d.kind = 'packing'
             and d.outcome = 'recorded'
        ) then 'packing'
        when s.order_number is not null then 'supplier_released'
        else 'not_released'
      end as fulfillment_state,
      coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'carrier', t.record->>'carrier',
            'trackingNumber', t.record->>'trackingNumber',
            'recordedAt', t.record->>'recordedAt'
          ) order by t.sequence
        )
        from public.research_early_access_tracking t
        where t.order_number = p.order_number
      ), '[]'::jsonb) as tracking
    from owned_refs r
    join public.research_early_access_placements p using (customer_ref)
    join public.research_early_access_order_lines l using (order_number)
    join public.research_early_access_money_snapshots m using (order_number)
    left join public.research_early_access_settlements s using (order_number)
    left join public.research_early_access_fulfillments f using (order_number)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'source', 'early_access_placement',
      'orderNumber', order_number,
      'placedAt', placed_at,
      'lines', jsonb_build_array(jsonb_build_object(
        'sku', sku,
        'quantity', quantity,
        'lineTotalCents', line_total_cents
      )),
      'totalCents', payable_total_cents,
      'currency', currency,
      'paymentState', payment_state,
      'fulfillmentState', fulfillment_state,
      'tracking', tracking
    ) order by placed_at desc, order_number desc
  ), '[]'::jsonb)
  from owned;
$$;

create or replace function public.research_early_access_order_for_member(
  p_member_id uuid,
  p_order_number text
) returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select entry
  from jsonb_array_elements(public.research_early_access_orders_for_member(p_member_id)) entry
  where entry->>'orderNumber' = p_order_number
  limit 1;
$$;

revoke all on function public.research_early_access_customer_refs_for_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.research_early_access_orders_for_member(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.research_early_access_order_for_member(uuid,text)
  from public, anon, authenticated, service_role;

grant execute on function public.research_early_access_customer_refs_for_member(uuid) to service_role;
grant execute on function public.research_early_access_orders_for_member(uuid) to service_role;
grant execute on function public.research_early_access_order_for_member(uuid,text) to service_role;

comment on function public.research_early_access_customer_refs_for_member(uuid) is
  'Service-role-only inverse M62 ownership lookup. Includes canonical and alias customer refs, and refuses ambiguous cross-member ownership.';
comment on function public.research_early_access_orders_for_member(uuid) is
  'Member-scoped, explicit allowlist projection of durable legacy single-order Early Access history.';
comment on function public.research_early_access_order_for_member(uuid,text) is
  'Member-scoped legacy single-order detail. A foreign or absent order is null.';

commit;
