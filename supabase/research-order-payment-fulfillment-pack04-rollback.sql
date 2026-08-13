-- Pack 04 guarded rollback draft.
-- DRAFT, NOT RUN. HUMAN REVIEW REQUIRED. Never run against production without
-- an explicit rollback decision. This rollback refuses to remove any Pack 04
-- schema object when even one Pack 04 row exists. It uses no CASCADE and does
-- not remove pgcrypto or any pre-existing Xenios object.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

do $pack04_rollback_preflight$
declare
  v_table text;
  v_rows bigint;
begin
  foreach v_table in array array[
    'research_order_business_organizations',
    'research_order_organization_buyers',
    'research_order_workflows',
    'research_order_invoices',
    'research_order_payment_evidence',
    'research_order_payment_verifications',
    'research_order_supplier_handoffs',
    'research_order_supplier_releases',
    'research_order_fulfillment_events',
    'research_order_tracking_events',
    'research_order_command_receipts',
    'research_order_timeline_events',
    'research_order_audit_events'
  ] loop
    if pg_catalog.to_regclass('public.' || v_table) is not null then
      execute pg_catalog.format('select count(*) from public.%I', v_table) into v_rows;
      if v_rows <> 0 then
        raise exception 'Pack 04 rollback refused: public.% contains % row(s)', v_table, v_rows
          using errcode = '55000';
      end if;
    end if;
  end loop;
end
$pack04_rollback_preflight$;

drop function if exists public.research_customer_order_history(integer, timestamptz, text);
drop function if exists public.research_customer_order_timeline(text);

drop table if exists public.research_order_audit_events;
drop table if exists public.research_order_timeline_events;
drop table if exists public.research_order_command_receipts;
drop table if exists public.research_order_tracking_events;
drop table if exists public.research_order_fulfillment_events;
drop table if exists public.research_order_supplier_releases;
drop table if exists public.research_order_supplier_handoffs;
drop table if exists public.research_order_payment_verifications;
drop table if exists public.research_order_payment_evidence;
drop table if exists public.research_order_invoices;
drop table if exists public.research_order_workflows;
drop table if exists public.research_order_organization_buyers;
drop table if exists public.research_order_business_organizations;

drop function if exists public.research_order_pack04_workflow_gate();
drop function if exists public.research_order_pack04_gate();
drop function if exists public.research_order_pack04_append_only();
drop function if exists public.research_order_pack04_valid_line_quantities(jsonb);

commit;
