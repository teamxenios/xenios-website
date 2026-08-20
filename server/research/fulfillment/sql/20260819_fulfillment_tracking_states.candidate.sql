-- CANDIDATE MIGRATION - NOT APPLIED, NOT REGISTERED.
--
-- Owner: FULFILLMENT-MOUNT lane (claude-fable-s8-fulfillment).
-- The lead session must review this, move it into supabase/migrations with a
-- real timestamp, register it in the migration DAG, and apply it with founder
-- approval before the production fulfillment port can execute the new
-- actions. Until then the deployed research_fulfillment_transition rejects
-- record_tracking / record_replacement / record_refund at the allowlist,
-- which fails closed.
--
-- What this changes, mirroring server/research/fulfillment/service.ts:
--   1. Adds states tracking_created, replacement, refunded.
--   2. Adds actions record_tracking, record_replacement, record_refund.
--   3. shipped becomes reachable ONLY from tracking_created (ship), so a
--      recorded tracking reference never implies carrier possession.
--   4. Disposition actions (cancel, record_return, record_replacement,
--      record_refund, record_damage, record_loss, record_recall) become
--      internal-only: a supplier-scoped call is rejected.
--   5. Fixes a latent defect in 20260728010000: record_damage, record_loss,
--      and record_recall inserted kind values 'damaged'/'lost'/'recalled'
--      into research_fulfillment_exceptions, whose check constraint only
--      allows 'damage'/'loss'/'recall', so those transitions could never
--      commit.
--
-- record_replacement / record_refund record fulfillment DISPOSITIONS only.
-- They move no money; payment and claims stay with their canonical owners.

alter table public.research_fulfillment_assignments
  drop constraint if exists research_fulfillment_assignments_state_check;
alter table public.research_fulfillment_assignments
  add constraint research_fulfillment_assignments_state_check check (state in (
    'assigned','acknowledged','picking','packed','tracking_created','shipped',
    'delivered','exception','returned','replacement','refunded','damaged',
    'lost','recalled','cancelled'
  ));

alter table public.research_fulfillment_exceptions
  drop constraint if exists research_fulfillment_exceptions_kind_check;
alter table public.research_fulfillment_exceptions
  add constraint research_fulfillment_exceptions_kind_check check (kind in (
    'exception','return','replacement','refund','damage','loss','recall'
  ));

