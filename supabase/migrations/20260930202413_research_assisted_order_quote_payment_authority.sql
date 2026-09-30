-- HL-12 successor foundation. This file is source-only until the mounted
-- application, exact database functions and managed rollout are qualified.
-- The preceding paid-hold trigger remains in force while this schema lands.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $preflight$
declare v_role text;
declare v_table text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      raise exception 'HL-12 authority requires role %', v_role using errcode = '55000';
    end if;
  end loop;
  if pg_catalog.to_regclass('public.research_assisted_order_requests') is null
     or pg_catalog.to_regclass('public.research_assisted_order_lines') is null then
    raise exception 'HL-12 authority requires the assisted-order bridge' using errcode = '55000';
  end if;
  foreach v_table in array array[
    'research_assisted_order_quotes',
    'research_assisted_order_payment_verifier_grants',
    'research_assisted_order_payment_observations',
    'research_assisted_order_payment_verifications'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is not null and exists (
      select 1 from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
      left join pg_catalog.pg_roles r on r.oid = acl.grantee
      where c.oid = pg_catalog.to_regclass('public.' || v_table)
        and (acl.grantee = 0 or r.rolname in ('anon', 'authenticated', 'service_role'))
    ) then
      raise exception 'HL-12 preflight: direct table grant on %', v_table
        using errcode = '55000';
    end if;
  end loop;
end
$preflight$;

create table if not exists public.research_assisted_order_quotes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  version integer not null check (version > 0),
  state text not null check (state in ('issued', 'accepted', 'superseded', 'withdrawn', 'expired')),
  lines jsonb not null check (jsonb_typeof(lines) = 'array' and jsonb_array_length(lines) > 0),
  pricing_basis jsonb not null default '{}'::jsonb check (jsonb_typeof(pricing_basis) = 'object'),
  total_cents bigint not null check (total_cents between 1 and 100000000),
  currency text not null check (currency = 'USD'),
  issued_by text not null check (length(btrim(issued_by)) > 0),
  issued_at timestamptz not null default now(),
  valid_until timestamptz not null,
  customer_note text,
  accepted_at timestamptz,
  acceptance_id uuid unique,
  constraint research_assisted_order_quotes_version_uq unique (request_id, version),
  constraint research_assisted_order_quotes_acceptance_chk check (
    (state = 'accepted') = (accepted_at is not null and acceptance_id is not null)
  ),
  constraint research_assisted_order_quotes_validity_chk check (valid_until > issued_at)
);

create unique index if not exists research_assisted_order_one_accepted_quote_uq
  on public.research_assisted_order_quotes(request_id) where state = 'accepted';

