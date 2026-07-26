-- Website 4 production migration: additive operations, affiliate, and
-- fulfillment persistence over the canonical Website 3 commerce schema.
--
-- IMPORTANT:
--   * Apply supabase/production/research-track-b-commerce.sql first.
--   * This file deliberately does NOT create a second order, lot, shipment,
--     partner, commission, payout, or notification-outbox architecture.
--   * Checkout already decrements quantity_available when it creates a lot
--     reservation. Shipping records traceability and MUST NOT decrement it a
--     second time.
--   * Every table is server-only. Browser access goes through authorized routes.

create extension if not exists pgcrypto;

do $$
declare
  dependency text;
begin
  foreach dependency in array array[
    'public.research_members',
    'public.research_orders',
    'public.research_order_lines',
    'public.research_fulfillment_orders',
    'public.research_fulfillment_lines',
    'public.research_shipments',
    'public.research_inventory_lots',
    'public.research_lot_quality_documents',
    'public.research_lot_allocations',
    'public.research_lot_shipments',
    'public.research_partners',
    'public.research_partner_links',
    'public.research_attribution_conversions',
    'public.research_commission_ledger',
    'public.research_payout_batches',
    'public.research_notification_outbox'
  ]
  loop
    if to_regclass(dependency) is null then
      raise exception 'Website 4 dependency missing: %. Apply the canonical Track B commerce migrations first.', dependency;
    end if;
  end loop;
end
$$;

-- Canonical-table extensions needed for optimistic concurrency and durable
-- idempotency/provenance. These are additive and safe on existing rows.
alter table public.research_inventory_lots
  add column if not exists version bigint not null default 0;

alter table public.research_partner_links
  add column if not exists idempotency_key text;
create unique index if not exists research_partner_links_idempotency_idx
  on public.research_partner_links (partner_id, idempotency_key)
  where idempotency_key is not null;

alter table public.research_attribution_conversions
  add column if not exists channel text,
  add column if not exists set_by_admin_id text,
  add column if not exists override_reason text,
  add column if not exists idempotency_key text;
create unique index if not exists research_attribution_conversions_idempotency_idx
  on public.research_attribution_conversions (idempotency_key)
  where idempotency_key is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_attribution_manual_override_names_admin'
      and conrelid = 'public.research_attribution_conversions'::regclass
  ) then
    alter table public.research_attribution_conversions
      add constraint research_attribution_manual_override_names_admin
      check (
        channel is distinct from 'manual'
        or (
          set_by_admin_id is not null
          and length(trim(coalesce(override_reason, ''))) > 0
        )
      ) not valid;
  end if;
end
$$;

create table if not exists public.research_operations_staff_roles (
  auth_user_id uuid primary key,
  role text not null check (role in ('operations_manager','finance','mitch','logistics')),
  enabled boolean not null default true,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One operational projection per canonical fulfillment order. Shipping identity
-- remains in research_fulfillment_orders; this row contains workflow only.
create table if not exists public.research_fulfillment_work_orders (
  fulfillment_order_id uuid primary key
    references public.research_fulfillment_orders (id) on delete cascade,
  fulfillment_state text not null default 'awaiting_acknowledgement'
    check (fulfillment_state in (
      'new','awaiting_acknowledgement','acknowledged','picking','packed',
      'label_required','ready_to_ship','shipped','exception','returned'
    )),
  shipment_state text not null default 'not_created'
    check (shipment_state in (
      'not_created','label_required','label_created','in_transit',
      'delivered','exception','return_requested','returned'
    )),
  allocation_state text not null default 'unallocated'
    check (allocation_state in ('unallocated','reserved','allocated','released','shipped')),
  due_at timestamptz not null,
  expected_at timestamptz,
  acknowledged_at timestamptz,
  shipment_id uuid references public.research_shipments (id),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_fulfillment_work_queue_idx
  on public.research_fulfillment_work_orders (fulfillment_state, due_at);
create index if not exists research_fulfillment_work_allocation_idx
  on public.research_fulfillment_work_orders (allocation_state, due_at);

create table if not exists public.research_operations_audit_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null
    references public.research_fulfillment_orders (id) on delete cascade,
  aggregate_version bigint not null check (aggregate_version >= 0),
  actor_id text not null,
  actor_role text not null
    check (actor_role in ('admin','operations_manager','finance','mitch','logistics','system','provider')),
  action text not null,
  idempotency_key text not null,
  command_hash text not null check (length(command_hash) = 64),
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (fulfillment_order_id, idempotency_key)
);
create index if not exists research_operations_audit_timeline_idx
  on public.research_operations_audit_events (fulfillment_order_id, occurred_at);

-- Append-only inventory evidence. Allocation and shipment have delta 0 because
-- canonical checkout has already reduced quantity_available for the finalized
-- hold. A positive/negative physical adjustment is allowed only for a named
-- receipt, return, damage, correction, or reconciliation event.
create table if not exists public.research_operations_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.research_inventory_lots (id),
  order_id uuid references public.research_orders (id),
  fulfillment_line_id uuid references public.research_fulfillment_lines (id),
  movement_kind text not null
    check (movement_kind in ('receipt','allocate','release','ship','return','damage','quarantine','correction','reconcile')),
  quantity integer not null check (quantity >= 0),
  on_hand_delta integer not null,
  actor_id text not null,
  actor_role text not null
    check (actor_role in ('admin','operations_manager','finance','mitch','logistics','system','provider')),
  reason text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  check (
    (movement_kind in ('allocate','release','ship','quarantine') and on_hand_delta = 0)
    or (movement_kind in ('receipt','return') and on_hand_delta = quantity)
    or (movement_kind = 'damage' and on_hand_delta = -quantity)
    or movement_kind in ('correction','reconcile')
  ),
  check (movement_kind = 'quarantine' or quantity > 0),
  check (
    movement_kind not in ('release','return','damage','quarantine','correction','reconcile')
    or length(trim(coalesce(reason, ''))) > 0
  )
);
create index if not exists research_operations_movements_lot_idx
  on public.research_operations_inventory_movements (lot_id, occurred_at);
create index if not exists research_operations_movements_order_idx
  on public.research_operations_inventory_movements (order_id, occurred_at);
create index if not exists research_operations_movements_line_idx
  on public.research_operations_inventory_movements (fulfillment_line_id)
  where fulfillment_line_id is not null;

create table if not exists public.research_operations_inventory_commands (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references public.research_inventory_lots (id),
  action text not null
    check (action in ('receipt','release','return','damage','quarantine','correction','reconcile')),
  actor_id text not null,
  actor_role text not null
    check (actor_role in ('admin','operations_manager','logistics','system')),
  idempotency_key text not null unique,
  command_hash text not null check (length(command_hash) = 64),
  resulting_version bigint not null check (resulting_version > 0),
  occurred_at timestamptz not null default now()
);
create index if not exists research_operations_inventory_commands_lot_idx
  on public.research_operations_inventory_commands (lot_id, occurred_at);

create table if not exists public.research_fulfillment_exceptions (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null
    references public.research_fulfillment_orders (id) on delete cascade,
  kind text not null check (kind in ('shortage','inventory','address','carrier','damage','quality','other')),
  severity text not null check (severity in ('normal','urgent','samuel_decision')),
  detail text not null check (length(trim(detail)) > 0),
  status text not null default 'open' check (status in ('open','resolved')),
  created_by text not null,
  created_at timestamptz not null default now(),
  resolved_by text,
  resolved_at timestamptz,
  resolution text,
  check (
    status <> 'resolved'
    or (
      resolved_by is not null
      and resolved_at is not null
      and length(trim(coalesce(resolution, ''))) > 0
    )
  )
);
create index if not exists research_fulfillment_exceptions_open_idx
  on public.research_fulfillment_exceptions (fulfillment_order_id, created_at)
  where status = 'open';

create table if not exists public.research_fulfillment_notes (
  id uuid primary key default gen_random_uuid(),
  fulfillment_order_id uuid not null
    references public.research_fulfillment_orders (id) on delete cascade,
  note text not null check (length(trim(note)) > 0),
  assistance_requested boolean not null default false,
  escalation boolean not null default false,
  actor_id text not null,
  idempotency_key text not null unique,
  created_at timestamptz not null default now()
);
create index if not exists research_fulfillment_notes_timeline_idx
  on public.research_fulfillment_notes (fulfillment_order_id, created_at);

