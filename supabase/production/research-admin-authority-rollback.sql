-- Zero-state rollback for Website 1 durable administrator authority.
-- Website 2 must not run this after any assignment/preference command.

begin;

do $$
begin
  if to_regclass('public.research_admin_experience_preferences') is not null
     and exists (
       select 1 from public.research_admin_experience_preferences
     ) then
    raise exception 'rollback refused: administrator preferences exist';
  end if;
  if to_regclass('public.research_admin_authority_audit') is not null
     and exists (
       select 1 from public.research_admin_authority_audit
     ) then
    raise exception 'rollback refused: administrator authority audit exists';
  end if;
end;
$$;

drop function if exists public.research_admin_assign_initial_super_admin(
  uuid, text, text
);
drop function if exists public.research_admin_role_revoke(
  uuid, uuid, text, text
);
drop function if exists public.research_admin_role_grant(
  uuid, uuid, text, text, timestamptz, text
);
drop function if exists public.research_admin_set_experience_preference(
  uuid, text, bigint, text
);
drop function if exists public.research_admin_active_super_admin(uuid);
drop table if exists public.research_admin_authority_audit;
drop table if exists public.research_admin_experience_preferences;
drop function if exists public.research_admin_authority_reject_audit_mutation();

-- Restore the pre-cutover repository mutation privileges for a code rollback.
grant select, insert, update, delete
  on table public.research_prelaunch_role_assignments
  to service_role;

commit;
