-- The strength-registry mirror repair (founder-authorized, migration 57).
--
-- The founder added eight catalog identities (five sizes on existing
-- products, three new products), so the locked catalog now holds 78
-- variants. Migration 47 (20260801120000, RAN in production 2026-08-02,
-- IMMUTABLE) seeded its founder-locked variant registry with the 70 that
-- existed then. This migration inserts EXACTLY the eight accepted variants,
-- so the registry mirrors the complete active catalog again.
--
-- The eight enter in the same permitted state as every existing undisputed
-- variant: supplier_master_strength is NULL, which is precisely "no recorded
-- dispute". The write gate refuses only recorded disputes, and it answered
-- "permitted" for these units while they were unregistered, so registering
-- them changes no gate decision, no price, and no customer state. Nothing
-- here invents a dispute, a clearance, or evidence.
--
-- Conventions inherited from migration 47: the registry lock is taken
-- before writing, and the upsert converges on re-apply (idempotent,
-- duplicate-safe, deterministic). Conventions inherited from this chain:
-- the end state is ASSERTED, so a database where the eight did not land
-- exactly as stated fails the apply loudly. Absent-target-safe: on a
-- database without the registry (a disposable verification database that
-- never applied migration 47), this is a recorded no-op, never an error.

begin;

do $strength_mirror$
declare
  v_landed integer;
begin
  if pg_catalog.to_regclass('public.research_catalog_founder_locked_variant') is null then
    raise notice
      'research_early_access_strength_registry_mirror: registry table absent (migration 20260801120000 not applied here); no-op.';
    return;
  end if;

  lock table public.research_catalog_founder_locked_variant in access exclusive mode;

  insert into public.research_catalog_founder_locked_variant (
    sku_key, sku, product_code, legacy_product_code,
    founder_locked_strength, supplier_master_strength
  ) values
    ('R360-BPC157-5MG-VIAL', 'R360-BPC157-5MG-VIAL', 'PEX-001', null, '5 mg', null),
    ('R360-GHKCU-50MG-VIAL', 'R360-GHKCU-50MG-VIAL', 'PEX-003', null, '50 mg', null),
    ('R360-DSIP-10MG-VIAL', 'R360-DSIP-10MG-VIAL', 'PEX-007', null, '10 mg', null),
    ('R360-GLUTATHIONE-500MG-VIAL', 'R360-GLUTATHIONE-500MG-VIAL', 'PEX-015', null, '500 mg', null),
    ('R360-SERMORELIN-5MG-VIAL', 'R360-SERMORELIN-5MG-VIAL', 'PEX-023', null, '5 mg', null),
    ('R360-CAGRILINTIDE-10MG-VIAL', 'R360-CAGRILINTIDE-10MG-VIAL', 'PEX-028', null, '10 mg', null),
    ('R360-HEXARELIN-10MG-VIAL', 'R360-HEXARELIN-10MG-VIAL', 'PEX-029', null, '10 mg', null),
    ('R360-OXYTOCIN-5MG-VIAL', 'R360-OXYTOCIN-5MG-VIAL', 'PEX-030', null, '5 mg', null)
  on conflict (sku_key) do update set
    sku = excluded.sku,
    product_code = excluded.product_code,
    legacy_product_code = excluded.legacy_product_code,
    founder_locked_strength = excluded.founder_locked_strength,
    supplier_master_strength = excluded.supplier_master_strength,
    recorded_at = now();

  -- The end state, asserted: all eight present, field-exact, and
  -- NON-DISPUTED. A partial landing or an invented dispute fails the apply.
  select count(*) into v_landed
  from public.research_catalog_founder_locked_variant registry
  join (values
    ('R360-BPC157-5MG-VIAL', 'PEX-001', '5 mg'),
    ('R360-GHKCU-50MG-VIAL', 'PEX-003', '50 mg'),
    ('R360-DSIP-10MG-VIAL', 'PEX-007', '10 mg'),
    ('R360-GLUTATHIONE-500MG-VIAL', 'PEX-015', '500 mg'),
    ('R360-SERMORELIN-5MG-VIAL', 'PEX-023', '5 mg'),
    ('R360-CAGRILINTIDE-10MG-VIAL', 'PEX-028', '10 mg'),
    ('R360-HEXARELIN-10MG-VIAL', 'PEX-029', '10 mg'),
    ('R360-OXYTOCIN-5MG-VIAL', 'PEX-030', '5 mg')
  ) as accepted (sku_key, product_code, founder_locked_strength)
    on registry.sku_key = accepted.sku_key
   and registry.sku = accepted.sku_key
   and registry.product_code = accepted.product_code
   and registry.legacy_product_code is null
   and registry.founder_locked_strength = accepted.founder_locked_strength
   and registry.supplier_master_strength is null;

  if v_landed <> 8 then
    raise exception
      'research_early_access_strength_registry_mirror: expected exactly 8 accepted variants field-exact and non-disputed, found %.',
      v_landed;
  end if;
end
$strength_mirror$;

commit;
