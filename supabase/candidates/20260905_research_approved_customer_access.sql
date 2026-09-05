-- CANDIDATE ONLY: explicit approved customer access, without paid membership.
-- Reuses Auth, research_applications, research_members, their audit and outbox.
-- Does not activate partners, commission terms, products, Care or payments.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $$ begin
  if to_regclass('public.research_applications') is null
    or to_regclass('public.research_members') is null
    or to_regclass('public.research_application_events') is null
    or to_regclass('public.research_notification_outbox') is null then
    raise exception 'canonical account, audit and notification schema required';
  end if;
  if exists(select lower(btrim(email)) from public.research_applications group by 1 having count(*)>1)
    or exists(select lower(btrim(email)) from public.research_members group by 1 having count(*)>1) then
    raise exception 'ambiguous normalized account identities require reconciliation';
  end if;
end $$;

create unique index if not exists research_applications_normalized_email_uidx on public.research_applications(lower(btrim(email)));
create unique index if not exists research_members_normalized_email_uidx on public.research_members(lower(btrim(email)));
alter table public.research_applications drop constraint if exists research_applications_status_check;
alter table public.research_applications add constraint research_applications_status_check check(status in (
  'draft','submitted','under_review','more_information_requested','resubmitted',
  'approved_pending_payment','approved_sponsored_b2b','approved_customer','payment_pending',
  'active','paused','declined','withdrawn','expired'));
-- Admin approval is not an applicant questionnaire or an age/location attestation.
alter table public.research_applications alter column country drop not null;
alter table public.research_applications drop constraint if exists research_application_country_provenance;
alter table public.research_applications add constraint research_application_country_provenance
  check(country is not null or coalesce(source_page='admin_approved_customer',false));
alter table public.research_applications add column if not exists access_approval_version integer not null default 0;
alter table public.research_applications add column if not exists access_approved_by uuid references auth.users(id);
alter table public.research_applications add column if not exists access_approved_at timestamptz;
alter table public.research_applications drop constraint if exists research_customer_approval_provenance;
alter table public.research_applications add constraint research_customer_approval_provenance check (
  access_approval_version>=0 and
  ((access_approval_version=0 and access_approved_by is null and access_approved_at is null)
    or (access_approval_version>0 and access_approved_by is not null and access_approved_at is not null))
  and (status<>'approved_customer' or access_approval_version>0));
alter table public.research_members add column if not exists billing_state text not null default 'not_started';
alter table public.research_members add column if not exists access_basis text not null default 'paid_membership';
alter table public.research_members drop constraint if exists research_members_access_basis_check;
alter table public.research_members add constraint research_members_access_basis_check
  check(access_basis in ('paid_membership','sponsored_b2b','approved_customer'));

alter table public.research_application_events add column if not exists operation_key text;
alter table public.research_application_events add column if not exists operation_hash text;
alter table public.research_application_events add column if not exists operation_result jsonb;
create unique index if not exists research_account_operation_once
  on public.research_application_events(actor_id,operation_key) where operation_key is not null;

create or replace function public.research_approved_customer_access_authority()
returns jsonb language sql stable security definer set search_path=pg_catalog as $$
  select jsonb_build_object('schemaVersion','approved_customer_access_20260905');
$$;

