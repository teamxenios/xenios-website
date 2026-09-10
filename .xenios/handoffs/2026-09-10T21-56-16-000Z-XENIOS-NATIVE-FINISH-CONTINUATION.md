# Native finish continuation — strict managed projection closed

Sole integration owner: `codex-native-finish-20260910`.
Worktree `C:/Users/sboad/projects/xenios-native-finish-20260910`;
branch `codex/xenios-native-finish-20260910`.
Application `0aa488f36a5aae98999486e805210907d317f802`, tree
`a6a7f3e2a0bcce4ed91ca401fc50e7bdab62a5e4`. Later evidence commits do not
change this application identity. No worker retains a write lease or heavy job.

Read `docs/native-finish/RECOVERY_PROJECTION_20260910.md` for the actual
implementation, before/after failures, peer acceptance and receipt hashes.
Final broader tests: 1,905 passed, three skipped, zero failed; typecheck/build
pass. Independent reviewer accepted runtime LF f7830e67 and tests LF 67ad3c7d.
Main controlled all execution. No managed/provider/live proof is implied.

Post-commit ff3c496..0aa488f strict scan: exit 0, 84,980 added lines / 458 files,
106 exact reviewed synthetic matches, zero unresolved secrets and zero bounded
name matches. Existing approved V3 and 545c39e registry/context remain unchanged.
Strict receipt SHA-256:
`04bde97b336c57c2c4e4d9a1631ca67d6a4214ef2cea02c184668bbac5dc30da`.
Core protection passed with 28 hashes; receipt SHA-256:
`e519fec35f2472329e4c546806b0cd23eb5906b67055c23d8911f4a9e1e90a36`.
Receipts are `strict-scan-0aa488f.log` and `protection-0aa488f.log` under
`C:/Users/sboad/projects/xenios-native-finish-evidence-20260910/`.
Routes/server mount and SQL remain unchanged since their recorded checks.

Keep 545c39e receipt-preview qualification and 2604286 full-suite / PG17
concurrency evidence at their actual sources. Do not rerun unchanged SQL proofs
or relabel the older full suite as 0aa488f. The task-owned local PG cluster is
stopped with data retained. Do not restore/reset/delete it or staging.

## Next concrete main-owned implementation

Build the existing bounded unattended recovery operation: durable intent,
outcome and exact horizon/cursor checkpoint, then a one-pass entry point.
The strict read prerequisite is done. No general job/checkpoint authority was
found in tracked source. Existing `research_idempotency_keys` has a unique
(scope,key) namespace and JSONB result but its once() lacks fencing/CAS and can
leave abandoned null claims; do not use once() as a recovery checkpoint.
Review a narrow transactional namespace extension without changing financial
authority. Domain-restricted order/SLA/assisted audits are not generic stores.

Persist per-attempt intent before settlement: otherwise a crash after terminal
settlement removes the row from discovery before its operator outcome is saved.
Resolve unfinished intent by exact canonical execution identity; atomically
record sanitized outcome and the exact discovery cursor under a fenced lease.
Persist exhaustion explicitly. A record/checkpoint failure is a failed pass,
not ordinary successful completion. Preserve fixed horizon, microseconds,
grace periods and replay. Expose only executor.settleUnattended, never normal
payment progression, notifications or receipt ticking. Do not attach a timer
or invoke provider effects during implementation.

Preparation is within the existing build, not permission to apply a candidate
migration. Managed installation and provider inspection/cancellation/local
settlement effects require applicable reviewed authorization. Staging SQL still
times out on the last fresh supported connection despite ACTIVE_HEALTHY;
checkout-specific synthetic/provider configuration and effects remain external
requirements. No production, remote write, payment, message or activation
occurred. Overall Xenios Health goal stays active and incomplete.