-- Operations CRM excludes clinical content but may hold the minimum contact
-- identity needed by authorized administrators.
create table if not exists public.research_operations_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('member','applicant','affiliate','professional')),
  display_name text not null check (length(trim(display_name)) > 0),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  stage text not null default 'new'
    check (stage in ('new','pending_application','pending_activation','payment_verification','active','paused','closed')),
  tags text[] not null default '{}',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists research_operations_crm_stage_idx
  on public.research_operations_crm_contacts (stage, updated_at desc);

create table if not exists public.research_operations_crm_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null
    references public.research_operations_crm_contacts (id) on delete cascade,
  kind text not null check (kind in ('created','stage_changed','note','order_linked','exception_linked','follow_up')),
  actor_id text not null,
  actor_role text not null
    check (actor_role in ('admin','operations_manager','finance','system')),
  summary text not null check (length(trim(summary)) > 0),
  reference_type text check (reference_type in ('order','exception')),
  reference_id text,
  idempotency_key text not null unique,
  command_hash text not null check (length(command_hash) = 64),
  occurred_at timestamptz not null default now(),
  check ((reference_type is null) = (reference_id is null))
);
create index if not exists research_operations_crm_events_contact_idx
  on public.research_operations_crm_events (contact_id, occurred_at);

-- Assigned operational work is durable and separately auditable. Tasks hold
-- operational references only; customer, clinical, and payment payloads do not
-- belong in this queue.
create table if not exists public.research_operations_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) > 0),
  description text,
  status text not null default 'open'
    check (status in ('open','in_progress','blocked','completed','cancelled')),
  priority text not null default 'normal'
    check (priority in ('normal','urgent','samuel_decision')),
  assigned_to text,
  source_type text,
  source_id text,
  due_at timestamptz,
  version bigint not null default 1 check (version > 0),
  created_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  check ((source_type is null) = (source_id is null)),
  check ((status in ('completed','cancelled')) = (completed_at is not null))
);
create index if not exists research_operations_tasks_queue_idx
  on public.research_operations_tasks (status, priority, due_at, created_at);
create index if not exists research_operations_tasks_assignee_idx
  on public.research_operations_tasks (assigned_to, status, updated_at desc)
  where assigned_to is not null;

create table if not exists public.research_operations_task_events (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null
    references public.research_operations_tasks (id) on delete cascade,
  from_status text,
  to_status text not null
    check (to_status in ('open','in_progress','blocked','completed','cancelled')),
  assigned_to text,
  actor_id text not null,
  actor_role text not null
    check (actor_role in ('admin','operations_manager','finance','system')),
  idempotency_key text not null unique,
  command_hash text not null check (length(command_hash) = 64),
  occurred_at timestamptz not null default now()
);
create index if not exists research_operations_task_events_task_idx
  on public.research_operations_task_events (task_id, occurred_at);

-- Immutable commission policy snapshots refer to the canonical partner and
-- canonical append-only commission ledger. Rates are never hard-coded in code.
create table if not exists public.research_commission_policies (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references public.research_partners (id),
  version text not null,
  rule_document jsonb not null,
  rate_ceiling_bps integer not null check (rate_ceiling_bps between 0 and 10000),
  effective_at timestamptz not null,
  created_by text not null,
  created_at timestamptz not null default now(),
  unique nulls not distinct (partner_id, version)
);
create index if not exists research_commission_policies_effective_idx
  on public.research_commission_policies (partner_id, effective_at desc);

create table if not exists public.research_lawrence_partner_models (
  id uuid primary key default gen_random_uuid(),
  model_key text not null,
  version integer not null check (version > 0),
  partner_id uuid references public.research_partners (id),
  configuration jsonb not null,
  status text not null default 'draft' check (status in ('draft','approved','active','superseded')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  check (status not in ('approved','active') or (approved_by is not null and approved_at is not null)),
  unique (model_key, version)
);

-- Durable facts not represented by the canonical attribution/commission
-- tables. Subject keys are opaque; no applicant/member identity is stored.
create table if not exists public.research_partner_metric_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_partners (id) on delete cascade,
  kind text not null check (kind in ('qualified_signup','refund','chargeback')),
  subject_key text,
  order_id uuid,
  amount_cents bigint not null default 0 check (amount_cents >= 0),
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  check (
    (kind = 'qualified_signup' and subject_key is not null and order_id is null and amount_cents = 0)
    or (kind in ('refund','chargeback') and order_id is not null and amount_cents > 0)
  ),
  check (subject_key is null or subject_key !~ '\s')
);
create index if not exists research_partner_metric_events_partner_idx
  on public.research_partner_metric_events (partner_id, kind, occurred_at);

-- Partner-owned requests back the four portal forms that previously called
-- unregistered endpoints. Payloads are private, service-role-only, and never
-- joined into partner aggregate reporting.
create table if not exists public.research_partner_portal_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_partners (id) on delete cascade,
  kind text not null check (kind in ('campaign','event','organization','compliance')),
  title text not null check (length(trim(title)) > 0),
  payload jsonb not null default '{}'::jsonb,
  state text not null default 'submitted'
    check (state in ('submitted','under_review','approved','declined','withdrawn')),
  idempotency_key text not null,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (partner_id, kind, idempotency_key)
);
create index if not exists research_partner_portal_requests_partner_idx
  on public.research_partner_portal_requests (partner_id, kind, created_at desc);

create table if not exists public.research_partner_portal_request_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null
    references public.research_partner_portal_requests (id) on delete cascade,
  from_state text,
  to_state text not null,
  actor_id text not null,
  detail text,
  occurred_at timestamptz not null default now()
);
create index if not exists research_partner_portal_request_events_request_idx
  on public.research_partner_portal_request_events (request_id, occurred_at);

-- Session keys are one-way hashes of verified Supabase access tokens. Raw
-- tokens and IP addresses are never stored.
create table if not exists public.research_partner_security_sessions (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_partners (id) on delete cascade,
  auth_user_id uuid not null,
  session_key text not null,
  started_at timestamptz not null,
  last_seen_at timestamptz not null default now(),
  user_agent text,
  revoked_at timestamptz,
  unique (partner_id, session_key)
);
create index if not exists research_partner_security_sessions_partner_idx
  on public.research_partner_security_sessions (partner_id, last_seen_at desc);

create table if not exists public.research_professional_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  account_type text not null check (account_type in ('practitioner','professional')),
  organization_name text not null check (length(trim(organization_name)) > 0),
  contact_email text not null check (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  state text not null default 'applied'
    check (state in (
      'applied','prospect','discovery','diligence','commercial_review','agreement',
      'under_review','approved','active','paused','closed','rejected','terminated'
    )),
  agreement_version text,
  economic_terms jsonb not null default jsonb_build_object(
    'wholesaleDiscountBps', 0,
    'resellerDiscountBps', 0,
    'membershipFeeCents', 0,
    'directoryFeeCents', 0,
    'educationFeeCents', 0,
    'eventFeeCents', 0,
    'implementationFeeCents', 0,
    'softwareFeeCents', 0
  ),
  application_idempotency_key text not null unique,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not (economic_terms ?| array[
      'prescriptionPaymentCents','patientReferralPaymentCents',
      'diagnosisPaymentCents','clinicalApprovalPaymentCents',
      'medicationValuePaymentCents','prescription','patientReferral',
      'diagnosis','clinicalApproval','medicationValue'
    ])
  )
);
create index if not exists research_professional_accounts_state_idx
  on public.research_professional_accounts (state, updated_at desc);

-- Replace the automatically named check when upgrading an earlier Website 4
-- draft so the required professional pipeline stages are accepted.
alter table public.research_professional_accounts
  drop constraint if exists research_professional_accounts_state_check;
alter table public.research_professional_accounts
  add constraint research_professional_accounts_state_check check (state in (
    'applied','prospect','discovery','diligence','commercial_review','agreement',
    'under_review','approved','active','paused','closed','rejected','terminated'
  ));

create table if not exists public.research_professional_programs (
  account_id uuid not null
    references public.research_professional_accounts (id) on delete cascade,
  program text not null check (program in (
    'wholesale','reseller','professional_membership','directory','education',
    'event','implementation','software','future_clinical_partnership'
  )),
  status text not null default 'pending'
    check (status in ('pending','approved','active','paused','closed')),
  terms_document jsonb not null default '{}'::jsonb,
  primary key (account_id, program),
  check (
    not (terms_document ?| array[
      'prescriptionPaymentCents','patientReferralPaymentCents',
      'diagnosisPaymentCents','clinicalApprovalPaymentCents',
      'medicationValuePaymentCents','prescription','patientReferral',
      'diagnosis','clinicalApproval','medicationValue'
    ])
  )
);

