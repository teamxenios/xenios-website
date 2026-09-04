-- LOCAL CANDIDATE ONLY; apply AFTER 20260904_research_partner_referral_v1.sql.
-- Admin account-linked lineage, NOT referral conversion/payment/commission proof.
-- This adds no table grants, no write operations, and no browser-facing authority.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'Lineage candidate requires a reviewed BYPASSRLS owner';
  end if;
  if not exists(select 1 from pg_catalog.pg_proc where oid=pg_catalog.to_regprocedure('public.research_referral_v1_authority()')
      and proowner=current_user::pg_catalog.regrole::oid) then
    raise exception 'Apply primary referral candidate first under the same reviewed owner';
  end if;
  if pg_catalog.to_regprocedure('public.research_partner_referral_v1_lineage(text[],integer)') is not null then
    raise exception 'Lineage already exists; review instead of silently replacing';
  end if;
  perform public.research_referral_v1_authority();
end $preflight$;

create function public.research_partner_referral_v1_lineage(p_account_keys text[], p_limit integer default 100)
returns jsonb language plpgsql stable security definer set search_path='' as $lineage$
declare
  v_unavailable constant jsonb := '{"state":"unavailable","records":[]}'::jsonb;
  v_records jsonb := '[]'::jsonb;
  v_expected record;
  v_binding record;
  v_row record;
  v_key text;
  v_owner_count integer;
  v_count integer;
  v_bound_at timestamptz;
  v_member_id uuid;
  v_authority jsonb;
