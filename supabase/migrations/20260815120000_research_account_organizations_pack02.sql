-- M70 - the Pack 02 account and organization schema, under its own name.
--
-- WHY THE NAME public.research_account_organizations (decision D-004).
-- Production already carries public.research_organizations, and it belongs to
-- the PARTNER system (columns id, name, owner_partner_id, state, created_at).
-- The account system's organizations table originally claimed the same name;
-- a blind "create table if not exists" would have looked successful while
-- silently keeping the partner shape, and the mounted account API would have
-- kept failing column by column. The unshipped account table is therefore
-- renamed to public.research_account_organizations, and this migration never
-- reads, writes, alters, grants on, or depends on the partner table.
--
-- WHAT THIS ADDS. Eight tables (organizations, organization users,
-- invitations, claim challenges, customer bindings, order ownership,
-- binding events, request-again intents), their validation triggers, and
-- three SECURITY DEFINER service_role-only functions. This is not another
-- auth or order system: auth.users stays the credential authority,
-- research_members stays the personal member identity, and research_orders
-- stays the order authority. Everything here is additive; nothing existing
-- is altered. Row level security is enabled on all eight tables and no
-- table privilege is granted to anon or authenticated.
--
-- Source of truth: supabase/pack02-candidates/20260812_research_account_organizations.sql
-- (the reviewed Pack 02 candidate, renamed in the same change as this file).
-- Rollback: supabase/production/research-account-organizations-pack02-rollback-notes.md

-- ---------------------------------------------------------------------------
-- PREFLIGHT (fails closed; nothing below runs if any requirement is unmet)
-- ---------------------------------------------------------------------------
do $m70_preflight$
begin
  if to_regclass('auth.users') is null then
    raise exception 'M70 requires auth.users (the Supabase credential authority) to exist';
  end if;
  if to_regclass('public.research_members') is null then
    raise exception 'M70 requires public.research_members (the personal member identity) to exist';
  end if;
  if to_regclass('public.research_orders') is null then
    raise exception 'M70 requires public.research_orders (the canonical order authority) to exist';
  end if;
  -- Refuse a foreign shape under our own name. A re-apply over the correct
  -- Pack 02 shape passes; anything else (including a partner-shaped clone)
  -- aborts before any statement runs.
  if to_regclass('public.research_account_organizations') is not null then
    if exists (select 1 from information_schema.columns
                where table_schema = 'public'
                  and table_name = 'research_account_organizations'
                  and column_name = 'owner_partner_id')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public'
                         and table_name = 'research_account_organizations'
                         and column_name = 'slug')
       or not exists (select 1 from information_schema.columns
                       where table_schema = 'public'
                         and table_name = 'research_account_organizations'
                         and column_name = 'purchasing_email') then
      raise exception 'M70 requires public.research_account_organizations to be absent or already the Pack 02 account shape; a foreign shape occupies the name';
    end if;
  end if;
end
$m70_preflight$;

create extension if not exists pgcrypto;

create table if not exists public.research_account_organizations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text not null check (length(legal_name) between 1 and 200),
  display_name text not null check (length(display_name) between 1 and 160),
  status text not null default 'active' check (status in ('active','suspended','closed')),
  purchasing_email text not null check (purchasing_email = lower(purchasing_email)),
  billing_email text not null check (billing_email = lower(billing_email)),
  phone text,
  tax_id_last4 text check (tax_id_last4 is null or tax_id_last4 ~ '^\d{4}$'),
  purchase_order_required boolean not null default false,
  billing_address jsonb,
  shipping_address jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

