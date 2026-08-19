-- Precheck for 20260819_research_ea_cart_settlement_canonical_txn.sql.
-- Read-only. Verdict APPLY_READY requires the settlements table to exist, the
-- column and index to not already exist, and — decisively — ZERO duplicate
-- canonical forms among settlements already on file, because the unique index
-- would otherwise fail mid-apply.

with prerequisites as (
  select
    to_regclass('public.research_early_access_cart_settlements') is not null
      as settlements_present
), collisions as (
  select
    exists (
      select 1
      from pg_attribute att
      join pg_class rel on rel.oid = att.attrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'research_early_access_cart_settlements'
        and att.attname = 'canonical_transaction_id'
        and att.attnum > 0
        and not att.attisdropped
    ) as column_already_exists,
    to_regclass('public.research_ea_cart_settlements_canonical_txn_uidx') is not null
      as index_already_exists
), duplicates as (
  select coalesce(
    (
      select count(*)
      from (
        select upper(regexp_replace(s.external_transaction_id, '[^0-9A-Za-z]+', '', 'g')) as canon
        from public.research_early_access_cart_settlements s
        group by 1
        having count(*) > 1
      ) d
    ), 0
  ) as duplicate_canonical_forms
)
select jsonb_build_object(
  'verdict', case
    when prerequisites.settlements_present
     and not collisions.column_already_exists
     and not collisions.index_already_exists
     and duplicates.duplicate_canonical_forms = 0
    then 'APPLY_READY'
    when collisions.column_already_exists or collisions.index_already_exists
    then 'STOP_REVIEW_EXISTING_OBJECTS'
    when duplicates.duplicate_canonical_forms > 0
    then 'STOP_RECONCILE_DUPLICATES'
    else 'STOP_MISSING_PREREQUISITES'
  end,
  'settlementsPresent', prerequisites.settlements_present,
  'columnAlreadyExists', collisions.column_already_exists,
  'indexAlreadyExists', collisions.index_already_exists,
  'duplicateCanonicalForms', duplicates.duplicate_canonical_forms
) as lane_c_canonical_precheck
from prerequisites
cross join collisions
cross join duplicates;
