-- Xenios Research Early Access quantity band, one through twenty (M65).
--
-- WHY THIS MIGRATION EXISTS.
--
-- The round now accepts up to twenty units of one exact variant. Two deployed
-- CHECK constraints still cap a durable quantity at three:
--
--   public.research_early_access_cart_items.quantity          (M-cart-checkout)
--   public.research_early_access_cart_child_releases.quantity (M-cart-completion)
--
-- Both were written inline as `quantity integer not null check (quantity
-- between 1 and 3)`, so Postgres named them itself. Until they are widened, a
-- checkout for four units is accepted by every layer of the application and
-- then rejected by the database at the last moment, which is the worst place to
-- discover it: the customer has already been quoted.
--
-- WHAT THIS MIGRATION MAY AND MAY NOT DO.
--
--   * It widens ONE constraint per table, on the `quantity` column only, from
--     1..3 to 1..20. The lower bound is unchanged: zero and negative stay
--     refused.
--   * It writes NO business row, settles nothing, releases nothing, and moves
--     no payment state.
--   * It preserves every existing row. The change is a strict widening, so
--     every quantity that satisfied 1..3 still satisfies 1..20 and the new
--     constraint is added VALIDATED without a rewrite of existing data.
--   * It touches NO other constraint. In particular
--     `research_early_access_cart_items` also carries
--     `subtotal_cents = unit_price_cents * quantity`, which mentions the same
--     column and must survive untouched, so this migration matches on the
--     constraint's exact BAND SHAPE rather than on the word "quantity".
--   * It widens no unrelated quantity. The inventory, reservation, supplier
--     operations and persistent-cart tables carry their own quantity
--     constraints and are deliberately not named here.
--   * It touches neither M61, M62, M63 nor M64, and changes no routine.
--
-- WHY IT MATCHES ON SHAPE RATHER THAN ON NAME.
--
-- The two constraints are auto-named, and an auto-generated name is a
-- deployment detail rather than a contract: it depends on column order and on
-- collision suffixes, and a table restored or rebuilt by a different route can
-- carry the same rule under a different name. So the preflight finds the
-- constraint by its normalized definition, refuses to proceed unless it finds
-- exactly one per table, and replaces it with an EXPLICITLY NAMED constraint so
-- every future migration can address it directly.
--
-- FAIL CLOSED:
--   * refuses to run if either table is absent;
--   * refuses to run if a table carries no quantity band, or more than one,
--     rather than guessing which to replace;
--   * refuses to run if any existing row already sits outside the new band,
--     which would mean the deployment is not the one this migration was
--     written against.
--
-- RE-RUNNABLE: a second apply finds the band already at 1..20 under its
-- canonical name and does nothing.
--
-- PG16 and PG17: uses only `pg_constraint`, `pg_get_constraintdef`, and
-- `alter table ... drop constraint / add constraint`, all unchanged across both.

begin;

do $m65$
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
        'M65 requires the accepted Early Access cart schema; public.% is absent', v_table
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
        and pg_get_constraintdef(con.oid) ~ 'quantity <= 20'
    ) then
      continue;
    end if;

    -- No row may already sit outside the band we are about to declare. A row
    -- that does means this is not the deployment this migration describes.
    execute format(
      'select count(*) from public.%I where quantity < 1 or quantity > 20', v_table
    ) into v_outside;
    if v_outside <> 0 then
      raise exception
        'M65 found % row(s) in public.% outside 1..20; refusing to declare a band the data contradicts',
        v_outside, v_table
        using errcode = '55000';
    end if;

    -- Find the existing band by its SHAPE. `subtotal_cents = unit_price_cents *
    -- quantity` mentions the column and must not match, which is why both
    -- bound comparisons are required.
    select count(*), min(con.conname)
    into v_matches, v_existing
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 3';

    if v_matches <> 1 then
      raise exception
        'M65 expected exactly one 1..3 quantity band on public.%, found %; refusing to guess',
        v_table, v_matches
        using errcode = '55000';
    end if;

    execute format('alter table public.%I drop constraint %I', v_table, v_existing);
    execute format(
      'alter table public.%I add constraint %I check (quantity >= 1 and quantity <= 20)',
      v_table, v_canonical
    );
  end loop;
end;
$m65$;

-- ---------------------------------------------------------------------------
-- Postcheck. Both bands are present, named, and exactly 1..20.
-- ---------------------------------------------------------------------------

do $m65_verify$
declare
  v_table text;
  v_bands integer;
begin
  foreach v_table in array array[
    'research_early_access_cart_items',
    'research_early_access_cart_child_releases'
  ] loop
    select count(*)
    into v_bands
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and con.conname = v_table || '_quantity_band'
      and pg_get_constraintdef(con.oid) ~ 'quantity >= 1'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 20';

    if v_bands <> 1 then
      raise exception 'M65 postcheck failed: public.% has % canonical quantity band(s)',
        v_table, v_bands
        using errcode = '55000';
    end if;

    -- And no 1..3 band survived anywhere on the table.
    select count(*)
    into v_bands
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = v_table
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ~ 'quantity <= 3';

    if v_bands <> 0 then
      raise exception 'M65 postcheck failed: public.% still carries a 1..3 quantity band', v_table
        using errcode = '55000';
    end if;
  end loop;
end;
$m65_verify$;

commit;
