-- Xenios Research Early Access quantity 1-100 release candidate (M66 successor).
--
-- DESIGN ONLY. This checked-in candidate does not authorize application. It is
-- the third and last link of the cart-band chain and must never be applied on
-- its own: as of 2026-08-20 the production database still carries the ORIGINAL
-- 1..3 band, because supabase/MIGRATIONS.md records BOTH predecessors as
-- pending. The exact order is M65 (1..3 -> 1..20), then M66 (1..20 -> 1..50),
-- then this (1..50 -> 1..100), each applied and verified in its own right.
--
-- Founder decision 2026-08-20: 100 units maximum per exact product variant by
-- default. This carries that decision into the two canonical durable bands:
--
--   public.research_early_access_cart_items.quantity
--   public.research_early_access_cart_child_releases.quantity
--
-- It is a strict WIDENING and nothing else, so it is additive and backward
-- compatible in the EXPAND -> MIGRATE -> ENABLE sense: every quantity the old
-- band accepted, the new band accepts. It creates no object, writes no business
-- row, changes no grant or routine, and does not touch the
-- `subtotal_cents = unit_price_cents * quantity` money identity. A second apply
-- is a no-op only when both exact 1..100 constraints are already present and
-- validated.
--
-- The assisted-order lane is deliberately NOT part of this migration. Its
-- durable check (M71, research_assisted_order_lines_quantity_chk) validates each
-- line against the min/max band stored ON that line from the catalog authority,
-- so the same founder ceiling reaches it through the authority row alone, with
-- no schema change and with every historical line keeping the band it was
-- accepted under.

begin;
set local lock_timeout = '5s';

do $m66s$
declare
  v_targets constant text[] := array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ];
  v_table text;
  v_constraint text;
  v_expr text;
  v_band_count integer;
  v_outside integer;
begin
  foreach v_table in array v_targets loop
    if to_regclass('public.' || v_table) is null then
      raise exception 'M66 successor requires canonical M65; public.% is absent', v_table
        using errcode = '55000';
    end if;

    v_constraint := v_table || '_quantity_band';

    select
      regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
    into v_expr
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and con.convalidated
      and con.conname = v_constraint;

    if v_expr is null then
      raise exception 'M66 successor requires the validated named constraint % on public.% (apply M65 and M66 first)',
        v_constraint, v_table using errcode = '55000';
    end if;

    -- Refuse any second range check involving quantity. The cart-items table
    -- legitimately also carries `subtotal = unit_price * quantity`; it is not
    -- range-shaped and therefore is deliberately not counted here.
    select count(*)
    into v_band_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        ~ '(quantity(>=|>|<=|<)|([0-9]+)(>=|>|<=|<)quantity)';
    if v_band_count <> 1 then
      raise exception 'M66 successor found % quantity range constraints on public.%; expected exactly one',
        v_band_count, v_table using errcode = '55000';
    end if;

    -- Re-entry is accepted only for the exact end state.
    if v_expr = '((quantity>=1)AND(quantity<=100))' then
      continue;
    end if;

    -- Every first application must start at the exact accepted M66 state. A
    -- database still at 1..3 or 1..20 is NOT silently upgraded here: it is told
    -- which predecessor is missing, because skipping M65 would leave the two
    -- constraints auto-named and a later migration unable to address them.
    if v_expr <> '((quantity>=1)AND(quantity<=50))' then
      raise exception 'M66 successor expected the exact M66 1..50 band on public.%, found % (apply the M65 -> M66 chain first)',
        v_table, v_expr using errcode = '55000';
    end if;

    execute format(
      'select count(*) from public.%I where quantity < 1 or quantity > 100',
      v_table
    ) into v_outside;
    if v_outside <> 0 then
      raise exception 'M66 successor found % row(s) outside 1..100 on public.%',
        v_outside, v_table using errcode = '55000';
    end if;

    execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
    execute format(
      'alter table public.%I add constraint %I check (quantity >= 1 and quantity <= 100)',
      v_table, v_constraint
    );
  end loop;
end;
$m66s$;

-- Transactional postcondition. A half-migrated state rolls the whole apply back.
do $m66s_postcheck$
declare
  v_table text;
  v_expr text;
  v_band_count integer;
begin
  foreach v_table in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ] loop
    select
      regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
    into v_expr
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and con.convalidated
      and con.conname = v_table || '_quantity_band';

    if v_expr is distinct from '((quantity>=1)AND(quantity<=100))' then
      raise exception 'M66 successor postcheck failed for public.%: %', v_table, v_expr
        using errcode = '55000';
    end if;

    select count(*)
    into v_band_count
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        ~ '(quantity(>=|>|<=|<)|([0-9]+)(>=|>|<=|<)quantity)';
    if v_band_count <> 1 then
      raise exception 'M66 successor postcheck found % quantity range constraints on public.%',
        v_band_count, v_table using errcode = '55000';
    end if;
  end loop;
end;
$m66s_postcheck$;

commit;
