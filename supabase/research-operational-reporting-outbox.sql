-- Unapplied Research operational-reporting outbox.
-- Atomic, rerunnable on an absent or fully-applied schema. A partial schema is
-- refused before any DDL executes. This file is intentionally not registered
-- in the managed migration ledger.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

do $preflight$
declare
  present_count integer;
begin
  select count(*) into present_count
  from (values
    (to_regclass('public.research_operational_reporting_outbox') is not null),
    (to_regclass('public.research_operational_reporting_attempts') is not null),
    (to_regprocedure('public.research_enqueue_operational_report(text,text,jsonb,timestamptz)') is not null),
    (to_regprocedure('public.research_claim_operational_reports(integer,timestamptz,interval)') is not null),
    (to_regprocedure('public.research_complete_operational_report(uuid,text,timestamptz)') is not null),
    (to_regprocedure('public.research_fail_operational_report(uuid,text,text,timestamptz,integer,interval)') is not null),
    (to_regprocedure('public.research_reconcile_operational_reports(timestamptz,interval)') is not null)
  ) as objects(is_present)
  where is_present;

  if present_count not in (0, 7) then
    raise exception using
      errcode = '55000',
      message = 'research operational reporting outbox is partially installed; refusing unsafe apply';
  end if;
end;
$preflight$;

create table if not exists public.research_operational_reporting_outbox (
  id uuid primary key default gen_random_uuid(),
  idempotency_key_hash text not null unique,
  report_type text not null check (report_type ~ '^[a-z][a-z0-9_]{1,63}$'),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'retry_scheduled', 'succeeded', 'dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default statement_timestamp(),
  lease_expires_at timestamptz,
  provider_receipt_hash text,
  last_error_code text,
  last_error_summary text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  completed_at timestamptz,
  check ((status = 'processing') = (lease_expires_at is not null)),
  check ((status = 'succeeded') = (completed_at is not null)),
  check (last_error_summary is null or length(last_error_summary) <= 500)
);

create table if not exists public.research_operational_reporting_attempts (
  id bigint generated always as identity primary key,
  outbox_id uuid not null references public.research_operational_reporting_outbox(id) on delete restrict,
  attempt_number integer not null check (attempt_number > 0),
  outcome text not null check (outcome in ('claimed', 'succeeded', 'retry_scheduled', 'dead_letter', 'lease_recovered')),
  error_code text,
  error_summary text,
  occurred_at timestamptz not null default statement_timestamp(),
  unique (outbox_id, attempt_number, outcome),
  check (error_summary is null or length(error_summary) <= 500)
);

create index if not exists research_operational_reporting_outbox_due_idx
  on public.research_operational_reporting_outbox(next_attempt_at, created_at, id)
  where status in ('pending', 'retry_scheduled');
create index if not exists research_operational_reporting_outbox_lease_idx
  on public.research_operational_reporting_outbox(lease_expires_at, id)
  where status = 'processing';
create index if not exists research_operational_reporting_attempts_outbox_idx
  on public.research_operational_reporting_attempts(outbox_id, occurred_at, id);

alter table public.research_operational_reporting_outbox enable row level security;
alter table public.research_operational_reporting_outbox force row level security;
alter table public.research_operational_reporting_attempts enable row level security;
alter table public.research_operational_reporting_attempts force row level security;

create or replace function public.research_enqueue_operational_report(
  p_idempotency_key text,
  p_report_type text,
  p_payload jsonb,
  p_not_before timestamptz default statement_timestamp()
) returns uuid
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_id uuid;
  v_hash text;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 16 or
     p_report_type !~ '^[a-z][a-z0-9_]{1,63}$' or
     jsonb_typeof(p_payload) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid operational report';
  end if;
  v_hash := encode(extensions.digest('xenios:operational-report:v1|' || p_idempotency_key, 'sha256'), 'hex');
  insert into public.research_operational_reporting_outbox(
    idempotency_key_hash, report_type, payload, next_attempt_at
  ) values (v_hash, p_report_type, p_payload, p_not_before)
  on conflict (idempotency_key_hash) do update
    set idempotency_key_hash = excluded.idempotency_key_hash
  returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.research_claim_operational_reports(
  p_limit integer,
  p_now timestamptz default statement_timestamp(),
  p_lease interval default interval '5 minutes'
) returns setof public.research_operational_reporting_outbox
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare
  v_row public.research_operational_reporting_outbox%rowtype;
begin
  if p_limit not between 1 and 100 or p_lease <= interval '0' or p_lease > interval '30 minutes' then
    raise exception using errcode = '22023', message = 'invalid claim bounds';
  end if;
  for v_row in
    select * from public.research_operational_reporting_outbox
    where status in ('pending', 'retry_scheduled') and next_attempt_at <= p_now
    order by next_attempt_at, created_at, id
    for update skip locked limit p_limit
  loop
    update public.research_operational_reporting_outbox
    set status = 'processing', attempt_count = attempt_count + 1,
        lease_expires_at = p_now + p_lease, updated_at = p_now,
        last_error_code = null, last_error_summary = null
    where id = v_row.id returning * into v_row;
    insert into public.research_operational_reporting_attempts(outbox_id, attempt_number, outcome, occurred_at)
    values (v_row.id, v_row.attempt_count, 'claimed', p_now);
    return next v_row;
  end loop;
