-- Root application companion. Additive authority vocabulary, no human grant or activation.
-- Apply only after the exact business_inquiry.sql candidate under a reviewed action.
begin;
do $migration$
declare prior record; role_column smallint; checked integer:=0;
begin
  select attnum into strict role_column from pg_catalog.pg_attribute
    where attrelid='public.care_role_assignments'::regclass and attname='role' and not attisdropped;
  for prior in select conname,pg_catalog.pg_get_expr(conbin,conrelid) as expression
    from pg_catalog.pg_constraint where conrelid='public.care_role_assignments'::regclass
      and contype='c' and convalidated and conkey=array[role_column]
  loop
    checked:=checked+1;
    if position(quote_literal('business_inquiry_reader') in prior.expression)=0
      or position(quote_literal('business_inquiry_operator') in prior.expression)=0 then
      execute format('alter table public.care_role_assignments drop constraint %I, add constraint %I check ((%s) or role in (%L,%L))',
        prior.conname,prior.conname,prior.expression,'business_inquiry_reader','business_inquiry_operator');
    end if;
  end loop;
  if checked=0 then raise exception 'business_inquiry_role_contract_missing'; end if;
end;
$migration$;
insert into public.care_capabilities(capability_key,state)
  values('business_inquiry_read','disabled'),('business_inquiry_assign','disabled')
  on conflict(capability_key) do nothing;
grant select on public.care_capabilities,public.care_role_assignments to service_role;

-- A boolean public projection for the server only: no contact, operator or policy identifiers.
create or replace function public.research_business_inquiry_readiness()
returns boolean language sql stable security invoker set search_path='' as $$
  select current_user='service_role' and exists(
    select 1 from business_inquiry_private.configuration c
    where c.singleton and c.enabled and c.visibility_ready and c.retention_ready
      and c.policy_version is not null and c.policy_binding->>'scope'='business_b2b'
      and coalesce(length(c.policy_binding->>'retentionRecord'),0)>0
      and coalesce(length(c.policy_binding->>'recipientRecord'),0)>0
      and exists(select 1 from public.care_role_assignments r
        where business_inquiry_private.staff_allowed(r.user_id)))
$$;
revoke all on function public.research_business_inquiry_readiness() from public,anon,authenticated;
grant execute on function public.research_business_inquiry_readiness() to service_role;
commit;
