-- Research Product Control: the variant strength write gate.
--
-- WHAT THIS CLOSES. supabase/migrations/20260726143000 created
-- research_admin_create_product_price and research_admin_approve_product_price.
-- Neither one looks at the variant's physical presentation, so a direct RPC call
-- can today write, and then approve into 'active', a price for a unit whose
-- strength the signed supplier master disputes. The application layer refuses
-- that write (server/research/products-diagnostics/variant-strength-write-gate.ts),
-- but an RPC caller does not pass through the application layer. This migration
-- puts the same rule in the database so neither path can produce the row.
--
-- THE OWNER DECISION IT ENFORCES (2026-08-01). The signed supplier master and
-- Samuel's latest directive are the authoritative strength source; a catalog row
-- that disagrees is strength_disputed and CANNOT RECEIVE AN ACTIVE PRODUCT
-- CONTROL PRICE. The Product Control price import gate admits a price only when
-- the exact strength and presentation are not disputed.
--
-- THE REGISTRY IS DERIVED, NOT AUTHORED. public.research_catalog_founder_locked_variant
-- is a row-for-row mirror of the founder-locked peptide catalog
-- (shared/research/catalog/peptide-catalog.ts): one row per catalog variant,
-- carrying that variant's SKU, its founder-locked strength, and the strength the
-- signed supplier master states where the catalog already records a difference.
-- No strength, SKU, lot, COA, or supplier fact is invented here, and none is
-- resolved here: choosing between two recorded presentations is a founder and
-- counsel decision. The mirror is pinned to the catalog by a repository test
-- (server/research/products-diagnostics/variant-strength-write-gate-sql.test.ts),
-- so the two lanes cannot drift silently.
--
-- RESOLVING A DISPUTE LATER is an UPDATE that sets supplier_master_strength to
-- null for that SKU (or a catalog edit plus a re-run of this file). It is never a
-- DELETE: the registry is the reason a price was refused.
--
-- FAIL CLOSED. The gate refuses whenever it cannot prove the unit undisputed: an
-- empty registry, a variant that does not belong to the product, or a variant
-- with no SKU all refuse the write. A resolved variant whose SKU is simply absent
-- from the founder-locked catalog is NOT refused, which is the same rule the read
-- guard applies: a unit outside that catalog is unconstrained, not unidentified.
--
-- KNOWN RESIDUAL, stated rather than papered over. The join key is the catalog
-- SKU, and the catalog derives that SKU from the strength. A variant recorded at
-- the supplier master's strength with a SKU derived the same way matches neither
-- index, so no dispute is found for it. Closing that needs a strength-independent
-- identity key for a physical unit, which is a data decision, not SQL.
--
-- Additive and idempotent (apply-twice safe). It creates one table, four
-- decision/normalization helpers, two trigger functions, and two triggers. It drops no table,
-- no column, and no row, and it
-- rewrites no price, variant, or product data. Apply after migrations
-- 20260726143000 and 20260726214500. It is NOT applied by the change that
-- introduces it.

begin;

-- Preconditions. A safety gate must never be a silent no-op, so an absent target
-- is an error rather than a notice: if this raises, apply 20260726143000 and
-- 20260726214500 first.
do $precondition$
begin
  if to_regclass('public.research_product_prices') is null
     or to_regclass('public.research_product_variants') is null then
    raise exception
      'research_variant_strength_write_gate: public.research_product_prices and '
      'public.research_product_variants must exist; apply migrations '
      '20260726143000_research_product_control_center.sql and '
      '20260726214500_research_product_control_center_privilege_hardening.sql first.';
  end if;
end
$precondition$;

-- ---------------------------------------------------------------------------
-- The founder-locked presentation registry
-- ---------------------------------------------------------------------------