end;
$function$;

create or replace function public.research_complete_operational_report(
  p_id uuid,
  p_provider_receipt text,
  p_now timestamptz default statement_timestamp()
) returns void
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_attempt integer;
begin
  update public.research_operational_reporting_outbox
  set status = 'succeeded', lease_expires_at = null, completed_at = p_now,
      updated_at = p_now,
      provider_receipt_hash = case when p_provider_receipt is null then null
        else encode(extensions.digest('xenios:report-receipt:v1|' || p_provider_receipt, 'sha256'), 'hex') end
  where id = p_id and status = 'processing' and lease_expires_at >= p_now
  returning attempt_count into v_attempt;
  if not found then raise exception using errcode = '55000', message = 'report is not actively leased'; end if;
  insert into public.research_operational_reporting_attempts(outbox_id, attempt_number, outcome, occurred_at)
  values (p_id, v_attempt, 'succeeded', p_now);
end;
$function$;

create or replace function public.research_fail_operational_report(
  p_id uuid,
  p_error_code text,
  p_error_summary text,
  p_now timestamptz default statement_timestamp(),
  p_max_attempts integer default 5,
  p_retry_delay interval default interval '5 minutes'
) returns text
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_attempt integer; v_status text;
begin
  if p_max_attempts not between 1 and 20 or p_retry_delay < interval '1 second' or
     p_retry_delay > interval '24 hours' or length(coalesce(p_error_summary, '')) > 500 then
    raise exception using errcode = '22023', message = 'invalid failure bounds';
  end if;
  update public.research_operational_reporting_outbox
  set status = case when attempt_count >= p_max_attempts then 'dead_letter' else 'retry_scheduled' end,
      lease_expires_at = null,
      next_attempt_at = case when attempt_count >= p_max_attempts then next_attempt_at else p_now + p_retry_delay end,
      last_error_code = left(p_error_code, 80), last_error_summary = p_error_summary, updated_at = p_now
  where id = p_id and status = 'processing' and lease_expires_at >= p_now
  returning attempt_count, status into v_attempt, v_status;
  if not found then raise exception using errcode = '55000', message = 'report is not actively leased'; end if;
  insert into public.research_operational_reporting_attempts(
    outbox_id, attempt_number, outcome, error_code, error_summary, occurred_at
  ) values (p_id, v_attempt, v_status, left(p_error_code, 80), p_error_summary, p_now);
  return v_status;
end;
$function$;

create or replace function public.research_reconcile_operational_reports(
  p_now timestamptz default statement_timestamp(),
  p_retry_delay interval default interval '1 minute'
) returns integer
language plpgsql
security definer
set search_path = pg_catalog
as $function$
declare v_count integer;
begin
  if p_retry_delay < interval '1 second' or p_retry_delay > interval '1 hour' then
    raise exception using errcode = '22023', message = 'invalid reconciliation delay';
  end if;
  with recovered as (
    update public.research_operational_reporting_outbox
    set status = 'retry_scheduled', lease_expires_at = null,
        next_attempt_at = p_now + p_retry_delay, updated_at = p_now,
        last_error_code = 'lease_expired', last_error_summary = 'Processing lease expired before completion.'
    where status = 'processing' and lease_expires_at < p_now
    returning id, attempt_count
  ), logged as (
    insert into public.research_operational_reporting_attempts(
      outbox_id, attempt_number, outcome, error_code, error_summary, occurred_at
    ) select id, attempt_count, 'lease_recovered', 'lease_expired',
             'Processing lease expired before completion.', p_now from recovered
    returning 1
  ) select count(*) into v_count from logged;
  return v_count;
end;
$function$;

revoke all on table public.research_operational_reporting_outbox from public, anon, authenticated, service_role;
revoke all on table public.research_operational_reporting_attempts from public, anon, authenticated, service_role;
revoke all on function public.research_enqueue_operational_report(text,text,jsonb,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_claim_operational_reports(integer,timestamptz,interval) from public, anon, authenticated, service_role;
revoke all on function public.research_complete_operational_report(uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_fail_operational_report(uuid,text,text,timestamptz,integer,interval) from public, anon, authenticated, service_role;
revoke all on function public.research_reconcile_operational_reports(timestamptz,interval) from public, anon, authenticated, service_role;
grant execute on function public.research_enqueue_operational_report(text,text,jsonb,timestamptz) to service_role;
grant execute on function public.research_claim_operational_reports(integer,timestamptz,interval) to service_role;
grant execute on function public.research_complete_operational_report(uuid,text,timestamptz) to service_role;
grant execute on function public.research_fail_operational_report(uuid,text,text,timestamptz,integer,interval) to service_role;
grant execute on function public.research_reconcile_operational_reports(timestamptz,interval) to service_role;

commit;