create or replace function public.research_admin_approve_customer_access(
  p_actor_auth_user_id uuid, p_email text, p_first_name text, p_last_name text,
  p_reason text, p_expected_application_id uuid, p_expected_updated_at timestamptz,
  p_idempotency_key text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  a public.research_applications%rowtype;
  m public.research_members%rowtype;
  prior public.research_application_events%rowtype;
  v_auth_id uuid; v_auth_count integer; v_verified boolean;
  v_now timestamptz := clock_timestamp(); v_hash text; v_result jsonb;
  v_previous text; v_expires timestamptz; v_member_found boolean;
begin
  -- The service-only transport is reached after canonical requireSupabaseAdmin.
  -- This exact Auth UUID is provenance, not a second database admin registry.
  if p_actor_auth_user_id is null or not exists(select 1 from auth.users where id=p_actor_auth_user_id and email_confirmed_at is not null)
    or p_email is null or p_email<>lower(btrim(p_email)) or length(p_email)>254
    or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or coalesce(length(btrim(p_first_name)),0) not between 1 and 80
    or coalesce(length(btrim(p_last_name)),0) not between 1 and 80
    or coalesce(length(btrim(p_reason)),0) not between 8 and 1000
    or coalesce(p_idempotency_key,'') !~ '^[A-Za-z0-9_-]{16,128}$'
    or (p_expected_application_id is null)<>(p_expected_updated_at is null) then
    return jsonb_build_object('ok',false,'code','invalid_input');
  end if;
  v_hash:=encode(sha256(convert_to(jsonb_build_object('email',p_email,'firstName',p_first_name,'lastName',p_last_name,
    'reason',p_reason,'expectedApplicationId',p_expected_application_id,'expectedUpdatedAt',p_expected_updated_at)::text,'UTF8')),'hex');
  perform pg_advisory_xact_lock(hashtextextended('customer-approval-operation:'||p_actor_auth_user_id::text||':'||p_idempotency_key,0));
  select * into prior from public.research_application_events where actor_id=p_actor_auth_user_id::text and operation_key=p_idempotency_key;
  if found then
    if prior.operation_hash is distinct from v_hash then return jsonb_build_object('ok',false,'code','idempotency_conflict'); end if;
    return prior.operation_result || jsonb_build_object('replayed',true);
  end if;
  perform pg_advisory_xact_lock(hashtextextended('approved-customer:'||p_email,0));
  select count(*), min(id::text)::uuid, bool_and(email_confirmed_at is not null)
    into v_auth_count,v_auth_id,v_verified from auth.users where lower(btrim(email))=p_email;
  if v_auth_count>1 or (v_auth_count=1 and not v_verified) then
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  select * into a from public.research_applications where lower(btrim(email))=p_email for update;
  if found then
    if a.id is distinct from p_expected_application_id or a.updated_at is distinct from p_expected_updated_at then
      return jsonb_build_object('ok',false,'code','stale_inspection');
    end if;
    if a.status not in ('draft','submitted','under_review','more_information_requested','resubmitted',
      'approved_pending_payment','approved_customer','payment_pending','active','expired') or a.source_page='b2b_buyer_sponsored_claim' then
      return jsonb_build_object('ok',false,'code','identity_review_required');
    end if;
    v_previous:=a.status;
  else
    if p_expected_application_id is not null then return jsonb_build_object('ok',false,'code','stale_inspection'); end if;
    insert into public.research_applications(email,first_name,last_name,country,age_confirmed,source_page,status)
      values(p_email,btrim(p_first_name),btrim(p_last_name),null,false,'admin_approved_customer','submitted') returning * into a;
    v_previous:=null;
  end if;
  if (select count(*) from public.research_members where lower(btrim(email))=p_email or application_id=a.id or auth_user_id=v_auth_id)>1 then
    if v_previous is null then delete from public.research_applications where id=a.id; end if;
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  select * into m from public.research_members where lower(btrim(email))=p_email or application_id=a.id or auth_user_id=v_auth_id for update;
  v_member_found:=found;
  if v_member_found and (m.application_id is distinct from a.id or lower(btrim(m.email)) is distinct from p_email or m.auth_user_id is distinct from v_auth_id
    or m.status in ('paused','closed','cancelled')) then
    -- The newly inserted application must not survive a refused operation.
    if v_previous is null then delete from public.research_applications where id=a.id; end if;
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  -- An already active customer needs sign-in, not a new approval. A historical
  -- paid activation/renewal may leave an active application paired with a
  -- pending or past-due member; explicit review can convert that exact binding.
  if a.status='active' and (not v_member_found or m.status not in ('pending_activation','past_due')) then
    return jsonb_build_object('ok',false,'code','claim_not_available');
  end if;
  v_expires:=v_now+interval '14 days';
  update public.research_applications set status='approved_customer',approval_expires_at=v_expires,
    access_approval_version=access_approval_version+1,access_approved_by=p_actor_auth_user_id,
    access_approved_at=v_now,reviewed_at=v_now,reviewed_by=p_actor_auth_user_id::text,updated_at=v_now where id=a.id returning * into a;
  v_result:=jsonb_build_object('ok',true,'applicationId',a.id,'approvalVersion',a.access_approval_version,
    'state','approved_customer','delivery','queued','expiresAt',v_expires,'replayed',false);
  insert into public.research_application_events(application_id,previous_status,new_status,actor_type,actor_id,
    reason_code,internal_note,operation_key,operation_hash,operation_result,created_at)
    values(a.id,v_previous,'approved_customer','admin',p_actor_auth_user_id::text,'customer_access_approved',btrim(p_reason),
      p_idempotency_key,v_hash,v_result,v_now);
  insert into public.research_notification_outbox(event_key,application_id,event_type,recipient,template_key,payload)
    values('approved-customer:'||a.id::text||':'||a.access_approval_version::text,a.id,'approved_customer_claim',p_email,
      'approved_customer_claim',jsonb_build_object('firstName',a.first_name,'approvalExpiresAt',v_expires,'tokenPurpose','account_claim','approvalVersion',a.access_approval_version));
  return v_result;
end;
$$;

create or replace function public.research_claim_approved_customer_access(p_application_id uuid,p_auth_user_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare
  a public.research_applications%rowtype; m public.research_members%rowtype;
  v_email text; v_now timestamptz:=clock_timestamp(); v_found boolean; v_result jsonb;
begin
  -- The canonical API has validated an account_claim token and either created
  -- this Auth user from that email-owned claim or verified a normal sign-in.
  select lower(btrim(email)) into v_email from auth.users where id=p_auth_user_id and email_confirmed_at is not null;
  if v_email is null then return jsonb_build_object('ok',false,'code','verified_sign_in_required'); end if;
  perform pg_advisory_xact_lock(hashtextextended('approved-customer:'||v_email,0));
  if (select count(*) from auth.users where lower(btrim(email))=v_email)<>1 then
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  select * into a from public.research_applications where id=p_application_id for update;
  if not found or lower(btrim(a.email))<>v_email or a.access_approval_version<1 or a.access_approved_by is null then
    return jsonb_build_object('ok',false,'code','claim_not_available');
  end if;
  if (select count(*) from public.research_members where application_id=a.id or auth_user_id=p_auth_user_id or lower(btrim(email))=v_email)>1 then
    return jsonb_build_object('ok',false,'code','identity_review_required');
  end if;
  select * into m from public.research_members where application_id=a.id or auth_user_id=p_auth_user_id or lower(btrim(email))=v_email for update;
  v_found:=found;
  if v_found and (m.application_id is distinct from a.id or m.auth_user_id is distinct from p_auth_user_id or lower(btrim(m.email)) is distinct from v_email
    or m.status in ('paused','closed','cancelled')) then return jsonb_build_object('ok',false,'code','identity_review_required'); end if;
  if v_found and a.status='active' and m.status='active' and m.access_basis='approved_customer' then
    return jsonb_build_object('ok',true,'applicationId',a.id,'memberId',m.id,'state','active','replayed',true);
  end if;
  if a.status<>'approved_customer' or a.approval_expires_at is null or a.approval_expires_at<=v_now then
    return jsonb_build_object('ok',false,'code','claim_not_available');
  end if;
  if v_found then
    -- Historical billing facts are not rewritten as payment verification.
    update public.research_members set status='active',access_basis='approved_customer',updated_at=v_now where id=m.id returning * into m;
  else
    insert into public.research_members(application_id,auth_user_id,email,first_name,status,access_basis,billing_state,activated_at)
      values(a.id,p_auth_user_id,v_email,a.first_name,'active','approved_customer','not_started',v_now) returning * into m;
  end if;
  update public.research_applications set status='active',updated_at=v_now where id=a.id;
  v_result:=jsonb_build_object('ok',true,'applicationId',a.id,'memberId',m.id,'state','active','replayed',false);
  insert into public.research_application_events(application_id,previous_status,new_status,actor_type,actor_id,reason_code,created_at)
    values(a.id,'approved_customer','active','applicant',p_auth_user_id::text,'approved_customer_claimed',v_now);
  insert into public.research_notification_outbox(event_key,application_id,member_id,event_type,recipient,template_key,payload)
    values('approved-customer-welcome:'||a.id::text,a.id,m.id,'approved_customer_welcome',v_email,'approved_customer_welcome',
      jsonb_build_object('firstName',a.first_name)) on conflict(event_key) do nothing;
  return v_result;
end;
$$;

revoke all on function public.research_approved_customer_access_authority() from public,anon,authenticated;
revoke all on function public.research_admin_approve_customer_access(uuid,text,text,text,text,uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.research_claim_approved_customer_access(uuid,uuid) from public,anon,authenticated;
grant execute on function public.research_approved_customer_access_authority() to service_role;
grant execute on function public.research_admin_approve_customer_access(uuid,text,text,text,text,uuid,timestamptz,text) to service_role;
grant execute on function public.research_claim_approved_customer_access(uuid,uuid) to service_role;
commit;
