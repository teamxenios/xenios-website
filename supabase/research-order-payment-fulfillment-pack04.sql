-- Xenios Orders, Payments and Fulfillment — Pack 04.
-- DRAFT, NOT RUN. This file is deliberately outside supabase/migrations until
-- the release owner assigns its migration identity and completes disposable
-- PostgreSQL apply-twice verification. It mounts no route and deploys nothing.
--
-- The TypeScript reference workflow lives at
-- server/research/commerce/order-payment-fulfillment.ts. The constraints and
-- triggers below move its non-bypassable gates to storage:
--
--   request -> named admin approval -> invoice/instructions -> evidence ->
--   committed verification -> queued handoff -> named handoff release ->
--   fulfillment -> append-only tracking -> shipped -> delivered
--
-- No supplier handoff or fulfillment can be written for an unapproved order.
-- Raw tables are private. The one customer reader derives the member from
-- auth.uid() and checks both the bound buyer and, for business orders, the
-- organization membership. No caller supplies an ownership id to that check.

begin;

create extension if not exists pgcrypto with schema extensions;

do $pack04_preflight$
begin
  if to_regclass('public.research_members') is null then
    raise exception 'Pack 04 requires public.research_members' using errcode = '55000';
  end if;
end
$pack04_preflight$;

-- -------------------------------------------------------------------------
-- Ownership. Business ownership is first-class and bound to an authorized
-- buyer row. Personal ownership binds directly to one Research member.
-- -------------------------------------------------------------------------

create table if not exists public.research_order_business_organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  legal_name text not null check (length(btrim(legal_name)) between 1 and 240),
  state text not null default 'active' check (state in ('active', 'suspended', 'closed')),
  created_at timestamptz not null default pg_catalog.clock_timestamp()
);

create table if not exists public.research_order_organization_buyers (
  organization_id uuid not null
    references public.research_order_business_organizations(id) on delete restrict,
  member_id uuid not null references public.research_members(id) on delete restrict,
  authority text not null check (authority in ('buyer', 'owner')),
  active_from timestamptz not null,
  active_until timestamptz,
  added_by text not null check (length(added_by) between 3 and 128),
  primary key (organization_id, member_id),
  constraint research_order_org_buyer_window
    check (active_until is null or active_until > active_from)
);

create table if not exists public.research_order_workflows (
  order_id text primary key check (order_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$'),
  ownership_kind text not null check (ownership_kind in ('personal', 'business')),
  buyer_member_id uuid not null references public.research_members(id) on delete restrict,
  organization_id uuid,
  request_ref text not null check (request_ref ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$'),
  stage text not null check (stage in (
    'request_pending', 'request_rejected', 'approved', 'invoiced',
    'payment_evidence_submitted', 'payment_verified',
    'supplier_handoff_queued', 'supplier_handoff_released',
    'fulfilling', 'shipped', 'delivered', 'cancelled'
  )),
  approved_at timestamptz,
  approved_by text,
  version integer not null default 1 check (version > 0),
  aggregate jsonb not null check (pg_catalog.jsonb_typeof(aggregate) = 'object'),
  created_at timestamptz not null,
  updated_at timestamptz not null,
  constraint research_order_workflow_owner_shape check (
    (ownership_kind = 'personal' and organization_id is null)
    or (ownership_kind = 'business' and organization_id is not null)
  ),
  constraint research_order_workflow_approval_pair check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and length(approved_by) between 3 and 128)
  ),
  constraint research_order_workflow_time_order check (updated_at >= created_at),
  constraint research_order_workflow_aggregate_agrees check (
    aggregate ->> 'orderId' = order_id
    and aggregate ->> 'stage' = stage
    and aggregate ->> 'version' = version::text
    and aggregate #>> '{owner,buyerId}' = buyer_member_id::text
    and aggregate #>> '{owner,kind}' = ownership_kind
    and (
      ownership_kind = 'personal'
      or aggregate #>> '{owner,organizationId}' = organization_id::text
    )
  ),
  constraint research_order_workflow_business_buyer
    foreign key (organization_id, buyer_member_id)
    references public.research_order_organization_buyers(organization_id, member_id)
    on delete restrict
);