create table if not exists public.research_catalog_founder_locked_variant (
  sku_key text primary key,
  sku text not null,
  product_code text not null,
  legacy_product_code text,
  founder_locked_strength text not null,
  -- Non-null means the signed supplier master states a different presentation
  -- for this exact unit, which is a recorded dispute.
  supplier_master_strength text,
  recorded_at timestamptz not null default now(),
  check (btrim(sku_key) <> ''),
  check (btrim(sku) <> ''),
  check (btrim(founder_locked_strength) <> ''),
  check (supplier_master_strength is null or btrim(supplier_master_strength) <> '')
);

alter table public.research_catalog_founder_locked_variant
  enable row level security;
alter table public.research_catalog_founder_locked_variant
  force row level security;
-- R3. service_role IS IN THIS REVOKE ON PURPOSE.
--
-- An audit raised, and reading this block confirmed, that revoking only from
-- public/anon/authenticated leaves service_role holding whatever write grants
-- Supabase gave the table at creation. 20260729100000_research_rls_retro_hardening
-- documents exactly that failure mode: Supabase grants defaults at creation, and
-- its own post-apply verification found pre-existing default TRUNCATE, REFERENCES
-- and TRIGGER grants that a later migration had to remove. That file also states
-- at :24 that it deliberately never touches the server role grants.
--
-- FORCE ROW LEVEL SECURITY above does not cover this: service_role bypasses row
-- security, which is the same reason the hardening migration exists.
--
-- This registry is the single source of truth the whole gate consults. If the
-- role that runs the application can write it, one statement blinds the gate for
-- every unit:
--     update public.research_catalog_founder_locked_variant
--        set supplier_master_strength = null;
-- after which every contested unit screens clean and both triggers pass it.
--
-- Nothing legitimate needs direct table access. The migration seeds the table
-- as its owner and the gate functions read it only as their SECURITY DEFINER
-- owner. No application or browser role receives a read or write grant.
revoke all on table public.research_catalog_founder_locked_variant
  from public, anon, authenticated, service_role;
lock table public.research_catalog_founder_locked_variant in access exclusive mode;

create index if not exists research_catalog_founder_locked_variant_disputed_idx
  on public.research_catalog_founder_locked_variant(sku_key)
  where supplier_master_strength is not null;

-- ---------------------------------------------------------------------------
-- Identity and presentation keys
--
-- These mirror normalizeSkuKey and normalizePresentationKey in
-- server/research/products-diagnostics/variant-strength-dispute.ts exactly.
-- Only case and whitespace are collapsed. Digits, units, separators, and word
-- order are left intact, so "10 mg" and "5 mg" can never compare equal.
-- Collapsing more than whitespace would risk calling two genuinely different
-- presentations the same, which is the one error a price guard must not make.
-- ---------------------------------------------------------------------------

