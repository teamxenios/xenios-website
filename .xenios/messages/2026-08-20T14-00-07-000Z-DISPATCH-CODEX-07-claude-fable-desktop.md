XENIOS CODEX FLEET DISPATCH - CODEX 7

ROLE: WRITER (independent QA)
PROMPT FILE: 07_CODEX_E2E_SECURITY.md
CREATE YOUR WORKTREE:
  git worktree add C:/xenios-wt/codex7-e2e-security -b codex/e2e-security-20260820 7b16a2e06dfc227f5bc748b14480c9d072e566de
BRANCH: codex/e2e-security-20260820

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
e2e/**, browser-test infrastructure, security negative-control test files, mobile viewport proofs. Isolated client fixes ONLY in files no other lane owns (ask the lead first).

FORBIDDEN PATHS (another writer or the lead owns these):
Every lead seam; every file listed as owned by Codex 1/2/4/6 or held dirty by a paused Claude worktree.

LEAD BRIEFING FOR THIS LANE (verified facts - read before you plan):
You are the proof the founder's Definition of Done is real. Compose the FULL journey: /research/early-access -> Xenios Genesis code -> full catalog -> retail prices -> select multiple products -> quantity up to 100 -> optional affiliate code -> contact -> shipping -> agreements -> review -> submit -> XRR reference -> customer email INTENT -> admin email INTENT -> admin queue -> payment workflow -> canonical order -> fulfillment -> tracking/status.
Viewports: 1440, 1366, 768, 430, 390, 375, 360, 320.
ATTACK LIST (classify every result honestly, no cosmetic passes): double password prompt; lost cart or lost ?ref; duplicate submit; price manipulation from the browser; wholesale/cost/margin leakage into ANY customer surface; quantity 101; IDOR across customers; browser-asserted paid=true; proof-of-payment treated as payment; ordering a Care product through the RUO path; fulfillment release while unpaid; duplicate email / duplicate order / duplicate payment; dead routes; mobile overflow and keyboard occlusion.
NEVER send a real email, never mutate production, never hit production with writes. Read-only GET probes of https://xeniostechnology.com are allowed.

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
# CODEX 7 — COMPOSED E2E + MOBILE + SECURITY

Operate mainly as independent QA.

Prove:
one code
-> full catalog
-> retail pricing
-> product
-> quantity 100
-> affiliate code
-> shipping/contact
-> agreements
-> request
-> email intents
-> payment
-> canonical order
-> fulfillment/tracking/status

Viewports:
1440, 1366, 768, 430, 390, 375, 360, 320

Attack:
double password
lost cart/ref
duplicate submit
price manipulation
wholesale leakage
quantity 101
IDOR
browser paid=true
proof=paid
Care product RUO order
unpaid fulfillment
duplicate email/order/payment
dead routes
mobile overflow/keyboard

Classify failures honestly.
Do not edit lead seams without delegation.
