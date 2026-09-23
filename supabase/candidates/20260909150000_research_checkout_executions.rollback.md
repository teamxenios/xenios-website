# Durable checkout executions: recovery procedure (prepares, authorizes nothing)

This candidate is additive: two service-role-only tables, two immutable
triggers, four checkout transition functions, two locked webhook-inbox RPCs,
and their trigger functions. It creates no rows, seeds nothing and changes no
pre-existing table, policy, or grant. It is not registered in the migration DAG
or the managed ledger until it has passed the authorized installation sequence
with its exact precheck and postcheck.

## Before applying (staging first, production only under exact release authority)

- Freeze the application SHA and the LF SHA-256 of the candidate and its checks.
- Run the precheck read-only with a stop-on-error executor bound to the
  explicitly approved project. Any pre-existing execution or inbox object stops.
- Apply the exact candidate in one transaction. Apply it a second time on the
  rehearsal database to prove idempotence (`create ... if not exists`,
  `create or replace`, `drop trigger if exists`).
- Run the postcheck read-only. Zero rows, RLS enabled and forced, no policies,
  no public-role privileges, and exact service-role ACLs: execution persistence
  has only its required SELECT/INSERT/UPDATE access, the inbox is SELECT-only,
  and writes occur through the guarded functions. DELETE, TRUNCATE, REFERENCES,
  and TRIGGER are denied.

## Rehearsal that must pass before any production request

Synthetic data only, on the rehearsal database: an order in `checkout_pending`
with a held reservation and applied store credit; then `claim` -> `record_provider`
(authorized) -> `claim` (capturing) -> `record_provider` (captured) ->
`commit_captured`. Assert one `payment_captured` order with the provider
reference and amounts, one finalized reservation, exactly one negative approved
ledger row for the order, one state event, execution `committed`. Repeat
`commit_captured` with the same version: it must return zero rows and change
nothing. Race two `claim` calls with the same expected version: exactly one
returns a row. Record a conflicting provider reference: zero rows. Verify
`commit_cancelled` releases the hold and cancels the order only with
`capturedAmountCents` = 0 evidence, and that a second call after settlement
returns the row unchanged.

Reservation completeness (each case is a separate synthetic execution in the
`captured` phase): a missing reservation id, a `released` reservation, a
duplicate id in `reservation_ids`, held quantities that differ from the order
lines, an order with lines but no reservations, and an already-`finalized`
reservation from an interrupted earlier commit. Every case except the last must
leave the order, reservations and ledger untouched and return the execution in
`reconciliation_required` with `local_commit_failure` set and the capture
evidence retained; the last must commit normally.

Identity: an UPDATE of `price_version`, `reservation_ids`, the operation keys,
the request digest or a set `authorization_first_attempted_at` must be refused
by the trigger. The first `claim` to `authorizing` stamps
`authorization_first_attempted_at`; later claims never move it.

## Failed or uncertain migration

Stop. Re-read migration history, the two tables, the trigger and the four
functions before any retry. A connector timeout is neither success nor failure.

## Rollback strategy: retain additive schema and history

Do not drop the tables: executions and inbox rows are payment evidence. To
retire the feature, keep the composition disabled (the provider resolver still
returns Disabled) and revoke EXECUTE on all four checkout transition functions
and both webhook-inbox RPCs from service_role. Keep the trigger functions
non-executable by service roles. Never delete or truncate inbox rows; never edit
an execution or receipt identity column (the triggers refuse).
