-- PACK02 TEMPORARY B2B BUYER BRIDGE — CANDIDATE ONLY. DO NOT APPLY.
--
-- Purpose: provide a short-lived, non-colliding business-buyer authorization
-- bridge while the existing partner/reporting public.research_organizations
-- table and the Pack02 buyer-profile design are converged by the DB owner.
--
-- This creates no auth, catalog, cart, checkout, order, payment, fulfillment,
-- or organization principal. Supabase Auth and research_members remain the
-- human identity authorities; research_orders remains the order authority.
-- These rows are authorization, pricing-entitlement, and immutable ownership
-- evidence only.
--
-- REQUIRED BEFORE PROMOTION:
--   * isolated apply-twice rehearsal and rollback rehearsal
--   * SECURITY DEFINER, RLS, and grant review
--   * exact production schema fingerprint and dependency inspection
--   * checkout integration proving ownership is claimed before payment IO
--   * Agentic OS and database-owner approval

begin;

do $$
begin
  if to_regclass('public.research_members') is null then
    raise exception 'B2B bridge requires canonical public.research_members';
  end if;
  if to_regclass('public.research_orders') is null then
    raise exception 'B2B bridge requires canonical public.research_orders';
  end if;

  -- The bridge deliberately does not depend on research_organizations. If it
  -- exists today, prove it is the known partner/reporting principal and fail
  -- rather than silently treating it as the incompatible Pack02 buyer shape.
  if to_regclass('public.research_organizations') is not null then
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='research_organizations'
         and column_name='owner_partner_id'
    ) or not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='research_organizations'
         and column_name='name'
    ) then
      raise exception
        'research_organizations does not match the known partner/reporting schema; stop for DB-owner reconciliation';
    end if;
    if exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name='research_organizations'
         and column_name in ('slug','purchasing_email','billing_email')
    ) then
      raise exception
        'research_organizations appears partially converged; the temporary bridge must be reviewed again';
    end if;
  end if;
end;
$$;