create table if not exists public.research_professional_audit_events (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null
    references public.research_professional_accounts (id) on delete cascade,
  action text not null,
  actor_id text not null,
  actor_role text not null,
  idempotency_key text not null unique,
  command_hash text,
  occurred_at timestamptz not null default now()
);
alter table public.research_professional_audit_events
  add column if not exists command_hash text;
create index if not exists research_professional_audit_account_idx
  on public.research_professional_audit_events (account_id, occurred_at);

-- Automatically create the operational projection for canonical fulfillment
-- rows. The trigger stores workflow only and does not duplicate shipping PII.
create or replace function public.research_operations_bootstrap_work_order()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.research_fulfillment_work_orders (
    fulfillment_order_id,
    fulfillment_state,
    shipment_state,
    allocation_state,
    due_at,
    created_at,
    updated_at
  )
  values (
    new.id,
    case when new.state in ('shipped','delivered') then 'shipped' else 'awaiting_acknowledgement' end,
    case
      when new.state = 'delivered' then 'delivered'
      when new.state = 'shipped' then 'in_transit'
      else 'not_created'
    end,
    case when new.state in ('shipped','delivered') then 'shipped' else 'unallocated' end,
    new.created_at + interval '1 day',
    new.created_at,
    new.updated_at
  )
  on conflict (fulfillment_order_id) do nothing;
  return new;
end
$$;

drop trigger if exists research_operations_fulfillment_bootstrap
  on public.research_fulfillment_orders;
create trigger research_operations_fulfillment_bootstrap
after insert on public.research_fulfillment_orders
for each row execute function public.research_operations_bootstrap_work_order();

insert into public.research_fulfillment_work_orders (
  fulfillment_order_id,
  fulfillment_state,
  shipment_state,
  allocation_state,
  due_at,
  created_at,
  updated_at
)
select
  f.id,
  case when f.state in ('shipped','delivered') then 'shipped' else 'awaiting_acknowledgement' end,
  case
    when f.state = 'delivered' then 'delivered'
    when f.state = 'shipped' then 'in_transit'
    else 'not_created'
  end,
  case when f.state in ('shipped','delivered') then 'shipped' else 'unallocated' end,
  f.created_at + interval '1 day',
  f.created_at,
  f.updated_at
from public.research_fulfillment_orders f
on conflict (fulfillment_order_id) do nothing;

-- Evidence tables are append-only. Corrections are new events.
create or replace function public.research_operations_refuse_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end
$$;

drop trigger if exists research_operations_audit_append_only
  on public.research_operations_audit_events;
create trigger research_operations_audit_append_only
before update or delete on public.research_operations_audit_events
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_operations_inventory_append_only
  on public.research_operations_inventory_movements;
create trigger research_operations_inventory_append_only
before update or delete on public.research_operations_inventory_movements
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_operations_inventory_commands_append_only
  on public.research_operations_inventory_commands;
create trigger research_operations_inventory_commands_append_only
before update or delete on public.research_operations_inventory_commands
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_operations_crm_events_append_only
  on public.research_operations_crm_events;
create trigger research_operations_crm_events_append_only
before update or delete on public.research_operations_crm_events
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_operations_task_events_append_only
  on public.research_operations_task_events;
create trigger research_operations_task_events_append_only
before update or delete on public.research_operations_task_events
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_professional_audit_append_only
  on public.research_professional_audit_events;
create trigger research_professional_audit_append_only
before update or delete on public.research_professional_audit_events
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_partner_metric_events_append_only
  on public.research_partner_metric_events;
create trigger research_partner_metric_events_append_only
before update or delete on public.research_partner_metric_events
for each row execute function public.research_operations_refuse_mutation();

drop trigger if exists research_partner_portal_request_events_append_only
  on public.research_partner_portal_request_events;
create trigger research_partner_portal_request_events_append_only
before update or delete on public.research_partner_portal_request_events
for each row execute function public.research_operations_refuse_mutation();

-- One safe producer for Website 4 operational alerts. In-app alerts are
-- immediately durable/delivered rows. Email is queued only for administrators
-- who explicitly enable the `operations` immediate preference. No customer,
-- clinical, shipping-address, or payment detail enters the payload.
create or replace function public.research_operations_enqueue_alert(
  p_event_key text,
  p_event_type text,
  p_title text,
  p_summary text,
  p_action_url text,
  p_occurred_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_event_key, ''))) = 0
     or length(trim(coalesce(p_event_type, ''))) = 0
     or length(trim(coalesce(p_title, ''))) = 0
     or length(trim(coalesce(p_summary, ''))) = 0
     or p_action_url !~ '^/operations/' then
    raise exception 'invalid operations alert';
  end if;

  insert into public.research_notification_outbox (
    event_key, event_type, channel, recipient, template_key, payload, status,
    next_attempt_at, created_at, updated_at, completed_at
  )
  values (
    'operations:in_app:' || p_event_key,
    p_event_type,
    'in_app',
    'operations',
    'admin_operations_alert',
    jsonb_build_object('title', trim(p_title), 'summary', trim(p_summary), 'actionUrl', p_action_url),
    'delivered',
    p_occurred_at,
    p_occurred_at,
    p_occurred_at,
    p_occurred_at
  )
  on conflict (event_key) do nothing;

  insert into public.research_notification_outbox (
    event_key, event_type, channel, recipient, template_key, payload,
    next_attempt_at, created_at, updated_at
  )
  select
    'operations:email:' || p_event_key || ':' ||
      encode(extensions.digest(convert_to(lower(preference.admin_email), 'utf8'), 'sha256'), 'hex'),
    p_event_type,
    'email',
    preference.admin_email,
    'admin_operations_alert',
    jsonb_build_object('title', trim(p_title), 'summary', trim(p_summary), 'actionUrl', p_action_url),
    p_occurred_at,
    p_occurred_at,
    p_occurred_at
  from public.research_admin_notification_preferences preference
  where lower(coalesce(preference.immediate->>'operations', 'false')) = 'true'
  on conflict (event_key) do nothing;
end
$$;

