-- Xenios Research release hardening: event-trigger helper grants.
--
-- public.rls_auto_enable() is an internal SECURITY DEFINER event-trigger
-- function. It is invoked by PostgreSQL's DDL event machinery, never by a
-- browser or application RPC. Supabase's default function grants made it
-- executable by PUBLIC, anon, and authenticated. Remove those unnecessary
-- grants without changing the event trigger or its behavior.
--
-- Additive/idempotent privilege hardening. No data or schema objects are
-- removed, no capability is enabled, and the service-role application does
-- not call this function.

revoke execute on function public.rls_auto_enable()
  from public, anon, authenticated;
