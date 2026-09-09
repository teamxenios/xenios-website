# Durable checkout executions: the executable rehearsal (A runs it; Fable prepared it)

Candidate: `supabase/candidates/20260909150000_research_checkout_executions.sql`
(unchanged since `c70b77e1568d77465aeb23aad662ff7aa28916f8`; verify the LF SHA-256 you
apply and record it in the receipt). Companion files: `.precheck.sql`,
`.postcheck.sql`, `.rehearsal.sql` (this package), `.rollback.md`.

Nothing here has been executed anywhere by Fable: there is no local PostgreSQL
and the managed projects are A's. This runbook is the exact sequence; the
receipt is A's actual output.

## 0. Scope to confirm ONCE before any managed write

The Resource Hub staging authorization (project `tetynodzrtmdbuzgboro`) was
granted for the Resource Hub candidate. This candidate has different write
effects on the shared staging project: two new service-role-only tables, one
trigger, four functions. If the standing authorization does not name the
checkout-executions candidate, the exact missing scope is: **founder
confirmation that `20260909150000_research_checkout_executions.sql` may be
installed on the authorized staging project.** Nothing else is missing for the
rehearsal; a throwaway rehearsal database (a fresh branch/database with the
canonical order, reservation and ledger tables) needs no additional scope.

## 1. Where each step runs

| Step | Throwaway rehearsal DB | Shared staging |
| --- | --- | --- |
| precheck (read-only) | yes | yes |
| apply candidate | yes | yes, once, under the confirmed scope |
| apply candidate AGAIN (rerun behaviour) | yes | **no** (never replay on shared data) |
| postcheck (read-only) | yes | yes |
| rehearsal.sql (ends in ROLLBACK) | yes | yes (it persists nothing) |
| two-session concurrency probe | yes | no |

The rehearsal script inserts synthetic rows for two fixed synthetic member
uuids (`…00f1`, `…00f2`) inside one transaction and rolls back. It reads no
customer rows. It aborts on the first failed expectation with the case name.

## 2. Commands (migration executor role; stop on error)

```bash
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/candidates/20260909150000_research_checkout_executions.precheck.sql
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/candidates/20260909150000_research_checkout_executions.sql
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/candidates/20260909150000_research_checkout_executions.postcheck.sql
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/candidates/20260909150000_research_checkout_executions.rehearsal.sql
```

Throwaway database only, to prove the documented rerun behaviour
(`create … if not exists`, `create or replace`, `drop trigger if exists`)
without touching migration history anywhere shared:

```bash
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 --single-transaction -f supabase/candidates/20260909150000_research_checkout_executions.sql
psql "$REHEARSAL_DB_URL" -X -v ON_ERROR_STOP=1 -f supabase/candidates/20260909150000_research_checkout_executions.postcheck.sql
```

Expected: precheck prints `checkout executions precheck PASS` (first install
only; on a database that already has the objects it STOPS by design, run the
postcheck instead); postcheck prints `checkout executions postcheck PASS`
(zero rows, RLS forced, no policies, service_role without DELETE, functions
executable by service_role only); rehearsal prints
`checkout executions rehearsal PASS` and exits 0.

## 3. What the rehearsal asserts (and what it proves about the release)

1. Creation identity: UNIQUE (member, request key) refuses a duplicate
   submission; a paid phase without a reference is unrepresentable.
2. `claim`: version compare-and-swap (stale version returns zero rows); the
   first `authorizing` claim stamps `authorization_first_attempted_at`; an
   unclaimable phase raises.
3. `record_provider`: phase follows the evidence kind; the reference is
   learned once (a conflicting reference returns zero rows and changes
   nothing); an unknown kind raises.
4. Immutability trigger: `price_version`, `reservation_ids`, the first-attempt
   stamp, a learned `provider_reference` and the request digest cannot change.
5. `commit_captured`, one transaction: the canonical order becomes
   `payment_captured` with reference, authorized/captured amounts and the
   capture key; one `research_order_state_events` row; both reservations
   finalized; exactly one negative approved `manual_adjustment` store-credit
   row naming the order; the execution `committed`. Repeating with the same
   version returns the row unchanged; a stale version returns nothing; no
   second ledger row or event. Commit without capture evidence raises.
6. Reservation completeness (five separate executions in `captured`): a
   missing id, a released reservation, a quantity mismatch, and lines with no
   reservations each park the execution in `reconciliation_required` with
   `local_commit_failure` set, keep the capture evidence, and leave the order,
   reservations, events and ledger untouched; an already-finalized hold from an
   interrupted earlier commit commits normally.
7. Cancellation as two facts: settlement before the provider outcome raises;
   non-zero capture evidence cannot settle as cancelled; with zero-capture
   evidence `commit_cancelled` cancels the order (cancel key recorded), releases
   the hold, appends one state event and stamps `settled_at`; repeating returns
   the row unchanged (nothing released twice); a stale version returns nothing.
8. Webhook inbox: one receipt per (provider, event id); the same id again is
   refused; the row moves to `processed` with its execution; an unknown state
   is refused.
9. Member binding: another member's execution cannot commit this member's
   order (raises; order untouched).

What it does NOT prove: true two-session races (below), the application's
Supabase adapter over these functions (covered by the adapter's unit tests
against a fake client only), and anything about the real payment provider.

## 4. Two-session concurrency probe (throwaway DB)

Two `psql` sessions, one synthetic execution in phase `reserved` version 1
(insert it as in case 1 of the script, inside an explicit transaction you
COMMIT on the throwaway DB, then delete the synthetic rows afterwards by
member id `…00f1` in this order: inbox, executions, state events, lines,
reservations, ledger rows with actor_id = 'rehearsal', orders).

- Session 1: `begin; select id, phase, version from public.research_checkout_execution_claim('<exec>', 1, 'authorizing');` (do not commit yet)
- Session 2: `select id, phase, version from public.research_checkout_execution_claim('<exec>', 1, 'authorizing');` (blocks on the row lock)
- Session 1: `commit;`
- Expected: session 1 returns one row (version 2); session 2 returns zero rows
  once unblocked. Repeat the shape for `record_provider` with the same expected
  version: exactly one writer wins.

Shared inventory/credit concurrency for two executions of the same member
that both reach `commit_captured`: only the executions' own reservation ids
are finalized (the set is validated before any write), and the store-credit
spend row is keyed by the order, so two orders each spend once and never share
a row. Drive it with two throwaway orders and confirm two negative rows with
distinct `actor_id`.

## 5. Receipt A records (no secrets, no customer data)

- Database identity (project ref or "throwaway <name>") and the executor role.
- Application SHA and the candidate's LF SHA-256.
- The three PASS notices verbatim and the exit statuses.
- For the shared staging apply: the migration history entry written, and the
  DAG/ledger registration commit.

Without this receipt the SQL remains "unexecuted"; Fable will not describe it
otherwise.
