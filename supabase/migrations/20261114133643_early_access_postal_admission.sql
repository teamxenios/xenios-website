-- The former admission functions stay available to the running site during rollout.
-- The new API requires a complete address, including for previously admitted guests.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table request_intent_private.catalog_contact_admission
  add column if not exists postal_address jsonb;

create or replace function request_intent_private.catalog_address_has(p_owner_binding text, p_policy_revision text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'private_custody_required';
  end if;
  return exists (
    select 1 from request_intent_private.catalog_contact_admission
    where owner_binding = p_owner_binding and policy_revision = p_policy_revision
      and postal_address is not null and expires_at > statement_timestamp()
  );
end $$;

create or replace function request_intent_private.catalog_address_put(
  p_owner_binding text, p_policy_revision text, p_full_legal_name text, p_email text,
  p_postal_address jsonb, p_ttl_seconds integer
) returns text language plpgsql security definer set search_path = '' as $$
declare
  outcome text;
begin
  if current_setting('role', true) is distinct from 'service_role' then
    raise exception using errcode = '42501', message = 'private_custody_required';
  end if;
  if jsonb_typeof(p_postal_address) is distinct from 'object' then
    raise exception using errcode = '22023', message = 'invalid_postal_address';
  end if;
  if not (p_postal_address ?& array['line1','city','countryCode'])
    or p_postal_address - array['line1','line2','city','region','postalCode','countryCode'] <> '{}'::jsonb
    or (p_postal_address->>'countryCode') collate "C" !~ '^[A-Z]{2}$'
    or (p_postal_address->>'countryCode' in ('US','CA') and not (p_postal_address ?& array['region','postalCode']))
    or exists (
      select 1 from jsonb_each(p_postal_address) as field(key, value)
      where jsonb_typeof(field.value) <> 'string'
        or length(field.value #>> '{}') not between 1 and
           case field.key when 'line1' then 200 when 'line2' then 200 when 'postalCode' then 40 when 'countryCode' then 2 else 120 end
        or (field.value #>> '{}') ~ '[[:cntrl:]]'
        or (field.value #>> '{}') <> btrim(field.value #>> '{}')
    ) then
    raise exception using errcode = '22023', message = 'invalid_postal_address';
  end if;

  -- Reuse the name/email validation, key lock, conflict checks and expiration in one transaction.
  outcome := request_intent_private.contact_admission_put(
    p_owner_binding, p_policy_revision, p_full_legal_name, p_email, p_ttl_seconds
  );
  if outcome = 'committed' then
    update request_intent_private.catalog_contact_admission set postal_address = p_postal_address
      where owner_binding = p_owner_binding and policy_revision = p_policy_revision;
  elsif outcome = 'already_same' and not exists (
    select 1 from request_intent_private.catalog_contact_admission
      where owner_binding = p_owner_binding and policy_revision = p_policy_revision and postal_address = p_postal_address
  ) then
    return 'different_contact';
  end if;
  return outcome;
end $$;

create or replace function public.request_intent_catalog_address_has(p_owner_binding text, p_policy_revision text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select request_intent_private.catalog_address_has(p_owner_binding, p_policy_revision);
$$;
create or replace function public.request_intent_catalog_address_put(
  p_owner_binding text, p_policy_revision text, p_full_legal_name text, p_email text,
  p_postal_address jsonb, p_ttl_seconds integer
) returns text language sql security invoker set search_path = '' as $$
  select request_intent_private.catalog_address_put(p_owner_binding, p_policy_revision, p_full_legal_name, p_email, p_postal_address, p_ttl_seconds);
$$;
revoke all on function request_intent_private.catalog_address_has(text,text),
  request_intent_private.catalog_address_put(text,text,text,text,jsonb,integer),
  public.request_intent_catalog_address_has(text,text),
  public.request_intent_catalog_address_put(text,text,text,text,jsonb,integer) from public, anon, authenticated;
grant execute on function request_intent_private.catalog_address_has(text,text),
  request_intent_private.catalog_address_put(text,text,text,text,jsonb,integer),
  public.request_intent_catalog_address_has(text,text),
  public.request_intent_catalog_address_put(text,text,text,text,jsonb,integer) to service_role;
commit;
