-- Precheck for 20260819_research_ea_cart_commission_settlement.sql.
-- Read-only. Verdict APPLY_READY means every prerequisite exists and nothing
-- the migration creates already exists under another shape.

with prerequisites as (
  select
    to_regclass('public.research_early_access_cart_checkouts') is not null
      as cart_checkouts_present,
    to_regclass('public.research_early_access_cart_settlements') is not null
      as cart_settlements_present,
    to_regprocedure(
      'public.research_early_access_commit_cart_settlement(text,text,text,bigint,text,text,boolean,boolean,timestamptz)'
    ) is not null as hardened_settlement_rpc_present
), collisions as (
  select
    to_regclass('public.research_early_access_cart_commission_events') is not null
      as ledger_already_exists,
    to_regprocedure(
      'public.research_early_access_commit_cart_settlement_with_commission(text,text,text,bigint,text,text,boolean,boolean,timestamptz,jsonb)'
    ) is not null as rpc_already_exists
)
select jsonb_build_object(
  'verdict', case
    when prerequisites.cart_checkouts_present
     and prerequisites.cart_settlements_present
     and prerequisites.hardened_settlement_rpc_present
     and not collisions.ledger_already_exists
     and not collisions.rpc_already_exists
    then 'APPLY_READY'
    when collisions.ledger_already_exists or collisions.rpc_already_exists
    then 'STOP_REVIEW_EXISTING_OBJECTS'
    else 'STOP_MISSING_PREREQUISITES'
  end,
  'cartCheckoutsPresent', prerequisites.cart_checkouts_present,
  'cartSettlementsPresent', prerequisites.cart_settlements_present,
  'hardenedSettlementRpcPresent', prerequisites.hardened_settlement_rpc_present,
  'commissionLedgerAlreadyExists', collisions.ledger_already_exists,
  'atomicRpcAlreadyExists', collisions.rpc_already_exists
) as lane_c_commission_precheck
from prerequisites
cross join collisions;