create index if not exists research_order_workflows_personal_owner_idx
  on public.research_order_workflows(buyer_member_id, created_at desc)
  where ownership_kind = 'personal';
create index if not exists research_order_workflows_business_owner_idx
  on public.research_order_workflows(organization_id, buyer_member_id, created_at desc)
  where ownership_kind = 'business';

-- -------------------------------------------------------------------------
-- Invoice, instructions, payment evidence and settlement verification.
-- Receiving details never live here: instructions_ref is an opaque reference
-- to an approved configuration. Evidence is private-object metadata only.
-- -------------------------------------------------------------------------

create table if not exists public.research_order_invoices (
  invoice_ref text primary key check (length(invoice_ref) between 4 and 128),
  order_id text not null unique references public.research_order_workflows(order_id) on delete restrict,
  instructions_ref text not null check (length(instructions_ref) between 3 and 128),
  payment_memo text not null check (length(payment_memo) between 4 and 128),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'USD'),
  issued_at timestamptz not null,
  due_at timestamptz not null,
  issued_by text not null check (length(issued_by) between 3 and 128),
  record jsonb not null check (pg_catalog.jsonb_typeof(record) = 'object'),
  constraint research_order_invoice_window check (due_at > issued_at)
);

create table if not exists public.research_order_payment_evidence (
  evidence_id text primary key check (evidence_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$'),
  order_id text not null references public.research_order_workflows(order_id) on delete restrict,
  invoice_ref text not null references public.research_order_invoices(invoice_ref) on delete restrict,
  sequence integer not null check (sequence > 0),
  private_object_ref text not null check (private_object_ref like 'private/manual-payment-proofs/%'),
  proof_sha256 text not null check (proof_sha256 ~ '^[a-f0-9]{64}$'),
  content_type text not null check (content_type in (
    'image/jpeg', 'image/png', 'image/webp', 'application/pdf'
  )),
  size_bytes integer not null check (size_bytes between 1 and 26214400),
  reported_at timestamptz not null,
  record jsonb not null check (pg_catalog.jsonb_typeof(record) = 'object'),
  constraint research_order_payment_evidence_sequence unique (order_id, sequence),
  constraint research_order_payment_evidence_proof_unique unique (proof_sha256)
);

create table if not exists public.research_order_payment_verifications (
  verification_ref text primary key check (length(verification_ref) between 3 and 128),
  settlement_ref text not null unique check (length(settlement_ref) between 3 and 128),
  order_id text not null unique references public.research_order_workflows(order_id) on delete restrict,
  invoice_ref text not null references public.research_order_invoices(invoice_ref) on delete restrict,
  evidence_id text not null references public.research_order_payment_evidence(evidence_id) on delete restrict,
  external_transaction_ref text not null unique check (length(external_transaction_ref) between 3 and 240),
  amount_cents integer not null check (amount_cents > 0),
  currency text not null check (currency = 'USD'),
  verified_at timestamptz not null,
  verified_by text not null check (length(verified_by) between 3 and 128),
  verified_by_role text not null check (verified_by_role in ('founder_admin', 'finance_operator')),
  commit_fingerprint text not null unique check (commit_fingerprint ~ '^[a-f0-9]{64}$'),
  record jsonb not null check (pg_catalog.jsonb_typeof(record) = 'object')
);

-- -------------------------------------------------------------------------
-- Supplier handoff and fulfillment. Queue and release are separate immutable
-- facts. A queue is not permission to fulfill; only the release fact is.
-- -------------------------------------------------------------------------

create table if not exists public.research_order_supplier_handoffs (
  handoff_ref text primary key check (length(handoff_ref) between 3 and 128),
  order_id text not null unique references public.research_order_workflows(order_id) on delete restrict,
  supplier_id text not null check (length(supplier_id) between 3 and 128),
  verification_ref text not null
    references public.research_order_payment_verifications(verification_ref) on delete restrict,
  queued_at timestamptz not null,
  queued_by text not null check (length(queued_by) between 3 and 128),
  payload jsonb not null check (pg_catalog.jsonb_typeof(payload) = 'object')
);

create table if not exists public.research_order_supplier_releases (
  release_ref text primary key check (length(release_ref) between 3 and 128),
  order_id text not null unique references public.research_order_workflows(order_id) on delete restrict,
  handoff_ref text not null unique
    references public.research_order_supplier_handoffs(handoff_ref) on delete restrict,
  released_at timestamptz not null,
  released_by text not null check (length(released_by) between 3 and 128),
  trust_mode text not null check (trust_mode in ('auto', 'queue', 'ask')),
  trust_approval_ref text,
  constraint research_order_supplier_release_trust check (
    trust_mode = 'auto' or length(trust_approval_ref) between 3 and 128
  )
);

create table if not exists public.research_order_fulfillment_events (
  fulfillment_event_id text primary key
    check (fulfillment_event_id ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{2,127}$'),
  order_id text not null references public.research_order_workflows(order_id) on delete restrict,
  release_ref text not null references public.research_order_supplier_releases(release_ref) on delete restrict,
  sequence integer not null check (sequence > 0),
  state text not null check (state in ('fulfilling', 'shipped', 'delivered')),
  occurred_at timestamptz not null,
  actor_id text not null check (length(actor_id) between 3 and 128),
  actor_role text not null check (actor_role in ('admin', 'supplier')),
  trust_mode text not null check (trust_mode in ('auto', 'queue', 'ask')),
  trust_approval_ref text,
  constraint research_order_fulfillment_sequence unique (order_id, sequence),
  constraint research_order_fulfillment_state_once unique (order_id, state),
  constraint research_order_fulfillment_trust check (
    trust_mode = 'auto' or length(trust_approval_ref) between 3 and 128
  )
);

create table if not exists public.research_order_tracking_events (
  tracking_ref text primary key check (length(tracking_ref) between 3 and 128),
  order_id text not null references public.research_order_workflows(order_id) on delete restrict,
  sequence integer not null check (sequence > 0),
  carrier text not null check (length(btrim(carrier)) between 1 and 80),
  tracking_number text not null check (length(btrim(tracking_number)) between 1 and 160),
  recorded_at timestamptz not null,
  recorded_by text not null check (length(recorded_by) between 3 and 128),
  constraint research_order_tracking_sequence unique (order_id, sequence)
);

-- -------------------------------------------------------------------------
-- Durable idempotency, customer timeline and internal audit.
-- -------------------------------------------------------------------------

create table if not exists public.research_order_command_receipts (
  owner_scope text not null check (length(owner_scope) between 3 and 300),
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{15,127}$'),
  order_id text not null references public.research_order_workflows(order_id) on delete restrict,
  command text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  result_version integer not null check (result_version > 0),
  committed_at timestamptz not null,
  primary key (owner_scope, idempotency_key)
);

create table if not exists public.research_order_timeline_events (
  event_id text primary key check (length(event_id) between 3 and 128),
  order_id text not null references public.research_order_workflows(order_id) on delete restrict,
  sequence integer not null check (sequence > 0),
  kind text not null check (kind in (
    'buyer_request_created', 'request_approved', 'request_rejected',
    'invoice_issued', 'payment_evidence_submitted', 'payment_verified',
    'supplier_handoff_queued', 'supplier_handoff_released',
    'fulfillment_started', 'tracking_added', 'order_shipped',
    'order_delivered', 'order_cancelled'
  )),
  customer_visible boolean not null,
  occurred_at timestamptz not null,
  actor_id text not null check (length(actor_id) between 3 and 128),
  actor_role text not null check (actor_role in ('buyer', 'admin', 'finance', 'supplier')),
  detail jsonb not null default '{}'::jsonb check (pg_catalog.jsonb_typeof(detail) = 'object'),
  constraint research_order_timeline_sequence unique (order_id, sequence)
);

create table if not exists public.research_order_audit_events (
  audit_id text primary key check (length(audit_id) between 3 and 128),
  order_id text,
  actor_id text not null check (length(actor_id) between 3 and 128),
  actor_role text not null check (actor_role in ('buyer', 'admin', 'finance', 'supplier')),
  command text not null check (length(command) between 3 and 80),
  idempotency_key text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  outcome text not null check (outcome in ('accepted', 'refused', 'replayed')),
  reason text,
  trust_mode text check (trust_mode in ('auto', 'queue', 'ask', 'never')),
  trust_approval_ref text,
  occurred_at timestamptz not null
);

-- -------------------------------------------------------------------------
-- Non-bypassable storage gates.
-- -------------------------------------------------------------------------

create or replace function public.research_order_pack04_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  raise exception 'Pack 04 evidence is append-only: %.%', tg_table_schema, tg_table_name
    using errcode = '55000';
end
$function$;

create or replace function public.research_order_pack04_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
declare
  v_order public.research_order_workflows%rowtype;
  v_invoice public.research_order_invoices%rowtype;
  v_handoff public.research_order_supplier_handoffs%rowtype;
begin
  select * into v_order
  from public.research_order_workflows
  where order_id = new.order_id
  for update;
  if not found then
    raise exception 'Pack 04 order % does not exist', new.order_id using errcode = '23503';
  end if;

  if tg_table_name = 'research_order_invoices' then
    if v_order.approved_at is null or v_order.stage <> 'approved'
       or new.issued_at < v_order.approved_at then
      raise exception 'Pack 04 invoice requires named admin approval' using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_payment_evidence' then
    select * into v_invoice from public.research_order_invoices where order_id = new.order_id;
    if not found or v_invoice.invoice_ref <> new.invoice_ref
       or new.reported_at < v_invoice.issued_at or new.reported_at > v_invoice.due_at then
      raise exception 'Pack 04 payment evidence requires this order invoice' using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_payment_verifications' then
    select * into v_invoice from public.research_order_invoices where order_id = new.order_id;
    if v_order.approved_at is null
       or not exists (
         select 1 from public.research_order_payment_evidence e
         where e.order_id = new.order_id and e.evidence_id = new.evidence_id
       )
       or v_invoice.invoice_ref is distinct from new.invoice_ref
       or v_invoice.amount_cents is distinct from new.amount_cents
       or v_invoice.currency is distinct from new.currency
       or new.verified_at < (
         select e.reported_at from public.research_order_payment_evidence e
         where e.evidence_id = new.evidence_id
       )
       or new.verified_at > v_invoice.due_at then
      raise exception 'Pack 04 settlement requires approved, invoiced, matching payment verification evidence'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_supplier_handoffs' then
    if v_order.approved_at is null
       or not exists (
         select 1 from public.research_order_payment_verifications v
         where v.order_id = new.order_id and v.verification_ref = new.verification_ref
       )
       or new.queued_at < (
         select v.verified_at from public.research_order_payment_verifications v
         where v.verification_ref = new.verification_ref
       ) then
      raise exception 'Pack 04 supplier handoff requires approval and committed payment settlement'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_supplier_releases' then
    select * into v_handoff from public.research_order_supplier_handoffs
    where order_id = new.order_id and handoff_ref = new.handoff_ref;
    if not found or v_order.approved_at is null or new.released_at < v_handoff.queued_at then
      raise exception 'Pack 04 supplier release requires the approved queued handoff'
        using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_fulfillment_events' then
    if v_order.approved_at is null
       or not exists (
         select 1 from public.research_order_payment_verifications v where v.order_id = new.order_id
       )
       or not exists (
         select 1 from public.research_order_supplier_releases r
         where r.order_id = new.order_id and r.release_ref = new.release_ref
       ) then
      raise exception 'Pack 04 fulfillment requires approval, verified payment, and supplier release'
        using errcode = '55000';
    end if;
    if new.occurred_at < (
      select r.released_at from public.research_order_supplier_releases r
      where r.order_id = new.order_id and r.release_ref = new.release_ref
    ) then
      raise exception 'Pack 04 fulfillment cannot predate supplier release' using errcode = '55000';
    end if;
    if new.state = 'shipped'
       and not exists (select 1 from public.research_order_tracking_events t where t.order_id = new.order_id) then
      raise exception 'Pack 04 shipped requires tracking' using errcode = '55000';
    end if;
    if new.state = 'delivered'
       and not exists (
         select 1 from public.research_order_fulfillment_events f
         where f.order_id = new.order_id and f.state = 'shipped'
       ) then
      raise exception 'Pack 04 delivered requires shipped' using errcode = '55000';
    end if;
  elsif tg_table_name = 'research_order_tracking_events' then
    if not exists (
      select 1 from public.research_order_fulfillment_events f
      where f.order_id = new.order_id and f.state = 'fulfilling'
    ) then
      raise exception 'Pack 04 tracking requires fulfillment to have started' using errcode = '55000';
    end if;
    if new.recorded_at < (
      select min(f.occurred_at) from public.research_order_fulfillment_events f
      where f.order_id = new.order_id and f.state = 'fulfilling'
    ) then
      raise exception 'Pack 04 tracking cannot predate fulfillment' using errcode = '55000';
    end if;
  end if;
  return new;
end
$function$;

create or replace function public.research_order_pack04_workflow_gate()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $function$
begin
  if tg_op = 'INSERT' then
    if new.stage <> 'request_pending'
       or new.version <> 1
       or new.approved_at is not null
       or new.created_at <> new.updated_at then
      raise exception 'Pack 04 workflow must begin as an unapproved request'
        using errcode = '55000';
    end if;
  else
    if new.order_id <> old.order_id
       or new.ownership_kind <> old.ownership_kind
       or new.buyer_member_id <> old.buyer_member_id
       or new.organization_id is distinct from old.organization_id
       or new.request_ref <> old.request_ref
       or new.created_at <> old.created_at then
      raise exception 'Pack 04 ownership and request identity are immutable'
        using errcode = '55000';
    end if;
    if old.approved_at is not null and (
      new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
    ) then
      raise exception 'Pack 04 approval evidence is immutable' using errcode = '55000';
    end if;
    if new.version <> old.version + 1 or new.updated_at < old.updated_at then
      raise exception 'Pack 04 workflow version/timestamp is not monotonic'
        using errcode = '55000';
    end if;
    if old.stage in ('request_rejected', 'cancelled', 'delivered') then
      raise exception 'Pack 04 terminal workflow cannot transition' using errcode = '55000';
    end if;
    if new.stage <> old.stage and not (
      (old.stage = 'request_pending' and new.stage in ('approved', 'request_rejected', 'cancelled'))
      or (old.stage = 'approved' and new.stage in ('invoiced', 'cancelled'))
      or (old.stage = 'invoiced' and new.stage in ('payment_evidence_submitted', 'cancelled'))
      or (old.stage = 'payment_evidence_submitted' and new.stage in ('payment_verified', 'cancelled'))
      or (old.stage = 'payment_verified' and new.stage in ('supplier_handoff_queued', 'cancelled'))
      or (old.stage = 'supplier_handoff_queued' and new.stage in ('supplier_handoff_released', 'cancelled'))
      or (old.stage = 'supplier_handoff_released' and new.stage = 'fulfilling')
      or (old.stage = 'fulfilling' and new.stage = 'shipped')
      or (old.stage = 'shipped' and new.stage = 'delivered')
    ) then
      raise exception 'Pack 04 invalid workflow transition % -> %', old.stage, new.stage
        using errcode = '55000';
    end if;
  end if;

  if new.ownership_kind = 'business' and not exists (
    select 1 from public.research_order_organization_buyers b
    where b.organization_id = new.organization_id
      and b.member_id = new.buyer_member_id
      and b.active_from <= new.updated_at
      and (b.active_until is null or b.active_until > new.updated_at)
  ) then
    raise exception 'Pack 04 business buyer has no active organization authority'
      using errcode = '42501';
  end if;

  if new.stage not in ('request_pending', 'request_rejected', 'cancelled')
     and (new.approved_at is null or new.approved_by is null) then
    raise exception 'Pack 04 consequential order stage requires named admin approval'
      using errcode = '55000';
  end if;
  if new.stage in (
    'invoiced', 'payment_evidence_submitted', 'payment_verified',
    'supplier_handoff_queued', 'supplier_handoff_released', 'fulfilling', 'shipped', 'delivered'
  ) and not exists (
    select 1 from public.research_order_invoices i where i.order_id = new.order_id
  ) then
    raise exception 'Pack 04 stage % requires invoice', new.stage using errcode = '55000';
  end if;
  if new.stage in (
    'payment_evidence_submitted', 'payment_verified', 'supplier_handoff_queued',
    'supplier_handoff_released', 'fulfilling', 'shipped', 'delivered'
  ) and not exists (
    select 1 from public.research_order_payment_evidence e where e.order_id = new.order_id
  ) then
    raise exception 'Pack 04 stage % requires payment evidence', new.stage using errcode = '55000';
  end if;
  if new.stage in (
    'payment_verified', 'supplier_handoff_queued', 'supplier_handoff_released',
    'fulfilling', 'shipped', 'delivered'
  ) and not exists (
    select 1 from public.research_order_payment_verifications v where v.order_id = new.order_id
  ) then
    raise exception 'Pack 04 stage % requires committed payment verification', new.stage
      using errcode = '55000';
  end if;
  if new.stage in ('supplier_handoff_queued', 'supplier_handoff_released', 'fulfilling', 'shipped', 'delivered')
     and not exists (
       select 1 from public.research_order_supplier_handoffs h where h.order_id = new.order_id
     ) then
    raise exception 'Pack 04 stage % requires supplier handoff', new.stage using errcode = '55000';
  end if;
  if new.stage in ('supplier_handoff_released', 'fulfilling', 'shipped', 'delivered')
     and not exists (
       select 1 from public.research_order_supplier_releases r where r.order_id = new.order_id
     ) then
    raise exception 'Pack 04 stage % requires named supplier release', new.stage using errcode = '55000';
  end if;
  if new.stage in ('fulfilling', 'shipped', 'delivered')
     and not exists (
       select 1 from public.research_order_fulfillment_events f
       where f.order_id = new.order_id and f.state = 'fulfilling'
     ) then
    raise exception 'Pack 04 stage % requires fulfillment-start evidence', new.stage using errcode = '55000';
  end if;
  if new.stage in ('shipped', 'delivered')
     and not exists (
       select 1 from public.research_order_fulfillment_events f
       where f.order_id = new.order_id and f.state = 'shipped'
     ) then
    raise exception 'Pack 04 stage % requires shipped evidence', new.stage using errcode = '55000';
  end if;
  if new.stage = 'delivered'
     and not exists (
       select 1 from public.research_order_fulfillment_events f
       where f.order_id = new.order_id and f.state = 'delivered'
     ) then
    raise exception 'Pack 04 delivered stage requires delivery evidence' using errcode = '55000';
  end if;
  return new;
end
$function$;

do $pack04_triggers$
declare
  v_table text;
begin
  drop trigger if exists research_order_pack04_workflow_gate on public.research_order_workflows;
  create trigger research_order_pack04_workflow_gate
    before insert or update on public.research_order_workflows
    for each row execute function public.research_order_pack04_workflow_gate();

  foreach v_table in array array[
    'research_order_invoices',
    'research_order_payment_evidence',
    'research_order_payment_verifications',
    'research_order_supplier_handoffs',
    'research_order_supplier_releases',
    'research_order_fulfillment_events',
    'research_order_tracking_events'
  ] loop
    execute format('drop trigger if exists research_order_pack04_gate on public.%I', v_table);
    execute format(
      'create trigger research_order_pack04_gate before insert on public.%I '
      || 'for each row execute function public.research_order_pack04_gate()', v_table
    );
  end loop;

  foreach v_table in array array[
    'research_order_invoices',
    'research_order_payment_evidence',
    'research_order_payment_verifications',
    'research_order_supplier_handoffs',
    'research_order_supplier_releases',
    'research_order_fulfillment_events',
    'research_order_tracking_events',
    'research_order_command_receipts',
    'research_order_timeline_events',
    'research_order_audit_events'
  ] loop
    execute format('drop trigger if exists research_order_pack04_append_only on public.%I', v_table);
    execute format(
      'create trigger research_order_pack04_append_only before update or delete on public.%I '
      || 'for each row execute function public.research_order_pack04_append_only()', v_table
    );
  end loop;
end
$pack04_triggers$;

-- -------------------------------------------------------------------------
-- Customer projection. auth.uid() is the only identity input. Detail is
-- already customer-whitelisted by the domain; internal audit, proof object,
-- transaction, supplier payload and actor identifiers never leave this RPC.
-- -------------------------------------------------------------------------

create or replace function public.research_customer_order_timeline(p_order_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $function$
declare
  v_member_id uuid;
  v_order public.research_order_workflows%rowtype;
  v_invoice public.research_order_invoices%rowtype;
begin
  select id into v_member_id
  from public.research_members
  where auth_user_id = auth.uid();
  if v_member_id is null then return null; end if;

  select * into v_order
  from public.research_order_workflows
  where order_id = p_order_id
    and buyer_member_id = v_member_id
    and (
      ownership_kind = 'personal'
      or exists (
        select 1 from public.research_order_organization_buyers b
        where b.organization_id = research_order_workflows.organization_id
          and b.member_id = v_member_id
          and b.active_from <= pg_catalog.clock_timestamp()
          and (b.active_until is null or b.active_until > pg_catalog.clock_timestamp())
      )
    );
  if not found then return null; end if;

  select * into v_invoice from public.research_order_invoices where order_id = p_order_id;
  return pg_catalog.jsonb_build_object(
    'orderId', v_order.order_id,
    'stage', v_order.stage,
    'ownerKind', v_order.ownership_kind,
    'invoiceRef', v_invoice.invoice_ref,
    'amountCents', v_invoice.amount_cents,
    'currency', v_invoice.currency,
    'tracking', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'carrier', t.carrier,
        'trackingNumber', t.tracking_number,
        'recordedAt', t.recorded_at
      ) order by t.sequence)
      from public.research_order_tracking_events t where t.order_id = p_order_id
    ), '[]'::jsonb),
    'events', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'kind', e.kind,
        'occurredAt', e.occurred_at,
        'detail', e.detail
      ) order by e.sequence)
      from public.research_order_timeline_events e
      where e.order_id = p_order_id and e.customer_visible
    ), '[]'::jsonb)
  );
