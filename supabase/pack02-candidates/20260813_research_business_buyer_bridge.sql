-- P0 CANDIDATE ONLY. Review and promote through the managed migration DAG.
-- This deliberately avoids public.research_organizations, whose production
-- shape is owned by another domain. Supabase Auth remains credential authority.

begin;

create extension if not exists pgcrypto;

create table if not exists public.research_business_buyers (
  id uuid primary key,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text not null check (length(trim(legal_name)) between 1 and 200),
  display_name text not null check (length(trim(display_name)) between 1 and 160),
  status text not null check (status in ('active','suspended','closed')),
  created_at timestamptz not null default clock_timestamp()
);

create table if not exists public.research_business_buyer_operators (
  buyer_id uuid not null references public.research_business_buyers(id) on delete restrict,
  auth_user_id uuid not null references auth.users(id) on delete restrict,
  email_at_binding text not null check (email_at_binding = lower(trim(email_at_binding))),
  roles text[] not null check (
    cardinality(roles) between 1 and 2
    and roles <@ array['buyer_owner','buyer_operator']::text[]
  ),
  state text not null check (state in ('active','revoked')),
  bound_at timestamptz not null default clock_timestamp(),
  primary key (buyer_id, auth_user_id),
  unique (auth_user_id)
);

create table if not exists public.research_business_buyer_scopes (
  buyer_id uuid primary key references public.research_business_buyers(id) on delete restrict,
  customer_ref text not null unique references public.research_early_access_customers(id) on delete restrict,
  price_profile text not null check (price_profile in ('KRIS_VOLUME_PARTNER')),
  bound_at timestamptz not null default clock_timestamp()
);

create table if not exists public.research_business_buyer_events (
  id bigint generated always as identity primary key,
  buyer_id uuid not null references public.research_business_buyers(id) on delete restrict,
  auth_user_id uuid references auth.users(id) on delete restrict,
  event_type text not null check (event_type in ('buyer_activated','operator_bound')),
  actor_label text not null check (length(trim(actor_label)) between 3 and 160),
  detail jsonb not null default '{}'::jsonb check (jsonb_typeof(detail) = 'object'),
  occurred_at timestamptz not null default clock_timestamp()
);

create or replace function public.research_business_buyer_events_immutable()
returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'business buyer events are immutable' using errcode = '55000';
end;
$$;

drop trigger if exists research_business_buyer_events_immutable on public.research_business_buyer_events;
create trigger research_business_buyer_events_immutable
before update or delete on public.research_business_buyer_events
for each row execute function public.research_business_buyer_events_immutable();

insert into public.research_business_buyers(id, slug, legal_name, display_name, status)
values (
  '8f942c0e-370b-4b7b-98ce-a0b931193f08',
  'roman-health',
  'Roman Health',
  'Roman Health',
  'active'
)
on conflict (id) do update set
  slug = excluded.slug,
  legal_name = excluded.legal_name,
  display_name = excluded.display_name,
  status = excluded.status;