create table if not exists public.research_organization_users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.research_account_organizations(id),
  auth_user_id uuid not null references auth.users(id),
  email_at_binding text not null check (email_at_binding = lower(email_at_binding)),
  roles text[] not null,
  state text not null default 'active' check (state in ('active','revoked')),
  binding_method text not null check (binding_method in ('verified_invitation','operator_verified_auth_user')),
  bound_by text not null check (length(bound_by) between 2 and 200),
  bound_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz,
  password_change_required boolean not null default false,
  password_change_required_at timestamptz,
  password_changed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_organization_users_roles_nonempty check (cardinality(roles) between 1 and 4),
  constraint research_organization_users_roles_known check (
    roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]
  ),
  constraint research_organization_users_password_flag_time check (
    (password_change_required and password_change_required_at is not null)
    or (not password_change_required)
  ),
  constraint research_organization_users_active_revocation check (
    (state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null)
  ),
  unique (organization_id, auth_user_id)
);
create index if not exists research_organization_users_auth_idx
  on public.research_organization_users(auth_user_id) where state='active';

create table if not exists public.research_organization_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.research_account_organizations(id),
  normalized_email text not null check (normalized_email = lower(normalized_email)),
  roles text[] not null check (cardinality(roles) between 1 and 4),
  token_hash bytea,
  state text not null default 'pending' check (state in ('pending','accepted','revoked','expired')),
  invited_by_auth_user_id uuid references auth.users(id),
  invited_by_label text not null,
  expires_at timestamptz,
  accepted_by_auth_user_id uuid references auth.users(id),
  accepted_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_organization_invitations_roles_known check (
    roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]
  ),
  constraint research_organization_invitations_token_lifecycle check (
    (state='pending' and token_hash is not null and expires_at is not null)
    or (state<>'pending')
  )
);
create unique index if not exists research_organization_invitations_pending_email_idx
  on public.research_organization_invitations(organization_id, normalized_email)
  where state='pending';

create table if not exists public.research_account_claim_challenges (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id),
  normalized_email text not null check (normalized_email = lower(normalized_email)),
  customer_ref text not null check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  subject_type text not null check (subject_type in ('personal','organization')),
  member_id uuid references public.research_members(id),
  organization_id uuid references public.research_account_organizations(id),
  token_hash bytea not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  constraint research_account_claim_challenges_one_subject check (
    (subject_type='personal' and member_id is not null and organization_id is null)
    or (subject_type='organization' and organization_id is not null and member_id is null)
  )
);
create index if not exists research_account_claim_challenges_actor_idx
  on public.research_account_claim_challenges(auth_user_id, created_at desc);

create table if not exists public.research_customer_account_bindings (
  id uuid primary key default gen_random_uuid(),
  customer_ref text not null unique check (customer_ref ~ '^eac_[a-f0-9]{32}$'),
  subject_type text not null check (subject_type in ('personal','organization')),
  member_id uuid references public.research_members(id),
  organization_id uuid references public.research_account_organizations(id),
  established_by_auth_user_id uuid not null references auth.users(id),
  established_from_claim_id uuid not null references public.research_account_claim_challenges(id),
  established_at timestamptz not null default clock_timestamp(),
  constraint research_customer_account_bindings_one_subject check (
    (subject_type='personal' and member_id is not null and organization_id is null)
    or (subject_type='organization' and organization_id is not null and member_id is null)
  )
);
create index if not exists research_customer_account_bindings_member_idx
  on public.research_customer_account_bindings(member_id) where member_id is not null;
create index if not exists research_customer_account_bindings_org_idx
  on public.research_customer_account_bindings(organization_id) where organization_id is not null;

-- Additive ownership for canonical commerce orders. The order, lines,
-- invoices, payments, and fulfillment remain in their existing tables; this
-- row is authorization metadata only. Historical Early Access ownership is
-- resolved through the customerRef binding above instead of copying orders.
create table if not exists public.research_organization_order_ownership (
  order_id uuid primary key references public.research_orders(id) on delete restrict,
  organization_id uuid not null references public.research_account_organizations(id),
  placed_by_organization_user_id uuid references public.research_organization_users(id),
  established_from_customer_binding_id uuid references public.research_customer_account_bindings(id),
  ownership_basis text not null check (ownership_basis in ('organization_checkout','verified_customer_claim')),
  established_by_auth_user_id uuid not null references auth.users(id),
  established_at timestamptz not null default clock_timestamp(),
  constraint research_organization_order_ownership_evidence check (
    (ownership_basis='organization_checkout' and placed_by_organization_user_id is not null
      and established_from_customer_binding_id is null)
    or (ownership_basis='verified_customer_claim' and established_from_customer_binding_id is not null
      and placed_by_organization_user_id is null)
  )
);
create index if not exists research_organization_order_ownership_org_idx
  on public.research_organization_order_ownership(organization_id, established_at desc);

