-- Precheck for 20260819_research_ea_cart_service_role_revoke.sql.
-- Read-only. APPLY_READY when all six M58 cart tables exist; reports the
-- current service_role privilege state so the apply's effect is measurable.
select jsonb_build_object(
  'verdict', case
    when count(*) filter (where to_regclass('public.' || t.name) is null) > 0
    then 'STOP_MISSING_PREREQUISITES'
    else 'APPLY_READY'
  end,
  'tables', jsonb_agg(jsonb_build_object(
    'name', t.name,
    'exists', to_regclass('public.' || t.name) is not null,
    'serviceRoleSelect',
      case when to_regclass('public.' || t.name) is not null
        then has_table_privilege('service_role', 'public.' || t.name, 'SELECT')
        else null end
  ) order by t.name)
)
from (values
  ('research_early_access_cart_checkouts'),
  ('research_early_access_cart_quotes'),
  ('research_early_access_cart_items'),
  ('research_early_access_cart_invoices'),
  ('research_early_access_cart_settlements'),
  ('research_early_access_cart_events')
) as t(name);
