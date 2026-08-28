# [XENIOS HANDOFF] Client-account FINAL remediation recut v2 — 2026-08-27

SESSION: claude-fable-final-remediation-v2-20260827
ROLE: surgical final remediation (round 3)
WORKTREE: C:\Users\sboad\projects\xenios-client-account-final-remediation-v2-20260827
BRANCH: fix/xenios-client-account-final-remediation-v2-20260827
BASE FAILED SHA (DO NOT DEPLOY): 22396613a1d67aa2eed429fa012dcbf8e8e479a4
NEW RC SHA: the freeze commit at branch HEAD (verify against origin; code-final is its parent).
PRODUCTION MUTATED: NO — no deploy, no merge, no migration applied, no invitation, no email, 0 products activated.

## What this recut is

The second Codex adversarial review failed the previous recut with seven
remaining evidence-model P1s plus four P2s. All eleven are closed. The four
gates the review confirmed (P1-1 auth binding, P1-2 catalog guard, P1-8
migration privileges, P1-11 import integrity) are preserved and re-run. Full
disposition + release-scope declaration:
docs/research-launch/XENIOS_CLIENT_ACCOUNT_FINAL_REMEDIATION_V2_2026-08-27.md.

## Verification (authoritative toolchain: Node 20.19.0 / npm 10.8.2)

- typecheck (tsc --noEmit): PASS
- production build: PASS
- e2e (e2e/vitest.config.ts): 53/53 PASS
- full repository suite (authoritative `--no-file-parallelism` run):
  **737 files pass / 4 skipped · 10,749 tests pass / 43 intentionally skipped
  · 0 failed.** On PARALLEL runs one heavy filesystem-scanner test timed out
  (a DIFFERENT one each run — preview-harness.guard once, kris-launch-a
  access-presentation once), both untouched by this change and both green in
  isolation across repeated runs: pure parallel-load contention, which the
  sequential run eliminates. No newly skipped tests.
- route census / release control plane: 399/408 UNCHANGED.
- core-site protection incl. seam baselines: PASS (server/index.ts moved once,
  dated note; the P1-2/P1-10 notes from the prior recut carried forward).
- secret + PII scans (scripts/acceptance/scan-release-diff.mjs, whole
  integration diff 6a2df29..HEAD): 0 / 0, one printed partner-principal allowance.

## Browser QA (integrated preview harness, real production bundle)

- Account pages carry EXACTLY ONE `<main>` (P2-2); the assisted-order
  confirmation root is now `<section>` inside MinimalChrome's main — one main,
  no nesting (P2-4).
- Orders: "Some order history is currently unavailable. Order records from
  these sources are not fully connected: Early Access cart checkouts (XEC),
  assisted order requests (XRR)." — P1-B live.
- Overview: open-orders count renders "— count unavailable — order history
  incomplete" (never 0 over partial history); the headline is the outstanding
  action, not a false all-clear; billing shows "Current" via the canonical
  presentation.
- Care: the enrolled persona renders the 10-step timeline at Provider review;
  the P1-D "unavailable" path is pinned by the route-to-view contract test
  against the real component.
- Interactive targets on overview/orders/care/subscription: min 44px, zero
  under-size, no horizontal overflow (checked at 375; the prior recut's full
  1440→320 sweep is unchanged for these surfaces).

## Migration (P1-F) — corrected, rehearsed, UNAPPLIED

supabase/candidates/20260826_research_client_accounts_blitz.sql binds each
approval to an immutable server-computed evidence snapshot (sha256 +
row_version), re-verifies it on every queue/sent advance, freezes approved
staging evidence, makes the approval record immutable for all writers, and
aligns the check constraint with the trigger's one state machine.

The prior claims "v2 all-refused", "v1 18/18 refused", accepted-state success,
five-table/CASCADE rollback, and V2-7 success under the current schema are
withdrawn. The authoritative 2026-08-28 disposable result is:

- Exact counted map: 18 v1 historical rows + 12 v2 rows. V2-7 is additional,
  not counted. All 33 executable IDs are unique, mapped, and complete on both
  passes.
- Per pass, the broad structural suite records 37 refusals + 11 positives.
  The stable-ID narrative suite records 31 refusals + 2 positives: v1's 18
  rows use 19 executions (18 refusals + the `accepted`-unrepresentable
  assertion); counted v2 is V2-1 positive + 11 refusals; V2-7 adds two current
  refusals.
