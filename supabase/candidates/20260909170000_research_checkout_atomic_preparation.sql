-- CANDIDATE ONLY. Atomic initial checkout preparation authority.
-- Installs after checkout executions and the canonical inventory reservation
-- commands, before credit reservations. Credit's execution INSERT trigger is
-- therefore part of this same transaction once the full chain is installed.

create or replace function public.research_checkout_prepare(
  p_order jsonb,
  p_execution jsonb,
  p_inventory_lines jsonb,
  p_at timestamptz,
  p_expires_at timestamptz
) returns table(order_id uuid, execution_id uuid, reservation_ids text[], idempotent_replay boolean)
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid;
  v_order uuid;
  v_execution uuid;
  v_request_key text;
  v_digest text;
  v_existing public.research_checkout_executions%rowtype;
  v_reserved jsonb;
  v_line jsonb;
  v_shipment jsonb;
  v_reservation_ids text[];
  v_seq integer := 0;
begin
  if p_at is null or not pg_catalog.isfinite(p_at) or p_expires_at is null
     or not pg_catalog.isfinite(p_expires_at) or p_expires_at <= p_at
     or pg_catalog.jsonb_typeof(p_order) <> 'object'
     or pg_catalog.jsonb_typeof(p_execution) <> 'object'
     or pg_catalog.jsonb_typeof(p_inventory_lines) <> 'array'
     or pg_catalog.jsonb_array_length(p_inventory_lines) = 0 then
    raise exception 'checkout_prepare_invalid_command';
  end if;
  begin
    v_member := (p_execution->>'memberId')::uuid;
    v_order := (p_execution->>'orderId')::uuid;
    v_execution := (p_execution->>'executionId')::uuid;
  exception when others then
    raise exception 'checkout_prepare_invalid_identity';
  end;
  v_request_key := p_execution->>'requestKey';
  v_digest := p_execution->>'requestBodySha256';
  if v_member is null or v_order is null or v_execution is null
     or p_order->>'orderId' <> v_order::text or p_order->>'memberId' <> v_member::text
     or p_order->>'checkoutIdempotencyKey' is distinct from v_request_key
     or char_length(v_request_key) not between 8 and 120
     or v_digest !~ '^[a-f0-9]{64}$'
     or (p_execution->>'amountCents')::bigint <= 0
     or p_execution->>'currency' <> 'usd'
     or p_execution->>'paymentMethodReference' !~ '^pm_[A-Za-z0-9_]+$'
     or p_execution->>'phase' <> 'reserved'
     or (p_execution->>'version')::integer <> 1 then
    raise exception 'checkout_prepare_invalid_binding';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_member::text || ':' || v_request_key, 0));
  select * into v_existing from public.research_checkout_executions
   where member_id=v_member and request_key=v_request_key for update;
  if found then
    if v_existing.request_body_sha256 <> v_digest
       or v_existing.amount_cents <> (p_execution->>'amountCents')::bigint
       or v_existing.payment_method_reference <> p_execution->>'paymentMethodReference'
       or v_existing.quote_fingerprint <> p_execution->>'quoteFingerprint' then
      raise exception 'checkout_prepare_idempotency_conflict';
    end if;
    return query select v_existing.order_id, v_existing.id, v_existing.reservation_ids, true;
    return;
  end if;
  if exists(select 1 from public.research_orders where member_id=v_member and checkout_idempotency_key=v_request_key) then
    raise exception 'checkout_prepare_partial_legacy_state';
  end if;

  v_reserved := public.research_reserve_inventory(
    v_member, v_member, p_inventory_lines, p_at, p_expires_at,
    'checkout-prepare-v2:' || v_member::text || ':' || v_request_key
  );
  select coalesce(pg_catalog.array_agg(value->>'reservationId' order by value->>'reservationId'), '{}'::text[])
    into v_reservation_ids from pg_catalog.jsonb_array_elements(v_reserved->'reservations');
  if pg_catalog.cardinality(v_reservation_ids) = 0 then raise exception 'checkout_prepare_inventory_receipt_empty'; end if;

  insert into public.research_orders
    (id,member_id,state,subtotal_cents,shipping_cents,store_credit_applied_cents,total_cents,
     checkout_idempotency_key,last_idempotency_key,review_triggers,created_at,updated_at)
  values
    (v_order,v_member,'checkout_pending',(p_order#>>'{totals,subtotalCents}')::bigint,
     (p_order#>>'{totals,shippingCents}')::bigint,(p_order#>>'{totals,storeCreditAppliedCents}')::bigint,
     (p_order#>>'{totals,totalCents}')::bigint,v_request_key,v_request_key,
     coalesce(array(select pg_catalog.jsonb_array_elements_text(p_order->'reviewTriggers')),'{}'::text[]),p_at,p_at);

  for v_line in select value from pg_catalog.jsonb_array_elements(p_order->'lines') loop
    insert into public.research_order_lines(order_id,sku,display_name,quantity,unit_price_cents,line_total_cents,fulfillment_owner)
    values(v_order,v_line->>'sku',v_line->>'displayName',(v_line->>'quantity')::integer,
      (v_line->>'lineTotalCents')::bigint/(v_line->>'quantity')::integer,
      (v_line->>'lineTotalCents')::bigint,'xenios');
  end loop;
  for v_shipment in select value from pg_catalog.jsonb_array_elements(coalesce(p_order->'shipments','[]'::jsonb)) loop
    insert into public.research_order_shipments(order_id,seq,owner,status,tracking_number,carrier)
    values(v_order,v_seq,v_shipment->>'owner',v_shipment->>'status',v_shipment->>'trackingNumber',v_shipment->>'carrier');
    v_seq := v_seq + 1;
  end loop;
  insert into public.research_order_state_events
    (order_id,from_state,to_state,actor_type,actor_id,idempotency_key,occurred_at)
  values(v_order,'draft','checkout_pending','system','durable_checkout',v_request_key,p_at);

  insert into public.research_checkout_executions
    (id,member_id,request_key,request_body_sha256,order_id,phase,version,amount_cents,currency,
     payment_method_reference,quote_fingerprint,price_version,authorization_key,capture_key,cancel_key,
     reservation_ids,created_at,updated_at)
  values(v_execution,v_member,v_request_key,v_digest,v_order,'reserved',1,(p_execution->>'amountCents')::bigint,'usd',
    p_execution->>'paymentMethodReference',p_execution->>'quoteFingerprint',p_execution->>'priceVersion',
    p_execution->>'authorizationKey',p_execution->>'captureKey',p_execution->>'cancelKey',v_reservation_ids,p_at,p_at);

  return query select v_order,v_execution,v_reservation_ids,false;
end $$;

alter function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz) owner to postgres;
revoke all on function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz) from public,anon,authenticated;
grant execute on function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz) to service_role;

