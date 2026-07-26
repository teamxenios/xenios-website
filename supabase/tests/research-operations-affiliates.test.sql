\set ON_ERROR_STOP on

begin;

insert into public.research_operations_staff_roles (auth_user_id, role)
values ('00000000-0000-0000-0000-000000000401', 'mitch');

insert into public.research_partners (
  id, member_id, role, state, legal_name, contact_email
)
values (
  '00000000-0000-0000-0000-000000000402',
  '00000000-0000-0000-0000-000000000403',
  'affiliate',
  'application',
  'Website Four Partner',
  'website-four-partner@example.com'
);

insert into public.research_orders (
  id, member_id, state, subtotal_cents, shipping_cents,
  store_credit_applied_cents, total_cents, authorized_amount_cents,
  captured_amount_cents, payment_reference
)
values (
  '00000000-0000-0000-0000-000000000410',
  '00000000-0000-0000-0000-000000000411',
  'payment_captured',
  1000, 0, 0, 1000, 1000, 1000, 'provider-proof'
);

insert into public.research_inventory_lots (
  id, lot_id, sku, owner, disposition, quantity_available,
  expiry_date, shelf_life_source, excursion
)
values (
  '00000000-0000-0000-0000-000000000420',
  'LOT-W4-001',
  'SKU-W4-001',
  'mitch',
  'available',
  10,
  '2030-01-01',
  'coa',
  'none'
);
insert into public.research_lot_quality_documents (
  lot_id, coa_on_file, identity_confirmed, purity_confirmed,
  sterility_confirmed, endotoxin_confirmed
)
values (
  '00000000-0000-0000-0000-000000000420',
  true, true, true, true, true
);

insert into public.research_fulfillment_orders (
  id, order_id, owner, state, recipient_name, address_line1,
  address_city, address_state, address_postal_code, shipping_service,
  handling_profile
)
values (
  '00000000-0000-0000-0000-000000000430',
  '00000000-0000-0000-0000-000000000410',
  'mitch',
  'pending',
  'A Researcher',
  '1 Test Way',
  'Austin',
  'TX',
  '78701',
  'standard',
  'ambient'
);
insert into public.research_fulfillment_lines (
  id, fulfillment_order_id, sku, quantity
)
values (
  '00000000-0000-0000-0000-000000000431',
  '00000000-0000-0000-0000-000000000430',
  'SKU-W4-001',
  1
);
insert into public.research_lot_allocations (lot_id, order_id, quantity)
values (
  '00000000-0000-0000-0000-000000000420',
  '00000000-0000-0000-0000-000000000410',
  1
);

do $$
declare
  result jsonb;
begin
  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'acknowledge', 0, 'w4-ack',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    '{}'::jsonb, '2026-07-25T20:00:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'acknowledge failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'allocate_exact', 1, 'w4-allocate',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    jsonb_build_object(
      'itemId', '00000000-0000-0000-0000-000000000431',
      'lotId', 'LOT-W4-001',
      'quantity', 1,
      'expectedLotVersion', 0
    ),
    '2026-07-25T20:01:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'allocate failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'begin_picking', 2, 'w4-pick',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    '{}'::jsonb, '2026-07-25T20:02:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'pick failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'pack', 3, 'w4-pack',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    '{}'::jsonb, '2026-07-25T20:03:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'pack failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'add_label', 4, 'w4-label',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    jsonb_build_object('carrier', 'UPS', 'service', 'Ground', 'tracking', 'W4-TRACK-001'),
    '2026-07-25T20:04:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'label failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'ship', 5, 'w4-ship',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    '{}'::jsonb, '2026-07-25T20:05:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'ship failed: %', result; end if;

  result := public.research_operations_apply_fulfillment_command(
    '00000000-0000-0000-0000-000000000430',
    'ship', 5, 'w4-ship',
    '00000000-0000-0000-0000-000000000401', 'mitch',
    '{}'::jsonb, '2026-07-25T20:05:00Z'
  );
  if not (result->>'ok')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'ship replay was not idempotent: %', result;
  end if;
end
$$;

do $$
declare
  quantity integer;
  work_state text;
  work_version bigint;
  trace_count bigint;
