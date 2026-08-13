-- PACK02 SPONSORED B2B CLAIM — CANDIDATE ONLY. DO NOT APPLY.
--
-- Purpose: reuse the already-mounted purpose-scoped account_claim flow for a
-- business buyer without forcing the operator to submit the public essay form
-- or falsely recording its attestations. The research_application row remains
-- canonical research_members provenance; the sidecar proves that it was an
-- internal B2B sponsorship, not a personal application.
--
-- Depends on the reviewed 20260813_research_b2b_buyer_bridge.sql candidate.
-- Does not read, create, or alter the colliding organization relation.
--
-- REQUIRED BEFORE PROMOTION:
--   * exact-schema fingerprint + isolated apply-twice/rollback rehearsal
--   * SECURITY DEFINER/RLS/grant review
--   * account_claim outbox delivery rehearsal
--   * claim -> pending member -> atomic bridge/member activation rehearsal

begin;

do $$
begin
  if to_regclass('public.research_applications') is null
     or to_regclass('public.research_application_events') is null
     or to_regclass('public.research_members') is null then
    raise exception 'canonical application/member claim schema is required';
  end if;
  if to_regclass('public.research_notification_outbox') is null then
    raise exception 'canonical research notification outbox is required';
  end if;
  if to_regclass('public.research_b2b_buyer_relationships') is null
     or to_regprocedure('public.research_activate_b2b_buyer_bridge(uuid,uuid,text,text,text[],integer,timestamp with time zone)') is null then
    raise exception 'reviewed temporary B2B buyer bridge must be applied first';
  end if;
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='research_members' and column_name='billing_state'
  ) then
    raise exception 'canonical research_members billing_state is required';
  end if;
  if exists (
    select lower(btrim(email)) from public.research_applications
     group by lower(btrim(email)) having count(*)>1
  ) or exists (
    select lower(btrim(email)) from public.research_members
     group by lower(btrim(email)) having count(*)>1
  ) then
    raise exception 'case-insensitive canonical identity duplicates require reconciliation';
  end if;
end;
$$;

create unique index if not exists research_applications_normalized_email_uidx
  on public.research_applications(lower(btrim(email)));
create unique index if not exists research_members_normalized_email_uidx
  on public.research_members(lower(btrim(email)));

alter table public.research_applications
  drop constraint if exists research_applications_status_check;
alter table public.research_applications
  add constraint research_applications_status_check check (status in (
    'draft','submitted','under_review','more_information_requested','resubmitted',
    'approved_pending_payment','approved_sponsored_b2b','payment_pending','active',
    'paused','declined','withdrawn','expired'
  ));

alter table public.research_members
  add column if not exists access_basis text not null default 'paid_membership';
alter table public.research_members
  drop constraint if exists research_members_access_basis_check;
alter table public.research_members
  add constraint research_members_access_basis_check
  check (access_basis in ('paid_membership','sponsored_b2b'));

