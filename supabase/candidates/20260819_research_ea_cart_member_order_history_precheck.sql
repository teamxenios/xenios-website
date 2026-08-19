-- Precheck for 20260819_research_ea_cart_member_order_history.sql.
-- Read-only. Verdict APPLY_READY means the tables the routine reads exist with
-- the columns it names, and the routine itself does not already exist.

with prerequisites as (
  select
    to_regclass('public.research_early_access_cart_checkouts') is not null
      as cart_checkouts_present,
    to_regclass('public.research_early_access_legal_bindings') is not null
      as legal_bindings_present,
    (
      select count(*) = 6
      from pg_attribute att
      join pg_class rel on rel.oid = att.attrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'research_early_access_cart_checkouts'
        and att.attname in ('checkout_number', 'customer_ref', 'payment_state',
                            'placed_at', 'record', 'disposition')
        and att.attnum > 0
        and not att.attisdropped
    ) as cart_checkout_columns_present,
    (
      select count(*) = 4
      from pg_attribute att
      join pg_class rel on rel.oid = att.attrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = 'research_early_access_legal_bindings'
        and att.attname in ('customer_ref', 'alias_refs', 'established_by', 'verified_at')
        and att.attnum > 0
        and not att.attisdropped
    ) as legal_binding_columns_present
), collisions as (
  select
    to_regprocedure(
      'public.research_early_access_cart_checkouts_for_customers(text[])'
    ) is not null as routine_already_exists
)
select jsonb_build_object(
  'verdict', case
    when prerequisites.cart_checkouts_present
     and prerequisites.legal_bindings_present
     and prerequisites.cart_checkout_columns_present
     and prerequisites.legal_binding_columns_present
     and not collisions.routine_already_exists
    then 'APPLY_READY'
    when collisions.routine_already_exists
    then 'STOP_REVIEW_EXISTING_OBJECTS'
    else 'STOP_MISSING_PREREQUISITES'
  end,
  'cartCheckoutsPresent', prerequisites.cart_checkouts_present,
  'legalBindingsPresent', prerequisites.legal_bindings_present,
  'cartCheckoutColumnsPresent', prerequisites.cart_checkout_columns_present,
  'legalBindingColumnsPresent', prerequisites.legal_binding_columns_present,
  'routineAlreadyExists', collisions.routine_already_exists
) as lane_c_history_precheck
from prerequisites
cross join collisions;
