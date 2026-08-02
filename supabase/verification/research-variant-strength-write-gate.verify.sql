\set ON_ERROR_STOP on

-- Deterministic PR230 strength-identity verifier.
-- Default mode proves both triggers, privileges, direct DML, SECURITY DEFINER
-- RPCs, positive controls, and zero durable mutation. Every synthetic business
-- row is rolled back. Set -v pr230_run_full_rollback=1 to run only the complete,
-- idempotent gate-object rollback (safe from absent, partial, or full install).

\if :{?pr230_run_full_rollback}
\echo '=== PR230 FULL GATE ROLLBACK (explicit opt-in) ==='
create temporary table pr230_rollback_baseline (
  products bigint not null,
  variants bigint not null,
  prices bigint not null,
  audits bigint not null
) on commit preserve rows;
insert into pr230_rollback_baseline
select
  (select count(*) from public.research_products),
  (select count(*) from public.research_product_variants),
  (select count(*) from public.research_product_prices),
  (select count(*) from public.research_product_admin_audit);

begin;
drop trigger if exists research_product_prices_strength_gate
  on public.research_product_prices;
drop trigger if exists research_product_variants_strength_gate
  on public.research_product_variants;
drop function if exists public.research_product_price_strength_gate();
drop function if exists public.research_product_variant_strength_gate();
drop function if exists public.research_variant_strength_triple_dispute_reason(text,text,text);
drop function if exists public.research_variant_strength_dispute_reason(uuid,uuid);
drop function if exists public.research_normalize_presentation_key(text);
drop function if exists public.research_normalize_sku_key(text);
drop table if exists public.research_catalog_founder_locked_variant;
commit;

do $rollback_verify$
declare
  b pr230_rollback_baseline%rowtype;
  v_products bigint;
  v_variants bigint;
  v_prices bigint;
  v_audits bigint;
begin
  select * into b from pr230_rollback_baseline;
  select count(*) into v_products from public.research_products;
  select count(*) into v_variants from public.research_product_variants;
  select count(*) into v_prices from public.research_product_prices;
  select count(*) into v_audits from public.research_product_admin_audit;
  if row(v_products,v_variants,v_prices,v_audits)
     is distinct from row(b.products,b.variants,b.prices,b.audits) then
    raise exception
      'FAIL ROLLBACK: business counts changed from (%,%,%,%) to (%,%,%,%).',
      b.products,b.variants,b.prices,b.audits,
      v_products,v_variants,v_prices,v_audits;
  end if;
  if to_regclass('public.research_catalog_founder_locked_variant') is not null
     or to_regprocedure('public.research_product_price_strength_gate()') is not null
     or to_regprocedure('public.research_product_variant_strength_gate()') is not null
     or to_regprocedure('public.research_variant_strength_triple_dispute_reason(text,text,text)') is not null
     or to_regprocedure('public.research_variant_strength_dispute_reason(uuid,uuid)') is not null
     or to_regprocedure('public.research_normalize_presentation_key(text)') is not null
     or to_regprocedure('public.research_normalize_sku_key(text)') is not null then
    raise exception 'FAIL ROLLBACK: one or more PR230 gate objects remain.';
  end if;
  raise notice 'PASS ROLLBACK: all gate objects absent and business counts unchanged.';
end
$rollback_verify$;
drop table pg_temp.pr230_rollback_baseline;
\else

\echo '=== P0 exact objects, trigger bindings, and privileges ==='
do $p0$
declare
  v_count integer;
  v_owner oid;
  v_priv text;
  v_sig text;
  v_role text;
