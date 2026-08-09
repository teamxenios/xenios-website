# Rollback notes: research_early_access_cart_duplicate_guard (migration 61)

## What this migration changes

Additive columns, one partial unique index, one replaced function, and seven
triggers. It creates no table and drops nothing. The only row it ever writes to
is the ONE historical duplicate named in its own text, and the only rows it
inserts are a single audit event for that disposition.

| Object | Kind | Reversible |
| --- | --- | --- |
| `disposition`, `superseded_by`, `disposition_actor`, `disposition_at` | added columns | yes, but see below |
| `research_ea_cart_checkout_disposition_check` | check constraint | yes |
| `research_early_access_cart_events_event_type_check` | replaced check constraint | yes |
| `research_ea_cart_checkout_active_quote_uidx` | partial unique index | yes, drop it |
| `research_early_access_commit_cart_checkout` | replaced function | yes, re-run migration 60 |
| `research_early_access_cart_refuse_superseded` + 5 insert triggers | new | yes, drop them |
| `research_early_access_cart_freeze_superseded` + 1 update trigger | new | yes, drop them |
| disposition of `XEC-063A962A0053A65324F21E7F` | one row UPDATE | NOT automatically, see below |

## The safe rollback

Dropping the invariant is safe and instant. It restores the pre-migration
behaviour, which is the behaviour that produced the duplicate, so this is a
stop-the-bleeding step and not a resting place:

```sql
drop index if exists public.research_ea_cart_checkout_active_quote_uidx;
drop trigger if exists research_ea_cart_proofs_refuse_superseded on public.research_early_access_cart_external_proofs;
drop trigger if exists research_ea_cart_settlements_refuse_superseded on public.research_early_access_cart_settlements;
drop trigger if exists research_ea_cart_releases_refuse_superseded on public.research_early_access_cart_child_releases;
drop trigger if exists research_ea_cart_receipts_refuse_superseded on public.research_early_access_cart_receipts;
drop trigger if exists research_ea_cart_outbox_refuse_superseded on public.research_early_access_cart_supplier_outbox;
drop trigger if exists research_ea_cart_checkout_freeze_superseded on public.research_early_access_cart_checkouts;
```

Then re-apply migration 60 to restore the previous `commit_cart_checkout`. That
file is byte-pinned, so this is a replay rather than an edit.

## What NOT to roll back

**Leave the columns in place and leave the disposition alone.** Dropping the
four columns would delete the only record of why
`XEC-063A962A0053A65324F21E7F` is not a real order, and the `checkout_superseded`
audit event would then point at a fact nothing else carries. The columns are
nullable and unused by any path when the triggers are gone, so retaining them
costs nothing.

If the disposition itself has to be undone, do it deliberately and in the open:

```sql
update public.research_early_access_cart_checkouts
   set disposition = null, superseded_by = null,
       disposition_actor = null, disposition_at = null
 where checkout_number = 'XEC-063A962A0053A65324F21E7F';
```

This will fail while `research_ea_cart_checkout_freeze_superseded` exists, which
is intended: reactivating a superseded order is not a routine operation. Drop
that trigger first, and expect the active-quote index to then refuse to exist,
because reactivating the row recreates the very collision the index forbids.

## Re-applying

The migration is idempotent. Applying it twice is verified on PostgreSQL 16 and
17 against the managed-Supabase shape, and the second pass writes no second
audit event, because the disposition block skips a row that is already
dispositioned.

On any database that has never held the founder's two orders, the remediation
block is a no-op and only the schema, index, function and triggers are created.

## What it refuses to do

The remediation aborts rather than guessing if the duplicate and the canonical
order disagree on quote, customer or intent, if either is no longer
`awaiting_payment`, or if the duplicate has acquired any settlement, receipt,
child release, supplier outbox or external proof row. A duplicate that has been
paid is not a duplicate anyone may quietly supersede. This is exercised in
`scripts/verify-early-access-cart-managed-supabase.sh`, which seeds a PAID
duplicate and requires the migration to fail.
