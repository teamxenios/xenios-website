-- Website 4 additive schema: operations, fulfillment, affiliates, and
-- professional accounts. This is intentionally NOT a production bundle.
-- Website 2 / release management owns production migration composition.

create extension if not exists pgcrypto;

create type research_operations_role as enum (
  'admin', 'operations_manager', 'finance', 'mitch', 'logistics',
  'affiliate', 'professional', 'system', 'provider'
);
create type research_payment_state as enum ('pending', 'authorized', 'captured', 'failed', 'refunded', 'chargeback');
create type research_operations_order_state as enum ('new', 'confirmed', 'processing', 'complete', 'cancelled', 'returned');
create type research_fulfillment_state as enum (
  'new', 'awaiting_acknowledgement', 'acknowledged', 'picking', 'packed',
  'label_required', 'ready_to_ship', 'shipped', 'exception', 'returned'
);
create type research_shipment_state as enum (
  'not_created', 'label_required', 'label_created', 'in_transit',
  'delivered', 'exception', 'return_requested', 'returned'
);
create type research_allocation_state as enum ('unallocated', 'reserved', 'allocated', 'released', 'shipped');
create type research_inventory_movement_kind as enum (
  'receipt', 'reserve', 'allocate', 'release', 'ship', 'return',
  'damage', 'correction', 'reconcile'
);
create type research_notification_channel as enum ('in_app', 'email', 'sms', 'telegram');
create type research_notification_status as enum (
  'pending', 'processing', 'sent', 'failed_retryable',
  'failed_permanent', 'suppressed'
);
create type research_affiliate_state as enum (
  'invited', 'applied', 'under_review', 'approved', 'active',
  'paused', 'rejected', 'terminated'
);
create type research_professional_program as enum (
  'wholesale', 'reseller', 'professional_membership', 'directory',
  'education', 'event', 'implementation', 'software',
  'future_clinical_partnership'
);