create table if not exists public.research_b2b_sponsored_claims (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique
    references public.research_applications(id) on delete restrict,
  normalized_email text not null unique
    check (normalized_email=lower(btrim(normalized_email)) and length(normalized_email) between 3 and 254),
  business_key text not null
    check (business_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  business_display_name text not null
    check (length(btrim(business_display_name)) between 1 and 160),
  roles text[] not null,
  profile_key text not null check (profile_key='KRIS_VOLUME_PARTNER'),
  profile_version integer not null check (profile_version>0),
  profile_effective_at timestamptz not null,
  state text not null default 'claim_queued'
    check (state in ('claim_queued','activated','revoked','expired')),
  prepared_by_auth_user_id uuid not null references auth.users(id) on delete restrict,
  prepared_at timestamptz not null default clock_timestamp(),
  claim_expires_at timestamptz not null,
  claim_outbox_event_key text not null unique,
  claim_queued_at timestamptz not null,
  activated_member_id uuid references public.research_members(id) on delete restrict,
  activated_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  constraint research_b2b_sponsored_claim_roles check (
    cardinality(roles)=2
    and roles @> array['organization_owner','business_buyer']::text[]
    and roles <@ array['organization_owner','business_buyer']::text[]
  ),
  constraint research_b2b_sponsored_claim_expiry check (claim_expires_at>prepared_at),
  constraint research_b2b_sponsored_claim_state check (
    (state='claim_queued' and activated_member_id is null
      and activated_at is null and revoked_at is null)
    or (state='activated' and activated_member_id is not null
      and activated_at is not null and revoked_at is null)
    or (state in ('revoked','expired') and activated_member_id is null
      and activated_at is null and revoked_at is not null)
  )
);

create table if not exists public.research_b2b_sponsored_claim_events (
  id bigint generated always as identity primary key,
  sponsorship_id uuid not null
    references public.research_b2b_sponsored_claims(id) on delete restrict,
  event_type text not null check (event_type in (
    'claim_queued','buyer_activated','claim_revoked'
  )),
  actor_auth_user_id uuid references auth.users(id) on delete restrict,
  system_actor text check (system_actor is null),
  detail jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default clock_timestamp(),
  constraint research_b2b_sponsored_claim_event_actor check (
    num_nonnulls(actor_auth_user_id,system_actor)=1
  )
);
create index if not exists research_b2b_sponsored_claim_events_sponsorship_idx
  on public.research_b2b_sponsored_claim_events(sponsorship_id,occurred_at);

create or replace function public.research_b2b_sponsored_claim_guard()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='DELETE' then
    raise exception 'sponsored B2B claim evidence cannot be deleted' using errcode='55000';
  end if;
  if new.id is distinct from old.id
     or new.application_id is distinct from old.application_id
     or new.normalized_email is distinct from old.normalized_email
     or new.business_key is distinct from old.business_key
     or new.business_display_name is distinct from old.business_display_name
     or new.roles is distinct from old.roles
     or new.profile_key is distinct from old.profile_key
     or new.profile_version is distinct from old.profile_version
     or new.profile_effective_at is distinct from old.profile_effective_at
     or new.prepared_by_auth_user_id is distinct from old.prepared_by_auth_user_id
     or new.prepared_at is distinct from old.prepared_at
     or new.claim_expires_at is distinct from old.claim_expires_at
     or new.claim_outbox_event_key is distinct from old.claim_outbox_event_key
     or new.claim_queued_at is distinct from old.claim_queued_at
     or new.created_at is distinct from old.created_at then
    raise exception 'sponsored B2B claim identity/approval facts are immutable' using errcode='55000';
  end if;
  if old.state='claim_queued' and new.state not in ('activated','revoked','expired') then
    raise exception 'invalid sponsored B2B claim transition' using errcode='55000';
  elsif old.state in ('activated','revoked','expired') then
    raise exception 'terminal sponsored B2B claim cannot change' using errcode='55000';
  end if;
  new.updated_at:=clock_timestamp();
  return new;
end;
$$;
drop trigger if exists research_b2b_sponsored_claim_guard
  on public.research_b2b_sponsored_claims;
create trigger research_b2b_sponsored_claim_guard
before update or delete on public.research_b2b_sponsored_claims
for each row execute function public.research_b2b_sponsored_claim_guard();

create or replace function public.research_b2b_sponsored_claim_events_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'sponsored B2B claim events are immutable' using errcode='55000';
end;
$$;
drop trigger if exists research_b2b_sponsored_claim_events_immutable
  on public.research_b2b_sponsored_claim_events;
create trigger research_b2b_sponsored_claim_events_immutable
before update or delete on public.research_b2b_sponsored_claim_events
for each row execute function public.research_b2b_sponsored_claim_events_immutable();

create or replace function public.research_prepare_sponsored_b2b_claim(
  p_normalized_email text,
  p_first_name text,
  p_last_name text,
  p_country text,
  p_applicant_type text,
  p_business_key text,
  p_business_display_name text,
  p_roles text[],
  p_profile_version integer,
  p_profile_effective_at timestamptz
)
returns table(
  sponsorship_id uuid,application_id uuid,normalized_email text,
  business_key text,business_display_name text,state text,
  profile_key text,profile_version integer,profile_effective_at timestamptz
)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_authorized boolean:=false;
  v_application_id uuid;
  v_sponsorship_id uuid;
  v_outbox_event_key text;
  v_now timestamptz:=clock_timestamp();
begin
  if v_actor is null then
    raise exception 'authenticated sponsorship actor required' using errcode='42501';
  end if;
  if to_regclass('public.research_prelaunch_role_assignments') is null then
    raise exception 'internal role authority unavailable' using errcode='55000';
  end if;
  execute $q$
    select exists(
      select 1 from public.research_prelaunch_role_assignments
       where auth_user_id=$1 and role in ('super_admin','operations_admin')
         and revoked_at is null
         and (expires_at is null or expires_at>clock_timestamp())
    )
  $q$ into v_authorized using v_actor;
  if not v_authorized then
    raise exception 'actor lacks sponsored B2B claim authority' using errcode='42501';
  end if;
  if p_normalized_email<>lower(btrim(p_normalized_email))
     or length(p_normalized_email) not between 3 and 254
     or length(btrim(p_first_name)) not between 1 and 80
     or length(btrim(p_last_name)) not between 1 and 80
     or length(btrim(p_country)) not between 2 and 80
     or p_applicant_type not in ('individual','professional')
     or p_business_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or length(btrim(p_business_display_name)) not between 1 and 160
     or cardinality(p_roles)<>2
     or not (p_roles @> array['organization_owner','business_buyer']::text[])
     or not (p_roles <@ array['organization_owner','business_buyer']::text[])
     or p_profile_version<1 then
    raise exception 'sponsored B2B claim input invalid' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('sponsored-b2b:'||p_normalized_email,0));
  if exists(select 1 from auth.users where lower(email)=p_normalized_email)
     or exists(select 1 from public.research_applications where lower(email)=p_normalized_email)
     or exists(select 1 from public.research_members where lower(email)=p_normalized_email)
     or exists(select 1 from public.research_b2b_sponsored_claims where normalized_email=p_normalized_email) then
    raise exception 'authoritative identity/application appeared; stop' using errcode='23505';
  end if;

  insert into public.research_applications(
    email,first_name,last_name,country,age_confirmed,applicant_type,
    organization,interests,goals_text,fit_text,marketing_consent,status,
    approval_expires_at,submitted_at,reviewed_at,reviewed_by,source_page
  ) values (
    p_normalized_email,btrim(p_first_name),btrim(p_last_name),btrim(p_country),
    false,p_applicant_type,btrim(p_business_display_name),'[]'::jsonb,null,null,false,
    'approved_sponsored_b2b',v_now+interval '72 hours',v_now,v_now,v_actor::text,
    'b2b_buyer_sponsored_claim'
  ) returning id into v_application_id;

  insert into public.research_application_events(
    application_id,previous_status,new_status,actor_type,actor_id,reason_code,internal_note
  ) values (
    v_application_id,null,'approved_sponsored_b2b','admin',v_actor::text,
    'b2b_buyer_sponsored_claim',
    'Internal B2B sponsorship; public applicant attestations were not collected or asserted.'
  );

  v_outbox_event_key:='b2b-sponsored-claim:'||v_application_id::text;
  insert into public.research_b2b_sponsored_claims(
    application_id,normalized_email,business_key,business_display_name,roles,
    profile_key,profile_version,profile_effective_at,prepared_by_auth_user_id,
    prepared_at,claim_expires_at,claim_outbox_event_key,claim_queued_at
  ) values (
    v_application_id,p_normalized_email,p_business_key,btrim(p_business_display_name),p_roles,
    'KRIS_VOLUME_PARTNER',p_profile_version,p_profile_effective_at,v_actor,
    v_now,v_now+interval '72 hours',v_outbox_event_key,v_now
  ) returning id into v_sponsorship_id;

  insert into public.research_b2b_sponsored_claim_events(
    sponsorship_id,event_type,actor_auth_user_id,detail
  ) values (
    v_sponsorship_id,'claim_queued',v_actor,
    jsonb_build_object('applicationId',v_application_id,'businessKey',p_business_key,
      'roles',p_roles,'profileKey','KRIS_VOLUME_PARTNER','profileVersion',p_profile_version)
  );

  insert into public.research_notification_outbox(
    event_key,application_id,event_type,channel,recipient,template_key,payload,
    status,attempt_count,next_attempt_at
  ) values (
    v_outbox_event_key,v_application_id,'b2b_buyer_claim_applicant','email',
    p_normalized_email,'b2b_buyer_claim',
    jsonb_build_object('firstName',btrim(p_first_name),'tokenPurpose','account_claim',
      'approvalExpiresAt',v_now+interval '72 hours','businessDisplayName',btrim(p_business_display_name)),
    'pending',0,v_now
  );

  return query select v_sponsorship_id,v_application_id,p_normalized_email,
    p_business_key,btrim(p_business_display_name),'claim_queued'::text,
    'KRIS_VOLUME_PARTNER'::text,p_profile_version,p_profile_effective_at;
