-- Website 4 post-takeover, commit 2: affiliate, professional, CRM, Lawrence,
-- and operational summary foundations. No customer PII is persisted in the
-- affiliate domain. Commercial events and statements are append-only.

create extension if not exists pgcrypto;

create table if not exists public.research_affiliate_partners (
  id uuid primary key default gen_random_uuid(),
  partner_code text not null unique check (partner_code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
  display_name text not null check (length(btrim(display_name)) between 2 and 120),
  state text not null check (state in ('invited','under_review','active','paused','disabled')),
  disclosure text,
  agreement_reference text,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  constraint research_affiliate_active_evidence check (
    state <> 'active'
    or (disclosure is not null and agreement_reference is not null)
  )
);

create table if not exists public.research_affiliate_links (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_affiliate_partners(id),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'),
  destination_path text not null check (
    destination_path like '/%' and destination_path not like '//%'
  ),
  campaign text,
  state text not null check (state in ('active','paused')),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null
);

create index if not exists research_affiliate_links_partner_idx
  on public.research_affiliate_links(partner_id, state);

create table if not exists public.research_affiliate_attribution_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_affiliate_partners(id),
  link_id uuid not null references public.research_affiliate_links(id),
  order_id uuid not null unique,
  order_economics_version bigint not null check (order_economics_version > 0),
  captured_cents bigint not null check (captured_cents >= 0),
  refunded_cents bigint not null check (
    refunded_cents >= 0 and refunded_cents <= captured_cents
  ),
  eligible_revenue_cents bigint not null check (eligible_revenue_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  occurred_at timestamptz not null,
  recorded_by uuid not null,
  recorded_at timestamptz not null default now()
);

create table if not exists public.research_affiliate_commission_events (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_affiliate_partners(id),
  attribution_event_id uuid not null references public.research_affiliate_attribution_events(id),
  prior_event_id uuid references public.research_affiliate_commission_events(id),
  action text not null check (action in (
    'accrue','approve','make_payable','mark_paid','reverse','dispute'
  )),
  state text not null check (state in (
    'pending','approved','payable','paid','reversed','disputed'
  )),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  agreement_reference text not null,
  lawrence_configuration_id uuid not null,
  lawrence_configuration_version bigint not null check (
    lawrence_configuration_version > 0
  ),
  eligible_revenue_cents bigint not null check (eligible_revenue_cents >= 0),
  source_refunded_cents bigint not null check (source_refunded_cents >= 0),
  payout_provider text,
  payout_reference text,
  reason text,
  version bigint not null check (version > 0),
  occurred_at timestamptz not null,
  recorded_by uuid not null,
  constraint research_affiliate_commission_payout_evidence check (
    (
      action = 'mark_paid'
      and length(btrim(payout_provider)) between 2 and 100
      and length(btrim(payout_reference)) between 3 and 200
    )
    or (
      action <> 'mark_paid'
      and payout_provider is null
      and payout_reference is null
    )
  ),
  unique (attribution_event_id, version)
);

create index if not exists research_affiliate_commission_partner_idx
  on public.research_affiliate_commission_events(partner_id, state, occurred_at);

create table if not exists public.research_affiliate_statements (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_affiliate_partners(id),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  gross_commission_cents bigint not null check (gross_commission_cents >= 0),
  reversal_cents bigint not null check (reversal_cents >= 0),
  payable_cents bigint not null check (payable_cents >= 0),
  state text not null default 'issued' check (state in ('issued','superseded')),
  version bigint not null check (version > 0),
  supersedes_statement_id uuid references public.research_affiliate_statements(id),
  issued_by uuid not null,
  issued_at timestamptz not null,
  unique (partner_id, period_start, period_end, currency, version)
);

create table if not exists public.research_affiliate_statement_items (
  id uuid primary key default gen_random_uuid(),
  statement_id uuid not null references public.research_affiliate_statements(id),
  commission_event_id uuid not null references public.research_affiliate_commission_events(id),
  attribution_event_id uuid not null references public.research_affiliate_attribution_events(id),
  item_kind text not null check (item_kind in ('commission','reversal','payable')),
  amount_cents bigint not null check (amount_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  included_at timestamptz not null,
  unique (statement_id, commission_event_id, item_kind)
);

create table if not exists public.research_professional_accounts (
  id uuid primary key default gen_random_uuid(),
  legal_name text not null check (length(btrim(legal_name)) between 2 and 200),
  account_type text not null check (account_type in (
    'wholesale','reseller','professional_membership','education',
    'directory','implementation','software'
  )),
  state text not null check (state in (
    'prospect','discovery','diligence','commercial_review',
    'agreement','active','paused','closed'
  )),
  agreement_reference text,
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null,
  constraint research_professional_active_evidence check (
    state <> 'active' or agreement_reference is not null
  )
);

create table if not exists public.research_operations_crm_accounts (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('supplier','affiliate','professional')),
  domain_record_id uuid not null,
  state text not null,
  next_action text,
  owner_role text not null check (owner_role in ('operations_admin','internal_team','super_admin')),
  version bigint not null default 1 check (version > 0),
  updated_by uuid not null,
  updated_at timestamptz not null,
  unique (domain, domain_record_id)
);

create table if not exists public.research_lawrence_configurations (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.research_affiliate_partners(id),
  partner_code text not null,
  prior_configuration_id uuid references public.research_lawrence_configurations(id),
  agreement_version text not null,
  attribution_window_days integer not null check (attribution_window_days between 0 and 365),
  hold_days integer not null check (hold_days between 0 and 365),
  payout_threshold_cents bigint not null check (payout_threshold_cents >= 0),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  tiers jsonb not null check (jsonb_typeof(tiers) = 'array' and jsonb_array_length(tiers) between 1 and 20),
  activation_bounty_cents bigint check (activation_bounty_cents is null or activation_bounty_cents >= 0),
  optional_retainer_cents bigint check (optional_retainer_cents is null or optional_retainer_cents >= 0),
  state text not null check (state in ('draft','under_review','active','superseded')),
  version bigint not null default 1 check (version > 0),
  created_by uuid not null,
  created_at timestamptz not null,
  updated_by uuid not null,
  updated_at timestamptz not null
  ,unique (partner_id, version)
);

create unique index if not exists research_lawrence_one_current_idx
  on public.research_lawrence_configurations(partner_id)
  where state <> 'superseded';

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'research_affiliate_commission_lawrence_fk'
       and conrelid = 'public.research_affiliate_commission_events'::regclass
  ) then
    alter table public.research_affiliate_commission_events
      add constraint research_affiliate_commission_lawrence_fk
      foreign key (lawrence_configuration_id)
      references public.research_lawrence_configurations(id);
  end if;
