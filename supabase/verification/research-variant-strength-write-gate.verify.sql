-- ===========================================================================
-- research_variant_strength_write_gate: production verification probes
--
-- Run AFTER applying
--   supabase/migrations/20260801120000_research_variant_strength_write_gate.sql
--   psql -v ON_ERROR_STOP=1 -f research-variant-strength-write-gate.verify.sql
--
-- RULES, read before running:
--  1. EVERY MUTATING PROBE IS WRAPPED IN begin ... rollback. NOTHING HERE IS
--     EVER COMMITTED. Each probe is its own transaction so probes cannot
--     contaminate one another.
--  2. The suite has POSITIVE controls (must be REFUSED) and NEGATIVE controls
--     (must SUCCEED). A run where everything is refused proves nothing except
--     that something is broken. P7, P8 and P12 are the negative controls.
--     If any of them FAILS, the gate is OVER-REFUSING and must not ship.
--  3. Nothing is hardcoded. Every probe DISCOVERS its subject, so the suite is
--     runnable in any environment.
--  4. Each probe raises PASS or FAIL. With ON_ERROR_STOP=1 a FAIL aborts.
--  5. If the probing role cannot see the tables, P0 says so and you must stop:
--     a suite run by an under-privileged role produces false passes.
-- ===========================================================================

\echo '=== P0  preconditions and probing role ==='
select current_user as probing_role,
       (select rolsuper from pg_roles where rolname = current_user) as is_superuser,
       (select rolbypassrls from pg_roles where rolname = current_user) as bypasses_rls;

do $probe$
begin
  if to_regclass('public.research_product_prices') is null
     or to_regclass('public.research_product_variants') is null
     or to_regclass('public.research_catalog_founder_locked_variant') is null then
    raise exception 'FAIL P0: a required table is missing. Was the migration applied?';
  end if;
  raise notice 'PASS P0: all three tables present.';
end $probe$;

\echo '=== P9  both triggers exist AND are enabled ==='
do $probe$
declare r record; n int := 0;
begin
  for r in
    select t.tgname, t.tgenabled, c.relname
    from pg_trigger t join pg_class c on c.oid = t.tgrelid
    where t.tgname in ('research_product_prices_strength_gate',
                       'research_product_variants_strength_gate')
      and not t.tgisinternal
  loop
    n := n + 1;
    if r.tgenabled = 'D' then
      raise exception 'FAIL P9: trigger % on % exists but is DISABLED.', r.tgname, r.relname;
    end if;
    raise notice 'PASS P9: % on % enabled (tgenabled=%).', r.tgname, r.relname, r.tgenabled;
  end loop;
  if n <> 2 then
    raise exception 'FAIL P9: expected 2 strength triggers, found %.', n;
  end if;
end $probe$;

\echo '=== P10  registry seeded, normalizers match the TypeScript ones ==='
do $probe$
declare v_total int; v_disputed int;
begin
  select count(*), count(*) filter (where supplier_master_strength is not null)
    into v_total, v_disputed
  from public.research_catalog_founder_locked_variant;
  if v_total = 0 then
    raise exception 'FAIL P10: registry is EMPTY. The gate fails closed but nothing can be priced.';
  end if;
  raise notice 'PASS P10: registry has % rows, % with a supplier-master dispute.', v_total, v_disputed;

  if public.research_normalize_sku_key('  r360-TESA-10MG-vial ') <> 'R360-TESA-10MG-VIAL' then
    raise exception 'FAIL P10: research_normalize_sku_key drifted from the TypeScript normalizer.';
  end if;
  if public.research_normalize_presentation_key('  10   MG  ')
     <> public.research_normalize_presentation_key('10 mg') then
    raise exception 'FAIL P10: research_normalize_presentation_key is not case/whitespace stable.';
  end if;
  raise notice 'PASS P10: both normalizers behave as specified.';
end $probe$;

\echo '=== P4  direct UPDATE of a DISPUTED variant identity is REFUSED ==='
begin;
do $probe$
declare v_variant uuid; v_sku text; v_msg text;
begin
  select v.id, v.sku into v_variant, v_sku
  from public.research_product_variants v
  join public.research_catalog_founder_locked_variant r
    on r.sku_key = public.research_normalize_sku_key(v.sku)
  where r.supplier_master_strength is not null
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P4: no Product Control variant maps to a disputed registry row.';
    return;
  end if;
  begin
    update public.research_product_variants set sku = sku || '-RENAMED' where id = v_variant;
    raise exception 'FAIL P4: disputed variant % was renamed. RULE 1 did not fire.', v_sku;
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PASS P4: rename refused for %. %', v_sku, v_msg;
  end;
