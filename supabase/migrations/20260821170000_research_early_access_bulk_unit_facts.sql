-- Bulk projection reads for the Early Access catalog: the set-valued twins of
-- the two per-unit fact reads the declared-facts projection performs for every
-- variant on every catalog load.
--
-- WHY. The catalog projection asks two questions per unit through
-- security-definer RPCs: "which active holds name this unit"
-- (research_early_access_active_hold_kinds_for_unit) and "what is the newest
-- live supplier confirmation for this unit"
-- (research_early_access_supplier_confirmation_for_unit). Both tables have RLS
-- forced and every table grant revoked — including service_role — so the ONLY
-- read path is an RPC, and per-unit RPCs cost one round trip per variant per
-- page load. At the shipped catalog's scale that is hundreds of round trips
-- per customer request, which is part of the measured 30-60 second
-- /research/early-access load (2026-08-21).
--
-- WHAT. Two functions returning the SAME facts for ALL units in one call.
-- Each is the set-valued form of its per-unit twin, with the WHERE clause
-- copied verbatim, so the two can never disagree about what "active" or
-- "live" means:
--
--   research_early_access_active_unit_holds()
--     = active_hold_kinds_for_unit, for every unit with at least one active
--       hold. status = 'active' is the entire liveness rule for holds; there
--       is no expiry window.
--
--   research_early_access_live_supplier_confirmations(p_now)
--     = supplier_confirmation_for_unit, for every unit with a live
--       confirmation: status = 'active', unexpired at the caller's instant,
--       newest confirmed_at wins per unit.
--
-- WHAT THIS DOES NOT CHANGE. No table, no trigger, no write path, no RLS, no
-- table grant. The per-unit functions remain, unchanged, and remain the
-- correct read for a single-unit question. Server adapters fall back to the
-- per-unit functions when these are absent, so deploy order does not matter
-- (the migration-54 tolerance precedent).

create or replace function public.research_early_access_active_unit_holds()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $active_unit_holds$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'productId', held.product_id,
        'variantId', held.variant_id,
        'kind', held.kind
      )
      order by held.product_id, held.variant_id, held.kind
    ),
    '[]'::jsonb
  )
  from (
    select distinct product_id, variant_id, kind
    from public.research_early_access_unit_holds
    where status = 'active'
  ) held;
$active_unit_holds$;

create or replace function public.research_early_access_live_supplier_confirmations(
  p_now timestamptz
)
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $live_supplier_confirmations$
  select coalesce(
    jsonb_agg(live.record order by live.product_id, live.variant_id),
    '[]'::jsonb
  )
  from (
    select distinct on (product_id, variant_id) product_id, variant_id, record
    from public.research_early_access_supplier_confirmations
    where status = 'active'
      and (expires_at is null or expires_at > p_now)
    order by product_id, variant_id, confirmed_at desc
  ) live;
$live_supplier_confirmations$;

do $function_grants$
declare
  v_role text;
  v_signature text;
begin
  foreach v_signature in array array[
    'public.research_early_access_active_unit_holds()',
    'public.research_early_access_live_supplier_confirmations(timestamptz)'
  ] loop
    execute pg_catalog.format('revoke all on function %s from public', v_signature);
    foreach v_role in array array['anon', 'authenticated'] loop
      if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
        execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
      end if;
    end loop;
    if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
      execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
    end if;
  end loop;
end
$function_grants$;
