-- Xenios Research Early Access quantity 1-50 release candidate (M66).
--
-- DESIGN ONLY. This checked-in candidate does not authorize application. The
-- accepted production release authority remains 1-20, and M66 must not be
-- applied until the exact release chain is separately approved.
--
-- M66 is a strict widening of the two canonical bands installed by M65:
--
--   public.research_early_access_cart_items.quantity
--   public.research_early_access_cart_child_releases.quantity
--
-- It changes 1..20 to 1..50 and nothing else. It creates no object, writes no
-- business row, changes no grant or routine, and does not touch the subtotal
-- identity. A second apply is a no-op only when both exact 1..50 constraints
-- are already present and validated.

begin;
set local lock_timeout = '5s';

do $m66$
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
      raise exception 'M66 requires canonical M65; public.% is absent', v_table
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
      raise exception 'M66 requires validated canonical constraint % on public.%',
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
      raise exception 'M66 found % quantity range constraints on public.%; expected exactly one',
        v_band_count, v_table using errcode = '55000';
    end if;

    -- Re-entry is accepted only for the exact M66 end state.
    if v_expr = '((quantity>=1)AND(quantity<=50))' then
      continue;
    end if;

    -- Every first application must start at the exact accepted M65 state.
    if v_expr <> '((quantity>=1)AND(quantity<=20))' then
      raise exception 'M66 expected exact M65 1..20 band on public.%, found %',
        v_table, v_expr using errcode = '55000';
    end if;

    execute format(
      'select count(*) from public.%I where quantity < 1 or quantity > 50',
      v_table
    ) into v_outside;
    if v_outside <> 0 then
      raise exception 'M66 found % row(s) outside 1..50 on public.%',
        v_outside, v_table using errcode = '55000';
    end if;

    execute format('alter table public.%I drop constraint %I', v_table, v_constraint);
    execute format(
      'alter table public.%I add constraint %I check (quantity >= 1 and quantity <= 50)',
      v_table, v_constraint
    );
  end loop;
end;
$m66$;

-- Transactional postcondition. A half-migrated state rolls the whole apply back.
do $m66_postcheck$
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

    if v_expr is distinct from '((quantity>=1)AND(quantity<=50))' then
      raise exception 'M66 postcheck failed for public.%: %', v_table, v_expr
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
      raise exception 'M66 postcheck found % quantity range constraints on public.%',
        v_band_count, v_table using errcode = '55000';
    end if;
  end loop;

  if not exists (
    select 1
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'research_early_access_cart_items'
      and con.contype = 'c'
      and regexp_replace(pg_get_expr(con.conbin, con.conrelid), '\s+', '', 'g')
        = '(subtotal_cents=(unit_price_cents*quantity))'
  ) then
    raise exception 'M66 postcheck: subtotal = unit price * quantity identity is absent'
      using errcode = '55000';
  end if;
end;
$m66_postcheck$;

commit;