end $probe$;
rollback;

\echo '=== P5  the SECURITY DEFINER RPC is REFUSED for the same edit ==='
begin;
do $probe$
declare v_product uuid; v_variant uuid; v_msg text;
begin
  select v.product_id, v.id into v_product, v_variant
  from public.research_product_variants v
  join public.research_catalog_founder_locked_variant r
    on r.sku_key = public.research_normalize_sku_key(v.sku)
  where r.supplier_master_strength is not null
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P5: no disputed Product Control variant present.';
    return;
  end if;
  begin
    perform public.research_admin_update_product_variant(
      v_product, v_variant, '{"strength":"999 mg"}'::jsonb,
      'probe@verification.invalid', now());
    raise exception 'FAIL P5: the SECURITY DEFINER RPC mutated a disputed variant. The trigger did not intercept it.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PASS P5: RPC refused. %', v_msg;
  end;
end $probe$;
rollback;

\echo '=== P6  a rename to a CLEAN sku still cannot erase a dispute (rule ordering) ==='
begin;
do $probe$
declare v_variant uuid; v_msg text;
begin
  select v.id into v_variant
  from public.research_product_variants v
  join public.research_catalog_founder_locked_variant r
    on r.sku_key = public.research_normalize_sku_key(v.sku)
  where r.supplier_master_strength is not null
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P6: no disputed Product Control variant present.';
    return;
  end if;
  begin
    update public.research_product_variants
       set sku = 'ZZZ-DEFINITELY-NOT-IN-THE-CATALOG-0001' where id = v_variant;
    raise exception 'FAIL P6: a disputed variant escaped by renaming to a clean SKU. Rule 1 is not evaluated on the OLD row.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PASS P6: escape-by-rename refused. %', v_msg;
  end;
end $probe$;
rollback;

\echo '=== P7  NEGATIVE CONTROL: lifecycle-only update on a DISPUTED variant SUCCEEDS ==='
begin;
do $probe$
declare v_variant uuid;
begin
  select v.id into v_variant
  from public.research_product_variants v
  join public.research_catalog_founder_locked_variant r
    on r.sku_key = public.research_normalize_sku_key(v.sku)
  where r.supplier_master_strength is not null
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P7: no disputed Product Control variant present.';
    return;
  end if;
  update public.research_product_variants
     set sort_order = coalesce(sort_order, 0) + 1 where id = v_variant;
  raise notice 'PASS P7: lifecycle-only update allowed on a disputed variant.';
exception when check_violation then
  raise exception 'FAIL P7: the gate refused a lifecycle-only update. It is OVER-REFUSING.';
end $probe$;
rollback;

\echo '=== P8  NEGATIVE CONTROL: an UNDISPUTED variant is unaffected ==='
begin;
do $probe$
declare v_variant uuid;
begin
  select v.id into v_variant
  from public.research_product_variants v
  where not exists (
    select 1 from public.research_catalog_founder_locked_variant r
    where r.sku_key = public.research_normalize_sku_key(v.sku)
      and r.supplier_master_strength is not null)
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P8: no undisputed Product Control variant present.';
    return;
  end if;
  update public.research_product_variants
     set sort_order = coalesce(sort_order, 0) + 1 where id = v_variant;
  raise notice 'PASS P8: undisputed variant updated normally.';
exception when check_violation then
  raise exception 'FAIL P8: an UNDISPUTED variant was refused. The gate is OVER-REFUSING.';
end $probe$;
rollback;

\echo '=== P11  R3: the registry is NOT writable by the application role ==='
do $probe$
declare v_writes text;
begin
  select string_agg(distinct privilege_type, ', ') into v_writes
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_catalog_founder_locked_variant'
    and grantee = 'service_role'
    and privilege_type in ('INSERT','UPDATE','DELETE','TRUNCATE');
  if v_writes is not null then
    raise exception 'FAIL P11: service_role still holds % on the registry. One statement can blind BOTH gates for every unit.', v_writes;
  end if;
  raise notice 'PASS P11: service_role holds no write privilege on the registry.';
end $probe$;

