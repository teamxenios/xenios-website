-- Research pricing lineage: additive order-line price provenance.
--
-- Purpose. research_order_lines today records only unit_price_cents and
-- line_total_cents with no record of WHICH governed price produced them (the
-- application even writes a -1 sentinel lineTotalCents fallback when a line
-- total is unknown). This migration adds a nullable, all-or-nothing snapshot
-- of the exact Product Control price a line was priced from: the price row id,
-- its version, the audience it was published for, the unit amount, currency,
-- and the pricing instant. The authority table is the existing
-- public.research_product_prices (created by managed migration
-- 20260726143000, RLS forced, one active price per variant+audience,
-- append-only economic history). No new price table is created here.
--
-- Existence guard. research_orders/research_order_lines are created by
-- supabase/production/research-track-b-commerce.sql (MIGRATIONS.md order 22,
-- PENDING, commerce lane), not by a managed migration, so a target database
-- may or may not contain them. Following the Wave 3 reservation precedent of
-- guarded convergence with dormant Track B schema (20260727160000), the whole
-- migration runs inside one conditional DO block: when
-- public.research_order_lines is absent it is a recorded no-op (NOTICE) and
-- must be re-run after the Track B script creates the table; when present it
-- is additive and idempotent. plpgsql plans statements lazily, so the DDL
-- below is never parsed against a missing table.
--
-- Compatibility. Every new column is nullable and every CHECK admits the
-- all-null legacy row, so adding the constraints validates existing data
-- without rewriting a single row. Zero data rewrites, zero backfill.
--
-- Deliberately NO foreign key to research_product_prices. The Track B
-- production script can be applied to a database that has never run the
-- managed Product Control migration, so a hard FK would make two
-- independently owned scripts order-dependent and could leave one of them
-- unappliable. Where the authority table exists, its immutable-history
-- trigger already blocks DELETE, so a captured price_id cannot dangle; the
-- companion verifier (supabase/verification/research-pricing-lineage.verify.sql)
-- proves that substrate instead.

do $$
begin
  if to_regclass('public.research_order_lines') is null then
    raise notice
      'research_pricing_lineage: public.research_order_lines is absent; '
      'no-op. Re-run this migration after '
      'supabase/production/research-track-b-commerce.sql creates the table.';
    return;
  end if;

  alter table public.research_order_lines
    add column if not exists price_id uuid,
    add column if not exists price_version integer,
    add column if not exists audience text,
    add column if not exists unit_amount_cents bigint,
    add column if not exists currency text,
    add column if not exists priced_at timestamptz;

  -- A priced line snapshots a positive amount. Zero and negative amounts are
  -- unrepresentable as provenance; a free line is a legacy (all-null) line.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_order_lines_priced_amount_positive'
      and conrelid = 'public.research_order_lines'::regclass
  ) then
    alter table public.research_order_lines
      add constraint research_order_lines_priced_amount_positive
      check (unit_amount_cents is null or unit_amount_cents > 0);
  end if;

  -- Price history versions start at 1 (research_product_prices enforces
  -- version > 0); a snapshot cannot cite a version that cannot exist.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_order_lines_priced_version_positive'
      and conrelid = 'public.research_order_lines'::regclass
  ) then
    alter table public.research_order_lines
      add constraint research_order_lines_priced_version_positive
      check (price_version is null or price_version > 0);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'research_order_lines_priced_currency_check'
      and conrelid = 'public.research_order_lines'::regclass
  ) then
    alter table public.research_order_lines
      add constraint research_order_lines_priced_currency_check
      check (currency is null or currency in ('USD'));
  end if;

  -- Strict subset of the research_product_prices audience list: 'compare_at'
  -- is display marketing and can never be the price a member actually paid.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_order_lines_priced_audience_check'
      and conrelid = 'public.research_order_lines'::regclass
  ) then
    alter table public.research_order_lines
      add constraint research_order_lines_priced_audience_check
      check (
        audience is null
        or audience in ('retail', 'member', 'professional', 'wholesale')
      );
  end if;

  -- One honest snapshot or none. A partially recorded lineage (an amount with
  -- no price identity, or a price identity with no amount) is unrepresentable.
  if not exists (
    select 1 from pg_constraint
    where conname = 'research_order_lines_price_snapshot_coherent'
      and conrelid = 'public.research_order_lines'::regclass
  ) then
    alter table public.research_order_lines
      add constraint research_order_lines_price_snapshot_coherent
      check (
        (
          price_id is null
          and price_version is null
          and audience is null
          and unit_amount_cents is null
          and currency is null
          and priced_at is null
        )
        or (
          price_id is not null
          and price_version is not null
          and audience is not null
          and unit_amount_cents is not null
          and currency is not null
          and priced_at is not null
        )
      );
  end if;

  -- Reconciliation entry point: from a governed price row to every order line
  -- that captured it. Partial, so unpriced legacy lines cost nothing.
  create index if not exists research_order_lines_price_idx
    on public.research_order_lines (price_id)
    where price_id is not null;
end;
$$;
