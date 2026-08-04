-- Early Access identity persistence: the durable customer roster, the
-- single-use verification-token record, the session-to-customer bindings, the
-- agreement acceptances, and the server-side referral grants.
--
-- WHY THESE FIVE TOGETHER. They are the identity half of the Early Access
-- durable-store seam (`register.ts` names `customers` + `sessionBindings` as
-- exactly that seam). Every one of them is currently an in-memory Map or Set,
-- which means a restart forgets who a customer is, which tokens were burned,
-- and which session belongs to whom. Production may not sell on that.
--
-- ACCESS SHAPE. Identical to the accepted Private Early Access session
-- migration: RLS enabled AND forced with ZERO policies, every table privilege
-- revoked from every browser-reachable role AND from service_role. The only
-- door is the SECURITY DEFINER functions below, each granted to service_role
-- alone. No client, browser or server, ever composes SQL against these tables.
--
-- ROUND-TRIP SHAPE. The TypeScript domain record is the canonical value, so
-- each roster row carries the whole record as `record jsonb`, with the columns
-- the DATABASE must judge (identity, uniqueness, status) extracted beside it
-- and kept in sync by the functions. A read returns `record` verbatim, so the
-- adapter hands the domain exactly what it committed.
--
-- This migration is ADDITIVE. It creates nothing but new objects, touches no
-- existing table, and may be applied twice without effect.

-- ---------------------------------------------------------------------------
-- Preflight: refuse a half-installed prior attempt rather than build on it.
-- ---------------------------------------------------------------------------

do $preflight$
declare
  v_tables int;
  v_functions int;
begin
  select count(*) into v_tables
  from pg_catalog.pg_tables
  where schemaname = 'public'
    and tablename in (
      'research_early_access_customers',
      'research_early_access_consumed_tokens',
      'research_early_access_session_bindings',
      'research_early_access_agreement_acceptances',
      'research_early_access_referral_grants'
    );

  select count(*) into v_functions
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in (
      'research_early_access_customer_insert',
      'research_early_access_customer_update',
      'research_early_access_customer_by_id',
      'research_early_access_customer_by_email',
      'research_early_access_consume_token',
      'research_early_access_bind_session',
      'research_early_access_session_binding',
      'research_early_access_record_agreement',
      'research_early_access_agreements_accepted',
      'research_early_access_grant_referral',
      'research_early_access_referral_for_customer'
    );

  -- All present (re-apply) and none present (first apply) are both fine.
  -- A partial set means a prior attempt died mid-file; a human must look.
  if v_tables not in (0, 5) then
    raise exception
      'research_early_access identity persistence is partially installed: % of 5 tables exist. Resolve manually before re-applying.',
      v_tables;
  end if;
  if v_tables = 0 and v_functions > 0 then
    raise exception
      'research_early_access identity functions exist without their tables (% found). Resolve manually before re-applying.',
      v_functions;
  end if;
end
$preflight$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- The roster. `record` is the canonical EarlyAccessCustomerRecord; the
-- extracted columns are the facts the database itself must enforce.
create table if not exists public.research_early_access_customers (
  id text primary key
    constraint research_early_access_customers_id_shape
    check (id ~ '^[A-Za-z0-9_-]{1,128}$'),
  normalized_email text not null
    constraint research_early_access_customers_email_lowercase
    check (normalized_email = lower(normalized_email) and length(normalized_email) between 3 and 254),
  status text not null
    constraint research_early_access_customers_status_vocabulary
    check (status in ('INVITED', 'APPROVED', 'SUSPENDED', 'REVOKED')),
  record jsonb not null,
  created_at timestamptz not null default pg_catalog.clock_timestamp(),
  updated_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_customers_email_unique unique (normalized_email),
  constraint research_early_access_customers_record_agrees
    check (
      record ->> 'id' = id
      and record ->> 'normalizedEmail' = normalized_email
      and record ->> 'status' = status
      and record ->> 'audience' = 'PRIVATE_EARLY_ACCESS'
    )
);

comment on table public.research_early_access_customers is
  'Early Access customer roster. The jsonb record is canonical; extracted columns enforce identity, uniqueness, and status vocabulary.';

