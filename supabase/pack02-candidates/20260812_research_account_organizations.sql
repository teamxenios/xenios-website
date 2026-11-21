-- PACK 02 CANDIDATE ONLY — DO NOT APPLY FROM THIS WORKER LANE.
-- Final-base recreation, DB review, grants review, and apply-twice proof are
-- required before this file may be promoted into supabase/migrations.
--
-- This is not another auth or order system. auth.users stays the credential
-- authority, research_members stays the personal member identity, and the
-- existing research_orders / research_early_access_* tables stay the order
-- authorities. These tables only add organization authorization, profile
-- data, progressive customerRef ownership, and request-again intents.
-- The five-column partner public.research_organizations is never adopted,
-- renamed or altered. The buyer principal has its own permanent account name.

begin;
set local lock_timeout='5s';
create extension if not exists pgcrypto;
set local search_path=pg_catalog,public;
set local standard_conforming_strings=on;

-- A successful first install is sealed by metadata-only table fingerprints.
-- They supplement independent owner/shape/ACL/function checks on every reapply;
-- they never establish an account, organization membership or customer binding.
do $guarded_foundation$
declare
  v_ddl text := $foundation_ddl$

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
do $install_claim$
begin
  -- A qualified replay companion must survive a foundation reapply. Preflight
  -- below permits only the original leaf or the independently accepted replay.
  if to_regprocedure('public.research_account_commit_customer_claim(uuid,bytea,uuid,text)') is null then
    execute $claim_ddl$
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
$claim_ddl$;
  end if;
end;
$install_claim$;
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

-- Company profiles, Auth bindings and roles require their separate reviewed
-- provisioning action. The generalized foundation creates no company seed.

-- Exact current adapter privileges. Definer routines alone mutate bindings,
-- consume claims/invitations, or create memberships. No managed default ACL is
-- accepted as an implicit part of this contract.
revoke all on table public.research_account_organizations,public.research_organization_users,
  public.research_organization_invitations,public.research_account_claim_challenges,
  public.research_customer_account_bindings,public.research_organization_order_ownership,
  public.research_account_binding_events,public.research_organization_request_again
  from public,anon,authenticated,service_role;
grant select on public.research_account_organizations,public.research_organization_users to service_role;
grant update(legal_name,display_name,purchasing_email,billing_email,phone,tax_id_last4,purchase_order_required,billing_address,shipping_address,updated_at)
  on public.research_account_organizations to service_role;
grant update(password_change_required,password_changed_at,updated_at) on public.research_organization_users to service_role;
grant select,insert on public.research_organization_invitations,public.research_account_claim_challenges,
  public.research_organization_request_again to service_role;
grant select on public.research_customer_account_bindings,public.research_organization_order_ownership to service_role;
grant insert on public.research_account_binding_events to service_role;
grant select(id) on public.research_account_binding_events to service_role;
revoke all on sequence public.research_account_binding_events_id_seq from public,anon,authenticated,service_role;
grant usage on sequence public.research_account_binding_events_id_seq to service_role;
revoke all on function public.research_organization_order_ownership_validate(),
  public.research_account_binding_events_immutable(),public.research_organization_request_again_validate()
  from public,anon,authenticated,service_role;
