-- PACK 02 candidate verification. Run only in an isolated review database
-- after applying the candidate twice. This script performs no writes.

do $$
declare v_count integer;
begin
  select count(*) into v_count
    from information_schema.columns
   where table_schema='public'
     and table_name in (
       'research_organizations','research_organization_users','research_organization_invitations',
       'research_account_claim_challenges','research_customer_account_bindings',
       'research_account_binding_events','research_organization_request_again'
     )
     and lower(column_name) like '%password%';
  if v_count <> 3 then
    -- Only password_change_required(_at)/password_changed_at are allowed.
    raise exception 'unexpected password-shaped column count: %',v_count;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name in ('research_organizations','research_organization_users','research_organization_invitations')
       and column_name in ('password','password_hash','credential','credential_hash')
  ) then
    raise exception 'credential storage is forbidden';
  end if;

  if not exists (
    select 1 from public.research_organizations
     where id='e26bc7de-86df-4e70-8e82-964e3671d71c'
       and slug='roman-digital' and display_name='Roman Digital'
       and purchasing_email='k@romandigital.io'
  ) then
    raise exception 'Roman Digital seed is missing or drifted';
  end if;

  if exists (
    select 1 from public.research_organization_users u
     left join auth.users a on a.id=u.auth_user_id
     where a.id is null or a.email_confirmed_at is null or lower(a.email)<>u.email_at_binding
  ) then
    raise exception 'organization user lacks matching verified Supabase Auth identity';
  end if;

  if exists (
    select customer_ref from public.research_customer_account_bindings
     group by customer_ref having count(*) > 1
  ) then
    raise exception 'a customerRef has more than one account owner';
  end if;
end;
$$;
