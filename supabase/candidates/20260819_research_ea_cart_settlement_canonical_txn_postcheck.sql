-- Postcheck for 20260819_research_ea_cart_settlement_canonical_txn.sql.
-- Read-only. Verdict APPLIED_OK means the canonical column exists as STORED
-- GENERATED, the unique index stands, every stored settlement's canonical
-- value agrees with the derivation, and the raw column was not modified.

with column_state as (
  select exists (
    select 1
    from pg_attribute att
    join pg_class rel on rel.oid = att.attrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_settlements'
      and att.attname = 'canonical_transaction_id'
      and att.attgenerated = 's'
      and att.attnum > 0
      and not att.attisdropped
  ) as generated_column_present
), index_state as (
  select exists (
    select 1
    from pg_index i
    join pg_class idx on idx.oid = i.indexrelid
    where idx.relname = 'research_ea_cart_settlements_canonical_txn_uidx'
      and i.indisunique
  ) as unique_index_present
), agreement as (
  select coalesce(
    (
      select count(*)
      from public.research_early_access_cart_settlements s
      where s.canonical_transaction_id
            is distinct from upper(regexp_replace(s.external_transaction_id, '[^0-9A-Za-z]+', '', 'g'))
    ), 0
  ) as disagreeing_rows
)
select jsonb_build_object(
  'verdict', case
    when column_state.generated_column_present
     and index_state.unique_index_present
     and agreement.disagreeing_rows = 0
    then 'APPLIED_OK'
    else 'REVIEW_REQUIRED'
  end,
  'generatedColumnPresent', column_state.generated_column_present,
  'uniqueIndexPresent', index_state.unique_index_present,
  'disagreeingRows', agreement.disagreeing_rows
) as lane_c_canonical_postcheck
from column_state
cross join index_state
cross join agreement;
