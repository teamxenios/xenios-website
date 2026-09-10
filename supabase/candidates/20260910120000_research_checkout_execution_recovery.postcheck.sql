-- READ ONLY. Immediate post-install check. No writes, no customer rows.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local row_security = off;

do $postcheck$
declare
  signature text := 'public.research_checkout_executions_list_recoverable(timestamptz,integer,timestamptz,uuid)';
begin
  if to_regprocedure(signature) is null then
    raise exception 'missing function %', signature;
  end if;
  -- Service-role only, exactly like every other function in this lane.
  if has_function_privilege('anon', signature, 'EXECUTE')
    or has_function_privilege('authenticated', signature, 'EXECUTE') then
    raise exception '% is executable by a public role', signature;
  end if;
  if not has_function_privilege('service_role', signature, 'EXECUTE') then
    raise exception '% is not executable by service_role', signature;
  end if;
  -- A read must not be able to write.
  if exists (select 1 from pg_proc where oid = to_regprocedure(signature) and provolatile = 'v') then
    raise exception '% must be STABLE, not VOLATILE', signature;
  end if;
  -- The half-cursor guard must actually be present: without it a corrupt
  -- checkpoint silently returns page one for ever.
  if not exists (
    select 1 from pg_proc where oid = to_regprocedure(signature)
      and prosrc like '%the page cursor is incomplete%'
  ) then
    raise exception '% does not refuse an incomplete page cursor', signature;
  end if;
  if exists (select 1 from pg_proc where oid = to_regprocedure(signature) and prosecdef) then
    raise exception '% must not be SECURITY DEFINER', signature;
  end if;
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'research_checkout_executions_recoverable_idx') then
    raise exception 'discovery index missing; the sweep would sequentially scan a growing table';
  end if;
  -- The index must exclude settled cancellations too, or it grows with lifetime
  -- volume rather than with the live backlog.
  if not exists (select 1 from pg_indexes where schemaname = 'public'
    and indexname = 'research_checkout_executions_recoverable_idx'
    and indexdef like '%settled_at is null%') then
    raise exception 'discovery index still carries settled rows; its predicate must match the function filter';
  end if;
  -- This candidate creates no table and no row.
  if to_regclass('public.research_checkout_executions') is null then
    raise exception 'prerequisite table disappeared';
  end if;
  raise notice 'checkout recovery postcheck PASS';
end $postcheck$;
rollback;
