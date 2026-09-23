-- Bounded commerce repository authorities plus deterministic ACL convergence.
-- Source-only release candidate: applying this file remotely requires a later,
-- explicit authorization.

begin;

create or replace function public.research_claim_repository(
  p_action text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $claim_authority$
declare
  v_result jsonb;
  v_claim_id uuid;
  v_order_id uuid;
  v_member_id uuid;
  v_scope text;
  v_reference text;
  v_inserted boolean := false;
  v_state text;
  v_refunded_cents bigint;
  v_updated_at timestamptz;
  v_row_count integer;
begin
  if p_action is null or p_payload is null or pg_catalog.jsonb_typeof(p_payload) <> 'object' then
    raise exception using errcode='22023', message='commerce_claim_authority_request_invalid';
  end if;

  case p_action
    when 'get' then
      v_claim_id := nullif(p_payload->>'claimId','')::uuid;
      select pg_catalog.to_jsonb(c) into v_result
        from public.research_claims c where c.id=v_claim_id;
      return v_result;

    when 'list_by_member' then
      v_member_id := nullif(p_payload->>'memberId','')::uuid;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.submitted_at,c.id),'[]'::jsonb)
        into v_result from public.research_claims c where c.member_id=v_member_id;
      return v_result;

    when 'list_by_order' then
      v_order_id := nullif(p_payload->>'orderId','')::uuid;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.submitted_at,c.id),'[]'::jsonb)
        into v_result from public.research_claims c where c.order_id=v_order_id;
      return v_result;

    when 'list_open' then
      if p_payload <> '{}'::jsonb then
        raise exception using errcode='22023', message='commerce_claim_authority_request_invalid';
      end if;
      select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) order by c.submitted_at,c.id),'[]'::jsonb)
        into v_result from public.research_claims c
       where c.state not in ('resolved','declined');
      return v_result;

    when 'save' then
      if p_payload - array['claimId','orderId','memberId','sku','lotId','reason','state','resolution',
                           'evidenceRefs','reviewedBy','submittedAt','notes','updatedAt'] <> '{}'::jsonb
         or pg_catalog.jsonb_typeof(coalesce(p_payload->'evidenceRefs','[]'::jsonb)) <> 'array' then
        raise exception using errcode='22023', message='commerce_claim_authority_request_invalid';
      end if;
      v_claim_id := nullif(p_payload->>'claimId','')::uuid;
      v_order_id := nullif(p_payload->>'orderId','')::uuid;
      v_member_id := nullif(p_payload->>'memberId','')::uuid;
      if nullif(p_payload->>'sku','') is null or pg_catalog.length(p_payload->>'sku') > 200
         or nullif(p_payload->>'reason','') is null or nullif(p_payload->>'state','') is null
         or pg_catalog.jsonb_array_length(coalesce(p_payload->'evidenceRefs','[]'::jsonb)) > 32
         or pg_catalog.length(coalesce(p_payload->>'notes','')) > 4000
         or not exists (select 1 from public.research_orders o where o.id=v_order_id and o.member_id=v_member_id) then
        raise exception using errcode='22023', message='commerce_claim_authority_request_invalid';
      end if;
      insert into public.research_claims(
        id,order_id,member_id,sku,lot_id,reason,state,resolution,evidence_refs,
        reviewed_by,submitted_at,notes,updated_at
      ) values (
        v_claim_id,v_order_id,v_member_id,p_payload->>'sku',nullif(p_payload->>'lotId',''),
        p_payload->>'reason',p_payload->>'state',nullif(p_payload->>'resolution',''),
        array(select pg_catalog.jsonb_array_elements_text(coalesce(p_payload->'evidenceRefs','[]'::jsonb))),
        nullif(p_payload->>'reviewedBy',''),nullif(p_payload->>'submittedAt','')::timestamptz,
        coalesce(p_payload->>'notes',''),coalesce(nullif(p_payload->>'updatedAt','')::timestamptz,pg_catalog.clock_timestamp())
      )
      on conflict(id) do update set
        sku=excluded.sku, lot_id=excluded.lot_id, reason=excluded.reason,
        state=excluded.state, resolution=excluded.resolution,
        evidence_refs=excluded.evidence_refs, reviewed_by=excluded.reviewed_by,
        submitted_at=excluded.submitted_at, notes=excluded.notes, updated_at=excluded.updated_at
      where research_claims.order_id=excluded.order_id
        and research_claims.member_id=excluded.member_id;
      get diagnostics v_row_count = row_count;
      if v_row_count <> 1 then
        raise exception using errcode='23505', message='commerce_claim_authority_identity_conflict';
      end if;
      select pg_catalog.to_jsonb(c) into v_result from public.research_claims c where c.id=v_claim_id;
      return v_result;

    when 'refund_key_get' then
      v_scope := nullif(p_payload->>'scope','');
      if v_scope is null or pg_catalog.length(v_scope)>256 then
        raise exception using errcode='22023', message='commerce_refund_key_invalid';
      end if;
      select pg_catalog.jsonb_build_object('scope',r.scope,'refundReference',r.refund_reference)
        into v_result from public.research_refund_keys r where r.scope=v_scope;
      return v_result;

    when 'refund_key_reserve' then
      v_scope := nullif(p_payload->>'scope','');
      v_reference := nullif(p_payload->>'refundReference','');
      if v_scope is null or v_reference is null or pg_catalog.length(v_scope)>256
         or pg_catalog.length(v_reference)>256 then
        raise exception using errcode='22023', message='commerce_refund_key_invalid';
      end if;
      insert into public.research_refund_keys(scope,refund_reference)
        values(v_scope,v_reference) on conflict(scope) do nothing;
      get diagnostics v_row_count = row_count;
      v_inserted := v_row_count=1;
      select r.refund_reference into v_reference from public.research_refund_keys r where r.scope=v_scope;
      return pg_catalog.jsonb_build_object(
        'scope',v_scope,'refundReference',v_reference,'inserted',v_inserted,
        'matches',v_reference=(p_payload->>'refundReference')
      );

    when 'claim_order_update' then
      v_order_id := nullif(p_payload->>'orderId','')::uuid;
      v_state := nullif(p_payload->>'state','');
      v_refunded_cents := nullif(p_payload->>'refundedCents','')::bigint;
      v_updated_at := coalesce(nullif(p_payload->>'updatedAt','')::timestamptz,pg_catalog.clock_timestamp());
      if v_state not in ('refunded','replaced') or v_refunded_cents is null or v_refunded_cents < 0 then
        raise exception using errcode='22023', message='commerce_claim_order_update_invalid';
      end if;
      update public.research_orders set
        state=v_state,
        refunded_cents=v_refunded_cents,
        last_idempotency_key=nullif(p_payload->>'lastIdempotencyKey',''),
        updated_at=v_updated_at
      where id=v_order_id;
      get diagnostics v_row_count = row_count;
      return pg_catalog.jsonb_build_object('updated',v_row_count=1,'orderId',v_order_id);

    else
      raise exception using errcode='22023', message='commerce_claim_authority_action_invalid';
  end case;
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode='22023', message='commerce_claim_authority_request_invalid';
end
$claim_authority$;