-- Empty by default. A managed grant would require a separately authorized,
-- named actor action; this migration neither creates nor infers one.
create table if not exists public.research_assisted_order_payment_verifier_grants (
  auth_user_id uuid primary key,
  actor_label text not null check (length(btrim(actor_label)) > 0),
  granted_by text not null check (length(btrim(granted_by)) > 0),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.research_assisted_order_payment_observations (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on delete restrict,
  method text not null check (method in ('manual', 'provider')),
  observed_amount_cents bigint not null check (observed_amount_cents > 0),
  observed_currency text not null check (length(btrim(observed_currency)) between 3 and 10),
  payment_reference text not null check (length(btrim(payment_reference)) between 3 and 255),
  provider_name text,
  provider_event_id text,
  provider_payment_id text,
  source_evidence_ref text not null check (length(btrim(source_evidence_ref)) between 3 and 255),
  observed_by text not null check (length(btrim(observed_by)) > 0),
  observed_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  constraint research_assisted_order_observation_provider_chk check (
    (method = 'manual' and provider_name is null and provider_event_id is null and provider_payment_id is null)
    or (method = 'provider' and nullif(btrim(provider_name), '') is not null
      and nullif(btrim(provider_event_id), '') is not null
      and nullif(btrim(provider_payment_id), '') is not null)
  ),
  constraint research_assisted_order_observation_payment_uq unique (method, payment_reference),
  constraint research_assisted_order_observation_event_uq unique (provider_name, provider_event_id),
  constraint research_assisted_order_observation_identity_uq unique (provider_name, provider_payment_id)
);

create table if not exists public.research_assisted_order_payment_verifications (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.research_assisted_order_requests(id) on delete restrict,
  quote_id uuid not null references public.research_assisted_order_quotes(id) on delete restrict,
  quote_version integer not null,
  acceptance_id uuid not null,
  observation_id uuid not null unique references public.research_assisted_order_payment_observations(id) on delete restrict,
  expected_amount_cents bigint not null check (expected_amount_cents > 0),
  expected_currency text not null,
  observed_amount_cents bigint not null check (observed_amount_cents > 0),
  observed_currency text not null,
  payment_reference text not null,
  method text not null check (method in ('manual', 'provider')),
  provider_name text,
  provider_event_id text,
  provider_payment_id text,
  verified_by text not null check (length(btrim(verified_by)) > 0),
  verified_at timestamptz not null default now(),
  constraint research_assisted_order_verification_request_uq unique (request_id),
  constraint research_assisted_order_verification_amount_chk check (
    expected_amount_cents = observed_amount_cents and expected_currency = observed_currency
  )
);

-- The DB's published Data API must not expose raw observations, internal
-- evidence references or quote records to anon/authenticated roles.
alter table public.research_assisted_order_quotes enable row level security;
alter table public.research_assisted_order_quotes force row level security;
alter table public.research_assisted_order_payment_verifier_grants enable row level security;
alter table public.research_assisted_order_payment_verifier_grants force row level security;
alter table public.research_assisted_order_payment_observations enable row level security;
alter table public.research_assisted_order_payment_observations force row level security;
alter table public.research_assisted_order_payment_verifications enable row level security;
alter table public.research_assisted_order_payment_verifications force row level security;

revoke all on table public.research_assisted_order_quotes from public, anon, authenticated, service_role;
revoke all on table public.research_assisted_order_payment_verifier_grants from public, anon, authenticated, service_role;
revoke all on table public.research_assisted_order_payment_observations from public, anon, authenticated, service_role;
revoke all on table public.research_assisted_order_payment_verifications from public, anon, authenticated, service_role;

-- Records are append-only. Corrections are new observations and a governed
-- reversal, never edits to an observed payment or its verification.
create or replace function public.research_assisted_order_financial_block_mutation()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  raise exception using errcode = 'P0001',
    message = 'Financial evidence is append only.',
    detail = 'ASSISTED_ORDER_FINANCIAL_EVIDENCE_IMMUTABLE';
end
$guard$;

drop trigger if exists research_assisted_order_observation_immutable on public.research_assisted_order_payment_observations;
create trigger research_assisted_order_observation_immutable
before update or delete on public.research_assisted_order_payment_observations
for each row execute function public.research_assisted_order_financial_block_mutation();

drop trigger if exists research_assisted_order_verification_immutable on public.research_assisted_order_payment_verifications;
create trigger research_assisted_order_verification_immutable
before update or delete on public.research_assisted_order_payment_verifications
for each row execute function public.research_assisted_order_financial_block_mutation();

revoke all on function public.research_assisted_order_financial_block_mutation()
  from public, anon, authenticated, service_role;

create or replace function public.research_assisted_order_observation_insert_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if not exists (
    select 1 from public.research_assisted_order_quotes q
    where q.id = new.quote_id and q.request_id = new.request_id
      and q.state = 'accepted' and q.acceptance_id is not null
  ) then
    raise exception using errcode = 'P0001',
      message = 'Payment observation needs an accepted quote for this request.',
      detail = 'ASSISTED_ORDER_QUOTE_NOT_ACCEPTED';
  end if;
  return new;
end
$guard$;

drop trigger if exists research_assisted_order_observation_insert on public.research_assisted_order_payment_observations;
create trigger research_assisted_order_observation_insert
before insert on public.research_assisted_order_payment_observations
for each row execute function public.research_assisted_order_observation_insert_guard();

create or replace function public.research_assisted_order_verification_insert_guard()
returns trigger language plpgsql set search_path = '' as $guard$
declare
  v_quote public.research_assisted_order_quotes%rowtype;
  v_observation public.research_assisted_order_payment_observations%rowtype;
begin
  select * into v_quote from public.research_assisted_order_quotes q
  where q.id = new.quote_id and q.request_id = new.request_id
    and q.version = new.quote_version and q.acceptance_id = new.acceptance_id
    and q.state = 'accepted';
  if not found or new.expected_amount_cents <> v_quote.total_cents
     or new.expected_currency <> v_quote.currency then
    raise exception using errcode = 'P0001',
      message = 'Verification does not match the accepted quote.',
      detail = 'ASSISTED_ORDER_VERIFICATION_QUOTE_MISMATCH';
  end if;
  select * into v_observation from public.research_assisted_order_payment_observations o
  where o.id = new.observation_id and o.request_id = new.request_id
    and o.quote_id = new.quote_id;
  if not found or new.observed_amount_cents <> v_observation.observed_amount_cents
     or new.observed_currency <> v_observation.observed_currency
     or new.payment_reference <> v_observation.payment_reference
     or new.method <> v_observation.method
     or new.provider_name is distinct from v_observation.provider_name
     or new.provider_event_id is distinct from v_observation.provider_event_id
     or new.provider_payment_id is distinct from v_observation.provider_payment_id
     or new.verified_by <> v_observation.observed_by then
    raise exception using errcode = 'P0001',
      message = 'Verification does not match the observed payment.',
      detail = 'ASSISTED_ORDER_VERIFICATION_OBSERVATION_MISMATCH';
  end if;
  return new;
end
$guard$;

drop trigger if exists research_assisted_order_verification_insert on public.research_assisted_order_payment_verifications;
create trigger research_assisted_order_verification_insert
before insert on public.research_assisted_order_payment_verifications
for each row execute function public.research_assisted_order_verification_insert_guard();

revoke all on function public.research_assisted_order_observation_insert_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.research_assisted_order_verification_insert_guard()
  from public, anon, authenticated, service_role;

-- A quote is priced from the stored request line identities, not an arbitrary
-- browser total. The only admin-entered unit price is for a genuinely
-- request_pricing line and must carry a private pricing basis.
create or replace function public.research_assisted_order_quote_issue(
  p_request_id uuid,
  p_line_decisions jsonb,
  p_valid_until timestamptz,
  p_actor_id text,
  p_customer_note text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $issue$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_line public.research_assisted_order_lines%rowtype;
  v_decision jsonb;
  v_lines jsonb := '[]'::jsonb;
  v_basis jsonb := '{}'::jsonb;
  v_unit bigint;
  v_line_total bigint;
  v_total bigint := 0;
  v_count integer := 0;
  v_version integer;
  v_quote_id uuid;
begin
  if nullif(pg_catalog.btrim(p_actor_id), '') is null then
    raise exception 'Named quote issuer required' using errcode = 'P0001';
  end if;
  if p_valid_until <= now() or p_valid_until > now() + interval '30 days' then
    raise exception 'Quote validity must be within 30 days' using errcode = 'P0001';
  end if;
  if pg_catalog.jsonb_typeof(p_line_decisions) <> 'array' then
    raise exception 'Quote decisions must be an array' using errcode = 'P0001';
  end if;

  select * into v_request from public.research_assisted_order_requests
  where id = p_request_id for update;
  if not found or v_request.status not in (
    'reviewing', 'waiting_on_customer', 'identity_received',
    'agreements_pending', 'agreements_complete'
  ) then
    raise exception 'Request is not quote-ready' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.research_assisted_order_quotes
             where request_id = p_request_id and state = 'accepted') then
    raise exception 'An accepted quote cannot be repriced' using errcode = 'P0001';
  end if;

  for v_line in select * from public.research_assisted_order_lines
                where request_id = p_request_id order by created_at, id loop
    v_count := v_count + 1;
    if v_line.workflow_mode not in ('direct_order_request', 'request_pricing') then
      raise exception 'Held or Care lines cannot be quoted for Research payment'
        using errcode = 'P0001';
    end if;
    if (select count(*) from pg_catalog.jsonb_array_elements(p_line_decisions) d
        where d ->> 'lineId' = v_line.id::text) <> 1 then
      raise exception 'Quote must identify each request line exactly once'
        using errcode = 'P0001';
    end if;
    select d into v_decision from pg_catalog.jsonb_array_elements(p_line_decisions) d
    where d ->> 'lineId' = v_line.id::text;

    if v_line.unit_price_cents is not null then
      if v_decision ? 'unitPriceCents'
         and (pg_catalog.jsonb_typeof(v_decision -> 'unitPriceCents') <> 'number'
              or v_decision ->> 'unitPriceCents' <> v_line.unit_price_cents::text) then
        raise exception 'A priced line must retain its authoritative unit price'
          using errcode = 'P0001';
      end if;
      v_unit := v_line.unit_price_cents;
    else
      if v_line.workflow_mode <> 'request_pricing'
         or pg_catalog.jsonb_typeof(v_decision -> 'unitPriceCents') <> 'number'
         or v_decision ->> 'unitPriceCents' !~ '^[0-9]{1,9}$'
         or nullif(pg_catalog.btrim(v_decision ->> 'pricingBasis'), '') is null then
        raise exception 'Unpriced line needs positive quoted cents and private pricing basis'
          using errcode = 'P0001';
      end if;
      v_unit := (v_decision ->> 'unitPriceCents')::bigint;
      v_basis := v_basis || pg_catalog.jsonb_build_object(
        v_line.id::text, v_decision ->> 'pricingBasis');
    end if;
    if v_unit <= 0 then
      raise exception 'Quote unit price must be positive' using errcode = 'P0001';
    end if;
    v_line_total := v_unit * v_line.quantity;
    v_total := v_total + v_line_total;
    if v_total > 100000000 then
      raise exception 'Quote total exceeds the payment limit' using errcode = 'P0001';
    end if;
    v_lines := v_lines || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'lineId', v_line.id,
      'productId', v_line.product_id,
      'variantId', v_line.variant_id,
      'productName', v_line.product_name,
      'specification', v_line.specification,
      'quantity', v_line.quantity,
      'unitPriceCents', v_unit,
      'lineTotalCents', v_line_total,
      'currency', 'USD',
      'priceSource', case when v_line.unit_price_cents is null then 'quoted' else 'catalog' end
    ));
  end loop;
  if v_count = 0 or pg_catalog.jsonb_array_length(p_line_decisions) <> v_count then
    raise exception 'Quote decisions do not match the request lines' using errcode = 'P0001';
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.research_assisted_order_quotes where request_id = p_request_id;
  update public.research_assisted_order_quotes set state = 'superseded'
  where request_id = p_request_id and state = 'issued';
  insert into public.research_assisted_order_quotes (
    request_id, version, state, lines, pricing_basis, total_cents, currency,
    issued_by, valid_until, customer_note
  ) values (
    p_request_id, v_version, 'issued', v_lines, v_basis, v_total, 'USD',
    pg_catalog.btrim(p_actor_id), p_valid_until,
    nullif(pg_catalog.btrim(p_customer_note), '')
  ) returning id into v_quote_id;
  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote_id, 'requestPublicReference', v_request.public_reference,
    'version', v_version, 'state', 'issued', 'lines', v_lines,
    'totalCents', v_total, 'currency', 'USD', 'validUntil', p_valid_until
  );