-- One row per burned verification token id (jti). Insert-once; the primary
-- key IS the single-use guarantee under concurrency.
create table if not exists public.research_early_access_consumed_tokens (
  token_id text primary key
    constraint research_early_access_consumed_tokens_id_shape
    check (length(token_id) between 8 and 128),
  consumed_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.research_early_access_consumed_tokens is
  'Single-use enforcement for Early Access verification tokens. A row is a burned jti; the primary key makes first-use exactly-once.';

-- A session points at exactly one customer for its whole life. The session id
-- is the same hashed identifier the session repository stores, never a raw
-- cookie token.
create table if not exists public.research_early_access_session_bindings (
  session_id text primary key
    constraint research_early_access_session_bindings_id_shape
    check (session_id ~ '^[a-f0-9]{64}$'),
  customer_id text not null
    constraint research_early_access_session_bindings_customer_shape
    check (customer_id ~ '^[A-Za-z0-9_-]{1,128}$'),
  bound_at timestamptz not null default pg_catalog.clock_timestamp()
);

comment on table public.research_early_access_session_bindings is
  'Session-to-customer bindings. Insert-only; a session binds once, ever, and the primary key enforces it.';

-- What a customer has agreed to, as an append-only fact.
create table if not exists public.research_early_access_agreement_acceptances (
  id bigint generated always as identity primary key,
  customer_ref text not null
    constraint research_early_access_agreements_customer_shape
    check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  agreement_kind text not null
    constraint research_early_access_agreements_kind_shape
    check (length(agreement_kind) between 1 and 64),
  agreement_version text not null
    constraint research_early_access_agreements_version_shape
    check (length(agreement_version) between 1 and 64),
  accepted_at timestamptz not null,
  evidence jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default pg_catalog.clock_timestamp(),
  constraint research_early_access_agreements_once
    unique (customer_ref, agreement_kind, agreement_version)
);

comment on table public.research_early_access_agreement_acceptances is
  'Early Access agreement acceptances, append-only. The gate asks whether every required (kind, version) is on file.';

-- The SERVER''s record of how a customer arrived. Never written from an order
-- body; an operator records it through the function below.
create table if not exists public.research_early_access_referral_grants (
  customer_ref text primary key
    constraint research_early_access_referrals_customer_shape
    check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  referral_code text not null
    constraint research_early_access_referrals_code_shape
    check (length(referral_code) between 1 and 64),
  affiliate_id text not null
    constraint research_early_access_referrals_affiliate_shape
    check (length(affiliate_id) between 1 and 128),
  affiliate_customer_ref text not null
    constraint research_early_access_referrals_affiliate_ref_shape
    check (affiliate_customer_ref ~ '^eac_[a-f0-9]{32}$'),
  hold_basis_points integer not null
    constraint research_early_access_referrals_basis_points_range
    check (hold_basis_points between 0 and 10000),
  granted_at timestamptz not null default pg_catalog.clock_timestamp(),
  revoked_at timestamptz,
  constraint research_early_access_referrals_no_self
    check (affiliate_customer_ref <> customer_ref)
);

comment on table public.research_early_access_referral_grants is
  'Server-side referral attribution per Early Access customer. Resolved at order time; a revoked grant resolves to nothing.';

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index if not exists research_early_access_session_bindings_customer_idx
  on public.research_early_access_session_bindings (customer_id);

create index if not exists research_early_access_agreements_customer_idx
  on public.research_early_access_agreement_acceptances (customer_ref, agreement_kind);

-- ---------------------------------------------------------------------------
-- Append-only enforcement
-- ---------------------------------------------------------------------------

-- Even the table owner may not rewrite a burned token, a binding, or an
-- acceptance. A correction is a new fact, never an edit.
create or replace function public.research_early_access_identity_block_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $block$
begin
  raise exception 'research_early_access %.% is append-only', tg_table_schema, tg_table_name;
end;
$block$;

do $append_only$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_consumed_tokens',
    'research_early_access_session_bindings',
    'research_early_access_agreement_acceptances'
  ] loop
    execute pg_catalog.format(
      'drop trigger if exists %I on public.%I',
      v_table || '_append_only', v_table
    );
    execute pg_catalog.format(
      'create trigger %I before update or delete on public.%I
         for each row execute function public.research_early_access_identity_block_mutation()',
      v_table || '_append_only', v_table
    );
  end loop;
end
$append_only$;

-- ---------------------------------------------------------------------------
-- Row level security and privileges
-- ---------------------------------------------------------------------------