end
$function$;

-- -------------------------------------------------------------------------
-- Access. No raw browser table access. service_role is the future unmounted
-- adapter token; authenticated receives only the ownership-scoped reader.
-- -------------------------------------------------------------------------

do $pack04_rls$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_order_business_organizations',
    'research_order_organization_buyers',
    'research_order_workflows',
    'research_order_invoices',
    'research_order_payment_evidence',
    'research_order_payment_verifications',
    'research_order_supplier_handoffs',
    'research_order_supplier_releases',
    'research_order_fulfillment_events',
    'research_order_tracking_events',
    'research_order_command_receipts',
    'research_order_timeline_events',
    'research_order_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated', v_table);
  end loop;
end
$pack04_rls$;

revoke all on function public.research_customer_order_timeline(text) from public, anon;
grant execute on function public.research_customer_order_timeline(text) to authenticated;

-- The reference adapter is not mounted in Pack 04. These grants let a future
-- reviewed service_role transaction compose the exact writes; all hard gates
-- above remain trigger-enforced even for that privileged token.
grant select, insert, update on table
  public.research_order_business_organizations,
  public.research_order_organization_buyers,
  public.research_order_workflows
to service_role;
grant select, insert on table
  public.research_order_invoices,
  public.research_order_payment_evidence,
  public.research_order_payment_verifications,
  public.research_order_supplier_handoffs,
  public.research_order_supplier_releases,
  public.research_order_fulfillment_events,
  public.research_order_tracking_events,
  public.research_order_command_receipts,
  public.research_order_timeline_events,
  public.research_order_audit_events
to service_role;

commit;
