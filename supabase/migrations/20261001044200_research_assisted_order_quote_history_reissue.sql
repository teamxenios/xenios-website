-- HIST-02 source-only successor after history/immutability and durable effects.
-- A historical payment workflow label is not payment evidence. Permit a fresh
-- authoritative quote only when no acceptance, observation, verification or
-- paid history exists. No data adoption, price release or financial disposition.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare v_guard record;
begin
  if pg_catalog.to_regprocedure('public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)') is null
     or pg_catalog.to_regprocedure('public.research_assisted_order_payment_effects_authority()') is null then
    raise exception 'Quote reissue requires history and durable-effects predecessors'
      using errcode = '55000', detail = 'ASSISTED_ORDER_QUOTE_REISSUE_PREDECESSOR_REQUIRED';
  end if;
  for v_guard in select * from (values
    ('public.research_assisted_order_requests', 'hl12_history_progression', 'public.research_assisted_order_history_progression_guard()'),
    ('public.research_assisted_order_quotes', 'hl12_quote_snapshot_immutable', 'public.research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_quotes', 'hl12_quote_snapshot_no_truncate', 'public.research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_payment_observations', 'hl12_provider_observation_hold', 'public.research_assisted_order_provider_payment_hold_guard()'),
    ('public.research_assisted_order_payment_verifications', 'hl12_provider_verification_hold', 'public.research_assisted_order_provider_payment_hold_guard()')
  ) as guards(relation_name, trigger_name, function_name) loop
    if not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid = pg_catalog.to_regclass(v_guard.relation_name)
        and t.tgname = v_guard.trigger_name and t.tgenabled in ('O','A')
        and t.tgfoid = pg_catalog.to_regprocedure(v_guard.function_name)) then
      raise exception 'Quote reissue prerequisite guard is absent or ineffective'
        using errcode = '55000', detail = 'ASSISTED_ORDER_QUOTE_REISSUE_PREDECESSOR_REQUIRED';
    end if;
  end loop;
end
$preflight$;