-- Production transitions are RPC-only as well. The service role can read the
-- projection, but cannot bypass validation with direct INSERT/UPDATE.
alter function public.research_checkout_execution_claim(uuid,integer,text) security definer;
alter function public.research_checkout_execution_claim(uuid,integer,text) set search_path to '';
alter function public.research_checkout_execution_record_provider(uuid,integer,jsonb) security definer;
alter function public.research_checkout_execution_record_provider(uuid,integer,jsonb) set search_path to '';
alter function public.research_checkout_execution_commit_captured(uuid,integer,timestamptz) security definer;
alter function public.research_checkout_execution_commit_captured(uuid,integer,timestamptz) set search_path to '';
alter function public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz) security definer;
alter function public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz) set search_path to '';
alter function public.research_checkout_execution_claim(uuid,integer,text) owner to postgres;
alter function public.research_checkout_execution_record_provider(uuid,integer,jsonb) owner to postgres;
alter function public.research_checkout_execution_commit_captured(uuid,integer,timestamptz) owner to postgres;
alter function public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz) owner to postgres;
revoke insert,update,delete on public.research_checkout_executions from service_role;

comment on function public.research_checkout_prepare(jsonb,jsonb,jsonb,timestamptz,timestamptz) is
  'Atomic v2 checkout preparation: order, inventory holds, execution, credit trigger and audit; exact replay or rollback.';
