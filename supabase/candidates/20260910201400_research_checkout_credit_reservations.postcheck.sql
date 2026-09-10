-- READ ONLY. No customer values or credential material are printed.
begin read only;
set local statement_timeout = '30s';
set local row_security = off;
do $postcheck$
declare v_signature text; v_role text; v_trigger text; v_oid oid;
begin
  if not exists(select 1 from pg_catalog.pg_roles where rolname=current_user and (rolsuper or rolbypassrls)) then
    raise exception 'credit_checker_requires_bypassrls';
  end if;
  if not exists(select 1 from pg_catalog.pg_class where oid=to_regclass('public.research_checkout_credit_reservations')
      and relrowsecurity and relforcerowsecurity) then raise exception 'credit_reservation_rls_missing'; end if;
  if exists(select 1 from pg_catalog.pg_policy where polrelid='public.research_checkout_credit_reservations'::regclass) then
    raise exception 'credit_reservation_public_policy_unexpected';
  end if;
  foreach v_role in array array['anon','authenticated'] loop
    if has_table_privilege(v_role,'public.research_checkout_credit_reservations','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'credit_reservation_untrusted_table_grant';
    end if;
  end loop;
  if not has_table_privilege('service_role','public.research_checkout_credit_reservations','SELECT')
    or not has_table_privilege('service_role','public.research_checkout_credit_reservations','INSERT')
    or not has_table_privilege('service_role','public.research_checkout_credit_reservations','UPDATE')
    or has_table_privilege('service_role','public.research_checkout_credit_reservations','DELETE,TRUNCATE') then
    raise exception 'credit_reservation_service_privileges_mismatch';
  end if;
  foreach v_signature in array array[
    'public.research_store_credit_member_lock(uuid)',
    'public.research_store_credit_balance(uuid,timestamptz)',
    'public.research_store_credit_require_nonexpiring(uuid)',
    'public.research_store_credit_spend(uuid,bigint,uuid,timestamptz)',
    'public.research_checkout_execution_commit_captured(uuid,integer,timestamptz)',
    'public.research_checkout_execution_commit_cancelled(uuid,integer,timestamptz)'
  ] loop
    v_oid:=to_regprocedure(v_signature);
    if v_oid is null then raise exception 'credit_required_function_missing: %',v_signature; end if;
    if exists(select 1 from pg_catalog.pg_proc where oid=v_oid and prosecdef) then raise exception 'credit_unexpected_security_definer'; end if;
    if not has_function_privilege('service_role',v_oid,'EXECUTE') then raise exception 'credit_service_execute_missing'; end if;
    if has_function_privilege('anon',v_oid,'EXECUTE') or has_function_privilege('authenticated',v_oid,'EXECUTE') then
      raise exception 'credit_untrusted_execute_grant';
    end if;
  end loop;
  foreach v_trigger in array array['research_checkout_credit_lock_before_insert','research_checkout_credit_reserve',
      'research_store_credit_protect_reservations','research_checkout_credit_immutable'] loop
    if not exists(select 1 from pg_catalog.pg_trigger t where t.tgname=v_trigger and t.tgenabled='O'
        and t.tgrelid in ('public.research_checkout_executions'::regclass,'public.research_store_credit_ledger'::regclass,
          'public.research_checkout_credit_reservations'::regclass)) then raise exception 'credit_trigger_missing: %',v_trigger; end if;
  end loop;
  if not exists(select 1 from pg_catalog.pg_index where indexrelid=to_regclass('public.research_store_credit_ledger_spend_order_idx')
      and indisunique and indisvalid) then raise exception 'credit_spend_unique_index_missing'; end if;
  if not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='research_store_credit_ledger' and column_name='spend_order_id' and data_type='uuid') then
    raise exception 'credit_spend_order_column_missing';
  end if;
  raise notice 'credit reservation postcheck PASS';
end $postcheck$;
rollback;