create or replace function public.research_assisted_order_quote_issue(
  p_request_id uuid,
  p_line_decisions jsonb,
  p_valid_until timestamptz,
  p_actor_id text,
  p_customer_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $issue$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_line public.research_assisted_order_lines%rowtype;
  v_decision jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_basis jsonb := '{}'::jsonb;
  v_unit bigint;
  v_line_total bigint;
  v_total bigint := 0;
  v_count integer := 0;
  v_version integer;
  v_quote_id uuid;
begin
  if nullif(pg_catalog.btrim(p_actor_id), '') is null then
    raise exception 'Named quote issuer required' using errcode = 'P0001';
  end if;
  if p_valid_until <= now() or p_valid_until > now() + interval '30 days' then
    raise exception 'Quote validity must be within 30 days' using errcode = 'P0001';
  end if;
  if pg_catalog.jsonb_typeof(p_line_decisions) <> 'array' then
    raise exception 'Quote decisions must be an array' using errcode = 'P0001';
  end if;

  -- HIST-02: lock the parent before every financial/state decision. Acceptance,
  -- observation, verification and status writes serialize on this same row.
  select * into v_request from public.research_assisted_order_requests
  where id = p_request_id for update;
  if not found or v_request.status not in (
    'reviewing', 'waiting_on_customer', 'identity_received',
    'agreements_pending', 'agreements_complete', 'payment_pending', 'payment_review'
  ) then
    raise exception 'Request is not quote-ready' using errcode = 'P0001';
  end if;
  -- Accepted prices never expire into permission to reprice. An expired offer
  -- that was NOT accepted can be replaced with a new version below.
  if exists (select 1 from public.research_assisted_order_quotes
             where request_id = p_request_id and state = 'accepted') then
    raise exception 'An accepted quote cannot be repriced' using errcode = 'P0001';
  end if;
  -- Any observation counts, including corrected/superseded and held provider
  -- rows. Absence of verification is never evidence of no funds (N2 stays held).
  if exists (select 1 from public.research_assisted_order_payment_observations
             where request_id = p_request_id)
     or exists (select 1 from public.research_assisted_order_payment_verifications
                where request_id = p_request_id)
     or exists (select 1 from public.research_assisted_order_events
                where request_id = p_request_id and status = 'paid') then
    raise exception 'Financial history requires governed reconciliation before another quote'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_FINANCIAL_HISTORY_HOLD';
  end if;

  for v_line in select * from public.research_assisted_order_lines
                where request_id = p_request_id order by created_at, id loop
    v_count := v_count + 1;
    if v_line.workflow_mode not in ('direct_order_request', 'request_pricing') then
      raise exception 'Held or Care lines cannot be quoted for Research payment'
        using errcode = 'P0001';
    end if;
    if (select count(*) from pg_catalog.jsonb_array_elements(p_line_decisions) d
        where d ->> 'lineId' = v_line.id::text) <> 1 then
      raise exception 'Quote must identify each request line exactly once'
        using errcode = 'P0001';
    end if;
    select d into v_decision from pg_catalog.jsonb_array_elements(p_line_decisions) d
    where d ->> 'lineId' = v_line.id::text;

    if v_line.unit_price_cents is not null then
      if v_decision ? 'unitPriceCents'
         and (pg_catalog.jsonb_typeof(v_decision -> 'unitPriceCents') <> 'number'
              or v_decision ->> 'unitPriceCents' <> v_line.unit_price_cents::text) then
        raise exception 'A priced line must retain its authoritative unit price'
          using errcode = 'P0001';
      end if;
      v_unit := v_line.unit_price_cents;
    else
      if v_line.workflow_mode <> 'request_pricing'
         or pg_catalog.jsonb_typeof(v_decision -> 'unitPriceCents') <> 'number'
         or v_decision ->> 'unitPriceCents' !~ '^[0-9]{1,9}$'
         or nullif(pg_catalog.btrim(v_decision ->> 'pricingBasis'), '') is null then
        raise exception 'Unpriced line needs positive quoted cents and private pricing basis'
          using errcode = 'P0001';
      end if;
      v_unit := (v_decision ->> 'unitPriceCents')::bigint;
      v_basis := v_basis || pg_catalog.jsonb_build_object(
        v_line.id::text, v_decision ->> 'pricingBasis');
    end if;
    if v_unit <= 0 then
      raise exception 'Quote unit price must be positive' using errcode = 'P0001';
    end if;
    v_line_total := v_unit * v_line.quantity;
    v_total := v_total + v_line_total;
    if v_total > 100000000 then
      raise exception 'Quote total exceeds the payment limit' using errcode = 'P0001';
    end if;
    v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'lineId', v_line.id,
      'productId', v_line.product_id,
      'variantId', v_line.variant_id,
      'productName', v_line.product_name,
      'specification', v_line.specification,
      'quantity', v_line.quantity,
      'unitPriceCents', v_unit,
      'lineTotalCents', v_line_total,
      'currency', 'USD',
      'priceSource', case when v_line.unit_price_cents is null then 'quoted' else 'catalog' end
    ));
  end loop;
  if v_count = 0 or pg_catalog.jsonb_array_length(p_line_decisions) <> v_count then
    raise exception 'Quote decisions do not match the request lines' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.research_assisted_order_quotes where request_id = p_request_id;
  update public.research_assisted_order_quotes set state = 'superseded'
  where request_id = p_request_id and state = 'issued';
  insert into public.research_assisted_order_quotes (
    request_id, version, state, lines, pricing_basis, total_cents, currency,
    issued_by, valid_until, customer_note
  ) values (
    p_request_id, v_version, 'issued', v_lines, v_basis, v_total, 'USD',
    pg_catalog.btrim(p_actor_id), p_valid_until,
    nullif(pg_catalog.btrim(p_customer_note), '')
  ) returning id into v_quote_id;
  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote_id, 'requestPublicReference', v_request.public_reference,
    'version', v_version, 'state', 'issued', 'lines', v_lines,
    'totalCents', v_total, 'currency', 'USD', 'validUntil', p_valid_until
  );
end
$issue$;

revoke all on function public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)
  to service_role;

do $postcondition$
declare v_role text; v_signature text := 'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)';
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role, v_signature, 'EXECUTE') is distinct from (v_role = 'service_role')
       or has_table_privilege(v_role, 'public.research_assisted_order_quotes', 'INSERT,UPDATE,DELETE,TRUNCATE') then
      raise exception 'Quote reissue RPC-only boundary failed' using errcode = '55000';
    end if;
  end loop;
  if not exists (select 1 from pg_catalog.pg_proc p where p.oid = v_signature::regprocedure
      and p.prosecdef and ('search_path=""' = any(p.proconfig))) then
    raise exception 'Quote reissue security configuration failed' using errcode = '55000';
  end if;
end
$postcondition$;
commit;
