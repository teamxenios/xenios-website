-- Early Access reservation holds: the durable store behind
-- `EarlyAccessReservationStore` (commerce/reservation-store.ts).
--
-- The pure module (commerce/reservation.ts) decides what a reservation is,
-- whether it holds at an instant, and what an expiry requires; this migration
-- only makes those decisions durable. Two properties the port names are kept
-- IN THE DATABASE, not in application logic:
--
--   1. Inserts are idempotent by id, and one order draft holds at most one
--      reservation: both are unique constraints, and the insert function
--      answers false rather than raising, so a retried request cannot create
--      a second hold.
--   2. Expiry exceptions are APPEND-ONLY, by trigger. A lapsed hold with the
--      customer's money in hand must be impossible to quiet; there is no
--      update and no delete path.
--
-- Expiry is deliberately NOT stored as truth: `reservationHoldsAt` derives it
-- from the clock. The stored status is what the pure module last decided.
--
-- This table family is DISTINCT from research_early_access_reservations
-- (migration 51), which persists the placement-time hold inside
-- commit_placement. This one backs the standalone reservation lifecycle the
-- 29b5345 domain module introduces (hold BEFORE payment instructions).
--
-- ACCESS SHAPE: identical to the other Early Access persistence migrations.
-- RLS enabled and forced, zero policies, zero table grants for any role,
-- SECURITY DEFINER functions granted to service_role alone. Additive; safe
-- to apply twice.

-- ---------------------------------------------------------------------------
-- Preflight
-- ---------------------------------------------------------------------------

do $preflight$
declare
  v_tables int;
begin
  select count(*) into v_tables
  from pg_catalog.pg_tables
  where schemaname = 'public'
    and tablename in (
      'research_early_access_reservation_holds',
      'research_early_access_reservation_expiry_exceptions'
    );
  if v_tables not in (0, 2) then
    raise exception
      'research_early_access reservation holds is partially installed: % of 2 tables exist. Resolve manually before re-applying.',
      v_tables;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.research_early_access_reservation_holds (
  reservation_id text primary key
    constraint research_early_access_resholds_id_shape
    check (length(reservation_id) between 4 and 128),
  order_draft_id text not null
    constraint research_early_access_resholds_draft_shape
    check (length(order_draft_id) between 1 and 128),
  product_id text not null,
  variant_id text not null,
  status text not null
    constraint research_early_access_resholds_status_vocabulary
    check (status in ('active', 'consumed', 'released', 'expired')),
  created_at timestamptz not null,
  expires_at timestamptz not null,
  record jsonb not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_resholds_draft_unique unique (order_draft_id),
  constraint research_early_access_resholds_window_order
    check (expires_at > created_at),
  constraint research_early_access_resholds_record_agrees
    check (
      record ->> 'reservationId' = reservation_id
      and record ->> 'orderDraftId' = order_draft_id
      and record ->> 'status' = status
    )
);

comment on table public.research_early_access_reservation_holds is
  'Availability reservations held before payment instructions. The pure module decides transitions; this table only remembers them. Real validity is clock-derived, never read from the stored status alone.';

create index if not exists research_early_access_resholds_unit_active_idx
  on public.research_early_access_reservation_holds (product_id, variant_id)
  where status = 'active';

create table if not exists public.research_early_access_reservation_expiry_exceptions (
  seq bigint generated always as identity,
  exception_id text primary key
    constraint research_early_access_resexc_id_shape
    check (length(exception_id) between 4 and 128),
  reservation_id text not null,
  order_draft_id text not null,
  raised_at timestamptz not null,
  record jsonb not null,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_resexc_requires_human
    check (record ->> 'requiresHumanDecision' = 'true'),
  constraint research_early_access_resexc_record_agrees
    check (
      record ->> 'exceptionId' = exception_id
      and record ->> 'reservationId' = reservation_id
    )
);

comment on table public.research_early_access_reservation_expiry_exceptions is
  'Money outlived a supply hold. Append-only by trigger: nothing may edit or remove one, because it exists to be impossible to overlook.';

-- ---------------------------------------------------------------------------
-- Append-only enforcement for exceptions
-- ---------------------------------------------------------------------------

create or replace function public.research_early_access_reservation_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $block$
begin
  raise exception 'research_early_access %.% is append-only', tg_table_schema, tg_table_name;
end;
$block$;

do $append_only$
begin
  execute 'drop trigger if exists research_early_access_resexc_append_only on public.research_early_access_reservation_expiry_exceptions';
  execute 'create trigger research_early_access_resexc_append_only
             before update or delete on public.research_early_access_reservation_expiry_exceptions
             for each row execute function public.research_early_access_reservation_block_mutation()';