begin
  if to_regclass('public.research_products') is null
     or to_regclass('public.research_product_variants') is null
     or to_regclass('public.research_product_prices') is null
     or to_regclass('public.research_product_admin_audit') is null
     or to_regclass('public.research_catalog_founder_locked_variant') is null then
    raise exception 'FAIL P0: a required Product Control or strength-gate table is missing.';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'FAIL P0: service_role is absent.';
  end if;
  if (select count(*) from public.research_catalog_founder_locked_variant) = 0
     or not exists (
       select 1 from public.research_catalog_founder_locked_variant
       where supplier_master_strength is not null
     ) then
    raise exception 'FAIL P0: registry lacks deterministic disputed subjects.';
  end if;

  select c.relowner into v_owner
  from pg_class c
  where c.oid = 'public.research_catalog_founder_locked_variant'::regclass;
  if not exists (
    select 1
    from pg_class c
    where c.oid = 'public.research_catalog_founder_locked_variant'::regclass
      and c.relkind = 'r'
      and c.relrowsecurity
      and c.relforcerowsecurity
  ) then
    raise exception 'FAIL P0: registry is not an ordinary forced-RLS table.';
  end if;
  if not exists (
    select 1 from pg_roles
    where oid = v_owner and (rolsuper or rolbypassrls)
  ) then
    raise exception 'FAIL P0: registry owner is not a superuser or BYPASSRLS role.';
  end if;
  if exists (
    select 1
    from pg_policy
    where polrelid =
      'public.research_catalog_founder_locked_variant'::regclass
  ) then
    raise exception 'FAIL P0: registry unexpectedly has an access policy.';
  end if;
  if exists (
    select 1
    from pg_class c
    cross join lateral aclexplode(
      coalesce(c.relacl, acldefault('r', c.relowner))
    ) a
    where c.oid = 'public.research_catalog_founder_locked_variant'::regclass
      and a.grantee = 0
  ) then
    raise exception 'FAIL P0: PUBLIC retains a registry table privilege.';
  end if;

  select count(*) into v_count
  from pg_trigger t
  where t.tgname = 'research_product_prices_strength_gate'
    and t.tgrelid = 'public.research_product_prices'::regclass
    and t.tgfoid = 'public.research_product_price_strength_gate()'::regprocedure
    and t.tgenabled = 'O'
    and t.tgtype = 23
    and not t.tgisinternal;
  if v_count <> 1 then
    raise exception
      'FAIL P0: exact ordinary BEFORE INSERT OR UPDATE ROW price trigger count is %, expected 1.', v_count;
  end if;
  select count(*) into v_count
  from pg_trigger t
  where t.tgname = 'research_product_variants_strength_gate'
    and t.tgrelid = 'public.research_product_variants'::regclass
    and t.tgfoid = 'public.research_product_variant_strength_gate()'::regprocedure
    and t.tgenabled = 'O'
    and t.tgtype = 19
    and not t.tgisinternal;
  if v_count <> 1 then
    raise exception
      'FAIL P0: exact ordinary BEFORE UPDATE ROW variant trigger count is %, expected 1.', v_count;
  end if;

  foreach v_sig in array array[
    'public.research_normalize_sku_key(text)',
    'public.research_normalize_presentation_key(text)',
    'public.research_variant_strength_dispute_reason(uuid,uuid)',
    'public.research_product_price_strength_gate()',
    'public.research_variant_strength_triple_dispute_reason(text,text,text)',
    'public.research_product_variant_strength_gate()'
  ] loop
    if to_regprocedure(v_sig) is null then
      raise exception 'FAIL P0: function % is absent.', v_sig;
    end if;
    select count(*) into v_count
    from pg_proc p
    where p.oid = to_regprocedure(v_sig)
      and p.proowner = v_owner
      and p.prokind = 'f'
      and p.prosecdef = (
        v_sig not in (
          'public.research_normalize_sku_key(text)',
          'public.research_normalize_presentation_key(text)'
        )
      )
      and coalesce(p.proconfig, array[]::text[]) = array['search_path=pg_catalog'];
    if v_count <> 1 then
      raise exception
        'FAIL P0: function % owner/kind/security/search_path is not exact.', v_sig;
    end if;
    if exists (
      select 1
      from pg_proc p
      cross join lateral aclexplode(
        coalesce(p.proacl, acldefault('f', p.proowner))
      ) a
      where p.oid = to_regprocedure(v_sig)
        and a.grantee = 0
        and a.privilege_type = 'EXECUTE'
    ) then
      raise exception 'FAIL P0: PUBLIC retains EXECUTE on %.', v_sig;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role, v_sig, 'EXECUTE') then
        raise exception 'FAIL P0: role % retains EXECUTE on %.', v_role, v_sig;
      end if;
    end loop;
  end loop;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_priv in array array[
      'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
    ] loop
      if has_table_privilege(
        v_role,
        'public.research_catalog_founder_locked_variant',
        v_priv
      ) then
        raise exception 'FAIL P0: role % retains registry privilege %.', v_role, v_priv;
      end if;
    end loop;
  end loop;
  raise notice
    'PASS P0: exact triggers, owner, forced RLS, search paths and ACLs verified.';