end
$issue$;

-- The customer echoes the exact version and total shown. The caller must
-- supply server-derived owner/session identity or a valid hashed status token.
create or replace function public.research_assisted_order_quote_accept(
  p_quote_id uuid,
  p_version integer,
  p_expected_total_cents bigint,
  p_member_id uuid default null,
  p_early_access_session_hash text default null,
  p_status_token_hash text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $accept$
declare
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_request_id uuid;
  v_authorized boolean;
begin
  select request_id into v_request_id from public.research_assisted_order_quotes
  where id = p_quote_id;
  if not found then return null; end if;
  select * into v_request from public.research_assisted_order_requests
  where id = v_request_id for update;
  select * into v_quote from public.research_assisted_order_quotes
  where id = p_quote_id for update;

  v_authorized :=
    (p_member_id is not null and v_request.actor_member_id = p_member_id)
    or (p_early_access_session_hash is not null
        and v_request.early_access_session_hash = p_early_access_session_hash)
    or exists (select 1 from public.research_assisted_order_access_tokens t
      where t.request_id = v_request.id and t.token_hash = p_status_token_hash
        and t.revoked_at is null and t.expires_at > now());
  if not v_authorized then return null; end if;
  if v_quote.version <> p_version or v_quote.total_cents <> p_expected_total_cents
     or v_quote.currency <> 'USD' then
    raise exception 'Quote changed; refresh before accepting'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  if v_quote.state = 'accepted' then
    return pg_catalog.jsonb_build_object(
      'quoteId', v_quote.id, 'version', v_quote.version,
      'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
      'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
      'replayed', true);
  end if;
  if v_quote.state <> 'issued' or v_quote.valid_until <= now()
     or exists (select 1 from public.research_assisted_order_quotes q
                where q.request_id = v_request.id and q.version > v_quote.version) then
    raise exception 'Quote is no longer available'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  update public.research_assisted_order_quotes
  set state = 'accepted', accepted_at = now(), acceptance_id = gen_random_uuid()
  where id = p_quote_id returning * into v_quote;
  return pg_catalog.jsonb_build_object(
    'quoteId', v_quote.id, 'version', v_quote.version,
    'totalCents', v_quote.total_cents, 'currency', v_quote.currency,
    'acceptanceId', v_quote.acceptance_id, 'acceptedAt', v_quote.accepted_at,
    'replayed', false);
end
$accept$;

revoke all on function public.research_assisted_order_quote_issue(uuid, jsonb, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_quote_issue(uuid, jsonb, timestamptz, text, text)
  to service_role;
revoke all on function public.research_assisted_order_quote_accept(uuid, integer, bigint, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_quote_accept(uuid, integer, bigint, uuid, text, text)
  to service_role;

-- A manual observation is made only by a separately granted finance actor.
-- A provider observation is accepted only through this service-role RPC; the
-- mounted adapter must verify the raw webhook signature BEFORE calling it.
-- This database routine does not claim to authenticate provider bytes.
create or replace function public.research_assisted_order_payment_observe(
  p_request_id uuid,
  p_quote_id uuid,
  p_method text,
  p_observed_amount_cents bigint,
  p_observed_currency text,
  p_payment_reference text,
  p_source_evidence_ref text,
  p_observed_at timestamptz,
  p_actor_auth_user_id uuid default null,
  p_provider_name text default null,
  p_provider_event_id text default null,
  p_provider_payment_id text default null
)
returns jsonb language plpgsql security definer set search_path = '' as $observe$
declare
  v_actor_label text;
  v_reference text;
  v_existing public.research_assisted_order_payment_observations%rowtype;
  v_id uuid;
  v_request_reference text;
  v_provider_name text;
  v_provider_event_id text;
  v_provider_payment_id text;
begin
  select public_reference into v_request_reference
  from public.research_assisted_order_requests where id = p_request_id;
  if not found then
    raise exception 'Request not found' using errcode = 'P0001';
  end if;
  v_reference := nullif(pg_catalog.btrim(p_payment_reference), '');
  v_provider_name := nullif(pg_catalog.btrim(p_provider_name), '');
  v_provider_event_id := nullif(pg_catalog.btrim(p_provider_event_id), '');
  v_provider_payment_id := nullif(pg_catalog.btrim(p_provider_payment_id), '');
  if v_reference is null or p_observed_amount_cents <= 0
     or p_observed_at is null or nullif(pg_catalog.btrim(p_source_evidence_ref), '') is null then
    raise exception 'Observed payment fields are incomplete' using errcode = 'P0001';
  end if;
  if p_method = 'manual' then
    select actor_label into v_actor_label
    from public.research_assisted_order_payment_verifier_grants
    where auth_user_id = p_actor_auth_user_id and revoked_at is null;
    if not found or v_reference <> v_request_reference
       or p_provider_name is not null or p_provider_event_id is not null
       or p_provider_payment_id is not null then
      raise exception 'Manual observation requires a named grant and exact request reference'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
    end if;
  elsif p_method = 'provider' then
    if v_provider_name is null or v_provider_event_id is null
       or v_provider_payment_id is null
       or v_reference <> v_provider_payment_id then
      raise exception 'Provider observation requires exact event and payment identity'
        using errcode = 'P0001';
    end if;
    v_actor_label := 'provider:' || v_provider_name;
  else
    raise exception 'Unknown observation method' using errcode = 'P0001';
  end if;

  select * into v_existing from public.research_assisted_order_payment_observations
  where method = p_method and payment_reference = v_reference;
  if found then
    if v_existing.request_id <> p_request_id or v_existing.quote_id <> p_quote_id
       or v_existing.observed_amount_cents <> p_observed_amount_cents
       or v_existing.observed_currency <> p_observed_currency
       or v_existing.source_evidence_ref <> p_source_evidence_ref
       or v_existing.observed_at <> p_observed_at
       or v_existing.provider_name is distinct from v_provider_name
       or v_existing.provider_event_id is distinct from v_provider_event_id
       or v_existing.provider_payment_id is distinct from v_provider_payment_id then
      raise exception 'Payment reference was already used for different evidence'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REFERENCE_REUSED';
    end if;
    return pg_catalog.jsonb_build_object('observationId', v_existing.id, 'replayed', true);
  end if;

  insert into public.research_assisted_order_payment_observations (
    request_id, quote_id, method, observed_amount_cents, observed_currency,
    payment_reference, provider_name, provider_event_id, provider_payment_id,
    source_evidence_ref, observed_by, observed_at
  ) values (
    p_request_id, p_quote_id, p_method, p_observed_amount_cents,
    p_observed_currency, v_reference, v_provider_name, v_provider_event_id,
    v_provider_payment_id, p_source_evidence_ref, v_actor_label, p_observed_at
  ) returning id into v_id;
  return pg_catalog.jsonb_build_object('observationId', v_id, 'replayed', false);
end
$observe$;

revoke all on function public.research_assisted_order_payment_observe(uuid, uuid, text, bigint, text, text, text, timestamptz, uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_payment_observe(uuid, uuid, text, bigint, text, text, text, timestamptz, uuid, text, text, text)
  to service_role;

-- The status row can become paid only after a matching immutable verification
-- exists. An old paid label without one remains frozen pending a separately
-- evidenced historical-row resolution; this migration invents no backfill.
create or replace function public.research_assisted_order_paid_hold_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if tg_op = 'INSERT' then
    if new.status = 'paid' then
      raise exception using errcode = 'P0001',
        message = 'Paid cannot be inserted without the governed transition.',
        detail = 'ASSISTED_ORDER_PAYMENT_VERIFICATION_REQUIRED';
    end if;
    return new;
  end if;
  if new.status = 'paid' and old.status <> 'paid' then
    if old.status <> 'payment_review' or not exists (
      select 1 from public.research_assisted_order_payment_verifications v
      where v.request_id = new.id
    ) then
      raise exception using errcode = 'P0001',
        message = 'Paid requires an accepted quote and verified payment.',
        detail = 'ASSISTED_ORDER_PAYMENT_VERIFICATION_REQUIRED';
    end if;
  end if;
  if old.status = 'paid' and new.status <> 'paid' and not exists (
    select 1 from public.research_assisted_order_payment_verifications v
    where v.request_id = new.id
  ) then
    raise exception using errcode = 'P0001',
      message = 'Historical paid label lacks verified payment evidence.',
      detail = 'ASSISTED_ORDER_HISTORICAL_PAID_UNRESOLVED';
  end if;
  if old.status in ('paid', 'supplier_processing') and new.status = 'cancelled' then
    raise exception using errcode = 'P0001',
      message = 'Cancellation after payment requires governed refund evidence.',
      detail = 'ASSISTED_ORDER_REFUND_AUTHORITY_NOT_READY';
  end if;
  return new;
end
$guard$;

-- The M71 set-status RPC writes the event after the status row. This trigger
-- checks that the event names the same verification the paid row depends on;
-- a forged or unrelated id rolls back the whole RPC transaction.
create or replace function public.research_assisted_order_paid_event_guard()
returns trigger language plpgsql set search_path = '' as $guard$
begin
  if new.status = 'paid' and not exists (
    select 1 from public.research_assisted_order_payment_verifications v
    where v.request_id = new.request_id
      and v.id::text = new.evidence ->> 'paymentVerificationId'
  ) then
    raise exception using errcode = 'P0001',
      message = 'Paid event must name the matching verification.',
      detail = 'ASSISTED_ORDER_PAYMENT_VERIFICATION_REQUIRED';
  end if;
  return new;
end
$guard$;

drop trigger if exists research_assisted_order_paid_event_evidence on public.research_assisted_order_events;
create trigger research_assisted_order_paid_event_evidence
before insert on public.research_assisted_order_events
for each row execute function public.research_assisted_order_paid_event_guard();

revoke all on function public.research_assisted_order_paid_hold_guard()
  from public, anon, authenticated, service_role;
revoke all on function public.research_assisted_order_paid_event_guard()
  from public, anon, authenticated, service_role;

-- The only SQL path that creates a verification and advances paid. The
-- observation is independently recorded first; this transaction rechecks it
-- against the accepted quote, serializes on the request, and either commits
-- both verification and status event or neither.
create or replace function public.research_assisted_order_payment_verify(
  p_observation_id uuid,
  p_verifier_auth_user_id uuid default null
)
returns jsonb language plpgsql security definer set search_path = '' as $verify$
declare
  v_observation public.research_assisted_order_payment_observations%rowtype;
  v_request public.research_assisted_order_requests%rowtype;
  v_quote public.research_assisted_order_quotes%rowtype;
  v_verification_id uuid;
  v_actor_label text;
begin
  select * into v_observation
  from public.research_assisted_order_payment_observations
  where id = p_observation_id;
  if not found then
    raise exception 'Payment observation not found'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_OBSERVATION_NOT_FOUND';
  end if;
  select * into v_request from public.research_assisted_order_requests
  where id = v_observation.request_id for update;
  select * into v_quote from public.research_assisted_order_quotes
  where id = v_observation.quote_id;
  if v_quote.request_id <> v_request.id or v_quote.state <> 'accepted'
     or v_quote.acceptance_id is null
     or exists (select 1 from public.research_assisted_order_quotes q
                where q.request_id = v_request.id and q.version > v_quote.version) then
    raise exception 'Payment quote is stale or unaccepted'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_QUOTE_STALE';
  end if;
  if v_observation.method = 'manual' then
    select actor_label into v_actor_label
    from public.research_assisted_order_payment_verifier_grants
    where auth_user_id = p_verifier_auth_user_id and revoked_at is null;
    if not found or v_actor_label <> v_observation.observed_by then
      raise exception 'Manual payment verifier grant required'
        using errcode = 'P0001', detail = 'ASSISTED_ORDER_MANUAL_VERIFIER_REQUIRED';
    end if;
  else
    if p_verifier_auth_user_id is not null then
      raise exception 'Provider verification cannot claim a human actor'
        using errcode = 'P0001';
    end if;
    v_actor_label := v_observation.observed_by;
  end if;
  if v_observation.observed_amount_cents <> v_quote.total_cents
     or v_observation.observed_currency <> v_quote.currency then
    raise exception 'Payment amount or currency does not match the accepted quote'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_AMOUNT_CURRENCY_MISMATCH';
  end if;
  if v_request.status = 'paid' then
    select id into v_verification_id
    from public.research_assisted_order_payment_verifications
    where request_id = v_request.id and observation_id = p_observation_id;
    if found then
      return pg_catalog.jsonb_build_object(
        'verificationId', v_verification_id, 'requestId', v_request.id,
        'state', 'paid', 'replayed', true);
    end if;
  end if;
  if v_request.status <> 'payment_review' then
    raise exception 'Request is not in payment review'
      using errcode = 'P0001', detail = 'ASSISTED_ORDER_PAYMENT_REVIEW_REQUIRED';
  end if;
  insert into public.research_assisted_order_payment_verifications (
    request_id, quote_id, quote_version, acceptance_id, observation_id,
    expected_amount_cents, expected_currency, observed_amount_cents,
    observed_currency, payment_reference, method, provider_name,
    provider_event_id, provider_payment_id, verified_by
  ) values (
    v_request.id, v_quote.id, v_quote.version, v_quote.acceptance_id,
    v_observation.id, v_quote.total_cents, v_quote.currency,
    v_observation.observed_amount_cents, v_observation.observed_currency,
    v_observation.payment_reference, v_observation.method,
    v_observation.provider_name, v_observation.provider_event_id,
    v_observation.provider_payment_id, v_actor_label
  ) returning id into v_verification_id;

  perform public.research_assisted_order_set_status(
    v_request.id, 'payment_review', 'paid', v_actor_label,
    case when v_observation.method = 'manual' then 'admin' else 'system' end,
    'Payment verification recorded.', null,
    pg_catalog.jsonb_build_object('paymentVerificationId', v_verification_id),
    now()
  );
  return pg_catalog.jsonb_build_object(
    'verificationId', v_verification_id, 'requestId', v_request.id,
    'state', 'paid', 'replayed', false);
end
$verify$;

revoke all on function public.research_assisted_order_payment_verify(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.research_assisted_order_payment_verify(uuid, uuid)
  to service_role;

do $postcondition$
declare v_table text;
declare v_rls boolean;
declare v_forced boolean;
begin
  foreach v_table in array array[
    'research_assisted_order_quotes',
    'research_assisted_order_payment_verifier_grants',
    'research_assisted_order_payment_observations',
    'research_assisted_order_payment_verifications'
  ] loop
    select relrowsecurity, relforcerowsecurity into v_rls, v_forced
    from pg_catalog.pg_class where oid = pg_catalog.to_regclass('public.' || v_table);
    if v_rls is distinct from true or v_forced is distinct from true then
      raise exception 'HL-12 postcondition: RLS missing on %', v_table using errcode = '55000';
    end if;
    if has_table_privilege('anon', 'public.' || v_table, 'SELECT')
       or has_table_privilege('authenticated', 'public.' || v_table, 'SELECT')
       or has_table_privilege('service_role', 'public.' || v_table, 'INSERT') then
      raise exception 'HL-12 postcondition: direct table grant on %', v_table using errcode = '55000';
    end if;
  end loop;
  if has_function_privilege('anon',
       'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)', 'EXECUTE')
     or has_function_privilege('authenticated',
       'public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)', 'EXECUTE')
     or not has_function_privilege('service_role',
       'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)', 'EXECUTE') then
    raise exception 'HL-12 postcondition: quote RPC ACL broken' using errcode = '55000';
  end if;
end
$postcondition$;

commit;
