# SESSION 03 finance release blockers v2: exact-source review handoff

[ACCOUNT SWITCH HANDOFF]

SESSION ID: `codex-finance-release-blockers-20261003`
ACCOUNT / MODEL: Codex / GPT-6 Astra
ROLE: Isolated finance specialist, not fleet integrator or production writer
TASK: `FINANCE-RELEASE-BLOCKERS-V2-20261003`
BRANCH: `codex/xenios-finance-release-blockers-20261003`
WORKTREE: `C:/Users/sboad/.codex/worktrees/3221/xenios-website`
BASE SHA: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`
INHERITED RUNTIME: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`
FINAL PUSHED SOURCE/EVIDENCE SHA: `b13c29ea6caa4b9715c295d45232e065511a85db`
SOURCE/EVIDENCE TREE: `07773360b38f4b3dcc563b972bf09f8852524e14`
TESTED SOURCE SHA: `dfd8b9b09815357d6c92f9c00eadf1782325269a`
TESTED SOURCE TREE: `d00442d29aa884125c62f8a92d58b971cf47cecd`
DIRTY STATE AT SOURCE/EVIDENCE PUSH: clean; this handoff and session transition follow in a continuity-only commit
SESSION EXIT STATE: `handoff_ready`; task `qa`; independent Claude acceptance pending
BACKGROUND WORK: all three delegated agents completed; all owned validation commands ended; both owned disposable databases removed and absence verified

## Completed source slice

Six requested read-only audits were completed in two waves, followed by disjoint
leased writers for SQL, the functional verifier, and the root's tests/evidence.

New candidate:
`supabase/candidates/20261003_research_assisted_order_provider_attribution.sql`
SHA256:
`507376b80280b6a0f84bea020dfe34d52ea684d24c2861ef743d277928a9b53d`.

It derives an immutable risk-attribution receipt from an original quarantined
journal row plus strictly prior exact payment/session bindings and bound create
results. No caller-selected target or payment assertion is accepted. Separate
empty/default-off source policies and actor grants govern commands. Request is
locked before provider fence, and grants are rechecked under lock. Receipt-backed
risk stops holding unrelated orders on the same source; the exact target stays
held. History, journal bytes/classification, money, audit and outbox rows remain
unchanged. A later fully specified event does not spread the attributed original
row's risk again; a changed-payload conflict remains unassigned risk.

Existing runtime, predecessor migrations, DAG, client, imagery, MC-01, protected
baselines and shared lead controls were not changed by this lane. The base already
contains a B2B test/DAG change relative to inherited runtime. No manifest re-cut.
The new candidate is not a registered migration and has no managed apply authority.

## Verification and limitations

- Source contract: 11/11 tests passed; unchanged SQL/test bytes in final source.
- First functional run FAILED before candidate application because a new verifier
  helper passed a boolean to an object-only JSON parser. Evidence retained. The
  verifier-only fix is committed in the tested source SHA above.
- Corrected disposable PostgreSQL 17.11 proof: PASS, 11 groups, 69 expected
  refusals, one reproduction of M94's same-source quarantine spread. Verified
  first/repeat application, original-row preservation, settled B eligibility
  recovery, pending C settlement, A held, changed events, scopes, actors,
  chronology, rollback, revocation, private ACLs, replica immutability, isolation
  admission and populated schema/ACL drift. No timing-sensitive races run.
- Focused assisted-order suite: PASS, 1,293 tests across 38 files.
- Full aggregate: FAILED, 19,078 pass / 2 fail / 85 skip; files 1,007 pass /
  16 fail / 6 skip. Fifteen suites failed collection with `ENOSPC`. Two inherited
  protected-baseline assertions fail for `server/static.ts` and composition seams.
  Those baselines remain untouched. Missing collection is not passing coverage.
- Inherited aggregate remains FAILED: 19,443 pass / 3 fail / 85 skip. Neither
  aggregate is replaced by separate passing diagnostics.
