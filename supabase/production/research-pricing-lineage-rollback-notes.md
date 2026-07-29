# Research pricing lineage rollback

## Release identity

- Task: XCA-W2-PRICING-DB (isolated database lane).
- Branch: `claude/xca-20260729T0302Z/pricing-db`.
- Exact source base (START_SHA):
  `2891dcb9ded41e6007f636bf053cd090dcd16111`.
- Managed migration candidate:
  `supabase/migrations/20260729000000_research_pricing_lineage.sql`.
- Verification pair:
  `supabase/verification/research-pricing-lineage-disposable-bootstrap.sql`
  plus `supabase/verification/research-pricing-lineage.verify.sql`.
- Verified 2026-07-29 on a disposable local `postgres:16` Docker container
  (never a remote or production database): bootstrap applied the exact repo
  migrations `20260726143000` and `20260726214500`, then the verifier passed
  all eight sections, twice, on two fresh databases. Integration, merge,
  production apply, and managed-application identities are recorded only
  after release-manager acceptance.

## What the candidate does

Additive order-line price provenance. When `public.research_order_lines`
exists (it is created by `supabase/production/research-track-b-commerce.sql`,
MIGRATIONS.md order 22, PENDING in production), the candidate adds six
nullable columns (`price_id`, `price_version`, `audience`,
`unit_amount_cents`, `currency`, `priced_at`), five CHECK constraints
(positive amount, positive version, USD-only currency, transactable-audience
subset excluding `compare_at`, and an all-or-nothing snapshot coherence
check), and one partial reconciliation index
(`research_order_lines_price_idx` on `price_id where price_id is not null`).
When the table is absent, the candidate is a recorded NOTICE no-op. It
creates no table, no function, no trigger, no grant change, and rewrites
zero rows; the all-null legacy row (including the application's current
`lineTotalCents ?? -1` sentinel path in
`server/research/commerce/production-deps.ts`) remains valid.

Deliberately no foreign key from `research_order_lines.price_id` to
`research_product_prices`: the Track B production script and the managed
Product Control migration are independently owned and can be applied in
either order or alone, so a hard FK could make one of them unappliable. The
authority table's immutable-history trigger already blocks DELETE where it
exists, so a captured `price_id` cannot dangle there; the verifier proves
that substrate (one-active-price partial unique index, forced RLS with
browser denial and SELECT-only `service_role`, and the immutable-history
trigger) instead.

## Sequencing (release manager)

- This candidate MUST be sequenced after the migrations owned by other
  writers: `20260727200000`, `20260728010000`, and `20260728020000`. Its
  timestamp `20260729000000` already sorts after them; do not renumber it
  ahead of them and do not apply it before they are resolved.
- `supabase/MIGRATIONS.md` is leased to another writer, so this candidate
  adds no ledger row itself. Proposed entry text for whoever integrates the
  ledger (next free order number NN after the rows above):

  `| NN | migrations/20260729000000_research_pricing_lineage.sql | Additive order-line price provenance snapshot (price id/version/audience/amount/currency/priced-at) with all-or-nothing coherence CHECKs and a partial reconciliation index; guarded no-op until the Track B order tables exist | PENDING (not run) | — | supabase/verification/research-pricing-lineage.verify.sql on a disposable PostgreSQL |`

- If the candidate is applied before
  `supabase/production/research-track-b-commerce.sql`, it no-ops with a
  NOTICE. Re-run the exact same file after the Track B script creates
  `research_order_lines`; it is idempotent in both branches.

## Routine recovery

The migration is additive and idempotent. If application is interrupted,
re-run only the exact reviewed candidate file; every column, constraint, and
index statement is existence-guarded. Do not edit the file, do not add a
policy or grant to compensate, and do not create a parallel price table: the
pricing authority remains `public.research_product_prices` under its
existing forced-RLS, command-only write posture.

Forward repair, if a bad lineage row is ever written by the application: the
snapshot columns are ordinary nullable columns on `research_order_lines`
(no append-only trigger of their own), so a reviewed data correction may
null out all six columns together on the affected line. Correcting to a
different snapshot must set all six coherently or the
`research_order_lines_price_snapshot_coherent` CHECK rejects it. Never
"repair" by relaxing a CHECK, and never mutate `research_product_prices`
itself (its economic history is immutable by trigger and must stay so).

## Production invariants

- The candidate creates no product, variant, price, media, audit, order,
  order-line, cart, payment, or role record. Zero rows are inserted,
  updated, or deleted.
- Every existing `research_order_lines` row remains valid: all five CHECKs
  admit the all-null snapshot, so constraint validation cannot fail on
  legacy data.
- `research_product_prices` posture is untouched: RLS forced, zero
  policies, zero browser grants, `service_role` SELECT-only, writes only
  through the reviewed SECURITY DEFINER commands, economic history
  immutable.
- A partially populated snapshot (any strict subset of the six columns) is
  unrepresentable after this migration.
- `audience` on a line snapshot is a strict subset of the price-table
  audiences: `compare_at` can never be recorded as a transacted price.

## Destructive rollback (exact down-migration)

Dropping the lineage columns discards captured provenance and is not a
routine rollback. It requires an explicit destructive-data decision,
verified exports of any rows where `price_id is not null`, exact count
evidence, and separate review. Never use `CASCADE`. With that authority, the
exact down-migration is:

```sql
do $$
begin
  if to_regclass('public.research_order_lines') is null then
    raise notice 'research_pricing_lineage rollback: table absent; no-op';
    return;
  end if;

  drop index if exists public.research_order_lines_price_idx;

  alter table public.research_order_lines
    drop constraint if exists research_order_lines_price_snapshot_coherent,
    drop constraint if exists research_order_lines_priced_audience_check,
    drop constraint if exists research_order_lines_priced_currency_check,
    drop constraint if exists research_order_lines_priced_version_positive,
    drop constraint if exists research_order_lines_priced_amount_positive;

  alter table public.research_order_lines
    drop column if exists priced_at,
    drop column if exists currency,
    drop column if exists unit_amount_cents,
    drop column if exists audience,
    drop column if exists price_version,
    drop column if exists price_id;
end;
$$;
```

If only the application release regresses, restore the prior application
deployment and retain the inert additive schema; nullable columns that
nothing writes are harmless and preserve any provenance already captured.