-- Atomic fulfillment command boundary. The staff assignment, optimistic
-- version check, idempotency record, canonical state update, exact-lot
-- traceability, and operational projection update commit together.
create or replace function public.research_operations_apply_fulfillment_command(
  p_fulfillment_order_id uuid,
  p_action text,
  p_expected_version bigint,
  p_idempotency_key text,
  p_actor_id uuid,
  p_actor_role text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  work public.research_fulfillment_work_orders%rowtype;
  fulfillment public.research_fulfillment_orders%rowtype;
  line public.research_fulfillment_lines%rowtype;
  lot public.research_inventory_lots%rowtype;
  quality public.research_lot_quality_documents%rowtype;
  fulfillment_exception public.research_fulfillment_exceptions%rowtype;
  existing public.research_operations_audit_events%rowtype;
  command_hash text;
  shipment_uuid uuid;
  input_quantity integer;
begin
  if p_idempotency_key is null or length(trim(p_idempotency_key)) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Idempotency-Key is required.');
  end if;
  if p_expected_version is null or p_expected_version < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A non-negative expectedVersion is required.');
  end if;
  if p_action not in ('acknowledge','set_expected_date','allocate_exact','begin_picking','pack','add_label','ship','exception','resolve_exception','note') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Unknown fulfillment command.');
  end if;
  if p_actor_role not in ('operations_manager','mitch','logistics') or not exists (
    select 1
    from public.research_operations_staff_roles staff
    where staff.auth_user_id = p_actor_id
      and staff.role = p_actor_role
      and staff.enabled
  ) then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'An enabled server-authorized logistics role is required.');
  end if;

  command_hash := encode(
    extensions.digest(
      convert_to(
        p_action || ':' || p_expected_version::text || ':' || coalesce(p_payload, '{}'::jsonb)::text,
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into work
  from public.research_fulfillment_work_orders
  where fulfillment_order_id = p_fulfillment_order_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Fulfillment work order not found.');
  end if;

  select * into existing
  from public.research_operations_audit_events
  where fulfillment_order_id = p_fulfillment_order_id
    and idempotency_key = p_idempotency_key;
  if found then
    if existing.command_hash <> command_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'That idempotency key was already used for a different command.');
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'fulfillmentOrderId', work.fulfillment_order_id,
      'version', work.version
    );
  end if;

  if work.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'stale_write', 'message', 'The work order changed; reload it.');
  end if;

  select * into fulfillment
  from public.research_fulfillment_orders
  where id = p_fulfillment_order_id
  for update;

  if p_action = 'acknowledge' then
    if work.fulfillment_state not in ('new','awaiting_acknowledgement') then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Only a new work order can be acknowledged.');
    end if;
    work.fulfillment_state := 'acknowledged';
    work.acknowledged_at := p_occurred_at;
    update public.research_fulfillment_orders
      set state = 'accepted', updated_at = p_occurred_at
      where id = p_fulfillment_order_id;

  elsif p_action = 'set_expected_date' then
    if nullif(p_payload->>'expectedAt', '') is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'expectedAt is required.');
    end if;
    work.expected_at := (p_payload->>'expectedAt')::timestamptz;

  elsif p_action = 'allocate_exact' then
    input_quantity := nullif(p_payload->>'quantity', '')::integer;
    if nullif(p_payload->>'itemId', '') is null
      or nullif(p_payload->>'lotId', '') is null
      or input_quantity is null
      or input_quantity <= 0
      or nullif(p_payload->>'expectedLotVersion', '') is null
    then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Exact item, lot, quantity, and lot version are required.');
    end if;

    select * into line
    from public.research_fulfillment_lines
    where id = (p_payload->>'itemId')::uuid
      and fulfillment_order_id = p_fulfillment_order_id
    for update;
    if not found or line.quantity <> input_quantity then
      return jsonb_build_object('ok', false, 'code', 'inventory_refused', 'message', 'The exact fulfillment line and quantity were not found.');
    end if;

    select * into lot
    from public.research_inventory_lots
    where lot_id = p_payload->>'lotId'
    for update;
    if not found
      or lot.version <> (p_payload->>'expectedLotVersion')::bigint
      or lot.sku <> line.sku
      or lot.disposition <> 'available'
      or lot.recalled
      or lot.expiry_date is null
      or lot.expiry_date <= p_occurred_at::date
      or (lot.retest_date is not null and lot.retest_date <= p_occurred_at::date)
      or lot.shelf_life_source = 'not_confirmed'
      or lot.excursion not in ('none','cleared')
    then
      return jsonb_build_object('ok', false, 'code', 'inventory_refused', 'message', 'The lot is not eligible for exact allocation.');
    end if;

    select * into quality
    from public.research_lot_quality_documents
    where lot_id = lot.id;
    if not found
      or not quality.coa_on_file
      or not quality.identity_confirmed
      or not quality.purity_confirmed
      or quality.sterility_confirmed is false
      or quality.endotoxin_confirmed is false
    then
      return jsonb_build_object('ok', false, 'code', 'inventory_refused', 'message', 'The lot is missing required quality evidence.');
    end if;

    -- The canonical order allocation proves checkout reserved this exact lot.
    -- No stock decrement occurs here; the checkout hold already performed it.
    if not exists (
      select 1
      from public.research_lot_allocations allocation
      where allocation.order_id = fulfillment.order_id
        and allocation.lot_id = lot.id
        and allocation.quantity >= input_quantity
        and allocation.released_at is null
    ) then
      return jsonb_build_object('ok', false, 'code', 'inventory_refused', 'message', 'No finalized canonical reservation proves this exact lot for the order.');
    end if;

    if line.lot_id is not null and line.lot_id <> lot.lot_id then
      return jsonb_build_object('ok', false, 'code', 'inventory_refused', 'message', 'The fulfillment line already names a different lot.');
    end if;

    update public.research_fulfillment_lines
      set lot_id = lot.lot_id
      where id = line.id;
    update public.research_inventory_lots
      set version = version + 1, updated_at = p_occurred_at
      where id = lot.id;
    insert into public.research_operations_inventory_movements (
      lot_id, order_id, fulfillment_line_id, movement_kind, quantity,
      on_hand_delta, actor_id, actor_role, idempotency_key, occurred_at
    )
    values (
      lot.id, fulfillment.order_id, line.id, 'allocate', input_quantity,
      0, p_actor_id::text, p_actor_role, p_idempotency_key || ':allocation', p_occurred_at
    );
    work.allocation_state := case
      when not exists (
        select 1 from public.research_fulfillment_lines pending
        where pending.fulfillment_order_id = p_fulfillment_order_id
          and pending.id <> line.id
          and pending.lot_id is null
      ) then 'allocated'
      else 'reserved'
    end;

  elsif p_action = 'begin_picking' then
    if work.fulfillment_state <> 'acknowledged' or work.allocation_state <> 'allocated' then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Picking requires an acknowledged, fully allocated order.');
    end if;
    work.fulfillment_state := 'picking';

  elsif p_action = 'pack' then
    if work.fulfillment_state <> 'picking' then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Only a picked order can be packed.');
    end if;
    work.fulfillment_state := 'label_required';
    work.shipment_state := 'label_required';

  elsif p_action = 'add_label' then
    if work.fulfillment_state not in ('packed','label_required') then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'A label can be added only after packing.');
    end if;
    if nullif(trim(p_payload->>'carrier'), '') is null
      or nullif(trim(p_payload->>'service'), '') is null
      or nullif(trim(p_payload->>'tracking'), '') is null
    then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Carrier, service, and tracking are required.');
    end if;
    insert into public.research_shipments (
      fulfillment_order_id, carrier, service, tracking_number, created_at
    )
    values (
      p_fulfillment_order_id,
      trim(p_payload->>'carrier'),
      trim(p_payload->>'service'),
      trim(p_payload->>'tracking'),
      p_occurred_at
    )
    returning id into shipment_uuid;
    work.shipment_id := shipment_uuid;
    work.fulfillment_state := 'ready_to_ship';
    work.shipment_state := 'label_created';

  elsif p_action = 'ship' then
    if work.fulfillment_state <> 'ready_to_ship'
      or work.shipment_state <> 'label_created'
      or work.shipment_id is null
      or work.allocation_state <> 'allocated'
      or exists (
        select 1 from public.research_fulfillment_lines unallocated
        where unallocated.fulfillment_order_id = p_fulfillment_order_id
          and unallocated.lot_id is null
      )
      or exists (
        select 1
        from public.research_fulfillment_lines candidate_line
        left join public.research_inventory_lots candidate_lot
          on candidate_lot.lot_id = candidate_line.lot_id
        left join public.research_lot_quality_documents candidate_quality
          on candidate_quality.lot_id = candidate_lot.id
        where candidate_line.fulfillment_order_id = p_fulfillment_order_id
          and (
            candidate_lot.id is null
            or candidate_lot.disposition <> 'available'
            or candidate_lot.recalled
            or candidate_lot.expiry_date is null
            or candidate_lot.expiry_date <= p_occurred_at::date
            or (candidate_lot.retest_date is not null and candidate_lot.retest_date <= p_occurred_at::date)
            or candidate_lot.shelf_life_source = 'not_confirmed'
            or candidate_lot.excursion not in ('none','cleared')
            or candidate_quality.id is null
            or not candidate_quality.coa_on_file
            or not candidate_quality.identity_confirmed
            or not candidate_quality.purity_confirmed
            or candidate_quality.sterility_confirmed is false
            or candidate_quality.endotoxin_confirmed is false
          )
      )
    then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Shipping requires a label and exact eligible lots for every line.');
    end if;

    insert into public.research_lot_shipments (lot_id, order_id, member_id, shipped_at)
    select lot_row.id, fulfillment.order_id, order_row.member_id, p_occurred_at
    from public.research_fulfillment_lines fulfillment_line
    join public.research_inventory_lots lot_row on lot_row.lot_id = fulfillment_line.lot_id
    join public.research_orders order_row on order_row.id = fulfillment.order_id
    join public.research_lot_quality_documents quality_row on quality_row.lot_id = lot_row.id
    where fulfillment_line.fulfillment_order_id = p_fulfillment_order_id
      and lot_row.disposition = 'available'
      and not lot_row.recalled
      and lot_row.expiry_date > p_occurred_at::date
      and (lot_row.retest_date is null or lot_row.retest_date > p_occurred_at::date)
      and lot_row.shelf_life_source <> 'not_confirmed'
      and lot_row.excursion in ('none','cleared')
      and quality_row.coa_on_file
      and quality_row.identity_confirmed
      and quality_row.purity_confirmed
      and quality_row.sterility_confirmed is not false
      and quality_row.endotoxin_confirmed is not false;

    insert into public.research_operations_inventory_movements (
      lot_id, order_id, fulfillment_line_id, movement_kind, quantity,
      on_hand_delta, actor_id, actor_role, idempotency_key, occurred_at
    )
    select
      lot_row.id,
      fulfillment.order_id,
      fulfillment_line.id,
      'ship',
      fulfillment_line.quantity,
      0,
      p_actor_id::text,
      p_actor_role,
      p_idempotency_key || ':ship:' || fulfillment_line.id::text,
      p_occurred_at
    from public.research_fulfillment_lines fulfillment_line
    join public.research_inventory_lots lot_row on lot_row.lot_id = fulfillment_line.lot_id
    where fulfillment_line.fulfillment_order_id = p_fulfillment_order_id;

    update public.research_shipments
      set shipped_at = p_occurred_at
      where id = work.shipment_id;
    update public.research_fulfillment_orders
      set state = 'shipped', updated_at = p_occurred_at
      where id = p_fulfillment_order_id;
    work.fulfillment_state := 'shipped';
    work.shipment_state := 'in_transit';
    work.allocation_state := 'shipped';

  elsif p_action = 'exception' then
    if nullif(trim(p_payload->>'detail'), '') is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Exception detail is required.');
    end if;
    insert into public.research_fulfillment_exceptions (
      fulfillment_order_id, kind, severity, detail, created_by, created_at
    )
    values (
      p_fulfillment_order_id,
      coalesce(nullif(p_payload->>'kind', ''), 'other'),
      coalesce(nullif(p_payload->>'severity', ''), 'normal'),
      trim(p_payload->>'detail'),
      p_actor_id::text,
      p_occurred_at
    );
    update public.research_fulfillment_orders
      set state = 'exception', updated_at = p_occurred_at
      where id = p_fulfillment_order_id;
    work.fulfillment_state := 'exception';
    work.shipment_state := case
      when work.shipment_state = 'in_transit' then 'exception'
      else work.shipment_state
    end;

  elsif p_action = 'resolve_exception' then
    if nullif(p_payload->>'exceptionId', '') is null
       or nullif(trim(p_payload->>'resolution'), '') is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Exception id and resolution are required.');
    end if;
    select * into fulfillment_exception
    from public.research_fulfillment_exceptions
    where id = (p_payload->>'exceptionId')::uuid
      and fulfillment_order_id = p_fulfillment_order_id
      and status = 'open'
    for update;
    if not found then
      return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Open fulfillment exception not found.');
    end if;
    update public.research_fulfillment_exceptions
    set
      status = 'resolved',
      resolved_by = p_actor_id::text,
      resolved_at = p_occurred_at,
      resolution = trim(p_payload->>'resolution')
    where id = fulfillment_exception.id;
    if not exists (
      select 1 from public.research_fulfillment_exceptions
      where fulfillment_order_id = p_fulfillment_order_id
        and status = 'open'
        and id <> fulfillment_exception.id
    ) and work.fulfillment_state = 'exception' then
      work.fulfillment_state := 'acknowledged';
      update public.research_fulfillment_orders
        set state = 'accepted', updated_at = p_occurred_at
        where id = p_fulfillment_order_id;
    end if;

  elsif p_action = 'note' then
    if nullif(trim(p_payload->>'text'), '') is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A note is required.');
    end if;
    insert into public.research_fulfillment_notes (
      fulfillment_order_id, note, assistance_requested, escalation,
      actor_id, idempotency_key, created_at
    )
    values (
      p_fulfillment_order_id,
      trim(p_payload->>'text'),
      coalesce((p_payload->>'assistanceRequested')::boolean, false),
      coalesce((p_payload->>'escalation')::boolean, false),
      p_actor_id::text,
      p_idempotency_key,
      p_occurred_at
    );
  end if;

  work.version := work.version + 1;
  work.updated_at := p_occurred_at;
  update public.research_fulfillment_work_orders
  set
    fulfillment_state = work.fulfillment_state,
    shipment_state = work.shipment_state,
    allocation_state = work.allocation_state,
    due_at = work.due_at,
    expected_at = work.expected_at,
    acknowledged_at = work.acknowledged_at,
    shipment_id = work.shipment_id,
    version = work.version,
    updated_at = work.updated_at
  where fulfillment_order_id = p_fulfillment_order_id;

  insert into public.research_operations_audit_events (
    fulfillment_order_id, aggregate_version, actor_id, actor_role, action,
    idempotency_key, command_hash, metadata, occurred_at
  )
  values (
    p_fulfillment_order_id,
    work.version,
    p_actor_id::text,
    p_actor_role,
    p_action,
    p_idempotency_key,
    command_hash,
    jsonb_build_object('action', p_action),
    p_occurred_at
  );

  if p_action = 'exception' then
    perform public.research_operations_enqueue_alert(
      p_idempotency_key, 'operations.fulfillment_exception',
      'Fulfillment exception needs review.',
      'An authorized operator recorded a fulfillment exception. Open the protected queue for details.',
      '/operations/mitch?queue=exceptions', p_occurred_at
    );
  elsif p_action = 'resolve_exception' then
    perform public.research_operations_enqueue_alert(
      p_idempotency_key, 'operations.fulfillment_exception_resolved',
      'Fulfillment exception resolved.',
      'An authorized operator resolved an exception. Review the protected work order if follow-up is needed.',
      '/operations/mitch?queue=exceptions', p_occurred_at
    );
  elsif p_action = 'ship' then
    perform public.research_operations_enqueue_alert(
      p_idempotency_key, 'operations.fulfillment_shipped',
      'Fulfillment shipment recorded.',
      'A shipment passed exact-lot checks and was recorded in the protected fulfillment queue.',
      '/operations/mitch?queue=shipped_today', p_occurred_at
    );
  elsif p_action = 'note' and coalesce((p_payload->>'escalation')::boolean, false) then
    perform public.research_operations_enqueue_alert(
      p_idempotency_key, 'operations.fulfillment_escalation',
      'Fulfillment escalation needs review.',
      'An authorized operator requested assistance. Open the protected decision queue for details.',
      '/operations/mitch?queue=samuel_decisions', p_occurred_at
    );
  end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'fulfillmentOrderId', work.fulfillment_order_id,
    'version', work.version
  );
