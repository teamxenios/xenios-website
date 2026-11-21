-- Source candidate only. Installation requires the exact managed action plan.
-- Reuses canonical Auth sessions and platform roles; creates no identity,
-- role assignment, session, audit table, provider action or account mutation.
begin;

-- CREATE intentionally refuses an unknown prior routine rather than replacing
-- its owner, definition or grants. Install prechecks must establish absence.
create function public.research_admin_account_read_current(
  p_actor_user_id uuid,
  p_session_id uuid
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- The canonical server verifies the ordinary JWT and recent MFA before this
  -- service-only RPC. Client-supplied UUIDs or a user-bearing service request
  -- must never turn the routine into a public authorization oracle.
  if current_setting('role', true) is distinct from 'service_role'
    or auth.uid() is not null then
    raise exception using errcode = '42501', message = 'account_read_backend_only';
  end if;
  if p_actor_user_id is null or p_session_id is null then return false; end if;

  return exists (
    select 1 from auth.sessions s
    where s.id = p_session_id
      and s.user_id = p_actor_user_id
      and (s.not_after is null or s.not_after > statement_timestamp())
      and s.aal = 'aal2'
      and exists (
        select 1 from public.research_prelaunch_role_assignments r
        where r.auth_user_id = p_actor_user_id
          and r.role = 'super_admin'
          and r.granted_at <= statement_timestamp()
          and r.revoked_at is null
          and (r.expires_at is null or r.expires_at > statement_timestamp())
      )
  );
end
$$;

revoke all on function public.research_admin_account_read_current(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.research_admin_account_read_current(uuid, uuid)
  to service_role;
comment on function public.research_admin_account_read_current(uuid, uuid) is
  'Service-only current canonical session/AAL2/platform-super-admin check for account directory/detail; no records or credentials returned.';

commit;
