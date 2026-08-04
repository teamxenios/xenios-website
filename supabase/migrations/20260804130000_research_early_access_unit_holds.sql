-- Early Access unit holds (QA R4, the durable half) and the supplier-
-- confirmation store completion.
--
-- A unit hold is a NAMED HUMAN's recorded prohibition on one exact unit:
-- REGULATORY_HOLD, RECALL, STOP_SHIP, or SUPPLIER_QUALITY_HOLD. The
-- declared-facts reader loads ACTIVE holds at every projection, so a hold
-- recorded after a founder release makes the unit held on the next read. For
-- that to mean anything, the hold must outlive the process that recorded it;
-- this table is that guarantee. WITHDRAWAL IS A RECORDED STATE CHANGE, NEVER
-- A DELETE: the history of a prohibition is part of the prohibition, and a
-- delete trigger blocks removal for every role including the owner.
--
-- This migration also completes the SupplierConfirmationStore port over the
-- migration-52 table:
--   - a by-id read that answers the canonical record;
--   - a port-shaped withdraw that carries the CALLER's named human and
--     instant, and keeps the canonical jsonb record in sync with the judged
--     columns;
--   - a forward repair of the original withdraw function so the operator
--     path can no longer leave the canonical record stale.
--
-- ACCESS SHAPE: as the whole Early Access chain. RLS enabled and forced,
-- zero policies, zero table grants, SECURITY DEFINER functions granted to
-- service_role alone. Additive; safe to apply twice.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------

do $preflight$
begin
  -- The supplier-confirmation completion below repairs migration 52's
  -- objects, so migration 52 must be present first.
  if pg_catalog.to_regclass('public.research_early_access_supplier_confirmations') is null then
    raise exception
      'research_early_access_unit_holds requires migration 20260804122000 (supplier operations) to be applied first.';
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- The unit hold registry
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_unit_holds (
  hold_id text primary key
    constraint research_early_access_unit_holds_id_shape
    check (length(hold_id) between 4 and 128),
  kind text not null
    constraint research_early_access_unit_holds_kind_vocabulary
    check (kind in ('REGULATORY_HOLD', 'RECALL', 'STOP_SHIP', 'SUPPLIER_QUALITY_HOLD')),
  product_id text not null,
  variant_id text not null,
  reason text not null
    constraint research_early_access_unit_holds_reason_shape
    check (length(reason) between 3 and 2000),
  status text not null
    constraint research_early_access_unit_holds_status_vocabulary
    check (status in ('active', 'withdrawn')),
  recorded_by text not null
    constraint research_early_access_unit_holds_named_human
    check (
      length(trim(recorded_by)) between 2 and 200
      and lower(trim(recorded_by)) not in
        ('system', 'the system', 'automation', 'robot', 'bot', 'service', 'admin')
    ),
  recorded_at timestamptz not null,
  withdrawn_by text,
  withdrawn_at timestamptz,
  record jsonb not null,
  row_recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_unit_holds_withdrawal_pair
    check ((withdrawn_at is null) = (withdrawn_by is null)),
  constraint research_early_access_unit_holds_withdrawal_state
    check (status = 'withdrawn' or withdrawn_at is null),
  constraint research_early_access_unit_holds_record_agrees
    check (
      record ->> 'holdId' = hold_id
      and record ->> 'kind' = kind
      and record ->> 'status' = status
    )
);

comment on table public.research_early_access_unit_holds is
  'Recorded prohibitions on exact units (QA R4). Withdrawal is a recorded state change; deletion is blocked by trigger for every role.';

create index if not exists research_early_access_unit_holds_unit_active_idx
  on public.research_early_access_unit_holds (product_id, variant_id)
  where status = 'active';

-- A prohibition's row never disappears. Updates flow only through the
-- definer functions (no role holds table privileges); deletes are blocked
-- outright, owner included.
create or replace function public.research_early_access_unit_holds_block_delete()
returns trigger
language plpgsql
set search_path = pg_catalog
as $block$
begin
  raise exception
    'research_early_access_unit_holds rows are never deleted; withdraw the hold instead';
end;
$block$;

do $delete_block$
begin
  execute 'drop trigger if exists research_early_access_unit_holds_no_delete on public.research_early_access_unit_holds';
  execute 'create trigger research_early_access_unit_holds_no_delete
             before delete on public.research_early_access_unit_holds
             for each row execute function public.research_early_access_unit_holds_block_delete()';
end
$delete_block$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------

do $rls_and_revokes$
declare
  v_role text;
begin
  execute 'alter table public.research_early_access_unit_holds enable row level security';
  execute 'alter table public.research_early_access_unit_holds force row level security';
  execute 'revoke all on table public.research_early_access_unit_holds from public';
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute pg_catalog.format(
        'revoke all on table public.research_early_access_unit_holds from %I', v_role
      );
    end if;
  end loop;
end
$rls_and_revokes$;

-- ---------------------------------------------------------------------------
-- Unit hold functions
-- ---------------------------------------------------------------------------

