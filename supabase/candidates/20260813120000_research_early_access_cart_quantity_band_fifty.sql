-- Xenios Research Early Access quantity band, one through fifty (M66).
--
-- FOUNDER DECISION, 2026-08-13: normal order quantity is 1 through 50, and
-- there is no quantity based review threshold anywhere inside that band.
--
-- M65 widened the durable quantity band from 1..3 to 1..20 on exactly two
-- tables. This migration widens the same two, and only those two, from 1..20
-- to 1..50:
--
--   public.research_early_access_cart_items.quantity
--   public.research_early_access_cart_child_releases.quantity
--
-- WHAT THIS MIGRATION IS ENTITLED TO DO
--
--   * It widens ONE constraint per table, on the `quantity` column only. The
--     constraint M65 left behind is already canonically named
--     `<table>_quantity_band`, so this migration finds it by NAME and by SHAPE
--     rather than guessing.
--   * Widening only. Every quantity that satisfied 1..20 still satisfies 1..50,
--     so no existing row can be invalidated and no data is rewritten.
--   * It does NOT touch `subtotal_cents = unit_price_cents * quantity`. That
--     constraint mentions the same column and must not be matched, which is why
--     both bound comparisons are required in every lookup below.
--   * It widens no unrelated quantity. The inventory, reservation, supplier
--     operations and persistent-cart tables carry their own quantity semantics
--     and are deliberately untouched.
--
-- WHAT THIS MIGRATION REFUSES TO DO
--
--   * It refuses to run if a target table is absent, if it carries no 1..20
--     band, or if it carries more than one. A guess here would silently drop a
--     real constraint.
--   * It refuses if any row already sits outside 1..50, because that would mean
--     this is not the deployment this migration describes.
--   * It creates no row, releases no supplier order, enables no feature, and
--     changes no grant, policy or RLS setting.
--
-- IDEMPOTENT: applying it twice is a no-op on the second pass, by the same
-- already-widened check M65 used.
--
-- THIS FILE IS A MIGRATION CANDIDATE. It is NOT applied to production here.
-- Applying it is a controlled, founder-gated step, exactly as M65 was.

begin;

do $m66$
declare
  -- The two tables this migration is entitled to touch, and nothing else.
  v_targets constant text[] := array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ];
  v_table text;
  v_canonical text;
  v_existing text;
  v_matches integer;
  v_outside integer;
begin
  foreach v_table in array v_targets loop
    if to_regclass('public.' || v_table) is null then
      raise exception
        'M66 requires the accepted Early Access cart schema; public.% is absent', v_table
        using errcode = '55000';
    end if;

    v_canonical := v_table || '_quantity_band';

    -- Already widened by a previous apply. Nothing to do for this table.
    if exists (
      select 1
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
      where nsp.nspname = 'public'
        and rel.relname = v_table
        and con.conname = v_canonical
        and con.contype = 'c'
        and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
        and pg_get_constraintdef(con.oid) ~ 'quantity <= 50'
    ) then
      continue;
    end if;

    -- No row may already sit outside the band we are about to declare.
    execute format(
      'select count(*) from public.%I where quantity < 1 or quantity > 50', v_table
    ) into v_outside;
    if v_outside <> 0 then
      raise exception
        'M66 found % row(s) in public.% outside 1..50; refusing to declare a band the data contradicts',
        v_outside, v_table
        using errcode = '55000';
    end if;

    -- Find the M65 band by NAME and by SHAPE. Both bound comparisons are
    -- required so the subtotal constraint, which also mentions `quantity`,
    -- cannot match.
    select count(*), min(con.conname)
    into v_matches, v_existing
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 20';

    if v_matches <> 1 then
      raise exception
        'M66 expected exactly one 1..20 quantity band on public.%, found %; refusing to guess',
        v_table, v_matches
        using errcode = '55000';
    end if;

    execute format('alter table public.%I drop constraint %I', v_table, v_existing);
    execute format(
      'alter table public.%I add constraint %I check (quantity >= 1 and quantity <= 50)',
      v_table, v_canonical
    );
  end loop;
end;
$m66$;

commit;
