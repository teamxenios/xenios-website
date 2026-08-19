with expected_tables(name) as (
  values
    ('research_early_access_settlements'),
    ('research_early_access_placements'),
    ('research_early_access_order_lines'),
    ('research_early_access_money_snapshots'),
    ('research_early_access_fulfillments'),
    ('research_early_access_tracking'),
    ('research_early_access_dispatch_events')
), table_state as (
  select e.name,
         to_regclass('public.' || e.name) is not null as table_exists
  from expected_tables e
), missing_tables as (
  select count(*)::integer as missing_table_count
  from table_state
  where not table_exists
), function_state as (
  select p.proname,
         p.prosecdef,
         p.provolatile
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'research_early_access_settled_awaiting_fulfillment'
), function_collisions as (
  select count(*)::integer as function_collision_count
  from function_state
)
select jsonb_build_object(
  'verdict', case
    when missing_tables.missing_table_count = 0
     and function_collisions.function_collision_count = 0
    then 'APPLY_READY'
    when missing_tables.missing_table_count > 0
    then 'STOP_MISSING_PREREQUISITES'
    else 'STOP_REVIEW_EXISTING_OBJECTS'
  end,
  'tables', (
    select jsonb_agg(jsonb_build_object('name', name, 'exists', table_exists) order by name)
    from table_state
  ),
  'existingFunctions', (
    select coalesce(jsonb_agg(jsonb_build_object(
      'name', proname,
      'securityDefiner', prosecdef,
      'volatility', provolatile
    ) order by proname), '[]'::jsonb)
    from function_state
  ),
  'missingTableCount', missing_tables.missing_table_count,
  'functionCollisionCount', function_collisions.function_collision_count
) as settled_awaiting_fulfillment_precheck
from missing_tables
cross join function_collisions;