exception
  when invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The command contains an invalid identifier, number, or date.');
  when check_violation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The command violates an operations data constraint.');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A conflicting command already exists.');
end
$$;

-- Atomic production inventory lifecycle over the canonical lot/allocation
-- tables. Every command is versioned, replay-safe, append-only audited, and
-- refuses a negative available balance.
create or replace function public.research_operations_apply_inventory_command(
  p_lot_id uuid,
  p_action text,
  p_expected_version bigint,
  p_actor_id text,
  p_actor_role text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  lot public.research_inventory_lots%rowtype;
  allocation public.research_lot_allocations%rowtype;
  prior public.research_operations_inventory_commands%rowtype;
  command_hash text;
  input_quantity integer;
  input_delta integer;
  movement_order_id uuid;
  movement_reason text;
begin
  if p_action not in ('receipt','release','return','damage','quarantine','correction','reconcile')
     or p_actor_role not in ('admin','operations_manager','logistics','system')
     or length(trim(coalesce(p_actor_id, ''))) = 0
     or length(trim(coalesce(p_idempotency_key, ''))) = 0
     or p_expected_version is null or p_expected_version < 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A valid authorized inventory command is required.');
  end if;

  command_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|', p_lot_id::text, p_action, p_expected_version::text,
          p_actor_id, p_actor_role, coalesce(p_payload, '{}'::jsonb)::text
        ),
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into prior
  from public.research_operations_inventory_commands
  where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> command_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'That idempotency key belongs to another inventory command.');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'lotId', prior.lot_id, 'version', prior.resulting_version);
  end if;

  select * into lot
  from public.research_inventory_lots
  where id = p_lot_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'lot_not_found', 'message', 'Inventory lot not found.');
  end if;
  if lot.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'lot_stale', 'message', 'The inventory lot changed; reload it.');
  end if;

  input_quantity := nullif(p_payload->>'quantity', '')::integer;
  input_delta := nullif(p_payload->>'onHandDelta', '')::integer;
  movement_reason := nullif(trim(coalesce(p_payload->>'reason', '')), '');
  movement_order_id := nullif(p_payload->>'orderId', '')::uuid;

  if p_action = 'release' then
    if nullif(p_payload->>'allocationId', '') is null or movement_reason is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Allocation id and release reason are required.');
    end if;
    select * into allocation
    from public.research_lot_allocations
    where id = (p_payload->>'allocationId')::uuid
      and lot_id = lot.id
    for update;
    if not found or allocation.released_at is not null then
      return jsonb_build_object('ok', false, 'code', 'allocation_not_found', 'message', 'No active canonical allocation exists for this lot.');
    end if;
    if exists (
      select 1
      from public.research_lot_shipments shipment
      where shipment.lot_id = lot.id
        and shipment.order_id = allocation.order_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'A shipped allocation cannot be released.');
    end if;
    input_quantity := allocation.quantity;
    movement_order_id := allocation.order_id;
    update public.research_lot_allocations
      set released_at = p_occurred_at
      where id = allocation.id;
    lot.quantity_available := lot.quantity_available + input_quantity;
    input_delta := 0;

  elsif p_action = 'return' then
    if input_quantity is null or input_quantity <= 0 or movement_reason is null or movement_order_id is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Return quantity, order, and reason are required.');
    end if;
    if not exists (
      select 1 from public.research_lot_shipments
      where lot_id = lot.id and order_id = movement_order_id
    ) then
      return jsonb_build_object('ok', false, 'code', 'allocation_not_found', 'message', 'No shipped traceability record proves this return.');
    end if;
    lot.quantity_available := lot.quantity_available + input_quantity;
    input_delta := input_quantity;

  elsif p_action = 'receipt' then
    if input_quantity is null or input_quantity <= 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_quantity', 'message', 'Receipt quantity must be a positive integer.');
    end if;
    lot.quantity_available := lot.quantity_available + input_quantity;
    input_delta := input_quantity;

  elsif p_action = 'damage' then
    if input_quantity is null or input_quantity <= 0 or movement_reason is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Damage quantity and reason are required.');
    end if;
    input_delta := -input_quantity;
    if lot.quantity_available + input_delta < 0 then
      return jsonb_build_object('ok', false, 'code', 'insufficient_available', 'message', 'Damage would make available inventory negative.');
    end if;
    lot.quantity_available := lot.quantity_available + input_delta;

  elsif p_action = 'quarantine' then
    if movement_reason is null then
      return jsonb_build_object('ok', false, 'code', 'reason_required', 'message', 'A quarantine reason is required.');
    end if;
    input_quantity := lot.quantity_available;
    input_delta := 0;
    lot.disposition := 'quarantined';

  else
    if input_quantity is null or input_quantity <= 0 or input_delta is null or movement_reason is null then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Adjustment quantity, delta, and signed reason are required.');
    end if;
    if lot.quantity_available + input_delta < 0 then
      return jsonb_build_object('ok', false, 'code', 'insufficient_available', 'message', 'Adjustment would make available inventory negative.');
    end if;
    lot.quantity_available := lot.quantity_available + input_delta;
  end if;

  lot.version := lot.version + 1;
  lot.updated_at := p_occurred_at;
  update public.research_inventory_lots
  set
    quantity_available = lot.quantity_available,
    disposition = lot.disposition,
    version = lot.version,
    updated_at = lot.updated_at
  where id = lot.id;

  insert into public.research_operations_inventory_movements (
    lot_id, order_id, movement_kind, quantity, on_hand_delta, actor_id,
    actor_role, reason, idempotency_key, occurred_at
  )
  values (
    lot.id, movement_order_id, p_action, input_quantity, input_delta,
    p_actor_id, p_actor_role, movement_reason, p_idempotency_key, p_occurred_at
  );

  insert into public.research_operations_inventory_commands (
    lot_id, action, actor_id, actor_role, idempotency_key, command_hash,
    resulting_version, occurred_at
  )
  values (
    lot.id, p_action, p_actor_id, p_actor_role, p_idempotency_key, command_hash,
    lot.version, p_occurred_at
  );

  if p_action in ('damage','quarantine','correction','reconcile') then
    perform public.research_operations_enqueue_alert(
      p_idempotency_key, 'operations.inventory_' || p_action,
      'Inventory action needs review.',
      'An authorized inventory command was recorded. Open the protected inventory queue for details.',
      '/operations/inventory', p_occurred_at
    );
  end if;

  return jsonb_build_object('ok', true, 'idempotent', false, 'lotId', lot.id, 'version', lot.version);
