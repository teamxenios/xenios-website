with expected_relations(name) as (
  values
    ('research_assisted_order_requests'),
    ('research_assisted_order_lines'),
    ('research_assisted_order_events'),
    ('research_assisted_order_access_tokens'),
    ('research_assisted_order_documents')
), relation_state as (
  select e.name,
         to_regclass('public.' || e.name) is not null as already_exists
  from expected_relations e
), function_state as (
  select p.proname,
         n.nspname,
         p.prosecdef,
         p.provolatile
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname like 'research_assisted_order%'
), collisions as (
  select count(*)::integer as relation_collision_count
  from relation_state
  where already_exists
), function_collisions as (
  select count(*)::integer as function_collision_count
  from function_state
), bucket_state as (
  select exists (
    select 1
    from storage.buckets
    where id = 'research-assisted-order-documents'
      and public is true
  ) as public_bucket_collision
)
select jsonb_build_object(
  'verdict', case
    when collisions.relation_collision_count = 0
     and function_collisions.function_collision_count = 0
     and bucket_state.public_bucket_collision is false
    then 'APPLY_READY'
    else 'STOP_REVIEW_EXISTING_OBJECTS'
  end,
  'relations', (
    select jsonb_agg(jsonb_build_object('name', name, 'alreadyExists', already_exists) order by name)
    from relation_state
  ),
  'existingFunctions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', proname,
      'securityDefiner', prosecdef,
      'volatility', provolatile
    ) order by proname), '[]'::jsonb)
    from function_state
  ),
  'publicBucketCollision', bucket_state.public_bucket_collision,
  'relationCollisionCount', collisions.relation_collision_count,
  'functionCollisionCount', function_collisions.function_collision_count
) as assisted_order_bridge_precheck
from collisions
cross join function_collisions
cross join bucket_state;