end
$p0$;

create temporary table pr230_verification_baseline (
  products bigint not null,
  variants bigint not null,
  prices bigint not null,
  audits bigint not null
) on commit preserve rows;
insert into pr230_verification_baseline
select
  (select count(*) from public.research_products),
  (select count(*) from public.research_product_variants),
  (select count(*) from public.research_product_prices),
  (select count(*) from public.research_product_admin_audit);

begin;
create temporary table pr230_subjects (
  product_id uuid primary key,
  clean_variant_id uuid not null,
  disputed_variant_id uuid not null,
  disputed_registry_sku text not null,
  disputed_strength text not null,
  clean_price_id uuid
) on commit drop;
insert into pr230_subjects
select
  'f2300000-0000-4000-8000-000000000001'::uuid,
  'f2300000-0000-4000-8000-000000000011'::uuid,
  'f2300000-0000-4000-8000-000000000012'::uuid,
  r.sku,
  r.founder_locked_strength,
  null::uuid
from public.research_catalog_founder_locked_variant r
where r.supplier_master_strength is not null
order by r.sku_key
limit 1;
grant select on table pg_temp.pr230_subjects to service_role;

do $fixture_guard$
begin
  if exists (
    select 1 from public.research_products
    where id = 'f2300000-0000-4000-8000-000000000001'::uuid
  ) or exists (
    select 1 from public.research_product_variants
    where id in (
      'f2300000-0000-4000-8000-000000000011'::uuid,
      'f2300000-0000-4000-8000-000000000012'::uuid
    )
  ) or exists (
    select 1 from public.research_product_prices
    where id = 'f2300000-0000-4000-8000-000000000021'::uuid
  ) then
    raise exception 'FAIL FIXTURE: reserved PR230 verification identities already exist.';
  end if;
end
$fixture_guard$;

insert into public.research_products (
  id, sku, slug, display_name, canonical_name, lane,
  category, product_classification, created_by, updated_by
) values (
  'f2300000-0000-4000-8000-000000000001',
  'PR230-VERIFY-PRODUCT',
  'pr230-verify-product',
  'PR230 Verification Product',
  'PR230 Verification Product',
  'research_material',
  'verification',
  'verification',
  'pr230-verifier',
  'pr230-verifier'
);

insert into public.research_product_variants (
  id, product_id, sku, catalog_number, label, strength,
  status, active, version, created_by, updated_by
) values (
  'f2300000-0000-4000-8000-000000000011',
  'f2300000-0000-4000-8000-000000000001',
  'PR230-CLEAN-VARIANT',
  'PR230-CLEAN-CATALOG',
  'PR230 clean',
  '1 unit',
  'draft', false, 1, 'pr230-verifier', 'pr230-verifier'
);
insert into public.research_product_variants (
  id, product_id, sku, catalog_number, label, strength,
  status, active, version, created_by, updated_by
)
select
  disputed_variant_id,
  product_id,
  'PR230-DISPUTED-SYNTHETIC',
  disputed_registry_sku,
  'PR230 disputed',
  disputed_strength,
  'draft', false, 1, 'pr230-verifier', 'pr230-verifier'
from pr230_subjects;