exception
  when invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The inventory command contains an invalid identifier, number, or date.');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A conflicting inventory command already exists.');
end
$$;

-- Atomic operational CRM commands. The database repeats the privacy boundary
-- enforced by the domain service so clinical or highly sensitive notes cannot
-- enter this administrative contact history.
create or replace function public.research_operations_apply_crm_command(
  p_contact_id uuid,
  p_action text,
  p_expected_version bigint,
  p_actor_id text,
  p_actor_role text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  contact public.research_operations_crm_contacts%rowtype;
  prior public.research_operations_crm_events%rowtype;
  command_hash text;
  previous_stage text;
  event_kind text;
  event_summary text;
  event_reference_type text;
  event_reference_id text;
begin
  if p_actor_role not in ('admin','operations_manager','system')
     or p_action not in ('create','stage','note','link')
     or length(trim(coalesce(p_actor_id, ''))) = 0
     or length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'A valid authorized CRM command is required.');
  end if;

  command_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|', p_action, coalesce(p_contact_id::text, ''),
          coalesce(p_expected_version::text, ''), p_actor_id, p_actor_role,
          coalesce(p_payload, '{}'::jsonb)::text
        ),
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into prior
  from public.research_operations_crm_events
  where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> command_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'That idempotency key belongs to another CRM command.');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'contactId', prior.contact_id);
  end if;

  if p_action = 'create' then
    if p_payload->>'kind' not in ('member','applicant','affiliate','professional')
       or length(trim(coalesce(p_payload->>'displayName', ''))) = 0
       or coalesce(p_payload->>'email', '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A valid CRM contact is required.');
    end if;
    insert into public.research_operations_crm_contacts (
      id, kind, display_name, email, created_at, updated_at
    )
    values (
      coalesce(p_contact_id, gen_random_uuid()),
      p_payload->>'kind',
      trim(p_payload->>'displayName'),
      lower(trim(p_payload->>'email')),
      p_occurred_at,
      p_occurred_at
    )
    returning * into contact;

    insert into public.research_operations_crm_events (
      contact_id, kind, actor_id, actor_role, summary, reference_type,
      reference_id, idempotency_key, command_hash, occurred_at
    )
    values (
      contact.id, 'created', p_actor_id, p_actor_role, 'Contact created.',
      null, null, p_idempotency_key, command_hash, p_occurred_at
    );
    return jsonb_build_object('ok', true, 'idempotent', false, 'contactId', contact.id);
  end if;

  if p_contact_id is null or p_expected_version is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Contact id and expected version are required.');
  end if;
  select * into contact
  from public.research_operations_crm_contacts
  where id = p_contact_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'CRM contact not found.');
  end if;
  if contact.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'stale_write', 'message', 'The CRM record changed; reload it.');
  end if;
  previous_stage := contact.stage;

  if p_action = 'stage' then
    if p_payload->>'to' not in (
      'new','pending_application','pending_activation','payment_verification','active','paused','closed'
    ) or p_payload->>'to' = contact.stage then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'That CRM stage transition is invalid.');
    end if;
    event_kind := 'stage_changed';
    event_summary := contact.stage || ' -> ' || (p_payload->>'to');
    contact.stage := p_payload->>'to';
  elsif p_action = 'note' then
    event_summary := trim(coalesce(p_payload->>'summary', ''));
    if length(event_summary) = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A CRM note is required.');
    end if;
    if event_summary ~* '(diagnos(is|ed|tic)|prescri(be|ption|bed)|patient|medical|medication|ssn|date of birth)' then
      return jsonb_build_object('ok', false, 'code', 'privacy_refused', 'message', 'Clinical, patient, and highly sensitive identity data do not belong in operations CRM.');
    end if;
    event_kind := 'note';
  else
    event_reference_type := p_payload->>'referenceType';
    event_reference_id := trim(coalesce(p_payload->>'referenceId', ''));
    if event_reference_type not in ('order','exception') or length(event_reference_id) = 0 then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A valid operational reference is required.');
    end if;
    event_kind := case when event_reference_type = 'order' then 'order_linked' else 'exception_linked' end;
    event_summary := event_reference_type || ' linked';
  end if;

  update public.research_operations_crm_contacts
  set
    stage = contact.stage,
    version = version + 1,
    updated_at = p_occurred_at
  where id = contact.id
  returning * into contact;

  insert into public.research_operations_crm_events (
    contact_id, kind, actor_id, actor_role, summary, reference_type,
    reference_id, idempotency_key, command_hash, occurred_at
  )
  values (
    contact.id, event_kind, p_actor_id, p_actor_role, event_summary,
    event_reference_type, event_reference_id, p_idempotency_key, command_hash, p_occurred_at
  );

  return jsonb_build_object(
    'ok', true, 'idempotent', false, 'contactId', contact.id,
    'previousStage', previous_stage, 'version', contact.version
  );
