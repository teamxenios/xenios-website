with function_state as (
  select p.oid,
         p.prosecdef as security_definer,
         p.provolatile = 's' as marked_stable,
         has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_execute,
         has_function_privilege('anon', p.oid, 'EXECUTE') as anon_execute,
         has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_execute,
         -- acldefault expanded so a null proacl cannot be mistaken for locked.
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))::text[] as acl
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_settled_awaiting_fulfillment'
), public_execute as (
  select exists (
    select 1
    from function_state f, unnest(f.acl) as entry
    where entry like '=X%'
  ) as public_can_execute
), probe as (
  -- The function must ANSWER on the deployed schema: a jsonb array, possibly
  -- empty. A throw here fails the postcheck loudly.
  select jsonb_typeof(public.research_early_access_settled_awaiting_fulfillment()) = 'array'
    as answers_with_array
)
select jsonb_build_object(
  'verdict', case
    when (select count(*) from function_state) = 1
     and (select security_definer from function_state)
     and (select marked_stable from function_state)
     and (select service_role_execute from function_state)
     and not (select anon_execute from function_state)
     and not (select authenticated_execute from function_state)
     and not (select public_can_execute from public_execute)
     and (select answers_with_array from probe)
    then 'DEPLOYED_AND_LOCKED'
    else 'STOP_REVIEW_FUNCTION_STATE'
  end,
  'functionCount', (select count(*) from function_state),
  'securityDefiner', (select security_definer from function_state),
  'markedStable', (select marked_stable from function_state),
  'serviceRoleExecute', (select service_role_execute from function_state),
  'anonExecute', (select anon_execute from function_state),
  'authenticatedExecute', (select authenticated_execute from function_state),
  'publicCanExecute', (select public_can_execute from public_execute),
  'answersWithArray', (select answers_with_array from probe)
) as settled_awaiting_fulfillment_postcheck;
