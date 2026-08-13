-- ROMAN DIGITAL / PACK 02 DEPENDENT CANDIDATE — DO NOT APPLY FROM THIS LANE.
-- Requires 20260812_research_account_organizations.sql and the exact existing
-- Supabase Auth user below. This creates no auth user, credential, order,
-- customer identity, or parallel organization. Apply-twice rehearsal and
-- independent DB/grant/RLS review are required before promotion.

do $$
declare
  v_organization_id constant uuid := 'e26bc7de-86df-4e70-8e82-964e3671d71c';
  v_auth_user_id constant uuid := '20ec822d-8123-4088-ac05-9c8f4b2da784';
  v_canonical_email constant text := 'info@romanhealthcollective.com';
  v_old_email constant text := 'k@romandigital.io';
  v_auth auth.users%rowtype;
  v_membership_id uuid;
begin
  select * into v_auth from auth.users where id=v_auth_user_id for share;
  if not found then
    raise exception 'Roman Digital existing Supabase Auth UID is absent' using errcode='42501';
  end if;
  if v_auth.email_confirmed_at is null then
    raise exception 'Roman Digital Supabase Auth email is not verified' using errcode='42501';
  end if;
  if v_auth.email is null or lower(trim(v_auth.email))<>v_canonical_email then
    raise exception 'Roman Digital Supabase Auth email does not match canonical identity' using errcode='42501';
  end if;

  insert into public.research_organizations(
    id,slug,legal_name,display_name,purchasing_email,billing_email
  ) values (
    v_organization_id,'roman-digital','Roman Digital','Roman Digital',
    v_canonical_email,v_canonical_email
  )
  on conflict (id) do update set
    legal_name=excluded.legal_name,
    display_name=excluded.display_name,
    purchasing_email=excluded.purchasing_email,
    billing_email=excluded.billing_email,
    updated_at=clock_timestamp();

  -- Retire only the obsolete placeholder/invitations. Historical rows stay
  -- present for review and are never rebound to the new identity.
  update public.research_organization_invitations
     set state='revoked',token_hash=null,expires_at=null,updated_at=clock_timestamp(),
         invited_by_label='Superseded by canonical Roman Digital identity'
   where organization_id=v_organization_id
     and normalized_email=v_old_email
     and state<>'revoked';

  select public.research_bind_verified_organization_user(
    v_organization_id,
    v_auth_user_id,
    v_canonical_email,
    array['organization_owner','business_buyer']::text[],
    'Reviewed Roman Digital existing-auth binding',
    true
  ) into v_membership_id;

  if not exists (
    select 1 from public.research_organization_users
     where id=v_membership_id
       and organization_id=v_organization_id
       and auth_user_id=v_auth_user_id
       and email_at_binding=v_canonical_email
       and state='active'
       and password_change_required
       and password_change_required_at is not null
       and roles @> array['organization_owner','business_buyer']::text[]
       and roles <@ array['organization_owner','business_buyer']::text[]
  ) then
    raise exception 'Roman Digital organization binding verification failed' using errcode='23514';
  end if;

  if not exists (
    select 1 from public.research_account_binding_events
     where event_type='organization_identity_superseded'
       and auth_user_id=v_auth_user_id
       and organization_id=v_organization_id
       and detail->>'canonicalEmail'=v_canonical_email
  ) then
    insert into public.research_account_binding_events(
      event_type,auth_user_id,organization_id,organization_user_id,actor_label,detail
    ) values (
      'organization_identity_superseded',v_auth_user_id,v_organization_id,v_membership_id,
      'Reviewed Roman Digital existing-auth binding',
      jsonb_build_object('supersededEmail',v_old_email,'canonicalEmail',v_canonical_email)
    );
  end if;
end;
$$;