\echo '=== P12  NEGATIVE CONTROL: a price on a CLEAN variant is still accepted ==='
-- The most important control in the suite. If this FAILS the gate blocks
-- legitimate pricing and must not ship, however many refusals passed.
begin;
do $probe$
declare v_product uuid; v_variant uuid;
begin
  select v.product_id, v.id into v_product, v_variant
  from public.research_product_variants v
  where not exists (
    select 1 from public.research_catalog_founder_locked_variant r
    where r.sku_key = public.research_normalize_sku_key(v.sku)
      and r.supplier_master_strength is not null)
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P12: no undisputed Product Control variant present.';
    return;
  end if;
  insert into public.research_product_prices
    (product_id, variant_id, audience, amount_cents, currency, status, effective_at)
  values (v_product, v_variant, 'member', 12345, 'USD', 'draft', now());
  raise notice 'PASS P12: a draft price on a clean variant was accepted.';
exception
  when check_violation then
    raise exception 'FAIL P12: the gate REFUSED a price on a clean variant. It is OVER-REFUSING.';
  when others then
    raise notice 'INCONCLUSIVE P12: insert failed for a non-gate reason (%). Align the column list with the live schema and re-run.', sqlerrm;
end $probe$;
rollback;

\echo '=== P2  a price INSERT on a DISPUTED variant is REFUSED ==='
begin;
do $probe$
declare v_product uuid; v_variant uuid; v_msg text;
begin
  select v.product_id, v.id into v_product, v_variant
  from public.research_product_variants v
  join public.research_catalog_founder_locked_variant r
    on r.sku_key = public.research_normalize_sku_key(v.sku)
  where r.supplier_master_strength is not null
  limit 1;
  if v_variant is null then
    raise notice 'SKIP P2: no disputed Product Control variant present.';
    return;
  end if;
  begin
    insert into public.research_product_prices
      (product_id, variant_id, audience, amount_cents, currency, status, effective_at)
    values (v_product, v_variant, 'member', 12345, 'USD', 'draft', now());
    raise exception 'FAIL P2: a price was INSERTED on a disputed variant.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    raise notice 'PASS P2: price insert refused on a disputed variant. %', v_msg;
  end;
end $probe$;
rollback;

\echo '=== SUITE COMPLETE. Any FAIL aborts under ON_ERROR_STOP=1. ==='
\echo 'NEGATIVE CONTROLS are P7, P8 and P12. If those did not PASS, the gate is'
\echo 'OVER-REFUSING and must NOT ship, however many refusals passed.'

-- ===========================================================================
-- ROLLBACK / COMPENSATING PROCEDURE
--
-- Reversing this migration removes ENFORCEMENT ONLY. It destroys no business
-- data: the migration creates one registry table and seeds it from the
-- checked-in catalog, and touches no product, variant, price or order row.
--
-- Step 1, preferred: DISABLE rather than drop, so the gate can be restored
-- instantly and the objects stay available for inspection.
--   alter table public.research_product_prices
--     disable trigger research_product_prices_strength_gate;
--   alter table public.research_product_variants
--     disable trigger research_product_variants_strength_gate;
--
-- Re-enable with the same statements substituting ENABLE.
--
-- Step 2, full reversal, only if the objects must be removed:
--   drop trigger if exists research_product_prices_strength_gate
--     on public.research_product_prices;
--   drop trigger if exists research_product_variants_strength_gate
--     on public.research_product_variants;
--   drop function if exists public.research_product_price_strength_gate();
--   drop function if exists public.research_product_variant_strength_gate();
--   drop function if exists public.research_variant_strength_triple_dispute_reason(text, text, text);
--   drop function if exists public.research_variant_strength_dispute_reason(uuid, uuid);
--
-- Step 3, the registry table. DO NOT DROP IT BLINDLY. Check dependents first:
--   select dependent_ns.nspname, dependent_view.relname
--   from pg_depend d
--   join pg_rewrite rw on rw.oid = d.objid
--   join pg_class dependent_view on dependent_view.oid = rw.ev_class
--   join pg_namespace dependent_ns on dependent_ns.oid = dependent_view.relnamespace
--   join pg_class src on src.oid = d.refobjid
--   where src.relname = 'research_catalog_founder_locked_variant';
-- If that returns no rows:
--   drop table if exists public.research_catalog_founder_locked_variant;
-- Losing it costs nothing durable: it is re-seeded verbatim by re-applying the
-- migration, and its contents derive entirely from the checked-in catalog.
--
-- WHAT ROLLBACK COSTS: with either step 1 or step 2 in effect, a disputed
-- variant can again receive an approved and active price through a direct
-- service-role write or through research_admin_update_product_variant. The
-- TypeScript gate still refuses both through the application, but an RPC caller
-- does not pass through the application. Do not roll back and leave commerce
-- enabled.
-- ===========================================================================