- Race driver guard: expected exit 2, DEFERRED, no database started.
- Controlled lock/race qualification: DEFERRED. Host samples show severe memory
  pressure/paging; later C: disk observation is 1,174.0 MiB free. The exact failing
  write path/capacity at ENOSPC was not captured. No timeout was relaxed.
- TYPECHECK / BUILD: not run for this source-only SQL slice.
- MIGRATION: source candidate only; no predecessor rewrite or managed application.
- PRODUCTION MUTATED: NO. No live provider authentication, money action or email.

Every run has exact arguments, source commit/tree, dirty state, source manifest,
stdout/stderr and hashes in
`server/research/assisted-order/finance-sprint-20261003/evidence/`.
All 25 indexed evidence files were byte-verified in the Git index. Raw logs retain
original CRLF and blank final lines. Source/documentation whitespace was checked
separately. Source manifests matched at run boundaries; no continuous filesystem
or host attestation is claimed. Changes during tests were only this lane's
continuity/report/evidence files, excluded from the tested source manifest.

## Blocker matrix and next work

| Blocker | Status | Remaining boundary |
| --- | --- | --- |
| F1 | OPEN | Actual independent authenticated manual source, finality, operational adapter and approved source-scoped provisioning. |
| Refund/void/partial refund/dispute/chargeback | OPEN | Distinct immutable adjustment authority and lifecycle; preserve original paid history/outbox. |
| ADP-G1 | PARTIAL | Candidate risk attribution only; early/unbound objects and full quarantine resolution remain open; acceptance/races pending. |
| ADP-G2 | OPEN | Safe no-dispatch retirement plus coordinated active-attempt replacement. Lease expiry alone is not proof of no provider effect. |
| ADP-G3 | OPEN | Exact evidence-backed recovery of interrupted/unknown execution, with original facts retained. |
| ADP-G4 | OPEN | Governed treatment of benign late facts and consequential post-settlement graph changes. |
| LENS-01 | PARTIAL detection / OPEN adoption | Preservation/no-send receipts and a reviewed install successor; do not bypass M88 predicates or delete legacy obligations. |

FOUNDER / EXTERNAL ACTION: provide a quiet or isolated machine with adequate disk
capacity for race qualification and full-suite rerun; select the genuine F1
source/workflow/finality and scoped grants; decide refund/dispute release policy;
provide LENS exact target/inventory, preservation disposition and worker shutdown
scope. Credentials and raw payment evidence must not enter the repository.
Managed application/deployment would require separate current explicit approval
for an independently qualified exact SHA. None is requested or authorized here.

NEXT EXACT TASK: independent Claude review of the pushed candidate and raw proof,
then controlled race qualification and aggregate rerun after environment repair.
Do not mark the source slice accepted or integrate it from this report alone.

NEXT FIRST COMMAND: read AGENTS.md / CLAUDE.md / the mandatory corpus and this
handoff, then run pinned Node on `scripts/agentic/xenios-os.mjs validate` and
inspect current Git/ownership truth. A continuing writer must register and claim
an exact lease before editing. Preserve existing dirty work and current fleet
state. Git and current production observations outrank this dated report.

FILES NOT TO DUPLICATE: the candidate, local/race verifiers, source-contract test,
and finance audit/evidence under the paths listed in this task's ACTIVE_TASKS
record. Reuse the canonical authorities and these receipts; no parallel payment
or outbox system. Detailed report:
`server/research/assisted-order/FINANCE_SPRINT_V2_20261003.md`.

LEASE TRANSITION: this task's exact paths move to `handoff`, with task `qa`.
Reconcile this branch's own session/task/lease records by ID only. Do not overwrite
the live fleet with this branch's historical registry. Core-owned PROJECT_STATE,
RELEASE_STATE, DECISIONS, BLOCKED_EXTERNAL and FOUNDER_ACTIONS were not edited;
the lane report records the findings for the integrator to reconcile.

Automatic approval review rejected attempted cross-chat coordination because
destination-specific authorization was not recognized. No messages were sent,
no alternate messaging path was used, and permission remains pending.

Production is NOT READY. Independent Claude acceptance is not claimed.