create table if not exists research_operations_orders (
  id uuid primary key default gen_random_uuid(),
  source_order_id text not null unique,
  member_ref uuid not null,
  order_reference text not null unique,
  payment_state research_payment_state not null default 'pending',
  order_state research_operations_order_state not null default 'new',
  fulfillment_state research_fulfillment_state not null default 'new',
  shipment_state research_shipment_state not null default 'not_created',
  allocation_state research_allocation_state not null default 'unallocated',
  version bigint not null default 0 check (version >= 0),
  due_at timestamptz not null,
  expected_at timestamptz,
  acknowledged_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_operations_audit_events (
  id uuid primary key default gen_random_uuid(),
  aggregate_id uuid not null references research_operations_orders(id),
  aggregate_version bigint not null check (aggregate_version > 0),
  actor_id text not null,
  actor_role research_operations_role not null,
  action text not null,
  machine text not null check (machine in ('payment', 'order', 'fulfillment', 'shipment', 'allocation')),
  from_state text not null,
  to_state text not null,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  unique (aggregate_id, idempotency_key),
  unique (aggregate_id, aggregate_version)
);

create table if not exists research_operations_lots (
  id uuid primary key default gen_random_uuid(),
  lot_code text not null unique,
  sku text not null,
  owner text not null check (owner in ('mitch', 'xenios')),
  disposition text not null,
  manufactured_date date,
  expiry_date date,
  retest_date date,
  shelf_life_source text not null check (shelf_life_source in ('supplier_document', 'coa', 'not_confirmed')),
  coa_on_file boolean not null default false,
  identity_confirmed boolean not null default false,
  purity_confirmed boolean not null default false,
  sterility_confirmed boolean,
  endotoxin_confirmed boolean,
  excursion_state text not null default 'none' check (excursion_state in ('none', 'pending_review', 'cleared', 'rejected')),
  recalled boolean not null default false,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_operations_inventory_movements (
  id uuid primary key default gen_random_uuid(),
  lot_id uuid not null references research_operations_lots(id),
  sku text not null,
  movement_kind research_inventory_movement_kind not null,
  quantity integer not null check (quantity > 0),
  on_hand_delta integer not null,
  order_id uuid references research_operations_orders(id),
  item_id text,
  actor_id text not null,
  actor_role research_operations_role not null,
  reason text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now(),
  check (
    (movement_kind in ('reserve', 'allocate', 'release') and on_hand_delta = 0)
    or (movement_kind = 'receipt' and on_hand_delta = quantity)
    or (movement_kind in ('ship', 'damage') and on_hand_delta = -quantity)
    or (movement_kind = 'return' and on_hand_delta = quantity)
    or movement_kind in ('correction', 'reconcile')
  ),
  check (movement_kind not in ('correction', 'reconcile', 'damage', 'release') or length(trim(coalesce(reason, ''))) > 0)
);

create table if not exists research_operations_exact_lot_allocations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references research_operations_orders(id),
  item_id text not null,
  sku text not null,
  lot_id uuid not null references research_operations_lots(id),
  quantity integer not null check (quantity > 0),
  returned_quantity integer not null default 0 check (returned_quantity >= 0 and returned_quantity <= quantity),
  status text not null check (status in ('allocated', 'released', 'shipped')),
  allocated_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (order_id, item_id)
);

create table if not exists research_operations_shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references research_operations_orders(id),
  carrier text not null,
  service text not null,
  tracking text not null unique,
  state research_shipment_state not null default 'label_created',
  shipped_at timestamptz,
  delivered_at timestamptz,
  provider_reference text,
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_operations_returns (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references research_operations_orders(id),
  item_id text not null,
  lot_id uuid not null references research_operations_lots(id),
  quantity integer not null check (quantity > 0),
  reason text not null check (length(trim(reason)) > 0),
  idempotency_key text not null unique,
  received_at timestamptz not null default now()
);

create table if not exists research_operations_exceptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references research_operations_orders(id),
  kind text not null check (kind in ('shortage', 'inventory', 'address', 'carrier', 'damage', 'quality', 'other')),
  severity text not null check (severity in ('normal', 'urgent', 'samuel_decision')),
  detail text not null check (length(trim(detail)) > 0),
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_by text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists research_operations_crm_contacts (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('member', 'applicant', 'affiliate', 'professional')),
  display_name text not null,
  email citext not null,
  stage text not null check (stage in ('new', 'pending_application', 'pending_activation', 'payment_verification', 'active', 'paused', 'closed')),
  tags text[] not null default '{}',
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_operations_crm_events (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references research_operations_crm_contacts(id),
  kind text not null check (kind in ('created', 'stage_changed', 'note', 'order_linked', 'exception_linked', 'follow_up')),
  actor_id text not null,
  actor_role research_operations_role not null,
  summary text not null,
  reference_type text check (reference_type in ('order', 'exception')),
  reference_id text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now()
);

create table if not exists research_operations_notification_outbox (
  id uuid primary key default gen_random_uuid(),
  audience_kind text not null check (audience_kind in ('member', 'affiliate', 'professional', 'operator')),
  audience_id uuid not null,
  channel research_notification_channel not null,
  topic text not null,
  dedupe_key text not null,
  sensitivity text not null check (sensitivity in ('public', 'operational', 'customer_sensitive')),
  title text not null,
  body text not null,
  action_url text,
  status research_notification_status not null default 'pending',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  provider_reference text,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (audience_kind, audience_id, channel, dedupe_key),
  check (
    channel not in ('sms', 'telegram')
    or sensitivity <> 'customer_sensitive'
    or status = 'suppressed'
  )
);

create table if not exists research_operations_affiliates (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  email citext not null unique,
  display_name text not null,
  state research_affiliate_state not null default 'invited',
  invitation_hash text,
  agreement_version text,
  custom_code text unique,
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists research_operations_affiliate_links (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references research_operations_affiliates(id),
  code text not null unique,
  campaign text,
  created_at timestamptz not null default now()
);

create table if not exists research_operations_attribution_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  affiliate_id uuid not null references research_operations_affiliates(id),
  link_id uuid not null references research_operations_affiliate_links(id),
  campaign text,
  event_kind text not null check (event_kind in ('attributed', 'manual_override')),
  actor_id text not null,
  reason text,
  occurred_at timestamptz not null default now(),
  check (event_kind <> 'manual_override' or length(trim(coalesce(reason, ''))) > 0)
);
create unique index if not exists research_operations_attribution_initial_winner
  on research_operations_attribution_events(order_id) where event_kind = 'attributed';

create table if not exists research_operations_commission_policies (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid references research_operations_affiliates(id),
  version text not null,
  rule_document jsonb not null,
  rate_ceiling_bps integer not null check (rate_ceiling_bps between 0 and 10000),
  effective_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (partner_id, version)
);

create table if not exists research_operations_commission_events (
  id uuid primary key default gen_random_uuid(),
  chain_id uuid not null,
  affiliate_id uuid not null references research_operations_affiliates(id),
  order_id text not null,
  event_kind text not null check (event_kind in ('accrued', 'approved', 'payable', 'paid', 'reversed')),
  state text not null check (state in ('pending', 'approved', 'payable', 'paid', 'reversed')),
  amount_cents bigint not null,
  eligible_revenue_cents bigint not null check (eligible_revenue_cents >= 0),
  policy_id uuid not null references research_operations_commission_policies(id),
  policy_version text not null,
  actor_id text not null,
  actor_role research_operations_role not null,
  reason text,
  provider_reference text,
  idempotency_key text not null unique,
  occurred_at timestamptz not null default now()
);

create table if not exists research_operations_payouts (
  id uuid primary key default gen_random_uuid(),
  affiliate_id uuid not null references research_operations_affiliates(id),
  batch_id text not null,
  amount_cents bigint not null check (amount_cents > 0),
  provider_reference text not null,
  paid_at timestamptz not null,
  unique (affiliate_id, batch_id),
  unique (provider_reference)
);

create table if not exists research_operations_professional_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique,
  account_type text not null check (account_type in ('practitioner', 'professional')),
  organization_name text not null,
  contact_email citext not null,
  state text not null check (state in ('applied', 'under_review', 'approved', 'active', 'paused', 'rejected', 'terminated')),
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
  version bigint not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (
    not (economic_terms ?| array[
      'prescriptionPaymentCents', 'patientReferralPaymentCents',
      'diagnosisPaymentCents', 'clinicalApprovalPaymentCents',
      'medicationValuePaymentCents'
    ])
  )
);

