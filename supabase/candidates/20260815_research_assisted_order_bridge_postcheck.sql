with expected_relations(name) as (
  values
    ('research_assisted_order_requests'),
    ('research_assisted_order_lines'),
    ('research_assisted_order_events'),
    ('research_assisted_order_access_tokens'),
    ('research_assisted_order_documents')
), expected_functions(name) as (
  values
    ('research_assisted_order_submit'),
    ('research_assisted_order_status'),
    ('research_assisted_order_admin_get'),
    ('research_assisted_order_admin_list'),
    ('research_assisted_order_set_status'),
    ('research_assisted_order_document_create'),
    ('research_assisted_order_document_complete'),
    ('research_assisted_order_document_get')
), relation_state as (
  select e.name,
         to_regclass('public.' || e.name) is not null as exists,
         coalesce(c.relrowsecurity, false) as rls_enabled
  from expected_relations e
  left join pg_class c on c.oid = to_regclass('public.' || e.name)
), function_state as (
  select e.name,
         p.oid is not null as exists,
         coalesce(p.prosecdef, false) as security_definer,
         case when p.oid is null then null else has_function_privilege('anon', p.oid, 'EXECUTE') end as anon_execute,
         case when p.oid is null then null else has_function_privilege('authenticated', p.oid, 'EXECUTE') end as authenticated_execute,
         case when p.oid is null then null else has_function_privilege('service_role', p.oid, 'EXECUTE') end as service_role_execute
  from expected_functions e
  left join pg_proc p on p.proname = e.name
  left join pg_namespace n on n.oid = p.pronamespace and n.nspname = 'public'
  where p.oid is null or n.nspname = 'public'
), table_grants as (
  select count(*)::integer as forbidden_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'research_assisted_order_%'
    and grantee in ('anon', 'authenticated')
), bucket_state as (
  select exists (
    select 1
    from storage.buckets
    where id = 'research-assisted-order-documents'
      and public is false
      and file_size_limit = 15728640
  ) as private_bucket_ready
), counts as (
  select
    (select count(*) from public.research_assisted_order_requests) as requests,
    (select count(*) from public.research_assisted_order_lines) as lines,
    (select count(*) from public.research_assisted_order_events) as events,
    (select count(*) from public.research_assisted_order_documents) as documents
)
select jsonb_build_object(
  'verdict', case
    when not exists (select 1 from relation_state where not exists or not rls_enabled)
     and not exists (
       select 1 from function_state
       where not exists
          or not security_definer
          or coalesce(anon_execute, false)
          or coalesce(authenticated_execute, false)
          or not coalesce(service_role_execute, false)
     )
     and table_grants.forbidden_grants = 0
     and bucket_state.private_bucket_ready
    then 'PASS'
    else 'FAIL'
  end,
  'relations', (
    select jsonb_agg(jsonb_build_object(
      'name', name,
      'exists', exists,
      'rlsEnabled', rls_enabled
    ) order by name)
    from relation_state
  ),
  'functions', (
    select jsonb_agg(jsonb_build_object(
      'name', name,
      'exists', exists,
      'securityDefiner', security_definer,
      'anonExecute', anon_execute,
      'authenticatedExecute', authenticated_execute,
      'serviceRoleExecute', service_role_execute
    ) order by name)
    from function_state
  ),
  'forbiddenDirectTableGrants', table_grants.forbidden_grants,
  'privateBucketReady', bucket_state.private_bucket_ready,
  'rowCounts', jsonb_build_object(
    'requests', counts.requests,
    'lines', counts.lines,
    'events', counts.events,
    'documents', counts.documents
  )
) as assisted_order_bridge_postcheck
from table_grants
cross join bucket_state
cross join counts;