begin
  -- Caller chooses only a bounded stored-key subset, never member IDs or time.
  if p_account_keys is null or p_limit is null or p_limit<1 or p_limit>100
      or pg_catalog.cardinality(p_account_keys)>100
      or (pg_catalog.cardinality(p_account_keys)>0 and
        (pg_catalog.array_ndims(p_account_keys)<>1 or pg_catalog.array_lower(p_account_keys,1)<>1)) then
    return v_unavailable;
  end if;
  if exists(select 1 from pg_catalog.unnest(p_account_keys) as k(value)
      where value is null or value !~ '^auth:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
      or (select pg_catalog.count(distinct value) from pg_catalog.unnest(p_account_keys) as k(value))<>pg_catalog.cardinality(p_account_keys) then
    return v_unavailable;
  end if;
  v_authority := public.research_referral_v1_authority();
  if v_authority is distinct from '{"ok":true,"value":{"schemaVersion":"gen2_referral_v1_20260904"}}'::jsonb then
    return v_unavailable;
  end if;

  -- Optional canonical request/order sources are deliberately checked at runtime.
  -- Missing or unsupported schema is unavailable, including with an empty key set.
  for v_expected in select * from (values
    ('research_affiliate_customer_bindings','customer_key','text'),
    ('research_affiliate_customer_bindings','referral_version','int2'),
    ('research_affiliate_customer_bindings','bound_at','timestamptz'),
    ('research_members','id','uuid'),('research_members','auth_user_id','uuid'),('research_members','status','text'),
    ('research_assisted_order_requests','id','uuid'),('research_assisted_order_requests','actor_member_id','uuid'),
    ('research_assisted_order_requests','public_reference','text'),('research_assisted_order_requests','status','text'),
    ('research_assisted_order_requests','created_at','timestamptz'),
    ('research_orders','id','uuid'),('research_orders','member_id','uuid'),('research_orders','state','text'),
    ('research_orders','created_at','timestamptz')
  ) as expected(table_name,column_name,type_name) loop
    if not exists(select 1 from pg_catalog.pg_attribute a join pg_catalog.pg_class c on c.oid=a.attrelid
        where c.oid=pg_catalog.to_regclass('public.'||v_expected.table_name) and c.relkind in ('r','p')
          and a.attname=v_expected.column_name and a.attnum>0 and not a.attisdropped
          and a.atttypid=pg_catalog.to_regtype('pg_catalog.'||v_expected.type_name)) then
      return v_unavailable;
    end if;
  end loop;

  foreach v_key in array p_account_keys loop
    v_owner_count := 0;
    v_member_id := null;
    -- Only exact Auth UUID -> canonical member ID ownership. No email/EA fallback.
    for v_binding in execute $query$
      select b.bound_at, m.id as member_id, m.status as member_status
      from public.research_affiliate_customer_bindings b
      left join public.research_members m on m.auth_user_id=pg_catalog.substr(b.customer_key,6)::uuid
      where b.customer_key=$1 and b.referral_version=1 limit 2
    $query$ using v_key loop
      v_owner_count := v_owner_count+1;
      if v_binding.member_id is null or v_binding.member_status is null or v_binding.member_status='closed'
          or pg_catalog.isfinite(v_binding.bound_at) is not true then
        return v_unavailable;
      end if;
      v_member_id := v_binding.member_id;
      v_bound_at := v_binding.bound_at;
    end loop;
    if v_owner_count<>1 then return v_unavailable; end if;

    -- Each source is capped AFTER the exact account's DB-derived bind timestamp.
    -- A sentinel refuses truncated evidence instead of presenting false completeness.
    v_count := 0;
    for v_row in execute $query$
      select id, public_reference, status, created_at
      from public.research_assisted_order_requests
      where actor_member_id=$1 and (created_at is null or created_at>=$2)
      order by created_at desc nulls first, id limit $3
    $query$ using v_member_id, v_bound_at, p_limit+1 loop
      v_count := v_count+1;
      if v_count>p_limit or v_row.id is null or v_row.public_reference is null
          or v_row.public_reference !~ '^XRR-[0-9]{8}-[A-F0-9]{10}$'
          or pg_catalog.isfinite(v_row.created_at) is not true
          or v_row.created_at<v_bound_at or v_row.status is null
          or v_row.status not in ('submitted','reviewing','waiting_on_customer','identity_requested','identity_received',
            'agreements_pending','agreements_complete','payment_pending','payment_review','paid','supplier_processing',
            'shipped','delivered','closed','cancelled') then return v_unavailable; end if;
      v_records := v_records || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'accountKey',v_key,'type','request','reference',v_row.public_reference,'state',v_row.status,
        'occurredAt',v_row.created_at,'boundAt',v_bound_at,'attribution','account_binding_only'));
    end loop;

    v_count := 0;
    for v_row in execute $query$
      select id, state, created_at from public.research_orders
      where member_id=$1 and (created_at is null or created_at>=$2)
      order by created_at desc nulls first, id limit $3
    $query$ using v_member_id, v_bound_at, p_limit+1 loop
      v_count := v_count+1;
      if v_count>p_limit or v_row.id is null or pg_catalog.isfinite(v_row.created_at) is not true
          or v_row.created_at<v_bound_at or v_row.state is null
          or v_row.state not in ('draft','checkout_pending','payment_authorized','manual_review','approved','payment_captured',
            'processing','partially_fulfilled','fulfilled','delivered','exception','cancelled','refunded','replaced') then
        return v_unavailable;
      end if;
      v_records := v_records || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'accountKey',v_key,'type','order','reference',v_row.id,'state',v_row.state,
        'occurredAt',v_row.created_at,'boundAt',v_bound_at,'attribution','account_binding_only'));
    end loop;
  end loop;
  if exists(select 1 from pg_catalog.jsonb_array_elements(v_records) as r(value)
      group by value->>'type',value->>'reference' having pg_catalog.count(*)>1) then
    return v_unavailable;
  end if;
  return pg_catalog.jsonb_build_object('state','available','records',v_records);
exception when others then
  -- No raw SQL/provider details or partial results cross the projection boundary.
  return v_unavailable;
end $lineage$;

revoke all on function public.research_partner_referral_v1_lineage(text[],integer) from public,anon,authenticated,service_role;
grant execute on function public.research_partner_referral_v1_lineage(text[],integer) to service_role;

do $postconditions$
declare v_function record;
begin
  select p.* into strict v_function from pg_catalog.pg_proc p
    where p.oid='public.research_partner_referral_v1_lineage(text[],integer)'::pg_catalog.regprocedure;
  if not v_function.prosecdef or v_function.provolatile<>'s'
      or v_function.proowner<>current_user::pg_catalog.regrole::oid
      or v_function.proconfig is distinct from array['search_path=""']::text[]
      or pg_catalog.has_function_privilege('anon',v_function.oid,'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated',v_function.oid,'EXECUTE')
      or not pg_catalog.has_function_privilege('service_role',v_function.oid,'EXECUTE') then
    raise exception 'Lineage function boundary invalid';
  end if;
  perform public.research_referral_v1_authority();
end $postconditions$;
commit;