exception
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The CRM command contains an invalid identifier.');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A conflicting CRM command already exists.');
end
$$;

-- Atomic operations task creation and transition. The append-only event owns
-- the idempotency key and command fingerprint, so replays are safe and a reused
-- key with different input fails closed.
create or replace function public.research_operations_apply_task_command(
  p_task_id uuid,
  p_action text,
  p_expected_version bigint,
  p_actor_id text,
  p_actor_role text,
  p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task public.research_operations_tasks%rowtype;
  prior public.research_operations_task_events%rowtype;
  command_hash text;
  next_status text;
  previous_status text;
begin
  if p_actor_role not in ('admin','operations_manager','finance','system') then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'This role cannot change operations tasks.');
  end if;
  if length(trim(coalesce(p_actor_id, ''))) = 0
     or length(trim(coalesce(p_idempotency_key, ''))) = 0
     or p_action not in ('create','transition') then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A valid task command is required.');
  end if;

  command_hash := encode(
    extensions.digest(
      convert_to(
        concat_ws(
          '|',
          p_action,
          coalesce(p_task_id::text, ''),
          coalesce(p_expected_version::text, ''),
          p_actor_id,
          p_actor_role,
          coalesce(p_payload, '{}'::jsonb)::text
        ),
        'utf8'
      ),
      'sha256'
    ),
    'hex'
  );

  select * into prior
  from public.research_operations_task_events
  where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash <> command_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'That idempotency key belongs to another task command.');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'taskId', prior.task_id);
  end if;

  if p_action = 'create' then
    if length(trim(coalesce(p_payload->>'title', ''))) = 0
       or coalesce(p_payload->>'priority', 'normal') not in ('normal','urgent','samuel_decision') then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Task title and priority are invalid.');
    end if;
    if
      (nullif(trim(coalesce(p_payload->>'sourceType', '')), '') is null)
      <>
      (nullif(trim(coalesce(p_payload->>'sourceId', '')), '') is null)
    then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Task source type and id must be supplied together.');
    end if;

    insert into public.research_operations_tasks (
      id, title, description, priority, assigned_to, source_type, source_id,
      due_at, created_by, created_at, updated_at
    )
    values (
      coalesce(p_task_id, gen_random_uuid()),
      trim(p_payload->>'title'),
      nullif(trim(coalesce(p_payload->>'description', '')), ''),
      coalesce(p_payload->>'priority', 'normal'),
      nullif(trim(coalesce(p_payload->>'assignedTo', '')), ''),
      nullif(trim(coalesce(p_payload->>'sourceType', '')), ''),
      nullif(trim(coalesce(p_payload->>'sourceId', '')), ''),
      nullif(p_payload->>'dueAt', '')::timestamptz,
      p_actor_id,
      p_occurred_at,
      p_occurred_at
    )
    returning * into task;

    insert into public.research_operations_task_events (
      task_id, from_status, to_status, assigned_to, actor_id, actor_role,
      idempotency_key, command_hash, occurred_at
    )
    values (
      task.id, null, 'open', task.assigned_to, p_actor_id, p_actor_role,
      p_idempotency_key, command_hash, p_occurred_at
    );
    return jsonb_build_object('ok', true, 'idempotent', false, 'taskId', task.id);
  end if;

  if p_task_id is null or p_expected_version is null then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Task id and expected version are required.');
  end if;
  select * into task
  from public.research_operations_tasks
  where id = p_task_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Operations task not found.');
  end if;
  if task.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'stale_write', 'message', 'The task changed; reload it.');
  end if;
  next_status := p_payload->>'to';
  previous_status := task.status;
  if next_status not in ('open','in_progress','blocked','completed','cancelled')
     or task.status in ('completed','cancelled')
     or next_status = task.status then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'That task transition is not allowed.');
  end if;

  update public.research_operations_tasks
  set
    status = next_status,
    assigned_to = case
      when p_payload ? 'assignedTo' then nullif(trim(coalesce(p_payload->>'assignedTo', '')), '')
      else assigned_to
    end,
    version = version + 1,
    updated_at = p_occurred_at,
    completed_at = case
      when next_status in ('completed','cancelled') then p_occurred_at
      else null
    end
  where id = task.id
  returning * into task;

  insert into public.research_operations_task_events (
    task_id, from_status, to_status, assigned_to, actor_id, actor_role,
    idempotency_key, command_hash, occurred_at
  )
  values (
    task.id, previous_status,
    next_status, task.assigned_to, p_actor_id, p_actor_role,
    p_idempotency_key, command_hash, p_occurred_at
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'taskId', task.id);
exception
  when invalid_text_representation or datetime_field_overflow then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The task command contains an invalid identifier or date.');
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A conflicting task command already exists.');
end
$$;

-- Atomic partner request intake for campaign, event, organization, and
-- compliance forms. Replays return the original request.
create or replace function public.research_operations_submit_partner_request(
  p_partner_id uuid,
  p_kind text,
  p_title text,
  p_payload jsonb,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  request_row public.research_partner_portal_requests%rowtype;
begin
  if p_kind not in ('campaign','event','organization','compliance')
     or length(trim(coalesce(p_title, ''))) = 0
     or length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'A valid partner request is required.');
  end if;
  if not exists (
    select 1 from public.research_partners
    where id = p_partner_id and state <> 'terminated'
  ) then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Partner account not found.');
  end if;

  select * into request_row
  from public.research_partner_portal_requests
  where partner_id = p_partner_id
    and kind = p_kind
    and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'requestId', request_row.id);
  end if;

  insert into public.research_partner_portal_requests (
    partner_id, kind, title, payload, idempotency_key, created_at, updated_at
  )
  values (
    p_partner_id, p_kind, trim(p_title), coalesce(p_payload, '{}'::jsonb),
    p_idempotency_key, p_occurred_at, p_occurred_at
  )
  returning * into request_row;

  insert into public.research_partner_portal_request_events (
    request_id, from_state, to_state, actor_id, detail, occurred_at
  )
  values (
    request_row.id, null, 'submitted', p_partner_id::text, 'Partner portal submission', p_occurred_at
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'requestId', request_row.id);
exception
  when unique_violation then
    select * into request_row
    from public.research_partner_portal_requests
    where partner_id = p_partner_id
      and kind = p_kind
      and idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'idempotent', true, 'requestId', request_row.id);
    end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'Conflicting partner request.');
end
$$;