end;
$$;

create table if not exists public.research_commercial_events (
  id uuid primary key default gen_random_uuid(),
  domain text not null check (domain in ('affiliate','professional','lawrence','crm')),
  record_id uuid not null,
  action text not null,
  idempotency_key_hash text not null unique check (length(idempotency_key_hash) = 64),
  command_hash text not null check (length(command_hash) = 64),
  actor_scope_hash text not null check (length(actor_scope_hash) = 64),
  prior_version bigint not null check (prior_version >= 0),
  result_version bigint not null check (result_version > 0),
  redacted_result jsonb not null check (jsonb_typeof(redacted_result) = 'object'),
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now()
);

create or replace function public.research_commercial_immutable()
returns trigger language plpgsql security definer set search_path = pg_catalog
as $$ begin raise exception 'commercial evidence is immutable'; end; $$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'research_affiliate_attribution_events',
    'research_affiliate_commission_events',
    'research_affiliate_statement_items',
    'research_commercial_events'
  ] loop
    execute format('drop trigger if exists %I on public.%I', v_table || '_immutable', v_table);
    execute format(
      'create trigger %I before update or delete on public.%I for each row execute function public.research_commercial_immutable()',
      v_table || '_immutable', v_table
    );
  end loop;
end;
$$;

create or replace function public.research_lawrence_supersession_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Lawrence configuration versions are immutable';
  end if;
  if current_setting('xenios.lawrence_supersession', true)
       is distinct from 'allowed'
     or old.state = 'superseded'
     or new.state <> 'superseded'
     or (
       to_jsonb(new) - array['state', 'updated_by', 'updated_at']
     ) <> (
       to_jsonb(old) - array['state', 'updated_by', 'updated_at']
     )
     or new.updated_by is null
     or new.updated_at < old.updated_at then
    raise exception 'Lawrence configuration versions are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists research_lawrence_configurations_immutable
  on public.research_lawrence_configurations;
create trigger research_lawrence_configurations_immutable
before update or delete on public.research_lawrence_configurations
for each row execute function public.research_lawrence_supersession_guard();

create or replace function public.research_affiliate_statement_supersession_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'affiliate statements are immutable';
  end if;
  if current_setting('xenios.statement_supersession', true)
       is distinct from 'allowed'
     or old.state <> 'issued'
     or new.state <> 'superseded'
     or (to_jsonb(new) - 'state') <> (to_jsonb(old) - 'state') then
    raise exception 'affiliate statements are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists research_affiliate_statements_supersession_guard
  on public.research_affiliate_statements;
create trigger research_affiliate_statements_supersession_guard
before update or delete on public.research_affiliate_statements
for each row execute function public.research_affiliate_statement_supersession_guard();