alter table public.research_early_access_customers enable row level security;
alter table public.research_early_access_customers force row level security;
alter table public.research_early_access_consumed_tokens enable row level security;
alter table public.research_early_access_consumed_tokens force row level security;
alter table public.research_early_access_session_bindings enable row level security;
alter table public.research_early_access_session_bindings force row level security;
alter table public.research_early_access_agreement_acceptances enable row level security;
alter table public.research_early_access_agreement_acceptances force row level security;
alter table public.research_early_access_referral_grants enable row level security;
alter table public.research_early_access_referral_grants force row level security;

-- Zero policies by design: no role reaches these tables through PostgREST.
-- Access is the definer functions below, or nothing.
do $table_revokes$
declare
  v_role text;
  v_table text;
begin
  foreach v_table in array array[
    'research_early_access_customers',
    'research_early_access_consumed_tokens',
    'research_early_access_session_bindings',
    'research_early_access_agreement_acceptances',
    'research_early_access_referral_grants'
  ] loop
    execute pg_catalog.format('revoke all on table public.%I from public', v_table);
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on table public.%I from %I', v_table, v_role);
      end if;
    end loop;
  end loop;
end
$table_revokes$;

-- ---------------------------------------------------------------------------
-- Functions: the roster
-- ---------------------------------------------------------------------------

