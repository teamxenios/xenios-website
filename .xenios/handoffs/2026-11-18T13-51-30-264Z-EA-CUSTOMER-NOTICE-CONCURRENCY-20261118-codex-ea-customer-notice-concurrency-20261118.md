# Customer-notice concurrency source handoff

Task: EA-CUSTOMER-NOTICE-CONCURRENCY-20261118. Registry: codex-ea-customer-notice-concurrency-20261118.
Isolated branch codex/ea-notice-concurrency-20261118; worktree C:/xenios-wt/ea-notice-concurrency-20261118.
Base52750b5cfc38bb2ceed7fc8b0c24b76e4a4495dd. Pushed source9409841e49387639247c5fc50d4859c6256c42b5, draft PR488.

Exactly two product files changed: the existing customer-notice migration and its PostgreSQL test. Shared metadata is mirrored but uncommitted; no other author files, ledgers, sender, outbox, runbook, API or framework changed.

## Correction

The notice INSERT now arbitrates all usable unique constraints while retaining both event_id primary key and request_id/revision uniqueness. A subsequent exact event lookup explicitly rejects absence or differing request/kind/revision/environment with23505 workflow_notice_identity_conflict. Default VOLATILE behavior is retained. Under READ COMMITTED the lookup takes a fresh query snapshot after a conflicting transaction commits. Serialization/higher-isolation failures are not converted to success. No table permission, role authority, actual event-time binding, callback atomicity, recipient or digest behavior changed.

Primary references checked: [PostgreSQL16 INSERT](https://www.postgresql.org/docs/16/sql-insert.html) and [function volatility](https://www.postgresql.org/docs/16/xfunc-volatility.html). Supabase current changelog reviewed; no relevant SDK/CLI change required. Existing unapplied migration path reused, no new migration filename invented.

## Meaningful verification

The original real simultaneous cold replay remains and increases from2 to8 independent calls. A second real PostgreSQL test opens two persistent independent fixture connections; it observes the actual pg_blocking_pids relationship, then checks competitor commit and rollback. Each leaves one intent and one outbox job. It asserts both actual unique constraints remain and all actual application roles still lack execute. A secondary-key-only wrong event is rejected, preserving its stored digest and creating no outbox job. The new login/grant exists only in the owned disposable fixture; no managed/app role grant.

Whitespace/diff and corpus validate: PASS. No local Docker, compiler, browser or tests launched because Root prohibited heavy jobs on this host.
Exact source9409841e49387639247c5fc50d4859c6256c42b5, hosted run44315087641 / test job134838956630: all five jobs PASS (test, typecheck, build, protection, Required CI completion). gh independently confirmed headSha9409841e49387639247c5fc50d4859c6256c42b5 and completed/success. Actual customer PostgreSQL qualification:2 passed,0 skipped; original cold8-way replay case2562ms and observed-blocking commit/rollback/secondary-conflict case1973ms. Full suite1092 files /19,462 tests passed,6 files /83 tests skipped,0 failures;380.10s. Front47, workflowPG1, recovery126 and focused179 also passed. Earlier e122 uses identical SQL; successor only constructs the synthetic readonly request DTO immutably.

## SQL provenance

Path supabase/migrations/20261118033449_early_access_request_customer_notices.sql.
Canonical Git blob233f9b15c9a9abf130970c192e3ca643c6a9abbb;11,531 bytes.
SHA-256852f1f76aeb70f0893a6e5b56424ea5629a4dace6fb4c0ba9374a65da799de75.

Root must independently review and re-pin row88, DAG, literal source fixture and rollback evidence to this source before composition/activation. Existing DAG compares HEAD bytes only when sourcePath is explicit; setting row88 sourcePath equal to path activates its existing current-byte mismatch check without changing the validator. Unchanged old5229 source record is not proof for these new SQL bytes even if broader tests pass.

No managed apply, configuration, provider, Auth, role grant, email or deployment action. Public release487 excluded this feature. Workflow and customer sender activation remain OFF. No native factory replacement or controller work.

## Root integration actions

1. Independently review the exact two-path source and test.
2. Merge/cherry-pick the accepted source into the current full workflow branch.
3. Re-pin row88 to source9409841e49387639247c5fc50d4859c6256c42b5, SQL SHA-256852f1f76aeb70f0893a6e5b56424ea5629a4dace6fb4c0ba9374a65da799de75 and the actual2-test receipt above. Update the literal source fixture.
4. Enable the existing current-file check by an explicit same-path sourcePath for row88 (or equivalently scoped verified guard), then qualify the exact composed source. Green488 does not establish correct old5229 provenance.
5. Keep managed migrations/configuration/roles/sender off pending separately qualified operational plan; no production action is authorized or performed by this worker.
