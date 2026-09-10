# Recovery operation recovery boundary

Candidate only; not applied to a managed project. Dependencies: canonical
idempotency/execution tables and reviewed recovery-discovery function.

Application recovery must disable the recovery entry point and stop its owned
worker before reverting code. Preserve pending control, immutable outcomes,
executions, orders, credit and reservation history. Let a lease expire without
resetting its owner/fence or deleting a pending intent. A compatible successor
must resolve that intent against canonical financial state before discovery.

This candidate changes no financial function or application flag. No automated
down migration, row cleanup or replay is authorized. Dropping the RPC or changing
state/storage/permissions requires a separate reviewed database recovery plan.