end
$append_only$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------

do $rls_and_revokes$
declare
  v_role text;
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_reservation_holds',
    'research_early_access_reservation_expiry_exceptions'
  ] loop
    execute pg_catalog.format('alter table public.%I enable row level security', v_table);
    execute pg_catalog.format('alter table public.%I force row level security', v_table);
    execute pg_catalog.format('revoke all on table public.%I from public', v_table);
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on table public.%I from %I', v_table, v_role);
      end if;
    end loop;
  end loop;
end
$rls_and_revokes$;

-- ---------------------------------------------------------------------------
-- Functions
-- ---------------------------------------------------------------------------

-- Persist a NEW reservation. False when the reservation id is a replay OR the
-- order draft already holds one; both are unique constraints, and the caller
-- treats false as idempotence, never as an error.
create or replace function public.research_early_access_reservation_insert(
  p_record jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $reservation_insert$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_reservation_insert: record must be a jsonb object';
  end if;
  insert into public.research_early_access_reservation_holds
    (reservation_id, order_draft_id, product_id, variant_id, status,
     created_at, expires_at, record)
  values (
    p_record ->> 'reservationId',
    p_record ->> 'orderDraftId',
    p_record ->> 'productId',
    p_record ->> 'variantId',
    p_record ->> 'status',
    (p_record ->> 'createdAt')::timestamptz,
    (p_record ->> 'expiresAt')::timestamptz,
    p_record
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$reservation_insert$;

-- Persist a transition the pure module produced. False when the reservation
-- does not exist. The stored draft binding and window never change: only the
-- status (and the canonical record) move.
create or replace function public.research_early_access_reservation_update(
  p_record jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $reservation_update$
declare
  v_updated integer;
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_reservation_update: record must be a jsonb object';
  end if;
  update public.research_early_access_reservation_holds
  set status = p_record ->> 'status',
      record = p_record,
      updated_at = pg_catalog.clock_timestamp()
  where reservation_id = p_record ->> 'reservationId'
    and order_draft_id = p_record ->> 'orderDraftId';
  get diagnostics v_updated = row_count;
  return v_updated = 1;
end;
$reservation_update$;

create or replace function public.research_early_access_reservation_by_id(
  p_reservation_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $reservation_by_id$
  select record from public.research_early_access_reservation_holds
  where reservation_id = p_reservation_id;
$reservation_by_id$;

create or replace function public.research_early_access_reservation_by_draft(
  p_order_draft_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $reservation_by_draft$
  select record from public.research_early_access_reservation_holds
  where order_draft_id = p_order_draft_id;
$reservation_by_draft$;

-- Reservations RECORDED active for one unit. Real validity stays with the
-- caller's clock via reservationHoldsAt.
create or replace function public.research_early_access_reservations_active_for_unit(
  p_product_id text,
  p_variant_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $reservations_active_for_unit$
  select coalesce(jsonb_agg(record order by created_at, reservation_id), '[]'::jsonb)
  from public.research_early_access_reservation_holds
  where product_id = p_product_id
    and variant_id = p_variant_id
    and status = 'active';
$reservations_active_for_unit$;

-- Append one expiry exception. False on a replayed exception id.
create or replace function public.research_early_access_reservation_record_expiry_exception(
  p_record jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_expiry_exception$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_reservation_record_expiry_exception: record must be a jsonb object';
  end if;
  insert into public.research_early_access_reservation_expiry_exceptions
    (exception_id, reservation_id, order_draft_id, raised_at, record)
  values (
    p_record ->> 'exceptionId',
    p_record ->> 'reservationId',
    p_record ->> 'orderDraftId',
    (p_record ->> 'raisedAt')::timestamptz,
    p_record
  );
  return true;
exception
  when unique_violation then
    return false;
end;
$record_expiry_exception$;

-- Every recorded exception, oldest first (insertion order via seq).
create or replace function public.research_early_access_reservation_expiry_exceptions()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $expiry_exceptions$
  select coalesce(jsonb_agg(record order by seq), '[]'::jsonb)
  from public.research_early_access_reservation_expiry_exceptions;
$expiry_exceptions$;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_reservation_block_mutation()',
    'public.research_early_access_reservation_insert(jsonb)',
    'public.research_early_access_reservation_update(jsonb)',
    'public.research_early_access_reservation_by_id(text)',
    'public.research_early_access_reservation_by_draft(text)',
    'public.research_early_access_reservations_active_for_unit(text,text)',
    'public.research_early_access_reservation_record_expiry_exception(jsonb)',
    'public.research_early_access_reservation_expiry_exceptions()'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and v_signature <> 'public.research_early_access_reservation_block_mutation()' then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
