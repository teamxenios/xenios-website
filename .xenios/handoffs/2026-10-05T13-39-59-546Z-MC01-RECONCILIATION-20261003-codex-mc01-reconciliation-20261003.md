# MC-01 exact-SHA handoff for independent Claude acceptance

SESSION ID: `codex-mc01-reconciliation-20261003`

ACCOUNT / MODEL: OpenAI Codex desktop / GPT-6; root integration with three
authorized disjoint workers. Internal reviews are not independent acceptance.

TASK: `MC01-RECONCILIATION-20261003` (execution sprint v2, session 02).

BRANCH: `codex/xenios-mc01-reconciliation-20261003`

WORKTREE: `C:/Users/sboad/.codex/worktrees/2227/xenios-website`

BASE SHA: `3eaa017fcbd28989c65ffc4bb439a554aa1f3f59`

CORE RUNTIME SHA: `c0e25c73a0d789829ea213e2ee040c68e06f0a75`

FINAL PUSHED SOURCE SHA: `ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`

SOURCE TREE: `f5953b8e148196c4ea71839cdd40a4e06b5f9fd1`

The source commit was verified on origin before this handoff. A separate
records-only descendant carries this handoff, final evidence and session state;
it does not change runtime, tests or SQL. Review the exact source SHA above.

HISTORICAL SOURCE / HANDOFF:
`f453d7e25ac3bdee4e42365d2b0b6a513b9e6da5` /
`b38db0ae2ee0c679ec2eeb31b324f6204669dfb7`.
The historical branch/worktree remain preserved. No historical branch merge,
blind cherry-pick or wholesale continuity import was performed.

## Completed

Media is optional presentation metadata across Product Control, catalog reads,
signing, server/browser projection, cart selections and persistent-cart writes.
Absent, rejected, malformed, ambiguous or unavailable images become null or
fallback without creating or removing commerce authority. Legacy media is
stripped before selection persistence and candidate SQL command/snapshot hashes.

The reserved image input key cannot affect commerce bindings, blocker counts
or snapshot identity even when its metadata is malformed. Three exact commerce
bindings remain: SKU, family and storage information. Product/variant identity,
price, audience, activation, readiness, inventory, COA/document and other
non-image refusal gates remain. Unknown non-image inputs cannot use the image
exemption. Other database/signing-adjacent failures remain strict where they
carry commerce authority.

The default private image bucket now agrees across upload, signing and URL
validation: `research-product-media-production`. Arbitrary bucket overrides
are not newly supported for customer display; they safely fall back. Hosted
bucket objects were not qualified or published.

The new SQL candidate and verifier were rederived against current Core with
exact predecessor fingerprints, governance invalidation, complete prerequisite
DAG closure, null/malformed contract negatives and real lifecycle RPC coverage.
See `RECONCILIATION.md` for the retained/rewritten/rejected historical-change
table, precise behavior and evidence provenance limits.

## Verified

| Check | Result |
| --- | --- |
| Affected integration tests | 4,177 passed, 17 skipped; 209 passing files and two skipped |
| Additional Product Control UI | 59 passed in one file |
| TypeScript | PASS, `tsc --noEmit` |
| Production build | PASS; existing mixed-import/chunk-size warnings retained |
| No em dash | PASS, 1,353 runtime source files and 226 built files |
| Migration DAG | PASS, 53 nodes and canonical checksums |
| SQL verifier syntax and exact-source checks | PASS |
| Disposable SQL proof | PASS, PostgreSQL 17.11 and Node 20.19.0 |
| Protection against current Core base | FAIL, inherited `server/static.ts` baseline hash mismatch; no new out-of-zone paths |
| Default protection against origin/main | FAIL, inherited outside-zone branch history plus same static hash mismatch |
| Diff whitespace | Source/edited records PASS; full staged records flag verbatim raw-log whitespace |

Raw logs and per-invocation JSON receipts are under `evidence/`. The full final
records diff flags original CRLF output, trailing space and blank log endings;
those exact bytes are preserved for their recorded hashes. Source and edited
records excluding only raw logs pass; see `evidence/diff-check-final.json`.
The affected
run used the final dirty source immediately before commit; its source hashes
match the pushed source. UI/typecheck/build/punctuation/DAG/protection used the
pushed source, with source hashes unchanged at their boundaries. SQL syntax and
source checks preceded later runtime/test edits; their candidate/verifier still
match exactly, as recorded in `evidence/final-boundary-verification.json`. This is a
scoped integration result, not a whole-repository suite or production proof.