begin
  select quantity_available into quantity
  from public.research_inventory_lots
  where lot_id = 'LOT-W4-001';
  if quantity <> 10 then
    raise exception 'allocation/shipping double-decremented inventory: %', quantity;
  end if;

  select fulfillment_state, version into work_state, work_version
  from public.research_fulfillment_work_orders
  where fulfillment_order_id = '00000000-0000-0000-0000-000000000430';
  if work_state <> 'shipped' or work_version <> 6 then
    raise exception 'unexpected terminal work state/version: %/%', work_state, work_version;
  end if;

  select count(*) into trace_count
  from public.research_lot_shipments
  where order_id = '00000000-0000-0000-0000-000000000410';
  if trace_count <> 1 then
    raise exception 'expected one canonical lot shipment, found %', trace_count;
  end if;

  select count(*) into trace_count
  from public.research_operations_inventory_movements
  where order_id = '00000000-0000-0000-0000-000000000410';
  if trace_count <> 2 then
    raise exception 'expected allocate + ship evidence, found %', trace_count;
  end if;
end
$$;

do $$
declare
  result jsonb;
  request_count bigint;
  event_count bigint;
  account_uuid uuid;
  stage text;
  expected_version bigint := 1;
begin
  result := public.research_operations_submit_partner_request(
    '00000000-0000-0000-0000-000000000402',
    'campaign',
    'July education',
    '{"timeframe":"July","description":"Approved facts only"}'::jsonb,
    'w4-partner-request',
    '2026-07-25T20:30:00Z'
  );
  if not (result->>'ok')::boolean or (result->>'idempotent')::boolean then
    raise exception 'partner request failed: %', result;
  end if;

  result := public.research_operations_submit_partner_request(
    '00000000-0000-0000-0000-000000000402',
    'campaign',
    'July education',
    '{"timeframe":"July","description":"Approved facts only"}'::jsonb,
    'w4-partner-request',
    '2026-07-25T20:30:00Z'
  );
  if not (result->>'ok')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'partner request replay was not idempotent: %', result;
  end if;

  select count(*) into request_count
  from public.research_partner_portal_requests
  where partner_id = '00000000-0000-0000-0000-000000000402';
  select count(*) into event_count
  from public.research_partner_portal_request_events;
  if request_count <> 1 or event_count <> 1 then
    raise exception 'partner request/event counts were not idempotent: %/%', request_count, event_count;
  end if;

  result := public.research_operations_apply_professional_account(
    'professional',
    'Test Operations Practice',
    'operations-test@example.com',
    array['education', 'software'],
    '{}'::jsonb,
    'w4-professional',
    '2026-07-25T21:00:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'professional apply failed: %', result; end if;
  account_uuid := (result->>'accountId')::uuid;

  result := public.research_operations_apply_professional_account(
    'professional',
    'Test Operations Practice',
    'operations-test@example.com',
    array['education', 'software'],
    '{}'::jsonb,
    'w4-professional',
    '2026-07-25T21:00:00Z'
  );
  if not (result->>'ok')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'professional replay was not idempotent: %', result;
  end if;

  result := public.research_operations_apply_professional_account(
    'professional',
    'Unsafe Practice',
    'unsafe@example.com',
    array['future_clinical_partnership'],
    '{"patientReferralPaymentCents": 100}'::jsonb,
    'w4-professional-clinical',
    '2026-07-25T21:01:00Z'
  );
  if (result->>'code') <> 'clinical_economics_refused' then
    raise exception 'clinical economics were not refused: %', result;
  end if;

  foreach stage in array array['prospect','discovery','diligence','commercial_review','agreement','active']
  loop
    result := public.research_operations_transition_professional_account(
      account_uuid,
      stage,
      expected_version,
      case when stage = 'agreement' then 'agreement-v1' else null end,
      'admin@example.com',
      'admin',
      'w4-professional-' || stage,
      '2026-07-25T21:02:00Z'::timestamptz + (expected_version * interval '1 minute')
    );
    if not (result->>'ok')::boolean then
      raise exception 'professional stage % failed: %', stage, result;
    end if;
    expected_version := expected_version + 1;
  end loop;
end
$$;

do $$
declare
  result jsonb;
  contact_uuid uuid := '00000000-0000-0000-0000-000000000470';
  event_count bigint;
  contact_stage text;
  contact_version bigint;
begin
  result := public.research_operations_apply_crm_command(
    contact_uuid, 'create', null, 'admin@example.com', 'admin', 'w4-crm-create',
    '{"kind":"professional","displayName":"Example Practice","email":"contact@example.com"}'::jsonb,
    '2026-07-25T21:30:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'CRM create failed: %', result; end if;

  result := public.research_operations_apply_crm_command(
    contact_uuid, 'stage', 1, 'admin@example.com', 'admin', 'w4-crm-stage',
    '{"to":"active"}'::jsonb, '2026-07-25T21:31:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'CRM stage failed: %', result; end if;

  result := public.research_operations_apply_crm_command(
    contact_uuid, 'note', 2, 'admin@example.com', 'admin', 'w4-crm-private',
    '{"summary":"Patient diagnosis follow-up"}'::jsonb, '2026-07-25T21:32:00Z'
  );
  if (result->>'code') <> 'privacy_refused' then raise exception 'CRM private note was not refused: %', result; end if;

  result := public.research_operations_apply_crm_command(
    contact_uuid, 'note', 2, 'admin@example.com', 'admin', 'w4-crm-note',
    '{"summary":"Commercial review scheduled."}'::jsonb, '2026-07-25T21:33:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'CRM note failed: %', result; end if;

  result := public.research_operations_apply_crm_command(
    contact_uuid, 'note', 2, 'admin@example.com', 'admin', 'w4-crm-note',
    '{"summary":"Commercial review scheduled."}'::jsonb, '2026-07-25T21:33:00Z'
  );
  if not (result->>'ok')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'CRM replay was not idempotent: %', result;
  end if;

  result := public.research_operations_apply_crm_command(
    contact_uuid, 'link', 3, 'admin@example.com', 'admin', 'w4-crm-link',
    '{"referenceType":"order","referenceId":"order-1"}'::jsonb, '2026-07-25T21:34:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'CRM link failed: %', result; end if;

  select stage, version into contact_stage, contact_version
  from public.research_operations_crm_contacts where id = contact_uuid;
  select count(*) into event_count
  from public.research_operations_crm_events where contact_id = contact_uuid;
  if contact_stage <> 'active' or contact_version <> 4 or event_count <> 4 then
    raise exception 'unexpected CRM state/version/events: %/%/%', contact_stage, contact_version, event_count;
  end if;
end
$$;

do $$
declare
  result jsonb;
  task_uuid uuid := '00000000-0000-0000-0000-000000000480';
  event_count bigint;
  task_status text;
  task_version bigint;
begin
  result := public.research_operations_apply_task_command(
    task_uuid,
    'create',
    null,
    'admin@example.com',
    'admin',
    'w4-task-create',
    jsonb_build_object(
      'title', 'Resolve fulfillment shortage',
      'priority', 'urgent',
      'assignedTo', 'operations@example.com'
    ),
    '2026-07-25T22:00:00Z'
  );
  if not (result->>'ok')::boolean or (result->>'idempotent')::boolean then
    raise exception 'task creation failed: %', result;
  end if;

  result := public.research_operations_apply_task_command(
    task_uuid,
    'transition',
    1,
    'admin@example.com',
    'admin',
    'w4-task-start',
    '{"to":"in_progress"}'::jsonb,
    '2026-07-25T22:01:00Z'
  );
  if not (result->>'ok')::boolean then raise exception 'task transition failed: %', result; end if;

  result := public.research_operations_apply_task_command(
    task_uuid,
    'transition',
    1,
    'admin@example.com',
    'admin',
    'w4-task-start',
    '{"to":"in_progress"}'::jsonb,
    '2026-07-25T22:01:00Z'
  );
  if not (result->>'ok')::boolean or not (result->>'idempotent')::boolean then
    raise exception 'task replay was not idempotent: %', result;
  end if;

  result := public.research_operations_apply_task_command(
    task_uuid,
    'transition',
    1,
    'admin@example.com',
    'admin',
    'w4-task-stale',
    '{"to":"completed"}'::jsonb,
    '2026-07-25T22:02:00Z'
  );
  if (result->>'code') <> 'stale_write' then raise exception 'stale task write was not refused: %', result; end if;

  select status, version into task_status, task_version
  from public.research_operations_tasks
  where id = task_uuid;
  select count(*) into event_count
  from public.research_operations_task_events
  where task_id = task_uuid;
  if task_status <> 'in_progress' or task_version <> 2 or event_count <> 2 then
    raise exception 'unexpected task state/version/events: %/%/%', task_status, task_version, event_count;
  end if;
end
$$;

rollback;