create table if not exists research_operations_professional_programs (
  account_id uuid not null references research_operations_professional_accounts(id),
  program research_professional_program not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'active', 'paused', 'closed')),
  terms_document jsonb not null default '{}'::jsonb,
  primary key (account_id, program),
  check (
    not (terms_document ?| array[
      'prescriptionPaymentCents', 'patientReferralPaymentCents',
      'diagnosisPaymentCents', 'clinicalApprovalPaymentCents',
      'medicationValuePaymentCents'
    ])
  )
);

-- Append-only enforcement for evidence tables.
create or replace function research_operations_refuse_mutation()
returns trigger language plpgsql as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists research_operations_inventory_append_only on research_operations_inventory_movements;
create trigger research_operations_inventory_append_only
before update or delete on research_operations_inventory_movements
for each row execute function research_operations_refuse_mutation();

drop trigger if exists research_operations_audit_append_only on research_operations_audit_events;
create trigger research_operations_audit_append_only
before update or delete on research_operations_audit_events
for each row execute function research_operations_refuse_mutation();

drop trigger if exists research_operations_attribution_append_only on research_operations_attribution_events;
create trigger research_operations_attribution_append_only
before update or delete on research_operations_attribution_events
for each row execute function research_operations_refuse_mutation();

drop trigger if exists research_operations_commission_append_only on research_operations_commission_events;
create trigger research_operations_commission_append_only
before update or delete on research_operations_commission_events
for each row execute function research_operations_refuse_mutation();

alter table research_operations_orders enable row level security;
alter table research_operations_inventory_movements enable row level security;
alter table research_operations_crm_contacts enable row level security;
alter table research_operations_notification_outbox enable row level security;
alter table research_operations_affiliates enable row level security;
alter table research_operations_professional_accounts enable row level security;

-- Service-role-only by default. Authenticated access is exposed through
-- server-authorized routes, never direct table grants.
revoke all on research_operations_orders from anon, authenticated;
revoke all on research_operations_inventory_movements from anon, authenticated;
revoke all on research_operations_crm_contacts from anon, authenticated;
revoke all on research_operations_notification_outbox from anon, authenticated;
revoke all on research_operations_affiliates from anon, authenticated;
revoke all on research_operations_professional_accounts from anon, authenticated;