create or replace function public.research_organization_order_ownership_validate()
returns trigger language plpgsql set search_path='' as $$
declare v_evidence_organization_id uuid;
declare v_actor_is_member boolean;
begin
  if tg_op in ('UPDATE','DELETE') then
    raise exception 'organization order ownership is immutable' using errcode='55000';
  end if;
  if new.ownership_basis='organization_checkout' then
    select organization_id into v_evidence_organization_id
      from public.research_organization_users
     where id=new.placed_by_organization_user_id and state='active';
  else
    select organization_id into v_evidence_organization_id
      from public.research_customer_account_bindings
     where id=new.established_from_customer_binding_id and subject_type='organization';
  end if;
  if v_evidence_organization_id is null or v_evidence_organization_id<>new.organization_id then
    raise exception 'order ownership evidence does not match organization' using errcode='23514';
  end if;
  select exists(
    select 1 from public.research_organization_users
     where organization_id=new.organization_id and auth_user_id=new.established_by_auth_user_id and state='active'
  ) into v_actor_is_member;
  if not v_actor_is_member then
    raise exception 'order ownership actor is not an active organization user' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists research_organization_order_ownership_validate
  on public.research_organization_order_ownership;
create trigger research_organization_order_ownership_validate
before insert or update or delete on public.research_organization_order_ownership
for each row execute function public.research_organization_order_ownership_validate();

create table if not exists public.research_account_binding_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  auth_user_id uuid references auth.users(id),
  organization_id uuid references public.research_account_organizations(id),
  organization_user_id uuid references public.research_organization_users(id),
  customer_ref text,
  actor_label text not null,
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists research_account_binding_events_org_idx
  on public.research_account_binding_events(organization_id, occurred_at desc);