-- Record one hold. False on a replayed hold id, never an error.
create or replace function public.research_early_access_unit_hold_record(
  p_record jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $unit_hold_record$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_unit_hold_record: record must be a jsonb object';
  end if;
  insert into public.research_early_access_unit_holds
    (hold_id, kind, product_id, variant_id, reason, status,
     recorded_by, recorded_at, record)
  values (
    p_record ->> 'holdId',
    p_record ->> 'kind',
    p_record ->> 'productId',
    p_record ->> 'variantId',
    p_record ->> 'reason',
    p_record ->> 'status',
    p_record ->> 'recordedBy',
    (p_record ->> 'recordedAt')::timestamptz,
    p_record
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$unit_hold_record$;

-- Withdraw one hold: false when the id is unknown OR the hold is not active,
-- mirroring the registry's in-memory semantics exactly. The caller's named
-- human and instant land verbatim in the canonical record; the judged
-- columns move in the same statement, so the two can never disagree.
create or replace function public.research_early_access_unit_hold_withdraw(
  p_hold_id text,
  p_by text,
  p_at text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $unit_hold_withdraw$
declare
  v_updated integer;
begin
  if p_by is null or length(trim(p_by)) < 2 or p_at is null then
    return false;
  end if;
  update public.research_early_access_unit_holds
  set status = 'withdrawn',
      withdrawn_by = p_by,
      withdrawn_at = p_at::timestamptz,
      record = record || jsonb_build_object(
        'status', 'withdrawn',
        'withdrawnBy', p_by,
        'withdrawnAt', p_at
      ),
      updated_at = pg_catalog.clock_timestamp()
  where hold_id = p_hold_id and status = 'active';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$unit_hold_withdraw$;

create or replace function public.research_early_access_unit_hold_by_id(
  p_hold_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $unit_hold_by_id$
  select record from public.research_early_access_unit_holds
  where hold_id = p_hold_id;
$unit_hold_by_id$;

-- The DISTINCT kinds of active holds for one exact unit. The reader turns
-- these into blockers on every projection; an empty array is "no recorded
-- prohibition", never "unknown".
create or replace function public.research_early_access_active_hold_kinds_for_unit(
  p_product_id text,
  p_variant_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $active_hold_kinds_for_unit$
  select coalesce(jsonb_agg(distinct kind), '[]'::jsonb)
  from public.research_early_access_unit_holds
  where product_id = p_product_id
    and variant_id = p_variant_id
    and status = 'active';
$active_hold_kinds_for_unit$;

-- Every hold ever recorded for one unit, for the operator surface.
create or replace function public.research_early_access_unit_holds_for_unit(
  p_product_id text,
  p_variant_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $unit_holds_for_unit$
  select coalesce(jsonb_agg(record order by recorded_at, hold_id), '[]'::jsonb)
  from public.research_early_access_unit_holds
  where product_id = p_product_id and variant_id = p_variant_id;
$unit_holds_for_unit$;

-- ---------------------------------------------------------------------------
-- Supplier-confirmation store completion (over the migration-52 table)
-- ---------------------------------------------------------------------------

-- The canonical record by id. Insert and both withdraw paths keep the record
-- in sync with the judged columns, so this read is always truthful.
create or replace function public.research_early_access_supplier_confirmation_by_id(
  p_confirmation_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $supplier_confirmation_by_id$
  select record from public.research_early_access_supplier_confirmations
  where confirmation_id = p_confirmation_id;
$supplier_confirmation_by_id$;

-- The port-shaped withdraw: the CALLER's named human and instant, recorded
-- verbatim in the canonical record. False only when the id is unknown; a
-- repeat withdrawal re-records, exactly as the in-memory store does.
create or replace function public.research_early_access_supplier_confirmation_withdraw(
  p_confirmation_id text,
  p_by text,
  p_at text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $supplier_confirmation_withdraw$
declare
  v_updated integer;
begin
  if p_by is null or length(trim(p_by)) < 2 or p_at is null then
    return false;
  end if;
  update public.research_early_access_supplier_confirmations
  set status = 'withdrawn',
      withdrawn_by = p_by,
      withdrawn_at = p_at::timestamptz,
      record = record || jsonb_build_object(
        'status', 'withdrawn',
        'withdrawnBy', p_by,
        'withdrawnAt', p_at
      )
  where confirmation_id = p_confirmation_id;
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$supplier_confirmation_withdraw$;

-- FORWARD REPAIR of the migration-52 withdraw: the original set only the
-- judged columns, leaving the canonical jsonb record stale for any later
-- by-id read. Same signature, same active-only semantics; the record now
-- moves in the same statement.
create or replace function public.research_early_access_withdraw_supplier_confirmation(
  p_confirmation_id text,
  p_withdrawn_by text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $withdraw_supplier_confirmation$
declare
  v_updated integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if p_withdrawn_by is null or length(trim(p_withdrawn_by)) < 2 then
    return false;
  end if;
  update public.research_early_access_supplier_confirmations
  set status = 'withdrawn',
      withdrawn_at = v_now,
      withdrawn_by = p_withdrawn_by,
      record = record || jsonb_build_object(
        'status', 'withdrawn',
        'withdrawnBy', p_withdrawn_by,
        'withdrawnAt', pg_catalog.to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
      )
  where confirmation_id = p_confirmation_id and status = 'active';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$withdraw_supplier_confirmation$;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_unit_holds_block_delete()',
    'public.research_early_access_unit_hold_record(jsonb)',
    'public.research_early_access_unit_hold_withdraw(text,text,text)',
    'public.research_early_access_unit_hold_by_id(text)',
    'public.research_early_access_active_hold_kinds_for_unit(text,text)',
    'public.research_early_access_unit_holds_for_unit(text,text)',
    'public.research_early_access_supplier_confirmation_by_id(text)',
    'public.research_early_access_supplier_confirmation_withdraw(text,text,text)',
    'public.research_early_access_withdraw_supplier_confirmation(text,text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and v_signature <> 'public.research_early_access_unit_holds_block_delete()' then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
