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
aligns the check constraint with the trigger's one state machine. 12-attack v2
battery all-refused; v1 18/18 regression; rollback + reapply rehearsed on
disposable PG 15. Evidence:
docs/research/CLIENT_ACCOUNT_MIGRATION_ATTACK_REHEARSAL_2026-08-27.md
(round-3 addendum). STILL NOT READY FOR APPLY.

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