$foundation_ddl$;
  names text[] := array['research_account_organizations','research_organization_users','research_organization_invitations',
    'research_account_claim_challenges','research_customer_account_bindings','research_organization_order_ownership',
    'research_account_binding_events','research_organization_request_again'];
  expected_columns jsonb := $columns${
    "research_account_organizations":"id:uuid:true|slug:text:true|legal_name:text:true|display_name:text:true|status:text:true|purchasing_email:text:true|billing_email:text:true|phone:text:false|tax_id_last4:text:false|purchase_order_required:boolean:true|billing_address:jsonb:false|shipping_address:jsonb:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true",
    "research_organization_users":"id:uuid:true|organization_id:uuid:true|auth_user_id:uuid:true|email_at_binding:text:true|roles:text[]:true|state:text:true|binding_method:text:true|bound_by:text:true|bound_at:timestamp with time zone:true|revoked_at:timestamp with time zone:false|password_change_required:boolean:true|password_change_required_at:timestamp with time zone:false|password_changed_at:timestamp with time zone:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true",
    "research_organization_invitations":"id:uuid:true|organization_id:uuid:true|normalized_email:text:true|roles:text[]:true|token_hash:bytea:false|state:text:true|invited_by_auth_user_id:uuid:false|invited_by_label:text:true|expires_at:timestamp with time zone:false|accepted_by_auth_user_id:uuid:false|accepted_at:timestamp with time zone:false|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true",
    "research_account_claim_challenges":"id:uuid:true|auth_user_id:uuid:true|normalized_email:text:true|customer_ref:text:true|subject_type:text:true|member_id:uuid:false|organization_id:uuid:false|token_hash:bytea:true|expires_at:timestamp with time zone:true|consumed_at:timestamp with time zone:false|created_at:timestamp with time zone:true",
    "research_customer_account_bindings":"id:uuid:true|customer_ref:text:true|subject_type:text:true|member_id:uuid:false|organization_id:uuid:false|established_by_auth_user_id:uuid:true|established_from_claim_id:uuid:true|established_at:timestamp with time zone:true",
    "research_organization_order_ownership":"order_id:uuid:true|organization_id:uuid:true|placed_by_organization_user_id:uuid:false|established_from_customer_binding_id:uuid:false|ownership_basis:text:true|established_by_auth_user_id:uuid:true|established_at:timestamp with time zone:true",
    "research_account_binding_events":"id:bigint:true|event_type:text:true|auth_user_id:uuid:false|organization_id:uuid:false|organization_user_id:uuid:false|customer_ref:text:false|actor_label:text:true|detail:jsonb:true|occurred_at:timestamp with time zone:true",
    "research_organization_request_again":"id:uuid:true|organization_id:uuid:true|requested_by_auth_user_id:uuid:true|source_system:text:true|source_order_id:text:true|source_snapshot:jsonb:true|note:text:false|state:text:true|created_at:timestamp with time zone:true|updated_at:timestamp with time zone:true"
  }$columns$::jsonb;
  -- Independently specified semantics, parsed by PostgreSQL into EMPTY temporary
  -- reference relations. Never derive these expectations from installed objects
  -- or comments. No identities, credentials or customer data enter references.
  expected_defaults jsonb := $defaults${
    "research_account_organizations":{"id":"gen_random_uuid()","status":"'active'","purchase_order_required":"false","created_at":"clock_timestamp()","updated_at":"clock_timestamp()"},
    "research_organization_users":{"id":"gen_random_uuid()","state":"'active'","bound_at":"clock_timestamp()","password_change_required":"false","created_at":"clock_timestamp()","updated_at":"clock_timestamp()"},
    "research_organization_invitations":{"id":"gen_random_uuid()","state":"'pending'","created_at":"clock_timestamp()","updated_at":"clock_timestamp()"},
    "research_account_claim_challenges":{"id":"gen_random_uuid()","created_at":"clock_timestamp()"},
    "research_customer_account_bindings":{"id":"gen_random_uuid()","established_at":"clock_timestamp()"},
    "research_organization_order_ownership":{"established_at":"clock_timestamp()"},
    "research_account_binding_events":{"detail":"'{}'::jsonb","occurred_at":"clock_timestamp()"},
    "research_organization_request_again":{"id":"gen_random_uuid()","state":"'requested'","created_at":"clock_timestamp()","updated_at":"clock_timestamp()"}
  }$defaults$::jsonb;
  expected_checks jsonb := $checks${
    "research_account_organizations":["slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'","length(legal_name) between 1 and 200","length(display_name) between 1 and 160","status in ('active','suspended','closed')","purchasing_email = lower(purchasing_email)","billing_email = lower(billing_email)","tax_id_last4 is null or tax_id_last4 ~ '^\\d{4}$'"],
    "research_organization_users":["email_at_binding = lower(email_at_binding)","state in ('active','revoked')","binding_method in ('verified_invitation','operator_verified_auth_user')","length(bound_by) between 2 and 200","cardinality(roles) between 1 and 4","roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]","(password_change_required and password_change_required_at is not null) or (not password_change_required)","(state='active' and revoked_at is null) or (state='revoked' and revoked_at is not null)"],
    "research_organization_invitations":["normalized_email = lower(normalized_email)","cardinality(roles) between 1 and 4","state in ('pending','accepted','revoked','expired')","roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]","(state='pending' and token_hash is not null and expires_at is not null) or (state<>'pending')"],
    "research_account_claim_challenges":["normalized_email = lower(normalized_email)","customer_ref ~ '^eac_[a-f0-9]{32}$'","subject_type in ('personal','organization')","(subject_type='personal' and member_id is not null and organization_id is null) or (subject_type='organization' and organization_id is not null and member_id is null)"],
    "research_customer_account_bindings":["customer_ref ~ '^eac_[a-f0-9]{32}$'","subject_type in ('personal','organization')","(subject_type='personal' and member_id is not null and organization_id is null) or (subject_type='organization' and organization_id is not null and member_id is null)"],
    "research_organization_order_ownership":["ownership_basis in ('organization_checkout','verified_customer_claim')","(ownership_basis='organization_checkout' and placed_by_organization_user_id is not null and established_from_customer_binding_id is null) or (ownership_basis='verified_customer_claim' and established_from_customer_binding_id is not null and placed_by_organization_user_id is null)"],
    "research_account_binding_events":[],
    "research_organization_request_again":["source_system in ('research_order','early_access_placement','early_access_cart_checkout')","length(trim(source_order_id)) between 1 and 160","note is null or length(note)<=1000","state in ('requested','reviewing','converted','closed')"]
  }$checks$::jsonb;
  expected_unique jsonb := '{"research_account_organizations":["slug"],"research_organization_users":["organization_id,auth_user_id"],"research_customer_account_bindings":["customer_ref"],"research_organization_request_again":["organization_id,source_system,source_order_id"]}'::jsonb;
  expected_indexes jsonb := $indexes${
    "research_organization_users":["(auth_user_id) where state='active'"],
    "research_organization_invitations":["unique (organization_id,normalized_email) where state='pending'"],
    "research_account_claim_challenges":["(auth_user_id,created_at desc)"],
    "research_customer_account_bindings":["(member_id) where member_id is not null","(organization_id) where organization_id is not null"],
    "research_organization_order_ownership":["(organization_id,established_at desc)"],
    "research_account_binding_events":["(organization_id,occurred_at desc)"]
  }$indexes$::jsonb;
  permissions jsonb := '{"research_account_organizations":["SELECT"],"research_organization_users":["SELECT"],"research_organization_invitations":["SELECT","INSERT"],"research_account_claim_challenges":["SELECT","INSERT"],"research_customer_account_bindings":["SELECT"],"research_organization_order_ownership":["SELECT"],"research_account_binding_events":["INSERT"],"research_organization_request_again":["SELECT","INSERT"]}'::jsonb;
  column_permissions jsonb := '{"research_account_organizations":{"legal_name":["UPDATE"],"display_name":["UPDATE"],"purchasing_email":["UPDATE"],"billing_email":["UPDATE"],"phone":["UPDATE"],"tax_id_last4":["UPDATE"],"purchase_order_required":["UPDATE"],"billing_address":["UPDATE"],"shipping_address":["UPDATE"],"updated_at":["UPDATE"]},"research_organization_users":{"password_change_required":["UPDATE"],"password_changed_at":["UPDATE"],"updated_at":["UPDATE"]},"research_account_binding_events":{"id":["SELECT"]}}'::jsonb;
  expected_owner oid; service_id oid; n text; t regclass; c pg_catalog.pg_class;
  p pg_catalog.pg_proc; f record; edge record; privilege text; actual_columns text[];
  count_tables integer; pass integer; first_install boolean; signature text; marker text;
  refs jsonb := '{}'::jsonb; pending_markers jsonb := '{}'::jsonb;
  definition text; fragment text; column_name text; column_type text; ref_name text; index_name text;
  ref_table regclass; ref_id smallint; contract_number integer := 0; index_number integer := 0;
  actual_contract jsonb; reference_contract jsonb;
