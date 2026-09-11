# Claude recovery of Codex's interrupted native finish

Writer during recovery: `fable-durable-payment-20260909` (Claude), sole active
writer in this worktree from 2026-09-11. Ownership returns to Codex when it
resumes; nobody else should write here until that handover is explicit.

## Exact source

| | |
|---|---|
| Worktree | `C:/Users/sboad/projects/xenios-native-finish-20260910` |
| Branch | `codex/xenios-native-finish-20260910` |
| Commit | `0362b7dbbd388ce1fea7be82da2f6ae27e07dff4` |
| Tree | `06396d9bca3b3b0f7e9fbc9e6c411549232ac986` |
| Remote | equal to local by `rev-parse` after push |

The branch everyone had been citing, `codex/xenios-seth-revenue-launch-20260905`
at `27f84b2`, is stale. Codex moved to this branch and added 25 commits.

## What was recovered

Codex stopped with 21 modified files and 2 untracked tests, nothing staged, no
git operation in progress, and no build or test process running. Before any
edit that work was snapshotted byte-exact, with a sha256 manifest, to:

`C:/Users/sboad/xenios-recovery/codex-native-finish-20260911T045043Z`

The patch there reverse-applies to the pre-recovery tree. It is outside Git and
access-restricted to the local user.

## What was incorporated

One commit, `0362b7d`: Codex's consent continuation, unchanged except one test
fixture. It is exactly the task Codex's own 01:28Z handoff named next.

- The existing policy is named, not changed: `all-available-items-v1`, meaning
  all available credit, capped at the item subtotal, shipping excluded.
- The cart, the assisted door's payment-method gate, the durable door and the
  shipping quote all derive credit from the one shared helper. The assisted
  door no longer reads the client's credit figure at all.
- A new durable card intent must present server-issued consent binding the
  policy, the payable and the credit applied. Exact-key replay is still
  answered before that check.

## What was deliberately NOT incorporated

My `f8f6a4b` (harness contact-surface fixes). Codex's tree already fixes every
one of those defects independently, several more strictly, so porting it would
only create conflicts. Checked one by one: webhook amount fields, the
`payment_reference` column with an explicit column list, the complete request
seed, refusal of payload-less success, exact-byte redelivery, and both runner
false-pass fixes.

## Results

All on `0362b7d`, pinned Node 20.19.0, host otherwise idle.

| Check | Result |
|---|---|
| Typecheck, interrupted tree before any edit | clean |
| Focused, before the fixture fix | 537 passed, **1 failed** (the fixture noted above) |
| Focused, after | 15 files, 706 passed, 0 failed |
| Full suite, `--maxWorkers=2`, first attempt | 945 files, 17643 passed, 59 skipped, 0 failed, exit 0 |
| Build, `node script/build.mjs` | exit 0, client and server built; existing chunk-size advisory only |

Logs with hashes: `C:/Users/sboad/xenios-recovery/codex-native-finish-20260911T045043Z/evidence/`.

Hosted evidence obtained: none. No managed database, provider, browser, email
or deployment was touched.

## Still open

| Item | Blocked on |
|---|---|
| Operational caller for the recovery pass | An authority source. The pass requires freshly verified project, application SHA, approval digest, validity window and effect scope, and refuses an echoed context. No recovery approval exists, so no caller was written. |
| Receipt queue mode | A reviewed receipt identity policy, an approved cutoff and audience, and the committed-receipt reader. Preview exists and is read-only. |
| Managed payment and browser qualification | Mounted staging, installed schema, test-mode keys, synthetic members, and a decision to open the browser boundary for the provider. |

SQL candidates, none installed on any managed project:
`20260909150000_research_checkout_executions`,
`20260910120000_research_checkout_execution_recovery`,
`20260910201400_research_checkout_credit_reservations`,
`20260910220129_research_checkout_recovery_operation`.

## Release status

Deployed: no. Enabled: no. Live-verified: no. Nothing in this recovery touched a
database, a provider, a browser, an email, or a deployment.

## Next action for Codex

Resume in this worktree at `0362b7d`. The next main-owned slice, per the open
list above, is whichever prerequisite the founder resolves first. The full
Xenios Health goal remains active and incomplete.