The SQL proof ran while other runtime/test edits were still happening; its
receipt reports that fact. Candidate and verifier hashes themselves stayed
unchanged. The no-network/no-port disposable container and tmpfs database were
removed; container absence was checked again at handoff. No timing-sensitive
finance races ran in this lane. Core confirmed its heavy jobs were complete
before this lane's serial affected-test/typecheck/build window, and was notified
when that window ended.

The separate initial punctuation invocation omitted `--import tsx` and failed
before scanning. Both that receipt and the correctly launched passing retry are
retained. No failed result has been relabeled as a pass. The initial 89-test
development run is retained as early evidence, not final-state qualification.

## SQL and hosted state

CANDIDATE: `supabase/candidates/20261003_research_media_commerce_decoupling.sql`

CANONICAL LF SHA-256:
`365728cbc40a60ce3d5ffacbbbd09fd8d716c0413ddb1171565ed50563c9ffa4`

VERIFIER: `supabase/verification/research_media_commerce_decoupling_local.mjs`

VERIFIER CANONICAL LF SHA-256:
`f180b0bab0a4f94fff44dd3439a6689099a44a0fdc39e35a29ad6287189acdd9`

MIGRATION: source-only, unregistered, unapplied to managed systems. No DAG,
ledger or registered migration changed. The proof pins ten prerequisite files,
including the full six-node persistent-cart DAG closure, and exercises eight
image-input plus eight media RPC lifecycle states. All six replacement
functions require exact predecessor bodies/ownership/ACLs and private forced-RLS
boundaries. The candidate requires all four persistent-cart history tables to
be empty; nonzero history refuses unchanged. A second unregistered apply also
deliberately refuses predecessor drift. This is not an apply-twice pass.

Existing affected image-bearing readiness domains must be paused. Installation
invalidates and audits old approvals without enabling any domain. Fresh
canonical non-image manifest approval and a separate launch transition are
required. The rollback note preserves history and requires a reviewed
roll-forward after commit; it does not claim exact post-commit restoration.

Read-only hosted observations refreshed on 2026-10-05:

- Render still serves `79414143d4355d5d3d14cd5fe6e5a536dc68d99d`, deployment
  `dep-daqft3vf3r2c73b7e88g`; auto-deployment remains off.
- Newest managed migration remains `20260921172323`
  (`research_assisted_order_member_history_20260921`). Zero migration names
  match `media_commerce_decoupling`; this is not managed function-body proof.

PRODUCTION MUTATED: no. No deploy, migration registration/application, hosted
write, real payment/email or image publication. Runtime alone must not be
promoted against the legacy four-input persistent-cart SQL contract.

## Ownership and next task

LEASED PATHS: the exact file list is retained on task
`MC01-RECONCILIATION-20261003` in `.xenios/ACTIVE_TASKS.json` and its matching
ownership lease. It covers the shared contracts; catalog and cart adapters;
server catalog, selection, persistence and Product Control files/tests; two
existing admin optional-image notices; the dated candidate/verifier; this
evidence folder; and this session's continuity records. The lease is handed
off, the task is `qa`, and the session is `handoff_ready`. No worker remains
authorized to edit these paths under the completed assignment.

DIRTY STATE: only final evidence, collector-launch correction and continuity
records followed the pushed source; these are committed/pushed together in the
records successor. Verify a clean status and origin equality before continuing.
Ignored dependencies and local build outputs are not deployment artifacts.

FILES NOT TO DUPLICATE: canonical Auth/account, Product Control, catalog,
pricing, commerce, affiliate, supplier, notification, Care and audit systems.
No A/B/C shell or assisted-order presentation work belongs to this lane. Core
alone owns the protected baseline and shared release integration state.

BLOCKERS / LIMITS: independent Claude exact-SHA acceptance is pending; inherited
Core protection failures remain; managed migration qualification/registration/
apply and compatible runtime promotion need separate exact-action approval.
Existing cart history needs a separate reviewed preservation/adoption design.
This lane does not requalify inherited billing/activation boundaries or close
unrelated launch blockers.

NEXT EXACT TASK: independent Claude acceptance of source
`ed9bb9b456bb78994f4fcfedac6ac2112142a5b6`, using this handoff and receipts.
Reconcile any later Core changes through the designated integrator, not by
merging old MC-01 history. Do not deploy or apply/register SQL from this handoff.

NEXT FIRST COMMAND: `Get-Content -LiteralPath '.xenios/MASTER_CORPUS.md'`
Then complete the required continuity reading, verify Git/hosted truth, inspect
the exact source and register/claim an independent review lease before edits.

FOUNDER ACTION: route this exact-SHA package to independent Claude acceptance.
Claude has not been contacted or treated as having accepted this work. Any
later managed execution requires Samuel's current explicit approval for that
exact action after independent acceptance and fresh prechecks.