update public.research_product_variants
set status = 'in_review'
where id in (
  'f2300000-0000-4000-8000-000000000011',
  'f2300000-0000-4000-8000-000000000012'
);
update public.research_product_variants
set status = 'approved'
where id in (
  'f2300000-0000-4000-8000-000000000011',
  'f2300000-0000-4000-8000-000000000012'
);
update public.research_product_variants
set active = true
where id in (
  'f2300000-0000-4000-8000-000000000011',
  'f2300000-0000-4000-8000-000000000012'
);

\echo '=== P1 read rejection and helper privilege denial ==='
do $p1$
declare
  v_reason text;
begin
  v_reason := public.research_variant_strength_dispute_reason(
    'f2300000-0000-4000-8000-000000000001',
    'f2300000-0000-4000-8000-000000000012'
  );
  if v_reason is null or v_reason not like 'variant_strength_disputed:%' then
    raise exception 'FAIL P1: disputed read reason was %.', coalesce(v_reason,'NULL');
  end if;
  raise notice 'PASS P1: disputed read projection remains rejected.';
end
$p1$;
set local role service_role;
do $p1_role$
begin
  begin
    perform public.research_variant_strength_dispute_reason(
      'f2300000-0000-4000-8000-000000000001',
      'f2300000-0000-4000-8000-000000000012'
    );
    raise exception 'FAIL P1: service_role executed the internal dispute helper.';
  exception when insufficient_privilege then
    raise notice 'PASS P1: service_role cannot execute the internal dispute helper.';
  end;
end
$p1_role$;
reset role;

\echo '=== P2 direct service-role DML is refused ==='
set local role service_role;
do $p2_role$
begin
  begin
    insert into public.research_product_prices (
      id, product_id, variant_id, audience, amount_cents, currency,
      effective_at, status, version, created_by
    ) values (
      'f2300000-0000-4000-8000-000000000021',
      'f2300000-0000-4000-8000-000000000001',
      'f2300000-0000-4000-8000-000000000012',
      'member',12345,'USD','2026-08-01T00:00:00Z','draft',1,'pr230-verifier'
    );
    raise exception 'FAIL P2: service_role directly inserted a disputed price.';
  exception when insufficient_privilege then
    raise notice 'PASS P2: service_role has no direct price-table write privilege.';
  end;

  begin
    update public.research_product_variants
    set sku='PR230-SERVICE-ROLE-DIRECT'
    where id='f2300000-0000-4000-8000-000000000012';
    raise exception 'FAIL P2: service_role directly changed disputed identity.';
  exception when insufficient_privilege then
    raise notice 'PASS P2: service_role has no direct variant-table write privilege.';
  end;
end
$p2_role$;
reset role;
do $p2_post$
begin
  if exists (
    select 1 from public.research_product_prices
    where id='f2300000-0000-4000-8000-000000000021'
  ) then
    raise exception 'FAIL P2: denied direct price write left a row.';
  end if;
  if not exists (
    select 1 from public.research_product_variants v
    join pr230_subjects s on s.disputed_variant_id=v.id
    where v.sku='PR230-DISPUTED-SYNTHETIC'
      and v.catalog_number=s.disputed_registry_sku
      and v.strength=s.disputed_strength
  ) then
    raise exception 'FAIL P2: denied direct identity write changed the variant.';
  end if;
  raise notice 'PASS P2: direct service-role mutations were refused with zero state change.';
end
$p2_post$;

\echo '=== P12 clean price create+approve succeeds ==='
set local role service_role;
select public.research_admin_create_product_price(
  'f2300000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'variantId','f2300000-0000-4000-8000-000000000011',
    'audience','member',
    'amountCents',12345,
    'currency','USD',
    'effectiveAt','2026-08-01T00:00:00Z'
  ),
  'pr230-verifier',
  '2026-08-01T12:00:00Z'
);
reset role;
update pr230_subjects s
set clean_price_id = p.id
from public.research_product_prices p
where p.product_id = s.product_id
  and p.variant_id = s.clean_variant_id
  and p.audience = 'member'
  and p.status = 'draft';
