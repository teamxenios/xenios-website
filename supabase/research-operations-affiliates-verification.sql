-- Website 4 post-migration verification. Read-only: this file does not create,
-- update, or delete production records.

-- 1. Canonical dependencies and Website 4 extensions must all exist.
select required.name, to_regclass(required.name) is not null as exists
from unnest(array[
  'public.research_orders',
  'public.research_fulfillment_orders',
  'public.research_fulfillment_lines',
  'public.research_inventory_lots',
  'public.research_lot_allocations',
  'public.research_lot_shipments',
  'public.research_partners',
  'public.research_partner_links',
  'public.research_attribution_conversions',
  'public.research_commission_ledger',
  'public.research_notification_outbox',
  'public.research_operations_staff_roles',
  'public.research_fulfillment_work_orders',
  'public.research_operations_audit_events',
  'public.research_operations_inventory_movements',
  'public.research_partner_metric_events',
  'public.research_partner_portal_requests',
  'public.research_partner_portal_request_events',
  'public.research_partner_security_sessions',
  'public.research_fulfillment_exceptions',
  'public.research_fulfillment_notes',
  'public.research_operations_crm_contacts',
  'public.research_professional_accounts'
]) as required(name)
order by required.name;

-- 2. Every Website 4 table must have RLS enabled and no forced bypass posture.
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'research_operations_staff_roles',
    'research_fulfillment_work_orders',
    'research_operations_audit_events',
    'research_operations_inventory_movements',
    'research_fulfillment_exceptions',
    'research_fulfillment_notes',
    'research_operations_crm_contacts',
    'research_operations_crm_events',
    'research_commission_policies',
    'research_lawrence_partner_models',
    'research_partner_metric_events',
    'research_partner_portal_requests',
    'research_partner_portal_request_events',
    'research_partner_security_sessions',
    'research_professional_accounts',
    'research_professional_programs',
    'research_professional_audit_events'
  )
order by c.relname;

-- 3. Browser roles must have no direct table privileges.
select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and table_name in (
    'research_operations_staff_roles',
    'research_fulfillment_work_orders',
    'research_operations_audit_events',
    'research_operations_inventory_movements',
    'research_fulfillment_exceptions',
    'research_fulfillment_notes',
    'research_operations_crm_contacts',
    'research_operations_crm_events',
    'research_commission_policies',
    'research_lawrence_partner_models',
    'research_partner_metric_events',
    'research_partner_portal_requests',
    'research_partner_portal_request_events',
    'research_partner_security_sessions',
    'research_professional_accounts',
    'research_professional_programs',
    'research_professional_audit_events'
  )
order by table_name, grantee, privilege_type;
-- Expected: zero rows.

-- 4. Only service_role may call the application RPCs.
select
  routine_name,
  grantee,
  privilege_type
from information_schema.role_routine_grants
where routine_schema = 'public'
  and routine_name in (
    'research_operations_apply_fulfillment_command',
    'research_operations_submit_partner_request',
    'research_operations_apply_professional_account',
    'research_operations_transition_professional_account'
  )
order by routine_name, grantee;
-- Expected: service_role EXECUTE only (owner privileges may appear separately).

-- 5. Canonical record counts, captured before and after application by Website 2,
-- must remain unchanged except for the additive work-order backfill.
select 'research_orders' as relation, count(*)::bigint as row_count from public.research_orders
union all
select 'research_fulfillment_orders', count(*)::bigint from public.research_fulfillment_orders
union all
select 'research_inventory_lots', count(*)::bigint from public.research_inventory_lots
union all
select 'research_partners', count(*)::bigint from public.research_partners
union all
select 'research_commission_ledger', count(*)::bigint from public.research_commission_ledger
union all
select 'research_notification_outbox', count(*)::bigint from public.research_notification_outbox
order by relation;

-- 6. Every canonical fulfillment order must have exactly one operational
-- projection after the backfill/trigger.
select
  count(*) filter (where work.fulfillment_order_id is null) as missing_work_orders,
  count(*) as canonical_fulfillment_orders
from public.research_fulfillment_orders fulfillment
left join public.research_fulfillment_work_orders work
  on work.fulfillment_order_id = fulfillment.id;

-- 7. No shipped work order may lack canonical traceability or a shipment.
select work.fulfillment_order_id
from public.research_fulfillment_work_orders work
where work.fulfillment_state = 'shipped'
  and (
    work.shipment_id is null
    or exists (
      select 1
      from public.research_fulfillment_lines line
      where line.fulfillment_order_id = work.fulfillment_order_id
        and line.lot_id is null
    )
  );
-- Expected: zero rows.

-- 8. No Website 4 allocate/ship movement may claim a second stock decrement.
select id, movement_kind, on_hand_delta
from public.research_operations_inventory_movements
where movement_kind in ('allocate', 'ship')
  and on_hand_delta <> 0;
-- Expected: zero rows.
