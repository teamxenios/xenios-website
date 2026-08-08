# Rollback notes: research_early_access_cart_completion

Migration: `supabase/migrations/20260808100000_research_early_access_cart_completion.sql`
State: **NOT applied to production.** The Early Access cart flag ships false.

## What it adds

Purely additive. Four tables, their indexes, and three SECURITY DEFINER
functions that complete the cart lifecycle after checkout:

| object | purpose |
|---|---|
| `research_early_access_cart_external_proofs` | named-admin external payment proof METADATA. Recording one is not payment. |
| `research_early_access_cart_receipts` | exactly one receipt per settled parent checkout |
| `research_early_access_cart_child_releases` | one release fact per child line, per supplier |
| `research_early_access_cart_supplier_outbox` | supplier-grouped dispatch rows |
| `research_early_access_record_cart_external_proof` | records proof metadata only |
| `research_early_access_commit_cart_settlement` | atomic settlement: parent paid, receipt, every child, every release |
| `research_early_access_cart_status` | customer-safe status projection |

No table is dropped, altered destructively, or renamed. No existing row is
rewritten.

## Dependencies, verified rather than assumed

**Depends on exactly one migration:** `20260807193000_research_early_access_cart_checkout`
(migration 58). Every object it references (`..._cart_checkouts`, `..._cart_items`,
`..._cart_invoices`, `..._cart_quotes`, `..._cart_events`, and the commit RPC)
is created there.

Two non-dependencies were checked explicitly because both were plausible:

- **The affiliate v2 migration.** Grepped: **zero** affiliate references. Its
  timestamp precedes migration 60, and timestamp order is not dependency
  order. Early Access cart activation does NOT require the affiliate platform
  migration, and the affiliate migration may remain pending indefinitely.
- **Migration 54 and its unit-hold RPC**, which production intentionally does
  not have. Grepped: the only occurrence of "hold" in the file is the comment
  disclaiming the dependency. Migration 54 must remain allowed to be absent,
  and Shape B exists to prove it.

## The rollback

**1. Leave the cart flag false. This one genuinely is the rollback.**

Unlike the affiliate note (which described a protection that did not exist),
`RESEARCH_EARLY_ACCESS_CART_ENABLED` has a real parser, a real composition
consumer in `register.ts`, and tests proving every cart door answers 404 as an
unmounted route when it is not exactly `"true"`. With the flag false, no code
path reads or writes any table in this migration.

**2. The F4 resolver is a second, independent stop.**

Even with the flag true, `resolveEarlyAccessCartStore` refuses to boot in
production unless a durable store is configured. A deployment cannot reach
these tables through an in-memory fallback, because that fallback no longer
exists outside test and development.

**3. Settlement cannot fire without a named human.**

`research_early_access_commit_cart_settlement` is only reachable from
`POST /api/admin/research/cart/:cartCheckoutNumber/confirm-payment`, which sits
behind the Supabase admin guard and refuses a blank or missing admin identity
with 401. Recording external proof metadata does not mark anything paid; it is
a separate function and a separate table, deliberately.

**4. Only if the schema itself must go**

Drop in reverse dependency order: `..._cart_supplier_outbox`,
`..._cart_child_releases`, `..._cart_receipts`, `..._cart_external_proofs`,
then the three functions. Do this ONLY if no settlement has occurred; a
settled checkout's receipt and release facts are financial records and must be
exported before any drop.

Because the migration is additive, retaining the schema with the flag false is
the preferred rollback and costs nothing.

## Apply-twice evidence

**PENDING at this commit.** `applyTwiceVerified` is `false` in the DAG and must
not be set true until both shapes have actually run:

- **Shape A**: full repository dependency chain, then migrations 58 and 60,
  applied twice.
- **Shape B (release critical)**: production-shaped schema with migration 54
  ABSENT, then 58 and 60, applied twice.

Shape B is the one that matters, because Shape A cannot prove independence
from a migration that Shape A applies.