set local role service_role;
select public.research_admin_approve_product_price(
  'f2300000-0000-4000-8000-000000000001',
  (select clean_price_id from pg_temp.pr230_subjects),
  'pr230-verifier',
  '2026-08-01T12:00:00Z'
);
reset role;
do $p12$
begin
  if not exists (
    select 1 from public.research_product_prices p
    join pr230_subjects s on s.clean_price_id = p.id
    where p.status = 'active' and p.version = 1
      and p.created_by = 'pr230-verifier'
  ) then
    raise exception 'FAIL P12: clean price was not created and activated.';
  end if;
  raise notice 'PASS P12: clean price create and approval remain available.';
end
$p12$;

\echo '=== P3 disputed price direct and RPC create are refused ==='
do $p3_direct$
declare v_msg text;
begin
  begin
    insert into public.research_product_prices (
      id, product_id, variant_id, audience, amount_cents, currency,
      effective_at, status, version, created_by
    ) values (
      'f2300000-0000-4000-8000-000000000021',
      'f2300000-0000-4000-8000-000000000001',
      'f2300000-0000-4000-8000-000000000012',
      'member',12345,'USD','2026-08-01T00:00:00Z','draft',1,'pr230-verifier'
    );
    raise exception 'FAIL P3: direct disputed price insert succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product price refused: variant_strength_disputed:%' then
      raise exception 'FAIL P3: wrong direct-insert refusal: %.', v_msg;
    end if;
  end;
end
$p3_direct$;
set local role service_role;
do $p3_rpc$
declare v_msg text;
begin
  begin
    perform public.research_admin_create_product_price(
      'f2300000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'variantId','f2300000-0000-4000-8000-000000000012',
        'audience','member','amountCents',12345,'currency','USD',
        'effectiveAt','2026-08-01T00:00:00Z'
      ),
      'pr230-verifier','2026-08-01T12:00:00Z'
    );
    raise exception 'FAIL P3: service-role disputed price RPC succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product price refused: variant_strength_disputed:%' then
      raise exception 'FAIL P3: wrong create-RPC refusal: %.', v_msg;
    end if;
  end;
end
$p3_rpc$;
reset role;
do $p3_post$
begin
  if exists (
    select 1 from public.research_product_prices
    where variant_id = 'f2300000-0000-4000-8000-000000000012'
  ) then
    raise exception 'FAIL P3: a denied disputed-price row remains.';
  end if;
  raise notice 'PASS P3: direct and service-role disputed creates left zero rows.';
end
$p3_post$;

\echo '=== P4 pre-existing disputed draft cannot be approved ==='
alter table public.research_product_prices
  disable trigger research_product_prices_strength_gate;
insert into public.research_product_prices (
  id, product_id, variant_id, audience, amount_cents, currency,
  effective_at, status, version, created_by
) values (
  'f2300000-0000-4000-8000-000000000021',
  'f2300000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000012',
  'member',12345,'USD','2026-08-01T00:00:00Z','draft',1,'pr230-verifier'
);
alter table public.research_product_prices
  enable trigger research_product_prices_strength_gate;
do $p4_direct$
declare v_msg text;
begin
  begin
    update public.research_product_prices
    set status='active', approved_by='pr230-verifier',
        approved_at='2026-08-01T12:00:00Z', updated_at='2026-08-01T12:00:00Z'
    where id='f2300000-0000-4000-8000-000000000021';
    raise exception 'FAIL P4: direct disputed approval succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product price refused: variant_strength_disputed:%' then
      raise exception 'FAIL P4: wrong direct-approval refusal: %.', v_msg;
    end if;
  end;
end
$p4_direct$;
set local role service_role;
do $p4_rpc$
declare v_msg text;
begin
  begin
    perform public.research_admin_approve_product_price(
      'f2300000-0000-4000-8000-000000000001',
      'f2300000-0000-4000-8000-000000000021',
      'pr230-verifier','2026-08-01T12:00:00Z'
    );
    raise exception 'FAIL P4: service-role disputed approval succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product price refused: variant_strength_disputed:%' then
      raise exception 'FAIL P4: wrong approval-RPC refusal: %.', v_msg;
    end if;
  end;