create or replace function public.research_fulfillment_transition(
  p_actor_auth_user_id uuid,
  p_supplier_scope_id uuid,
  p_assignment_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_at timestamptz,
  p_expected_ship_at timestamptz,
  p_label_reference text,
  p_carrier text,
  p_service text,
  p_tracking_reference text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_key_hash text;
  v_command_hash text;
  v_actor_hash text;
  v_replay jsonb;
  v_assignment public.research_fulfillment_assignments%rowtype;
  v_next text;
  v_result jsonb;
  v_exception_kind text;
  v_product_id uuid;
  v_variant_id uuid;
  v_lot public.research_inventory_lots%rowtype;
begin
  if p_assignment_id is null or p_expected_version is null or p_expected_version <= 0
     or p_action not in (
       'acknowledge','start_picking','pack','record_tracking','ship','deliver',
       'record_exception','record_return','record_replacement','record_refund',
       'record_damage','record_loss','record_recall','cancel'
     )
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$'
     or p_at is null then
    raise exception 'fulfillment transition input is invalid';
  end if;
  -- Disposition authority never belongs to supplier operators.
  if p_supplier_scope_id is not null and p_action in (
    'record_return','record_replacement','record_refund',
    'record_damage','record_loss','record_recall','cancel'
  ) then
    raise exception 'fulfillment disposition requires an internal actor';
  end if;
  v_key_hash := public.research_fulfillment_key_hash('fulfillment-transition:v1', p_idempotency_key);
  v_command_hash := public.research_fulfillment_command_hash(
    'fulfillment-transition:v1',
    jsonb_build_object(
      'assignmentId', p_assignment_id, 'action', p_action,
      'expectedVersion', p_expected_version, 'at', p_at,
      'expectedShipAt', p_expected_ship_at,
      'labelReference', nullif(btrim(p_label_reference), ''),
      'carrier', nullif(btrim(p_carrier), ''), 'service', nullif(btrim(p_service), ''),
      'trackingReference', nullif(btrim(p_tracking_reference), ''),
      'reason', nullif(btrim(p_reason), '')
    )
  );
  v_actor_hash := public.research_fulfillment_actor_hash(
    p_actor_auth_user_id, p_supplier_scope_id
  );
  perform pg_advisory_xact_lock(hashtextextended('xenios:fulfillment-key:v1|' || v_key_hash, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:fulfillment-assignment:v1|' || p_assignment_id::text, 0
  ));

  select * into v_assignment from public.research_fulfillment_assignments
   where id = p_assignment_id for update;
  if not found then raise exception 'fulfillment assignment is unavailable'; end if;
  if p_supplier_scope_id is null then
    if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then
      raise exception 'fulfillment actor is not authorized';
    end if;
  elsif v_assignment.supplier_id <> p_supplier_scope_id
     or not public.research_fulfillment_supplier_actor(
       p_actor_auth_user_id, p_supplier_scope_id
     ) then
    raise exception 'fulfillment assignment is unavailable';
  end if;

  v_replay := public.research_fulfillment_replay(v_key_hash, v_command_hash, v_actor_hash);
  if v_replay is not null then return v_replay; end if;
  if v_assignment.version <> p_expected_version then
    raise exception 'fulfillment assignment version conflict';
  end if;
  if p_at < v_assignment.updated_at then raise exception 'fulfillment timestamp is backdated'; end if;
  -- Mirror of FULFILLMENT_TRANSITIONS in server/research/fulfillment/service.ts.
  v_next := case
    when v_assignment.state = 'assigned' and p_action = 'acknowledge' then 'acknowledged'
    when v_assignment.state = 'acknowledged' and p_action = 'start_picking' then 'picking'
    when v_assignment.state = 'picking' and p_action = 'pack' then 'packed'
    when v_assignment.state = 'packed' and p_action = 'record_tracking' then 'tracking_created'
    when v_assignment.state = 'tracking_created' and p_action = 'ship' then 'shipped'
    when v_assignment.state = 'shipped' and p_action = 'deliver' then 'delivered'
    when v_assignment.state in ('assigned','acknowledged','picking','packed','tracking_created','shipped')
      and p_action = 'record_exception' then 'exception'
    when v_assignment.state in ('shipped','delivered','exception')
      and p_action = 'record_return' then 'returned'
    when v_assignment.state in ('picking','packed','tracking_created','shipped','delivered','exception')
      and p_action = 'record_damage' then 'damaged'
    when v_assignment.state in ('picking','packed','tracking_created','shipped','delivered','exception')
      and p_action = 'record_loss' then 'lost'
    when v_assignment.state not in ('returned','replacement','refunded','damaged','lost','recalled','cancelled')
      and p_action = 'record_recall' then 'recalled'
    when v_assignment.state in ('assigned','acknowledged','tracking_created','exception')
      and p_action = 'cancel' then 'cancelled'
    when v_assignment.state = 'exception' and p_action = 'start_picking' then 'picking'
    when v_assignment.state = 'exception' and p_action = 'pack' then 'packed'
    when v_assignment.state = 'exception' and p_action = 'record_tracking' then 'tracking_created'
    when v_assignment.state in ('exception','returned','damaged','lost','recalled')
      and p_action = 'record_replacement' then 'replacement'
    when v_assignment.state in ('exception','returned','damaged','lost','recalled','cancelled')
      and p_action = 'record_refund' then 'refunded'
    else null
  end;
  if v_next is null then raise exception 'invalid fulfillment state transition'; end if;
  if p_action in ('record_exception','record_return','record_replacement','record_refund',
                  'record_damage','record_loss','record_recall','cancel')
     and (nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) not between 3 and 500) then
    raise exception 'fulfillment exception action requires a reason';
  end if;
  if p_action = 'pack' and nullif(btrim(p_label_reference), '') is null then
    raise exception 'packing requires a label reference';
  end if;
  if p_action = 'record_tracking' and (
    nullif(btrim(coalesce(p_label_reference, v_assignment.label_reference)), '') is null
    or nullif(btrim(p_carrier), '') is null
    or nullif(btrim(p_service), '') is null
    or nullif(btrim(p_tracking_reference), '') is null
  ) then
    raise exception 'tracking evidence is incomplete';
  end if;
  if p_action in ('pack','record_tracking') then
    for v_product_id in
      select distinct lot.product_id
        from public.research_fulfillment_assignment_lines line
        join public.research_inventory_lots lot on lot.id = line.lot_id
       where line.assignment_id = p_assignment_id
       order by lot.product_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-product-readiness:v1|' || v_product_id::text, 0
      ));
    end loop;
    for v_variant_id in
      select distinct lot.variant_id
        from public.research_fulfillment_assignment_lines line
        join public.research_inventory_lots lot on lot.id = line.lot_id
       where line.assignment_id = p_assignment_id
       order by lot.variant_id
    loop
      perform pg_advisory_xact_lock_shared(hashtextextended(
        'xenios:inventory-variant-readiness:v1|' || v_variant_id::text, 0
      ));
    end loop;
    for v_lot in
      select lot.*
        from public.research_inventory_lots lot
       where lot.id in (
         select line.lot_id
           from public.research_fulfillment_assignment_lines line
          where line.assignment_id = p_assignment_id
       )
       order by lot.id
       for update
    loop
      perform pg_advisory_xact_lock(hashtextextended(
        'xenios:inventory-readiness:v1|' || v_lot.id::text, 0
      ));
      if not public.research_inventory_product_variant_ready(
           v_lot.product_id, v_lot.variant_id, v_lot.sku
         )
         or not public.research_lot_quality_ready(v_lot.id, p_at) then
        raise exception 'exact-lot quality evidence is no longer valid';
      end if;
    end loop;
  end if;

  update public.research_fulfillment_assignments
     set state = v_next,
         expected_ship_at = coalesce(p_expected_ship_at, expected_ship_at),
         label_reference = coalesce(nullif(btrim(p_label_reference), ''), label_reference),
         carrier = coalesce(nullif(btrim(p_carrier), ''), carrier),
         shipping_service = coalesce(nullif(btrim(p_service), ''), shipping_service),
         tracking_reference = coalesce(nullif(btrim(p_tracking_reference), ''), tracking_reference),
         reason = coalesce(nullif(btrim(p_reason), ''), reason),
         version = version + 1, updated_by = p_actor_auth_user_id, updated_at = p_at
   where id = p_assignment_id
   returning * into v_assignment;
  if v_next in ('exception','returned','replacement','refunded','damaged','lost','recalled') then
    v_exception_kind := case v_next
      when 'returned' then 'return'
      when 'replacement' then 'replacement'
      when 'refunded' then 'refund'
      when 'damaged' then 'damage'
      when 'lost' then 'loss'
      when 'recalled' then 'recall'
      else 'exception'
    end;
    insert into public.research_fulfillment_exceptions (
      assignment_id, kind, reason, assignment_version, recorded_by, occurred_at
    ) values (
      p_assignment_id, v_exception_kind, btrim(p_reason),
      v_assignment.version, p_actor_auth_user_id, p_at
    );
  end if;
  perform set_config('xenios.paid_order_boundary', 'allowed', true);
  update public.research_supplier_fulfillment_orders
     set state = case
       when v_next in ('assigned') then 'assigned'
       when v_next in ('acknowledged','picking','packed','tracking_created') then 'in_progress'
       when v_next in ('shipped','delivered','exception','cancelled') then v_next
       else 'exception'
     end,
     version = version + 1, updated_at = p_at
   where id = v_assignment.fulfillment_order_id;
  perform set_config('xenios.paid_order_boundary', '', true);
  v_result := jsonb_build_object(
    'assignmentId', p_assignment_id, 'state', v_next,
    'version', v_assignment.version, 'idempotentReplay', false
  );
  insert into public.research_fulfillment_events (
    assignment_id, supplier_id, action, idempotency_key_hash, command_hash,
    actor_scope_hash, prior_version, result_version, redacted_result, occurred_at
  ) values (
    p_assignment_id, v_assignment.supplier_id, p_action, v_key_hash, v_command_hash,
    v_actor_hash, p_expected_version, v_assignment.version,
    v_result - 'idempotentReplay', p_at
  );
  return v_result;
end;
$$;