create table if not exists public.research_b2b_buyer_relationships (
  id uuid primary key default gen_random_uuid(),
  business_key text not null unique
    check (business_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_display_name text not null
    check (length(btrim(business_display_name)) between 1 and 160),
  -- Unknown until the business supplies it. Display name is not silently
  -- promoted into a legal fact.
  business_legal_name text
    check (business_legal_name is null or length(btrim(business_legal_name)) between 1 and 200),
  relationship_type text not null
    check (relationship_type='b2b2c_marketplace_partner'),
  state text not null default 'active'
    check (state in ('active','suspended','closed','migrated')),
  approved_by_auth_user_id uuid not null references auth.users(id),
  approved_at timestamptz not null,
  migrated_organization_id uuid,
  migrated_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_b2b_relationship_migration_coherent check (
    (state='migrated' and migrated_organization_id is not null and migrated_at is not null)
    or (state<>'migrated' and migrated_organization_id is null and migrated_at is null)
  )
);

create table if not exists public.research_b2b_buyer_operators (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null
    references public.research_b2b_buyer_relationships(id) on delete restrict,
  member_id uuid not null references public.research_members(id) on delete restrict,
  roles text[] not null,
  state text not null default 'active' check (state in ('active','revoked')),
  binding_method text not null check (binding_method='operator_verified_member'),
  bound_by_auth_user_id uuid not null references auth.users(id),
  bound_at timestamptz not null,
  revoked_by_auth_user_id uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_b2b_operator_roles_nonempty check (cardinality(roles) between 1 and 4),
  constraint research_b2b_operator_roles_known check (
    roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[]
  ),
  constraint research_b2b_operator_revocation_coherent check (
    (state='active' and revoked_by_auth_user_id is null and revoked_at is null)
    or (state='revoked' and revoked_by_auth_user_id is not null and revoked_at is not null)
  ),
  unique (relationship_id, member_id)
);
create unique index if not exists research_b2b_operator_one_active_relationship_idx
  on public.research_b2b_buyer_operators(member_id) where state='active';
create index if not exists research_b2b_operator_relationship_idx
  on public.research_b2b_buyer_operators(relationship_id) where state='active';

create table if not exists public.research_b2b_buyer_entitlements (
  id uuid primary key default gen_random_uuid(),
  relationship_id uuid not null
    references public.research_b2b_buyer_relationships(id) on delete restrict,
  -- This candidate intentionally permits exactly the founder-approved profile.
  -- Adding a profile requires another reviewed migration, never a free-form row.
  profile_key text not null check (profile_key='KRIS_VOLUME_PARTNER'),
  version integer not null check (version > 0),
  state text not null default 'active'
    check (state in ('active','suspended','expired','revoked')),
  effective_at timestamptz not null,
  expires_at timestamptz,
  approved_by_auth_user_id uuid not null references auth.users(id),
  approved_at timestamptz not null,
  revoked_by_auth_user_id uuid references auth.users(id),
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_b2b_entitlement_window check (
    expires_at is null or expires_at > effective_at
  ),
  constraint research_b2b_entitlement_revocation_coherent check (
    (state='revoked' and revoked_by_auth_user_id is not null and revoked_at is not null)
    or (state<>'revoked' and revoked_by_auth_user_id is null and revoked_at is null)
  ),
  unique (relationship_id, profile_key, version)
);
create unique index if not exists research_b2b_entitlement_one_active_profile_idx
  on public.research_b2b_buyer_entitlements(relationship_id, profile_key)
  where state='active';

create table if not exists public.research_b2b_order_ownership (
  order_id uuid primary key references public.research_orders(id) on delete restrict,
  relationship_id uuid not null
    references public.research_b2b_buyer_relationships(id) on delete restrict,
  operator_id uuid not null references public.research_b2b_buyer_operators(id) on delete restrict,
  placed_by_member_id uuid not null references public.research_members(id) on delete restrict,
  entitlement_id uuid not null
    references public.research_b2b_buyer_entitlements(id) on delete restrict,
  pricing_profile_key text not null check (pricing_profile_key='KRIS_VOLUME_PARTNER'),
  pricing_profile_version integer not null check (pricing_profile_version > 0),
  established_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp()
);
create index if not exists research_b2b_order_ownership_relationship_idx
  on public.research_b2b_order_ownership(relationship_id, established_at desc);
create index if not exists research_b2b_order_ownership_member_idx
  on public.research_b2b_order_ownership(placed_by_member_id, established_at desc);

create table if not exists public.research_b2b_buyer_events (
  id bigint generated always as identity primary key,
  event_type text not null check (event_type in (
    'relationship_activated','operator_bound','entitlement_activated',
    'order_ownership_established','bridge_migrated'
  )),
  relationship_id uuid not null
    references public.research_b2b_buyer_relationships(id) on delete restrict,
  member_id uuid references public.research_members(id) on delete restrict,
  order_id uuid references public.research_orders(id) on delete restrict,
  actor_auth_user_id uuid not null references auth.users(id),
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp()
);
create index if not exists research_b2b_buyer_events_relationship_idx
  on public.research_b2b_buyer_events(relationship_id, occurred_at desc);

create or replace function public.research_b2b_binding_facts_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  if tg_op='DELETE' then
    raise exception 'B2B binding facts cannot be deleted' using errcode='55000';
  end if;
  if tg_table_name='research_b2b_buyer_relationships' and (
    new.id is distinct from old.id
    or new.business_key is distinct from old.business_key
    or new.business_display_name is distinct from old.business_display_name
    or new.business_legal_name is distinct from old.business_legal_name
    or new.relationship_type is distinct from old.relationship_type
    or new.approved_by_auth_user_id is distinct from old.approved_by_auth_user_id
    or new.approved_at is distinct from old.approved_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'B2B relationship identity/approval facts are immutable' using errcode='55000';
  end if;
  if tg_table_name='research_b2b_buyer_operators' and (
    new.id is distinct from old.id
    or new.relationship_id is distinct from old.relationship_id
    or new.member_id is distinct from old.member_id
    or new.roles is distinct from old.roles
    or new.binding_method is distinct from old.binding_method
    or new.bound_by_auth_user_id is distinct from old.bound_by_auth_user_id
    or new.bound_at is distinct from old.bound_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'B2B operator binding facts are immutable' using errcode='55000';
  end if;
  if tg_table_name='research_b2b_buyer_entitlements' and (
    new.id is distinct from old.id
    or new.relationship_id is distinct from old.relationship_id
    or new.profile_key is distinct from old.profile_key
    or new.version is distinct from old.version
    or new.effective_at is distinct from old.effective_at
    or new.expires_at is distinct from old.expires_at
    or new.approved_by_auth_user_id is distinct from old.approved_by_auth_user_id
    or new.approved_at is distinct from old.approved_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'B2B entitlement economic/approval facts are immutable' using errcode='55000';
  end if;
  return new;
end;
$$;

drop trigger if exists research_b2b_relationship_facts_immutable
  on public.research_b2b_buyer_relationships;
create trigger research_b2b_relationship_facts_immutable
before update or delete on public.research_b2b_buyer_relationships
for each row execute function public.research_b2b_binding_facts_immutable();

drop trigger if exists research_b2b_operator_facts_immutable
  on public.research_b2b_buyer_operators;
create trigger research_b2b_operator_facts_immutable
before update or delete on public.research_b2b_buyer_operators
for each row execute function public.research_b2b_binding_facts_immutable();

drop trigger if exists research_b2b_entitlement_facts_immutable
  on public.research_b2b_buyer_entitlements;
create trigger research_b2b_entitlement_facts_immutable
before update or delete on public.research_b2b_buyer_entitlements
for each row execute function public.research_b2b_binding_facts_immutable();

create or replace function public.research_b2b_history_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
begin
  raise exception 'B2B ownership and event history is immutable' using errcode='55000';
end;
$$;

drop trigger if exists research_b2b_order_ownership_immutable
  on public.research_b2b_order_ownership;
create trigger research_b2b_order_ownership_immutable
before update or delete on public.research_b2b_order_ownership
for each row execute function public.research_b2b_history_immutable();

drop trigger if exists research_b2b_buyer_events_immutable
  on public.research_b2b_buyer_events;
create trigger research_b2b_buyer_events_immutable
before update or delete on public.research_b2b_buyer_events
for each row execute function public.research_b2b_history_immutable();

create or replace function public.research_b2b_order_ownership_validate()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  v_order public.research_orders%rowtype;
  v_operator public.research_b2b_buyer_operators%rowtype;
  v_relationship public.research_b2b_buyer_relationships%rowtype;
  v_entitlement public.research_b2b_buyer_entitlements%rowtype;
begin
  select * into v_order from public.research_orders where id=new.order_id for update;
  if not found or v_order.member_id<>new.placed_by_member_id then
    raise exception 'canonical order/member ownership mismatch' using errcode='42501';
  end if;

  -- Provider authorization/capture is forbidden before the durable business
  -- ownership claim. A failure can leave only an unpaid canonical draft.
  if v_order.state not in ('draft','checkout_pending','manual_review')
     or v_order.payment_reference is not null
     or coalesce(v_order.authorized_amount_cents,0)<>0
     or coalesce(v_order.captured_amount_cents,0)<>0
     or coalesce(v_order.refunded_cents,0)<>0 then
    raise exception 'business ownership must be established before payment activity'
      using errcode='55000';
  end if;

  select * into v_relationship
    from public.research_b2b_buyer_relationships
   where id=new.relationship_id for share;
  if not found or v_relationship.state<>'active'
     or v_relationship.migrated_organization_id is not null then
    raise exception 'business buyer relationship is not active' using errcode='42501';
  end if;

  select * into v_operator
    from public.research_b2b_buyer_operators
   where id=new.operator_id for share;
  if not found or v_operator.relationship_id<>new.relationship_id
     or v_operator.member_id<>new.placed_by_member_id
     or v_operator.state<>'active'
     or not (v_operator.roles && array['organization_owner','business_buyer']::text[]) then
    raise exception 'member lacks active business buyer authority' using errcode='42501';
  end if;

  select * into v_entitlement
    from public.research_b2b_buyer_entitlements
   where id=new.entitlement_id for share;
  if not found or v_entitlement.relationship_id<>new.relationship_id
     or v_entitlement.profile_key<>new.pricing_profile_key
     or v_entitlement.version<>new.pricing_profile_version
     or v_entitlement.state<>'active'
     or v_entitlement.effective_at>new.established_at
     or (v_entitlement.expires_at is not null and v_entitlement.expires_at<=new.established_at) then
    raise exception 'business pricing entitlement is not active' using errcode='42501';
  end if;

  return new;
end;
$$;

drop trigger if exists research_b2b_order_ownership_validate
  on public.research_b2b_order_ownership;
create trigger research_b2b_order_ownership_validate
before insert on public.research_b2b_order_ownership
for each row execute function public.research_b2b_order_ownership_validate();

-- Initial activation is an internal, audited action. It never creates Auth or
-- member records and never accepts an email as the authorization key.
create or replace function public.research_activate_b2b_buyer_bridge(
  p_member_id uuid,
  p_expected_auth_user_id uuid,
  p_business_key text,
  p_business_display_name text,
  p_business_legal_name text,
  p_roles text[],
  p_profile_version integer,
  p_effective_at timestamptz
)
returns table(relationship_id uuid, operator_id uuid, entitlement_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_member public.research_members%rowtype;
  v_relationship_id uuid;
  v_operator_id uuid;
  v_entitlement_id uuid;
  -- Exact invoking Supabase Auth principal. Never accepted as an argument.
  v_actor_auth_user_id uuid := auth.uid();
  v_actor_authorized boolean := false;
begin
  if v_actor_auth_user_id is null then
    raise exception 'authenticated activation actor is required' using errcode='42501';
  end if;
  if to_regclass('public.research_prelaunch_role_assignments') is null then
    raise exception 'internal role authority is unavailable' using errcode='55000';
  end if;
  execute $q$
    select exists(
      select 1 from public.research_prelaunch_role_assignments
       where auth_user_id=$1
         and role in ('super_admin','operations_admin')
         and revoked_at is null
         and (expires_at is null or expires_at>clock_timestamp())
    )
  $q$ into v_actor_authorized using v_actor_auth_user_id;
  if not v_actor_authorized then
    raise exception 'actor lacks B2B activation authority' using errcode='42501';
  end if;

  select * into v_member from public.research_members where id=p_member_id for share;
  if not found or v_member.status<>'active'
     or v_member.auth_user_id<>p_expected_auth_user_id then
    raise exception 'exact active Auth/member binding was not proved' using errcode='42501';
  end if;
  if btrim(p_business_key)<>p_business_key
     or p_business_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(btrim(p_business_display_name)) not between 1 and 160
     or length(btrim(p_business_legal_name)) not between 1 and 200 then
    raise exception 'business identity is invalid' using errcode='22023';
  end if;
  if cardinality(p_roles)<1
     or not (p_roles <@ array['organization_owner','organization_admin','business_buyer','billing_viewer']::text[])
     or not (p_roles && array['organization_owner','business_buyer']::text[])
     or p_profile_version<1 then
    raise exception 'buyer role or profile version is invalid' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('b2b:' || p_business_key, 0));

  insert into public.research_b2b_buyer_relationships(
    business_key,business_display_name,business_legal_name,relationship_type,state,
    approved_by_auth_user_id,approved_at
  ) values (
    p_business_key,p_business_display_name,p_business_legal_name,
    'b2b2c_marketplace_partner','active',
    v_actor_auth_user_id,clock_timestamp()
  )
  on conflict (business_key) do nothing
  returning id into v_relationship_id;

  if v_relationship_id is null then
    select id into v_relationship_id
      from public.research_b2b_buyer_relationships
     where business_key=p_business_key
       and business_display_name=p_business_display_name
       and business_legal_name=p_business_legal_name
       and relationship_type='b2b2c_marketplace_partner'
       and state='active'
       and migrated_organization_id is null
     for update;
    if not found then
      raise exception 'business key conflicts with another relationship' using errcode='23505';
    end if;
  else
    insert into public.research_b2b_buyer_events(
      event_type,relationship_id,member_id,actor_auth_user_id,detail
    ) values (
      'relationship_activated',v_relationship_id,p_member_id,v_actor_auth_user_id,
      jsonb_build_object('businessKey',p_business_key,'relationshipType','b2b2c_marketplace_partner')
    );
  end if;

  insert into public.research_b2b_buyer_operators(
    relationship_id,member_id,roles,state,binding_method,
    bound_by_auth_user_id,bound_at
  ) values (
    v_relationship_id,p_member_id,p_roles,'active','operator_verified_member',
    v_actor_auth_user_id,clock_timestamp()
  )
  on conflict (relationship_id,member_id) do nothing
  returning id into v_operator_id;

  if v_operator_id is null then
    select id into v_operator_id
      from public.research_b2b_buyer_operators
     where relationship_id=v_relationship_id and member_id=p_member_id
       and roles=p_roles and state='active'
     for update;
    if not found then
      raise exception 'member already has a conflicting business binding' using errcode='23505';
    end if;
  else
    insert into public.research_b2b_buyer_events(
      event_type,relationship_id,member_id,actor_auth_user_id,detail
    ) values (
      'operator_bound',v_relationship_id,p_member_id,v_actor_auth_user_id,
      jsonb_build_object('operatorId',v_operator_id,'roles',p_roles)
    );
  end if;

  insert into public.research_b2b_buyer_entitlements(
    relationship_id,profile_key,version,state,effective_at,
    approved_by_auth_user_id,approved_at
  ) values (
    v_relationship_id,'KRIS_VOLUME_PARTNER',p_profile_version,'active',p_effective_at,
    v_actor_auth_user_id,clock_timestamp()
  )
  on conflict (relationship_id,profile_key,version) do nothing
  returning id into v_entitlement_id;

  if v_entitlement_id is null then
    select id into v_entitlement_id
      from public.research_b2b_buyer_entitlements
     where relationship_id=v_relationship_id
       and profile_key='KRIS_VOLUME_PARTNER'
       and version=p_profile_version
       and state='active'
       and effective_at=p_effective_at
     for update;
    if not found then
      raise exception 'pricing profile version conflicts with existing entitlement' using errcode='23505';
    end if;
  else
    insert into public.research_b2b_buyer_events(
      event_type,relationship_id,member_id,actor_auth_user_id,detail
    ) values (
      'entitlement_activated',v_relationship_id,p_member_id,v_actor_auth_user_id,
      jsonb_build_object('entitlementId',v_entitlement_id,'profileKey','KRIS_VOLUME_PARTNER',
                         'profileVersion',p_profile_version,'effectiveAt',p_effective_at)
    );
  end if;

  return query select v_relationship_id,v_operator_id,v_entitlement_id;
end;
$$;

create or replace function public.research_claim_b2b_order_ownership(
  p_order_id uuid,
  p_relationship_id uuid,
  p_member_id uuid,
  p_entitlement_id uuid,
  p_profile_key text,
  p_profile_version integer
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare
  v_existing public.research_b2b_order_ownership%rowtype;
  v_operator_id uuid;
  -- Database-owned: callers cannot backdate into an expired entitlement
  -- window or predate a future entitlement.
  v_established_at timestamptz := clock_timestamp();
begin
  perform pg_advisory_xact_lock(hashtextextended('b2b-order:' || p_order_id::text, 0));

  select * into v_existing
    from public.research_b2b_order_ownership
   where order_id=p_order_id for update;
  if found then
    if v_existing.relationship_id=p_relationship_id
       and v_existing.placed_by_member_id=p_member_id
       and v_existing.entitlement_id=p_entitlement_id
       and v_existing.pricing_profile_key=p_profile_key
       and v_existing.pricing_profile_version=p_profile_version then
      return 'replayed';
    end if;
    return 'conflict';
  end if;

  select id into v_operator_id
    from public.research_b2b_buyer_operators
   where relationship_id=p_relationship_id and member_id=p_member_id and state='active'
   for share;
  if not found then
    raise exception 'active business operator binding not found' using errcode='42501';
  end if;

  insert into public.research_b2b_order_ownership(
    order_id,relationship_id,operator_id,placed_by_member_id,entitlement_id,
    pricing_profile_key,pricing_profile_version,established_at
  ) values (
    p_order_id,p_relationship_id,v_operator_id,p_member_id,p_entitlement_id,
    p_profile_key,p_profile_version,v_established_at
  );

  insert into public.research_b2b_buyer_events(
    event_type,relationship_id,member_id,order_id,actor_auth_user_id,detail
  )
  select
    'order_ownership_established',p_relationship_id,p_member_id,p_order_id,
    m.auth_user_id,
    jsonb_build_object('profileKey',p_profile_key,'profileVersion',p_profile_version,
                       'entitlementId',p_entitlement_id)
    from public.research_members m where m.id=p_member_id;

  return 'linked';
end;
$$;

alter table public.research_b2b_buyer_relationships enable row level security;
alter table public.research_b2b_buyer_operators enable row level security;
alter table public.research_b2b_buyer_entitlements enable row level security;
alter table public.research_b2b_order_ownership enable row level security;
alter table public.research_b2b_buyer_events enable row level security;

revoke all on public.research_b2b_buyer_relationships from public, anon, authenticated, service_role;
revoke all on public.research_b2b_buyer_operators from public, anon, authenticated, service_role;
revoke all on public.research_b2b_buyer_entitlements from public, anon, authenticated, service_role;
revoke all on public.research_b2b_order_ownership from public, anon, authenticated, service_role;
revoke all on public.research_b2b_buyer_events from public, anon, authenticated, service_role;
revoke all on function public.research_activate_b2b_buyer_bridge(
  uuid,uuid,text,text,text,text[],integer,timestamptz
) from public, anon, authenticated, service_role;
revoke all on function public.research_claim_b2b_order_ownership(
  uuid,uuid,uuid,uuid,text,integer
) from public, anon, authenticated, service_role;

-- The service role may project account state but cannot bypass either audited
-- write RPC with direct table writes.
grant select on public.research_b2b_buyer_relationships to service_role;
grant select on public.research_b2b_buyer_operators to service_role;
grant select on public.research_b2b_buyer_entitlements to service_role;
grant select on public.research_b2b_order_ownership to service_role;
grant select on public.research_b2b_buyer_events to service_role;

-- Activation executes in the exact internal admin's authenticated Supabase
-- session. auth.uid() is the immutable audit actor and the function independently
-- verifies an active super_admin/operations_admin assignment.
grant execute on function public.research_activate_b2b_buyer_bridge(
  uuid,uuid,text,text,text,text[],integer,timestamptz
) to authenticated;
grant execute on function public.research_claim_b2b_order_ownership(
  uuid,uuid,uuid,uuid,text,integer
) to service_role;

commit;
