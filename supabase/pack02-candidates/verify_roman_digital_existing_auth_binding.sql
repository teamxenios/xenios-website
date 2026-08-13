-- Read-only verification for the dependent Roman Digital candidate.
-- Run only in an isolated review database after applying both candidates twice.

do $$
begin
  if not exists (
    select 1 from auth.users
     where id='20ec822d-8123-4088-ac05-9c8f4b2da784'
       and lower(trim(email))='info@romanhealthcollective.com'
       and email_confirmed_at is not null
  ) then
    raise exception 'exact verified Roman Digital Supabase Auth identity is missing';
  end if;

  if not exists (
    select 1
      from public.research_organization_users u
      join public.research_organizations o on o.id=u.organization_id
     where u.auth_user_id='20ec822d-8123-4088-ac05-9c8f4b2da784'
       and u.organization_id='e26bc7de-86df-4e70-8e82-964e3671d71c'
       and u.email_at_binding='info@romanhealthcollective.com'
       and u.state='active'
       and u.password_change_required
       and u.password_change_required_at is not null
       and u.roles @> array['organization_owner','business_buyer']::text[]
       and u.roles <@ array['organization_owner','business_buyer']::text[]
       and o.slug='roman-digital'
       and o.purchasing_email='info@romanhealthcollective.com'
       and o.billing_email='info@romanhealthcollective.com'
  ) then
    raise exception 'Roman Digital membership or profile is missing or drifted';
  end if;

  if exists (
    select 1 from public.research_organization_invitations
     where organization_id='e26bc7de-86df-4e70-8e82-964e3671d71c'
       and normalized_email='k@romandigital.io'
       and state in ('pending','accepted')
  ) then
    raise exception 'superseded Roman Digital invitation remains usable';
  end if;

  if not exists (
    select 1 from public.research_account_binding_events
     where event_type='organization_identity_superseded'
       and auth_user_id='20ec822d-8123-4088-ac05-9c8f4b2da784'
       and organization_id='e26bc7de-86df-4e70-8e82-964e3671d71c'
       and detail->>'canonicalEmail'='info@romanhealthcollective.com'
       and detail->>'supersededEmail'='k@romandigital.io'
  ) then
    raise exception 'auditable Roman Digital identity supersession is missing';
  end if;
end;
$$;