create or replace function public.research_order_persist(
  p_order jsonb,
  p_lines jsonb,
  p_shipments jsonb
) returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $order_persist$
declare
  v_order_id uuid;
  v_member_id uuid;
  v_prior_state text;
  v_prior_member uuid;
  v_prior_checkout_key text;
  v_state text;
  v_checkout_key text;
begin
  if p_order is null or p_lines is null or p_shipments is null
     or pg_catalog.jsonb_typeof(p_order)<>'object'
     or pg_catalog.jsonb_typeof(p_lines)<>'array'
     or pg_catalog.jsonb_typeof(p_shipments)<>'array'
     or pg_catalog.jsonb_array_length(p_lines)>100
     or pg_catalog.jsonb_array_length(p_shipments)>20 then
    raise exception using errcode='22023', message='commerce_order_persist_request_invalid';
  end if;
  v_order_id := nullif(p_order->>'id','')::uuid;
  v_member_id := nullif(p_order->>'member_id','')::uuid;
  v_state := nullif(p_order->>'state','');
  v_checkout_key := nullif(p_order->>'checkout_idempotency_key','');
  if v_state not in ('draft','checkout_pending','payment_authorized','manual_review','approved',
                     'payment_captured','processing','partially_fulfilled','fulfilled','delivered',
                     'exception','cancelled','refunded','replaced') then
    raise exception using errcode='22023', message='commerce_order_persist_request_invalid';
  end if;

  -- Serialize both the existing-row and fresh-create cases. A row lock cannot
  -- protect an absent UUID, so the transaction-scoped advisory lock closes the
  -- concurrent first-insert identity gap before inspecting durable identity.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_order_id::text,0)
  );

  select o.state,o.member_id,o.checkout_idempotency_key
    into v_prior_state,v_prior_member,v_prior_checkout_key
    from public.research_orders o where o.id=v_order_id for update;
  if found and (v_prior_member is distinct from v_member_id
                or v_prior_checkout_key is distinct from v_checkout_key) then
    raise exception using errcode='23505', message='commerce_order_persist_identity_conflict';
  end if;

  insert into public.research_orders(
    id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,
    authorized_amount_cents,captured_amount_cents,payment_reference,checkout_idempotency_key,
    last_idempotency_key,review_triggers,approved_by,approved_at,cancellation_reason,
    authorization_release_failed,created_at,updated_at
  ) values (
    v_order_id,v_member_id,v_state,(p_order->>'subtotal_cents')::bigint,
    (p_order->>'shipping_cents')::bigint,(p_order->>'store_credit_applied_cents')::bigint,
    (p_order->>'total_cents')::bigint,nullif(p_order->>'authorized_amount_cents','')::bigint,
    nullif(p_order->>'captured_amount_cents','')::bigint,nullif(p_order->>'payment_reference',''),
    v_checkout_key,nullif(p_order->>'last_idempotency_key',''),
    array(select pg_catalog.jsonb_array_elements_text(coalesce(p_order->'review_triggers','[]'::jsonb))),
    nullif(p_order->>'approved_by',''),nullif(p_order->>'approved_at','')::timestamptz,
    nullif(p_order->>'cancellation_reason',''),nullif(p_order->>'authorization_release_failed','')::boolean,
    (p_order->>'created_at')::timestamptz,(p_order->>'updated_at')::timestamptz
  )
  on conflict(id) do update set
    state=excluded.state,subtotal_cents=excluded.subtotal_cents,shipping_cents=excluded.shipping_cents,
    store_credit_applied_cents=excluded.store_credit_applied_cents,total_cents=excluded.total_cents,
    authorized_amount_cents=excluded.authorized_amount_cents,captured_amount_cents=excluded.captured_amount_cents,
    payment_reference=excluded.payment_reference,last_idempotency_key=excluded.last_idempotency_key,
    review_triggers=excluded.review_triggers,approved_by=excluded.approved_by,approved_at=excluded.approved_at,
    cancellation_reason=excluded.cancellation_reason,
    authorization_release_failed=excluded.authorization_release_failed,created_at=excluded.created_at,
    updated_at=excluded.updated_at;

  delete from public.research_order_lines where order_id=v_order_id;
  insert into public.research_order_lines(
    order_id,sku,display_name,quantity,unit_price_cents,line_total_cents,fulfillment_owner
  )
  select v_order_id,x.sku,x.display_name,x.quantity,x.unit_price_cents,x.line_total_cents,x.fulfillment_owner
    from pg_catalog.jsonb_to_recordset(p_lines) as x(
      sku text,display_name text,quantity integer,unit_price_cents bigint,line_total_cents bigint,fulfillment_owner text
    );

  delete from public.research_order_shipments where order_id=v_order_id;
  insert into public.research_order_shipments(order_id,seq,owner,status,tracking_number,carrier)
  select v_order_id,x.seq,x.owner,x.status,x.tracking_number,x.carrier
    from pg_catalog.jsonb_to_recordset(p_shipments) as x(
      seq integer,owner text,status text,tracking_number text,carrier text
    );

  if v_prior_state is null or v_prior_state is distinct from v_state then
    insert into public.research_order_state_events(
      order_id,from_state,to_state,actor_type,actor_id,provider_reference,idempotency_key
    ) values (
      v_order_id,coalesce(v_prior_state,v_state),v_state,'system',null,
      nullif(p_order->>'payment_reference',''),nullif(p_order->>'last_idempotency_key','')
    );
  end if;
  return pg_catalog.jsonb_build_object('orderId',v_order_id,'state',v_state);
