-- PACK 02 CANDIDATE ONLY — DO NOT APPLY FROM THIS WORKER LANE.
-- Final-base recreation, DB review, grants review, and apply-twice proof are
-- required before this file may be promoted into supabase/migrations.
--
-- This is not another auth or order system. auth.users stays the credential
-- authority, research_members stays the personal member identity, and the
-- existing research_orders / research_early_access_* tables stay the order
-- authorities. These tables only add organization authorization, profile
-- data, progressive customerRef ownership, and request-again intents.

create extension if not exists pgcrypto;

create table if not exists public.research_organizations (
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
  organization_id uuid not null references public.research_organizations(id),
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
  organization_id uuid not null references public.research_organizations(id),
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
  organization_id uuid references public.research_organizations(id),
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
  organization_id uuid references public.research_organizations(id),
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
  organization_id uuid not null references public.research_organizations(id),
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
  organization_id uuid references public.research_organizations(id),
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
  organization_id uuid not null references public.research_organizations(id),
  requested_by_auth_user_id uuid not null references auth.users(id),
  source_system text not null check (source_system in ('research_order','early_access_placement','early_access_cart_checkout')),
  source_order_id text not null,
  source_snapshot jsonb not null,
  note text,
  state text not null default 'requested' check (state in ('requested','reviewing','converted','closed')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_organization_request_again_once
    unique (organization_id, requested_by_auth_user_id, source_system, source_order_id)
);

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
  if not exists(select 1 from public.research_organizations where id=p_organization_id and status='active') then
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
alter table public.research_organizations enable row level security;
alter table public.research_organization_users enable row level security;
alter table public.research_organization_invitations enable row level security;
alter table public.research_account_claim_challenges enable row level security;
alter table public.research_customer_account_bindings enable row level security;
alter table public.research_organization_order_ownership enable row level security;
alter table public.research_account_binding_events enable row level security;
alter table public.research_organization_request_again enable row level security;

-- First business account. The login is an invitation only; there is no auth
-- UID until Samuel manually creates the Supabase user and no password anywhere.
insert into public.research_organizations(
  id,slug,legal_name,display_name,purchasing_email,billing_email
) values (
  'e26bc7de-86df-4e70-8e82-964e3671d71c','roman-digital','Roman Digital','Roman Digital',
  'k@romandigital.io','k@romandigital.io'
) on conflict (slug) do nothing;

insert into public.research_organization_invitations(
  id,organization_id,normalized_email,roles,token_hash,state,invited_by_label,expires_at
) values (
  '713c5ad9-8ca3-4ee5-b7fe-1293920562b2','e26bc7de-86df-4e70-8e82-964e3671d71c',
  'k@romandigital.io',array['organization_owner','business_buyer']::text[],null,'accepted',
  'Samuel Boadu — pending manual Supabase Auth UID',null
) on conflict (id) do nothing;
