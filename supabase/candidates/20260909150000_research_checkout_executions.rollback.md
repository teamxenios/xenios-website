# Durable checkout executions: recovery procedure (prepares, authorizes nothing)

This candidate is additive: two service-role-only tables, one trigger and four
transition functions. It creates no rows, seeds nothing and changes no existing
table, policy or grant. It is not registered in the migration DAG or the
managed ledger until it has been rehearsed twice on the authorized staging
project with its exact precheck and postcheck.

## Before applying (staging first, production only under exact release authority)

- Freeze the application SHA and the LF SHA-256 of the candidate and its checks.
- Run the precheck read-only with a stop-on-error executor bound to the
  explicitly approved project. Any pre-existing execution or inbox object stops.
- Apply the exact candidate in one transaction. Apply it a second time on the
  rehearsal database to prove idempotence (`create ... if not exists`,
  `create or replace`, `drop trigger if exists`).
- Run the postcheck read-only. Zero rows, RLS enabled and forced, no policies,
  no public-role privileges, no service-role DELETE, functions executable by
  service_role only.

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
`capturedAmountCents` = 0 evidence.

## Failed or uncertain migration

Stop. Re-read migration history, the two tables, the trigger and the four
functions before any retry. A connector timeout is neither success nor failure.

## Rollback strategy: retain additive schema and history

Do not drop the tables: executions and inbox rows are payment evidence. To
retire the feature, keep the composition disabled (the provider resolver still
returns Disabled) and revoke EXECUTE on the four functions from service_role.
Never delete inbox rows; never edit an execution's identity columns (the
trigger refuses).