end
$p4_rpc$;
reset role;
do $p4_post$
begin
  if not exists (
    select 1 from public.research_product_prices
    where id='f2300000-0000-4000-8000-000000000021'
      and status='draft' and approved_by is null and approved_at is null
  ) then
    raise exception 'FAIL P4: denied approval mutated the draft.';
  end if;
  raise notice 'PASS P4: direct and RPC approval refused; draft unchanged.';
end
$p4_post$;

\echo '=== P5 exploit A clean active price cannot move onto dispute ==='
do $p5_direct$
declare v_msg text;
begin
  begin
    update public.research_product_variants v
    set sku='PR230-ATTACK-DIRECT', catalog_number=s.disputed_registry_sku,
        strength=s.disputed_strength
    from pr230_subjects s
    where v.id=s.clean_variant_id;
    raise exception 'FAIL P5: direct exploit A succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product variant refused: variant_strength_disputed:%' then
      raise exception 'FAIL P5: wrong direct exploit-A refusal: %.', v_msg;
    end if;
  end;
end
$p5_direct$;
set local role service_role;
do $p5_rpc$
declare v_msg text;
begin
  begin
    perform public.research_admin_update_product_variant(
      s.product_id,s.clean_variant_id,
      jsonb_build_object(
        'sku','PR230-ATTACK-RPC',
        'catalogNumber',s.disputed_registry_sku,
        'strength',s.disputed_strength
      ),
      'pr230-verifier','2026-08-01T12:00:00Z'
    ) from pg_temp.pr230_subjects s;
    raise exception 'FAIL P5: service-role exploit A succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product variant refused: variant_strength_disputed:%' then
      raise exception 'FAIL P5: wrong RPC exploit-A refusal: %.', v_msg;
    end if;
  end;
end
$p5_rpc$;
reset role;
do $p5_post$
begin
  if not exists (
    select 1 from public.research_product_variants
    where id='f2300000-0000-4000-8000-000000000011'
      and sku='PR230-CLEAN-VARIANT'
      and catalog_number='PR230-CLEAN-CATALOG'
      and strength='1 unit'
  ) or not exists (
    select 1 from public.research_product_prices p
    join pr230_subjects s on s.clean_price_id=p.id
    where p.status='active'
  ) then
    raise exception 'FAIL P5: denied exploit A changed identity or active price.';
  end if;
  raise notice 'PASS P5: direct and service-role exploit A refused; price/identity unchanged.';
end
$p5_post$;

\echo '=== P6 exploit B disputed rename cannot erase read dispute ==='
do $p6_direct$
declare v_msg text;
begin
  begin
    update public.research_product_variants
    set sku='PR230-ESCAPE-DIRECT',catalog_number='PR230-ESCAPE-DIRECT'
    where id='f2300000-0000-4000-8000-000000000012';
    raise exception 'FAIL P6: direct exploit B succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product variant refused: variant_strength_disputed:%renaming the unit is not resolving the dispute.%' then
      raise exception 'FAIL P6: wrong direct exploit-B refusal: %.', v_msg;
    end if;
  end;
end
$p6_direct$;
set local role service_role;
do $p6_rpc$
declare v_msg text;
begin
  begin
    perform public.research_admin_update_product_variant(
      'f2300000-0000-4000-8000-000000000001',
      'f2300000-0000-4000-8000-000000000012',
      '{"sku":"PR230-ESCAPE-RPC","catalogNumber":"PR230-ESCAPE-RPC"}'::jsonb,
      'pr230-verifier','2026-08-01T12:00:00Z'
    );
    raise exception 'FAIL P6: service-role exploit B succeeded.';
  exception when check_violation then
    get stacked diagnostics v_msg = message_text;
    if v_msg not like 'research product variant refused: variant_strength_disputed:%renaming the unit is not resolving the dispute.%' then
      raise exception 'FAIL P6: wrong RPC exploit-B refusal: %.', v_msg;
    end if;
  end;
