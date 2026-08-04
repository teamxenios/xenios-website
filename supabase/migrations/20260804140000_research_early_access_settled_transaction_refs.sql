-- Every external transaction reference that has EVER settled an Early
-- Access order, across ALL orders (Bug Hunter F4).
--
-- The confirm route feeds this list into the reconciliation so a payment
-- reference claiming a second order is named DUPLICATE_TRANSACTION at
-- classification time, where the operator sees it, rather than surfacing
-- only as the commit-time refusal. The commit-time guard (the ledger's
-- unique external_transaction_id constraint) remains the authority; this
-- read exists so the refusal is EARLY and CORRECTLY NAMED, never so it can
-- be skipped.
--
-- The ledger table is written exclusively inside commit_settlement, one row
-- per settled order, append-only by trigger. Reading it back is therefore
-- exactly "every reference that has ever settled an order": no partial
-- answer is possible, which is the interface's own requirement (absent is
-- safer than wrong; this function makes it present and whole).
--
-- Additive; safe to apply twice.

do $preflight$
begin
  if pg_catalog.to_regclass('public.research_early_access_ledger_entries') is null then
    raise exception
      'research_early_access_settled_transaction_refs requires migration 20260804121000 (commerce persistence) to be applied first.';
  end if;
end
$preflight$;

-- Ordered by settlement recording, oldest first, matching the in-memory
-- store's insertion order.
create or replace function public.research_early_access_settled_transaction_refs()
returns jsonb
language sql
security definer
set search_path = pg_catalog, public
as $settled_transaction_refs$
  select coalesce(jsonb_agg(external_transaction_id order by recorded_at, entry_id), '[]'::jsonb)
  from public.research_early_access_ledger_entries;
$settled_transaction_refs$;

do $function_grants$
declare
  v_role text;
  v_signature text := 'public.research_early_access_settled_transaction_refs()';
begin
  execute pg_catalog.format('revoke all on function %s from public', v_signature);
  foreach v_role in array array['anon', 'authenticated'] loop
    if exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      execute pg_catalog.format('revoke all on function %s from %I', v_signature, v_role);
    end if;
  end loop;
  if exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role') then
    execute pg_catalog.format('grant execute on function %s to service_role', v_signature);
  end if;
end
$function_grants$;