create or replace function public.research_operations_apply_professional_account(
  p_account_type text,
  p_organization_name text,
  p_contact_email text,
  p_programs text[],
  p_economic_terms jsonb,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.research_professional_accounts%rowtype;
  requested_program text;
begin
  select * into account
  from public.research_professional_accounts
  where application_idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('ok', true, 'idempotent', true, 'accountId', account.id);
  end if;

  if p_account_type not in ('practitioner','professional')
    or length(trim(coalesce(p_organization_name, ''))) = 0
    or coalesce(p_contact_email, '') !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
    or coalesce(cardinality(p_programs), 0) = 0
    or length(trim(coalesce(p_idempotency_key, ''))) = 0
  then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Organization, email, and at least one valid program are required.');
  end if;

  if coalesce(p_economic_terms, '{}'::jsonb) ?| array[
    'prescriptionPaymentCents','patientReferralPaymentCents',
    'diagnosisPaymentCents','clinicalApprovalPaymentCents',
    'medicationValuePaymentCents','prescription','patientReferral',
    'diagnosis','clinicalApproval','medicationValue'
  ] then
    return jsonb_build_object('ok', false, 'code', 'clinical_economics_refused', 'message', 'Clinical referral economics are prohibited.');
  end if;

  foreach requested_program in array p_programs
  loop
    if requested_program not in (
      'wholesale','reseller','professional_membership','directory','education',
      'event','implementation','software','future_clinical_partnership'
    ) then
      return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'An unknown professional program was supplied.');
    end if;
  end loop;

  insert into public.research_professional_accounts (
    account_type, organization_name, contact_email, economic_terms,
    application_idempotency_key, created_at, updated_at
  )
  values (
    p_account_type,
    trim(p_organization_name),
    lower(trim(p_contact_email)),
    jsonb_build_object(
      'wholesaleDiscountBps', 0,
      'resellerDiscountBps', 0,
      'membershipFeeCents', 0,
      'directoryFeeCents', 0,
      'educationFeeCents', 0,
      'eventFeeCents', 0,
      'implementationFeeCents', 0,
      'softwareFeeCents', 0
    ) || coalesce(p_economic_terms, '{}'::jsonb),
    p_idempotency_key,
    p_occurred_at,
    p_occurred_at
  )
  returning * into account;

  insert into public.research_professional_programs (account_id, program)
  select account.id, program
  from unnest(p_programs) as program
  on conflict (account_id, program) do nothing;

  insert into public.research_professional_audit_events (
    account_id, action, actor_id, actor_role, idempotency_key, occurred_at
  )
  values (
    account.id, 'applied', 'public', 'public', p_idempotency_key, p_occurred_at
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'accountId', account.id);
exception
  when unique_violation then
    select * into account
    from public.research_professional_accounts
    where application_idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object('ok', true, 'idempotent', true, 'accountId', account.id);
    end if;
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'A conflicting professional account already exists.');
  when check_violation then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'The professional application violates a data constraint.');
end
$$;

create or replace function public.research_operations_transition_professional_account(
  p_account_id uuid,
  p_to_state text,
  p_expected_version bigint,
  p_agreement_version text,
  p_actor_id text,
  p_actor_role text,
  p_idempotency_key text,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account public.research_professional_accounts%rowtype;
  prior public.research_professional_audit_events%rowtype;
  command_hash text;
  allowed boolean := false;
begin
  if p_actor_role not in ('admin','operations_manager') then
    return jsonb_build_object('ok', false, 'code', 'forbidden', 'message', 'Professional review role required.');
  end if;
  if p_expected_version is null or p_expected_version < 0
     or length(trim(coalesce(p_idempotency_key, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Version and Idempotency-Key are required.');
  end if;

  command_hash := encode(extensions.digest(
    concat_ws('|', p_account_id::text, p_to_state, p_expected_version::text, coalesce(p_agreement_version, ''), p_actor_id),
    'sha256'
  ), 'hex');
  select * into prior
  from public.research_professional_audit_events
  where idempotency_key = p_idempotency_key;
  if found then
    if prior.command_hash is distinct from command_hash then
      return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'Idempotency-Key was used for another transition.');
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'accountId', prior.account_id);
  end if;

  select * into account
  from public.research_professional_accounts
  where id = p_account_id
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'not_found', 'message', 'Professional account not found.');
  end if;
  if account.version <> p_expected_version then
    return jsonb_build_object('ok', false, 'code', 'stale_write', 'message', 'Professional account changed; reload it.');
  end if;

  allowed := case account.state
    when 'applied' then p_to_state in ('prospect','under_review','rejected','terminated','closed')
    when 'prospect' then p_to_state in ('discovery','closed','terminated')
    when 'discovery' then p_to_state in ('diligence','closed','terminated')
    when 'diligence' then p_to_state in ('commercial_review','closed','terminated')
    when 'commercial_review' then p_to_state in ('agreement','closed','terminated')
    when 'agreement' then p_to_state in ('active','closed','terminated')
    when 'under_review' then p_to_state in ('approved','rejected','terminated','closed')
    when 'approved' then p_to_state in ('agreement','active','rejected','terminated','closed')
    when 'active' then p_to_state in ('paused','closed','terminated')
    when 'paused' then p_to_state in ('active','closed','terminated')
    else false
  end;
  if not allowed then
    return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'Professional transition is not allowed.');
  end if;
  if p_to_state in ('agreement','approved') and length(trim(coalesce(p_agreement_version, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_input', 'message', 'Agreement version is required.');
  end if;
  if p_to_state = 'active'
     and length(trim(coalesce(p_agreement_version, account.agreement_version, ''))) = 0 then
    return jsonb_build_object('ok', false, 'code', 'invalid_state', 'message', 'An approved agreement is required before activation.');
  end if;

  update public.research_professional_accounts
  set
    state = p_to_state,
    agreement_version = case
      when p_to_state in ('agreement','approved') then trim(p_agreement_version)
      else coalesce(nullif(trim(coalesce(p_agreement_version, '')), ''), agreement_version)
    end,
    version = version + 1,
    updated_at = p_occurred_at
  where id = account.id
  returning * into account;

  insert into public.research_professional_audit_events (
    account_id, action, actor_id, actor_role, idempotency_key, command_hash, occurred_at
  )
  values (
    account.id, p_to_state, p_actor_id, p_actor_role, p_idempotency_key, command_hash, p_occurred_at
  );

  return jsonb_build_object('ok', true, 'idempotent', false, 'accountId', account.id);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'idempotency_conflict', 'message', 'Conflicting professional transition.');
end
$$;

-- Every new table is service-role-only. RLS remains enabled even though the API
-- uses the server client, so an accidental browser grant still fails closed.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'research_operations_staff_roles',
    'research_fulfillment_work_orders',
    'research_operations_audit_events',
    'research_operations_inventory_movements',
    'research_operations_inventory_commands',
    'research_fulfillment_exceptions',
    'research_fulfillment_notes',
    'research_operations_crm_contacts',
    'research_operations_crm_events',
    'research_operations_tasks',
    'research_operations_task_events',
    'research_commission_policies',
    'research_lawrence_partner_models',
    'research_partner_metric_events',
    'research_partner_portal_requests',
    'research_partner_portal_request_events',
    'research_partner_security_sessions',
    'research_professional_accounts',
    'research_professional_programs',
    'research_professional_audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update, delete on table public.%I to service_role', table_name);
  end loop;
end
$$;

-- Canonical tables touched by Website 4 remain inaccessible to browsers.
revoke all on table public.research_inventory_lots from anon, authenticated;
revoke all on table public.research_partner_links from anon, authenticated;
revoke all on table public.research_attribution_conversions from anon, authenticated;

-- Functions are trigger-only in this migration. Application mutations are
-- performed through the server's service-role adapter with optimistic
-- concurrency and database uniqueness constraints. No public EXECUTE remains.
revoke all on function public.research_operations_bootstrap_work_order() from public, anon, authenticated;
revoke all on function public.research_operations_refuse_mutation() from public, anon, authenticated;
revoke all on function public.research_operations_enqueue_alert(
  text, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_enqueue_alert(
  text, text, text, text, text, timestamptz
) to service_role;
revoke all on function public.research_operations_apply_fulfillment_command(
  uuid, text, bigint, text, uuid, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_apply_fulfillment_command(
  uuid, text, bigint, text, uuid, text, jsonb, timestamptz
) to service_role;
revoke all on function public.research_operations_apply_inventory_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_apply_inventory_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) to service_role;
revoke all on function public.research_operations_apply_crm_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_apply_crm_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) to service_role;
revoke all on function public.research_operations_apply_task_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_apply_task_command(
  uuid, text, bigint, text, text, text, jsonb, timestamptz
) to service_role;
revoke all on function public.research_operations_submit_partner_request(
  uuid, text, text, jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_submit_partner_request(
  uuid, text, text, jsonb, text, timestamptz
) to service_role;
revoke all on function public.research_operations_apply_professional_account(
  text, text, text, text[], jsonb, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_apply_professional_account(
  text, text, text, text[], jsonb, text, timestamptz
) to service_role;
revoke all on function public.research_operations_transition_professional_account(
  uuid, text, bigint, text, text, text, text, timestamptz
) from public, anon, authenticated;
grant execute on function public.research_operations_transition_professional_account(
  uuid, text, bigint, text, text, text, text, timestamptz
) to service_role;
