-- PACK 02 CANDIDATE ONLY. BUILD/REVIEW/REHEARSE; DO NOT APPLY FROM THIS LANE.
-- Depends on the Pack 02 research_account_binding_events candidate.
-- Creates no Auth user, password, order, cart, catalog, payment, or session.

begin;

create or replace function public.research_bind_active_buyer_account(
  p_application_id uuid,
  p_auth_user_id uuid,
  p_normalized_email text,
  p_first_name text,
  p_actor_label text,
  p_activation_path text
)
returns table (
  id uuid,
  application_id uuid,
  auth_user_id uuid,
  email text,
  status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member public.research_members%rowtype;
  v_auth auth.users%rowtype;
  v_application public.research_applications%rowtype;
begin
  if p_normalized_email <> lower(trim(p_normalized_email))
     or length(p_normalized_email) not between 3 and 254 then
    raise exception 'canonical buyer email is not normalized' using errcode = '22023';
  end if;
  if p_activation_path not in ('existing_user_attached', 'existing_invite_resent', 'new_user_invited') then
    raise exception 'buyer activation path is invalid' using errcode = '22023';
  end if;
  if length(trim(p_first_name)) not between 1 and 120
     or length(trim(p_actor_label)) not between 3 and 160 then
    raise exception 'buyer activation evidence is invalid' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_application_id::text, 0));
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_auth_user_id::text, 1));

  select * into v_application
  from public.research_applications
  where research_applications.id = p_application_id
  for update;
  if not found
     or lower(v_application.email) <> p_normalized_email
     or v_application.status <> 'active'
     or trim(v_application.first_name) <> trim(p_first_name) then
    raise exception 'canonical active application evidence does not match' using errcode = '23514';
  end if;

  select * into v_auth from auth.users where auth.users.id = p_auth_user_id for update;
  if not found or lower(v_auth.email) <> p_normalized_email then
    raise exception 'Supabase Auth identity evidence does not match' using errcode = '23514';
  end if;
  if p_activation_path = 'existing_user_attached' and v_auth.email_confirmed_at is null then
    raise exception 'existing Supabase Auth email is not confirmed' using errcode = '23514';
  end if;

  select * into v_member
  from public.research_members m
  where m.application_id = p_application_id
     or m.auth_user_id = p_auth_user_id
     or lower(m.email) = p_normalized_email
  order by m.id
  limit 1
  for update;

  if found then
    if v_member.application_id <> p_application_id
       or v_member.auth_user_id <> p_auth_user_id
       or lower(v_member.email) <> p_normalized_email
       or v_member.status <> 'active' then
      raise exception 'canonical member binding conflicts with activation evidence' using errcode = '23505';
    end if;
  else
    insert into public.research_members(
      application_id, auth_user_id, email, first_name, status, activated_at
    ) values (
      p_application_id, p_auth_user_id, p_normalized_email, trim(p_first_name), 'active', pg_catalog.clock_timestamp()
    ) returning * into v_member;

    insert into public.research_account_binding_events(
      event_type, auth_user_id, actor_label, detail
    ) values (
      'buyer_account_activated',
      p_auth_user_id,
      trim(p_actor_label),
      pg_catalog.jsonb_build_object(
        'applicationId', p_application_id,
        'memberId', v_member.id,
        'canonicalEmail', p_normalized_email,
        'activationPath', p_activation_path
      )
    );
  end if;

  return query select
    v_member.id,
    v_member.application_id,
    v_member.auth_user_id,
    v_member.email,
    v_member.status;
end;
$$;

revoke all on function public.research_bind_active_buyer_account(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.research_bind_active_buyer_account(uuid, uuid, text, text, text, text)
  to service_role;

commit;