begin
  if to_regclass('auth.users') is null or to_regclass('public.research_members') is null
    or to_regclass('public.research_orders') is null then
    raise exception 'account foundation requires canonical Auth, member and order prerequisites';
  end if;
  if to_regrole('anon') is null or to_regrole('authenticated') is null or to_regrole('service_role') is null then
    raise exception 'account foundation requires canonical API roles'; end if;
  for f in select * from (values ('auth.users','id','uuid'),('auth.users','email','text,character varying'),
    ('auth.users','email_confirmed_at','timestamp with time zone'),('public.research_members','id','uuid'),
    ('public.research_members','auth_user_id','uuid'),('public.research_orders','id','uuid')) q(relation,column_name,types) loop
    if not exists(select 1 from pg_catalog.pg_attribute a where a.attrelid=to_regclass(f.relation) and a.attname=f.column_name and not a.attisdropped
      and format_type(a.atttypid,null)=any(string_to_array(f.types,','))) then
      raise exception 'account foundation canonical prerequisite shape unavailable'; end if;
  end loop;
  select relowner into expected_owner from pg_catalog.pg_class where oid='public.research_members'::regclass;
  service_id:=to_regrole('service_role')::oid;
  if expected_owner in (to_regrole('anon')::oid,to_regrole('authenticated')::oid,service_id)
    or current_user::regrole::oid<>expected_owner then
    raise exception 'account foundation must be installed by the canonical object owner'; end if;
  select count(*) into count_tables from unnest(names) q where to_regclass('public.'||q) is not null;
  first_install:=count_tables=0;
  if count_tables not in (0,8) then raise exception 'account foundation partial baseline'; end if;
  if first_install and (to_regclass('public.research_account_binding_events_id_seq') is not null or exists(
    select 1 from pg_catalog.pg_proc routine_probe where routine_probe.pronamespace='public'::regnamespace and routine_probe.proname in
      ('research_bind_verified_organization_user','research_account_commit_customer_claim','research_account_accept_organization_invitation',
       'research_organization_order_ownership_validate','research_account_binding_events_immutable','research_organization_request_again_validate'))) then
    raise exception 'account foundation partial routine baseline'; end if;

  -- IF NOT EXISTS must never silently accept a same-name index on another table.
  for f in select * from (values
    ('research_organization_users_auth_idx','research_organization_users'),
    ('research_organization_invitations_pending_email_idx','research_organization_invitations'),
    ('research_account_claim_challenges_actor_idx','research_account_claim_challenges'),
    ('research_customer_account_bindings_member_idx','research_customer_account_bindings'),
    ('research_customer_account_bindings_org_idx','research_customer_account_bindings'),
    ('research_organization_order_ownership_org_idx','research_organization_order_ownership'),
    ('research_account_binding_events_org_idx','research_account_binding_events')
  ) q(index_name,table_name) loop
    if to_regclass('public.'||f.index_name) is not null and not exists(
      select 1 from pg_catalog.pg_index i join pg_catalog.pg_class x on x.oid=i.indexrelid
      where i.indexrelid=to_regclass('public.'||f.index_name) and i.indrelid=to_regclass('public.'||f.table_name)
        and x.relowner=expected_owner and x.relkind='i') then
      raise exception 'account foundation index name collision: %',f.index_name; end if;
  end loop;

  -- Native parsing avoids brittle version-dependent deparser string guesses.
  -- No IF NOT EXISTS here: temporary reference-name collisions must fail too.
  foreach n in array names loop
    contract_number:=contract_number+1;
    ref_name:='account_contract_'||txid_current()::text||'_'||contract_number::text;
    definition:='';
    foreach fragment in array string_to_array(expected_columns->>n,'|') loop
      column_name:=split_part(fragment,':',1); column_type:=split_part(fragment,':',2);
      definition:=definition||case when definition='' then '' else ',' end||format('%I %s',column_name,column_type);
      if n='research_account_binding_events' and column_name='id' then definition:=definition||' generated always as identity'; end if;
      if split_part(fragment,':',3)='true' then definition:=definition||' not null'; end if;
      if expected_defaults->n ? column_name then definition:=definition||' default '||(expected_defaults->n->>column_name); end if;
    end loop;
    definition:=definition||format(',primary key(%I)',split_part(split_part(expected_columns->>n,'|',1),':',1));
    for fragment in select jsonb_array_elements_text(expected_checks->n) loop definition:=definition||',check('||fragment||')'; end loop;
    for fragment in select jsonb_array_elements_text(coalesce(expected_unique->n,'[]'::jsonb)) loop definition:=definition||',unique('||fragment||')'; end loop;
    execute format('create temporary table pg_temp.%I (%s) on commit drop',ref_name,definition);
    ref_table:=to_regclass('pg_temp.'||ref_name);
    refs:=refs||jsonb_build_object(n,ref_table::oid::text);
    for fragment in select jsonb_array_elements_text(coalesce(expected_indexes->n,'[]'::jsonb)) loop
      index_number:=index_number+1; index_name:='account_contract_index_'||txid_current()::text||'_'||index_number::text;
      if left(fragment,7)='unique ' then
        execute format('create unique index %I on %s %s',index_name,ref_table,substring(fragment from 8));
      else execute format('create index %I on %s %s',index_name,ref_table,fragment); end if;
    end loop;
  end loop;

  -- The same checks run BEFORE any replacement on reapply and AFTER fresh DDL.
  -- A poisoned baseline cannot be repaired into looking like a valid install.
  for pass in 0..1 loop
    if not (pass=0 and first_install) then
      foreach n in array names loop
        t:=to_regclass('public.'||n);
        select * into c from pg_catalog.pg_class where oid=t;
        if not found or c.relowner<>expected_owner or c.relkind<>'r' or not c.relrowsecurity or c.relforcerowsecurity
          or exists(select 1 from pg_catalog.pg_policy where polrelid=t)
          or exists(select 1 from pg_catalog.pg_rewrite where ev_class=t) then
          raise exception 'account foundation table authority drift: %',n; end if;
        if c.relispartition or exists(select 1 from pg_catalog.pg_inherits where inhrelid=t or inhparent=t) then
          raise exception 'account foundation inheritance or partition drift: %',n; end if;
        select array_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text order by a.attnum)
          into actual_columns from pg_catalog.pg_attribute a where a.attrelid=t and a.attnum>0 and not a.attisdropped;
        if actual_columns is distinct from string_to_array(expected_columns->>n,'|')
          or exists(select 1 from pg_catalog.pg_attribute where attrelid=t and attnum>0 and (attisdropped or attgenerated<>''))
          or not exists(select 1 from pg_catalog.pg_constraint where conrelid=t and contype='p' and conkey=array[1]::smallint[] and not condeferrable)
          or exists(select 1 from pg_catalog.pg_constraint where conrelid=t and (not convalidated or condeferrable)) then
          raise exception 'account foundation table structure drift: %',n; end if;
        if n='research_account_binding_events' then
          if not exists(select 1 from pg_catalog.pg_attribute where attrelid=t and attnum=1 and attidentity='a') then
            raise exception 'account foundation identity drift'; end if;
        elsif n<>'research_organization_order_ownership' then
          if not exists(select 1 from pg_catalog.pg_attrdef where adrelid=t and adnum=1 and pg_get_expr(adbin,adrelid)='gen_random_uuid()') then
            raise exception 'account foundation UUID default drift: %',n; end if;
        end if;
        if exists(select 1 from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('r',c.relowner))) a
          where a.grantee<>expected_owner and (a.grantee<>service_id or a.is_grantable or not (permissions->n ? a.privilege_type))) then
          raise exception 'account foundation table privilege drift: %',n; end if;
        for privilege in select jsonb_array_elements_text(permissions->n) loop
          if not has_table_privilege('service_role',t,privilege) then raise exception 'account foundation missing service privilege: % %',n,privilege; end if;
        end loop;
        if exists(select 1 from pg_catalog.pg_attribute a cross join lateral pg_catalog.aclexplode(a.attacl) x
          where a.attrelid=t and a.attnum>0 and x.grantee<>expected_owner and
            (x.grantee<>service_id or x.is_grantable or not coalesce(column_permissions->n->a.attname ? x.privilege_type,false))) then
          raise exception 'account foundation column privilege drift: %',n; end if;
        for f in select key,value from jsonb_each(coalesce(column_permissions->n,'{}'::jsonb)) loop
          for privilege in select jsonb_array_elements_text(f.value) loop
            if not has_column_privilege('service_role',t,f.key,privilege) then
              raise exception 'account foundation column privilege missing: % % %',n,f.key,privilege; end if;
          end loop;
        end loop;
        if has_table_privilege('anon',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_table_privilege('authenticated',t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
          or has_any_column_privilege('anon',t,'SELECT,INSERT,UPDATE,REFERENCES')
          or has_any_column_privilege('authenticated',t,'SELECT,INSERT,UPDATE,REFERENCES') then
          raise exception 'account foundation effective browser privilege drift'; end if;

        ref_table:=(refs->>n)::oid::regclass;
        select jsonb_agg(jsonb_build_array(a.attname,a.attidentity,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
          into actual_contract from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
          where a.attrelid=t and a.attnum>0 and not a.attisdropped;
        select jsonb_agg(jsonb_build_array(a.attname,a.attidentity,a.attcollation,pg_get_expr(d.adbin,d.adrelid)) order by a.attnum)
          into reference_contract from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum
          where a.attrelid=ref_table and a.attnum>0 and not a.attisdropped;
        if actual_contract is distinct from reference_contract then raise exception 'account foundation default contract drift: %',n; end if;
        select jsonb_agg(x.contract order by x.contract) into actual_contract from (
          select jsonb_build_array(pg_get_expr(conbin,conrelid),connoinherit,conislocal,coninhcount,convalidated,condeferrable,condeferred) as contract
          from pg_catalog.pg_constraint where conrelid=t and contype='c') x;
        select jsonb_agg(x.contract order by x.contract) into reference_contract from (
          select jsonb_build_array(pg_get_expr(conbin,conrelid),connoinherit,conislocal,coninhcount,convalidated,condeferrable,condeferred) as contract
          from pg_catalog.pg_constraint where conrelid=ref_table and contype='c') x;
        if actual_contract is distinct from reference_contract then raise exception 'account foundation CHECK contract drift: %',n; end if;
        select jsonb_agg(x.contract order by x.contract) into actual_contract from (
          select jsonb_build_array(am.amname,i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,i.indisvalid,i.indisready,i.indislive,
            i.indnullsnotdistinct,i.indnkeyatts,i.indnatts,i.indkey::text,i.indclass::text,i.indcollation::text,i.indoption::text,
            pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) as contract
          from pg_catalog.pg_index i join pg_catalog.pg_class x on x.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=x.relam where i.indrelid=t
        ) x;
        select jsonb_agg(x.contract order by x.contract) into reference_contract from (
          select jsonb_build_array(am.amname,i.indisunique,i.indisprimary,i.indisexclusion,i.indimmediate,i.indisvalid,i.indisready,i.indislive,
            i.indnullsnotdistinct,i.indnkeyatts,i.indnatts,i.indkey::text,i.indclass::text,i.indcollation::text,i.indoption::text,
            pg_get_expr(i.indexprs,i.indrelid),pg_get_expr(i.indpred,i.indrelid)) as contract
          from pg_catalog.pg_index i join pg_catalog.pg_class x on x.oid=i.indexrelid join pg_catalog.pg_am am on am.oid=x.relam where i.indrelid=ref_table
        ) x;
        if actual_contract is distinct from reference_contract then raise exception 'account foundation index contract drift: %',n; end if;

        -- Fingerprints include defaults, full CHECK/unique/FK/index definitions,
        -- trigger definitions/enabled state and policies; never rows or secrets.
        select encode(sha256(convert_to(jsonb_build_object(
          'columns',(select jsonb_agg(jsonb_build_array(a.attname,format_type(a.atttypid,a.atttypmod),a.attnotnull,a.attidentity,a.attgenerated,
            pg_get_expr(d.adbin,d.adrelid)) order by a.attnum) from pg_catalog.pg_attribute a left join pg_catalog.pg_attrdef d
            on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=t and a.attnum>0 and not a.attisdropped),
          'constraints',(select jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid),convalidated,condeferrable,condeferred) order by conname) from pg_catalog.pg_constraint where conrelid=t),
          'indexes',(select jsonb_agg(pg_get_indexdef(indexrelid) order by indexrelid::regclass::text) from pg_catalog.pg_index where indrelid=t),
          'triggers',(select jsonb_agg(jsonb_build_array(tgname,pg_get_triggerdef(oid),tgenabled) order by tgname) from pg_catalog.pg_trigger where tgrelid=t and not tgisinternal)
        )::text,'UTF8')),'hex') into signature;
        marker:='xenios.account-foundation.v1:'||signature;
        if pass=1 and first_install then pending_markers:=pending_markers||jsonb_build_object(n,marker);
        elsif obj_description(t,'pg_class') is distinct from marker then raise exception 'account foundation metadata fingerprint drift: %',n; end if;
      end loop;

      for f in select * from (values
        ('research_organization_order_ownership','research_organization_order_ownership_validate',31),
        ('research_account_binding_events','research_account_binding_events_immutable',27),
        ('research_organization_request_again','research_organization_request_again_validate',7)
      ) x(table_name,function_name,kind) loop
        if not exists(select 1 from pg_catalog.pg_trigger where tgrelid=to_regclass('public.'||f.table_name)
          and tgname=f.function_name and tgfoid=to_regprocedure('public.'||f.function_name||'()')
          and tgtype=f.kind and tgenabled='O' and tgnargs=0 and tgqual is null and not tgisinternal) then
          raise exception 'account foundation validation trigger drift'; end if;
      end loop;
      if (select count(*) from pg_catalog.pg_trigger where tgrelid in (select to_regclass('public.'||q) from unnest(names) q) and not tgisinternal)<>3 then
        raise exception 'account foundation unexpected validation trigger'; end if;

      for edge in select * from (values
        ('research_organization_users',2,'public.research_account_organizations','a'),('research_organization_users',3,'auth.users','a'),
        ('research_organization_invitations',2,'public.research_account_organizations','a'),('research_organization_invitations',7,'auth.users','a'),('research_organization_invitations',10,'auth.users','a'),
        ('research_account_claim_challenges',2,'auth.users','a'),('research_account_claim_challenges',6,'public.research_members','a'),('research_account_claim_challenges',7,'public.research_account_organizations','a'),
        ('research_customer_account_bindings',4,'public.research_members','a'),('research_customer_account_bindings',5,'public.research_account_organizations','a'),('research_customer_account_bindings',6,'auth.users','a'),('research_customer_account_bindings',7,'public.research_account_claim_challenges','a'),
        ('research_organization_order_ownership',1,'public.research_orders','r'),('research_organization_order_ownership',2,'public.research_account_organizations','a'),('research_organization_order_ownership',3,'public.research_organization_users','a'),('research_organization_order_ownership',4,'public.research_customer_account_bindings','a'),('research_organization_order_ownership',6,'auth.users','a'),
        ('research_account_binding_events',3,'auth.users','a'),('research_account_binding_events',4,'public.research_account_organizations','a'),('research_account_binding_events',5,'public.research_organization_users','a'),
        ('research_organization_request_again',2,'public.research_account_organizations','a'),('research_organization_request_again',3,'auth.users','a')
      ) e(table_name,column_number,target,delete_action) loop
        select attnum into ref_id from pg_catalog.pg_attribute where attrelid=to_regclass(edge.target) and attname='id'
          and atttypid='uuid'::regtype and attnotnull and not attisdropped;
        if not found or not exists(select 1 from pg_catalog.pg_constraint where conrelid=to_regclass(edge.target)
          and contype in ('p','u') and conkey=array[ref_id]::smallint[] and convalidated and not condeferrable) then
          raise exception 'account foundation referenced canonical id unavailable'; end if;
        if not exists(select 1 from pg_catalog.pg_constraint where conrelid=to_regclass('public.'||edge.table_name) and contype='f'
          and conkey=array[edge.column_number]::smallint[] and confrelid=to_regclass(edge.target) and confkey=array[ref_id]::smallint[]
          and confdeltype::text=edge.delete_action and confupdtype='a') then raise exception 'account foundation foreign key drift'; end if;
      end loop;
      if (select count(*) from pg_catalog.pg_constraint where conrelid in(select to_regclass('public.'||q) from unnest(names) q) and contype='f')<>22 then
        raise exception 'account foundation foreign key contract drift'; end if;
      for f in select * from (values
        ('research_account_organizations',array[2]::smallint[]),('research_organization_users',array[2,3]::smallint[]),
        ('research_customer_account_bindings',array[2]::smallint[]),('research_organization_request_again',array[2,4,5]::smallint[])
      ) k(table_name,columns) loop
        if not exists(select 1 from pg_catalog.pg_constraint where conrelid=to_regclass('public.'||f.table_name) and contype='u' and conkey=f.columns) then
          raise exception 'account foundation uniqueness drift'; end if;
      end loop;

      select * into c from pg_catalog.pg_class where oid='public.research_account_binding_events_id_seq'::regclass;
      if c.relkind<>'S' or c.relowner<>expected_owner or exists(
        select 1 from pg_catalog.aclexplode(coalesce(c.relacl,pg_catalog.acldefault('S',c.relowner))) a where a.grantee<>expected_owner
          and (a.grantee<>service_id or a.privilege_type<>'USAGE' or a.is_grantable))
        or not has_sequence_privilege('service_role',c.oid,'USAGE')
        or has_sequence_privilege('anon',c.oid,'USAGE,SELECT,UPDATE') or has_sequence_privilege('authenticated',c.oid,'USAGE,SELECT,UPDATE') then
        raise exception 'account foundation sequence authority drift'; end if;
      if not exists(select 1 from pg_catalog.pg_depend where classid='pg_class'::regclass and objid=c.oid
        and refobjid='public.research_account_binding_events'::regclass and refobjsubid=1 and deptype='i')
        or not exists(select 1 from pg_catalog.pg_sequence where seqrelid=c.oid and seqtypid='bigint'::regtype
          and seqstart=1 and seqincrement=1 and seqmin=1 and seqmax=9223372036854775807 and seqcache=1 and not seqcycle) then
        raise exception 'account foundation identity sequence drift'; end if;

      for f in select * from (values
        ('public.research_bind_verified_organization_user(uuid,uuid,text,text[],text,boolean)',true,'526eead82a2908b21c67d9f41c411867d93e5bb4d125333656bdf4c1c45f6119','uuid',1,array['p_organization_id','p_auth_user_id','p_expected_email','p_roles','p_actor_label','p_password_change_required']),
        ('public.research_account_commit_customer_claim(uuid,bytea,uuid,text)',true,'24cf5b2dba9a489f98031bc653bffbf89cfbfd50cbf9c2c34ff5baa4f7fa0908','text',0,array['p_claim_id','p_token_hash','p_auth_user_id','p_verified_email']),
        ('public.research_account_accept_organization_invitation(uuid,bytea,uuid,text)',true,'85b9a47f2ee1a04a2feeb3d80c912106314abbbdb8b63105e1c33668d5f43d16','text',0,array['p_invitation_id','p_token_hash','p_auth_user_id','p_verified_email']),
        ('public.research_organization_order_ownership_validate()',false,'f11cbab767a9bcee6ca83ed95222cfcf28347f20b4a4eb52d302bce7a91865d1','trigger',0,null::text[]),
        ('public.research_account_binding_events_immutable()',false,'fbd2b6eba22576e6c8b3e04711ce85fa7fb8ee61fe7888d48caec70c484bb764','trigger',0,null::text[]),
        ('public.research_organization_request_again_validate()',false,'0eba7e32e91485207be43844031099641108567704a67502e0044c722d7de519','trigger',0,null::text[])
      ) q(identity,definer,body_hash,result_type,defaults,argnames) loop
        select * into p from pg_catalog.pg_proc where oid=to_regprocedure(f.identity);
        if not found or p.proowner<>expected_owner or p.prosecdef<>f.definer
          or p.proconfig is distinct from array['search_path=""']::text[] or p.prokind<>'f' or p.proretset
          or p.provolatile<>'v' or p.proparallel<>'u' or p.proleakproof or p.proisstrict or p.pronargdefaults<>f.defaults
          or p.proargnames is distinct from f.argnames or p.proargmodes is not null
          or (f.defaults=1 and pg_get_expr(p.proargdefaults,0)<>'true')
          or p.prolang<>(select oid from pg_catalog.pg_language where lanname='plpgsql')
          or p.prorettype<>f.result_type::regtype
          or exists(select 1 from pg_catalog.pg_proc other where other.pronamespace=p.pronamespace and other.proname=p.proname and other.oid<>p.oid)
          or (encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')<>f.body_hash and
            not (p.proname='research_account_commit_customer_claim' and encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')='489d364560c1edc12b77a1a9355ffb908b3077ccd6a18a46d8e3cf9f5518bcec'))
          or exists(select 1 from pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a
            where a.grantee<>expected_owner and (not f.definer or a.grantee<>service_id or a.privilege_type<>'EXECUTE' or a.is_grantable))
          or (f.definer and not has_function_privilege('service_role',p.oid,'EXECUTE'))
          or has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') then
          raise exception 'account foundation routine authority drift: %',f.identity; end if;
      end loop;
      -- No seal is written until every independent contract, graph, ABI and
      -- privilege check has passed for the complete foundation.
      if pass=1 and first_install then
        for f in select key,value from jsonb_each_text(pending_markers) loop
          execute format('comment on table public.%I is %L',f.key,f.value);
        end loop;
      end if;
    end if;
    if pass=0 then execute v_ddl; end if;
  end loop;
end;
$guarded_foundation$;
commit;