create or replace function public.research_commercial_replay(
  p_key_hash text, p_command_hash text, p_actor_hash text
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_event public.research_commercial_events%rowtype;
begin
  select * into v_event from public.research_commercial_events
   where idempotency_key_hash = p_key_hash;
  if not found then return null; end if;
  if v_event.command_hash <> p_command_hash or v_event.actor_scope_hash <> p_actor_hash then
    raise exception 'idempotency key conflicts with another commercial command';
  end if;
  return v_event.redacted_result || jsonb_build_object('idempotentReplay', true);
end;
$$;

create or replace function public.research_affiliate_paid_order_economics(
  p_order_id uuid,
  p_at timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_economics jsonb;
begin
  if p_order_id is null or p_at is null
     or to_regprocedure(
       'public.research_commerce_paid_order_economics(uuid,timestamp with time zone)'
     ) is null then
    raise exception 'canonical paid-order economics boundary is unavailable';
  end if;
  execute
    'select public.research_commerce_paid_order_economics($1, $2)'
    into v_economics
    using p_order_id, p_at;
  if jsonb_typeof(v_economics) <> 'object'
     or v_economics->>'orderId' <> p_order_id::text
     or coalesce(v_economics->>'affiliateLinkId', '') !~
       '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
     or v_economics->>'state' not in ('paid','partially_refunded','refunded')
     or coalesce(v_economics->>'capturedCents', '') !~ '^[0-9]+$'
     or coalesce(v_economics->>'refundedCents', '') !~ '^[0-9]+$'
     or (v_economics->>'refundedCents')::bigint >
        (v_economics->>'capturedCents')::bigint
     or coalesce(v_economics->>'currency', '') !~ '^[A-Z]{3}$'
     or coalesce(v_economics->>'version', '') !~ '^[1-9][0-9]*$' then
    raise exception 'canonical paid-order economics evidence is invalid';
  end if;
  return v_economics;
end;
$$;

create or replace function public.research_affiliate_calculate_commission(
  p_eligible_revenue_cents bigint,
  p_tiers jsonb
)
returns bigint
language plpgsql
immutable
security definer
set search_path = pg_catalog
as $$
declare
  v_rate integer;
begin
  if p_eligible_revenue_cents is null or p_eligible_revenue_cents < 0
     or jsonb_typeof(p_tiers) <> 'array' then
    raise exception 'affiliate commission evidence is invalid';
  end if;
  select (tier->>'rateBasisPoints')::integer
    into v_rate
    from jsonb_array_elements(p_tiers) tier
   where coalesce(tier->>'thresholdCents', '') ~ '^[0-9]+$'
     and coalesce(tier->>'rateBasisPoints', '') ~ '^[0-9]+$'
     and (tier->>'thresholdCents')::bigint <= p_eligible_revenue_cents
     and (tier->>'rateBasisPoints')::integer between 0 and 10000
   order by (tier->>'thresholdCents')::bigint desc
   limit 1;
  if v_rate is null then
    raise exception 'affiliate commission tier is unavailable';
  end if;
  return (p_eligible_revenue_cents * v_rate) / 10000;
end;
$$;

create or replace function public.research_affiliate_configure_partner(
  p_actor_auth_user_id uuid, p_partner_id uuid, p_partner_code text,
  p_display_name text, p_state text, p_disclosure text,
  p_agreement_reference text, p_expected_version bigint,
  p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_row public.research_affiliate_partners%rowtype;
  v_id uuid; v_version bigint; v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_code !~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'
     or nullif(btrim(p_display_name), '') is null
     or p_state not in ('invited','under_review','active','paused','disabled')
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'affiliate partner input is invalid';
  end if;
  if p_state = 'active' and (nullif(btrim(p_disclosure), '') is null or nullif(btrim(p_agreement_reference), '') is null) then
    raise exception 'active affiliate requires disclosure and agreement evidence';
  end if;
  v_key := public.research_fulfillment_key_hash('affiliate-partner:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('affiliate-partner:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'partnerCode', p_partner_code, 'displayName', btrim(p_display_name),
    'state', p_state, 'disclosure', nullif(btrim(p_disclosure), ''),
    'agreementReference', nullif(btrim(p_agreement_reference), ''),
    'expectedVersion', p_expected_version, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  if p_partner_id is not null then
    select * into v_row from public.research_affiliate_partners where id = p_partner_id for update;
  else
    select * into v_row from public.research_affiliate_partners where partner_code = p_partner_code for update;
  end if;
  if v_row.id is not null then
    if v_row.version <> p_expected_version then raise exception 'affiliate partner version conflict'; end if;
    update public.research_affiliate_partners set
      partner_code = p_partner_code, display_name = btrim(p_display_name), state = p_state,
      disclosure = nullif(btrim(p_disclosure), ''),
      agreement_reference = nullif(btrim(p_agreement_reference), ''),
      version = version + 1, updated_by = p_actor_auth_user_id, updated_at = p_at
    where id = v_row.id returning id, version into v_id, v_version;
  else
    if p_expected_version <> 0 then raise exception 'affiliate partner not found'; end if;
    v_id := coalesce(p_partner_id, gen_random_uuid()); v_version := 1;
    insert into public.research_affiliate_partners(
      id, partner_code, display_name, state, disclosure, agreement_reference,
      version, created_by, created_at, updated_by, updated_at
    ) values (
      v_id, p_partner_code, btrim(p_display_name), p_state,
      nullif(btrim(p_disclosure), ''), nullif(btrim(p_agreement_reference), ''),
      1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  end if;
  v_result := jsonb_build_object('recordId', v_id, 'state', p_state, 'version', v_version, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'affiliate', v_id, 'partner_configured', v_key, v_hash, v_actor,
    p_expected_version, v_version, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_affiliate_create_link(
  p_actor_auth_user_id uuid, p_partner_id uuid, p_code text,
  p_destination_path text, p_campaign text, p_expected_version bigint,
  p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare v_key text; v_hash text; v_actor text; v_replay jsonb; v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_id is null or p_code !~ '^[A-Z0-9][A-Z0-9_-]{2,63}$'
     or p_destination_path not like '/%' or p_destination_path like '//%'
     or p_expected_version <> 0 or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'affiliate link input is invalid';
  end if;
  v_key := public.research_fulfillment_key_hash('affiliate-link:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('affiliate-link:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'code', p_code, 'destinationPath', p_destination_path,
    'campaign', nullif(btrim(p_campaign), ''), 'expectedVersion', p_expected_version, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.research_affiliate_partners where id = p_partner_id and state = 'active' for update;
  if not found then raise exception 'affiliate partner is not active'; end if;
  insert into public.research_affiliate_links(
    id, partner_id, code, destination_path, campaign, state, version,
    created_by, created_at, updated_by, updated_at
  ) values (
    v_id, p_partner_id, p_code, p_destination_path, nullif(btrim(p_campaign), ''),
    'active', 1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
  );
  v_result := jsonb_build_object('recordId', v_id, 'state', 'active', 'version', 1, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'affiliate', v_id, 'link_created', v_key, v_hash, v_actor,
    0, 1, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_affiliate_record_attribution(
  p_actor_auth_user_id uuid, p_partner_id uuid, p_link_id uuid,
  p_order_id uuid, p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_economics jsonb; v_captured bigint; v_refunded bigint;
  v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_id is null or p_link_id is null or p_order_id is null
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'attribution input is invalid';
  end if;
  v_key := public.research_fulfillment_key_hash('affiliate-attribution:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('affiliate-attribution:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'linkId', p_link_id,
    'orderId', p_order_id, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-partner:v1|' || p_partner_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-paid-order:v1|' || p_order_id::text, 0
  ));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  perform 1 from public.research_affiliate_links l
    join public.research_affiliate_partners p on p.id = l.partner_id
   where l.id = p_link_id and l.partner_id = p_partner_id
     and l.state = 'active' and p.state = 'active'
   for update of l, p;
  if not found then raise exception 'affiliate link is unavailable'; end if;
  v_economics := public.research_affiliate_paid_order_economics(p_order_id, p_at);
  if (v_economics->>'affiliateLinkId')::uuid <> p_link_id then
    raise exception 'paid order attribution is outside the affiliate link';
  end if;
  v_captured := (v_economics->>'capturedCents')::bigint;
  v_refunded := (v_economics->>'refundedCents')::bigint;
  if exists (
    select 1 from public.research_affiliate_attribution_events
     where order_id = p_order_id
  ) then raise exception 'paid order was already attributed'; end if;
  insert into public.research_affiliate_attribution_events(
    id, partner_id, link_id, order_id, order_economics_version,
    captured_cents, refunded_cents, eligible_revenue_cents,
    currency, occurred_at, recorded_by
  ) values (
    v_id, p_partner_id, p_link_id, p_order_id,
    (v_economics->>'version')::bigint,
    v_captured, v_refunded, v_captured - v_refunded,
    v_economics->>'currency', p_at, p_actor_auth_user_id
  );
  v_result := jsonb_build_object('recordId', v_id, 'state', 'recorded', 'version', 1, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'affiliate', v_id, 'attribution_recorded', v_key, v_hash, v_actor,
    0, 1, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

drop function if exists public.research_affiliate_record_commission(
  uuid, uuid, uuid, text, text, text, timestamptz
);

create or replace function public.research_affiliate_record_commission(
  p_actor_auth_user_id uuid, p_partner_id uuid, p_attribution_event_id uuid,
  p_action text, p_reason text, p_payout_provider text, p_payout_reference text,
  p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_attribution public.research_affiliate_attribution_events%rowtype;
  v_prior public.research_affiliate_commission_events%rowtype;
  v_terms public.research_lawrence_configurations%rowtype;
  v_economics jsonb; v_eligible bigint; v_derived bigint;
  v_amount bigint; v_refunded bigint; v_partner_unpaid bigint;
  v_payout_provider text; v_payout_reference text;
  v_state text; v_version bigint; v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_id is null or p_attribution_event_id is null
     or p_action not in ('accrue','approve','make_payable','mark_paid','reverse','dispute')
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'commission input is invalid';
  end if;
  if p_action in ('reverse','dispute') and nullif(btrim(p_reason), '') is null then
    raise exception 'commission correction requires a reason';
  end if;
  if p_action = 'mark_paid' then
    v_payout_provider := nullif(btrim(p_payout_provider), '');
    v_payout_reference := nullif(btrim(p_payout_reference), '');
    if v_payout_provider is null
       or v_payout_reference is null
       or length(v_payout_provider) not between 2 and 100
       or length(v_payout_reference) not between 3 and 200 then
      raise exception 'paid commission requires immutable payout evidence';
    end if;
  elsif p_payout_provider is not null or p_payout_reference is not null then
    raise exception 'payout evidence is valid only for paid commission evidence';
  end if;
  v_key := public.research_fulfillment_key_hash('affiliate-commission:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('affiliate-commission:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'attributionEventId', p_attribution_event_id,
    'action', p_action, 'reason', nullif(btrim(p_reason), ''),
    'payoutProvider', v_payout_provider, 'payoutReference', v_payout_reference,
    'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-partner:v1|' || p_partner_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-commission:v1|' || p_attribution_event_id::text, 0
  ));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  select * into v_attribution
    from public.research_affiliate_attribution_events
   where id = p_attribution_event_id and partner_id = p_partner_id
   for update;
  if not found then raise exception 'attribution is outside the affiliate'; end if;
  v_economics := public.research_affiliate_paid_order_economics(
    v_attribution.order_id,
    p_at
  );
  if (v_economics->>'affiliateLinkId')::uuid <> v_attribution.link_id
     or v_economics->>'currency' <> v_attribution.currency then
    raise exception 'paid-order economics no longer match the attribution';
  end if;
  v_refunded := (v_economics->>'refundedCents')::bigint;
  v_eligible := (v_economics->>'capturedCents')::bigint - v_refunded;
  select * into v_prior from public.research_affiliate_commission_events
   where attribution_event_id = p_attribution_event_id
   order by version desc limit 1 for update;
  if not found then
    if p_action <> 'accrue' then raise exception 'commission must begin with accrual'; end if;
    select * into v_terms
      from public.research_lawrence_configurations
     where partner_id = p_partner_id and state = 'active'
     order by version desc
     limit 1
     for update;
    if not found then
      raise exception 'immutable active Lawrence terms are required';
    end if;
    v_amount := public.research_affiliate_calculate_commission(
      v_eligible,
      v_terms.tiers
    );
    v_state := 'pending'; v_version := 1;
  else
    select * into v_terms
      from public.research_lawrence_configurations
     where id = v_prior.lawrence_configuration_id
       and partner_id = p_partner_id
       and version = v_prior.lawrence_configuration_version
     for update;
    if not found then
      raise exception 'immutable Lawrence terms are unavailable';
    end if;
    if p_at < v_prior.occurred_at then
      raise exception 'commission transition timestamp is not monotonic';
    end if;
    v_derived := public.research_affiliate_calculate_commission(
      v_eligible,
      v_terms.tiers
    );
    v_state := case
      when v_prior.state = 'pending' and p_action = 'approve' then 'approved'
      when v_prior.state = 'approved' and p_action = 'make_payable' then 'payable'
      when v_prior.state = 'payable' and p_action = 'mark_paid' then 'paid'
      when v_prior.state in ('pending','approved','payable','paid') and p_action = 'reverse' then 'reversed'
      when v_prior.state in ('pending','approved','payable') and p_action = 'dispute' then 'disputed'
      else null
    end;
    if v_state is null then raise exception 'invalid commission transition'; end if;
    if p_action = 'make_payable' then
      if p_at < v_attribution.occurred_at + make_interval(days => v_terms.hold_days) then
        raise exception 'configured commission hold period has not elapsed';
      end if;
      select coalesce(sum(latest.amount_cents), 0)
        into v_partner_unpaid
        from (
          select distinct on (attribution_event_id)
            attribution_event_id, amount_cents, state
          from public.research_affiliate_commission_events
          where partner_id = p_partner_id
            and currency = v_attribution.currency
          order by attribution_event_id, version desc
        ) latest
       where latest.state in ('approved', 'payable');
      if v_partner_unpaid < v_terms.payout_threshold_cents then
        raise exception 'configured payout threshold has not been met';
      end if;
    end if;
    if p_action = 'reverse' then
      if v_refunded <= v_prior.source_refunded_cents
         or v_derived > v_prior.amount_cents then
        raise exception 'paid-order refund does not support a reversal';
      end if;
      v_amount := v_prior.amount_cents - v_derived;
    else
      if v_refunded <> v_prior.source_refunded_cents
         or v_derived <> v_prior.amount_cents then
        raise exception 'paid-order economics changed; reverse before advancing';
      end if;
      v_amount := v_prior.amount_cents;
    end if;
    v_version := v_prior.version + 1;
  end if;
  insert into public.research_affiliate_commission_events(
    id, partner_id, attribution_event_id, prior_event_id, action, state,
    amount_cents, currency, agreement_reference,
    lawrence_configuration_id, lawrence_configuration_version,
    eligible_revenue_cents, source_refunded_cents,
    payout_provider, payout_reference, reason,
    version, occurred_at, recorded_by
  ) values (
    v_id, p_partner_id, p_attribution_event_id, v_prior.id, p_action, v_state,
    v_amount, v_attribution.currency, v_terms.agreement_version,
    v_terms.id, v_terms.version, v_eligible, v_refunded,
    v_payout_provider, v_payout_reference, nullif(btrim(p_reason), ''),
    v_version, p_at, p_actor_auth_user_id
  );
  v_result := jsonb_build_object('recordId', v_id, 'state', v_state, 'version', v_version, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'affiliate', v_id, 'commission_' || p_action, v_key, v_hash, v_actor,
    v_version - 1, v_version, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_affiliate_publish_statement(
  p_actor_auth_user_id uuid, p_partner_id uuid,
  p_period_start date, p_period_end date, p_currency text,
  p_supersedes_statement_id uuid,
  p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_prior public.research_affiliate_statements%rowtype;
  v_gross bigint; v_reversal bigint; v_payable bigint;
  v_version bigint; v_item_count bigint;
  v_id uuid := gen_random_uuid(); v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_id is null or p_period_start is null or p_period_end < p_period_start
     or p_currency !~ '^[A-Z]{3}$'
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'statement input is invalid';
  end if;
  v_key := public.research_fulfillment_key_hash('affiliate-statement:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('affiliate-statement:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'periodStart', p_period_start,
    'periodEnd', p_period_end, 'currency', p_currency,
    'supersedesStatementId', p_supersedes_statement_id, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-partner:v1|' || p_partner_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-statement:v1|' || p_partner_id::text || '|' || p_period_start || '|' || p_period_end || '|' || p_currency,
    0
  ));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  select * into v_prior
    from public.research_affiliate_statements
   where partner_id = p_partner_id and period_start = p_period_start
     and period_end = p_period_end and currency = p_currency
     and state = 'issued'
   order by version desc
   limit 1
   for update;
  if found and p_supersedes_statement_id is distinct from v_prior.id then
    raise exception 'exact issued statement supersession is required';
  elsif not found and p_supersedes_statement_id is not null then
    raise exception 'superseded statement is unavailable';
  end if;
  if exists (
    select 1
      from public.research_affiliate_statements statement
     where statement.partner_id = p_partner_id
       and statement.currency = p_currency
       and statement.state = 'issued'
       and statement.period_start <= p_period_end
       and statement.period_end >= p_period_start
       and (v_prior.id is null or statement.id <> v_prior.id)
  ) then
    raise exception 'active affiliate statement periods cannot overlap';
  end if;
  v_version := coalesce(v_prior.version, 0) + 1;
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-commission:v1|' || attribution_event_id::text, 0
  ))
  from (
    select attribution.id as attribution_event_id
      from public.research_affiliate_attribution_events attribution
     where attribution.partner_id = p_partner_id
       and attribution.currency = p_currency
       and attribution.occurred_at::date between p_period_start and p_period_end
     order by attribution.id
  ) locked_attributions;
  if exists (
    select 1
      from public.research_affiliate_statement_items item
      join public.research_affiliate_statements statement
        on statement.id = item.statement_id
      join public.research_affiliate_attribution_events attribution
        on attribution.id = item.attribution_event_id
     where attribution.partner_id = p_partner_id
       and attribution.currency = p_currency
       and attribution.occurred_at::date between p_period_start and p_period_end
       and statement.state = 'issued'
       and (v_prior.id is null or statement.id <> v_prior.id)
  ) then
    raise exception 'attribution already belongs to an active statement lineage';
  end if;
  with latest as (
    select distinct on (commission.attribution_event_id) commission.*
      from public.research_affiliate_commission_events commission
      join public.research_affiliate_attribution_events attribution
        on attribution.id = commission.attribution_event_id
     where commission.partner_id = p_partner_id
       and commission.currency = p_currency
       and attribution.occurred_at::date between p_period_start and p_period_end
     order by commission.attribution_event_id, commission.version desc
  )
  select
    coalesce(sum(amount_cents) filter (where state in ('approved','payable','paid')), 0),
    coalesce(sum(amount_cents) filter (where state = 'reversed'), 0),
    coalesce(sum(amount_cents) filter (where state = 'payable'), 0)
  into v_gross, v_reversal, v_payable from latest;
  insert into public.research_affiliate_statements(
    id, partner_id, period_start, period_end, currency,
    gross_commission_cents, reversal_cents, payable_cents,
    state, version, supersedes_statement_id, issued_by, issued_at
  ) values (
    v_id, p_partner_id, p_period_start, p_period_end, p_currency,
    v_gross, v_reversal, v_payable, 'issued', v_version,
    v_prior.id, p_actor_auth_user_id, p_at
  );
  with latest as (
    select distinct on (commission.attribution_event_id) commission.*
      from public.research_affiliate_commission_events commission
      join public.research_affiliate_attribution_events attribution
        on attribution.id = commission.attribution_event_id
     where commission.partner_id = p_partner_id
       and commission.currency = p_currency
       and attribution.occurred_at::date between p_period_start and p_period_end
     order by commission.attribution_event_id, commission.version desc
  )
  insert into public.research_affiliate_statement_items(
    id, statement_id, commission_event_id, attribution_event_id,
    item_kind, amount_cents, currency, included_at
  )
  select
    gen_random_uuid(), v_id, id, attribution_event_id,
    case
      when state = 'reversed' then 'reversal'
      when state = 'payable' then 'payable'
      else 'commission'
    end,
    amount_cents, currency, p_at
  from latest
  where state in ('approved','payable','paid','reversed');
  get diagnostics v_item_count = row_count;
  if v_prior.id is not null then
    perform set_config('xenios.statement_supersession', 'allowed', true);
    update public.research_affiliate_statements
       set state = 'superseded'
     where id = v_prior.id and state = 'issued';
    perform set_config('xenios.statement_supersession', '', true);
    if not found then
      raise exception 'issued statement supersession conflict';
    end if;
  end if;
  v_result := jsonb_build_object(
    'recordId', v_id, 'state', 'issued', 'version', v_version,
    'itemCount', v_item_count, 'idempotentReplay', false
  );
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'affiliate', v_id, 'statement_issued', v_key, v_hash, v_actor,
    v_version - 1, v_version, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_operations_configure_professional(
  p_actor_auth_user_id uuid, p_account_id uuid, p_legal_name text,
  p_account_type text, p_state text, p_agreement_reference text,
  p_expected_version bigint, p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_row public.research_professional_accounts%rowtype;
  v_id uuid; v_version bigint; v_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if nullif(btrim(p_legal_name), '') is null
     or p_account_type not in ('wholesale','reseller','professional_membership','education','directory','implementation','software')
     or p_state not in ('prospect','discovery','diligence','commercial_review','agreement','active','paused','closed')
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'professional account input is invalid';
  end if;
  if p_state = 'active' and nullif(btrim(p_agreement_reference), '') is null then
    raise exception 'active professional account requires agreement evidence';
  end if;
  v_key := public.research_fulfillment_key_hash('professional:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('professional:v1', jsonb_build_object(
    'accountId', p_account_id, 'legalName', btrim(p_legal_name),
    'accountType', p_account_type, 'state', p_state,
    'agreementReference', nullif(btrim(p_agreement_reference), ''),
    'expectedVersion', p_expected_version, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  if p_account_id is not null then
    select * into v_row from public.research_professional_accounts where id = p_account_id for update;
  end if;
  if v_row.id is not null then
    if v_row.version <> p_expected_version then raise exception 'professional account version conflict'; end if;
    update public.research_professional_accounts set
      legal_name = btrim(p_legal_name), account_type = p_account_type, state = p_state,
      agreement_reference = nullif(btrim(p_agreement_reference), ''),
      version = version + 1, updated_by = p_actor_auth_user_id, updated_at = p_at
    where id = v_row.id returning id, version into v_id, v_version;
  else
    if p_expected_version <> 0 then raise exception 'professional account not found'; end if;
    v_id := coalesce(p_account_id, gen_random_uuid()); v_version := 1;
    insert into public.research_professional_accounts(
      id, legal_name, account_type, state, agreement_reference, version,
      created_by, created_at, updated_by, updated_at
    ) values (
      v_id, btrim(p_legal_name), p_account_type, p_state,
      nullif(btrim(p_agreement_reference), ''), 1,
      p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  end if;
  insert into public.research_operations_crm_accounts(
    domain, domain_record_id, state, owner_role, version, updated_by, updated_at
  ) values (
    'professional', v_id, p_state, 'operations_admin', 1, p_actor_auth_user_id, p_at
  )
  on conflict (domain, domain_record_id) do update set
    state = excluded.state, version = public.research_operations_crm_accounts.version + 1,
    updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  v_result := jsonb_build_object('recordId', v_id, 'state', p_state, 'version', v_version, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'professional', v_id, 'account_configured', v_key, v_hash, v_actor,
    p_expected_version, v_version, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_operations_configure_lawrence(
  p_actor_auth_user_id uuid, p_partner_id uuid, p_agreement_version text,
  p_attribution_window_days integer, p_hold_days integer,
  p_payout_threshold_cents bigint, p_currency text, p_tiers jsonb,
  p_activation_bounty_cents bigint, p_optional_retainer_cents bigint,
  p_state text, p_expected_version bigint, p_idempotency_key text, p_at timestamptz
)
returns jsonb language plpgsql security definer set search_path = pg_catalog
as $$
declare
  v_key text; v_hash text; v_actor text; v_replay jsonb;
  v_row public.research_lawrence_configurations%rowtype;
  v_partner public.research_affiliate_partners%rowtype;
  v_id uuid; v_version bigint; v_result jsonb;
  v_supersession_key text; v_supersession_result jsonb;
begin
  if not public.research_fulfillment_internal_actor(p_actor_auth_user_id) then raise exception 'commercial actor is not authorized'; end if;
  if p_partner_id is null or nullif(btrim(p_agreement_version), '') is null
     or p_attribution_window_days not between 0 and 365 or p_hold_days not between 0 and 365
     or p_payout_threshold_cents is null or p_payout_threshold_cents < 0
     or p_currency !~ '^[A-Z]{3}$' or jsonb_typeof(p_tiers) <> 'array'
     or jsonb_array_length(p_tiers) not between 1 and 20
     or p_state not in ('draft','under_review','active')
     or p_expected_version is null or p_expected_version < 0
     or p_idempotency_key !~ '^[A-Za-z0-9:_./-]{8,200}$' or p_at is null then
    raise exception 'Lawrence configuration input is invalid';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_tiers) tier
     where jsonb_typeof(tier) <> 'object'
       or (tier->>'thresholdCents')::bigint < 0
       or (tier->>'rateBasisPoints')::integer not between 0 and 10000
  ) then raise exception 'Lawrence tiers are invalid'; end if;
  v_key := public.research_fulfillment_key_hash('lawrence:v1', p_idempotency_key);
  v_hash := public.research_fulfillment_command_hash('lawrence:v1', jsonb_build_object(
    'partnerId', p_partner_id, 'agreementVersion', btrim(p_agreement_version),
    'attributionWindowDays', p_attribution_window_days, 'holdDays', p_hold_days,
    'payoutThresholdCents', p_payout_threshold_cents, 'currency', p_currency,
    'tiers', p_tiers, 'activationBountyCents', p_activation_bounty_cents,
    'optionalRetainerCents', p_optional_retainer_cents,
    'state', p_state, 'expectedVersion', p_expected_version, 'at', p_at
  ));
  v_actor := public.research_fulfillment_actor_hash(p_actor_auth_user_id);
  perform pg_advisory_xact_lock(hashtextextended('xenios:commercial-key:v1|' || v_key, 0));
  perform pg_advisory_xact_lock(hashtextextended(
    'xenios:affiliate-partner:v1|' || p_partner_id::text, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended('xenios:lawrence:v1|' || p_partner_id::text, 0));
  v_replay := public.research_commercial_replay(v_key, v_hash, v_actor);
  if v_replay is not null then return v_replay; end if;
  select * into v_partner from public.research_affiliate_partners
   where id = p_partner_id for update;
  if not found then raise exception 'Lawrence affiliate partner is unavailable'; end if;
  if p_state = 'active' and (v_partner.state <> 'active' or v_partner.agreement_reference is null) then
    raise exception 'active Lawrence terms require an active contracted partner';
  end if;
  select * into v_row from public.research_lawrence_configurations
    where partner_id = p_partner_id
      and state <> 'superseded'
    for update;
  if found then
    if v_row.version <> p_expected_version then raise exception 'Lawrence configuration version conflict'; end if;
    perform set_config('xenios.lawrence_supersession', 'allowed', true);
    update public.research_lawrence_configurations
       set state = 'superseded',
           updated_by = p_actor_auth_user_id,
           updated_at = p_at
     where id = v_row.id
       and state <> 'superseded';
    perform set_config('xenios.lawrence_supersession', '', true);
    if not found then
      raise exception 'Lawrence configuration supersession conflict';
    end if;
    v_supersession_key := encode(
      extensions.digest(
        convert_to('lawrence-supersession:v1|' || v_key, 'UTF8'),
        'sha256'
      ),
      'hex'
    );
    v_supersession_result := jsonb_build_object(
      'recordId', v_row.id,
      'state', 'superseded',
      'version', v_row.version
    );
    insert into public.research_commercial_events values (
      gen_random_uuid(), 'lawrence', v_row.id, 'configuration_superseded',
      v_supersession_key, v_hash, v_actor,
      v_row.version, v_row.version, v_supersession_result, p_at, now()
    );
    v_id := gen_random_uuid(); v_version := v_row.version + 1;
    insert into public.research_lawrence_configurations(
      id, partner_id, partner_code, prior_configuration_id,
      agreement_version, attribution_window_days,
      hold_days, payout_threshold_cents, currency, tiers,
      activation_bounty_cents, optional_retainer_cents, state, version,
      created_by, created_at, updated_by, updated_at
    ) values (
      v_id, p_partner_id, v_partner.partner_code, v_row.id,
      btrim(p_agreement_version), p_attribution_window_days,
      p_hold_days, p_payout_threshold_cents, p_currency, p_tiers,
      p_activation_bounty_cents, p_optional_retainer_cents, p_state, v_version,
      p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  else
    if p_expected_version <> 0 then raise exception 'Lawrence configuration not found'; end if;
    v_id := gen_random_uuid(); v_version := 1;
    insert into public.research_lawrence_configurations(
      id, partner_id, partner_code, agreement_version, attribution_window_days,
      hold_days, payout_threshold_cents, currency, tiers,
      activation_bounty_cents, optional_retainer_cents, state, version,
      created_by, created_at, updated_by, updated_at
    ) values (
      v_id, p_partner_id, v_partner.partner_code, btrim(p_agreement_version),
      p_attribution_window_days, p_hold_days, p_payout_threshold_cents,
      p_currency, p_tiers, p_activation_bounty_cents, p_optional_retainer_cents,
      p_state, 1, p_actor_auth_user_id, p_at, p_actor_auth_user_id, p_at
    );
  end if;
  v_result := jsonb_build_object('recordId', v_id, 'state', p_state, 'version', v_version, 'idempotentReplay', false);
  insert into public.research_commercial_events values (
    gen_random_uuid(), 'lawrence', v_id, 'configuration_saved', v_key, v_hash, v_actor,
    p_expected_version, v_version, v_result - 'idempotentReplay', p_at, now()
  );
  return v_result;
end;
$$;

create or replace function public.research_operations_command_center()
returns jsonb language sql stable security definer set search_path = pg_catalog
as $$
  select jsonb_build_object(
    'supplierCounts', coalesce((
      select jsonb_object_agg(state, count_rows) from (
        select state, count(*) count_rows from public.research_fulfillment_suppliers group by state
      ) counts
    ), '{}'::jsonb),
    'fulfillmentCounts', coalesce((
      select jsonb_object_agg(state, count_rows) from (
        select state, count(*) count_rows from public.research_fulfillment_assignments group by state
      ) counts
    ), '{}'::jsonb),
    'affiliateCounts', coalesce((
      select jsonb_object_agg(state, count_rows) from (
        select state, count(*) count_rows from public.research_affiliate_partners group by state
      ) counts
    ), '{}'::jsonb),
    'professionalCounts', coalesce((
      select jsonb_object_agg(state, count_rows) from (
        select state, count(*) count_rows from public.research_professional_accounts group by state
      ) counts
    ), '{}'::jsonb),
    'exceptionCount', (select count(*) from public.research_fulfillment_assignments where state = 'exception'),
    'payableCommissionCents', coalesce((
      select sum(amount_cents) from (
        select distinct on (attribution_event_id) attribution_event_id, state, amount_cents
          from public.research_affiliate_commission_events
         order by attribution_event_id, version desc
      ) latest where state = 'payable'
    ), 0),
    'currency', (
      select min(currency) from (
        select distinct on (attribution_event_id) attribution_event_id, state, currency
          from public.research_affiliate_commission_events
         order by attribution_event_id, version desc
      ) latest where state = 'payable'
      having count(distinct currency) = 1
    ),
    'generatedAt', now()
  );
$$;

do $$
declare v_table text;
begin
  foreach v_table in array array[
    'research_affiliate_partners','research_affiliate_links',
    'research_affiliate_attribution_events','research_affiliate_commission_events',
    'research_affiliate_statements','research_affiliate_statement_items',
    'research_professional_accounts',
    'research_operations_crm_accounts','research_lawrence_configurations',
    'research_commercial_events'
  ] loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format('revoke all on table public.%I from public, anon, authenticated, service_role', v_table);
    execute format('grant select on table public.%I to service_role', v_table);
  end loop;
end;
$$;

revoke all on function public.research_commercial_immutable() from public, anon, authenticated, service_role;
revoke all on function public.research_lawrence_supersession_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_commercial_replay(text,text,text) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_statement_supersession_guard() from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_paid_order_economics(uuid,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_calculate_commission(bigint,jsonb) from public, anon, authenticated, service_role;

revoke all on function public.research_affiliate_configure_partner(uuid,uuid,text,text,text,text,text,bigint,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_create_link(uuid,uuid,text,text,text,bigint,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_record_attribution(uuid,uuid,uuid,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_record_commission(uuid,uuid,uuid,text,text,text,text,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_affiliate_publish_statement(uuid,uuid,date,date,text,uuid,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_operations_configure_professional(uuid,uuid,text,text,text,text,bigint,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_operations_configure_lawrence(uuid,uuid,text,integer,integer,bigint,text,jsonb,bigint,bigint,text,bigint,text,timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.research_operations_command_center() from public, anon, authenticated, service_role;

grant execute on function public.research_affiliate_configure_partner(uuid,uuid,text,text,text,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_affiliate_create_link(uuid,uuid,text,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_affiliate_record_attribution(uuid,uuid,uuid,uuid,text,timestamptz) to service_role;
grant execute on function public.research_affiliate_record_commission(uuid,uuid,uuid,text,text,text,text,text,timestamptz) to service_role;
grant execute on function public.research_affiliate_publish_statement(uuid,uuid,date,date,text,uuid,text,timestamptz) to service_role;
grant execute on function public.research_operations_configure_professional(uuid,uuid,text,text,text,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_operations_configure_lawrence(uuid,uuid,text,integer,integer,bigint,text,jsonb,bigint,bigint,text,bigint,text,timestamptz) to service_role;
grant execute on function public.research_operations_command_center() to service_role;
