-- PRODUCT CONTROL SCHEMA INSPECTION. READ ONLY.
-- No INSERT, UPDATE, DELETE, CREATE, ALTER, DROP, TRUNCATE, GRANT or REVOKE.
--
-- Returns every column of the three Product Control tables the Early Access
-- catalogue reads, plus whether any of the three names is actually a view.

select
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_nullable,
  coalesce(c.column_default, '')                as column_default,
  c.ordinal_position,
  case t.table_type when 'VIEW' then 'VIEW' else 'TABLE' end as object_kind
from information_schema.columns c
join information_schema.tables t
  on t.table_schema = c.table_schema
 and t.table_name  = c.table_name
where c.table_schema = 'public'
  and c.table_name in (
    'research_products',
    'research_product_variants',
    'research_product_prices'
  )
order by c.table_name, c.ordinal_position;