- A14 is no longer constructible because both CHECK vocabularies exclude
  `accepted`; its executable replacements assert that exclusion and refuse
  sent → queued. V2-7's historical success is superseded by revoked-terminal
  and immutable one-history rules; reapproval and a second history are both
  refused. The migration was not liberalized.
- The pinned image is
  `postgres@sha256:33f923b05f64ca54ac4401c01126a6b92afe839a0aa0a52bc5aeb5cc958e5f20`
  (RepoDigest = ID, linux/amd64), run with `--pull=never --network none`.
- Both applies produced the identical normalized logical-object delta across
  six tables, ten functions, six triggers, two identity sequences, six row
  types, all explicit/implicit indexes, constraints, policies, and helpers.
  The exact `P0001` in-place refusal left catalog/data unchanged; both
  explicit non-`CASCADE` rollbacks restored the exact baseline.
- Two complete runs exited 0 and produced the same logical-result SHA-256:
  `7b84af47bdcc99f471e5ef986b34e1e13347377686d75b0baa89b94a2eff1703`.

Rehearsed input SHA-256 values:

```text
da388c62bb7482622521db087ac8439bcea0ab1967e42221c68e1cf9fd608919  20260826_research_client_accounts_blitz.sql
a9aad83261a28beef3a86deed11def0a594f73c33aa8b11258a5db083f9e769b  20260826_research_client_accounts_blitz.attack-map.json
c4f5c4b46123f61ad399b66a2b27bc604aa4338d6b105a808c1188c678ba81b1  20260826_research_client_accounts_blitz.disposable-bootstrap.sql
00b3e6e46a4d994ad30061d6c6d536c75c1d1367c1c551c544cb53036533299a  20260826_research_client_accounts_blitz.capture-objects.sql
f1081726ac886a44b44eea14dd6d3fd0547cf2e2d7a518397fc2af33e15e9b0a  20260826_research_client_accounts_blitz.attacks.sql
c2f5e93b5b865c19cf98b4ed17389f7133a40abbf8ef758b6f9eca68ddeed377  20260826_research_client_accounts_blitz.narrative-attacks.sql
ff296b4786bc338d108b20bd03a89b183bfa5592a8393022a716c3f138490588  20260826_research_client_accounts_blitz.rollback.sql
df1fff3c9cb2998a14ee02e549dfd9cc9f8f24f17a08e717274fcc6757f92cbf  20260826_research_client_accounts_blitz.verify-rollback.sql
fbdc0b1f1eb30c7f7edb2ae8f4c4b8e3a189c7229c10f8551f3ab19730f0d8e3  20260826_research_client_accounts_blitz.rehearse.ps1
```

Branch-scoped release-diff audit used the exact Node 20.19.0 runtime. The
reproducible secret scan found zero findings. An added-line PII-shape scan
found zero unexpected emails, SSN shapes, or phone shapes; all four email
addresses are synthetic `example.invalid` fixtures. Imported-name matching was
**SKIPPED** because no approved out-of-repo 109-name input was available; do
not infer a clean name-list result. That name-list run remains a final
frozen-SHA human check, but does not invalidate the isolated migration-harness
result.

Evidence:
docs/research/CLIENT_ACCOUNT_MIGRATION_ATTACK_REHEARSAL_2026-08-27.md
(2026-08-28 executable-harness addendum). STILL NOT READY FOR APPLY. The only
migration-specific reviewer decision left is whether to accept the stricter
A14/V2-7 supersession.

## Still open, deliberately

1. Candidate migration UNAPPLIED (own review + ledger/DAG registration required).
2. Import admin surface production-disabled (RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED).
3. XRR list-by-member read, XEC cart RPC, durable Care source, Stripe portal,
   and a commerce refund-amount mirror for a future EA refund concept — all
   future work; each renders as explicit unknown/unavailable today.

## Next step

Hand the NEW RC SHA to the SAME fresh Codex adversarial reviewer for the third
hostile pass, focused on the seven previously-failed P1s and the four P2s.
Deploy only on 0 P0 / 0 P1 and the founder's explicit GO. Do not deploy
22396613 or b432d7a.
