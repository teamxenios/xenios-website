-- Exact-schema/ACL/trigger checks plus bounded aggregate observations. This is
-- not evidence-source authentication or arbitrary predecessor-replay safety.
begin transaction read only;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $check$
declare signature text; actor_role text; table_name text; helper record; t record; permitted boolean;
begin
  if to_regprocedure('public.research_assisted_order_disposition_context(uuid,uuid)') is not null then
    raise exception 'Unexpected unscoped disposition context overload' using errcode='55000';end if;
  foreach signature in array array[
    'public.research_assisted_order_disposition_context(uuid,uuid,text)',
    'public.research_assisted_order_disposition_commit_cancel(uuid,uuid,text,uuid,text,text,jsonb)',
    'public.research_assisted_order_disposition_effects_authority()',
    'public.research_assisted_order_disposition_effects_context(uuid)',
    'public.research_assisted_order_disposition_effects_pending(timestamptz,uuid,integer)',
    'public.research_assisted_order_disposition_effects_complete(uuid,text,text,jsonb)',
    'public.research_assisted_order_disposition_effects_outbox_ready(uuid,uuid,text,text,text,jsonb)'
  ] loop
    if to_regprocedure(signature) is null or not exists(select 1 from pg_proc where oid=to_regprocedure(signature)
      and prosecdef and ('search_path=""'=any(proconfig))) then raise exception 'Disposition RPC missing/insecure' using errcode='55000';end if;
    foreach actor_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(actor_role,signature,'EXECUTE') is distinct from (actor_role='service_role') then
        raise exception 'Disposition RPC privilege mismatch' using errcode='55000';end if;
    end loop;
  end loop;
  for helper in select oid,proname from pg_proc where pronamespace='public'::regnamespace
    and proname like 'research_assisted_order_disposition_%' loop
    permitted:=helper.oid=any(array[
      'public.research_assisted_order_disposition_context(uuid,uuid,text)'::regprocedure,
      'public.research_assisted_order_disposition_commit_cancel(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure,
      'public.research_assisted_order_disposition_effects_authority()'::regprocedure,
      'public.research_assisted_order_disposition_effects_context(uuid)'::regprocedure,
      'public.research_assisted_order_disposition_effects_pending(timestamptz,uuid,integer)'::regprocedure,
      'public.research_assisted_order_disposition_effects_complete(uuid,text,text,jsonb)'::regprocedure,
      'public.research_assisted_order_disposition_effects_outbox_ready(uuid,uuid,text,text,text,jsonb)'::regprocedure]::oid[]);
    foreach actor_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(actor_role,helper.oid,'EXECUTE') is distinct from (permitted and actor_role='service_role') then
        raise exception 'Disposition helper or unapproved overload exposed' using errcode='55000';end if;
    end loop;
  end loop;
  foreach table_name in array array['research_assisted_order_no_funds_grants','research_assisted_order_no_funds_evidence','research_assisted_order_financial_dispositions'] loop
    if not exists(select 1 from pg_class where oid=to_regclass('public.'||table_name) and relrowsecurity and relforcerowsecurity) then
      raise exception 'Disposition table RLS mismatch' using errcode='55000';end if;
    foreach actor_role in array array['anon','authenticated','service_role'] loop
      if has_table_privilege(actor_role,'public.'||table_name,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
        raise exception 'Direct financial-disposition table privilege' using errcode='55000';end if;
    end loop;
  end loop;
  for t in select * from (values
    ('research_assisted_order_payment_observations','research_assisted_order_observation_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_payment_verifications','research_assisted_order_verification_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_evidence_claims','hl12_claim_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_observation_corrections','hl12_correction_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_events','research_assisted_order_events_append_only','research_assisted_order_events_block_mutation()'),
    ('research_assisted_order_requests','hl12_observed_cancel','research_assisted_order_observed_cancel_guard()'),
    ('research_assisted_order_requests','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_payment_observations','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_payment_verifications','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_observation_corrections','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_evidence_claims','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_quotes','aa_hl12_disposition_terminal','research_assisted_order_disposition_terminal_guard()'),
    ('research_assisted_order_no_funds_evidence','hl12_disposition_evidence','research_assisted_order_disposition_evidence_guard()'),
    ('research_assisted_order_no_funds_evidence','hl12_disposition_immutable','research_assisted_order_disposition_immutable()'),
    ('research_assisted_order_financial_dispositions','hl12_disposition_immutable','research_assisted_order_disposition_immutable()'),
    ('research_assisted_order_observation_corrections','hl12_disposition_correction_edges','research_assisted_order_disposition_correction_edges_guard()'),
    ('research_assisted_order_events','hl12_disposition_cancel_event','research_assisted_order_disposition_cancel_event_guard()'),
    ('research_assisted_order_financial_dispositions','hl12_disposition_capture','research_assisted_order_disposition_capture()'),
    ('research_assisted_order_financial_dispositions','hl12_disposition_transaction','research_assisted_order_disposition_transaction_guard()'),
    ('research_assisted_order_no_funds_evidence','hl12_disposition_evidence_transaction','research_assisted_order_disposition_transaction_guard()'),
    ('research_notification_outbox','hl12_disposition_effects_outbox','research_assisted_order_disposition_effects_outbox_guard()'),
    ('research_notification_outbox','hl12_disposition_effects_truncate','research_assisted_order_disposition_effects_outbox_guard()')
  ) expected(relation_name,trigger_name,function_name) loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||t.relation_name)
      and tgname=t.trigger_name and tgfoid=to_regprocedure('public.'||t.function_name) and tgenabled in ('O','A')) then
      raise exception 'Disposition guard absent/ineffective' using errcode='55000';end if;
  end loop;
  foreach table_name in array array['research_assisted_order_no_funds_evidence','research_assisted_order_financial_dispositions',
    'research_assisted_order_payment_observations','research_assisted_order_payment_verifications','research_assisted_order_observation_corrections',
    'research_assisted_order_evidence_claims','research_assisted_order_events'] loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||table_name) and tgname='hl12_disposition_no_truncate'
      and tgfoid='public.research_assisted_order_disposition_immutable()'::regprocedure and tgenabled in ('O','A')) then
      raise exception 'Financial graph truncate guard absent' using errcode='55000';end if;
  end loop;
end
$check$;
select json_build_object('checks','PASS','scoped_grants',(select count(*) from public.research_assisted_order_no_funds_grants),
  'evidence',(select count(*) from public.research_assisted_order_no_funds_evidence),
  'dispositions',(select count(*) from public.research_assisted_order_financial_dispositions),
  'held_intents',(select count(*) from public.research_notification_outbox where assisted_order_disposition_id is not null and status='held'))::text;
rollback;
