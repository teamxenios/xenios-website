XENIOS CODEX FLEET DISPATCH - CODEX 8

ROLE: WRITER (advisory artifacts only)
PROMPT FILE: 08_CODEX_FULL_VISION_RELEASE_AUDITOR.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex8-vision-auditor -b codex/full-vision-auditor-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/full-vision-auditor-20260820

[XENIOS CODEX RESUME BASE]
INTEGRATION BRANCH: xenios/launch-integration-20260819
CODEX RESUME SHA: 7b16a2e06dfc227f5bc748b14480c9d072e566de
  (full test suite GREEN on this exact SHA: 659 files / 9,758 tests passed, 0 failures, 2026-08-20)
PRODUCTION SHA: a66434d980c909303d3595382e5df77342fbc127 (LIVE, Release A, deploy dep-da31altg1s2s73f6tep0)
ROLLBACK SHA: 458e7284c12cfbd95bd91371afb88cb8a6201454 (flags OFF first)

CORE LAW: Claude main (claude-fable-desktop) is the SOLE integration, release and
production owner. You never deploy, never apply production migrations, never change
production env or flags, never change live pricing, never send real email, never mark
real payment or shipment, and never edit a lead-owned seam (server/index.ts,
server/research/index.ts, client/src/research/section.tsx,
client/src/research/adminx-section.tsx, migration DAG/ledger, release manifests,
production packet, shared .xenios fleet state). Send the lead exact snippets instead.

NO-DOWNTIME LAW: the Early Access production path is LIVE and must keep working
through every phase. EXPAND -> MIGRATE -> DARK DEPLOY (feature OFF) -> SMOKE LIVE
PATHS -> ENABLE PROGRESSIVELY -> SMOKE NEW -> RECORD ROLLBACK. Never make a
destructive migration the only route forward.

OWNED PATHS (you are the ONE writer here):
docs/research-launch/** audit + dependency-graph + release-matrix artifacts you create (use distinct filenames dated 2026-08-20-codex8); reviews and written findings.

FORBIDDEN PATHS (another writer or the lead owns these):
ALL source code (you are read-heavy until P0 is green); release manifests and the production packet (LEAD-owned); the migration DAG/ledger; any production mutation.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
Read-heavy until P0 is green, exactly as your prompt says. The most valuable things you can produce TODAY:
1. A duplicate-authority sweep. The platform has known duplicate-authority hazards (a dormant competing commission engine; a member-cart vs EA-cart Buy Now target mismatch; M69/M70 load-bearing but unmerged branches; superseded lane branches). Map every place two systems claim the same authority and rank by launch risk.
2. A no-downtime compatibility review of every pending migration candidate (M72-M74 promoted but NOT applied; an M58 service_role hardening candidate; a forthcoming M66-successor quantity band 1..100 from the lead) against EXPAND -> MIGRATE -> ENABLE -> CONTRACT LATER. Flag anything that is not additive/backward-compatible.
3. The current rollback + smoke matrix: production is LIVE at a66434d9 (Release A) with rollback 458e7284 (flags off FIRST). Keep this current as the lead integrates.
4. Disjoint P1/P2 work packages (Buy Now readiness subset; affiliate onboarding/portal/commission/payout) that do not collide with any active writer.
Never create a competing canonical system. Never deploy or mutate production.

CHECKPOINT LAW: every coherent slice and roughly every 15 minutes - save, run focused
tests, commit, push, heartbeat, update task state, refresh an exact-SHA handoff in
.xenios/handoffs/, message dependent lanes in .xenios/messages/, continue. Do not
accumulate thousands of uncommitted lines.

FINISH LAW: when your lane is done - commit, push, hand off the exact SHA, release the
lease, run `node scripts/agentic/xenios-os.mjs next`, and with lead approval take the
next highest-priority unowned full-vision lane. Do not sit idle.

Return the standard checkpoint block (SESSION / TASK / WORKTREE / BRANCH / BASE SHA /
PUSHED SHA / LEASE / COMPLETED / FILES / TESTS / TYPECHECK / BUILD / MIGRATION /
PRODUCTION MUTATED / BLOCKERS / INTEGRATION INSTRUCTIONS / NEXT CODE ACTION).

Your full lane prompt follows verbatim.

================================================================
# CODEX 8 — FULL-VISION CONTINUATION + NO-DOWNTIME RELEASE AUDITOR

Read-heavy until P0 is green.

Responsibilities:
- maintain dependency graph
- identify next unowned lane
- detect duplicate authorities
- review migration compatibility
- validate dark-deploy/feature-flag strategy
- review phase release packets
- keep rollback/smoke matrix current
- prepare P1/P2 work packages that are disjoint from active writers

After P0, claim highest-priority unowned lane with lead approval:
customer order history
affiliate onboarding/dashboard
organization accounts
supplier workspace
notifications
expanded Buy Now
Care
AI/analytics/integrations/reliability

Never deploy or mutate production.
Never create a competing canonical system.