create or replace function public.research_normalize_sku_key(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $normalize_sku$
  select upper(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'))
$normalize_sku$;

create or replace function public.research_normalize_presentation_key(p_value text)
returns text
language sql
immutable
set search_path = pg_catalog
as $normalize_presentation$
  select lower(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'))
$normalize_presentation$;

-- ---------------------------------------------------------------------------
-- The decision: is this exact variant priceable?
--
-- Returns null when the write is permitted. Any other return value is the
-- refusal reason, in plain words, naming both presentations so an operator can
-- see WHY. It never returns an amount, a cost, or a margin: it runs on a pricing
-- path and reports presentations only.
-- ---------------------------------------------------------------------------

create or replace function public.research_variant_strength_dispute_reason(
  p_product_id uuid,
  p_variant_id uuid
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $dispute_reason$
declare
  v_variant public.research_product_variants%rowtype;
  v_locked public.research_catalog_founder_locked_variant%rowtype;
  v_sku_key text;
  v_catalog_key text;
begin
  -- An unseeded registry proves nothing, so it refuses everything.
  if not exists (
    select 1 from public.research_catalog_founder_locked_variant
  ) then
    return 'variant_strength_registry_unavailable: the founder-locked '
      || 'presentation registry holds no rows, so no unit can be proven '
      || 'undisputed.';
  end if;

  select * into v_variant
  from public.research_product_variants
  where id = p_variant_id and product_id = p_product_id;
  if not found then
    return 'variant_identity_unresolved: no variant with the requested id '
      || 'belongs to this product, so its strength cannot be proven '
      || 'undisputed.';
  end if;

  v_sku_key := public.research_normalize_sku_key(v_variant.sku);
  v_catalog_key := public.research_normalize_sku_key(v_variant.catalog_number);
  if v_sku_key = '' then
    return 'variant_identity_unresolved: the variant records no SKU, so it '
      || 'cannot be matched against the founder-locked catalog.';
  end if;

  -- 1. A dispute the catalog already records against this SKU. A Product
  --    Control import may carry the catalog SKU on catalog_number instead, so
  --    both keys join, with the variant's own SKU preferred.
  select * into v_locked
  from public.research_catalog_founder_locked_variant
  where sku_key in (v_sku_key, v_catalog_key)
    and supplier_master_strength is not null
  order by (sku_key <> v_sku_key)
  limit 1;
  if found then
    return format(
      'variant_strength_disputed: variant %s (%s) has a contested strength. '
      || 'The founder-locked catalog records "%s" and the signed supplier '
      || 'master records "%s". A named human must resolve the presentation '
      || 'before this unit can carry a price.',
      v_locked.sku, v_locked.product_code,
      v_locked.founder_locked_strength, v_locked.supplier_master_strength
    );
  end if;

  -- 2. Drift: this record contradicts the founder-locked presentation for the
  --    same SKU. The same class of contest, arriving from the other direction.
  if btrim(coalesce(v_variant.strength, '')) <> '' then
    select * into v_locked
    from public.research_catalog_founder_locked_variant
    where sku_key in (v_sku_key, v_catalog_key)
      and public.research_normalize_presentation_key(founder_locked_strength)
          <> public.research_normalize_presentation_key(v_variant.strength)
    order by (sku_key <> v_sku_key)
    limit 1;
    if found then
      return format(
        'variant_strength_disputed: variant %s (%s) contradicts the '
        || 'founder-locked catalog. The founder-locked catalog records "%s" '
        || 'and the Product Control variant record records "%s". A named human '
        || 'must resolve the presentation before this unit can carry a price.',
        v_locked.sku, v_locked.product_code,
        v_locked.founder_locked_strength, v_variant.strength
      );
    end if;
  end if;

  return null;
end;
$dispute_reason$;

-- ---------------------------------------------------------------------------
-- The enforcement: no disputed price row can be inserted, and none can be
-- approved or activated. The create RPC and the approve RPC both pass through
-- here, and so does any direct write, because it is a row trigger on the table.
-- ---------------------------------------------------------------------------

create or replace function public.research_product_price_strength_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $strength_gate$
declare
  v_reason text;
begin
  if tg_op = 'INSERT' or new.status in ('approved', 'active') then
    v_reason := public.research_variant_strength_dispute_reason(
      new.product_id, new.variant_id
    );
    if v_reason is not null then
      raise exception 'research product price refused: %', v_reason
        using errcode = '23514';
    end if;
  end if;
  return new;
end;
$strength_gate$;

drop trigger if exists research_product_prices_strength_gate
  on public.research_product_prices;
create trigger research_product_prices_strength_gate
before insert or update on public.research_product_prices
for each row execute function public.research_product_price_strength_gate();

revoke all on function public.research_normalize_sku_key(text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_normalize_presentation_key(text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_variant_strength_dispute_reason(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.research_product_price_strength_gate()
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The registry rows: one per founder-locked catalog variant, transcribed from
-- shared/research/catalog/peptide-catalog.ts. Re-running refreshes them, so a
-- catalog edit is carried by re-applying this file. Nothing is deleted.
-- ---------------------------------------------------------------------------

insert into public.research_catalog_founder_locked_variant (
  sku_key, sku, product_code, legacy_product_code,
  founder_locked_strength, supplier_master_strength
) values
    ('R360-BPC157_TB500-15MG_15MG-VIAL', 'R360-BPC157_TB500-15MG_15MG-VIAL', 'PEP-001', 'P001', '15 mg / 15 mg', '5 mg BPC-157 / 5 mg TB-500 (10 mg total)'),
    ('R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL', 'R360-BPC157_TB500_GHKCU-10MG_10MG_50MG-VIAL', 'PEP-002', 'P002', '10 mg / 10 mg / 50 mg', 'GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg (70 mg total)'),
    ('R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL', 'R360-TB500_BPC157_GHKCU_KPV-5MG_5MG_10MG_5MG-VIAL', 'PEP-003', 'P003', '5 mg / 5 mg / 10 mg / 5 mg', 'GHK-Cu 50 mg / BPC-157 10 mg / TB-500 10 mg / KPV 10 mg (80 mg total)'),
    ('R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL', 'R360-THYMOSINALPHA1_KPV_LL37-5MG_5MG_5MG-VIAL', 'PEP-004', 'P004', '5 mg / 5 mg / 5 mg', null),
    ('R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL', 'R360-CJC1295_IPAMORELIN-5MG_5MG-VIAL', 'PEP-005', 'P005', '5 mg / 5 mg', null),
    ('R360-CJC1295_IPAMORELIN-20MG-VIAL', 'R360-CJC1295_IPAMORELIN-20MG-VIAL', 'PEP-005', 'P005', '20 mg', null),
    ('R360-PT141-10MG-VIAL', 'R360-PT141-10MG-VIAL', 'PEP-006', 'P006', '10 mg', null),
    ('R360-TESAMORELIN-10MG-VIAL', 'R360-TESAMORELIN-10MG-VIAL', 'PEP-007', 'P007', '10 mg', '5 mg'),
    ('R360-TESAMORELIN-20MG-VIAL', 'R360-TESAMORELIN-20MG-VIAL', 'PEP-007', 'P007', '20 mg', null),
    ('R360-GONADORELIN-5MG-VIAL', 'R360-GONADORELIN-5MG-VIAL', 'PEP-008', 'P008', '5 mg', '2 mg'),
    ('R360-NAD-500MG-VIAL', 'R360-NAD-500MG-VIAL', 'PEP-009', 'P009', '500 mg', '100 mg'),
    ('R360-NAD-1000MG-VIAL', 'R360-NAD-1000MG-VIAL', 'PEP-009', 'P009', '1000 mg', null),
    ('R360-MOTSC-10MG-VIAL', 'R360-MOTSC-10MG-VIAL', 'PEP-010', 'P010', '10 mg', '5 mg'),
    ('R360-MOTSC-40MG-VIAL', 'R360-MOTSC-40MG-VIAL', 'PEP-010', 'P010', '40 mg', null),
    ('R360-EPITHALON-10MG-VIAL', 'R360-EPITHALON-10MG-VIAL', 'PEP-011', 'P011', '10 mg', '5 mg'),
    ('R360-EPITHALON-100MG-VIAL', 'R360-EPITHALON-100MG-VIAL', 'PEP-011', 'P011', '100 mg', null),
    ('R360-SS31-10MG-VIAL', 'R360-SS31-10MG-VIAL', 'PEP-012', 'P012', '10 mg', '5 mg'),
    ('R360-SS31-50MG-VIAL', 'R360-SS31-50MG-VIAL', 'PEP-012', 'P012', '50 mg', null),
    ('R360-SLUPP332-250MCGX100-CAP', 'R360-SLUPP332-250MCGX100-CAP', 'PEP-013', 'P013', '250 mcg', '1500 mcg per capsule, 60 capsules'),
    ('R360-DIHEXA-10MGX60-CAP', 'R360-DIHEXA-10MGX60-CAP', 'PEP-014', 'P014', '10 mg', '10 mg per capsule, 30 capsules'),
    ('R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL', 'R360-SEMAX_SELANK_DSIP-10MG_10MG_2MG-VIAL', 'PEP-015', 'P015', '10 mg / 10 mg / 2 mg', 'Semax 5 mg / Selank 5 mg / DSIP 5 mg (15 mg total)'),
    ('R360-BPC157-10MG-VIAL', 'R360-BPC157-10MG-VIAL', 'PEX-001', null, '10 mg', null),
    ('R360-BPC157-20MG-VIAL', 'R360-BPC157-20MG-VIAL', 'PEX-001', null, '20 mg', null),
    ('R360-TB500-10MG-VIAL', 'R360-TB500-10MG-VIAL', 'PEX-002', null, '10 mg', null),
    ('R360-GHKCU-100MG-VIAL', 'R360-GHKCU-100MG-VIAL', 'PEX-003', null, '100 mg', null),
    ('R360-KPV-10MG-VIAL', 'R360-KPV-10MG-VIAL', 'PEX-004', null, '10 mg', null),
    ('R360-SEMAX-10MG-VIAL', 'R360-SEMAX-10MG-VIAL', 'PEX-005', null, '10 mg', null),
    ('R360-SEMAX-30MG-VIAL', 'R360-SEMAX-30MG-VIAL', 'PEX-005', null, '30 mg', null),
    ('R360-SELANK-10MG-VIAL', 'R360-SELANK-10MG-VIAL', 'PEX-006', null, '10 mg', null),
    ('R360-DSIP-15MG-VIAL', 'R360-DSIP-15MG-VIAL', 'PEX-007', null, '15 mg', null),
    ('R360-THYMOSINALPHA1-10MG-VIAL', 'R360-THYMOSINALPHA1-10MG-VIAL', 'PEX-008', null, '10 mg', null),
    ('R360-IPAMORELIN-10MG-VIAL', 'R360-IPAMORELIN-10MG-VIAL', 'PEX-009', null, '10 mg', null),
    ('R360-5AMINO1MQ-5MG-VIAL', 'R360-5AMINO1MQ-5MG-VIAL', 'PEX-010', null, '5 mg', null),
    ('R360-5AMINO1MQ-50MG-VIAL', 'R360-5AMINO1MQ-50MG-VIAL', 'PEX-010', null, '50 mg', null),
    ('R360-ADAMAX-10MG-VIAL', 'R360-ADAMAX-10MG-VIAL', 'PEX-011', null, '10 mg', null),
    ('R360-AOD9604-5MG-VIAL', 'R360-AOD9604-5MG-VIAL', 'PEX-012', null, '5 mg', null),
    ('R360-AOD9604-10MG-VIAL', 'R360-AOD9604-10MG-VIAL', 'PEX-012', null, '10 mg', null),
    ('R360-CJC1295DAC-5MG-VIAL', 'R360-CJC1295DAC-5MG-VIAL', 'PEX-013', null, '5 mg', null),
    ('R360-FOLLISTATIN-1MG-VIAL', 'R360-FOLLISTATIN-1MG-VIAL', 'PEX-014', null, '1 mg', null),
    ('R360-GLUTATHIONE-600MG-VIAL', 'R360-GLUTATHIONE-600MG-VIAL', 'PEX-015', null, '600 mg', null),
    ('R360-GLUTATHIONE-1500MG-VIAL', 'R360-GLUTATHIONE-1500MG-VIAL', 'PEX-015', null, '1500 mg', null),
    ('R360-HCG-5000IU-VIAL', 'R360-HCG-5000IU-VIAL', 'PEX-016', null, '5000 IU', null),
    ('R360-IGF1LR3-0P1MG-VIAL', 'R360-IGF1LR3-0P1MG-VIAL', 'PEX-017', null, '0.1 mg', null),
    ('R360-IGF1LR3-1MG-VIAL', 'R360-IGF1LR3-1MG-VIAL', 'PEX-017', null, '1 mg', null),
    ('R360-KISSPEPTIN10-10MG-VIAL', 'R360-KISSPEPTIN10-10MG-VIAL', 'PEX-018', null, '10 mg', null),
    ('R360-LCARNITINE-600MG-VIAL', 'R360-LCARNITINE-600MG-VIAL', 'PEX-019', null, '600 mg', null),
    ('R360-LIPOC-100MG-VIAL', 'R360-LIPOC-100MG-VIAL', 'PEX-020', null, '100 mg', null),
    ('R360-MELANOTAN1-10MG-VIAL', 'R360-MELANOTAN1-10MG-VIAL', 'PEX-021', null, '10 mg', null),
    ('R360-MELANOTAN2-10MG-VIAL', 'R360-MELANOTAN2-10MG-VIAL', 'PEX-022', null, '10 mg', null),
    ('R360-SERMORELIN-10MG-VIAL', 'R360-SERMORELIN-10MG-VIAL', 'PEX-023', null, '10 mg', null),
    ('R360-THYMALIN-10MG-VIAL', 'R360-THYMALIN-10MG-VIAL', 'PEX-024', null, '10 mg', null),
    ('R360-VIP-10MG-VIAL', 'R360-VIP-10MG-VIAL', 'PEX-025', null, '10 mg', null),
    ('R360-SEMAX_SELANK-10MG-VIAL', 'R360-SEMAX_SELANK-10MG-VIAL', 'PEX-026', null, '10 mg', null),
    ('R360-TESAMORELIN_IPAMORELIN-15MG-VIAL', 'R360-TESAMORELIN_IPAMORELIN-15MG-VIAL', 'PEX-027', null, '15 mg', null),
    ('R360-SEMAGLUTIDE-10MG-VIAL', 'R360-SEMAGLUTIDE-10MG-VIAL', 'PRH-001', null, '10 mg', null),
    ('R360-SEMAGLUTIDE-15MG-VIAL', 'R360-SEMAGLUTIDE-15MG-VIAL', 'PRH-001', null, '15 mg', null),
    ('R360-SEMAGLUTIDE-20MG-VIAL', 'R360-SEMAGLUTIDE-20MG-VIAL', 'PRH-001', null, '20 mg', null),
    ('R360-SEMAGLUTIDE-30MG-VIAL', 'R360-SEMAGLUTIDE-30MG-VIAL', 'PRH-001', null, '30 mg', null),
    ('R360-SEMAGLUTIDE-50MG-VIAL', 'R360-SEMAGLUTIDE-50MG-VIAL', 'PRH-001', null, '50 mg', null),
    ('R360-TIRZEPATIDE-10MG-VIAL', 'R360-TIRZEPATIDE-10MG-VIAL', 'PRH-002', null, '10 mg', null),
    ('R360-TIRZEPATIDE-20MG-VIAL', 'R360-TIRZEPATIDE-20MG-VIAL', 'PRH-002', null, '20 mg', null),
    ('R360-TIRZEPATIDE-30MG-VIAL', 'R360-TIRZEPATIDE-30MG-VIAL', 'PRH-002', null, '30 mg', null),
    ('R360-TIRZEPATIDE-60MG-VIAL', 'R360-TIRZEPATIDE-60MG-VIAL', 'PRH-002', null, '60 mg', null),
    ('R360-TIRZEPATIDE-100MG-VIAL', 'R360-TIRZEPATIDE-100MG-VIAL', 'PRH-002', null, '100 mg', null),
    ('R360-TIRZEPATIDE-120MG-VIAL', 'R360-TIRZEPATIDE-120MG-VIAL', 'PRH-002', null, '120 mg', null),
    ('R360-RETATRUTIDE-10MG-VIAL', 'R360-RETATRUTIDE-10MG-VIAL', 'PRH-003', null, '10 mg', null),
    ('R360-RETATRUTIDE-15MG-VIAL', 'R360-RETATRUTIDE-15MG-VIAL', 'PRH-003', null, '15 mg', null),
    ('R360-RETATRUTIDE-20MG-VIAL', 'R360-RETATRUTIDE-20MG-VIAL', 'PRH-003', null, '20 mg', null),
    ('R360-RETATRUTIDE-30MG-VIAL', 'R360-RETATRUTIDE-30MG-VIAL', 'PRH-003', null, '30 mg', null),
    ('R360-RETATRUTIDE-50MG-VIAL', 'R360-RETATRUTIDE-50MG-VIAL', 'PRH-003', null, '50 mg', null)
on conflict (sku_key) do update set
  sku = excluded.sku,
  product_code = excluded.product_code,
  legacy_product_code = excluded.legacy_product_code,
  founder_locked_strength = excluded.founder_locked_strength,
  supplier_master_strength = excluded.supplier_master_strength,
  recorded_at = now();

-- ---------------------------------------------------------------------------
-- R2. THE VARIANT-SIDE GATE.
--
-- The price trigger above is necessary and NOT sufficient. An adversarial audit
-- established that public.research_admin_update_product_variant is SECURITY
-- DEFINER, is granted to service_role, assigns sku, catalog_number and strength
-- with no dispute screen (20260726143000:50-53), and that there was NO trigger
-- of any kind on public.research_product_variants. So a caller holding the
-- service role reaches an active price on a contested unit in three ordinary
-- RPC calls, writing NOTHING to research_product_prices, which means the price
-- trigger never fires:
--
--   1. research_admin_create_product_price   on a genuinely clean variant  -> draft
--   2. research_admin_approve_product_price  same clean variant            -> active
--   3. research_admin_update_product_variant '{"strength":"5 mg"}'         -> now contested,
--                                                                            price still active
--
-- Substituting the disputed SKU in step 3 lands it on a recorded dispute
-- instead. The application layer refuses both (screenVariantEdit), but an RPC
-- caller does not pass through the application layer, which is the entire
-- reason this file exists.
--
-- The same two rules the application enforces, mirrored here so the database is
-- authoritative:
--   RULE 1  frozen while contested. If the row is disputed BEFORE the edit, its
--           sku, catalog_number and strength may not change. Renaming is not
--           resolving; only a named human resolving the presentation clears it.
--           Checked FIRST, because after a rename the resulting row screens
--           clean and that is precisely the evasion.
--   RULE 2  cannot move INTO a dispute. If the row would be contested AFTER the
--           edit, the edit is refused.
--
-- Scoped exactly like the application screen: an update that does not touch the
-- identity triple runs no check at all, so lifecycle, ordering and labelling
-- edits are unaffected.
-- ---------------------------------------------------------------------------

create or replace function public.research_variant_strength_triple_dispute_reason(
  p_sku text,
  p_catalog_number text,
  p_strength text
)
returns text
language plpgsql
stable
security definer
set search_path = pg_catalog
as $triple_reason$
declare
  v_locked public.research_catalog_founder_locked_variant%rowtype;
  v_sku_key text;
  v_catalog_key text;
begin
  -- An unseeded registry proves nothing, so it refuses everything.
  if not exists (
    select 1 from public.research_catalog_founder_locked_variant
  ) then
    return 'variant_strength_registry_unavailable: the founder-locked '
      || 'presentation registry holds no rows, so no unit can be proven '
      || 'undisputed.';
  end if;

  v_sku_key := public.research_normalize_sku_key(p_sku);
  v_catalog_key := public.research_normalize_sku_key(p_catalog_number);
  if v_sku_key = '' then
    return 'variant_identity_unresolved: the edit would leave the variant '
      || 'with no SKU, so it could not be matched against the founder-locked '
      || 'catalog.';
  end if;

  select * into v_locked
  from public.research_catalog_founder_locked_variant
  where sku_key in (v_sku_key, v_catalog_key)
    and supplier_master_strength is not null
  order by (sku_key <> v_sku_key)
  limit 1;
  if found then
    return format(
      'variant_strength_disputed: variant %s (%s) has a contested strength. '
      || 'The founder-locked catalog records "%s" and the signed supplier '
      || 'master records "%s". A named human must resolve the presentation '
      || 'before this unit can carry a price.',
      v_locked.sku, v_locked.product_code,
      v_locked.founder_locked_strength, v_locked.supplier_master_strength
    );
  end if;

  if btrim(coalesce(p_strength, '')) <> '' then
    select * into v_locked
    from public.research_catalog_founder_locked_variant
    where sku_key in (v_sku_key, v_catalog_key)
      and public.research_normalize_presentation_key(founder_locked_strength)
          <> public.research_normalize_presentation_key(p_strength)
    order by (sku_key <> v_sku_key)
    limit 1;
    if found then
      return format(
        'variant_strength_disputed: variant %s (%s) contradicts the '
        || 'founder-locked catalog. The founder-locked catalog records "%s" '
        || 'and the edit records "%s". A named human must resolve the '
        || 'presentation before this unit can carry a price.',
        v_locked.sku, v_locked.product_code,
        v_locked.founder_locked_strength, p_strength
      );
    end if;
  end if;

  return null;
end;
$triple_reason$;

create or replace function public.research_product_variant_strength_gate()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $variant_gate$
declare
  v_reason text;
  v_touches boolean;
begin
  v_touches :=
    coalesce(new.sku, '') is distinct from coalesce(old.sku, '')
    or coalesce(new.catalog_number, '') is distinct from coalesce(old.catalog_number, '')
    or coalesce(new.strength, '') is distinct from coalesce(old.strength, '');

  if not v_touches then
    return new;
  end if;

  -- RULE 1. Frozen while contested. Evaluated on the OLD row, before the edit.
  v_reason := public.research_variant_strength_triple_dispute_reason(
    old.sku, old.catalog_number, old.strength
  );
  if v_reason is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'research product variant refused: %s Its SKU, catalogue number and strength are frozen until that is resolved: renaming the unit is not resolving the dispute.',
        v_reason
      );
  end if;

  -- RULE 2. Cannot move onto a contested presentation.
  v_reason := public.research_variant_strength_triple_dispute_reason(
    new.sku, new.catalog_number, new.strength
  );
  if v_reason is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'research product variant refused: %s This edit would move the variant onto that contested presentation.',
        v_reason
      );
  end if;

  return new;
end;
$variant_gate$;

drop trigger if exists research_product_variants_strength_gate
  on public.research_product_variants;

create trigger research_product_variants_strength_gate
  before update on public.research_product_variants
  for each row
  execute function public.research_product_variant_strength_gate();

-- Default function EXECUTE is PUBLIC in PostgreSQL. None of these helpers is an
-- application API: the two trigger functions call the decision helpers as their
-- owner, and the normalizers are internal implementation details. Revoke the
-- default grant explicitly, including service_role, so no caller can use a
-- SECURITY DEFINER helper to read founder/supplier dispute text.
revoke all on function public.research_normalize_sku_key(text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_normalize_presentation_key(text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_variant_strength_dispute_reason(uuid,uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.research_product_price_strength_gate()
  from public, anon, authenticated, service_role;
revoke all on function public.research_variant_strength_triple_dispute_reason(text,text,text)
  from public, anon, authenticated, service_role;
revoke all on function public.research_product_variant_strength_gate()
  from public, anon, authenticated, service_role;

-- Refuse installation over pre-existing state that the new invariant would
-- reject. This runs after the registry refresh and both trigger definitions,
-- while the registry remains ACCESS EXCLUSIVE locked, so a concurrent write
-- cannot race a stale dispute answer across COMMIT.
do $existing_price_preflight$
declare
  v_price_id uuid;
begin
  select p.id into v_price_id
  from public.research_product_prices p
  where public.research_variant_strength_dispute_reason(
    p.product_id, p.variant_id
  ) is not null
  limit 1;
  if v_price_id is not null then
    raise exception using
      errcode = '23514',
      message = format(
        'research_variant_strength_write_gate: existing price %s resolves to a disputed or unidentifiable variant; hold or remove that price before applying this migration.',
        v_price_id
      );
  end if;
end
$existing_price_preflight$;

commit;
