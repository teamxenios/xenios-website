# M65 rollback notes: Early Access quantity band, one through twenty

Migration: `supabase/migrations/20260811120000_research_early_access_cart_quantity_band.sql`
Harness: `scripts/verify-m65-quantity-band.sh 16` and `... 17`
Verification suite: `supabase/verification/research-early-access-cart-quantity-band.verify.sql`

## What it changes

Exactly two CHECK constraints, both on a `quantity` column, both widened from
`1..3` to `1..20`:

| Table | Before | After |
|---|---|---|
| `public.research_early_access_cart_items` | auto-named inline `quantity between 1 and 3` | `research_early_access_cart_items_quantity_band` |
| `public.research_early_access_cart_child_releases` | auto-named inline `quantity between 1 and 3` | `research_early_access_cart_child_releases_quantity_band` |

It creates no table, column, index, trigger, type or routine, writes no row,
grants nothing, and revokes nothing. It touches no other constraint, including
`subtotal_cents = unit_price_cents * quantity`, which mentions the same column
and is matched around deliberately.

## Rollback strategy

**Ordered, not unconditional.** Narrowing the band back to `1..3` is safe only
while no durable row sits above three. Once a real checkout has been placed at,
say, twelve units, re-adding a `1..3` constraint FAILS at validation, and
forcing it with `NOT VALID` would leave the deployment holding rows its own
schema says are impossible.

So the rollback order is:

1. Withdraw the application half first (revert the lane, so the server refuses
   quantities above three again at `shared/research/early-access-quantity.ts`).
   Nothing new above three can then be created.
2. Confirm no durable row is above three:

   ```sql
   select count(*) from public.research_early_access_cart_items where quantity > 3;
   select count(*) from public.research_early_access_cart_child_releases where quantity > 3;
   ```

3. Only if BOTH are zero, narrow the constraints back:

   ```sql
   begin;
   alter table public.research_early_access_cart_items
     drop constraint research_early_access_cart_items_quantity_band;
   alter table public.research_early_access_cart_items
     add constraint research_early_access_cart_items_quantity_check
     check (quantity >= 1 and quantity <= 3);
   alter table public.research_early_access_cart_child_releases
     drop constraint research_early_access_cart_child_releases_quantity_band;
   alter table public.research_early_access_cart_child_releases
     add constraint research_early_access_cart_child_releases_quantity_check
     check (quantity >= 1 and quantity <= 3);
   commit;
   ```

If either count is non-zero, **do not narrow the constraint**. Leaving the band
at `1..20` while the application refuses above three is the safe divergence: the
database permits more than the product offers, which is the direction that
breaks nothing. A genuine reversal would need those orders resolved first, and
that is a founder decision about real customer orders, not a migration step.

**Rolling back destroys no data.** The migration widens a constraint and copies
no rows, so there is nothing to restore.

## Verification evidence

Applied twice on the managed-Supabase shape (pgcrypto in the `extensions`
schema, `public.digest` proven absent before anything is applied) on PostgreSQL
**16** and **17** with identical migration and verification bytes, via
`scripts/verify-m65-quantity-band.sh`.

Each run proves, in order:

- **the blocker is measured, not assumed** — before M65 both tables really do
  carry exactly one `quantity <= 3` band;
- **fail closed** — on a database without the cart schema, M65 refuses with its
  own SQLSTATE 55000 preflight error and leaves no constraint behind;
- **existing rows are preserved** — a real cart item seeded at the OLD ceiling
  (`quantity 3`, subtotal 3000, discount 600, payable 2400) is byte-identical
  after both applies, and the harness aborts if that seed did not land, so the
  "unchanged" assertions cannot pass vacuously over an empty table;
- **apply twice** — M65 applies at psql exit 0 and applies a second time at exit
  0, the second run finding the band already canonical and doing nothing;
- **behaviour** (14 assertions after each apply) — the canonical band exists and
  is named on both tables, no `1..3` band survives on either, the
  subtotal/unit-price/quantity identity and the unrelated `line_index` and
  `unit_price_cents` constraints all survive, the reservation quantity domain is
  NOT widened, a durable cart item of quantity 20 is accepted, quantity 21 is
  refused by the database, and a durable child release is accepted at 20 and
  refused at both 0 and 21;
- **scope** — the public relation count is unchanged, and every check constraint
  outside the two named tables is byte-identical before and after.

The behavioural fixtures run inside a transaction that is rolled back, because
`research_early_access_cart_child_releases` carries an append-only trigger and
its evidence rows cannot be deleted. Nothing the suite writes survives it.

The lower bound is exercised on the child-release table rather than on the item
table on purpose: a cart item of quantity 0 can never insert whatever the band
says, since the subtotal identity forces `subtotal_cents` to 0 and both
`discount_cents < subtotal_cents` and `payable_cents > 0` are then unsatisfiable.
A refusal there would prove nothing about the band.

## Production application

`appliedToProduction` stays `false` and `managedMigrationId` stays `PENDING`
until an authenticated production read confirms otherwise. Applying this to
production is a separate protected action that this change does not perform or
authorize.
