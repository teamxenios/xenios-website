-- Postcheck for 20260819_research_ea_cart_service_role_revoke.sql.
-- Read-only. APPLIED_OK when service_role holds no direct privilege on any of
-- the six M58 cart tables (SECURITY DEFINER RPC access is unaffected).
select jsonb_build_object(
  'verdict', case
    when count(*) filter (
      where has_table_privilege('service_role', 'public.' || t.name, 'SELECT')
         or has_table_privilege('service_role', 'public.' || t.name, 'INSERT')
         or has_table_privilege('service_role', 'public.' || t.name, 'UPDATE')
         or has_table_privilege('service_role', 'public.' || t.name, 'DELETE')
    ) = 0
    then 'APPLIED_OK'
    else 'REVIEW_REQUIRED'
  end,
  'tables', jsonb_agg(jsonb_build_object(
    'name', t.name,
    'serviceRoleSelect', has_table_privilege('service_role', 'public.' || t.name, 'SELECT')
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