create or replace function public.research_finalize_business_buyer_claim(
  p_buyer_id uuid,
  p_auth_user_id uuid,
  p_normalized_email text,
  p_actor_label text
)
returns table (
  buyer_id uuid,
  buyer_slug text,
  customer_ref text,
  price_profile text,
  roles text[]
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth auth.users%rowtype;
  v_customer public.research_early_access_customers%rowtype;
  v_buyer public.research_business_buyers%rowtype;
  v_roles constant text[] := array['buyer_owner','buyer_operator']::text[];
begin
  if p_normalized_email <> lower(trim(p_normalized_email))
     or length(p_normalized_email) not between 3 and 254
     or length(trim(p_actor_label)) not between 3 and 160 then
    raise exception 'business buyer claim evidence is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_buyer_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_auth_user_id::text, 1));

  select * into v_buyer from public.research_business_buyers
   where id = p_buyer_id and status = 'active' for update;
  if not found then
    raise exception 'active business buyer not found' using errcode = '23514';
  end if;

  select * into v_auth from auth.users where id = p_auth_user_id for update;
  if not found or v_auth.email_confirmed_at is null
     or lower(trim(v_auth.email)) <> p_normalized_email then
    raise exception 'confirmed Supabase Auth identity does not match' using errcode = '23514';
  end if;

  select * into v_customer from public.research_early_access_customers
   where normalized_email = p_normalized_email and status = 'active' for update;
  if not found then
    raise exception 'active Early Access customer scope not found' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.research_business_buyer_operators
     where auth_user_id = p_auth_user_id and buyer_id <> p_buyer_id
  ) or exists (
    select 1 from public.research_business_buyer_scopes
     where customer_ref = v_customer.id and buyer_id <> p_buyer_id
  ) then
    raise exception 'business buyer identity is already owned' using errcode = '23505';
  end if;

  insert into public.research_business_buyer_operators(
    buyer_id, auth_user_id, email_at_binding, roles, state
  ) values (p_buyer_id, p_auth_user_id, p_normalized_email, v_roles, 'active')
  on conflict (buyer_id, auth_user_id) do update set
    email_at_binding = excluded.email_at_binding,
    roles = excluded.roles,
    state = 'active';

  insert into public.research_business_buyer_scopes(buyer_id, customer_ref, price_profile)
  values (p_buyer_id, v_customer.id, 'KRIS_VOLUME_PARTNER')
  on conflict (buyer_id) do update set
    customer_ref = excluded.customer_ref,
    price_profile = excluded.price_profile;

  if not exists (
    select 1 from public.research_business_buyer_events
     where buyer_id = p_buyer_id and auth_user_id = p_auth_user_id
       and event_type = 'operator_bound'
  ) then
    insert into public.research_business_buyer_events(
      buyer_id, auth_user_id, event_type, actor_label, detail
    ) values (
      p_buyer_id, p_auth_user_id, 'operator_bound', trim(p_actor_label),
      pg_catalog.jsonb_build_object(
        'email', p_normalized_email,
        'customerRef', v_customer.id,
        'priceProfile', 'KRIS_VOLUME_PARTNER'
      )
    );
  end if;

  return query select v_buyer.id, v_buyer.slug, v_customer.id,
    'KRIS_VOLUME_PARTNER'::text, v_roles;
end;
$$;

revoke all on function public.research_finalize_business_buyer_claim(uuid,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.research_finalize_business_buyer_claim(uuid,uuid,text,text)
  to service_role;

create or replace function public.research_current_business_buyer_context()
returns table (
  buyer_id uuid,
  buyer_slug text,
  customer_ref text,
  price_profile text,
  roles text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select b.id, b.slug, s.customer_ref, s.price_profile, o.roles
  from public.research_business_buyer_operators o
  join public.research_business_buyers b on b.id = o.buyer_id
  join public.research_business_buyer_scopes s on s.buyer_id = b.id
  where o.auth_user_id = auth.uid()
    and o.state = 'active'
    and b.status = 'active'
$$;

revoke all on function public.research_current_business_buyer_context()
  from public, anon;
grant execute on function public.research_current_business_buyer_context()
  to authenticated, service_role;

alter table public.research_business_buyers enable row level security;
alter table public.research_business_buyers force row level security;
alter table public.research_business_buyer_operators enable row level security;
alter table public.research_business_buyer_operators force row level security;
alter table public.research_business_buyer_scopes enable row level security;
alter table public.research_business_buyer_scopes force row level security;
alter table public.research_business_buyer_events enable row level security;
alter table public.research_business_buyer_events force row level security;

revoke all on public.research_business_buyers from public, anon, authenticated;
revoke all on public.research_business_buyer_operators from public, anon, authenticated;
revoke all on public.research_business_buyer_scopes from public, anon, authenticated;
revoke all on public.research_business_buyer_events from public, anon, authenticated;

commit;
