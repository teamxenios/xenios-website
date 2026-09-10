# Native finish continuation — durable recovery core locally qualified

Sole integration owner: codex-native-finish-20260910.
Worktree: C:/Users/sboad/projects/xenios-native-finish-20260910.
Branch: codex/xenios-native-finish-20260910.
Pushed application: 55b9a5048d624c92e84b6cc62e1d644026bf7f3c.
Application tree: 5ee3d4136caaea6a1a6697a049c3f4983dabac40.
Later evidence commits must not be substituted for this tested source identity.

Read docs/native-finish/RECOVERY_OPERATION_20260910.md for actual implementation,
acceptance, failures and receipt hashes. Main owns all source again; no worker
retains a write lease, heavy job or production authority. No managed database,
provider, notification or production mutation occurred.

Completed local core: disabled-by-default bounded operation, fenced durable
intent/outcome/cursor RPC over private idempotency namespaces, strict injected
SDK adapter, SQL pre/post/rollback contract, local SQL and contact harnesses.
Canonical financial authorities are unchanged. Persist before settlement;
resolve pending before discovery; atomically complete outcome and cursor;
never interpret a failed persistence acknowledgement as success.

Actual application qualification: 2,224 commerce/policy tests passed, three
skipped, zero failed. Typecheck/build passed. Independent exact-source review
accepted runtime and SQL. Main SQL/contact run: 66/66, with six explicit contact
cases; synthetic execution mapping/terminal signal, not real settlement.
Initial TypeScript narrowing failure and two cursor-reference test failures are
retained, with their correction and unchanged runtime identities documented.

Fresh ff3c496..55b9a50 strict scan passed: 87,242 added lines / 471 files;
106 reviewed fixture matches, zero unresolved secrets and zero bounded-name
matches. Approved V3 and 545c39e registry/context remain unchanged. Raw scan
output is restricted outside Git. Core protection passed. Do not relabel older
full-suite or browser results as this application; no new full suite was run.

Real local PG17.11 concurrency is independently accepted: 15 exact SQL inputs,
five scenarios, four server-observed lock barriers, three independent connections;
unchanged nine-table financial snapshot, four outcomes. Only the previously
absent local xenios_recovery_qa_20260910 database (OID17457) was created. The old
credit QA database was preserved. The exact task-owned cluster is STOPPED and
data retained; system ID7684016671943266632 at the known external runtime path.
Final read: one released control, fence2, no pending intent, four outcomes,
zero other clients. No reset, deletion or migration-history repair occurred.

The PG proof script refuses a nonempty database, so do not rerun it against
retained data. Main's initial Windows Start-Process -Wait wrapper waited for
server descendants and its late read failed after shutdown; separate direct
preflight/proof/postcheck/shutdown commands succeeded. No owned process remains.

## Next main-owned executable work

Implement the explicitly gated one-pass operational composition over the actual
canonical execution repository and executor.settleUnattended, plus a local
real-executor contact test. The new core is not yet an operational entry point
or scheduler. Do not merely wire the older sweep's optional record callback.
Avoid a notification-wrapped executor, receipt hook, normal checkout progression
or provider creation/capture capability. Preserve current grace windows and exact
project/environment/effect bindings; construction alone must do nothing.

Keep receipt queue reconciliation, checkout credit-policy/consent integration,
managed payment/browser qualification and remaining agreed native workflows in
scope after this bounded slice. Earlier receipt preview and credit concurrency
proofs retain their exact source identities; do not restart their work.

Connected qualification still needs working staging SQL and checkout-specific
approved synthetic/provider configuration/effects. The last supported staging
SQL call timed out despite ACTIVE_HEALTHY; do not infer restoration/auth failure
or reset staging. Recovery candidate installation, provider inspection/cancellation
and settlement effects require applicable reviewed authority. No old narrow GO
is permission for the new migration or payment effects. The full Xenios Health
goal remains ACTIVE and incomplete; take the next ready implementation.
