-- Read-only fail-closed structural and ACL proof. Exact migration/file checksum
-- and effective function fingerprint must accompany this result at promotion.
begin transaction read only;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $check$
declare
  v_role text;
  v_guard record;
  v_signature text := 'public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)';
  v_body text;
begin
  if pg_catalog.to_regprocedure(v_signature) is null then
    raise exception 'Quote issue RPC missing' using errcode='55000';
  end if;
  select p.prosrc into v_body from pg_catalog.pg_proc p where p.oid=v_signature::regprocedure;
  if not exists (select 1 from pg_catalog.pg_proc p where p.oid=v_signature::regprocedure
    and p.prosecdef and ('search_path=""'=any(p.proconfig)))
    or position('ASSISTED_ORDER_QUOTE_FINANCIAL_HISTORY_HOLD' in v_body)=0
    or position('''payment_pending'', ''payment_review''' in v_body)=0 then
    raise exception 'Quote reissue successor or secure configuration missing' using errcode='55000';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,v_signature,'EXECUTE') is distinct from (v_role='service_role')
      or has_table_privilege(v_role,'public.research_assisted_order_quotes','INSERT,UPDATE,DELETE,TRUNCATE')
      or has_function_privilege(v_role,'public.research_assisted_order_payment_verify(uuid,uuid)','EXECUTE') then
      raise exception 'Quote reissue authority boundary mismatch' using errcode='55000';
    end if;
  end loop;
  for v_guard in select * from (values
    ('public.research_assisted_order_requests','hl12_history_progression','public.research_assisted_order_history_progression_guard()'),
    ('public.research_assisted_order_quotes','hl12_quote_snapshot_immutable','public.research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_quotes','hl12_quote_snapshot_no_truncate','public.research_assisted_order_quote_snapshot_guard()'),
    ('public.research_assisted_order_payment_observations','hl12_provider_observation_hold','public.research_assisted_order_provider_payment_hold_guard()'),
    ('public.research_assisted_order_payment_verifications','hl12_provider_verification_hold','public.research_assisted_order_provider_payment_hold_guard()')
  ) as guards(relation_name,trigger_name,function_name) loop
    if not exists (select 1 from pg_catalog.pg_trigger t
      where t.tgrelid=pg_catalog.to_regclass(v_guard.relation_name)
        and t.tgname=v_guard.trigger_name and t.tgfoid=pg_catalog.to_regprocedure(v_guard.function_name)
        and t.tgenabled in ('O','A')) then
      raise exception 'Quote reissue predecessor guard missing or ineffective' using errcode='55000';
    end if;
  end loop;
end
$check$;
select json_build_object('quote_reissue_checks','PASS',
  'quote_issue_md5',md5(pg_get_functiondef('public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure)),
  'quote_accept_md5',md5(pg_get_functiondef('public.research_assisted_order_quote_accept(uuid,integer,bigint,uuid,text,text)'::regprocedure)))::text;
rollback;
