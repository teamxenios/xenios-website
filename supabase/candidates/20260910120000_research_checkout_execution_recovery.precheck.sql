-- READ ONLY. Run with stop-on-error as the intended migration executor against
-- the explicitly approved project. No customer rows or credentials print.
--
-- This candidate DEPENDS on 20260909150000_research_checkout_executions being
-- installed first: it reads that table and returns its row type. If that
-- migration is absent this precheck STOPS, because installing discovery for a
-- table that does not exist would only fail later and less clearly.
begin read only;
set local statement_timeout = '30s';
set local lock_timeout = '5s';
set local row_security = off;

do $precheck$
declare
  column_name text;
begin
  if not exists(select 1 from pg_catalog.pg_roles
    where rolname = current_user and (rolsuper or rolbypassrls)) then
    raise exception 'checkout recovery checker requires SUPERUSER or BYPASSRLS executor';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'required database role absent: service_role';
  end if;

  -- The prerequisite migration.
  if to_regclass('public.research_checkout_executions') is null then
    raise exception 'STOP: 20260909150000_research_checkout_executions is not installed; install and postcheck it first';
  end if;

  -- Every column the discovery read filters or orders on.
  foreach column_name in array array['updated_at','phase','settled_at'] loop
    if not exists (select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'research_checkout_executions' and column_name = column_name) then
      raise exception 'research_checkout_executions lacks column %', column_name;
    end if;
  end loop;

  -- First install: the function must not already exist under another definition.
  if to_regprocedure('public.research_checkout_executions_list_recoverable(timestamptz,integer,timestamptz,uuid)') is not null then
    raise exception 'STOP: the discovery function already exists; inspect migration history and run the postcheck instead';
  end if;

  raise notice 'checkout recovery precheck PASS';
end $precheck$;
rollback;