end;
$$;

create or replace function public.research_activate_sponsored_b2b_buyer(
  p_sponsorship_id uuid,p_member_id uuid,p_expected_auth_user_id uuid
)
returns table(relationship_id uuid,operator_id uuid,entitlement_id uuid)
language plpgsql security definer set search_path='' as $$
declare
  v_actor uuid:=auth.uid();
  v_authorized boolean:=false;
  v_claim public.research_b2b_sponsored_claims%rowtype;
  v_member public.research_members%rowtype;
  v_relationship_id uuid;
  v_operator_id uuid;
  v_entitlement_id uuid;
  v_auth_email text;
  v_auth_confirmed_at timestamptz;
begin
  if v_actor is null then
    raise exception 'authenticated activation actor required' using errcode='42501';
  end if;
  execute $q$
    select exists(
      select 1 from public.research_prelaunch_role_assignments
       where auth_user_id=$1 and role in ('super_admin','operations_admin')
         and revoked_at is null
         and (expires_at is null or expires_at>clock_timestamp())
    )
  $q$ into v_authorized using v_actor;
  if not v_authorized then
    raise exception 'actor lacks sponsored B2B activation authority' using errcode='42501';
  end if;

  select * into v_claim from public.research_b2b_sponsored_claims
   where id=p_sponsorship_id for update;
  if not found or v_claim.state<>'claim_queued' then
    raise exception 'sponsored B2B claim is not activatable' using errcode='42501';
  end if;
  select * into v_member from public.research_members
   where id=p_member_id for update;
  if not found or v_member.application_id<>v_claim.application_id
     or v_member.auth_user_id<>p_expected_auth_user_id
     or lower(v_member.email)<>v_claim.normalized_email
     or v_member.status<>'pending_activation' then
    raise exception 'exact pending sponsored member binding not proved' using errcode='42501';
  end if;
  select lower(btrim(email)),email_confirmed_at into v_auth_email,v_auth_confirmed_at
    from auth.users where id=p_expected_auth_user_id for share;
  if not found or v_auth_email<>v_claim.normalized_email or v_auth_confirmed_at is null then
    raise exception 'exact confirmed Supabase Auth identity not proved' using errcode='42501';
  end if;

  -- Any downstream failure rolls this update back with the entire transaction;
  -- no active-member window exists without the business binding/entitlement.
  update public.research_members
     set status='active',billing_state='not_started',access_basis='sponsored_b2b',
         activated_at=clock_timestamp(),updated_at=clock_timestamp()
   where id=v_member.id and status='pending_activation';

  select x.relationship_id,x.operator_id,x.entitlement_id
    into v_relationship_id,v_operator_id,v_entitlement_id
    from public.research_activate_b2b_buyer_bridge(
      v_member.id,v_member.auth_user_id,v_claim.business_key,v_claim.business_display_name,
      v_claim.roles,v_claim.profile_version,v_claim.profile_effective_at
    ) x;

  update public.research_applications
     set status='active',updated_at=clock_timestamp()
   where id=v_claim.application_id and status='approved_sponsored_b2b';
  if not found then
    raise exception 'sponsored application status changed concurrently' using errcode='40001';
  end if;
  insert into public.research_application_events(
    application_id,previous_status,new_status,actor_type,actor_id,reason_code,internal_note
  ) values (
    v_claim.application_id,'approved_sponsored_b2b','active','admin',v_actor::text,
    'b2b_buyer_sponsorship_activated',
    'B2B operator membership activated atomically with business relationship and pricing entitlement.'
  );
  update public.research_b2b_sponsored_claims
     set state='activated',activated_member_id=v_member.id,activated_at=clock_timestamp()
   where id=v_claim.id;
  insert into public.research_b2b_sponsored_claim_events(
    sponsorship_id,event_type,actor_auth_user_id,detail
  ) values (
    v_claim.id,'buyer_activated',v_actor,
    jsonb_build_object('memberId',v_member.id,'relationshipId',v_relationship_id,
      'operatorId',v_operator_id,'entitlementId',v_entitlement_id)
  );
  return query select v_relationship_id,v_operator_id,v_entitlement_id;
end;
$$;

alter table public.research_b2b_sponsored_claims enable row level security;
alter table public.research_b2b_sponsored_claim_events enable row level security;
revoke all on public.research_b2b_sponsored_claims from public,anon,authenticated,service_role;
revoke all on public.research_b2b_sponsored_claim_events from public,anon,authenticated,service_role;
grant select on public.research_b2b_sponsored_claims to service_role;
grant select on public.research_b2b_sponsored_claim_events to service_role;

revoke all on function public.research_prepare_sponsored_b2b_claim(
  text,text,text,text,text,text,text,text[],integer,timestamptz
) from public,anon,authenticated,service_role;
revoke all on function public.research_activate_sponsored_b2b_buyer(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.research_prepare_sponsored_b2b_claim(
  text,text,text,text,text,text,text,text[],integer,timestamptz
) to authenticated;
grant execute on function public.research_activate_sponsored_b2b_buyer(uuid,uuid,uuid)
  to authenticated;

commit;
