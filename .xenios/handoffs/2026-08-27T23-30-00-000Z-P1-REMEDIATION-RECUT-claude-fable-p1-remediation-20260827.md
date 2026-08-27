# [XENIOS HANDOFF] Client-account P1 remediation RECUT — 2026-08-27

SESSION: claude-fable-p1-remediation-20260827
ROLE: P1 remediation (narrow recut of the FAILED client-account RC)
WORKTREE: C:\Users\sboad\projects\xenios-client-account-p1-remediation-20260827
BRANCH: fix/xenios-client-account-p1-remediation-20260827
OLD FAILED SHA (DO NOT DEPLOY): b432d7a44cf18807762598b1bdf3bef77eebdbd9
NEW RC SHA: the commit that ADDS this handoff (the freeze commit at branch
HEAD — verify against origin; the code-final tree is its parent).
PRODUCTION MUTATED: NO — no deploy, no merge to release branches, no migration
applied anywhere real, no invitation, no email, no real account, 0 products
activated.

## What this recut is

The independent Codex adversarial review failed the frozen integration RC with
11 P1s. Every one is now FIXED with the smallest safe change, or the affected
surface is PRODUCTION-DISABLED so the vulnerable path is unreachable —
truthful disabled state over partial or guessed behavior, throughout. The full
disposition table and the release scope declaration (ENABLED+AUTHORITATIVE /
ENABLED+EXPLICIT-UNKNOWN / PRODUCTION-DISABLED / FUTURE-MIGRATION) live in
docs/research-launch/XENIOS_CLIENT_ACCOUNT_P1_REMEDIATION_2026-08-27.md.

## Verification at this tree (authoritative toolchain: Node 20.19.0 / npm 10.8.2)

- typecheck (tsc --noEmit): PASS
- production build (script/build.mjs — vite client + esbuild server): PASS
- full repository suite: **735 files passed / 4 skipped · 10,703 tests passed /
  43 intentionally skipped · 0 failed** (Node 20.19.0, npm 10.8.2)
- Early Access release-gate e2e (e2e/vitest.config.ts): 53/53 PASS
- route census / release control plane: 399 call sites / 408 routes pin
  UNCHANGED (guard and flag edits wrap registrar calls; no app.<method> site
  moved) — server/release-control-plane.test.ts PASS
- core-site protection incl. seam baselines: PASS (server/index.ts moved twice
  with dated manifest notes: P1-2 guard injection + P1-10 flag gate, then the
  P1-4 completeness wiring; server/research/index.ts comment-only)
- secret scan (scripts/acceptance/scan-release-diff.mjs, whole integration
  diff 6a2df29..HEAD and remediation diff b432d7a..HEAD): 0 findings
- PII scan (same tool, the 109-name out-of-repo list): 0 findings, one PRINTED
  allowance for the partner-principal the founder's directive names
- Hino/public-site smoke (server/research/hino-static-site.test.ts): in-suite PASS

## Browser QA (integrated preview harness, real production bundle)

- Sign-in → returnTo round-trip exact (/research/sign-in?returnTo=… lands back
  on the requested account page after auth).
- Overview: availability priorities + 13-item activation queue render;
  "Documentation pending" / "Join availability list" on pending items; NO
  Buy Now anywhere on the account surface; duplicate landmark id fixed
  (three demand-collection mounts now carry distinct heading ids).
- Orders: incomplete-history note names its unavailable sources (XRR…);
  Unpaid/Paid/Shipped badges from the new vocabulary; "Awaiting payment"
  no longer exists anywhere.
- Membership: access badge and billing badge are SEPARATE; billing "Current"
  from the stored ledger; renewal shows the fixture date only because one is
  recorded — the no-source copy is "No renewal is scheduled in a connected
  billing source".
- Care: the ENROLLED persona renders the full 10-step timeline at Provider
  review (the P1-6 defect made this page structurally blank before); the
  not-enrolled persona renders "Care not started"; no fabricated enrollment.
- Empty account: honest sources note, never the definitive "no orders" claim.
- Paused persona: routed to /research/access-state ("Membership is not
  active"); never reaches account pages or the catalog-priority projection.
- Sign out / re-login: clean both directions.
- Widths 1440 / 1024 / 768 / 430 / 390 / 375 / 360 / 320: ZERO horizontal
  overflow on overview, orders, care, subscription, documents, support;
  form inputs ≥16px at 320 (support form 17px).

## Still open, deliberately (NOT blockers — disabled or declared)

1. Candidate SQL reworked + 18-attack rehearsed but NOT READY FOR APPLY
   (its own review + ledger/DAG registration still required).
2. Import admin surface dark until RESEARCH_CLIENT_IMPORT_ADMIN_ENABLED review.
3. XRR list-by-member read, XEC cart RPC, durable Care source, Stripe portal —
   future work; every one renders as explicit unknown/unavailable today.

## Next step

Hand the NEW RC SHA to the SAME fresh Codex adversarial reviewer to rerun all
20 gates with focus on the 11 previously-failed P1s. Deploy only on a clean
re-review and the founder's explicit GO. Do not deploy b432d7a under any
circumstances.