exception
  when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception using errcode='22023', message='commerce_order_persist_request_invalid';
end
$order_persist$;

create or replace function public.research_webhook_order_update(
  p_order_id uuid,
  p_state text,
  p_payment_reference text,
  p_last_idempotency_key text
) returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $webhook_order_update$
declare v_count integer;
begin
  if p_order_id is null or p_state not in ('draft','checkout_pending','payment_authorized','manual_review',
      'approved','payment_captured','processing','partially_fulfilled','fulfilled','delivered','exception',
      'cancelled','refunded','replaced') then
    raise exception using errcode='22023', message='commerce_webhook_order_update_invalid';
  end if;
  update public.research_orders set
    state=p_state,payment_reference=p_payment_reference,
    last_idempotency_key=p_last_idempotency_key,updated_at=pg_catalog.clock_timestamp()
  where id=p_order_id;
  get diagnostics v_count = row_count;
  return v_count=1;
end
$webhook_order_update$;

alter function public.research_claim_repository(text,jsonb) owner to postgres;
alter function public.research_order_persist(jsonb,jsonb,jsonb) owner to postgres;
alter function public.research_webhook_order_update(uuid,text,text,text) owner to postgres;

revoke all on function public.research_claim_repository(text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.research_order_persist(jsonb,jsonb,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.research_webhook_order_update(uuid,text,text,text) from public,anon,authenticated,service_role;
grant execute on function public.research_claim_repository(text,jsonb) to service_role;
grant execute on function public.research_order_persist(jsonb,jsonb,jsonb) to service_role;
grant execute on function public.research_webhook_order_update(uuid,text,text,text) to service_role;

-- Table-level REVOKE does not clear column grants. Remove any column ACL drift
-- for the exposed runtime roles before converging relation ACLs.
do $acl_columns$
declare grant_row record;
begin
  for grant_row in
    select namespace.nspname schema_name,relation.relname relation_name,
           attribute.attname column_name,acl.privilege_type,
           case when acl.grantee=0 then 'PUBLIC' else pg_catalog.quote_ident(grantee.rolname) end grantee_name
      from pg_catalog.pg_class relation
      join pg_catalog.pg_namespace namespace on namespace.oid=relation.relnamespace
      join pg_catalog.pg_attribute attribute on attribute.attrelid=relation.oid
      cross join lateral pg_catalog.aclexplode(attribute.attacl) acl
      left join pg_catalog.pg_roles grantee on grantee.oid=acl.grantee
     where namespace.nspname='public'
       and relation.relname=any(array['research_claims','research_idempotency_keys','research_order_lines',
         'research_order_state_events','research_orders','research_refund_keys','research_store_credit_ledger'])
       and attribute.attnum>0 and not attribute.attisdropped
       and (acl.grantee=0 or grantee.rolname in ('anon','authenticated','service_role'))
  loop
    execute pg_catalog.format('revoke %s (%I) on table %I.%I from %s cascade',
      grant_row.privilege_type,grant_row.column_name,grant_row.schema_name,
      grant_row.relation_name,grant_row.grantee_name);
  end loop;
end
$acl_columns$;

revoke all privileges on table public.research_claims from public,anon,authenticated,service_role;
revoke all privileges on table public.research_idempotency_keys from public,anon,authenticated,service_role;
revoke all privileges on table public.research_order_lines from public,anon,authenticated,service_role;
revoke all privileges on table public.research_order_state_events from public,anon,authenticated,service_role;
revoke all privileges on table public.research_orders from public,anon,authenticated,service_role;
revoke all privileges on table public.research_refund_keys from public,anon,authenticated,service_role;
revoke all privileges on table public.research_store_credit_ledger from public,anon,authenticated,service_role;

grant select on table public.research_orders,public.research_order_lines to service_role;
grant insert on table public.research_order_state_events to service_role;
grant select,insert on table public.research_store_credit_ledger to service_role;
grant select,insert,update on table public.research_idempotency_keys to service_role;

-- Preserve the reviewed V2 capability body as an owner-only core, then place a
-- narrow attestation around it for the repository authorities introduced here.
-- The semantic promise is unchanged, so the established token remains stable.
do $preserve_capability_core$
begin
  if pg_catalog.to_regprocedure('public.research_checkout_money_capability_v2_core()') is null then
    if pg_catalog.to_regprocedure('public.research_checkout_money_capability()') is null then
      raise exception using errcode='55000',message='checkout_money_capability_v2_missing';
    end if;
    alter function public.research_checkout_money_capability()
      rename to research_checkout_money_capability_v2_core;
  end if;
end
$preserve_capability_core$;
revoke all on function public.research_checkout_money_capability_v2_core()
  from public,anon,authenticated,service_role;

create or replace function public.research_checkout_money_capability()
returns text
language plpgsql
stable
security definer
set search_path = ''
as $commerce_capability$
declare
  v_signature text;
  v_expected text;
  v_actual text;
begin
  if public.research_checkout_money_capability_v2_core()
       is distinct from 'durable_checkout_money_v2:20260923.1' then
    return null;
  end if;

  for v_signature,v_expected in select * from (values
    ('public.research_checkout_money_capability_v2_core()', '6ab403dc7681b77f9df10db976deb7e4'),
    ('public.research_claim_repository(text,jsonb)', 'efa8cbe8e9a6267f5474470c43bc12f2'),
    ('public.research_order_persist(jsonb,jsonb,jsonb)', 'a8f01b9cb883f6302f00f30019a48349'),
    ('public.research_webhook_order_update(uuid,text,text,text)', '26e15e000fcd3a8c7345d0a32cd43c90')
  ) expected(signature,fingerprint)
  loop
    select pg_catalog.md5(pg_catalog.replace(p.prosrc,E'\r\n',E'\n')) into v_actual
      from pg_catalog.pg_proc p where p.oid=pg_catalog.to_regprocedure(v_signature);
    if v_actual is null or v_actual<>v_expected then return null; end if;
  end loop;

  if exists (
    select 1 from (values
      ('public.research_checkout_money_capability_v2_core()','s',true,array['search_path=""']::text[]),
      ('public.research_claim_repository(text,jsonb)','v',true,array['search_path=""']::text[]),
      ('public.research_order_persist(jsonb,jsonb,jsonb)','v',true,array['search_path=""']::text[]),
      ('public.research_webhook_order_update(uuid,text,text,text)','v',true,array['search_path=""']::text[]),
      ('public.research_checkout_money_capability()','s',true,array['search_path=""']::text[])
    ) expected(signature,volatility,security_definer,settings)
    left join pg_catalog.pg_proc p on p.oid=pg_catalog.to_regprocedure(expected.signature)
    left join pg_catalog.pg_language l on l.oid=p.prolang
    left join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    left join pg_catalog.pg_roles owner_role on owner_role.oid=p.proowner
    where p.oid is null or n.nspname<>'public' or owner_role.rolname<>'postgres'
      or l.lanname<>'plpgsql' or p.prokind<>'f'
      or p.provolatile::text<>expected.volatility
      or p.prosecdef is distinct from expected.security_definer
      or p.proisstrict or p.proleakproof or p.proparallel<>'u'
      or coalesce((select pg_catalog.array_agg(setting order by setting collate "C")
                     from pg_catalog.unnest(p.proconfig) setting),array[]::text[])
         is distinct from expected.settings
  ) then return null; end if;

  if (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='research_claim_repository')<>1
     or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='research_order_persist')<>1
     or (select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='research_webhook_order_update')<>1 then
    return null;
  end if;

  foreach v_signature in array array[
    'public.research_claim_repository(text,jsonb)',
    'public.research_order_persist(jsonb,jsonb,jsonb)',
    'public.research_webhook_order_update(uuid,text,text,text)',
    'public.research_checkout_money_capability()'
  ] loop
    if not pg_catalog.has_function_privilege('service_role',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('anon',v_signature,'EXECUTE')
       or pg_catalog.has_function_privilege('authenticated',v_signature,'EXECUTE')
       or exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
          where p.oid=pg_catalog.to_regprocedure(v_signature)
            and a.grantee=0 and a.privilege_type='EXECUTE')
       or (select count(*) from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
             where p.oid=pg_catalog.to_regprocedure(v_signature)
               and a.grantee<>p.proowner)<>1
       or not exists (select 1 from pg_catalog.pg_proc p,
                    lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
                    join pg_catalog.pg_roles grantee_role on grantee_role.oid=a.grantee
                    join pg_catalog.pg_roles grantor_role on grantor_role.oid=a.grantor
             where p.oid=pg_catalog.to_regprocedure(v_signature)
               and grantee_role.rolname='service_role' and grantor_role.rolname='postgres'
               and a.privilege_type='EXECUTE' and not a.is_grantable) then
      return null;
    end if;
  end loop;

  if pg_catalog.has_function_privilege('service_role',
       'public.research_checkout_money_capability_v2_core()','EXECUTE')
     or exists (select 1 from pg_catalog.pg_proc p,
                  lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
        where p.oid=pg_catalog.to_regprocedure('public.research_checkout_money_capability_v2_core()')
          and a.grantee<>p.proowner) then
    return null;
  end if;

  return 'durable_checkout_money_v2:20260923.1';
end
$commerce_capability$;

alter function public.research_checkout_money_capability() owner to postgres;
revoke all on function public.research_checkout_money_capability()
  from public,anon,authenticated,service_role;
grant execute on function public.research_checkout_money_capability() to service_role;

commit;