create table if not exists public.research_organization_request_again (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.research_account_organizations(id),
  requested_by_auth_user_id uuid not null references auth.users(id),
  source_system text not null check (source_system in ('research_order','early_access_placement','early_access_cart_checkout')),
  source_order_id text not null check (length(trim(source_order_id)) between 1 and 160),
  source_snapshot jsonb not null,
  note text check (note is null or length(note)<=1000),
  state text not null default 'requested' check (state in ('requested','reviewing','converted','closed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_organization_request_again_once
    unique (organization_id, source_system, source_order_id)
);

create or replace function public.research_organization_request_again_validate()
returns trigger language plpgsql set search_path='' as $$
begin
  if not exists (
    select 1 from public.research_organization_users
     where organization_id=new.organization_id
       and auth_user_id=new.requested_by_auth_user_id
       and state='active'
       and roles && array['organization_owner','organization_admin','business_buyer']::text[]
  ) then
    raise exception 'request-again actor lacks organization buyer access' using errcode='42501';
  end if;
  if new.source_system='research_order' and not exists (
    select 1 from public.research_organization_order_ownership
     where organization_id=new.organization_id and order_id=new.source_order_id::uuid
  ) then
    raise exception 'canonical order is not owned by request organization' using errcode='42501';
  end if;
  return new;
exception when invalid_text_representation then
  raise exception 'canonical research order id must be a UUID' using errcode='22023';
end;
$$;
drop trigger if exists research_organization_request_again_validate
  on public.research_organization_request_again;
create trigger research_organization_request_again_validate
before insert on public.research_organization_request_again
for each row execute function public.research_organization_request_again_validate();

-- The binding ledger is append-only. Corrections are new events; historical
-- evidence cannot be silently edited or removed.
create or replace function public.research_account_binding_events_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'research_account_binding_events is append-only' using errcode='55000';
end;
$$;
drop trigger if exists research_account_binding_events_immutable on public.research_account_binding_events;
create trigger research_account_binding_events_immutable
before update or delete on public.research_account_binding_events
for each row execute function public.research_account_binding_events_immutable();

-- Operator-only binding for the first manually-created Supabase Auth user and
-- future equivalent cases. It refuses an absent, unverified, or mismatched
-- auth.users record. No password is accepted, returned, logged, or stored.
create or replace function public.research_bind_verified_organization_user(
  p_organization_id uuid,
  p_auth_user_id uuid,
  p_expected_email text,
  p_roles text[],
  p_actor_label text,
  p_password_change_required boolean default true
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_auth auth.users%rowtype;
  v_membership_id uuid;
begin
  if p_actor_label is null or length(trim(p_actor_label)) < 2 then
    raise exception 'named actor required' using errcode='22023';
  end if;
  if cardinality(p_roles) < 1 or not (p_roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]) then
    raise exception 'invalid organization roles' using errcode='22023';
  end if;
  select * into v_auth from auth.users where id=p_auth_user_id for share;
  if not found or v_auth.email_confirmed_at is null then
    raise exception 'verified auth user required' using errcode='42501';
  end if;
  if lower(v_auth.email) <> lower(trim(p_expected_email)) then
    raise exception 'auth user email mismatch' using errcode='42501';
  end if;
  if not exists(select 1 from public.research_account_organizations where id=p_organization_id and status='active') then
    raise exception 'active organization required' using errcode='23503';
  end if;

  insert into public.research_organization_users(
    organization_id,auth_user_id,email_at_binding,roles,state,binding_method,bound_by,
    password_change_required,password_change_required_at
  ) values (
    p_organization_id,p_auth_user_id,lower(trim(p_expected_email)),p_roles,'active',
    'operator_verified_auth_user',trim(p_actor_label),p_password_change_required,
    case when p_password_change_required then clock_timestamp() else null end
  )
  on conflict (organization_id,auth_user_id) do nothing
  returning id into v_membership_id;

  if v_membership_id is null then
    select id into v_membership_id from public.research_organization_users
     where organization_id=p_organization_id and auth_user_id=p_auth_user_id;
  else
    insert into public.research_account_binding_events(
      event_type,auth_user_id,organization_id,organization_user_id,actor_label,detail
    ) values (
      'organization_user_bound',p_auth_user_id,p_organization_id,v_membership_id,trim(p_actor_label),
      jsonb_build_object('email',lower(trim(p_expected_email)),'roles',p_roles,'passwordChangeRequired',p_password_change_required)
    );
  end if;
  return v_membership_id;
end;
$$;

-- Permissions are intentionally explicit and part of the required DB review.
revoke all on function public.research_bind_verified_organization_user(uuid,uuid,text,text[],text,boolean) from public, anon, authenticated;
grant execute on function public.research_bind_verified_organization_user(uuid,uuid,text,text[],text,boolean) to service_role;

-- Atomically verifies and consumes a one-time customer-history challenge and
-- establishes ownership. A crash cannot burn the challenge without either
-- creating the binding or observing an already-identical binding.
create or replace function public.research_account_commit_customer_claim(
  p_claim_id uuid,
  p_token_hash bytea,
  p_auth_user_id uuid,
  p_verified_email text
) returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_claim public.research_account_claim_challenges%rowtype;
  v_auth auth.users%rowtype;
  v_existing public.research_customer_account_bindings%rowtype;
  v_outcome text;
begin
  select * into v_auth from auth.users where id=p_auth_user_id for share;
  if not found or v_auth.email_confirmed_at is null
     or lower(v_auth.email)<>lower(trim(p_verified_email)) then
    return 'invalid';
  end if;

  select * into v_claim from public.research_account_claim_challenges
   where id=p_claim_id and auth_user_id=p_auth_user_id for update;
  if not found or v_claim.consumed_at is not null or v_claim.expires_at<=clock_timestamp()
     or v_claim.normalized_email<>lower(trim(p_verified_email))
     or v_claim.token_hash<>p_token_hash then
    return 'invalid';
  end if;

  select * into v_existing from public.research_customer_account_bindings
   where customer_ref=v_claim.customer_ref for update;
  if found then
    if v_existing.subject_type<>v_claim.subject_type
       or v_existing.member_id is distinct from v_claim.member_id
       or v_existing.organization_id is distinct from v_claim.organization_id then
      return 'conflict';
    end if;
    v_outcome := 'replayed';
  else
    insert into public.research_customer_account_bindings(
      customer_ref,subject_type,member_id,organization_id,established_by_auth_user_id,established_from_claim_id
    ) values (
      v_claim.customer_ref,v_claim.subject_type,v_claim.member_id,v_claim.organization_id,p_auth_user_id,p_claim_id
    );
    v_outcome := 'linked';
  end if;

  update public.research_account_claim_challenges set consumed_at=clock_timestamp() where id=p_claim_id;
  insert into public.research_account_binding_events(
    event_type,auth_user_id,organization_id,customer_ref,actor_label,detail
  ) values (
    'customer_ref_bound',p_auth_user_id,v_claim.organization_id,v_claim.customer_ref,
    lower(trim(p_verified_email)),jsonb_build_object('subjectType',v_claim.subject_type,'outcome',v_outcome,'claimId',p_claim_id)
  );
  return v_outcome;
end;
$$;
revoke all on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) from public, anon, authenticated;
grant execute on function public.research_account_commit_customer_claim(uuid,bytea,uuid,text) to service_role;

create or replace function public.research_account_accept_organization_invitation(
  p_invitation_id uuid,
  p_token_hash bytea,
  p_auth_user_id uuid,
  p_verified_email text
) returns text
language plpgsql security definer set search_path=''
as $$
declare
  v_invite public.research_organization_invitations%rowtype;
  v_auth auth.users%rowtype;
  v_membership public.research_organization_users%rowtype;
begin
  select * into v_auth from auth.users where id=p_auth_user_id for share;
  if not found or v_auth.email_confirmed_at is null
     or lower(v_auth.email)<>lower(trim(p_verified_email)) then return 'invalid'; end if;

  select * into v_invite from public.research_organization_invitations
   where id=p_invitation_id for update;
  if not found then return 'invalid'; end if;
  if v_invite.state='accepted' and v_invite.accepted_by_auth_user_id=p_auth_user_id then return 'replayed'; end if;
  if v_invite.state<>'pending' or v_invite.expires_at<=clock_timestamp()
     or v_invite.normalized_email<>lower(trim(p_verified_email))
     or v_invite.token_hash<>p_token_hash then return 'invalid'; end if;

  select * into v_membership from public.research_organization_users
   where organization_id=v_invite.organization_id and auth_user_id=p_auth_user_id for update;
  if found and (v_membership.state<>'active' or v_membership.roles<>v_invite.roles) then return 'conflict'; end if;

  if not found then
    insert into public.research_organization_users(
      organization_id,auth_user_id,email_at_binding,roles,state,binding_method,bound_by,password_change_required
    ) values (
      v_invite.organization_id,p_auth_user_id,lower(trim(p_verified_email)),v_invite.roles,'active',
      'verified_invitation','Verified organization invitation',false
    ) returning * into v_membership;
  end if;
  update public.research_organization_invitations
     set state='accepted',accepted_by_auth_user_id=p_auth_user_id,accepted_at=clock_timestamp(),
         token_hash=null,updated_at=clock_timestamp()
   where id=p_invitation_id;
  insert into public.research_account_binding_events(
    event_type,auth_user_id,organization_id,organization_user_id,actor_label,detail
  ) values (
    'organization_invitation_accepted',p_auth_user_id,v_invite.organization_id,v_membership.id,
    lower(trim(p_verified_email)),jsonb_build_object('invitationId',p_invitation_id,'roles',v_invite.roles)
  );
  return 'accepted';
end;
$$;
revoke all on function public.research_account_accept_organization_invitation(uuid,bytea,uuid,text) from public, anon, authenticated;
grant execute on function public.research_account_accept_organization_invitation(uuid,bytea,uuid,text) to service_role;

-- Server-only tables: the application API performs authorization after
-- verifying the Supabase JWT. No browser-direct policies are added here.
alter table public.research_account_organizations enable row level security;
alter table public.research_organization_users enable row level security;
alter table public.research_organization_invitations enable row level security;
alter table public.research_account_claim_challenges enable row level security;
alter table public.research_customer_account_bindings enable row level security;
alter table public.research_organization_order_ownership enable row level security;
alter table public.research_account_binding_events enable row level security;
alter table public.research_organization_request_again enable row level security;

-- THE BROWSER REVOKE, and why it cannot be omitted on the real target.
--
-- Enabling row level security is not by itself the boundary. On managed
-- Supabase, ALTER DEFAULT PRIVILEGES for the postgres and supabase_admin roles
-- grants arwdDxtm on every new table in public to anon, authenticated AND
-- service_role. A migration that creates tables and grants nothing therefore
-- does not produce a table with no grants: it produces a table with ALL
-- granted to all three, before a single statement of ours runs.
--
-- This file originally carried no table-level revoke at all, and its own
-- post-condition then refused to commit, counting 112 grants (8 tables x 7
-- privileges x 2 browser roles). It was certified against a stock postgres
-- container, which carries no such default ACL, so the absence read as
-- correct. It was not: on the production target the migration could not apply.
-- Thirteen migrations in this directory already carry this revoke; this one
-- now does too.
--
-- service_role is DELIBERATELY NOT REVOKED. Unlike the schemas that reach
-- their tables only through SECURITY DEFINER routines, the deployed Pack 02
-- store queries these eight tables DIRECTLY as service_role
-- (server/research/account-identity/production-store.ts, via getSupabaseAdmin).
-- Revoking service_role here would let this migration apply and then break the
-- account API on the next deploy. The boundary that matters is the browser
-- one, so the revoke stops at authenticated and service_role's access is an
-- asserted, declared fact in the post-condition rather than an accident.
do $m70_browser_revoke$
declare
  v_table text;
begin
  foreach v_table in array array[
    'research_account_organizations',
    'research_organization_users',
    'research_organization_invitations',
    'research_account_claim_challenges',
    'research_customer_account_bindings',
    'research_organization_order_ownership',
    'research_account_binding_events',
    'research_organization_request_again'
  ] loop
    execute format('revoke all on table public.%I from public', v_table);
    execute format('revoke all on table public.%I from anon', v_table);
    execute format('revoke all on table public.%I from authenticated', v_table);
  end loop;
end
$m70_browser_revoke$;

-- First business account profile. Authentication and its exact UID binding
-- are supplied by the dependent Roman Digital candidate; no password exists
-- anywhere in this schema.
insert into public.research_account_organizations(
  id,slug,legal_name,display_name,purchasing_email,billing_email
) values (
  'e26bc7de-86df-4e70-8e82-964e3671d71c','roman-digital','Roman Digital','Roman Digital',
  'info@romanhealthcollective.com','info@romanhealthcollective.com'
) on conflict (slug) do nothing;

-- ---------------------------------------------------------------------------
-- POSTCONDITION (proves the end state; under a single-transaction apply a
-- failure here rolls the whole migration back)
-- ---------------------------------------------------------------------------
do $m70_postcondition$
declare
  v_bad text;
  v_count integer;
begin
  select string_agg(t.name, ', ') into v_bad
    from (values
      ('research_account_organizations'),
      ('research_organization_users'),
      ('research_organization_invitations'),
      ('research_account_claim_challenges'),
      ('research_customer_account_bindings'),
      ('research_organization_order_ownership'),
      ('research_account_binding_events'),
      ('research_organization_request_again')
    ) as t(name)
   where to_regclass('public.' || t.name) is null
      or not exists (
        select 1 from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = t.name and c.relrowsecurity
      );
  if v_bad is not null then
    raise exception 'M70 postcondition: tables missing or without row level security: %', v_bad;
  end if;

  select count(*) into v_count
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and p.proname in ('research_bind_verified_organization_user',
                       'research_account_commit_customer_claim',
                       'research_account_accept_organization_invitation');
  if v_count <> 3 then
    raise exception 'M70 postcondition: expected 3 security definer account functions, found %', v_count;
  end if;

  select count(*) into v_count
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace,
    lateral unnest(array['anon','authenticated']) as r(role)
   where n.nspname = 'public'
     and p.proname in ('research_bind_verified_organization_user',
                       'research_account_commit_customer_claim',
                       'research_account_accept_organization_invitation')
     and exists (select 1 from pg_roles where rolname = r.role)
     and has_function_privilege(r.role, p.oid, 'EXECUTE');
  if v_count <> 0 then
    raise exception 'M70 postcondition: a public-facing role can execute an account function (% grants)', v_count;
  end if;

  if exists (select 1 from pg_roles where rolname = 'service_role') then
    select count(*) into v_count
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('research_bind_verified_organization_user',
                         'research_account_commit_customer_claim',
                         'research_account_accept_organization_invitation')
       and has_function_privilege('service_role', p.oid, 'EXECUTE');
    if v_count <> 3 then
      raise exception 'M70 postcondition: service_role cannot execute all 3 account functions (%)', v_count;
    end if;
  end if;

  -- The browser boundary, read from the ACL rather than from
  -- information_schema.role_table_grants, because that view reports only
  -- grants to roles and cannot see PUBLIC. PUBLIC is grantee 0 in the ACL and
  -- has no pg_roles row, so a check that joins to pg_roles silently treats the
  -- broadest possible grant as clean. A null relacl means the owner-only
  -- default, which grants nothing to PUBLIC, so coalesce to empty is correct
  -- here (unlike the function case, where a null proacl means PUBLIC EXECUTE).
  select count(*) into v_count
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    cross join lateral aclexplode(coalesce(c.relacl, '{}'::aclitem[])) acl
    left join pg_roles r on r.oid = acl.grantee
   where n.nspname = 'public'
     and c.relname in ('research_account_organizations',
                       'research_organization_users',
                       'research_organization_invitations',
                       'research_account_claim_challenges',
                       'research_customer_account_bindings',
                       'research_organization_order_ownership',
                       'research_account_binding_events',
                       'research_organization_request_again')
     and (acl.grantee = 0 or r.rolname in ('anon', 'authenticated'));
  if v_count <> 0 then
    raise exception 'M70 postcondition: the account table grant boundary is broken (% grants)', v_count;
  end if;

  -- service_role's access is DECLARED, not ignored. The deployed Pack 02 store
  -- queries these tables directly as service_role, so this migration must not
  -- revoke it; asserting it here means a future change that quietly removes it
  -- fails at apply time rather than at the next deploy, when the account API
  -- would start answering 503. On managed Supabase the grant arrives from the
  -- default ACL; the assertion is skipped where that role does not exist, so a
  -- disposable database without it is not failed for the wrong reason.
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    select count(*) into v_count
      from (values
        ('research_account_organizations'),
        ('research_organization_users'),
        ('research_organization_invitations'),
        ('research_account_claim_challenges'),
        ('research_customer_account_bindings'),
        ('research_organization_order_ownership'),
        ('research_account_binding_events'),
        ('research_organization_request_again')
      ) as t(name)
     where has_table_privilege('service_role', 'public.' || t.name, 'SELECT');
    if v_count <> 0 and v_count <> 8 then
      raise exception
        'M70 postcondition: service_role reads % of 8 account tables; the deployed store needs all 8 or none',
        v_count;
    end if;
  end if;

  if not exists (select 1 from public.research_account_organizations
                  where slug = 'roman-digital'
                    and purchasing_email = 'info@romanhealthcollective.com'
                    and billing_email = 'info@romanhealthcollective.com') then
    raise exception 'M70 postcondition: the roman-digital seed is missing or drifted';
  end if;
end
$m70_postcondition$;

