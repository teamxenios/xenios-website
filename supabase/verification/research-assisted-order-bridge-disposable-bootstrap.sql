-- Disposable-database bootstrap for the assisted-order bridge rehearsal.
--
-- The bridge migration refuses to run unless the Supabase role set exists,
-- because its whole boundary is stated as revokes against those three roles:
-- on a database without them the revokes would bind to nothing and the
-- boundary would exist only as intent. A stock postgres:16 or postgres:17
-- container has no such roles, so a rehearsal must create them first.
--
-- This file exists ONLY to make a throwaway container resemble managed
-- Supabase closely enough to rehearse against. It is never applied to
-- production, where these roles already exist and are managed by Supabase.
--
-- The roles are created NOLOGIN on purpose. The rehearsal needs them to exist
-- so privileges can be granted, revoked and inspected; it never needs to
-- authenticate as one, and a login-capable role in a rehearsal fixture is an
-- affordance nothing here requires.

do $bootstrap_roles$
declare
  v_role text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute pg_catalog.format('create role %I nologin', v_role);
    end if;
  end loop;
end
$bootstrap_roles$;