-- Insert a customer record. Returns {"ok": true, "record": ...} or
-- {"ok": false, "code": "EMAIL_ALREADY_REGISTERED"}, mirroring the port.
create or replace function public.research_early_access_customer_insert(
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $customer_insert$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_customer_insert: record must be a jsonb object';
  end if;
  insert into public.research_early_access_customers (id, normalized_email, status, record)
  values (
    p_record ->> 'id',
    p_record ->> 'normalizedEmail',
    p_record ->> 'status',
    p_record
  );
  return jsonb_build_object('ok', true, 'record', p_record);
exception
  when unique_violation then
    return jsonb_build_object('ok', false, 'code', 'EMAIL_ALREADY_REGISTERED');
end;
$customer_insert$;

-- Update (or place) a customer record by id, keeping the judged columns in
-- sync with the canonical jsonb. Mirrors the in-memory port's `update`, which
-- is a plain set.
create or replace function public.research_early_access_customer_update(
  p_record jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $customer_update$
begin
  if p_record is null or jsonb_typeof(p_record) <> 'object' then
    raise exception 'research_early_access_customer_update: record must be a jsonb object';
  end if;
  insert into public.research_early_access_customers (id, normalized_email, status, record)
  values (
    p_record ->> 'id',
    p_record ->> 'normalizedEmail',
    p_record ->> 'status',
    p_record
  )
  on conflict (id) do update
    set normalized_email = excluded.normalized_email,
        status = excluded.status,
        record = excluded.record,
        updated_at = pg_catalog.clock_timestamp();
  return p_record;
end;
$customer_update$;

create or replace function public.research_early_access_customer_by_id(
  p_id text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $customer_by_id$
  select record from public.research_early_access_customers where id = p_id;
$customer_by_id$;

create or replace function public.research_early_access_customer_by_email(
  p_normalized_email text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $customer_by_email$
  select record from public.research_early_access_customers
  where normalized_email = p_normalized_email;
$customer_by_email$;

-- ---------------------------------------------------------------------------
-- Functions: tokens and bindings
-- ---------------------------------------------------------------------------

-- True only the first time this token id is presented. The primary key makes
-- two concurrent presentations resolve to exactly one true.
create or replace function public.research_early_access_consume_token(
  p_token_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $consume_token$
begin
  insert into public.research_early_access_consumed_tokens (token_id)
  values (p_token_id);
  return true;
exception
  when unique_violation then
    return false;
end;
$consume_token$;

-- True only when this call created the binding. False when the session is
-- already bound, even to the same customer, mirroring the port exactly.
create or replace function public.research_early_access_bind_session(
  p_session_id text,
  p_customer_id text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $bind_session$
begin
  insert into public.research_early_access_session_bindings (session_id, customer_id)
  values (p_session_id, p_customer_id);
  return true;
exception
  when unique_violation then
    return false;
end;
$bind_session$;

create or replace function public.research_early_access_session_binding(
  p_session_id text
)
returns text
language sql
security definer
set search_path = pg_catalog, public
as $session_binding$
  select customer_id from public.research_early_access_session_bindings
  where session_id = p_session_id;
$session_binding$;

-- ---------------------------------------------------------------------------
-- Functions: agreements
-- ---------------------------------------------------------------------------

-- Record one acceptance. True when recorded, false when that exact
-- (customer, kind, version) is already on file, which is not an error.
create or replace function public.research_early_access_record_agreement(
  p_customer_ref text,
  p_kind text,
  p_version text,
  p_accepted_at timestamptz,
  p_evidence jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $record_agreement$
begin
  insert into public.research_early_access_agreement_acceptances
    (customer_ref, agreement_kind, agreement_version, accepted_at, evidence)
  values (p_customer_ref, p_kind, p_version, p_accepted_at, coalesce(p_evidence, '{}'::jsonb));
  return true;
exception
  when unique_violation then
    return false;
end;
$record_agreement$;

-- True only when EVERY required (kind, version) pair has an acceptance on
-- file for this customer. An empty or malformed requirement list is refused,
-- not treated as "nothing required": the gate fails closed.
create or replace function public.research_early_access_agreements_accepted(
  p_customer_ref text,
  p_required jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $agreements_accepted$
declare
  v_entry jsonb;
begin
  if p_required is null
     or jsonb_typeof(p_required) <> 'array'
     or jsonb_array_length(p_required) = 0 then
    return false;
  end if;
  for v_entry in select * from jsonb_array_elements(p_required) loop
    if jsonb_typeof(v_entry) <> 'object'
       or v_entry ->> 'kind' is null
       or v_entry ->> 'version' is null then
      return false;
    end if;
    if not exists (
      select 1 from public.research_early_access_agreement_acceptances
      where customer_ref = p_customer_ref
        and agreement_kind = v_entry ->> 'kind'
        and agreement_version = v_entry ->> 'version'
    ) then
      return false;
    end if;
  end loop;
  return true;
end;
$agreements_accepted$;

-- ---------------------------------------------------------------------------
-- Functions: referral grants
-- ---------------------------------------------------------------------------

-- Record how a customer arrived. One grant per customer; recording again
-- replaces the attribution but keeps the original grant time.
create or replace function public.research_early_access_grant_referral(
  p_customer_ref text,
  p_referral_code text,
  p_affiliate_id text,
  p_affiliate_customer_ref text,
  p_hold_basis_points integer
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $grant_referral$
begin
  insert into public.research_early_access_referral_grants
    (customer_ref, referral_code, affiliate_id, affiliate_customer_ref, hold_basis_points)
  values
    (p_customer_ref, p_referral_code, p_affiliate_id, p_affiliate_customer_ref, p_hold_basis_points)
  on conflict (customer_ref) do update
    set referral_code = excluded.referral_code,
        affiliate_id = excluded.affiliate_id,
        affiliate_customer_ref = excluded.affiliate_customer_ref,
        hold_basis_points = excluded.hold_basis_points,
        revoked_at = null;
  return true;
end;
$grant_referral$;

-- The attribution for a customer, or null. A revoked grant is null: silence
-- is the safe answer about money.
create or replace function public.research_early_access_referral_for_customer(
  p_customer_ref text
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $referral_for_customer$
  select jsonb_build_object(
    'referralCode', referral_code,
    'affiliateId', affiliate_id,
    'affiliateCustomerRef', affiliate_customer_ref,
    'holdBasisPoints', hold_basis_points
  )
  from public.research_early_access_referral_grants
  where customer_ref = p_customer_ref
    and revoked_at is null;
$referral_for_customer$;

-- ---------------------------------------------------------------------------
-- Function privileges: service_role and nobody else
-- ---------------------------------------------------------------------------

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_identity_block_mutation()',
    'public.research_early_access_customer_insert(jsonb)',
    'public.research_early_access_customer_update(jsonb)',
    'public.research_early_access_customer_by_id(text)',
    'public.research_early_access_customer_by_email(text)',
    'public.research_early_access_consume_token(text)',
    'public.research_early_access_bind_session(text,text)',
    'public.research_early_access_session_binding(text)',
    'public.research_early_access_record_agreement(text,text,text,timestamptz,jsonb)',
    'public.research_early_access_agreements_accepted(text,jsonb)',
    'public.research_early_access_grant_referral(text,text,text,text,integer)',
    'public.research_early_access_referral_for_customer(text)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
       and v_signature <> 'public.research_early_access_identity_block_mutation()' then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