end
$p6_rpc$;
reset role;
do $p6_post$
declare v_reason text;
begin
  if not exists (
    select 1 from public.research_product_variants v
    join pr230_subjects s on s.disputed_variant_id=v.id
    where v.sku='PR230-DISPUTED-SYNTHETIC'
      and v.catalog_number=s.disputed_registry_sku
      and v.strength=s.disputed_strength
  ) then
    raise exception 'FAIL P6: denied exploit B changed disputed identity.';
  end if;
  v_reason := public.research_variant_strength_dispute_reason(
    'f2300000-0000-4000-8000-000000000001',
    'f2300000-0000-4000-8000-000000000012'
  );
  if v_reason is null or v_reason not like 'variant_strength_disputed:%' then
    raise exception 'FAIL P6: read dispute disappeared after denied rename.';
  end if;
  raise notice 'PASS P6: direct and service-role exploit B refused; read dispute remains.';
end
$p6_post$;

\echo '=== P7 lifecycle-only RPC remains available ==='
set local role service_role;
select public.research_admin_update_product_variant(
  'f2300000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000012',
  '{"status":"archived","active":false}'::jsonb,
  'pr230-verifier','2026-08-01T12:00:00Z'
);
reset role;
do $p7$
begin
  if not exists (
    select 1 from public.research_product_variants v
    join pr230_subjects s on s.disputed_variant_id=v.id
    where v.status='archived'
      and not v.active
      and v.sku='PR230-DISPUTED-SYNTHETIC'
      and v.catalog_number=s.disputed_registry_sku
      and v.strength=s.disputed_strength
  ) then
    raise exception 'FAIL P7: lifecycle-only RPC failed or changed identity.';
  end if;
  raise notice 'PASS P7: lifecycle-only update succeeded without identity drift.';
end
$p7$;

\echo '=== P8 undisputed variant update succeeds ==='
set local role service_role;
select public.research_admin_update_product_variant(
  'f2300000-0000-4000-8000-000000000001',
  'f2300000-0000-4000-8000-000000000011',
  '{"sortOrder":8}'::jsonb,
  'pr230-verifier','2026-08-01T12:00:00Z'
);
reset role;
do $p8$
begin
  if not exists (
    select 1 from public.research_product_variants
    where id='f2300000-0000-4000-8000-000000000011'
      and sort_order=8
      and sku='PR230-CLEAN-VARIANT'
      and catalog_number='PR230-CLEAN-CATALOG'
      and strength='1 unit'
  ) then
    raise exception 'FAIL P8: undisputed update failed or changed identity.';
  end if;
  if not exists (
    select 1 from public.research_product_prices p
    join pr230_subjects s on s.clean_price_id=p.id
    where p.status='active'
  ) then
    raise exception 'FAIL P8: undisputed update changed the clean active price.';
  end if;
  raise notice 'PASS P8: undisputed update succeeded without identity or price drift.';
end
$p8$;

rollback;

\echo '=== P13 rollback leaves zero durable mutation ==='
do $p13$
declare
  b pr230_verification_baseline%rowtype;
  v_products bigint;
  v_variants bigint;
  v_prices bigint;
  v_audits bigint;
begin
  select * into b from pr230_verification_baseline;
  select count(*) into v_products from public.research_products;
  select count(*) into v_variants from public.research_product_variants;
  select count(*) into v_prices from public.research_product_prices;
  select count(*) into v_audits from public.research_product_admin_audit;
  if row(v_products,v_variants,v_prices,v_audits)
     is distinct from row(b.products,b.variants,b.prices,b.audits) then
    raise exception
      'FAIL P13: business counts changed from (%,%,%,%) to (%,%,%,%).',
      b.products,b.variants,b.prices,b.audits,
      v_products,v_variants,v_prices,v_audits;
  end if;
  if exists (
    select 1 from public.research_products
    where id='f2300000-0000-4000-8000-000000000001'
  ) then
    raise exception 'FAIL P13: synthetic product survived rollback.';
  end if;
  raise notice 'PASS P13: products/variants/prices/audits unchanged after rollback.';
end
$p13$;
drop table pg_temp.pr230_verification_baseline;
\echo '=== PR230 VERIFICATION COMPLETE: ALL PROBES PASS ==='
\endif
