-- PII-free/read-only; requires the exact financial predecessors, not M71 only.
begin transaction read only;
set local lock_timeout='5s';
set local statement_timeout='15s';
do $prerequisites$
declare g record;
begin
  for g in select * from (values
    ('research_assisted_order_payment_observations','research_assisted_order_observation_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_payment_verifications','research_assisted_order_verification_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_evidence_claims','hl12_claim_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_observation_corrections','hl12_correction_immutable','research_assisted_order_financial_block_mutation()'),
    ('research_assisted_order_events','research_assisted_order_events_append_only','research_assisted_order_events_block_mutation()'),
    ('research_assisted_order_requests','hl12_observed_cancel','research_assisted_order_observed_cancel_guard()')
  ) guards(relation_name,trigger_name,function_name) loop
    if not exists(select 1 from pg_trigger where tgrelid=to_regclass('public.'||g.relation_name)
      and tgname=g.trigger_name and tgfoid=to_regprocedure('public.'||g.function_name) and tgenabled in ('O','A') and not tgisinternal) then
      raise exception 'No-funds prerequisite guard missing or ineffective' using errcode='55000';end if;
  end loop;
end
$prerequisites$;
select json_build_object(
  'requests',(select count(*) from public.research_assisted_order_requests),
  'observations',(select count(*) from public.research_assisted_order_payment_observations),
  'provider_observations',(select count(*) from public.research_assisted_order_payment_observations where method='provider'),
  'manual_observations_missing_actor',(select count(*) from public.research_assisted_order_payment_observations where method='manual' and observed_by_auth_user_id is null),
  'verifications',(select count(*) from public.research_assisted_order_payment_verifications),
  'paid_history_requests',(select count(distinct request_id) from public.research_assisted_order_events where status='paid'),
  'corrections',(select count(*) from public.research_assisted_order_observation_corrections),
  'orphan_claims',(select count(*) from public.research_assisted_order_evidence_claims c where not exists(
    select 1 from public.research_assisted_order_payment_observations o where o.request_id=c.request_id and o.method=c.method
      and coalesce(o.provider_name,'')=c.provider_namespace and btrim(o.source_evidence_ref)=c.evidence_ref))
)::text;
select json_build_object('quote_issue_md5',md5(pg_get_functiondef('public.research_assisted_order_quote_issue(uuid,jsonb,timestamptz,text,text)'::regprocedure)),
  'observed_cancel_guard_md5',md5(pg_get_functiondef('public.research_assisted_order_observed_cancel_guard()'::regprocedure)))::text;
rollback;
